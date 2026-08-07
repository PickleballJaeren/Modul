// ════════════════════════════════════════════════════════
// ratingLists.js — Ratinglister-skjermen
// Åpner alltid på Allround. Kategoriknappene bytter hvilken liste
// som vises, uten å navigere bort fra skjermen.
// ════════════════════════════════════════════════════════

import {
  db, SAM, collection, query, where, orderBy, limit, getDocs, doc, getDoc, setDoc,
  oktSamling,
} from './firebase.js';
import { lagBatchHjelper } from './batch-helpers.js';
import { escHtml, naviger, visMelding } from './ui.js';
import { hentSpillerKart, hentRatingService, hentAktivKlubbId } from './state.js';
import { getErAdmin } from './admin.js';
import { ALLE_KATEGORIER, ALLE_KONKURRANSER, RATINGKATEGORI_NAVN, STARTRATING, KONKURRANSE_NAVN } from './domain-constants.js';
import {
  hentLeaderboard, oppdaterLeaderboardRad, fjernFraLeaderboard,
} from './domain-repository-leaderboardRepository.js';
import { lagSessionCache } from './cache-helpers.js';
import { nullstillArkivCache } from './screens-archive.js';

const KATEGORI_IKON = { soft_play: '🎯', power_play: '⚡', defense: '🛡️', singles: '🙋', allround: '🏆' };
const KATEGORI_FARGE = {
  soft_play: 'var(--green2)', power_play: 'var(--orange)', defense: 'var(--accent2)',
  singles: 'var(--yellow)', allround: 'var(--white)',
};
const KATEGORI_FARGE_HEX = {
  allround: '#e5e7eb', soft_play: '#22c55e', power_play: '#ea580c', defense: '#3b82f6', singles: '#eab308',
};

const FANER = [{ id: 'allround', navn: 'Allround' }, ...ALLE_KATEGORIER.map(k => ({ id: k, navn: RATINGKATEGORI_NAVN[k] }))];

/**
 * Regner ut "pene" rutenett-verdier for y-aksen (f.eks. 1000, 1020, 1040...
 * i stedet for vilkårlige tall), på samme måte som i referansebildet.
 * Sikter mot ca. 6-7 linjer uansett hvor stort verdiområdet er.
 */
function beregnGridVerdier(minV, maxV) {
  const range = maxV - minV || 1;
  const raaSteg = range / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raaSteg)));
  const normalisert = raaSteg / magnitude;
  const steg = (normalisert < 1.5 ? 1 : normalisert < 3 ? 2 : normalisert < 7 ? 5 : 10) * magnitude;

  const verdier = [];
  const start = Math.ceil(minV / steg) * steg;
  for (let v = start; v <= maxV; v += steg) verdier.push(Math.round(v));
  return verdier;
}

let aktivFane = 'allround';

// ════════════════════════════════════════════════════════
// CACHE — leaderboards/{klubbId}_{fane} er allerede ett lite, billig
// dokumentoppslag (se tegnListe() under), så cache her er ikke lenger
// et spørsmål om å unngå en dyr full samlings-scan (det problemet er
// løst av selve leaderboard-strukturen) -- men det er fortsatt gratis
// å unngå unødvendige nettverkskall ved rask faneklikking. Speilet til
// sessionStorage (se cache-helpers.js) slik at det også overlever en
// sideoppdatering, med en romslig TTL siden rating uansett kun endres
// når noen fullfører en økt eller redigerer manuelt -- begge steder
// invaliderer vi den aktuelle nøkkelen aktivt med det samme, se
// nullstillRatingCacheFor()/nullstillRatingCache() under.
// ════════════════════════════════════════════════════════
const RATING_TTL_MS = 20 * 60 * 1000;
const _ratingCache = lagSessionCache('rating', RATING_TTL_MS);

function ratingCacheKey(fane) {
  return `${hentAktivKlubbId() ?? ''}:${fane}`;
}

/** Forkaster cachet data for ÉN klubb+fane -- kalles etter en skriveoperasjon som kun rammer den fanen. */
function nullstillRatingCacheFor(fane) {
  _ratingCache.slett(ratingCacheKey(fane));
}

/** Forkaster ALL cachet ratingdata (alle faner) -- brukes ved handlinger som kan ramme flere faner (sletting/administrasjon). */
function nullstillRatingCache() {
  _ratingCache.tomAlt();
}

export async function visRatinglister() {
  naviger('ratinglister');
  oppdaterAdminSynlighetRatingliste(); // knapper + rader (radene tegnes på nytt like under)
  await hentSpillerKart();
  tegnFaner();
  await tegnListe();
}

/**
 * Vis/skjul Administrasjon-knappen basert på admin-status, og tegn
 * radlisten på nytt (rediger-rating og slett-spiller-knappene per rad
 * avgjøres også der, se tegnListe()). Kalles ved åpning av skjermen OG
 * hver gang admin-status endrer seg mens skjermen allerede vises (se
 * oppdaterAdminUI() i app.js).
 */
