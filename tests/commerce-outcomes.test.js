const assert = require("node:assert/strict");
const { test, before, beforeEach, after } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const migration = require("../backend/migrations/commerce-outcomes");
const { createPostgresStore } = require("../backend/db");

let db;
let store;
const audience = "a".repeat(64);
const otherAudience = "b".repeat(64);

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE orders (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, seller_username TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), status TEXT NOT NULL DEFAULT 'placed',
      payment_status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE supply_responses (response_id TEXT PRIMARY KEY, seller_id TEXT, status TEXT DEFAULT 'active', action_type TEXT DEFAULT 'create_product');
    CREATE TABLE rediscovery_eligibility (eligibility_id TEXT PRIMARY KEY, supply_response_id TEXT,
      product_id TEXT, audience_type TEXT DEFAULT 'user', audience_key TEXT, experiment_key TEXT DEFAULT 'commerce_rediscovery_v1',
      experiment_arm TEXT, assigned_at TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 hour',
      eligible_at TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 hour', expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 day');
    CREATE TABLE feed_exposures (exposure_id TEXT PRIMARY KEY, supply_response_id TEXT, audience_type TEXT,
      audience_key TEXT, shown_at TIMESTAMPTZ);
    CREATE TABLE feed_exposure_outcomes (exposure_id TEXT, outcome_type TEXT, occurred_at TIMESTAMPTZ);
    CREATE TABLE payment_refund_outbox (id TEXT PRIMARY KEY, order_id TEXT, status TEXT);
    CREATE TABLE schema_migrations (migration_id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ);
  `);
  for (const sql of migration.statements) await db.exec(sql);
  await db.query("INSERT INTO schema_migrations VALUES ($1, NOW() - INTERVAL '30 days')", [migration.id]);
  store = createPostgresStore({ databaseUrl: "postgres://isolated/test", queryClient: db });
});

beforeEach(async () => {
  await db.exec("TRUNCATE orders, commerce_order_outcomes, supply_responses, rediscovery_eligibility, feed_exposures, feed_exposure_outcomes, payment_refund_outbox CASCADE");
});
after(async () => { await db?.close(); });

async function assign(id = "eligible", arm = "control", key = audience, seller = "seller", product = "product") {
  await db.query("INSERT INTO supply_responses (response_id, seller_id) VALUES ($1, $2)", [id, seller]);
  await db.query(`INSERT INTO rediscovery_eligibility
    (eligibility_id, supply_response_id, product_id, audience_key, experiment_arm)
    VALUES ($1, $1, $2, $3, $4)`, [id, product, key, arm]);
}
async function order(id = "order", key = audience, seller = "seller", product = "product", enabled = true) {
  await db.query(`INSERT INTO orders (id, product_id, seller_username, commerce_audience_key, commerce_measurement_enabled)
    VALUES ($1, $2, $3, $4, $5)`, [id, product, seller, key, enabled]);
}
async function milestones(id = "order") {
  return (await db.query("SELECT * FROM commerce_order_outcomes WHERE order_id = $1 ORDER BY outcome_type", [id])).rows;
}

test("real PostgreSQL triggers observe both experiment arms without any exposure", async () => {
  await assign("control", "control");
  await assign("treatment", "treatment", otherAudience);
  await order("control-order");
  await order("treatment-order", otherAudience);
  await db.exec("UPDATE orders SET payment_status = 'paid', status = 'paid'");
  await db.exec("UPDATE orders SET status = 'delivered'");
  const metrics = await store.readCommerceExperimentMetrics("seller");
  for (const arm of ["control", "treatment"]) {
    assert.equal(metrics.arms[arm].exposedAudience, 0);
    assert.equal(metrics.arms[arm].orderedAudience, 1);
    assert.equal(metrics.arms[arm].paidAudience, 1);
    assert.equal(metrics.arms[arm].deliveredAudience, 1);
  }
  assert.equal(metrics.status, "collecting");
  assert.equal(metrics.absoluteOrderLift, null);
  assert.equal(metrics.causalClaim, false);
});

test("pending intent, duplicate payment and confirmed refund remain separate milestones", async () => {
  await assign();
  await order();
  assert.deepEqual((await milestones()).map(row => row.outcome_type), ["created"]);
  await db.exec("UPDATE orders SET payment_status = 'paid', status = 'paid'");
  await db.exec("UPDATE orders SET payment_status = 'paid', status = 'paid'");
  assert.deepEqual((await milestones()).map(row => row.outcome_type), ["created", "paid"]);
  await db.exec("UPDATE orders SET status = 'cancelled'");
  await db.exec("INSERT INTO payment_refund_outbox VALUES ('refund', 'order', 'submitted')");
  assert.equal((await milestones()).length, 3);
  await db.exec("UPDATE payment_refund_outbox SET status = 'confirmed'");
  await db.exec("UPDATE payment_refund_outbox SET status = 'confirmed'");
  await db.exec("UPDATE orders SET payment_status = 'refunded'");
  assert.deepEqual((await milestones()).map(row => row.outcome_type), ["cancelled", "created", "paid", "refunded"]);
  const metrics = await store.readCommerceOutcomeMetrics("seller");
  assert.equal(metrics.paidOrders, 1);
  assert.equal(metrics.cancelledOrders, 1);
  assert.equal(metrics.refundedOrders, 1);
  assert.equal(metrics.retainedPaidOrders, 0);
});

test("wrong buyer, product, seller and expired or future assignments cannot claim an order", async () => {
  await assign();
  await order("wrong-buyer", otherAudience);
  await order("wrong-product", audience, "seller", "different");
  await order("wrong-seller", audience, "different");
  await db.exec("UPDATE rediscovery_eligibility SET expires_at = NOW() - INTERVAL '1 minute'");
  await order("expired");
  await db.exec("UPDATE rediscovery_eligibility SET expires_at = NOW() + INTERVAL '2 days', assigned_at = NOW() + INTERVAL '1 hour'");
  await order("future");
  await db.exec("UPDATE rediscovery_eligibility SET assigned_at = NOW() - INTERVAL '8 days'");
  await order("outside-window");
  const rows = (await db.query("SELECT eligibility_id FROM commerce_order_outcomes")).rows;
  assert.equal(rows.length, 6);
  assert.equal(rows.every(row => row.eligibility_id === null), true);
});

test("assignment is frozen at order creation and cannot move on delayed payment", async () => {
  await assign("original", "control");
  await order();
  await assign("later", "treatment");
  await db.exec("UPDATE rediscovery_eligibility SET assigned_at = NOW(), eligible_at = NOW() WHERE eligibility_id = 'later'");
  await db.exec("UPDATE supply_responses SET status = 'withdrawn'");
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  const rows = await milestones();
  assert.equal(rows.every(row => row.eligibility_id === "original" && row.experiment_arm === "control"), true);
  const metrics = await store.readCommerceExperimentMetrics("seller");
  assert.equal(metrics.arms.control.paidAudience, 1);
});

test("transaction rollback removes milestones and retries do not lose committed history", async () => {
  await db.exec("BEGIN");
  await order();
  await db.exec("ROLLBACK");
  assert.equal((await milestones()).length, 0);
  await order();
  await db.exec("BEGIN");
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  await db.exec("ROLLBACK");
  assert.deepEqual((await milestones()).map(row => row.outcome_type), ["created"]);
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  assert.deepEqual((await milestones()).map(row => row.outcome_type), ["created", "paid"]);
});

test("legacy orders are not fabricated into new cohorts; unassigned orders still count", async () => {
  await order("legacy", audience, "seller", "product", false);
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  assert.equal((await milestones("legacy")).length, 0);
  await order("unassigned");
  assert.equal((await milestones("unassigned"))[0].eligibility_id, null);
  const metrics = await store.readCommerceOutcomeMetrics("seller");
  assert.equal(metrics.trackedOrders, 1);
  assert.equal(metrics.experimentLinkedOrders, 0);
  assert.equal(metrics.paidOrders, 0);
});

test("observation horizon excludes delayed outcomes without deleting durable lifecycle facts", async () => {
  await assign();
  await order();
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  await db.exec("UPDATE commerce_order_outcomes SET occurred_at = observation_ends_at + INTERVAL '1 second' WHERE outcome_type = 'paid'");
  const experiment = await store.readCommerceExperimentMetrics("seller");
  assert.equal(experiment.arms.control.orderedAudience, 1);
  assert.equal(experiment.arms.control.paidAudience, 0);
  assert.equal((await store.readCommerceOutcomeMetrics("seller")).paidOrders, 1);
});

test("seller-scoped aggregates never return audience keys or another seller's milestones", async () => {
  await order();
  await order("another", audience, "other-seller");
  await db.exec("UPDATE orders SET payment_status = 'paid' WHERE id = 'another'");
  const own = await store.readCommerceOutcomeMetrics("seller");
  assert.equal(own.trackedOrders, 1);
  assert.equal(own.paidOrders, 0);
  assert.equal(JSON.stringify(own).includes(audience), false);
  assert.equal((await store.readCommerceOutcomeMetrics("")).trackedOrders, 2);
});

test("guest and pre-capture assignments are excluded instead of fabricating zero-purchase control data", async () => {
  await assign("guest", "control");
  await db.exec("UPDATE rediscovery_eligibility SET audience_type = 'session'");
  await assign("legacy", "treatment", otherAudience);
  await db.exec("UPDATE rediscovery_eligibility SET assigned_at = NOW() - INTERVAL '31 days' WHERE eligibility_id = 'legacy'");
  await order();
  const metrics = await store.readCommerceExperimentMetrics("seller");
  assert.equal(metrics.arms.control.assignedAudience, 0);
  assert.equal(metrics.arms.treatment.assignedAudience, 0);
  assert.equal((await milestones())[0].eligibility_id, null);
});

test("an exposure ordered event is not authoritative proof of an order or payment", async () => {
  await assign();
  await db.query("INSERT INTO feed_exposures VALUES ('exposure', 'eligible', 'user', $1, NOW())", [audience]);
  await db.exec("INSERT INTO feed_exposure_outcomes VALUES ('exposure', 'ordered', NOW())");
  const metrics = await store.readCommerceExperimentMetrics("seller");
  assert.equal(metrics.arms.control.exposedAudience, 1);
  assert.equal(metrics.arms.control.orderedAudience, 0);
  assert.equal(metrics.arms.control.paidAudience, 0);
});

test("database reopen preserves assignment, triggers and idempotent payment milestones", async () => {
  await assign();
  await order();
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  const snapshot = await db.dumpDataDir();
  await db.close();
  db = new PGlite({ loadDataDir: snapshot });
  store = createPostgresStore({ databaseUrl: "postgres://isolated/test", queryClient: db });
  await db.exec("UPDATE orders SET payment_status = 'paid'");
  await db.exec("UPDATE orders SET status = 'delivered'");
  assert.deepEqual((await milestones()).map(row => row.outcome_type), ["created", "delivered", "paid"]);
  assert.equal((await store.readCommerceExperimentMetrics("seller")).arms.control.paidAudience, 1);
});

test("order insertion binds only trusted audience context, never a field in the order payload", async () => {
  const calls = [];
  const mocked = createPostgresStore({ databaseUrl: "postgres://isolated/test", queryClient: {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("FROM products WHERE id") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "p", price: 20, uploadedBy: "seller", status: "approved", availability: "available" }], rowCount: 1 };
      }
      if (sql.includes("SELECT 1 FROM orders")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    }
  } });
  const payload = { id: "o", productId: "p", price: 20, buyerUsername: "buyer", sellerUsername: "seller", audienceKey: otherAudience };
  await mocked.createCommerceOrder(payload, { id: "pay", transactionReference: "ref" }, null, { audienceKey: audience });
  assert.equal(calls.find(call => call.sql.includes("INSERT INTO orders")).params[23], audience);
  calls.length = 0;
  await mocked.createCommerceOrder(payload, { id: "pay2", transactionReference: "ref2" });
  assert.equal(calls.find(call => call.sql.includes("INSERT INTO orders")).params[23], "");
});
