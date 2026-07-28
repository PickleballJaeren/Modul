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
import { visOktResultat } from './screens-oktResultat.js';

export function visRegistrerSluttbane() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('hjem'); return; }

  document.getElementById('sluttbane-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('registrer-sluttbane');
  tegn();
}

export function bevegelseBadge(startBaneNr, sluttBaneNr) {
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

  // Spillerne vises alltid i SAMME rekkefølge (okt.deltakerIder), uansett
  // hvem som er plassert eller ikke -- de flyttes ALDRI til en egen liste.
  // Tidligere lå plasserte spillere i en liste over de uplasserte, som
  // vokste for hvert trykk og dyttet resten av teksten nedover. Nå
  // endres kun den ene raden som trykkes (dempes + får banenummer),
  // resten av listen står helt i ro.
  const raderHtml = okt.deltakerIder.map(id => {
    const erPlassert = okt.plasseringer.includes(id);
    if (!erPlassert) {
      return `
        <div class="sl-spillervelger-rad" onclick="window.plasserSpillerNeste('${id}')">
          <span>${escHtml(hentSpillerNavn(id))}</span>
          <span style="color:var(--muted2);font-size:16px">+</span>
        </div>
      `;
    }
    const startBaneNr = finnStartBane(okt.startBaner, id);
    const sluttBaneNr = sluttbaner.get(id);
    return `
      <div class="sl-spillervelger-rad" style="opacity:0.45;cursor:default">
        <span class="bane-nr" style="margin-right:10px">${String(sluttBaneNr).padStart(2, '0')}</span>
        <span style="flex:1">${escHtml(hentSpillerNavn(id))}</span>
        ${bevegelseBadge(startBaneNr, sluttBaneNr)}
      </div>
    `;
  }).join('');

  const fullforHtml = erFerdigPlassert()
    ? `<button class="knapp knapp-primaer" style="margin-top:16px" onclick="window.fullforOktRegistrering()">Fullfør økt</button>`
    : '';

  container.innerHTML = `
    ${okt.plasseringer.length ? `
      <button class="knapp knapp-omriss" style="margin-bottom:16px" onclick="window.angreSisteSluttbane()">↩ Angre siste</button>
    ` : ''}
    <div class="sl-spillervelger-treff" style="max-height:none">
      ${raderHtml}
    </div>
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

  // Vis laster-tilstand med det samme -- fullføring innebærer flere
  // Firestore-kall og kan ta litt tid ved store økter, så uten dette
  // ser det ut som appen henger. Hindrer også dobbelttrykk på knappen.
  const container = document.getElementById('sluttbane-innhold');
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Lagrer økt…</div>';

  try {
    const resultat = await ratingService.beregnOktResultat(okt.konkurranse, okt.startBaner, sluttbaner);
    await ratingService.fullforOkt(resultat);
    visMelding('Økt fullført og lagret i arkivet');
    nullstillOkt();
    visOktResultat(resultat);
  } catch (e) {
    console.error('[registerFinish] Kunne ikke fullføre økt:', e);
    visMelding('Noe gikk galt ved lagring. Prøv igjen.', 'feil');
    tegn(); // gjenopprett skjermen slik at admin kan prøve på nytt
  }
}
window.fullforOktRegistrering = fullforOktRegistrering;
