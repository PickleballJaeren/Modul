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
  pinInput, bekreftPin, lukkPinModal, registrerAdminStatusHook,
} from './admin.js';

import { lagRatingService } from './domain-rating-ratingService.js';
import { beregnRatingEndringer } from './domain-rating-pairwiseAverageElo.js';
import * as provisionalPolicy from './domain-rating-provisionalPolicy.js';
import * as baneStrategi from './domain-rating-courtAssignment.js';
import * as allroundKalkulator from './domain-rating-allroundCalculator.js';
import { lagFirestoreRatingRepository } from './domain-repository-firestoreRatingRepository.js';
import {
  settRatingService, settAktivKlubbId,
  lyttPaaAktivOkt, stoppAktivOktLytting, gjenopprettOktLokalt, flettInnSpillerNavn, forsteSporData,
} from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';

import { visKonkurranser, IKON } from './screens-competitions.js';
import { visRatinglister, oppdaterAdminSynlighetRatingliste } from './screens-ratingLists.js';
import { visArkiv } from './screens-archive.js';
// registerPlayers.js kobler seg selv til window.* og importeres
// transitivt via competitions.js. activeSession.js og registerFinish.js
// trenger navngitte imports her for gjenoppta-/live-oppdateringslogikken.
import './screens-registerPlayers.js';
import { visAktivOkt, oppdaterAktivOktVisning } from './screens-activeSession.js';
import { visRegistrerSluttbane, oppdaterSluttbaneVisning } from './screens-registerFinish.js';
import { visOktResultat } from './screens-oktResultat.js';
// screens-skillTests.js kobler seg selv til window.* og pakker inn
// window.apneSpillerprofil (se filen) -- MÅ importeres etter
// screens-ratingLists.js, som er importert lenger opp i denne filen.
import './screens-skillTests.js';
// screens-pamelding.js kobler seg selv til window.* og injiserer UI i
// hjem-klubb-handlinger -- ingen rekkefølgekrav mot andre screens-import.
import './screens-pamelding.js';

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
    stoppAktivOktLytting();
    oppdaterPagaendeOktUI(null);
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
  lyttPaaAktivOkt(klubbId, haandterAktivOktEndring);
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
  oppdaterAdminUI();
}
window.getErAdmin = getErAdmin;

// ════════════════════════════════════════════════════════
// ADMIN-LÅS — ett globalt lås-ikon (se index.html), synlig så snart en
// klubb er valgt. Eksisterer FORDI admin-forbeholdte knapper nå er
// skjult i stedet for bare PIN-gatet på trykk (se oppdaterAdminUI()) --
// uten dette ville en admin som ikke har lukket opp ennå på denne
// enheten aldri hatt noe å trykke på for å komme i gang.
// ════════════════════════════════════════════════════════
window.apneAdminLas = function () {
  if (!aktivKlubbId) {
    visMelding('Velg klubb først', 'advarsel');
    return;
  }
  if (getErAdmin()) {
    if (confirm('Låse admin-tilgangen på denne enheten igjen?')) {
      nullstillAdmin();
      visMelding('Admin låst');
    }
    return;
  }
  krevAdminMedDemo('Lås opp admin', 'Skriv inn PIN for å vise admin-handlinger.', () => {
    setErAdmin(true); // no-op om allerede satt via ekte PIN -- fanger demo-bypass-veien, som ellers ikke setter den
    visMelding('Admin låst opp');
  });
};

/**
 * Kalles hver gang admin-status faktisk endrer seg (registrert som hook
 * i admin.js), OG hver gang klubb byttes -- oppdaterer lås-ikonet,
 * hjemskjermens admin-knapper, og gjenoppbygger hvilken som helst av de
 * andre skjermene som selv viser/skjuler admin-elementer, dersom den
 * skjermen er den som faktisk vises akkurat nå.
 */
