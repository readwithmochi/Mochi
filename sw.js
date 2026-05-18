const CACHE_NAME = 'mochi-v1';
const urlsToCache = [
  '/Mochi/',
  '/Mochi/index.html',
  '/Mochi/shelf.html',
  '/Mochi/scrapbook.html',
  '/Mochi/pet.html',
  '/Mochi/wrapped.html',
  '/Mochi/discover.html',
  '/Mochi/account.html',
  '/Mochi/mochi.js',
  '/Mochi/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
