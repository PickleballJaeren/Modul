// ════════════════════════════════════════════════════════
// domain-rating-utvikling.js — utleder styrker, potensial og anbefalt
// aktivitet fra en spillers kategori-ratinger. Ren logikk, ingen
// Firestore/DOM (samme prinsipp som resten av domain/rating-*.js) --
// se ARKITEKTUR.md.
//
// Singles er BEVISST utelatt fra "potensial" og dermed også fra
// "anbefalt aktivitet": Singles er et sammensatt kampformat som
// oppsummerer de andre kategoriene, ikke en avgrenset aktivitet man
// drillspesifikt trener på for å bli bedre i akkurat den kategorien
// (i motsetning til Soft Play/Power Play/Defense, som hver har én
// eller to konkrete aktiviteter koblet til seg, se
// KONKURRANSE_TIL_KATEGORI i domain-constants.js). Singles kan
// fortsatt dukke opp som en STYRKE -- det er ren anerkjennelse av noe
// spilleren er god på, ikke en handlingsanbefaling.
// ════════════════════════════════════════════════════════

import {
  ALLE_KATEGORIER, RatingKategori, KONKURRANSE_TIL_KATEGORI, ALLE_KONKURRANSER,
} from './domain-constants.js';

const POTENSIAL_KANDIDATER = ALLE_KATEGORIER.filter(k => k !== RatingKategori.SINGLES);
const MAKS_STYRKER = 2;

function konkurranserForKategori(kategori) {
  return ALLE_KONKURRANSER.filter(k => KONKURRANSE_TIL_KATEGORI[k] === kategori);
}

/**
 * @param {Object.<string, number>} ratingerPerKategori -- kategori -> elo,
 *   KUN for kategorier spilleren faktisk har en rating i.
 * @param {number} allround
 * @returns {{
 *   styrker: {kategori:string, elo:number}[],
 *   potensial: {kategori:string, elo:number} | null,
 *   anbefalteKonkurranser: string[]
 * }}
 */
export function beregnUtvikling(ratingerPerKategori, allround) {
  const kategorierMedDelta = ALLE_KATEGORIER
    .filter(k => k in ratingerPerKategori)
    .map(k => ({ kategori: k, elo: ratingerPerKategori[k], delta: ratingerPerKategori[k] - allround }));

  if (kategorierMedDelta.length === 0) {
    return { styrker: [], potensial: null, anbefalteKonkurranser: [] };
  }

  // Styrker: kategoriene klart over allround, høyest først. Har ingen
  // kategori positivt avvik (f.eks. en helt ny spiller, alt likt) faller
  // vi tilbake til den relativt beste kategorien -- alltid noe å vise.
  const sortertSynkende = [...kategorierMedDelta].sort((a, b) => b.delta - a.delta);
  const positiveStyrker = sortertSynkende.filter(k => k.delta > 0).slice(0, MAKS_STYRKER);
  const styrker = (positiveStyrker.length ? positiveStyrker : sortertSynkende.slice(0, 1))
    .map(({ kategori, elo }) => ({ kategori, elo }));

  // Potensial: svakeste av de handlingsrettede kategoriene (ikke Singles).
  // Samme fallback-logikk som styrker -- vis alltid noe, selv om spilleren
  // er jevnt sterk over hele linjen.
  const potensialKandidater = kategorierMedDelta.filter(k => POTENSIAL_KANDIDATER.includes(k.kategori));
  let potensial = null;
  if (potensialKandidater.length) {
    const sortertStigende = [...potensialKandidater].sort((a, b) => a.delta - b.delta);
    const { kategori, elo } = sortertStigende[0];
    potensial = { kategori, elo };
  }

  const anbefalteKonkurranser = potensial ? konkurranserForKategori(potensial.kategori) : [];

  return { styrker, potensial, anbefalteKonkurranser };
}
