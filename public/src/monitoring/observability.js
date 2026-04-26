(() => {
  function createObservabilityModule(deps = {}) {
    const recentEvents = new Map();
    let globalHandlersInstalled = false;
    const now = typeof deps.now === "function" ? deps.now : () => Date.now();
    const emit = typeof deps.emitClientEvent === "function"
      ? deps.emitClientEvent
      : () => Promise.resolve(null);
    const logger = deps.consoleObject || console;
    const getBaseContext = typeof deps.getBaseContext === "function"
      ? deps.getBaseContext
      : () => ({});

    function inferCategory(event = "", context = {}) {
      const safeEvent = String(event || "").toLowerCase();
      if (context.category) {
        return String(context.category).slice(0, 40);
      }
      if (safeEvent.includes("auth") || safeEvent.includes("login") || safeEvent.includes("logout") || safeEvent.includes("session")) {
        return "auth";
      }
      if (safeEvent.includes("chat") || safeEvent.includes("message")) {
        return "chat";
      }
      if (safeEvent.includes("request")) {
        return "request";
      }
      if (safeEvent.includes("promotion")) {
        return "promotion";
      }
      if (safeEvent.includes("admin") || safeEvent.includes("moderat")) {
        return "admin";
      }
      if (safeEvent.includes("render") || safeEvent.includes("runtime") || safeEvent.includes("boot")) {
        return "runtime";
      }
      return "app";
    }

    function inferAlertSeverity(level = "info", event = "", context = {}) {
      if (context.alertSeverity) {
        return String(context.alertSeverity).slice(0, 20);
      }
      const safeEvent = String(event || "").toLowerCase();
      if (safeEvent.includes("startup") || safeEvent.includes("boot") || safeEvent.includes("admin_login_failed") || safeEvent.includes("session_invalidated")) {
        return "critical";
      }
      if (level === "error") {
        return "high";
      }
      if (level === "warn") {
        return "medium";
      }
      return "low";
    }

    function pruneRecentEvents() {
      const cutoff = now() - (5 * 60 * 1000);
      recentEvents.forEach((timestamp, key) => {
        if (timestamp < cutoff) {
          recentEvents.delete(key);
        }
      });
      if (recentEvents.size > 200) {
        const keys = Array.from(recentEvents.keys()).slice(0, recentEvents.size - 200);
        keys.forEach((key) => recentEvents.delete(key));
      }
    }

    function sanitizeContext(context = {}) {
      const merged = {
        ...getBaseContext(),
        ...(context && typeof context === "object" ? context : {})
      };
      const safeContext = {};
      Object.entries(merged).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          return;
        }
        if (typeof value === "string") {
          safeContext[key] = value.slice(0, 120);
          return;
        }
        if (typeof value === "number" || typeof value === "boolean") {
          safeContext[key] = value;
          return;
        }
        safeContext[key] = JSON.stringify(value).slice(0, 120);
      });
      return safeContext;
    }

    function serializeContext(context) {
      if (!context || typeof context !== "object") {
        return "";
      }
      const safeEntries = Object.entries(context)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .slice(0, 8)
        .map(([key, value]) => {
          const normalizedValue = typeof value === "string"
            ? value.slice(0, 80)
            : typeof value === "number" || typeof value === "boolean"
              ? String(value)
              : JSON.stringify(value).slice(0, 80);
          return `${key}=${normalizedValue}`;
        });
      return safeEntries.length ? ` | ${safeEntries.join(" ")}` : "";
    }

    function buildMessage(message, context) {
      return `${String(message || "").slice(0, 220)}${serializeContext(context)}`.slice(0, 300);
    }

    function reportEvent(level, event, message, context = {}) {
      const safeLevel = ["info", "warn", "error"].includes(level) ? level : "error";
      const safeEvent = String(event || "unknown_event").slice(0, 80);
      const safeContext = sanitizeContext(context);
      const finalMessage = buildMessage(message || safeEvent, safeContext);
      const category = inferCategory(safeEvent, safeContext);
      const alertSeverity = inferAlertSeverity(safeLevel, safeEvent, safeContext);
      const fingerprint = String(safeContext.fingerprint || `${category}:${safeEvent}`).slice(0, 120);
      const dedupeKey = `${safeLevel}:${safeEvent}:${fingerprint}:${finalMessage}`;
      pruneRecentEvents();
      if (recentEvents.has(dedupeKey)) {
        return;
      }
      recentEvents.set(dedupeKey, now());
      logger[safeLevel === "info" ? "log" : safeLevel]?.(`[WINGA] ${safeEvent}`, {
        level: safeLevel,
        message: finalMessage,
        category,
        alertSeverity,
        fingerprint,
        context: safeContext
      });
      emit({
        level: safeLevel,
        event: safeEvent,
        message: finalMessage,
        category,
        alertSeverity,
        fingerprint,
        context: safeContext
      }).catch(() => {
        // Ignore observability transport failures to avoid cascading UI errors.
      });
    }

    function captureError(event, error, context = {}) {
      const errorMessage = error?.message || String(error || "Unknown error");
      reportEvent("error", event, errorMessage, {
        ...context,
        errorName: error?.name || "",
        stackPreview: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 2).join(" | ") : ""
      });
    }

    function installGlobalErrorHandlers(targetWindow) {
      if (globalHandlersInstalled || !targetWindow?.addEventListener) {
        return;
      }
      globalHandlersInstalled = true;
      targetWindow.addEventListener("error", (event) => {
        captureError("runtime_unhandled_error", event?.error || new Error(event?.message || "Unhandled window error"), {
          category: "runtime",
          alertSeverity: "critical",
          source: event?.filename || "",
          line: event?.lineno || 0,
          column: event?.colno || 0
        });
      });
      targetWindow.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        captureError("runtime_unhandled_rejection", reason instanceof Error ? reason : new Error(String(reason || "Unhandled promise rejection")), {
          category: "runtime",
          alertSeverity: "high"
        });
      });
    }

    return {
      reportEvent,
      captureError,
      installGlobalErrorHandlers
    };
  }

  window.WingaModules.monitoring.createObservabilityModule = createObservabilityModule;
})();
