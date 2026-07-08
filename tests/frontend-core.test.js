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
  assert.doesNotMatch(marketplaceUiSource, /shouldUseMobileEndlessHomeFeed && typeof deps\.createContinuousDiscoveryAnchorElement/);
  assert.match(marketplaceUiSource, /if \(typeof deps\.createContinuousDiscoveryAnchorElement === "function"\)/);
  assert.match(appSource, /window\.setTimeout\(\(\) => \{\s+if \(\s+anchor\.isConnected\s+&& currentView === "home"[\s\S]*hydrateContinuousDiscoveryAnchor\(anchor\);/);
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

test("style intelligence builds private aggregate buyer profiles and bounded product scores", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "style-intelligence.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } },
    Date
  });
  vm.runInContext(source, context);
  const engine = context.window.WingaModules.marketplace.createStyleIntelligence({
    inferTopCategoryValue: (category) => String(category || "").split("-")[0],
    config: { maxStyleBoost: 120 }
  });
  const productMap = new Map([
    ["dress-white", {
      id: "dress-white",
      category: "fashion-dress",
      name: "Elegant white cotton wedding dress",
      color: "white",
      size: "M",
      material: "cotton",
      price: 65000
    }],
    ["shoe-black", {
      id: "shoe-black",
      category: "shoes",
      name: "Black office leather shoes",
      color: "black",
      material: "leather",
      price: 120000
    }]
  ]);
  const profile = engine.buildStyleProfile({
    viewedProductIds: ["dress-white"],
    savedProductIds: ["dress-white"],
    purchasedProductIds: ["dress-white"],
    demandProductIds: ["dress-white"],
    searchTerms: ["white wedding cotton"],
    categories: ["fashion-dress"]
  }, {
    getProductById: (id) => productMap.get(id)
  });
  const matching = engine.scoreProductStyle({
    id: "next-dress",
    category: "fashion-dress",
    name: "White cotton party dress",
    color: "white",
    material: "cotton",
    price: 70000
  }, profile);
  const unrelated = engine.scoreProductStyle(productMap.get("shoe-black"), profile);

  assert.equal(profile.privacy, "aggregate-style-only");
  assert.equal(profile.signalCount >= 4, true);
  assert.equal(profile.colors.some((entry) => entry.key === "white"), true);
  assert.equal(profile.categories.some((entry) => entry.key === "fashion-dress"), true);
  assert.equal(matching.score > unrelated.score, true);
  assert.equal(matching.score <= 120, true);
  assert.deepEqual(Object.keys(profile).includes("buyerId"), false);
  assert.match(source, /window\.WingaModules\.marketplace\.createStyleIntelligence = createStyleIntelligence;/);
});

test("seller quality intelligence scores operational trust signals without follower dependence", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "seller-quality-intelligence.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } },
    Date
  });
  vm.runInContext(source, context);
  const engine = context.window.WingaModules.marketplace.createSellerQualityIntelligence({
    config: { maxQualityBoost: 150 }
  });
  const good = engine.buildSellerQualitySnapshot("seller-good", {
    seller: { username: "seller-good", status: "active", verifiedSeller: true, followers: 100000 },
    products: [
      { id: "p1", uploadedBy: "seller-good", status: "approved", demandSummary: { demandScore: 20, waitingUsers: 6, restockInterest: 3 } },
      { id: "p2", uploadedBy: "seller-good", status: "approved" }
    ],
    orders: [
      { sellerUsername: "seller-good", buyerUsername: "buyer-a", status: "delivered" },
      { sellerUsername: "seller-good", buyerUsername: "buyer-a", status: "delivered" },
      { sellerUsername: "seller-good", buyerUsername: "buyer-b", status: "confirmed" }
    ],
    messages: [
      { senderId: "buyer-a", receiverId: "seller-good", timestamp: "2026-07-04T08:00:00.000Z" },
      { senderId: "seller-good", receiverId: "buyer-a", timestamp: "2026-07-04T09:00:00.000Z" }
    ],
    reviewSummary: { averageRating: 4.8, totalReviews: 8 }
  });
  const risky = engine.buildSellerQualitySnapshot("seller-risky", {
    seller: { username: "seller-risky", status: "flagged", verifiedSeller: false, followers: 1000000 },
    products: [{ id: "p3", uploadedBy: "seller-risky", status: "approved" }],
    orders: [
      { sellerUsername: "seller-risky", buyerUsername: "buyer-c", status: "cancelled" },
      { sellerUsername: "seller-risky", buyerUsername: "buyer-d", status: "cancelled" }
    ],
    messages: [
      { senderId: "buyer-c", receiverId: "seller-risky", timestamp: "2026-07-01T08:00:00.000Z" }
    ],
    reviewSummary: { averageRating: 2.4, totalReviews: 2 },
    complaintCount: 3
  });

  assert.equal(good.trustScore > risky.trustScore, true);
  assert.equal(good.qualityScore > risky.qualityScore, true);
  assert.equal(good.activityScore > risky.activityScore, true);
  assert.equal(good.components.repeatBuyers, 1);
  assert.equal(good.antiManipulation.followerCountIgnored, true);
  assert.equal(engine.getRankingBoost(good) > engine.getRankingBoost(risky), true);
  assert.equal(engine.getRankingBoost(good) <= 150, true);
  assert.equal(engine.getTransparentReasons(good).includes("completed deliveries"), true);
  assert.match(source, /window\.WingaModules\.marketplace\.createSellerQualityIntelligence = createSellerQualityIntelligence;/);
});

test("market intelligence produces regional time-aware demand insights", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "market-intelligence.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } },
    Date
  });
  vm.runInContext(source, context);
  const engine = context.window.WingaModules.marketplace.createMarketIntelligence({
    inferTopCategoryValue: (category) => String(category || "").split("-")[0],
    config: { maxMarketBoost: 140 }
  });
  const products = [
    {
      id: "white-dress",
      uploadedBy: "seller-a",
      name: "White wedding dress size M",
      category: "fashion-dress",
      color: "white",
      size: "M",
      location: "Dar es Salaam",
      createdAt: "2026-07-02T10:00:00.000Z",
      views: 100,
      likes: 10,
      demandSummary: {
        demandScore: 42,
        waitingUsers: 8,
        restockInterest: 5,
        topColors: [{ color: "white", count: 8 }],
        topSizes: [{ size: "M", count: 6 }],
        lastDemandAt: "2026-07-04T09:00:00.000Z"
      }
    },
    {
      id: "old-shirt",
      uploadedBy: "seller-b",
      name: "Old blue shirt",
      category: "fashion-shirt",
      color: "blue",
      location: "Mwanza",
      createdAt: "2026-05-01T10:00:00.000Z",
      views: 20,
      likes: 1
    },
    {
      id: "sold-out-shoes",
      uploadedBy: "seller-a",
      name: "Black office shoes",
      category: "shoes",
      color: "black",
      availability: "sold_out",
      location: "Dar es Salaam",
      demandSummary: {
        demandScore: 30,
        waitingUsers: 4,
        restockInterest: 4,
        lastDemandAt: "2026-07-03T09:00:00.000Z"
      }
    }
  ];
  const insights = engine.analyzeMarket({
    products,
    searchTerms: ["white dress", "black shoes"],
    searchDemand: {
      trendingSearches: [{ query: "white dress", queryKey: "white-dress", category: "fashion-dress", searches: 12, score: 24 }],
      zeroResultOpportunities: [{ query: "linen shirt", queryKey: "linen-shirt", category: "fashion-shirt", searches: 9, score: 18 }],
      lowSupplyOpportunities: [{ query: "black shoes", queryKey: "black-shoes", category: "shoes", searches: 8, score: 16 }]
    },
    messages: [
      { productId: "white-dress", message: "Nahitaji white dress size M", timestamp: "2026-07-04T09:30:00.000Z" }
    ],
    regionQuery: "Dar",
    now: new Date("2026-07-04T10:00:00.000Z").getTime()
  });
  const sellerInsights = engine.filterInsightsForSeller(insights, "seller-a");

  assert.equal(insights.risingDemandProducts[0].productId, "white-dress");
  assert.equal(insights.likelySellOutProducts.some((item) => item.productId === "sold-out-shoes"), true);
  assert.equal(insights.highDemandColors.some((item) => item.color === "white"), true);
  assert.equal(insights.highDemandSizes.some((item) => item.size === "m"), true);
  assert.equal(insights.regionalTrends.some((item) => item.region.includes("dar")), true);
  assert.equal(insights.categoryOpportunities.some((item) => item.category === "fashion-dress"), true);
  assert.equal(insights.stockingRecommendations.length > 0, true);
  assert.equal(insights.zeroResultOpportunities.some((item) => item.query === "linen shirt"), true);
  assert.equal(insights.lowSupplyOpportunities.some((item) => item.query === "black shoes"), true);
  assert.equal(insights.trendingSearches.some((item) => item.query === "white dress"), true);
  assert.equal(insights.trendAlerts.length > 0, true);
  assert.equal(engine.getProductMarketBoost(products[0], insights) > engine.getProductMarketBoost(products[1], insights), true);
  assert.equal(sellerInsights.risingDemandProducts.every((item) => item.sellerId === "seller-a"), true);
  assert.match(source, /window\.WingaModules\.marketplace\.createMarketIntelligence = createMarketIntelligence;/);
});

