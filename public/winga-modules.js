// src/core/module-registry.js
window.WingaModules = window.WingaModules || {};
window.WingaModules.config = window.WingaModules.config || {};
window.WingaModules.state = window.WingaModules.state || {};
window.WingaModules.auth = window.WingaModules.auth || {};
window.WingaModules.promotions = window.WingaModules.promotions || {};
window.WingaModules.marketplace = window.WingaModules.marketplace || {};
window.WingaModules.hero = window.WingaModules.hero || {};
window.WingaModules.categories = window.WingaModules.categories || {};
window.WingaModules.products = window.WingaModules.products || {};
window.WingaModules.requests = window.WingaModules.requests || {};
window.WingaModules.reviews = window.WingaModules.reviews || {};
window.WingaModules.components = window.WingaModules.components || {};
window.WingaModules.chat = window.WingaModules.chat || {};
window.WingaModules.navigation = window.WingaModules.navigation || {};
window.WingaModules.profile = window.WingaModules.profile || {};
window.WingaModules.admin = window.WingaModules.admin || {};
window.WingaModules.productDetail = window.WingaModules.productDetail || {};
window.WingaModules.monitoring = window.WingaModules.monitoring || {};


// src/config/categories.js
(() => {
  const MARKETPLACE_CATEGORY_TREE = [
    {
      value: "wanawake",
      label: "WANAWAKE",
      subcategories: [
        { value: "wanawake-magauni", label: "Magauni" },
        { value: "wanawake-sketi", label: "Sketi" },
        { value: "wanawake-blouse", label: "Blouse" },
        { value: "wanawake-suruali", label: "Suruali" },
        { value: "wanawake-seti", label: "Seti" },
        { value: "wanawake-underwear", label: "Underwear" },
        { value: "wanawake-vitenge", label: "Vitenge" },
        { value: "wanawake-bazin", label: "Bazin" },
        { value: "wanawake-bazee", label: "Bazee" },
        { value: "wanawake-lace", label: "Lace" },
        { value: "wanawake-kanga", label: "Kanga" },
        { value: "wanawake-vikoi", label: "Vikoi" },
        { value: "wanawake-mitandio", label: "Mitandio" },
        { value: "wanawake-vijora", label: "Vijora" },
        { value: "wanawake-madera", label: "Madera" },
        { value: "wanawake-baibui", label: "Baibui" },
        { value: "wanawake-hijabu", label: "Hijabu" },
        { value: "wanawake-abaya", label: "Abaya" },
        { value: "wanawake-shungi", label: "Shungi" },
        { value: "wanawake-crop-top", label: "Crop top" }
      ]
    },
    {
      value: "wanaume",
      label: "WANAUME",
      subcategories: [
        { value: "wanaume-mashati", label: "Mashati" },
        { value: "wanaume-t-shirt", label: "T-shirt" },
        { value: "wanaume-sweater", label: "Sweater" },
        { value: "wanaume-koti", label: "Koti" },
        { value: "wanaume-jacket", label: "Jacket" },
        { value: "wanaume-tracksuit", label: "Tracksuit" },
        { value: "wanaume-suruali-kitambaa", label: "Suruali-kitambaa" },
        { value: "wanaume-jeans", label: "Jeans" },
        { value: "wanaume-suti", label: "Suti" },
        { value: "wanaume-boxer", label: "Boxer" },
        { value: "wanaume-crocs", label: "Crocs" }
      ]
    },
    {
      value: "sherehe",
      label: "SHEREHE",
      subcategories: [
        { value: "sherehe-mavazi", label: "Mavazi ya sherehe" },
        { value: "sherehe-viatu", label: "Viatu vya sherehe" },
        { value: "sherehe-accessories", label: "Accessories za sherehe" }
      ]
    },
    {
      value: "casual",
      label: "CASUAL",
      subcategories: [
        { value: "casual-mavazi", label: "Mavazi ya casual" },
        { value: "casual-viatu", label: "Viatu vya casual" },
        { value: "casual-kila-siku", label: "Seti za kila siku" }
      ]
    },
    {
      value: "watoto",
      label: "WATOTO",
      subcategories: [
        { value: "watoto-wavulana", label: "Wavulana" },
        { value: "watoto-wasichana", label: "Wasichana" },
        { value: "watoto-viatu-vya-watoto", label: "Viatu vya watoto" },
        { value: "watoto-seti-za-watoto", label: "Seti za watoto" }
      ]
    },
    {
      value: "viatu",
      label: "VIATU",
      subcategories: [
        { value: "viatu-sneakers", label: "Sneakers" },
        { value: "viatu-sandals", label: "Sandals" },
        { value: "viatu-high-heels", label: "High heels" },
        { value: "viatu-boots", label: "Boots" },
        { value: "viatu-vikali", label: "Viatu vikali" },
        { value: "viatu-raba-kali", label: "Raba kali" },
        { value: "viatu-miguu-mikali", label: "Miguu mikali" },
        { value: "viatu-official", label: "Official" }
      ]
    },
    {
      value: "vyombo",
      label: "VYOMBO",
      subcategories: [
        { value: "vyombo-sufuria", label: "Sufuria" },
        { value: "vyombo-sahani", label: "Sahani" },
        { value: "vyombo-vikombe", label: "Vikombe" },
        { value: "vyombo-seti", label: "Seti za vyombo" }
      ]
    },
    {
      value: "electronics",
      label: "ELECTRONICS",
      subcategories: [
        { value: "electronics-simu", label: "Simu" },
        { value: "electronics-desktop", label: "Desktop" },
        { value: "electronics-radio", label: "Radio" },
        { value: "electronics-tv", label: "Tv" },
        { value: "electronics-laptop", label: "Laptop" }
      ]
    },
    {
      value: "vitu-used",
      label: "VITU USED",
      subcategories: []
    },
    {
      value: "accessories",
      label: "ACCESSORIES",
      subcategories: [
        { value: "accessories-mabegi", label: "Mabegi" },
        { value: "accessories-mikanda", label: "Mikanda" },
        { value: "accessories-kofia", label: "Kofia" },
        { value: "accessories-saa", label: "Saa" }
      ]
    }
  ];

  const DEFAULT_TOP_CATEGORIES = MARKETPLACE_CATEGORY_TREE.map((category) => ({
    value: category.value,
    label: category.label
  }));

  const DEFAULT_PRODUCT_CATEGORIES = MARKETPLACE_CATEGORY_TREE.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      value: subcategory.value,
      label: subcategory.label,
      topValue: category.value,
      topLabel: category.label
    }))
  );

  const LEGACY_CATEGORY_MAPPINGS = {
    gauni: { value: "wanawake-magauni", label: "Magauni", topValue: "wanawake", topLabel: "WANAWAKE" },
    sketi: { value: "wanawake-sketi", label: "Sketi", topValue: "wanawake", topLabel: "WANAWAKE" },
    viatu: { value: "viatu", label: "VIATU", topValue: "viatu", topLabel: "VIATU" },
    vyombo: { value: "vyombo", label: "VYOMBO", topValue: "vyombo", topLabel: "VYOMBO" },
    "nguo-za-watoto": { value: "watoto", label: "WATOTO", topValue: "watoto", topLabel: "WATOTO" },
    electronics: { value: "electronics", label: "ELECTRONICS", topValue: "electronics", topLabel: "ELECTRONICS" },
    "vitu-used": { value: "vitu-used", label: "VITU USED", topValue: "vitu-used", topLabel: "VITU USED" },
    sherehe: { value: "sherehe", label: "SHEREHE", topValue: "sherehe", topLabel: "SHEREHE" },
    casual: { value: "casual", label: "CASUAL", topValue: "casual", topLabel: "CASUAL" },
    "wanawake-blauzi": { value: "wanawake-blouse", label: "Blouse", topValue: "wanawake", topLabel: "WANAWAKE" },
    "wanaume-suruali": { value: "wanaume-suruali-kitambaa", label: "Suruali-kitambaa", topValue: "wanaume", topLabel: "WANAUME" },
    "home-appliance": { value: "home-appliance", label: "Home Appliance" }
  };

  window.WingaModules.config.categories = {
    MARKETPLACE_CATEGORY_TREE,
    DEFAULT_TOP_CATEGORIES,
    DEFAULT_PRODUCT_CATEGORIES,
    LEGACY_CATEGORY_MAPPINGS
  };
})();


// src/config/chat.js
(() => {
  window.WingaModules.config.chat = {
    CHAT_EMOJI_CHOICES: [
      "\u{1F642}",
      "\u{1F60A}",
      "\u{1F60D}",
      "\u{1F525}",
      "\u{1F44D}",
      "\u{1F64F}",
      "\u{1F389}",
      "\u{1F91D}",
      "\u{1F4CD}",
      "\u{1F4AC}",
      "\u2764\uFE0F",
      "\u2728"
    ]
  };
})();


// src/config/promotions.js
(() => {
  window.WingaModules.config.promotions = {
    PROMOTION_OPTIONS: {
      boost: { label: "Boost Product", amount: 5000, durationDays: 3 },
      featured: { label: "Featured Section", amount: 10000, durationDays: 7 },
      category_boost: { label: "Category Boost", amount: 7000, durationDays: 5 },
      pin_top: { label: "Pin To Top", amount: 12000, durationDays: 2 }
    }
  };
})();


// src/state/ui-state.js
(() => {
  function createChatUiState() {
    return {
      openEmojiScope: "",
      activeContext: null,
      profileMessagesMode: "list",
      profileMessagesFilter: "all",
      profileHasSelection: false,
      currentDraft: "",
      selectedProductIds: [],
      activeReplyMessageId: "",
      openMessageMenuId: "",
      isContextOpen: false,
      messagePollingTimer: 0,
      realtimeReconnectTimer: 0
    };
  }

  function createProductDetailUiState() {
    return {
      reviewDraft: {
        productId: "",
        rating: 5,
        comment: ""
      }
    };
  }

  window.WingaModules.state.createChatUiState = createChatUiState;
  window.WingaModules.state.createProductDetailUiState = createProductDetailUiState;
})();


// src/state/runtime-state.js
(() => {
  function createRuntimeState() {
    return {
      ui: {
        slideIndex: 0,
        slideshowTimer: null,
        chromeResizeFrame: 0,
        renderFrame: 0,
        mobileHeaderLastScrollY: 0,
        mobileHeaderLastToggleY: 0,
        mobileHeaderHidden: false,
        mobileHeaderScrollFrame: 0,
        lastScrollActivityAt: 0,
        homeScrollSaveFrame: 0,
        homeScrollRestoreFrame: 0,
        homeScrollRestorePending: false,
        homeScrollRestoreY: 0
      },
      search: {
        activeImageSearch: null,
        isSearchDropdownDismissed: false,
        isInputFocused: false,
        isMobileSearchOpen: false,
        isMobileCategoryOpen: false,
        mobileCategoryTopValue: "",
        renderDebounceTimer: 0
      },
      profile: {
        pendingSection: "",
        activeSection: "profile-products-panel",
        isHeaderUserMenuOpen: false
      }
    };
  }

  window.WingaModules.state.createRuntimeState = createRuntimeState;
})();


// src/auth/permissions.js
(() => {
  function createPermissionsHelpers(deps) {
    const {
      getCurrentSession,
      getCurrentUser,
      getCurrentView,
      getMarketplaceUser
    } = deps;

    function getCurrentUsername() {
      return String(getCurrentUser?.() || "").trim();
    }

    function hasValidSessionIdentity(session = getCurrentSession?.()) {
      const username = String(session?.username || "").trim();
      return Boolean(username && username === getCurrentUsername());
    }

    function normalizeRole(role) {
      const normalized = String(role || "").trim().toLowerCase();
      return ["buyer", "seller", "admin", "moderator"].includes(normalized) ? normalized : "";
    }

    function getResolvedRole() {
      const session = getCurrentSession?.();
      const sessionRole = normalizeRole(session?.role);
      if (sessionRole) {
        return sessionRole;
      }
      if (!hasValidSessionIdentity(session)) {
        return "";
      }
      const marketplaceRole = normalizeRole(getMarketplaceUser?.(getCurrentUsername())?.role);
      return marketplaceRole;
    }

    function isBuyerUser() {
      return getResolvedRole() === "buyer";
    }

    function isSellerUser() {
      return getResolvedRole() === "seller";
    }

    function canUseBuyerFeatures() {
      return isAuthenticatedUser() && (isBuyerUser() || isSellerUser());
    }

    function canUseSellerFeatures() {
      return isAuthenticatedUser() && isSellerUser();
    }

    function isAuthenticatedUser() {
      return hasValidSessionIdentity();
    }

    function shouldHideOwnProductsInMarketplace() {
      return false;
    }

    function isMarketplaceBrowseCandidate(product, options = {}) {
      const { allowOwn = false } = options;
      if (!product) {
        return false;
      }
      if (allowOwn) {
        return true;
      }
      if (!shouldHideOwnProductsInMarketplace()) {
        return true;
      }
      return product.uploadedBy !== getCurrentUser();
    }

    return {
      isBuyerUser,
      isSellerUser,
      canUseBuyerFeatures,
      canUseSellerFeatures,
      isAuthenticatedUser,
      shouldHideOwnProductsInMarketplace,
      isMarketplaceBrowseCandidate
    };
  }

  window.WingaModules.auth.createPermissionsHelpers = createPermissionsHelpers;
})();


// src/monitoring/observability.js
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


// src/components/dom-helpers.js
(() => {
  const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta"]);

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) {
      element.className = options.className;
    }
    if (options.textContent !== undefined) {
      element.textContent = options.textContent;
    }
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          element.setAttribute(key, String(value));
        }
      });
    }
    return element;
  }

  function setEmptyCopy(target, message) {
    if (!target) {
      return;
    }
    target.replaceChildren(createElement("p", {
      className: "empty-copy",
      textContent: message
    }));
  }

  function setAdminNavLabel(target, label) {
    if (!target) {
      return;
    }
    const icon = createElement("span", {
      className: "nav-icon",
      textContent: "\u{1F6E1}\uFE0F"
    });
    const text = createElement("span", { textContent: label });
    target.replaceChildren(icon, text);
  }

  function createSectionHeading({ eyebrow = "", title = "", meta = "" } = {}) {
    const wrapper = createElement("div", { className: "section-heading" });
    const left = createElement("div");
    if (eyebrow) {
      left.appendChild(createElement("p", { className: "eyebrow", textContent: eyebrow }));
    }
    if (title) {
      left.appendChild(createElement("h3", { textContent: title }));
    }
    wrapper.appendChild(left);
    const safeMeta = String(meta == null ? "" : meta).trim();
    if (safeMeta && safeMeta.toLowerCase() !== "null" && safeMeta.toLowerCase() !== "undefined") {
      wrapper.appendChild(createElement("span", { className: "meta-copy", textContent: safeMeta }));
    }
    return wrapper;
  }

  function sanitizeMarkupTree(root) {
    if (!root?.querySelectorAll) {
      return root;
    }

    root.querySelectorAll("*").forEach((node) => {
      const tagName = String(node.tagName || "").toLowerCase();
      if (BLOCKED_TAGS.has(tagName)) {
        node.remove();
        return;
      }

      Array.from(node.attributes || []).forEach((attribute) => {
        const name = String(attribute.name || "").toLowerCase();
        const value = String(attribute.value || "").trim();
        const normalizedValue = value.toLowerCase();

        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "srcdoc") {
          node.removeAttribute(attribute.name);
          return;
        }

        if (
          ["href", "src", "xlink:href", "formaction"].includes(name)
          && normalizedValue.startsWith("javascript:")
        ) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    return root;
  }

  function createFragmentFromMarkup(markup = "") {
    const template = document.createElement("template");
    template.innerHTML = String(markup || "").trim();
    return sanitizeMarkupTree(template.content.cloneNode(true));
  }

  function createElementFromMarkup(markup = "") {
    const fragment = createFragmentFromMarkup(markup);
    return fragment.firstElementChild || document.createComment("empty-markup");
  }

  window.WingaModules.components.dom = {
    createElement,
    setEmptyCopy,
    setAdminNavLabel,
    createSectionHeading,
    createFragmentFromMarkup,
    createElementFromMarkup
  };
})();


// src/components/ui-helpers.js
(() => {
  const { createElement } = window.WingaModules.components.dom;

  function sanitizeImageSource(src = "", fallbackSrc = "") {
    const value = String(src || "").trim();
    if (!value) {
      return fallbackSrc || "";
    }
    if (/^(https?:|blob:)/i.test(value)) {
      return value;
    }
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) {
      return value;
    }
    if (/^[./]/.test(value)) {
      return value;
    }
    return fallbackSrc || "";
  }

  function createStatusPill(label, className = "") {
    return createElement("span", {
      className: `status-pill${className ? ` ${className}` : ""}`,
      textContent: label
    });
  }

  function createEmptyState(message, className = "empty-copy") {
    return createElement("p", {
      className,
      textContent: message
    });
  }

  function createStatBox({ value = "", label = "", action = "", attributes = {} } = {}) {
    const isAction = Boolean(action);
    const box = createElement(isAction ? "button" : "div", {
      className: `stat-box${isAction ? " stat-box-action" : ""}`,
      attributes: {
        ...(isAction ? { type: "button", "data-profile-action": action } : {}),
        ...(attributes || {})
      }
    });
    box.append(
      createElement("strong", { textContent: String(value) }),
      createElement("span", { textContent: label })
    );
    return box;
  }

  function createCategoryButton({
    label,
    value,
    isActive = false,
    isOpen = false,
    isSubcategory = false,
    parentValue = "",
    showChevron = false
  } = {}) {
    const button = createElement("button", {
      className: `cat-btn${isSubcategory ? " subcat-btn" : ""}${isActive ? " active" : ""}${isOpen ? " open" : ""}`,
      attributes: { type: "button" }
    });
    if (showChevron) {
      button.append(
        createElement("span", {
          className: "cat-btn-label",
          textContent: label
        }),
        createElement("span", {
          className: "cat-btn-chevron",
          textContent: "\u203A",
          attributes: { "aria-hidden": "true" }
        })
      );
    } else {
      button.textContent = label;
    }
    if (isSubcategory) {
      button.dataset.subcat = value;
      if (parentValue) {
        button.dataset.parentCat = parentValue;
      }
    } else {
      button.dataset.cat = value;
      button.setAttribute("aria-expanded", String(Boolean(isOpen)));
    }
    return button;
  }

  function createResponsiveImage({
    src = "",
    alt = "",
    className = "",
    fallbackSrc = "",
    attributes = {}
  } = {}) {
    const resolvedSrc = sanitizeImageSource(src, fallbackSrc);
    const shouldDisableZoom = Boolean(attributes["data-disable-image-zoom"]);
    const image = createElement("img", {
      className: `${className}${shouldDisableZoom ? "" : `${className ? " " : ""}zoomable-image`}`,
      attributes: {
        src: resolvedSrc,
        alt,
        loading: "lazy",
        decoding: "async",
        ...(shouldDisableZoom
          ? { "data-disable-image-zoom": "true" }
          : {
              "data-zoom-src": resolvedSrc,
              "data-zoom-alt": alt || "Image preview"
            }),
        ...attributes
      }
    });
    if (fallbackSrc) {
      image.onerror = function handleImageError() {
        window.dispatchEvent(new window.CustomEvent("winga:image-error", {
          detail: {
            productId: attributes["data-image-action-product"] || "",
            imageSource: this.currentSrc || this.getAttribute("src") || resolvedSrc,
            surface: attributes["data-image-action-surface"] || ""
          }
        }));
        this.onerror = null;
        this.src = fallbackSrc;
      };
    }
    image.addEventListener("load", function handleResponsiveImageLoad() {
      const naturalWidth = Number(this.naturalWidth || 0);
      const naturalHeight = Number(this.naturalHeight || 0);
      if (!naturalWidth || !naturalHeight) {
        return;
      }
      const portraitLike = naturalHeight > naturalWidth * 1.08;
      this.classList.toggle("image-is-portrait", portraitLike);
      this.classList.toggle("image-is-landscape", !portraitLike);
    });
    return image;
  }

  function createSlideDot(index, isActive = false) {
    return createElement("button", {
      className: `slide-dot${isActive ? " active" : ""}`,
      attributes: {
        type: "button",
        "data-index": index,
        "aria-label": `Nenda slide ${index + 1}`
      }
    });
  }

  window.WingaModules.components.ui = {
    createStatusPill,
    createEmptyState,
    createStatBox,
    createCategoryButton,
    createResponsiveImage,
    createSlideDot,
    sanitizeImageSource
  };
})();


// src/promotions/helpers.js
(() => {
  function createPromotionHelpers(deps) {
    const {
      getCurrentPromotions,
      getSelectedCategory,
      promotionOptions
    } = deps;

    const PROMOTION_SCORING = {
      priorityWeight: 140,
      amountWeightDivisor: 130,
      dailyIntensityDivisor: 18,
      durationWeight: 4,
      earlyBurstWeight: 42,
      featuredStabilityBonus: 25,
      pinTopUrgencyBonus: 65,
      categoryMatchBonus: 40,
      categoryMismatchMultiplier: 0.35
    };

    function inferTopCategoryValue(category) {
      const safeCategory = String(category || "").trim().toLowerCase();
      if (!safeCategory) {
        return "";
      }
      const separatorIndex = safeCategory.indexOf("-");
      return separatorIndex === -1 ? safeCategory : safeCategory.slice(0, separatorIndex);
    }

    function matchesCategoryContext(product, categories = []) {
      const topCategory = inferTopCategoryValue(product?.category);
      return (Array.isArray(categories) ? categories : []).some((category) => {
        const safeCategory = String(category || "").trim().toLowerCase();
        return safeCategory
          && (
            safeCategory === product?.category
            || safeCategory === topCategory
            || inferTopCategoryValue(safeCategory) === topCategory
          );
      });
    }

    function getPromotionPriority(type) {
      if (type === "pin_top") return 4;
      if (type === "featured") return 3;
      if (type === "category_boost") return 2;
      if (type === "boost") return 1;
      return 0;
    }

    function getActivePromotions() {
      const now = Date.now();
      return getCurrentPromotions().filter((promotion) =>
        promotion.status === "active"
        && promotion.paymentStatus === "paid"
        && new Date(promotion.endDate || 0).getTime() > now
      );
    }

    function getProductPromotions(productId) {
      return getActivePromotions()
        .filter((promotion) => promotion.productId === productId)
        .sort((first, second) => getPromotionPriority(second.type) - getPromotionPriority(first.type));
    }

    function getPrimaryPromotion(productId) {
      return getProductPromotions(productId)[0] || null;
    }

    function getPromotionLabel(type) {
      return promotionOptions[type]?.label || "Sponsored";
    }

    function getPromotionSortScore(product) {
      return getProductPromotions(product.id).reduce((sum, promotion) => {
        if (promotion.type === "category_boost" && getSelectedCategory() !== "all" && product.category !== getSelectedCategory()) {
          return sum;
        }
        return sum + getPromotionPriority(promotion.type);
      }, 0);
    }

    function getPromotionCommercialScore(product, context = {}) {
      const preferredCategories = Array.isArray(context.preferredCategories) ? context.preferredCategories : [];
      const selectedCategory = getSelectedCategory();
      const now = Date.now();

      return getProductPromotions(product?.id).reduce((sum, promotion) => {
        const option = promotionOptions[promotion.type] || {};
        const amountPaid = Number(promotion.amountPaid || option.amount || 0);
        const durationDays = Math.max(1, Number(option.durationDays || 1));
        const dailyIntensity = amountPaid / durationDays;
        const startTime = new Date(promotion.startDate || promotion.createdAt || 0).getTime();
        const endTime = new Date(promotion.endDate || 0).getTime();
        const totalWindow = Math.max(1, endTime - startTime);
        const elapsedRatio = Number.isFinite(startTime) && Number.isFinite(endTime)
          ? Math.min(1, Math.max(0, (now - startTime) / totalWindow))
          : 0;
        let score = (getPromotionPriority(promotion.type) * PROMOTION_SCORING.priorityWeight)
          + (amountPaid / PROMOTION_SCORING.amountWeightDivisor)
          + (dailyIntensity / PROMOTION_SCORING.dailyIntensityDivisor)
          + (durationDays * PROMOTION_SCORING.durationWeight)
          + ((1 - elapsedRatio) * PROMOTION_SCORING.earlyBurstWeight);

        if (promotion.type === "featured") {
          score += PROMOTION_SCORING.featuredStabilityBonus;
        }

        if (promotion.type === "pin_top") {
          score += (1 - elapsedRatio) * PROMOTION_SCORING.pinTopUrgencyBonus;
        }

        if (promotion.type === "category_boost") {
          const selectedCategoryMatches = selectedCategory && selectedCategory !== "all"
            && matchesCategoryContext(product, [selectedCategory]);
          const preferredCategoryMatches = matchesCategoryContext(product, preferredCategories);
          if (selectedCategoryMatches || preferredCategoryMatches) {
            score += PROMOTION_SCORING.categoryMatchBonus;
          } else {
            score *= PROMOTION_SCORING.categoryMismatchMultiplier;
          }
        }

        return sum + score;
      }, 0);
    }

    return {
      getPromotionPriority,
      getActivePromotions,
      getProductPromotions,
      getPrimaryPromotion,
      getPromotionLabel,
      getPromotionSortScore,
      getPromotionCommercialScore
    };
  }

  window.WingaModules.promotions.createPromotionHelpers = createPromotionHelpers;
})();


// src/hero/ui.js
(() => {
  function createHeroUiModule(deps) {
    const {
      createElement,
      createResponsiveImage,
      createSlideDot
    } = deps;

    function renderSlideshow() {
      const slidesTrack = deps.getSlidesTrack();
      const slideDots = deps.getSlideDots();
      const slidePrevButton = deps.getSlidePrevButton();
      const slideNextButton = deps.getSlideNextButton();
      if (!slidesTrack || !slideDots) {
        return;
      }

      const items = deps.getSlideshowItems();
      if (deps.getSlideIndex() >= items.length) {
        deps.setSlideIndex(0);
      }

      slidesTrack.className = "slide-track";
      const slideFragment = document.createDocumentFragment();
      items.forEach((item, index) => {
        const slide = createElement("div", {
          className: `slide${index === deps.getSlideIndex() ? " active" : ""}`
        });
        const shell = createElement("div", { className: "slide-shell" });
        const copy = createElement("div", { className: "slide-copy" });
        const highlightStack = Array.isArray(item.highlights) && item.highlights.length
          ? createElement("div", { className: "slide-highlights" })
          : null;
        if (highlightStack) {
          item.highlights.slice(0, 4).forEach((highlight) => {
            highlightStack.appendChild(createElement("span", {
              className: "slide-highlight-chip",
              textContent: highlight
            }));
          });
        }
        copy.append(
          createElement("p", { className: "slide-kicker eyebrow", textContent: item.kicker || "Marketplace highlight" }),
          createElement("h2", { textContent: item.title || "" }),
          createElement("p", { textContent: item.subtitle || "" })
        );
        if (highlightStack) {
          copy.appendChild(highlightStack);
        }

        const media = createElement("div", { className: "slide-media" });
        if (item.image) {
          media.appendChild(createResponsiveImage({
            src: item.image,
            alt: item.title || "Winga slide"
          }));
        } else {
          media.appendChild(createElement("div", { className: "slide-placeholder" }));
        }

        shell.append(copy, media);
        slide.appendChild(shell);
        slideFragment.appendChild(slide);
      });
      slidesTrack.replaceChildren(slideFragment);

      const dotFragment = document.createDocumentFragment();
      items.forEach((_, index) => {
        const button = createSlideDot(index, index === deps.getSlideIndex());
        button.addEventListener("click", () => {
          deps.setSlideIndex(Number(button.dataset.index || 0));
          renderSlideshow();
          deps.startSlideshow();
        });
        dotFragment.appendChild(button);
      });
      slideDots.replaceChildren(dotFragment);

      if (slidePrevButton) {
        slidePrevButton.style.display = items.length > 1 ? "grid" : "none";
      }
      if (slideNextButton) {
        slideNextButton.style.display = items.length > 1 ? "grid" : "none";
      }
    }

    return {
      renderSlideshow
    };
  }

  window.WingaModules.hero.createHeroUiModule = createHeroUiModule;
})();


// src/categories/ui.js
(() => {
  function createCategoriesUiModule(deps) {
    const {
      createElement,
      createCategoryButton,
      createResponsiveImage
    } = deps;
    let resizeBound = false;

    function syncDesktopCategoryLayoutMode() {
      const target = deps.getCategoriesTarget();
      const desktopRoot = target?.querySelector(".category-top-row");
      if (!target || !desktopRoot) {
        return;
      }

      const availableWidth = Math.max(0, Number(target.clientWidth || 0));
      const contentWidth = Math.max(0, Number(desktopRoot.scrollWidth || 0));
      const shouldFill = contentWidth >= Math.max(availableWidth - 24, 0);
      target.classList.toggle("category-layout-fill", shouldFill);
      target.classList.toggle("category-layout-centered", !shouldFill);
    }

    function ensureResizeSync() {
      if (resizeBound || typeof window === "undefined") {
        return;
      }
      resizeBound = true;
      window.addEventListener("resize", () => {
        window.requestAnimationFrame(syncDesktopCategoryLayoutMode);
      }, { passive: true });
    }

    function createDesktopCategoryItem(category, expandedTopCategory, selectedCategory, pinnedDesktopCategory) {
      const item = createElement("div", {
        className: `category-item${expandedTopCategory === category.value ? " open" : ""}${pinnedDesktopCategory === category.value ? " locked-open" : ""}`,
        attributes: { "data-category-item": category.value }
      });
      item.appendChild(createCategoryButton({
        label: category.label,
        value: category.value,
        isActive: selectedCategory === category.value,
        isOpen: expandedTopCategory === category.value || pinnedDesktopCategory === category.value
      }));

      const subcategoryRow = createElement("div", {
        className: "subcategory-row",
        attributes: { "data-subcategory-row": category.value }
      });
      const previewProduct = deps.getCategoryPreviewProduct(category.value);
      const panel = createElement("div", {
        className: `subcategory-panel ${previewProduct ? "has-preview" : "text-only"}`
      });
      const links = createElement("div", { className: "subcategory-links" });
      deps.getSubcategoriesForTopCategory(category.value).forEach((subcategory) => {
        links.appendChild(createCategoryButton({
          label: subcategory.label,
          value: subcategory.value,
          isActive: selectedCategory === subcategory.value,
          isSubcategory: true,
          parentValue: category.value
        }));
      });
      panel.appendChild(links);

      if (previewProduct) {
        const preview = createElement("div", { className: "subcategory-preview" });
        preview.appendChild(createResponsiveImage({
          src: previewProduct.image,
          alt: previewProduct.name || category.label,
          fallbackSrc: deps.getImageFallbackDataUri("WINGA")
        }));
        panel.appendChild(preview);
      }

      subcategoryRow.appendChild(panel);
      item.appendChild(subcategoryRow);
      return item;
    }

    function createMobileCategoryRow({
      label = "",
      value = "",
      isActive = false,
      isSubcategory = false,
      parentValue = "",
      showChevron = false,
      isViewAll = false
    } = {}) {
      const row = createElement("button", {
        className: [
          "mobile-category-row",
          isSubcategory ? "mobile-subcategory-row" : "mobile-main-category-row",
          isViewAll ? "mobile-subcategory-row-view-all" : "",
          isActive ? "active" : ""
        ].filter(Boolean).join(" "),
        attributes: {
          type: "button"
        }
      });
      row.appendChild(createElement("span", {
        className: "mobile-category-row-label",
        textContent: label
      }));
      if (showChevron) {
        row.appendChild(createElement("span", {
          className: "mobile-category-row-chevron",
          textContent: "\u203A",
          attributes: { "aria-hidden": "true" }
        }));
      }

      if (isSubcategory) {
        row.dataset.subcat = value;
        if (parentValue) {
          row.dataset.parentCat = parentValue;
        }
      } else {
        row.dataset.cat = value;
        row.setAttribute("aria-expanded", String(Boolean(showChevron)));
      }
      return row;
    }

    function createMobileCategoryLayout(mobileActiveTopCategory, selectedCategory) {
      const activeTopCategory = mobileActiveTopCategory || "";
      const subcategories = activeTopCategory
        ? deps.getSubcategoriesForTopCategory(activeTopCategory)
        : [];
      const isSubcategoryScreen = Boolean(activeTopCategory && subcategories.length);
      const layout = createElement("section", {
        className: "mobile-category-sheet",
        attributes: {
          "aria-label": "Browse categories",
          "data-mobile-category-depth": isSubcategoryScreen ? "subcategories" : "categories"
        }
      });

      const header = createElement("div", { className: "mobile-category-sheet-header" });
      header.append(
        createElement("button", {
          className: "mobile-category-close",
          textContent: "\u00D7",
          attributes: {
            type: "button",
            "aria-label": "Funga categories",
            "data-close-mobile-categories": "true"
          }
        })
      );
      layout.appendChild(header);

      const viewport = createElement("div", { className: "mobile-category-viewport" });
      const track = createElement("div", { className: "mobile-category-track" });

      const mainScreen = createElement("section", {
        className: "mobile-category-screen mobile-category-screen-main",
        attributes: { "aria-label": "Main categories" }
      });
      const mainList = createElement("div", { className: "mobile-category-list" });

      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createMobileCategoryRow({
        label: "Zote",
        value: "all",
        isActive: selectedCategory === "all"
      }));
      mainList.appendChild(allItem);

      deps.getAvailableTopCategories().forEach((category) => {
        const hasSubcategories = deps.getSubcategoriesForTopCategory(category.value).length > 0;
        const item = createElement("div", {
          className: `category-item${activeTopCategory === category.value ? " open" : ""}`,
          attributes: { "data-category-item": category.value }
        });
        item.appendChild(createMobileCategoryRow({
          label: category.label,
          value: category.value,
          isActive: selectedCategory === category.value,
          showChevron: hasSubcategories
        }));
        mainList.appendChild(item);
      });
      mainScreen.appendChild(mainList);
      track.appendChild(mainScreen);

      const subScreen = createElement("section", {
        className: "mobile-category-screen mobile-category-screen-sub",
        attributes: { "aria-label": "Subcategories" }
      });
      const subScreenHeader = createElement("div", { className: "mobile-subcategory-header" });
      subScreenHeader.append(
        createElement("button", {
          className: "mobile-category-back",
          textContent: "\u2039",
          attributes: {
            type: "button",
            "aria-label": "Rudi categories kuu",
            "data-mobile-category-back": "true"
          }
        }),
        createElement("div", {
          className: "mobile-subcategory-heading",
          textContent: activeTopCategory ? deps.getCategoryLabel(activeTopCategory) : "Subcategories"
        })
      );
      subScreen.appendChild(subScreenHeader);

      const subcategoryList = createElement("div", {
        className: `mobile-subcategory-list${subcategories.length >= 6 ? " mobile-subcategory-list-many" : ""}`
      });
      if (activeTopCategory) {
        subcategoryList.appendChild(createMobileCategoryRow({
          label: `View all ${deps.getCategoryLabel(activeTopCategory)}`,
          value: activeTopCategory,
          isActive: selectedCategory === activeTopCategory,
          isSubcategory: true,
          parentValue: activeTopCategory,
          isViewAll: true
        }));
      }
      subcategories.forEach((subcategory) => {
        subcategoryList.appendChild(createMobileCategoryRow({
          label: subcategory.label,
          value: subcategory.value,
          isActive: selectedCategory === subcategory.value,
          isSubcategory: true,
          parentValue: activeTopCategory
        }));
      });
      subScreen.appendChild(subcategoryList);
      track.appendChild(subScreen);

      viewport.appendChild(track);
      layout.appendChild(viewport);
      return layout;
    }

    function bindCategoryScope(scope) {
      scope.querySelectorAll("[data-close-mobile-categories]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.closeMobileCategoryMenu();
        });
      });

      scope.querySelectorAll("[data-mobile-category-back]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.onMobileCategoryBack?.();
        });
      });

      scope.querySelectorAll("[data-cat]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isMobileScope = scope === deps.getMobileCategoryMenu();
          if (!isMobileScope) {
            deps.onDesktopCategoryClick?.({
              nextCategory: button.dataset.cat,
              isSamePinnedCategory: deps.getPinnedDesktopCategory?.() === button.dataset.cat
            });
            return;
          }

          const topCategory = button.dataset.cat || "";
          const subcategoryCount = deps.getSubcategoriesForTopCategory(topCategory).length;
          if (topCategory !== "all" && subcategoryCount > 0) {
            deps.onMobileCategoryDrill?.(topCategory);
            return;
          }

          deps.onCategorySelect({
            nextCategory: topCategory,
            isMobileScope
          });
        });
      });

      scope.querySelectorAll("[data-subcat]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.onSubcategorySelect({
            nextCategory: button.dataset.subcat,
            parentCategory: button.dataset.parentCat || "",
            isMobileScope: scope === deps.getMobileCategoryMenu()
          });
        });
      });
    }

    function renderFilterCategories() {
      const selectedCategory = deps.getSelectedCategory();
      const expandedBrowseCategory = deps.getExpandedBrowseCategory();
      const expandedTopCategory = deps.isTopCategoryValue(expandedBrowseCategory)
        ? expandedBrowseCategory
        : (deps.isTopCategoryValue(selectedCategory) ? selectedCategory : deps.inferTopCategoryValue(selectedCategory));
      const mobileActiveTopCategory = deps.getMobileCategoryTopValue?.() || "";
      const pinnedDesktopCategory = deps.getPinnedDesktopCategory?.() || "";

      const desktopRoot = createElement("div", { className: "category-top-row" });
      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createCategoryButton({
        label: "Zote",
        value: "all",
        isActive: selectedCategory === "all"
      }));
      desktopRoot.appendChild(allItem);
      deps.getAvailableTopCategories().forEach((category) => {
        desktopRoot.appendChild(createDesktopCategoryItem(category, expandedTopCategory, selectedCategory, pinnedDesktopCategory));
      });
      deps.getCategoriesTarget().replaceChildren(desktopRoot);
      ensureResizeSync();
      window.requestAnimationFrame(syncDesktopCategoryLayoutMode);

      const mobileMenu = deps.getMobileCategoryMenu();
      if (mobileMenu) {
        mobileMenu.replaceChildren(createMobileCategoryLayout(mobileActiveTopCategory, selectedCategory));
      }

      [deps.getCategoriesTarget(), mobileMenu].filter(Boolean).forEach((scope) => {
        bindCategoryScope(scope);
      });
    }

    return {
      renderFilterCategories
    };
  }

  window.WingaModules.categories.createCategoriesUiModule = createCategoriesUiModule;
})();


