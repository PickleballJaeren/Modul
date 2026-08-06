// ════════════════════════════════════════════════════════
// screens-treningsspor.js — Multi-spor-økt ("treningsspor")
//
// Helt PARALLELL flyt til den vanlige enkelt-spor-flyten
// (competitions/registerPlayers/activeSession/registerFinish/
// oktResultat), som forblir 100% uendret og upåvirket. Bygger på
// sporListe-laget i state.js (se kommentaren der).
//
// Skjermene finnes ikke i index.html -- injiseres dynamisk her, samme
// mønster som screens-skillTests.js/screens-pamelding.js allerede
// bruker, for å unngå å røre en HTML-fil andre skjermer er avhengige av.
//
// v1-avgrensning (bevisst, for å holde omfanget håndterbart): ingen
// manuell banebytte-redigering for multi-spor-økter ennå (finnes i dag
// kun for enkelt-spor via screens-activeSession.js), og "pågående økt"-
// kortet/live-siden viser ikke et fullt resultat for multi-spor-økter
// når de fullføres -- selve lagringen i rating-arkivet er upåvirket.
// ════════════════════════════════════════════════════════

import { escHtml, naviger, visMelding } from './ui.js';
import {
  hentAktivKlubbId, hentSpillerKart, leggTilLokalt, navnFor, hentRatingService,
  startFlereSpor, hentSporListe, settStartBanerForSpor,
  plasserSpillerISpor, alleSporFerdigPlassert, beregnSluttbanerForSpor,
  lagreAktivOktTilSky, fullforFlereSporISky, slettAktivOktFraSky, nullstillOkt,
} from './state.js';
import { db, SAM, doc, setDoc, serverTimestamp } from './firebase.js';
import {
  ALLE_KONKURRANSER, KONKURRANSE_NAVN, KONKURRANSE_TIL_KATEGORI,
  RATINGKATEGORI_NAVN, kategoriForKonkurranse, STARTRATING,
} from './domain-constants.js';
import { IKON } from './screens-competitions.js';
import { genererBaner as genererBanerRent } from './domain-rating-courtAssignment.js';
import { lagFirestoreRatingRepository } from './domain-repository-firestoreRatingRepository.js';
import { lagFirestorePameldingRepository } from './domain-repository-firestorePameldingRepository.js';
import { getErAdmin } from './admin.js';
import { bevegelseBadge } from './screens-registerFinish.js';
import { apneSlettBekreft } from './screens-ratingLists.js';

const ratingRepoLesing = lagFirestoreRatingRepository(); // egen instans, kun til lesing under banegenerering
const pameldingRepo = lagFirestorePameldingRepository();

// ── Lokal wizard-tilstand (før "Start økt" trykkes) ────────────────
// sporOppsett er parallell med ALLE_KONKURRANSER (samme indeks).
let sporOppsett = ALLE_KONKURRANSER.map(() => ({ deltakerIder: new Set(), foldet: true }));
let lokalSpillerKart = new Map();
let aktiveSporForBaner = []; // fylt av gaTilBanefordeling()

function hentNavnLokal(id) {
  return lokalSpillerKart.get(id) ?? navnFor(id);
}

function nullstillWizard() {
  sporOppsett = ALLE_KONKURRANSER.map(() => ({ deltakerIder: new Set(), foldet: true }));
  aktiveSporForBaner = [];
}

function erSpillerValgtAnnetSted(spillerId, unntattIndeks) {
  return sporOppsett.findIndex((s, i) => i !== unntattIndeks && s.deltakerIder.has(spillerId));
}

async function hentRatingForSpillereISpor(spillerIder, konkurranse) {
  const kategori = kategoriForKonkurranse(konkurranse);
  return Promise.all(spillerIder.map(async id => {
    const rating = await ratingRepoLesing.hentRatingForKategori(id, kategori);
    return { spillerId: id, rating: rating?.elo ?? STARTRATING };
  }));
}

// ════════════════════════════════════════════════════════
// SKJERMER — injisert dynamisk, samme app-header/scroll-omrade-mønster
// som resten av index.html allerede bruker.
// ════════════════════════════════════════════════════════

