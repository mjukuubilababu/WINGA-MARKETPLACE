# Winga real-time demand response implementation

Scope: the user's single specification, sections 1–170, supplied in three parts
on 2026-10-04. Section 171 was also supplied in part; query-plan review is retained
as a gate, without inventing its missing continuation.

Mission: No One Left Behind. Demand existence starts at one legitimate buyer;
confidence, trending and push notifications have independent eligibility rules.
The whole target is Search -> Demand -> Opportunity -> Supply -> Resolution.
This document records implementation progress, not a production acceptance claim.

## Current-system audit (base 1256b6ec)

| Existing component | Evidence | Decision |
| --- | --- | --- |
| Product and shop discovery | app-core.js:createProductSearchText includes name, shop, uploadedBy, sellerName, fullName and category terms | REUSE discovery; HARDEN intelligence with an independent classification gate. Removing shop search is not the fix. |
| Client capture | app.js:recordSearchDemandSignal waits 900ms; commit uses idle callback; search-demand-intelligence.js collector persists/syncs events | REUSE collector; HARDEN stable identity, settled outcome, Unicode and authoritative-result contract. |
| Image capture | app.js image selection records zero results before calculating actual matching supply | MIGRATE outcome timing; never treat image selection as proven unmet demand. |
| Ingestion | POST /api/search-demand normalizes client resultCount and zeroResult, stores events, reads summary, then schedules opportunity refresh | REUSE route; HARDEN outcome authenticity and batch isolation; MIGRATE refresh into durable outbox processing. |
| Canonical event storage | search_demand_events; appendSearchDemandEvents uses dedupe_key conflict updates | REUSE table; HARDEN event retry identity, windows, raw vs unique counts and migration policy. |
| Summary thresholds | createPostgresStore clamps SEARCH_DEMAND_MIN_AUDIENCE to >=2; local HTTP summary uses 2 | MIGRATE demand existence separately from trends, after integrity/privacy acceptance. |
| Opportunity thresholds | commerce-opportunity.js requires zero/low-supply evidenceCount >=3 | MIGRATE to eligible N=1 candidates with explicit early/low-confidence states; preserve stronger rank thresholds separately. |
| Misleading strength | frontend and backend zeroResultOpportunities label every item high | DEPRECATE automatic high claims; replace with evidence-backed existence/confidence language at cutover. |
| Refresh/recovery | server refreshCommerceOpportunities uses a process promise and 30s interval; runCommerceLearningTask fails open | HARDEN with durable scheduling; process memory cannot be the only delivery/checkpoint truth. |
| Seller access | readSellerCommerceOpportunities filters by seller category/inventory and excludes dismissed items; analytics route refreshes on read | REUSE routing and ownership; HARDEN fair general board access and realtime recovery. |
| Supply response | recordSupplyResponse checks ownership, links one matching opportunity and creates rediscovery eligibility transactionally | REUSE tables/attribution; HARDEN adequate match, all open candidates, usable supply, saturation and explicit resolution. |
| Buyer rediscovery | /api/feed/rediscovery plus rediscovery_eligibility and experiment/exposure/outcome records | REUSE attribution; MIGRATE explicit subscriptions and request lifecycle; feed exposure is not resolution consent. |
| Intelligence worker | intelligence-queue-worker and existing durable queue/recovery/snapshots | REUSE infrastructure after checking payload/version/checkpoint contracts; do not claim the complete demand loop already uses it. |
| Historical events | no historical shop/person classification evidence in old rows | LEGACY_UNKNOWN by default; no automatic clean-data migration or deletion. |

No existing table/API/feature is removed in the foundation change.

## Foundation implemented in this increment

- Versioned deterministic search-demand-contract module; Unicode-safe intent text.
- Product/category vs shop/person/navigation/spam/unknown classification. Exact
  identity evidence wins over product vocabulary. Identity/product collisions
  remain UNKNOWN and require later clarification support.
- Server shadow enrichment from exact primary-database identity/product evidence,
  or canonical local-store records in development. Client classification is not
  accepted as truth. A failed evidence lookup marks eligibility unavailable.
- Client counts cannot prove VALID_ZERO_RESULTS. Missing authoritative outcomes,
  timeout, unavailable search and partial results produce no eligible shadow
  unmet demand. This is not yet an authoritative Search Service integration.
- Shadow retry identities from supplied event IDs are namespaced by actor reference
  and remain stable across dates. Existing canonical event IDs/daily dedupe stay
  unchanged until a compatibility migration; stored legacy data cannot yet measure
  all raw repeats or guarantee cross-day dedupe. A new event ID represents a new
  raw search, not necessarily a new unique buyer.
- Batch poison isolation keeps valid entries and their original audience indices.
  Invalid entries are counted; durable quarantine/replay is not yet implemented.
- N=1 shadow projection produces a NEW_DEMAND/LOW-confidence candidate, never a
  trend. Duplicate deliveries have one effect; repeats do not create new actors.
- Admin analytics has a bounded seven-day aggregate shadow report on PostgreSQL;
  it includes classification/reason counts and explicitly says NOT_VERIFIED.
  No actor, raw query or private search history is exposed in this report.

Shadow means existing seller behavior is unchanged. Known legacy contamination
is not repaired by recording shadow evidence. N=1 is not switched on in production.
No AI, dedicated search service, new deployment, schema migration or external
configuration is introduced by this foundation.

## Complete spec coverage and dependency sequence

