/* DexCuba — Service Worker
   Permite que la app abra sin conexión y cargue rápido con red mala,
   algo importante en el contexto cubano. Estrategia:
     · Páginas y recursos propios: red primero, caché como respaldo.
     · Llamadas a /api/ y a la blockchain: siempre red (datos frescos).
*/
var CACHE = 'dexcuba-v9';

var SHELL = [
  '/',
  '/index.html',
  '/p2p.html',
  '/escrow.html',
  '/cuenta.html',
  '/legal.html',
  '/config.js',
  '/wallet.js',
  '/cookies.js',
  '/mobile.css',
  '/nav.js',
  '/convertir.html',
  '/mostrador.html',
  '/pagar.html',
  '/cobrar.html',
  '/escrow-bsc.html',
  '/icon.svg',
  '/manifest.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () { /* algún recurso puede faltar */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Datos que deben ser siempre frescos: nunca se cachean.
  if (url.pathname.indexOf('/api/') === 0 ||
      url.hostname.indexOf('trongrid') !== -1 ||
      url.hostname.indexOf('tronscan') !== -1) {
    return;
  }

  // Solo gestionamos recursos del propio sitio.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('/index.html');
        });
      })
  );
});
