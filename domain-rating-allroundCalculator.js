// ════════════════════════════════════════════════════════
// allroundCalculator.js — IAllroundCalculator-implementasjon
//
// Allround beregnes IKKE som et rått snitt av de fire kategoriratingene,
// siden kategoriene naturlig kan ha ulik spredning og drive uavhengig
// over tid (se diskusjon i samtalen / ARKITEKTUR.md). I stedet:
//
//   1. For hver kategori: regn ut spillerens z-score mot populasjonen
//      av ETABLERTE spillere i den kategorien.
//   2. Snitt av z-verdiene på tvers av kategoriene spilleren har en
//      rating i.
//   3. Reskaler til Elo-skala med en FAST referanse-std (100), slik at
//      Allround alltid leses på samme skala som de andre ratingene,
//      uavhengig av hvor mye spredningen i de fire kategoriene svinger.
//
// Kontrakt (IAllroundCalculator):
//   beregnPopulasjonsstatistikk(ratingListe: number[]) -> { snitt, std, n }
//   beregnAllround(ratingerPerKategori, statistikkPerKategori) -> number
// ════════════════════════════════════════════════════════

import { STARTRATING, REFERANSE_STD } from './domain-constants.js';

export function beregnPopulasjonsstatistikk(ratingListe) {
  const n = ratingListe.length;
  if (n === 0) return { snitt: STARTRATING, std: REFERANSE_STD, n: 0 };
  const snitt = ratingListe.reduce((s, r) => s + r, 0) / n;
  const varians = ratingListe.reduce((s, r) => s + (r - snitt) ** 2, 0) / n;
  const std = Math.sqrt(varians) || 1; // unngå divisjon på 0 ved identiske ratinger
  return { snitt, std, n };
}

/**
 * @param {Record<string, number>} ratingerPerKategori  -- kategori -> spillerens rating
 * @param {Record<string, {snitt:number,std:number,n:number}>} statistikkPerKategori
 */
export function beregnAllround(ratingerPerKategori, statistikkPerKategori) {
  const zVerdier = [];
  for (const [kategori, rating] of Object.entries(ratingerPerKategori)) {
    const stat = statistikkPerKategori[kategori];
    if (!stat || stat.n === 0) continue; // ingen populasjon å sammenligne mot ennå
    zVerdier.push((rating - stat.snitt) / stat.std);
  }
  if (zVerdier.length === 0) return STARTRATING;
  const zSnitt = zVerdier.reduce((s, z) => s + z, 0) / zVerdier.length;
  return Math.round(STARTRATING + zSnitt * REFERANSE_STD);
}
