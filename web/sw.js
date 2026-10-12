/* BAIUST Routine — offline-first service worker.
   First visit (online): everything below is saved on the phone.
   Later visits: the app opens instantly from the saved copy, with or without internet,
   and quietly refreshes itself in the background when online. */
const V = "routine-v5";
const SHELL = ["./", "index.html", "styles.css", "app.js", "export.js", "manifest.webmanifest", "data/routine.json",
  "icons/baiust-logo.png", "icons/icon-192.png", "icons/icon-512.png", "icons/developer.jpg"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
const isFont = u => /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(V);
  await c.addAll(SHELL);
  try {                                                   // save the web font too (best effort)
    const r = await fetch(FONT_CSS); await c.put(FONT_CSS, r.clone());
    const urls = [...(await r.text()).matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u).then(x => c.put(u, x)).catch(() => { })));
  } catch { }
  await self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);

  if (u.origin !== location.origin) {                     // fonts: cache-first
    if (isFont(u)) e.respondWith(caches.match(req, { ignoreVary: true }).then(r => r || fetch(req).then(x => {
      const c = x.clone(); caches.open(V).then(k => k.put(req, c)); return x; }).catch(() => Response.error())));
    return;
  }

  if (u.pathname.endsWith("routine.json")) {              // routine data: newest if the network answers fast, else saved copy
    e.respondWith(new Promise(res => {
      const saved = () => caches.match(req, { ignoreSearch: true }).then(r => r && res(r));
      const t = setTimeout(saved, 4000);
      fetch(req, { cache: "no-cache" }).then(r => {
        clearTimeout(t); const c = r.clone(); caches.open(V).then(k => k.put("data/routine.json", c)); res(r);
      }).catch(() => { clearTimeout(t); saved().then(() => res(Response.error())); });
    }));
    return;
  }

  // app files: show the saved copy immediately, refresh it in the background (stale-while-revalidate)
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(x => { if (x.ok) { const c = x.clone(); caches.open(V).then(k => k.put(req, c)); } return x; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return net.then(x => x || (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
  }));
});
