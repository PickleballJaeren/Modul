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
//   lagreOktResultat(oktResultat, klubbId)             -> Promise<void>
//   lagreAllround(spillerId, allroundVerdi, klubbId)   -> Promise<void>
//   lagreAllroundFlere(oppdateringer, klubbId)         -> Promise<void>
//     der oppdateringer = {spillerId, allroundVerdi}[]
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

    // Hent rating + fremgang for ALLE spillere parallelt -- uavhengige
    // nettverkskall. Ved 28 spillere er dette forskjellen på ~56
    // sekvensielle rundturer og noen få parallelle bølger.
    await Promise.all(spillerIder.map(async id => {
      const [rating, fremgang] = await Promise.all([
        repository.hentRatingForKategori(id, kategori),
        repository.hentFremgangForKonkurranse(id, konkurranse),
      ]);
      naavaerendeElo.set(id, rating?.elo ?? STARTRATING);
      fremgangPerSpiller.set(id, fremgang ?? { treningsAntall: 0, status: 'provisional' });
      kFaktorer.set(id, provisionalPolicy.hentKFaktor(fremgang));
    }));

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

  /** Ren beregning (ingen lagring) -- delt av oppdaterAllround() og fullforOkt() under. */
  async function beregnAllroundVerdi(spillerId) {
    const ratingerPerKategori = {};

    // De 4 kategoriene er uavhengige lesinger -- hent parallelt i stedet
    // for én og én.
    const ratinger = await Promise.all(
      ALLE_KATEGORIER.map(kategori =>
        repository.hentRatingForKategori(spillerId, kategori).then(rating => ({ kategori, rating })),
      ),
    );
    const ratingerPerKategoriUtfylt = ratinger.reduce((acc, { kategori, rating }) => {
      if (rating) acc[kategori] = rating.elo;
      return acc;
    }, ratingerPerKategori);

    return allroundKalkulator.beregnAllround(ratingerPerKategoriUtfylt);
  }

  /**
   * Steg 3: lagrer økten og oppdaterer alt som avhenger av den, inkl.
   * allround. @param {string} klubbId -- se lagreOktResultat() i
   * repositoryet for hvorfor dette nå er påkrevd.
   */
  async function fullforOkt(oktResultat, klubbId) {
    await repository.lagreOktResultat(oktResultat, klubbId);

    const beroerteSpillere = oktResultat.resultatPerSpiller.map(r => r.spillerId);
    // Regn ut allround for ALLE berørte spillere parallelt (kun lesing,
    // ingen skriving her ennå -- trygt å parallellisere). Selve lagringen
    // skjer samlet rett under, via lagreAllroundFlere() -- IKKE ved å
    // kalle oppdaterAllround() i en løkke, som ville gitt N separate
    // lesing+skriving-runder mot samme leaderboard-dokument og latt de
    // fleste av dem overskrive hverandre (se forklaring i
    // leaderboardRepository.js).
    const verdier = await Promise.all(beroerteSpillere.map(beregnAllroundVerdi));
    const oppdateringer = beroerteSpillere.map((spillerId, i) => ({ spillerId, allroundVerdi: verdier[i] }));
    await repository.lagreAllroundFlere(oppdateringer, klubbId);
  }

  /**
   * Regner ut og lagrer allround-rating for ÉN spiller på nytt --
   * brukt av enkeltstående kall (f.eks. manuell rating-redigering, som
   * berører kun én spiller). @param {string} klubbId
   */
  async function oppdaterAllround(spillerId, klubbId) {
    const allround = await beregnAllroundVerdi(spillerId);
    await repository.lagreAllround(spillerId, allround, klubbId);
    return allround;
  }

  return { genererBaner, beregnOktResultat, fullforOkt, oppdaterAllround };
}
