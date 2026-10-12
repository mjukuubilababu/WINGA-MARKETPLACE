# Growth Loops v1 — Phase 1 rollout and evidence

Current architecture assessment: [12 October 2026 audit](growth-loops-audit-20261012.md).

This describes the first phase of the supplied 106-section contract, following its instruction not to ship all loops simultaneously. See [the baseline audit](growth-loops-audit.md) and current assessment above. Growth Loops as a whole is **not production-ready**. Deploying the retention hardening does not itself change growth rollout flags or enroll a production cohort.

## 2026-10-12 retention hardening

Explicit dead-letter replay now retains the original record creation time as
well as its event/share IDs. Its 24-hour lifetime cannot be renewed by replaying
it repeatedly or while offline. Missing, nonnumeric and future creation times
expire before submission and cannot be replayed. A manual replay may restart
the bounded attempt counter only inside the original lifetime and current
account context. Seven-day diagnostic dead-letter retention is unchanged.

Two regression tests reproduced the prior defects before correction. Current
validation passed 30 growth checks (including 13 PGlite SQL/API contracts),
145 frontend core checks, two Chromium growth/guest/auth scenarios, module
synchronization and static build validation. See the current audit for evidence
and outstanding production gates. Later-phase features and all production
rollout flags remain outside this retention change.

## Phase 1 behavior

One public product destination contract in `src/growth/contract.js` validates paths for the browser and backend. Public URL shape is `/product/<public-product-id>?share=<random-UUID>`; it contains no username, search history, private room ID or recipient data. Other destination kinds remain explicitly rejected until their canonical UI/access handlers are wired in their rollout phase. Existing Worker shell routing and existing rich-card/MLS handlers remain in place.

Sharing reuses `handleShareProduct`. A link is prepared synchronously, preserving native share user activation. A successful native handoff, copy or explicit WhatsApp handoff queues a durable envelope asynchronously; native cancellation does not count as creation. WhatsApp opens a composer, never selects recipients or sends a message. The image actions surface includes explicit copy and WhatsApp choices. Rich internal sharing continues through the existing Conversations cards and Room product commands; recent-contact integration belongs to Phase 2.

The final alert-only fallback displays a usable link but no longer records a successful share. A user seeing a link is not evidence that it was copied or handed to another app.

The guest product detail opens without authentication. Products outside the first feed page are fetched directly through the existing privacy-aware `/api/products?productId=...` endpoint, with a three-second request budget and existing recovery shell. Deleted or unavailable content falls back safely. Product preview HTML now checks approval, public visibility, seller activity and viewer blocks; guest bootstrap also filters nonpublic/restricted-seller products.

Auth intents use an allowlist, safe identifiers and a 30-minute expiry. Product actions return to product detail and selected image; follow returns to the selected person/profile or product context. Account changes clear the prior growth journey. Returning to purchase context does not automatically place or pay for an order. Legacy intents lacking timestamps are intentionally discarded at this security boundary.

## Ownership and contracts

| Domain | Canonical owner |
| --- | --- |
| Public product destination/auth intent validation | `src/growth/contract.js` |
| Organic envelope/event persistence and quotas | `backend/growth-store.js`, migration `2026100809_growth_product_sharing_v1` |
| HTTP access, existing CSRF/CORS/session policy | `backend/growth-api.js` through `backend/server.js` |
| Multi-touch journal, bounded outbox/dead letters | `src/growth/runtime.js` |
| Product value truth | Existing `product_likes` and `orders` repositories; growth only checks evidence |
| Private content and membership | Existing rich-reference authorization and encrypted room roster/MLS admission |
| Search Demand, Opportunities, ranking and Ads | Existing domains; growth events never write to these domains |

Envelopes expire after 30 days and can be revoked. Expiry/revocation removes attribution access, not public product access. Every resolution/event rechecks product visibility, active seller and symmetric blocks against both seller and sharer. Share creation has durable limits of 30/actor/minute, 60/IP/minute and 300/actor/day; authenticated actors use their account for quota so changing anonymous sessions cannot evade it. Event limits are 120/actor/minute and 240/IP/minute, in addition to the existing HTTP limits. No growth notifications/reminders are generated.

