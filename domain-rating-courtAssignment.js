// ════════════════════════════════════════════════════════
// courtAssignment.js — ICourtAssignmentStrategy-implementasjon
//
// Komprimert stige: med N deltakere brukes baner 1 til ceil(N/2), aldri
// mer enn ANTALL_BANER_MAKS. Spillerne sorteres synkende etter gjeldende
// rating i den ratingkategorien konkurransen tilhører, og fordeles to
// og to. Rekkefølgen INNAD på en bane har ingen betydning for rating-
// beregningen (se pairwiseAverageElo.js), så den er ikke definert her.
//
// Kontrakt (ICourtAssignmentStrategy):
//   genererBaner(spillereMedRating, antallBanerMaks) -> Bane[]
// der spillereMedRating = [{ spillerId, rating }, ...]
// og  Bane = { baneNr, spillerIder: string[] }
// ════════════════════════════════════════════════════════

import { ANTALL_BANER_MAKS } from './domain-constants.js';

export function genererBaner(spillereMedRating, antallBanerMaks = ANTALL_BANER_MAKS) {
  const sortert = [...spillereMedRating].sort((a, b) => b.rating - a.rating);
  const antallBaner = Math.min(Math.ceil(sortert.length / 2), antallBanerMaks);

  const baner = [];
  for (let i = 0; i < antallBaner; i++) {
    const par = sortert.slice(i * 2, i * 2 + 2);
    baner.push({
      baneNr: i + 1,
      spillerIder: par.map(p => p.spillerId),
    });
  }
  return baner;
}

/**
 * Finner hvilken bane en spiller startet på, gitt et sett med baner fra
 * genererBaner(). Brukes til å regne ut bevegelse (opp/ned) når
 * sluttbane registreres.
 */
export function finnStartBane(baner, spillerId) {
  const bane = baner.find(b => b.spillerIder.includes(spillerId));
  return bane ? bane.baneNr : null;
}
