const CACHE = "hoopcomps-v35";
const ASSETS = [
  "/css/styles.css",
  "/css/mobile.css",
  "/css/listings.css",
  "/css/scout-wizard.css",
  "/css/community.css",
  "/css/shop.css",
  "/css/social.css",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET") return;

  // Always fetch fresh JS/HTML — avoids stale broken UI after deploys
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/js/")) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