Event schema version is 1. Client envelopes allow only eventId, shareId, anonymous sessionId, eventType, schemaVersion, optional orderId and bounded view-only durationMs. Created/reshared events are generated by the server. The server supplies timestamps and enforces event-ID and `(share, session, event type)` dedupe. Source account identity remains server-only. A same-tab anonymous journey persists through signup/login; identities across devices are not guessed. Known preview agents/crawlers and source/self actions are excluded. This does not establish comprehensive bot-farm resistance.

The additive migration `2026100901_growth_event_timing_v1` permits an optional integer `durationMs` only on `shared_product_viewed`, bounded to 0-300000 ms. Initial-page timing starts at the browser navigation time origin; later routes start when attribution captures the route. The end is the first visible product detail hook, excluding the two-second activation dwell. Hidden-before-render and out-of-budget routes do not produce a timing sample. These are client observations, not trusted measurements or independently verified regional SLOs. Retries never overwrite the first persisted sample. The admin health report exposes sample count, average and p95 separately from value conversions. Share-sheet, link-creation and auth-return timing remain future instrumentation.

## Server cohort control

The existing creation/measurement flags remain independent and default off. `WINGA_GROWTH_COHORT_MODE=all` preserves the existing behavior when those flags are enabled; omitting the mode preserves compatibility. `off` or an unknown mode denies new creation/measurement without denying existing envelope resolution or public product access.

For an account-bounded canary, set `WINGA_GROWTH_COHORT_MODE=allowlist` and `WINGA_GROWTH_COHORT_USERS` to at most 100 comma-separated exact canonical usernames. Creation requires an authenticated enrolled account. Measurement requires both the persisted share source and authenticated recipient to be enrolled; client overrides cannot enroll either one. An empty or malformed allowlist denies writes. Removing a source from the allowlist prevents new measurement of its existing shares, while public access remains independent. Final event authorization rechecks source enrollment after database waits. Resharing by an enrolled account remains available when its parent source is excluded, but no parent continuation metric is inserted; replay after later enrollment never retroactively inserts one.

Guest measurement is denied in allowlist mode unless `WINGA_GROWTH_COHORT_GUEST_MEASUREMENT=true` is explicitly configured. With that opt-in, anonymous observations may be recorded only for shares from enrolled sources, subject to current public eligibility, crawler filtering and quotas. Anonymous guests are not an account-bounded recipient cohort: an enrolled source can share its public link widely. An isolated staging environment is still preferable when strict recipient enrollment is required. The admin report reveals only mode/count/guest-policy summary, never usernames.

The first touch, latest touch and up to 20 touch entries remain in session storage. The last matching product touch receives its action. Growth is an independent, optional measurement domain. Storage errors fall back to memory. The local outbox holds at most 100 records for up to 24 hours, retries at most six times with exponential backoff capped at 30 seconds, and retains up to 50 replayable dead letters for seven days. In the affected browser, `window.WingaGrowth.getHealth()` reports bounded counts and `retryDeadLetters()` retries current-account records younger than 24 hours using their original event IDs. It never retries another account's payloads. `winga:growth-health` events expose retry/dead-letter reason codes without message bodies.

## Product-share measurement

| Transition | Evidence |
| --- | --- |
| Entry | `product_share_created`: durable envelope after user handoff/copy |
| Intermediate | `product_share_opened`: client observes a matching route, accepted by server with safety/bot checks |
| Activation | `shared_product_viewed`: visible product detail for two seconds, or a confirmed save/order start |
| Value | `shared_product_saved`: matching `product_likes` row; `shared_product_order_started`: matching buyer/product/order row |
| Conversation intent | `shared_product_message_started`: opening seller-chat context; explicitly **not** a confirmed meaningful message/reply |
| Continuation | `shared_product_reshared`: new safe envelope linked to its parent |

An open is not a signup or value event. A save/order start is not a purchase. Saves/orders predating the durable share record are rejected, including old orders passed with a forged event. Native share completion cannot prove external delivery. Reports must not claim actual invitations delivered, K-factor, purchase conversion, qualified leads or organic user acquisition from these proxies.

`GET /api/admin/growth/health` requires an admin session and returns no-store aggregate metrics: rolling counts, evidence provenance and a 30-day share-created cohort. The cohort counts opened recipient-session/share journeys, activation, confirmed value and continuation, step rates, repeated recipient sessions and mean server-receipt time to value. Missing/unordered events are excluded from time-to-value. Funnel rates use matching journeys rather than mixing unrelated rolling event counts. K-factor stays null because actual recipient deliveries are unknown. Full dashboards, regional measurements, D1/D7/D30 cohorts and liquidity reporting remain later release gates.

