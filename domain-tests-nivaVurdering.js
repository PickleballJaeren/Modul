// ════════════════════════════════════════════════════════
// domain-tests-nivaVurdering.js — ren beregning: forsøk/prosent -> nivå
//
// Ingen avhengighet til Firestore eller DOM. Terskler sendes inn som
// parameter (hentet av repository, med fallback til STANDARD_TERSKLER),
// slik at denne filen aldri selv vet hvor tersklene kom fra -- samme
// separasjon som domain-rating-pairwiseAverageElo.js holder til
// repository-laget.
// ════════════════════════════════════════════════════════

import { NIVA_NAVN } from './domain-tests-constants.js';

/** Gjennomsnitt av en liste forsøk, avrundet til én desimal. */
export function beregnSnitt(forsokListe) {
  if (!forsokListe?.length) return 0;
  const sum = forsokListe.reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.round((sum / forsokListe.length) * 10) / 10;
}

/** Prosent vellykkede forsøk, avrundet til nærmeste heltall. */
export function beregnProsent(antallVellykket, antallForsok) {
  if (!antallForsok) return 0;
  return Math.round((Number(antallVellykket || 0) / antallForsok) * 100);
}

/**
 * Finner høyeste nivå spilleren når opp til, gitt en verdi og et sett
 * terskler [{niva, min}, ...] (hvilken som helst rekkefølge internt).
 * Faller ned til laveste nivå i settet hvis verdien er under alle andre.
 *
 * VIKTIG: nivået denne funksjonen returnerer skal FRYSES på selve
 * testresultatet når det lagres (se firestoreTestRepository.js) --
 * IKKE regnes om på nytt hver gang historikk vises. Endres tersklene
 * senere, skal ikke spillerens historiske resultater bytte nivå
 * retroaktivt (se samtale om hvorfor dette forvirrer spilleren).
 */
export function finnNiva(verdi, terskler) {
  const sortert = [...terskler].sort((a, b) => a.niva - b.niva);
  let resultat = sortert[0] ?? { niva: 1, min: 0 };
  for (const t of sortert) {
    if (verdi >= t.min) resultat = t;
  }
  return { nivaNummer: resultat.niva, nivaNavn: NIVA_NAVN[resultat.niva] ?? `Nivå ${resultat.niva}` };
}
