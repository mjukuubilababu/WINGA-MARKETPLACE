# Growth Loops v1.0 — requirement and release evidence

> Current continuation status (13 October 2026): the user reports Messages are
> incomplete. Historical fixtures/operator reports are not current live acceptance.
> Use [the durable Growth status and blockers](winga-growth-status.md) when resuming.


Date: 2026-10-12. This is an evidence map, not a production-readiness certificate.
The initial audit predates the remediations in the current branch. Every section
of the supplied contract is mapped below; SOURCE VERIFIED means implemented and
checked in source/local fixtures, not proven production conversion or capacity.
SCOPED marks an optional/future capability deliberately kept within canonical
owners. OBSERVATION/OPS/CAPACITY GATE requires actual operating evidence.

## Reproducible evidence

- `npm run test:growth`: share policy/SQL/runtime/jobs/reports/cohorts/referrals/network.
- `npm run test:growth:postgres`: disposable pinned PostgreSQL 18.6; SQL concurrency, source dedupe, quotas/locks, referral lineage, native Room invite and signed internal lookup; fixture schema/container cleanup.
- `npm run test:shopping-rooms`: actual MLS invite admission, encrypted rich content, block/revoke/leave/duplicate state and private-message sentinel protection.
- Browser: `tests/e2e/growth-loops.spec.js` with the local cloud-setup Playwright config; exact guest/auth destinations, feature-disabled and analytics503 fallbacks, public content/referral/Opportunity flows.
- `npm run test:conversation-security`, `test:commerce-outcomes`, `test:frontend`, `verify:modules-sync`, `test:localization`; relevant API/inventory/public-reader suites.
- `docs/evidence/growth-canary-local-20261012.json`: actual browser + owned PostgreSQL synthetic rehearsal. Eight checks, 24 simultaneous share reads, zero errors; original IDs and canonical value records. User agents explicitly simulated; no real acquisition/transactions claimed.
- Prior exact live release: backend `fddf3e8a91d2e0967b64905449792fbb41c8e923`, Cloudflare binding `20261012195723`, backend/Phoenix HTTP200. Later release evidence must match its own SHA/build.

## Every specification section