function sikreSkjermer() {
  if (document.getElementById('skjerm-treningsspor-oppsett')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="skjerm-treningsspor-oppsett" class="screen">
      <div class="app-header">
        <button class="tilbake-btn" onclick="naviger('hjem')">←</button>
        <div style="flex:1"><div class="app-name">Ny økt · flere spor</div><div class="app-sub">Velg spor og spillere</div></div>
      </div>
      <div class="scroll-omrade"><div id="treningsspor-oppsett-innhold"></div></div>
    </div>

    <div id="skjerm-treningsspor-baner" class="screen">
      <div class="app-header">
        <button class="tilbake-btn" onclick="naviger('treningsspor-oppsett')">←</button>
        <div style="flex:1"><div class="app-name">Fordel baner</div><div class="app-sub">Juster antall baner per spor ved behov</div></div>
      </div>
      <div class="scroll-omrade"><div id="treningsspor-baner-innhold"></div></div>
    </div>

    <div id="skjerm-treningsspor-aktiv" class="screen">
      <div class="app-header">
        <button class="tilbake-btn" onclick="naviger('hjem')">←</button>
        <div style="flex:1"><div class="app-name">Pågår · flere spor</div><div class="app-sub">Baneliste</div></div>
        <span class="kat-tag kat-soft_play" style="background:rgba(34,197,94,.15);color:var(--green2)">Aktiv</span>
      </div>
      <div class="scroll-omrade"><div id="treningsspor-aktiv-innhold"></div></div>
    </div>

    <div id="skjerm-treningsspor-sluttbane" class="screen">
      <div class="app-header">
        <button class="tilbake-btn" onclick="naviger('treningsspor-aktiv')">←</button>
        <div style="flex:1"><div class="app-name">Registrer sluttbane</div><div class="app-sub">Trykk spillere i rekkefølge, per spor</div></div>
        <div class="header-teller" id="treningsspor-sluttbane-teller">0 av 0</div>
      </div>
      <div class="scroll-omrade"><div id="treningsspor-sluttbane-innhold"></div></div>
    </div>

    <div id="skjerm-treningsspor-resultat" class="screen">
      <div class="app-header">
        <button class="tilbake-btn" onclick="naviger('hjem')">←</button>
        <div style="flex:1"><div class="app-name">Resultat</div><div class="app-sub">Alle spor</div></div>
      </div>
      <div class="scroll-omrade"><div id="treningsspor-resultat-innhold"></div></div>
    </div>
  `);
}

// ════════════════════════════════════════════════════════
// STEG 1 — velg spor og spillere
// ════════════════════════════════════════════════════════

window.apneNyOktFlereSpor = async function () {
  sikreSkjermer();
  nullstillWizard();
  naviger('treningsspor-oppsett');

  const container = document.getElementById('treningsspor-oppsett-innhold');
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter spillere…</div>';

  lokalSpillerKart = await hentSpillerKart();
  await forhandsutfyllFraPamelding();
  tegnOppsett();
};

/** Forhåndsutfyller spor-valg fra en ÅPEN påmeldingsrunde, om noen finnes. En lukket
 * runde (f.eks. fra en tidligere, allerede avsluttet økt) skal IKKE forhåndsutfylles. */
async function forhandsutfyllFraPamelding() {
  try {
    const klubbId = hentAktivKlubbId();
    const runde = await pameldingRepo.hentRunde(klubbId);
    if (!runde || runde.status !== 'apen') return;
    const interesse = await pameldingRepo.hentInteresseForRunde(klubbId, runde.rundeId);
    interesse.forEach(i => {
      const indeks = ALLE_KONKURRANSER.indexOf(i.konkurranse);
      if (indeks === -1) return;
      if (erSpillerValgtAnnetSted(i.spillerId, indeks) !== -1) return; // konflikt -- hopp over, admin velger manuelt
      sporOppsett[indeks].deltakerIder.add(i.spillerId);
      sporOppsett[indeks].foldet = false;
    });
  } catch (e) {
    console.error('[treningsspor] Kunne ikke forhåndsutfylle fra påmelding:', e);
  }
}

function tegnOppsett() {
  const container = document.getElementById('treningsspor-oppsett-innhold');
  const seksjoner = ALLE_KONKURRANSER.map((k, i) => byggSporSeksjon(k, i)).join('');
  container.innerHTML = `
    ${seksjoner}
    <button class="knapp knapp-primaer" style="width:100%;margin-top:8px" onclick="window.gaTilBanefordeling()">Neste: fordel baner</button>
  `;
}

function byggSporSeksjon(konkurranse, indeks) {
  const spor = sporOppsett[indeks];
  const kategori = KONKURRANSE_TIL_KATEGORI[konkurranse];
  const antall = spor.deltakerIder.size;

  const innhold = spor.foldet ? '' : (() => {
    const rader = [...lokalSpillerKart.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'no'))
      .map(([id, navn]) => {
        const valgtHer = spor.deltakerIder.has(id);
        const annetIndeks = erSpillerValgtAnnetSted(id, indeks);
        if (annetIndeks !== -1) {
          const annenNavn = KONKURRANSE_NAVN[ALLE_KONKURRANSER[annetIndeks]];
          return `
            <div class="sl-spillervelger-rad" style="opacity:0.35;cursor:default">
              <span>${escHtml(navn)}</span>
              <span style="font-size:11px;color:var(--muted)">Allerede i ${escHtml(annenNavn)}</span>
            </div>`;
        }
        return `
          <div class="sl-spillervelger-rad${valgtHer ? ' valgt' : ''}" onclick="window.veksleSpillerISpor(${indeks},'${id}')">
            <span>${escHtml(navn)}</span>
            ${valgtHer ? '' : '<span style="color:var(--muted2);font-size:16px">+</span>'}
          </div>`;
      }).join('');

    return `
      <div style="padding:10px 14px">
        <div class="sl-spillervelger-treff" style="max-height:none">
          ${lokalSpillerKart.size ? rader : '<div class="tom-tilstand-liten">Ingen spillere funnet</div>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input type="text" id="treningsspor-manuell-${indeks}" placeholder="Skriv navn" style="flex:1">
          <button class="knapp knapp-omriss knapp-liten" style="width:auto" onclick="window.leggTilManuellISpor(${indeks})">Legg til</button>
        </div>
      </div>`;
  })();

  return `
    <div style="border:1px solid var(--border);border-radius:14px;margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--navy2);cursor:pointer" onclick="window.veksleSporFoldet(${indeks})">
        <span style="font-size:16px">${IKON[konkurranse] ?? '🏓'}</span>
        <span class="kat-tag kat-${kategori}" style="flex-shrink:0">${escHtml(RATINGKATEGORI_NAVN[kategori])}</span>
        <span style="font-size:14px;font-weight:500;flex:1">${escHtml(KONKURRANSE_NAVN[konkurranse])}${antall ? ` · ${antall} valgt` : ''}</span>
        <span style="color:var(--muted)">${spor.foldet ? '⌄' : '⌃'}</span>
      </div>
      ${innhold}
    </div>`;
}

window.veksleSporFoldet = function (indeks) {
  sporOppsett[indeks].foldet = !sporOppsett[indeks].foldet;
  tegnOppsett();
};

window.veksleSpillerISpor = function (indeks, spillerId) {
  const spor = sporOppsett[indeks];
  if (spor.deltakerIder.has(spillerId)) spor.deltakerIder.delete(spillerId);
  else spor.deltakerIder.add(spillerId);
  tegnOppsett();
};

window.leggTilManuellISpor = function (indeks) {
  const input = document.getElementById(`treningsspor-manuell-${indeks}`);
  const navn = input.value.trim();
  if (!navn) return;
  const id = `manuell_${navn.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  lokalSpillerKart.set(id, navn);
  leggTilLokalt(id, navn);
  sporOppsett[indeks].deltakerIder.add(id);
  tegnOppsett();

  setDoc(doc(db, SAM.SPILLERE, id), {
    navn, klubbId: hentAktivKlubbId(), manuell: true, opprettet: serverTimestamp(),
  }).catch(e => {
    console.error('[treningsspor] Kunne ikke lagre manuelt tillagt spiller:', e);
    visMelding('Kunne ikke lagre spilleren permanent (ingen nett?)', 'advarsel');
  });
};

// ════════════════════════════════════════════════════════
// STEG 2 — fordel baner
// ════════════════════════════════════════════════════════

window.gaTilBanefordeling = function () {
  aktiveSporForBaner = sporOppsett
    .map((s, i) => ({ deltakerIder: [...s.deltakerIder], indeks: i, konkurranse: ALLE_KONKURRANSER[i] }))
    .filter(s => s.deltakerIder.length >= 2);

  if (aktiveSporForBaner.length === 0) {
    visMelding('Velg minst 2 spillere i minst ett spor', 'advarsel');
    return;
  }
  tegnBanefordeling();
  naviger('treningsspor-baner');
};

function tegnBanefordeling() {
  const container = document.getElementById('treningsspor-baner-innhold');
  const defaultTotal = aktiveSporForBaner.reduce((s, spor) => s + Math.ceil(spor.deltakerIder.length / 2), 0);

  const raderHtml = aktiveSporForBaner.map(spor => {
    const kategori = KONKURRANSE_TIL_KATEGORI[spor.konkurranse];
    const defaultBaner = Math.ceil(spor.deltakerIder.length / 2);
    return `
      <div style="display:flex;align-items:center;gap:8px;background:#0b1626;border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <span class="kat-tag kat-${kategori}">${escHtml(RATINGKATEGORI_NAVN[kategori])}</span>
        <span style="font-size:13px;flex:1">${escHtml(KONKURRANSE_NAVN[spor.konkurranse])} · ${spor.deltakerIder.length} spillere</span>
        <input type="number" min="1" id="tsm-banetall-${spor.indeks}" value="${defaultBaner}"
               oninput="window.oppdaterBanefordelingsvarsel()"
               style="width:52px;text-align:center;font-family:'DM Mono',monospace">
        <span style="font-size:11px;color:var(--muted)">baner</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:13px;color:var(--muted2)">Tilgjengelige baner totalt</span>
      <input type="number" min="1" id="tsm-total" value="${defaultTotal}"
             oninput="window.oppdaterBanefordelingsvarsel()"
             style="width:52px;text-align:center;font-family:'DM Mono',monospace">
    </div>
    ${raderHtml}
    <div id="tsm-varsel"></div>
    <button class="knapp knapp-primaer" style="width:100%;margin-top:12px" id="treningsspor-start-knapp" onclick="window.startMultiSporOkt()">Start økt</button>
  `;
  window.oppdaterBanefordelingsvarsel();
}

window.oppdaterBanefordelingsvarsel = function () {
  const total = Number(document.getElementById('tsm-total')?.value) || 0;
  const sum = aktiveSporForBaner.reduce((s, spor) => s + (Number(document.getElementById(`tsm-banetall-${spor.indeks}`)?.value) || 0), 0);
  const varsel = document.getElementById('tsm-varsel');
  if (!varsel) return;
  varsel.innerHTML = sum > total
    ? `<div style="background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:10px;padding:8px 10px;font-size:12px;color:#fb923c;margin-top:4px">
         Trenger ${sum} baner, kun ${total} tilgjengelig. Juster antall baner per spor manuelt over.
       </div>`
    : '';
};

// ════════════════════════════════════════════════════════
// GENERERING — banefordeling per spor, forskjøvet banenummerering
// ════════════════════════════════════════════════════════

async function genererOgStartMultiSporOkt(sporValg) {
  startFlereSpor(sporValg.map(s => ({ konkurranse: s.konkurranse, deltakerIder: s.deltakerIder })));

  let baneOffset = 0;
  for (let i = 0; i < sporValg.length; i++) {
    const s = sporValg[i];
    const spillereMedRating = await hentRatingForSpillereISpor(s.deltakerIder, s.konkurranse);
    const baner = genererBanerRent(spillereMedRating, s.antallBaner);
    const forskjovet = baner.map(b => ({ ...b, baneNr: b.baneNr + baneOffset }));
    settStartBanerForSpor(i, forskjovet);
    baneOffset += forskjovet.length;
  }
}

window.startMultiSporOkt = async function () {
  const sporValg = aktiveSporForBaner.map(s => ({
    konkurranse: s.konkurranse,
    deltakerIder: s.deltakerIder,
    antallBaner: Number(document.getElementById(`tsm-banetall-${s.indeks}`)?.value) || Math.ceil(s.deltakerIder.length / 2),
  }));

  const knapp = document.getElementById('treningsspor-start-knapp');
  knapp.disabled = true;
  knapp.textContent = 'Genererer…';

  try {
    await genererOgStartMultiSporOkt(sporValg);
    tegnAktivMultiSpor();
    naviger('treningsspor-aktiv');
    lagreAktivOktTilSky().catch(e => {
      console.error('[treningsspor] Kunne ikke dele økten med andre enheter:', e);
      visMelding('Kunne ikke dele økten med andre enheter (ingen nett?)', 'advarsel');
    });
  } catch (e) {
    console.error('[treningsspor] Kunne ikke generere baner:', e);
    visMelding('Noe gikk galt ved generering av baner', 'feil');
    knapp.disabled = false;
    knapp.textContent = 'Start økt';
  }
};

// ════════════════════════════════════════════════════════
// STEG 3 — aktiv, gruppert baneliste
// ════════════════════════════════════════════════════════

function tegnAktivMultiSpor() {
  const container = document.getElementById('treningsspor-aktiv-innhold');
  const erAdmin = getErAdmin();

  const seksjoner = hentSporListe().map(spor => byggSporBanelisteSeksjon(spor)).join('');

  const handlingerHtml = erAdmin ? `
    <button class="knapp knapp-primaer" style="margin-top:8px" onclick="window.avsluttMultiSporOkt()">Avslutt økt</button>
    <button class="knapp knapp-fare knapp-liten" style="width:100%;margin-top:10px" onclick="window.avbrytMultiSporOkt()">Avbryt økt</button>
  ` : '';

  container.innerHTML = seksjoner + handlingerHtml;
}

function byggSporBanelisteSeksjon(spor) {
  const kategori = KONKURRANSE_TIL_KATEGORI[spor.konkurranse];
  const banerHtml = (spor.startBaner ?? []).map(bane => `
    <div class="bane-rad">
      <span class="bane-nr">${String(bane.baneNr).padStart(2, '0')}</span>
      <div style="flex:1;min-width:0">
        ${bane.spillerIder.map(id => `<div class="bane-navn">${escHtml(hentNavnLokal(id))}</div>`).join('')}
      </div>
    </div>`).join('');

  return `
    <div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="kat-tag kat-${kategori}">${escHtml(RATINGKATEGORI_NAVN[kategori])}</span>
        <span style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${escHtml(KONKURRANSE_NAVN[spor.konkurranse])}</span>
      </div>
      ${banerHtml}
    </div>`;
}

window.avsluttMultiSporOkt = function () {
  window.krevAdmin('Avslutt økt', 'Bekreft med PIN for å registrere sluttresultat.', () => {
    tegnSluttregistreringMultiSpor();
    naviger('treningsspor-sluttbane');
  });
};

window.avbrytMultiSporOkt = function () {
  window.krevAdmin('Avbryt økt', 'Bekreft med PIN for å avbryte økten.', () => {
    apneSlettBekreft(
      'Avbryte økten?',
      'Økten avsluttes uten at resultater lagres, for alle spor, og forsvinner for alle som følger den. Dette kan ikke angres.',
      async () => {
        nullstillOkt();
        await slettAktivOktFraSky();
        naviger('hjem');
      },
      'Økten ble avbrutt',
    );
  });
};

// ════════════════════════════════════════════════════════
// STEG 4 — gruppert sluttregistrering
// ════════════════════════════════════════════════════════

function tegnSluttregistreringMultiSpor() {
  const container = document.getElementById('treningsspor-sluttbane-innhold');
  const erAdmin = getErAdmin();
  const sporListe = hentSporListe();

  let totalPlassert = 0;
  let totalDeltakere = 0;

  const seksjoner = sporListe.map((spor, sporIndeks) => {
    totalPlassert += spor.plasseringer.length;
    totalDeltakere += spor.deltakerIder.length;
    const kategori = KONKURRANSE_TIL_KATEGORI[spor.konkurranse];
    const sluttbaner = beregnSluttbanerForSpor(sporIndeks);

    const raderHtml = spor.deltakerIder.map(id => {
      const erPlassert = spor.plasseringer.includes(id);
      if (!erPlassert) {
        return erAdmin ? `
          <div class="sl-spillervelger-rad" onclick="window.plasserMultiSpor(${sporIndeks},'${id}')">
            <span>${escHtml(hentNavnLokal(id))}</span>
            <span style="color:var(--muted2);font-size:16px">+</span>
          </div>` : `
          <div class="sl-spillervelger-rad" style="cursor:default">
            <span>${escHtml(hentNavnLokal(id))}</span>
          </div>`;
      }
      const startBaneNr = (spor.startBaner ?? []).find(b => b.spillerIder.includes(id))?.baneNr ?? null;
      const sluttBaneNr = sluttbaner.get(id);
      return `
        <div class="sl-spillervelger-rad" style="opacity:0.45;cursor:default">
          <span class="bane-nr" style="margin-right:10px">${String(sluttBaneNr).padStart(2, '0')}</span>
          <span style="flex:1">${escHtml(hentNavnLokal(id))}</span>
          ${bevegelseBadge(startBaneNr, sluttBaneNr)}
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="kat-tag kat-${kategori}">${escHtml(RATINGKATEGORI_NAVN[kategori])}</span>
          <span style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${escHtml(KONKURRANSE_NAVN[spor.konkurranse])}</span>
        </div>
        <div class="sl-spillervelger-treff" style="max-height:none">${raderHtml}</div>
      </div>`;
  }).join('');

  document.getElementById('treningsspor-sluttbane-teller').textContent = `${totalPlassert} av ${totalDeltakere}`;

  const fullforHtml = alleSporFerdigPlassert()
    ? `<button class="knapp knapp-primaer" style="width:100%;margin-top:12px" onclick="window.fullforMultiSporOkt()">Fullfør økt</button>`
    : '';
  const avbrytHtml = erAdmin
    ? `<button class="knapp knapp-fare knapp-liten" style="width:100%;margin-top:12px" onclick="window.avbrytMultiSporOkt()">Avbryt økt</button>`
    : '';

  container.innerHTML = seksjoner + fullforHtml + avbrytHtml;
}

window.plasserMultiSpor = function (sporIndeks, spillerId) {
  window.krevAdmin('Registrer plassering', 'Bekreft med PIN for å registrere resultater.', () => {
    plasserSpillerISpor(sporIndeks, spillerId);
    tegnSluttregistreringMultiSpor();
    lagreAktivOktTilSky().catch(e => console.error('[treningsspor] Kunne ikke synkronisere:', e));
  });
};

window.fullforMultiSporOkt = function () {
  window.krevAdmin('Fullfør økt', 'Bekreft med PIN for å lagre resultatet.', utforFullforingMultiSpor);
};

async function utforFullforingMultiSpor() {
  const ratingService = hentRatingService();
  const sporListe = hentSporListe();
  const container = document.getElementById('treningsspor-sluttbane-innhold');
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Lagrer økt…</div>';

  try {
    const resultater = [];
    for (let i = 0; i < sporListe.length; i++) {
      const spor = sporListe[i];
      const sluttbaner = beregnSluttbanerForSpor(i);
      const resultat = await ratingService.beregnOktResultat(spor.konkurranse, spor.startBaner, sluttbaner);
      await ratingService.fullforOkt(resultat);
      resultater.push(resultat);
    }

    fullforFlereSporISky(resultater).catch(e => console.error('[treningsspor] Kunne ikke dele resultatet:', e));
    visMelding('Økt fullført og lagret i arkivet');
    nullstillOkt();
    tegnResultatMultiSpor(resultater);
    naviger('treningsspor-resultat');
  } catch (e) {
    console.error('[treningsspor] Kunne ikke fullføre økt:', e);
    visMelding('Noe gikk galt ved lagring. Prøv igjen.', 'feil');
    tegnSluttregistreringMultiSpor();
  }
}

// ════════════════════════════════════════════════════════
// STEG 5 — kombinert resultat, alle spor
// ════════════════════════════════════════════════════════

function tegnResultatMultiSpor(resultater) {
  const container = document.getElementById('treningsspor-resultat-innhold');

  const seksjoner = resultater.map(resultat => {
    const kategori = KONKURRANSE_TIL_KATEGORI[resultat.konkurranse];
    const sortert = [...resultat.resultatPerSpiller].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

    const raderHtml = sortert.map((r, i) => {
      const delta = r.delta ?? 0;
      const deltaKlasse = delta > 0 ? 'beveg-opp' : delta < 0 ? 'beveg-ned' : 'beveg-lik';
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${i < sortert.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:500">${escHtml(hentNavnLokal(r.spillerId))}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">Bane ${r.startBane ?? '–'} → ${r.sluttBane ?? '–'}</div>
          </div>
          ${bevegelseBadge(r.startBane, r.sluttBane)}
          <span class="beveg-badge ${deltaKlasse}" style="margin-left:2px">${delta > 0 ? '+' : ''}${delta}</span>
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="kat-tag kat-${kategori}">${escHtml(RATINGKATEGORI_NAVN[kategori])}</span>
          <span style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${escHtml(KONKURRANSE_NAVN[resultat.konkurranse])}</span>
        </div>
        <div class="kort">${raderHtml}</div>
      </div>`;
  }).join('');

  container.innerHTML = `${seksjoner}<button class="knapp knapp-primaer" style="width:100%;margin-top:8px" onclick="window.lukkMultiSporResultat()">Ferdig</button>`;
}

window.lukkMultiSporResultat = function () {
  slettAktivOktFraSky().catch(e => console.error('[treningsspor] Kunne ikke rydde bort delt økt:', e));
  naviger('hjem');
};

/**
 * Gjenopptar en multi-spor-økt på riktig skjerm (aktiv baneliste eller
 * sluttregistrering, avhengig av om noe allerede er plassert). Kalt fra
 * app.js sin window.apnePagaendeOkt() når den delte økten viser seg å
 * ha flere enn ett spor -- se forklaring der.
 */
export function gjenopptaMultiSporOkt() {
  sikreSkjermer();
  const sporListe = hentSporListe();
  const noenPlassert = sporListe.some(s => s.plasseringer.length > 0);
  if (noenPlassert) {
    tegnSluttregistreringMultiSpor();
    naviger('treningsspor-sluttbane');
  } else {
    tegnAktivMultiSpor();
    naviger('treningsspor-aktiv');
  }
}

/** Viser resultatskjermen direkte fra rå, lagret data (uten å gå via en fullført lokal beregning). */
export function visMultiSporResultatFraData(resultater) {
  sikreSkjermer();
  tegnResultatMultiSpor(resultater);
  naviger('treningsspor-resultat');
}

// ════════════════════════════════════════════════════════
// INNGANGSKNAPP PÅ HJEMSKJERMEN
// Samme trygge oppdaterings-mønster som screens-pamelding.js: lytt på
// klubb-velger og "load", ikke på window.byttKlubb direkte (som ikke
// finnes ennå når denne modulen lastes -- se forklaringen i
// screens-pamelding.js).
// ════════════════════════════════════════════════════════

function sikreKnapp() {
  const wrapper = document.getElementById('hjem-klubb-handlinger');
  if (!wrapper || document.getElementById('treningsspor-ny-okt-btn')) return;
  const startKnapp = document.getElementById('hjem-start-okt-btn');
  const knappHtml = `
    <button class="knapp knapp-omriss" id="treningsspor-ny-okt-btn" style="width:100%;display:none" onclick="window.apneNyOktFlereSpor()">
      Ny økt · flere spor
    </button>`;
  if (startKnapp) startKnapp.insertAdjacentHTML('afterend', knappHtml);
  else wrapper.insertAdjacentHTML('afterbegin', knappHtml);
}

function oppdaterKnappSynlighet() {
  const knapp = document.getElementById('treningsspor-ny-okt-btn');
  if (!knapp) return;
  knapp.style.display = getErAdmin() ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  sikreKnapp();
  oppdaterKnappSynlighet();

  const opprinneligApneAdminLas = window.apneAdminLas;
  if (typeof opprinneligApneAdminLas === 'function') {
    window.apneAdminLas = function (...args) {
      const resultat = opprinneligApneAdminLas(...args);
      setTimeout(oppdaterKnappSynlighet, 300);
      return resultat;
    };
  }
});
document.getElementById('klubb-velger')?.addEventListener('change', () => setTimeout(oppdaterKnappSynlighet, 300));
window.addEventListener('load', () => setTimeout(oppdaterKnappSynlighet, 300));
