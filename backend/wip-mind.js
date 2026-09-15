const crypto = require("crypto");

const OBSERVATION_SCHEMA_VERSION = "2026-09-15.wip-observation.v1";
const SIGNAL_SCHEMA_VERSION = "2026-09-15.wip-signal.v1";
const DECISION_SCHEMA_VERSION = "2026-09-15.wip-decision.v1";
const ACTION_RESULT_SCHEMA_VERSION = "2026-09-15.wip-action-result.v1";
const GOVERNING_POLICY_VERSION = "wip-governing-policy-v1";
const DEFAULT_SIGNAL_TTL_MS = 24 * 60 * 60 * 1000;

const INTELLIGENCE_DEFINITIONS = Object.freeze([
  ["market", "Market Intelligence", ["product_searched", "demand_requested", "product_purchased", "product_uploaded"], ["market_demand", "market_supply"], [], 24 * 60 * 60 * 1000, "implemented"],
  ["trust", "Trust Intelligence", ["product_purchased", "order_status_changed", "conversation_signal"], ["trust_evidence"], ["seller_quality"], 30 * 24 * 60 * 60 * 1000, "supporting"],
  ["variant", "Variant Intelligence", ["product_viewed", "product_clicked", "product_swiped", "demand_requested"], ["variant_affinity"], [], 14 * 24 * 60 * 60 * 1000, "supporting"],
  ["seasonal", "Seasonal Intelligence", ["product_searched", "demand_requested", "product_purchased"], ["seasonal_relevance"], ["time", "demand"], 7 * 24 * 60 * 60 * 1000, "partial"],
  ["demand_forecast", "Demand Forecast Intelligence", ["product_searched", "demand_requested", "product_sold_out", "product_purchased"], ["future_demand"], ["demand", "time"], 26 * 60 * 60 * 1000, "implemented"],
  ["return", "Return Intelligence", ["product_viewed", "product_opened", "product_clicked", "product_saved"], ["return_interest"], [], 14 * 24 * 60 * 60 * 1000, "supporting"],
  ["follow", "Follow Intelligence", ["person_followed", "person_unfollowed", "seller_followed"], ["public_follow_affinity"], [], 30 * 24 * 60 * 60 * 1000, "implemented"],
  ["conversation", "Conversation Intelligence", ["conversation_signal"], ["commerce_question_intent"], [], 7 * 24 * 60 * 60 * 1000, "supporting"],
  ["price", "Price Intelligence", ["product_clicked", "product_saved", "demand_requested", "product_purchased"], ["price_interest"], ["market"], 7 * 24 * 60 * 60 * 1000, "partial"],
  ["time", "Time Intelligence", ["product_viewed", "product_clicked", "product_searched", "product_purchased"], ["temporal_relevance"], [], 24 * 60 * 60 * 1000, "supporting"],
  ["local_trend", "Local Trend Intelligence", ["product_searched", "demand_requested", "product_purchased"], ["regional_momentum"], ["market", "demand"], 24 * 60 * 60 * 1000, "implemented"],
  ["similar_product", "Similar Product Intelligence", ["product_opened", "product_swiped", "product_saved"], ["product_similarity"], ["style", "variant"], 14 * 24 * 60 * 60 * 1000, "supporting"],
  ["discovery", "Discovery Intelligence", ["feed_exposure", "recommendation_surfaced", "product_opened", "product_swiped", "product_clicked"], ["discovery_response"], ["feed"], 24 * 60 * 60 * 1000, "implemented"],
  ["feed", "Feed Intelligence", ["feed_exposure", "recommendation_surfaced", "product_viewed", "product_clicked", "product_swiped"], ["feed_response", "feed_fatigue"], [], 24 * 60 * 60 * 1000, "implemented"],
  ["inventory", "Inventory Intelligence", ["product_sold_out", "product_restocked", "product_uploaded", "product_purchased"], ["stock_pressure", "supply_change"], ["demand"], 24 * 60 * 60 * 1000, "implemented"],
  ["style", "Style Intelligence", ["product_viewed", "product_clicked", "product_saved", "product_liked"], ["style_affinity"], ["variant"], 14 * 24 * 60 * 60 * 1000, "implemented"],
  ["product_quality", "Product Quality Intelligence", ["product_viewed", "product_clicked", "product_purchased", "video_complete"], ["product_quality_evidence"], [], 7 * 24 * 60 * 60 * 1000, "supporting"],
  ["seller_quality", "Seller Quality Intelligence", ["product_purchased", "order_status_changed", "conversation_signal"], ["seller_quality_evidence"], ["trust"], 7 * 24 * 60 * 60 * 1000, "implemented"],
  ["freshness", "Freshness Intelligence", ["product_uploaded", "product_edited", "product_restocked"], ["supply_freshness"], [], 26 * 60 * 60 * 1000, "implemented"],
  ["demand", "Demand Intelligence", ["product_searched", "demand_requested", "product_saved", "product_sold_out"], ["demand_evidence"], [], 24 * 60 * 60 * 1000, "implemented"]
]);

