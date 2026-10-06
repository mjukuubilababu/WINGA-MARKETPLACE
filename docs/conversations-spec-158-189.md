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
| 162 | Durable account-level mute/archive with revision checks; foreground canonical preference reconciliation; draft-preserving archive refresh; unsaved mute intent and explicit conflict retry; account/session guards; existing encrypted send/receipt/event reconciliation. Opt-in MLS candidate supports authenticated additional-device commits and future-message convergence. | Production still has one selected chat endpoint per person. Candidate convergence is not canonical backend fanout, old-history transfer, full media access or production acceptance. |
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

## Native Multi-Device Candidate

`src/chat/mls-runtime.mjs` extends the existing MLS ratchet rather than creating a
pairwise fanout stack. At the initial native-core publication, `multiDevice`
defaulted to false and the production encryption session did not pass it. The
subsequent gated canonical integration is described below; publishing source does
not activate its default-off environment gate. CSP and credentials are unchanged.

The opt-in candidate provides `addDevice`, `applyDeviceCommit` and
`acceptDeviceWelcome`. A fresh one-time KeyPackage must match an explicitly trusted
active native fingerprint and its MLS signing key. Only the same two accounts are
allowed; this is NOT a multi-account Shopping Room implementation. Candidate caps
are four endpoints per owner and eight per direct group, not a public-room policy.

Every admission binds an exact expected operation ID, actor, recipient device,
package digest, previous/new epoch, complete credential roster and MLS tree. The
expected intent MUST come from a verified canonical reservation/native proof, not
be copied from an untrusted transfer. Current members authenticate the Commit's
actual sender leaf and single Add proposal before atomically persisting the new
ratchet. Initial `addPeer` cannot be reused to bypass additional-device admission.

The initiator durably freezes its sends until membership is confirmed; unresolved
text/media journals block admission rather than being discarded. Exact Commit and
Welcome retries retain operation digests, reject changed data, and survive reload.
Membership replay digests use the existing encrypted journal rather than consuming
bounded active-record slots. A failed vault write leaves the old epoch/admission
keys usable. This local freeze is NOT an authoritative all-device server barrier.

`encodeDeviceAdmissionPayload` and `decodeDeviceAdmissionPayload` produce bounded,
canonical base64url wire fields and a single canonical roster string. The native
transport-v1 signature helper canonicalizes flat payload keys: sending the roster
as nested objects would omit inner fields from that helper's digest. The flat codec
binds every credential without changing any existing production signature version.
The codec is structural validation, not native-proof verification or authorization.

Future messages from an admitted sibling populate the same owner's outgoing
history with Sent, never falsely Delivered/Read. Incoming peer messages retain
Delivered semantics. Signed content must match the actual authenticated MLS sender
leaf as well as any outer sender metadata; a member cannot rewrap another member's
valid signed body to impersonate that device. Replayed envelopes still require the
original epoch, native sender and digest. Ratchets do not advance on rejection.

The candidate tests use actual native MLS keys/commits and three/four endpoints.
The browser harness uses three isolated profiles, real native enrollment and
existing-device approval through the local backend fixture, a nonextractable native
signature verified by backend code, owner-bound encrypted IndexedDB, reload, and
unchanged strict CSP. Its membership transport is a test harness, NOT the enabled
canonical production admission service. The new endpoint does not decrypt or gain
automatic history from before admission; no historical attachment grants are given.

### Required Before Activation

- Extend the existing canonical store with revision/epoch membership and native
  admission proofs; reserve/consume packages transactionally, enforce quotas and
  derive every recipient from authoritative membership, never client arrays.
- Freeze protected writes globally while a transition is pending. Reconcile all
  accepted old-epoch traffic before allowing advancement; a creator's empty local
  outbox alone does not prove every existing device has drained that epoch.
- Obtain separate verified Commit ACKs from each retained endpoint and Welcome
  acceptance from the added endpoint before activating future grants. Preserve
  exact operation IDs across uncertain replies, crashes and retries.
- Extend polling, event routing, push suppression, receipts and private-media
  checks together. An own-sibling synchronization ACK is not recipient Delivered
  or Read. Receipt acknowledgement must be per reading endpoint so one device
  cannot drain another device's unprocessed evidence.
- Implement multi-endpoint revocation/removal and replacement before activation.
  Current direct replacement intentionally refuses groups with more than two
  leaves. Native-pin revocation fails closed; it is not a complete removal flow.
