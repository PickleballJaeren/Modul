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
  lagreAktivOktTilSky, fullforAktivOktISky, hentSpillerKart,
} from './state.js';
import { finnStartBane } from './domain-rating-courtAssignment.js';
import { getErAdmin } from './admin.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';
import { visOktResultat } from './screens-oktResultat.js';

export async function visRegistrerSluttbane() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('hjem'); return; }

  // Sikrer spillernavn selv om vi kom hit direkte via "Pågående økt"-
  // kortet, uten å ha vært innom deltaker-skjermen der navnecachen
  // normalt fylles.
  await hentSpillerKart();

  document.getElementById('sluttbane-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('registrer-sluttbane');
  tegn();
}

/**
 * Tegner kun innholdet uten å navigere/scrolle -- brukes ved sanntids-
 * oppdatering mens skjermen allerede vises (f.eks. noen som følger
 * resultatregistreringen live på en annen enhet).
 */
export async function oppdaterSluttbaneVisning() {
  const okt = hentOkt();
  if (!okt?.startBaner) return;
  await hentSpillerKart();
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
  const erAdmin = getErAdmin();

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
      // For ikke-admin (skrivebeskyttet visning) fjernes klikk-mulighet
      // og "+"-ikonet helt -- raden blir en ren, ikke-interaktiv rad.
      return erAdmin ? `
        <div class="sl-spillervelger-rad" onclick="window.plasserSpillerNeste('${id}')">
          <span>${escHtml(hentSpillerNavn(id))}</span>
          <span style="color:var(--muted2);font-size:16px">+</span>
        </div>
      ` : `
        <div class="sl-spillervelger-rad" style="cursor:default">
          <span>${escHtml(hentSpillerNavn(id))}</span>
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

  if (!erAdmin) {
    container.innerHTML = `
      <div class="sl-spillervelger-treff" style="max-height:none">
        ${raderHtml}
      </div>
    `;
    return;
  }

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
    <button class="knapp knapp-fare knapp-liten" style="width:100%;margin-top:16px" onclick="window.avbrytOkt()">Avbryt økt</button>
  `;
}

export function plasserSpillerNeste(spillerId) {
  // PIN-gatet: skjermen kan nå nås av andre enn admin (via "Pågående
  // økt"-kortet på hjemskjermen), så registrering må fortsatt kreve PIN.
  window.krevAdmin('Registrer plassering', 'Bekreft med PIN for å registrere resultater.', () => {
    plasserSpiller(spillerId);
    tegn();
    lagreAktivOktTilSky().catch(e => console.error('[registerFinish] Kunne ikke synkronisere:', e));
  });
}
window.plasserSpillerNeste = plasserSpillerNeste;

export function angreSisteSluttbane() {
  window.krevAdmin('Angre', 'Bekreft med PIN for å angre siste registrering.', () => {
    angreSisteePlassering();
    tegn();
    lagreAktivOktTilSky().catch(e => console.error('[registerFinish] Kunne ikke synkronisere:', e));
  });
}
window.angreSisteSluttbane = angreSisteSluttbane;

export function fullforOktRegistrering() {
  window.krevAdmin('Fullfør økt', 'Bekreft med PIN for å lagre resultatet.', () => {
    utforFullforing();
  });
}
window.fullforOktRegistrering = fullforOktRegistrering;

async function utforFullforing() {
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
    // Marker økten som fullført MED resultatet i skyen (i stedet for å
    // slette den) -- slik at andre som følger den ser resultatskjermen
    // også, se app.js sin haandterAktivOktEndring(). Fire-and-forget:
    // et eventuelt synk-problem her skal ikke vises som en feil når
    // selve resultatet faktisk ble lagret.
    fullforAktivOktISky(resultat).catch(e => console.error('[registerFinish] Kunne ikke dele resultatet:', e));
    visMelding('Økt fullført og lagret i arkivet');
    nullstillOkt();
    visOktResultat(resultat);
  } catch (e) {
    console.error('[registerFinish] Kunne ikke fullføre økt:', e);
    visMelding('Noe gikk galt ved lagring. Prøv igjen.', 'feil');
    tegn(); // gjenopprett skjermen slik at admin kan prøve på nytt
  }
}
