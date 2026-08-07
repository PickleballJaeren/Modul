// ════════════════════════════════════════════════════════
// archive.js — Arkiv-skjermen
// Hver økt lagres i klubbens EGEN subcollection (klubber/{klubbId}/
// sessions) når den fullføres, se domain-repository-
// firestoreRatingRepository.js sin lagreOktResultat() -- ingen egen
// arkiv-samling, og ikke lenger noen flat, delt samling på tvers av
// klubber (se KVOTE.md for hvorfor dette ble endret).
// ════════════════════════════════════════════════════════

import { oktSamling, query, orderBy, limit, getDocs } from './firebase.js';
import { escHtml, naviger } from './ui.js';
import { hentSpillerKart, hentAktivKlubbId } from './state.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';
import { IKON } from './screens-competitions.js';
import { bevegelseBadge } from './screens-registerFinish.js';
import { lagSessionCache } from './cache-helpers.js';

// oktId -> rå Firestore-data, satt ved visArkiv(). Brukes av
// visOktDetaljer() slik at vi slipper å hente økten på nytt ved klikk.
let oktKart = new Map();

// ════════════════════════════════════════════════════════
// CACHE — spørringen er nå naturlig avgrenset til egen klubb (subcollection
// + limit, se visArkiv() under), så dette er ikke lenger en "unngå å
// scanne alt"-cache, men en enkel "unngå unødvendige nettverkskall ved
// gjentatte besøk"-cache. Speilet til sessionStorage (se
// cache-helpers.js) slik at den overlever en sideoppdatering.
// ════════════════════════════════════════════════════════
const ARKIV_TTL_MS = 15 * 60 * 1000;
const _arkivCache = lagSessionCache('arkiv', ARKIV_TTL_MS);

export function nullstillArkivCache() {
  _arkivCache.tomAlt();
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

  const cachetOkter = !tvingOppdatering ? _arkivCache.hent(klubbId) : null;
  if (cachetOkter) {
    tegnArkivListe(container, cachetOkter);
    return;
  }

  container.innerHTML = '<div class="laster"><span class="laster-snurr"></span>Henter arkiv…</div>';

  try {
    // Spør KUN klubbens egen subcollection -- ingen klientside-filtrering
    // nødvendig lenger, siden strukturen selv garanterer at det som
    // ligger her tilhører denne klubben (se firebase.js/
    // firestoreRatingRepository.js). limit(50) er nå en ekte, håndhevet
    // grense på selve spørringen, ikke bare et kutt etter at alt allerede
    // er lest -- arkivet blir ikke dyrere å åpne etter hvert som klubben
    // spiller flere økter over tid.
    const q = query(oktSamling(klubbId), orderBy('dato', 'desc'), limit(50));
    const snap = await getDocs(q);
    const klubbOkter = snap.docs.map(d => ({ id: d.id, okt: d.data() }));

    _arkivCache.sett(klubbId, klubbOkter);
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
