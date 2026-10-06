# Conversations 158-189: Implementation And Acceptance

Date: 2026-10-06. This is a local implementation ledger, not a production
deployment, independent cryptographic approval or declaration of completion.
The source remains winga-conversations-spec-110-238.txt.

## Direct Conversations

| Section | Current implementation | Remaining acceptance or implementation |
| --- | --- | --- |
| 158 | Explicit subjects and selected canonical incoming evidence; text-only compatibility; optional separately selected encrypted file copies; independent copy keys; private report namespace; immutable retry; audited primary-role moderator downloads. | Physical-device/production moderation acceptance remains. At most 3 files of 2 MiB each. In-dialog retry is supported; interrupted copies do not automatically resume after reload. Post-close deletion policy remains undecided. |
| 159 | No universal chat decryption key. Primary auth, signed native devices, blocks, report rate limits, membership checks and account/device revocation remain authoritative. | Reputation/abuse classification is not automatic conviction. Calibrated signals and operational review remain. |
| 160 | Generic localized lock-screen copy only. Providers never receive private bodies, filenames or keys. Push failure never grants Read/Delivered or rolls back accepted content. | Physical-device provider/OS acceptance; no delivery promise after browser force-stop. |
| 161 | One durable job per subscription/message. HMAC-derived opaque conversation topic and OS tag replace same-conversation alerts. Exact retries retain the same navigation job. Read/mute rechecked before dispatch. | Fleet/OS acceptance and optional active-device election. Foreground suppression is receipt-driven, not assumed from an open tab. |
| 162 | Durable account-level mute/archive with revision checks; foreground canonical preference reconciliation; draft-preserving archive refresh; unsaved mute intent and explicit conflict retry; account/session guards; existing encrypted send/receipt/event reconciliation. | Preference reconciliation is eventual, not durable instant fanout. MLS has one selected chat endpoint per person; simultaneous three-device history convergence is NOT proven. |
| 163 | Exact new-device/recovery behavior below; no automatic replacement trust. | Physical-device recovery/replacement acceptance. |
| 164 | AES-GCM owner-bound IndexedDB, nonextractable local key, atomic revisioned writes, bounded records/pages/recovery, transient plaintext UI cleanup; session-consistent history snapshots and per-page conversation filtering. | Total journal retention/quota/eviction and OS-profile backup protection remain open. A selected conversation's full history is not a bounded total-memory snapshot. Replay tombstones/live epochs cannot be silently evicted. |
| 165 | Local search in both direct surfaces: projected text, product references, sender and UTC dates. No remote query/index. Max 5,000 scanned rows/100 results. | Persistent encrypted indexing and availability beyond loaded device history are future work. This is not global server search. |
| 166-167 | Business/staff roles do not confer crypto membership or owner keys. Direct endpoints remain extensible. | Business inbox explicitly FUTURE. Shared endpoints/staff history need a separately approved authorization contract. |
| 168-169 | Whitelisted operation/outcome/duration counters; content-free send diagnostics; authenticated no-store ops metrics. | Fleet aggregation, unique-send versus retry accounting, response latency and adoption dashboard remain open. |
| 170 | Direct SQL, crypto, media, recovery, retry, receipt, privacy and browser suites; independent real PostgreSQL races; bounded two-store/six-connection load with native MLS recipient decryption and duplicate/receipt checks. | Gate OPEN: representative sustained load/soak/dependency failure and applicable production/physical-device acceptance. The local synthetic-pair load is not fleet capacity, Shopping Room acceptance or independent security approval. |

## Notification Policy

All live subscribed devices may receive one generic alert per conversation.
There is no guessed active-device winner that silently loses another alert.
Notifications are not message acceptance or read receipts.

Foreground alone does not suppress push: an open tab may be disconnected,
covered or unable to decrypt. Existing focused visible-message Read updates
canonical state, suppressing pending dispatch. User-visible-only browser push
must not become invisible background traffic. A provider-accepted push can
still arrive after a read/mute; it cannot be recalled.

