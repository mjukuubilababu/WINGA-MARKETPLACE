(function () {
  const USERS_KEY = "winga-users";
  const PRODUCTS_KEY = "winga-products";
  const SESSION_KEY = "winga-current-user";
  const MOCK_SEEDED_KEY = "winga-mock-seeded";
  const MOCK_SEED_VERSION_KEY = "winga-mock-seed-version";
  const CATEGORIES_KEY = "winga-categories";
  const MESSAGES_KEY = "winga-messages";
  const REVIEWS_KEY = "winga-reviews";
  const APP_SETTINGS_KEY = "winga-app-settings";
  const OFFLINE_ACTION_QUEUE_KEY_PREFIX = "winga-offline-action-queue";
  const DEMAND_SESSION_KEY = "winga-demand-session";
  const LOCAL_HASH_PREFIX = "pbkdf2_sha256";
  let storageTools = null;
  let offlineQueueTools = null;
  let settingsTools = null;

  function getStorageTools() {
    if (!storageTools) {
      const factory = window.WingaModules?.api?.storageTools?.createStorageTools;
      if (typeof factory !== "function") {
        throw new Error("Winga storage tools module is required before data service boot.");
      }
      storageTools = factory();
    }
    return storageTools;
  }

  function getSettingsTools() {
    if (!settingsTools) {
      const factory = window.WingaModules?.api?.settingsTools?.createSettingsTools;
      if (typeof factory !== "function") {
        throw new Error("Winga settings tools module is required before data service boot.");
      }
      settingsTools = factory();
    }
    return settingsTools;
  }

  function getOfflineQueueTools() {
    if (!offlineQueueTools) {
      const factory = window.WingaModules?.api?.offlineQueue?.createOfflineQueueTools;
      if (typeof factory !== "function") {
        throw new Error("Winga offline queue module is required before data service boot.");
      }
      offlineQueueTools = factory({
        queueKeyPrefix: OFFLINE_ACTION_QUEUE_KEY_PREFIX,
        readSession: readStoredSession,
        safeStorageGet,
        safeStorageSet,
        safeStorageRemove,
        clone,
        getDefaultAdapter: () => state.adapter,
        getNavigator: () => globalThis.navigator,
        dispatchEvent: dispatchOfflineActionQueueEvent
      });
    }
    return offlineQueueTools;
  }

  const DEFAULT_APP_SETTINGS = getSettingsTools().DEFAULT_APP_SETTINGS;
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeStorageGet(key) {
    return getStorageTools().safeStorageGet(key);
  }

  function safeStorageSet(key, value) {
    return getStorageTools().safeStorageSet(key, value);
  }

  function setStorageOrThrow(key, value, label = "data za Winga") {
    return getStorageTools().setStorageOrThrow(key, value, label);
  }

  function safeStorageRemove(key) {
    getStorageTools().safeStorageRemove(key);
  }

  function readStoredJson(key, fallbackValue) {
    return getStorageTools().readStoredJson(key, fallbackValue);
  }

  function normalizeAnalyticsUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function roundAnalyticsTrustScore(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function getAnalyticsTrustTier(score) {
    if (score >= 85) {
      return "Trusted";
    }
    if (score >= 70) {
      return "Strong";
    }
    if (score >= 55) {
      return "Growing";
    }
    return "New";
  }

  function buildSellerAnalyticsSnapshot({ username = "", products = [], users = [], messages = [], reviews = [], orders = [] } = {}) {
    const safeUsername = normalizeAnalyticsUsername(username);
    if (!safeUsername) {
      return null;
    }

    const visibleProducts = products.filter((product) => normalizeAnalyticsUsername(product.uploadedBy) === safeUsername);
    const approvedProducts = visibleProducts.filter((product) => product.status === "approved");
    const relevantMessages = messages.filter((message) =>
      normalizeAnalyticsUsername(message.senderId) === safeUsername
      || normalizeAnalyticsUsername(message.receiverId) === safeUsername
    );
    const conversationThreads = new Set(
      relevantMessages
        .map((message) => normalizeAnalyticsUsername(
          normalizeAnalyticsUsername(message.senderId) === safeUsername ? message.receiverId : message.senderId
        ))
        .filter(Boolean)
    );
    const unreadInquiryThreads = new Set(
      relevantMessages
        .filter((message) =>
          normalizeAnalyticsUsername(message.receiverId) === safeUsername
          && !message.isRead
        )
        .map((message) => normalizeAnalyticsUsername(message.senderId))
        .filter(Boolean)
    );
    const sellerOrders = orders.filter((order) => normalizeAnalyticsUsername(order.sellerUsername) === safeUsername);
    const openOrders = sellerOrders.filter((order) => ["placed", "paid", "confirmed"].includes(String(order.status || "").toLowerCase())).length;
    const completedOrders = sellerOrders.filter((order) => String(order.status || "").toLowerCase() === "delivered").length;
    const repeatBuyers = Object.values(
      sellerOrders.reduce((accumulator, order) => {
        const buyer = normalizeAnalyticsUsername(order.buyerUsername);
        if (!buyer) {
          return accumulator;
        }
        accumulator[buyer] = (accumulator[buyer] || 0) + 1;
        return accumulator;
      }, {})
    ).filter((count) => count > 1).length;
    const sellerReviews = reviews.filter((review) => normalizeAnalyticsUsername(review.sellerId) === safeUsername);
    const averageRating = sellerReviews.length
      ? sellerReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / sellerReviews.length
      : 0;
    const conversionRate = conversationThreads.size > 0
      ? Math.round(((openOrders + completedOrders) / conversationThreads.size) * 100)
      : 0;
    const sellerRecord = users.find((user) => normalizeAnalyticsUsername(user.username) === safeUsername) || null;

    let trustScore = 25;
    if (sellerRecord?.verifiedSeller) {
      trustScore += 22;
    }
    trustScore += Math.min(18, approvedProducts.length * 3);
    trustScore += Math.min(14, completedOrders * 2);
    trustScore += Math.min(16, Math.round(averageRating * 3));
    trustScore += Math.min(10, sellerReviews.length * 2);

    const roundedScore = roundAnalyticsTrustScore(trustScore);
    return {
      totalProducts: visibleProducts.length,
      approvedProducts: approvedProducts.length,
      pendingProducts: visibleProducts.filter((product) => product.status === "pending").length,
      rejectedProducts: visibleProducts.filter((product) => product.status === "rejected").length,
      totalViews: visibleProducts.reduce((sum, product) => sum + Number(product.views || 0), 0),
      totalLikes: visibleProducts.reduce((sum, product) => sum + Number(product.likes || 0), 0),
      topCategories: Object.entries(
        visibleProducts.reduce((accumulator, product) => {
          const key = product.category || "other";
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {})
      )
        .sort((first, second) => second[1] - first[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count })),
      recentProducts: visibleProducts
        .slice()
        .sort((first, second) => new Date(second.createdAt || second.updatedAt || 0).getTime() - new Date(first.createdAt || first.updatedAt || 0).getTime())
        .slice(0, 5)
        .map((product) => ({
          id: product.id,
          name: product.name,
          status: product.status,
          shop: product.shop,
          createdAt: product.createdAt || ""
        })),
      conversationThreads: conversationThreads.size,
      newInquiries: unreadInquiryThreads.size,
      openOrders,
      completedOrders,
      repeatBuyers,
      conversionRate,
      trustScore: roundedScore,
      trustTier: getAnalyticsTrustTier(roundedScore)
    };
  }

  function dispatchOfflineActionQueueEvent(type, detail = {}) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof window.CustomEvent !== "function") {
      return;
    }
    window.dispatchEvent(new window.CustomEvent(type, { detail }));
  }

  function readStoredSession() {
    const raw = safeStorageGet(SESSION_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        safeStorageRemove(SESSION_KEY);
        return null;
      }

      const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
      if (!username) {
        safeStorageRemove(SESSION_KEY);
        return null;
      }

      const { token, ...safeParsedSession } = parsed;
      if (token) {
        safeStorageSet(SESSION_KEY, JSON.stringify(safeParsedSession));
      }

      return {
        ...safeParsedSession,
        username,
        fullName: typeof parsed.fullName === "string" && parsed.fullName.trim() && !/^(null|undefined)$/i.test(parsed.fullName.trim())
          ? parsed.fullName.trim()
          : username,
        role: typeof parsed.role === "string" && parsed.role.trim() && !/^(null|undefined)$/i.test(parsed.role.trim())
          ? parsed.role.trim().toLowerCase()
          : "",
        primaryCategory: typeof parsed.primaryCategory === "string" && parsed.primaryCategory.trim() && !/^(null|undefined)$/i.test(parsed.primaryCategory.trim())
          ? parsed.primaryCategory.trim()
          : "",
        phoneNumber: typeof parsed.phoneNumber === "string" ? parsed.phoneNumber.replace(/\D/g, "").slice(0, 20) : "",
        whatsappNumber: typeof parsed.whatsappNumber === "string"
          ? parsed.whatsappNumber.replace(/\D/g, "").slice(0, 20)
          : "",
        paymentProvider: typeof parsed.paymentProvider === "string" && parsed.paymentProvider.trim() && !/^(null|undefined)$/i.test(parsed.paymentProvider.trim())
          ? parsed.paymentProvider.trim().toLowerCase()
          : "",
        paymentNumber: typeof parsed.paymentNumber === "string"
          ? parsed.paymentNumber.replace(/\D/g, "").slice(0, 20)
          : "",
        paymentRecipientName: typeof parsed.paymentRecipientName === "string" && parsed.paymentRecipientName.trim() && !/^(null|undefined)$/i.test(parsed.paymentRecipientName.trim())
          ? parsed.paymentRecipientName.trim()
          : "",
        paymentInstructions: typeof parsed.paymentInstructions === "string" && !/^(null|undefined)$/i.test(parsed.paymentInstructions.trim())
          ? parsed.paymentInstructions.trim()
          : "",
        profileImage: typeof parsed.profileImage === "string" && parsed.profileImage.trim() && !/^(null|undefined)$/i.test(parsed.profileImage.trim())
          ? parsed.profileImage.trim()
          : ""
      };
    } catch (error) {
      safeStorageRemove(SESSION_KEY);
      return null;
    }
  }

  function writeStoredSession(session) {
    if (!session || typeof session !== "object") {
      safeStorageRemove(SESSION_KEY);
      return;
    }
    const { token, ...safeSession } = session;
    safeStorageSet(SESSION_KEY, JSON.stringify(safeSession));
  }

  function getAnonymousDemandSessionId() {
    const existing = safeStorageGet(DEMAND_SESSION_KEY);
    if (existing) {
      return existing;
    }
    const generated = `anon-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    safeStorageSet(DEMAND_SESSION_KEY, generated);
    return generated;
  }

  function clearLegacyLocalFallbackArtifacts() {
    [
      USERS_KEY,
      PRODUCTS_KEY,
      CATEGORIES_KEY,
      MESSAGES_KEY,
      REVIEWS_KEY,
      APP_SETTINGS_KEY,
      MOCK_SEEDED_KEY,
      MOCK_SEED_VERSION_KEY
    ].forEach((key) => {
      safeStorageRemove(key);
    });
  }

  function normalizePhoneNumber(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeNationalId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  }

  function normalizeIdentifier(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getOfflineActionQueueStorageKey(session = readStoredSession()) {
    return getOfflineQueueTools().getOfflineActionQueueStorageKey(session);
  }

  function readOfflineActionQueue(session = readStoredSession()) {
    return getOfflineQueueTools().readOfflineActionQueue(session);
  }

  function saveOfflineActionQueue(queue = [], session = readStoredSession()) {
    getOfflineQueueTools().saveOfflineActionQueue(queue, session);
  }

  function isLikelyOfflineActionError(error) {
    return getOfflineQueueTools().isLikelyOfflineActionError(error);
  }

  function queueOfflineMessageAction(payload) {
    return getOfflineQueueTools().queueOfflineMessageAction(payload);
  }

  async function flushOfflineActionQueue(adapter = null) {
    return getOfflineQueueTools().flushOfflineActionQueue(adapter);
  }

  function isLocalPasswordHashed(passwordValue) {
    return typeof passwordValue === "string" && passwordValue.startsWith(`${LOCAL_HASH_PREFIX}:`);
  }

  async function hashLocalPassword(password, salt = null) {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle) {
      return password;
    }

    const activeSalt = salt || Array.from(cryptoApi.getRandomValues(new Uint8Array(16)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const encoder = new TextEncoder();
    const keyMaterial = await cryptoApi.subtle.importKey(
      "raw",
      encoder.encode(String(password || "")),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await cryptoApi.subtle.deriveBits({
      name: "PBKDF2",
      salt: encoder.encode(activeSalt),
      iterations: 120000,
      hash: "SHA-256"
    }, keyMaterial, 256);
    const hash = Array.from(new Uint8Array(derivedBits))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return `${LOCAL_HASH_PREFIX}:${activeSalt}:${hash}`;
  }

  async function verifyLocalPassword(password, passwordValue) {
    if (!passwordValue) {
      return false;
    }

    if (!isLocalPasswordHashed(passwordValue)) {
      return passwordValue === password;
    }

    const [, salt] = String(passwordValue).split(":");
    if (!salt) {
      return false;
    }

    const candidate = await hashLocalPassword(password, salt);
    return candidate === passwordValue;
  }

  function getBlockedAccountMessage(status) {
    if (status === "suspended") {
      return "Akaunti hii imesimamishwa kwa muda.";
    }
    if (status === "banned") {
      return "Akaunti hii imezuiwa kutumia Winga.";
    }
    return "Akaunti hii haiwezi kuingia kwa sasa.";
  }

  function isStaffRole(role) {
    return role === "admin" || role === "moderator";
  }

  function isBuyerCapableRole(role) {
    return role === "buyer" || role === "seller";
  }

  function buildSessionPayload(user, token = null) {
    const normalizeSessionText = (value, fallback = "") => {
      const normalized = String(value == null ? "" : value).trim();
      if (!normalized) {
        return fallback;
      }
      const lower = normalized.toLowerCase();
      return lower === "null" || lower === "undefined" ? fallback : normalized;
    };

    const sessionPayload = {
      username: normalizeSessionText(user.username, ""),
      fullName: normalizeSessionText(user.fullName, user.username),
      primaryCategory: normalizeSessionText(user.primaryCategory, ""),
      role: normalizeSessionText(user.role, "seller"),
      phoneNumber: normalizePhoneNumber(user.phoneNumber || ""),
      whatsappNumber: normalizePhoneNumber(user.whatsappNumber || user.phoneNumber || ""),
      paymentProvider: normalizeSessionText(user.paymentProvider, ""),
      paymentNumber: normalizePhoneNumber(user.paymentNumber || ""),
      paymentRecipientName: normalizeSessionText(user.paymentRecipientName, user.fullName || user.username),
      paymentInstructions: normalizeSessionText(user.paymentInstructions, ""),
      whatsappVerificationStatus: user.whatsappVerificationStatus === "pending" ? "pending" : "verified",
      whatsappVerifiedAt: normalizeSessionText(user.whatsappVerifiedAt, ""),
      pendingWhatsappNumber: normalizePhoneNumber(user.pendingWhatsappNumber || ""),
      pendingWhatsappExpiresAt: normalizeSessionText(user.pendingWhatsappExpiresAt, ""),
      profileImage: normalizeSessionText(user.profileImage, ""),
      verificationStatus: normalizeSessionText(user.verificationStatus, user.verifiedSeller ? "verified" : "unverified"),
      verifiedSeller: Boolean(user.verifiedSeller)
    };
    if (token) {
      sessionPayload.token = token;
    }
    return sessionPayload;
  }

  function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function getPreferredWhatsappNumber(user = {}) {
    return normalizePhoneNumber(user.whatsappNumber || user.phoneNumber || "");
  }

  function stripSignupCategoryFields(payload = {}) {
    if (!payload || typeof payload !== "object") {
      return payload;
    }

    const {
      primaryCategory,
      category,
      subcategory,
      categoryId,
      subcategoryId,
      ...rest
    } = payload;

    return {
      ...rest,
      primaryCategory: ""
    };
  }

  function normalizePrimaryCategoryValue(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : "";
  }

  function shouldUseApiLocalCacheFallback(config = window.WINGA_CONFIG || {}) {
    return config?.enableApiLocalCacheFallback !== false;
  }

  function normalizeAppSettings(settings = {}) {
    return getSettingsTools().normalizeAppSettings(settings);
  }

  let adminDataTools = null;

  function getAdminDataTools() {
    if (!adminDataTools) {
      const factory = window.WingaModules?.api?.adminTools?.createAdminDataTools;
      if (typeof factory !== "function") {
        throw new Error("Winga admin data tools module is required before data service boot.");
      }
      adminDataTools = factory();
    }
    return adminDataTools;
  }

  function summarizeAdminMessageThreads(messages = [], users = [], reports = []) {
    return getAdminDataTools().summarizeAdminMessageThreads(messages, users, reports);
  }

  function buildAdminMessageReviewDetails(messages = [], users = [], reports = [], conversationId = "", reason = "", reviewer = "") {
    return getAdminDataTools().buildAdminMessageReviewDetails(messages, users, reports, conversationId, reason, reviewer);
  }

  function createMarketplaceImageProxyUrl(value, publicBaseUrlOverride = "") {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source) {
      return "";
    }
    if (/^(?:data|blob):/i.test(source)) {
      return source;
    }
    try {
      const publicBaseUrl = publicBaseUrlOverride || getConfiguredPublicBaseUrl();
      const baseUrl = source.startsWith("/uploads/")
        ? publicBaseUrl
        : window.location.origin;
      const parsed = new URL(source, baseUrl);
      if (parsed.pathname === "/__winga-image__") {
        const unwrappedSource = parsed.searchParams.get("u") || "";
        return unwrappedSource ? createMarketplaceImageProxyUrl(unwrappedSource) : "";
      }
      if (parsed.origin === publicBaseUrl && parsed.pathname.startsWith("/uploads/")) {
        return parsed.toString();
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return parsed.toString();
      }
      const proxyUrl = new URL("/__winga-image__", publicBaseUrl);
      proxyUrl.searchParams.set("u", parsed.toString());
      return proxyUrl.toString();
    } catch (error) {
      return source;
    }
  }

  function resolveUserImagesForRuntime(user) {
    if (!user || typeof user !== "object") {
      return user;
    }

    const resolveImage = (value) => createMarketplaceImageProxyUrl(value);

    return {
      ...user,
      profileImage: resolveImage(user.profileImage),
      identityDocumentImage: resolveImage(user.identityDocumentImage)
    };
  }

  function resolveProductImagesForRuntime(product) {
    if (!product || typeof product !== "object") {
      return product;
    }

    const resolveImage = (value) => createMarketplaceImageProxyUrl(value);

    return {
      ...product,
      image: resolveImage(product.image),
      images: Array.isArray(product.images) ? product.images.map(resolveImage) : []
    };
  }

  const DEFAULT_PRODUCTS_PAGE_LIMIT = 12;
  const WINGA_API = "https://winga-pflp.onrender.com";
  const WINGA_API_BASE = `${WINGA_API}/api`;
  const PRODUCT_CURSOR_SEPARATOR = "|";

  let productApiTools = null;

  function getProductApiTools() {
    if (!productApiTools) {
      const factory = window.WingaModules?.api?.products?.createProductApiTools;
      if (typeof factory !== "function") {
        throw new Error("Winga product API tools module is required before data service boot.");
      }
      productApiTools = factory({
        getWindow: () => window,
        defaultPageLimit: DEFAULT_PRODUCTS_PAGE_LIMIT,
        cursorSeparator: PRODUCT_CURSOR_SEPARATOR
      });
    }
    return productApiTools;
  }

  function getProductCreatedTime(product) {
    return getProductApiTools().getProductCreatedTime(product);
  }

  function compareProductsNewestFirst(first, second) {
    return getProductApiTools().compareProductsNewestFirst(first, second);
  }

  function sortProductsNewestFirst(products = []) {
    return getProductApiTools().sortProductsNewestFirst(products);
  }

  function getConfiguredApiBaseUrl(config = window.WINGA_CONFIG || {}) {
    const configuredBaseUrl = String(config?.apiBaseUrl || WINGA_API_BASE).trim();
    return (configuredBaseUrl || WINGA_API_BASE).replace(/\/+$/, "");
  }

  function getPublicBaseUrlFromApiBase(apiBaseUrl) {
    try {
      const parsed = new URL(apiBaseUrl || WINGA_API_BASE, window.location.origin);
      const publicPath = parsed.pathname.replace(/\/api\/?$/, "").replace(/\/+$/, "");
      return `${parsed.origin}${publicPath}`;
    } catch (error) {
      return WINGA_API;
    }
  }

  function getConfiguredPublicBaseUrl(config = window.WINGA_CONFIG || {}) {
    return getPublicBaseUrlFromApiBase(getConfiguredApiBaseUrl(config));
  }

  function getConfiguredFeedPageLimit(config = window.WINGA_CONFIG || {}) {
    return getProductApiTools().getConfiguredFeedPageLimit(config);
  }

  function buildProductCursor(product) {
    return getProductApiTools().buildProductCursor(product);
  }

  function parseProductCursor(cursor) {
    return getProductApiTools().parseProductCursor(cursor);
  }

  function normalizeProductPageWindow(options = {}) {
    return getProductApiTools().normalizeProductPageWindow(options);
  }

  function normalizeProductPageResponse(payload, options = {}, mapProduct = (product) => product) {
    return getProductApiTools().normalizeProductPageResponse(payload, options, mapProduct);
  }

  function mergeUniqueProducts(existingProducts = [], incomingProducts = []) {
    return getProductApiTools().mergeUniqueProducts(existingProducts, incomingProducts);
  }

  function filterProductsForQuery(products = [], options = {}) {
    return getProductApiTools().filterProductsForQuery(products, options);
  }

  function createLocalAdapter() {
    return {
      async loadUsers() {
        return readStoredJson(USERS_KEY, []).map(resolveUserImagesForRuntime);
      },
      async saveUsers(users) {
        setStorageOrThrow(USERS_KEY, JSON.stringify(users), "data za akaunti na picha ya profile");
      },
      async loadProducts() {
        const storedProducts = readStoredJson(PRODUCTS_KEY, []);
        return Array.isArray(storedProducts)
          ? sortProductsNewestFirst(storedProducts.map(resolveProductImagesForRuntime))
          : [];
      },
      async loadProductsPage(options = {}) {
        const storedProducts = readStoredJson(PRODUCTS_KEY, []);
        const products = Array.isArray(storedProducts)
          ? sortProductsNewestFirst(storedProducts.map(resolveProductImagesForRuntime))
          : [];
        return normalizeProductPageResponse(products, options, (product) => product);
      },
        async loadCategories() {
          return readStoredJson(CATEGORIES_KEY, []);
        },
        async loadMessages() {
          return readStoredJson(MESSAGES_KEY, []);
        },
        async loadReviews() {
          const reviews = readStoredJson(REVIEWS_KEY, []);
          const summaryMap = new Map();
          reviews.forEach((review) => {
            const key = review.productId;
            if (!summaryMap.has(key)) {
              summaryMap.set(key, []);
            }
            summaryMap.get(key).push(review);
          });
          return {
            reviews,
            summaries: Array.from(summaryMap.entries()).reduce((accumulator, [productId, items]) => {
              const totalReviews = items.length;
              const averageRating = totalReviews
                ? Number((items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / totalReviews).toFixed(1))
                : 0;
              accumulator[productId] = { averageRating, totalReviews };
              return accumulator;
            }, {})
          };
        },
        async saveCategories(categories) {
          setStorageOrThrow(CATEGORIES_KEY, JSON.stringify(categories), "categories za Winga");
        },
        async saveMessages(messages) {
          setStorageOrThrow(MESSAGES_KEY, JSON.stringify(messages), "messages zako");
        },
        async saveReviews(reviews) {
          setStorageOrThrow(REVIEWS_KEY, JSON.stringify(reviews), "reviews zako");
        },
        async saveProducts(products) {
          setStorageOrThrow(PRODUCTS_KEY, JSON.stringify(products), "data za bidhaa na picha zake");
        },
      loadSession() {
        return readStoredSession();
      },
      saveSession(session) {
        writeStoredSession(session);
      },
      clearSession() {
        safeStorageRemove(SESSION_KEY);
      },
      async logoutSession() {
        this.clearSession();
        return { ok: true };
      },
      async restoreSession() {
        return this.loadSession();
      },
      async signup(payload) {
        const safePayload = stripSignupCategoryFields(payload);
        const users = await this.loadUsers();
        const duplicatePhone = users.find((item) => item.phoneNumber === safePayload.phoneNumber);
        if (duplicatePhone) {
          throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
        }
        const normalizedIdentityNumber = normalizeNationalId(safePayload.nationalId || safePayload.identityDocumentNumber || safePayload.idNumber || "");
        if (normalizedIdentityNumber) {
          const duplicateIdentity = users.find((item) =>
            normalizeNationalId(item.nationalId || item.identityDocumentNumber || item.idNumber || "") === normalizedIdentityNumber
          );
          if (duplicateIdentity) {
            throw new Error("This identity number is already registered. Please contact the moderator.");
          }
        }

        const displayName = String(safePayload.fullName || safePayload.username || "").trim();
        const generatedUsername = safePayload.role === "buyer"
          ? `buyer-${normalizePhoneNumber(safePayload.phoneNumber || "") || Date.now()}`
          : String(safePayload.username || "").trim() || `seller-${normalizePhoneNumber(safePayload.phoneNumber || "") || Date.now()}`;
        const nextUser = {
          ...safePayload,
          username: generatedUsername,
          fullName: displayName || generatedUsername,
          role: safePayload.role || "seller",
          primaryCategory: "",
          nationalId: normalizedIdentityNumber,
          identityDocumentType: String(safePayload.id_type || safePayload.identityDocumentType || "").trim().toUpperCase(),
          identityDocumentNumber: normalizedIdentityNumber,
          identityDocumentImage: safePayload.id_image || safePayload.identityDocumentImage || "",
          phoneNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappVerificationStatus: "verified",
          whatsappVerifiedAt: new Date().toISOString(),
          password: await hashLocalPassword(safePayload.password),
          status: "active",
          verifiedSeller: safePayload.role === "seller",
          verificationStatus: safePayload.role === "seller" ? "verified" : "",
          verificationSubmittedAt: safePayload.role === "seller" ? new Date().toISOString() : "",
          createdAt: safePayload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        users.push(nextUser);
        await this.saveUsers(users);
        return {
          username: nextUser.username,
          fullName: nextUser.fullName,
          primaryCategory: "",
          role: nextUser.role,
          phoneNumber: nextUser.phoneNumber,
          whatsappNumber: nextUser.whatsappNumber,
          whatsappVerificationStatus: nextUser.whatsappVerificationStatus,
          whatsappVerifiedAt: nextUser.whatsappVerifiedAt,
          profileImage: nextUser.profileImage || "",
          verificationStatus: nextUser.verificationStatus || "",
          verifiedSeller: Boolean(nextUser.verifiedSeller),
          token: null
        };
      },
      async login(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches) {
          throw new Error("Taarifa za login si sahihi. Hakikisha username na password ni sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (isStaffRole(user.role)) {
          throw new Error("Admin au moderator wanapaswa kutumia admin login route ya Winga.");
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async recoverPassword(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload?.identifier || payload?.username);
        const identifierPhone = normalizePhoneNumber(payload?.identifier || payload?.username || "");
        const phone = normalizePhoneNumber(payload?.phoneNumber || "");
        const nationalId = normalizeNationalId(payload?.nationalId || "");
        const nextPassword = String(payload?.newPassword || payload?.password || "");
        const userIndex = users.findIndex((item) =>
          normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === identifierPhone
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const phoneMatches = user && (
          normalizePhoneNumber(user.phoneNumber) === phone
          || normalizePhoneNumber(user.whatsappNumber) === phone
        );
        const idMatches = user && normalizeNationalId(user.nationalId || user.identityDocumentNumber) === nationalId;
        if (!user || isStaffRole(user.role) || !phoneMatches || !idMatches) {
          throw new Error("Taarifa za kurejesha password hazijalingana na akaunti hii.");
        }
        if (nextPassword.length < 6) {
          throw new Error("Password mpya inapaswa kuwa na angalau herufi 6.");
        }
        users[userIndex] = {
          ...user,
          password: await hashLocalPassword(nextPassword),
          updatedAt: new Date().toISOString()
        };
        await this.saveUsers(users);
        this.clearSession();
        return { ok: true };
      },
      async adminLogin(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches || !isStaffRole(user.role)) {
          throw new Error("Taarifa za admin login si sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async updateUserProfile(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kubadilisha profile.");
        }
        const users = await this.loadUsers();
        const phoneUpdateRequested = payload && (Object.prototype.hasOwnProperty.call(payload, "phoneNumber") || Object.prototype.hasOwnProperty.call(payload, "whatsappNumber"));
        const nextPhoneNumber = phoneUpdateRequested
          ? normalizePhoneNumber(payload?.phoneNumber || payload?.whatsappNumber || "")
          : "";
        if (phoneUpdateRequested && (!/^\d{10,15}$/.test(nextPhoneNumber))) {
          throw new Error("Weka namba ya simu sahihi yenye tarakimu 10 hadi 15.");
        }
        const nextWhatsappNumber = phoneUpdateRequested ? nextPhoneNumber : "";
        let updatedUser = null;
        const nextUsers = users.map((item) => {
          if (item.username !== session.username) {
            return item;
          }
          const existingPhone = normalizePhoneNumber(item.phoneNumber || item.whatsappNumber || "");
          const resolvedPhoneNumber = phoneUpdateRequested ? nextPhoneNumber : existingPhone;
          const duplicatePhone = phoneUpdateRequested && users.find((other) =>
            other.username !== item.username
            && normalizePhoneNumber(other.phoneNumber || other.whatsappNumber || "") === resolvedPhoneNumber
          );
          if (duplicatePhone) {
            throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
          }
          updatedUser = {
            ...item,
            profileImage: payload?.profileImage || item.profileImage || "",
            phoneNumber: phoneUpdateRequested ? resolvedPhoneNumber : item.phoneNumber || "",
            whatsappNumber: phoneUpdateRequested ? resolvedPhoneNumber : (item.whatsappNumber || item.phoneNumber || ""),
            paymentProvider: Object.prototype.hasOwnProperty.call(payload || {}, "paymentProvider")
              ? String(payload?.paymentProvider || "").trim().toLowerCase()
              : (item.paymentProvider || ""),
            paymentNumber: Object.prototype.hasOwnProperty.call(payload || {}, "paymentNumber")
              ? normalizePhoneNumber(payload?.paymentNumber || "")
              : (item.paymentNumber || ""),
            paymentRecipientName: Object.prototype.hasOwnProperty.call(payload || {}, "paymentRecipientName")
              ? String(payload?.paymentRecipientName || item.fullName || item.username).trim()
              : (item.paymentRecipientName || item.fullName || item.username || ""),
            paymentInstructions: Object.prototype.hasOwnProperty.call(payload || {}, "paymentInstructions")
              ? String(payload?.paymentInstructions || "").trim()
              : (item.paymentInstructions || ""),
            whatsappVerificationStatus: phoneUpdateRequested ? "verified" : (item.whatsappVerificationStatus || "verified"),
            whatsappVerifiedAt: phoneUpdateRequested ? new Date().toISOString() : (item.whatsappVerifiedAt || ""),
            updatedAt: new Date().toISOString()
          };
          return updatedUser;
        });
        if (!updatedUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        const nextProducts = phoneUpdateRequested
          ? (await this.loadProducts()).map((product) =>
              product.uploadedBy === session.username
                ? { ...product, whatsapp: nextWhatsappNumber || "", updatedAt: new Date().toISOString() }
                : product
            )
          : null;
        await this.saveUsers(nextUsers);
        if (nextProducts) {
          await this.saveProducts(nextProducts);
        }
        return {
          username: updatedUser.username,
          fullName: updatedUser.fullName || updatedUser.username,
          primaryCategory: updatedUser.primaryCategory || "",
          role: updatedUser.role || "seller",
          phoneNumber: updatedUser.phoneNumber || "",
          whatsappNumber: updatedUser.whatsappNumber || updatedUser.phoneNumber || "",
          paymentProvider: updatedUser.paymentProvider || "",
          paymentNumber: updatedUser.paymentNumber || "",
          paymentRecipientName: updatedUser.paymentRecipientName || updatedUser.fullName || updatedUser.username,
          paymentInstructions: updatedUser.paymentInstructions || "",
          whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || "verified",
          whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || "",
          pendingWhatsappNumber: updatedUser.pendingWhatsappNumber || "",
          pendingWhatsappExpiresAt: updatedUser.pendingWhatsappExpiresAt || "",
          profileImage: updatedUser.profileImage || "",
          verificationStatus: updatedUser.verificationStatus || ""
        };
      },
      async upgradeBuyerToSeller(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kuupgrade account.");
        }
        const users = await this.loadUsers();
        let updatedUser = null;
        const nextUsers = users.map((item) => {
          if (item.username !== session.username) {
            return item;
          }
          const nextPhoneNumber = normalizePhoneNumber(payload?.phoneNumber || item.phoneNumber || item.whatsappNumber || "");
          const duplicatePhone = users.find((other) =>
            other.username !== item.username && normalizePhoneNumber(other.phoneNumber || other.whatsappNumber || "") === nextPhoneNumber
          );
          if (duplicatePhone) {
            throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
          }
          updatedUser = {
            ...item,
            fullName: String(payload?.fullName || item.fullName || item.username).trim() || item.username,
            primaryCategory: normalizePrimaryCategoryValue(payload?.primaryCategory || item.primaryCategory || ""),
            role: "seller",
            phoneNumber: nextPhoneNumber,
            whatsappNumber: nextPhoneNumber,
            whatsappVerificationStatus: "verified",
            whatsappVerifiedAt: new Date().toISOString(),
            nationalId: "",
            identityDocumentType: "",
            identityDocumentNumber: "",
            identityDocumentImage: "",
            verifiedSeller: false,
            verificationStatus: "unverified",
            verificationSubmittedAt: item.verificationSubmittedAt || "",
            updatedAt: new Date().toISOString()
          };
          return updatedUser;
        });
        if (!updatedUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        await this.saveUsers(nextUsers);
        const refreshedSession = buildSessionPayload(updatedUser);
        this.saveSession(refreshedSession);
        return refreshedSession;
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
        const users = await this.loadUsers();
        const nextUsers = users.map((item) =>
          item.username === username ? { ...item, primaryCategory: normalizedCategory } : item
        );
        await this.saveUsers(nextUsers);
      },
      async addCategory(category) {
        const categories = await this.loadCategories();
        if (!categories.find((item) => item.value === category.value)) {
          categories.push(category);
          await this.saveCategories(categories);
        }
        return category;
      },
      async createProduct(product) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        const nextProducts = [{ ...product, whatsapp, status: product?.status || "approved" }, ...products];
        await this.saveProducts(nextProducts);
        return nextProducts[0];
      },
      async updateProduct(productId, payload) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        let updatedProduct = null;
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          updatedProduct = { ...item, ...payload, whatsapp, id: item.id, uploadedBy: item.uploadedBy };
          return updatedProduct;
        });
        await this.saveProducts(nextProducts);
        return updatedProduct;
      },
      async requestWhatsappChange(payload) {
        const nextWhatsappNumber = normalizePhoneNumber(payload?.whatsappNumber || "");
        if (!/^\d{10,15}$/.test(nextWhatsappNumber)) {
          throw new Error("Weka namba mpya ya WhatsApp sahihi.");
        }
        return this.updateUserProfile({
          phoneNumber: nextWhatsappNumber,
          whatsappNumber: nextWhatsappNumber
        });
      },
      async verifyWhatsappChange(payload) {
        const nextWhatsappNumber = normalizePhoneNumber(payload?.whatsappNumber || payload?.phoneNumber || "");
        if (nextWhatsappNumber && !/^\d{10,15}$/.test(nextWhatsappNumber)) {
          throw new Error("Weka namba mpya ya WhatsApp sahihi.");
        }
        if (!nextWhatsappNumber) {
          return { ok: true, ignored: true };
        }
        return this.updateUserProfile({
          phoneNumber: nextWhatsappNumber,
          whatsappNumber: nextWhatsappNumber
        });
      },
      async deleteProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.filter((item) => item.id !== productId);
        await this.saveProducts(nextProducts);
      },
        async loadAnalytics() {
          return null;
        },
        async loadMessages() {
          const session = this.loadSession();
          const messages = readStoredJson(MESSAGES_KEY, []);
          if (!session?.username) {
            return [];
          }
          return messages.filter((item) =>
            item.senderId === session.username || item.receiverId === session.username
          );
        },
        async sendMessage(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
          }
          if (!payload?.receiverId || (!payload?.message && !(Array.isArray(payload?.productItems) && payload.productItems.length))) {
            throw new Error("Receiver na ujumbe au bidhaa vinahitajika.");
          }
          const messages = readStoredJson(MESSAGES_KEY, []);
          const normalizedMessage = String(payload.message || "").trim();
          const duplicateWindowMs = 8000;
          const recentDuplicate = messages.find((item) =>
            item.senderId === session.username
            && item.receiverId === payload.receiverId
            && (item.productId || "") === (payload.productId || "")
            && String(item.message || "").trim() === normalizedMessage
            && (Date.now() - new Date(item.createdAt || item.timestamp || 0).getTime()) < duplicateWindowMs
          );
          if (recentDuplicate) {
            throw new Error("Subiri kidogo kabla ya kutuma ujumbe ule ule tena.");
          }
          const nextMessage = {
            id: `msg-${Date.now()}`,
            senderId: session.username,
            receiverId: payload.receiverId,
            messageType: payload.messageType || (Array.isArray(payload.productItems) && payload.productItems.length > 1 ? "product_inquiry" : Array.isArray(payload.productItems) && payload.productItems.length === 1 ? "product_reference" : "text"),
            productId: payload.productId || "",
            productName: payload.productName || "",
            productItems: Array.isArray(payload.productItems) ? payload.productItems : [],
            replyToMessageId: payload.replyToMessageId || "",
            message: payload.message || "",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
            readAt: "",
            isDelivered: true,
            isRead: false
          };
          messages.push(nextMessage);
          await this.saveMessages(messages);
          return nextMessage;
        },
        async deleteMessage(messageId) {
          const session = this.loadSession();
          const messages = readStoredJson(MESSAGES_KEY, []);
          const targetMessage = messages.find((item) => item.id === messageId);
          if (!targetMessage || targetMessage.senderId !== session?.username) {
            throw new Error("Huwezi kufuta ujumbe huu.");
          }
          await this.saveMessages(messages.filter((item) => item.id !== messageId));
          return { ok: true };
        },
        async createReview(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya ku-review.");
          }
          if (!Number.isInteger(Number(payload?.rating)) || Number(payload.rating) < 1 || Number(payload.rating) > 5) {
            throw new Error("Rating inapaswa kuwa kati ya 1 na 5.");
          }
          if (!String(payload?.comment || "").trim() || String(payload.comment || "").trim().length < 3) {
            throw new Error("Review lazima iwe na maoni mafupi yenye maana.");
          }
          const reviews = readStoredJson(REVIEWS_KEY, []);
          const duplicate = reviews.find((item) => item.productId === payload.productId && item.userId === session.username);
          if (duplicate) {
            throw new Error("Tayari ume-review bidhaa hii.");
          }
          const nextReview = {
            id: `review-${Date.now()}`,
            userId: session.username,
            productId: payload.productId,
            sellerId: payload.sellerId || "",
            rating: Number(payload.rating),
            comment: payload.comment,
            verifiedBuyer: true,
            date: new Date().toISOString()
          };
          reviews.unshift(nextReview);
          await this.saveReviews(reviews);
          return nextReview;
        },
        async loadMyOrders() {
          return { purchases: [], sales: [] };
        },
      async loadAppSettings() {
        return normalizeAppSettings(readStoredJson(APP_SETTINGS_KEY, DEFAULT_APP_SETTINGS));
      },
      async saveAppSettings(settings) {
        setStorageOrThrow(APP_SETTINGS_KEY, JSON.stringify(normalizeAppSettings(settings || DEFAULT_APP_SETTINGS)), "app settings");
      },
      async createOrder() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async loadAdminUsers() {
        return [];
      },
      async loadAdminProducts() {
        return [];
      },
      async loadAdminOrders() {
        return [];
      },
      async loadAdminPayments() {
        return [];
      },
      async createReport() {
        throw new Error("Reporting inapatikana kwenye API mode tu.");
      },
      async loadAdminReports() {
        return [];
      },
      async reviewReport() {
        throw new Error("Report review inapatikana kwenye API mode tu.");
      },
      async loadAdminSettings() {
        return this.loadAppSettings();
      },
      async updateAdminSettings(payload) {
        const current = await this.loadAppSettings();
        const next = normalizeAppSettings({
          ...current,
          ...(typeof payload?.heroSectionVisible === "boolean" ? { heroSectionVisible: payload.heroSectionVisible } : {}),
          ...(typeof payload?.standaloneShowcaseVisible === "boolean" ? { standaloneShowcaseVisible: payload.standaloneShowcaseVisible } : {}),
          ...(typeof payload?.splashScreenVisible === "boolean" ? { splashScreenVisible: payload.splashScreenVisible } : {}),
          ...(typeof payload?.requireExplicitSignOut === "boolean" ? { requireExplicitSignOut: payload.requireExplicitSignOut } : {}),
          ...(typeof payload?.messageReviewRequiresReason === "boolean" ? { messageReviewRequiresReason: payload.messageReviewRequiresReason } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload || {}, "sessionExpiryMinutes") ? { sessionExpiryMinutes: Number.parseInt(payload.sessionExpiryMinutes, 10) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload || {}, "cachePolicy") ? { cachePolicy: String(payload.cachePolicy || "").trim().toLowerCase() } : {}),
          updatedAt: new Date().toISOString(),
          updatedBy: "local-admin"
        });
        await this.saveAppSettings(next);
        return next;
      },
      async loadAdminMessages() {
        const messages = readStoredJson(MESSAGES_KEY, []);
        const users = readStoredJson(USERS_KEY, []);
        const reports = readStoredJson("winga-reports", []);
        return summarizeAdminMessageThreads(messages, users, reports);
      },
      async reviewAdminMessage(conversationId, payload = {}) {
        const messages = readStoredJson(MESSAGES_KEY, []);
        const users = readStoredJson(USERS_KEY, []);
        const reports = readStoredJson("winga-reports", []);
        const review = buildAdminMessageReviewDetails(messages, users, reports, conversationId, payload?.reason || "", "local-admin");
        if (!review) {
          throw new Error("Conversation haijapatikana.");
        }
        return review;
      },
      async loadAdminUserInvestigation() {
        throw new Error("Fraud review inapatikana kwenye API mode tu.");
      },
      async moderateUser() {
        throw new Error("User moderation inapatikana kwenye API mode tu.");
      },
      async loadModerationActions() {
        return [];
      },
      async logClientEvent() {
        return null;
      },
      async submitSearchDemandEvents() {
        return { ok: true, accepted: 0, inserted: 0, localOnly: true };
      },
      async moderateProduct() {
        throw new Error("Moderation inapatikana kwenye API mode tu.");
      },
      async likeProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.map((item) =>
          item.id === productId ? { ...item, likes: Number(item.likes || 0) + 1 } : item
        );
        await this.saveProducts(nextProducts);
      },
      async trackProductView(productId) {
        const session = this.loadSession();
        const products = await this.loadProducts();
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          const viewedBy = Array.isArray(item.viewedBy) ? item.viewedBy : [];
          if (!session?.username || viewedBy.includes(session.username)) {
            return item;
          }
          return {
            ...item,
            views: Number(item.views || 0) + 1,
            viewedBy: [...viewedBy, session.username]
          };
        });
        await this.saveProducts(nextProducts);
      }
    };
  }

  function createMockAdapter() {
    const local = createLocalAdapter();

    function mergeSeedUsers(currentUsers, seedUsers) {
      const merged = new Map();
      (Array.isArray(currentUsers) ? currentUsers : []).forEach((user) => {
        if (user?.username) {
          merged.set(user.username, user);
        }
      });
      (Array.isArray(seedUsers) ? seedUsers : []).forEach((user) => {
        if (!user?.username) {
          return;
        }
        const existingUser = merged.get(user.username) || {};
        merged.set(user.username, {
          ...user,
          ...existingUser,
          profileImage: existingUser.profileImage || user.profileImage || "",
          primaryCategory: existingUser.primaryCategory || user.primaryCategory || ""
        });
      });
      return Array.from(merged.values());
    }

    function mergeSeedProducts(currentProducts, seedProducts) {
      const merged = new Map();
      (Array.isArray(currentProducts) ? currentProducts : []).forEach((product) => {
        if (product?.id) {
          merged.set(product.id, product);
        }
      });
      (Array.isArray(seedProducts) ? seedProducts : []).forEach((product) => {
        if (!product?.id) {
          return;
        }
        const existingProduct = merged.get(product.id) || {};
        const existingImages = Array.isArray(existingProduct.images)
          ? existingProduct.images.filter(Boolean)
          : [];
        const seedImages = Array.isArray(product.images)
          ? product.images.filter(Boolean)
          : [];
        merged.set(product.id, {
          ...product,
          ...existingProduct,
          image: existingProduct.image || product.image || "",
          images: existingImages.length ? existingImages : seedImages,
          category: existingProduct.category || product.category || "",
          shop: existingProduct.shop || product.shop || "",
          whatsapp: existingProduct.whatsapp || product.whatsapp || "",
          uploadedBy: existingProduct.uploadedBy || product.uploadedBy || "",
          likes: Number(existingProduct.likes ?? product.likes ?? 0),
          views: Number(existingProduct.views ?? product.views ?? 0),
          viewedBy: Array.isArray(existingProduct.viewedBy) ? existingProduct.viewedBy : (product.viewedBy || [])
        });
      });
      return Array.from(merged.values());
    }

    function mergeSeedCategories(currentCategories, seedCategories) {
      const merged = new Map();
      (Array.isArray(currentCategories) ? currentCategories : []).forEach((category) => {
        if (category?.value) {
          merged.set(category.value, category);
        }
      });
      (Array.isArray(seedCategories) ? seedCategories : []).forEach((category) => {
        if (category?.value) {
          merged.set(category.value, {
            ...category,
            ...(merged.get(category.value) || {})
          });
        }
      });
      return Array.from(merged.values());
    }

    async function ensureMockSeed() {
      const config = window.WINGA_CONFIG || {};
      if (!config.enableMockSeed) {
        return;
      }
      const seedUsers = window.WingaMockData?.users || [];
      const seedProducts = window.WingaMockData?.products || [];
      const seedCategories = window.WingaMockData?.categories || [];
      const seedVersion = window.WingaMockData?.seedVersion || "legacy";
      const currentUsers = await local.loadUsers();
      const currentProducts = await local.loadProducts();
      const currentCategories = await local.loadCategories();
      const currentSeedVersion = safeStorageGet(MOCK_SEED_VERSION_KEY) || "";
      const hasEnoughProducts = Array.isArray(currentProducts) && currentProducts.length >= Math.max(4, Math.min(seedProducts.length, 6));
      const hasSeedCoverage = Array.isArray(currentProducts)
        && seedProducts.some((product) => currentProducts.some((item) => item?.id === product.id));
      const shouldSeed = !safeStorageGet(MOCK_SEEDED_KEY)
        || currentSeedVersion !== seedVersion
        || !Array.isArray(currentUsers) || currentUsers.length === 0
        || !hasEnoughProducts
        || !hasSeedCoverage
        || !Array.isArray(currentCategories) || currentCategories.length === 0;

      if (!shouldSeed) {
        return;
      }

      const mergedUsers = mergeSeedUsers(currentUsers, seedUsers);
      const mergedProducts = mergeSeedProducts(currentProducts, seedProducts);
      const mergedCategories = mergeSeedCategories(currentCategories, seedCategories);
      safeStorageSet(USERS_KEY, JSON.stringify(mergedUsers));
      safeStorageSet(PRODUCTS_KEY, JSON.stringify(mergedProducts));
      safeStorageSet(CATEGORIES_KEY, JSON.stringify(mergedCategories));
      safeStorageSet(MOCK_SEEDED_KEY, "true");
      safeStorageSet(MOCK_SEED_VERSION_KEY, seedVersion);
    }

    return {
      async loadUsers() {
        await ensureMockSeed();
        return local.loadUsers();
      },
      async saveUsers(users) {
        await local.saveUsers(users);
      },
      async loadProducts() {
        await ensureMockSeed();
        return local.loadProducts();
      },
      async loadProductsPage(options = {}) {
        await ensureMockSeed();
        return local.loadProductsPage(options);
      },
      async loadCategories() {
        await ensureMockSeed();
        return local.loadCategories();
      },
      async saveCategories(categories) {
        await local.saveCategories(categories);
      },
      async saveProducts(products) {
        await local.saveProducts(products);
      },
      loadSession() {
        return local.loadSession();
      },
      saveSession(session) {
        local.saveSession(session);
      },
      clearSession() {
        local.clearSession();
      },
      async logoutSession(token) {
        return local.logoutSession(token);
      },
      async restoreSession() {
        return local.restoreSession();
      },
      async signup(payload) {
        return local.signup(payload);
      },
      async login(payload) {
        return local.login(payload);
      },
      async adminLogin(payload) {
        return local.adminLogin(payload);
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        return local.updateUserPrimaryCategory(username, primaryCategory);
      },
      async addCategory(category) {
        return local.addCategory(category);
      },
      async createProduct(product) {
        return local.createProduct(product);
      },
      async updateProduct(productId, payload) {
        return local.updateProduct(productId, payload);
      },
      async deleteProduct(productId) {
        return local.deleteProduct(productId);
      },
        async loadAnalytics() {
          return local.loadAnalytics();
        },
        async loadMessages() {
          return local.loadMessages();
        },
        async sendMessage(payload) {
          return local.sendMessage(payload);
        },
        async deleteMessage(messageId) {
          return local.deleteMessage(messageId);
        },
        async loadReviews() {
          return local.loadReviews();
        },
        async createReview(payload) {
          return local.createReview(payload);
        },
        async loadMyOrders() {
          return local.loadMyOrders();
        },
      async loadAppSettings() {
        return local.loadAppSettings();
      },
      async loadAdminSettings() {
        return local.loadAdminSettings();
      },
      async updateAdminSettings(payload) {
        return local.updateAdminSettings(payload);
      },
      async loadAdminMessages() {
        return local.loadAdminMessages();
      },
      async reviewAdminMessage(conversationId, payload) {
        return local.reviewAdminMessage(conversationId, payload);
      },
      async createOrder(payload) {
        return local.createOrder(payload);
      },
      async loadAdminUsers() {
        return local.loadAdminUsers();
      },
      async loadAdminProducts(status) {
        return local.loadAdminProducts(status);
      },
      async loadAdminPayments(filters) {
        return local.loadAdminPayments(filters);
      },
      async createReport(payload) {
        return local.createReport(payload);
      },
      async loadAdminReports(filters) {
        return local.loadAdminReports(filters);
      },
      async reviewReport(reportId, payload) {
        return local.reviewReport(reportId, payload);
      },
      async loadAdminUserInvestigation(username, payload) {
        return local.loadAdminUserInvestigation(username, payload);
      },
      async moderateUser(username, payload) {
        return local.moderateUser(username, payload);
      },
      async loadModerationActions() {
        return local.loadModerationActions();
      },
      async moderateProduct(productId, payload) {
        return local.moderateProduct(productId, payload);
      },
      async likeProduct(productId) {
        return local.likeProduct(productId);
      },
      async trackProductView(productId) {
        return local.trackProductView(productId);
      }
    };
  }

  function createRequestError(message, details = {}) {
    const error = new Error(message);
    Object.assign(error, details);
    return error;
  }

  let apiRuntimeTools = null;

  function getApiRuntimeTools() {
    if (!apiRuntimeTools) {
      const factory = window.WingaModules?.api?.createApiRuntime;
      if (typeof factory !== "function") {
        throw new Error("Winga API runtime module is required before data service boot.");
      }
      apiRuntimeTools = factory({
        getWindow: () => window,
        createRequestError,
        safeStorageRemove,
        sessionKey: SESSION_KEY
      });
    }
    return apiRuntimeTools;
  }

  function bindAbortSignal(controller, externalSignal) {
    return getApiRuntimeTools().bindAbortSignal(controller, externalSignal);
  }

  function emitApiMetric(detail) {
    getApiRuntimeTools().emitApiMetric(detail);
  }

  function getApiEndpointLabel(url) {
    return getApiRuntimeTools().getApiEndpointLabel(url);
  }

  function isUnsafeApiMethod(method = "GET") {
    return getApiRuntimeTools().isUnsafeApiMethod(method);
  }

  function getCsrfTokenUrl(url) {
    return getApiRuntimeTools().getCsrfTokenUrl(url);
  }

  async function fetchCsrfTokenForRequest(url) {
    return getApiRuntimeTools().fetchCsrfTokenForRequest(url);
  }

  async function applyCsrfHeader(url, requestOptions) {
    return getApiRuntimeTools().applyCsrfHeader(url, requestOptions);
  }

  async function fetchJson(url, options) {
    return getApiRuntimeTools().fetchJson(url, options);
  }

  function createApiAdapter(config = {}) {
    const baseUrl = getConfiguredApiBaseUrl(config);
    const publicBaseUrl = getPublicBaseUrlFromApiBase(baseUrl);
    const sessionAdapter = createLocalAdapter();
    const localFallbackAdapter = createLocalAdapter();
    const enableLocalCacheFallback = shouldUseApiLocalCacheFallback(config || {});
    const productUploadTimeoutMs = Number((config && config.productUploadTimeoutMs) || 45000);
    let authApiClient = null;
    let productsApiClient = null;
    let communicationsApiClient = null;
    let commerceApiClient = null;
    let adminApiClient = null;
    let intelligenceApiClient = null;

    function resolveProductImages(product) {
      if (!product || typeof product !== "object") {
        return product;
      }

      const resolveImage = (value) => {
        if (typeof value === "string" && value.startsWith("/uploads/")) {
          return createMarketplaceImageProxyUrl(`${publicBaseUrl}${value}`, publicBaseUrl);
        }
        return createMarketplaceImageProxyUrl(value, publicBaseUrl);
      };

      return {
        ...product,
        image: resolveImage(product.image),
        images: Array.isArray(product.images) ? product.images.map(resolveImage) : []
      };
    }

    function normalizeImageForPersistence(value) {
      const source = typeof value === "string" ? value.trim() : "";
      if (!source) {
        return "";
      }
      try {
        const parsed = new URL(source, window.location.origin);
        if (parsed.pathname === "/__winga-image__") {
          const remoteUrl = parsed.searchParams.get("u") || "";
          if (remoteUrl) {
            return new URL(remoteUrl).toString();
          }
        }
        return parsed.toString();
      } catch (error) {
        return source;
      }
    }

    function normalizeProductForPersistence(product) {
      if (!product || typeof product !== "object") {
        return product;
      }
      const fitMode = String(product.fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
      return {
        ...product,
        image: normalizeImageForPersistence(product.image),
        images: Array.isArray(product.images) ? product.images.map(normalizeImageForPersistence) : [],
        fitMode
      };
    }

    function createAuthHeaders() {
      return {};
    }

    function getAuthTimeoutMs() {
      return Number(window.WINGA_CONFIG?.authRequestTimeoutMs || 18000);
    }

    async function authFetchJson(url, options = {}, authOptions = {}) {
      const retries = Number(authOptions.retries || 0);
      const timeoutMs = Number(options.timeoutMs || authOptions.timeoutMs || getAuthTimeoutMs());
      return withRetry(
        () => fetchJson(url, {
          ...options,
          timeoutMs
        }),
        {
          retries,
          delayMs: Number(authOptions.delayMs || 650),
          shouldRetry: isRetryableBootError
        }
      );
    }

    function getAuthApiClient() {
      if (!authApiClient) {
        const factory = window.WingaModules?.api?.auth?.createAuthApiClient;
        if (typeof factory !== "function") {
          throw new Error("Winga auth API client module is required before data service boot.");
        }
        authApiClient = factory({
          baseUrl,
          sessionAdapter,
          fetchJson,
          authFetchJson,
          createAuthHeaders,
          emitApiMetric,
          stripSignupCategoryFields,
          normalizePrimaryCategoryValue,
          getWindow: () => window
        });
      }
      return authApiClient;
    }

    function cancelSessionRestore(reason = "auth_interaction") {
      return getAuthApiClient().cancelSessionRestore(reason);
    }

    function getProductsApiClient() {
      if (!productsApiClient) {
        const factory = window.WingaModules?.api?.productActions?.createProductsApiClient;
        if (typeof factory !== "function") {
          throw new Error("Winga products API client module is required before data service boot.");
        }
        productsApiClient = factory({
          baseUrl,
          fetchJson,
          createAuthHeaders,
          resolveProductImages,
          getAnonymousDemandSessionId,
          productUploadTimeoutMs
        });
      }
      return productsApiClient;
    }

    function getCommunicationsApiClient() {
      if (!communicationsApiClient) {
        const factory = window.WingaModules?.api?.communications?.createCommunicationsApiClient;
        if (typeof factory !== "function") {
          throw new Error("Winga communications API client module is required before data service boot.");
        }
        communicationsApiClient = factory({
          baseUrl,
          fetchJson,
          createAuthHeaders,
          getEventSource: () => globalThis.EventSource
        });
      }
      return communicationsApiClient;
    }

    function getCommerceApiClient() {
      if (!commerceApiClient) {
        const factory = window.WingaModules?.api?.commerce?.createCommerceApiClient;
        if (typeof factory !== "function") {
          throw new Error("Winga commerce API client module is required before data service boot.");
        }
        commerceApiClient = factory({
          baseUrl,
          fetchJson,
          createAuthHeaders
        });
      }
      return commerceApiClient;
    }

    function getAdminApiClient() {
      if (!adminApiClient) {
        const factory = window.WingaModules?.api?.admin?.createAdminApiClient;
        if (typeof factory !== "function") {
          throw new Error("Winga admin API client module is required before data service boot.");
        }
        adminApiClient = factory({
          baseUrl,
          fetchJson,
          createAuthHeaders,
          resolveProductImages,
          normalizeAppSettings,
          defaultAppSettings: DEFAULT_APP_SETTINGS
        });
      }
      return adminApiClient;
    }

    function getIntelligenceApiClient() {
      if (!intelligenceApiClient) {
        const factory = window.WingaModules?.api?.intelligence?.createIntelligenceApiClient;
        if (typeof factory !== "function") {
          throw new Error("Winga intelligence API client module is required before data service boot.");
        }
        intelligenceApiClient = factory({
          baseUrl,
          fetchJson,
          createAuthHeaders,
          getConfig: () => window.WINGA_CONFIG || {}
        });
      }
      return intelligenceApiClient;
    }

    return {
      async loadUsers() {
        const data = await fetchJson(`${baseUrl}/users`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data.map(resolveUserImagesForRuntime) : [];
      },
      async saveUsers(users) {
        await fetchJson(`${baseUrl}/users`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(users)
        });
      },
      async loadProducts(options = {}) {
        const pageWindow = normalizeProductPageWindow({
          limit: options.limit || DEFAULT_PRODUCTS_PAGE_LIMIT,
          page: 1
        });
        const query = new URLSearchParams({
          limit: String(pageWindow.limit),
          page: "1"
        });
        const data = await fetchJson(`${baseUrl}/products?${query.toString()}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        const sourceProducts = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.products)
              ? data.products
              : Array.isArray(data?.data)
                ? data.data
                : [];
        const nextProducts = sortProductsNewestFirst(
          sourceProducts
            .filter((product) => product && typeof product === "object")
            .map(resolveProductImages)
        );
        if (enableLocalCacheFallback) {
          void localFallbackAdapter.saveProducts(nextProducts.map(normalizeProductForPersistence)).catch(() => {});
        }
        return nextProducts;
      },
      async loadProductsPage(options = {}) {
        const pageWindow = normalizeProductPageWindow(options);
        const query = new URLSearchParams();
        query.set("limit", String(pageWindow.limit));
        query.set("page", String(pageWindow.page));
        if (pageWindow.cursor) {
          query.set("cursor", pageWindow.cursor);
        }
        if (String(options.query || "").trim()) {
          query.set("q", String(options.query || "").trim());
        }
        if (String(options.category || "").trim() && String(options.category || "").trim() !== "all") {
          query.set("category", String(options.category || "").trim());
        }
        if (String(options.seller || "").trim()) {
          query.set("seller", String(options.seller || "").trim());
        }
        const data = await fetchJson(`${baseUrl}/products?${query.toString()}`, {
          headers: {
            ...createAuthHeaders()
          },
          signal: options.signal
        });
        const page = normalizeProductPageResponse(data, pageWindow, resolveProductImages);
        if (enableLocalCacheFallback && Array.isArray(page.items) && page.items.length) {
          void localFallbackAdapter.loadProducts()
            .then((cachedProducts) => {
              const mergedProducts = mergeUniqueProducts(
                Array.isArray(cachedProducts) ? cachedProducts : [],
                page.items.map(normalizeProductForPersistence)
              );
              return localFallbackAdapter.saveProducts(mergedProducts);
            })
            .catch(() => {});
        }
        return page;
      },
      async loadCachedProducts() {
        if (!enableLocalCacheFallback) {
          return [];
        }
        const cachedProducts = await localFallbackAdapter.loadProducts();
        return Array.isArray(cachedProducts) ? cachedProducts.map(resolveProductImages) : [];
      },
      async loadCategories() {
        const data = await fetchJson(`${baseUrl}/categories`);
        return Array.isArray(data) ? data : [];
      },
      async loadAppSettings() {
        const data = await fetchJson(`${baseUrl}/settings`);
        return normalizeAppSettings(data || DEFAULT_APP_SETTINGS);
      },
      async saveCategories() {
        return null;
      },
      async saveProducts(products) {
        const nextProducts = Array.isArray(products) ? products.map(normalizeProductForPersistence) : [];
        if (enableLocalCacheFallback) {
          void localFallbackAdapter.saveProducts(Array.isArray(products) ? products : []).catch(() => {});
        }
        await fetchJson(`${baseUrl}/products`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(nextProducts)
        });
      },
      loadSession() {
        return sessionAdapter.loadSession();
      },
      saveSession(session) {
        sessionAdapter.saveSession(session);
      },
      clearSession() {
        sessionAdapter.clearSession();
      },
      cancelSessionRestore,
      async logoutSession() {
        return getAuthApiClient().logoutSession();
      },
      async restoreSession() {
        return getAuthApiClient().restoreSession();
      },
      async signup(payload) {
        return getAuthApiClient().signup(payload);
      },
      async login(payload) {
        return getAuthApiClient().login(payload);
      },
      async recoverPassword(payload) {
        return getAuthApiClient().recoverPassword(payload);
      },
      async adminLogin(payload) {
        return getAuthApiClient().adminLogin(payload);
      },
      async updateUserProfile(payload) {
        return getAuthApiClient().updateUserProfile(payload);
      },
      async upgradeBuyerToSeller(payload) {
        return getAuthApiClient().upgradeBuyerToSeller(payload);
      },
      async requestWhatsappChange(payload) {
        return getAuthApiClient().requestWhatsappChange(payload);
      },
      async verifyWhatsappChange(payload) {
        return getAuthApiClient().verifyWhatsappChange(payload);
      },
      async loadActiveSessions() {
        return getAuthApiClient().loadActiveSessions();
      },
      async revokeActiveSession(sessionId) {
        return getAuthApiClient().revokeActiveSession(sessionId);
      },
      async verifySessionStepUp(password) {
        return getAuthApiClient().verifySessionStepUp(password);
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        return getAuthApiClient().updateUserPrimaryCategory(username, primaryCategory);
      },
      async addCategory(category) {
        return fetchJson(`${baseUrl}/categories`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(category)
        });
      },
      async createProduct(product) {
        return getProductsApiClient().createProduct(product);
      },
      async updateProduct(productId, payload) {
        return getProductsApiClient().updateProduct(productId, payload);
      },
      async deleteProduct(productId) {
        return getProductsApiClient().deleteProduct(productId);
      },
        async loadAnalytics() {
          return fetchJson(`${baseUrl}/analytics/summary`, {
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async loadMessages() {
          return getCommunicationsApiClient().loadMessages();
        },
        async sendMessage(payload) {
          return getCommunicationsApiClient().sendMessage(payload);
        },
        async deleteMessage(messageId) {
          return getCommunicationsApiClient().deleteMessage(messageId);
        },
        async markConversationRead(payload) {
          return getCommunicationsApiClient().markConversationRead(payload);
        },
        async loadNotifications() {
          return getCommunicationsApiClient().loadNotifications();
        },
        async markNotificationRead(notificationId) {
          return getCommunicationsApiClient().markNotificationRead(notificationId);
        },
        async loadPromotions() {
          return getCommerceApiClient().loadPromotions();
        },
        async createPromotion(payload) {
          return getCommerceApiClient().createPromotion(payload);
        },
      async loadAdminPromotions() {
        return getCommerceApiClient().loadAdminPromotions();
      },
      async loadAdminOpsSummary() {
        return getAdminApiClient().loadAdminOpsSummary();
      },
      async reviewPromotion(promotionId, payload) {
        return getCommerceApiClient().reviewPromotion(promotionId, payload);
      },
      async disablePromotion(promotionId) {
        return getCommerceApiClient().disablePromotion(promotionId);
        },
        openRealtimeChannel(handlers = {}) {
          return getCommunicationsApiClient().openRealtimeChannel(handlers);
        },
        async loadReviews(productId = "") {
          return getCommerceApiClient().loadReviews(productId);
        },
        async createReview(payload) {
          return getCommerceApiClient().createReview(payload);
        },
        async loadMyOrders() {
          return getCommerceApiClient().loadMyOrders();
      },
      async createOrder(payload) {
        return getCommerceApiClient().createOrder(payload);
      },
      async updateOrderStatus(orderId, payload) {
        return getCommerceApiClient().updateOrderStatus(orderId, payload);
      },
      async updateProductAvailability(productId, payload) {
        return getProductsApiClient().updateProductAvailability(productId, payload);
      },
      async recordDemand(productId, payload = {}) {
        return getProductsApiClient().recordDemand(productId, payload);
      },
      async loadAdminUsers() {
        return getAdminApiClient().loadAdminUsers();
      },
      async loadAdminProducts(status = "") {
        return getAdminApiClient().loadAdminProducts(status);
      },
      async loadAdminOrders(filters = {}) {
        return getAdminApiClient().loadAdminOrders(filters);
      },
      async loadAdminPayments(filters = {}) {
        return getAdminApiClient().loadAdminPayments(filters);
      },
      async createReport(payload) {
        return getAdminApiClient().createReport(payload);
      },
      async loadAdminReports(filters = {}) {
        return getAdminApiClient().loadAdminReports(filters);
      },
      async reviewReport(reportId, payload) {
        return getAdminApiClient().reviewReport(reportId, payload);
      },
      async loadAdminSettings() {
        return getAdminApiClient().loadAdminSettings();
      },
      async updateAdminSettings(payload) {
        return getAdminApiClient().updateAdminSettings(payload);
      },
      async loadAdminMessages() {
        return getAdminApiClient().loadAdminMessages();
      },
      async reviewAdminMessage(conversationId, payload = {}) {
        return getAdminApiClient().reviewAdminMessage(conversationId, payload);
      },
      async loadAdminUserInvestigation(username, payload) {
        return getAdminApiClient().loadAdminUserInvestigation(username, payload);
      },
      async moderateUser(username, payload) {
        return getAdminApiClient().moderateUser(username, payload);
      },
      async loadModerationActions() {
        return getAdminApiClient().loadModerationActions();
      },
      async logClientEvent(event) {
        return getIntelligenceApiClient().logClientEvent(event);
      },
      async submitSearchDemandEvents(events = []) {
        return getIntelligenceApiClient().submitSearchDemandEvents(events);
      },
      async moderateProduct(productId, payload) {
        return getProductsApiClient().moderateProduct(productId, payload);
      },
      async likeProduct(productId) {
        return getProductsApiClient().likeProduct(productId);
      },
      async trackProductView(productId) {
        return getProductsApiClient().trackProductView(productId);
      }
    };
  }

  function fireFieldToValue(field) {
    if (!field) return null;
    if (Object.prototype.hasOwnProperty.call(field, "stringValue")) return field.stringValue;
    if (Object.prototype.hasOwnProperty.call(field, "integerValue")) return Number(field.integerValue);
    if (Object.prototype.hasOwnProperty.call(field, "doubleValue")) return Number(field.doubleValue);
    if (Object.prototype.hasOwnProperty.call(field, "booleanValue")) return Boolean(field.booleanValue);
    if (field.nullValue !== undefined) return null;
    if (field.arrayValue) {
      return (field.arrayValue.values || []).map(fireFieldToValue);
    }
    if (field.mapValue) {
      const output = {};
      const fields = field.mapValue.fields || {};
      Object.keys(fields).forEach((key) => {
        output[key] = fireFieldToValue(fields[key]);
      });
      return output;
    }
    return null;
  }

  function valueToFireField(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map(valueToFireField)
        }
      };
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    }
    if (typeof value === "boolean") {
      return { booleanValue: value };
    }
    if (typeof value === "object") {
      const fields = {};
      Object.keys(value).forEach((key) => {
        fields[key] = valueToFireField(value[key]);
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
  }

  function createFirebaseAdapter(config) {
    const firebaseConfig = config.firebase || {};
    const sessionAdapter = createLocalAdapter();
    const projectId = firebaseConfig.projectId;
    const apiKey = firebaseConfig.apiKey;

    if (!projectId || !apiKey) {
      throw new Error("Firebase provider needs projectId and apiKey in winga-config.js");
    }

    function documentUrl(documentPath) {
      return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?key=${apiKey}`;
    }

    async function loadDocument(documentPath) {
      try {
        const data = await fetchJson(documentUrl(documentPath));
        return fireFieldToValue(data.fields?.payload) || [];
      } catch (error) {
        return [];
      }
    }

    async function saveDocument(documentPath, payload) {
      await fetchJson(documentUrl(documentPath), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            payload: valueToFireField(payload)
          }
        })
      });
    }

    return {
      async loadUsers() {
        const data = await loadDocument(firebaseConfig.usersDocumentPath || "wingaState/users");
        return Array.isArray(data) ? data.map(resolveUserImagesForRuntime) : [];
      },
      async saveUsers(users) {
        await saveDocument(firebaseConfig.usersDocumentPath || "wingaState/users", users);
      },
      async loadProducts() {
        return sortProductsNewestFirst(await loadDocument(firebaseConfig.productsDocumentPath || "wingaState/products"));
      },
      async loadProductsPage(options = {}) {
        const products = sortProductsNewestFirst(await loadDocument(firebaseConfig.productsDocumentPath || "wingaState/products"));
        return normalizeProductPageResponse(products, options, (product) => resolveProductImagesForRuntime(product));
      },
      async loadCategories() {
        return loadDocument(firebaseConfig.categoriesDocumentPath || "wingaState/categories");
      },
      async saveCategories(categories) {
        await saveDocument(firebaseConfig.categoriesDocumentPath || "wingaState/categories", categories);
      },
      async saveProducts(products) {
        await saveDocument(firebaseConfig.productsDocumentPath || "wingaState/products", products);
      },
      async loadAppSettings() {
        const data = await loadDocument(firebaseConfig.appSettingsDocumentPath || "wingaState/settings");
        return normalizeAppSettings(data || DEFAULT_APP_SETTINGS);
      },
      async saveAppSettings(settings) {
        await saveDocument(firebaseConfig.appSettingsDocumentPath || "wingaState/settings", normalizeAppSettings(settings || DEFAULT_APP_SETTINGS));
      },
      loadSession() {
        return sessionAdapter.loadSession();
      },
      saveSession(session) {
        sessionAdapter.saveSession(session);
      },
      clearSession() {
        sessionAdapter.clearSession();
      },
      async logoutSession() {
        sessionAdapter.clearSession();
        return { ok: true };
      },
      async restoreSession() {
        return this.loadSession();
      },
      async signup(payload) {
        const safePayload = stripSignupCategoryFields(payload);
        const users = await this.loadUsers();
        const duplicatePhone = users.find((item) => item.phoneNumber === safePayload.phoneNumber);
        if (duplicatePhone) {
          throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
        }
        const normalizedIdentityNumber = normalizeNationalId(safePayload.nationalId || safePayload.identityDocumentNumber || safePayload.idNumber || "");
        if (normalizedIdentityNumber) {
          const duplicateIdentity = users.find((item) =>
            normalizeNationalId(item.nationalId || item.identityDocumentNumber || item.idNumber || "") === normalizedIdentityNumber
          );
          if (duplicateIdentity) {
            throw new Error("This identity number is already registered. Please contact the moderator.");
          }
        }

        const displayName = String(safePayload.fullName || safePayload.username || "").trim();
        const generatedUsername = safePayload.role === "buyer"
          ? `buyer-${normalizePhoneNumber(safePayload.phoneNumber || "") || Date.now()}`
          : String(safePayload.username || "").trim() || `seller-${normalizePhoneNumber(safePayload.phoneNumber || "") || Date.now()}`;
        const nextUser = {
          ...safePayload,
          username: generatedUsername,
          fullName: displayName || generatedUsername,
          role: safePayload.role || "seller",
          primaryCategory: "",
          nationalId: normalizedIdentityNumber,
          identityDocumentType: String(safePayload.id_type || safePayload.identityDocumentType || "").trim().toUpperCase(),
          identityDocumentNumber: normalizedIdentityNumber,
          identityDocumentImage: safePayload.id_image || safePayload.identityDocumentImage || "",
          phoneNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappVerificationStatus: "verified",
          whatsappVerifiedAt: new Date().toISOString(),
          password: await hashLocalPassword(safePayload.password),
          status: "active",
          verifiedSeller: safePayload.role === "seller",
          verificationStatus: safePayload.role === "seller" ? "verified" : "",
          verificationSubmittedAt: safePayload.role === "seller" ? new Date().toISOString() : "",
          createdAt: safePayload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        users.push(nextUser);
        await this.saveUsers(users);
        return {
          username: nextUser.username,
          fullName: nextUser.fullName,
          primaryCategory: "",
          role: nextUser.role,
          phoneNumber: nextUser.phoneNumber,
          whatsappNumber: nextUser.whatsappNumber,
          whatsappVerificationStatus: nextUser.whatsappVerificationStatus,
          whatsappVerifiedAt: nextUser.whatsappVerifiedAt,
          profileImage: nextUser.profileImage || "",
          verificationStatus: nextUser.verificationStatus || "",
          verifiedSeller: Boolean(nextUser.verifiedSeller),
          token: null
        };
      },
      async login(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches) {
          throw new Error("Taarifa za login si sahihi. Hakikisha username na password ni sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (isStaffRole(user.role)) {
          throw new Error("Admin au moderator wanapaswa kutumia admin login route ya Winga.");
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async recoverPassword(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload?.identifier || payload?.username);
        const identifierPhone = normalizePhoneNumber(payload?.identifier || payload?.username || "");
        const phone = normalizePhoneNumber(payload?.phoneNumber || "");
        const nationalId = normalizeNationalId(payload?.nationalId || "");
        const nextPassword = String(payload?.newPassword || payload?.password || "");
        const userIndex = users.findIndex((item) =>
          normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === identifierPhone
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const phoneMatches = user && (
          normalizePhoneNumber(user.phoneNumber) === phone
          || normalizePhoneNumber(user.whatsappNumber) === phone
        );
        const idMatches = user && normalizeNationalId(user.nationalId || user.identityDocumentNumber) === nationalId;
        if (!user || isStaffRole(user.role) || !phoneMatches || !idMatches) {
          throw new Error("Taarifa za kurejesha password hazijalingana na akaunti hii.");
        }
        if (nextPassword.length < 6) {
          throw new Error("Password mpya inapaswa kuwa na angalau herufi 6.");
        }
        users[userIndex] = {
          ...user,
          password: await hashLocalPassword(nextPassword),
          updatedAt: new Date().toISOString()
        };
        await this.saveUsers(users);
        this.clearSession();
        return { ok: true };
      },
      async adminLogin(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches || !isStaffRole(user.role)) {
          throw new Error("Taarifa za admin login si sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async updateUserProfile(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kubadilisha profile.");
        }
        const users = await this.loadUsers();
        const phoneUpdateRequested = payload && (Object.prototype.hasOwnProperty.call(payload, "phoneNumber") || Object.prototype.hasOwnProperty.call(payload, "whatsappNumber"));
        const nextPhoneNumber = phoneUpdateRequested
          ? normalizePhoneNumber(payload?.phoneNumber || payload?.whatsappNumber || "")
          : "";
        if (phoneUpdateRequested && (!/^\d{10,15}$/.test(nextPhoneNumber))) {
          throw new Error("Weka namba ya simu sahihi yenye tarakimu 10 hadi 15.");
        }
        const nextWhatsappNumber = phoneUpdateRequested ? nextPhoneNumber : "";
        let updatedUser = null;
        const nextUsers = users.map((item) => {
          if (item.username !== session.username) {
            return item;
          }
          const existingPhone = normalizePhoneNumber(item.phoneNumber || item.whatsappNumber || "");
          const resolvedPhoneNumber = phoneUpdateRequested ? nextPhoneNumber : existingPhone;
          const duplicatePhone = phoneUpdateRequested && users.find((other) =>
            other.username !== item.username
            && normalizePhoneNumber(other.phoneNumber || other.whatsappNumber || "") === resolvedPhoneNumber
          );
          if (duplicatePhone) {
            throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
          }
          updatedUser = {
            ...item,
            profileImage: payload?.profileImage || item.profileImage || "",
            phoneNumber: phoneUpdateRequested ? resolvedPhoneNumber : item.phoneNumber || "",
            whatsappNumber: phoneUpdateRequested ? resolvedPhoneNumber : (item.whatsappNumber || item.phoneNumber || ""),
            paymentProvider: Object.prototype.hasOwnProperty.call(payload || {}, "paymentProvider")
              ? String(payload?.paymentProvider || "").trim().toLowerCase()
              : (item.paymentProvider || ""),
            paymentNumber: Object.prototype.hasOwnProperty.call(payload || {}, "paymentNumber")
              ? normalizePhoneNumber(payload?.paymentNumber || "")
              : (item.paymentNumber || ""),
            paymentRecipientName: Object.prototype.hasOwnProperty.call(payload || {}, "paymentRecipientName")
              ? String(payload?.paymentRecipientName || item.fullName || item.username).trim()
              : (item.paymentRecipientName || item.fullName || item.username || ""),
            paymentInstructions: Object.prototype.hasOwnProperty.call(payload || {}, "paymentInstructions")
              ? String(payload?.paymentInstructions || "").trim()
              : (item.paymentInstructions || ""),
            whatsappVerificationStatus: phoneUpdateRequested ? "verified" : (item.whatsappVerificationStatus || "verified"),
            whatsappVerifiedAt: phoneUpdateRequested ? new Date().toISOString() : (item.whatsappVerifiedAt || ""),
            updatedAt: new Date().toISOString()
          };
          return updatedUser;
        });
        if (!updatedUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        const nextProducts = phoneUpdateRequested
          ? (await this.loadProducts()).map((product) =>
              product.uploadedBy === session.username
                ? { ...product, whatsapp: nextWhatsappNumber || "", updatedAt: new Date().toISOString() }
                : product
            )
          : null;
        await this.saveUsers(nextUsers);
        if (nextProducts) {
          await this.saveProducts(nextProducts);
        }
        return {
          username: updatedUser.username,
          fullName: updatedUser.fullName || updatedUser.username,
          primaryCategory: updatedUser.primaryCategory || "",
          role: updatedUser.role || "seller",
          phoneNumber: updatedUser.phoneNumber || "",
          whatsappNumber: updatedUser.whatsappNumber || updatedUser.phoneNumber || "",
          paymentProvider: updatedUser.paymentProvider || "",
          paymentNumber: updatedUser.paymentNumber || "",
          paymentRecipientName: updatedUser.paymentRecipientName || updatedUser.fullName || updatedUser.username,
          paymentInstructions: updatedUser.paymentInstructions || "",
          whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || "verified",
          whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || "",
          pendingWhatsappNumber: updatedUser.pendingWhatsappNumber || "",
          pendingWhatsappExpiresAt: updatedUser.pendingWhatsappExpiresAt || "",
          profileImage: updatedUser.profileImage || "",
          verificationStatus: updatedUser.verificationStatus || ""
        };
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
        const users = await this.loadUsers();
        const nextUsers = users.map((item) =>
          item.username === username ? { ...item, primaryCategory: normalizedCategory } : item
        );
        await this.saveUsers(nextUsers);
      },
      async addCategory(category) {
        const categories = await this.loadCategories();
        if (!categories.find((item) => item.value === category.value)) {
          categories.push(category);
          await this.saveCategories(categories);
        }
        return category;
      },
      async createProduct(product) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        const nextProducts = [{ ...product, whatsapp }, ...products];
        await this.saveProducts(nextProducts);
        return nextProducts[0];
      },
      async updateProduct(productId, payload) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        let updatedProduct = null;
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          updatedProduct = { ...item, ...payload, whatsapp, id: item.id, uploadedBy: item.uploadedBy };
          return updatedProduct;
        });
        await this.saveProducts(nextProducts);
        return updatedProduct;
      },
      async requestWhatsappChange(payload) {
        const nextWhatsappNumber = normalizePhoneNumber(payload?.whatsappNumber || "");
        if (!/^\d{10,15}$/.test(nextWhatsappNumber)) {
          throw new Error("Weka namba mpya ya WhatsApp sahihi.");
        }
        return this.updateUserProfile({
          phoneNumber: nextWhatsappNumber,
          whatsappNumber: nextWhatsappNumber
        });
      },
      async verifyWhatsappChange(payload) {
        const nextWhatsappNumber = normalizePhoneNumber(payload?.whatsappNumber || payload?.phoneNumber || "");
        if (nextWhatsappNumber && !/^\d{10,15}$/.test(nextWhatsappNumber)) {
          throw new Error("Weka namba mpya ya WhatsApp sahihi.");
        }
        if (!nextWhatsappNumber) {
          return { ok: true, ignored: true };
        }
        return this.updateUserProfile({
          phoneNumber: nextWhatsappNumber,
          whatsappNumber: nextWhatsappNumber
        });
      },
      async deleteProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.filter((item) => item.id !== productId);
        await this.saveProducts(nextProducts);
      },
      async loadAdminSettings() {
        return this.loadAppSettings();
      },
      async updateAdminSettings(payload) {
        const current = await this.loadAppSettings();
        const next = normalizeAppSettings({
          ...current,
          ...(typeof payload?.heroSectionVisible === "boolean" ? { heroSectionVisible: payload.heroSectionVisible } : {}),
          ...(typeof payload?.standaloneShowcaseVisible === "boolean" ? { standaloneShowcaseVisible: payload.standaloneShowcaseVisible } : {}),
          ...(typeof payload?.splashScreenVisible === "boolean" ? { splashScreenVisible: payload.splashScreenVisible } : {}),
          ...(typeof payload?.requireExplicitSignOut === "boolean" ? { requireExplicitSignOut: payload.requireExplicitSignOut } : {}),
          ...(typeof payload?.messageReviewRequiresReason === "boolean" ? { messageReviewRequiresReason: payload.messageReviewRequiresReason } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload || {}, "sessionExpiryMinutes") ? { sessionExpiryMinutes: Number.parseInt(payload.sessionExpiryMinutes, 10) } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload || {}, "cachePolicy") ? { cachePolicy: String(payload.cachePolicy || "").trim().toLowerCase() } : {}),
          updatedAt: new Date().toISOString(),
          updatedBy: "firebase-admin"
        });
        await this.saveAppSettings(next);
        return next;
      },
      async loadAdminMessages() {
        const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
        const users = await loadDocument(firebaseConfig.usersDocumentPath || "wingaState/users");
        const reports = await loadDocument(firebaseConfig.reportsDocumentPath || "wingaState/reports");
        return summarizeAdminMessageThreads(messages, users, reports);
      },
      async reviewAdminMessage(conversationId, payload = {}) {
        const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
        const users = await loadDocument(firebaseConfig.usersDocumentPath || "wingaState/users");
        const reports = await loadDocument(firebaseConfig.reportsDocumentPath || "wingaState/reports");
        const review = buildAdminMessageReviewDetails(messages, users, reports, conversationId, payload?.reason || "", "firebase-admin");
        if (!review) {
          throw new Error("Conversation haijapatikana.");
        }
        return review;
      },
        async loadAnalytics() {
          const session = this.loadSession();
          if (!session?.username) {
            return null;
          }
          return buildSellerAnalyticsSnapshot({
            username: session.username,
            products: await loadDocument(firebaseConfig.productsDocumentPath || "wingaState/products"),
            users: await loadDocument(firebaseConfig.usersDocumentPath || "wingaState/users"),
            messages: await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages"),
            reviews: await loadDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews"),
            orders: []
          });
        },
        async loadMessages() {
          const session = this.loadSession();
          const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
          if (!session?.username) {
            return [];
          }
          return messages.filter((item) => item.senderId === session.username || item.receiverId === session.username);
        },
        async sendMessage(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
          }
          const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
          const normalizedMessage = String(payload.message || "").trim();
          const duplicateWindowMs = 8000;
          const recentDuplicate = messages.find((item) =>
            item.senderId === session.username
            && item.receiverId === payload.receiverId
            && (item.productId || "") === (payload.productId || "")
            && String(item.message || "").trim() === normalizedMessage
            && (Date.now() - new Date(item.createdAt || item.timestamp || 0).getTime()) < duplicateWindowMs
          );
          if (recentDuplicate) {
            throw new Error("Subiri kidogo kabla ya kutuma ujumbe ule ule tena.");
          }
          const nextMessage = {
            id: `msg-${Date.now()}`,
            senderId: session.username,
            receiverId: payload.receiverId,
            messageType: payload.messageType || (Array.isArray(payload.productItems) && payload.productItems.length > 1 ? "product_inquiry" : Array.isArray(payload.productItems) && payload.productItems.length === 1 ? "product_reference" : "text"),
            productId: payload.productId || "",
            productName: payload.productName || "",
            productItems: Array.isArray(payload.productItems) ? payload.productItems : [],
            replyToMessageId: payload.replyToMessageId || "",
            message: payload.message || "",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
            readAt: "",
            isDelivered: true,
            isRead: false
          };
          await saveDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages", [nextMessage, ...messages]);
          return nextMessage;
        },
        async deleteMessage(messageId) {
          const session = this.loadSession();
          const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
          const targetMessage = messages.find((item) => item.id === messageId);
          if (!targetMessage || targetMessage.senderId !== session?.username) {
            throw new Error("Huwezi kufuta ujumbe huu.");
          }
          await saveDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages", messages.filter((item) => item.id !== messageId));
          return { ok: true };
        },
        async loadReviews() {
          const reviews = await loadDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews");
          const summaryMap = new Map();
          reviews.forEach((review) => {
            const key = review.productId;
            if (!summaryMap.has(key)) {
              summaryMap.set(key, []);
            }
            summaryMap.get(key).push(review);
          });
          return {
            reviews,
            summaries: Array.from(summaryMap.entries()).reduce((accumulator, [productId, items]) => {
              const totalReviews = items.length;
              const averageRating = totalReviews
                ? Number((items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / totalReviews).toFixed(1))
                : 0;
              accumulator[productId] = { averageRating, totalReviews };
              return accumulator;
            }, {})
          };
        },
        async createReview(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya ku-review.");
          }
          if (!Number.isInteger(Number(payload?.rating)) || Number(payload.rating) < 1 || Number(payload.rating) > 5) {
            throw new Error("Rating inapaswa kuwa kati ya 1 na 5.");
          }
          if (!String(payload?.comment || "").trim() || String(payload.comment || "").trim().length < 3) {
            throw new Error("Review lazima iwe na maoni mafupi yenye maana.");
          }
          const reviews = await loadDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews");
          const duplicate = reviews.find((item) => item.productId === payload.productId && item.userId === session.username);
          if (duplicate) {
            throw new Error("Tayari ume-review bidhaa hii.");
          }
          const nextReview = {
            id: `review-${Date.now()}`,
            userId: session.username,
            productId: payload.productId,
            sellerId: payload.sellerId || "",
            rating: Number(payload.rating),
            comment: payload.comment,
            verifiedBuyer: true,
            date: new Date().toISOString()
          };
          await saveDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews", [nextReview, ...reviews]);
          return nextReview;
        },
        async loadMyOrders() {
          return { purchases: [], sales: [] };
        },
      async createOrder() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async updateOrderStatus() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async updateProductAvailability() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async recordDemand() {
        return { ok: true, inserted: false, offline: true };
      },
      async loadAdminUsers() {
        return [];
      },
      async loadAdminProducts() {
        return [];
      },
      async loadAdminOrders() {
        return [];
      },
      async loadAdminPayments() {
        return [];
      },
      async createReport() {
        throw new Error("Reporting inapatikana kwenye API mode tu.");
      },
      async loadAdminReports() {
        return [];
      },
      async reviewReport() {
        throw new Error("Report review inapatikana kwenye API mode tu.");
      },
      async loadAdminUserInvestigation() {
        throw new Error("Fraud review inapatikana kwenye API mode tu.");
      },
      async moderateUser() {
        throw new Error("User moderation inapatikana kwenye API mode tu.");
      },
      async loadModerationActions() {
        return [];
      },
      async logClientEvent() {
        return null;
      },
      async moderateProduct() {
        throw new Error("Moderation inapatikana kwenye API mode tu.");
      },
      async likeProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.map((item) =>
          item.id === productId ? { ...item, likes: Number(item.likes || 0) + 1 } : item
        );
        await this.saveProducts(nextProducts);
      },
      async trackProductView(productId) {
        const session = this.loadSession();
        const products = await this.loadProducts();
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          const viewedBy = Array.isArray(item.viewedBy) ? item.viewedBy : [];
          if (!session?.username || viewedBy.includes(session.username)) {
            return item;
          }
          return {
            ...item,
            views: Number(item.views || 0) + 1,
            viewedBy: [...viewedBy, session.username]
          };
        });
        await this.saveProducts(nextProducts);
      }
    };
  }

  function chooseAdapter(config = {}) {
    const provider = config.provider || "local";
    if (provider === "mock") return createMockAdapter();
    if (provider === "api") return createApiAdapter(config);
    if (provider === "firebase") return createFirebaseAdapter(config);
    return createLocalAdapter();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRetryableBootError(error) {
    const message = String(error?.message || "").toLowerCase();
    return Boolean(
      error?.retryable
      || error?.name === "TypeError"
      || Number(error?.status || 0) === 408
      || Number(error?.status || 0) === 429
      || Number(error?.status || 0) >= 500
      || message.includes("fetch")
      || message.includes("network")
      || message.includes("check your connection")
      || message.includes("took too long")
      || message.includes("request took too long")
      || message.includes("failed to fetch")
      || message.includes("attempting to fetch resource")
    );
  }

  async function withRetry(task, options = {}) {
    const {
      retries = 0,
      delayMs = 800,
      shouldRetry = () => false
    } = options;

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !shouldRetry(error, attempt)) {
          throw error;
        }
        await wait(delayMs * (attempt + 1));
      }
    }
    throw lastError;
  }

  const state = {
    users: [],
    products: [],
    productFeedPagination: {
      limit: DEFAULT_PRODUCTS_PAGE_LIMIT,
      page: 1,
      nextCursor: "",
      hasMore: false,
      total: 0,
      loadedCount: 0
    },
    productFeedNoProgressPages: 0,
    productFeedPageInflightRequests: new Map(),
    productQueryCache: new Map(),
    categories: [],
    appSettings: normalizeAppSettings(DEFAULT_APP_SETTINGS),
    initialized: false,
    productsHydrated: false,
    initialProductsRequestState: "idle",
    startupHydrationStarted: false,
    offlineQueueListenerBound: false,
    adapter: null,
    activeProvider: ""
  };

  function getProductFeedPageRequestKey(options = {}) {
    const limit = Math.max(1, Math.min(50, Number(options.limit || DEFAULT_PRODUCTS_PAGE_LIMIT) || DEFAULT_PRODUCTS_PAGE_LIMIT));
    const page = Math.max(1, Number(options.page || 1) || 1);
    const cursor = String(options.cursor || "").trim();
    return JSON.stringify({ cursor, page, limit });
  }

  let productFeedStateTools = null;

  function getProductFeedStateTools() {
    if (!productFeedStateTools) {
      const factory = window.WingaModules?.api?.feedState?.createProductFeedStateTools;
      if (typeof factory !== "function") {
        throw new Error("Winga product feed state module is required before data service boot.");
      }
      productFeedStateTools = factory({
        state,
        defaultPageLimit: DEFAULT_PRODUCTS_PAGE_LIMIT,
        sortProductsNewestFirst,
        mergeUniqueProducts
      });
    }
    return productFeedStateTools;
  }

  function setFullProductFeedPagination(productsList = []) {
    return getProductFeedStateTools().setFullProductFeedPagination(productsList);
  }

  function setPagedProductFeedPagination(pageInfo = {}, loadedCount = 0) {
    return getProductFeedStateTools().setPagedProductFeedPagination(pageInfo, loadedCount);
  }

  function applyLoadedProductPageToState(loadedProducts, options = {}) {
    return getProductFeedStateTools().applyLoadedProductPageToState(loadedProducts, options);
  }

  function getNextProductsPageOptions() {
    return getProductFeedStateTools().getNextProductsPageOptions();
  }

  function normalizePaginationCursor(value) {
    return String(value || "").trim();
  }

  function hasProductPageCursorAdvanced(previousPagination = {}, requestedOptions = {}, page = {}) {
    const previousCursor = normalizePaginationCursor(previousPagination.nextCursor);
    const requestedCursor = normalizePaginationCursor(requestedOptions.cursor);
    const nextCursor = normalizePaginationCursor(page.nextCursor);
    if (!nextCursor) {
      return false;
    }
    return nextCursor !== previousCursor && nextCursor !== requestedCursor;
  }

  function shouldExhaustNoProgressProductPage({ previousPagination = {}, requestedOptions = {}, page = {}, receivedCount = 0, appendedCount = 0 } = {}) {
    if (!page || typeof page !== "object" || page.hasMore === false || appendedCount > 0) {
      return false;
    }
    const pageNumber = Number(page.page || requestedOptions.page || 1) || 1;
    if (pageNumber <= 1) {
      return false;
    }
    const cursorAdvanced = hasProductPageCursorAdvanced(previousPagination, requestedOptions, page);
    if (receivedCount <= 0 || !cursorAdvanced) {
      return true;
    }
    state.productFeedNoProgressPages = Math.max(0, Number(state.productFeedNoProgressPages || 0) || 0) + 1;
    return state.productFeedNoProgressPages >= 2;
  }

  function resetProductFeedNoProgress() {
    state.productFeedNoProgressPages = 0;
  }

  function getCurrentSessionRole() {
    const session = state.adapter?.loadSession ? state.adapter.loadSession() : null;
    return session?.role || "";
  }

  function assertBuyerCapableAccess() {
    if (!isBuyerCapableRole(getCurrentSessionRole())) {
      throw new Error("Action hii inahitaji buyer au seller account.");
    }
  }

  function assertSellerAccess() {
    if (getCurrentSessionRole() !== "seller") {
      throw new Error("Action hii inahitaji seller account.");
    }
  }

  function assertAdminAccess() {
    if (getCurrentSessionRole() !== "admin") {
      throw new Error("Action hii inaruhusiwa kwa admin tu.");
    }
  }

  function assertModerationAccess() {
    if (!isStaffRole(getCurrentSessionRole())) {
      throw new Error("Action hii inaruhusiwa kwa admin au moderator tu.");
    }
  }

  function ensureAdapter() {
    if (!state.adapter) {
      const config = window.WINGA_CONFIG || {};
      state.activeProvider = config.provider || "local";
      state.adapter = chooseAdapter(config);
    }
    return state.adapter;
  }

  function getBigPipeInitialProductPage(options = {}) {
    if (typeof window === "undefined" || window.__WINGA_BIG_PIPE_BOOTSTRAPPED__ === false) {
      return null;
    }
    const streamedPage = window.__WINGA_BIG_PIPE_INITIAL_PAGE__;
    const streamedProducts = Array.isArray(window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__)
      ? window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__.slice()
      : [];
    const pageItems = Array.isArray(streamedPage?.items)
      ? streamedPage.items.slice()
      : streamedProducts;
    if (!pageItems.length) {
      return null;
    }
    const pageLimit = Number(streamedPage?.limit || options.limit || DEFAULT_PRODUCTS_PAGE_LIMIT) || DEFAULT_PRODUCTS_PAGE_LIMIT;
    const pageNumber = Number(streamedPage?.page || 1) || 1;
    return normalizeProductPageResponse({
      ...(streamedPage && typeof streamedPage === "object" ? streamedPage : {}),
      items: pageItems,
      page: pageNumber,
      limit: pageLimit,
      total: Number(streamedPage?.total || pageItems.length || 0),
      hasMore: typeof streamedPage?.hasMore === "boolean"
        ? streamedPage.hasMore
        : Boolean(streamedPage?.nextCursor),
      nextCursor: String(streamedPage?.nextCursor || "")
    }, {
      page: pageNumber,
      limit: pageLimit,
      cursor: ""
    }, resolveProductImagesForRuntime);
  }

  async function loadInitialState(adapter) {
    state.productsHydrated = false;
    state.initialProductsRequestState = "loading";
    const config = window.WINGA_CONFIG || {};
    const sessionStore = adapter && typeof adapter.loadSession === "function" && typeof adapter.saveSession === "function"
      ? adapter
      : createLocalAdapter();
    const streamedSession = (typeof window !== "undefined" && window.__WINGA_BIG_PIPE_INITIAL_SESSION__ && typeof window.__WINGA_BIG_PIPE_INITIAL_SESSION__ === "object")
      ? window.__WINGA_BIG_PIPE_INITIAL_SESSION__
      : null;
    if (streamedSession?.username) {
      const existingSession = sessionStore.loadSession();
      if (!existingSession?.username) {
        sessionStore.saveSession(streamedSession);
      }
    }
    const streamedProducts = (typeof window !== "undefined" && Array.isArray(window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__))
      ? window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__.slice()
      : [];
    const bigPipeInitialPage = getBigPipeInitialProductPage({
      limit: getConfiguredFeedPageLimit(config)
    });
    if (bigPipeInitialPage?.items?.length) {
      const initialProducts = applyLoadedProductPageToState(bigPipeInitialPage, {
        replace: true,
        markHydrated: true,
        requestState: "success"
      });
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
          detail: {
            status: "big-pipe",
            count: state.products.length
          }
        }));
      }
    } else if (streamedProducts.length) {
      state.products = streamedProducts.map(resolveProductImagesForRuntime);
      setFullProductFeedPagination(state.products);
      state.productsHydrated = true;
      state.initialProductsRequestState = "success";
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
          detail: {
            status: "streamed-legacy",
            count: state.products.length
          }
        }));
      }
    }
    const streamedUsers = (typeof window !== "undefined" && Array.isArray(window.__WINGA_BIG_PIPE_INITIAL_USERS__))
      ? window.__WINGA_BIG_PIPE_INITIAL_USERS__.slice()
      : [];
    if (streamedUsers.length) {
      state.users = streamedUsers;
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("winga:data-hydrated", {
          detail: {
            source: "streamed-users",
            count: state.users.length
          }
        }));
      }
    }
    if (!bigPipeInitialPage?.items?.length && typeof adapter.loadCachedProducts === "function") {
      try {
        const cachedProducts = await adapter.loadCachedProducts();
        if (Array.isArray(cachedProducts) && cachedProducts.length) {
          state.products = cachedProducts;
          setFullProductFeedPagination(cachedProducts);
          if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
            window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
              detail: {
                status: "cached",
                count: state.products.length
              }
            }));
          }
        }
      } catch (error) {
        // Ignore cached product warmup failures and continue with network loading.
      }
    }
    if (!bigPipeInitialPage?.items?.length) {
      try {
        const startupProductsLimit = getConfiguredFeedPageLimit(config);
        const loadedProducts = typeof adapter.loadProductsPage === "function"
          ? await adapter.loadProductsPage({
              limit: startupProductsLimit,
              page: 1
            })
          : await adapter.loadProducts({
              limit: startupProductsLimit,
              page: 1
            });
        const initialProducts = applyLoadedProductPageToState(loadedProducts, {
          replace: true,
          markHydrated: true,
          requestState: "success"
        });
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "loaded",
              count: state.products.length
            }
          }));
        }
      } catch (error) {
        state.initialProductsRequestState = "error";
        state.productsHydrated = Boolean(state.products.length);
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "failed",
              count: state.products.length,
              error: String(error?.message || error || "")
            }
          }));
        }
      }
    }

    Promise.resolve()
      .then(() => adapter.loadUsers())
      .then((users) => {
        state.users = Array.isArray(users) ? users : [];
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:data-hydrated", {
            detail: {
              source: "users",
              count: state.users.length
            }
          }));
        }
        return state.users;
      })
      .catch((error) => {
        void error;
        return state.users;
      });

    Promise.resolve()
      .then(() => (adapter.loadCategories ? adapter.loadCategories() : Promise.resolve([])))
      .then((categories) => {
        state.categories = Array.isArray(categories) ? categories : [];
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:data-hydrated", {
            detail: {
              source: "categories",
              count: state.categories.length
            }
          }));
        }
        return state.categories;
      })
      .catch((error) => {
        void error;
        return state.categories;
      });
  }

  window.WingaDataLayer = {
    async init() {
      if (state.initialized) return;
      ensureAdapter();
      if (state.activeProvider === "api" && window.WINGA_CONFIG?.clearLegacyLocalDataOnBoot) {
        clearLegacyLocalFallbackArtifacts();
      }
      state.initialized = true;
      if (!state.offlineQueueListenerBound && typeof window !== "undefined") {
        window.addEventListener("online", () => {
          flushOfflineActionQueue(state.adapter).catch(() => {
            // Ignore background flush failures; the queue remains persisted.
          });
        });
        state.offlineQueueListenerBound = true;
      }
      flushOfflineActionQueue(state.adapter).catch(() => {
        // Ignore startup flush failures; the queue remains persisted.
      });
    },
    async hydrateStartupData() {
      if (state.startupHydrationStarted) {
        return;
      }
      state.startupHydrationStarted = true;
      const config = window.WINGA_CONFIG || {};
      ensureAdapter();

      try {
        await withRetry(
          () => loadInitialState(state.adapter),
          {
            retries: state.activeProvider === "api" ? 2 : 0,
            delayMs: 1200,
            shouldRetry: (error) => state.activeProvider === "api" && isRetryableBootError(error)
          }
        );
        if (state.activeProvider === "api" && window.WINGA_CONFIG?.clearLegacyLocalDataOnBoot) {
          clearLegacyLocalFallbackArtifacts();
        }
      } catch (error) {
        const fallbackProvider = typeof config.fallbackProvider === "string"
          ? config.fallbackProvider.trim()
          : (config.fallbackProvider || "local");
        const canFallback = fallbackProvider && fallbackProvider !== state.activeProvider;
        if (!canFallback) {
          void error;
          return;
        }

        state.activeProvider = fallbackProvider;
        state.adapter = chooseAdapter({
          ...config,
          provider: fallbackProvider
        });
        try {
          await loadInitialState(state.adapter);
        } catch (fallbackError) {
          void fallbackError;
        }
      }
    },
    bootstrapSession() {
      return ensureAdapter().loadSession();
    },
    getUsers() {
      return clone(state.users);
    },
    async saveUsers(users) {
      const nextUsers = clone(users);
      await state.adapter.saveUsers(nextUsers);
      state.users = nextUsers;
    },
    getProducts() {
      return clone(state.products);
    },
    getProductFeedPagination() {
      return clone(state.productFeedPagination);
    },
    getCachedProducts() {
      if (!shouldUseApiLocalCacheFallback(window.WINGA_CONFIG || {})) {
        return [];
      }
      return clone(readStoredJson(PRODUCTS_KEY, []));
    },
    getActiveProvider() {
      ensureAdapter();
      return state.activeProvider || "";
    },
    getCategories() {
      return clone(state.categories);
    },
    isProductsHydrated() {
      return Boolean(state.productsHydrated);
    },
    getInitialProductsRequestState() {
      return String(state.initialProductsRequestState || "idle");
    },
    cleanupLocalFallbackArtifacts() {
      clearLegacyLocalFallbackArtifacts();
    },
    async saveProducts(products) {
      const nextProducts = sortProductsNewestFirst(clone(products));
      await state.adapter.saveProducts(nextProducts);
      state.products = nextProducts;
      resetProductFeedNoProgress();
      setFullProductFeedPagination(nextProducts);
    },
    async loadProductsPage(options = {}) {
      ensureAdapter();
      if (typeof state.adapter.loadProductsPage !== "function") {
        const fullProducts = await state.adapter.loadProducts();
        const page = normalizeProductPageResponse(fullProducts, options, (product) => product);
        const normalizedPageItems = applyLoadedProductPageToState(page, {
          replace: Number(page.page || 1) <= 1,
          markHydrated: true,
          requestState: "success"
        });
        resetProductFeedNoProgress();
        setPagedProductFeedPagination(page, normalizedPageItems.length);
        return page;
      }
      const page = await state.adapter.loadProductsPage(options);
      const items = Array.isArray(page?.items) ? page.items : [];
      if (items.length > 0 || Number(page?.page || options?.page || 1) <= 1) {
        applyLoadedProductPageToState(page, {
          replace: Number(page?.page || options?.page || 1) <= 1,
          markHydrated: true,
          requestState: "success"
        });
        resetProductFeedNoProgress();
      } else {
        state.productFeedPagination = {
          limit: Number(page.limit || DEFAULT_PRODUCTS_PAGE_LIMIT) || DEFAULT_PRODUCTS_PAGE_LIMIT,
          page: Number(page.page || 1) || 1,
          nextCursor: String(page.nextCursor || ""),
          hasMore: Boolean(page.hasMore),
          total: Number(page.total || items.length || 0),
          loadedCount: items.length
        };
      }
      return page;
    },
    async queryProductsPage(options = {}) {
      ensureAdapter();
      const query = String(options.query || "").trim().slice(0, 120);
      const category = String(options.category || "").trim().slice(0, 80);
      const seller = String(options.seller || "").trim().slice(0, 80);
      const pageWindow = normalizeProductPageWindow(options);
      const cacheKey = JSON.stringify({
        query: query.toLowerCase(),
        category: category.toLowerCase(),
        seller: seller.toLowerCase(),
        page: pageWindow.page,
        cursor: pageWindow.cursor,
        limit: pageWindow.limit
      });
      const now = Date.now();
      const cached = state.productQueryCache.get(cacheKey);
      if (!options.force && cached && now - Number(cached.cachedAt || 0) < 30000) {
        return {
          ...clone(cached.page),
          appendedItems: [],
          appendedCount: 0,
          cached: true
        };
      }
      const page = typeof state.adapter.loadProductsPage === "function"
        ? await state.adapter.loadProductsPage({
            ...options,
            query,
            category,
            seller,
            limit: pageWindow.limit,
            page: pageWindow.page,
            cursor: pageWindow.cursor
          })
        : normalizeProductPageResponse(await state.adapter.loadProducts(), {
            ...pageWindow,
            query,
            category,
            seller
          }, (product) => product);
      const incomingProducts = filterProductsForQuery(
        Array.isArray(page?.items) ? sortProductsNewestFirst(page.items) : [],
        { query, category, seller }
      );
      const beforeIds = new Set(
        (Array.isArray(state.products) ? state.products : [])
          .map((product) => String(product?.id || product?.productId || product?.slug || "").trim())
          .filter(Boolean)
      );
      const appendedItems = incomingProducts.filter((product) => {
        const productId = String(product?.id || product?.productId || product?.slug || "").trim();
        return !productId || !beforeIds.has(productId);
      });
      if (incomingProducts.length) {
        state.products = sortProductsNewestFirst(mergeUniqueProducts(state.products, incomingProducts));
      }
      const result = {
        ...page,
        items: incomingProducts,
        appendedItems,
        appendedCount: appendedItems.length
      };
      state.productQueryCache.set(cacheKey, {
        cachedAt: now,
        page: clone(result)
      });
      while (state.productQueryCache.size > 24) {
        state.productQueryCache.delete(state.productQueryCache.keys().next().value);
      }
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
          detail: {
            status: "query-appended",
            count: state.products.length,
            appendedCount: appendedItems.length,
            query,
            category,
            seller
          }
        }));
      }
      return clone(result);
    },
    async appendProductsPage(options = {}) {
      ensureAdapter();
      if (state.productFeedPagination && state.productFeedPagination.hasMore === false) {
        return {
          items: [],
          appendedCount: 0,
          appendedItems: [],
          limit: Number(state.productFeedPagination.limit || DEFAULT_PRODUCTS_PAGE_LIMIT) || DEFAULT_PRODUCTS_PAGE_LIMIT,
          page: Number(state.productFeedPagination.page || 1) || 1,
          nextCursor: String(state.productFeedPagination.nextCursor || ""),
          hasMore: false,
          total: Number(state.productFeedPagination.total || state.products.length || 0),
          loadedCount: Array.isArray(state.products) ? state.products.length : 0
        };
      }
      const nextOptions = {
        ...getNextProductsPageOptions(),
        ...options
      };
      const requestKey = getProductFeedPageRequestKey(nextOptions);
      if (state.productFeedPageInflightRequests.has(requestKey)) {
        return state.productFeedPageInflightRequests.get(requestKey);
      }
      let requestPromise;
      requestPromise = (async () => {
        try {
        const beforeCount = Array.isArray(state.products) ? state.products.length : 0;
        const previousPagination = clone(state.productFeedPagination || {});
        const page = typeof state.adapter.loadProductsPage === "function"
          ? await state.adapter.loadProductsPage(nextOptions)
          : normalizeProductPageResponse(await state.adapter.loadProducts(), nextOptions, (product) => product);
        const incomingProducts = Array.isArray(page?.items) ? sortProductsNewestFirst(page.items) : [];
        let finalPage = page;
        let lookaheadProducts = [];
        if (
          Boolean(nextOptions.prefetchNext)
          && typeof state.adapter.loadProductsPage === "function"
          && page?.hasMore !== false
          && String(page?.nextCursor || "").trim()
        ) {
          const lookaheadOptions = {
            cursor: String(page.nextCursor || ""),
            page: Number(page.page || nextOptions.page || 1) + 1,
            limit: Number(page.limit || nextOptions.limit || DEFAULT_PRODUCTS_PAGE_LIMIT) || DEFAULT_PRODUCTS_PAGE_LIMIT,
            signal: nextOptions.signal
          };
          const lookaheadPage = await state.adapter.loadProductsPage(lookaheadOptions);
          lookaheadProducts = Array.isArray(lookaheadPage?.items) ? sortProductsNewestFirst(lookaheadPage.items) : [];
          if (lookaheadPage && typeof lookaheadPage === "object") {
            finalPage = lookaheadPage;
          }
        }
        const beforeIds = new Set(
          (Array.isArray(state.products) ? state.products : [])
            .map((product) => String(product?.id || product?.productId || product?.slug || "").trim())
            .filter(Boolean)
        );
        const receivedProducts = mergeUniqueProducts(incomingProducts, lookaheadProducts);
        const appendedItems = receivedProducts.filter((product) => {
          const productId = String(product?.id || product?.productId || product?.slug || "").trim();
          return !productId || !beforeIds.has(productId);
        });
        if (receivedProducts.length) {
          state.products = mergeUniqueProducts(state.products, receivedProducts);
        }
        const appendedCount = Math.max(0, (Array.isArray(state.products) ? state.products.length : 0) - beforeCount);
        if (appendedCount > 0) {
          resetProductFeedNoProgress();
        }
        const shouldForceExhausted = shouldExhaustNoProgressProductPage({
          previousPagination,
          requestedOptions: nextOptions,
          page: finalPage,
          receivedCount: receivedProducts.length,
          appendedCount
        });
        if (finalPage && typeof finalPage === "object") {
          state.productFeedPagination = {
            limit: Number(finalPage.limit || nextOptions.limit || DEFAULT_PRODUCTS_PAGE_LIMIT) || DEFAULT_PRODUCTS_PAGE_LIMIT,
            page: Number(finalPage.page || nextOptions.page || 1) || 1,
            nextCursor: shouldForceExhausted ? "" : String(finalPage.nextCursor || ""),
            hasMore: shouldForceExhausted ? false : Boolean(finalPage.hasMore),
            total: Number(finalPage.total || state.products.length || 0),
            loadedCount: state.products.length
          };
        } else {
          setFullProductFeedPagination(state.products);
        }
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "appended",
              count: state.products.length,
              appendedCount
            }
          }));
        }
        return {
          ...clone(finalPage),
          appendedCount,
          appendedItems,
          exhausted: shouldForceExhausted,
          hasMore: shouldForceExhausted ? false : finalPage?.hasMore
        };
        } finally {
          if (state.productFeedPageInflightRequests.get(requestKey) === requestPromise) {
            state.productFeedPageInflightRequests.delete(requestKey);
          }
        }
      })();
      state.productFeedPageInflightRequests.set(requestKey, requestPromise);
      return requestPromise;
    },
    async signup(payload) {
      const result = await state.adapter.signup(stripSignupCategoryFields(payload));
      if (result?.username) {
        const normalizedUser = result;
        state.users = [
          normalizedUser,
          ...state.users.filter((user) => user.username !== normalizedUser.username)
        ];
      }
      state.adapter.loadUsers()
        .then((users) => {
          state.users = Array.isArray(users) ? users : state.users;
          if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
            window.dispatchEvent(new window.CustomEvent("winga:data-hydrated", {
              detail: {
                source: "users",
                background: true
              }
            }));
          }
        })
        .catch(() => {
          // Signup should not stay stuck after the account was already created.
        });
      return result;
    },
    async login(payload) {
      return state.adapter.login(payload);
    },
    async recoverPassword(payload) {
      return state.adapter.recoverPassword(payload);
    },
    async adminLogin(payload) {
      return state.adapter.adminLogin ? state.adapter.adminLogin(payload) : state.adapter.login(payload);
    },
    async updateUserProfile(payload) {
      const result = await (state.adapter.updateUserProfile ? state.adapter.updateUserProfile(payload) : null);
      if (!result?.username) {
        throw new Error("Profile update haikufaulu. Ingia upya kisha ujaribu tena.");
      }
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async upgradeBuyerToSeller(payload) {
      const result = await (state.adapter.upgradeBuyerToSeller ? state.adapter.upgradeBuyerToSeller(payload) : null);
      if (!result?.username) {
        throw new Error("Seller upgrade haikufaulu. Ingia upya kisha ujaribu tena.");
      }
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async refreshUsers() {
      state.users = await state.adapter.loadUsers();
      return clone(state.users);
    },
    async refreshProducts() {
      ensureAdapter();
      if (typeof state.adapter.loadProductsPage === "function") {
        const config = window.WINGA_CONFIG || {};
        const refreshedPage = await state.adapter.loadProductsPage({
          limit: getConfiguredFeedPageLimit(config),
          page: 1
        });
        applyLoadedProductPageToState(refreshedPage, {
          replace: true,
          markHydrated: true,
          requestState: "success"
        });
        resetProductFeedNoProgress();
      } else {
        const nextProducts = await state.adapter.loadProducts();
        state.products = Array.isArray(nextProducts) ? sortProductsNewestFirst(nextProducts) : [];
        state.productsHydrated = true;
        resetProductFeedNoProgress();
        setFullProductFeedPagination(state.products);
      }
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
          detail: {
            status: "refreshed",
            count: state.products.length
          }
        }));
      }
      return clone(state.products);
    },
    async requestWhatsappChange(payload) {
      const result = await (state.adapter.requestWhatsappChange ? state.adapter.requestWhatsappChange(payload) : null);
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async verifyWhatsappChange(payload) {
      const result = await (state.adapter.verifyWhatsappChange ? state.adapter.verifyWhatsappChange(payload) : null);
      if (!result?.username) {
        throw new Error("WhatsApp verification haikufaulu. Jaribu tena.");
      }
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async loadActiveSessions() {
      ensureAdapter();
      return state.adapter.loadActiveSessions
        ? state.adapter.loadActiveSessions()
        : { items: [], count: 0, maxActivePerUser: 0, rotationIntervalSeconds: 0, policy: null, auditTrail: [] };
    },
    async revokeActiveSession(sessionId) {
      ensureAdapter();
      return state.adapter.revokeActiveSession
        ? state.adapter.revokeActiveSession(sessionId)
        : { ok: true, revokedSessionId: sessionId };
    },
    async verifySessionStepUp(password) {
      ensureAdapter();
      return state.adapter.verifySessionStepUp
        ? state.adapter.verifySessionStepUp(password)
        : { ok: true, security: { stepUpFresh: true, requiresStepUp: false } };
    },
    async updateUserPrimaryCategory(username, primaryCategory) {
      assertSellerAccess();
      const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
      if (!normalizedCategory) {
        state.users = await state.adapter.loadUsers();
        return;
      }
      await state.adapter.updateUserPrimaryCategory(username, normalizedCategory);
      state.users = await state.adapter.loadUsers();
    },
    async addCategory(category) {
      assertSellerAccess();
      const result = await state.adapter.addCategory(category);
      state.categories = state.adapter.loadCategories ? await state.adapter.loadCategories() : state.categories;
      return result;
    },
    async createProduct(product) {
      assertSellerAccess();
      const result = await state.adapter.createProduct(product);
      state.products = sortProductsNewestFirst(await state.adapter.loadProducts());
      setFullProductFeedPagination(state.products);
      return result;
    },
    async updateProduct(productId, payload) {
      assertSellerAccess();
      const result = await state.adapter.updateProduct(productId, payload);
      state.products = sortProductsNewestFirst(await state.adapter.loadProducts());
      setFullProductFeedPagination(state.products);
      return result;
    },
    async deleteProduct(productId) {
      assertSellerAccess();
      const result = await state.adapter.deleteProduct(productId);
      state.products = sortProductsNewestFirst(await state.adapter.loadProducts());
      setFullProductFeedPagination(state.products);
      return result;
    },
    async loadAnalytics() {
        return state.adapter.loadAnalytics ? state.adapter.loadAnalytics() : null;
      },
      async loadAppSettings() {
        const settings = state.adapter.loadAppSettings ? await state.adapter.loadAppSettings() : normalizeAppSettings(DEFAULT_APP_SETTINGS);
        state.appSettings = normalizeAppSettings(settings || DEFAULT_APP_SETTINGS);
        return clone(state.appSettings);
      },
      async loadMessages() {
        assertBuyerCapableAccess();
        return state.adapter.loadMessages ? state.adapter.loadMessages() : [];
      },
      async sendMessage(payload) {
        assertBuyerCapableAccess();
        ensureAdapter();
        if (globalThis.navigator?.onLine === false) {
          return queueOfflineMessageAction(payload);
        }
        try {
          const result = state.adapter.sendMessage ? await state.adapter.sendMessage(payload) : null;
          if (result) {
            flushOfflineActionQueue(state.adapter).catch(() => {
              // Ignore background flush failures and keep the queue intact.
            });
          }
          return result;
        } catch (error) {
          if (isLikelyOfflineActionError(error)) {
            return queueOfflineMessageAction(payload);
          }
          throw error;
        }
      },
      async deleteMessage(messageId) {
        assertBuyerCapableAccess();
        return state.adapter.deleteMessage ? state.adapter.deleteMessage(messageId) : { ok: true };
      },
      async markConversationRead(payload) {
        assertBuyerCapableAccess();
        return state.adapter.markConversationRead ? state.adapter.markConversationRead(payload) : { ok: true };
      },
      async loadNotifications() {
        assertBuyerCapableAccess();
        return state.adapter.loadNotifications ? state.adapter.loadNotifications() : [];
      },
      async markNotificationRead(notificationId) {
        assertBuyerCapableAccess();
        return state.adapter.markNotificationRead ? state.adapter.markNotificationRead(notificationId) : { ok: true };
      },
      async loadPromotions() {
        return state.adapter.loadPromotions ? state.adapter.loadPromotions() : [];
      },
      async createPromotion(payload) {
        assertSellerAccess();
        return state.adapter.createPromotion ? state.adapter.createPromotion(payload) : null;
      },
      async loadAdminPromotions() {
        assertAdminAccess();
        return state.adapter.loadAdminPromotions ? state.adapter.loadAdminPromotions() : [];
      },
      async loadAdminOpsSummary() {
        assertAdminAccess();
        return state.adapter.loadAdminOpsSummary ? state.adapter.loadAdminOpsSummary() : null;
      },
      async reviewPromotion(promotionId, payload) {
        assertAdminAccess();
        return state.adapter.reviewPromotion ? state.adapter.reviewPromotion(promotionId, payload) : { ok: true };
      },
      async disablePromotion(promotionId) {
        assertAdminAccess();
        return state.adapter.disablePromotion ? state.adapter.disablePromotion(promotionId) : { ok: true };
      },
      openRealtimeChannel(handlers = {}) {
        return state.adapter.openRealtimeChannel ? state.adapter.openRealtimeChannel(handlers) : null;
      },
      async loadReviews(productId) {
        return state.adapter.loadReviews ? state.adapter.loadReviews(productId) : { reviews: [], summaries: {} };
      },
      async createReview(payload) {
        assertBuyerCapableAccess();
        return state.adapter.createReview ? state.adapter.createReview(payload) : null;
      },
      async loadMyOrders() {
        assertBuyerCapableAccess();
        return state.adapter.loadMyOrders ? state.adapter.loadMyOrders() : { purchases: [], sales: [] };
      },
    async createOrder(payload) {
      assertBuyerCapableAccess();
      return state.adapter.createOrder ? state.adapter.createOrder(payload) : null;
    },
    async updateOrderStatus(orderId, payload) {
      assertBuyerCapableAccess();
      return state.adapter.updateOrderStatus ? state.adapter.updateOrderStatus(orderId, payload) : null;
    },
    async updateProductAvailability(productId, payload) {
      assertSellerAccess();
      return state.adapter.updateProductAvailability ? state.adapter.updateProductAvailability(productId, payload) : null;
    },
    async recordDemand(productId, payload = {}) {
      ensureAdapter();
      return state.adapter.recordDemand ? state.adapter.recordDemand(productId, payload) : { ok: false };
    },
    async loadAdminUsers() {
      assertModerationAccess();
      return state.adapter.loadAdminUsers ? state.adapter.loadAdminUsers() : [];
    },
    async loadAdminProducts(status) {
      assertModerationAccess();
      return state.adapter.loadAdminProducts ? state.adapter.loadAdminProducts(status) : [];
    },
    async loadAdminOrders(filters) {
      assertAdminAccess();
      return state.adapter.loadAdminOrders ? state.adapter.loadAdminOrders(filters) : [];
    },
    async loadAdminPayments(filters) {
      assertAdminAccess();
      return state.adapter.loadAdminPayments ? state.adapter.loadAdminPayments(filters) : [];
    },
    async loadAdminSettings() {
      assertAdminAccess();
      const settings = state.adapter.loadAdminSettings ? await state.adapter.loadAdminSettings() : await this.loadAppSettings();
      state.appSettings = normalizeAppSettings(settings || DEFAULT_APP_SETTINGS);
      return clone(state.appSettings);
    },
    async updateAdminSettings(payload) {
      assertAdminAccess();
      const result = state.adapter.updateAdminSettings ? await state.adapter.updateAdminSettings(payload) : await this.loadAppSettings();
      state.appSettings = normalizeAppSettings(result || DEFAULT_APP_SETTINGS);
      return clone(state.appSettings);
    },
    async loadAdminMessages() {
      assertAdminAccess();
      return state.adapter.loadAdminMessages ? state.adapter.loadAdminMessages() : [];
    },
    async reviewAdminMessage(conversationId, payload) {
      assertAdminAccess();
      return state.adapter.reviewAdminMessage ? state.adapter.reviewAdminMessage(conversationId, payload) : null;
    },
    async createReport(payload) {
      assertBuyerCapableAccess();
      return state.adapter.createReport ? state.adapter.createReport(payload) : null;
    },
    async loadAdminReports(filters) {
      assertModerationAccess();
      return state.adapter.loadAdminReports ? state.adapter.loadAdminReports(filters) : [];
    },
    async reviewReport(reportId, payload) {
      assertModerationAccess();
      return state.adapter.reviewReport ? state.adapter.reviewReport(reportId, payload) : null;
    },
    async loadAdminUserInvestigation(username, payload) {
      assertAdminAccess();
      return state.adapter.loadAdminUserInvestigation ? state.adapter.loadAdminUserInvestigation(username, payload) : null;
    },
    async moderateUser(username, payload) {
      assertModerationAccess();
      const result = await (state.adapter.moderateUser ? state.adapter.moderateUser(username, payload) : null);
      state.users = await state.adapter.loadUsers();
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async loadModerationActions() {
      assertAdminAccess();
      return state.adapter.loadModerationActions ? state.adapter.loadModerationActions() : [];
    },
    async logClientEvent(event) {
      return state.adapter.logClientEvent ? state.adapter.logClientEvent(event) : null;
    },
    async submitSearchDemandEvents(events = []) {
      ensureAdapter();
      return state.adapter.submitSearchDemandEvents
        ? state.adapter.submitSearchDemandEvents(events)
        : { ok: true, accepted: 0, inserted: 0 };
    },
    async moderateProduct(productId, payload) {
      assertModerationAccess();
      const result = await state.adapter.moderateProduct(productId, payload);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async likeProduct(productId) {
      const result = await state.adapter.likeProduct(productId);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async trackProductView(productId) {
      const result = await state.adapter.trackProductView(productId);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async restoreSession() {
      return state.adapter.restoreSession();
    },
    cancelSessionRestore(reason = "auth_interaction") {
      return state.adapter.cancelSessionRestore
        ? state.adapter.cancelSessionRestore(reason)
        : null;
    },
    async logoutSession(tokenOverride = "") {
      return state.adapter.logoutSession
        ? state.adapter.logoutSession(tokenOverride)
        : { ok: true };
    },
    getSessionUser() {
      return state.adapter.loadSession();
    },
    saveSessionUser(session) {
      state.adapter.saveSession(session);
    },
    clearSessionUser() {
      state.adapter.clearSession();
    }
  };
})();