| Section | Classification | Canonical evidence / limit |
| --- | --- | --- |
| 1 | SOURCE VERIFIED | Audit in growth-loops-audit-20261012.md; baseline and remediation distinguished. |
| 2 | SOURCE VERIFIED | Shared growth contract/store/envelopes, durable jobs and versioned measurable transitions; feature owners retained. |
| 3 | SOURCE VERIFIED | Shared growth contract/store/envelopes, durable jobs and versioned measurable transitions; feature owners retained. |
| 4 | SOURCE VERIFIED | Canonical product routes, native/internal/WhatsApp/copy shares, immediate guest value, no registration conversion; product browser and PostgreSQL evidence. |
| 5 | SOURCE VERIFIED | Canonical product routes, native/internal/WhatsApp/copy shares, immediate guest value, no registration conversion; product browser and PostgreSQL evidence. |
| 6 | SOURCE VERIFIED | Canonical product routes, native/internal/WhatsApp/copy shares, immediate guest value, no registration conversion; product browser and PostgreSQL evidence. |
| 7 | SOURCE VERIFIED | Canonical product routes, native/internal/WhatsApp/copy shares, immediate guest value, no registration conversion; product browser and PostgreSQL evidence. |
| 8 | SOURCE VERIFIED | Canonical product routes, native/internal/WhatsApp/copy shares, immediate guest value, no registration conversion; product browser and PostgreSQL evidence. |
| 9 | SOURCE VERIFIED | Canonical product routes, native/internal/WhatsApp/copy shares, immediate guest value, no registration conversion; product browser and PostgreSQL evidence. |
| 10 | SCOPED | Room guest preview is explicit public products only. Guest vote/comment deliberately unavailable; native account membership required. |
| 11 | SOURCE VERIFIED | HMAC hash-only token, TTL/revoke/quota/native MLS admission/blocks; accepted-message metadata proof and separate Room funnel. |
| 12 | SOURCE VERIFIED | HMAC hash-only token, TTL/revoke/quota/native MLS admission/blocks; accepted-message metadata proof and separate Room funnel. |
| 13 | SOURCE VERIFIED | Existing encrypted rich-reference codec and signed native metadata lookup; product, Reel/Short, Collection, Room and authorized order context keep canonical owners. Private bodies excluded. |
| 14 | SOURCE VERIFIED | Existing encrypted rich-reference codec and signed native metadata lookup; product, Reel/Short, Collection, Room and authorized order context keep canonical owners. Private bodies excluded. |
| 15 | SOURCE VERIFIED | Marketplace report: eligible positive-price inventory, local search-result proxy, first-known approval and nonself signals; actual relevance/fulfillment quality remains observational. |
| 16 | SOURCE VERIFIED | Marketplace report: eligible positive-price inventory, local search-result proxy, first-known approval and nonself signals; actual relevance/fulfillment quality remains observational. |
| 17 | SOURCE VERIFIED | Marketplace report: eligible positive-price inventory, local search-result proxy, first-known approval and nonself signals; actual relevance/fulfillment quality remains observational. |
| 18 | SOURCE VERIFIED | Canonical search-event→demand→Opportunity→response→product→resolution/order linkage, N=1 evidence/confidence distinction; opt-in capped notifications and authorized exact Opportunity routing. |
| 19 | SOURCE VERIFIED | Canonical search-event→demand→Opportunity→response→product→resolution/order linkage, N=1 evidence/confidence distinction; opt-in capped notifications and authorized exact Opportunity routing. |
| 20 | SOURCE VERIFIED | Canonical search-event→demand→Opportunity→response→product→resolution/order linkage, N=1 evidence/confidence distinction; opt-in capped notifications and authorized exact Opportunity routing. |
| 21 | SOURCE VERIFIED | Canonical search-event→demand→Opportunity→response→product→resolution/order linkage, N=1 evidence/confidence distinction; opt-in capped notifications and authorized exact Opportunity routing. |
| 22 | SCOPED | Current public Reel/Short/photo Reel/profile sharing and follow/save metrics supported. Future collaboration/brand economics and arbitrary creator Posts not invented. |
| 23 | SCOPED | Current public Reel/Short/photo Reel/profile sharing and follow/save metrics supported. Future collaboration/brand economics and arbitrary creator Posts not invented. |
| 24 | SOURCE VERIFIED | Existing Person→Person follow graph, public content/block eligibility and explainable reasons; network report is potential eligible updates, never feed impressions or purchase content. |
| 25 | SOURCE VERIFIED | Existing Person→Person follow graph, public content/block eligibility and explainable reasons; network report is potential eligible updates, never feed impressions or purchase content. |
| 26 | SOURCE VERIFIED | Public Collections, explicit Search/restock subscriptions, canonical delivered-order review creation and eligible trust reporting. |
| 27 | SOURCE VERIFIED | Public Collections, explicit Search/restock subscriptions, canonical delivered-order review creation and eligible trust reporting. |
| 28 | SOURCE VERIFIED | Public Collections, explicit Search/restock subscriptions, canonical delivered-order review creation and eligible trust reporting. |
| 29 | SOURCE VERIFIED | Public Collections, explicit Search/restock subscriptions, canonical delivered-order review creation and eligible trust reporting. |
| 30 | SOURCE VERIFIED | Utility-based category-relevant seller referral reuses canonical envelopes; protected first approval/nonself first value. No generic buyer reward scheme. |
| 31 | SOURCE VERIFIED | Utility-based category-relevant seller referral reuses canonical envelopes; protected first approval/nonself first value. No generic buyer reward scheme. |
| 32 | SOURCE VERIFIED | Single destination validator/router; allowlisted expiring auth intents; opaque envelope, bounded first/last-touch journal. Private Conversation invitation absent; no arbitrary redirects. |
| 33 | SOURCE VERIFIED | Single destination validator/router; allowlisted expiring auth intents; opaque envelope, bounded first/last-touch journal. Private Conversation invitation absent; no arbitrary redirects. |
| 34 | SOURCE VERIFIED | Single destination validator/router; allowlisted expiring auth intents; opaque envelope, bounded first/last-touch journal. Private Conversation invitation absent; no arbitrary redirects. |
| 35 | SOURCE VERIFIED | Single destination validator/router; allowlisted expiring auth intents; opaque envelope, bounded first/last-touch journal. Private Conversation invitation absent; no arbitrary redirects. |
| 36 | SOURCE VERIFIED | Per-loop activation/value/continuation/cohorts/dashboards with explicit units. Unknown delivery and causal acquisition mean K-factor null, not invented. |
| 37 | SOURCE VERIFIED | Per-loop activation/value/continuation/cohorts/dashboards with explicit units. Unknown delivery and causal acquisition mean K-factor null, not invented. |
| 38 | SOURCE VERIFIED | Per-loop activation/value/continuation/cohorts/dashboards with explicit units. Unknown delivery and causal acquisition mean K-factor null, not invented. |
| 39 | SOURCE VERIFIED | Per-loop activation/value/continuation/cohorts/dashboards with explicit units. Unknown delivery and causal acquisition mean K-factor null, not invented. |
| 40 | SOURCE VERIFIED | Per-loop activation/value/continuation/cohorts/dashboards with explicit units. Unknown delivery and causal acquisition mean K-factor null, not invented. |
| 41 | SOURCE VERIFIED | Explicit user actions, SQL quotas/dedupe, recipient preference, symmetric blocks/report/leave/mute. No platform invite reminders; fatigue reminders conditional and disabled. |
| 42 | SOURCE VERIFIED | Explicit user actions, SQL quotas/dedupe, recipient preference, symmetric blocks/report/leave/mute. No platform invite reminders; fatigue reminders conditional and disabled. |
| 43 | SOURCE VERIFIED | Explicit user actions, SQL quotas/dedupe, recipient preference, symmetric blocks/report/leave/mute. No platform invite reminders; fatigue reminders conditional and disabled. |
| 44 | SOURCE VERIFIED | Explicit user actions, SQL quotas/dedupe, recipient preference, symmetric blocks/report/leave/mute. No platform invite reminders; fatigue reminders conditional and disabled. |
| 45 | SOURCE VERIFIED | Explicit user actions, SQL quotas/dedupe, recipient preference, symmetric blocks/report/leave/mute. No platform invite reminders; fatigue reminders conditional and disabled. |
| 46 | SOURCE VERIFIED | No address-book ingestion. Public projections exclude message/search/order/Room secrets; token scope and native membership protect private contexts. |
| 47 | SOURCE VERIFIED | No address-book ingestion. Public projections exclude message/search/order/Room secrets; token scope and native membership protect private contexts. |
| 48 | SOURCE VERIFIED | Eligibility rechecked after authorization, safe same-origin router, UUID/token validation, expiry/revocation and unavailable-content Explore fallback; legacy product paths preserved. |
| 49 | SOURCE VERIFIED | Eligibility rechecked after authorization, safe same-origin router, UUID/token validation, expiry/revocation and unavailable-content Explore fallback; legacy product paths preserved. |
| 50 | SOURCE VERIFIED | Eligibility rechecked after authorization, safe same-origin router, UUID/token validation, expiry/revocation and unavailable-content Explore fallback; legacy product paths preserved. |
| 51 | SOURCE VERIFIED | Optional tracking off critical destination/send path; bounded original-lifetime browser outbox and durable Room/referral jobs, idempotent sources, exponential retries/DLQ/replay/reconciliation. |
| 52 | SOURCE VERIFIED | Optional tracking off critical destination/send path; bounded original-lifetime browser outbox and durable Room/referral jobs, idempotent sources, exponential retries/DLQ/replay/reconciliation. |
| 53 | SOURCE VERIFIED | Optional tracking off critical destination/send path; bounded original-lifetime browser outbox and durable Room/referral jobs, idempotent sources, exponential retries/DLQ/replay/reconciliation. |
| 54 | SOURCE VERIFIED | Optional tracking off critical destination/send path; bounded original-lifetime browser outbox and durable Room/referral jobs, idempotent sources, exponential retries/DLQ/replay/reconciliation. |
| 55 | SCOPED | No incentive/reward system exists. Self, crawler and duplicate activity excluded; unknown bots/multi-account farms not claimed fully solved. |
| 56 | SOURCE VERIFIED | Canonical safety/relevance first; no growth-based ranking override, sponsored distribution separate. Marketplace/Conversation/Room/Trust reports express network utility. |
| 57 | SOURCE VERIFIED | Canonical safety/relevance first; no growth-based ranking override, sponsored distribution separate. Marketplace/Conversation/Room/Trust reports express network utility. |
| 58 | SOURCE VERIFIED | Canonical safety/relevance first; no growth-based ranking override, sponsored distribution separate. Marketplace/Conversation/Room/Trust reports express network utility. |
| 59 | SOURCE VERIFIED | Country/region/category report and distinct local demand audiences; existing category/freshness/discovery remains independent of follower popularity. Future creator quota ranking conditional. |
| 60 | SOURCE VERIFIED | Country/region/category report and distinct local demand audiences; existing category/freshness/discovery remains independent of follower popularity. Future creator quota ranking conditional. |
| 61 | SOURCE VERIFIED | Country/region/category report and distinct local demand audiences; existing category/freshness/discovery remains independent of follower popularity. Future creator quota ranking conditional. |
| 62 | SOURCE VERIFIED | Country/region/category report and distinct local demand audiences; existing category/freshness/discovery remains independent of follower popularity. Future creator quota ranking conditional. |
| 63 | SOURCE VERIFIED | Country/region/category report and distinct local demand audiences; existing category/freshness/discovery remains independent of follower popularity. Future creator quota ranking conditional. |
| 64 | SOURCE VERIFIED | Existing message push/preferences/mutes plus deduped capped in-app demand resolution and exact destinations. New loops create no email/push/invite reminders or three-channel fan-out. |
| 65 | SOURCE VERIFIED | Existing message push/preferences/mutes plus deduped capped in-app demand resolution and exact destinations. New loops create no email/push/invite reminders or three-channel fan-out. |
| 66 | SOURCE VERIFIED | Existing message push/preferences/mutes plus deduped capped in-app demand resolution and exact destinations. New loops create no email/push/invite reminders or three-channel fan-out. |
| 67 | SOURCE VERIFIED | Explicit fast external share plus existing recent Conversations/Rooms rich-share picker; safe auth context/navigation retained; no contact auto-open. |
| 68 | SOURCE VERIFIED | Explicit fast external share plus existing recent Conversations/Rooms rich-share picker; safe auth context/navigation retained; no contact auto-open. |
| 69 | SOURCE VERIFIED | Explicit fast external share plus existing recent Conversations/Rooms rich-share picker; safe auth context/navigation retained; no contact auto-open. |
| 70 | SOURCE VERIFIED | Feed/Search/Ads remain canonical separate domains; metadata-only encrypted messaging analytics, private order boundaries and unchanged native MLS/E2EE wire format. |
| 71 | SOURCE VERIFIED | Feed/Search/Ads remain canonical separate domains; metadata-only encrypted messaging analytics, private order boundaries and unchanged native MLS/E2EE wire format. |
| 72 | SOURCE VERIFIED | Feed/Search/Ads remain canonical separate domains; metadata-only encrypted messaging analytics, private order boundaries and unchanged native MLS/E2EE wire format. |
| 73 | SOURCE VERIFIED | Feed/Search/Ads remain canonical separate domains; metadata-only encrypted messaging analytics, private order boundaries and unchanged native MLS/E2EE wire format. |
| 74 | SOURCE VERIFIED | Feed/Search/Ads remain canonical separate domains; metadata-only encrypted messaging analytics, private order boundaries and unchanged native MLS/E2EE wire format. |
| 75 | SOURCE VERIFIED | Feed/Search/Ads remain canonical separate domains; metadata-only encrypted messaging analytics, private order boundaries and unchanged native MLS/E2EE wire format. |
| 76 | SOURCE VERIFIED | Version1 stable IDs, source/target/session envelopes and SQL dedupe; preview/crawler UA excluded. Unknown bot detection is a documented limit. |
| 77 | SOURCE VERIFIED | Version1 stable IDs, source/target/session envelopes and SQL dedupe; preview/crawler UA excluded. Unknown bot detection is a documented limit. |
| 78 | SOURCE VERIFIED | Version1 stable IDs, source/target/session envelopes and SQL dedupe; preview/crawler UA excluded. Unknown bot detection is a documented limit. |
| 79 | SOURCE VERIFIED | Version1 stable IDs, source/target/session envelopes and SQL dedupe; preview/crawler UA excluded. Unknown bot detection is a documented limit. |
| 80 | SOURCE VERIFIED / LOCAL ONLY | Allowlisted bounded timing samples for share sheet/server link creation/deep link/auth return and Room request or confirmed acceptance; telemetry failure isolated. Acceptance timing excludes pending admission. |
| 81 | OBSERVATION GATE | Local direct-content samples captured; no regional production SLO asserted without live measurements and agreed targets. |
| 82 | SOURCE VERIFIED | Room membership confirmed only by canonical accepted MLS state; duplicate/revoke/close/existing-member races tested with real native fixtures and PostgreSQL. |
| 83 | SOURCE VERIFIED | Room membership confirmed only by canonical accepted MLS state; duplicate/revoke/close/existing-member races tested with real native fixtures and PostgreSQL. |
| 84 | SOURCE VERIFIED | Independent frontend/backend flags and measurement cohort kill switches. Existing share resolution/plain links survive disabled creation; token previews protect native admission. |
| 85 | SOURCE VERIFIED | Independent frontend/backend flags and measurement cohort kill switches. Existing share resolution/plain links survive disabled creation; token previews protect native admission. |
| 86 | SCOPED | No new A/B experiment shipped. Any future experiment requires trust/abuse/opt-out guardrails and real value outcomes; privacy/security never experimental. |
| 87 | SCOPED | No new A/B experiment shipped. Any future experiment requires trust/abuse/opt-out guardrails and real value outcomes; privacy/security never experimental. |
| 88 | SOURCE VERIFIED | No deceptive consent/contact/invite patterns; canonical moderation/current seller state/symmetric blocks govern every shared public projection. |
| 89 | SOURCE VERIFIED | No deceptive consent/contact/invite patterns; canonical moderation/current seller state/symmetric blocks govern every shared public projection. |
| 90 | SOURCE VERIFIED / OPS GATE | Existing client error/performance monitoring, growth health retry/DLQ events and admin processing/gap counts. Production alert thresholds, scrape integration and on-call evidence require operations validation. |
| 91 | SOURCE VERIFIED / OBSERVATION GATE | Separate loop dashboards and authenticated acquisition cohorts with maturity-safe D1/D7/D30 denominators; live mature retention and causal impact not inferred from synthetic fixtures. |
| 92 | SOURCE VERIFIED / OBSERVATION GATE | Separate loop dashboards and authenticated acquisition cohorts with maturity-safe D1/D7/D30 denominators; live mature retention and causal impact not inferred from synthetic fixtures. |
| 93 | SOURCE VERIFIED / OBSERVATION GATE | Separate loop dashboards and authenticated acquisition cohorts with maturity-safe D1/D7/D30 denominators; live mature retention and causal impact not inferred from synthetic fixtures. |
| 94 | SOURCE VERIFIED | Quality/liquidity/trust dashboard separation, phased flags, measurement-first allowlist, backwards-compatible public product routes; rollback keeps new valid link handlers. |
| 95 | SOURCE VERIFIED | Quality/liquidity/trust dashboard separation, phased flags, measurement-first allowlist, backwards-compatible public product routes; rollback keeps new valid link handlers. |
| 96 | SOURCE VERIFIED | Quality/liquidity/trust dashboard separation, phased flags, measurement-first allowlist, backwards-compatible public product routes; rollback keeps new valid link handlers. |
| 97 | SOURCE VERIFIED | Quality/liquidity/trust dashboard separation, phased flags, measurement-first allowlist, backwards-compatible public product routes; rollback keeps new valid link handlers. |
| 98 | SOURCE VERIFIED | Growth browser/SQL/native/security suites cover guest/auth/deleted/suspended/bot/retry/blocked/expired/revoked/malicious destinations. Cross-device attribution is scoped to verified actor/session, not an invented identity merge. |
| 99 | SOURCE VERIFIED | Growth browser/SQL/native/security suites cover guest/auth/deleted/suspended/bot/retry/blocked/expired/revoked/malicious destinations. Cross-device attribution is scoped to verified actor/session, not an invented identity merge. |
| 100 | SOURCE VERIFIED | Growth browser/SQL/native/security suites cover guest/auth/deleted/suspended/bot/retry/blocked/expired/revoked/malicious destinations. Cross-device attribution is scoped to verified actor/session, not an invented identity merge. |
| 101 | SOURCE VERIFIED | Growth browser/SQL/native/security suites cover guest/auth/deleted/suspended/bot/retry/blocked/expired/revoked/malicious destinations. Cross-device attribution is scoped to verified actor/session, not an invented identity merge. |
| 102 | BOUNDED VERIFIED / CAPACITY GATE | 24 concurrent localhost resolutions and PostgreSQL retry/quota/race bursts pass. Viral production traffic, large native invitation bursts and regional capacity remain staged infrastructure exercises. |
| 103 | BOUNDED VERIFIED / OPS GATE | Analytics503, storage denial/cache loss, job failure/backoff/DLQ/reconcile and notification rollback tests preserve core actions. Full provider outages/restart exercises require approved staging operations. |
| 104 | PRODUCTION GATED | Source preserves all invariants and conditional boundaries; success and value-per-loop must be observed. No production-ready claim while release/security/observation gates remain. |
| 105 | PRODUCTION GATED | Source preserves all invariants and conditional boundaries; success and value-per-loop must be observed. No production-ready claim while release/security/observation gates remain. |
| 106 | EVIDENCE BELOW | Definition-of-Done checklist, final ten-question loop contract and explicit residual gates below. |

