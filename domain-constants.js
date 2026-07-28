// ════════════════════════════════════════════════════════
// constants.js — Domenekonstanter for 1 vs 1
// Ingen avhengigheter. Endres kun her, aldri i logikk-filene.
// ════════════════════════════════════════════════════════

export const STARTRATING = 1000;
export const PROVISIONAL_TRENINGER = 5; // antall treninger for status = etablert
export const ANTALL_BANER_MAKS = 14;

export const K_PROVISIONAL = 40;
export const K_ETABLERT = 20;

// ── Konkurranser (det konkrete arrangementet som spilles) ──
export const Konkurranse = Object.freeze({
  DINK_VOLLEY:       'dink_volley',
  VOLLEY_RESET:      'volley_reset',
  VOLLEY_DRIVE:      'volley_drive',
  TREDJE_SLAG_DROP:  '3rd_shot_drop',
  SINGLES:           'singles',
});

// ── Ratingkategorier (det faktiske rating-tallet en spiller har) ──
export const RatingKategori = Object.freeze({
  SOFT_PLAY:  'soft_play',
  POWER_PLAY: 'power_play',
  DEFENSE:    'defense',
  SINGLES:    'singles',
});

// Flere konkurranser kan dele én ratingkategori (Volley Reset og Volley
// Drive oppdaterer begge Power Play). Dette er den ENESTE plassen denne
// koblingen defineres.
export const KONKURRANSE_TIL_KATEGORI = Object.freeze({
  [Konkurranse.DINK_VOLLEY]:      RatingKategori.SOFT_PLAY,
  [Konkurranse.VOLLEY_RESET]:     RatingKategori.POWER_PLAY,
  [Konkurranse.VOLLEY_DRIVE]:     RatingKategori.POWER_PLAY,
  [Konkurranse.TREDJE_SLAG_DROP]: RatingKategori.DEFENSE,
  [Konkurranse.SINGLES]:          RatingKategori.SINGLES,
});

export function kategoriForKonkurranse(konkurranse) {
  const kategori = KONKURRANSE_TIL_KATEGORI[konkurranse];
  if (!kategori) throw new Error(`Ukjent konkurranse: ${konkurranse}`);
  return kategori;
}

export const KONKURRANSE_NAVN = Object.freeze({
  [Konkurranse.DINK_VOLLEY]:      'Dink and Volley',
  [Konkurranse.VOLLEY_RESET]:     'Volley Reset',
  [Konkurranse.VOLLEY_DRIVE]:     'Volley Drive',
  [Konkurranse.TREDJE_SLAG_DROP]: '3rd Shot Drop',
  [Konkurranse.SINGLES]:          'Singles',
});

export const RATINGKATEGORI_NAVN = Object.freeze({
  [RatingKategori.SOFT_PLAY]:  'Soft Play',
  [RatingKategori.POWER_PLAY]: 'Power Play',
  [RatingKategori.DEFENSE]:    'Defense',
  [RatingKategori.SINGLES]:    'Singles',
});

export const ALLE_KONKURRANSER = Object.values(Konkurranse);
export const ALLE_KATEGORIER   = Object.values(RatingKategori);
