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
  const itemsCall = calls.find((call) => call.text.includes("ORDER BY p.created_at DESC, p.id DESC"));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.ok(itemsCall);
  assert.ok(countCall);
  assert.match(itemsCall.text, /\(created_at, id\) < \(\$2::timestamptz, \$3::text\)/);
  assert.match(itemsCall.text, /LEFT JOIN product_demand_summaries pds ON pds.product_id = p.id/);
  assert.match(itemsCall.text, /ORDER BY p.created_at DESC, p.id DESC/);
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

  const itemsCall = calls.find((call) => call.text.includes("ORDER BY p.created_at DESC, p.id DESC"));
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

test("PostgreSQL product pages expose compact demand summaries for ranking", async () => {
  const queryClient = {
    async query(text) {
      if (text.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return {
        rows: [{
          id: "product-demand-1",
          name: "Sold out dress",
          createdAt: new Date("2026-06-30T12:00:00.000Z"),
          updatedAt: new Date("2026-06-30T12:00:00.000Z"),
          images: [],
          demandTotalDemand: 4,
          demandWaitingUsers: 3,
          demandRestockInterest: 2,
          demandScore: 19,
          demandActionCounts: { want_back: 2, notify_when_available: 2 },
          demandTopColors: [{ color: "white", count: 3 }],
          demandTopSizes: [{ size: "M", count: 2 }],
          demandLastDemandAt: new Date("2026-06-30T13:00:00.000Z")
        }]
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const page = await store.readProductsPage({ limit: 12 });

  assert.equal(page.items[0].demandSummary.waitingUsers, 3);
  assert.equal(page.items[0].demandSummary.restockInterest, 2);
  assert.equal(page.items[0].demandSummary.topColors[0].color, "white");
  assert.equal(page.items[0].demandSummary.lastDemandAt, "2026-06-30T13:00:00.000Z");
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

  const itemsCall = calls.find((call) => call.text.includes("ORDER BY p.created_at DESC, p.id DESC"));
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
      if (text.includes("FROM intelligence_daily_snapshots")) {
        return { rows: [{ snapshotType: "event_type", snapshotKey: "product_purchased", count: 2, score: 2, metric: { lastMetric: {} }, updatedAt: new Date("2026-06-30T10:00:00.000Z") }] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const summary = await store.readIntelligenceSummary(5);

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.params), [[5], [5], [5], ["14", 5]]);
  assert.equal(summary.topEventTypes[0].eventType, "product_purchased");
  assert.equal(summary.topProducts[0].id, "product-1");
  assert.equal(summary.topSellers[0].id, "seller-1");
  assert.equal(summary.trendSnapshots[0].snapshotType, "event_type");
});

test("PostgreSQL intelligence retention prunes raw events without deleting summaries", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [], rowCount: 2 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.pruneIntelligenceRawEvents({
    intelligenceDays: 90,
    demandDays: 365,
    searchDays: 120
  });

  assert.equal(result.intelligenceEvents, 2);
  assert.equal(result.demandEvents, 2);
  assert.equal(result.searchDemandEvents, 2);
  assert.deepEqual(result.retentionDays, {
    intelligence: 90,
    demand: 365,
    search: 120
  });
  assert.match(calls[0].text, /DELETE FROM intelligence_events/);
  assert.match(calls[1].text, /DELETE FROM demand_events/);
  assert.match(calls[2].text, /DELETE FROM search_demand_events/);
  assert.equal(calls[0].params[0], "90");
  assert.equal(calls[1].params[0], "365");
  assert.equal(calls[2].params[0], "120");
  assert.equal(calls.some((call) => /DELETE FROM product_intelligence_scores|DELETE FROM seller_intelligence_scores|DELETE FROM product_demand_summaries/.test(call.text)), false);
});

test("PostgreSQL intelligence init creates time-only indexes for global raw event scans", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "backend", "db.js"), "utf8");

  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_events_happened_at\s+ON intelligence_events \(happened_at DESC\)/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_demand_events_created_at\s+ON demand_events \(created_at DESC\)/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_search_demand_events_happened_at\s+ON search_demand_events \(happened_at DESC\)/);
});

