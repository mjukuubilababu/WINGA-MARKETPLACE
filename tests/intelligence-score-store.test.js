const assert = require("node:assert/strict");
const { test, before, beforeEach, after } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresStore } = require("../backend/db");
const { createIntelligencePlatform } = require("../backend/intelligence-platform");
const migration = require("../backend/migrations/intelligence-score-durability");

const schema = `
  CREATE TABLE intelligence_events (
    event_id TEXT PRIMARY KEY, event_type TEXT, source_event TEXT DEFAULT '', happened_at TIMESTAMPTZ,
    product_id TEXT DEFAULT '', seller_id TEXT DEFAULT '', buyer_id TEXT DEFAULT '', session_id TEXT DEFAULT '',
    feed_context TEXT, location TEXT, device_type TEXT, app_version TEXT, level TEXT, category TEXT,
    alert_severity TEXT, metadata JSONB, platform_version TEXT
  );
  CREATE TABLE product_intelligence_scores (product_id TEXT PRIMARY KEY, score NUMERIC(12,2) NOT NULL DEFAULT 0,
    signals JSONB NOT NULL DEFAULT '{}', first_seen_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ);
  CREATE TABLE seller_intelligence_scores (seller_id TEXT PRIMARY KEY, score NUMERIC(12,2) NOT NULL DEFAULT 0,
    signals JSONB NOT NULL DEFAULT '{}', first_seen_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ);
`;
let db;
let pool;
let store;

// PGlite has one connection. Lease it like a pg pool to avoid interleaved BEGINs.
function testPool(engine) {
  let lease = Promise.resolve();
  return {
    query: (sql, params) => engine.query(sql, params),
    async connect() {
      const previous = lease;
      let release;
      lease = new Promise(resolve => { release = resolve; });
      await previous;
      return { query: (sql, params) => engine.query(sql, params), release };
    }
  };
}
function attachStore() {
  pool = testPool(db);
  store = createPostgresStore({ databaseUrl: "postgres://isolated/scores", queryClient: pool });
}
before(async () => {
  db = new PGlite();
  await db.exec(schema);
  for (const sql of migration.statements) await db.exec(sql);
  attachStore();
});
beforeEach(async () => {
  await db.exec("TRUNCATE intelligence_events, intelligence_score_receipts, intelligence_score_windows, product_intelligence_scores, seller_intelligence_scores");
});
after(async () => { await db?.close(); });

function event(id, overrides = {}) {
  return { eventId: id, eventType: "product_viewed", sourceEvent: "product_viewed",
    timestamp: new Date().toISOString(), productId: "product", sellerId: "seller", buyerId: id, ...overrides };
}
async function score(table = "product_intelligence_scores") {
  return (await db.query(`SELECT * FROM ${table}`)).rows[0];
}

test("separate producers cannot replace totals with their private snapshots", async () => {
  const producers = [1, 2].map(() => createIntelligencePlatform({
    persistEvent: (e, snapshot) => store.appendIntelligenceEvent(e, snapshot), logger: { warn() {} }
  }));
  for (const [i, producer] of producers.entries()) {
    await producer.ingestClientEvent({ event: "product_viewed", productId: "product", sellerId: "seller" }, { session: { username: `buyer${i}` } });
  }
  await Promise.all(producers.map(producer => producer.drainForTests()));
  assert.equal(producers.every(p => p.getSummary().queue.failed === 0), true);
  assert.equal(Number((await score()).score), 2);
  assert.equal(Number((await score("seller_intelligence_scores")).score), 0.8);
});

test("duplicate deliveries and forged snapshot totals never double-count an event", async () => {
  const e = event("one");
  await Promise.all(Array.from({ length: 6 }, () => store.appendIntelligenceEvent(e, {
    productScore: { id: "product", score: 999999 }, sellerScore: { id: "seller", score: 999999 }
  })));
  assert.equal(Number((await score()).score), 1);
  assert.equal((await score()).signals.product_viewed, 1);
  assert.equal((await db.query("SELECT * FROM intelligence_score_receipts")).rows.length, 1);
});

test("database caps one actor's same-target contributions across store instances", async () => {
  const other = createPostgresStore({ databaseUrl: "postgres://isolated/scores", queryClient: pool });
  const timestamp = new Date().toISOString();
  await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? store : other).appendIntelligenceEvent(
    event(`repeat${i}`, { timestamp, buyerId: "same-buyer" })
  )));
  assert.equal(Number((await score()).score), 3);
  assert.equal(Number((await score("seller_intelligence_scores")).score), 1.2);
  assert.equal((await db.query("SELECT * FROM intelligence_events")).rows.length, 8);
});

test("negative deltas and timestamps are independent of queue delivery order", async () => {
  const older = new Date(Date.now() - 60000).toISOString();
  const newer = new Date().toISOString();
  const removed = event("removed", { eventType: "product_deleted", sourceEvent: "product_deleted", timestamp: newer });
  const uploaded = event("uploaded", { eventType: "product_uploaded", sourceEvent: "product_created", timestamp: older });
  await store.appendIntelligenceEvent(removed);
  await store.appendIntelligenceEvent(uploaded);
  const first = await score();
  assert.equal(Number(first.score), 2);
  assert.equal(new Date(first.first_seen_at).toISOString(), older);
  assert.equal(new Date(first.last_seen_at).toISOString(), newer);
  await db.exec("TRUNCATE intelligence_events, intelligence_score_receipts, intelligence_score_windows, product_intelligence_scores, seller_intelligence_scores");
  await store.appendIntelligenceEvent(uploaded);
  await store.appendIntelligenceEvent(removed);
  assert.equal(Number((await score()).score), 2);
  assert.deepEqual((await score()).signals, first.signals);
});

