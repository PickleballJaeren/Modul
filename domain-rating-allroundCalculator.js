// ════════════════════════════════════════════════════════
// allroundCalculator.js — IAllroundCalculator-implementasjon
//
// Allround = rått gjennomsnitt av spillerens rating i de kategoriene
// hen har spilt. (Tidligere versjon brukte z-score mot populasjonen
// av etablerte spillere per kategori -- byttet ut etter ønske om en
// enklere, lettere-å-forstå verdi. Ingen populasjonsstatistikk trengs
// lenger, siden gjennomsnittet regnes direkte på Elo-skalaen.)
//
// Kontrakt (IAllroundCalculator):
//   beregnAllround(ratingerPerKategori) -> number
// der ratingerPerKategori = { kategori: rating, ... } -- kun
// kategoriene spilleren faktisk har en rating i.
// ════════════════════════════════════════════════════════

import { STARTRATING } from './domain-constants.js';

export function beregnAllround(ratingerPerKategori) {
  const verdier = Object.values(ratingerPerKategori);
  if (verdier.length === 0) return STARTRATING;
  const snitt = verdier.reduce((s, v) => s + v, 0) / verdier.length;
  return Math.round(snitt);
}
