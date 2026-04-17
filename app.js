const USERS_KEY = "winga-users";
const PRODUCTS_KEY = "winga-products";
const SESSION_KEY = "winga-current-user";
const APP_VIEW_KEY = "winga-app-view";
const PENDING_GUEST_INTENT_KEY = "winga-pending-guest-intent";
const SELLER_HISTORY_KEY_PREFIX = "winga-seller-history";
const REQUEST_BOX_KEY_PREFIX = "winga-request-box";
const { CHAT_EMOJI_CHOICES } = window.WingaModules.config.chat;
const {
  MARKETPLACE_CATEGORY_TREE,
  DEFAULT_TOP_CATEGORIES,
  DEFAULT_PRODUCT_CATEGORIES,
  LEGACY_CATEGORY_MAPPINGS
} = window.WingaModules.config.categories;
const FLEXIBLE_SUBCATEGORY_TOP_VALUES = new Set(["vitu-used"]);
const MAX_UPLOAD_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"];
const PROFILE_IMAGE_TARGET_BYTES = 420 * 1024;
const PRODUCT_IMAGE_TARGET_BYTES = 850 * 1024;
const DOCUMENT_IMAGE_TARGET_BYTES = 1100 * 1024;
const LOCAL_PROFILE_IMAGE_TARGET_BYTES = 220 * 1024;
const LOCAL_PRODUCT_IMAGE_TARGET_BYTES = 380 * 1024;
const LOCAL_DOCUMENT_IMAGE_TARGET_BYTES = 560 * 1024;
const FAST_SIGNUP_DOCUMENT_TARGET_BYTES = 4 * 1024 * 1024;
const SIGNUP_DOCUMENT_PREP_TIMEOUT_MS = 15000;
const IMAGE_HASH_SIZE = 8;
const BUYER_CANCEL_WINDOW_MS = 48 * 60 * 60 * 1000;
const AppCore = window.WingaCore || {};
const { PROMOTION_OPTIONS } = window.WingaModules.config.promotions;
const {
  createChatUiState,
  createProductDetailUiState,
  createRuntimeState
} = window.WingaModules.state;
const {
  createElement,
  setEmptyCopy,
  setAdminNavLabel,
  createSectionHeading,
  createFragmentFromMarkup,
  createElementFromMarkup
} = window.WingaModules.components.dom;
const {
  createStatusPill,
  createEmptyState,
  createStatBox,
  createCategoryButton,
  createResponsiveImage,
  createSlideDot,
  sanitizeImageSource
} = window.WingaModules.components.ui;
const { createObservabilityModule } = window.WingaModules.monitoring;

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

function getUsers() {
  return window.WingaDataLayer.getUsers();
}

function saveUsers(users) {
  return window.WingaDataLayer.saveUsers(users);
}

function getProducts() {
  return window.WingaDataLayer.getProducts();
}

function normalizeProductsFromStore() {
  const storedProducts = getProducts();
  return (Array.isArray(storedProducts) ? storedProducts : []).map(normalizeProduct);
}

function rebuildProductIndex() {
  productIndex = new Map(products.map((product) => [product.id, product]));
}

function refreshProductsFromStore() {
  products = normalizeProductsFromStore();
  rebuildProductIndex();
  pruneBrokenMarketplaceImageRegistry();
}

function getProductById(productId) {
  return productIndex.get(String(productId || "")) || null;
}

function saveProducts(productsList) {
  return window.WingaDataLayer.saveProducts(productsList);
}

function getSessionUser() {
  return window.WingaDataLayer.getSessionUser();
}

function saveSessionUser(session) {
  window.WingaDataLayer.saveSessionUser(session);
}

function clearSessionUser() {
  window.WingaDataLayer.clearSessionUser();
}

function isStaffRole(role) {
  return role === "admin" || role === "moderator";
}

function getStoredAppView() {
  try {
    return JSON.parse(localStorage.getItem(APP_VIEW_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function getPendingGuestIntent() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_GUEST_INTENT_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function savePendingGuestIntent(intent = null) {
  try {
    if (!intent || typeof intent !== "object") {
      localStorage.removeItem(PENDING_GUEST_INTENT_KEY);
      return;
    }
    localStorage.setItem(PENDING_GUEST_INTENT_KEY, JSON.stringify(intent));
  } catch (error) {
    reportClientEvent("warn", "pending_guest_intent_persist_failed", "Unable to persist pending guest intent.", {
      category: "runtime"
    });
  }
}

function getRestorableCategory(categoryValue) {
  if (!categoryValue || categoryValue === "all") {
    return "all";
  }
  return isValidProductCategory(categoryValue) || isTopCategoryValue(categoryValue)
    ? categoryValue
    : "all";
}

function supportsFlexibleSubcategory(topValue) {
  return FLEXIBLE_SUBCATEGORY_TOP_VALUES.has(String(topValue || "").trim().toLowerCase());
}

function saveAppViewState() {
  if (!currentUser) {
    return;
  }

  try {
    localStorage.setItem(APP_VIEW_KEY, JSON.stringify({
      username: currentUser,
      view: currentView,
      selectedCategory
    }));
  } catch (error) {
    reportClientEvent("warn", "app_view_state_persist_failed", "Unable to persist app view state.", {
      category: "runtime",
      user: currentUser
    });
  }
}

function clearAppViewState() {
  try {
    localStorage.removeItem(APP_VIEW_KEY);
  } catch (error) {
    reportClientEvent("warn", "app_view_state_clear_failed", "Unable to clear app view state.", {
      category: "runtime",
      user: currentUser || ""
    });
  }
}

function getSellerHistoryStorageKey(username = currentUser) {
  return `${SELLER_HISTORY_KEY_PREFIX}:${username || "guest"}`;
}

function loadBuyerSellerAffinityState(username = currentUser) {
  if (!username) {
    return {};
  }
  try {
    const rawValue = window.localStorage.getItem(getSellerHistoryStorageKey(username));
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([sellerId, entry]) => {
          const normalizedSellerId = String(sellerId || "").trim();
          const safeScore = Number(entry?.score || 0);
          if (!normalizedSellerId || !Number.isFinite(safeScore) || safeScore <= 0) {
            return null;
          }
          return [normalizedSellerId, {
            score: Math.min(420, safeScore),
            updatedAt: entry?.updatedAt || ""
          }];
        })
        .filter(Boolean)
    );
  } catch (error) {
    return {};
  }
}

function saveBuyerSellerAffinityState() {
  if (!currentUser) {
    return;
  }
  try {
    window.localStorage.setItem(
      getSellerHistoryStorageKey(currentUser),
      JSON.stringify(buyerSellerAffinity)
    );
  } catch (error) {
    reportClientEvent("warn", "seller_affinity_persist_failed", "Unable to persist seller affinity history.", {
      category: "runtime",
      user: currentUser
    });
  }
}

function hydrateBuyerSellerAffinityState(username = currentUser) {
  buyerSellerAffinity = loadBuyerSellerAffinityState(username);
}

function noteSellerInterest(sellerId, weight = 1) {
  const normalizedSellerId = String(sellerId || "").trim();
  const safeWeight = Number(weight);
  if (!currentUser || !normalizedSellerId || !Number.isFinite(safeWeight) || safeWeight <= 0 || normalizedSellerId === currentUser) {
    return;
  }
  const nextEntry = buyerSellerAffinity[normalizedSellerId] || { score: 0, updatedAt: "" };
  buyerSellerAffinity = {
    ...buyerSellerAffinity,
    [normalizedSellerId]: {
      score: Math.min(420, Math.max(0, nextEntry.score) + safeWeight),
      updatedAt: new Date().toISOString()
    }
  };
  saveBuyerSellerAffinityState();
}

function getBuyerSellerAffinityEntries() {
  return Object.entries(buyerSellerAffinity).map(([sellerId, entry]) => ({
    sellerId,
    score: Number(entry?.score || 0),
    updatedAt: entry?.updatedAt || ""
  })).filter((entry) => entry.sellerId && entry.score > 0);
}

function setCurrentViewState(nextView, options = {}) {
  const {
    syncNav = true,
    persist = true,
    syncHistory = true,
    historyState = {}
  } = options;
  currentView = nextView;
  if (syncNav) {
    setActiveNav(currentView);
  }
  if (persist) {
    saveAppViewState();
  }
  if (syncHistory) {
    syncAppShellHistoryState({
      mode: typeof syncHistory === "string" ? syncHistory : "replace",
      overrides: {
        view: nextView,
        pendingProfileSection: nextView === "profile"
          ? (historyState.pendingProfileSection || profileRuntimeState.pendingSection || "")
          : "",
        ...historyState
      }
    });
  }
}

function setCategorySelectionState(categoryValue, options = {}) {
  const nextCategory = categoryValue || "all";
  const nextExpanded = Object.prototype.hasOwnProperty.call(options, "expandedBrowseCategory")
    ? options.expandedBrowseCategory
    : (isTopCategoryValue(nextCategory)
      ? nextCategory
      : nextCategory === "all"
        ? ""
        : inferTopCategoryValue(nextCategory));
  selectedCategory = nextCategory;
  expandedBrowseCategory = nextExpanded || "";
  if (options.persist !== false) {
    saveAppViewState();
  }
  if (options.syncHistory !== false) {
    syncAppShellHistoryState({
      mode: typeof options.syncHistory === "string" ? options.syncHistory : "replace",
      overrides: {
        selectedCategory: nextCategory,
        pendingProfileSection: currentView === "profile" ? (profileRuntimeState.pendingSection || "") : ""
      }
    });
  }
}

function applySessionState(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    currentSession = null;
    currentUser = "";
    return;
  }

  const username = String(session.username || "").trim();
  if (!username) {
    currentSession = null;
    currentUser = "";
    return;
  }

  const role = String(session.role || "").trim().toLowerCase();
  const normalizedRole = ["buyer", "seller", "admin", "moderator"].includes(role) ? role : "seller";

  currentSession = {
    ...session,
    username,
    fullName: String(session.fullName || username).trim() || username,
    primaryCategory: String(session.primaryCategory || "").trim(),
    role: normalizedRole,
    phoneNumber: String(session.phoneNumber || "").replace(/\D/g, "").slice(0, 20),
    whatsappNumber: String(session.whatsappNumber || session.phoneNumber || "").replace(/\D/g, "").slice(0, 20),
    profileImage: String(session.profileImage || "").trim(),
    verificationStatus: String(session.verificationStatus || "").trim(),
    verifiedSeller: Boolean(session.verifiedSeller),
    token: typeof session.token === "string" ? session.token.trim() : ""
  };
  currentUser = username;
}

function mergeSessionState(patch = {}) {
  applySessionState({
    ...(currentSession || {}),
    ...patch
  });
}

function getRequestBoxStorageKey(username = currentUser) {
  return `${REQUEST_BOX_KEY_PREFIX}:${username || "guest"}`;
}

function closeMobileCategoryMenu() {
  searchRuntimeState.isMobileCategoryOpen = false;
  searchRuntimeState.mobileCategoryTopValue = "";
  mobileCategoryShell?.classList.remove("open");
  mobileCategoryButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("mobile-category-sheet-open");
  syncMobileHeaderVisibility(true);
  syncBodyScrollLockState();
}

function closePinnedDesktopCategoryMenu(options = {}) {
  const { rerender = true } = options;
  if (!pinnedDesktopCategory) {
    return;
  }
  pinnedDesktopCategory = "";
  if (rerender) {
    renderFilterCategories();
  }
}

function toggleMobileCategoryMenu(forceState) {
  const nextOpenState = typeof forceState === "boolean" ? forceState : !searchRuntimeState.isMobileCategoryOpen;
  searchRuntimeState.isMobileCategoryOpen = nextOpenState;
  if (searchRuntimeState.isMobileCategoryOpen) {
    searchRuntimeState.isMobileSearchOpen = false;
    searchRuntimeState.isInputFocused = false;
    searchBox.classList.remove("mobile-open");
    searchRuntimeState.mobileCategoryTopValue = "";
    renderFilterCategories();
  }
  mobileCategoryShell?.classList.toggle("open", searchRuntimeState.isMobileCategoryOpen);
  mobileCategoryButton?.setAttribute("aria-expanded", String(searchRuntimeState.isMobileCategoryOpen));
  syncMobileHeaderVisibility(true);
  syncMobileCategorySheetOffset();
  syncBodyScrollLockState();
}

function syncBodyScrollLockState() {
  const isMobileSheetVisible = Boolean(
    getViewportWidth() <= 720
    && searchRuntimeState.isMobileCategoryOpen
    && mobileCategoryShell
    && mobileCategoryShell.style.display !== "none"
    && mobileCategoryShell.classList.contains("open")
  );
  const isAuthModalVisible = Boolean(
    authContainer
    && authContainer.style.display !== "none"
  );
  const productDetailModal = document.getElementById("product-detail-modal");
  const isProductDetailVisible = Boolean(
    productDetailModal
    && productDetailModal.style.display !== "none"
  );
  const contextChatModal = document.getElementById("context-chat-modal");
  const isContextChatVisible = Boolean(
    contextChatModal
    && contextChatModal.style.display !== "none"
  );
  const mediaActionSheet = document.getElementById("media-action-sheet");
  const isMediaActionSheetVisible = Boolean(
    mediaActionSheet
    && mediaActionSheet.classList.contains("open")
  );
  const imageLightbox = document.getElementById("image-lightbox");
  const isImageLightboxVisible = Boolean(
    imageLightbox
    && imageLightbox.classList.contains("open")
  );

  document.body.classList.toggle("mobile-category-sheet-open", isMobileSheetVisible);
  document.body.classList.toggle("auth-modal-open", isAuthModalVisible);
  document.body.classList.toggle("product-detail-open", isProductDetailVisible);
  document.body.classList.toggle("context-chat-open", isContextChatVisible);
  document.body.classList.toggle("media-action-sheet-open", isMediaActionSheetVisible);
  document.body.classList.toggle("image-lightbox-open", isImageLightboxVisible);
}

function resetTransientChromeState() {
  searchRuntimeState.isMobileSearchOpen = false;
  searchRuntimeState.isInputFocused = false;
  searchRuntimeState.isMobileCategoryOpen = false;
  searchRuntimeState.mobileCategoryTopValue = "";
  searchRuntimeState.isSearchDropdownDismissed = false;
  searchBox?.classList.remove("mobile-open");
  mobileCategoryShell?.classList.remove("open");
  mobileCategoryButton?.setAttribute("aria-expanded", "false");
  pinnedDesktopCategory = "";
  toggleHeaderUserMenu(false);
  document.body.classList.remove(
    "mobile-category-sheet-open",
    "auth-modal-open",
    "product-detail-open",
    "context-chat-open",
    "media-action-sheet-open",
    "image-lightbox-open",
    "mobile-header-hidden"
  );
  setMobileHeaderHidden(false, { force: true });
  syncMobileHeaderVisibility(true);
  syncSearchChromeState();
  syncBodyScrollLockState();
}

function syncMobileCategorySheetOffset() {
  if (getViewportWidth() > 720) {
    document.documentElement.style.removeProperty("--mobile-category-sheet-top");
    return;
  }
  const topBarRect = topBar?.getBoundingClientRect();
  const topOffset = Math.max(64, Math.ceil((topBarRect?.bottom || 0)) + 6);
  document.documentElement.style.setProperty("--mobile-category-sheet-top", `${topOffset}px`);
}

function scheduleRenderCurrentView() {
  if (uiRuntimeState.renderFrame) {
    cancelAnimationFrame(uiRuntimeState.renderFrame);
  }

  uiRuntimeState.renderFrame = requestAnimationFrame(() => {
    uiRuntimeState.renderFrame = 0;
    renderCurrentView();
  });
}

function scheduleSearchDrivenRender(delayMs = 120) {
  if (searchRuntimeState.renderDebounceTimer) {
    clearTimeout(searchRuntimeState.renderDebounceTimer);
    searchRuntimeState.renderDebounceTimer = 0;
  }

  searchRuntimeState.renderDebounceTimer = window.setTimeout(() => {
    searchRuntimeState.renderDebounceTimer = 0;
    scheduleRenderCurrentView();
  }, Math.max(0, Number(delayMs || 0)));
}

function syncSearchChromeState() {
  if (!topBar) {
    return;
  }
  const hasSearchValue = Boolean(searchInput?.value?.trim());
  const isSearchEngaged = Boolean(
    searchRuntimeState.isInputFocused
    || hasSearchValue
    || searchRuntimeState.activeImageSearch?.signature
    || searchRuntimeState.isMobileSearchOpen
  );
  topBar.classList.toggle("search-engaged", isSearchEngaged);
}

function createId() {
  return `product-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function detectCategory(name) {
  const nameLower = name.toLowerCase();
  if (nameLower.includes("gauni")) return "wanawake-magauni";
  if (nameLower.includes("sketi")) return "wanawake-sketi";
  if (nameLower.includes("blouse") || nameLower.includes("blauzi")) return "wanawake-blouse";
  if (nameLower.includes("crop top")) return "wanawake-crop-top";
  if (nameLower.includes("vitenge") || nameLower.includes("kitenge")) return "wanawake-vitenge";
  if (nameLower.includes("abaya")) return "wanawake-abaya";
  if (nameLower.includes("hijabu") || nameLower.includes("hijab")) return "wanawake-hijabu";
  if (nameLower.includes("baibui")) return "wanawake-baibui";
  if (nameLower.includes("shungi")) return "wanawake-shungi";
  if (nameLower.includes("sherehe") || nameLower.includes("party") || nameLower.includes("occasion")) return "sherehe-mavazi";
  if (nameLower.includes("casual") || nameLower.includes("everyday") || nameLower.includes("daily")) return "casual-mavazi";
  if (nameLower.includes("suti")) return "wanaume-suti";
  if (nameLower.includes("jeans")) return "wanaume-jeans";
  if (nameLower.includes("boxer")) return "wanaume-boxer";
  if (nameLower.includes("sweater")) return "wanaume-sweater";
  if (nameLower.includes("tracksuit") || nameLower.includes("track suit")) return "wanaume-tracksuit";
  if (nameLower.includes("jacket")) return "wanaume-jacket";
  if (nameLower.includes("koti")) return "wanaume-koti";
  if (nameLower.includes("crocs")) return "wanaume-crocs";
  if (nameLower.includes("suruali kitambaa")) return "wanaume-suruali-kitambaa";
  if (nameLower.includes("shati")) return "wanaume-mashati";
  if (nameLower.includes("t-shirt")) return "wanaume-t-shirt";
  if (nameLower.includes("suruali")) return "wanaume-suruali-kitambaa";
  if (nameLower.includes("sneaker")) return "viatu-sneakers";
  if (nameLower.includes("sandal")) return "viatu-sandals";
  if (nameLower.includes("heel")) return "viatu-high-heels";
  if (nameLower.includes("boot")) return "viatu-boots";
  if (nameLower.includes("raba kali")) return "viatu-raba-kali";
  if (nameLower.includes("miguu mikali")) return "viatu-miguu-mikali";
  if (nameLower.includes("viatu vikali")) return "viatu-vikali";
  if (nameLower.includes("official")) return "viatu-official";
  if (nameLower.includes("kiatu") || nameLower.includes("viatu")) return "viatu-sneakers";
  if (
    nameLower.includes("sufuria") ||
    nameLower.includes("sahani") ||
    nameLower.includes("kikombe") ||
    nameLower.includes("vikombe") ||
    nameLower.includes("vyombo")
  ) return "vyombo-sufuria";
  if (
    nameLower.includes("tv") ||
    nameLower.includes("simu") ||
    nameLower.includes("phone") ||
    nameLower.includes("laptop") ||
    nameLower.includes("computer") ||
    nameLower.includes("friji ndogo ya kielektroniki") ||
    nameLower.includes("electronics")
  ) return "electronics";
  if (
    nameLower.includes("friji") ||
    nameLower.includes("jiko") ||
    nameLower.includes("blender") ||
    nameLower.includes("microwave") ||
    nameLower.includes("pasi") ||
    nameLower.includes("home appliance")
  ) return "home-appliance";
  if (
    nameLower.includes("mtoto") ||
    nameLower.includes("watoto") ||
    nameLower.includes("baby") ||
    nameLower.includes("kids")
  ) return "watoto-seti-za-watoto";
  return "other";
}

function normalizeWhatsapp(value) {
  return value.replace(/\D/g, "");
}

function normalizePhoneNumber(value) {
  return value.replace(/\D/g, "");
}

function normalizeNationalId(value) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isValidPhoneNumber(value) {
  return /^\d{10,15}$/.test(normalizePhoneNumber(value));
}

function isValidNationalId(value) {
  return /^[A-Z0-9]{8,20}$/.test(normalizeNationalId(value));
}

function getAuthPasswordMinLength() {
  return 6;
}

function getUsersByPhoneNumber(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  return getUsers().filter((item) => normalizePhoneNumber(item.phoneNumber || "") === normalizedPhone);
}

function getUsersByIdentityNumber(identityNumber) {
  const normalizedIdentity = normalizeNationalId(identityNumber);
  return getUsers().filter((item) => normalizeNationalId(item.nationalId || item.identityDocumentNumber || "") === normalizedIdentity);
}

function updateSellerIdentityDocumentPreview(file = null) {
  if (!sellerIdentityDocumentPreview || !sellerIdentityDocumentPreviewWrap) {
    return;
  }
  const previousPreviewUrl = sellerIdentityDocumentPreview.dataset.previewUrl || "";
  if (previousPreviewUrl) {
    URL.revokeObjectURL(previousPreviewUrl);
    delete sellerIdentityDocumentPreview.dataset.previewUrl;
  }

  if (!file) {
    sellerIdentityDocumentPreview.removeAttribute("src");
    sellerIdentityDocumentPreviewWrap.style.display = "none";
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  sellerIdentityDocumentPreview.src = previewUrl;
  sellerIdentityDocumentPreview.dataset.previewUrl = previewUrl;
  sellerIdentityDocumentPreviewWrap.style.display = "block";
}

function validateSellerIdentityImageFile(file) {
  if (!file) {
    throw new Error("Please upload your ID image");
  }
  if (!isAllowedImageFile(file)) {
    throw new Error("Invalid file type");
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`ID image must be ${MAX_IMAGE_SIZE_MB}MB or below.`);
  }
}

function getCurrentWhatsappNumber() {
  const marketplaceUser = getMarketplaceUser(currentUser);
  return normalizeWhatsapp(
    currentSession?.whatsappNumber
    || marketplaceUser?.whatsappNumber
    || currentSession?.phoneNumber
    || marketplaceUser?.phoneNumber
    || ""
  );
}

function getProductWhatsappNumber(product) {
  if (!product) {
    return "";
  }
  const ownerPhone = product.uploadedBy === currentUser
    ? getCurrentWhatsappNumber()
    : normalizeWhatsapp(getMarketplaceUser(product.uploadedBy)?.whatsappNumber || getMarketplaceUser(product.uploadedBy)?.phoneNumber || "");
  return normalizeWhatsapp(product.whatsapp || ownerPhone);
}

function validateAuthSignupInput() {
  const identityValue = usernameInput.value.trim();
  const phoneNumber = normalizePhoneNumber(phoneNumberInput.value);
  const buyerNationalId = normalizeNationalId(nationalIdInput.value);
  const sellerIdentityNumber = normalizeNationalId(sellerIdentityDocumentNumberInput?.value || "");
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();
  const passwordMinLength = getAuthPasswordMinLength();
  const normalizedIdentityNumber = selectedAuthRole === "seller" ? sellerIdentityNumber : buyerNationalId;

  if (!identityValue || !phoneNumber || !normalizedIdentityNumber || !password || !confirmPassword) {
    return selectedAuthRole === "buyer"
      ? "Jaza full name, namba ya simu, NIDA, password, na confirm password."
      : "Jaza username, namba ya simu, ID type, ID number, ID image, password, na confirm password.";
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return "Weka namba ya simu ya WhatsApp sahihi yenye tarakimu 10 hadi 15.";
  }

  if (!isValidNationalId(normalizedIdentityNumber)) {
    return "Weka NIDA sahihi yenye herufi au namba 8 hadi 20.";
  }

  if (password.length < passwordMinLength) {
    return `Password inapaswa kuwa angalau herufi ${passwordMinLength}.`;
  }

  if (password !== confirmPassword) {
    return "Password na confirm password hazifanani.";
  }

  const duplicatePhone = getUsersByPhoneNumber(phoneNumber).find((user) =>
    selectedAuthRole === "buyer"
      ? String(user.role || "").toLowerCase() === "buyer" || String(user.phoneNumber || "") === phoneNumber
      : String(user.phoneNumber || "") === phoneNumber
  );
  if (duplicatePhone) {
    return "Namba hiyo ya simu tayari imesajiliwa.";
  }

  if (getUsersByIdentityNumber(normalizedIdentityNumber).length > 0) {
    return "This identity number is already registered. Please contact the moderator.";
  }

  if (selectedAuthRole === "seller") {
    if (!sellerIdentityDocumentTypeInput?.value) {
      return "Please select your ID type";
    }
    if (!sellerIdentityNumber) {
      return "Please enter your ID number";
    }
    if (!sellerIdentityDocumentImageInput?.files?.[0]) {
      return "Please upload your ID image";
    }

    try {
      validateSellerIdentityImageFile(sellerIdentityDocumentImageInput.files[0]);
    } catch (error) {
      return error.message || "Please upload a valid ID image";
    }
  }

  return "";
}

function isValidProductCategory(category) {
  return availableCategories.some((item) => item.value === category);
}

function isAllowedImageFile(file) {
  const fileType = String(file?.type || "").toLowerCase();
  if (ALLOWED_IMAGE_TYPES.includes(fileType)) {
    return true;
  }
  const fileName = String(file?.name || "").toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function isHeicLikeFile(file) {
  return /image\/hei(c|f)/i.test(file?.type || "") || /\.(heic|heif)$/i.test(file?.name || "");
}

function validateImageFiles(files) {
  if (files.length > MAX_UPLOAD_IMAGES) {
    throw new Error(`Chagua picha zisizozidi ${MAX_UPLOAD_IMAGES}.`);
  }

  files.forEach((file) => {
    if (!isAllowedImageFile(file)) {
      throw new Error("Tumia picha za JPG, PNG, WEBP, GIF au HEIC/HEIF.");
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`Kila picha inapaswa kuwa ${MAX_IMAGE_SIZE_MB}MB au chini.`);
    }
  });
}

function validateSingleImageFile(file, label = "Picha") {
  if (!file) {
    throw new Error(`${label} inahitajika.`);
  }
  validateImageFiles([file]);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer || 0);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function readRawFileAsDataUrlWithReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fail = () => reject(new Error("Imeshindikana kusoma picha uliyochagua."));
    reader.onloadend = () => {
      if (reader.error) {
        fail();
        return;
      }
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        fail();
        return;
      }
      resolve(result);
    };
    reader.onerror = fail;
    reader.onabort = fail;
    reader.readAsDataURL(file);
  });
}

async function readRawFileAsDataUrl(file) {
  if (!file) {
    throw new Error("Hakuna picha iliyochaguliwa.");
  }
  if (typeof file.arrayBuffer === "function" && typeof window.btoa === "function") {
    try {
      const buffer = await file.arrayBuffer();
      const mimeType = String(file.type || "application/octet-stream").trim() || "application/octet-stream";
      return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
    } catch (error) {
      // Fall back to FileReader for browsers that reject arrayBuffer unexpectedly.
    }
  }
  return readRawFileAsDataUrlWithReader(file);
}

function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || "").split(",")[1] || "";
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Imeshindikana kufungua picha uliyochagua."));
    };
    image.src = objectUrl;
  });
}

function waitForImageElementReady(image) {
  return new Promise((resolve, reject) => {
    if (!image) {
      reject(new Error("Imeshindikana kufungua picha uliyochagua."));
      return;
    }
    if ((image.complete && (image.naturalWidth || image.width))) {
      resolve(image);
      return;
    }
    const handleLoad = () => resolve(image);
    const handleError = () => reject(new Error("Imeshindikana kufungua picha uliyochagua."));
    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

function getActiveDataProvider() {
  return String(
    window.WingaDataLayer?.getActiveProvider?.()
    || window.WINGA_CONFIG?.provider
    || "local"
  ).trim().toLowerCase();
}

function createImageReadOptions(options = {}) {
  const purpose = options.purpose || "generic";
  const fastMode = Boolean(options.fastMode);
  const provider = getActiveDataProvider();
  const useLocalBudget = provider === "local" || provider === "mock";
  if (purpose === "profile") {
    return {
      maxDimension: 720,
      targetBytes: useLocalBudget ? LOCAL_PROFILE_IMAGE_TARGET_BYTES : PROFILE_IMAGE_TARGET_BYTES,
      initialQuality: 0.84,
      minimumQuality: 0.56,
      qualityStep: 0.08,
      maxIterations: 12
    };
  }
  if (purpose === "document") {
    return {
      maxDimension: fastMode ? 1400 : 1600,
      targetBytes: useLocalBudget
        ? LOCAL_DOCUMENT_IMAGE_TARGET_BYTES
        : (fastMode ? FAST_SIGNUP_DOCUMENT_TARGET_BYTES : DOCUMENT_IMAGE_TARGET_BYTES),
      initialQuality: fastMode ? 0.82 : 0.86,
      minimumQuality: fastMode ? 0.7 : 0.6,
      qualityStep: fastMode ? 0.12 : 0.06,
      maxIterations: fastMode ? 4 : 10
    };
  }
  return {
    maxDimension: 1440,
    targetBytes: useLocalBudget ? LOCAL_PRODUCT_IMAGE_TARGET_BYTES : PRODUCT_IMAGE_TARGET_BYTES,
    initialQuality: 0.84,
    minimumQuality: 0.56,
    qualityStep: 0.08,
    maxIterations: 12
  };
}

function optimizeLoadedImageAsDataUrl(image, options = {}, file = null) {
  const settings = createImageReadOptions(options);
  const longestSide = Math.max(image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1);
  const initialScale = Math.min(1, settings.maxDimension / Math.max(longestSide, 1));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("Browser hii imeshindwa kuandaa picha kwa upload.");
  }
  let width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * initialScale));
  let height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * initialScale));
  let quality = settings.initialQuality;
  let bestResult = "";
  let iterations = 0;

  const outputType = isHeicLikeFile(file) ? "image/jpeg" : "image/webp";

  const renderCandidate = () => {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const candidate = canvas.toDataURL(outputType, quality);
    if (outputType === "image/webp" && !candidate.startsWith("data:image/webp")) {
      return canvas.toDataURL("image/jpeg", quality);
    }
    return candidate;
  };

  bestResult = renderCandidate();
  while (
    estimateDataUrlBytes(bestResult) > settings.targetBytes
    && (quality > settings.minimumQuality || Math.max(width, height) > 320)
    && iterations < Math.max(1, Number(settings.maxIterations || 10))
  ) {
    iterations += 1;
    if (quality > settings.minimumQuality) {
      quality = Math.max(settings.minimumQuality, Number((quality - settings.qualityStep).toFixed(2)));
    } else {
      width = Math.max(1, Math.round(width * 0.88));
      height = Math.max(1, Math.round(height * 0.88));
    }
    bestResult = renderCandidate();
  }

  return bestResult;
}

async function optimizeImageFileAsDataUrl(file, options = {}) {
  if (!file) {
    throw new Error("Hakuna picha iliyochaguliwa.");
  }
  if (file.type === "image/gif") {
    return readRawFileAsDataUrl(file);
  }

  const settings = createImageReadOptions(options);
  if (file.size <= settings.targetBytes && !isHeicLikeFile(file)) {
    return readRawFileAsDataUrl(file);
  }

  const image = await loadImageElementFromFile(file);
  return optimizeLoadedImageAsDataUrl(image, options, file);
}

function withOperationTimeout(promise, timeoutMs, message) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function readSellerSignupIdentityImage(file) {
  if (!file) {
    throw new Error("Please upload your ID image");
  }
  validateSingleImageFile(file, "ID image");
  const provider = getActiveDataProvider();
  const shouldUseFastRawRead = !isHeicLikeFile(file)
    && provider !== "local"
    && provider !== "mock"
    && file.size <= FAST_SIGNUP_DOCUMENT_TARGET_BYTES;
  const readOperation = shouldUseFastRawRead
    ? readRawFileAsDataUrl(file)
    : readFileAsDataUrl(file, { purpose: "document", fastMode: true });
  return withOperationTimeout(
    readOperation,
    SIGNUP_DOCUMENT_PREP_TIMEOUT_MS,
    "Preparing your ID image took too long. Please try a smaller JPG or PNG."
  );
}

function getFileSignature(file) {
  if (!file) {
    return "";
  }
  return [
    file.name || "",
    file.size || 0,
    file.lastModified || 0,
    file.type || ""
  ].join(":");
}

function clearPreparedSellerIdentityImage() {
  sellerIdentityPreparedSignature = "";
  sellerIdentityPreparedDataUrl = "";
  sellerIdentityPreparedPromise = null;
}

function getImmediateSellerIdentityPreviewDataUrl(file) {
  const previewImage = sellerIdentityDocumentPreview;
  const isPreviewReady = Boolean(
    previewImage?.src
    && previewImage.complete
    && (previewImage.naturalWidth || previewImage.width)
  );
  if (!isPreviewReady) {
    return "";
  }
  try {
    return optimizeLoadedImageAsDataUrl(previewImage, { purpose: "document", fastMode: true }, file);
  } catch (error) {
    return "";
  }
}

async function readPreparedSellerIdentityImageFromPreview(file) {
  const immediatePreviewResult = getImmediateSellerIdentityPreviewDataUrl(file);
  if (immediatePreviewResult) {
    return immediatePreviewResult;
  }
  if (!sellerIdentityDocumentPreview?.src) {
    return readSellerSignupIdentityImage(file);
  }
  const previewImage = await waitForImageElementReady(sellerIdentityDocumentPreview);
  return optimizeLoadedImageAsDataUrl(previewImage, { purpose: "document", fastMode: true }, file);
}

function primeSellerSignupIdentityImage(file) {
  if (!file) {
    clearPreparedSellerIdentityImage();
    return Promise.resolve("");
  }
  const signature = getFileSignature(file);
  sellerIdentityPreparedSignature = signature;
  sellerIdentityPreparedDataUrl = "";
  const prepPromise = readPreparedSellerIdentityImageFromPreview(file)
    .then((dataUrl) => {
      if (sellerIdentityPreparedSignature === signature) {
        sellerIdentityPreparedDataUrl = dataUrl;
      }
      return dataUrl;
    })
    .catch((error) => {
      if (sellerIdentityPreparedSignature === signature) {
        sellerIdentityPreparedDataUrl = "";
      }
      throw error;
    })
    .finally(() => {
      if (sellerIdentityPreparedSignature === signature) {
        sellerIdentityPreparedPromise = null;
      }
    });
  sellerIdentityPreparedPromise = prepPromise;
  return prepPromise;
}

function resolveSellerSignupIdentityImage(file) {
  if (!file) {
    throw new Error("Please upload your ID image");
  }
  const immediatePreviewResult = getImmediateSellerIdentityPreviewDataUrl(file);
  if (immediatePreviewResult) {
    return Promise.resolve(immediatePreviewResult);
  }
  const signature = getFileSignature(file);
  if (signature && signature === sellerIdentityPreparedSignature && sellerIdentityPreparedDataUrl) {
    return Promise.resolve(sellerIdentityPreparedDataUrl);
  }
  if (signature && signature === sellerIdentityPreparedSignature && sellerIdentityPreparedPromise) {
    return withOperationTimeout(
      Promise.resolve(sellerIdentityPreparedPromise),
      SIGNUP_DOCUMENT_PREP_TIMEOUT_MS,
      "Preparing your ID image took too long. Please try a smaller JPG or PNG."
    );
  }
  return readPreparedSellerIdentityImageFromPreview(file);
}

function readFileAsDataUrl(file, options = {}) {
  return optimizeImageFileAsDataUrl(file, options).catch((error) => {
    if (isHeicLikeFile(file)) {
      throw new Error("Picha ya HEIC/HEIF haikuweza kubadilishwa kwenye format inayotumika hapa. Jaribu JPG au PNG.");
    }
    const provider = getActiveDataProvider();
    if (provider === "local" || provider === "mock") {
      throw error;
    }
    return readRawFileAsDataUrl(file);
  });
}

function normalizeProductLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatNumber(value) {
  return new Intl.NumberFormat("sw-TZ").format(value);
}

function normalizeOptionalPrice(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasProductPrice(value) {
  return normalizeOptionalPrice(value) !== null;
}

function formatProductPrice(value, options = {}) {
  const {
    fallback = "Bei kwa maelewano",
    includeCurrency = true
  } = options;
  const normalized = normalizeOptionalPrice(value);
  if (normalized === null) {
    return fallback;
  }
  return includeCurrency ? `TSh ${formatNumber(normalized)}` : formatNumber(normalized);
}

function compareProductsByPrice(first, second, direction = "asc") {
  const firstPrice = normalizeOptionalPrice(first?.price);
  const secondPrice = normalizeOptionalPrice(second?.price);
  if (firstPrice === null && secondPrice === null) {
    return 0;
  }
  if (firstPrice === null) {
    return 1;
  }
  if (secondPrice === null) {
    return -1;
  }
  return direction === "desc" ? secondPrice - firstPrice : firstPrice - secondPrice;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getImageFallbackDataUri(label = "WINGA") {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <rect width="640" height="640" fill="#F5F7FA"/>
      <rect x="80" y="80" width="480" height="480" rx="32" fill="#FFFFFF" stroke="#E5E7EB"/>
      <text x="320" y="300" text-anchor="middle" font-family="Segoe UI, Arial" font-size="42" fill="#232F3E">${label}</text>
      <text x="320" y="360" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" fill="#6B7280">Image unavailable</text>
    </svg>
  `)}`;
}

function getCategoryLabel(category) {
  const subcategoryMatch = availableCategories.find((item) => item.value === category);
  if (subcategoryMatch) {
    return formatSubcategoryLabel(subcategoryMatch.label);
  }

  const topCategoryMatch = availableTopCategories.find((item) => item.value === category);
  if (topCategoryMatch) {
    return formatTopCategoryLabel(topCategoryMatch.label);
  }

  const legacyMatch = LEGACY_CATEGORY_MAPPINGS[category];
  if (legacyMatch) {
    const isTopCategory = legacyMatch.value === legacyMatch.topValue && legacyMatch.value === category;
    return isTopCategory
      ? formatTopCategoryLabel(legacyMatch.label)
      : formatSubcategoryLabel(legacyMatch.label);
  }

  return formatSubcategoryLabel(humanizeCategoryValue(category)) || "Other";
}

function getStatusLabel(status) {
  if (status === "pending") return "Inasubiri review";
  if (status === "rejected") return "Imekataliwa";
  if (status === "placed") return "Placed";
  if (status === "paid") return "Paid";
  if (status === "confirmed") return "Confirmed";
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  if (status === "sold_out") return "Sold Out";
  return "Approved";
}

function getPromotionStatusLabel(status) {
  if (status === "active") return "Sponsored";
  if (status === "expired") return "Expired";
  if (status === "disabled") return "Disabled";
  return "Pending";
}

function getPaymentStatusLabel(status) {
  if (status === "paid") return "Paid";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function getOrderLifecycleMeta(order) {
  return AppCore.getOrderLifecycleMeta
    ? AppCore.getOrderLifecycleMeta(order)
    : {
      id: "request_sent",
      label: "Request sent",
      detail: "Winga itaonyesha hatua ya request hapa.",
      tone: "pending"
    };
}

function isModeratorUser() {
  return currentSession?.role === "moderator";
}

function isAdminUser() {
  return currentSession?.role === "admin";
}

function isStaffUser() {
  return isAdminUser() || isModeratorUser();
}

const {
  isBuyerUser,
  isSellerUser,
  canUseBuyerFeatures,
  canUseSellerFeatures,
  isAuthenticatedUser,
  shouldHideOwnProductsInMarketplace,
  isMarketplaceBrowseCandidate
} = window.WingaModules.auth.createPermissionsHelpers({
  getCurrentSession: () => currentSession,
  getCurrentUser: () => currentUser,
  getCurrentView: () => currentView,
  getMarketplaceUser
});

function canAccessView(view) {
  if (!isAuthenticatedUser()) {
    return view === "home";
  }
  if (isStaffUser()) {
    return view === "home" || view === "admin";
  }
  if (view === "home" || view === "profile") {
    return true;
  }
  if (view === "upload") {
    return canUseSellerFeatures();
  }
  if (view === "admin") {
    return isStaffUser();
  }
  return true;
}

function getAccessDeniedMessage(view) {
  if (isStaffUser() && (view === "profile" || view === "upload")) {
    return "Staff account hutumia admin access route na admin surface pekee.";
  }
  if (view === "upload") {
    return "Akaunti ya mteja haiwezi kutumia upload ya bidhaa.";
  }
  if (view === "admin") {
    return "Hii area inaruhusiwa kwa admin au moderator tu.";
  }
  return "Huna ruhusa ya kufungua area hiyo.";
}

function clearPendingGuestIntent() {
  pendingGuestIntent = null;
  savePendingGuestIntent(null);
}

function showAuthGatePrompt(options = {}) {
  if (!authGatePrompt) {
    return;
  }

  authGateTitle.innerText = options.title || "You need an account to continue";
  authGateCopy.innerText = options.message || "Already have an account? Sign In. New here? Sign Up.";
  authGatePrompt.style.display = "block";
}

function hideAuthGatePrompt() {
  if (authGatePrompt) {
    authGatePrompt.style.display = "none";
  }
}

function openAuthModal(mode = "login", options = {}) {
  isPasswordRecovery = mode === "recover";
  isLogin = !isPasswordRecovery && mode !== "signup";
  authSignupStep = 1;
  selectedAuthRole = options.role || "seller";
  if (options.prefillIdentifier) {
    usernameInput.value = options.prefillIdentifier;
  }
  syncAuthMode();
  hideAdminLoginScreen();
  if (options.gated) {
    showAuthGatePrompt(options);
  } else {
    hideAuthGatePrompt();
  }
  authContainer.style.display = "block";
  document.body.classList.add("auth-modal-open");
  syncBodyScrollLockState();
}

function closeAuthModal() {
  if (isAuthenticatedUser()) {
    return;
  }
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  hideAuthGatePrompt();
  syncBodyScrollLockState();
}

function promptGuestAuth(options = {}) {
  pendingGuestIntent = options.intent || null;
  savePendingGuestIntent(pendingGuestIntent);
  openAuthModal(options.preferredMode || "signup", {
    gated: true,
    role: options.role || "buyer",
    title: options.title || "You need an account to continue",
    message: options.message || "Already have an account? Sign In. New here? Sign Up."
  });
}

function refreshPublicEntryChrome() {
  const isGuest = !isAuthenticatedUser();
  const isSessionRestoreUi = isSessionRestorePending && isGuest;
  if (publicHeaderActions) {
    publicHeaderActions.style.display = isGuest && !isSessionRestoreUi ? "flex" : "none";
  }
  if (headerUserMenu) {
    headerUserMenu.style.display = isGuest || isSessionRestoreUi ? "none" : "flex";
  }
  if (publicFooter) {
    publicFooter.style.display = isGuest && !isSessionRestoreUi ? "block" : "none";
  }
  if (headerSearchArea) {
    headerSearchArea.style.display = isGuest || isSessionRestoreUi ? "none" : "flex";
  }
  if (topBarSubtitle) {
    topBarSubtitle.innerText = isSessionRestoreUi
      ? "Restoring your WINGA session..."
      : isGuest
      ? "Discover products first. Sign in only when you want to buy, chat, or sell."
      : "";
    topBarSubtitle.style.display = isGuest || isSessionRestoreUi ? "" : "none";
  }
  updateMarketplaceActionChrome();
  renderHeaderUserMenu();
}

function buildAppShellHistoryState(overrides = {}) {
  const baseState = window.history.state && typeof window.history.state === "object"
    ? window.history.state
    : {};
  return {
    ...baseState,
    wingaAppShell: true,
    wingaProductDetail: false,
    productId: "",
    sourceProductId: "",
    detailDepth: 0,
    view: currentView || "home",
    selectedCategory: getRestorableCategory(selectedCategory),
    username: currentUser || "",
    role: currentSession?.role || "",
    pendingProfileSection: currentView === "profile" ? (profileRuntimeState.pendingSection || "") : "",
    ...overrides
  };
}

function syncAppShellHistoryState(options = {}) {
  const { force = false, mode = "replace", overrides = {}, url } = options;
  if (!window.history?.replaceState || document.body.classList.contains("product-detail-open")) {
    return;
  }

  const nextState = buildAppShellHistoryState(overrides);
  const currentState = window.history.state && typeof window.history.state === "object"
    ? window.history.state
    : null;
  const stateAlreadySynced = !force
    && currentState?.wingaAppShell
    && currentState.view === nextState.view
    && currentState.selectedCategory === nextState.selectedCategory
    && currentState.username === nextState.username
    && currentState.role === nextState.role
    && String(currentState.pendingProfileSection || "") === String(nextState.pendingProfileSection || "");
  if (stateAlreadySynced) {
    return;
  }

  const nextUrl = typeof url === "string"
    ? url
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (mode === "push" && window.history?.pushState) {
    window.history.pushState(nextState, "", nextUrl);
    return;
  }
  window.history.replaceState(nextState, "", nextUrl);
}

function shouldShowBottomNav() {
  return appChrome.shouldShowBottomNav ? appChrome.shouldShowBottomNav() : false;
}

function shouldShowPostProductFab() {
  return appChrome.shouldShowPostProductFab ? appChrome.shouldShowPostProductFab() : false;
}

function shouldShowViewHomeBack() {
  return appChrome.shouldShowViewHomeBack ? appChrome.shouldShowViewHomeBack() : false;
}

function isMobileHeaderAutoHideEnabled() {
  return appChrome.isMobileHeaderAutoHideEnabled ? appChrome.isMobileHeaderAutoHideEnabled() : false;
}

function setMobileHeaderHidden(hidden, options = {}) {
  return appChrome.setMobileHeaderHidden?.(hidden, options);
}

function syncMobileHeaderVisibility(force = false) {
  return appChrome.syncMobileHeaderVisibility?.(force);
}

function scheduleMobileHeaderScrollSync() {
  return appChrome.scheduleMobileHeaderScrollSync?.();
}

function updateMarketplaceActionChrome() {
  return appChrome.updateMarketplaceActionChrome?.();
}

function resumePendingGuestIntent() {
  if (!pendingGuestIntent) {
    pendingGuestIntent = getPendingGuestIntent();
  }
  if (!pendingGuestIntent) {
    return;
  }

  const intent = pendingGuestIntent;
  clearPendingGuestIntent();

  if (intent.type === "open-chat" && intent.productId) {
    const product = getProductById(intent.productId);
    if (product) {
      openProductChat(product);
      return;
    }
  }

  if (intent.type === "add-request" && intent.productId) {
    const product = getProductById(intent.productId);
    if (product) {
      addProductToRequestBox(product, { openProfile: true });
      return;
    }
  }

  if (intent.type === "go-upload" && canAccessView("upload")) {
    setCurrentViewState("upload");
    renderCurrentView();
    return;
  }

  if (intent.type === "go-profile" && canAccessView("profile")) {
    setCurrentViewState("profile");
    renderCurrentView();
    return;
  }

  if (intent.type === "focus-product" && intent.productId) {
    const product = getProductById(intent.productId);
    if (product) {
      setCurrentViewState("home");
      renderCurrentView();
      openProductDetailModal(intent.productId);
      return;
    }
  }

  if (intent.productId) {
    const product = getProductById(intent.productId);
    if (product) {
      setCurrentViewState("home");
      searchInput.value = product.name;
    }
  }

  setCurrentViewState("home");
  renderCurrentView();
}

function getRoleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  if (role === "buyer") return "Mteja";
  return "Muuzaji";
}

function getCurrentDisplayName() {
  return String(currentSession?.fullName || currentUser || "User").trim() || "User";
}

function getUserInitials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) {
    return "U";
  }
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getCurrentProfileImage() {
  return String(currentSession?.profileImage || getMarketplaceUser(currentUser)?.profileImage || "").trim();
}

function getVerificationStatusLabel(status) {
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function getHeaderMenuItems() {
  if (isStaffUser()) {
    return [
      { action: "admin", label: getAdminNavLabel() },
      { action: "logout", label: "Logout", danger: true }
    ];
  }

  const unreadMessages = getTotalUnreadMessages();
  const unreadNotifications = getUnreadNotifications().length;
  const items = [
    { action: "profile", label: "Profile" },
    { action: "orders", label: isBuyerUser() ? "My Orders" : "Orders" },
    { action: "messages", label: `Messages${unreadMessages ? ` (${Math.min(unreadMessages, 99)}${unreadMessages > 99 ? "+" : ""})` : ""}` }
  ];

  if (unreadNotifications) {
    items.push({ action: "notifications", label: `Notifications (${Math.min(unreadNotifications, 99)}${unreadNotifications > 99 ? "+" : ""})` });
  }

  if (isStaffUser()) {
    items.push({ action: "admin", label: getAdminNavLabel() });
  }

  items.push({ action: "logout", label: "Logout", danger: true });
  return items;
}

function toggleHeaderUserMenu(forceState) {
  if (!headerUserMenu || !headerUserTrigger || !headerUserDropdown || !isAuthenticatedUser()) {
    return;
  }

  profileRuntimeState.isHeaderUserMenuOpen = typeof forceState === "boolean" ? forceState : !profileRuntimeState.isHeaderUserMenuOpen;
  headerUserMenu.classList.toggle("open", profileRuntimeState.isHeaderUserMenuOpen);
  headerUserTrigger.setAttribute("aria-expanded", String(profileRuntimeState.isHeaderUserMenuOpen));
  headerUserDropdown.style.display = profileRuntimeState.isHeaderUserMenuOpen ? "block" : "none";
  syncMobileHeaderVisibility(true);
}

function renderHeaderUserMenu() {
  if (!headerUserMenu || !headerUserTrigger || !headerUserDropdown) {
    return;
  }

  if (!isAuthenticatedUser()) {
    profileRuntimeState.isHeaderUserMenuOpen = false;
    headerUserMenu.classList.remove("open");
    headerUserTrigger.setAttribute("aria-expanded", "false");
    headerUserDropdown.style.display = "none";
    return;
  }

  const displayName = getCurrentDisplayName();
  const profileImage = getCurrentProfileImage();

  if (headerUserName) {
    headerUserName.textContent = displayName;
  }

  if (headerUserAvatarFallback) {
    headerUserAvatarFallback.textContent = getUserInitials(displayName);
    headerUserAvatarFallback.style.display = profileImage ? "none" : "inline-flex";
  }

  if (headerUserAvatarImage) {
    headerUserAvatarImage.src = profileImage;
    headerUserAvatarImage.style.display = profileImage ? "block" : "none";
  }

  headerUserDropdown.replaceChildren(
    ...getHeaderMenuItems().map((item) => {
      const button = createElement("button", {
        className: `header-user-menu-item${item.danger ? " danger" : ""}`,
        attributes: {
          type: "button",
          "data-header-menu-action": item.action
        }
      });
      button.appendChild(createElement("span", { textContent: item.label }));
      return button;
    })
  );
}

function openProfileSection(sectionId = "") {
  if (isStaffUser()) {
    toggleHeaderUserMenu(false);
    setCurrentViewState("admin", {
      syncHistory: "push"
    });
    renderCurrentView();
    return;
  }
  profileRuntimeState.pendingSection = sectionId;
  profileRuntimeState.activeSection = sectionId || profileRuntimeState.activeSection || "profile-products-panel";
  toggleHeaderUserMenu(false);
  setCurrentViewState("profile", {
    syncHistory: "push",
    historyState: {
      pendingProfileSection: sectionId || ""
    }
  });
  renderCurrentView();
}

function flushPendingProfileSection() {
  if (!profileRuntimeState.pendingSection || currentView !== "profile") {
    return;
  }

  const sectionId = profileRuntimeState.pendingSection;
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }

  profileRuntimeState.pendingSection = "";
  requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setActiveProfileSection(sectionId) {
  profileRuntimeState.activeSection = sectionId || "profile-products-panel";
  if (currentView === "profile" && profileDiv) {
    profileDiv.dataset.activeSection = profileRuntimeState.activeSection;
  }
}

function getActiveProfileSection() {
  return profileRuntimeState.activeSection || "";
}

function getAdminNavLabel() {
  return isModeratorUser() ? "Moderation" : "Admin";
}

function getMarketplaceUser(username) {
  return getUsers().find((user) => user.username === username) || null;
}

function normalizeDisplayName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function looksLikePhoneIdentity(value) {
  const normalized = normalizeDisplayName(value);
  if (!normalized) {
    return false;
  }
  if (!/^[+\d\s().-]+$/.test(normalized)) {
    return false;
  }
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 9;
}

function looksLikeTechnicalIdentity(value) {
  const normalized = normalizeDisplayName(value).toLowerCase();
  if (!normalized) {
    return false;
  }
  return /^buyer-\d{6,}$/.test(normalized)
    || /^user-\d{6,}$/.test(normalized)
    || /^guest-\d{6,}$/.test(normalized);
}

function isPresentableDisplayName(value) {
  const normalized = normalizeDisplayName(value);
  if (!normalized) {
    return false;
  }
  if (looksLikePhoneIdentity(normalized) || looksLikeTechnicalIdentity(normalized)) {
    return false;
  }
  return true;
}

function getUserShopLabel(username) {
  if (!username) {
    return "";
  }
  const ownLatestProduct = products.find((item) =>
    item.uploadedBy === username
    && typeof item.shop === "string"
    && item.shop.trim()
  );
  return normalizeDisplayName(ownLatestProduct?.shop || "");
}

function getUserDisplayName(username, options = {}) {
  const {
    fallback = "",
    shop = "",
    role = ""
  } = options;
  const marketplaceUser = username ? getMarketplaceUser(username) : null;
  const sessionMatchesCurrentUser = username && username === currentUser ? currentSession : null;
  const normalizedUsername = normalizeDisplayName(username);
  const preferredHumanNames = [
    sessionMatchesCurrentUser?.fullName,
    marketplaceUser?.fullName
  ]
    .map(normalizeDisplayName)
    .filter((item) => item && item !== normalizedUsername);
  const strongFallbacks = [
    shop,
    getUserShopLabel(username),
    fallback
  ].map(normalizeDisplayName);
  const candidateNames = [
    ...preferredHumanNames,
    ...strongFallbacks,
    sessionMatchesCurrentUser?.username,
    marketplaceUser?.username,
    username
  ].map(normalizeDisplayName);

  const presentable = candidateNames.find(isPresentableDisplayName);
  if (presentable) {
    return presentable;
  }

  const normalizedRole = String(role || sessionMatchesCurrentUser?.role || marketplaceUser?.role || "").toLowerCase();
  if (normalizedRole === "buyer") {
    return "Mteja wa Winga";
  }
  if (normalizedRole === "seller") {
    return "Muuzaji wa Winga";
  }
  return "Mtumiaji wa Winga";
}

function getCurrentUserDisplayName() {
  return getUserDisplayName(currentUser, {
    fallback: currentSession?.fullName || currentUser || "",
    role: currentSession?.role || ""
  });
}

const {
  getPromotionPriority,
  getActivePromotions,
  getProductPromotions,
  getPrimaryPromotion,
  getPromotionLabel,
  getPromotionSortScore,
  getPromotionCommercialScore
} = window.WingaModules.promotions.createPromotionHelpers({
  getCurrentPromotions: () => currentPromotions,
  getSelectedCategory: () => selectedCategory,
  promotionOptions: PROMOTION_OPTIONS
});

function noteProductInterest(productId) {
  if (!productId) {
    return;
  }
  productSeenTimestamps[productId] = Date.now();
  lastViewedProductId = productId;
  recentlyViewedProductIds = [productId, ...recentlyViewedProductIds.filter((item) => item !== productId)].slice(0, 12);
  const relatedProduct = getProductById(productId);
  if (relatedProduct?.uploadedBy) {
    noteSellerInterest(relatedProduct.uploadedBy, 16);
  }
}

function noteProductDiscovery(productId) {
  if (!productId) {
    return;
  }
  productSeenTimestamps[productId] = Date.now();
  productDiscoveryTrail = [productId, ...productDiscoveryTrail.filter((item) => item !== productId)].slice(0, 18);
}

function rememberBehaviorValue(list, value, limit = 8) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return list;
  }
  return [normalized, ...list.filter((item) => item !== normalized)].slice(0, limit);
}

function noteCategoryInterest(category) {
  if (!category || category === "all") {
    return;
  }
  recentCategorySelections = rememberBehaviorValue(recentCategorySelections, category, 6);
}

function noteSearchInterest(term) {
  const normalized = String(term || "").trim().toLowerCase();
  if (normalized.length < 2) {
    return;
  }
  recentSearchTerms = rememberBehaviorValue(recentSearchTerms, normalized, 8);
}

function noteMessageInterest(productId) {
  if (!productId) {
    return;
  }
  recentMessagedProductIds = rememberBehaviorValue(recentMessagedProductIds, productId, 10);
  const relatedProduct = getProductById(productId);
  if (relatedProduct?.uploadedBy) {
    noteSellerInterest(relatedProduct.uploadedBy, 34);
  }
}

const {
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
  clearSessionState: clearRequestBoxSessionState,
  getLastSentRequestSummary
} = window.WingaModules.requests.createRequestBoxModule({
  createElement,
  createSectionHeading,
  confirmAction,
  getCurrentUser: () => currentUser,
  canUseBuyerFeatures,
  getRequestBoxStorageKey,
  getProducts: () => products,
  getProductById,
  getMarketplaceUser,
  getImageFallbackDataUri,
  getCurrentView: () => currentView,
  setPendingProfileSection: (value) => {
    profileRuntimeState.pendingSection = value;
  },
  renderProfile,
  renderCurrentView,
  refreshRequestButtonsUI: () => refreshVisibleRequestButtons(document),
  isProductDetailOpen: () => document.body.classList.contains("product-detail-open"),
  openProductDetailModal: (productId) => openProductDetailModal(productId),
  showInAppNotification,
  confirmAction,
  reportEvent: (...args) => reportClientEvent(...args),
  captureError: (...args) => captureClientError(...args),
  promptGuestAuth,
  openProfileSection,
  setActiveProfileSection,
  getActiveProfileSection,
  cleanupLocalFallbackArtifacts: () => window.WingaDataLayer.cleanupLocalFallbackArtifacts?.(),
  sendMessage: (payload) => window.WingaDataLayer.sendMessage(payload),
  refreshMessagesState,
  refreshNotificationsState,
  escapeHtml,
  formatNumber,
  formatProductPrice,
  getCategoryLabel,
  getProfileDiv: () => profileDiv,
  openRequestMessagesContext: async (context) => {
    chatUiState.activeContext = {
      withUser: context.withUser,
      displayName: getUserDisplayName(context.withUser, {
        fallback: context.sellerName || context.withUser || ""
      }),
      productId: "",
      productName: context.productName || ""
    };
    chatUiState.currentDraft = "";
    openProfileSection("profile-messages-panel");
    try {
      await markActiveConversationRead();
    } catch (error) {
      // Ignore passive read sync failures.
    }
  }
});

function getChatContextKey(context) {
  return `${context?.withUser || ""}::${context?.productId || ""}`;
}

function getMessagePartner(message) {
  return message.senderId === currentUser ? message.receiverId : message.senderId;
}

async function refreshUsersState() {
  try {
    return await window.WingaDataLayer.refreshUsers();
  } catch (error) {
    captureClientError("users_refresh_failed", error, {
      user: currentUser
    });
    throw error;
  }
}

function getChatPartnerUser(context) {
  if (!context?.withUser || context.withUser === currentUser) {
    return null;
  }
  return getMarketplaceUser(context.withUser);
}

function getChatContactState(context) {
  if (!context) {
    return {
      whatsapp: "",
      phoneVisible: false,
      canSharePhone: false,
      note: ""
    };
  }

  const relatedProduct = context.productId ? getProductById(context.productId) : null;
  const partner = getChatPartnerUser(context);
  const partnerRole = String(partner?.role || (relatedProduct?.uploadedBy === context.withUser ? "seller" : "")).toLowerCase();
  const productOwnedByPartner = Boolean(relatedProduct && relatedProduct.uploadedBy === context.withUser);
  const whatsapp = normalizeWhatsapp(
    (productOwnedByPartner ? relatedProduct?.whatsapp : "")
    || partner?.whatsappNumber
    || ""
  );
  const phoneVisibility = String(partner?.phoneVisibility || "");
  const canSharePhone = Boolean(
    currentUser
    && canUseBuyerFeatures()
    && String(currentSession?.role || "").toLowerCase() === "buyer"
    && context.withUser !== currentUser
    && partnerRole === "seller"
    && !whatsapp
  );

  let note = "";
  if (whatsapp && phoneVisibility === "shared") {
    note = "Buyer ameshare namba yake kwenye chat hii. Tumia kwa mawasiliano ya moja kwa moja ukiihitaji.";
  } else if (canSharePhone) {
    note = "Mawasiliano yanabaki ndani ya app mpaka ushike namba yako na muuzaji huyu kwa hiari.";
  } else if (!whatsapp && String(currentSession?.role || "").toLowerCase() === "seller" && partnerRole === "buyer") {
    note = "Buyer hajashare namba yake bado. Endelea na mawasiliano ndani ya app.";
  }

  return {
    whatsapp,
    phoneVisible: Boolean(whatsapp),
    canSharePhone,
    note
  };
}

function getChatWhatsappNumber(context) {
  if (!context) {
    return "";
  }
  if (context.withUser === currentUser) {
    return getCurrentWhatsappNumber();
  }
  return getChatContactState(context).whatsapp;
}

function buildWhatsappHref(phoneNumber, productName = "") {
  const normalizedPhone = normalizeWhatsapp(String(phoneNumber || ""));
  if (!normalizedPhone) {
    return "#";
  }
  const text = productName ? `Habari, naulizia bidhaa: ${productName}` : "Habari, naomba maelezo zaidi.";
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}

function renderWhatsappChatLink(product, label = "Chat on WhatsApp") {
  if (product?.uploadedBy && product.uploadedBy === currentUser) {
    return "";
  }
  const whatsappNumber = getProductWhatsappNumber(product);
  if (!whatsappNumber) {
    return "";
  }
  return `<a class="button whatsapp-chat-btn" href="${buildWhatsappHref(whatsappNumber, product.name)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

