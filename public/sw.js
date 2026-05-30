const CACHE = "winga-v4";
const SHELL = [
  "/",
  "/manifest.json",
  "/splash-logo.png",
  "/placeholder.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(
      SHELL.map(async (asset) => {
        try {
          const response = await fetch(asset, { cache: "reload" });
          if (response && response.ok) {
            await cache.put(asset, response.clone());
          }
        } catch (_error) {
          // Missing optional placeholder must not block SW install.
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        }).catch(async () => {
          const fallback = await caches.match("/placeholder.jpg");
          return fallback || placeholderImageResponse();
        });
      })
    );
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

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