export function oppdaterAdminSynlighetRatingliste() {
  const wrapper = document.getElementById('ratinglister-admin-wrapper');
  if (wrapper) wrapper.style.display = getErAdmin() ? 'block' : 'none';
  if (!getErAdmin()) {
    const boks = document.getElementById('admin-seksjon-boks');
    if (boks) boks.style.display = 'none';
  }
  if (document.getElementById('rating-liste-innhold')) tegnListe();
}

function tegnFaner() {
  const container = document.getElementById('ratinglister-innhold');
  container.innerHTML = `
    <div class="rating-faner">
      ${FANER.map(f => `
        <button class="rating-fane ${f.id === aktivFane ? 'aktiv' : ''} kat-tekst-${f.id}"
                onclick="window.byttRatingFane('${f.id}')">${escHtml(f.navn)}</button>
      `).join('')}
    </div>
    <div id="rating-liste-innhold" class="kort"><div class="laster"><span class="laster-snurr"></span>Laster…</div></div>
  `;
  document.getElementById('ratinglister-sub').textContent = FANER.find(f => f.id === aktivFane)?.navn ?? '';
}

export async function byttRatingFane(faneId) {
  aktivFane = faneId;
  tegnFaner();
  await tegnListe();
}
window.byttRatingFane = byttRatingFane;

async function tegnListe(tvingOppdatering = false) {
  const listeContainer = document.getElementById('rating-liste-innhold');
  const spillerKart = await hentSpillerKart(); // Map<spillerId, navn>, avgrenset til aktiv klubb

  const cacheKey = ratingCacheKey(aktivFane);
  const cachetRader = !tvingOppdatering ? _ratingCache.hent(cacheKey) : null;
  if (cachetRader) {
    tegnRader(listeContainer, cachetRader, spillerKart);
    return;
  }

  // Leaderboard-dokumentet (leaderboards/{klubbId}_{fane}, se
  // domain-repository-leaderboardRepository.js) er allerede sortert og
  // kappet ved 50 -- ÉTT dokumentoppslag i stedet for å scanne hele
  // playerCategoryRatings/playerAllround (alle klubber, alle spillere).
  // Filtreringen mot spillerKart under er nå kun et sikkerhetsnett (bør
  // normalt aldri fjerne noen, siden leaderboardet vedlikeholdes av
  // samme skriving som selve rating-verdien) -- IKKE den bærende
  // filtreringsmekanismen slik det var med full samlings-lesing.
  let rader;
  try {
    const leaderboardRader = await hentLeaderboard(hentAktivKlubbId(), aktivFane);
    rader = leaderboardRader.filter(r => spillerKart.has(r.spillerId));
  } catch (e) {
    console.error('[ratingLists] Kunne ikke hente liste:', e);
    listeContainer.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente ratinglisten</div>';
    return;
  }

  _ratingCache.sett(cacheKey, rader);
  tegnRader(listeContainer, rader, spillerKart);
}

/** Selve HTML-opptegningen -- skilt ut fra tegnListe() slik at et cache-treff kan tegne uten nettverkskall. */
function tegnRader(listeContainer, rader, spillerKart) {
  if (rader.length === 0) {
    listeContainer.innerHTML = '<div class="tom-tilstand-liten">Ingen ratinger registrert ennå</div>';
    return;
  }

  const erAdmin = getErAdmin();
  listeContainer.innerHTML = rader.map((r, i) => `
    <div class="rating-rad">
      <span class="rating-plass">${i + 1}</span>
      <span class="rating-navn" style="cursor:pointer" onclick="window.apneSpillerprofil('${r.spillerId}')">${escHtml(spillerKart.get(r.spillerId) ?? r.spillerId)}</span>
      <span class="rating-verdi"${erAdmin && aktivFane !== 'allround' ? ` style="cursor:pointer" onclick="window.redigerRating('${r.spillerId}','${aktivFane}',${r.verdi})" title="Trykk for å redigere"` : ''}>${r.verdi}</span>
      ${erAdmin ? `<button class="rating-slett-btn" onclick="window.slettSpillerBekreft('${r.spillerId}')" title="Slett spiller" aria-label="Slett spiller">🗑</button>` : ''}
    </div>
  `).join('');
}

/**
 * Bygger en jevn kurve (SVG path) gjennom et sett punkter, i stedet for
 * rette linjesegmenter. Catmull-Rom konvertert til kubiske Bezier-kurver
 * -- kurven går NØYAKTIG gjennom hvert punkt (i motsetning til f.eks.
 * en enkel bezier-glatting), så verdien på hvert punkt forblir korrekt
 * avlesbar, den buer bare mellom dem i stedet for å knekke.
 */
