// ════════════════════════════════════════════════════════
// app.js — Inngangspunkt
// Importerer alle moduler og kobler dem sammen.
// All domene-logikk er fordelt i egne filer:
//
//   firebase.js  — Firebase-oppsett, konstanter, SDK-re-eksport
//   state.js     — Delt app-tilstand (app-objekt, erMix)
//   ui.js        — Toast, navigasjon, sveip, UI-lås, XSS-escaping
//   rating.js    — Elo-beregning, nivå-fargekoding, trendanalyse
//   rotasjon.js  — Banefordeling, Mix & Match-matchmaking
//   admin.js     — PIN-system, Firestore-låsesystem
//   app.js       — Spillerlistehåndtering, økt-livssyklus, baner,
//                  poengregistrering, profiler, arkiv, init
// ════════════════════════════════════════════════════════

import {
  db, SAM, STARTRATING, PARTER, PARTER_5, PARTER_6_DOBBEL, PARTER_6_SINGEL,
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch,
} from './firebase.js';

import { app, erMix }                                  from './state.js';
import { visMelding, visFBFeil, escHtml, naviger,
         lasUI, frigiUI, startFailSafe, stoppFailSafe } from './ui.js';
import { getNivaaKlasse, getNivaaLabel, getNivaaRatingHTML,
         beregnEloForOkt, eloForventet, beregnTrend }   from './rating.js';
import { fordelBaner, fordelBanerMix, lagMixKampoppsett,
         oppdaterMixStatistikk, hentMixStatistikk,
         neste6SpillerRunde, blandArray, getParter,
         beregnPoengForKamp }                           from './rotasjon.js';
import { krevAdmin, erAdmin, nullstillAdmin,
         lassTrening, lossTrening }                     from './admin.js';

// ════════════════════════════════════════════════════════
// HJEMSKJERM
// ════════════════════════════════════════════════════════
function visHjemStatus() {
  const dot        = document.getElementById('hjem-status-dot');
  const tekst      = document.getElementById('hjem-status-tekst');
  const sub        = document.getElementById('hjem-status-sub');
  const fortsett   = document.getElementById('hjem-fortsett-knapp');
  const startKnapp = document.getElementById('hjem-start-knapp');
  const harOkt     = !!app.treningId;

  if (dot) dot.classList.toggle('aktiv', harOkt);
  if (harOkt) {
    if (tekst) tekst.textContent = erMix() ? '🎲 Mix & Match pågår' : '🟢 Økt pågår';
    if (sub)   sub.textContent   = erMix()
      ? `Kamp ${app.runde} av ${app.maksRunder}`
      : `Runde ${app.runde} av ${app.maksRunder}`;
    if (fortsett)   fortsett.style.display    = 'block';
    if (startKnapp) startKnapp.textContent    = 'START NY ØKT';
  } else {
    if (tekst)      tekst.textContent         = 'Ingen aktiv økt';
    if (sub)        sub.textContent           = '';
    if (fortsett)   fortsett.style.display    = 'none';
    if (startKnapp) startKnapp.textContent    = 'START NY ØKT';
  }
}
window.visHjemStatus = visHjemStatus;

// ════════════════════════════════════════════════════════
// OPPSETT — TRINNVELGERE OG SPILLMODUS
// ════════════════════════════════════════════════════════
function juster(key, dir) {
  if (key === 'baner')  app.antallBaner  = Math.max(1, Math.min(7,  app.antallBaner  + dir));
  if (key === 'poeng')  app.poengPerKamp = Math.max(5, Math.min(50, app.poengPerKamp + dir));
  if (key === 'runder') app.maksRunder   = Math.max(1, Math.min(10, app.maksRunder   + dir));
  document.getElementById('verdi-baner').textContent  = app.antallBaner;
  document.getElementById('verdi-poeng').textContent  = app.poengPerKamp;
  document.getElementById('verdi-runder').textContent = app.maksRunder;
  document.getElementById('maks-hint').textContent    = app.poengPerKamp;
  visSpillere();
}
window.juster = juster;

function settSpillModus(modus) {
  app.spillModus = modus;
  document.getElementById('modus-knapp-konkurranse')?.classList.toggle('modus-aktiv', modus === 'konkurranse');
  document.getElementById('modus-knapp-mix')?.classList.toggle('modus-aktiv', modus === 'mix');
  const infoKonk = document.getElementById('modus-info-konkurranse');
  const infoMix  = document.getElementById('modus-info-mix');
  if (infoKonk) infoKonk.style.display = modus === 'konkurranse' ? 'block' : 'none';
  if (infoMix)  infoMix.style.display  = modus === 'mix'         ? 'block' : 'none';
  visSpillere();
}
window.settSpillModus = settSpillModus;

