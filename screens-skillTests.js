// ════════════════════════════════════════════════════════
// screens-skillTests.js — Ferdighetstester: registrering, visning i
// spillerprofil, og admin-terskler.
//
// Legger seg IKKE inn i index.html -- all ny UI bygges og injiseres fra
// denne filen, inn i containere som allerede finnes (spillerprofil-
// modalen fra screens-ratingLists.js, og admin-seksjon-boks). Dette er
// bevisst, for å unngå å røre en HTML-fil med struktur andre skjermer
// er avhengige av.
//
// window.apneSpillerprofil pakkes inn (ikke overskrevet) slik at den
// opprinnelige spillerprofil-visningen i screens-ratingLists.js fortsatt
// kjører uendret -- vi legger bare til testseksjonen etterpå.
// ════════════════════════════════════════════════════════

import { escHtml, visMelding } from './ui.js';
import { hentSpillerKart, hentAktivKlubbId } from './state.js';
import { getErAdmin } from './admin.js';
import { lagFirestoreTestRepository } from './domain-repository-firestoreTestRepository.js';
import { beregnSnitt, beregnProsent, finnNiva } from './domain-tests-nivaVurdering.js';
import { ALLE_TESTER, TEST_NAVN, TEST_MALEMETODE, NIVA_NAVN } from './domain-tests-constants.js';

const testRepo = lagFirestoreTestRepository();

const TEST_IKON = {
  dink_rally: '🎯', volley_rally: '⚡', transition_3rd_shot: '🛡️',
};
const TEST_FARGE = {
  dink_rally: '#22c55e', volley_rally: '#f97316', transition_3rd_shot: '#3b82f6',
};

// ════════════════════════════════════════════════════════
// SPILLERPROFIL — testseksjon injisert etter historikk-listen
// ════════════════════════════════════════════════════════

function sikreFerdighetstesterContainer() {
  let container = document.getElementById('spillerprofil-ferdighetstester');
  if (container) return container;
  const historikk = document.getElementById('spillerprofil-historikk');
  if (!historikk) return null;
  container = document.createElement('div');
  container.id = 'spillerprofil-ferdighetstester';
  container.style.marginBottom = '16px';
  historikk.insertAdjacentElement('afterend', container);
  return container;
}

function formaterEnhet(testType, verdi) {
  return TEST_MALEMETODE[testType].type === 'prosent' ? `${verdi}%` : `${verdi}`;
}

