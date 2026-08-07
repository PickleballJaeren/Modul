# 1 vs 1 — arkitekturplan

Dette dokumentet beskriver hvordan koden er strukturert *logisk* og hvorfor.
Selve GitHub-repoet ligger med **flat mappestruktur** (alle filer i én
mappe, ingen undermapper) etter eget ønske — filnavnene bruker prefikser
for å vise hvilket lag de tilhører, f.eks. `domain-rating-ratingService.js`
tilsvarer det som logisk er `domain/rating/ratingService.js`. Se
oversettelsestabellen nederst i dette dokumentet.

## Grunnprinsipp

Koden er delt i tre uavhengige lag som ikke vet noe om hverandre:

```
domain/     -- ren logikk (rating, baner, allround). Ingen DOM, ingen Firebase.
repository/ -- eneste sted som snakker med Firestore. Implementerer et fast
               kontrakt-API som domenet er avhengig av, ikke omvendt.
screens/    -- UI. Bruker domain + repository via RatingService. Rører aldri
               Firestore direkte.
```

Regelen er: **domain kjenner ikke til repository eller screens.** Det gjør
domenelaget 100 % testbart uten database eller nettleser, og det er stedet vi
bytter ratingalgoritme senere uten å røre noe annet.

## Mappestruktur

```
1vs1-app/
  index.html
  manifest.json
  sw.js
  styles.css                     (samme designtokens som Stafettligaen)
  logo.svg, icon-192.png, icon-512.png
  src/
    app.js                       Oppstart, klubbvalg, kobler skjermene sammen
    firebase.js                  Firebase-init + samlingsreferanser
    ui.js                        Toast, navigasjon, escHtml (gjenbrukt uendret)
    admin.js                     PIN-beskyttelse (gjenbrukt uendret)
    batch-helpers.js             Firestore-batching (gjenbrukt uendret)
    qrcode.js                    QR-generering (gjenbrukt uendret)

    domain/
      constants.js                Konkurranser, ratingkategorier, mapping
      rating/
        pairwiseAverageElo.js     IRatingAlgorithm-implementasjon
        provisionalPolicy.js      K-faktor og etablert-status
        courtAssignment.js        Komprimert stige-seeding
        allroundCalculator.js     Z-score-normalisering
        ratingService.js          Orkestrerer alt over via dependency injection

      repository/
        firestoreRatingRepository.js   Implementerer kontrakten mot Firestore

    screens/
      home.js
      competitions.js
      registerPlayers.js
      activeSession.js
      registerFinish.js
      ratingLists.js
      archive.js
```

## Hvorfor denne inndelingen

**Alt vi ble enige om tidligere i samtalen er kodet som separate,
navngitte moduler**, ikke som én stor fil:

| Beslutning | Modul |
|---|---|
| Par på samme sluttbane ekskluderes fra sammenligning | `pairwiseAverageElo.js` |
| Provisional-status telles separat per konkurranse | `provisionalPolicy.js` (tar imot fremgang for én konkurranse om gangen) |
| Komprimert stige ved <28 spillere | `courtAssignment.js` |
| Allround = z-score, referanse-std 100, kun etablerte i populasjonen | `allroundCalculator.js` |
| Konkurranse -> ratingkategori-mapping (Volley Reset + Volley Drive deler Power Play) | `constants.js` |

Det betyr at hvis du f.eks. vil bytte fra "enkel pairwise-gjennomsnitt" til
en full Bradley-Terry-modell senere, bytter du ut `pairwiseAverageElo.js`
med en ny fil som følger samme kontrakt — resten av appen er uberørt.

## Kontrakten mellom domain og repository

`ratingService.js` er avhengig av et repository-objekt med disse metodene
(implementert av `firestoreRatingRepository.js`, men kunne like gjerne vært
en test-mock eller en annen database):

```
hentRatingForKategori(spillerId, kategori)      -> { elo, historikk }
hentFremgangForKonkurranse(spillerId, konkurranse) -> { treningsAntall, status }
hentPopulasjonsstatistikk(kategori)             -> { snitt, std, n } (kun etablerte)
lagreOktResultat(okt)                            -> lagrer i arkiv + oppdaterer alt
```

Dette er dependency injection i praksis: `ratingService.js` tar imot
repositoryet som parameter og bryr seg aldri om at det er Firestore under.

## Datamodell (Firestore-samlinger)

```
players/{spillerId}
  navn, klubbId, opprettet

playerCategoryRatings/{spillerId}_{kategori}
  elo, historikk: [{oktId, dato, eloFor, eloEtter, sluttbane, plassering}]

playerCompetitionProgress/{spillerId}_{konkurranse}
  treningsAntall, status  (provisional | established)

klubber/{klubbId}/sessions/{oktId}
  konkurranse, dato, resultatPerSpiller, spillerIder
  -- dette ER arkiv-oppføringen, ingen egen arkiv-samling nødvendig.
  -- Klubb-scopet subcollection (ikke en flat, delt samling) -- se
  -- KVOTE.md for hvorfor og migreringen fra det tidligere flate
  -- sessions/{oktId}-formatet.

leaderboards/{klubbId}_{fane}
  klubbId, fane, rader: [{spillerId, verdi}] (sortert, maks 50)
  -- ferdig-sortert lese-kopi av playerCategoryRatings/playerAllround,
  -- vedlikeholdt av samme skriving som oppdaterer selve ratingen. Se
  -- domain-repository-leaderboardRepository.js og KVOTE.md.
```

**Merk:** `playerCategoryRatings`/`playerCompetitionProgress`/
`playerAllround` har fortsatt ikke `klubbId` som eget felt på selve
dokumentet (kun avledet via `players/{spillerId}.klubbId`) -- dette er
en bevisst gjenværende begrensning, se "Ikke gjort i denne runden" i
KVOTE.md.

## Byggerekkefølge

1. **Domenelaget** (denne omgangen) — ferdig testbar rating-motor, ingen UI.
2. Firestore-repository som implementerer kontrakten.
3. Skjermene, i denne rekkefølgen: hjemskjerm -> konkurransevalg ->
   registrer deltakere -> aktiv økt -> registrer sluttbane
   -> ratinglister -> arkiv.
4. Koble sammen i `app.js`, samme mønster som `app.js` i Stafettligaen.

Jeg starter med punkt 1 nå, siden det er fundamentet alt annet bygger på.

## Oversettelse: logisk lag → faktisk filnavn i repoet

| Logisk lag | Faktisk filnavn (flat) |
|---|---|
| domain/constants.js | `domain-constants.js` |
| domain/rating/pairwiseAverageElo.js | `domain-rating-pairwiseAverageElo.js` |
| domain/rating/provisionalPolicy.js | `domain-rating-provisionalPolicy.js` |
| domain/rating/courtAssignment.js | `domain-rating-courtAssignment.js` |
| domain/rating/allroundCalculator.js | `domain-rating-allroundCalculator.js` |
| domain/rating/ratingService.js | `domain-rating-ratingService.js` |
| domain/rating/_selvtest.mjs | `domain-rating-selvtest.mjs` |
| domain/repository/firestoreRatingRepository.js | `domain-repository-firestoreRatingRepository.js` |
| state/*.js (oktState, services, spillerCache) | `state.js` (slått sammen -- se begrunnelse i filen) |
| screens/*.js | `screens-*.js` |