const {
  renderBuyButton,
  renderSellerSoldOutButton,
  getOrderActionButtons,
  getOrderProgressLabel,
  renderProductOverflowMenu,
  renderMessageSellerButton,
  renderEmojiPicker,
  renderRequestBoxButton,
  renderProductActionGroup
} = window.WingaModules.products.createProductActionsModule({
  getCurrentUser: () => currentUser,
  getChatUiState: () => chatUiState,
  chatEmojiChoices: CHAT_EMOJI_CHOICES,
  isProductInRequestBox,
  canUseBuyerFeatures,
  getOrderActionState: AppCore.getOrderActionState
    ? (...args) => AppCore.getOrderActionState(...args)
    : null,
  buyerCancelWindowMs: BUYER_CANCEL_WINDOW_MS
});

function getConversationSummaries() {
  const summaryMap = new Map();
  const sourceMessages = Array.isArray(currentMessages) ? currentMessages : [];

  sourceMessages.forEach((message) => {
    const withUser = getMessagePartner(message);
    if (!withUser) {
      return;
    }
    const productId = message.productId || "";
    const key = getChatContextKey({ withUser, productId });
    const existing = summaryMap.get(key);
    const partner = getMarketplaceUser(withUser);
    const summary = {
      key,
      withUser,
      displayName: getUserDisplayName(withUser, {
        fallback: existing?.displayName || "",
        role: partner?.role || ""
      }),
      productId,
      productName: message.productName || existing?.productName || "",
      latestMessage: message.message,
      timestamp: message.timestamp || "",
      whatsapp: getChatWhatsappNumber({ withUser, productId }),
      unreadCount: existing?.unreadCount || 0
    };
    if (message.receiverId === currentUser && !message.isRead) {
      summary.unreadCount += 1;
    }
    if (!existing || new Date(summary.timestamp || 0).getTime() >= new Date(existing.timestamp || 0).getTime()) {
      summaryMap.set(key, summary);
    }
  });

  const summaries = Array.from(summaryMap.values())
    .sort((first, second) => new Date(second.timestamp || 0).getTime() - new Date(first.timestamp || 0).getTime());

  if (chatUiState.activeContext && !summaries.some((item) => item.key === getChatContextKey(chatUiState.activeContext))) {
    summaries.unshift({
      key: getChatContextKey(chatUiState.activeContext),
      withUser: chatUiState.activeContext.withUser,
      displayName: chatUiState.activeContext.displayName || getUserDisplayName(chatUiState.activeContext.withUser),
      productId: chatUiState.activeContext.productId || "",
      productName: chatUiState.activeContext.productName || "",
      latestMessage: "",
      timestamp: "",
      whatsapp: getChatWhatsappNumber(chatUiState.activeContext)
    });
  }

  return summaries;
}

function getConversationSummariesFiltered(filter = "all") {
  const summaries = getConversationSummaries();
  if (filter === "unread") {
    return summaries.filter((summary) => summary.unreadCount > 0);
  }
  return summaries;
}

function getTotalUnreadMessages() {
  return (Array.isArray(currentMessages) ? currentMessages : [])
    .filter((message) => message.receiverId === currentUser && !message.isRead).length;
}

function getUnreadNotifications() {
  return (Array.isArray(currentNotifications) ? currentNotifications : [])
    .filter((notification) => !notification.isRead);
}

function updateProfileNavBadge() {
  const profileNav = document.querySelector('.nav-item[data-view="profile"]');
  if (!profileNav) {
    renderHeaderUserMenu();
    return;
  }

  const totalUnread = getTotalUnreadMessages() + getUnreadNotifications().length;
  const label = profileNav.querySelector("span:last-child");
  if (label) {
    label.replaceChildren();
    label.append("Profile");
    if (totalUnread) {
      label.append(" ");
      label.appendChild(createElement("span", {
        className: "nav-badge",
        textContent: totalUnread > 99 ? "99+" : String(totalUnread)
      }));
    }
  }
  renderHeaderUserMenu();
}

function ensureNotificationToastRoot() {
  let root = document.getElementById("notification-toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "notification-toast-root";
    document.body.appendChild(root);
  }
  return root;
}

function getSavedProductsStorageKey() {
  return `winga-saved-products:${currentUser || "guest"}`;
}

function ensureSavedProductIdsLoaded() {
  const nextKey = getSavedProductsStorageKey();
  if (savedProductState.storageKey === nextKey) {
    return savedProductState.ids;
  }

  savedProductState.storageKey = nextKey;
  try {
    const rawValue = window.localStorage.getItem(nextKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    savedProductState.ids = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    savedProductState.ids = new Set();
    captureClientError("saved_products_restore_failed", error, {
      category: "storage",
      alertSeverity: "low"
    });
  }
  return savedProductState.ids;
}

function persistSavedProductIds() {
  savedProductState.storageKey = getSavedProductsStorageKey();
  window.localStorage.setItem(savedProductState.storageKey, JSON.stringify(Array.from(savedProductState.ids)));
}

function isProductSaved(productId) {
  return ensureSavedProductIdsLoaded().has(String(productId || ""));
}

function toggleSavedProduct(productId) {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    return false;
  }

  const savedIds = ensureSavedProductIdsLoaded();
  if (savedIds.has(safeProductId)) {
    savedIds.delete(safeProductId);
    persistSavedProductIds();
    return false;
  }

  savedIds.add(safeProductId);
  persistSavedProductIds();
  return true;
}

function ensureMediaActionSheetRoot() {
  let root = document.getElementById("media-action-sheet");
  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = "media-action-sheet";
  root.innerHTML = `
    <div class="media-action-backdrop" data-close-media-sheet="true"></div>
    <div class="media-action-dialog panel" role="dialog" aria-modal="true" aria-labelledby="media-action-title">
      <button class="media-action-close" type="button" aria-label="Close image actions" data-close-media-sheet="true">&times;</button>
      <div class="media-action-content"></div>
    </div>
  `;
  document.body.appendChild(root);

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-media-sheet='true']")) {
      closeMediaActionSheet();
      return;
    }

    const actionButton = event.target.closest("[data-media-action]");
    if (!actionButton) {
      return;
    }

    const product = getProductById(savedProductState.activeSheetProductId);
    if (!product) {
      closeMediaActionSheet();
      return;
    }

    const action = actionButton.dataset.mediaAction;
    if (action === "save") {
      const nowSaved = toggleSavedProduct(product.id);
      showInAppNotification({
        type: "info",
        title: nowSaved ? "Imehifadhiwa kwenye Favorites" : "Imeondolewa kwenye Favorites",
        body: nowSaved
          ? `${product.name} sasa ipo tayari kwenye saved picks zako.`
          : `${product.name} imeondolewa kwenye saved picks zako.`,
        variant: "success",
        durationMs: 2800,
        haptic: nowSaved
      });
      closeMediaActionSheet();
      return;
    }

    if (action === "share") {
      closeMediaActionSheet();
      handleShareProduct(product).catch((error) => {
        captureClientError("media_sheet_share_failed", error, {
          productId: product.id
        });
      });
      return;
    }

    if (action === "download") {
      closeMediaActionSheet();
      triggerProductDownload({
        ...product,
        image: savedProductState.activeSheetSource || product.image
      });
      return;
    }

    if (action === "open") {
      closeMediaActionSheet();
      openProductDetailModal(product.id);
    }
  });

  return root;
}

function closeMediaActionSheet() {
  const root = document.getElementById("media-action-sheet");
  if (!root) {
    return;
  }
  root.classList.remove("open");
  document.body.classList.remove("media-action-sheet-open");
  syncBodyScrollLockState();
}

