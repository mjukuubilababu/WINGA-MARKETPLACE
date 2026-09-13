const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresStore } = require("../backend/db");
const { MIGRATIONS } = require("../backend/migrations");
const {
  buildAudienceKey,
  buildCommerceOpportunities,
  normalizeCommerceOpportunity
} = require("../backend/commerce-opportunity");

test("commerce opportunities have stable identities and reject weak signals", () => {
  const now = new Date("2026-09-13T10:00:00.000Z");
  const candidate = {
    type: "zero_result",
    source: "search_gap_aggregate",
    queryKey: "white-maxi-dress",
    category: "wanawake-magauni",
    region: "Mwanza",
    demandScore: 8,
    supplyScore: 0,
    evidenceCount: 4
  };
  const first = normalizeCommerceOpportunity(candidate, { now });
  const second = normalizeCommerceOpportunity(candidate, { now: new Date("2026-09-14T10:00:00.000Z") });
  const weak = normalizeCommerceOpportunity({ ...candidate, evidenceCount: 1 }, { now });

  assert.ok(first.opportunityId.startsWith("opp_"));
  assert.equal(first.opportunityId, second.opportunityId);
  assert.equal(first.region, "mwanza");
  assert.equal(weak, null);
  assert.equal(buildCommerceOpportunities([candidate, candidate], { now }).length, 1);
});

test("commerce audience identity is deterministic, secret-bound, and non-reversible", () => {
  const first = buildAudienceKey("session", "anonymous-device-42", "test-secret-at-least-sixteen-characters");
  const second = buildAudienceKey("session", "anonymous-device-42", "test-secret-at-least-sixteen-characters");
  const user = buildAudienceKey("user", "anonymous-device-42", "test-secret-at-least-sixteen-characters");

  assert.equal(first, second);
  assert.notEqual(first, user);
  assert.equal(first.includes("anonymous-device-42"), false);
  assert.equal(first.length, 64);
});