## Rollout and rollback

1. Back up staging PostgreSQL and run the existing append-only migration runner. The new migration is appended after existing history. Disposable PostgreSQL 18.6 concurrency and rollback acceptance passed ([evidence](growth-postgres-acceptance-20261008.md)); staging schema, restore points and deployed behavior still need verification.
2. Enable server creation with `WINGA_GROWTH_PRODUCT_SHARING_ENABLED=true` and measurement with `WINGA_GROWTH_MEASUREMENT_ENABLED=true` in staging. Both default to false. Use server `allowlist` mode for an account canary, choose guest scope explicitly, and enable frontend `growthProductSharing` / `growthMeasurement` for the intended test browsers. Existing links work with any flag/cohort combination. Browser overrides alone do not enforce enrollment.
3. Verify guest open, share copy/native/WhatsApp cancellation, auth return, seller moderation, private/follower visibility, block changes, expiry/revoke, bot filtering and event retry in staging. Compare existing product/feed/auth/Conversations behavior. Monitor route failures, outbox/dead-letter growth and API limits before increasing the cohort.
4. To stop measurement, set `WINGA_GROWTH_MEASUREMENT_ENABLED=false` and frontend `growthMeasurement=false`. To stop attributed link creation, set `WINGA_GROWTH_PRODUCT_SHARING_ENABLED=false` and frontend `growthProductSharing=false`. Resolution/revocation of existing envelopes still works; public product access and plain sharing remain independent. Existing schema can remain during backend rollback; do not remove production migration history.
5. Run the admin-only, CSRF-protected `POST /api/admin/growth/prune` as an explicit operations maintenance task to remove quota buckets older than two days and share/event history older than 90 days. No automation or notification was scheduled by this change.

## Verification performed locally

- `npm run test:growth`: six runtime tests and nine SQL/API contract tests, including guest-to-auth cohort continuity, SQL retry/rollback, duplicate keys, quotas, public eligibility, expiry/revocation, bot/self filtering, confirmed save/order evidence, multi-touch, denied storage, account changes and analytics outage/dead-letter recovery. SQL tests execute the actual new migration against PGlite; the shared test helper can target an explicitly configured disposable localhost PostgreSQL.
- `npm run test:frontend`: 145 frontend core checks and the existing conversation identity/link, decision authority, receipts, offline retry, photo/Reel and video lifecycle files passed.
- `node tests/postgres-pagination.test.js`: 120 tests passed. Corrected its existing empty-table COUNT mock for legacy-history migration verification; production legacy import logic is unchanged.
- Existing API integration: 19 tests passed across auth, CSRF/CORS, product/commerce/moderation, monitoring and messaging boundaries, including explicit private/pending/follower-only/suspended-seller preview and guest discovery checks.
- Chromium browser checks: guest product/copy/meaningful-view flow under a simulated growth 503 outage; exact product return after guest purchase/login; existing product refresh, product history/back and guest feed passed. The local test host needed network-enabled execution to bind localhost servers.
- Static build, synchronized module bundle and localization gates passed.
- `npm run test:growth:postgres`: nine existing SQL/API contracts and nine additional concurrency/rollback cases passed on real PostgreSQL 18.6, without skips. Six distinct database backends were observed. A queued-write privacy race found during this run was fixed by rechecking eligibility after quota/evidence waits. See [acceptance evidence and reproduction](growth-postgres-acceptance-20261008.md).
- `npm run canary:growth:local`: bounded synthetic browser/HTTP/PostgreSQL rehearsal passed: two guest views/auth returns, one save, one synthetic order start, one reshare, a control browser with no growth requests, admin reporting and disabled-handler/frontend rollback checks. [Evidence and live handoff](growth-canary-20261008.md). A live canary remains pending; global server booleans are not production cohort enforcement.

## 2026-10-09 hardening checkpoint

