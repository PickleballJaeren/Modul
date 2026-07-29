// ════════════════════════════════════════════════════════
// state.js — all in-memory apptilstand samlet i én fil
//
// Tre tidligere separate filer (oktState, services, spillerCache) er
// slått sammen hit fordi ingen av dem representerer en beslutning som
// realistisk byttes ut uavhengig av de andre -- i motsetning til
// domain-rating-*.js-filene, som er bevisst holdt atskilt (se
// ARKITEKTUR.md) fordi DE representerer beslutninger du kan ville
// endre hver for seg (algoritme, baneoppsett, allround-metode).
// ════════════════════════════════════════════════════════

import {
  db, SAM, collection, query, where, getDocs,
  doc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
} from './firebase.js';

// ── Økt-tilstand ────────────────────────────────────────
// Admin gjør ingenting i appen mens selve treningen pågår (spillere
// flytter seg fysisk mellom baner uten at det registreres underveis) --
// denne delen holder styr på: hvem som er med, hvilke baner de startet
// på, og rekkefølgen admin trykker dem inn i ved slutten.
//
// FRA OG MED at baner er generert ("Start økt" trykket) speiles denne
// tilstanden også til Firestore (activeSessions/{klubbId}, se lenger
// ned i filen), slik at økten overlever en app-omstart og kan følges av
// andre enheter i sanntid. Før det (mens deltakere velges) er
// tilstanden fortsatt kun lokal -- det er en rask forberedelse der en
// omstart bare koster et par tastetrykk å gjenta. Selve rating-
// skrivingen (elo, historikk osv.) skjer fortsatt kun i
// ratingService.fullforOkt() ved slutt.

let okt = null;

export function startNyOkt(konkurranse) {
  okt = {
    konkurranse,
    deltakerIder: [],
    startBaner: null,   // settes rett etter "Start økt" trykkes i registrer-deltakere
    plasseringer: [],   // rekkefølge admin trykker spillere i ved sluttregistrering
  };
}

export function hentOkt() { return okt; }

export function erDeltaker(spillerId) {
  return !!okt?.deltakerIder.includes(spillerId);
}

export function veksleDeltaker(spillerId) {
  if (!okt) return;
  const i = okt.deltakerIder.indexOf(spillerId);
  if (i === -1) okt.deltakerIder.push(spillerId);
  else okt.deltakerIder.splice(i, 1);
}

export function settStartBaner(baner) {
  if (okt) okt.startBaner = baner;
}

/**
 * Bytter baneplassering mellom to spillere -- for manuell overstyring av
 * det automatisk genererte baneoppsettet (se veksleRedigeringsmodus() i
 * screens-activeSession.js). Ingen effekt om noen av spillerne ikke
 * finnes i startBaner, eller om de er samme spiller.
 */
export function byttSpillerePaBane(spillerIdA, spillerIdB) {
  if (!okt?.startBaner || spillerIdA === spillerIdB) return;
  const finnPosisjon = id => {
    for (const bane of okt.startBaner) {
      const i = bane.spillerIder.indexOf(id);
      if (i !== -1) return { bane, i };
    }
    return null;
  };
  const posA = finnPosisjon(spillerIdA);
  const posB = finnPosisjon(spillerIdB);
  if (!posA || !posB) return;
  const temp = posA.bane.spillerIder[posA.i];
  posA.bane.spillerIder[posA.i] = posB.bane.spillerIder[posB.i];
  posB.bane.spillerIder[posB.i] = temp;
}

export function plasserSpiller(spillerId) {
  if (!okt || okt.plasseringer.includes(spillerId)) return;
  okt.plasseringer.push(spillerId);
}

export function angreSisteePlassering() {
  if (okt) okt.plasseringer.pop();
}

export function erFerdigPlassert() {
  return !!okt && okt.plasseringer.length === okt.deltakerIder.length;
}

/** Regner ut sluttbane for hver plasserte spiller: to og to i trykkerekkefølge. */
export function beregnSluttbaner() {
  const map = new Map();
  okt.plasseringer.forEach((id, indeks) => map.set(id, Math.floor(indeks / 2) + 1));
  return map;
}