test("PostgreSQL intelligence snapshots aggregate raw signals before pruning", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("FROM intelligence_daily_snapshots") && text.includes("GROUP BY snapshot_type")) {
        return {
          rows: [{
            snapshotType: "search_query",
            snapshotKey: "white-dress",
            count: 3,
            score: 9,
            metric: { lastMetric: { query: "white dress" } },
            updatedAt: new Date("2026-07-06T09:00:00.000Z")
          }]
        };
      }
      return { rows: [], rowCount: 2 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const refresh = await store.refreshIntelligenceDailySnapshots({
    windowDays: 10,
    retentionDays: 365
  });
  const summary = await store.readIntelligenceSnapshotSummary({ days: 7, limit: 5 });

  assert.equal(refresh.eventTypes, 2);
  assert.equal(refresh.demandProducts, 2);
  assert.equal(refresh.searchQueries, 2);
  assert.equal(refresh.prunedSnapshots, 2);
  assert.equal(refresh.windowDays, 10);
  assert.equal(refresh.retentionDays, 365);
  assert.match(calls[0].text, /INSERT INTO intelligence_daily_snapshots/);
  assert.match(calls[0].text, /FROM intelligence_events/);
  assert.match(calls[1].text, /FROM demand_events/);
  assert.match(calls[2].text, /FROM search_demand_events/);
  assert.match(calls[3].text, /DELETE FROM intelligence_daily_snapshots/);
  assert.deepEqual(calls.slice(0, 4).map((call) => call.params[0]), ["10", "10", "10", "365"]);
  assert.equal(summary[0].snapshotType, "search_query");
  assert.equal(summary[0].snapshotKey, "white-dress");
  assert.equal(summary[0].score, 9);
  assert.deepEqual(calls.at(-1).params, ["7", 5]);
});

test("PostgreSQL intelligence snapshot health compares aggregates with recent raw events", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("estimated_total_snapshots")) {
        return {
          rows: [{
            estimated_total_snapshots: 1200000
          }]
        };
      }
      if (text.includes("COUNT(*)::int AS recent_snapshots")) {
        return {
          rows: [{
            recent_snapshots: 5
          }]
        };
      }
      if (text.includes("ORDER BY updated_at DESC")) {
        return {
          rows: [{
            latest_snapshot_date: "2026-07-06",
            latest_updated_at: new Date("2026-07-06T10:00:00.000Z"),
            seconds_since_latest_update: 3600
          }]
        };
      }
      return {
        rows: [{
          intelligence_events: 4,
          demand_events: 2,
          search_demand_events: 3
        }]
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const health = await store.readIntelligenceSnapshotHealth({ windowDays: 10 });

  assert.equal(health.estimatedTotalSnapshots, 1200000);
  assert.equal(health.recentSnapshots, 5);
  assert.equal(health.recentRawEventCount, 9);
  assert.equal(health.recentRawEvents.intelligenceEvents, 4);
  assert.equal(health.latestSnapshotDate, "2026-07-06");
  assert.equal(health.latestUpdatedAt, "2026-07-06T10:00:00.000Z");
  assert.equal(health.secondsSinceLatestUpdate, 3600);
  assert.equal(health.windowDays, 10);
  assert.match(calls[0].text, /FROM pg_class/);
  assert.match(calls[0].text, /intelligence_daily_snapshots'::regclass/);
  assert.match(calls[1].text, /COUNT\(\*\)::int AS recent_snapshots/);
  assert.match(calls[1].text, /WHERE snapshot_date >=/);
  assert.match(calls[2].text, /ORDER BY updated_at DESC/);
  assert.match(calls[3].text, /FROM intelligence_events/);
  assert.match(calls[3].text, /FROM demand_events/);
  assert.match(calls[3].text, /FROM search_demand_events/);
  assert.deepEqual(calls.map((call) => call.params), [[], ["10"], [], ["10"]]);
});

