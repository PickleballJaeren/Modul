// ════════════════════════════════════════════════════════
// activeSession.js — Aktiv økt-skjermen
// Viser kun startoppsettet. Ingen registrering skjer her -- spillerne
// flytter seg fysisk mellom baner uten at appen involveres underveis.
// ════════════════════════════════════════════════════════

import { escHtml, naviger, visMelding } from './ui.js';
import {
  hentOkt, nullstillOkt, lagreAktivOktTilSky, slettAktivOktFraSky, hentSpillerKart,
  byttSpillerePaBane,
} from './state.js';
import { getErAdmin } from './admin.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';
import { visRegistrerSluttbane } from './screens-registerFinish.js';
import { apneSlettBekreft } from './screens-ratingLists.js';

export async function visAktivOkt() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('hjem'); return; }

  redigeringsModus = false;
  valgtSpillerId = null;

  // Sikrer spillernavn selv om vi kom hit direkte via "Pågående økt"-
  // kortet på hjemskjermen, uten å ha vært innom deltaker-skjermen der
  // navnecachen normalt fylles (hentSpillerKart() er selv cachet, så
  // dette er billig/øyeblikkelig for admin sin vanlige flyt).
  await hentSpillerKart();

  document.getElementById('aktiv-okt-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('aktiv-okt');
  tegnAktivOkt();
}

/**
 * Tegner kun innholdet uten å navigere/scrolle -- brukes ved sanntids-
 * oppdatering mens skjermen allerede vises (f.eks. hos noen som følger
 * økten på en annen enhet, se haandterAktivOktEndring() i app.js).
 */
export async function oppdaterAktivOktVisning() {
  const okt = hentOkt();
  if (!okt?.startBaner) return;
  await hentSpillerKart();
  tegnAktivOkt();
}

// ── Manuell redigering av baneoppsett ──────────────────────
// Av og på-bryter, admin-only. I redigeringsmodus blir hvert spillernavn
// klikkbart: trykk én spiller, så en annen, for å bytte dem mellom
// banene sine. Rekkefølgen innad på en bane har ingen betydning for
// rating-beregningen (se pairwiseAverageElo.js), så selve BYTTET er kun
// et spørsmål om hvem som havner sammen -- ikke om plassering på banen.
let redigeringsModus = false;
let valgtSpillerId = null;

function tegnAktivOkt() {
  const okt = hentOkt();
  const container = document.getElementById('aktiv-okt-innhold');
  const erAdmin = getErAdmin();

  const banerHtml = okt.startBaner.map(bane => `
    <div class="bane-rad">
      <span class="bane-nr">${String(bane.baneNr).padStart(2, '0')}</span>
      <div style="flex:1;min-width:0">
        ${bane.spillerIder.map(id => {
          const erKlikkbar = erAdmin && redigeringsModus;
          const erValgt = redigeringsModus && valgtSpillerId === id;
          return `<div class="bane-navn${erValgt ? ' bane-navn-valgt' : ''}"${erKlikkbar ? ` style="cursor:pointer" onclick="window.velgSpillerForBytte('${id}')"` : ''}>${escHtml(hentSpillerNavn(id))}</div>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  const redigerKnappHtml = erAdmin ? `
    <button class="knapp knapp-omriss" style="width:100%;margin-top:12px" onclick="window.veksleRedigeringsmodus()">
      ${redigeringsModus ? 'Ferdig med baneoppsett' : '✏️ Rediger baneoppsett'}
    </button>
  ` : '';

  // Skjuler Avslutt/Avbryt mens redigering pågår, for å unngå
  // utilsiktede trykk midt i en pågående bytte-handling.
  const handlingerHtml = (erAdmin && !redigeringsModus) ? `
    <button class="knapp knapp-primaer" style="margin-top:12px" onclick="window.avsluttOkt()">Avslutt økt</button>
    <button class="knapp knapp-fare knapp-liten" style="width:100%;margin-top:10px" onclick="window.avbrytOkt()">Avbryt økt</button>
  ` : '';

  container.innerHTML = `
    ${redigeringsModus ? '<div class="tom-tilstand-liten" style="margin-bottom:10px">Trykk to spillere for å bytte dem</div>' : ''}
    ${banerHtml}
    ${redigerKnappHtml}
    ${handlingerHtml}
  `;
}

export function veksleRedigeringsmodus() {
  redigeringsModus = !redigeringsModus;
  valgtSpillerId = null;
  tegnAktivOkt();
}
window.veksleRedigeringsmodus = veksleRedigeringsmodus;

export function velgSpillerForBytte(spillerId) {
  if (!valgtSpillerId) {
    valgtSpillerId = spillerId;
    tegnAktivOkt();
    return;
  }
  if (valgtSpillerId === spillerId) {
    valgtSpillerId = null; // trykket samme spiller igjen -- avbryt valget
    tegnAktivOkt();
    return;
  }
  byttSpillerePaBane(valgtSpillerId, spillerId);
  valgtSpillerId = null;
  tegnAktivOkt();
  lagreAktivOktTilSky().catch(e => console.error('[activeSession] Kunne ikke synkronisere baneendring:', e));
}
window.velgSpillerForBytte = velgSpillerForBytte;

export function avsluttOkt() {
  // PIN-gatet fordi skjermen nå også kan nås av andre enn den som startet
  // økten, via "Pågående økt"-kortet på hjemskjermen (skrivebeskyttet
  // frem til de ev. oppgir PIN-koden).
  window.krevAdmin('Avslutt økt', 'Bekreft med PIN for å registrere sluttresultat.', () => {
    visRegistrerSluttbane();
  });
}
window.avsluttOkt = avsluttOkt;

/** Avbryter økten uten å lagre noe resultat -- forsvinner for alle som følger den. */
export function avbrytOkt() {
  window.krevAdmin('Avbryt økt', 'Bekreft med PIN for å avbryte økten.', () => {
    apneSlettBekreft(
      'Avbryte økten?',
      'Økten avsluttes uten at resultater lagres, og forsvinner for alle som følger den. Dette kan ikke angres.',
      async () => {
        nullstillOkt();
        await slettAktivOktFraSky();
        naviger('hjem');
      },
      'Økten ble avbrutt',
    );
  });
}
window.avbrytOkt = avbrytOkt;
