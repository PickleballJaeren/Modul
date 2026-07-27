// ════════════════════════════════════════════════════════
// registerFinish.js — Registrer sluttbane-skjermen
//
// Admin trykker spillerne i den rekkefølgen de faktisk endte. To og to
// havner på hver bane (se oktState.beregnSluttbaner). Bevegelse vises
// ved å sammenligne med spillerens startbane fra baneoppsettet.
// ════════════════════════════════════════════════════════

import { escHtml, naviger, visMelding } from './ui.js';
import {
  hentOkt, plasserSpiller, angreSisteePlassering, erFerdigPlassert,
  beregnSluttbaner, nullstillOkt, hentRatingService,
} from './state.js';
import { finnStartBane } from './domain-rating-courtAssignment.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';

export function visRegistrerSluttbane() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('hjem'); return; }

  document.getElementById('sluttbane-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('registrer-sluttbane');
  tegn();
}

function bevegelseBadge(startBaneNr, sluttBaneNr) {
  const diff = startBaneNr - sluttBaneNr; // positivt = flyttet opp (lavere banenr)
  if (startBaneNr == null || diff === 0) {
    return `<span class="beveg-badge beveg-lik">uendret</span>`;
  }
  if (diff > 0) {
    return `<span class="beveg-badge beveg-opp">▲${diff}</span>`;
  }
  return `<span class="beveg-badge beveg-ned">▼${Math.abs(diff)}</span>`;
}

function tegn() {
  const okt = hentOkt();
  const container = document.getElementById('sluttbane-innhold');
  const sluttbaner = beregnSluttbaner(); // spillerId -> baneNr, kun for plasserte

  document.getElementById('sluttbane-teller').textContent =
    `${okt.plasseringer.length} av ${okt.deltakerIder.length}`;

  const uplassert = okt.deltakerIder.filter(id => !okt.plasseringer.includes(id));

  const plassertHtml = okt.plasseringer.map(id => {
    const startBaneNr = finnStartBane(okt.startBaner, id);
    const sluttBaneNr = sluttbaner.get(id);
    return `
      <div class="bane-rad">
        <span class="bane-nr">${String(sluttBaneNr).padStart(2, '0')}</span>
        <span class="bane-navn" style="flex:1">${escHtml(hentSpillerNavn(id))}</span>
        ${bevegelseBadge(startBaneNr, sluttBaneNr)}
      </div>
    `;
  }).join('');

  const uplassertHtml = uplassert.length ? `
    <div class="seksjon-etikett">Ikke plassert, trykk for neste bane</div>
    <div class="sl-spillervelger-treff" style="max-height:none">
      ${uplassert.map(id => `
        <div class="sl-spillervelger-rad" onclick="window.plasserSpillerNeste('${id}')">
          <span>${escHtml(hentSpillerNavn(id))}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const fullforHtml = erFerdigPlassert()
    ? `<button class="knapp knapp-primaer" style="margin-top:16px" onclick="window.fullforOktRegistrering()">Fullfør økt</button>`
    : '';

  container.innerHTML = `
    ${okt.plasseringer.length ? `
      <button class="knapp knapp-omriss" style="margin-bottom:16px" onclick="window.angreSisteSluttbane()">↩ Angre siste</button>
    ` : ''}
    ${plassertHtml}
    ${uplassertHtml}
    ${fullforHtml}
  `;
}

export function plasserSpillerNeste(spillerId) {
  plasserSpiller(spillerId);
  tegn();
}
window.plasserSpillerNeste = plasserSpillerNeste;

export function angreSisteSluttbane() {
  angreSisteePlassering();
  tegn();
}
window.angreSisteSluttbane = angreSisteSluttbane;

export async function fullforOktRegistrering() {
  const okt = hentOkt();
  const ratingService = hentRatingService();
  const sluttbaner = beregnSluttbaner();

  try {
    const resultat = await ratingService.beregnOktResultat(okt.konkurranse, okt.startBaner, sluttbaner);
    await ratingService.fullforOkt(resultat);
    visMelding('Økt fullført og lagret i arkivet');
    nullstillOkt();
    naviger('hjem');
  } catch (e) {
    console.error('[registerFinish] Kunne ikke fullføre økt:', e);
    visMelding('Noe gikk galt ved lagring. Prøv igjen.', 'feil');
  }
}
window.fullforOktRegistrering = fullforOktRegistrering;
