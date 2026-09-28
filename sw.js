const BUILD_VERSION = "__WINGA_BUILD_VERSION__";

// Never render server-supplied titles, message text, user names or URLs on a lock screen.
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch { /* Use a generic notification. */ }
    const id = typeof payload.id === "string" && /^[a-f0-9-]{36}$/.test(payload.id) ? payload.id : "";
    const bodies = { sw: "Una ujumbe mpya.", en: "You have a new message.", fr: "Vous avez un nouveau message.", ar: "\u0644\u062f\u064a\u0643 \u0631\u0633\u0627\u0644\u0629 \u062c\u062f\u064a\u062f\u0629." };
    await self.registration.showNotification("Winga", {
      body: Object.hasOwn(bodies, payload.locale) ? bodies[payload.locale] : bodies.sw, tag: id ? `winga-push-${id}` : "winga-push",
      data: { id }, renotify: false
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const id = event.notification.data?.id;
  const valid = typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(item => new URL(item.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      if (valid) client.postMessage({ type: "winga-push-open", id });
      return;
    }
    await self.clients.openWindow(valid ? `/#winga-push=${id}` : "/");
  })());
});
const CACHE = `winga-shell-v7-${BUILD_VERSION}`;
const SHELL_ASSETS = [
  "/manifest.json",
  "/offline.html",
  "/src/localization/catalogs/en.json",
  "/src/localization/catalogs/sw.json",
  "/src/localization/catalogs/fr.json",
  "/src/localization/catalogs/ar.json"
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

  if (url.pathname.startsWith("/src/localization/catalogs/") && url.pathname.endsWith(".json")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      const refresh = fetch(event.request, { cache: "no-cache" })
        .then(async (response) => {
          if (response?.ok && String(response.headers.get("content-type") || "").includes("application/json")) {
            await cache.put(event.request, response.clone());
          }
          return response;
        });
      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      return refresh;
    })());
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
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (response?.ok) {
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        throw error;
      }
    })());
  }
});