test("search demand intelligence aggregates anonymous zero-result and low-supply opportunities", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "search-demand-intelligence.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } },
    Date,
    Math
  });
  vm.runInContext(source, context);
  const engine = context.window.WingaModules.marketplace.createSearchDemandIntelligence({
    config: {
      dedupeWindowMs: 10,
      notifyThreshold: 2
    }
  });
  const collector = engine.createCollector();
  const zero = collector.record({
    query: "white linen dress",
    source: "text",
    resultCount: 0,
    filters: { location: "Dar es Salaam", maxPrice: 70000 }
  });
  const duplicate = collector.record({
    query: "white linen dress",
    source: "text",
    resultCount: 0,
    filters: { location: "Dar es Salaam", maxPrice: 70000 }
  });
  const lowSupply = collector.record({
    query: "black office shoes",
    source: "image",
    resultCount: 2,
    results: [{ id: "shoe-1", category: "shoes", color: "black" }],
    filters: { location: "Dar es Salaam" }
  });
  collector.markClick("shoe-1", "black office shoes");
  const analytics = engine.aggregate(collector.getEvents(), {
    now: Date.now()
  });
  const opportunities = engine.createOpportunitySummary(analytics);

  assert.equal(zero.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(lowSupply.accepted, true);
  assert.equal(collector.getEvents().every((event) => event.anonymous === true), true);
  assert.equal(collector.getEvents().some((event) => Object.prototype.hasOwnProperty.call(event, "buyerId")), false);
  assert.equal(analytics.zeroResultOpportunities.some((item) => item.query === "white linen dress"), true);
  assert.equal(analytics.lowSupplyOpportunities.some((item) => item.query === "black office shoes"), true);
  assert.equal(analytics.mostSearchedColors.some((item) => item.color === "white" || item.color === "black"), true);
  assert.equal(opportunities.marketOpportunities.length > 0, true);
  assert.equal(analytics.privacy, "anonymous-aggregate-only");
  assert.match(source, /window\.WingaModules\.marketplace\.createSearchDemandIntelligence = createSearchDemandIntelligence;/);
});

