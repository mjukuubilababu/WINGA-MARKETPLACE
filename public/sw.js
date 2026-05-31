/*
 * WINGA SERVICE WORKER OWNERSHIP
 * 1. This Service Worker owns offline shell resilience only.
 * 2. Cloudflare Worker owns HTML streaming, /uploads/* image edge caching, and /api/* proxy behavior.
 * 3. App JS owns feed state and continuation; this Service Worker must never compete for those concerns.
 */
const BUILD_VERSION = "20260531152839";
const CACHE = `winga-shell-v4-${BUILD_VERSION}`;
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/manifest-v4.webmanifest",
  "/splash-logo.png",
  "/placeholder.jpg",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(
      SHELL_ASSETS.map(async (asset) => {
        try {
          const response = await fetch(asset, { cache: "reload" });
          if (response && response.ok) {
            await cache.put(asset, response.clone());
          }
        } catch (_error) {
          // Optional shell asset failures must never block install.
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/uploads/")) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname) || url.pathname === "/") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request) || await cache.match(url.pathname);
      if (cached) {
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_error) {
        return (await cache.match("/offline.html")) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_error) {
        return (await cache.match(request)) || Response.error();
      }
    })());
  }
});
