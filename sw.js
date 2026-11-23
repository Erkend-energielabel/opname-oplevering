// Minimale service worker: alleen nodig zodat de browser de app als bureaubladprogramma kan installeren.
// Er wordt niets gecachet, dus de app is altijd de nieuwste versie.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
