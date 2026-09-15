const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresStore } = require("../backend/db");
const { learnFromObservation, createDecision, executeDecision } = require("../backend/wip-mind");
const migration = require("../backend/migrations/wip-mind-contracts");
const outcomeMigration = require("../backend/migrations/intelligence-decision-outcomes");

let db;
let store;

before(async () => {
  db = new PGlite();
  for (const statement of [...migration.statements, ...outcomeMigration.statements]) await db.exec(statement);
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
  assert.equal(runtime.schemaVersion, "2026-09-16.wip-runtime-counts.v2");
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

test("commerce goals preserve a monotonic self-scoped transition history", async () => {
  const goalDb = new PGlite();
  const goalStore = createPostgresStore({
    databaseUrl: "postgres://isolated/goals",
    queryClient: { query: (sql, params) => goalDb.query(sql, params), connect: async () => ({ query: (sql, params) => goalDb.query(sql, params), release() {} }) }
  });
  try {
    await goalStore.init();
    await goalDb.query(
      `INSERT INTO users (username,password,phone_number,primary_category,role,created_at)
       VALUES ('buyer-1','hash','255700000001','wanawake-magauni','buyer',NOW()),
              ('seller-1','hash','255700000002','wanawake-magauni','seller',NOW())`
    );
    await goalDb.query(
      `INSERT INTO products (id,name,price,shop,whatsapp,image,uploaded_by,category,status,availability,created_at,updated_at)
       VALUES ('dress-1','White dress',50000,'seller-1','255700000002','dress.webp','seller-1','wanawake-magauni','approved','available',NOW(),NOW())`
    );
    await goalDb.query(
      `INSERT INTO intelligence_recommendations (
         recommendation_id,audience_type,audience_key,recommendation_type,entity_type,entity_key,
         score,reasons,metadata,status,model_version,generated_at,expires_at,updated_at
       ) VALUES ('rec-buyer-dress','person','buyer-1','similar_available','product','dress-1',
         90,'["exact_match"]'::jsonb,'{"privacy":"self-scoped"}'::jsonb,'active','test-v1',NOW(),NOW()+INTERVAL '1 day',NOW())`
    );
    await goalDb.query(
      `INSERT INTO intelligence_decisions (
         decision_id,schema_version,decision_type,subject_id,target_context,selected_action,priority,
         contributing_signals,confidence,policy_version,reason_codes,sponsored,created_at,expires_at,idempotency_key
       ) VALUES ('decision-buyer-dress','test-v1','recommendation','buyer-1','person_dashboard',
         'SURFACE_RECOMMENDATION',90,'[]'::jsonb,0.9,'test-policy','[]'::jsonb,FALSE,NOW(),NOW()+INTERVAL '1 day','recommendation:rec-buyer-dress')`
    );
    await goalDb.query(
      `INSERT INTO intelligence_action_results (
         action_id,schema_version,decision_id,status,started_at,completed_at,result_metadata,failure_reason
       ) VALUES ('action-buyer-dress','test-v1','decision-buyer-dress','EXECUTED',NOW(),NOW(),
         '{"outcomeType":"recommendation_delivery","businessOutcome":false}'::jsonb,'')`
    );
    const goal = await goalStore.upsertCommerceGoal({
      goalId: "goal-dress-1",
      userId: "buyer-1",
      productId: "dress-1",
      queryKey: "white-dress",
      category: "wanawake-magauni",
      metadata: { source: "demand_requested" }
    });
    assert.equal(goal.status, "looking");
    await goalStore.advanceCommerceGoalsForInteraction({
      goalId: goal.goalId, userId: "buyer-1", productId: "dress-1",
      toStatus: "matched", source: "recommendation_delivered",
      sourceEntityType: "recommendation", sourceEntityKey: "rec-1",
      metadata: { privacy: "self-scoped" }
    });
    await goalStore.advanceCommerceGoalsForInteraction({
      userId: "buyer-1", productId: "dress-1",
      toStatus: "contacted", source: "product_message",
      sourceEntityType: "message", sourceEntityKey: "message-1",
      metadata: { privacy: "self-scoped" }
    });
    await goalStore.advanceCommerceGoalsForInteraction({
      userId: "buyer-1", productId: "dress-1",
      toStatus: "ordered", source: "order_created",
      sourceEntityType: "order", sourceEntityKey: "order-1",
      metadata: { privacy: "self-scoped" }
    });
    assert.deepEqual(await goalStore.advanceCommerceGoalsForInteraction({
      userId: "buyer-1", toStatus: "completed", source: "invalid_unscoped_transition"
    }), []);
    const orderIntent = await goalStore.attributeIntelligenceDecisionOutcome({
      userId: "buyer-1", productId: "dress-1", outcomeType: "ordered",
      sourceEntityType: "order", sourceEntityKey: "order-1"
    });
    assert.equal(orderIntent.attributed, true);
    assert.equal(orderIntent.businessOutcome, false);
    assert.equal((await goalStore.attributeIntelligenceDecisionOutcome({
      userId: "buyer-1", productId: "dress-1", outcomeType: "ordered",
      sourceEntityType: "order", sourceEntityKey: "order-1"
    })).code, "duplicate_decision_outcome");
    assert.equal(await goalStore.completeCommerceGoalsForOrder("buyer-1", "dress-1", "order-1"), 1);
    const state = await goalDb.query("SELECT status,resolution FROM commerce_goals WHERE goal_id='goal-dress-1'");
    assert.deepEqual(state.rows[0], { status: "completed", resolution: "delivered_order" });
    const history = await goalDb.query(
      "SELECT from_status AS \"fromStatus\",to_status AS \"toStatus\",source FROM commerce_goal_transitions WHERE goal_id='goal-dress-1' ORDER BY occurred_at,transition_id"
    );
    assert.deepEqual(history.rows.map(row => row.toStatus), ["looking", "matched", "contacted", "ordered", "completed"]);
    assert.equal(history.rows.every(row => !JSON.stringify(row).includes("buyer-1")), true);
    const outcomes = await goalDb.query(
      `SELECT outcome_type AS "outcomeType",business_outcome AS "businessOutcome",attribution_model AS "attributionModel"
       FROM intelligence_decision_outcomes ORDER BY outcome_type`
    );
    assert.deepEqual(outcomes.rows, [
      { outcomeType: "delivered_order", businessOutcome: true, attributionModel: "last_touch_non_causal" },
      { outcomeType: "order_intent", businessOutcome: false, attributionModel: "last_touch_non_causal" }
    ]);
    const runtime = await goalStore.readWipRuntimeCounts();
    assert.equal(runtime.outcomes.total, 2);
    assert.equal(runtime.outcomes.businessOutcomes, 1);
    assert.equal(runtime.outcomes.attributionModel, "last_touch_non_causal");
  } finally {
    await goalDb.close();
  }
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
    assert.equal(opportunityRecommendation.governingPolicyVersion, "wip-governing-policy-v1");
    assert.deepEqual(opportunityRecommendation.governingReasonCodes, ["governing_policy_approved"]);
    assert.equal(Object.hasOwn(opportunityRecommendation, "targetSellerScore"), false);
    assert.equal(Object.hasOwn(opportunityRecommendation, "targetSellerId"), false);
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
    const actionSemantics = await freshDb.query(
      "SELECT result_metadata AS metadata FROM intelligence_action_results WHERE status='EXECUTED'"
    );
    actionSemantics.rows.forEach((row) => {
      assert.equal(row.metadata.outcomeType, "recommendation_delivery");
      assert.equal(row.metadata.businessOutcome, false);
      assert.equal(row.metadata.policyVersion, "wip-governing-policy-v1");
    });
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