function byggGlattPath(punkter) {
  if (punkter.length < 2) return '';
  if (punkter.length === 2) {
    return `M ${punkter[0].x.toFixed(1)},${punkter[0].y.toFixed(1)} L ${punkter[1].x.toFixed(1)},${punkter[1].y.toFixed(1)}`;
  }

  let d = `M ${punkter[0].x.toFixed(1)},${punkter[0].y.toFixed(1)}`;
  for (let i = 0; i < punkter.length - 1; i++) {
    const p0 = punkter[i - 1] ?? punkter[i];
    const p1 = punkter[i];
    const p2 = punkter[i + 1];
    const p3 = punkter[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Lineær interpolasjon av elo-verdi ved en gitt x-posisjon, gitt en
 * kronologisk sortert punktliste [{x, elo}]. Returnerer null hvis
 * punktlisten ikke har rukket så langt (siste punkt ligger før x) --
 * det tolkes som at kategorien/linjen ikke har "nådd eller passert" x.
 */
function interpolerVedX(punkter, x) {
  if (!punkter.length) return null;
  const siste = punkter[punkter.length - 1];
  if (siste.x < x) return null;
  if (punkter[0].x > x) return null;
  for (let i = 0; i < punkter.length - 1; i++) {
    const a = punkter[i], b = punkter[i + 1];
    if (x >= a.x && x <= b.x) {
      if (b.x === a.x) return b.elo;
      const t = (x - a.x) / (b.x - a.x);
      return a.elo + t * (b.elo - a.elo);
    }
  }
  return siste.elo;
}

/**
 * Regner ut hvor på x-aksen hver treningsøkt skal plottes, og avleder
 * Allround-linjen fra kategori-historikkene (Allround lagres IKKE lenger
 * som egen historikk i Firestore -- kun som gjeldende tall, se
 * apneSpillerprofil()).
 *
 * X-AKSEN: delt "vannmerke" på tvers av alle kategorier, IKKE tid og
 * IKKE hver kategoris egen løpende opptelling. Regelen, for hver
 * hendelse i kronologisk rekkefølge (uansett kategori):
 *   - Hvis kategorien IKKE allerede har et punkt på gjeldende vannmerke
 *     -> plasseres DER (tar igjen de andre kategoriene).
 *   - Hvis kategorien ALLEREDE har et punkt der (kolliderer med sitt
 *     eget forrige punkt) -> vannmerket skyves ett hakk, og hendelsen
 *     plasseres på det nye.
 * Dette gjør at en kategori som ikke er spilt på en stund "tar igjen"
 * lederen i stedet for å starte på nytt ved 1, og at to kategorier som
 * spilles rett etter hverandre aldri havner på nøyaktig samme punkt.
 *
 * ALLROUND: får et NYTT punkt kun der to eller flere kategorier faktisk
 * har et EKTE punkt på samme x (der en kategori tar igjen en annen) --
 * ikke etter hver eneste økt. Verdien er snittet av ALLE kategorier som
 * har nådd eller passert x, der kategorier som bare passerer gjennom
 * (har et senere punkt lenger ute) bidrar med en interpolert verdi.
 *
 * RULLERENDE VINDU: aldri mer enn 10 punkter vises på x-aksen -- eldre
 * historikk ruller ut til venstre, med interpolerte "startpunkt" ved
 * vinduets venstre kant slik at linjene forblir sammenhengende.
 */
function beregnGrafmodell(historikkPerKategori) {
  const kategorier = Object.keys(historikkPerKategori);
  const hendelser = [];
  kategorier.forEach(kategori => {
    (historikkPerKategori[kategori] || []).forEach(h => {
      hendelser.push({ kategori, elo: h.eloEtter, tid: new Date(h.dato).getTime() });
    });
  });
  hendelser.sort((a, b) => a.tid - b.tid);

  if (hendelser.length === 0) {
    return { punkterPerKategori: {}, allroundPunkter: [], domeneMaks: 0 };
  }

  // Steg 1: delt vannmerke
  let vannmerke = 0;
  const sistePos = {};
  const raPunkterPerKategori = {};
  kategorier.forEach(k => { raPunkterPerKategori[k] = []; });

  hendelser.forEach(h => {
    const forrige = sistePos[h.kategori] ?? 0;
    if (forrige === vannmerke) vannmerke += 1;
    const pos = vannmerke;
    sistePos[h.kategori] = pos;
    raPunkterPerKategori[h.kategori].push({ x: pos, elo: h.elo });
  });

  const medStart = {};
  kategorier.forEach(k => { medStart[k] = [{ x: 0, elo: STARTRATING }, ...raPunkterPerKategori[k]]; });

  // Steg 2: Allround kun ved konvergens (>=2 kategorier med EKTE punkt på samme x)
  const eksaktePosisjoner = {};
  kategorier.forEach(k => {
    raPunkterPerKategori[k].forEach(p => {
      eksaktePosisjoner[p.x] = (eksaktePosisjoner[p.x] ?? 0) + 1;
    });
  });

  const allroundRaa = [{ x: 0, elo: STARTRATING }];
  Object.keys(eksaktePosisjoner)
    .map(Number)
    .filter(x => eksaktePosisjoner[x] >= 2)
    .sort((a, b) => a - b)
    .forEach(x => {
      const verdier = kategorier.map(k => interpolerVedX(medStart[k], x)).filter(v => v !== null);
      if (verdier.length) allroundRaa.push({ x, elo: verdier.reduce((s, v) => s + v, 0) / verdier.length });
    });

  // Steg 3: rullerende vindu -- maks 10 punkter på x-aksen
  const domeneMaks = Math.min(vannmerke, 10);
  const cutoff = Math.max(0, vannmerke - 10);

  function tilVindu(punkter) {
    if (cutoff === 0) return punkter;
    const synligStart = interpolerVedX(punkter, cutoff);
    const resten = punkter.filter(p => p.x > cutoff).map(p => ({ x: p.x - cutoff, elo: p.elo }));
    return synligStart === null ? resten : [{ x: 0, elo: synligStart }, ...resten];
  }

  const punkterPerKategori = {};
  kategorier.forEach(k => {
    const vindu = tilVindu(medStart[k]);
    if (vindu.length) punkterPerKategori[k] = vindu;
  });
  const allroundPunkter = tilVindu(allroundRaa);

  return { punkterPerKategori, allroundPunkter, domeneMaks };
}

function byggRatingSvg(historikkPerKategori) {
  const { punkterPerKategori, allroundPunkter, domeneMaks } = beregnGrafmodell(historikkPerKategori);

  if (domeneMaks === 0) {
    return '<div class="tom-tilstand-liten">Ingen historikk ennå</div>';
  }

  const alleLinjer = { ...punkterPerKategori, allround: allroundPunkter };
  const alleVerdier = Object.values(alleLinjer).flat().map(p => p.elo);
  const minV = Math.min(...alleVerdier, STARTRATING) - 20;
  const maxV = Math.max(...alleVerdier, STARTRATING) + 20;

  const bredde = 440, hoyde = 240, padL = 58, padB = 30, padT = 10, padR = 10;
  const skalaX = x => padL + (domeneMaks === 0 ? 0 : (x / domeneMaks) * (bredde - padL - padR));
  const skalaY = v => padT + (1 - (v - minV) / ((maxV - minV) || 1)) * (hoyde - padT - padB);

  let linjer = '';
  Object.entries(alleLinjer).forEach(([kategori, punkter]) => {
    if (punkter.length < 2) return;
    const skjermPunkter = punkter.map(p => ({ x: skalaX(p.x), y: skalaY(p.elo) }));
    const path = byggGlattPath(skjermPunkter);
    linjer += `<path d="${path}" fill="none" stroke="${KATEGORI_FARGE_HEX[kategori]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    skjermPunkter.forEach(p => {
      linjer += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${KATEGORI_FARGE_HEX[kategori]}" />`;
    });
  });

  const gridVerdier = beregnGridVerdier(minV, maxV);
  const rutenettHtml = gridVerdier.map(v => `
    <text x="4" y="${(skalaY(v) + 4).toFixed(1)}" font-size="15" fill="#64748b">${v.toLocaleString('no-NO')}</text>
  `).join('');

  const xAkseHtml = Array.from({ length: domeneMaks + 1 }, (_, x) => `
    <text x="${skalaX(x).toFixed(1)}" y="${hoyde - 6}" font-size="13" fill="#64748b" text-anchor="middle">${x}</text>
  `).join('');

  return `
    <svg viewBox="0 0 ${bredde} ${hoyde}" style="width:100%;height:${hoyde}px;display:block">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${hoyde - padB}" stroke="rgba(255,255,255,0.13)" />
      <line x1="${padL}" y1="${hoyde - padB}" x2="${bredde - padR}" y2="${hoyde - padB}" stroke="rgba(255,255,255,0.13)" />
      ${rutenettHtml}
      ${xAkseHtml}
      ${linjer}
    </svg>
  `;
}

async function hentHistorikkForSpiller(spillerId) {
  const historikkPerKategori = {};
  await Promise.all(ALLE_KATEGORIER.map(async kategori => {
    const snap = await getDoc(doc(db, SAM.PLAYER_CATEGORY_RATINGS, `${spillerId}_${kategori}`));
    historikkPerKategori[kategori] = snap.exists() ? (snap.data().historikk ?? []) : [];
  }));

  // NB: Allround hentes IKKE lenger her som egen historikk -- den
  // avledes nå av beregnGrafmodell() fra kategori-historikkene (se
  // konvergensregelen der). Den lagrede "gjeldende allround"-verdien
  // (playerAllround.allround) brukes fortsatt, men kun til tall-
  // visningen øverst i profilen -- hentes direkte i apneSpillerprofil().

  // Spør klubbens EGEN økt-subcollection (klubber/{klubbId}/sessions,
  // se firebase.js/domain-repository-firestoreRatingRepository.js) med
  // where('spillerIder','array-contains', spillerId) -- Firestore
  // returnerer da KUN øktene spilleren faktisk deltok i, i stedet for at
  // vi må lese et bredt utvalg (tidligere: opptil 200 dokumenter, alle
  // klubber) og lete etter treff i klienten. Ingen sammensatt indeks
  // nødvendig siden det kun er ett array-contains-filter uten orderBy.
  let okter = [];
  try {
    const oktSnap = await getDocs(query(oktSamling(hentAktivKlubbId()), where('spillerIder', 'array-contains', spillerId)));
    okter = oktSnap.docs
      .map(d => {
        const okt = d.data();
        const rad = (okt.resultatPerSpiller ?? []).find(r => r.spillerId === spillerId);
        return rad ? { okt, rad } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.okt.dato?.toMillis?.() ?? 0) - (a.okt.dato?.toMillis?.() ?? 0))
      .slice(0, 10);
  } catch (e) {
    console.error('[ratingLists] Kunne ikke hente øktehistorikk:', e);
  }

  return { historikkPerKategori, okter };
}

window.apneSpillerprofil = async function (spillerId) {
  const spillerKart = await hentSpillerKart();
  const navn = spillerKart.get(spillerId) ?? spillerId;
  document.getElementById('spillerprofil-navn').textContent = navn;
  document.getElementById('spillerprofil-avatar').textContent = navn.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  document.getElementById('spillerprofil-allround').textContent = '…';
  document.getElementById('spillerprofil-legende').innerHTML = FANER.map(f => `
    <span style="display:flex;align-items:center;gap:6px">
      <span style="width:9px;height:9px;border-radius:2px;background:${KATEGORI_FARGE_HEX[f.id]}"></span>${escHtml(f.navn)}
    </span>
  `).join('');
  document.getElementById('spillerprofil-graf').innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter historikk…</div>';
  document.getElementById('spillerprofil-historikk').innerHTML = '';
  document.getElementById('modal-spillerprofil').style.display = 'flex';

  try {
    const allroundSnap = await getDoc(doc(db, SAM.PLAYER_ALLROUND, spillerId));
    document.getElementById('spillerprofil-allround').textContent = allroundSnap.exists() ? allroundSnap.data().allround : STARTRATING;

    const { historikkPerKategori, okter } = await hentHistorikkForSpiller(spillerId);
    document.getElementById('spillerprofil-graf').innerHTML = byggRatingSvg(historikkPerKategori);

    document.getElementById('spillerprofil-historikk').innerHTML = okter.length
      ? okter.map(({ okt, rad }, i) => {
          const dato = okt.dato?.toDate ? okt.dato.toDate() : new Date();
          const datoTekst = dato.toLocaleDateString('no-NO', { day: 'numeric', month: 'long' });
          const antallBaner = Math.ceil((okt.resultatPerSpiller?.length ?? 2) / 2);
          const delta = rad.delta ?? 0;
          const deltaKlasse = delta > 0 ? 'beveg-opp' : delta < 0 ? 'beveg-ned' : 'beveg-lik';
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${i < okter.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
              <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:500">${escHtml(KONKURRANSE_NAVN[okt.konkurranse] ?? okt.konkurranse)}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">${datoTekst} · Bane ${rad.sluttBane ?? '–'} av ${antallBaner}</div>
              </div>
              <span class="beveg-badge ${deltaKlasse}">${delta > 0 ? '+' : ''}${delta}</span>
            </div>
          `;
        }).join('')
      : '<div class="tom-tilstand-liten">Ingen økter registrert ennå</div>';
  } catch (e) {
    console.error('[spillerprofil] Kunne ikke hente data:', e);
    document.getElementById('spillerprofil-graf').innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente historikk</div>';
  }
};

window.lukkSpillerprofil = function () {
  document.getElementById('modal-spillerprofil').style.display = 'none';
};

// ════════════════════════════════════════════════════════
// SAMMENLIGN SPILLERE — velg to spillere og sammenlign rating i
// hver kategori + allround, med en diverging bar per kategori.
// ════════════════════════════════════════════════════════
let sammenlignSpillerKart = new Map(); // id -> navn, satt ved åpning av seksjonen

window.visSammenlignSeksjon = async function () {
  const boks = document.getElementById('sammenlign-boks');
  if (!boks) return;

  if (boks.style.display !== 'none') {
    boks.style.display = 'none';
    return;
  }

  sammenlignSpillerKart = await hentSpillerKart();
  const alternativer = [...sammenlignSpillerKart.entries()].sort((a, b) => a[1].localeCompare(b[1], 'no'));

  if (alternativer.length < 2) {
    visMelding('Trenger minst 2 spillere for å sammenligne', 'advarsel');
    return;
  }

  const opsjonerHtml = alternativer.map(([id, navn]) => `<option value="${id}">${escHtml(navn)}</option>`).join('');
  const selectA = document.getElementById('sammenlign-a');
  const selectB = document.getElementById('sammenlign-b');
  selectA.innerHTML = opsjonerHtml;
  selectB.innerHTML = opsjonerHtml;
  selectB.value = alternativer[1][0];

  boks.style.display = 'block';
  await window.tegnSammenligning();
};

/** Henter en spillers rating i alle kategorier + allround, med STARTRATING som fallback. */
async function hentRatingerForSpiller(spillerId) {
  const kategoriRatinger = {};
  ALLE_KATEGORIER.forEach(k => { kategoriRatinger[k] = STARTRATING; });

  const snap = await getDocs(query(collection(db, SAM.PLAYER_CATEGORY_RATINGS), where('spillerId', '==', spillerId)));
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.kategori) kategoriRatinger[data.kategori] = data.elo ?? STARTRATING;
  });

  let allround = STARTRATING;
  try {
    const allroundSnap = await getDoc(doc(db, SAM.PLAYER_ALLROUND, spillerId));
    if (allroundSnap.exists()) allround = allroundSnap.data().allround ?? STARTRATING;
  } catch (e) {
    console.warn('[sammenlign] Kunne ikke hente allround:', e?.message);
  }

  return { ...kategoriRatinger, allround };
}

window.tegnSammenligning = async function () {
  const idA = document.getElementById('sammenlign-a')?.value;
  const idB = document.getElementById('sammenlign-b')?.value;
  const container = document.getElementById('sammenlign-rader');
  if (!idA || !idB || !container) return;

  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter ratinger…</div>';

  const [ratingA, ratingB] = await Promise.all([hentRatingerForSpiller(idA), hentRatingerForSpiller(idB)]);
  const navnA = sammenlignSpillerKart.get(idA) ?? idA;
  const navnB = sammenlignSpillerKart.get(idB) ?? idB;

  const rekkefolge = [...ALLE_KATEGORIER, 'allround'];
  container.innerHTML = rekkefolge.map(kategori => {
    const va = ratingA[kategori];
    const vb = ratingB[kategori];
    const total = (va + vb) || 1;
    const pctA = Math.round((va / total) * 100);
    const diff = va - vb;
    const diffTekst = diff === 0
      ? 'Likt'
      : diff > 0
        ? `${escHtml(navnA.split(' ')[0])} +${diff}`
        : `${escHtml(navnB.split(' ')[0])} +${Math.abs(diff)}`;
    const navnKategori = kategori === 'allround' ? 'Allround' : RATINGKATEGORI_NAVN[kategori];

    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:${diff > 0 ? 'var(--white)' : 'var(--muted2)'}">${va}</span>
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted2)">
            <span style="font-size:14px">${KATEGORI_IKON[kategori]}</span>${escHtml(navnKategori)}
          </span>
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:${diff < 0 ? 'var(--white)' : 'var(--muted2)'}">${vb}</span>
        </div>
        <div style="position:relative;height:8px;border-radius:6px;overflow:hidden;background:var(--border2);display:flex">
          <div style="width:${pctA}%;background:${KATEGORI_FARGE[kategori]};opacity:.9"></div>
          <div style="width:${100 - pctA}%;background:rgba(255,255,255,0.18)"></div>
        </div>
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-top:4px">${diffTekst}</div>
      </div>
    `;
  }).join('');
};

document.addEventListener('sl-naviger', e => {
  if (e.detail?.skjerm !== 'ratinglister') {
    const boks = document.getElementById('sammenlign-boks');
    if (boks) boks.style.display = 'none';
    const profilModal = document.getElementById('modal-spillerprofil');
    if (profilModal) profilModal.style.display = 'none';
  }
});

// ════════════════════════════════════════════════════════
// ADMINISTRASJON — slett all rating / arkiv for aktiv klubb
// ════════════════════════════════════════════════════════
// KLUBB-AVGRENSNING — delt hjelper, brukt av både visningen (tegnListe()
// over) og administrasjons-slettingen under.
//
// playerCategoryRatings/playerCompetitionProgress/playerAllround lagres
// fortsatt ikke med klubbId direkte i Firestore (se KVOTE.md -- kun
// leaderboards og sessions ble omstrukturert i denne omgangen);
// avgrensningen til "aktiv klubb" for DISSE skjer derfor ved å slå opp
// hvilke spillerIder som tilhører klubben (samme players-oppslag som
// resten av appen bruker). Brukes av slettAllRatingForKlubb() under.
// ════════════════════════════════════════════════════════
export async function hentKlubbSpillerIder() {
  const kart = await hentSpillerKart(); // Map<spillerId, navn>, filtrert på aktiv klubb
  return new Set(kart.keys());
}

/**
 * Generisk bekreftelsesmodal, gjenbrukt av bl.a. "Avbryt økt"
 * (screens-activeSession.js) i tillegg til slettehandlingene under.
 */
export function apneSlettBekreft(tittel, tekst, handling, suksessTekst = 'Slettet') {
  document.getElementById('slett-bekreft-tittel').textContent = tittel;
  document.getElementById('slett-bekreft-tekst').textContent = tekst;
  const knapp = document.getElementById('slett-bekreft-knapp');
  knapp.onclick = async () => {
    knapp.disabled = true;
    knapp.textContent = 'Sletter…';
    try {
      await handling();
      lukkSlettBekreft();
      visMelding(suksessTekst);
      // Om vi nettopp slettet ratingen som vises, tegn listen på nytt tom
      // -- men kun dersom ratinglister-skjermen faktisk er den som er åpen.
      // tvingOppdatering=true: forbi cachen, ellers ville admin sett den
      // slettede spilleren stå igjen i opptil RATING_TTL_MS til.
      nullstillRatingCache();
      if (document.getElementById('rating-liste-innhold')) await tegnListe(true);
    } catch (e) {
      console.error('[admin] Handlingen feilet:', e);
      visMelding('Noe gikk galt', 'feil');
    } finally {
      knapp.disabled = false;
      knapp.textContent = 'Ja, slett';
    }
  };
  document.getElementById('modal-slett-bekreft').style.display = 'flex';
}
window.lukkSlettBekreft = function () {
  document.getElementById('modal-slett-bekreft').style.display = 'none';
};

async function slettAllRatingForKlubb() {
  // MERK: playerCategoryRatings/playerCompetitionProgress/playerAllround
  // har fortsatt ikke klubbId-felt (kun leaderboards/sessions ble
  // omstrukturert i denne omgangen, se KVOTE.md), så disse tre må
  // fremdeles leses i sin helhet og filtreres på spillerIder. Sjeldent
  // brukt admin-handling -- lavere prioritet enn de vanlige lese-stiene.
  const klubbId = hentAktivKlubbId();
  const klubbSpillerIder = await hentKlubbSpillerIder();
  const bh = lagBatchHjelper(db);

  for (const samling of [SAM.PLAYER_CATEGORY_RATINGS, SAM.PLAYER_COMPETITION_PROGRESS, SAM.PLAYER_ALLROUND]) {
    const snap = await getDocs(collection(db, samling));
    for (const d of snap.docs) {
      if (klubbSpillerIder.has(d.data().spillerId)) await bh.slett(d.ref);
    }
  }
  // Leaderboardene ER klubb-scopet (id: {klubbId}_{fane}) -- trivielt å
  // slette direkte, ingen filtrering nødvendig.
  for (const fane of ['allround', ...ALLE_KATEGORIER]) {
    await bh.slett(doc(db, SAM.LEADERBOARDS, `${klubbId}_${fane}`));
  }
  await bh.kommit();
  nullstillRatingCache();
}

async function slettArkivForKlubb() {
  // Sessions ligger nå i klubbens EGEN subcollection (klubber/{klubbId}/
  // sessions, se firebase.js) -- trivielt å slette direkte, i motsetning
  // til tidligere da hele den flate SAM.SESSIONS-samlingen (alle klubber)
  // måtte leses og filtreres på klientsiden for å finne klubbens egne.
  const klubbId = hentAktivKlubbId();
  const bh = lagBatchHjelper(db);
  const snap = await getDocs(oktSamling(klubbId));
  for (const d of snap.docs) await bh.slett(d.ref);
  await bh.kommit();
  nullstillArkivCache();
}

window.visAdminSeksjon = function () {
  window.krevAdmin('Administrasjon', 'Kun admin har tilgang til disse handlingene.', () => {
    const boks = document.getElementById('admin-seksjon-boks');
    if (boks) boks.style.display = 'block';
    const navn = document.getElementById('admin-seksjon-klubbnavn');
    if (navn) navn.textContent = window.hentAktivKlubbNavn?.() ?? 'klubben';
  });
};

window.slettRatingBekreft = function () {
  apneSlettBekreft(
    'Slett all rating?',
    `Sletter permanent alle elo-ratinger, allround-verdier og fremgangsstatus for spillerne i ${window.hentAktivKlubbNavn?.() ?? 'klubben'}. Dette kan ikke angres.`,
    slettAllRatingForKlubb,
  );
};

window.slettArkivBekreft = function () {
  apneSlettBekreft(
    'Slett arkiv?',
    `Sletter permanent alle arkiverte økter for ${window.hentAktivKlubbNavn?.() ?? 'klubben'}. Dette kan ikke angres.`,
    slettArkivForKlubb,
  );
};

// ════════════════════════════════════════════════════════
// REDIGER RATING — trykk rating-tallet i en kategoriliste (ikke
// Allround, som er utledet og ikke direkte redigerbart) for å sette
// det manuelt. Legger IKKE til et historikk-punkt -- en manuell
// justering er ikke en trening, og ville gitt et misvisende punkt i
// grafens vannmerke-modell (se byggRatingSvg()) om den gjorde det.
// Allround regnes om etter endringen, via samme oppdaterAllround()
// som brukes etter en vanlig økt.
// ════════════════════════════════════════════════════════
window.redigerRating = function (spillerId, kategori, gjeldendeVerdi) {
  if (kategori === 'allround') return;
  window.krevAdmin('Rediger rating', 'Bekreft med PIN for å endre rating manuelt.', () => {
    const svar = prompt(`Ny rating i ${RATINGKATEGORI_NAVN[kategori] ?? kategori}:`, String(gjeldendeVerdi));
    if (svar === null) return; // avbrutt
    const nyVerdi = Math.round(Number(svar));
    if (!Number.isFinite(nyVerdi)) {
      visMelding('Ugyldig tall', 'feil');
      return;
    }
    lagreRedigertRating(spillerId, kategori, nyVerdi);
  });
};

async function lagreRedigertRating(spillerId, kategori, nyVerdi) {
  const klubbId = hentAktivKlubbId();
  try {
    await setDoc(
      doc(db, SAM.PLAYER_CATEGORY_RATINGS, `${spillerId}_${kategori}`),
      { spillerId, kategori, elo: nyVerdi },
      { merge: true },
    );
    // Hold kategori-leaderboardet konsistent med den nye verdien -- denne
    // skrivingen går IKKE via firestoreRatingRepository.js sin
    // lagreOktResultat() (som ellers vedlikeholder leaderboardet), siden
    // dette er en enkeltstående admin-redigering, ikke en fullført økt.
    await oppdaterLeaderboardRad(klubbId, kategori, spillerId, nyVerdi);
    // Hold Allround konsistent med den nye verdien -- samme funksjon som
    // kjøres etter en vanlig fullført økt (oppdaterer også
    // 'allround'-leaderboardet).
    await hentRatingService()?.oppdaterAllround(spillerId, klubbId);
    visMelding('Rating oppdatert');
    nullstillRatingCacheFor(kategori);
    nullstillRatingCacheFor('allround');
    await tegnListe(true);
  } catch (e) {
    console.error('[ratingLists] Kunne ikke oppdatere rating:', e);
    visMelding('Noe gikk galt', 'feil');
  }
}

// ════════════════════════════════════════════════════════
// SLETT SPILLER — fjerner spilleren og all rating/fremgang permanent.
// Historiske økter i arkivet ENDRES IKKE (de er et faktisk hendelses-
// register, se resonnementet i domain-repository-firestoreRatingRepository.js),
// kun spillerens nåværende profil/rating fjernes.
// ════════════════════════════════════════════════════════
async function slettSpillerData(spillerId) {
  const klubbId = hentAktivKlubbId();
  const bh = lagBatchHjelper(db);

  await bh.slett(doc(db, SAM.SPILLERE, spillerId));
  for (const kategori of ALLE_KATEGORIER) {
    await bh.slett(doc(db, SAM.PLAYER_CATEGORY_RATINGS, `${spillerId}_${kategori}`));
  }
  for (const konkurranse of ALLE_KONKURRANSER) {
    await bh.slett(doc(db, SAM.PLAYER_COMPETITION_PROGRESS, `${spillerId}_${konkurranse}`));
  }
  await bh.slett(doc(db, SAM.PLAYER_ALLROUND, spillerId));

  await bh.kommit();

  // Fjern spilleren fra leaderboardene også -- ellers ville hen (med en
  // nå slettet rating) blitt stående synlig i ratinglisten helt til
  // leaderboardet neste gang skrives av en annen grunn.
  for (const fane of ['allround', ...ALLE_KATEGORIER]) {
    await fjernFraLeaderboard(klubbId, fane, spillerId);
  }
  nullstillRatingCache();
}

window.slettSpillerBekreft = async function (spillerId) {
  const kart = await hentSpillerKart();
  const navn = kart.get(spillerId) ?? spillerId;
  window.krevAdmin('Slette spiller', 'Bekreft med PIN for å slette spilleren.', () => {
    apneSlettBekreft(
      `Slette ${navn}?`,
      'Sletter spilleren og all rating/fremgang permanent. Historiske økter i arkivet endres ikke. Dette kan ikke angres.',
      () => slettSpillerData(spillerId),
      'Spilleren ble slettet',
    );
  });
};
