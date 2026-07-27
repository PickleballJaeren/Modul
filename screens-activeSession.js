// ════════════════════════════════════════════════════════
// activeSession.js — Aktiv økt-skjermen
// Viser kun startoppsettet. Ingen registrering skjer her -- spillerne
// flytter seg fysisk mellom baner uten at appen involveres underveis.
// ════════════════════════════════════════════════════════

import { escHtml, naviger } from './ui.js';
import { hentOkt } from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';
import { visRegistrerSluttbane } from './screens-registerFinish.js';

export function visAktivOkt() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('hjem'); return; }

  document.getElementById('aktiv-okt-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('aktiv-okt');

  const container = document.getElementById('aktiv-okt-innhold');
  container.innerHTML = `
    ${okt.startBaner.map(bane => `
      <div class="bane-rad">
        <span class="bane-nr">${String(bane.baneNr).padStart(2, '0')}</span>
        <div style="flex:1;min-width:0">
          ${bane.spillerIder.map(id => `<div class="bane-navn">${escHtml(hentSpillerNavn(id))}</div>`).join('')}
        </div>
      </div>
    `).join('')}
    <button class="knapp knapp-primaer" style="margin-top:12px" onclick="window.avsluttOkt()">Avslutt økt</button>
  `;
}

export function avsluttOkt() {
  visRegistrerSluttbane();
}
window.avsluttOkt = avsluttOkt;
