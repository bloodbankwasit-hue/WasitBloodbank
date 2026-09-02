// مصرف الدم الرئيسي — واسط | Service Worker v1
const CACHE = 'wasit-blood-v1';
const SHELL = [
  '/WasitBloodbank/',
  '/WasitBloodbank/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Supabase API — دائماً من الشبكة (لا كاش للبيانات)
  if (e.request.url.includes('supabase.co') || e.request.url.includes('supabase.io')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // بقية الطلبات — كاش أولاً ثم شبكة
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
    )
  );
});
