(() => {
  function createPerformanceModule(deps = {}) {
    const getNow = typeof deps.getNow === "function"
      ? deps.getNow
      : () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
    const isProductionRuntime = typeof deps.isProductionRuntime === "function"
      ? deps.isProductionRuntime
      : () => {
        const hostname = String(globalThis?.location?.hostname || "").trim().toLowerCase();
        return Boolean(hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1");
      };

    function isExperienceMetricDebugEnabled() {
      const queryDebugEnabled = /(?:[?&](?:winga_debug_perf|debugPerf)=1)(?:&|$)/i.test(String(window.location?.search || ""));
      if (isProductionRuntime()) {
        return queryDebugEnabled;
      }
      try {
        if (window.localStorage?.getItem("winga_debug_perf") === "true") {
          return true;
        }
      } catch (_error) {
        // Ignore debug storage access failures.
      }
      return queryDebugEnabled;
    }

    function getPerformanceNowSafe() {
      return getNow();
    }

    function safePerformanceMark(name = "") {
      const safeName = String(name || "").trim();
      if (!safeName || typeof performance?.mark !== "function") {
        return;
      }
      try {
        performance.mark(safeName);
      } catch (_error) {
        // Ignore mark collisions or unsupported browsers.
      }
    }

    function safePerformanceMeasure(name = "", startMark = "", endMark = "") {
      const safeName = String(name || "").trim();
      const safeStart = String(startMark || "").trim();
      const safeEnd = String(endMark || "").trim();
      if (!safeName || !safeStart || !safeEnd || typeof performance?.measure !== "function") {
        return null;
      }
      try {
        performance.measure(safeName, safeStart, safeEnd);
        const entries = typeof performance.getEntriesByName === "function"
          ? performance.getEntriesByName(safeName)
          : [];
        return entries.length ? Number(entries[entries.length - 1]?.duration || 0) : null;
      } catch (_error) {
        return null;
      }
    }

    function createExperienceFingerprint(value = "") {
      const source = String(value || "").trim();
      if (!source) {
        return "";
      }
      let hash = 0;
      for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
      }
      return Math.abs(hash).toString(36).slice(0, 8);
    }

    return {
      isExperienceMetricDebugEnabled,
      getPerformanceNowSafe,
      safePerformanceMark,
      safePerformanceMeasure,
      createExperienceFingerprint
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.monitoring = window.WingaModules.monitoring || {};
  window.WingaModules.monitoring.createPerformanceModule = createPerformanceModule;
})();
