// ════════════════════════════════════════════════════════
// firestoreTestRepository.js — Firestore-implementasjon for
// ferdighetstester. Eneste fil i appen som skriver testdata.
//
// Bruker EGNE samlinger (SAM.SKILL_TEST_RESULTATER, SAM.SKILL_TEST_TERSKLER,
// SAM.PLAYER_SKILL_TESTS -- se firebase.js). Rører aldri players,
// playerCategoryRatings, sessions eller andre eksisterende samlinger --
// trygt å legge til uten å påvirke rating-data, og uten å kunne
// kollidere med Stafettligaen sine samlinger i det delte prosjektet.
//
// I motsetning til playerCategoryRatings (som mangler klubbId og må
// filtreres via spillerKart-oppslag, se ARKITEKTUR.md) lagres klubbId
// direkte på dokumentene her -- enklere og raskere oppslag, ingen
// migreringshensyn siden dette er helt nye samlinger.
// ════════════════════════════════════════════════════════

import { db, SAM, doc, getDoc, setDoc, serverTimestamp } from './firebase.js';
import { lagBatchHjelper } from './batch-helpers.js';
import { STANDARD_TERSKLER } from './domain-tests-constants.js';

function terskelDokId(klubbId, testType) { return `${klubbId}_${testType}`; }
function spillerTestDokId(spillerId, testType) { return `${spillerId}_${testType}`; }

export function lagFirestoreTestRepository() {

  /** Henter gjeldende terskler for én test i én klubb. Faller til standard hvis ikke satt ennå. */
  async function hentTerskler(klubbId, testType) {
    if (!klubbId) return STANDARD_TERSKLER[testType];
    try {
      const snap = await getDoc(doc(db, SAM.SKILL_TEST_TERSKLER, terskelDokId(klubbId, testType)));
      return snap.exists() ? snap.data().grenser : STANDARD_TERSKLER[testType];
    } catch (e) {
      console.error('[testRepository] Kunne ikke hente terskler:', e);
      return STANDARD_TERSKLER[testType];
    }
  }

  /** Lagrer (overskriver) tersklene for én test i én klubb. */
  async function lagreTerskler(klubbId, testType, grenser) {
    await setDoc(doc(db, SAM.SKILL_TEST_TERSKLER, terskelDokId(klubbId, testType)), {
      klubbId, testType, grenser, oppdatert: serverTimestamp(),
    });
  }

  /**
   * Lagrer et testresultat: én arkivpost (permanent, aldri endret i
   * ettertid -- samme filosofi som sessions/-arkivet for rating) pluss
   * oppdatering av spillerens "gjeldende + siste tester"-dokument, som
   * gjør profilvisningen rask uten å måtte scanne hele arkivet.
   * Samme batch-mønster som lagreOktResultat() i
   * firestoreRatingRepository.js -- én batch, ingen halvferdig tilstand
   * hvis noe feiler underveis.
   */
  async function lagreTestresultat({
    spillerId, klubbId, testType,
    forsok = null, antallVellykket = null, antallForsok = null,
    verdi, nivaNummer, nivaNavn, registrertAv = null,
  }) {
    const bh = lagBatchHjelper(db);

    const arkivRef = doc(db, SAM.SKILL_TEST_RESULTATER, `${testType}_${Date.now()}`);
    await bh.sett(arkivRef, {
      spillerId, klubbId, testType,
      forsok, antallVellykket, antallForsok,
      verdi, nivaNummer, nivaNavn, registrertAv,
      dato: serverTimestamp(),
    });

    const spillerRef = doc(db, SAM.PLAYER_SKILL_TESTS, spillerTestDokId(spillerId, testType));
    const eksisterende = await getDoc(spillerRef);
    const historikk = eksisterende.exists() ? (eksisterende.data().historikk ?? []) : [];
    // NB: ISO-streng her, ikke serverTimestamp() -- Firestore løser ikke
    // serverTimestamp()-sentinelen korrekt inni arrays (blir null), se
    // samme løsning i firestoreRatingRepository.js sin historikk.
    historikk.push({ dato: new Date().toISOString(), verdi, nivaNummer });

    await bh.sett(spillerRef, {
      spillerId, klubbId, testType,
      gjeldendeVerdi: verdi,
      gjeldendeNivaNummer: nivaNummer,
      gjeldendeNivaNavn: nivaNavn,
      historikk,
    });

    await bh.kommit();
  }

  /** Henter en spillers gjeldende nivå + historikk for én test. null hvis aldri testet. */
  async function hentTestForSpiller(spillerId, testType) {
    try {
      const snap = await getDoc(doc(db, SAM.PLAYER_SKILL_TESTS, spillerTestDokId(spillerId, testType)));
      return snap.exists() ? snap.data() : null;
    } catch (e) {
      console.error('[testRepository] Kunne ikke hente testresultat:', e);
      return null;
    }
  }

  return { hentTerskler, lagreTerskler, lagreTestresultat, hentTestForSpiller };
}
