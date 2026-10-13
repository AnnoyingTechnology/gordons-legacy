// Offline support: keeps a copy of the application in the browser so that it starts without a network.
// This file is a template. The build (build/offline.ts) replaces the two placeholders below with a cache
// name unique to the build and the list of the build's files.

const CACHE = '__CACHE_NAME__';
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// A new build replaces the previous one's copy.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Pages come from the network when it is there, so that a new version shows up, and from the copy
// otherwise. Other files have content-hashed names, so the copy is always the right one.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((copy) => copy ?? fetch(request)));
});
