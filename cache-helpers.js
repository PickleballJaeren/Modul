// ════════════════════════════════════════════════════════
// cache-helpers.js — delt, sessionStorage-støttet TTL-cache
//
// HVORFOR: screens-ratingLists.js og screens-archive.js hadde tidligere
// hver sin cache som KUN lå i en modul-variabel -- den overlevde derfor
// aldri en sideoppdatering. På en PWA som ofte "drepes" og lastes på
// nytt i bakgrunnen på mobil, betyr det i praksis at cachen sjelden
// rakk å gjøre nytten sin: neste gang appen åpnes er den borte, og et
// nytt, fullt (eller nå leaderboard-baserte, men fortsatt ikke-gratis)
// oppslag må gjøres uansett. Ved å speile cachen til sessionStorage
// overlever den en reload, men forsvinner naturlig når fanen/appen
// lukkes helt -- akkurat den levetiden vi vil ha (data som er "ferskt
// nok for denne økta", ikke for alltid).
//
// Bruk:
//   const cache = lagSessionCache('sl_rating', 20 * 60 * 1000);
//   const cachet = cache.hent(nokkel);          // -> verdi | null (utløpt/mangler)
//   cache.sett(nokkel, verdi);
//   cache.slett(nokkel);                        // fjern én nøkkel
//   cache.tomAlt();                              // fjern alt under dette prefikset
// ════════════════════════════════════════════════════════

export function lagSessionCache(navnerom, ttlMs) {
  const prefiks = `pb_cache_${navnerom}_`;

  function fullNokkel(nokkel) {
    return prefiks + nokkel;
  }

  function hent(nokkel) {
    try {
      const raa = sessionStorage.getItem(fullNokkel(nokkel));
      if (!raa) return null;
      const { verdi, lagretMs } = JSON.parse(raa);
      if (Date.now() - lagretMs > ttlMs) {
        sessionStorage.removeItem(fullNokkel(nokkel));
        return null;
      }
      return verdi;
    } catch (e) {
      // sessionStorage kan feile (privat nettlesing, full kvote, o.l.) --
      // cache er alltid en valgfri optimalisering, aldri kritisk for at
      // appen skal fungere, så vi faller stille tilbake til "ikke cachet".
      return null;
    }
  }

  function sett(nokkel, verdi) {
    try {
      sessionStorage.setItem(fullNokkel(nokkel), JSON.stringify({ verdi, lagretMs: Date.now() }));
    } catch (e) {
      // se hent() -- trygt å ignorere
    }
  }

  function slett(nokkel) {
    try { sessionStorage.removeItem(fullNokkel(nokkel)); } catch (e) { /* se hent() */ }
  }

  function tomAlt() {
    try {
      const fjernes = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(prefiks)) fjernes.push(k);
      }
      fjernes.forEach(k => sessionStorage.removeItem(k));
    } catch (e) {
      // se hent() -- trygt å ignorere
    }
  }

  return { hent, sett, slett, tomAlt };
}