test("feed intelligence ranks home feed without mutating pagination products", () => {
  const root = path.resolve(__dirname, "..");
  const styleSource = fs.readFileSync(path.join(root, "src", "marketplace", "style-intelligence.js"), "utf8");
  const sellerQualitySource = fs.readFileSync(path.join(root, "src", "marketplace", "seller-quality-intelligence.js"), "utf8");
  const searchDemandSource = fs.readFileSync(path.join(root, "src", "marketplace", "search-demand-intelligence.js"), "utf8");
  const marketSource = fs.readFileSync(path.join(root, "src", "marketplace", "market-intelligence.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "src", "marketplace", "feed-intelligence.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const context = vm.createContext({
    window: { WingaModules: { marketplace: {} } },
    Date
  });
  vm.runInContext(styleSource, context);
  vm.runInContext(sellerQualitySource, context);
  vm.runInContext(searchDemandSource, context);
  vm.runInContext(marketSource, context);
  vm.runInContext(source, context);
  const engine = context.window.WingaModules.marketplace.createFeedIntelligence({
    inferTopCategoryValue: (category) => String(category || "").split("-")[0],
    getEngagementScore: (product) => Number(product.views || 0) + Number(product.likes || 0) * 3,
    config: {
      freshProtectionWindowMs: 20 * 60 * 1000,
      freshTopSlots: 1,
      sellerCap: 2
    }
  });
  const now = new Date("2026-07-04T10:00:00.000Z").getTime();
  const products = [
    { id: "old-seller-a-1", uploadedBy: "seller-a", category: "fashion-dress", createdAt: "2026-07-01T10:00:00.000Z", views: 500, likes: 20 },
    { id: "fresh", uploadedBy: "seller-b", category: "shoes", createdAt: "2026-07-04T09:55:00.000Z", views: 1, likes: 0 },
    { id: "followed", uploadedBy: "seller-followed", category: "fashion-shirt", createdAt: "2026-07-02T10:00:00.000Z", views: 5, likes: 1 },
    { id: "demand", uploadedBy: "seller-c", category: "fashion-dress", createdAt: "2026-07-02T11:00:00.000Z", views: 2, likes: 0, demandSummary: { demandScore: 30, waitingUsers: 5, restockInterest: 4 } },
    { id: "old-seller-a-2", uploadedBy: "seller-a", category: "fashion-dress", createdAt: "2026-07-01T09:00:00.000Z", views: 450, likes: 18 },
    { id: "old-seller-a-1", uploadedBy: "seller-a", category: "fashion-dress", createdAt: "2026-07-01T10:00:00.000Z", views: 500, likes: 20 }
  ];

  const ranked = engine.rankHomeFeed(products, {
    now,
    followedSellerIds: ["seller-followed"],
    preferredCategories: ["fashion"],
    sellerQualitySnapshots: {
      "seller-followed": {
        trustScore: 86,
        qualityScore: 82,
        activityScore: 66
      }
    },
    marketInsights: {
      productScores: {
        demand: {
          marketScore: 180,
          sellOutRisk: 72
        }
      }
    },
    styleProfile: {
      categories: [{ key: "fashion-dress", score: 180 }],
      topCategories: [{ key: "fashion", score: 110 }],
      colors: [],
      sizes: [],
      brands: [],
      materials: [],
      fashionStyles: [],
      priceRanges: [],
      signalCount: 4
    }
  });

  assert.equal(ranked[0].id, "fresh");
  const diagnostics = engine.getLastRankingDiagnostics();
  assert.equal(diagnostics.inputCount, products.length);
  assert.equal(diagnostics.uniqueCount, 5);
  assert.equal(diagnostics.outputCount, ranked.length);
  assert.equal(diagnostics.duplicateCount, 1);
  assert.equal(diagnostics.freshProtectedCount, 1);
  assert.equal(typeof diagnostics.topSellerConcentration, "number");
  assert.equal(diagnostics.budgets.marketDemand > 0, true);
  assert.equal(new Set(ranked.map((product) => product.id)).size, ranked.length);
  assert.equal(ranked.some((product) => product.id === "followed"), true);
  assert.equal(ranked.some((product) => product.id === "demand"), true);
  assert.deepEqual(products.map((product) => product.id), [
    "old-seller-a-1",
    "fresh",
    "followed",
    "demand",
    "old-seller-a-2",
    "old-seller-a-1"
  ]);
  assert.match(source, /window\.WingaModules\.marketplace\.createFeedIntelligence = createFeedIntelligence;/);
  assert.ok(
    buildSource.indexOf('"src/marketplace/style-intelligence.js"') < buildSource.indexOf('"src/marketplace/feed-intelligence.js"'),
    "style intelligence must be bundled before feed intelligence consumers"
  );
  assert.ok(
    buildSource.indexOf('"src/marketplace/seller-quality-intelligence.js"') < buildSource.indexOf('"src/marketplace/feed-intelligence.js"'),
    "seller quality intelligence must be bundled before feed intelligence consumers"
  );
  assert.ok(
    buildSource.indexOf('"src/marketplace/search-demand-intelligence.js"') < buildSource.indexOf('"src/marketplace/market-intelligence.js"'),
    "search demand intelligence must be bundled before market intelligence consumers"
  );
  assert.ok(
    buildSource.indexOf('"src/marketplace/market-intelligence.js"') < buildSource.indexOf('"src/marketplace/feed-intelligence.js"'),
    "market intelligence must be bundled before feed intelligence consumers"
  );
  assert.ok(
    buildSource.indexOf('"src/marketplace/feed-intelligence.js"') < buildSource.indexOf('"src/marketplace/discovery.js"'),
    "feed intelligence must be bundled before discovery/home ranking consumers"
  );
  assert.match(source, /style:\s*getStyleScore\(product, context\)/);
  assert.match(source, /sellerQuality:\s*getSellerQualityScore\(product, context\)/);
  assert.match(source, /market:\s*getMarketScore\(product, context\)/);
  assert.match(source, /maxPersonalizationBudget/);
  assert.match(source, /maxMarketDemandBudget/);
  assert.match(source, /rawScore/);
  assert.match(source, /getLastRankingDiagnostics/);
  assert.match(source, /topSellerConcentration/);
  const safetyEngine = context.window.WingaModules.marketplace.createFeedIntelligence({
    getEngagementScore: (product) => Number(product.views || 0),
    config: {
      freshProtectionWindowMs: 20 * 60 * 1000,
      freshTopSlots: 1,
      sellerCap: 2,
      maxEngagementBudget: 160,
      maxMarketDemandBudget: 180,
      maxPersonalizationBudget: 220
    }
  });
  const safetyRanked = safetyEngine.rankHomeFeed([
    { id: "fresh-safe", uploadedBy: "seller-fresh", createdAt: "2026-07-04T09:58:00.000Z", views: 0 },
    { id: "old-hype-1", uploadedBy: "seller-hype", createdAt: "2026-06-01T09:00:00.000Z", views: 999999, demandSummary: { demandScore: 999, waitingUsers: 999, restockInterest: 999 } },
    { id: "old-hype-2", uploadedBy: "seller-hype", createdAt: "2026-06-01T08:00:00.000Z", views: 999999, demandSummary: { demandScore: 999, waitingUsers: 999, restockInterest: 999 } },
    { id: "old-hype-3", uploadedBy: "seller-hype", createdAt: "2026-06-01T07:00:00.000Z", views: 999999, demandSummary: { demandScore: 999, waitingUsers: 999, restockInterest: 999 } },
    { id: "balanced", uploadedBy: "seller-balanced", createdAt: "2026-07-03T09:00:00.000Z", views: 5 }
  ], { now });
  const safetyScore = safetyEngine.scoreProduct({
    id: "old-hype-1",
    uploadedBy: "seller-hype",
    createdAt: "2026-06-01T09:00:00.000Z",
    views: 999999,
    demandSummary: { demandScore: 999, waitingUsers: 999, restockInterest: 999 }
  }, {}, now);
  assert.equal(safetyRanked[0].id, "fresh-safe");
  assert.equal(safetyRanked.slice(0, 4).filter((product) => product.uploadedBy === "seller-hype").length <= 2, true);
  assert.equal(safetyScore.score.engagement, 160);
  assert.equal(safetyScore.score.marketDemand, 180);
  assert.match(appSource, /function getHomeFeedIntelligenceEngine\(\)/);
  assert.match(appSource, /function getHomeFeedStyleProfile\(\)/);
  assert.match(appSource, /function getSellerQualitySnapshot\(username\)/);
  assert.match(appSource, /function getMarketInsights\(productList = products, options = \{\}\)/);
  assert.match(appSource, /intelligenceEngine\.rankHomeFeed\(visibleList, getHomeFeedIntelligenceContext\(visibleList\)\)/);
});

test("product detail continuation uses backend-backed endless feed state and feed media fit", () => {
  const root = path.resolve(__dirname, "..");
  const controllerSource = fs.readFileSync(path.join(root, "src", "product-detail", "controller.js"), "utf8");
  const gallerySource = fs.readFileSync(path.join(root, "src", "marketplace", "gallery.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");

  assert.match(controllerSource, /backendStageState:\s*\{\}/);
  assert.match(controllerSource, /backendStageIndex:\s*0/);
  assert.match(controllerSource, /async function loadNextDetailContinuationPage\(seedProduct\)/);
  assert.match(controllerSource, /\["seller", "category", "general"\]/);
  assert.match(controllerSource, /deps\.loadDetailContinuationProducts\(seedProduct/);
  assert.match(controllerSource, /function rememberRenderedDetailContinuationIds\(modal\)/);
  assert.match(controllerSource, /function filterDetailContinuationDescriptor\(descriptor\)/);
  assert.match(controllerSource, /async function hydrateDetailContinuousAnchor\(modal, anchor, product\)/);
  assert.match(controllerSource, /detailContinuousRuntime\.exhausted/);
  assert.match(appSource, /loadDetailContinuationProducts: loadProductDetailContinuationProducts/);
  assert.match(appSource, /async function loadProductDetailContinuationProducts\(product, options = \{\}\)/);
  assert.match(appSource, /surface: `detail-continuation-seller:\$\{product\.id\}`/);
  assert.match(appSource, /surface: `detail-continuation-category:\$\{product\.id\}`/);
  assert.match(appSource, /surface: `detail-continuation-general:\$\{product\.id\}`/);
  assert.match(gallerySource, /const usesFeedMediaFit = isFeedSurface \|\| isDetailContinuationSurface;/);
  assert.match(gallerySource, /usesFeedMediaFit\s+\?\s+"contain"/);
  assert.match(styleSource, /\.feed-gallery-preview\[data-feed-gallery-surface="detail-continuation"\] \.feed-gallery-carousel-track,[\s\S]*height:100% !important;/);
  assert.match(styleSource, /\.feed-gallery-preview\[data-feed-gallery-surface="detail-continuation"\] \.feed-gallery-carousel-slide,[\s\S]*min-height:100% !important;/);
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

test("remote auth API client owns session restore and credentialed auth writes", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(root, "src", "api", "auth-client.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");

  assert.match(registrySource, /window\.WingaModules\.api\.auth = window\.WingaModules\.api\.auth \|\| \{\};/);
  assert.match(moduleSource, /window\.WingaModules\.api\.auth\.createAuthApiClient = createAuthApiClient;/);
  assert.match(moduleSource, /let sessionRestoreController = null;/);
  assert.match(moduleSource, /function cancelSessionRestore\(reason = "auth_interaction"\)/);
  assert.match(moduleSource, /async function restoreSession\(\)/);
  assert.match(moduleSource, /sessionAdapter\.saveSession\?\.\(data\)/);
  assert.match(moduleSource, /sessionAdapter\.clearSession\?\.\(\)/);
  assert.match(moduleSource, /authFetchJson\(`\$\{baseUrl\}\/auth\/login`/);
  assert.match(moduleSource, /fetchJson\(`\$\{baseUrl\}\/users\/me\/profile`/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.auth\?\.createAuthApiClient/);
  assert.match(dataSource, /async restoreSession\(\) \{\s+return getAuthApiClient\(\)\.restoreSession\(\);/);
  assert.match(dataSource, /async login\(payload\) \{\s+return getAuthApiClient\(\)\.login\(payload\);/);
  assert.ok(buildSource.indexOf('"src/api/feed-state.js"') < buildSource.indexOf('"src/api/auth-client.js"'));
  assert.ok(buildSource.indexOf('"src/api/auth-client.js"') < buildSource.indexOf('"src/config/categories.js"'));
});

test("remote product actions API client owns product writes and demand signals", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(root, "src", "api", "products-client.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");

  assert.match(registrySource, /window\.WingaModules\.api\.productActions = window\.WingaModules\.api\.productActions \|\| \{\};/);
  assert.match(moduleSource, /window\.WingaModules\.api\.productActions\.createProductsApiClient = createProductsApiClient;/);
  assert.match(moduleSource, /async function createProduct\(product\)/);
  assert.match(moduleSource, /async function updateProduct\(productId, payload\)/);
  assert.match(moduleSource, /async function deleteProduct\(productId\)/);
  assert.match(moduleSource, /async function updateProductAvailability\(productId, payload\)/);
  assert.match(moduleSource, /async function recordDemand\(productId, payload = \{\}\)/);
  assert.match(moduleSource, /sessionId: payload\.sessionId \|\| getAnonymousDemandSessionId\(\)/);
  assert.match(moduleSource, /async function moderateProduct\(productId, payload\)/);
  assert.match(moduleSource, /async function likeProduct\(productId\)/);
  assert.match(moduleSource, /async function trackProductView\(productId\)/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.productActions\?\.createProductsApiClient/);
  assert.match(dataSource, /async createProduct\(product\) \{\s+return getProductsApiClient\(\)\.createProduct\(product\);/);
  assert.match(dataSource, /async recordDemand\(productId, payload = \{\}\) \{\s+return getProductsApiClient\(\)\.recordDemand\(productId, payload\);/);
  assert.ok(buildSource.indexOf('"src/api/auth-client.js"') < buildSource.indexOf('"src/api/products-client.js"'));
  assert.ok(buildSource.indexOf('"src/api/products-client.js"') < buildSource.indexOf('"src/config/categories.js"'));
});

test("remote communications API client owns messages notifications and realtime stream", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(root, "src", "api", "communications-client.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");

  assert.match(registrySource, /window\.WingaModules\.api\.communications = window\.WingaModules\.api\.communications \|\| \{\};/);
  assert.match(moduleSource, /window\.WingaModules\.api\.communications\.createCommunicationsApiClient = createCommunicationsApiClient;/);
  assert.match(moduleSource, /async function loadMessages\(\)/);
  assert.match(moduleSource, /async function sendMessage\(payload\)/);
  assert.match(moduleSource, /async function markConversationRead\(payload\)/);
  assert.match(moduleSource, /async function loadNotifications\(\)/);
  assert.match(moduleSource, /async function markNotificationRead\(notificationId\)/);
  assert.match(moduleSource, /new EventSourceCtor\(`\$\{baseUrl\}\/messages\/stream`, \{ withCredentials: true \}\)/);
  assert.match(moduleSource, /handlers\.onConversationRead\?\.\(parseEvent\(event\)\)/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.communications\?\.createCommunicationsApiClient/);
  assert.match(dataSource, /async sendMessage\(payload\) \{\s+return getCommunicationsApiClient\(\)\.sendMessage\(payload\);/);
  assert.match(dataSource, /openRealtimeChannel\(handlers = \{\}\) \{\s+return getCommunicationsApiClient\(\)\.openRealtimeChannel\(handlers\);/);
  assert.ok(buildSource.indexOf('"src/api/products-client.js"') < buildSource.indexOf('"src/api/communications-client.js"'));
  assert.ok(buildSource.indexOf('"src/api/communications-client.js"') < buildSource.indexOf('"src/config/categories.js"'));
});

test("remote commerce API client owns promotions reviews and order writes", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(root, "src", "api", "commerce-client.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");

  assert.match(registrySource, /window\.WingaModules\.api\.commerce = window\.WingaModules\.api\.commerce \|\| \{\};/);
  assert.match(moduleSource, /window\.WingaModules\.api\.commerce\.createCommerceApiClient = createCommerceApiClient;/);
  assert.match(moduleSource, /async function loadPromotions\(\)/);
  assert.match(moduleSource, /async function createPromotion\(payload\)/);
  assert.match(moduleSource, /async function reviewPromotion\(promotionId, payload\)/);
  assert.match(moduleSource, /async function disablePromotion\(promotionId\)/);
  assert.match(moduleSource, /async function loadReviews\(productId = ""\)/);
  assert.match(moduleSource, /async function createReview\(payload\)/);
  assert.match(moduleSource, /async function loadMyOrders\(\)/);
  assert.match(moduleSource, /async function createOrder\(payload\)/);
  assert.match(moduleSource, /async function updateOrderStatus\(orderId, payload\)/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.commerce\?\.createCommerceApiClient/);
  assert.match(dataSource, /async createPromotion\(payload\) \{\s+return getCommerceApiClient\(\)\.createPromotion\(payload\);/);
  assert.match(dataSource, /async createOrder\(payload\) \{\s+return getCommerceApiClient\(\)\.createOrder\(payload\);/);
  assert.ok(buildSource.indexOf('"src/api/communications-client.js"') < buildSource.indexOf('"src/api/commerce-client.js"'));
  assert.ok(buildSource.indexOf('"src/api/commerce-client.js"') < buildSource.indexOf('"src/config/categories.js"'));
});

test("remote admin API client owns moderation reports and ops endpoints", () => {
  const root = path.resolve(__dirname, "..");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(root, "src", "api", "admin-client.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");

  assert.match(registrySource, /window\.WingaModules\.api\.admin = window\.WingaModules\.api\.admin \|\| \{\};/);
  assert.match(moduleSource, /window\.WingaModules\.api\.admin\.createAdminApiClient = createAdminApiClient;/);
  assert.match(moduleSource, /async function loadAdminOpsSummary\(\)/);
  assert.match(moduleSource, /async function loadAdminUsers\(\)/);
  assert.match(moduleSource, /async function loadAdminProducts\(status = ""\)/);
  assert.match(moduleSource, /async function loadAdminOrders\(filters = \{\}\)/);
  assert.match(moduleSource, /async function createReport\(payload\)/);
  assert.match(moduleSource, /async function reviewReport\(reportId, payload\)/);
  assert.match(moduleSource, /async function updateAdminSettings\(payload\)/);
  assert.match(moduleSource, /async function reviewAdminMessage\(conversationId, payload = \{\}\)/);
  assert.match(moduleSource, /async function moderateUser\(username, payload\)/);
  assert.match(moduleSource, /async function loadModerationActions\(\)/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.admin\?\.createAdminApiClient/);
  assert.match(dataSource, /async loadAdminUsers\(\) \{\s+return getAdminApiClient\(\)\.loadAdminUsers\(\);/);
  assert.match(dataSource, /async moderateUser\(username, payload\) \{\s+return getAdminApiClient\(\)\.moderateUser\(username, payload\);/);
  assert.ok(buildSource.indexOf('"src/api/commerce-client.js"') < buildSource.indexOf('"src/api/admin-client.js"'));
  assert.ok(buildSource.indexOf('"src/api/admin-client.js"') < buildSource.indexOf('"src/config/categories.js"'));
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
  const localStore = new Map();
  const installState = { deferredPrompt: null, installed: false, initialized: false };
  const pwa = context.window.WingaModules.boot.createPwaLifecycleModule({
    getWindow: () => ({
      matchMedia: (query) => ({ matches: query.includes("standalone"), addEventListener: () => {} }),
      navigator: {},
      localStorage: {
        getItem: (key) => localStore.get(key) || "",
        setItem: (key, value) => localStore.set(key, String(value)),
        removeItem: (key) => localStore.delete(key)
      }
    }),
    getNavigator: () => ({ serviceWorker: {} }),
    getDocument: () => ({ getElementById: () => null, createElement: () => ({ setAttribute: () => {} }), body: { appendChild: () => {} } }),
    getInstallState: () => installState,
    getUpdateBannerState: () => ({ visibleVersion: "" }),
    updateDismissStorageKey: "test-dismiss-key"
  });
  assert.equal(pwa.isStandaloneDisplayMode(), true);
  assert.equal(pwa.getPwaInstallButtonLabel(), "Open app");
  pwa.saveDismissedUpdateBannerVersion("20260707");
  assert.equal(pwa.getDismissedUpdateBannerVersion(), "20260707");
  pwa.saveDismissedUpdateBannerVersion("");
  assert.equal(pwa.getDismissedUpdateBannerVersion(), "");
  assert.match(registrySource, /window\.WingaModules\.boot = window\.WingaModules\.boot \|\| \{\};/);
  assert.match(lifecycleSource, /window\.WingaModules\.boot\.createLifecycleModule = createLifecycleModule;/);
  assert.match(lifecycleSource, /window\.WingaModules\.boot\.createPwaLifecycleModule = createPwaLifecycleModule;/);
  assert.match(appSource, /window\.WingaModules\?\.boot\?\.createLifecycleModule/);
  assert.match(appSource, /window\.WingaModules\?\.boot\?\.createPwaLifecycleModule/);
  assert.match(appSource, /function initializePwaInstallExperience\(\) \{\s+getPwaLifecycleTools\(\)\.initializePwaInstallExperience\(\);/);
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

test("notification permission module owns prompt state and cooldown logic", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "notifications", "permission.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const localStore = new Map();
  const elements = new Map();
  const notifications = [];
  const events = [];
  const makeElement = (tag) => {
    const node = {
      tag,
      id: "",
      className: "",
      textContent: "",
      dataset: {},
      children: [],
      listeners: {},
      setAttribute(name, value) {
        if (name === "id") {
          this.id = String(value);
          elements.set(this.id, this);
        }
        this[name] = String(value);
      },
      append(...items) {
        this.children.push(...items);
      },
      appendChild(child) {
        this.children.push(child);
        if (child.id) elements.set(child.id, child);
      },
      replaceChildren(...items) {
        this.children = items;
      },
      querySelector(selector) {
        const attr = selector.match(/\[([^=]+)="([^"]+)"\]/);
        if (!attr) return null;
        const [name, value] = [attr[1], attr[2]];
        const stack = [...this.children];
        while (stack.length) {
          const current = stack.shift();
          if (current?.[name] === value || current?.attributes?.[name] === value) return current;
          stack.push(...(current?.children || []));
        }
        return null;
      },
      addEventListener(type, handler) {
        this.listeners[type] = handler;
      },
      attributes: {}
    };
    return node;
  };
  const documentStub = {
    body: makeElement("body"),
    createElement: makeElement,
    getElementById: (id) => elements.get(id) || null
  };
  let permission = "default";
  const context = vm.createContext({
    window: {
      WingaModules: { notifications: {} },
      Notification: {
        get permission() {
          return permission;
        },
        requestPermission: async () => {
          permission = "granted";
          return permission;
        }
      },
      localStorage: {
        getItem: (key) => localStore.get(key) || "",
        setItem: (key, value) => localStore.set(key, String(value)),
        removeItem: (key) => localStore.delete(key)
      }
    },
    Date,
    JSON,
    Math,
    Object,
    Number,
    String,
    Boolean,
    Array,
    Set
  });
  vm.runInContext(source, context);
  const module = context.window.WingaModules.notifications.createNotificationPermissionModule({
    getWindow: () => context.window,
    getDocument: () => documentStub,
    storageKey: "test-notification-permission",
    promptCooldownMs: 60_000,
    allowedTriggers: new Set(["message", "order"]),
    createElement: (tag, options = {}) => {
      const node = makeElement(tag);
      node.className = options.className || "";
      node.textContent = options.textContent || "";
      node.attributes = options.attributes || {};
      Object.entries(options.attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
      return node;
    },
    showInAppNotification: (notification) => notifications.push(notification),
    renderCurrentView: () => events.push("render"),
    reportClientEvent: (...args) => events.push(args)
  });

  assert.equal(module.normalizeNotificationPermissionStatus("bad"), "not_asked");
  assert.equal(module.shouldShowNotificationPermissionPrompt("message"), true);
  assert.equal(module.showNotificationPermissionPrompt("message"), true);
  assert.equal(module.shouldShowNotificationPermissionPrompt("message"), false);
  const rootNode = elements.get("notification-permission-root");
  assert.equal(rootNode.dataset.visible, "true");
  const enableButton = rootNode.querySelector('[data-notification-permission-enable="true"]');
  assert.ok(enableButton);
  return module.requestBrowserNotificationPermission().then((permissionResult) => {
    assert.equal(permissionResult, "granted");
    module.updateNotificationPermissionState({ status: "allowed" });
    assert.equal(module.getNotificationPermissionState().status, "allowed");
    assert.match(registrySource, /window\.WingaModules\.notifications = window\.WingaModules\.notifications \|\| \{\};/);
    assert.match(source, /window\.WingaModules\.notifications\.createNotificationPermissionModule = createNotificationPermissionModule;/);
    assert.match(appSource, /window\.WingaModules\?\.notifications\?\.createNotificationPermissionModule/);
    assert.match(appSource, /function maybePromptNotificationPermission\(trigger = "message", options = \{\}\) \{\s+return getNotificationPermissionTools\(\)\.maybePromptNotificationPermission\(trigger, options\);/);
    assert.ok(
      buildSource.indexOf('"src/notifications/permission.js"') < buildSource.indexOf('"src/monitoring/performance.js"'),
      "notification permission module must be bundled before app boot"
    );
  });
});

test("home pagination retries safely, cancels stale work, and commits pages transactionally", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const dataSource = fs.readFileSync(path.join(root, "data-service.js"), "utf8");
  const backendSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const continuationSource = fs.readFileSync(path.join(root, "src", "marketplace", "continuation.js"), "utf8");
  const productApiSource = fs.readFileSync(path.join(root, "src", "api", "products.js"), "utf8");
  const feedStateSource = fs.readFileSync(path.join(root, "src", "api", "feed-state.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");

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
  assert.match(registrySource, /window\.WingaModules\.api\.products = window\.WingaModules\.api\.products \|\| \{\};/);
  assert.match(registrySource, /window\.WingaModules\.api\.feedState = window\.WingaModules\.api\.feedState \|\| \{\};/);
  assert.match(productApiSource, /window\.WingaModules\.api\.products\.createProductApiTools = createProductApiTools;/);
  assert.match(feedStateSource, /window\.WingaModules\.api\.feedState\.createProductFeedStateTools = createProductFeedStateTools;/);
  assert.match(productApiSource, /function normalizeProductPageResponse\(payload, options = \{\}, mapProduct = \(product\) => product\)/);
  assert.match(productApiSource, /function mergeUniqueProducts\(existingProducts = \[\], incomingProducts = \[\]\)/);
  assert.match(feedStateSource, /function applyLoadedProductPageToState\(loadedProducts, options = \{\}\)/);
  assert.match(feedStateSource, /function getNextProductsPageOptions\(\)/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.products\?\.createProductApiTools/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.feedState\?\.createProductFeedStateTools/);
  assert.match(dataSource, /function normalizeProductPageResponse\(payload, options = \{\}, mapProduct = \(product\) => product\) \{\s+return getProductApiTools\(\)\.normalizeProductPageResponse\(payload, options, mapProduct\);/);
  assert.match(dataSource, /function applyLoadedProductPageToState\(loadedProducts, options = \{\}\) \{\s+return getProductFeedStateTools\(\)\.applyLoadedProductPageToState\(loadedProducts, options\);/);
  assert.ok(buildSource.indexOf('"src/api/runtime.js"') < buildSource.indexOf('"src/api/products.js"'));
  assert.ok(buildSource.indexOf('"src/api/products.js"') < buildSource.indexOf('"src/config/categories.js"'));
  assert.ok(buildSource.indexOf('"src/api/products.js"') < buildSource.indexOf('"src/api/feed-state.js"'));
  assert.ok(buildSource.indexOf('"src/api/feed-state.js"') < buildSource.indexOf('"src/config/categories.js"'));
  assert.match(continuationSource, /window\.WingaModules\.marketplace\.createContinuationHelpers = createContinuationHelpers;/);
  assert.match(continuationSource, /function createContinuousDiscoveryRuntime\(options = \{\}\)/);
  assert.match(continuationSource, /pendingDescriptors: normalizePendingDescriptors\(options\.pendingDescriptors\)/);
  assert.match(appSource, /window\.WingaModules\?\.marketplace\?\.createContinuationHelpers/);
  assert.match(appSource, /let homeContinuousDiscoveryRuntime = createHomeContinuousDiscoveryRuntime\(\);/);

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

  const runtime = helpers.createContinuousDiscoveryRuntime({
    usedIds: new Set(["product-a"]),
    initialProductIds: ["product-a", "product-b"],
    pendingDescriptors: [
      { kind: "valid", items: [{ id: "product-c" }] },
      { kind: "empty", items: [] }
    ],
    lastVariantNormalOrdinal: -3,
    loadMoreRequestId: 7
  });
  assert.equal(runtime.normalProductOrdinal, 2);
  assert.equal(runtime.nextFeedSequenceIndex, 2);
  assert.equal(runtime.usedIds.has("product-a"), true);
  assert.equal(runtime.productLastAppearanceOrdinal["product-b"], 2);
  assert.equal(runtime.pendingDescriptors.length, 1);
  assert.equal(runtime.lastVariantNormalOrdinal, -3);
  assert.equal(runtime.loadMoreRequestId, 7);
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
  assert.match(performanceSource, /function createMetricWindowStore\(windows = \{\}, options = \{\}\)/);
  assert.match(appSource, /window\.WingaModules\?\.monitoring\?\.createPerformanceModule/);
  assert.match(appSource, /getRuntimeMetricWindowTools\(\)\.record\(metric, value\)/);
  assert.match(appSource, /getRuntimeMetricWindowTools\(\)\.summarize\(metric\)/);
  assert.match(appSource, /if \(isExperienceMetricDebugEnabled\(\)\) \{\s+safePerformanceMark\("winga_render_start"\);/);
  assert.match(marketplaceSource, /feedVariantResurface && deps\.isPerformanceDebugEnabled\?\.\(\)/);
  assert.match(detailSource, /initialImageIndex \|\| 0\) > 0 && deps\.isPerformanceDebugEnabled\?\.\(\)/);

  const performanceContext = vm.createContext({
    window: {
      WingaModules: { monitoring: {} },
      location: { search: "", hostname: "wingamarket.com" }
    },
    performance: { now: () => 12 },
    Date,
    Math,
    Object,
    Number,
    String,
    Boolean,
    Array
  });
  vm.runInContext(performanceSource, performanceContext);
  const performanceTools = performanceContext.window.WingaModules.monitoring.createPerformanceModule({
    isProductionRuntime: () => true
  });
  const windows = { feedImageLoadLatencyMs: [] };
  const metricStore = performanceTools.createMetricWindowStore(windows, { limit: 2 });
  metricStore.record("feedImageLoadLatencyMs", 10.4);
  metricStore.record("feedImageLoadLatencyMs", 20.2);
  metricStore.record("feedImageLoadLatencyMs", 30.8);
  assert.deepEqual(windows.feedImageLoadLatencyMs, [20, 31]);
  assert.deepEqual(JSON.parse(JSON.stringify(metricStore.summarize("feedImageLoadLatencyMs"))), {
    count: 2,
    average: 26,
    max: 31,
    latest: 31
  });
  metricStore.reset();
  assert.equal(windows.feedImageLoadLatencyMs.length, 0);
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
  assert.match(productionVerifySource, /assertProductsApi\(route\.path, bodyText, response\.headers\)/);
  assert.match(productionVerifySource, /assertCsrfApi\(route\.path, bodyText, response\.headers\)/);
  assert.match(productionVerifySource, /\/api\/products\?limit=1&page=1/);
  assert.match(productionVerifySource, /\/api\/auth\/csrf-token/);
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

test("production domain routing verifier catches API shell fallthrough", () => {
  const root = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const domainVerifySource = fs.readFileSync(path.join(root, "scripts", "verify-domain-routing.js"), "utf8");

  assert.equal(packageJson.scripts["verify:domain-routing"], "node scripts/verify-domain-routing.js");
  assert.match(domainVerifySource, /FRONTEND_ORIGIN/);
  assert.match(domainVerifySource, /VERCEL_ORIGIN/);
  assert.match(domainVerifySource, /BACKEND_ORIGIN/);
  assert.match(domainVerifySource, /frontend API products/);
  assert.match(domainVerifySource, /frontend CSRF/);
  assert.match(domainVerifySource, /application\\\/json/);
  assert.match(domainVerifySource, /X-Vercel-Id/);
  assert.match(domainVerifySource, /traffic is not reaching the Vercel deployment/);
});

test("production builds expose one verifiable app version", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const verifySource = fs.readFileSync(path.join(root, "scripts", "verify-production-shell.js"), "utf8");

  assert.match(appSource, /window\.WINGA_BUILD_VERSION = APP_BOOT_BUILD_VERSION/);
  assert.match(appSource, /data-winga-build-version/);
  assert.match(buildSource, /writeBuildVersionManifest/);
  assert.match(buildSource, /build-version\.json/);
  assert.match(buildSource, /source: "build-vercel-static"/);
  assert.match(verifySource, /\/build-version\.json/);
  assert.match(verifySource, /extractBuildVersionFromHtml/);
  assert.match(verifySource, /extractServiceWorkerVersion/);
  assert.match(verifySource, /Production build versions do not match/);
});

test("backend intelligence platform normalizes canonical marketplace events", async () => {
  const root = path.resolve(__dirname, "..");
  const { createIntelligencePlatform } = require(path.join(root, "backend", "intelligence-platform.js"));
  const appended = [];
  const persisted = [];
  const platform = createIntelligencePlatform({
    appendEvent: async (entry) => appended.push(entry),
    persistEvent: async (event, scores) => persisted.push({ event, scores }),
    now: () => new Date("2026-06-30T09:00:00.000Z"),
    logger: { warn() {} }
  });

  const event = await platform.ingestClientEvent({
    level: "info",
    event: "order_created",
    message: "Buyer created order",
    category: "orders",
    fingerprint: "buyer-flow",
    context: {
      productId: "product-1",
      surface: "home-feed",
      appVersion: "20260630090000"
    }
  }, {
    session: { username: "buyer_one" },
    req: { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "cf-ipcountry": "TZ" } },
    store: { products: [{ id: "product-1", uploadedBy: "seller_one" }] }
  });

  assert.equal(event.eventType, "product_purchased");
  assert.equal(event.productId, "product-1");
  assert.equal(event.sellerId, "seller_one");
  assert.equal(event.buyerId, "buyer_one");
  assert.equal(event.feedContext, "home-feed");
  assert.equal(event.location, "TZ");
  assert.equal(event.deviceType, "mobile");
  assert.equal(event.quality.known, true);
  assert.equal(event.quality.scoreableProduct, true);
  assert.equal(event.quality.scoreableSeller, true);
  assert.equal(platform.getSummary().queue.enqueued, 1);
  await platform.drainForTests();
  assert.equal(appended[0].event, "intelligence_event");
  assert.equal(appended[0].eventType, "product_purchased");
  assert.equal(persisted[0].event.eventType, "product_purchased");
  assert.equal(persisted[0].scores.productScore.id, "product-1");
  assert.equal(persisted[0].scores.sellerScore.id, "seller_one");
  assert.equal(platform.getSummary().topProducts[0].id, "product-1");
  assert.equal(platform.getSummary().topSellers[0].id, "seller_one");
});

test("backend intelligence scoring caps repeated contributions and preserves noisy history", async () => {
  const root = path.resolve(__dirname, "..");
  const { createIntelligencePlatform } = require(path.join(root, "backend", "intelligence-platform.js"));
  const persisted = [];
  const platform = createIntelligencePlatform({
    appendEvent: async () => {},
    persistEvent: async (event, scores) => persisted.push({ event, scores }),
    now: () => new Date("2026-06-30T09:00:00.000Z"),
    logger: { warn() {} }
  });
  const context = {
    session: { username: "buyer_one" },
    req: { headers: { "user-agent": "Mozilla/5.0", "cf-ipcountry": "TZ" } },
    store: { products: [{ id: "product-1", uploadedBy: "seller_one" }] }
  };

  for (let index = 0; index < 5; index += 1) {
    await platform.ingestClientEvent({
      level: "info",
      event: "product_viewed",
      fingerprint: "buyer-flow",
      context: { productId: "product-1", surface: "home-feed" }
    }, context);
  }
  const noisy = await platform.ingestClientEvent({
    level: "info",
    event: "random_debug_noise",
    fingerprint: "buyer-flow",
    context: { route: "/" }
  }, context);
  await platform.drainForTests();

  assert.equal(noisy.quality.known, false);
  assert.equal(noisy.quality.scoreableProduct, false);
  assert.equal(platform.getProductScore("product-1").score, 3);
  assert.equal(platform.getProductScore("product-1").signals.product_viewed, 3);
  assert.equal(platform.getSellerScore("seller_one").signals.product_viewed, 3);
  assert.equal(platform.getSummary().queue.scoreSuppressed, 4);
  assert.equal(persisted.length, 6);
  assert.equal(persisted[persisted.length - 1].scores.productScore, null);
});

test("backend intelligence platform bounds persistence queue under pressure", async () => {
  const root = path.resolve(__dirname, "..");
  const { createIntelligencePlatform } = require(path.join(root, "backend", "intelligence-platform.js"));
  const blocker = new Promise(() => {});
  const platform = createIntelligencePlatform({
    appendEvent: async () => blocker,
    persistEvent: async () => {},
    maxQueueSize: 2,
    persistenceConcurrency: 1,
    now: () => new Date("2026-06-30T09:00:00.000Z"),
    logger: { warn() {} }
  });

  for (let index = 1; index <= 12; index += 1) {
    await platform.ingestClientEvent({ level: "info", event: "product_viewed", context: { productId: `product-${index}` } });
  }

  const summary = platform.getSummary();
  assert.equal(summary.queue.accepted, 12);
  assert.equal(summary.queue.enqueued, 12);
  assert.equal(summary.queue.active, 1);
  assert.equal(summary.queue.depth, 10);
  assert.equal(summary.queue.dropped, 1);
  assert.equal(summary.queue.maxSize, 10);
  assert.equal(summary.queue.concurrency, 1);
});

test("backend intelligence uses durable queue hooks when PostgreSQL is available", () => {
  const root = path.resolve(__dirname, "..");
  const serverSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
  const adminControllerSource = fs.readFileSync(path.join(root, "src", "admin", "controller.js"), "utf8");
  const monitorSource = fs.readFileSync(path.join(root, "scripts", "check-intelligence-health.js"), "utf8");
  const workflowSource = fs.readFileSync(path.join(root, ".github", "workflows", "intelligence-health.yml"), "utf8");
  const dbSource = fs.readFileSync(path.join(root, "backend", "db.js"), "utf8");
  const workerSource = fs.readFileSync(path.join(root, "backend", "intelligence-queue-worker.js"), "utf8");
  const edgeWorkerSource = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  const queueWorkerSource = fs.readFileSync(path.join(root, "cloudflare", "intelligence-worker.js"), "utf8");
  const rootWranglerSource = fs.readFileSync(path.join(root, "wrangler.toml"), "utf8");
  const wranglerSource = fs.readFileSync(path.join(root, "wrangler.intelligence.toml"), "utf8");
  const runbookSource = fs.readFileSync(path.join(root, "backend", "INTELLIGENCE_QUEUE.md"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS intelligence_event_queue/);
  assert.match(dbSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(dbSource, /idx_intelligence_event_queue_pending_created/);
  assert.match(dbSource, /idx_intelligence_event_queue_failed_updated/);
  assert.match(dbSource, /idx_intelligence_event_queue_processing_locked/);
  assert.match(dbSource, /idx_intelligence_event_queue_completed_processed/);
  assert.match(dbSource, /idx_intelligence_event_queue_dead_updated/);
  assert.match(dbSource, /idx_intelligence_event_queue_updated_at/);
  assert.match(dbSource, /idx_intelligence_event_queue_attempts/);
  assert.doesNotMatch(dbSource, /GROUP BY status/);
  assert.match(dbSource, /function enqueueIntelligenceEvent/);
  assert.match(dbSource, /function claimIntelligenceQueueBatch/);
  assert.match(dbSource, /function readIntelligenceQueueHealth/);
  assert.match(dbSource, /function readIntelligenceQueueJobs/);
  assert.match(dbSource, /function retryIntelligenceQueueItems/);
  assert.match(dbSource, /function markIntelligenceQueueItemsDead/);
  assert.match(dbSource, /function recoverStaleIntelligenceQueueJobs/);
  assert.match(dbSource, /function pruneCompletedIntelligenceQueueJobs/);
  assert.match(dbSource, /function pruneIntelligenceRawEvents/);
  assert.match(dbSource, /idx_intelligence_events_happened_at/);
  assert.match(dbSource, /idx_demand_events_created_at/);
  assert.match(dbSource, /idx_search_demand_events_happened_at/);
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS intelligence_daily_snapshots/);
  assert.match(dbSource, /idx_intelligence_daily_snapshots_date_updated/);
  assert.match(dbSource, /idx_intelligence_daily_snapshots_updated/);
  assert.match(dbSource, /function refreshIntelligenceDailySnapshots/);
  assert.match(dbSource, /function readIntelligenceSnapshotSummary/);
  assert.match(dbSource, /function readIntelligenceSnapshotHealth/);
  assert.match(dbSource, /estimated_total_snapshots/);
  assert.doesNotMatch(dbSource, /COUNT\(\*\)::int AS total_snapshots/);
  assert.match(serverSource, /postgresStore\?\.enqueueIntelligenceEvent/);
  assert.match(serverSource, /function processIntelligenceQueueOnce/);
  assert.match(serverSource, /recoverStaleIntelligenceQueueJobs/);
  assert.match(serverSource, /pruneCompletedIntelligenceQueueJobs/);
  assert.match(serverSource, /INTELLIGENCE_QUEUE_PROCESSOR_MODE/);
  assert.match(serverSource, /INTELLIGENCE_HEALTH_SCHEMA_VERSION/);
  assert.match(serverSource, /privacy: "ops-aggregate-only"/);
  assert.match(serverSource, /criticalPath: false/);
  assert.match(serverSource, /normalizeIntelligenceQueueProcessorMode/);
  assert.match(serverSource, /shouldRunStandbyIntelligenceQueue/);
  assert.match(serverSource, /INTELLIGENCE_QUEUE_STANDBY_AFTER_SECONDS/);
  assert.match(serverSource, /INTELLIGENCE_RAW_EVENT_RETENTION_DAYS/);
  assert.match(serverSource, /DEMAND_RAW_EVENT_RETENTION_DAYS/);
  assert.match(serverSource, /SEARCH_DEMAND_RAW_EVENT_RETENTION_DAYS/);
  assert.match(serverSource, /INTELLIGENCE_SNAPSHOT_WINDOW_DAYS/);
  assert.match(serverSource, /INTELLIGENCE_SNAPSHOT_STALE_SECONDS/);
  assert.match(serverSource, /refreshIntelligenceDailySnapshots/);
  assert.match(serverSource, /readIntelligenceSnapshotHealth/);
  assert.match(serverSource, /snapshot_missing/);
  assert.match(serverSource, /snapshot_stale/);
  assert.match(serverSource, /standbyFallbackRuns/);
  assert.match(serverSource, /rawPruned/);
  assert.match(serverSource, /trendSnapshots: Array\.isArray\(persistent\.trendSnapshots\)/);
  assert.match(serverSource, /function buildIntelligenceOpsSnapshot/);
  assert.match(serverSource, /intelligenceSummary\.opsSnapshot = buildIntelligenceOpsSnapshot\(intelligenceSummary\)/);
  assert.match(serverSource, /topEventTypes: Array\.isArray\(persistent\.topEventTypes\)/);
  assert.match(serverSource, /topProducts: Array\.isArray\(persistent\.topProducts\)/);
  assert.match(serverSource, /INTELLIGENCE_QUEUE_EMBEDDED_WORKER/);
  assert.match(serverSource, /getIntelligenceQueueAlerts/);
  assert.match(serverSource, /\/api\/intelligence\/queue-events/);
  assert.match(serverSource, /QUEUE_WEBHOOK_SECRET/);
  assert.match(serverSource, /OPS_HEALTH_TOKEN/);
  assert.match(serverSource, /\/api\/ops\/intelligence\/queue-health/);
  assert.match(serverSource, /\/api\/admin\/ops\/intelligence-queue/);
  assert.match(serverSource, /\/api\/admin\/ops\/intelligence-queue\/retry/);
  assert.match(serverSource, /\/api\/admin\/ops\/intelligence-queue\/dead/);
  assert.match(serverSource, /X-Ops-Health-Token/i);
  assert.match(serverSource, /normalizeQueueRecoveryIds/);
  assert.match(serverSource, /CLIENT_EVENT_DEDUPE_TTL_MS/);
  assert.match(serverSource, /evaluateClientEventIngestion/);
  assert.match(serverSource, /AUTOMATION_USER_AGENT_PATTERN/);
  assert.match(serverSource, /client_event_dropped/);
  assert.match(serverSource, /INTELLIGENCE_QUEUE_PENDING_AGE_ALERT_SECONDS/);
  assert.match(serverSource, /oldestPendingAgeSeconds/);
  assert.match(serverSource, /processing_stall/);
  assert.match(serverSource, /buildIntelligenceQueueHealthReport/);
  assert.match(serverSource, /startIntelligenceQueueWorker\(\)/);
  assert.match(serverSource, /intelligenceSummary\.durableQueue/);
  assert.equal(packageJson.scripts["worker:intelligence"], "node backend/intelligence-queue-worker.js");
  assert.equal(packageJson.scripts["worker:intelligence:once"], "node backend/intelligence-queue-worker.js --once");
  assert.equal(packageJson.scripts["monitor:intelligence"], "node scripts/check-intelligence-health.js");
  assert.match(workerSource, /claimIntelligenceQueueBatch/);
  assert.match(workerSource, /completeIntelligenceQueueItem/);
  assert.match(workerSource, /failIntelligenceQueueItem/);
  assert.match(workerSource, /pruneIntelligenceRawEvents/);
  assert.match(workerSource, /INTELLIGENCE_RAW_EVENT_RETENTION_DAYS/);
  assert.match(workerSource, /refreshIntelligenceDailySnapshots/);
  assert.match(workerSource, /INTELLIGENCE_SNAPSHOT_WINDOW_DAYS/);
  assert.match(workerSource, /SIGTERM/);
  assert.match(edgeWorkerSource, /async queue\(batch, env, ctx\)/);
  assert.match(edgeWorkerSource, /forwardIntelligenceQueueBatch/);
  assert.match(edgeWorkerSource, /X-Winga-Queue-Secret/);
  assert.match(queueWorkerSource, /async queue\(batch, env, ctx\)/);
  assert.match(queueWorkerSource, /forwardIntelligenceQueueBatch/);
  assert.match(queueWorkerSource, /X-Winga-Queue-Secret/);
  assert.doesNotMatch(queueWorkerSource, /ASSETS/);
  assert.match(wranglerSource, /name = "winga-intelligence-worker"/);
  assert.match(wranglerSource, /main = "\.\/cloudflare\/intelligence-worker\.js"/);
  assert.match(wranglerSource, /\[\[queues\.producers\]\]/);
  assert.match(wranglerSource, /binding = "WINGA_INTELLIGENCE_QUEUE"/);
  assert.match(wranglerSource, /\[\[queues\.consumers\]\]/);
  assert.match(wranglerSource, /dead_letter_queue = "winga-intelligence-events-dlq"/);
  assert.doesNotMatch(wranglerSource, /\[assets\]/);
  assert.doesNotMatch(wranglerSource, /\[\[routes\]\]/);
  assert.match(rootWranglerSource, /main = "\.\/cloudflare\/intelligence-worker\.js"/);
  assert.doesNotMatch(rootWranglerSource, /\[assets\]/);
  assert.doesNotMatch(rootWranglerSource, /\[\[routes\]\]/);
  assert.match(runbookSource, /Managed External Queue Upgrade Path/);
  assert.match(runbookSource, /Cloudflare Queues/);
  assert.match(runbookSource, /AWS SQS/);
  assert.match(runbookSource, /INTELLIGENCE_QUEUE_PROCESSOR_MODE=primary\|standby\|off/);
  assert.match(runbookSource, /INTELLIGENCE_RAW_EVENT_RETENTION_DAYS=180/);
  assert.match(runbookSource, /INTELLIGENCE_SNAPSHOT_WINDOW_DAYS=14/);
  assert.match(runbookSource, /INTELLIGENCE_SNAPSHOT_STALE_SECONDS=93600/);
  assert.match(runbookSource, /Daily Snapshot Aggregation/);
  assert.match(runbookSource, /catalog estimates instead of\s+full-table snapshot counts/);
  assert.match(runbookSource, /Raw Event Retention/);
  assert.match(runbookSource, /standby fallback/);
  assert.match(runbookSource, /npm run monitor:intelligence/);
  assert.match(runbookSource, /Exit codes:/);
  assert.match(runbookSource, /GitHub Scheduled Health Check/);
  assert.match(runbookSource, /schema\/version\/privacy markers/);
  assert.match(runbookSource, /OPS_HEALTH_TOKEN=<same value used by the backend health endpoint>/);
  assert.match(runbookSource, /INTELLIGENCE_ALERT_WEBHOOK_URL=<Slack\/Discord\/BetterStack\/Make\/Zapier webhook>/);
  assert.match(runbookSource, /Incident Severity And Response/);
  assert.match(runbookSource, /First-response checklist/);
  assert.match(adminControllerSource, /function buildOpsSignalLines/);
  assert.match(adminControllerSource, /Intelligence queue:/);
  assert.match(adminControllerSource, /Queue counts:/);
  assert.match(adminControllerSource, /Daily snapshots:/);
  assert.match(adminControllerSource, /Snapshot health:/);
  assert.match(adminControllerSource, /Ops contract:/);
  assert.match(adminControllerSource, /Trend snapshot:/);
  assert.match(adminControllerSource, /Top event:/);
  assert.doesNotMatch(adminControllerSource, /event_payload|score_payload|metadata\.buyerId/);
  assert.match(monitorSource, /OPS_HEALTH_TOKEN/);
  assert.match(monitorSource, /INTELLIGENCE_HEALTH_TOKEN/);
  assert.match(monitorSource, /EXIT_WARNING = 1/);
  assert.match(monitorSource, /EXIT_CRITICAL = 2/);
  assert.match(monitorSource, /EXIT_CONFIG = 3/);
  assert.match(monitorSource, /EXIT_NETWORK = 4/);
  assert.match(monitorSource, /X-Ops-Health-Token/);
  assert.match(monitorSource, /readiness/);
  assert.match(monitorSource, /schemaVersion/);
  assert.match(monitorSource, /criticalPath/);
  assert.match(monitorSource, /INTELLIGENCE_ALERT_WEBHOOK_URL/);
  assert.match(monitorSource, /rawPruned/);
  assert.match(monitorSource, /snapshots/);
  assert.match(monitorSource, /snapshotHealth/);
  assert.match(monitorSource, /function sanitizeMonitorPayload/);
  assert.match(monitorSource, /async function sendAlertWebhook/);
  assert.match(monitorSource, /source: "winga-intelligence-health"/);
  assert.doesNotMatch(monitorSource, /console\.log\(token|process\.stdout\.write\(token/);
  assert.match(workflowSource, /name: Winga Intelligence Health/);
  assert.match(workflowSource, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflowSource, /OPS_HEALTH_TOKEN: \$\{\{ secrets\.OPS_HEALTH_TOKEN \}\}/);
  assert.match(workflowSource, /INTELLIGENCE_ALERT_WEBHOOK_URL: \$\{\{ secrets\.INTELLIGENCE_ALERT_WEBHOOK_URL \}\}/);
  assert.match(workflowSource, /node-version: "24"/);
  assert.match(workflowSource, /npm run monitor:intelligence/);
  assert.doesNotMatch(workflowSource, /wingaopshealth|DATABASE_URL|QUEUE_WEBHOOK_SECRET/);
});

test("backend demand service normalizes and aggregates sold out demand signals", () => {
  const root = path.resolve(__dirname, "..");
  const { createDemandService, summarizeDemandEvents } = require(path.join(root, "backend", "demand-service.js"));
  const service = createDemandService({
    now: () => new Date("2026-06-30T09:00:00.000Z")
  });
  const product = {
    id: "product-demand-1",
    name: "White Dress",
    uploadedBy: "seller_one",
    category: "wanawake-magauni",
    availability: "sold_out"
  };
  const event = service.recordDemand({
    action: "want_back",
    color: "White",
    size: "m",
    country: "tz",
    region: "Dar es Salaam"
  }, product, {
    username: "buyer_one",
    headers: {},
    clientIp: "127.0.0.1"
  });

  assert.equal(event.productId, "product-demand-1");
  assert.equal(event.sellerId, "seller_one");
  assert.equal(event.action, "want_back");
  assert.equal(event.color, "white");
  assert.equal(event.size, "M");
  assert.equal(event.country, "TZ");
  assert.ok(event.dedupeKey);

  const summary = summarizeDemandEvents([event], [product])[0];
  assert.equal(summary.productId, "product-demand-1");
  assert.equal(summary.waitingUsers, 1);
  assert.equal(summary.restockInterest, 1);
  assert.equal(summary.topColors[0].color, "white");
  assert.equal(summary.topSizes[0].size, "M");
});

test("production frontend routes same-domain API requests to the backend origin", () => {
  const root = path.resolve(__dirname, "..");
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const staticRedirectsSource = fs.readFileSync(path.join(root, "_redirects"), "utf8");
  const apiProxySource = fs.readFileSync(path.join(root, "api", "[...path].js"), "utf8");
  const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];
  const redirects = Array.isArray(vercelConfig.redirects) ? vercelConfig.redirects : [];
  const apiRewrite = rewrites.find((entry) => entry.source === "/api/:path*");

  assert.ok(apiRewrite, "Vercel must not let /api requests fall through to the static app shell.");
  assert.equal(apiRewrite.destination, "https://winga-pflp.onrender.com/api/:path*");
  assert.ok(
    redirects.some((entry) => entry.source === "/api/product/:id" && entry.destination === "/product/:id"),
    "Product share redirects must remain explicit while general API requests proxy to the backend."
  );
  assert.match(staticRedirectsSource, /^\/api\/product\/\* \/product\/:splat 302$/m);
  assert.match(staticRedirectsSource, /^\/api\/\* https:\/\/winga-pflp\.onrender\.com\/api\/:splat 200$/m);
  assert.match(apiProxySource, /const BACKEND_API_ORIGIN = "https:\/\/winga-pflp\.onrender\.com"/);
  assert.match(apiProxySource, /bodyParser: false/);
  assert.match(apiProxySource, /MAX_PROXY_BODY_BYTES = 20 \* 1024 \* 1024/);
  assert.match(apiProxySource, /HOP_BY_HOP_HEADERS/);
  assert.match(apiProxySource, /headers\["x-winga-proxy"\] = "vercel-api"/);
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

  const soldOutHtml = context.buildDiscoveryProductCardHtml({
    ...normalized[0],
    availability: "sold_out"
  }, 0, {
    usersById: {},
    session: null
  });
  assert.match(soldOutHtml, /sold-out-ribbon/);
  assert.match(soldOutHtml, /SOLD OUT/);
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
  const continuationSource = fs.readFileSync(path.join(root, "src", "marketplace", "continuation.js"), "utf8");

  assert.match(buildSource, /"src\/marketplace\/variants\.js"/);
  assert.match(variantSource, /window\.WingaModules\.marketplace\.createVariantHelpers = createVariantHelpers;/);
  assert.match(variantSource, /item\?\.visibleImageIndex\s*\?\?\s*item\?\.feedInitialImageIndex\s*\?\?\s*item\?\.variantDisplayIndex/);
  assert.match(appSource, /window\.WingaModules\?\.marketplace\?\.createVariantHelpers/);
  assert.match(appSource, /homeContinuousDiscoveryRuntime = createHomeContinuousDiscoveryRuntime\(\{\s+usedIds: new Set\(Array\.from\(options\.usedProductIds/);
  assert.match(continuationSource, /nextFeedSequenceIndex: initialProductIds\.length/);
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

test("getShowcaseProducts admits sold out demand cards only when demand is real", () => {
  const result = getShowcaseProducts([
    { id: "available", status: "approved", availability: "available", image: "a", likes: 2, views: 4 },
    {
      id: "wanted",
      status: "approved",
      availability: "sold_out",
      image: "b",
      likes: 1,
      views: 2,
      demandSummary: {
        demandScore: 28,
        waitingUsers: 6,
        restockInterest: 5
      }
    },
    { id: "empty-sold", status: "approved", availability: "sold_out", image: "c", likes: 80, views: 80 }
  ]);

  assert.equal(result.some((product) => product.id === "wanted"), true);
  assert.equal(result.some((product) => product.id === "empty-sold"), false);
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
  const apiRuntimeSource = fs.readFileSync(path.join(root, "src", "api", "runtime.js"), "utf8");
  const registrySource = fs.readFileSync(path.join(root, "src", "core", "module-registry.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build-vercel-static.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const backendSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");

  assert.match(registrySource, /window\.WingaModules\.api = window\.WingaModules\.api \|\| \{\};/);
  assert.match(apiRuntimeSource, /window\.WingaModules\.api\.createApiRuntime = createApiRuntime;/);
  assert.match(apiRuntimeSource, /function isUnsafeApiMethod\(method = "GET"\)/);
  assert.match(apiRuntimeSource, /\/auth\/csrf-token/);
  assert.doesNotMatch(dataSource, /document\.cookie/);
  assert.doesNotMatch(dataSource, /Authorization: `Bearer/);
  assert.doesNotMatch(dataSource, /stillStoredSession\?\.token/);
  assert.match(apiRuntimeSource, /headers\.set\("X-CSRF-Token", await fetchCsrfTokenForRequest\(url\)\)/);
  assert.match(apiRuntimeSource, /response\.status === 403 && errorCode === "csrf_failed" && !hasRetriedCsrf/);
  assert.match(dataSource, /window\.WingaModules\?\.api\?\.createApiRuntime/);
  assert.match(dataSource, /function fetchJson\(url, options\) \{\s+return getApiRuntimeTools\(\)\.fetchJson\(url, options\);/);
  assert.ok(buildSource.indexOf('"src/api/runtime.js"') < buildSource.indexOf('"src/config/categories.js"'));
  assert.ok(indexSource.indexOf("/winga-modules.js") < indexSource.indexOf("/data-service.js"));
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

test("backend search demand service keeps search intelligence anonymous and aggregate-ready", () => {
  const {
    createSearchDemandService,
    summarizeSearchDemandEvents
  } = require("../backend/search-demand-service.js");
  const service = createSearchDemandService({
    dedupeWindowMs: 60_000,
    maxBatchSize: 10
  });
  const events = service.normalizeBatch({
    events: [{
      query: "White Dresses in Dar es Salaam",
      source: "text",
      category: "fashion-dress",
      color: "white",
      brand: "Private brand",
      buyerId: "buyer-should-not-persist",
      resultCount: 0,
      zeroResult: true,
      noClick: true,
      location: "Dar es Salaam"
    }, {
      query: "White Dresses in Dar es Salaam",
      source: "text",
      category: "fashion-dress",
      color: "white",
      resultCount: 3,
      clickedProductId: "product-1",
      location: "Dar es Salaam"
    }]
  }, {
    clientIp: "203.0.113.42",
    timestamp: "2026-07-04T09:00:00.000Z",
    headers: { "user-agent": "Mozilla/5.0 Mobile" }
  });
  const summary = summarizeSearchDemandEvents(events, { limit: 5 });

  assert.equal(events.length, 2);
  assert.equal(events[0].metadata.anonymous, true);
  assert.equal(events[0].buyerId, undefined);
  assert.equal(events[0].sessionId, undefined);
  assert.equal(events[0].ip, undefined);
  assert.equal(events[0].queryKey, "white-dresses-in-dar-es-salaam");
  assert.equal(events[0].source, "text");
  assert.equal(events[0].zeroResult, true);
  assert.equal(summary.privacy, "anonymous-aggregate-only");
  assert.equal(summary.trendingSearches[0].queryKey, "white-dresses-in-dar-es-salaam");
  assert.equal(summary.zeroResultOpportunities[0].queryKey, "white-dresses-in-dar-es-salaam");
  assert.equal(summary.mostSearchedColors[0].color, "white");
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