test("a seller-score error rolls back raw event, receipt, window and product delta together", async () => {
  await db.exec(`CREATE FUNCTION reject_score_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER reject_score_test BEFORE INSERT ON seller_intelligence_scores FOR EACH ROW EXECUTE FUNCTION reject_score_test();`);
  try {
    await assert.rejects(store.appendIntelligenceEvent(event("rollback")), /test failure/);
    for (const table of ["intelligence_events", "intelligence_score_receipts", "intelligence_score_windows", "product_intelligence_scores"]) {
      assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 0);
    }
  } finally {
    await db.exec("DROP TRIGGER reject_score_test ON seller_intelligence_scores; DROP FUNCTION reject_score_test()");
  }
  await store.appendIntelligenceEvent(event("rollback"));
  assert.equal(Number((await score()).score), 1);
});

test("order intent and failed-action aliases remain observable but never reward scores, including old queued events", async () => {
  const sources = ["order_created", "product_save_failed", "promotion_intent_submit_failed", "image_search_failed", "chat_runtime_failed", "message_seller_missing_product"];
  const platform = createIntelligencePlatform({ logger: { warn() {} } });
  for (const source of sources) {
    const local = await platform.ingestClientEvent({ event: source, productId: "product", sellerId: "seller" });
    assert.equal(local.eventType, source);
    assert.equal(local.quality.known, true);
    assert.equal(local.quality.scoreableProduct, false);
    assert.equal(local.quality.scoreableSeller, false);
    await store.appendIntelligenceEvent(event(source, { sourceEvent: source, eventType: "product_purchased" }));
  }
  await platform.drainForTests();
  assert.equal(platform.getSummary().topProducts.length, 0);
  assert.equal(await score(), undefined);
  const rows = (await db.query("SELECT event_type FROM intelligence_events")).rows;
  assert.deepEqual(rows.map(r => r.event_type).sort(), sources.sort());
});

test("receipt survives raw-event deletion and database reopen", async () => {
  const e = event("replay");
  await store.appendIntelligenceEvent(e);
  await db.exec("DELETE FROM intelligence_events");
  const snapshot = await db.dumpDataDir();
  await db.close();
  db = new PGlite({ loadDataDir: snapshot });
  attachStore();
  await store.appendIntelligenceEvent(e);
  assert.equal(Number((await score()).score), 1);
  await store.appendIntelligenceEvent(event("fresh"));
  assert.equal(Number((await score()).score), 2);
});

test("legacy score writers fail closed instead of replacing event-derived totals", async () => {
  await store.appendIntelligenceEvent(event("one"));
  await assert.rejects(db.exec("UPDATE product_intelligence_scores SET score = 999"), /writer upgrade required/);
  assert.equal(Number((await score()).score), 1);
});

test("expired and future events stay auditable without bypassing retention-window score protection", async () => {
  const old = event("old", { timestamp: new Date(Date.now() - 181 * 86400000).toISOString() });
  await store.appendIntelligenceEvent(old);
  await store.appendIntelligenceEvent(event("future", { timestamp: new Date(Date.now() + 86400000).toISOString() }));
  assert.equal(await score(), undefined);
  await db.query("INSERT INTO intelligence_score_receipts VALUES ('old', $1, 'legacy_baseline', NOW())", [old.timestamp]);
  await db.query("INSERT INTO intelligence_score_windows VALUES ('expired', $1, 3)", [old.timestamp]);
  await store.pruneIntelligenceScorePersistence();
  assert.equal((await db.query("SELECT * FROM intelligence_score_receipts")).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM intelligence_score_windows")).rows.length, 0);
  await store.appendIntelligenceEvent(old);
  assert.equal(await score(), undefined);
});

test("migration preserves legacy baseline and marks existing events already accounted for", async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec(schema);
    await legacy.exec("INSERT INTO product_intelligence_scores VALUES ('product', 7, '{\"product_viewed\":7}', NOW(), NOW(), NOW())");
    const e = event("legacy");
    await legacy.query("INSERT INTO intelligence_events (event_id, event_type, happened_at) VALUES ($1, $2, $3)", [e.eventId, e.eventType, e.timestamp]);
    for (const sql of migration.statements) await legacy.exec(sql);
    const writer = createPostgresStore({ databaseUrl: "postgres://isolated/legacy", queryClient: testPool(legacy) });
    await writer.appendIntelligenceEvent(e);
    await writer.appendIntelligenceEvent(event("new"));
    const row = (await legacy.query("SELECT * FROM product_intelligence_scores")).rows[0];
    assert.equal(Number(row.score), 8);
    assert.equal(Number(row.score_total), 8);
    assert.equal(row.signals.product_viewed, 8);
  } finally { await legacy.close(); }
});