function byggSoyler(historikk, testType) {
  const siste3 = historikk.slice(-3);
  if (siste3.length === 0) return '<div style="font-size:12px;color:var(--muted)">Ingen tester registrert ennå</div>';

  const maks = Math.max(...siste3.map(h => h.verdi), 1);
  const farge = TEST_FARGE[testType];
  const barer = siste3.map((h, i) => {
    const erSiste = i === siste3.length - 1;
    const hoyde = Math.max(6, Math.round((h.verdi / maks) * 40));
    const opasitet = erSiste ? 1 : 0.25 + i * 0.15;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="width:20px;height:${hoyde}px;border-radius:4px 4px 0 0;background:${farge};opacity:${opasitet}"></div>
        <span style="font-size:10px;color:${erSiste ? 'var(--white)' : 'var(--muted)'};font-weight:${erSiste ? 600 : 400}">${formaterEnhet(testType, h.verdi)}</span>
      </div>`;
  }).join('');

  let trend = '';
  if (siste3.length >= 2) {
    const diff = siste3[siste3.length - 1].verdi - siste3[0].verdi;
    const pil = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const tekstFarge = diff > 0 ? '#4ade80' : diff < 0 ? '#f87171' : 'var(--muted2)';
    trend = `
      <div style="flex:1;text-align:right;align-self:center">
        <div style="font-size:11px;color:${tekstFarge};font-weight:600">${pil} ${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10}</div>
        <div style="font-size:10px;color:var(--muted)">siste ${siste3.length} ${siste3.length === 1 ? 'test' : 'tester'}</div>
      </div>`;
  }

  return `<div style="display:flex;align-items:flex-end;gap:10px;height:56px">${barer}${trend}</div>`;
}

function byggTestKort(testType, data) {
  const navn = TEST_NAVN[testType];
  const ikon = TEST_IKON[testType];
  const farge = TEST_FARGE[testType];

  if (!data) {
    return `
      <div style="background:#0b1626;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span>${ikon}</span>
          <span style="font-size:13px;color:var(--white);flex:1">${escHtml(navn)}</span>
          <span style="font-size:11px;color:var(--muted)">Ikke testet</span>
        </div>
      </div>`;
  }

  return `
    <div style="background:#0b1626;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span>${ikon}</span>
        <span style="font-size:13px;color:var(--white);flex:1">${escHtml(navn)}</span>
        <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:${farge}2e;color:${farge}">
          Nivå ${data.gjeldendeNivaNummer} · ${escHtml(data.gjeldendeNivaNavn)}
        </span>
      </div>
      ${byggSoyler(data.historikk ?? [], testType)}
    </div>`;
}

async function visFerdighetstester(spillerId) {
  const container = sikreFerdighetstesterContainer();
  if (!container) return;
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter testresultater…</div>';

  try {
    const resultater = await Promise.all(ALLE_TESTER.map(t => testRepo.hentTestForSpiller(spillerId, t)));
    const kortHtml = ALLE_TESTER.map((t, i) => byggTestKort(t, resultater[i])).join('');

    const adminKnapp = getErAdmin()
      ? `<button class="knapp knapp-omriss knapp-liten" style="width:100%;margin-top:4px" onclick="window.apneRegistrerTest('${spillerId}')">Registrer test</button>`
      : '';

    container.innerHTML = `
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px">Ferdighetstester</div>
      ${kortHtml}
      ${adminKnapp}
    `;
  } catch (e) {
    console.error('[skillTests] Kunne ikke hente ferdighetstester:', e);
    container.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente ferdighetstester</div>';
  }
}

// Pakk inn den eksisterende apneSpillerprofil uten å røre screens-ratingLists.js.
// Kjøres når denne filen lastes -- app.js importerer screens-ratingLists.js
// FØR denne filen, så window.apneSpillerprofil er allerede satt her.
(function pakkInnSpillerprofil() {
  const opprinnelig = window.apneSpillerprofil;
  if (typeof opprinnelig !== 'function') {
    console.error('[skillTests] Fant ikke window.apneSpillerprofil -- sjekk import-rekkefølgen i app.js');
    return;
  }
  window.apneSpillerprofil = async function (spillerId) {
    await opprinnelig(spillerId);
    await visFerdighetstester(spillerId);
  };
})();

// ════════════════════════════════════════════════════════
// REGISTRER TEST (admin) — egen modal, bygget og injisert i body
// ════════════════════════════════════════════════════════

let regTestSpillerId = null;
let regTestTerskler = {};

function sikreRegistrerTestModal() {
  if (document.getElementById('modal-registrer-test')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bakgrunn" id="modal-registrer-test" style="display:none" onclick="if(event.target===this)window.lukkRegistrerTest()">
      <div class="modal">
        <div class="modal-tittel">Registrer test</div>
        <div class="modal-tekst" id="registrer-test-spillernavn"></div>
        <div id="registrer-test-innhold"></div>
        <button class="knapp knapp-primaer" style="width:100%;margin-top:14px" id="registrer-test-lagre-knapp" onclick="window.lagreRegistrertTest()">Lagre testresultat</button>
        <button class="knapp knapp-omriss" style="width:100%;margin-top:10px" onclick="window.lukkRegistrerTest()">Avbryt</button>
      </div>
    </div>`);
}

function byggRegistrerTestBlokk(testType) {
  const malemetode = TEST_MALEMETODE[testType];
  const farge = TEST_FARGE[testType];
  const header = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span>${TEST_IKON[testType]}</span>
      <span style="font-size:13.5px;font-weight:500;color:var(--white);flex:1">${escHtml(TEST_NAVN[testType])}</span>
      <span id="regtest-${testType}-badge" style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:${farge}2e;color:${farge}">–</span>
    </div>`;

  if (malemetode.type === 'snitt') {
    const felt = Array.from({ length: malemetode.antallForsok }, (_, i) => `
      <input type="number" min="0" inputmode="numeric" id="regtest-${testType}-${i}"
             oninput="window.oppdaterRegtestBadge('${testType}')"
             style="width:15%;text-align:center;font-family:'DM Mono',monospace" placeholder="0">
    `).join('');
    return `
      <div style="background:#0b1626;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px">
        ${header}
        <div style="display:flex;gap:6px;margin-bottom:6px">${felt}</div>
        <div style="font-size:11px;color:var(--muted)">Snitt: <span id="regtest-${testType}-verdi" style="font-family:'DM Mono',monospace;color:var(--white)">–</span></div>
      </div>`;
  }

  return `
    <div style="background:#0b1626;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px">
      ${header}
      <div style="display:flex;align-items:center;gap:10px">
        <input type="range" min="0" max="${malemetode.antallForsok}" value="0" id="regtest-${testType}-slider"
               oninput="window.oppdaterRegtestBadge('${testType}')" style="flex:1">
        <span style="font-size:12px;color:var(--muted2);min-width:64px;text-align:right">
          <span id="regtest-${testType}-antall">0</span> av ${malemetode.antallForsok}
        </span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">Prosent: <span id="regtest-${testType}-verdi" style="font-family:'DM Mono',monospace;color:var(--white)">–</span></div>
    </div>`;
}

function lesRegtestVerdi(testType) {
  const malemetode = TEST_MALEMETODE[testType];
  if (malemetode.type === 'snitt') {
    const forsok = Array.from({ length: malemetode.antallForsok }, (_, i) =>
      Number(document.getElementById(`regtest-${testType}-${i}`)?.value) || 0);
    return { verdi: beregnSnitt(forsok), forsok, antallVellykket: null, antallForsok: null };
  }
  const antallVellykket = Number(document.getElementById(`regtest-${testType}-slider`)?.value) || 0;
  return {
    verdi: beregnProsent(antallVellykket, malemetode.antallForsok),
    forsok: null, antallVellykket, antallForsok: malemetode.antallForsok,
  };
}

window.oppdaterRegtestBadge = function (testType) {
  const malemetode = TEST_MALEMETODE[testType];
  const { verdi, antallVellykket } = lesRegtestVerdi(testType);

  if (malemetode.type === 'prosent') {
    document.getElementById(`regtest-${testType}-antall`).textContent = antallVellykket;
  }
  document.getElementById(`regtest-${testType}-verdi`).textContent = formaterEnhet(testType, verdi);

  const terskler = regTestTerskler[testType] ?? [];
  const { nivaNummer, nivaNavn } = finnNiva(verdi, terskler);
  const badge = document.getElementById(`regtest-${testType}-badge`);
  badge.textContent = `Nivå ${nivaNummer} · ${nivaNavn}`;
};

window.apneRegistrerTest = function (spillerId) {
  window.krevAdmin('Registrer test', 'Bekreft med PIN for å registrere testresultat.', async () => {
    sikreRegistrerTestModal();
    regTestSpillerId = spillerId;

    const spillerKart = await hentSpillerKart();
    document.getElementById('registrer-test-spillernavn').textContent = spillerKart.get(spillerId) ?? spillerId;

    const klubbId = hentAktivKlubbId();
    const terskelListe = await Promise.all(ALLE_TESTER.map(t => testRepo.hentTerskler(klubbId, t)));
    ALLE_TESTER.forEach((t, i) => { regTestTerskler[t] = terskelListe[i]; });

    document.getElementById('registrer-test-innhold').innerHTML = ALLE_TESTER.map(byggRegistrerTestBlokk).join('');
    ALLE_TESTER.forEach(t => window.oppdaterRegtestBadge(t));

    document.getElementById('modal-registrer-test').style.display = 'flex';
  });
};

window.lukkRegistrerTest = function () {
  const modal = document.getElementById('modal-registrer-test');
  if (modal) modal.style.display = 'none';
  regTestSpillerId = null;
};

window.lagreRegistrertTest = async function () {
  if (!regTestSpillerId) return;
  const knapp = document.getElementById('registrer-test-lagre-knapp');
  knapp.disabled = true;
  knapp.textContent = 'Lagrer…';

  try {
    const klubbId = hentAktivKlubbId();
    await Promise.all(ALLE_TESTER.map(testType => {
      const { verdi, forsok, antallVellykket, antallForsok } = lesRegtestVerdi(testType);
      const { nivaNummer, nivaNavn } = finnNiva(verdi, regTestTerskler[testType] ?? []);
      return testRepo.lagreTestresultat({
        spillerId: regTestSpillerId, klubbId, testType,
        forsok, antallVellykket, antallForsok,
        verdi, nivaNummer, nivaNavn,
      });
    }));

    const ferdigSpillerId = regTestSpillerId;
    window.lukkRegistrerTest();
    visMelding('Testresultat lagret');
    await visFerdighetstester(ferdigSpillerId);
  } catch (e) {
    console.error('[skillTests] Kunne ikke lagre testresultat:', e);
    visMelding('Noe gikk galt', 'feil');
  } finally {
    knapp.disabled = false;
    knapp.textContent = 'Lagre testresultat';
  }
};

// ════════════════════════════════════════════════════════
// ADMIN — SETT TESTGRENSER
// Knapp injiseres i admin-seksjon-boks (samme boks som "Slett rating"),
// som allerede er PIN-gatet av visAdminSeksjon() -- ingen ny krevAdmin
// nødvendig her, samme mønster som slettRatingBekreft() i
// screens-ratingLists.js.
// ════════════════════════════════════════════════════════

function sikreTestgrenserKnapp() {
  const adminBoks = document.getElementById('admin-seksjon-boks');
  if (!adminBoks || document.getElementById('apne-testgrenser-btn')) return;
  adminBoks.insertAdjacentHTML('beforeend', `
    <div style="height:1px;background:var(--border2);margin:14px 0"></div>
    <button class="knapp knapp-omriss knapp-liten" style="width:100%" id="apne-testgrenser-btn" onclick="window.apneTestgrenser()">Sett testgrenser</button>
  `);
}

function sikreTestgrenserModal() {
  if (document.getElementById('modal-testgrenser')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bakgrunn" id="modal-testgrenser" style="display:none" onclick="if(event.target===this)window.lukkTestgrenser()">
      <div class="modal">
        <div class="modal-tittel">Sett testgrenser</div>
        <div class="modal-tekst">Nivå 1 starter alltid på 0. Sett hvor mange (eller hvor mange %) som kreves for nivå 2, 3 og 4.</div>
        <div id="testgrenser-innhold"></div>
        <button class="knapp knapp-primaer" style="width:100%;margin-top:14px" id="testgrenser-lagre-knapp" onclick="window.lagreTestgrenser()">Lagre grenser</button>
        <button class="knapp knapp-omriss" style="width:100%;margin-top:10px" onclick="window.lukkTestgrenser()">Avbryt</button>
      </div>
    </div>`);
}

