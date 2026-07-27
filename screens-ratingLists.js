// ════════════════════════════════════════════════════════
// ratingLists.js — Ratinglister-skjermen
// Åpner alltid på Allround. Kategoriknappene bytter hvilken liste
// som vises, uten å navigere bort fra skjermen.
// ════════════════════════════════════════════════════════

import { db, SAM, collection, query, where, orderBy, limit, getDocs, doc, getDoc } from './firebase.js';
import { lagBatchHjelper } from './batch-helpers.js';
import { escHtml, naviger, visMelding } from './ui.js';
import { hentSpillerKart } from './state.js';
import { ALLE_KATEGORIER, RATINGKATEGORI_NAVN, STARTRATING, KONKURRANSE_NAVN } from './domain-constants.js';

const KATEGORI_IKON = { soft_play: '🎯', power_play: '⚡', defense: '🛡️', singles: '🙋', allround: '🏆' };
const KATEGORI_FARGE = {
  soft_play: 'var(--green2)', power_play: 'var(--orange)', defense: 'var(--accent2)',
  singles: 'var(--yellow)', allround: 'var(--white)',
};
const KATEGORI_FARGE_HEX = {
  soft_play: '#22c55e', power_play: '#ea580c', defense: '#3b82f6', singles: '#eab308',
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

export async function visRatinglister() {
  naviger('ratinglister');
  await hentSpillerKart();
  tegnFaner();
  await tegnListe();
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

async function tegnListe() {
  const listeContainer = document.getElementById('rating-liste-innhold');
  const spillerKart = await hentSpillerKart();

  let rader;
  try {
    if (aktivFane === 'allround') {
      const q = query(collection(db, SAM.PLAYER_ALLROUND), orderBy('allround', 'desc'), limit(50));
      const snap = await getDocs(q);
      rader = snap.docs.map(d => ({ spillerId: d.data().spillerId, verdi: d.data().allround }));
    } else {
      const q = query(
        collection(db, SAM.PLAYER_CATEGORY_RATINGS),
        where('kategori', '==', aktivFane),
        orderBy('elo', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      rader = snap.docs.map(d => ({ spillerId: d.data().spillerId, verdi: d.data().elo }));
    }
  } catch (e) {
    console.error('[ratingLists] Kunne ikke hente liste:', e);
    listeContainer.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente ratinglisten</div>';
    return;
  }

  if (rader.length === 0) {
    listeContainer.innerHTML = '<div class="tom-tilstand-liten">Ingen ratinger registrert ennå</div>';
    return;
  }

  listeContainer.innerHTML = rader.map((r, i) => `
    <div class="rating-rad">
      <span class="rating-plass">${i + 1}</span>
      <span class="rating-navn" style="cursor:pointer" onclick="window.apneSpillerprofil('${r.spillerId}')">${escHtml(spillerKart.get(r.spillerId) ?? r.spillerId)}</span>
      <span class="rating-verdi">${r.verdi}</span>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════
// SPILLERPROFIL — trykk et navn i ratinglisten for å se rating
// over tid per kategori (håndtegnet SVG, ingen ekstern chart-lib
// siden appen er en offline-PWA og sw.js kun cacher egne filer),
// pluss de siste 10 øktene med sluttbane og elo-endring.
//
// Merk: Allround lagres kun som gjeldende verdi (playerAllround),
// ikke som historikk over tid -- den vises derfor kun i toppen av
// profilen, ikke som egen linje i grafen.
// ════════════════════════════════════════════════════════
function byggRatingSvg(historikkPerKategori) {
  const alleTider = [];
  const alleVerdier = [];
  Object.values(historikkPerKategori).forEach(liste => liste.forEach(h => {
    alleTider.push(new Date(h.dato).getTime());
    alleVerdier.push(h.eloEtter);
  }));

  if (alleTider.length === 0) {
    return '<div class="tom-tilstand-liten">Ingen historikk ennå</div>';
  }

  const minT = Math.min(...alleTider);
  const maxT = Math.max(...alleTider);
  const minV = Math.min(...alleVerdier, STARTRATING) - 20;
  const maxV = Math.max(...alleVerdier, STARTRATING) + 20;

  const bredde = 440, hoyde = 160, padL = 58, padB = 20, padT = 10, padR = 10;
  const skalaX = t => padL + (maxT === minT ? (bredde - padL - padR) / 2 : ((t - minT) / (maxT - minT)) * (bredde - padL - padR));
  const skalaY = v => padT + (1 - (v - minV) / ((maxV - minV) || 1)) * (hoyde - padT - padB);

  let linjer = '';
  Object.entries(historikkPerKategori).forEach(([kategori, liste]) => {
    if (!liste.length) return;
    const sortert = [...liste].sort((a, b) => new Date(a.dato) - new Date(b.dato));
    const punkter = sortert.map(h => `${skalaX(new Date(h.dato).getTime()).toFixed(1)},${skalaY(h.eloEtter).toFixed(1)}`).join(' ');
    linjer += `<polyline points="${punkter}" fill="none" stroke="${KATEGORI_FARGE_HEX[kategori]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    sortert.forEach(h => {
      linjer += `<circle cx="${skalaX(new Date(h.dato).getTime()).toFixed(1)}" cy="${skalaY(h.eloEtter).toFixed(1)}" r="2.5" fill="${KATEGORI_FARGE_HEX[kategori]}" />`;
    });
  });

  const gridVerdier = beregnGridVerdier(minV, maxV);
  const rutenettHtml = gridVerdier.map(v => `
    <text x="4" y="${(skalaY(v) + 4).toFixed(1)}" font-size="20" fill="#64748b">${v.toLocaleString('no-NO')}</text>
  `).join('');

  return `
    <svg viewBox="0 0 ${bredde} ${hoyde}" style="width:100%;height:${hoyde}px;display:block">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${hoyde - padB}" stroke="rgba(255,255,255,0.13)" />
      <line x1="${padL}" y1="${hoyde - padB}" x2="${bredde - padR}" y2="${hoyde - padB}" stroke="rgba(255,255,255,0.13)" />
      ${rutenettHtml}
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

  // Øktene lagres uten spillerId på toppnivå (kun inni resultatPerSpiller),
  // så vi henter hele samlingen og filtrerer i klienten -- samme mønster
  // som brukes i Administrasjon-slettingen lenger ned i denne filen.
  const oktSnap = await getDocs(query(collection(db, SAM.SESSIONS), orderBy('dato', 'desc'), limit(200)));
  const okter = [];
  for (const d of oktSnap.docs) {
    const okt = d.data();
    const rad = (okt.resultatPerSpiller ?? []).find(r => r.spillerId === spillerId);
    if (rad) okter.push({ okt, rad });
    if (okter.length >= 10) break;
  }

  return { historikkPerKategori, okter };
}

window.apneSpillerprofil = async function (spillerId) {
  const spillerKart = await hentSpillerKart();
  const navn = spillerKart.get(spillerId) ?? spillerId;
  document.getElementById('spillerprofil-navn').textContent = navn;
  document.getElementById('spillerprofil-avatar').textContent = navn.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  document.getElementById('spillerprofil-allround').textContent = '…';
  document.getElementById('spillerprofil-legende').innerHTML = ALLE_KATEGORIER.map(k => `
    <span style="display:flex;align-items:center;gap:5px">
      <span style="width:9px;height:9px;border-radius:2px;background:${KATEGORI_FARGE_HEX[k]}"></span>${escHtml(RATINGKATEGORI_NAVN[k])}
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
//
// Ratinger og økter lagres ikke med klubbId direkte i Firestore (se
// ARKITEKTUR.md-datamodellen); avgrensningen til "aktiv klubb" skjer
// derfor ved å slå opp hvilke spillerIder som tilhører klubben (samme
// players-oppslag som resten av appen bruker), og kun slette/behandle
// dokumenter som gjelder disse spillerIdene.
// ════════════════════════════════════════════════════════
async function hentKlubbSpillerIder() {
  const kart = await hentSpillerKart(); // Map<spillerId, navn>, filtrert på aktiv klubb
  return new Set(kart.keys());
}

function apneSlettBekreft(tittel, tekst, handling) {
  document.getElementById('slett-bekreft-tittel').textContent = tittel;
  document.getElementById('slett-bekreft-tekst').textContent = tekst;
  const knapp = document.getElementById('slett-bekreft-knapp');
  knapp.onclick = async () => {
    knapp.disabled = true;
    knapp.textContent = 'Sletter…';
    try {
      await handling();
      lukkSlettBekreft();
      visMelding('Slettet');
      // Om vi nettopp slettet ratingen som vises, tegn listen på nytt tom.
      await tegnListe();
    } catch (e) {
      console.error('[admin] Sletting feilet:', e);
      visMelding('Noe gikk galt under slettingen', 'feil');
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
  const klubbSpillerIder = await hentKlubbSpillerIder();
  const bh = lagBatchHjelper(db);

  for (const samling of [SAM.PLAYER_CATEGORY_RATINGS, SAM.PLAYER_COMPETITION_PROGRESS, SAM.PLAYER_ALLROUND]) {
    const snap = await getDocs(collection(db, samling));
    for (const d of snap.docs) {
      if (klubbSpillerIder.has(d.data().spillerId)) await bh.slett(d.ref);
    }
  }
  await bh.kommit();
}

async function slettArkivForKlubb() {
  const klubbSpillerIder = await hentKlubbSpillerIder();
  const bh = lagBatchHjelper(db);

  const snap = await getDocs(collection(db, SAM.SESSIONS));
  for (const d of snap.docs) {
    const okt = d.data();
    const tilhorerKlubb = (okt.resultatPerSpiller ?? []).some(r => klubbSpillerIder.has(r.spillerId));
    if (tilhorerKlubb) await bh.slett(d.ref);
  }
  await bh.kommit();
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