export function nullstillOkt() { okt = null; }

// ── Delt RatingService-instans ─────────────────────────
// Satt opp én gang i app.js med ekte avhengigheter (Firestore-repo,
// pairwise-algoritme osv.), hentet herfra av skjermene som trenger
// den. Holder skjermene fri for å vite HVORDAN servicen er satt sammen.

let ratingService = null;

export function settRatingService(instans) { ratingService = instans; }
export function hentRatingService() { return ratingService; }

// ── Delt spillercache (id -> navn) ─────────────────────
// Hentes filtrert på aktiv klubb (samme mønster som lyttere.js i
// Stafettligaen: where('klubbId', '==', aktivKlubbId)). Cachen
// nullstilles automatisk når klubb byttes, slik at man aldri kan få
// tilgang til en annen klubbs spillere ved et uhell.

let aktivKlubbId = null;
let spillerKart = null; // Map<spillerId, navn>, gyldig for aktivKlubbId

// Overlay-cache for spillernavn som IKKE finnes i players-samlingen --
// typisk manuelt tillagte spillere (se leggTilManuellSpiller() i
// screens-registerPlayers.js), som kun eksisterer i minnet til den som
// la dem til og aldri skrives til Firestore. Holdt ADSKILT fra
// spillerKart (i stedet for å skrive inn i den) fordi hentSpillerKart()
// bruker "spillerKart er satt" som signal på at den ALLEREDE har hentet
// fra Firestore -- om vi skrev inn her først ville det signalet blitt
// feilaktig utløst før det ekte oppslaget noen gang skjedde, og ekte
// spillernavn ville aldri blitt lastet for en tilskuer.
let ekstraSpillerNavn = new Map();

export function settAktivKlubbId(id) {
  if (id !== aktivKlubbId) {
    aktivKlubbId = id;
    spillerKart = null; // ny klubb -- forkast forrige klubbs cache
    ekstraSpillerNavn = new Map();
  }
}

export function hentAktivKlubbId() { return aktivKlubbId; }

export async function hentSpillerKart() {
  if (spillerKart) return spillerKart;
  spillerKart = new Map();
  if (!aktivKlubbId) return spillerKart; // ingen klubb valgt -- ingen spillere
  try {
    const q = query(collection(db, SAM.SPILLERE), where('klubbId', '==', aktivKlubbId));
    const snap = await getDocs(q);
    snap.docs.forEach(d => spillerKart.set(d.id, d.data().navn ?? d.id));
  } catch (e) {
    console.error('[state] Kunne ikke hente spillere:', e);
  }
  return spillerKart;
}

export function leggTilLokalt(spillerId, navn) {
  if (!spillerKart) spillerKart = new Map();
  spillerKart.set(spillerId, navn);
}

export function navnFor(spillerId) {
  return spillerKart?.get(spillerId) ?? ekstraSpillerNavn.get(spillerId) ?? spillerId;
}

/**
 * Fletter inn spillernavn mottatt fra en delt økt (activeSessions) i
 * overlay-cachen -- dekker manuelt tillagte spillere, som en tilskuer
 * ellers aldri ville kunnet slå opp navnet på (se byggSpillerNavnKart()
 * lenger ned, som legger disse ved når økten deles/fullføres).
 */
export function flettInnSpillerNavn(spillerNavnKart) {
  if (!spillerNavnKart) return;
  Object.entries(spillerNavnKart).forEach(([id, navn]) => {
    if (!ekstraSpillerNavn.has(id)) ekstraSpillerNavn.set(id, navn);
  });
}

// ── Aktiv økt, delt via Firestore ───────────────────────
// Én dokument per klubb (activeSessions/{klubbId}) -- en klubb kjører
// aldri to økter samtidig. Speiler den lokale okt-tilstanden fra og med
// at baner er generert, se begrunnelse i kommentaren øverst i filen.
//
// Skriving skjer "fire-and-forget" fra skjermene (ikke awaited før
// navigering), slik at admin aldri må vente på nettverket for at UI-et
// skal reagere -- se tilsvarende resonnement rundt fullforOktRegistrering
// i registerFinish.js.

