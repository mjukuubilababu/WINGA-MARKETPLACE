const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresStore } = require("../backend/db");
const { learnFromObservation, createDecision, executeDecision } = require("../backend/wip-mind");
const migration = require("../backend/migrations/wip-mind-contracts");

let db;
let store;

before(async () => {
  db = new PGlite();
  for (const statement of migration.statements) await db.exec(statement);
  store = createPostgresStore({
    databaseUrl: "postgres://isolated/wip",
    queryClient: { query: (sql, params) => db.query(sql, params), connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }) }
  });
});

after(async () => db?.close());

test("WIP stores learned signals idempotently and reports layer health", async () => {
  const learned = learnFromObservation({
    eventId: "event-storage-1", eventType: "demand_requested", timestamp: new Date().toISOString(),
    productId: "product-1", sellerId: "seller-1", buyerId: "person-1", location: "Mwanza",
    quality: { confidence: 0.8 }
  });
  const first = await store.appendIntelligenceSignals(learned.signals);
  const replay = await store.appendIntelligenceSignals(learned.signals);
  assert.ok(first.inserted > 0);
  assert.equal(replay.inserted, 0);
  const count = await db.query("SELECT COUNT(*)::int AS count FROM intelligence_signals");
  assert.equal(Number(count.rows[0].count), first.inserted);
  const health = await store.readWipMindHealth();
  assert.equal(health.activeSignals, first.inserted);
  assert.equal(health.signalsGenerated, first.inserted);
  assert.ok(health.healthyLearners > 0);
});

test("WIP persists traceable decisions and idempotent action outcomes", async () => {
  const decision = createDecision({
    decisionType: "recommend_product", subjectId: "product-1", targetContext: "person_dashboard",
    selectedAction: "surface_recommendation", idempotencyKey: "storage-decision-1",
    signals: [{ signalId: "sig-storage", signalName: "demand_evidence", value: 1, confidence: 0.8, validUntil: new Date(Date.now() + 60_000).toISOString() }]
  });
  await db.query(
    `INSERT INTO intelligence_decisions (
       decision_id,schema_version,decision_type,subject_id,target_context,selected_action,priority,
       contributing_signals,confidence,policy_version,reason_codes,sponsored,created_at,expires_at,idempotency_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,$15)`,
    [decision.decisionId,decision.schemaVersion,decision.decisionType,decision.subjectId,decision.targetContext,
      decision.selectedAction,decision.priority,JSON.stringify(decision.contributingSignals),decision.confidence,
      decision.policyVersion,JSON.stringify(decision.reasonCodes),decision.sponsored,decision.createdAt,decision.expiresAt,decision.idempotencyKey]
  );
  const action = executeDecision(decision, {});
  const params = [action.actionId,action.schemaVersion,action.decisionId,action.status,action.startedAt,action.completedAt,
    JSON.stringify(action.resultMetadata),action.failureReason];
  const sql = `INSERT INTO intelligence_action_results (
    action_id,schema_version,decision_id,status,started_at,completed_at,result_metadata,failure_reason
  ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (action_id) DO NOTHING`;
  await db.query(sql, params);
  await db.query(sql, params);
  const result = await db.query("SELECT status,COUNT(*)::int AS count FROM intelligence_action_results GROUP BY status");
  assert.deepEqual(result.rows.map(row => ({ status: row.status, count: Number(row.count) })), [{ status: "EXECUTED", count: 1 }]);
});

test("WIP runtime counts come from primary storage and expose aggregate dimensions only", async () => {
  const runtime = await store.readWipRuntimeCounts();
  assert.equal(runtime.schemaVersion, "2026-09-15.wip-runtime-counts.v1");
  assert.equal(runtime.privacy, "ops-aggregate-only");
  assert.equal(runtime.source, "postgres-primary");
  assert.ok(runtime.signals.total > 0);
  assert.ok(runtime.decisions.total > 0);
  assert.equal(runtime.actions.byStatus.EXECUTED, 1);
  assert.ok(runtime.signals.byIntelligence.some(entry => entry.intelligenceType === "demand"));
  assert.ok(runtime.decisions.byType.some(entry => entry.decisionType === "RECOMMEND_PRODUCT"));
  assert.equal(JSON.stringify(runtime).includes("product-1"), false);
  assert.equal(JSON.stringify(runtime).includes("person-1"), false);
});

test("learner failure opens an isolated circuit without deleting learned signals", async () => {
  await store.recordIntelligenceLearnerFailure("style", Object.assign(new Error("failed"), { code: "style_timeout" }), { circuitSeconds: 60 });
  const health = await store.readWipMindHealth();
  assert.equal(health.isolatedLearners, 1);
  assert.equal(health.learnerFailures, 1);
  assert.ok(health.activeSignals > 0);
});

