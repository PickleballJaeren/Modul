# Kvote/kostnad — hva ble endret og hvorfor

Dette dokumentet beskriver en runde endringer gjort for å redusere
Firestore-lesing/skriving og tette et sikkerhetshull. Referert fra
kommentarer flere steder i koden (`se KVOTE.md`).

## Problemet

Ratinglister og arkiv leste tidligere **hele** Firestore-samlinger
(`playerCategoryRatings`, `playerAllround`, `sessions`) — på tvers av
ALLE klubber i det delte prosjektet — og filtrerte/sorterte i
klienten. Kostnaden vokste med total mengde data i hele prosjektet,
ikke med én klubbs egen bruk, og ble verre for hver økt som ble
spilt, for alltid.

## Endringene

### 1. Leaderboards (`domain-repository-leaderboardRepository.js`)
Nytt: `leaderboards/{klubbId}_{fane}` — ett ferdig-sortert, kappet
(maks 50 rader) dokument per klubb+fane. Vedlikeholdes av de samme
skriveoperasjonene som allerede oppdaterer `playerCategoryRatings`/
`playerAllround`:
- `domain-repository-firestoreRatingRepository.js` sin
  `lagreOktResultat()` (etter fullført økt) og `lagreAllroundFlere()`.
- `screens-ratingLists.js` sin `lagreRedigertRating()` (manuell
  admin-redigering) og `slettSpillerData()` (fjerner spilleren fra
  leaderboardet ved sletting).

**Ratinglisten leser nå ÉTT dokument** (`tegnListe()` i
`screens-ratingLists.js`) i stedet for å scanne hele
`playerCategoryRatings`/`playerAllround`.

`playerCategoryRatings`/`playerAllround` er selv IKKE omstrukturert —
de er fortsatt kilden til sannhet (spillerprofil-grafen leser
fortsatt derfra), leaderboardet er en ren, ekstra lese-optimalisert
kopi.

**Race condition, viktig hvis du utvider dette videre:** flere
spilleres rad kan ALDRI oppdateres med separate "les gjeldende, skriv
ny"-kall mot samme leaderboard-dokument (parallelt eller i samme
batch) — den siste skrivingen vinner og de andre forsvinner sporløst.
Bruk alltid bulk-varianten (`oppdaterLeaderboardRader()`, flertall)
som slår sammen alle endringene i minnet FØR én eneste lesing+skriving.
Se kommentaren i `leaderboardRepository.js` for detaljer.

### 2. Klubb-scopet arkiv (`firebase.js`: `oktSamling()`/`oktDok()`)
Nytt: `klubber/{klubbId}/sessions/{oktId}` — erstatter den flate
`sessions`-samlingen (nå `SAM.SESSIONS_LEGACY`, kun brukt av
migreringsscriptet). Hver spørring er nå naturlig avgrenset til egen
klubb helt uten filter:
- `screens-archive.js` sin `visArkiv()` — `limit(50)` er nå en ekte,
  håndhevet grense på selve spørringen.
- `screens-ratingLists.js` sin `hentHistorikkForSpiller()` — bruker nå
  `where('spillerIder','array-contains', spillerId)` mot klubbens
  subcollection i stedet for å lese opptil 200 økter og lete etter
  treff i klienten. `spillerIder` er et denormalisert felt lagt til på
  hvert øktdokument spesifikt for dette (se `lagreOktResultat()`).
- Admin-sletting av arkiv (`slettArkivForKlubb()`) er nå triviell —
  slett subcollection-en direkte, ingen filtrering nødvendig.

### 3. Persistert cache (`cache-helpers.js`)
`_ratingCache`/`_arkivCache` speiles nå til `sessionStorage` (med
samme TTL-logikk som før), slik at de overlever en sideoppdatering —
viktig på en PWA som ofte "drepes" og lastes på nytt på mobil. TTL
økt fra 5 til hhv. 20/15 minutter siden aktiv invalidering (kalt rett
etter enhver skriving) uansett holder dataen fersk for de som faktisk
gjør endringer.

### 4. `firestore.rules`
Strukturell validering lagt til på alle 1-vs-1-samlinger (avviser
dokumenter som ikke matcher forventet skjema). **Viktig begrensning:**
appen har ingen ekte autentisering (PIN sjekkes kun i nettleseren), så
dette stopper søppel-/bot-trafikk, IKKE en målrettet aktør. Se
kommentaren øverst i `firestore.rules` for hva som trengs for ekte
tilgangskontroll (Firebase Auth + Cloud Function, eller App Check).

## Utrulling — rekkefølge

1. **Deploy ny `firestore.rules`** (`firebase deploy --only firestore:rules`).
2. **Deploy ny kode** (alle `.js`-filene + `sw.js` med bumpet
   `VERSJON`, + de to nye filene `cache-helpers.js` og
   `domain-repository-leaderboardRepository.js`).
3. **Kjør `migrer-engangs.html` ÉN gang** i nettleseren (åpnes fra
   samme sted som resten av appen er hostet, siden den importerer
   `firebase.js` med en relativ sti):
   - Steg 1: bygger leaderboards fra eksisterende
     `playerCategoryRatings`/`playerAllround`.
   - Steg 2: kopierer gamle `sessions`-dokumenter inn i riktig
     `klubber/{klubbId}/sessions`-subcollection.
   - Steg 3 (valgfritt, gjør til slutt, kun etter at du har verifisert
     at arkivet fungerer for alle klubber i selve appen): sletter den
     gamle, flate `sessions`-samlingen permanent.
4. Fjern `migrer-engangs.html` fra serveren når migreringen er
   bekreftet vellykket — den skal ikke ligge tilgjengelig i
   produksjon i det lange løp.
5. Når du har bekreftet at alt fungerer og kjørt steg 3: fjern
   `match /sessions/{oktId}`-blokken fra `firestore.rules` og
   `SAM.SESSIONS_LEGACY` fra `firebase.js`.

## Ikke gjort i denne runden (bevisst avgrenset)

- `playerCategoryRatings`/`playerCompetitionProgress`/`playerAllround`
  har fortsatt ikke `klubbId`-felt. Admin-slettingen
  (`slettAllRatingForKlubb()`) leser derfor fortsatt disse samlingene
  i sin helhet og filtrerer på spillerIder — sjelden brukt handling,
  lavere prioritet enn de vanlige lese-stiene som nå er løst.
- Ekte tilgangskontroll (kun riktig klubbs admin kan skrive for DEN
  klubben) — krever ny autentiseringsmekanisme, se `firestore.rules`.