test("PostgreSQL durable intelligence queue claims, retries, and completes jobs", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO intelligence_event_queue")) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("RETURNING") && text.includes("q.queue_id")) {
        return {
          rows: [{
            queueId: 9,
            eventId: "intel-queued-1",
            event: { eventId: "intel-queued-1", eventType: "product_viewed" },
            scores: { productScore: { id: "product-1", score: 1 } },
            attempts: 2
          }]
        };
      }
      if (text.includes("GROUP BY status")) {
        return {
          rows: [
            { status: "pending", count: 3 },
            { status: "failed", count: 1 },
            { status: "dead", count: 0 }
          ]
        };
      }
      if (text.includes("oldest_pending_age_seconds")) {
        return {
          rows: [{
            oldest_pending_age_seconds: 360,
            oldest_failed_age_seconds: 120,
            oldest_processing_age_seconds: 0,
            seconds_since_last_completed: 18,
            last_completed_at: new Date("2026-07-05T08:00:00.000Z"),
            last_changed_at: new Date("2026-07-05T08:01:00.000Z"),
            max_attempts_seen: 2
          }]
        };
      }
      if (text.includes("event_payload->>'eventType'")) {
        return {
          rows: [
            {
              queue_id: 9,
              event_id: "intel-queued-1",
              status: "dead",
              attempts: 5,
              available_at: new Date("2026-07-05T08:00:00.000Z"),
              locked_at: null,
              locked_by: "",
              processed_at: null,
              last_error: "terminal",
              created_at: new Date("2026-07-05T07:00:00.000Z"),
              updated_at: new Date("2026-07-05T08:00:00.000Z"),
              event_type: "product_viewed",
              product_id: "product-1",
              seller_id: "seller-1",
              source_event: "product_viewed"
            }
          ]
        };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const enqueueResult = await store.enqueueIntelligenceEvent({
    eventId: "intel-queued-1",
    eventType: "product_viewed"
  }, {
    productScore: { id: "product-1", score: 1 }
  });
  const jobs = await store.claimIntelligenceQueueBatch({ limit: 5, workerId: "worker-a" });
  await store.completeIntelligenceQueueItem(jobs[0].queueId);
  await store.failIntelligenceQueueItem(jobs[0].queueId, new Error("temporary"), { attempts: 2, maxAttempts: 5 });
  const recovery = await store.recoverStaleIntelligenceQueueJobs({ staleSeconds: 120 });
  const prune = await store.pruneCompletedIntelligenceQueueJobs({ retentionHours: 24 });
  const health = await store.readIntelligenceQueueHealth();
  const failedJobs = await store.readIntelligenceQueueJobs({ statuses: ["dead"], limit: 10 });
  const retry = await store.retryIntelligenceQueueItems([9, 9, "bad"]);
  const markedDead = await store.markIntelligenceQueueItemsDead([9], "manual stop");

  assert.equal(enqueueResult.enqueued, true);
  assert.match(calls[0].text, /INSERT INTO intelligence_event_queue/);
  assert.match(calls[0].text, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.match(calls[1].text, /FOR UPDATE SKIP LOCKED/);
  assert.equal(calls[1].params[0], 5);
  assert.equal(calls[1].params[1], "worker-a");
  assert.equal(jobs[0].eventId, "intel-queued-1");
  assert.match(calls[2].text, /status = 'completed'/);
  assert.match(calls[3].text, /status = \$2/);
  assert.match(calls[4].text, /Recovered stale processing job/);
  assert.equal(calls[4].params[0], "120");
  assert.match(calls[5].text, /DELETE FROM intelligence_event_queue/);
  assert.equal(calls[5].params[0], "24");
  assert.equal(recovery.recovered, 1);
  assert.equal(prune.pruned, 1);
  assert.equal(health.pending, 3);
  assert.equal(health.failed, 1);
  assert.equal(health.dead, 0);
  assert.equal(health.oldestPendingAgeSeconds, 360);
  assert.equal(health.oldestFailedAgeSeconds, 120);
  assert.equal(health.secondsSinceLastCompleted, 18);
  assert.equal(health.maxAttemptsSeen, 2);
  assert.equal(failedJobs.items[0].queueId, 9);
  assert.equal(failedJobs.items[0].eventType, "product_viewed");
  assert.equal(failedJobs.items[0].productId, "product-1");
  assert.equal(failedJobs.items[0].eventPayload, undefined);
  assert.equal(retry.retried, 1);
  assert.equal(retry.requested, 1);
  assert.equal(markedDead.markedDead, 1);
  assert.match(calls.at(-2).text, /status = 'pending'/);
  assert.match(calls.at(-1).text, /status = 'dead'/);
});