function oppdaterAdminUI() {
  const erAdmin = getErAdmin();

  const lasBtn = document.getElementById('admin-las-btn');
  if (lasBtn) lasBtn.style.display = aktivKlubbId ? 'flex' : 'none';
  const lasIkon = document.getElementById('admin-las-ikon');
  if (lasIkon) lasIkon.textContent = erAdmin ? '🔓' : '🔒';

  const startKnapp = document.getElementById('hjem-start-okt-btn');
  if (startKnapp) startKnapp.style.display = (aktivKlubbId && erAdmin) ? 'block' : 'none';
  // Del appen (QR/lenke) skjules i tillegg alltid for demo-klubben, selv
  // om den automatisk regnes som "admin" -- demo skal ikke kunne dele
  // videre, siden hvem som helst kan velge demo uten PIN.
  const delWrapper = document.getElementById('hjem-del-appen-wrapper');
  if (delWrapper) delWrapper.style.display = (aktivKlubbId && erAdmin && !getAktivKlubb()?.demo) ? 'block' : 'none';
  if (!erAdmin) {
    const delBoks = document.getElementById('del-appen-boks');
    if (delBoks) delBoks.style.display = 'none';
    const adminBoks = document.getElementById('admin-seksjon-boks');
    if (adminBoks) adminBoks.style.display = 'none';
  }

  // Gjenoppbygg admin-avhengige deler av skjermen som faktisk vises nå.
  if (document.getElementById('skjerm-aktiv-okt')?.classList.contains('active')) oppdaterAktivOktVisning();
  if (document.getElementById('skjerm-registrer-sluttbane')?.classList.contains('active')) oppdaterSluttbaneVisning();
  if (document.getElementById('skjerm-ratinglister')?.classList.contains('active')) oppdaterAdminSynlighetRatingliste();
}
registrerAdminStatusHook(oppdaterAdminUI);

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

// live.html er en helt egen, selvstendig side (se live.js) -- egen
// lenke per klubb, ingen PIN, kun skrivebeskyttet baneliste/resultat.
function liveLenkeUrl() {
  return new URL(`live.html?klubb=${encodeURIComponent(aktivKlubbId)}`, location.href).href;
}

