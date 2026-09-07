const CACHE='student-shell-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html','/icon-192.png','/icon-512.png'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin||new URL(e.request.url).pathname.startsWith('/api/'))return;if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch {}
  // Only our fixed in-app notification destination; never open a payload-provided external URL.
  event.waitUntil(self.registration.showNotification(String(payload.title || 'Student Dashboard').slice(0,500), {
    body: String(payload.body || 'A university reminder needs your attention.').slice(0,1000),
    icon: '/icon-192.png', badge: '/icon-192.png', tag: String(payload.tag || 'study-reminder').slice(0,100), data: { url: '/notifications' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(async windows => {
    const destination = new URL('/notifications', self.location.origin).href;
    const existing = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (existing) { await existing.navigate(destination); return existing.focus(); }
    return clients.openWindow(destination);
  }));
});
