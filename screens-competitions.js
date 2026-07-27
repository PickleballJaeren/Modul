// ════════════════════════════════════════════════════════
// competitions.js — Velg konkurranse-skjermen
// ════════════════════════════════════════════════════════

import {
  ALLE_KONKURRANSER, KONKURRANSE_NAVN, KONKURRANSE_TIL_KATEGORI, RATINGKATEGORI_NAVN,
} from './domain-constants.js';
import { escHtml, naviger } from './ui.js';
import { startNyOkt } from './state-oktState.js';
import { visRegistrerDeltakere } from './screens-registerPlayers.js';

export const IKON = {
  dink_volley:      '🎯',
  volley_reset:     '⚡',
  volley_drive:     '⚡',
  '3rd_shot_drop':  '🛡️',
  singles:          '🙋',
};

export function visKonkurranser() {
  const container = document.getElementById('konkurranser-innhold');
  if (!container) return;

  container.innerHTML = `
    <div class="seksjon-etikett">Konkurranser</div>
    ${ALLE_KONKURRANSER.map(k => {
      const kategori = KONKURRANSE_TIL_KATEGORI[k];
      return `
        <div class="k-kort" onclick="window.velgKonkurranse('${k}')">
          <span class="k-kort-ikon">${IKON[k] ?? '🏓'}</span>
          <span class="k-kort-navn">${escHtml(KONKURRANSE_NAVN[k])}</span>
          <span class="kat-tag kat-${kategori}">${escHtml(RATINGKATEGORI_NAVN[kategori])}</span>
        </div>
      `;
    }).join('')}
  `;

  naviger('konkurranser');
}

export function velgKonkurranse(konkurranse) {
  startNyOkt(konkurranse);
  visRegistrerDeltakere();
}
window.velgKonkurranse = velgKonkurranse;
