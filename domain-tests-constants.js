// ════════════════════════════════════════════════════════
// domain-tests-constants.js — Domenekonstanter for ferdighetstester
// Ingen avhengigheter. Endres kun her, aldri i logikk-filene.
// Følger samme mønster som domain-constants.js (rating).
// ════════════════════════════════════════════════════════

export const TestType = Object.freeze({
  DINK_RALLY:          'dink_rally',
  VOLLEY_RALLY:        'volley_rally',
  TRANSITION_3RD_SHOT: 'transition_3rd_shot',
});

export const ALLE_TESTER = Object.values(TestType);

export const TEST_NAVN = Object.freeze({
  [TestType.DINK_RALLY]:          'Dink-rally',
  [TestType.VOLLEY_RALLY]:        'Volley-rally',
  [TestType.TRANSITION_3RD_SHOT]: '3rd shot / transition',
});

// 'snitt'   -- gjennomsnitt av et fast antall forsøk (dink, volley).
// 'prosent' -- andel vellykkede av et fast antall forsøk (3rd shot).
export const TEST_MALEMETODE = Object.freeze({
  [TestType.DINK_RALLY]:          { type: 'snitt',   antallForsok: 5 },
  [TestType.VOLLEY_RALLY]:        { type: 'snitt',   antallForsok: 5 },
  [TestType.TRANSITION_3RD_SHOT]: { type: 'prosent', antallForsok: 25 },
});

// Fire faste nivåer, samme navnesett for alle tester -- høyere tall er
// alltid bedre (se samtale om motiverende, "mestringsspråk"-navngiving).
export const NIVA_NAVN = Object.freeze({
  1: 'Under oppbygging',
  2: 'I fremgang',
  3: 'Solid',
  4: 'Behersker',
});

// Startterskler -- brukes KUN som fallback helt til en klubb setter sine
// egne via "Sett testgrenser" (se domain-repository-firestoreTestRepository.js).
// Basert på generell erfaring i sporten, ikke ennå kalibrert mot faktiske
// data. Admin bør oppdatere disse etter første runde med reelle tester.
export const STANDARD_TERSKLER = Object.freeze({
  [TestType.DINK_RALLY]: [
    { niva: 1, min: 0 }, { niva: 2, min: 5 }, { niva: 3, min: 10 }, { niva: 4, min: 17 },
  ],
  [TestType.VOLLEY_RALLY]: [
    { niva: 1, min: 0 }, { niva: 2, min: 4 }, { niva: 3, min: 8 }, { niva: 4, min: 13 },
  ],
  [TestType.TRANSITION_3RD_SHOT]: [
    { niva: 1, min: 0 }, { niva: 2, min: 25 }, { niva: 3, min: 45 }, { niva: 4, min: 65 },
  ],
});

export function testNavn(testType) {
  const navn = TEST_NAVN[testType];
  if (!navn) throw new Error(`Ukjent test: ${testType}`);
  return navn;
}