test("white maxi dress Mwanza closes opportunity to attributed order deterministically", async () => {
  const calls = [];
  const opportunity = buildCommerceOpportunities([{
    type: "zero_result",
    source: "search_gap_aggregate",
    queryKey: "white-maxi-dress",
    category: "wanawake-magauni",
    region: "Mwanza",
    demandScore: 9,
    supplyScore: 0,
    evidenceCount: 5,
    metadata: { evidenceSource: "search_gap_aggregate", windowDays: 30 }
  }], { now: new Date("2026-09-13T10:00:00.000Z") })[0];
  const audienceKey = buildAudienceKey("session", "mwanza-buyer-session", "test-secret-at-least-sixteen-characters");
  let opportunityPersisted = false;
  let responsePersisted = false;
  let eligibilityPersisted = false;
  let exposurePersisted = false;
  let outcomePersisted = false;
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO commerce_opportunities")) {
        opportunityPersisted = true;
        return { rows: [{ opportunity_id: opportunity.opportunityId }], rowCount: 1 };
      }
      if (sql.includes('SELECT o.opportunity_id AS "opportunityId"')) {
        return { rows: [{
          ...opportunity,
          responseCount: 0,
          sellerResponded: false,
          expiresAt: opportunity.expiresAt
        }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE commerce_opportunities SET status = 'expired'")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM products WHERE id = $1 AND uploaded_by = $2 FOR UPDATE")) {
        return { rows: [{ id: "product-white-maxi", name: "White maxi dress", category: "wanawake-magauni", uploadedBy: "seller-mwanza", availability: "available" }], rowCount: 1 };
      }
      if (sql.includes("FROM commerce_opportunities o") && sql.includes("LIMIT 1 FOR UPDATE")) {
        return { rows: [{
          opportunity_id: opportunity.opportunityId,
          query_key: opportunity.queryKey,
          product_id: "",
          category: opportunity.category,
          region: opportunity.region,
          expires_at: opportunity.expiresAt,
          demand_score: opportunity.demandScore
        }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO supply_responses")) {
        responsePersisted = true;
        return { rows: [{ responseId: "resp-white-maxi" }], rowCount: 1 };
      }
      if (sql.includes("SELECT DISTINCT audience_type") && sql.includes("FROM demand_events")) {
        return { rows: [{ audienceType: "session", audienceKey, reasonCode: "search_gap" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO rediscovery_eligibility")) {
        eligibilityPersisted = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("WITH eligible AS") && sql.includes("FROM rediscovery_eligibility re")) {
        return { rows: [{
          id: "product-white-maxi",
          name: "White maxi dress",
          uploadedBy: "seller-mwanza",
          category: "wanawake-magauni",
          status: "approved",
          availability: "available",
          createdAt: "2026-09-13T10:04:00.000Z",
          updatedAt: "2026-09-13T10:04:00.000Z",
          opportunityId: opportunity.opportunityId,
          supplyResponseId: "resp-white-maxi",
          rediscoveryReasonCodes: ["search_gap"],
          intelligenceScore: 0,
          intelligenceSignals: {},
          sellerIntelligenceScore: 0
        }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO regional_supply_snapshots")) {
        return { rows: [{ region: "mwanza", category: "wanawake-magauni", productCount: 1, activeSellerCount: 1, availableInventoryIndicator: 1, soldOutCount: 0 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO feed_exposures")) {
        exposurePersisted = true;
        return { rows: [{ exposureId: "exp-white-maxi", opportunityId: opportunity.opportunityId, supplyResponseId: "resp-white-maxi" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE rediscovery_eligibility") && sql.includes("exposed_at")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM feed_exposures") && sql.includes("ORDER BY shown_at DESC")) {
        return { rows: [{ exposureId: "exp-white-maxi", supplyResponseId: "resp-white-maxi" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO feed_exposure_outcomes")) {
        outcomePersisted = true;
        return { rows: [{ outcomeId: "out-white-maxi" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE rediscovery_eligibility") && sql.includes("engaged_at")) return { rows: [], rowCount: 1 };
      if (sql.includes("COUNT(DISTINCT o.opportunity_id)")) {
        return { rows: [{ opportunitiesCreated: 1, opportunitiesResponded: 1, supplyResponses: 1, supplyCreated: 1, exposures: 1, detailViews: 0, messages: 0, orders: 1, eligibleRequesters: 1, requestersSatisfied: 1, regionalGapsReduced: 0 }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE commerce_opportunities SET status = 'responded'")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  await store.upsertCommerceOpportunities([opportunity]);
  const sellerOpportunities = await store.readSellerCommerceOpportunities("seller-mwanza", 20);
  const response = await store.recordSupplyResponse({
    sellerId: "seller-mwanza",
    actionType: "create_product",
    productId: "product-white-maxi",
    region: "Mwanza"
  });
  const exposure = await store.recordFeedExposure({
    exposureId: "exp-white-maxi",
    audienceType: "session",
    audienceKey,
    productId: "product-white-maxi",
    sellerId: "seller-mwanza",
    moduleId: "home_feed",
    rankPosition: 3,
    rankingSource: "rediscovery",
    reasonCodes: ["search_gap"],
    opportunityId: opportunity.opportunityId,
    supplyResponseId: response.responseId,
    shownAt: "2026-09-13T10:05:00.000Z",
    region: "Mwanza"
  });
  const rediscoveryItems = await store.readRediscoveryProducts({
    audienceType: "session",
    audienceKey,
    limit: 8
  });
  const outcome = await store.attributeFeedExposureOutcome({
    audienceType: "session",
    audienceKey,
    productId: "product-white-maxi",
    outcomeType: "ordered",
    orderId: "order-white-maxi"
  });
  const metrics = await store.readCommerceLoopMetrics("seller-mwanza");

  assert.equal(opportunityPersisted, true, "stage 1-2: search gap must create a durable opportunity");
  assert.equal(sellerOpportunities[0].opportunityId, opportunity.opportunityId, "stage 3: seller must see the eligible aggregate opportunity");
  assert.equal(responsePersisted && response.linked, true, "stage 4-5: matching supply must retain opportunity attribution");
  assert.equal(eligibilityPersisted && response.eligibleAudienceCount, 1, "stage 7: original audience must become rediscovery eligible");
  assert.equal(rediscoveryItems[0].id, "product-white-maxi", "stage 8: eligible supply must be delivered back to the original audience");
  assert.deepEqual(rediscoveryItems[0].rediscoveryReasonCodes, ["search_gap"], "rediscovery must preserve its privacy-safe reason code");
  assert.equal(exposurePersisted && exposure.recorded, true, "stage 6-8: feed candidate must be recorded only when shown");
  assert.equal(outcomePersisted && outcome.attributed, true, "stage 9-10: order must attribute to exposure and supply response");
  assert.equal(metrics.orderRate, 1, "closed-loop metrics must report the attributed order");
  assert.equal(metrics.requesterSatisfiedRate, 1, "restock requester satisfaction must be measurable");
  assert.equal(calls.some((call) => call.text.includes("LEFT JOIN products dp")), true, "eligibility must preserve sparse product evidence");
});

test("seller dismissal is private to that seller and does not create supply", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT opportunity_id") && sql.includes("FROM commerce_opportunities")) {
        return { rows: [{ opportunity_id: "opp-private-dismiss" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO supply_responses")) {
        return { rows: [{ responseId: "resp-private-dismiss" }], rowCount: 1 };
      }
      if (sql.includes('SELECT o.opportunity_id AS "opportunityId"')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.recordSellerOpportunityDecision({
    sellerId: "seller-one",
    opportunityId: "opp-private-dismiss",
    actionType: "dismiss"
  });
  await store.readSellerCommerceOpportunities("seller-one", 20);

  assert.equal(result.recorded, true);
  assert.equal(result.actionType, "dismiss");
  assert.equal(calls.some((call) => call.text.includes("VALUES ($1, $2, $3, $4, NULL")), true, "dismissal must not claim a product or supply");
  assert.equal(calls.some((call) => call.text.includes("HAVING NOT COALESCE(BOOL_OR(sr.seller_id = $1")), true, "seller reads must suppress only that seller's dismissed opportunities");
  assert.equal(calls.some((call) => call.text.includes("UPDATE commerce_opportunities SET status = 'dismissed'")), false, "one seller must not dismiss a global opportunity");
});

test("commerce exposure rate measures distinct supply reached rather than repeat impressions", async () => {
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: {
      async query(sql, params) {
        assert.deepEqual(params, ["seller-one"]);
        assert.match(sql, /LEFT JOIN supply_responses sr[\s\S]*?AND sr\.action_type NOT IN \('ignore', 'dismiss'\)/);
        assert.match(sql, /COUNT\(DISTINCT sr\.response_id\) FILTER \(WHERE sr\.product_id IS NOT NULL AND fe\.exposure_id IS NOT NULL\)::int AS "supplyExposed"/);
        return { rows: [{ opportunitiesCreated: 4, opportunitiesResponded: 2,
          supplyResponses: 3, supplyCreated: 3, supplyExposed: 2,
          exposures: 40, detailViews: 10, messages: 4, orders: 2,
          eligibleRequesters: 0, requestersSatisfied: 0 }] };
      }
    }
  });
  const metrics = await store.readCommerceLoopMetrics("seller-one");
  assert.equal(metrics.buyerExposureRate, 0.6667);
  assert.equal(metrics.exposures, 40, "repeat impressions remain available as a count");
  assert.equal(metrics.sellerResponseRate, 0.5);
  assert.equal(metrics.orderRate, 0.05);
  assert.equal(metrics.requesterSatisfiedRate, 0);
});

test("commerce rates stay finite when no opportunities have supply or exposure", async () => {
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { async query() { return { rows: [{
      opportunitiesCreated: 2, opportunitiesResponded: 0, supplyResponses: 0,
      supplyCreated: 0, supplyExposed: 0, exposures: 0
    }] }; } }
  });
  const metrics = await store.readCommerceLoopMetrics();
  for (const [key, value] of Object.entries(metrics)) {
    if (key.endsWith("Rate")) assert.equal(value, 0, key);
  }
});

test("commerce learning migration contains durable privacy-safe loop tables", () => {
  const migration = MIGRATIONS.find((item) => item.id === "2026091301_commerce_learning_loop");
  const sql = migration.statements.join("\n");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS commerce_opportunities/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS supply_responses/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rediscovery_eligibility/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS feed_exposures/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS feed_exposure_outcomes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS regional_supply_snapshots/);
  assert.match(sql, /audience_key TEXT NOT NULL DEFAULT ''/);
});
