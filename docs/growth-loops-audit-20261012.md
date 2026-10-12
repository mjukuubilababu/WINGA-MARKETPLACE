# Growth Loops v1.0 — current architecture audit

Audited on 12 October 2026 against repository baseline `75407b78`. This supersedes
the **status assessment** in the 8 October audit, while retaining its history.
Classification describes source capabilities, not a production certification.
The supplied specification requires phased delivery; this assessment precedes
implementation and does not authorize enabling every loop together.

## Existing capabilities

| Capability | Classification | Current evidence and boundary |
| --- | --- | --- |
| Product share flows | IMPLEMENTED | `app.js:handleShareProduct` reuses native sharing, copy, explicit WhatsApp and a plain-link fallback. Preparation and commits are isolated from instrumentation exceptions. |
| WhatsApp sharing | IMPLEMENTED | Explicit friend-sharing composer in `handleShareProduct`; seller contact remains a separate action. No recipient selection, automatic sending or address-book upload. Handoff is not evidence of delivery. |
| Product deep links | IMPLEMENTED | `src/growth/contract.js:destination/parseDestination`, `app.js:openDeepLinkedProductRouteIfNeeded`, Worker product routing and direct product lookup. Existing links remain valid without attribution. |
| Shared multi-content router | PARTIAL / DUPLICATED | The growth destination contract now dispatches PRODUCT, PROFILE, COLLECTION, REEL, SHORT and opaque SHOPPING_ROOM invitations to canonical value/access handlers. Generalized attribution and authorized seller/conversation invitation destinations remain partial. Do not expose private room/conversation identifiers as public admission links. |
| Generic invites | MISSING | No shared expiring/revocable external invitation lifecycle. The existing product-share envelope is not a private invitation or membership grant. |
| Referral links / seller referral | MISSING | No canonical referral lifecycle, first-value cohort or incentives. Utility sharing exists; do not add generic reward invites first. |
| Conversations sharing | IMPLEMENTED / PARTIAL | `src/chat/rich-content.js` and `backend/conversation-references.js` resolve live product, Reel/Short, collection and authorized order/payment/delivery cards. The product action sheet now offers a recent encrypted-peer/accepted-room picker, preserving canonical rich cards and stable message IDs. Complete growth journey attribution remains partial. |
| Shopping Room invitations | PARTIAL | `backend/encrypted-shopping-rooms.js`, `src/chat/room-session.js` and `src/chat/rooms-ui.js` own MLS roster transitions, device proofs, acceptance, membership, polls and blocks. Scoped opaque invitations, guest previews, expiry/revocation, signed join requests and aggregate reporting now reuse the canonical MLS/growth owners. Source flags default off; production canary, event reconciliation and load/chaos evidence remain outstanding. Token acceptance never substitutes for MLS admission. |
| Product cards in chat / rooms | IMPLEMENTED | Rich-reference authorization and existing encrypted room product operations are canonical; do not create another card or membership model. |
| Demand / Opportunity | PARTIAL | The baseline withheld search-gap candidates below two audiences and the canonical normalizer rejected fewer than three signals. The N=1 remediation below separates search-gap eligibility from corroborated aggregate reports. Growth events must not inflate search demand. |
| Demand → response → product linkage | PARTIAL | `backend/db.js:recordSupplyResponse` links opportunity, response, product and rediscovery audiences; commerce exposure/action/outcome tables exist. Existing eligibility references now retain exact canonical source-event lineage and link authoritative order milestones. Admin marketplace reporting is implemented; opt-in resolution notifications and production value evidence remain incomplete. |
| Seller onboarding / activation | PARTIAL | Verification, usable product publication, messages/orders and opportunity responses exist. First-value cohorts and supply-quality/liquidity reporting are not a complete growth contract. |
| Creator / Reel / Short sharing | PARTIAL | Public video products, playback attribution and rich references exist. Creator-specific destination integration, first-value and retention cohorts are missing. |
| Saved products | IMPLEMENTED / PARTIAL | Canonical product likes provide confirmed share-save evidence. Saving is not a purchase, and cross-device acquisition/cohorts are not inferred. |
| Collection sharing | PARTIAL / BROKEN | Canonical public collection routes and sharing now preserve collection identity/title. The existing reader enforces owner/seller status, visibility and blocks. Legacy category-browse URLs remain valid; collection acquisition/retention attribution is pending. |
| Person following / suggestions | IMPLEMENTED / PARTIAL | Canonical `user_follows`, symmetric blocks, public-content eligibility and public-category/mutual-connection explanation codes exist. Growth acquisition and D1/D7/D30 follow cohorts are incomplete. |
| Notifications | IMPLEMENTED / PARTIAL | Social recipient frequency limits, content dedupe, message push outbox, session rebinding and conversation/room mute policy exist. Cross-channel loop-wide fatigue/suppression is not complete. Phase 1 sends no growth reminders. |
| Attribution IDs / envelopes | IMPLEMENTED | `backend/growth-store.js`, additive growth migrations and `src/growth/contract.js` provide opaque share UUIDs, server-owned source identity, organic campaign type, expiry, revocation and safety rechecks. No private message bodies or search histories belong in these payloads. |
| Attribution events / multi-touch | IMPLEMENTED / PARTIAL | Versioned events, stable IDs, SQL dedupe, first/last touch and a bounded browser journal exist. Browser session attribution is not a cross-device identity solution; unknown bots and multi-account fraud remain limitations. |
| Analytics/reporting | PARTIAL | Admin-only aggregate product-share cohort, activation/value/continuation and client-observed timing report exist. Full loop dashboards, regional/category liquidity and retention cohorts are missing. K-factor remains null because recipient delivery is unknown. |
| Auth return | IMPLEMENTED / PARTIAL | Expiring allowlisted intents return product actions to exact product/image context. Room, Search and collection/profile follow return contexts are now validated and tested; complete later-phase attribution and authorized seller routes remain pending. |
| Anti-spam / privacy | IMPLEMENTED / PARTIAL | Durable share/event user/IP quotas, daily caps, CSRF, symmetric blocks, public/seller eligibility, bot/preview-agent exclusion and final transaction rechecks exist. Later invitations require their own consent, recipient suppression and abuse integration through the canonical owners. |
| Retry / dead letters | PARTIAL / BROKEN | `src/growth/runtime.js:retryDeadLetters` re-enqueues through `enqueue`, resetting `createdAt`. Repeated explicit replay can renew the documented 24-hour retention window. Restored records with invalid timestamps can evade the original age comparison. Fix this in the existing outbox, retaining event IDs. |
| Reviews / trust | IMPLEMENTED / PARTIAL | Review creation checks delivered buyer orders and dedupe. Review-driven growth reporting and complete abuse/fraud evidence remain separate work. |

