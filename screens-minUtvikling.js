// ════════════════════════════════════════════════════════
// screens-minUtvikling.js — "Min utvikling"
//
// To ting i én fil, tett koblet:
//  1) Utvider den eksisterende spillerprofil-modalen med Styrker,
//     Potensial og Anbefalt aktivitet.
//  2) En snarvei fra hjemskjermen ("Min utvikling") som åpner samme
//     modal for spilleren selv, ved hjelp av "min spiller"-lagringen i
//     state.js -- spilleren trenger ikke lete seg frem i ratinglisten.
//
// Legger seg IKKE inn i index.html -- samme begrunnelse som
// screens-pamelding.js/screens-skillTests.js/screens-treningsspor.js:
// unngår å røre en HTML-fil andre skjermer er avhengige av.
//
// Pakker window.apneSpillerprofil inn EN GANG TIL, ETTER at
// screens-skillTests.js allerede har pakket den inn (se import-
// rekkefølgen i app.js -- denne fila MÅ importeres etter
// screens-skillTests.js). Det er bevisst: Styrker/Potensial/Anbefalt
// aktivitet skal stå NEDENFOR ferdighetstester-seksjonen, som en
// oppsummering av både elo-graf og testnivåer -- ikke bare det ene.
// ════════════════════════════════════════════════════════

import { escHtml } from './ui.js';
import {
  hentSpillerKart, hentAktivKlubbId, hentMinSpillerId, settMinSpillerId,
} from './state.js';
import { db, SAM, doc, getDoc } from './firebase.js';
import { lagFirestoreRatingRepository } from './domain-repository-firestoreRatingRepository.js';
import { beregnUtvikling } from './domain-rating-utvikling.js';
import { ALLE_KATEGORIER, RATINGKATEGORI_NAVN, KONKURRANSE_NAVN, STARTRATING } from './domain-constants.js';

const ratingRepo = lagFirestoreRatingRepository(); // egen instans, kun til lesing her

// ════════════════════════════════════════════════════════
// UTVIDER SPILLERPROFIL — injiseres etter ferdighetstester-seksjonen
// ════════════════════════════════════════════════════════

function sikreUtviklingContainer() {
  let container = document.getElementById('spillerprofil-utvikling');
  if (container) return container;
  // Henger seg normalt etter ferdighetstester-containeren (screens-
  // skillTests.js). Faller tilbake til rett etter historikk som rent
  // sikkerhetsnett, i tilfelle import-rekkefølgen i app.js skulle endre
  // seg -- skal aldri være i bruk under normal drift.
  const anker = document.getElementById('spillerprofil-ferdighetstester')
    ?? document.getElementById('spillerprofil-historikk');
  if (!anker) return null;
  container = document.createElement('div');
  container.id = 'spillerprofil-utvikling';
  container.style.marginBottom = '16px';
  anker.insertAdjacentElement('afterend', container);
  return container;
}

async function hentRatingerPerKategori(spillerId) {
  const par = await Promise.all(
    ALLE_KATEGORIER.map(k => ratingRepo.hentRatingForKategori(spillerId, k).then(r => [k, r])),
  );
  const ratingerPerKategori = {};
  par.forEach(([kategori, rating]) => { if (rating) ratingerPerKategori[kategori] = rating.elo; });
  return ratingerPerKategori;
}

async function hentAllround(spillerId) {
  try {
    const snap = await getDoc(doc(db, SAM.PLAYER_ALLROUND, spillerId));
    return snap.exists() ? snap.data().allround : STARTRATING;
  } catch (e) {
    console.error('[minUtvikling] Kunne ikke hente allround:', e);
    return STARTRATING;
  }
}

function byggKategoriTagg(kategori) {
  return `<span class="kat-tag kat-${kategori}" style="margin:0 4px 4px 0">${escHtml(RATINGKATEGORI_NAVN[kategori] ?? kategori)}</span>`;
}

/**
 * @param {string} spillerId
 * @param {boolean} erMeg -- true når spillerprofilen ble åpnet via "Min
 *   utvikling"-snarveien for spilleren selv. Styrer om "Ikke deg? Bytt
 *   spiller"-lenken vises -- den skal IKKE dukke opp når en admin bare
 *   klikker seg inn på en tilfeldig spiller fra ratinglisten.
 */
