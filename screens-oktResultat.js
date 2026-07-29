// ════════════════════════════════════════════════════════
// oktResultat.js — Øktresultat-skjermen
//
// Vises rett etter "Fullfør økt" i registerFinish.js -- MEN kan også
// vises hos tilskuere (skjermer som følger en delt økt live, se
// haandterAktivOktEndring() i app.js) idet admin fullfører den, eller
// ved å trykke "Pågående økt"-kortet etter at den er fullført. Tar
// imot resultatet direkte (samme objekt som ratingService.
// beregnOktResultat() returnerer, ev. hentet fra Firestore for en
// tilskuer) og tegner det opp -- ingen egen resultatberegning her.
// ════════════════════════════════════════════════════════

import { escHtml, naviger } from './ui.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';
import { bevegelseBadge } from './screens-registerFinish.js';
import { hentSpillerKart, slettAktivOktFraSky } from './state.js';

export async function visOktResultat(resultat) {
  // Sikrer spillernavn selv om vi kom hit som tilskuer uten å ha vært
  // innom deltaker-skjermen der navnecachen normalt fylles (billig/
  // øyeblikkelig når den allerede er lastet, som for admin sin vanlige flyt).
  await hentSpillerKart();

  document.getElementById('okt-resultat-tittel').textContent = KONKURRANSE_NAVN[resultat.konkurranse] ?? resultat.konkurranse;
  naviger('okt-resultat');

  const container = document.getElementById('okt-resultat-innhold');

  // Størst fremgang først -- gir en naturlig "vinnere øverst"-følelse.
  const sortert = [...resultat.resultatPerSpiller].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

  const raderHtml = sortert.map((r, i) => {
    const delta = r.delta ?? 0;
    const deltaKlasse = delta > 0 ? 'beveg-opp' : delta < 0 ? 'beveg-ned' : 'beveg-lik';
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${i < sortert.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:500">${escHtml(hentSpillerNavn(r.spillerId))}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">Bane ${r.startBane ?? '–'} → ${r.sluttBane ?? '–'}</div>
        </div>
        ${bevegelseBadge(r.startBane, r.sluttBane)}
        <span class="beveg-badge ${deltaKlasse}" style="margin-left:2px">${delta > 0 ? '+' : ''}${delta}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="kort">${raderHtml}</div>
    <button class="knapp knapp-primaer" style="width:100%;margin-top:16px" onclick="window.lukkOktResultat()">Ferdig</button>
  `;
}

/**
 * Lukker resultatskjermen og rydder bort den delte "aktiv økt"-
 * dokumentet i skyen (som frem til nå har inneholdt det fullførte
 * resultatet, se fullforAktivOktISky() i state.js) -- slik at
 * "Pågående økt"-kortet forsvinner for alle, ikke bare hos den som
 * trykker. Trygt å kalle flere ganger / fra flere enheter.
 */
export function lukkOktResultat() {
  slettAktivOktFraSky().catch(e => console.error('[oktResultat] Kunne ikke rydde bort delt økt:', e));
  naviger('hjem');
}
window.lukkOktResultat = lukkOktResultat;
