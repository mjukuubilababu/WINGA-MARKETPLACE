const assert = require("node:assert/strict");
const {
  createProductSearchText,
  filterProducts,
  getShowcaseProducts,
  canRenderBuyButton,
  getOrderActionState,
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