// src/navigation/controller.js
(() => {
  function createNavigationControllerModule(deps) {
    function bindHeaderEntryActions() {
      deps.getHeaderLoginButton?.()?.addEventListener("click", () => {
        deps.clearPendingGuestIntent();
        deps.openAuthModal("login", { role: "buyer" });
      });

      deps.getHeaderSignupButton?.()?.addEventListener("click", () => {
        deps.clearPendingGuestIntent();
        deps.openAuthModal("signup", { role: "buyer" });
      });

      deps.getHeaderUserTrigger?.()?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deps.renderHeaderUserMenu();
        deps.toggleHeaderUserMenu();
      });

      deps.getHeaderUserDropdown?.()?.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-header-menu-action]");
        if (!actionButton) {
          return;
        }

        event.preventDefault();
        const action = actionButton.dataset.headerMenuAction;
        deps.reportEvent?.("info", "header_menu_action", "Header menu action selected.", {
          action,
          role: deps.getCurrentSession()?.role || ""
        });

        if (action === "profile") {
          deps.openProfileSection("");
          return;
        }
        if (action === "orders") {
          deps.openProfileSection("profile-orders-panel");
          return;
        }
        if (action === "messages") {
          deps.openProfileSection("profile-messages-panel");
          return;
        }
        if (action === "notifications") {
          deps.openProfileSection("profile-notifications-panel");
          return;
        }
        if (action === "install") {
          deps.toggleHeaderUserMenu(false);
          deps.promptAppInstall?.("header-menu");
          return;
        }
        if (action === "admin" && deps.isStaffUser()) {
          deps.toggleHeaderUserMenu(false);
          deps.setCurrentViewState("admin", { syncHistory: "push" });
          deps.renderCurrentView();
          return;
        }
        if (action === "logout") {
          deps.toggleHeaderUserMenu(false);
          deps.logout();
        }
      });

      deps.getPublicHeaderActions?.()?.addEventListener("click", async (event) => {
        const installButton = event.target.closest("#header-install-button");
        if (!installButton) {
          return;
        }
        event.preventDefault();
        await deps.promptAppInstall?.("public-header");
      });
    }

    function bindPublicEntryActions() {
      deps.getAuthGateLoginButton?.()?.addEventListener("click", () => {
        deps.openAuthModal("login", {
          gated: true,
          role: "buyer",
          title: deps.getAuthGateTitle(),
          message: deps.getAuthGateMessage()
        });
      });

      deps.getAuthGateSignupButton?.()?.addEventListener("click", () => {
        deps.openAuthModal("signup", {
          gated: true,
          role: "buyer",
          title: deps.getAuthGateTitle(),
          message: deps.getAuthGateMessage()
        });
      });

      deps.getHeaderInstallButton?.()?.addEventListener("click", async (event) => {
        event.preventDefault();
        await deps.promptAppInstall?.("header-button");
      });

      deps.getAuthInstallButton?.()?.addEventListener("click", async (event) => {
        event.preventDefault();
        await deps.promptAppInstall?.("auth-button");
      });

      deps.getAuthCloseButton?.()?.addEventListener("click", () => {
        deps.closeAuthModal();
      });

      deps.getAuthContainer?.()?.addEventListener("click", (event) => {
        if (event.target.closest("#auth-install-button")) {
          event.preventDefault();
          deps.promptAppInstall?.("auth-container");
          return;
        }
        if (event.target === deps.getAuthContainer?.()) {
          deps.closeAuthModal();
        }
      });

      Array.from(deps.getPublicAuthButtons?.() || []).forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          deps.clearPendingGuestIntent();
          deps.openAuthModal(button.dataset.publicAuth === "signup" ? "signup" : "login", { role: "buyer" });
        });
      });

      Array.from(deps.getPublicLinkButtons?.() || []).forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          deps.setCurrentViewState("home", { syncHistory: "push" });
          deps.renderCurrentView();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    }

    function bindPrimaryNav() {
      Array.from(deps.getNavItems?.() || []).forEach((item) => {
        item.addEventListener("click", () => {
          const targetView = item.dataset.view;
          if (!deps.canAccessView(targetView)) {
            alert(deps.getAccessDeniedMessage(targetView));
            deps.setCurrentViewState("home", { syncHistory: "push" });
            deps.renderCurrentView();
            return;
          }

          deps.setCurrentViewState(targetView, { syncHistory: "push" });
          deps.closeMobileSearch();
          deps.renderCurrentView();
        });
      });
    }

    function bindMarketplaceCardActions() {
      if (typeof document === "undefined" || document.body?.dataset.marketplaceActionsBound === "true") {
        return;
      }
      document.body.dataset.marketplaceActionsBound = "true";
      let activeActionTouchCard = null;
      let activeActionTouchClearTimer = 0;

      function clearActiveActionTouchTimer() {
        if (activeActionTouchClearTimer) {
          window.clearTimeout(activeActionTouchClearTimer);
          activeActionTouchClearTimer = 0;
        }
      }

      function clearActiveActionTouchState() {
        clearActiveActionTouchTimer();
        if (!activeActionTouchCard) {
          return;
        }
        activeActionTouchCard.classList.remove("is-action-touching");
        activeActionTouchCard = null;
      }

      function scheduleActiveActionTouchStateClear() {
        clearActiveActionTouchTimer();
        activeActionTouchClearTimer = window.setTimeout(() => {
          activeActionTouchClearTimer = 0;
          if (!activeActionTouchCard) {
            return;
          }
          activeActionTouchCard.classList.remove("is-action-touching");
          activeActionTouchCard = null;
        }, 180);
      }

      function markActionTouchState(target) {
        clearActiveActionTouchState();
        const card = target.closest(".showcase-card, .seller-product-card");
        if (!card) {
          return;
        }
        activeActionTouchCard = card;
        activeActionTouchCard.classList.add("is-action-touching");
      }

      document.addEventListener("pointerdown", (event) => {
        if (event.pointerType && event.pointerType !== "touch") {
          return;
        }
        const actionButton = event.target.closest(
          "[data-buy-product], [data-request-product], [data-open-own-messages], [data-chat-product], [data-detail-repost], [data-open-product-whatsapp]"
        );
        if (!actionButton) {
          return;
        }
        markActionTouchState(actionButton);
      }, true);

      document.addEventListener("pointerup", scheduleActiveActionTouchStateClear, true);
      document.addEventListener("pointercancel", scheduleActiveActionTouchStateClear, true);
      document.addEventListener("touchend", scheduleActiveActionTouchStateClear, true);
      document.addEventListener("touchcancel", scheduleActiveActionTouchStateClear, true);
      window.addEventListener("blur", clearActiveActionTouchState);

      document.addEventListener("click", (event) => {
        const buyButton = event.target.closest("[data-buy-product]");
        if (buyButton) {
          scheduleActiveActionTouchStateClear();
          const productId = buyButton.dataset.buyProduct || "";
          if (!productId) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const product = deps.getProductById?.(productId);
          if (!product) {
            return;
          }
          deps.beginPurchaseFlow?.(product);
          return;
        }

        const requestButton = event.target.closest("[data-request-product]");
        if (requestButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.toggleProductInRequestBoxById(requestButton.dataset.requestProduct);
          return;
        }

        const ownMessagesButton = event.target.closest("[data-open-own-messages]");
        if (ownMessagesButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.openOwnProductMessages(ownMessagesButton.dataset.openOwnMessages);
          return;
        }

        const chatButton = event.target.closest("[data-chat-product]");
        if (chatButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.openProductChatFromCard(chatButton.dataset.chatProduct);
          return;
        }

        const whatsappButton = event.target.closest("[data-open-product-whatsapp]");
        if (whatsappButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.openProductWhatsappFromCard?.(whatsappButton.dataset.openProductWhatsapp);
          return;
        }

        const repostButton = event.target.closest("[data-detail-repost]");
        if (repostButton && !event.target.closest("#product-detail-modal")) {
          scheduleActiveActionTouchStateClear();
          const productId = repostButton.dataset.detailRepost || "";
          if (!productId) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const product = deps.getProductById?.(productId);
          if (!product) {
            return;
          }
          deps.repostProductAsSeller?.(product);
          return;
        }

        const sellerCardOpenTrigger = event.target.closest(".seller-product-card[data-open-product], .seller-product-card [data-open-product]");
        if (sellerCardOpenTrigger) {
          scheduleActiveActionTouchStateClear();
          const productId = sellerCardOpenTrigger.dataset.openProduct
            || sellerCardOpenTrigger.closest(".seller-product-card")?.dataset?.openProduct
            || "";
          if (!productId) {
            return;
          }
          event.preventDefault();
          event.__wingaProductOpenHandled = true;
          if (!deps.isAuthenticatedUser?.()) {
            deps.promptGuestAuth?.({
              preferredMode: "signup",
              role: "buyer",
              title: "You need an account to continue",
              message: "Sign up or log in to open product details and other marketplace actions.",
              intent: { type: "focus-product", productId }
            });
            return;
          }
          deps.openProductDetailModal?.(productId);
          return;
        }

        // Product card opening is owned by the card renderers themselves.
        // Keep this global delegate focused on request/chat actions only.
      }, true);
    }

    return {
      bindHeaderEntryActions,
      bindPublicEntryActions,
      bindPrimaryNav,
      bindMarketplaceCardActions
    };
  }

  window.WingaModules.navigation.createNavigationControllerModule = createNavigationControllerModule;
})();


// src/navigation/chrome.js
(() => {
  function createNavigationChromeModule(deps) {
    function getViewportWidth() {
      const candidates = [
        window.visualViewport?.width,
        document.documentElement?.clientWidth,
        window.innerWidth
      ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (!candidates.length) {
        return 0;
      }
      return Math.round(Math.min(...candidates));
    }

    function shouldShowBottomNav() {
      if (!deps.isAuthenticatedUser()) {
        return false;
      }
      if (deps.canUseSellerFeatures() && !deps.isStaffUser()) {
        return false;
      }
      if (deps.isBuyerUser() && !deps.canUseSellerFeatures()) {
        return false;
      }
      if (!deps.isStaffUser() && deps.getCurrentView() === "home") {
        return false;
      }
      return true;
    }

    function shouldShowPostProductFab() {
      if (!deps.isAuthenticatedUser() || deps.isStaffUser() || !deps.canUseSellerFeatures()) {
        return false;
      }
      if (deps.getCurrentView() !== "home" || deps.getEditingProductId()) {
        return false;
      }
      return !document.body.classList.contains("product-detail-open");
    }

    function shouldShowViewHomeBack() {
      if (!deps.isAuthenticatedUser()) {
        return false;
      }
      if (document.body.classList.contains("product-detail-open")) {
        return false;
      }
      const currentView = deps.getCurrentView();
      return currentView === "profile" || currentView === "upload" || currentView === "admin";
    }

    function isMobileHeaderAutoHideEnabled() {
      const searchState = deps.getSearchRuntimeState();
      const profileState = deps.getProfileRuntimeState();
      const chatState = deps.getChatUiState();
      return getViewportWidth() <= 720
        && deps.getAppContainer()?.style.display !== "none"
        && deps.getCurrentView() === "home"
        && !document.body.classList.contains("auth-modal-open")
        && !document.body.classList.contains("product-detail-open")
        && !searchState.isMobileSearchOpen
        && !searchState.isMobileCategoryOpen
        && !profileState.isHeaderUserMenuOpen
        && !chatState.isContextOpen;
    }

    function setMobileHeaderHidden(hidden, options = {}) {
      const uiState = deps.getUiRuntimeState();
      const nextHidden = Boolean(hidden) && isMobileHeaderAutoHideEnabled();
      if (uiState.mobileHeaderHidden === nextHidden && !options.force) {
        return;
      }

      uiState.mobileHeaderHidden = nextHidden;
      document.body.classList.toggle("mobile-header-hidden", nextHidden);
      deps.getTopBar()?.setAttribute("data-mobile-header-state", nextHidden ? "hidden" : "visible");
    }

    function syncMobileHeaderVisibility(force = false) {
      const uiState = deps.getUiRuntimeState();
      if (!isMobileHeaderAutoHideEnabled()) {
        setMobileHeaderHidden(false, { force });
        uiState.mobileHeaderLastScrollY = Math.max(window.scrollY || 0, 0);
        uiState.mobileHeaderLastToggleY = uiState.mobileHeaderLastScrollY;
        uiState.mobileHeaderPendingDirection = 0;
        uiState.mobileHeaderObservedScrollY = uiState.mobileHeaderLastScrollY;
        return;
      }

      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const previousScrollY = uiState.mobileHeaderLastScrollY || 0;
      const delta = currentScrollY - previousScrollY;
      const pendingDirection = Number(uiState.mobileHeaderPendingDirection || 0);
      const nearTopThreshold = 72;
      const hideThreshold = 64;
      const movementThreshold = 8;

      uiState.mobileHeaderLastScrollY = currentScrollY;
      uiState.mobileHeaderPendingDirection = 0;

      if (currentScrollY <= nearTopThreshold) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        setMobileHeaderHidden(false, { force });
        return;
      }

      if (uiState.mobileHeaderHidden && (pendingDirection < 0 || delta < 0)) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        setMobileHeaderHidden(false);
        return;
      }

      if (Math.abs(delta) < movementThreshold && !force) {
        return;
      }

      if ((pendingDirection > 0 || delta > 0) && !uiState.mobileHeaderHidden) {
        if (currentScrollY - (uiState.mobileHeaderLastToggleY || 0) >= hideThreshold) {
          uiState.mobileHeaderLastToggleY = currentScrollY;
          setMobileHeaderHidden(true);
        }
      }
    }

    function scheduleMobileHeaderScrollSync() {
      const uiState = deps.getUiRuntimeState();
      if (getViewportWidth() > 720) {
        if (uiState.mobileHeaderScrollFrame) {
          cancelAnimationFrame(uiState.mobileHeaderScrollFrame);
          uiState.mobileHeaderScrollFrame = 0;
        }
        return;
      }
      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const previousObservedScrollY = Number.isFinite(uiState.mobileHeaderObservedScrollY)
        ? uiState.mobileHeaderObservedScrollY
        : currentScrollY;
      if (currentScrollY > previousObservedScrollY + 1) {
        uiState.mobileHeaderPendingDirection = 1;
      } else if (currentScrollY < previousObservedScrollY - 1) {
        uiState.mobileHeaderPendingDirection = -1;
      }
      uiState.mobileHeaderObservedScrollY = currentScrollY;
      if (uiState.mobileHeaderScrollFrame) {
        return;
      }

      uiState.mobileHeaderScrollFrame = requestAnimationFrame(() => {
        uiState.mobileHeaderScrollFrame = 0;
        syncMobileHeaderVisibility();
      });
    }

    function updateMarketplaceActionChrome() {
      const bottomNav = deps.getBottomNav();
      const postProductFab = deps.getPostProductFab();
      const viewHomeBackButton = deps.getViewHomeBackButton();

      if (bottomNav) {
        bottomNav.style.display = shouldShowBottomNav() ? "grid" : "none";
      }
      if (postProductFab) {
        postProductFab.style.display = shouldShowPostProductFab() ? "inline-flex" : "none";
      }
      if (viewHomeBackButton) {
        viewHomeBackButton.style.display = shouldShowViewHomeBack() ? "inline-flex" : "none";
        const shouldUseFloatingStyle = deps.canUseSellerFeatures()
          && !deps.isStaffUser()
          && (deps.getCurrentView() === "profile" || deps.getCurrentView() === "upload");
        viewHomeBackButton.classList.toggle("seller-home-fab", shouldUseFloatingStyle);
      }
      syncMobileHeaderVisibility(true);
    }

    function syncAppChromeOffsets() {
      const appContainer = deps.getAppContainer();
      const topBar = deps.getTopBar();
      const bottomNav = deps.getBottomNav();
      const authContainer = deps.getAuthContainer();
      if (!appContainer || !topBar || !bottomNav) {
        return;
      }

      if (authContainer?.style.display !== "none") {
        appContainer.style.paddingTop = "";
        appContainer.style.paddingBottom = "";
        return;
      }

      const topBarPosition = window.getComputedStyle(topBar).position;
      const bottomNavPosition = window.getComputedStyle(bottomNav).position;
      const isBottomNavVisible = shouldShowBottomNav() && window.getComputedStyle(bottomNav).display !== "none";
      const topPadding = topBarPosition === "fixed"
        ? Math.ceil(topBar.getBoundingClientRect().height) + 20
        : 16;
      const bottomPadding = isBottomNavVisible && bottomNavPosition === "fixed"
        ? Math.ceil(bottomNav.getBoundingClientRect().height) + 24
        : 16;
      appContainer.style.paddingTop = `${topPadding}px`;
      appContainer.style.paddingBottom = `${bottomPadding}px`;
      appContainer.style.setProperty("--app-top-offset", `${topPadding}px`);
    }

    function scheduleChromeOffsetSync() {
      const uiState = deps.getUiRuntimeState();
      if (uiState.chromeResizeFrame) {
        cancelAnimationFrame(uiState.chromeResizeFrame);
      }

      uiState.chromeResizeFrame = requestAnimationFrame(() => {
        uiState.chromeResizeFrame = 0;
        syncAppChromeOffsets();
      });
    }

    return {
      shouldShowBottomNav,
      shouldShowPostProductFab,
      shouldShowViewHomeBack,
      isMobileHeaderAutoHideEnabled,
      setMobileHeaderHidden,
      syncMobileHeaderVisibility,
      scheduleMobileHeaderScrollSync,
      updateMarketplaceActionChrome,
      syncAppChromeOffsets,
      scheduleChromeOffsetSync
    };
  }

  window.WingaModules.navigation.createNavigationChromeModule = createNavigationChromeModule;
})();


// src/marketplace/discovery.js
(() => {
  function createDiscoveryHelpers(deps) {
    const {
      getProducts,
      inferTopCategoryValue,
      isMarketplaceBrowseCandidate,
      getPromotionSortScore,
      getRecentlyViewedProductIds,
      getProductDiscoveryTrail,
      getActivePromotions,
      getMarketplaceUser,
      getSellerReviewSummary,
      getPromotionCommercialScore,
      getCurrentUser,
      canUseBuyerFeatures,
      getCurrentMessages,
      getCurrentOrders,
      getRecentCategorySelections,
      getRecentSearchTerms,
      getRecentMessagedProductIds,
      getBuyerSellerAffinityEntries,
      getCurrentSession,
      normalizeOptionalPrice
    } = deps;

    const RANKING_CONFIG = {
      default: {
        maxPerSeller: 2,
        sellerSpacingWindow: 4,
        sellerSpacingPenalty: 38,
        sellerRepeatPenalty: 54,
        sellerCapPenalty: 220,
        sponsoredSpacingWindow: 3,
        sponsoredSpacingPenalty: 72,
        maxSponsoredShare: 0.38,
        sponsoredQuotaPenalty: 180,
        earlySponsoredWindow: 4,
        earlySponsoredBoost: 22
      },
      home: {
        sellerSpacingPenalty: 46,
        sellerRepeatPenalty: 60,
        maxSponsoredShare: 0.34,
        earlySponsoredBoost: 28
      },
      behavior_showcase: {
        maxPerSeller: 1,
        sellerSpacingWindow: 5,
        sellerSpacingPenalty: 58,
        sellerRepeatPenalty: 76,
        maxSponsoredShare: 0.4,
        earlySponsoredBoost: 24
      },
      related: {
        maxPerSeller: 2,
        sellerSpacingWindow: 5,
        sellerSpacingPenalty: 48,
        maxSponsoredShare: 0.28
      },
      you_may_like: {
        maxPerSeller: 2,
        sellerSpacingWindow: 4,
        sellerSpacingPenalty: 42
      },
      trending: {
        maxPerSeller: 2,
        sellerSpacingWindow: 4,
        sellerSpacingPenalty: 42,
        maxSponsoredShare: 0.3
      },
      sponsored: {
        maxPerSeller: 1,
        sellerSpacingWindow: 6,
        sellerSpacingPenalty: 64,
        sellerRepeatPenalty: 90,
        maxSponsoredShare: 1,
        earlySponsoredBoost: 42
      }
    };

    function getSurfaceConfig(surface) {
      return {
        ...RANKING_CONFIG.default,
        ...(RANKING_CONFIG[surface] || {})
      };
    }

    function toFiniteNumber(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeLookupValue(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    function getAgeDays(timestamp) {
      const time = new Date(timestamp || 0).getTime();
      if (!Number.isFinite(time) || time <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.max(0, (Date.now() - time) / (24 * 60 * 60 * 1000));
    }

    function getRecencyBoost(timestamp, maxScore = 50, fadeDays = 30) {
      const ageDays = getAgeDays(timestamp);
      if (!Number.isFinite(ageDays)) {
        return 0;
      }
      if (ageDays <= 0) {
        return maxScore;
      }
      return Math.max(0, maxScore * (1 - (ageDays / fadeDays)));
    }

    function addScore(map, key, amount) {
      if (!key || !Number.isFinite(amount) || amount <= 0) {
        return;
      }
      map.set(key, (map.get(key) || 0) + amount);
    }

    function getSearchableProductText(product) {
      return normalizeLookupValue(
        product?._searchText
        || `${product?.name || ""} ${product?.shop || ""} ${product?.uploadedBy || ""} ${product?.category || ""}`
      );
    }

    function getSearchIntentBoost(product, searchTerms = []) {
      const searchableText = getSearchableProductText(product);
      if (!searchableText) {
        return 0;
      }

      let boost = 0;
      const uniqueTerms = Array.from(new Set((Array.isArray(searchTerms) ? searchTerms : []).map(normalizeLookupValue).filter(Boolean)));
      uniqueTerms.forEach((term) => {
        if (!term) {
          return;
        }
        if (searchableText.includes(term)) {
          boost += term.includes(" ") ? 52 : 28;
        } else {
          const termTokens = term.split(/\s+/).filter(Boolean);
          const matchedTokens = termTokens.filter((token) => searchableText.includes(token));
          if (matchedTokens.length > 0) {
            boost += Math.min(24, matchedTokens.length * 8);
          }
        }
      });
      return boost;
    }

    function getSellerTrustScore(product) {
      const seller = typeof getMarketplaceUser === "function"
        ? getMarketplaceUser(product?.uploadedBy)
        : null;
      const sellerSummary = typeof getSellerReviewSummary === "function"
        ? getSellerReviewSummary(product?.uploadedBy)
        : null;
      let score = 0;
      if (seller?.verifiedSeller) score += 25;
      if (seller?.status === "active") score += 10;
      if (seller?.status === "flagged") score -= 60;
      if (sellerSummary?.totalReviews) {
        score += toFiniteNumber(sellerSummary.averageRating, 0) * 8;
        score += Math.min(20, toFiniteNumber(sellerSummary.totalReviews, 0) * 2);
      }
      return score;
    }

    function getProductById(productId, productMap) {
      return productMap.get(String(productId || "")) || null;
    }

    function matchesCategoryContext(product, categories = []) {
      const productCategory = String(product?.category || "");
      const productTopCategory = inferTopCategoryValue(productCategory);
      return (Array.isArray(categories) ? categories : []).some((category) => {
        const safeCategory = String(category || "");
        return safeCategory
          && (
            safeCategory === productCategory
            || safeCategory === productTopCategory
            || inferTopCategoryValue(safeCategory) === productTopCategory
          );
      });
    }

    function buildBuyerHistorySnapshot(productMap) {
      const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : "";
      const buyerCapable = typeof canUseBuyerFeatures === "function" ? canUseBuyerFeatures() : false;
      const sellerScores = new Map();
      const productScores = new Map();
      const categoryScores = new Map();
      const topCategoryScores = new Map();
      const recentCategorySelections = typeof getRecentCategorySelections === "function" ? getRecentCategorySelections() : [];
      const recentSearchTerms = typeof getRecentSearchTerms === "function" ? getRecentSearchTerms() : [];
      const recentMessagedProductIds = typeof getRecentMessagedProductIds === "function" ? getRecentMessagedProductIds() : [];
      const buyerSellerAffinityEntries = typeof getBuyerSellerAffinityEntries === "function" ? getBuyerSellerAffinityEntries() : [];
      let hasMeaningfulHistory = false;

      if (currentUser && buyerCapable) {
        const purchases = Array.isArray(getCurrentOrders?.()?.purchases) ? getCurrentOrders().purchases : [];
        purchases.forEach((order) => {
          const sellerId = String(order?.sellerUsername || "");
          const productId = String(order?.productId || "");
          const statusBoost = order?.status === "delivered"
            ? 320
            : order?.status === "confirmed"
              ? 285
              : order?.status === "paid"
                ? 250
                : 220;
          const recencyBoost = getRecencyBoost(order?.createdAt, 110, 180);
          addScore(sellerScores, sellerId, statusBoost + recencyBoost);
          addScore(productScores, productId, 135 + getRecencyBoost(order?.createdAt, 70, 180));
          const product = getProductById(productId, productMap);
          if (product?.category) {
            addScore(categoryScores, product.category, 60 + (recencyBoost * 0.25));
            addScore(topCategoryScores, inferTopCategoryValue(product.category), 34 + (recencyBoost * 0.18));
          }
          hasMeaningfulHistory = true;
        });

        const conversationKeys = new Set();
        const messages = Array.isArray(getCurrentMessages?.()) ? getCurrentMessages() : [];
        messages.forEach((message) => {
          const senderId = String(message?.senderId || "");
          const receiverId = String(message?.receiverId || "");
          if (senderId !== currentUser && receiverId !== currentUser) {
            return;
          }

          const partnerId = senderId === currentUser ? receiverId : senderId;
          const recencyBoost = getRecencyBoost(message?.timestamp, 70, 45);
          const conversationKey = `${partnerId}::${message?.productId || ""}`;
          if (!conversationKeys.has(conversationKey)) {
            addScore(sellerScores, partnerId, 34 + recencyBoost);
            conversationKeys.add(conversationKey);
          }

          let interactionScore = 12 + recencyBoost;
          if (message?.messageType === "product_reference") interactionScore += 42;
          if (message?.messageType === "product_inquiry") interactionScore += 58;
          if (Array.isArray(message?.productItems) && message.productItems.length) {
            interactionScore += Math.min(84, message.productItems.length * 22);
          }
          addScore(sellerScores, partnerId, interactionScore);

          const directProduct = getProductById(message?.productId, productMap);
          if (directProduct?.id) {
            addScore(productScores, directProduct.id, 42 + (recencyBoost * 0.55));
            addScore(categoryScores, directProduct.category, 22 + (recencyBoost * 0.2));
            addScore(topCategoryScores, inferTopCategoryValue(directProduct.category), 12 + (recencyBoost * 0.12));
          }

          (Array.isArray(message?.productItems) ? message.productItems : []).forEach((item) => {
            const itemProduct = getProductById(item?.productId, productMap);
            addScore(productScores, item?.productId, 26 + (recencyBoost * 0.35));
            addScore(sellerScores, item?.sellerId || itemProduct?.uploadedBy, 20 + (recencyBoost * 0.25));
            if (itemProduct?.category || item?.category) {
              const category = itemProduct?.category || item?.category || "";
              addScore(categoryScores, category, 16 + (recencyBoost * 0.14));
              addScore(topCategoryScores, inferTopCategoryValue(category), 10 + (recencyBoost * 0.1));
            }
          });
          hasMeaningfulHistory = true;
        });
      }

      (Array.isArray(getRecentlyViewedProductIds?.()) ? getRecentlyViewedProductIds() : []).forEach((productId, index) => {
        const product = getProductById(productId, productMap);
        if (!product) {
          return;
        }
        const freshness = Math.max(0.35, 1 - (index * 0.08));
        addScore(sellerScores, product.uploadedBy, 28 * freshness);
        addScore(productScores, product.id, 20 * freshness);
        addScore(categoryScores, product.category, 14 * freshness);
        addScore(topCategoryScores, inferTopCategoryValue(product.category), 9 * freshness);
      });

      recentMessagedProductIds.forEach((productId, index) => {
        const product = getProductById(productId, productMap);
        if (!product) {
          return;
        }
        const freshness = Math.max(0.45, 1 - (index * 0.09));
        addScore(sellerScores, product.uploadedBy, 74 * freshness);
        addScore(productScores, product.id, 48 * freshness);
        addScore(categoryScores, product.category, 20 * freshness);
        addScore(topCategoryScores, inferTopCategoryValue(product.category), 12 * freshness);
      });

      buyerSellerAffinityEntries.forEach((entry) => {
        const sellerId = String(entry?.sellerId || "");
        if (!sellerId) {
          return;
        }
        const affinityScore = Math.max(0, Number(entry?.score || 0));
        if (!affinityScore) {
          return;
        }
        addScore(sellerScores, sellerId, affinityScore + getRecencyBoost(entry?.updatedAt, 56, 35));
        hasMeaningfulHistory = true;
      });

      recentCategorySelections.forEach((category, index) => {
        const freshness = Math.max(0.5, 1 - (index * 0.12));
        addScore(categoryScores, category, 42 * freshness);
        addScore(topCategoryScores, inferTopCategoryValue(category), 24 * freshness);
      });

      const preferredCategories = Array.from(
        new Set([
          ...(recentCategorySelections || []),
          ...Array.from(categoryScores.entries()).sort((first, second) => second[1] - first[1]).map(([category]) => category),
          ...Array.from(topCategoryScores.entries()).sort((first, second) => second[1] - first[1]).map(([category]) => category),
          ...(getCurrentSession?.()?.primaryCategory ? [getCurrentSession().primaryCategory] : [])
        ].filter(Boolean))
      ).slice(0, 6);

      return {
        sellerScores,
        productScores,
        categoryScores,
        topCategoryScores,
        preferredCategories,
        searchTerms: Array.from(new Set((recentSearchTerms || []).map(normalizeLookupValue).filter(Boolean))).slice(0, 4),
        hasMeaningfulHistory
      };
    }

    function getRelationshipScore(product, history) {
      if (!history) {
        return 0;
      }
      return (history.sellerScores.get(product?.uploadedBy || "") || 0)
        + (history.productScores.get(product?.id || "") || 0)
        + (history.categoryScores.get(product?.category || "") || 0)
        + (history.topCategoryScores.get(inferTopCategoryValue(product?.category || "")) || 0);
    }

    function getOrganicScore(product, context, history) {
      const preferredCategories = Array.isArray(context.preferredCategories) ? context.preferredCategories : [];
      const effectiveCategories = Array.from(new Set([...(history?.preferredCategories || []), ...preferredCategories]));
      const searchTerms = Array.from(new Set([...(history?.searchTerms || []), ...((context.searchTerms || []).map(normalizeLookupValue))]));
      const selectedCategory = String(context.selectedCategory || "");
      const seedProduct = context.seedProduct || null;
      const seedTopCategory = inferTopCategoryValue(seedProduct?.category || context.seedCategory || "");
      const productPrice = normalizeOptionalPrice(product.price);
      const seedPrice = normalizeOptionalPrice(seedProduct?.price);

      let score = (toFiniteNumber(product.likes, 0) * 3.5)
        + toFiniteNumber(product.views, 0)
        + getSellerTrustScore(product)
        + getRecencyBoost(product.createdAt, 54, 40);

      if (selectedCategory && selectedCategory !== "all" && matchesCategoryContext(product, [selectedCategory])) {
        score += 60;
      }

      if (matchesCategoryContext(product, effectiveCategories)) {
        score += 68;
      }

      if (seedProduct) {
        if (product.category === seedProduct.category) {
          score += 130;
        } else if (seedTopCategory && inferTopCategoryValue(product.category) === seedTopCategory) {
          score += 76;
        }
        if (seedProduct.uploadedBy && product.uploadedBy !== seedProduct.uploadedBy) {
          score += 14;
        }
        if (seedPrice !== null && productPrice !== null) {
          score += Math.max(0, 42 - (Math.abs(productPrice - seedPrice) / 1700));
        }
      }

      score += getSearchIntentBoost(product, searchTerms);

      if (context.surface === "trending") {
        score += (toFiniteNumber(product.likes, 0) * 2.5) + (toFiniteNumber(product.views, 0) * 1.4);
      }

      return score;
    }

    function buildRankedEntries(candidates, context = {}) {
      const productMap = new Map(getProducts().map((product) => [String(product.id || ""), product]));
      const history = buildBuyerHistorySnapshot(productMap);
      const preferredCategories = Array.from(new Set([
        ...(context.preferredCategories || []),
        ...(history.preferredCategories || [])
      ].filter(Boolean)));

      return candidates.map((product) => {
        const sponsoredScore = typeof getPromotionCommercialScore === "function"
          ? getPromotionCommercialScore(product, { preferredCategories })
          : (getPromotionSortScore(product) * 100);
        const relationshipScore = getRelationshipScore(product, history);
        const organicScore = getOrganicScore(product, {
          ...context,
          preferredCategories
        }, history);
        const priorityBoost = sponsoredScore > 0
          ? 2600 + Math.min(900, sponsoredScore * 0.45)
          : relationshipScore >= 110
            ? 420
            : relationshipScore >= 70
              ? 180
              : 0;
        return {
          product,
          sellerId: product?.uploadedBy || "",
          sponsoredScore,
          relationshipScore,
          organicScore,
          totalScore: sponsoredScore + relationshipScore + organicScore + priorityBoost,
          priorityBoost,
          isSponsored: sponsoredScore > 0
        };
      }).sort((first, second) => {
        if (second.totalScore !== first.totalScore) {
          return second.totalScore - first.totalScore;
        }
        if (second.sponsoredScore !== first.sponsoredScore) {
          return second.sponsoredScore - first.sponsoredScore;
        }
        if (second.relationshipScore !== first.relationshipScore) {
          return second.relationshipScore - first.relationshipScore;
        }
        return second.organicScore - first.organicScore;
      });
    }

    function getRecentSellerDistance(selectedEntries, sellerId, windowSize) {
      const recentWindow = selectedEntries.slice(-windowSize);
      for (let index = recentWindow.length - 1; index >= 0; index -= 1) {
        if (recentWindow[index]?.sellerId === sellerId) {
          return recentWindow.length - 1 - index;
        }
      }
      return -1;
    }

    function hasRecentSponsored(selectedEntries, windowSize) {
      return selectedEntries.slice(-windowSize).some((entry) => entry?.isSponsored);
    }

    function sequenceRankedEntries(entries, limit, config) {
      const selectedEntries = [];
      const remainingEntries = [...entries];
      const sellerCounts = new Map();
      const maxSponsoredSlots = Math.max(1, Math.ceil(limit * config.maxSponsoredShare));
      let sponsoredCount = 0;

      while (remainingEntries.length && selectedEntries.length < limit) {
        let bestIndex = -1;
        let bestScore = Number.NEGATIVE_INFINITY;

        remainingEntries.forEach((entry, index) => {
          const sellerCount = sellerCounts.get(entry.sellerId) || 0;
          let score = entry.totalScore;

          if (sellerCount >= config.maxPerSeller) {
            score -= config.sellerCapPenalty;
          }

          const recentSellerDistance = getRecentSellerDistance(selectedEntries, entry.sellerId, config.sellerSpacingWindow);
          if (recentSellerDistance >= 0) {
            score -= (config.sellerSpacingWindow - recentSellerDistance) * config.sellerSpacingPenalty;
          }

          score -= sellerCount * config.sellerRepeatPenalty;

          if (entry.isSponsored) {
            if (sponsoredCount >= maxSponsoredSlots) {
              score -= config.sponsoredQuotaPenalty;
            }
            if (hasRecentSponsored(selectedEntries, config.sponsoredSpacingWindow)) {
              score -= config.sponsoredSpacingPenalty;
            }
            if (selectedEntries.length < config.earlySponsoredWindow) {
              score += config.earlySponsoredBoost;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });

        if (bestIndex === -1) {
          break;
        }

        const [selected] = remainingEntries.splice(bestIndex, 1);
        selectedEntries.push(selected);
        sellerCounts.set(selected.sellerId, (sellerCounts.get(selected.sellerId) || 0) + 1);
        if (selected.isSponsored) {
          sponsoredCount += 1;
        }
      }

      return selectedEntries.map((entry) => entry.product);
    }

    function rankProductsForSurface(sourceProducts, options = {}) {
      const {
        surface = "default",
        limit = Array.isArray(sourceProducts) ? sourceProducts.length : 0,
        excludeIds = new Set()
      } = options;
      const candidates = (Array.isArray(sourceProducts) ? sourceProducts : [])
        .filter((product) => product?.status === "approved" && product?.availability !== "sold_out")
        .filter((product) => !excludeIds.has(product.id));

      if (!candidates.length || limit <= 0) {
        return [];
      }

      const rankedEntries = buildRankedEntries(candidates, options);
      return sequenceRankedEntries(rankedEntries, limit, getSurfaceConfig(surface));
    }

    function getRelatedProducts(seedProduct, limit = 6) {
      if (!seedProduct) {
        return [];
      }

      const pool = getProducts().filter((product) =>
        product.id !== seedProduct.id
        && product.status === "approved"
        && product.availability !== "sold_out"
        && product.category === seedProduct.category
      );

      return rankProductsForSurface(pool, {
        surface: "related",
        limit,
        seedProduct
      });
    }

    function getDiscoveryRelatedProducts(seedProduct, options = {}) {
      const { limit = 6, excludeIds = new Set() } = options;
      if (!seedProduct) {
        return [];
      }

      const productDiscoveryTrail = new Set(getProductDiscoveryTrail());
      const pool = getProducts().filter((product) =>
        product.id !== seedProduct.id
        && product.status === "approved"
        && product.availability !== "sold_out"
        && isMarketplaceBrowseCandidate(product)
        && !excludeIds.has(product.id)
        && !productDiscoveryTrail.has(product.id)
        && (
          product.category === seedProduct.category
          || inferTopCategoryValue(product.category) === inferTopCategoryValue(seedProduct.category)
        )
      );

      const ranked = rankProductsForSurface(pool, {
        surface: "related",
        limit,
        excludeIds,
        seedProduct
      });

      if (ranked.length >= limit) {
        return ranked;
      }

      const fallbackIds = new Set([seedProduct.id, ...excludeIds, ...ranked.map((product) => product.id)]);
      const fallbackPool = getProducts().filter((product) =>
        !fallbackIds.has(product.id)
        && product.status === "approved"
        && product.availability !== "sold_out"
        && isMarketplaceBrowseCandidate(product)
      );

      return [
        ...ranked,
        ...rankProductsForSurface(fallbackPool, {
          surface: "you_may_like",
          limit: Math.max(0, limit - ranked.length),
          excludeIds: fallbackIds,
          seedProduct
        })
      ].slice(0, limit);
    }

    function getDiscoverySponsoredProducts(seedProduct, options = {}) {
      const { limit = 4, excludeIds = new Set() } = options;
      const activePromotionIds = new Set(getActivePromotions().map((promotion) => promotion.productId));
      if (!activePromotionIds.size) {
        return [];
      }

      const pool = getProducts().filter((product) =>
        activePromotionIds.has(product.id)
        && product.status === "approved"
        && product.availability !== "sold_out"
        && isMarketplaceBrowseCandidate(product)
        && !excludeIds.has(product.id)
      );

      return rankProductsForSurface(pool, {
        surface: "sponsored",
        limit,
        excludeIds,
        seedProduct,
        preferredCategories: seedProduct?.category ? [seedProduct.category, inferTopCategoryValue(seedProduct.category)] : []
      });
    }

    return {
      getRelatedProducts,
      getDiscoveryRelatedProducts,
      getDiscoverySponsoredProducts,
      rankProductsForSurface
    };
  }

  window.WingaModules.marketplace.createDiscoveryHelpers = createDiscoveryHelpers;
})();


// src/marketplace/ui.js
(() => {
  function createMarketplaceUiModule(deps) {
    const {
      createElement,
      createFragmentFromMarkup,
      createResponsiveImage,
      createStatusPill
    } = deps;

    function createElementFromMarkup(markup) {
      return deps.createElementFromMarkup(markup);
    }

    function schedulePassiveTask(callback) {
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => callback(), { timeout: 1200 });
        return;
      }
      window.setTimeout(callback, 180);
    }

    const passiveViewedProductQueue = new Set();
    let passiveViewedProductTrackingScheduled = false;
    const PASSIVE_VIEW_TRACK_BATCH_SIZE = 1;
    const PASSIVE_VIEW_TRACK_IDLE_DELAY_MS = 700;

    function schedulePassiveViewedProductTracking(productIds = []) {
      Array.from(new Set(Array.isArray(productIds) ? productIds : []))
        .filter(Boolean)
        .forEach((productId) => passiveViewedProductQueue.add(productId));

      if (passiveViewedProductTrackingScheduled || !passiveViewedProductQueue.size) {
        return;
      }

      passiveViewedProductTrackingScheduled = true;
      schedulePassiveTask(() => {
        passiveViewedProductTrackingScheduled = false;
        const batch = Array.from(passiveViewedProductQueue).slice(0, PASSIVE_VIEW_TRACK_BATCH_SIZE);
        batch.forEach((productId) => passiveViewedProductQueue.delete(productId));

        if (!batch.length) {
          return;
        }

        Promise.resolve()
          .then(async () => {
            for (const productId of batch) {
              await deps.trackProductView(productId);
            }
          })
          .catch(() => {
            // Ignore passive tracking failures.
          })
          .finally(() => {
            if (passiveViewedProductQueue.size > 0) {
              window.setTimeout(() => schedulePassiveViewedProductTracking([]), PASSIVE_VIEW_TRACK_IDLE_DELAY_MS);
            }
          });
      });
    }

    function preloadMarketplaceImages(list = []) {
      if (!deps.preloadImageSource || !Array.isArray(list) || !list.length) {
        return;
      }
      const seen = new Set();
      const limit = Math.max(6, (deps.getProductsPerRow?.() || 3) * 2);
      list.slice(0, limit).forEach((product) => {
        const primaryImage = deps.getMarketplacePrimaryImage
          ? deps.getMarketplacePrimaryImage(product, {
              allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
            })
          : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
        const safeSrc = String(primaryImage || "").trim();
        if (!safeSrc || seen.has(safeSrc)) {
          return;
        }
        seen.add(safeSrc);
        deps.preloadImageSource(safeSrc, { fetchPriority: "high" });
      });
    }

    function createProductGalleryElement(product) {
      if (deps.renderFeedGalleryMarkup) {
        return createElementFromMarkup(deps.renderFeedGalleryMarkup(product, "feed"));
      }

      const safeImages = deps.getRenderableMarketplaceImages
        ? deps.getRenderableMarketplaceImages(product)
        : (Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]).filter(Boolean);
      const images = safeImages.length > 0 ? safeImages : [deps.getImageFallbackDataUri("WINGA")];
      const wrapper = createElement("div", {
        className: "product-gallery media-gallery feed-gallery-preview feed-gallery-carousel",
        attributes: {
          "data-feed-gallery-carousel": "true",
          "data-feed-gallery-total": String(images.length),
          "data-feed-gallery-current": "1",
          "data-feed-gallery-surface": "feed"
        }
      });
      const track = createElement("div", { className: "feed-gallery-carousel-track", attributes: { "data-feed-gallery-track": "true" } });
      images.forEach((src, index) => {
        const slide = createElement("div", {
          className: "feed-gallery-carousel-slide",
          attributes: { "data-feed-gallery-slide": String(index) }
        });
        const isFirstSlide = index === 0;
        slide.appendChild(createResponsiveImage({
          src,
          alt: `${product.name || "Product image"} ${index + 1}`,
          className: "feed-gallery-image feed-gallery-image-social",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
          attributes: {
            loading: isFirstSlide ? "eager" : "lazy",
            fetchpriority: isFirstSlide ? "high" : "auto",
            draggable: "false",
            "data-marketplace-scroll-image": "true"
          }
        }));
        track.appendChild(slide);
      });
      wrapper.appendChild(track);
      if (images.length > 1) {
        wrapper.appendChild(createElement("span", {
          className: "feed-gallery-count-badge",
          attributes: { "data-feed-gallery-count": "true" },
          textContent: `1/${images.length}`
        }));
      }
      return wrapper;
    }

    function getProductSellerLabel(product) {
      return String(product?.shop || product?.uploadedBy || "Seller").trim();
    }

    function getSellerAvatarFallback(product) {
      const label = getProductSellerLabel(product);
      const initials = label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase();
      return initials || "S";
    }

    function createSellerRowElement(product) {
      const sellerRow = createElement("div", { className: "product-seller-row" });
      const avatarWrap = createElement("div", { className: "product-seller-avatar" });
      const sellerUser = deps.getMarketplaceUser?.(product?.uploadedBy);
      const sellerImage = String(sellerUser?.profileImage || "").trim();
      if (sellerImage) {
        avatarWrap.appendChild(createResponsiveImage({
          src: sellerImage,
          alt: getProductSellerLabel(product),
          className: "product-seller-avatar-image",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA")
        }));
      } else {
        avatarWrap.textContent = getSellerAvatarFallback(product);
      }

      const sellerCopy = createElement("div", { className: "product-seller-copy" });
      sellerCopy.append(
        createElement("strong", { className: "product-seller-name", textContent: getProductSellerLabel(product) }),
        createElement("span", {
          className: "product-seller-meta",
          textContent: `${product?.location || deps.getCategoryLabel(product?.category)}`
        })
      );

      sellerRow.append(avatarWrap, sellerCopy, createElement("span", {
        className: "product-seller-badge",
        textContent: "Verified"
      }));
      return sellerRow;
    }

    function createProductActionGroupElement(product) {
      return deps.createElementFromMarkup(
        deps.renderProductActionGroup(product, { requestLabel: "My Request" })
      );
    }

    function createShowcasePreviewMediaElement(product) {
      const media = createElement("div", { className: "product-card-media showcase-media" });
      if (deps.renderFeedGalleryMarkup) {
        media.appendChild(createElementFromMarkup(deps.renderFeedGalleryMarkup(product, "discovery")));
        return media;
      }

      const primaryImage = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
          })
        : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
      media.appendChild(createResponsiveImage({
        src: primaryImage,
        alt: product.name || "Product image",
        fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
        className: "showcase-preview-image",
        attributes: {
          "data-marketplace-scroll-image": "true"
        }
      }));
      return media;
    }

    function bindCardOpenHandler(card, product) {
      if (!card || card.dataset.cardOpenBound === "true") {
        return;
      }

      card.dataset.cardOpenBound = "true";
      card.addEventListener("click", (event) => {
        if (event.__wingaProductOpenHandled) {
          return;
        }
        const openTrigger = event.target.closest("[data-open-product], [data-product-card], [data-showcase-id]");
        const productId = openTrigger?.dataset?.openProduct
          || openTrigger?.dataset?.productCard
          || openTrigger?.dataset?.showcaseId
          || card.dataset.openProduct
          || card.dataset.productCard
          || card.dataset.showcaseId
          || product?.id
          || "";
        if (!productId) {
          return;
        }
        if (
          event.target.closest(
            ".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages], [data-open-product-whatsapp], [data-buy-product], [data-detail-repost], .product-actions, .showcase-actions, .seller-product-actions"
          )
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.__wingaProductOpenHandled = true;

        if (!deps.isAuthenticatedUser?.()) {
          deps.promptGuestAuth?.({
            preferredMode: "signup",
            role: "buyer",
            title: "You need an account to continue",
            message: "Sign up or log in to open product details and other marketplace actions.",
            intent: { type: "focus-product", productId }
          });
          return;
        }

        deps.openProductDetailModal?.(productId);
      });
    }

    function getProductCardCaption(product) {
      return String(
        product?.description
          || product?.caption
          || product?.name
          || product?.shop
          || deps.getCategoryLabel(product?.category)
          || ""
      ).trim();
    }

    function createProductCaptionElement(product) {
      const captionText = getProductCardCaption(product);
      if (!captionText) {
        return null;
      }
      const wrapper = createElement("div", {
        className: "product-card-caption-block"
      });

      const caption = createElement("p", {
        className: "product-card-caption",
        textContent: captionText
      });
      caption.setAttribute("aria-label", captionText);
      wrapper.appendChild(caption);

      const needsToggle = captionText.length > 120;
      if (needsToggle) {
        wrapper.classList.add("is-collapsed");
        const toggle = createElement("button", {
          className: "product-caption-toggle",
          textContent: "See more",
          attributes: {
            type: "button",
            "data-product-caption-toggle": "true",
            "aria-expanded": "false"
          }
        });
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isExpanded = wrapper.classList.toggle("is-expanded");
          wrapper.classList.toggle("is-collapsed", !isExpanded);
          toggle.textContent = isExpanded ? "See less" : "See more";
          toggle.setAttribute("aria-expanded", String(isExpanded));
        });
        wrapper.appendChild(toggle);
      }

      return wrapper;
    }

    function createProductCardElement(product) {
      const card = createElement("article", {
        className: "product-card",
        attributes: {
          "data-product-card": product.id,
          "data-open-product": product.id
        }
      });
      card.dataset.productCard = product.id;
      card.dataset.openProduct = product.id;
      card.dataset.cardOpenBound = "false";
      if (Array.isArray(product.images) && product.images.length > 1) {
        card.classList.add("has-gallery-count-badge");
      }
      const media = createElement("div", { className: "product-card-media" });
      media.appendChild(createProductGalleryElement(product));
      if (Array.isArray(product.images) && product.images.length > 1) {
        media.appendChild(createElement("span", {
          className: "feed-gallery-count-badge product-gallery-count-badge",
          textContent: `${Math.min(product.images.length, 9)}/5`
        }));
      }
      card.appendChild(media);
      const overflowMenuMarkup = deps.renderProductOverflowMenu?.(product, { overlay: true });
      if (overflowMenuMarkup) {
        card.appendChild(createFragmentFromMarkup(overflowMenuMarkup));
      }

      const content = createElement("div", { className: "product-content product-content-simple product-content-social" });
      content.appendChild(createSellerRowElement(product));
      const caption = createProductCaptionElement(product);
      if (caption) {
        content.appendChild(caption);
      }
      content.appendChild(createProductActionGroupElement(product));
      card.appendChild(content);
      bindCardOpenHandler(card, product);

      return card;
    }

    function createShowcaseProductCardElement(product) {
      const card = createElement("article", {
        className: "product-card showcase-card",
        attributes: {
          "data-showcase-id": product.id,
          "data-open-product": product.id
        }
      });
      card.dataset.showcaseId = product.id;
      card.dataset.openProduct = product.id;
      card.dataset.cardOpenBound = "false";
      if (Array.isArray(product.images) && product.images.length > 1) {
        card.classList.add("has-gallery-count-badge");
      }
      const media = createShowcasePreviewMediaElement(product);
      const body = createElement("div", { className: "product-content product-content-simple product-content-social showcase-body" });
      const overflowMenuMarkup = deps.renderProductOverflowMenu?.(product, { overlay: true });
      if (overflowMenuMarkup) {
        card.appendChild(createFragmentFromMarkup(overflowMenuMarkup));
      }
      body.appendChild(createSellerRowElement(product));
      const caption = createProductCaptionElement(product);
      if (caption) {
        body.appendChild(caption);
      }
      body.append(
        deps.createElementFromMarkup(
          deps.renderProductActionGroup(product, { requestLabel: "My Request", extraClass: "showcase-actions showcase-actions-compact" })
        )
      );
      card.append(media, body);
      card.dataset.showcaseClickBound = "true";
      bindCardOpenHandler(card, product);
      return card;
    }

    function createShowcaseSectionElement(items, index, heading = "Marketplace Picks", title = "Bidhaa kutoka maduka tofauti", subtitle = "Tembea kushoto au kulia kuona zaidi") {
      if (!items.length) {
        return null;
      }
      const section = createElement("section", {
        className: "showcase-inline panel",
        attributes: { "data-inline-showcase-section": index }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: heading,
        title,
        meta: subtitle
      }));
      const track = createElement("div", { className: "showcase-track" });
      items.forEach((product) => track.appendChild(createShowcaseProductCardElement(product)));
      section.appendChild(track);
      return section;
    }

    function renderShowcaseTrack(track, items) {
      if (!track) {
        return;
      }
      const fragment = document.createDocumentFragment();
      (Array.isArray(items) ? items : []).forEach((product) => {
        fragment.appendChild(createShowcaseProductCardElement(product));
      });
      track.replaceChildren(fragment);
    }

    function createDynamicShowcasePlaceholderElement(index) {
      const section = createElement("section", {
        className: "showcase-inline panel showcase-inline-pending",
        attributes: { "data-dynamic-showcase-placeholder": index }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "More To Explore",
        title: "Loading more products for you",
        meta: "Keep scrolling to discover more"
      }));
      return section;
    }

    function createRecommendationSectionElement(title, subtitle, items, type) {
      if (!items.length) {
        return null;
      }
      const section = createElement("section", {
        className: "showcase-inline panel recommendation-strip",
        attributes: { "data-recommendation-type": type }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: title,
        title: subtitle,
        meta: "Suggestions based on the current catalog"
      }));
      const track = createElement("div", { className: "showcase-track" });
      items.forEach((product) => track.appendChild(createShowcaseProductCardElement(product)));
      section.appendChild(track);
      return section;
    }

    function renderProducts(list) {
      const productsContainer = deps.getProductsContainer();
      const currentView = deps.getCurrentView();
      const shouldTrackViews = currentView !== "upload";
      const shouldInjectInlineShowcases = currentView === "home" && !deps.hasPrioritySearchResults(list.length);
      const productsPerRow = shouldInjectInlineShowcases ? deps.getProductsPerRow() : 0;
      const showcaseSpacing = 10;
      const firstShowcaseAfter = shouldInjectInlineShowcases ? showcaseSpacing : Number.POSITIVE_INFINITY;
      const showcaseRepeatInterval = shouldInjectInlineShowcases ? showcaseSpacing : Number.POSITIVE_INFINITY;
      let nextShowcaseInsertAt = firstShowcaseAfter;
      let showcaseIndex = 0;
      let insertedInlineShowcase = false;
      const usedShowcaseProductIds = new Set();
      const maxDeferredShowcases = shouldInjectInlineShowcases
        ? Math.min(2, Math.max(0, Math.floor((Math.max(0, list.length - firstShowcaseAfter)) / Math.max(1, showcaseRepeatInterval))))
        : 0;
      const fragment = document.createDocumentFragment();
      const viewedProductIds = [];
      const passiveViewLimit = Math.max(4, (deps.getProductsPerRow?.() || 3));
      preloadMarketplaceImages(list);

      list.forEach((product, index) => {
        if (shouldTrackViews && index < passiveViewLimit && deps.trackView(product)) {
          viewedProductIds.push(product.id);
        }

        fragment.appendChild(createProductCardElement(product));
        const renderedCount = index + 1;
        if (shouldInjectInlineShowcases && renderedCount === nextShowcaseInsertAt && renderedCount < list.length) {
          if (showcaseIndex === 0) {
            const descriptor = deps.getBehaviorShowcaseDescriptor(showcaseIndex, usedShowcaseProductIds);
            const showcaseElement = createShowcaseSectionElement(
              descriptor.items,
              showcaseIndex + 1,
              descriptor.heading,
              descriptor.title,
              descriptor.subtitle
            );
            if (showcaseElement) {
              descriptor.items.forEach((item) => usedShowcaseProductIds.add(item.id));
              fragment.appendChild(showcaseElement);
              showcaseIndex += 1;
              insertedInlineShowcase = true;
            }
          } else if (showcaseIndex - 1 < maxDeferredShowcases) {
            fragment.appendChild(createDynamicShowcasePlaceholderElement(showcaseIndex));
            showcaseIndex += 1;
            insertedInlineShowcase = true;
          }
          nextShowcaseInsertAt += showcaseRepeatInterval;
        }
      });

      if (shouldInjectInlineShowcases && !insertedInlineShowcase && list.length >= Math.max(4, productsPerRow * 2 || 4)) {
        const descriptor = deps.getBehaviorShowcaseDescriptor(0, usedShowcaseProductIds);
        const showcaseElement = createShowcaseSectionElement(
          descriptor.items,
          1,
          descriptor.heading,
          descriptor.title,
          descriptor.subtitle
        );
        if (showcaseElement) {
          fragment.appendChild(showcaseElement);
        }
      }

      if (currentView === "home" && list.length > 0 && deps.canUseContinuousDiscovery?.()) {
        const seedProduct = deps.getRecommendationSeed(list);
        const related = deps.getRelatedProducts(seedProduct, 6);
        const youMayLike = deps.getYouMayLikeProducts(seedProduct, 6);
        const trending = deps.getTrendingProducts(8);
        [
          createRecommendationSectionElement("Related Products", seedProduct ? `More in ${deps.getCategoryLabel(seedProduct.category)}` : "Similar picks", related, "related"),
          createRecommendationSectionElement("You May Like", "Based on what you are viewing", youMayLike, "you-may-like"),
          createRecommendationSectionElement("Trending", "Most viewed and most interacted", trending, "trending")
        ].filter(Boolean).forEach((section) => fragment.appendChild(section));
        if (deps.createContinuousDiscoveryAnchorElement) {
          fragment.appendChild(deps.createContinuousDiscoveryAnchorElement());
        }
      }

      productsContainer.replaceChildren(fragment);

      if (shouldInjectInlineShowcases) {
        deps.bindShowcaseCardClicks(productsContainer);
        deps.setupDynamicShowcaseLoading(productsContainer, usedShowcaseProductIds);
      }
      deps.bindFeedGalleryInteractions?.(productsContainer);
      if (currentView === "home" && list.length > 0 && deps.canUseContinuousDiscovery?.() && deps.setupContinuousDiscoveryLoading) {
        const usedProductIds = new Set(list.map((product) => product.id));
        Array.from(productsContainer.querySelectorAll("[data-showcase-id], [data-open-product]")).forEach((element) => {
          const productId = element.dataset.showcaseId || element.dataset.openProduct || "";
          if (productId) {
            usedProductIds.add(productId);
          }
        });
        deps.setupContinuousDiscoveryLoading(productsContainer, {
          seedProduct: deps.getRecommendationSeed(list),
          usedProductIds
        });
      }

      if (viewedProductIds.length > 0) {
        schedulePassiveViewedProductTracking(viewedProductIds);
      }
    }

    return {
      renderProducts,
      createProductGalleryElement,
      createDynamicShowcasePlaceholderElement,
      createShowcaseSectionElement,
      renderShowcaseTrack
    };
  }

  window.WingaModules.marketplace.createMarketplaceUiModule = createMarketplaceUiModule;
})();


