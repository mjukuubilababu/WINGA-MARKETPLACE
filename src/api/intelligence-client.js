(() => {
  function createIntelligenceApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const getConfig = typeof deps.getConfig === "function" ? deps.getConfig : () => ({});

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

    async function logClientEvent(event) {
      requireFetcher();
      if (getConfig()?.enableClientEventLogging === false) {
        return null;
      }
      try {
        await fetchJson(`${baseUrl}/client-events`, {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(event)
        });
      } catch (_error) {
        // Telemetry must never block the marketplace path.
      }
      return null;
    }

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
      submitSearchDemandEvents
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.intelligence = window.WingaModules.api.intelligence || {};
  window.WingaModules.api.intelligence.createIntelligenceApiClient = createIntelligenceApiClient;
})();
