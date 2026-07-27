// ════════════════════════════════════════════════════════
// ratingLists.js — Ratinglister-skjermen
// Åpner alltid på Allround. Kategoriknappene bytter hvilken liste
// som vises, uten å navigere bort fra skjermen.
// ════════════════════════════════════════════════════════

import { db, SAM, collection, query, where, orderBy, limit, getDocs } from './firebase.js';
import { escHtml, naviger } from './ui.js';
import { hentSpillerKart } from './state.js';
import { ALLE_KATEGORIER, RATINGKATEGORI_NAVN } from './domain-constants.js';

const FANER = [{ id: 'allround', navn: 'Allround' }, ...ALLE_KATEGORIER.map(k => ({ id: k, navn: RATINGKATEGORI_NAVN[k] }))];

let aktivFane = 'allround';

export async function visRatinglister() {
  naviger('ratinglister');
  await hentSpillerKart();
  tegnFaner();
  await tegnListe();
}

function tegnFaner() {
  const container = document.getElementById('ratinglister-innhold');
  container.innerHTML = `
    <div class="rating-faner">
      ${FANER.map(f => `
        <button class="rating-fane ${f.id === aktivFane ? 'aktiv' : ''} kat-tekst-${f.id}"
                onclick="window.byttRatingFane('${f.id}')">${escHtml(f.navn)}</button>
      `).join('')}
    </div>
    <div id="rating-liste-innhold" class="kort"><div class="laster"><span class="laster-snurr"></span>Laster…</div></div>
  `;
  document.getElementById('ratinglister-sub').textContent = FANER.find(f => f.id === aktivFane)?.navn ?? '';
}

export async function byttRatingFane(faneId) {
  aktivFane = faneId;
  tegnFaner();
  await tegnListe();
}
window.byttRatingFane = byttRatingFane;

async function tegnListe() {
  const listeContainer = document.getElementById('rating-liste-innhold');
  const spillerKart = await hentSpillerKart();

  let rader;
  try {
    if (aktivFane === 'allround') {
      const q = query(collection(db, SAM.PLAYER_ALLROUND), orderBy('allround', 'desc'), limit(50));
      const snap = await getDocs(q);
      rader = snap.docs.map(d => ({ spillerId: d.data().spillerId, verdi: d.data().allround }));
    } else {
      const q = query(
        collection(db, SAM.PLAYER_CATEGORY_RATINGS),
        where('kategori', '==', aktivFane),
        orderBy('elo', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      rader = snap.docs.map(d => ({ spillerId: d.data().spillerId, verdi: d.data().elo }));
    }
  } catch (e) {
    console.error('[ratingLists] Kunne ikke hente liste:', e);
    listeContainer.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente ratinglisten</div>';
    return;
  }

  if (rader.length === 0) {
    listeContainer.innerHTML = '<div class="tom-tilstand-liten">Ingen ratinger registrert ennå</div>';
    return;
  }

  listeContainer.innerHTML = rader.map((r, i) => `
    <div class="rating-rad">
      <span class="rating-plass">${i + 1}</span>
      <span class="rating-navn">${escHtml(spillerKart.get(r.spillerId) ?? r.spillerId)}</span>
      <span class="rating-verdi">${r.verdi}</span>
    </div>
  `).join('');
}