- Authorize encrypted historical transfer separately from future MLS membership;
  preserve provenance, immutable merge/replay rules, freshness and attachment
  authorization. Do not export old MLS ratchets or silently overwrite the latest
  independent recovery checkpoint.
- Add real PostgreSQL admission/ACK/removal races and representative sustained
  dependency-failure/load tests, then authenticated production/physical-device
  acceptance. Independent cryptographic approval remains separate and absent.

## Verified Publication And Local Database Exercise

Published release: backend commit `ba1f4dfc6f332fffbe78f476b08fcd8ae5da6fec`,
frontend build `20261006151029`, Cloudflare Worker version
`b014c379-af8a-4c99-8783-2539d07f45d6`. Direct and same-domain readiness both
returned Ready and that exact backend commit. Ten published static asset hashes
matched the release directory; unauthenticated conversation ops metrics returned
401. File-copy changes described above were implemented after this publication;
they must not be represented as part of that already-live commit.

Subsequent verified file-copy publication: backend commit
`628089689f96f91b9ee4d1d71bfaa94eef55cbb8`, frontend build `20261006155810`,
Cloudflare Worker version `2bbd4d60-0ffc-451a-893c-fdea3140401f`. Ready returned
that exact backend SHA; eleven published static-asset digests matched the release
directory and unauthenticated report-file requests were rejected. Authenticated
production report-file acceptance was not exercised. The native multi-device
candidate described above was implemented AFTER this publication. Publishing its
source does not enable multi-device admission: production construction keeps it
disabled until the canonical backend activation requirements are satisfied.

The subsequent local multi-device candidate build is `20261006164553` (90
synchronized modules). Final checks passed: 120 secure-content/backend tests,
including 40 native MLS tests; all 35 strict-CSP browser crypto tests; all 33 real
PostgreSQL concurrency/load regressions; 145 frontend core checks plus 80 frontend
behavior tests; four catalogs of 1,518 keys with no new untranslated UI debt.
The disposable PostgreSQL cluster stopped successfully. The local-only preview
serves this build and the new admission codec at `http://127.0.0.1:4318/`.
The 33 PostgreSQL tests cover the existing canonical direct/report paths, NOT a
new multi-endpoint admission store or Shopping Room workload. No production
deployment was performed during these local checks. The operator subsequently
requested publishing this tested build. Exact live commit/build identity must be
verified from release tooling; no additional instances, credentials, feature
activation or CSP changes are authorized by source publication.

Verified native-core publication: commit `cb89767ab2675aa77a43a9916020cb2841600aa4`,
frontend build `20261006164553`, Worker version
`70668183-2f34-4106-bec5-bb2fba3f7b44`. Both direct and same-domain health returned
Ready with that exact backend SHA. Eight core/crypto static asset digests matched
the prepared release; the Worker-generated build identity reported the same build.
Multi-device admission remains disabled; this publication does not close its gate.

### Canonical Device Delivery Foundation

The subsequent additive migration `2026100605_encrypted_device_delivery` snapshots
native device/owner membership for each existing MLS epoch. Initial admission and
replacement seed the snapshot in the same transaction; historic grants are
immutable and cannot be rewritten or deleted. A new login/active native identity
alone does not create a conversation grant. Reusing an existing epoch with changed
creator/recipient devices is rejected. Historical receipt and media checks use the
device/owner snapshot, while current access still requires the selected endpoint.

Receipt ACKs are separate durable rows keyed by message, receipt native device,
kind and observing sender native device. The browser names the verified receipt
actor in its signed ACK. A legacy client may omit that actor only if exactly one
matching peer receipt exists; ambiguity is rejected without draining anything.
Polling consults the observing endpoint's ACK, not a shared sender-ACK timestamp.
Existing legacy ACKs backfill only their actual sender endpoint. Own-account
sibling copies cannot create peer Delivered/Read receipts. This is NOT yet an
own-sibling sync-ACK transport or fully admitted multi-device service.

Read-only readiness now requires nine crypto migrations and the two enabled
device grant triggers in addition to the unchanged downgrade guards. The new
browser ACK payload requires this backend migration/code before frontend deploy;
old browser ACKs remain compatible for existing direct pairs.

