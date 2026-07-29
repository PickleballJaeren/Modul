// ════════════════════════════════════════════════════════
// activeSession.js — Aktiv økt-skjermen
// Viser kun startoppsettet. Ingen registrering skjer her -- spillerne
// flytter seg fysisk mellom baner uten at appen involveres underveis.
// ════════════════════════════════════════════════════════

import { escHtml, naviger, visMelding } from './ui.js';
import { hentOkt, nullstillOkt, lagreAktivOktTilSky, slettAktivOktFraSky } from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { hentSpillerNavn } from './screens-registerPlayers.js';
import { visRegistrerSluttbane } from './screens-registerFinish.js';
import { apneSlettBekreft } from './screens-ratingLists.js';

export function visAktivOkt() {
  const okt = hentOkt();
  if (!okt?.startBaner) { naviger('hjem'); return; }

  document.getElementById('aktiv-okt-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse];
  naviger('aktiv-okt');
  tegnAktivOkt();
}

/**
 * Tegner kun innholdet uten å navigere/scrolle -- brukes ved sanntids-
 * oppdatering mens skjermen allerede vises (f.eks. hos noen som følger
 * økten på en annen enhet, se haandterAktivOktEndring() i app.js).
 */
export function oppdaterAktivOktVisning() {
  const okt = hentOkt();
  if (!okt?.startBaner) return;
  tegnAktivOkt();
}

function tegnAktivOkt() {
  const okt = hentOkt();
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
    <button class="knapp knapp-fare knapp-liten" style="width:100%;margin-top:10px" onclick="window.avbrytOkt()">Avbryt økt</button>
  `;
}

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