test("PostgreSQL demand persistence dedupes events and refreshes seller summaries", async () => {
  const calls = [];
  const summaryRow = {
    productId: "product-demand-1",
    sellerId: "seller-1",
    totalDemand: 2,
    waitingUsers: 1,
    restockInterest: 1,
    demandScore: 7,
    actionCounts: { want_back: 1, show_similar: 1 },
    topColors: [{ color: "white", count: 1 }],
    topSizes: [{ size: "M", count: 1 }],
    firstDemandAt: new Date("2026-06-30T09:00:00.000Z"),
    lastDemandAt: new Date("2026-06-30T09:05:00.000Z"),
    updatedAt: new Date("2026-06-30T09:05:00.000Z")
  };
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO demand_events")) {
        return { rowCount: 1, rows: [{ demand_id: "demand-1" }] };
      }
      if (text.includes("INSERT INTO product_demand_summaries")) {
        return { rows: [summaryRow] };
      }
      if (text.includes("FROM product_demand_summaries")) {
        return { rows: [summaryRow] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.appendDemandEvent({
    demandId: "demand-1",
    dedupeKey: "dedupe-1",
    productId: "product-demand-1",
    sellerId: "seller-1",
    buyerId: "buyer-1",
    sessionId: "",
    action: "want_back",
    color: "white",
    size: "M",
    country: "TZ",
    region: "Dar es Salaam",
    demandScore: 6,
    metadata: { source: "product_detail" },
    createdAt: "2026-06-30T09:00:00.000Z"
  });

  assert.equal(result.inserted, true);
  assert.equal(result.summary.productId, "product-demand-1");
  assert.match(calls[0].text, /INSERT INTO demand_events/);
  assert.match(calls[0].text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.equal(calls[0].params[1], "dedupe-1");
  assert.match(calls[1].text, /INSERT INTO product_demand_summaries/);
  assert.match(calls[1].text, /COUNT\(DISTINCT/);

  const sellerSummary = await store.readSellerDemandSummary("seller-1", 5);
  assert.equal(sellerSummary[0].sellerId, "seller-1");
  assert.equal(sellerSummary[0].waitingUsers, 1);
  assert.deepEqual(calls.at(-1).params, ["seller-1", 5]);
});

test("PostgreSQL search demand persistence stores anonymous events and reads aggregate opportunities", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO search_demand_events")) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("GROUP BY query, query_key") && text.includes("zero_result IS TRUE")) {
        return {
          rows: [{
            query: "white dress",
            queryKey: "white-dress",
            category: "fashion-dress",
            location: "dar-es-salaam",
            searches: 2
          }]
        };
      }
      if (text.includes("GROUP BY query, query_key") && text.includes("result_count BETWEEN 1 AND 3")) {
        return {
          rows: [{
            query: "linen shirt",
            queryKey: "linen-shirt",
            category: "mens-shirts",
            searches: 3
          }]
        };
      }
      if (text.includes("MAX(detected_category)")) {
        return {
          rows: [{
            query: "white dress",
            queryKey: "white-dress",
            category: "fashion-dress",
            location: "dar-es-salaam",
            searches: 4,
            score: 7
          }]
        };
      }
      if (text.includes("detected_category AS category")) {
        return { rows: [{ category: "fashion-dress", searches: 4 }] };
      }
      if (text.includes("detected_color AS color")) {
        return { rows: [{ color: "white", searches: 4 }] };
      }
      if (text.includes("location AS region")) {
        return { rows: [{ region: "dar-es-salaam", searches: 4 }] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const insertResult = await store.appendSearchDemandEvents([{
    eventId: "search-event-1",
    dedupeKey: "search-dedupe-1",
    timestamp: "2026-07-04T09:00:00.000Z",
    query: "white dress",
    queryKey: "white-dress",
    detectedCategory: "fashion-dress",
    detectedColor: "white",
    location: "dar-es-salaam",
    source: "text",
    resultCount: 0,
    zeroResult: true,
    noClick: true,
    metadata: { anonymous: true }
  }]);
  const summary = await store.readSearchDemandSummary(5);

  assert.equal(insertResult.inserted, 1);
  assert.match(calls[0].text, /INSERT INTO search_demand_events/);
  assert.match(calls[0].text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.equal(calls[0].params[0], "search-event-1");
  assert.equal(calls[0].params[1], "search-dedupe-1");
  assert.equal(calls[0].params[4], "white-dress");
  assert.equal(summary.privacy, "anonymous-aggregate-only");
  assert.equal(summary.trendingSearches[0].queryKey, "white-dress");
  assert.equal(summary.zeroResultOpportunities[0].opportunity, "high");
  assert.equal(summary.lowSupplyOpportunities[0].supply, "low");
  assert.equal(summary.regionalDemand[0].region, "dar-es-salaam");
});
