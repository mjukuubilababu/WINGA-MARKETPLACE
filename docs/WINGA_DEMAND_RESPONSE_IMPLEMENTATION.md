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

## Server outcome observation increment

`WINGA_SEARCH_OUTCOME_SHADOW_ENABLED=true` opts into observation of the existing
GET /api/products?q= path. Default is off. No deployment variables were changed.
The producer runs after sending results, has at most two pending tasks per process, retries
queue insertion at most three times with exponential backoff and jitter, and
counts failures/load shedding in admin analytics. It excludes pagination, staff,
seller and category-filtered searches. The local development fallback is not
captured. The existing browser-only filtering/image path is not yet integrated.

Only server-returned totals are recorded. Primary reads, cache and replica results
are distinguished. Fresh primary does not certify index completeness, semantic
quality or adequate supply. Therefore zero outcomes remain ZERO_RESULTS_UNVERIFIED
and nonzero outcomes MATCH_QUALITY_UNVERIFIED. The search-quality gate is not set
by the route. Seller eligibility and unmet demand remain false until both search
quality and sensitive-search policy pass acceptance. No notification or confidence
promotion follows from these observations.

This reuses intelligence_event_queue and intelligence_events, not a parallel
Demand/Opportunity engine. A single queue INSERT is the durable capture boundary.
Existing claim/recovery/dead-letter/manual replay mechanisms apply after commit.
Embedded and external workers persist these versioned observations without score
updates or WIP learning; event-ID uniqueness makes a crash after ledger commit
before acknowledgement safe to replay. Invalid schema/payload is terminal.
Client telemetry cannot submit this reserved server event type. Admin diagnostics
expose bounded aggregate classification/outcome/integrity counts, no query/actor.
Raw internal observations follow existing intelligence-event retention (default
180 days); privacy policy approval and retention tuning remain release gates.

Initial increment limitation: the bounded pre-enqueue task is process memory. A crash
after HTTP response and before queue commit, overload shedding, exhausted retries
or a shutdown can lose capture. This increment does NOT satisfy durable capture
for every search or the transactional outbox contract for future Demand updates.
No capture SLO, zero-loss claim, raw-vs-unique aggregate, supply matcher, canonical
N=1 visibility or end-to-end resolution acceptance is claimed. Next work is the
authoritative SearchEvent/result-quality integration with stable client retry
identity and a durable ingress protocol, then transactional aggregate/outbox
processing and shadow quality comparison before canary seller cutover.

Recorded increment validation: full integration 288/288; focused demand/observer
tests 17/17 after the final reserved-name sanitization and concurrency bound.
The queue/ledger test uses a PostgreSQL engine, replays a committed observation
100 times before acknowledgement, and has no scoring tables to detect unintended
score writes. Syntax and diff checks passed. No production flag, secret, schema
migration or deployment was changed; production/browser/performance and recovery
acceptance remain unverified.

## Durable capture receipt continuation

The server now returns a bounded, domain-separated HMAC-signed capture receipt
with supported shadow search responses. It contains only the server-built outcome
envelope and expires after 24 hours. Existing CSRF secret material is reused with
a distinct signing domain; no secret/configuration was changed. All nodes must
share that existing secret. These are signed bearer receipts, not encrypted data;
responses containing them and capture acknowledgements are no-store. Do not log
receipts or raw queries. Secret rotation invalidates pending receipts.

`POST /api/search-demand/capture` preserves origin, CSRF, JSON and rate-limit
guards. It accepts only a valid signed receipt, uses its original server outcome,
and returns durablyRecorded:true only after queue insertion commits. A duplicate
already stored in that queue acknowledges the same event. A DB failure returns a
bounded 503 code; a forged/expired receipt gets 400. No Demand counter, score or
notification is accepted from the client. Flag off or missing PostgreSQL returns
503. The browser submits this independently of search results.

For remote loadProductsPage searches, the data service supplies a stable searchId
(callers can preserve options.searchId across HTTP retries) and a privacy-safe
anonymous demand-session reference. The server namespaces event identity by its
hashed actor and normalized query. Repeating an intent with a new searchId is a
new raw event; retries reuse the same event. This is transport dedupe only; unique
actor/window aggregation remains unimplemented. Browser-only search/image
filtering is still outside this outcome integration.

The existing intelligence API client durably stores each pending receipt under
its own versioned localStorage key before background submission. Independent keys
avoid lost queue entries from cross-tab list overwrites. Recovery runs on client
initialization and online events. Work is account-scoped; a different signed-in
account does not flush previous account receipts. The queue retains at most 50
receipts, invalidates them at 24 hours and removes expired records on the next
queue scan, persists a 12-attempt retry budget, uses bounded
backoff with jitter, and removes only matching durable acknowledgements or terminal
400/410 rejections. Concurrent tabs may send duplicates and race on retry budget;
server uniqueness protects canonical business effects. Pending receipts may remain
at their attempt limit until expiry. Browser storage/quota failure or queue overflow
does not fail search and is not reported as durable capture. No pending work is
silently evicted to accept a new receipt. These private browser records contain
the receipt/search query and current account owner; retention/privacy acceptance
and explicit user-deletion handling remain release requirements.

The original bounded server observer is a best-effort backstop using the SAME
event identity as the receipt. Worker ledger processing now rechecks primary
classification evidence in its transaction so receipt recovery cannot bypass the
identity boundary. Evidence-query failure rolls back and retries the durable job.
Neither producer invokes the legacy seller pipeline or learning/scoring path.

Remaining durability boundary: a server crash before its queue commit can be
recovered when the browser has saved the receipt. A crash before the browser
receives/persists it, storage rejection, explicit data clearing, receipt expiry,
or exhausted retries can still lose capture. HTTP search success does not promise
durable intelligence capture. No zero-loss or capture SLO is claimed. This closes
the missing durable-ack/retry protocol for supported observations; transactional
Demand-state/outbox emission and complete authoritative match-quality integration
are still pending before N=1 canary.

Recorded continuation validation: focused demand/capture tests 26/26; full
integration 297/297; frontend Node tests 68/68 and frontend-core checks; frontend
build and 81-module bundle synchronization passed. Tests include concurrent
100-delivery queue dedupe, acknowledgement ordering, forged/expired receipt
rejection, reload recovery, account boundaries, cross-tab receipt preservation,
storage failure and bounded retries. No production variables or deployment changed.
Browser-live receipt recovery, capture latency/load, privacy-retention acceptance
and complete Demand-state/outbox recovery are still unverified.
