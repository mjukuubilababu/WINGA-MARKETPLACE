const crypto = require("crypto");

const OPPORTUNITY_TYPES = new Set([
  "zero_result", "low_supply", "sold_out_restock", "regional_demand", "variant_gap", "category_gap"
]);
const SUPPLY_ACTION_TYPES = new Set([
  "restock_product", "create_product", "add_variant", "increase_stock", "ignore", "dismiss"
]);
const EXPOSURE_OUTCOMES = new Set([
  "viewed_detail", "liked", "saved", "messaged", "ordered", "ignored", "no_action", "hidden", "skipped"
]);
const COMMERCE_REDISCOVERY_EXPERIMENT_KEY = "commerce_rediscovery_v1";

function clean(value, limit = 120) {
  return String(value || "").trim().slice(0, limit);
}

function normalizeKey(value, limit = 160) {
  return clean(value, limit)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, limit);
}

function boundedNumber(value, minimum = 0, maximum = 1000000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function stableId(prefix, parts = []) {
  const digest = crypto.createHash("sha256")
    .update(parts.map((part) => clean(part, 500)).join("\u001f"))
    .digest("hex")
    .slice(0, 32);
  return `${prefix}_${digest}`;
}

function buildAudienceKey(audienceType, identifier, secret) {
  const type = audienceType === "user" ? "user" : "session";
  const value = clean(identifier, 200);
  const key = clean(secret, 500);
  if (!value || key.length < 16) return "";
  return crypto.createHmac("sha256", key).update(`${type}:${value}`).digest("hex");
}

function assignCommerceExperimentArm(audienceType, audienceKey, options = {}) {
  const type = audienceType === "user" ? "user" : "session";
  const key = clean(audienceKey, 64);
  const experimentKey = clean(options.experimentKey || COMMERCE_REDISCOVERY_EXPERIMENT_KEY, 100);
  const requestedControlPercent = Number(options.controlPercent ?? 10);
  const controlPercent = Math.min(50, Math.max(0, Number.isFinite(requestedControlPercent) ? requestedControlPercent : 10));
  if (!key || !experimentKey) return { experimentKey: "", arm: "treatment", bucket: 10000 };
  const digest = crypto.createHash("sha256").update(`${experimentKey}:${type}:${key}`).digest("hex");
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 10000;
  return {
    experimentKey,
    arm: bucket < Math.round(controlPercent * 100) ? "control" : "treatment",
    bucket
  };
}

function meetsOpportunityThreshold(candidate = {}) {
  const type = clean(candidate.type, 40).toLowerCase();
  const evidenceCount = Math.floor(boundedNumber(candidate.evidenceCount, 0, 1000000));
  const demandScore = boundedNumber(candidate.demandScore, 0, 1000000);
  const supplyScore = boundedNumber(candidate.supplyScore, 0, 1000000);
  if (type === "zero_result") return evidenceCount >= 3 && supplyScore === 0;
  if (type === "low_supply") return evidenceCount >= 3 && supplyScore <= 3;
  if (type === "sold_out_restock") return evidenceCount >= 2 || demandScore >= 6;
  if (type === "regional_demand") return evidenceCount >= 5 && Boolean(clean(candidate.region, 80));
  if (type === "variant_gap") return evidenceCount >= 2 && Boolean(clean(candidate.color || candidate.size, 80));
  if (type === "category_gap") return evidenceCount >= 4 && Boolean(clean(candidate.category, 100));
  return false;
}

function normalizeCommerceOpportunity(candidate = {}, options = {}) {
  const type = clean(candidate.type, 40).toLowerCase();
  if (!OPPORTUNITY_TYPES.has(type) || !meetsOpportunityThreshold(candidate)) return null;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const queryKey = normalizeKey(candidate.queryKey || candidate.query, 160);
  const productId = clean(candidate.productId, 100);
  const category = normalizeKey(candidate.category, 100);
  const region = normalizeKey(candidate.region || candidate.location, 80);
  const color = normalizeKey(candidate.color, 60);
  const size = normalizeKey(candidate.size, 40);
  if (!queryKey && !productId && !category) return null;
  const opportunityId = stableId("opp", [type, queryKey, productId, category, region, color, size]);
  return {
    opportunityId,
    type,
    source: clean(candidate.source || "commerce_intelligence", 80),
    queryKey,
    productId,
    category,
    region,
    color,
    size,
    demandScore: boundedNumber(candidate.demandScore, 0, 1000000),
    supplyScore: boundedNumber(candidate.supplyScore, 0, 1000000),
    evidenceCount: Math.floor(boundedNumber(candidate.evidenceCount, 0, 1000000)),
    status: "open",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
    metadata: candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)
      ? candidate.metadata
      : {}
  };
}

