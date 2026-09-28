const CACHE_NAME = 'snapbarber-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/banner-barbearia.jpeg',
  '/manifest.json'
];

// Instalação do Service Worker e Cache inicial
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching arquivos do app');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições (Estratégia: Rede primeiro, fallback para Cache)
self.addEventListener('fetch', (event) => {
  // Ignora requisições de API para não cachear dados em tempo real
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a requisição for bem-sucedida, atualiza o cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se estiver offline ou falhar, busca do cache
        return caches.match(event.request);
      })
  );
});