(() => {
  const STORAGE_KEY = "winga-global-context-v1";
  const FALLBACK = Object.freeze({ schemaVersion: 1, locale: "sw-TZ", language: "sw", direction: "ltr", currency: "TZS", timezone: "Africa/Dar_es_Salaam", units: "metric", market: { country: "TZ", discoveryPolicy: "local_priority_global_discovery" } });
  function canonical(value = "") { try { return Intl.getCanonicalLocales(String(value || "").replace(/_/g, "-"))[0] || ""; } catch (_error) { return ""; } }
  function read(storage) { try { const value = JSON.parse(storage?.getItem(STORAGE_KEY) || "null"); return value?.schemaVersion === 1 ? value : null; } catch (_error) { return null; } }
  function createRuntime(deps = {}) {
    const targetWindow = deps.window || window;
    const storage = deps.storage || targetWindow.localStorage;
    const listeners = new Set();
    let context = read(storage) || { ...FALLBACK };
    let useDeviceLanguage = context.preference?.useDeviceLanguage !== false;
    function apply() {
      const root = targetWindow.document?.documentElement;
      if (!root) return;
      root.lang = context.locale || FALLBACK.locale;
      root.dir = context.direction === "rtl" ? "rtl" : "ltr";
      root.dataset.wingaCountry = context.market?.country || "";
      root.dataset.wingaCurrency = context.currency || "";
    }
    function persist() { try { storage?.setItem(STORAGE_KEY, JSON.stringify(context)); } catch (_error) {} }
    function emit(reason) {
      apply(); persist();
      listeners.forEach((listener) => { try { listener(context, reason); } catch (_error) {} });
      targetWindow.dispatchEvent?.(new targetWindow.CustomEvent("winga:global-context", { detail: { context, reason } }));
    }
    function update(next = {}, reason = "context_updated") {
      const locale = canonical(next.locale || context.locale) || FALLBACK.locale;
      context = Object.freeze({ ...FALLBACK, ...context, ...next, locale, language: locale.split("-")[0].toLowerCase(), direction: next.direction === "rtl" ? "rtl" : "ltr", market: { ...FALLBACK.market, ...(context.market || {}), ...(next.market || {}) } });
      useDeviceLanguage = context.preference?.useDeviceLanguage !== false;
      emit(reason); return context;
    }
    async function persistRemotePreference() {
      if (typeof deps.savePreference !== "function") return null;
      try {
        const result = await deps.savePreference({ ...(context.preference || {}) });
        if (result?.context) return update(result.context, "preference_synced");
        if (result?.preference) return update({ preference: result.preference }, "preference_synced");
      } catch (_error) {
        // Local preference remains active while authenticated sync is unavailable.
      }
      return null;
    }

    async function hydrate(fetchContext = deps.fetchContext) {
      if (typeof fetchContext !== "function") { apply(); return context; }
      try { return update(await fetchContext({ deviceLanguages: Array.from(targetWindow.navigator?.languages || []), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }), "remote_hydration"); }
      catch (_error) { apply(); return context; }
    }
    function setLanguage(language, options = {}) {
      const locale = canonical(language); if (!locale) throw new TypeError("Unsupported locale.");
      const next = update({ locale, preference: { ...(context.preference || {}), language: locale, useDeviceLanguage: options.useDeviceLanguage === true } }, "language_selected");
      persistRemotePreference();
      return next;
    }
    function followDeviceLanguage() {
      const locale = canonical(targetWindow.navigator?.languages?.[0] || targetWindow.navigator?.language); if (!locale) return context;
      const next = update({ locale, preference: { ...(context.preference || {}), language: "", useDeviceLanguage: true } }, "device_language_changed");
      persistRemotePreference();
      return next;
    }
    function formatCurrency(value, options = {}) { return new Intl.NumberFormat(context.locale, { style: "currency", currency: options.currency || context.currency, currencyDisplay: options.currencyDisplay || "symbol", maximumFractionDigits: options.maximumFractionDigits ?? 2 }).format(Number(value || 0)); }
    function formatNumber(value, options = {}) { return new Intl.NumberFormat(context.locale, options).format(Number(value || 0)); }
    function formatDate(value, options = {}) { return new Intl.DateTimeFormat(context.locale, { timeZone: context.timezone, ...options }).format(new Date(value)); }
    function subscribe(listener) { if (typeof listener !== "function") return () => {}; listeners.add(listener); return () => listeners.delete(listener); }
    targetWindow.addEventListener?.("languagechange", () => { if (useDeviceLanguage) followDeviceLanguage(); });
    apply();
    return Object.freeze({ getContext: () => context, hydrate, update, setLanguage, persistRemotePreference, followDeviceLanguage, formatCurrency, formatNumber, formatDate, subscribe });
  }
  window.WingaModules.localization = window.WingaModules.localization || {};
  window.WingaModules.localization.createRuntime = createRuntime;
})();
