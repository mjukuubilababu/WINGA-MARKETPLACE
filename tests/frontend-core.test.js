const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  createProductSearchText,
  filterProducts,
  getSearchQueryDescriptor,
  getShowcaseProducts,
  canRenderBuyButton,
  getOrderActionState,
  getOrderLifecycleMeta,
  resolveBootView
} = require("../app-core.js");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("home feed reserves stable media and deferred section geometry", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const gallerySource = fs.readFileSync(path.join(root, "src", "marketplace", "gallery.js"), "utf8");

  assert.match(buildSource, /"src\/marketplace\/gallery\.js"/);
  assert.match(gallerySource, /window\.WingaModules\.marketplace\.createGalleryModule = createGalleryModule;/);
  assert.match(gallerySource, /hasStoredAspectRatio \? String\(Number\(storedAspectRatio\.toFixed\(6\)\)\) : "4 \/ 5"/);
  assert.match(appSource, /window\.WingaModules\?\.marketplace\?\.createGalleryModule/);
  assert.match(appSource, /window\.requestAnimationFrame\(\(\) => \{\s+onChunk\?\.\(chunk\);/);
  assert.match(styleSource, /#products-container > \.product-card > \.product-card-media\{\s+aspect-ratio:var\(--fit-media-aspect-ratio, 4 \/ 5\) !important;/);
  assert.match(styleSource, /#products-container > \.showcase-inline-pending\{\s+min-height:560px;/);
  assert.match(styleSource, /contain-intrinsic-size:0 560px;/);
  assert.match(appSource, /container\.style\.setProperty\("--winga-viewport-width", `\$\{usableViewportWidth\}px`\);/);
  assert.match(appSource, /function handleWindowResize\(\) \{\s+toggleHeaderUserMenu\(false\);\s+applyFeedLayoutMode\(productsContainer\);/);
  assert.match(styleSource, /#products-container\[data-layout-mode\]\{[\s\S]*left:50%;[\s\S]*transform:translateX\(-50%\);[\s\S]*width:var\(--winga-viewport-width, 100vw\);/);
  assert.match(styleSource, /#products-container\[data-layout-mode\]\s*>\s*\.product-card,[\s\S]*width:100%;/);
  assert.match(styleSource, /#top-bar\{[\s\S]*box-sizing:border-box;[\s\S]*width:var\(--winga-viewport-width, 100%\);/);
  assert.match(styleSource, /#products-container\[data-layout-mode\] > \.showcase-inline,[\s\S]*width:100%;[\s\S]*margin-left:0;/);
  assert.match(styleSource, /html,\s*body\{\s*scrollbar-width:none;\s*-ms-overflow-style:none;/);
  assert.match(styleSource, /html::\-webkit-scrollbar,\s*body::\-webkit-scrollbar\{[\s\S]*width:0;[\s\S]*display:none;/);
  assert.doesNotMatch(styleSource, /@media \(max-width:780px\)\{[\s\S]*html,\s*body\{[^}]*overflow-y:hidden;/);
  assert.doesNotMatch(styleSource, /body\[data-layout-mode="standalone-mobile"\] #market-showcase,\s*body\[data-layout-mode="standalone-mobile"\] #products-container/);
  assert.match(styleSource, /body\[data-layout-mode="standalone-mobile"\] #products-container\[data-layout-mode="standalone-mobile"\]\{[\s\S]*width:100dvw;[\s\S]*transform:translateX\(-50%\);/);
  assert.match(styleSource, /#products-container \.progressive-image-shell \.progressive-image-full\{[\s\S]*object-fit:contain !important;/);
  assert.match(styleSource, /#products-container \.feed-gallery-carousel-track\{[\s\S]*overflow-x:auto !important;[\s\S]*scroll-snap-type:x mandatory !important;/);
  const marketplaceUiSource = fs.readFileSync(path.join(root, "src", "marketplace", "ui.js"), "utf8");
  assert.match(marketplaceUiSource, /\? safeImages\.slice\(\)/);
  assert.doesNotMatch(marketplaceUiSource, /safeImages\.slice\(0,\s*FEED_GALLERY_IMAGE_LIMIT\)/);
  assert.match(styleSource, /\.product-detail-media,[\s\S]*\.profile-product-stage\{[\s\S]*width:100% !important;[\s\S]*padding-left:0 !important;/);
  assert.match(styleSource, /\.product-card-media img,[\s\S]*\.feed-gallery-preview img\{[\s\S]*width:100% !important;/);
});

test("marketplace gallery module preserves feed carousel markup contract", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "gallery.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } }
  });
  vm.runInContext(source, context);
  const preloaded = [];
  const gallery = context.window.WingaModules.marketplace.createGalleryModule({
    getRenderableMarketplaceImages: (product) => Array.isArray(product?.images) ? product.images : [],
    getImageFallbackDataUri: (label) => `fallback-${label}`,
    isVariantFeedEntry: (product) => product?.feedEntryType === "variant",
    normalizeProductFitMode: (value) => String(value || "").toLowerCase() === "contain" ? "contain" : "cover",
    getProductFitMode: (product) => product.fitMode || "cover",
    preloadImageSource: (src, options) => preloaded.push({ src, options }),
    sanitizeImageSource: (value, fallback = "") => String(value || fallback || "").replace(/^/, "/"),
    escapeHtml: (value) => String(value || "").replace(/"/g, "&quot;"),
    createProgressiveImage: ({ src, alt, className, fitMode, attributes }) => ({
      outerHTML: `<img src="${src}" alt="${alt}" class="${className}" data-fit-mode="${fitMode}" loading="${attributes.loading}" fetchpriority="${attributes.fetchpriority}" data-feed-gallery-primary="${attributes["data-feed-gallery-primary"] || ""}" data-direct-visibility="${attributes["data-direct-visibility"] || ""}">`
    })
  });

  const html = gallery.renderFeedGalleryMarkup({
    name: "Shirt",
    images: ["white.jpg", "black.jpg"],
    imageAspectRatios: [0.8, 0.7],
    feedEntryType: "variant",
    visibleImageIndex: 1
  }, "feed", {
    preload: true,
    priorityCount: 1
  });

  assert.equal(preloaded.length, 1);
  assert.match(html, /data-feed-gallery-carousel="true"/);
  assert.match(html, /data-feed-gallery-current="2"/);
  assert.match(html, /data-feed-gallery-initial-index="1"/);
  assert.match(html, /data-feed-gallery-stable-ratio="0.7"/);
  assert.match(html, /data-fit-mode="contain"/);
  assert.match(html, /data-direct-visibility="true"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /progressive-image-shell[^"]*is-loaded/);
  assert.doesNotMatch(source, /createProgressiveImage\([\s\S]*?\)\.outerHTML/);
  assert.match(source, /function bindFeedGalleryInteractions\(scope = document\)/);
  assert.match(source, /track\.addEventListener\("pointerdown"/);
  assert.match(source, /noteProductEngagementSignal\(productId, "variation_swipe", variationSwipeWeight\)/);
  assert.match(appSource, /function bindFeedGalleryInteractions\(scope = document\) \{\s+getMarketplaceGalleryTools\(\)\.bindFeedGalleryInteractions\?\.\(scope\);\s+\}/);
});

test("marketplace image loader is a bundled module dependency, not an app fallback", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const imageLoaderSource = fs.readFileSync(path.join(root, "src", "marketplace", "image-loader.js"), "utf8");

  assert.match(imageLoaderSource, /function createImageLoaderModule\(deps = \{\}\)/);
  assert.match(imageLoaderSource, /window\.WingaModules\.marketplace\.createImageLoaderModule = createImageLoaderModule/);
  assert.match(appSource, /const createMarketplaceImageLoaderModule = window\.WingaModules\.marketplace\.createImageLoaderModule;/);
  assert.doesNotMatch(appSource, /createMarketplaceImageLoaderModule = window\.WingaModules\.marketplace\.createImageLoaderModule \|\|/);
  assert.match(appSource, /Winga marketplace image loader module is required before app boot/);
  assert.ok(
    buildSource.indexOf('"src/marketplace/image-loader.js"') < buildSource.indexOf('"src/marketplace/ui.js"'),
    "image loader must be bundled before marketplace UI and app boot"
  );
});

test("app events module controls global listener registration", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "app", "events.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const calls = [];
  const target = {
    id: "target",
    addEventListener: (type, handler, options) => calls.push(["add", type, handler, options]),
    removeEventListener: (type, handler, options) => calls.push(["remove", type, handler, options])
  };
  const context = vm.createContext({
    window: { WingaModules: { app: {} } },
    document: {},
    AbortController: undefined
  });
  vm.runInContext(source, context);
  const events = context.window.WingaModules.app.createAppEventsModule();
  const handler = () => {};

  events.register({ target, type: "click", handler, key: "target:click" });
  events.register({ target, type: "click", handler, key: "target:click" });

  assert.equal(calls.filter(([kind]) => kind === "add").length, 1);
  const registeredKeys = events.getRegisteredKeys();
  assert.equal(registeredKeys.length, 1);
  assert.equal(registeredKeys[0], "target:click");
  assert.equal(events.unregister("target:click"), true);
  assert.equal(calls.filter(([kind]) => kind === "remove").length, 1);
  assert.match(registrySource, /window\.WingaModules\.app = window\.WingaModules\.app \|\| \{\};/);
  assert.match(source, /window\.WingaModules\.app\.createAppEventsModule = createAppEventsModule;/);
  assert.match(appSource, /function registerAppEvent\(target, type, handler, options = undefined, key = ""\)/);
  assert.match(appSource, /registerAppEvent\(window, "scroll"/);
  assert.match(appSource, /registerAppEvent\(window, "winga:products-hydrated"/);
  assert.match(appSource, /registerAppEvent\(document, "visibilitychange"/);
  assert.ok(
    buildSource.indexOf('"src/app/events.js"') < buildSource.indexOf('"src/auth/permissions.js"'),
    "app events module must be bundled before app/auth boot code"
  );
});

test("auth session runtime module owns restore token and reporting", async () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "auth", "session-runtime.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { auth: {} } }
  });
  vm.runInContext(source, context);

  const events = [];
  const bootPhases = [];
  let currentSession = null;
  let cancelReason = "";
  let loginPayload = null;
  const runtime = context.window.WingaModules.auth.createSessionRuntimeModule({
    bootTimeoutMs: 50,
    getBootstrapSession: () => ({ token: "cached-token" }),
    cancelDataLayerSessionRestore: (reason) => { cancelReason = reason; },
    isLifecycleEpochCurrent: (epoch) => epoch === 7,
    isStaffRole: (role) => role === "admin",
    applySessionState: (session) => { currentSession = session; },
    getCurrentSession: () => currentSession,
    saveSessionUser: (session) => events.push(["save", session?.username || ""]),
    loginSuccess: (...args) => { loginPayload = args; },
    clearSessionUser: () => events.push(["clear"]),
    reportClientEvent: (level, eventName) => events.push([level, eventName]),
    reportBootPhase: (phase, contextPayload) => bootPhases.push([phase, contextPayload]),
    captureClientError: (eventName) => events.push(["error", eventName]),
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {}
  });

  runtime.cancelPendingSessionRestore("manual_login");
  assert.equal(cancelReason, "manual_login");
  assert.ok(events.some((entry) => entry[1] === "session_restore_cancelled"));

  runtime.startBackgroundSessionRestore(Promise.resolve({ username: "old-user", role: "seller" }), {
    username: "old-user",
    role: "seller",
    token: "stale-token"
  }, { lifecycleEpoch: 7 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loginPayload, null);

  runtime.startBackgroundSessionRestore(Promise.resolve({ username: "maria", role: "admin", primaryCategory: "fashion" }), {
    username: "maria",
    role: "admin",
    token: "cached-token"
  }, { lifecycleEpoch: 7 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(currentSession.username, "maria");
  assert.equal(loginPayload[0], "maria");
  assert.equal(loginPayload[3].forceView, "admin");
  assert.ok(bootPhases.some(([phase, payload]) => phase === "session_restore_started" && payload.hasToken === true));
  assert.ok(bootPhases.some(([phase, payload]) => phase === "session_restore_finished" && payload.outcome === "restored"));
  assert.match(source, /window\.WingaModules\.auth\.createSessionRuntimeModule = createSessionRuntimeModule/);
  assert.match(appSource, /window\.WingaModules\?\.auth\?\.createSessionRuntimeModule/);
  assert.doesNotMatch(appSource, /activeSessionRestoreToken/);
  assert.ok(
    buildSource.indexOf('"src/auth/session-runtime.js"') < buildSource.indexOf('"src/boot/lifecycle.js"'),
    "auth session runtime must be bundled before boot lifecycle/app boot"
  );
});

test("boot lifecycle module owns lifecycle epoch and boot target helpers", () => {
  const root = path.resolve(__dirname, "..");
  const lifecycleSource = fs.readFileSync(path.join(root, "src", "boot", "lifecycle.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { boot: {} } }
  });
  vm.runInContext(lifecycleSource, context);
  const lifecycleState = {};
  const lifecycle = context.window.WingaModules.boot.createLifecycleModule({
    getState: () => lifecycleState,
    isStaffRole: (role) => role === "admin"
  });

  const firstEpoch = lifecycle.beginLifecycleEpoch("boot");
  const secondEpoch = lifecycle.beginLifecycleEpoch("runtime");

  assert.equal(firstEpoch, 1);
  assert.equal(secondEpoch, 2);
  assert.equal(lifecycleState.activeKind, "runtime");
  assert.equal(lifecycle.isLifecycleEpochCurrent(firstEpoch), false);
  assert.equal(lifecycle.isLifecycleEpochCurrent(secondEpoch), true);
  const ephemeralOptions = lifecycle.getEphemeralLifecycleViewOptions({ reason: "test" });
  assert.equal(ephemeralOptions.persist, false);
  assert.equal(ephemeralOptions.syncHistory, false);
  assert.equal(ephemeralOptions.reason, "test");
  assert.equal(lifecycle.getBootTargetView({ role: "admin" }), "admin");
  assert.equal(lifecycle.getBootTargetView({ role: "seller" }), "home");
  assert.match(registrySource, /window\.WingaModules\.boot = window\.WingaModules\.boot \|\| \{\};/);
  assert.match(lifecycleSource, /window\.WingaModules\.boot\.createLifecycleModule = createLifecycleModule;/);
  assert.match(appSource, /window\.WingaModules\?\.boot\?\.createLifecycleModule/);
  assert.doesNotMatch(appSource, /lifecycleRuntimeState\.epoch = nextEpoch/);
  assert.ok(
    buildSource.indexOf('"src/boot/lifecycle.js"') < buildSource.indexOf('"src/monitoring/performance.js"'),
    "boot lifecycle module must be bundled before app boot"
  );
});

test("app boot helpers avoid duplicate hoisted declarations", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const viewportDeclarations = appSource.match(/function getViewportWidth\(/g) || [];
  const pruneDeclarations = appSource.match(/function pruneTimestampRegistry\(/g) || [];

  assert.equal(viewportDeclarations.length, 1);
  assert.equal(pruneDeclarations.length, 1);
});

test("home pagination retries safely, cancels stale work, and commits pages transactionally", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const backendSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const continuationSource = fs.readFileSync(path.join(root, "src", "marketplace", "continuation.js"), "utf8");

  assert.match(appSource, /const HOME_LOAD_MORE_MAX_ATTEMPTS = 3;/);
  assert.match(appSource, /function loadHomeFeedPageWithRetry\(loadPage, options = \{\}\)/);
  assert.match(appSource, /loadMoreAbortController = abortController/);
  assert.match(appSource, /signal: abortController\?\.signal/);
  assert.match(appSource, /setHomeFeedLoadMoreState\("success-products"/);
  assert.match(appSource, /setHomeFeedLoadMoreState\("success-empty"/);
  assert.match(appSource, /setHomeFeedLoadMoreState\("error"/);
  assert.match(appSource, /cancelHomeFeedLoadMore\("view_changed"\)/);
  assert.match(appSource, /cancelHomeFeedLoadMore\("document_hidden"\)/);
  assert.match(appSource, /const CONTINUATION_MEDIA_PENDING_HARD_TIMEOUT_MS = 1200;/);
  assert.match(appSource, /const HOME_CONTINUOUS_PRESSURE_BOUNDED_WAIT_MS = 900;/);
  assert.match(appSource, /function shouldDeferHomeContinuousHydration\(anchor, scope = productsContainer \|\| document\)/);
  assert.match(appSource, /function releaseStaleContinuationMediaPending\(scope = document, maxAgeMs = CONTINUATION_MEDIA_PENDING_HARD_TIMEOUT_MS\)/);
  assert.match(appSource, /if \(requireLoaded && waitedMs >= Math\.max\(maxWaitMs, CONTINUATION_MEDIA_PENDING_HARD_TIMEOUT_MS\)\)/);
  assert.match(appSource, /logHomeInfiniteDiagnostic\("hydrate_gate"/);
  assert.match(appSource, /logHomeInfiniteDiagnostic\("sentinel_trigger"/);
  assert.match(appSource, /logHomeInfiniteDiagnostic\("backend_append_result"/);
  assert.match(appSource, /return Boolean\(window\.WINGA_CONFIG\?\.enableClientEventLogging\);/);
  assert.match(buildSource, /"src\/marketplace\/continuation\.js"/);
  assert.match(continuationSource, /window\.WingaModules\.marketplace\.createContinuationHelpers = createContinuationHelpers;/);
  assert.match(appSource, /window\.WingaModules\?\.marketplace\?\.createContinuationHelpers/);

  assert.match(dataSource, /signal: options\.signal/);
  assert.match(dataSource, /signal: nextOptions\.signal/);
  const firstStateMutation = dataSource.indexOf("state.products = mergeUniqueProducts(state.products, receivedProducts)");
  const lookaheadRequest = dataSource.indexOf("const lookaheadPage = await state.adapter.loadProductsPage(lookaheadOptions)");
  assert.ok(lookaheadRequest >= 0);
  assert.ok(firstStateMutation > lookaheadRequest);
  assert.match(dataSource, /const appendedItems = receivedProducts\.filter/);

  assert.match(backendSource, /return String\(second\?\.id \|\| ""\)\.localeCompare\(String\(first\?\.id \|\| ""\)\);/);
});

test("marketplace continuation helpers bound media pressure without blocking hydration forever", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "continuation.js"), "utf8");
  class TestElement {
    constructor() {
      this.dataset = {};
      this.attrs = new Map();
    }
    getAttribute(name) {
      return this.attrs.get(name) || "";
    }
    setAttribute(name, value) {
      this.attrs.set(name, String(value));
    }
  }
  let now = 2000;
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } },
    Element: TestElement
  });
  vm.runInContext(source, context);
  const helpers = context.window.WingaModules.marketplace.createContinuationHelpers({
    now: () => now,
    hasHealthyMarketplaceCardMedia: () => false,
    config: {
      pendingHardTimeoutMs: 1200,
      pressureBoundedWaitMs: 900,
      hardPressurePendingMedia: 4,
      prefetchQueuePressureThreshold: 18,
      scrollPrefetchConcurrency: 4,
      feedScrollSpeedPrefetchThreshold: 0.72,
      continuousPendingMediaLookback: 8,
      continuousMaxPendingMediaCards: 2
    }
  });

  const card = new TestElement();
  card.setAttribute("data-continuation-media-pending", "true");
  card.dataset.continuationMediaPendingSince = "900";
  assert.equal(helpers.isContinuationMediaPendingStale(card, 1200), false);
  now = 2200;
  assert.equal(helpers.isContinuationMediaPendingStale(card, 1200), true);
  assert.equal(helpers.getAdaptiveContinuationLeadCardCount(0.1), 3);
  assert.equal(helpers.getAdaptiveContinuationAdmissionWindowMs(0.8), 90);
  assert.equal(helpers.getAdaptiveContinuousPendingMediaLookback("standalone-mobile", 0.1), 10);
  assert.equal(helpers.getAdaptiveContinuousPendingMediaCap("mobile", 0.1), 3);

  const snapshot = helpers.getHomeContinuationPressureSnapshot({
    pendingCount: 3,
    currentPendingCount: 1,
    prefetchQueueSize: 0,
    inflightPrefetchCount: 0,
    adaptiveCap: 2
  });
  assert.equal(snapshot.blockedByPendingWindow, true);
  assert.equal(snapshot.blockedByFeedPressure, false);

  const deferred = helpers.getHydrationAdmission({ snapshot, firstBlockedAt: 2000, now: 2500 });
  assert.equal(deferred.defer, true);
  assert.equal(deferred.reason, "pending_media");
  const released = helpers.getHydrationAdmission({ snapshot, firstBlockedAt: 2000, now: 3000 });
  assert.equal(released.defer, false);
  assert.equal(released.reason, "bounded_pressure_release");
  assert.equal(released.shouldReleasePending, true);
});

test("product query surfaces share one paginated contract and bounded virtual node retention", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const profileSource = fs.readFileSync(path.join(root, "src", "profile", "controller.js"), "utf8");
  const detailSource = fs.readFileSync(path.join(root, "src", "product-detail", "controller.js"), "utf8");

  assert.match(dataSource, /async queryProductsPage\(options = \{\}\)/);
  assert.match(dataSource, /query\.set\("q", String\(options\.query/);
  assert.match(dataSource, /query\.set\("category", String\(options\.category/);
  assert.match(dataSource, /query\.set\("seller", String\(options\.seller/);
  assert.match(dataSource, /while \(state\.productQueryCache\.size > 24\)/);

  assert.match(appSource, /function scheduleHomeProductQueryHydration\(delayMs = 180\)/);
  assert.match(appSource, /async function hydrateSellerProductsForProfile\(seller, options = \{\}\)/);
  assert.match(appSource, /async function hydrateProductDetailContinuationProducts\(product\)/);
  assert.match(appSource, /append: true[\s\S]*scheduleRenderCurrentView\("product_query_page_appended"\)/);
  assert.match(profileSource, /deps\.hydrateSellerProducts\(currentUser\)/);
  assert.match(profileSource, /data-profile-products-load-more/);
  assert.match(profileSource, /deps\.hydrateSellerProducts\(currentUser, \{ append: true \}\)/);
  assert.match(detailSource, /deps\.hydrateContinuationProducts\(product\)/);

  assert.match(appSource, /const HOME_INFINITE_MAX_RETAINED_VIRTUAL_NODES = 24;/);
  assert.match(appSource, /function compactHomeVirtualNodeRecords\(\)/);
  assert.match(appSource, /record\.node = null;/);
  assert.match(appSource, /createProductCardElement\(\{\s+\.\.\.product,/);
});

test("production telemetry stays silent in the browser console while transport remains active", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "monitoring", "observability.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const performanceSource = fs.readFileSync(path.join(root, "src", "monitoring", "performance.js"), "utf8");
  const marketplaceSource = fs.readFileSync(path.join(root, "src", "marketplace", "ui.js"), "utf8");
  const detailSource = fs.readFileSync(path.join(root, "src", "product-detail", "controller.js"), "utf8");
  const logged = [];
  const emitted = [];
  const listeners = {};
  const context = vm.createContext({
    console: {
      log: (...args) => logged.push(["log", ...args]),
      warn: (...args) => logged.push(["warn", ...args]),
      error: (...args) => logged.push(["error", ...args])
    },
    location: { hostname: "wingamarket.com" },
    window: {
      WingaModules: { monitoring: {} },
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      }
    }
  });
  vm.runInContext(source, context);

  const observability = context.window.WingaModules.monitoring.createObservabilityModule({
    emitClientEvent: async (payload) => {
      emitted.push(payload);
    },
    consoleObject: context.console
  });
  observability.reportEvent("warn", "scrollStopToImageVisibleMs", "Experience visibility metric exceeded threshold.", {
    category: "performance",
    durationMs: 900
  });
  observability.reportEvent("info", "app_boot_completed", "Client app boot completed.", {
    category: "runtime"
  });

  assert.equal(logged.length, 0);
  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted.map((event) => event.event), [
    "scrollStopToImageVisibleMs",
    "app_boot_completed"
  ]);
  assert.match(buildSource, /"src\/monitoring\/performance\.js"/);
  assert.match(performanceSource, /window\.WingaModules\.monitoring\.createPerformanceModule = createPerformanceModule;/);
  assert.match(performanceSource, /if \(isProductionRuntime\(\)\) \{\s+return queryDebugEnabled;/);
  assert.match(appSource, /window\.WingaModules\?\.monitoring\?\.createPerformanceModule/);
  assert.match(appSource, /if \(isExperienceMetricDebugEnabled\(\)\) \{\s+safePerformanceMark\("winga_render_start"\);/);
  assert.match(marketplaceSource, /feedVariantResurface && deps\.isPerformanceDebugEnabled\?\.\(\)/);
  assert.match(detailSource, /initialImageIndex \|\| 0\) > 0 && deps\.isPerformanceDebugEnabled\?\.\(\)/);
});

test("service worker refreshes versioned frontend assets without trapping stale CSS", () => {
  const root = path.resolve(__dirname, "..");
  const serviceWorkerSource = fs.readFileSync(path.join(root, "sw.js"), "utf8");

  assert.match(serviceWorkerSource, /const BUILD_VERSION = "__WINGA_BUILD_VERSION__";/);
  assert.match(serviceWorkerSource, /const CACHE = `winga-shell-v7-\$\{BUILD_VERSION\}`;/);
  assert.match(serviceWorkerSource, /fetch\(event\.request, \{ cache: "no-cache" \}\)/);
  assert.match(serviceWorkerSource, /const cached = await cache\.match\(event\.request\);/);
  assert.doesNotMatch(serviceWorkerSource, /const cached = await cache\.match\(event\.request\);\s*if \(cached\) \{\s*return cached;\s*\}\s*const response = await fetch/);
});

test("production CSP is enforced from repo without inline script escape hatches", () => {
  const root = path.resolve(__dirname, "..");
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const backendSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
  const workerSource = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  const staticHeadersSource = fs.readFileSync(path.join(root, "_headers"), "utf8");
  const productionVerifySource = fs.readFileSync(path.join(root, "scripts", "verify-production-shell.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const marketplaceSource = fs.readFileSync(path.join(root, "src", "marketplace", "ui.js"), "utf8");
  const globalHeaders = vercelConfig.headers.find((entry) => entry.source === "/(.*)")?.headers || [];
  const csp = globalHeaders.find((header) => header.key === "Content-Security-Policy")?.value || "";

  assert.ok(csp, "static frontend CSP must be declared in vercel.json");
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(csp, /\*\.onrender\.com/);
  assert.equal(
    globalHeaders.find((header) => header.key === "Strict-Transport-Security")?.value,
    "max-age=31536000; includeSubDomains; preload"
  );
  const scriptAssetHeaders = vercelConfig.headers.find((entry) =>
    String(entry.source || "").includes("app|app-core|data-service")
  )?.headers || [];
  assert.equal(
    scriptAssetHeaders.find((header) => header.key === "Strict-Transport-Security")?.value,
    "max-age=31536000; includeSubDomains; preload"
  );
  assert.ok(scriptAssetHeaders.find((header) => header.key === "Content-Security-Policy")?.value?.includes("script-src-attr 'none'"));
  assert.match(backendSource, /const STRICT_TRANSPORT_SECURITY_HEADER = "max-age=31536000; includeSubDomains; preload"/);
  assert.match(backendSource, /headers\["Strict-Transport-Security"\] = STRICT_TRANSPORT_SECURITY_HEADER/);
  assert.match(backendSource, /"script-src 'self'"/);
  assert.match(backendSource, /"script-src-attr 'none'"/);
  assert.match(backendSource, /"Permissions-Policy": "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)"/);
  assert.match(workerSource, /const STRICT_TRANSPORT_SECURITY_HEADER = "max-age=31536000; includeSubDomains; preload"/);
  assert.match(workerSource, /"Strict-Transport-Security": STRICT_TRANSPORT_SECURITY_HEADER/);
  assert.match(workerSource, /headers\.set\("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY_HEADER\)/);
  assert.match(staticHeadersSource, /Strict-Transport-Security: max-age=31536000; includeSubDomains; preload/);
  assert.match(staticHeadersSource, /\/app\.js[\s\S]*Cache-Control: public, max-age=300, must-revalidate/);
  assert.match(staticHeadersSource, /\/app\.js[\s\S]*Strict-Transport-Security: max-age=31536000; includeSubDomains; preload/);
  assert.match(staticHeadersSource, /script-src 'self' https:\/\/static\.cloudflareinsights\.com/);
  assert.match(staticHeadersSource, /script-src-attr 'none'/);
  assert.doesNotMatch(staticHeadersSource, /unsafe-eval/);
  assert.doesNotMatch(staticHeadersSource, /script-src[^;\n]*unsafe-inline/);
  assert.match(productionVerifySource, /extractVersionedAssetPath\(homeHtml, \/src="\(\\\/app\\\.js\\\?v=/);
  assert.match(productionVerifySource, /assertHardenedHeaders\(route\.path, response\.headers/);
  assert.doesNotMatch(productionVerifySource, /\{ path: "\/app\.js", kind: "javascript" \}/);
  assert.match(workerSource, /"Content-Security-Policy": buildContentSecurityPolicy/);
  assert.match(workerSource, /function hardenResponseHeaders\(response, env/);
  assert.match(workerSource, /hardenResponseHeaders\(await env\.ASSETS\.fetch\(request\), env\)/);
  assert.match(workerSource, /hardenResponseHeaders\(await proxyToOrigin\(request, env\), env\)/);
  assert.match(workerSource, /script-src-attr 'none'/);
  assert.match(workerSource, /nonce="\$\{escapeHtml\(scriptNonce\)\}"/);
  assert.doesNotMatch(appSource, /onclick="return window\.__wingaOpenPromotionFromTrigger/);
  assert.doesNotMatch(marketplaceSource, /onclick:\s*"return window\.__wingaOpenPromotionFromTrigger/);
});

test("worker cycles production image arrays without dropping gallery images", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "worker.js"), "utf8")
    .replace("export default {", "const __workerDefault = {");
  const context = vm.createContext({
    URL,
    URLSearchParams,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    Headers,
    Request,
    Response,
    fetch: async () => {
      throw new Error("Network access is not expected in worker unit tests.");
    }
  });
  vm.runInContext(source, context);

  const product = {
    id: "five-images",
    name: "Five images",
    images: ["one.jpg", "two.jpg", "three.jpg", "four.jpg", "five.jpg"]
  };
  const normalized = Array.from({ length: 6 }, (_, feedPosition) =>
    context.normalizeProductForStream(product, { feedPosition })
  );

  assert.deepEqual(
    normalized.map((item) => item.feedInitialImageIndex),
    [0, 1, 2, 3, 4, 0]
  );
  normalized.forEach((item) => {
    assert.deepEqual(Array.from(item.images), product.images.map((image) => `/${image}`));
  });

  const secondCardHtml = context.buildDiscoveryProductCardHtml(normalized[1], 1, {
    usersById: {},
    session: null
  });
  assert.match(secondCardHtml, /data-open-image-index="1"/);
  assert.match(secondCardHtml, /data-feed-sequence-index="2"/);
  assert.match(secondCardHtml, /data-feed-gallery-initial-index="1"/);
  assert.match(secondCardHtml, /data-feed-gallery-current="2"/);
  assert.match(secondCardHtml, /data-feed-gallery-stable-ratio="4 \/ 5"/);
  assert.match(secondCardHtml, /data-fit-mode="cover"/);
});

test("worker emits one matching LCP image preload in the response header and HTML head", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "worker.js"), "utf8")
    .replace("export default {", "const __workerDefault = {");
  const context = vm.createContext({
    URL,
    URLSearchParams,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    Headers,
    Request,
    Response,
    fetch: async () => {
      throw new Error("Network access is not expected in worker unit tests.");
    }
  });
  vm.runInContext(source, context);

  const product = context.normalizeProductForStream({
    id: "lcp-product",
    images: ["first.jpg", "second.jpg"]
  }, { feedPosition: 1 });
  const lcpImageUrl = context.getPrimaryFeedImageUrl(product);
  const header = context.buildImagePreloadLinkHeader([product]);
  const html = context.buildDocumentShellStart({
    lcpImageUrl,
    origin: "https://winga-pflp.onrender.com"
  });

  assert.equal(lcpImageUrl, "/second.jpg");
  assert.equal(header, "</second.jpg>; rel=preload; as=image; fetchpriority=high");
  assert.match(html, /<link rel="preload" as="image" href="\/second\.jpg" fetchpriority="high">/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/winga-pflp\.onrender\.com" crossorigin>/);
  assert.equal((html.match(/rel="preload" as="image"/g) || []).length, 1);

  const firstCardHtml = context.buildDiscoveryProductCardHtml(product, 0, {
    usersById: {},
    session: null
  });
  const secondCardHtml = context.buildDiscoveryProductCardHtml(product, 1, {
    usersById: {},
    session: null
  });
  assert.equal((firstCardHtml.match(/fetchpriority="high"/g) || []).length, 1);
  assert.equal((secondCardHtml.match(/fetchpriority="high"/g) || []).length, 0);
  assert.match(firstCardHtml, /loading="eager"\s+fetchpriority="high"/);
  assert.match(secondCardHtml, /loading="eager"\s+fetchpriority="auto"/);
});

test("worker uses stored image aspect ratios for uncropped stable feed media", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "worker.js"), "utf8")
    .replace("export default {", "const __workerDefault = {");
  const context = vm.createContext({
    URL,
    URLSearchParams,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    Headers,
    Request,
    Response,
    fetch: async () => {
      throw new Error("Network access is not expected in worker unit tests.");
    }
  });
  vm.runInContext(source, context);

  const normalized = context.normalizeProductForStream({
    id: "ratio-aware",
    name: "Ratio aware",
    images: ["portrait.jpg", "landscape.jpg"],
    imageAspectRatios: [0.665, 1.5]
  }, { feedPosition: 1 });
  const html = context.buildDiscoveryProductCardHtml(normalized, 1, {
    usersById: {},
    session: null
  });

  assert.equal(normalized.feedInitialImageIndex, 1);
  assert.deepEqual(Array.from(normalized.imageAspectRatios), [0.665, 1.5]);
  assert.match(html, /data-feed-gallery-stable-ratio="1.5"/);
  assert.match(html, /data-fit-mode="contain"/);
  assert.match(html, /aspect-ratio:1.5/);
});

test("worker selects structured variants and falls back when a variant has no images", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "worker.js"), "utf8")
    .replace("export default {", "const __workerDefault = {");
  const variantWarnings = [];
  const context = vm.createContext({
    URL,
    URLSearchParams,
    TextEncoder,
    console: {
      ...console,
      warn: (...args) => variantWarnings.push(args)
    },
    setTimeout,
    clearTimeout,
    Headers,
    Request,
    Response,
    fetch: async () => {
      throw new Error("Network access is not expected in worker unit tests.");
    }
  });
  vm.runInContext(source, context);

  const selected = context.normalizeProductForStream({
    id: "structured",
    images: ["main-a.jpg", "main-b.jpg"],
    variants: [
      { color: "white", images: ["white-a.jpg", "white-b.jpg"] },
      { color: "black", images: ["black-a.jpg", "black-b.jpg"] }
    ]
  }, { feedPosition: 1 });
  assert.equal(selected.selectedVariantIndex, 1);
  assert.equal(selected.variantColor, "black");
  assert.equal(selected.feedInitialImageIndex, 0);
  assert.deepEqual(Array.from(selected.images), ["/black-a.jpg", "/black-b.jpg"]);
  assert.match(
    context.buildDiscoveryProductCardHtml(selected, 1, { usersById: {}, session: null }),
    /<span class="variant-badge">black<\/span>/
  );

  const fallback = context.normalizeProductForStream({
    id: "empty-variant",
    images: ["main-a.jpg", "main-b.jpg", "main-c.jpg"],
    variants: [
      { color: "white", images: ["white.jpg"] },
      { color: "black", images: [] }
    ]
  }, { feedPosition: 1 });
  assert.equal(fallback.selectedVariantIndex, 1);
  assert.equal(fallback.variantColor, "black");
  assert.equal(fallback.variantImageFallback, true);
  assert.equal(fallback.feedInitialImageIndex, 1);
  assert.deepEqual(Array.from(fallback.images), ["/main-a.jpg", "/main-b.jpg", "/main-c.jpg"]);

  const fallbackAfterRenormalize = context.normalizeProductForStream(fallback, { feedPosition: 1 });
  assert.equal(fallbackAfterRenormalize.variantImageFallback, true);
  assert.equal(fallbackAfterRenormalize.feedInitialImageIndex, 1);
  assert.deepEqual(Array.from(fallbackAfterRenormalize.images), ["/main-a.jpg", "/main-b.jpg", "/main-c.jpg"]);
  assert.equal(variantWarnings.length, 0);
});

test("client variant entries prefer selected resurfacing indexes and preserve sequence continuity", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const uiSource = fs.readFileSync(path.join(root, "src", "marketplace", "ui.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const variantSource = fs.readFileSync(path.join(root, "src", "marketplace", "variants.js"), "utf8");

  assert.match(buildSource, /"src\/marketplace\/variants\.js"/);
  assert.match(variantSource, /window\.WingaModules\.marketplace\.createVariantHelpers = createVariantHelpers;/);
  assert.match(variantSource, /item\?\.visibleImageIndex\s*\?\?\s*item\?\.feedInitialImageIndex\s*\?\?\s*item\?\.variantDisplayIndex/);
  assert.match(appSource, /window\.WingaModules\?\.marketplace\?\.createVariantHelpers/);
  assert.match(appSource, /nextFeedSequenceIndex:\s*0/);
  assert.match(appSource, /homeContinuousDiscoveryRuntime\.nextFeedSequenceIndex = initialProductIds\.length/);
  assert.match(appSource, /HOME_VARIANT_RESURFACE_MIN_BATCH_INDEX = 1/);
  assert.match(appSource, /HOME_VARIANT_RESURFACE_MIN_RECENT_IDS = 6/);
  assert.match(appSource, /variantDisplayIndex:\s*initialImageIndex,\s*feedInitialImageIndex:\s*initialImageIndex/);
  assert.match(uiSource, /feedEntryType === "variant"\s*\?\s*\(product\?\.visibleImageIndex \?\? product\?\.feedInitialImageIndex \?\? product\?\.variantDisplayIndex/);
  assert.match(uiSource, /const stableInitialImageIndex = Math\.max\(0, variantDisplayIndex\);/);
  assert.match(uiSource, /className: "variant-badge"/);
  assert.match(uiSource, /media\.style\.aspectRatio = stableMediaRatio/);
});

test("marketplace variant helpers preserve feed identity and image selection", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "variants.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } }
  });
  vm.runInContext(source, context);
  const helpers = context.window.WingaModules.marketplace.createVariantHelpers({
    getUniqueRenderableImageIndexes: (product) => Array.isArray(product?.images)
      ? product.images.map((_, index) => index)
      : [],
    getRenderableMarketplaceImages: (product) => Array.isArray(product?.images) ? product.images : []
  });

  const product = { id: "shirt-1", images: ["white.jpg", "black.jpg", "red.jpg"] };
  assert.equal(helpers.getSmartVariantIndex(4, 3), 1);
  assert.equal(helpers.getFeedEntryDisplayImageIndex({ ...product, feedEntryType: "variant" }, 2), 2);
  assert.equal(helpers.getFeedEntryDisplayImageIndex({ ...product, feedInitialImageIndex: 5 }, 0), 2);
  assert.equal(helpers.getProductVariantCount({ ...product, variants: [{}, {}] }), 2);
  assert.equal(helpers.buildContinuousDiscoveryCandidateKey({ ...product, feedEntryType: "variant", visibleImageIndex: 1 }), "variant:shirt-1:1");
  assert.equal(
    helpers.dedupeContinuousDiscoveryFeedItems([
      { ...product },
      { ...product },
      { ...product, feedEntryType: "variant", visibleImageIndex: 1 }
    ]).map((item) => helpers.buildContinuousDiscoveryCandidateKey(item)).join("|"),
    "product:shirt-1|variant:shirt-1:1"
  );
  assert.equal(helpers.reorderProductImagesForVariant(product, 2).join("|"), "red.jpg|white.jpg|black.jpg");
  assert.equal(helpers.getVariantInitialImageIndex(product, 2), 2);
  assert.equal(helpers.resolvePreferredVariantImageIndex([3, 1, 2], 2), 2);
  assert.equal(helpers.shouldUseVariantScrollSlot(30), true);
  assert.equal(helpers.getDeterministicVariantSlotIndex([1, 2, 3], { batchIndex: 1 }), 3);
});

test("filterProducts keeps only approved items and matches keyword/category", () => {
  const products = [
    { id: "1", name: "Kiatu Cheupe", shop: "Asha Shop", category: "viatu", status: "approved", availability: "available", _searchText: createProductSearchText({ name: "Kiatu Cheupe", shop: "Asha Shop" }) },
    { id: "2", name: "Gauni Red", shop: "Neema", category: "gauni", status: "pending", availability: "available", _searchText: createProductSearchText({ name: "Gauni Red", shop: "Neema" }) },
    { id: "3", name: "Sketi Blue", shop: "Asha Shop", category: "sketi", status: "approved", availability: "available", _searchText: createProductSearchText({ name: "Sketi Blue", shop: "Asha Shop" }) }
  ];

  const result = filterProducts({
    products,
    keyword: "asha",
    selectedCategory: "viatu"
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("filterProducts matches broad suruali intent across related subtypes", () => {
  const products = [
    {
      id: "cloth-trouser",
      name: "Office trouser",
      shop: "Moshi Menswear",
      category: "wanaume-suruali-kitambaa",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Office trouser", shop: "Moshi Menswear", category: "wanaume-suruali-kitambaa" })
    },
    {
      id: "jeans",
      name: "Blue denim",
      shop: "Moshi Menswear",
      category: "wanaume-jeans",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Blue denim", shop: "Moshi Menswear", category: "wanaume-jeans" })
    },
    {
      id: "shirt",
      name: "Formal shirt",
      shop: "Moshi Menswear",
      category: "wanaume-mashati",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Formal shirt", shop: "Moshi Menswear", category: "wanaume-mashati" })
    }
  ];

  const result = filterProducts({
    products,
    keyword: "suruali",
    selectedCategory: "all"
  });

  assert.deepEqual(result.map((item) => item.id), ["cloth-trouser", "jeans"]);
});

test("filterProducts matches mixed-intent multi-word queries without depending on exact phrase order", () => {
  const products = [
    {
      id: "jean-black",
      name: "Black denim jean",
      shop: "City Denim",
      category: "wanaume-jeans",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Black denim jean", shop: "City Denim", category: "wanaume-jeans" })
    },
    {
      id: "shirt-black",
      name: "Black formal shirt",
      shop: "City Denim",
      category: "wanaume-mashati",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Black formal shirt", shop: "City Denim", category: "wanaume-mashati" })
    }
  ];

  const result = filterProducts({
    products,
    keyword: "suruali black",
    selectedCategory: "all"
  });

  assert.deepEqual(result.map((item) => item.id), ["jean-black"]);
});

test("getSearchQueryDescriptor expands broad shoe intent without dropping exact keywords", () => {
  const descriptor = getSearchQueryDescriptor("shoe");
  assert.ok(descriptor.expandedTerms.includes("shoe"));
  assert.ok(descriptor.expandedTerms.includes("viatu"));
  assert.ok(descriptor.expandedTerms.includes("sneaker"));
});

test("search dropdown merges immediate results with broad global matches", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(appSource, /\[\.\.\.immediateItems,\s*\.\.\.globalMatches\]\.forEach/);
  assert.match(appSource, /seenIds\.has\(productId\)/);
});

test("filterProducts respects expanded top categories like electronics", () => {
  const products = [
    {
      id: "phone",
      name: "Tecno Spark",
      shop: "Amani Tech",
      category: "electronics-simu",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Tecno Spark", shop: "Amani Tech", category: "electronics-simu" })
    },
    {
      id: "pot",
      name: "Sufuria",
      shop: "Mama Pishi",
      category: "vyombo-sufuria",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Sufuria", shop: "Mama Pishi", category: "vyombo-sufuria" })
    }
  ];

  const result = filterProducts({
    products,
    keyword: "",
    selectedCategory: "electronics"
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "phone");
});

test("filterProducts respects new lifestyle categories like sherehe and casual", () => {
  const products = [
    {
      id: "party",
      name: "Dress ya party",
      shop: "Amani Boutique",
      category: "sherehe-mavazi",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Dress ya party", shop: "Amani Boutique", category: "sherehe-mavazi" })
    },
    {
      id: "casual",
      name: "Weekend set",
      shop: "Amani Boutique",
      category: "casual-kila-siku",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({ name: "Weekend set", shop: "Amani Boutique", category: "casual-kila-siku" })
    }
  ];

  const shereheResult = filterProducts({
    products,
    keyword: "party",
    selectedCategory: "sherehe"
  });
  const casualResult = filterProducts({
    products,
    keyword: "casual",
    selectedCategory: "casual"
  });

  assert.equal(shereheResult.length, 1);
  assert.equal(shereheResult[0].id, "party");
  assert.equal(casualResult.length, 1);
  assert.equal(casualResult[0].id, "casual");
});

test("filterProducts matches shop and seller search terms", () => {
  const products = [
    {
      id: "shop-1",
      name: "Gauni la harusi",
      shop: "Asha Boutique",
      uploadedBy: "asha_seller",
      category: "wanawake-gauni",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({
        name: "Gauni la harusi",
        shop: "Asha Boutique",
        uploadedBy: "asha_seller",
        category: "wanawake-gauni"
      })
    },
    {
      id: "shop-2",
      name: "Kiatu cha ngozi",
      shop: "Musa Footwear",
      uploadedBy: "musa_store",
      category: "viatu",
      status: "approved",
      availability: "available",
      _searchText: createProductSearchText({
        name: "Kiatu cha ngozi",
        shop: "Musa Footwear",
        uploadedBy: "musa_store",
        category: "viatu"
      })
    }
  ];

  const shopResult = filterProducts({
    products,
    keyword: "Asha Boutique",
    selectedCategory: "all"
  });
  const sellerResult = filterProducts({
    products,
    keyword: "musa_store",
    selectedCategory: "all"
  });

  assert.equal(shopResult.length, 1);
  assert.equal(shopResult[0].id, "shop-1");
  assert.equal(sellerResult.length, 1);
  assert.equal(sellerResult[0].id, "shop-2");
});

test("filterProducts ranks image matches by similarity", () => {
  const products = [
    { id: "1", name: "One", shop: "Shop", category: "viatu", status: "approved", availability: "available", imageSignature: "1111", _searchText: "one shop" },
    { id: "2", name: "Two", shop: "Shop", category: "viatu", status: "approved", availability: "available", imageSignature: "1010", _searchText: "two shop" }
  ];

  const result = filterProducts({
    products,
    imageSignature: "1111",
    similarityThreshold: 0.5,
    similarityFn: (left, right) => left === right ? 1 : 0.75
  });

  assert.equal(result[0].id, "1");
  assert.ok(result[0].imageMatchScore >= result[1].imageMatchScore);
});

test("getShowcaseProducts prefers available approved high-signal items", () => {
  const result = getShowcaseProducts([
    { id: "low", status: "approved", availability: "available", image: "a", likes: 1, views: 1 },
    { id: "high", status: "approved", availability: "available", image: "b", likes: 5, views: 3 },
    { id: "sold", status: "approved", availability: "sold_out", image: "c", likes: 100, views: 100 },
    { id: "pending", status: "pending", availability: "available", image: "d", likes: 100, views: 100 }
  ]);

  assert.equal(result[0].id, "high");
  assert.equal(result.length, 2);
});

test("canRenderBuyButton enforces approved non-self non-sold-out products", () => {
  assert.equal(canRenderBuyButton({ uploadedBy: "seller-b", status: "approved", availability: "available" }, "seller-a"), true);
  assert.equal(canRenderBuyButton({ uploadedBy: "seller-a", status: "approved", availability: "available" }, "seller-a"), false);
  assert.equal(canRenderBuyButton({ uploadedBy: "seller-b", status: "pending", availability: "available" }, "seller-a"), false);
  assert.equal(canRenderBuyButton({ uploadedBy: "seller-b", status: "approved", availability: "sold_out" }, "seller-a"), false);
  assert.equal(canRenderBuyButton({ uploadedBy: "seller-b", status: "approved", availability: "reserved" }, "seller-a"), false);
});

test("getOrderActionState enforces seller confirm, buyer receipt, and 48h cancel", () => {
  const now = Date.now();
  const oldPlaced = {
    status: "placed",
    paymentStatus: "pending",
    paymentIntentStatus: "submitted",
    buyerUsername: "buyer-a",
    sellerUsername: "seller-b",
    createdAt: new Date(now - (49 * 60 * 60 * 1000)).toISOString()
  };
  const paid = {
    status: "paid",
    paymentStatus: "paid",
    buyerUsername: "buyer-a",
    sellerUsername: "seller-b",
    createdAt: new Date(now).toISOString()
  };
  const confirmed = {
    status: "confirmed",
    paymentStatus: "paid",
    buyerUsername: "buyer-a",
    sellerUsername: "seller-b",
    createdAt: new Date(now).toISOString()
  };

  assert.deepEqual(getOrderActionState(paid, "seller-b", now), {
    canVerifyPayment: false,
    canRejectPayment: false,
    canConfirm: true,
    canConfirmReceived: false,
    canCancel: false
  });

  assert.deepEqual(getOrderActionState(oldPlaced, "buyer-a", now), {
    canVerifyPayment: false,
    canRejectPayment: false,
    canConfirm: false,
    canConfirmReceived: false,
    canCancel: true
  });

  assert.deepEqual(getOrderActionState(oldPlaced, "seller-b", now), {
    canVerifyPayment: true,
    canRejectPayment: true,
    canConfirm: false,
    canConfirmReceived: false,
    canCancel: false
  });

  assert.deepEqual(getOrderActionState(confirmed, "buyer-a", now), {
    canVerifyPayment: false,
    canRejectPayment: false,
    canConfirm: false,
    canConfirmReceived: true,
    canCancel: false
  });
});

test("getOrderLifecycleMeta maps order states to a clear buyer-seller journey", () => {
  assert.equal(getOrderLifecycleMeta({ status: "placed", paymentStatus: "pending" }).id, "pending_verification");
  assert.equal(getOrderLifecycleMeta({ status: "paid", paymentStatus: "paid" }).id, "seller_reviewing");
  assert.equal(getOrderLifecycleMeta({ status: "confirmed", paymentStatus: "paid" }).id, "agreed");
  assert.equal(getOrderLifecycleMeta({ status: "delivered", paymentStatus: "paid" }).id, "completed");
  assert.equal(getOrderLifecycleMeta({ status: "cancelled", paymentStatus: "pending" }).id, "cancelled");
});

test("resolveBootView returns home for valid session and login otherwise", () => {
  assert.equal(resolveBootView(true), "home");
  assert.equal(resolveBootView(false), "login");
});

test("authenticated product refresh preserves paginated feed contract", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const refreshStart = dataSource.indexOf("async refreshProducts() {");
  const refreshEnd = dataSource.indexOf("async requestWhatsappChange", refreshStart);
  const refreshProductsSource = refreshStart >= 0 && refreshEnd > refreshStart
    ? dataSource.slice(refreshStart, refreshEnd)
    : "";

  assert.ok(refreshProductsSource, "refreshProducts implementation should be present");
  assert.match(refreshProductsSource, /typeof state\.adapter\.loadProductsPage === "function"/);
  assert.match(refreshProductsSource, /await state\.adapter\.loadProductsPage\(\{/);
  assert.match(refreshProductsSource, /applyLoadedProductPageToState\(refreshedPage,\s*\{/);
  assert.match(refreshProductsSource, /replace:\s*true/);
  assert.match(refreshProductsSource, /markHydrated:\s*true/);
  assert.doesNotMatch(refreshProductsSource, /setFullProductFeedPagination\(state\.products\);[\s\S]*?loadProductsPage/);
});

test("legacy product gallery escapes user-controlled HTML attributes", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const galleryStart = appSource.indexOf("function renderProductGallery(product)");
  const galleryEnd = appSource.indexOf("function beginPurchaseFlow", galleryStart);
  const gallerySource = galleryStart >= 0 && galleryEnd > galleryStart
    ? appSource.slice(galleryStart, galleryEnd)
    : "";

  assert.ok(gallerySource, "renderProductGallery implementation should be present");
  assert.match(gallerySource, /const safeProductId = escapeHtml\(product\?\.id \|\| ""\)/);
  assert.match(gallerySource, /const safeProductName = escapeHtml\(product\?\.name \|\| "Product"\)/);
  assert.match(gallerySource, /src="\$\{escapeHtml\(firstImage\)\}"/);
  assert.doesNotMatch(gallerySource, /alt="\$\{product\.name\}"/);
  assert.doesNotMatch(gallerySource, /data-gallery-stage="\$\{product\.id\}"/);
  assert.doesNotMatch(gallerySource, /data-image="\$\{sanitizeImageSource\(image,/);
});

test("app template actions escape data attributes and selector lookups", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(appSource, /function escapeCssAttributeValue\(value\)/);
  assert.match(appSource, /const safeProductSelectorId = escapeCssAttributeValue\(productId\)/);
  assert.match(appSource, /const safeTargetSelectorId = escapeCssAttributeValue\(targetId\)/);
  assert.match(appSource, /data-report-product="\$\{safeProductId\}"/);
  assert.match(appSource, /data-report-seller="\$\{safeSellerId\}"/);
  assert.match(appSource, /data-open-saved-product="\$\{escapeHtml\(product\.id \|\| ""\)\}"/);
  assert.match(appSource, /data-open-followed-seller="\$\{safeSellerUsername\}"/);
  assert.match(appSource, /data-share-seller-shop="\$\{safeSellerUsername\}"/);
  assert.match(appSource, /data-promote-product="\$\{escapeHtml\(product\.id \|\| ""\)\}"/);
  assert.match(appSource, /data-open-product="\$\{safeProductId\}"/);
  assert.match(appSource, /data-open-product-whatsapp="\$\{escapeHtml\(product\.id \|\| ""\)\}"/);
  assert.doesNotMatch(appSource, /data-report-product="\$\{product\.id\}"/);
  assert.doesNotMatch(appSource, /data-open-product="\$\{item\.id\}"/);
  assert.doesNotMatch(appSource, /querySelector\(`\[data-gallery-stage="\$\{targetId\}/);
});

test("shared DOM helper blocks unsafe attributes before setAttribute", () => {
  const root = path.resolve(__dirname, "..");
  const helperSource = fs.readFileSync(path.join(root, "src", "components", "dom-helpers.js"), "utf8");
  const bundleSource = fs.readFileSync(path.join(root, "winga-modules.js"), "utf8");

  [helperSource, bundleSource].forEach((source) => {
    assert.match(source, /function isUnsafeAttribute\(key, value\)/);
    assert.match(source, /name\.startsWith\("on"\) \|\| name === "srcdoc"/);
    assert.match(source, /URL_ATTRIBUTE_NAMES\.has\(name\) && normalizedValue\.startsWith\("javascript:"\)/);
    assert.match(source, /value !== undefined && value !== null && !isUnsafeAttribute\(key, value\)/);
  });
});

test("api writes attach a CSRF token before sending state-changing requests", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const backendSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");

  assert.match(dataSource, /function isUnsafeApiMethod\(method = "GET"\)/);
  assert.match(dataSource, /\/auth\/csrf-token/);
  assert.doesNotMatch(dataSource, /document\.cookie/);
  assert.doesNotMatch(dataSource, /Authorization: `Bearer/);
  assert.doesNotMatch(dataSource, /stillStoredSession\?\.token/);
  assert.match(dataSource, /headers\.set\("X-CSRF-Token", await fetchCsrfTokenForRequest\(url\)\)/);
  assert.match(dataSource, /response\.status === 403 && errorCode === "csrf_failed" && !hasRetriedCsrf/);
  assert.match(backendSource, /const CSRF_COOKIE_NAME = "winga_csrf"/);
  assert.match(backendSource, /function buildSelfSessionPayload\(user\)/);
  assert.doesNotMatch(backendSource, /payload\.token = token/);
  assert.match(backendSource, /function buildCsrfCookieHeader\(token, req\)[\s\S]*"HttpOnly"/);
  assert.match(backendSource, /function buildAuthCookieHeader\(token, req\)[\s\S]*"Priority=High"/);
  assert.match(backendSource, /function buildClearAuthCookieHeader\(req\)[\s\S]*"Expires=Thu, 01 Jan 1970 00:00:00 GMT"/);
  assert.match(backendSource, /function buildCsrfCookieHeader\(token, req\)[\s\S]*"Priority=High"/);
  assert.match(backendSource, /function replaceUserSessions\(store, username, nextSession\)/);
  assert.match(backendSource, /normalizeIdentifier\(item\.username, 40\) !== safeUsername/);
  assert.match(backendSource, /const nextSessions = replaceUserSessions\(store, createdUser\.username, session\)/);
  assert.match(backendSource, /const nextSessions = replaceUserSessions\(store, freshUser\.username, session\)/);
  assert.doesNotMatch(backendSource, /sessions: \[\.\.\.store\.sessions, session\]/);
  assert.doesNotMatch(backendSource, /sessions: \[\.\.\.nextSessions, session\]/);
  assert.match(backendSource, /const RAW_CSRF_SECRET = String\(process\.env\.CSRF_SECRET \|\| ""\)\.trim\(\)/);
  assert.doesNotMatch(backendSource, /process\.env\.CSRF_SECRET\s*\|\|\s*process\.env\.PAYMENT_WEBHOOK_SECRET/);
  assert.match(backendSource, /function validateCsrfRequest\(req, pathname = ""\)/);
  assert.match(backendSource, /function isServerToServerWebhookPath\(pathname = ""\)/);
  assert.match(backendSource, /pathname === "\/api\/payments\/webhook"/);
  assert.match(backendSource, /url\.pathname === "\/api\/auth\/csrf-token"/);
  assert.match(backendSource, /"Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token, X-Winga-CSRF-Token"/);
  assert.match(backendSource, /function validateUnsafeApiOrigin\(req, pathname = ""\)/);
  assert.match(backendSource, /isServerToServerWebhookPath\(pathname\)/);
  assert.match(backendSource, /code: "origin_not_allowed"/);
  assert.match(backendSource, /function validateJsonRequestContentType\(req, pathname\)/);
  assert.match(backendSource, /requiresJsonRequestBody\(req, pathname\)/);
  assert.match(backendSource, /function isBodylessApiActionPath\(method, pathname\)/);
  assert.match(backendSource, /\/api\\\/admin\\\/promotions\\\/\[\^\/]\+\\\/disable/);
  assert.match(backendSource, /const RATE_LIMIT_MAX_BUCKETS = 5000/);
  assert.match(backendSource, /function pruneRateLimitStore\(now = Date\.now\(\)\)/);
  assert.match(backendSource, /function evaluateRateLimit\(req, store\)/);
  assert.match(backendSource, /"Retry-After": String\(rateLimitStatus\.retryAfterSeconds \|\| 60\)/);
  assert.match(backendSource, /code: "rate_limited"/);
  assert.match(backendSource, /code: "unsupported_media_type"/);
  assert.match(backendSource, /error\.code = "INVALID_JSON"/);
  assert.match(backendSource, /code: "invalid_json"/);
});

test("browser session state does not persist or propagate auth tokens", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(dataSource, /const \{ token, \.\.\.safeParsedSession \} = parsed;/);
  assert.match(dataSource, /const \{ token, \.\.\.safeSession \} = session;/);
  assert.doesNotMatch(dataSource, /session\?\.token/);
  assert.doesNotMatch(dataSource, /Authorization: `Bearer/);
  assert.doesNotMatch(appSource, /token: typeof session\.token/);
});

(async () => {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${entry.name}`);
      console.error(error);
      process.exit(1);
    }
  }

  console.log(`Frontend core tests passed: ${passed}/${tests.length}`);
})();