Every range below remains in scope. "Foundation" means partial implementation,
not completion of all sections in the range.

| Specs | Work package | Status / dependency |
| --- | --- | --- |
| 1–4 | Hot-path isolation and canonical multisource intent | Foundation; authoritative search outcome integration next |
| 5–8 | Event schema, classification, taxonomy and clarification | Foundation; taxonomy governance, ambiguity UI, sensitive policy pending |
| 9–14 | Successful/unmet demand, N=1, evidence ladder, unique/repeat/spam controls | Shadow projection; durable raw/unique windows and seller cutover pending |
| 15–19 | Canonicalization, attributes, lifecycle and usable supply | Planned; multilingual synonym provenance and adequate-match contract required |
| 20–27 | Opportunity scoring/confidence, relevance, fairness, live board and seller actions | Existing routing/response reused; honest cards, N=1, realtime/fairness pending |
| 28–34 | Asynchronous supply matching, notify-me, resolution, attribution and learning | Existing attribution reused; consent subscriptions and resolution engine pending |
| 35–43 | Durable events, idempotency, consistency, counters/history and regional/global scope | Stable IDs foundation; outbox/checkpoints/aggregates and cross-language mapping pending |
| 44–49 | Visual demand and match-quality-aware search | Planned; no retained private source imagery without permission |
| 50–64 | Alternatives, persistence/expiry, cancellation, partial resolution, gap reasons/confidence | Planned; alternatives never close original constraints automatically |
| 65–79 | Live opportunity/request surfaces, notification preferences, capability and saturation | Planned; shopping rooms optional and not a V1 prerequisite |
| 80–90 | Ads/feed boundaries, provenance, small-N privacy and deletion/retention | Admin minimization foundation; operational privacy policy and deletion flows pending |
| 91–97 | Authorization, authoritative event metadata, abuse protection, cache/index/freshness | Existing auth/rate limits reused; authoritative SearchEvent and index health next |
| 98–108 | SLOs, end-to-end metrics, traces, alerts and failure isolation | Planned measurements; user target numbers are not measured guarantees |
| 109–121 | Retry/DLQ/poison, outbox, checkpoints, atomic/unique counters and event time | Stable retry IDs and batch isolation foundation; durable quarantine and transactional pipeline pending |
| 122–140 | Horizontal scale, primary/replica consistency, index rebuild, outage safety and regions | Primary classification read foundation; infrastructure validation and documented fallbacks pending |
| 141–148 | RPO/RTO, independent backups, restore drills, replay and compatible schemas | Planned external acceptance; replication alone is not backup |
| 149–157 | Audit, historical migration, shadow reports, flags, kill switches and canary | Audit/shadow report foundation; quality comparison, rollout flags and migration approval pending |
| 158–170 | Load/soak/chaos, duplicate/concurrent/bot/privacy/auth/input/performance/index gates | Focused contract tests; realistic staged acceptance pending |

## Next implementation stages (in order)

1. Authoritative SearchEvent: bind result count/match quality to actual canonical
   search execution; distinguish valid zero, failure and partial/index quality.
   Preserve client compatibility, stable event ID and server timestamps. Add
   classification/sensitive policy evidence without identity leakage.
2. Expand-only durable event/outbox/quarantine/checkpoint contracts on existing
   intelligence infrastructure; retries/backoff/jitter and terminal recovery.
   Atomic raw/unique/time-window aggregation; bounded late-event reconciliation.
3. Shadow evaluation against annotated evidence: contamination, missed legitimate
   emerging demand, duplicate effects and latency. Historical legacy data remains
   segregated until an explicit migration policy is approved.
4. Controlled N=1 demand/opportunity canary: honest state/confidence/reasons,
   separate trend thresholds, category/region relevance and general board fairness.
   Independent kill switches; no push storm. Realtime plus canonical refresh.
5. Subscription/request persistence, cancellation/expiry and notification consent.
   Supply matcher uses product/variant/price/region/availability quality and keeps
   alternatives/partial gaps open. Saturation limits further seller alerts.
6. Explicit resolution evidence and existing conversation/order attribution;
   durable notification delivery and conversion learning. No resolution from an
   upload, impression or notification alone.
7. Staging load/soak/chaos, authorization/privacy/Unicode/XSS tests and query plans.
   Measure search/capture/visibility/match/notification SLOs and capacity.
8. Backup/restore/replay and deployment/canary acceptance. Cross-region/index
   infrastructure is activated only when measurements justify it; no invented
   HA, zero-loss, exactly-once transport or global-capacity claims.

## Tests and release boundary

Run npm run test:demand-contract and npm run test:integration. Contract tests cover
identity collisions, emerging multilingual vocabulary, Unicode, outage safety,
N=1 vs trend, duplicate/repeat actors, cross-day retries, primary reads, parameter
binding and poison-batch actor alignment. Wire contract tests into integration CI.
Run frontend tests to check existing discovery and seller surfaces remain intact.

Production cutover requires shadow evidence and stage acceptance above. This is
an implementation branch for review, not permission to silently deploy N=1,
notifications or migrate old market data. The existing full-CI chat timer harness
failure must also be fixed before a full release-gate claim.

Recorded foundation validation: contract tests 9/9; full integration 280/280;
frontend Node tests 68/68 plus frontend-core checks; syntax and diff checks passed.
An intermediate integration run had one production-boot readiness timeout; that
test passed independently and the full suite passed on rerun. Browser/live SLO,
shadow quality, canary, restore, soak and production acceptance are not verified.