## Definition of Done — honest gate status

| Requirement | Evidence/status |
| --- | --- |
| Sharing/invite architecture audited | Verified; original baseline retained, current remediation below baseline. |
| One canonical deep-link system | Verified contract/router + Worker app-shell paths; no plain private conversation invitation. |
| Attribution contract | Versioned envelopes/events, original timestamps, opaque URLs, bounded multi-touch. |
| Guest-first shared product | Browser and synthetic PostgreSQL rehearsal verified. |
| Auth return to exact context | Product/public content/Room/referral/authorized Opportunity browser fixtures; late-boot auth race fixed. |
| Product Share end-to-end measurement | Local canonical ledger/view/save/order-start/reshare verified; real canary pending. |
| Room Invite end-to-end measurement | Actual MLS acceptance/message metadata/participation/order/continuation verified; live invitation secret and opt-in rollout pending. |
| Demand→Opportunity→Supply linkage | Canonical source lineage and nonself outcome SQL; live resolution cohort pending. |
| Seller liquidity metrics | Admin eligible inventory/regional/category/search-response proxy/first-known value reports. |
| Anti-spam/rate limits | Durable quotas plus canonical notification caps; manual user shares separate from platform reminders. |
| Duplicate protection | PostgreSQL concurrent retries/action IDs/invite/native membership tests. |
| Blocks/report/privacy | Native signed device/message-epoch access and canonical symmetric safety checks, public eligibility. |
| Crawler/bot exclusion | Known crawler/preview agents tested; unknown bots remain a measurement limitation. |
| Notification dedupe/frequency | Canonical capped in-app resolution and existing message/preferences; no growth reminder/provider fan-out. |
| Flags / kill switches | Independent loops; creation and measurement kill, core destination/send continues. |
| Failure isolation | Browser503/storage failure plus SQL savepoint/reconcile/notification rollback and job failure tests. |
| Deep-link performance | Local measured samples; regional live SLO pending. |
| Load/chaos/security | Bounded fixtures pass; production-scale/staging outage exercises and current independent CodeQL review pending. |
| Loop dashboards | Separate product/content/Room/referral/marketplace/network/jobs/cohorts reports; no vanity single score. |
| Feed/Search/Auth/Conversations regression | Existing functional/browser/native/commerce checks; CI deployment gates verified per release. |
| Rollout / rollback | growth-loops-rollout.md; do not remove handlers for already-shared valid URLs. |

