const CACHE_NAME = 'mqm-cache-v4';
const OFFLINE_URL = 'offline.html';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './mqm-192.png',
  './mqm-512.png',
  './sound.mp3',
  './offline.html'
];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('message', event=>{
  if(event.data === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event=>{
  if(event.request.method !== 'GET') return;

  if(event.request.mode === 'navigate'){
    event.respondWith(
      fetch(event.request)
        .then(resp=>{
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request, copy));
          return resp;
        })
        .catch(async()=>{
          const cached = await caches.match(event.request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached) return cached;
      return fetch(event.request).then(resp=>{
        if(!resp || resp.status!==200 || resp.type!=='basic') return resp;
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(event.request, copy));
        return resp;
      }).catch(()=>caches.match(event.request).then(fallback=>fallback||caches.match(OFFLINE_URL)));
    })
  );
});
