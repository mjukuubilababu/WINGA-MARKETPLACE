const BUILD_VERSION = "20260502091227";
const CACHE_PREFIX = "winga-shell";
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;
const IMAGE_CACHE_PREFIX = "winga-images";
const IMAGE_CACHE_NAME = `${IMAGE_CACHE_PREFIX}-${BUILD_VERSION}`;
const DYNAMIC_CACHE_PREFIX = "winga-dynamic";
const DYNAMIC_CACHE_NAME = `${DYNAMIC_CACHE_PREFIX}-${BUILD_VERSION}`;
const ROOT_URL = new URL("/", self.location.origin).toString();
const INDEX_URL = new URL("/index.html", self.location.origin).toString();
const OFFLINE_URL = new URL("/offline.html", self.location.origin).toString();
const APP_SHELL_URL = new URL("/app-shell.html", self.location.origin).toString();
const IMAGE_PROXY_PREFIX = "/__winga-image__";
const MAX_SHELL_CACHE_ENTRIES = 48;
const MAX_IMAGE_CACHE_ENTRIES = 140;
const MAX_DYNAMIC_CACHE_ENTRIES = 60;
const MAX_SHELL_CACHE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DYNAMIC_CACHE_AGE_MS = 12 * 60 * 60 * 1000;
const CRITICAL_IMAGE_URLS = ["/og-images/product-1777373568833-a7d58c-e5a08dfd75fe.jpg","/og-images/product-1777315330893-808017-b622fc6f2b98.jpg","/og-images/product-1777315199519-bb18e6-0553ccf3672f.jpg","/og-images/product-1777313018004-1d5ae9-174e443d6bdc.jpg","/og-images/product-1777312933662-564522-174e443d6bdc.jpg","/og-images/product-1777312859506-84d83c-312fbf52737e.jpg","/og-images/product-1777239500165-0f2f7d-3e8441d7f659.jpg","/og-images/product-1777239370540-25a52a-01d915857279.jpg","/og-images/product-1777223611728-1b98f8-e5394e85fb9a.jpg","/og-images/product-1777035373882-94d77c-64fc4970cb30.jpg","/og-images/product-1776811707733-b96ec5-271ce1ba34c2.jpg","/og-images/product-1776784732920-892ec0-a473096cc3bd.jpg","/og-images/product-1776774500822-065b96-d02ba2e63ed1.jpg","/og-images/product-1776698143995-5f5edf-1446ce3000d1.jpg","/og-images/product-1776698137497-912617-1446ce3000d1.jpg","/og-images/product-1776697256770-115247-a473096cc3bd.jpg","/og-images/product-1776696377914-051e26-9b2778770234.jpg","/og-images/product-1776641342254-4e421b-7733e6fa395b.jpg","/og-images/product-1776636209944-914a0f-81a72010d3a9.jpg","/og-images/product-1776636032627-73222e-8995417a393e.jpg"];
const CORE_PRECACHE_URLS = [
  ROOT_URL,
  INDEX_URL,
  APP_SHELL_URL,
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
  "/winga-maskable-icon-v3.png"
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

function isDeepLinkDocumentRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
      return false;
    }
    return /^\/(?:api\/)?product\/[^/]+\/?$/i.test(url.pathname);
  } catch (error) {
    return false;
  }
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
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
      return false;
    }
    return /\.(?:avif|webp|png|jpe?g|gif|svg|ico)$/i.test(url.pathname) || url.pathname.startsWith(IMAGE_PROXY_PREFIX) || url.pathname.startsWith("/uploads/");
  } catch (error) {
    return false;
  }
}

function isCacheableAsset(request) {
  if (!isSameOrigin(request) || request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/service-worker.js") {
    return false;
  }
  return ["script", "style", "image", "font"].includes(request.destination) || /\.(?:css|js|svg|png|jpe?g|webp|gif|ico|json)$/i.test(url.pathname);
}