## Production gates that cannot be manufactured

1. Select an explicitly opted-in real cohort and an eligible public product. No
   unanswered cohort question or repeated “continue” authorizes inventing people.
   The observed backend already enables product sharing and measurement for an
   existing two-account allowlist; guest measurement is off. Do not label that as
   all flags off or silently expand it. New loops remain default-off.
2. Provision the private Room-invite signing secret and enable matching native
   Room/frontend/backend flags only after the security/operations gate. Tokens
   are never logged or committed. Existing public destinations remain available.
3. Obtain current independent CodeQL finding review. The historical review ledger
   is source-tree bound and has become stale; changing its digest or attributing
   new review to historical reviewers would falsify evidence. Required functional,
   BEAM and dependency deployment gates are separate from this unresolved review.
4. Collect real regional performance, participation/value, abuse/opt-out and
   mature D1/D7/D30 windows. Null/immature metrics stay null, not zero or success.
5. Run approved staging viral-capacity/provider-outage exercises and validate
   on-call alert thresholds/replay procedures. Local 24-request success establishes
   bounded correctness only.

## Final product questions, per loop

All rows use explicit user actions, remain useful without cash/points, and are
optional. Tracking/reporting failure never blocks the underlying public value;
native membership and canonical commerce transitions remain authoritative.
The last four columns answer abuse, prevention, incentives and failure isolation.