function ensureImageLightboxRoot() {
  let root = document.getElementById("image-lightbox");
  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = "image-lightbox";
  root.innerHTML = `
    <div class="image-lightbox-backdrop" data-close-image-lightbox="true"></div>
    <div class="image-lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="image-lightbox-title">
      <button class="image-lightbox-close" type="button" aria-label="Close image preview" data-close-image-lightbox="true">&times;</button>
      <button class="image-lightbox-nav image-lightbox-prev" type="button" aria-label="Previous image" data-image-lightbox-nav="-1">&#10094;</button>
      <button class="image-lightbox-nav image-lightbox-next" type="button" aria-label="Next image" data-image-lightbox-nav="1">&#10095;</button>
      <div class="image-lightbox-media">
        <img id="image-lightbox-preview" alt="Image preview" loading="lazy">
      </div>
      <p id="image-lightbox-title" class="image-lightbox-caption"></p>
      <div class="image-lightbox-actions" data-image-lightbox-actions hidden>
        <button class="image-lightbox-action" type="button" data-image-lightbox-action="save">Save</button>
        <button class="image-lightbox-action" type="button" data-image-lightbox-action="share">Share</button>
        <button class="image-lightbox-action" type="button" data-image-lightbox-action="download">Download</button>
        <button class="image-lightbox-action image-lightbox-action-primary" type="button" data-image-lightbox-action="open">Open product</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-image-lightbox='true']")) {
      closeImageLightbox();
      return;
    }
    const navButton = event.target.closest("[data-image-lightbox-nav]");
    if (navButton) {
      stepImageLightbox(Number(navButton.dataset.imageLightboxNav || 0));
      return;
    }

    const actionButton = event.target.closest("[data-image-lightbox-action]");
    if (!actionButton) {
      return;
    }

    const product = imageLightboxState.productId
      ? getProductById(imageLightboxState.productId)
      : null;
    if (!product) {
      return;
    }

    const action = actionButton.dataset.imageLightboxAction;
    const activeSource = imageLightboxState.source || sanitizeImageSource(product.image || "", "");
    if (action === "save") {
      const nowSaved = toggleSavedProduct(product.id);
      actionButton.textContent = nowSaved ? "Saved" : "Save";
      actionButton.classList.toggle("is-active", nowSaved);
      showInAppNotification({
        type: "info",
        title: nowSaved ? "Imehifadhiwa kwenye Favorites" : "Imeondolewa kwenye Favorites",
        body: nowSaved
          ? `${product.name} sasa ipo tayari kwenye saved picks zako.`
          : `${product.name} imeondolewa kwenye saved picks zako.`,
        variant: "success",
        durationMs: 2400,
        haptic: nowSaved
      });
      return;
    }

    if (action === "share") {
      handleShareProduct(product).catch((error) => {
        captureClientError("lightbox_share_failed", error, {
          productId: product.id
        });
      });
      return;
    }

    if (action === "download") {
      triggerProductDownload({
        ...product,
        image: activeSource || product.image
      });
      return;
    }

    if (action === "open") {
      closeImageLightbox();
      openProductDetailModal(product.id);
    }
  });

  return root;
}

function syncImageLightboxView() {
  const root = ensureImageLightboxRoot();
  const preview = root.querySelector("#image-lightbox-preview");
  const caption = root.querySelector("#image-lightbox-title");
  const prevButton = root.querySelector(".image-lightbox-prev");
  const nextButton = root.querySelector(".image-lightbox-next");
  const actions = root.querySelector("[data-image-lightbox-actions]");
  if (!preview || !caption || !prevButton || !nextButton || !actions) {
    return;
  }

  const images = Array.isArray(imageLightboxState.images) ? imageLightboxState.images : [];
  const safeIndex = Math.max(0, Math.min(Number(imageLightboxState.index || 0), Math.max(0, images.length - 1)));
  imageLightboxState.index = safeIndex;
  const activeImage = sanitizeImageSource(images[safeIndex] || "", "");
  if (!activeImage) {
    closeImageLightbox();
    return;
  }

  preview.src = activeImage;
  preview.alt = imageLightboxState.alt || "Image preview";
  preview.dataset.zoomSrc = activeImage;
  imageLightboxState.source = activeImage;
  caption.textContent = images.length > 1
    ? `${imageLightboxState.alt || ""} (${safeIndex + 1}/${images.length})`.trim()
    : (imageLightboxState.alt || "");
  prevButton.style.display = images.length > 1 ? "grid" : "none";
  nextButton.style.display = images.length > 1 ? "grid" : "none";

  const product = imageLightboxState.productId
    ? getProductById(imageLightboxState.productId)
    : null;
  actions.hidden = !product;
  if (!product) {
    return;
  }

  const saveButton = actions.querySelector("[data-image-lightbox-action='save']");
  if (saveButton) {
    const saved = isProductSaved(product.id);
    saveButton.textContent = saved ? "Saved" : "Save";
    saveButton.classList.toggle("is-active", saved);
  }
}

function openImageLightbox(source = "", alt = "Image preview", images = [], context = {}) {
  if (document.body.classList.contains("auth-modal-open")) {
    return;
  }
  const resolvedImages = Array.isArray(images) && images.length
    ? images.map((item) => sanitizeImageSource(item, "")).filter(Boolean)
    : [sanitizeImageSource(source, "")].filter(Boolean);
  if (!resolvedImages.length) {
    return;
  }

  const resolvedSource = sanitizeImageSource(source, resolvedImages[0] || "");
  imageLightboxState.images = resolvedImages;
  const preferredIndex = Number.isFinite(Number(context.startIndex))
    ? Math.max(0, Math.min(Number(context.startIndex), Math.max(0, resolvedImages.length - 1)))
    : resolvedImages.findIndex((item) => item === resolvedSource);
  imageLightboxState.index = Math.max(0, preferredIndex);
  imageLightboxState.alt = alt || "Image preview";
  imageLightboxState.productId = context.productId || "";
  imageLightboxState.source = resolvedSource;
  imageLightboxState.surface = context.surface || "";

  const root = ensureImageLightboxRoot();
  syncImageLightboxView();
  root.classList.add("open");
  syncBodyScrollLockState();
}

function stepImageLightbox(direction = 0) {
  const images = Array.isArray(imageLightboxState.images) ? imageLightboxState.images : [];
  if (images.length <= 1 || !Number.isFinite(direction) || direction === 0) {
    return;
  }
  imageLightboxState.index = (imageLightboxState.index + direction + images.length) % images.length;
  syncImageLightboxView();
}

function closeImageLightbox() {
  const root = document.getElementById("image-lightbox");
  if (!root) {
    return;
  }
  root.classList.remove("open");
  imageLightboxState.images = [];
  imageLightboxState.index = 0;
  imageLightboxState.alt = "";
  imageLightboxState.productId = "";
  imageLightboxState.source = "";
  imageLightboxState.surface = "";
  syncBodyScrollLockState();
}

function openMediaActionSheet(product, options = {}) {
  if (!product) {
    return;
  }
  if (document.body.classList.contains("auth-modal-open")) {
    return;
  }

  const root = ensureMediaActionSheetRoot();
  const content = root.querySelector(".media-action-content");
  if (!content) {
    return;
  }

  const sourceImage = sanitizeImageSource(options.image || product.image, getImageFallbackDataUri("WINGA"));
  const saved = isProductSaved(product.id);
  savedProductState.activeSheetProductId = product.id;
  savedProductState.activeSheetSource = sourceImage;

  const preview = createElement("div", { className: "media-action-preview" });
  preview.appendChild(createElement("img", {
    attributes: {
      src: sourceImage,
      alt: product.name || "Product preview",
      loading: "lazy"
    }
  }));

  const copy = createElement("div", { className: "media-action-copy" });
  copy.append(
    createElement("p", { className: "media-action-kicker eyebrow", textContent: "Quick actions" }),
    createElement("h3", { textContent: product.name || "Product", attributes: { id: "media-action-title" } }),
    createElement("p", {
      className: "media-action-subtitle",
      textContent: `${formatProductPrice(product.price)}${product.shop ? ` • ${product.shop}` : ""}`
    })
  );

  const actions = createElement("div", { className: "media-action-buttons" });
  [
    { action: "save", label: saved ? "Remove saved" : "Save" },
    { action: "share", label: "Share" },
    { action: "download", label: "Download" },
    { action: "open", label: "Open product" }
  ].forEach((item) => {
    actions.appendChild(createElement("button", {
      className: `media-action-btn${item.action === "save" && saved ? " is-active" : ""}`,
      textContent: item.label,
      attributes: {
        type: "button",
        "data-media-action": item.action
      }
    }));
  });

  content.replaceChildren(preview, copy, actions);
  root.classList.add("open");
  document.body.classList.add("media-action-sheet-open");
  syncBodyScrollLockState();
}

function bindImageActionInteractions() {
  if (document.body.dataset.imageActionsBound === "true") {
    return;
  }
  document.body.dataset.imageActionsBound = "true";

  const clearLongPressTimer = () => {
    if (savedProductState.longPressTimer) {
      window.clearTimeout(savedProductState.longPressTimer);
      savedProductState.longPressTimer = 0;
    }
  };

  const getProductFromImageTarget = (target) => {
    const trigger = target?.closest?.("[data-image-action-product]");
    if (!trigger) {
      return null;
    }

    const product = getProductById(trigger.dataset.imageActionProduct);
    if (!product) {
      return null;
    }

    return {
      product,
      image: trigger.dataset.imageActionSrc || product.image || "",
      trigger
    };
  };

  document.addEventListener("pointerdown", (event) => {
    if (document.body.classList.contains("auth-modal-open")) {
      return;
    }
    const info = getProductFromImageTarget(event.target);
    if (!info || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    if (event.pointerType === "mouse") {
      return;
    }

    clearLongPressTimer();
    savedProductState.longPressTimer = window.setTimeout(() => {
      savedProductState.suppressClickUntil = Date.now() + 720;
      openMediaActionSheet(info.product, { image: info.image });
      clearLongPressTimer();
    }, 420);
  }, { passive: true });

  ["pointerup", "pointercancel", "scroll"].forEach((eventName) => {
    document.addEventListener(eventName, clearLongPressTimer, { passive: true, capture: true });
  });

  document.addEventListener("contextmenu", (event) => {
    if (document.body.classList.contains("auth-modal-open")) {
      return;
    }
    const info = getProductFromImageTarget(event.target);
    if (!info) {
      return;
    }
    event.preventDefault();
    savedProductState.suppressClickUntil = Date.now() + 720;
    openMediaActionSheet(info.product, { image: info.image });
  });

  document.addEventListener("click", (event) => {
    if (document.body.classList.contains("auth-modal-open")) {
      return;
    }
    if (Date.now() < savedProductState.suppressClickUntil && event.target.closest("[data-image-action-product]")) {
      event.preventDefault();
      event.stopPropagation();
      savedProductState.suppressClickUntil = 0;
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMediaActionSheet();
    }
  });
}

function bindImageZoomInteractions() {
  if (document.body.dataset.imageZoomBound === "true") {
    return;
  }
  document.body.dataset.imageZoomBound = "true";

  const getZoomableImage = (target) => {
    const image = target?.closest?.("img[data-zoom-src]");
    if (!image) {
      return null;
    }
    if (
      image.dataset.disableImageZoom === "true"
      || image.closest("#image-lightbox")
      || image.closest("#media-action-sheet")
      || image.closest(".gallery-thumbs")
      || image.closest("[data-product-card], [data-showcase-id], .seller-product-card[data-open-product]")
      || image.closest("[data-search-result]")
      || image.closest("#header-user-trigger")
      || image.closest("button, a")
    ) {
      return null;
    }
    return image;
  };

  document.addEventListener("click", (event) => {
    if (document.body.classList.contains("auth-modal-open")) {
      return;
    }
    const image = getZoomableImage(event.target);
    if (!image) {
      return;
    }
    if (Date.now() < savedProductState.suppressClickUntil && image.closest("[data-image-action-product]")) {
      event.preventDefault();
      event.stopPropagation();
      savedProductState.suppressClickUntil = 0;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const product = image.dataset.imageActionProduct
      ? getProductById(image.dataset.imageActionProduct)
      : null;
    const productImages = Array.isArray(product?.images) && product.images.length > 0
      ? product.images.filter(Boolean)
      : (product?.image ? [product.image] : []);
    openImageLightbox(
      image.dataset.zoomSrc || image.currentSrc || image.src || "",
      image.dataset.zoomAlt || image.alt || "Image preview",
      productImages,
      {
        productId: product?.id || image.dataset.imageActionProduct || "",
        surface: image.dataset.imageActionSurface || ""
      }
    );
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeImageLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      stepImageLightbox(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      stepImageLightbox(1);
    }
  });
}

function showInAppNotification(notification) {
  if (!notification || !notification.title) {
    return;
  }

  const notificationKey = [
    notification.id || "",
    notification.type || "",
    notification.title || "",
    notification.body || ""
  ].join("|");
  const now = Date.now();
  const recentUntil = notificationFeedbackState.recentKeys.get(notificationKey) || 0;
  if (recentUntil > now) {
    return;
  }
  notificationFeedbackState.recentKeys.set(notificationKey, now + 5000);
  if (notificationFeedbackState.recentKeys.size > 40) {
    for (const [key, expiresAt] of notificationFeedbackState.recentKeys.entries()) {
      if (expiresAt <= now) {
        notificationFeedbackState.recentKeys.delete(key);
      }
    }
  }

  const root = ensureNotificationToastRoot();
  const toast = document.createElement("div");
  const inferredVariant = notification.type === "order" ? "success" : "info";
  const variant = ["success", "warning", "error", "info"].includes(notification.variant)
    ? notification.variant
    : inferredVariant;
  const dismissAfterMs = notification.persistent
    ? 0
    : Math.max(2200, Number(notification.durationMs || (variant === "error" ? 5200 : 3200)));
  toast.className = `notification-toast notification-toast-${variant}`;
  toast.setAttribute("role", variant === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", variant === "error" ? "assertive" : "polite");
  toast.appendChild(createElement("strong", { textContent: notification.title }));
  if (notification.body) {
    toast.appendChild(createElement("span", { textContent: notification.body }));
  }
  root.prepend(toast);

  if (dismissAfterMs > 0) {
    window.setTimeout(() => {
      toast.classList.add("hide");
      window.setTimeout(() => toast.remove(), 220);
    }, dismissAfterMs);
  }

  const shouldVibrate = notification.haptic !== false
    && ["message", "order", "request"].includes(String(notification.type || "").toLowerCase());
  if (shouldVibrate && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    const vibrationGapMs = 1800;
    if (now - notificationFeedbackState.lastVibrationAt >= vibrationGapMs) {
      navigator.vibrate(
        notification.type === "order"
          ? [34, 56, 34, 56, 34]
          : notification.type === "request"
            ? [28, 46, 28]
            : [18, 28, 18]
      );
      notificationFeedbackState.lastVibrationAt = now;
    }
  }

  if ("Notification" in window && document.visibilityState === "hidden") {
    if (Notification.permission === "granted") {
      new Notification(notification.title, { body: notification.body || "" });
    } else if (Notification.permission === "default" && !notificationFeedbackState.browserPermissionRequested) {
      notificationFeedbackState.browserPermissionRequested = true;
      Notification.requestPermission().catch(() => {});
    }
  }
}

function confirmAction(message) {
  if (typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return true;
}

function showFatalStartupState(error) {
  const provider = window.WINGA_CONFIG?.provider || "unknown";
  const message = error?.message || "Angalia config ya storage provider.";

  closeAllTransientOverlays({
    closeAuthModalIfGuest: false
  });
  document.body.classList.remove("auth-modal-open", "product-detail-open", "context-chat-open");
  authContainer.style.display = "none";
  hideAdminLoginScreen();
  uploadForm.style.display = "none";
  adminPanel.style.display = "none";
  analyticsPanel.style.display = "none";
  emptyState.style.display = "none";
  profileDiv?.remove();
  profileDiv = null;
  appContainer.style.display = "block";
  appContainer.replaceChildren();
  syncBodyScrollLockState();

  const panel = createElement("section", { className: "fatal-startup-card panel" });
  const copy = createElement("div", { className: "fatal-startup-copy" });
  copy.append(
    createElement("p", { className: "eyebrow", textContent: "Startup Error" }),
    createElement("h2", { textContent: "App haikuweza kuanza vizuri." }),
    createElement("p", {
      className: "empty-copy",
      textContent: "Jaribu ku-refresh ukurasa. Ikiwa tatizo linaendelea, kagua provider ya storage/API au environment config."
    })
  );

  const meta = createElement("div", { className: "fatal-startup-meta" });
  meta.append(
    createElement("div", {
      className: "fatal-startup-meta-line",
      textContent: `Provider: ${provider}`
    }),
    createElement("div", {
      className: "fatal-startup-meta-line",
      textContent: `Error: ${message}`
    })
  );

  const actions = createElement("div", { className: "fatal-startup-actions" });
  const reloadButton = createElement("button", {
    className: "button",
    textContent: "Refresh App",
    attributes: { type: "button" }
  });
  reloadButton.addEventListener("click", () => window.location.reload());
  actions.appendChild(reloadButton);

  panel.append(copy, meta, actions);
  appContainer.appendChild(panel);
}

function showSessionRestoringState(message = "") {
  isSessionRestorePending = true;
  closeAllTransientOverlays({
    closeAuthModalIfGuest: false
  });
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  hideAdminLoginScreen();
  appContainer.style.display = "block";
  syncBodyScrollLockState();
  refreshPublicEntryChrome();
  uploadForm.style.display = "none";
  adminPanel.style.display = "none";
  analyticsPanel.style.display = "none";
  emptyState.style.display = "block";
  emptyState.replaceChildren(
    createSectionHeading({
      eyebrow: "Restoring Session",
      title: "Tunaangalia session yako...",
      meta: message || "Tafadhali subiri kidogo huku tukihakiki login yako."
    }),
    createElement("p", {
      className: "empty-copy",
      textContent: "Ukiona hali hii inachelewa sana, refresh ukurasa au ingia tena."
    })
  );
}

function showLoggedOutState(options = {}) {
  isSessionRestorePending = false;
  const {
    audience = "public",
    message = ""
  } = options;

  closeAllTransientOverlays({
    closeAuthModalIfGuest: false
  });
  hideAdminLoginScreen();
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  appContainer.style.display = "block";
  syncBodyScrollLockState();
  refreshPublicEntryChrome();
  authSignupStep = 1;
  selectedAuthRole = "seller";
  syncAuthMode();

  if (audience === "admin") {
    setAdminLoginRouteActive(true, { replace: true });
    showAdminLoginScreen({
      message: message || "Session ya staff imeisha. Ingia tena kuendelea."
    });
    return;
  }

  setAdminLoginRouteActive(false, { replace: true });
  authContainer.style.display = "block";
  document.body.classList.add("auth-modal-open");
  appContainer.style.display = "none";
  syncBodyScrollLockState();
  if (message) {
    showInAppNotification({
      title: "Login needed",
      body: message,
      variant: "warning"
    });
  }
}

function setAuthInteractionPending(kind, pending, options = {}) {
  const {
    buttonText = "",
    noteText = ""
  } = options;
  const isPending = Boolean(pending);
  if (kind === "admin") {
    if (adminLoginIdentifierInput) adminLoginIdentifierInput.disabled = isPending;
    if (adminLoginPasswordInput) adminLoginPasswordInput.disabled = isPending;
    if (adminLoginButton) {
      adminLoginButton.disabled = isPending;
      adminLoginButton.innerText = isPending ? "Ingia..." : "Admin Login";
    }
    if (adminLoginCopy && isPending) {
      adminLoginCopy.innerText = "Tunaangalia staff access yako...";
    }
    return;
  }

  [
    usernameInput,
    phoneNumberInput,
    nationalIdInput,
    passwordInput,
    confirmPasswordInput,
    sellerIdentityDocumentTypeInput,
    sellerIdentityDocumentNumberInput,
    sellerIdentityDocumentImageInput,
    authButton,
    authNextButton,
    authBackButton
  ].forEach((element) => {
    if (element) {
      element.disabled = isPending;
    }
  });
  [toggleLink, forgotPasswordLink].forEach((element) => {
    if (element) {
      element.style.pointerEvents = isPending ? "none" : "";
      element.style.opacity = isPending ? "0.65" : "";
    }
  });
  if (authButton) {
    authButton.innerText = isPending
      ? (buttonText || (isPasswordRecovery ? "Inabadilisha password..." : (isLogin ? "Inaingia..." : "Inatengeneza akaunti...")))
      : (isPasswordRecovery ? "Badilisha Password" : (isLogin ? "Ingia" : "Tengeneza Akaunti"));
  }
  if (authCategoryNote && !isLogin && !isPasswordRecovery && isPending) {
    authCategoryNote.innerText = noteText || (
      selectedAuthRole === "seller"
        ? "Tunatayarisha ID image yako na kutuma maombi ya seller signup. Hii inapaswa kukamilika haraka."
        : "Tunatengeneza akaunti yako. Tafadhali subiri kidogo."
    );
  }
  if (!isPending) {
    syncAuthMode();
  }
}

function releasePublicAuthPendingState() {
  publicAuthRequestPending = false;
  setAuthInteractionPending("public", false);
}

function switchToLoginMode(prefillIdentifier = "") {
  isLogin = true;
  isPasswordRecovery = false;
  authSignupStep = 1;
  formTitle.innerText = "Login";
  authButton.innerText = "Login";
  toggleLink.innerText = "Tengeneza akaunti";
  if (prefillIdentifier) {
    usernameInput.value = prefillIdentifier;
  }
  passwordInput.value = "";
  confirmPasswordInput.value = "";
  syncAuthMode();
}

function openPasswordRecoveryMode(prefillIdentifier = "") {
  isLogin = false;
  isPasswordRecovery = true;
  authSignupStep = 1;
  if (prefillIdentifier) {
    usernameInput.value = prefillIdentifier;
  }
  passwordInput.value = "";
  confirmPasswordInput.value = "";
  syncAuthMode();
}

async function refreshNotificationsState() {
  try {
    currentNotifications = await window.WingaDataLayer.loadNotifications();
    updateProfileNavBadge();
  } catch (error) {
    captureClientError("notifications_refresh_failed", error, {
      user: currentUser
    });
    throw error;
  }
}

async function refreshPromotionsState() {
  if (!currentUser) {
    currentPromotions = [];
    return;
  }
  try {
    currentPromotions = await window.WingaDataLayer.loadPromotions();
  } catch (error) {
    captureClientError("promotions_refresh_failed", error, {
      user: currentUser
    });
    throw error;
  }
}

async function markActiveConversationRead() {
  if (!currentUser || !chatUiState.activeContext) {
    return;
  }

  const hasUnread = currentMessages.some((message) =>
    message.receiverId === currentUser
    && !message.isRead
    && getMessagePartner(message) === chatUiState.activeContext.withUser
    && (message.productId || "") === (chatUiState.activeContext.productId || "")
  );
  if (!hasUnread) {
    return;
  }

  await window.WingaDataLayer.markConversationRead({
    withUser: chatUiState.activeContext.withUser,
    productId: chatUiState.activeContext.productId || ""
  });
  await Promise.all([refreshMessagesState(), refreshNotificationsState()]);
}

function disconnectRealtimeChannel() {
  if (chatUiState.realtimeReconnectTimer) {
    clearTimeout(chatUiState.realtimeReconnectTimer);
    chatUiState.realtimeReconnectTimer = 0;
  }
  if (realtimeChannel?.close) {
    realtimeChannel.close();
  }
  realtimeChannel = null;
}

function connectRealtimeChannel() {
  disconnectRealtimeChannel();
  if (!currentUser) {
    return;
  }

  realtimeChannel = window.WingaDataLayer.openRealtimeChannel({
    onMessage: async () => {
      await Promise.all([refreshMessagesState(), refreshNotificationsState()]);
      if (currentView === "profile" && profileDiv) {
        replaceMessagesPanel(profileDiv);
      }
      if (chatUiState.isContextOpen) {
        replaceContextChatModal();
      }
      if ((currentView === "profile" || chatUiState.isContextOpen) && chatUiState.activeContext) {
        markActiveConversationRead().catch(() => {});
      }
    },
    onNotification: async (payload) => {
      const notification = payload?.notification || null;
      await refreshNotificationsState();
      if (notification?.type === "order") {
        await refreshOrdersState();
      }
      if (notification) {
        showInAppNotification({
          ...notification,
          haptic: document.visibilityState === "visible"
        });
      }
      if (currentView === "profile" && profileDiv) {
        if (notification?.type === "order") {
          document.getElementById("profile-orders-panel")?.replaceWith(createOrdersContainerFromState());
        }
        document.getElementById("profile-notifications-panel")?.replaceWith(createNotificationsContainerFromState());
        bindMessageActions(profileDiv);
      }
    },
    onMessageRead: async () => {
      await refreshMessagesState();
      if (currentView === "profile" && profileDiv) {
        replaceMessagesPanel(profileDiv);
      }
      if (chatUiState.isContextOpen) {
        replaceContextChatModal();
      }
    },
    onUsers: async () => {
      await refreshUsersState();
      if (currentView === "profile" && profileDiv) {
        replaceMessagesPanel(profileDiv);
      }
      if (chatUiState.isContextOpen) {
        replaceContextChatModal();
      }
    },
    onError: () => {
      reportClientEvent("warn", "realtime_channel_error", "Realtime channel reported an error.", {
        user: currentUser
      });
      if (chatUiState.realtimeReconnectTimer || !currentUser) {
        return;
      }
      chatUiState.realtimeReconnectTimer = window.setTimeout(() => {
        chatUiState.realtimeReconnectTimer = 0;
        connectRealtimeChannel();
      }, 3000);
    }
  });
}

function getActiveConversationMessages() {
  if (!chatUiState.activeContext) {
    return [];
  }
  return currentMessages.filter((message) =>
    getMessagePartner(message) === chatUiState.activeContext.withUser
    && (message.productId || "") === (chatUiState.activeContext.productId || "")
  );
}

function getMessageProductItems(message) {
  return Array.isArray(message?.productItems) ? message.productItems : [];
}

function getSellerProductsForActiveChat(limit = 10) {
  if (!chatUiState.activeContext?.withUser) {
    return [];
  }

  const primaryProduct = chatUiState.activeContext.productId
    ? getProductById(chatUiState.activeContext.productId)
    : null;

  const sellerProducts = products.filter((product) =>
    product.uploadedBy === chatUiState.activeContext.withUser
    && product.status === "approved"
    && product.image
  );

  const ordered = primaryProduct
    ? [primaryProduct, ...sellerProducts.filter((item) => item.id !== primaryProduct.id)]
    : sellerProducts;

  return ordered.slice(0, limit);
}

function getSelectedChatProducts() {
  const selectedSet = new Set(chatUiState.selectedProductIds);
  return getSellerProductsForActiveChat(14)
    .filter((product) => selectedSet.has(product.id))
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      productImage: product.image,
      price: normalizeOptionalPrice(product.price),
      sellerId: product.uploadedBy,
      category: product.category || ""
    }));
}

function getReplyPreviewMessage(message, activeMessages = []) {
  if (!message?.replyToMessageId) {
    return null;
  }
  return activeMessages.find((item) => item.id === message.replyToMessageId) || null;
}

function getMessagePreviewText(message) {
  if (!message) {
    return "";
  }
  if (message.message) {
    return message.message.slice(0, 80);
  }
  const items = getMessageProductItems(message);
  if (!items.length) {
    return "";
  }
  return items.length === 1 ? items[0].productName : `${items.length} selected products`;
}

function syncActiveChatContext() {
  const summaries = getConversationSummaries();
  if (currentView === "profile" && chatUiState.profileMessagesMode === "list" && !chatUiState.profileHasSelection) {
    chatUiState.activeContext = null;
    return;
  }
  if (chatUiState.activeContext && summaries.some((item) => item.key === getChatContextKey(chatUiState.activeContext))) {
    return;
  }
  chatUiState.activeContext = summaries[0]
    ? {
      withUser: summaries[0].withUser,
      displayName: summaries[0].displayName || getUserDisplayName(summaries[0].withUser),
      productId: summaries[0].productId,
      productName: summaries[0].productName,
      whatsapp: summaries[0].whatsapp
    }
    : chatUiState.activeContext;
}

async function refreshMessagesState() {
  const startedAt = getPerfNow();
  try {
    const messages = await window.WingaDataLayer.loadMessages();
    currentMessages = Array.isArray(messages) ? messages : [];
    syncActiveChatContext();
    updateProfileNavBadge();
  } catch (error) {
    captureClientError("messages_refresh_failed", error, {
      user: currentUser
    });
    throw error;
  } finally {
    reportSlowPath("messages_refresh_slow", getPerfNow() - startedAt, {
      user: currentUser,
      messagesCount: Array.isArray(currentMessages) ? currentMessages.length : 0
    }, 200);
  }
}

async function refreshOrdersState() {
  if (!currentUser) {
    currentOrders = { purchases: [], sales: [] };
    return;
  }
  try {
    currentOrders = await window.WingaDataLayer.loadMyOrders() || { purchases: [], sales: [] };
  } catch (error) {
    currentOrders = { purchases: [], sales: [] };
    captureClientError("orders_refresh_failed", error, {
      user: currentUser
    });
  }
}

function stopMessagePolling() {
  if (chatUiState.messagePollingTimer) {
    clearInterval(chatUiState.messagePollingTimer);
    chatUiState.messagePollingTimer = 0;
  }
}

function startMessagePolling() {
  stopMessagePolling();
  if (!currentUser || (currentView !== "profile" && !chatUiState.isContextOpen)) {
    return;
  }
  chatUiState.messagePollingTimer = window.setInterval(async () => {
    try {
      await Promise.all([refreshMessagesState(), refreshNotificationsState()]);
      if (profileDiv && currentView === "profile") {
        document.getElementById("profile-notifications-panel")?.replaceWith(createNotificationsContainerFromState());
        replaceMessagesPanel(profileDiv);
      }
      if (chatUiState.isContextOpen) {
        replaceContextChatModal();
      }
    } catch (error) {
      // Ignore passive polling failures.
    }
  }, 12000);
}

function getActiveChatProduct() {
  if (!chatUiState.activeContext?.productId) {
    return null;
  }
  return getProductById(chatUiState.activeContext.productId);
}

function closeContextChatModal() {
  return closeContextChatModalFromController();
}

function bindContextChatModalActions() {
  return bindContextChatModalActionsFromController();
}

function replaceContextChatModal() {
  return replaceContextChatModalFromController();
}

function replaceMessagesPanel(scope = profileDiv) {
  document.getElementById("profile-messages-panel")?.replaceWith(createMessagesContainerFromState());
  bindMessageActions(scope);
}

function createOrdersContainerFromState() {
  return createOrdersSectionElement(currentOrders);
}

async function openContextChatModal() {
  return openContextChatModalFromController();
}

function openProductChat(product) {
  return openProductChatFromController(product);
}

function openOwnProductMessages(productId) {
  return openOwnProductMessagesFromController(productId);
}

function renderMarketplaceTrustBadges(product, options = {}) {
  const {
    hideVerifiedBadge = false
  } = options;
  const owner = getMarketplaceUser(product.uploadedBy);
  if (!owner) {
    return "";
  }

  const badges = [];
  if (owner.verifiedSeller && !hideVerifiedBadge) {
    badges.push(`<span class="status-pill approved">Muuzaji Aliyethibitishwa</span>`);
  }
  if (owner.status === "flagged") {
    badges.push(`<span class="status-pill pending">Flagged Account</span>`);
  }
  const sellerReviewSummary = getSellerReviewSummary(product.uploadedBy);
  if (Number(sellerReviewSummary?.totalReviews || 0) > 0) {
    badges.push(`<span class="status-pill">${sellerReviewSummary.averageRating.toFixed(1)} rating ya muuzaji</span>`);
  }

  if (!badges.length) {
    return "";
  }

  return `<p class="product-meta trust-badges">${badges.join(" ")}</p>`;
}

function formatMemberSinceLabel(value) {
  if (!value) {
    return "";
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  return `Member since ${new Date(timestamp).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric"
  })}`;
}

function getSellerTrustSnapshot(username) {
  const seller = getMarketplaceUser(username);
  if (!seller) {
    return null;
  }
  const reviewSummary = getSellerReviewSummary(username) || {};
  return {
    seller,
    joinedLabel: formatMemberSinceLabel(seller.createdAt || seller.verificationSubmittedAt || ""),
    ratingLabel: Number(reviewSummary.totalReviews || 0) > 0
      ? `${reviewSummary.averageRating.toFixed(1)} seller rating`
      : "",
    reviewCountLabel: Number(reviewSummary.totalReviews || 0) > 0
      ? `${reviewSummary.totalReviews} review${reviewSummary.totalReviews === 1 ? "" : "s"}`
      : "",
    verificationLabel: seller.verifiedSeller ? "Verified seller" : getVerificationStatusLabel(seller.verificationStatus || "pending"),
    whatsappLabel: seller.whatsappVerificationStatus === "verified" && normalizeWhatsapp(seller.whatsappNumber || seller.phoneNumber || "")
      ? "WhatsApp verified"
      : ""
  };
}

function renderSellerTrustPanel(product) {
  const trust = getSellerTrustSnapshot(product?.uploadedBy);
  if (!trust) {
    return "";
  }
  const sellerName = escapeHtml(getUserDisplayName(product.uploadedBy, {
    fallback: product?.shop || product?.uploadedBy || "Seller"
  }));
  const trustBadges = [];
  if (trust.seller.verifiedSeller) {
    trustBadges.push(`<span class="status-pill approved">Verified Seller</span>`);
  }
  if (trust.whatsappLabel) {
    trustBadges.push(`<span class="status-pill approved">${escapeHtml(trust.whatsappLabel)}</span>`);
  }
  if (trust.ratingLabel) {
    trustBadges.push(`<span class="status-pill">${escapeHtml(trust.ratingLabel)}</span>`);
  }
  if (trust.seller.status === "flagged") {
    trustBadges.push(`<span class="status-pill pending">Under review</span>`);
  }

  const factLines = [trust.joinedLabel, trust.reviewCountLabel].filter(Boolean);
  const showReportActions = Boolean(product?.id && product?.uploadedBy && product.uploadedBy !== currentUser);

  return `
    <section class="seller-trust-panel">
      <div class="seller-trust-heading">
        <div>
          <p class="eyebrow">Trust & Safety</p>
          <strong>${sellerName}</strong>
        </div>
      </div>
      ${trustBadges.length ? `<div class="trust-badges seller-trust-badges">${trustBadges.join("")}</div>` : ""}
      ${factLines.length ? `<p class="product-meta seller-trust-copy">${escapeHtml(factLines.join(" | "))}</p>` : ""}
      ${showReportActions ? `
        <div class="seller-trust-actions">
          <button class="trust-link-btn" type="button" data-report-product="${product.id}">Report product</button>
          <button class="trust-link-btn" type="button" data-report-seller="${product.uploadedBy}" data-report-product-context="${product.id}">Report seller</button>
        </div>
      ` : ""}
    </section>
  `;
}

const TRUST_REPORT_REASON_OPTIONS = [
  { id: "fake_item", label: "Fake or misleading item" },
  { id: "unsafe", label: "Unsafe or suspicious" },
  { id: "wrong_photos", label: "Wrong photos or details" },
  { id: "abuse", label: "Abuse or harassment" },
  { id: "other", label: "Other concern" }
];

let trustReportState = {
  targetType: "product",
  targetUserId: "",
  targetProductId: "",
  reason: "fake_item",
  title: "",
  subtitle: "",
  loading: false
};

function ensureTrustReportModal() {
  let root = document.getElementById("trust-report-modal");
  if (root) {
    return root;
  }
  root = createElement("div", {
    attributes: {
      id: "trust-report-modal",
      hidden: "true"
    }
  });
  root.innerHTML = `
    <div class="trust-report-backdrop" data-close-trust-report="true"></div>
    <div class="trust-report-dialog panel" role="dialog" aria-modal="true" aria-labelledby="trust-report-title">
      <button class="trust-report-close" type="button" aria-label="Close report flow" data-close-trust-report="true">&times;</button>
      <div class="trust-report-body" data-trust-report-body="true"></div>
    </div>
  `;
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-trust-report='true']")) {
      closeTrustReportModal();
      return;
    }
    const reasonButton = event.target.closest("[data-trust-report-reason]");
    if (reasonButton) {
      trustReportState.reason = reasonButton.dataset.trustReportReason || "other";
      renderTrustReportModal();
      return;
    }
    if (event.target.closest("[data-submit-trust-report='true']")) {
      submitTrustReport().catch((error) => {
        captureClientError("trust_report_submit_failed", error, {
          targetType: trustReportState.targetType,
          targetUserId: trustReportState.targetUserId,
          targetProductId: trustReportState.targetProductId
        });
        showInAppNotification({
          title: "Report failed",
          body: error.message || "Imeshindikana kutuma report yako kwa sasa.",
          variant: "error"
        });
        trustReportState.loading = false;
        renderTrustReportModal();
      });
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTrustReportModal();
    }
  });
  document.body.appendChild(root);
  return root;
}

function closeTrustReportModal() {
  const root = document.getElementById("trust-report-modal");
  if (!root) {
    return;
  }
  root.hidden = true;
  root.classList.remove("open");
  trustReportState = {
    targetType: "product",
    targetUserId: "",
    targetProductId: "",
    reason: "fake_item",
    title: "",
    subtitle: "",
    loading: false
  };
  root.querySelector("[data-trust-report-body='true']")?.replaceChildren();
}

function renderTrustReportModal() {
  const root = ensureTrustReportModal();
  const body = root.querySelector("[data-trust-report-body='true']");
  if (!body) {
    return;
  }
  const wrapper = createElement("div", { className: "trust-report-shell" });
  wrapper.append(
    createElement("p", { className: "eyebrow", textContent: "Trust & Safety" }),
    createElement("h3", {
      textContent: trustReportState.title || "Report this listing",
      attributes: { id: "trust-report-title" }
    }),
    createElement("p", {
      className: "product-meta",
      textContent: trustReportState.subtitle || "Help Winga review suspicious marketplace behavior."
    })
  );

  const reasons = createElement("div", { className: "trust-report-reasons" });
  TRUST_REPORT_REASON_OPTIONS.forEach((option) => {
    reasons.appendChild(createElement("button", {
      className: `trust-report-reason-chip${trustReportState.reason === option.id ? " active" : ""}`,
      textContent: option.label,
      attributes: {
        type: "button",
        "data-trust-report-reason": option.id
      }
    }));
  });

  const description = createElement("textarea", {
    className: "trust-report-textarea",
    attributes: {
      id: "trust-report-description",
      rows: "4",
      maxlength: "500",
      placeholder: "Share short details to help review this safely."
    }
  });

  const footer = createElement("div", { className: "trust-report-actions" });
  const submitButton = createElement("button", {
    className: "action-btn buy-btn",
    textContent: trustReportState.loading ? "Submitting..." : "Submit report",
    attributes: {
      type: "button",
      "data-submit-trust-report": "true"
    }
  });
  if (trustReportState.loading) {
    submitButton.disabled = true;
    description.disabled = true;
  }
  footer.append(
    submitButton,
    createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Cancel",
      attributes: {
        type: "button",
        "data-close-trust-report": "true"
      }
    })
  );

  wrapper.append(reasons, description, footer);
  body.replaceChildren(wrapper);
  root.hidden = false;
  root.classList.add("open");
  description.focus();
}

async function submitTrustReport() {
  const descriptionNode = document.getElementById("trust-report-description");
  const description = String(descriptionNode?.value || "").trim();
  const chosenReason = TRUST_REPORT_REASON_OPTIONS.find((option) => option.id === trustReportState.reason);
  trustReportState.loading = true;
  renderTrustReportModal();
  await window.WingaDataLayer.createReport({
    targetType: trustReportState.targetType,
    targetUserId: trustReportState.targetType === "user" ? trustReportState.targetUserId : "",
    targetProductId: trustReportState.targetType === "product" ? trustReportState.targetProductId : "",
    reason: chosenReason?.label || "Other concern",
    description: description || "User submitted a trust and safety report."
  });
  showInAppNotification({
    title: "Report submitted",
    body: "Asante. Winga team ita-review report hii kwa usalama.",
    variant: "success"
  });
  closeTrustReportModal();
}

function openTrustReportModal(config = {}) {
  if (!isAuthenticatedUser()) {
    promptGuestAuth({
      preferredMode: "signup",
      role: "buyer",
      title: "Sign in to report safely",
      message: "Open an account first so Winga can track and review safety reports properly."
    });
    return;
  }
  if (!canUseBuyerFeatures()) {
    showInAppNotification({
      title: "Buyer access needed",
      body: "Reporting is available on buyer-enabled accounts only.",
      variant: "warning"
    });
    return;
  }
  trustReportState = {
    targetType: config.targetType === "user" ? "user" : "product",
    targetUserId: config.targetUserId || "",
    targetProductId: config.targetProductId || "",
    reason: "fake_item",
    title: config.title || "Report this listing",
    subtitle: config.subtitle || "Tell Winga what looks unsafe or misleading.",
    loading: false
  };
  renderTrustReportModal();
}

function bindTrustReportEntryActions() {
  if (document.body?.dataset.trustReportBound === "true") {
    return;
  }
  document.body.dataset.trustReportBound = "true";
  document.addEventListener("click", (event) => {
    const productButton = event.target.closest("[data-report-product]");
    if (productButton) {
      event.preventDefault();
      event.stopPropagation();
      const product = getProductById(productButton.dataset.reportProduct || "");
      if (!product) {
        return;
      }
      openTrustReportModal({
        targetType: "product",
        targetProductId: product.id,
        title: "Report this product",
        subtitle: `Help Winga review ${getUserDisplayName(product.uploadedBy, { fallback: product.shop || product.uploadedBy || "this seller" })}'s listing safely.`
      });
      return;
    }

    const sellerButton = event.target.closest("[data-report-seller]");
    if (sellerButton) {
      event.preventDefault();
      event.stopPropagation();
      const username = sellerButton.dataset.reportSeller || "";
      const productContext = sellerButton.dataset.reportProductContext || "";
      if (!username) {
        return;
      }
      openTrustReportModal({
        targetType: "user",
        targetUserId: username,
        targetProductId: productContext,
        title: "Report this seller",
        subtitle: `Winga will review the seller account for fraud, abuse, or misleading behavior.`
      });
    }
  }, true);
}