// src/reviews/reviews.js
(() => {
  function createReviewsModule(deps) {
    const {
      getCurrentUser,
      getCurrentOrders,
      getCurrentReviews,
      getReviewSummaries,
      getProducts,
      getProductDetailUiState,
      escapeHtml
    } = deps;

    function renderStars(rating) {
      const rounded = Math.round(Number(rating || 0));
      return `${"\u2605".repeat(Math.max(0, rounded))}${"\u2606".repeat(Math.max(0, 5 - rounded))}`;
    }

    function getProductReviewSummary(productId) {
      return getReviewSummaries()?.[productId] || { averageRating: 0, totalReviews: 0 };
    }

    function getSellerReviewSummary(sellerId) {
      if (!sellerId) {
        return { averageRating: 0, totalReviews: 0 };
      }
      const sellerProductIds = new Set(getProducts().filter((product) => product.uploadedBy === sellerId).map((product) => product.id));
      const sellerReviews = getCurrentReviews().filter((review) => sellerProductIds.has(review.productId));
      const totalReviews = sellerReviews.length;
      const averageRating = totalReviews
        ? Number((sellerReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / totalReviews).toFixed(1))
        : 0;
      return { averageRating, totalReviews };
    }

    function getProductReviews(productId, limit = 4) {
      return getCurrentReviews()
        .filter((review) => review.productId === productId)
        .sort((first, second) => new Date(second.date || 0).getTime() - new Date(first.date || 0).getTime())
        .slice(0, limit);
    }

    function canCurrentUserReviewProduct(product) {
      const currentUser = getCurrentUser();
      if (!currentUser || !product) {
        return false;
      }
      const alreadyReviewed = getCurrentReviews().some((review) => review.productId === product.id && review.userId === currentUser);
      if (alreadyReviewed) {
        return false;
      }
      return (getCurrentOrders()?.purchases || []).some((order) =>
        order.productId === product.id && order.status === "delivered"
      );
    }

    function renderProductReviewSummary(product) {
      const summary = getProductReviewSummary(product.id);
      if (!summary.totalReviews) {
        return `<p class="product-meta review-summary">No reviews yet</p>`;
      }
      return `
        <div class="review-summary">
          <span class="review-stars">${renderStars(summary.averageRating)}</span>
          <strong>${summary.averageRating.toFixed(1)}</strong>
          <span>${summary.totalReviews} review${summary.totalReviews === 1 ? "" : "s"}</span>
        </div>
      `;
    }

    function renderSellerReviewSummary(sellerId) {
      const summary = getSellerReviewSummary(sellerId);
      if (!summary.totalReviews) {
        return `<p class="product-meta review-summary">Rating ya muuzaji itaonekana baada ya reviews za kwanza.</p>`;
      }
      return `
        <div class="review-summary seller-review-summary">
          <span class="review-stars">${renderStars(summary.averageRating)}</span>
          <strong>${summary.averageRating.toFixed(1)}</strong>
          <span>${summary.totalReviews} review za muuzaji${summary.totalReviews === 1 ? "" : ""}</span>
        </div>
      `;
    }

    function getProductDetailReviewDraft(productId) {
      const uiState = getProductDetailUiState();
      if (uiState.reviewDraft.productId !== productId) {
        uiState.reviewDraft = {
          productId,
          rating: 5,
          comment: ""
        };
      }
      return uiState.reviewDraft;
    }

    function renderProductReviewForm(product) {
      if (!canCurrentUserReviewProduct(product)) {
        return "";
      }

      const draft = getProductDetailReviewDraft(product.id);
      return `
        <form class="product-review-form" data-product-review-form="${product.id}">
          <div class="product-review-stars" role="radiogroup" aria-label="Rate this product">
            ${[1, 2, 3, 4, 5].map((value) => `
              <button class="review-star-btn${draft.rating >= value ? " active" : ""}" type="button" data-review-rating="${value}" aria-label="Rate ${value} star${value === 1 ? "" : "s"}">\u2605</button>
            `).join("")}
          </div>
          <textarea data-review-comment="${product.id}" rows="3" maxlength="280" placeholder="Share a useful review kuhusu quality, size, response ya muuzaji, au delivery.">${escapeHtml(draft.comment || "")}</textarea>
          <div class="product-review-form-foot">
            <span class="meta-copy">Ni wateja waliokamilisha delivery tu wanaoweza ku-review.</span>
            <button class="action-btn buy-btn" type="submit">Submit Review</button>
          </div>
        </form>
      `;
    }

    function renderProductReviewsList(product) {
      const reviews = getProductReviews(product.id);
      if (!reviews.length) {
        return `<p class="empty-copy">Hakuna review bado. Mteja wa kwanza aliyekamilisha order anaweza kuanza hapa.</p>`;
      }
      return `
        <div class="product-reviews">
          ${reviews.map((review) => `
            <div class="review-line">
              <div class="review-line-head">
                <strong>${escapeHtml(review.userId)}</strong>
                <span class="review-stars">${renderStars(review.rating)}</span>
              </div>
              <p>${escapeHtml(review.comment)}</p>
              <small>${review.verifiedBuyer ? "Mteja aliyethibitishwa | " : ""}${new Date(review.date).toLocaleDateString("sw-TZ")}</small>
            </div>
          `).join("")}
        </div>
      `;
    }

    return {
      renderStars,
      getProductReviewSummary,
      getSellerReviewSummary,
      getProductReviews,
      canCurrentUserReviewProduct,
      renderProductReviewSummary,
      renderSellerReviewSummary,
      getProductDetailReviewDraft,
      renderProductReviewForm,
      renderProductReviewsList
    };
  }

  window.WingaModules.reviews.createReviewsModule = createReviewsModule;
})();


// src/requests/request-box.js
(() => {
  function createRequestBoxModule(deps) {
    const state = {
      items: [],
      sellerNotes: {},
      lastSentSummary: null,
      isSending: false
    };

    function getRequestBoxSnapshot() {
      return {
        items: normalizeRequestBoxItems(state.items),
        sellerNotes: state.sellerNotes
      };
    }

    function readRequestBoxSnapshotFromStorage(storage) {
      if (!storage) {
        return null;
      }
      try {
        return JSON.parse(storage.getItem(deps.getRequestBoxStorageKey()) || "null");
      } catch (error) {
        return null;
      }
    }

    function writeRequestBoxSnapshotToStorage(storage, snapshot) {
      if (!storage) {
        return false;
      }
      storage.setItem(deps.getRequestBoxStorageKey(), JSON.stringify(snapshot));
      return true;
    }

    function normalizeRequestItemSnapshot(snapshot = {}, legacyItem = {}) {
      const sellerId = String(snapshot?.sellerId || legacyItem?.sellerId || legacyItem?.uploadedBy || "").trim();
      return {
        productName: String(snapshot?.productName || legacyItem?.productName || legacyItem?.name || "").trim(),
        productImage: String(snapshot?.productImage || legacyItem?.productImage || legacyItem?.image || "").trim(),
        price: snapshot?.price ?? legacyItem?.price ?? null,
        category: String(snapshot?.category || legacyItem?.category || "").trim(),
        sellerId,
        sellerName: String(snapshot?.sellerName || legacyItem?.sellerName || legacyItem?.shop || sellerId || "").trim()
      };
    }

    function createRequestItemSnapshot(product) {
      return normalizeRequestItemSnapshot({
        productName: product?.name || "",
        productImage: product?.image || "",
        price: product?.price ?? null,
        category: product?.category || "",
        sellerId: product?.uploadedBy || "",
        sellerName: deps.getMarketplaceUser?.(product?.uploadedBy || "")?.fullName || product?.shop || product?.uploadedBy || ""
      });
    }

    function normalizeRequestBoxItems(items = []) {
      const seen = new Set();
      return (Array.isArray(items) ? items : [])
        .map((item) => ({
          productId: String(item?.productId || "").trim(),
          quantity: Math.min(99, Math.max(1, Number(item?.quantity || 1) || 1)),
          addedAt: item?.addedAt || new Date().toISOString(),
          snapshot: normalizeRequestItemSnapshot(item?.snapshot || {}, item)
        }))
        .filter((item) => item.productId && !seen.has(item.productId) && seen.add(item.productId));
    }

    function clearSessionState() {
      state.items = [];
      state.sellerNotes = {};
      state.lastSentSummary = null;
      state.isSending = false;
    }

    function loadRequestBoxState() {
      if (!deps.getCurrentUser() || !deps.canUseBuyerFeatures()) {
        clearSessionState();
        return;
      }

      try {
        const raw = readRequestBoxSnapshotFromStorage(localStorage)
          || readRequestBoxSnapshotFromStorage(sessionStorage)
          || {};
        state.items = normalizeRequestBoxItems(raw?.items || []);
        state.sellerNotes = raw?.sellerNotes && typeof raw.sellerNotes === "object" ? raw.sellerNotes : {};
        state.lastSentSummary = null;
      } catch (error) {
        deps.captureError?.("request_box_load_failed", error, {
          user: deps.getCurrentUser()
        });
        clearSessionState();
        try {
          localStorage.removeItem(deps.getRequestBoxStorageKey());
        } catch (storageError) {
          // Ignore storage cleanup failures and continue with empty in-memory state.
        }
      }
    }

    function saveRequestBoxState() {
      if (!deps.getCurrentUser() || !deps.canUseBuyerFeatures()) {
        return;
      }

      const snapshot = getRequestBoxSnapshot();
      try {
        writeRequestBoxSnapshotToStorage(localStorage, snapshot);
        try {
          sessionStorage.removeItem(deps.getRequestBoxStorageKey());
        } catch (storageError) {
          // Ignore non-critical session fallback cleanup failures.
        }
      } catch (error) {
        try {
          deps.cleanupLocalFallbackArtifacts?.();
          writeRequestBoxSnapshotToStorage(localStorage, snapshot);
          try {
            sessionStorage.removeItem(deps.getRequestBoxStorageKey());
          } catch (storageError) {
            // Ignore non-critical session fallback cleanup failures.
          }
          return;
        } catch (retryError) {
          try {
            writeRequestBoxSnapshotToStorage(sessionStorage, snapshot);
          } catch (sessionError) {
            deps.captureError?.("request_box_save_failed", sessionError, {
              user: deps.getCurrentUser()
            });
            return;
          }
          deps.captureError?.("request_box_save_fell_back_to_session_storage", retryError, {
            user: deps.getCurrentUser()
          });
        }
      }
    }

    function getRequestBoxProducts() {
      const itemMap = new Map(normalizeRequestBoxItems(state.items).map((item) => [item.productId, item]));
      if (typeof deps.getProductById === "function") {
        return Array.from(itemMap.values())
          .map((item) => {
            const product = deps.getProductById(item.productId);
            if (product && product.uploadedBy && product.uploadedBy !== deps.getCurrentUser()) {
              return {
                ...item,
                snapshot: createRequestItemSnapshot(product),
                product,
                sellerId: product.uploadedBy
              };
            }
            if (!item.snapshot?.sellerId || item.snapshot.sellerId === deps.getCurrentUser()) {
              return null;
            }
            return {
              ...item,
              product: {
                id: item.productId,
                name: item.snapshot.productName || "Selected product",
                image: item.snapshot.productImage || deps.getImageFallbackDataUri("W"),
                price: item.snapshot.price ?? null,
                category: item.snapshot.category || "",
                uploadedBy: item.snapshot.sellerId,
                shop: item.snapshot.sellerName || item.snapshot.sellerId,
                status: "unknown",
                availability: "unknown"
              },
              sellerId: item.snapshot.sellerId,
              isSnapshotFallback: true
            };
          })
          .filter(Boolean);
      }
      return deps.getProducts()
        .filter((product) => itemMap.has(product.id) && product.uploadedBy && product.uploadedBy !== deps.getCurrentUser())
        .map((product) => ({
          ...itemMap.get(product.id),
          snapshot: createRequestItemSnapshot(product),
          product,
          sellerId: product.uploadedBy
        }))
        .concat(
          Array.from(itemMap.values())
            .filter((item) => !deps.getProducts().some((product) => product.id === item.productId))
            .map((item) => {
              if (!item.snapshot?.sellerId || item.snapshot.sellerId === deps.getCurrentUser()) {
                return null;
              }
              return {
                ...item,
                product: {
                  id: item.productId,
                  name: item.snapshot.productName || "Selected product",
                  image: item.snapshot.productImage || deps.getImageFallbackDataUri("W"),
                  price: item.snapshot.price ?? null,
                  category: item.snapshot.category || "",
                  uploadedBy: item.snapshot.sellerId,
                  shop: item.snapshot.sellerName || item.snapshot.sellerId,
                  status: "unknown",
                  availability: "unknown"
                },
                sellerId: item.snapshot.sellerId,
                isSnapshotFallback: true
              };
            })
            .filter(Boolean)
        );
    }

    function getRequestBoxGroups() {
      const groupMap = new Map();

      getRequestBoxProducts().forEach((entry) => {
        if (!groupMap.has(entry.sellerId)) {
          const seller = deps.getMarketplaceUser(entry.sellerId);
          groupMap.set(entry.sellerId, {
            sellerId: entry.sellerId,
            sellerName: seller?.fullName || entry.product.shop || entry.sellerId,
            note: String(state.sellerNotes[entry.sellerId] || ""),
            items: []
          });
        }

        groupMap.get(entry.sellerId).items.push({
          productId: entry.product.id,
          productName: entry.product.name,
          productImage: entry.product.image || deps.getImageFallbackDataUri("W"),
          price: entry.product.price ?? null,
          sellerId: entry.sellerId,
          category: entry.product.category || "",
          quantity: entry.quantity
        });
      });

      return Array.from(groupMap.values()).map((group) => ({
        ...group,
        totalQuantity: group.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
      }));
    }

    function getRequestBoxItemCount() {
      return normalizeRequestBoxItems(state.items).reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    }

    function isProductInRequestBox(productId) {
      return normalizeRequestBoxItems(state.items).some((item) => item.productId === productId);
    }

    function refreshRequestBoxUI(options = {}) {
      const { reopenProductId = "", keepProfileSection = false } = options;
      saveRequestBoxState();
      if (deps.getCurrentView() === "profile") {
        if (keepProfileSection) {
          deps.setPendingProfileSection("profile-request-box-panel");
        }
        deps.renderProfile();
      } else {
        deps.refreshRequestButtonsUI?.();
      }
      if (reopenProductId && deps.isProductDetailOpen()) {
        deps.openProductDetailModal(reopenProductId);
      }
    }

    function showRequestBoxToast(message, variant = "info", title = "My Requests") {
      deps.showInAppNotification({
        title,
        body: message,
        variant
      });
    }

    function addProductToRequestBox(product, options = {}) {
      const { reopenProductId = "", openProfile = false } = options;

      if (!deps.getCurrentUser()) {
        deps.promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: "You need a customer account to save requests",
          message: "Sign in or sign up as a mteja to collect products from different sellers.",
          intent: {
            type: "add-request",
            productId: product?.id || ""
          }
        });
        return false;
      }

      if (!deps.canUseBuyerFeatures()) {
        showRequestBoxToast("Akaunti hii haina ruhusa za mteja kutumia Selected Items.", "warning", "Mteja access needed");
        return false;
      }

      if (!product || product.uploadedBy === deps.getCurrentUser()) {
        return false;
      }

      if (!isProductInRequestBox(product.id)) {
        state.items = [
          {
            productId: product.id,
            quantity: 1,
            addedAt: new Date().toISOString(),
            snapshot: createRequestItemSnapshot(product)
          },
          ...normalizeRequestBoxItems(state.items)
        ].slice(0, 40);
      }

      state.lastSentSummary = null;
      saveRequestBoxState();

      if (openProfile) {
        deps.openProfileSection("profile-request-box-panel");
      } else {
        refreshRequestBoxUI({ reopenProductId });
      }

      showRequestBoxToast(`${product.name} added to your requests.`, "success");
      return true;
    }

    function removeProductFromRequestBox(productId, options = {}) {
      const requestItem = normalizeRequestBoxItems(state.items).find((item) => item.productId === productId);
      const product = deps.getProductById ? deps.getProductById(productId) : deps.getProducts().find((item) => item.id === productId);
      state.items = normalizeRequestBoxItems(state.items).filter((item) => item.productId !== productId);
      state.lastSentSummary = null;
      refreshRequestBoxUI(options);
      const productName = product?.name || requestItem?.snapshot?.productName || "Selected product";
      showRequestBoxToast(`${productName} removed from your requests.`, "info");
    }

    function clearRequestBox(options = {}) {
      if (state.items.length && deps.confirmAction && !deps.confirmAction("Una uhakika unataka kuondoa bidhaa zote kwenye My Requests?")) {
        return;
      }
      clearSessionState();
      refreshRequestBoxUI(options);
      if (options?.keepProfileSection) {
        showRequestBoxToast("My Requests zimesafishwa. Unaweza kuanza kuchagua bidhaa tena.", "info", "Requests cleared");
      }
    }

    function updateRequestItemQuantity(productId, quantity, options = {}) {
      state.items = normalizeRequestBoxItems(state.items).map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(99, Math.max(1, Number(quantity || 1) || 1)) }
          : item
      );
      state.lastSentSummary = null;
      refreshRequestBoxUI(options);
    }

    function toggleProductInRequestBox(product, options = {}) {
      if (!product?.id) {
        return false;
      }

      if (isProductInRequestBox(product.id)) {
        removeProductFromRequestBox(product.id, options);
        return false;
      }

      return addProductToRequestBox(product, options);
    }

    function updateRequestSellerNote(sellerId, note) {
      state.sellerNotes = {
        ...state.sellerNotes,
        [sellerId]: String(note || "").slice(0, 240)
      };
      saveRequestBoxState();
    }

    async function sendRequestBoxToSellers() {
      if (state.isSending) {
        deps.reportEvent?.("warn", "request_box_duplicate_send_blocked", "Blocked duplicate request-box send attempt.", {
          user: deps.getCurrentUser()
        });
        return;
      }
      const groups = getRequestBoxGroups();
      if (!groups.length || !deps.getCurrentUser() || !deps.canUseBuyerFeatures()) {
        return;
      }
      state.isSending = true;

      const sentSellerIds = [];
      const sentContexts = [];
      const failures = [];

      try {
        for (const group of groups) {
          const threadName = group.items.length === 1
            ? group.items[0].productName
            : `${group.items.length} selected products`;
          const note = String(group.note || "").trim();
          const defaultMessage = group.items.length === 1
            ? "Habari, naomba maelezo kuhusu bidhaa hii."
            : "Habari, naomba maelezo kuhusu bidhaa nilizochagua hapa.";

          try {
            await deps.sendMessage({
              receiverId: group.sellerId,
              productId: "",
              productName: threadName,
              message: note || defaultMessage,
              messageType: group.items.length > 1 ? "product_inquiry" : "product_reference",
              productItems: group.items.map((item) => ({
                ...item,
                productName: Number(item.quantity || 1) > 1 ? `${item.productName} x${Number(item.quantity || 1)}` : item.productName
              }))
            });
            sentSellerIds.push(group.sellerId);
            sentContexts.push({
              withUser: group.sellerId,
              productId: "",
              productName: threadName
            });
          } catch (error) {
            deps.captureError?.("request_box_group_send_failed", error, {
              sellerId: group.sellerId,
              itemsCount: group.items.length
            });
            failures.push(`${group.sellerName}: ${error.message || "request imeshindikana"}`);
          }
        }

        if (sentSellerIds.length) {
          const sentSellerSet = new Set(sentSellerIds);
          state.items = normalizeRequestBoxItems(state.items).filter((item) => {
            const product = deps.getProductById ? deps.getProductById(item.productId) : deps.getProducts().find((entry) => entry.id === item.productId);
            return !product || !sentSellerSet.has(product.uploadedBy);
          });
          const nextNotes = { ...state.sellerNotes };
          sentSellerIds.forEach((sellerId) => {
            delete nextNotes[sellerId];
          });
          state.sellerNotes = nextNotes;
          state.lastSentSummary = {
            sellersCount: sentSellerIds.length,
            itemsCount: sentContexts.reduce((sum, context) => {
              const matchingGroup = groups.find((group) => group.sellerId === context.withUser);
              return sum + (matchingGroup?.totalQuantity || 0);
            }, 0),
            firstContext: sentContexts[0] || null
          };
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          deps.maybePromptNotificationPermission?.("request");
          saveRequestBoxState();
          refreshRequestBoxUI({ keepProfileSection: true });
        }

        if (failures.length) {
          deps.reportEvent?.("warn", "request_box_partial_failure", "Some seller requests failed to send.", {
            failures: failures.length,
            sentSellers: sentSellerIds.length
          });
          showRequestBoxToast(
            `Baadhi ya requests hazikutumwa. ${failures.slice(0, 2).join(" | ")}${failures.length > 2 ? " | ..." : ""}`,
            "warning",
            "Some requests failed"
          );
        }
      } finally {
        state.isSending = false;
      }
    }

    function renderRequestBoxSection() {
      if (!deps.canUseBuyerFeatures()) {
        return null;
      }

      const groups = getRequestBoxGroups();
      const totalItems = getRequestBoxItemCount();
      const section = deps.createElement("section", {
        attributes: { id: "profile-request-box-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "My Requests",
        title: "Selected items to send to sellers",
        meta: `${totalItems} item${totalItems === 1 ? "" : "s"} | ${groups.length} seller${groups.length === 1 ? "" : "s"}`
      }));

      if (state.lastSentSummary) {
        const success = deps.createElement("div", { className: "request-box-success" });
        success.append(
          deps.createElement("strong", { textContent: "Request sent." }),
          deps.createElement("span", {
            textContent: `${state.lastSentSummary.itemsCount} item${state.lastSentSummary.itemsCount === 1 ? "" : "s"} zimeenda kwa ${state.lastSentSummary.sellersCount} seller${state.lastSentSummary.sellersCount === 1 ? "" : "s"}. Sasa endelea na chat au subiri majibu yao.`
          }),
          deps.createElement("button", {
            className: "action-btn buy-btn",
            textContent: "Open request chats",
            attributes: {
              type: "button",
              "data-open-request-messages": "true"
            }
          })
        );
        section.appendChild(success);
      }

      if (!groups.length) {
        section.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna bidhaa kwenye My Requests bado. Tumia My Request kwenye bidhaa uzikusanye hapa."
        }));
        return section;
      }

      const groupsGrid = deps.createElement("div", { className: "orders-grid request-groups-grid" });
      groups.forEach((group) => {
        const card = deps.createElement("div", { className: "orders-card request-group-card" });
        card.append(
          deps.createElement("strong", { textContent: group.sellerName }),
          deps.createElement("small", {
            textContent: `${group.totalQuantity} selected item${group.totalQuantity === 1 ? "" : "s"}`
          })
        );

        const itemsList = deps.createElement("div", { className: "request-items-list" });
        group.items.forEach((item) => {
          const line = deps.createElement("div", { className: "request-item-line" });
          const image = deps.createElement("img", {
            attributes: {
              src: item.productImage,
              alt: item.productName,
              loading: "lazy"
            }
          });
          image.onerror = function handleRequestImageError() {
            this.onerror = null;
            this.src = deps.getImageFallbackDataUri("W");
          };
          const copy = deps.createElement("div");
          copy.append(
            deps.createElement("span", { textContent: item.productName }),
            deps.createElement("small", {
              textContent: `${deps.getCategoryLabel(item.category)} | ${deps.formatProductPrice(item.price)}`
            })
          );
          const qtyField = deps.createElement("label", { className: "request-qty-field" });
          qtyField.append(
            deps.createElement("span", { textContent: "Qty" }),
            deps.createElement("input", {
              attributes: {
                type: "number",
                min: "1",
                max: "99",
                value: String(Number(item.quantity || 1)),
                "data-request-qty": item.productId
              }
            })
          );
          line.append(
            image,
            copy,
            qtyField,
            deps.createElement("button", {
              className: "action-btn delete-btn",
              textContent: "Remove",
              attributes: {
                type: "button",
                "data-request-remove": item.productId
              }
            })
          );
          itemsList.appendChild(line);
        });
        card.appendChild(itemsList);

        const noteField = deps.createElement("label", { className: "request-note-field" });
        const textarea = deps.createElement("textarea", {
          textContent: group.note || "",
          attributes: {
            rows: "2",
            maxlength: "240",
            placeholder: "Mfano: Naomba kujua availability, size au final price.",
            "data-request-note": group.sellerId
          }
        });
        noteField.append(
          deps.createElement("span", { textContent: "Ujumbe wa mteja" }),
          textarea
        );
        card.appendChild(noteField);
        groupsGrid.appendChild(card);
      });
      section.appendChild(groupsGrid);

      const actions = deps.createElement("div", { className: "request-box-actions" });
      actions.append(
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Clear Selected Items",
          attributes: {
            type: "button",
            "data-request-clear": "true"
          }
        }),
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: state.isSending ? "Sending..." : "Send to Sellers",
          attributes: {
            type: "button",
            "data-request-send": "true",
            ...(state.isSending ? { disabled: "true", "aria-disabled": "true" } : {})
          }
        })
      );
      section.appendChild(actions);
      return section;
    }

    function bindRequestBoxActions(scope = deps.getProfileDiv()) {
      scope?.querySelector("[data-open-request-box]")?.addEventListener("click", () => {
        deps.openProfileSection("profile-request-box-panel");
      });

      scope?.querySelector("[data-open-request-messages]")?.addEventListener("click", async () => {
        if (!state.lastSentSummary?.firstContext) {
          deps.openProfileSection("profile-messages-panel");
          return;
        }

        await deps.openRequestMessagesContext(state.lastSentSummary.firstContext);
      });

      scope?.querySelector("[data-request-clear]")?.addEventListener("click", () => {
        clearRequestBox({ keepProfileSection: true });
      });

      scope?.querySelector("[data-request-send]")?.addEventListener("click", async () => {
        try {
          await sendRequestBoxToSellers();
        } catch (error) {
          deps.captureError?.("request_box_send_failed", error, {
            user: deps.getCurrentUser()
          });
          showRequestBoxToast(error.message || "Imeshindikana kutuma requests.", "error", "Request send failed");
        }
      });

      scope?.querySelectorAll("[data-request-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          removeProductFromRequestBox(button.dataset.requestRemove, { keepProfileSection: true });
        });
      });

      scope?.querySelectorAll("[data-request-qty]").forEach((input) => {
        input.addEventListener("change", () => {
          updateRequestItemQuantity(input.dataset.requestQty, input.value, { keepProfileSection: true });
        });
      });

      scope?.querySelectorAll("[data-request-note]").forEach((input) => {
        input.addEventListener("input", () => {
          updateRequestSellerNote(input.dataset.requestNote, input.value);
        });
      });
    }

    return {
      normalizeRequestBoxItems,
      loadRequestBoxState,
      saveRequestBoxState,
      getRequestBoxProducts,
      getRequestBoxGroups,
      getRequestBoxItemCount,
      isProductInRequestBox,
      refreshRequestBoxUI,
      addProductToRequestBox,
      removeProductFromRequestBox,
      clearRequestBox,
      updateRequestItemQuantity,
      toggleProductInRequestBox,
      updateRequestSellerNote,
      sendRequestBoxToSellers,
      renderRequestBoxSection,
      bindRequestBoxActions,
      clearSessionState,
      getLastSentRequestSummary: () => state.lastSentSummary
    };
  }

  window.WingaModules.requests.createRequestBoxModule = createRequestBoxModule;
})();


