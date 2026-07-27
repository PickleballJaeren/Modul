// ════════════════════════════════════════════════════════
// registerPlayers.js — Registrer deltakere-skjermen
// ════════════════════════════════════════════════════════

import { escHtml, naviger, visMelding } from './ui.js';
import {
  erDeltaker, veksleDeltaker, hentOkt, settStartBaner,
  hentRatingService, hentSpillerKart, leggTilLokalt, navnFor,
} from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { visAktivOkt } from './screens-activeSession.js';

let spillerKart = new Map(); // id -> navn, satt etter hentSpillerKart()

export async function visRegistrerDeltakere() {
  const okt = hentOkt();
  if (!okt) { naviger('konkurranser'); return; }

  document.getElementById('registrer-deltakere-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('registrer-deltakere');

  const container = document.getElementById('registrer-deltakere-innhold');
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter spillere…</div>';

  spillerKart = await hentSpillerKart();
  tegnListe();
}

function tegnListe() {
  const okt = hentOkt();
  const container = document.getElementById('registrer-deltakere-innhold');

  const radHtml = [...spillerKart.entries()].map(([id, navn]) => `
    <div class="sl-spillervelger-rad" onclick="window.veksleSpillerValgt('${id}')">
      <span>${escHtml(navn)}</span>
      <span>${erDeltaker(id) ? '✓' : '+'}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="sl-spillervelger-treff" style="max-height:none">
      ${spillerKart.size ? radHtml : '<div class="tom-tilstand-liten">Ingen spillere funnet</div>'}
    </div>
  `;

  document.getElementById('deltaker-teller').textContent = `${okt.deltakerIder.length} valgt`;
}

export function veksleSpillerValgt(spillerId) {
  veksleDeltaker(spillerId);
  tegnListe();
}
window.veksleSpillerValgt = veksleSpillerValgt;

export function leggTilManuellSpiller() {
  const input = document.getElementById('manuell-navn-input');
  const navn = input.value.trim();
  if (!navn) return;
  const id = `manuell_${navn.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  spillerKart.set(id, navn);
  leggTilLokalt(id, navn);
  veksleDeltaker(id);
  input.value = '';
  tegnListe();
}
window.leggTilManuellSpiller = leggTilManuellSpiller;

export async function startOktFraDeltakere() {
  const okt = hentOkt();
  if (!okt || okt.deltakerIder.length < 2) {
    visMelding('Velg minst 2 spillere', 'advarsel');
    return;
  }
  const ratingService = hentRatingService();
  const baner = await ratingService.genererBaner(okt.konkurranse, okt.deltakerIder);
  settStartBaner(baner);
  visAktivOkt();
}
window.startOktFraDeltakere = startOktFraDeltakere;

/** Slår opp visningsnavn for en spillerId -- brukt av senere skjermer. */
export function hentSpillerNavn(spillerId) {
  return spillerKart.get(spillerId) ?? navnFor(spillerId);
}