| Loop | Useful entry / why involve someone | Immediate recipient value | Activation / value / improvement for next person | Abuse / prevention | Useful without incentives? / core failure boundary | Measure real value |
| --- | --- | --- | --- | --- | --- | --- |
| Product sharing | View useful product / recommend or ask advice | Exact public product, guest-first | Meaningful visible view; canonical save/nonself order/message lead; relevant discovery | Spam/scams/self signals → quotas, current safety/blocks, bot/self/dedupe filters | Yes / plain link and product still open | View→save/message/order-start→reshare; no click-as-sale |
| Shopping Room | Create product shortlist / help choose | Only explicitly previewed public products | Accepted native membership + vote/comment/product; shortlist decision; better collaborative choice | Private-history leak/blocked invites → opaque expiry/revoke, native MLS, scope, preferences/quota | Yes / failed tracking or notification never creates fake membership | Acceptance→accepted-message participation→private own order→new Room |
| Conversation | Explicit product/person message / reply or share context | Authorized encrypted rich card | Distinct-account reply; meaningful communication and discovery | Harassment/private-body analytics → native auth, blocks/mute/report, metadata-only | Yes / signed send independent of growth intake | Reply/read metadata, authorized card view, canonical downstream value |
| Seller liquidity | Publish usable supply / buyers seek relevant availability | Eligible relevant inventory | First known approval + nonself marketplace signal; leads/orders; better local supply | Irrelevant duplicates/popularity monopoly → canonical eligibility, relevance separate, no growth ranking override | Yes / Search/Feed independent | Eligible inventory/local result proxy/response/cohorts; not raw listing count |
| Demand→Supply | Legitimate unmet search / seller can resolve need | Relevant Opportunity or opted-in resolution product | Actual response/product and buyer canonical action; resolved need increases useful supply | Inflated demand/private search spill → owned source evidence, N=1 confidence, local variants, seller ACL | Yes / attribution does not manufacture demand or block resolution | Linked search→demand→response→product→resolution/order |
| Seller Opportunity retention | See relevant opportunity / add useful supply | Exact authorized current Opportunity | Qualified response and nonself buyer value; returning faster improves matching | Noisy notifications → canonical relevance, expiry, capped preferences; no broad reminders | Yes / exact ACL/canonical response independent of report | Response/value/repeat cohorts, live retention pending |
| Creator/content | Share useful Reel/Short/photo Reel / discovery | Exact public content/profile | Meaningful view, confirmed follow/save; discovery and engagement | Spam/fake plays → safety/ready eligibility, bots/self/dedupe; no follower-only growth boost | Yes / public content opens when tracking unavailable | Separate content funnels; no invented creator earnings |
| Follow graph | Discover useful person / public new content | Public eligible creator/seller profile | Canonical follow and eligible future public content engagement | Purchase privacy/creepy reasons → public-only graph/reasons, blocks; purchases excluded | Yes / follow owner stays canonical | Active pairs + eligible-update potential; never call potential an impression |
| Saved/Collections | Build useful public shortlist / portable choices | Public eligible Collection products | View/follow/save and onward sharing; better curated discovery | Private collection leaks → visibility/current owner/products/blocks, safe fallback | Yes / optional attribution | Collection-specific funnel, canonical follow; no fake collection membership |
| Search resolution | Explicit notify-me after failed search / useful match | Exact available matching product on return | Opt-in and canonical return action; repeated failed need becomes value | Unsolicited alerts → explicit owner subscription, dedupe/cap/mute/stop | Yes / notification failure rolls back pending match for retry | Goal→matched product→buyer action/outcome |
| Restock | Explicit sold-out request / seller can replenish | Relevant restocked product | Legitimate restock source and available supply + buyer return/action | False urgency/noise → actual product eligibility, source identity/cap/preferences | Yes / sold-out product still browsable | Restock source→response→public availability→return/order |
| Review/trust | Delivered legitimate order / help later buyers | Canonical verified public review | Nonself delivered-order review; stronger truthful trust | Self/fake reviews → server-derived seller/delivered proof, dedupe, current eligibility | Yes / transaction owner independent | Eligible delivered orders and verified reviews; fulfillment not invented |
| Seller referral | Relevant actual Opportunity / colleague sells this category | Honest category need, minimal guest preview | Current approved positive-price first product + nonself first value | Self/account farms/privacy → source seller ACL/category, quotas, UUID/revoke, immutable first-approval proof | Yes / no rewards or auto-messages | Created/open/observed signup/first product/value; unknown signup stays unknown |
| Buyer referral | Product/Room/Collection/content utility invitation | Exact useful shared context | Value event of underlying loop | Generic reward spam → no independent reward/contact-invite system | Yes / same canonical useful destination | Underlying loop value, no duplicated generic referral infrastructure |

