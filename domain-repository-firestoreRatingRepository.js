// ════════════════════════════════════════════════════════
// firestoreRatingRepository.js — IRatingRepository mot Firestore
//
// Eneste fil i hele appen som skriver rating-data til Firestore.
// ratingService.js kjenner kun kontrakten (se ratingService.js), ikke
// denne implementasjonen -- bytt gjerne ut med en annen database uten
// å røre domenelaget.
// ════════════════════════════════════════════════════════

import {
  db, SAM, doc, collection, getDoc, setDoc, getDocs, query, where,
  serverTimestamp,
} from './firebase.js';
import { lagBatchHjelper } from './batch-helpers.js';
import { nesteFremgang } from './domain-rating-provisionalPolicy.js';

function ratingDokId(spillerId, kategori) { return `${spillerId}_${kategori}`; }
function fremgangDokId(spillerId, konkurranse) { return `${spillerId}_${konkurranse}`; }

export function lagFirestoreRatingRepository() {

  async function hentRatingForKategori(spillerId, kategori) {
    const snap = await getDoc(doc(db, SAM.PLAYER_CATEGORY_RATINGS, ratingDokId(spillerId, kategori)));
    return snap.exists() ? snap.data() : null;
  }

  async function hentFremgangForKonkurranse(spillerId, konkurranse) {
    const snap = await getDoc(doc(db, SAM.PLAYER_COMPETITION_PROGRESS, fremgangDokId(spillerId, konkurranse)));
    return snap.exists() ? snap.data() : null;
  }

  async function hentEtablerteRatinger(kategori) {
    const q = query(
      collection(db, SAM.PLAYER_CATEGORY_RATINGS),
      where('kategori', '==', kategori),
      where('status', '==', 'established'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data().elo);
  }

  async function lagreAllround(spillerId, allroundVerdi) {
    await setDoc(doc(db, SAM.PLAYER_ALLROUND, spillerId), {
      spillerId,
      allround: allroundVerdi,
      oppdatert: serverTimestamp(),
    }, { merge: true });
  }

  async function lagreOktResultat(oktResultat) {
    const bh = lagBatchHjelper(db);

    // 1. arkiver selve økten
    const oktRef = doc(db, SAM.SESSIONS, `${oktResultat.konkurranse}_${Date.now()}`);
    await bh.sett(oktRef, {
      konkurranse: oktResultat.konkurranse,
      kategori: oktResultat.kategori,
      dato: serverTimestamp(),
      resultatPerSpiller: oktResultat.resultatPerSpiller,
    });

    // 2. oppdater rating + historikk + fremgang per spiller
    for (const r of oktResultat.resultatPerSpiller) {
      const ratingRef = doc(db, SAM.PLAYER_CATEGORY_RATINGS, ratingDokId(r.spillerId, r.kategori));
      const eksisterende = await hentRatingForKategori(r.spillerId, r.kategori);
      const historikk = eksisterende?.historikk ?? [];
      historikk.push({
        dato: new Date().toISOString(),
        eloFor: r.eloFor,
        eloEtter: r.eloEtter,
        sluttBane: r.sluttBane,
        bevegelse: r.bevegelse,
      });

      const nyFremgang = nesteFremgang(r.fremgangFoer);

      await bh.sett(ratingRef, {
        spillerId: r.spillerId,
        kategori: r.kategori,
        elo: r.eloEtter,
        status: nyFremgang.status,
        historikk,
      });

      const fremgangRef = doc(db, SAM.PLAYER_COMPETITION_PROGRESS, fremgangDokId(r.spillerId, oktResultat.konkurranse));
      await bh.sett(fremgangRef, {
        spillerId: r.spillerId,
        konkurranse: oktResultat.konkurranse,
        treningsAntall: nyFremgang.treningsAntall,
        status: nyFremgang.status,
      });
    }

    await bh.kommit();
  }

  return {
    hentRatingForKategori,
    hentFremgangForKonkurranse,
    hentEtablerteRatinger,
    lagreAllround,
    lagreOktResultat,
  };
}
