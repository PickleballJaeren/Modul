// ════════════════════════════════════════════════════════
// live.js — Selvstendig live-baneliste-side (live.html)
//
// Helt frikoblet fra resten av appen med hensikt: ingen PIN, ingen
// state.js/admin.js, ingen navigering mellom skjermer -- bare én ting,
// gjort skrivebeskyttet og enkelt. Gjenbruker KUN firebase.js (ren
// datatilgang, ingen UI-kobling) og styles.css (samme designspråk som
// resten av appen, slik at lenken føles som en del av "1 vs 1").
//
// Åpnes som live.html?klubb={klubbId}, delt av admin via "Del appen"
// på hjemskjermen (se renderLiveQR()/kopierLiveLenke() i app.js).
// ════════════════════════════════════════════════════════

import { db, SAM, doc, onSnapshot, collection, query, where, getDocs } from './firebase.js';
import { KONKURRANSE_NAVN } from './domain-constants.js';

// Samme emoji-sett som IKON i screens-competitions.js -- duplisert
// bevisst i stedet for importert, siden denne siden ikke skal dra med
// seg noen avhengighet til app.js-siden av appen (window.velgKonkurranse
// osv.). Hold i sync manuelt om nye konkurranser legges til.
const IKON = {
  dink_volley:      '🎯',
  volley_reset:     '⚡',
  volley_drive:     '⚡',
  '3rd_shot_drop':  '🛡️',
  singles:          '🙋',
};

// Klubbnavn til visning -- duplisert fra KLUBBER i app.js av samme
// grunn (fullstendig frikoblet side). PIN-koder trengs ikke her, siden
// denne siden aldri gjør noen skrivehandling.
const KLUBB_NAVN = {
  'pickleball-jaeren': 'Pickleball Jæren',
  'fokus-pickleball':  'Fokus Pickleball',
  'tsi-pickleball':    'TSI Pickleball',
  'loten-pickleball':  'Løten Tennisklubb',
  'demo':              'Demo',
};

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bevegelseBadge(startBaneNr, sluttBaneNr) {
  const diff = startBaneNr - sluttBaneNr; // positivt = flyttet opp (lavere banenr)
  if (startBaneNr == null || diff === 0) {
    return `<span class="beveg-badge beveg-lik">uendret</span>`;
  }
  if (diff > 0) return `<span class="beveg-badge beveg-opp">▲${diff}</span>`;
  return `<span class="beveg-badge beveg-ned">▼${Math.abs(diff)}</span>`;
}

// Speiler forsteSporData() i state.js -- duplisert bevisst, samme grunn
// som resten av filens dupliserte hjelpere (se toppkommentaren): denne
// siden skal aldri dra med seg en avhengighet til state.js.
function forsteSpor(data) {
  return data?.sporListe?.[0] ?? data ?? {};
}

const params = new URLSearchParams(location.search);
const klubbId = params.get('klubb');
const klubbNavn = klubbId ? (KLUBB_NAVN[klubbId] ?? null) : null;
const container = document.getElementById('live-innhold');

// Spillernavn-cache for aktiv klubb, pluss samme "ekstra navn"-fallback
// som resten av appen bruker for manuelt tillagte spillere (se
// flettInnSpillerNavn()/spillerNavn i state.js/app.js) -- her holdt som
// et enkelt objekt siden denne siden ikke har state.js å dele cache med.
let spillerKart = new Map();

async function hentSpillerKartForKlubb() {
  if (!klubbId) return;
  try {
    const q = query(collection(db, SAM.SPILLERE), where('klubbId', '==', klubbId));
    const snap = await getDocs(q);
    snap.docs.forEach(d => spillerKart.set(d.id, d.data().navn ?? d.id));
  } catch (e) {
    console.error('[live] Kunne ikke hente spillere:', e);
  }
}

function navnFor(id, ekstraNavn) {
  return spillerKart.get(id) ?? ekstraNavn?.[id] ?? id;
}

function tegnIngenKlubb() {
  container.innerHTML = `
    <div class="live-status">
      <div class="live-status-ikon">⚠️</div>
      <div class="live-status-tekst">Ugyldig eller manglende klubb-lenke</div>
    </div>
  `;
}

