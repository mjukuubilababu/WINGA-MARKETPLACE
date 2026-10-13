# Winga Growth Loops — hali ya kazi na namna ya kuendelea

Updated: 13 October 2026. Specification: Growth Loops & Network Effects v1.0,
sections 1–106. Stable entry point for future work.

**Messages bado hazijakamilika, kulingana na taarifa ya user ya 13 October 2026.**
Internal sharing, Room membership/participation and meaningful message value
remain blocked for live acceptance. Historical CI and synthetic fixtures are
source evidence; they do not override this current product blocker.

**Full Growth Loops production readiness: NOT ACCEPTED.** Continue independent
source/design/security preparation now; retain actual acceptance gates for later.

- [Machine-readable ledger: all 106 sections](winga-growth-readiness.json)
- [Operations/security handoff and deferred validation matrix](growth-operations-handoff.md)
- [Previous requirement evidence map](growth-loops-spec-evidence-20261012.md)
- [Canonical Conversations handoff](conversations-spec-handoff.md)
- Inspect the current backlog with `npm run growth:readiness`.
- Validate report structure/source references with `npm run verify:growth-readiness`.
  These commands read repository files only. They do not send messages or run a canary.

## Snapshot and evidence boundary

Source baseline: `32891c76c82914684f5f0ddeb979d2c911e9be8c`.
Last previously verified release: Cloudflare build `20261013154536`, all four
Render services on that commit. That prior turn verified static assets, catalog
versions and backend health, with 146 frontend and 27 Growth browser cases in CI.
This is historical release evidence, **not confirmation of human message delivery**.

The verified release immediately before Phase 3 is `c26f2396`, Cloudflare build
`20261013170120`, with all four Render services on that source. Phase 3 changes
and isolated verification are recorded separately below and in its dedicated report.

The current work performs source inspection, presentation changes, documentation
and static build/catalog/bundle checks, plus isolated Phase 3 PostgreSQL retry,
burst and notification-outage exercises. No live message, Room admission, buyer
save/order, referral, notification, production load or provider chaos exercise is performed. Existing
mandatory CI fixtures may run on push; they remain synthetic and do not complete
live acceptance. No production cohorts, signing secrets, rollout switches or
notification schedules are changed by this work.

## What can be completed without live Messages

| Work | Current disposition | Concrete outcome |
| --- | --- | --- |
| Room purpose/design | SOURCE PREPARED | Welcome and product/shortlist/poll guidance, accurate search/archive empty states, readable comparison hints and the orange/ink visual identity in the existing Room UI. |
| Security evidence retention | SOURCE PREPARED | Exact-commit CodeQL SARIF archived for 90 days even when the review gate fails. No findings are waived or marked independently reviewed. |
| Requirement tracking | SOURCE PREPARED | All 106 specification sections retained in the JSON ledger with prior classification, evidence provenance and linked work IDs. |
| Operations handoff | PREPARED | Canonical admin metrics, replay limits, alert proposals, rollback and staging exercise/resumption instructions documented. Nothing scheduled or activated. |
| Report maintenance | SOURCE PREPARED | Static inspector checks coverage, statuses, dependencies and repository source links; readiness stays distinct from coverage. |

Presentation work is implemented in source and needs runtime/visual acceptance
later. A source-prepared status is not a production pass or a successful Room join.

Static checks performed in this work: Room/inspector JavaScript syntax, all 106
ledger sections/source references/dependency IDs, four catalogs with 1,754 keys,
zero new hard-coded UI debt, workflow YAML parsing and synchronized 98-module
static build. None of these checks confirms live delivery or Room participation.
Phase 3 now has 23 isolated PostgreSQL/PGlite, 22 commerce and 4 dashboard contracts, with 149/149
frontend core checks. See the Phase 3 report for exact scope and remaining acceptance.

The subsequent exact-source scan of `3f3a0314` produced 54 findings and preserved
its SARIF artifact. The [safe security input index](evidence/growth-security-review-input-20261013.json)
retains all 54 source locations/fingerprints, exact run/job/artifact identifiers,
archive digest and expiry. Every finding stays unreviewed; the index is a
historical navigation snapshot, not a current approval ledger. Retrieve a new
exact-SHA scan before approving source that changed after this snapshot.