const {
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
} = window.WingaModules.reviews.createReviewsModule({
  getCurrentUser: () => currentUser,
  getCurrentOrders: () => currentOrders,
  getCurrentReviews: () => currentReviews,
  getReviewSummaries: () => reviewSummaries,
  getProducts: () => products,
  getProductDetailUiState: () => productDetailUiState,
  escapeHtml
});

const {
  renderNotificationsSection,
  renderMessagesSection,
  renderChatProductPreviewItems,
  renderConversationMessagesMarkup,
  createNotificationsContainerFromState,
  createMessagesContainerFromState,
  ensureContextChatModal,
  renderContextChatModal
} = window.WingaModules.chat.createChatUiModule({
  createElement,
  createElementFromMarkup,
  createResponsiveImage,
  sanitizeImageSource,
  getCurrentNotifications: () => currentNotifications,
  getUnreadNotifications,
  escapeHtml,
  getConversationSummaries,
  getConversationSummariesFiltered,
  getActiveConversationMessages,
  getActiveChatContext: () => chatUiState.activeContext,
  getProfileMessagesMode: () => chatUiState.profileMessagesMode,
  getProfileMessagesFilter: () => chatUiState.profileMessagesFilter,
  isCompactMessagesLayout: () => getViewportWidth() <= 720,
  getCurrentMessageDraft: () => chatUiState.currentDraft,
  getChatContactState,
  getChatWhatsappNumber,
  getChatContextKey,
  buildWhatsappHref,
  renderEmojiPicker,
  getActiveChatProduct,
  getMarketplaceUser,
  getSellerProductsForActiveChat,
  getSelectedChatProducts,
  getSelectedChatProductIds: () => chatUiState.selectedProductIds,
  getActiveChatReplyMessageId: () => chatUiState.activeReplyMessageId,
  getOpenChatMessageMenuId: () => chatUiState.openMessageMenuId,
  getMessagePreviewText,
  getImageFallbackDataUri,
  getProducts: () => products,
  getProductById,
  formatNumber,
  formatProductPrice,
  getCategoryLabel,
  getMessageProductItems,
  getReplyPreviewMessage,
  getCurrentUser: () => currentUser,
  getUserDisplayName
});

const {
  bindMessageActions,
  closeContextChatModal: closeContextChatModalFromController,
  bindContextChatModalActions: bindContextChatModalActionsFromController,
  replaceContextChatModal: replaceContextChatModalFromController,
  openContextChatModal: openContextChatModalFromController,
  openProductChat: openProductChatFromController,
  openOwnProductMessages: openOwnProductMessagesFromController
} = window.WingaModules.chat.createChatControllerModule({
  dataLayer: window.WingaDataLayer,
  getProfileDiv: () => profileDiv,
  renderProfile,
  refreshProductsFromStore,
  showInAppNotification,
  reportEvent: (...args) => reportClientEvent(...args),
  captureError: (...args) => captureClientError(...args),
  getUserDisplayName,
  setActiveChatContext: (context) => {
    chatUiState.activeContext = context;
  },
  getActiveChatContext: () => chatUiState.activeContext,
  setProfileMessagesMode: (value) => {
    chatUiState.profileMessagesMode = value === "detail" ? "detail" : "list";
  },
  setProfileMessagesFilter: (value) => {
    chatUiState.profileMessagesFilter = value === "unread" ? "unread" : "all";
  },
  setProfileHasSelection: (value) => {
    chatUiState.profileHasSelection = Boolean(value);
  },
  setCurrentMessageDraft: (value) => {
    chatUiState.currentDraft = value;
  },
  getCurrentMessageDraft: () => chatUiState.currentDraft,
  setSelectedChatProductIds: (value) => {
    chatUiState.selectedProductIds = Array.isArray(value) ? value : [];
  },
  getSelectedChatProductIds: () => chatUiState.selectedProductIds,
  setActiveChatReplyMessageId: (value) => {
    chatUiState.activeReplyMessageId = value || "";
  },
  getActiveChatReplyMessageId: () => chatUiState.activeReplyMessageId,
  setOpenChatMessageMenuId: (value) => {
    chatUiState.openMessageMenuId = value || "";
  },
  getOpenChatMessageMenuId: () => chatUiState.openMessageMenuId,
  setOpenEmojiScope: (value) => {
    chatUiState.openEmojiScope = value;
  },
  getOpenEmojiScope: () => chatUiState.openEmojiScope,
  getIsContextOpen: () => chatUiState.isContextOpen,
  setIsContextOpen: (value) => {
    chatUiState.isContextOpen = Boolean(value);
  },
  getCurrentView: () => currentView,
  setCurrentViewState,
  setPendingProfileSection: (value) => {
    profileRuntimeState.pendingSection = value;
  },
  createElementFromMarkup,
  ensureContextChatModal,
  renderContextChatModal,
  getConversationSummaries,
  getActiveConversationMessages,
  getSelectedChatProducts,
  getMessageProductItems,
  formatNumber,
  formatProductPrice,
  canUseBuyerFeatures,
  promptGuestAuth,
  noteMessageInterest,
  normalizeWhatsapp,
  renderCurrentView,
  syncBodyScrollLockState,
  startMessagePolling,
  stopMessagePolling,
  markActiveConversationRead,
  replaceMessagesPanel,
  createNotificationsContainerFromState,
  refreshUsersState,
  refreshMessagesState,
  refreshNotificationsState,
  getCurrentUser: () => currentUser
});

const { renderAnalyticsPanel } = window.WingaModules.admin.createAdminUiModule({
  createElement,
  createSectionHeading,
  createEmptyState,
  getAnalyticsPanel: () => analyticsPanel,
  formatNumber,
  getCategoryLabel,
  getStatusLabel,
  isAdminUser
});

const { renderAdminView: renderAdminViewFromController } = window.WingaModules.admin.createAdminControllerModule({
  createElement,
  createSectionHeading,
  createEmptyState,
  createStatusPill,
  createResponsiveImage,
  sanitizeImageSource,
  getImageFallbackDataUri,
  getCategoryLabel,
  getRoleLabel,
  getPromotionLabel,
  formatNumber,
  formatProductPrice,
  getAdminPanel: () => adminPanel,
  getCurrentView: () => currentView,
  isAdminUser,
  isStaffUser,
  refreshProductsFromStore,
  renderAnalyticsPanel,
  dataLayer: window.WingaDataLayer,
  showInAppNotification,
  confirmAction,
  reportEvent: (...args) => reportClientEvent(...args),
  captureError: (...args) => captureClientError(...args)
});

const {
  createProfileShellElement,
  createProfileProductCardElement,
  createProfileIdentitySectionElement,
  createSellerUpgradeSectionElement,
  createOrdersSectionElement,
  createPromotionOverviewSectionElement
} = window.WingaModules.profile.createProfileUiModule({
  createElement,
  createSectionHeading,
  createFragmentFromMarkup,
  createElementFromMarkup,
  createResponsiveImage,
  createStatusPill,
  createStatBox,
  escapeHtml,
  sanitizeImageSource,
  getImageFallbackDataUri,
  renderProductGallery,
  formatNumber,
  formatProductPrice,
  getStatusLabel,
  getPaymentStatusLabel,
  getOrderLifecycleMeta,
  getOrderProgressLabel,
  getVerificationStatusLabel,
  getOrderActionButtons,
  renderPromotionBadges,
  renderPromoteButton,
  renderSellerSoldOutButton,
  renderWhatsappChatLink,
  renderProductOverflowMenu,
  getSellerReviewSummary,
  formatMemberSinceLabel
});

const {
  renderProfile: renderProfileFromController,
  bindProfileIdentityActions: bindProfileIdentityActionsFromController
} = window.WingaModules.profile.createProfileControllerModule({
  createProfileShellElement,
  createProfileProductCardElement,
  createProfileIdentitySectionElement,
  createSellerUpgradeSectionElement,
  createOrdersSectionElement,
  createPromotionOverviewSectionElement,
  createOrdersContainerFromState,
  renderRequestBoxSection,
  renderNotificationsSection,
  renderMessagesSection,
  createNotificationsContainerFromState,
  replaceMessagesPanel,
  bindRequestBoxActions,
  bindMessageActions,
  bindGalleryThumbs,
  bindProductMenus,
  noteProductInterest,
  openProductDetailModal,
  startEditProduct,
  deleteProduct,
  logout,
  hideUploadAndEmptyState: () => {
    uploadForm.style.display = "none";
    emptyState.style.display = "none";
  },
  getOrCreateProfileDiv: () => {
    if (!profileDiv) {
      profileDiv = document.createElement("section");
      profileDiv.id = "profile-div";
      appContainer.insertBefore(profileDiv, document.getElementById("products-summary"));
    }
    return profileDiv;
  },
  getProducts: () => products,
  getProductById,
  getCurrentUser: () => currentUser,
  getCurrentSession: () => currentSession,
  getCurrentOrders: () => currentOrders,
  getCurrentView: () => currentView,
  setCurrentOrders: (value) => {
    currentOrders = value;
  },
    getCurrentMessages: () => currentMessages,
    getConversationSummaries,
    setCurrentMessages: (value) => {
      currentMessages = value;
    },
  setCurrentNotifications: (value) => {
    currentNotifications = value;
  },
  getMarketplaceUser,
  isBuyerUser,
  canUseBuyerFeatures,
  canUseSellerFeatures,
  getCurrentDisplayName,
  getCurrentProfileImage,
  getUserInitials,
  getRoleLabel,
  getTotalUnreadMessages,
    getRequestBoxItemCount,
    getActivePromotions,
    getPromotionOptions: () => PROMOTION_OPTIONS,
    flushPendingProfileSection,
    setPendingProfileSection: (value) => {
      profileRuntimeState.pendingSection = value;
    },
    setActiveProfileSection,
    getActiveProfileSection,
    setProfileMessagesFilter: (value) => {
      chatUiState.profileMessagesFilter = value === "unread" ? "unread" : "all";
    },
  setProfileMessagesMode: (value) => {
    chatUiState.profileMessagesMode = value === "detail" ? "detail" : "list";
  },
  setProfileHasSelection: (value) => {
    chatUiState.profileHasSelection = Boolean(value);
  },
  setActiveChatContext: (context) => {
    chatUiState.activeContext = context;
  },
  setEmptyCopy,
  setResultsMeta: (title, caption) => {
    resultsCount.innerText = title;
    resultsCaption.innerText = caption;
  },
  renderAnalyticsPanel,
  refreshPromotionsState,
  renderCurrentView,
  updateProfileNavBadge,
  syncActiveChatContext,
  markActiveConversationRead,
  startMessagePolling,
  formatNumber,
  normalizePhoneNumber,
  validateSingleImageFile,
  readFileAsDataUrl,
  mergeSessionState,
  saveSessionUser: () => saveSessionUser(currentSession),
  renderHeaderUserMenu,
  showInAppNotification,
  confirmAction,
  dataLayer: window.WingaDataLayer,
  reportEvent: (...args) => reportClientEvent(...args),
  captureError: (...args) => captureClientError(...args)
});

const {
  ensureProductDetailModal,
  createProductDetailContentElement,
  createDetailShowcaseSectionElement
} = window.WingaModules.productDetail.createProductDetailUiModule({
  createElement,
  createFragmentFromMarkup,
  sanitizeImageSource,
  escapeHtml,
  getCategoryLabel,
  formatNumber,
  formatProductPrice,
  getImageFallbackDataUri,
  getRenderableMarketplaceImages,
  getMarketplacePrimaryImage,
  renderRequestBoxButton,
  renderWhatsappChatLink,
  getCurrentUser: () => currentUser,
  canRepostProduct: (product) => canRepostProductAsSeller(product),
  renderProductActionGroup,
  renderMarketplaceTrustBadges,
  renderSellerTrustPanel,
  renderDiscoveryProductCards
});

const {
  getSellerOtherProducts: getSellerOtherProductsFromController,
  closeProductDetailModal: closeProductDetailModalFromController,
  openProductDetailModal: openProductDetailModalFromController,
  refreshActiveProductDetail
} = window.WingaModules.productDetail.createProductDetailControllerModule({
  createElement,
  createSectionHeading,
  createFragmentFromMarkup,
  ensureProductDetailModal,
  createProductDetailContentElement,
  createDetailShowcaseSectionElement,
  getProducts: () => products,
  getProductById,
  getMarketplaceUser,
  getDiscoveryRelatedProducts: (...args) => getDiscoveryRelatedProducts(...args),
  getDiscoverySponsoredProducts: (...args) => getDiscoverySponsoredProducts(...args),
  getMostSearchedProducts: (...args) => getMostSearchedProducts(...args),
  getNewestProducts: (...args) => getNewestProducts(...args),
  getContinuousDiscoveryDescriptor,
  shouldRenderMarketplaceProduct,
  getRenderableMarketplaceImages,
  renderDiscoveryProductCards,
  getImageFallbackDataUri,
  noteProductInterest,
  noteProductDiscovery,
  enhanceShowcaseTracks,
  bindProductMenus,
  bindImageFallbacks,
  unbindMarketplaceScrollImages,
  scrollToProductCard,
  renderProductReviewSummary,
  renderSellerReviewSummary,
  renderProductReviewForm,
  renderProductReviewsList,
  getCurrentUser: () => currentUser,
  openProductChat,
  openOwnProductMessages,
  beginPurchaseFlow,
  repostProductAsSeller,
  toggleProductInRequestBox,
  showInAppNotification,
  resetHomeBrowseState,
  refreshSearchInputControl,
  syncBodyScrollLockState,
  syncAppShellHistoryState,
  setCurrentViewState,
  renderCurrentView,
  getProductDetailPath,
  getProductDetailReviewDraft,
  resetReviewDraft: () => {
    productDetailUiState.reviewDraft = { productId: "", rating: 5, comment: "" };
  },
  resetProductDiscoveryTrail: () => {
    productDiscoveryTrail = [];
  },
  setCurrentReviews: (value) => {
    currentReviews = value;
  },
  setReviewSummaries: (value) => {
    reviewSummaries = value;
  },
  dataLayer: window.WingaDataLayer,
  reportEvent: (...args) => reportClientEvent(...args),
  captureError: (...args) => captureClientError(...args)
});

const {
  bindHeaderEntryActions,
  bindPublicEntryActions,
  bindPrimaryNav,
  bindMarketplaceCardActions
} = window.WingaModules.navigation.createNavigationControllerModule({
  getHeaderLoginButton: () => headerLoginButton,
  getHeaderSignupButton: () => headerSignupButton,
  getHeaderUserTrigger: () => headerUserTrigger,
  getHeaderUserDropdown: () => headerUserDropdown,
  getAuthGateLoginButton: () => authGateLoginButton,
  getAuthGateSignupButton: () => authGateSignupButton,
  getAuthCloseButton: () => authCloseButton,
  getAuthContainer: () => authContainer,
  getPublicAuthButtons: () => document.querySelectorAll("[data-public-auth]"),
  getPublicLinkButtons: () => document.querySelectorAll("[data-public-link]"),
  getNavItems: () => navItems,
  getProductsContainer: () => productsContainer,
  clearPendingGuestIntent,
  openAuthModal,
  closeAuthModal,
  renderHeaderUserMenu,
  toggleHeaderUserMenu,
  getCurrentSession: () => currentSession,
  reportEvent: (...args) => reportClientEvent(...args),
  openProfileSection,
  isStaffUser,
  setCurrentViewState,
  renderCurrentView,
  logout,
  getAuthGateTitle: () => authGateTitle?.innerText || "",
  getAuthGateMessage: () => authGateCopy?.innerText || "",
  canAccessView,
  getAccessDeniedMessage,
  closeMobileSearch: () => {
    searchRuntimeState.isMobileSearchOpen = false;
    searchBox.classList.remove("mobile-open");
  },
  toggleProductInRequestBoxById: (productId) => {
    const product = getProductById(productId);
    if (product) {
      toggleProductInRequestBox(product);
    }
  },
  openProductDetailModal,
  openOwnProductMessages,
  openProductChatFromCard: (productId) => {
    const product = getProductById(productId);
    if (!product) {
      reportClientEvent("error", "message_seller_missing_product", "Message Seller handler could not resolve the product.", {
        productId
      });
      return;
    }
    try {
      openProductChat(product);
    } catch (error) {
      captureClientError("message_seller_open_failed", error, {
        productId
      });
      const whatsappHref = buildWhatsappHref(product.whatsapp, product.name);
      if (whatsappHref !== "#") {
        window.open(whatsappHref, "_blank", "noopener,noreferrer");
      }
    }
  }
});

const appChrome = window.WingaModules.navigation.createNavigationChromeModule({
  isAuthenticatedUser,
  isBuyerUser,
  canUseSellerFeatures,
  isStaffUser,
  getCurrentView: () => currentView,
  getEditingProductId: () => editingProductId,
  getAppContainer: () => appContainer,
  getTopBar: () => topBar,
  getBottomNav: () => bottomNav,
  getPostProductFab: () => postProductFab,
  getViewHomeBackButton: () => viewHomeBackButton,
  getAuthContainer: () => authContainer,
  getUiRuntimeState: () => uiRuntimeState,
  getSearchRuntimeState: () => searchRuntimeState,
  getProfileRuntimeState: () => profileRuntimeState,
  getChatUiState: () => chatUiState
});

const { renderSlideshow } = window.WingaModules.hero.createHeroUiModule({
  getSlidesTrack: () => slidesTrack,
  getSlideDots: () => slideDots,
  getSlidePrevButton: () => slidePrevButton,
  getSlideNextButton: () => slideNextButton,
  getSlideshowItems,
  getSlideIndex: () => uiRuntimeState.slideIndex,
  setSlideIndex: (value) => {
    uiRuntimeState.slideIndex = value;
  },
  startSlideshow,
  createElement,
  createResponsiveImage,
  createSlideDot
});

const { renderFilterCategories } = window.WingaModules.categories.createCategoriesUiModule({
  createElement,
  createCategoryButton,
  createResponsiveImage,
  getImageFallbackDataUri,
  getAvailableTopCategories: () => availableTopCategories,
  getSelectedCategory: () => selectedCategory,
  getExpandedBrowseCategory: () => expandedBrowseCategory,
  getPinnedDesktopCategory: () => pinnedDesktopCategory,
  isTopCategoryValue,
  inferTopCategoryValue,
  getCategoryPreviewProduct,
  getSubcategoriesForTopCategory,
  getCategoryLabel,
  getCategoriesTarget: () => categories,
  getMobileCategoryMenu: () => mobileCategoryMenu,
  getMobileCategoryTopValue: () => searchRuntimeState.mobileCategoryTopValue || "",
  closeMobileCategoryMenu,
  onMobileCategoryDrill: (topCategory) => {
    searchRuntimeState.mobileCategoryTopValue = topCategory || "";
    renderFilterCategories();
  },
  onMobileCategoryBack: () => {
    searchRuntimeState.mobileCategoryTopValue = "";
    renderFilterCategories();
  },
  onDesktopCategoryClick: ({ nextCategory, isSamePinnedCategory }) => {
    pinnedDesktopCategory = isSamePinnedCategory ? "" : nextCategory;
    setCategorySelectionState(nextCategory, {
      expandedBrowseCategory: nextCategory === "all" ? "" : inferTopCategoryValue(nextCategory)
    });
    renderFilterCategories();
    renderCurrentView();
  },
  onCategorySelect: ({ nextCategory, isMobileScope }) => {
    if (!isMobileScope) {
      pinnedDesktopCategory = "";
      setCategorySelectionState(nextCategory, {
        expandedBrowseCategory: nextCategory === "all" ? "" : inferTopCategoryValue(nextCategory)
      });
      renderFilterCategories();
      renderCurrentView();
      return;
    }

    if (nextCategory === "all") {
      setCategorySelectionState("all", {
        expandedBrowseCategory: ""
      });
      closeMobileCategoryMenu();
    } else {
      setCategorySelectionState(nextCategory, {
        expandedBrowseCategory: inferTopCategoryValue(nextCategory)
      });
      closeMobileCategoryMenu();
    }
    renderFilterCategories();
    renderCurrentView();
  },
  onSubcategorySelect: ({ nextCategory, parentCategory, isMobileScope }) => {
    if (!isMobileScope) {
      pinnedDesktopCategory = "";
    }
    setCategorySelectionState(nextCategory, {
      expandedBrowseCategory: parentCategory || inferTopCategoryValue(nextCategory)
    });
    renderFilterCategories();
    renderCurrentView();
    if (isMobileScope) {
      closeMobileCategoryMenu();
    }
  }
});

const {
  renderProducts,
  createShowcaseSectionElement,
  createDynamicShowcasePlaceholderElement,
  renderShowcaseTrack
} = window.WingaModules.marketplace.createMarketplaceUiModule({
  createElement,
  createElementFromMarkup,
  createFragmentFromMarkup,
  createSectionHeading,
  createResponsiveImage,
  createStatusPill,
  getImageFallbackDataUri,
  getProductsContainer: () => productsContainer,
  getCurrentView: () => currentView,
  hasPrioritySearchResults,
  getProductsPerRow,
  trackView,
  formatNumber,
  formatProductPrice,
  getStatusLabel,
  getCategoryLabel,
  getRenderableMarketplaceImages,
  getMarketplacePrimaryImage,
  getMarketplaceUser,
  renderMarketplaceTrustBadges,
  renderProductActionGroup,
  renderProductOverflowMenu,
  noteProductInterest,
  openImageLightbox,
  openProductDetailModal,
  isAuthenticatedUser,
  promptGuestAuth,
  renderFeedGalleryMarkup,
  bindFeedGalleryInteractions,
  getBehaviorShowcaseDescriptor,
  getRecommendationSeed,
  getRelatedProducts: (...args) => getRelatedProducts(...args),
  getYouMayLikeProducts,
  getTrendingProducts,
  bindShowcaseCardClicks,
  setupDynamicShowcaseLoading,
  canUseContinuousDiscovery: () => Boolean(currentUser),
  createContinuousDiscoveryAnchorElement,
  setupContinuousDiscoveryLoading,
  trackProductView: (productId) => window.WingaDataLayer.trackProductView(productId),
  refreshProductsFromStore
});

function renderReviewButton(product) {
  if (!canCurrentUserReviewProduct(product)) {
    return "";
  }
  return `<button class="action-btn edit-btn" type="button" data-review-product="${product.id}">Rate & Review</button>`;
}

function refreshVisibleRequestButtons(scope = document) {
  scope.querySelectorAll("[data-request-product]").forEach((button) => {
    const product = getProductById(button.dataset.requestProduct);
    if (!product) {
      return;
    }
    const nextButton = createElementFromMarkup(renderRequestBoxButton(product));
    if (nextButton) {
      button.replaceWith(nextButton);
    }
  });
}

function isRestorableView(view, session) {
  if (session?.role === "admin" || session?.role === "moderator") {
    return view === "home" || view === "admin";
  }
  if (view === "home") {
    return true;
  }

  if (view === "profile") {
    return session?.role !== "buyer";
  }

  if (view === "upload") {
    return session?.role !== "buyer";
  }

  if (view === "admin") {
    return session?.role === "admin" || session?.role === "moderator";
  }

  return false;
}

const DEMO_SLIDES = [
  {
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 700'><defs><linearGradient id='g1' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%23c65a1e'/><stop offset='1' stop-color='%237a3110'/></linearGradient></defs><rect width='1600' height='700' fill='url(%23g1)'/><circle cx='1320' cy='140' r='180' fill='rgba(255,255,255,0.16)'/><circle cx='240' cy='620' r='220' fill='rgba(255,255,255,0.08)'/><text x='100' y='230' fill='white' font-size='84' font-family='Segoe UI, Arial'>WINGA Demo</text><text x='100' y='330' fill='white' font-size='46' font-family='Segoe UI, Arial'>Upload bidhaa. Pata wateja. Chat WhatsApp.</text></svg>",
    kicker: "Winga signature",
    title: "Bidhaa zinazoongea vizuri bila kelele",
    subtitle: "Muonekano safi, mazungumzo ya haraka, na marketplace yenye ladha ya Kariakoo."
  },
  {
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 700'><defs><linearGradient id='g2' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%231f1a17'/><stop offset='1' stop-color='%23c65a1e'/></linearGradient></defs><rect width='1600' height='700' fill='url(%23g2)'/><rect x='130' y='120' width='260' height='340' rx='26' fill='rgba(255,255,255,0.16)'/><rect x='430' y='160' width='290' height='290' rx='26' fill='rgba(255,255,255,0.14)'/><rect x='770' y='100' width='300' height='380' rx='26' fill='rgba(255,255,255,0.18)'/><rect x='1110' y='150' width='240' height='300' rx='26' fill='rgba(255,255,255,0.14)'/><text x='120' y='585' fill='white' font-size='78' font-family='Segoe UI, Arial'>Catalog yako inaweza kuonekana hivi</text></svg>",
    kicker: "Discovery",
    title: "Utafutaji unaohisi wa kweli",
    subtitle: "Search, categories na discovery sasa vinaelekea zaidi kwenye intent ya watu halisi sokoni."
  },
  {
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 700'><defs><linearGradient id='g3' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%23f2c29b'/><stop offset='1' stop-color='%23c65a1e'/></linearGradient></defs><rect width='1600' height='700' fill='url(%23g3)'/><rect x='180' y='120' width='1240' height='430' rx='34' fill='rgba(255,255,255,0.18)'/><text x='250' y='270' fill='white' font-size='88' font-family='Segoe UI, Arial'>Ongeza picha zako mwenyewe</text><text x='250' y='370' fill='white' font-size='48' font-family='Segoe UI, Arial'>Ukisha-upload bidhaa, slideshow itaanza kutumia picha zako moja kwa moja.</text></svg>",
    kicker: "Seller spotlight",
    title: "Picha zako zinaingia mbele kwa utulivu",
    subtitle: "Ukisha-upload bidhaa, hero inaanza kukuonyesha kwa mwonekano wa premium na wa haraka."
  }
];

function normalizeProduct(product) {
  const normalizedImages = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : (product.image ? [product.image] : []);

  return {
    ...product,
    id: product.id || createId(),
    price: normalizeOptionalPrice(product.price),
    category: product.category || detectCategory(product.name || ""),
    status: product.status || "approved",
    availability: product.availability === "sold_out" ? "sold_out" : "available",
    moderationNote: product.moderationNote || "",
    createdAt: product.createdAt || "",
    updatedAt: product.updatedAt || "",
    imageSignature: typeof product.imageSignature === "string" ? product.imageSignature : "",
    likes: Number(product.likes || 0),
    views: Number(product.views || 0),
    viewedBy: Array.isArray(product.viewedBy) ? product.viewedBy : [],
    images: normalizedImages,
    image: normalizedImages[0] || "",
    _searchText: AppCore.createProductSearchText
      ? AppCore.createProductSearchText({
        name: product.name || "",
        shop: product.shop || "",
        uploadedBy: product.uploadedBy || "",
        category: product.category || detectCategory(product.name || "")
      })
      : normalizeSearchValue(`${product.name || ""} ${product.shop || ""}`)
  };
}

const brokenMarketplaceImagesByProduct = new Map();
const BROKEN_IMAGE_FAILURE_THRESHOLD = 2;
const BROKEN_IMAGE_SUPPRESS_MS = 5 * 60 * 1000;
const MAX_ACTIVE_HOME_CONTINUOUS_SECTIONS = 2;
const MAX_HOME_CONTINUOUS_USED_IDS = 96;
const HOME_CONTINUOUS_DISCOVERY_MIN_INTERVAL_MS = 720;
const HOME_CONTINUOUS_DISCOVERY_REOBSERVE_DELAY_MS = 420;
const MARKETPLACE_SCROLL_IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
let marketplaceScrollImageObserver = null;
const marketplaceScrollImagePrefetchedSources = new Set();

function getMarketplaceScrollImagePrefetchMargin() {
  return getViewportWidth() <= 720 ? 1200 : 1800;
}

function getMarketplaceScrollImageRootMargin() {
  const margin = getMarketplaceScrollImagePrefetchMargin();
  return `${margin}px 0px ${margin}px 0px`;
}

function getProductImageCandidates(product) {
  const sourceImages = Array.isArray(product?.images) && product.images.length > 0
    ? product.images
    : [product?.image];
  return sourceImages
    .map((image) => sanitizeImageSource(image, ""))
    .filter(Boolean);
}

function getBrokenMarketplaceImageSet(productId) {
  const productKey = String(productId || "").trim();
  const registry = brokenMarketplaceImagesByProduct.get(productKey);
  if (!(registry instanceof Map) || !registry.size) {
    return new Set();
  }
  const now = Date.now();
  const activeSources = new Set();
  registry.forEach((entry, source) => {
    if (!entry || !Number.isFinite(entry.hiddenUntil) || entry.hiddenUntil <= now) {
      registry.delete(source);
      return;
    }
    activeSources.add(source);
  });
  if (!registry.size) {
    brokenMarketplaceImagesByProduct.delete(productKey);
  }
  return activeSources;
}

function pruneBrokenMarketplaceImageRegistry() {
  const activeProductIds = new Set(products.map((product) => String(product?.id || "")).filter(Boolean));
  Array.from(brokenMarketplaceImagesByProduct.keys()).forEach((productId) => {
    if (!activeProductIds.has(productId)) {
      brokenMarketplaceImagesByProduct.delete(productId);
      return;
    }
    getBrokenMarketplaceImageSet(productId);
  });
}

function clearBrokenMarketplaceImage(productId, imageSource = "") {
  const normalizedProductId = String(productId || "").trim();
  const normalizedSource = sanitizeImageSource(imageSource, "");
  if (!normalizedProductId || !normalizedSource) {
    return;
  }
  const registry = brokenMarketplaceImagesByProduct.get(normalizedProductId);
  if (!(registry instanceof Map) || !registry.has(normalizedSource)) {
    return;
  }
  registry.delete(normalizedSource);
  if (!registry.size) {
    brokenMarketplaceImagesByProduct.delete(normalizedProductId);
  }
}

function getRenderableMarketplaceImages(product, options = {}) {
  const { allowOwnerVisibility = false } = options;
  const candidates = getProductImageCandidates(product);
  if (!candidates.length) {
    return [];
  }
  if (allowOwnerVisibility && product?.uploadedBy === currentUser) {
    return candidates;
  }
  const brokenSources = getBrokenMarketplaceImageSet(product?.id);
  return candidates.filter((image) => !brokenSources.has(image));
}

function hasRenderableMarketplaceImage(product, options = {}) {
  return getRenderableMarketplaceImages(product, options).length > 0;
}

function getMarketplacePrimaryImage(product, options = {}) {
  return getRenderableMarketplaceImages(product, options)[0] || "";
}

function shouldRenderMarketplaceProduct(product, options = {}) {
  if (!isMarketplaceBrowseCandidate(product)) {
    return false;
  }
  return hasRenderableMarketplaceImage(product, options);
}

function noteBrokenMarketplaceImage(productId, imageSource = "") {
  const normalizedProductId = String(productId || "").trim();
  const normalizedSource = sanitizeImageSource(imageSource, "");
  if (!normalizedProductId || !normalizedSource || normalizedSource.startsWith("data:image/")) {
    return;
  }
  const registry = brokenMarketplaceImagesByProduct.get(normalizedProductId) instanceof Map
    ? brokenMarketplaceImagesByProduct.get(normalizedProductId)
    : new Map();
  const currentEntry = registry.get(normalizedSource) || {
    failures: 0,
    hiddenUntil: 0
  };
  const failures = Number(currentEntry.failures || 0) + 1;
  const shouldHide = failures >= BROKEN_IMAGE_FAILURE_THRESHOLD;
  registry.set(normalizedSource, {
    failures,
    hiddenUntil: shouldHide ? Date.now() + BROKEN_IMAGE_SUPPRESS_MS : 0
  });
  brokenMarketplaceImagesByProduct.set(normalizedProductId, registry);
  if (!shouldHide) {
    return;
  }
}

window.addEventListener("winga:image-error", (event) => {
  const productId = event?.detail?.productId || "";
  const imageSource = event?.detail?.imageSource || "";
  if (!productId || !imageSource) {
    return;
  }
  noteBrokenMarketplaceImage(productId, imageSource);
});

const DEFAULT_PRODUCTS = [
  {
    id: createId(),
    name: "Gauni la harusi",
    price: 80000,
    shop: "Neema Fashion",
    whatsapp: "255751111111",
    image: getImageFallbackDataUri("Gauni"),
    images: [getImageFallbackDataUri("Gauni")],
    uploadedBy: "admin",
    category: "wanawake-magauni",
    likes: 0,
    views: 12,
    viewedBy: []
  },
  {
    id: createId(),
    name: "Sketi ya rangi",
    price: 20000,
    shop: "Mama Asha Shop",
    whatsapp: "255752222222",
    image: getImageFallbackDataUri("Sketi"),
    images: [getImageFallbackDataUri("Sketi")],
    uploadedBy: "admin",
    category: "sketi",
    likes: 0,
    views: 7,
    viewedBy: []
  }
];

let products = [];
let productIndex = new Map();

let isLogin = true;
let isPasswordRecovery = false;
let selectedAuthRole = "seller";
let currentUser = "";
let selectedCategory = "all";
let expandedBrowseCategory = "";
let currentView = "home";
let publicAuthRequestPending = false;
let publicAuthTransitionPending = false;
let adminAuthRequestPending = false;
let sellerIdentityPreparedSignature = "";
let sellerIdentityPreparedDataUrl = "";
let sellerIdentityPreparedPromise = null;
let isHandlingSessionInvalidation = false;
let editingProductId = null;
let authSignupStep = 1;
let currentSession = null;
let pendingGuestIntent = null;
let isSessionRestorePending = false;
const ADMIN_LOGIN_HASH = "#/admin-login";

const authContainer = document.getElementById("auth-container");
const authCloseButton = document.getElementById("auth-close-button");
const authGatePrompt = document.getElementById("auth-gate-prompt");
const authGateTitle = document.getElementById("auth-gate-title");
const authGateCopy = document.getElementById("auth-gate-copy");
const authGateLoginButton = document.getElementById("auth-gate-login");
const authGateSignupButton = document.getElementById("auth-gate-signup");
const toggleLink = document.getElementById("toggle-link");
const forgotPasswordLink = document.getElementById("forgot-password-link");
const authButton = document.getElementById("auth-button");
const authNextButton = document.getElementById("auth-next-button");
const authBackButton = document.getElementById("auth-back-button");
const formTitle = document.getElementById("form-title");
const authDetailsStep = document.getElementById("auth-details-step");
const authCategoryStep = document.getElementById("auth-category-step");
const authRoleSelector = document.getElementById("auth-role-selector");
const usernameInput = document.getElementById("username");
const phoneNumberInput = document.getElementById("phone-number");
const nationalIdInput = document.getElementById("national-id");
const sellerIdentityDocumentTypeInput = document.getElementById("seller-identity-document-type");
const sellerVerificationUploads = document.getElementById("seller-verification-uploads");
const sellerIdentityDocumentNumberInput = document.getElementById("seller-identity-document-number");
const sellerIdentityDocumentImageInput = document.getElementById("seller-identity-document-image");
const sellerIdentityDocumentImageName = document.getElementById("seller-identity-document-image-name");
const sellerIdentityDocumentPreviewWrap = document.getElementById("seller-identity-document-preview-wrap");
const sellerIdentityDocumentPreview = document.getElementById("seller-identity-document-preview");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");
const confirmPasswordWrap = document.getElementById("confirm-password-wrap");
const passwordToggleButton = document.getElementById("password-toggle");
const authCategoryNote = document.getElementById("auth-category-note");
const staffAccessButton = document.getElementById("staff-access-button");
const adminLoginContainer = document.getElementById("admin-login-container");
const adminLoginTitle = document.getElementById("admin-login-title");
const adminLoginCopy = document.getElementById("admin-login-copy");
const adminLoginIdentifierInput = document.getElementById("admin-login-identifier");
const adminLoginPasswordInput = document.getElementById("admin-login-password");
const adminLoginButton = document.getElementById("admin-login-button");
const adminLoginBackButton = document.getElementById("admin-login-back");
const appContainer = document.getElementById("app-container");
const adminNavItem = document.getElementById("admin-nav-item");
const searchToggleButton = document.getElementById("search-toggle-button");
const searchImageButton = document.getElementById("search-image-button");
const searchImageFileInput = document.getElementById("search-image-file");
const searchImagePreview = document.getElementById("search-image-preview");
const headerSearchArea = document.getElementById("header-search-area");