function boundedText(value, maxLength = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 32)}`;
}

function clamp(value, minimum = 0, maximum = 1) {
  const number = Number(value);
  return Math.max(minimum, Math.min(Number.isFinite(number) ? number : minimum, maximum));
}

function toIso(value, fallback = new Date()) {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback.toISOString();
}

function createIntelligenceRegistry(definitions = INTELLIGENCE_DEFINITIONS) {
  const entries = new Map();
  const register = (definition = {}) => {
    const intelligenceId = boundedText(definition.intelligenceId, 60).toLowerCase();
    if (!intelligenceId || entries.has(intelligenceId)) throw new TypeError("Intelligence registration must have a unique intelligenceId.");
    const entry = Object.freeze({
      intelligenceId,
      name: boundedText(definition.name, 100),
      version: boundedText(definition.version || "1.0.0", 40),
      owner: boundedText(definition.owner || `backend/wip/${intelligenceId}`, 120),
      inputEventTypes: Object.freeze(Array.from(new Set(definition.inputEventTypes || []))),
      outputSignalTypes: Object.freeze(Array.from(new Set(definition.outputSignalTypes || []))),
      dependencies: Object.freeze(Array.from(new Set(definition.dependencies || []))),
      confidenceSemantics: boundedText(definition.confidenceSemantics || "Evidence-weighted confidence from 0 to 1.", 180),
      ttlMs: Math.max(60_000, Number(definition.ttlMs || DEFAULT_SIGNAL_TTL_MS)),
      status: ["implemented", "supporting", "partial", "disabled"].includes(definition.status) ? definition.status : "partial"
    });
    entries.set(intelligenceId, entry);
    return entry;
  };
  definitions.forEach(([intelligenceId, name, inputEventTypes, outputSignalTypes, dependencies, ttlMs, status]) => register({
    intelligenceId, name, inputEventTypes, outputSignalTypes, dependencies, ttlMs, status
  }));
  return Object.freeze({ register, get: id => entries.get(String(id || "").toLowerCase()) || null, list: () => Array.from(entries.values()) });
}

const DEFAULT_REGISTRY = createIntelligenceRegistry();

function normalizeObservation(event = {}) {
  const observationId = boundedText(event.eventId || event.observationId, 100);
  const eventType = boundedText(event.eventType, 80).toLowerCase();
  if (!observationId || !eventType) throw new TypeError("Observation requires eventId and eventType.");
  const occurredAt = toIso(event.timestamp || event.occurredAt);
  return Object.freeze({
    observationId,
    eventType,
    occurredAt,
    actorRef: boundedText(event.buyerId || event.actorRef, 80),
    sessionRef: boundedText(event.sessionId || event.sessionRef, 120),
    productId: boundedText(event.productId, 100),
    sellerId: boundedText(event.sellerId, 80),
    context: Object.freeze({
      feedContext: boundedText(event.feedContext, 80),
      deviceType: boundedText(event.deviceType, 40),
      appVersion: boundedText(event.appVersion, 60)
    }),
    source: boundedText(event.sourceEvent || event.source || "canonical_event", 80),
    region: boundedText(event.location || event.region, 80),
    locale: boundedText(event.locale || event.language, 40),
    metadata: Object.freeze({}),
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    sourceSchemaVersion: boundedText(event.schemaVersion, 80)
  });
}

function signalSubject(observation, intelligenceId) {
  if (["follow"].includes(intelligenceId)) return ["person", observation.sellerId || observation.productId];
  if (["market", "local_trend", "seasonal", "time"].includes(intelligenceId)) return [observation.region ? "region" : "market", observation.region || "global"];
  if (["seller_quality", "trust"].includes(intelligenceId)) return ["seller", observation.sellerId];
  if (["style", "return"].includes(intelligenceId) && observation.actorRef) return ["person", observation.actorRef];
  return ["product", observation.productId];
}

function learnFromObservation(event = {}, options = {}) {
  const registry = options.registry || DEFAULT_REGISTRY;
  const observation = normalizeObservation(event);
  const observedAt = new Date(observation.occurredAt);
  const baseConfidence = clamp(event.quality?.confidence ?? 0.5, 0.05, 1);
  const signals = [];
  registry.list().forEach((learner) => {
    if (learner.status === "disabled" || !learner.inputEventTypes.includes(observation.eventType)) return;
    const [subjectType, subjectId] = signalSubject(observation, learner.intelligenceId);
    if (!subjectId) return;
    const signalName = learner.outputSignalTypes[0];
    const validUntil = new Date(observedAt.getTime() + learner.ttlMs).toISOString();
    signals.push(Object.freeze({
      signalId: stableId("sig", `${learner.intelligenceId}:${observation.observationId}:${subjectType}:${subjectId}:${signalName}`),
      schemaVersion: SIGNAL_SCHEMA_VERSION,
      intelligenceType: learner.intelligenceId,
      intelligenceVersion: learner.version,
      subjectType,
      subjectId,
      signalName,
      value: observation.eventType.endsWith("unfollowed") ? -1 : 1,
      confidence: baseConfidence,
      evidenceCount: 1,
      observedFrom: Object.freeze([observation.observationId]),
      validFrom: observation.occurredAt,
      validUntil,
      geographicScope: observation.region ? Object.freeze({ level: "region", value: observation.region }) : null,
      temporalScope: Object.freeze({ level: "event", value: observation.occurredAt.slice(0, 13) }),
      modelVersion: "",
      ruleVersion: "wip-observation-rules-v1",
      featureVersion: "canonical-commerce-features-v1",
      createdAt: toIso(options.now?.() || new Date())
    }));
  });
  return { observation, signals };
}

function createDecision(input = {}, options = {}) {
  const now = new Date(options.now?.() || new Date());
  const signals = (Array.isArray(input.signals) ? input.signals : []).filter(signal => {
    const expiry = new Date(signal?.validUntil || 0).getTime();
    return signal && Number.isFinite(expiry) && expiry > now.getTime() && clamp(signal.confidence) >= clamp(input.minimumConfidence ?? 0.2);
  });
  const fatigue = signals.some(signal => signal.signalName === "feed_fatigue" && Number(signal.value) > 0.7);
  const sponsored = Boolean(input.sponsored);
  const requestedAction = boundedText(input.selectedAction || "NO_ACTION", 80).toUpperCase();
  const selectedAction = fatigue && requestedAction === "RANK_FEED_CANDIDATE" ? "NO_ACTION" : requestedAction;
  const reasonCodes = Array.from(new Set([
    ...(input.reasonCodes || []),
    ...(fatigue ? ["fatigue_policy"] : []),
    ...(sponsored ? ["sponsored_disclosure_required"] : []),
    ...(signals.length ? [] : ["no_fresh_confident_signals"])
  ])).map(value => boundedText(value, 80)).filter(Boolean);
  const confidence = signals.length
    ? clamp(signals.reduce((sum, signal) => sum + clamp(signal.confidence), 0) / signals.length)
    : 0;
  const subjectId = boundedText(input.subjectId, 100);
  const decisionType = boundedText(input.decisionType, 80).toUpperCase();
  if (!decisionType || !subjectId) throw new TypeError("Decision requires decisionType and subjectId.");
  const createdAt = now.toISOString();
  return Object.freeze({
    decisionId: stableId("dec", input.idempotencyKey || `${decisionType}:${subjectId}:${boundedText(input.targetContext, 80)}:${createdAt.slice(0, 13)}`),
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionType,
    subjectId,
    targetContext: boundedText(input.targetContext, 80),
    selectedAction: signals.length ? selectedAction : "NO_ACTION",
    priority: Math.max(0, Math.min(100, Number(input.priority || 0))),
    contributingSignals: Object.freeze(signals.map(signal => signal.signalId)),
    confidence,
    policyVersion: boundedText(input.policyVersion || "wip-conscious-policy-v1", 80),
    reasonCodes: Object.freeze(reasonCodes),
    sponsored,
    createdAt,
    expiresAt: toIso(input.expiresAt || new Date(now.getTime() + 60 * 60 * 1000)),
    idempotencyKey: boundedText(input.idempotencyKey || "", 120)
  });
}

function evaluateRecommendationPolicy(input = {}, options = {}) {
  const now = new Date(options.now?.() || new Date());
  const audienceType = boundedText(input.audienceType, 40).toLowerCase();
  const entityType = boundedText(input.entityType, 40).toLowerCase();
  const privacy = boundedText(input.privacy, 60).toLowerCase();
  const decisionReasonCodes = Array.isArray(input.decisionReasonCodes)
    ? input.decisionReasonCodes.map(value => boundedText(value, 80)).filter(Boolean)
    : [];
  const confidence = clamp(input.confidence, 0, 1);
  const minimumConfidence = clamp(input.minimumConfidence ?? 0.2, 0, 1);
  const expiresAt = new Date(input.expiresAt || 0).getTime();
  const targetExists = input.targetExists !== false;
  const permissionAllowed = input.permissionAllowed !== false && input.audienceActive !== false;
  const reasonCodes = [];
  let policyAllowed = true;

  const allowedPrivacy = audienceType === "seller"
    ? new Set(["aggregate-only", "seller-scoped-aggregate-only"])
    : audienceType === "person"
      ? new Set(["person-scoped", "self-scoped", "public-commerce-entity"])
      : new Set(["aggregate-only", "public-commerce-entity"]);

  if (!targetExists) reasonCodes.push("target_missing");
  if (!permissionAllowed) reasonCodes.push("audience_permission_denied");
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) reasonCodes.push("decision_expired");
  if (confidence < minimumConfidence) {
    policyAllowed = false;
    reasonCodes.push("insufficient_confidence");
  }
  if (!allowedPrivacy.has(privacy)) {
    policyAllowed = false;
    reasonCodes.push("privacy_scope_rejected");
  }
  if (input.targetEligible === false) {
    policyAllowed = false;
    reasonCodes.push("target_not_eligible");
  }
  if (input.trustAllowed === false) {
    policyAllowed = false;
    reasonCodes.push("trust_policy_rejected");
  }
  if (input.fairnessAllowed === false) {
    policyAllowed = false;
    reasonCodes.push("seller_concentration_limited");
  }
  if (Boolean(input.sponsored) && !decisionReasonCodes.includes("sponsored_disclosure_required")) {
    policyAllowed = false;
    reasonCodes.push("sponsored_disclosure_missing");
  }
  if (!reasonCodes.length) reasonCodes.push("governing_policy_approved");

  const uniqueReasonCodes = Object.freeze(Array.from(new Set(reasonCodes)));
  return Object.freeze({
    policyVersion: GOVERNING_POLICY_VERSION,
    targetExists,
    permissionAllowed,
    policyAllowed,
    reasonCodes: uniqueReasonCodes,
    executionKey: `${GOVERNING_POLICY_VERSION}:${uniqueReasonCodes.join(",")}`,
    context: Object.freeze({ audienceType, entityType, privacy, confidence, minimumConfidence })
  });
}

function executeDecision(decision = {}, checks = {}, options = {}) {
  const now = new Date(options.now?.() || new Date());
  const expired = new Date(decision.expiresAt || 0).getTime() <= now.getTime();
  let status = "EXECUTED";
  let failureReason = "";
  if (expired) status = "EXPIRED";
  else if (decision.selectedAction === "NO_ACTION") status = "SKIPPED";
  else if (checks.targetExists === false) { status = "FAILED"; failureReason = "target_missing"; }
  else if (checks.permissionAllowed === false || checks.policyAllowed === false) { status = "REJECTED_BY_POLICY"; failureReason = "policy_rejected"; }
  else if (checks.alreadyExecuted === true) status = "SKIPPED";
  const completedAt = now.toISOString();
  return Object.freeze({
    actionId: stableId("act", `${decision.decisionId}:${decision.selectedAction}:${boundedText(checks.executionKey, 240)}`),
    schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
    decisionId: boundedText(decision.decisionId, 100),
    status,
    startedAt: completedAt,
    completedAt,
    resultMetadata: Object.freeze({
      selectedAction: boundedText(decision.selectedAction, 80),
      targetContext: boundedText(decision.targetContext, 80),
      outcomeType: boundedText(checks.outcomeType || "decision_execution", 80),
      businessOutcome: Boolean(checks.businessOutcome),
      policyVersion: boundedText(checks.policyVersion, 80),
      policyReasonCodes: Object.freeze((checks.policyReasonCodes || []).map(value => boundedText(value, 80)).filter(Boolean))
    }),
    failureReason
  });
}

module.exports = {
  OBSERVATION_SCHEMA_VERSION,
  SIGNAL_SCHEMA_VERSION,
  DECISION_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  GOVERNING_POLICY_VERSION,
  INTELLIGENCE_DEFINITIONS,
  DEFAULT_REGISTRY,
  createIntelligenceRegistry,
  normalizeObservation,
  learnFromObservation,
  createDecision,
  evaluateRecommendationPolicy,
  executeDecision
};
