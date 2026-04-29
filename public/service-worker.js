const BUILD_VERSION = "20260429003202";
const CACHE_PREFIX = "winga-shell";
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;
const IMAGE_CACHE_PREFIX = "winga-images";
const IMAGE_CACHE_NAME = `${IMAGE_CACHE_PREFIX}-${BUILD_VERSION}`;
const ROOT_URL = new URL("/", self.location.origin).toString();
const INDEX_URL = new URL("/index.html", self.location.origin).toString();
const OFFLINE_URL = new URL("/offline.html", self.location.origin).toString();
const IMAGE_PROXY_PREFIX = "/__winga-image__";
const CRITICAL_IMAGE_URLS = ["/og-images/product-1777373568833-a7d58c-e5a08dfd75fe.jpg","/og-images/product-1777315330893-808017-b622fc6f2b98.jpg","/og-images/product-1777315199519-bb18e6-0553ccf3672f.jpg","/og-images/product-1777313018004-1d5ae9-174e443d6bdc.jpg","/og-images/product-1777312933662-564522-174e443d6bdc.jpg","/og-images/product-1777312859506-84d83c-312fbf52737e.jpg","/og-images/product-1777239500165-0f2f7d-3e8441d7f659.jpg","/og-images/product-1777239370540-25a52a-01d915857279.jpg","/og-images/product-1777223611728-1b98f8-e5394e85fb9a.jpg","/og-images/product-1777035373882-94d77c-64fc4970cb30.jpg","/og-images/product-1776811707733-b96ec5-271ce1ba34c2.jpg","/og-images/product-1776784732920-892ec0-a473096cc3bd.jpg","/og-images/product-1776774500822-065b96-d02ba2e63ed1.jpg","/og-images/product-1776698143995-5f5edf-1446ce3000d1.jpg","/og-images/product-1776698137497-912617-1446ce3000d1.jpg","/og-images/product-1776697256770-115247-a473096cc3bd.jpg","/og-images/product-1776696377914-051e26-9b2778770234.jpg","/og-images/product-1776641342254-4e421b-7733e6fa395b.jpg","/og-images/product-1776636209944-914a0f-81a72010d3a9.jpg","/og-images/product-1776636032627-73222e-8995417a393e.jpg"];
const CORE_PRECACHE_URLS = [
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
  "/winga-maskable-icon-v3.png"
].map((assetPath) => new URL(assetPath, self.location.origin).toString());
const PRECACHE_URLS = [
  ...CORE_PRECACHE_URLS,
  ...CRITICAL_IMAGE_URLS.map((assetPath) => new URL(assetPath, self.location.origin).toString())
];

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

function createImageFallbackResponse() {
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" role="img" aria-label="WINGA image unavailable">
    <rect width="640" height="640" fill="#f5f7fa"/>
    <rect x="96" y="96" width="448" height="448" rx="44" fill="#ffffff" stroke="#e5e7eb" stroke-width="4"/>
    <path d="M222 272h196v122H222z" fill="#eef2f7"/>
    <path d="m236 380 72-72 48 48 34-34 78 78H236z" fill="#d9e1ec"/>
    <circle cx="398" cy="288" r="28" fill="#cbd5e1"/>
    <text x="320" y="466" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#6b7280">Image unavailable</text>
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

async function networkFirstNavigation(request, event = null) {
  const cache = await caches.open(CACHE_NAME);
  const cachedPage = await cache.match(INDEX_URL)
    || await cache.match(ROOT_URL)
    || await cache.match(request, { ignoreSearch: true });
  if (cachedPage) {
    const refreshPromise = fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          return cache.put(INDEX_URL, networkResponse.clone());
        }
        return null;
      })
      .catch(() => null);
    if (event && typeof event.waitUntil === "function") {
      event.waitUntil(refreshPromise);
    }
    return cachedPage;
  }

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

  try {
    const remoteRequest = new Request(remoteUrl, {
      mode: "no-cors",
      credentials: "omit",
      cache: "reload"
    });
    const networkResponse = await fetch(remoteRequest);
    if (networkResponse) {
      if (isUsableImageResponse(networkResponse)) {
        await cache.put(request, networkResponse.clone());
        await cache.put(remoteUrl, networkResponse.clone());
        return networkResponse;
      }
    }
  } catch (error) {
    // Fall through to cached fallback below.
  }

  const fallbackResponse = await cache.match(request)
    || await cache.match(remoteUrl);
  if (fallbackResponse) {
    return fallbackResponse;
  }
  return createImageFallbackResponse();
}

async function networkFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (isUsableImageResponse(networkResponse)) {
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    const cachedResponse = await cache.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }
  }
  return createImageFallbackResponse();
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
        credentials: isSameOriginImage ? "same-origin" : "omit"
      });
      const existing = await cache.match(request);
      if (existing) {
        return;
      }
      const response = await fetch(request);
      if (isUsableImageResponse(response)) {
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
    await cache.addAll(CORE_PRECACHE_URLS);
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
      ))
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
    event.respondWith(networkFirstNavigation(request, event));
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

  if (request.destination === "image") {
    event.respondWith(networkFirstImage(request));
    return;
  }

  if (isCacheableAsset(request)) {
    event.respondWith(cacheFirst(request));
  }
});