## Phase 2 acceptance remains open

Phase 2 (Conversations rich sharing, Shopping Room invites and Room attribution)
is **not closed**. Sharing/recipient search and Room presentation are implemented
in source. The following acceptance remains:

1. Complete canonical Messages so structured product/content cards are actually
   accepted and received by the intended individual (MSG-01).
2. Create the first real Room; explicitly invite, join and meaningfully vote,
   comment or add a product (LIVE-02). No user Room has been created here.
3. Verify invite creation/open/acceptance/participation attribution, distinct from
   registration or a preview crawler (LIVE-02).
4. Complete current security/abuse acceptance: privacy, both block directions,
   expiry/revocation, canonical membership and duplicate protection (SEC-01/CAP-01).

Continue Phase 3 independently: Demand Resolution, Seller Opportunity and Restock
owners already exist. That work does not close Phase 2 or require a substitute
messaging/invitation system. Buyer/seller value and provider/staging observations
still require their own actual evidence before production acceptance.

## Phase 3 implementation completed; live acceptance open

[Phase 3 report](growth-phase3-status-20261013.md) records the canonical source
audit, repeated-search and goal/product linkage fixes, idempotent resolution,
notification failure isolation, restock confirmation UX and seller evidence
guidance. Search/restock request cohorts are separately available in the existing
marketplace admin report/dashboard. Existing infrastructure and flags are reused.

Isolated SQL/frontend checks verify those contracts; real buyer resolution,
seller usefulness/return, regional/provider/capacity acceptance and current
independent review remain LIVE-03/OPS-01/CAP-01/RET-01/SEC-01. Seller paid/delivered
value and mature repeat-response measurement are implemented; tracked restock
notices now require the requested active variant to have unreserved stock.
[Security triage](growth-security-triage-20261013.md) accounts for all 54 findings
without claiming independent approval. Phase 3 does not
silently close Phase 2, complete Messages or declare the full specification ready.

## Current capability audit

Classifications describe current source/product scope, not a production certificate.
The dated 12 October audit remains historical; this table includes the latest
sharing changes and the user-reported Messages blocker.