// ════════════════════════════════════════════════════════
// SPILLERLISTE (Firebase onSnapshot)
// ════════════════════════════════════════════════════════
let spillerLytterAvmeld = null;

function lyttPaaSpillere() {
  if (!db) return;
  if (spillerLytterAvmeld) { try { spillerLytterAvmeld(); } catch (_) {} }
  document.getElementById('spiller-laster').style.display = 'flex';
  spillerLytterAvmeld = onSnapshot(
    query(collection(db, SAM.SPILLERE), orderBy('rating', 'desc')),
    snap => {
      document.getElementById('spiller-laster').style.display = 'none';
      app.spillere = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      visSpillere();
    },
    feil => {
      document.getElementById('spiller-laster').style.display = 'none';
      visFBFeil('Feil ved lasting av spillere: ' + (feil?.message ?? feil));
    }
  );
}

function lagSpillerHTML(s, erAktiv, erVente) {
  const navn   = s.navn ?? 'Ukjent';
  const ini    = navn.split(' ').map(w => w[0] ?? '').join('').slice(0,2).toUpperCase() || '?';
  const rating = typeof s.rating === 'number' ? s.rating : STARTRATING;
  let kl       = 'spiller-element';
  let merke    = '';
  if (erAktiv) { kl += ' valgt'; }
  if (erVente) { kl += ' ventende'; merke = '<span class="vl-merke">VL</span>'; }
  const hake = (erAktiv || erVente)
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : '';
  if (!erAktiv && !erVente && !erMix()) kl += ' ' + getNivaaKlasse(rating);
  const ratingLinje = erMix()
    ? ''
    : `<div style="font-family:'DM Mono',monospace;font-size:15px">⭐ ${getNivaaRatingHTML(rating)}</div>`;
  return `<div class="${escHtml(kl)}" data-id="${escHtml(s.id)}" onclick="veksleSpiller('${escHtml(s.id)}')">
    <div class="spiller-avatar">${escHtml(ini)}</div>
    <div style="flex:1">
      <div style="font-size:18px;font-weight:500">${escHtml(navn)}</div>
      ${ratingLinje}
    </div>
    ${merke}
    <div class="spiller-hake">${hake}</div>
  </div>`;
}

function _beregnSpillerStatus() {
  const er6Format = app.antallBaner === 2 && app.valgtIds.size === 6;
  const min       = er6Format ? 6 : app.antallBaner * 4;
  const sorterte  = [...app.valgtIds]
    .map(id => (app.spillere ?? []).find(s => s.id === id))
    .filter(Boolean)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return {
    min, er6Format,
    aktiveIds:   new Set(sorterte.slice(0, min).map(s => s.id)),
    ventendeIds: new Set(sorterte.slice(min).map(s => s.id)),
  };
}

function _oppdaterSpillerTellere(min, er6Format) {
  const n = app.valgtIds.size;
  document.getElementById('valgt-antall').textContent  = n;
  document.getElementById('aktive-antall').textContent = Math.min(n, min);
  document.getElementById('vl-antall').textContent     = Math.max(0, n - min);
  document.getElementById('start-knapp').disabled      = n < (er6Format ? 6 : min);
  const spillerInfoEl = document.getElementById('spiller-info');
  if (spillerInfoEl) {
    spillerInfoEl.innerHTML = er6Format
      ? `Nøyaktig <span id="min-antall" style="color:var(--yellow);font-weight:700">6</span> spillere <span style="color:var(--muted)">— 4 dobbel + 2 singel format aktivert</span>`
      : `Minst <span id="min-antall" style="color:var(--yellow);font-weight:700">${min}</span> spillere <span style="color:var(--muted)">— ekstra settes på venteliste</span>`;
  }
}

function visSpillere() {
  const q          = (document.getElementById('sok-inndata').value ?? '').toLowerCase();
  const { min, er6Format, aktiveIds, ventendeIds } = _beregnSpillerStatus();
  const filtrerte  = (app.spillere ?? []).filter(s => (s.navn ?? '').toLowerCase().includes(q));
  document.getElementById('spiller-liste').innerHTML = filtrerte.map(s =>
    lagSpillerHTML(s, aktiveIds.has(s.id), ventendeIds.has(s.id))
  ).join('');
  _oppdaterSpillerTellere(min, er6Format);
}
window.visSpillere = visSpillere;

