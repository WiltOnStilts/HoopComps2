const CACHE = "hoopcomps-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/css/mobile.css",
  "/css/listings.css",
  "/js/app.js",
  "/js/auth.js",
  "/js/storage.js",
  "/js/scout-ui.js",
  "/js/scout-exact.js",
  "/js/listings-ui.js",
  "/js/utils.js",
  "/js/pwa.js",
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

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res.ok && e.request.method === "GET") {
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