function byggTestgrenserBlokk(testType, grenser) {
  const malemetode = TEST_MALEMETODE[testType];
  const enhet = malemetode.type === 'prosent' ? '%' : 'snitt';
  const finn = niva => grenser.find(g => g.niva === niva)?.min ?? 0;

  const feltHtml = [2, 3, 4].map(niva => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:12px;color:var(--muted2);width:120px">Nivå ${niva} · ${escHtml(NIVA_NAVN[niva])}</span>
      <input type="number" min="0" id="testgrense-${testType}-${niva}" value="${finn(niva)}"
             style="width:70px;text-align:center;font-family:'DM Mono',monospace">
      <span style="font-size:12px;color:var(--muted)">${enhet}</span>
    </div>
  `).join('');

  return `
    <div style="background:#0b1626;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span>${TEST_IKON[testType]}</span>
        <span style="font-size:13.5px;font-weight:500;color:var(--white)">${escHtml(TEST_NAVN[testType])}</span>
      </div>
      ${feltHtml}
    </div>`;
}

window.apneTestgrenser = async function () {
  sikreTestgrenserModal();
  const klubbId = hentAktivKlubbId();
  const terskelListe = await Promise.all(ALLE_TESTER.map(t => testRepo.hentTerskler(klubbId, t)));

  document.getElementById('testgrenser-innhold').innerHTML =
    ALLE_TESTER.map((t, i) => byggTestgrenserBlokk(t, terskelListe[i])).join('');

  document.getElementById('modal-testgrenser').style.display = 'flex';
};

window.lukkTestgrenser = function () {
  const modal = document.getElementById('modal-testgrenser');
  if (modal) modal.style.display = 'none';
};

window.lagreTestgrenser = async function () {
  const knapp = document.getElementById('testgrenser-lagre-knapp');
  knapp.disabled = true;
  knapp.textContent = 'Lagrer…';

  try {
    const klubbId = hentAktivKlubbId();
    await Promise.all(ALLE_TESTER.map(testType => {
      const grenser = [{ niva: 1, min: 0 }, ...[2, 3, 4].map(niva => ({
        niva, min: Number(document.getElementById(`testgrense-${testType}-${niva}`)?.value) || 0,
      }))];
      return testRepo.lagreTerskler(klubbId, testType, grenser);
    }));
    window.lukkTestgrenser();
    visMelding('Testgrenser lagret');
  } catch (e) {
    console.error('[skillTests] Kunne ikke lagre testgrenser:', e);
    visMelding('Noe gikk galt', 'feil');
  } finally {
    knapp.disabled = false;
    knapp.textContent = 'Lagre grenser';
  }
};

// admin-seksjon-boks finnes i DOM fra sideinnlasting (index.html), men
// er skjult til visAdminSeksjon() åpner den -- trygt å injisere knappen
// med det samme denne modulen lastes.
sikreTestgrenserKnapp();
