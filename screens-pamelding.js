// ════════════════════════════════════════════════════════
// screens-pamelding.js — Påmelding til treningsspor.
//
// Samme prinsipp som screens-skillTests.js: ingen endring i index.html.
// Ny UI injiseres i hjem-klubb-handlinger (finnes allerede), og nye
// modaler bygges/appendes til document.body ved behov.
//
// Bevisst IKKE avhengig av window.byttKlubb -- den er definert i app.js
// sin egen modulkropp, som kjører ETTER alle import-linjer (inkl. denne
// filen) er ferdig evaluert. Å pakke den inn ville derfor feile stille
// (opprinnelig ville vært undefined). I stedet lyttes det på
// klubb-velgerens 'change'-event direkte, samt sl-naviger og 'load'
// som reserve for URL-basert klubbvalg ved oppstart (?klubb=...).
// ════════════════════════════════════════════════════════

import { escHtml, visMelding } from './ui.js';
import { hentSpillerKart, hentAktivKlubbId } from './state.js';
import { getErAdmin } from './admin.js';
import { lagFirestorePameldingRepository } from './domain-repository-firestorePameldingRepository.js';
import { ALLE_KONKURRANSER, KONKURRANSE_NAVN } from './domain-constants.js';

const pameldingRepo = lagFirestorePameldingRepository();

// ════════════════════════════════════════════════════════
// HJEMSKJERM — påmeldingskort (alle) + åpne/lukk-knapp (admin)
// ════════════════════════════════════════════════════════

function sikreHjemElementer() {
  const wrapper = document.getElementById('hjem-klubb-handlinger');
  if (!wrapper || document.getElementById('hjem-pamelding-kort')) return;
  wrapper.insertAdjacentHTML('afterbegin', `
    <div id="hjem-pamelding-kort" class="k-kort" style="display:none" onclick="window.apneMeldInteresse()">
      <span class="k-kort-ikon">📋</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:600" id="pamelding-kort-tittel">Påmelding</div>
        <div style="font-size:12px;color:var(--muted2);margin-top:2px" id="pamelding-kort-sub"></div>
      </div>
      <span class="kat-tag kat-soft_play" style="background:rgba(59,130,246,.15);color:#60a5fa">Åpen</span>
    </div>
    <button class="knapp knapp-omriss" id="hjem-apne-pamelding-btn" style="width:100%;display:none" onclick="window.apneAdminPamelding()">Åpne påmelding</button>
    <button class="knapp knapp-omriss" id="hjem-lukk-pamelding-btn" style="width:100%;display:none" onclick="window.lukkAdminPamelding()">Lukk påmelding</button>
  `);
}

async function oppdaterHjemPamelding() {
  sikreHjemElementer();
  const klubbId = hentAktivKlubbId();
  const apneBtn = document.getElementById('hjem-apne-pamelding-btn');
  const lukkBtn = document.getElementById('hjem-lukk-pamelding-btn');
  const kort = document.getElementById('hjem-pamelding-kort');
  if (!kort || !apneBtn || !lukkBtn) return;

  if (!klubbId) {
    kort.style.display = 'none';
    apneBtn.style.display = 'none';
    lukkBtn.style.display = 'none';
    return;
  }

  const runde = await pameldingRepo.hentRunde(klubbId);
  const apen = runde?.status === 'apen';
  const erAdmin = getErAdmin();

  kort.style.display = apen ? 'flex' : 'none';
  if (apen) {
    document.getElementById('pamelding-kort-tittel').textContent = runde.tittel || 'Påmelding';
    document.getElementById('pamelding-kort-sub').textContent =
      (runde.aktiveSpor ?? []).map(k => KONKURRANSE_NAVN[k] ?? k).join(' · ');
  }
  apneBtn.style.display = (erAdmin && !apen) ? 'block' : 'none';
  lukkBtn.style.display = (erAdmin && apen) ? 'block' : 'none';
}

// Dekker alle veiene hjemskjermen kan vise seg på: vanlig navigering
// tilbake til hjem, admin-status som endrer seg mens man står der, og
// selve klubbvalget (både via nedtrekksmeny og ?klubb=-URL ved oppstart).
document.addEventListener('sl-naviger', e => {
  if (e.detail?.skjerm === 'hjem') oppdaterHjemPamelding();
});
document.getElementById('klubb-velger')?.addEventListener('change', oppdaterHjemPamelding);
window.addEventListener('load', () => setTimeout(oppdaterHjemPamelding, 300));

