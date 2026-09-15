const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_REGISTRY,
  createIntelligenceRegistry,
  normalizeObservation,
  learnFromObservation,
  createDecision,
  evaluateRecommendationPolicy,
  executeDecision
} = require("../backend/wip-mind");

const NOW = "2026-09-15T18:00:00.000Z";

function event(overrides = {}) {
  return {
    eventId: "intel_observation_1",
    eventType: "demand_requested",
    timestamp: NOW,
    productId: "product-1",
    sellerId: "seller-1",
    buyerId: "person-1",
    sessionId: "session-1",
    feedContext: "home",
    location: "Dar es Salaam",
    locale: "sw-TZ",
    metadata: { privateMessage: "must not propagate" },
    quality: { confidence: 0.84 },
    schemaVersion: "canonical-event-v1",
    ...overrides
  };
}

test("registry declares all twenty learners without granting application control", () => {
  assert.equal(DEFAULT_REGISTRY.list().length, 20);
  DEFAULT_REGISTRY.list().forEach(entry => {
    assert.ok(entry.intelligenceId);
    assert.ok(entry.version);
    assert.ok(entry.owner);
    assert.ok(entry.inputEventTypes.length);
    assert.ok(entry.outputSignalTypes.length);
    assert.ok(entry.ttlMs >= 60_000);
    assert.equal(Object.hasOwn(entry, "action"), false);
  });
  const registry = createIntelligenceRegistry([]);
  registry.register({ intelligenceId: "future", inputEventTypes: ["future_event"], outputSignalTypes: ["future_signal"] });
  assert.throws(() => registry.register({ intelligenceId: "future" }), /unique intelligenceId/);
});

test("canonical event becomes a minimized observation and scoped expiring signals", () => {
  const learned = learnFromObservation(event(), { now: () => new Date(NOW) });
  assert.equal(learned.observation.observationId, "intel_observation_1");
  assert.deepEqual(learned.observation.metadata, {});
  assert.ok(learned.signals.length >= 3);
  learned.signals.forEach(signal => {
    assert.equal(signal.observedFrom[0], learned.observation.observationId);
    assert.equal(signal.confidence, 0.84);
    assert.equal(signal.geographicScope.level, "region");
    assert.equal(signal.geographicScope.value, "Dar es Salaam");
    assert.ok(new Date(signal.validUntil) > new Date(signal.validFrom));
    assert.equal(Object.hasOwn(signal, "action"), false);
  });
});

test("regional evidence stays regional and cannot silently become global", () => {
  const observation = normalizeObservation(event());
  assert.equal(observation.region, "Dar es Salaam");
  const { signals } = learnFromObservation(event(), { now: () => new Date(NOW) });
  assert.equal(signals.some(signal => signal.geographicScope?.value === "global"), false);
});

test("conscious mind rejects stale evidence and resolves feed fatigue conflicts", () => {
  const freshSignal = {
    signalId: "sig_style",
    signalName: "style_affinity",
    value: 0.9,
    confidence: 0.9,
    validUntil: "2026-09-16T18:00:00.000Z"
  };
  const fatigueSignal = {
    signalId: "sig_fatigue",
    signalName: "feed_fatigue",
    value: 0.95,
    confidence: 0.95,
    validUntil: "2026-09-16T18:00:00.000Z"
  };
  const staleSignal = { ...freshSignal, signalId: "sig_stale", validUntil: "2026-09-14T18:00:00.000Z" };
  const decision = createDecision({
    decisionType: "rank_feed_candidate",
    subjectId: "product-1",
    targetContext: "home",
    selectedAction: "rank_feed_candidate",
    signals: [freshSignal, fatigueSignal, staleSignal],
    idempotencyKey: "feed:person-1:product-1"
  }, { now: () => new Date(NOW) });
  assert.equal(decision.selectedAction, "NO_ACTION");
  assert.deepEqual(decision.contributingSignals, ["sig_style", "sig_fatigue"]);
  assert.ok(decision.reasonCodes.includes("fatigue_policy"));
  assert.equal(decision.decisionId, createDecision({
    decisionType: "rank_feed_candidate", subjectId: "product-1", targetContext: "home",
    selectedAction: "rank_feed_candidate", signals: [freshSignal], idempotencyKey: "feed:person-1:product-1"
  }, { now: () => new Date(NOW) }).decisionId);
});

test("executive mind validates expiry permission target and duplicate execution", () => {
  const decision = createDecision({
    decisionType: "recommend_product",
    subjectId: "product-1",
    targetContext: "seller_dashboard",
    selectedAction: "surface_recommendation",
    signals: [{ signalId: "sig_1", signalName: "demand_evidence", value: 1, confidence: 0.8, validUntil: "2026-09-16T18:00:00.000Z" }],
    idempotencyKey: "recommend:seller-1:product-1"
  }, { now: () => new Date(NOW) });
  assert.equal(executeDecision(decision, {}, { now: () => new Date(NOW) }).status, "EXECUTED");
  assert.equal(executeDecision(decision, { alreadyExecuted: true }, { now: () => new Date(NOW) }).status, "SKIPPED");
  assert.equal(executeDecision(decision, { permissionAllowed: false }, { now: () => new Date(NOW) }).status, "REJECTED_BY_POLICY");
  assert.equal(executeDecision(decision, { targetExists: false }, { now: () => new Date(NOW) }).status, "FAILED");
  assert.equal(executeDecision({ ...decision, expiresAt: "2026-09-14T18:00:00.000Z" }, {}, { now: () => new Date(NOW) }).status, "EXPIRED");
});

test("governing policy enforces confidence privacy trust fairness and sponsored disclosure", () => {
  const base = {
    audienceType: "seller",
    entityType: "opportunity",
    privacy: "aggregate-only",
    confidence: 0.8,
    expiresAt: "2026-09-16T18:00:00.000Z",
    decisionReasonCodes: ["organic_intelligence"]
  };
  const approved = evaluateRecommendationPolicy(base, { now: () => new Date(NOW) });
  assert.equal(approved.policyAllowed, true);
  assert.deepEqual(approved.reasonCodes, ["governing_policy_approved"]);
  assert.equal(approved.context.privacy, "aggregate-only");
  assert.equal(evaluateRecommendationPolicy({ ...base, confidence: 0.1 }, { now: () => new Date(NOW) }).policyAllowed, false);
  assert.ok(evaluateRecommendationPolicy({ ...base, privacy: "person-scoped" }, { now: () => new Date(NOW) }).reasonCodes.includes("privacy_scope_rejected"));
  assert.ok(evaluateRecommendationPolicy({ ...base, trustAllowed: false }, { now: () => new Date(NOW) }).reasonCodes.includes("trust_policy_rejected"));
  assert.ok(evaluateRecommendationPolicy({ ...base, fairnessAllowed: false }, { now: () => new Date(NOW) }).reasonCodes.includes("seller_concentration_limited"));
  assert.ok(evaluateRecommendationPolicy({ ...base, sponsored: true }, { now: () => new Date(NOW) }).reasonCodes.includes("sponsored_disclosure_missing"));
  assert.equal(evaluateRecommendationPolicy({
    ...base,
    sponsored: true,
    decisionReasonCodes: ["sponsored_disclosure_required"]
  }, { now: () => new Date(NOW) }).policyAllowed, true);
});