test("fresh Winga database boots WIP and closes learn decide act with real commerce evidence", async () => {
  const freshDb = new PGlite();
  const freshStore = createPostgresStore({
    databaseUrl: "postgres://isolated/wip-full",
    queryClient: { query: (sql, params) => freshDb.query(sql, params), connect: async () => ({ query: (sql, params) => freshDb.query(sql, params), release() {} }) }
  });
  try {
    await freshStore.init();
    await freshDb.query(
      `INSERT INTO users (username,password,phone_number,primary_category,role,created_at)
       VALUES ('seller-1','hash','255700000099','wanawake-magauni','seller',NOW())`
    );
    await freshDb.query(
      `INSERT INTO products (id,name,price,shop,whatsapp,image,uploaded_by,category,status,availability,created_at,updated_at)
       VALUES ('product-1','White dress',50000,'seller-1','255700000099','image.webp','seller-1','wanawake-magauni','approved','sold_out',NOW(),NOW())`
    );
    await freshDb.query(
      `INSERT INTO product_demand_summaries (
         product_id,seller_id,total_demand,waiting_users,restock_interest,demand_score,first_demand_at,last_demand_at
       ) VALUES ('product-1','seller-1',8,5,3,25,NOW(),NOW())`
    );
    await freshStore.upsertCommerceOpportunities([{
      opportunityId: "opp-search-white-dress",
      type: "zero_result",
      source: "search_gap_aggregate",
      queryKey: "white-maxi-dress",
      productId: "",
      category: "wanawake-magauni",
      region: "Mwanza",
      color: "white",
      size: "M",
      demandScore: 18,
      supplyScore: 0,
      evidenceCount: 6,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      metadata: { privacy: "aggregate-only" }
    }]);
    const refresh = await freshStore.refreshIntelligenceDecisionOutputs({ windowDays: 14 });
    assert.equal(refresh.modelVersion, "deterministic-commerce-v1");
    assert.ok(refresh.signals >= 3);
    assert.equal(refresh.opportunityRecommendations, 1);
    assert.equal(refresh.decisions, 2);
    const recommendations = await freshStore.readIntelligenceRecommendations("seller", "seller-1", 4);
    assert.equal(recommendations.length, 2);
    const opportunityRecommendation = recommendations.find(entry => entry.recommendationType === "market_opportunity");
    assert.equal(opportunityRecommendation.entityType, "opportunity");
    assert.equal(opportunityRecommendation.entityKey, "opp-search-white-dress");
    assert.equal(opportunityRecommendation.metadata.privacy, "aggregate-only");
    assert.equal(opportunityRecommendation.policyVersion, "wip-conscious-policy-v1");
    assert.ok(opportunityRecommendation.decisionConfidence > 0);
    const feedbackJobs = await freshStore.claimIntelligenceQueueBatch({ limit: 5, workerId: "wip-feedback-test" });
    assert.equal(feedbackJobs.length, 2);
    const productFeedback = feedbackJobs.find(job => job.event.productId === "product-1");
    assert.equal(productFeedback.event.eventType, "recommendation_surfaced");
    await Promise.all(feedbackJobs.map(job => freshStore.appendIntelligenceEvent(job.event)));
    const feedbackLearning = learnFromObservation(productFeedback.event);
    const feedbackSignals = await freshStore.appendIntelligenceSignals(feedbackLearning.signals);
    await Promise.all(feedbackJobs.map(job => freshStore.completeIntelligenceQueueItem(job.queueId)));
    assert.ok(feedbackSignals.inserted >= 2);
    const mindHealth = await freshStore.readWipMindHealth();
    assert.ok(mindHealth.activeSignals >= 2);
    assert.equal(mindHealth.activeDecisions, 2);
    assert.equal(mindHealth.executedActions, 2);
    await freshStore.recordSellerOpportunityDecision({
      sellerId: "seller-1",
      opportunityId: "opp-search-white-dress",
      actionType: "dismiss"
    });
    const afterDismiss = await freshStore.readIntelligenceRecommendations("seller", "seller-1", 4);
    assert.equal(afterDismiss.some(entry => entry.recommendationType === "market_opportunity"), false);
    const migrationRow = await freshDb.query("SELECT 1 FROM schema_migrations WHERE migration_id='2026091513_wip_mind_contracts'");
    assert.equal(migrationRow.rowCount, 1);
  } finally {
    await freshDb.close();
  }
});