- Local `npm run test:growth`: 28 tests passed without skips (6 policy/share, 9 runtime and 13 SQL/API contracts). The current timing migration executes against PGlite; this is not real PostgreSQL contention evidence.
- CI wiring/trigger regressions: 10 tests passed. The canonical localhost-only PostgreSQL runner now includes both growth SQL and concurrency suites, with real-backend mode forced on; baseline growth CI uses PGlite explicitly.
- Independent reviewer rechecked the excluded-parent reshare finding, including source changes at the final-read boundary and replay after enrollment. No actionable findings remain in the reviewed growth/CI scope. Reviewer execution is not a production acceptance claim.
- The targeted guest-share/auth-return browser tests, static build, module sync and localization checks passed locally. Fresh candidate Actions, real PostgreSQL acceptance and CodeQL binding remain required before promotion.
- No production growth flags, credentials, approvals, notification reminders or private room policies changed. Historical 2026-10-08 acceptance above does not certify the new timing/cohort changes.

## Remaining contract gates

| Phase / area | Required before scaling |
| --- | --- |
| Phase 1 production acceptance | New timing migration and cohort checks on real PostgreSQL, staging and production-scale load/soak, crawler traffic analysis, cross-tab/device policy, wider moderation/cache propagation races, measured regional deep-link/auth-return timing and production canary evidence |
| Phase 2 rich sharing / room invites | Recent canonical contacts/rooms, expiring/revocable invite tokens, scoped preview policy, recipient/device-bound MLS admission, canonical accepted membership, muted/blocked/replay-safe behavior and meaningful participation attribution. Never expose room history or weaken E2EE. |
| Phase 3 Demand / Opportunity / restock / seller liquidity | Complete search→demand→opportunity→response→product→buyer-resolution graph and cohorts; preserve evidence/confidence; address audited DB N=1 clamp; preference/dedupe-aware resolution notifications; active inventory/relevance/response/fulfillment reporting |
| Phase 4 collections / creators / referrals | Actual collection/profile/content destination handlers, authorized sharing, creator value cohorts and utility-first seller referrals using shared envelope/anti-abuse conventions |
| Whole-system definition of done | Full per-loop dashboards and activation/value definitions, retention/cohorts, regional/category liquidity, notification frequency/dedupe verification, meaningful conversation/room value, load/chaos/security acceptance and production rollback drills |

No later-phase loop or full-spec checkbox is represented as complete simply because Phase 1 code/tests exist. Referral incentives, contact-list access, automatic invites, reminder fan-out and reward attribution are intentionally absent.

## Phase 2 — scoped Shopping Room invitations (12 October 2026)

The canonical destination contract now also accepts `/invite/<opaque-token>`.
The frontend Worker runs first for this path and serves the existing app shell
with `Referrer-Policy: no-referrer`; telemetry redacts tokens. UUID room IDs are
not public invitation destinations. Old product links remain supported.

Room admins explicitly select one to four public products and create a
24-hour invitation (server limit seven days). The additive migration
`202610121301_growth_loop_invites_v1` extends the existing growth envelope/events;
it does not introduce another room membership or message store. Server HMAC
links store only token hashes. Stable invitation IDs deduplicate retries;
expiry, revocation, active admin/device/room status, public product safety and
symmetric blocks are rechecked. Guest previews expose selected public products,
not private room names, history, messages or members.

Ask to join preserves the opaque invitation context through authentication.
The recipient submits a device-signed request. An admin must use the existing
MLS roster-change flow, and native members must complete canonical acceptance
before membership is reported ready. A link is never membership authority.
Block/report use existing safety owners; invitation preferences are self-scoped.
No contacts are read and no notification or reminder is generated. Creation
limits are five/user/minute, five/device/minute, twenty/IP/minute and
fifty/user/day; requests are limited and deduplicated per invite/recipient.

`WINGA_GROWTH_ROOM_INVITES_ENABLED` defaults false. Creation/request/confirmation
require this independent flag and the existing cohort policy. Keep it false
until the approved canary and operational checks are complete. Configure
`WINGA_GROWTH_INVITE_SECRET` with at least 32 random characters, server only;
do not put it in frontend config or Git. Measurement uses the existing
`WINGA_GROWTH_MEASUREMENT_ENABLED` and cohort/guest controls. Disabling creation
preserves valid previews, revocation, preferences and safety actions. Disabling
measurement preserves sharing and canonical membership actions.

Admin reporting at `/api/admin/growth/rooms` separates human opens, signed join
requests, canonical accepted memberships, meaningful participation and value
(shortlists/poll closure). First product views do not activate the room loop.
Vote/comment/product-add/shortlist/poll events require a canonical encrypted
message ID from the recipient after the request. Event type remains
client-observed E2EE metadata; no ciphertext or private message body is read
by growth analytics. Existing members and source/self opens are excluded from
acquisition. Invitations delivered and viral coefficient remain unknown rather
than inferred from copy/share actions.

