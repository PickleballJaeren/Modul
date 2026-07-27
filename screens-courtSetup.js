// ════════════════════════════════════════════════════════
// courtSetup.js — Baneoppsett-skjermen
// Viser den automatisk genererte startfordelingen. Ingen manuell
// overstyring her -- se ARKITEKTUR.md / samtalen for begrunnelse.
// ════════════════════════════════════════════════════════

import { escHtml, naviger } from './ui.js';
import { hentOkt } from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';
import { visAktivOkt } from './screens-activeSession.js';

export function visBaneoppsett() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('registrer-deltakere'); return; }

  document.getElementById('baneoppsett-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('baneoppsett');

  const container = document.getElementById('baneoppsett-innhold');
  container.innerHTML = `
    ${okt.startBaner.map(bane => `
      <div class="bane-rad">
        <span class="bane-nr">${String(bane.baneNr).padStart(2, '0')}</span>
        <div style="flex:1;min-width:0">
          ${bane.spillerIder.map(id => `<div class="bane-navn">${escHtml(hentSpillerNavn(id))}</div>`).join('')}
        </div>
      </div>
    `).join('')}
    <button class="knapp knapp-primaer" style="margin-top:12px" onclick="window.startAktivOkt()">Start økt</button>
  `;
}

export function startAktivOkt() {
  visAktivOkt();
}
window.startAktivOkt = startAktivOkt;
