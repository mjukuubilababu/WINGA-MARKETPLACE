"use strict";

// This contract evaluates the existing pipeline in shadow mode before cutover.
const VERSION = "search-demand-contract-v1";
const COMMERCE = new Set(["PRODUCT_INTENT", "CATEGORY_INTENT"]);
const OUTCOMES = new Set(["ADEQUATE_RESULTS", "VALID_ZERO_RESULTS", "LOW_QUALITY_RESULTS"]);
const PRODUCT_WORDS = new Set(("dress dresses shirt shirts jacket jackets shoes sneakers phone phones furniture sofa chair table laptop bag bags gauni magauni shati mashati koti viatu simu suruali kiti viti meza robe robes chemise chaussures pantalon meuble veste").split(" "));

function normalizeIntentText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function classifySearchIntent(query, evidence = {}) {
  const text = normalizeIntentText(query);
  const result = (classification, confidence, reason) => ({classification, confidence, reason, version:VERSION});
  if (!text || [...text].length < 2 || [...text].length > 160
      || !/\p{L}/u.test(text)) return result("SPAM", 1, "invalid_text");
  if (evidence.bot === true) return result("SPAM", 1, "bot_evidence");
  if (new Set(["login", "logout", "sign in", "signup", "settings", "profile", "ingia"]).has(text)) {
    return result("NAVIGATION_INTENT", 1, "navigation_query");
  }
  const matches = values => (Array.isArray(values) ? values : []).some(value => normalizeIntentText(value) === text);
  const shop = evidence.shopMatch === true || matches(evidence.shopNames);
  const person = evidence.personMatch === true || matches(evidence.personNames);
  const product = evidence.productMatch === true || matches(evidence.productNames);
  const category = evidence.categoryMatch === true || matches(evidence.categoryNames);
  // An identity/product collision requires clarification, never a guessed demand.
  if ((shop || person) && (product || category)) return result("UNKNOWN", 0, "identity_commerce_collision");
  if (shop && person) return result("UNKNOWN", 0, "identity_collision");
  if (shop) return result("SHOP_INTENT", 1, "known_shop");
  if (person) return result("PERSON_INTENT", 1, "known_person");
  if (category) return result("CATEGORY_INTENT", 0.95, "canonical_taxonomy");
  if (product) return result("PRODUCT_INTENT", 0.95, "product_name");
  if (text.split(" ").some(word => PRODUCT_WORDS.has(word))) return result("PRODUCT_INTENT", 0.7, "product_vocabulary");
  return result("UNKNOWN", 0, "insufficient_evidence");
}

function evaluateSearchDemand(query, context = {}) {
  const intent = classifySearchIntent(query, context.evidence);
  const outcome = context.authoritativeOutcome;
  const eligible = COMMERCE.has(intent.classification) && OUTCOMES.has(outcome)
    && context.evidenceAvailable !== false && context.sensitive !== true;
  return {...intent, eligible, outcome:OUTCOMES.has(outcome) ? outcome : "UNVERIFIED",
    reason: !COMMERCE.has(intent.classification) ? intent.reason
      : context.sensitive === true ? "sensitive_policy"
      : context.evidenceAvailable === false ? "evidence_unavailable"
      : !OUTCOMES.has(outcome) ? "search_integrity_unverified" : "eligible",
    unmet:eligible && outcome !== "ADEQUATE_RESULTS"};
}

function summarizeShadowDemand(events = []) {
  const groups = new Map();
  const seen = new Set();
  const classifications = {};
  for (const event of events) {
    const contract = event?.metadata?.demandContract;
    const identity = contract?.retryIdentity || event?.eventId;
    if (!contract || !identity || seen.has(identity)) continue;
    seen.add(identity);
    classifications[contract.classification] = (classifications[contract.classification] || 0) + 1;
    if (!contract.eligible) continue;
    const key = normalizeIntentText(event.query);
    const current = groups.get(key) || {query:key, rawSearchCount:0, actors:new Set(), unmet:0};
    current.rawSearchCount++;
    if (event.audienceKey) current.actors.add(`${event.audienceType}:${event.audienceKey}`);
    if (contract.unmet) current.unmet++;
    groups.set(key,current);
  }
  return {version:VERSION, mode:"shadow", classifications,
    demands:Array.from(groups.values()).map(row=>({query:row.query, rawSearchCount:row.rawSearchCount,
      uniqueActorCount:row.actors.size, repeatSearchCount:Math.max(0,row.rawSearchCount-row.actors.size),
      unfulfilledSearchCount:row.unmet, demandState:"NEW_DEMAND", confidence:"LOW",
      opportunityCandidate:row.unmet>0 && row.actors.size>0, trending:false}))};
}

module.exports = {VERSION, normalizeIntentText, classifySearchIntent, evaluateSearchDemand, summarizeShadowDemand};
