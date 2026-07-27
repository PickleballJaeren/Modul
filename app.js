// ════════════════════════════════════════════════════════
// app.js — Oppstart, klubbvalg og modulkobling for 1 vs 1
// Samme mønster som app.js i Stafettligaen.
// ════════════════════════════════════════════════════════

import { db } from './firebase.js';
import { naviger, visMelding, visFBFeil, registrerBeforeunload } from './ui.js';
import {
  registrerPinGetter, registrerKlubbIdGetter,
  krevAdmin as krevAdminBase,
  getErAdmin, setErAdmin, gjenopprettAdminStatus, nullstillAdmin,
  pinInput, bekreftPin, lukkPinModal,
} from './admin.js';

import { lagRatingService } from './domain-rating-ratingService.js';
import { beregnRatingEndringer } from './domain-rating-pairwiseAverageElo.js';
import * as provisionalPolicy from './domain-rating-provisionalPolicy.js';
import * as baneStrategi from './domain-rating-courtAssignment.js';
import * as allroundKalkulator from './domain-rating-allroundCalculator.js';
import { lagFirestoreRatingRepository } from './domain-repository-firestoreRatingRepository.js';
import { settRatingService, settAktivKlubbId } from './state.js';

import { visKonkurranser } from './screens-competitions.js';
import { visRatinglister } from './screens-ratingLists.js';
import { visArkiv } from './screens-archive.js';
// registerPlayers.js, courtSetup.js, activeSession.js og registerFinish.js
// kobler seg selv til window.* og importeres transitivt via competitions.js
import './screens-registerPlayers.js';
import './screens-courtSetup.js';
import './screens-activeSession.js';
import './screens-registerFinish.js';

window.pinInput    = pinInput;
window.bekreftPin  = bekreftPin;
window.lukkPinModal = lukkPinModal;
window.naviger      = naviger;

// ════════════════════════════════════════════════════════
// KLUBBER — samme liste/PIN-oppsett som Stafettligaen, siden
// prosjektet (og dermed spillerlisten) er delt.
// ════════════════════════════════════════════════════════
const KLUBBER = {
  'pickleball-jaeren': { navn: 'Pickleball Jæren', pin: '9436', demo: false },
  'fokus-pickleball':  { navn: 'Fokus Pickleball',  pin: '4350', demo: false },
  'tsi-pickleball':    { navn: 'TSI Pickleball',    pin: '9299', demo: false },
  'loten-pickleball':  { navn: 'Løten Tennisklubb', pin: '2341', demo: false },
  'demo':              { navn: 'Demo',               pin: null,  demo: true  },
};

let aktivKlubbId = null;
function getAktivKlubb() { return aktivKlubbId ? (KLUBBER[aktivKlubbId] ?? null) : null; }
function getAdminPin() { return getAktivKlubb()?.pin ?? null; }
function krevAdminMedDemo(tittel, tekst, callback) {
  krevAdminBase(tittel, tekst, callback, !!getAktivKlubb()?.demo);
}
window.krevAdmin = krevAdminMedDemo;

window.byttKlubb = function (klubbId) {
  if (!klubbId || !KLUBBER[klubbId]) {
    aktivKlubbId = null;
    settAktivKlubbId(null);
    oppdaterKlubbUI();
    return;
  }
  const forrigeKlubbId = aktivKlubbId;
  aktivKlubbId = klubbId;
  settAktivKlubbId(klubbId);
  registrerKlubbIdGetter(() => aktivKlubbId);
  registrerPinGetter(getAdminPin);

  if (forrigeKlubbId && forrigeKlubbId !== klubbId) nullstillAdmin();

  const erAdminFraForrige = gjenopprettAdminStatus();
  if (!erAdminFraForrige) setErAdmin(KLUBBER[klubbId].demo);

  oppdaterKlubbUI();
  visMelding('Klubb valgt: ' + KLUBBER[klubbId].navn);
};