function renderLiveQR() {
  const container = document.getElementById('hjem-live-qr');
  if (!container || typeof qrcode === 'undefined' || !aktivKlubbId) return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(liveLenkeUrl());
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
    const svg = container.querySelector('svg');
    if (svg) { svg.style.width = '160px'; svg.style.height = '160px'; svg.style.display = 'block'; }
  } catch (e) {
    console.warn('[QR] Kunne ikke generere live-QR:', e?.message);
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

window.kopierLiveLenke = async function () {
  if (!aktivKlubbId) return;
  const url = liveLenkeUrl();
  try {
    await navigator.clipboard.writeText(url);
    visMelding('Lenke til live baneliste kopiert!');
  } catch (e) {
    prompt('Kopier lenken manuelt:', url);
  }
};

window.visDelAppenSeksjon = function () {
  if (!aktivKlubbId) {
    visMelding('Velg klubb først for å dele appen', 'advarsel');
    return;
  }
  if (getAktivKlubb()?.demo) {
    visMelding('Demo-klubben kan ikke dele appen videre', 'advarsel');
    return;
  }
  krevAdminMedDemo('Del appen', 'Kun admin kan vise QR-koden og lenken til appen.', () => {
    const boks = document.getElementById('del-appen-boks');
    if (boks) boks.style.display = 'block';
    renderHjemQR();
    renderLiveQR();
  });
};

// Eksponerer klubbnavn for andre moduler (f.eks. ratingLists.js sin
// Administrasjon-seksjon), slik at KLUBBER-oppslaget forblir samlet her.
window.hentAktivKlubbNavn = function () { return getAktivKlubb()?.navn ?? null; };

// ════════════════════════════════════════════════════════
// PÅGÅENDE ØKT — vises på hjemskjermen for ALLE med appen åpen på
// klubben (admin eller ikke), basert på sanntidslytting fra
// lyttPaaAktivOkt() (state.js). Gir fire ting:
//  1) Admin kan lukke/gjenåpne appen uten at en påbegynt økt forsvinner.
//  2) Andre (delt via QR/lenke) ser at en økt pågår, og kan følge den
//     helt skrivebeskyttet frem til de ev. oppgir PIN (selve skrive-
//     handlingene er PIN-gatet der de utføres, se screens-activeSession.js
//     / screens-registerFinish.js).
//  3) Om noen allerede STÅR på aktiv-økt/sluttbane-skjermen når
//     dataene endrer seg et annet sted, oppdateres visningen live.
//  4) Når admin trykker "Fullfør økt", får alle som fulgte den live
//     automatisk se resultatskjermen også (status: 'fullfort', se
//     fullforAktivOktISky() i state.js) -- ikke bare admin selv.
// ════════════════════════════════════════════════════════
let sisteAktivOktData = null;

function oppdaterPagaendeOktUI(data) {
  sisteAktivOktData = data;
  const kort = document.getElementById('hjem-pagaende-okt');
  if (!kort) return;
  if (!data) { kort.style.display = 'none'; return; }

  kort.style.display = 'flex';
  const spor = forsteSporData(data);
  document.getElementById('pagaende-okt-ikon').textContent = IKON[spor.konkurranse] ?? '🏓';
  document.getElementById('pagaende-okt-navn').textContent = KONKURRANSE_NAVN[spor.konkurranse] ?? spor.konkurranse;

  const badge = document.getElementById('pagaende-okt-badge');
  if (data.status === 'fullfort') {
    document.getElementById('pagaende-okt-sub').textContent = 'Resultat klart';
    if (badge) badge.textContent = 'Ferdig';
  } else {
    const antall = spor.plasseringer?.length ?? 0;
    const totalt = spor.deltakerIder?.length ?? 0;
    document.getElementById('pagaende-okt-sub').textContent = antall > 0
      ? `${antall} av ${totalt} plassert`
      : `${totalt} spillere · baner satt opp`;
    if (badge) badge.textContent = 'Aktiv';
  }
}

function haandterAktivOktEndring(data) {
  oppdaterPagaendeOktUI(data);

  const paAktivOktSkjerm = document.getElementById('skjerm-aktiv-okt')?.classList.contains('active');
  const paSluttbaneSkjerm = document.getElementById('skjerm-registrer-sluttbane')?.classList.contains('active');

  if (data?.status === 'fullfort') {
    // Noen fullførte økten -- vis resultatet automatisk for alle som
    // aktivt fulgte den (baneliste/sluttbane), uten å forstyrre noen
    // som er et annet sted i appen (f.eks. arkiv eller ratinglister).
    // flettInnSpillerNavn() dekker manuelt tillagte spillere, som ikke
    // finnes i players-samlingen (se navnFor() i state.js).
    flettInnSpillerNavn(data.spillerNavn);
    if (paAktivOktSkjerm || paSluttbaneSkjerm) visOktResultat(data.resultat);
    return;
  }

  // Om noen akkurat nå står og ser på en av de to live-skjermene, hold
  // visningen oppdatert -- uten å navigere/scrolle (se
  // oppdaterAktivOktVisning()/oppdaterSluttbaneVisning()).
  if (!paAktivOktSkjerm && !paSluttbaneSkjerm) return;

  if (data) {
    gjenopprettOktLokalt(data);
    if (paSluttbaneSkjerm) oppdaterSluttbaneVisning();
    else oppdaterAktivOktVisning();
  } else {
    // Økten forsvant (avbrutt et annet sted, eller resultatskjermen ble
    // lukket av noen andre) mens noen sto og fulgte den live.
    naviger('hjem');
    visMelding('Økten er ikke lenger aktiv');
  }
}

window.apnePagaendeOkt = function () {
  if (!sisteAktivOktData) return;
  if (sisteAktivOktData.status === 'fullfort') {
    flettInnSpillerNavn(sisteAktivOktData.spillerNavn);
    visOktResultat(sisteAktivOktData.resultat);
    return;
  }
  gjenopprettOktLokalt(sisteAktivOktData);
  const spor = forsteSporData(sisteAktivOktData);
  if ((spor.plasseringer?.length ?? 0) > 0) visRegistrerSluttbane();
  else visAktivOkt();
};

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