function buildCommerceOpportunities(candidates = [], options = {}) {
  const unique = new Map();
  (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
    const opportunity = normalizeCommerceOpportunity(candidate, options);
    if (!opportunity) return;
    const existing = unique.get(opportunity.opportunityId);
    if (!existing || opportunity.demandScore > existing.demandScore) unique.set(opportunity.opportunityId, opportunity);
  });
  return Array.from(unique.values());
}

function normalizeSupplyActionType(value) {
  const actionType = clean(value, 40).toLowerCase();
  return SUPPLY_ACTION_TYPES.has(actionType) ? actionType : "";
}

function createSupplyResponseId(opportunityId, sellerId, actionType, productId = "", variantId = "") {
  return stableId("resp", [opportunityId, sellerId, actionType, productId, variantId]);
}

function createEligibilityId(responseId, audienceType, audienceKey, reasonCode) {
  return stableId("elig", [responseId, audienceType, audienceKey, reasonCode]);
}

function normalizeFeedExposure(input = {}) {
  const audienceType = input.audienceType === "user" ? "user" : "session";
  const audienceKey = clean(input.audienceKey, 64);
  const productId = clean(input.productId, 100);
  if (!audienceKey || !productId) return null;
  const shownAt = new Date(input.shownAt || Date.now());
  if (Number.isNaN(shownAt.getTime())) return null;
  const suppliedExposureId = clean(input.exposureId, 100);
  return {
    exposureId: suppliedExposureId || stableId("exp", [audienceType, audienceKey, productId, shownAt.toISOString(), input.moduleId]),
    audienceType,
    audienceKey,
    productId,
    sellerId: clean(input.sellerId, 80),
    moduleId: clean(input.moduleId || "home_feed", 100),
    rankPosition: Math.floor(boundedNumber(input.rankPosition, 0, 1000000)),
    rankingSource: clean(input.rankingSource || "organic", 80),
    reasonCodes: Array.from(new Set((Array.isArray(input.reasonCodes) ? input.reasonCodes : String(input.reasonCodes || "").split(","))
      .map((reason) => normalizeKey(reason, 60)).filter(Boolean))).slice(0, 12),
    opportunityId: clean(input.opportunityId, 100),
    supplyResponseId: clean(input.supplyResponseId, 100),
    shownAt: shownAt.toISOString(),
    region: normalizeKey(input.region, 80),
    sessionId: clean(input.sessionId, 120),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {}
  };
}

function normalizeExposureOutcome(value) {
  const outcome = clean(value, 40).toLowerCase();
  return EXPOSURE_OUTCOMES.has(outcome) ? outcome : "";
}

module.exports = {
  OPPORTUNITY_TYPES,
  SUPPLY_ACTION_TYPES,
  EXPOSURE_OUTCOMES,
  COMMERCE_REDISCOVERY_EXPERIMENT_KEY,
  assignCommerceExperimentArm,
  buildAudienceKey,
  buildCommerceOpportunities,
  createEligibilityId,
  createSupplyResponseId,
  meetsOpportunityThreshold,
  normalizeCommerceOpportunity,
  normalizeExposureOutcome,
  normalizeFeedExposure,
  normalizeKey,
  normalizeSupplyActionType,
  stableId
};
