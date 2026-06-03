/* VBScout Service Worker
   ---------------------------------------------------------
   Strategia anti-cache-vecchia (il problema che avevi con VBJump):
   - Quando aggiorni l'app, cambia SOLO il numero di CACHE_VERSION qui sotto.
     Il vecchio cache verrà cancellato automaticamente al primo avvio.
   - L'HTML (index.html) usa "network-first": prende sempre la versione
     più recente se sei online, e usa la copia salvata solo offline.
   - Icone e file statici usano "cache-first" per velocità.
   - Tutti i percorsi sono RELATIVI: funziona in qualunque cartella del repo.
*/

const CACHE_VERSION = 'vbscout-v1';     // <-- incrementa (v2, v3...) ad ogni aggiornamento
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// --- install: precarica l'app shell ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // attiva subito la nuova versione
  );
});

// --- activate: cancella le cache vecchie ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// --- fetch ---
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // network-first: sempre l'ultima versione se online
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
  } else {
    // cache-first per file statici (icone, ecc.)
    event.respondWith(
      caches.match(req).then(cached =>
        cached || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
      )
    );
  }
});

// Permette alla pagina di forzare l'aggiornamento immediato
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
