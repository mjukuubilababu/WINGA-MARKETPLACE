const USERS_KEY = "winga-users";
const PRODUCTS_KEY = "winga-products";
const SESSION_KEY = "winga-current-user";
const APP_VIEW_KEY = "winga-app-view";
const REQUEST_BOX_KEY_PREFIX = "winga-request-box";
const { CHAT_EMOJI_CHOICES } = window.WingaModules.config.chat;
const {
  MARKETPLACE_CATEGORY_TREE,
  DEFAULT_TOP_CATEGORIES,
  DEFAULT_PRODUCT_CATEGORIES,
  LEGACY_CATEGORY_MAPPINGS
} = window.WingaModules.config.categories;
const MAX_UPLOAD_IMAGES = 5;
const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
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

function getRestorableCategory(categoryValue) {
  if (!categoryValue || categoryValue === "all") {
    return "all";
  }
  return isValidProductCategory(categoryValue) || isTopCategoryValue(categoryValue)
    ? categoryValue
    : "all";
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

function setCurrentViewState(nextView, options = {}) {
  const { syncNav = true, persist = true } = options;
  currentView = nextView;
  if (syncNav) {
    setActiveNav(currentView);
  }
  if (persist) {
    saveAppViewState();
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
}

function applySessionState(session) {
  currentSession = session || null;
  currentUser = session?.username || "";
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
  mobileCategoryShell?.classList.remove("open");
  mobileCategoryButton?.setAttribute("aria-expanded", "false");
  syncMobileHeaderVisibility(true);
}

function toggleMobileCategoryMenu(forceState) {
  searchRuntimeState.isMobileCategoryOpen = typeof forceState === "boolean" ? forceState : !searchRuntimeState.isMobileCategoryOpen;
  if (searchRuntimeState.isMobileCategoryOpen) {
    expandedBrowseCategory = "";
    renderFilterCategories();
  }
  mobileCategoryShell?.classList.toggle("open", searchRuntimeState.isMobileCategoryOpen);
  mobileCategoryButton?.setAttribute("aria-expanded", String(searchRuntimeState.isMobileCategoryOpen));
  syncMobileHeaderVisibility(true);
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

function createId() {
  return `product-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function detectCategory(name) {
  const nameLower = name.toLowerCase();
  if (nameLower.includes("gauni")) return "wanawake-magauni";
  if (nameLower.includes("sketi")) return "wanawake-sketi";
  if (nameLower.includes("blauzi")) return "wanawake-blauzi";
  if (nameLower.includes("suti")) return "wanaume-suti";
  if (nameLower.includes("jeans")) return "wanaume-jeans";
  if (nameLower.includes("shati")) return "wanaume-mashati";
  if (nameLower.includes("t-shirt")) return "wanaume-t-shirt";
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
  const nationalId = normalizeNationalId(nationalIdInput.value);
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();
  const passwordMinLength = getAuthPasswordMinLength();

  if (!identityValue || !phoneNumber || !nationalId || !password || !confirmPassword) {
    return selectedAuthRole === "buyer"
      ? "Jaza full name, namba ya simu, NIDA, password, na confirm password."
      : "Jaza username, namba ya simu, NIDA, password, na confirm password.";
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return "Weka namba ya simu ya WhatsApp sahihi yenye tarakimu 10 hadi 15.";
  }

  if (!isValidNationalId(nationalId)) {
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

  if (selectedAuthRole === "seller") {
    if (!sellerIdentityDocumentTypeInput?.value) {
      return "Chagua aina ya identity document ya muuzaji.";
    }
    if (!sellerPassportPhotoInput?.files?.[0]) {
      return "Upload passport photo ya muuzaji.";
    }
    if (!sellerIdentityDocumentImageInput?.files?.[0]) {
      return "Upload picha ya identity document ya muuzaji.";
    }

    try {
      validateSingleImageFile(sellerPassportPhotoInput.files[0], "Passport photo");
      validateSingleImageFile(sellerIdentityDocumentImageInput.files[0], "Identity document");
    } catch (error) {
      return error.message || "Picha za verification za muuzaji si sahihi.";
    }
  }

  return "";
}

function isValidProductCategory(category) {
  return availableCategories.some((item) => item.value === category);
}

function validateImageFiles(files) {
  if (files.length > MAX_UPLOAD_IMAGES) {
    throw new Error(`Chagua picha zisizozidi ${MAX_UPLOAD_IMAGES}.`);
  }

  files.forEach((file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error("Tumia picha za JPG, PNG, WEBP au GIF tu.");
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("Kila picha inapaswa kuwa chini ya 3MB.");
    }
  });
}

function validateSingleImageFile(file, label = "Picha") {
  if (!file) {
    throw new Error(`${label} inahitajika.`);
  }
  validateImageFiles([file]);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Hakuna picha iliyochaguliwa."));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result || "");
    reader.onerror = () => reject(new Error("Imeshindikana kusoma picha uliyochagua."));
    reader.readAsDataURL(file);
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
  const match = availableCategories.find((item) => item.value === category)
    || availableTopCategories.find((item) => item.value === category)
    || LEGACY_CATEGORY_MAPPINGS[category];
  return match ? match.label : humanizeCategoryValue(category) || "Other";
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
  getCurrentView: () => currentView
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
  isLogin = mode !== "signup";
  authSignupStep = 1;
  selectedAuthRole = options.role || "seller";
  syncAuthMode();
  hideAdminLoginScreen();
  if (options.gated) {
    showAuthGatePrompt(options);
  } else {
    hideAuthGatePrompt();
  }
  authContainer.style.display = "block";
  document.body.classList.add("auth-modal-open");
}

function closeAuthModal() {
  if (isAuthenticatedUser()) {
    return;
  }
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  hideAuthGatePrompt();
}

function promptGuestAuth(options = {}) {
  pendingGuestIntent = options.intent || null;
  openAuthModal(options.preferredMode || "signup", {
    gated: true,
    role: options.role || "buyer",
    title: options.title || "You need an account to continue",
    message: options.message || "Already have an account? Sign In. New here? Sign Up."
  });
}

function refreshPublicEntryChrome() {
  const isGuest = !isAuthenticatedUser();
  if (publicHeaderActions) {
    publicHeaderActions.style.display = isGuest ? "flex" : "none";
  }
  if (headerUserMenu) {
    headerUserMenu.style.display = isGuest ? "none" : "flex";
  }
  if (publicFooter) {
    publicFooter.style.display = isGuest ? "block" : "none";
  }
  if (headerSearchArea) {
    headerSearchArea.style.display = isGuest ? "none" : "flex";
  }
  if (topBarSubtitle) {
    topBarSubtitle.innerText = isGuest
      ? "Discover products first. Sign in only when you want to buy, chat, or sell."
      : "";
    topBarSubtitle.style.display = isGuest ? "" : "none";
  }
  updateMarketplaceActionChrome();
  renderHeaderUserMenu();
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
    setCurrentViewState("admin");
    renderCurrentView();
    return;
  }
  profileRuntimeState.pendingSection = sectionId;
  toggleHeaderUserMenu(false);
  setCurrentViewState("profile");
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

function getAdminNavLabel() {
  return isModeratorUser() ? "Moderation" : "Admin";
}

function getMarketplaceUser(username) {
  return getUsers().find((user) => user.username === username) || null;
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
  lastViewedProductId = productId;
  recentlyViewedProductIds = [productId, ...recentlyViewedProductIds.filter((item) => item !== productId)].slice(0, 12);
}

function noteProductDiscovery(productId) {
  if (!productId) {
    return;
  }
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

function getChatWhatsappNumber(context) {
  if (!context) {
    return "";
  }
  const relatedProduct = context.productId ? getProductById(context.productId) : null;
  const fallbackPhone = context.withUser === currentUser
    ? getCurrentWhatsappNumber()
    : normalizeWhatsapp(getMarketplaceUser(context.withUser)?.whatsappNumber || getMarketplaceUser(context.withUser)?.phoneNumber || "");
  return normalizeWhatsapp(relatedProduct?.whatsapp || fallbackPhone);
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

  currentMessages.forEach((message) => {
    const withUser = getMessagePartner(message);
    if (!withUser) {
      return;
    }
    const productId = message.productId || "";
    const key = getChatContextKey({ withUser, productId });
    const existing = summaryMap.get(key);
    const summary = {
      key,
      withUser,
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
      productId: chatUiState.activeContext.productId || "",
      productName: chatUiState.activeContext.productName || "",
      latestMessage: "",
      timestamp: "",
      whatsapp: getChatWhatsappNumber(chatUiState.activeContext)
    });
  }

  return summaries;
}

function getTotalUnreadMessages() {
  return currentMessages.filter((message) => message.receiverId === currentUser && !message.isRead).length;
}

function getUnreadNotifications() {
  return currentNotifications.filter((notification) => !notification.isRead);
}

function updateProfileNavBadge() {
  const profileNav = document.querySelector('.nav-item[data-view="profile"]');
  if (!profileNav) {
    renderHeaderUserMenu();
    return;
  }

  const totalUnread = getTotalUnreadMessages();
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

function showInAppNotification(notification) {
  if (!notification || !notification.title) {
    return;
  }

  const root = ensureNotificationToastRoot();
  const toast = document.createElement("div");
  const variant = ["success", "warning", "error", "info"].includes(notification.variant)
    ? notification.variant
    : "info";
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

  if ("Notification" in window && document.visibilityState === "hidden") {
    if (Notification.permission === "granted") {
      new Notification(notification.title, { body: notification.body || "" });
    } else if (Notification.permission === "default") {
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
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  hideAdminLoginScreen();
  appContainer.style.display = "block";
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
  const {
    audience = "public",
    message = ""
  } = options;

  hideAdminLoginScreen();
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  appContainer.style.display = "block";
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
  if (message) {
    showInAppNotification({
      title: "Login needed",
      body: message,
      variant: "warning"
    });
  }
}

function setAuthInteractionPending(kind, pending) {
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
    authButton,
    authNextButton,
    authBackButton
  ].forEach((element) => {
    if (element) {
      element.disabled = isPending;
    }
  });
  if (authButton) {
    authButton.innerText = isPending
      ? (isLogin ? "Inaingia..." : "Inatengeneza akaunti...")
      : (isLogin ? "Ingia" : "Tengeneza Akaunti");
  }
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
      await refreshNotificationsState();
      if (payload?.notification) {
        showInAppNotification(payload.notification);
      }
      if (currentView === "profile" && profileDiv) {
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
  if (chatUiState.activeContext && summaries.some((item) => item.key === getChatContextKey(chatUiState.activeContext))) {
    return;
  }
  chatUiState.activeContext = summaries[0]
    ? {
      withUser: summaries[0].withUser,
      productId: summaries[0].productId,
      productName: summaries[0].productName,
      whatsapp: summaries[0].whatsapp
    }
    : chatUiState.activeContext;
}

async function refreshMessagesState() {
  const startedAt = getPerfNow();
  try {
    currentMessages = await window.WingaDataLayer.loadMessages();
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

function renderMarketplaceTrustBadges(product) {
  const owner = getMarketplaceUser(product.uploadedBy);
  if (!owner) {
    return "";
  }

  const badges = [];
  if (owner.verifiedSeller) {
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
  getActiveConversationMessages,
  getActiveChatContext: () => chatUiState.activeContext,
  getCurrentMessageDraft: () => chatUiState.currentDraft,
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
  getCurrentUser: () => currentUser
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
  setActiveChatContext: (context) => {
    chatUiState.activeContext = context;
  },
  getActiveChatContext: () => chatUiState.activeContext,
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
  startMessagePolling,
  stopMessagePolling,
  markActiveConversationRead,
  replaceMessagesPanel,
  createNotificationsContainerFromState,
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
  createOrdersSectionElement,
  createPromotionOverviewSectionElement
} = window.WingaModules.profile.createProfileUiModule({
  createElement,
  createSectionHeading,
  createFragmentFromMarkup,
  createElementFromMarkup,
  createStatusPill,
  createStatBox,
  escapeHtml,
  sanitizeImageSource,
  renderProductGallery,
  formatNumber,
  formatProductPrice,
  getStatusLabel,
  getPaymentStatusLabel,
  getOrderProgressLabel,
  getVerificationStatusLabel,
  getOrderActionButtons,
  renderPromotionBadges,
  renderPromoteButton,
  renderSellerSoldOutButton,
  renderWhatsappChatLink,
  renderProductOverflowMenu
});

const {
  renderProfile: renderProfileFromController,
  bindProfileIdentityActions: bindProfileIdentityActionsFromController
} = window.WingaModules.profile.createProfileControllerModule({
  createProfileShellElement,
  createProfileProductCardElement,
  createProfileIdentitySectionElement,
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
  createProductDetailContentElement
} = window.WingaModules.productDetail.createProductDetailUiModule({
  createElement,
  createFragmentFromMarkup,
  sanitizeImageSource,
  escapeHtml,
  getCategoryLabel,
  formatNumber,
  formatProductPrice,
  getImageFallbackDataUri,
  renderRequestBoxButton,
  renderWhatsappChatLink,
  getCurrentUser: () => currentUser,
  renderProductActionGroup,
  renderMarketplaceTrustBadges,
  renderDiscoveryProductCards
});

const {
  getSellerOtherProducts: getSellerOtherProductsFromController,
  closeProductDetailModal: closeProductDetailModalFromController,
  openProductDetailModal: openProductDetailModalFromController
} = window.WingaModules.productDetail.createProductDetailControllerModule({
  ensureProductDetailModal,
  createProductDetailContentElement,
  getProducts: () => products,
  getProductById,
  getMarketplaceUser,
  getDiscoveryRelatedProducts: (...args) => getDiscoveryRelatedProducts(...args),
  getDiscoverySponsoredProducts: (...args) => getDiscoverySponsoredProducts(...args),
  getImageFallbackDataUri,
  noteProductInterest,
  noteProductDiscovery,
  scrollToProductCard,
  renderProductReviewSummary,
  renderSellerReviewSummary,
  renderProductReviewForm,
  renderProductReviewsList,
  openProductChat,
  openOwnProductMessages,
  beginPurchaseFlow,
  toggleProductInRequestBox,
  showInAppNotification,
  resetHomeBrowseState,
  setCurrentViewState,
  renderCurrentView,
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
  isTopCategoryValue,
  inferTopCategoryValue,
  getCategoryPreviewProduct,
  getSubcategoriesForTopCategory,
  getCategoryLabel,
  getCategoriesTarget: () => categories,
  getMobileCategoryMenu: () => mobileCategoryMenu,
  closeMobileCategoryMenu,
  onCategorySelect: ({ nextCategory, isMobileScope, mobileExpandedTopCategory }) => {
    if (!isMobileScope) {
      setCategorySelectionState(nextCategory, {
        expandedBrowseCategory: nextCategory === "all" ? "" : inferTopCategoryValue(nextCategory)
      });
      renderFilterCategories();
      renderCurrentView();
      return;
    }

    const isSameExpandedCategory = nextCategory !== "all" && mobileExpandedTopCategory === nextCategory;
    if (nextCategory === "all") {
      setCategorySelectionState("all", {
        expandedBrowseCategory: ""
      });
      closeMobileCategoryMenu();
    } else if (isSameExpandedCategory) {
      setCategorySelectionState(nextCategory, {
        expandedBrowseCategory: ""
      });
    } else {
      setCategorySelectionState(nextCategory, {
        expandedBrowseCategory: nextCategory
      });
    }
    renderFilterCategories();
    renderCurrentView();
  },
  onSubcategorySelect: ({ nextCategory, parentCategory, isMobileScope }) => {
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
  createDynamicShowcasePlaceholderElement
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
  renderMarketplaceTrustBadges,
  renderProductActionGroup,
  noteProductInterest,
  openProductDetailModal,
  getBehaviorShowcaseDescriptor,
  getRecommendationSeed,
  getRelatedProducts: (...args) => getRelatedProducts(...args),
  getYouMayLikeProducts,
  getTrendingProducts,
  bindShowcaseCardClicks,
  setupDynamicShowcaseLoading,
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
  if (view === "home" || view === "profile") {
    return true;
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
    title: "WINGA Demo Showcase",
    subtitle: "Hizi ni picha za demo mpaka uanze ku-upload picha zako mwenyewe."
  },
  {
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 700'><defs><linearGradient id='g2' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%231f1a17'/><stop offset='1' stop-color='%23c65a1e'/></linearGradient></defs><rect width='1600' height='700' fill='url(%23g2)'/><rect x='130' y='120' width='260' height='340' rx='26' fill='rgba(255,255,255,0.16)'/><rect x='430' y='160' width='290' height='290' rx='26' fill='rgba(255,255,255,0.14)'/><rect x='770' y='100' width='300' height='380' rx='26' fill='rgba(255,255,255,0.18)'/><rect x='1110' y='150' width='240' height='300' rx='26' fill='rgba(255,255,255,0.14)'/><text x='120' y='585' fill='white' font-size='78' font-family='Segoe UI, Arial'>Catalog yako inaweza kuonekana hivi</text></svg>",
    title: "Catalog yenye muonekano mzuri",
    subtitle: "Search, categories na slideshow vitasaidia bidhaa zako kuonekana vizuri zaidi."
  },
  {
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 700'><defs><linearGradient id='g3' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%23f2c29b'/><stop offset='1' stop-color='%23c65a1e'/></linearGradient></defs><rect width='1600' height='700' fill='url(%23g3)'/><rect x='180' y='120' width='1240' height='430' rx='34' fill='rgba(255,255,255,0.18)'/><text x='250' y='270' fill='white' font-size='88' font-family='Segoe UI, Arial'>Ongeza picha zako mwenyewe</text><text x='250' y='370' fill='white' font-size='48' font-family='Segoe UI, Arial'>Ukisha-upload bidhaa, slideshow itaanza kutumia picha zako moja kwa moja.</text></svg>",
    title: "Slideshow ya picha zako",
    subtitle: "Picha zako zitaanza kuonekana hapa moja kwa moja baada ya upload."
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
        shop: product.shop || ""
      })
      : normalizeSearchValue(`${product.name || ""} ${product.shop || ""}`)
  };
}

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
let selectedAuthRole = "seller";
let currentUser = "";
let selectedCategory = "all";
let expandedBrowseCategory = "";
let currentView = "home";
let publicAuthRequestPending = false;
let adminAuthRequestPending = false;
let isHandlingSessionInvalidation = false;
let editingProductId = null;
let selectedAuthCategory = "";
let selectedAuthSubcategory = "";
let authSignupStep = 1;
let currentSession = null;
let pendingGuestIntent = null;
const ADMIN_LOGIN_HASH = "#/admin-login";

const authContainer = document.getElementById("auth-container");
const authCloseButton = document.getElementById("auth-close-button");
const authGatePrompt = document.getElementById("auth-gate-prompt");
const authGateTitle = document.getElementById("auth-gate-title");
const authGateCopy = document.getElementById("auth-gate-copy");
const authGateLoginButton = document.getElementById("auth-gate-login");
const authGateSignupButton = document.getElementById("auth-gate-signup");
const toggleLink = document.getElementById("toggle-link");
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
const sellerPassportPhotoInput = document.getElementById("seller-passport-photo");
const sellerIdentityDocumentImageInput = document.getElementById("seller-identity-document-image");
const sellerPassportPhotoName = document.getElementById("seller-passport-photo-name");
const sellerIdentityDocumentImageName = document.getElementById("seller-identity-document-image-name");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");
const confirmPasswordWrap = document.getElementById("confirm-password-wrap");
const passwordToggleButton = document.getElementById("password-toggle");
const authCategoryNote = document.getElementById("auth-category-note");
const authCategoriesContainer = document.getElementById("auth-categories");
const authSubcategoryBlock = document.getElementById("auth-subcategory-block");
const authSubcategoriesContainer = document.getElementById("auth-subcategories");
const authCustomCategoryWrap = document.getElementById("auth-custom-category-wrap");
const authCustomCategoryInput = document.getElementById("auth-custom-category-input");
const authCustomCategoryAddButton = document.getElementById("auth-custom-category-add");
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
const searchInput = document.getElementById("search-input");
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
const chatUiState = createChatUiState();
const productDetailUiState = createProductDetailUiState();
let currentReviews = [];
let reviewSummaries = {};
let lastViewedProductId = "";
let recentlyViewedProductIds = [];
let productDiscoveryTrail = [];
let recentCategorySelections = [];
let recentSearchTerms = [];
let recentMessagedProductIds = [];
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

function setAdminLoginRouteActive(active, options = {}) {
  const { replace = false } = options;
  const nextHash = active ? ADMIN_LOGIN_HASH : "";
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", url);
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
}

function syncAuthMode() {
  const isSecuritySignup = !isLogin;
  const isSellerSignup = isSecuritySignup && selectedAuthRole === "seller";
  const isBuyerSignup = isSecuritySignup && selectedAuthRole === "buyer";
  const isCategoryStep = isSellerSignup && authSignupStep === 2;
  authDetailsStep.style.display = isCategoryStep ? "none" : "block";
  authCategoryStep.style.display = isCategoryStep ? "block" : "none";
  authRoleSelector.style.display = isSecuritySignup ? "grid" : "none";
  phoneNumberInput.style.display = isSecuritySignup ? "block" : "none";
  nationalIdInput.style.display = isSecuritySignup ? "block" : "none";
  sellerIdentityDocumentTypeInput.style.display = isSellerSignup && authSignupStep === 1 ? "block" : "none";
  sellerVerificationUploads.style.display = isSellerSignup && authSignupStep === 1 ? "grid" : "none";
  confirmPasswordWrap.style.display = isSecuritySignup ? "flex" : "none";
  phoneNumberInput.required = isSecuritySignup;
  nationalIdInput.required = isSecuritySignup;
  sellerIdentityDocumentTypeInput.required = isSellerSignup;
  confirmPasswordInput.required = isSecuritySignup;
  authNextButton.style.display = isSellerSignup && authSignupStep === 1 ? "block" : "none";
  authBackButton.style.display = isSecuritySignup && authSignupStep === 2 ? "block" : "none";
  authButton.style.display = isSellerSignup && authSignupStep === 1 ? "none" : "block";
  authCustomCategoryWrap.style.display = "none";
  usernameInput.placeholder = isLogin
    ? "Username, full name, or phone number"
    : isBuyerSignup
      ? "Full name"
      : "Username";
  authButton.innerText = isLogin ? "Login" : "Sign Up";

  authCategoryNote.innerText = isLogin
    ? "Login tumia username, full name, au namba ya simu pamoja na password. Session itaendelea mpaka ulogout."
    : isCategoryStep
      ? "Hatua ya mwisho, chagua category kuu kisha subcategory ya biashara yako."
      : isBuyerSignup
        ? "Jaza taarifa za mteja kisha akaunti itafunguliwa na kukuingiza moja kwa moja kwenye app."
        : "Jaza taarifa zako kwanza, kisha bonyeza Next uchague category ya biashara yako kama muuzaji.";

  authRoleSelector?.querySelectorAll("[data-auth-role]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authRole === selectedAuthRole);
  });

  if (!isSecuritySignup) {
    confirmPasswordInput.value = "";
    sellerIdentityDocumentTypeInput.value = "";
    if (sellerPassportPhotoInput) sellerPassportPhotoInput.value = "";
    if (sellerIdentityDocumentImageInput) sellerIdentityDocumentImageInput.value = "";
    if (sellerPassportPhotoName) sellerPassportPhotoName.innerText = "";
    if (sellerIdentityDocumentImageName) sellerIdentityDocumentImageName.innerText = "";
  }

  [passwordInput, confirmPasswordInput].forEach((input) => {
    input.type = "password";
  });
  if (passwordToggleButton) {
    passwordToggleButton.innerText = isSecuritySignup ? "Show Passwords" : "Show Password";
  }
}

bindHeaderEntryActions();
bindPublicEntryActions();
window.addEventListener("hashchange", handleAccessRouteChange);

toggleLink.addEventListener("click", () => {
  isLogin = !isLogin;
  authSignupStep = 1;
  selectedAuthRole = "seller";
  formTitle.innerText = isLogin ? "Login" : "Sign Up";
  authButton.innerText = isLogin ? "Login" : "Sign Up";
  toggleLink.innerText = isLogin ? "Tengeneza akaunti" : "Tayari una akaunti? Ingia";
  syncAuthMode();
});

authRoleSelector?.querySelectorAll("[data-auth-role]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedAuthRole = button.dataset.authRole || "seller";
    authSignupStep = 1;
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

sellerPassportPhotoInput?.addEventListener("change", () => {
  const file = sellerPassportPhotoInput.files?.[0];
  try {
    if (file) {
      validateSingleImageFile(file, "Passport photo");
    }
    if (sellerPassportPhotoName) {
      sellerPassportPhotoName.innerText = file ? file.name : "";
    }
  } catch (error) {
    sellerPassportPhotoInput.value = "";
    if (sellerPassportPhotoName) {
      sellerPassportPhotoName.innerText = "";
    }
    alert(error.message || "Passport photo si sahihi.");
  }
});

sellerIdentityDocumentImageInput?.addEventListener("change", () => {
  const file = sellerIdentityDocumentImageInput.files?.[0];
  try {
    if (file) {
      validateSingleImageFile(file, "Identity document");
    }
    if (sellerIdentityDocumentImageName) {
      sellerIdentityDocumentImageName.innerText = file ? file.name : "";
    }
  } catch (error) {
    sellerIdentityDocumentImageInput.value = "";
    if (sellerIdentityDocumentImageName) {
      sellerIdentityDocumentImageName.innerText = "";
    }
    alert(error.message || "Identity document image si sahihi.");
  }
});

authNextButton.addEventListener("click", () => {
  if (selectedAuthRole !== "seller") {
    return;
  }

  const signupValidationError = validateAuthSignupInput();
  if (signupValidationError) {
    alert(signupValidationError);
    return;
  }

  authSignupStep = 2;
  syncAuthMode();
});

authBackButton.addEventListener("click", () => {
  authSignupStep = 1;
  syncAuthMode();
});

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

authCustomCategoryAddButton.addEventListener("click", async () => {
  authCustomCategoryWrap.style.display = "none";
});

uploadCustomCategoryAddButton.addEventListener("click", async () => {
  uploadCustomCategoryWrap.style.display = "none";
});

productCategoryTopInput.addEventListener("change", () => {
  productCategoryInput.value = "";
  renderUploadCategoryOptions();
});

productCategoryInput.addEventListener("change", () => {
  uploadCustomCategoryWrap.style.display = "none";
});

authButton.addEventListener("click", async () => {
  if (publicAuthRequestPending) {
    return;
  }
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  publicAuthRequestPending = true;
  setAuthInteractionPending("public", true);
  if (isLogin) {
    if (!username || !password) {
      publicAuthRequestPending = false;
      setAuthInteractionPending("public", false);
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
        publicAuthRequestPending = false;
        setAuthInteractionPending("public", false);
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
        publicAuthRequestPending = false;
        setAuthInteractionPending("public", false);
        return;
      }
      alert(errorMessage);
    } finally {
      publicAuthRequestPending = false;
      setAuthInteractionPending("public", false);
    }
    return;
  }

  const signupValidationError = validateAuthSignupInput();
  if (signupValidationError) {
    publicAuthRequestPending = false;
    setAuthInteractionPending("public", false);
    alert(signupValidationError);
    return;
  }

  const phoneNumber = normalizePhoneNumber(phoneNumberInput.value);
  const nationalId = normalizeNationalId(nationalIdInput.value);

  if (selectedAuthRole === "seller" && !selectedAuthCategory) {
    publicAuthRequestPending = false;
    setAuthInteractionPending("public", false);
    alert("Chagua category kuu ya biashara yako kwanza.");
    return;
  }

  if (selectedAuthRole === "seller" && DEFAULT_TOP_CATEGORIES.some((category) => category.value === selectedAuthCategory) && !selectedAuthSubcategory) {
    publicAuthRequestPending = false;
    setAuthInteractionPending("public", false);
    alert("Chagua subcategory ya biashara yako kwanza.");
    return;
  }

  try {
    const sellerPassportPhoto = selectedAuthRole === "seller"
      ? await readFileAsDataUrl(sellerPassportPhotoInput?.files?.[0])
      : "";
    const sellerIdentityDocumentImage = selectedAuthRole === "seller"
      ? await readFileAsDataUrl(sellerIdentityDocumentImageInput?.files?.[0])
      : "";
    const user = await window.WingaDataLayer.signup({
      username: selectedAuthRole === "seller" ? username : "",
      fullName: username,
      password,
      phoneNumber,
      nationalId,
      primaryCategory: selectedAuthRole === "seller" ? (selectedAuthSubcategory || selectedAuthCategory) : "",
      role: selectedAuthRole,
      profileImage: "",
      passportPhoto: selectedAuthRole === "seller" ? sellerPassportPhoto : "",
      identityDocumentType: selectedAuthRole === "seller" ? sellerIdentityDocumentTypeInput.value : "",
      identityDocumentImage: selectedAuthRole === "seller" ? sellerIdentityDocumentImage : "",
      verificationStatus: selectedAuthRole === "seller" ? "pending" : "",
      verificationSubmittedAt: selectedAuthRole === "seller" ? new Date().toISOString() : ""
    });
    showInAppNotification({
      title: "Welcome to Winga",
      body: "Akaunti imeundwa. Unaingia moja kwa moja.",
      variant: "success"
    });
    authSignupStep = 1;
    clearAppViewState();
    loginSuccess(user.username, user.primaryCategory, user, { restoreView: false });
  } catch (error) {
    showInAppNotification({
      title: "Sign up failed",
      body: error.message || "Imeshindikana kusajili akaunti.",
      variant: "error"
    });
  } finally {
    publicAuthRequestPending = false;
    setAuthInteractionPending("public", false);
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
      body: "Bidhaa yako imehifadhiwa na sasa inasubiri approval ya admin.",
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
  setCurrentViewState("profile");
  renderCurrentView();
});

productImageFileInput.addEventListener("change", () => {
  const files = Array.from(productImageFileInput.files || []);
  if (files.length === 0) {
    previewList.replaceChildren();
    previewList.style.display = "none";
    return;
  }

  try {
    validateImageFiles(files);
    renderPreviewFiles(files);
  } catch (error) {
    alert(error.message || "Picha ulizochagua si sahihi.");
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
  if (window.innerWidth <= 720) {
    searchRuntimeState.isMobileSearchOpen = !searchRuntimeState.isMobileSearchOpen;
    searchBox.classList.toggle("mobile-open", searchRuntimeState.isMobileSearchOpen);
    syncMobileHeaderVisibility(true);
  }
  setCurrentViewState("home");
  renderCurrentView();
  searchInput.focus();
});

searchInput.addEventListener("input", () => {
  if (!isAuthenticatedUser()) {
    searchInput.value = "";
    promptGuestAuth({
      preferredMode: "signup",
      role: "buyer",
      title: "Create an account or sign in to continue",
      message: "Search and advanced filters are available for members."
    });
    return;
  }
  searchRuntimeState.isSearchDropdownDismissed = false;
  noteSearchInterest(searchInput.value);
  scheduleSearchDrivenRender(120);
});

searchInput.addEventListener("focus", () => {
  if (!isAuthenticatedUser()) {
    promptGuestAuth({
      preferredMode: "signup",
      role: "buyer",
      title: "Create an account or sign in to continue",
      message: "Search and advanced filters are available for members."
    });
    searchInput.blur();
    return;
  }
  searchRuntimeState.isSearchDropdownDismissed = false;
  scheduleSearchDrivenRender(0);
});

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

document.addEventListener("click", (event) => {
  if (!mobileCategoryShell?.contains(event.target)) {
    closeMobileCategoryMenu();
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
  if (window.innerWidth > 720) {
    closeMobileCategoryMenu();
    searchRuntimeState.isMobileSearchOpen = false;
    searchBox.classList.remove("mobile-open");
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
  setCurrentViewState("upload");
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
  setCurrentViewState("home");
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", () => {
  scheduleMobileHeaderScrollSync();
}, { passive: true });

window.addEventListener("resize", () => {
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
  return user?.primaryCategory || inferUserCategory(username);
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
  searchRuntimeState.activeImageSearch = null;
  searchRuntimeState.isSearchDropdownDismissed = false;
  searchRuntimeState.isMobileSearchOpen = false;
  searchBox?.classList.remove("mobile-open");
  setCategorySelectionState("all", {
    expandedBrowseCategory: ""
  });
  closeMobileCategoryMenu();
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
  selectedAuthCategory = "";
  selectedAuthSubcategory = "";
  authCustomCategoryInput.value = "";
  authCustomCategoryWrap.style.display = "none";
  authSubcategoryBlock && (authSubcategoryBlock.style.display = "none");
  renderAuthCategoryButtons();
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
  const label = rawLabel || defaultProductCategory?.label || humanizeCategoryValue(value);

  if (!value || !label) {
    return null;
  }

  return {
    value,
    label,
    topValue: defaultProductCategory?.topValue || topValue,
    topLabel: defaultProductCategory?.topLabel || topCategory?.label || ""
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
    label: normalized.topLabel || topCategory?.label || normalized.label
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
    ...products.map((product) => ({ value: product.category, label: product.category })),
    ...getUsers().map((user) => ({ value: user.primaryCategory, label: user.primaryCategory })),
    ...window.WingaDataLayer.getCategories().map((category) => normalizeCategoryEntry(category))
  ].filter(Boolean);
}

function renderAuthCategoryButtons() {
  authCategoriesContainer.replaceChildren(
    ...availableTopCategories.map((category) => {
      const button = createElement("button", {
        className: `auth-cat-btn ${selectedAuthCategory === category.value ? "active" : ""}`.trim(),
        textContent: category.label,
        attributes: {
          type: "button",
          "data-cat": category.value
        }
      });
      button.addEventListener("click", () => {
        selectedAuthCategory = category.value;
        selectedAuthSubcategory = "";
        renderAuthCategoryButtons();
      });
      return button;
    })
  );

  renderAuthSubcategoryButtons();
}

function renderAuthSubcategoryButtons() {
  if (!authSubcategoryBlock || !authSubcategoriesContainer) {
    return;
  }

  const shouldShow = DEFAULT_TOP_CATEGORIES.some((category) => category.value === selectedAuthCategory);
  authSubcategoryBlock.style.display = shouldShow ? "block" : "none";

  if (!shouldShow) {
    authSubcategoriesContainer.replaceChildren();
    return;
  }

  const subcategories = getSubcategoriesForTopCategory(selectedAuthCategory);
  authSubcategoriesContainer.replaceChildren(
    ...subcategories.map((category) => {
      const button = createElement("button", {
        className: `auth-cat-btn ${selectedAuthSubcategory === category.value ? "active" : ""}`.trim(),
        textContent: category.label,
        attributes: {
          type: "button",
          "data-subcat": category.value
        }
      });
      button.addEventListener("click", () => {
        selectedAuthSubcategory = category.value;
        renderAuthSubcategoryButtons();
      });
      return button;
    })
  );

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

  const subcategories = DEFAULT_PRODUCT_CATEGORIES.filter((category) => category.topValue === productCategoryTopInput.value);
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
  uploadCustomCategoryWrap.style.display = "none";
}

function refreshCategoryUI() {
  renderAuthCategoryButtons();
  renderFilterCategories();
  renderUploadCategoryOptions();
}

async function createCustomCategory(label, options = {}) {
  const safeLabel = String(label || "").trim();
  const selectedTopValue = DEFAULT_TOP_CATEGORIES.some((category) => category.value === options.topValue)
    ? options.topValue
    : "";
  const customSlug = slugifyCategoryLabel(safeLabel);
  const maxCustomSlugLength = selectedTopValue
    ? Math.max(1, 40 - selectedTopValue.length - 1)
    : 40;
  const safeValue = selectedTopValue
    ? `${selectedTopValue}-${customSlug.slice(0, maxCustomSlugLength)}`
    : customSlug;
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
  const { restoreView = false, skipWelcome = false, forceView = "" } = options;
  searchRuntimeState.isMobileSearchOpen = false;
  searchBox.classList.remove("mobile-open");
  searchRuntimeState.activeImageSearch = null;
  searchRuntimeState.isSearchDropdownDismissed = false;
  searchInput.value = "";
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
  chatUiState.activeContext = null;
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
  const storedViewState = restoreView ? getStoredAppView() : null;
  const nextView = forceView && isRestorableView(forceView, currentSession)
    ? forceView
    : storedViewState?.username === username && isRestorableView(storedViewState.view, currentSession)
      ? storedViewState.view
      : (isStaffUser() ? "admin" : "home");
  saveSessionUser(currentSession);
  authContainer.style.display = "none";
  hideAdminLoginScreen();
  document.body.classList.remove("auth-modal-open");
  hideAuthGatePrompt();
  appContainer.style.display = "block";
  adminNavItem.style.display = isStaffUser() ? "inline-flex" : "none";
  setAdminNavLabel(adminNavItem, getAdminNavLabel());
  applySelectedCategory(
    !isStaffUser() && storedViewState?.username === username && storedViewState?.selectedCategory
      ? getRestorableCategory(storedViewState.selectedCategory)
      : "all"
  );
  refreshPublicEntryChrome();
  clearUploadForm();
  productShopInput.value = username;
  setCurrentViewState(nextView);
  renderCurrentView();
  updateProfileNavBadge();
  if (!isStaffUser()) {
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
  }
  resumePendingGuestIntent();
  if (!skipWelcome && !isStaffUser()) {
    showWelcomePopup();
  }
}

function logout() {
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
  clearSessionUser();
  clearAppViewState();
  applySessionState(null);
  profileRuntimeState.pendingSection = "";
  currentOrders = { purchases: [], sales: [] };
  currentMessages = [];
  currentNotifications = [];
  currentPromotions = [];
  currentReviews = [];
  reviewSummaries = {};
  chatUiState.activeContext = null;
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
  setCurrentViewState("home");
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
  return (filteredProducts || []).slice(0, 8);
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
  const shouldShow = hasSearchIntent && !searchRuntimeState.isSearchDropdownDismissed && !isProfile && !isUpload && !isAdminView;

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
      searchDropdown.classList.remove("open");
      scrollToProductCard(productId);
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
  return AppCore.getShowcaseProducts
    ? AppCore.getShowcaseProducts(products.filter((product) => isMarketplaceBrowseCandidate(product)), 12)
    : products
      .filter((product) => product.status === "approved" && product.availability !== "sold_out" && product.image && isMarketplaceBrowseCandidate(product))
      .sort((first, second) => {
        const firstScore = (first.likes || 0) * 4 + (first.views || 0);
        const secondScore = (second.likes || 0) * 4 + (second.views || 0);
        return secondScore - firstScore;
      })
      .slice(0, 12);
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
    .filter((product) => product.status === "approved" && product.availability !== "sold_out" && product.image && isMarketplaceBrowseCandidate(product))
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
      && product.image
      && isMarketplaceBrowseCandidate(product)
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
  getCurrentSession: () => currentSession,
  normalizeOptionalPrice
});

function renderDiscoveryProductCards(items, options = {}) {
  const { sponsored = false } = options;
  if (!items.length) {
    return "";
  }

  return `
    <div class="seller-products-grid">
      ${items.map((item) => {
        const safeName = escapeHtml(item.name || "");
        const safeCategory = escapeHtml(getCategoryLabel(item.category));
        const promotion = sponsored ? getPrimaryPromotion(item.id) : null;
        return `
          <article class="seller-product-card" data-open-product="${item.id}">
            <img src="${item.image}" alt="${safeName}" loading="lazy" data-fallback-src="${getImageFallbackDataUri("W")}">
            <strong>${formatProductPrice(item.price)}</strong>
            <span>${safeName}</span>
            <span>${safeCategory}</span>
            ${renderMarketplaceTrustBadges(item)}
            ${promotion ? `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">${escapeHtml(getPromotionLabel(promotion.type))}</span></p>` : ""}
            ${renderProductActionGroup(item, { requestLabel: "Add to My Requests", extraClass: "seller-product-actions" })}
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

function getTrendingProducts(limit = 8) {
  const source = products.filter((product) => product.status === "approved" && product.availability !== "sold_out");
  const withSignal = source.some((product) => Number(product.views || 0) > 0 || Number(product.likes || 0) > 0);
  const ranked = rankProductsForSurface(source, {
    surface: "trending",
    limit
  });
  return ranked.length ? ranked : limitProductsPerSeller(withSignal ? source.slice() : source.slice().sort(() => Math.random() - 0.5), limit, 2);
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

function bindShowcaseCardClicks(scope) {
  scope.querySelectorAll(".showcase-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".product-actions")) {
        return;
      }
      const targetProduct = getProductById(card.dataset.showcaseId);
      if (!targetProduct) {
        return;
      }

      noteProductInterest(targetProduct.id);
      openProductDetailModal(targetProduct.id);
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
  bindShowcaseCardClicks(nextSection);
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
  marketShowcase.style.display = "none";
  showcaseTrack.replaceChildren();
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

    if (currentView !== "profile") {
      stopMessagePolling();
    }
    if (window.innerWidth > 720 || currentView !== "home") {
      closeMobileCategoryMenu();
    }
    renderSlideshow();
    startSlideshow();
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
    searchBox.classList.toggle("mobile-open", searchRuntimeState.isMobileSearchOpen);
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
    analyticsPanel.style.display = isProfile || isAdminView ? "block" : "none";
    adminPanel.style.display = isAdminView ? "block" : "none";

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

  setCurrentViewState("upload");
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

  const filtered = applyProductFilters(baseList.filter((product) => isMarketplaceBrowseCandidate(product)));
  const sortMode = sortSelect?.value || "default";
  if (sortMode !== "default" || !filtered.length) {
    return filtered;
  }

  return rankProductsForSurface(filtered, {
    surface: currentView === "home" ? "home" : "default",
    limit: filtered.length,
    selectedCategory,
    searchTerms: searchInput.value ? [searchInput.value] : []
  });
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
  popupShell.append(
    createElement("p", { className: "welcome-user", textContent: currentUser }),
    createElement("h2", { textContent: "KARIBU WINGA" }),
    createElement("p", { className: "welcome-tagline", textContent: "Chap kwa haraka" })
  );
  popup.appendChild(popupShell);
  document.body.appendChild(popup);

  setTimeout(() => popup.classList.add("show"), 30);
  setTimeout(() => {
    popup.classList.remove("show");
    setTimeout(() => popup.remove(), 500);
  }, 7000);
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
  const ownProducts = products.filter((product) => product.uploadedBy === currentUser && product.image);

  if (ownProducts.length > 0) {
    return ownProducts.map((product) => ({
      image: product.image,
      title: product.name,
      subtitle: product.shop ? `Shop: ${product.shop}` : "Bidhaa yako kwenye WINGA"
    }));
  }

  return DEMO_SLIDES;
}

function renderProductGallery(product) {
  const images = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image];
  const safeImages = images.filter(Boolean);
  const firstImage = sanitizeImageSource(safeImages[0] || "", getImageFallbackDataUri("WINGA"));

  return `
    <div class="product-gallery">
      <img class="gallery-stage" src="${firstImage}" alt="${product.name}" data-gallery-stage="${product.id}" loading="lazy" data-fallback-src="${getImageFallbackDataUri("WINGA")}">
      ${safeImages.length > 1 ? `
        <div class="gallery-thumbs">
          ${safeImages.map((image, index) => `
            <img
              class="gallery-thumb ${index === 0 ? "active" : ""}"
              src="${sanitizeImageSource(image, getImageFallbackDataUri("W"))}"
              alt="${product.name} ${index + 1}"
              data-gallery-target="${product.id}"
              data-image="${sanitizeImageSource(image, getImageFallbackDataUri("W"))}"
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
      title: "Payment submitted",
      body: "Transaction reference imepokelewa. Order yako sasa iko Pending Verification hadi malipo yathibitishwe.",
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

function getSellerOtherProducts(product, limit = 6) {
  return getSellerOtherProductsFromController(product, limit);
}

function closeProductDetailModal() {
  return closeProductDetailModalFromController();
}

function openProductDetailModal(productId, options = {}) {
  const product = getProductById(productId);
  if (!product) {
    return;
  }

  if (!isAuthenticatedUser()) {
    promptGuestAuth({
      preferredMode: "signup",
      role: "buyer",
      title: "Create an account or sign in to continue",
      message: "Already have an account? Sign In. New here? Sign Up ili ufungue bidhaa hii, uchati, na uongeze requests.",
      intent: { type: "focus-product", productId }
    });
    return;
  }

  return openProductDetailModalFromController(productId, options);
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

  if (navigator.share) {
    try {
      await navigator.share({
        title: product.name,
        text: shareText,
        url: product.image
      });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(`${shareText} | Image: ${product.image}`);
    showInAppNotification({
      title: "Share ready",
      body: "Maelezo ya bidhaa yame-copy kwa sharing.",
      variant: "success"
    });
    return;
  }

  alert(`${shareText} | Image: ${product.image}`);
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
      image.src = image.dataset.fallbackSrc;
      image.removeAttribute("data-fallback-src");
    }, { once: true });
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
      }
    });
  });
}

function renderPreviewImages(images) {
  const safeImages = images.filter(Boolean);
  previewList.replaceChildren(
    ...safeImages.map((image, index) => createElement("img", {
      className: "preview-thumb",
      attributes: {
        src: image,
        alt: `Preview ${index + 1}`
      }
    }))
  );
  previewList.style.display = safeImages.length > 0 ? "grid" : "none";
}

function renderPreviewFiles(files) {
  readFilesAsDataUrls(files).then((images) => {
    renderPreviewImages(images);
  });
}

function readFilesAsDataUrls(files) {
  return Promise.all(files.map((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.readAsDataURL(file);
    });
  }));
}

function startSlideshow() {
  if (uiRuntimeState.slideshowTimer) {
    clearInterval(uiRuntimeState.slideshowTimer);
  }

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
    showSessionRestoringState(
      isStaffRole(cachedSession.role)
        ? "Tunathibitisha staff session yako kabla ya kufungua admin surface."
        : "Tunathibitisha session yako ya mteja au muuzaji kabla ya kuendelea."
    );
  }

  await window.WingaDataLayer.init();

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

  if (cachedSession?.username) {
    const rememberedSession = await window.WingaDataLayer.restoreSession();
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
  } else {
    const rememberedSession = await window.WingaDataLayer.restoreSession();
    if (rememberedSession?.username) {
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