// ════════════════════════════════════════════════════════
// ADMIN — ÅPNE PÅMELDING
// ════════════════════════════════════════════════════════

function sikreApneRundeModal() {
  if (document.getElementById('modal-apne-pamelding')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bakgrunn" id="modal-apne-pamelding" style="display:none" onclick="if(event.target===this)window.lukkApnePameldingModal()">
      <div class="modal">
        <div class="modal-tittel">Åpne påmelding</div>
        <input type="text" id="apne-pamelding-tittel" placeholder="F.eks. Mandag 12. august" style="width:100%;margin-bottom:14px">
        <div style="font-size:13px;color:var(--muted2);margin-bottom:8px">Aktiviteter i denne runden</div>
        <div id="apne-pamelding-spor" style="margin-bottom:16px"></div>
        <button class="knapp knapp-primaer" style="width:100%;margin-bottom:10px" id="apne-pamelding-lagre-knapp" onclick="window.lagreApneRunde()">Åpne påmelding</button>
        <button class="knapp knapp-omriss" style="width:100%" onclick="window.lukkApnePameldingModal()">Avbryt</button>
      </div>
    </div>`);
}

window.apneAdminPamelding = function () {
  window.krevAdmin('Åpne påmelding', 'Bekreft med PIN for å åpne en ny påmeldingsrunde.', () => {
    sikreApneRundeModal();
    document.getElementById('apne-pamelding-tittel').value = '';
    document.getElementById('apne-pamelding-spor').innerHTML = ALLE_KONKURRANSER.map(k => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:14px">
        <input type="checkbox" id="apne-pamelding-spor-${k}">${escHtml(KONKURRANSE_NAVN[k] ?? k)}
      </label>
    `).join('');
    document.getElementById('modal-apne-pamelding').style.display = 'flex';
  });
};

window.lukkApnePameldingModal = function () {
  const modal = document.getElementById('modal-apne-pamelding');
  if (modal) modal.style.display = 'none';
};

window.lagreApneRunde = async function () {
  const aktiveSpor = ALLE_KONKURRANSER.filter(k => document.getElementById(`apne-pamelding-spor-${k}`)?.checked);
  if (!aktiveSpor.length) {
    visMelding('Velg minst én aktivitet', 'advarsel');
    return;
  }
  const tittel = document.getElementById('apne-pamelding-tittel').value.trim() || 'Påmelding';
  const knapp = document.getElementById('apne-pamelding-lagre-knapp');
  knapp.disabled = true;
  knapp.textContent = 'Åpner…';

  try {
    await pameldingRepo.apneRunde(hentAktivKlubbId(), tittel, aktiveSpor);
    window.lukkApnePameldingModal();
    visMelding('Påmelding åpnet');
    await oppdaterHjemPamelding();
  } catch (e) {
    console.error('[pamelding] Kunne ikke åpne runde:', e);
    visMelding('Noe gikk galt', 'feil');
  } finally {
    knapp.disabled = false;
    knapp.textContent = 'Åpne påmelding';
  }
};

window.lukkAdminPamelding = function () {
  window.krevAdmin('Lukk påmelding', 'Bekreft med PIN for å lukke påmeldingsrunden.', async () => {
    try {
      await pameldingRepo.lukkRunde(hentAktivKlubbId());
      visMelding('Påmelding lukket');
      await oppdaterHjemPamelding();
    } catch (e) {
      console.error('[pamelding] Kunne ikke lukke runde:', e);
      visMelding('Noe gikk galt', 'feil');
    }
  });
};

// ════════════════════════════════════════════════════════
// SPILLER — MELD INTERESSE (offentlig, ingen PIN)
// ════════════════════════════════════════════════════════

let valgtSpor = null;

// ════════════════════════════════════════════════════════
// HUSKET SPILLER — lagrer siste "Hvem er du?"-valg per klubb i
// localStorage, slik at spilleren slipper å velge seg selv på nytt hver
// gang en ny påmeldingsrunde åpnes. Samme mønster som admin-PIN-
// lagringen i admin.js (pb_admin_{klubbId}) -- skoped per klubb, slik at
// et klubbytte på samme enhet aldri forhåndsutfyller feil spiller.
// ════════════════════════════════════════════════════════
function husketSpillerNokkel(klubbId) {
  return `pb_husket_spiller_${klubbId}`;
}