Canonical multi-device reservation/Commit/Welcome/retained-endpoint acceptance,
global old-epoch drain, sibling sync ACKs, per-endpoint receipt fanout, removal,
authorized old-history transfer and Shopping Rooms remain pending. Synthetic
extra epoch rows used by ACK race tests are fixtures, not production admission
or Shopping Room capacity evidence.

Device-delivery local validation: 123 secure-content/backend tests passed, then
all five focused membership/ACK/readiness regressions passed after adding the
own-account sender-copy case. All 35 strict-CSP browser crypto tests, 34 real
PostgreSQL concurrency/load tests, frontend core/80 behavior checks and four
1,518-key locale catalogs passed. The disposable PostgreSQL cluster shut down.
The 90-module release build is `20261006171240`; its deployment dry-run passed.
This validation is local evidence, not authenticated production acceptance or
independent cryptographic approval. New frontend ACKs deploy after the exact
backend release becomes Ready; no multi-device feature gate is changed.

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

Full simultaneous multi-device history is still OPEN. The gated integration below
distributes future live membership only after all native endpoint acceptances;
approval or recovery alone does not create historical attachment authorization.
Shopping Rooms remain OPEN and cannot be enabled by relabeling a direct
creator/recipient conversation.

### Gated Canonical Native Admission

The additive migration `2026100606_encrypted_device_admissions` adds authoritative
reservations, per-native-device acceptances, retired-intent tombstones and separate
own-sibling synchronization ACKs. Read-only readiness now requires ten crypto
migrations and checks these tables. `WINGA_ENCRYPTED_MULTIDEVICE_ENABLED` defaults
to false in the store, HTTP capabilities, browser service and environment example.
An absent flag preserves the existing two-endpoint flow and rejects new actions.

When explicitly enabled in synthetic acceptance, reservations consume one exact
approved native KeyPackage under the existing transport transaction guard. Every
retained endpoint must first drain old-epoch traffic. Protected text/media writes
freeze globally while the reservation or Commit is pending. Immutable future epoch
grants activate only after every retained native endpoint and the added native
endpoint has durably accepted the exact signed Commit/Welcome hash. Membership
intent, actual MLS sender leaf and the full credential roster are verified;
unverified fingerprints require explicit confirmation, not automatic login trust.

Polling and native receipt ACKs are per endpoint. Own-account message copies use
Sync ACKs, never peer Delivered/Read. Actual peer Delivered/Read evidence converges
on all authorized sender endpoints independently. Ciphertext creation, receipt
changes and membership transitions append metadata-only hints to the existing
canonical event ledger; no second transport, plaintext mirror or new Phoenix
instance is introduced. Native identity mutation acquires the transport guard
before account/session locks so revocation cannot race final membership acceptance.

Chat security includes an explicit additional-device fingerprint form and pending
acceptance state. Lost accepted transfer replies preserve the exact encrypted local
journal across reload and do not advance the epoch twice. An accepted reservation
cannot be silently abandoned. Old messages and attachments are NOT granted to a
new endpoint. Pair replacement refuses expanded rosters instead of exporting old
ratchets or dropping another endpoint. Expanded-roster removal/replacement,
separately authorized old-history transfer and Shopping Rooms remain incomplete;
keep the production gate OFF until those lifecycle requirements pass.

Local final verification passed: 129 secure-content/backend tests, 36 strict-CSP
browser tests, 96 messaging tests, 145 frontend core checks plus 80 behavior tests,
and four 1,521-key locale catalogs with no hardcoded-UI debt. The browser acceptance
uses the actual production session/API/store code with isolated Alice/Bob accounts
and a third approved Alice device, real native MLS Commit/Welcome, lost HTTP reply,
reload, ciphertext-only storage and independent Sent/Delivered/Read convergence.
The security dialog was checked at 390px and 1440px with no horizontal overflow.

All 36 real PostgreSQL regressions passed on a disposable local cluster with two
store instances and six connections. Admission races include competing intents,
exact reservation/transfer retries, eighteen native acceptance attempts, one epoch
advance, three distinct acceptances, and an old-epoch writer blocked by an accepted
reservation. The cluster stopped successfully. Existing bounded direct load covers
64 unique messages and 74 attempts, not sustained production or Shopping Room
capacity. No authenticated production exercise, historical-media acceptance or
independent cryptographic approval is implied. Exact publication identity must be
verified separately after pushing and deploying this candidate.

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
