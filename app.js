const USERS_KEY = "winga-users";
const PRODUCTS_KEY = "winga-products";
const SESSION_KEY = "winga-current-user";
const APP_VIEW_KEY = "winga-app-view";
const PENDING_GUEST_INTENT_KEY = "winga-pending-guest-intent";
const SELLER_HISTORY_KEY_PREFIX = "winga-seller-history";
const REQUEST_BOX_KEY_PREFIX = "winga-request-box";
const APP_BOOT_BUILD_VERSION = document.querySelector('meta[name="winga-build"]')?.content || "";
/*
 * WINGA BOOT OWNERSHIP
 * 1. Cloudflare Worker streams the splash, shell, and first feed batch.
 * 2. This app runtime takes over after first paint for feed continuation, sentinels, carousel, and actions.
 * 3. Service Worker is registered after the window load event and is limited to offline shell support.
 * 4. There must be exactly one authoritative Service Worker registration path: /sw.js.
 */
const APP_SERVICE_WORKER_PATH = "/sw.js";
const APP_STORAGE_SCHEMA_KEY = "winga-storage-schema-version";
const HOME_SCROLL_STATE_KEY = "winga-home-scroll-state";
const HOME_FEED_REFRESH_CURSOR_KEY = "winga-home-feed-refresh-cursor";
let cachedHomeFeedRefreshCursor = null;
const APP_UPDATE_BANNER_DISMISS_KEY = "winga-app-update-banner-dismissed-version";
const APP_CHAT_DRAFT_KEY_PREFIX = "winga-chat-draft";
const SHARED_COLLECTION_INTENT_KEY_PREFIX = "winga-shared-collection-intent";
const PRODUCT_UPLOAD_DRAFT_KEY_PREFIX = "winga-product-upload-draft";
const APP_INSTALL_STATE_KEY = "winga-pwa-install-state";
const NOTIFICATION_PERMISSION_STATE_KEY = "winga-notification-permission-state";
const NOTIFICATION_PERMISSION_PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const NOTIFICATION_PERMISSION_TRIGGERS = new Set(["message", "reply", "request", "order", "profile"]);
const SELLER_INTEREST_SIGNAL_WEIGHTS = Object.freeze({
  quick_scroll: 4,
  variation_swipe: 12,
  linger_5s: 26,
  card_open: 16,
  message: 34
});
const SELLER_INTEREST_DECAY_START_DAYS = 3;
const PRODUCT_CARD_LINGER_THRESHOLD_MS = 5000;
const PRODUCT_CARD_QUICK_SCROLL_THRESHOLD_MS = 1700;
const PRODUCT_CARD_VISIBILITY_THRESHOLD = 0.66;
const MEMORY_SNAPSHOT_LIMIT = 18;
const MEMORY_WARNING_THRESHOLD_BYTES = 180 * 1024 * 1024;
const MEMORY_SAMPLING_INTERVAL_MS = 30000;
const MEMORY_PRESSURE_CONSECUTIVE_LIMIT = 2;
const MEMORY_CRITICAL_THRESHOLD_BYTES = 220 * 1024 * 1024;
const FEED_BOOTSTRAP_CACHE_KEY = "winga-feed-bootstrap-cache";
const FEED_BOOTSTRAP_CACHE_MAX_AGE_MS = 90 * 1000;
const FEED_BOOTSTRAP_PRODUCT_LIMIT = 14;
const HOME_FRESH_PROTECTION_WINDOW_MS = 20 * 60 * 1000;
const HOME_FRESH_TOP_SLOTS = 2;
const HOME_PROMOTION_TOP_WINDOW = 6;
const HOME_PROMOTION_TOP_CAP = 1;
const HOME_VARIANT_RESURFACE_MAX_PER_PRODUCT = 4;
const HOME_VARIANT_RESURFACE_MIN_BATCH_INDEX = 2;
const HOME_VARIANT_RESURFACE_MIN_RECENT_IDS = 10;
const HOME_VARIANT_RESURFACE_BATCH_GAP = 2;
const HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN = 12;
const HOME_VARIANT_GLOBAL_NORMAL_PRODUCT_GAP = 6;
const HOME_VARIANT_MAX_PER_BATCH = 1;
const HOME_VARIANT_MIN_STREAM_ITEMS_BEFORE_INSERT = 6;
const HOME_VARIANT_STREAM_INSERT_AFTER = 4;
const HOME_VARIANT_INJECTION_PREFETCH_PRODUCT_LIMIT = 2;
const HOME_VARIANT_INJECTION_PREFETCH_RADIUS = 1;
const FEED_BOOT_IMAGE_WARM_COUNT = 24;
const FEED_BOOT_IMAGE_DECODE_COUNT = 8;
const SPLASH_FEED_IMAGE_READY_COUNT = 6;
const SPLASH_FEED_IMAGE_READY_TIMEOUT_MS = 2500;
const BOOT_OVERLAY_HARD_SAFETY_TIMEOUT_MS = 4000;
const SPLASH_FEED_IMAGE_READY_POLL_MS = 80;
const FEED_PREDICTIVE_PRELOAD_COUNT = 6;
const FEED_PREDICTIVE_NEXT_BATCH_SIZE = 6;
const FEED_MEMORY_IMAGE_CACHE_LIMIT = 10;
const FEED_MEMORY_PREFETCH_COOLDOWN_MS = 900;
const FEED_SCROLL_SPEED_PREFETCH_THRESHOLD = 0.72;
const IMAGE_PRELOAD_REGISTRY_LIMIT = 180;
const MARKETPLACE_SCROLL_PREFETCH_REGISTRY_LIMIT = 240;
const MARKETPLACE_SCROLL_PREFETCH_CONCURRENCY = 4;
const MARKETPLACE_SCROLL_PREFETCH_TIMEOUT_MS = 12000;
const MARKETPLACE_SCROLL_PREFETCH_MAX_QUEUE = 48;
const MARKETPLACE_VIEWPORT_IMAGE_SWEEP_LIMIT = 18;
const HOME_CONTINUOUS_EARLY_LOAD_RATIO = 0.55;
const HOME_CONTINUOUS_EARLY_LOAD_COOLDOWN_MS = 120;
const FEED_MEMORY_MAINTENANCE_INTERVAL_MS = 5000;
const CONTINUATION_MEDIA_REVEAL_MAX_WAIT_MS = 280;
const CONTINUATION_MEDIA_REVEAL_POLL_MS = 50;
const HOME_CONTINUOUS_BATCH_ADMISSION_MAX_WAIT_MS = 90;
const HOME_CONTINUOUS_BATCH_ADMISSION_SLOW_SCROLL_WAIT_MS = 140;
const HOME_CONTINUOUS_PENDING_MEDIA_LOOKBACK = 8;
const HOME_CONTINUOUS_MAX_PENDING_MEDIA_CARDS = 2;
const HOME_CONTINUOUS_PENDING_DESCRIPTOR_LIMIT = 6;
const HOME_INFINITE_SENTINEL_FETCH_OFFSET = 15;
const HOME_INFINITE_SENTINEL_PRELOAD_OFFSET = 8;
const HOME_INFINITE_SENTINEL_INJECT_OFFSET = 3;
const HOME_INFINITE_SENTINEL_FETCH_COOLDOWN_MS = 240;
const HOME_INFINITE_SENTINEL_PRELOAD_COOLDOWN_MS = 160;
const HOME_INFINITE_SENTINEL_INJECT_COOLDOWN_MS = 220;
// This continuous discovery pipeline is the single authoritative continuation system
// after Big Pipe completes first paint. Do not add a competing client-side load-more owner.
const HOME_INFINITE_READY_PRELOAD_TIMEOUT_MS = 3000;
const HOME_INFINITE_DOM_INJECT_CHUNK_SIZE = 12;
const HOME_INFINITE_BACKEND_REFRESH_COOLDOWN_MS = 15000;
const HOME_INFINITE_MAX_DOM_CARDS = 60;
const PRODUCT_DETAIL_TRANSITION_PRELOAD_RADIUS = 2;
const SLOW_PATH_TELEMETRY_LIMIT = 120;
const PREDICTIVE_DECODE_TELEMETRY_LIMIT = 160;
const RUNTIME_METRIC_WINDOW_LIMIT = 24;
const HOME_CONTINUOUS_VARIANT_TRACK_LIMIT = 96;
const HOME_CONTINUOUS_HARD_PRESSURE_PENDING_MEDIA = 4;
const MARKETPLACE_PREFETCH_QUEUE_PRESSURE_THRESHOLD = 18;
const BLOCKED_DEMO_PRODUCT_IDENTIFIERS = new Set([
  "gauni la harusi",
  "sketi ya rangi",
  "neema fashion",
  "mama asha shop",
  "mama aisha shop"
]);
const moduleConfig = window.WingaModules?.config || {};
const chatConfig = moduleConfig.chat || {};
const categoryConfig = moduleConfig.categories || {};
const { CHAT_EMOJI_CHOICES = [] } = chatConfig;
const {
  MARKETPLACE_CATEGORY_TREE = [],
  DEFAULT_TOP_CATEGORIES = [],
  DEFAULT_PRODUCT_CATEGORIES = [],
  LEGACY_CATEGORY_MAPPINGS = {}
} = categoryConfig;
const FLEXIBLE_SUBCATEGORY_TOP_VALUES = new Set(["vitu-used"]);
const MAX_UPLOAD_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_API_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_API_PRODUCT_REQUEST_BYTES = 14 * 1024 * 1024;
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
  createProgressiveImage,
  createSlideDot,
  sanitizeImageSource
} = window.WingaModules.components.ui;
const { createObservabilityModule } = window.WingaModules.monitoring;

function isServiceWorkerRecoveryDisabled() {
  return Boolean(window.WINGA_CONFIG?.disableServiceWorker);
}

const createMarketplaceImageLoaderModule = window.WingaModules.marketplace.createImageLoaderModule || ((deps = {}) => {
  const normalizeImageCandidates = (values = []) => {
    const seen = new Set();
    return values
      .map((value) => deps.sanitizeImageSource?.(value, "") || "")
      .filter(Boolean)
      .filter((value) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
  };

  return {
    collectOptionalFeedImageCandidates(product) {
      const variants = product?.imageVariants && typeof product.imageVariants === "object"
        ? product.imageVariants
        : {};
      return normalizeImageCandidates([
        product?.feedImage,
        product?.feedImageUrl,
        product?.previewImage,
        product?.previewImageUrl,
        product?.preview,
        product?.thumbnail,
        product?.thumbnailUrl,
        product?.thumb,
        product?.thumbUrl,
        product?.smallImage,
        product?.smallImageUrl,
        product?.imageThumb,
        product?.imagePreview,
        variants.feed,
        variants.feedUrl,
        variants.preview,
        variants.previewUrl,
        variants.thumbnail,
        variants.thumbnailUrl,
        variants.thumb,
        variants.thumbUrl,
        variants.small,
        variants.smallUrl
      ]);
    },
    getRenderableProductImages(product) {
      const sourceImages = Array.isArray(product?.images) && product.images.length > 0
        ? product.images.slice()
        : [product?.image];
      return normalizeImageCandidates(sourceImages);
    },
    getProductImageCandidates(product) {
      const sourceImages = Array.isArray(product?.images) && product.images.length > 0
        ? product.images.slice()
        : [product?.image];
      const preferredFeedImages = normalizeImageCandidates([
        product?.feedImage,
        product?.feedImageUrl,
        product?.previewImage,
        product?.previewImageUrl,
        product?.preview,
        product?.thumbnail,
        product?.thumbnailUrl,
        product?.thumb,
        product?.thumbUrl,
        product?.smallImage,
        product?.smallImageUrl,
        product?.imageThumb,
        product?.imagePreview,
        ...(product?.imageVariants && typeof product.imageVariants === "object"
          ? [
              product.imageVariants.feed,
              product.imageVariants.feedUrl,
              product.imageVariants.preview,
              product.imageVariants.previewUrl,
              product.imageVariants.thumbnail,
              product.imageVariants.thumbnailUrl,
              product.imageVariants.thumb,
              product.imageVariants.thumbUrl,
              product.imageVariants.small,
              product.imageVariants.smallUrl
            ]
          : [])
      ]);
      if (preferredFeedImages.length) {
        sourceImages.unshift(...preferredFeedImages);
      }
      const safeImages = normalizeImageCandidates(sourceImages);
      const preferredImageIndex = Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex);
      if (
        safeImages.length > 1
        && Number.isFinite(preferredImageIndex)
        && preferredImageIndex > 0
        && preferredImageIndex < safeImages.length
      ) {
        const preferredImage = safeImages[preferredImageIndex];
        safeImages.splice(preferredImageIndex, 1);
        safeImages.unshift(preferredImage);
      }
      return safeImages;
    },
    canUseServiceWorkerImageWarmCache() {
      return !deps.isServiceWorkerRecoveryDisabled?.();
    }
  };
});

const marketplaceImageLoader = createMarketplaceImageLoaderModule({
  sanitizeImageSource,
  isServiceWorkerRecoveryDisabled
});
const {
  collectOptionalFeedImageCandidates: collectFeedImageLoaderCandidates,
  getRenderableProductImages: getFeedRenderableImages,
  getProductImageCandidates: getFeedImageLoaderCandidates,
  canUseServiceWorkerImageWarmCache
} = marketplaceImageLoader;

function shouldUseBootstrapFeedSnapshot() {
  if (window.WINGA_CONFIG?.enableBootstrapFeedSnapshot === false) {
    return false;
  }
  if (navigator.onLine === false) {
    return true;
  }
  try {
    const navigationEntry = window.performance?.getEntriesByType?.("navigation")?.[0];
    const navigationType = String(navigationEntry?.type || "").trim().toLowerCase();
    if (navigationType === "reload") {
      return false;
    }
  } catch (error) {
    // Ignore navigation API failures and fall back to snapshot support.
  }
  return true;
}

function shouldUseApiLocalCacheFallback() {
  return window.WINGA_CONFIG?.enableApiLocalCacheFallback !== false;
}

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
  const cachedProducts = Array.isArray(storedProducts) && storedProducts.length
    ? storedProducts
    : (shouldUseApiLocalCacheFallback() ? (window.WingaDataLayer?.getCachedProducts?.() || []) : []);
  return sanitizeVisibleProducts(Array.isArray(cachedProducts) ? cachedProducts : []).map(normalizeProduct);
}

function rebuildProductIndex() {
  productIndex = new Map(products.map((product) => [product.id, product]));
}

function refreshProductsFromStore() {
  products = normalizeProductsFromStore();
  rebuildProductIndex();
  pruneBrokenMarketplaceImageRegistry();
}

function ensureProductsForImmediateRender() {
  refreshProductsFromStore();
  if (!products.length) {
    const feedBootstrapSnapshot = shouldUseBootstrapFeedSnapshot() ? getFeedBootstrapSnapshot() : [];
    products = feedBootstrapSnapshot.length
      ? feedBootstrapSnapshot
      : DEFAULT_PRODUCTS.map(normalizeProduct);
    rebuildProductIndex();
  }
}

function refreshProductsAfterAuthChange() {
  const refreshProducts = window.WingaDataLayer?.refreshProducts;
  if (typeof refreshProducts !== "function") {
    refreshProductsFromStore();
    return;
  }

  const refreshToken = ++postAuthProductRefreshToken;
  refreshProductsFromStore();
  Promise.resolve(refreshProducts.call(window.WingaDataLayer))
    .then(() => {
      if (refreshToken !== postAuthProductRefreshToken || !isAuthenticatedUser()) {
        return;
      }
      refreshProductsFromStore();
      primeFeedInstantCache(products, {
        reason: "post_auth_refresh",
        productLimit: FEED_PREDICTIVE_PRELOAD_COUNT,
        decodeLimit: FEED_PREDICTIVE_NEXT_BATCH_SIZE
      });
      renderCurrentView();
    })
    .catch((error) => {
      captureClientError("post_auth_product_refresh_failed", error, {
        category: "auth",
        alertSeverity: "medium"
      });
      refreshProductsFromStore();
      if (currentView === "home") {
        renderCurrentView();
      }
    });
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

function getStoredAppStorageSchemaVersion() {
  try {
    return String(localStorage.getItem(APP_STORAGE_SCHEMA_KEY) || "").trim();
  } catch (error) {
    return "";
  }
}

function getStoredHomeScrollState() {
  try {
    const raw = sessionStorage.getItem(HOME_SCROLL_STATE_KEY);
    if (!raw) {
      return 0;
    }
    const parsed = JSON.parse(raw);
    const scrollY = Number(parsed?.scrollY || 0);
    return Number.isFinite(scrollY) && scrollY > 0 ? Math.max(0, Math.round(scrollY)) : 0;
  } catch (error) {
    return 0;
  }
}

function getStoredHomeFeedRefreshCursor() {
  if (cachedHomeFeedRefreshCursor !== null) {
    return cachedHomeFeedRefreshCursor;
  }
  try {
    const raw = sessionStorage.getItem(HOME_FEED_REFRESH_CURSOR_KEY);
    if (!raw) {
      cachedHomeFeedRefreshCursor = 0;
      return cachedHomeFeedRefreshCursor;
    }
    const cursor = Number(raw);
    cachedHomeFeedRefreshCursor = Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;
    return cachedHomeFeedRefreshCursor;
  } catch (error) {
    cachedHomeFeedRefreshCursor = 0;
    return cachedHomeFeedRefreshCursor;
  }
}

function saveHomeFeedRefreshCursor(value = 0) {
  try {
    const nextCursor = Math.max(0, Math.floor(Number(value || 0) || 0));
    sessionStorage.setItem(HOME_FEED_REFRESH_CURSOR_KEY, String(nextCursor));
    cachedHomeFeedRefreshCursor = nextCursor;
    return nextCursor;
  } catch (error) {
    cachedHomeFeedRefreshCursor = 0;
    return 0;
  }
}

function isReloadNavigation() {
  try {
    const navEntry = window.performance?.getEntriesByType?.("navigation")?.[0];
    if (navEntry?.type) {
      return navEntry.type === "reload";
    }
    if (typeof window.performance?.navigation?.type === "number") {
      return window.performance.navigation.type === 1;
    }
  } catch (error) {
    // Ignore navigation inspection failures.
  }
  return false;
}

function initializeHomeFeedRefreshCursor() {
  const cursor = getStoredHomeFeedRefreshCursor();
  if (isReloadNavigation()) {
    return saveHomeFeedRefreshCursor(cursor + 1);
  }
  return cursor;
}

function saveHomeScrollState(scrollY = window.scrollY || 0) {
  try {
    const nextScrollY = Math.max(0, Math.round(Number(scrollY || 0) || 0));
    if (nextScrollY <= 0) {
      sessionStorage.removeItem(HOME_SCROLL_STATE_KEY);
      return;
    }
    sessionStorage.setItem(HOME_SCROLL_STATE_KEY, JSON.stringify({
      scrollY: nextScrollY,
      path: window.location.pathname || "/",
      updatedAt: Date.now()
    }));
  } catch (error) {
    reportClientEvent("warn", "home_scroll_state_persist_failed", "Unable to persist home scroll state.", {
      category: "runtime"
    });
  }
}

function clearHomeScrollState() {
  try {
    sessionStorage.removeItem(HOME_SCROLL_STATE_KEY);
  } catch (error) {
    // Ignore sessionStorage cleanup failures.
  }
}

function rotateProductsForHomeRefresh(list = []) {
  if (!Array.isArray(list) || list.length < 2) {
    return Array.isArray(list) ? list.slice() : [];
  }
  if (currentView !== "home") {
    return list.slice();
  }
  const offset = Math.abs(Number(homeFeedRefreshCursor || 0)) % list.length;
  if (!offset) {
    return list.slice();
  }
  return list.slice(offset).concat(list.slice(0, offset));
}

function getProductCreatedTime(product) {
  return new Date(
    product?.createdAt
    || product?.created_at
    || product?.timestamp
    || product?.updatedAt
    || 0
  ).getTime();
}

function compareProductsNewestFirst(first, second) {
  const secondTime = getProductCreatedTime(second);
  const firstTime = getProductCreatedTime(first);
  if (secondTime !== firstTime) {
    return secondTime - firstTime;
  }
  return String(second?.id || "").localeCompare(String(first?.id || ""));
}

function sortProductsNewestFirst(list = []) {
  return (Array.isArray(list) ? list : []).slice().sort(compareProductsNewestFirst);
}

function getHomeFeedEngagementScore(product) {
  if (!product) {
    return 0;
  }
  return (
    Number(product.views || 0) * 1
    + Number(product.likes || 0) * 3
    + Number(product.saves || 0) * 4
    + Number(product.messages || 0) * 5
    + Number(product.orders || 0) * 6
  );
}

function buildBalancedHomeFeed(list = []) {
  const visibleList = Array.isArray(list) ? list.slice() : [];
  if (visibleList.length < 3) {
    return sortProductsNewestFirst(visibleList);
  }

  const now = Date.now();
  const selected = [];
  const selectedIds = new Set();
  const sellerCounts = new Map();
  const isProtectedFresh = (product) => (now - getProductCreatedTime(product)) <= HOME_FRESH_PROTECTION_WINDOW_MS;
  const hasPromotion = (product) => Boolean(getPrimaryPromotion(product?.id));
  const getPromotionScore = (product) => {
    if (!product) {
      return 0;
    }
    const directScore = Number(getPromotionCommercialScore?.(product) || 0);
    if (Number.isFinite(directScore) && directScore > 0) {
      return directScore;
    }
    return hasPromotion(product) ? 100 : 0;
  };

  const appendProduct = (product, options = {}) => {
    if (!product || selectedIds.has(product.id)) {
      return false;
    }
    const sellerId = String(product.uploadedBy || "");
    const maxPerSeller = Math.max(1, Number(options.maxPerSeller || 2));
    const currentCount = sellerCounts.get(sellerId) || 0;
    if (sellerId && currentCount >= maxPerSeller) {
      return false;
    }
    if (
      options.preventPromotedOverflow === true
      && hasPromotion(product)
      && selected.length < HOME_PROMOTION_TOP_WINDOW
    ) {
      const promotedAlreadyPlaced = selected
        .slice(0, HOME_PROMOTION_TOP_WINDOW)
        .filter((item) => hasPromotion(item)).length;
      if (promotedAlreadyPlaced >= HOME_PROMOTION_TOP_CAP) {
        return false;
      }
    }
    selected.push(product);
    selectedIds.add(product.id);
    if (sellerId) {
      sellerCounts.set(sellerId, currentCount + 1);
    }
    return true;
  };

  const newest = sortProductsNewestFirst(visibleList);
  limitProductsPerSeller(newest.filter(isProtectedFresh), HOME_FRESH_TOP_SLOTS, 1).forEach((product) => {
    appendProduct(product, { maxPerSeller: 1 });
  });

  const remaining = newest.filter((product) => !selectedIds.has(product.id));
  const promotedPool = remaining
    .filter(hasPromotion)
    .sort((first, second) => {
      const delta = getPromotionScore(second) - getPromotionScore(first);
      if (delta !== 0) {
        return delta;
      }
      return compareProductsNewestFirst(first, second);
    });
  const trendingPool = remaining
    .slice()
    .sort((first, second) => {
      const scoreDelta = getHomeFeedEngagementScore(second) - getHomeFeedEngagementScore(first);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return compareProductsNewestFirst(first, second);
    });
  const recentPool = remaining.slice();
  const diversePool = limitProductsPerSeller(remaining, remaining.length, 1);

  const pickNext = (poolName) => {
    const pools = {
      promoted: promotedPool,
      trending: trendingPool,
      recent: recentPool,
      diverse: diversePool
    };
    const pool = pools[poolName] || [];
    while (pool.length) {
      const candidate = pool.shift();
      if (!candidate || selectedIds.has(candidate.id)) {
        continue;
      }
      if (appendProduct(candidate, {
        maxPerSeller: poolName === "diverse" ? 1 : 2,
        preventPromotedOverflow: true
      })) {
        return true;
      }
    }
    return false;
  };

  const rotationPatterns = [
    ["recent", "promoted", "trending", "diverse", "recent", "trending"],
    ["recent", "trending", "diverse", "promoted", "recent", "trending"],
    ["trending", "recent", "diverse", "recent", "promoted", "recent"],
    ["recent", "diverse", "trending", "recent", "promoted", "diverse"]
  ];
  const pattern = rotationPatterns[Math.abs(Number(homeFeedRefreshCursor || 0)) % rotationPatterns.length];

  while (selected.length < visibleList.length) {
    let pushedInRound = false;
    for (const poolName of pattern) {
      if (pickNext(poolName)) {
        pushedInRound = true;
      }
      if (selected.length >= visibleList.length) {
        break;
      }
    }
    if (!pushedInRound) {
      break;
    }
  }

  remaining.forEach((product) => {
    appendProduct(product, {
      maxPerSeller: 2,
      preventPromotedOverflow: true
    });
  });

  return selected;
}

function saveAppStorageSchemaVersion(version = "") {
  try {
    if (!version) {
      localStorage.removeItem(APP_STORAGE_SCHEMA_KEY);
      return;
    }
    localStorage.setItem(APP_STORAGE_SCHEMA_KEY, version);
  } catch (error) {
    reportClientEvent("warn", "app_storage_schema_version_persist_failed", "Unable to persist app storage schema version.", {
      category: "runtime"
    });
  }
}

function clearStaleAppBootstrapState() {
  clearAppViewState();
  savePendingGuestIntent(null);
  try {
    window.sessionStorage?.clear?.();
  } catch (error) {
    // Ignore sessionStorage cleanup failures.
  }
}

async function purgeStaleBrowserCacheArtifacts() {
  try {
    if (window.navigator?.serviceWorker?.getRegistrations) {
      const registrations = await window.navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    // Ignore stale service worker cleanup failures.
  }

  try {
    if (window.caches?.keys) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
    }
  } catch (error) {
    // Ignore cache storage cleanup failures.
  }
}

function hasCompletedServiceWorkerFirstRun() {
  try {
    return window.localStorage?.getItem("winga_service_worker_initialized") === "true";
  } catch (error) {
    return true;
  }
}

function markServiceWorkerFirstRunComplete() {
  try {
    window.localStorage?.setItem("winga_service_worker_initialized", "true");
  } catch (error) {
    // Storage may be unavailable in private/locked-down browsers.
  }
}

async function waitForServiceWorkerReady(maxWaitMs = 3000) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.ready) {
    return null;
  }
  let timeoutId = 0;
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(null), Math.max(0, Number(maxWaitMs) || 0));
  });
  const registration = await Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    timeout
  ]);
  window.clearTimeout(timeoutId);
  return registration;
}

async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  if (!/^https?:$/i.test(String(window.location?.protocol || ""))) {
    return;
  }
  if (document.readyState !== "complete") {
    if (registerAppServiceWorker.deferredUntilLoad) {
      return;
    }
    registerAppServiceWorker.deferredUntilLoad = true;
    window.addEventListener("load", () => {
      registerAppServiceWorker.deferredUntilLoad = false;
      void registerAppServiceWorker();
    }, { once: true });
    return;
  }
  if (registerAppServiceWorker.started) {
    return;
  }
  registerAppServiceWorker.started = true;
  if (isServiceWorkerRecoveryDisabled()) {
    await purgeStaleBrowserCacheArtifacts();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(`${APP_SERVICE_WORKER_PATH}?v=${encodeURIComponent(APP_BOOT_BUILD_VERSION || "0")}`, {
      scope: "/",
      updateViaCache: "none"
    });
    bindAppUpdateLifecycle(registration);
    if (registration?.update) {
      try {
        await registration.update();
      } catch (error) {
        // Ignore update checks that fail on constrained/offline browsers.
      }
    }
  } catch (error) {
    registerAppServiceWorker.started = false;
    console.warn("[WINGA] SW failed:", error);
    reportClientEvent("warn", "service_worker_registration_failed", "Service worker registration failed.", {
      category: "runtime",
      message: String(error?.message || error || "unknown")
    });
  }
}

function scheduleSingleServiceWorkerRegistration() {
  if (scheduleSingleServiceWorkerRegistration.queued) {
    return;
  }
  scheduleSingleServiceWorkerRegistration.queued = true;
  window.setTimeout(() => {
    bindServiceWorkerDiagnostics();
    registerAppServiceWorker().catch(() => {
      // Ignore service worker registration failures on unsupported browsers.
    });
  }, 0);
}

function initializeBootstrapStorageVersion() {
  if (!APP_BOOT_BUILD_VERSION) {
    return;
  }

  const storedVersion = getStoredAppStorageSchemaVersion();
  if (storedVersion === APP_BOOT_BUILD_VERSION) {
    return;
  }

  clearStaleAppBootstrapState();
  saveAppStorageSchemaVersion(APP_BOOT_BUILD_VERSION);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }
  return purgeStaleBrowserCacheArtifacts();
}

function getSellerHistoryStorageKey(username = currentUser) {
  return `${SELLER_HISTORY_KEY_PREFIX}:${username || "guest"}`;
}

function normalizeSellerInterestCounters(interactions) {
  const signals = interactions && typeof interactions === "object" && !Array.isArray(interactions)
    ? interactions
    : {};
  return {
    quick_scroll: Math.max(0, Number(signals.quick_scroll || 0)),
    variation_swipe: Math.max(0, Number(signals.variation_swipe || 0)),
    linger_5s: Math.max(0, Number(signals.linger_5s || 0)),
    card_open: Math.max(0, Number(signals.card_open || 0)),
    message: Math.max(0, Number(signals.message || 0))
  };
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
            updatedAt: entry?.updatedAt || "",
            lastSignal: String(entry?.lastSignal || "").trim(),
            lastProductId: String(entry?.lastProductId || "").trim(),
            interactions: normalizeSellerInterestCounters(entry?.interactions)
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

function getSellerInterestSignalWeight(signalType, fallbackWeight = 1) {
  const normalizedSignal = String(signalType || "").trim().toLowerCase();
  if (normalizedSignal && Number.isFinite(SELLER_INTEREST_SIGNAL_WEIGHTS[normalizedSignal])) {
    return Number(SELLER_INTEREST_SIGNAL_WEIGHTS[normalizedSignal]);
  }
  return Number(fallbackWeight);
}

function noteSellerInterest(sellerId, weight = 1, options = {}) {
  const normalizedSellerId = String(sellerId || "").trim();
  const normalizedSignal = String(options.signalType || "").trim().toLowerCase();
  const safeWeight = getSellerInterestSignalWeight(normalizedSignal, weight);
  if (!currentUser || !normalizedSellerId || !Number.isFinite(safeWeight) || safeWeight <= 0 || normalizedSellerId === currentUser) {
    return;
  }
  const nowIso = new Date().toISOString();
  const nextEntry = buyerSellerAffinity[normalizedSellerId] || { score: 0, updatedAt: "" };
  const nextInteractions = normalizeSellerInterestCounters(nextEntry.interactions);
  if (normalizedSignal && Object.prototype.hasOwnProperty.call(nextInteractions, normalizedSignal)) {
    nextInteractions[normalizedSignal] += 1;
  }
  buyerSellerAffinity = {
    ...buyerSellerAffinity,
    [normalizedSellerId]: {
      score: Math.min(420, Math.max(0, nextEntry.score) + safeWeight),
      updatedAt: nowIso,
      lastSignal: normalizedSignal || String(nextEntry.lastSignal || "").trim(),
      lastProductId: String(options.productId || nextEntry.lastProductId || "").trim(),
      interactions: nextInteractions
    }
  };
  saveBuyerSellerAffinityState();
}

function getBuyerSellerAffinityEntries() {
  return Object.entries(buyerSellerAffinity).map(([sellerId, entry]) => ({
    sellerId,
    score: Number(entry?.score || 0),
    updatedAt: entry?.updatedAt || "",
    lastSignal: String(entry?.lastSignal || "").trim(),
    lastProductId: String(entry?.lastProductId || "").trim(),
    interactions: normalizeSellerInterestCounters(entry?.interactions)
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
    paymentProvider: String(session.paymentProvider || "").trim().toLowerCase(),
    paymentNumber: String(session.paymentNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentRecipientName: String(session.paymentRecipientName || session.fullName || username).trim(),
    paymentInstructions: String(session.paymentInstructions || "").trim(),
    profileImage: String(session.profileImage || "").trim(),
    verificationStatus: String(session.verificationStatus || "").trim(),
    verifiedSeller: Boolean(session.verifiedSeller),
    token: typeof session.token === "string" ? session.token.trim() : ""
  };
  currentUser = username;
  hydrateSharedCollectionIntentState(username);
}

function beginLifecycleEpoch(kind = "runtime") {
  const nextEpoch = Number(lifecycleRuntimeState.epoch || 0) + 1;
  lifecycleRuntimeState.epoch = nextEpoch;
  lifecycleRuntimeState.activeKind = String(kind || "runtime");
  return nextEpoch;
}

function isLifecycleEpochCurrent(epoch) {
  return Number(epoch || 0) > 0 && Number(epoch) === Number(lifecycleRuntimeState.epoch || 0);
}

function getEphemeralLifecycleViewOptions(options = {}) {
  return {
    persist: false,
    syncHistory: false,
    ...options
  };
}

function getBootTargetView(session = currentSession) {
  if (isStaffRole(session?.role || "")) {
    return "admin";
  }
  return "home";
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

function getProductUploadDraftStorageKey(username = currentUser) {
  return `${PRODUCT_UPLOAD_DRAFT_KEY_PREFIX}:${username || "guest"}`;
}

function getSharedCollectionIntentStorageKey(username = currentUser) {
  return `${SHARED_COLLECTION_INTENT_KEY_PREFIX}:${username || "guest"}`;
}

function normalizeSharedCollectionIntentEntries(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => {
      const category = getRestorableCategory(entry?.category || "all");
      const topCategory = isTopCategoryValue(entry?.topCategory)
        ? entry.topCategory
        : (category !== "all" ? inferTopCategoryValue(category) : "");
      const count = Math.max(1, Math.min(12, Number(entry?.count || 1) || 1));
      const updatedAt = String(entry?.updatedAt || "").trim();
      const source = String(entry?.source || "").trim().toLowerCase();
      const seedSellerIds = Array.from(new Set((Array.isArray(entry?.seedSellerIds) ? entry.seedSellerIds : []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 4);
      const seedProductIds = Array.from(new Set((Array.isArray(entry?.seedProductIds) ? entry.seedProductIds : []).map((value) => normalizeProductIdValue(value)).filter(Boolean))).slice(0, 6);
      if (category === "all" && !topCategory) {
        return null;
      }
      return {
        category,
        topCategory,
        count,
        updatedAt,
        source: source || "share_collection",
        seedSellerIds,
        seedProductIds
      };
    })
    .filter(Boolean)
    .sort((first, second) => {
      const firstTime = new Date(first.updatedAt || 0).getTime();
      const secondTime = new Date(second.updatedAt || 0).getTime();
      return secondTime - firstTime;
    })
    .slice(0, 8);
}

function loadSharedCollectionIntentState(username = currentUser) {
  try {
    const rawValue = window.localStorage.getItem(getSharedCollectionIntentStorageKey(username));
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return normalizeSharedCollectionIntentEntries(parsed);
  } catch (error) {
    return [];
  }
}

function mergeSharedCollectionIntentEntryLists(...entryLists) {
  const merged = new Map();
  entryLists.flat().forEach((entry) => {
    const normalizedEntries = normalizeSharedCollectionIntentEntries([entry]);
    normalizedEntries.forEach((normalizedEntry) => {
      const key = `${normalizedEntry.category}::${normalizedEntry.topCategory}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, normalizedEntry);
        return;
      }
      const existingTime = new Date(existing.updatedAt || 0).getTime();
      const nextTime = new Date(normalizedEntry.updatedAt || 0).getTime();
      merged.set(key, {
        ...existing,
        ...normalizedEntry,
        count: Math.min(12, Math.max(Number(existing.count || 0), Number(normalizedEntry.count || 0))),
        updatedAt: nextTime >= existingTime ? normalizedEntry.updatedAt : existing.updatedAt,
        seedSellerIds: Array.from(new Set([...(existing.seedSellerIds || []), ...(normalizedEntry.seedSellerIds || [])])).slice(0, 4),
        seedProductIds: Array.from(new Set([...(existing.seedProductIds || []), ...(normalizedEntry.seedProductIds || [])])).slice(0, 6)
      });
    });
  });
  return normalizeSharedCollectionIntentEntries(Array.from(merged.values()));
}

function saveSharedCollectionIntentState() {
  try {
    window.localStorage.setItem(
      getSharedCollectionIntentStorageKey(currentUser),
      JSON.stringify(sharedCollectionIntentEntries)
    );
  } catch (error) {
    reportClientEvent("warn", "shared_collection_intent_persist_failed", "Unable to persist shared collection intent.", {
      category: "runtime",
      user: currentUser || "guest"
    });
  }
}

function hydrateSharedCollectionIntentState(username = currentUser) {
  const userEntries = loadSharedCollectionIntentState(username);
  if (!username || username === "guest") {
    sharedCollectionIntentEntries = userEntries;
    return;
  }
  const guestEntries = loadSharedCollectionIntentState("guest");
  sharedCollectionIntentEntries = mergeSharedCollectionIntentEntryLists(userEntries, guestEntries);
  if (guestEntries.length) {
    saveSharedCollectionIntentState();
    try {
      window.localStorage.removeItem(getSharedCollectionIntentStorageKey("guest"));
    } catch (error) {
      // Ignore guest intent cleanup failures.
    }
  }
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
  const paymentIntentModal = document.getElementById("payment-intent-modal");
  const isPaymentIntentVisible = Boolean(
    paymentIntentModal
    && !paymentIntentModal.hidden
    && paymentIntentModal.classList.contains("open")
  );
  const promotionIntentModal = document.getElementById("promotion-intent-modal");
  const isPromotionIntentVisible = Boolean(
    promotionIntentModal
    && !promotionIntentModal.hidden
    && promotionIntentModal.classList.contains("open")
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
  document.body.classList.toggle("payment-intent-open", isPaymentIntentVisible);
  document.body.classList.toggle("promotion-intent-open", isPromotionIntentVisible);
  document.body.classList.toggle("media-action-sheet-open", isMediaActionSheetVisible);
  document.body.classList.toggle("image-lightbox-open", isImageLightboxVisible);
}

function scheduleHomeScrollRestore(scrollY = null) {
  const nextScrollY = Number.isFinite(Number(scrollY))
    ? Math.max(0, Math.round(Number(scrollY || 0)))
    : Math.max(0, Math.round(Number(uiRuntimeState.homeScrollRestoreY || getStoredHomeScrollState()) || 0));
  if (uiRuntimeState.homeScrollRestoreFrame) {
    cancelAnimationFrame(uiRuntimeState.homeScrollRestoreFrame);
    uiRuntimeState.homeScrollRestoreFrame = 0;
  }
  if (nextScrollY <= 0) {
    uiRuntimeState.homeScrollRestorePending = false;
    uiRuntimeState.homeScrollRestoreY = 0;
    return;
  }
  uiRuntimeState.homeScrollRestorePending = true;
  uiRuntimeState.homeScrollRestoreY = nextScrollY;
  uiRuntimeState.homeScrollRestoreFrame = requestAnimationFrame(() => {
    uiRuntimeState.homeScrollRestoreFrame = 0;
    requestAnimationFrame(() => {
      if (currentView !== "home" || document.body.classList.contains("product-detail-open")) {
        return;
      }
      const restoreY = Math.max(0, Math.round(Number(uiRuntimeState.homeScrollRestoreY || 0)));
      if (restoreY <= 0) {
        uiRuntimeState.homeScrollRestorePending = false;
        return;
      }
      try {
        window.scrollTo({ top: restoreY, left: 0, behavior: "auto" });
      } catch (error) {
        // Ignore scroll restore failures.
      }
      uiRuntimeState.homeScrollRestorePending = false;
      uiRuntimeState.homeScrollRestoreY = 0;
      clearHomeScrollState();
    });
  });
}

function scheduleHomeScrollSave(scrollY = window.scrollY || 0) {
  if (uiRuntimeState.homeScrollSaveFrame) {
    return;
  }
  uiRuntimeState.homeScrollSaveFrame = requestAnimationFrame(() => {
    uiRuntimeState.homeScrollSaveFrame = 0;
    if (currentView !== "home" || document.body.classList.contains("product-detail-open")) {
      return;
    }
    saveHomeScrollState(scrollY);
  });
}

function restoreStoredHomeScrollPosition() {
  const pathname = String(window.location.pathname || "").trim();
  if (isReloadNavigation() && pathname.match(/^\/product\/.+/i)) {
    clearHomeScrollState();
    return;
  }
  const storedScrollY = Number(getStoredHomeScrollState() || 0);
  if (storedScrollY > 0) {
    scheduleHomeScrollRestore(storedScrollY);
  }
}

function hasRetainedHomeFeedSurface() {
  if (currentView !== "home" || document.body.classList.contains("product-detail-open")) {
    return false;
  }
  return Boolean(
    productsContainer?.querySelector(".product-card[data-open-product], .seller-product-card[data-open-product]")
    || productsContainer?.querySelector("[data-feed-skeleton-card='true']")
  );
}

function resumeRetainedHomeFeedSurface(reason = "home_retained_resume", options = {}) {
  if (!hasRetainedHomeFeedSurface()) {
    return false;
  }
  bumpRuntimeDiagnostic("retainedHomeResumeCount");
  hideLifecycleFallbackShell();
  restoreStoredHomeScrollPosition();
  prioritizeVisibleFeedMedia?.(productsContainer, Math.max(4, Number(options.productLimit || 8)));
  activateViewportReadyFeedImages(productsContainer || document, {
    limit: 12
  });
  bindMarketplaceScrollImages(productsContainer || document);
  resumeMarketplaceImagePipeline(reason);
  scheduleStartupImageWork(window.WingaDataLayer?.getProducts?.() || products, {
    reason,
    productLimit: Math.max(1, Number(options.productLimit || 8)),
    decodeLimit: Math.max(1, Number(options.decodeLimit || 3)),
    delayMs: Math.max(0, Number(options.delayMs || 0))
  });
  if (options.prefetch !== false) {
    schedulePredictiveFeedPrefetch(reason);
  }
  return true;
}

function requestCurrentSurfaceRefresh(reason = "scheduled_render", options = {}) {
  if (currentView === "home" && resumeRetainedHomeFeedSurface(reason, options)) {
    return false;
  }
  scheduleRenderCurrentView(reason);
  return true;
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

const MIN_VIEW_RENDER_INTERVAL_MS = Math.max(
  48,
  Number(window.WINGA_CONFIG?.minViewRenderIntervalMs || 64)
);

function queueRenderCurrentView(reason = "scheduled_render") {
  uiRuntimeState.pendingRenderRequested = true;
  uiRuntimeState.pendingRenderReason = String(reason || "scheduled_render");
  if (uiRuntimeState.renderFrame) {
    return;
  }
  uiRuntimeState.renderFrame = requestAnimationFrame(() => {
    uiRuntimeState.renderFrame = 0;
    const nextReason = uiRuntimeState.pendingRenderReason || reason;
    uiRuntimeState.pendingRenderRequested = false;
    uiRuntimeState.pendingRenderReason = "";
    renderCurrentView({ reason: nextReason, scheduled: true });
  });
}

function scheduleRenderCurrentView(reason = "scheduled_render") {
  uiRuntimeState.pendingRenderReason = String(reason || "scheduled_render");
  if (uiRuntimeState.renderFrame) {
    cancelAnimationFrame(uiRuntimeState.renderFrame);
  }

  uiRuntimeState.renderFrame = requestAnimationFrame(() => {
    uiRuntimeState.renderFrame = 0;
    const nextReason = uiRuntimeState.pendingRenderReason || reason;
    uiRuntimeState.pendingRenderRequested = false;
    uiRuntimeState.pendingRenderReason = "";
    renderCurrentView({ reason: nextReason, scheduled: true });
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

function getProductPaymentDetails(product) {
  if (!product) {
    return {
      provider: "",
      number: "",
      recipientName: "",
      instructions: ""
    };
  }
  const seller = product.uploadedBy === currentUser
    ? currentSession
    : getMarketplaceUser(product.uploadedBy);
  const fallbackNumber = normalizeWhatsapp(product.whatsapp || seller?.whatsappNumber || seller?.phoneNumber || "");
  return {
    provider: String(seller?.paymentProvider || "").trim().toLowerCase(),
    number: String(seller?.paymentNumber || fallbackNumber || "").replace(/\D/g, "").slice(0, 20),
    recipientName: String(seller?.paymentRecipientName || seller?.fullName || product.shop || product.uploadedBy || "").trim(),
    instructions: String(seller?.paymentInstructions || "").trim()
  };
}

function validateAuthSignupInput() {
  const displayName = usernameInput.value.trim();
  const phoneNumber = normalizePhoneNumber(phoneNumberInput.value);
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();
  const passwordMinLength = getAuthPasswordMinLength();

  if (!displayName) {
    return "Weka jina la duka.";
  }

  if (!phoneNumber || !password || !confirmPassword) {
    return "Jaza jina la duka, namba ya simu, password, na confirm password.";
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return "Weka namba ya simu ya WhatsApp sahihi yenye tarakimu 10 hadi 15.";
  }

  if (displayName.length > 120) {
    return "Jina la kuonekana ni refu sana.";
  }

  if (password.length < passwordMinLength) {
    return `Password inapaswa kuwa angalau herufi ${passwordMinLength}.`;
  }

  if (password !== confirmPassword) {
    return "Password na confirm password hazifanani.";
  }

  const duplicatePhone = getUsersByPhoneNumber(phoneNumber).find((user) => String(user.phoneNumber || "") === phoneNumber);
  if (duplicatePhone) {
    return "Namba hiyo ya simu tayari imesajiliwa.";
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
  if (purpose === "product") {
    const isNarrowScreen = typeof window !== "undefined" && Number(window.innerWidth || 0) <= 768;
    const isFastMultiImageFlow = fastMode || isNarrowScreen;
    return {
      maxDimension: isFastMultiImageFlow ? 1200 : 1440,
      targetBytes: useLocalBudget
        ? LOCAL_PRODUCT_IMAGE_TARGET_BYTES
        : (isFastMultiImageFlow ? 650 * 1024 : PRODUCT_IMAGE_TARGET_BYTES),
      initialQuality: isFastMultiImageFlow ? 0.8 : 0.84,
      minimumQuality: 0.52,
      qualityStep: 0.08,
      maxIterations: 10
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
  return optimizeImageFileAsDataUrl(file, options).catch(async (error) => {
    if (isHeicLikeFile(file)) {
      throw new Error("Picha ya HEIC/HEIF haikuweza kubadilishwa kwenye format inayotumika hapa. Jaribu JPG au PNG.");
    }
    const provider = getActiveDataProvider();
    if (provider === "local" || provider === "mock") {
      throw error;
    }
    const purpose = String(options?.purpose || "generic").trim().toLowerCase();
    const fallbackDataUrl = await readRawFileAsDataUrl(file);
    if (purpose === "product" && estimateDataUrlBytes(fallbackDataUrl) > MAX_API_PRODUCT_IMAGE_BYTES) {
      throw new Error("Picha hii ni nzito sana kwa upload salama. Jaribu JPG/PNG au punguza ukubwa wa picha.");
    }
    return fallbackDataUrl;
  });
}

function estimateSerializedPayloadBytes(payload) {
  try {
    const serialized = JSON.stringify(payload);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(serialized).length;
    }
    return new Blob([serialized]).size;
  } catch (error) {
    return Number.POSITIVE_INFINITY;
  }
}

function ensureSafeProductUploadPayload(productPayload) {
  const images = Array.isArray(productPayload?.images) ? productPayload.images : [];
  images.forEach((imageValue, index) => {
    if (typeof imageValue !== "string" || !imageValue.startsWith("data:image/")) {
      return;
    }
    if (estimateDataUrlBytes(imageValue) > MAX_API_PRODUCT_IMAGE_BYTES) {
      throw new Error(`Picha ya ${index + 1} ni kubwa sana kwa server. Punguza ukubwa wake au jaribu JPG/PNG.`);
    }
  });
  const payloadBytes = estimateSerializedPayloadBytes(productPayload);
  if (payloadBytes > MAX_API_PRODUCT_REQUEST_BYTES) {
    throw new Error("Upload hii ni kubwa sana kwa server kwa sasa. Punguza idadi ya picha au tumia picha ndogo kidogo.");
  }
}

function getFriendlyProductUploadErrorMessage(error, fallbackMessage = "Imeshindikana kupost bidhaa.") {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").trim();
  const normalizedMessage = message.toLowerCase();
  if (status === 413 || code === "http_413" || normalizedMessage.includes("kubwa sana") || normalizedMessage.includes("payload_too_large")) {
    return "Picha au upload yote ni kubwa sana kwa server. Punguza ukubwa wa picha au idadi yake kisha jaribu tena.";
  }
  if (status === 429 || normalizedMessage.includes("majaribio ni mengi")) {
    return "Majaribio ni mengi sana kwa sasa. Subiri kidogo kisha ujaribu tena.";
  }
  if (error?.retryable || code === "timeout" || code === "network" || normalizedMessage.includes("network") || normalizedMessage.includes("took too long")) {
    return "Upload imechelewa au internet imekatika kidogo. Bonyeza tena kujaribu mara moja baada ya connection kutulia.";
  }
  if (status >= 500 || normalizedMessage.includes("hitilafu ya mfumo") || normalizedMessage.includes("server")) {
    return "Server imepata hitilafu wakati wa kusindika upload. Jaribu tena baada ya muda mfupi.";
  }
  return message || fallbackMessage;
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
      <defs>
        <linearGradient id="winga-fallback-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#FF9F1C"/>
          <stop offset="100%" stop-color="#FF4F0A"/>
        </linearGradient>
      </defs>
      <rect width="640" height="640" fill="#FFF7ED"/>
      <rect x="110" y="110" width="420" height="420" rx="76" fill="url(#winga-fallback-bg)"/>
      <text x="320" y="330" text-anchor="middle" font-family="Segoe UI, Arial" font-size="96" font-weight="900" fill="#FFFFFF">${label.slice(0, 1).toUpperCase()}</text>
      <text x="320" y="392" text-anchor="middle" font-family="Segoe UI, Arial" font-size="42" font-weight="800" fill="#FFFFFF">WINGA</text>
    </svg>
  `)}`;
}

const imagePreloadRegistry = new Map();
const decodedFeedImageCache = new Map();
const failedDecodedFeedImageCache = new Map();
const marketplaceScrollImagePrefetchedSources = new Map();
const marketplaceScrollPrefetchInflight = new Map();
const marketplaceScrollPrefetchQueue = [];
let marketplaceScrollPrefetchActiveCount = 0;

function pruneTimestampRegistry(registry, limit = 0) {
  if (!(registry instanceof Map) || !Number.isFinite(limit) || limit < 1) {
    return;
  }
  while (registry.size > limit) {
    const oldestKey = registry.keys().next().value;
    if (typeof oldestKey === "undefined") {
      break;
    }
    registry.delete(oldestKey);
  }
}

function markImagePreloaded(src = "") {
  const safeSrc = String(src || "").trim();
  if (!safeSrc) {
    return false;
  }
  if (imagePreloadRegistry.has(safeSrc)) {
    imagePreloadRegistry.set(safeSrc, Date.now());
    return true;
  }
  imagePreloadRegistry.set(safeSrc, Date.now());
  pruneTimestampRegistry(imagePreloadRegistry, IMAGE_PRELOAD_REGISTRY_LIMIT);
  return false;
}

function markMarketplaceImagePrefetched(src = "") {
  const safeSrc = String(src || "").trim();
  if (!safeSrc) {
    return false;
  }
  if (marketplaceScrollImagePrefetchedSources.has(safeSrc)) {
    marketplaceScrollImagePrefetchedSources.set(safeSrc, Date.now());
    return true;
  }
  marketplaceScrollImagePrefetchedSources.set(safeSrc, Date.now());
  pruneTimestampRegistry(marketplaceScrollImagePrefetchedSources, MARKETPLACE_SCROLL_PREFETCH_REGISTRY_LIMIT);
  return false;
}

function clearLightweightImageRegistries() {
  imagePreloadRegistry.clear();
  marketplaceScrollImagePrefetchedSources.clear();
  marketplaceScrollPrefetchInflight.forEach((entry) => {
    if (entry?.image instanceof Image) {
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
    }
  });
  marketplaceScrollPrefetchInflight.clear();
  marketplaceScrollPrefetchQueue.length = 0;
  marketplaceScrollPrefetchActiveCount = 0;
}

function getBrokenMarketplaceImageEntry(productId, imageSource = "") {
  const normalizedProductId = String(productId || "").trim();
  const normalizedSource = sanitizeImageSource(imageSource, "");
  if (!normalizedProductId || !normalizedSource) {
    return null;
  }
  const registry = brokenMarketplaceImagesByProduct.get(normalizedProductId);
  if (!(registry instanceof Map)) {
    return null;
  }
  const entry = registry.get(normalizedSource);
  if (!entry) {
    return null;
  }
  if (!Number.isFinite(entry.hiddenUntil) || entry.hiddenUntil <= Date.now()) {
    registry.delete(normalizedSource);
    if (!registry.size) {
      brokenMarketplaceImagesByProduct.delete(normalizedProductId);
    }
    return null;
  }
  return entry;
}

function shouldDeprioritizeBrokenMarketplaceImage(productId, imageSource = "") {
  return Boolean(getBrokenMarketplaceImageEntry(productId, imageSource));
}

function bumpMarketplaceImagePrefetchGeneration(reason = "feed_refresh") {
  feedRuntimeState.marketplaceImagePrefetchGeneration = Number(feedRuntimeState.marketplaceImagePrefetchGeneration || 0) + 1;
  feedRuntimeState.lastMarketplaceImagePrefetchReason = reason;
  marketplaceScrollPrefetchQueue.length = 0;
}

function cancelMarketplaceScrollPrefetchWork(reason = "feed_pause", options = {}) {
  bumpMarketplaceImagePrefetchGeneration(reason);
  marketplaceScrollPrefetchInflight.forEach((entry) => {
    if (entry?.image instanceof Image) {
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
    }
  });
  marketplaceScrollPrefetchInflight.clear();
  marketplaceScrollPrefetchActiveCount = 0;
  if (options.clearDecodedCache === true) {
    clearDecodedFeedImageCache();
  }
}

function drainMarketplaceScrollPrefetchQueue() {
  while (
    marketplaceScrollPrefetchActiveCount < MARKETPLACE_SCROLL_PREFETCH_CONCURRENCY
    && marketplaceScrollPrefetchQueue.length
  ) {
    const nextJob = marketplaceScrollPrefetchQueue.shift();
    const safeSrc = String(nextJob?.src || "").trim();
    const generation = Number(nextJob?.generation || 0);
    if (
      !safeSrc
      || marketplaceScrollImagePrefetchedSources.has(safeSrc)
      || generation !== Number(feedRuntimeState.marketplaceImagePrefetchGeneration || 0)
    ) {
      continue;
    }

    marketplaceScrollPrefetchActiveCount += 1;
    const prefetchImage = new Image();
    const cleanup = () => {
      prefetchImage.onload = null;
      prefetchImage.onerror = null;
      marketplaceScrollPrefetchInflight.delete(safeSrc);
      marketplaceScrollPrefetchActiveCount = Math.max(0, marketplaceScrollPrefetchActiveCount - 1);
      drainMarketplaceScrollPrefetchQueue();
    };
    const timeoutId = window.setTimeout(cleanup, MARKETPLACE_SCROLL_PREFETCH_TIMEOUT_MS);
    prefetchImage.onload = () => {
      window.clearTimeout(timeoutId);
      if (generation === Number(feedRuntimeState.marketplaceImagePrefetchGeneration || 0)) {
        markMarketplaceImagePrefetched(safeSrc);
      }
      cleanup();
    };
    prefetchImage.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
    };
    marketplaceScrollPrefetchInflight.set(safeSrc, {
      image: prefetchImage,
      startedAt: Date.now()
    });
    prefetchImage.src = safeSrc;
  }
}

function scheduleMarketplaceScrollImagePrefetch(src = "", productId = "") {
  const safeSrc = sanitizeImageSource(src, "");
  const normalizedProductId = String(productId || "").trim();
  const generation = Number(feedRuntimeState.marketplaceImagePrefetchGeneration || 0);
  if (shouldDeprioritizeBrokenMarketplaceImage(normalizedProductId, safeSrc)) {
    bumpRuntimeDiagnostic("brokenImageSuppressedPrefetchCount");
    return false;
  }
  if (
    !safeSrc
    || /^data:/i.test(safeSrc)
    || marketplaceScrollImagePrefetchedSources.has(safeSrc)
    || marketplaceScrollPrefetchInflight.has(safeSrc)
    || marketplaceScrollPrefetchQueue.some((entry) => entry?.src === safeSrc && Number(entry?.generation || 0) === generation)
  ) {
    return false;
  }
  marketplaceScrollPrefetchQueue.push({ src: safeSrc, queuedAt: Date.now(), generation });
  if (marketplaceScrollPrefetchQueue.length > MARKETPLACE_SCROLL_PREFETCH_MAX_QUEUE) {
    marketplaceScrollPrefetchQueue.splice(0, marketplaceScrollPrefetchQueue.length - MARKETPLACE_SCROLL_PREFETCH_MAX_QUEUE);
  }
  drainMarketplaceScrollPrefetchQueue();
  return true;
}

function resumeMarketplaceImagePipeline(reason = "feed_resume") {
  feedRuntimeState.lastMarketplaceImagePrefetchReason = reason;
  schedulePredictiveFeedPrefetch(reason);
  scheduleViewportReadyFeedSweep(document, {
    limit: 12
  });
  window.requestAnimationFrame(() => {
    prioritizeVisibleFeedMedia(document, 10);
    activateViewportReadyFeedImages(document, {
      limit: 12
    });
    bindMarketplaceScrollImages(document);
  });
}

function clearDecodedFeedImageCache() {
  decodedFeedImageCache.forEach((entry) => {
    if (entry?.image instanceof Image) {
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
    }
  });
  decodedFeedImageCache.clear();
}

function trimDecodedFeedImageCache() {
  const entries = Array.from(decodedFeedImageCache.entries())
    .sort((first, second) => Number(first[1]?.touchedAt || 0) - Number(second[1]?.touchedAt || 0));
  while (entries.length > FEED_MEMORY_IMAGE_CACHE_LIMIT) {
    const [src, entry] = entries.shift();
    decodedFeedImageCache.delete(src);
    if (entry?.image instanceof Image) {
      entry.image.onload = null;
      entry.image.onerror = null;
      entry.image.src = "";
    }
  }
}

function cacheDecodedFeedImageSource(src = "", options = {}) {
  const safeSrc = sanitizeImageSource(src, "");
  if (!safeSrc || /^data:/i.test(safeSrc)) {
    return Promise.resolve(null);
  }
  const failureWindowMs = 2 * 60 * 1000;
  const lastFailureAt = Number(failedDecodedFeedImageCache.get(safeSrc) || 0);
  if (lastFailureAt && Date.now() - lastFailureAt < failureWindowMs) {
    return Promise.resolve(null);
  }
  const existingEntry = decodedFeedImageCache.get(safeSrc);
  if (existingEntry?.promise) {
    existingEntry.touchedAt = Date.now();
    return existingEntry.promise;
  }

  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";
  const startedAt = getPerfNow();
  const promise = new Promise((resolve, reject) => {
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") {
          await image.decode().catch(() => {});
        }
      } catch (error) {
        // Ignore decode errors after the image is already loaded.
      }
      decodedFeedImageCache.set(safeSrc, {
        image,
        touchedAt: Date.now(),
        width: Number(image.naturalWidth || 0),
        height: Number(image.naturalHeight || 0),
        promise
      });
      failedDecodedFeedImageCache.delete(safeSrc);
      trimDecodedFeedImageCache();
      if (options.telemetry !== false && shouldReportPredictiveDecodeTelemetry(safeSrc, options.reason || "decode")) {
        reportSlowPath("feed_predictive_image_decode", getPerfNow() - startedAt, {
          category: "image",
          src: safeSrc,
          reason: options.reason || "decode"
        }, 180);
      }
      resolve(image);
    };
    image.onerror = (error) => {
      decodedFeedImageCache.delete(safeSrc);
      failedDecodedFeedImageCache.set(safeSrc, Date.now());
      reject(error || new Error("Unable to decode image into memory cache."));
    };
  });

  decodedFeedImageCache.set(safeSrc, {
    image,
    touchedAt: Date.now(),
    promise
  });
  image.src = safeSrc;
  return promise.catch(() => null);
}

function preloadImageSource(src = "", options = {}) {
  const {
    fetchPriority = "high",
    as = "image",
    decodeInMemory = false,
    reason = "preload"
  } = options;
  const resolvedSrc = sanitizeImageSource(src, "");
  if (!resolvedSrc || /^data:/i.test(resolvedSrc)) {
    if (decodeInMemory) {
      void cacheDecodedFeedImageSource(resolvedSrc, { reason });
    }
    return null;
  }
  const shouldUseLinkPreload = fetchPriority === "high" || decodeInMemory === true;
  const shouldUseSameOriginLinkPreload = (() => {
    try {
      return new URL(resolvedSrc, window.location.origin).origin === window.location.origin;
    } catch (error) {
      return false;
    }
  })();
  if (markImagePreloaded(resolvedSrc)) {
    if (decodeInMemory) {
      void cacheDecodedFeedImageSource(resolvedSrc, { reason });
    }
    return null;
  }
  if (!shouldUseLinkPreload) {
    return null;
  }
  if (!shouldUseSameOriginLinkPreload) {
    if (decodeInMemory) {
      void cacheDecodedFeedImageSource(resolvedSrc, { reason });
    }
    return null;
  }
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = as;
  link.href = resolvedSrc;
  link.setAttribute("fetchpriority", fetchPriority);
  link.setAttribute("data-winga-preload-image", "true");
  document.head.appendChild(link);
  if (decodeInMemory) {
    void cacheDecodedFeedImageSource(resolvedSrc, { reason });
  }
  return link;
}

function isStandaloneDisplayMode() {
  return Boolean(
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator?.standalone === true
  );
}

function getFeedBootstrapSnapshot() {
  if (!shouldUseBootstrapFeedSnapshot()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(FEED_BOOTSTRAP_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.products) || !parsed.products.length) {
      return [];
    }
    if (Date.now() - Number(parsed.timestamp || 0) > FEED_BOOTSTRAP_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(FEED_BOOTSTRAP_CACHE_KEY);
      return [];
    }
    const sanitizedProducts = sortProductsNewestFirst(
      sanitizeVisibleProducts(parsed.products).map(normalizeProduct)
    );
    if (!sanitizedProducts.length) {
      localStorage.removeItem(FEED_BOOTSTRAP_CACHE_KEY);
      return [];
    }
    if (sanitizedProducts.length !== parsed.products.length) {
      localStorage.setItem(FEED_BOOTSTRAP_CACHE_KEY, JSON.stringify({
        ...parsed,
        products: sanitizedProducts
      }));
    }
    return sanitizedProducts;
  } catch (error) {
    return [];
  }
}

function persistFeedBootstrapSnapshot(productsList = [], reason = "render") {
  if (!shouldUseBootstrapFeedSnapshot()) {
    return;
  }
  const sanitizedProducts = sortProductsNewestFirst(sanitizeVisibleProducts(productsList));
  if (!Array.isArray(sanitizedProducts) || !sanitizedProducts.length) {
    return;
  }
  try {
    const snapshot = sanitizedProducts.slice(0, FEED_BOOTSTRAP_PRODUCT_LIMIT).map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      shop: product.shop,
      whatsapp: product.whatsapp,
      image: product.image,
      images: Array.isArray(product.images) ? product.images.slice(0, 3) : [],
      uploadedBy: product.uploadedBy,
      category: product.category,
      fitMode: product.fitMode,
      status: product.status,
      availability: product.availability,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));
    localStorage.setItem(FEED_BOOTSTRAP_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      reason,
      products: snapshot
    }));
  } catch (error) {
    reportClientEvent("warn", "feed_bootstrap_snapshot_failed", "Unable to persist feed bootstrap snapshot.", {
      category: "cache",
      reason
    });
  }
}

function clearBlockedDemoBootstrapSnapshot() {
  if (!shouldUseBootstrapFeedSnapshot()) {
    try {
      localStorage.removeItem(FEED_BOOTSTRAP_CACHE_KEY);
    } catch (error) {
      // Ignore cleanup failures and continue with network-only recovery.
    }
    return;
  }
  try {
    const existingSnapshot = getFeedBootstrapSnapshot();
    if (existingSnapshot.length) {
      persistFeedBootstrapSnapshot(existingSnapshot, "sanitized_bootstrap_snapshot");
      return;
    }
    localStorage.removeItem(FEED_BOOTSTRAP_CACHE_KEY);
  } catch (error) {
    // Ignore cleanup failures and continue with runtime sanitization.
  }
}

function postServiceWorkerWarmCacheMessage(payload) {
  if (!canUseServiceWorkerImageWarmCache() || !("serviceWorker" in navigator) || !payload?.type) {
    return;
  }
  const postMessageToWorker = (registration) => {
    try {
      registration?.active?.postMessage?.(payload);
    } catch (error) {
      // Ignore SW warm-cache messaging issues.
    }
  };
  if (navigator.serviceWorker.controller) {
    postMessageToWorker({ active: navigator.serviceWorker.controller });
  } else if (navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(postMessageToWorker).catch(() => {});
  }
}

function getFeedDynamicWarmUrls() {
  const origin = window.location.origin;
  return [
    new URL("/api/products", origin).toString(),
    new URL("/api/categories", origin).toString(),
    new URL("/api/settings", origin).toString()
  ];
}

function collectProductImageWarmQueue(productsList = [], options = {}) {
  const {
    productLimit = FEED_PREDICTIVE_PRELOAD_COUNT,
    imageLimitPerProduct = 2
  } = options;
  const queue = [];
  const seen = new Set();
  productsList.slice(0, productLimit).forEach((product) => {
    getProductImageCandidates(product).slice(0, imageLimitPerProduct).forEach((src) => {
      const safeSrc = sanitizeImageSource(src, "");
      if (!safeSrc || seen.has(safeSrc)) {
        return;
      }
      seen.add(safeSrc);
      queue.push(safeSrc);
    });
  });
  return queue;
}

function primeFeedInstantCache(productsList = [], options = {}) {
  if (!Array.isArray(productsList) || !productsList.length) {
    return;
  }
  const cycleToken = Number(options.cycleToken || 0);
  if (cycleToken && cycleToken !== Number(feedRuntimeState.imageWarmCycle || 0)) {
    return;
  }
  const reason = String(options.reason || "feed_prime");
  const productLimit = Number(options.productLimit || FEED_PREDICTIVE_PRELOAD_COUNT);
  const decodeLimit = Number(options.decodeLimit || FEED_PREDICTIVE_NEXT_BATCH_SIZE);
  const imageQueue = collectProductImageWarmQueue(productsList, {
    productLimit,
    imageLimitPerProduct: 2
  });
  if (!imageQueue.length) {
    return;
  }

  persistFeedBootstrapSnapshot(productsList, reason);
  postServiceWorkerWarmCacheMessage({
    type: "CACHE_DYNAMIC_REQUESTS",
    urls: getFeedDynamicWarmUrls()
  });
  postServiceWorkerWarmCacheMessage({
    type: "CACHE_IMAGE_URLS",
    urls: imageQueue.slice(0, decodeLimit * 2)
  });

  imageQueue.slice(0, Math.min(decodeLimit, 3)).forEach((src, index) => {
    preloadImageSource(src, {
      fetchPriority: index < 2 ? "high" : "auto",
      decodeInMemory: false,
      reason
    });
  });
}

function warmProductImageCache(products = [], options = {}) {
  if (typeof preloadImageSource !== "function" || !Array.isArray(products) || !products.length) {
    return;
  }

  const cycleToken = Number(options.cycleToken || 0);
  const isWarmCycleActive = () => !cycleToken || cycleToken === Number(feedRuntimeState.imageWarmCycle || 0);
  const isStandalone = isStandaloneDisplayMode();
  const productLimit = Math.max(
    1,
    Number(options.productLimit || (isStandalone ? 8 : FEED_BOOT_IMAGE_WARM_COUNT)) || 1
  );
  const imageLimitPerProduct = Math.max(
    1,
    Number(options.imageLimitPerProduct || 1) || 1
  );
  const decodeCount = Math.max(
    1,
    Number(options.decodeCount || (isStandalone ? 4 : 8)) || 1
  );
  const seen = new Set();
  const queue = [];

  const enqueue = (src, fetchPriority = "auto") => {
    const safeSrc = sanitizeImageSource(src, "");
    if (!safeSrc || /^data:/i.test(safeSrc) || seen.has(safeSrc)) {
      return;
    }
    seen.add(safeSrc);
    queue.push({ src: safeSrc, fetchPriority });
  };

  products.slice(0, productLimit).forEach((product, index) => {
    if (!product || typeof product !== "object") {
      return;
    }
    if (typeof product.image === "string") {
      enqueue(product.image, index < 12 ? "high" : "auto");
    }
    if (Array.isArray(product.images) && product.images.length) {
      product.images.slice(0, imageLimitPerProduct).forEach((imageSrc) => {
        enqueue(imageSrc, index < 12 ? "high" : "auto");
      });
    }
  });

  if (!queue.length) {
    return;
  }

  const pendingQueue = queue.slice(0, Math.min(queue.length, decodeCount));
  const cacheUrls = pendingQueue.map((item) => item.src).filter(Boolean);
  if (cacheUrls.length && canUseServiceWorkerImageWarmCache() && "serviceWorker" in navigator) {
    const postCacheMessage = (registration) => {
      if (!isWarmCycleActive()) {
        return;
      }
      try {
        registration?.active?.postMessage?.({
          type: "CACHE_IMAGE_URLS",
          urls: cacheUrls.slice(0, Math.min(cacheUrls.length, decodeCount))
        });
      } catch (error) {
        // Ignore SW warm-cache messaging issues.
      }
    };
    if (navigator.serviceWorker.controller) {
      postCacheMessage({ active: navigator.serviceWorker.controller });
    } else if (navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(postCacheMessage).catch(() => {});
    }
  }

  const batchSize = Math.max(1, Math.min(isStandalone ? 4 : 6, decodeCount));
  const drainQueue = () => {
    if (!isWarmCycleActive()) {
      return;
    }
    const batch = pendingQueue.splice(0, batchSize);
    batch.forEach(({ src, fetchPriority }, index) => {
      preloadImageSource(src, {
        fetchPriority,
        decodeInMemory: false,
        reason: "warm_product_image_cache"
      });
    });
    if (!pendingQueue.length) {
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(drainQueue, { timeout: isStandalone ? 300 : 120 });
      return;
    }
    window.setTimeout(drainQueue, isStandalone ? 60 : 20);
  };

  drainQueue();
}

function cancelPendingStartupImageWork(reason = "startup_refresh") {
  if (feedRuntimeState.startupImageWarmTimer) {
    window.clearTimeout(feedRuntimeState.startupImageWarmTimer);
    feedRuntimeState.startupImageWarmTimer = 0;
  }
  feedRuntimeState.imageWarmCycle = Number(feedRuntimeState.imageWarmCycle || 0) + 1;
  feedRuntimeState.lastStartupImageWarmReason = reason;
}

function scheduleStartupImageWork(productsList = [], options = {}) {
  if (!Array.isArray(productsList) || !productsList.length) {
    return;
  }
  cancelPendingStartupImageWork(String(options.reason || "startup_refresh"));
  const cycleToken = Number(feedRuntimeState.imageWarmCycle || 0);
  const productLimit = Math.max(1, Math.min(
    Number(options.productLimit || 8) || 8,
    Array.isArray(productsList) ? productsList.length : 0
  ));
  const decodeLimit = Math.max(1, Math.min(
    Number(options.decodeLimit || 3) || 3,
    productLimit
  ));
  const imageLimitPerProduct = Math.max(1, Number(options.imageLimitPerProduct || 1) || 1);
  const reason = String(options.reason || "startup_refresh");
  const delayMs = Math.max(0, Number(options.delayMs ?? (document.body.classList.contains("app-booting") ? 1200 : 240)) || 0);
  feedRuntimeState.startupImageWarmTimer = window.setTimeout(() => {
    feedRuntimeState.startupImageWarmTimer = 0;
    if (cycleToken !== Number(feedRuntimeState.imageWarmCycle || 0)) {
      return;
    }
    const shouldWaitForVisibleHomeFeed = currentView === "home"
      && (
        document.body.classList.contains("app-booting")
        || !bootOverlay?.classList.contains("is-hidden")
        || !hasVisibleStartupSurface({ includeFeedLoading: false })
      );
    if (document.hidden || shouldWaitForVisibleHomeFeed) {
      scheduleStartupImageWork(productsList, {
        ...options,
        delayMs: Math.max(320, Math.min(900, delayMs))
      });
      return;
    }
    const scopedProducts = productsList.slice(0, productLimit);
    warmProductImageCache(scopedProducts, {
      productLimit,
      imageLimitPerProduct,
      decodeCount: decodeLimit,
      cycleToken
    });
    primeFeedInstantCache(scopedProducts, {
      reason,
      productLimit,
      decodeLimit,
      cycleToken
    });
  }, delayMs);
}

function cancelDeferredImageSignatureHydration(reason = "signature_refresh") {
  if (feedRuntimeState.imageSignatureHydrationTimer) {
    window.clearTimeout(feedRuntimeState.imageSignatureHydrationTimer);
    feedRuntimeState.imageSignatureHydrationTimer = 0;
  }
  feedRuntimeState.imageSignatureHydrationCycle = Number(feedRuntimeState.imageSignatureHydrationCycle || 0) + 1;
  feedRuntimeState.lastImageSignatureHydrationReason = reason;
}

function scheduleDeferredImageSignatureHydration(productList = products, options = {}) {
  if (!Array.isArray(productList) || !productList.length) {
    return;
  }
  cancelDeferredImageSignatureHydration(String(options.reason || "signature_refresh"));
  const cycleToken = Number(feedRuntimeState.imageSignatureHydrationCycle || 0);
  const productLimit = Math.max(1, Math.min(
    Number(options.productLimit || 24) || 24,
    productList.length
  ));
  const delayMs = Math.max(0, Number(options.delayMs ?? (document.body.classList.contains("app-booting") ? 3200 : 1800)) || 0);
  const scheduleAttempt = (nextDelayMs = delayMs) => {
    feedRuntimeState.imageSignatureHydrationTimer = window.setTimeout(() => {
      feedRuntimeState.imageSignatureHydrationTimer = 0;
      if (cycleToken !== Number(feedRuntimeState.imageSignatureHydrationCycle || 0)) {
        return;
      }
      const shouldWaitForVisibleHomeFeed = currentView === "home"
        && (
          document.body.classList.contains("app-booting")
          || !document.body.classList.contains("app-ready")
          || !bootOverlay?.classList.contains("is-hidden")
          || !hasVisibleStartupSurface({ includeFeedLoading: false })
        );
      if (document.hidden || shouldWaitForVisibleHomeFeed) {
        scheduleAttempt(Math.max(700, Math.min(1800, nextDelayMs)));
        return;
      }
      const scopedProducts = productList.slice(0, productLimit);
      scheduleIdleBackgroundWork(() => {
        if (cycleToken !== Number(feedRuntimeState.imageSignatureHydrationCycle || 0) || document.hidden) {
          return;
        }
        hydrateMissingImageSignatures(scopedProducts).catch(() => {
          // Ignore passive image signature hydration failures during boot.
        });
      }, 900);
    }, nextDelayMs);
  };
  scheduleAttempt(delayMs);
}

function warmAdminImageCache(imageSources = []) {
  if (!Array.isArray(imageSources) || !imageSources.length) {
    return;
  }

  const seen = new Set();
  const queue = [];
  imageSources.forEach((src, index) => {
    const safeSrc = sanitizeImageSource(src, "");
    if (!safeSrc || /^data:/i.test(safeSrc) || seen.has(safeSrc)) {
      return;
    }
    seen.add(safeSrc);
    queue.push({ src: safeSrc, fetchPriority: index === 0 ? "high" : "auto" });
  });

  queue.slice(0, 2).forEach(({ src, fetchPriority }) => {
    preloadImageSource(src, { fetchPriority });
  });

  const cacheUrls = queue.map((item) => item.src).filter(Boolean);
  if (cacheUrls.length && canUseServiceWorkerImageWarmCache() && "serviceWorker" in navigator) {
    const postCacheMessage = (registration) => {
      try {
        registration?.active?.postMessage?.({
          type: "CACHE_IMAGE_URLS",
          urls: cacheUrls.slice(0, 14)
        });
      } catch (error) {
        // Ignore SW warm-cache messaging issues.
      }
    };
    if (navigator.serviceWorker.controller) {
      postCacheMessage({ active: navigator.serviceWorker.controller });
    } else if (navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(postCacheMessage).catch(() => {});
    }
  }
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

  setNodeText(authGateTitle, options.title || "You need an account to continue");
  setNodeText(authGateCopy, options.message || "Already have an account? Sign In. New here? Sign Up.");
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
  const isRestrictedView = currentView === "profile"
    || currentView === "upload"
    || (currentView === "admin" && isStaffUser());
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
    headerSearchArea.style.display = isRestrictedView ? "none" : "flex";
  }
  if (topBarSubtitle) {
    setNodeText(topBarSubtitle, isSessionRestoreUi
      ? "Restoring your WINGA session..."
      : isGuest
      ? "Discover products first. Sign in only when you want to buy, chat, or sell."
      : "");
    topBarSubtitle.style.display = isGuest || isSessionRestoreUi ? "" : "none";
  }
  syncInstallChrome();
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
  if (!window.history?.replaceState || document.body.classList.contains("product-detail-open") || isFileProtocolPreview()) {
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
    safePushState(nextState, nextUrl);
    return;
  }
  safeReplaceState(nextState, nextUrl);
}

function isFileProtocolPreview() {
  return String(window.location?.protocol || "").toLowerCase() === "file:"
    || String(window.location?.origin || "").toLowerCase() === "null";
}

function safeReplaceState(state, url) {
  if (!window.history?.replaceState || isFileProtocolPreview()) {
    return false;
  }
  try {
    window.history.replaceState(state, "", url);
    return true;
  } catch (error) {
    return false;
  }
}

function getVisibleFeedProductIndex() {
  if (!productsContainer) {
    return -1;
  }
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  let maxIndex = -1;
  productsContainer.querySelectorAll(".product-card[data-feed-product-index]").forEach((card) => {
    const index = Number(card.dataset.feedProductIndex);
    if (!Number.isFinite(index)) {
      return;
    }
    const rect = card.getBoundingClientRect();
    if (rect.bottom >= 0 && rect.top <= viewportHeight * 1.2) {
      maxIndex = Math.max(maxIndex, index);
    }
  });
  return maxIndex;
}

function getAdaptivePredictiveFeedWindow() {
  const layoutMode = getClientLayoutMode();
  const isCompactLayout = layoutMode === "mobile" || layoutMode === "standalone-mobile" || layoutMode === "mobile-desktop-site";
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  const pendingMediaPressure = Math.min(4, getCurrentPendingContinuationMediaCount());
  const pressureProductPenalty = pendingMediaPressure >= 3 ? 2 : (pendingMediaPressure >= 1 ? 1 : 0);
  const pressureDecodePenalty = pendingMediaPressure >= 2 ? 1 : 0;
  if (scrollSpeed <= 0.18) {
    return {
      productLimit: Math.max(4, (isCompactLayout ? 12 : 16) - pressureProductPenalty),
      decodeLimit: Math.max(3, (isCompactLayout ? 6 : 8) - pressureDecodePenalty)
    };
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return {
      productLimit: Math.max(4, (isCompactLayout ? 8 : 12) - pressureProductPenalty),
      decodeLimit: Math.max(2, (isCompactLayout ? 4 : 6) - pressureDecodePenalty)
    };
  }
  return {
    productLimit: Math.max(3, (isCompactLayout ? 5 : 8) - pressureProductPenalty),
    decodeLimit: Math.max(2, (isCompactLayout ? 3 : 4) - pressureDecodePenalty)
  };
}

function primeIncomingFeedItems(productsList = [], options = {}) {
  if (!Array.isArray(productsList) || !productsList.length) {
    return;
  }
  const windowConfig = getAdaptivePredictiveFeedWindow();
  primeFeedInstantCache(productsList, {
    reason: String(options.reason || "incoming_feed_items"),
    productLimit: Math.min(productsList.length, Number(options.productLimit || windowConfig.productLimit) || windowConfig.productLimit),
    decodeLimit: Math.min(productsList.length, Number(options.decodeLimit || windowConfig.decodeLimit) || windowConfig.decodeLimit)
  });
}

function collectVariantInjectionImages(productsList = [], options = {}) {
  const productLimit = Math.max(
    1,
    Math.min(
      Number(options.productLimit || HOME_VARIANT_INJECTION_PREFETCH_PRODUCT_LIMIT) || HOME_VARIANT_INJECTION_PREFETCH_PRODUCT_LIMIT,
      Array.isArray(productsList) ? productsList.length : 0
    )
  );
  const radius = Math.max(0, Number(options.radius || HOME_VARIANT_INJECTION_PREFETCH_RADIUS) || 0);
  const queue = [];
  const seen = new Set();
  const pushImage = (src, fetchPriority = "auto", decodeInMemory = false) => {
    const safeSrc = sanitizeImageSource(src, "");
    if (!safeSrc || seen.has(safeSrc)) {
      return;
    }
    seen.add(safeSrc);
    queue.push({
      src: safeSrc,
      fetchPriority,
      decodeInMemory
    });
  };

  productsList
    .filter((product) => product?.feedVariantResurface)
    .slice(0, productLimit)
    .forEach((product, productIndex) => {
      const images = getRenderableMarketplaceImages(product);
      if (!images.length) {
        return;
      }
      const preferredIndex = Math.max(
        0,
        Math.min(
          images.length - 1,
          Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex ?? 0) || 0
        )
      );
      pushImage(images[preferredIndex], productIndex === 0 ? "high" : "auto", true);
      for (let step = 1; step <= radius; step += 1) {
        const nextIndex = preferredIndex + step;
        const previousIndex = preferredIndex - step;
        if (nextIndex < images.length) {
          pushImage(images[nextIndex], productIndex === 0 && step === 1 ? "high" : "auto", step === 1);
        }
        if (previousIndex >= 0) {
          pushImage(images[previousIndex], "auto", false);
        }
      }
    });

  return queue;
}

function primeVariantInjectionImages(productsList = [], options = {}) {
  if (!Array.isArray(productsList) || !productsList.length || typeof preloadImageSource !== "function") {
    return;
  }
  const queue = collectVariantInjectionImages(productsList, options);
  if (!queue.length) {
    return;
  }
  queue.forEach(({ src, fetchPriority, decodeInMemory }) => {
    preloadImageSource(src, {
      fetchPriority,
      decodeInMemory,
      reason: String(options.reason || "variant_injection")
    });
  });
}

function collectInfiniteScrollImageUrls(items = []) {
  const urls = [];
  const seen = new Set();
  const pushUrl = (value) => {
    const safeSrc = sanitizeImageSource(value, "");
    if (!safeSrc || seen.has(safeSrc)) {
      return;
    }
    seen.add(safeSrc);
    urls.push(safeSrc);
  };
  const pushNestedImages = (value, depth = 0) => {
    if (!value || depth > 3) {
      return;
    }
    if (typeof value === "string") {
      pushUrl(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => pushNestedImages(entry, depth + 1));
      return;
    }
    if (typeof value === "object") {
      [
        value.image,
        value.imageUrl,
        value.url,
        value.src,
        value.thumbnail,
        value.thumbnailUrl,
        value.preview,
        value.previewImage,
        value.previewImageUrl,
        value.feed,
        value.feedImage,
        value.feedImageUrl
      ].forEach(pushUrl);
      ["images", "variants", "variations", "colors", "imageVariants"].forEach((key) => {
        pushNestedImages(value[key], depth + 1);
      });
    }
  };

  (Array.isArray(items) ? items : []).forEach((product) => {
    getProductImageCandidates(product).forEach(pushUrl);
    getRenderableMarketplaceImages(product).forEach(pushUrl);
    pushNestedImages(product?.variants);
    pushNestedImages(product?.variations);
    pushNestedImages(product?.imageVariants);
  });
  return urls;
}

function preloadInfiniteScrollImages(urls = [], options = {}) {
  const safeUrls = Array.from(new Set((Array.isArray(urls) ? urls : [])
    .map((url) => sanitizeImageSource(url, ""))
    .filter(Boolean)));
  const timeoutMs = Math.max(800, Number(options.timeoutMs || HOME_INFINITE_READY_PRELOAD_TIMEOUT_MS));
  if (!safeUrls.length) {
    return Promise.resolve([]);
  }
  const imagePromises = safeUrls.map((url) => new Promise((resolve) => {
    if (/^data:/i.test(url)) {
      resolve({ url, ok: true, cached: true });
      return;
    }
    preloadImageSource(url, {
      fetchPriority: options.fetchPriority || "auto",
      decodeInMemory: false,
      reason: options.reason || "infinite_scroll_preload"
    });
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ url, ok });
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    window.setTimeout(() => finish(false), timeoutMs);
    image.src = url;
  }));
  const hardTimeout = new Promise((resolve) => {
    window.setTimeout(() => resolve([]), timeoutMs);
  });
  return Promise.race([
    Promise.allSettled(imagePromises),
    hardTimeout
  ]);
}

function prepareContinuousDescriptorMedia(descriptor, reason = "continuous_ready_queue") {
  if (!descriptor || !Array.isArray(descriptor.items) || !descriptor.items.length) {
    return Promise.resolve(false);
  }
  if (descriptor.mediaReady === true) {
    return Promise.resolve(true);
  }
  if (descriptor.mediaReadyPromise) {
    return descriptor.mediaReadyPromise;
  }
  const urls = collectInfiniteScrollImageUrls(descriptor.items);
  descriptor.mediaReadyPromise = preloadInfiniteScrollImages(urls, {
    reason,
    fetchPriority: "auto",
    timeoutMs: HOME_INFINITE_READY_PRELOAD_TIMEOUT_MS
  }).then(() => {
    descriptor.mediaReady = true;
    descriptor.readyAt = Date.now();
    return true;
  }).catch(() => {
    descriptor.mediaReady = true;
    descriptor.readyAt = Date.now();
    return false;
  });
  return descriptor.mediaReadyPromise;
}

function insertContinuousNodesInFrames(anchor, nodes = [], options = {}) {
  const queue = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  const chunkSize = Math.max(1, Number(options.chunkSize || HOME_INFINITE_DOM_INJECT_CHUNK_SIZE));
  const onChunk = typeof options.onChunk === "function" ? options.onChunk : null;
  return new Promise((resolve) => {
    const injectNextChunk = () => {
      if (!anchor?.isConnected || !queue.length) {
        resolve();
        return;
      }
      const chunk = queue.splice(0, chunkSize);
      const fragment = document.createDocumentFragment();
      chunk.forEach((node) => {
        if (node instanceof HTMLElement) {
          node.style.contentVisibility = "auto";
          node.style.containIntrinsicSize = "0 480px";
        }
        fragment.appendChild(node);
      });
      anchor.before(fragment);
      onChunk?.(chunk);
      if (!queue.length) {
        resolve();
        return;
      }
      window.requestAnimationFrame(injectNextChunk);
    };
    window.requestAnimationFrame(injectNextChunk);
  });
}

function silentlyRefreshInfiniteFeedSource() {
  const now = Date.now();
  if (homeContinuousDiscoveryRuntime.backendRefreshPromise) {
    return homeContinuousDiscoveryRuntime.backendRefreshPromise;
  }
  if (now - Number(homeContinuousDiscoveryRuntime.lastBackendRefreshAt || 0) < HOME_INFINITE_BACKEND_REFRESH_COOLDOWN_MS) {
    return Promise.resolve(false);
  }
  const dataLayer = window.WingaDataLayer;
  const appendProductsPage = dataLayer?.appendProductsPage;
  const refreshProducts = dataLayer?.refreshProducts;
  const getPagination = dataLayer?.getProductFeedPagination;
  if (homeContinuousDiscoveryRuntime.isLoadingMore) {
    return Promise.resolve(false);
  }
  const pagination = typeof getPagination === "function" ? getPagination.call(dataLayer) : null;
  if (pagination && pagination.hasMore === false) {
    return Promise.resolve(false);
  }
  homeContinuousDiscoveryRuntime.isLoadingMore = true;
  homeContinuousDiscoveryRuntime.lastBackendRefreshAt = now;
  const requestId = ++homeContinuousDiscoveryRuntime.loadMoreRequestId;
  const requestPromise = typeof appendProductsPage === "function"
    ? Promise.resolve(appendProductsPage.call(dataLayer, pagination ? {
      cursor: pagination.nextCursor || "",
      page: Number(pagination.page || 1) + 1,
      limit: Number(pagination.limit || 0) || undefined
    } : {}))
    : (typeof refreshProducts === "function"
      ? Promise.resolve(refreshProducts.call(dataLayer))
      : Promise.resolve(false));
  homeContinuousDiscoveryRuntime.backendRefreshPromise = requestPromise
    .then((page) => {
      if (requestId !== homeContinuousDiscoveryRuntime.loadMoreRequestId) {
        return false;
      }
      const appendedProducts = Array.isArray(page?.appendedItems) && page.appendedItems.length
        ? page.appendedItems
        : (Array.isArray(page?.items) ? page.items : []);
      const appendedCount = Number(page?.appendedCount || appendedProducts.length || 0);
      if (appendedCount > 0) {
        refreshProductsFromStore();
        primeIncomingFeedItems(appendedProducts, {
          reason: "infinite_scroll_append",
          productLimit: Math.min(appendedProducts.length, 8),
          decodeLimit: Math.min(appendedProducts.length, 4)
        });
        return true;
      }
      if (typeof refreshProducts === "function" && typeof appendProductsPage !== "function") {
        refreshProductsFromStore();
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      if (requestId === homeContinuousDiscoveryRuntime.loadMoreRequestId) {
        homeContinuousDiscoveryRuntime.isLoadingMore = false;
        homeContinuousDiscoveryRuntime.backendRefreshPromise = null;
      }
    });
  return homeContinuousDiscoveryRuntime.backendRefreshPromise;
}

function collectProductDetailTransitionImages(product, initialImageIndex = 0) {
  const renderableImages = getRenderableMarketplaceImages(product, {
    allowOwnerVisibility: product?.uploadedBy === currentUser
  });
  const safeImages = (Array.isArray(renderableImages) && renderableImages.length
    ? renderableImages
    : (Array.isArray(product?.images) ? product.images : [product?.image]))
    .map((image) => sanitizeImageSource(image, ""))
    .filter(Boolean);
  if (!safeImages.length) {
    return [];
  }
  const safeInitialIndex = safeImages.length > 1
    ? Math.max(0, Math.min(safeImages.length - 1, Number(initialImageIndex || 0) || 0))
    : 0;
  const queue = [];
  const seen = new Set();
  const pushIndex = (index, fetchPriority = "auto", decodeInMemory = false) => {
    if (index < 0 || index >= safeImages.length) {
      return;
    }
    const src = safeImages[index];
    if (!src || seen.has(src)) {
      return;
    }
    seen.add(src);
    queue.push({
      src,
      fetchPriority,
      decodeInMemory
    });
  };

  pushIndex(safeInitialIndex, "high", true);
  for (let step = 1; step <= PRODUCT_DETAIL_TRANSITION_PRELOAD_RADIUS; step += 1) {
    pushIndex(safeInitialIndex + step, step === 1 ? "high" : "auto", step === 1);
    pushIndex(safeInitialIndex - step, "auto", false);
  }
  return queue;
}

function primeProductDetailTransition(product, initialImageIndex = 0) {
  if (!product || typeof preloadImageSource !== "function") {
    return;
  }
  const queue = collectProductDetailTransitionImages(product, initialImageIndex);
  if (!queue.length) {
    return;
  }
  bumpRuntimeDiagnostic("productDetailTransitionPrimeCount");
  bumpRuntimeDiagnostic("productDetailTransitionImageCount", queue.length);
  reportShowcaseInstrumentation("product_detail_transition_prime", {
    productId: String(product.id || "").trim(),
    initialImageIndex: Number(initialImageIndex || 0) || 0,
    imageCount: queue.length
  });
  queue.forEach(({ src, fetchPriority, decodeInMemory }) => {
    preloadImageSource(src, {
      fetchPriority,
      decodeInMemory,
      reason: "product_detail_transition"
    });
  });
}

function primePredictiveFeedBatch(trigger = "scroll") {
  if (currentView !== "home" || document.hidden) {
    return;
  }
  const filteredProducts = getFilteredProducts();
  if (!Array.isArray(filteredProducts) || !filteredProducts.length) {
    return;
  }
  const windowConfig = getAdaptivePredictiveFeedWindow();
  const visibleIndex = getVisibleFeedProductIndex();
  if (visibleIndex < 0) {
    primeIncomingFeedItems(filteredProducts, {
      reason: `${trigger}_bootstrap`,
      productLimit: windowConfig.productLimit,
      decodeLimit: windowConfig.decodeLimit
    });
    return;
  }
  if (visibleIndex <= Number(feedRuntimeState.lastVisibleIndex || -1) && trigger === "scroll") {
    return;
  }
  feedRuntimeState.lastVisibleIndex = visibleIndex;
  const batchStart = Math.min(filteredProducts.length, visibleIndex + 1);
  const nextProducts = filteredProducts.slice(batchStart, batchStart + FEED_PREDICTIVE_NEXT_BATCH_SIZE);
  if (!nextProducts.length) {
    return;
  }
  primeIncomingFeedItems(nextProducts, {
    reason: `${trigger}_next_batch`,
    productLimit: Math.min(windowConfig.productLimit, nextProducts.length),
    decodeLimit: Math.min(windowConfig.decodeLimit, nextProducts.length)
  });
}

function schedulePredictiveFeedPrefetch(trigger = "scroll") {
  if (
    trigger !== "scroll"
    && (document.body.classList.contains("app-booting") || !bootOverlay?.classList.contains("is-hidden"))
  ) {
    return;
  }
  const now = Date.now();
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  const adaptiveCooldown = trigger === "scroll"
    ? Math.max(180, Math.min(FEED_MEMORY_PREFETCH_COOLDOWN_MS, scrollSpeed <= 0.18 ? 220 : (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD ? 420 : FEED_MEMORY_PREFETCH_COOLDOWN_MS)))
    : 0;
  if (
    trigger === "scroll"
    && now - Number(feedRuntimeState.lastPrefetchAt || 0) < adaptiveCooldown
  ) {
    return;
  }
  if (feedRuntimeState.prefetchTimer) {
    window.clearTimeout(feedRuntimeState.prefetchTimer);
    feedRuntimeState.prefetchTimer = 0;
  }
  const delay = trigger === "scroll"
    ? (scrollSpeed <= 0.18 ? 0 : (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD ? 20 : 40))
    : 0;
  feedRuntimeState.prefetchTimer = window.setTimeout(() => {
    feedRuntimeState.prefetchTimer = 0;
    feedRuntimeState.lastPrefetchAt = Date.now();
    feedRuntimeState.lastPrefetchReason = trigger;
    primePredictiveFeedBatch(trigger);
  }, delay);
}

function bindServiceWorkerDiagnostics() {
  if (!("serviceWorker" in navigator) || bindServiceWorkerDiagnostics.bound) {
    return;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    const payload = event?.data?.payload;
    if (event?.data?.type !== "WINGA_SW_LOG" || !payload) {
      return;
    }
    reportClientEvent(
      payload.level === "error" ? "error" : "warn",
      `sw_${String(payload.event || "event").toLowerCase()}`,
      "Service worker lifecycle event captured.",
      {
        category: "runtime",
        swEvent: String(payload.event || ""),
        swUrl: String(payload.url || ""),
        swMessage: String(payload.message || ""),
        destination: String(payload.destination || "")
      }
    );
  });
  bindServiceWorkerDiagnostics.bound = true;
}

function safePushState(state, url) {
  if (!window.history?.pushState || isFileProtocolPreview()) {
    return false;
  }
  try {
    window.history.pushState(state, "", url);
    return true;
  } catch (error) {
    return false;
  }
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
  const intentType = String(intent.type || "").trim();
  const shouldClearDeepLinkRoute = intentType !== "focus-product";
  if (shouldClearDeepLinkRoute) {
    clearPendingDeepLinkProductRoute();
    if (String(window.location.pathname || "").trim().match(/^\/product\/.+/i)) {
      safeReplaceState(window.history.state || null, "/");
    }
  }

  if (intent.type === "open-chat" && intent.productId) {
    const product = getProductById(intent.productId);
    if (product) {
      openProductChat(product);
      return;
    }
  }

  if (intent.type === "open-whatsapp" && intent.productId) {
    const product = getProductById(intent.productId);
    if (product) {
      const whatsappHref = buildWhatsappHref(product.whatsapp, product.name);
      if (whatsappHref !== "#") {
        const opened = window.open(whatsappHref, "_blank", "noopener,noreferrer");
        if (!opened) {
          window.location.href = whatsappHref;
        }
      }
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
      setCurrentViewState("home", { syncHistory: false });
      renderCurrentView();
      syncAppShellHistoryState({
        force: true,
        mode: "replace",
        url: "/"
      });
      window.requestAnimationFrame(() => {
        scrollToProductCard(intent.productId);
      });
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
  const normalized = normalizeDisplayName(currentSession?.fullName || currentUser || "");
  return normalized || "User";
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
    ...(isStandaloneDisplayMode() ? [] : [{ action: "install", label: getPwaInstallButtonLabel() }]),
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
  chatUiState.profileMessagesMode = "list";
  chatUiState.profileMessagesFilter = "all";
  chatUiState.profileHasSelection = false;
  chatUiState.activeContext = null;
  chatUiState.currentDraft = "";
  chatUiState.selectedProductIds = [];
  chatUiState.activeReplyMessageId = "";
  chatUiState.openMessageMenuId = "";
  chatUiState.openEmojiScope = "";
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
  const normalized = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  const lower = normalized.toLowerCase();
  return lower === "null" || lower === "undefined" ? "" : normalized;
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
    noteSellerInterest(relatedProduct.uploadedBy, 16, {
      signalType: "card_open",
      productId
    });
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

function noteSharedCollectionIntent(intent = {}, options = {}) {
  const category = getRestorableCategory(intent.category || "all");
  const topCategory = isTopCategoryValue(intent.topCategory)
    ? intent.topCategory
    : (category !== "all" ? inferTopCategoryValue(category) : "");
  if (category === "all" && !topCategory) {
    return;
  }
  const source = String(options.source || intent.source || "share_collection").trim().toLowerCase() || "share_collection";
  const entryKey = `${category}::${topCategory}`;
  const existingEntry = sharedCollectionIntentEntries.find((entry) => `${entry.category}::${entry.topCategory}` === entryKey);
  const seedSnapshot = getSharedCollectionIntentSeedSnapshot({
    category,
    topCategory
  });
  const nextEntry = {
    category,
    topCategory,
    count: Math.min(12, Math.max(1, Number(existingEntry?.count || 0) + 1)),
    updatedAt: new Date().toISOString(),
    source,
    seedSellerIds: Array.from(new Set([...(existingEntry?.seedSellerIds || []), ...seedSnapshot.seedSellerIds])).slice(0, 4),
    seedProductIds: Array.from(new Set([...(existingEntry?.seedProductIds || []), ...seedSnapshot.seedProductIds])).slice(0, 6)
  };
  sharedCollectionIntentEntries = [
    nextEntry,
    ...sharedCollectionIntentEntries.filter((entry) => `${entry.category}::${entry.topCategory}` !== entryKey)
  ].slice(0, 8);
  noteCategoryInterest(category);
  saveSharedCollectionIntentState();
}

function getSharedCollectionIntentSeedSnapshot(intent = {}) {
  const category = getRestorableCategory(intent.category || "all");
  const topCategory = isTopCategoryValue(intent.topCategory)
    ? intent.topCategory
    : (category !== "all" ? inferTopCategoryValue(category) : "");
  const matchingProducts = products
    .filter((product) => {
      if (!product || product.status !== "approved" || product.availability === "sold_out") {
        return false;
      }
      if (category !== "all" && product.category === category) {
        return true;
      }
      if (topCategory && inferTopCategoryValue(product.category) === topCategory) {
        return true;
      }
      return false;
    })
    .sort((first, second) => new Date(second.createdAt || second.timestamp || 0).getTime() - new Date(first.createdAt || first.timestamp || 0).getTime())
    .slice(0, 6);
  return {
    seedSellerIds: Array.from(new Set(matchingProducts.map((product) => String(product.uploadedBy || "").trim()).filter(Boolean))).slice(0, 4),
    seedProductIds: matchingProducts.map((product) => normalizeProductIdValue(product.id)).filter(Boolean).slice(0, 6)
  };
}

function noteMessageInterest(productId) {
  if (!productId) {
    return;
  }
  recentMessagedProductIds = rememberBehaviorValue(recentMessagedProductIds, productId, 10);
  const relatedProduct = getProductById(productId);
  if (relatedProduct?.uploadedBy) {
    noteSellerInterest(relatedProduct.uploadedBy, 34, {
      signalType: "message",
      productId
    });
  }
}

function noteProductEngagementSignal(productId, signalType, fallbackWeight = 1) {
  const normalizedProductId = normalizeProductIdValue(productId);
  if (!normalizedProductId) {
    return;
  }
  const normalizedSignal = String(signalType || "").trim().toLowerCase();
  const existingVariationState = productVariationSignalState[normalizedProductId] || {
    liked: false,
    lingerMs: 0,
    variationSwipeCount: 0,
    updatedAt: 0
  };
  const nextVariationState = {
    ...existingVariationState,
    updatedAt: Date.now()
  };
  if (normalizedSignal === "linger_5s") {
    nextVariationState.lingerMs = Math.min(60000, Number(existingVariationState.lingerMs || 0) + PRODUCT_CARD_LINGER_THRESHOLD_MS);
  } else if (normalizedSignal === "variation_swipe") {
    nextVariationState.variationSwipeCount = Math.min(12, Number(existingVariationState.variationSwipeCount || 0) + 1);
  }
  productVariationSignalState[normalizedProductId] = nextVariationState;
  const relatedProduct = getProductById(normalizedProductId);
  if (!relatedProduct?.uploadedBy) {
    return;
  }
  noteSellerInterest(relatedProduct.uploadedBy, fallbackWeight, {
    signalType,
    productId: normalizedProductId
  });
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
  maybePromptNotificationPermission,
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
    chatUiState.currentDraft = loadStoredChatDraft(chatUiState.activeContext);
    openProfileSection("profile-messages-panel");
    try {
      await markActiveConversationRead();
    } catch (error) {
      // Ignore passive read sync failures.
    }
  }
});

function getChatContextKey(context) {
  return `${context?.withUser || ""}`;
}

function getChatDraftStorageKey(context = chatUiState.activeContext) {
  const contextKey = getChatContextKey(context);
  if (!contextKey || contextKey === "::") {
    return "";
  }
  return `${APP_CHAT_DRAFT_KEY_PREFIX}:${currentUser || "guest"}:${contextKey}`;
}

function loadStoredChatDraft(context = chatUiState.activeContext) {
  const storageKey = getChatDraftStorageKey(context);
  if (!storageKey) {
    return "";
  }
  try {
    return String(localStorage.getItem(storageKey) || "");
  } catch (error) {
    return "";
  }
}

function saveStoredChatDraft(value = "", context = chatUiState.activeContext) {
  const storageKey = getChatDraftStorageKey(context);
  if (!storageKey) {
    return;
  }
  try {
    const nextValue = String(value || "");
    if (!nextValue.trim()) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, nextValue);
  } catch (error) {
    // Ignore chat draft persistence failures.
  }
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
  const whatsappNumber = getProductWhatsappNumber(product);
  if (!whatsappNumber) {
    return "";
  }
  return `<button class="button whatsapp-chat-btn" type="button" data-open-product-whatsapp="${product.id}">${label}</button>`;
}

function openProductWhatsappFromCard(productId) {
  const product = getProductById(productId);
  if (!product) {
    reportClientEvent("error", "whatsapp_product_missing", "WhatsApp button handler could not resolve the product.", {
      productId
    });
    return;
  }

  if (!isAuthenticatedUser()) {
    promptGuestAuth?.({
      preferredMode: "signup",
      role: "buyer",
      title: "You need an account to continue",
      message: "Sign up or log in to continue with WhatsApp on this product.",
      intent: { type: "open-whatsapp", productId }
    });
    return;
  }

  const whatsappHref = buildWhatsappHref(product.whatsapp, product.name);
  if (whatsappHref !== "#") {
    const opened = window.open(whatsappHref, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = whatsappHref;
    }
  }
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
  getCurrentSession: () => currentSession,
  getChatUiState: () => chatUiState,
  chatEmojiChoices: CHAT_EMOJI_CHOICES,
  isProductInRequestBox,
  canUseBuyerFeatures,
  renderWhatsappChatLink,
  canRepostProduct: (product) => canRepostProductAsSeller(product),
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
    const key = getChatContextKey({ withUser });
    const existing = summaryMap.get(key);
    const partner = getMarketplaceUser(withUser);
    const messageTime = new Date(message.timestamp || 0).getTime();
    const existingTime = new Date(existing?.timestamp || 0).getTime();
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
    if (!existing || messageTime >= existingTime) {
      summaryMap.set(key, summary);
    } else if (summary.unreadCount !== (existing?.unreadCount || 0)) {
      summaryMap.set(key, {
        ...existing,
        unreadCount: summary.unreadCount
      });
    }
  });

  const summaries = Array.from(summaryMap.values())
    .map((summary) => ({
      ...summary,
      commerceSnapshot: getConversationCommerceSnapshot(summary),
      relationshipMemory: getConversationRelationshipMemory(summary)
    }))
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
  return getRenderableNotifications()
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

function ensureNetworkStatusBannerRoot() {
  let root = document.getElementById("network-status-banner-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "network-status-banner-root";
    document.body.appendChild(root);
  }
  return root;
}

function hideNetworkStatusBanner() {
  const root = document.getElementById("network-status-banner-root");
  root?.replaceChildren();
  if (uiRuntimeState.networkStatusHideTimer) {
    window.clearTimeout(uiRuntimeState.networkStatusHideTimer);
    uiRuntimeState.networkStatusHideTimer = 0;
  }
}

function showNetworkStatusBanner({
  title = "",
  body = "",
  variant = "info",
  persistent = false,
  durationMs = 3600
} = {}) {
  if (!title) {
    hideNetworkStatusBanner();
    return;
  }
  const root = ensureNetworkStatusBannerRoot();
  const banner = createElement("div", {
    className: `network-status-banner network-status-banner-${["info", "warning", "success"].includes(variant) ? variant : "info"}`
  });
  const copy = createElement("div", { className: "network-status-banner-copy" });
  copy.append(
    createElement("strong", { textContent: title }),
    createElement("p", { textContent: body || "" })
  );
  banner.appendChild(copy);
  root.replaceChildren(banner);
  if (uiRuntimeState.networkStatusHideTimer) {
    window.clearTimeout(uiRuntimeState.networkStatusHideTimer);
    uiRuntimeState.networkStatusHideTimer = 0;
  }
  if (!persistent) {
    uiRuntimeState.networkStatusHideTimer = window.setTimeout(() => {
      uiRuntimeState.networkStatusHideTimer = 0;
      root.replaceChildren();
    }, Math.max(1800, Number(durationMs || 3600)));
  }
}

function syncNetworkStatusBanner(options = {}) {
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  uiRuntimeState.lastKnownOnlineState = online;
  if (!online) {
    showNetworkStatusBanner({
      title: "Uko offline",
      body: "Chat zenye queue zitasubiri. Upload na payment submit vinahitaji internet irudi kwanza.",
      variant: "warning",
      persistent: true
    });
    return;
  }
  if (options.justReconnected) {
    showNetworkStatusBanner({
      title: "Internet imerudi",
      body: "Tunaendelea kusync actions zilizokuwa zinasubiri.",
      variant: "success",
      durationMs: 2800
    });
    return;
  }
  if (!options.forceKeepVisible) {
    hideNetworkStatusBanner();
  }
}

function refreshVisibleRecoverySurfaces() {
  if (document.getElementById("profile-messages-panel")) {
    replaceMessagesPanel(profileDiv);
  }
  const contextModal = document.getElementById("context-chat-modal");
  if (contextModal && !contextModal.hidden) {
    replaceContextChatModal();
  }
  const paymentModal = document.getElementById("payment-intent-modal");
  if (paymentModal && !paymentModal.hidden) {
    renderPaymentIntentModal();
  }
}

function applyReconnectRecoveryHints() {
  let chatStatusChanged = false;
  if (!chatUiState.composeStatus || typeof chatUiState.composeStatus !== "object") {
    chatUiState.composeStatus = {};
  }
  ["profile", "context"].forEach((scope) => {
    const currentStatus = chatUiState.composeStatus?.[scope];
    if (currentStatus?.tone === "warning") {
      chatUiState.composeStatus[scope] = {
        tone: "info",
        message: "Internet imerudi. Ujumbe uliokuwa umehifadhiwa utaendelea kusync. Kama hauonekani baada ya muda, tuma tena."
      };
      chatStatusChanged = true;
    }
  });

  if (uiRuntimeState.productUploadStatusTone === "warning") {
    uiRuntimeState.productUploadStatusTone = "info";
    setUploadFormStatus("info", "Internet imerudi. Unaweza kuendelea kupost bidhaa yako sasa.");
  }

  if (paymentIntentState.feedbackTone === "warning") {
    paymentIntentState.feedbackTone = "info";
    paymentIntentState.feedbackMessage = "Internet imerudi. Kagua reference yako kisha bonyeza Submit reference tena.";
  }

  if (chatStatusChanged || paymentIntentState.feedbackTone === "info") {
    refreshVisibleRecoverySurfaces();
  }
}

function applyOfflineQueueFlushHints(flushedCount = 0, remainingCount = 0) {
  let chatStatusChanged = false;
  if (!chatUiState.composeStatus || typeof chatUiState.composeStatus !== "object") {
    chatUiState.composeStatus = {};
  }
  ["profile", "context"].forEach((scope) => {
    const currentStatus = chatUiState.composeStatus?.[scope];
    if (!currentStatus || !["warning", "info"].includes(String(currentStatus.tone || "").trim())) {
      return;
    }
    chatUiState.composeStatus[scope] = {
      tone: remainingCount > 0 ? "info" : "success",
      message: remainingCount > 0
        ? `${flushedCount} action zimesync, lakini bado kuna zingine zinasubiri network iwe thabiti.`
        : "Ujumbe uliokuwa kwenye queue umesync vizuri."
    };
    chatStatusChanged = true;
  });
  if (chatStatusChanged) {
    refreshVisibleRecoverySurfaces();
  }
}

function isStandaloneDisplayMode() {
  try {
    return window.matchMedia?.("(display-mode: standalone)")?.matches
      || window.matchMedia?.("(display-mode: fullscreen)")?.matches
      || window.navigator?.standalone === true;
  } catch (error) {
    return false;
  }
}

function isPwaInstallPromotable() {
  return !isStandaloneDisplayMode() && Boolean(appInstallState.deferredPrompt);
}

function getPwaInstallButtonLabel() {
  if (isStandaloneDisplayMode()) {
    return "Open app";
  }
  if (appInstallState.deferredPrompt) {
    return "Install app";
  }
  return "Install app";
}

function getPwaInstallHelpCopy() {
  if (isStandaloneDisplayMode()) {
    return "Winga is already installed on this device.";
  }
  return "If the browser prompt is not shown yet, open browser menu and choose Install app or Add to home screen.";
}

function ensurePwaInstallButton(buttonId, className = "public-header-btn public-header-btn-primary") {
  let button = document.getElementById(buttonId);
  if (!button) {
    button = document.createElement("button");
    button.id = buttonId;
    button.type = "button";
    button.className = className;
  }
  return button;
}

function ensureInstallChrome() {
  if (publicHeaderActions) {
    headerInstallButton = ensurePwaInstallButton("header-install-button");
    if (!headerInstallButton.isConnected) {
      publicHeaderActions.appendChild(headerInstallButton);
    }
  }

  if (authContainer) {
    let authPromo = document.getElementById("auth-install-promo");
    if (!authPromo) {
      authPromo = createElement("div", {
        attributes: { id: "auth-install-promo" },
        className: "auth-install-promo"
      });
      authPromo.append(
        createElement("p", {
          className: "auth-install-title",
          textContent: "Install Winga on your device"
        }),
        createElement("p", {
          className: "auth-install-copy",
          textContent: "Get faster access, smoother browsing, and a home-screen shortcut."
        })
      );
      authInstallButton = ensurePwaInstallButton("auth-install-button", "public-header-btn public-header-btn-primary");
      authPromo.appendChild(authInstallButton);
      const toggleLink = document.getElementById("toggle-link");
      if (toggleLink?.parentElement === authContainer) {
        toggleLink.insertAdjacentElement("afterend", authPromo);
      } else {
        authContainer.appendChild(authPromo);
      }
    }
  }
}

function syncInstallChrome() {
  ensureInstallChrome();

  const installed = isStandaloneDisplayMode() || appInstallState.installed;
  if (headerInstallButton) {
    headerInstallButton.hidden = installed;
    headerInstallButton.textContent = getPwaInstallButtonLabel();
  }
  if (authInstallButton) {
    authInstallButton.hidden = installed;
    authInstallButton.textContent = getPwaInstallButtonLabel();
  }

  const authPromo = document.getElementById("auth-install-promo");
  if (authPromo) {
    authPromo.hidden = installed;
  }

  appInstallState.menuHintVisible = !installed;
}

async function promptAppInstall(source = "header") {
  if (isStandaloneDisplayMode()) {
    showInAppNotification({
      title: "Winga already installed",
      body: "App iko tayari kufunguka kama app kwenye kifaa hiki.",
      variant: "info"
    });
    return true;
  }

  if (appInstallState.deferredPrompt) {
    const promptEvent = appInstallState.deferredPrompt;
    appInstallState.deferredPrompt = null;
    syncInstallChrome();
    try {
      promptEvent.prompt();
      const choiceResult = await promptEvent.userChoice;
      if (choiceResult?.outcome === "accepted") {
        showInAppNotification({
          title: "Installing Winga",
          body: "Browser inaandaa app yako.",
          variant: "success"
        });
        return true;
      }
    } catch (error) {
      captureClientError("pwa_install_prompt_failed", error, {
        source
      });
    }
  }

  showInAppNotification({
    title: "Install Winga",
    body: getPwaInstallHelpCopy(),
    variant: "info"
  });
  return false;
}

function initializePwaInstallExperience() {
  if (appInstallState.initialized) {
    return;
  }
  appInstallState.initialized = true;
  appInstallState.installed = isStandaloneDisplayMode();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    appInstallState.deferredPrompt = event;
    syncInstallChrome();
  });

  window.addEventListener("appinstalled", () => {
    appInstallState.deferredPrompt = null;
    appInstallState.installed = true;
    syncInstallChrome();
    showInAppNotification({
      title: "Winga installed",
      body: "App iko tayari kutumia kwenye device hii.",
      variant: "success"
    });
  });

  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
    appInstallState.installed = isStandaloneDisplayMode();
    syncInstallChrome();
  });

  syncInstallChrome();
}

function ensureAppUpdateBannerRoot() {
  let root = document.getElementById("app-update-banner-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "app-update-banner-root";
    document.body.appendChild(root);
  }
  return root;
}

function getDismissedUpdateBannerVersion() {
  try {
    return String(window.localStorage.getItem(APP_UPDATE_BANNER_DISMISS_KEY) || "").trim();
  } catch (error) {
    return "";
  }
}

function saveDismissedUpdateBannerVersion(version = "") {
  try {
    if (!version) {
      window.localStorage.removeItem(APP_UPDATE_BANNER_DISMISS_KEY);
      return;
    }
    window.localStorage.setItem(APP_UPDATE_BANNER_DISMISS_KEY, version);
  } catch (error) {
    // Ignore update banner persistence failures.
  }
}

function clearAppUpdateBanner() {
  const root = document.getElementById("app-update-banner-root");
  if (root) {
    root.replaceChildren();
  }
  appUpdateBannerState.visibleVersion = "";
}

function showAppUpdateBanner(registration, version = APP_BOOT_BUILD_VERSION || "") {
  if (!registration || !navigator.serviceWorker?.controller) {
    return;
  }

  const safeVersion = String(version || APP_BOOT_BUILD_VERSION || "").trim();
  if (!safeVersion) {
    return;
  }

  if (getDismissedUpdateBannerVersion() === safeVersion) {
    return;
  }

  const root = ensureAppUpdateBannerRoot();
  root.replaceChildren();

  const banner = document.createElement("div");
  banner.className = "app-update-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `
    <div class="app-update-banner-copy">
      <p class="app-update-banner-eyebrow">App update ready</p>
      <strong>Toleo jipya la Winga lipo tayari.</strong>
      <p>Bonyeza Reload ili upate maboresho ya sasa bila kuvunja session yako.</p>
    </div>
    <div class="app-update-banner-actions">
      <button type="button" class="action-btn button-primary" data-app-update-reload="true">Reload now</button>
      <button type="button" class="action-btn button-secondary" data-app-update-later="true">Later</button>
    </div>
  `;
  root.appendChild(banner);
  appUpdateBannerState.visibleVersion = safeVersion;

  const triggerReload = () => {
    appUpdateBannerState.waitingToReload = true;
    saveDismissedUpdateBannerVersion("");
    try {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else if (registration.installing?.state === "installed") {
        registration.update().catch(() => {});
      } else {
        window.location.reload();
      }
    } catch (error) {
      window.location.reload();
    }
  };

  banner.querySelector("[data-app-update-reload]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    triggerReload();
  });

  banner.querySelector("[data-app-update-later]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveDismissedUpdateBannerVersion(safeVersion);
    clearAppUpdateBanner();
    showInAppNotification({
      type: "info",
      title: "Umeendelea na version ya sasa",
      body: "Unaweza ku-reload baadaye ili upate update mpya.",
      variant: "info",
      durationMs: 2800
    });
  });
}

function bindAppUpdateLifecycle(registration) {
  if (!registration) {
    return;
  }

  appUpdateBannerState.registration = registration;

  if (!appUpdateBannerState.controllerChangeBound && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!appUpdateBannerState.waitingToReload) {
        return;
      }
      appUpdateBannerState.waitingToReload = false;
      clearAppUpdateBanner();
      window.location.reload();
    });
    appUpdateBannerState.controllerChangeBound = true;
  }

  const maybeShowWaitingBanner = () => {
    if (!registration.waiting || !navigator.serviceWorker.controller) {
      return;
    }
    showAppUpdateBanner(registration);
  };

  if (registration.waiting) {
    maybeShowWaitingBanner();
  }

  registration.addEventListener("updatefound", () => {
    const installingWorker = registration.installing;
    if (!installingWorker) {
      return;
    }
    installingWorker.addEventListener("statechange", () => {
      if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
        maybeShowWaitingBanner();
      }
    });
  });
}

function getSavedProductsStorageKey() {
  return `winga-saved-products:${currentUser || "guest"}`;
}

function getFollowedSellersStorageKey() {
  return `winga-followed-sellers:${currentUser || "guest"}`;
}

function getSavedProductMetaStorageKey() {
  return `winga-saved-product-meta:${currentUser || "guest"}`;
}

function getSavedProductNotificationReadStorageKey() {
  return `winga-saved-product-note-read:${currentUser || "guest"}`;
}

function getAffinitySellerNotificationReadStorageKey() {
  return `winga-affinity-seller-note-read:${currentUser || "guest"}`;
}

function getFollowedSellerNotificationReadStorageKey() {
  return `winga-followed-seller-note-read:${currentUser || "guest"}`;
}

function getSavedProductMetaStateStore() {
  const existingState = globalThis.__wingaSavedProductMetaState;
  if (existingState && typeof existingState === "object") {
    return existingState;
  }
  const nextState = {
    storageKey: "",
    entries: {}
  };
  globalThis.__wingaSavedProductMetaState = nextState;
  return nextState;
}

function getSavedProductNotificationStateStore() {
  const existingState = globalThis.__wingaSavedProductNotificationState;
  if (existingState && typeof existingState === "object") {
    return existingState;
  }
  const nextState = {
    storageKey: "",
    readIds: new Set()
  };
  globalThis.__wingaSavedProductNotificationState = nextState;
  return nextState;
}

function getFollowedSellerNotificationStateStore() {
  const existingState = globalThis.__wingaFollowedSellerNotificationState;
  if (existingState && typeof existingState === "object") {
    return existingState;
  }
  const nextState = {
    storageKey: "",
    readIds: new Set()
  };
  globalThis.__wingaFollowedSellerNotificationState = nextState;
  return nextState;
}

function getAffinitySellerNotificationStateStore() {
  const existingState = globalThis.__wingaAffinitySellerNotificationState;
  if (existingState && typeof existingState === "object") {
    return existingState;
  }
  const nextState = {
    storageKey: "",
    readIds: new Set()
  };
  globalThis.__wingaAffinitySellerNotificationState = nextState;
  return nextState;
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

function ensureSavedProductMetaLoaded() {
  const state = getSavedProductMetaStateStore();
  const nextKey = getSavedProductMetaStorageKey();
  if (state.storageKey === nextKey) {
    return state.entries;
  }

  state.storageKey = nextKey;
  try {
    const rawValue = window.localStorage.getItem(nextKey);
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    state.entries = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(
          Object.entries(parsed).filter(([productId, savedAt]) => String(productId || "").trim() && String(savedAt || "").trim())
        )
      : {};
  } catch (error) {
    state.entries = {};
    captureClientError("saved_product_meta_restore_failed", error, {
      category: "storage",
      alertSeverity: "low"
    });
  }
  return state.entries;
}

function persistSavedProductMeta() {
  const state = getSavedProductMetaStateStore();
  state.storageKey = getSavedProductMetaStorageKey();
  window.localStorage.setItem(state.storageKey, JSON.stringify(state.entries));
}

function ensureSavedProductNotificationReadIdsLoaded() {
  const state = getSavedProductNotificationStateStore();
  const nextKey = getSavedProductNotificationReadStorageKey();
  if (state.storageKey === nextKey) {
    return state.readIds;
  }

  state.storageKey = nextKey;
  try {
    const rawValue = window.localStorage.getItem(nextKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    state.readIds = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    state.readIds = new Set();
    captureClientError("saved_product_notification_restore_failed", error, {
      category: "storage",
      alertSeverity: "low"
    });
  }
  return state.readIds;
}

function persistSavedProductNotificationReadIds() {
  const state = getSavedProductNotificationStateStore();
  state.storageKey = getSavedProductNotificationReadStorageKey();
  window.localStorage.setItem(
    state.storageKey,
    JSON.stringify(Array.from(state.readIds))
  );
}

function markSavedProductNotificationRead(notificationId) {
  const safeId = String(notificationId || "").trim();
  if (!safeId) {
    return;
  }
  const readIds = ensureSavedProductNotificationReadIdsLoaded();
  readIds.add(safeId);
  persistSavedProductNotificationReadIds();
}

function ensureAffinitySellerNotificationReadIdsLoaded() {
  const state = getAffinitySellerNotificationStateStore();
  const nextKey = getAffinitySellerNotificationReadStorageKey();
  if (state.storageKey === nextKey) {
    return state.readIds;
  }

  state.storageKey = nextKey;
  try {
    const rawValue = window.localStorage.getItem(nextKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    state.readIds = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    state.readIds = new Set();
    captureClientError("affinity_seller_notification_restore_failed", error, {
      category: "storage",
      alertSeverity: "low"
    });
  }
  return state.readIds;
}

function persistAffinitySellerNotificationReadIds() {
  const state = getAffinitySellerNotificationStateStore();
  state.storageKey = getAffinitySellerNotificationReadStorageKey();
  window.localStorage.setItem(
    state.storageKey,
    JSON.stringify(Array.from(state.readIds))
  );
}

function markAffinitySellerNotificationRead(notificationId) {
  const safeId = String(notificationId || "").trim();
  if (!safeId) {
    return;
  }
  const readIds = ensureAffinitySellerNotificationReadIdsLoaded();
  readIds.add(safeId);
  persistAffinitySellerNotificationReadIds();
}

function clearSavedProductNotificationReadIds(productId) {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    return;
  }
  const readIds = ensureSavedProductNotificationReadIdsLoaded();
  let changed = false;
  Array.from(readIds).forEach((notificationId) => {
    if (String(notificationId || "").startsWith(`saved-item:${safeProductId}:`)) {
      readIds.delete(notificationId);
      changed = true;
    }
  });
  if (changed) {
    persistSavedProductNotificationReadIds();
  }
}

function collectProductUploadDraftPayload() {
  if (!currentUser || editingProductId || !canUseSellerFeatures()) {
    return null;
  }
  const name = String(productNameInput?.value || "").trim();
  const price = String(productPriceInput?.value || "").trim();
  const shop = String(productShopInput?.value || "").trim();
  const whatsapp = String(productWhatsappInput?.value || "").trim();
  const topCategory = String(productCategoryTopInput?.value || "").trim();
  const category = String(productCategoryInput?.value || "").trim();
  const customCategory = String(uploadCustomCategoryInput?.value || "").trim();
  const fitMode = getSelectedProductFitMode();
  const preparedImages = Array.isArray(productUploadDraftRuntimeState.preparedImages)
    ? productUploadDraftRuntimeState.preparedImages.filter((value) => typeof value === "string" && value.startsWith("data:image/")).slice(0, MAX_UPLOAD_IMAGES)
    : [];
  const hasMeaningfulContent = Boolean(
    name
    || price
    || shop
    || whatsapp
    || topCategory
    || category
    || customCategory
    || preparedImages.length
  );
  if (!hasMeaningfulContent) {
    return null;
  }
  return {
    name,
    price,
    shop,
    whatsapp,
    topCategory,
    category,
    customCategory,
    fitMode,
    preparedImages,
    updatedAt: new Date().toISOString()
  };
}

function saveProductUploadDraft() {
  if (!currentUser || editingProductId) {
    return;
  }
  const storageKey = getProductUploadDraftStorageKey(currentUser);
  try {
    const payload = collectProductUploadDraftPayload();
    if (!payload) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    productUploadDraftRuntimeState.lastSavedAt = Date.now();
  } catch (error) {
    reportClientEvent("warn", "product_upload_draft_persist_failed", "Unable to persist product upload draft.", {
      category: "runtime",
      user: currentUser
    });
  }
}

function scheduleProductUploadDraftSave(delayMs = 220) {
  if (productUploadDraftRuntimeState.saveTimer) {
    window.clearTimeout(productUploadDraftRuntimeState.saveTimer);
  }
  productUploadDraftRuntimeState.saveTimer = window.setTimeout(() => {
    productUploadDraftRuntimeState.saveTimer = 0;
    saveProductUploadDraft();
  }, Math.max(0, Number(delayMs || 0) || 0));
}

function clearProductUploadDraft(options = {}) {
  const username = options.username || currentUser;
  if (productUploadDraftRuntimeState.saveTimer) {
    window.clearTimeout(productUploadDraftRuntimeState.saveTimer);
    productUploadDraftRuntimeState.saveTimer = 0;
  }
  productUploadDraftRuntimeState.preparedImages = [];
  productUploadDraftRuntimeState.lastSavedAt = 0;
  productUploadDraftRuntimeState.restoredKey = "";
  if (username) {
    try {
      window.localStorage.removeItem(getProductUploadDraftStorageKey(username));
    } catch (error) {
      // Ignore draft cleanup failures.
    }
  }
}

function loadProductUploadDraft(username = currentUser) {
  if (!username) {
    return null;
  }
  try {
    const rawValue = window.localStorage.getItem(getProductUploadDraftStorageKey(username));
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return {
      name: String(parsed.name || "").trim(),
      price: String(parsed.price || "").trim(),
      shop: String(parsed.shop || "").trim(),
      whatsapp: String(parsed.whatsapp || "").trim(),
      topCategory: String(parsed.topCategory || "").trim(),
      category: String(parsed.category || "").trim(),
      customCategory: String(parsed.customCategory || "").trim(),
      fitMode: normalizeProductFitMode(parsed.fitMode || "cover"),
      preparedImages: Array.isArray(parsed.preparedImages)
        ? parsed.preparedImages.filter((value) => typeof value === "string" && value.startsWith("data:image/")).slice(0, MAX_UPLOAD_IMAGES)
        : [],
      updatedAt: String(parsed.updatedAt || "").trim()
    };
  } catch (error) {
    return null;
  }
}

function restoreProductUploadDraft(options = {}) {
  if (!currentUser || editingProductId || currentView !== "upload") {
    return false;
  }
  const storageKey = getProductUploadDraftStorageKey(currentUser);
  if (!options.force && productUploadDraftRuntimeState.restoredKey === storageKey) {
    return false;
  }
  const draft = loadProductUploadDraft(currentUser);
  if (!draft) {
    productUploadDraftRuntimeState.restoredKey = storageKey;
    return false;
  }
  productNameInput.value = draft.name;
  productPriceInput.value = draft.price;
  productShopInput.value = draft.shop || currentUser;
  productWhatsappInput.value = draft.whatsapp || getCurrentWhatsappNumber();
  renderUploadCategoryOptions();
  productCategoryTopInput.value = draft.topCategory;
  renderUploadCategoryOptions();
  productCategoryInput.value = draft.category;
  if (supportsFlexibleSubcategory(productCategoryTopInput.value)) {
    uploadCustomCategoryWrap.style.display = "grid";
    uploadCustomCategoryInput.value = draft.customCategory || (draft.category ? getCategoryLabel(draft.category) : "");
  } else {
    uploadCustomCategoryWrap.style.display = "none";
    uploadCustomCategoryInput.value = "";
  }
  setSelectedProductFitMode(draft.fitMode || "cover");
  productImageFileInput.value = "";
  productUploadDraftRuntimeState.preparedImages = draft.preparedImages.slice();
  renderPreviewImages(productUploadDraftRuntimeState.preparedImages);
  productUploadDraftRuntimeState.restoredKey = storageKey;
  setUploadFormStatus("success", "Draft imerudi. Endelea ulipoishia kisha bonyeza post ukiwa tayari.");
  showInAppNotification({
    title: "Draft restored",
    body: "Tumerudisha bidhaa uliyoanza kuandaa ili uendelee ulipoishia.",
    variant: "success"
  });
  return true;
}

function ensureUploadFormStatusElement() {
  if (!uploadForm) {
    return null;
  }
  let statusNode = document.getElementById("upload-form-status");
  if (statusNode) {
    return statusNode;
  }
  statusNode = createElement("p", {
    className: "upload-form-status",
    attributes: {
      id: "upload-form-status",
      hidden: "hidden",
      "aria-live": "polite"
    }
  });
  if (uploadButton?.parentElement) {
    uploadButton.parentElement.insertAdjacentElement("beforebegin", statusNode);
  } else {
    uploadForm.appendChild(statusNode);
  }
  return statusNode;
}

function setUploadFormStatus(tone = "", message = "") {
  const statusNode = ensureUploadFormStatusElement();
  if (!statusNode) {
    return;
  }
  const safeTone = ["info", "warning", "success", "error"].includes(String(tone || "").trim())
    ? String(tone || "").trim()
    : "";
  const safeMessage = String(message || "").trim();
  if (!safeMessage) {
    statusNode.hidden = true;
    statusNode.textContent = "";
    statusNode.className = "upload-form-status";
    return;
  }
  statusNode.hidden = false;
  statusNode.textContent = safeMessage;
  statusNode.className = `upload-form-status${safeTone ? ` is-${safeTone}` : ""}`;
}

function noteSavedProductIntent(productId, savedAt = new Date().toISOString()) {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    return;
  }
  const meta = ensureSavedProductMetaLoaded();
  meta[safeProductId] = String(savedAt || new Date().toISOString()).trim() || new Date().toISOString();
  persistSavedProductMeta();
}

function clearSavedProductIntent(productId) {
  const safeProductId = String(productId || "").trim();
  if (!safeProductId) {
    return;
  }
  const meta = ensureSavedProductMetaLoaded();
  if (Object.prototype.hasOwnProperty.call(meta, safeProductId)) {
    delete meta[safeProductId];
    persistSavedProductMeta();
  }
  clearSavedProductNotificationReadIds(safeProductId);
}

function ensureFollowedSellerIdsLoaded() {
  const nextKey = getFollowedSellersStorageKey();
  if (followedSellerState.storageKey === nextKey) {
    return followedSellerState.ids;
  }

  followedSellerState.storageKey = nextKey;
  try {
    const rawValue = window.localStorage.getItem(nextKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    followedSellerState.ids = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    followedSellerState.ids = new Set();
    captureClientError("followed_sellers_restore_failed", error, {
      category: "storage",
      alertSeverity: "low"
    });
  }
  return followedSellerState.ids;
}

function persistFollowedSellerIds() {
  followedSellerState.storageKey = getFollowedSellersStorageKey();
  window.localStorage.setItem(followedSellerState.storageKey, JSON.stringify(Array.from(followedSellerState.ids)));
}

function ensureFollowedSellerNotificationReadIdsLoaded() {
  const state = getFollowedSellerNotificationStateStore();
  const nextKey = getFollowedSellerNotificationReadStorageKey();
  if (state.storageKey === nextKey) {
    return state.readIds;
  }

  state.storageKey = nextKey;
  try {
    const rawValue = window.localStorage.getItem(nextKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    state.readIds = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (error) {
    state.readIds = new Set();
    captureClientError("followed_seller_notification_restore_failed", error, {
      category: "storage",
      alertSeverity: "low"
    });
  }
  return state.readIds;
}

function persistFollowedSellerNotificationReadIds() {
  const state = getFollowedSellerNotificationStateStore();
  state.storageKey = getFollowedSellerNotificationReadStorageKey();
  window.localStorage.setItem(
    state.storageKey,
    JSON.stringify(Array.from(state.readIds))
  );
}

function markFollowedSellerNotificationRead(notificationId) {
  const safeId = String(notificationId || "").trim();
  if (!safeId) {
    return;
  }
  const readIds = ensureFollowedSellerNotificationReadIdsLoaded();
  readIds.add(safeId);
  persistFollowedSellerNotificationReadIds();
}

function isSellerFollowed(username) {
  return ensureFollowedSellerIdsLoaded().has(String(username || ""));
}

function toggleFollowSeller(username) {
  const safeUsername = String(username || "").trim();
  if (!safeUsername || safeUsername === currentUser) {
    return false;
  }
  const followedIds = ensureFollowedSellerIdsLoaded();
  if (followedIds.has(safeUsername)) {
    followedIds.delete(safeUsername);
    persistFollowedSellerIds();
    return false;
  }
  followedIds.add(safeUsername);
  persistFollowedSellerIds();
  return true;
}

function getFollowedSellerActivityNotifications() {
  if (!currentUser || !canUseBuyerFeatures()) {
    return [];
  }
  const followedSellerIds = Array.from(ensureFollowedSellerIdsLoaded()).filter(Boolean);
  if (!followedSellerIds.length) {
    return [];
  }
  const readIds = ensureFollowedSellerNotificationReadIdsLoaded();
  return products
    .filter((product) =>
      product?.status === "approved"
      && followedSellerIds.includes(product.uploadedBy)
      && product.uploadedBy !== currentUser
    )
    .sort((first, second) => new Date(second.createdAt || second.timestamp || 0).getTime() - new Date(first.createdAt || first.timestamp || 0).getTime())
    .slice(0, 8)
    .map((product) => {
      const sellerName = getUserDisplayName(product.uploadedBy, {
        fallback: product.shop || product.uploadedBy || "Seller"
      });
      const notificationId = `followed-seller:${product.id}`;
      return {
        id: notificationId,
        userId: currentUser,
        type: "message",
        variant: "info",
        title: `${sellerName} ameweka bidhaa mpya`,
        body: `${product.name} sasa iko live. Fungua uione kabla haijaondoka.`,
        createdAt: product.createdAt || product.timestamp || new Date().toISOString(),
        isRead: readIds.has(notificationId),
        productId: product.id,
        sellerUsername: product.uploadedBy
      };
    });
}

function getSavedIntentNotifications() {
  if (!currentUser || !canUseBuyerFeatures()) {
    return [];
  }
  const savedProductIds = Array.from(ensureSavedProductIdsLoaded()).filter(Boolean);
  if (!savedProductIds.length) {
    return [];
  }
  const savedMeta = ensureSavedProductMetaLoaded();
  const readIds = ensureSavedProductNotificationReadIdsLoaded();
  const now = Date.now();
  const reminderDelayMs = 6 * 60 * 60 * 1000;

  return savedProductIds
    .map((productId) => getProductById(productId))
    .filter((product) => product && product.uploadedBy !== currentUser)
    .map((product) => {
      const availability = product.availability === "sold_out"
        ? "sold_out"
        : product.availability === "reserved"
          ? "reserved"
          : "available";
      const savedAt = String(savedMeta[product.id] || "").trim();
      const savedAtMs = savedAt ? new Date(savedAt).getTime() : 0;
      if (availability === "available" && (!savedAtMs || (now - savedAtMs) < reminderDelayMs)) {
        return null;
      }

      const title = availability === "reserved"
        ? "Bidhaa uliyohifadhi imewekwa reserve"
        : availability === "sold_out"
          ? "Bidhaa uliyohifadhi imeuzwa"
          : "Uliyohifadhi bado ipo";
      const body = availability === "reserved"
        ? `${product.name} imewekewa reserve. Ukiihitaji, fungua haraka uangalie hali yake.`
        : availability === "sold_out"
          ? `${product.name} imeondoka. Angalia bidhaa nyingine kutoka kwa seller huyu.`
          : `${product.name} bado inapatikana. Rudi uiangalie au umalizie mazungumzo na seller.`;
      const notificationId = `saved-item:${product.id}:${availability === "available" ? "return" : availability}`;
      const createdAt = availability === "available"
        ? savedAt || product.updatedAt || product.createdAt || new Date().toISOString()
        : product.updatedAt || product.createdAt || savedAt || new Date().toISOString();

      return {
        id: notificationId,
        userId: currentUser,
        type: "message",
        variant: availability === "sold_out" ? "neutral" : "info",
        title,
        body,
        createdAt,
        isRead: readIds.has(notificationId),
        productId: product.id,
        sellerUsername: product.uploadedBy
      };
    })
    .filter(Boolean)
    .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime())
    .slice(0, 8);
}

function getAffinitySellerActivityNotifications() {
  if (!currentUser || !canUseBuyerFeatures()) {
    return [];
  }
  const followedSellerIds = new Set(Array.from(ensureFollowedSellerIdsLoaded()).filter(Boolean));
  const affinityEntries = getBuyerSellerAffinityEntries()
    .filter((entry) =>
      entry?.sellerId
      && entry.sellerId !== currentUser
      && !followedSellerIds.has(entry.sellerId)
      && Number(entry.score || 0) >= 18
    )
    .sort((first, second) => Number(second.score || 0) - Number(first.score || 0))
    .slice(0, 6);
  if (!affinityEntries.length) {
    return [];
  }

  const readIds = ensureAffinitySellerNotificationReadIdsLoaded();
  const now = Date.now();
  const recentWindowMs = 14 * 24 * 60 * 60 * 1000;

  return affinityEntries
    .flatMap((entry) => {
      const sellerProducts = products
        .filter((product) =>
          product?.status === "approved"
          && product?.uploadedBy === entry.sellerId
          && product.uploadedBy !== currentUser
          && product.availability !== "sold_out"
          && hasRenderableMarketplaceImage(product)
          && shouldRenderMarketplaceProduct(product)
        )
        .sort((first, second) => new Date(second.createdAt || second.updatedAt || second.timestamp || 0).getTime() - new Date(first.createdAt || first.updatedAt || first.timestamp || 0).getTime());
      const latestProduct = sellerProducts[0];
      if (!latestProduct) {
        return [];
      }

      const latestProductTime = new Date(latestProduct.createdAt || latestProduct.updatedAt || latestProduct.timestamp || 0).getTime();
      if (!Number.isFinite(latestProductTime) || (now - latestProductTime) > recentWindowMs) {
        return [];
      }

      const sellerName = getUserDisplayName(entry.sellerId, {
        fallback: latestProduct.shop || entry.sellerId || "Seller"
      });
      const primaryReason = entry.interactions?.message > 0 || entry.lastSignal === "message"
        ? "Umeshawasiliana na seller huyu"
        : entry.lastSignal === "card_open" || entry.interactions?.card_open > 0
          ? "Ulishafungua bidhaa za seller huyu"
          : "Ulishaonyesha interest kwa seller huyu";
      const notificationId = `affinity-seller:${latestProduct.id}`;

      return [{
        id: notificationId,
        userId: currentUser,
        type: "message",
        variant: "info",
        title: `${sellerName} ameweka bidhaa mpya`,
        body: `${primaryReason}. ${latestProduct.name} sasa ipo live.`,
        createdAt: latestProduct.createdAt || latestProduct.updatedAt || new Date().toISOString(),
        isRead: readIds.has(notificationId),
        productId: latestProduct.id,
        sellerUsername: latestProduct.uploadedBy
      }];
    })
    .slice(0, 6);
}

function getRenderableNotifications() {
  const serverNotifications = Array.isArray(currentNotifications) ? currentNotifications : [];
  const localFollowNotifications = getFollowedSellerActivityNotifications();
  const savedIntentNotifications = getSavedIntentNotifications();
  const affinitySellerNotifications = getAffinitySellerActivityNotifications();
  const seenIds = new Set();
  return [...serverNotifications, ...localFollowNotifications, ...savedIntentNotifications, ...affinitySellerNotifications]
    .filter((notification) => {
      const notificationId = String(notification?.id || "").trim();
      if (!notificationId || seenIds.has(notificationId)) {
        return false;
      }
      seenIds.add(notificationId);
      return true;
    })
    .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
}

async function handleNotificationOpen(notificationId) {
  const safeId = String(notificationId || "").trim();
  if (!safeId) {
    return false;
  }
  let productId = "";
  if (safeId.startsWith("followed-seller:")) {
    productId = safeId.slice("followed-seller:".length);
    markFollowedSellerNotificationRead(safeId);
  } else if (safeId.startsWith("saved-item:")) {
    const [, savedProductId = ""] = safeId.split(":");
    productId = savedProductId;
    markSavedProductNotificationRead(safeId);
  } else if (safeId.startsWith("affinity-seller:")) {
    productId = safeId.slice("affinity-seller:".length);
    markAffinitySellerNotificationRead(safeId);
  } else {
    return false;
  }

  const product = getProductById(productId);
  if (product) {
    openProductDetailModal(product.id);
  }
  updateProfileNavBadge();
  return true;
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
    clearSavedProductIntent(safeProductId);
    productVariationSignalState[safeProductId] = {
      ...(productVariationSignalState[safeProductId] || {}),
      liked: false,
      updatedAt: Date.now()
    };
    return false;
  }

  savedIds.add(safeProductId);
  persistSavedProductIds();
  noteSavedProductIntent(safeProductId);
  productVariationSignalState[safeProductId] = {
    ...(productVariationSignalState[safeProductId] || {}),
    liked: true,
    updatedAt: Date.now()
  };
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

  if ("Notification" in window && document.visibilityState === "hidden" && Notification.permission === "granted") {
    new Notification(notification.title, { body: notification.body || "" });
  }
}

function confirmAction(message) {
  if (typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return true;
}

function setNodeText(node, value) {
  if (!node) {
    return;
  }
  node.textContent = value ?? "";
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
  hideBootOverlayImmediately();

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

function hideBootOverlayImmediately() {
  if (!bootOverlay) {
    return;
  }
  if (feedRuntimeState?.bootOverlayHardSafetyTimer) {
    window.clearTimeout(feedRuntimeState.bootOverlayHardSafetyTimer);
    feedRuntimeState.bootOverlayHardSafetyTimer = 0;
  }
  if (feedRuntimeState) {
    feedRuntimeState.splashFeedImageGateInFlight = false;
  }
  bootOverlay.classList.add("is-hidden");
  bootOverlay.setAttribute("aria-hidden", "true");
  bootOverlay.style.opacity = "0";
  bootOverlay.style.visibility = "hidden";
  bootOverlay.style.pointerEvents = "none";
  bootOverlay.style.display = "none";
  if (document.body.classList.contains("app-booting")) {
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-ready");
  }
}

function hasVisibleStartupFeedMedia(options = {}) {
  const minCount = Math.max(1, Number(options.minCount || 1));
  const images = Array.from(
    productsContainer?.querySelectorAll?.(".product-card img[data-marketplace-scroll-image='true'], .seller-product-card img[data-marketplace-scroll-image='true']") || []
  );
  if (!images.length) {
    return false;
  }
  let visibleCount = 0;
  for (const image of images) {
    if (!(image instanceof HTMLImageElement)) {
      continue;
    }
    const shell = image.closest(".progressive-image-shell");
    const src = image.currentSrc || image.getAttribute("src") || "";
    const isLoaded = shell?.classList.contains("is-loaded")
      || (Number(image.naturalWidth || 0) > 0 && Number(image.naturalHeight || 0) > 0)
      || (image.complete && Boolean(src) && !src.startsWith("data:image/gif"));
    if (!isLoaded) {
      continue;
    }
    visibleCount += 1;
    if (visibleCount >= minCount) {
      return true;
    }
  }
  return false;
}

function collectStartupSplashFeedImages(limit = SPLASH_FEED_IMAGE_READY_COUNT) {
  const safeLimit = Math.max(1, Number(limit || SPLASH_FEED_IMAGE_READY_COUNT));
  const images = [];
  const seen = new Set();
  const cards = Array.from(
    productsContainer?.querySelectorAll?.(".product-card[data-open-product], .seller-product-card[data-open-product]") || []
  );
  for (const card of cards) {
    if (!(card instanceof Element)) {
      continue;
    }
    const image = card.querySelector("img[data-marketplace-scroll-image='true']");
    if (!(image instanceof HTMLImageElement)) {
      continue;
    }
    const src = image.dataset.marketplaceRealSrc
      || image.dataset.progressiveRealSrc
      || image.dataset.imageActionSrc
      || image.currentSrc
      || image.getAttribute("src")
      || "";
    const key = sanitizeImageSource(src, "");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    images.push(image);
    if (images.length >= safeLimit) {
      break;
    }
  }
  return images;
}

function isFeedImageReadyForSplash(image) {
  if (!(image instanceof HTMLImageElement)) {
    return false;
  }
  const shell = image.closest(".progressive-image-shell");
  const src = image.currentSrc || image.getAttribute("src") || "";
  return Boolean(
    shell?.classList.contains("is-loaded")
    || (Number(image.naturalWidth || 0) > 0 && Number(image.naturalHeight || 0) > 0)
    || (image.complete && Boolean(src) && !src.startsWith("data:image/gif"))
  );
}

function forceStartupSplashImageRequest(image) {
  if (!(image instanceof HTMLImageElement)) {
    return null;
  }
  const realSrc = image.dataset.marketplaceRealSrc
    || image.dataset.progressiveRealSrc
    || image.dataset.imageActionSrc
    || image.dataset.zoomSrc
    || image.currentSrc
    || image.getAttribute("src")
    || "";
  const safeSrc = sanitizeImageSource(realSrc, "");
  if (!safeSrc) {
    return null;
  }
  image.setAttribute("loading", "eager");
  image.setAttribute("fetchpriority", "high");
  preloadImageSource(safeSrc, {
    fetchPriority: "high",
    decodeInMemory: false,
    reason: "splash_feed_image_gate"
  });
  if (typeof activateMarketplaceScrollImage === "function") {
    activateMarketplaceScrollImage(image, {
      priority: true,
      shouldSetPending: true
    });
  } else if (!image.currentSrc && image.getAttribute("src") !== safeSrc) {
    image.setAttribute("src", safeSrc);
  }
  return safeSrc;
}

function collectStartupSplashFeedImageUrls(limit = SPLASH_FEED_IMAGE_READY_COUNT) {
  return collectStartupSplashFeedImages(limit)
    .map((image) => forceStartupSplashImageRequest(image))
    .filter(Boolean)
    .slice(0, Math.max(1, Number(limit || SPLASH_FEED_IMAGE_READY_COUNT)));
}

function waitForStartupSplashFeedImages(options = {}) {
  const requiredCount = Math.max(1, Number(options.requiredCount || SPLASH_FEED_IMAGE_READY_COUNT));
  const timeoutMs = Math.max(500, Math.min(
    SPLASH_FEED_IMAGE_READY_TIMEOUT_MS,
    Number(options.timeoutMs || SPLASH_FEED_IMAGE_READY_TIMEOUT_MS)
  ));
  const imageUrls = collectStartupSplashFeedImageUrls(requiredCount);
  if (!imageUrls.length) {
    hideBootOverlayImmediately();
    reportClientEvent("info", "splash_feed_images_ready", "Splash feed image gate skipped because no startup images were required.", {
      category: "image",
      imageCount: 0,
      requiredCount: 0,
      timeoutMs
    });
    return Promise.resolve(true);
  }

  resumeMarketplaceImagePipeline("splash_feed_image_gate");

  const preloadPromise = Promise.allSettled(imageUrls.map((url) => new Promise((resolve) => {
    if (!url || url.includes("undefined")) {
      resolve({
        url,
        ok: false,
        skipped: true
      });
      return;
    }
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        url,
        ok
      });
    };
    image.crossOrigin = "anonymous";
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.onabort = () => finish(false);
    window.setTimeout(() => finish(false), 2000);
    image.src = url;
  })));

  const hardTimeout = new Promise((resolve) => {
    window.setTimeout(() => resolve("timeout"), timeoutMs);
  });

  return Promise.race([
    preloadPromise.then((results) => {
      const fulfilled = results
        .filter((entry) => entry.status === "fulfilled")
        .map((entry) => entry.value);
      const readyCount = fulfilled.filter((entry) => entry?.ok).length;
      reportClientEvent("info", "splash_feed_images_ready", "Startup feed images resolved before splash finished.", {
        category: "image",
        readyCount,
        requiredCount: Math.min(requiredCount, imageUrls.length),
        imageCount: imageUrls.length,
        timeoutMs
      });
      return true;
    }),
    hardTimeout
  ]).finally(() => {
    hideBootOverlayImmediately();
  });
}

function getRequiredStartupFeedMediaCount() {
  const visibleCards = Array.from(
    productsContainer?.querySelectorAll?.(".product-card[data-open-product], .seller-product-card[data-open-product]") || []
  ).filter((card) => {
    if (!(card instanceof Element)) {
      return false;
    }
    const rect = card.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    return rect.bottom > 0 && rect.top < viewportHeight;
  });
  if (!visibleCards.length) {
    return 1;
  }
  const availableStartupImages = collectStartupSplashFeedImages(SPLASH_FEED_IMAGE_READY_COUNT).length;
  return Math.max(1, Math.min(SPLASH_FEED_IMAGE_READY_COUNT, availableStartupImages || visibleCards.length));
}

function revealBootOverlay() {
  if (!bootOverlay) {
    return;
  }
  bootOverlay.style.display = "flex";
  bootOverlay.classList.remove("is-hidden");
  bootOverlay.setAttribute("aria-hidden", "false");
}

function forceHideBootOverlaySafety(reason = "hard_safety") {
  const overlay = document.getElementById("boot-overlay");
  if (!overlay) {
    return;
  }
  overlay.classList.add("is-hidden");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.opacity = "0";
  overlay.style.visibility = "hidden";
  overlay.style.pointerEvents = "none";
  overlay.style.display = "none";
  if (document.body.classList.contains("app-booting")) {
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-ready");
  }
  if (feedRuntimeState) {
    feedRuntimeState.splashFeedImageGateInFlight = false;
  }
  reportClientEvent("warn", "boot_overlay_force_hidden", "Boot overlay was force-hidden by the startup safety net.", {
    category: "runtime",
    reason
  });
}

function scheduleBootOverlayHardSafety(reason = "boot_start") {
  if (feedRuntimeState.bootOverlayHardSafetyTimer) {
    window.clearTimeout(feedRuntimeState.bootOverlayHardSafetyTimer);
  }
  feedRuntimeState.bootOverlayHardSafetyTimer = window.setTimeout(() => {
    feedRuntimeState.bootOverlayHardSafetyTimer = 0;
    const overlay = document.getElementById("boot-overlay");
    const overlayStillVisible = Boolean(
      overlay
      && !overlay.classList.contains("is-hidden")
      && overlay.style.display !== "none"
    );
    if (overlayStillVisible || document.body.classList.contains("app-booting")) {
      forceHideBootOverlaySafety(reason);
    }
  }, BOOT_OVERLAY_HARD_SAFETY_TIMEOUT_MS);
}

function completeBootOverlay() {
  if (!bootOverlay) {
    return;
  }
  if (feedRuntimeState.splashFeedImageGateInFlight) {
    return;
  }
  const hasVisibleStartupCards = currentView === "home"
    && Boolean(productsContainer?.querySelector(".product-card[data-open-product], .seller-product-card[data-open-product]"));
  const requiresMediaReady = currentView === "home"
    && !hasVisibleStartupCards
    && Boolean(productsContainer?.querySelector(".product-card[data-open-product], .seller-product-card[data-open-product]"));
  const missingStartupSurface = currentView === "home"
    && !hasVisibleStartupSurface({ includeFeedLoading: false })
    && productHydrationStatus !== "failed";
  if (missingStartupSurface) {
    return;
  }
  if (hasVisibleStartupCards) {
    hideBootOverlayImmediately();
    resumeMarketplaceImagePipeline("boot_overlay_completed");
    activateViewportReadyFeedImages(productsContainer || document, {
      limit: Math.max(4, getRequiredStartupFeedMediaCount())
    });
    scheduleStartupImageWork(products, {
      reason: "boot_overlay_completed",
      productLimit: 10,
      decodeLimit: 4,
      delayMs: 0
    });
    window.setTimeout(() => {
      ensureVisibleStartupContent("boot_overlay_completed");
    }, 360);
    return;
  }
  if (
    requiresMediaReady
    && !hasVisibleStartupFeedMedia({ minCount: getRequiredStartupFeedMediaCount() })
  ) {
    feedRuntimeState.splashFeedImageGateInFlight = true;
    waitForStartupSplashFeedImages({
      requiredCount: SPLASH_FEED_IMAGE_READY_COUNT,
      timeoutMs: SPLASH_FEED_IMAGE_READY_TIMEOUT_MS
    }).finally(() => {
      feedRuntimeState.splashFeedImageGateInFlight = false;
      completeBootOverlay();
    });
    return;
  }
  hideBootOverlayImmediately();
  if (currentView === "home") {
    resumeMarketplaceImagePipeline("boot_overlay_completed");
    scheduleStartupImageWork(products, {
      reason: "boot_overlay_completed",
      productLimit: 10,
      decodeLimit: 4,
      delayMs: 0
    });
  }
  window.setTimeout(() => {
    ensureVisibleStartupContent("boot_overlay_completed");
  }, 360);
  window.setTimeout(() => {
    if (bootOverlay && bootOverlay.classList.contains("is-hidden")) {
      bootOverlay.style.display = "none";
    }
  }, 340);
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
  if (topBarSubtitle) {
    setNodeText(topBarSubtitle, message || "Tunaangalia session yako nyuma ya pazia.");
    topBarSubtitle.style.display = "";
  }
}

function clearSessionRestoringState() {
  isSessionRestorePending = false;
  refreshPublicEntryChrome();
}

function shouldDeferBootRenderForPendingStaffSession() {
  return Boolean(
    isSessionRestorePending
    && currentSession?.username
    && isStaffRole(currentSession.role || "")
    && !isAdminLoginRoute()
  );
}

function cancelPendingSessionRestore(reason = "auth_interaction") {
  activeSessionRestoreToken += 1;
  try {
    window.WingaDataLayer?.cancelSessionRestore?.(reason);
  } catch (error) {
    captureClientError("session_restore_cancel_call_failed", error, {
      category: "auth",
      alertSeverity: "low",
      reason
    });
  }
  reportClientEvent("info", "session_restore_cancelled", "Cancelled stale session restore flow.", {
    category: "auth",
    reason
  });
}

function showInstantBootFeedSnapshot(reason = "boot_snapshot") {
  if (suppressInitialProductHomeRender || isAdminLoginRoute() || shouldDeferBootRenderForPendingStaffSession()) {
    return false;
  }

  ensureProductsForImmediateRender();
  mergeAvailableCategories(inferCategoriesFromData());
  refreshCategoryUI();
  setCurrentViewState("home", getEphemeralLifecycleViewOptions());
  appContainer.style.display = "block";
  syncBodyScrollLockState();
  refreshPublicEntryChrome();
  const hasVisibleFeedShell = Boolean(
    productsContainer?.querySelector(".product-card, .seller-product-card")
    || productsContainer?.querySelector("[data-feed-skeleton-card='true']")
    || emptyState?.style.display === "block"
  );

  if (hasVisibleFeedShell) {
    const retainedSurfaceResumed = resumeRetainedHomeFeedSurface(`${reason}_snapshot_resume`, {
      productLimit: 8,
      decodeLimit: 3,
      delayMs: 0,
      prefetch: false
    });
    completeBootOverlay();
    hideLifecycleFallbackShell();
    const bootPrimeLimit = Math.min(products.length, 10);
    const primeTask = () => primeIncomingFeedItems(products.slice(0, Math.min(products.length, 10)), {
      reason: `${reason}_snapshot_prime`,
      productLimit: bootPrimeLimit,
      decodeLimit: Math.min(products.length, 5)
    });
    if (retainedSurfaceResumed) {
      window.requestAnimationFrame(primeTask);
    } else {
      primeTask();
    }
    reportClientEvent("info", "instant_boot_snapshot_rendered", "Boot snapshot rendered before full hydration.", {
      category: "runtime",
      authState: currentUser ? "signed_in" : "guest",
      productsCount: Array.isArray(products) ? products.length : 0,
      mediaReady: Boolean(retainedSurfaceResumed || hasVisibleStartupFeedMedia({ minCount: getRequiredStartupFeedMediaCount() }))
    });
    return true;
  }

  try {
    renderCurrentView({ reason, force: true });
  } catch (error) {
    captureClientError("instant_boot_snapshot_render_failed", error, {
      category: "runtime",
      alertSeverity: "medium"
    });
    return false;
  }

  const initialPrimeLimit = Math.min(products.length, 4);
  scheduleIdleBackgroundWork(() => primeIncomingFeedItems(products.slice(0, initialPrimeLimit), {
    reason: `${reason}_snapshot_prime`,
    productLimit: initialPrimeLimit,
    decodeLimit: Math.min(products.length, 2)
  }), 120);

  return hasVisibleFeedShell;
}

function startBackgroundSessionRestore(restorePromise, cachedSession = null, options = {}) {
  const restoreToken = ++activeSessionRestoreToken;
  const lifecycleEpoch = Number(options.lifecycleEpoch || 0);
  const expectedToken = String(cachedSession?.token || "").trim();
  if (!cachedSession?.username) {
    return;
  }
  reportBootPhase("session_restore_started", {
    role: cachedSession.role || "",
    hasToken: Boolean(expectedToken)
  });

  const shouldIgnoreRestoreOutcome = () => {
    if (!expectedToken || !window.WingaDataLayer?.bootstrapSession) {
      return false;
    }
    const activeBootstrapSession = window.WingaDataLayer.bootstrapSession();
    const activeToken = String(activeBootstrapSession?.token || "").trim();
    return Boolean(activeToken && activeToken !== expectedToken);
  };

  const timeoutId = window.setTimeout(() => {
    if (restoreToken !== activeSessionRestoreToken || (lifecycleEpoch && !isLifecycleEpochCurrent(lifecycleEpoch))) {
      return;
    }
    reportClientEvent("warn", "session_restore_timed_out", "Session restore timed out during boot.", {
      category: "auth",
      alertSeverity: "medium"
    });
  }, SESSION_RESTORE_BOOT_TIMEOUT_MS);

  Promise.resolve(restorePromise)
    .then((session) => {
      if (restoreToken !== activeSessionRestoreToken || (lifecycleEpoch && !isLifecycleEpochCurrent(lifecycleEpoch))) {
        return;
      }
      if (shouldIgnoreRestoreOutcome()) {
        return;
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (session?.username) {
        if (isAdminLoginRoute() && !isStaffRole(session.role)) {
          setAdminLoginRouteActive(false, { replace: true });
          showInAppNotification({
            title: "Admin access only",
            body: "Route hii ni ya admin au moderator pekee.",
            variant: "warning"
          });
        }
        const nextSession = cachedSession?.username
          ? {
            ...cachedSession,
            ...session
          }
          : session;
        applySessionState(nextSession);
        saveSessionUser(currentSession);
        loginSuccess(
          currentSession.username,
          currentSession.primaryCategory || "",
          currentSession,
          {
            restoreView: true,
            skipWelcome: true,
            deferRender: true,
            forceView: isStaffRole(currentSession.role) ? "admin" : ""
          }
        );
        reportClientEvent("info", "session_restore_succeeded", "Stored session restored during boot.", {
          category: "auth",
          role: currentSession.role || ""
        });
        reportBootPhase("session_restore_finished", {
          outcome: "restored",
          role: currentSession.role || ""
        });
        return;
      }

      clearSessionUser();
      applySessionState(null);
      if (cachedSession?.username && isStaffRole(cachedSession.role || "") && !isAdminLoginRoute()) {
        showLoggedOutState({
          audience: "admin",
          message: "Session ya staff imeisha. Ingia tena kuendelea."
        });
      }
      reportClientEvent("warn", "session_restore_failed", "Stored session could not be restored during boot.", {
        category: "auth",
        alertSeverity: "high",
        role: cachedSession?.role || ""
      });
      reportBootPhase("session_restore_finished", {
        outcome: "missing",
        role: cachedSession?.role || ""
      });
    })
    .catch((error) => {
      if (restoreToken !== activeSessionRestoreToken || (lifecycleEpoch && !isLifecycleEpochCurrent(lifecycleEpoch))) {
        return;
      }
      if (shouldIgnoreRestoreOutcome()) {
        return;
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      clearSessionUser();
      applySessionState(null);
      if (cachedSession?.username && isStaffRole(cachedSession.role || "") && !isAdminLoginRoute()) {
        showLoggedOutState({
          audience: "admin",
          message: "Session ya staff imeisha. Ingia tena kuendelea."
        });
      }
      captureClientError("session_restore_boot_failed", error, {
        category: "auth",
        alertSeverity: "high",
        hasCachedSession: Boolean(cachedSession?.username)
      });
      reportBootPhase("session_restore_finished", {
        outcome: "failed",
        role: cachedSession?.role || ""
      });
    });
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
      setNodeText(adminLoginButton, isPending ? "Ingia..." : "Admin Login");
    }
    if (adminLoginCopy && isPending) {
      setNodeText(adminLoginCopy, "Tunaangalia staff access yako...");
    }
    return;
  }
  if (isPending) {
    schedulePublicAuthSlowFallback(kind);
  } else {
    clearPublicAuthSlowFallback();
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
    setNodeText(authButton, isPending
      ? (buttonText || (isPasswordRecovery ? "Inabadilisha password..." : (isLogin ? "Inaingia..." : "Inatengeneza akaunti...")))
      : (isPasswordRecovery ? "Badilisha Password" : (isLogin ? "Ingia" : "Tengeneza Akaunti")));
  }
  if (authCategoryNote && !isLogin && !isPasswordRecovery && isPending) {
    setNodeText(authCategoryNote, noteText || (
      selectedAuthRole === "seller"
        ? "Tunatayarisha akaunti yako ya seller. Verification ya ID itafanyika baadaye kwenye Profile > Get Verified."
        : "Tunatengeneza akaunti yako. Tafadhali subiri kidogo."
    ));
  }
  if (!isPending) {
    syncAuthMode();
  }
}

function releasePublicAuthPendingState() {
  publicAuthRequestPending = false;
  setAuthInteractionPending("public", false);
}

function completePublicAuthSuccessTransition() {
  publicAuthRequestPending = false;
  publicAuthTransitionPending = false;
  setAuthInteractionPending("public", false);
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  appContainer.style.display = "block";
  syncBodyScrollLockState();
}

function switchToLoginMode(prefillIdentifier = "") {
  isLogin = true;
  isPasswordRecovery = false;
  authSignupStep = 1;
  setNodeText(formTitle, "Login");
  setNodeText(authButton, "Login");
  setNodeText(toggleLink, "Tengeneza akaunti");
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
  );
  if (!hasUnread) {
    return;
  }

  await window.WingaDataLayer.markConversationRead({
    withUser: chatUiState.activeContext.withUser
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
      maybePromptNotificationPermission("reply");
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
        if (["message", "order"].includes(String(notification.type || "").toLowerCase())) {
          maybePromptNotificationPermission(notification.type === "order" ? "order" : "reply");
        }
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
  );
}

function getAllConversationOrders() {
  const purchases = Array.isArray(currentOrders?.purchases) ? currentOrders.purchases : [];
  const sales = Array.isArray(currentOrders?.sales) ? currentOrders.sales : [];
  return [...purchases, ...sales];
}

function getConversationCommerceSnapshot(context = null) {
  const withUser = context?.withUser || chatUiState.activeContext?.withUser || "";
  if (!withUser) {
    return {
      stage: "conversation",
      label: "Conversation",
      tone: "",
      productId: context?.productId || chatUiState.activeContext?.productId || "",
      productName: context?.productName || chatUiState.activeContext?.productName || ""
    };
  }

  const relevantMessages = (Array.isArray(currentMessages) ? currentMessages : [])
    .filter((message) => getMessagePartner(message) === withUser)
    .sort((first, second) => new Date(second.timestamp || 0).getTime() - new Date(first.timestamp || 0).getTime());
  const relevantOrders = getAllConversationOrders()
    .filter((order) =>
      order?.sellerUsername === withUser
      || order?.buyerUsername === withUser
    )
    .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());

  const anchorProductId = context?.productId
    || relevantOrders[0]?.productId
    || relevantMessages.find((message) => message.productId)?.productId
    || relevantMessages.find((message) => Array.isArray(message.productItems) && message.productItems[0]?.productId)?.productItems?.[0]?.productId
    || "";
  const anchorProduct = anchorProductId ? getProductById(anchorProductId) : null;
  const productName = context?.productName
    || anchorProduct?.name
    || relevantOrders[0]?.productName
    || relevantMessages.find((message) => message.productName)?.productName
    || "";
  const latestOrder = relevantOrders[0] || null;

  if (latestOrder?.status === "delivered") {
    return { stage: "completed", label: "Completed", tone: "approved", productId: anchorProductId, productName };
  }
  if (latestOrder?.status === "confirmed") {
    return { stage: "confirmed", label: "Order confirmed", tone: "approved", productId: anchorProductId, productName };
  }
  if (latestOrder?.status === "paid") {
    return { stage: "paid", label: "Payment sent", tone: "pending", productId: anchorProductId, productName };
  }
  if (latestOrder?.status === "placed") {
    return { stage: "pending_verification", label: "Pending verification", tone: "pending", productId: anchorProductId, productName };
  }

  const latestInquiry = relevantMessages.find((message) =>
    ["product_reference", "product_inquiry", "contact_share"].includes(message.messageType)
    || Boolean(message.productId)
    || (Array.isArray(message.productItems) && message.productItems.length)
  );
  if (latestInquiry) {
    return { stage: "inquiry", label: "Product inquiry", tone: "", productId: anchorProductId, productName };
  }

  return {
    stage: "conversation",
    label: "Conversation",
    tone: "",
    productId: anchorProductId,
    productName
  };
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
  const trustSnapshot = getSellerTrustSnapshot(product.uploadedBy);
  if (Number(trustSnapshot?.sellerStats?.trustScore || 0) > 0) {
    badges.push(`<span class="status-pill">${trustSnapshot.sellerStats.trustScore}/100 trust</span>`);
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

function getTrustTierFromScore(score) {
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

function computeSellerTrustScoreSnapshot(username) {
  const sellerProducts = products.filter((product) => product.uploadedBy === username);
  const approvedProducts = sellerProducts.filter((product) => product.status === "approved").length;
  const sellerOrders = getAllConversationOrders().filter((order) => order?.sellerUsername === username);
  const completedOrders = sellerOrders.filter((order) => order?.status === "delivered").length;
  const repeatBuyers = Object.values(
    sellerOrders.reduce((accumulator, order) => {
      if (!order?.buyerUsername) {
        return accumulator;
      }
      accumulator[order.buyerUsername] = (accumulator[order.buyerUsername] || 0) + 1;
      return accumulator;
    }, {})
  ).filter((count) => count > 1).length;
  const reviewSummary = getSellerReviewSummary(username) || {};
  let trustScore = 25;
  const seller = getMarketplaceUser(username);
  if (seller?.verifiedSeller) {
    trustScore += 22;
  }
  trustScore += Math.min(18, approvedProducts * 3);
  trustScore += Math.min(14, completedOrders * 2);
  trustScore += Math.min(16, Math.round(Number(reviewSummary.averageRating || 0) * 3));
  trustScore += Math.min(10, Number(reviewSummary.totalReviews || 0) * 2);
  const roundedScore = Math.max(0, Math.min(100, Math.round(trustScore)));
  return {
    trustScore: roundedScore,
    trustTier: getTrustTierFromScore(roundedScore),
    approvedProducts,
    completedOrders,
    repeatBuyers
  };
}

function getConversationRelationshipMemory(context = null) {
  const withUser = context?.withUser || chatUiState.activeContext?.withUser || "";
  if (!withUser || !currentUser || withUser === currentUser) {
    return null;
  }

  const sharedOrders = getAllConversationOrders().filter((order) =>
    (order?.sellerUsername === withUser && order?.buyerUsername === currentUser)
    || (order?.sellerUsername === currentUser && order?.buyerUsername === withUser)
  );
  const sharedMessages = (Array.isArray(currentMessages) ? currentMessages : [])
    .filter((message) => getMessagePartner(message) === withUser);
  const outgoingOrders = sharedOrders.filter((order) => order?.sellerUsername === currentUser);
  const incomingOrders = sharedOrders.filter((order) => order?.sellerUsername === withUser);
  const outgoingCompleted = outgoingOrders.filter((order) => order?.status === "delivered").length;
  const incomingCompleted = incomingOrders.filter((order) => order?.status === "delivered").length;

  if (outgoingOrders.length > 1 || outgoingCompleted > 0) {
    return {
      label: "Repeat buyer",
      detail: outgoingCompleted > 0
        ? `${outgoingCompleted} completed order${outgoingCompleted === 1 ? "" : "s"} with you`
        : `${outgoingOrders.length} orders in this relationship`,
      tone: "approved"
    };
  }

  if (incomingOrders.length > 1 || incomingCompleted > 0) {
    return {
      label: incomingCompleted > 0 ? "Bought before" : "Returning buyer",
      detail: incomingCompleted > 0
        ? `You've completed ${incomingCompleted} order${incomingCompleted === 1 ? "" : "s"} with this seller`
        : `${incomingOrders.length} orders with this seller so far`,
      tone: "approved"
    };
  }

  if (sharedMessages.length >= 3) {
    return {
      label: "Conversation history",
      detail: `${sharedMessages.length} messages exchanged already`,
      tone: ""
    };
  }

  return null;
}

function getSellerTrustSnapshot(username) {
  const seller = getMarketplaceUser(username);
  if (!seller) {
    return null;
  }
  const reviewSummary = getSellerReviewSummary(username) || {};
  const sellerStats = seller.sellerStats || computeSellerTrustScoreSnapshot(username);
  return {
    seller,
    sellerStats,
    joinedLabel: formatMemberSinceLabel(seller.createdAt || seller.verificationSubmittedAt || ""),
    trustScoreLabel: sellerStats?.trustScore ? `${sellerStats.trustScore}/100 trust score` : "",
    trustTierLabel: sellerStats?.trustTier || "",
    ratingLabel: Number(reviewSummary.totalReviews || 0) > 0
      ? `${reviewSummary.averageRating.toFixed(1)} seller rating`
      : "",
    reviewCountLabel: Number(reviewSummary.totalReviews || 0) > 0
      ? `${reviewSummary.totalReviews} review${reviewSummary.totalReviews === 1 ? "" : "s"}`
      : "",
    verificationLabel: seller.verifiedSeller ? "Verified seller" : getVerificationStatusLabel(seller.verificationStatus || "unverified"),
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
  if (trust.trustScoreLabel) {
    trustBadges.push(`<span class="status-pill">${escapeHtml(trust.trustScoreLabel)}</span>`);
  }
  if (trust.trustTierLabel) {
    trustBadges.push(`<span class="status-pill">${escapeHtml(trust.trustTierLabel)}</span>`);
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

  const factLines = [
    trust.joinedLabel,
    trust.reviewCountLabel,
    Number(trust.sellerStats?.approvedProducts || 0) > 0 ? `${trust.sellerStats.approvedProducts} active listings` : "",
    Number(trust.sellerStats?.completedOrders || 0) > 0 ? `${trust.sellerStats.completedOrders} completed orders` : "",
    Number(trust.sellerStats?.repeatBuyers || 0) > 0 ? `${trust.sellerStats.repeatBuyers} repeat buyer${Number(trust.sellerStats.repeatBuyers) === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
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

function renderSavedIntentSection() {
  if (!currentUser || !canUseBuyerFeatures()) {
    return "";
  }
  const savedIds = Array.from(ensureSavedProductIdsLoaded());
  const followedSellerIds = Array.from(ensureFollowedSellerIdsLoaded());
  const savedProducts = savedIds
    .map((productId) => getProductById(productId))
    .filter((product) => product && product.status === "approved")
    .slice(0, 6);
  const followedSellers = followedSellerIds
    .map((username) => getMarketplaceUser(username))
    .filter(Boolean)
    .slice(0, 6);
  if (!savedProducts.length && !followedSellers.length) {
    return "";
  }

  const savedProductButtons = savedProducts.length
    ? savedProducts.map((product) => `
        <button class="saved-intent-chip" type="button" data-open-saved-product="${product.id}">
          ${escapeHtml(product.name || "Saved product")}
        </button>
      `).join("")
    : `<p class="empty-copy compact">Hakuna saved picks bado.</p>`;
  const followedSellerButtons = followedSellers.length
    ? followedSellers.map((seller) => {
        const latestProduct = getLatestApprovedSellerProduct(seller.username);
        return `
          <div class="saved-followed-seller-item">
            <button class="saved-intent-chip${isSellerFollowed(seller.username) ? " is-active" : ""}" type="button" data-open-followed-seller="${seller.username}">
              ${escapeHtml(getUserDisplayName(seller.username, { fallback: seller.fullName || seller.username || "Seller" }))}
            </button>
            <small class="product-meta">${escapeHtml(latestProduct?.name || "No approved product yet")}</small>
            <div class="saved-followed-seller-actions">
              <button class="trust-link-btn" type="button" data-share-seller-shop="${seller.username}">Share seller</button>
              <button class="trust-link-btn" type="button" data-follow-seller="${seller.username}">Unfollow</button>
            </div>
          </div>
        `;
      }).join("")
    : `<p class="empty-copy compact">Hakuna sellers unaowafuata bado.</p>`;

  return `
    <section id="profile-saved-intent-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Saved & Following</p>
          <h3>Rudi kwenye zilizokuvutia</h3>
        </div>
        <span class="meta-copy">${savedProducts.length} saved | ${followedSellers.length} followed</span>
      </div>
      <div class="saved-intent-grid">
        <div class="orders-card">
          <strong>Saved picks</strong>
          <div class="saved-intent-chip-row">${savedProductButtons}</div>
        </div>
        <div class="orders-card">
          <strong>Followed sellers</strong>
          <div class="saved-intent-chip-row">${followedSellerButtons}</div>
        </div>
      </div>
    </section>
  `;
}

function getLatestApprovedSellerProduct(username) {
  const safeUsername = String(username || "").trim();
  if (!safeUsername) {
    return null;
  }
  return products
    .filter((product) => product?.uploadedBy === safeUsername && product?.status === "approved")
    .sort((first, second) => new Date(second.createdAt || second.timestamp || 0).getTime() - new Date(first.createdAt || first.timestamp || 0).getTime())[0] || null;
}

async function handleShareSellerShop(username) {
  const seller = getMarketplaceUser(username);
  const latestProduct = getLatestApprovedSellerProduct(username);
  if (!latestProduct) {
    showInAppNotification({
      title: "Nothing to share yet",
      body: `${getUserDisplayName(username)} bado hana bidhaa approved ya kushare kwa sasa.`,
      variant: "warning"
    });
    return;
  }

  const sellerName = getUserDisplayName(username, {
    fallback: seller?.fullName || seller?.username || "Seller"
  });
  const shareText = `See more from ${sellerName} on Winga. Start with ${latestProduct.name}.`;
  const shareUrl = `${window.location.origin}${getProductDetailPath(latestProduct.id)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${sellerName} on Winga`,
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

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(`${shareText} | Link: ${shareUrl}`);
    showInAppNotification({
      title: "Seller share ready",
      body: `${sellerName} link ime-copy tayari kwa sharing.`,
      variant: "success"
    });
    return;
  }

  window.prompt("Copy seller link", `${shareText} | Link: ${shareUrl}`);
}

function buildCollectionShareUrl({ category = "all", topCategory = "" } = {}) {
  const shareUrl = new URL(window.location.origin + "/");
  const safeCategory = getRestorableCategory(category || "all");
  const safeTopCategory = isTopCategoryValue(topCategory)
    ? topCategory
    : (safeCategory !== "all" ? inferTopCategoryValue(safeCategory) : "");
  if (safeCategory && safeCategory !== "all") {
    shareUrl.searchParams.set("category", safeCategory);
  }
  if (safeTopCategory) {
    shareUrl.searchParams.set("topCategory", safeTopCategory);
  }
  shareUrl.searchParams.set("collection", "1");
  return shareUrl.toString();
}

function getSharedCollectionRouteState() {
  try {
    const currentUrl = new URL(window.location.href);
    const collection = currentUrl.searchParams.get("collection");
    const category = getRestorableCategory(currentUrl.searchParams.get("category") || "all");
    const topCategory = String(currentUrl.searchParams.get("topCategory") || "").trim().toLowerCase();
    if (collection !== "1" && category === "all" && !topCategory) {
      return null;
    }
    return {
      category,
      topCategory: isTopCategoryValue(topCategory)
        ? topCategory
        : (category !== "all" ? inferTopCategoryValue(category) : "")
    };
  } catch (error) {
    return null;
  }
}

function applySharedCollectionRoute(options = {}) {
  const routeState = getSharedCollectionRouteState();
  if (!routeState) {
    return false;
  }

  noteSharedCollectionIntent(routeState, {
    source: "share_collection_route"
  });

  let shouldRender = false;
  if (currentView !== "home") {
    setCurrentViewState("home", {
      persist: false,
      syncHistory: false
    });
    shouldRender = true;
  }

  const nextCategory = routeState.category || "all";
  const nextTopCategory = routeState.topCategory || "";
  if (selectedCategory !== nextCategory || expandedBrowseCategory !== nextTopCategory) {
    setCategorySelectionState(nextCategory, {
      expandedBrowseCategory: nextTopCategory,
      persist: false,
      syncHistory: false
    });
    shouldRender = true;
  }

  if (options.clearUrl !== false) {
    syncAppShellHistoryState({
      force: true,
      overrides: {
        view: "home",
        selectedCategory: nextCategory
      },
      url: `${window.location.pathname}${window.location.hash}`
    });
  }
  return shouldRender;
}

async function handleShareCollection(options = {}) {
  const fallbackProduct = getProductById(options.productId || "");
  const shareCategory = getRestorableCategory(
    options.category
    || (selectedCategory !== "all" ? selectedCategory : "")
    || fallbackProduct?.category
    || "all"
  );
  const shareTopCategory = isTopCategoryValue(options.topCategory)
    ? options.topCategory
    : (expandedBrowseCategory || inferTopCategoryValue(shareCategory));
  const title = String(options.title || "").trim()
    || (shareCategory !== "all" ? getCategoryLabel(shareCategory) : "Collection");
  const subtitle = String(options.subtitle || "").trim()
    || "Discover products selected for this collection on Winga.";
  const heading = String(options.heading || "").trim() || "Marketplace Picks";
  const shareText = `${heading}: ${title}. ${subtitle}`;
  const shareUrl = buildCollectionShareUrl({
    category: shareCategory,
    topCategory: shareTopCategory
  });

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${title} on Winga`,
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

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(`${shareText} | Link: ${shareUrl}`);
    showInAppNotification({
      title: "Collection share ready",
      body: `${title} link ime-copy tayari kwa sharing.`,
      variant: "success"
    });
    return;
  }

  window.prompt("Copy collection link", `${shareText} | Link: ${shareUrl}`);
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

let paymentIntentState = {
  productId: "",
  loading: false,
  transactionId: "",
  feedbackTone: "",
  feedbackMessage: ""
};
const paymentIntentSubmissionRegistry = new Map();

let promotionIntentState = {
  productId: "",
  product: null,
  selectedType: "starter_day",
  loading: false,
  transactionId: "",
  feedbackTone: "",
  feedbackMessage: ""
};

function pruneTimedRegistryEntries(registry, maxAgeMs = 15000) {
  if (!(registry instanceof Map)) {
    return;
  }
  const now = Date.now();
  Array.from(registry.entries()).forEach(([key, value]) => {
    const updatedAt = Number(value?.updatedAt || 0);
    if (!updatedAt || now - updatedAt > maxAgeMs) {
      registry.delete(key);
    }
  });
}

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

function isValidTransactionReferenceClient(value) {
  return /^[A-Z0-9._/-]{4,80}$/i.test(String(value || "").trim());
}

function getPromotionOption(type) {
  const normalizedType = String(type || "").trim();
  return PROMOTION_OPTIONS[normalizedType] || null;
}

function getPromotionPaymentContact(product) {
  return normalizeWhatsapp(
    getProductWhatsappNumber(product)
    || currentSession?.phoneNumber
    || currentSession?.whatsappNumber
    || ""
  );
}

function ensurePromotionIntentModal() {
  let root = document.getElementById("promotion-intent-modal");
  if (root) {
    return root;
  }
  root = createElement("div", {
    attributes: {
      id: "promotion-intent-modal",
      hidden: "true"
    }
  });
  root.innerHTML = `
    <div class="promotion-intent-backdrop" data-close-promotion-intent="true"></div>
    <div class="promotion-intent-dialog panel" role="dialog" aria-modal="true" aria-labelledby="promotion-intent-title">
      <button class="promotion-intent-close" type="button" aria-label="Close promotion flow" data-close-promotion-intent="true">&times;</button>
      <div class="promotion-intent-body" data-promotion-intent-body="true"></div>
    </div>
  `;
  root.addEventListener("click", (event) => {
    const optionButton = event.target.closest("[data-select-promotion-type]");
    if (optionButton) {
      promotionIntentState.selectedType = String(optionButton.dataset.selectPromotionType || "starter_day").trim() || "starter_day";
      promotionIntentState.feedbackTone = "";
      promotionIntentState.feedbackMessage = "";
      renderPromotionIntentModal();
      return;
    }
    if (event.target.closest("[data-close-promotion-intent='true']")) {
      closePromotionIntentModal();
      return;
    }
    if (event.target.closest("[data-submit-promotion-intent='true']")) {
      submitPromotionIntent().catch((error) => {
        captureClientError("promotion_intent_submit_failed", error, {
          productId: promotionIntentState.productId || "",
          type: promotionIntentState.selectedType || ""
        });
        showInAppNotification({
          title: "Promotion failed",
          body: error.message || "Imeshindikana kutuma request ya promotion.",
          variant: "error"
        });
        promotionIntentState.loading = false;
        renderPromotionIntentModal();
      });
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePromotionIntentModal();
    }
  });
  document.body.appendChild(root);
  return root;
}

function closePromotionIntentModal() {
  const root = document.getElementById("promotion-intent-modal");
  if (!root) {
    return;
  }
  root.hidden = true;
  root.classList.remove("open");
  promotionIntentState = {
    productId: "",
    product: null,
    selectedType: "starter_day",
    loading: false,
    transactionId: "",
    feedbackTone: "",
    feedbackMessage: ""
  };
  root.querySelector("[data-promotion-intent-body='true']")?.replaceChildren();
  syncBodyScrollLockState();
}

function getPromotionIntentProduct() {
  const activeProductId = String(promotionIntentState.productId || "").trim();
  if (!activeProductId) {
    return promotionIntentState.product || null;
  }
  const indexedProduct = getProductById(activeProductId);
  if (indexedProduct) {
    promotionIntentState.product = indexedProduct;
    return indexedProduct;
  }
  const stateProduct = promotionIntentState.product;
  if (stateProduct && String(stateProduct.id || "").trim() === activeProductId) {
    return stateProduct;
  }
  return null;
}

function getPromotionTriggerProduct(trigger) {
  const productId = String(trigger?.dataset?.promoteProduct || "").trim();
  if (productId) {
    const indexedProduct = getProductById(productId);
    if (indexedProduct) {
      return indexedProduct;
    }
  }
  const uploadedBy = String(trigger?.dataset?.promoteProductOwner || "").trim();
  if (!productId || !uploadedBy) {
    return null;
  }
  return {
    id: productId,
    uploadedBy,
    name: String(trigger?.dataset?.promoteProductName || "").trim(),
    shop: String(trigger?.dataset?.promoteProductShop || "").trim(),
    whatsapp: String(trigger?.dataset?.promoteProductWhatsapp || "").trim(),
    location: String(trigger?.dataset?.promoteProductLocation || "").trim(),
    category: String(trigger?.dataset?.promoteProductCategory || "").trim(),
    images: []
  };
}

function getPromotionTriggerContext(trigger) {
  return {
    product: getPromotionTriggerProduct(trigger),
    trustedAuthorized: String(trigger?.dataset?.promoteAuthorized || "").trim() === "true"
  };
}

function openPromotionFromTrigger(trigger) {
  const promotionContext = getPromotionTriggerContext(trigger);
  const product = promotionContext.product;
  if (!product) {
    showInAppNotification({
      title: "Promotion unavailable",
      body: "Product context ya promotion haikupatikana. Refresh home feed ujaribu tena.",
      variant: "warning"
    });
    return false;
  }
  openPromotionIntentModal(product, {
    trustedAuthorized: promotionContext.trustedAuthorized,
    trigger
  });
  return true;
}

function renderPromotionIntentModal() {
  const root = ensurePromotionIntentModal();
  const body = root.querySelector("[data-promotion-intent-body='true']");
  const product = getPromotionIntentProduct();
  if (!body) {
    return;
  }
  if (!product) {
    promotionIntentState.feedbackTone = "error";
    promotionIntentState.feedbackMessage = "Promotion plan haikuweza kufunguka kwa sababu context ya bidhaa imepotea. Refresh home feed kisha ujaribu tena.";
    const wrapper = createElement("div", { className: "promotion-intent-shell" });
    const actions = createElement("div", { className: "payment-intent-actions" });
    wrapper.append(
      createElement("p", { className: "eyebrow", textContent: "Promotion request" }),
      createElement("h3", {
        textContent: "Promotion unavailable",
        attributes: { id: "promotion-intent-title" }
      }),
      createElement("p", {
        className: "payment-intent-status is-error",
        textContent: promotionIntentState.feedbackMessage
      }),
      actions
    );
    actions.appendChild(createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Close",
      attributes: {
        type: "button",
        "data-close-promotion-intent": "true"
      }
    }));
    body.replaceChildren(wrapper);
    root.hidden = false;
    root.classList.add("open");
    syncBodyScrollLockState();
    return;
  }
  const selectedOption = getPromotionOption(promotionIntentState.selectedType) || getPromotionOption("starter_day");
  const paymentContact = getPromotionPaymentContact(product);
  const wrapper = createElement("div", { className: "promotion-intent-shell" });
  wrapper.append(
    createElement("p", { className: "eyebrow", textContent: "Visibility plan" }),
    createElement("h3", {
      textContent: "Choose visibility plan",
      attributes: { id: "promotion-intent-title" }
    }),
    createElement("p", {
      className: "product-meta",
      textContent: "Chagua siku za tangazo, kisha weka reference ya malipo ili admin aapprove tangazo lako."
    })
  );

  const packageGrid = createElement("div", { className: "promotion-intent-options" });
  Object.entries(PROMOTION_OPTIONS).forEach(([type, option]) => {
    const button = createElement("button", {
      className: `promotion-intent-option${type === promotionIntentState.selectedType ? " is-active" : ""}`,
      attributes: {
        type: "button",
        "data-select-promotion-type": type
      }
    });
    button.append(
      createElement("strong", { textContent: option.label }),
      createElement("span", { textContent: `TSh ${formatNumber(option.amount)}` }),
      createElement("small", { textContent: `${option.durationDays} day${option.durationDays === 1 ? "" : "s"}` })
    );
    packageGrid.appendChild(button);
  });

  const summary = createElement("div", { className: "payment-intent-summary" });
  summary.append(
    createElement("strong", { textContent: product.name || "Product" }),
    createElement("p", { className: "product-meta", textContent: `Plan: ${selectedOption?.label || "1 day visibility"}` }),
    createElement("p", { className: "product-meta", textContent: `Amount: TSh ${formatNumber(selectedOption?.amount || 0)}` }),
    createElement("p", { className: "product-meta", textContent: `Duration: ${selectedOption?.durationDays || 0} day${selectedOption?.durationDays === 1 ? "" : "s"}` }),
    createElement("p", { className: "product-meta", textContent: `Payment contact: ${paymentContact || "Haijawekwa"}` }),
    createElement("p", { className: "product-meta", textContent: "Baada ya kutuma reference, tangazo litaenda kwa admin approval." })
  );

  const guidance = createElement("div", { className: "payment-safety-card" });
  guidance.append(
    createElement("strong", { textContent: "Manual verification for now" }),
    createElement("p", {
      className: "product-meta",
      textContent: "Flow hii inakusanya visibility plan na payment reference ndani ya app. Admin ata-review kabla ya kuactivate tangazo."
    }),
    createElement("p", {
      className: "product-meta",
      textContent: paymentContact
        ? "Tumia reference ya malipo halisi uliyopewa kwenye route ya sasa ya promotion."
        : "Kagua namba ya simu ya seller kwenye profile yako kwanza kabla ya kuendelea."
    })
  );

  const input = createElement("input", {
    attributes: {
      id: "promotion-intent-transaction-input",
      type: "text",
      maxlength: "80",
      placeholder: "Weka payment reference ya tangazo",
      value: promotionIntentState.transactionId || "",
      autocomplete: "off",
      autocapitalize: "characters"
    }
  });
  const note = createElement("p", {
    className: "auth-note",
    textContent: "Mfano: M-Pesa code, Airtel Money code, Tigo Pesa code, au receipt reference nyingine halali."
  });

  const networkMessage = typeof navigator !== "undefined" && navigator.onLine === false
    ? "Uko offline kwa sasa. Hifadhi reference hii, halafu submit internet ikirudi."
    : promotionIntentState.loading
      ? "Tunatuma request yako ya promotion sasa. Usifunge dirisha hili."
      : promotionIntentState.feedbackMessage;
  const networkTone = typeof navigator !== "undefined" && navigator.onLine === false
    ? "warning"
    : promotionIntentState.loading
      ? "info"
      : (promotionIntentState.feedbackTone || "");
  if (networkMessage) {
    wrapper.appendChild(createElement("p", {
      className: `payment-intent-status${networkTone ? ` is-${networkTone}` : ""}`,
      textContent: networkMessage
    }));
  }

  const actions = createElement("div", { className: "payment-intent-actions" });
  const submitButton = createElement("button", {
    className: "action-btn buy-btn",
    textContent: promotionIntentState.loading ? "Submitting..." : "Send to admin",
    attributes: {
      type: "button",
      "data-submit-promotion-intent": "true"
    }
  });
  if (promotionIntentState.loading) {
    submitButton.disabled = true;
    input.disabled = true;
  }
  actions.append(
    submitButton,
    createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Cancel",
      attributes: {
        type: "button",
        "data-close-promotion-intent": "true"
      }
    })
  );

  wrapper.append(packageGrid, summary, guidance, input, note, actions);
  body.replaceChildren(wrapper);
  root.hidden = false;
  root.classList.add("open");
  input.focus();
  input.select();
  syncBodyScrollLockState();
}

async function submitPromotionIntent() {
  const product = getPromotionIntentProduct();
  if (!product) {
    throw new Error("Bidhaa haijapatikana tena. Refresh home feed kisha ujaribu tena.");
  }
  const selectedType = String(promotionIntentState.selectedType || "").trim();
  const selectedOption = getPromotionOption(selectedType);
  if (!selectedOption) {
    throw new Error("Chagua package ya promotion kwanza.");
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    promotionIntentState.feedbackTone = "warning";
    promotionIntentState.feedbackMessage = "Uko offline. Promotion request haijatumwa bado. Internet ikirudi, bonyeza Submit promotion tena.";
    renderPromotionIntentModal();
    showInAppNotification({
      title: "Uko offline",
      body: "Promotion request imebaki hapa. Internet ikirudi, submit tena.",
      variant: "warning"
    });
    return;
  }
  const input = document.getElementById("promotion-intent-transaction-input");
  const transactionId = String(input?.value || promotionIntentState.transactionId || "").trim().toUpperCase();
  if (!isValidTransactionReferenceClient(transactionId)) {
    throw new Error("Weka transaction reference sahihi ya promotion.");
  }

  promotionIntentState.loading = true;
  promotionIntentState.transactionId = transactionId;
  promotionIntentState.feedbackTone = "info";
  promotionIntentState.feedbackMessage = "Tunatuma request yako ya promotion sasa.";
  renderPromotionIntentModal();

  await window.WingaDataLayer.createPromotion({
    productId: product.id,
    type: selectedType,
    transactionReference: transactionId
  });
  await refreshPromotionsState();
  reportClientEvent("info", "promotion_created", "Seller created a promotion.", {
    productId: product.id,
    type: selectedType
  });
  showInAppNotification({
    title: "Promotion submitted",
    body: "Promotion imewasilishwa. Utaiona ikishaingia active au ikireviewiwa.",
    variant: "success"
  });
  closePromotionIntentModal();
  renderProfile();
  renderCurrentView();
}

function ensurePaymentIntentModal() {
  let root = document.getElementById("payment-intent-modal");
  if (root) {
    return root;
  }
  root = createElement("div", {
    attributes: {
      id: "payment-intent-modal",
      hidden: "true"
    }
  });
  root.innerHTML = `
    <div class="payment-intent-backdrop" data-close-payment-intent="true"></div>
    <div class="payment-intent-dialog panel" role="dialog" aria-modal="true" aria-labelledby="payment-intent-title">
      <button class="payment-intent-close" type="button" aria-label="Close payment flow" data-close-payment-intent="true">&times;</button>
      <div class="payment-intent-body" data-payment-intent-body="true"></div>
    </div>
  `;
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-payment-intent='true']")) {
      closePaymentIntentModal();
      return;
    }
    if (event.target.closest("[data-payment-open-chat='true']")) {
      const product = getProductById(paymentIntentState.productId || "");
      if (product) {
        closePaymentIntentModal();
        openProductChat(product);
      }
      return;
    }
    if (event.target.closest("[data-submit-payment-intent='true']")) {
      submitPaymentIntentOrder().catch((error) => {
        captureClientError("payment_intent_submit_failed", error, {
          productId: paymentIntentState.productId || ""
        });
        showInAppNotification({
          title: "Payment proof failed",
          body: error.message || "Imeshindikana kutuma reference ya malipo.",
          variant: "error"
        });
        paymentIntentState.loading = false;
        renderPaymentIntentModal();
      });
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePaymentIntentModal();
    }
  });
  document.body.appendChild(root);
  return root;
}

function closePaymentIntentModal() {
  const root = document.getElementById("payment-intent-modal");
  if (!root) {
    return;
  }
  root.hidden = true;
  root.classList.remove("open");
  paymentIntentState = {
    productId: "",
    loading: false,
    transactionId: "",
    feedbackTone: "",
    feedbackMessage: ""
  };
  root.querySelector("[data-payment-intent-body='true']")?.replaceChildren();
  syncBodyScrollLockState();
}

function renderPaymentIntentModal() {
  const root = ensurePaymentIntentModal();
  const body = root.querySelector("[data-payment-intent-body='true']");
  const product = getProductById(paymentIntentState.productId || "");
  if (!body || !product) {
    closePaymentIntentModal();
    return;
  }
  const paymentDetails = getProductPaymentDetails(product);

  const wrapper = createElement("div", { className: "payment-intent-shell" });
  wrapper.append(
    createElement("p", { className: "eyebrow", textContent: "Mobile Money checkout" }),
    createElement("h3", {
      textContent: "Submit payment reference",
      attributes: { id: "payment-intent-title" }
    }),
    createElement("p", {
      className: "product-meta",
      textContent: "Lipa kwanza, kisha weka receipt au transaction reference ili order ihifadhiwe pending verification."
    })
  );

  const summary = createElement("div", { className: "payment-intent-summary" });
  summary.append(
    createElement("strong", { textContent: product.name || "Product" }),
    createElement("p", { className: "product-meta", textContent: `Kiasi: ${formatProductPrice(product.price)}` }),
    createElement("p", { className: "product-meta", textContent: `Lipa namba: ${paymentDetails.number || "Haijawekwa"}` }),
    createElement("p", { className: "product-meta", textContent: `Mpokeaji: ${paymentDetails.recipientName || "Muuzaji huyu"}` }),
    createElement("p", { className: "product-meta", textContent: `Mtandao: ${paymentDetails.provider ? paymentDetails.provider.replace(/_/g, " ").toUpperCase() : "Mobile Money"}` }),
    createElement("p", { className: "product-meta", textContent: "Reservation window: 24 hours pending verification" })
  );
  if (paymentDetails.instructions) {
    summary.append(
      createElement("p", {
        className: "auth-note",
        textContent: paymentDetails.instructions
      })
    );
  }
  const safetyCard = createElement("div", { className: "payment-safety-card" });
  safetyCard.append(
    createElement("strong", { textContent: "Safety check before you pay" }),
    createElement("p", {
      className: "product-meta",
      textContent: "Hakiki jina la mpokeaji, lipa kiasi kilichoonyeshwa, kisha weka reference ya malipo hapa ndani."
    }),
    createElement("p", {
      className: "product-meta",
      textContent: "Ukiona taarifa hazilingani au seller anakushinikiza ulipie sehemu nyingine, tumia report seller kwanza."
    })
  );

  const input = createElement("input", {
    attributes: {
      id: "payment-intent-transaction-input",
      type: "text",
      maxlength: "80",
      placeholder: "Weka receipt au transaction reference",
      value: paymentIntentState.transactionId || "",
      autocomplete: "off",
      autocapitalize: "characters"
    }
  });
  const note = createElement("p", {
    className: "auth-note",
    textContent: "Tumia reference ya malipo uliyopewa na M-Pesa, Airtel Money, Tigo Pesa, au HaloPesa."
  });
  const networkMessage = typeof navigator !== "undefined" && navigator.onLine === false
    ? "Uko offline kwa sasa. Hifadhi reference hii kisha submit internet ikirudi."
    : paymentIntentState.loading
      ? "Tunatuma reference yako sasa. Usifunge dirisha hili."
      : paymentIntentState.feedbackMessage;
  const networkTone = typeof navigator !== "undefined" && navigator.onLine === false
    ? "warning"
    : paymentIntentState.loading
      ? "info"
      : (paymentIntentState.feedbackTone || "");
  if (networkMessage) {
    wrapper.appendChild(createElement("p", {
      className: `payment-intent-status${networkTone ? ` is-${networkTone}` : ""}`,
      textContent: networkMessage
    }));
  }
  const actions = createElement("div", { className: "payment-intent-actions" });
  const submitButton = createElement("button", {
    className: "action-btn buy-btn",
    textContent: paymentIntentState.loading ? "Submitting..." : "Submit reference",
    attributes: {
      type: "button",
      "data-submit-payment-intent": "true"
    }
  });
  if (paymentIntentState.loading) {
    submitButton.disabled = true;
    input.disabled = true;
  }
  actions.append(
    submitButton,
    createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Report seller",
      attributes: {
        type: "button",
        "data-report-seller": product.uploadedBy || "",
        "data-report-product-context": product.id || ""
      }
    }),
    createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Message seller",
      attributes: {
        type: "button",
        "data-payment-open-chat": "true"
      }
    }),
    createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Cancel",
      attributes: {
        type: "button",
        "data-close-payment-intent": "true"
      }
    })
  );

  wrapper.append(summary, safetyCard, input, note, actions);
  body.replaceChildren(wrapper);
  root.hidden = false;
  root.classList.add("open");
  input.focus();
  input.select();
  syncBodyScrollLockState();
}

async function submitPaymentIntentOrder() {
  const product = getProductById(paymentIntentState.productId || "");
  if (!product) {
    throw new Error("Bidhaa haijapatikana tena. Jaribu kufungua product upya.");
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    paymentIntentState.feedbackTone = "warning";
    paymentIntentState.feedbackMessage = "Uko offline. Reference haijatumwa bado. Internet ikirudi, bonyeza Submit reference tena.";
    renderPaymentIntentModal();
    showInAppNotification({
      title: "Uko offline",
      body: "Reference imebaki kwenye dirisha hili. Internet ikirudi, submit tena.",
      variant: "warning"
    });
    return;
  }
  const paymentDetails = getProductPaymentDetails(product);
  if (!paymentDetails.number) {
    throw new Error("Muuzaji bado hajaweka Lipa namba. Tuma ujumbe kwanza ili akamilishe taarifa za malipo.");
  }
  const input = document.getElementById("payment-intent-transaction-input");
  const transactionId = String(input?.value || paymentIntentState.transactionId || "").trim().toUpperCase();
  if (!isValidTransactionReferenceClient(transactionId)) {
    throw new Error("Weka transaction reference sahihi baada ya kulipa.");
  }
  pruneTimedRegistryEntries(paymentIntentSubmissionRegistry, 20000);
  const submissionKey = createPaymentIntentSubmissionKey(product.id, transactionId);
  const existingSubmission = paymentIntentSubmissionRegistry.get(submissionKey);
  if (existingSubmission?.status === "pending") {
    paymentIntentState.feedbackTone = "info";
    paymentIntentState.feedbackMessage = "Reference hii bado tunaituma. Subiri kidogo kabla ya kujaribu tena.";
    renderPaymentIntentModal();
    showInAppNotification({
      title: "Still submitting",
      body: "Reference hii bado tunaituma. Subiri kidogo kabla ya kujaribu tena.",
      variant: "info"
    });
    return;
  }
  if (existingSubmission?.status === "completed" && Date.now() - Number(existingSubmission.updatedAt || 0) < 20000) {
    paymentIntentState.feedbackTone = "success";
    paymentIntentState.feedbackMessage = "Reference hii tayari ilitumwa. Subiri seller athibitishe malipo.";
    renderPaymentIntentModal();
    showInAppNotification({
      title: "Already submitted",
      body: "Reference hii tayari ilitumwa. Subiri seller athibitishe malipo.",
      variant: "info"
    });
    return;
  }
  paymentIntentState.loading = true;
  paymentIntentState.transactionId = transactionId;
  paymentIntentState.feedbackTone = "info";
  paymentIntentState.feedbackMessage = "Tunatuma reference yako kwa seller sasa.";
  renderPaymentIntentModal();
  paymentIntentSubmissionRegistry.set(submissionKey, {
    status: "pending",
    updatedAt: Date.now()
  });

  try {
    await window.WingaDataLayer.createOrder({
      productId: product.id,
      transactionId
    });
    paymentIntentSubmissionRegistry.set(submissionKey, {
      status: "completed",
      updatedAt: Date.now()
    });
  } catch (error) {
    paymentIntentSubmissionRegistry.delete(submissionKey);
    throw error;
  }

  reportClientEvent("info", "order_created", "Buyer created an order from product detail.", {
    productId: product.id
  });
  maybePromptNotificationPermission("order");
  closePaymentIntentModal();
  showInAppNotification({
    title: "Reference submitted",
    body: "Order imehifadhiwa pending verification. Seller ataona order hii baada ya payment proof kuhakikiwa.",
    variant: "success"
  });
  if (currentView === "profile") {
    renderCurrentView();
  }
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
    const savedProductButton = event.target.closest("[data-open-saved-product]");
    if (savedProductButton) {
      event.preventDefault();
      event.stopPropagation();
      const product = getProductById(savedProductButton.dataset.openSavedProduct || "");
      if (product) {
        openProductDetailModal(product.id);
      }
      return;
    }

    const likeProductButton = event.target.closest("[data-like-product]");
    if (likeProductButton) {
      event.preventDefault();
      event.stopPropagation();
      const productId = String(likeProductButton.dataset.likeProduct || "").trim();
      if (!productId) {
        return;
      }
      const nowLiked = toggleSavedProduct(productId);
      likeProductButton.textContent = nowLiked ? "♥ Like" : "♡ Like";
      likeProductButton.classList.toggle("is-active", nowLiked);
      showInAppNotification({
        type: "info",
        title: nowLiked ? "Imehifadhiwa kwenye Favorites" : "Imeondolewa kwenye Favorites",
        body: nowLiked
          ? "Bidhaa hii itabaki karibu kwa return visits zako."
          : "Bidhaa hii imeondolewa kwenye favorites zako.",
        variant: "success",
        durationMs: 2200
      });
      return;
    }

    const followSellerButton = event.target.closest("[data-follow-seller]");
    if (followSellerButton) {
      event.preventDefault();
      event.stopPropagation();
      if (!isAuthenticatedUser()) {
        promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: "Sign in to follow sellers",
          message: "Create an account first so Winga can save your followed sellers safely."
        });
        return;
      }
      if (!canUseBuyerFeatures()) {
        showInAppNotification({
          title: "Buyer access needed",
          body: "Following sellers is available on buyer-enabled accounts only.",
          variant: "warning"
        });
        return;
      }
      const username = followSellerButton.dataset.followSeller || "";
      if (!username) {
        return;
      }
      const nowFollowing = toggleFollowSeller(username);
      followSellerButton.textContent = nowFollowing ? "Following" : "Follow";
      followSellerButton.classList.toggle("is-active", nowFollowing);
      noteSellerInterest(username, nowFollowing ? 20 : 4, {
        signalType: "message"
      });
      showInAppNotification({
        title: nowFollowing ? "Seller followed" : "Seller unfollowed",
        body: nowFollowing
          ? `${getUserDisplayName(username)} ataonekana kwa urahisi kwenye return visits zako.`
          : `${getUserDisplayName(username)} ameondolewa kwenye followed sellers zako.`,
        variant: "success",
        durationMs: 2400
      });
      if (currentView === "profile" && profileDiv?.isConnected) {
        renderProfile?.();
      }
      return;
    }

    const openFollowedSellerButton = event.target.closest("[data-open-followed-seller]");
    if (openFollowedSellerButton) {
      event.preventDefault();
      event.stopPropagation();
      const username = openFollowedSellerButton.dataset.openFollowedSeller || "";
      const latestProduct = getLatestApprovedSellerProduct(username);
      if (!latestProduct) {
        showInAppNotification({
          title: "No live product yet",
          body: `${getUserDisplayName(username)} bado hana approved product ya kufungua.`,
          variant: "warning"
        });
        return;
      }
      openProductDetailModal(latestProduct.id);
      return;
    }

    const shareSellerButton = event.target.closest("[data-share-seller-shop]");
    if (shareSellerButton) {
      event.preventDefault();
      event.stopPropagation();
      handleShareSellerShop(shareSellerButton.dataset.shareSellerShop || "").catch((error) => {
        captureClientError("share_seller_shop_failed", error, {
          sellerUsername: shareSellerButton.dataset.shareSellerShop || ""
        });
      });
      return;
    }

    const shareCollectionButton = event.target.closest("[data-share-collection-title]");
    if (shareCollectionButton) {
      event.preventDefault();
      event.stopPropagation();
      handleShareCollection({
        title: shareCollectionButton.dataset.shareCollectionTitle || "",
        subtitle: shareCollectionButton.dataset.shareCollectionSubtitle || "",
        heading: shareCollectionButton.dataset.shareCollectionHeading || "",
        productId: shareCollectionButton.dataset.shareCollectionProductId || "",
        surface: shareCollectionButton.dataset.shareCollectionSurface || ""
      }).catch((error) => {
        captureClientError("share_collection_failed", error, {
          productId: shareCollectionButton.dataset.shareCollectionProductId || "",
          surface: shareCollectionButton.dataset.shareCollectionSurface || ""
        });
      });
      return;
    }

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
  createProgressiveImage,
  sanitizeImageSource,
  getCurrentNotifications: () => currentNotifications,
  getRenderableNotifications,
  getUnreadNotifications,
  escapeHtml,
  getConversationSummaries,
  getConversationSummariesFiltered,
  getConversationCommerceSnapshot,
  getConversationRelationshipMemory,
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
  getChatComposeStatus: (scope = "profile") => {
    const currentStatus = chatUiState.composeStatus || {};
    return currentStatus[String(scope || "profile").trim().toLowerCase()] || null;
  },
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
    saveStoredChatDraft(value, chatUiState.activeContext);
  },
  setChatComposeStatus: (scope, status = null) => {
    if (!chatUiState.composeStatus || typeof chatUiState.composeStatus !== "object") {
      chatUiState.composeStatus = {};
    }
    const safeScope = String(scope || "profile").trim().toLowerCase();
    if (!safeScope) {
      return;
    }
    if (!status || !status.message) {
      delete chatUiState.composeStatus[safeScope];
      return;
    }
    chatUiState.composeStatus[safeScope] = {
      tone: ["info", "warning", "success", "error"].includes(String(status.tone || "").trim())
        ? String(status.tone || "").trim()
        : "info",
      message: String(status.message || "").trim()
    };
  },
  setOrderActionStatus: (orderId, status = null) => {
    if (!chatUiState.orderActionStatus || typeof chatUiState.orderActionStatus !== "object") {
      chatUiState.orderActionStatus = {};
    }
    const safeOrderId = String(orderId || "").trim();
    if (!safeOrderId) {
      return;
    }
    if (!status || !status.message) {
      delete chatUiState.orderActionStatus[safeOrderId];
      return;
    }
    chatUiState.orderActionStatus[safeOrderId] = {
      tone: ["info", "warning", "success", "error"].includes(String(status.tone || "").trim())
        ? String(status.tone || "").trim()
        : "info",
      message: String(status.message || "").trim()
    };
  },
  setProductActionStatus: (productId, status = null) => {
    if (!chatUiState.productActionStatus || typeof chatUiState.productActionStatus !== "object") {
      chatUiState.productActionStatus = {};
    }
    const safeProductId = String(productId || "").trim();
    if (!safeProductId) {
      return;
    }
    if (!status || !status.message) {
      delete chatUiState.productActionStatus[safeProductId];
      return;
    }
    chatUiState.productActionStatus[safeProductId] = {
      tone: ["info", "warning", "success", "error"].includes(String(status.tone || "").trim())
        ? String(status.tone || "").trim()
        : "info",
      message: String(status.message || "").trim()
    };
  },
  getCurrentMessageDraft: () => chatUiState.currentDraft,
  loadStoredChatDraft,
  saveStoredChatDraft,
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
  openProductDetailModal,
  isProductDetailOpen: () => document.body.classList.contains("product-detail-open"),
  closeProductDetailModal: (options) => closeProductDetailModalFromController(options),
  setActiveProfileSection,
  setPendingProfileSection: (value) => {
    profileRuntimeState.pendingSection = value;
  },
  createElementFromMarkup,
  ensureContextChatModal,
  renderContextChatModal,
  getConversationSummaries,
  getConversationCommerceSnapshot,
  getActiveConversationMessages,
  getProductById,
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
  handleNotificationOpen,
  maybePromptNotificationPermission,
  beginPurchaseFlow,
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
  createProgressiveImage,
  sanitizeImageSource,
  getImageFallbackDataUri,
  preloadImageSource,
  warmAdminImageCache,
  getCategoryLabel,
  getRoleLabel,
  getPromotionLabel,
  formatNumber,
  formatProductPrice,
  getProductDetailPath,
  getAdminPanel: () => adminPanel,
  getCurrentView: () => currentView,
  isAdminUser,
  isStaffUser,
  refreshProductsFromStore,
  renderAnalyticsPanel,
  dataLayer: window.WingaDataLayer,
  applyAppSettings,
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
  createPromotionOverviewSectionElement,
  createPromotionManagementSectionElement
} = window.WingaModules.profile.createProfileUiModule({
  createElement,
  createSectionHeading,
  createFragmentFromMarkup,
  createElementFromMarkup,
  createResponsiveImage,
  createProgressiveImage,
  createStatusPill,
  createStatBox,
  escapeHtml,
  sanitizeImageSource,
  getImageFallbackDataUri,
  preloadImageSource,
  renderProductGallery,
  formatNumber,
  formatProductPrice,
  getStatusLabel,
  getPaymentStatusLabel,
  getOrderLifecycleMeta,
  getOrderProgressLabel,
  getOrderActionStatus: (orderId) => {
    const orderStatus = chatUiState.orderActionStatus || {};
    return orderStatus[String(orderId || "").trim()] || null;
  },
  getOrderReviewAction: (order) => {
    const product = getProductById(order?.productId || "");
    if (!product || order?.status !== "delivered" || order?.buyerUsername !== currentUser) {
      return null;
    }
    if (!canCurrentUserReviewProduct(product)) {
      return null;
    }
    return {
      productId: product.id,
      label: "Review product"
    };
  },
  getProductActionStatus: (productId) => {
    const productStatus = chatUiState.productActionStatus || {};
    return productStatus[String(productId || "").trim()] || null;
  },
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
  createElement,
  createProfileShellElement,
  createProfileProductCardElement,
  createProfileIdentitySectionElement,
  createSellerUpgradeSectionElement,
  createOrdersSectionElement,
  createPromotionOverviewSectionElement,
  createPromotionManagementSectionElement,
  renderSavedIntentSection,
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
      const anchor = productsContainer || uploadForm || emptyState || adminPanel;
      if (anchor) {
        appContainer.insertBefore(profileDiv, anchor);
      } else {
        appContainer.appendChild(profileDiv);
      }
    }
    return profileDiv;
  },
  getProducts: () => products,
  getProductById,
  getCurrentUser: () => currentUser,
  getCurrentSession: () => currentSession,
  getCurrentOrders: () => currentOrders,
  getCurrentPromotions: () => currentPromotions,
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
  getNotificationPermissionState,
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
  setResultsMeta: () => {},
  openNotificationPermissionPrompt,
  renderAnalyticsPanel,
  refreshPromotionsState,
  openPromotionIntentModal,
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

let createDetailContinuationFeedStackElement = null;

const {
  ensureProductDetailModal,
  createProductDetailContentElement,
  createDetailShowcaseSectionElement
} = window.WingaModules.productDetail.createProductDetailUiModule({
  createElement,
  createFragmentFromMarkup,
  createProgressiveImage,
  sanitizeImageSource,
  escapeHtml,
  getCategoryLabel,
  formatNumber,
  formatProductPrice,
  getImageFallbackDataUri,
  preloadImageSource,
  getRenderableMarketplaceImages,
  getMarketplacePrimaryImage,
  renderRequestBoxButton,
  renderWhatsappChatLink,
  getCurrentUser: () => currentUser,
  isAdminUser: () => isAdminUser(),
  canRepostProduct: (product) => canRepostProductAsSeller(product),
  renderProductActionGroup,
  renderMarketplaceTrustBadges,
  renderSellerTrustPanel,
  createHomeFeedProductCardStackElement: (...args) => createDetailContinuationFeedStackElement?.(...args) || null,
  renderDiscoveryProductCards,
  renderFeedGalleryMarkup
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
  preloadImageSource,
  noteProductInterest,
  noteProductDiscovery,
  enhanceShowcaseTracks,
  bindProductEngagementSignals,
  disposeScopedRenderMemory,
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
  getHeaderInstallButton: () => headerInstallButton,
  getHeaderUserTrigger: () => headerUserTrigger,
  getHeaderUserDropdown: () => headerUserDropdown,
  getAuthGateLoginButton: () => authGateLoginButton,
  getAuthGateSignupButton: () => authGateSignupButton,
  getAuthCloseButton: () => authCloseButton,
  getAuthContainer: () => authContainer,
  getAuthInstallButton: () => authInstallButton,
  getPublicHeaderActions: () => publicHeaderActions,
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
  promptAppInstall,
  getAuthGateTitle: () => authGateTitle?.innerText || "",
  getAuthGateMessage: () => authGateCopy?.innerText || "",
  canAccessView,
  getAccessDeniedMessage,
  closeMobileSearch: () => {
    searchRuntimeState.isMobileSearchOpen = false;
    searchBox.classList.remove("mobile-open");
  },
  getProductById,
  resolvePromotionTriggerProduct: getPromotionTriggerProduct,
  resolvePromotionTriggerContext: getPromotionTriggerContext,
  beginPurchaseFlow,
  openPromotionIntentModal,
  repostProductAsSeller,
  toggleProductInRequestBoxById: (productId) => {
    const product = getProductById(productId);
    if (product) {
      toggleProductInRequestBox(product);
    }
  },
  openProductDetailModal,
  openOwnProductMessages,
  openProductWhatsappFromCard,
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
  createProgressiveImage,
  createSlideDot
});

const { renderFilterCategories } = window.WingaModules.categories.createCategoriesUiModule({
  createElement,
  createCategoryButton,
  createResponsiveImage,
  createProgressiveImage,
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
  cancelScheduledFeedRender: cancelMarketplaceFeedRender,
  renderProducts,
  createProductCardElement,
  createShowcaseProductCardElement,
  createProductCardStackElement,
  createShowcaseSectionElement,
  createDynamicShowcasePlaceholderElement,
  renderShowcaseTrack,
  repairShowcaseMediaVisibility,
  stabilizeMobileShowcaseRows
} = window.WingaModules.marketplace.createMarketplaceUiModule({
  createElement,
  createElementFromMarkup,
  createFragmentFromMarkup,
  createSectionHeading,
  createResponsiveImage,
  createProgressiveImage,
  createStatusPill,
  getImageFallbackDataUri,
  preloadImageSource,
  getProductsContainer: () => productsContainer,
  getCurrentView: () => currentView,
  isBootInitialRender: () => Boolean(uiRuntimeState.isBootInitialRender),
  hasPrioritySearchResults,
  getProductsPerRow,
  getFeedRenderBatchSize: () => (uiRuntimeState.isBootInitialRender ? 3 : 8),
  getFeedRenderBatchDelayMs: () => (uiRuntimeState.isBootInitialRender ? 12 : 22),
  getLayoutMode: () => getClientLayoutMode(),
  getFeedLayoutColumns: () => getFeedLayoutColumns(),
  createContinuousDiscoveryAnchorElement,
  trackView,
  formatNumber,
  formatProductPrice,
  getStatusLabel,
  getCategoryLabel,
  getRenderableMarketplaceImages,
  getMarketplacePrimaryImage,
  getMarketplaceUser,
  getCurrentUser: () => currentUser,
  isSellerFollowed,
  isProductSaved,
  getSellerPromotionStatusMeta,
  renderSellerPromotionAnalytics,
  renderMarketplaceTrustBadges,
  renderProductActionGroup,
  renderProductOverflowMenu,
  noteProductInterest,
  openPromotionIntentModal,
  openImageLightbox,
  openProductDetailModal,
  isAuthenticatedUser,
  canUseBuyerFeatures,
  canUseSellerFeatures,
  promptGuestAuth,
  renderFeedGalleryMarkup,
  bindFeedGalleryInteractions,
  bindImageFallbacks,
  bindProductEngagementSignals,
  bindProductMenus,
  enhanceShowcaseTracks,
  disposeScopedRenderMemory,
  getBehaviorShowcaseDescriptor,
  getShowcaseProducts,
  getRecommendationSeed,
  getDiscoverySponsoredProducts: (...args) => getDiscoverySponsoredProducts(...args),
  getRelatedProducts: (...args) => getRelatedProducts(...args),
  getYouMayLikeProducts,
  getTrendingProducts,
  prioritizeVisibleFeedMedia,
  primeIncomingFeedItems,
  bindShowcaseCardClicks,
  setupDynamicShowcaseLoading,
  reportShowcaseInstrumentation,
  canUseContinuousDiscovery: () => true,
  createContinuousDiscoveryAnchorElement,
  setupContinuousDiscoveryLoading,
  setDeferredRecommendationDescriptors: (descriptors = []) => {
    homeContinuousDiscoveryRuntime.pendingDescriptors = Array.isArray(descriptors)
      ? descriptors
        .filter((descriptor) => Array.isArray(descriptor?.items) && descriptor.items.length)
        .map((descriptor) => ({
          ...descriptor,
          items: descriptor.items.slice()
        }))
      : [];
  },
  trackProductView: (productId) => window.WingaDataLayer.trackProductView(productId),
  refreshProductsFromStore,
  afterFeedBatchRender: ({ container, startIndex = 0, endIndex = 0 }) => {
    if (!(container instanceof Element)) {
      return;
    }
    const renderedBatchCards = getRenderedFeedBatchCards(container, startIndex, endIndex);
    primeRenderedFeedBatchCards(renderedBatchCards);
    bindRenderedFeedBatchCards(renderedBatchCards);
    scheduleViewportReadyFeedSweep(container, {
      limit: 12
    });
    const batchScope = renderedBatchCards.length === 1 ? renderedBatchCards[0] : container;
    prioritizeVisibleFeedMedia(batchScope, renderedBatchCards.length ? Math.min(10, renderedBatchCards.length * 2) : 10);
    activateViewportReadyFeedImages(batchScope, {
      limit: 12
    });
    scheduleIdleBackgroundWork(() => {
      if (renderedBatchCards.length) {
        renderedBatchCards.forEach((card) => {
          enhanceShowcaseTracks(card);
          bindProductEngagementSignals(card);
          bindProductMenus(card);
        });
        return;
      }
      enhanceShowcaseTracks(container);
      bindProductEngagementSignals(container);
      bindProductMenus(container);
    }, 220);
  },
  onFeedRenderBatch: ({ currentView: renderedView, products: renderedProducts }) => {
    if (renderedView !== "home" || !Array.isArray(renderedProducts) || !renderedProducts.length) {
      return;
    }
    scheduleIdleBackgroundWork(() => {
      persistFeedBootstrapSnapshot(renderedProducts, "home_render");
      schedulePredictiveFeedPrefetch("render");
    }, 900);
  }
});

createDetailContinuationFeedStackElement = createProductCardStackElement;

function renderReviewButton(product) {
  if (!canCurrentUserReviewProduct(product)) {
    return "";
  }
  return `<button class="action-btn edit-btn" type="button" data-review-product="${product.id}">Rate & Review</button>`;
}

function getRenderedFeedBatchCards(container, startIndex = 0, endIndex = 0) {
  if (!(container instanceof Element)) {
    return [];
  }
  const allCards = Array.from(
    container.querySelectorAll(".product-card[data-open-product], .seller-product-card[data-open-product]")
  );
  if (!allCards.length) {
    return [];
  }
  const normalizedStartIndex = Math.max(0, Number(startIndex || 0) || 0);
  const normalizedEndIndex = Math.max(normalizedStartIndex, Number(endIndex || 0) || 0);
  const scopedCards = allCards.slice(normalizedStartIndex, normalizedEndIndex);
  if (scopedCards.length) {
    return scopedCards;
  }
  const fallbackBatchSize = Math.max(1, normalizedEndIndex - normalizedStartIndex || Math.min(6, allCards.length));
  return allCards.slice(-fallbackBatchSize);
}

function primeRenderedFeedBatchCards(cards = []) {
  const safeCards = Array.isArray(cards) ? cards.filter((card) => card instanceof Element) : [];
  if (!safeCards.length) {
    return;
  }
  safeCards.slice(0, Math.min(6, safeCards.length)).forEach((card, cardIndex) => {
    card.querySelectorAll("img[data-marketplace-scroll-image='true']").forEach((image, imageIndex) => {
      if (!(image instanceof HTMLImageElement)) {
        return;
      }
      const prioritizeImage = imageIndex === 0 && cardIndex < 4;
      image.setAttribute("loading", prioritizeImage ? "eager" : "lazy");
      image.setAttribute("fetchpriority", prioritizeImage ? "high" : "auto");
      activateMarketplaceScrollImage(image, {
        priority: prioritizeImage,
        shouldSetPending: true
      });
    });
    if (cardIndex < 4) {
      const revealWindow = getAdaptiveMarketplaceCardRevealWindow();
      scheduleMarketplaceCardMediaReveal(card, {
        maxWaitMs: revealWindow.maxWaitMs,
        pollMs: revealWindow.pollMs,
        requireLoaded: true
      });
    }
  });
}

function bindRenderedFeedBatchCards(cards = []) {
  const safeCards = Array.isArray(cards) ? cards.filter((card) => card instanceof Element) : [];
  if (!safeCards.length) {
    return;
  }
  safeCards.forEach((card) => {
    bindFeedGalleryInteractions(card);
    bindImageFallbacks(card);
  });
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
  const normalizedFitMode = String(product.fitMode || "").trim().toLowerCase() === "contain"
    ? "contain"
    : "cover";

  return {
    ...product,
    id: product.id || createId(),
    price: normalizeOptionalPrice(product.price),
    category: product.category || detectCategory(product.name || ""),
    status: product.status || "approved",
    availability: product.availability === "sold_out"
      ? "sold_out"
      : product.availability === "reserved"
        ? "reserved"
        : "available",
    moderationNote: product.moderationNote || "",
    createdAt: product.createdAt || "",
    updatedAt: product.updatedAt || "",
    imageSignature: typeof product.imageSignature === "string" ? product.imageSignature : "",
    fitMode: normalizedFitMode,
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

function collectOptionalFeedImageCandidates(product) {
  return collectFeedImageLoaderCandidates(product);
}

const brokenMarketplaceImagesByProduct = new Map();
const BROKEN_IMAGE_FAILURE_THRESHOLD = 2;
const BROKEN_IMAGE_SUPPRESS_MS = 5 * 60 * 1000;
const MAX_ACTIVE_HOME_CONTINUOUS_SECTIONS = 2;
const MAX_HOME_CONTINUOUS_USED_IDS = 96;
const HOME_CONTINUOUS_DISCOVERY_MIN_INTERVAL_MS = 80;
const HOME_CONTINUOUS_DISCOVERY_REOBSERVE_DELAY_MS = 60;
const MARKETPLACE_SCROLL_IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
let marketplaceScrollImageObserver = null;

function getMarketplaceScrollImagePrefetchMargin() {
  const compactLayout = getViewportWidth() <= 720;
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return compactLayout ? 1320 : 1680;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return compactLayout ? 1120 : 1440;
  }
  return compactLayout ? 920 : 1160;
}

function getMarketplaceScrollImageActivationMargin() {
  const compactLayout = getViewportWidth() <= 720;
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return compactLayout ? 420 : 520;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return compactLayout ? 500 : 580;
  }
  return compactLayout ? 620 : 700;
}

function getMarketplaceScrollImageRootMargin() {
  const margin = getMarketplaceScrollImagePrefetchMargin();
  return `${margin}px 0px ${margin}px 0px`;
}

function getAdaptiveImagePrefetchDelayMs() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  const compactLayout = getViewportWidth() <= 720;
  if (scrollSpeed <= 0.18) {
    return compactLayout ? 60 : 120;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return compactLayout ? 160 : 260;
  }
  return compactLayout ? 260 : 420;
}

function getAdaptiveViewportImageSweepLimit() {
  const compactLayout = getViewportWidth() <= 720;
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (compactLayout) {
    if (scrollSpeed <= 0.18) {
      return 22;
    }
    if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
      return 20;
    }
    return 18;
  }
  if (scrollSpeed <= 0.18) {
    return 16;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return 14;
  }
  return 12;
}

function getAdaptiveMarketplaceCardRevealWindow() {
  const compactLayout = getViewportWidth() <= 720;
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (compactLayout) {
    if (scrollSpeed <= 0.18) {
      return { maxWaitMs: 220, pollMs: 40 };
    }
    if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
      return { maxWaitMs: 250, pollMs: 45 };
    }
    return { maxWaitMs: 200, pollMs: 35 };
  }
  if (scrollSpeed <= 0.18) {
    return { maxWaitMs: 240, pollMs: 45 };
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return {
      maxWaitMs: CONTINUATION_MEDIA_REVEAL_MAX_WAIT_MS,
      pollMs: CONTINUATION_MEDIA_REVEAL_POLL_MS
    };
  }
  return { maxWaitMs: 210, pollMs: 40 };
}

function getProductImageCandidates(product) {
  return getFeedImageLoaderCandidates(product);
}

function normalizeBlockedDemoIdentifier(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBlockedDemoProduct(product) {
  if (!product || typeof product !== "object") {
    return false;
  }
  return [
    product.name,
    product.shop,
    product.uploadedBy,
    product.whatsapp
  ]
    .map(normalizeBlockedDemoIdentifier)
    .some((value) => BLOCKED_DEMO_PRODUCT_IDENTIFIERS.has(value));
}

function sanitizeVisibleProducts(productsList = []) {
  return (Array.isArray(productsList) ? productsList : []).filter((product) => !isBlockedDemoProduct(product));
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
  const images = getFeedRenderableImages(product);
  if (!images.length) {
    return [];
  }
  // Keep the card/media visible everywhere. Broken image telemetry still drives
  // fallback handling, but it should not remove products from discovery/detail.
  return images;
}

function hasRenderableMarketplaceImage(product, options = {}) {
  return getRenderableMarketplaceImages(product, options).length > 0;
}

function getMarketplacePrimaryImage(product, options = {}) {
  return getRenderableMarketplaceImages(product, options)[0] || "";
}

function normalizeProductFitMode(value) {
  return String(value || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
}

function getProductFitMode(product) {
  return normalizeProductFitMode(product?.fitMode);
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
  if (shouldHide) {
    marketplaceScrollImagePrefetchedSources.delete(normalizedSource);
    for (let index = marketplaceScrollPrefetchQueue.length - 1; index >= 0; index -= 1) {
      if (marketplaceScrollPrefetchQueue[index]?.src === normalizedSource) {
        marketplaceScrollPrefetchQueue.splice(index, 1);
      }
    }
    const inflightEntry = marketplaceScrollPrefetchInflight.get(normalizedSource);
    if (inflightEntry?.image instanceof Image) {
      inflightEntry.image.onload = null;
      inflightEntry.image.onerror = null;
      inflightEntry.image.src = "";
    }
    marketplaceScrollPrefetchInflight.delete(normalizedSource);
  }
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

const DEFAULT_PRODUCTS = [];

let products = [];
let productIndex = new Map();

let isLogin = true;
let isPasswordRecovery = false;
let selectedAuthRole = "seller";
let currentUser = "";
let selectedCategory = "all";
let expandedBrowseCategory = "";
let currentView = "home";
let homeFeedRefreshCursor = 0;
let publicAuthRequestPending = false;
let publicAuthTransitionPending = false;
let postAuthProductRefreshToken = 0;
let adminAuthRequestPending = false;
let sellerIdentityPreparedSignature = "";
let sellerIdentityPreparedDataUrl = "";
let sellerIdentityPreparedPromise = null;
let isHandlingSessionInvalidation = false;
let editingProductId = null;
let authSignupStep = 1;
let currentSession = null;
let pendingGuestIntent = null;
let pendingDeepLinkProductId = "";
let suppressInitialProductHomeRender = false;
let isSessionRestorePending = false;
let activeSessionRestoreToken = 0;
let deepLinkLoadingOverlay = null;
let deepLinkRecoveryTimer = null;
let lifecycleFallbackTimer = null;
let lifecycleRetryTimer = null;
let lifecycleFallbackActive = false;
let lifecycleFallbackReason = "";
let publicAuthSlowTimer = null;
let productHydrationStatus = "idle";
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
const bootOverlay = document.getElementById("boot-overlay");
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
let headerInstallButton = document.getElementById("header-install-button");
let authInstallButton = document.getElementById("auth-install-button");
const publicFooter = document.getElementById("public-footer");
const heroPanel = document.getElementById("hero-panel");
const marketShowcase = document.getElementById("market-showcase");
const showcaseTrack = document.getElementById("showcase-track");
const productsContainer = document.getElementById("products-container");
const productsSummary = document.getElementById("products-summary");
const uploadForm = document.getElementById("upload-form");
const uploadTitle = document.getElementById("upload-title");
const cancelEditButton = document.getElementById("cancel-edit-button");
const emptyState = document.getElementById("empty-state");
const feedLoadingState = document.getElementById("feed-loading-state");
const feedLoadingRetryButton = document.getElementById("feed-loading-retry-button");
const analyticsPanel = document.getElementById("analytics-panel");
const adminPanel = document.getElementById("admin-panel");

const productNameInput = document.getElementById("product-name");
const productPriceInput = document.getElementById("product-price");
const productShopInput = document.getElementById("product-shop");
const productWhatsappInput = document.getElementById("product-whatsapp");
const productCategoryTopInput = document.getElementById("product-category-top");
const productCategoryInput = document.getElementById("product-category");
const productFitModeInputs = document.querySelectorAll('input[name="product-fit-mode"]');
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
let SHOW_HOMEPAGE_HERO_PANEL = false;
let SHOW_STANDALONE_SHOWCASE_SECTION = false;
const HOME_HORIZONTAL_ROWS_ENABLED = false;
const runtimeAppSettings = {
  heroSectionVisible: false,
  standaloneShowcaseVisible: false,
  splashScreenVisible: true,
  sessionExpiryMinutes: 120,
  cachePolicy: "balanced",
  requireExplicitSignOut: true,
  messageReviewRequiresReason: true
};

function normalizeRuntimeAppSettings(settings = {}) {
  return {
    heroSectionVisible: typeof settings.heroSectionVisible === "boolean" ? settings.heroSectionVisible : false,
    standaloneShowcaseVisible: typeof settings.standaloneShowcaseVisible === "boolean" ? settings.standaloneShowcaseVisible : false,
    splashScreenVisible: typeof settings.splashScreenVisible === "boolean" ? settings.splashScreenVisible : true,
    sessionExpiryMinutes: Number.isFinite(Number(settings.sessionExpiryMinutes)) ? Math.max(15, Math.min(1440, Number(settings.sessionExpiryMinutes))) : 120,
    cachePolicy: ["balanced", "cache-first", "network-first"].includes(String(settings.cachePolicy || "").trim().toLowerCase())
      ? String(settings.cachePolicy || "").trim().toLowerCase()
      : "balanced",
    requireExplicitSignOut: settings.requireExplicitSignOut !== false,
    messageReviewRequiresReason: settings.messageReviewRequiresReason !== false,
    updatedAt: String(settings.updatedAt || "").trim(),
    updatedBy: String(settings.updatedBy || "").trim()
  };
}

function getSelectedProductFitMode() {
  const selectedInput = Array.from(productFitModeInputs || []).find((input) => input.checked);
  return normalizeProductFitMode(selectedInput?.value);
}

function setSelectedProductFitMode(fitMode = "cover") {
  const normalizedFitMode = normalizeProductFitMode(fitMode);
  Array.from(productFitModeInputs || []).forEach((input) => {
    input.checked = input.value === normalizedFitMode;
    input.setAttribute("aria-pressed", String(input.checked));
  });
}

function applyAppSettings(settings = {}) {
  const nextSettings = normalizeRuntimeAppSettings(settings);
  Object.assign(runtimeAppSettings, nextSettings);
  SHOW_HOMEPAGE_HERO_PANEL = Boolean(nextSettings.heroSectionVisible);
  SHOW_STANDALONE_SHOWCASE_SECTION = Boolean(nextSettings.standaloneShowcaseVisible);
  window.WingaRuntimeSettings = { ...runtimeAppSettings };
  if (typeof refreshPublicEntryChrome === "function") {
    refreshPublicEntryChrome();
  }
}

if (searchInput) {
  searchInput.setAttribute("autocomplete", "off");
  searchInput.setAttribute("autocapitalize", "off");
  searchInput.setAttribute("spellcheck", "false");
  searchInput.defaultValue = "";
}

let profileDiv = null;
const runtimeState = createRuntimeState();
const uiRuntimeState = runtimeState.ui;
const feedRuntimeState = runtimeState.feed || (runtimeState.feed = {});
const searchRuntimeState = runtimeState.search;
const profileRuntimeState = runtimeState.profile;
const lifecycleRuntimeState = runtimeState.lifecycle || (runtimeState.lifecycle = {});
const runtimeDiagnostics = uiRuntimeState.runtimeDiagnostics || (uiRuntimeState.runtimeDiagnostics = {
  renderCurrentViewCalls: 0,
  renderCurrentViewSlowCount: 0,
  renderCurrentViewErrorCount: 0,
  galleryBindCalls: 0,
  galleryInitCount: 0,
  galleryDisposeCount: 0,
  marketplaceImageBindCalls: 0,
  marketplaceImageObservedCount: 0,
  productEngagementBindCalls: 0,
  productEngagementObservedCount: 0,
  productMenuBindCalls: 0,
  continuousPendingMediaDeferrals: 0,
  continuousBatchAdmissionCount: 0,
  continuousBatchAdmissionWaitMs: 0,
  brokenImageSuppressedPrefetchCount: 0,
  preparedDescriptorSkipCount: 0,
  productDetailTransitionPrimeCount: 0,
  productDetailTransitionImageCount: 0,
  adaptiveEarlyLoadEvaluations: 0,
  retainedHomeResumeCount: 0,
  lifecycleFallbackShellCount: 0,
  memoryPressureWarningCount: 0,
  memoryMitigationCount: 0,
  feedImageLoadSlowCount: 0,
  lastSnapshotAt: 0,
  showcaseEvents: []
});
const runtimeMetricWindows = uiRuntimeState.runtimeMetricWindows || (uiRuntimeState.runtimeMetricWindows = {
  feedImageLoadLatencyMs: [],
  renderCurrentViewSlowMs: [],
  continuousBatchAdmissionWaitMs: [],
  heapUsedMB: []
});

function bumpRuntimeDiagnostic(metric, amount = 1) {
  const safeMetric = String(metric || "").trim();
  if (!safeMetric) {
    return 0;
  }
  const nextValue = Number(runtimeDiagnostics[safeMetric] || 0) + Number(amount || 0);
  runtimeDiagnostics[safeMetric] = nextValue;
  runtimeDiagnostics.lastSnapshotAt = Date.now();
  return nextValue;
}

function recordRuntimeMetricWindow(metric, value) {
  const safeMetric = String(metric || "").trim();
  const numericValue = Number(value);
  if (!safeMetric || !Number.isFinite(numericValue)) {
    return [];
  }
  const windowValues = Array.isArray(runtimeMetricWindows[safeMetric])
    ? runtimeMetricWindows[safeMetric]
    : (runtimeMetricWindows[safeMetric] = []);
  windowValues.push(Math.round(numericValue));
  while (windowValues.length > RUNTIME_METRIC_WINDOW_LIMIT) {
    windowValues.shift();
  }
  return windowValues;
}

function summarizeRuntimeMetricWindow(metric) {
  const values = Array.isArray(runtimeMetricWindows?.[metric])
    ? runtimeMetricWindows[metric].filter((value) => Number.isFinite(Number(value)))
    : [];
  if (!values.length) {
    return {
      count: 0,
      average: 0,
      max: 0,
      latest: 0
    };
  }
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    count: values.length,
    average: Math.round(total / values.length),
    max: Math.max(...values),
    latest: Number(values[values.length - 1] || 0)
  };
}

function getRuntimeHealthSnapshot() {
  const imageLoad = summarizeRuntimeMetricWindow("feedImageLoadLatencyMs");
  const renderSlow = summarizeRuntimeMetricWindow("renderCurrentViewSlowMs");
  const admission = summarizeRuntimeMetricWindow("continuousBatchAdmissionWaitMs");
  const heap = summarizeRuntimeMetricWindow("heapUsedMB");
  return {
    imageLoad,
    renderSlow,
    admission,
    heap,
    underMemoryPressure: Number(uiRuntimeState.memoryPressureCount || 0) > 0,
    prefetchQueuePressure: Number(marketplaceScrollPrefetchQueue?.length || 0) >= MARKETPLACE_PREFETCH_QUEUE_PRESSURE_THRESHOLD,
    pendingMediaPressure: getCurrentPendingContinuationMediaCount(document) >= HOME_CONTINUOUS_HARD_PRESSURE_PENDING_MEDIA
  };
}

function collectShowcaseRowDiagnostics() {
  const rows = Array.from(document.querySelectorAll?.(".showcase-inline") || []);
  return rows.map((row, index) => {
    const headingNode = row.querySelector(".section-heading h2, .section-heading strong, .section-heading-title, h2");
    const track = row.querySelector(".showcase-track");
    const cards = Array.from(track?.querySelectorAll?.(".showcase-card") || []);
    const images = cards.map((card) => {
      const image = card.querySelector(".feed-gallery-image-social, .showcase-preview-image, img");
      return {
        productId: String(card.dataset.showcaseId || card.dataset.openProduct || "").trim(),
        hasImageNode: Boolean(image),
        currentSrc: String(image?.currentSrc || image?.src || "").trim(),
        complete: Boolean(image?.complete),
        naturalWidth: Number(image?.naturalWidth || 0),
        naturalHeight: Number(image?.naturalHeight || 0)
      };
    });
    return {
      index,
      heading: String(headingNode?.textContent || "").trim(),
      recommendationType: String(row.getAttribute("data-recommendation-type") || "").trim(),
      continuousKey: String(row.getAttribute("data-continuous-discovery-section") || "").trim(),
      dynamicPlaceholder: String(row.getAttribute("data-dynamic-showcase-placeholder") || "").trim(),
      cardCount: cards.length,
      loadedImageCount: images.filter((item) => item.hasImageNode && item.complete && item.naturalWidth > 0 && item.naturalHeight > 0).length,
      missingImageCount: images.filter((item) => !item.currentSrc || item.naturalWidth < 1 || item.naturalHeight < 1).length,
      images: images.slice(0, 8)
    };
  });
}

function collectVisibleHomeImageDiagnostics(limit = 8) {
  const images = Array.from(
    productsContainer?.querySelectorAll?.(".product-card img[data-marketplace-scroll-image='true'], .seller-product-card img[data-marketplace-scroll-image='true']") || []
  );
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  return images
    .filter((image) => {
      if (!(image instanceof HTMLImageElement)) {
        return false;
      }
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < viewportHeight;
    })
    .slice(0, Math.max(1, Number(limit || 8)))
    .map((image, index) => {
      const shell = image.closest(".progressive-image-shell");
      const beforeStyle = shell ? window.getComputedStyle(shell, "::before") : null;
      const imageStyle = window.getComputedStyle(image);
      return {
        index,
        productId: String(image.dataset.imageActionProduct || image.closest("[data-open-product]")?.dataset?.openProduct || "").trim(),
        src: String(image.currentSrc || image.getAttribute("src") || "").slice(0, 180),
        realSrc: String(image.dataset.marketplaceRealSrc || image.dataset.progressiveRealSrc || image.dataset.imageActionSrc || "").slice(0, 180),
        complete: Boolean(image.complete),
        naturalWidth: Number(image.naturalWidth || 0),
        naturalHeight: Number(image.naturalHeight || 0),
        imageOpacity: imageStyle?.opacity || "",
        imageFilter: imageStyle?.filter || "",
        shellClass: shell?.className || "",
        shellBeforeOpacity: beforeStyle?.opacity || "",
        shellBeforeFilter: beforeStyle?.filter || "",
        shellBeforeBackground: beforeStyle?.backgroundImage || beforeStyle?.backgroundColor || "",
        marketplaceState: String(image.dataset.marketplaceImageState || "")
      };
    });
}

function getRuntimeDiagnosticsSnapshot() {
  return {
    ...runtimeDiagnostics,
    activeGalleryBindings: document.querySelectorAll?.("[data-feed-gallery-carousel][data-feed-gallery-bound='true'], [data-feed-gallery-carousel].bound").length || document.querySelectorAll?.("[data-feed-gallery-carousel]").length || 0,
    activeMarketplaceImages: document.querySelectorAll?.("img[data-marketplace-scroll-image='true'][data-marketplace-scroll-bound='true']").length || 0,
    activeEngagementCards: document.querySelectorAll?.(".product-card[data-open-product][data-engagement-bound='true'], .seller-product-card[data-open-product][data-engagement-bound='true'], .showcase-card[data-open-product][data-engagement-bound='true']").length || 0,
    trackedEngagementStates: productCardEngagementState?.size || 0,
    decodedFeedImageCacheSize: decodedFeedImageCache?.size || 0,
    imagePreloadRegistrySize: imagePreloadRegistry?.size || 0,
    imagePrefetchRegistrySize: marketplaceScrollImagePrefetchedSources?.size || 0,
    imagePrefetchQueueSize: marketplaceScrollPrefetchQueue?.length || 0,
    imagePrefetchInflightSize: marketplaceScrollPrefetchInflight?.size || 0,
    continuousBatchIndex: Number(homeContinuousDiscoveryRuntime.batchIndex || 0),
    continuousPreparedBatchIndex: Number(homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex || -1),
    continuousPreparingDescriptor: Boolean(homeContinuousDiscoveryRuntime.preparingDescriptor),
    continuousPendingDescriptorCount: Array.isArray(homeContinuousDiscoveryRuntime.pendingDescriptors) ? homeContinuousDiscoveryRuntime.pendingDescriptors.length : 0,
    metricWindows: {
      feedImageLoadLatencyMs: summarizeRuntimeMetricWindow("feedImageLoadLatencyMs"),
      renderCurrentViewSlowMs: summarizeRuntimeMetricWindow("renderCurrentViewSlowMs"),
      continuousBatchAdmissionWaitMs: summarizeRuntimeMetricWindow("continuousBatchAdmissionWaitMs"),
      heapUsedMB: summarizeRuntimeMetricWindow("heapUsedMB")
    },
    health: getRuntimeHealthSnapshot(),
    showcaseEvents: Array.isArray(runtimeDiagnostics.showcaseEvents) ? runtimeDiagnostics.showcaseEvents.slice(-12) : [],
    showcaseRows: collectShowcaseRowDiagnostics(),
    visibleHomeImages: collectVisibleHomeImageDiagnostics(),
    currentView,
    timestamp: Date.now()
  };
}

function reportShowcaseInstrumentation(eventName, payload = {}) {
  const safeEvent = String(eventName || "").trim();
  if (!safeEvent) {
    return;
  }
  const entry = {
    event: safeEvent,
    payload: payload && typeof payload === "object" ? { ...payload } : {},
    view: currentView,
    at: Date.now()
  };
  const showcaseEvents = Array.isArray(runtimeDiagnostics.showcaseEvents)
    ? runtimeDiagnostics.showcaseEvents
    : (runtimeDiagnostics.showcaseEvents = []);
  showcaseEvents.push(entry);
  while (showcaseEvents.length > 40) {
    showcaseEvents.shift();
  }
  runtimeDiagnostics.lastSnapshotAt = Date.now();
  if (shouldReportShowcaseRuntime(safeEvent, entry.payload)) {
    reportClientEvent("info", "showcase_runtime", `Showcase event: ${safeEvent}`, {
      category: "marketplace",
      event: safeEvent,
      ...entry.payload
    });
  }
}

window.__WINGA_DIAGNOSTICS__ = {
  snapshot: getRuntimeDiagnosticsSnapshot,
  health: getRuntimeHealthSnapshot,
  showcase: collectShowcaseRowDiagnostics,
  reset() {
    Object.keys(runtimeDiagnostics).forEach((key) => {
      if (key === "showcaseEvents") {
        runtimeDiagnostics[key] = [];
        return;
      }
      if (key === "lastSnapshotAt") {
        runtimeDiagnostics[key] = Date.now();
        return;
      }
      runtimeDiagnostics[key] = 0;
    });
    Object.keys(runtimeMetricWindows).forEach((key) => {
      runtimeMetricWindows[key] = [];
    });
  }
};

function collectDuplicateEntries(items = [], keySelector) {
  const counts = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = String(typeof keySelector === "function" ? keySelector(item) : "").trim();
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function auditHydratedDataIntegrity(reason = "runtime_audit") {
  if (!shouldRunDataIntegrityAudit(reason)) {
    return runtimeAuditState.lastResult || {
      productsCount: 0,
      usersCount: 0,
      duplicateProductIds: [],
      duplicateUsernames: []
    };
  }
  const productList = Array.isArray(window.WingaDataLayer?.getProducts?.()) ? window.WingaDataLayer.getProducts() : [];
  const userList = Array.isArray(window.WingaDataLayer?.getUsers?.()) ? window.WingaDataLayer.getUsers() : [];
  const duplicateProductIds = collectDuplicateEntries(productList, (item) => item?.id);
  const duplicateUsernames = collectDuplicateEntries(userList, (item) => item?.username);
  const result = {
    productsCount: productList.length,
    usersCount: userList.length,
    duplicateProductIds,
    duplicateUsernames
  };
  runtimeAuditState.completed = true;
  runtimeAuditState.lastRunAt = Date.now();
  runtimeAuditState.lastReason = String(reason || "");
  runtimeAuditState.lastResult = result;
  reportClientEvent(duplicateProductIds.length || duplicateUsernames.length ? "warn" : "info", "data_integrity_audit", "Hydrated data integrity audit completed.", {
    category: "runtime",
    reason,
    productsCount: productList.length,
    usersCount: userList.length,
    duplicateProductIds: duplicateProductIds.slice(0, 6),
    duplicateUsernames: duplicateUsernames.slice(0, 6)
  });
  return result;
}

function reportBootPhase(phase, context = {}) {
  reportClientEvent("info", "boot_phase", `Boot phase: ${phase}`, {
    category: "runtime",
    phase,
    ...context
  });
}
let availableCategories = [...DEFAULT_PRODUCT_CATEGORIES];
let availableTopCategories = [...DEFAULT_TOP_CATEGORIES];
let currentOrders = { purchases: [], sales: [] };
let currentMessages = [];
let currentNotifications = [];
let currentPromotions = [];
let realtimeChannel = null;
const notificationFeedbackState = {
  recentKeys: new Map(),
  lastVibrationAt: 0
};

const appUpdateBannerState = {
  registration: null,
  visibleVersion: "",
  waitingToReload: false,
  controllerChangeBound: false
};

const appInstallState = {
  deferredPrompt: null,
  installed: false,
  initialized: false,
  menuHintVisible: false
};
function createDefaultNotificationPermissionState() {
  return {
    status: "not_asked",
    lastTrigger: "",
    lastPromptAt: 0,
    lastDecisionAt: 0
  };
}

function normalizeNotificationPermissionStatus(value) {
  return ["not_asked", "prompted", "dismissed", "allowed", "denied"].includes(value)
    ? value
    : "not_asked";
}

function readNotificationPermissionState() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PERMISSION_STATE_KEY);
    if (!raw) {
      return createDefaultNotificationPermissionState();
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createDefaultNotificationPermissionState();
    }
    return {
      ...createDefaultNotificationPermissionState(),
      ...parsed,
      status: normalizeNotificationPermissionStatus(parsed.status)
    };
  } catch (error) {
    return createDefaultNotificationPermissionState();
  }
}

let notificationPermissionState = readNotificationPermissionState();

function persistNotificationPermissionState() {
  try {
    localStorage.setItem(NOTIFICATION_PERMISSION_STATE_KEY, JSON.stringify(notificationPermissionState));
  } catch (error) {
    reportClientEvent("warn", "notification_permission_state_persist_failed", "Unable to persist notification permission state.", {
      category: "runtime"
    });
  }
}

function updateNotificationPermissionState(nextState = {}) {
  notificationPermissionState = {
    ...notificationPermissionState,
    ...nextState,
    status: normalizeNotificationPermissionStatus(nextState.status ?? notificationPermissionState.status)
  };
  persistNotificationPermissionState();
  return notificationPermissionState;
}

function syncNotificationPermissionStateFromBrowser() {
  if (!("Notification" in window)) {
    return notificationPermissionState;
  }
  if (Notification.permission === "granted") {
    return updateNotificationPermissionState({
      status: "allowed",
      lastDecisionAt: Date.now()
    });
  }
  if (Notification.permission === "denied") {
    return updateNotificationPermissionState({
      status: "denied",
      lastDecisionAt: Date.now()
    });
  }
  return notificationPermissionState;
}

function getNotificationPermissionState() {
  return {
    ...syncNotificationPermissionStateFromBrowser()
  };
}

function getNotificationPermissionStatusLabel(state = notificationPermissionState) {
  const browserPermission = "Notification" in window ? Notification.permission : "unsupported";
  if (browserPermission === "granted" || state.status === "allowed") {
    return "Enabled";
  }
  if (browserPermission === "denied" || state.status === "denied") {
    return "Blocked";
  }
  if (state.status === "dismissed") {
    return "Paused";
  }
  if (browserPermission === "unsupported") {
    return "Unsupported";
  }
  return "Not enabled";
}

function shouldShowNotificationPermissionPrompt(trigger = "", { allowDenied = false } = {}) {
  if (!("Notification" in window)) {
    return false;
  }
  const state = syncNotificationPermissionStateFromBrowser();
  if (Notification.permission === "granted" || state.status === "allowed") {
    return false;
  }
  if (!allowDenied && (Notification.permission === "denied" || state.status === "denied")) {
    return false;
  }
  if (!NOTIFICATION_PERMISSION_TRIGGERS.has(String(trigger || "").trim()) && trigger !== "settings") {
    return false;
  }
  if (!allowDenied && state.status === "dismissed") {
    return false;
  }
  if (!allowDenied && state.status === "prompted") {
    return false;
  }
  if (!allowDenied && state.lastPromptAt && Date.now() - Number(state.lastPromptAt || 0) < NOTIFICATION_PERMISSION_PROMPT_COOLDOWN_MS) {
    return false;
  }
  return true;
}

function ensureNotificationPermissionPromptRoot() {
  let root = document.getElementById("notification-permission-root");
  if (!root) {
    root = createElement("div", {
      attributes: { id: "notification-permission-root" },
      className: "notification-permission-root"
    });
    document.body.appendChild(root);
  }
  return root;
}

function closeNotificationPermissionPrompt() {
  const root = document.getElementById("notification-permission-root");
  if (!root) {
    return;
  }
  root.replaceChildren();
  root.dataset.visible = "false";
}

async function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  if (typeof Notification.requestPermission !== "function") {
    return Notification.permission;
  }
  const result = await Notification.requestPermission();
  return String(result || Notification.permission || "default");
}

function renderNotificationPermissionPromptBody(trigger = "", options = {}) {
  const hasBlockedPermission = "Notification" in window && Notification.permission === "denied";
  const body = options.body || (
    hasBlockedPermission
      ? "Browser yako tayari imezima notifications. Unaweza kujaribu tena au kuruhusu notifications kupitia browser settings."
      : "Turn on notifications so you do not miss new messages, order updates, and important activity."
  );
  const title = options.title || "Stay updated with Winga";
  return { title, body };
}

function showNotificationPermissionPrompt(trigger = "message", options = {}) {
  const allowDenied = Boolean(options.allowDenied);
  if (!shouldShowNotificationPermissionPrompt(trigger, { allowDenied })) {
    return false;
  }

  const root = ensureNotificationPermissionPromptRoot();
  if (root.dataset.visible === "true") {
    return true;
  }

  const { title, body } = renderNotificationPermissionPromptBody(trigger, options);
  const state = updateNotificationPermissionState({
    status: "prompted",
    lastTrigger: String(trigger || ""),
    lastPromptAt: Date.now()
  });
  const statusLabel = getNotificationPermissionStatusLabel(state);
  const canRequestNow = "Notification" in window && Notification.permission !== "granted";
  const buttonLabel = Notification.permission === "denied"
    ? "Open browser settings"
    : Notification.permission === "granted"
      ? "Notifications enabled"
      : "Enable notifications";

  const prompt = createElement("section", {
    className: "notification-permission-prompt",
    attributes: {
      role: "dialog",
      "aria-live": "polite",
      "aria-label": title
    }
  });
  const metaRow = createElement("div", { className: "notification-permission-meta" });
  metaRow.append(
    createElement("span", { className: "status-pill", textContent: statusLabel }),
    createElement("span", { className: "notification-permission-note", textContent: "You can change this later in Profile." })
  );
  const actionsRow = createElement("div", { className: "notification-permission-actions" });
  actionsRow.append(
    createElement("button", {
      className: "action-btn buy-btn",
      textContent: buttonLabel,
      attributes: {
        type: "button",
        "data-notification-permission-enable": "true"
      }
    }),
    createElement("button", {
      className: "action-btn action-btn-secondary",
      textContent: "Maybe later",
      attributes: {
        type: "button",
        "data-notification-permission-later": "true"
      }
    })
  );
  prompt.append(
    createElement("p", { className: "notification-permission-eyebrow", textContent: "Notifications" }),
    createElement("strong", { textContent: title }),
    createElement("p", { className: "notification-permission-copy", textContent: body }),
    metaRow,
    actionsRow
  );

  root.replaceChildren(prompt);
  root.dataset.visible = "true";
  root.dataset.trigger = String(trigger || "");

  root.querySelector("[data-notification-permission-enable]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canRequestNow && Notification.permission !== "denied") {
      closeNotificationPermissionPrompt();
      return;
    }
    try {
      const permission = await requestBrowserNotificationPermission();
      if (permission === "granted") {
        updateNotificationPermissionState({
          status: "allowed",
          lastDecisionAt: Date.now()
        });
        showInAppNotification({
          title: "Notifications enabled",
          body: "Winga itakutumia updates za messages, orders, na activity muhimu.",
          variant: "success"
        });
        closeNotificationPermissionPrompt();
        renderCurrentView();
        return;
      }
      updateNotificationPermissionState({
        status: permission === "denied" ? "denied" : "dismissed",
        lastDecisionAt: Date.now()
      });
      showInAppNotification({
        title: "Notifications off",
        body: permission === "denied"
          ? "Browser imezima notifications. Unaweza kuzi-enable tena kwenye browser settings."
          : "Umeacha notifications kwa sasa. Unaweza kuziwasha tena baadaye.",
        variant: "info"
      });
      closeNotificationPermissionPrompt();
      renderCurrentView();
    } catch (error) {
      closeNotificationPermissionPrompt();
      showInAppNotification({
        title: "Notifications unavailable",
        body: error.message || "Imeshindikana kuomba notifications kwa sasa.",
        variant: "warning"
      });
    }
  });

  root.querySelector("[data-notification-permission-later]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    updateNotificationPermissionState({
      status: "dismissed",
      lastDecisionAt: Date.now()
    });
    closeNotificationPermissionPrompt();
    showInAppNotification({
      title: "Maybe later",
      body: "Hatutakusumbua sasa. Unaweza kuziwasha from Profile later.",
      variant: "info"
    });
    renderCurrentView();
  });

  return true;
}

function openNotificationPermissionPrompt(trigger = "settings", options = {}) {
  return showNotificationPermissionPrompt(trigger, {
    ...options,
    allowDenied: true
  });
}

function maybePromptNotificationPermission(trigger = "message", options = {}) {
  if (!shouldShowNotificationPermissionPrompt(trigger, { allowDenied: false })) {
    return false;
  }
  return showNotificationPermissionPrompt(trigger, options);
}

const savedProductState = {
  storageKey: "",
  ids: new Set(),
  longPressTimer: 0,
  suppressClickUntil: 0,
  activeSheetProductId: "",
  activeSheetSource: ""
};
const savedProductMetaState = {
  storageKey: "",
  entries: {}
};
const savedProductNotificationState = {
  storageKey: "",
  readIds: new Set()
};
const followedSellerState = {
  storageKey: "",
  ids: new Set()
};
const followedSellerNotificationState = {
  storageKey: "",
  readIds: new Set()
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
const productUploadDraftRuntimeState = {
  preparedImages: [],
  saveTimer: 0,
  lastSavedAt: 0,
  restoredKey: ""
};
let currentReviews = [];
let reviewSummaries = {};
let lastViewedProductId = "";
let recentlyViewedProductIds = [];
let productDiscoveryTrail = [];
let productSeenTimestamps = {};
let productVariationSignalState = {};
let pinnedDesktopCategory = "";
let buyerSellerAffinity = {};
let productEngagementObserver = null;
const productCardEngagementState = new WeakMap();
let recentCategorySelections = [];
let recentSearchTerms = [];
let recentMessagedProductIds = [];
let sharedCollectionIntentEntries = [];
let homeContinuousDiscoveryRuntime = {
  observer: null,
  sentinelObserver: null,
  virtualObserver: null,
  sentinelTargets: [],
  batchIndex: 0,
  recentIds: [],
  usedIds: new Set(),
  variantSurfaceCounts: {},
  variantLastBatchIndex: {},
  variantShownImageIndexes: {},
  productLastAppearanceOrdinal: {},
  normalProductOrdinal: 0,
  lastVariantNormalOrdinal: -HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN,
  preparedDescriptor: null,
  preparedDescriptorBatchIndex: -1,
  preparingDescriptor: false,
  lastEarlyLoadAt: 0,
  loading: false,
  seedProductId: "",
  lastHydrateAt: 0,
  readyQueue: [],
  virtualList: [],
  lastBackendRefreshAt: 0,
  backendRefreshPromise: null,
  isLoadingMore: false,
  loadMoreRequestId: 0,
  lastSentinelFetchAt: 0,
  lastSentinelPreloadAt: 0,
  lastSentinelInjectAt: 0
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
const slowPathTelemetryState = new Map();
const predictiveDecodeTelemetryState = new Map();
const runtimeAuditState = {
  completed: false,
  lastRunAt: 0,
  lastResult: null,
  lastReason: ""
};
const showcaseRuntimeReportState = new Map();

function isProductionClientRuntime() {
  const hostname = String(window.location?.hostname || "").trim().toLowerCase();
  return Boolean(hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1");
}

function getViewportWidth() {
  return Math.max(
    0,
    Number(window.innerWidth || 0),
    Number(document.documentElement?.clientWidth || 0)
  );
}

function getClientLayoutMode() {
  const viewportWidth = getViewportWidth();
  const screenWidth = Math.max(0, Number(window.screen?.width || 0));
  const screenHeight = Math.max(0, Number(window.screen?.height || 0));
  const smallestScreenEdge = Math.min(
    screenWidth || Number.POSITIVE_INFINITY,
    screenHeight || Number.POSITIVE_INFINITY
  );
  const coarsePointer = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const noHover = Boolean(window.matchMedia?.("(hover: none)")?.matches);
  const standaloneDisplay = Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches);
  const navigatorStandalone = Boolean(window.navigator?.standalone);
  const standaloneApp = standaloneDisplay || navigatorStandalone;
  const touchPoints = Math.max(0, Number(window.navigator?.maxTouchPoints || 0));
  const touchLikeDevice = coarsePointer || noHover || touchPoints > 0;
  const compactScreen = Number.isFinite(smallestScreenEdge) && smallestScreenEdge > 0 && smallestScreenEdge <= 900;
  if (standaloneApp && touchLikeDevice) {
    if (viewportWidth < 900 || compactScreen) {
      return "standalone-mobile";
    }
    if (viewportWidth < 1280) {
      return "standalone-tablet";
    }
  }
  if (touchLikeDevice && compactScreen && viewportWidth >= 900) {
    return "mobile-desktop-site";
  }
  if (touchLikeDevice && (viewportWidth < 680 || compactScreen)) {
    return "mobile";
  }
  if (touchLikeDevice && viewportWidth < 1024) {
    return "tablet";
  }
  if (!touchLikeDevice && viewportWidth >= 1024) {
    return "desktop";
  }
  if (viewportWidth < 680) {
    return "mobile";
  }
  if (viewportWidth < 1024) {
    return "tablet";
  }
  return touchLikeDevice ? "tablet" : "desktop";
}

function getFeedLayoutColumns(mode = getClientLayoutMode()) {
  const viewportWidth = getViewportWidth();
  if (mode === "desktop") {
    return viewportWidth >= 1400 ? 4 : 3;
  }
  if (mode === "standalone-tablet" || mode === "tablet") {
    return viewportWidth >= 760 ? 2 : 1;
  }
  if (mode === "standalone-mobile") {
    return viewportWidth >= 560 ? 2 : 1;
  }
  if (mode === "mobile-desktop-site") {
    return viewportWidth >= 640 ? 2 : 1;
  }
  return viewportWidth >= 560 ? 2 : 1;
}

function applyFeedLayoutMode(container = productsContainer) {
  if (!(container instanceof HTMLElement)) {
    return { mode: "desktop", columns: 1 };
  }
  const mode = getClientLayoutMode();
  const columns = getFeedLayoutColumns(mode);
  container.dataset.layoutMode = mode;
  container.dataset.layoutColumns = String(columns);
  container.style.setProperty("--winga-feed-columns", String(columns));
  document.body.dataset.layoutMode = mode;
  if (uiRuntimeState.lastReportedLayoutMode !== mode) {
    uiRuntimeState.lastReportedLayoutMode = mode;
    reportClientEvent("info", "layout_mode_detected", "Responsive layout mode detected.", {
      category: "runtime",
      mode,
      columns,
      viewportWidth: Math.round(getViewportWidth()),
      screenWidth: Math.round(Number(window.screen?.width || 0))
    });
  }
  return { mode, columns };
}

function pruneTimestampRegistry(registry, maxEntries = 240, maxAgeMs = 10 * 60 * 1000) {
  if (!(registry instanceof Map)) {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  registry.forEach((timestamp, key) => {
    if (Number(timestamp || 0) < cutoff) {
      registry.delete(key);
    }
  });
  if (registry.size > maxEntries) {
    Array.from(registry.keys()).slice(0, registry.size - maxEntries).forEach((key) => registry.delete(key));
  }
}

function shouldReportSlowPathEvent(event, durationMs, thresholdMs, context = {}) {
  const safeEvent = String(event || "").trim().toLowerCase();
  const scopeKey = String(context?.src || context?.view || context?.reason || context?.category || "global").slice(0, 120);
  const registryKey = `${safeEvent}:${scopeKey}`;
  const nowAt = Date.now();
  let cooldownMs = 10 * 1000;
  if (safeEvent === "feed_predictive_image_decode") {
    if (isProductionClientRuntime()) {
      return false;
    }
    cooldownMs = 60 * 1000;
  } else if (safeEvent === "render_current_view_slow") {
    cooldownMs = isProductionClientRuntime() ? 60 * 1000 : 20 * 1000;
    bumpRuntimeDiagnostic("renderCurrentViewSlowCount");
    recordRuntimeMetricWindow("renderCurrentViewSlowMs", durationMs);
    if (Number(durationMs || 0) < Math.max(Number(thresholdMs || 0) * 3, isProductionClientRuntime() ? 360 : 220)) {
      return false;
    }
  } else if (safeEvent === "feed_image_load_latency") {
    cooldownMs = 30 * 1000;
    bumpRuntimeDiagnostic("feedImageLoadSlowCount");
    recordRuntimeMetricWindow("feedImageLoadLatencyMs", durationMs);
  }
  pruneTimestampRegistry(slowPathTelemetryState, 320);
  const lastReportedAt = Number(slowPathTelemetryState.get(registryKey) || 0);
  if (lastReportedAt && nowAt - lastReportedAt < cooldownMs) {
    return false;
  }
  slowPathTelemetryState.set(registryKey, nowAt);
  return true;
}

function shouldReportPredictiveDecodeTelemetry(src = "", reason = "") {
  const safeSrc = sanitizeImageSource(src, "");
  if (!safeSrc) {
    return false;
  }
  pruneTimestampRegistry(predictiveDecodeTelemetryState, 160, 15 * 60 * 1000);
  const registryKey = `${safeSrc}::${String(reason || "").trim().toLowerCase()}`;
  const nowAt = Date.now();
  const lastReportedAt = Number(predictiveDecodeTelemetryState.get(registryKey) || 0);
  if (lastReportedAt && nowAt - lastReportedAt < 10 * 60 * 1000) {
    return false;
  }
  if (isProductionClientRuntime() && predictiveDecodeTelemetryState.size >= 6) {
    return false;
  }
  predictiveDecodeTelemetryState.set(registryKey, nowAt);
  return true;
}

function shouldRunDataIntegrityAudit(reason = "runtime_audit") {
  const safeReason = String(reason || "runtime_audit").trim().toLowerCase();
  const nowAt = Date.now();
  if (!isProductionClientRuntime()) {
    return !runtimeAuditState.lastRunAt || nowAt - runtimeAuditState.lastRunAt >= 5 * 1000;
  }
  if (safeReason.includes("boot_pre_hydration")) {
    return false;
  }
  if (runtimeAuditState.completed) {
    return false;
  }
  return !runtimeAuditState.lastRunAt || nowAt - runtimeAuditState.lastRunAt >= 30 * 1000;
}

function shouldReportShowcaseRuntime(eventName = "", payload = {}) {
  const safeEvent = String(eventName || "").trim().toLowerCase();
  if (!safeEvent) {
    return false;
  }
  pruneTimestampRegistry(showcaseRuntimeReportState, 120, 10 * 60 * 1000);
  const registryKey = `${safeEvent}:${String(payload?.section || payload?.slot || payload?.recommendationType || "").slice(0, 80)}`;
  const nowAt = Date.now();
  const cooldownMs = isProductionClientRuntime() ? 30 * 1000 : 5 * 1000;
  const lastReportedAt = Number(showcaseRuntimeReportState.get(registryKey) || 0);
  if (lastReportedAt && nowAt - lastReportedAt < cooldownMs) {
    return false;
  }
  showcaseRuntimeReportState.set(registryKey, nowAt);
  return true;
}

function reportSlowPath(event, durationMs, context = {}, thresholdMs = 120) {
  if (!Number.isFinite(durationMs) || durationMs < thresholdMs) {
    return;
  }
  if (!shouldReportSlowPathEvent(event, durationMs, thresholdMs, context)) {
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

window.addEventListener("winga:image-telemetry", (event) => {
  const detail = event?.detail || {};
  const durationMs = Number(detail.durationMs || 0);
  if (detail.status === "error") {
    reportClientEvent("warn", "feed_image_load_failed", "Feed image failed to load.", {
      category: "image",
      src: detail.src || "",
      surface: detail.surface || "",
      fitMode: detail.fitMode || ""
    });
    return;
  }
  reportSlowPath("feed_image_load_latency", durationMs, {
    category: "image",
    src: detail.src || "",
    surface: detail.surface || "",
    fitMode: detail.fitMode || "",
    eager: Boolean(detail.eager),
    immediate: Boolean(detail.immediate)
  }, 160);
});

window.addEventListener("error", () => {
  captureMemorySnapshot("window_error", {
    view: currentView
  });
});

window.addEventListener("unhandledrejection", () => {
  captureMemorySnapshot("unhandled_rejection", {
    view: currentView
  });
});

function getMemoryUsageSnapshot(reason = "sample") {
  const memory = performance?.memory;
  if (!memory) {
    return null;
  }
  const usedJSHeapSize = Number(memory.usedJSHeapSize || 0);
  const totalJSHeapSize = Number(memory.totalJSHeapSize || 0);
  const jsHeapSizeLimit = Number(memory.jsHeapSizeLimit || 0);
  if (!Number.isFinite(usedJSHeapSize) || usedJSHeapSize <= 0) {
    return null;
  }
  return {
    reason,
    usedJSHeapSize,
    totalJSHeapSize,
    jsHeapSizeLimit,
    timestamp: Date.now()
  };
}

function captureMemorySnapshot(reason = "sample", context = {}) {
  const snapshot = getMemoryUsageSnapshot(reason);
  if (!snapshot) {
    return null;
  }
  recordRuntimeMetricWindow("heapUsedMB", snapshot.usedJSHeapSize / (1024 * 1024));
  const diagnostics = getRuntimeDiagnosticsSnapshot();
  snapshot.diagnostics = diagnostics;
  const snapshots = Array.isArray(uiRuntimeState.memorySnapshots) ? uiRuntimeState.memorySnapshots : [];
  snapshots.push(snapshot);
  uiRuntimeState.memorySnapshots = snapshots.slice(-MEMORY_SNAPSHOT_LIMIT);
  if (
    snapshot.usedJSHeapSize >= MEMORY_WARNING_THRESHOLD_BYTES
    && snapshot.timestamp - Number(uiRuntimeState.lastMemoryWarningAt || 0) > MEMORY_SAMPLING_INTERVAL_MS
  ) {
    bumpRuntimeDiagnostic("memoryPressureWarningCount");
    uiRuntimeState.lastMemoryWarningAt = snapshot.timestamp;
    reportClientEvent("warn", "runtime_memory_pressure", "High client heap usage detected.", {
      category: "runtime",
        reason,
        usedMB: Math.round(snapshot.usedJSHeapSize / (1024 * 1024)),
        totalMB: Math.round(snapshot.totalJSHeapSize / (1024 * 1024)),
        limitMB: Math.round(snapshot.jsHeapSizeLimit / (1024 * 1024)),
        renderCalls: diagnostics.renderCurrentViewCalls,
        galleryInits: diagnostics.galleryInitCount,
        galleryDisposals: diagnostics.galleryDisposeCount,
        activeGalleryBindings: diagnostics.activeGalleryBindings,
        ...context
      });
  }
  if (snapshot.usedJSHeapSize >= MEMORY_WARNING_THRESHOLD_BYTES) {
    uiRuntimeState.memoryPressureCount = Number(uiRuntimeState.memoryPressureCount || 0) + 1;
  } else {
    uiRuntimeState.memoryPressureCount = 0;
  }
  if (
    Number(uiRuntimeState.memoryPressureCount || 0) >= MEMORY_PRESSURE_CONSECUTIVE_LIMIT
    || snapshot.usedJSHeapSize >= MEMORY_CRITICAL_THRESHOLD_BYTES
  ) {
    handleRuntimeMemoryPressure(snapshot, context);
  }
  return snapshot;
}

function pruneDynamicFeedDomForMemoryPressure() {
  document.querySelectorAll("[data-continuous-discovery-section], [data-product-detail-continuation-section]").forEach((section) => {
    if (!(section instanceof Element)) {
      return;
    }
    releasePrunedSectionMedia(section);
    section.remove();
  });
}

function handleRuntimeMemoryPressure(snapshot, context = {}) {
  if (!snapshot) {
    return;
  }
  const now = Date.now();
  if (now - Number(uiRuntimeState.lastMemoryMitigationAt || 0) < 12000) {
    return;
  }
  uiRuntimeState.lastMemoryMitigationAt = now;
  bumpRuntimeDiagnostic("memoryMitigationCount");
  cancelMarketplaceFeedRender?.();
  disconnectContinuousDiscoveryObserver();
  clearDecodedFeedImageCache();
  clearLightweightImageRegistries();
  pruneBrokenMarketplaceImageRegistry();
  pruneDynamicFeedDomForMemoryPressure();
  disconnectRenderMemoryObservers();
  reportClientEvent("warn", "runtime_memory_mitigation_applied", "Applied client-side memory pressure mitigation.", {
    category: "runtime",
      reason: snapshot.reason || "",
      usedMB: Math.round(Number(snapshot.usedJSHeapSize || 0) / (1024 * 1024)),
      critical: Number(snapshot.usedJSHeapSize || 0) >= MEMORY_CRITICAL_THRESHOLD_BYTES,
      renderCalls: diagnostics.renderCurrentViewCalls,
      galleryInits: diagnostics.galleryInitCount,
      galleryDisposals: diagnostics.galleryDisposeCount,
      activeGalleryBindings: diagnostics.activeGalleryBindings,
      view: currentView,
      ...context
    });
}

function startMemoryMonitoring() {
  if (uiRuntimeState.memorySampleTimer) {
    window.clearInterval(uiRuntimeState.memorySampleTimer);
    uiRuntimeState.memorySampleTimer = 0;
  }
  if (uiRuntimeState.feedMemoryMaintenanceTimer) {
    window.clearInterval(uiRuntimeState.feedMemoryMaintenanceTimer);
    uiRuntimeState.feedMemoryMaintenanceTimer = 0;
  }
  if (!performance?.memory) {
    startFeedMemoryMaintenance();
    return;
  }
  captureMemorySnapshot("boot");
  uiRuntimeState.memorySampleTimer = window.setInterval(() => {
    captureMemorySnapshot("interval", {
      view: currentView,
      productsCount: Array.isArray(products) ? products.length : 0
    });
  }, MEMORY_SAMPLING_INTERVAL_MS);
  startFeedMemoryMaintenance();
}

function runFeedMemoryMaintenance(trigger = "interval") {
  pruneHomeContinuousDiscoveryRuntimeState();
  pruneBrokenMarketplaceImageRegistry();
  trimDecodedFeedImageCache();
  while (slowPathTelemetryState.size > SLOW_PATH_TELEMETRY_LIMIT) {
    const oldestKey = slowPathTelemetryState.keys().next().value;
    if (typeof oldestKey === "undefined") {
      break;
    }
    slowPathTelemetryState.delete(oldestKey);
  }
  while (predictiveDecodeTelemetryState.size > PREDICTIVE_DECODE_TELEMETRY_LIMIT) {
    const oldestKey = predictiveDecodeTelemetryState.keys().next().value;
    if (typeof oldestKey === "undefined") {
      break;
    }
    predictiveDecodeTelemetryState.delete(oldestKey);
  }
  pruneTimestampRegistry(imagePreloadRegistry, Math.max(32, Math.floor(IMAGE_PRELOAD_REGISTRY_LIMIT / 2)));
  pruneTimestampRegistry(marketplaceScrollImagePrefetchedSources, Math.max(48, Math.floor(MARKETPLACE_SCROLL_PREFETCH_REGISTRY_LIMIT / 2)));
  if (Array.isArray(homeContinuousDiscoveryRuntime.pendingDescriptors)) {
    if (homeContinuousDiscoveryRuntime.pendingDescriptors.length > HOME_CONTINUOUS_PENDING_DESCRIPTOR_LIMIT) {
      homeContinuousDiscoveryRuntime.pendingDescriptors.splice(HOME_CONTINUOUS_PENDING_DESCRIPTOR_LIMIT);
    }
    homeContinuousDiscoveryRuntime.pendingDescriptors = homeContinuousDiscoveryRuntime.pendingDescriptors.filter((descriptor) => Array.isArray(descriptor?.items) && descriptor.items.length);
  }
  if (
    homeContinuousDiscoveryRuntime.preparedDescriptor
    && homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex < Number(homeContinuousDiscoveryRuntime.batchIndex || 0) - 1
  ) {
    homeContinuousDiscoveryRuntime.preparedDescriptor = null;
    homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex = -1;
  }
  if (
    homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal
    && typeof homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal === "object"
  ) {
    const activeIds = new Set([
      ...Array.from(homeContinuousDiscoveryRuntime.usedIds || []),
      ...Object.keys(homeContinuousDiscoveryRuntime.variantSurfaceCounts || {})
    ]);
    Object.keys(homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal).forEach((productId) => {
      if (!activeIds.has(productId)) {
        delete homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal[productId];
      }
    });
  }
  if (marketplaceScrollPrefetchQueue.length > MARKETPLACE_SCROLL_PREFETCH_MAX_QUEUE) {
    marketplaceScrollPrefetchQueue.splice(0, marketplaceScrollPrefetchQueue.length - MARKETPLACE_SCROLL_PREFETCH_MAX_QUEUE);
  }
  marketplaceScrollPrefetchInflight.forEach((entry, src) => {
    const startedAt = Number(entry?.startedAt || 0);
    if (!startedAt || Date.now() - startedAt > MARKETPLACE_SCROLL_PREFETCH_TIMEOUT_MS * 2) {
      marketplaceScrollPrefetchInflight.delete(src);
    }
  });
  if (trigger === "interval") {
    captureMemorySnapshot("feed_maintenance", {
      view: currentView,
      productsCount: Array.isArray(products) ? products.length : 0
    });
  }
}

function startFeedMemoryMaintenance() {
  if (uiRuntimeState.feedMemoryMaintenanceTimer) {
    window.clearInterval(uiRuntimeState.feedMemoryMaintenanceTimer);
    uiRuntimeState.feedMemoryMaintenanceTimer = 0;
  }
  uiRuntimeState.feedMemoryMaintenanceTimer = window.setInterval(() => {
    if (document.hidden) {
      return;
    }
    runFeedMemoryMaintenance("interval");
  }, FEED_MEMORY_MAINTENANCE_INTERVAL_MS);
}

function disconnectRenderMemoryObservers() {
  disconnectContinuousDiscoveryObserver();
  if (uiRuntimeState.chromeResizeObserver) {
    uiRuntimeState.chromeResizeObserver.disconnect();
    uiRuntimeState.chromeResizeObserver = null;
  }
  if (marketplaceScrollImageObserver) {
    marketplaceScrollImageObserver.disconnect?.();
    marketplaceScrollImageObserver = null;
  }
  if (productEngagementObserver) {
    productEngagementObserver.disconnect?.();
    productEngagementObserver = null;
  }
}

function cleanupAppRenderMemory(reason = "cleanup", options = {}) {
  const { full = false } = options;
  if (searchRuntimeState.renderDebounceTimer) {
    clearTimeout(searchRuntimeState.renderDebounceTimer);
    searchRuntimeState.renderDebounceTimer = 0;
  }
  if (uiRuntimeState.renderFrame) {
    cancelAnimationFrame(uiRuntimeState.renderFrame);
    uiRuntimeState.renderFrame = 0;
  }
  if (uiRuntimeState.homeScrollSaveFrame) {
    cancelAnimationFrame(uiRuntimeState.homeScrollSaveFrame);
    uiRuntimeState.homeScrollSaveFrame = 0;
  }
  if (uiRuntimeState.homeScrollRestoreFrame) {
    cancelAnimationFrame(uiRuntimeState.homeScrollRestoreFrame);
    uiRuntimeState.homeScrollRestoreFrame = 0;
  }
  if (uiRuntimeState.mobileHeaderScrollFrame) {
    cancelAnimationFrame(uiRuntimeState.mobileHeaderScrollFrame);
    uiRuntimeState.mobileHeaderScrollFrame = 0;
  }
  if (uiRuntimeState.chromeResizeFrame) {
    cancelAnimationFrame(uiRuntimeState.chromeResizeFrame);
    uiRuntimeState.chromeResizeFrame = 0;
  }
  if (uiRuntimeState.memorySampleTimer) {
    clearInterval(uiRuntimeState.memorySampleTimer);
    uiRuntimeState.memorySampleTimer = 0;
  }
  if (uiRuntimeState.feedMemoryMaintenanceTimer) {
    clearInterval(uiRuntimeState.feedMemoryMaintenanceTimer);
    uiRuntimeState.feedMemoryMaintenanceTimer = 0;
  }
  if (feedRuntimeState.prefetchTimer) {
    clearTimeout(feedRuntimeState.prefetchTimer);
    feedRuntimeState.prefetchTimer = 0;
  }
  if (lifecycleFallbackTimer) {
    clearTimeout(lifecycleFallbackTimer);
    lifecycleFallbackTimer = null;
  }
  if (lifecycleRetryTimer) {
    clearTimeout(lifecycleRetryTimer);
    lifecycleRetryTimer = null;
  }
  if (deepLinkRecoveryTimer) {
    clearTimeout(deepLinkRecoveryTimer);
    deepLinkRecoveryTimer = null;
  }
  if (publicAuthSlowTimer) {
    clearTimeout(publicAuthSlowTimer);
    publicAuthSlowTimer = null;
  }
  cancelMarketplaceFeedRender?.();
  stopSlideshow();
  stopMessagePolling();
  if (full) {
    disconnectRealtimeChannel();
  }
  disposeScopedRenderMemory(productsContainer);
  disposeScopedRenderMemory(marketShowcase);
  const detailModal = document.getElementById("product-detail-modal");
  if (detailModal) {
    disposeScopedRenderMemory(detailModal);
  }
  disconnectRenderMemoryObservers();
  if (full || reason === "hidden" || reason === "pagehide" || reason === "visibility_hidden") {
    clearDecodedFeedImageCache();
    clearLightweightImageRegistries();
  } else {
    runFeedMemoryMaintenance(reason);
  }
  captureMemorySnapshot(reason, {
    view: currentView
  });
}

function getFriendlyAuthErrorMessage(error, fallbackMessage) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").trim();
  const normalizedMessage = message.toLowerCase();
  if (status === 429 || normalizedMessage.includes("too many")) {
    return "Majaribio ni mengi sana kwa sasa. Subiri kidogo kisha jaribu tena.";
  }
  if (error?.retryable || code === "timeout" || code === "network" || normalizedMessage.includes("took too long") || normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("network")) {
    return "Network issue au server imechelewa kujibu. Hakikisha internet iko sawa kisha bonyeza tena kujaribu.";
  }
  if (status >= 500 || normalizedMessage.includes("system error") || normalizedMessage.includes("itilafu ya mfumo")) {
    return "Server ina tatizo kwa sasa. Jaribu tena baada ya muda mfupi.";
  }
  if (status === 401 || status === 403) {
    return message || fallbackMessage;
  }
  return message || fallbackMessage;
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

function clearPendingDeepLinkProductRoute() {
  pendingDeepLinkProductId = "";
  if (deepLinkRecoveryTimer) {
    window.clearTimeout(deepLinkRecoveryTimer);
    deepLinkRecoveryTimer = null;
  }
}

function setDeepLinkLoadingShellVisible(visible) {
  if (!appContainer) {
    return;
  }
  appContainer.style.visibility = visible ? "" : "hidden";
  appContainer.style.pointerEvents = visible ? "" : "none";
}

function hideDeepLinkLoadingOverlay() {
  if (deepLinkLoadingOverlay?.isConnected) {
    deepLinkLoadingOverlay.remove();
  }
  deepLinkLoadingOverlay = null;
}

function showDeepLinkLoadingState(message = "Tunafungua bidhaa uliyoifungua...") {
  setDeepLinkLoadingShellVisible(false);
  if (!deepLinkLoadingOverlay) {
    const overlay = document.createElement("div");
    overlay.id = "deep-link-loading-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:6000",
      "display:grid",
      "place-items:center",
      "padding:24px",
      "background:linear-gradient(180deg, rgba(7,10,18,0.72), rgba(7,10,18,0.88))",
      "color:#fff",
      "text-align:center"
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "width:min(420px, calc(100vw - 32px))",
      "border-radius:24px",
      "padding:20px 18px",
      "background:rgba(12,16,24,0.88)",
      "backdrop-filter:blur(18px)",
      "box-shadow:0 24px 60px rgba(0,0,0,0.28)",
      "border:1px solid rgba(255,255,255,0.12)"
    ].join(";");

    const badge = document.createElement("div");
    badge.style.cssText = [
      "display:inline-grid",
      "place-items:center",
      "width:56px",
      "height:56px",
      "margin:0 auto 14px",
      "border-radius:18px",
      "background:rgba(255,255,255,0.10)",
      "font-size:1.4rem",
      "font-weight:700"
    ].join(";");
    badge.textContent = "W";

    const title = createElement("h3", {
      textContent: "Tunaendelea kufungua bidhaa..."
    });
    title.style.cssText = "margin:0 0 8px;font-size:1.05rem;line-height:1.35;";

    const copy = createElement("p", {
      className: "empty-copy",
      textContent: message
    });
    copy.style.cssText = "margin:0;font-size:0.95rem;line-height:1.5;opacity:0.9;";

    panel.append(badge, title, copy);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    deepLinkLoadingOverlay = overlay;
    return;
  }

  const title = deepLinkLoadingOverlay.querySelector("h3");
  const copy = deepLinkLoadingOverlay.querySelector(".empty-copy");
  if (title) {
    title.textContent = "Tunaendelea kufungua bidhaa...";
  }
  if (copy) {
    copy.textContent = message;
  }
  deepLinkLoadingOverlay.style.display = "grid";
}

function hideDeepLinkLoadingState() {
  hideDeepLinkLoadingOverlay();
  setDeepLinkLoadingShellVisible(true);
}

function setFeedLoadingStateVisible(visible) {
  if (!feedLoadingState) {
    return;
  }
  feedLoadingState.style.display = visible ? "grid" : "none";
}

function getStartupFeedSkeletonCount() {
  const viewportWidth = getViewportWidth();
  if (viewportWidth >= 960) {
    return 6;
  }
  if (viewportWidth >= 720) {
    return 4;
  }
  return 3;
}

function renderStartupFeedSkeleton() {
  if (!productsContainer) {
    return;
  }
  const count = getStartupFeedSkeletonCount();
  const skeletonMarkup = Array.from({ length: count }, () => `
    <article class="seller-product-card feed-skeleton-card" data-feed-skeleton-card="true" aria-hidden="true">
      <div class="feed-skeleton-media"></div>
      <div class="feed-skeleton-body">
        <span class="feed-skeleton-line feed-skeleton-line-title"></span>
        <span class="feed-skeleton-line feed-skeleton-line-copy"></span>
        <span class="feed-skeleton-line feed-skeleton-line-copy-short"></span>
        <div class="feed-skeleton-actions">
          <span class="feed-skeleton-pill"></span>
          <span class="feed-skeleton-pill"></span>
        </div>
      </div>
    </article>
  `).join("");
  productsContainer.replaceChildren(createFragmentFromMarkup(skeletonMarkup));
}

function hasVisibleStartupSurface(options = {}) {
  const includeFeedLoading = options.includeFeedLoading !== false;
  return Boolean(
    document.body.classList.contains("auth-modal-open")
    || document.body.classList.contains("product-detail-open")
    || productsContainer?.querySelector(".product-card, .seller-product-card")
    || productsContainer?.querySelector("[data-feed-skeleton-card='true']")
    || profileDiv?.style.display === "block"
    || uploadForm?.style.display === "block"
    || adminPanel?.style.display === "block"
    || emptyState?.style.display === "block"
    || (includeFeedLoading && feedLoadingState?.style.display === "grid")
  );
}

function hasImmediateProductsAvailable() {
  const hydratedProducts = window.WingaDataLayer?.getProducts?.();
  return Boolean(
    (Array.isArray(products) && products.length)
    || (Array.isArray(hydratedProducts) && hydratedProducts.length)
  );
}

function renderLifecycleFallbackSkeleton(message = "") {
  if (!feedLoadingState) {
    return;
  }
  const title = feedLoadingState.querySelector(".feed-loading-shell h3");
  const copy = feedLoadingState.querySelector(".feed-loading-shell p");
  if (feedLoadingRetryButton) {
    feedLoadingRetryButton.disabled = false;
    feedLoadingRetryButton.textContent = "Jaribu tena";
  }
  if (title) {
    title.textContent = "Loading products";
  }
  if (copy) {
    copy.textContent = message || "Products are taking longer than expected to load. Please try again.";
  }
  setFeedLoadingStateVisible(true);
}

function shouldKeepStartupFeedLoadingVisible() {
  try {
    const isProfile = currentView === "profile";
    const isUpload = currentView === "upload" && canUseSellerFeatures();
    const isAdminView = currentView === "admin" && isStaffUser();
    if (isProfile || isUpload || isAdminView) {
      return false;
    }
    const filteredProducts = getFilteredProducts();
    const productsHydrated = Boolean(window.WingaDataLayer?.isProductsHydrated?.());
    return productHydrationStatus === "failed" && !productsHydrated && filteredProducts.length === 0;
  } catch (error) {
    captureClientError("startup_feed_loading_state_check_failed", error, {
      category: "runtime",
      alertSeverity: "medium",
      view: currentView
    });
    return false;
  }
}

function ensureVisibleStartupContent(reason = "startup_guard") {
  if (!appContainer || appContainer.style.display === "none") {
    return;
  }
  if (currentView === "home" && resumeRetainedHomeFeedSurface(`startup_guard_${reason}`, {
    productLimit: 6,
    decodeLimit: 2
  })) {
    return;
  }
  const hasVisibleSurface = hasVisibleStartupSurface();
  if (hasVisibleSurface) {
    return;
  }
  if (productHydrationStatus !== "failed" && !Boolean(window.WingaDataLayer?.isProductsHydrated?.())) {
    revealBootOverlay();
    return;
  }
  reportClientEvent("warn", "startup_blank_surface_guarded", "Startup guard restored visible feed loading shell.", {
    category: "runtime",
    reason,
    view: currentView || "home",
    productsHydrated: Boolean(window.WingaDataLayer?.isProductsHydrated?.()),
    productsCount: Array.isArray(products) ? products.length : 0
  });
  renderLifecycleFallbackSkeleton("We couldn't finish loading products. Please try again.");
}

function hideLifecycleFallbackShell() {
  if (lifecycleFallbackTimer) {
    window.clearTimeout(lifecycleFallbackTimer);
    lifecycleFallbackTimer = null;
  }
  if (lifecycleRetryTimer) {
    window.clearTimeout(lifecycleRetryTimer);
    lifecycleRetryTimer = null;
  }
  lifecycleFallbackActive = false;
  lifecycleFallbackReason = "";
  if (shouldKeepStartupFeedLoadingVisible()) {
    renderLifecycleFallbackSkeleton("We couldn't finish loading products. Please try again.");
    return;
  }
  setFeedLoadingStateVisible(false);
}

function schedulePublicAuthSlowFallback(kind = "auth") {
  if (publicAuthSlowTimer) {
    window.clearTimeout(publicAuthSlowTimer);
  }
  publicAuthSlowTimer = window.setTimeout(() => {
    publicAuthSlowTimer = null;
    if (!publicAuthRequestPending && !publicAuthTransitionPending) {
      return;
    }
    reportClientEvent("warn", "public_auth_slow", "Public auth is taking longer than expected.", {
      category: "auth",
      kind,
      mode: isLogin ? "login" : (isPasswordRecovery ? "recovery" : "signup")
    });
    appContainer.style.display = "block";
    renderLifecycleFallbackSkeleton(isLogin
      ? "Login inaendelea. Tunahakikisha bidhaa ziko tayari mara utakapoingia."
      : "Signup inaendelea. Tunatayarisha feed isiwe blank baada ya akaunti kuundwa.");
  }, 3500);
}

function clearPublicAuthSlowFallback() {
  if (publicAuthSlowTimer) {
    window.clearTimeout(publicAuthSlowTimer);
    publicAuthSlowTimer = null;
  }
}

function retryLifecycleFeedRestore(reason = lifecycleFallbackReason || "lifecycle_retry") {
  if (!lifecycleFallbackActive) {
    return;
  }
  if (feedLoadingRetryButton) {
    feedLoadingRetryButton.disabled = true;
    feedLoadingRetryButton.textContent = "Inajaribu tena...";
  }
  Promise.resolve(window.WingaDataLayer?.refreshProducts?.())
    .catch((error) => {
      captureClientError("lifecycle_feed_retry_failed", error, {
        category: "runtime",
        reason
      });
    })
    .finally(() => {
      if (feedLoadingRetryButton) {
        feedLoadingRetryButton.disabled = false;
        feedLoadingRetryButton.textContent = "Jaribu tena";
      }
      ensureProductsForImmediateRender();
      mergeAvailableCategories(inferCategoriesFromData());
      refreshCategoryUI();
      if (!document.body.classList.contains("product-detail-open") && currentView !== "profile") {
        renderCurrentView();
      }
      if (productsContainer?.querySelector(".product-card, .seller-product-card")) {
        hideLifecycleFallbackShell();
      }
    });
}

function showLifecycleFallbackShell(reason = "startup_slow", options = {}) {
  const {
    message = "Tunaweka bidhaa na picha tayari...",
    retry = true
  } = options;

  lifecycleFallbackActive = true;
  lifecycleFallbackReason = reason;
  bumpRuntimeDiagnostic("lifecycleFallbackShellCount");
  reportClientEvent("warn", "lifecycle_fallback_shell_shown", "Fallback shell shown to avoid blank/stuck startup.", {
    category: "runtime",
    reason,
    view: currentView || "home",
    authState: currentUser ? "signed_in" : "guest",
    pathname: window.location.pathname || ""
  });

  document.body.classList.remove("app-booting");
  document.body.classList.add("app-ready");
  hideBootOverlayImmediately();
  appContainer.style.display = "block";
  setDeepLinkLoadingShellVisible(true);
  syncBodyScrollLockState();
  refreshPublicEntryChrome();

  if (!document.body.classList.contains("auth-modal-open") && !isAdminLoginRoute()) {
    authContainer.style.display = "none";
  }

  ensureProductsForImmediateRender();
  mergeAvailableCategories(inferCategoriesFromData());
  refreshCategoryUI();

  if (!document.body.classList.contains("product-detail-open") && currentView !== "profile") {
    const fallbackBootstrapSession = window.WingaDataLayer?.bootstrapSession?.();
    const fallbackView = (isStaffUser() || isStaffRole(fallbackBootstrapSession?.role || ""))
      ? "admin"
      : "home";
    setCurrentViewState(fallbackView, getEphemeralLifecycleViewOptions());
    renderCurrentView();
  }

  if (!productsContainer?.querySelector(".product-card, .seller-product-card")) {
    renderLifecycleFallbackSkeleton(message);
  }

  if (retry && !lifecycleRetryTimer) {
    lifecycleRetryTimer = window.setTimeout(() => {
      lifecycleRetryTimer = null;
      retryLifecycleFeedRestore(reason);
    }, LIFECYCLE_RETRY_DELAY_MS);
  }
}

function scheduleLifecycleFallback(reason, options = {}) {
  if (lifecycleFallbackTimer) {
    window.clearTimeout(lifecycleFallbackTimer);
  }
  lifecycleFallbackTimer = window.setTimeout(() => {
    lifecycleFallbackTimer = null;
    const shouldShowFallback = document.body.classList.contains("app-booting")
      || bootOverlay?.classList.contains("is-hidden") === false
      || !productsContainer?.querySelector(".product-card, .seller-product-card");
    if (shouldShowFallback) {
      showLifecycleFallbackShell(reason, options);
    }
  }, Number(options.delayMs || LIFECYCLE_FALLBACK_DELAY_MS));
}

function scheduleDeepLinkRecovery(productId) {
  if (deepLinkRecoveryTimer) {
    window.clearTimeout(deepLinkRecoveryTimer);
  }
  deepLinkRecoveryTimer = window.setTimeout(() => {
    deepLinkRecoveryTimer = null;
    if (normalizeProductIdValue(pendingDeepLinkProductId) !== normalizeProductIdValue(productId)) {
      return;
    }
    reportClientEvent("warn", "deep_link_recovery_started", "Deep link waited too long; restoring feed shell.", {
      category: "runtime",
      productId
    });
    refreshProductsFromStore();
    if (tryOpenPendingDeepLinkProductRoute()) {
      return;
    }
    clearPendingDeepLinkProductRoute();
    hideDeepLinkLoadingState();
    safeReplaceState(window.history.state || null, "/");
    setCurrentViewState("home", getEphemeralLifecycleViewOptions());
    setDeepLinkLoadingShellVisible(true);
    ensureProductsForImmediateRender();
    renderCurrentView();
    showLifecycleFallbackShell("deep_link_recovery", {
      message: "Link ya bidhaa imechelewa. Tumerudisha feed salama huku tukijaribu tena nyuma ya pazia."
    });
  }, DEEP_LINK_RECOVERY_DELAY_MS);
}

function tryOpenPendingDeepLinkProductRoute() {
  const productId = normalizeProductIdValue(pendingDeepLinkProductId);
  if (!productId) {
    return false;
  }

  const product = getProductById(productId);
  if (!product) {
    if (!window.WingaDataLayer?.isProductsHydrated?.()) {
      return false;
    }

    reportClientEvent("warn", "deep_link_product_missing", "Deep link could not resolve a product after hydration.", {
      category: "runtime",
      productId,
      userState: currentUser ? "signed_in" : "guest",
      route: String(window.location.pathname || "")
    });
    clearPendingDeepLinkProductRoute();
    hideDeepLinkLoadingState();
    safeReplaceState(window.history.state || null, "/");
    setCurrentViewState("home", { syncHistory: false });
    syncAppShellHistoryState({
      force: true,
      mode: "replace",
      url: "/"
    });
    renderCurrentView();
    suppressInitialProductHomeRender = false;
    showInAppNotification({
      title: "Product not found",
      body: "Bidhaa hii haipo tena au link imebadilika. Tumerudisha home salama.",
      variant: "warning"
    });
    return false;
  }

  clearPendingDeepLinkProductRoute();
  if (deepLinkRecoveryTimer) {
    window.clearTimeout(deepLinkRecoveryTimer);
    deepLinkRecoveryTimer = null;
  }
  hideDeepLinkLoadingState();
  reportClientEvent("info", "deep_link_product_opened", "Deep link resolved into product detail successfully.", {
    category: "runtime",
    productId,
    userState: currentUser ? "signed_in" : "guest",
    route: String(window.location.pathname || "")
  });
  openProductDetailModal(productId, {
    allowBrokenImageFallbackOpen: true
  });
  suppressInitialProductHomeRender = false;
  return true;
}

function openDeepLinkedProductRouteIfNeeded(options = {}) {
  const { skipHomeRender = false } = options;
  const pathname = String(window.location.pathname || "").trim();
  const canonicalPath = canonicalizeProductDetailPath(pathname);
  reportBootPhase("route_parsed", {
    pathname,
    deepLink: pathname.match(/^\/product\/.+/i) ? "product" : "home"
  });
  if (canonicalPath !== pathname.replace(/\/+$/, "")) {
    safeReplaceState(window.history.state || null, canonicalPath);
  }
  const productId = getDeepLinkedProductIdFromRoute();
  if (!productId) {
    if (String(window.location.pathname || "").trim().match(/^\/product\/.+/i)) {
      safeReplaceState(window.history.state || null, "/");
    }
    setCurrentViewState("home", { syncHistory: false });
    setDeepLinkLoadingShellVisible(true);
    syncAppShellHistoryState({
      force: true,
      mode: "replace",
      url: "/"
    });
    renderCurrentView();
    return false;
  }
  reportBootPhase("deep_link_product_requested", {
    productId
  });
  const product = getProductById(productId);
  if (!product) {
    if (!window.WingaDataLayer?.isProductsHydrated?.()) {
      pendingDeepLinkProductId = productId;
      setCurrentViewState("home", { syncHistory: false });
      showDeepLinkLoadingState("Tunafungua bidhaa uliyoifungua...");
      scheduleDeepLinkRecovery(productId);
      return true;
    }
    hideDeepLinkLoadingState();
    safeReplaceState(window.history.state || null, "/");
    setCurrentViewState("home", { syncHistory: false });
    syncAppShellHistoryState({
      force: true,
      mode: "replace",
      url: "/"
    });
    renderCurrentView();
    suppressInitialProductHomeRender = false;
    showInAppNotification({
      title: "Product not found",
      body: "Bidhaa hii haipo tena au link imebadilika. Tumerudisha home salama.",
      variant: "warning"
    });
    return false;
  }
  reportBootPhase("product_data_loaded", {
    productId,
    source: "boot_cache_or_store"
  });
  showDeepLinkLoadingState("Tunafungua bidhaa uliyoifungua...");
  setCurrentViewState("home", { syncHistory: false });
  if (!skipHomeRender) {
    renderCurrentView();
  }
  window.requestAnimationFrame(() => {
    const activeProductId = getDeepLinkedProductIdFromRoute();
    if (activeProductId !== productId && String(window.location.pathname || "").match(/^\/product\/.+/i)) {
      return;
    }
    if (!tryOpenPendingDeepLinkProductRoute()) {
      hideDeepLinkLoadingState();
      openProductDetailModal(productId, {
        allowBrokenImageFallbackOpen: true
      });
    }
    suppressInitialProductHomeRender = false;
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
    safeReplaceState(currentState, url);
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
    setNodeText(adminLoginTitle, "Admin Login");
  }
  if (adminLoginCopy) {
    setNodeText(adminLoginCopy, message || "Mteja na muuzaji wa kawaida wanapaswa kutumia login ya kawaida ya marketplace.");
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
  nationalIdInput.style.display = isRecoveryMode ? "block" : "none";
  sellerIdentityDocumentTypeInput.style.display = "none";
  sellerVerificationUploads.style.display = "none";
  if (sellerIdentityDocumentNumberInput) {
    sellerIdentityDocumentNumberInput.style.display = "none";
    sellerIdentityDocumentNumberInput.required = false;
  }
  confirmPasswordWrap.style.display = isSecuritySignup || isRecoveryMode ? "flex" : "none";
  phoneNumberInput.required = isSecuritySignup || isRecoveryMode;
  nationalIdInput.required = isRecoveryMode;
  sellerIdentityDocumentTypeInput.required = false;
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
      : "Jina la duka";
  usernameInput.autocomplete = isLogin || isRecoveryMode ? "username" : "organization";
  phoneNumberInput.autocomplete = isSecuritySignup || isRecoveryMode ? "tel" : "off";
  nationalIdInput.autocomplete = "off";
  passwordInput.autocomplete = isSecuritySignup || isRecoveryMode ? "new-password" : "current-password";
  confirmPasswordInput.autocomplete = isSecuritySignup || isRecoveryMode ? "new-password" : "off";
  sellerIdentityDocumentNumberInput?.setAttribute("autocomplete", "off");
  setNodeText(formTitle, isRecoveryMode ? "Recover Password" : (isLogin ? "Login" : "Sign Up"));
  setNodeText(authButton, isRecoveryMode ? "Reset Password" : (isLogin ? "Login" : "Sign Up"));
  setNodeText(toggleLink, isRecoveryMode ? "Rudi kwenye login" : (isLogin ? "Tengeneza akaunti" : "Tayari una akaunti? Ingia"));
  if (forgotPasswordLink) {
    forgotPasswordLink.style.display = isLogin ? "block" : "none";
  }

  if (authCategoryNote) {
    setNodeText(authCategoryNote, isLogin
      ? "Login tumia username, full name, au namba ya simu pamoja na password. Session itaendelea mpaka ulogout."
      : isRecoveryMode
        ? "Weka identifier, namba ya simu, NIDA/ID number, na password mpya. Ukimaliza utaingia tena kwa password mpya."
        : "Signup sasa ni phone-first. Weka jina la duka, namba ya simu, na password. Verification ya ID itafanyika baadaye kupitia Profile > Get Verified.");
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
    setNodeText(sellerIdentityDocumentImageName, "");
    if (sellerIdentityDocumentPreview) {
      updateSellerIdentityDocumentPreview(null);
    }
  }

  usernameInput.required = !isLogin && !isRecoveryMode;

  [passwordInput, confirmPasswordInput].forEach((input) => {
    input.type = "password";
  });
  if (passwordToggleButton) {
    setNodeText(passwordToggleButton, isSecuritySignup || isRecoveryMode ? "Show Passwords" : "Show Password");
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
    setNodeText(button, isHidden
      ? (confirmPasswordWrap.style.display !== "none" ? "Hide Passwords" : "Hide Password")
      : (confirmPasswordWrap.style.display !== "none" ? "Show Passwords" : "Show Password"));
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
      setNodeText(sellerIdentityDocumentImageName, file ? file.name : "");
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
      setNodeText(sellerIdentityDocumentImageName, "");
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
  cancelPendingSessionRestore("admin_login_started");
  adminAuthRequestPending = true;
  setAuthInteractionPending("admin", true);
  try {
    user = await window.WingaDataLayer.adminLogin({ identifier, username: identifier, password });
  } catch (error) {
    const errorMessage = getFriendlyAuthErrorMessage(error, "Taarifa za admin login si sahihi.");
    captureClientError("admin_login_failed", error, {
      identifier
    });
    showInAppNotification({
      title: "Admin login failed",
      body: errorMessage,
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
      forceView: "admin",
      deferRender: true,
      skipMarketplaceBootstrap: true
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
    scheduleProductUploadDraftSave(0);
    return;
  }
  if (!supportsFlexibleSubcategory(productCategoryTopInput.value)) {
    uploadCustomCategoryWrap.style.display = "none";
  }
  uploadCustomCategoryInput.value = "";
  scheduleProductUploadDraftSave(0);
});

[
  productNameInput,
  productPriceInput,
  productShopInput,
  productWhatsappInput,
  productCategoryTopInput,
  productCategoryInput,
  uploadCustomCategoryInput
].filter(Boolean).forEach((field) => {
  field.addEventListener("input", () => {
    if ((uiRuntimeState.productUploadStatusTone || "") !== "info") {
      setUploadFormStatus("", "");
      uiRuntimeState.productUploadStatusTone = "";
    }
    scheduleProductUploadDraftSave(220);
  });
  field.addEventListener("change", () => {
    if ((uiRuntimeState.productUploadStatusTone || "") !== "info") {
      setUploadFormStatus("", "");
      uiRuntimeState.productUploadStatusTone = "";
    }
    scheduleProductUploadDraftSave(0);
  });
});

Array.from(productFitModeInputs || []).forEach((input) => {
  input.addEventListener("change", () => {
    if ((uiRuntimeState.productUploadStatusTone || "") !== "info") {
      setUploadFormStatus("", "");
      uiRuntimeState.productUploadStatusTone = "";
    }
    scheduleProductUploadDraftSave(0);
  });
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
      cancelPendingSessionRestore("public_login_started");
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
      loginSuccess(user.username, "", user, {
        restoreView: false,
        deferRender: true
      });
    } catch (error) {
      const errorMessage = getFriendlyAuthErrorMessage(error, "Taarifa za login si sahihi. Hakikisha identifier na password yako ni sahihi.");
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
        body: getFriendlyAuthErrorMessage(error, "Imeshindikana kubadilisha password kwa sasa."),
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
  const displayName = usernameInput.value.trim();

  try {
    cancelPendingSessionRestore("public_signup_started");
    const user = await window.WingaDataLayer.signup({
      username: "",
      fullName: displayName,
      password,
      phoneNumber,
      nationalId: "",
      role: selectedAuthRole,
      profileImage: ""
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
      body: getFriendlyAuthErrorMessage(error, "Imeshindikana kusajili akaunti."),
      variant: "error"
    });
  } finally {
    publicAuthTransitionPending = false;
    releasePublicAuthPendingState();
  }
});

uploadButton.addEventListener("click", async () => {
  if (uiRuntimeState.productUploadInFlight) {
    return;
  }
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
      fitMode: getSelectedProductFitMode(),
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
    ensureSafeProductUploadPayload(productPayload);

    if (editingProductId) {
      await window.WingaDataLayer.updateProduct(editingProductId, productPayload);
    } else {
      await window.WingaDataLayer.createProduct(productPayload);
    }

    refreshProductsFromStore();
    const primaryCategory = inferTopCategoryValue(category) || category;
    await window.WingaDataLayer.updateUserPrimaryCategory(currentUser, primaryCategory);
    clearProductUploadDraft();
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
    uiRuntimeState.productUploadInFlight = true;
    uiRuntimeState.productUploadStatusTone = "info";
    setUploadFormStatus(
      "info",
      editingProductId
        ? "Tunatunza mabadiliko ya bidhaa yako sasa. Usifunge ukurasa huu."
        : "Tunapakia bidhaa yako sasa. Usifunge ukurasa huu."
    );
    if (uploadButton) {
      uploadButton.disabled = true;
      uploadButton.dataset.loading = "true";
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      uiRuntimeState.productUploadStatusTone = "warning";
      setUploadFormStatus("warning", "Uko offline. Draft ya bidhaa imehifadhiwa. Internet ikirudi, bonyeza tena kupost.");
      showInAppNotification({
        title: "Uko offline",
        body: "Draft ya bidhaa imehifadhiwa. Internet ikirudi, bonyeza tena kupost.",
        variant: "warning"
      });
      saveProductUploadDraft();
      return;
    }
    saveProductUploadDraft();
    if (selectedFiles.length > 0) {
      validateImageFiles(selectedFiles);
      const images = await readFilesAsDataUrls(selectedFiles);
      productUploadDraftRuntimeState.preparedImages = images.slice();
      saveProductUploadDraft();
      uiRuntimeState.productUploadStatusTone = "info";
      setUploadFormStatus("info", "Picha zako zimeandaliwa. Tunahifadhi bidhaa sasa.");
      await finalizeSave(images);
      return;
    }

    await finalizeSave(existingProduct.images || [existingProduct.image].filter(Boolean));
  } catch (error) {
    saveProductUploadDraft();
    uiRuntimeState.productUploadStatusTone = "error";
    setUploadFormStatus("error", getFriendlyProductUploadErrorMessage(error));
    captureClientError("product_save_failed", error, {
      editingProductId: editingProductId || ""
    });
    showInAppNotification({
      title: "Product save failed",
      body: getFriendlyProductUploadErrorMessage(error),
      variant: "error"
    });
  } finally {
    uiRuntimeState.productUploadInFlight = false;
    if (uploadButton) {
      uploadButton.disabled = false;
      delete uploadButton.dataset.loading;
    }
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
  if ((uiRuntimeState.productUploadStatusTone || "") !== "info") {
    setUploadFormStatus("", "");
    uiRuntimeState.productUploadStatusTone = "";
  }
  const files = Array.from(productImageFileInput.files || []);
  if (files.length === 0) {
    productUploadDraftRuntimeState.preparedImages = [];
    previewList.replaceChildren();
    previewList.style.display = "none";
    scheduleProductUploadDraftSave(0);
    return;
  }

  try {
    previewList.replaceChildren();
    previewList.style.display = "none";
    validateImageFiles(files);
    const preparedImages = await renderPreviewFiles(files);
    productUploadDraftRuntimeState.preparedImages = preparedImages.slice();
    scheduleProductUploadDraftSave(0);
  } catch (error) {
    uiRuntimeState.productUploadStatusTone = "error";
    setUploadFormStatus("error", error.message || "Picha ulizochagua si sahihi.");
    showInAppNotification({
      title: "Image selection failed",
      body: error.message || "Picha ulizochagua si sahihi.",
      variant: "error"
    });
    productUploadDraftRuntimeState.preparedImages = [];
    productImageFileInput.value = "";
    previewList.replaceChildren();
    previewList.style.display = "none";
    scheduleProductUploadDraftSave(0);
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
  const promoteTrigger = event.target.closest?.("[data-promote-product]");
  if (promoteTrigger) {
    const promotionContext = getPromotionTriggerContext(promoteTrigger);
    const product = promotionContext.product;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (product) {
      openPromotionIntentModal(product, { trustedAuthorized: promotionContext.trustedAuthorized, trigger: promoteTrigger });
    } else {
      showInAppNotification({
        title: "Promotion unavailable",
        body: "Product context ya promotion haikupatikana. Refresh home feed ujaribu tena.",
        variant: "warning"
      });
    }
    return;
  }

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
  restoreStoredHomeScrollPosition();
});

window.addEventListener("scroll", () => {
  const now = Date.now();
  const currentScrollY = window.scrollY || window.pageYOffset || 0;
  const previousScrollY = Number(feedRuntimeState.lastScrollY || 0);
  const previousScrollAt = Number(feedRuntimeState.lastScrollAt || 0);
  const deltaY = Math.abs(currentScrollY - previousScrollY);
  const deltaTime = Math.max(1, now - previousScrollAt);
  feedRuntimeState.lastScrollSpeed = deltaY / deltaTime;
  feedRuntimeState.lastScrollY = currentScrollY;
  feedRuntimeState.lastScrollAt = now;
  uiRuntimeState.lastScrollActivityAt = Date.now();
  if (currentView === "home" && !document.body.classList.contains("product-detail-open")) {
    scheduleHomeScrollSave();
    schedulePredictiveFeedPrefetch("scroll");
    maybeAdvanceBackgroundContinuation();
    scheduleViewportReadyFeedSweep(document, {
      limit: 12
    });
  }
  if (getViewportWidth() <= 720) {
    scheduleMobileHeaderScrollSync();
  }
}, { passive: true });

function handleAppLifecycleChange() {
  if (document.hidden) {
    if (currentView === "home") {
      saveHomeScrollState(window.scrollY || 0);
    }
    cancelPendingStartupImageWork("document_hidden");
    cancelDeferredImageSignatureHydration("document_hidden");
    cleanupAppRenderMemory("hidden", { full: false });
    return;
  }

  startMemoryMonitoring();
  if (currentView === "home" || currentView === "profile") {
    if (uiRuntimeState.renderFrame) {
      cancelAnimationFrame(uiRuntimeState.renderFrame);
      uiRuntimeState.renderFrame = 0;
    }
    window.setTimeout(() => {
      if (document.hidden) {
        return;
      }
      if (currentView === "home" && resumeRetainedHomeFeedSurface("home_visible_resume")) {
        return;
      }
      scheduleRenderCurrentView();
      if (currentView === "home") {
        restoreStoredHomeScrollPosition();
        schedulePredictiveFeedPrefetch("resume");
      }
    }, 280);
  }
}

document.addEventListener("visibilitychange", handleAppLifecycleChange);
window.addEventListener("pagehide", () => {
  if (currentView === "home") {
    saveHomeScrollState(window.scrollY || 0);
  }
  cancelPendingStartupImageWork("pagehide");
  cancelDeferredImageSignatureHydration("pagehide");
  cleanupAppRenderMemory("pagehide", { full: false });
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

function scheduleIdleBackgroundWork(callback, timeout = 1500) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback((deadline) => {
      callback(deadline);
    }, { timeout });
  }
  return window.setTimeout(() => {
    callback({
      didTimeout: true,
      timeRemaining: () => 0
    });
  }, Math.max(0, Number(timeout) || 0));
}

async function hydrateMissingImageSignatures(productList = products) {
  const pendingProducts = productList.filter((product) => !product.imageSignature && product.image);
  if (!pendingProducts.length) {
    return;
  }

  const queue = pendingProducts.slice();
  await new Promise((resolve) => {
    const processNext = (deadline = null) => {
      const recentScrollAt = Number(uiRuntimeState.lastScrollActivityAt || 0);
      const scrollRecentlyActive = recentScrollAt > 0 && (Date.now() - recentScrollAt) < 900;
      const hasIdleBudget = !deadline
        || deadline.didTimeout
        || deadline.timeRemaining() > 8;

      if (!queue.length) {
        resolve();
        return;
      }

      if (scrollRecentlyActive) {
        scheduleIdleBackgroundWork(processNext, 1200);
        return;
      }

      if (!hasIdleBudget) {
        scheduleIdleBackgroundWork(processNext, 1200);
        return;
      }

      const product = queue.shift();
      Promise.resolve(createImageSignatureFromSource(product.image))
        .then((signature) => {
          product.imageSignature = signature;
        })
        .catch(() => {
          product.imageSignature = "";
        })
        .finally(() => {
          scheduleIdleBackgroundWork(processNext, 1200);
        });
    };

    scheduleIdleBackgroundWork(processNext, 1200);
  });
}

function loginSuccess(username, preferredCategory = "", sessionData = null, options = {}) {
  beginLifecycleEpoch("login_success");
  activeSessionRestoreToken += 1;
  const {
    restoreView = false,
    skipWelcome = false,
    forceView = "",
    deferRender = false,
    skipMarketplaceBootstrap = false
  } = options;
  isSessionRestorePending = false;
  completePublicAuthSuccessTransition();
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
  if (!skipMarketplaceBootstrap) {
    ensureProductsForImmediateRender();
  }
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
  if (deferRender) {
    window.setTimeout(() => hydrateBuyerSellerAffinityState(username), 120);
  } else {
    hydrateBuyerSellerAffinityState(username);
  }
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
  setDeepLinkLoadingShellVisible(true);
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
  const activeGuestIntent = pendingGuestIntent || getPendingGuestIntent();
  const activeGuestIntentType = String(activeGuestIntent?.type || "").trim();
  const hasActiveProductDeepLink = Boolean(getDeepLinkedProductIdFromRoute());
  const shouldKeepHomeFirst = nextView === "home"
    && Boolean(hasActiveProductDeepLink || activeGuestIntentType === "focus-product");
  if (activeGuestIntent && activeGuestIntentType !== "focus-product") {
    clearPendingDeepLinkProductRoute();
    if (String(window.location.pathname || "").trim().match(/^\/product\/.+/i)) {
      safeReplaceState(window.history.state || null, "/");
    }
  }
  setCurrentViewState(nextView, {
    syncHistory: shouldKeepHomeFirst ? false : "replace"
  });
  if (shouldKeepHomeFirst) {
    safeReplaceState(
      buildAppShellHistoryState({
        view: "home",
        productId: "",
        sourceProductId: "",
        pendingProfileSection: ""
      }),
      "/"
    );
    if (deferRender) {
      scheduleRenderCurrentView();
    } else {
      renderCurrentView();
    }
  } else if (deferRender) {
    scheduleRenderCurrentView();
  } else {
    renderCurrentView();
  }
  if (nextView !== "home") {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  } else if (!shouldKeepHomeFirst) {
    restoreStoredHomeScrollPosition();
  }
  if (productsContainer?.querySelector(".product-card, .seller-product-card") || nextView !== "home") {
    hideLifecycleFallbackShell();
  }
  updateProfileNavBadge();
  if (!isStaffUser()) {
    const hydrateRealtimeState = () => {
      connectRealtimeChannel();
      refreshPromotionsState().then(() => {
        if (currentView !== "profile") {
          requestCurrentSurfaceRefresh("promotions_state_refreshed", {
            productLimit: 6,
            decodeLimit: 2,
            prefetch: false
          });
        }
      });
      refreshOrdersState().then(() => {
        if (currentView !== "profile") {
          requestCurrentSurfaceRefresh("orders_state_refreshed", {
            productLimit: 6,
            decodeLimit: 2,
            prefetch: false
          });
        }
      });
    };
    if (deferRender) {
      window.setTimeout(hydrateRealtimeState, 120);
    } else {
      hydrateRealtimeState();
    }
  }
  resumePendingGuestIntent();
  const handledDeepLink = activeGuestIntent
    ? true
    : nextView === "home"
      ? openDeepLinkedProductRouteIfNeeded({ skipHomeRender: hasActiveProductDeepLink })
      : false;
  if (!skipWelcome && !isStaffUser() && !handledDeepLink) {
    if (deferRender) {
      window.setTimeout(showWelcomePopup, 80);
    } else {
      showWelcomePopup();
    }
  }
  if (!isStaffUser()) {
    refreshProductsAfterAuthChange();
  }
}

function logout() {
  beginLifecycleEpoch("logout");
  activeSessionRestoreToken += 1;
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
  clearPendingDeepLinkProductRoute();
  applySessionState(null);
    profileRuntimeState.pendingSection = "";
    profileRuntimeState.activeSection = "profile-products-panel";
    currentOrders = { purchases: [], sales: [] };
    currentMessages = [];
  currentNotifications = [];
  currentPromotions = [];
  buyerSellerAffinity = {};
  sharedCollectionIntentEntries = [];
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

window.addEventListener("winga:api-metric", (event) => {
  const detail = event?.detail || {};
  const endpoint = String(detail.endpoint || "");
  if (!endpoint.includes("/auth/")) {
    return;
  }
  const latencyMs = Number(detail.latencyMs || 0);
  if (detail.ok && latencyMs < 1500) {
    return;
  }
  window.setTimeout(() => {
    reportClientEvent(detail.ok ? "info" : "warn", "auth_api_latency", "Auth API latency metric captured.", {
      endpoint,
      status: Number(detail.status || 0),
      code: String(detail.code || ""),
      ok: Boolean(detail.ok),
      latencyMs: Math.round(latencyMs)
    });
  }, 0);
});

window.addEventListener("winga:products-hydrated", (event) => {
  const detail = event?.detail || {};
  productHydrationStatus = String(detail.status || "loaded");
  const retainedHomeSurface = currentView === "home" && hasRetainedHomeFeedSurface();
  reportBootPhase("product_data_loaded", {
    source: "products_hydrated_event",
    status: productHydrationStatus,
    count: Number(detail.count || 0)
  });
  if (productHydrationStatus === "failed") {
    if (!retainedHomeSurface && !hasImmediateProductsAvailable() && !hasVisibleStartupSurface({ includeFeedLoading: false })) {
      renderLifecycleFallbackSkeleton("Bidhaa hazijafika bado kutoka kwenye seva. Jaribu tena baada ya sekunde chache.");
    } else {
      hideLifecycleFallbackShell();
    }
  } else {
    hideLifecycleFallbackShell();
  }
  refreshProductsFromStore();
  auditHydratedDataIntegrity("products_hydrated");
  if (shouldDeferBootRenderForPendingStaffSession()) {
    return;
  }
  scheduleStartupImageWork(window.WingaDataLayer?.getProducts?.() || [], {
    reason: "products_hydrated",
    productLimit: 6,
    imageLimitPerProduct: 1,
    decodeLimit: 2,
    delayMs: 1600
  });
  scheduleDeferredImageSignatureHydration(window.WingaDataLayer?.getProducts?.() || [], {
    reason: "products_hydrated",
    productLimit: 24,
    delayMs: 3200
  });
  const canRenderWhileWaitingForDeepLink = !suppressInitialProductHomeRender || document.body.classList.contains("product-detail-open");
  if (canRenderWhileWaitingForDeepLink && currentView !== "profile") {
    if (
      currentView === "home"
      && resumeRetainedHomeFeedSurface("products_hydrated_retained", {
        productLimit: 8,
        decodeLimit: 3,
        delayMs: 0
      })
    ) {
      reportBootPhase("feed_retained", {
        reason: "products_hydrated_retained",
        productsCount: Array.isArray(products) ? products.length : 0
      });
    } else {
      renderCurrentView({ reason: "products_hydrated", force: true });
      reportBootPhase("feed_rendered", {
        reason: "products_hydrated",
        productsCount: Array.isArray(products) ? products.length : 0
      });
    }
  }
  if (tryOpenPendingDeepLinkProductRoute()) {
    return;
  }
  if (pendingDeepLinkProductId && String(window.location.pathname || "").match(/^\/product\/.+/i)) {
    window.requestAnimationFrame(() => {
      tryOpenPendingDeepLinkProductRoute();
    });
  }
});

window.addEventListener("winga:data-hydrated", (event) => {
  const source = String(event?.detail?.source || "").trim().toLowerCase();
  auditHydratedDataIntegrity(`data_hydrated_${source || "unknown"}`);
  if (shouldDeferBootRenderForPendingStaffSession()) {
    return;
  }
  if (source === "categories" || source === "users") {
    mergeAvailableCategories(inferCategoriesFromData());
    refreshCategoryUI();
    const canRenderWhileWaitingForDeepLink = !suppressInitialProductHomeRender || document.body.classList.contains("product-detail-open");
    if (canRenderWhileWaitingForDeepLink && currentView !== "profile") {
      requestCurrentSurfaceRefresh(`data_hydrated_${source}`, {
        productLimit: 6,
        decodeLimit: 2,
        prefetch: false
      });
    }
  }
});

window.addEventListener("winga:offline-actions-flushed", async (event) => {
  const flushedCount = Number(event?.detail?.count || 0);
  const remainingCount = Number(event?.detail?.remaining || 0);
  if (currentUser) {
    await Promise.all([
      refreshMessagesState(),
      refreshNotificationsState()
    ]).catch(() => {
      // Ignore passive refresh failures after queue flush.
    });
  }
  if (flushedCount > 0) {
    applyOfflineQueueFlushHints(flushedCount, remainingCount);
    showInAppNotification({
      title: "Offline actions synced",
      body: remainingCount > 0
        ? `${flushedCount} action${flushedCount === 1 ? "" : "s"} zimetumwa, ${remainingCount} zinasubiri.`
        : `${flushedCount} action${flushedCount === 1 ? "" : "s"} zimetumwa vizuri.`,
      variant: "success"
    });
    showNetworkStatusBanner({
      title: remainingCount > 0 ? "Baadhi ya actions zinasubiri" : "Offline actions zimesync",
      body: remainingCount > 0
        ? `${flushedCount} zimetumwa, ${remainingCount} bado zitasubiri network iwe thabiti.`
        : "Actions zako zote zilizokuwa zinasubiri zimetumwa vizuri.",
      variant: remainingCount > 0 ? "info" : "success",
      persistent: remainingCount > 0,
      durationMs: remainingCount > 0 ? 4200 : 2600
    });
  }
});

window.addEventListener("offline", () => {
  syncNetworkStatusBanner({ forceKeepVisible: true });
  if (!document.getElementById("payment-intent-modal")?.hidden) {
    renderPaymentIntentModal();
  }
});

window.addEventListener("online", () => {
  syncNetworkStatusBanner({ justReconnected: true });
  applyReconnectRecoveryHints();
  if (!document.getElementById("payment-intent-modal")?.hidden) {
    renderPaymentIntentModal();
  }
});

window.setTimeout(() => {
  syncNetworkStatusBanner();
}, 0);

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

feedLoadingRetryButton?.addEventListener("click", () => {
  reportClientEvent("info", "lifecycle_retry_clicked", "User manually retried lifecycle fallback shell.", {
    category: "runtime",
    reason: lifecycleFallbackReason || "manual_retry"
  });
  retryLifecycleFeedRestore("manual_retry");
  window.setTimeout(() => {
    if (!productsContainer?.querySelector(".product-card, .seller-product-card")) {
      window.location.reload();
    }
  }, 1800);
});

window.addEventListener("popstate", (event) => {
  const state = event?.state;
  if (!state || state.wingaProductDetail || !state.wingaAppShell) {
    if (applySharedCollectionRoute({ clearUrl: false }) && appContainer?.style.display !== "none") {
      renderCurrentView();
    }
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
  if (!SHOW_HOMEPAGE_HERO_PANEL || !heroPanel || !productsSummary) {
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
    (productsContainer || productsSummary)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const followedSellerIds = Array.from(ensureFollowedSellerIdsLoaded()).filter(Boolean);
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

  const followedSellerItems = followedSellerIds.length
    ? rankProductsForSurface(
      baseProducts.filter((product) => followedSellerIds.includes(product.uploadedBy)),
      {
        surface: "behavior_showcase",
        limit: 12,
        excludeIds,
        preferredCategories,
        searchTerms
      }
    )
    : [];

  if (followedSellerItems.length >= 3) {
    return {
      heading: "Following",
      title: "New from sellers you follow",
      subtitle: "Fresh picks from shops you chose to keep up with",
      items: followedSellerItems
    };
  }

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
    if (sectionIndex > 0) {
      const seedProduct = getRecommendationSeed(getFilteredProducts());
      const alternateDescriptors = [
        {
          heading: "New Products",
          title: topCategory ? `Fresh in ${getCategoryLabel(topCategory)}` : "Fresh listings from active sellers",
          subtitle: "New stock appears as you keep scrolling.",
          items: getNewestProducts({
            limit: 12,
            excludeIds,
            seedProduct,
            sourceProducts: baseProducts
          })
        },
        {
          heading: "Most Searched",
          title: topCategory ? `Popular in ${getCategoryLabel(topCategory)}` : "Popular products buyers search for most",
          subtitle: "High-intent products moving through the marketplace right now.",
          items: getMostSearchedProducts(seedProduct, {
            limit: 12,
            excludeIds,
            sourceProducts: baseProducts
          })
        },
        {
          heading: "Trending",
          title: "Most viewed and most interacted products",
          subtitle: "Marketplace momentum keeps discovery moving.",
          items: getTrendingProducts(12, excludeIds, baseProducts)
        }
      ];
      const alternateDescriptor = alternateDescriptors[(sectionIndex - 1) % alternateDescriptors.length];
      if (Array.isArray(alternateDescriptor?.items) && alternateDescriptor.items.length >= 3) {
        return alternateDescriptor;
      }
    }
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
  getSharedCollectionIntentEntries: () => sharedCollectionIntentEntries.slice(),
  getFollowedSellerIds: () => Array.from(ensureFollowedSellerIdsLoaded()).filter(Boolean),
  getBuyerSellerAffinityEntries,
  getCurrentSession: () => currentSession,
  normalizeOptionalPrice
});

function renderDiscoveryProductCards(items, options = {}) {
  const { sponsored = false, priorityCount = 0 } = options;
  const renderableItems = (Array.isArray(items) ? items : []).filter((item) => getMarketplacePrimaryImage(item));
  if (!renderableItems.length) {
    return "";
  }

  return `
    <div class="seller-products-grid">
      ${renderableItems.map((item, index) => {
        const isPriority = index < Math.max(0, Number(priorityCount || 0));
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
          <article class="seller-product-card${Array.isArray(item.images) && item.images.length > 1 ? " has-gallery-count-badge" : ""}" data-open-product="${item.id}">
            <div class="seller-product-card-media">
              ${renderFeedGalleryMarkup(item, "feed", { priorityCount: isPriority ? 1 : 0, preload: isPriority })}
            </div>
            ${renderProductOverflowMenu(item, { overlay: true })}
            <div class="product-seller-row">
              <div class="product-seller-avatar">${sellerAvatar}${seller?.verifiedSeller ? `<span class="product-seller-avatar-verified-badge" aria-label="Verified seller" title="Verified seller">✓</span>` : ""}</div>
              <div class="product-seller-copy">
                <strong class="product-seller-name">${sellerName}</strong>
              </div>
              <div class="product-seller-badge-row product-seller-inline-actions">
                ${renderSellerCardInlineActions(item)}
              </div>
            </div>
            <div class="product-card-caption-block${safeCaption.length > 120 ? " is-collapsed" : ""}">
              <p class="product-card-caption">${safeCaption}</p>
              ${safeCaption.length > 120 ? `<button class="product-caption-toggle" type="button" data-product-caption-toggle="true" aria-expanded="false">See more</button>` : ""}
            </div>
            ${item.feedVariantResurface ? `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">Other color</span></p>` : ""}
            ${promotion ? `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">${escapeHtml(getPromotionLabel(promotion.type))}</span></p>` : ""}
            ${renderSellerPromotionAnalytics(item)}
${renderProductActionGroup(item, { requestLabel: "My Request", extraClass: "seller-product-actions seller-product-actions-compact" })}
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
  const rankedNewest = (Array.isArray(sourceProducts) ? sourceProducts : products)
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && shouldRenderMarketplaceProduct(product)
      && !excludeIds.has(product.id)
      && product.id !== seedProduct?.id
    )
    .sort(compareProductsNewestFirst);
  return limitProductsPerSeller(rankedNewest, limit, 2);
}

function rememberContinuousDiscoveryIds(currentIds = [], nextIds = [], limit = 40) {
  return [...currentIds, ...nextIds.filter(Boolean)].slice(-limit);
}

function getUniqueRenderableImageIndexes(product) {
  const images = getRenderableMarketplaceImages(product);
  const seen = new Set();
  const indexes = [];
  images.forEach((image, index) => {
    if (!image || seen.has(image)) {
      return;
    }
    seen.add(image);
    indexes.push(index);
  });
  return indexes;
}

function getProductFeedLeadImageIndex(product) {
  const images = getRenderableMarketplaceImages(product);
  if (!images.length) {
    return 0;
  }
  const explicitIndex = Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex);
  if (Number.isFinite(explicitIndex) && explicitIndex >= 0 && explicitIndex < images.length) {
    return explicitIndex;
  }
  const primaryImage = getMarketplacePrimaryImage(product);
  const primaryIndex = images.findIndex((image) => image === primaryImage);
  return primaryIndex >= 0 ? primaryIndex : 0;
}

function markVariantImageAsShown(target, productId, imageIndex) {
  if (!target || typeof target !== "object") {
    return;
  }
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) {
    return;
  }
  const normalizedIndex = Number(imageIndex);
  if (!Number.isFinite(normalizedIndex) || normalizedIndex < 0) {
    return;
  }
  const nextIndexes = Array.isArray(target[normalizedProductId]) ? target[normalizedProductId].slice() : [];
  if (!nextIndexes.includes(normalizedIndex)) {
    nextIndexes.push(normalizedIndex);
  }
  target[normalizedProductId] = nextIndexes;
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
  disposeScopedRenderMemory(section);
  section.querySelectorAll("[data-open-product], [data-product-card]").forEach((card) => {
    productEngagementObserver?.unobserve?.(card);
    productCardEngagementState.delete(card);
  });
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
    className: "continuous-discovery-anchor continuous-discovery-sentinel",
    attributes: {
      "data-continuous-discovery-anchor": "home",
      "aria-hidden": "true"
    }
  });
  return anchor;
}

function buildHomeFeedEntryKey(item, options = {}) {
  const productId = String(item?.id || item?.productId || "").trim();
  const sequenceIndex = Number(options.sequenceIndex ?? item?.feedSequenceIndex ?? 0) || 0;
  if (item?.feedVariantResurface || item?.resurfacedVariant) {
    const variantDisplayIndex = Number(item?.variantDisplayIndex ?? item?.visibleImageIndex ?? item?.feedInitialImageIndex ?? 0) || 0;
    return sequenceIndex > 0
      ? `variant:${productId}:${variantDisplayIndex}:${sequenceIndex}`
      : `variant:${productId}:${variantDisplayIndex}`;
  }
  return sequenceIndex > 0 ? `product:${productId}:${sequenceIndex}` : `product:${productId}`;
}

function hasRenderedFeedEntryKey(container, key) {
  const stableKey = String(key || "").trim();
  if (!container || !stableKey || typeof container.querySelectorAll !== "function") {
    return false;
  }
  return Array.from(container.querySelectorAll("[data-feed-entry-key]"))
    .some((node) => String(node?.dataset?.feedEntryKey || "").trim() === stableKey);
}

function getSmartVariantIndex(feedPosition = 0, variantCount = 1) {
  const safeVariantCount = Math.max(1, Number(variantCount || 1) || 1);
  const safeFeedPosition = Math.max(0, Number(feedPosition || 0) || 0);
  return safeFeedPosition % safeVariantCount;
}

function getProductVariantCount(product) {
  const explicitCount = Number(product?.variantCount);
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.floor(explicitCount);
  }
  const variantArrayCount = Array.isArray(product?.variants)
    ? product.variants.length
    : (Array.isArray(product?.variations) ? product.variations.length : 0);
  if (variantArrayCount > 0) {
    return variantArrayCount;
  }
  return Math.max(1, getUniqueRenderableImageIndexes(product).length || 1);
}

function isVariantFeedEntry(item) {
  return Boolean(
    item?.feedVariantResurface
    || item?.resurfacedVariant
    || String(item?.feedEntryType || "").trim().toLowerCase() === "variant"
  );
}

function buildContinuousDiscoveryCandidateKey(item) {
  const productId = String(item?.id || item?.productId || "").trim();
  if (!productId) {
    return "";
  }
  if (isVariantFeedEntry(item)) {
    const visibleImageIndex = Number(item?.visibleImageIndex ?? item?.feedInitialImageIndex ?? 0) || 0;
    return `variant:${productId}:${visibleImageIndex}`;
  }
  return `product:${productId}`;
}

function dedupeContinuousDiscoveryFeedItems(items = []) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) {
    return [];
  }
  const seenKeys = new Set();
  const deduped = [];
  safeItems.forEach((item) => {
    const candidateKey = buildContinuousDiscoveryCandidateKey(item);
    if (!candidateKey || seenKeys.has(candidateKey)) {
      return;
    }
    seenKeys.add(candidateKey);
    deduped.push(item);
  });
  return deduped;
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

function createContinuousDiscoveryStreamElements(descriptor, index, anchorKind = "home") {
  if (!descriptor || !Array.isArray(descriptor.items) || !descriptor.items.length) {
    return [];
  }
  return descriptor.items.map((item, itemIndex) => {
    const feedPosition = (index * 100) + itemIndex;
    const variantCount = getProductVariantCount(item);
    const variantDisplayIndex = isVariantFeedEntry(item)
      ? getSmartVariantIndex(feedPosition, variantCount)
      : 0;
    const stableFeedSequenceIndex = Number(item?.feedSequenceIndex ?? feedPosition + 1) || (feedPosition + 1);
    const feedEntrySeed = {
      ...item,
      feedEntryType: item?.feedVariantResurface ? "variant" : "product",
      feedSequenceIndex: stableFeedSequenceIndex,
      variantCount,
      variantDisplayIndex,
      feedInitialImageIndex: variantDisplayIndex,
      visibleImageIndex: variantDisplayIndex
    };
    const feedEntry = {
      ...feedEntrySeed,
      feedEntryKey: buildHomeFeedEntryKey(feedEntrySeed, {
        sequenceIndex: stableFeedSequenceIndex,
        variantDisplayIndex
      })
    };
    const card = createProductCardElement(feedEntry, {
      startupPriority: itemIndex < 2
    });
    if (!(card instanceof Element)) {
      return null;
    }
    card.setAttribute("data-continuous-discovery-stream", `${anchorKind}-${index}`);
    card.setAttribute("data-continuous-discovery-kind", descriptor.kind || "stream");
    card.setAttribute("data-continuous-stream-index", String(itemIndex + 1));
    return card;
  }).filter(Boolean);
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

function reorderProductImagesForVariant(product, variantIndex = 1) {
  const images = getRenderableMarketplaceImages(product);
  if (images.length < 2) {
    return images;
  }
  const uniqueImages = Array.from(new Set(images.filter(Boolean)));
  if (uniqueImages.length < 2) {
    return uniqueImages;
  }
  const normalizedIndex = Math.max(1, Math.min(uniqueImages.length - 1, Number(variantIndex || 1)));
  const leadImage = uniqueImages[normalizedIndex];
  return [leadImage, ...uniqueImages.filter((image) => image !== leadImage)];
}

function getVariantInitialImageIndex(product, variantIndex = 1) {
  const uniqueImageIndexes = getUniqueRenderableImageIndexes(product);
  if (uniqueImageIndexes.length < 2) {
    return 0;
  }
  const normalizedIndex = Math.max(1, Math.min(uniqueImageIndexes.length - 1, Number(variantIndex || 1)));
  return uniqueImageIndexes[normalizedIndex] ?? 0;
}

function getProductVariationBehaviorState(productId) {
  const normalizedProductId = normalizeProductIdValue(productId);
  if (!normalizedProductId) {
    return {
      liked: false,
      lingerMs: 0,
      variationSwipeCount: 0,
      updatedAt: 0
    };
  }
  return {
    liked: Boolean(productVariationSignalState[normalizedProductId]?.liked || isProductSaved(normalizedProductId)),
    lingerMs: Math.max(0, Number(productVariationSignalState[normalizedProductId]?.lingerMs || 0)),
    variationSwipeCount: Math.max(0, Number(productVariationSignalState[normalizedProductId]?.variationSwipeCount || 0)),
    updatedAt: Math.max(0, Number(productVariationSignalState[normalizedProductId]?.updatedAt || 0))
  };
}

function resolvePreferredVariantImageIndex(candidateIndexes = [], preferredIndex = -1) {
  const safeIndexes = Array.from(candidateIndexes || [])
    .map((index) => Number(index))
    .filter((index) => Number.isFinite(index) && index > 0)
    .sort((left, right) => left - right);
  if (!safeIndexes.length) {
    return -1;
  }
  const normalizedPreferredIndex = Number(preferredIndex);
  if (!Number.isFinite(normalizedPreferredIndex) || normalizedPreferredIndex < 1) {
    return safeIndexes[0];
  }
  if (safeIndexes.includes(normalizedPreferredIndex)) {
    return normalizedPreferredIndex;
  }
  return safeIndexes.find((index) => index >= normalizedPreferredIndex) ?? safeIndexes[safeIndexes.length - 1];
}

function shouldUseVariantScrollSlot(normalProductOrdinal = 0) {
  const safeOrdinal = Math.max(0, Number(normalProductOrdinal || 0) || 0);
  return safeOrdinal >= 15 && safeOrdinal % 15 === 0;
}

function getDeterministicVariantSlotIndex(candidateIndexes = [], options = {}) {
  const safeIndexes = Array.from(candidateIndexes || [])
    .map((index) => Number(index))
    .filter((index) => Number.isFinite(index) && index > 0);
  if (!safeIndexes.length) {
    return -1;
  }
  const deeperIndexes = safeIndexes.filter((index) => index >= 2);
  const pool = deeperIndexes.length ? deeperIndexes : safeIndexes;
  const seed = Math.max(
    0,
    Number(options.batchIndex || 0)
    + Number(options.normalProductOrdinal || 0)
    + Number(options.variationSwipeCount || 0)
    + Number(options.sequenceIndex || 0)
  );
  return pool[seed % pool.length] ?? pool[0] ?? -1;
}

function getStableVariantSelectionSeed(productId = "", options = {}) {
  const normalizedProductId = String(productId || "").trim();
  let productHash = 0;
  for (let index = 0; index < normalizedProductId.length; index += 1) {
    productHash = (productHash * 31 + normalizedProductId.charCodeAt(index)) % 104729;
  }
  return Math.max(
    0,
    productHash
    + Number(options.batchIndex || 0)
    + Number(options.normalProductOrdinal || 0)
    + Number(options.variationSwipeCount || 0)
    + Number(options.sequenceIndex || 0)
  );
}

function getBehaviorDrivenVariantImageIndex(product, options = {}) {
  const uniqueImageIndexes = getUniqueRenderableImageIndexes(product).filter((index) => Number(index) > 0);
  if (!uniqueImageIndexes.length) {
    return -1;
  }
  const shownIndexes = new Set(
    Array.from(options.shownIndexes || [])
      .map((index) => Number(index))
      .filter((index) => Number.isFinite(index) && index >= 0)
  );
  shownIndexes.add(getProductFeedLeadImageIndex(product));
  const availableIndexes = uniqueImageIndexes.filter((index) => !shownIndexes.has(index));
  if (!availableIndexes.length) {
    return -1;
  }
  const deeperAvailableIndexes = availableIndexes.filter((index) => index >= 2);

  const behaviorState = getProductVariationBehaviorState(product?.id);
  const hasBoost = Boolean(getPrimaryPromotion(product?.id) || Number(getPromotionCommercialScore?.(product) || 0) > 0);
  const hasLiked = behaviorState.liked;
  const hasDeepLinger = behaviorState.lingerMs >= 10000;
  const slotTriggered = shouldUseVariantScrollSlot(options.normalProductOrdinal);
  const selectionSeed = getStableVariantSelectionSeed(product?.id, {
    batchIndex: options.batchIndex,
    normalProductOrdinal: options.normalProductOrdinal,
    variationSwipeCount: behaviorState.variationSwipeCount,
    sequenceIndex: options.sequenceIndex
  });

  const prioritizedCandidates = [];
  if (hasDeepLinger) {
    prioritizedCandidates.push(resolvePreferredVariantImageIndex(availableIndexes, 3));
  }
  if (hasLiked) {
    prioritizedCandidates.push(resolvePreferredVariantImageIndex(availableIndexes, 2));
  }
  if (slotTriggered && deeperAvailableIndexes.length) {
    prioritizedCandidates.push(getDeterministicVariantSlotIndex(deeperAvailableIndexes, {
      batchIndex: selectionSeed,
      normalProductOrdinal: options.normalProductOrdinal,
      variationSwipeCount: behaviorState.variationSwipeCount,
      sequenceIndex: options.sequenceIndex
    }));
  }
  if (hasBoost) {
    prioritizedCandidates.push(resolvePreferredVariantImageIndex(availableIndexes, 1));
  }
  const selectedIndex = prioritizedCandidates.find((index) => Number.isFinite(index) && index >= 1);
  if (Number.isFinite(selectedIndex) && selectedIndex >= 1) {
    return selectedIndex;
  }
  if (deeperAvailableIndexes.length) {
    return getDeterministicVariantSlotIndex(deeperAvailableIndexes, {
      batchIndex: selectionSeed,
      normalProductOrdinal: options.normalProductOrdinal,
      variationSwipeCount: behaviorState.variationSwipeCount,
      sequenceIndex: options.sequenceIndex
    });
  }
  return availableIndexes[0];
}

function getNextVariantResurfaceImageIndex(product, shownIndexes = []) {
  return getBehaviorDrivenVariantImageIndex(product, { shownIndexes });
}

function getVariantResurfacedProducts(options = {}) {
  const {
    limit = HOME_VARIANT_MAX_PER_BATCH,
    recentIds = [],
    usedIds = new Set(),
    variantCounts = {},
    variantLastBatchIndex = {},
    variantShownImageIndexes = {},
    productLastAppearanceOrdinal = {},
    normalProductOrdinal = 0,
    lastVariantNormalOrdinal = -HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN,
    batchIndex = 0,
    sourceProducts = null
  } = options;
  const recentIdSet = new Set(Array.from(recentIds || []).filter(Boolean));
  const usedIdSet = new Set(Array.from(usedIds || []).filter(Boolean));
  const counts = variantCounts && typeof variantCounts === "object" ? variantCounts : {};
  const lastBatchMap = variantLastBatchIndex && typeof variantLastBatchIndex === "object" ? variantLastBatchIndex : {};
  const shownIndexesMap = variantShownImageIndexes && typeof variantShownImageIndexes === "object" ? variantShownImageIndexes : {};
  const appearanceOrdinalMap = productLastAppearanceOrdinal && typeof productLastAppearanceOrdinal === "object"
    ? productLastAppearanceOrdinal
    : {};
  if (
    batchIndex < HOME_VARIANT_RESURFACE_MIN_BATCH_INDEX
    || recentIdSet.size < HOME_VARIANT_RESURFACE_MIN_RECENT_IDS
    || normalProductOrdinal < HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN
    || (normalProductOrdinal - Number(lastVariantNormalOrdinal || 0)) < HOME_VARIANT_GLOBAL_NORMAL_PRODUCT_GAP
  ) {
    return [];
  }
  const baseProducts = (Array.isArray(sourceProducts) ? sourceProducts : products)
    .filter((product) => {
      if (
        product.status !== "approved"
        || product.availability === "sold_out"
        || !shouldRenderMarketplaceProduct(product)
        || !usedIdSet.has(product.id)
        || recentIdSet.has(product.id)
      ) {
        return false;
      }
      const uniqueImageIndexes = getUniqueRenderableImageIndexes(product);
      if (uniqueImageIndexes.length < 2) {
        return false;
      }
      const surfacedCount = Number(counts[product.id] || 0);
      const lastBatchIndex = Number(lastBatchMap[product.id] || -HOME_VARIANT_RESURFACE_BATCH_GAP);
      const lastAppearanceOrdinal = Number(appearanceOrdinalMap[product.id] || 0);
      const nextImageIndex = getBehaviorDrivenVariantImageIndex(product, {
        shownIndexes: shownIndexesMap[product.id] || [],
        batchIndex,
        normalProductOrdinal
      });
      return (
        nextImageIndex >= 0
        && surfacedCount < Math.min(HOME_VARIANT_RESURFACE_MAX_PER_PRODUCT, uniqueImageIndexes.length - 1)
        && (batchIndex - lastBatchIndex) >= HOME_VARIANT_RESURFACE_BATCH_GAP
        && (normalProductOrdinal - lastAppearanceOrdinal) >= HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN
      );
    })
    .sort((first, second) => {
      const promotionDelta = Number(getPromotionCommercialScore?.(second) || 0) - Number(getPromotionCommercialScore?.(first) || 0);
      if (promotionDelta !== 0) {
        return promotionDelta;
      }
      const secondDistance = normalProductOrdinal - Number(appearanceOrdinalMap[second.id] || 0);
      const firstDistance = normalProductOrdinal - Number(appearanceOrdinalMap[first.id] || 0);
      if (secondDistance !== firstDistance) {
        return secondDistance - firstDistance;
      }
      const engagementDelta = getHomeFeedEngagementScore(second) - getHomeFeedEngagementScore(first);
      if (engagementDelta !== 0) {
        return engagementDelta;
      }
      return compareProductsNewestFirst(first, second);
    });

  const items = [];
  const sellerCounts = new Map();
  baseProducts.forEach((product) => {
    if (items.length >= limit) {
      return;
    }
    const sellerId = String(product.uploadedBy || "");
    const currentSellerCount = sellerCounts.get(sellerId) || 0;
    if (sellerId && currentSellerCount >= 1) {
      return;
    }
    const existingVariantCount = Number(counts[product.id] || 0);
    const initialImageIndex = getBehaviorDrivenVariantImageIndex(product, {
      shownIndexes: shownIndexesMap[product.id] || [],
      batchIndex,
      normalProductOrdinal
    });
    const allImages = getRenderableMarketplaceImages(product);
    if (allImages.length < 2 || initialImageIndex <= 0 || allImages[initialImageIndex] === getMarketplacePrimaryImage(product)) {
      return;
    }
    items.push({
      ...product,
      feedVariantResurface: true,
      resurfacedVariant: true,
      feedVariantIndex: existingVariantCount + 1,
      feedVariantSourceId: product.id,
      feedInitialImageIndex: initialImageIndex,
      visibleImageIndex: initialImageIndex
    });
    if (sellerId) {
      sellerCounts.set(sellerId, currentSellerCount + 1);
    }
  });

  return items;
}

function mergeVariantResurfacingIntoStream(streamItems = [], options = {}) {
  const baseItems = Array.isArray(streamItems) ? streamItems.slice() : [];
  if (baseItems.length < HOME_VARIANT_MIN_STREAM_ITEMS_BEFORE_INSERT) {
    return baseItems;
  }
  const variantItems = getVariantResurfacedProducts({
    ...options,
    limit: HOME_VARIANT_MAX_PER_BATCH
  });
  if (!variantItems.length) {
    return baseItems;
  }
  const dynamicOffset = Math.min(
    2,
    Math.max(
      0,
      (Number(options?.batchIndex || 0) % 2)
      + (Number(options?.normalProductOrdinal || 0) % 2)
    )
  );
  const insertAfter = Math.max(
    3,
    Math.min(baseItems.length - 2, HOME_VARIANT_STREAM_INSERT_AFTER + dynamicOffset)
  );
  baseItems.splice(insertAfter, 0, variantItems[0]);
  return baseItems;
}

function getHomeContinuousStreamProducts(options = {}) {
  const {
    limit = 10,
    recentIds = [],
    usedIds = new Set(),
    seedProduct = null,
    sourceProducts = null
  } = options;
  const recentIdSet = new Set(Array.from(recentIds || []).filter(Boolean));
  const usedIdSet = new Set(Array.from(usedIds || []).filter(Boolean));
  const seedProductId = String(seedProduct?.id || "").trim();
  const preferredCategory = inferTopCategoryValue(seedProduct?.category || "");
  const unseenPool = (Array.isArray(sourceProducts) ? sourceProducts : products)
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && shouldRenderMarketplaceProduct(product)
      && product.id !== seedProductId
      && !usedIdSet.has(product.id)
      && !recentIdSet.has(product.id)
    )
    .sort((first, second) => {
      const secondPromotion = Number(getPromotionCommercialScore?.(second) || 0);
      const firstPromotion = Number(getPromotionCommercialScore?.(first) || 0);
      if (secondPromotion !== firstPromotion) {
        return secondPromotion - firstPromotion;
      }
      const secondCategoryMatch = preferredCategory && inferTopCategoryValue(second.category || "") === preferredCategory ? 1 : 0;
      const firstCategoryMatch = preferredCategory && inferTopCategoryValue(first.category || "") === preferredCategory ? 1 : 0;
      if (secondCategoryMatch !== firstCategoryMatch) {
        return secondCategoryMatch - firstCategoryMatch;
      }
      const engagementDelta = getHomeFeedEngagementScore(second) - getHomeFeedEngagementScore(first);
      if (engagementDelta !== 0) {
        return engagementDelta;
      }
      return compareProductsNewestFirst(first, second);
    });

  const fallbackPool = (Array.isArray(sourceProducts) ? sourceProducts : products)
    .filter((product) =>
      product.status === "approved"
      && product.availability !== "sold_out"
      && shouldRenderMarketplaceProduct(product)
      && product.id !== seedProductId
      && !recentIdSet.has(product.id)
    )
    .sort((first, second) => {
      const promotionDelta = Number(getPromotionCommercialScore?.(second) || 0) - Number(getPromotionCommercialScore?.(first) || 0);
      if (promotionDelta !== 0) {
        return promotionDelta;
      }
      return compareProductsNewestFirst(first, second);
    });

  const primarySelection = limitProductsPerSeller(unseenPool, limit, 1);
  if (primarySelection.length >= Math.min(limit, 4)) {
    return primarySelection.slice(0, limit);
  }
  const combined = [];
  const seenIds = new Set();
  [...primarySelection, ...limitProductsPerSeller(fallbackPool, limit * 2, 1)].forEach((product) => {
    if (!product || seenIds.has(product.id) || combined.length >= limit) {
      return;
    }
    seenIds.add(product.id);
    combined.push(product);
  });
  return combined.slice(0, limit);
}

function shouldPreferHomeContinuousMarketplaceStream() {
  return getViewportWidth() <= 720;
}

function getContinuousDiscoveryDescriptor(options = {}) {
  const {
    seedProduct = null,
    usedIds = new Set(),
    recentIds = [],
    batchIndex = 0,
    variantCounts = {},
    variantLastBatchIndex = {},
    variantShownImageIndexes = {},
    productLastAppearanceOrdinal = {},
    normalProductOrdinal = 0,
    lastVariantNormalOrdinal = -HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN
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
  const shouldPreferMarketplaceStream = shouldPreferHomeContinuousMarketplaceStream()
    ? true
    : (batchIndex === 0 || batchIndex % 3 !== 1);
  const streamItems = getHomeContinuousStreamProducts({
    limit: batchIndex === 0 ? 10 : 8,
    recentIds,
    usedIds,
    seedProduct: preferredSeed,
    sourceProducts: renderableProducts
  });
  const streamItemsWithVariants = dedupeContinuousDiscoveryFeedItems(mergeVariantResurfacingIntoStream(streamItems, {
    recentIds,
    usedIds,
    batchIndex,
    variantCounts,
    variantLastBatchIndex,
    variantShownImageIndexes,
    productLastAppearanceOrdinal,
    normalProductOrdinal,
    lastVariantNormalOrdinal,
    sourceProducts: renderableProducts
  }));
  const sponsoredItems = getDiscoverySponsoredProducts(preferredSeed, {
    limit: batchIndex === 0 ? 6 : 4,
    excludeIds: softExcludeIds
  });

  if (shouldPreferMarketplaceStream && streamItems.length >= minimumBatchSize) {
    return {
      kind: "stream",
      eyebrow: "Marketplace Stream",
      title: "More products from different sellers keep loading",
      subtitle: "As long as you keep scrolling, Winga keeps pulling more active listings into the feed.",
      items: streamItemsWithVariants
    };
  }

  if (batchIndex === 0 && sponsoredItems.length >= 1) {
    return {
      kind: "sponsored",
      eyebrow: "Sponsored Picks",
      title: "Promoted products in the spotlight",
      subtitle: "Paid visibility items are placed earlier so buyers notice them faster.",
      sponsored: true,
      items: sponsoredItems
    };
  }

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

  if (sponsoredItems.length >= 1) {
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
  if (streamItems.length) {
    return {
      kind: "stream",
      eyebrow: "Marketplace Stream",
      title: "More products from the market",
      subtitle: "Winga keeps the main feed moving with active listings from different sellers.",
      items: streamItemsWithVariants.slice(0, streamItems.length + HOME_VARIANT_MAX_PER_BATCH)
    };
  }
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
  if (homeContinuousDiscoveryRuntime.sentinelObserver) {
    homeContinuousDiscoveryRuntime.sentinelObserver.disconnect();
  }
  if (homeContinuousDiscoveryRuntime.virtualObserver) {
    homeContinuousDiscoveryRuntime.virtualObserver.disconnect();
  }
  if (homeContinuousDiscoveryRuntime.reobserveTimer) {
    window.clearTimeout(homeContinuousDiscoveryRuntime.reobserveTimer);
  }
  homeContinuousDiscoveryRuntime = {
    observer: null,
    sentinelObserver: null,
    virtualObserver: null,
    sentinelTargets: [],
    batchIndex: 0,
    recentIds: [],
    usedIds: new Set(),
    variantSurfaceCounts: {},
    variantLastBatchIndex: {},
    variantShownImageIndexes: {},
    productLastAppearanceOrdinal: {},
    normalProductOrdinal: 0,
    lastVariantNormalOrdinal: -HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN,
    preparedDescriptor: null,
    preparedDescriptorBatchIndex: -1,
    lastEarlyLoadAt: 0,
    loading: false,
    seedProductId: "",
    reobserveTimer: 0,
    lastHydrateAt: 0,
    readyQueue: [],
    virtualList: [],
    lastBackendRefreshAt: 0,
    backendRefreshPromise: null,
    lastSentinelFetchAt: 0,
    lastSentinelPreloadAt: 0,
    lastSentinelInjectAt: 0
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
  }, getAdaptiveContinuousReobserveDelayMs());
}

function trimHomeContinuousDiscoverySections(anchor) {
  const container = anchor?.closest?.("#products-container");
  if (!container) {
    return;
  }
  const groupKeys = [];
  Array.from(container.querySelectorAll("[data-continuous-discovery-section], [data-continuous-discovery-stream]")).forEach((element) => {
    const key = String(
      element.getAttribute("data-continuous-discovery-section")
      || element.getAttribute("data-continuous-discovery-stream")
      || ""
    ).trim();
    if (key && !groupKeys.includes(key)) {
      groupKeys.push(key);
    }
  });
  if (groupKeys.length <= MAX_ACTIVE_HOME_CONTINUOUS_SECTIONS) {
    return;
  }
  reportShowcaseInstrumentation("continuous_feed_retention_groups", {
    retainedGroupCount: groupKeys.length,
    maxLegacyTrimThreshold: MAX_ACTIVE_HOME_CONTINUOUS_SECTIONS
  });
}

function pruneHomeContinuousDiscoveryRuntimeState() {
  const recentIds = Array.isArray(homeContinuousDiscoveryRuntime.recentIds)
    ? homeContinuousDiscoveryRuntime.recentIds
    : [];
  const activeIds = new Set([
    ...Array.from(homeContinuousDiscoveryRuntime.usedIds || []),
    ...recentIds,
    ...Object.keys(homeContinuousDiscoveryRuntime.variantSurfaceCounts || {})
  ].filter(Boolean));

  if (homeContinuousDiscoveryRuntime.usedIds instanceof Set) {
    pruneOrderedIdSet(homeContinuousDiscoveryRuntime.usedIds, MAX_HOME_CONTINUOUS_USED_IDS);
  }

  if (Array.isArray(homeContinuousDiscoveryRuntime.recentIds) && homeContinuousDiscoveryRuntime.recentIds.length > MAX_HOME_CONTINUOUS_USED_IDS) {
    homeContinuousDiscoveryRuntime.recentIds = homeContinuousDiscoveryRuntime.recentIds.slice(-MAX_HOME_CONTINUOUS_USED_IDS);
  }

  const variantShownImageIndexes = homeContinuousDiscoveryRuntime.variantShownImageIndexes || {};
  Object.keys(variantShownImageIndexes).forEach((productId) => {
    if (!activeIds.has(productId)) {
      delete variantShownImageIndexes[productId];
      return;
    }
    const shownIndexes = Array.isArray(variantShownImageIndexes[productId]) ? variantShownImageIndexes[productId] : [];
    if (shownIndexes.length > HOME_CONTINUOUS_VARIANT_TRACK_LIMIT) {
      variantShownImageIndexes[productId] = shownIndexes.slice(-HOME_CONTINUOUS_VARIANT_TRACK_LIMIT);
    }
  });

  const variantSurfaceCounts = homeContinuousDiscoveryRuntime.variantSurfaceCounts || {};
  Object.keys(variantSurfaceCounts).forEach((productId) => {
    if (!activeIds.has(productId)) {
      delete variantSurfaceCounts[productId];
    }
  });

  const variantLastBatchIndex = homeContinuousDiscoveryRuntime.variantLastBatchIndex || {};
  Object.keys(variantLastBatchIndex).forEach((productId) => {
    if (!activeIds.has(productId)) {
      delete variantLastBatchIndex[productId];
    }
  });

  const productLastAppearanceOrdinal = homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal || {};
  Object.keys(productLastAppearanceOrdinal).forEach((productId) => {
    if (!activeIds.has(productId)) {
      delete productLastAppearanceOrdinal[productId];
    }
  });
}

function prepareNextContinuousDiscoveryDescriptor() {
  if (
    currentView !== "home"
    || homeContinuousDiscoveryRuntime.loading
    || homeContinuousDiscoveryRuntime.preparingDescriptor
  ) {
    if (homeContinuousDiscoveryRuntime.preparingDescriptor) {
      bumpRuntimeDiagnostic("preparedDescriptorSkipCount");
    }
    return null;
  }
  if (homeContinuousDiscoveryRuntime.preparedDescriptor && homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex === homeContinuousDiscoveryRuntime.batchIndex) {
    return homeContinuousDiscoveryRuntime.preparedDescriptor;
  }
  homeContinuousDiscoveryRuntime.preparingDescriptor = true;
  try {
    const seedProduct = getProductById(homeContinuousDiscoveryRuntime.seedProductId) || getRecommendationSeed(getFilteredProducts());
    const descriptor = getContinuousDiscoveryDescriptor({
      seedProduct,
      usedIds: homeContinuousDiscoveryRuntime.usedIds,
      recentIds: homeContinuousDiscoveryRuntime.recentIds,
      batchIndex: homeContinuousDiscoveryRuntime.batchIndex,
      variantCounts: homeContinuousDiscoveryRuntime.variantSurfaceCounts,
      variantLastBatchIndex: homeContinuousDiscoveryRuntime.variantLastBatchIndex,
      variantShownImageIndexes: homeContinuousDiscoveryRuntime.variantShownImageIndexes,
      productLastAppearanceOrdinal: homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal,
      normalProductOrdinal: homeContinuousDiscoveryRuntime.normalProductOrdinal,
      lastVariantNormalOrdinal: homeContinuousDiscoveryRuntime.lastVariantNormalOrdinal
    });
    if (!descriptor || !Array.isArray(descriptor.items) || !descriptor.items.length) {
      homeContinuousDiscoveryRuntime.preparedDescriptor = null;
      homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex = -1;
      return null;
    }
    homeContinuousDiscoveryRuntime.preparedDescriptor = {
      ...descriptor,
      items: descriptor.items.slice()
    };
    homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex = homeContinuousDiscoveryRuntime.batchIndex;
    primeIncomingFeedItems(homeContinuousDiscoveryRuntime.preparedDescriptor.items, {
      reason: `continuous_discovery_prepared_${homeContinuousDiscoveryRuntime.batchIndex}`,
      productLimit: descriptor.kind === "stream"
        ? Math.min(descriptor.items.length, 8)
        : Math.min(descriptor.items.length, 4),
      decodeLimit: descriptor.kind === "stream"
        ? Math.min(descriptor.items.length, 5)
        : Math.min(descriptor.items.length, 2)
    });
    if (descriptor.kind === "stream") {
      // Prime the chosen resurfaced image and its immediate swipe neighbors
      // without mutating the product gallery. This keeps manual swipe intact
      // while making injected variants feel native in the feed.
      primeVariantInjectionImages(homeContinuousDiscoveryRuntime.preparedDescriptor.items, {
        reason: `continuous_discovery_variant_prepared_${homeContinuousDiscoveryRuntime.batchIndex}`
      });
    }
    prepareContinuousDescriptorMedia(homeContinuousDiscoveryRuntime.preparedDescriptor, `sentinel_a_fetch_${homeContinuousDiscoveryRuntime.batchIndex}`);
    return homeContinuousDiscoveryRuntime.preparedDescriptor;
  } finally {
    homeContinuousDiscoveryRuntime.preparingDescriptor = false;
  }
}

function isAnchorWithinBackgroundContinuationBand(anchor) {
  if (!(anchor instanceof Element)) {
    return false;
  }
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const rect = anchor.getBoundingClientRect();
  return rect.top <= viewportHeight * 3.25;
}

function getAdaptiveContinuousEarlyLoadRatio() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return 0.46;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return HOME_CONTINUOUS_EARLY_LOAD_RATIO;
  }
  return 0.62;
}

function getAdaptiveContinuousEarlyLoadCooldownMs() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return 80;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return HOME_CONTINUOUS_EARLY_LOAD_COOLDOWN_MS;
  }
  return 160;
}

function getAdaptiveBackgroundContinuationDelayMs() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return 8;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return 24;
  }
  return 40;
}

function getAdaptiveContinuousReobserveDelayMs() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  const pendingPressure = Math.min(4, getCurrentPendingContinuationMediaCount());
  if (scrollSpeed <= 0.18) {
    return pendingPressure >= 2 ? 160 : 90;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return pendingPressure >= 2 ? HOME_CONTINUOUS_DISCOVERY_REOBSERVE_DELAY_MS + 40 : HOME_CONTINUOUS_DISCOVERY_REOBSERVE_DELAY_MS;
  }
  return HOME_CONTINUOUS_DISCOVERY_REOBSERVE_DELAY_MS + 80;
}

function maybeAdvanceBackgroundContinuation() {
  if (
    currentView !== "home"
    || homeContinuousDiscoveryRuntime.loading
    || homeContinuousDiscoveryRuntime.preparingDescriptor
    || !productsContainer
  ) {
    return;
  }
  const anchor = productsContainer.querySelector("[data-continuous-discovery-anchor='home']");
  if (!(anchor instanceof Element) || !anchor.isConnected) {
    return;
  }
  if (isHomeFeedUnderPressure(productsContainer)) {
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }
  const renderedCards = Array.from(
    productsContainer.querySelectorAll(".product-card[data-open-product], .seller-product-card[data-open-product]")
  );
  if (!renderedCards.length) {
    return;
  }
  const visibleIndex = getVisibleFeedProductIndex();
  const progressRatio = visibleIndex >= 0 ? (visibleIndex + 1) / Math.max(1, renderedCards.length) : 0;
  const now = Date.now();
  const earlyLoadRatio = getAdaptiveContinuousEarlyLoadRatio();
  bumpRuntimeDiagnostic("adaptiveEarlyLoadEvaluations");
  if (
    progressRatio < earlyLoadRatio
    && !isAnchorWithinBackgroundContinuationBand(anchor)
  ) {
    return;
  }
  const adaptiveCooldown = getAdaptiveContinuousEarlyLoadCooldownMs();
  if (now - Number(homeContinuousDiscoveryRuntime.lastEarlyLoadAt || 0) < adaptiveCooldown) {
    return;
  }
  homeContinuousDiscoveryRuntime.lastEarlyLoadAt = now;
  scheduleIdleBackgroundWork(() => {
    if (
      currentView !== "home"
      || homeContinuousDiscoveryRuntime.loading
      || homeContinuousDiscoveryRuntime.preparingDescriptor
      || !anchor.isConnected
      || !canAdvanceHomeContinuousDiscovery(anchor)
    ) {
      return;
    }
    prepareNextContinuousDiscoveryDescriptor();
    hydrateContinuousDiscoveryAnchor(anchor);
  }, getAdaptiveBackgroundContinuationDelayMs());
}

async function hydrateContinuousDiscoveryAnchor(anchor) {
  if (!anchor || homeContinuousDiscoveryRuntime.loading) {
    return;
  }
  if (!canAdvanceHomeContinuousDiscovery(anchor)) {
    const pendingCount = getHomeContinuousPendingMediaCount(anchor);
    bumpRuntimeDiagnostic("continuousPendingMediaDeferrals");
    reportShowcaseInstrumentation("continuous_pending_media_deferral", {
      pendingCount,
      batchIndex: homeContinuousDiscoveryRuntime.batchIndex,
      scrollSpeed: Number(feedRuntimeState.lastScrollSpeed || 0)
    });
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }
  if (isHomeFeedUnderPressure(productsContainer || document)) {
    bumpRuntimeDiagnostic("continuousPendingMediaDeferrals");
    reportShowcaseInstrumentation("continuous_feed_pressure_deferral", {
      pendingCount: getCurrentPendingContinuationMediaCount(productsContainer || document),
      prefetchQueueSize: Number(marketplaceScrollPrefetchQueue?.length || 0),
      inflightPrefetchCount: Number(marketplaceScrollPrefetchInflight?.size || 0),
      batchIndex: homeContinuousDiscoveryRuntime.batchIndex
    });
    scheduleContinuousDiscoveryReobserve(anchor);
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
  const pendingDescriptors = Array.isArray(homeContinuousDiscoveryRuntime.pendingDescriptors)
    ? homeContinuousDiscoveryRuntime.pendingDescriptors
    : [];
  const generatedDescriptor = (
    homeContinuousDiscoveryRuntime.preparedDescriptor
    && homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex === homeContinuousDiscoveryRuntime.batchIndex
  )
    ? homeContinuousDiscoveryRuntime.preparedDescriptor
    : getContinuousDiscoveryDescriptor({
      seedProduct,
      usedIds: homeContinuousDiscoveryRuntime.usedIds,
      recentIds: homeContinuousDiscoveryRuntime.recentIds,
      batchIndex: homeContinuousDiscoveryRuntime.batchIndex,
      variantCounts: homeContinuousDiscoveryRuntime.variantSurfaceCounts,
      variantLastBatchIndex: homeContinuousDiscoveryRuntime.variantLastBatchIndex,
      variantShownImageIndexes: homeContinuousDiscoveryRuntime.variantShownImageIndexes,
      productLastAppearanceOrdinal: homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal,
      normalProductOrdinal: homeContinuousDiscoveryRuntime.normalProductOrdinal,
      lastVariantNormalOrdinal: homeContinuousDiscoveryRuntime.lastVariantNormalOrdinal
    });
  const shouldPreferPendingDescriptor = homeContinuousDiscoveryRuntime.batchIndex > 0
    && homeContinuousDiscoveryRuntime.lastDescriptorSource !== "deferred_recommendation";
  const eligiblePendingDescriptorIndex = shouldPreferPendingDescriptor
    ? pendingDescriptors.findIndex((entry) => Number(entry?.minBatchIndex || 0) <= Number(homeContinuousDiscoveryRuntime.batchIndex || 0))
    : -1;
  const descriptor = eligiblePendingDescriptorIndex >= 0
    ? pendingDescriptors.splice(eligiblePendingDescriptorIndex, 1)[0]
    : (generatedDescriptor || pendingDescriptors.shift());
  reportShowcaseInstrumentation("continuous_discovery_descriptor_selected", {
    batchIndex: homeContinuousDiscoveryRuntime.batchIndex,
    source: descriptor?.source || descriptor?.kind || "generated",
    kind: descriptor?.kind || "",
    title: descriptor?.title || "",
    itemCount: Array.isArray(descriptor?.items) ? descriptor.items.length : 0,
    pendingRemaining: pendingDescriptors.length
  });

  if (!descriptor) {
    homeContinuousDiscoveryRuntime.loading = false;
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }

  const batchIndex = homeContinuousDiscoveryRuntime.batchIndex + 1;
  if (Array.isArray(descriptor?.items) && descriptor.items.length) {
    primeIncomingFeedItems(descriptor.items, {
      reason: `continuous_discovery_batch_${batchIndex}_preappend`,
      productLimit: descriptor.kind === "stream" ? Math.min(descriptor.items.length, 6) : Math.min(descriptor.items.length, 4),
      decodeLimit: descriptor.kind === "stream" ? Math.min(descriptor.items.length, 4) : Math.min(descriptor.items.length, 2)
    });
    if (descriptor.kind === "stream") {
      primeVariantInjectionImages(descriptor.items, {
        reason: `continuous_discovery_variant_batch_${batchIndex}_preappend`
      });
    }
  }
  await prepareContinuousDescriptorMedia(descriptor, `continuous_discovery_batch_${batchIndex}_ready_queue`);
  if (!anchor.isConnected || currentView !== "home") {
    homeContinuousDiscoveryRuntime.loading = false;
    return;
  }
  let insertedNodes = [];
  if (descriptor.kind === "stream") {
    insertedNodes = createContinuousDiscoveryStreamElements(descriptor, batchIndex, "home");
  } else {
    const section = createContinuousDiscoverySectionElement(
      descriptor,
      batchIndex,
      "home"
    );
    if (section) {
      insertedNodes = [section];
    }
  }
  if (!insertedNodes.length) {
    homeContinuousDiscoveryRuntime.loading = false;
    scheduleContinuousDiscoveryReobserve(anchor);
    return;
  }
  insertedNodes = insertedNodes.filter((node) => {
    const entryKey = String(node?.dataset?.feedEntryKey || "").trim();
    return !entryKey || !hasRenderedFeedEntryKey(productsContainer, entryKey);
  });
  if (!insertedNodes.length) {
    homeContinuousDiscoveryRuntime.loading = false;
    scheduleContinuousDiscoveryReobserve(anchor);
    refreshHomeInfiniteScrollSentinels(productsContainer);
    return;
  }

  let continuationLeadCardCount = 2;
  if (descriptor.kind === "stream") {
    continuationLeadCardCount = await prepareContinuationBatchAdmission(insertedNodes, {
      leadCardCount: getAdaptiveContinuationLeadCardCount(),
      maxWaitMs: HOME_CONTINUOUS_BATCH_ADMISSION_MAX_WAIT_MS
    });
    if (!anchor.isConnected || currentView !== "home") {
      homeContinuousDiscoveryRuntime.loading = false;
      return;
    }
    insertedNodes.forEach((node, nodeIndex) => {
      bindFeedGalleryInteractions(node);
      bindImageFallbacks(node);
      prioritizeVisibleFeedMedia?.(node, nodeIndex < continuationLeadCardCount ? 2 : 1);
    });
  }

  await insertContinuousNodesInFrames(anchor, insertedNodes, {
    chunkSize: HOME_INFINITE_DOM_INJECT_CHUNK_SIZE,
    onChunk: (chunk) => {
      chunk.forEach((node) => {
        if (descriptor.kind !== "stream") {
          enhanceShowcaseTracks(node);
          repairShowcaseMediaVisibility?.(node);
          stabilizeMobileShowcaseRows?.(node);
        }
        if (descriptor.kind !== "stream") {
          bindFeedGalleryInteractions(node);
        }
        bindProductEngagementSignals(node);
        if (descriptor.kind !== "stream") {
          bindImageFallbacks(node);
        }
        bindProductMenus(node);
      });
    }
  });
  if (!anchor.isConnected || currentView !== "home") {
    homeContinuousDiscoveryRuntime.loading = false;
    return;
  }
  if (descriptor.kind === "stream") {
    prioritizeVisibleFeedMedia?.(productsContainer, Math.min(4, insertedNodes.length));
  }
  trimHomeContinuousDiscoverySections(anchor);
  const appendedIds = [];
  descriptor.items.forEach((item) => {
    const productId = String(item?.id || "").trim();
    if (!productId) {
      return;
    }
    if (!isVariantFeedEntry(item)) {
      appendedIds.push(productId);
      homeContinuousDiscoveryRuntime.usedIds.add(productId);
      homeContinuousDiscoveryRuntime.normalProductOrdinal += 1;
      homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal[productId] = homeContinuousDiscoveryRuntime.normalProductOrdinal;
      markVariantImageAsShown(
        homeContinuousDiscoveryRuntime.variantShownImageIndexes,
        productId,
        getProductFeedLeadImageIndex(item)
      );
      return;
    }
    const sourceId = String(item.feedVariantSourceId || productId).trim();
    homeContinuousDiscoveryRuntime.variantSurfaceCounts[sourceId] = Number(homeContinuousDiscoveryRuntime.variantSurfaceCounts[sourceId] || 0) + 1;
    homeContinuousDiscoveryRuntime.variantLastBatchIndex[sourceId] = homeContinuousDiscoveryRuntime.batchIndex + 1;
    homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal[sourceId] = homeContinuousDiscoveryRuntime.normalProductOrdinal;
    homeContinuousDiscoveryRuntime.lastVariantNormalOrdinal = homeContinuousDiscoveryRuntime.normalProductOrdinal;
    markVariantImageAsShown(
      homeContinuousDiscoveryRuntime.variantShownImageIndexes,
      sourceId,
      Number(item.feedInitialImageIndex)
    );
  });
  pruneOrderedIdSet(homeContinuousDiscoveryRuntime.usedIds, MAX_HOME_CONTINUOUS_USED_IDS);
  homeContinuousDiscoveryRuntime.recentIds = rememberContinuousDiscoveryIds(
    homeContinuousDiscoveryRuntime.recentIds,
    appendedIds
  );
  homeContinuousDiscoveryRuntime.batchIndex += 1;
  homeContinuousDiscoveryRuntime.lastDescriptorSource = String(descriptor?.source || descriptor?.kind || "generated").trim().toLowerCase();
  homeContinuousDiscoveryRuntime.lastHydrateAt = now;
  homeContinuousDiscoveryRuntime.preparedDescriptor = null;
  homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex = -1;
  homeContinuousDiscoveryRuntime.loading = false;
  scheduleIdleBackgroundWork(() => {
    prepareNextContinuousDiscoveryDescriptor();
  }, 24);
  if (isAnchorWithinBackgroundContinuationBand(anchor)) {
    scheduleIdleBackgroundWork(() => {
      if (
        anchor.isConnected
        && currentView === "home"
        && !homeContinuousDiscoveryRuntime.loading
        && canAdvanceHomeContinuousDiscovery(anchor)
        && isAnchorWithinBackgroundContinuationBand(anchor)
      ) {
        hydrateContinuousDiscoveryAnchor(anchor);
      }
    }, 24);
  }
  scheduleContinuousDiscoveryReobserve(anchor);
  refreshHomeInfiniteScrollSentinels(productsContainer);
  maintainHomeInfiniteDomBudget();
}

function getHomeInfiniteSentinelCard(offsetFromEnd = 1) {
  const cards = Array.from(
    productsContainer?.querySelectorAll?.(".product-card[data-open-product], .seller-product-card[data-open-product]") || []
  );
  if (!cards.length) {
    return null;
  }
  const index = Math.max(0, cards.length - Math.max(1, Number(offsetFromEnd || 1)));
  return cards[index] || cards[cards.length - 1] || null;
}

function ensureHomeInfiniteSentinelObserver() {
  if (typeof IntersectionObserver === "undefined") {
    return null;
  }
  if (homeContinuousDiscoveryRuntime.sentinelObserver) {
    return homeContinuousDiscoveryRuntime.sentinelObserver;
  }
  homeContinuousDiscoveryRuntime.sentinelObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || currentView !== "home") {
        return;
      }
      if (homeContinuousDiscoveryRuntime.loading) {
        return;
      }
      const stage = String(entry.target?.dataset?.homeInfiniteSentinel || "").trim();
      const anchor = productsContainer?.querySelector?.("[data-continuous-discovery-anchor='home']");
      if (!(anchor instanceof Element)) {
        return;
      }
      homeContinuousDiscoveryRuntime.sentinelObserver?.unobserve?.(entry.target);
      if (stage === "fetch") {
        if (Date.now() - Number(homeContinuousDiscoveryRuntime.lastSentinelFetchAt || 0) < HOME_INFINITE_SENTINEL_FETCH_COOLDOWN_MS) {
          return;
        }
        homeContinuousDiscoveryRuntime.lastSentinelFetchAt = Date.now();
        silentlyRefreshInfiniteFeedSource();
        prepareNextContinuousDiscoveryDescriptor();
        return;
      }
      if (stage === "preload") {
        if (Date.now() - Number(homeContinuousDiscoveryRuntime.lastSentinelPreloadAt || 0) < HOME_INFINITE_SENTINEL_PRELOAD_COOLDOWN_MS) {
          return;
        }
        homeContinuousDiscoveryRuntime.lastSentinelPreloadAt = Date.now();
        const descriptor = prepareNextContinuousDiscoveryDescriptor();
        if (descriptor) {
          prepareContinuousDescriptorMedia(descriptor, `sentinel_b_preload_${homeContinuousDiscoveryRuntime.batchIndex}`);
        }
        return;
      }
      if (stage === "inject") {
        if (Date.now() - Number(homeContinuousDiscoveryRuntime.lastSentinelInjectAt || 0) < HOME_INFINITE_SENTINEL_INJECT_COOLDOWN_MS) {
          return;
        }
        homeContinuousDiscoveryRuntime.lastSentinelInjectAt = Date.now();
        const descriptor = prepareNextContinuousDiscoveryDescriptor();
        if (descriptor) {
          prepareContinuousDescriptorMedia(descriptor, `sentinel_c_inject_${homeContinuousDiscoveryRuntime.batchIndex}`)
            .finally(() => hydrateContinuousDiscoveryAnchor(anchor));
          return;
        }
        hydrateContinuousDiscoveryAnchor(anchor);
      }
    });
  }, {
    rootMargin: "1600px 0px 1600px 0px",
    threshold: 0.01
  });
  return homeContinuousDiscoveryRuntime.sentinelObserver;
}

function refreshHomeInfiniteScrollSentinels(scope = productsContainer) {
  if (currentView !== "home" || !scope || typeof IntersectionObserver === "undefined") {
    return;
  }
  const observer = ensureHomeInfiniteSentinelObserver();
  if (!observer) {
    return;
  }
  (homeContinuousDiscoveryRuntime.sentinelTargets || []).forEach((target) => {
    observer.unobserve(target);
    delete target.dataset.homeInfiniteSentinel;
  });
  const nextTargets = [];
  [
    ["fetch", HOME_INFINITE_SENTINEL_FETCH_OFFSET],
    ["preload", HOME_INFINITE_SENTINEL_PRELOAD_OFFSET],
    ["inject", HOME_INFINITE_SENTINEL_INJECT_OFFSET]
  ].forEach(([stage, offset]) => {
    const target = getHomeInfiniteSentinelCard(offset);
    if (!(target instanceof Element) || nextTargets.includes(target)) {
      return;
    }
    target.dataset.homeInfiniteSentinel = stage;
    observer.observe(target);
    nextTargets.push(target);
  });
  homeContinuousDiscoveryRuntime.sentinelTargets = nextTargets;
}

function ensureHomeInfiniteVirtualObserver() {
  if (typeof IntersectionObserver === "undefined") {
    return null;
  }
  if (homeContinuousDiscoveryRuntime.virtualObserver) {
    return homeContinuousDiscoveryRuntime.virtualObserver;
  }
  homeContinuousDiscoveryRuntime.virtualObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      const spacer = entry.target;
      const virtualId = spacer?.dataset?.homeVirtualCardId || "";
      const index = (homeContinuousDiscoveryRuntime.virtualList || []).findIndex((item) => item.id === virtualId);
      if (index < 0) {
        return;
      }
      const [record] = homeContinuousDiscoveryRuntime.virtualList.splice(index, 1);
      homeContinuousDiscoveryRuntime.virtualObserver?.unobserve(spacer);
      spacer.replaceWith(record.node);
      bindMarketplaceScrollImages(record.node);
      bindFeedGalleryInteractions(record.node);
      bindProductEngagementSignals(record.node);
      bindProductMenus(record.node);
      refreshHomeInfiniteScrollSentinels(productsContainer);
    });
  }, {
    rootMargin: "1400px 0px 1400px 0px",
    threshold: 0.01
  });
  return homeContinuousDiscoveryRuntime.virtualObserver;
}

function maintainHomeInfiniteDomBudget() {
  if (currentView !== "home" || !productsContainer) {
    return;
  }
  const cards = Array.from(
    productsContainer.querySelectorAll(".product-card[data-open-product], .seller-product-card[data-open-product]")
  );
  if (cards.length <= HOME_INFINITE_MAX_DOM_CARDS) {
    return;
  }
  const excessCount = cards.length - HOME_INFINITE_MAX_DOM_CARDS;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const virtualObserver = ensureHomeInfiniteVirtualObserver();
  cards.slice(0, excessCount).forEach((card) => {
    if (!(card instanceof Element) || card.dataset.homeVirtualized === "true") {
      return;
    }
    const rect = card.getBoundingClientRect();
    if (rect.bottom > -viewportHeight * 2) {
      return;
    }
    const virtualId = `home-virtual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const spacer = document.createElement("div");
    spacer.className = "home-virtual-card-spacer";
    spacer.dataset.homeVirtualCardId = virtualId;
    spacer.style.height = `${Math.max(1, Math.round(rect.height || card.offsetHeight || 1))}px`;
    spacer.style.margin = "0";
    card.dataset.homeVirtualized = "true";
    homeContinuousDiscoveryRuntime.virtualList.push({
      id: virtualId,
      node: card,
      createdAt: Date.now()
    });
    card.replaceWith(spacer);
    virtualObserver?.observe(spacer);
  });
}

function setupContinuousDiscoveryLoading(scope, options = {}) {
  disconnectContinuousDiscoveryObserver();

  const anchor = scope?.querySelector?.("[data-continuous-discovery-anchor='home']");
  if (!anchor || currentView !== "home") {
    return;
  }

  const usedIds = new Set(Array.from(options.usedProductIds || []).filter(Boolean));
  homeContinuousDiscoveryRuntime.usedIds = usedIds;
  homeContinuousDiscoveryRuntime.recentIds = [];
  homeContinuousDiscoveryRuntime.variantSurfaceCounts = {};
  homeContinuousDiscoveryRuntime.variantLastBatchIndex = {};
  homeContinuousDiscoveryRuntime.variantShownImageIndexes = {};
  homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal = {};
  homeContinuousDiscoveryRuntime.preparingDescriptor = false;
  homeContinuousDiscoveryRuntime.seedProductId = options.seedProduct?.id || "";
  homeContinuousDiscoveryRuntime.lastDescriptorSource = "";
  homeContinuousDiscoveryRuntime.lastHydrateAt = 0;
  homeContinuousDiscoveryRuntime.preparedDescriptor = null;
  homeContinuousDiscoveryRuntime.preparedDescriptorBatchIndex = -1;
  homeContinuousDiscoveryRuntime.lastEarlyLoadAt = 0;
  homeContinuousDiscoveryRuntime.readyQueue = [];
  homeContinuousDiscoveryRuntime.virtualList = [];
  homeContinuousDiscoveryRuntime.sentinelTargets = [];
  homeContinuousDiscoveryRuntime.lastBackendRefreshAt = 0;
  homeContinuousDiscoveryRuntime.backendRefreshPromise = null;
  homeContinuousDiscoveryRuntime.lastSentinelFetchAt = 0;
  homeContinuousDiscoveryRuntime.lastSentinelPreloadAt = 0;
  homeContinuousDiscoveryRuntime.lastSentinelInjectAt = 0;
  bumpMarketplaceImagePrefetchGeneration("continuous_discovery_reset");
  const initialProductIds = Array.from(options.initialProductIds || []).filter(Boolean);
  homeContinuousDiscoveryRuntime.normalProductOrdinal = initialProductIds.length;
  initialProductIds.forEach((productId, index) => {
    homeContinuousDiscoveryRuntime.productLastAppearanceOrdinal[productId] = index + 1;
    const product = getProductById(productId);
    if (product) {
      markVariantImageAsShown(
        homeContinuousDiscoveryRuntime.variantShownImageIndexes,
        productId,
        getProductFeedLeadImageIndex(product)
      );
    }
  });
  homeContinuousDiscoveryRuntime.lastVariantNormalOrdinal = -HOME_VARIANT_MIN_NORMAL_PRODUCTS_BETWEEN;
  homeContinuousDiscoveryRuntime.pendingDescriptors = Array.isArray(options.pendingDescriptors)
    ? options.pendingDescriptors
      .filter((descriptor) => Array.isArray(descriptor?.items) && descriptor.items.length)
      .map((descriptor) => ({
        ...descriptor,
        items: descriptor.items.slice()
      }))
    : [];

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
    rootMargin: "1200px 0px 900px 0px"
  });
  homeContinuousDiscoveryRuntime.observer.observe(anchor);
  refreshHomeInfiniteScrollSentinels(scope);
  scheduleIdleBackgroundWork(() => {
    prepareNextContinuousDiscoveryDescriptor();
  }, 80);
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
  return `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">${escapeHtml(getPromotionLabel(promotion.type))}</span></p>`;
}

function renderPromoteButton(product) {
  if (!currentUser || product.uploadedBy !== currentUser) {
    return "";
  }
  return `<button class="action-btn action-btn-secondary" type="button" data-promote-product="${product.id}">Promote</button>`;
}

function getSellerPromotionStatusMeta(product) {
  if (!currentUser || !product?.id || product?.uploadedBy !== currentUser) {
    return null;
  }
  const matchingPromotion = (Array.isArray(currentPromotions) ? currentPromotions : [])
    .filter((promotion) =>
      String(promotion?.productId || "").trim() === String(product.id || "").trim()
      && String(promotion?.sellerUsername || "").trim().toLowerCase() === String(currentUser || "").trim().toLowerCase()
    )
    .sort((first, second) =>
      new Date(second?.updatedAt || second?.createdAt || 0).getTime()
      - new Date(first?.updatedAt || first?.createdAt || 0).getTime()
    )[0];
  if (!matchingPromotion) {
    return null;
  }
  const status = String(matchingPromotion.status || "").trim().toLowerCase();
  if (status === "active") {
    const endTime = new Date(matchingPromotion.endDate || 0).getTime();
    const daysLeft = Number.isFinite(endTime)
      ? Math.max(0, Math.ceil((endTime - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0;
    return {
      label: "Active",
      className: "approved",
      detail: daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Ends today"
    };
  }
  if (status === "pending") {
    return { label: "Pending", className: "pending", detail: "Waiting for admin" };
  }
  if (status === "rejected") {
    return { label: "Rejected", className: "rejected", detail: "Needs a new request" };
  }
  if (status === "expired") {
    return { label: "Expired", className: "pending", detail: "Promotion ended" };
  }
  return null;
}

function renderSellerPromotionStatusChip(product) {
  const statusMeta = getSellerPromotionStatusMeta(product);
  if (!statusMeta) {
    return "";
  }
  const detailMarkup = statusMeta.detail
    ? `<span class="product-seller-promotion-detail">${escapeHtml(statusMeta.detail)}</span>`
    : "";
  return `<span class="status-pill product-seller-promotion-state ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>${detailMarkup}`;
}

function renderSellerPromotionAnalytics(product) {
  const statusMeta = getSellerPromotionStatusMeta(product);
  if (!statusMeta || statusMeta.className !== "approved") {
    return "";
  }
  const matchingPromotion = (Array.isArray(currentPromotions) ? currentPromotions : [])
    .filter((promotion) =>
      String(promotion?.productId || "").trim() === String(product?.id || "").trim()
      && String(promotion?.sellerUsername || "").trim().toLowerCase() === String(currentUser || "").trim().toLowerCase()
      && String(promotion?.status || "").trim().toLowerCase() === "active"
    )
    .sort((first, second) =>
      new Date(second?.updatedAt || second?.createdAt || 0).getTime()
      - new Date(first?.updatedAt || first?.createdAt || 0).getTime()
    )[0];
  const views = Math.max(0, Number(product?.views || 0));
  const likes = Math.max(0, Number(product?.likes || 0));
  const baselineViews = Math.max(0, Number(matchingPromotion?.baselineViews || 0));
  const baselineLikes = Math.max(0, Number(matchingPromotion?.baselineLikes || 0));
  const viewsLift = Math.max(0, views - baselineViews);
  const likesLift = Math.max(0, likes - baselineLikes);
  const hasBaseline = baselineViews > 0 || baselineLikes > 0 || Boolean(matchingPromotion?.approvedAt);
  const summary = hasBaseline
    ? `Since promotion: +${escapeHtml(formatNumber(viewsLift))} views · +${escapeHtml(formatNumber(likesLift))} likes`
    : `Promotion reach: ${escapeHtml(formatNumber(views))} views · ${escapeHtml(formatNumber(likes))} likes`;
  return `<p class="product-meta product-seller-promotion-analytics">${summary}</p>`;
}

function renderSellerCardPromoteChip(product) {
  if (!currentUser || !canUseSellerFeatures() || product?.uploadedBy !== currentUser) {
    return "";
  }
  return `<button class="product-seller-inline-action product-seller-promote-chip" type="button" onclick="return window.__wingaOpenPromotionFromTrigger ? window.__wingaOpenPromotionFromTrigger(this) : false;" data-promote-product="${product.id}" data-promote-authorized="true" data-promote-product-owner="${escapeHtml(product.uploadedBy || "")}" data-promote-product-name="${escapeHtml(product.name || "")}" data-promote-product-shop="${escapeHtml(product.shop || "")}" data-promote-product-whatsapp="${escapeHtml(product.whatsapp || "")}" data-promote-product-location="${escapeHtml(product.location || "")}" data-promote-product-category="${escapeHtml(product.category || "")}">Promote</button>`;
}

function renderSellerCardInlineActions(product) {
  const sellerId = String(product?.uploadedBy || "").trim();
  if (!sellerId) {
    return "";
  }
  const actions = [];
  const liked = isProductSaved(product?.id);
  actions.push(`<button class="product-seller-inline-action product-seller-like-chip${liked ? " is-active" : ""}" type="button" data-like-product="${escapeHtml(String(product?.id || "").trim())}">${liked ? "♥ Like" : "♡ Like"}</button>`);
  if (sellerId !== currentUser && canUseBuyerFeatures()) {
    actions.push(`<button class="product-seller-inline-action${isSellerFollowed(sellerId) ? " is-active" : ""}" type="button" data-follow-seller="${escapeHtml(sellerId)}">${isSellerFollowed(sellerId) ? "Following" : "Follow"}</button>`);
  }
  actions.push(`<button class="product-seller-inline-action" type="button" data-share-seller-shop="${escapeHtml(sellerId)}">Share</button>`);
  if (currentUser && canUseSellerFeatures() && sellerId === currentUser) {
    actions.push(renderSellerCardPromoteChip(product));
  }
  return actions.join("");
}

function renderFeedGalleryMarkup(product, surface = "feed", options = {}) {
  const safeImages = getRenderableMarketplaceImages(product);
  const images = safeImages.length > 0 ? safeImages : [getImageFallbackDataUri("WINGA")];
  const total = images.length;
  const isVariantEntry = isVariantFeedEntry(product);
  const requestedInitialIndex = Number(
    options?.initialImageIndex
    ?? (isVariantEntry ? (product?.variantDisplayIndex ?? product?.feedInitialImageIndex ?? product?.visibleImageIndex) : 0)
    ?? 0
  );
  const initialImageIndex = total > 1
    ? Math.max(0, Math.min(total - 1, Number.isFinite(requestedInitialIndex) ? requestedInitialIndex : 0))
    : 0;
  const currentLabel = total > 1 ? `${initialImageIndex + 1}/${total}` : "";
  const priorityLimit = Math.max(0, Number(options?.priorityCount ?? 0) || 0);
  const shouldUseEagerPrimaryImage = Boolean(options?.preload);
  const normalizedSurface = String(surface || "").trim().toLowerCase() || "feed";
  const isFeedSurface = normalizedSurface === "feed";
  const isDetailSurface = normalizedSurface === "detail";
  const isDetailContinuationSurface = normalizedSurface === "detail-continuation";
  const shouldForceDirectVisibility = Boolean(options?.directVisibility || isFeedSurface);
  const useCarouselSurface = isFeedSurface || isDetailSurface || isDetailContinuationSurface;
  const fitMode = isFeedSurface
    ? "contain"
    : normalizeProductFitMode(options?.fitMode || getProductFitMode(product));
  const stableFrameRatio = "";
  if (options?.preload && typeof preloadImageSource === "function") {
    images.slice(0, Math.min(images.length, 1, priorityLimit)).forEach((src, index) => {
      preloadImageSource(src, {
        fetchPriority: index === 0 ? "high" : "auto",
        decodeInMemory: false,
        reason: "feed_gallery_startup_priority"
      });
    });
  }
  if (!useCarouselSurface) {
    const previewSrc = sanitizeImageSource(String(images[initialImageIndex] || images[0] || "").trim(), getImageFallbackDataUri("WINGA"));
    return `
      <div class="product-gallery media-gallery feed-gallery-preview showcase-media-preview feed-gallery-preview-single fit-mode-${escapeHtml(fitMode)}"
        data-feed-gallery-surface="${escapeHtml(normalizedSurface || "discovery")}"
        data-fit-mode="${escapeHtml(fitMode)}">
        ${createProgressiveImage({
          src: previewSrc,
          alt: `${product?.name || product?.shop || "Product image"} 1`,
          className: "feed-gallery-image feed-gallery-image-social showcase-preview-image",
          fallbackSrc: getImageFallbackDataUri("WINGA"),
          placeholderSrc: getImageFallbackDataUri("W"),
          fitMode,
          attributes: {
            loading: "lazy",
            fetchpriority: "auto",
            decoding: "async",
            draggable: "false",
            "data-preserve-image-ratio": "true",
            "data-marketplace-scroll-image": "true",
            "data-fallback-src": getImageFallbackDataUri("WINGA"),
            ...(shouldForceDirectVisibility ? { "data-direct-visibility": "true" } : {})
          }
        }).outerHTML}
        ${currentLabel ? `<span class="feed-gallery-count-badge product-gallery-count-badge">${currentLabel}</span>` : ""}
      </div>
    `;
  }
  const slides = images.map((src, index) => {
    const safeSrc = sanitizeImageSource(String(src || "").trim(), getImageFallbackDataUri("WINGA"));
    const safeAlt = escapeHtml(`${product?.name || product?.shop || "Product image"} ${index + 1}`);
    return `
      <div class="feed-gallery-carousel-slide" data-feed-gallery-slide="${index}">
        ${createProgressiveImage({
          src: safeSrc,
          alt: `${product?.name || product?.shop || "Product image"} ${index + 1}`,
          className: "feed-gallery-image feed-gallery-image-social",
          fallbackSrc: getImageFallbackDataUri("WINGA"),
          placeholderSrc: getImageFallbackDataUri("W"),
          fitMode,
          attributes: {
            loading: shouldUseEagerPrimaryImage && index === initialImageIndex ? "eager" : "lazy",
            fetchpriority: shouldUseEagerPrimaryImage && index === initialImageIndex ? "high" : "auto",
            decoding: "async",
            draggable: "false",
            "data-preserve-image-ratio": "true",
            "data-marketplace-scroll-image": "true",
            "data-feed-gallery-primary": index === initialImageIndex ? "true" : "false",
            "data-feed-gallery-image-src": safeSrc,
            "data-fallback-src": getImageFallbackDataUri("WINGA"),
            ...(shouldForceDirectVisibility ? { "data-direct-visibility": "true" } : {}),
            ...(index === initialImageIndex && priorityLimit > 0 ? { "data-image-priority": "startup-critical feed-primary" } : {})
          }
        }).outerHTML}
      </div>
    `;
  }).join("");

  return `
    <div class="product-gallery media-gallery feed-gallery-preview feed-gallery-carousel fit-mode-${escapeHtml(fitMode)}"
      data-feed-gallery-carousel="true"
      data-feed-gallery-total="${total}"
      data-feed-gallery-current="${initialImageIndex + 1}"
      data-feed-gallery-initial-index="${initialImageIndex}"
      data-feed-gallery-surface="${escapeHtml(normalizedSurface || "feed")}"
      ${stableFrameRatio ? `data-feed-gallery-stable-ratio="${escapeHtml(stableFrameRatio)}"` : ""}
      data-feed-gallery-stable-fit-mode="${escapeHtml(fitMode)}"
      data-fit-mode="${escapeHtml(fitMode)}">
      <div class="feed-gallery-carousel-track" data-feed-gallery-track>
        ${slides}
      </div>
      ${currentLabel ? `<span class="feed-gallery-count-badge" data-feed-gallery-count>${currentLabel}</span>` : ""}
    </div>
  `;
}

function getProductCardForEngagement(node) {
  return node?.closest?.(".product-card[data-open-product], .showcase-card[data-open-product], .seller-product-card[data-open-product], [data-product-card][data-open-product]");
}

function disposeFeedGalleryBinding(carousel) {
  if (!(carousel instanceof Element)) {
    return;
  }
  bumpRuntimeDiagnostic("galleryDisposeCount");
  const cleanup = carousel.__wingaCleanup;
  if (typeof cleanup === "function") {
    try {
      cleanup();
    } catch (error) {
      // Ignore cleanup failures for detached carousel nodes.
    }
  }
  carousel.__wingaCleanup = null;
  carousel.dataset.feedGalleryBound = "false";
}

function disposeScopedRenderMemory(scope) {
  if (!(scope instanceof Element)) {
    return;
  }
  scope.querySelectorAll?.("[data-feed-gallery-carousel]").forEach((carousel) => {
    disposeFeedGalleryBinding(carousel);
  });
  scope.querySelectorAll?.("img[data-marketplace-scroll-image='true']").forEach((image) => {
    teardownMarketplaceScrollImageBinding(image);
    image.dataset.marketplaceImageState = "";
  });
  scope.querySelectorAll?.(".product-card[data-open-product], .showcase-card[data-open-product], .seller-product-card[data-open-product], [data-product-card][data-open-product]").forEach((card) => {
    productEngagementObserver?.unobserve?.(card);
    clearProductCardEngagementState(card, { forget: true });
    card.dataset.engagementBound = "false";
  });
}

function getOrCreateProductCardEngagementState(card) {
  const existingState = productCardEngagementState.get(card);
  if (existingState) {
    return existingState;
  }
  const nextState = {
    visibleSince: 0,
    strongTimer: 0,
    strongRecorded: false,
    quickRecorded: false
  };
  productCardEngagementState.set(card, nextState);
  return nextState;
}

function clearProductCardEngagementState(card, options = {}) {
  const state = productCardEngagementState.get(card);
  if (!state) {
    return;
  }
  if (state.strongTimer) {
    window.clearTimeout(state.strongTimer);
    state.strongTimer = 0;
  }
  if (options.forget) {
    productCardEngagementState.delete(card);
    return;
  }
  state.visibleSince = 0;
}

function handleProductCardVisibilityChange(card, isVisible) {
  if (!(card instanceof Element)) {
    return;
  }
  const productId = normalizeProductIdValue(card.dataset.openProduct || card.dataset.productCard || "");
  if (!productId) {
    return;
  }
  const state = getOrCreateProductCardEngagementState(card);
  if (isVisible) {
    if (state.visibleSince) {
      return;
    }
    state.visibleSince = Date.now();
    if (!state.strongRecorded) {
      state.strongTimer = window.setTimeout(() => {
        const activeState = productCardEngagementState.get(card);
        if (!activeState || !activeState.visibleSince || activeState.strongRecorded) {
          return;
        }
        activeState.strongRecorded = true;
        noteProductEngagementSignal(productId, "linger_5s", SELLER_INTEREST_SIGNAL_WEIGHTS.linger_5s);
      }, PRODUCT_CARD_LINGER_THRESHOLD_MS);
    }
    return;
  }

  const visibleForMs = state.visibleSince ? Date.now() - state.visibleSince : 0;
  if (visibleForMs > 0 && visibleForMs < PRODUCT_CARD_QUICK_SCROLL_THRESHOLD_MS && !state.quickRecorded) {
    state.quickRecorded = true;
    noteProductEngagementSignal(productId, "quick_scroll", SELLER_INTEREST_SIGNAL_WEIGHTS.quick_scroll);
  }
  clearProductCardEngagementState(card);
}

function getProductEngagementObserver() {
  if (productEngagementObserver || typeof IntersectionObserver === "undefined") {
    return productEngagementObserver;
  }
  productEngagementObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target;
      if (!(card instanceof Element)) {
        return;
      }
      if (!card.isConnected) {
        clearProductCardEngagementState(card, { forget: true });
        productEngagementObserver?.unobserve(card);
        return;
      }
      handleProductCardVisibilityChange(card, entry.isIntersecting && entry.intersectionRatio >= PRODUCT_CARD_VISIBILITY_THRESHOLD);
    });
  }, {
    threshold: [0, PRODUCT_CARD_VISIBILITY_THRESHOLD, 0.92]
  });
  return productEngagementObserver;
}

function bindProductEngagementSignals(scope = document) {
  if (!scope) {
    return;
  }
  bumpRuntimeDiagnostic("productEngagementBindCalls");
  const observer = getProductEngagementObserver();
  if (!observer) {
    return;
  }
  scope.querySelectorAll(".product-card[data-open-product], .showcase-card[data-open-product], .seller-product-card[data-open-product], [data-product-card][data-open-product]").forEach((card) => {
    if (card.dataset.engagementBound === "true") {
      return;
    }
    card.dataset.engagementBound = "true";
    bumpRuntimeDiagnostic("productEngagementObservedCount");
    observer.observe(card);
  });
}

function bindFeedGalleryInteractions(scope = document) {
  if (!scope) {
    return;
  }
  bumpRuntimeDiagnostic("galleryBindCalls");

  scope.querySelectorAll("[data-feed-gallery-carousel]").forEach((carousel) => {
    if (carousel.dataset.feedGalleryBound === "true") {
      return;
    }
    disposeFeedGalleryBinding(carousel);

    const track = carousel.querySelector("[data-feed-gallery-track]");
    const badge = carousel.querySelector("[data-feed-gallery-count]");
    const preview = carousel.closest(".feed-gallery-preview");
    const isDetailCarousel = Boolean(carousel.closest("#product-detail-modal"));
    const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    const listenerOptions = abortController ? { signal: abortController.signal } : undefined;
    carousel.dataset.feedGalleryBound = "true";
    bumpRuntimeDiagnostic("galleryInitCount");
    if (!track) {
      return;
    }

    let pointerId = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerStartScrollLeft = 0;
    let lastPointerMoveX = 0;
    let lastPointerMoveTime = 0;
    let gestureVelocity = 0;
    let isDragging = false;
    let hasPointerCapture = false;
    let suppressClickUntil = 0;
    let resizeObserver = null;
    let initSyncTimer = 0;
    let lastTrackedIndex = 0;
    let variationSignalCount = 0;
    const initialGalleryIndex = Math.max(
      0,
      Math.min(
        Math.max(0, Number(carousel.dataset.feedGalleryTotal || 1) - 1),
        Number(carousel.dataset.feedGalleryInitialIndex || 0) || 0
      )
    );

    const clearDragState = () => {
      if (hasPointerCapture && pointerId != null) {
        track.releasePointerCapture?.(pointerId);
      }
      pointerId = null;
      isDragging = false;
      hasPointerCapture = false;
      track.classList.remove("is-dragging");
    };

    const beginDrag = () => {
      if (isDragging) {
        return;
      }
      isDragging = true;
      track.classList.add("is-dragging");
    };

    const isInteractiveTarget = (target) => target instanceof Element
      && Boolean(target.closest("button, a, input, select, textarea, label, [data-product-action]"));

    const syncAspectRatio = () => {
      if (!preview) {
        return;
      }
      const isFeedSurface = String(carousel.dataset.feedGallerySurface || "").trim().toLowerCase() === "feed";
      if (isFeedSurface) {
        preview.dataset.fitMode = "contain";
        carousel.dataset.fitMode = "contain";
        preview.style.removeProperty("--fit-media-aspect-ratio");
        carousel.style.removeProperty("--fit-media-aspect-ratio");
        preview.style.removeProperty("--feed-gallery-frame-height");
        carousel.style.removeProperty("--feed-gallery-frame-height");
        preview.style.setProperty("--feed-gallery-fit-mode", "contain");
        carousel.style.setProperty("--feed-gallery-fit-mode", "contain");
        carousel.dataset.feedGalleryStableRatio = "";
        preview.dataset.feedGalleryStableRatio = "";
        return;
      }
      const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
      const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
      const currentIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
      const authorityImage = isFeedSurface
        ? (carousel.querySelector('[data-feed-gallery-primary="true"]')
          || carousel.querySelector('[data-feed-gallery-slide="0"] .feed-gallery-image-social'))
        : null;
      const currentImage = authorityImage
        || carousel.querySelector(`[data-feed-gallery-slide="${currentIndex}"] .feed-gallery-image-social`)
        || carousel.querySelector(".feed-gallery-carousel-slide .feed-gallery-image-social");
      if (!currentImage) {
        return;
      }
      const naturalWidth = Number(currentImage.naturalWidth || currentImage.width || 0);
      const naturalHeight = Number(currentImage.naturalHeight || currentImage.height || 0);
      if (!naturalWidth || !naturalHeight) {
        return;
      }
      const stableRatio = String(carousel.dataset.feedGalleryStableRatio || preview.dataset.feedGalleryStableRatio || "").trim();
      const stableFitMode = String(carousel.dataset.feedGalleryStableFitMode || preview.dataset.feedGalleryStableFitMode || "").trim();
      const shouldPreserveImageRatio = Boolean(
        carousel.closest("#products-container, #market-showcase, .product-detail-feed-stack")
      );
      const fitMode = isFeedSurface
        ? normalizeProductFitMode(stableFitMode || carousel.dataset.fitMode || preview.dataset.fitMode || "cover")
        : normalizeProductFitMode(carousel.dataset.fitMode || preview.dataset.fitMode || "cover");
      const ratioValue = isFeedSurface
        ? (stableRatio || "4 / 5")
        : ((shouldPreserveImageRatio || fitMode === "contain")
          ? `${naturalWidth} / ${naturalHeight}`
          : "1 / 1");
      if (isFeedSurface) {
        carousel.dataset.feedGalleryStableRatio = ratioValue;
        preview.dataset.feedGalleryStableRatio = ratioValue;
        carousel.dataset.feedGalleryStableFitMode = fitMode;
        preview.dataset.feedGalleryStableFitMode = fitMode;
      }
      preview.dataset.fitMode = fitMode;
      carousel.dataset.fitMode = fitMode;
      preview.style.setProperty("--fit-media-aspect-ratio", ratioValue);
      preview.style.setProperty("--feed-gallery-fit-mode", fitMode);
      carousel.style.setProperty("--fit-media-aspect-ratio", ratioValue);
      carousel.style.setProperty("--feed-gallery-fit-mode", fitMode);
    };

    const syncBadge = () => {
      const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
      const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
      const currentIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
      const nextLabel = `${currentIndex + 1}/${total}`;
      carousel.dataset.feedGalleryCurrent = String(currentIndex + 1);
      if (badge && badge.textContent !== nextLabel) {
        badge.textContent = nextLabel;
      }
      return currentIndex;
    };

    const recordVariationInterestIfNeeded = (currentIndex) => {
      const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
      if (total <= 1 || currentIndex <= 0 || currentIndex === lastTrackedIndex || variationSignalCount >= 2) {
        lastTrackedIndex = currentIndex;
        return;
      }
      const card = getProductCardForEngagement(carousel);
      const productId = normalizeProductIdValue(card?.dataset.openProduct || card?.dataset.productCard || "");
      if (productId) {
        noteProductEngagementSignal(productId, "variation_swipe", SELLER_INTEREST_SIGNAL_WEIGHTS.variation_swipe);
        variationSignalCount += 1;
      }
      lastTrackedIndex = currentIndex;
    };

    const snapToNearestSlide = (behavior = "auto") => {
      const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
      const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
      const nextIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
      const targetLeft = nextIndex * width;
      if (Math.abs(track.scrollLeft - targetLeft) < 1) {
        return;
      }
      if (behavior === "smooth" && typeof track.scrollTo === "function") {
        track.scrollTo({ left: targetLeft, behavior: "smooth" });
        return;
      }
      track.scrollLeft = targetLeft;
    };

    const settleDetailCarousel = () => {
      if (!isDetailCarousel) {
        snapToNearestSlide("smooth");
        return;
      }
      const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
      const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
      const baseIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
      const velocityAbs = Math.abs(Number(gestureVelocity || 0));
      let targetIndex = baseIndex;
      if (velocityAbs >= 0.32) {
        const jump = Math.min(3, Math.max(1, Math.round(velocityAbs / 0.55)));
        targetIndex = baseIndex + (gestureVelocity < 0 ? jump : -jump);
      }
      targetIndex = Math.min(total - 1, Math.max(0, targetIndex));
      const targetLeft = targetIndex * width;
      if (typeof track.scrollTo === "function") {
        track.scrollTo({ left: targetLeft, behavior: "smooth" });
        return;
      }
      track.scrollLeft = targetLeft;
    };

    let rafId = 0;
    const scheduleSync = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const currentIndex = syncBadge();
        recordVariationInterestIfNeeded(currentIndex);
        syncAspectRatio();
      });
    };

    const cleanup = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (initSyncTimer) {
        window.clearTimeout(initSyncTimer);
        initSyncTimer = 0;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      clearDragState();
      abortController?.abort();
    };
    carousel.__wingaCleanup = cleanup;

    track.addEventListener("scroll", scheduleSync, { passive: true, ...(listenerOptions || {}) });
    track.addEventListener("touchend", scheduleSync, { passive: true, ...(listenerOptions || {}) });
    track.addEventListener("touchcancel", scheduleSync, { passive: true, ...(listenerOptions || {}) });
    track.addEventListener("click", (event) => {
      if (suppressClickUntil && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, { capture: true, ...(listenerOptions || {}) });
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleSync();
      });
      resizeObserver.observe(carousel);
    }
    const firstImage = carousel.querySelector(".feed-gallery-carousel-slide .feed-gallery-image-social");
    if (firstImage) {
      if (firstImage.complete && (firstImage.naturalWidth || firstImage.width) && (firstImage.naturalHeight || firstImage.height)) {
        syncAspectRatio();
      } else {
        firstImage.addEventListener("load", syncAspectRatio, { once: true, ...(listenerOptions || {}) });
      }
    }
    initSyncTimer = window.setTimeout(() => {
      initSyncTimer = 0;
      const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
      if (initialGalleryIndex > 0) {
        track.scrollLeft = initialGalleryIndex * width;
      }
      syncAspectRatio();
      lastTrackedIndex = syncBadge();
    }, 0);

    if (typeof PointerEvent !== "undefined") {
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
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        pointerStartScrollLeft = track.scrollLeft;
        lastPointerMoveX = event.clientX;
        lastPointerMoveTime = getPerfNow();
        gestureVelocity = 0;
        isDragging = false;
        track.setPointerCapture?.(event.pointerId);
        hasPointerCapture = true;
      }, listenerOptions);

      track.addEventListener("pointermove", (event) => {
        if (pointerId !== event.pointerId) {
          return;
        }
        const deltaX = event.clientX - pointerStartX;
        const deltaY = event.clientY - pointerStartY;
        if (!isDragging) {
          if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY) + 4) {
            return;
          }
          beginDrag();
        }
        if (event.cancelable) {
          event.preventDefault();
        }
        track.scrollLeft = pointerStartScrollLeft - deltaX;
        const now = getPerfNow();
        const elapsed = Math.max(1, now - Number(lastPointerMoveTime || now));
        gestureVelocity = (event.clientX - Number(lastPointerMoveX || event.clientX)) / elapsed;
        lastPointerMoveX = event.clientX;
        lastPointerMoveTime = now;
      }, listenerOptions);

      track.addEventListener("pointerup", (event) => {
        if (pointerId !== event.pointerId) {
          return;
        }
        if (isDragging) {
          suppressClickUntil = Date.now() + 220;
        }
        clearDragState();
        settleDetailCarousel();
        scheduleSync();
      }, listenerOptions);

      track.addEventListener("pointercancel", (event) => {
        if (pointerId !== event.pointerId) {
          return;
        }
        clearDragState();
        settleDetailCarousel();
        scheduleSync();
      }, listenerOptions);

      track.addEventListener("lostpointercapture", () => {
        clearDragState();
        settleDetailCarousel();
        scheduleSync();
      }, listenerOptions);
    }
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
      const initialImageIndex = Number(
        openTrigger?.dataset?.openImageIndex
        || card.dataset.openImageIndex
        || 0
      ) || 0;
      if (!productId || event.__wingaProductOpenHandled) {
        return;
      }
        if (
          event.target.closest(
            ".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages], [data-open-product-whatsapp], [data-buy-product], [data-detail-repost], [data-promote-product], [data-follow-seller], [data-share-seller-shop], [data-like-product], .product-actions, .showcase-actions, .seller-product-actions, .product-seller-inline-actions"
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
          intent: { type: "focus-product", productId, initialImageIndex }
        });
        return;
      }

      openProductDetailModal(productId, { initialImageIndex });
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
  repairShowcaseMediaVisibility?.(nextSection);
  stabilizeMobileShowcaseRows?.(nextSection);
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
  if (!HOME_HORIZONTAL_ROWS_ENABLED || !SHOW_STANDALONE_SHOWCASE_SECTION) {
    marketShowcase?.replaceChildren();
    if (marketShowcase) {
      marketShowcase.style.display = "none";
    }
    return;
  }
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

    const isFinePointer = window.matchMedia?.("(pointer: fine)")?.matches ?? false;

    const openShowcaseCardFromEvent = (event) => {
      if (event.__wingaProductOpenHandled) {
        return;
      }
      if (suppressClickUntil && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const targetElement = event.target instanceof Element ? event.target : null;
      if (!targetElement) {
        return;
      }
      if (isInteractiveTarget(targetElement)) {
        return;
      }
      if (targetElement.closest(".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages], [data-open-product-whatsapp], [data-buy-product], [data-detail-repost], [data-follow-seller], [data-share-seller-shop], [data-like-product], .product-actions, .showcase-actions, .seller-product-actions, .product-seller-inline-actions")) {
        return;
      }

      const pointTarget = typeof document.elementFromPoint === "function" && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? document.elementFromPoint(event.clientX, event.clientY)
        : null;
      const card = targetElement.closest(".showcase-card, .seller-product-card")
        || pointTarget?.closest?.(".showcase-card, .seller-product-card")
        || pointTarget?.parentElement?.closest?.(".showcase-card, .seller-product-card");
      if (!card) {
        return;
      }

      const productId = card.dataset.openProduct
        || card.dataset.showcaseId
        || card.dataset.productCard
        || "";
      const initialImageIndex = Number(card.dataset.openImageIndex || 0) || 0;
      if (!productId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.__wingaProductOpenHandled = true;

      if (!isAuthenticatedUser()) {
        promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: "You need an account to continue",
          message: "Sign up or log in to open product details and other marketplace actions.",
          intent: { type: "focus-product", productId, initialImageIndex }
        });
        return;
      }

      openProductDetailModal(productId, { initialImageIndex });
    };

    track.addEventListener("wheel", (event) => {
      if (track.scrollWidth <= track.clientWidth || typeof WheelEvent === "undefined") {
        return;
      }
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
      openShowcaseCardFromEvent(event);
    });

    track.addEventListener("click", (event) => {
      if (suppressClickUntil && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    if (typeof PointerEvent === "undefined") {
      return;
    }

    if (isFinePointer) {
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

function renderCurrentView(options = {}) {
  const reason = String(options?.reason || "direct_render");
  const force = Boolean(options?.force);
  const isBootInitialRender = reason === "boot_initial_render" && currentView === "home";
  bumpRuntimeDiagnostic("renderCurrentViewCalls");
  try {
    performance.mark("winga_render_start");
  } catch (_error) {
    // Ignore performance mark failures on older browsers.
  }
  const now = Date.now();
  if (uiRuntimeState.isRenderingView) {
    queueRenderCurrentView(reason);
    return;
  }
  if (!force && now - Number(uiRuntimeState.lastRenderStartedAt || 0) < MIN_VIEW_RENDER_INTERVAL_MS) {
    queueRenderCurrentView(reason);
    return;
  }
  uiRuntimeState.isRenderingView = true;
  uiRuntimeState.lastRenderStartedAt = now;
  uiRuntimeState.isBootInitialRender = isBootInitialRender;
  if (
    suppressInitialProductHomeRender
    && !document.body.classList.contains("product-detail-open")
    && String(window.location.pathname || "").match(/^\/product\/.+/i)
  ) {
    uiRuntimeState.isRenderingView = false;
    uiRuntimeState.lastRenderCompletedAt = Date.now();
    return;
  }
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
    stopSlideshow();
    const filteredProducts = getFilteredProducts();
    const isProfile = currentView === "profile";
    const isUpload = currentView === "upload" && canUseSellerFeatures();
    const isAdminView = currentView === "admin" && isStaffUser();
    const isGuest = !isAuthenticatedUser();
    const searchPriorityMode = hasPrioritySearchResults(filteredProducts.length) && !isProfile && !isUpload && !isAdminView;
    const productsHydrated = Boolean(window.WingaDataLayer?.isProductsHydrated?.());
    const productsLoadFailed = productHydrationStatus === "failed";
    const shouldShowStartupSkeleton = !isProfile
      && !isUpload
      && !isAdminView
      && filteredProducts.length === 0
      && !productsHydrated
      && !productsLoadFailed
      && !lifecycleFallbackActive;
    const shouldShowFeedLoading = !isProfile
      && !isUpload
      && !isAdminView
      && filteredProducts.length === 0
      && (lifecycleFallbackActive || productsLoadFailed);
    syncHeroPanelPosition(isProfile, isUpload);

    searchBox.style.display = isProfile || isUpload || isAdminView ? "none" : "grid";
    searchToggleButton.style.display = isProfile || isUpload || isAdminView ? "none" : "";
    searchImageButton.style.display = isProfile || isUpload || isAdminView ? "none" : "";
    if (mobileCategoryShell) {
      mobileCategoryShell.style.display = isProfile || isUpload || isAdminView ? "none" : "";
    }
    syncMobileCategorySheetOffset();
    searchBox.classList.toggle("mobile-open", searchRuntimeState.isMobileSearchOpen);
    syncSearchChromeState();
    renderImageSearchPreview();
    appContainer.classList.toggle("search-priority-mode", searchPriorityMode);
    productsSummary?.classList.toggle("search-priority-summary", searchPriorityMode);
    updateMarketplaceActionChrome();
    scheduleChromeOffsetSync();
    categories.style.display = isProfile || isAdminView || searchPriorityMode || shouldShowFeedLoading ? "none" : "grid";
    heroPanel.style.display = "none";
    marketShowcase.style.display = "none";
    productsContainer.style.display = isProfile || isAdminView || shouldShowFeedLoading ? "none" : "grid";
    emptyState.style.display = !isProfile && !isAdminView && productsHydrated && !productsLoadFailed && filteredProducts.length === 0 ? "block" : "none";
    setFeedLoadingStateVisible(shouldShowFeedLoading);
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

    if (shouldShowFeedLoading) {
      updateResultsMeta(0);
      renderSearchDropdown([], { isProfile, isUpload, isAdminView });
      return;
    }

    if (shouldShowStartupSkeleton) {
      updateResultsMeta(0);
      renderMarketShowcase();
      renderStartupFeedSkeleton();
      renderSearchDropdown([], { isProfile, isUpload, isAdminView });
      return;
    }

    const homeProducts = filteredProducts;
    const usesProgressiveHomeFeed = currentView === "home" && homeProducts.length > 10;
    applyFeedLayoutMode(productsContainer);

    if (currentView === "home" && homeProducts.length) {
      const bootPrimeLimit = isBootInitialRender
        ? Math.min(homeProducts.length, 4)
        : Math.min(homeProducts.length, 10);
      primeIncomingFeedItems(
        homeProducts.slice(0, bootPrimeLimit),
        {
          reason: `render_current_view_preprime_${reason}`,
          productLimit: bootPrimeLimit,
          decodeLimit: Math.min(homeProducts.length, isBootInitialRender ? 2 : 4)
        }
      );
    }

    updateResultsMeta(homeProducts.length);
    if (isBootInitialRender) {
      scheduleIdleBackgroundWork(() => {
        if (currentView !== "home" || uiRuntimeState.lastRenderStartedAt !== now) {
          return;
        }
        renderMarketShowcase();
      }, 120);
    } else {
      renderMarketShowcase();
    }
    renderProducts(homeProducts);
    const bindShowcaseChrome = () => {
      if (currentView !== "home" || uiRuntimeState.lastRenderStartedAt !== now) {
        return;
      }
      enhanceShowcaseTracks(marketShowcase);
      bindFeedGalleryInteractions(marketShowcase);
      bindProductEngagementSignals(marketShowcase);
      bindImageFallbacks(marketShowcase);
      bindProductMenus(marketShowcase);
    };
    if (isBootInitialRender) {
      scheduleIdleBackgroundWork(bindShowcaseChrome, 180);
    } else {
      bindShowcaseChrome();
    }
    renderSearchDropdown(homeProducts, { isProfile, isUpload, isAdminView });

    if (isUpload && !editingProductId) {
      restoreProductUploadDraft();
      productNameInput.focus();
    }
  } catch (error) {
    bumpRuntimeDiagnostic("renderCurrentViewErrorCount");
    renderLifecycleFallbackSkeleton("Tulikutana na mzigo wa render. Tunarejesha shell salama na unaweza kujaribu tena.");
    captureClientError("render_current_view_failed", error, {
      category: "runtime",
      alertSeverity: "high",
      view: currentView,
      reason
    });
    captureMemorySnapshot("render_error", {
      view: currentView,
      reason
    });
  } finally {
    uiRuntimeState.isRenderingView = false;
    uiRuntimeState.isBootInitialRender = false;
    uiRuntimeState.lastRenderCompletedAt = Date.now();
    const renderDurationMs = getPerfNow() - startedAt;
    try {
      performance.mark("winga_render_end");
      performance.measure("winga_render", "winga_render_start", "winga_render_end");
    } catch (_error) {
      // Ignore performance measure failures on older browsers.
    }
    captureMemorySnapshot("render_complete", {
      view: currentView,
      reason
    });
    reportSlowPath("render_current_view_slow", renderDurationMs, {
      view: currentView,
      productsCount: Array.isArray(products) ? products.length : 0,
      selectedCategory,
      reason
    }, currentView === "home" ? 240 : 180);
    if (uiRuntimeState.pendingRenderRequested) {
      const nextReason = uiRuntimeState.pendingRenderReason || "queued_render";
      uiRuntimeState.pendingRenderRequested = false;
      uiRuntimeState.pendingRenderReason = "";
      scheduleRenderCurrentView(nextReason);
    }
    if (document.body.classList.contains("app-booting") || !bootOverlay?.classList.contains("is-hidden")) {
      window.requestAnimationFrame(() => {
        const hasVisibleBootContent = hasVisibleStartupSurface({ includeFeedLoading: false });
        if (
          (document.body.classList.contains("app-booting") || !bootOverlay?.classList.contains("is-hidden"))
          && hasVisibleBootContent
        ) {
          completeBootOverlay();
        }
      });
    }
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
  clearProductUploadDraft({ username: currentUser });
  setNodeText(uploadTitle, "Hariri Bidhaa");
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
  setSelectedProductFitMode(product.fitMode || "cover");

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
  setNodeText(uploadTitle, "Ongeza Bidhaa");
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
  productUploadDraftRuntimeState.preparedImages = [];
  previewList.replaceChildren();
  previewList.style.display = "none";
  setSelectedProductFitMode("cover");
  uiRuntimeState.productUploadStatusTone = "";
  setUploadFormStatus("", "");
}

function createPaymentIntentSubmissionKey(productId, transactionId) {
  return `${normalizeProductIdValue(productId)}::${String(transactionId || "").trim().toUpperCase()}`;
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

  if (currentView === "home") {
    return prioritizeSellerMarketplaceMix(buildBalancedHomeFeed(filtered));
  }

  return prioritizeSellerMarketplaceMix(rankProductsForSurface(filtered, {
    surface: "default",
    limit: filtered.length,
    selectedCategory,
    searchTerms: rankingSearchTerms
  }));
}

function updateResultsMeta(listLength) {
  void listLength;
  return;
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
  const fitMode = getProductFitMode(product);

  return `
    <div class="product-gallery media-gallery fit-mode-${escapeHtml(fitMode)}${safeImages.length > 1 ? " has-media-stack" : ""}" data-fit-mode="${escapeHtml(fitMode)}">
      <img class="gallery-stage zoomable-image fit-mode-${escapeHtml(fitMode)}" src="${firstImage}" alt="${product.name}" data-gallery-stage="${product.id}" data-zoom-src="${firstImage}" data-zoom-alt="${product.name}" data-image-action-product="${product.id}" data-image-action-src="${firstImage}" data-image-action-surface="feed" loading="lazy" data-fallback-src="${getImageFallbackDataUri("WINGA")}" data-fit-mode="${escapeHtml(fitMode)}">
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
  const paymentDetails = getProductPaymentDetails(product);
  if (!paymentDetails.number) {
    showInAppNotification({
      title: "Lipa namba haijawekwa",
      body: "Muuzaji huyu bado hajaweka Lipa namba kwenye profile yake. Tumia Message kwanza.",
      variant: "warning"
    });
    if (product.uploadedBy !== currentUser) {
      openProductChat(product);
    }
    return;
  }

  paymentIntentState = {
    productId: product.id,
    loading: false,
    transactionId: "",
    feedbackTone: "",
    feedbackMessage: ""
  };
  renderPaymentIntentModal();
}

function openPromotionIntentModal(product, options = {}) {
  if (!product) {
    return;
  }
  const trustedAuthorized = Boolean(options?.trustedAuthorized);
  const hasSellerAccess = isAuthenticatedUser() && canUseSellerFeatures();
  const ownerMatches = String(product.uploadedBy || "").trim() === String(currentUser || "").trim();
  if (!hasSellerAccess || (!ownerMatches && !trustedAuthorized)) {
    showInAppNotification({
      title: "Promotion unavailable",
      body: !hasSellerAccess
        ? "Ingia kama seller ili ufungue visibility plans za tangazo hili."
        : "Promotion hii inapatikana kwa muuzaji wa bidhaa hii tu.",
      variant: "warning"
    });
    return;
  }
  promotionIntentState = {
    productId: product.id,
    product,
    selectedType: "starter_day",
    loading: false,
    transactionId: "",
    feedbackTone: "",
    feedbackMessage: ""
  };
  renderPromotionIntentModal();
}

window.__wingaOpenPromotionFromTrigger = (trigger) => {
  try {
    return openPromotionFromTrigger(trigger);
  } catch (error) {
    captureClientError("promotion_trigger_open_failed", error, {
      productId: String(trigger?.dataset?.promoteProduct || "").trim()
    });
    showInAppNotification({
      title: "Promotion failed to open",
      body: error.message || "Imeshindikana kufungua visibility plan. Jaribu tena.",
      variant: "error"
    });
    return false;
  }
};

function canRepostProductAsSeller(product) {
  return Boolean(
    product
    && isAuthenticatedUser()
    && !isStaffUser()
    && canUseSellerFeatures()
    && product.status === "approved"
    && product.uploadedBy
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
    fitMode: getProductFitMode(sourceProduct),
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
  const requestedInitialImageIndex = Number(options?.initialImageIndex ?? product?.feedInitialImageIndex ?? product?.visibleImageIndex ?? 0) || 0;
  primeProductDetailTransition(product, requestedInitialImageIndex);

  noteProductInterest(normalizedProductId);
  setDeepLinkLoadingShellVisible(true);
  const result = openProductDetailModalFromController(normalizedProductId, {
    allowBrokenImageFallbackOpen: true,
    ...options
  });
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const modal = document.getElementById("product-detail-modal");
      if (modal) {
        bindFeedGalleryInteractions(modal);
      }
    });
  });
  return result;
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
  const sharedCollectionApplied = applySharedCollectionRoute();
  if (!isAuthenticatedUser()) {
    appContainer.style.display = "block";
    refreshPublicEntryChrome();
    setCurrentViewState("home", {
      persist: false,
      syncHistory: false
    });
    renderCurrentView();
    return;
  }

  appContainer.style.display = "block";
  if (sharedCollectionApplied) {
    renderCurrentView();
    return;
  }
  renderCurrentView();
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
      const fallbackSrc = image.dataset.fallbackSrc || "";
      if (!fallbackSrc) {
        return;
      }
      const productId = image.dataset.imageActionProduct || "";
      const imageSource = image.currentSrc || image.getAttribute("src") || image.dataset.imageActionSrc || "";
      if (productId && imageSource) {
        noteBrokenMarketplaceImage(productId, imageSource);
      }
      image.closest(".progressive-image-shell")?.classList.add("is-error");
      if (image.getAttribute("src") !== fallbackSrc) {
        image.src = fallbackSrc;
      }
    }, { once: true });
    if (image.dataset.fallbackLoadBound !== "true") {
      image.dataset.fallbackLoadBound = "true";
      image.addEventListener("load", () => {
        const activeSrc = image.currentSrc || image.getAttribute("src") || image.dataset.imageActionSrc || "";
        if (shouldKeepMarketplaceScrollImageDirectVisible(image)) {
          keepMarketplaceScrollImageDirectVisible(image, activeSrc);
        }
        markMarketplaceScrollImageLoaded(image, activeSrc);
      });
    }
  });
  bindMarketplaceScrollImages(scope);
}

function prioritizeVisibleFeedMedia(scope = document, maxCards = 8) {
  if (!(scope instanceof Element || scope === document)) {
    return;
  }
  const layoutMode = getClientLayoutMode();
  const isCompactLayout = layoutMode === "mobile" || layoutMode === "standalone-mobile" || layoutMode === "mobile-desktop-site";
  const criticalCardLimit = getAdaptiveVisibleMediaPriorityBudget();
  const cards = Array.from(
    scope.querySelectorAll?.(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]") || []
  ).slice(0, Math.max(1, Number(maxCards) || 8));
  cards.forEach((card, cardIndex) => {
    card.querySelectorAll?.("img[data-marketplace-scroll-image='true']").forEach((image, index) => {
      if (!(image instanceof HTMLImageElement)) {
        return;
      }
      const isStartupPriorityCard = card.getAttribute("data-startup-priority-card") === "true";
      const isContinuationPending = card.getAttribute("data-continuation-media-pending") === "true";
      const prioritizeImage = index === 0 && (
        cardIndex < criticalCardLimit
        || isStartupPriorityCard
        || (isContinuationPending && cardIndex < criticalCardLimit + (isCompactLayout ? 1 : 0))
      );
      image.setAttribute("loading", prioritizeImage ? "eager" : "lazy");
      image.setAttribute("fetchpriority", prioritizeImage ? "high" : "auto");
      activateMarketplaceScrollImage(image, {
        priority: prioritizeImage,
        shouldSetPending: prioritizeImage
      });
    });
  });
}

function activateViewportReadyFeedImages(scope = document, options = {}) {
  if (!(scope instanceof Element || scope === document)) {
    return;
  }
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const activationMargin = getMarketplaceScrollImageActivationMargin();
  const images = Array.from(
    scope.querySelectorAll?.("img[data-marketplace-scroll-image='true']") || []
  ).filter((image) => image instanceof HTMLImageElement);
  const limit = Math.max(
    1,
    Number(options.limit || getAdaptiveViewportImageSweepLimit()) || getAdaptiveViewportImageSweepLimit()
  );
  let activatedCount = 0;
  images.forEach((image) => {
    if (activatedCount >= limit) {
      return;
    }
    const rect = image.getBoundingClientRect();
    const isInViewport = rect.bottom >= 0 && rect.top <= viewportHeight;
    const isWithinLandingZone = rect.bottom >= -Math.max(80, activationMargin * 0.5) && rect.top <= viewportHeight + activationMargin;
    if (!isInViewport && !isWithinLandingZone) {
      return;
    }
    const prioritizeImage = isInViewport || activatedCount < 3;
    const owningCard = image.closest(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]");
    image.setAttribute("loading", "eager");
    image.setAttribute("fetchpriority", prioritizeImage ? "high" : "auto");
    activateMarketplaceScrollImage(image, {
      priority: prioritizeImage,
      shouldSetPending: true
    });
    if (owningCard instanceof Element && activatedCount < 4) {
      const revealWindow = getAdaptiveMarketplaceCardRevealWindow();
      scheduleMarketplaceCardMediaReveal(owningCard, {
        maxWaitMs: revealWindow.maxWaitMs,
        pollMs: revealWindow.pollMs,
        requireLoaded: true
      });
    }
    activatedCount += 1;
  });
}

function scheduleViewportReadyFeedSweep(scope = document, options = {}) {
  if (feedRuntimeState.viewportReadySweepFrame) {
    return;
  }
  feedRuntimeState.viewportReadySweepFrame = window.requestAnimationFrame(() => {
    feedRuntimeState.viewportReadySweepFrame = 0;
    if (typeof document === "undefined" || document.hidden) {
      return;
    }
    const root = scope instanceof Element || scope === document ? scope : document;
    activateViewportReadyFeedImages(root, {
      limit: Math.max(
        getAdaptiveViewportImageSweepLimit(),
        Number(options.limit || 0) || 0
      )
    });
  });
}

function unbindMarketplaceScrollImages(scope = document) {
  if (!scope?.querySelectorAll) {
    return;
  }
  scope.querySelectorAll("img[data-marketplace-scroll-image='true']").forEach((image) => {
    teardownMarketplaceScrollImageBinding(image);
  });
}

function shouldKeepMarketplaceScrollImageDirectVisible(image) {
  if (!(image instanceof HTMLImageElement)) {
    return false;
  }
  if (String(image.dataset.directVisibility || "").trim().toLowerCase() === "true") {
    return true;
  }
  const surface = String(
    image.closest?.("[data-feed-gallery-surface]")?.dataset?.feedGallerySurface || ""
  ).trim().toLowerCase();
  return surface === "feed";
}

function keepMarketplaceScrollImageDirectVisible(image, resolvedSrc = "") {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const shell = image.closest(".progressive-image-shell");
  if (canRevealMarketplaceScrollImage(image, resolvedSrc)) {
    shell?.classList.remove("is-pending");
    shell?.classList.add("is-loaded");
  } else {
    shell?.classList.add("is-pending");
    shell?.classList.remove("is-loaded");
  }
  if (!image.dataset.marketplaceImageState || image.dataset.marketplaceImageState === "prefetched") {
    image.dataset.marketplaceImageState = "active";
  }
  if (resolvedSrc) {
    image.dataset.marketplaceLastResolvedSrc = resolvedSrc;
  }
}

function hasHealthyMarketplaceCardMedia(card) {
  if (!(card instanceof Element)) {
    return false;
  }
  const image = card.querySelector("img[data-marketplace-scroll-image='true']");
  if (!(image instanceof HTMLImageElement)) {
    return false;
  }
  const shell = image.closest(".progressive-image-shell");
  const activeSrc = image.currentSrc || image.getAttribute("src") || "";
  return Boolean(
    shell?.classList.contains("is-loaded")
    || (activeSrc && !activeSrc.startsWith(MARKETPLACE_SCROLL_IMAGE_PLACEHOLDER) && (Number(image.naturalWidth || 0) > 0 || Number(image.clientWidth || 0) > 32))
  );
}

function setMarketplaceCardMediaPending(card, isPending) {
  if (!(card instanceof Element)) {
    return;
  }
  if (isPending) {
    card.setAttribute("data-continuation-media-pending", "true");
    card.setAttribute("data-card-media-pending", "true");
    return;
  }
  card.removeAttribute("data-continuation-media-pending");
  card.removeAttribute("data-card-media-pending");
  delete card.dataset.continuationMediaRevealScheduled;
}

function scheduleMarketplaceCardMediaReveal(card, options = {}) {
  if (!(card instanceof Element)) {
    return;
  }
  if (hasHealthyMarketplaceCardMedia(card)) {
    setMarketplaceCardMediaPending(card, false);
    return;
  }
  if (card.dataset.continuationMediaRevealScheduled === "true") {
    return;
  }
  const adaptiveWindow = getAdaptiveMarketplaceCardRevealWindow();
  const requireLoaded = options.requireLoaded === true;
  const maxWaitMs = Math.max(
    80,
    Number(options.maxWaitMs || adaptiveWindow.maxWaitMs || CONTINUATION_MEDIA_REVEAL_MAX_WAIT_MS) || CONTINUATION_MEDIA_REVEAL_MAX_WAIT_MS
  );
  const pollMs = Math.max(
    30,
    Number(options.pollMs || adaptiveWindow.pollMs || CONTINUATION_MEDIA_REVEAL_POLL_MS) || CONTINUATION_MEDIA_REVEAL_POLL_MS
  );
  const startedAt = Date.now();
  card.dataset.continuationMediaRevealScheduled = "true";
  setMarketplaceCardMediaPending(card, true);

  const poll = () => {
    if (!card.isConnected) {
      setMarketplaceCardMediaPending(card, false);
      return;
    }
    if (hasHealthyMarketplaceCardMedia(card)) {
      setMarketplaceCardMediaPending(card, false);
      return;
    }
    if (!requireLoaded && Date.now() - startedAt >= maxWaitMs) {
      setMarketplaceCardMediaPending(card, false);
      return;
    }
    window.setTimeout(poll, pollMs);
  };

  window.requestAnimationFrame(() => {
    if (hasHealthyMarketplaceCardMedia(card)) {
      setMarketplaceCardMediaPending(card, false);
      return;
    }
    poll();
  });
}

function startContinuationBatchMediaRequests(nodes = [], options = {}) {
  const cards = Array.isArray(nodes)
    ? nodes.filter((node) => node instanceof Element && node.matches?.(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]"))
    : [];
  const leadCardCount = Math.max(1, Number(options.leadCardCount || 2) || 2);
  cards.slice(0, leadCardCount).forEach((card, cardIndex) => {
    const leadImage = card.querySelector("img[data-marketplace-scroll-image='true']");
    if (!(leadImage instanceof HTMLImageElement)) {
      return;
    }
    const prioritizeImage = cardIndex < 2;
    leadImage.setAttribute("loading", "eager");
    leadImage.setAttribute("fetchpriority", prioritizeImage ? "high" : "auto");
    activateMarketplaceScrollImage(leadImage, {
      priority: prioritizeImage,
      shouldSetPending: true
    });
    if (prioritizeImage) {
      const revealWindow = getAdaptiveMarketplaceCardRevealWindow();
      scheduleMarketplaceCardMediaReveal(card, {
        maxWaitMs: revealWindow.maxWaitMs,
        pollMs: revealWindow.pollMs,
        requireLoaded: true
      });
    }
  });
}

function getAdaptiveContinuationLeadCardCount() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return 3;
  }
  return 2;
}

function getAdaptiveContinuationAdmissionWindowMs() {
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return HOME_CONTINUOUS_BATCH_ADMISSION_SLOW_SCROLL_WAIT_MS;
  }
  return HOME_CONTINUOUS_BATCH_ADMISSION_MAX_WAIT_MS;
}

function haveContinuationLeadMediaRequestsStarted(nodes = [], options = {}) {
  const cards = Array.isArray(nodes)
    ? nodes.filter((node) => node instanceof Element && node.matches?.(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]"))
    : [];
  const leadCardCount = Math.max(1, Number(options.leadCardCount || 2) || 2);
  const leadCards = cards.slice(0, leadCardCount);
  if (!leadCards.length) {
    return true;
  }
  return leadCards.every((card) => {
    const image = card.querySelector("img[data-marketplace-scroll-image='true']");
    if (!(image instanceof HTMLImageElement)) {
      return true;
    }
    const realSrc = image.dataset.marketplaceRealSrc || image.dataset.progressiveRealSrc || image.dataset.imageActionSrc || image.dataset.zoomSrc || "";
    const currentSrc = image.currentSrc || image.getAttribute("src") || "";
    const imageState = String(image.dataset.marketplaceImageState || "").trim().toLowerCase();
    return Boolean(
      imageState === "active"
      || imageState === "loaded"
      || (realSrc && currentSrc === realSrc)
      || hasHealthyMarketplaceCardMedia(card)
    );
  });
}

function prepareContinuationBatchAdmission(nodes = [], options = {}) {
  const leadCardCount = Math.max(1, Number(options.leadCardCount || getAdaptiveContinuationLeadCardCount()) || 2);
  const maxWaitMs = Math.max(16, Number(options.maxWaitMs || getAdaptiveContinuationAdmissionWindowMs()) || HOME_CONTINUOUS_BATCH_ADMISSION_MAX_WAIT_MS);
  startContinuationBatchMediaRequests(nodes, {
    leadCardCount
  });
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let frameCount = 0;
    const finish = () => {
      const waitedMs = Math.max(0, Date.now() - startedAt);
      bumpRuntimeDiagnostic("continuousBatchAdmissionCount");
      bumpRuntimeDiagnostic("continuousBatchAdmissionWaitMs", waitedMs);
      recordRuntimeMetricWindow("continuousBatchAdmissionWaitMs", waitedMs);
      reportShowcaseInstrumentation("continuous_batch_admission", {
        leadCardCount,
        waitedMs,
        scrollSpeed: Number(feedRuntimeState.lastScrollSpeed || 0)
      });
      resolve(leadCardCount);
    };
    const tick = () => {
      if (
        haveContinuationLeadMediaRequestsStarted(nodes, { leadCardCount })
        || Date.now() - startedAt >= maxWaitMs
        || frameCount >= 2
      ) {
        finish();
        return;
      }
      frameCount += 1;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

function getHomeContinuousPendingMediaCount(anchor, options = {}) {
  if (!(anchor instanceof Element)) {
    return 0;
  }
  const lookback = Math.max(
    1,
    Number(options.lookback || getAdaptiveContinuousPendingMediaLookback()) || HOME_CONTINUOUS_PENDING_MEDIA_LOOKBACK
  );
  const cards = [];
  let cursor = anchor.previousElementSibling;
  while (cursor && cards.length < lookback) {
    if (cursor.matches?.(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]")) {
      cards.push(cursor);
    }
    cursor = cursor.previousElementSibling;
  }
  return cards.filter((card) => card.getAttribute("data-continuation-media-pending") === "true").length;
}

function canAdvanceHomeContinuousDiscovery(anchor) {
  return getHomeContinuousPendingMediaCount(anchor) < getAdaptiveContinuousPendingMediaCap();
}

function getAdaptiveVisibleMediaPriorityBudget() {
  const layoutMode = getClientLayoutMode();
  const isCompactLayout = layoutMode === "mobile" || layoutMode === "standalone-mobile" || layoutMode === "mobile-desktop-site";
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (isCompactLayout) {
    return scrollSpeed <= 0.18 ? 3 : 2;
  }
  return scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD ? 4 : 3;
}

function getCurrentPendingContinuationMediaCount(scope = document) {
  if (typeof document === "undefined" || currentView !== "home" || document.hidden) {
    return 0;
  }
  const root = scope instanceof Element || scope === document ? scope : document;
  return Math.max(
    0,
    Number(root.querySelectorAll?.(".product-card[data-continuation-media-pending='true']").length || 0)
  );
}

function isHomeFeedUnderPressure(scope = document) {
  const pendingMediaCount = getCurrentPendingContinuationMediaCount(scope);
  const prefetchQueueSize = Number(marketplaceScrollPrefetchQueue?.length || 0);
  const inflightPrefetchCount = Number(marketplaceScrollPrefetchInflight?.size || 0);
  return pendingMediaCount >= HOME_CONTINUOUS_HARD_PRESSURE_PENDING_MEDIA
    || prefetchQueueSize >= MARKETPLACE_PREFETCH_QUEUE_PRESSURE_THRESHOLD
    || inflightPrefetchCount >= MARKETPLACE_SCROLL_PREFETCH_CONCURRENCY;
}

function getAdaptiveContinuousPendingMediaLookback() {
  const layoutMode = getClientLayoutMode();
  const isCompactLayout = layoutMode === "mobile" || layoutMode === "standalone-mobile" || layoutMode === "mobile-desktop-site";
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return isCompactLayout ? 10 : 8;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return HOME_CONTINUOUS_PENDING_MEDIA_LOOKBACK;
  }
  return isCompactLayout ? 6 : 5;
}

function getAdaptiveContinuousPendingMediaCap() {
  const layoutMode = getClientLayoutMode();
  const isCompactLayout = layoutMode === "mobile" || layoutMode === "standalone-mobile" || layoutMode === "mobile-desktop-site";
  const scrollSpeed = Number(feedRuntimeState.lastScrollSpeed || 0);
  if (scrollSpeed <= 0.18) {
    return isCompactLayout ? 3 : 2;
  }
  if (scrollSpeed <= FEED_SCROLL_SPEED_PREFETCH_THRESHOLD) {
    return HOME_CONTINUOUS_MAX_PENDING_MEDIA_CARDS;
  }
  return 1;
}

function markMarketplaceScrollImageLoaded(image, resolvedSrc = "") {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const shell = image.closest(".progressive-image-shell");
  shell?.classList.remove("is-pending", "is-error");
  shell?.classList.add("is-loaded");
  const owningCard = image.closest(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]");
  if (owningCard instanceof Element) {
    setMarketplaceCardMediaPending(owningCard, false);
  }
  image.dataset.marketplaceImageState = "loaded";
  delete image.dataset.marketplaceRevealScheduled;
  const productId = image.dataset.imageActionProduct || "";
  const loadedSource = resolvedSrc || image.currentSrc || image.getAttribute("src") || "";
  if (
    productId
    && loadedSource
    && loadedSource !== image.dataset.fallbackSrc
    && loadedSource !== MARKETPLACE_SCROLL_IMAGE_PLACEHOLDER
  ) {
    clearBrokenMarketplaceImage(productId, loadedSource);
  }
}

function canRevealMarketplaceScrollImage(image, expectedSrc = "") {
  if (!(image instanceof HTMLImageElement)) {
    return false;
  }
  const activeSrc = image.currentSrc || image.getAttribute("src") || "";
  const targetSrc = String(expectedSrc || "").trim();
  if (targetSrc && activeSrc !== targetSrc) {
    return false;
  }
  return Number(image.naturalWidth || 0) > 0 && Number(image.naturalHeight || 0) > 0;
}

function settleMarketplaceScrollImage(image, realSrc = "") {
  if (!(image instanceof HTMLImageElement) || !realSrc) {
    return;
  }
  if (canRevealMarketplaceScrollImage(image, realSrc)) {
    markMarketplaceScrollImageLoaded(image, realSrc);
    return;
  }
  if (image.dataset.marketplaceRevealScheduled === "true") {
    return;
  }
  image.dataset.marketplaceRevealScheduled = "true";
  const finalize = () => {
    delete image.dataset.marketplaceRevealScheduled;
  };
  const tryReveal = () => {
    if (!image.isConnected) {
      finalize();
      return true;
    }
    if (canRevealMarketplaceScrollImage(image, realSrc)) {
      markMarketplaceScrollImageLoaded(image, realSrc);
      finalize();
      return true;
    }
    return false;
  };
  const pollForReveal = (attempt = 0) => {
    if (tryReveal()) {
      return;
    }
    if (attempt >= 12) {
      keepMarketplaceScrollImageDirectVisible(image, image.currentSrc || realSrc);
      finalize();
      return;
    }
    window.setTimeout(() => pollForReveal(attempt + 1), 120);
  };
  window.requestAnimationFrame(() => {
    if (tryReveal()) {
      return;
    }
    pollForReveal(0);
  });
}

function activateMarketplaceScrollImage(image, options = {}) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const realSrc = image.dataset.marketplaceRealSrc || image.dataset.progressiveRealSrc || image.dataset.imageActionSrc || image.dataset.zoomSrc || "";
  if (!realSrc) {
    image.closest(".progressive-image-shell")?.classList.add("is-error", "is-loaded");
    image.dataset.marketplaceImageState = "error";
    return;
  }
  const currentSrc = image.currentSrc || image.getAttribute("src") || "";
  const sameSource = currentSrc === realSrc;
  const alreadyLoaded = canRevealMarketplaceScrollImage(image, realSrc);
  const shouldKeepDirectVisible = shouldKeepMarketplaceScrollImageDirectVisible(image);
  const prioritizeImage = options?.priority === true
    || String(image.dataset.imagePriority || "").toLowerCase().includes("startup-critical");
  const shouldSetPending = options?.shouldSetPending === true && !shouldKeepDirectVisible;
  if (alreadyLoaded) {
    markMarketplaceScrollImageLoaded(image, realSrc);
    return;
  }
  image.setAttribute("loading", prioritizeImage ? "eager" : "lazy");
  image.setAttribute("fetchpriority", prioritizeImage ? "high" : "auto");
  if (shouldKeepDirectVisible) {
    keepMarketplaceScrollImageDirectVisible(image, sameSource ? currentSrc : realSrc);
  } else if (shouldSetPending) {
    image.closest(".progressive-image-shell")?.classList.add("is-pending");
  }
  if (!sameSource) {
    image.setAttribute("src", realSrc);
    image.dataset.marketplaceImageState = "active";
    if (!shouldKeepDirectVisible && shouldSetPending) {
      settleMarketplaceScrollImage(image, realSrc);
    }
    return;
  }
  image.dataset.marketplaceImageState = "active";
  if (!shouldKeepDirectVisible && shouldSetPending) {
    settleMarketplaceScrollImage(image, realSrc);
  }
}

function prefetchMarketplaceScrollImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const realSrc = image.dataset.marketplaceRealSrc || image.dataset.progressiveRealSrc || image.dataset.imageActionSrc || image.dataset.zoomSrc || "";
  const productId = String(image.dataset.imageActionProduct || "").trim();
  if (
    !realSrc
    || shouldDeprioritizeBrokenMarketplaceImage(productId, realSrc)
    || marketplaceScrollImagePrefetchedSources.has(realSrc)
    || marketplaceScrollPrefetchInflight.has(realSrc)
  ) {
    return;
  }
  scheduleIdleBackgroundWork(() => {
    scheduleMarketplaceScrollImagePrefetch(realSrc, productId);
  }, getAdaptiveImagePrefetchDelayMs());
  image.dataset.marketplaceImageState = image.dataset.marketplaceImageState || "prefetching";
}

function teardownMarketplaceScrollImageBinding(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  marketplaceScrollImageObserver?.unobserve?.(image);
  if (typeof image.__wingaMarketplaceLoadHandler === "function") {
    image.removeEventListener("load", image.__wingaMarketplaceLoadHandler);
    image.__wingaMarketplaceLoadHandler = null;
  }
  if (typeof image.__wingaMarketplaceErrorHandler === "function") {
    image.removeEventListener("error", image.__wingaMarketplaceErrorHandler);
    image.__wingaMarketplaceErrorHandler = null;
  }
  delete image.dataset.marketplaceScrollBound;
  delete image.dataset.marketplaceLoadListenersBound;
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
      if (!image.isConnected) {
        marketplaceScrollImageObserver?.unobserve?.(image);
        return;
      }
      if (entry.isIntersecting) {
        activateMarketplaceScrollImage(image, {
          priority: entry.intersectionRatio >= 0.01,
          shouldSetPending: true
        });
        prefetchMarketplaceScrollImage(image);
        marketplaceScrollImageObserver?.unobserve?.(image);
        return;
      }
    });
  }, {
    rootMargin: getMarketplaceScrollImageRootMargin(),
    threshold: 0.01
  });
  return marketplaceScrollImageObserver;
}

function bindMarketplaceScrollImages(scope = document) {
  const observer = ensureMarketplaceScrollImageObserver();
  bumpRuntimeDiagnostic("marketplaceImageBindCalls");
  scope.querySelectorAll("img[data-marketplace-scroll-image='true']").forEach((image) => {
    if (image.dataset.marketplaceScrollBound === "true") {
      return;
    }
    image.dataset.marketplaceScrollBound = "true";
    image.dataset.marketplaceRealSrc = image.getAttribute("src") || image.dataset.imageActionSrc || "";
    const realSrc = image.dataset.marketplaceRealSrc || image.dataset.progressiveRealSrc || image.dataset.imageActionSrc || image.dataset.zoomSrc || "";
    if (shouldKeepMarketplaceScrollImageDirectVisible(image)) {
      keepMarketplaceScrollImageDirectVisible(image, realSrc || image.currentSrc || image.getAttribute("src") || "");
    }
    const isStartupCritical = Boolean(
      String(image.dataset.imagePriority || "").toLowerCase().includes("startup-critical")
      || image.closest("[data-startup-priority-card='true']")
    );
    if (canRevealMarketplaceScrollImage(image, realSrc)) {
      markMarketplaceScrollImageLoaded(image, realSrc);
    }
    if (image.dataset.marketplaceLoadListenersBound !== "true") {
      image.dataset.marketplaceLoadListenersBound = "true";
      image.__wingaMarketplaceLoadHandler = () => {
        const resolvedSrc = image.currentSrc || image.getAttribute("src") || realSrc;
        markMarketplaceScrollImageLoaded(image, resolvedSrc);
        marketplaceScrollImageObserver?.unobserve?.(image);
      };
      image.__wingaMarketplaceErrorHandler = () => {
        const shell = image.closest(".progressive-image-shell");
        shell?.classList.remove("is-pending");
        shell?.classList.add("is-error", "is-loaded");
        const owningCard = image.closest(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]");
        if (owningCard instanceof Element) {
          setMarketplaceCardMediaPending(owningCard, false);
        }
        image.dataset.marketplaceImageState = "error";
        delete image.dataset.marketplaceRevealScheduled;
        marketplaceScrollImageObserver?.unobserve?.(image);
      };
      image.addEventListener("load", image.__wingaMarketplaceLoadHandler, { passive: true });
      image.addEventListener("error", image.__wingaMarketplaceErrorHandler, { passive: true });
    }
    const rect = image.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const prefetchMargin = getMarketplaceScrollImagePrefetchMargin();
    const activationMargin = getMarketplaceScrollImageActivationMargin();
    const isInViewport = rect.bottom >= 0 && rect.top <= viewportHeight;
    const isWithinActivationBand = rect.bottom >= -activationMargin && rect.top <= viewportHeight + activationMargin;
    const isWithinPrefetchBand = rect.bottom >= -prefetchMargin && rect.top <= viewportHeight + prefetchMargin;
    if (isStartupCritical || isInViewport || isWithinActivationBand) {
      const prioritizeImage = isStartupCritical || isInViewport;
      const owningCard = image.closest(".product-card[data-open-product], .seller-product-card[data-open-product], .showcase-card[data-open-product]");
      image.setAttribute("loading", "eager");
      image.setAttribute("fetchpriority", prioritizeImage ? "high" : "auto");
      activateMarketplaceScrollImage(image, {
        priority: prioritizeImage,
        shouldSetPending: true
      });
      if (owningCard instanceof Element && (isStartupCritical || isInViewport)) {
        const revealWindow = getAdaptiveMarketplaceCardRevealWindow();
        scheduleMarketplaceCardMediaReveal(owningCard, {
          maxWaitMs: revealWindow.maxWaitMs,
          pollMs: revealWindow.pollMs,
          requireLoaded: true
        });
      }
      observer?.unobserve(image);
    } else if (isWithinPrefetchBand) {
      image.setAttribute("loading", "lazy");
      image.setAttribute("fetchpriority", "auto");
      prefetchMarketplaceScrollImage(image);
      bumpRuntimeDiagnostic("marketplaceImageObservedCount");
      observer?.observe(image);
    } else {
      image.setAttribute("loading", "lazy");
      image.setAttribute("fetchpriority", "auto");
      bumpRuntimeDiagnostic("marketplaceImageObservedCount");
      observer?.observe(image);
    }
  });
  activateViewportReadyFeedImages(scope, {
    limit: MARKETPLACE_VIEWPORT_IMAGE_SWEEP_LIMIT
  });
}

function bindProductMenus(scope) {
  bumpRuntimeDiagnostic("productMenuBindCalls");
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
    if (button.dataset.menuToggleBound === "true") {
      return;
    }
    button.dataset.menuToggleBound = "true";
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
    if (popup.dataset.menuPopupBound === "true") {
      return;
    }
    popup.dataset.menuPopupBound = "true";
    popup.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  scope.querySelectorAll("[data-menu-action]").forEach((button) => {
    if (button.dataset.menuActionBound === "true") {
      return;
    }
    button.dataset.menuActionBound = "true";
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
      return images;
    })
    .catch((error) => {
      previewList.replaceChildren();
      previewList.style.display = "none";
      throw error;
    });
}
function waitForNextFrame() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

async function readFilesAsDataUrls(files) {
  const results = [];
  for (let index = 0; index < files.length; index += 1) {
    const imageDataUrl = await readFileAsDataUrl(files[index], {
      purpose: "product",
      fastMode: files.length > 1
    });
    results.push(imageDataUrl);
    if (index < files.length - 1) {
      await waitForNextFrame();
    }
  }
  return results;
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
  Number(window.WINGA_CONFIG?.sessionRestoreTimeoutMs || 5000)
);
const LIFECYCLE_FALLBACK_DELAY_MS = Math.max(
  1600,
  Number(window.WINGA_CONFIG?.lifecycleFallbackDelayMs || 2600)
);
const LIFECYCLE_RETRY_DELAY_MS = Math.max(
  1800,
  Number(window.WINGA_CONFIG?.lifecycleRetryDelayMs || 3000)
);
const DEEP_LINK_RECOVERY_DELAY_MS = Math.max(
  2200,
  Number(window.WINGA_CONFIG?.deepLinkRecoveryDelayMs || 4200)
);

async function bootApp() {
  const lifecycleEpoch = beginLifecycleEpoch("boot");
  lifecycleRuntimeState.bootEpoch = lifecycleEpoch;
  productHydrationStatus = "loading";
  reportBootPhase("app_shell_mounted", {
    pathname: window.location.pathname || "/"
  });
  reportClientEvent("info", "app_boot_started", "Client app boot started.", {
    category: "runtime"
  });
  clearBlockedDemoBootstrapSnapshot();
  document.body.classList.add("app-booting");
  document.body.classList.remove("app-ready");
  revealBootOverlay();
  scheduleBootOverlayHardSafety("boot_start");
  const bootstrapCleanupPromise = initializeBootstrapStorageVersion();
  syncAuthMode();
  authContainer.style.display = "none";
  document.body.classList.remove("auth-modal-open");
  appContainer.style.display = "block";
  initializePwaInstallExperience();
  refreshPublicEntryChrome();
  homeFeedRefreshCursor = initializeHomeFeedRefreshCursor();
  suppressInitialProductHomeRender = Boolean(getDeepLinkedProductIdFromRoute());
  const cachedSession = window.WingaDataLayer.bootstrapSession
    ? window.WingaDataLayer.bootstrapSession()
    : null;
  const shouldDeferInitialBootRenderForStaffSession = Boolean(
    cachedSession?.username
    && isStaffRole(cachedSession.role || "")
    && !isAdminLoginRoute()
  );
  if (cachedSession?.username) {
    applySessionState(cachedSession);
    saveSessionUser(cachedSession);
    showSessionRestoringState(currentSession?.role && isStaffRole(currentSession.role)
      ? "Tunaangalia admin session yako nyuma ya pazia."
      : "Tunaangalia session yako nyuma ya pazia.");
  }
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  if (suppressInitialProductHomeRender) {
    showDeepLinkLoadingState("Tunafungua bidhaa uliyoifungua...");
  }
  if (suppressInitialProductHomeRender) {
    setDeepLinkLoadingShellVisible(false);
  }

  showInstantBootFeedSnapshot("boot_pre_hydration_snapshot");
  auditHydratedDataIntegrity("boot_pre_hydration_snapshot");

  await bootstrapCleanupPromise;
  if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
    return;
  }

  await window.WingaDataLayer.init();
  if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
    return;
  }
  syncNotificationPermissionStateFromBrowser();
  const appSettingsPromise = window.WingaDataLayer.loadAppSettings
    ? window.WingaDataLayer.loadAppSettings().catch(() => null)
    : Promise.resolve(null);
  if (window.WingaDataLayer?.hydrateStartupData) {
    window.WingaDataLayer.hydrateStartupData().catch((error) => {
      productHydrationStatus = "failed";
      if (!hasImmediateProductsAvailable() && !hasVisibleStartupSurface({ includeFeedLoading: false })) {
        renderLifecycleFallbackSkeleton("Hatukuweza kupakia bidhaa kutoka kwenye seva. Hakikisha mtandao upo kisha bonyeza Jaribu tena.");
      } else {
        hideLifecycleFallbackShell();
      }
      captureClientError("startup_hydration_failed", error, {
        category: "runtime",
        alertSeverity: "medium"
      });
    });
  }
  const rememberedSessionPromise = window.WingaDataLayer.restoreSession();
  const appSettings = await appSettingsPromise;
  if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
    return;
  }
  if (appSettings) {
    applyAppSettings(appSettings);
  }

  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
    return;
  }

  if (shouldDeferInitialBootRenderForStaffSession) {
    setCurrentViewState("admin", getEphemeralLifecycleViewOptions());
    renderCurrentView();
    scheduleChromeOffsetSync();
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-ready");
    hideLifecycleFallbackShell();
    completeBootOverlay();
    startMemoryMonitoring();

    if (typeof ResizeObserver !== "undefined") {
      uiRuntimeState.chromeResizeObserver?.disconnect?.();
      uiRuntimeState.chromeResizeObserver = new ResizeObserver(() => {
        scheduleChromeOffsetSync();
      });
      uiRuntimeState.chromeResizeObserver.observe(topBar);
      uiRuntimeState.chromeResizeObserver.observe(bottomNav);
    }

    scheduleSingleServiceWorkerRegistration();
    return;
  }

  ensureProductsForImmediateRender();
  const retainedBootHomeFeedSurface = Boolean(
    !suppressInitialProductHomeRender
    && currentView === "home"
    && productsContainer?.querySelector(".product-card[data-open-product], .seller-product-card[data-open-product]")
  );
  if (retainedBootHomeFeedSurface) {
    window.requestAnimationFrame(() => {
      if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
        return;
      }
      mergeAvailableCategories(inferCategoriesFromData());
      refreshCategoryUI();
    });
    resumeRetainedHomeFeedSurface("boot_initial_render_retained", {
      productLimit: 8,
      decodeLimit: 3,
      delayMs: 0,
      prefetch: false
    });
    reportBootPhase("feed_retained", {
      reason: "boot_initial_render_retained",
      productsCount: Array.isArray(products) ? products.length : 0
    });
  } else {
    mergeAvailableCategories(inferCategoriesFromData());
    refreshCategoryUI();
    if (!suppressInitialProductHomeRender) {
      renderCurrentView({ reason: "boot_initial_render", force: true });
      reportBootPhase("feed_rendered", {
        reason: "boot_initial_render",
        productsCount: Array.isArray(products) ? products.length : 0
      });
    }
  }
  window.requestAnimationFrame(() => {
    if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
      return;
    }
    scheduleStartupImageWork(products, {
      reason: "boot_refresh",
      productLimit: 8,
      imageLimitPerProduct: 1,
      decodeLimit: 3,
      delayMs: 700
    });
  });
  scheduleDeferredImageSignatureHydration(products, {
    reason: "boot_refresh",
    productLimit: 24,
    delayMs: 3600
  });

      window.setTimeout(() => {
        if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
          return;
        }
        scheduleIdleBackgroundWork(() => {
          if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
            return;
          }
          window.WingaDataLayer.loadReviews()
            .then((reviewPayload) => {
              if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
                return;
              }
              currentReviews = Array.isArray(reviewPayload?.reviews) ? reviewPayload.reviews : [];
              reviewSummaries = reviewPayload?.summaries || {};
              const scrollRecentlyActive = Date.now() - Number(uiRuntimeState.lastScrollActivityAt || 0) < 900;
              if (!scrollRecentlyActive && (currentView !== "home" || document.body.classList.contains("product-detail-open"))) {
                scheduleRenderCurrentView();
              } else if (scrollRecentlyActive) {
                window.setTimeout(() => {
                  if (currentView !== "home" || document.body.classList.contains("product-detail-open")) {
                    return;
                  }
                  if (Date.now() - Number(uiRuntimeState.lastScrollActivityAt || 0) < 900) {
                    return;
                  }
                  requestCurrentSurfaceRefresh("reviews_home_resume", {
                    productLimit: 6,
                    decodeLimit: 2,
                    prefetch: false
                  });
                }, 1200);
              }
            })
            .catch((error) => {
          if (!isLifecycleEpochCurrent(lifecycleEpoch)) {
            return;
          }
          currentReviews = [];
          reviewSummaries = {};
          captureClientError("reviews_boot_load_failed", error, {
            category: "runtime",
            alertSeverity: "medium"
          });
        });
    }, 1800);
  }, 1500);
  startBackgroundSessionRestore(rememberedSessionPromise, cachedSession, { lifecycleEpoch });

  if (isAdminLoginRoute()) {
    showAdminLoginScreen();
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-ready");
    hideLifecycleFallbackShell();
    completeBootOverlay();
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
  const bootTargetView = getBootTargetView(cachedSession);
  const shouldUseEphemeralBootView = Boolean(cachedSession?.username);
  if (suppressInitialProductHomeRender) {
    setCurrentViewState("home", shouldUseEphemeralBootView ? getEphemeralLifecycleViewOptions() : { syncHistory: false });
    openDeepLinkedProductRouteIfNeeded({ skipHomeRender: true });
  } else {
    setCurrentViewState(
      bootTargetView,
      shouldUseEphemeralBootView
        ? getEphemeralLifecycleViewOptions()
        : undefined
    );
    renderCurrentView();
    if (bootTargetView === "home") {
      openDeepLinkedProductRouteIfNeeded();
    }
  }
  scheduleChromeOffsetSync();
  document.body.classList.remove("app-booting");
  document.body.classList.add("app-ready");
  hideLifecycleFallbackShell();
  completeBootOverlay();
  startMemoryMonitoring();

  if (typeof ResizeObserver !== "undefined") {
    uiRuntimeState.chromeResizeObserver?.disconnect?.();
    uiRuntimeState.chromeResizeObserver = new ResizeObserver(() => {
      scheduleChromeOffsetSync();
    });
    uiRuntimeState.chromeResizeObserver.observe(topBar);
    uiRuntimeState.chromeResizeObserver.observe(bottomNav);
  }

  scheduleSingleServiceWorkerRegistration();
}

if (!uiRuntimeState.marketplaceImagePipelineLifecycleBound) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelMarketplaceScrollPrefetchWork("document_hidden");
      return;
    }
    resumeMarketplaceImagePipeline("document_visible");
  });

  window.addEventListener("pagehide", () => {
    cancelMarketplaceScrollPrefetchWork("pagehide", {
      clearDecodedCache: false
    });
  });

  window.addEventListener("pageshow", () => {
    if (currentView === "home" && resumeRetainedHomeFeedSurface("pageshow_resume", {
      productLimit: 10,
      decodeLimit: 4,
      delayMs: 0
    })) {
      return;
    }
    resumeMarketplaceImagePipeline("pageshow");
  });

  uiRuntimeState.marketplaceImagePipelineLifecycleBound = true;
}

window.setTimeout(() => {
  const overlay = document.getElementById("boot-overlay");
  if (
    overlay
    && (!overlay.classList.contains("is-hidden") || overlay.style.display !== "none")
  ) {
    forceHideBootOverlaySafety("global_boot_safety");
  }
}, BOOT_OVERLAY_HARD_SAFETY_TIMEOUT_MS);

bootApp().catch((error) => {
  console.error("[WINGA] bootApp failed", error);
  captureClientError("boot_failed", error, {
    provider: window.WINGA_CONFIG?.provider || "unknown"
  });
  showFatalStartupState(error);
});