The grouping token uses the persisted VAPID secret and a versioned domain
separator, without cleartext user/peer/content/filename. Clients only accept
fixed-format opaque tokens. Old payloads keep message-job tags. Different
accounts/peers have different groups. Clicks still resolve a live session-bound
job server-side; a grouping token is never an authorization grant.

## History, Cache And Recovery

### Preference Reconciliation

An open foreground chat/inbox checks the canonical account archive list on a
15-second nominal interval. Focus, visibility restoration and network restoration
wake reconciliation. Requests coalesce, event wakes are throttled, and failures
back off to at most 60 seconds, including repeated lifecycle wakes. Hidden/offline/
inactive surfaces start no new polling requests; in-flight responses cannot
rerender a hidden or replaced surface. Session/owner/token replacement stops the old watcher, and late results
cannot rerender the new account. Timing depends on network/browser scheduling;
this is not a realtime delivery SLA or background-push mechanism.

An open untouched mute switch reconciles canonical state. An unsaved choice
is not overwritten or automatically submitted. A revision conflict refreshes
the baseline and shows failure; another explicit Save is required. No mute
expiry or automatic unmute is introduced. Archive reconciliation never replaces
an open composer or moves a remotely archived conversation out of an open chat.

### Sealed History

- Selected enrolled/native chat devices receive authorized epoch ciphertext.
  Login/business role does not grant old keys.
- Contact-verified replacement gets future epoch traffic, not automatic history.
- User recovery key AND latest independent checkpoint restore the bounded
  history capsule. They do not recreate native identity/live MLS state or bypass
  original attachment epoch authorization.
- At rest, history/drafts/MLS state use owner/record-bound AES-GCM. Per-value
  maximum 4 MiB, active records 2,000/32 MiB, page 100/4 MiB, bounded recovery.
  These are NOT a total journal-retention cap.
- Full history reads bind every page and the final return to one original
  session, including same-owner session replacement. Conversation filtering
  happens per decrypted page, avoiding accumulation of other chats' history.
  Each page still decrypts locally, and the selected history can remain large.
  No history/replay/epoch entries are evicted by this optimization.
- Logout/account switch invalidates session guards and transient search/report
  plaintext. Sealed IndexedDB persists for subsequent same-owner login.
  Logout is not irreversible deletion of encrypted history.
- Browser profile/OS backup may copy database AND locally usable key state.
  Nonextractability is not hardware-bound protection or an OS backup guarantee.
- No silent deletion of replay/admission tombstones or live epoch state.
  Total quota/eviction needs reviewed policy preserving replay and recovery.

## Report Retention

Operator decision: retain evidence while a case is open. The post-close deletion
deadline is NOT decided. Closing a case therefore does not silently delete
evidence or promise automatic erasure. File sharing uses the already isolated
private conversation bucket in a separate `report-evidence/v1/` namespace.
No public URL, original attachment key, MLS secret or recovery key is shared.
Disclosed text and files are explicitly unverified
against ciphertext: canonical parties are checked, not truth of the claim.

### Consented File Copies

The reporter must independently select a file copy and consent to disclosure.
Selecting a media message alone never downloads or shares its file. Only selected
incoming encrypted media IDs from the canonical report participants are admissible.
The browser decrypts the original with its existing authorization, then creates a
fresh AES-GCM copy and random copy key using the existing secure-content codec.
Its binding is `report-evidence-v1:<report-request-UUID>` plus a fresh attachment
UUID, not the original conversation binding. That copy key is intentionally
disclosed to moderation and stored in private report metadata; it is not a
universal chat decryption key. This exception must not be called undisclosed E2EE.

The transaction reserves at most three immutable objects, each at most 2 MiB
plaintext plus authenticated metadata overhead, before R2 upload. Every storage
operation checks current primary session/role and object identity before/after
I/O and verifies private bucket configuration, byte length and digest. Upload
requires the original reporter and an open case. Reads require a current primary
moderator/admin role and an explicit audited reason; closing a case does not
silently erase retained evidence. Listing a case does not expose a copy key.