const topBarSubtitle = document.getElementById("top-bar-subtitle");
const publicHeaderActions = document.getElementById("public-header-actions");
const headerUserMenu = document.getElementById("header-user-menu");
const headerUserTrigger = document.getElementById("header-user-trigger");
const headerUserAvatarImage = document.getElementById("header-user-avatar-image");
const headerUserAvatarFallback = document.getElementById("header-user-avatar-fallback");
const headerUserName = document.getElementById("header-user-name");
const headerUserDropdown = document.getElementById("header-user-dropdown");
const headerLoginButton = document.getElementById("header-login-button");
const headerSignupButton = document.getElementById("header-signup-button");
const publicFooter = document.getElementById("public-footer");
const resultsCount = document.getElementById("results-count");
const resultsCaption = document.getElementById("results-caption");
const heroPanel = document.getElementById("hero-panel");
const marketShowcase = document.getElementById("market-showcase");
const showcaseTrack = document.getElementById("showcase-track");
const productsContainer = document.getElementById("products-container");
const productsSummary = document.getElementById("products-summary");
const uploadForm = document.getElementById("upload-form");
const uploadTitle = document.getElementById("upload-title");
const cancelEditButton = document.getElementById("cancel-edit-button");
const emptyState = document.getElementById("empty-state");
const analyticsPanel = document.getElementById("analytics-panel");
const adminPanel = document.getElementById("admin-panel");

const productNameInput = document.getElementById("product-name");
const productPriceInput = document.getElementById("product-price");
const productShopInput = document.getElementById("product-shop");
const productWhatsappInput = document.getElementById("product-whatsapp");
const productCategoryTopInput = document.getElementById("product-category-top");
const productCategoryInput = document.getElementById("product-category");
const uploadCustomCategoryWrap = document.getElementById("upload-custom-category-wrap");
const uploadCustomCategoryInput = document.getElementById("upload-custom-category-input");
const uploadCustomCategoryAddButton = document.getElementById("upload-custom-category-add");
const productImageFileInput = document.getElementById("product-image-file");
const previewList = document.getElementById("image-preview-list");
const uploadButton = document.getElementById("upload-button");

const searchBox = document.getElementById("search-box");
let searchInput = document.getElementById("search-input");
const filterPriceMinInput = document.getElementById("filter-price-min");
const filterPriceMaxInput = document.getElementById("filter-price-max");
const filterLocationInput = document.getElementById("filter-location");
const sortSelect = document.getElementById("sort-select");
const searchDropdown = document.getElementById("search-dropdown");
const categories = document.getElementById("categories");
const mobileCategoryShell = document.getElementById("mobile-category-shell");
const mobileCategoryButton = document.getElementById("mobile-category-button");
const mobileCategoryMenu = document.getElementById("mobile-category-menu");
const navItems = document.querySelectorAll(".nav-item");
const slidesTrack = document.getElementById("slides-track");
const slideDots = document.getElementById("slide-dots");
const slidePrevButton = document.getElementById("slide-prev");
const slideNextButton = document.getElementById("slide-next");
const topBar = document.getElementById("top-bar");
const bottomNav = document.getElementById("bottom-nav");
const postProductFab = document.getElementById("post-product-fab");
const viewHomeBackButton = document.getElementById("view-home-back");

if (searchInput) {
  searchInput.setAttribute("autocomplete", "off");
  searchInput.setAttribute("autocapitalize", "off");
  searchInput.setAttribute("spellcheck", "false");
  searchInput.defaultValue = "";
}

let profileDiv = null;
const runtimeState = createRuntimeState();
const uiRuntimeState = runtimeState.ui;
const searchRuntimeState = runtimeState.search;
const profileRuntimeState = runtimeState.profile;
let availableCategories = [...DEFAULT_PRODUCT_CATEGORIES];
let availableTopCategories = [...DEFAULT_TOP_CATEGORIES];
let currentOrders = { purchases: [], sales: [] };
let currentMessages = [];
let currentNotifications = [];
let currentPromotions = [];
let realtimeChannel = null;
const notificationFeedbackState = {
  recentKeys: new Map(),
  lastVibrationAt: 0,
  browserPermissionRequested: false
};
const savedProductState = {
  storageKey: "",
  ids: new Set(),
  longPressTimer: 0,
  suppressClickUntil: 0,
  activeSheetProductId: "",
  activeSheetSource: ""
};
const imageLightboxState = {
  images: [],
  index: 0,
  alt: "",
  productId: "",
  source: "",
  surface: ""
};
const chatUiState = createChatUiState();
const productDetailUiState = createProductDetailUiState();
let currentReviews = [];
let reviewSummaries = {};
let lastViewedProductId = "";
let recentlyViewedProductIds = [];
let productDiscoveryTrail = [];
let productSeenTimestamps = {};
let pinnedDesktopCategory = "";
let buyerSellerAffinity = {};
let recentCategorySelections = [];
let recentSearchTerms = [];
let recentMessagedProductIds = [];
let homeContinuousDiscoveryRuntime = {
  observer: null,
  batchIndex: 0,
  recentIds: [],
  usedIds: new Set(),
  loading: false,
  seedProductId: "",
  lastHydrateAt: 0
};
const observability = createObservabilityModule({
  emitClientEvent: (payload) => window.WingaDataLayer?.logClientEvent?.(payload),
  consoleObject: console,
  getBaseContext: () => ({
    view: currentView || "home",
    role: currentSession?.role || (currentUser ? "authenticated" : "guest"),
    authState: currentUser ? "signed_in" : "guest"
  })
});
const { reportEvent: reportClientEvent, captureError: captureClientError } = observability;
observability.installGlobalErrorHandlers?.(window);
const getPerfNow = typeof performance !== "undefined" && typeof performance.now === "function"
  ? () => performance.now()
  : () => Date.now();

function reportSlowPath(event, durationMs, context = {}, thresholdMs = 120) {
  if (!Number.isFinite(durationMs) || durationMs < thresholdMs) {
    return;
  }
  reportClientEvent(
    durationMs >= thresholdMs * 2 ? "warn" : "info",
    event,
    "Slow client path detected.",
    {
      ...context,
      durationMs: Math.round(durationMs)
    }
  );
}

function isAdminLoginRoute() {
  const normalizedHash = String(window.location.hash || "").trim().toLowerCase();
  const normalizedPath = String(window.location.pathname || "").trim().replace(/\/+$/, "").toLowerCase();
  return normalizedHash === ADMIN_LOGIN_HASH
    || normalizedHash === "#admin-login"
    || normalizedPath.endsWith("/admin-login");
}

function normalizeProductIdValue(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }
  const stripped = rawValue
    .replace(/^\/+/, "")
    .replace(/^product\/+/i, "");
  return stripped.replace(/^\/+/, "").trim();
}

function canonicalizeProductDetailPath(pathname = window.location.pathname) {
  const normalizedPath = String(pathname || "").trim().replace(/\/+$/, "");
  const match = normalizedPath.match(/^\/product\/(.+)$/i);
  if (!match) {
    return normalizedPath;
  }
  const normalizedId = normalizeProductIdValue(match[1]);
  return normalizedId ? `/product/${encodeURIComponent(normalizedId)}` : "/";
}

function getDeepLinkedProductIdFromRoute() {
  const normalizedPath = canonicalizeProductDetailPath(window.location.pathname);
  const match = String(normalizedPath || "").trim().replace(/\/+$/, "").match(/\/product\/([^/]+)$/i);
  if (!match) {
    return "";
  }
  try {
    return decodeURIComponent(match[1] || "").trim();
  } catch (error) {
    return String(match[1] || "").trim();
  }
}

function getProductDetailPath(productId) {
  const safeId = encodeURIComponent(normalizeProductIdValue(productId));
  return safeId ? `/product/${safeId}` : window.location.pathname;
}

function openDeepLinkedProductRouteIfNeeded() {
  const pathname = String(window.location.pathname || "").trim();
  const canonicalPath = canonicalizeProductDetailPath(pathname);
  if (canonicalPath !== pathname.replace(/\/+$/, "")) {
    window.history.replaceState(window.history.state || null, "", canonicalPath);
  }
  const productId = getDeepLinkedProductIdFromRoute();
  if (!productId) {
    if (String(window.location.pathname || "").trim().match(/^\/product\/.+/i)) {
      window.history.replaceState(window.history.state || null, "", "/");
    }
    if (currentView !== "home") {
      setCurrentViewState("home", { syncHistory: "replace" });
      renderCurrentView();
    }
    return false;
  }
  if (isAuthenticatedUser() && (pendingGuestIntent || getPendingGuestIntent())) {
    return false;
  }
  const product = getProductById(productId);
  if (!product) {
    window.history.replaceState(window.history.state || null, "", "/");
    if (currentView !== "home") {
      setCurrentViewState("home", { syncHistory: "replace" });
    }
    renderCurrentView();
    showInAppNotification({
      title: "Product not found",
      body: "Bidhaa hii haipo tena au link imebadilika. Tumerudisha home salama.",
      variant: "warning"
    });
    return false;
  }
  if (currentView !== "home") {
    setCurrentViewState("home", { syncHistory: "replace" });
  }
  renderCurrentView();
  window.requestAnimationFrame(() => {
    openProductDetailModal(productId, {
      allowBrokenImageFallbackOpen: true
    });
  });
  return true;
}

