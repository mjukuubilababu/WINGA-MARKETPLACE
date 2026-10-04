"use strict";

const crypto = require("crypto");
const {normalizeIntentText, evaluateSearchDemand} = require("./search-demand-contract");
const SOURCE = "server_search_outcome_observed";
const SCHEMA = "search-outcome-v1";

function isSearchObservation(event) {
  return event?.sourceEvent === SOURCE;
}

function validateSearchObservation(event) {
  const data = event?.metadata?.searchObservation;
  if (!isSearchObservation(event) || event.schemaVersion !== SCHEMA
      || !/^search_observation_[a-f0-9]{32}$/.test(event.eventId || "")
      || !Number.isFinite(Date.parse(event.timestamp))
      || typeof data?.query !== "string" || !data.query || data.query.length > 160
      || !Number.isSafeInteger(data.resultCount) || data.resultCount < 0
      || !["VALID_ZERO_RESULTS", "ZERO_RESULTS_UNVERIFIED", "MATCH_QUALITY_UNVERIFIED"].includes(data.outcome)
      || (data.outcome === "VALID_ZERO_RESULTS" && (data.resultCount !== 0 || data.integrity !== "fresh_primary" || data.searchQualityVerified !== true))
      || event.metadata.demandContract?.eligible !== false || event.metadata.demandContract?.unmet !== false) {
    throw Object.assign(new Error("invalid_search_observation"), {code:"invalid_search_observation", retryable:false});
  }
  return event;
}

async function persistSearchObservation(client, event) {
  validateSearchObservation(event);
  // Existing event ledger is the shadow source of truth; no score receipts,
  // product scores, seller scores or seller-visible legacy demand are touched.
  const result = await client.query(
    `INSERT INTO intelligence_events (event_id, event_type, source_event, happened_at, metadata)
     VALUES ($1, 'search', $2, $3::timestamptz, $4::jsonb)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.eventId, SOURCE, event.timestamp, JSON.stringify({...event.metadata, schemaVersion:SCHEMA})]
  );
  return {applied:result.rows.length > 0, shadow:true};
}

// A successful mixed-index search says nothing about adequate match quality.
// Primary freshness alone cannot certify index/search quality. The current
// route leaves that gate unset until normalized/synonym/adequate-match checks.
function buildSearchObservation(input) {
  const query = normalizeIntentText(input.query);
  if (!query || query.length > 160 || input.page !== 1 || input.cursor || input.seller
      || (input.category && input.category !== "all") || input.staff
      || !Number.isSafeInteger(input.total) || input.total < 0) return null;
  const outcome = input.total === 0
    ? input.freshPrimary && input.searchQualityVerified === true ? "VALID_ZERO_RESULTS" : "ZERO_RESULTS_UNVERIFIED"
    : "MATCH_QUALITY_UNVERIFIED";
  const demandContract = evaluateSearchDemand(query, {
    evidence:input.evidence, evidenceAvailable:input.evidenceAvailable,
    authoritativeOutcome:outcome,
    // Seller-facing eligibility awaits sensitive-search policy acceptance.
    sensitive:true
  });
  return validateSearchObservation({
    eventId:`search_observation_${input.searchId && /^[a-zA-Z0-9_-]{16,100}$/.test(input.searchId) && input.audience?.audienceKey
      ? crypto.createHash("sha256").update(JSON.stringify([input.audience.audienceType,input.audience.audienceKey,query,input.searchId])).digest("hex").slice(0,32)
      : crypto.randomBytes(16).toString("hex")}`,
    timestamp:new Date().toISOString(), schemaVersion:SCHEMA,
    sourceEvent:SOURCE, eventType:"search", domain:"commerce", entityType:"search",
    outcome:"observed", level:"info", appVersion:input.appVersion || "",
    metadata:{searchObservation:{query, resultCount:input.total, outcome,
      integrity:input.freshPrimary ? "fresh_primary" : "cache_or_replica",
      searchQualityVerified:input.searchQualityVerified === true,
      matchQuality:"NOT_EVALUATED", policyAccepted:false},
      demandContract:{...demandContract, mode:"shadow"},
      audience:{type:input.audience?.audienceType === "user" ? "user" : "session",
        key:/^[a-f0-9]{64}$/.test(input.audience?.audienceKey || "") ? input.audience.audienceKey : ""}}
  });
}

// Bounded pre-enqueue work runs after the response. Its crash/loss window is
// explicit: durability starts at queue INSERT commit, not at HTTP completion.
function createSearchOutcomeObserver({enabled=false, readEvidence, enqueue, maxPending=2,
  maxAttempts=3, schedule=fn=>setImmediate(fn), delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  random=Math.random} = {}) {
  const state = {enabled, pending:0, captured:0, failed:0, shed:0, skipped:0};
  function observeEvent(event) {
    if (!enabled) return false;
    if (!event) {state.skipped++; return false;}
    validateSearchObservation(event);
    if (state.pending >= maxPending) {state.shed++; return false;}
    state.pending++;
    schedule(async()=>{
      try {
        let evidence, evidenceAvailable = true;
        try {evidence = (await readEvidence([event.metadata.searchObservation.query]))[0];}
        catch {evidenceAvailable = false;}
        event.metadata.demandContract = {...evaluateSearchDemand(event.metadata.searchObservation.query, {
          evidence, evidenceAvailable, authoritativeOutcome:event.metadata.searchObservation.outcome, sensitive:true
        }), mode:"shadow"};
        for (let attempt=1; attempt<=maxAttempts; attempt++) {
          try {await enqueue(event); state.captured++; return;}
          catch (error) {
            if (error?.retryable === false || attempt === maxAttempts) throw error;
            await delay(Math.min(4000, 250 * 2 ** (attempt-1)) + Math.floor(random()*250));
          }
        }
      } catch {state.failed++;}
      finally {state.pending--;}
    });
    return true;
  }
  return {observe:input=>enabled ? observeEvent(buildSearchObservation(input)) : false, observeEvent,
    recordFailure:()=>{state.failed++;},
    snapshot:()=>({...state, durability:"queue_commit", sellerCutover:false})};
}

module.exports = {SOURCE, SCHEMA, isSearchObservation, validateSearchObservation,
  persistSearchObservation, buildSearchObservation, createSearchOutcomeObserver};
