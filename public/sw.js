const BIG_PIPE_SW_VERSION = "winga-big-pipe-v1";
const SHELL_CACHE = `${BIG_PIPE_SW_VERSION}-shell`;
const API_CACHE = `${BIG_PIPE_SW_VERSION}-api`;
const IMAGE_CACHE = `${BIG_PIPE_SW_VERSION}-images`;
const RUNTIME_CACHES = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];
const SHELL_ASSETS = [
  "/",
  "/feed",
  "/sw.js",
  "/manifest.json",
  "/manifest.webmanifest",
  "/manifest-v4.webmanifest",
  "/splash-logo.png",
  "/offline.html",
  "/winga-icon-192-v3.png",
  "/winga-icon-512-v3.png",
  "/apple-touch-icon-v3.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(
      SHELL_ASSETS.map(async (asset) => {
        try {
          const response = await fetch(asset, { cache: "reload" });
          if (response && response.ok) {
            await cache.put(asset, response.clone());
          }
        } catch (_error) {
          // Missing optional shell assets must never block install.
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
      keys.map((key) => {
        if (!RUNTIME_CACHES.includes(key) && key.startsWith("winga-")) {
          return caches.delete(key);
        }
        return Promise.resolve(false);
      })
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!/^https?:$/i.test(url.protocol)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (request.destination === "image" || url.pathname.startsWith("/uploads/")) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  if (isStaticShellRequest(url)) {
    event.respondWith(handleStaticAssetRequest(request));
  }
});

async function handleNavigationRequest(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put("/", response.clone());
      await cache.put("/feed", response.clone());
    }
    return response;
  } catch (_error) {
    return (await cache.match("/")) || (await cache.match("/feed")) || (await cache.match("/offline.html")) || offlineHtmlResponse();
  }
}

async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    return (await cache.match(request)) || new Response(JSON.stringify({
      ok: false,
      offline: true
    }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }
}

async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      trimImageCache(cache);
      return response;
    }
  } catch (_error) {
    // Fall through to placeholder image.
  }

  return placeholderImageResponse();
}

async function handleStaticAssetRequest(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(async (response) => {
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cached) {
    return cached;
  }

  const response = await networkPromise;
  return response || (await cache.match("/")) || Response.error();
}

function isStaticShellRequest(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }
  if (SHELL_ASSETS.includes(url.pathname)) {
    return true;
  }
  return /\.(?:css|js|mjs|png|svg|ico|webmanifest)$/i.test(url.pathname);
}

async function trimImageCache(cache) {
  const keys = await cache.keys();
  const limit = 120;
  if (keys.length <= limit) {
    return;
  }
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

function offlineHtmlResponse() {
  const html = `
    <!DOCTYPE html>
    <html lang="sw">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
        <meta name="theme-color" content="#FF6B00">
        <title>Winga Offline</title>
        <style>
          *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FF6B00;font-family:Arial,sans-serif;color:#fff;padding:24px;text-align:center}
          .card{max-width:320px;padding:28px 24px;border-radius:28px;background:rgba(255,255,255,.14);box-shadow:0 18px 48px rgba(0,0,0,.16)}
          h1{margin:0 0 10px;font-size:24px}p{margin:0;line-height:1.45;color:rgba(255,255,255,.86)}
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Winga iko offline</h1>
          <p>Tafadhali angalia intaneti yako. Ukirudi online, feed itaendelea mahali ulipoishia.</p>
        </div>
      </body>
    </html>
  `.trim();
  return new Response(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function placeholderImageResponse() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720" role="img" aria-label="Winga placeholder">
      <rect width="720" height="720" fill="#f5ede7"/>
      <rect x="150" y="150" width="420" height="420" rx="36" fill="#ffffff"/>
      <circle cx="360" cy="305" r="72" fill="#ff6b00" opacity="0.18"/>
      <path d="M220 500l96-118 84 76 64-84 116 126H220z" fill="#ff6b00" opacity="0.28"/>
      <text x="360" y="620" text-anchor="middle" fill="#ff6b00" font-family="Arial, sans-serif" font-size="34" font-weight="700">WINGA</text>
    </svg>
  `.trim();
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