| Capability | Classification | Canonical source / current boundary |
| --- | --- | --- |
| Product share sheet, WhatsApp, copy/native | IMPLEMENTED | `app.js`, `src/growth/internal-share.js`; public external sharing remains separate from internal delivery. Prior release evidence available. |
| Product deep links / guest-first content | IMPLEMENTED | `src/growth/contract.js`, `app.js`; canonical direct destination and useful unavailable-content fallback. |
| People/Room discovery | IMPLEMENTED | `backend/people-search.js`, `src/api/social-client.js`, existing inbox/native Room readers; active public profiles, either block direction excluded. |
| Individual rich sharing | PARTIAL | Picker/source exist, canonical encrypted send remains authoritative; live delivery depends on MSG-01. |
| Conversation structured cards | PARTIAL | Product/Reel/Short/Collection/authorized commerce references present; meaningful live messaging not accepted. |
| Shopping Room creation/invites | PARTIAL | Existing MLS/token/privacy/expiry/revoke/approval architecture retained; real first Room and participation pending. |
| Generic contact/reward invites | MISSING / CONDITIONAL | Not required in utility-first V1. No new contact upload, reward scheme or duplicate invite service introduced. |
| Utility seller referral | IMPLEMENTED / PARTIAL | Canonical envelopes/opportunity ACL/category relevance and first-value source exist; real seller value and fraud operating evidence pending. |
| Demand/Opportunity/supply resolution | IMPLEMENTED / PARTIAL | Canonical search evidence, N=1 confidence, response/product/resolution linkage and explicit subscriptions present; production usefulness unobserved here. |
| Seller activation/liquidity | IMPLEMENTED / PARTIAL | Canonical category/regional inventory and first-value reports; relevance, fulfillment and meaningful qualified leads require actual operating evidence. |
| Creator/Reel/Short/profile sharing | IMPLEMENTED / CONDITIONAL | Existing public-content flow and flags; future arbitrary Posts/collaboration/incentives remain scoped out. |
| Saved/Collections/following | IMPLEMENTED / PARTIAL | Public visibility and Person graph owners retained; real cohort utility/retention acceptance open. |
| Review/trust loop | IMPLEMENTED / PARTIAL | Delivered-order/nonself/dedupe source rules exist; actual review integrity and marketplace health require observation. |
| Notifications | IMPLEMENTED / PARTIAL | Existing message and explicit resolution preferences/dedupe/caps; provider delivery and fatigue/opt-out operating acceptance open. No new reminders. |
| Attribution/event schema/multi-touch | IMPLEMENTED / PARTIAL | Existing opaque envelope/versioned dedupe/first-last-touch/outbox retained; conversion is not an open and private bodies excluded. Cross-device causal attribution not invented. |
| Auth return / routing | IMPLEMENTED / PARTIAL | Destination/action contracts retained; real message-dependent return paths await MSG-01. |
| Anti-spam/blocks/privacy | IMPLEMENTED / PARTIAL | Canonical user/IP quotas, both block directions, invite privacy/consent and eligibility rechecks; current independent review/abuse acceptance remain open. |
| Bots/preview crawlers | IMPLEMENTED / PARTIAL | Known-agent filtering exists; comprehensive bot/account-farm resistance not established. |
| Per-loop dashboards/cohorts | IMPLEMENTED / PARTIAL | `src/admin/ui.js`, canonical admin reports; unavailable reports are not zeros, immature retention is not a pass. |
| Retry/DLQ/reconciliation | IMPLEMENTED / PARTIAL | Shared durable jobs and scoped browser outbox; canonical event IDs, bounded retries/deadline/replay. Production operations not accepted. |
| Feature flags/kill switches | IMPLEMENTED / PARTIAL | Existing owners retained; confirm actual configuration before rollout. This work does not expand any cohort or enable a loop. |
| Regional performance/load/chaos | PARTIAL | Earlier bounded fixtures/local timings exist; real regional SLO and production-scale/provider-outage evidence absent. |

No duplicated messaging/invite/attribution infrastructure is created. No new
UNSAFE capability is asserted without finding-level evidence; SEC-01 stays open.

## Remaining hardening and acceptance

| ID | Priority / status | What remains / finish criterion |
| --- | --- | --- |
| MSG-01 | P0 BLOCKED | Finish canonical Messages and trusted native membership/device readiness. Capture real explicit sender/recipient acceptance with stable retries, no downgrade, and meaningful delivery. |
| SEC-01 | P0 NEEDS HARDENING | Independently review current exact-SHA security/crypto inputs. Scan of `3f3a0314`: 54 findings (21 error, 33 warning), `CODEQL_REVIEW_STALE`, zero current reviewed findings. Full safe input index and 90-day SARIF archive available. Scanner levels are not proof of exploitability or a completed review. |
| LIVE-01 | P1 DEFERRED | Consented Product Share open/view/save/message/reshare, exact auth return and privacy. Public-link value and internal-message value are separate transitions. |
| LIVE-02 | P1 BLOCKED | First real Room, capability/config checks, canonical membership, scoped invitation, expiry/revoke/block and meaningful vote/comment/product participation. |
| LIVE-03 | P1 OBSERVATION | Legitimate N=1 demand → eligible seller response → relevant supply → actual buyer resolution; quality/fulfillment/fairness and paid/organic separation. |
| OPS-01 | P1 OBSERVATION | Real report baselines, calibrated regional targets, alert ownership, bounded replay/DLQ drills and preference-aware notification operation. |
| CAP-01 | P1 DEFERRED | Approved isolated staging load/chaos/privacy/race matrix. Earlier local success is not viral capacity. |
| RET-01 | P2 OBSERVATION | Genuine acquisition/value/abuse/opt-out cohorts and mature D1/D7/D30 windows. Wait for real time and observations. |
| OPT-01 | CONDITIONAL | Rewards, contact integration, guest Room voting/commenting, new creator economics and experiments require separate explicit scope/product policy. Their absence does not justify duplicate V1 infrastructure. |
| REL-01 | P0 BLOCKED | Section 106 declaration cannot close until mandatory acceptance and current review gates actually close. |

