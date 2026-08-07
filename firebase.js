// ════════════════════════════════════════════════════════
// firebase.js — Firebase-oppsett og delte samlingsreferanser for 1 vs 1
// Samme mønster som Stafettligaen sin firebase.js.
// ════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc, addDoc, updateDoc, setDoc,
  getDoc, getDocs, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ════════════════════════════════════════════════════════
// MILJØ — bytt mellom 'prod' og 'test'
// ════════════════════════════════════════════════════════
const BRUK_MILJO = 'prod'; // 'prod' | 'test'

// Delt prosjekt med Stafettligaen (pickle-rank-5fbe5) -- egne samlinger,
// se SAM under. Samme config som i Stafettligaen sin firebase.js.
const FB_CONFIG_PROD = {
  apiKey:            'AIzaSyB_0rxDzHpV2HB6JdHm8SEHoGc8vE2F_rE',
  authDomain:        'pickle-rank-5fbe5.firebaseapp.com',
  projectId:         'pickle-rank-5fbe5',
  storageBucket:     'pickle-rank-5fbe5.firebasestorage.app',
  messagingSenderId: '761601873916',
  appId:             '1:761601873916:web:f3c13d21e809658fd80479',
};

const FB_CONFIG_TEST = FB_CONFIG_PROD; // sett opp eget test-prosjekt ved behov

const FB_CONFIG = BRUK_MILJO === 'test' ? FB_CONFIG_TEST : FB_CONFIG_PROD;

// ════════════════════════════════════════════════════════
// SAMLINGSREFERANSER
// ════════════════════════════════════════════════════════
export const SAM = {
  SPILLERE:                    'players',
  PLAYER_CATEGORY_RATINGS:     'playerCategoryRatings',   // id: {spillerId}_{kategori}
  PLAYER_COMPETITION_PROGRESS: 'playerCompetitionProgress', // id: {spillerId}_{konkurranse}
  PLAYER_ALLROUND:             'playerAllround',            // id: {spillerId}
  SESSIONS_LEGACY:             'sessions',                  // GAMMEL, flat arkivsamling -- kun brukt av engangs-migreringsscriptet (se migrer-engangs.html). Ny kode bruker oktSamling(klubbId)/oktDok() under.
  AKTIV_OKT:                   'activeSessions',            // id: {klubbId} -- pågående, delt økt

  // ── Ferdighetstester — egne samlinger, se domain-repository-firestoreTestRepository.js ──
  SKILL_TEST_RESULTATER:       'skillTestResults',          // id: {testType}_{timestamp} -- arkiv
  SKILL_TEST_TERSKLER:         'skillTestThresholds',       // id: {klubbId}_{testType}
  PLAYER_SKILL_TESTS:          'playerSkillTests',          // id: {spillerId}_{testType} -- gjeldende + historikk

  // ── Påmelding til treningsspor — egne samlinger, se domain-repository-firestorePameldingRepository.js ──
  PAMELDINGSRUNDER:            'pameldingsrunder',          // id: {klubbId} -- én aktiv runde per klubb
  SPOR_INTERESSE:              'sporInteresse',              // id: {klubbId}_{spillerId}

  // ── Leaderboards — ferdig-sorterte, ferdig-avgrensede kopier av
  // ratinglistene, én per klubb+fane (id: {klubbId}_{fane}, der fane er
  // 'allround' eller en av RatingKategori). Vedlikeholdes av samme
  // skriveoperasjoner som allerede oppdaterer playerCategoryRatings/
  // playerAllround (se domain-repository-leaderboardRepository.js) --
  // gjør at ratinglistene kan LESES med étt dokumentoppslag i stedet for
  // å scanne hele playerCategoryRatings/playerAllround-samlingene (alle
  // klubber) ved hvert besøk. Se KVOTE.md.
  LEADERBOARDS:                 'leaderboards',

  // ── Klubber (root for klubb-scopede subcollections) ──
  KLUBBER:                      'klubber',                   // id: {klubbId}, subcollection 'sessions' under hver
};

/**
 * Referanse til én klubbs økt-arkiv: klubber/{klubbId}/sessions/{oktId}.
 * Erstatter den tidligere flate SAM.SESSIONS-samlingen (som ikke hadde
 * noe klubbId-felt og derfor krevde at HELE samlingen -- alle klubber,
 * all historikk -- ble lest og filtrert i klienten hver gang arkivet
 * eller en spillerprofil ble åpnet). Med denne strukturen er hver
 * spørring naturlig avgrenset til égen klubb helt uten filter. Se
 * KVOTE.md for begrunnelse og migreringsnotat.
 */
export function oktSamling(klubbId) {
  return collection(db, SAM.KLUBBER, klubbId, 'sessions');
}
export function oktDok(klubbId, oktId) {
  return doc(db, SAM.KLUBBER, klubbId, 'sessions', oktId);
}

// ════════════════════════════════════════════════════════
// FIREBASE INIT
// ════════════════════════════════════════════════════════
let db;
try {
  const fbApp = initializeApp(FB_CONFIG);
  db = getFirestore(fbApp);
} catch (e) {
  console.error('[Firebase] Kunne ikke koble til:', e?.message ?? e);
}

export { db };

export {
  collection, doc, addDoc, updateDoc, setDoc,
  getDoc, getDocs, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch, runTransaction,
};
