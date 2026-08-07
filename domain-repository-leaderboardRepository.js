// ════════════════════════════════════════════════════════
// leaderboardRepository.js — vedlikeholder ferdig-sorterte
// leaderboards/{klubbId}_{fane}-dokumenter.
//
// HVORFOR: playerCategoryRatings/playerAllround har ingen klubbId-felt,
// så ratinglistene måtte tidligere lese HELE samlingen (alle klubber,
// alle spillere) og filtrere/sortere i klienten -- se KVOTE.md. Denne
// modulen holder i stedet ett lite, ferdig-sortert dokument per
// klubb+fane, oppdatert i SAMME batch som selve rating-skrivingen
// (lagreOktResultat/lagreAllround i firestoreRatingRepository.js, samt
// manuell rating-redigering i screens-ratingLists.js). Kostnaden
// flyttes dermed fra "les alt, hver gang noen åpner listen" til "skriv
// litt mer, når rating faktisk endres" -- og skriving skjer sjeldent
// (én gang per fullført økt/redigering) sammenlignet med lesing (hver
// gang noen åpner appen).
//
// FANE: 'allround' eller én av RatingKategori-verdiene fra
// domain-constants.js. Brukes 1:1 som del av dokument-IDen.
//
// FORMAT (leaderboards/{klubbId}_{fane}):
//   { klubbId, fane, rader: [{spillerId, verdi}, ...], oppdatert }
// rader er sortert synkende på verdi, kappet ved MAKS_RADER -- listen
// viser uansett aldri mer enn dette, se tegnRader() i
// screens-ratingLists.js.
// ════════════════════════════════════════════════════════

import { db, SAM, doc, getDoc, setDoc } from './firebase.js';

const MAKS_RADER = 50;

function leaderboardDokId(klubbId, fane) {
  return `${klubbId}_${fane}`;
}

/** Henter ett leaderboard-dokument. Returnerer tom liste hvis det ikke finnes ennå (f.eks. helt ny klubb). */
export async function hentLeaderboard(klubbId, fane) {
  if (!klubbId) return [];
  try {
    const snap = await getDoc(doc(db, SAM.LEADERBOARDS, leaderboardDokId(klubbId, fane)));
    return snap.exists() ? (snap.data().rader ?? []) : [];
  } catch (e) {
    console.error('[leaderboardRepository] Kunne ikke hente leaderboard:', e);
    return [];
  }
}

/**
 * Slår sammen FLERE spilleres nye verdier inn i ett leaderboard-dokument
 * med kun ÉN lesing og ÉN skriving totalt -- selv om oppdateringen
 * gjelder mange spillere (f.eks. alle deltakerne i en nettopp fullført
 * økt, som alle traff samme kategori/leaderboard-dokument).
 *
 * VIKTIG (race condition): må IKKE gjøres som flere parallelle/
 * sekvensielle kall til en "les gjeldende, skriv ny"-funksjon for hver
 * enkelt spiller -- da vil kall nummer to lese dokumentet FØR kall
 * nummer én sin skriving er committet (spesielt når skrivingen går inn
 * i en batch, som ikke committer før helt til slutt), og resultatet
 * blir at kun den siste spillerens endring faktisk overlever. Denne
 * funksjonen unngår det ved å slå sammen alle endringene i minnet FØR
 * det gjøres én eneste skriving.
 *
 * @param {string} klubbId
 * @param {string} fane
 * @param {{spillerId:string, verdi:number}[]} oppdateringer
 * @param {ReturnType<import('./batch-helpers.js').lagBatchHjelper>|null} batchHjelper
 *   Valgfri -- sendes inn av kall som allerede bygger en batch (f.eks.
 *   lagreOktResultat), slik at leaderboard-skrivingen havner i SAMME
 *   batch som selve rating-skrivingen, i stedet for et eget
 *   nettverkskall. Uten batchHjelper skrives det direkte (brukt av
 *   enkeltstående kall som manuell rating-redigering).
 */
export async function oppdaterLeaderboardRader(klubbId, fane, oppdateringer, batchHjelper = null) {
  if (!klubbId || !oppdateringer?.length) return;
  const ref = doc(db, SAM.LEADERBOARDS, leaderboardDokId(klubbId, fane));
  let rader;
  try {
    const snap = await getDoc(ref);
    rader = snap.exists() ? (snap.data().rader ?? []) : [];
  } catch (e) {
    console.error('[leaderboardRepository] Kunne ikke hente leaderboard før oppdatering:', e);
    rader = [];
  }

  const nyeIder = new Set(oppdateringer.map(o => o.spillerId));
  const uberorte = rader.filter(r => !nyeIder.has(r.spillerId));
  const sammenslatt = [...uberorte, ...oppdateringer];
  sammenslatt.sort((a, b) => b.verdi - a.verdi);
  const nyeRader = sammenslatt.slice(0, MAKS_RADER);

  const data = { klubbId, fane, rader: nyeRader, oppdatert: Date.now() };
  if (batchHjelper) await batchHjelper.sett(ref, data);
  else await setDoc(ref, data);
}

/** Bekvemmelighetsvariant av oppdaterLeaderboardRader() for kun ÉN spiller (f.eks. manuell rating-redigering). */
export async function oppdaterLeaderboardRad(klubbId, fane, spillerId, verdi, batchHjelper = null) {
  return oppdaterLeaderboardRader(klubbId, fane, [{ spillerId, verdi }], batchHjelper);
}

/**
 * Fjerner én spiller fra ett leaderboard-dokument (f.eks. ved
 * sletting av spiller). Trygt å kalle selv om spilleren ikke står i
 * listen (f.eks. utenfor topp 50) -- da er dette en no-op-skriving.
 */
export async function fjernFraLeaderboard(klubbId, fane, spillerId, batchHjelper = null) {
  if (!klubbId) return;
  const ref = doc(db, SAM.LEADERBOARDS, leaderboardDokId(klubbId, fane));
  let rader;
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    rader = snap.data().rader ?? [];
  } catch (e) {
    console.error('[leaderboardRepository] Kunne ikke hente leaderboard før fjerning:', e);
    return;
  }
  const nyeRader = rader.filter(r => r.spillerId !== spillerId);
  const data = { klubbId, fane, rader: nyeRader, oppdatert: Date.now() };
  if (batchHjelper) await batchHjelper.sett(ref, data);
  else await setDoc(ref, data);
}
