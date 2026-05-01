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
  const LOCAL_HASH_PREFIX = "pbkdf2_sha256";
  const DEFAULT_APP_SETTINGS = {
    heroSectionVisible: false,
    standaloneShowcaseVisible: false,
    splashScreenVisible: true,
    sessionExpiryMinutes: 120,
    cachePolicy: "balanced",
    requireExplicitSignOut: true,
    messageReviewRequiresReason: true
  };
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function setStorageOrThrow(key, value, label = "data za Winga") {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      const quotaExceeded = error?.name === "QuotaExceededError"
        || error?.code === 22
        || error?.code === 1014
        || /quota|storage|space/i.test(String(error?.message || ""));
      if (quotaExceeded) {
        throw new Error(`${label} zimezidi nafasi ya browser/simu. Punguza idadi au ukubwa wa picha kisha ujaribu tena.`);
      }
      throw new Error(`Imeshindikana kuhifadhi ${label} kwenye browser hii. Jaribu tena au fungua app upya.`);
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Ignore storage removal failures and continue with in-memory flow.
    }
  }

  function readStoredJson(key, fallbackValue) {
    const raw = safeStorageGet(key);
    if (!raw) {
      return fallbackValue;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallbackValue;
    }
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

      return {
        ...parsed,
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
        profileImage: typeof parsed.profileImage === "string" && parsed.profileImage.trim() && !/^(null|undefined)$/i.test(parsed.profileImage.trim())
          ? parsed.profileImage.trim()
          : "",
        token: typeof parsed.token === "string" && parsed.token.trim() && !/^(null|undefined)$/i.test(parsed.token.trim())
          ? parsed.token.trim()
          : ""
      };
    } catch (error) {
      safeStorageRemove(SESSION_KEY);
      return null;
    }
  }

  function writeStoredSession(session) {
    safeStorageSet(SESSION_KEY, JSON.stringify(session));
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
    const username = String(session?.username || "").trim();
    if (!username) {
      return "";
    }
    return `${OFFLINE_ACTION_QUEUE_KEY_PREFIX}:${username}`;
  }

  function readOfflineActionQueue(session = readStoredSession()) {
    const storageKey = getOfflineActionQueueStorageKey(session);
    if (!storageKey) {
      return [];
    }
    const raw = safeStorageGet(storageKey);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function saveOfflineActionQueue(queue = [], session = readStoredSession()) {
    const storageKey = getOfflineActionQueueStorageKey(session);
    if (!storageKey) {
      return;
    }
    if (!Array.isArray(queue) || !queue.length) {
      safeStorageRemove(storageKey);
      return;
    }
    safeStorageSet(storageKey, JSON.stringify(queue));
  }

  function isLikelyOfflineActionError(error) {
    const message = String(error?.message || "").toLowerCase();
    return Boolean(
      error?.name === "TypeError"
      || message.includes("failed to fetch")
      || message.includes("network")
      || message.includes("offline")
      || message.includes("fetch")
      || message.includes("request took too long")
    );
  }

  function queueOfflineMessageAction(payload) {
    const session = readStoredSession();
    const username = String(session?.username || "").trim();
    if (!username) {
      throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
    }
    if (!payload?.receiverId || (!payload?.message && !(Array.isArray(payload?.productItems) && payload.productItems.length))) {
      throw new Error("Receiver na ujumbe au bidhaa vinahitajika.");
    }

    const queue = readOfflineActionQueue(session);
    const queuedAction = {
      id: `offline-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "sendMessage",
      payload: clone(payload),
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    queue.push(queuedAction);
    saveOfflineActionQueue(queue, session);
    dispatchOfflineActionQueueEvent("winga:offline-actions-updated", {
      count: queue.length,
      username
    });
    return {
      id: queuedAction.id,
      senderId: username,
      receiverId: payload.receiverId,
      messageType: payload.messageType || (Array.isArray(payload.productItems) && payload.productItems.length > 1 ? "product_inquiry" : Array.isArray(payload.productItems) && payload.productItems.length === 1 ? "product_reference" : "text"),
      productId: payload.productId || "",
      productName: payload.productName || "",
      productItems: Array.isArray(payload.productItems) ? payload.productItems : [],
      replyToMessageId: payload.replyToMessageId || "",
      message: payload.message || "",
      timestamp: queuedAction.createdAt,
      createdAt: queuedAction.createdAt,
      updatedAt: queuedAction.createdAt,
      deliveredAt: "",
      readAt: "",
      isDelivered: false,
      isRead: false,
      isQueued: true
    };
  }

  async function flushOfflineActionQueue(adapter = null) {
    const activeAdapter = adapter || state.adapter;
    if (!activeAdapter || typeof activeAdapter.sendMessage !== "function") {
      return 0;
    }
    const session = readStoredSession();
    if (!session?.username || globalThis.navigator?.onLine === false) {
      return 0;
    }

    const queue = readOfflineActionQueue(session);
    if (!queue.length) {
      return 0;
    }

    const remaining = [];
    let flushedCount = 0;

    for (const item of queue) {
      if (!item || item.type !== "sendMessage") {
        continue;
      }

      try {
        await activeAdapter.sendMessage(item.payload);
        flushedCount += 1;
      } catch (error) {
        const retryable = isLikelyOfflineActionError(error);
        if (retryable) {
          remaining.push({
            ...item,
            attempts: Number(item.attempts || 0) + 1
          });
          remaining.push(...queue.slice(queue.indexOf(item) + 1));
          break;
        }
        // Non-retryable send errors are discarded so they don't get stuck forever.
      }
    }

    saveOfflineActionQueue(remaining, session);
    if (flushedCount > 0 || queue.length !== remaining.length) {
      dispatchOfflineActionQueueEvent("winga:offline-actions-flushed", {
        count: flushedCount,
        remaining: remaining.length,
        username: session.username
      });
    }
    return flushedCount;
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

    return {
      username: normalizeSessionText(user.username, ""),
      fullName: normalizeSessionText(user.fullName, user.username),
      primaryCategory: normalizeSessionText(user.primaryCategory, ""),
      role: normalizeSessionText(user.role, "seller"),
      phoneNumber: normalizePhoneNumber(user.phoneNumber || ""),
      whatsappNumber: normalizePhoneNumber(user.whatsappNumber || user.phoneNumber || ""),
      whatsappVerificationStatus: user.whatsappVerificationStatus === "pending" ? "pending" : "verified",
      whatsappVerifiedAt: normalizeSessionText(user.whatsappVerifiedAt, ""),
      pendingWhatsappNumber: normalizePhoneNumber(user.pendingWhatsappNumber || ""),
      pendingWhatsappExpiresAt: normalizeSessionText(user.pendingWhatsappExpiresAt, ""),
      profileImage: normalizeSessionText(user.profileImage, ""),
      verificationStatus: normalizeSessionText(user.verificationStatus, user.verifiedSeller ? "verified" : "unverified"),
      verifiedSeller: Boolean(user.verifiedSeller),
      token
    };
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

  function normalizeAppSettings(settings = {}) {
    const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
    const sessionExpiryMinutes = Number.parseInt(source.sessionExpiryMinutes, 10);
    const cachePolicy = String(source.cachePolicy || "").trim().toLowerCase();
    return {
      heroSectionVisible: typeof source.heroSectionVisible === "boolean" ? source.heroSectionVisible : DEFAULT_APP_SETTINGS.heroSectionVisible,
      standaloneShowcaseVisible: typeof source.standaloneShowcaseVisible === "boolean" ? source.standaloneShowcaseVisible : DEFAULT_APP_SETTINGS.standaloneShowcaseVisible,
      splashScreenVisible: typeof source.splashScreenVisible === "boolean" ? source.splashScreenVisible : DEFAULT_APP_SETTINGS.splashScreenVisible,
      sessionExpiryMinutes: Number.isFinite(sessionExpiryMinutes) ? Math.max(15, Math.min(1440, sessionExpiryMinutes)) : DEFAULT_APP_SETTINGS.sessionExpiryMinutes,
      cachePolicy: ["balanced", "cache-first", "network-first"].includes(cachePolicy) ? cachePolicy : DEFAULT_APP_SETTINGS.cachePolicy,
      requireExplicitSignOut: source.requireExplicitSignOut !== false,
      messageReviewRequiresReason: source.messageReviewRequiresReason !== false,
      updatedAt: String(source.updatedAt || "").trim(),
      updatedBy: String(source.updatedBy || "").trim()
    };
  }

  function summarizeAdminMessageThreads(messages = [], users = [], reports = []) {
    const userMap = new Map((Array.isArray(users) ? users : []).map((user) => {
      const username = String(user?.username || "").trim();
      return [username, user];
    }));
    const threadMap = new Map();
    (Array.isArray(messages) ? messages : []).forEach((message) => {
      const conversationId = String(message?.conversationId || "").trim() || [message?.senderId, message?.receiverId].filter(Boolean).sort().join("::") + `::${message?.productId || ""}`;
      const existing = threadMap.get(conversationId) || {
        conversationId,
        senderId: String(message?.senderId || "").trim(),
        receiverId: String(message?.receiverId || "").trim(),
        senderName: userMap.get(String(message?.senderId || "").trim())?.fullName || String(message?.senderId || "").trim(),
        receiverName: userMap.get(String(message?.receiverId || "").trim())?.fullName || String(message?.receiverId || "").trim(),
        productId: String(message?.productId || "").trim(),
        productName: String(message?.productName || "").trim(),
        messageType: String(message?.messageType || "text").trim(),
        messageCount: 0,
        unreadCount: 0,
        lastMessageAt: "",
        lastMessagePreview: "",
        reportCount: 0
      };
      existing.messageCount += 1;
      if (!message?.isRead) {
        existing.unreadCount += 1;
      }
      const nextTime = new Date(message?.timestamp || message?.createdAt || 0).getTime();
      const currentTime = new Date(existing.lastMessageAt || 0).getTime();
      if (!existing.lastMessageAt || nextTime >= currentTime) {
        existing.lastMessageAt = String(message?.timestamp || message?.createdAt || "");
        existing.lastMessagePreview = String(message?.message || "").trim().slice(0, 160);
        existing.messageType = String(message?.messageType || "text").trim() || existing.messageType;
        existing.productId = String(message?.productId || existing.productId || "").trim();
        existing.productName = String(message?.productName || existing.productName || "").trim();
        existing.senderId = String(message?.senderId || existing.senderId || "").trim();
        existing.receiverId = String(message?.receiverId || existing.receiverId || "").trim();
        existing.senderName = userMap.get(existing.senderId)?.fullName || existing.senderId;
        existing.receiverName = userMap.get(existing.receiverId)?.fullName || existing.receiverId;
      }
      threadMap.set(conversationId, existing);
    });

    const reportList = Array.isArray(reports) ? reports : [];
    return Array.from(threadMap.values())
      .map((thread) => {
        const relatedReports = reportList.filter((report) =>
          String(report?.targetUserId || "") === thread.senderId
          || String(report?.targetUserId || "") === thread.receiverId
          || String(report?.targetProductId || "") === thread.productId
          || /message|chat|conversation|abuse|fraud/i.test(`${report?.reason || ""} ${report?.description || ""}`)
        );
        return {
          ...thread,
          reportCount: relatedReports.length,
          hasReportedContent: relatedReports.length > 0
        };
      })
      .sort((first, second) => new Date(second.lastMessageAt || 0).getTime() - new Date(first.lastMessageAt || 0).getTime());
  }

  function buildAdminMessageReviewDetails(messages = [], users = [], reports = [], conversationId = "", reason = "", reviewer = "") {
    const normalizedConversationId = String(conversationId || "").trim();
    const normalizedMessages = (Array.isArray(messages) ? messages : [])
      .filter((message) => String(message?.conversationId || "").trim() === normalizedConversationId)
      .map((message) => ({
        ...message,
        senderId: String(message?.senderId || "").trim(),
        receiverId: String(message?.receiverId || "").trim(),
        productId: String(message?.productId || "").trim(),
        productName: String(message?.productName || "").trim(),
        messageType: String(message?.messageType || "text").trim(),
        message: String(message?.message || "").trim()
      }))
      .sort((first, second) => new Date(first.timestamp || first.createdAt || 0).getTime() - new Date(second.timestamp || second.createdAt || 0).getTime());

    if (!normalizedMessages.length) {
      return null;
    }

    const thread = summarizeAdminMessageThreads(normalizedMessages, users, reports).find((item) => item.conversationId === normalizedConversationId) || null;
    const lastMessage = normalizedMessages[normalizedMessages.length - 1];
    const userMap = new Map((Array.isArray(users) ? users : []).map((user) => [String(user?.username || "").trim(), user]));
    const sender = userMap.get(lastMessage.senderId) || null;
    const receiver = userMap.get(lastMessage.receiverId) || null;

    return {
      conversationId: normalizedConversationId,
      reason: String(reason || "").trim(),
      reviewedBy: String(reviewer || "").trim(),
      reviewedAt: new Date().toISOString(),
      participants: {
        sender: sender ? {
          username: sender.username || lastMessage.senderId,
          fullName: sender.fullName || sender.username || lastMessage.senderId,
          role: sender.role || ""
        } : {
          username: lastMessage.senderId,
          fullName: lastMessage.senderId,
          role: ""
        },
        receiver: receiver ? {
          username: receiver.username || lastMessage.receiverId,
          fullName: receiver.fullName || receiver.username || lastMessage.receiverId,
          role: receiver.role || ""
        } : {
          username: lastMessage.receiverId,
          fullName: lastMessage.receiverId,
          role: ""
        }
      },
      summary: thread || {
        conversationId: normalizedConversationId,
        senderId: lastMessage.senderId,
        receiverId: lastMessage.receiverId,
        productId: lastMessage.productId || "",
        productName: lastMessage.productName || "",
        messageType: lastMessage.messageType || "text",
        messageCount: normalizedMessages.length,
        unreadCount: normalizedMessages.filter((message) => !message.isRead).length,
        lastMessageAt: lastMessage.timestamp || lastMessage.createdAt || "",
        lastMessagePreview: String(lastMessage.message || "").trim().slice(0, 160),
        reportCount: 0,
        hasReportedContent: false
      },
      messages: normalizedMessages.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        productId: message.productId || "",
        productName: message.productName || "",
        messageType: message.messageType || "text",
        message: message.message || "",
        timestamp: message.timestamp || "",
        createdAt: message.createdAt || "",
        updatedAt: message.updatedAt || "",
        deliveredAt: message.deliveredAt || "",
        readAt: message.readAt || "",
        isDelivered: Boolean(message.isDelivered),
        isRead: Boolean(message.isRead)
      }))
    };
  }

  function createMarketplaceImageProxyUrl(value) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source) {
      return "";
    }
    if (/^(?:data|blob):/i.test(source)) {
      return source;
    }
    try {
      const configuredApiBaseUrl = String(window.WINGA_CONFIG?.apiBaseUrl || "").trim().replace(/\/+$/, "");
      const publicBaseUrl = configuredApiBaseUrl.replace(/\/api$/, "");
      const baseUrl = source.startsWith("/uploads/") && publicBaseUrl
        ? publicBaseUrl
        : window.location.origin;
      const parsed = new URL(source, baseUrl);
      if (parsed.pathname === "/__winga-image__") {
        const unwrappedSource = parsed.searchParams.get("u") || "";
        return unwrappedSource ? createMarketplaceImageProxyUrl(unwrappedSource) : "";
      }
      if (publicBaseUrl && parsed.origin === publicBaseUrl && parsed.pathname.startsWith("/uploads/")) {
        return parsed.toString();
      }
      if (!["http:", "https:"].includes(parsed.protocol) || !publicBaseUrl) {
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
          ? storedProducts.map(resolveProductImagesForRuntime)
          : [];
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
          whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || "verified",
          whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || "",
          pendingWhatsappNumber: updatedUser.pendingWhatsappNumber || "",
          pendingWhatsappExpiresAt: updatedUser.pendingWhatsappExpiresAt || "",
          profileImage: updatedUser.profileImage || "",
          verificationStatus: updatedUser.verificationStatus || "",
          token: session.token || null
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
        const refreshedSession = buildSessionPayload(updatedUser, session.token || null);
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

  function emitApiMetric(detail) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof window.CustomEvent !== "function") {
      return;
    }
    try {
      window.dispatchEvent(new window.CustomEvent("winga:api-metric", { detail }));
    } catch (error) {
      // Metrics must never block the user path.
    }
  }

  function getApiEndpointLabel(url) {
    try {
      const parsedUrl = new URL(String(url || ""), window.location.origin);
      return parsedUrl.pathname.replace(/^\/api\//, "/");
    } catch (error) {
      return String(url || "");
    }
  }

  async function fetchJson(url, options) {
    const startedAt = Date.now();
    const endpointLabel = getApiEndpointLabel(url);
    const requestOptions = options ? { ...options } : {};
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = Number(
      requestOptions.timeoutMs
      || window.WINGA_CONFIG?.requestTimeoutMs
      || 25000
    );
    delete requestOptions.timeoutMs;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetch(url, {
        ...requestOptions,
        signal: controller ? controller.signal : undefined
      });
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const latencyMs = Date.now() - startedAt;
      if (error?.name === "AbortError") {
        const endpoint = String(url || "");
        let message = "Request took too long. Check your connection and try again.";
        if (endpoint.includes("/auth/signup")) {
          message = "Seller signup took too long. Check your connection and try again.";
        }
        if (endpoint.includes("/auth/admin-login")) {
          message = "Admin login took too long. Check your connection and try again.";
        }
        if (endpoint.includes("/auth/login")) {
          message = "Login took too long. Check your connection and try again.";
        }
        emitApiMetric({
          endpoint: endpointLabel,
          ok: false,
          status: 0,
          code: "timeout",
          latencyMs
        });
        throw createRequestError(message, {
          code: "timeout",
          retryable: true,
          endpoint: endpointLabel,
          latencyMs
        });
      }
      const networkError = createRequestError(error?.message || "Network issue. Check your connection and try again.", {
        code: "network",
        retryable: true,
        endpoint: endpointLabel,
        latencyMs
      });
      emitApiMetric({
        endpoint: endpointLabel,
        ok: false,
        status: 0,
        code: "network",
        latencyMs
      });
      throw networkError;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      let errorMessage = `Request failed: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          errorMessage = errorBody.error;
        }
      } catch (error) {
        // Ignore JSON parse failures and keep fallback message.
      }
      const normalizedMessage = String(errorMessage || "").toLowerCase();
      const shouldInvalidateSession = response.status === 401
        ? normalizedMessage.includes("session")
          || normalizedMessage.includes("imeisha")
          || normalizedMessage.includes("hakupatikana")
        : response.status === 403
          && (
            normalizedMessage.includes("imesimamishwa")
            || normalizedMessage.includes("imezuiwa")
            || normalizedMessage.includes("imezimwa")
          );
      if (shouldInvalidateSession) {
        safeStorageRemove(SESSION_KEY);
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:session-invalidated", {
            detail: {
              status: response.status,
              message: errorMessage
            }
          }));
        }
      }
      const latencyMs = Date.now() - startedAt;
      emitApiMetric({
        endpoint: endpointLabel,
        ok: false,
        status: response.status,
        code: `http_${response.status}`,
        latencyMs
      });
      throw createRequestError(errorMessage, {
        code: `http_${response.status}`,
        status: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        endpoint: endpointLabel,
        latencyMs
      });
    }
    const data = response.status === 204 ? null : await response.json();
    emitApiMetric({
      endpoint: endpointLabel,
      ok: true,
      status: response.status,
      latencyMs: Date.now() - startedAt
    });
    return data;
  }

  function createApiAdapter(config) {
    const baseUrl = (config.apiBaseUrl || "http://localhost:3000/api").replace(/\/$/, "");
    const publicBaseUrl = baseUrl.replace(/\/api$/, "");
    const sessionAdapter = createLocalAdapter();
    const localFallbackAdapter = createLocalAdapter();

    function resolveProductImages(product) {
      if (!product || typeof product !== "object") {
        return product;
      }

      const resolveImage = (value) => {
        if (typeof value === "string" && value.startsWith("/uploads/")) {
          return createMarketplaceImageProxyUrl(`${publicBaseUrl}${value}`);
        }
        return createMarketplaceImageProxyUrl(value);
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
      const session = sessionAdapter.loadSession();
      if (session?.token) {
        return {
          Authorization: `Bearer ${session.token}`
        };
      }
      return {};
    }

    function getAuthTimeoutMs() {
      return Number(window.WINGA_CONFIG?.authRequestTimeoutMs || 11000);
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
      async loadProducts() {
        const data = await fetchJson(`${baseUrl}/products`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        const nextProducts = Array.isArray(data) ? data.map(resolveProductImages) : [];
        void localFallbackAdapter.saveProducts(nextProducts.map(normalizeProductForPersistence)).catch(() => {});
        return nextProducts;
      },
      async loadCachedProducts() {
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
        void localFallbackAdapter.saveProducts(Array.isArray(products) ? products : []).catch(() => {});
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
      async logoutSession(tokenOverride = "") {
        const session = sessionAdapter.loadSession();
        const token = String(tokenOverride || session?.token || "").trim();
        if (!token) {
          sessionAdapter.clearSession();
          return { ok: true };
        }
        try {
          return await fetchJson(`${baseUrl}/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
        } finally {
          sessionAdapter.clearSession();
        }
      },
      async restoreSession() {
        const session = sessionAdapter.loadSession();
        if (!session?.token) {
          sessionAdapter.clearSession();
          return null;
        }

        try {
          const data = await fetchJson(`${baseUrl}/auth/session`, {
            headers: {
              ...createAuthHeaders()
            },
            timeoutMs: Number(window.WINGA_CONFIG?.sessionRestoreTimeoutMs || 12000)
          });
          if (!data || typeof data !== "object" || Array.isArray(data) || !String(data.username || "").trim()) {
            sessionAdapter.clearSession();
            return null;
          }
          return data;
        } catch (error) {
          const stillStoredSession = sessionAdapter.loadSession();
          if (stillStoredSession?.token) {
            return stillStoredSession;
          }
          sessionAdapter.clearSession();
          return null;
        }
      },
      async signup(payload) {
        return authFetchJson(`${baseUrl}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stripSignupCategoryFields(payload))
        }, {
          retries: 0
        });
      },
      async login(payload) {
        return authFetchJson(`${baseUrl}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }, {
          retries: 1
        });
      },
      async recoverPassword(payload) {
        return authFetchJson(`${baseUrl}/auth/recover-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }, {
          retries: 0
        });
      },
      async adminLogin(payload) {
        return authFetchJson(`${baseUrl}/auth/admin-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }, {
          retries: 1
        });
      },
      async updateUserProfile(payload) {
        return fetchJson(`${baseUrl}/users/me/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async upgradeBuyerToSeller(payload) {
        return fetchJson(`${baseUrl}/users/me/upgrade-to-seller`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async requestWhatsappChange(payload) {
        return fetchJson(`${baseUrl}/users/me/whatsapp/request-change`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async verifyWhatsappChange(payload) {
        return fetchJson(`${baseUrl}/users/me/whatsapp/verify-change`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
        if (!normalizedCategory) {
          return { ok: true, ignored: true };
        }
        await fetchJson(`${baseUrl}/users/primary-category`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify({ username, primaryCategory: normalizedCategory })
        });
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
        const result = await fetchJson(`${baseUrl}/products`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(product)
        });
        return resolveProductImages(result);
      },
      async updateProduct(productId, payload) {
        const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
        return resolveProductImages(result);
      },
      async deleteProduct(productId) {
        return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}`, {
          method: "DELETE",
          headers: {
            ...createAuthHeaders()
          }
        });
      },
        async loadAnalytics() {
          return fetchJson(`${baseUrl}/analytics/summary`, {
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async loadMessages() {
          const data = await fetchJson(`${baseUrl}/messages`, {
            headers: {
              ...createAuthHeaders()
            }
          });
          return Array.isArray(data) ? data : [];
        },
        async sendMessage(payload) {
          return fetchJson(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
        async deleteMessage(messageId) {
          return fetchJson(`${baseUrl}/messages/${encodeURIComponent(messageId)}`, {
            method: "DELETE",
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async markConversationRead(payload) {
          return fetchJson(`${baseUrl}/messages/read`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
        async loadNotifications() {
          const data = await fetchJson(`${baseUrl}/notifications`, {
            headers: {
              ...createAuthHeaders()
            }
          });
          return Array.isArray(data) ? data : [];
        },
        async markNotificationRead(notificationId) {
          return fetchJson(`${baseUrl}/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: "PATCH",
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async loadPromotions() {
          const data = await fetchJson(`${baseUrl}/promotions`, {
            headers: {
              ...createAuthHeaders()
            }
          });
          return Array.isArray(data) ? data : [];
        },
        async createPromotion(payload) {
          return fetchJson(`${baseUrl}/promotions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
      async loadAdminPromotions() {
        const data = await fetchJson(`${baseUrl}/admin/promotions`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async loadAdminOpsSummary() {
        return fetchJson(`${baseUrl}/admin/ops/summary`, {
          headers: {
            ...createAuthHeaders()
          }
        });
      },
      async disablePromotion(promotionId) {
        return fetchJson(`${baseUrl}/admin/promotions/${encodeURIComponent(promotionId)}/disable`, {
          method: "PATCH",
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        openRealtimeChannel(handlers = {}) {
          const session = sessionAdapter.loadSession();
          if (!session?.token || typeof EventSource === "undefined") {
            return null;
          }

          const streamUrl = `${baseUrl}/messages/stream?token=${encodeURIComponent(session.token)}`;
          const source = new EventSource(streamUrl);
          const parseEvent = (event) => {
            try {
              return event?.data ? JSON.parse(event.data) : null;
            } catch (error) {
              return null;
            }
          };

          source.addEventListener("message", (event) => {
            handlers.onMessage?.(parseEvent(event));
          });
          source.addEventListener("notification", (event) => {
            handlers.onNotification?.(parseEvent(event));
          });
          source.addEventListener("message_read", (event) => {
            handlers.onMessageRead?.(parseEvent(event));
          });
          source.addEventListener("conversation_read", (event) => {
            handlers.onConversationRead?.(parseEvent(event));
          });
          source.addEventListener("users", (event) => {
            handlers.onUsers?.(parseEvent(event));
          });
          source.onerror = () => {
            handlers.onError?.();
          };

          return {
            close() {
              source.close();
            }
          };
        },
        async loadReviews(productId = "") {
          const suffix = productId ? `?productId=${encodeURIComponent(productId)}` : "";
          return fetchJson(`${baseUrl}/reviews${suffix}`);
        },
        async createReview(payload) {
          return fetchJson(`${baseUrl}/reviews`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
        async loadMyOrders() {
          return fetchJson(`${baseUrl}/orders/mine`, {
            headers: {
            ...createAuthHeaders()
          }
        });
      },
      async createOrder(payload) {
        return fetchJson(`${baseUrl}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async updateOrderStatus(orderId, payload) {
        return fetchJson(`${baseUrl}/orders/${encodeURIComponent(orderId)}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async updateProductAvailability(productId, payload) {
        return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/availability`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadAdminUsers() {
        const data = await fetchJson(`${baseUrl}/admin/users`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async loadAdminProducts(status = "") {
        const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
        const data = await fetchJson(`${baseUrl}/admin/products${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data.map(resolveProductImages) : [];
      },
      async loadAdminOrders(filters = {}) {
        const params = new URLSearchParams();
        if (filters.paymentStatus) {
          params.set("paymentStatus", filters.paymentStatus);
        }
        if (filters.status) {
          params.set("status", filters.status);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson(`${baseUrl}/admin/orders${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data.map(resolveProductImages) : [];
      },
      async loadAdminPayments(filters = {}) {
        const params = new URLSearchParams();
        if (filters.paymentStatus) {
          params.set("paymentStatus", filters.paymentStatus);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson(`${baseUrl}/admin/payments${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async createReport(payload) {
        return fetchJson(`${baseUrl}/reports`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadAdminReports(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) {
          params.set("status", filters.status);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson(`${baseUrl}/admin/reports${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async reviewReport(reportId, payload) {
        return fetchJson(`${baseUrl}/admin/reports/${encodeURIComponent(reportId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadAdminSettings() {
        const data = await fetchJson(`${baseUrl}/admin/settings`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return normalizeAppSettings(data || DEFAULT_APP_SETTINGS);
      },
      async updateAdminSettings(payload) {
        const data = await fetchJson(`${baseUrl}/admin/settings`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload || {})
        });
        return normalizeAppSettings(data || DEFAULT_APP_SETTINGS);
      },
      async loadAdminMessages() {
        const data = await fetchJson(`${baseUrl}/admin/messages`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async reviewAdminMessage(conversationId, payload = {}) {
        return fetchJson(`${baseUrl}/admin/messages/${encodeURIComponent(conversationId)}/review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload || {})
        });
      },
      async loadAdminUserInvestigation(username, payload) {
        return fetchJson(`${baseUrl}/admin/users/${encodeURIComponent(username)}/investigation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload || {})
        });
      },
      async moderateUser(username, payload) {
        return fetchJson(`${baseUrl}/admin/users/${encodeURIComponent(username)}/moderation`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadModerationActions() {
        const data = await fetchJson(`${baseUrl}/admin/moderation-actions`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async logClientEvent(event) {
        try {
          await fetchJson(`${baseUrl}/client-events`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(event)
          });
        } catch (error) {
          // Ignore telemetry failures.
        }
      },
      async moderateProduct(productId, payload) {
        const result = await fetchJson(`${baseUrl}/admin/products/${encodeURIComponent(productId)}/moderate`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
        return resolveProductImages(result);
      },
      async likeProduct(productId) {
        const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/like`, {
          method: "POST",
          headers: {
            ...createAuthHeaders()
          }
        });
        return resolveProductImages(result);
      },
      async trackProductView(productId) {
        const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/view`, {
          method: "POST",
          headers: {
            ...createAuthHeaders()
          }
        });
        return resolveProductImages(result);
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
        return loadDocument(firebaseConfig.productsDocumentPath || "wingaState/products");
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
          whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || "verified",
          whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || "",
          pendingWhatsappNumber: updatedUser.pendingWhatsappNumber || "",
          pendingWhatsappExpiresAt: updatedUser.pendingWhatsappExpiresAt || "",
          profileImage: updatedUser.profileImage || "",
          verificationStatus: updatedUser.verificationStatus || "",
          token: session.token || null
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
          return null;
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

  function chooseAdapter(config) {
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
    categories: [],
    appSettings: normalizeAppSettings(DEFAULT_APP_SETTINGS),
    initialized: false,
    productsHydrated: false,
    startupHydrationStarted: false,
    offlineQueueListenerBound: false,
    adapter: null,
    activeProvider: ""
  };

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

  async function loadInitialState(adapter) {
    state.productsHydrated = false;
    if (typeof adapter.loadCachedProducts === "function") {
      try {
        const cachedProducts = await adapter.loadCachedProducts();
        if (Array.isArray(cachedProducts) && cachedProducts.length) {
          state.products = cachedProducts;
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
    Promise.resolve()
      .then(() => adapter.loadProducts())
      .then((products) => {
        const nextProducts = Array.isArray(products) ? products : [];
        if (nextProducts.length || !Array.isArray(state.products) || state.products.length === 0) {
          state.products = nextProducts;
        }
        state.productsHydrated = true;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "loaded",
              count: state.products.length
            }
          }));
        }
        return state.products;
      })
      .catch((error) => {
        console.warn("[WINGA] Product startup load failed.", error);
        state.productsHydrated = true;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "failed",
              count: state.products.length,
              error: String(error?.message || error || "")
            }
          }));
        }
        return state.products;
      });

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
        console.warn("[WINGA] Optional startup load failed for users.", error);
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
        console.warn("[WINGA] Optional startup load failed for categories.", error);
        return state.categories;
      });
  }

  window.WingaDataLayer = {
    async init() {
      if (state.initialized) return;
      ensureAdapter();
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
        if (state.activeProvider === "api") {
          clearLegacyLocalFallbackArtifacts();
        }
      } catch (error) {
        const fallbackProvider = typeof config.fallbackProvider === "string"
          ? config.fallbackProvider.trim()
          : (config.fallbackProvider || "local");
        const canFallback = fallbackProvider && fallbackProvider !== state.activeProvider;
        if (!canFallback) {
          console.warn("[WINGA] Startup hydration failed.", error);
          return;
        }

        console.warn(`[WINGA] Provider "${state.activeProvider}" failed during startup hydration. Falling back to "${fallbackProvider}".`, error);
        state.activeProvider = fallbackProvider;
        state.adapter = chooseAdapter({
          ...config,
          provider: fallbackProvider
        });
        try {
          await loadInitialState(state.adapter);
        } catch (fallbackError) {
          console.warn("[WINGA] Fallback startup hydration failed.", fallbackError);
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
    getCachedProducts() {
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
    cleanupLocalFallbackArtifacts() {
      clearLegacyLocalFallbackArtifacts();
    },
    async saveProducts(products) {
      const nextProducts = clone(products);
      await state.adapter.saveProducts(nextProducts);
      state.products = nextProducts;
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
      const nextProducts = await state.adapter.loadProducts();
      state.products = Array.isArray(nextProducts) ? nextProducts : [];
      state.productsHydrated = true;
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
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async updateProduct(productId, payload) {
      assertSellerAccess();
      const result = await state.adapter.updateProduct(productId, payload);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async deleteProduct(productId) {
      assertSellerAccess();
      const result = await state.adapter.deleteProduct(productId);
      state.products = await state.adapter.loadProducts();
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
