// مصرف الدم الرئيسي — واسط | Service Worker v2
const CACHE = 'bloodbank-wasit-v4';

const CRITICAL = [
  './',
  './index.html'
];

const OPTIONAL = [
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(async cache=>{
      await Promise.all(CRITICAL.map(u=>
        cache.add(new Request(u, {cache:'reload'}))
      ));
      await Promise.all(OPTIONAL.map(u=>
        cache.add(new Request(u, {cache:'reload'}))
          .catch(()=>console.log('Optional skipped:', u))
      ));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.open(CACHE).then(async newCache=>{
      const valid = await newCache.match('./index.html');
      if(valid){
        const keys = await caches.keys();
        await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
      }
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  const url = e.request.url;

  // Supabase: always from network
  if(url.includes('supabase.co') || url.includes('supabase.io')) return;

  // Non-GET: pass through
  if(e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached) return cached;
      return fetch(e.request).then(res=>{
        if(res.ok){
          const clone = res.clone();
          caches.open(CACHE).then(c=>c.put(e.request, clone));
        }
        return res;
      }).catch(async ()=>{
        if(e.request.mode === 'navigate'){
          const fallback = await caches.match('./index.html');
          if(fallback) return fallback;
        }
        return new Response('', {status:504, statusText:'Offline'});
      });
    })
  );
});
