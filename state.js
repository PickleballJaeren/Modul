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

import { db, SAM, collection, query, where, getDocs } from './firebase.js';

// ── Økt-tilstand ────────────────────────────────────────
// Ingenting her skrives til Firestore. Admin gjør ingenting i appen
// mens selve treningen pågår (spillere flytter seg fysisk mellom
// baner uten at det registreres underveis) -- denne delen holder
// bare styr på: hvem som er med, hvilke baner de startet på, og
// rekkefølgen admin trykker dem inn i ved slutten. Første skriving
// til Firestore skjer i ratingService.fullforOkt().

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

export function settAktivKlubbId(id) {
  if (id !== aktivKlubbId) {
    aktivKlubbId = id;
    spillerKart = null; // ny klubb -- forkast forrige klubbs cache
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
  return spillerKart?.get(spillerId) ?? spillerId;
}