The reviewer must explicitly request each available copy. Decryption occurs in
the reviewer's browser and downloads as a fixed-name octet-stream `.bin`; no
automatic image/HTML/PDF rendering or embedded external content is introduced.
Session/role/background changes invalidate late UI results. Failed uploads retry
the same reserved report and object in the still-open dialog. Closing/reloading
that dialog clears transient copy material, not server-retained evidence; pending
copies remain visibly unavailable and automatic cross-reload resume is not claimed.

## Verified Publication And Local Database Exercise

Published release: backend commit `ba1f4dfc6f332fffbe78f476b08fcd8ae5da6fec`,
frontend build `20261006151029`, Cloudflare Worker version
`b014c379-af8a-4c99-8783-2539d07f45d6`. Direct and same-domain readiness both
returned Ready and that exact backend commit. Ten published static asset hashes
matched the release directory; unauthenticated conversation ops metrics returned
401. File-copy changes described above were implemented after this publication;
they must not be represented as part of that already-live commit.

`scripts/run-local-conversation-db-tests.ps1` creates a fresh disposable PostgreSQL
cluster using existing installed binaries, binds only `127.0.0.1`, sets a process-local
explicit test URL, and stops only its own cluster in `finally`. It never reads or
falls back to `DATABASE_URL`. Synthetic cluster directories remain ignored for
diagnosis, rather than deleting an existing database or Windows service.

The bounded load exercises 64 distinct encrypted messages and 74 attempts,
two store instances, six connections, contiguous canonical sequences, zero
duplicate rows, 64 independent recipient decryptions and idempotent Delivered
receipts. One isolated run measured 904 ms for store attempts and 404 ms empirical
p95 attempt latency on this machine. These are local observations including retry
attempts, not a production SLO, end-to-end device latency or Shopping Room proof.

Full simultaneous multi-device history is still OPEN. Existing approval, per-device
replay and recovery capsules do not distribute live MLS membership or historical
attachment authorization to every approved device. Shopping Rooms likewise remain
OPEN and cannot be enabled by relabeling a direct creator/recipient conversation.

The file-copy candidate was built as `20261006155810` with 90 synchronized
source modules and four catalogs of 1,518 keys. Verification passed: 107 secure
content/backend tests, 96 messaging tests, 34 real-browser crypto tests, 18 report
browser tests, 145 frontend core checks plus 80 frontend behavior tests, and
33 real PostgreSQL concurrency/load tests. The final disposable runner completed
its shutdown successfully. Mobile 320px, desktop 1280px and Arabic RTL report
screenshots were checked for overflow; JavaScript eval remains blocked by CSP.
No new independent cryptographic approval or production media exercise is implied.

## Shopping Rooms: 171-189

The foundation gate remains open. The following is the next-phase contract,
NOT an enabled room service. Room UI must not send through the pairwise path.

| Section | Canonical extension / boundary | Status |
| --- | --- | --- |
| 171 | Extend Conversations/sequence/devices/events/media/receipts/transport. No parallel stack. | Gated, not implemented. |
| 172-173 | Private decision space; chronological Chat, separately queryable Products/Polls/Shortlist/Orders. | Presentation exists; authoritative room state absent. |
| 174 | Product sharing never admits its seller or exposes unrelated history. | Required invariant; room service pending. |
| 175 | Authoritative membership/native MLS epoch transition; auth/routing/push/read grants change together. | Group protocol/store extension pending; direct MLS is not group membership. |
| 176-177 | Intentional canonical products, current authorized price/stock, historical share context separately. | Board pending. No invented price/stock. |
| 178 | Optional shortlist, no forced purchase funnel. | Structured room state pending. |
| 179 | Idempotent per-member votes, transactional uniqueness/revision, reviewed E2EE/metadata model. | Privacy model and room store pending. |
| 180 | Compare only canonical product attributes; unknown remains unknown. | Comparison pending. |
| 181 | Explicit bounded question/product disclosure in existing seller direct pair, correlated response, no room admission. | Request/response card contract pending. |
| 182 | Canonical Product/Order truth, not chat-only payments. | Explicitly FUTURE. No wallet/automatic-payment authorization. |
| 183-185 | Optional intelligence/assistant/summary. Core works without AI; no external plaintext/invented preferences. | Explicitly FUTURE; not enabled. |
| 186 | Intentional authenticated invites, quotas/block/abuse checks. | Membership/invite service pending. |
| 187 | Expiring/revocable opaque limited-scope invite; auth onboarding, no anonymous history. | Explicitly FUTURE. |
| 188 | Config-driven bounded small-group policy, separate from public scale. | Enforcement awaits canonical group implementation. |
| 189 | Separate public-community fanout/moderation/ranking/privacy/storage contract. | Deliberately NOT a private-room feature. |

