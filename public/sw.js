const CACHE = "winga-shell-v6-20260604";
const SHELL_ASSETS = [
  "/manifest.json",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(
      SHELL_ASSETS.map(async (asset) => {
        const response = await fetch(asset, { cache: "reload" });
        if (response?.ok) {
          await cache.put(asset, response.clone());
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE)
        .map((key) => {
          console.log("[SW] Deleting stale cache:", key);
          return caches.delete(key);
        })
    );
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  const accept = String(event.request.headers.get("Accept") || "");
  const isHtmlRequest = event.request.mode === "navigate"
    || accept.includes("text/html")
    || url.pathname === "/"
    || url.pathname.endsWith(".html");

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  if (url.pathname.startsWith("/uploads/")) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }
      const response = await fetch(event.request);
      if (response?.ok) {
        await cache.put(event.request, response.clone());
      }
      return response;
    })());
  }
});