function shouldHandleDynamicRequest(request) {
  if (!isSameOrigin(request) || request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/")
    && !url.pathname.startsWith("/api/auth/")
    && !url.pathname.includes("/messages")
    && !url.pathname.includes("/notifications");
}

function createImageFallbackResponse() {
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" role="img" aria-label="WINGA image fallback">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#ff9f1c"/>
        <stop offset="100%" stop-color="#ff4f0a"/>
      </linearGradient>
    </defs>
    <rect width="640" height="640" fill="#fff7ed"/>
    <rect x="110" y="110" width="420" height="420" rx="76" fill="url(#bg)"/>
    <text x="320" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="96" font-weight="900" fill="#ffffff">W</text>
    <text x="320" y="392" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#ffffff">WINGA</text>
  </svg>`, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isUsableImageResponse(response) {
  if (!response) {
    return false;
  }
  if (response.type === "opaque") {
    return true;
  }
  if (!response.ok) {
    return false;
  }
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  return contentType.startsWith("image/") || contentType.includes("svg");
}

function createTextFallbackResponse(status = 503, body = "Offline") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function fetchWithRetry(request, options = {}) {
  const {
    retries = 0,
    baseDelayMs = 300
  } = options;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(request);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error("Fetch failed");
}

function logServiceWorkerEvent(level, event, detail = {}) {
  self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "WINGA_SW_LOG",
        payload: {
          level,
          event,
          ...detail
        }
      });
    });
  }).catch(() => {
    // Ignore diagnostics delivery failures.
  });
}

async function matchCachedShell(cache, request = null) {
  return (request ? await cache.match(request, { ignoreSearch: true }) : null)
    || await cache.match(INDEX_URL)
    || await cache.match(ROOT_URL)
    || await cache.match(APP_SHELL_URL)
    || await cache.match(OFFLINE_URL);
}

async function precacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(CORE_PRECACHE_URLS.map(async (url) => {
    try {
      const response = await fetchWithRetry(new Request(url, { cache: "reload" }), {
        retries: 1,
        baseDelayMs: 220
      });
      if (response && response.ok) {
        await putCachedResponse(cache, url, response.clone());
      }
    } catch (error) {
      logServiceWorkerEvent("warn", "precache_asset_failed", {
        url,
        message: String(error?.message || error || "")
      });
    }
  }));
  await trimCacheEntries(CACHE_NAME, MAX_SHELL_CACHE_ENTRIES);
}

async function trimCacheEntries(cacheName, maxEntries) {
  if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
    return;
  }
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const now = Date.now();
  const maxAgeMs = cacheName === IMAGE_CACHE_NAME
    ? MAX_IMAGE_CACHE_AGE_MS
    : cacheName === DYNAMIC_CACHE_NAME
      ? MAX_DYNAMIC_CACHE_AGE_MS
      : MAX_SHELL_CACHE_AGE_MS;
  await Promise.all(keys.map(async (request) => {
    if (!maxAgeMs) {
      return;
    }
    const response = await cache.match(request);
    const cachedAt = Number(response?.headers?.get("x-winga-cached-at") || 0);
    if (cachedAt > 0 && now - cachedAt > maxAgeMs) {
      await cache.delete(request);
    }
  }));
  const trimmedKeys = await cache.keys();
  const overflow = trimmedKeys.length - maxEntries;
  if (overflow <= 0) {
    return;
  }
  await Promise.all(trimmedKeys.slice(0, overflow).map((request) => cache.delete(request)));
}

async function withCacheTimestamp(response) {
  if (!response) {
    return response;
  }
  try {
    const headers = new Headers(response.headers);
    headers.set("x-winga-cached-at", String(Date.now()));
    const body = await response.clone().blob();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    return response;
  }
}

async function putCachedResponse(cache, request, response) {
  if (!cache || !request || !response) {
    return;
  }
  await cache.put(request, await withCacheTimestamp(response));
}

async function cacheDynamicRequests(urls = []) {
  const requests = Array.from(new Set(Array.isArray(urls) ? urls : []))
    .map((value) => {
      try {
        return new URL(String(value || "").trim(), self.location.origin).toString();
      } catch (error) {
        return "";
      }
    })
    .filter(Boolean);
  if (!requests.length) {
    return;
  }
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  await Promise.all(requests.map(async (url) => {
    const request = new Request(url, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });
    try {
      const response = await fetchWithRetry(request, {
        retries: 1,
        baseDelayMs: 220
      });
      if (response && response.ok) {
        await putCachedResponse(cache, request, response.clone());
      }
    } catch (error) {
      logServiceWorkerEvent("warn", "dynamic_precache_failed", {
        url,
        message: String(error?.message || error || "")
      });
    }
  }));
  await trimCacheEntries(DYNAMIC_CACHE_NAME, MAX_DYNAMIC_CACHE_ENTRIES);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request, { ignoreSearch: true });
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetchWithRetry(request, {
      retries: 1,
      baseDelayMs: 220
    });
    if (networkResponse && networkResponse.ok) {
      await putCachedResponse(cache, request, networkResponse.clone());
      await trimCacheEntries(CACHE_NAME, MAX_SHELL_CACHE_ENTRIES);
    }
    return networkResponse;
  } catch (error) {
    logServiceWorkerEvent("warn", "cache_first_failed", {
      url: request.url,
      destination: request.destination || "",
      message: String(error?.message || error || "")
    });
    if (request.destination === "image") {
      return createImageFallbackResponse();
    }
    if (request.destination === "document") {
      return await matchCachedShell(cache, request) || createTextFallbackResponse();
    }
    return createTextFallbackResponse();
  }
}

async function networkFirstNavigation(request, event = null) {
  const cache = await caches.open(CACHE_NAME);
  const cachedPage = await matchCachedShell(cache, request);
  const isDeepLinkRequest = isDeepLinkDocumentRequest(request);
  if (cachedPage) {
    const refreshPromise = fetchWithRetry(request, {
      retries: 2,
      baseDelayMs: 320
    })
      .then(async (networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          if (isDeepLinkRequest) {
            await putCachedResponse(cache, request, networkResponse.clone());
          } else {
            await Promise.all([
              putCachedResponse(cache, INDEX_URL, networkResponse.clone()),
              putCachedResponse(cache, request, networkResponse.clone())
            ]);
          }
        }
      })
      .catch((error) => {
        logServiceWorkerEvent("warn", "navigation_refresh_failed", {
          url: request.url,
          message: String(error?.message || error || "")
        });
      });
    if (event && typeof event.waitUntil === "function") {
      event.waitUntil(refreshPromise);
    }
    return cachedPage;
  }

  try {
    const networkResponse = await fetchWithRetry(request, {
      retries: 2,
      baseDelayMs: 320
    });
    if (networkResponse && networkResponse.ok) {
      if (isDeepLinkRequest) {
        await putCachedResponse(cache, request, networkResponse.clone());
      } else {
        await Promise.all([
          putCachedResponse(cache, INDEX_URL, networkResponse.clone()),
          putCachedResponse(cache, request, networkResponse.clone())
        ]);
      }
    }
    return networkResponse;
  } catch (error) {
    logServiceWorkerEvent("error", "navigation_request_failed", {
      url: request.url,
      message: String(error?.message || error || "")
    });
    return await matchCachedShell(cache, request) || createTextFallbackResponse();
  }
}

async function proxyImageRequest(request, options = {}) {
  const { preferCache = false } = options;
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cachedResponse = preferCache ? await cache.match(request) : null;
  if (cachedResponse) {
    logServiceWorkerEvent("info", "image_cache_hit", {
      url: request.url,
      strategy: "proxy"
    });
    return cachedResponse;
  }
  const requestUrl = new URL(request.url);
  const remoteUrl = requestUrl.searchParams.get("u") || "";
  if (!remoteUrl) {
    return new Response("", { status: 404, statusText: "Missing image source" });
  }

  try {
    const remote = new URL(remoteUrl, self.location.origin);
    const isSameOriginRemote = remote.origin === self.location.origin;
    const remoteRequest = new Request(remote.toString(), {
      mode: isSameOriginRemote ? "same-origin" : "no-cors",
      credentials: isSameOriginRemote ? "same-origin" : "omit",
      cache: "reload"
    });
    const networkResponse = await fetchWithRetry(remoteRequest, {
      retries: 1,
      baseDelayMs: 220
    });
    if (isUsableImageResponse(networkResponse)) {
      await Promise.all([
        putCachedResponse(cache, request, networkResponse.clone()),
        putCachedResponse(cache, remote.toString(), networkResponse.clone())
      ]);
      await trimCacheEntries(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES);
      return networkResponse;
    }
  } catch (error) {
    logServiceWorkerEvent("warn", "proxy_image_failed", {
      url: request.url,
      remoteUrl,
      message: String(error?.message || error || "")
    });
  }

  const fallbackResponse = await cache.match(request) || await cache.match(remoteUrl);
  return fallbackResponse || createImageFallbackResponse();
}

async function networkFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  try {
    const networkResponse = await fetchWithRetry(request, {
      retries: 1,
      baseDelayMs: 220
    });
    if (isUsableImageResponse(networkResponse)) {
      await putCachedResponse(cache, request, networkResponse.clone());
      await trimCacheEntries(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES);
      logServiceWorkerEvent("info", "image_cache_refresh", {
        url: request.url,
        strategy: "network_first"
      });
      return networkResponse;
    }
  } catch (error) {
    logServiceWorkerEvent("warn", "image_request_failed", {
      url: request.url,
      message: String(error?.message || error || "")
    });
  }
  const cachedResponse = await cache.match(request, { ignoreSearch: true });
  if (cachedResponse) {
    logServiceWorkerEvent("info", "image_cache_hit", {
      url: request.url,
      strategy: "network_first"
    });
  } else {
    logServiceWorkerEvent("warn", "image_cache_miss", {
      url: request.url,
      strategy: "network_first"
    });
  }
  return cachedResponse || createImageFallbackResponse();
}

async function networkFirstDynamic(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  try {
    const response = await fetchWithRetry(request, {
      retries: 1,
      baseDelayMs: 250
    });
    if (response && response.ok) {
      await putCachedResponse(cache, request, response.clone());
      await trimCacheEntries(DYNAMIC_CACHE_NAME, MAX_DYNAMIC_CACHE_ENTRIES);
    }
    return response;
  } catch (error) {
    logServiceWorkerEvent("warn", "dynamic_request_failed", {
      url: request.url,
      message: String(error?.message || error || "")
    });
    const cachedResponse = await cache.match(request, { ignoreSearch: true });
    return cachedResponse || new Response(JSON.stringify({
      error: "offline_fallback_unavailable"
    }), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
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
    try {
      const url = new URL(value, self.location.origin);
      const isSameOriginImage = url.origin === self.location.origin;
      const request = new Request(url.toString(), {
        mode: isSameOriginImage ? "same-origin" : "no-cors",
        credentials: isSameOriginImage ? "same-origin" : "omit",
        cache: "reload"
      });
      const response = await fetchWithRetry(request, {
        retries: 1,
        baseDelayMs: 220
      });
      if (isUsableImageResponse(response)) {
        await putCachedResponse(cache, request, response.clone());
        await trimCacheEntries(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES);
      }
    } catch (error) {
      logServiceWorkerEvent("warn", "critical_image_precache_failed", {
        url: value,
        message: String(error?.message || error || "")
      });
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precacheCoreAssets();
    await cacheImageUrls(CRITICAL_IMAGE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => (
        (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        || (key.startsWith(IMAGE_CACHE_PREFIX) && key !== IMAGE_CACHE_NAME)
        || (key.startsWith(DYNAMIC_CACHE_PREFIX) && key !== DYNAMIC_CACHE_NAME)
      ))
      .map((key) => caches.delete(key)));
    await trimCacheEntries(CACHE_NAME, MAX_SHELL_CACHE_ENTRIES);
    await trimCacheEntries(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_ENTRIES);
    await trimCacheEntries(DYNAMIC_CACHE_NAME, MAX_DYNAMIC_CACHE_ENTRIES);
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
    return;
  }
  if (messageType === "CACHE_DYNAMIC_REQUESTS") {
    event.waitUntil(cacheDynamicRequests(event.data?.urls || []));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request, event));
    return;
  }

  if (shouldHandleDynamicRequest(request)) {
    event.respondWith(networkFirstDynamic(request));
    return;
  }

  if (isImageProxyRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        event.waitUntil(proxyImageRequest(request, { preferCache: false }).catch(() => {}));
        return cachedResponse;
      }
      return proxyImageRequest(request, { preferCache: true });
    })());
    return;
  }

  if (request.destination === "image") {
    event.respondWith(networkFirstImage(request));
    return;
  }

  if (isCacheableAsset(request)) {
    event.respondWith(cacheFirst(request));
  }
});