async function visUtvikling(spillerId, erMeg) {
  const container = sikreUtviklingContainer();
  if (!container) return;
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter utviklingsbilde…</div>';

  try {
    const [ratingerPerKategori, allround] = await Promise.all([
      hentRatingerPerKategori(spillerId),
      hentAllround(spillerId),
    ]);
    const { styrker, potensial, anbefalteKonkurranser } = beregnUtvikling(ratingerPerKategori, allround);

    const styrkerHtml = styrker.length
      ? styrker.map(s => byggKategoriTagg(s.kategori)).join('')
      : '<span style="font-size:12px;color:var(--muted)">Ikke nok data ennå</span>';

    const potensialHtml = potensial
      ? byggKategoriTagg(potensial.kategori)
      : '<span style="font-size:12px;color:var(--muted)">Ikke nok data ennå</span>';

    const anbefaltHtml = anbefalteKonkurranser.length
      ? `<div class="sl-regel-boks" style="margin-bottom:0">
           <strong>Anbefalt aktivitet:</strong> ${anbefalteKonkurranser.map(k => escHtml(KONKURRANSE_NAVN[k] ?? k)).join(' og ')}
         </div>`
      : '';

    const bytteHtml = erMeg
      ? `<div style="text-align:center;margin-top:14px">
           <span style="font-size:13px;color:var(--muted2);text-decoration:underline;cursor:pointer" onclick="window.byttMinSpiller()">Ikke deg? Bytt spiller</span>
         </div>`
      : '';

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div style="background:#060e1c;border:1px solid var(--border);border-radius:12px;padding:12px">
          <div style="font-size:12px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Styrker</div>
          ${styrkerHtml}
        </div>
        <div style="background:#060e1c;border:1px solid var(--border);border-radius:12px;padding:12px">
          <div style="font-size:12px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Potensial</div>
          ${potensialHtml}
        </div>
      </div>
      ${anbefaltHtml}
      ${bytteHtml}
    `;
  } catch (e) {
    console.error('[minUtvikling] Kunne ikke beregne utviklingsbilde:', e);
    container.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente styrker/potensial</div>';
  }
}

(function pakkInnSpillerprofilEnGangTil() {
  const opprinnelig = window.apneSpillerprofil;
  if (typeof opprinnelig !== 'function') {
    console.error('[minUtvikling] Fant ikke window.apneSpillerprofil -- sjekk import-rekkefølgen i app.js');
    return;
  }
  window.apneSpillerprofil = async function (spillerId) {
    await opprinnelig(spillerId);
    await visUtvikling(spillerId, spillerId === hentMinSpillerId());
  };
})();

window.byttMinSpiller = function () {
  const profilModal = document.getElementById('modal-spillerprofil');
  if (profilModal) profilModal.style.display = 'none';
  apneVelgMinSpillerModal();
};

// ════════════════════════════════════════════════════════
// HJEMSKJERM-KNAPP — legges til ETTER Ratinglister/Arkiv-raden, som
// allerede finnes fast i index.html under samme wrapper.
// ════════════════════════════════════════════════════════

function sikreKnapp() {
  const wrapper = document.getElementById('hjem-klubb-handlinger');
  if (!wrapper || document.getElementById('hjem-min-utvikling-btn')) return;
  wrapper.insertAdjacentHTML('beforeend', `
    <button class="knapp knapp-omriss" id="hjem-min-utvikling-btn" style="width:100%" onclick="window.apneMinUtvikling()">
      Min utvikling
    </button>`);
}

// Samme trygge oppdaterings-mønster som screens-pamelding.js/screens-
// treningsspor.js: lytt på klubb-velger og 'load', ikke på
// window.byttKlubb direkte (finnes ikke ennå når denne modulen lastes).
document.addEventListener('DOMContentLoaded', sikreKnapp);
document.getElementById('klubb-velger')?.addEventListener('change', () => setTimeout(sikreKnapp, 300));
window.addEventListener('load', () => setTimeout(sikreKnapp, 300));

// ════════════════════════════════════════════════════════
// "HVEM ER DU"-VELGER — vises kun første gang, eller når spilleren
// aktivt trykker "Bytt spiller". Ingen PIN -- samme begrunnelse som
// meld-interesse-modalen i screens-pamelding.js: dette er spillerens
// EGEN, skrivebeskyttede data, ingen adminhandling.
// ════════════════════════════════════════════════════════

function sikreVelgSpillerModal() {
  if (document.getElementById('modal-velg-min-spiller')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bakgrunn" id="modal-velg-min-spiller" style="display:none" onclick="if(event.target===this)window.lukkVelgMinSpillerModal()">
      <div class="modal">
        <div class="modal-tittel">Hvem er du?</div>
        <div class="modal-tekst">Velg deg selv, så husker appen dette til neste gang.</div>
        <select id="velg-min-spiller-select" style="width:100%;margin-bottom:16px"></select>
        <button class="knapp knapp-primaer" style="width:100%;margin-bottom:10px" onclick="window.bekreftMinSpiller()">Se min utvikling</button>
        <button class="knapp knapp-omriss" style="width:100%" onclick="window.lukkVelgMinSpillerModal()">Avbryt</button>
      </div>
    </div>`);
}

async function apneVelgMinSpillerModal() {
  sikreVelgSpillerModal();
  const spillerKart = await hentSpillerKart();
  const alternativer = [...spillerKart.entries()].sort((a, b) => a[1].localeCompare(b[1], 'no'));
  const select = document.getElementById('velg-min-spiller-select');
  select.innerHTML = alternativer.length
    ? alternativer.map(([id, navn]) => `<option value="${id}">${escHtml(navn)}</option>`).join('')
    : '<option value="">Ingen spillere funnet</option>';
  document.getElementById('modal-velg-min-spiller').style.display = 'flex';
}

window.lukkVelgMinSpillerModal = function () {
  const modal = document.getElementById('modal-velg-min-spiller');
  if (modal) modal.style.display = 'none';
};

window.bekreftMinSpiller = function () {
  const spillerId = document.getElementById('velg-min-spiller-select')?.value;
  if (!spillerId) return;
  settMinSpillerId(spillerId);
  window.lukkVelgMinSpillerModal();
  window.apneSpillerprofil(spillerId);
};

window.apneMinUtvikling = async function () {
  const klubbId = hentAktivKlubbId();
  if (!klubbId) return;

  const minId = hentMinSpillerId();
  if (minId) {
    const spillerKart = await hentSpillerKart();
    if (spillerKart.has(minId)) { window.apneSpillerprofil(minId); return; }
    settMinSpillerId(null); // husket spiller finnes ikke lenger (slettet av admin) -- spør på nytt
  }
  apneVelgMinSpillerModal();
};
