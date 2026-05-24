const SW_VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const SHELL_CACHE = `winga-shell-${SW_VERSION}`;
const IMAGE_CACHE = `winga-images-${SW_VERSION}`;
const API_CACHE = `winga-api-${SW_VERSION}`;
const RUNTIME_CACHE_PREFIXES = ["winga-shell-", "winga-images-", "winga-api-"];
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/style.css",
  "/winga-config.js",
  "/winga-modules.js",
  "/service-worker.js"
];
const API_PATHS = new Set([
  "/api/products",
  "/api/categories",
  "/api/settings"
]);
const IMAGE_CACHE_LIMIT = 120;

function isHttpRequest(request) {
  return request && /^https?:$/i.test(new URL(request.url).protocol);
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isStaticShellRequest(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }
  if (SHELL_ASSETS.includes(url.pathname)) {
    return true;
  }
  return /\.(?:css|js|mjs|woff2?|png|svg|ico)$/i.test(url.pathname);
}

function isApiRequest(url) {
  return url.origin === self.location.origin && API_PATHS.has(url.pathname);
}

function isImageRequest(request, url) {
  return request.destination === "image"
    || url.pathname === "/__winga-image__"
    || /\.(?:avif|webp|png|jpe?g|gif|svg)$/i.test(url.pathname);
}

async function trimCache(cacheName, limit = IMAGE_CACHE_LIMIT) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) {
    return;
  }
  const staleKeys = keys.slice(0, keys.length - limit);
  await Promise.all(staleKeys.map((key) => cache.delete(key)));
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL_ASSETS);
}

async function cleanupOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map((key) => {
      if (RUNTIME_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && ![SHELL_CACHE, IMAGE_CACHE, API_CACHE].includes(key)) {
        return caches.delete(key);
      }
      return Promise.resolve(false);
    })
  );
}

async function cacheImageUrls(urls = []) {
  const imageCache = await caches.open(IMAGE_CACHE);
  await Promise.all(
    urls
      .map((url) => String(url || "").trim())
      .filter(Boolean)
      .map(async (url) => {
        try {
          const request = new Request(url, { mode: "no-cors", credentials: "omit" });
          const response = await fetch(request);
          if (!response) {
            return;
          }
          await imageCache.put(request, response.clone());
        } catch (error) {
          // Ignore failed image warm attempts; runtime network load remains the fallback.
        }
      })
  );
  await trimCache(IMAGE_CACHE);
}

async function cacheDynamicRequests(urls = []) {
  const apiCache = await caches.open(API_CACHE);
  await Promise.all(
    urls
      .map((url) => String(url || "").trim())
      .filter(Boolean)
      .map(async (url) => {
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (!response || !response.ok) {
            return;
          }
          await apiCache.put(url, response.clone());
        } catch (error) {
          // Ignore background API warm failures.
        }
      })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precacheShell();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await cleanupOldCaches();
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const payload = event?.data || {};
  if (payload.type === "CACHE_IMAGE_URLS") {
    event.waitUntil(cacheImageUrls(payload.urls || []));
    return;
  }
  if (payload.type === "CACHE_DYNAMIC_REQUESTS") {
    event.waitUntil(cacheDynamicRequests(payload.urls || []));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isHttpRequest(request)) {
    return;
  }
  const url = new URL(request.url);

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        await cache.put("/index.html", response.clone());
        return response;
      } catch (error) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match("/index.html")) || (await cache.match("/"));
      }
    })());
    return;
  }

  if (isStaticShellRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return (await cache.match(request)) || new Response(JSON.stringify({
          ok: false,
          offline: true
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
    })());
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request, { ignoreSearch: false });
      if (cached) {
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response) {
          await cache.put(request, response.clone());
          event.waitUntil(trimCache(IMAGE_CACHE));
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});
