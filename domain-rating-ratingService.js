// ════════════════════════════════════════════════════════
// ratingService.js — orkestrerer hele rating-flyten
//
// Tar imot ALLE avhengigheter som parametre (dependency injection).
// Kjenner ikke til Firestore eller DOM -- kun til kontraktene under.
// Dette er stedet du bytter en algoritme senere: lag en ny fil som
// følger samme kontrakt som pairwiseAverageElo.js og send den inn her.
//
// Repository-kontrakt (IRatingRepository) forventet av denne servicen:
//   hentRatingForKategori(spillerId, kategori)        -> { elo, historikk } | null
//   hentFremgangForKonkurranse(spillerId, konkurranse) -> { treningsAntall, status } | null
//   hentEtablerteRatinger(kategori)                    -> number[]
//   lagreOktResultat(oktResultat)                      -> Promise<void>
// ════════════════════════════════════════════════════════

import { STARTRATING, kategoriForKonkurranse, ALLE_KATEGORIER } from './domain-constants.js';

export function lagRatingService({
  algoritme,            // pairwiseAverageElo.beregnRatingEndringer
  provisionalPolicy,    // provisionalPolicy.js
  baneStrategi,         // courtAssignment.js
  allroundKalkulator,   // allroundCalculator.js
  repository,           // IRatingRepository
}) {

  async function hentRatingForSpillere(spillerIder, kategori) {
    const par = await Promise.all(spillerIder.map(async id => {
      const rating = await repository.hentRatingForKategori(id, kategori);
      return { spillerId: id, rating: rating?.elo ?? STARTRATING };
    }));
    return par;
  }

  /** Steg 1: genererer baneoppsett før en økt, basert på gjeldende rating i kategorien. */
  async function genererBaner(konkurranse, deltakerIder) {
    const kategori = kategoriForKonkurranse(konkurranse);
    const spillereMedRating = await hentRatingForSpillere(deltakerIder, kategori);
    return baneStrategi.genererBaner(spillereMedRating);
  }

  /**
   * Steg 2: ren beregning, ingen lagring. Gitt sluttbaner (etter at admin
   * har registrert dem) regnes rating-endringer og bevegelse ut.
   * @param {string} konkurranse
   * @param {Array<{baneNr:number, spillerIder:string[]}>} startBaner
   * @param {Map<string, number>} sluttbaner  -- spillerId -> baneNr
   */
  async function beregnOktResultat(konkurranse, startBaner, sluttbaner) {
    const kategori = kategoriForKonkurranse(konkurranse);
    const spillerIder = [...sluttbaner.keys()];

    const naavaerendeElo = new Map();
    const kFaktorer = new Map();
    const fremgangPerSpiller = new Map();

    for (const id of spillerIder) {
      const rating = await repository.hentRatingForKategori(id, kategori);
      naavaerendeElo.set(id, rating?.elo ?? STARTRATING);

      const fremgang = await repository.hentFremgangForKonkurranse(id, konkurranse);
      fremgangPerSpiller.set(id, fremgang ?? { treningsAntall: 0, status: 'provisional' });
      kFaktorer.set(id, provisionalPolicy.hentKFaktor(fremgang));
    }

    const endringer = algoritme({ sluttbaner, naavaerendeElo, kFaktorer });

    const startBaneForSpiller = id => {
      const bane = startBaner.find(b => b.spillerIder.includes(id));
      return bane ? bane.baneNr : sluttbaner.get(id); // ny spiller uten startbane: ingen bevegelse
    };

    const resultatPerSpiller = spillerIder.map(id => {
      const startBaneNr = startBaneForSpiller(id);
      const sluttBaneNr = sluttbaner.get(id);
      return {
        spillerId: id,
        kategori,
        eloFor: naavaerendeElo.get(id),
        delta: endringer.get(id) ?? 0,
        eloEtter: naavaerendeElo.get(id) + (endringer.get(id) ?? 0),
        startBane: startBaneNr,
        sluttBane: sluttBaneNr,
        bevegelse: startBaneNr - sluttBaneNr, // positivt = flyttet opp (lavere banenr)
        fremgangFoer: fremgangPerSpiller.get(id),
      };
    });

    return { konkurranse, kategori, resultatPerSpiller };
  }

  /** Steg 3: lagrer økten og oppdaterer alt som avhenger av den, inkl. allround. */
  async function fullforOkt(oktResultat) {
    await repository.lagreOktResultat(oktResultat);

    const beroerteSpillere = oktResultat.resultatPerSpiller.map(r => r.spillerId);
    await Promise.all(beroerteSpillere.map(id => oppdaterAllround(id)));
  }

  /** Regner ut og lagrer allround-rating for én spiller på nytt. */
  async function oppdaterAllround(spillerId) {
    const ratingerPerKategori = {};
    const statistikkPerKategori = {};

    for (const kategori of ALLE_KATEGORIER) {
      const rating = await repository.hentRatingForKategori(spillerId, kategori);
      if (rating) ratingerPerKategori[kategori] = rating.elo;

      const populasjon = await repository.hentEtablerteRatinger(kategori);
      statistikkPerKategori[kategori] = allroundKalkulator.beregnPopulasjonsstatistikk(populasjon);
    }

    const allround = allroundKalkulator.beregnAllround(ratingerPerKategori, statistikkPerKategori);
    await repository.lagreAllround(spillerId, allround);
    return allround;
  }

  return { genererBaner, beregnOktResultat, fullforOkt, oppdaterAllround };
}