function oppdaterKlubbUI() {
  const klubb = getAktivKlubb();
  const velger = document.getElementById('klubb-velger');
  if (velger && aktivKlubbId) velger.value = aktivKlubbId;
  const demoInfo = document.getElementById('demo-info');
  if (demoInfo) demoInfo.style.display = klubb?.demo ? 'block' : 'none';
  const klubbHandlinger = document.getElementById('hjem-klubb-handlinger');
  if (klubbHandlinger) klubbHandlinger.style.display = aktivKlubbId ? 'flex' : 'none';
}
window.getErAdmin = getErAdmin;

// ════════════════════════════════════════════════════════
// DEL APPEN — QR-kode + kopier lenke
// ════════════════════════════════════════════════════════
function renderHjemQR() {
  const container = document.getElementById('hjem-qr');
  if (!container || typeof qrcode === 'undefined') return;
  const url = location.origin + location.pathname;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
    const svg = container.querySelector('svg');
    if (svg) { svg.style.width = '160px'; svg.style.height = '160px'; svg.style.display = 'block'; }
  } catch (e) {
    console.warn('[QR] Kunne ikke generere QR-kode:', e?.message);
  }
}

window.kopierAppLenke = async function () {
  const url = location.origin + location.pathname;
  try {
    await navigator.clipboard.writeText(url);
    visMelding('Lenke kopiert!');
  } catch (e) {
    prompt('Kopier lenken manuelt:', url);
  }
};

window.visDelAppenSeksjon = function () {
  if (!aktivKlubbId) {
    visMelding('Velg klubb først for å dele appen', 'advarsel');
    return;
  }
  krevAdminMedDemo('Del appen', 'Kun admin kan vise QR-koden og lenken til appen.', () => {
    const boks = document.getElementById('del-appen-boks');
    if (boks) boks.style.display = 'block';
    renderHjemQR();
  });
};

// Eksponerer klubbnavn for andre moduler (f.eks. ratingLists.js sin
// Administrasjon-seksjon), slik at KLUBBER-oppslaget forblir samlet her.
window.hentAktivKlubbNavn = function () { return getAktivKlubb()?.navn ?? null; };

// ════════════════════════════════════════════════════════
// HJEMSKJERM-HANDLINGER
// ════════════════════════════════════════════════════════
window.startNyOkt = function () {
  krevAdminMedDemo('Start ny økt', 'Kun admin kan starte en ny økt.', () => {
    visKonkurranser();
  });
};
window.visRatinglister = function () { visRatinglister(); };
window.visArkiv = function () { visArkiv(); };

// ════════════════════════════════════════════════════════
// RATING SERVICE — satt sammen med ekte avhengigheter, injisert inn
// i services.js slik at skjermene kan hente den uten å vite hvordan
// den er bygget (se ARKITEKTUR.md).
// ════════════════════════════════════════════════════════
settRatingService(lagRatingService({
  algoritme: beregnRatingEndringer,
  provisionalPolicy,
  baneStrategi,
  allroundKalkulator,
  repository: lagFirestoreRatingRepository(),
}));

// ════════════════════════════════════════════════════════
// LUKK "DEL APPEN"-BOKSEN VED NAVIGERING BORT FRA HJEM
// Slik at QR-koden ikke fortsatt står åpen neste gang man kommer
// tilbake til hjemskjermen.
// ════════════════════════════════════════════════════════
document.addEventListener('sl-naviger', e => {
  if (e.detail?.skjerm !== 'hjem') {
    const delBoks = document.getElementById('del-appen-boks');
    if (delBoks) delBoks.style.display = 'none';
  }
  if (e.detail?.skjerm !== 'ratinglister') {
    const adminBoks = document.getElementById('admin-seksjon-boks');
    if (adminBoks) adminBoks.style.display = 'none';
  }
});

// ════════════════════════════════════════════════════════
// OPPSTART
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (!db) {
    visFBFeil('Firebase er ikke konfigurert. Sjekk FB_CONFIG i firebase.js.');
    return;
  }

  registrerBeforeunload(() => false);

  const urlParams = new URLSearchParams(location.search);
  const urlKlubbId = urlParams.get('klubb');
  if (urlKlubbId && KLUBBER[urlKlubbId]) {
    window.byttKlubb(urlKlubbId);
  } else {
    naviger('hjem');
  }
});