The earlier audit's unsafe public preview and broken product auth-return findings
were subsequently addressed in source. They are not reclassified as unresolved
defects here. Current regression and production evidence must still be checked.

## Canonical ownership and rollout order

1. **Phase 1:** retain product links, product sharing, growth store/API, browser
   attribution outbox, product auth intents and existing abuse controls. Repair
   bounded replay lifetime; validate product/guest/auth/outage behavior first.
2. **Phase 2:** extend existing rich-card and encrypted-room owners. Design one
   reusable external-invite lifecycle with revocation/expiry, recipient consent,
   scoped previews, blocks and canonical device-bound admission before exposing
   links. Room participation, not signup, is activation.
3. **Phase 3:** retain Search Demand and commerce attribution as separate domains.
   Correct N=1 without labeling one buyer a high-confidence trend, then complete
   buyer-resolution, opportunity response, restock and liquidity reporting.
4. **Phase 4:** wire canonical collection/content/profile destinations and
   seller utility referrals; require safety/visibility and first-value cohorts.
   Do not introduce rewards or contact uploads to manufacture participation.

## Definition-of-done assessment (§106)

| Requirement | Assessment |
| --- | --- |
| Existing architecture audited | This current source audit is complete; production behavior is not inferred from it. |
| One canonical deep-link system | Product contract exists; all requested destination types remain PARTIAL. |
| Attribution contract | Product envelope/events implemented; broader loop attribution PARTIAL. |
| Guest-first product / auth return | Existing browser regression coverage; current run results must be recorded. |
| Product Sharing Loop end-to-end | Existing synthetic SQL/browser rehearsal; real production cohort/value evidence remains pending. |
| Shopping Room Invite Loop end-to-end | Lifecycle and scoped reporting implemented and tested locally; production cohort/operational evidence outstanding. |
| Demand → Opportunity → Supply | Existing response linkage and verified N=1 search-gap SQL; full resolution chain and production value evidence incomplete. |
| Seller liquidity metrics | Admin aggregate category/region liquidity and seller first-value cohorts implemented; relevance/response/retention and production evidence partial. |
| Anti-spam / rate limits | Product share/event and scoped room invite/request quotas implemented; production abuse analysis remains pending. |
| Duplicate protection | Stable IDs, SQL unique keys and canonical roster transitions exist; current regression evidence required. |
| Block / report / privacy | Existing owners enforce blocks/visibility; future invitations must preserve these boundaries. |
| Crawler exclusion | Known crawlers/preview agents excluded; comprehensive bot/fraud resistance not established. |
| Notification frequency / dedupe | Existing social/chat controls; loop-wide cross-channel fatigue policy PARTIAL. |
| Flags / kill switches | Product sharing/measurement, server cohorts and independent room-invite controls exist; later-loop controls remain partial. |
| Failure isolation | Existing analytics-outage browser test and optional share/boot instrumentation guards; replay lifetime defect found. |
| Deep-link performance | Bounded client-observed latency exists; regional production SLO evidence pending. |
| Load / chaos / security | Existing SQL concurrency and synthetic outage coverage; full viral/fan-out/production chaos evidence pending. |
| Loop dashboards | Admin product-share aggregate endpoint exists; complete multi-loop dashboard MISSING. |
| Core regression | Relevant current tests required; source audit alone cannot certify Feed/Search/Auth/Conversations. |
| Rollout / rollback | Existing Phase 1 flags, cohort policy and append-only migration procedure in `growth-loops-rollout.md`; later-phase rollout remains gated. |

