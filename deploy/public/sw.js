const CACHE_NAME = "kokoyakyu-static-v0.3.0";
const PRECACHE_URLS = [
  '/404.html',
  '/VERSION.txt',
  '/apps/manager-playtest/src/main.js',
  '/apps/simulation-lab/src/main.js',
  '/apps/simulation-lab/src/worker.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/landing.css',
  '/assets/register-sw.js',
  '/guide/',
  '/',
  '/lab/assets/styles.css',
  '/lab/',
  '/manager/assets/styles.css',
  '/manager/',
  '/manifest.webmanifest',
  '/offline.html',
  '/packages/baseball-engine/src/batch.js',
  '/packages/baseball-engine/src/development.js',
  '/packages/baseball-engine/src/game.js',
  '/packages/baseball-engine/src/index.js',
  '/packages/baseball-engine/src/lineup.js',
  '/packages/baseball-engine/src/names.js',
  '/packages/baseball-engine/src/player-generation.js',
  '/packages/baseball-engine/src/rng.js',
  '/packages/baseball-engine/src/rules.js',
  '/packages/baseball-engine/src/season.js',
  '/packages/baseball-engine/src/tournament.js',
  '/packages/baseball-engine/src/types.js',
  '/packages/baseball-engine/src/workload.js',
  '/packages/highschool-calendar/src/calendar.js',
  '/packages/highschool-calendar/src/index.js',
  '/packages/highschool-data/src/index.js',
  '/packages/highschool-data/src/schools.js',
  '/packages/manager-game/src/campaign.js',
  '/packages/manager-game/src/index.js',
  '/packages/manager-game/src/recruiting.js',
  '/packages/manager-game/src/selection.js',
  '/packages/manager-game/src/types.js',
  '/self-test/assets/styles.css',
  '/self-test/',
  '/self-test/main.js'
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline.html")) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