function _oppdaterSpillerListeInPlace() {
  const { min, er6Format, aktiveIds, ventendeIds } = _beregnSpillerStatus();
  document.querySelectorAll('#spiller-liste [data-id]').forEach(el => {
    const sid     = el.dataset.id;
    const erAktiv = aktiveIds.has(sid);
    const erVente = ventendeIds.has(sid);
    const erValgt = erAktiv || erVente;
    const spiller = (app.spillere ?? []).find(s => s.id === sid);
    const rating  = spiller?.rating ?? STARTRATING;
    el.className  = 'spiller-element'
      + (erAktiv ? ' valgt'    : '')
      + (erVente ? ' ventende' : '')
      + (!erValgt && !erMix() ? ' ' + getNivaaKlasse(rating) : '');
    const hakeEl = el.querySelector('.spiller-hake');
    if (hakeEl) hakeEl.innerHTML = erValgt
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
      : '';
    const eksVL = el.querySelector('.vl-merke');
    if (erVente && !eksVL) {
      const m = document.createElement('span');
      m.className = 'vl-merke'; m.textContent = 'VL';
      el.insertBefore(m, hakeEl);
    } else if (!erVente && eksVL) { eksVL.remove(); }
  });
  _oppdaterSpillerTellere(min, er6Format);
}

let _sokTimer = null, _sokBrukerInput = false;
document.getElementById('sok-inndata')?.addEventListener('keydown', () => { _sokBrukerInput = true; });
document.getElementById('sok-inndata')?.addEventListener('input', () => {
  if (!_sokBrukerInput) return;
  _sokBrukerInput = false;
  clearTimeout(_sokTimer);
  _sokTimer = setTimeout(visSpillere, 150);
});

function veksleSpiller(id) {
  if (!id) return;
  if (app.valgtIds.has(id)) {
    app.valgtIds.delete(id);
  } else {
    app.valgtIds.add(id);
    const sok = document.getElementById('sok-inndata');
    if (sok && sok.value !== '') { clearTimeout(_sokTimer); sok.value = ''; }
  }
  _oppdaterSpillerListeInPlace();
}
window.veksleSpiller = veksleSpiller;

async function leggTilSpiller() {
  if (!db) { visMelding('Firebase ikke tilkoblet.', 'feil'); return; }
  const inp  = document.getElementById('ny-spiller-inndata');
  const navn = (inp.value ?? '').trim();
  if (!navn)            { visMelding('Skriv inn et navn først.', 'advarsel'); return; }
  if (navn.length > 50) { visMelding('Navnet er for langt (maks 50 tegn).', 'advarsel'); return; }
  if (app.spillere.some(s => (s.navn ?? '').toLowerCase() === navn.toLowerCase())) {
    visMelding('En deltaker med det navnet finnes allerede!', 'feil'); return;
  }
  try {
    const ref = await addDoc(collection(db, SAM.SPILLERE), {
      navn, rating: STARTRATING, opprettetDato: serverTimestamp(),
    });
    app.spillere.push({ id: ref.id, navn, rating: STARTRATING });
    app.valgtIds.add(ref.id);
    inp.value = '';
    document.getElementById('sok-inndata').value = '';
    visSpillere();
    visMelding(navn + ' lagt til!');
  } catch (e) {
    visFBFeil('Kunne ikke legge til spiller: ' + (e?.message ?? e));
  }
}
window.leggTilSpiller = leggTilSpiller;

// ════════════════════════════════════════════════════════
// NAVIGASJON-HENDELSER (kobler naviger() til skjerm-funksjoner)
// ════════════════════════════════════════════════════════
document.addEventListener('navigert', ({ detail: { skjerm } }) => {
  if (skjerm === 'baner')    visBaner();
  if (skjerm === 'slutt')    visSluttresultat();
  if (skjerm === 'spillere') oppdaterGlobalLedertavle();
  if (skjerm === 'arkiv')    lastArkiv();
  if (skjerm === 'hjem')     visHjemStatus();
});

// ════════════════════════════════════════════════════════
// RESTEN AV APPLIKASJONSLOGIKKEN
// (startTrening, lyttere, baner, poeng, resultater,
//  profiler, arkiv, admin-funksjoner, init)
//
// Disse funksjonene er uendret fra original app.js og
// plasseres her. De er utelatt i dette eksempelet for
// korthetens skyld — kopier dem direkte fra original.
// ════════════════════════════════════════════════════════

// ... (resten av funksjonene fra original app.js) ...
