# Growth Loops — Phase 3 implementation and acceptance

Date: 13 October 2026. Source baseline before this continuation:
`c26f23960be553ee26554aaf067b34151b6a5959`.

**Implementation/hardening completed for this release. Live production acceptance
remains open.** Phase 2 remains open as documented in
[the main status report](winga-growth-status.md#phase-2-acceptance-remains-open).
This continuation does not complete Messages, admit a real Room member or close
independent security review.

## Scope and canonical owners

Phase 3 covers Demand Resolution (§18–20, §27), Seller Opportunity retention
(§21) and Restock (§28). These reuse canonical Search Demand, commerce goals,
Opportunity/supply responses, rediscovery eligibility, product availability and
notification records. No second demand engine, invite system, message transport,
notification service or public attribution parameter is introduced.

| Capability | Source classification / result | Acceptance boundary |
| --- | --- | --- |
| N=1 Search and product demand → Opportunity | IMPLEMENTED | Distinct-audience evidence and single-signal confidence remain canonical; one request is not a proven trend. |
| Explicit Search subscriptions / auth return | IMPLEMENTED | Owned recent unmet-search evidence, quotas and safe auth intent retained. Real regional discovery and return remain unobserved here. |
| Repeated-search resolution | BROKEN → FIXED IN SOURCE | A subscription could retain the latest event while supply retained the first event. Matching now joins canonical audience and identical query/category/color/region evidence, retaining both original event IDs. |
| Expired request renewal | BROKEN → FIXED IN SOURCE | Active requests outside the 90-day processing lifetime could suppress a fresh subscription. Fresh owned evidence now creates a new request; previous history and original source IDs remain intact. |
| Search-goal product continuity | BROKEN → FIXED IN SOURCE | Subsequent buyer actions could miss a matched query-only goal without a separate recommendation. The canonical supply-match transition now provides product binding for later transitions, including existing ledger history. |
| Stop/found retry | PARTIAL → HARDENED | A committed same-owner terminal resolution is returned on retry; no second transition is created and another owner cannot read the result. |
| Product-restock consent | IMPLEMENTED / HARDENED UX | Explicit notification consent remains required; a signal without a confirmed canonical goal is not presented as a saved availability request. Retry remains available. |
| Seller Opportunities | IMPLEMENTED / HARDENED UX | Early-signal guidance, no guaranteed-sale copy, a requested-product action for restock, existing relevant seller ACL/expiry/dismissal and canonical supply creation retained. |
| Demand notification opening | PARTIAL → HARDENED | Product access precedes optional read acknowledgement. Failed/hanging acknowledgement cannot block the destination; stale account/session reads cannot open it. |
| Consent/caps/privacy | IMPLEMENTED IN SOURCE | In-app only, at most two demand notices per recipient/day, stable notice identity, canonical safety/blocks and rollback/retry retained. Current independent review and operating acceptance remain open. |
| Search/restock request reporting | IMPLEMENTED | Separate 90-day request cohorts added to the existing marketplace admin report/dashboard; unavailable reports remain unavailable. |
| Seller first value / repeat usefulness | PARTIAL | Existing supply/outcome and seller-activation owners retained. Qualified buyer value and actual seller return require operating observations. |

There is no duplicate infrastructure introduced by this release. A source fix is
not a real purchase, recipient return, provider delivery or independent approval.

## Resolution and attribution contracts

- A search request retains its actual `sourceEventId`. Supply eligibility retains
  its own original source event. Repeated events can resolve the same need only
  with matching canonical user audience, query, category, color and region.
  Different actors, contexts, expired eligibility and withdrawn states cannot
  satisfy that request. Share views/Ads do not become Search Demand.
- A canonical `looking → matched` transition from `demand_supply_match` binds the
  actual product. Later contact/order/completion uses that durable history without
  rewriting the original query goal as a product request or needing a synthetic
  recommendation. Wrong account/product and duplicate transitions remain denied.
- Restock continues through canonical product availability, seller-owned supply
  response and explicitly opted-in goals. The existing public product reader
  rechecks current eligibility; notification text asks the recipient to verify fit.
- Demand notices are durable in-app rows with goal-scoped IDs. The processor's
  transaction preserves match/notice atomicity and the shared recipient cap.
  The browser does not await read bookkeeping before opening the relevant product.

## Existing dashboard, new request cohort

`GET /api/admin/growth/marketplace` remains authenticated/admin-only and no-store.
Its new `demandRequests` field is aggregate-only and contains separate
`search_subscription` and `sold_out_demand` rows over goals created in 90 days:

| Field | Meaning |
| --- | --- |
| `requested` / `looking` | Explicitly consented requests / current unresolved-looking state. |
| `matched` | Canonical supply-match transition exists. Not buyer satisfaction. |
| `notified` | A durable same-owner demand notice exists. Not a human open or provider delivery. |
| `ordered` / `delivered` | Canonical order-created / delivered goal transitions; user resolution is excluded from delivery. |
| `selfReportedFound` | Explicit user declaration, retained separately from canonical delivery. |
| `stopped` | Explicit stopped resolution, distinct from declaring the need found. |
| `matchRate` / `notifyRate` | Matching/notified goals divided by the same request cohort. |
| `timeToSupplyMatchSeconds` | Nonnegative server-ledger interval; not recipient time to value or a regional SLO. |

The existing marketplace section continues to report eligible supply, search-result
proxies, seller first-value cohorts and owned order-outcome lineage separately.
No private query, buyer identifier, product ID, message body, payment detail or
contact list leaves the new aggregate. Missing evidence is not synthesized into
human activation or a healthy zero-value loop.

## Local verification

- Thirteen isolated PGlite SQL contracts passed, including repeated-search matching,
  lifetime-aware renewal, context/actor/eligibility rejection, original event preservation, matched-goal
  continuity without recommendations, terminal retry, consent/caps/stop, current
  product privacy/blocks and notification rollback.
- Twenty-two canonical commerce Opportunity/outcome contracts passed.
- Frontend core: 149/149, including failed/hanging demand-notice acknowledgement,
  account/session change while product resolution is pending, and restock request
  confirmation requiring a canonical goal rather than a signal alone.
- Three dashboard contracts passed: unavailable remains unknown, text rendering
  and late-account response isolation.
- Four localization catalogs contain 1,747 matching keys; zero new hard-coded UI
  debt. Syntax, static build and generated module synchronization are checked.

These are isolated fixtures/static checks. No manual live message, subscription,
restock, order, notification, referral, Room, load or provider-outage exercise was
performed. Mandatory push CI remains required and is separate from human value
acceptance. No rollout flag, recipient cohort or operational schedule is changed.

## Remaining operating acceptance and resumption

Phase 3 source completion is recorded as `SRC-05`; actual value stays `LIVE-03`.
Before production acceptance:

1. Complete current exact-source independent security review (SEC-01). Earlier
   SARIF snapshots are navigation evidence, not approval of this changed source.
2. In the authorized controlled environment, observe one legitimate unmet search
   → eligible seller response → relevant public supply → explicitly requested
   notice → buyer return and canonical value. Keep original lineage IDs; no fake
   search, purchase or backfilled human participation.
3. Observe a sold-out request → seller-owned restock → correct fit/availability
   → opted-in notice → genuine buyer action. Check stop, current blocks/privacy
   and duplicate retries. Review variant/inventory fit with canonical owners.
4. Observe Opportunity relevance, useful seller response and actual qualified
   value/return. Supply response or a notice alone is not seller activation.
5. Calibrate regional timings, provider/worker recovery, repeated inventory-cycle
   attribution, recipient fatigue and retention from real evidence (OPS-01/RET-01).
   Profile the canonical matching query and execute isolated staging load/outage
   and race exercises (CAP-01) before scaling.

These checks can use non-message buyer actions while Messages is incomplete.
Message-dependent value, Phase 2 Room participation and protocol acceptance remain
MSG-01/LIVE-02. Full §106 readiness remains **NOT ACCEPTED**.

## Rollout and rollback

Retain [the canonical rollout](growth-loops-rollout.md) and
[operations handoff](growth-operations-handoff.md).
`WINGA_GROWTH_DEMAND_RESOLUTION_ENABLED` (backend/intelligence worker) and
`growthDemandResolution` (frontend) remain with their existing default/configuration
and owners; this release does not change them. Existing workers may process
legitimate explicit opt-ins under the actual configured flags after deployment;
that is not a manual canary or a claim of human delivery by this work.

There are no new migrations: existing goals/transitions, search/supply evidence,
eligibility and notifications are reused. Roll back affected code to the previous
verified release without deleting durable records or migration history. Stop the
optional processor through its existing flag when operationally authorized;
retain product access, public links and canonical inventory/commerce owners.