// src/products/actions.js
(() => {
  function createProductActionsModule(deps) {
    const {
      getCurrentUser,
      getCurrentSession,
      getChatUiState,
      chatEmojiChoices,
      isProductInRequestBox,
      canUseBuyerFeatures,
      renderWhatsappChatLink,
      canRepostProduct,
      getOrderActionState,
      buyerCancelWindowMs
    } = deps;

    function getViewerRole() {
      return String(getCurrentSession?.()?.role || "").trim().toLowerCase();
    }

    function renderRepostButton(product) {
      if (getViewerRole() !== "seller") {
        return "";
      }
      if (typeof canRepostProduct === "function" && !canRepostProduct(product)) {
        return `<button class="action-btn action-btn-secondary repost-btn is-disabled" type="button" disabled aria-disabled="true">Uza</button>`;
      }
      return `<button class="action-btn action-btn-secondary repost-btn" type="button" data-detail-repost="${product.id}">Uza</button>`;
    }

    function renderBuyButton(product) {
      const currentUser = getCurrentUser();
      if (product?.uploadedBy === currentUser) {
        return "";
      }
      const canOpenDetail = product?.status === "approved";
      if (!canOpenDetail) {
        return `<button class="action-btn buy-btn is-disabled" type="button" disabled aria-disabled="true">Nunua</button>`;
      }

      return `<button class="action-btn buy-btn" type="button" data-buy-product="${product.id}">Nunua</button>`;
    }

    function renderSellerSoldOutButton(product) {
      const currentUser = getCurrentUser();
      if (!currentUser || product.uploadedBy !== currentUser || product.availability === "sold_out") {
        return "";
      }

      return `<button class="action-btn soldout-btn" type="button" data-product-soldout="${product.id}">Sold Out</button>`;
    }

    function getOrderActionButtons(order) {
      const currentUser = getCurrentUser();
      const state = typeof getOrderActionState === "function"
        ? getOrderActionState(order, currentUser, Date.now(), buyerCancelWindowMs)
        : {
          canConfirm: order.sellerUsername === currentUser && order.status === "placed",
          canConfirmReceived: order.buyerUsername === currentUser && order.status === "confirmed",
          canCancel: order.buyerUsername === currentUser && order.status === "placed"
            && (Date.now() - new Date(order.createdAt || 0).getTime() >= buyerCancelWindowMs)
        };
      const actions = [];

      if (state.canConfirm) {
        actions.push(`<button class="action-btn buy-btn" type="button" data-order-action="confirmed" data-order-id="${order.id}">Respond & Confirm</button>`);
      }

      if (state.canConfirmReceived) {
        actions.push(`<button class="action-btn buy-btn" type="button" data-order-action="delivered" data-order-id="${order.id}">Mark Completed</button>`);
      }

      if (state.canCancel) {
        actions.push(`<button class="action-btn delete-btn" type="button" data-order-action="cancelled" data-order-id="${order.id}">Cancel Request</button>`);
      }

      return actions.join("");
    }

    function getOrderProgressLabel(order) {
      if (!order) {
        return "";
      }
      if (order.status === "placed" && order.paymentStatus === "pending") {
        return "Request sent. Payment reference imepokelewa na Winga inasubiri verification kabla seller hajajibu.";
      }
      if (order.status === "paid") {
        return "Payment verified. Seller sasa anatakiwa kujibu na kuthibitisha order hii.";
      }
      if (order.status === "placed") {
        return "Request sent. Order inasubiri hatua inayofuata ya verification au majibu ya seller.";
      }
      if (order.status === "confirmed") {
        return "Seller responded and confirmed the order. Buyer anasubiri kupokea mzigo na kumark completed.";
      }
      if (order.status === "delivered") {
        return "Order completed. Buyer anaweza sasa kuacha review ya bidhaa na huduma ya seller.";
      }
      if (order.status === "cancelled") {
        return "Order hii imecanceliwa. Hakuna hatua nyingine itakayofuata.";
      }
      return "Fuatilia status ya order hapa hadi ikamilike.";
    }

    function renderProductOverflowMenu(product, options = {}) {
      const { overlay = false } = options;
      const currentUser = getCurrentUser();
      const isOwner = Boolean(currentUser && product?.uploadedBy === currentUser);
      if (!isOwner) {
        return "";
      }
      return `
        <div class="product-menu${overlay ? " product-menu-overlay" : ""}" data-product-menu="${product.id}">
          <button class="product-menu-toggle" type="button" aria-label="Fungua menu" data-menu-toggle="${product.id}">&#8942;</button>
          <div class="product-menu-popup" data-menu-popup="${product.id}">
            <button class="product-menu-item" type="button" data-menu-action="share" data-id="${product.id}">Share</button>
            <button class="product-menu-item" type="button" data-menu-action="download" data-id="${product.id}">Download</button>
            <button class="product-menu-item product-menu-item-danger" type="button" data-menu-action="delete" data-id="${product.id}">Delete</button>
          </div>
        </div>
      `;
    }

    function renderMessageSellerButton(product) {
      const currentUser = getCurrentUser();
      const viewerRole = getViewerRole();
      if (product.uploadedBy === currentUser) {
        if (viewerRole === "seller") {
          return `<button class="action-btn chat-btn" type="button" data-open-own-messages="${product.id}">Message</button>`;
        }
        return "";
      }
      if (product.status !== "approved") {
        return `<button class="action-btn chat-btn is-disabled" type="button" disabled aria-disabled="true">Message</button>`;
      }
      if (currentUser && typeof canUseBuyerFeatures === "function" && !canUseBuyerFeatures()) {
        return `<button class="action-btn chat-btn is-disabled" type="button" disabled aria-disabled="true">Admin only</button>`;
      }
      return `<button class="action-btn chat-btn" type="button" data-chat-product="${product.id}">Message</button>`;
    }

    function renderEmojiPicker(scopeId) {
      return `
        <div class="emoji-picker-shell">
          <button class="emoji-toggle-btn" type="button" data-emoji-toggle="${scopeId}" aria-label="Open emoji picker">\u{1F60A}</button>
          ${getChatUiState().openEmojiScope === scopeId ? `
            <div class="emoji-picker-panel" data-emoji-panel="${scopeId}">
              ${chatEmojiChoices.map((emoji) => `
                <button type="button" class="emoji-chip" data-insert-emoji="${emoji}" data-emoji-scope="${scopeId}">${emoji}</button>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }

    function renderRequestBoxButton(product, label = "My Request") {
      const currentUser = getCurrentUser();
      if (product.status !== "approved") {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Unavailable</button>`;
      }
      if (product.uploadedBy === currentUser) {
        return "";
      }
      if (currentUser && typeof canUseBuyerFeatures === "function" && !canUseBuyerFeatures()) {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Admin only</button>`;
      }
      const isAdded = isProductInRequestBox(product.id);
      return `<button class="action-btn action-btn-secondary request-btn${isAdded ? " is-selected" : ""}" type="button" data-request-product="${product.id}">${isAdded ? "\u2713 Added" : label}</button>`;
    }

    function renderProductActionGroup(product, options = {}) {
      const { extraClass = "" } = options;
      const messageButton = renderMessageSellerButton(product);
      const whatsappButton = typeof renderWhatsappChatLink === "function"
        ? renderWhatsappChatLink(product, "WhatsApp")
        : "";
      const repostButton = renderRepostButton(product);
      const actionButtons = [messageButton, repostButton, whatsappButton].filter(Boolean);
      if (!actionButtons.length) {
        return "";
      }
      const actionCount = Math.min(Math.max(actionButtons.length, 1), 3);
      const groupClass = extraClass
        ? `product-actions product-actions-simple product-actions-count-${actionCount} ${extraClass}`
        : `product-actions product-actions-simple product-actions-count-${actionCount}`;

      return `
        <div class="${groupClass}" data-action-count="${actionCount}">
          ${actionButtons.join("")}
        </div>
      `;
    }

    return {
      renderBuyButton,
      renderSellerSoldOutButton,
      getOrderActionButtons,
      getOrderProgressLabel,
      renderProductOverflowMenu,
      renderMessageSellerButton,
      renderEmojiPicker,
      renderRequestBoxButton,
      renderProductActionGroup
    };
  }

  window.WingaModules.products.createProductActionsModule = createProductActionsModule;
})();


// src/chat/ui.js
(() => {
  function createChatUiModule(deps) {
    function createElementFromMarkup(markup) {
      return deps.createElementFromMarkup(markup);
    }

    function renderResponsiveImageMarkup({ src = "", alt = "", className = "", fallbackKey = "W" } = {}) {
      return deps.createResponsiveImage({
        src,
        alt,
        className,
        fallbackSrc: deps.getImageFallbackDataUri(fallbackKey)
      }).outerHTML;
    }

    function renderChatProductPreviewItems(items, options = {}) {
      const { selectable = false } = options;
      if (!items.length) {
        return "";
      }

      const selectedSet = new Set(deps.getSelectedChatProductIds ? deps.getSelectedChatProductIds() : []);
      return `
        <div class="${selectable ? "chat-seller-products" : "message-product-items"}">
          ${items.map((item) => {
            const product = item.productId
              ? (deps.getProductById ? deps.getProductById(item.productId) : deps.getProducts().find((entry) => entry.id === item.productId))
              : null;
            const isSelected = selectable && selectedSet.has(item.productId);
            const image = deps.sanitizeImageSource(
              item.productImage || product?.image || "",
              deps.getImageFallbackDataUri("W")
            );
            const category = item.category || product?.category || "";
            const safeProductName = deps.escapeHtml(item.productName || "");
            return `
              <article class="chat-product-chip${isSelected ? " selected" : ""}" ${selectable ? `data-chat-select-product="${item.productId}"` : ""}>
                ${renderResponsiveImageMarkup({ src: image, alt: safeProductName, fallbackKey: "W" })}
                <div>
                  <strong>${safeProductName}</strong>
                  <span>${category ? `${deps.getCategoryLabel(category)} | ` : ""}${deps.formatProductPrice(item.price)}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderConversationMessagesMarkup(activeMessages, options = {}) {
      const { enableActions = false } = options;
      if (!activeMessages.length) {
        return `<p class="empty-copy">Anza mazungumzo kuhusu bidhaa hii hapa chini.</p>`;
      }

      return activeMessages.map((message) => {
        const productItems = deps.getMessageProductItems(message);
        const replyMessage = deps.getReplyPreviewMessage(message, activeMessages);
        const canDelete = message.senderId === deps.getCurrentUser();
        const hasDownload = productItems.some((item) => item.productImage);
        const safeReplyText = replyMessage ? deps.escapeHtml(deps.getMessagePreviewText(replyMessage)) : "";
        const safeMessageText = message.message ? deps.escapeHtml(message.message) : "";
        return `
          <div class="message-bubble ${message.senderId === deps.getCurrentUser() ? "outgoing" : "incoming"}${productItems.length ? " message-bubble-product" : ""}" data-message-bubble-id="${message.id}">
            ${replyMessage ? `<div class="message-reply-preview"><strong>Reply</strong><span>${safeReplyText}</span></div>` : ""}
            ${productItems.length ? renderChatProductPreviewItems(productItems) : ""}
            ${message.message ? `<p>${safeMessageText}</p>` : ""}
            <small>${new Date(message.timestamp).toLocaleString("sw-TZ")} ${message.senderId === deps.getCurrentUser() ? `| ${message.isRead ? "Read" : message.isDelivered ? "Delivered" : "Sent"}` : ""}</small>
            ${enableActions ? `
              <button class="message-menu-trigger" type="button" data-message-menu-toggle="${message.id}">...</button>
              ${deps.getOpenChatMessageMenuId() === message.id ? `
                <div class="message-action-menu">
                  <button type="button" data-message-reply="${message.id}">Reply</button>
                  <button type="button" data-message-share="${message.id}">Forward</button>
                  ${hasDownload ? `<button type="button" data-message-download="${message.id}">Download image</button>` : ""}
                  ${canDelete ? `<button type="button" data-message-delete="${message.id}">Delete</button>` : ""}
                </div>
              ` : ""}
            ` : ""}
          </div>
        `;
      }).join("");
    }

    function renderNotificationsSection() {
      const currentNotifications = Array.isArray(deps.getCurrentNotifications?.())
        ? deps.getCurrentNotifications()
        : [];
      const items = currentNotifications
        .slice()
        .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
      const unreadCount = deps.getUnreadNotifications().length;

      return `
        <section id="profile-notifications-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Notifications</p>
              <h3>Message Alerts</h3>
            </div>
            <span class="meta-copy">${unreadCount} unread</span>
          </div>
          <div class="notifications-list">
            ${items.length ? items.map((notification) => `
              <button class="notification-item ${notification.isRead ? "" : "unread"}" type="button" data-notification-id="${notification.id}">
                <strong>${deps.escapeHtml(notification.title)}</strong>
                <span>${deps.escapeHtml(notification.body || "New activity")}</span>
                <small>${new Date(notification.createdAt || Date.now()).toLocaleString("sw-TZ")}</small>
              </button>
            `).join("") : `<p class="empty-copy">Hakuna notification mpya kwa sasa.</p>`}
          </div>
        </section>
      `;
    }

    function renderMessagesSection() {
      const profileFilter = deps.getProfileMessagesFilter?.() || "all";
      const summaries = deps.getConversationSummariesFiltered
        ? deps.getConversationSummariesFiltered(profileFilter)
        : deps.getConversationSummaries();
      const activeMessages = Array.isArray(deps.getActiveConversationMessages?.())
        ? deps.getActiveConversationMessages()
        : [];
      const activeChatContext = deps.getActiveChatContext();
      const currentMessageDraft = deps.getCurrentMessageDraft();
      const contactState = deps.getChatContactState?.(activeChatContext) || {
        whatsapp: "",
        phoneVisible: false,
        canSharePhone: false,
        note: ""
      };
      const activeWhatsApp = contactState.whatsapp;
      const profileMessagesMode = deps.getProfileMessagesMode?.() || "list";
      const showConversationList = profileMessagesMode !== "detail";
      const showConversationDetail = profileMessagesMode === "detail";
      const panelTitle = profileFilter === "unread" ? "Unread Messages" : "Messages";
      const panelSubtitle = profileFilter === "unread"
        ? "Unread conversations"
        : "Chat ya Mteja na Muuzaji";
      const lastActiveLabel = activeMessages[activeMessages.length - 1]?.timestamp
        ? `Last active ${new Date(activeMessages[activeMessages.length - 1].timestamp).toLocaleString("sw-TZ")}`
        : "Ready to continue the conversation";

      return `
        <section id="profile-messages-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">${panelTitle}</p>
              <h3>${panelSubtitle}</h3>
            </div>
            <div class="messages-panel-actions">
              <button class="message-panel-close message-list-profile-back" type="button" data-close-profile-messages="true" aria-label="Back to profile">← Profile</button>
              <span class="meta-copy">${summaries.length} conversations</span>
            </div>
          </div>
          <div class="messages-shell ${showConversationDetail ? "compact-detail" : ""}">
            ${showConversationList ? `
            <div class="messages-list">
              ${summaries.length ? summaries.map((summary) => `
                <button class="message-thread-item ${activeChatContext && summary.key === deps.getChatContextKey(activeChatContext) ? "active" : ""}" type="button" data-conversation-user="${summary.withUser}" data-conversation-product="${summary.productId}" data-conversation-name="${deps.escapeHtml(summary.productName)}">
                  <span class="message-thread-avatar">
                    ${(() => {
                      const partner = deps.getMarketplaceUser?.(summary.withUser);
                      const avatar = deps.sanitizeImageSource?.(partner?.profileImage || "", "");
                      return avatar
                        ? `<img src="${avatar}" alt="${deps.escapeHtml(summary.displayName || deps.getUserDisplayName(summary.withUser))}" />`
                        : `<span>${deps.escapeHtml((summary.displayName || deps.getUserDisplayName(summary.withUser) || "User").slice(0, 1))}</span>`;
                    })()}
                  </span>
                  <span class="message-thread-meta">
                    <strong>${deps.escapeHtml(summary.displayName || deps.getUserDisplayName(summary.withUser))}${summary.unreadCount ? ` <span class="thread-badge">${summary.unreadCount}</span>` : ""}</strong>
                    <span>${deps.escapeHtml(summary.productName || "General inquiry")}</span>
                    <small>${deps.escapeHtml(summary.latestMessage || "Hakuna ujumbe bado.")}</small>
                  </span>
                </button>
              `).join("") : `<p class="empty-copy">${profileFilter === "unread" ? "Hakuna unread conversations kwa sasa." : "Hakuna conversation bado. Tumia Message Muuzaji kwenye bidhaa uanze chat."}</p>`}
            </div>
            ` : ""}
            ${showConversationDetail ? `
            <div class="messages-thread-card">
              ${activeChatContext ? `
                <div class="messages-thread-head">
                  <button class="message-list-back" type="button" data-message-list-back="true">Back</button>
                  <div>
                    <strong>${deps.escapeHtml(activeChatContext.displayName || deps.getUserDisplayName(activeChatContext.withUser))}</strong>
                    <p>${deps.escapeHtml(activeChatContext.productName || "General inquiry")}</p>
                    <small class="thread-presence">${lastActiveLabel}</small>
                  </div>
                  <div class="messages-thread-actions">
                    <button class="action-btn edit-btn" type="button" data-refresh-messages="true">Refresh</button>
                    ${contactState.canSharePhone ? `<button class="action-btn action-btn-secondary" type="button" data-share-my-phone="true">Share my phone</button>` : ""}
                    ${activeWhatsApp ? `<a class="button" href="${deps.buildWhatsappHref(activeWhatsApp, activeChatContext.productName)}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>` : ""}
                  </div>
                </div>
                ${contactState.note ? `<p class="thread-contact-note">${deps.escapeHtml(contactState.note)}</p>` : ""}
                <div class="messages-thread-body">
                  ${renderConversationMessagesMarkup(activeMessages, { enableActions: true })}
                </div>
                <form id="message-compose-form" class="messages-compose">
                  <textarea id="message-compose-input" rows="3" maxlength="1000" placeholder="Andika ujumbe wako hapa...">${deps.escapeHtml(currentMessageDraft)}</textarea>
                  <div class="chat-compose-footer">
                    ${deps.renderEmojiPicker("profile")}
                    <div class="chat-compose-actions">
                      <span class="meta-copy">${currentMessageDraft.trim().length}/1000</span>
                      <button type="submit" class="action-btn buy-btn">Send Message</button>
                    </div>
                  </div>
                </form>
              ` : `<p class="empty-copy">Chagua conversation au tumia Message Muuzaji kutoka kwenye bidhaa.</p>`}
            </div>
            ` : ""}
          </div>
        </section>
      `;
    }

    function createNotificationsContainerFromState() {
      return createElementFromMarkup(renderNotificationsSection());
    }

    function createMessagesContainerFromState() {
      return createElementFromMarkup(renderMessagesSection());
    }

    function ensureContextChatModal() {
      let modal = document.getElementById("context-chat-modal");
      if (modal) {
        return modal;
      }

      modal = document.createElement("div");
      modal.id = "context-chat-modal";
      modal.style.display = "none";
      const backdrop = deps.createElement("div", {
        className: "context-chat-backdrop",
        attributes: { "data-close-context-chat": "true" }
      });
      const dialog = deps.createElement("div", {
        className: "context-chat-dialog panel",
        attributes: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "context-chat-title"
        }
      });
      dialog.append(
        deps.createElement("button", {
          className: "context-chat-close",
          textContent: "\u00D7",
          attributes: {
            type: "button",
            "aria-label": "Close chat",
            "data-close-context-chat": "true"
          }
        }),
        deps.createElement("div", { attributes: { id: "context-chat-content" } })
      );
      modal.replaceChildren(backdrop, dialog);
      document.body.appendChild(modal);
      return modal;
    }

    function renderContextChatModal() {
      const activeChatContext = deps.getActiveChatContext();
      const currentMessageDraft = deps.getCurrentMessageDraft();
      const product = deps.getActiveChatProduct();
      const seller = product ? deps.getMarketplaceUser(product.uploadedBy) : null;
      const activeMessages = deps.getActiveConversationMessages();
      const contactState = deps.getChatContactState(activeChatContext);
      const activeWhatsApp = contactState.whatsapp;
      const productName = activeChatContext?.productName || product?.name || "General inquiry";
      const sellerName = activeChatContext?.displayName
        || deps.getUserDisplayName(activeChatContext?.withUser, {
          fallback: seller?.fullName || product?.shop || activeChatContext?.withUser || "",
          shop: product?.shop || "",
          role: seller?.role || ""
        });
      const productImage = deps.sanitizeImageSource(product?.image || "", deps.getImageFallbackDataUri("W"));
      const sellerProducts = deps.getSellerProductsForActiveChat(8).map((item) => ({
        productId: item.id,
        productName: item.name,
        productImage: item.image,
        price: item.price ?? null,
        sellerId: item.uploadedBy,
        category: item.category || ""
      }));
      const selectedProducts = deps.getSelectedChatProducts();
      const replyMessage = deps.getActiveChatReplyMessageId()
        ? activeMessages.find((item) => item.id === deps.getActiveChatReplyMessageId()) || null
        : null;
      const safeProductName = deps.escapeHtml(productName);
      const safeSellerName = deps.escapeHtml(sellerName);
      const lastActiveLabel = activeMessages[activeMessages.length - 1]?.timestamp
        ? `Last active ${new Date(activeMessages[activeMessages.length - 1].timestamp).toLocaleString("sw-TZ")}`
        : "Ready to chat";

      return `
        <section class="context-chat-shell">
          <div class="context-chat-head">
            <div>
              <p class="eyebrow">Chat</p>
              <h3 id="context-chat-title">${safeSellerName}</h3>
              <p class="context-chat-presence">${lastActiveLabel}</p>
            </div>
          </div>
          <div class="context-chat-product">
            ${renderResponsiveImageMarkup({ src: productImage, alt: safeProductName, className: "product-detail-image", fallbackKey: "W" })}
            <div>
              <strong>${safeProductName}</strong>
              <p>${safeSellerName}</p>
            </div>
          </div>
          <div class="context-chat-thread">
            ${renderConversationMessagesMarkup(activeMessages, { enableActions: true })}
          </div>
          <div class="context-chat-actions">
            ${contactState.canSharePhone ? `<button class="action-btn action-btn-secondary" type="button" data-share-my-phone="true">Share my phone</button>` : ""}
            ${activeWhatsApp ? `<a class="button whatsapp-chat-btn" href="${deps.buildWhatsappHref(activeWhatsApp, productName)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
          </div>
          ${contactState.note ? `<p class="thread-contact-note context-chat-note">${deps.escapeHtml(contactState.note)}</p>` : ""}
          ${selectedProducts.length ? `
            <div class="context-chat-selection-bar">
              <strong>${selectedProducts.length} item${selectedProducts.length > 1 ? "s" : ""} selected</strong>
              <button type="button" class="action-btn action-btn-secondary" data-clear-chat-selection="true">Clear</button>
            </div>
          ` : ""}
          ${replyMessage ? `
            <div class="context-chat-reply-bar">
              <strong>Replying to</strong>
              <span>${deps.escapeHtml(deps.getMessagePreviewText(replyMessage))}</span>
              <button type="button" data-clear-chat-reply="true">&times;</button>
            </div>
          ` : ""}
          <form id="context-chat-compose-form" class="messages-compose context-chat-compose">
            <textarea id="context-chat-compose-input" rows="3" maxlength="1000" placeholder="Andika ujumbe wako hapa...">${deps.escapeHtml(currentMessageDraft)}</textarea>
            <div class="chat-compose-footer">
              ${deps.renderEmojiPicker("context")}
              <div class="chat-compose-actions">
                <span class="meta-copy">${currentMessageDraft.trim().length}/1000</span>
                <button type="submit" class="action-btn buy-btn">Send</button>
              </div>
            </div>
          </form>
          <div class="context-chat-quick-asks">
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Bei ya hizi ni kiasi gani?">Bei?</button>
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Je, hizi bidhaa bado zipo?">Zipo?</button>
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Naweza kupata size tofauti?">Size?</button>
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Location yako ni wapi?">Location?</button>
          </div>
          <section class="context-chat-seller-section">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Zaidi Kutoka Kwa Muuzaji</p>
                <h3>Continue browsing while chatting</h3>
              </div>
              <span class="meta-copy">Tap products to add them into this inquiry</span>
            </div>
            ${renderChatProductPreviewItems(sellerProducts, { selectable: true })}
          </section>
        </section>
      `;
    }

    return {
      renderNotificationsSection,
      renderMessagesSection,
      renderChatProductPreviewItems,
      renderConversationMessagesMarkup,
      createNotificationsContainerFromState,
      createMessagesContainerFromState,
      ensureContextChatModal,
      renderContextChatModal
    };
  }

  window.WingaModules.chat.createChatUiModule = createChatUiModule;
})();


// src/chat/controller.js
(() => {
  function createChatControllerModule(deps) {
    async function sharePhoneWithActiveChat() {
      const activeChatContext = deps.getActiveChatContext();
      if (!activeChatContext?.withUser) {
        return;
      }

      await deps.dataLayer.sendMessage({
        receiverId: activeChatContext.withUser,
        productId: activeChatContext.productId || "",
        productName: activeChatContext.productName || "",
        message: "Nimekushirikisha namba yangu kwa mawasiliano ya moja kwa moja.",
        messageType: "contact_share"
      });
      await Promise.all([
        deps.refreshUsersState?.(),
        deps.refreshMessagesState(),
        deps.refreshNotificationsState()
      ]);
      deps.showInAppNotification?.({
        title: "Phone shared",
        body: "Muuzaji huyu sasa ataweza kuona namba yako ndani ya mazungumzo haya.",
        variant: "success"
      });
    }

    function closeContextChatModal() {
      const modal = document.getElementById("context-chat-modal");
      if (!modal) {
        return;
      }
      modal.style.display = "none";
      document.body.classList.remove("context-chat-open");
      deps.syncBodyScrollLockState?.();
      deps.setIsContextOpen(false);
      deps.setOpenChatMessageMenuId("");
      deps.setOpenEmojiScope("");
      if (deps.getCurrentView?.() !== "profile") {
        deps.stopMessagePolling?.();
      }
    }

    function bindContextChatModalActions() {
      const modal = document.getElementById("context-chat-modal");
      if (!modal) {
        return;
      }

      const bindMessageLongPress = (scope, rerender) => {
        if (!scope) {
          return;
        }

        scope.querySelectorAll("[data-message-bubble-id]").forEach((bubble) => {
          const datasetKey = "wingaBoundMessageLongPress";
          if (bubble.dataset[datasetKey] === "true") {
            return;
          }
          bubble.dataset[datasetKey] = "true";

          let pressTimer = 0;
          let pressTriggered = false;

          const clearPress = () => {
            if (pressTimer) {
              window.clearTimeout(pressTimer);
            }
            pressTimer = 0;
          };

          const openMenu = () => {
            const messageId = bubble.dataset.messageBubbleId || "";
            if (!messageId) {
              return;
            }
            pressTriggered = true;
            deps.setOpenChatMessageMenuId(messageId);
            rerender();
          };

          bubble.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            clearPress();
            pressTriggered = false;
            pressTimer = window.setTimeout(openMenu, 450);
          });

          bubble.addEventListener("pointerup", clearPress);
          bubble.addEventListener("pointercancel", clearPress);
          bubble.addEventListener("pointerleave", clearPress);
          bubble.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            clearPress();
            openMenu();
          });

          bubble.addEventListener("click", (event) => {
            if (pressTriggered) {
              event.preventDefault();
              event.stopPropagation();
            }
            clearPress();
          });
        });
      };

      modal.querySelectorAll("[data-close-context-chat]").forEach((button) => {
        button.addEventListener("click", closeContextChatModal);
      });

      modal.querySelector("#context-chat-compose-input")?.addEventListener("input", (event) => {
        deps.setCurrentMessageDraft(event.target.value || "");
      });

      modal.querySelectorAll("[data-emoji-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          const scopeId = button.dataset.emojiToggle || "";
          deps.setOpenEmojiScope(deps.getOpenEmojiScope() === scopeId ? "" : scopeId);
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-insert-emoji]").forEach((button) => {
        button.addEventListener("click", () => {
          deps.setCurrentMessageDraft(`${deps.getCurrentMessageDraft() || ""}${button.dataset.insertEmoji || ""}`);
          deps.setOpenEmojiScope("");
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-chat-select-product]").forEach((card) => {
        card.addEventListener("click", () => {
          const productId = card.dataset.chatSelectProduct;
          const selectedProductIds = deps.getSelectedChatProductIds();
          deps.setSelectedChatProductIds(
            selectedProductIds.includes(productId)
              ? selectedProductIds.filter((item) => item !== productId)
              : [...selectedProductIds, productId].slice(0, 10)
          );
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-chat-prefill]").forEach((button) => {
        button.addEventListener("click", () => {
          deps.setCurrentMessageDraft(button.dataset.chatPrefill || "");
          replaceContextChatModal();
        });
      });

      modal.querySelector("[data-clear-chat-selection]")?.addEventListener("click", () => {
        deps.setSelectedChatProductIds([]);
        replaceContextChatModal();
      });

      modal.querySelector("[data-clear-chat-reply]")?.addEventListener("click", () => {
        deps.setActiveChatReplyMessageId("");
        replaceContextChatModal();
      });

      modal.querySelector("[data-share-my-phone]")?.addEventListener("click", async () => {
        try {
          await sharePhoneWithActiveChat();
          replaceContextChatModal();
        } catch (error) {
          deps.captureError?.("context_phone_share_failed", error, {
            receiverId: deps.getActiveChatContext?.()?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: "Sharing failed",
            body: error.message || "Imeshindikana kushare namba yako kwa sasa.",
            variant: "error"
          });
        }
      });

      modal.querySelectorAll("[data-message-menu-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const messageId = button.dataset.messageMenuToggle;
          deps.setOpenChatMessageMenuId(
            deps.getOpenChatMessageMenuId() === messageId ? "" : messageId
          );
          replaceContextChatModal();
        });
      });

      bindMessageLongPress(modal, replaceContextChatModal);

      modal.querySelectorAll("[data-message-reply]").forEach((button) => {
        button.addEventListener("click", () => {
          deps.setActiveChatReplyMessageId(button.dataset.messageReply || "");
          deps.setOpenChatMessageMenuId("");
          if (!(deps.getCurrentMessageDraft() || "").trim()) {
            deps.setCurrentMessageDraft("Naomba ufafanuzi kuhusu hii.");
          }
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-message-share]").forEach((button) => {
        button.addEventListener("click", async () => {
          const activeMessages = deps.getActiveConversationMessages();
          const targetMessage = activeMessages.find((item) => item.id === button.dataset.messageShare);
          if (!targetMessage) {
            return;
          }
          const productItems = deps.getMessageProductItems(targetMessage);
          const shareText = [
            targetMessage.message || "",
            ...productItems.map((item) => `${item.productName} - ${deps.formatProductPrice(item.price)}`)
          ].filter(Boolean).join("\n");

          try {
            if (navigator.share) {
              await navigator.share({ text: shareText });
            } else if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(shareText);
              deps.showInAppNotification?.({
                title: "Copied",
                body: "Ujumbe umewekwa kwenye clipboard.",
                variant: "success"
              });
            }
          } catch (error) {
            // Ignore share cancellation.
          } finally {
            deps.setOpenChatMessageMenuId("");
            replaceContextChatModal();
          }
        });
      });

      modal.querySelectorAll("[data-message-download]").forEach((button) => {
        button.addEventListener("click", () => {
          const activeMessages = deps.getActiveConversationMessages();
          const targetMessage = activeMessages.find((item) => item.id === button.dataset.messageDownload);
          const firstImage = deps.getMessageProductItems(targetMessage).find((item) => item.productImage)?.productImage;
          if (!firstImage) {
            return;
          }
          const link = document.createElement("a");
          link.href = firstImage;
          link.download = `${(targetMessage?.productName || "winga-product").replace(/\s+/g, "-").toLowerCase()}.png`;
          link.click();
          deps.setOpenChatMessageMenuId("");
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-message-delete]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await deps.dataLayer.deleteMessage(button.dataset.messageDelete);
            deps.setOpenChatMessageMenuId("");
            if (deps.getActiveChatReplyMessageId() === button.dataset.messageDelete) {
              deps.setActiveChatReplyMessageId("");
            }
            await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
            replaceContextChatModal();
          } catch (error) {
            deps.captureError?.("context_message_delete_failed", error, {
              messageId: button.dataset.messageDelete
            });
            deps.showInAppNotification?.({
              title: "Delete failed",
              body: error.message || "Imeshindikana kufuta ujumbe.",
              variant: "error"
            });
          }
        });
      });

      modal.querySelector("#context-chat-compose-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = modal.querySelector("#context-chat-compose-input");
        const textMessage = input?.value.trim() || "";
        const productItems = deps.getSelectedChatProducts();
        const activeChatContext = deps.getActiveChatContext();
        const message = textMessage || (productItems.length ? "Bei ya hizi ni kiasi gani?" : "");
        if (!activeChatContext || (!message && !productItems.length)) {
          return;
        }
        if (navigator.onLine === false) {
          deps.showInAppNotification?.({
            title: "Uko offline",
            body: "Ujumbe umehifadhiwa kama draft. Unganisha internet kisha utume tena.",
            variant: "warning"
          });
          return;
        }

        try {
          await deps.dataLayer.sendMessage({
            receiverId: activeChatContext.withUser,
            productId: activeChatContext.productId || "",
            productName: activeChatContext.productName || "",
            message,
            messageType: productItems.length > 1 ? "product_inquiry" : productItems.length === 1 ? "product_reference" : "text",
            productItems,
            replyToMessageId: deps.getActiveChatReplyMessageId()
          });
          deps.setCurrentMessageDraft("");
          deps.setSelectedChatProductIds([]);
          deps.setActiveChatReplyMessageId("");
          deps.setOpenChatMessageMenuId("");
          deps.setOpenEmojiScope("");
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          deps.maybePromptNotificationPermission?.("message");
          replaceContextChatModal();
        } catch (error) {
          deps.captureError?.("context_message_send_failed", error, {
            receiverId: activeChatContext?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: "Message failed",
            body: error.message || "Imeshindikana kutuma ujumbe.",
            variant: "error"
          });
        }
      });
    }

    function replaceContextChatModal() {
      const modal = document.getElementById("context-chat-modal");
      if (!modal || !deps.getIsContextOpen()) {
        return;
      }

      const activeElement = document.activeElement;
      const wasTyping = activeElement?.id === "context-chat-compose-input";
      const previousDraft = modal.querySelector("#context-chat-compose-input")?.value ?? deps.getCurrentMessageDraft();
      deps.setCurrentMessageDraft(previousDraft);

      const content = modal.querySelector("#context-chat-content");
      if (!content) {
        return;
      }

      content.replaceChildren(deps.createElementFromMarkup(deps.renderContextChatModal()));
      bindContextChatModalActions();

      if (wasTyping) {
        const nextInput = modal.querySelector("#context-chat-compose-input");
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = nextInput.value.length;
          nextInput.selectionEnd = nextInput.value.length;
        }
      }
    }

    async function openContextChatModal() {
      const modal = deps.ensureContextChatModal();
      const content = modal.querySelector("#context-chat-content");
      if (!content) {
        return;
      }

      if (!deps.getActiveConversationMessages().length && !(deps.getCurrentMessageDraft() || "").trim()) {
        deps.setCurrentMessageDraft("Habari, naomba maelezo kuhusu bidhaa hii.");
      }

      content.replaceChildren(deps.createElementFromMarkup(`
        <section class="context-chat-shell context-chat-shell-loading">
          <p class="empty-copy">Loading chat...</p>
        </section>
      `));
      modal.style.display = "grid";
      document.body.classList.add("context-chat-open");
      deps.syncBodyScrollLockState?.();
      deps.setIsContextOpen(true);
      deps.startMessagePolling?.();

      window.requestAnimationFrame(() => {
        content.replaceChildren(deps.createElementFromMarkup(deps.renderContextChatModal()));
        bindContextChatModalActions();

        const input = modal.querySelector("#context-chat-compose-input");
        if (input) {
          input.focus();
          input.selectionStart = input.value.length;
          input.selectionEnd = input.value.length;
        }
      });

      void Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()])
        .then(async () => {
          deps.maybePromptNotificationPermission?.("reply");
          await deps.markActiveConversationRead();
        })
        .catch(() => {
          // Ignore passive refresh failures after the modal is already open.
        });
    }

    function openProductChat(product) {
      if (!deps.getCurrentUser()) {
        deps.promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: "You need an account to message the seller",
          message: "Already have an account? Sign In. New here? Sign Up as a buyer to start chatting.",
          intent: {
            type: "open-chat",
            productId: product?.id || ""
          }
        });
        return;
      }
      if (!deps.canUseBuyerFeatures?.()) {
        deps.showInAppNotification?.({
          title: "Admin account restricted",
          body: "Admin au moderator hawawezi kufungua buyer chat ya marketplace.",
          variant: "warning"
        });
        return;
      }
      if (!product || product.uploadedBy === deps.getCurrentUser()) {
        return;
      }

      deps.noteMessageInterest(product.id);
      deps.setSelectedChatProductIds([]);
      deps.setActiveChatReplyMessageId("");
      deps.setOpenChatMessageMenuId("");
      deps.setOpenEmojiScope("");
      const nextChatContext = {
        withUser: product.uploadedBy,
        displayName: deps.getUserDisplayName(product.uploadedBy, {
          fallback: product.shop || product.uploadedBy || "",
          shop: product.shop || ""
        }),
        productId: product.id,
        productName: product.name,
        whatsapp: deps.normalizeWhatsapp(product.whatsapp || "")
      };
      deps.setActiveChatContext(nextChatContext);
      deps.setCurrentMessageDraft(deps.loadStoredChatDraft?.(nextChatContext) || "");

      openContextChatModal().catch((error) => {
        deps.captureError?.("context_chat_open_failed", error, {
          productId: product?.id || ""
        });
        deps.showInAppNotification?.({
          title: "Chat unavailable",
          body: "Imeshindikana kufungua chat kwa sasa.",
          variant: "error"
        });
      });
    }

    function openOwnProductMessages(productId) {
      if (!deps.getCurrentUser()) {
        return;
      }

      if (deps.isProductDetailOpen?.()) {
        deps.closeProductDetailModal?.({
          skipHistoryBack: true,
          skipContextRestore: true,
          skipRootCardScroll: true
        });
      }

      deps.setSelectedChatProductIds([]);
      deps.setActiveChatReplyMessageId("");
      deps.setOpenChatMessageMenuId("");
      deps.setOpenEmojiScope("");

      const matchingSummary = deps.getConversationSummaries().find((summary) => summary.productId === productId);
      deps.setCurrentViewState("profile", {
        syncHistory: "push",
        historyState: {
          pendingProfileSection: "profile-messages-panel"
        }
      });
      if (matchingSummary) {
        const nextChatContext = {
          withUser: matchingSummary.withUser,
          displayName: matchingSummary.displayName || deps.getUserDisplayName(matchingSummary.withUser),
          productId: matchingSummary.productId || "",
          productName: matchingSummary.productName || "",
          whatsapp: matchingSummary.whatsapp || ""
        };
        deps.setActiveChatContext(nextChatContext);
        deps.setCurrentMessageDraft(deps.loadStoredChatDraft?.(nextChatContext) || "");
        deps.setProfileMessagesMode?.("detail");
        deps.setProfileHasSelection?.(true);
      } else {
        deps.setActiveChatContext(null);
        deps.setCurrentMessageDraft("");
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
      }
      deps.setActiveProfileSection?.("profile-messages-panel");
      deps.setPendingProfileSection("profile-messages-panel");
      deps.renderCurrentView();

      if (!matchingSummary) {
        deps.showInAppNotification?.({
          title: "No messages yet",
          body: "Hakuna mazungumzo ya bidhaa hii bado. Utaona inbox yako ya messages hapa.",
          variant: "info"
        });
      }
    }

    function bindMessageActions(scope = deps.getProfileDiv?.()) {
      if (!scope) {
        return;
      }

      const bindMessageLongPress = (targetScope, rerender) => {
        if (!targetScope) {
          return;
        }

        targetScope.querySelectorAll("[data-message-bubble-id]").forEach((bubble) => {
          const datasetKey = "wingaBoundMessageLongPress";
          if (bubble.dataset[datasetKey] === "true") {
            return;
          }
          bubble.dataset[datasetKey] = "true";

          let pressTimer = 0;
          let pressTriggered = false;

          const clearPress = () => {
            if (pressTimer) {
              window.clearTimeout(pressTimer);
            }
            pressTimer = 0;
          };

          const openMenu = () => {
            const messageId = bubble.dataset.messageBubbleId || "";
            if (!messageId) {
              return;
            }
            pressTriggered = true;
            deps.setOpenChatMessageMenuId(messageId);
            rerender();
          };

          bubble.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            clearPress();
            pressTriggered = false;
            pressTimer = window.setTimeout(openMenu, 450);
          });

          bubble.addEventListener("pointerup", clearPress);
          bubble.addEventListener("pointercancel", clearPress);
          bubble.addEventListener("pointerleave", clearPress);
          bubble.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            clearPress();
            openMenu();
          });

          bubble.addEventListener("click", (event) => {
            if (pressTriggered) {
              event.preventDefault();
              event.stopPropagation();
            }
            clearPress();
          });
        });
      };

      const bindClickOnce = (selector, bindingKey, handler) => {
        scope.querySelectorAll(selector).forEach((element) => {
          const datasetKey = `wingaBound${bindingKey}`;
          if (element.dataset[datasetKey] === "true") {
            return;
          }
          element.dataset[datasetKey] = "true";
          element.addEventListener("click", (event) => {
            handler(element, event);
          });
        });
      };

      const bindInputOnce = (selector, bindingKey, handler) => {
        const element = scope.querySelector(selector);
        if (!element) {
          return;
        }
        const datasetKey = `wingaBound${bindingKey}`;
        if (element.dataset[datasetKey] === "true") {
          return;
        }
        element.dataset[datasetKey] = "true";
        element.addEventListener("input", handler);
      };

      const bindSubmitOnce = (selector, bindingKey, handler) => {
        const element = scope.querySelector(selector);
        if (!element) {
          return;
        }
        const datasetKey = `wingaBound${bindingKey}`;
        if (element.dataset[datasetKey] === "true") {
          return;
        }
        element.dataset[datasetKey] = "true";
        element.addEventListener("submit", handler);
      };

      bindClickOnce("[data-order-action]", "OrderAction", async (button) => {
          const orderId = button.dataset.orderId;
          const status = button.dataset.orderAction;
          if (status === "cancelled" && deps.confirmAction && !deps.confirmAction("Una uhakika unataka kufuta order hii?")) {
            return;
          }
          try {
            await deps.dataLayer.updateOrderStatus(orderId, { status });
            deps.showInAppNotification?.({
              title: "Order updated",
              body: status === "cancelled"
                ? "Request/order imecanceliwa."
                : status === "confirmed"
                  ? "Seller amejibu na kuthibitisha order."
                  : "Order imewekwa completed.",
              variant: "success"
            });
            deps.renderProfile();
          } catch (error) {
            deps.captureError?.("order_status_update_failed", error, {
              orderId,
              status
            });
            deps.showInAppNotification?.({
              title: "Order update failed",
              body: error.message || "Imeshindikana kubadilisha status ya order.",
              variant: "error"
            });
          }
        });

      bindClickOnce("[data-product-soldout]", "ProductSoldOut", async (button) => {
          const productId = button.dataset.productSoldout;
          if (deps.confirmAction && !deps.confirmAction("Una uhakika bidhaa hii imeisha na unataka kuiweka sold out?")) {
            return;
          }
          try {
            await deps.dataLayer.updateProductAvailability(productId, { availability: "sold_out" });
            deps.refreshProductsFromStore();
            deps.reportEvent?.("info", "product_marked_sold_out", "Seller marked product as sold out.", {
              productId
            });
            deps.showInAppNotification?.({
              title: "Product updated",
              body: "Bidhaa imewekwa sold out.",
              variant: "success"
            });
            deps.renderProfile();
          } catch (error) {
            deps.captureError?.("product_sold_out_failed", error, {
              productId
            });
            deps.showInAppNotification?.({
              title: "Sold out update failed",
              body: error.message || "Imeshindikana kuweka sold out.",
              variant: "error"
            });
          }
        });

      bindClickOnce("[data-conversation-user]", "ConversationUser", async (button) => {
          const nextChatContext = {
            withUser: button.dataset.conversationUser,
            productId: button.dataset.conversationProduct || "",
            productName: button.dataset.conversationName || ""
          };
          deps.setActiveChatContext(nextChatContext);
          deps.setProfileMessagesMode?.("detail");
          deps.setProfileHasSelection?.(true);
          deps.setCurrentMessageDraft(deps.loadStoredChatDraft?.(nextChatContext) || "");
          try {
            await deps.markActiveConversationRead();
          } catch (error) {
            // Ignore passive read sync failures on thread switch.
          }
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        });

      bindClickOnce("[data-message-list-back]", "MessageListBack", () => {
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.replaceMessagesPanel(scope);
      });

      bindClickOnce("[data-close-profile-messages]", "CloseProfileMessages", () => {
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.setActiveChatContext?.(null);
        deps.setActiveProfileSection?.("profile-products-panel");
        deps.setPendingProfileSection?.("profile-products-panel");
        deps.renderProfile?.();
      });

      bindMessageLongPress(scope, () => deps.replaceMessagesPanel(scope));

      bindClickOnce("[data-refresh-messages]", "RefreshMessages", async () => {
        try {
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("messages_manual_refresh_failed", error, {
            user: deps.getCurrentUser?.() || ""
          });
          deps.showInAppNotification?.({
            title: "Refresh failed",
            body: error.message || "Imeshindikana ku-refresh messages.",
            variant: "warning"
          });
        }
      });

      bindClickOnce("[data-share-my-phone]", "ShareMyPhone", async () => {
        try {
          await sharePhoneWithActiveChat();
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("profile_phone_share_failed", error, {
            receiverId: deps.getActiveChatContext?.()?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: "Sharing failed",
            body: error.message || "Imeshindikana kushare namba yako kwa sasa.",
            variant: "error"
          });
        }
      });

      bindClickOnce("[data-notification-id]", "NotificationRead", async (button) => {
          try {
            await deps.dataLayer.markNotificationRead(button.dataset.notificationId);
            await deps.refreshNotificationsState();
            document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
            bindMessageActions(scope);
          } catch (error) {
            deps.captureError?.("notification_read_failed", error, {
              notificationId: button.dataset.notificationId
            });
            deps.showInAppNotification?.({
              title: "Notification failed",
              body: error.message || "Imeshindikana kufungua notification.",
              variant: "error"
            });
          }
        });

      bindSubmitOnce("#message-compose-form", "MessageComposeForm", async (event) => {
        event.preventDefault();
        const messageInput = document.getElementById("message-compose-input");
        const message = messageInput?.value.trim() || "";
        const activeChatContext = deps.getActiveChatContext();
        if (!activeChatContext || !message) {
          return;
        }
        if (navigator.onLine === false) {
          deps.showInAppNotification?.({
            title: "Uko offline",
            body: "Ujumbe umehifadhiwa kama draft. Unganisha internet kisha utume tena.",
            variant: "warning"
          });
          return;
        }

        try {
          await deps.dataLayer.sendMessage({
            receiverId: activeChatContext.withUser,
            productId: activeChatContext.productId || "",
            productName: activeChatContext.productName || "",
            message
          });
          if (messageInput) {
            messageInput.value = "";
          }
          deps.setCurrentMessageDraft("");
          deps.setOpenEmojiScope("");
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          deps.maybePromptNotificationPermission?.("message");
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("profile_message_send_failed", error, {
            receiverId: activeChatContext?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: "Message failed",
            body: error.message || "Imeshindikana kutuma ujumbe.",
            variant: "error"
          });
        }
      });

      bindInputOnce("#message-compose-input", "MessageComposeInput", (event) => {
        deps.setCurrentMessageDraft(event.target.value || "");
      });

      bindClickOnce("[data-emoji-toggle]", "EmojiToggle", (button) => {
          const scopeId = button.dataset.emojiToggle || "";
          deps.setOpenEmojiScope(deps.getOpenEmojiScope() === scopeId ? "" : scopeId);
          deps.replaceMessagesPanel(scope);
      });

      bindClickOnce("[data-insert-emoji]", "InsertEmoji", (button) => {
          deps.setCurrentMessageDraft(`${deps.getCurrentMessageDraft() || ""}${button.dataset.insertEmoji || ""}`);
          deps.setOpenEmojiScope("");
          deps.replaceMessagesPanel(scope);
      });
    }

    return {
      bindMessageActions,
      closeContextChatModal,
      bindContextChatModalActions,
      replaceContextChatModal,
      openContextChatModal,
      openProductChat,
      openOwnProductMessages
    };
  }

  window.WingaModules.chat.createChatControllerModule = createChatControllerModule;
})();