## Value and scale decisions

Product share starts with a person choosing to share a useful public product.
The recipient receives that product immediately. Meaningful visible viewing is
activation; confirmed saves/order starts are measured value proxies, never sales.
Resharing is continuation. Public/seller eligibility, blocks, bot exclusion,
quotas and dedupe limit abuse. Destination access and plain sharing must survive
analytics failure, and this loop needs no rewards.

Internal Conversations and Shopping Rooms already provide collaborative value,
but an external room invite's preview scope, admission and metrics cannot yet be
answered completely. Demand and seller loops have useful canonical owners but
incomplete first-value/resolution reporting. Collections, creator acquisition
and seller referrals need destination and value contracts before scale. No loop
is declared production-ready from upload, registration, clicks or source alone.

No global growth flags, reminders, rewards or later-phase loops are enabled by
this audit. Live cohort selection and regional evidence remain rollout work.

## Phase 1 remediation after audit

The two new retention regression tests reproduced the defects before the fix:
replay changed `createdAt` from `10000` to `82810000`, and a restored record with
an invalid timestamp was submitted instead of being expired.

The existing runtime now preserves the original `createdAt` on explicit replay,
keeps the same share/event IDs and payloads, and rejects missing, nonnumeric or
future creation timestamps during both flushing and replay selection. After
24 hours a replayed record expires using its original age, even if it was replayed
while offline. No parallel outbox, new schema or changed product destination was
introduced. Account isolation, bounded retries and plain sharing remain intact.

