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

  assert.match(appSource, /hasStoredAspectRatio \? String\(Number\(storedAspectRatio\.toFixed\(6\)\)\) : "4 \/ 5"/);
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
  assert.match(styleSource, /object-fit:var\(--feed-gallery-fit-mode, cover\) !important;/);
  assert.match(styleSource, /\.product-detail-media,[\s\S]*\.profile-product-stage\{[\s\S]*width:100% !important;[\s\S]*padding-left:0 !important;/);
  assert.match(styleSource, /\.product-card-media img,[\s\S]*\.feed-gallery-preview img\{[\s\S]*width:100% !important;/);
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
  assert.equal(variantWarnings.length, 2);
  assert.equal(variantWarnings[0][0], "[WINGA] Variant has no images");
});

test("client variant entries prefer selected resurfacing indexes and preserve sequence continuity", () => {
  const root = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const uiSource = fs.readFileSync(path.join(root, "src", "marketplace", "ui.js"), "utf8");

  assert.match(appSource, /item\?\.visibleImageIndex\s*\?\?\s*item\?\.feedInitialImageIndex\s*\?\?\s*item\?\.variantDisplayIndex/);
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
