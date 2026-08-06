// ════════════════════════════════════════════════════════
// firestorePameldingRepository.js — Firestore for påmeldingsrunder til
// treningsspor. Eneste fil som skriver denne typen data.
//
// EGNE samlinger (SAM.PAMELDINGSRUNDER, SAM.SPOR_INTERESSE) -- rører
// aldri players, activeSessions eller noe annet eksisterende.
//
// pameldingsrunder/{klubbId} -- ÉN aktiv runde per klubb, samme mønster
// som activeSessions/{klubbId}. rundeId (tidsstempel) skiller runder fra
// hverandre inni sporInteresse, slik at en ny runde ikke arver forrige
// runde sine påmeldinger.
//
// sporInteresse/{klubbId}_{spillerId} -- ÉN dokument per spiller per
// klubb, alltid overskrevet med spillerens siste valg (uansett hvilken
// runde). Gjeldende runde sin liste hentes ved å filtrere på rundeId --
// ingen opprydding nødvendig når en runde lukkes.
// ════════════════════════════════════════════════════════

import {
  db, SAM, doc, getDoc, setDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp,
} from './firebase.js';

function interesseDokId(klubbId, spillerId) { return `${klubbId}_${spillerId}`; }

export function lagFirestorePameldingRepository() {

  /** Åpner en ny runde -- overskriver en ev. tidligere (lukket) runde for klubben. */
  async function apneRunde(klubbId, tittel, aktiveSpor) {
    const rundeId = String(Date.now());
    await setDoc(doc(db, SAM.PAMELDINGSRUNDER, klubbId), {
      klubbId, rundeId, tittel, aktiveSpor, status: 'apen', opprettet: serverTimestamp(),
    });
    return rundeId;
  }

  async function lukkRunde(klubbId) {
    await setDoc(doc(db, SAM.PAMELDINGSRUNDER, klubbId), { status: 'lukket' }, { merge: true });
  }

  async function hentRunde(klubbId) {
    if (!klubbId) return null;
    try {
      const snap = await getDoc(doc(db, SAM.PAMELDINGSRUNDER, klubbId));
      return snap.exists() ? snap.data() : null;
    } catch (e) {
      console.error('[pameldingRepository] Kunne ikke hente runde:', e);
      return null;
    }
  }

  async function meldPa(klubbId, rundeId, spillerId, konkurranse) {
    await setDoc(doc(db, SAM.SPOR_INTERESSE, interesseDokId(klubbId, spillerId)), {
      klubbId, spillerId, rundeId, konkurranse, dato: serverTimestamp(),
    });
  }

  async function meldAv(klubbId, spillerId) {
    await deleteDoc(doc(db, SAM.SPOR_INTERESSE, interesseDokId(klubbId, spillerId)));
  }

  /**
   * Alle påmeldinger for GJELDENDE runde. Filtrerer KUN på klubbId
   * server-side, og rundeId klient-side -- to samtidige likhets-where
   * (klubbId OG rundeId) krever en sammensatt Firestore-indeks som ikke
   * finnes i dette prosjektet, og feiler da stille (fanges av catch,
   * returnerer tom liste -- admin ser "0 påmeldt" uten noen synlig feil).
   * Samme trygge mønster som hentApenRunde() og hentSpillerKart() i
   * state.js bruker.
   */
  async function hentInteresseForRunde(klubbId, rundeId) {
    try {
      const q = query(collection(db, SAM.SPOR_INTERESSE), where('klubbId', '==', klubbId));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data()).filter(i => i.rundeId === rundeId);
    } catch (e) {
      console.error('[pameldingRepository] Kunne ikke hente interesse:', e);
      return [];
    }
  }

  /** Spillerens egen, gjeldende påmelding (uansett runde) -- for "du er påmeldt X". */
  async function hentEgenPamelding(klubbId, spillerId) {
    try {
      const snap = await getDoc(doc(db, SAM.SPOR_INTERESSE, interesseDokId(klubbId, spillerId)));
      return snap.exists() ? snap.data() : null;
    } catch (e) {
      console.error('[pameldingRepository] Kunne ikke hente egen påmelding:', e);
      return null;
    }
  }

  return { apneRunde, lukkRunde, hentRunde, meldPa, meldAv, hentInteresseForRunde, hentEgenPamelding };
}
