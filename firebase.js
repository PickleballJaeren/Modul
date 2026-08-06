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
  SESSIONS:                    'sessions',                  // = arkivet
  AKTIV_OKT:                   'activeSessions',            // id: {klubbId} -- pågående, delt økt

  // ── Ferdighetstester — egne samlinger, se domain-repository-firestoreTestRepository.js ──
  SKILL_TEST_RESULTATER:       'skillTestResults',          // id: {testType}_{timestamp} -- arkiv
  SKILL_TEST_TERSKLER:         'skillTestThresholds',       // id: {klubbId}_{testType}
  PLAYER_SKILL_TESTS:          'playerSkillTests',          // id: {spillerId}_{testType} -- gjeldende + historikk

  // ── Påmelding til treningsspor — egne samlinger, se domain-repository-firestorePameldingRepository.js ──
  PAMELDINGSRUNDER:            'pameldingsrunder',          // id: {klubbId} -- én aktiv runde per klubb
  SPOR_INTERESSE:              'sporInteresse',              // id: {klubbId}_{spillerId}
};

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