Validation: three invitation SQL/real-MLS scenarios, the full shopping-room
suite, 145 frontend checks, product/room growth contracts and five Chromium
scenarios (guest value, exact product/room auth return and expired invite).
Browser invitation responses and request transport are controlled fixtures;
canonical MLS admission and ledger evidence are tested separately against the
database fixture. Optional analytics SQL failure is injected to prove invitation
state survives. These are pre-production checks, not a real acquisition cohort.

Outstanding Phase 2 gates include opted-in production recipients, regional
performance/load/chaos evidence, server event reconciliation after optional
measurement failure, recent-contact internal share UX, continuation/order
attribution, operational dashboards and cohort retention. Do not mark the
full specification production-ready or enable a broad rollout from these tests.
Rollback: disable room invitation creation and measurement; leave additive
schema and existing MLS rooms intact. Do not drop tables or invalidate legacy
public product links to roll back UI code.

### Internal product sharing

The product media action sheet now offers Share to Winga. Guests authenticate
and return to the same product's destination picker. Recent encrypted inbox
peers and active, accepted, unarchived MLS rooms come from existing canonical
readers. Selecting one destination sends an existing rich product card or
`product-share` room command; plaintext legacy chats are excluded. This action
does not read contacts, automatically select recipients or send notifications
independently of canonical message delivery. Product eligibility is rechecked
before send, and the transport continues to enforce recipient blocks and room
membership. No private message bodies or destination IDs are sent to growth.

Each choice retains one canonical client message ID for retry after failure.
The UI claims success only after canonical transport acceptance. A Chromium
scenario verifies guest auth return, no automatic send, rich-card payload,
excluded legacy peers, stable IDs across a failed send/retry and Room commands.
Existing rich-content/reference and frontend regression checks also pass.
Reel/Short/Collection sharing remains available in the existing conversation
attachment picker; their external destinations and growth attribution belong
to Phase 4. This completes the product destination picker, not all Phase 2
production readiness gates.

## Phase 3 — demand evidence, source lineage and marketplace measurement

Explicit restock/variant requests now support N=1. Canonical candidates count
unique nonempty audience keys in thirty days, exclude seller self-requests and
show-similar actions, and cap the activity contribution per audience. Repeating
a request cannot create more independent evidence. Metadata marks single-signal
versus corroborated evidence; aggregate trend/regional thresholds remain intact.

`recordSupplyResponse` retains the first matching canonical Search/Demand event
ID and its source type in the existing rediscovery eligibility metadata. Search
lineage requires an unmet result and the exact opportunity query where present;
a successful/unrelated category search does not become resolution evidence.
Stable existing response and eligibility IDs preserve retry dedupe. The existing
eligibility ID serves as the buyer-resolution reference linking opportunity,
response, product, feed exposure and authoritative order milestones. Historical
rows are not backfilled with invented source IDs. Eligibility alone is potential
supply matching, not proof that the buyer returned or their need was fulfilled.

The admin-only `/api/admin/growth/marketplace` report reads canonical inventory,
Search, likes, orders, eligibility and authoritative commerce outcomes. Category
supply excludes private products and suspended sellers. Search success means a
nonempty result, not verified relevance. Region/category search health and
weekly first-approved-publication seller cohorts are separate. Seller value
requires a nonself save or noncancelled order after publication; signup alone
never activates a seller. Resolution counts use distinct eligibility IDs so
created/paid/delivered outcomes do not multiply their denominators. Order starts
and delivered status remain distinct; delivery is not independently verified.
No private messages, usernames, audience keys or source-event IDs are exposed
in the aggregate report. Paid reach and Growth events do not write Search.

Executable SQL tests verify N=1 restock/variant evidence, repeated/self/unknown
exclusion, exact search/demand source linkage, stable retries, public supply,
seller value and denominator protection across multiple commerce milestones.
Commerce/growth API and pagination regressions pass. Existing seller opportunity
and rediscovery metrics remain canonical. Opt-in failed-search subscriptions,
preference-aware resolution notifications, full retention cohorts and production
value/performance evidence are still rollout gates, not inferred from fixtures.

### Explicit Search/restock resolution notifications