Additional source-review observations to retain for later hardening:

- Room refresh reads histories/boards across memberships every visible polling
  cycle. Large-room/many-room fan-out, backpressure and mobile/battery impact need
  measured limits; do not change unread/admission semantics blindly.
- Room comparison intentionally shows missing attributes as not provided. Its
  Votes row has no product-vote mapping; do not infer counts by matching poll text
  or manufacture a ranking. Clarify an explicit model before adding that signal.
- Timing samples are bounded client observations. They do not establish trusted
  regional SLOs, cross-device journeys or comprehensive bot exclusion.
- Replay is an operator-controlled retry of existing eligible evidence, never a
  backfill that invents delivery, acceptance or missing human actions.
- SARIF retention improves access. It does not replace finding-level review,
  cryptographic conformance review or a source-bound independent approval.

## Definition of Done (§106)

| Requirement | Current acceptance |
| --- | --- |
| Existing architecture audited | Source audit recorded; historical and current blockers distinguished. |
| One canonical deep-link system | Source present; private invitations remain authorization scoped. |
| Attribution contract | Source present; no current live end-to-end value acceptance. |
| Guest-first shared product | Prior release/fixture evidence; current human canary deferred. |
| Auth return to context | Source/prior fixture evidence; message-dependent acceptance deferred. |
| Product loop measured end-to-end | LIVE-01 open. |
| Room loop measured end-to-end | MSG-01/LIVE-02 open. |
| Demand → Opportunity → Supply linkage | Source present; LIVE-03 value observation open. |
| Seller liquidity metrics | Canonical reports present; production quality/value observation open. |
| Anti-spam/rate limits | Source present; current security/abuse acceptance open. |
| Duplicate protection tested | Historical synthetic evidence; no new live acceptance in this work. |
| Block/report/privacy enforced | Canonical source retained; SEC-01/CAP-01 open. |
| Bots/crawlers excluded from conversion | Known-agent source present; live traffic/farm resistance not certified. |
| Notification frequency/dedupe verified | Source present; provider/preferences/fatigue acceptance open. |
| Flags/kill switches | Source present; actual rollout/config verification remains required. |
| Failure isolation tested | Historical fixtures; staged outage/CAP-01 pending. |
| Deep-link performance measured | Local observations exist; OPS-01 regional acceptance open. |
| Load/chaos/security passed | Not accepted; SEC-01/CAP-01 open. |
| Loop dashboards available | Existing admin UI/reports; real mature observations unavailable. |
| No critical core regression | Existing CI retained; no full live declaration while Messages incomplete. |
| Rollout/rollback procedure | Prepared in canonical rollout and operations handoff; operator acceptance open. |

## Resume here later

1. Read this report and `npm run growth:readiness`. Check source HEAD and the exact
   evidence SHA/date; historical reports may describe earlier implementations.
2. Finish MSG-01 in the canonical Conversations owners. Do not replace E2EE,
   membership or stable acceptance with a growth-side workaround.
3. Retrieve the exact-commit security artifact and complete SEC-01 honestly.
4. Confirm existing consent and current cohort/configuration. The three-account
   consent is already recorded in the chat; do not publish participant identities
   here or silently expand the cohort. No real Room has been created by the user.
5. Execute LIVE-01/LIVE-02 and the remaining independent marketplace/ops work in
   the controlled rollout order. Record trace provenance without private bodies,
   tokens, contacts or payment details.
6. Close work IDs only with concrete evidence. Update JSON and this summary in
   the same commit; preserve prior snapshots rather than turning unknowns into 0.
7. Complete actual §106 acceptance, then expand the rollout. CI success alone is
   not the completed production growth contract.
