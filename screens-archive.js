// ════════════════════════════════════════════════════════
// archive.js — Arkiv-skjermen
// Hver økt lagres direkte i sessions/-samlingen når den fullføres
// (se firestoreRatingRepository.js) -- ingen egen arkiv-samling.
// ════════════════════════════════════════════════════════

import { db, SAM, collection, query, orderBy, limit, getDocs } from './firebase.js';
import { escHtml, naviger } from './ui.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { IKON } from './screens-competitions.js';

export async function visArkiv() {
  naviger('arkiv');
  const container = document.getElementById('arkiv-innhold');
  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter arkiv…</div>';

  try {
    const q = query(collection(db, SAM.SESSIONS), orderBy('dato', 'desc'), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = '<div class="tom-tilstand">Ingen økter registrert ennå</div>';
      return;
    }

    container.innerHTML = snap.docs.map(d => {
      const okt = d.data();
      const dato = okt.dato?.toDate ? okt.dato.toDate() : new Date();
      const datoTekst = dato.toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' });
      const antall = okt.resultatPerSpiller?.length ?? 0;
      return `
        <div class="k-kort">
          <span class="k-kort-ikon">${IKON[okt.konkurranse] ?? '🏓'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:16px;font-weight:600">${escHtml(KONKURRANSE_NAVN[okt.konkurranse] ?? okt.konkurranse)}</div>
            <div style="font-size:12px;color:var(--muted2);margin-top:2px">${datoTekst}, ${antall} spillere</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('[arkiv] Kunne ikke hente økter:', e);
    container.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente arkivet</div>';
  }
}
