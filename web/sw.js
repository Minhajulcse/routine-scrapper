const V = "routine-v4", SHELL = ["./", "index.html", "styles.css", "app.js", "export.js", "manifest.webmanifest", "icons/baiust-logo.png", "icons/icon-192.png", "icons/developer.jpg"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin !== location.origin) {                          // Google Fonts: cache after first load so the font works offline
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))
      e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(x => { const c = x.clone(); caches.open(V).then(k => k.put(e.request, c)); return x; }).catch(() => Response.error())));
    return;
  }
  const dataReq = u.pathname.endsWith("routine.json");   // network-first so new routines show up; cache = offline fallback
  e.respondWith(dataReq
    ? fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then(r => r || fetch(e.request)));
});