function hentHusketSpillerId(klubbId) {
  return localStorage.getItem(husketSpillerNokkel(klubbId)) || '';
}

function huskSpillerId(klubbId, spillerId) {
  if (spillerId) localStorage.setItem(husketSpillerNokkel(klubbId), spillerId);
  else localStorage.removeItem(husketSpillerNokkel(klubbId));
}

function sikreMeldInteresseModal() {
  if (document.getElementById('modal-meld-interesse')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bakgrunn" id="modal-meld-interesse" style="display:none" onclick="if(event.target===this)window.lukkMeldInteresse()">
      <div class="modal">
        <div class="modal-tittel" id="meld-interesse-tittel">Påmelding</div>
        <div style="font-size:13px;color:var(--muted2);margin-bottom:8px">Velg aktivitet</div>
        <div id="meld-interesse-spor" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px"></div>
        <div style="font-size:13px;color:var(--muted2);margin-bottom:8px">Hvem er du?</div>
        <select id="meld-interesse-spiller" style="width:100%;margin-bottom:16px"></select>
        <button class="knapp knapp-primaer" style="width:100%;margin-bottom:10px" id="meld-interesse-lagre-knapp" onclick="window.lagreMeldInteresse()">Meld meg på</button>
        <div id="meld-interesse-status" style="font-size:12.5px;color:var(--muted2);text-align:center;margin-bottom:10px"></div>
        <button class="knapp knapp-omriss" style="width:100%" onclick="window.lukkMeldInteresse()">Lukk</button>
      </div>
    </div>`);
}

function byggSporRad(konkurranse, antall, erValgt) {
  return `
    <div onclick="window.velgPameldingSpor('${konkurranse}')"
         style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;cursor:pointer;
                background:${erValgt ? 'rgba(59,130,246,.15)' : 'var(--navy2)'};
                border:1px solid ${erValgt ? 'var(--accent2)' : 'var(--border2)'}">
      <span style="flex:1;font-size:14px">${escHtml(KONKURRANSE_NAVN[konkurranse] ?? konkurranse)}</span>
      <span style="font-size:12px;color:var(--muted2)">${antall} påmeldt</span>
    </div>`;
}

async function tegnMeldInteresseInnhold(klubbId, runde) {
  const [interesseListe, spillerKart] = await Promise.all([
    pameldingRepo.hentInteresseForRunde(klubbId, runde.rundeId),
    hentSpillerKart(),
  ]);

  const antallPerSpor = {};
  interesseListe.forEach(i => { antallPerSpor[i.konkurranse] = (antallPerSpor[i.konkurranse] ?? 0) + 1; });

  document.getElementById('meld-interesse-tittel').textContent = runde.tittel || 'Påmelding';
  document.getElementById('meld-interesse-spor').innerHTML = (runde.aktiveSpor ?? [])
    .map(k => byggSporRad(k, antallPerSpor[k] ?? 0, k === valgtSpor)).join('');

  const alternativer = [...spillerKart.entries()].sort((a, b) => a[1].localeCompare(b[1], 'no'));
  const select = document.getElementById('meld-interesse-spiller');
  select.innerHTML = `<option value="">— Velg deg selv —</option>` +
    alternativer.map(([id, navn]) => `<option value="${id}">${escHtml(navn)}</option>`).join('');

  // Forhåndsutfyll med sist husket spiller for DENNE klubben, forutsatt
  // at spilleren fortsatt finnes (kan ha blitt slettet av admin siden
  // sist -- se slettSpillerBekreft() i screens-ratingLists.js).
  const husketId = hentHusketSpillerId(klubbId);
  if (husketId && spillerKart.has(husketId)) select.value = husketId;

  select.onchange = () => {
    huskSpillerId(klubbId, select.value);
    visMinPameldingStatus(klubbId, runde.rundeId);
  };

  document.getElementById('meld-interesse-status').textContent = '';
  // Vis status med det samme dersom vi forhåndsutfylte -- ellers ser ikke
  // spilleren at hen allerede er påmeldt før hen trykker noe selv.
  if (select.value) await visMinPameldingStatus(klubbId, runde.rundeId);
}

/**
 * Viser "du er påmeldt X" KUN hvis spillerens siste registrering faktisk
 * tilhører DENNE runden -- interesse-dokumentet er ett per klubb+spiller
 * (ikke ett per runde, se repository-filen), så uten denne sjekken ville
 * en gammel påmelding fra en tidligere, lukket runde feilaktig vist seg
 * som om spilleren var påmeldt den nye, åpne runden.
 */
async function visMinPameldingStatus(klubbId, rundeId) {
  const spillerId = document.getElementById('meld-interesse-spiller')?.value;
  const statusEl = document.getElementById('meld-interesse-status');
  if (!spillerId) { statusEl.innerHTML = ''; return; }

  const egen = await pameldingRepo.hentEgenPamelding(klubbId, spillerId);
  if (egen && egen.rundeId === rundeId) {
    statusEl.innerHTML = `Du er påmeldt ${escHtml(KONKURRANSE_NAVN[egen.konkurranse] ?? egen.konkurranse)} · <span style="color:#f87171;cursor:pointer;text-decoration:underline" onclick="window.meldMegAv()">Meld av</span>`;
  } else {
    statusEl.textContent = '';
  }
}

window.velgPameldingSpor = async function (konkurranse) {
  valgtSpor = konkurranse;
  const klubbId = hentAktivKlubbId();
  const runde = await pameldingRepo.hentRunde(klubbId);
  if (runde) await tegnMeldInteresseInnhold(klubbId, runde);
};

window.apneMeldInteresse = async function () {
  const klubbId = hentAktivKlubbId();
  const runde = await pameldingRepo.hentRunde(klubbId);
  if (!runde || runde.status !== 'apen') {
    visMelding('Ingen åpen påmelding akkurat nå', 'advarsel');
    return;
  }
  sikreMeldInteresseModal();
  valgtSpor = runde.aktiveSpor?.[0] ?? null;
  await tegnMeldInteresseInnhold(klubbId, runde);
  document.getElementById('modal-meld-interesse').style.display = 'flex';
};

window.lukkMeldInteresse = function () {
  const modal = document.getElementById('modal-meld-interesse');
  if (modal) modal.style.display = 'none';
};

window.lagreMeldInteresse = async function () {
  const spillerId = document.getElementById('meld-interesse-spiller')?.value;
  if (!spillerId) {
    visMelding('Velg hvem du er', 'advarsel');
    return;
  }
  if (!valgtSpor) {
    visMelding('Velg en aktivitet', 'advarsel');
    return;
  }
  const klubbId = hentAktivKlubbId();
  const runde = await pameldingRepo.hentRunde(klubbId);
  if (!runde || runde.status !== 'apen') {
    visMelding('Påmeldingen er ikke lenger åpen', 'feil');
    return;
  }

  const knapp = document.getElementById('meld-interesse-lagre-knapp');
  knapp.disabled = true;
  knapp.textContent = 'Melder på…';
  try {
    await pameldingRepo.meldPa(klubbId, runde.rundeId, spillerId, valgtSpor);
    huskSpillerId(klubbId, spillerId); // sikkerhetsnett -- dekker første gangs valg uten select.onchange
    visMelding('Du er påmeldt!');
    await tegnMeldInteresseInnhold(klubbId, runde);
    await visMinPameldingStatus(klubbId, runde.rundeId);
  } catch (e) {
    console.error('[pamelding] Kunne ikke melde på:', e);
    visMelding('Noe gikk galt', 'feil');
  } finally {
    knapp.disabled = false;
    knapp.textContent = 'Meld meg på';
  }
};

window.meldMegAv = async function () {
  const spillerId = document.getElementById('meld-interesse-spiller')?.value;
  if (!spillerId) return;
  const klubbId = hentAktivKlubbId();
  try {
    await pameldingRepo.meldAv(klubbId, spillerId);
    visMelding('Meldt av');
    const runde = await pameldingRepo.hentRunde(klubbId);
    if (runde) await tegnMeldInteresseInnhold(klubbId, runde);
  } catch (e) {
    console.error('[pamelding] Kunne ikke melde av:', e);
    visMelding('Noe gikk galt', 'feil');
  }
};