### Membership Transaction Design

Lock canonical conversation; verify primary session, active native device,
membership revision and epoch on every operation. Admission/removal freezes
future protected sends until verified MLS commit/Welcome are durable.
Stale epochs/removed endpoints cannot send, poll, receive new routing grants
or download future media. Derive recipients from authoritative membership,
never client arrays. Removal cannot erase already seen plaintext or accepted push.

Use the chosen MLS runtime's verified group commits. Do not relax direct
creator/recipient checks into arbitrary arrays. Extend exact retry, sequence,
native proof and concurrent membership tests in the existing canonical store.

### Structured State Privacy Design

Chronological events and structured room state need a consistent revision and
snapshot/replay boundary. Private poll titles/options/notes stay encrypted.
One-member-one-vote needs reviewed metadata: opaque IDs still reveal
participation. Never call server-visible voting metadata invisible to Winga.
No such disclosure is silently activated in this release.

Ask Seller is participant-confirmed disclosure into the existing direct pair,
using canonical product/request IDs. Authorized correlated response is not
room admission. Orders/payment require existing canonical checkout and explicit
authorization. Approve these contracts before implementation/activation.

## Release Checks

New migration: 2026100604_conversation_report_subject, after report evidence.
Backend migration precedes subject-aware frontend deployment. No CSP relaxation,
secret rotation, provider/instance changes, plaintext fallback or room activation.

Ops endpoint: /api/ops/conversations/metrics. Existing ops token; private/no-store.
Public /health and /api/health expose X-Winga-Commit only for a valid Render
40-character lowercase commit SHA. It is release identity, never an arbitrary
environment dump. Both real readiness responses and invalid-value rejection
passed the isolated server lifecycle tests.
Counters are process-local, reset on restart, and count attempts including
retries. They are NOT unique messages, fleet SLO or adoption proof.

Do not label all 158-189 complete. Direct improvements, future requirements,
room design and production acceptance are distinct statuses.

### Local Verification Evidence

- Normal message suite: 93 passed (SQL/PGlite, paging, retry, receipts, reports,
  push, local search, aggregate metrics and eight preference lifecycle checks).
- Browser crypto suite: 34 passed, including real native enrollment, MLS,
  HttpOnly cookie sessions, ciphertext media, replacement and recovery under
  unchanged CSP; filtered history and cross-page session replacement regression.
- Complete chat UI regression: 96 passed. Final archive/mute rerun after event
  backoff hardening: 21 passed, including remote state, preserved drafts,
  explicit conflict retries and delayed-response/session isolation.
- Frontend core/behavior suites (80 behavior tests), build, 90-module synchronization, four catalogs
  with 1,512 keys each, zero new hardcoded UI debt, syntax and diff checks passed.
- Synthetic screenshots inspected at mobile/desktop/RTL dimensions.
- Full encrypted-store run: 59 passed; real cross-connection concurrency suite
  could not start without disposable localhost WINGA_TEST_POSTGRES_URL.
  No production database credentials or substitute serialized database used.
- Local preview: port 4318, build 20261006151029. Exact app/bundle/CSS/service-worker
  hashes matched the generated assets. Wrangler deployment dry-run passed.
  The operator requested publishing this prepared release; actual commit,
  push and deployment results must be recorded from the release tools.

These results do not close the direct foundation/room activation gate.
