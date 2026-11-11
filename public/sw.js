/* Praxion Research Terminal — service worker (PWA).
 * App-shell caching with network-first for data/API so the terminal loads
 * offline and always gets fresh quotes/news when connected.
 */
const CACHE = "praxion-shell-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first for navigations; fall back to cached shell offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;

  // API + data: network-first, no offline fallback (freshness matters).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/") || url.pathname.startsWith("/.netlify/")) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || Response.error())),
    );
    return;
  }

  // Navigations: network-first, cache fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Static assets: network-first so a fresh deploy is picked up immediately.
  // (Was stale-while-revalidate, which served an outdated JS bundle for one
  //  extra page load after every deploy — long enough to look permanently broken.)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
      .then((r) => r || Response.error()),
  );
});