let aktivOktLytter = null; // avmeldingsfunksjon for gjeldende onSnapshot, om noen

function aktivOktRef() {
  const klubbId = hentAktivKlubbId();
  return klubbId ? doc(db, SAM.AKTIV_OKT, klubbId) : null;
}

/**
 * Bygger et lite navnekart {spillerId: navn} for de gitte spiller-IDene,
 * for å legges ved når økten deles/fullføres -- dette er det ENESTE
 * stedet en tilskuer kan få tak i navnet på en manuelt tillagt spiller,
 * siden slike aldri skrives til players-samlingen (se navnFor() over).
 */
function byggSpillerNavnKart(spillerIder) {
  const kart = {};
  spillerIder.forEach(id => { kart[id] = navnFor(id); });
  return kart;
}

/** Skriver hele den lokale okt-tilstanden til Firestore. No-op uten klubb/baner. */
export async function lagreAktivOktTilSky() {
  const ref = aktivOktRef();
  if (!ref || !okt?.startBaner) return;
  await setDoc(ref, {
    status: 'aktiv',
    konkurranse: okt.konkurranse,
    deltakerIder: okt.deltakerIder,
    startBaner: okt.startBaner,
    plasseringer: okt.plasseringer,
    spillerNavn: byggSpillerNavnKart(okt.deltakerIder),
    oppdatert: serverTimestamp(),
  });
}

/**
 * Markerer den delte økten som fullført, MED resultatet vedlagt, i stedet
 * for å slette den med det samme -- slik at andre som følger økten (via
 * "Pågående økt"-kortet, se app.js) også får se resultatskjermen når
 * admin trykker "Fullfør økt". Overskriver dokumentet fullstendig, så
 * de gamle feltene (deltakerIder, startBaner osv.) forsvinner naturlig.
 * Selve slettingen skjer først når noen trykker "Ferdig" på
 * resultatskjermen, se lukkOktResultat() i screens-oktResultat.js.
 */
export async function fullforAktivOktISky(resultat) {
  const ref = aktivOktRef();
  if (!ref) return;
  const ider = resultat.resultatPerSpiller.map(r => r.spillerId);
  await setDoc(ref, {
    status: 'fullfort',
    konkurranse: resultat.konkurranse,
    resultat,
    spillerNavn: byggSpillerNavnKart(ider),
    oppdatert: serverTimestamp(),
  });
}

/** Fjerner den delte økten -- kalles ved avbrytelse, eller når noen
 * lukker resultatskjermen etter en fullført økt. */
export async function slettAktivOktFraSky() {
  const ref = aktivOktRef();
  if (!ref) return;
  await deleteDoc(ref);
}

/** Setter den lokale okt-variabelen fra Firestore-data (gjenoppta/følg-med). */
export function gjenopprettOktLokalt(data) {
  okt = {
    konkurranse: data.konkurranse,
    deltakerIder: data.deltakerIder ?? [],
    startBaner: data.startBaner ?? null,
    plasseringer: data.plasseringer ?? [],
  };
  flettInnSpillerNavn(data.spillerNavn);
}

/**
 * Lytter på aktiv økt for gitt klubb i sanntid. callback(data) kalles med
 * null når det ikke finnes noen aktiv økt. Meld automatisk av forrige
 * lytter (f.eks. ved klubbbytte) før ny lytting startes.
 */
export function lyttPaaAktivOkt(klubbId, callback) {
  stoppAktivOktLytting();
  if (!klubbId) { callback(null); return; }
  aktivOktLytter = onSnapshot(
    doc(db, SAM.AKTIV_OKT, klubbId),
    snap => callback(snap.exists() ? snap.data() : null),
    e => { console.error('[state] Lytting på aktiv økt feilet:', e); callback(null); },
  );
}

export function stoppAktivOktLytting() {
  if (aktivOktLytter) { aktivOktLytter(); aktivOktLytter = null; }
}
