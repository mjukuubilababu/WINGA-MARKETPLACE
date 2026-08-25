(() => {
  const STORAGE_KEY = "winga-global-context-v1";
  const CATALOG_SCHEMA_VERSION = 1;
  const DEFAULT_LANGUAGE = "en";
  const CATALOG_BASE_PATH = "/src/localization/catalogs";
  const ALLOWED_ATTRIBUTES = new Set(["aria-label", "placeholder", "title"]);
  const STATIC_SELECTOR_KEYS = Object.freeze([
    ["#header-signup-button", "auth.signUp", ""],
    ["#top-bar-subtitle", "header.discover", ""],
    ["#filter-price-min", "search.minimumPrice", "placeholder"],
    ["#filter-price-max", "search.maximumPrice", "placeholder"],
    ["#filter-location", "search.region", "placeholder"],
    ['#sort-select option[value="default"]', "search.defaultSort", ""],
    ['#sort-select option[value="price-asc"]', "search.lowestPrice", ""],
    ['#sort-select option[value="price-desc"]', "search.highestPrice", ""],
    ['#sort-select option[value="newest"]', "search.newest", ""],
    ['#sort-select option[value="popular"]', "search.popular", ""],
    ["#view-home-back", "nav.backHome", "aria-label"],
    ["#market-showcase .eyebrow", "marketplace.picks", ""],
    ["#market-showcase h3", "marketplace.trending", ""],
    ["#market-showcase .meta-copy", "marketplace.browseHint", ""],
    ["#cancel-edit-button", "common.cancel", ""]
  ]);
  const FALLBACK = Object.freeze({ schemaVersion: 1, locale: "sw-TZ", language: "sw", direction: "ltr", currency: "TZS", currencyCode: "TZS", currencySymbol: "TSh", timezone: "Africa/Dar_es_Salaam", units: "metric", market: { country: "TZ", discoveryPolicy: "local_priority_global_discovery" } });
  function canonical(value = "") { try { return Intl.getCanonicalLocales(String(value || "").replace(/_/g, "-"))[0] || ""; } catch (_error) { return ""; } }
  function read(storage) { try { const value = JSON.parse(storage?.getItem(STORAGE_KEY) || "null"); return value?.schemaVersion === 1 ? value : null; } catch (_error) { return null; } }
  function languageOf(locale = "") { return canonical(locale).split("-")[0].toLowerCase(); }
  function directionOf(locale = "") { return new Set(["ar", "fa", "he", "ur"]).has(languageOf(locale)) ? "rtl" : "ltr"; }
  function createFallbackChain(locale = "") {
    const normalized = canonical(locale);
    return Array.from(new Set([normalized, languageOf(normalized), DEFAULT_LANGUAGE].filter(Boolean)));
  }
  function isValidCatalog(catalog, requestedLocale = "") {
    return Boolean(
      catalog
      && typeof catalog === "object"
      && !Array.isArray(catalog)
      && catalog.schemaVersion === CATALOG_SCHEMA_VERSION
      && canonical(catalog.locale)
      && (!languageOf(requestedLocale) || languageOf(catalog.locale) === languageOf(requestedLocale))
      && catalog.messages
      && typeof catalog.messages === "object"
      && !Array.isArray(catalog.messages)
    );
  }
  function resolveMessage(message, variables = {}, locale = DEFAULT_LANGUAGE) {
    if (typeof message === "string") return message;
    if (!message || typeof message !== "object" || Array.isArray(message)) return "";
    const count = Number(variables.count);
    if (!Number.isFinite(count)) return typeof message.other === "string" ? message.other : "";
    const exact = message[`=${count}`];
    if (typeof exact === "string") return exact;
    let category = "other";
    try { category = new Intl.PluralRules(locale).select(count); } catch (_error) {}
    return typeof message[category] === "string"
      ? message[category]
      : typeof message.other === "string"
        ? message.other
        : "";
  }
  function interpolate(template, variables = {}) {
    return String(template || "").replace(/\\{([A-Za-z0-9_]+)\\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
    ));
  }
  function createRuntime(deps = {}) {
    const targetWindow = deps.window || window;
    const storage = deps.storage || targetWindow.localStorage;
    const listeners = new Set();
    const fetchCatalog = deps.fetchCatalog || (async (locale) => {
      const language = languageOf(locale) || DEFAULT_LANGUAGE;
      const response = await targetWindow.fetch(`${CATALOG_BASE_PATH}/${encodeURIComponent(language)}.json`, {
        credentials: "same-origin",
        cache: "force-cache",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
      return response.json();
    });
    const catalogCache = new Map();
    const catalogRequests = new Map();
    const missingKeys = new Set();
    let activeCatalogs = [];
    let activeCatalogLocale = "";
    let catalogGeneration = 0;
    let context = read(storage) || { ...FALLBACK };
    let useDeviceLanguage = context.preference?.useDeviceLanguage !== false;
    function apply() {
      const root = targetWindow.document?.documentElement;
      if (!root) return;
      root.lang = context.locale || FALLBACK.locale;
      root.dir = context.direction === "rtl" ? "rtl" : "ltr";
      root.dataset.wingaCountry = context.market?.country || "";
      root.dataset.wingaCurrency = context.currency || "";
      root.dataset.wingaCatalogLocale = activeCatalogLocale;
    }
    function persist() { try { storage?.setItem(STORAGE_KEY, JSON.stringify(context)); } catch (_error) {} }
    function emit(reason) {
      apply(); persist();
      listeners.forEach((listener) => { try { listener(context, reason); } catch (_error) {} });
      targetWindow.dispatchEvent?.(new targetWindow.CustomEvent("winga:global-context", { detail: { context, reason } }));
    }
    function reportMissingKey(key) {
      const fingerprint = `${context.locale}:${key}`;
      if (missingKeys.has(fingerprint)) return;
      missingKeys.add(fingerprint);
      targetWindow.dispatchEvent?.(new targetWindow.CustomEvent("winga:i18n-missing-key", {
        detail: { key, locale: context.locale, catalogLocale: activeCatalogLocale }
      }));
    }
    function translate(key, variables = {}, fallbackText = "") {
      const safeKey = String(key || "").trim();
      if (!safeKey) return String(fallbackText || "");
      for (const catalog of activeCatalogs) {
        const message = resolveMessage(catalog?.messages?.[safeKey], variables, catalog?.locale || context.locale);
        if (message) return interpolate(message, variables);
      }
      reportMissingKey(safeKey);
      return String(fallbackText || safeKey);
    }
    function bindStaticTranslationKeys() {
      const document = targetWindow.document;
      if (!document?.querySelector) return;
      STATIC_SELECTOR_KEYS.forEach(([selector, key, attribute]) => {
        const node = document.querySelector(selector);
        if (!node) return;
        node.setAttribute("data-winga-i18n", key);
        node.setAttribute("data-winga-i18n-lock", "");
        if (attribute && ALLOWED_ATTRIBUTES.has(attribute)) node.setAttribute("data-winga-i18n-attr", attribute);
      });
    }
    function translateDom(scope = targetWindow.document) {
      bindStaticTranslationKeys();
      if (!scope?.querySelectorAll) return 0;
      const nodes = Array.from(scope.querySelectorAll("[data-winga-i18n]"));
      nodes.forEach((node) => {
        const key = node.getAttribute("data-winga-i18n");
        const attribute = node.getAttribute("data-winga-i18n-attr");
        if (!node.hasAttribute("data-winga-i18n-fallback")) {
          const original = attribute && ALLOWED_ATTRIBUTES.has(attribute) ? node.getAttribute(attribute) : node.textContent;
          node.setAttribute("data-winga-i18n-fallback", String(original || ""));
        }
        const fallbackText = node.getAttribute("data-winga-i18n-fallback") || "";
        const translated = translate(key, {}, fallbackText);
        if (attribute && ALLOWED_ATTRIBUTES.has(attribute)) {
          if (node.getAttribute(attribute) !== translated) node.setAttribute(attribute, translated);
        } else if (node.textContent !== translated) {
          node.textContent = translated;
        }
      });
      return nodes.length;
    }
    async function loadSingleCatalog(locale) {
      const language = languageOf(locale);
      if (!language) return null;
      if (catalogCache.has(language)) return catalogCache.get(language);
      if (catalogRequests.has(language)) return catalogRequests.get(language);
      const request = Promise.resolve(fetchCatalog(language))
        .then((catalog) => {
          if (!isValidCatalog(catalog, language)) throw new TypeError(`Invalid ${language} catalog.`);
          const normalized = Object.freeze({
            schemaVersion: catalog.schemaVersion,
            version: String(catalog.version || ""),
            locale: canonical(catalog.locale),
            messages: Object.freeze({ ...catalog.messages })
          });
          catalogCache.set(language, normalized);
          return normalized;
        })
        .finally(() => catalogRequests.delete(language));
      catalogRequests.set(language, request);
      return request;
    }
    async function loadCatalog(locale = context.locale) {
      const generation = ++catalogGeneration;
      const settled = await Promise.allSettled(createFallbackChain(locale).map(loadSingleCatalog));
      if (generation !== catalogGeneration) return activeCatalogs;
      const loaded = settled.filter((result) => result.status === "fulfilled" && result.value).map((result) => result.value);
      if (!loaded.length) return activeCatalogs;
      activeCatalogs = loaded;
      activeCatalogLocale = loaded[0].locale;
      apply();
      translateDom();
      targetWindow.dispatchEvent?.(new targetWindow.CustomEvent("winga:i18n-ready", {
        detail: { locale: context.locale, catalogLocale: activeCatalogLocale, versions: loaded.map((catalog) => catalog.version).filter(Boolean) }
      }));
      return activeCatalogs;
    }
    function scheduleCatalogLoad(locale = context.locale) {
      const run = () => loadCatalog(locale).catch(() => activeCatalogs);
      if (typeof targetWindow.requestIdleCallback === "function") targetWindow.requestIdleCallback(run, { timeout: 2500 });
      else targetWindow.setTimeout(run, 0);
    }
    function update(next = {}, reason = "context_updated") {
      const previousLocale = context.locale;
      const locale = canonical(next.locale || context.locale) || FALLBACK.locale;
      context = Object.freeze({ ...FALLBACK, ...context, ...next, locale, language: locale.split("-")[0].toLowerCase(), direction: next.direction === "rtl" ? "rtl" : "ltr", market: { ...FALLBACK.market, ...(context.market || {}), ...(next.market || {}) } });
      useDeviceLanguage = context.preference?.useDeviceLanguage !== false;
      emit(reason);
      if (locale !== previousLocale || !activeCatalogs.length) scheduleCatalogLoad(locale);
      return context;
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
      if (typeof fetchContext !== "function") { apply(); scheduleCatalogLoad(); return context; }
      try { return update(await fetchContext({ deviceLanguages: Array.from(targetWindow.navigator?.languages || []), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }), "remote_hydration"); }
      catch (_error) { apply(); scheduleCatalogLoad(); return context; }
    }
    function setLanguage(language, options = {}) {
      const locale = canonical(language); if (!locale) throw new TypeError("Unsupported locale.");
      const next = update({ locale, direction: directionOf(locale), preference: { ...(context.preference || {}), language: locale, useDeviceLanguage: options.useDeviceLanguage === true } }, "language_selected");
      persistRemotePreference();
      return next;
    }
    function followDeviceLanguage() {
      const locale = canonical(targetWindow.navigator?.languages?.[0] || targetWindow.navigator?.language); if (!locale) return context;
      const next = update({ locale, direction: directionOf(locale), preference: { ...(context.preference || {}), language: "", useDeviceLanguage: true } }, "device_language_changed");
      persistRemotePreference();
      return next;
    }
    function formatCurrency(value, options = {}) {
      const numericValue = Number(value);
      const currency = String(options.currency || context.currencyCode || context.currency || FALLBACK.currencyCode).toUpperCase();
      const locale = canonical(options.locale || context.locale) || FALLBACK.locale;
      const maximumFractionDigits = options.maximumFractionDigits ?? (new Set(["TZS", "KES", "UGX", "RWF"]).has(currency) ? 0 : 2);
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: /^[A-Z]{3}$/.test(currency) ? currency : FALLBACK.currencyCode,
          currencyDisplay: options.currencyDisplay || "narrowSymbol",
          minimumFractionDigits: options.minimumFractionDigits ?? 0,
          maximumFractionDigits
        }).format(Number.isFinite(numericValue) ? numericValue : 0);
      } catch (_error) {
        const symbol = String(context.currencySymbol || FALLBACK.currencySymbol);
        return `${symbol} ${new Intl.NumberFormat(FALLBACK.locale, { maximumFractionDigits }).format(Number.isFinite(numericValue) ? numericValue : 0)}`;
      }
    }
    function formatPrice(value, currencyContext = {}, options = {}) {
      const source = currencyContext && typeof currencyContext === "object" ? currencyContext : {};
      return formatCurrency(value, {
        ...options,
        locale: source.locale || options.locale,
        currency: source.currencyCode || source.currency || options.currency
      });
    }
    function formatNumber(value, options = {}) { return new Intl.NumberFormat(context.locale, options).format(Number(value || 0)); }
    function formatDate(value, options = {}) { return new Intl.DateTimeFormat(context.locale, { timeZone: context.timezone, ...options }).format(new Date(value)); }
    function subscribe(listener) { if (typeof listener !== "function") return () => {}; listeners.add(listener); return () => listeners.delete(listener); }
    targetWindow.addEventListener?.("languagechange", () => { if (useDeviceLanguage) followDeviceLanguage(); });
    const MutationObserverCtor = targetWindow.MutationObserver;
    if (typeof MutationObserverCtor === "function" && targetWindow.document?.documentElement) {
      const translationObserver = new MutationObserverCtor((records) => {
        if (!activeCatalogs.length) return;
        const scopes = new Set();
        records.forEach((record) => {
          const element = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
          const locked = element?.closest?.("[data-winga-i18n-lock]");
          if (locked) scopes.add(locked.parentElement || locked);
        });
        scopes.forEach((scope) => translateDom(scope));
      });
      translationObserver.observe(targetWindow.document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "placeholder", "title"]
      });
    }
    apply();
    scheduleCatalogLoad();
    return Object.freeze({
      getContext: () => context,
      getCatalogLocale: () => activeCatalogLocale,
      hydrate,
      update,
      setLanguage,
      persistRemotePreference,
      followDeviceLanguage,
      loadCatalog,
      translate,
      translateDom,
      formatCurrency,
      formatPrice,
      formatNumber,
      formatDate,
      subscribe
    });
  }
  window.WingaModules.localization = window.WingaModules.localization || {};
  window.WingaModules.localization.createRuntime = createRuntime;
  window.WingaModules.localization.createFallbackChain = createFallbackChain;
  window.WingaModules.localization.isValidCatalog = isValidCatalog;
  window.WingaModules.localization.resolveMessage = resolveMessage;
  window.WingaModules.localization.directionOf = directionOf;
})();
