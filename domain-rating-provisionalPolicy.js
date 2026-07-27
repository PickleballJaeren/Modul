// ════════════════════════════════════════════════════════
// provisionalPolicy.js — K-faktor og etablert-status
//
// Fremgang (treningsAntall, status) spores PER KONKURRANSE, ikke per
// ratingkategori -- selv om Volley Reset og Volley Drive deler samme
// Power Play-rating, har de hver sin egen telling. Se ARKITEKTUR.md.
//
// Kontrakt (IProvisionalPolicy):
//   hentKFaktor(fremgang)     -> number
//   erNaaEtablert(fremgang)   -> boolean   (etter denne øktens telling)
// der fremgang = { treningsAntall, status }
// ════════════════════════════════════════════════════════

import { K_PROVISIONAL, K_ETABLERT, PROVISIONAL_TRENINGER } from './domain-constants.js';

export function hentKFaktor(fremgang) {
  const antall = fremgang?.treningsAntall ?? 0;
  return antall < PROVISIONAL_TRENINGER ? K_PROVISIONAL : K_ETABLERT;
}

/**
 * Kalles ETTER at treningsAntall er talt opp med denne økten.
 * Returnerer true første gang spilleren når terskelen.
 */
export function erNaaEtablert(fremgangEtterOkt) {
  return (fremgangEtterOkt?.treningsAntall ?? 0) >= PROVISIONAL_TRENINGER;
}

/**
 * Hjelpefunksjon: gitt fremgang FØR økten, returner ny fremgang etter
 * at én trening i denne konkurransen er gjennomført.
 */
export function nesteFremgang(fremgangFoerOkt) {
  const treningsAntall = (fremgangFoerOkt?.treningsAntall ?? 0) + 1;
  const status = treningsAntall >= PROVISIONAL_TRENINGER ? 'established' : 'provisional';
  return { treningsAntall, status };
}
