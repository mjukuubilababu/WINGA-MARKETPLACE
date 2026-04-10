const assert = require("node:assert/strict");
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
});

test("getOrderActionState enforces seller confirm, buyer receipt, and 48h cancel", () => {
  const now = Date.now();
  const oldPlaced = {
    status: "placed",
    paymentStatus: "pending",
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
    canConfirm: true,
    canConfirmReceived: false,
    canCancel: false
  });

  assert.deepEqual(getOrderActionState(oldPlaced, "buyer-a", now), {
    canConfirm: false,
    canConfirmReceived: false,
    canCancel: true
  });

  assert.deepEqual(getOrderActionState(confirmed, "buyer-a", now), {
    canConfirm: false,
    canConfirmReceived: true,
    canCancel: false
  });
});

test("getOrderLifecycleMeta maps order states to a clear buyer-seller journey", () => {
  assert.equal(getOrderLifecycleMeta({ status: "placed", paymentStatus: "pending" }).id, "request_sent");
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
