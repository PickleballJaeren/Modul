// ════════════════════════════════════════════════════════
// pairwiseAverageElo.js — IRatingAlgorithm-implementasjon
//
// Kontrakt (IRatingAlgorithm), all fremtidig algoritme følger samme form:
//
//   beregnRatingEndringer({
//     sluttbaner:      Map<spillerId, baneNr>   -- baneNr 1 = best
//     naavaerendeElo:  Map<spillerId, number>
//     kFaktorer:       Map<spillerId, number>
//   }) -> Map<spillerId, number>   -- delta, avrundet heltall
//
// Metode: hver spiller sammenlignes "virtuelt" mot alle andre deltakere.
// Den som endte på lavere banenummer regnes som virtuell vinner. Par som
// endte på SAMME bane sammenlignes ikke (vi vet ikke hvem av de to som
// var best, se diskusjon i arkitekturplanen). Beregningen er batch: alle
// forventede resultater bruker Elo FØR økten, aldri oppdatert underveis,
// slik at resultatet er uavhengig av rekkefølgen vi regner i.
//
// Hver spillers samlede avvik (faktisk - forventet) summeres over alle
// gyldige sammenligninger og deles på ANTALLET sammenligninger, slik at
// K-faktoren gir samme "vekt" uansett hvor mange deltakere økten har.
// Uten denne normaliseringen ville en økt med 27 sammenligninger gitt
// urealistisk store utslag sammenlignet med en økt med 3.
// ════════════════════════════════════════════════════════

function eloForventet(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function beregnRatingEndringer({ sluttbaner, naavaerendeElo, kFaktorer }) {
  const spillerIder = [...sluttbaner.keys()];
  const sumAvvik = new Map(spillerIder.map(id => [id, 0]));
  const antallSammenligninger = new Map(spillerIder.map(id => [id, 0]));

  for (let a = 0; a < spillerIder.length; a++) {
    for (let b = a + 1; b < spillerIder.length; b++) {
      const i = spillerIder[a];
      const j = spillerIder[b];
      const baneI = sluttbaner.get(i);
      const baneJ = sluttbaner.get(j);

      if (baneI === baneJ) continue; // samme bane -- ekskluderes fra sammenligning

      const ratingI = naavaerendeElo.get(i) ?? 1000;
      const ratingJ = naavaerendeElo.get(j) ?? 1000;

      const forventetI = eloForventet(ratingI, ratingJ);
      const forventetJ = 1 - forventetI;

      const faktiskI = baneI < baneJ ? 1 : 0; // lavere banenummer = bedre resultat
      const faktiskJ = 1 - faktiskI;

      sumAvvik.set(i, sumAvvik.get(i) + (faktiskI - forventetI));
      sumAvvik.set(j, sumAvvik.get(j) + (faktiskJ - forventetJ));
      antallSammenligninger.set(i, antallSammenligninger.get(i) + 1);
      antallSammenligninger.set(j, antallSammenligninger.get(j) + 1);
    }
  }

  const endringer = new Map();
  for (const id of spillerIder) {
    const n = antallSammenligninger.get(id);
    const k = kFaktorer.get(id) ?? 20;
    const delta = n > 0 ? Math.round(k * (sumAvvik.get(id) / n)) : 0;
    endringer.set(id, delta);
  }
  return endringer;
}
