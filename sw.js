const CACHE = "winga-shell-v5";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/manifest-v4.webmanifest",
  "/splash-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(
        SHELL.map(async (asset) => {
          const response = await fetch(asset, { cache: "reload" });
          if (response && response.ok) {
            await cache.put(asset, response.clone());
          }
        })
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/uploads/")) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
      .catch(() => caches.match("/index.html"))
  );
});
