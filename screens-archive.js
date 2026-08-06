// ════════════════════════════════════════════════════════
// archive.js — Arkiv-skjermen
// Hver økt lagres direkte i sessions/-samlingen når den fullføres
// (se firestoreRatingRepository.js) -- ingen egen arkiv-samling.
// ════════════════════════════════════════════════════════

import { db, SAM, collection, query, orderBy, getDocs } from './firebase.js';
import { escHtml, naviger } from './ui.js';
import { hentSpillerKart, hentAktivKlubbId } from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { IKON } from './screens-competitions.js';
import { bevegelseBadge } from './screens-registerFinish.js';
import { hentKlubbSpillerIder } from './screens-ratingLists.js';

// oktId -> rå Firestore-data, satt ved visArkiv(). Brukes av
// visOktDetaljer() slik at vi slipper å hente økten på nytt ved klikk.
let oktKart = new Map();

// ════════════════════════════════════════════════════════
// CACHE — sessions har ingen klubbId-felt, så spørringen leser HELE
// samlingen (alle klubber, all historikk) hver gang Arkiv åpnes.
// Cachet 5 min per klubb -- samme begrunnelse/mønster som i
// screens-ratingLists.js sin RATING_TTL_MS. exportOppdaterArkivCache()
// kan kalles fra andre moduler (f.eks. etter sletting av arkivet i
// screens-ratingLists.js) for å tvinge en fersk henting neste besøk.
// ════════════════════════════════════════════════════════
const ARKIV_TTL_MS = 5 * 60 * 1000;
let _arkivCache = null; // { klubbId, klubbOkter, hentetMs } | null

export function nullstillArkivCache() {
  _arkivCache = null;
}

function datoTekstFor(okt) {
  const dato = okt.dato?.toDate ? okt.dato.toDate() : new Date();
  return dato.toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tegnArkivListe(container, klubbOkter) {
  oktKart.clear();
  if (klubbOkter.length === 0) {
    container.innerHTML = '<div class="tom-tilstand">Ingen økter registrert ennå</div>';
    return;
  }

  container.innerHTML = klubbOkter.map(({ id, okt }) => {
    oktKart.set(id, okt);
    const antall = okt.resultatPerSpiller?.length ?? 0;
    return `
      <div class="k-kort" onclick="window.visOktDetaljer('${id}')">
        <span class="k-kort-ikon">${IKON[okt.konkurranse] ?? '🏓'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:600">${escHtml(KONKURRANSE_NAVN[okt.konkurranse] ?? okt.konkurranse)}</div>
          <div style="font-size:12px;color:var(--muted2);margin-top:2px">${datoTekstFor(okt)}, ${antall} spillere</div>
        </div>
      </div>
    `;
  }).join('');
}

export async function visArkiv(tvingOppdatering = false) {
  naviger('arkiv');
  const container = document.getElementById('arkiv-innhold');
  const klubbId = hentAktivKlubbId();

  if (!tvingOppdatering && _arkivCache && _arkivCache.klubbId === klubbId
      && (Date.now() - _arkivCache.hentetMs) < ARKIV_TTL_MS) {
    tegnArkivListe(container, _arkivCache.klubbOkter);
    return;
  }

  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter arkiv…</div>';

  try {
    // VIKTIG: sessions har ingen klubbId-felt (se ARKITEKTUR.md-
    // datamodellen), så spørringen returnerer økter fra ALLE klubber.
    // Filtrerer på klientsiden mot klubbens kjente spiller-IDer -- samme
    // mønster som brukes for administrasjons-slettingen (og nå også
    // ratinglisten, se hentKlubbSpillerIder() i screens-ratingLists.js).
    // Uten dette ville andre klubbers økter vist seg her. Resultatet
    // caches (se ARKIV_TTL_MS over) siden dette er en full, ufiltrert
    // samlings-lesing.
    const klubbSpillerIder = await hentKlubbSpillerIder();
    const q = query(collection(db, SAM.SESSIONS), orderBy('dato', 'desc'));
    const snap = await getDocs(q);

    const klubbOkter = snap.docs
      .filter(d => (d.data().resultatPerSpiller ?? []).some(r => klubbSpillerIder.has(r.spillerId)))
      .slice(0, 50)
      .map(d => ({ id: d.id, okt: d.data() }));

    _arkivCache = { klubbId, klubbOkter, hentetMs: Date.now() };
    tegnArkivListe(container, klubbOkter);
  } catch (e) {
    console.error('[arkiv] Kunne ikke hente økter:', e);
    container.innerHTML = '<div class="tom-tilstand-liten">Kunne ikke hente arkivet</div>';
  }
}

// ════════════════════════════════════════════════════════
// ØKTDETALJER — modal som viser resultatet per spiller for én
// tidligere økt: elo før -> etter og bevegelse, sortert etter
// sluttplassering (samme badge-stil som registerFinish.js).
// ════════════════════════════════════════════════════════
export async function visOktDetaljer(oktId) {
  const okt = oktKart.get(oktId);
  if (!okt) return;

  document.getElementById('okt-detaljer-tittel').textContent = KONKURRANSE_NAVN[okt.konkurranse] ?? okt.konkurranse;
  document.getElementById('okt-detaljer-dato').textContent = datoTekstFor(okt);

  const innhold = document.getElementById('okt-detaljer-innhold');
  innhold.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter spillere…</div>';
  document.getElementById('modal-okt-detaljer').style.display = 'flex';

  const spillerKart = await hentSpillerKart();
  const rader = [...(okt.resultatPerSpiller ?? [])].sort(
    (a, b) => (a.sluttBane ?? 999) - (b.sluttBane ?? 999),
  );

  innhold.innerHTML = rader.map(r => `
    <div class="bane-rad">
      <span class="bane-nr">${String(r.sluttBane ?? '–').padStart(2, '0')}</span>
      <span class="bane-navn" style="flex:1">${escHtml(spillerKart.get(r.spillerId) ?? r.spillerId)}</span>
      <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--muted2)">${r.eloFor} → ${r.eloEtter}</span>
      ${bevegelseBadge(r.startBane, r.sluttBane)}
    </div>
  `).join('') || '<div class="tom-tilstand-liten">Ingen resultater lagret for denne økten</div>';
}
window.visOktDetaljer = visOktDetaljer;

export function lukkOktDetaljer() {
  document.getElementById('modal-okt-detaljer').style.display = 'none';
}
window.lukkOktDetaljer = lukkOktDetaljer;