`WINGA_GROWTH_DEMAND_RESOLUTION_ENABLED` (backend and intelligence worker) and
`growthDemandResolution` (frontend) default false. This independent rollout
uses existing commerce goals/transitions and notifications, with no new demand,
subscription, membership or notification store. Failed Search offers an explicit
Notify me action. Guests authenticate and return to the same locally saved
query. The client rechecks canonical product results before recording unmet
Search and subscribing. The server derives the goal from the authenticated
buyer's own canonical unmet Search event; client-supplied history/source IDs
cannot enroll another buyer. Per-user quotas and an advisory lock deduplicate
retries. A closed subscription cannot be silently reopened by replaying it.

Only explicit Notify me grants `notificationConsent: true` for an in-app update.
Want back remains a signal; Show similar no longer implicitly creates a goal.
Optional goal creation failure preserves the recorded demand action. New consent
merges into the existing canonical goal. Search query text is not placed in a
share URL or growth event. Its short-lived auth intent contains only the
explicitly selected query and expires under the common auth-return contract.

Both existing intelligence processors run a bounded resolution scan at most
every thirty seconds when enabled. Candidates require active users/sellers,
available approved public products, symmetric block checks and exact source
lineage (or the buyer's explicitly requested restock product). Nonmatching and
unsafe goals do not starve matching goals behind the batch limit. One durable
in-app notification is inserted atomically with the canonical `matched`
transition. Notification persistence failure rolls back that transition for
retry. A shared processor lock and two-notifications/recipient/day cap cover
multiple workers. Stable notification IDs prevent duplicate delivery. There
are no reminders, external provider calls, emails or automatic push fan-out.

A match is a **candidate**, not confirmed size/color inventory, buyer satisfaction
or a purchase. Notification copy asks the buyer to verify size, color and
availability. Canonical order milestones and explicit buyer resolution retain
that authority. Notifications open the exact product through a fresh safety
read; unavailable products show a useful message. Notifications also offer Stop
request and Manage product requests using existing self-scoped goal controls.
Stopped goals receive no further match notifications. Blocking the seller hides
these notices through the canonical notification authorization policy.

Validation: real SQL subscription ownership/dedupe, canonical goal transitions,
privacy/block/suspended-seller checks, injected notification write failure,
consent, stopped goals and daily-cap/retry scenarios. Seven Chromium growth
scenarios pass, including exact Search auth return. The browser subscription
response is a fixture; server persistence/admission is tested separately.
Frontend 145/145, growth contracts, pagination, localization gate and synchronized
modules pass. The internal-share browser test now waits for the asynchronous
canonical Room send result; the earlier immediate assertion raced in CI.

Remaining production gates include the opted-in cohort, verifying flags on both
services, processor latency/queue visibility and regional load/chaos evidence.
Enable creation/processing gradually; disabling the flag stops new resolution
alerts while existing goals, notifications and cancellation remain accessible.
No historical demand is declared fulfilled by this rollout.

## Phase 4 — canonical public content destinations

The same validated destination contract now supports PROFILE, COLLECTION, REEL
and SHORT alongside PRODUCT and opaque Room invitations. Worker shell routing
runs first for those paths. Existing public product and legacy category-browse
links remain valid. Unsupported private conversation/seller-opportunity routes
remain rejected until their canonical authorization/admission handlers exist.

`/collection/<id>` resolves the exact existing collection through the canonical
collection reader. The additive read endpoint uses current session authorization
and `private, no-store`; guests see only published public collections. Current
collection-owner and item-seller status are now checked in the canonical reader.
Private/draft collections, blocked viewers and suspended content owners cannot
leak through shared previews. Products open through fresh canonical public reads.
Empty/deleted/unavailable collections offer an Explore fallback before signup.

Published public collections now share their own identity and title instead of
category browse state. Legacy category share controls retain their old behavior.
Following the curator preserves the exact collection/profile return context
through the existing expiring auth intent, with destination validation and
external-redirect rejection. Source identity is a public profile handle; private
room/member/message context is not encoded in these links.

`/profile/<handle>` reuses the canonical public person UI. Seller utility sharing
now lands on that person, rather than an arbitrary latest listing. Public profile
value renders independently of optional collection reads; an unavailable or
stalled collection service cannot block it. Reel/Short destinations require an
approved public product with a ready, nonrejected video before opening the
existing product/video presentation. These routes do not create another creator
or content store.

SQL tests verify collection visibility, block and suspended owner/seller rules.
Browser tests verify exact guest collection value, canonical copy links, follow
auth return, unavailable fallback and public-profile rendering while collections
remain deliberately pending and then fail. All eleven growth browser scenarios
pass, including an actual authenticated failed-Search Notify me control. Search
itself retains its existing members-only policy. The guest Search auth-return
scenario exercises a previously selected context after app readiness; its flags
are initialized in one script so browser init-script ordering cannot race.
Frontend 145/145, growth SQL/contracts, pagination, localization and synchronized
98-module checks pass.

This release wires destination value and source sharing. Generalized
collection/profile/creator attribution, utility seller-referral cohorts and the
multi-loop operations dashboard are subsequent work. It does not certify live
creator acquisition, D1/D7/D30 retention or regional performance. Keep measurement
rollout under the existing cohort controls and retain the production-canary gate.

## Shared server metadata delivery and operations

Migration `202610121602_growth_event_jobs_v1` adds one reusable growth event
outbox and Room measurement-eligibility flags to the existing canonical invite
records. Accepted Room metadata is durably queued after authorization/ledger
checks, then delivered to the same `growth_events` ledger asynchronously. The
outbox stores opaque attribution/event IDs, actor hashes and allowlisted event
metadata; no tokens, private room IDs, ciphertext or private message bodies.
Processing uses bounded batches and `FOR UPDATE SKIP LOCKED`, savepoint isolation,
six attempts, exponential backoff capped at five minutes, and dead letters.
Canonical event uniqueness protects at-least-once delivery.

Replay at `/api/admin/growth/events/replay` accepts at most fifty event IDs, only
for dead jobs still within their original twenty-four-hour deadline. Replay
preserves event identity, original creation/occurrence times and expiry.
Reconciliation uses canonical opted-in invitation/request/acceptance facts if
optional enqueue failed. It preserves those facts' original times and lifetime;
it does not manufacture participation from ciphertext or enroll records created
while measurement was disabled. Excluded cohort records are removed from
reconciliation eligibility rather than repeatedly starving a bounded batch.
Unmeasured requests do not enter acquisition denominators.

Admin-only `/api/admin/growth/events` exposes aggregate queue states, retries,
oldest ages and missing/expired invitation-creation reconciliation gaps. Manual
reconciliation at `/api/admin/growth/events/reconcile` is bounded and requires an
empty action body. No endpoint changes room membership, notifications, orders or
content access. Existing CSRF/session/admin authorization applies. Both existing
intelligence processors drain metadata opportunistically; the global measurement
kill switch pauses processing without blocking core user actions. Existing
browser outbox and direct product ledger contracts remain canonical.

The browser regression now holds initial product requests to reproduce a real
auth lifecycle race: late boot could close an auth dialog requested by the user.
Opening auth cancels pending session restoration, and boot preserves the active
auth dialog/context. The deliberately delayed-boot scenario now passes. Invite
tokens are redacted centrally before all audit writes, and destination validation
rejects inherited object keys as content types.

Validation: durable async receipt/delivery, duplicate IDs, original occurrence
and expiry, SQL failure/backoff/dead-letter/replay, expired replay rejection,
measurement kill switch, canonical Room fact reconciliation, no retrospective
enrollment, admin authorization and strict operation bodies. Full Room and
frontend suites pass, eleven browser scenarios pass, and backend startup/health/
graceful shutdown pass with localhost access. CI additionally runs the queue SQL
contracts against disposable PostgreSQL. These checks do not establish live
cohort activation, D7/D30 retention or production load/chaos SLOs.

Rollback: stop measurement processing and invitation creation flags; retain the
additive schema and canonical Room state. Keep dead letters for diagnosis and
resume only eligible records inside original expiry. Do not renew deadlines or
replay private content to reconstruct unavailable client-observed participation.

## Public-content measurement extension — 2026-10-12

Collections, public profiles, Reels (including approved photo Reels) and Shorts now reuse the canonical share envelope, expiry/revocation, cohort policy, rate buckets, event dedupe, destination validation and browser outbox. Each has a separate disabled-by-default sharing flag. Product metrics remain separate. Private/empty collections, suspended creators, non-ready video, self actions and blocked participants cannot create attributed value. Canonical follow/save rows must postdate the share; link opens and registration are not sales or activation.

The admin content report separates each content loop and reports observed views, verified follow/save value, reshares and time to value; delivered invitations and cross-device acquisition remain unknown. The restored browser outbox strips unsupported fields and rejects expired original contexts even when retry timestamps are corrupt.

Validation: growth policy/runtime/SQL/event-job suite passed; frontend and module synchronization/localization gates passed; 12 browser scenarios passed, including guest collection discovery, opaque reshare URLs and destination delivery while attribution returns 503. These are isolated synthetic tests, not production acquisition evidence. Production feature activation remains subject to the explicitly selected opted-in cohort.

## Loop dashboards and authenticated cohorts — 2026-10-12

The existing admin analytics surface now loads separate product, Room, public-content, marketplace and durable-delivery reports asynchronously. A failed report displays unavailable, not fabricated zero conversions; account changes discard late responses. No user IDs, invite tokens or private message bodies are displayed. The dashboard remains accessible when optional marketplace analytics fail. Labels are supplied in all four existing locales.

An additive migration records only a server-derived authenticated account hash on newly accepted recipient events. Legacy/anonymous events remain unlinked; no backfill guesses identities. The aggregate cohort endpoint reports activation/value and exact 24-hour D1/D7/D30 return windows with mature denominators (2/8/31 elapsed days). This measures accepted growth-event return, not whole-app retention or proven first-ever acquisition. Historical source/cross-device claims without evidence remain unknown.

Validation: canonical SQL cohort tests verify authenticated identity, anonymous exclusion, mature denominators and unknown immature rates; dashboard tests cover partial outages, escaped text and late account switches. Growth suites, four Room invitation/privacy/reconciliation scenarios, frontend checks, module synchronization and localization gates pass. Production D1/D7/D30 observations still require opted-in traffic and elapsed observation windows.

## Rich internal content and Room value transitions — 2026-10-12

Internal sharing reuses the canonical rich-content codec, encrypted peer sender and MLS Room sender for public collections, Reel and Short cards. Stable action IDs survive retries. Room cards reuse the canonical live reference reader/renderer in reference-only mode, so they cannot install a direct-message composer in a Room. The separate `growthInternalContentSharing` source flag defaults false. Product sharing remains compatible with the existing Room product-share command. Older clients retain an encrypted text fallback for public structured card identities; no private admission or order context is added to these cards.

Room product views can retain a bounded, account-scoped, 30-minute in-memory order context. An attributed order must be owned by the accepted invitee, postdate accepted membership, involve a different seller and match a public product explicitly selected for invitation preview. The ledger records the verified event, never order/payment fields. A new-Room continuation requires a different, newly created, fully accepted native Room owned/administered by the invitee. Client requests carry only an opaque SHA-256 Room reference; raw private Room IDs remain in the existing encrypted vault. No signup, join request or unfinished Room reservation counts as this value.

Validation: 13 browser scenarios passed, growth/runtime tests passed, full native MLS/Room suite and frontend/reference tests passed. A real PostgreSQL acceptance fixture failure was corrected: the canonical migration runner test now applies the account-cohort migration rather than incorrectly declaring it pre-applied. Disposable PostgreSQL verifies rollback, concurrency, quotas and native invitation/order/continuation behavior. No production users were invited, messaged or ordered on their behalf.

## Authorized Opportunity destination — 2026-10-12

The canonical router now accepts `/opportunity/<id>` only through an authenticated, authorized supply-context handler. It is excluded from public share-envelope types and rejects all query-string redirects/attribution additions. Guest UI explains the required sign-in without fetching or revealing demand details. The 30-minute safe auth intent preserves the exact Opportunity ID and strips arbitrary fields.

The exact read reuses canonical seller category relevance, expiry and ignored/dismissed response rules, reads the primary and rechecks referenced product privacy, moderation, seller status and symmetric blocks. API responses are private/no-store and project only approved aggregate evidence fields. The existing seller Opportunity card/actions render the destination; this adds no alternate supply-response or ranking system.

Validation: 14 browser scenarios pass including real authentication to exact Opportunity context; canonical SQL cases cover category denial, dismissal, expiry, source blocks and private-product denial. Growth/commerce/frontend checks, module synchronization and four-locale validation pass. This is source/synthetic evidence, not production seller activation.

Production configuration observation: backend Product Sharing and Measurement are enabled with cohort mode `allowlist`; Room/content/demand-resolution flags are unset and therefore use false source defaults. Do not describe all production growth flags as off. No cohort enrollment or later-phase feature flags were changed by this work.
