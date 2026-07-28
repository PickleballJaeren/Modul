// ════════════════════════════════════════════════════════
// sw.js — Service Worker for 1 vs 1 (flat filstruktur)
// Samme cache-shell-strategi som Stafettligaen sin sw.js.
// ════════════════════════════════════════════════════════
const VERSJON    = 8;
const CACHE_NAVN = `1vs1-v${VERSJON}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './app.js',
  './firebase.js',
  './ui.js',
  './admin.js',
  './batch-helpers.js',
  './qrcode.js',
  
  
  './state.js',
  './domain-constants.js',
  './domain-rating-pairwiseAverageElo.js',
  './domain-rating-provisionalPolicy.js',
  './domain-rating-courtAssignment.js',
  './domain-rating-allroundCalculator.js',
  './domain-rating-ratingService.js',
  './domain-repository-firestoreRatingRepository.js',
  './screens-competitions.js',
  './screens-registerPlayers.js',
  './screens-activeSession.js',
  './screens-registerFinish.js',
  './screens-oktResultat.js',
  './screens-ratingLists.js',
  './screens-archive.js',
  './logo.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAVN).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAVN).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const erEkstern = url.hostname.includes('firebase') || url.hostname.includes('firestore')
    || url.hostname.includes('googleapis') || url.hostname.includes('gstatic') || url.hostname.includes('fonts.g');

  if (erEkstern) { e.respondWith(fetch(e.request)); return; }

  e.respondWith(
    fetch(e.request).then(response => {
      if (e.request.method === 'GET' && response.status === 200) {
        const kopi = response.clone();
        caches.open(CACHE_NAVN).then(cache => cache.put(e.request, kopi));
      }
      return response;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(cached => cached ?? caches.match('./index.html'))
    )
  );
});