Current local growth checks passed: 3 cohort-policy tests, 3 share-handoff tests,
11 runtime tests and 13 SQL/API tests using PGlite (30 total, no skips). This is
not a fresh real-PostgreSQL concurrency run or production cohort measurement.
The generated 95-module bundle is synchronized and static build validation passed.
Frontend core checks passed 145/145. Two Chromium browser scenarios passed:
guest product/copy/meaningful-view behavior during a simulated growth API 503
outage, and exact product-detail return after authentication for a guest purchase
intent. Canonical content/auth APIs used the existing local synthetic E2E server.
No external invitation, message, payment or production order was created.

Production cohort configuration, admin report access and opted-in test accounts
have not been established by these tests. Source default flags are not evidence
of the deployed environment's settings. Live canary selection is still pending.

## N=1 search-gap remediation

One identified search audience can now generate a canonical zero-result or
low-supply opportunity. `SEARCH_OPPORTUNITY_MIN_AUDIENCE` defaults to one and is
bounded from one to twenty. `SEARCH_DEMAND_MIN_AUDIENCE` retains its minimum two
for aggregate trends and regional candidates; the file-store summary's minimum
two is also intentionally unchanged. This is separate eligibility, not a second
Demand store or growth-event input to Search.

Search-gap evidence now counts distinct server-owned audience keys, excluding
missing identities and events older than thirty days. A buyer contributes at
most two score units: one for demand within thirty days and one for activity
within seven days. Repeated searches do not create independent evidence or
increase that score. Opportunity IDs remain stable as evidence accumulates.
Metadata marks `evidenceBasis: distinct_audiences` and `evidenceLevel:
single_signal` or `corroborated`; neither is a statistical confidence estimate
or a claim of high confidence. Seller reads retain these labels. No identity
keys are returned to sellers, no growth notifications are added, and other
opportunity types retain their existing thresholds.

The executable SQL regression failed before the fix because both single-buyer
gaps were absent. It now covers N=1 zero-result and low-supply eligibility,
identity-less/stale exclusion, repeated searches, canonical normalization and
upsert, seller evidence reads, two-buyer corroboration, stable IDs, preserved
trend thresholds and a configurable higher opportunity threshold. It passes
locally using PGlite; the required functional CI job runs it against a disposable
PostgreSQL instance. Existing commerce tests (9) and pagination/storage tests
(120) pass locally. These checks do not establish real buyer resolution,
seller sales, production cohort activation or full N=1 support for every demand
type. Restock, variant and regional loop completion remain further work.

Raising `SEARCH_OPPORTUNITY_MIN_AUDIENCE` controls future candidate refreshes;
it does not revoke already persisted opportunities. Revert this code release
to restore former eligibility/scoring; existing opportunity rows still follow
canonical expiry, dismissal and response behavior. No destructive migration
or reset is required.

## Public-content measurement extension — 2026-10-12

Collections, public profiles, Reels (including approved photo Reels) and Shorts now reuse the canonical share envelope, expiry/revocation, cohort policy, rate buckets, event dedupe, destination validation and browser outbox. Each has a separate disabled-by-default sharing flag. Product metrics remain separate. Private/empty collections, suspended creators, non-ready video, self actions and blocked participants cannot create attributed value. Canonical follow/save rows must postdate the share; link opens and registration are not sales or activation.

The admin content report separates each content loop and reports observed views, verified follow/save value, reshares and time to value; delivered invitations and cross-device acquisition remain unknown. The restored browser outbox strips unsupported fields and rejects expired original contexts even when retry timestamps are corrupt.

Validation: growth policy/runtime/SQL/event-job suite passed; frontend and module synchronization/localization gates passed; 12 browser scenarios passed, including guest collection discovery, opaque reshare URLs and destination delivery while attribution returns 503. These are isolated synthetic tests, not production acquisition evidence. Production feature activation remains subject to the explicitly selected opted-in cohort.
