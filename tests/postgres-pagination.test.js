const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresStore } = require("../backend/db");

test("PostgreSQL cursor pagination keeps cursor parameters out of the count query", async () => {
  const calls = [];
  const cursorCreatedAt = "2026-06-24T20:00:00.000Z";
  const cursorId = "product-cursor";
  const rows = [
    {
      id: "product-3",
      name: "Newest",
      createdAt: new Date("2026-06-24T19:00:00.000Z"),
      updatedAt: new Date("2026-06-24T19:00:00.000Z"),
      images: []
    },
    {
      id: "product-2",
      name: "Middle",
      createdAt: new Date("2026-06-24T18:00:00.000Z"),
      updatedAt: new Date("2026-06-24T18:00:00.000Z"),
      images: []
    },
    {
      id: "product-1",
      name: "Lookahead",
      createdAt: new Date("2026-06-24T17:00:00.000Z"),
      updatedAt: new Date("2026-06-24T17:00:00.000Z"),
      images: []
    }
  ];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("COUNT(*)")) {
        return { rows: [{ total: 9 }] };
      }
      return { rows };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const page = await store.readProductsPage({
    limit: 2,
    page: 2,
    cursor: `${cursorCreatedAt}|${cursorId}`,
    viewerUsername: "seller-one",
    isStaffViewer: false
  });

  assert.equal(calls.length, 2);
  const itemsCall = calls.find((call) => call.text.includes("ORDER BY created_at DESC, id DESC"));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.ok(itemsCall);
  assert.ok(countCall);
  assert.match(itemsCall.text, /\(created_at, id\) < \(\$2::timestamptz, \$3::text\)/);
  assert.match(itemsCall.text, /ORDER BY created_at DESC, id DESC/);
  assert.match(itemsCall.text, /LIMIT \$4/);
  assert.deepEqual(itemsCall.params, [
    "seller-one",
    cursorCreatedAt,
    cursorId,
    3
  ]);

  assert.doesNotMatch(countCall.text, /\(created_at, id\) </);
  assert.deepEqual(countCall.params, ["seller-one"]);

  assert.deepEqual(page.items.map((product) => product.id), ["product-3", "product-2"]);
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 9);
  assert.equal(page.nextCursor, "2026-06-24T18:00:00.000Z|product-2");
});

test("anonymous cursor pagination binds only item query cursor parameters", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return {
        rows: [{
          id: "product-1",
          name: "Only product",
          createdAt: new Date("2026-06-23T12:00:00.000Z"),
          updatedAt: new Date("2026-06-23T12:00:00.000Z"),
          images: []
        }]
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const page = await store.readProductsPage({
    limit: 12,
    cursor: "2026-06-24T12:00:00.000Z|product-cursor"
  });

  const itemsCall = calls.find((call) => call.text.includes("ORDER BY created_at DESC, id DESC"));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.match(itemsCall.text, /\(created_at, id\) < \(\$1::timestamptz, \$2::text\)/);
  assert.match(itemsCall.text, /LIMIT \$3/);
  assert.deepEqual(itemsCall.params, [
    "2026-06-24T12:00:00.000Z",
    "product-cursor",
    13
  ]);
  assert.doesNotMatch(countCall.text, /\(created_at, id\) </);
  assert.deepEqual(countCall.params, []);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, "");
});

test("product query filters share stable count predicates without cursor leakage", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      return text.includes("COUNT(*)")
        ? { rows: [{ total: 4 }] }
        : { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  await store.readProductsPage({
    limit: 12,
    cursor: "2026-06-24T12:00:00.000Z|product-cursor",
    query: "simu",
    category: "electronics",
    seller: "seller-one"
  });

  const itemsCall = calls.find((call) => call.text.includes("ORDER BY created_at DESC, id DESC"));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.match(itemsCall.text, /name ILIKE \$1/);
  assert.match(itemsCall.text, /category = \$2 OR category LIKE \$3/);
  assert.match(itemsCall.text, /uploaded_by = \$4/);
  assert.match(itemsCall.text, /\(created_at, id\) < \(\$5::timestamptz, \$6::text\)/);
  assert.match(itemsCall.text, /LIMIT \$7/);
  assert.deepEqual(itemsCall.params, [
    "%simu%",
    "electronics",
    "electronics-%",
    "seller-one",
    "2026-06-24T12:00:00.000Z",
    "product-cursor",
    13
  ]);
  assert.doesNotMatch(countCall.text, /\(created_at, id\) </);
  assert.deepEqual(countCall.params, [
    "%simu%",
    "electronics",
    "electronics-%",
    "seller-one"
  ]);
});

test("PostgreSQL intelligence persistence appends events and upserts score tables", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  await store.appendIntelligenceEvent({
    eventId: "intel-test-1",
    eventType: "product_purchased",
    sourceEvent: "order_created",
    timestamp: "2026-06-30T09:00:00.000Z",
    productId: "product-1",
    sellerId: "seller-1",
    buyerId: "buyer-1",
    sessionId: "session-1",
    feedContext: "home-feed",
    location: "TZ",
    deviceType: "mobile",
    appVersion: "20260630090000",
    level: "info",
    category: "orders",
    alertSeverity: "low",
    metadata: { surface: "home-feed" },
    platformVersion: "2026-06-30.1"
  }, {
    productScore: {
      id: "product-1",
      score: 12,
      signals: { product_purchased: 1 },
      firstSeenAt: "2026-06-30T09:00:00.000Z",
      lastSeenAt: "2026-06-30T09:00:00.000Z"
    },
    sellerScore: {
      id: "seller-1",
      score: 5,
      signals: { product_purchased: 1 },
      firstSeenAt: "2026-06-30T09:00:00.000Z",
      lastSeenAt: "2026-06-30T09:00:00.000Z"
    }
  });

  assert.equal(calls.length, 3);
  assert.match(calls[0].text, /INSERT INTO intelligence_events/);
  assert.match(calls[0].text, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.deepEqual(calls[0].params.slice(0, 6), [
    "intel-test-1",
    "product_purchased",
    "order_created",
    "2026-06-30T09:00:00.000Z",
    "product-1",
    "seller-1"
  ]);
  assert.match(calls[1].text, /INSERT INTO product_intelligence_scores/);
  assert.match(calls[1].text, /ON CONFLICT \(product_id\) DO UPDATE SET/);
  assert.equal(calls[1].params[0], "product-1");
  assert.match(calls[2].text, /INSERT INTO seller_intelligence_scores/);
  assert.match(calls[2].text, /ON CONFLICT \(seller_id\) DO UPDATE SET/);
  assert.equal(calls[2].params[0], "seller-1");
});

test("PostgreSQL intelligence summary reads dedicated intelligence tables", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("FROM intelligence_events")) {
        return { rows: [{ eventType: "product_purchased", count: 2 }] };
      }
      if (text.includes("FROM product_intelligence_scores")) {
        return { rows: [{ id: "product-1", score: 12, signals: { product_purchased: 2 }, lastSeenAt: new Date("2026-06-30T09:00:00.000Z") }] };
      }
      if (text.includes("FROM seller_intelligence_scores")) {
        return { rows: [{ id: "seller-1", score: 5, signals: { product_purchased: 2 }, lastSeenAt: new Date("2026-06-30T09:00:00.000Z") }] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const summary = await store.readIntelligenceSummary(5);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.params), [[5], [5], [5]]);
  assert.equal(summary.topEventTypes[0].eventType, "product_purchased");
  assert.equal(summary.topProducts[0].id, "product-1");
  assert.equal(summary.topSellers[0].id, "seller-1");
});
