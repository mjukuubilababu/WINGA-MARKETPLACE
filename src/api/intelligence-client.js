(() => {
  function createIntelligenceApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const getConfig = typeof deps.getConfig === "function" ? deps.getConfig : () => ({});
    const schedule = typeof deps.schedule === "function" ? deps.schedule : (callback, delayMs) => setTimeout(callback, delayMs);
    const cancelSchedule = typeof deps.cancelSchedule === "function" ? deps.cancelSchedule : (timer) => clearTimeout(timer);
    const lifecycleTarget = deps.lifecycleTarget || (typeof window !== "undefined" ? window : null);
    const maxBatchSize = Math.max(1, Math.min(25, Number(deps.maxClientEventBatchSize || 20) || 20));
    const maxBufferedEvents = Math.max(maxBatchSize, Math.min(200, Number(deps.maxBufferedClientEvents || 100) || 100));
    const flushDelayMs = Math.max(100, Math.min(5000, Number(deps.clientEventFlushDelayMs || 750) || 750));
    const clientEventQueue = [];
    let clientEventFlushTimer = null;
    let clientEventFlushPromise = null;

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga intelligence API client requires fetchJson.");
      }
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json",
        ...createAuthHeaders()
      };
    }

    function scheduleClientEventFlush(delayMs = flushDelayMs) {
      if (clientEventFlushTimer !== null || clientEventFlushPromise || !clientEventQueue.length) return;
      clientEventFlushTimer = schedule(() => {
        clientEventFlushTimer = null;
        void flushClientEvents();
      }, Math.max(0, Number(delayMs) || 0));
    }

    async function flushClientEvents(options = {}) {
      requireFetcher();
      if (clientEventFlushPromise) return clientEventFlushPromise;
      if (getConfig()?.enableClientEventLogging === false) {
        clientEventQueue.length = 0;
        return null;
      }
      if (!clientEventQueue.length) return null;
      if (clientEventFlushTimer !== null) {
        cancelSchedule(clientEventFlushTimer);
        clientEventFlushTimer = null;
      }
      const events = clientEventQueue.splice(0, maxBatchSize);
      clientEventFlushPromise = fetchJson(baseUrl + "/client-events", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ events }),
        keepalive: options.keepalive === true,
        timeoutMs: 15000
      })
        .catch(() => {
          // Telemetry must never block the marketplace path.
          return null;
        })
        .finally(() => {
          clientEventFlushPromise = null;
          if (clientEventQueue.length) scheduleClientEventFlush(0);
        });
      return clientEventFlushPromise;
    }

    async function logClientEvent(event) {
      requireFetcher();
      if (getConfig()?.enableClientEventLogging === false) return null;
      clientEventQueue.push(event);
      while (clientEventQueue.length > maxBufferedEvents) clientEventQueue.shift();
      if (event?.level === "error" || clientEventQueue.length >= maxBatchSize) {
        return flushClientEvents();
      }
      scheduleClientEventFlush();
      return null;
    }

    lifecycleTarget?.addEventListener?.("pagehide", () => {
      void flushClientEvents({ keepalive: true });
    });
    async function submitSearchDemandEvents(events = []) {
      requireFetcher();
      const batch = Array.isArray(events) ? events.filter(Boolean).slice(-25) : [];
      if (!batch.length) {
        return { ok: true, accepted: 0, inserted: 0 };
      }
      try {
        return await fetchJson(`${baseUrl}/search-demand`, {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ events: batch })
        });
      } catch (error) {
        return {
          ok: false,
          accepted: 0,
          inserted: 0,
          error: error?.message || "search-demand unavailable"
        };
      }
    }

    return {
      logClientEvent,
      flushClientEvents,
      submitSearchDemandEvents
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.intelligence = window.WingaModules.api.intelligence || {};
  window.WingaModules.api.intelligence.createIntelligenceApiClient = createIntelligenceApiClient;
})();