// src/admin/ui.js
(() => {
  function createAdminUiModule(deps) {
    function createAnalyticsCard(label, value) {
      const card = deps.createElement("div", { className: "analytics-card" });
      card.append(
        deps.createElement("span", { textContent: label }),
        deps.createElement("strong", { textContent: value })
      );
      return card;
    }

    function createAnalyticsListItem(title, body) {
      const item = deps.createElement("div", { className: "analytics-list-item" });
      item.append(
        deps.createElement("strong", { textContent: title }),
        deps.createElement("p", { className: "product-meta", textContent: body })
      );
      return item;
    }

    function renderAnalyticsPanel(data, heading, subtitle) {
      const panel = deps.getAnalyticsPanel();
      if (!panel) {
        return;
      }

      const nodes = [
        deps.createSectionHeading({
          eyebrow: "Analytics",
          title: heading || "",
          meta: subtitle || ""
        })
      ];

      if (!data) {
        nodes.push(deps.createEmptyState("Analytics hazijapatikana kwa sasa."));
        panel.replaceChildren(...nodes);
        return;
      }

      const grid = deps.createElement("div", { className: "analytics-grid" });
      grid.append(
        createAnalyticsCard("Bidhaa zote", String(data.totalProducts || 0)),
        createAnalyticsCard("Approved", String(data.approvedProducts || 0)),
        createAnalyticsCard("Pending", String(data.pendingProducts || 0)),
        createAnalyticsCard("Rejected", String(data.rejectedProducts || 0)),
        createAnalyticsCard("Views", deps.formatNumber(data.totalViews || 0)),
        createAnalyticsCard("Likes", deps.formatNumber(data.totalLikes || 0))
      );

      const list = deps.createElement("div", { className: "analytics-list" });
      list.appendChild(createAnalyticsListItem(
        "Top Categories",
        (data.topCategories || []).map((item) => `${deps.getCategoryLabel(item.category)} (${item.count})`).join(" | ") || "Hakuna data ya kutosha."
      ));
      list.appendChild(createAnalyticsListItem(
        "Recent Products",
        (data.recentProducts || []).map((item) => `${item.name} - ${deps.getStatusLabel(item.status)}`).join(" | ") || "Hakuna bidhaa za kuonyesha."
      ));
      if (typeof data.usersCount === "number" && deps.isAdminUser()) {
        list.appendChild(createAnalyticsListItem(
          "Users",
          `${deps.formatNumber(data.usersCount)} users wamesajiliwa.`
        ));
      }

      panel.replaceChildren(...nodes, grid, list);
    }

    return { renderAnalyticsPanel };
  }

  window.WingaModules.admin.createAdminUiModule = createAdminUiModule;
})();


