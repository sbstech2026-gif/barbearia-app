// Service Worker Básico para Habilitar PWA Instalável
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Permite que todas as requisições passem normalmente pela rede
  event.respondWith(fetch(event.request));
});