function setAdminLoginRouteActive(active, options = {}) {
  const { replace = false } = options;
  const nextHash = active ? ADMIN_LOGIN_HASH : "";
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${nextHash}`;
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : null;
    window.history.replaceState(currentState, "", url);
    return;
  }
  window.location.hash = nextHash;
}

function showAdminLoginScreen(options = {}) {
  const { message = "" } = options;
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  appContainer.style.display = "none";
  adminLoginContainer.style.display = "block";
  if (adminLoginTitle) {
    adminLoginTitle.innerText = "Admin Login";
  }
  if (adminLoginCopy) {
    adminLoginCopy.innerText = message || "Mteja na muuzaji wa kawaida wanapaswa kutumia login ya kawaida ya marketplace.";
  }
  if (document.title !== "WINGA Admin Login") {
    document.title = "WINGA Admin Login";
  }
  syncBodyScrollLockState();
  requestAnimationFrame(() => {
    adminLoginIdentifierInput?.focus();
  });
}

function hideAdminLoginScreen() {
  if (adminLoginContainer) {
    adminLoginContainer.style.display = "none";
  }
  if (document.title !== "Chap kwa haraka") {
    document.title = "Chap kwa haraka";
  }
  syncBodyScrollLockState();
}

function syncAuthMode() {
  const isSecuritySignup = !isLogin && !isPasswordRecovery;
  const isRecoveryMode = isPasswordRecovery;
  const isSellerSignup = isSecuritySignup && selectedAuthRole === "seller";
  const isBuyerSignup = isSecuritySignup && selectedAuthRole === "buyer";
  authDetailsStep.style.display = "block";
  if (authCategoryStep) {
    authCategoryStep.style.display = "none";
  }
  authRoleSelector.style.display = isSecuritySignup ? "grid" : "none";
  phoneNumberInput.style.display = isSecuritySignup || isRecoveryMode ? "block" : "none";
  nationalIdInput.style.display = isBuyerSignup || isRecoveryMode ? "block" : "none";
  sellerIdentityDocumentTypeInput.style.display = isSellerSignup ? "block" : "none";
  sellerVerificationUploads.style.display = isSellerSignup ? "grid" : "none";
  if (sellerIdentityDocumentNumberInput) {
    sellerIdentityDocumentNumberInput.style.display = isSellerSignup ? "block" : "none";
    sellerIdentityDocumentNumberInput.required = isSellerSignup;
  }
  confirmPasswordWrap.style.display = isSecuritySignup || isRecoveryMode ? "flex" : "none";
  phoneNumberInput.required = isSecuritySignup || isRecoveryMode;
  nationalIdInput.required = isBuyerSignup || isRecoveryMode;
  sellerIdentityDocumentTypeInput.required = isSellerSignup;
  confirmPasswordInput.required = isSecuritySignup || isRecoveryMode;
  if (authNextButton) {
    authNextButton.style.display = "none";
  }
  if (authBackButton) {
    authBackButton.style.display = "none";
  }
  authButton.style.display = "block";
  usernameInput.placeholder = isLogin
    ? "Username, full name, or phone number"
    : isRecoveryMode
      ? "Username, full name, or phone number"
    : isBuyerSignup
      ? "Full name"
      : "Username";
  formTitle.innerText = isRecoveryMode ? "Recover Password" : (isLogin ? "Login" : "Sign Up");
  authButton.innerText = isRecoveryMode ? "Reset Password" : (isLogin ? "Login" : "Sign Up");
  toggleLink.innerText = isRecoveryMode ? "Rudi kwenye login" : (isLogin ? "Tengeneza akaunti" : "Tayari una akaunti? Ingia");
  if (forgotPasswordLink) {
    forgotPasswordLink.style.display = isLogin ? "block" : "none";
  }

  if (authCategoryNote) {
    authCategoryNote.innerText = isLogin
      ? "Login tumia username, full name, au namba ya simu pamoja na password. Session itaendelea mpaka ulogout."
      : isRecoveryMode
        ? "Weka identifier, namba ya simu, NIDA/ID number, na password mpya. Ukimaliza utaingia tena kwa password mpya."
      : isBuyerSignup
        ? "Jaza taarifa za mteja kisha akaunti itafunguliwa na kukuingiza moja kwa moja kwenye app."
        : "Kwa muuzaji: chagua ID type, andika ID number, upload picha moja ya ID, kisha maliza signup. Category utaichagua wakati wa kupost bidhaa.";
  }

  if (!isSellerSignup) {
    clearPreparedSellerIdentityImage();
  }

  authRoleSelector?.querySelectorAll("[data-auth-role]").forEach((button) => {
    const isSelected = button.dataset.authRole === selectedAuthRole;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (!isSecuritySignup && !isRecoveryMode) {
    confirmPasswordInput.value = "";
    nationalIdInput.value = "";
    sellerIdentityDocumentTypeInput.value = "";
    if (sellerIdentityDocumentNumberInput) sellerIdentityDocumentNumberInput.value = "";
    if (sellerIdentityDocumentImageInput) sellerIdentityDocumentImageInput.value = "";
    if (sellerIdentityDocumentImageName) sellerIdentityDocumentImageName.innerText = "";
    if (sellerIdentityDocumentPreview) {
      updateSellerIdentityDocumentPreview(null);
    }
  }

  [passwordInput, confirmPasswordInput].forEach((input) => {
    input.type = "password";
  });
  if (passwordToggleButton) {
    passwordToggleButton.innerText = isSecuritySignup || isRecoveryMode ? "Show Passwords" : "Show Password";
  }
}

bindHeaderEntryActions();
bindPublicEntryActions();
window.addEventListener("hashchange", handleAccessRouteChange);

toggleLink.addEventListener("click", () => {
  if (isPasswordRecovery) {
    switchToLoginMode(usernameInput.value.trim());
    return;
  }
  isLogin = !isLogin;
  isPasswordRecovery = false;
  authSignupStep = 1;
  selectedAuthRole = "seller";
  syncAuthMode();
});

forgotPasswordLink?.addEventListener("click", () => {
  openPasswordRecoveryMode(usernameInput.value.trim());
});

staffAccessButton?.addEventListener("click", () => {
  setAdminLoginRouteActive(true);
  showAdminLoginScreen({
    message: "Tumia admin au moderator account kuingia kwenye staff access."
  });
});

authRoleSelector?.querySelectorAll("[data-auth-role]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedAuthRole = button.dataset.authRole || "seller";
    authSignupStep = 1;
    authRoleSelector.querySelectorAll("[data-auth-role]").forEach((roleButton) => {
      const isSelected = roleButton.dataset.authRole === selectedAuthRole;
      roleButton.classList.toggle("active", isSelected);
      roleButton.setAttribute("aria-pressed", String(isSelected));
    });
    syncAuthMode();
  });
});

function bindPasswordToggle(button) {
  button?.addEventListener("click", () => {
    const passwordInputs = [passwordInput, confirmPasswordInput].filter((input) =>
      input && (input === passwordInput || confirmPasswordWrap.style.display !== "none")
    );
    const isHidden = passwordInputs.some((input) => input.type === "password");
    passwordInputs.forEach((input) => {
      input.type = isHidden ? "text" : "password";
    });
    button.innerText = isHidden
      ? (confirmPasswordWrap.style.display !== "none" ? "Hide Passwords" : "Hide Password")
      : (confirmPasswordWrap.style.display !== "none" ? "Show Passwords" : "Show Password");
  });
}

bindPasswordToggle(passwordToggleButton);

phoneNumberInput.addEventListener("blur", () => {
  phoneNumberInput.value = normalizePhoneNumber(phoneNumberInput.value);
});

nationalIdInput.addEventListener("blur", () => {
  nationalIdInput.value = normalizeNationalId(nationalIdInput.value);
});

sellerIdentityDocumentNumberInput?.addEventListener("blur", () => {
  sellerIdentityDocumentNumberInput.value = normalizeNationalId(sellerIdentityDocumentNumberInput.value);
});

sellerIdentityDocumentImageInput?.addEventListener("change", () => {
  const file = sellerIdentityDocumentImageInput.files?.[0];
  try {
    clearPreparedSellerIdentityImage();
    if (file) {
      validateSellerIdentityImageFile(file);
    }
    if (sellerIdentityDocumentImageName) {
      sellerIdentityDocumentImageName.innerText = file ? file.name : "";
    }
    updateSellerIdentityDocumentPreview(file || null);
    if (file) {
      primeSellerSignupIdentityImage(file).catch((error) => {
        captureClientError("seller_identity_image_prime_failed", error, {
          fileName: file.name || "",
          size: file.size || 0
        });
      });
    }
  } catch (error) {
    sellerIdentityDocumentImageInput.value = "";
    clearPreparedSellerIdentityImage();
    if (sellerIdentityDocumentImageName) {
      sellerIdentityDocumentImageName.innerText = "";
    }
    updateSellerIdentityDocumentPreview(null);
    alert(error.message || "Please upload a valid ID image");
  }
});

authNextButton?.addEventListener("click", () => {});

authBackButton?.addEventListener("click", () => {});

adminLoginBackButton?.addEventListener("click", () => {
  setAdminLoginRouteActive(false);
  hideAdminLoginScreen();
  appContainer.style.display = "block";
  refreshPublicEntryChrome();
  setCurrentViewState("home");
  renderCurrentView();
});

adminLoginButton?.addEventListener("click", async () => {
  if (adminAuthRequestPending) {
    return;
  }
  const identifier = adminLoginIdentifierInput?.value.trim() || "";
  const password = adminLoginPasswordInput?.value.trim() || "";
  if (!identifier || !password) {
    showInAppNotification({
      title: "Admin login required",
      body: "Jaza identifier na password ya admin au moderator.",
      variant: "warning"
    });
    return;
  }

  let user = null;
  adminAuthRequestPending = true;
  setAuthInteractionPending("admin", true);
  try {
    user = await window.WingaDataLayer.adminLogin({ identifier, username: identifier, password });
  } catch (error) {
    captureClientError("admin_login_failed", error, {
      identifier
    });
    showInAppNotification({
      title: "Admin login failed",
      body: error.message || "Taarifa za admin login si sahihi.",
      variant: "error"
    });
    showAdminLoginScreen({
      message: "Tumia admin au moderator account halali. Mteja na muuzaji wa kawaida wanapaswa kutumia login ya kawaida."
    });
    adminAuthRequestPending = false;
    setAuthInteractionPending("admin", false);
    return;
  }

  try {
    clearAppViewState();
    setAdminLoginRouteActive(false, { replace: true });
    hideAdminLoginScreen();
    loginSuccess(user.username, "", user, {
      restoreView: false,
      skipWelcome: true,
      forceView: "admin"
    });
    showInAppNotification({
      title: "Admin access granted",
      body: isStaffRole(user.role) && user.role === "moderator"
        ? "Moderator session imefunguliwa."
        : "Admin session imefunguliwa.",
      variant: "success"
    });
  } catch (error) {
    captureClientError("admin_session_boot_failed", error, {
      identifier,
      username: user?.username || ""
    });
    clearSessionUser();
    applySessionState(null);
    setAdminLoginRouteActive(true, { replace: true });
    showAdminLoginScreen({
      message: "Admin account imethibitishwa lakini admin surface imeshindwa kufunguka. Jaribu tena."
    });
    showInAppNotification({
      title: "Admin view failed",
      body: "Session ya admin haijaendelea kwa sababu admin surface imekosa kufunguka vizuri.",
      variant: "error"
    });
  } finally {
    adminAuthRequestPending = false;
    setAuthInteractionPending("admin", false);
  }
});

searchImageButton.addEventListener("click", () => {
  searchImageFileInput.click();
});

uploadCustomCategoryAddButton.addEventListener("click", async () => {
  if (!supportsFlexibleSubcategory(productCategoryTopInput.value)) {
    uploadCustomCategoryWrap.style.display = "none";
    return;
  }

  try {
    const createdCategory = await createCustomCategory(uploadCustomCategoryInput.value, {
      topValue: productCategoryTopInput.value
    });
    renderUploadCategoryOptions();
    productCategoryInput.value = createdCategory.value;
    uploadCustomCategoryInput.value = createdCategory.label;
    showInAppNotification({
      title: "Subcategory ready",
      body: `${createdCategory.label} imeongezwa kwenye Vitu Used.`,
      variant: "success"
    });
  } catch (error) {
    showInAppNotification({
      title: "Subcategory failed",
      body: error.message || "Imeshindikana kuongeza subcategory ya Vitu Used.",
      variant: "error"
    });
  }
});

uploadCustomCategoryInput.addEventListener("input", () => {
  if (supportsFlexibleSubcategory(productCategoryTopInput.value)) {
    productCategoryInput.value = "";
  }
});

productCategoryTopInput.addEventListener("change", () => {
  productCategoryInput.value = "";
  uploadCustomCategoryInput.value = "";
  renderUploadCategoryOptions();
});

productCategoryInput.addEventListener("change", () => {
  if (supportsFlexibleSubcategory(productCategoryTopInput.value) && productCategoryInput.value) {
    uploadCustomCategoryInput.value = getCategoryLabel(productCategoryInput.value);
    uploadCustomCategoryWrap.style.display = "grid";
    return;
  }
  if (!supportsFlexibleSubcategory(productCategoryTopInput.value)) {
    uploadCustomCategoryWrap.style.display = "none";
  }
  uploadCustomCategoryInput.value = "";
});

authButton.addEventListener("click", async () => {
  if (publicAuthRequestPending || publicAuthTransitionPending) {
    return;
  }
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  publicAuthRequestPending = true;
  setAuthInteractionPending("public", true);
  if (isLogin) {
    if (!username || !password) {
      releasePublicAuthPendingState();
      alert("Jaza identifier na password.");
      return;
    }

    try {
      const user = await window.WingaDataLayer.login({ identifier: username, username, password });
      if (isStaffRole(user.role)) {
        captureClientError("staff_login_via_public_auth_blocked", new Error("Staff account attempted public auth flow."), {
          username: user.username
        });
        showInAppNotification({
          title: "Use admin access route",
          body: "Admin au moderator wanapaswa kuingia kupitia route ya admin login pekee.",
          variant: "warning"
        });
        setAdminLoginRouteActive(true);
        showAdminLoginScreen({
          message: "Admin au moderator wanapaswa kuingia kupitia route hii ya staff access."
        });
        releasePublicAuthPendingState();
        return;
      }
      clearAppViewState();
      loginSuccess(user.username, "", user, { restoreView: false });
    } catch (error) {
      const errorMessage = error.message || "Taarifa za login si sahihi. Hakikisha identifier na password yako ni sahihi.";
      if (/admin login route|admin au moderator/i.test(errorMessage)) {
        setAdminLoginRouteActive(true);
        showAdminLoginScreen({
          message: "Admin au moderator wanapaswa kuingia kupitia route hii ya staff access."
        });
        showInAppNotification({
          title: "Use admin access route",
          body: errorMessage,
          variant: "warning"
        });
        releasePublicAuthPendingState();
        return;
      }
      alert(errorMessage);
    } finally {
      releasePublicAuthPendingState();
    }
    return;
  }

  if (isPasswordRecovery) {
    const phoneNumber = normalizePhoneNumber(phoneNumberInput.value);
    const nationalId = normalizeNationalId(nationalIdInput.value);
    const passwordMinLength = getAuthPasswordMinLength();

    if (!username || !phoneNumber || !nationalId || !password || !confirmPassword) {
      releasePublicAuthPendingState();
      alert("Jaza identifier, namba ya simu, NIDA/ID number, password mpya, na confirm password.");
      return;
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      releasePublicAuthPendingState();
      alert("Weka namba ya simu sahihi.");
      return;
    }
    if (!isValidNationalId(nationalId)) {
      releasePublicAuthPendingState();
      alert("Weka NIDA/ID number sahihi.");
      return;
    }
    if (password.length < passwordMinLength) {
      releasePublicAuthPendingState();
      alert(`Password inapaswa kuwa angalau herufi ${passwordMinLength}.`);
      return;
    }
    if (password !== confirmPassword) {
      releasePublicAuthPendingState();
      alert("Password na confirm password hazifanani.");
      return;
    }

    try {
      await window.WingaDataLayer.recoverPassword({
        identifier: username,
        username,
        phoneNumber,
        nationalId,
        newPassword: password
      });
      showInAppNotification({
        title: "Password updated",
        body: "Password yako imebadilishwa. Ingia tena kutumia password mpya.",
        variant: "success"
      });
      switchToLoginMode(username);
    } catch (error) {
      showInAppNotification({
        title: "Recovery failed",
        body: error.message || "Imeshindikana kubadilisha password kwa sasa.",
        variant: "error"
      });
    } finally {
      releasePublicAuthPendingState();
    }
    return;
  }

  let signupValidationError = "";
  try {
    signupValidationError = validateAuthSignupInput();
  } catch (error) {
    releasePublicAuthPendingState();
    captureClientError("signup_validation_crashed", error, {
      role: selectedAuthRole
    });
    showInAppNotification({
      title: "Sign up failed",
      body: "Kulitokea tatizo wakati wa kuhakiki taarifa zako. Tafadhali jaribu tena.",
      variant: "error"
    });
    return;
  }
  if (signupValidationError) {
    releasePublicAuthPendingState();
    alert(signupValidationError);
    return;
  }

  const phoneNumber = normalizePhoneNumber(phoneNumberInput.value);
  const sellerIdentityNumber = normalizeNationalId(sellerIdentityDocumentNumberInput?.value || "");
  const buyerNationalId = normalizeNationalId(nationalIdInput.value);
  const nationalId = selectedAuthRole === "seller" ? sellerIdentityNumber : buyerNationalId;

  try {
    const sellerIdentityDocumentImage = selectedAuthRole === "seller"
      ? await resolveSellerSignupIdentityImage(sellerIdentityDocumentImageInput?.files?.[0])
      : "";
    const sellerIdentityDocumentNumber = selectedAuthRole === "seller"
      ? normalizeNationalId(sellerIdentityDocumentNumberInput?.value || "")
      : "";
    const user = await window.WingaDataLayer.signup({
      username: selectedAuthRole === "seller" ? username : "",
      fullName: username,
      password,
      phoneNumber,
      nationalId,
      role: selectedAuthRole,
      profileImage: "",
      id_type: selectedAuthRole === "seller" ? sellerIdentityDocumentTypeInput.value : "",
      id_number: selectedAuthRole === "seller" ? sellerIdentityDocumentNumber : "",
      id_image: selectedAuthRole === "seller" ? sellerIdentityDocumentImage : "",
      identityDocumentType: selectedAuthRole === "seller" ? sellerIdentityDocumentTypeInput.value : "",
      identityDocumentNumber: selectedAuthRole === "seller" ? sellerIdentityDocumentNumber : "",
      identityDocumentImage: selectedAuthRole === "seller" ? sellerIdentityDocumentImage : ""
    });
    releasePublicAuthPendingState();
    publicAuthTransitionPending = true;
    setAuthInteractionPending("public", true, {
      buttonText: "Inaingia...",
      noteText: "Akaunti imeundwa. Tunaingia sasa..."
    });
    await waitForNextPaint();
    try {
      showInAppNotification({
        title: "Welcome to Winga",
        body: "Akaunti imeundwa. Unaingia moja kwa moja.",
        variant: "success"
      });
      authSignupStep = 1;
      clearAppViewState();
      loginSuccess(user.username, "", {
        ...user,
        primaryCategory: ""
      }, {
        restoreView: false,
        deferRender: true
      });
    } catch (transitionError) {
      captureClientError("signup_completion_transition_failed", transitionError, {
        username: user?.username || "",
        role: selectedAuthRole
      });
      publicAuthTransitionPending = false;
      releasePublicAuthPendingState();
      switchToLoginMode(user?.username || phoneNumber);
      showInAppNotification({
        title: "Account created",
        body: "Akaunti imetengenezwa lakini haikuingia moja kwa moja. Login sasa kuendelea.",
        variant: "warning"
      });
      return;
    }
  } catch (error) {
    publicAuthTransitionPending = false;
    showInAppNotification({
      title: "Sign up failed",
      body: error.message || "Imeshindikana kusajili akaunti.",
      variant: "error"
    });
  } finally {
    publicAuthTransitionPending = false;
    releasePublicAuthPendingState();
  }
});

uploadButton.addEventListener("click", async () => {
  if (!canUseSellerFeatures()) {
    alert("Akaunti ya mteja haiwezi kupost bidhaa.");
    setCurrentViewState("home");
    renderCurrentView();
    return;
  }

  const name = productNameInput.value.trim();
  const rawPrice = productPriceInput.value.trim();
  const price = rawPrice ? Number(rawPrice) : null;
  const shop = productShopInput.value.trim();
  const whatsapp = getCurrentWhatsappNumber();
  const topCategory = productCategoryTopInput.value;
  const category = productCategoryInput.value;
  const selectedFiles = Array.from(productImageFileInput.files || []);
  const existingProduct = editingProductId ? getProductById(editingProductId) : null;

  if (name.length < 3) {
    alert("Jaza jina la bidhaa lenye angalau herufi 3.");
    return;
  }

  if (rawPrice && (Number.isNaN(price) || price < 500 || price > 1000000000)) {
    alert("Weka bei sahihi kuanzia TSh 500 au zaidi.");
    return;
  }

  if (shop.length < 2) {
    alert("Jaza jina la duka vizuri.");
    return;
  }

  if (whatsapp.length < 10) {
    alert("Kabla ya kupost bidhaa, akaunti yako lazima iwe na namba halali ya WhatsApp. Hiyo ndiyo itafunguliwa mteja akibonyeza WhatsApp.");
    return;
  }

  if (!topCategory) {
    alert("Chagua category kuu ya bidhaa kwanza.");
    return;
  }

  if (!category) {
    alert("Chagua subcategory ya bidhaa kwanza.");
    return;
  }

  if (!isValidProductCategory(category)) {
    alert("Category ya bidhaa si sahihi.");
    return;
  }

  if (selectedFiles.length === 0 && !existingProduct) {
    alert("Chagua picha angalau moja ya bidhaa.");
    return;
  }

  const finalizeSave = async (imageValues) => {
    const safeImages = Array.isArray(imageValues) && imageValues.length > 0
      ? imageValues
      : (existingProduct?.images || [existingProduct?.image].filter(Boolean));
    const imageSignature = safeImages[0]
      ? await createImageSignatureFromSource(safeImages[0]).catch(() => existingProduct?.imageSignature || "")
      : (existingProduct?.imageSignature || "");

    const productPayload = {
      id: editingProductId || createId(),
      name,
      price,
      shop,
      whatsapp,
      image: safeImages[0] || "",
      images: safeImages,
      imageSignature,
      uploadedBy: currentUser,
      category,
      status: existingProduct?.status || "approved",
      likes: existingProduct ? existingProduct.likes : 0,
      views: existingProduct ? existingProduct.views : 0,
      viewedBy: existingProduct ? existingProduct.viewedBy || [] : []
    };

    if (editingProductId) {
      await window.WingaDataLayer.updateProduct(editingProductId, productPayload);
    } else {
      await window.WingaDataLayer.createProduct(productPayload);
    }

    refreshProductsFromStore();
    const primaryCategory = inferTopCategoryValue(category) || category;
    await window.WingaDataLayer.updateUserPrimaryCategory(currentUser, primaryCategory);
    clearUploadForm();
    applySelectedCategory(primaryCategory);
    setCurrentViewState("home");
    renderCurrentView();
    reportClientEvent("info", editingProductId ? "product_updated" : "product_created", "Seller saved a product successfully.", {
      productId: productPayload.id,
      category: primaryCategory
    });
    showInAppNotification({
      title: editingProductId ? "Product updated" : "Product submitted",
      body: editingProductId
        ? "Mabadiliko ya bidhaa yako yamehifadhiwa na yanaonekana tayari sokoni."
        : "Bidhaa yako imehifadhiwa na inaonekana tayari kwenye market home.",
      variant: "success"
    });
  };

  try {
    if (selectedFiles.length > 0) {
      validateImageFiles(selectedFiles);
      const images = await readFilesAsDataUrls(selectedFiles);
      await finalizeSave(images);
      return;
    }

    await finalizeSave(existingProduct.images || [existingProduct.image].filter(Boolean));
  } catch (error) {
    captureClientError("product_save_failed", error, {
      editingProductId: editingProductId || ""
    });
    showInAppNotification({
      title: "Product save failed",
      body: error.message || "Imeshindikana kupost bidhaa.",
      variant: "error"
    });
  }
});

cancelEditButton.addEventListener("click", () => {
  clearUploadForm();
  setCurrentViewState("profile", {
    syncHistory: "replace"
  });
  renderCurrentView();
});

productImageFileInput.addEventListener("change", async () => {
  const files = Array.from(productImageFileInput.files || []);
  if (files.length === 0) {
    previewList.replaceChildren();
    previewList.style.display = "none";
    return;
  }

  try {
    validateImageFiles(files);
    await renderPreviewFiles(files);
  } catch (error) {
    showInAppNotification({
      title: "Image selection failed",
      body: error.message || "Picha ulizochagua si sahihi.",
      variant: "error"
    });
    productImageFileInput.value = "";
    previewList.replaceChildren();
    previewList.style.display = "none";
  }
});

searchToggleButton.addEventListener("click", () => {
  if (!isAuthenticatedUser()) {
    promptGuestAuth({
      preferredMode: "signup",
      role: "buyer",
      title: "Create an account or sign in to continue",
      message: "Search and advanced filters are available for members."
    });
    return;
  }
  if (getViewportWidth() <= 720) {
    searchRuntimeState.isMobileSearchOpen = !searchRuntimeState.isMobileSearchOpen;
    searchBox.classList.toggle("mobile-open", searchRuntimeState.isMobileSearchOpen);
    searchRuntimeState.isInputFocused = searchRuntimeState.isMobileSearchOpen;
    syncSearchChromeState();
    syncMobileHeaderVisibility(true);
  }
  setCurrentViewState("home");
  renderCurrentView();
  searchInput.focus();
});
bindSearchInputHandlers(searchInput);

[filterPriceMinInput, filterPriceMaxInput, filterLocationInput, sortSelect].filter(Boolean).forEach((field) => {
  field.addEventListener("input", () => {
    if (!isAuthenticatedUser()) {
      field.value = field.tagName === "SELECT" ? "default" : "";
      promptGuestAuth({
        preferredMode: "signup",
        role: "buyer",
        title: "Create an account or sign in to continue",
        message: "Search and advanced filters are available for members."
      });
      return;
    }
    searchRuntimeState.isSearchDropdownDismissed = false;
    setCurrentViewState("home", { persist: false });
    scheduleSearchDrivenRender(field.tagName === "SELECT" ? 0 : 120);
  });
  field.addEventListener("change", () => {
    if (!isAuthenticatedUser()) {
      field.value = field.tagName === "SELECT" ? "default" : "";
      promptGuestAuth({
        preferredMode: "signup",
        role: "buyer",
        title: "Create an account or sign in to continue",
        message: "Search and advanced filters are available for members."
      });
      return;
    }
    searchRuntimeState.isSearchDropdownDismissed = false;
    setCurrentViewState("home", { persist: false });
    scheduleSearchDrivenRender(0);
  });
});

mobileCategoryButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMobileCategoryMenu();
});

document.addEventListener("pointerdown", (event) => {
  if (!searchRuntimeState.isMobileCategoryOpen) {
    return;
  }
  if (mobileCategoryShell?.contains(event.target)) {
    return;
  }
  closeMobileCategoryMenu();
}, true);

document.addEventListener("click", (event) => {
  if (!mobileCategoryShell?.contains(event.target)) {
    closeMobileCategoryMenu();
  }

  if (getViewportWidth() > 720 && pinnedDesktopCategory && !categories?.contains(event.target)) {
    closePinnedDesktopCategoryMenu();
  }

  if (!headerUserMenu?.contains(event.target)) {
    toggleHeaderUserMenu(false);
  }

  if (!searchBox?.contains(event.target)) {
    searchRuntimeState.isSearchDropdownDismissed = true;
    searchDropdown?.classList.remove("open");
  }
});

function handleWindowResize() {
  toggleHeaderUserMenu(false);
  if (getViewportWidth() > 720) {
    closeMobileCategoryMenu();
    searchRuntimeState.isMobileSearchOpen = false;
    searchBox.classList.remove("mobile-open");
  } else {
    closePinnedDesktopCategoryMenu({ rerender: false });
  }
  scheduleChromeOffsetSync();
}

window.addEventListener("resize", handleWindowResize);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeContextChatModal();
    closeProductDetailModal();
  }
});

searchImageFileInput.addEventListener("change", async () => {
  const [file] = Array.from(searchImageFileInput.files || []);
  if (!file) {
    return;
  }

  try {
    validateImageFiles([file]);
    const [imageDataUrl] = await readFilesAsDataUrls([file]);
    await hydrateMissingImageSignatures(products.filter((product) => product.status === "approved"));
    searchRuntimeState.activeImageSearch = {
      name: file.name,
      previewSrc: imageDataUrl,
      signature: await createImageSignatureFromSource(imageDataUrl)
    };
    setCurrentViewState("home");
    renderCurrentView();
  } catch (error) {
    captureClientError("image_search_failed", error, {
      fileName: file?.name || ""
    });
    alert(error.message || "Image search imeshindikana.");
  } finally {
    searchImageFileInput.value = "";
  }
});

bindPrimaryNav();

postProductFab?.addEventListener("click", () => {
  if (!canUseSellerFeatures() || isStaffUser()) {
    return;
  }
  reportClientEvent("info", "post_product_fab_clicked", "Seller opened upload flow from floating action button.", {
    category: "app",
    view: currentView
  });
  if (!editingProductId) {
    clearUploadForm();
  }
  setCurrentViewState("upload", {
    syncHistory: "push"
  });
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

viewHomeBackButton?.addEventListener("click", () => {
  reportClientEvent("info", "view_home_back_clicked", "User returned home from an in-app view.", {
    fromView: currentView,
    role: currentSession?.role || ""
  });
  toggleHeaderUserMenu(false);
  resetHomeBrowseState();
  setCurrentViewState("home", {
    syncHistory: "push"
  });
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", () => {
  if (getViewportWidth() <= 720) {
    scheduleMobileHeaderScrollSync();
  }
}, { passive: true });

function handleAppLifecycleChange() {
  if (document.hidden) {
    stopSlideshow();
    disconnectContinuousDiscoveryObserver();
    stopMessagePolling();
    return;
  }

  if (currentView === "home" || currentView === "profile") {
    scheduleRenderCurrentView();
  }
}

document.addEventListener("visibilitychange", handleAppLifecycleChange);
window.addEventListener("pagehide", () => {
  stopSlideshow();
  disconnectContinuousDiscoveryObserver();
  stopMessagePolling();
});

window.addEventListener("resize", () => {
  syncMobileCategorySheetOffset();
  syncMobileHeaderVisibility(true);
});

function inferUserCategory(username) {
  const categoryCounts = products
    .filter((product) => product.uploadedBy === username && product.category)
    .reduce((accumulator, product) => {
      const key = inferTopCategoryValue(product.category) || product.category;
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

  const sortedCategories = Object.entries(categoryCounts).sort((first, second) => second[1] - first[1]);
  return sortedCategories[0]?.[0] || "";
}

function getUserPrimaryCategory(username) {
  const users = getUsers();
  const user = users.find((item) => item.username === username);
  return user?.primaryCategory || "";
}

function applySelectedCategory(category) {
  setCategorySelectionState(category || "all", {
    expandedBrowseCategory: isTopCategoryValue(category || "all")
      ? (category || "all")
      : inferTopCategoryValue(category || "all")
  });
  noteCategoryInterest(selectedCategory);
  renderFilterCategories();
}

function resetHomeBrowseState() {
  if (searchInput) {
    searchInput.value = "";
    searchInput.defaultValue = "";
    searchInput.setAttribute("value", "");
  }
  if (filterPriceMinInput) {
    filterPriceMinInput.value = "";
  }
  if (filterPriceMaxInput) {
    filterPriceMaxInput.value = "";
  }
  if (filterLocationInput) {
    filterLocationInput.value = "";
  }
  if (sortSelect) {
    sortSelect.value = "default";
  }
  searchRuntimeState.activeImageSearch = null;
  searchRuntimeState.isSearchDropdownDismissed = false;
  searchRuntimeState.isMobileSearchOpen = false;
  searchBox?.classList.remove("mobile-open");
  setCategorySelectionState("all", {
    expandedBrowseCategory: ""
  });
  closeMobileCategoryMenu();
}

function bindSearchInputHandlers(node) {
  if (!node || node.dataset.searchHandlersBound === "true") {
    return;
  }
  node.dataset.searchHandlersBound = "true";

  node.addEventListener("input", () => {
    if (!isAuthenticatedUser()) {
      node.value = "";
      promptGuestAuth({
        preferredMode: "signup",
        role: "buyer",
        title: "Create an account or sign in to continue",
        message: "Search and advanced filters are available for members."
      });
      return;
    }
    searchRuntimeState.isSearchDropdownDismissed = false;
    searchRuntimeState.isInputFocused = true;
    syncSearchChromeState();
    noteSearchInterest(node.value);
    scheduleSearchDrivenRender(120);
  });

  node.addEventListener("focus", () => {
    if (!isAuthenticatedUser()) {
      promptGuestAuth({
        preferredMode: "signup",
        role: "buyer",
        title: "Create an account or sign in to continue",
        message: "Search and advanced filters are available for members."
      });
      node.blur();
      return;
    }
    searchRuntimeState.isSearchDropdownDismissed = false;
    searchRuntimeState.isInputFocused = true;
    syncSearchChromeState();
    scheduleSearchDrivenRender(0);
  });

  node.addEventListener("blur", () => {
    window.setTimeout(() => {
      searchRuntimeState.isInputFocused = false;
      if (!node.value.trim() && !searchRuntimeState.activeImageSearch?.signature) {
        searchRuntimeState.isMobileSearchOpen = false;
        searchBox.classList.remove("mobile-open");
      }
      syncSearchChromeState();
      scheduleSearchDrivenRender(0);
    }, 120);
  });
}

function refreshSearchInputControl() {
  if (!searchInput) {
    return;
  }
  const replacement = searchInput.cloneNode(true);
  replacement.removeAttribute("data-search-handlers-bound");
  replacement.removeAttribute("value");
  replacement.value = "";
  replacement.defaultValue = "";
  replacement.setAttribute("autocomplete", "off");
  replacement.setAttribute("autocapitalize", "off");
  replacement.setAttribute("spellcheck", "false");
  searchInput.replaceWith(replacement);
  searchInput = replacement;
  bindSearchInputHandlers(searchInput);
}

function productMatchesSelectedCategory(product, categoryValue) {
  if (!categoryValue || categoryValue === "all") {
    return true;
  }

  const productTopCategory = inferTopCategoryValue(product.category);
  return product.category === categoryValue || productTopCategory === categoryValue;
}

function isTopCategoryValue(categoryValue) {
  return availableTopCategories.some((item) => item.value === categoryValue);
}

function resetAuthCategorySelection() {
  authSignupStep = 1;
}

function loadImageFromSource(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Picha haikusomeka vizuri."));
    image.src = source;
  });
}

async function createImageSignatureFromSource(source) {
  const image = await loadImageFromSource(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = IMAGE_HASH_SIZE;
  canvas.height = IMAGE_HASH_SIZE;
  context.drawImage(image, 0, 0, IMAGE_HASH_SIZE, IMAGE_HASH_SIZE);
  const pixels = context.getImageData(0, 0, IMAGE_HASH_SIZE, IMAGE_HASH_SIZE).data;
  const brightness = [];

  for (let index = 0; index < pixels.length; index += 4) {
    brightness.push(
      Math.round((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114))
    );
  }

  const average = brightness.reduce((sum, value) => sum + value, 0) / Math.max(brightness.length, 1);
  return brightness.map((value) => (value >= average ? "1" : "0")).join("");
}

function getImageSimilarityScore(firstSignature, secondSignature) {
  if (!firstSignature || !secondSignature || firstSignature.length !== secondSignature.length) {
    return 0;
  }

  let matches = 0;
  for (let index = 0; index < firstSignature.length; index += 1) {
    if (firstSignature[index] === secondSignature[index]) {
      matches += 1;
    }
  }
  return matches / firstSignature.length;
}

function getComparableProductKey(product) {
  return `${normalizeProductLookupKey(product.name)}::${product.category || "other"}`;
}

function getAlternativeOffers(product) {
  const comparableKey = getComparableProductKey(product);
  return products
    .filter((item) =>
      item.id !== product.id &&
      item.status === "approved" &&
      item.shop !== product.shop &&
      getComparableProductKey(item) === comparableKey
    )
    .sort((first, second) => compareProductsByPrice(first, second, "asc"))
    .slice(0, 3);
}

function slugifyCategoryLabel(label) {
  return String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function humanizeCategoryValue(value) {
  return String(value || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function normalizeCategoryLabelText(label) {
  return String(label || "").trim().replace(/\s+/g, " ");
}

function formatTopCategoryLabel(label) {
  return normalizeCategoryLabelText(label).toUpperCase();
}

function formatSubcategoryLabel(label) {
  const normalized = normalizeCategoryLabelText(label).toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "";
}

function getDefaultTopCategory(value) {
  return DEFAULT_TOP_CATEGORIES.find((item) => item.value === value) || null;
}

function getDefaultProductCategory(value) {
  return DEFAULT_PRODUCT_CATEGORIES.find((item) => item.value === value) || LEGACY_CATEGORY_MAPPINGS[value] || null;
}

function inferTopCategoryValue(value) {
  const safeValue = slugifyCategoryLabel(value);
  if (!safeValue) {
    return "";
  }

  if (getDefaultTopCategory(safeValue)) {
    return safeValue;
  }

  const exactProductCategory = getDefaultProductCategory(safeValue);
  if (exactProductCategory?.topValue) {
    return exactProductCategory.topValue;
  }

  const prefixedCategory = DEFAULT_TOP_CATEGORIES.find((item) => safeValue.startsWith(`${item.value}-`));
  return prefixedCategory?.value || "";
}

function normalizeCategoryEntry(entry) {
  if (!entry) {
    return null;
  }

  const rawLabel = typeof entry.label === "string" ? entry.label.trim() : "";
  const rawValue = typeof entry.value === "string" ? entry.value.trim() : "";
  const normalizedValue = slugifyCategoryLabel(rawValue || rawLabel);
  const defaultProductCategory = getDefaultProductCategory(normalizedValue);
  const value = defaultProductCategory?.value || normalizedValue;
  const topValue = inferTopCategoryValue(entry.topValue || value);
  const topCategory = getDefaultTopCategory(topValue);
  const label = formatSubcategoryLabel(rawLabel || defaultProductCategory?.label || humanizeCategoryValue(value));
  const topLabel = formatTopCategoryLabel(defaultProductCategory?.topLabel || topCategory?.label || humanizeCategoryValue(topValue));

  if (!value || !label) {
    return null;
  }

  return {
    value,
    label,
    topValue: defaultProductCategory?.topValue || topValue,
    topLabel
  };
}

function normalizeTopCategoryEntry(entry) {
  const normalized = normalizeCategoryEntry(entry);
  if (!normalized) {
    return null;
  }

  const topValue = normalized.topValue || normalized.value;
  const topCategory = getDefaultTopCategory(topValue);
  return {
    value: topValue,
    label: formatTopCategoryLabel(normalized.topLabel || topCategory?.label || normalized.label)
  };
}

function mergeAvailableCategories(...categoryLists) {
  const categoryMap = new Map();
  [...DEFAULT_PRODUCT_CATEGORIES, ...categoryLists.flat()]
    .map(normalizeCategoryEntry)
    .filter(Boolean)
    .forEach((category) => {
      if (!categoryMap.has(category.value)) {
        categoryMap.set(category.value, category);
      }
    });
  availableCategories = Array.from(categoryMap.values());

  const topCategoryMap = new Map();
  [...DEFAULT_TOP_CATEGORIES, ...availableCategories.map((category) => normalizeTopCategoryEntry(category))]
    .filter(Boolean)
    .forEach((category) => {
      if (category.value === "other") {
        return;
      }
      if (!topCategoryMap.has(category.value)) {
        topCategoryMap.set(category.value, category);
      }
    });
  availableTopCategories = Array.from(topCategoryMap.values());
}

function getSubcategoriesForTopCategory(topValue) {
  return availableCategories.filter((category) =>
    category.topValue === topValue && category.value !== topValue
  );
}

function getSelectableSubcategoriesForTopCategory(topValue) {
  const safeTopValue = String(topValue || "").trim();
  const defaultSubcategories = DEFAULT_PRODUCT_CATEGORIES.filter((category) => category.topValue === safeTopValue);
  if (!supportsFlexibleSubcategory(safeTopValue)) {
    return defaultSubcategories;
  }

  const categoryMap = new Map();
  [...defaultSubcategories, ...getSubcategoriesForTopCategory(safeTopValue)]
    .map(normalizeCategoryEntry)
    .filter(Boolean)
    .forEach((category) => {
      if (category.value === safeTopValue || category.topValue !== safeTopValue || categoryMap.has(category.value)) {
        return;
      }
      categoryMap.set(category.value, category);
    });
  return Array.from(categoryMap.values());
}

function getCategoryPreviewProduct(topValue) {
  if (!topValue) {
    return null;
  }

  return products.find((product) =>
    inferTopCategoryValue(product?.category) === topValue
    && typeof product.image === "string"
    && product.image.trim()
  ) || null;
}

function inferCategoriesFromData() {
  return [
    ...window.WingaDataLayer.getCategories().map((category) => normalizeCategoryEntry(category)),
    ...products.map((product) => ({ value: product.category, label: product.category })),
    ...getUsers().map((user) => ({ value: user.primaryCategory, label: user.primaryCategory }))
  ].filter(Boolean);
}

function renderUploadCategoryOptions() {
  const currentValue = productCategoryInput.value;
  const currentTopValue = productCategoryTopInput.value;
  const selectedTopValue = currentTopValue || inferTopCategoryValue(currentValue) || "";

  productCategoryTopInput.replaceChildren(
    createElement("option", { textContent: "Chagua category kuu", attributes: { value: "" } }),
    ...DEFAULT_TOP_CATEGORIES.map((category) =>
      createElement("option", {
        textContent: category.label,
        attributes: { value: category.value }
      })
    )
  );
  productCategoryTopInput.value = DEFAULT_TOP_CATEGORIES.some((category) => category.value === selectedTopValue)
    ? selectedTopValue
    : "";

  const subcategories = getSelectableSubcategoriesForTopCategory(productCategoryTopInput.value);
  const hasCurrentLegacyValue = currentValue && !subcategories.some((category) => category.value === currentValue);
  productCategoryInput.replaceChildren(
    createElement("option", { textContent: "Chagua subcategory ya bidhaa", attributes: { value: "" } }),
    ...subcategories.map((category) =>
      createElement("option", {
        textContent: category.label,
        attributes: { value: category.value }
      })
    ),
    ...(hasCurrentLegacyValue ? [createElement("option", {
      textContent: getCategoryLabel(currentValue),
      attributes: { value: currentValue }
    })] : [])
  );
  productCategoryInput.value = subcategories.some((category) => category.value === currentValue)
    ? currentValue
    : (hasCurrentLegacyValue ? currentValue : "");
  productCategoryInput.style.display = "";
  uploadCustomCategoryWrap.style.display = supportsFlexibleSubcategory(productCategoryTopInput.value) ? "grid" : "none";
  uploadCustomCategoryInput.placeholder = supportsFlexibleSubcategory(productCategoryTopInput.value)
    ? "Mfano: Simu, Nguo, Kiatu"
    : "Andika subcategory mpya";
  if (supportsFlexibleSubcategory(productCategoryTopInput.value) && productCategoryInput.value) {
    uploadCustomCategoryInput.value = getCategoryLabel(productCategoryInput.value);
  } else if (!supportsFlexibleSubcategory(productCategoryTopInput.value)) {
    uploadCustomCategoryInput.value = "";
  }
}

function refreshCategoryUI() {
  renderFilterCategories();
  renderUploadCategoryOptions();
}

async function createCustomCategory(label, options = {}) {
  const safeLabel = String(label || "").trim();
  const selectedTopValue = DEFAULT_TOP_CATEGORIES.some((category) => category.value === options.topValue)
    ? options.topValue
    : "";
  if (!selectedTopValue || !supportsFlexibleSubcategory(selectedTopValue)) {
    throw new Error("Category hii inatumia subcategories zilizowekwa tayari.");
  }
  if (safeLabel.length < 2 || safeLabel.length > 40) {
    throw new Error("Subcategory inapaswa kuwa kati ya herufi 2 hadi 40.");
  }
  const customSlug = slugifyCategoryLabel(safeLabel);
  const maxCustomSlugLength = selectedTopValue
    ? Math.max(1, 40 - selectedTopValue.length - 1)
    : 40;
  const safeValue = selectedTopValue
    ? `${selectedTopValue}-${customSlug.slice(0, maxCustomSlugLength)}`
    : customSlug;
  const existingCategory = getSelectableSubcategoriesForTopCategory(selectedTopValue).find((category) =>
    category.value === safeValue || slugifyCategoryLabel(category.label) === customSlug
  );
  if (existingCategory) {
    return existingCategory;
  }
  const normalized = normalizeCategoryEntry({ value: safeValue, label: safeLabel, topValue: selectedTopValue });
  if (!normalized || normalized.value === "other" || normalized.label.length < 2) {
    throw new Error("Andika category mpya iliyo sahihi.");
  }

  if (currentSession?.token) {
    await window.WingaDataLayer.addCategory(normalized);
  }
  mergeAvailableCategories(inferCategoriesFromData(), [normalized]);
  refreshCategoryUI();
  return normalized;
}

function renderImageSearchPreview() {
  if (!searchImagePreview) {
    return;
  }

  if (!searchRuntimeState.activeImageSearch?.signature) {
    searchImagePreview.replaceChildren();
    searchImagePreview.style.display = "none";
    return;
  }

  const pill = createElement("div", { className: "search-image-pill" });
  const image = createElement("img", {
    attributes: {
      src: searchRuntimeState.activeImageSearch.previewSrc,
      alt: searchRuntimeState.activeImageSearch.name
    }
  });
  const copy = createElement("div", { className: "search-image-copy" });
  copy.appendChild(createElement("strong", { textContent: "Image Search" }));
  copy.appendChild(createElement("span", { textContent: searchRuntimeState.activeImageSearch.name }));
  const clearButton = createElement("button", {
    attributes: {
      id: "clear-image-search-preview",
      type: "button"
    },
    textContent: "Ondoa"
  });
  pill.append(image, copy, clearButton);
  searchImagePreview.replaceChildren(pill);
  searchImagePreview.style.display = "block";
  clearButton.addEventListener("click", () => {
    searchRuntimeState.activeImageSearch = null;
    searchRuntimeState.isSearchDropdownDismissed = false;
    renderCurrentView();
  });
}

function syncAppChromeOffsets() {
  return appChrome.syncAppChromeOffsets?.();
}

function scheduleChromeOffsetSync() {
  return appChrome.scheduleChromeOffsetSync?.();
}

async function hydrateMissingImageSignatures(productList = products) {
  const pendingProducts = productList.filter((product) => !product.imageSignature && product.image);
  if (!pendingProducts.length) {
    return;
  }

  await Promise.all(pendingProducts.map(async (product) => {
    try {
      product.imageSignature = await createImageSignatureFromSource(product.image);
    } catch (error) {
      product.imageSignature = "";
    }
  }));
}

function loginSuccess(username, preferredCategory = "", sessionData = null, options = {}) {
  const {
    restoreView = false,
    skipWelcome = false,
    forceView = "",
    deferRender = false
  } = options;
  isSessionRestorePending = false;
  searchRuntimeState.isMobileSearchOpen = false;
  searchRuntimeState.isInputFocused = false;
  searchBox.classList.remove("mobile-open");
  searchRuntimeState.activeImageSearch = null;
  searchRuntimeState.isSearchDropdownDismissed = false;
  searchInput.value = "";
  if (filterPriceMinInput) {
    filterPriceMinInput.value = "";
  }
  if (filterPriceMaxInput) {
    filterPriceMaxInput.value = "";
  }
  if (filterLocationInput) {
    filterLocationInput.value = "";
  }
  if (sortSelect) {
    sortSelect.value = "default";
  }
  resetTransientChromeState();
  applySessionState(sessionData || {
    username,
    fullName: username,
    primaryCategory: preferredCategory || "",
    role: "seller"
  });
  currentOrders = { purchases: [], sales: [] };
  currentMessages = [];
  currentNotifications = [];
    currentPromotions = [];
    currentReviews = [];
    reviewSummaries = {};
    profileRuntimeState.pendingSection = "";
    profileRuntimeState.activeSection = "profile-products-panel";
    chatUiState.activeContext = null;
    chatUiState.profileMessagesMode = "list";
    chatUiState.profileMessagesFilter = "all";
    chatUiState.profileHasSelection = false;
  if (isStaffRole(sessionData?.role || currentSession?.role || "")) {
    clearRequestBoxSessionState();
  } else {
    loadRequestBoxState();
  }
  chatUiState.currentDraft = "";
  chatUiState.selectedProductIds = [];
  chatUiState.activeReplyMessageId = "";
  chatUiState.openMessageMenuId = "";
  chatUiState.openEmojiScope = "";
  productDetailUiState.reviewDraft = { productId: "", rating: 5, comment: "" };
  chatUiState.isContextOpen = false;
  document.getElementById("context-chat-modal")?.remove();
  document.body.classList.remove("context-chat-open");
  stopMessagePolling();
  disconnectRealtimeChannel();
  currentSession.primaryCategory = inferTopCategoryValue(preferredCategory || getUserPrimaryCategory(username) || "")
    || preferredCategory
    || getUserPrimaryCategory(username)
    || "";
  hydrateBuyerSellerAffinityState(username);
  const storedViewState = restoreView ? getStoredAppView() : null;
  const nextView = forceView && isRestorableView(forceView, currentSession)
    ? forceView
    : (isStaffUser() ? "admin" : "home");
  saveSessionUser(currentSession);
  authContainer.style.display = "none";
  hideAdminLoginScreen();
  document.body.classList.remove("auth-modal-open");
  hideAuthGatePrompt();
  appContainer.style.display = "block";
  adminNavItem.style.display = isStaffUser() ? "inline-flex" : "none";
  setAdminNavLabel(adminNavItem, getAdminNavLabel());
  const storedCategory = restoreView && !isStaffUser() && storedViewState?.username === username && storedViewState?.selectedCategory
    ? getRestorableCategory(storedViewState.selectedCategory)
    : "all";
  const nextSelectedCategory = storedCategory !== "all"
    && !products.some((product) => isMarketplaceBrowseCandidate(product) && productMatchesSelectedCategory(product, storedCategory))
      ? "all"
      : storedCategory;
  applySelectedCategory(
    nextSelectedCategory
  );
  refreshPublicEntryChrome();
  clearUploadForm();
  productShopInput.value = username;
  setCurrentViewState(nextView, {
    syncHistory: "replace"
  });
  if (deferRender) {
    scheduleRenderCurrentView();
  } else {
    renderCurrentView();
  }
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  });
  updateProfileNavBadge();
  if (!isStaffUser()) {
    const hydrateRealtimeState = () => {
      connectRealtimeChannel();
      refreshPromotionsState().then(() => {
        if (currentView !== "profile") {
          renderCurrentView();
        }
      });
      refreshOrdersState().then(() => {
        if (currentView !== "profile") {
          renderCurrentView();
        }
      });
    };
    if (deferRender) {
      window.setTimeout(hydrateRealtimeState, 0);
    } else {
      hydrateRealtimeState();
    }
  }
  resumePendingGuestIntent();
  const handledDeepLink = !pendingGuestIntent && !getPendingGuestIntent()
    ? openDeepLinkedProductRouteIfNeeded()
    : false;
  if (!skipWelcome && !isStaffUser() && !handledDeepLink) {
    if (deferRender) {
      window.setTimeout(showWelcomePopup, 80);
    } else {
      showWelcomePopup();
    }
  }
}

function logout() {
  isSessionRestorePending = false;
  const wasStaffSession = isStaffUser();
  const shouldReturnToAdminLogin = wasStaffSession || isAdminLoginRoute();
  const logoutToken = String(currentSession?.token || getSessionUser()?.token || "").trim();
  if (logoutToken && window.WingaDataLayer.logoutSession) {
    window.WingaDataLayer.logoutSession(logoutToken).catch((error) => {
      captureClientError("logout_failed", error, {
        user: currentUser || "",
        wasStaffSession
      });
    });
  }
  toggleHeaderUserMenu(false);
  closeAllTransientOverlays({
    closeAuthModalIfGuest: false
  });
  clearSessionUser();
  clearAppViewState();
  applySessionState(null);
    profileRuntimeState.pendingSection = "";
    profileRuntimeState.activeSection = "profile-products-panel";
    currentOrders = { purchases: [], sales: [] };
    currentMessages = [];
  currentNotifications = [];
  currentPromotions = [];
  buyerSellerAffinity = {};
  currentReviews = [];
    reviewSummaries = {};
    chatUiState.activeContext = null;
    chatUiState.profileMessagesMode = "list";
    chatUiState.profileMessagesFilter = "all";
    chatUiState.profileHasSelection = false;
    clearRequestBoxSessionState();
  chatUiState.currentDraft = "";
  chatUiState.selectedProductIds = [];
  chatUiState.activeReplyMessageId = "";
  chatUiState.openMessageMenuId = "";
  chatUiState.openEmojiScope = "";
  productDetailUiState.reviewDraft = { productId: "", rating: 5, comment: "" };
  stopMessagePolling();
  disconnectRealtimeChannel();
  searchRuntimeState.activeImageSearch = null;
  searchRuntimeState.isSearchDropdownDismissed = false;
  searchRuntimeState.isMobileSearchOpen = false;
  searchBox.classList.remove("mobile-open");
  resetTransientChromeState();
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  hideAdminLoginScreen();
  appContainer.style.display = "block";
  adminNavItem.style.display = "none";
  setAdminNavLabel(adminNavItem, "Admin");
  usernameInput.value = "";
  phoneNumberInput.value = "";
  nationalIdInput.value = "";
  passwordInput.value = "";
  confirmPasswordInput.value = "";
  authSignupStep = 1;
  selectedAuthRole = "seller";
  clearPendingGuestIntent();
  resetAuthCategorySelection();
  syncAuthMode();
  refreshPublicEntryChrome();
  if (shouldReturnToAdminLogin) {
    adminLoginIdentifierInput.value = "";
    adminLoginPasswordInput.value = "";
    setAdminLoginRouteActive(true, { replace: true });
    showAdminLoginScreen();
    return;
  }
  setCurrentViewState("home", {
    syncHistory: "replace"
  });
  renderCurrentView();
  updateProfileNavBadge();
}

window.addEventListener("winga:session-invalidated", (event) => {
  if (isHandlingSessionInvalidation || !currentSession?.username) {
    return;
  }
  isHandlingSessionInvalidation = true;
  const message = event?.detail?.message || "Session yako imeisha. Ingia tena kuendelea.";
  const nextAudience = isStaffUser() || isAdminLoginRoute() ? "admin" : "public";
  logout();
  showLoggedOutState({
    audience: nextAudience,
    message
  });
  window.setTimeout(() => {
    isHandlingSessionInvalidation = false;
  }, 0);
});

window.addEventListener("popstate", (event) => {
  const state = event?.state;
  if (!state || state.wingaProductDetail || !state.wingaAppShell) {
    return;
  }

  const stateUsername = String(state.username || "").trim();
  if (stateUsername && stateUsername !== currentUser) {
    return;
  }

  const targetView = isRestorableView(state.view, currentSession)
    ? state.view
    : (isStaffUser() ? "admin" : "home");
  const nextCategory = targetView === "home" && isAuthenticatedUser()
    ? getRestorableCategory(state.selectedCategory)
    : "all";
  const nextPendingProfileSection = targetView === "profile"
    ? String(state.pendingProfileSection || "")
    : "";
  let shouldRender = false;

  if (selectedCategory !== nextCategory) {
    setCategorySelectionState(nextCategory, { persist: false, syncHistory: false });
    shouldRender = true;
  }

  if (currentView !== targetView) {
    setCurrentViewState(targetView, {
      persist: false,
      syncHistory: false,
      historyState: {
        pendingProfileSection: nextPendingProfileSection
      }
    });
    shouldRender = true;
  }

  if (profileRuntimeState.pendingSection !== nextPendingProfileSection) {
    profileRuntimeState.pendingSection = nextPendingProfileSection;
    shouldRender = true;
  }

  if (shouldRender && appContainer?.style.display !== "none") {
    renderCurrentView();
  }
});

function syncHeroPanelPosition(isProfile, isUpload) {
  if (!heroPanel || !productsSummary) {
    return;
  }

  const hasSearchValue = searchInput.value.trim().length > 0;
  if (hasSearchValue && !isProfile && !isUpload) {
    if (productsSummary.nextElementSibling !== heroPanel) {
      appContainer.insertBefore(heroPanel, productsSummary.nextElementSibling);
    }
    if (marketShowcase && heroPanel.nextElementSibling !== marketShowcase) {
      appContainer.insertBefore(marketShowcase, heroPanel.nextElementSibling);
    }
    return;
  }

  if (categories.nextElementSibling !== heroPanel) {
    appContainer.insertBefore(heroPanel, categories.nextElementSibling);
  }

  if (marketShowcase && heroPanel.nextElementSibling !== marketShowcase) {
    appContainer.insertBefore(marketShowcase, heroPanel.nextElementSibling);
  }
}

function hasPrioritySearchResults(resultCount) {
  const hasSearchIntent = Boolean(searchInput.value.trim() || searchRuntimeState.activeImageSearch?.signature);
  return hasSearchIntent && resultCount > 0 && currentView === "home";
}

function getSearchDropdownProducts(filteredProducts) {
  const immediateItems = Array.isArray(filteredProducts) ? filteredProducts.slice(0, 8) : [];
  if (immediateItems.length > 0) {
    return immediateItems;
  }

  const keyword = searchInput.value.trim();
  if (!keyword) {
    return immediateItems;
  }

  const globalMatches = AppCore.filterProducts
    ? AppCore.filterProducts({
      products,
      keyword,
      selectedCategory: "all",
      imageSignature: "",
      similarityThreshold: 0.72,
      similarityFn: getImageSimilarityScore
    })
    : products.filter((product) => {
      const normalizedKeyword = normalizeSearchValue(keyword);
      if (!normalizedKeyword || product?.status !== "approved") {
        return false;
      }
      const haystack = AppCore.createProductSearchText
        ? AppCore.createProductSearchText(product)
        : normalizeSearchValue(`${product?.name || ""} ${product?.shop || ""} ${product?.uploadedBy || ""}`);
      return haystack.includes(normalizedKeyword);
    });

  return globalMatches.slice(0, 8);
}

function scrollToProductCard(productId) {
  noteProductInterest(productId);
  const card = document.querySelector(
    `[data-product-card="${productId}"], [data-showcase-id="${productId}"], [data-open-product="${productId}"], .edit-btn[data-id="${productId}"]`
  )?.closest("[data-product-card], [data-showcase-id], [data-open-product], .product-card");
  if (!card) {
    productsSummary?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderSearchDropdown(filteredProducts, options = {}) {
  if (!searchDropdown) {
    return;
  }

  const { isProfile = false, isUpload = false, isAdminView = false } = options;
  const hasSearchIntent = Boolean(searchInput.value.trim() || searchRuntimeState.activeImageSearch?.signature);
  const shouldShow = hasSearchIntent
    && !searchRuntimeState.isSearchDropdownDismissed
    && !searchRuntimeState.isMobileCategoryOpen
    && !isProfile
    && !isUpload
    && !isAdminView;

  if (!shouldShow) {
    searchDropdown.replaceChildren();
    searchDropdown.classList.remove("open");
    return;
  }

  const items = getSearchDropdownProducts(filteredProducts);
  if (items.length === 0) {
    const emptyState = createElement("div", { className: "search-dropdown-empty" });
    emptyState.appendChild(createElement("strong", { textContent: "No results found" }));
    emptyState.appendChild(createElement("span", { textContent: "Jaribu jina lingine la bidhaa au duka." }));
    searchDropdown.replaceChildren(emptyState);
    searchDropdown.classList.add("open");
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((product) => {
    const button = createElement("button", {
      className: "search-result-item",
      attributes: {
        type: "button",
        "data-search-result": product.id
      }
    });
    const thumb = createElement("img", {
      className: "search-result-thumb",
      attributes: {
        src: product.image,
        alt: product.name,
        loading: "lazy"
      }
    });
    thumb.onerror = function handleSearchThumbError() {
      this.onerror = null;
      this.src = getImageFallbackDataUri("W");
    };
    const copy = createElement("span", { className: "search-result-copy" });
    copy.appendChild(createElement("strong", { textContent: product.name }));
    copy.appendChild(createElement("span", {
      textContent: `${product.shop}${product.category ? ` | ${getCategoryLabel(product.category)}` : ""}`
    }));
    const price = createElement("span", {
      className: "search-result-price",
      textContent: formatProductPrice(product.price)
    });
    button.append(thumb, copy, price);
    fragment.appendChild(button);
  });
  searchDropdown.replaceChildren(fragment);
  searchDropdown.classList.add("open");

  searchDropdown.querySelectorAll("[data-search-result]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.searchResult;
      searchRuntimeState.isSearchDropdownDismissed = true;
      searchRuntimeState.isInputFocused = false;
      searchDropdown.classList.remove("open");
      syncSearchChromeState();
      openProductDetailModal(productId);
    });
  });
}

function getSearchFilterState() {
  return {
    minPrice: Number(filterPriceMinInput?.value || 0),
    maxPrice: Number(filterPriceMaxInput?.value || 0),
    location: (filterLocationInput?.value || "").trim().toLowerCase(),
    sortBy: sortSelect?.value || "default"
  };
}

function applyProductFilters(list) {
  const filters = getSearchFilterState();
  let nextList = Array.isArray(list) ? [...list] : [];

  if (Number.isFinite(filters.minPrice) && filters.minPrice > 0) {
    nextList = nextList.filter((product) => {
      const price = normalizeOptionalPrice(product.price);
      return price !== null && price >= filters.minPrice;
    });
  }

  if (Number.isFinite(filters.maxPrice) && filters.maxPrice > 0) {
    nextList = nextList.filter((product) => {
      const price = normalizeOptionalPrice(product.price);
      return price !== null && price <= filters.maxPrice;
    });
  }

  if (
    Number.isFinite(filters.minPrice) && filters.minPrice > 0
    && Number.isFinite(filters.maxPrice) && filters.maxPrice > 0
    && filters.minPrice > filters.maxPrice
  ) {
    return [];
  }

  if (filters.location) {
    nextList = nextList.filter((product) => {
      const shop = String(product.shop || "").toLowerCase();
      const location = String(product.location || "").toLowerCase();
      return shop.includes(filters.location) || location.includes(filters.location);
    });
  }

  if (filters.sortBy === "price-asc") {
    nextList.sort((first, second) => compareProductsByPrice(first, second, "asc"));
  } else if (filters.sortBy === "price-desc") {
    nextList.sort((first, second) => compareProductsByPrice(first, second, "desc"));
  } else if (filters.sortBy === "newest") {
    nextList.sort((first, second) => {
      const promoGap = getPromotionSortScore(second) - getPromotionSortScore(first);
      if (promoGap !== 0) {
        return promoGap;
      }
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    });
  } else if (filters.sortBy === "popular") {
    nextList.sort((first, second) => {
      const promoGap = getPromotionSortScore(second) - getPromotionSortScore(first);
      if (promoGap !== 0) {
        return promoGap;
      }
      const firstScore = Number(first.likes || 0) * 3 + Number(first.views || 0);
      const secondScore = Number(second.likes || 0) * 3 + Number(second.views || 0);
      return secondScore - firstScore;
    });
  } else {
    nextList.sort((first, second) => {
      const promoGap = getPromotionSortScore(second) - getPromotionSortScore(first);
      if (promoGap !== 0) {
        return promoGap;
      }
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    });
  }

  return nextList;
}

function getShowcaseProducts() {
  const renderableProducts = products.filter((product) =>
    product.status === "approved"
    && product.availability !== "sold_out"
    && hasRenderableMarketplaceImage(product)
    && shouldRenderMarketplaceProduct(product)
  );
  if (!renderableProducts.length) {
    return [];
  }

  const rotationSeed = Math.floor(Date.now() / 600000) % Math.max(1, renderableProducts.length);
  const diverseProducts = getDiverseShowcaseProducts(12, rotationSeed);
  const fallbackProducts = AppCore.getShowcaseProducts
    ? AppCore.getShowcaseProducts(renderableProducts, 12)
    : renderableProducts
      .sort((first, second) => {
        const firstScore = (first.likes || 0) * 4 + (first.views || 0);
        const secondScore = (second.likes || 0) * 4 + (second.views || 0);
        return secondScore - firstScore;
      })
      .slice(0, 12);

  const combined = [...diverseProducts, ...fallbackProducts].filter((product, index, list) => (
    Boolean(getMarketplacePrimaryImage(product))
    && list.findIndex((item) => item.id === product.id) === index
  ));

  return combined.length ? combined.slice(0, 12) : fallbackProducts;
}

function getProductsPerRow() {
  if (!productsContainer) {
    return 1;
  }

  const computedColumns = String(window.getComputedStyle(productsContainer)?.gridTemplateColumns || "").trim();
  if (!computedColumns || computedColumns === "none") {
    return 1;
  }
  const columns = computedColumns.split(" ").filter(Boolean).length;
  return Math.max(1, columns || 1);
}

function getDiverseShowcaseProducts(limit = 12, rotation = 0) {
  const sourceProducts = products
    .filter((product) => product.status === "approved" && product.availability !== "sold_out" && hasRenderableMarketplaceImage(product) && shouldRenderMarketplaceProduct(product))
    .sort((first, second) => {
      const firstScore = (first.likes || 0) * 4 + (first.views || 0);
      const secondScore = (second.likes || 0) * 4 + (second.views || 0);
      return secondScore - firstScore;
    });

  const sellerBuckets = new Map();
  sourceProducts.forEach((product) => {
    const key = product.uploadedBy || "unknown";
    if (!sellerBuckets.has(key)) {
      sellerBuckets.set(key, []);
    }
    sellerBuckets.get(key).push(product);
  });

  const sellers = Array.from(sellerBuckets.keys());
  if (!sellers.length) {
    return [];
  }

  const rotatedSellers = sellers.map((_, index) => sellers[(index + rotation) % sellers.length]);
  const mixed = [];
  const usedIds = new Set();

  while (mixed.length < limit) {
    let pushedInRound = false;
    rotatedSellers.forEach((seller) => {
      const bucket = sellerBuckets.get(seller) || [];
      while (bucket.length > 0 && usedIds.has(bucket[0].id)) {
        bucket.shift();
      }
      if (bucket.length > 0 && mixed.length < limit) {
        const product = bucket.shift();
        mixed.push(product);
        usedIds.add(product.id);
        pushedInRound = true;
      }
    });

    if (!pushedInRound) {
      break;
    }
  }

  return mixed;
}

function getBehaviorPreferredCategories() {
  const categoryPool = [
    ...(selectedCategory !== "all" ? [selectedCategory] : []),
    ...recentCategorySelections,
    ...recentlyViewedProductIds
      .map((productId) => products.find((item) => item.id === productId)?.category)
      .filter(Boolean),
    ...recentMessagedProductIds
      .map((productId) => products.find((item) => item.id === productId)?.category)
      .filter(Boolean),
    ...(currentSession?.primaryCategory ? [currentSession.primaryCategory] : [])
  ];

  return Array.from(new Set(categoryPool.filter(Boolean))).slice(0, 4);
}

function getBehaviorShowcaseDescriptor(sectionIndex = 0, excludeIds = new Set()) {
  const preferredCategories = getBehaviorPreferredCategories();
  const viewedSet = new Set(recentlyViewedProductIds);
  const messagedSet = new Set(recentMessagedProductIds);
  const searchTerms = recentSearchTerms.slice(0, 3);
  const behaviorHeavy = viewedSet.size > 0 || messagedSet.size > 0 || preferredCategories.length > 0 || searchTerms.length > 0;

  const baseProducts = products
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && hasRenderableMarketplaceImage(product)
      && shouldRenderMarketplaceProduct(product)
      && !excludeIds.has(product.id)
    );
  const items = rankProductsForSurface(baseProducts, {
    surface: "behavior_showcase",
    limit: 12,
    excludeIds,
    preferredCategories,
    searchTerms
  });

  if (!items.length) {
    return {
      heading: "Marketplace Picks",
      title: "Bidhaa kutoka maduka tofauti",
      subtitle: "Tembea kushoto au kulia kuona zaidi",
      items: getDiverseShowcaseProducts(12, sectionIndex * 2)
    };
  }

  const topCategory = preferredCategories[0];
  if (behaviorHeavy) {
    return {
      heading: sectionIndex === 0 ? "Marketplace Picks" : "Based on Your Interest",
      title: topCategory ? `More in ${getCategoryLabel(topCategory)}` : "Products related to your recent activity",
      subtitle: "Suggestions refreshed as you continue browsing",
      items
    };
  }

  return {
    heading: sectionIndex % 2 === 0 ? "Trending" : "Marketplace Picks",
    title: "Popular products from active sellers",
    subtitle: "Tembea kushoto au kulia kuona zaidi",
    items
  };
}

function getRecommendationSeed(list) {
  const visibleProducts = Array.isArray(list) ? list : [];
  return visibleProducts.find((product) => product.id === lastViewedProductId)
    || getProductById(lastViewedProductId)
    || visibleProducts[0]
    || recentlyViewedProductIds.map((productId) => getProductById(productId)).find(Boolean)
    || null;
}

const {
  getRelatedProducts,
  getDiscoveryRelatedProducts,
  getDiscoverySponsoredProducts,
  rankProductsForSurface
} = window.WingaModules.marketplace.createDiscoveryHelpers({
  getProducts: () => products,
  inferTopCategoryValue,
  isMarketplaceBrowseCandidate,
  getPromotionSortScore,
  getRecentlyViewedProductIds: () => recentlyViewedProductIds,
  getProductDiscoveryTrail: () => productDiscoveryTrail,
  getActivePromotions,
  getMarketplaceUser,
  getSellerReviewSummary,
  getPromotionCommercialScore,
  getCurrentUser: () => currentUser,
  canUseBuyerFeatures,
  getCurrentMessages: () => currentMessages,
  getCurrentOrders: () => currentOrders,
  getRecentCategorySelections: () => recentCategorySelections,
  getRecentSearchTerms: () => recentSearchTerms,
  getRecentMessagedProductIds: () => recentMessagedProductIds,
  getBuyerSellerAffinityEntries,
  getCurrentSession: () => currentSession,
  normalizeOptionalPrice
});

function renderDiscoveryProductCards(items, options = {}) {
  const { sponsored = false } = options;
  const renderableItems = (Array.isArray(items) ? items : []).filter((item) => getMarketplacePrimaryImage(item));
  if (!renderableItems.length) {
    return "";
  }

  return `
    <div class="seller-products-grid">
      ${renderableItems.map((item) => {
        const safeName = escapeHtml(item.name || "");
        const safeCaption = escapeHtml(String(item.description || item.caption || item.name || item.shop || getCategoryLabel(item.category) || "").trim());
        const promotion = sponsored ? getPrimaryPromotion(item.id) : null;
        const seller = getMarketplaceUser(item.uploadedBy);
        const sellerName = escapeHtml(String(item.shop || seller?.fullName || item.uploadedBy || "Seller").trim());
        const sellerMeta = escapeHtml(String(item.location || getCategoryLabel(item.category) || "").trim());
        const sellerProfileImage = sanitizeImageSource(String(seller?.profileImage || "").trim(), "");
        const sellerAvatar = seller?.profileImage
          ? `<img class="product-seller-avatar-image" src="${sellerProfileImage}" alt="${sellerName}" loading="lazy" decoding="async">`
          : `<span>${escapeHtml(getUserInitials(String(item.shop || seller?.fullName || item.uploadedBy || "S").trim()))}</span>`;
        return `
          <article class="seller-product-card" data-open-product="${item.id}">
            <div class="seller-product-card-media">
              ${renderFeedGalleryMarkup(item, "discovery")}
            </div>
            ${renderProductOverflowMenu(item, { overlay: true })}
            <div class="product-seller-row">
              <div class="product-seller-avatar">${sellerAvatar}</div>
              <div class="product-seller-copy">
                <strong class="product-seller-name">${sellerName}</strong>
                <span class="product-seller-meta">${sellerMeta}</span>
              </div>
              <span class="product-seller-badge">${seller?.verifiedSeller ? "Verified" : "Seller"}</span>
            </div>
            <div class="product-card-caption-block${safeCaption.length > 120 ? " is-collapsed" : ""}">
              <p class="product-card-caption">${safeCaption}</p>
              ${safeCaption.length > 120 ? `<button class="product-caption-toggle" type="button" data-product-caption-toggle="true" aria-expanded="false">See more</button>` : ""}
            </div>
            ${promotion ? `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">${escapeHtml(getPromotionLabel(promotion.type))}</span></p>` : ""}
            ${renderProductActionGroup(item, { requestLabel: "Request", extraClass: "seller-product-actions seller-product-actions-compact" })}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function getMarketplaceProductTrustScore(product) {
  const owner = getMarketplaceUser(product?.uploadedBy);
  const sellerSummary = getSellerReviewSummary(product?.uploadedBy);
  let score = 0;
  if (owner?.verifiedSeller) score += 25;
  if (owner?.status === "active") score += 10;
  if (owner?.status === "flagged") score -= 60;
  if (Number(sellerSummary?.totalReviews || 0) > 0) {
    score += Number(sellerSummary.averageRating || 0) * 8;
    score += Math.min(20, Number(sellerSummary.totalReviews || 0) * 2);
  }
  return score;
}

function limitProductsPerSeller(items, limit, maxPerSeller = 2) {
  const selected = [];
  const sellerCounts = new Map();
  items.forEach((product) => {
    if (selected.length >= limit) {
      return;
    }
    const sellerId = product?.uploadedBy || "";
    const currentCount = sellerCounts.get(sellerId) || 0;
    if (currentCount >= maxPerSeller) {
      return;
    }
    selected.push(product);
    sellerCounts.set(sellerId, currentCount + 1);
  });
  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }
  items.forEach((product) => {
    if (selected.length >= limit) {
      return;
    }
    if (!selected.some((item) => item.id === product.id)) {
      selected.push(product);
    }
  });
  return selected.slice(0, limit);
}

function getYouMayLikeProducts(seedProduct, limit = 6) {
  const relatedIds = new Set((seedProduct ? getRelatedProducts(seedProduct, limit).map((item) => item.id) : []));
  const pool = products
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && hasRenderableMarketplaceImage(product)
      && shouldRenderMarketplaceProduct(product)
      && product.id !== seedProduct?.id
      && !relatedIds.has(product.id)
    );
  return rankProductsForSurface(pool, {
    surface: "you_may_like",
    limit,
    excludeIds: relatedIds,
    seedProduct
  });
}

function getMostSearchedProducts(seedProduct, options = {}) {
  const { limit = 8, excludeIds = new Set(), sourceProducts = null } = options;
  const pool = (Array.isArray(sourceProducts) ? sourceProducts : products).filter((product) =>
    product.status === "approved"
    && product.availability !== "sold_out"
    && shouldRenderMarketplaceProduct(product)
    && product.id !== seedProduct?.id
    && !excludeIds.has(product.id)
  );
  const ranked = rankProductsForSurface(pool, {
    surface: "trending",
    limit,
    excludeIds,
    seedProduct,
    searchTerms: recentSearchTerms.slice(0, 4)
  });
  return ranked.length
    ? ranked
    : getTrendingProducts(limit, excludeIds, sourceProducts);
}

function getTrendingProducts(limit = 8, excludeIds = new Set(), sourceProducts = null) {
  const source = (Array.isArray(sourceProducts) ? sourceProducts : products).filter((product) =>
    product.status === "approved"
    && product.availability !== "sold_out"
    && hasRenderableMarketplaceImage(product)
    && shouldRenderMarketplaceProduct(product)
    && !excludeIds.has(product.id)
  );
  const withSignal = source.some((product) => Number(product.views || 0) > 0 || Number(product.likes || 0) > 0);
  const ranked = rankProductsForSurface(source, {
    surface: "trending",
    limit,
    excludeIds
  });
  return ranked.length ? ranked : limitProductsPerSeller(withSignal ? source.slice() : source.slice().sort(() => Math.random() - 0.5), limit, 2);
}

function getNewestProducts(options = {}) {
  const { limit = 8, excludeIds = new Set(), seedProduct = null, sourceProducts = null } = options;
  const seedTopCategory = inferTopCategoryValue(seedProduct?.category || "");
  const rankedNewest = (Array.isArray(sourceProducts) ? sourceProducts : products)
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && shouldRenderMarketplaceProduct(product)
      && !excludeIds.has(product.id)
      && product.id !== seedProduct?.id
    )
    .sort((first, second) => {
      const secondMatchesSeed = seedTopCategory && inferTopCategoryValue(second.category || "") === seedTopCategory ? 1 : 0;
      const firstMatchesSeed = seedTopCategory && inferTopCategoryValue(first.category || "") === seedTopCategory ? 1 : 0;
      if (secondMatchesSeed !== firstMatchesSeed) {
        return secondMatchesSeed - firstMatchesSeed;
      }
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    });
  return limitProductsPerSeller(rankedNewest, limit, 2);
}

function rememberContinuousDiscoveryIds(currentIds = [], nextIds = [], limit = 40) {
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

function getRenderableMarketplacePool(options = {}) {
  const { excludeIds = new Set(), seedProduct = null } = options;
  return products.filter((product) =>
    product.status === "approved"
    && product.availability !== "sold_out"
    && shouldRenderMarketplaceProduct(product)
    && product.id !== seedProduct?.id
    && !excludeIds.has(product.id)
  );
}

function releasePrunedSectionMedia(section) {
  if (!(section instanceof Element)) {
    return;
  }
  section.querySelectorAll("img").forEach((image) => {
    marketplaceScrollImageObserver?.unobserve?.(image);
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
      // Ignore release failures for detached media nodes.
    }
  });
}

function prioritizeSellerMarketplaceMix(list) {
  if (!isSellerUser() || currentView !== "home" || !Array.isArray(list) || list.length < 2) {
    return list;
  }
  const ownProducts = [];
  const otherSellerProducts = [];
  list.forEach((product) => {
    if (product?.uploadedBy === currentUser) {
      ownProducts.push(product);
      return;
    }
    otherSellerProducts.push(product);
  });
  return otherSellerProducts.length ? [...otherSellerProducts, ...ownProducts] : list;
}

function createContinuousDiscoveryAnchorElement() {
  const anchor = createElement("section", {
    className: "continuous-discovery-anchor",
    attributes: {
      "data-continuous-discovery-anchor": "home"
    }
  });
  anchor.append(
    createElement("p", { className: "eyebrow", textContent: "Winga is loading more" }),
    createElement("strong", { textContent: "More products are already lining up" }),
    createElement("p", {
      className: "product-meta",
      textContent: "New arrivals come first, then more stylish marketplace picks follow behind them."
    })
  );
  return anchor;
}

function createContinuousDiscoverySectionElement(descriptor, index, anchorKind = "home") {
  if (!descriptor || !Array.isArray(descriptor.items) || !descriptor.items.length) {
    return null;
  }
  const section = createShowcaseSectionElement(
    descriptor.items,
    index,
    descriptor.eyebrow || "Keep Exploring",
    descriptor.title || "More products for you",
    descriptor.subtitle || "Discovery keeps moving while you browse"
  );
  if (!section) {
    return null;
  }
  section.classList.add("recommendation-strip", "continuous-discovery-section");
  section.setAttribute("data-continuous-discovery-section", `${anchorKind}-${index}`);
  section.setAttribute("data-continuous-discovery-kind", descriptor.kind || "continuation");
  return section;
}

function getStaleViewedProducts(options = {}) {
  const {
    limit = 8,
    recentIds = [],
    usedIds = new Set(),
    seedProduct = null,
    sourceProducts = null
  } = options;
  const recentIdSet = new Set(recentIds);
  const usedIdSet = new Set(Array.from(usedIds || []).filter(Boolean));
  const seedTopCategory = inferTopCategoryValue(seedProduct?.category || "");
  const candidates = (Array.isArray(sourceProducts) ? sourceProducts : products)
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && shouldRenderMarketplaceProduct(product)
      && product.id !== seedProduct?.id
      && !recentIdSet.has(product.id)
      && (productSeenTimestamps[product.id] || usedIdSet.has(product.id))
    )
    .sort((first, second) => {
      const secondMatchesSeed = seedTopCategory && inferTopCategoryValue(second.category || "") === seedTopCategory ? 1 : 0;
      const firstMatchesSeed = seedTopCategory && inferTopCategoryValue(first.category || "") === seedTopCategory ? 1 : 0;
      if (secondMatchesSeed !== firstMatchesSeed) {
        return secondMatchesSeed - firstMatchesSeed;
      }
      const firstSeenAt = Number(productSeenTimestamps[first.id] || 0);
      const secondSeenAt = Number(productSeenTimestamps[second.id] || 0);
      if (firstSeenAt !== secondSeenAt) {
        return firstSeenAt - secondSeenAt;
      }
      return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
    });

  return limitProductsPerSeller(candidates, limit, 2);
}