Future incentives, contact syncing, public private-Conversation invites, guest
Room comments/votes, group orders, creator collaborations and experiment systems
are conditional domains, not undeclared infrastructure to fabricate for this spec.

## Measurement provenance and final local regression

Rich-card type/content reference and encrypted Room vote/comment/shortlist semantics
are client-observed. The server proves accepted message/device ownership, exact
epoch access, canonical safety and public destination eligibility; it does not
prove plaintext meaning or decrypt the message. That limitation is intentional.
Canonical saves/orders/follows/public approval and native membership supply
separate server-verified value evidence. Neither metadata proof nor a client
semantic label is reported as a completed purchase.

Funnel rates require ordered observed open→activation→value→continuation receipt
transitions. Missing/unordered observations stay in raw evidence counts and are
excluded from the ordered funnel, rather than producing negative time-to-value
or inflated value conversion. A regression fixture deliberately moves an
activation before its open and verifies that later rates/time-to-value do not
claim the unordered journey as completed.

Fresh-database regressions exposed grouped SQL migration statements incompatible
with prepared-query adapters. The growth migration statements now execute one
top-level SQL command at a time inside the same existing transaction; applied
migration IDs/schema/behavior are unchanged. The fresh-store WIP/commerce suite
passes again. Local child-process tests require the execution tool's network
permission profile; without it sandbox EPERM makes CLI test output empty. With
that profile, the conversation security unit/contract suite passes. This does
not resolve the independently source-bound production CodeQL review gate.

The final full native PostgreSQL exercise on 2026-10-12 used the same disposable
runner with its Room name filter removed: 41 service tests passed, zero skips,
including six-connection/two-store multi-sender convergence, concurrent admission,
preference lost-response retries and an old-epoch send racing a committed freeze.
All fixture schemas were removed and the owned container was deleted. This adds
actual bounded native race evidence; it remains distinct from viral capacity.

## Subsequent opted-in Product Share canary preparation

The operator subsequently confirmed three participants and supplied three exact
public product links. Read-only catalog checks verified approved/available public
content. The production frontend's default-off flags required a session-scoped
capability bridge; see [growth-account-canary.md](growth-account-canary.md).
Canonical cohort/feature switches govern activation, stale account/session replies
are rejected and guest context is preserved in memory through the auth-return
race without pre-auth observations. A scoped read-only aggregate reader supports
baseline/after comparison. Configured enrollment is not meaningful participation;
real participant actions and live observations must still be verified separately.
