const BUILD_VERSION = "20260423172029";
const CACHE_PREFIX = "winga-shell";
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;
const IMAGE_CACHE_NAME = "winga-images";
const ROOT_URL = new URL("/", self.location.origin).toString();
const INDEX_URL = new URL("/index.html", self.location.origin).toString();
const OFFLINE_URL = new URL("/offline.html", self.location.origin).toString();
const IMAGE_PROXY_PREFIX = "/__winga-image__";
const PRECACHE_URLS = [
  ROOT_URL,
  INDEX_URL,
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/style.css",
  "/app.js",
  "/app-core.js",
  "/winga-modules.js",
  "/data-service.js",
  "/mock-data.js",
  "/winga-config.js",
  "/share-og.svg",
  "/apple-touch-icon.png",
  "/winga-icon-192.png",
  "/winga-icon-512.png",
  "/winga-maskable-icon.png",
  "/winga-icon.svg",
  "/winga-maskable-icon.svg"
].map((assetPath) => new URL(assetPath, self.location.origin).toString());

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (error) {
    return false;
  }
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || String(request.headers.get("accept") || "").includes("text/html");
}

function isImageProxyRequest(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname === IMAGE_PROXY_PREFIX;
  } catch (error) {
    return false;
  }
}

function isCacheableAsset(request) {
  if (!isSameOrigin(request)) {
    return false;
  }
  if (request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return false;
  }
  if (url.pathname === "/service-worker.js") {
    return false;
  }
  return ["script", "style", "image", "font"].includes(request.destination) || /\.(?:css|js|svg|png|jpe?g|webp|gif|ico|json)$/i.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request, { ignoreSearch: true });
  if (cachedResponse) {
    return cachedResponse;
  }
  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(INDEX_URL, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedPage = await cache.match(INDEX_URL)
      || await cache.match(ROOT_URL)
      || await cache.match(request, { ignoreSearch: true })
      || await cache.match(OFFLINE_URL);
    if (cachedPage) {
      return cachedPage;
    }
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function proxyImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const requestUrl = new URL(request.url);
  const remoteUrl = requestUrl.searchParams.get("u") || "";
  if (!remoteUrl) {
    return new Response("", { status: 404, statusText: "Missing image source" });
  }

  const refreshImage = async () => {
    const networkResponse = await fetch(remoteUrl, { mode: "no-cors" });
    if (networkResponse) {
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    return null;
  };

  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await refreshImage();
    if (networkResponse) {
      return networkResponse;
    }
  } catch (error) {
    // Fall through to cached fallback below.
  }

  const fallbackResponse = await cache.match(request)
    || await cache.match(OFFLINE_URL);
  if (fallbackResponse) {
    return fallbackResponse;
  }
  return new Response("", { status: 503, statusText: "Image unavailable" });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const messageType = event.data?.type;
  if (messageType === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImageProxyRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        event.waitUntil(proxyImageRequest(request).catch(() => {}));
        return cachedResponse;
      }
      return proxyImageRequest(request);
    })());
    return;
  }

  if (isCacheableAsset(request)) {
    event.respondWith(cacheFirst(request));
  }
});
