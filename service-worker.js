const RECOVERY_SW_VERSION = "20260503-recovery-disable";

async function clearAllRecoveryCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch (error) {
    // Ignore cache cleanup failures during recovery shutdown.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await clearAllRecoveryCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await clearAllRecoveryCaches();
    await self.clients.claim();
    try {
      await self.registration.unregister();
    } catch (error) {
      // Ignore unregister failures; the page unregister path also runs on boot.
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "WINGA_RECOVERY_CLEAR") {
    event.waitUntil?.(clearAllRecoveryCaches());
  }
});