// src/admin/controller.js
(() => {
  function createAdminControllerModule(deps) {
    let renderSequence = 0;
    let latestUsers = [];
    let investigationState = {
      username: "",
      user: null,
      reason: "",
      loading: false,
      detail: null,
      error: ""
    };

    function mapStatusClass(status = "") {
      const normalized = String(status || "").toLowerCase();
      if (normalized === "approved" || normalized === "active" || normalized === "verified" || normalized === "paid" || normalized === "resolved") {
        return "approved";
      }
      if (normalized === "rejected" || normalized === "banned" || normalized === "failed" || normalized === "disabled") {
        return "rejected";
      }
      if (normalized === "sold_out") {
        return "sold_out";
      }
      return "pending";
    }

    function createMetaCopy(text) {
      return deps.createElement("p", {
        className: "product-meta",
        textContent: text
      });
    }

    function createActionButton(label, dataset = {}, className = "button") {
      const button = deps.createElement("button", {
        className,
        textContent: label,
        attributes: { type: "button" }
      });
      Object.entries(dataset).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          button.dataset[key] = String(value);
        }
      });
      return button;
    }

    function buildProductDeepLink(productId) {
      const path = typeof deps.getProductDetailPath === "function"
        ? deps.getProductDetailPath(productId)
        : `/product/${encodeURIComponent(String(productId || "").trim())}`;
      return `${window.location.origin}${path}`;
    }

    function createDeepLinkRow(product) {
      if (!deps.isAdminUser?.()) {
        return null;
      }
      const deepLinkRow = deps.createElement("div", { className: "admin-deep-link-row" });
      const deepLinkValue = deps.createElement("code", {
        className: "admin-deep-link-value",
        textContent: buildProductDeepLink(product.id)
      });
      const copyButton = createActionButton("Copy Deep Link", {
        adminDeepLinkCopy: product.id
      }, "button action-btn action-btn-secondary");
      deepLinkRow.append(
        deps.createElement("strong", { textContent: "Deep Link" }),
        deepLinkValue,
        copyButton
      );
      return deepLinkRow;
    }

    function createDeepLinkCard(product) {
      const card = deps.createElement("article", {
        className: "moderation-card admin-deep-link-card",
        attributes: {
          "data-admin-deep-link-card": product.id
        }
      });
      const deepLink = buildProductDeepLink(product.id);
      card.append(
        deps.createElement("strong", { textContent: product.name || product.id }),
        createMetaCopy(`${product.shop || product.uploadedBy || "-"} | ${deps.getCategoryLabel?.(product.category) || product.category || "-"}`),
        deps.createElement("code", {
          className: "admin-deep-link-value",
          textContent: deepLink
        })
      );
      const actions = deps.createElement("div", { className: "moderation-actions admin-deep-link-actions" });
      actions.append(
        createActionButton("Copy Deep Link", {
          adminDeepLinkCopy: product.id
        }, "button action-btn action-btn-secondary"),
        deps.createElement("a", {
          className: "button action-btn",
          textContent: "Open Link",
          attributes: {
            href: deepLink,
            target: "_blank",
            rel: "noopener noreferrer"
          }
        })
      );
      card.appendChild(actions);
      return card;
    }

    function createSection(title, meta = "", bodyNode = null) {
      const section = deps.createElement("section", {
        className: "panel",
        attributes: {
          "data-admin-section": title
        }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Admin",
        title,
        meta
      }));
      if (bodyNode) {
        section.appendChild(bodyNode);
      }
      return section;
    }

    function createLoadIssueState(message) {
      const wrapper = deps.createElement("div", { className: "empty-state" });
      wrapper.append(
        deps.createElement("strong", { textContent: "Section unavailable" }),
        deps.createElement("p", {
          className: "empty-copy",
          textContent: message || "Section hii haikuweza kupakia kwa sasa. Jaribu tena."
        }),
        createActionButton("Retry", {
          adminRefresh: "true"
        }, "button")
      );
      return wrapper;
    }

    function createAdminToolbar(state) {
      const toolbar = deps.createElement("section", { className: "panel" });
      const row = deps.createElement("div", { className: "section-heading" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: "Admin" }),
        deps.createElement("h3", { textContent: "Admin Console" }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: state.hasAnyLoadError
            ? "Baadhi ya admin data imekosa kupakia. Unaweza kuretry bila kuondoka kwenye panel."
            : "Usimamizi wa marketplace, moderation, na ops signals."
        })
      );
      row.appendChild(copy);
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.appendChild(createActionButton("Refresh Admin", {
        adminRefresh: "true"
      }));
      row.appendChild(actions);
      toolbar.appendChild(row);
      return toolbar;
    }

    function createVerificationPreview(user) {
      const preview = deps.createElement("div", { className: "admin-verification-preview" });
      const images = [
        { src: user.identityDocumentImage, alt: `${user.username} identity document` }
      ].filter((item) => item.src);
      if (!images.length) {
        return null;
      }
      images.forEach((item) => {
        preview.appendChild(deps.createResponsiveImage({
          src: item.src,
          alt: item.alt,
          fallbackSrc: deps.getImageFallbackDataUri("ID"),
          className: "admin-verification-image"
        }));
      });
      return preview;
    }

    function createUserActionPayload(action, note) {
      switch (action) {
        case "verify":
          return {
            verificationStatus: "verified",
            verifiedSeller: true,
            note
          };
        case "rejectVerification":
          return {
            verificationStatus: "rejected",
            verifiedSeller: false,
            note
          };
        case "activate":
          return {
            status: "active",
            reason: "staff_restore",
            note
          };
        case "suspend":
          return {
            status: "suspended",
            reason: "staff_suspend",
            note
          };
        case "ban":
          return {
            status: "banned",
            reason: "staff_ban",
            note
          };
        default:
          return null;
      }
    }

    function confirmUserAction(username, action) {
      if (!deps.confirmAction) {
        return true;
      }
      if (action === "verify") {
        return deps.confirmAction(`Una uhakika unataka kuthibitisha seller ${username}?`);
      }
      if (action === "activate") {
        return deps.confirmAction(`Una uhakika unataka kurudisha access ya user ${username}?`);
      }
      if (action === "rejectVerification") {
        return deps.confirmAction(`Una uhakika unataka kukataa verification ya ${username}?`);
      }
      if (action === "suspend") {
        return deps.confirmAction(`Una uhakika unataka kususpend user ${username}?`);
      }
      if (action === "ban") {
        return deps.confirmAction(`Una uhakika unataka kuban user ${username}? Hii ni hatua nzito.`);
      }
      return true;
    }

    function formatAuditTime(value) {
      if (!value) {
        return "-";
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return String(value);
      }
      try {
        return new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(parsed);
      } catch (error) {
        return parsed.toISOString();
      }
    }

    function ensureInvestigationModal() {
      let root = document.getElementById("admin-investigation-modal");
      if (root) {
        return root;
      }

      root = deps.createElement("div", {
        attributes: {
          id: "admin-investigation-modal",
          hidden: "true"
        }
      });
      root.innerHTML = `
        <div class="admin-investigation-backdrop" data-close-admin-investigation="true"></div>
        <div class="admin-investigation-dialog panel" role="dialog" aria-modal="true" aria-labelledby="admin-investigation-title">
          <button class="admin-investigation-close" type="button" aria-label="Close fraud review" data-close-admin-investigation="true">&times;</button>
          <div class="admin-investigation-body" data-admin-investigation-body="true"></div>
        </div>
      `;

      root.addEventListener("click", (event) => {
        const submitButton = event.target.closest("[data-admin-investigation-submit]");
        if (submitButton) {
          handleInvestigationSubmit(submitButton).catch((error) => {
            investigationState = {
              ...investigationState,
              loading: false,
              error: error.message || "Fraud review haikufunguka."
            };
            renderInvestigationModal();
          });
          return;
        }
        if (event.target.closest("[data-close-admin-investigation='true']")) {
          closeInvestigationModal();
        }
      });
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeInvestigationModal();
        }
      });

      document.body.appendChild(root);
      return root;
    }

    function closeInvestigationModal() {
      const root = document.getElementById("admin-investigation-modal");
      if (!root) {
        return;
      }
      root.hidden = true;
      root.classList.remove("open");
      investigationState = {
        username: "",
        user: null,
        reason: "",
        loading: false,
        detail: null,
        error: ""
      };
      root.querySelector("[data-admin-investigation-body='true']")?.replaceChildren();
    }

    function createInvestigationMetric(label, value) {
      const card = deps.createElement("div", { className: "analytics-card admin-investigation-metric" });
      card.append(
        deps.createElement("span", { textContent: label }),
        deps.createElement("strong", { textContent: String(value ?? 0) })
      );
      return card;
    }

    function createInvestigationTimeline(title, items, formatter, emptyCopy) {
      const section = deps.createElement("section", { className: "admin-investigation-section" });
      section.appendChild(deps.createElement("h4", {
        className: "admin-investigation-section-title",
        textContent: title
      }));
      const list = deps.createElement("div", { className: "analytics-list" });
      if (!items.length) {
        list.appendChild(deps.createEmptyState(emptyCopy));
      } else {
        items.forEach((item) => {
          list.appendChild(deps.createElement("div", {
            className: "analytics-list-item",
            textContent: formatter(item)
          }));
        });
      }
      section.appendChild(list);
      return section;
    }

    function renderInvestigationModal() {
      const root = ensureInvestigationModal();
      const body = root.querySelector("[data-admin-investigation-body='true']");
      if (!body || !investigationState.user) {
        return;
      }

      const user = investigationState.user;
      const summaryCards = deps.createElement("div", { className: "analytics-grid admin-investigation-metrics" });
      const detail = investigationState.detail;
      const summary = detail?.accountActivitySummary || {};
      summaryCards.append(
        createInvestigationMetric("Products", summary.productCount || user.productCount || 0),
        createInvestigationMetric("Open reports", summary.openReportsCount || user.openReportsCount || 0),
        createInvestigationMetric("Active sessions", summary.activeSessionCount || user.activeSessionCount || 0),
        createInvestigationMetric("Filed reports", summary.reportsFiledCount || user.reportsFiledCount || 0)
      );

      const header = deps.createElement("div", { className: "admin-investigation-header" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: "Fraud Review" }),
        deps.createElement("h3", {
          attributes: { id: "admin-investigation-title" },
          textContent: user.fullName || user.username
        }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: `@${user.username} | ${deps.getRoleLabel?.(user.role) || user.role}`
        })
      );
      const statusGroup = deps.createElement("div", { className: "trust-badges" });
      statusGroup.appendChild(deps.createStatusPill(user.status || "active", mapStatusClass(user.status)));
      statusGroup.appendChild(deps.createStatusPill(
        (detail?.identityVerificationStatus || user.verificationStatus || (user.verifiedSeller ? "verified" : "not_verified")).replaceAll("_", " "),
        mapStatusClass(detail?.identityVerificationStatus || user.verificationStatus || "")
      ));
      if ((detail?.suspiciousActivityIndicators || []).length || Number(user.suspiciousSignalCount || 0) > 0) {
        statusGroup.appendChild(deps.createStatusPill("Suspicious Activity", "pending"));
      }
      if ((summary.openReportsCount || user.openReportsCount || 0) > 0) {
        statusGroup.appendChild(deps.createStatusPill("Reported", "rejected"));
      }
      header.append(copy, statusGroup);

      const reasonField = deps.createElement("textarea", {
        attributes: {
          "data-admin-investigation-reason": "true",
          placeholder: "Eleza sababu ya kufungua fraud review hii"
        }
      });
      reasonField.value = investigationState.reason || "";

      const reasonActions = deps.createElement("div", { className: "moderation-actions" });
      const loadButton = createActionButton(
        investigationState.loading ? "Inafungua..." : "Open Fraud Review",
        { adminInvestigationSubmit: user.username },
        "button"
      );
      if (investigationState.loading) {
        loadButton.setAttribute("disabled", "true");
        reasonField.setAttribute("disabled", "true");
      }
      reasonActions.append(
        loadButton,
        createActionButton("Close", {
          closeAdminInvestigation: "true"
        }, "button button-secondary")
      );

      const reasonPanel = deps.createElement("section", { className: "admin-investigation-section" });
      reasonPanel.append(
        deps.createElement("p", {
          className: "meta-copy",
          textContent: "Enter a reason before loading sensitive fraud-review details. Every access is audited."
        }),
        reasonField,
        reasonActions
      );

      const nodes = [header, summaryCards, reasonPanel];
      if (investigationState.error) {
        nodes.push(deps.createElement("p", {
          className: "empty-copy admin-investigation-error",
          textContent: investigationState.error
        }));
      }

      if (detail) {
        const policy = deps.createElement("div", { className: "admin-investigation-policy panel" });
        policy.append(
          deps.createElement("strong", { textContent: "Message Evidence Access" }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: detail.fraudReview?.policy || "Direct private messages are restricted."
          }),
          createMetaCopy(`Reported conversation evidence: ${detail.fraudReview?.reportedConversationEvidenceCount ?? 0}`)
        );
        nodes.push(policy);

        if (Array.isArray(detail.suspiciousActivityIndicators) && detail.suspiciousActivityIndicators.length) {
          const indicators = deps.createElement("div", { className: "admin-investigation-indicators" });
          detail.suspiciousActivityIndicators.forEach((indicator) => {
            const pill = deps.createElement("article", { className: "moderation-card admin-investigation-indicator" });
            pill.append(
              deps.createStatusPill(indicator.label || "Fraud Review", mapStatusClass(indicator.severity || "pending")),
              createMetaCopy(indicator.detail || "")
            );
            indicators.appendChild(pill);
          });
          nodes.push(createSection("Suspicious Activity", "Signals zinazohitaji fraud review ya karibu.", indicators));
        }

        nodes.push(createInvestigationTimeline(
          "Login & Account Activity",
          detail.loginActivity || [],
          (item) => `${formatAuditTime(item.time)} | ${item.event || "-"} | ${item.reason || item.statusCode || "-"}`,
          "Hakuna login history ya karibu."
        ));
        nodes.push(createInvestigationTimeline(
          "Recent Audit Trail",
          detail.recentActivity || [],
          (item) => `${formatAuditTime(item.time)} | ${item.event || "-"} | ${item.reason || item.path || "-"}`,
          "Hakuna audit trail ya karibu."
        ));
        nodes.push(createInvestigationTimeline(
          "Reports & Complaints",
          detail.reports || [],
          (item) => `${formatAuditTime(item.createdAt)} | ${item.reason || "-"} | ${item.status || "open"} | ${item.targetProductId || item.targetType || "-"}`,
          "Hakuna reports zinazohusiana na user huyu."
        ));
        nodes.push(createInvestigationTimeline(
          "Active Sessions",
          detail.activeSessions || [],
          (item) => `${formatAuditTime(item.createdAt)} | expires ${formatAuditTime(item.expiresAt)} | token ••••${item.tokenLast4 || ""}`,
          "Hakuna active sessions kwa sasa."
        ));
      }

      body.replaceChildren(...nodes);
      root.hidden = false;
      root.classList.add("open");
      root.querySelector("[data-admin-investigation-reason='true']")?.focus();
    }

    function openInvestigationModal(username) {
      const user = latestUsers.find((item) => item.username === username);
      if (!deps.isAdminUser?.() || !user) {
        return;
      }
      investigationState = {
        username,
        user,
        reason: "",
        loading: false,
        detail: null,
        error: ""
      };
      renderInvestigationModal();
    }

    function createUserCard(user) {
      const card = deps.createElement("article", {
        className: "admin-user-card",
        attributes: {
          "data-admin-user-card": user.username
        }
      });
      if (deps.isAdminUser?.()) {
        card.classList.add("admin-user-card-clickable");
        card.dataset.adminInvestigateUsername = user.username;
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Open fraud review for ${user.fullName || user.username}`);
      }
      const headerRow = deps.createElement("div", { className: "admin-user-row" });
      const verificationPreview = createVerificationPreview(user);
      const left = deps.createElement("div");
      left.append(
        deps.createElement("strong", { textContent: user.fullName || user.username }),
        createMetaCopy(`@${user.username} | ${deps.getRoleLabel?.(user.role) || user.role}`)
      );
      const statusGroup = deps.createElement("div", { className: "trust-badges" });
      statusGroup.appendChild(deps.createStatusPill(user.status || "active", mapStatusClass(user.status)));
      if (user.role === "seller") {
        statusGroup.appendChild(deps.createStatusPill(user.verificationStatus || "pending", mapStatusClass(user.verificationStatus)));
      }
      if (Number(user.suspiciousSignalCount || 0) > 0) {
        statusGroup.appendChild(deps.createStatusPill("Suspicious Activity", "pending"));
      }
      headerRow.append(left, statusGroup);

      const moderationNote = deps.createElement("textarea", {
        attributes: {
          "data-admin-user-note": user.username,
          placeholder: "Note ya moderation au verification"
        }
      });
      moderationNote.value = user.moderationNote || "";

      const actions = deps.createElement("div", { className: "moderation-actions" });
      const canReviewVerification = user.role === "seller" && user.username !== "admin";
      if (canReviewVerification && user.verificationStatus !== "verified") {
        actions.appendChild(createActionButton("Thibitisha Muuzaji", {
          adminUserAction: "verify",
          adminUsername: user.username
        }));
      }
      if (canReviewVerification && user.verificationStatus !== "rejected") {
        actions.appendChild(createActionButton("Reject Verification", {
          adminUserAction: "rejectVerification",
          adminUsername: user.username
        }));
      }
      if (deps.isAdminUser?.() && user.username !== "admin") {
        if (user.status !== "active") {
          actions.appendChild(createActionButton("Restore", {
            adminUserAction: "activate",
            adminUsername: user.username
          }));
        }
        if (user.status !== "suspended") {
          actions.appendChild(createActionButton("Suspend", {
            adminUserAction: "suspend",
            adminUsername: user.username
          }));
        }
        if (user.status !== "banned") {
          actions.appendChild(createActionButton("Ban", {
            adminUserAction: "ban",
            adminUsername: user.username
          }));
        }
      }

      card.append(
        headerRow,
        createMetaCopy(`Phone: ${user.phoneNumber || "-"}`),
        createMetaCopy(`Category: ${deps.getCategoryLabel?.(user.primaryCategory) || user.primaryCategory || "-"}`),
        createMetaCopy(`ID: ${user.nationalIdMasked || "-"}`),
        createMetaCopy(`Products: ${user.productCount || 0} | Open reports: ${user.openReportsCount || 0} | Active sessions: ${user.activeSessionCount || 0}`),
        ...(deps.isAdminUser?.() ? [createMetaCopy("Click card to open fraud review. Access is audited.")] : []),
        ...(user.moderatedBy ? [createMetaCopy(`Moderated by ${user.moderatedBy}`)] : []),
        ...(verificationPreview ? [verificationPreview] : []),
        moderationNote
      );
      if (actions.childNodes.length) {
        card.appendChild(actions);
      }
      return card;
    }

    function createProductCard(product) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: {
          "data-admin-product-card": product.id
        }
      });
      const safeImage = deps.sanitizeImageSource(product.image || (product.images || [])[0], deps.getImageFallbackDataUri("W"));
      const noteInput = deps.createElement("textarea", {
        attributes: {
          "data-admin-product-note": product.id,
          placeholder: "Andika moderation note"
        }
      });
      noteInput.value = product.moderationNote || "";

      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.append(
        createActionButton("Approve", {
          adminProductAction: "approved",
          productId: product.id
        }),
        createActionButton("Reject", {
          adminProductAction: "rejected",
          productId: product.id
        })
      );

      const deepLinkRow = createDeepLinkRow(product);

      card.append(
        deps.createElement("strong", { textContent: product.name }),
        createMetaCopy(`${product.shop || product.uploadedBy} | ${deps.getCategoryLabel?.(product.category) || product.category}`),
        createMetaCopy(`Muuzaji: ${product.uploadedBy || "-"}`),
        createMetaCopy(`Price: ${deps.formatProductPrice(product.price)}`),
        deps.createStatusPill(product.status || "pending", mapStatusClass(product.status))
      );
      if (deepLinkRow) {
        card.appendChild(deepLinkRow);
      }
      if (safeImage) {
        card.appendChild(deps.createResponsiveImage({
          src: safeImage,
          alt: product.name,
          fallbackSrc: deps.getImageFallbackDataUri("W"),
          className: "admin-verification-image"
        }));
      }
      card.append(noteInput, actions);
      return card;
    }

    function createReportCard(report) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: {
          "data-admin-report-card": report.id
        }
      });
      const noteInput = deps.createElement("textarea", {
        attributes: {
          "data-admin-report-note": report.id,
          placeholder: "Andika review note"
        }
      });
      noteInput.value = report.reviewNote || "";
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.append(
        createActionButton("Mark Reviewed", {
          adminReportAction: "reviewed",
          reportId: report.id
        }),
        createActionButton("Resolve", {
          adminReportAction: "resolved",
          reportId: report.id
        })
      );

      card.append(
        deps.createElement("strong", { textContent: `${report.targetType === "user" ? "User Report" : "Product Report"}: ${report.reason || "Open report"}` }),
        createMetaCopy(`Reporter: ${report.reporterUserId || "-"}`),
        createMetaCopy(`Target: ${report.targetUserId || report.targetProductId || "-"}`),
        createMetaCopy(report.description || "Hakuna maelezo ya ziada."),
        deps.createStatusPill(report.status || "open", mapStatusClass(report.status)),
        noteInput,
        actions
      );
      return card;
    }

    function createPromotionCard(promotion) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: {
          "data-admin-promotion-card": promotion.id
        }
      });
      card.append(
        deps.createElement("strong", { textContent: `${deps.getPromotionLabel?.(promotion.type) || promotion.type} | ${promotion.productId}` }),
        createMetaCopy(`Muuzaji: ${promotion.sellerUsername || "-"}`),
        createMetaCopy(`Transaction: ${promotion.transactionReference || "-"}`),
        deps.createStatusPill(promotion.status || "pending", mapStatusClass(promotion.status))
      );
      if (deps.isAdminUser?.() && promotion.status !== "disabled" && promotion.status !== "expired") {
        const actions = deps.createElement("div", { className: "moderation-actions" });
        actions.appendChild(createActionButton("Disable Promotion", {
          adminPromotionDisable: promotion.id
        }));
        card.appendChild(actions);
      }
      return card;
    }

    function createSimpleListSection(title, meta, items, formatter) {
      const list = deps.createElement("div", { className: "analytics-list" });
      if (!items.length) {
        list.appendChild(deps.createEmptyState("Hakuna data ya kuonyesha kwa sasa."));
      } else {
        items.forEach((item) => {
          list.appendChild(deps.createElement("div", {
            className: "analytics-list-item",
            textContent: formatter(item)
          }));
        });
      }
      return createSection(title, meta, list);
    }

    function readScopedTextarea(scope, selector) {
      return scope?.querySelector(selector)?.value.trim() || "";
    }

    function toggleScopedBusyState(scope, isBusy) {
      scope?.querySelectorAll("button, textarea").forEach((element) => {
        if (isBusy) {
          element.setAttribute("disabled", "true");
          return;
        }
        element.removeAttribute("disabled");
      });
    }

    function createAdminBody(state) {
      const wrapper = deps.createElement("div", { className: "moderation-list" });
      wrapper.appendChild(createAdminToolbar(state));
      if (deps.isAdminUser?.()) {
        const deepLinkProducts = Array.isArray(state.pendingProducts) ? state.pendingProducts : [];
        const deepLinkBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.products) {
          deepLinkBody.appendChild(createLoadIssueState("Deep link products hazikupatikana kwa sasa."));
        } else if (!deepLinkProducts.length) {
          deepLinkBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending za deep link kwa sasa."));
        } else {
          deepLinkProducts.slice(0, 12).forEach((product) => deepLinkBody.appendChild(createDeepLinkCard(product)));
        }
        wrapper.appendChild(createSection("Product Deep Links", "Copy stable /product/:id links kwa ads na sharing.", deepLinkBody));
      }

      const usersSectionBody = deps.createElement("div", { className: "admin-users-list" });
      const actionableUsers = state.users.filter((user) => user.username !== "admin");
      if (state.loadErrors.users) {
        usersSectionBody.appendChild(createLoadIssueState("User moderation data haikupatikana kwa sasa."));
      } else if (!actionableUsers.length) {
        usersSectionBody.appendChild(deps.createEmptyState("Hakuna users wa ku-review kwa sasa."));
      } else {
        actionableUsers.forEach((user) => usersSectionBody.appendChild(createUserCard(user)));
      }
      wrapper.appendChild(createSection("User Review & Access", "Verification, suspension, na moderation ya users.", usersSectionBody));

      const pendingProductsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.products) {
        pendingProductsBody.appendChild(createLoadIssueState("Pending products hazikupatikana kwa sasa."));
      } else if (!state.pendingProducts.length) {
        pendingProductsBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending kwa sasa."));
      } else {
        state.pendingProducts.forEach((product) => pendingProductsBody.appendChild(createProductCard(product)));
      }
      wrapper.appendChild(createSection("Pending Products", "Approve au reject catalog entries zinazongoja review.", pendingProductsBody));

      const reportsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.reports) {
        reportsBody.appendChild(createLoadIssueState("Reports hazikupatikana kwa sasa."));
      } else if (!state.openReports.length) {
        reportsBody.appendChild(deps.createEmptyState("Hakuna reports wazi kwa sasa."));
      } else {
        state.openReports.forEach((report) => reportsBody.appendChild(createReportCard(report)));
      }
      wrapper.appendChild(createSection("Open Reports", "Chukua hatua kwenye reports za user au product.", reportsBody));

      if (deps.isAdminUser?.()) {
        const promotionsBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.promotions) {
          promotionsBody.appendChild(createLoadIssueState("Promotions data haikupatikana kwa sasa."));
        } else if (!state.promotions.length) {
          promotionsBody.appendChild(deps.createEmptyState("Hakuna promotions za kusimamia."));
        } else {
          state.promotions.forEach((promotion) => promotionsBody.appendChild(createPromotionCard(promotion)));
        }
        wrapper.appendChild(createSection("Promotions", "Admin-only promotion controls.", promotionsBody));

        wrapper.appendChild(state.loadErrors.orders
          ? createSection("Recent Orders", "Mwonekano wa orders za marketplace.", createLoadIssueState("Orders data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Orders",
            "Mwonekano wa orders za marketplace.",
            state.orders.slice(0, 6),
            (order) => `${order.id} | ${order.buyerUsername || "-"} -> ${order.sellerUsername || "-"} | ${order.status || "-"}`
          ));

        wrapper.appendChild(state.loadErrors.payments
          ? createSection("Recent Payments", "Mwonekano wa payments za marketplace.", createLoadIssueState("Payments data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Payments",
            "Mwonekano wa payments za marketplace.",
            state.payments.slice(0, 6),
            (payment) => `${payment.orderId || payment.id} | ${payment.paymentStatus || "-"} | ${payment.transactionReference || "-"}`
          ));

        wrapper.appendChild(state.loadErrors.moderationActions
          ? createSection("Moderation Audit", "Actions za staff zilizorekodiwa hivi karibuni.", createLoadIssueState("Moderation audit haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Moderation Audit",
            "Actions za staff zilizorekodiwa hivi karibuni.",
            state.moderationActions.slice(0, 8),
            (action) => `${action.actionType || "action"} | ${action.targetUserId || action.targetProductId || "-"} | ${action.adminUsername || "-"}`
          ));

        if (state.loadErrors.opsSummary) {
          wrapper.appendChild(createSection("Ops Signals", "Runtime diagnostics za admin.", createLoadIssueState("Ops summary haikupatikana kwa sasa.")));
        } else if (state.opsSummary) {
          wrapper.appendChild(createSimpleListSection(
            "Ops Signals",
            `Storage: ${state.opsSummary.storageMode || "-"} | Backups: ${state.opsSummary.backupStatus?.fileCount ?? 0} | Warnings: ${(state.opsSummary.configWarnings || []).length} | Auth failures: ${state.opsSummary.counts?.authFailures24h ?? 0} | Alerts: ${state.opsSummary.counts?.alertCandidates24h ?? 0} | Denied: ${state.opsSummary.counts?.deniedActions24h ?? 0}`,
            [
              ...(state.opsSummary.backupStatus?.note ? [{ type: "backup", value: `Backup: ${state.opsSummary.backupStatus.note}` }] : []),
              ...((state.opsSummary.configWarnings || []).map((warning) => ({ type: "warning", value: warning }))),
              ...((state.opsSummary.recentAlerts || []).slice(0, 4).map((entry) => ({
                type: "alert",
                value: `Alert ${entry.alertSeverity || "high"} | ${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              }))),
              ...((state.opsSummary.recentFailures || []).slice(0, 6).map((entry) => ({
                type: "failure",
                value: `${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              })))
            ],
            (item) => item.value
          ));
        }
      }

      return wrapper;
    }

    async function handleUserAction(button) {
      const username = button.dataset.adminUsername || "";
      const action = button.dataset.adminUserAction || "";
      const note = readScopedTextarea(button.closest(".admin-user-card"), `[data-admin-user-note="${username}"]`);
      const payload = createUserActionPayload(action, note);
      if (!username || !payload) {
        return;
      }
      if (!confirmUserAction(username, action)) {
        return;
      }
      await deps.dataLayer.moderateUser(username, payload);
      deps.refreshProductsFromStore?.();
      deps.showInAppNotification?.({
        title: "User updated",
        body: `User ${username} amehifadhiwa kwenye moderation.`,
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_user_moderated", "Staff updated a user moderation state.", {
        username,
        action
      });
      renderAdminView();
    }

    async function handleProductAction(button) {
      const productId = button.dataset.productId || "";
      const status = button.dataset.adminProductAction || "";
      const note = readScopedTextarea(button.closest(".moderation-card"), `[data-admin-product-note="${productId}"]`);
      if (!productId || !status) {
        return;
      }
      if (status === "rejected" && deps.confirmAction && !deps.confirmAction("Una uhakika unataka kukataa bidhaa hii?")) {
        return;
      }
      await deps.dataLayer.moderateProduct(productId, {
        status,
        moderationNote: note
      });
      deps.refreshProductsFromStore?.();
      deps.showInAppNotification?.({
        title: "Product updated",
        body: `Bidhaa ${status === "approved" ? "imekubaliwa" : "imekataliwa"} kwenye moderation.`,
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_product_moderated", "Staff moderated a product.", {
        productId,
        status
      });
      renderAdminView();
    }

    async function handleReportAction(button) {
      const reportId = button.dataset.reportId || "";
      const status = button.dataset.adminReportAction || "";
      const note = readScopedTextarea(button.closest(".moderation-card"), `[data-admin-report-note="${reportId}"]`);
      if (!reportId || !status) {
        return;
      }
      await deps.dataLayer.reviewReport(reportId, {
        status,
        reviewNote: note || (status === "resolved" ? "Resolved by staff." : "Reviewed by staff.")
      });
      deps.showInAppNotification?.({
        title: "Report updated",
        body: `Report imewekwa kwenye status ya ${status}.`,
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_report_reviewed", "Staff reviewed a report.", {
        reportId,
        status
      });
      renderAdminView();
    }

    async function handleDeepLinkCopy(button) {
      const productId = button.dataset.adminDeepLinkCopy || "";
      if (!productId) {
        return;
      }
      const deepLink = buildProductDeepLink(productId);
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(deepLink);
        } else {
          const fallback = deps.createElement("textarea", {
            attributes: {
              readonly: "true"
            }
          });
          fallback.value = deepLink;
          document.body.appendChild(fallback);
          fallback.select();
          document.execCommand?.("copy");
          fallback.remove();
        }
        deps.showInAppNotification?.({
          title: "Deep link copied",
          body: "Product deep link ime-copy tayari.",
          variant: "success"
        });
        deps.reportEvent?.("info", "admin_product_deep_link_copied", "Admin copied a product deep link.", {
          productId,
          deepLink
        });
      } catch (error) {
        deps.captureError?.("admin_product_deep_link_copy_failed", error, {
          productId
        });
        deps.showInAppNotification?.({
          title: "Copy failed",
          body: error.message || "Imeshindikana ku-copy deep link.",
          variant: "error"
        });
      }
    }

    async function handlePromotionDisable(button) {
      const promotionId = button.dataset.adminPromotionDisable || "";
      if (!promotionId) {
        return;
      }
      if (deps.confirmAction && !deps.confirmAction("Una uhakika unataka kuzima promotion hii?")) {
        return;
      }
      await deps.dataLayer.disablePromotion(promotionId);
      deps.showInAppNotification?.({
        title: "Promotion disabled",
        body: "Promotion imezimwa.",
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_promotion_disabled", "Admin disabled a promotion.", {
        promotionId
      });
      renderAdminView();
    }

    async function handleInvestigationSubmit(button) {
      const username = button.dataset.adminInvestigationSubmit || investigationState.username || "";
      const root = document.getElementById("admin-investigation-modal");
      const reason = root?.querySelector("[data-admin-investigation-reason='true']")?.value.trim() || "";
      if (!username) {
        return;
      }
      investigationState = {
        ...investigationState,
        username,
        reason,
        loading: true,
        error: ""
      };
      renderInvestigationModal();
      try {
        const detail = await deps.dataLayer.loadAdminUserInvestigation(username, { reason });
        investigationState = {
          ...investigationState,
          loading: false,
          detail,
          user: {
            ...investigationState.user,
            ...(detail?.profile || {})
          },
          error: ""
        };
        deps.reportEvent?.("info", "admin_user_investigation_opened", "Admin opened a fraud review investigation.", {
          username
        });
      } catch (error) {
        investigationState = {
          ...investigationState,
          loading: false,
          error: error.message || "Imeshindikana kufungua fraud review."
        };
      }
      renderInvestigationModal();
    }

    function bindAdminActions(panel) {
      panel.querySelectorAll("[data-admin-investigate-username]").forEach((card) => {
        const openCard = (event) => {
          if (event.target.closest("button, textarea, input, select, a, label")) {
            return;
          }
          openInvestigationModal(card.dataset.adminInvestigateUsername || "");
        };
        card.addEventListener("click", openCard);
        card.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && !event.target.closest("textarea, input, select")) {
            event.preventDefault();
            openInvestigationModal(card.dataset.adminInvestigateUsername || "");
          }
        });
      });

      panel.querySelectorAll("[data-admin-user-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-user-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleUserAction(button);
          } catch (error) {
            deps.captureError?.("admin_user_moderation_failed", error, {
              username: button.dataset.adminUsername || "",
              action: button.dataset.adminUserAction || ""
            });
            deps.showInAppNotification?.({
              title: "User update failed",
              body: error.message || "Imeshindikana kuhifadhi moderation ya user.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-product-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-product-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleProductAction(button);
          } catch (error) {
            deps.captureError?.("admin_product_moderation_failed", error, {
              productId: button.dataset.productId || "",
              status: button.dataset.adminProductAction || ""
            });
            deps.showInAppNotification?.({
              title: "Product moderation failed",
              body: error.message || "Imeshindikana kuhifadhi moderation ya bidhaa.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-report-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-report-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleReportAction(button);
          } catch (error) {
            deps.captureError?.("admin_report_review_failed", error, {
              reportId: button.dataset.reportId || "",
              status: button.dataset.adminReportAction || ""
            });
            deps.showInAppNotification?.({
              title: "Report update failed",
              body: error.message || "Imeshindikana kusasisha report.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-deep-link-copy]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-product-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleDeepLinkCopy(button);
          } catch (error) {
            deps.captureError?.("admin_product_deep_link_copy_failed", error, {
              productId: button.dataset.adminDeepLinkCopy || ""
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-promotion-disable]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-promotion-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handlePromotionDisable(button);
          } catch (error) {
            deps.captureError?.("admin_promotion_disable_failed", error, {
              promotionId: button.dataset.adminPromotionDisable || ""
            });
            deps.showInAppNotification?.({
              title: "Promotion update failed",
              body: error.message || "Imeshindikana kuzima promotion.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-refresh]").forEach((button) => {
        button.addEventListener("click", () => {
          renderAdminView();
        });
      });

    }

    function getSettledValue(result, fallback) {
      return result.status === "fulfilled" ? result.value : fallback;
    }

    function nextFrame() {
      return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }

    async function appendItemsInChunks(container, items, createItem, chunkSize = 16) {
      if (!container || !Array.isArray(items) || !items.length) {
        return;
      }
      for (let index = 0; index < items.length; index += chunkSize) {
        const fragment = document.createDocumentFragment();
        items.slice(index, index + chunkSize).forEach((item) => {
          fragment.appendChild(createItem(item));
        });
        container.appendChild(fragment);
        if (index + chunkSize < items.length) {
          await nextFrame();
        }
      }
    }

    async function createAdminBody(state) {
      const wrapper = deps.createElement("div", { className: "moderation-list" });
      wrapper.appendChild(createAdminToolbar(state));

      if (deps.isAdminUser?.()) {
        const deepLinkProducts = Array.isArray(state.pendingProducts) ? state.pendingProducts : [];
        const deepLinkBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.products) {
          deepLinkBody.appendChild(createLoadIssueState("Deep link products hazikupatikana kwa sasa."));
        } else if (!deepLinkProducts.length) {
          deepLinkBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending za deep link kwa sasa."));
        } else {
          await appendItemsInChunks(deepLinkBody, deepLinkProducts.slice(0, 12), (product) => createDeepLinkCard(product), 6);
        }
        wrapper.appendChild(createSection("Product Deep Links", "Copy stable /product/:id links kwa ads na sharing.", deepLinkBody));
        await nextFrame();
      }

      const usersSectionBody = deps.createElement("div", { className: "admin-users-list" });
      const actionableUsers = state.users.filter((user) => user.username !== "admin");
      if (state.loadErrors.users) {
        usersSectionBody.appendChild(createLoadIssueState("User moderation data haikupatikana kwa sasa."));
      } else if (!actionableUsers.length) {
        usersSectionBody.appendChild(deps.createEmptyState("Hakuna users wa ku-review kwa sasa."));
      } else {
        await appendItemsInChunks(usersSectionBody, actionableUsers, (user) => createUserCard(user), 12);
      }
      wrapper.appendChild(createSection("User Review & Access", "Verification, suspension, na moderation ya users.", usersSectionBody));
      await nextFrame();

      const pendingProductsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.products) {
        pendingProductsBody.appendChild(createLoadIssueState("Pending products hazikupatikana kwa sasa."));
      } else if (!state.pendingProducts.length) {
        pendingProductsBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending kwa sasa."));
      } else {
        await appendItemsInChunks(pendingProductsBody, state.pendingProducts, (product) => createProductCard(product), 10);
      }
      wrapper.appendChild(createSection("Pending Products", "Approve au reject catalog entries zinazongoja review.", pendingProductsBody));
      await nextFrame();

      const reportsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.reports) {
        reportsBody.appendChild(createLoadIssueState("Reports hazikupatikana kwa sasa."));
      } else if (!state.openReports.length) {
        reportsBody.appendChild(deps.createEmptyState("Hakuna reports wazi kwa sasa."));
      } else {
        await appendItemsInChunks(reportsBody, state.openReports, (report) => createReportCard(report), 10);
      }
      wrapper.appendChild(createSection("Open Reports", "Chukua hatua kwenye reports za user au product.", reportsBody));
      await nextFrame();

      if (deps.isAdminUser?.()) {
        const promotionsBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.promotions) {
          promotionsBody.appendChild(createLoadIssueState("Promotions data haikupatikana kwa sasa."));
        } else if (!state.promotions.length) {
          promotionsBody.appendChild(deps.createEmptyState("Hakuna promotions za kusimamia."));
        } else {
          await appendItemsInChunks(promotionsBody, state.promotions, (promotion) => createPromotionCard(promotion), 10);
        }
        wrapper.appendChild(createSection("Promotions", "Admin-only promotion controls.", promotionsBody));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.orders
          ? createSection("Recent Orders", "Mwonekano wa orders za marketplace.", createLoadIssueState("Orders data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Orders",
            "Mwonekano wa orders za marketplace.",
            state.orders.slice(0, 6),
            (order) => `${order.id} | ${order.buyerUsername || "-"} -> ${order.sellerUsername || "-"} | ${order.status || "-"}`
          ));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.payments
          ? createSection("Recent Payments", "Mwonekano wa payments za marketplace.", createLoadIssueState("Payments data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Payments",
            "Mwonekano wa payments za marketplace.",
            state.payments.slice(0, 6),
            (payment) => `${payment.orderId || payment.id} | ${payment.paymentStatus || "-"} | ${payment.transactionReference || "-"}`
          ));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.moderationActions
          ? createSection("Moderation Audit", "Actions za staff zilizorekodiwa hivi karibuni.", createLoadIssueState("Moderation audit haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Moderation Audit",
            "Actions za staff zilizorekodiwa hivi karibuni.",
            state.moderationActions.slice(0, 8),
            (action) => `${action.actionType || "action"} | ${action.targetUserId || action.targetProductId || "-"} | ${action.adminUsername || "-"}`
          ));
        await nextFrame();

        if (state.loadErrors.opsSummary) {
          wrapper.appendChild(createSection("Ops Signals", "Runtime diagnostics za admin.", createLoadIssueState("Ops summary haikupatikana kwa sasa.")));
        } else if (state.opsSummary) {
          wrapper.appendChild(createSimpleListSection(
            "Ops Signals",
            `Storage: ${state.opsSummary.storageMode || "-"} | Backups: ${state.opsSummary.backupStatus?.fileCount ?? 0} | Warnings: ${(state.opsSummary.configWarnings || []).length} | Auth failures: ${state.opsSummary.counts?.authFailures24h ?? 0} | Alerts: ${state.opsSummary.counts?.alertCandidates24h ?? 0} | Denied: ${state.opsSummary.counts?.deniedActions24h ?? 0}`,
            [
              ...(state.opsSummary.backupStatus?.note ? [{ type: "backup", value: `Backup: ${state.opsSummary.backupStatus.note}` }] : []),
              ...((state.opsSummary.configWarnings || []).map((warning) => ({ type: "warning", value: warning }))),
              ...((state.opsSummary.recentAlerts || []).slice(0, 4).map((entry) => ({
                type: "alert",
                value: `Alert ${entry.alertSeverity || "high"} | ${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              }))),
              ...((state.opsSummary.recentFailures || []).slice(0, 6).map((entry) => ({
                type: "failure",
                value: `${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              })))
            ],
            (item) => item.value
          ));
        }
      }

      return wrapper;
    }

    async function renderAdminView() {
      const panel = deps.getAdminPanel?.();
      if (!panel) {
        return;
      }
      closeInvestigationModal();

      const sequence = ++renderSequence;
      panel.replaceChildren(
        createSection("Admin Console", "Usimamizi wa marketplace, moderation, na analytics.", deps.createEmptyState("Inapakia admin tools..."))
      );
      deps.renderAnalyticsPanel?.(null, "Marketplace Overview", "Inapakia analytics...");

      const tasks = [
        deps.dataLayer.loadAnalytics(),
        deps.dataLayer.loadAdminUsers(),
        deps.dataLayer.loadAdminProducts("pending"),
        deps.dataLayer.loadAdminReports({ status: "open" })
      ];

      if (deps.isAdminUser?.()) {
        tasks.push(
          deps.dataLayer.loadAdminPromotions(),
          deps.dataLayer.loadAdminOrders({}),
          deps.dataLayer.loadAdminPayments({}),
          deps.dataLayer.loadModerationActions(),
          deps.dataLayer.loadAdminOpsSummary()
        );
      }

      const results = await Promise.allSettled(tasks);
      if (sequence !== renderSequence || deps.getCurrentView?.() !== "admin" || !deps.isStaffUser?.()) {
        return;
      }

      const analytics = getSettledValue(results[0], null);
      const users = getSettledValue(results[1], []);
      const pendingProducts = getSettledValue(results[2], []);
      const openReports = getSettledValue(results[3], []);
      const promotions = deps.isAdminUser?.() ? getSettledValue(results[4], []) : [];
      const orders = deps.isAdminUser?.() ? getSettledValue(results[5], []) : [];
      const payments = deps.isAdminUser?.() ? getSettledValue(results[6], []) : [];
      const moderationActions = deps.isAdminUser?.() ? getSettledValue(results[7], []) : [];
      const opsSummary = deps.isAdminUser?.() ? getSettledValue(results[8], null) : null;

      const failedLoads = ["analytics", "users", "products", "reports", "promotions", "orders", "payments", "moderationActions", "opsSummary"]
        .filter((_, index) => results[index] && results[index].status === "rejected");
      if (failedLoads.length) {
        deps.captureError?.("admin_surface_partial_load_failed", new Error("Some admin datasets failed to load."), {
          failedLoads: failedLoads.join(",")
        });
        deps.showInAppNotification?.({
          title: "Admin data partial",
          body: "Baadhi ya admin data haijafunguka kikamilifu, lakini panel imefunguliwa.",
          variant: "warning"
        });
      }

      deps.renderAnalyticsPanel?.(analytics, "Marketplace Overview", deps.isAdminUser?.()
        ? "Admin anaona muhtasari wa marketplace nzima."
        : "Moderator anaona muhtasari wa moderation.");

      const state = {
        users: Array.isArray(users) ? users : [],
        pendingProducts: Array.isArray(pendingProducts) ? pendingProducts : [],
        openReports: Array.isArray(openReports) ? openReports : [],
        promotions: Array.isArray(promotions) ? promotions : [],
        orders: Array.isArray(orders) ? orders : [],
        payments: Array.isArray(payments) ? payments : [],
        moderationActions: Array.isArray(moderationActions) ? moderationActions : [],
        opsSummary,
        hasAnyLoadError: failedLoads.length > 0,
        loadErrors: {
          analytics: failedLoads.includes("analytics"),
          users: failedLoads.includes("users"),
          products: failedLoads.includes("products"),
          reports: failedLoads.includes("reports"),
          promotions: failedLoads.includes("promotions"),
          orders: failedLoads.includes("orders"),
          payments: failedLoads.includes("payments"),
          moderationActions: failedLoads.includes("moderationActions"),
          opsSummary: failedLoads.includes("opsSummary")
        }
      };
      latestUsers = state.users;

      const body = await createAdminBody(state);
      panel.replaceChildren(body);
      bindAdminActions(panel);
    }

    return { renderAdminView };
  }

  window.WingaModules.admin.createAdminControllerModule = createAdminControllerModule;
})();


// src/profile/ui.js
(() => {
  function createProfileUiModule(deps) {
    function appendRenderable(target, value) {
      if (!value) {
        return;
      }
      if (typeof value === "string") {
        target.appendChild(deps.createFragmentFromMarkup(value));
        return;
      }
      target.appendChild(value);
    }

    function getProductImages(product) {
      const source = Array.isArray(product?.images) && product.images.length > 0
        ? product.images
        : [product?.image];
      return source
        .map((image) => deps.sanitizeImageSource(image, deps.getImageFallbackDataUri?.("WINGA") || ""))
        .filter(Boolean);
    }

    function hasProductVideo(product) {
      return Boolean(
        product?.video
        || product?.videoUrl
        || (Array.isArray(product?.videos) && product.videos.some(Boolean))
        || /video/i.test(String(product?.mediaType || ""))
      );
    }

    function createProfileProductMenuElement(product) {
      const menu = deps.createElement("div", {
        className: "product-menu profile-product-menu",
        attributes: { "data-product-menu": product.id }
      });
      menu.appendChild(deps.createElement("button", {
        className: "product-menu-toggle profile-product-menu-toggle",
        textContent: "⋯",
        attributes: {
          type: "button",
          "aria-label": "Manage post",
          "data-menu-toggle": product.id
        }
      }));

      const popup = deps.createElement("div", {
        className: "product-menu-popup profile-product-menu-popup",
        attributes: { "data-menu-popup": product.id }
      });

      popup.append(
        deps.createElement("button", {
          className: "product-menu-item edit-btn",
          textContent: "Edit",
          attributes: { type: "button", "data-id": product.id }
        }),
        deps.createElement("button", {
          className: "product-menu-item delete-btn",
          textContent: "Delete",
          attributes: { type: "button", "data-id": product.id }
        })
      );

      if (product.status === "approved") {
        popup.appendChild(deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Promote",
          attributes: { type: "button", "data-promote-product": product.id }
        }));
      }

      if (product.status === "approved" && product.availability !== "sold_out") {
        popup.appendChild(deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Sold out",
          attributes: { type: "button", "data-product-soldout": product.id }
        }));
      }

      popup.append(
        deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Share",
          attributes: { type: "button", "data-menu-action": "share", "data-id": product.id }
        }),
        deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Download",
          attributes: { type: "button", "data-menu-action": "download", "data-id": product.id }
        })
      );

      menu.appendChild(popup);
      return menu;
    }

    function createProfileIdentitySectionElement(userProfile, context = {}) {
      const displayName = context.displayName || "User";
      const profileImage = context.profileImage || "";
      const roleLabel = context.roleLabel || "User";
      const verificationStatus = userProfile?.verificationStatus || (userProfile?.verifiedSeller ? "verified" : "unverified");
      const section = deps.createElement("section", {
        className: "panel",
        attributes: { id: "profile-identity-card" }
      });
      const shell = deps.createElement("div", { className: "profile-identity-shell" });
      const avatar = deps.createElement("div", { className: "profile-identity-avatar" });
      if (profileImage) {
        avatar.appendChild(deps.createElement("img", {
          className: "profile-identity-image zoomable-image",
          attributes: {
            src: deps.sanitizeImageSource(profileImage, ""),
            alt: `${displayName} profile photo`,
            loading: "lazy",
            decoding: "async",
            "data-zoom-src": deps.sanitizeImageSource(profileImage, ""),
            "data-zoom-alt": `${displayName} profile photo`
          }
        }));
      } else {
        avatar.appendChild(deps.createElement("span", {
          className: "profile-identity-initials",
          textContent: context.userInitials || "U"
        }));
      }

      const copy = deps.createElement("div", { className: "profile-identity-copy" });
      copy.append(
        deps.createElement("strong", { textContent: displayName }),
        deps.createElement("p", {
          className: "product-meta",
          textContent: `${roleLabel} account`
        })
      );
      if (userProfile?.role === "seller") {
        const verificationLine = deps.createElement("p", { className: "product-meta" });
        verificationLine.append("Verification: ");
        verificationLine.appendChild(deps.createElement("span", {
          className: `status-pill ${verificationStatus === "verified" ? "approved" : verificationStatus === "rejected" ? "rejected" : "pending"}`,
          textContent: deps.getVerificationStatusLabel(verificationStatus)
        }));
        copy.appendChild(verificationLine);
      }
      const whatsappWrap = deps.createElement("div", {
        className: "profile-whatsapp-block",
        attributes: { id: "profile-whatsapp-block" }
      });
      const whatsappMeta = deps.createElement("p", { className: "product-meta" });
      whatsappMeta.append("WhatsApp: ");
      whatsappMeta.appendChild(deps.createElement("strong", {
        textContent: context.whatsappNumber || "Haijawekwa"
      }));
      whatsappMeta.append(" ");
      whatsappMeta.appendChild(deps.createElement("span", {
        className: `status-pill ${(context.whatsappVerificationStatus || "verified") === "verified" ? "approved" : "pending"}`,
        textContent: (context.whatsappVerificationStatus || "verified") === "verified" ? "Verified" : "Pending"
      }));
      whatsappWrap.appendChild(whatsappMeta);
      if (context.pendingWhatsappNumber) {
        whatsappWrap.appendChild(deps.createElement("p", {
          className: "auth-note",
          textContent: `Pending change kwenda ${context.pendingWhatsappNumber}. Weka verification code kuthibitisha.`
        }));
      } else {
        whatsappWrap.appendChild(deps.createElement("p", {
          className: "auth-note",
          textContent: "Namba hii ndiyo hutumika mteja akibonyeza WhatsApp kwenye bidhaa zako."
        }));
      }
      whatsappWrap.appendChild(deps.createElement("button", {
        className: "action-btn action-btn-secondary",
        textContent: "Change WhatsApp Number",
        attributes: {
          type: "button",
          id: "profile-whatsapp-change-toggle"
        }
      }));
      const whatsappForm = deps.createElement("div", {
        className: "profile-whatsapp-form",
        attributes: {
          id: "profile-whatsapp-change-form",
          style: context.pendingWhatsappNumber ? "" : "display:none;"
        }
      });
      whatsappForm.append(
        deps.createElement("input", {
          attributes: {
            id: "profile-whatsapp-input",
            type: "tel",
            placeholder: "Namba mpya ya WhatsApp",
            value: context.pendingWhatsappNumber || context.whatsappNumber || ""
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: context.pendingWhatsappNumber ? "Resend Code" : "Send Code",
          attributes: {
            type: "button",
            id: "profile-whatsapp-request-button"
          }
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-whatsapp-code",
            type: "text",
            inputmode: "numeric",
            maxlength: "6",
            placeholder: "Verification code"
          }
        }),
        deps.createElement("div", {
          className: "profile-whatsapp-form-actions"
        })
      );
      whatsappForm.querySelector(".profile-whatsapp-form-actions")?.append(
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Verify WhatsApp",
          attributes: {
            type: "button",
            id: "profile-whatsapp-verify-button"
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Cancel",
          attributes: {
            type: "button",
            id: "profile-whatsapp-cancel-button"
          }
        })
      );
      whatsappWrap.appendChild(whatsappForm);

      if (userProfile?.role === "seller") {
        const trustBlock = deps.createElement("div", { className: "profile-trust-block" });
        trustBlock.append(
          deps.createElement("strong", { textContent: "Trust profile" }),
          deps.createElement("p", {
            className: "auth-note",
            textContent: "Signals buyers see before they decide to message or buy."
          })
        );

        const trustFacts = deps.createElement("div", { className: "trust-badges profile-trust-facts" });
        trustFacts.appendChild(deps.createStatusPill(
          userProfile?.verifiedSeller ? "Verified seller" : "Unverified seller",
          userProfile?.verifiedSeller ? "approved" : "pending"
        ));
        if ((context.whatsappVerificationStatus || "verified") === "verified" && (context.whatsappNumber || userProfile?.phoneNumber)) {
          trustFacts.appendChild(deps.createStatusPill("WhatsApp verified", "approved"));
        }
        const joinedLabel = deps.formatMemberSinceLabel?.(userProfile?.createdAt || userProfile?.verificationSubmittedAt || "");
        if (joinedLabel) {
          trustFacts.appendChild(deps.createStatusPill(joinedLabel));
        }
        const sellerSummary = deps.getSellerReviewSummary?.(userProfile?.username || "");
        if (Number(sellerSummary?.totalReviews || 0) > 0) {
          trustFacts.appendChild(deps.createStatusPill(`${sellerSummary.averageRating.toFixed(1)} seller rating`));
        }
        if (trustFacts.childNodes.length) {
          trustBlock.appendChild(trustFacts);
        }
        copy.appendChild(trustBlock);
      }

      copy.append(
        whatsappWrap,
        deps.createElement("label", {
          className: "upload-btn auth-upload-btn profile-photo-label",
          textContent: "Upload Profile Photo",
          attributes: { for: "profile-photo-input" }
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-photo-input",
            type: "file",
            accept: "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif",
            style: "display:none;"
          }
        }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: "Profile photo ni optional. Ukikosa, initials zitaendelea kuonekana.",
          attributes: { id: "profile-photo-status" }
        })
      );

      shell.append(avatar, copy);
      section.appendChild(shell);
      return section;
    }

    function createSellerUpgradeSectionElement(context = {}) {
      if (!context.canUpgradeToSeller && !context.canGetVerified) {
        return null;
      }

      const sectionTitle = "Seller Registration";
      const sectionEyebrow = "Seller upgrade";
      const sectionMeta = "Jina la duka na namba ya simu";
      const buttonLabel = "Open seller form";
      const submitLabel = "Become Seller";
      const guidanceCopy = "Jaza jina la duka na namba ya simu. Akaunti yako itaendelea kubaki wazi wakati role inabadilika.";

      const section = deps.createElement("section", {
        className: "panel profile-seller-upgrade-panel",
        attributes: { id: "profile-seller-upgrade-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: sectionEyebrow,
        title: sectionTitle,
        meta: sectionMeta
      }));

      const card = deps.createElement("div", { className: "orders-card profile-seller-upgrade-card" });
      card.append(
        deps.createElement("p", {
          className: "auth-note",
          textContent: guidanceCopy
        }),
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: buttonLabel,
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        })
      );

      const form = deps.createElement("div", {
        className: "profile-seller-upgrade-form",
        attributes: {
          id: "profile-seller-upgrade-form",
          style: "display:none;"
        }
      });
      form.append(
        deps.createElement("label", {
          className: "auth-label",
          textContent: "Jina la duka"
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-full-name",
            type: "text",
            maxlength: "120",
            placeholder: "Weka jina la duka",
            value: context.fullName || context.displayName || ""
          }
        }),
        deps.createElement("label", {
          className: "auth-label",
          textContent: "Namba ya simu"
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-phone-number",
            type: "tel",
            maxlength: "20",
            placeholder: "Namba ya simu ya akaunti",
            value: context.phoneNumber || context.whatsappNumber || ""
          }
        }),
        deps.createElement("label", {
          className: "auth-label",
          textContent: "Primary category"
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-category",
            type: "text",
            maxlength: "60",
            placeholder: "e.g. wanawake, vifaa, michezo",
            value: context.primaryCategory || ""
          }
        }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: "Hakikisha jina la duka na namba ya simu ni sahihi kabla ya kuendelea."
        }),
        deps.createElement("div", {
          className: "profile-seller-upgrade-actions"
        })
      );

      form.querySelector(".profile-seller-upgrade-actions")?.append(
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: submitLabel,
          attributes: {
            type: "button",
            "data-submit-seller-upgrade": "true"
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Cancel",
          attributes: {
            type: "button",
            "data-close-seller-upgrade": "true"
          }
        })
      );

      card.appendChild(form);
      section.appendChild(card);
      return section;
    }

    function createOrderLineElement(order) {
      const line = deps.createElement("div", { className: "order-line" });
      const lifecycle = typeof deps.getOrderLifecycleMeta === "function"
        ? deps.getOrderLifecycleMeta(order)
        : { label: deps.getStatusLabel(order.status), detail: "", tone: "" };
      const statusRow = deps.createElement("div", { className: "trust-badges" });
      statusRow.append(
        deps.createStatusPill(lifecycle.label || deps.getStatusLabel(order.status), lifecycle.tone || (order.status === "delivered" ? "approved" : order.status === "cancelled" ? "rejected" : order.status === "confirmed" ? "pending" : "")),
        deps.createStatusPill(`Payment: ${deps.getPaymentStatusLabel(order.paymentStatus)}`, order.paymentStatus === "paid" ? "approved" : order.paymentStatus === "failed" ? "rejected" : "")
      );
      line.append(
        deps.createElement("span", { textContent: order.productName || "" }),
        deps.createElement("small", {
          textContent: `${order.shop || order.sellerUsername || order.buyerUsername || ""} | ${deps.formatProductPrice(order.price)}${order.transactionId ? ` | TX: ${order.transactionId}` : ""}`
        }),
        statusRow
      );
      if (lifecycle.detail) {
        line.appendChild(deps.createElement("small", {
          className: "meta-copy order-lifecycle-copy",
          textContent: lifecycle.detail
        }));
      }
      if (order.paymentDate) {
        line.appendChild(deps.createElement("small", {
          textContent: `${order.paymentStatus === "paid" ? "Paid at" : "Submitted at"}: ${new Date(order.paymentDate).toLocaleString("sw-TZ")}`
        }));
      }
      const progressLabel = deps.getOrderProgressLabel?.(order);
      if (progressLabel) {
        line.appendChild(deps.createElement("small", {
          className: "meta-copy",
          textContent: progressLabel
        }));
      }
      const actions = deps.createElement("div", { className: "order-actions" });
      appendRenderable(actions, deps.getOrderActionButtons(order));
      line.appendChild(actions);
      return line;
    }

    function createOrdersSectionElement(orders) {
      const purchases = Array.isArray(orders?.purchases) ? orders.purchases : [];
      const sales = Array.isArray(orders?.sales) ? orders.sales : [];
      const section = deps.createElement("section", {
        attributes: { id: "profile-orders-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Orders",
        title: "Ununuzi na Mauzo",
        meta: `${purchases.length} nimenunua | ${sales.length} wameninunulia`
      }));

      const grid = deps.createElement("div", { className: "orders-grid" });
      const purchaseCard = deps.createElement("div", { className: "orders-card" });
      purchaseCard.appendChild(deps.createElement("strong", { textContent: "Nimenunua" }));
      if (purchases.length) {
        purchases.forEach((order) => purchaseCard.appendChild(createOrderLineElement(order)));
      } else {
        purchaseCard.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna bidhaa uliyonunua bado."
        }));
      }

      const salesCard = deps.createElement("div", { className: "orders-card" });
      salesCard.appendChild(deps.createElement("strong", { textContent: "Wameninunulia" }));
      if (sales.length) {
        sales.forEach((order) => salesCard.appendChild(createOrderLineElement(order)));
      } else {
        salesCard.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna order ya kuuza bado."
        }));
      }

      grid.append(purchaseCard, salesCard);
      section.appendChild(grid);
      return section;
    }

    function createPromotionGuideCardElement(type, option) {
      const card = deps.createElement("div", { className: "orders-card promotion-guide-card" });
      const copy = type === "boost"
        ? "Adds more visibility in discovery areas."
        : type === "featured"
          ? "Places your product in featured surfaces."
          : type === "category_boost"
            ? "Improves ranking inside category browsing."
            : "Pins the product higher for short premium bursts.";
      card.append(
        deps.createElement("strong", { textContent: option.label }),
        deps.createElement("small", {
          textContent: `TSh ${deps.formatNumber(option.amount)} | ${option.durationDays} day${option.durationDays === 1 ? "" : "s"}`
        }),
        deps.createElement("p", {
          className: "product-meta",
          textContent: copy
        })
      );
      return card;
    }

    function createPromotionOverviewSectionElement(context = {}) {
      if (!context.canUseSellerFeatures) {
        return null;
      }
      const section = deps.createElement("section", {
        attributes: { id: "profile-promotion-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Promotions",
        title: "Grow your visibility",
        meta: `${context.activePromotionsCount || 0} active promotion${context.activePromotionsCount === 1 ? "" : "s"}`
      }));

      const grid = deps.createElement("div", { className: "orders-grid promotion-guide-grid" });
      Object.entries(context.promotionOptions || {}).forEach(([type, option]) => {
        grid.appendChild(createPromotionGuideCardElement(type, option));
      });
      section.appendChild(grid);
      return section;
    }

    function createProfileShellElement(context) {
      const {
        displayName,
        accountMeta,
        stats,
        identityMarkup,
        sellerUpgradeMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup,
        notificationPermissionState,
        hasBuyerAccess,
        requestCount,
        canGetVerified
      } = context;

      const fragment = document.createDocumentFragment();
      fragment.appendChild(deps.createSectionHeading({
        eyebrow: "Profile",
        title: displayName || "",
        meta: accountMeta || ""
      }));

      const statsGrid = deps.createElement("div", { className: "profile-stats" });
        (stats || []).forEach((stat) => {
          statsGrid.appendChild(deps.createStatBox({
            value: stat.value,
            label: stat.label,
            action: stat.action
          }));
        });
      fragment.appendChild(statsGrid);

      [
        identityMarkup,
        sellerUpgradeMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup
      ].filter(Boolean).forEach((content) => {
        appendRenderable(fragment, content);
      });

      const productsPanel = deps.createElement("section", {
        attributes: { id: "profile-products-panel" }
      });
      productsPanel.appendChild(deps.createSectionHeading({
        eyebrow: "Products",
        title: "Bidhaa zako zote"
      }));
      productsPanel.appendChild(deps.createElement("div", {
        className: "profile-product-grid",
        attributes: { id: "user-products-container" }
      }));
      fragment.appendChild(productsPanel);

      const actionsCard = deps.createElement("div", {
        attributes: { id: "profile-actions-card" }
      });
      actionsCard.append(
        deps.createElement("p", { className: "auth-label", textContent: "Account" }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: "Ukihitaji kutoka kwenye account yako, bonyeza hapa chini."
        })
      );
      const browserPermission = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      const notificationStatus = browserPermission === "granted" || notificationPermissionState?.status === "allowed"
        ? "Enabled"
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? "Blocked"
          : notificationPermissionState?.status === "dismissed"
            ? "Paused"
            : "Not enabled";
      const notificationsEnabled = browserPermission === "granted" || notificationPermissionState?.status === "allowed";
      const notificationActionLabel = notificationsEnabled
        ? "Notifications enabled"
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? "Open notifications help"
          : "Enable notifications";
      const notificationCopy = browserPermission === "granted" || notificationPermissionState?.status === "allowed"
        ? "Notifications are on. You will get alerts for messages, orders, and important activity."
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? "Browser imezima notifications. Unaweza kujaribu tena au kubadili browser settings."
          : "Turn on notifications so you do not miss new messages, order updates, and important activity.";
      const notificationCard = deps.createElement("div", {
        className: "profile-notification-settings"
      });
      notificationCard.append(
        deps.createElement("p", { className: "auth-label", textContent: "Notifications" }),
        deps.createElement("p", { className: "auth-note", textContent: notificationCopy }),
        deps.createElement("div", {
          className: "profile-notification-row"
        })
      );
      const notificationRow = notificationCard.lastElementChild;
      notificationRow?.append(
        deps.createElement("span", {
          className: "status-pill",
          textContent: notificationStatus
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: notificationActionLabel,
          attributes: {
            type: "button",
            ...(notificationsEnabled ? { disabled: "true", "aria-disabled": "true" } : {}),
            "data-open-notification-permission": "true"
          }
        })
      );
      actionsCard.appendChild(notificationCard);
      if (hasBuyerAccess) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: `My Requests (${requestCount})`,
          attributes: {
            type: "button",
            "data-open-request-box": "true"
          }
        }));
      }
      if (canGetVerified) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Get Verified",
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        }));
      }
      if (context.canUpgradeToSeller) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Become Seller",
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        }));
      }
      actionsCard.appendChild(deps.createElement("button", {
        textContent: "Logout",
        attributes: {
          id: "profile-logout-button",
          type: "button"
        }
      }));
      fragment.appendChild(actionsCard);

      const wrapper = deps.createElement("div", {
        className: "profile-shell"
      });
      wrapper.appendChild(fragment);
      return wrapper;
    }

    function createProfileProductCardElement(product, imageSrc = "", options = {}) {
      const { isPriority = false } = options || {};
      const images = getProductImages(product);
      const firstImage = imageSrc || images[0] || deps.getImageFallbackDataUri?.("WINGA") || "";
      const article = deps.createElement("article", {
        className: "product-card profile-product-card",
        attributes: {
          "data-profile-product-card": product.id
        }
      });
      article.dataset.profileProductCard = product.id;
      if (imageSrc) {
        article.dataset.profileProductImage = imageSrc;
      }

      const media = deps.createElement("div", { className: "product-card-media profile-product-media" });
      const image = deps.createResponsiveImage
        ? deps.createResponsiveImage({
            src: firstImage,
          alt: product?.name || "Product image",
          className: "profile-product-stage",
          fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
          attributes: {
            "data-disable-image-zoom": "true",
            loading: isPriority ? "eager" : "lazy",
            fetchpriority: isPriority ? "high" : "auto"
          }
        })
      : deps.createElement("img", {
          className: "profile-product-stage",
          attributes: {
            src: firstImage,
            alt: product?.name || "Product image",
            loading: isPriority ? "eager" : "lazy",
            decoding: "async",
            fetchpriority: isPriority ? "high" : "auto"
          }
        });
      media.appendChild(image);

      article.appendChild(media);
      return article;
    }

    return {
      createProfileShellElement,
      createProfileProductCardElement,
      createProfileIdentitySectionElement,
      createSellerUpgradeSectionElement,
      createOrdersSectionElement,
      createPromotionOverviewSectionElement
    };
  }

  window.WingaModules.profile.createProfileUiModule = createProfileUiModule;
})();



// src/profile/controller.js
(() => {
  function createProfileControllerModule(deps) {
    let renderSequence = 0;

    function isRenderActive(sequence) {
      if (sequence !== renderSequence) {
        return false;
      }
      if (typeof deps.getCurrentView === "function" && deps.getCurrentView() !== "profile") {
        return false;
      }
      return true;
    }

    function bindWhatsappNumberActions() {
      const toggleButton = document.getElementById("profile-whatsapp-change-toggle");
      const form = document.getElementById("profile-whatsapp-change-form");
      const input = document.getElementById("profile-whatsapp-input");
      const requestButton = document.getElementById("profile-whatsapp-request-button");
      const codeInput = document.getElementById("profile-whatsapp-code");
      const verifyButton = document.getElementById("profile-whatsapp-verify-button");
      const cancelButton = document.getElementById("profile-whatsapp-cancel-button");

      if (toggleButton && toggleButton.dataset.bound !== "true") {
        toggleButton.dataset.bound = "true";
        toggleButton.addEventListener("click", () => {
          if (!form) {
            return;
          }
          form.style.display = form.style.display === "none" ? "grid" : "none";
          if (form.style.display !== "none") {
            input?.focus();
          }
        });
      }

      if (cancelButton && cancelButton.dataset.bound !== "true") {
        cancelButton.dataset.bound = "true";
        cancelButton.addEventListener("click", () => {
          if (form) {
            form.style.display = "none";
          }
        });
      }

      if (requestButton && requestButton.dataset.bound !== "true") {
        requestButton.dataset.bound = "true";
        requestButton.addEventListener("click", async () => {
          const whatsappNumber = deps.normalizePhoneNumber?.(input?.value || "") || "";
          if (!whatsappNumber || whatsappNumber.length < 10) {
            deps.showInAppNotification?.({
              title: "WhatsApp required",
              body: "Weka namba mpya ya WhatsApp sahihi kwanza.",
              variant: "warning"
            });
            return;
          }

          requestButton.disabled = true;
          try {
            const result = await deps.dataLayer.requestWhatsappChange({ whatsappNumber });
            deps.mergeSessionState({
              whatsappVerificationStatus: "pending",
              pendingWhatsappNumber: result?.pendingWhatsappNumber || whatsappNumber,
              pendingWhatsappExpiresAt: result?.expiresAt || ""
            });
            deps.saveSessionUser();
            deps.renderHeaderUserMenu();
            deps.showInAppNotification?.({
              title: "Verification code sent",
              body: result?.deliveryMode === "preview" && result?.previewCode
                ? `Preview code: ${result.previewCode}`
                : "Tumetuma verification code ya WhatsApp. Iweke hapa chini kuthibitisha.",
              variant: "success",
              durationMs: result?.deliveryMode === "preview" ? 7000 : 4200
            });
            renderProfile();
          } catch (error) {
            deps.captureError?.("profile_whatsapp_request_failed", error, {
              user: deps.getCurrentUser()
            });
            deps.showInAppNotification?.({
              title: "WhatsApp change failed",
              body: error.message || "Imeshindikana kuomba verification code ya WhatsApp.",
              variant: "error"
            });
          } finally {
            requestButton.disabled = false;
          }
        });
      }

      if (verifyButton && verifyButton.dataset.bound !== "true") {
        verifyButton.dataset.bound = "true";
        verifyButton.addEventListener("click", async () => {
          const code = String(codeInput?.value || "").trim();
          if (!/^\d{6}$/.test(code)) {
            deps.showInAppNotification?.({
              title: "Verification code required",
              body: "Weka verification code ya tarakimu 6.",
              variant: "warning"
            });
            return;
          }

          verifyButton.disabled = true;
          try {
            const updatedUser = await deps.dataLayer.verifyWhatsappChange({ code });
            const resolvedWhatsappNumber = deps.normalizePhoneNumber?.(
              updatedUser?.whatsappNumber
                || updatedUser?.phoneNumber
                || deps.getMarketplaceUser?.(deps.getCurrentUser())?.whatsappNumber
                || input?.value
                || ""
            ) || "";
            deps.mergeSessionState({
              ...updatedUser,
              whatsappNumber: resolvedWhatsappNumber,
              pendingWhatsappNumber: "",
              pendingWhatsappExpiresAt: "",
              whatsappVerificationStatus: "verified"
            });
            deps.saveSessionUser();
            deps.renderHeaderUserMenu();
            deps.showInAppNotification?.({
              title: "WhatsApp verified",
              body: "WhatsApp number yako mpya imehakikiwa na sasa inatumika kwenye bidhaa zako.",
              variant: "success"
            });
            renderProfile();
          } catch (error) {
            deps.captureError?.("profile_whatsapp_verify_failed", error, {
              user: deps.getCurrentUser()
            });
            deps.showInAppNotification?.({
              title: "Verification failed",
              body: error.message || "Imeshindikana kuthibitisha WhatsApp number.",
              variant: "error"
            });
          } finally {
            verifyButton.disabled = false;
          }
        });
      }
    }

    function setSellerUpgradeFormVisibility(open = false) {
      const form = document.getElementById("profile-seller-upgrade-form");
      if (!form) {
        return;
      }
      form.style.display = open ? "grid" : "none";
      if (open) {
        document.getElementById("profile-seller-upgrade-full-name")?.focus();
      }
    }

    async function submitSellerUpgradeForm() {
      const fullName = String(document.getElementById("profile-seller-upgrade-full-name")?.value || "").trim();
      const phoneNumber = String(document.getElementById("profile-seller-upgrade-phone-number")?.value || "").trim();
      const primaryCategory = String(document.getElementById("profile-seller-upgrade-category")?.value || "").trim();

      if (fullName.length < 3) {
        deps.showInAppNotification?.({
          title: "Store name required",
          body: "Jina la duka linahitajika kabla ya kuendelea.",
          variant: "warning"
        });
        return;
      }

      if (!phoneNumber) {
        deps.showInAppNotification?.({
          title: "Phone required",
          body: "Weka namba ya simu kabla ya kuendelea.",
          variant: "warning"
        });
        return;
      }

      if (!/^\+?[0-9][0-9\s-]{7,19}$/.test(phoneNumber)) {
        deps.showInAppNotification?.({
          title: "Phone required",
          body: "Weka namba ya simu sahihi.",
          variant: "warning"
        });
        return;
      }

      if (primaryCategory && primaryCategory.length < 2) {
        deps.showInAppNotification?.({
          title: "Category required",
          body: "Category ya seller si sahihi.",
          variant: "warning"
        });
        return;
      }

      const submitButton = document.querySelector("[data-submit-seller-upgrade]");
      const cancelButton = document.querySelector("[data-close-seller-upgrade]");
      submitButton?.setAttribute("disabled", "disabled");
      if (cancelButton) {
        cancelButton.setAttribute("disabled", "disabled");
      }

      try {
        const updatedSession = await deps.dataLayer.upgradeBuyerToSeller({
          fullName,
          phoneNumber,
          primaryCategory,
        });
        if (!updatedSession?.username) {
          throw new Error("Seller upgrade haikufaulu.");
        }
        deps.mergeSessionState(updatedSession);
        deps.saveSessionUser();
        deps.renderHeaderUserMenu();
        deps.showInAppNotification?.({
          title: "Seller upgrade complete",
          body: "Akaunti yako sasa ni seller. Bila kutoka profile, unaweza kuanza kuuza.",
          variant: "success"
        });
        deps.renderCurrentView?.();
      } catch (error) {
        deps.captureError?.("seller_upgrade_failed", error, {
          user: deps.getCurrentUser()
        });
        deps.showInAppNotification?.({
          title: "Seller upgrade failed",
          body: error.message || "Imeshindikana kuupgrade account kwa sasa.",
          variant: "error"
        });
      } finally {
        submitButton?.removeAttribute("disabled");
        if (cancelButton) {
          cancelButton.removeAttribute("disabled");
        }
      }
    }

    function handleProfileAction(action, profileDiv) {
      if (!action) {
        return;
      }
      if (action === "products") {
        deps.setActiveProfileSection?.("profile-products-panel");
        deps.setPendingProfileSection?.("profile-products-panel");
        deps.flushPendingProfileSection?.();
        return;
      }
      if (action === "unread") {
        deps.setProfileMessagesFilter?.("unread");
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.setActiveChatContext?.(null);
        deps.setCurrentMessageDraft?.("");
        deps.setSelectedChatProductIds?.([]);
        deps.setActiveChatReplyMessageId?.("");
        deps.setOpenChatMessageMenuId?.("");
        deps.setOpenEmojiScope?.("");
        deps.setActiveProfileSection?.("profile-messages-panel");
        deps.setPendingProfileSection?.("profile-messages-panel");
        deps.renderProfile?.();
        return;
      }
      if (action === "messages") {
        deps.setProfileMessagesFilter?.("all");
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.setActiveChatContext?.(null);
        deps.setCurrentMessageDraft?.("");
        deps.setSelectedChatProductIds?.([]);
        deps.setActiveChatReplyMessageId?.("");
        deps.setOpenChatMessageMenuId?.("");
        deps.setOpenEmojiScope?.("");
        deps.setActiveProfileSection?.("profile-messages-panel");
        deps.setPendingProfileSection?.("profile-messages-panel");
        deps.renderProfile?.();
        return;
      }
      if (action === "seller-upgrade") {
        deps.setActiveProfileSection?.("profile-seller-upgrade-panel");
        deps.setPendingProfileSection?.("profile-seller-upgrade-panel");
        deps.flushPendingProfileSection?.();
      }
    }

    function bindProfileEntryActions() {
      const profileDiv = deps.getOrCreateProfileDiv();
      if (!profileDiv) {
        return;
      }
      if (profileDiv.dataset.profileActionBound !== "true") {
        profileDiv.dataset.profileActionBound = "true";
        profileDiv.addEventListener("click", (event) => {
          const closeMessagesTarget = event.target?.closest?.("[data-close-profile-messages]");
          if (closeMessagesTarget) {
            event.preventDefault();
            event.stopPropagation();
            deps.setProfileMessagesMode?.("list");
            deps.setProfileHasSelection?.(false);
            deps.setActiveChatContext?.(null);
            deps.setActiveProfileSection?.("profile-products-panel");
            deps.setPendingProfileSection?.("profile-products-panel");
            renderProfile();
            return;
          }
          const openSellerUpgradeTarget = event.target?.closest?.("[data-open-seller-upgrade]");
          if (openSellerUpgradeTarget) {
            event.preventDefault();
            event.stopPropagation();
            setSellerUpgradeFormVisibility(true);
            return;
          }
          const closeSellerUpgradeTarget = event.target?.closest?.("[data-close-seller-upgrade]");
          if (closeSellerUpgradeTarget) {
            event.preventDefault();
            event.stopPropagation();
            setSellerUpgradeFormVisibility(false);
            return;
          }
          const openNotificationPermissionTarget = event.target?.closest?.("[data-open-notification-permission]");
          if (openNotificationPermissionTarget) {
            event.preventDefault();
            event.stopPropagation();
            deps.openNotificationPermissionPrompt?.("profile", {
              title: "Keep your Winga activity in sync",
              body: "Turn on notifications so you do not miss new messages, order updates, and important activity."
            });
            return;
          }
          const submitSellerUpgradeTarget = event.target?.closest?.("[data-submit-seller-upgrade]");
          if (submitSellerUpgradeTarget) {
            event.preventDefault();
            event.stopPropagation();
            submitSellerUpgradeForm();
            return;
          }
          const target = event.target?.closest?.("[data-profile-action]");
          if (!target) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          handleProfileAction(target.dataset.profileAction || "", profileDiv);
        });
      }
    }

    function bindProfileIdentityActions() {
      const profilePhotoInput = document.getElementById("profile-photo-input");
      const profilePhotoStatus = document.getElementById("profile-photo-status");
      if (!profilePhotoInput || profilePhotoInput.dataset.bound === "true") {
        bindWhatsappNumberActions();
        return;
      }

      profilePhotoInput.dataset.bound = "true";
      profilePhotoInput.addEventListener("change", async (event) => {
        const activeInput = event.currentTarget;
        const file = activeInput?.files?.[0];
        const statusNode = document.getElementById("profile-photo-status") || profilePhotoStatus;
        if (!file) {
          return;
        }

        try {
          if (activeInput) {
            activeInput.disabled = true;
          }
          deps.validateSingleImageFile(file, "Profile photo");
          if (statusNode) {
            statusNode.textContent = "Tunapakia profile photo...";
          }
          const profileImage = await deps.readFileAsDataUrl(file, { purpose: "profile" });
          const updatedUser = await deps.dataLayer.updateUserProfile({ profileImage });
          if (!updatedUser?.username) {
            throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
          }
          deps.mergeSessionState({ ...updatedUser, profileImage: updatedUser.profileImage || profileImage });
          deps.saveSessionUser();
          deps.renderHeaderUserMenu();
          if (statusNode) {
            statusNode.textContent = "Profile photo imehifadhiwa.";
          }
          deps.showInAppNotification?.({
            title: "Profile photo updated",
            body: "Picha yako mpya imehifadhiwa.",
            variant: "success",
            durationMs: 3200
          });
          renderProfile();
        } catch (error) {
          deps.captureError?.("profile_photo_update_failed", error, {
            user: deps.getCurrentUser()
          });
          if (statusNode) {
            statusNode.textContent = "Profile photo ni optional. Ukikosa, initials zitaendelea kuonekana.";
          }
          deps.showInAppNotification?.({
            title: "Profile photo failed",
            body: error.message || "Imeshindikana kuhifadhi profile photo.",
            variant: "error"
          });
        } finally {
          if (activeInput) {
            activeInput.value = "";
            activeInput.disabled = false;
          }
        }
      });

      bindWhatsappNumberActions();
    }

    function renderProfile() {
      const sequence = ++renderSequence;
      deps.hideUploadAndEmptyState();
      const profileDiv = deps.getOrCreateProfileDiv();
      const products = deps.getProducts();
      const currentUser = deps.getCurrentUser();
      const currentSession = deps.getCurrentSession();
      const currentOrders = deps.getCurrentOrders();
      const userProducts = products
        .filter((product) => product.uploadedBy === currentUser)
        .sort((first, second) => {
          const secondTime = new Date(second.createdAt || second.updatedAt || second.timestamp || 0).getTime();
          const firstTime = new Date(first.createdAt || first.updatedAt || first.timestamp || 0).getTime();
          return secondTime - firstTime;
        });
      const conversationSummaries = deps.getConversationSummaries ? deps.getConversationSummaries() : [];
      const totalUnreadMessages = deps.getTotalUnreadMessages ? deps.getTotalUnreadMessages() : 0;
      const conversationCount = conversationSummaries.length;
      const userProfile = {
        ...(deps.getMarketplaceUser(currentUser) || {}),
        ...(currentSession || {})
      };
      const normalizedProfileStatus = String(userProfile?.status || "")
        .trim()
        .toLowerCase();
      const safeProfileStatus = normalizedProfileStatus && normalizedProfileStatus !== "null" && normalizedProfileStatus !== "undefined"
        ? normalizedProfileStatus
        : "";
      const isBuyerOnly = deps.isBuyerUser();
      const hasBuyerAccess = deps.canUseBuyerFeatures();
      const canUpgradeToSeller = userProfile?.role === "buyer";
      const activeSection = deps.getActiveProfileSection?.() || "profile-products-panel";

      if (deps.canUseSellerFeatures()) {
        deps.dataLayer.loadAnalytics()
          .then((analytics) => {
            if (!isRenderActive(sequence)) {
              return;
            }
            deps.renderAnalyticsPanel(analytics, "Performance Yako", "Muhtasari wa catalog yako");
          })
          .catch((error) => {
            if (!isRenderActive(sequence)) {
              return;
            }
            deps.captureError?.("profile_analytics_load_failed", error, {
              user: currentUser
            });
            deps.renderAnalyticsPanel(null, "Performance Yako", "Muhtasari wa catalog yako");
            deps.showInAppNotification?.({
              title: "Analytics unavailable",
              body: "Performance yako haijapatikana kwa sasa. Tunaonyesha fallback salama.",
              variant: "warning",
              durationMs: 4200
            });
          });
      }

      deps.dataLayer.loadMyOrders()
        .then((orders) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.setCurrentOrders(orders || { purchases: [], sales: [] });
          document.getElementById("profile-orders-panel")?.replaceWith(deps.createOrdersContainerFromState());
          deps.bindMessageActions(profileDiv);
        })
        .catch((error) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.captureError?.("profile_orders_load_failed", error, {
            user: currentUser
          });
          deps.setCurrentOrders({ purchases: [], sales: [] });
          document.getElementById("profile-orders-panel")?.replaceWith(deps.createOrdersContainerFromState());
          deps.bindMessageActions(profileDiv);
          deps.showInAppNotification?.({
            title: "Orders unavailable",
            body: "Orders hazikupatikana kwa sasa. Jaribu tena baada ya muda mfupi.",
            variant: "warning",
            durationMs: 4200
          });
        });

      deps.dataLayer.loadMessages()
        .then((messages) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.setCurrentMessages(Array.isArray(messages) ? messages : []);
          deps.syncActiveChatContext();
          deps.replaceMessagesPanel(profileDiv);
          deps.markActiveConversationRead().catch(() => {});
          deps.startMessagePolling();
        })
        .catch((error) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.captureError?.("profile_messages_load_failed", error, {
            user: currentUser
          });
          deps.setCurrentMessages([]);
          deps.syncActiveChatContext();
          deps.replaceMessagesPanel(profileDiv);
          deps.showInAppNotification?.({
            title: "Messages unavailable",
            body: "Inbox haikuweza ku-refresh kwa sasa.",
            variant: "warning",
            durationMs: 4200
          });
        });

      deps.dataLayer.loadNotifications()
        .then((notifications) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.setCurrentNotifications(Array.isArray(notifications) ? notifications : []);
          deps.updateProfileNavBadge();
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
          deps.bindMessageActions(profileDiv);
        })
        .catch((error) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.captureError?.("profile_notifications_load_failed", error, {
            user: currentUser
          });
          deps.setCurrentNotifications([]);
          deps.updateProfileNavBadge();
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
          deps.bindMessageActions(profileDiv);
          deps.showInAppNotification?.({
            title: "Notifications unavailable",
            body: "Notifications hazikupatikana kwa sasa.",
            variant: "warning",
            durationMs: 4200
          });
        });

      try {
        const activePromotions = Array.isArray(deps.getActivePromotions?.())
          ? deps.getActivePromotions()
          : [];
        const canGetVerified = userProfile?.role === "seller" && !userProfile?.verifiedSeller;
        profileDiv.dataset.activeSection = activeSection;
        profileDiv.replaceChildren(deps.createProfileShellElement({
          displayName: deps.getCurrentDisplayName(),
          accountMeta: `${isBuyerOnly ? "Akaunti yako ya mteja" : deps.canUseSellerFeatures() ? "Akaunti ya muuzaji yenye access ya mteja" : "Simamia akaunti yako"}${safeProfileStatus && safeProfileStatus !== "active" ? ` | ${safeProfileStatus}` : ""}`,
          stats: [
            {
              value: userProducts.length,
              label: "Products",
              action: "products"
            },
            {
              value: totalUnreadMessages,
              label: "Unread",
              action: "unread"
            },
            {
              value: conversationCount,
              label: "Messages",
              action: "messages"
            }
          ],
          identityMarkup: deps.createProfileIdentitySectionElement(userProfile, {
            displayName: deps.getCurrentDisplayName(),
            profileImage: deps.getCurrentProfileImage(),
            userInitials: deps.getUserInitials(deps.getCurrentDisplayName()),
            roleLabel: userProfile?.role ? deps.getRoleLabel(userProfile.role) : "User",
            whatsappNumber: userProfile?.whatsappNumber || userProfile?.phoneNumber || "",
            whatsappVerificationStatus: userProfile?.whatsappVerificationStatus || "verified",
            pendingWhatsappNumber: userProfile?.pendingWhatsappNumber || ""
          }),
          sellerUpgradeMarkup: deps.createSellerUpgradeSectionElement?.({
            canUpgradeToSeller,
            canGetVerified,
            fullName: deps.getCurrentDisplayName(),
            phoneNumber: userProfile?.phoneNumber || userProfile?.whatsappNumber || "",
            primaryCategory: userProfile?.primaryCategory || "",
          }),
          promotionsMarkup: deps.createPromotionOverviewSectionElement({
            canUseSellerFeatures: deps.canUseSellerFeatures(),
            activePromotionsCount: activePromotions.filter((promotion) => promotion.sellerUsername === currentUser).length,
            promotionOptions: deps.getPromotionOptions()
          }),
          requestsMarkup: deps.renderRequestBoxSection(),
          ordersMarkup: deps.createOrdersSectionElement(deps.getCurrentOrders()),
          notificationsMarkup: deps.renderNotificationsSection(),
          messagesMarkup: deps.renderMessagesSection(),
          notificationPermissionState: deps.getNotificationPermissionState?.(),
          hasBuyerAccess,
          requestCount: deps.getRequestBoxItemCount(),
          canGetVerified
        }));
        if (activeSection === "profile-messages-panel") {
          profileDiv.appendChild(deps.createElement("button", {
            className: "profile-messages-fab message-panel-close",
            textContent: "Back to profile",
            attributes: {
              type: "button",
              "data-close-profile-messages": "true",
              "aria-label": "Back to profile"
            }
          }));
        }
      } catch (error) {
        deps.captureError?.("profile_shell_render_failed", error, {
          user: currentUser
        });
        const fallback = deps.createEmptyState
          ? deps.createEmptyState("Profile ilipata hitilafu ya muda. Refresh ukurasa au jaribu tena.")
          : document.createTextNode("Profile ilipata hitilafu ya muda.");
        profileDiv.replaceChildren(fallback);
        profileDiv.style.display = "block";
        return;
      }

      deps.setActiveProfileSection?.(activeSection);
      deps.flushPendingProfileSection();
      bindProfileEntryActions();
      const container = document.getElementById("user-products-container");

      if (userProducts.length === 0) {
        deps.setEmptyCopy(
          container,
          isBuyerOnly
            ? "Akaunti ya buyer iko tayari. Endelea kuvinjari bidhaa, kutafuta bidhaa, ku-chat na sellers, kufanya malipo, kuweka orders, ku-review, na kureport listings zisizo salama."
            : deps.canUseSellerFeatures()
              ? "No posts yet. Ukihitaji kuongeza bidhaa, nenda Upload uanze kujenga profile grid yako."
              : "Hujapost bidhaa bado. Nenda Upload uanze kuweka catalog yako."
        );
        profileDiv.querySelector("#profile-logout-button")?.addEventListener("click", deps.logout);
        bindProfileIdentityActions();
        deps.bindRequestBoxActions(profileDiv);
        deps.bindMessageActions(profileDiv);
        profileDiv.style.display = "block";
        deps.setResultsMeta(
          "Profile",
          isBuyerOnly
            ? "Hapa utaona orders, notifications, messages, na shughuli zako kama buyer."
            : deps.canUseSellerFeatures()
              ? "Hapa utaona buyer activities zako pamoja na seller catalog na performance yake."
              : "Hapa utaona bidhaa zako na performance yake."
        );
        return;
      }

      const preloadRegistry = new Set();
      const priorityTileLimit = Math.max(9, (deps.getProductsPerRow?.() || 3) * 3);
      let renderedTileCount = 0;
      const preloadProfileImage = (imageSrc) => {
        if (!deps.preloadImageSource) {
          return;
        }
        const safeSrc = String(imageSrc || "").trim();
        if (!safeSrc || preloadRegistry.has(safeSrc)) {
          return;
        }
        preloadRegistry.add(safeSrc);
        deps.preloadImageSource(safeSrc, { fetchPriority: "high" });
      };

      const productCards = document.createDocumentFragment();
      userProducts.forEach((product) => {
        const rawImages = Array.isArray(product?.images)
          ? product.images
          : product?.images
            ? [product.images]
            : [];
        const imageSources = rawImages
          .map((image) => typeof image === "string" ? image.trim() : "")
          .filter(Boolean);
        if (!imageSources.length && product?.image) {
          imageSources.push(String(product.image).trim());
        }
        if (!imageSources.length) {
          imageSources.push("");
        }
        imageSources.forEach((imageSrc) => {
          if (renderedTileCount < priorityTileLimit) {
            preloadProfileImage(imageSrc);
          }
          const card = deps.createProfileProductCardElement(product, imageSrc, {
            isPriority: renderedTileCount < priorityTileLimit
          });
          if (card) {
            productCards.appendChild(card);
          }
          renderedTileCount += 1;
        });
      });
      container.appendChild(productCards);

      container.querySelectorAll(".edit-btn").forEach((button) => {
        button.addEventListener("click", () => deps.startEditProduct(button.dataset.id));
      });

      container.querySelectorAll("[data-profile-product-card]").forEach((card) => {
        card.addEventListener("click", (event) => {
          if (event.target.closest("button, a, .product-menu")) {
            return;
          }
          const productId = card.dataset.profileProductCard;
          if (!productId) {
            return;
          }
          deps.noteProductInterest?.(productId);
          deps.openProductDetailModal?.(productId);
        });
      });

      container.querySelectorAll("[data-promote-product]").forEach((button) => {
        button.addEventListener("click", async () => {
          const product = deps.getProductById ? deps.getProductById(button.dataset.promoteProduct) : deps.getProducts().find((item) => item.id === button.dataset.promoteProduct);
          if (!product) {
            return;
          }

          const selectedType = prompt([
            "Chagua promotion type:",
            "boost = Boost Product (TSh 5,000 / 3 days)",
            "featured = Featured Section (TSh 10,000 / 7 days)",
            "category_boost = Category Boost (TSh 7,000 / 5 days)",
            "pin_top = Pin To Top (TSh 12,000 / 2 days)"
          ].join("\n"), "boost");

          if (!selectedType || !deps.getPromotionOptions()[selectedType]) {
            return;
          }

          const option = deps.getPromotionOptions()[selectedType];
          const transactionReference = prompt([
            "Lipa kwa Mobile Money kwa promotion hii.",
            `Product: ${product.name}`,
            `Promotion: ${option.label}`,
            `Amount: TSh ${deps.formatNumber(option.amount)}`,
            `Use seller number for now: ${product.whatsapp}`,
            "",
            "Baada ya kulipa, weka transaction reference."
          ].join("\n"), "");

          if (!transactionReference || !transactionReference.trim()) {
            return;
          }

          try {
            await deps.dataLayer.createPromotion({
              productId: product.id,
              type: selectedType,
              transactionReference: transactionReference.trim()
            });
            await deps.refreshPromotionsState();
            deps.reportEvent?.("info", "promotion_created", "Seller created a promotion.", {
              productId: product.id,
              type: selectedType
            });
            deps.showInAppNotification?.({
              title: "Promotion submitted",
              body: "Promotion imewasilishwa. Utaiona ikishaingia active au ikireviewiwa.",
              variant: "success"
            });
            renderProfile();
            deps.renderCurrentView();
          } catch (error) {
            deps.captureError?.("promotion_create_failed", error, {
              productId: product.id,
              type: selectedType
            });
            deps.showInAppNotification?.({
              title: "Promotion failed",
              body: error.message || "Promotion imeshindikana.",
              variant: "error"
            });
          }
        });
      });

      container.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", () => deps.deleteProduct(button.dataset.id));
      });

      deps.bindProductMenus(container);
      profileDiv.querySelector("#profile-logout-button")?.addEventListener("click", deps.logout);
      bindProfileIdentityActions();
      deps.bindRequestBoxActions(profileDiv);
      deps.bindMessageActions(profileDiv);

      profileDiv.style.display = "block";
      deps.setResultsMeta(`${userProducts.length} bidhaa zako`, "Hapa unasimamia bidhaa zako zote.");
    }

    return {
      renderProfile,
      bindProfileIdentityActions
    };
  }

  window.WingaModules.profile.createProfileControllerModule = createProfileControllerModule;
})();


// src/product-detail/ui.js
(() => {
  function createProductDetailUiModule(deps) {
    function ensureProductDetailModal() {
      let modal = document.getElementById("product-detail-modal");
      if (modal) {
        return modal;
      }

      modal = document.createElement("div");
      modal.id = "product-detail-modal";
      modal.style.display = "none";
      const dialog = deps.createElement("div", {
        className: "product-detail-dialog",
        attributes: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "product-detail-title"
        }
      });
      const topbar = deps.createElement("div", {
        className: "product-detail-topbar"
      });
      topbar.appendChild(deps.createElement("button", {
        className: "product-detail-back",
        textContent: "\u2190",
        attributes: {
          type: "button",
          "aria-label": "Go back from product detail",
          "data-close-product-detail": "true"
        }
      }));
      dialog.append(
        topbar,
        deps.createElement("div", { attributes: { id: "product-detail-content" } })
      );
      modal.replaceChildren(dialog);
      document.body.appendChild(modal);
      return modal;
    }

    function createDetailSectionHeading(eyebrow, title) {
      const heading = deps.createElement("div", { className: "section-heading" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: eyebrow }),
        deps.createElement("h3", { textContent: title })
      );
      heading.appendChild(copy);
      return heading;
    }

    function createDeepLinkPanel(product) {
      if (!deps.isAdminUser?.()) {
        return null;
      }
      const deepLink = typeof deps.getProductDetailPath === "function"
        ? `${window.location.origin}${deps.getProductDetailPath(product.id)}`
        : `${window.location.origin}/product/${encodeURIComponent(String(product.id || "").trim())}`;
      const panel = deps.createElement("div", { className: "product-detail-deep-link panel" });
      panel.append(
        deps.createElement("p", { className: "eyebrow", textContent: "Admin Deep Link" }),
        deps.createElement("strong", { textContent: "Share this exact product route" }),
        deps.createElement("code", {
          className: "product-detail-deep-link-value",
          textContent: deepLink
        })
      );
      const actions = deps.createElement("div", { className: "product-detail-deep-link-actions" });
      actions.append(
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Copy Deep Link",
          attributes: {
            type: "button",
            "data-copy-product-deep-link": deepLink
          }
        }),
        deps.createElement("a", {
          className: "action-btn",
          textContent: "Open Link",
          attributes: {
            href: deepLink,
            target: "_blank",
            rel: "noopener noreferrer"
          }
        })
      );
      panel.appendChild(actions);
      return panel;
    }

    function createDetailCaptionElement(item) {
      const captionText = String(item.description || item.caption || item.name || "").trim();
      if (!captionText) {
        return null;
      }
      const wrapper = deps.createElement("div", {
        className: "product-card-caption-block"
      });
      wrapper.appendChild(deps.createElement("p", {
        className: "product-card-caption",
        textContent: captionText
      }));
      if (captionText.length > 120) {
        wrapper.classList.add("is-collapsed");
        const toggle = deps.createElement("button", {
          className: "product-caption-toggle",
          textContent: "See more",
          attributes: {
            type: "button",
            "data-product-caption-toggle": "true",
            "aria-expanded": "false"
          }
        });
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isExpanded = wrapper.classList.toggle("is-expanded");
          wrapper.classList.toggle("is-collapsed", !isExpanded);
          toggle.textContent = isExpanded ? "See less" : "See more";
          toggle.setAttribute("aria-expanded", String(isExpanded));
        });
        wrapper.appendChild(toggle);
      }
      return wrapper;
    }

    function createDetailContinuationSellerRowElement(item) {
      const sellerRow = deps.createElement("div", { className: "product-seller-row" });
      const sellerAvatar = deps.createElement("div", { className: "product-seller-avatar" });
      const sellerUser = deps.getMarketplaceUser?.(item?.uploadedBy);
      const sellerImage = String(sellerUser?.profileImage || "").trim();
      if (sellerImage) {
        sellerAvatar.appendChild(deps.createElement("img", {
          className: "product-seller-avatar-image",
          attributes: {
            src: sellerImage,
            alt: deps.escapeHtml(item.shop || sellerUser?.fullName || item.uploadedBy || "Seller"),
            loading: "lazy",
            decoding: "async"
          }
        }));
      } else {
        const label = String(item.shop || sellerUser?.fullName || item.uploadedBy || "Seller").trim();
        sellerAvatar.textContent = label
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join("")
          .toUpperCase() || "S";
      }

      const sellerCopy = deps.createElement("div", { className: "product-seller-copy" });
      sellerCopy.append(
        deps.createElement("strong", {
          className: "product-seller-name",
          textContent: String(item.shop || sellerUser?.fullName || item.uploadedBy || "Seller").trim()
        }),
        deps.createElement("span", {
          className: "product-seller-meta",
          textContent: String(item.location || deps.getCategoryLabel(item.category) || "").trim()
        })
      );

      sellerRow.append(
        sellerAvatar,
        sellerCopy,
        deps.createElement("span", {
          className: "product-seller-badge",
          textContent: sellerUser?.verifiedSeller ? "Verified" : "Seller"
        })
      );
      return sellerRow;
    }

    function createDetailContinuationCardElement(item) {
      const card = deps.createElement("article", {
        className: "product-card seller-product-card",
        attributes: { "data-open-product": item.id }
      });
      card.dataset.openProduct = item.id;
      const media = deps.createElement("div", {
        className: "product-card-media seller-product-card-media"
      });
      const galleryMarkup = deps.renderFeedGalleryMarkup?.(item, "feed");
      if (galleryMarkup) {
        media.appendChild(deps.createFragmentFromMarkup(galleryMarkup));
      } else {
        const itemImageSrc = deps.getMarketplacePrimaryImage
          ? deps.getMarketplacePrimaryImage(item, {
              allowOwnerVisibility: item.uploadedBy === deps.getCurrentUser()
            })
          : deps.sanitizeImageSource(item.image || "", deps.getImageFallbackDataUri("W"));
        media.appendChild(deps.createElement("img", {
          className: "zoomable-image",
          attributes: {
            src: itemImageSrc || deps.getImageFallbackDataUri("W"),
            alt: deps.escapeHtml(item.name || ""),
            loading: "lazy",
            "data-marketplace-scroll-image": "true",
            "data-zoom-src": itemImageSrc || deps.getImageFallbackDataUri("W"),
            "data-zoom-alt": deps.escapeHtml(item.name || ""),
            "data-image-action-product": item.id,
            "data-image-action-src": itemImageSrc || deps.getImageFallbackDataUri("W"),
            "data-image-action-surface": "detail-related",
            "data-fallback-src": deps.getImageFallbackDataUri("W")
          }
        }));
      }

      const body = deps.createElement("div", {
        className: "product-content product-content-simple product-content-social seller-product-body"
      });
      body.appendChild(createDetailContinuationSellerRowElement(item));
      const captionBlock = createDetailCaptionElement(item);
      if (captionBlock) {
        body.appendChild(captionBlock);
      }
      const itemTrustBadges = deps.renderMarketplaceTrustBadges?.(item, { hideVerifiedBadge: true });
      if (itemTrustBadges) {
        body.appendChild(deps.createFragmentFromMarkup(itemTrustBadges));
      }
      body.appendChild(deps.createFragmentFromMarkup(
        deps.renderProductActionGroup(item, { requestLabel: "My Request", extraClass: "seller-product-actions" })
      ));
      card.append(media, body);
      return card;
    }

    function createDetailShowcaseSectionElement({ eyebrow = "", title = "", items = [], attributes = {} } = {}) {
      const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!safeItems.length) {
        return null;
      }
      const section = deps.createElement("section", {
        className: "product-detail-seller-products",
        attributes
      });
      section.appendChild(createDetailSectionHeading(eyebrow || title, title || eyebrow));
      if (deps.renderDiscoveryProductCards) {
        section.appendChild(deps.createFragmentFromMarkup(
          deps.renderDiscoveryProductCards(safeItems, {
            sponsored: Boolean(attributes?.["data-product-detail-continuation-kind"] === "sponsored"),
            priorityCount: Math.min(4, safeItems.length)
          })
        ));
        return section;
      }
      const track = deps.createElement("div", {
        className: "showcase-track product-detail-showcase-track"
      });
      safeItems.forEach((item) => track.appendChild(createDetailContinuationCardElement(item)));
      section.appendChild(track);
      return section;
    }

    function createProductDetailContentElement(params) {
      const {
        product,
        seller,
        otherProducts,
        continuationSections,
        mainImage,
        showFloatingHomeAction,
        floatingHomeVariant,
        productReviewSummaryMarkup,
        sellerReviewSummaryMarkup,
        reviewFormMarkup,
        reviewListMarkup
      } = params;

      const safeProductName = deps.escapeHtml(product.name || "");
      const safeCategoryLabel = deps.escapeHtml(deps.getCategoryLabel(product.category));
      const safeSellerName = deps.escapeHtml(seller?.fullName || product.shop || product.uploadedBy || "");

      const detailImages = deps.getRenderableMarketplaceImages
        ? deps.getRenderableMarketplaceImages(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser()
          }).map((item) => deps.sanitizeImageSource(item || "", deps.getImageFallbackDataUri("W"))).filter(Boolean)
        : (Array.isArray(product.images) && product.images.length
          ? product.images.map((item) => deps.sanitizeImageSource(item || "", deps.getImageFallbackDataUri("W"))).filter(Boolean)
          : []);
      const safeMainImage = deps.sanitizeImageSource(mainImage || detailImages[0] || "", deps.getImageFallbackDataUri("WINGA"));
      if (deps.preloadImageSource) {
        [safeMainImage, ...detailImages.slice(0, 2)]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .forEach((item, index) => {
            deps.preloadImageSource(item, { fetchPriority: index === 0 ? "high" : "auto" });
          });
      }

      const wrapper = deps.createElement("div");
      const layout = deps.createElement("div", { className: "product-detail-layout" });
      const useFeedCarousel = detailImages.length > 1 && typeof deps.renderFeedGalleryMarkup === "function";
      const media = deps.createElement("div", {
        className: `product-detail-media${detailImages.length > 1 && !useFeedCarousel ? " has-media-stack" : ""}`
      });
      if (useFeedCarousel) {
        media.appendChild(deps.createFragmentFromMarkup(deps.renderFeedGalleryMarkup(product, "feed", {
          priorityCount: Math.min(4, detailImages.length),
          preload: true
        })));
      } else {
        const mainImageElement = deps.createElement("img", {
          className: "product-detail-image zoomable-image",
          attributes: {
            src: safeMainImage,
            alt: safeProductName,
            loading: "eager",
            fetchpriority: "high",
            "data-zoom-src": safeMainImage,
            "data-zoom-alt": safeProductName,
            "data-image-action-product": product.id,
            "data-image-action-src": safeMainImage,
            "data-image-action-surface": "detail",
            "data-fallback-src": deps.getImageFallbackDataUri("WINGA")
          }
        });
        media.appendChild(mainImageElement);
        if (detailImages.length > 1) {
          const thumbGrid = deps.createElement("div", { className: "product-detail-thumb-grid" });
          detailImages.forEach((image, index) => {
          thumbGrid.appendChild(deps.createElement("img", {
              className: `product-detail-thumb${image === safeMainImage ? " active" : ""}`,
              attributes: {
                src: image,
                alt: `${safeProductName} ${index + 1}`,
                loading: index < 4 ? "eager" : "lazy",
                fetchpriority: index < 4 ? "high" : "auto",
                "data-detail-image": image,
                "data-detail-image-index": String(index),
                "data-disable-image-zoom": "true",
                "data-image-action-product": product.id,
                "data-image-action-src": image,
                "data-image-action-surface": "detail-thumb",
                "data-fallback-src": deps.getImageFallbackDataUri("W")
              }
            }));
          });
          media.appendChild(thumbGrid);
        }
      }

      const copy = deps.createElement("div", { className: "product-detail-copy" });
      copy.append(
        deps.createElement("p", {
          className: "product-detail-price",
          textContent: deps.formatProductPrice(product.price)
        }),
        deps.createElement("h3", {
          textContent: safeProductName,
          attributes: { id: "product-detail-title" }
        }),
        deps.createElement("p", { className: "product-detail-category", textContent: safeCategoryLabel }),
        deps.createElement("p", { className: "product-detail-seller", textContent: `Muuzaji: ${safeSellerName}` })
      );
      const trustBadges = deps.renderMarketplaceTrustBadges?.(product);
      if (trustBadges) {
        copy.appendChild(deps.createFragmentFromMarkup(trustBadges));
      }

      const sellerTrustPanel = deps.renderSellerTrustPanel?.(product);
      if (sellerTrustPanel) {
        copy.appendChild(deps.createFragmentFromMarkup(sellerTrustPanel));
      }

      const deepLinkPanel = createDeepLinkPanel(product);
      if (deepLinkPanel) {
        copy.appendChild(deepLinkPanel);
      }

      const reviewStack = deps.createElement("div", { className: "product-detail-review-stack" });
      [productReviewSummaryMarkup, sellerReviewSummaryMarkup].filter(Boolean).forEach((markup) => {
        reviewStack.appendChild(deps.createFragmentFromMarkup(markup));
      });
      copy.appendChild(reviewStack);

      const actionsMarkup = deps.renderProductActionGroup?.(product, {
        extraClass: "product-detail-actions"
      });
      if (actionsMarkup) {
        copy.appendChild(deps.createFragmentFromMarkup(actionsMarkup));
      }

      const reviewsPanel = deps.createElement("section", { className: "product-detail-reviews-panel" });
      reviewsPanel.appendChild(createDetailSectionHeading("Ratings & Reviews", "Trust from real buyers"));
      [reviewFormMarkup, reviewListMarkup].filter(Boolean).forEach((markup) => {
        reviewsPanel.appendChild(deps.createFragmentFromMarkup(markup));
      });
      copy.appendChild(reviewsPanel);

      layout.append(media, copy);
      wrapper.appendChild(layout);

      if (otherProducts.length) {
        const section = createDetailShowcaseSectionElement({
          eyebrow: "Bidhaa Zaidi Kutoka Kwa Muuzaji",
          title: `Bidhaa nyingine kutoka kwa ${safeSellerName}`,
          items: otherProducts
        });
        if (section) {
          wrapper.appendChild(section);
        }
      }

      (Array.isArray(continuationSections) ? continuationSections : []).forEach((sectionConfig) => {
        const items = Array.isArray(sectionConfig?.items) ? sectionConfig.items : [];
        if (!items.length) {
          return;
        }
        const section = createDetailShowcaseSectionElement({
          eyebrow: sectionConfig.eyebrow || sectionConfig.title || "",
          title: sectionConfig.title || "",
          items
        });
        if (section) {
          wrapper.appendChild(section);
        }
      });

      if (params.enableContinuousDiscovery) {
        const anchor = deps.createElement("section", {
          className: "continuous-discovery-anchor",
          attributes: {
            "data-product-detail-continuous-anchor": "true"
          }
        });
        anchor.append(
          deps.createElement("p", { className: "eyebrow", textContent: "Winga is loading more" }),
          deps.createElement("strong", { textContent: "More products are lining up below" }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: "You keep getting more from this seller first, then wider marketplace picks follow."
          })
        );
        wrapper.appendChild(anchor);
      }

      if (showFloatingHomeAction) {
        wrapper.appendChild(deps.createElement("button", {
          className: `product-detail-home-fab product-detail-home-fab-${floatingHomeVariant === "light" ? "light" : "dark"}`,
          textContent: "Home",
          attributes: {
            type: "button",
            "aria-label": "Go home from product detail",
            "data-product-detail-home": "true"
          }
        }));
      }

      return wrapper;
    }

    return {
      ensureProductDetailModal,
      createProductDetailContentElement,
      createDetailShowcaseSectionElement
    };
  }

  window.WingaModules.productDetail.createProductDetailUiModule = createProductDetailUiModule;
})();


// src/product-detail/controller.js
(() => {
  function createProductDetailControllerModule(deps) {
    let detailNavState = {
      rootScrollY: 0,
      rootProductId: "",
      activeProductId: "",
      detailDepth: 0,
      productTrail: []
    };

    let isSyncingHistoryState = false;
    let pendingHomeNavigation = false;
    let detailContinuousRuntime = {
      observer: null,
      batchIndex: 0,
      recentIds: [],
      usedIds: new Set(),
      seedProductId: "",
      loading: false
    };
    const MAX_ACTIVE_DETAIL_CONTINUATION_SECTIONS = 4;
    const MAX_DETAIL_CONTINUATION_USED_IDS = 120;

    function normalizeProductIdValue(value) {
      const rawValue = String(value || "").trim();
      if (!rawValue) {
        return "";
      }
      return rawValue
        .replace(/^\/+/, "")
        .replace(/^product\/+/i, "")
        .replace(/^\/+/, "")
        .trim();
    }

    function normalizeProductTrail(trail = []) {
      if (!Array.isArray(trail)) {
        return [];
      }
      return trail
        .map((value) => normalizeProductIdValue(value))
        .filter(Boolean);
    }

    function isDetailHistoryState(state) {
      return Boolean(state?.wingaProductDetail && normalizeProductIdValue(state?.productId));
    }

    function buildDetailHistoryState(productId, sourceProductId = "") {
      const normalizedProductId = normalizeProductIdValue(productId);
      const normalizedSourceProductId = normalizeProductIdValue(sourceProductId || detailNavState.rootProductId || normalizedProductId);
      const normalizedTrail = normalizeProductTrail(detailNavState.productTrail);
      return {
        ...(window.history.state && typeof window.history.state === "object" ? window.history.state : {}),
        wingaProductDetail: true,
        productId: normalizedProductId,
        sourceProductId: normalizedSourceProductId,
        detailDepth: Math.max(1, Number(detailNavState.detailDepth || detailNavState.productTrail.length || 1)),
        productTrail: normalizedTrail.length
          ? normalizedTrail
          : [normalizedSourceProductId, normalizedProductId].filter(Boolean)
      };
    }

    function syncHistoryForDetail(productId, sourceProductId = "") {
      if (isSyncingHistoryState || !window.history?.pushState) {
        return;
      }
      const normalizedProductId = normalizeProductIdValue(productId);
      if (!normalizedProductId) {
        return;
      }
      const nextUrl = typeof deps.getProductDetailPath === "function"
        ? deps.getProductDetailPath(normalizedProductId)
        : window.location.href;
      window.history.pushState(buildDetailHistoryState(normalizedProductId, sourceProductId), "", nextUrl);
    }

    function syncHistoryForClose() {
      if (!window.history?.state || !isDetailHistoryState(window.history.state)) {
        return false;
      }
      isSyncingHistoryState = true;
      window.history.back();
      window.setTimeout(() => {
        isSyncingHistoryState = false;
      }, 0);
      return true;
    }

    function getSellerOtherProducts(product, limit = 6) {
      if (!product?.uploadedBy) {
        return [];
      }
      return deps.getProducts().filter((item) =>
        item.id !== product.id
        && item.uploadedBy === product.uploadedBy
        && item.status === "approved"
        && item.availability !== "sold_out"
        && (typeof deps.shouldRenderMarketplaceProduct !== "function"
          || deps.shouldRenderMarketplaceProduct(item, {
            allowOwnerVisibility: item.uploadedBy === deps.getCurrentUser?.()
          }))
      ).slice(0, limit);
    }

    function getRemainingSellerProducts(product, excludeIds = new Set(), limit = 8) {
      if (!product?.uploadedBy) {
        return [];
      }
      return deps.getProducts().filter((item) =>
        item.id !== product.id
        && item.uploadedBy === product.uploadedBy
        && item.status === "approved"
        && item.availability !== "sold_out"
        && !excludeIds.has(item.id)
        && (typeof deps.shouldRenderMarketplaceProduct !== "function"
          || deps.shouldRenderMarketplaceProduct(item, {
            allowOwnerVisibility: item.uploadedBy === deps.getCurrentUser?.()
          }))
      ).slice(0, limit);
    }

    function getFloatingHomeVariant(product) {
      const signature = typeof product?.imageSignature === "string" ? product.imageSignature.trim() : "";
      if (!signature) {
        return "dark";
      }
      const lightPixels = signature.split("").reduce((count, bit) => count + (bit === "1" ? 1 : 0), 0);
      return lightPixels / Math.max(signature.length, 1) >= 0.52 ? "dark" : "light";
    }

    function appendContinuationSection(sections, shownProductIds, config) {
      const items = (Array.isArray(config?.items) ? config.items : []).filter((item) => item && !shownProductIds.has(item.id));
      if (!items.length) {
        return;
      }
      items.forEach((item) => shownProductIds.add(item.id));
      sections.push({
        eyebrow: config.eyebrow || "",
        title: config.title || "",
        sponsored: Boolean(config.sponsored),
        items
      });
    }

    function rememberRecentIds(currentIds = [], nextIds = [], limit = 40) {
      return [...currentIds, ...nextIds.filter(Boolean)].slice(-limit);
    }

    function pruneOrderedIdSet(idSet, limit = 120) {
      if (!(idSet instanceof Set) || !Number.isFinite(limit) || limit < 1) {
        return idSet;
      }
      while (idSet.size > limit) {
        const oldestId = idSet.values().next().value;
        if (typeof oldestId === "undefined") {
          break;
        }
        idSet.delete(oldestId);
      }
      return idSet;
    }

    function releasePrunedSectionMedia(section) {
      if (!(section instanceof Element)) {
        return;
      }
      deps.unbindMarketplaceScrollImages?.(section);
      section.querySelectorAll("img").forEach((image) => {
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.removeAttribute("src");
        image.removeAttribute("data-zoom-src");
        image.removeAttribute("data-image-action-src");
      });
      section.querySelectorAll("source").forEach((source) => {
        source.removeAttribute("srcset");
        source.removeAttribute("src");
      });
      section.querySelectorAll("video").forEach((video) => {
        try {
          video.pause?.();
          video.removeAttribute("src");
          video.load?.();
        } catch (error) {
          // Ignore cleanup failures for detached media nodes.
        }
      });
    }

    function disconnectDetailContinuousObserver() {
      if (detailContinuousRuntime.observer) {
        detailContinuousRuntime.observer.disconnect();
      }
      if (detailContinuousRuntime.reobserveTimer) {
        window.clearTimeout(detailContinuousRuntime.reobserveTimer);
      }
      detailContinuousRuntime = {
        observer: null,
        batchIndex: 0,
        recentIds: [],
        usedIds: new Set(),
        seedProductId: "",
        loading: false,
        reobserveTimer: 0
      };
    }

    function scheduleDetailContinuousReobserve(anchor, modal) {
      if (!anchor || !anchor.isConnected || !modal?.isConnected || !detailContinuousRuntime.observer) {
        return;
      }
      if (detailContinuousRuntime.reobserveTimer) {
        window.clearTimeout(detailContinuousRuntime.reobserveTimer);
      }
      detailContinuousRuntime.reobserveTimer = window.setTimeout(() => {
        detailContinuousRuntime.reobserveTimer = 0;
        if (!anchor.isConnected || !modal?.isConnected || !detailContinuousRuntime.observer) {
          return;
        }
        detailContinuousRuntime.observer.observe(anchor);
      }, 180);
    }

    function createDetailContinuationSectionElement(descriptor, index) {
      if (!descriptor || !Array.isArray(descriptor.items) || !descriptor.items.length) {
        return null;
      }
      return deps.createDetailShowcaseSectionElement?.({
        eyebrow: descriptor.eyebrow || "Keep Exploring",
        title: descriptor.title || `More products ${index}`,
        items: descriptor.items,
        attributes: {
          "data-product-detail-continuation-section": String(index),
          "data-product-detail-continuation-kind": descriptor.kind || "continuation"
        }
      }) || null;
    }

    function trimDetailContinuationSections(anchor) {
      const modal = anchor?.closest?.("#product-detail-modal");
      if (!modal) {
        return;
      }
      const sections = Array.from(modal.querySelectorAll("[data-product-detail-continuation-section]"));
      if (sections.length <= MAX_ACTIVE_DETAIL_CONTINUATION_SECTIONS) {
        return;
      }
      sections.slice(0, sections.length - MAX_ACTIVE_DETAIL_CONTINUATION_SECTIONS).forEach((section) => {
        releasePrunedSectionMedia(section);
        section.remove();
      });
    }

    function bindInlineProductActions(scope, product) {
      scope.querySelectorAll("[data-open-product]").forEach((card) => {
        if (card.dataset.detailBound === "true") {
          return;
        }
        card.dataset.detailBound = "true";
        card.addEventListener("click", (event) => {
          if (event.target.closest("[data-request-product], [data-chat-product], [data-open-own-messages], [data-open-product-whatsapp], [data-buy-product], [data-detail-repost], .product-menu")) {
            return;
          }
          openProductDetailModal(card.dataset.openProduct, {
            sourceProductId: product.id
          });
        });
      });
    }

    function hydrateDetailContinuousAnchor(modal, anchor, product) {
      if (!anchor || detailContinuousRuntime.loading) {
        return;
      }
      detailContinuousRuntime.loading = true;
      detailContinuousRuntime.observer?.unobserve(anchor);
      const seedProduct = (deps.getProductById ? deps.getProductById(detailContinuousRuntime.seedProductId) : null) || product;
      const sellerFirstItems = getRemainingSellerProducts(seedProduct, detailContinuousRuntime.usedIds, 8);
      const descriptor = sellerFirstItems.length
        ? {
          kind: "same-seller",
          eyebrow: "More From This Seller",
          title: "Keep browsing this seller first",
          subtitle: "Winga continues with more items from the same seller before widening discovery.",
          items: sellerFirstItems
        }
        : deps.getContinuousDiscoveryDescriptor?.({
          seedProduct,
          usedIds: detailContinuousRuntime.usedIds,
          recentIds: detailContinuousRuntime.recentIds,
          batchIndex: detailContinuousRuntime.batchIndex
        });
      if (!descriptor) {
        detailContinuousRuntime.loading = false;
        scheduleDetailContinuousReobserve(anchor, modal);
        return;
      }
      const section = createDetailContinuationSectionElement(descriptor, detailContinuousRuntime.batchIndex + 1);
      if (!section) {
        detailContinuousRuntime.loading = false;
        scheduleDetailContinuousReobserve(anchor, modal);
        return;
      }
      anchor.after(section);
      section.after(anchor);
      deps.enhanceShowcaseTracks?.(section);
      deps.bindFeedGalleryInteractions?.(section);
      bindInlineProductActions(section, product);
      deps.bindProductMenus?.(section);
      deps.bindImageFallbacks?.(section);
      trimDetailContinuationSections(anchor);
      const appendedIds = descriptor.items.map((item) => item.id);
      appendedIds.forEach((productId) => detailContinuousRuntime.usedIds.add(productId));
      pruneOrderedIdSet(detailContinuousRuntime.usedIds, MAX_DETAIL_CONTINUATION_USED_IDS);
      detailContinuousRuntime.recentIds = rememberRecentIds(detailContinuousRuntime.recentIds, appendedIds);
      detailContinuousRuntime.batchIndex += 1;
      detailContinuousRuntime.loading = false;
      scheduleDetailContinuousReobserve(anchor, modal);
    }

    function setupDetailContinuousDiscovery(modal, product, usedIds = new Set()) {
      disconnectDetailContinuousObserver();
      const anchor = modal.querySelector("[data-product-detail-continuous-anchor='true']");
      if (!anchor) {
        return;
      }

      detailContinuousRuntime.usedIds = new Set(Array.from(usedIds || []).filter(Boolean));
      detailContinuousRuntime.recentIds = [];
      detailContinuousRuntime.seedProductId = product.id;

      if (typeof IntersectionObserver === "undefined") {
        for (let cycle = 0; cycle < 3; cycle += 1) {
          hydrateDetailContinuousAnchor(modal, anchor, product);
        }
        return;
      }

      detailContinuousRuntime.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || detailContinuousRuntime.loading) {
            return;
          }
          hydrateDetailContinuousAnchor(modal, anchor, product);
        });
      }, {
        root: modal,
        rootMargin: "760px 0px 620px 0px"
      });
      detailContinuousRuntime.observer.observe(anchor);
    }

    function finalizeHomeNavigation() {
      closeProductDetailModal({
        skipHistoryBack: true,
        skipContextRestore: false,
        skipRootCardScroll: true
      });
      deps.resetHomeBrowseState?.();
      deps.setCurrentViewState?.("home");
      deps.renderCurrentView?.();
      deps.syncAppShellHistoryState?.({
        force: true,
        url: "/"
      });
    }

    function goHomeFromProductDetail() {
      deps.resetHomeBrowseState?.();
      deps.refreshSearchInputControl?.();
      finalizeHomeNavigation();
    }

    function resetProductDetailHorizontalState(modal) {
      if (!modal) {
        return;
      }
      const dialog = modal.querySelector(".product-detail-dialog");
      const content = modal.querySelector("#product-detail-content");
      const layout = modal.querySelector(".product-detail-layout");
      try {
        window.scrollTo({
          left: 0,
          top: window.scrollY || window.pageYOffset || 0,
          behavior: "auto"
        });
      } catch (error) {
        // Ignore viewport reset failures.
      }
      try {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      } catch (error) {
        // Ignore document horizontal reset failures.
      }
      const targets = [
        modal,
        dialog,
        content,
        layout
      ].filter(Boolean);
      targets.forEach((node) => {
        try {
          node.scrollLeft = 0;
        } catch (error) {
          // Ignore nodes that cannot scroll horizontally.
        }
      });
      // Ensure no lingering horizontal transform or offsets keep the detail shell shifted.
      [dialog, content, layout].filter(Boolean).forEach((node) => {
        try {
          node.style.transform = "none";
        } catch (error) {
          // Ignore nodes that cannot accept inline style updates.
        }
      });
      if (modal) {
        try {
          modal.style.display = "grid";
          modal.style.left = "0";
          modal.style.right = "0";
          modal.style.marginLeft = "0";
          modal.style.marginRight = "0";
          modal.style.width = "100vw";
          modal.style.maxWidth = "100vw";
        } catch (error) {
          // Ignore modal style updates.
        }
      }
      if (dialog) {
        try {
          dialog.style.width = "min(1100px, calc(100vw - 24px))";
          dialog.style.maxWidth = "calc(100vw - 24px)";
          dialog.style.marginLeft = "auto";
          dialog.style.marginRight = "auto";
        } catch (error) {
          // Ignore dialog style updates.
        }
      }
      window.requestAnimationFrame(() => {
        targets.forEach((node) => {
          try {
            node.scrollLeft = 0;
          } catch (error) {
            // Ignore nodes that cannot scroll horizontally.
          }
        });
        [modal, dialog, content, layout].filter(Boolean).forEach((node) => {
          try {
            node.style.transform = "none";
          } catch (error) {
            // Ignore nodes that cannot accept inline style updates.
          }
        });
      });
    }

    function closeProductDetailModal(options = {}) {
      const {
        skipHistoryBack = false,
        skipContextRestore = false,
        skipRootCardScroll = false
      } = options;
      if (!skipHistoryBack && syncHistoryForClose()) {
        return;
      }
      const modal = document.getElementById("product-detail-modal");
      if (!modal) {
        return;
      }
      const restoreScrollY = Number(detailNavState.rootScrollY || 0) || 0;
      modal.style.display = "none";
      document.body.classList.remove("product-detail-open");
      disconnectDetailContinuousObserver();
      deps.syncBodyScrollLockState?.();
      deps.resetProductDiscoveryTrail();
      deps.resetReviewDraft();
      if (!skipContextRestore) {
        if (restoreScrollY > 0) {
          deps.scheduleHomeScrollRestore?.(restoreScrollY);
        }
      }
      detailNavState = {
        rootScrollY: 0,
        rootProductId: "",
        activeProductId: "",
        detailDepth: 0,
        productTrail: []
      };
      deps.syncAppShellHistoryState?.({
        force: true,
        url: window.location.pathname.startsWith("/product/") ? "/" : undefined
      });
    }

    function bindProductDetailActions(modal, product) {
      modal.querySelectorAll("[data-close-product-detail]").forEach((button) => {
        button.addEventListener("click", closeProductDetailModal);
      });

      modal.querySelectorAll("[data-product-detail-home]").forEach((button) => {
        button.addEventListener("click", goHomeFromProductDetail);
      });

      modal.querySelectorAll("[data-detail-buy]").forEach((button) => {
        button.addEventListener("click", () => deps.beginPurchaseFlow(product));
      });

      modal.querySelectorAll("[data-detail-repost]").forEach((button) => {
        button.addEventListener("click", () => deps.repostProductAsSeller(product));
      });
      bindInlineProductActions(modal, product);

      modal.querySelectorAll("[data-review-rating]").forEach((button) => {
        button.addEventListener("click", () => {
          const draft = deps.getProductDetailReviewDraft(product.id);
          draft.rating = Number(button.dataset.reviewRating || 5);
          openProductDetailModal(product.id, {
            skipHistoryPush: true
          });
        });
      });

      modal.querySelector(`[data-review-comment="${product.id}"]`)?.addEventListener("input", (event) => {
        const draft = deps.getProductDetailReviewDraft(product.id);
        draft.comment = event.target.value || "";
      });

      modal.querySelector(`[data-product-review-form="${product.id}"]`)?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const draft = deps.getProductDetailReviewDraft(product.id);
        if (!draft.comment || draft.comment.trim().length < 3) {
          deps.showInAppNotification?.({
            title: "Review needed",
            body: "Review inahitaji maoni mafupi yenye maana.",
            variant: "warning"
          });
          return;
        }

        try {
          await deps.dataLayer.createReview({
            productId: product.id,
            sellerId: product.uploadedBy,
            rating: Number(draft.rating || 5),
            comment: draft.comment.trim()
          });
          const reviewPayload = await deps.dataLayer.loadReviews();
          deps.setCurrentReviews(Array.isArray(reviewPayload?.reviews) ? reviewPayload.reviews : []);
          deps.setReviewSummaries(reviewPayload?.summaries || {});
          deps.resetReviewDraft();
          deps.reportEvent?.("info", "review_created", "Buyer submitted a review.", {
            productId: product.id,
            rating: Number(draft.rating || 5)
          });
          deps.showInAppNotification?.({
            title: "Review sent",
            body: "Asante. Review yako imeongezwa kwenye bidhaa hii.",
            variant: "success"
          });
          openProductDetailModal(product.id, {
            skipHistoryPush: true
          });
        } catch (error) {
          deps.captureError?.("review_create_failed", error, {
            productId: product.id
          });
          deps.showInAppNotification?.({
            title: "Review failed",
            body: error.message || "Imeshindikana kutuma review.",
            variant: "error"
          });
        }
      });

      const mainImage = modal.querySelector(".product-detail-image");
      modal.querySelectorAll("[data-detail-image]").forEach((thumb) => {
        thumb.addEventListener("click", () => {
          if (!mainImage) {
            return;
          }
          const nextImage = thumb.dataset.detailImage || "";
          if (!nextImage) {
            return;
          }
          mainImage.src = nextImage;
          mainImage.dataset.zoomSrc = nextImage;
          mainImage.dataset.imageActionSrc = nextImage;
          modal.querySelectorAll("[data-detail-image]").forEach((item) => {
            item.classList.toggle("active", item === thumb);
          });
        });
      });

      modal.querySelectorAll("[data-copy-product-deep-link]").forEach((button) => {
        if (button.dataset.deepLinkBound === "true") {
          return;
        }
        button.dataset.deepLinkBound = "true";
        button.addEventListener("click", async () => {
          const deepLink = button.dataset.copyProductDeepLink || "";
          if (!deepLink) {
            return;
          }
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(deepLink);
            } else {
              const fallback = document.createElement("textarea");
              fallback.value = deepLink;
              fallback.setAttribute("readonly", "true");
              fallback.style.position = "fixed";
              fallback.style.left = "-9999px";
              document.body.appendChild(fallback);
              fallback.select();
              document.execCommand?.("copy");
              fallback.remove();
            }
            deps.showInAppNotification?.({
              title: "Deep link copied",
              body: "Product deep link ime-copy tayari.",
              variant: "success"
            });
          } catch (error) {
            deps.captureError?.("product_detail_deep_link_copy_failed", error, {
              productId: product?.id || ""
            });
            deps.showInAppNotification?.({
              title: "Copy failed",
              body: error.message || "Imeshindikana ku-copy deep link.",
              variant: "error"
            });
          }
        });
      });
    }

    function openProductDetailModal(productId, options = {}) {
      const normalizedProductId = normalizeProductIdValue(productId);
      const product = deps.getProductById ? deps.getProductById(normalizedProductId) : deps.getProducts().find((item) => item.id === normalizedProductId);
      if (!product) {
        return;
      }
      const isOwnerView = product.uploadedBy === deps.getCurrentUser?.();

      const {
        skipHistoryPush = false,
        sourceProductId = normalizedProductId,
        restoreDetailScrollTop = 0,
        fromHistoryNavigation = false,
        historyDepth = 0,
        allowBrokenImageFallbackOpen = false
      } = options;

      const renderableImages = typeof deps.getRenderableMarketplaceImages === "function"
        ? deps.getRenderableMarketplaceImages(product, {
            allowOwnerVisibility: isOwnerView
          })
        : [];

      if (
        typeof deps.shouldRenderMarketplaceProduct === "function"
        && !deps.shouldRenderMarketplaceProduct(product, {
          allowOwnerVisibility: isOwnerView
        })
        && !allowBrokenImageFallbackOpen
      ) {
        closeProductDetailModal({
          skipHistoryBack: true,
          skipContextRestore: true
        });
        return;
      }

      const modal = deps.ensureProductDetailModal();
      const isAlreadyOpen = document.body.classList.contains("product-detail-open") && modal.style.display !== "none";
      const previousActiveProductId = detailNavState.activeProductId;
      const historyState = window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : null;
      const historyTrail = normalizeProductTrail(historyState?.productTrail);
      if (!isAlreadyOpen) {
        deps.syncAppShellHistoryState?.({ force: true });
        detailNavState = {
          rootScrollY: window.scrollY || window.pageYOffset || 0,
          rootProductId: normalizeProductIdValue(historyState?.sourceProductId || sourceProductId || normalizedProductId),
          activeProductId: product.id,
          detailDepth: Math.max(
            1,
            Number(historyDepth || historyState?.detailDepth || 0) || 0,
            historyTrail.length || 0,
            1
          ),
          productTrail: historyTrail.length
            ? historyTrail
            : [normalizeProductIdValue(historyState?.sourceProductId || sourceProductId || normalizedProductId) || product.id, product.id].filter(Boolean)
        };
      } else if (!fromHistoryNavigation && detailNavState.rootProductId) {
        detailNavState.rootProductId = normalizeProductIdValue(detailNavState.rootProductId || sourceProductId || normalizedProductId);
        if (previousActiveProductId !== product.id) {
          detailNavState.productTrail = [...detailNavState.productTrail, product.id];
          detailNavState.detailDepth = detailNavState.productTrail.length;
        }
      } else if (fromHistoryNavigation) {
        const nextTrail = Array.isArray(detailNavState.productTrail) && detailNavState.productTrail.length
          ? [...detailNavState.productTrail]
          : historyTrail.length
            ? [...historyTrail]
            : [normalizeProductIdValue(detailNavState.rootProductId || sourceProductId || normalizedProductId) || product.id];
        const existingIndex = nextTrail.indexOf(product.id);
        detailNavState.productTrail = existingIndex >= 0
          ? nextTrail.slice(0, existingIndex + 1)
          : [...nextTrail, product.id];
        detailNavState.detailDepth = Math.max(
          1,
          Number(historyDepth || 0) || 0,
          detailNavState.productTrail.length,
          historyTrail.length || 0
        );
      }
      detailNavState.activeProductId = product.id;
      if (!detailNavState.detailDepth) {
        detailNavState.detailDepth = Math.max(1, detailNavState.productTrail.length || 1);
      }

      deps.noteProductInterest(product.id);
      deps.noteProductDiscovery(product.id);

      const content = modal.querySelector("#product-detail-content");
      const seller = deps.getMarketplaceUser(product.uploadedBy);
      const otherProducts = getSellerOtherProducts(product);
      const shownProductIds = new Set([product.id, ...otherProducts.map((item) => item.id)]);
      const continuationSections = [];
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "Related Products",
        title: "Keep exploring similar products",
        items: deps.getDiscoveryRelatedProducts(product, {
          limit: 8,
          excludeIds: shownProductIds
        })
      });
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "Most Searched",
        title: "Popular products buyers search for most",
        items: deps.getMostSearchedProducts(product, {
          limit: 8,
          excludeIds: shownProductIds
        })
      });
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "New Products",
        title: "Fresh listings from active sellers",
        items: deps.getNewestProducts({
          limit: 8,
          excludeIds: shownProductIds,
          seedProduct: product
        })
      });
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "Sponsored Picks",
        title: "Promoted products you may also like",
        sponsored: true,
        items: deps.getDiscoverySponsoredProducts(product, {
          limit: 4,
          excludeIds: shownProductIds
        })
      });
      const images = renderableImages.length
        ? renderableImages
        : (Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean));
      const mainImage = images[0] || deps.getImageFallbackDataUri("WINGA");

      content?.replaceChildren(deps.createProductDetailContentElement({
        product,
        seller,
        otherProducts,
        continuationSections,
        enableContinuousDiscovery: true,
        mainImage,
        showFloatingHomeAction: detailNavState.detailDepth > 1,
        floatingHomeVariant: getFloatingHomeVariant(product),
        productReviewSummaryMarkup: deps.renderProductReviewSummary(product),
        sellerReviewSummaryMarkup: deps.renderSellerReviewSummary(product.uploadedBy),
        reviewFormMarkup: deps.renderProductReviewForm(product),
        reviewListMarkup: deps.renderProductReviewsList(product)
      }));

      modal.style.display = "grid";
      document.body.classList.add("product-detail-open");
      deps.syncBodyScrollLockState?.();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      modal.scrollTo({
        top: restoreDetailScrollTop || 0,
        left: 0,
        behavior: "auto"
      });
      resetProductDetailHorizontalState(modal);
      if (
        !fromHistoryNavigation
        && !skipHistoryPush
        && (
          !isAlreadyOpen
          || previousActiveProductId !== product.id
          || !isDetailHistoryState(window.history.state)
        )
      ) {
        syncHistoryForDetail(product.id, sourceProductId);
      }
      bindProductDetailActions(modal, product);
      deps.enhanceShowcaseTracks?.(modal);
      deps.bindFeedGalleryInteractions?.(modal);
      deps.bindProductMenus?.(modal);
      deps.bindImageFallbacks?.(modal);
      setupDetailContinuousDiscovery(modal, product, shownProductIds);
    }

    function refreshActiveProductDetail() {
      if (!detailNavState.activeProductId) {
        return;
      }
      const modal = document.getElementById("product-detail-modal");
      if (!modal || modal.style.display === "none") {
        return;
      }
      openProductDetailModal(detailNavState.activeProductId, {
        skipHistoryPush: true,
        sourceProductId: detailNavState.rootProductId || detailNavState.activeProductId,
        restoreDetailScrollTop: modal.scrollTop || 0
      });
    }

    window.addEventListener("popstate", (event) => {
      const modal = document.getElementById("product-detail-modal");
      const isDetailOpen = Boolean(modal && modal.style.display !== "none" && document.body.classList.contains("product-detail-open"));
      if (isDetailHistoryState(event.state)) {
        openProductDetailModal(normalizeProductIdValue(event.state.productId), {
          skipHistoryPush: true,
          sourceProductId: normalizeProductIdValue(event.state.sourceProductId || event.state.productId),
          restoreDetailScrollTop: 0,
          fromHistoryNavigation: true,
          historyDepth: Number(event.state.detailDepth || 1)
        });
        return;
      }
      if (isDetailOpen) {
        closeProductDetailModal({
          skipHistoryBack: true,
          skipContextRestore: pendingHomeNavigation
        });
      }
      if (pendingHomeNavigation) {
        pendingHomeNavigation = false;
        finalizeHomeNavigation();
      }
    });

    return {
      getSellerOtherProducts,
      closeProductDetailModal,
      openProductDetailModal,
      refreshActiveProductDetail
    };
  }

  window.WingaModules.productDetail.createProductDetailControllerModule = createProductDetailControllerModule;
})();

