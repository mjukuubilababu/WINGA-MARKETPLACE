const BUILD_VERSION = "20260426150256";
const CACHE_PREFIX = "winga-shell";
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;
const IMAGE_CACHE_NAME = "winga-images";
const ROOT_URL = new URL("/", self.location.origin).toString();
const INDEX_URL = new URL("/index.html", self.location.origin).toString();
const OFFLINE_URL = new URL("/offline.html", self.location.origin).toString();
const IMAGE_PROXY_PREFIX = "/__winga-image__";
const CRITICAL_IMAGE_URLS = ["/og-images/product-1777035373882-94d77c-64fc4970cb30.jpg","/og-images/product-1776811707733-b96ec5-271ce1ba34c2.jpg","/og-images/product-1776784732920-892ec0-a473096cc3bd.jpg","/og-images/product-1776774500822-065b96-d02ba2e63ed1.jpg","/og-images/product-1776698143995-5f5edf-1446ce3000d1.jpg","/og-images/product-1776698137497-912617-1446ce3000d1.jpg","/og-images/product-1776697256770-115247-a473096cc3bd.jpg","/og-images/product-1776696377914-051e26-9b2778770234.jpg","/og-images/product-1776641342254-4e421b-7733e6fa395b.jpg","/og-images/product-1776636209944-914a0f-81a72010d3a9.jpg","/og-images/product-1776636032627-73222e-8995417a393e.jpg","/og-images/product-1776635946578-fb4643-959f31784b79.jpg","/og-images/product-1776632816253-1ba7f8-31e4a5c4440f.jpg","/og-images/product-1776625047307-9cec81-b885aa7a5d3b.jpg","/og-images/product-1776623713511-146e16-01d9647f3d80.jpg","/og-images/product-1776622980060-6f1c2d-95d4ffacf7dc.jpg","/og-images/product-1776622652471-d8d3ea-e07955e150f6.jpg","/og-images/product-1776351627200-b45359-5ae916b1d778.jpg","/og-images/product-1776259811697-c39bef-95e460fdd98d.jpg","/og-images/product-1776095870275-fd26aa-89563965d1df.jpg"];
const PRECACHE_URLS = [
  ROOT_URL,
  INDEX_URL,
  OFFLINE_URL,
  "/manifest-v4.webmanifest",
  "/style.css",
  "/app.js",
  "/app-core.js",
  "/winga-modules.js",
  "/data-service.js",
  "/mock-data.js",
  "/winga-config.js",
  "/share-og.svg",
  "/apple-touch-icon-v3.png",
  "/winga-icon-192-v3.png",
  "/winga-icon-512-v3.png",
  "/winga-maskable-icon-v3.png",
  ...CRITICAL_IMAGE_URLS
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

function isCacheableImageUrl(value) {
  try {
    const url = new URL(String(value || "").trim(), self.location.origin);
    if (url.origin !== self.location.origin) {
      return false;
    }
    if (url.pathname.startsWith("/api/")) {
      return false;
    }
    return /\.(?:avif|webp|png|jpe?g|gif|svg|ico)$/i.test(url.pathname) || url.pathname.startsWith(IMAGE_PROXY_PREFIX) || url.pathname.startsWith("/uploads/");
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

  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse) {
      if (networkResponse.ok || networkResponse.type === "opaque") {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }
  } catch (error) {
    // Fall through to remote fallback below.
  }

  try {
    const networkResponse = await fetch(remoteUrl, { mode: "no-cors" });
    if (networkResponse) {
      await cache.put(request, networkResponse.clone());
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

async function cacheImageUrls(urls = []) {
  const normalizedUrls = Array.isArray(urls)
    ? urls.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!normalizedUrls.length) {
    return;
  }
  const cache = await caches.open(IMAGE_CACHE_NAME);
  await Promise.all(normalizedUrls.map(async (value) => {
    if (!isCacheableImageUrl(value)) {
      return;
    }
    const request = new Request(new URL(value, self.location.origin).toString(), {
      mode: "same-origin",
      credentials: "same-origin"
    });
    const existing = await cache.match(request);
    if (existing) {
      return;
    }
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === "opaque")) {
        await cache.put(request, response.clone());
      }
    } catch (error) {
      // Ignore background cache warm failures.
    }
  }));
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
    return;
  }
  if (messageType === "CACHE_IMAGE_URLS") {
    event.waitUntil(cacheImageUrls(event.data?.urls || []));
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