function tegnIngenAktiv() {
  container.innerHTML = `
    <div class="live-header">
      <div class="live-klubb">${escHtml(klubbNavn)}</div>
    </div>
    <div class="live-status">
      <div class="live-status-ikon">🏓</div>
      <div class="live-status-tekst">Ingen aktiv økt akkurat nå</div>
    </div>
  `;
}

function tegnAktiv(data) {
  const spor = forsteSpor(data);
  const baner = spor.startBaner ?? [];
  const antallPlassert = spor.plasseringer?.length ?? 0;
  container.innerHTML = `
    <div class="live-header">
      <div class="live-klubb">${escHtml(klubbNavn)}</div>
      <div class="live-tittel">${escHtml(IKON[spor.konkurranse] ?? '🏓')} ${escHtml(KONKURRANSE_NAVN[spor.konkurranse] ?? spor.konkurranse)}</div>
      <div class="live-badge live-badge-aktiv"><span class="live-prikk"></span> Aktiv nå</div>
    </div>
    <div class="seksjon-etikett">Baneliste${antallPlassert ? ` · ${antallPlassert} av ${spor.deltakerIder?.length ?? '?'} ferdig` : ''}</div>
    ${baner.map(bane => `
      <div class="bane-rad">
        <span class="bane-nr">${String(bane.baneNr).padStart(2, '0')}</span>
        <div style="flex:1;min-width:0">
          ${bane.spillerIder.map(id => `<div class="bane-navn">${escHtml(navnFor(id, data.spillerNavn))}</div>`).join('')}
        </div>
      </div>
    `).join('')}
    <div class="live-fotnote"><span class="live-prikk live-prikk-lite"></span> Oppdateres automatisk</div>
  `;
}

function tegnResultat(data) {
  const resultat = data.resultat ?? {};
  const sortert = [...(resultat.resultatPerSpiller ?? [])].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

  const raderHtml = sortert.map((r, i) => {
    const delta = r.delta ?? 0;
    const deltaKlasse = delta > 0 ? 'beveg-opp' : delta < 0 ? 'beveg-ned' : 'beveg-lik';
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${i < sortert.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:500">${escHtml(navnFor(r.spillerId, data.spillerNavn))}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">Bane ${r.startBane ?? '–'} → ${r.sluttBane ?? '–'}</div>
        </div>
        ${bevegelseBadge(r.startBane, r.sluttBane)}
        <span class="beveg-badge ${deltaKlasse}" style="margin-left:2px">${delta > 0 ? '+' : ''}${delta}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="live-header">
      <div class="live-klubb">${escHtml(klubbNavn)}</div>
      <div class="live-tittel">${escHtml(IKON[resultat.konkurranse] ?? '🏓')} ${escHtml(KONKURRANSE_NAVN[resultat.konkurranse] ?? resultat.konkurranse ?? '')}</div>
      <div class="live-badge live-badge-ferdig">Resultat klart</div>
    </div>
    <div class="kort" style="margin-top:14px">${raderHtml}</div>
    <div class="live-fotnote"><span class="live-prikk live-prikk-lite"></span> Oppdateres automatisk</div>
  `;
}

async function start() {
  if (!klubbId || !klubbNavn) { tegnIngenKlubb(); return; }

  await hentSpillerKartForKlubb();

  onSnapshot(
    doc(db, SAM.AKTIV_OKT, klubbId),
    snap => {
      if (!snap.exists()) { tegnIngenAktiv(); return; }
      const data = snap.data();
      // Fyll på med eventuelle nye spillernavn (manuelt tillagte osv.)
      // som er kommet til siden siden sist -- billig no-op om de
      // allerede finnes.
      if (data.spillerNavn) {
        Object.entries(data.spillerNavn).forEach(([id, navn]) => {
          if (!spillerKart.has(id)) spillerKart.set(id, navn);
        });
      }
      if (data.status === 'fullfort') tegnResultat(data);
      else tegnAktiv(data);
    },
    e => {
      console.error('[live] Lytting feilet:', e);
      container.innerHTML = `
        <div class="live-status">
          <div class="live-status-ikon">⚠️</div>
          <div class="live-status-tekst">Kunne ikke koble til. Sjekk nettforbindelsen.</div>
        </div>
      `;
    },
  );
}

start();