function getContinuousDiscoveryDescriptor(options = {}) {
  const {
    seedProduct = null,
    usedIds = new Set(),
    recentIds = [],
    batchIndex = 0
  } = options;
  const preferredSeed = seedProduct || getRecommendationSeed(getFilteredProducts());
  const hardExcludeIds = new Set(Array.from(usedIds || []).filter(Boolean));
  const softExcludeIds = new Set([
    ...Array.from(hardExcludeIds),
    ...Array.from(recentIds || []).filter(Boolean)
  ]);
  const renderableProducts = getRenderableMarketplacePool({
    seedProduct: preferredSeed
  });
  const hardEligibleProducts = renderableProducts.filter((product) => !hardExcludeIds.has(product.id));
  const minimumBatchSize = 3;

  const freshNewItems = getNewestProducts({
    limit: 10,
    excludeIds: softExcludeIds,
    seedProduct: preferredSeed,
    sourceProducts: hardEligibleProducts
  }).filter((product) => !productSeenTimestamps[product.id]);
  if (freshNewItems.length >= minimumBatchSize || (freshNewItems.length > 0 && batchIndex === 0)) {
    return {
      kind: "fresh",
      eyebrow: "New Products",
      title: "Fresh listings from active sellers",
      subtitle: "Winga keeps putting new stock in front of you first.",
      items: freshNewItems.slice(0, 8)
    };
  }

  const relatedItems = preferredSeed
    ? getDiscoveryRelatedProducts(preferredSeed, {
      limit: 8,
      excludeIds: softExcludeIds
    })
    : [];
  if (relatedItems.length >= minimumBatchSize) {
    return {
      kind: "related",
      eyebrow: "Related Products",
      title: preferredSeed ? `Still more around ${getCategoryLabel(preferredSeed.category)}` : "Still more to explore",
      subtitle: "Products close to the one you just explored.",
      items: relatedItems
    };
  }

  const mostSearchedItems = getMostSearchedProducts(preferredSeed, {
    limit: 8,
    excludeIds: softExcludeIds,
    sourceProducts: hardEligibleProducts
  });
  if (mostSearchedItems.length >= minimumBatchSize) {
    return {
      kind: "most-searched",
      eyebrow: "Most Searched",
      title: "Popular products buyers search for most",
      subtitle: "High-intent products moving through the marketplace right now.",
      items: mostSearchedItems
    };
  }

  const sponsoredItems = getDiscoverySponsoredProducts(preferredSeed, {
    limit: 4,
    excludeIds: softExcludeIds
  });
  if (sponsoredItems.length >= 2) {
    return {
      kind: "sponsored",
      eyebrow: "Sponsored Picks",
      title: "Promoted products worth a look",
      subtitle: "Commercially boosted items selected without breaking discovery flow.",
      sponsored: true,
      items: sponsoredItems
    };
  }

  const staleViewedItems = getStaleViewedProducts({
    limit: 8,
    recentIds,
    usedIds,
    seedProduct: preferredSeed,
    sourceProducts: renderableProducts
  });
  if (staleViewedItems.length) {
    return {
      kind: "stale-viewed",
      eyebrow: "Vaa Pendeza",
      title: "Mitupio na classic za kurudi kwenye rada yako",
      subtitle: "Picks zenye style nzuri zinazostahili kuangaliwa tena huku ukisubiri arrivals mpya.",
      items: staleViewedItems
    };
  }

  const fallbackItems = getTrendingProducts(
    8,
    new Set(Array.from(recentIds || []).filter(Boolean)),
    renderableProducts
  );
  if (fallbackItems.length) {
    return {
      kind: "trending-fallback",
      eyebrow: "Marketplace Picks",
      title: "More products from the market",
      subtitle: "Winga keeps discovery alive even when fresh stock is limited.",
      items: fallbackItems
    };
  }

  return null;
}

function disconnectContinuousDiscoveryObserver() {
  if (homeContinuousDiscoveryRuntime.observer) {
    homeContinuousDiscoveryRuntime.observer.disconnect();
  }
  if (homeContinuousDiscoveryRuntime.reobserveTimer) {
    window.clearTimeout(homeContinuousDiscoveryRuntime.reobserveTimer);
  }
  homeContinuousDiscoveryRuntime = {
    observer: null,
    batchIndex: 0,
    recentIds: [],
    usedIds: new Set(),
    loading: false,
    seedProductId: "",
    reobserveTimer: 0,
    lastHydrateAt: 0
  };
}

function scheduleContinuousDiscoveryReobserve(anchor) {
  if (!anchor || !anchor.isConnected || !homeContinuousDiscoveryRuntime.observer || currentView !== "home") {
    return;
  }
  if (homeContinuousDiscoveryRuntime.reobserveTimer) {
    window.clearTimeout(homeContinuousDiscoveryRuntime.reobserveTimer);
  }
  homeContinuousDiscoveryRuntime.reobserveTimer = window.setTimeout(() => {
    homeContinuousDiscoveryRuntime.reobserveTimer = 0;
    if (!anchor.isConnected || !homeContinuousDiscoveryRuntime.observer || currentView !== "home") {
      return;
    }
    homeContinuousDiscoveryRuntime.observer.observe(anchor);
  }, HOME_CONTINUOUS_DISCOVERY_REOBSERVE_DELAY_MS);
}

function trimHomeContinuousDiscoverySections(anchor) {
  const container = anchor?.closest?.("#products-container");
  if (!container) {
    return;
  }
  const sections = Array.from(container.querySelectorAll("[data-continuous-discovery-section]"));
  if (sections.length <= MAX_ACTIVE_HOME_CONTINUOUS_SECTIONS) {
    return;
  }
  sections.slice(0, sections.length - MAX_ACTIVE_HOME_CONTINUOUS_SECTIONS).forEach((section) => {
    releasePrunedSectionMedia(section);
    section.remove();
  });
}

function hydrateContinuousDiscoveryAnchor(anchor) {
  if (!anchor || homeContinuousDiscoveryRuntime.loading) {
    return;
  }

  const now = Date.now();
  if (now - Number(homeContinuousDiscoveryRuntime.lastHydrateAt || 0) < HOME_CONTINUOUS_DISCOVERY_MIN_INTERVAL_MS) {
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }

  homeContinuousDiscoveryRuntime.loading = true;
  homeContinuousDiscoveryRuntime.observer?.unobserve(anchor);

  const seedProduct = getProductById(homeContinuousDiscoveryRuntime.seedProductId) || getRecommendationSeed(getFilteredProducts());
  const descriptor = getContinuousDiscoveryDescriptor({
    seedProduct,
    usedIds: homeContinuousDiscoveryRuntime.usedIds,
    recentIds: homeContinuousDiscoveryRuntime.recentIds,
    batchIndex: homeContinuousDiscoveryRuntime.batchIndex
  });

  if (!descriptor) {
    homeContinuousDiscoveryRuntime.loading = false;
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }

  const section = createContinuousDiscoverySectionElement(
    descriptor,
    homeContinuousDiscoveryRuntime.batchIndex + 1,
    "home"
  );
  if (!section) {
    homeContinuousDiscoveryRuntime.loading = false;
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }

  anchor.after(section);
  section.after(anchor);
  enhanceShowcaseTracks(section);
  bindShowcaseCardClicks(section);
  bindImageFallbacks(section);
  bindProductMenus(section);
  trimHomeContinuousDiscoverySections(anchor);
  const appendedIds = descriptor.items.map((item) => item.id);
  appendedIds.forEach((productId) => homeContinuousDiscoveryRuntime.usedIds.add(productId));
  pruneOrderedIdSet(homeContinuousDiscoveryRuntime.usedIds, MAX_HOME_CONTINUOUS_USED_IDS);
  homeContinuousDiscoveryRuntime.recentIds = rememberContinuousDiscoveryIds(
    homeContinuousDiscoveryRuntime.recentIds,
    appendedIds
  );
  homeContinuousDiscoveryRuntime.batchIndex += 1;
  homeContinuousDiscoveryRuntime.lastHydrateAt = now;
  homeContinuousDiscoveryRuntime.loading = false;
  scheduleContinuousDiscoveryReobserve(anchor);
}

function setupContinuousDiscoveryLoading(scope, options = {}) {
  disconnectContinuousDiscoveryObserver();

  const anchor = scope?.querySelector?.("[data-continuous-discovery-anchor='home']");
  if (!anchor || currentView !== "home" || !currentUser) {
    return;
  }

  const usedIds = new Set(Array.from(options.usedProductIds || []).filter(Boolean));
  homeContinuousDiscoveryRuntime.usedIds = usedIds;
  homeContinuousDiscoveryRuntime.recentIds = [];
  homeContinuousDiscoveryRuntime.seedProductId = options.seedProduct?.id || "";
  homeContinuousDiscoveryRuntime.lastHydrateAt = 0;

  if (typeof IntersectionObserver === "undefined") {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      hydrateContinuousDiscoveryAnchor(anchor);
    }
    return;
  }

  homeContinuousDiscoveryRuntime.observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || homeContinuousDiscoveryRuntime.loading) {
        return;
      }
      hydrateContinuousDiscoveryAnchor(anchor);
    });
  }, {
    rootMargin: "280px 0px 200px 0px"
  });
  homeContinuousDiscoveryRuntime.observer.observe(anchor);
}

function buildTrendingKariakooSlide() {
  const rotationSeed = Math.floor(Date.now() / 600000) % 12;
  const trending = getDiverseShowcaseProducts(4, rotationSeed).filter((product) => {
    if (!product) {
      return false;
    }
    const primaryImage = getMarketplacePrimaryImage(product);
    return Boolean(primaryImage) && Boolean(product.name || product.shop || getCategoryLabel(product.category));
  });
  if (!trending.length) {
    return null;
  }

  const lead = trending[0];
  return {
    image: getMarketplacePrimaryImage(lead, { allowOwnerVisibility: true }),
    kicker: "Trending Kariakoo",
    title: "Bidhaa zinazovuma Kariakoo leo",
    subtitle: "Picks zenye movement kubwa zaidi kwenye views, requests na mazungumzo ya sasa.",
    highlights: trending.slice(0, 4).map((item) => `${item.name} · ${formatProductPrice(item.price)}`)
  };
}

function renderPromotionBadges(product) {
  const promotion = getPrimaryPromotion(product.id);
  if (!promotion) {
    return "";
  }
  return `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">${promotion.type === "boost" ? "Boosted" : promotion.type === "pin_top" ? "Pinned" : "Sponsored"}</span></p>`;
}

function renderPromoteButton(product) {
  if (!currentUser || product.uploadedBy !== currentUser || product.status !== "approved") {
    return "";
  }
  return `<button class="action-btn action-btn-secondary" type="button" data-promote-product="${product.id}">Promote</button>`;
}

function renderFeedGalleryMarkup(product, surface = "feed") {
  const safeImages = getRenderableMarketplaceImages(product);
  const images = safeImages.length > 0 ? safeImages : [getImageFallbackDataUri("WINGA")];
  const total = images.length;
  const currentLabel = total > 1 ? `1/${total}` : "";
  if (surface && surface !== "feed") {
    const previewSrc = sanitizeImageSource(String(images[0] || "").trim(), getImageFallbackDataUri("WINGA"));
    const previewAlt = escapeHtml(`${product?.name || product?.shop || "Product image"} 1`);
    return `
      <div class="product-gallery media-gallery feed-gallery-preview showcase-media-preview feed-gallery-preview-single"
        data-feed-gallery-surface="${escapeHtml(surface || "discovery")}">
        <img
          class="feed-gallery-image feed-gallery-image-social showcase-preview-image"
          src="${previewSrc}"
          alt="${previewAlt}"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          draggable="false"
          data-marketplace-scroll-image="true"
          data-fallback-src="${getImageFallbackDataUri("WINGA")}"
        >
        ${currentLabel ? `<span class="feed-gallery-count-badge product-gallery-count-badge">${currentLabel}</span>` : ""}
      </div>
    `;
  }
  const slides = images.map((src, index) => {
    const safeSrc = sanitizeImageSource(String(src || "").trim(), getImageFallbackDataUri("WINGA"));
    const safeAlt = escapeHtml(`${product?.name || product?.shop || "Product image"} ${index + 1}`);
    const isFirstSlide = index === 0;
    return `
      <div class="feed-gallery-carousel-slide" data-feed-gallery-slide="${index}">
        <img
          class="feed-gallery-image feed-gallery-image-social"
          src="${safeSrc}"
          alt="${safeAlt}"
          loading="${isFirstSlide ? "eager" : "lazy"}"
          ${isFirstSlide ? 'fetchpriority="high"' : 'fetchpriority="auto"'}
          decoding="async"
          draggable="false"
          data-marketplace-scroll-image="true"
          data-fallback-src="${getImageFallbackDataUri("WINGA")}"
        >
      </div>
    `;
  }).join("");

  return `
    <div class="product-gallery media-gallery feed-gallery-preview feed-gallery-carousel"
      data-feed-gallery-carousel="true"
      data-feed-gallery-total="${total}"
      data-feed-gallery-current="1"
      data-feed-gallery-surface="${escapeHtml(surface || "feed")}">
      <div class="feed-gallery-carousel-track" data-feed-gallery-track>
        ${slides}
      </div>
      ${currentLabel ? `<span class="feed-gallery-count-badge" data-feed-gallery-count>${currentLabel}</span>` : ""}
    </div>
  `;
}

function bindFeedGalleryInteractions(scope = document) {
  if (!scope) {
    return;
  }

  scope.querySelectorAll("[data-feed-gallery-carousel]").forEach((carousel) => {
    if (carousel.dataset.feedGalleryBound === "true") {
      return;
    }

    const track = carousel.querySelector("[data-feed-gallery-track]");
    const badge = carousel.querySelector("[data-feed-gallery-count]");
    carousel.dataset.feedGalleryBound = "true";
    if (!track || !badge) {
      return;
    }

    const syncBadge = () => {
      const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
      const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
      const currentIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
      const nextLabel = `${currentIndex + 1}/${total}`;
      carousel.dataset.feedGalleryCurrent = String(currentIndex + 1);
      if (badge.textContent !== nextLabel) {
        badge.textContent = nextLabel;
      }
    };

    let rafId = 0;
    const scheduleSync = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncBadge();
      });
    };

    track.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });
    window.setTimeout(syncBadge, 0);
  });
}

