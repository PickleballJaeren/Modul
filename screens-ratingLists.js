// ════════════════════════════════════════════════════════
// ratingLists.js — Ratinglister-skjermen
// Åpner alltid på Allround. Kategoriknappene bytter hvilken liste
// som vises, uten å navigere bort fra skjermen.
// ════════════════════════════════════════════════════════

import { db, SAM, collection, query, where, orderBy, limit, getDocs } from './firebase.js';
import { lagBatchHjelper } from './batch-helpers.js';
import { escHtml, naviger, visMelding } from './ui.js';
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

// ════════════════════════════════════════════════════════
// ADMINISTRASJON — slett all rating / arkiv for aktiv klubb
//
// Ratinger og økter lagres ikke med klubbId direkte i Firestore (se
// ARKITEKTUR.md-datamodellen); avgrensningen til "aktiv klubb" skjer
// derfor ved å slå opp hvilke spillerIder som tilhører klubben (samme
// players-oppslag som resten av appen bruker), og kun slette/behandle
// dokumenter som gjelder disse spillerIdene.
// ════════════════════════════════════════════════════════
async function hentKlubbSpillerIder() {
  const kart = await hentSpillerKart(); // Map<spillerId, navn>, filtrert på aktiv klubb
  return new Set(kart.keys());
}

function apneSlettBekreft(tittel, tekst, handling) {
  document.getElementById('slett-bekreft-tittel').textContent = tittel;
  document.getElementById('slett-bekreft-tekst').textContent = tekst;
  const knapp = document.getElementById('slett-bekreft-knapp');
  knapp.onclick = async () => {
    knapp.disabled = true;
    knapp.textContent = 'Sletter…';
    try {
      await handling();
      lukkSlettBekreft();
      visMelding('Slettet');
      // Om vi nettopp slettet ratingen som vises, tegn listen på nytt tom.
      await tegnListe();
    } catch (e) {
      console.error('[admin] Sletting feilet:', e);
      visMelding('Noe gikk galt under slettingen', 'feil');
    } finally {
      knapp.disabled = false;
      knapp.textContent = 'Ja, slett';
    }
  };
  document.getElementById('modal-slett-bekreft').style.display = 'flex';
}
window.lukkSlettBekreft = function () {
  document.getElementById('modal-slett-bekreft').style.display = 'none';
};

async function slettAllRatingForKlubb() {
  const klubbSpillerIder = await hentKlubbSpillerIder();
  const bh = lagBatchHjelper(db);

  for (const samling of [SAM.PLAYER_CATEGORY_RATINGS, SAM.PLAYER_COMPETITION_PROGRESS, SAM.PLAYER_ALLROUND]) {
    const snap = await getDocs(collection(db, samling));
    for (const d of snap.docs) {
      if (klubbSpillerIder.has(d.data().spillerId)) await bh.slett(d.ref);
    }
  }
  await bh.kommit();
}

async function slettArkivForKlubb() {
  const klubbSpillerIder = await hentKlubbSpillerIder();
  const bh = lagBatchHjelper(db);

  const snap = await getDocs(collection(db, SAM.SESSIONS));
  for (const d of snap.docs) {
    const okt = d.data();
    const tilhorerKlubb = (okt.resultatPerSpiller ?? []).some(r => klubbSpillerIder.has(r.spillerId));
    if (tilhorerKlubb) await bh.slett(d.ref);
  }
  await bh.kommit();
}

window.visAdminSeksjon = function () {
  window.krevAdmin('Administrasjon', 'Kun admin har tilgang til disse handlingene.', () => {
    const boks = document.getElementById('admin-seksjon-boks');
    if (boks) boks.style.display = 'block';
    const navn = document.getElementById('admin-seksjon-klubbnavn');
    if (navn) navn.textContent = window.hentAktivKlubbNavn?.() ?? 'klubben';
  });
};

window.slettRatingBekreft = function () {
  apneSlettBekreft(
    'Slett all rating?',
    `Sletter permanent alle elo-ratinger, allround-verdier og fremgangsstatus for spillerne i ${window.hentAktivKlubbNavn?.() ?? 'klubben'}. Dette kan ikke angres.`,
    slettAllRatingForKlubb,
  );
};

window.slettArkivBekreft = function () {
  apneSlettBekreft(
    'Slett arkiv?',
    `Sletter permanent alle arkiverte økter for ${window.hentAktivKlubbNavn?.() ?? 'klubben'}. Dette kan ikke angres.`,
    slettArkivForKlubb,
  );
};
