// ════════════════════════════════════════════════════════
// firestoreRatingRepository.js — IRatingRepository mot Firestore
//
// Eneste fil i hele appen som skriver rating-data til Firestore.
// ratingService.js kjenner kun kontrakten (se ratingService.js), ikke
// denne implementasjonen -- bytt gjerne ut med en annen database uten
// å røre domenelaget.
// ════════════════════════════════════════════════════════

import {
  db, SAM, doc, getDoc, setDoc, serverTimestamp, oktSamling, oktDok,
} from './firebase.js';
import { lagBatchHjelper } from './batch-helpers.js';
import { nesteFremgang } from './domain-rating-provisionalPolicy.js';
import { oppdaterLeaderboardRad, oppdaterLeaderboardRader } from './domain-repository-leaderboardRepository.js';

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

  /**
   * Lagrer allround for ÉN spiller -- brukt av enkeltstående kall (f.eks.
   * manuell rating-redigering i screens-ratingLists.js, som berører kun
   * én spiller om gangen). Oppdaterer også 'allround'-leaderboardet.
   * IKKE trygt å kalle parallelt for FLERE spillere samtidig mot samme
   * klubb -- se lagreAllroundFlere() under for det tilfellet.
   */
  async function lagreAllround(spillerId, allroundVerdi, klubbId) {
    const ref = doc(db, SAM.PLAYER_ALLROUND, spillerId);
    const eksisterende = await getDoc(ref);
    const historikk = eksisterende.exists() ? (eksisterende.data().historikk ?? []) : [];
    historikk.push({ dato: new Date().toISOString(), allround: allroundVerdi });

    await setDoc(ref, {
      spillerId,
      allround: allroundVerdi,
      historikk,
      oppdatert: serverTimestamp(),
    }, { merge: true });

    await oppdaterLeaderboardRad(klubbId, 'allround', spillerId, allroundVerdi);
  }

  /**
   * Lagrer allround for FLERE spillere i ÉN operasjon -- brukt av
   * fullforOkt() nedenfor når en hel økt fullføres og allround skal
   * regnes om for alle deltakerne samtidig. Egen funksjon (i stedet for
   * å kalle lagreAllround() i en løkke/Promise.all) fordi et leaderboard-
   * dokument kun kan slås trygt sammen med ÉN lesing+skriving totalt --
   * se race condition-forklaringen i leaderboardRepository.js. Hver
   * spillers playerAllround/{id}-dokument er derimot uavhengige og
   * skrives trygt parallelt i samme batch.
   * @param {{spillerId:string, allroundVerdi:number}[]} oppdateringer
   */
  async function lagreAllroundFlere(oppdateringer, klubbId) {
    if (!oppdateringer.length) return;
    const bh = lagBatchHjelper(db);

    for (const { spillerId, allroundVerdi } of oppdateringer) {
      const ref = doc(db, SAM.PLAYER_ALLROUND, spillerId);
      const eksisterende = await getDoc(ref);
      const historikk = eksisterende.exists() ? (eksisterende.data().historikk ?? []) : [];
      historikk.push({ dato: new Date().toISOString(), allround: allroundVerdi });
      await bh.sett(ref, { spillerId, allround: allroundVerdi, historikk, oppdatert: serverTimestamp() });
    }

    await oppdaterLeaderboardRader(
      klubbId, 'allround',
      oppdateringer.map(o => ({ spillerId: o.spillerId, verdi: o.allroundVerdi })),
      bh,
    );

    await bh.kommit();
  }

  /**
   * Lagrer resultatet av én fullført økt.
   * @param {string} klubbId -- NB: ny påkrevd parameter. Brukes til (a)
   *   å arkivere økten i klubbens EGEN subcollection (klubber/{klubbId}/
   *   sessions/{oktId}) i stedet for den tidligere flate, ufiltrerbare
   *   SAM.SESSIONS-samlingen, og (b) å oppdatere riktig klubbs
   *   kategori-leaderboard. Se KVOTE.md for begrunnelse.
   */
  async function lagreOktResultat(oktResultat, klubbId) {
    const bh = lagBatchHjelper(db);

    // 1. arkiver selve økten i klubbens subcollection. spillerIder lagres
    //    denormalisert (i tillegg til inni resultatPerSpiller) slik at
    //    spillerprofilen (screens-ratingLists.js sin
    //    hentHistorikkForSpiller()) kan spørre med
    //    where('spillerIder','array-contains', spillerId) i stedet for å
    //    lese et bredt sett økter og filtrere i klienten.
    const oktId = `${oktResultat.konkurranse}_${Date.now()}`;
    const oktRef = oktDok(klubbId, oktId);
    await bh.sett(oktRef, {
      konkurranse: oktResultat.konkurranse,
      kategori: oktResultat.kategori,
      dato: serverTimestamp(),
      resultatPerSpiller: oktResultat.resultatPerSpiller,
      spillerIder: oktResultat.resultatPerSpiller.map(r => r.spillerId),
    });

    // 2. oppdater rating + historikk + fremgang per spiller
    // Les eksisterende rating for ALLE spillere parallelt først -- dette er
    // den delen som skalerer dårlig sekvensielt ved store økter (28
    // spillere = 28 rundturer). Selve skrivingen under går rett i batchen
    // og er billig, så den holdes i en enkel løkke.
    const eksisterendeMap = new Map(
      await Promise.all(oktResultat.resultatPerSpiller.map(async r => {
        const eksisterende = await hentRatingForKategori(r.spillerId, r.kategori);
        return [ratingDokId(r.spillerId, r.kategori), eksisterende];
      })),
    );

    for (const r of oktResultat.resultatPerSpiller) {
      const ratingRef = doc(db, SAM.PLAYER_CATEGORY_RATINGS, ratingDokId(r.spillerId, r.kategori));
      const eksisterende = eksisterendeMap.get(ratingDokId(r.spillerId, r.kategori));
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

    // 3. oppdater kategori-leaderboardet -- ÉN sammenslått lesing+skriving
    // for HELE økten (alle deltakerne deler samme kategori, se
    // beregnOktResultat() i ratingService.js), i stedet for én
    // lesing+skriving per spiller. Lagt i SAMME batch som resten over.
    await oppdaterLeaderboardRader(
      klubbId, oktResultat.kategori,
      oktResultat.resultatPerSpiller.map(r => ({ spillerId: r.spillerId, verdi: r.eloEtter })),
      bh,
    );

    await bh.kommit();
  }

  return {
    hentRatingForKategori,
    hentFremgangForKonkurranse,
    lagreAllround,
    lagreAllroundFlere,
    lagreOktResultat,
  };
}