function bindShowcaseCardClicks(scope) {
  scope.querySelectorAll(".showcase-card, .seller-product-card").forEach((card) => {
    if (card.dataset.showcaseClickBound === "true") {
      return;
    }
    card.dataset.showcaseClickBound = "true";
    card.addEventListener("click", (event) => {
      const openTrigger = event.target.closest("[data-open-product], [data-showcase-id]");
      const productId = openTrigger?.dataset?.openProduct
        || openTrigger?.dataset?.showcaseId
        || card.dataset.openProduct
        || card.dataset.showcaseId
        || "";
      if (!productId || event.__wingaProductOpenHandled) {
        return;
      }
      if (
        event.target.closest(
          ".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages]"
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.__wingaProductOpenHandled = true;

      if (!isAuthenticatedUser()) {
        promptGuestAuth?.({
          preferredMode: "signup",
          role: "buyer",
          title: "You need an account to continue",
          message: "Sign up or log in to open product details and other marketplace actions.",
          intent: { type: "focus-product", productId }
        });
        return;
      }

      openProductDetailModal(productId);
    });
  });
}

function hydrateDynamicShowcaseSection(placeholder, sectionIndex, usedIds) {
  if (!placeholder || placeholder.dataset.hydrated === "true") {
    return;
  }

  const descriptor = getBehaviorShowcaseDescriptor(sectionIndex, usedIds);
  const nextSection = createShowcaseSectionElement(
    descriptor.items,
    sectionIndex + 1,
    descriptor.heading,
    descriptor.title,
    descriptor.subtitle
  );

  if (!nextSection) {
    placeholder.remove();
    return;
  }

  descriptor.items.forEach((item) => usedIds.add(item.id));
  placeholder.replaceWith(nextSection);
  enhanceShowcaseTracks(nextSection);
  bindShowcaseCardClicks(nextSection);
  bindImageFallbacks(nextSection);
  bindProductMenus(nextSection);
}

function setupDynamicShowcaseLoading(scope, usedIds = new Set()) {
  const placeholders = Array.from(scope.querySelectorAll("[data-dynamic-showcase-placeholder]"));
  if (!placeholders.length) {
    return;
  }

  if (typeof IntersectionObserver === "undefined") {
    placeholders.forEach((placeholder) => {
      hydrateDynamicShowcaseSection(placeholder, Number(placeholder.dataset.dynamicShowcasePlaceholder || 0), usedIds);
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      const placeholder = entry.target;
      observer.unobserve(placeholder);
      hydrateDynamicShowcaseSection(placeholder, Number(placeholder.dataset.dynamicShowcasePlaceholder || 0), usedIds);
    });
  }, {
    rootMargin: "240px 0px"
  });

  placeholders.forEach((placeholder) => observer.observe(placeholder));
}

function renderMarketShowcase() {
  if (!marketShowcase || !showcaseTrack) {
    return;
  }
  const showcaseItems = getShowcaseProducts();
  if (!showcaseItems.length) {
    marketShowcase.style.display = "none";
    showcaseTrack.replaceChildren();
    return;
  }
  renderShowcaseTrack(showcaseTrack, showcaseItems);
  marketShowcase.style.display = "block";
}

function enhanceShowcaseTracks(scope = document) {
  scope.querySelectorAll(".showcase-track").forEach((track) => {
    if (track.dataset.wingaTrackEnhanced === "true") {
      return;
    }
    track.dataset.wingaTrackEnhanced = "true";

    let pointerId = null;
    let activePointerType = "";
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerStartScrollLeft = 0;
    let activeTouchId = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartScrollLeft = 0;
    let isDragging = false;
    let hasPointerCapture = false;
    let suppressClickUntil = 0;

    const clearDragState = () => {
      if (hasPointerCapture && pointerId != null) {
        track.releasePointerCapture?.(pointerId);
      }
      pointerId = null;
      activePointerType = "";
      isDragging = false;
      hasPointerCapture = false;
      track.classList.remove("is-dragging");
    };

    const clearTouchState = () => {
      activeTouchId = null;
      touchStartX = 0;
      touchStartY = 0;
      touchStartScrollLeft = 0;
      if (isDragging) {
        suppressClickUntil = Date.now() + 220;
      }
      isDragging = false;
      track.classList.remove("is-dragging");
    };

    const beginHorizontalDrag = () => {
      if (isDragging) {
        return;
      }
      isDragging = true;
      track.classList.add("is-dragging");
    };

    const isInteractiveTarget = (target) => target instanceof Element
      && Boolean(target.closest("button, a, input, select, textarea, label, [data-product-action]"));

    track.addEventListener("wheel", (event) => {
      if (track.scrollWidth <= track.clientWidth || typeof WheelEvent === "undefined") {
        return;
      }
      const isFinePointer = window.matchMedia?.("(pointer: fine)")?.matches ?? false;
      if (!isFinePointer) {
        return;
      }
      if (!event.shiftKey) {
        return;
      }
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!Number.isFinite(dominantDelta) || Math.abs(dominantDelta) < 1) {
        return;
      }
      const nextScrollLeft = track.scrollLeft + dominantDelta;
      const clampedScrollLeft = Math.max(0, Math.min(nextScrollLeft, track.scrollWidth - track.clientWidth));
      if (Math.abs(clampedScrollLeft - track.scrollLeft) < 1) {
        return;
      }
      event.preventDefault();
      track.scrollLeft = clampedScrollLeft;
    }, { passive: false });

    track.addEventListener("click", (event) => {
      if (suppressClickUntil && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    if (typeof PointerEvent === "undefined") {
      return;
    }

    track.addEventListener("pointerdown", (event) => {
      if (track.scrollWidth <= track.clientWidth + 4 || isInteractiveTarget(event.target)) {
        return;
      }
      if (event.pointerType === "touch") {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      pointerId = event.pointerId;
      activePointerType = event.pointerType || "mouse";
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerStartScrollLeft = track.scrollLeft;
      isDragging = false;
      if (activePointerType === "mouse") {
        track.setPointerCapture?.(event.pointerId);
        hasPointerCapture = true;
      }
    });

    track.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;
      const isTouchLikePointer = activePointerType === "touch" || activePointerType === "pen";
      if (!isDragging) {
        const horizontalThreshold = isTouchLikePointer ? 8 : 5;
        const directionalBias = isTouchLikePointer ? 4 : 0;
        if (Math.abs(deltaX) < horizontalThreshold || Math.abs(deltaX) <= Math.abs(deltaY) + directionalBias) {
          return;
        }
        beginHorizontalDrag();
        if (!hasPointerCapture) {
          track.setPointerCapture?.(event.pointerId);
          hasPointerCapture = true;
        }
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      track.scrollLeft = pointerStartScrollLeft - deltaX;
    });

    track.addEventListener("pointerup", (event) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      if (isDragging) {
        suppressClickUntil = Date.now() + 220;
      }
      clearDragState();
    });

    track.addEventListener("pointercancel", (event) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      clearDragState();
    });

    track.addEventListener("lostpointercapture", () => {
      clearDragState();
    });
  });
}

function renderCurrentView() {
  const startedAt = getPerfNow();
  if (searchRuntimeState.renderDebounceTimer) {
    clearTimeout(searchRuntimeState.renderDebounceTimer);
    searchRuntimeState.renderDebounceTimer = 0;
  }

  try {
    if (!canAccessView(currentView)) {
      setCurrentViewState("home");
    }
    if (currentView !== "home") {
      disconnectContinuousDiscoveryObserver();
      stopSlideshow();
    }

    if (currentView !== "home") {
      pinnedDesktopCategory = "";
    }

    if (currentView !== "profile") {
      stopMessagePolling();
    }
    if (getViewportWidth() > 720 || currentView !== "home") {
      closeMobileCategoryMenu();
    }
    if (currentView === "home") {
      renderSlideshow();
      startSlideshow();
    } else {
      stopSlideshow();
    }
    const filteredProducts = getFilteredProducts();
    const isProfile = currentView === "profile";
    const isUpload = currentView === "upload" && canUseSellerFeatures();
    const isAdminView = currentView === "admin" && isStaffUser();
    const isGuest = !isAuthenticatedUser();
    const searchPriorityMode = hasPrioritySearchResults(filteredProducts.length) && !isProfile && !isUpload && !isAdminView;
    syncHeroPanelPosition(isProfile, isUpload);

    searchBox.style.display = isProfile || isUpload || isAdminView || isGuest ? "none" : "grid";
    searchToggleButton.style.display = isProfile || isUpload || isAdminView || isGuest ? "none" : "";
    searchImageButton.style.display = isProfile || isUpload || isAdminView || isGuest ? "none" : "";
    if (mobileCategoryShell) {
      mobileCategoryShell.style.display = isProfile || isUpload || isAdminView || isGuest ? "none" : "";
    }
    syncMobileCategorySheetOffset();
    searchBox.classList.toggle("mobile-open", searchRuntimeState.isMobileSearchOpen);
    syncSearchChromeState();
    renderImageSearchPreview();
    appContainer.classList.toggle("search-priority-mode", searchPriorityMode);
    productsSummary?.classList.toggle("search-priority-summary", searchPriorityMode);
    updateMarketplaceActionChrome();
    scheduleChromeOffsetSync();
    categories.style.display = isProfile || isAdminView || searchPriorityMode ? "none" : "grid";
    heroPanel.style.display = isProfile || isUpload || isAdminView || searchPriorityMode ? "none" : "flex";
    marketShowcase.style.display = isProfile || isUpload || isAdminView || searchPriorityMode ? "none" : "block";
    productsContainer.style.display = isProfile || isAdminView ? "none" : "grid";
    emptyState.style.display = !isProfile && !isAdminView && filteredProducts.length === 0 ? "block" : "none";
    uploadForm.style.display = isUpload || editingProductId ? "block" : "none";
    analyticsPanel.style.display = isAdminView || (isProfile && canUseSellerFeatures()) ? "block" : "none";
    adminPanel.style.display = isAdminView ? "block" : "none";
    syncBodyScrollLockState();

    if (profileDiv) {
      profileDiv.style.display = isProfile ? "block" : "none";
    }

    if (isAdminView) {
      renderSearchDropdown([], { isProfile, isUpload, isAdminView });
      renderAdminView();
      return;
    }

    if (isProfile) {
      renderProfile();
      renderSearchDropdown([], { isProfile, isUpload, isAdminView });
      return;
    }

    updateResultsMeta(filteredProducts.length);
    renderMarketShowcase();
    renderProducts(filteredProducts);
    enhanceShowcaseTracks(marketShowcase);
    enhanceShowcaseTracks(productsContainer);
    bindImageFallbacks(marketShowcase);
    bindImageFallbacks(productsContainer);
    bindProductMenus(marketShowcase);
    bindProductMenus(productsContainer);
    renderSearchDropdown(filteredProducts, { isProfile, isUpload, isAdminView });

    if (isUpload && !editingProductId) {
      productNameInput.focus();
    }
  } finally {
    reportSlowPath("render_current_view_slow", getPerfNow() - startedAt, {
      view: currentView,
      productsCount: Array.isArray(products) ? products.length : 0,
      selectedCategory
    }, 120);
  }
}

function renderProfile() {
  return renderProfileFromController();
}

function renderAdminView() {
  return renderAdminViewFromController();
}

function bindProfileIdentityActions() {
  return bindProfileIdentityActionsFromController();
}

function startEditProduct(productId) {
  const product = getProductById(productId);
  if (!product) {
    return;
  }

  editingProductId = productId;
  uploadTitle.innerText = "Hariri Bidhaa";
  cancelEditButton.style.display = "inline-flex";

  productNameInput.value = product.name;
  productPriceInput.value = hasProductPrice(product.price) ? String(product.price) : "";
  productShopInput.value = product.shop;
  productWhatsappInput.value = getCurrentWhatsappNumber();
  renderUploadCategoryOptions();
  productCategoryTopInput.value = inferTopCategoryValue(product.category) || "";
  productCategoryInput.value = product.category || "";
  renderUploadCategoryOptions();
  uploadCustomCategoryWrap.style.display = "none";
  uploadCustomCategoryInput.value = "";
  renderPreviewImages(product.images || [product.image]);
  productImageFileInput.value = "";

  setCurrentViewState("upload", {
    syncHistory: "push"
  });
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteProduct(productId) {
  const product = getProductById(productId);
  if (!product) {
    return;
  }

  if (!confirmAction(`Una uhakika unataka kufuta "${product.name}"?`)) {
    return;
  }

  window.WingaDataLayer.deleteProduct(productId)
    .then(() => {
      refreshProductsFromStore();
      reportClientEvent("info", "product_deleted", "Seller deleted a product.", {
        productId
      });
      showInAppNotification({
        title: "Product deleted",
        body: `"${product.name}" imeondolewa kwenye catalog yako.`,
        variant: "success"
      });
      renderCurrentView();
    })
    .catch((error) => {
      captureClientError("product_delete_failed", error, {
        productId
      });
      showInAppNotification({
        title: "Delete failed",
        body: error.message || "Imeshindikana kufuta bidhaa.",
        variant: "error"
      });
    });
}

function clearUploadForm() {
  editingProductId = null;
  uploadTitle.innerText = "Ongeza Bidhaa";
  cancelEditButton.style.display = "none";
  productNameInput.value = "";
  productPriceInput.value = "";
  productShopInput.value = currentUser || "";
  productWhatsappInput.value = getCurrentWhatsappNumber();
  renderUploadCategoryOptions();
  productCategoryTopInput.value = "";
  productCategoryInput.value = "";
  uploadCustomCategoryWrap.style.display = "none";
  uploadCustomCategoryInput.value = "";
  productImageFileInput.value = "";
  previewList.replaceChildren();
  previewList.style.display = "none";
}

function getFilteredProducts() {
  const rankingSearchTerms = AppCore.getSearchQueryDescriptor
    ? AppCore.getSearchQueryDescriptor(searchInput.value).expandedTerms
    : (searchInput.value ? [searchInput.value] : []);
  const baseList = AppCore.filterProducts
    ? AppCore.filterProducts({
        products,
        keyword: searchInput.value,
        selectedCategory,
        imageSignature: searchRuntimeState.activeImageSearch?.signature || "",
        similarityThreshold: 0.72,
        similarityFn: getImageSimilarityScore
      })
    : products.filter((product) => {
      const keyword = searchInput.value.trim().toLowerCase();
      const isVisibleStatus = product.status === "approved";
      const matchesKeyword = product.name.toLowerCase().includes(keyword) || product.shop.toLowerCase().includes(keyword);
      const matchesCategory = productMatchesSelectedCategory(product, selectedCategory);
      return isVisibleStatus && matchesKeyword && matchesCategory;
    });

  const filtered = applyProductFilters(baseList.filter((product) => shouldRenderMarketplaceProduct(product)));
  const sortMode = sortSelect?.value || "default";
  if (sortMode !== "default" || !filtered.length) {
    return prioritizeSellerMarketplaceMix(filtered);
  }

  return prioritizeSellerMarketplaceMix(rankProductsForSurface(filtered, {
    surface: currentView === "home" ? "home" : "default",
    limit: filtered.length,
    selectedCategory,
    searchTerms: rankingSearchTerms
  }));
}

function updateResultsMeta(listLength) {
  const filters = getSearchFilterState();
  const hasFilters = Boolean(
    searchInput.value.trim() ||
    searchRuntimeState.activeImageSearch?.signature ||
    selectedCategory !== "all" ||
    (Number.isFinite(filters.minPrice) && filters.minPrice > 0) ||
    (Number.isFinite(filters.maxPrice) && filters.maxPrice > 0) ||
    filters.location ||
    filters.sortBy !== "default"
  );

  resultsCount.innerText = `${listLength} results`;
  if (searchRuntimeState.activeImageSearch?.signature) {
    const clearButton = createElement("button", {
      attributes: {
        id: "clear-image-search",
        type: "button"
      },
      textContent: "Ondoa"
    });
    resultsCaption.replaceChildren();
    resultsCaption.append(`Image search active: ${searchRuntimeState.activeImageSearch.name} | Matokeo yamepangwa kwa similarity `);
    resultsCaption.appendChild(clearButton);
    clearButton.addEventListener("click", () => {
      searchRuntimeState.activeImageSearch = null;
      searchRuntimeState.isSearchDropdownDismissed = false;
      renderCurrentView();
    });
    return;
  }

  resultsCaption.innerText = hasFilters
      ? "Matokeo haya yamechujwa kwa search, category, filters na sorting uliyochagua."
      : "Bidhaa zote zilizopo sasa zinaonekana hapa.";
}

function setActiveNav(view) {
  navItems.forEach((item) => {
    const targetView = item.dataset.view;
    const shouldHide = (targetView === "upload" && !canUseSellerFeatures())
      || (targetView === "profile" && isStaffUser())
      || (targetView === "admin" && !isStaffUser());
    item.style.display = shouldHide ? "none" : "";
    item.classList.toggle("active", item.dataset.view === view);
  });
}

function showWelcomePopup() {
  const existingPopup = document.getElementById("welcome-popup");
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = document.createElement("div");
  popup.id = "welcome-popup";
  const popupShell = createElement("div", { className: "welcome-shell" });
  const welcomeName = getCurrentUserDisplayName();
  popupShell.append(
    createElement("p", { className: "welcome-kicker eyebrow", textContent: "Karibu tena" }),
    createElement("p", { className: "welcome-user", textContent: welcomeName }),
    createElement("h2", { textContent: "WINGA" }),
    createElement("p", { className: "welcome-tagline", textContent: "Bidhaa halisi. Maongezi ya haraka. Muonekano wa uhakika." }),
    createElement("p", { className: "welcome-note", textContent: "Karibu sokoni kwa utulivu na pace ya Kariakoo." })
  );
  popup.appendChild(popupShell);
  document.body.appendChild(popup);

  setTimeout(() => popup.classList.add("show"), 30);
  setTimeout(() => {
    popup.classList.remove("show");
    setTimeout(() => popup.remove(), 500);
  }, 4200);
}

function trackView(product) {
  if (!currentUser) {
    return false;
  }

  const viewedBy = Array.isArray(product.viewedBy) ? product.viewedBy : [];
  if (viewedBy.includes(currentUser)) {
    return false;
  }

  product.views += 1;
  product.viewedBy = [...viewedBy, currentUser];
  return true;
}

function getSlideshowItems() {
  const trendingSlide = buildTrendingKariakooSlide();
  return trendingSlide ? [trendingSlide, ...DEMO_SLIDES] : DEMO_SLIDES;
}

function renderProductGallery(product) {
  const safeImages = getRenderableMarketplaceImages(product);
  const firstImage = sanitizeImageSource(safeImages[0] || "", getImageFallbackDataUri("WINGA"));

  return `
    <div class="product-gallery media-gallery${safeImages.length > 1 ? " has-media-stack" : ""}">
      <img class="gallery-stage zoomable-image" src="${firstImage}" alt="${product.name}" data-gallery-stage="${product.id}" data-zoom-src="${firstImage}" data-zoom-alt="${product.name}" data-image-action-product="${product.id}" data-image-action-src="${firstImage}" data-image-action-surface="feed" loading="lazy" data-fallback-src="${getImageFallbackDataUri("WINGA")}">
      ${safeImages.length > 1 ? `
        <div class="gallery-thumbs">
          ${safeImages.map((image, index) => `
            <img
              class="gallery-thumb ${index === 0 ? "active" : ""}"
              src="${sanitizeImageSource(image, getImageFallbackDataUri("W"))}"
              alt="${product.name} ${index + 1}"
              data-gallery-target="${product.id}"
              data-image="${sanitizeImageSource(image, getImageFallbackDataUri("W"))}"
              data-disable-image-zoom="true"
              loading="lazy"
              data-fallback-src="${getImageFallbackDataUri("W")}">
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function beginPurchaseFlow(product) {
  if (product?.uploadedBy === currentUser) {
    showInAppNotification({
      title: "Your product",
      body: "Hii ni bidhaa yako. Tumia detail hii kuangalia taarifa au messages za wanunuzi.",
      variant: "info"
    });
    return;
  }

  if (isStaffUser()) {
    showInAppNotification({
      title: "Admin account restricted",
      body: "Admin au moderator hawawezi kuweka orders za marketplace. Tumia akaunti ya mteja au muuzaji.",
      variant: "warning"
    });
    return;
  }

  if (!isAuthenticatedUser()) {
    promptGuestAuth({
      preferredMode: "signup",
      role: "buyer",
      title: "You need an account to buy this product",
      message: "Already have an account? Sign In. New here? Sign Up kama mteja ili uendelee na malipo.",
      intent: { type: "focus-product", productId: product?.id }
    });
    return;
  }

  if (!product) {
    return;
  }

  if (!hasProductPrice(product.price)) {
    showInAppNotification({
      title: "Bei kwa maelewano",
      body: "Bidhaa hii haina bei ya wazi. Chat na muuzaji kwanza mkubaliane bei kabla ya kuweka order.",
      variant: "info"
    });
    if (product.uploadedBy !== currentUser) {
      openProductChat(product);
    }
    return;
  }

  const paymentInstructions = [
    "Lipa kwa Mobile Money",
    `Bidhaa: ${product.name}`,
    `Kiasi: ${formatProductPrice(product.price)}`,
    `Namba ya malipo: ${product.whatsapp}`,
    "",
    "Baada ya kulipa, weka receipt au transaction reference.",
    "Mfumo utahifadhi malipo yako na order itaingia Pending Verification hadi payment ithibitishwe."
  ].join("\n");

  const transactionId = prompt(paymentInstructions, "");
  if (!transactionId) {
    return;
  }

  window.WingaDataLayer.createOrder({
    productId: product.id,
    transactionId: transactionId.trim()
  }).then(() => {
    reportClientEvent("info", "order_created", "Buyer created an order from product detail.", {
      productId: product.id
    });
    showInAppNotification({
      title: "Request sent",
      body: "Transaction reference imepokelewa. Winga sasa inasubiri verification ya malipo kabla seller hajajibu na kuthibitisha order.",
      variant: "success"
    });
    if (currentView === "profile") {
      renderCurrentView();
    }
  }).catch((error) => {
    captureClientError("order_create_failed", error, {
      productId: product.id
    });
    showInAppNotification({
      title: "Order failed",
      body: error.message || "Imeshindikana kuweka order.",
      variant: "error"
    });
  });
}

function canRepostProductAsSeller(product) {
  return Boolean(
    product
    && isAuthenticatedUser()
    && !isStaffUser()
    && canUseSellerFeatures()
    && product.status === "approved"
    && product.uploadedBy
    && product.uploadedBy !== currentUser
  );
}

function getPreferredSellerShopName() {
  const ownLatestProduct = products.find((item) => item.uploadedBy === currentUser && typeof item.shop === "string" && item.shop.trim());
  return String(
    ownLatestProduct?.shop
    || currentSession?.shop
    || getCurrentDisplayName()
    || currentUser
    || "My Shop"
  ).trim();
}

async function repostProductAsSeller(sourceProduct) {
  if (!canRepostProductAsSeller(sourceProduct)) {
    showInAppNotification({
      title: "Repost unavailable",
      body: "Bidhaa hii haiwezi kurepostiwa kwa akaunti yako sasa hivi.",
      variant: "warning"
    });
    return;
  }

  const nextPriceInput = prompt([
    "Weka bei mpya ya listing hii.",
    `Bidhaa: ${sourceProduct.name}`,
    `Bei ya sasa: ${formatProductPrice(sourceProduct.price)}`,
    "",
    "Utaongeza listing mpya kwenye page yako."
  ].join("\n"), hasProductPrice(sourceProduct.price) ? String(sourceProduct.price) : "");

  if (nextPriceInput == null) {
    return;
  }

  const normalizedPrice = Number(String(nextPriceInput || "").replace(/,/g, "").trim());
  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 500 || normalizedPrice > 1000000000) {
    showInAppNotification({
      title: "Bei si sahihi",
      body: "Weka bei sahihi kuanzia TSh 500 au zaidi.",
      variant: "warning"
    });
    return;
  }

  const sourceImages = Array.isArray(sourceProduct.images) && sourceProduct.images.length > 0
    ? sourceProduct.images.filter(Boolean)
    : [sourceProduct.image].filter(Boolean);
  if (!sourceImages.length) {
    showInAppNotification({
      title: "Repost failed",
      body: "Bidhaa hii haina picha salama za kuunda repost mpya.",
      variant: "error"
    });
    return;
  }

  const imageSignature = sourceImages[0]
    ? await createImageSignatureFromSource(sourceImages[0]).catch(() => sourceProduct.imageSignature || "")
    : (sourceProduct.imageSignature || "");

  const repostPayload = {
    id: createId(),
    name: sourceProduct.name,
    price: normalizedPrice,
    shop: getPreferredSellerShopName(),
    whatsapp: getCurrentWhatsappNumber(),
    image: sourceImages[0] || "",
    images: sourceImages,
    imageSignature,
    uploadedBy: currentUser,
    category: sourceProduct.category,
    likes: 0,
    views: 0,
    viewedBy: [],
    originalProductId: sourceProduct.originalProductId || sourceProduct.id,
    originalSellerId: sourceProduct.originalSellerId || sourceProduct.uploadedBy,
    resellerId: currentUser,
    resalePrice: normalizedPrice,
    resoldStatus: "reposted"
  };

  try {
    await window.WingaDataLayer.createProduct(repostPayload);
    refreshProductsFromStore();
    const primaryCategory = inferTopCategoryValue(repostPayload.category) || repostPayload.category;
    await window.WingaDataLayer.updateUserPrimaryCategory(currentUser, primaryCategory);
    closeProductDetailModal();
    setCurrentViewState("profile", {
      syncHistory: "replace",
      historyState: {
        pendingProfileSection: ""
      }
    });
    renderCurrentView();
    reportClientEvent("info", "product_reposted", "Seller reposted another seller product.", {
      sourceProductId: sourceProduct.id,
      repostProductId: repostPayload.id,
      originalSellerId: repostPayload.originalSellerId
    });
    showInAppNotification({
      title: "Product reposted",
      body: `"${sourceProduct.name}" imeongezwa kwenye listings zako kwa bei mpya.`,
      variant: "success"
    });
  } catch (error) {
    captureClientError("product_repost_failed", error, {
      sourceProductId: sourceProduct.id
    });
    showInAppNotification({
      title: "Repost failed",
      body: error.message || "Imeshindikana kuunda repost ya bidhaa hii.",
      variant: "error"
    });
  }
}

function getSellerOtherProducts(product, limit = 6) {
  return getSellerOtherProductsFromController(product, limit);
}

function closeProductDetailModal(options = {}) {
  return closeProductDetailModalFromController(options);
}

function closeAllTransientOverlays(options = {}) {
  const {
    closeAuthModalIfGuest = true,
    skipProductHistoryBack = true,
    skipProductContextRestore = true
  } = options;

  if (searchRuntimeState.isMobileCategoryOpen || mobileCategoryShell?.classList.contains("open")) {
    closeMobileCategoryMenu();
  }
  closeImageLightbox();
  closeMediaActionSheet();
  closeContextChatModal();
  closeProductDetailModal({
    skipHistoryBack: skipProductHistoryBack,
    skipContextRestore: skipProductContextRestore
  });
  if (closeAuthModalIfGuest && !isAuthenticatedUser()) {
    closeAuthModal();
  } else {
    syncBodyScrollLockState();
  }
}

function openProductDetailModal(productId, options = {}) {
  const normalizedProductId = normalizeProductIdValue(productId);
  const product = getProductById(normalizedProductId);
  if (!product) {
    return;
  }

  return openProductDetailModalFromController(normalizedProductId, {
    allowBrokenImageFallbackOpen: true,
    ...options
  });
}


function renderAlternativeOffers(product) {
  const offers = getAlternativeOffers(product);
  if (!offers.length) {
    return "";
  }

  return `
    <div class="offer-cluster">
      <p class="offer-cluster-title">Maduka mengine yenye bidhaa hii</p>
      <div class="offer-list">
        ${offers.map((offer) => `
          <div class="offer-pill">
            <span>${offer.shop}</span>
            <strong>${formatProductPrice(offer.price)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function getProductDownloadName(product) {
  return product.name.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "winga-product";
}

async function handleShareProduct(product) {
  if (!product) {
    return;
  }

  const shareText = `${product.name} - ${formatProductPrice(product.price)} | ${product.shop}`;
  const shareUrl = `${window.location.origin}${getProductDetailPath(product.id)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: product.name,
        text: shareText,
        url: shareUrl
      });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(`${shareText} | Link: ${shareUrl}`);
    showInAppNotification({
      title: "Share ready",
      body: "Maelezo ya bidhaa yame-copy kwa sharing.",
      variant: "success"
    });
    return;
  }

  alert(`${shareText} | Link: ${shareUrl}`);
}

function handleAccessRouteChange() {
  if (isAdminLoginRoute()) {
    if (isStaffUser()) {
      hideAdminLoginScreen();
      appContainer.style.display = "block";
      setCurrentViewState("admin");
      renderCurrentView();
      return;
    }
    if (isAuthenticatedUser()) {
      setAdminLoginRouteActive(false, { replace: true });
      showInAppNotification({
        title: "Admin access only",
        body: "Route hii ni ya admin au moderator pekee.",
        variant: "warning"
      });
      appContainer.style.display = "block";
      setCurrentViewState("home");
      renderCurrentView();
      return;
    }
    showAdminLoginScreen();
    return;
  }

  hideAdminLoginScreen();
  if (!isAuthenticatedUser()) {
    appContainer.style.display = "block";
    refreshPublicEntryChrome();
    setCurrentViewState("home");
    renderCurrentView();
  }
}

function triggerProductDownload(product) {
  const link = document.createElement("a");
  link.href = product.image;
  link.download = getProductDownloadName(product);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function bindGalleryThumbs(scope) {
  bindImageFallbacks(scope);
  scope.querySelectorAll(".gallery-thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const targetId = thumb.dataset.galleryTarget;
      const stage = scope.querySelector(`[data-gallery-stage="${targetId}"]`);
      if (!stage) {
        return;
      }

      stage.src = thumb.dataset.image;
      stage.dataset.zoomSrc = thumb.dataset.image;
      stage.dataset.imageActionSrc = thumb.dataset.image;
      scope.querySelectorAll(`[data-gallery-target="${targetId}"]`).forEach((item) => {
        item.classList.remove("active");
      });
      thumb.classList.add("active");
    });
  });
}

function bindImageFallbacks(scope = document) {
  scope.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    if (image.dataset.fallbackBound === "true") {
      return;
    }
    image.dataset.fallbackBound = "true";
    image.addEventListener("error", () => {
      if (!image.dataset.fallbackSrc) {
        return;
      }
      const productId = image.dataset.imageActionProduct || "";
      const imageSource = image.currentSrc || image.getAttribute("src") || image.dataset.imageActionSrc || "";
      if (productId && imageSource) {
        noteBrokenMarketplaceImage(productId, imageSource);
      }
      image.src = image.dataset.fallbackSrc;
      image.removeAttribute("data-fallback-src");
    }, { once: true });
    if (image.dataset.fallbackLoadBound !== "true") {
      image.dataset.fallbackLoadBound = "true";
      image.addEventListener("load", () => {
        const productId = image.dataset.imageActionProduct || "";
        const loadedSource = image.currentSrc || image.getAttribute("src") || image.dataset.imageActionSrc || "";
        if (
          productId
          && loadedSource
          && loadedSource !== image.dataset.fallbackSrc
          && loadedSource !== MARKETPLACE_SCROLL_IMAGE_PLACEHOLDER
        ) {
          clearBrokenMarketplaceImage(productId, loadedSource);
        }
      });
    }
  });
  bindMarketplaceScrollImages(scope);
}

function unbindMarketplaceScrollImages(scope = document) {
  if (!scope?.querySelectorAll) {
    return;
  }
  scope.querySelectorAll("img[data-marketplace-scroll-image='true']").forEach((image) => {
    marketplaceScrollImageObserver?.unobserve?.(image);
    delete image.dataset.marketplaceScrollBound;
  });
}

function activateMarketplaceScrollImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const realSrc = image.dataset.marketplaceRealSrc || image.dataset.imageActionSrc || image.dataset.zoomSrc || "";
  if (!realSrc) {
    return;
  }
  if (image.getAttribute("src") !== realSrc) {
    image.setAttribute("src", realSrc);
  }
  image.dataset.marketplaceImageState = "active";
}

function prefetchMarketplaceScrollImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const realSrc = image.dataset.marketplaceRealSrc || image.dataset.imageActionSrc || image.dataset.zoomSrc || "";
  if (!realSrc || marketplaceScrollImagePrefetchedSources.has(realSrc)) {
    return;
  }
  marketplaceScrollImagePrefetchedSources.add(realSrc);
  const warmImage = new Image();
  warmImage.decoding = "async";
  warmImage.src = realSrc;
  image.dataset.marketplaceImageState = "prefetched";
}

function ensureMarketplaceScrollImageObserver() {
  if (marketplaceScrollImageObserver || typeof IntersectionObserver === "undefined") {
    return marketplaceScrollImageObserver;
  }
  marketplaceScrollImageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const image = entry.target;
      if (!(image instanceof HTMLImageElement)) {
        return;
      }
      if (entry.isIntersecting) {
        activateMarketplaceScrollImage(image);
        prefetchMarketplaceScrollImage(image);
        return;
      }
      prefetchMarketplaceScrollImage(image);
    });
  }, {
    rootMargin: getMarketplaceScrollImageRootMargin(),
    threshold: 0.01
  });
  return marketplaceScrollImageObserver;
}

function bindMarketplaceScrollImages(scope = document) {
  const observer = ensureMarketplaceScrollImageObserver();
  scope.querySelectorAll("img[data-marketplace-scroll-image='true']").forEach((image) => {
    if (image.dataset.marketplaceScrollBound === "true") {
      return;
    }
    image.dataset.marketplaceScrollBound = "true";
    image.dataset.marketplaceRealSrc = image.getAttribute("src") || image.dataset.imageActionSrc || "";
    const rect = image.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const prefetchMargin = getMarketplaceScrollImagePrefetchMargin();
    const isNearViewport = rect.bottom >= -prefetchMargin && rect.top <= viewportHeight + prefetchMargin;
    if (isNearViewport) {
      image.setAttribute("loading", "eager");
      image.setAttribute("fetchpriority", "high");
      activateMarketplaceScrollImage(image);
      prefetchMarketplaceScrollImage(image);
    } else {
      image.setAttribute("loading", "lazy");
      image.setAttribute("fetchpriority", "auto");
    }
    observer?.observe(image);
  });
}

function bindProductMenus(scope) {
  const closeMenus = () => {
    scope.querySelectorAll(".product-menu.open").forEach((menu) => {
      menu.classList.remove("open");
    });
  };

  const handleDocumentClick = (event) => {
    if (!event.target.closest(".product-menu")) {
      closeMenus();
      document.removeEventListener("click", handleDocumentClick);
    }
  };

  scope.querySelectorAll("[data-menu-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".product-menu");
      if (!menu) {
        return;
      }

      const willOpen = !menu.classList.contains("open");
      closeMenus();
      if (willOpen) {
        menu.classList.add("open");
        document.removeEventListener("click", handleDocumentClick);
        document.addEventListener("click", handleDocumentClick);
      }
    });
  });

  scope.querySelectorAll(".product-menu-popup").forEach((popup) => {
    popup.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  scope.querySelectorAll("[data-menu-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const product = getProductById(button.dataset.id);
      closeMenus();
      if (!product) {
        return;
      }

      if (button.dataset.menuAction === "share") {
        await handleShareProduct(product);
        return;
      }

      if (button.dataset.menuAction === "download") {
        triggerProductDownload(product);
        return;
      }

      if (button.dataset.menuAction === "delete") {
        deleteProduct(product.id);
      }
    });
  });
}

function renderPreviewImages(images) {
  const safeImages = images.filter(Boolean);
  previewList.replaceChildren(
    ...safeImages.map((image, index) => createElement("img", {
      className: "preview-thumb zoomable-image",
      attributes: {
        src: image,
        alt: `Preview ${index + 1}`,
        "data-zoom-src": image,
        "data-zoom-alt": `Preview ${index + 1}`
      }
    }))
  );
  previewList.style.display = safeImages.length > 0 ? "grid" : "none";
}

function renderPreviewFiles(files) {
  return readFilesAsDataUrls(files)
    .then((images) => {
      renderPreviewImages(images);
    })
    .catch((error) => {
      previewList.replaceChildren();
      previewList.style.display = "none";
      throw error;
    });
}

function readFilesAsDataUrls(files) {
  return Promise.all(files.map((file) => readFileAsDataUrl(file, { purpose: "product" })));
}

function stopSlideshow() {
  if (uiRuntimeState.slideshowTimer) {
    clearInterval(uiRuntimeState.slideshowTimer);
    uiRuntimeState.slideshowTimer = null;
  }
}

function startSlideshow() {
  stopSlideshow();

  const items = getSlideshowItems();
  if (items.length <= 1) {
    return;
  }

  uiRuntimeState.slideshowTimer = setInterval(() => {
    uiRuntimeState.slideIndex = (uiRuntimeState.slideIndex + 1) % items.length;
    renderSlideshow();
  }, 4000);
}

slidePrevButton.addEventListener("click", () => {
  const items = getSlideshowItems();
  uiRuntimeState.slideIndex = (uiRuntimeState.slideIndex - 1 + items.length) % items.length;
  renderSlideshow();
  startSlideshow();
});

slideNextButton.addEventListener("click", () => {
  const items = getSlideshowItems();
  uiRuntimeState.slideIndex = (uiRuntimeState.slideIndex + 1) % items.length;
  renderSlideshow();
  startSlideshow();
});

bindMarketplaceCardActions();
bindTrustReportEntryActions();
bindImageActionInteractions();
bindImageZoomInteractions();

const SESSION_RESTORE_BOOT_TIMEOUT_MS = Math.max(
  2500,
  Number(window.WINGA_CONFIG?.sessionRestoreTimeoutMs || 6000)
);

async function resolveSessionRestoreForBoot(restorePromise, { hasCachedSession = false } = {}) {
  let timeoutId = 0;
  const timeoutResult = { timedOut: true, session: null };
  try {
    const result = await Promise.race([
      Promise.resolve(restorePromise)
        .then((session) => ({ timedOut: false, session: session || null }))
        .catch((error) => {
          captureClientError("session_restore_boot_failed", error, {
            category: "auth",
            alertSeverity: "high",
            hasCachedSession
          });
          return { timedOut: false, session: null };
        }),
      new Promise((resolve) => {
        timeoutId = window.setTimeout(() => resolve(timeoutResult), SESSION_RESTORE_BOOT_TIMEOUT_MS);
      })
    ]);

    if (result?.timedOut) {
      reportClientEvent("warn", "session_restore_timed_out", "Session restore timed out during boot.", {
        category: "auth",
        alertSeverity: hasCachedSession ? "high" : "medium"
      });
      clearSessionUser();
      applySessionState(null);
      clearAppViewState();
    }

    return result?.session || null;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function bootApp() {
  reportClientEvent("info", "app_boot_started", "Client app boot started.", {
    category: "runtime"
  });
  syncAuthMode();
  const cachedSession = window.WingaDataLayer.bootstrapSession
    ? window.WingaDataLayer.bootstrapSession()
    : null;
  const shouldRestoreSession = Boolean(cachedSession?.username);

  if (shouldRestoreSession) {
    applySessionState(cachedSession);
    showSessionRestoringState(
      isStaffRole(cachedSession.role)
        ? "Tunathibitisha staff session yako kabla ya kufungua admin surface."
        : "Tunathibitisha session yako ya mteja au muuzaji kabla ya kuendelea."
    );
  }

  await window.WingaDataLayer.init();
  const rememberedSessionPromise = window.WingaDataLayer.restoreSession();

  refreshProductsFromStore();
  if (products.length === 0) {
    products = DEFAULT_PRODUCTS.map(normalizeProduct);
    rebuildProductIndex();
  }
    mergeAvailableCategories(inferCategoriesFromData());
    refreshCategoryUI();
    window.WingaDataLayer.loadReviews()
      .then((reviewPayload) => {
        currentReviews = Array.isArray(reviewPayload?.reviews) ? reviewPayload.reviews : [];
        reviewSummaries = reviewPayload?.summaries || {};
        if (!shouldRestoreSession) {
          renderCurrentView();
        }
      })
      .catch((error) => {
        currentReviews = [];
        reviewSummaries = {};
        captureClientError("reviews_boot_load_failed", error, {
          category: "runtime",
          alertSeverity: "medium"
        });
      });
    if (!shouldRestoreSession) {
      renderCurrentView();
    }
  hydrateMissingImageSignatures(products).catch(() => {
    // Ignore passive image signature hydration failures during boot.
  });

  const rememberedSession = await resolveSessionRestoreForBoot(rememberedSessionPromise, {
    hasCachedSession: Boolean(cachedSession?.username)
  });

  if (cachedSession?.username) {
    if (rememberedSession?.username) {
      if (isAdminLoginRoute() && !isStaffRole(rememberedSession.role)) {
        setAdminLoginRouteActive(false, { replace: true });
        showInAppNotification({
          title: "Admin access only",
          body: "Route hii ni ya admin au moderator pekee.",
          variant: "warning"
        });
      }
      applySessionState({
        ...cachedSession,
        ...rememberedSession
      });
      saveSessionUser(currentSession);
      loginSuccess(
        currentSession.username,
        currentSession.primaryCategory || "",
        currentSession,
        {
          restoreView: true,
          skipWelcome: true,
          forceView: isStaffRole(currentSession.role) ? "admin" : ""
        }
      );
      reportClientEvent("info", "session_restore_succeeded", "Cached session restored during boot.", {
        category: "auth",
        role: currentSession.role || ""
      });
      return;
    }

    reportClientEvent("warn", "session_restore_failed", "Cached session could not be restored during boot.", {
      category: "auth",
      alertSeverity: "high",
      role: cachedSession?.role || ""
    });
    logout();
    showLoggedOutState({
      audience: isStaffRole(cachedSession?.role || "") || isAdminLoginRoute() ? "admin" : "public",
      message: "Session yako imeisha. Ingia tena kuendelea."
    });
    return;
  } else if (rememberedSession?.username) {
    if (isAdminLoginRoute() && !isStaffRole(rememberedSession.role)) {
      setAdminLoginRouteActive(false, { replace: true });
      showInAppNotification({
        title: "Admin access only",
        body: "Route hii ni ya admin au moderator pekee.",
        variant: "warning"
      });
    }
    loginSuccess(
      rememberedSession.username,
      rememberedSession.primaryCategory || "",
      rememberedSession,
      {
        restoreView: false,
        skipWelcome: true,
        forceView: isStaffRole(rememberedSession.role) ? "admin" : ""
      }
    );
    reportClientEvent("info", "session_restore_succeeded", "Stored session restored during boot.", {
      category: "auth",
      role: rememberedSession.role || ""
    });
    return;
  }

  if (isAdminLoginRoute()) {
    showAdminLoginScreen();
    return;
  }

  reportClientEvent("info", "app_boot_completed", "Client app boot completed.", {
    category: "runtime",
    authState: currentUser ? "signed_in" : "guest"
  });

  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  appContainer.style.display = "block";
  refreshPublicEntryChrome();
  setCurrentViewState("home");
  renderSlideshow();
  renderCurrentView();
  openDeepLinkedProductRouteIfNeeded();
  scheduleChromeOffsetSync();

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => {
      scheduleChromeOffsetSync();
    });
    resizeObserver.observe(topBar);
    resizeObserver.observe(bottomNav);
  }
}

bootApp().catch((error) => {
  console.error("[WINGA] bootApp failed", error);
  captureClientError("boot_failed", error, {
    provider: window.WINGA_CONFIG?.provider || "unknown"
  });
  showFatalStartupState(error);
});










