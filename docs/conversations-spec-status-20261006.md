# Conversations Spec Status: 2026-10-06

This is the current grouped implementation index for the preserved 0-109 and
110-238 contracts. It is not a completion percentage, security certification,
or a replacement for the source specification. Historical audit/handoff files
describe their dated checkpoints, not necessarily the current enabled runtime.

## Current Production Checkpoint: 2026-10-08

Release `6e3277edd57229f751c5fe3609d95db8741405ae` is verified ready on Render;
frontend build `20261008193054` is deployed and public production smoke checks
passed. The subsequent [222-225 test-suite/security matrix](conversations-spec-222-225-20261008.md)
records executable coverage, isolated database interruption/retry, native Room
revocation tests and CI/dependency/fuzz gates. It explicitly retains unsupported
group-order references, encrypted BEAM-loss acceptance and independent audit/load
as open, rather than equating a configured test job with approval. All four jobs
passed in final run `37837456327` at `69136e5`: direct 165, E2EE 159, native Rooms
89 plus 14 reference cases, security 48, genuine PostgreSQL 93 and browser 48,
all with zero skips. BEAM node-loss/restart acceptance, dependency scanning and
CodeQL analysis/upload passed. CodeQL alert triage remains open. The accepted
tree differs from live `6e3277e` only in a browser fixture and evidence documents;
runtime files are unchanged, and the later test/docs commit is not claimed Live.

The subsequent [210-221 invariant and recovery matrix](conversations-spec-210-221-20261008.md)
records durable acceptance evidence/guards, deferred optional push fan-out,
protected event authorization, revoked-device recovery exclusion and automatic
retained-intent retries. This deployed release is not authenticated production-load or
cryptographic acceptance; the deferred device approvals remain unchanged.

The subsequent [193-209 implementation and acceptance matrix](conversations-spec-193-209-20261008.md)
records globalization/accessibility, constrained-network/local-first behavior,
canonical reconciliation, rollout/kill controls, non-destructive legacy migration
and content-free Conversations Operations observations. It is included in the
current deployed application; production SLO targets,
physical-device/authenticated load and independent crypto acceptance remain open.

Release `f7e77d0559e5528884da3b2615685e0b5348f117` is live on the WINGA backend;
frontend build at the soak checkpoint was `20261008153000`. The protected verifier
reported ready with all seven conversation features enabled, dispatch/push
enabled, no missing flags, no dependency errors and no alerts. Its sample count
was insufficient and authenticated/device/load/crypto acceptance remained false.
These are operator-reported protected checks, not agent access to that endpoint.

The subsequent [fresh live soak and actual local load](conversations-production-soak-f7e77d0-20261008.md)
passed 117 public read-only production requests over 330,325 ms with no failures
and stable backend/frontend identities. Genuine disposable PostgreSQL verification
passed 80/80, no skips, including two-store/six-connection encrypted direct and
Room load, history publication and authorization races. The test cluster stopped.
Authenticated production load, sustained capacity/SLO acceptance, physical-device
media/recovery/replacement checks and independent cryptographic audit remain open.
The dated release/audit sections below retain their earlier checkpoint scopes;
their default-off/prepared/deployment-open descriptions are not current flags.

The subsequent [device Pending display fix](conversations-device-pending-fix-20261008.md)
is live in frontend build `20261008160000`: device metadata refreshes while the
dialog is open, completed approval retains its selected native, and older reads
cannot overwrite a manual action. Eight browser and nineteen device/helper
checks passed. This does not certify actual approval of the designated production
natives or close the authenticated production-load gate.

## Audit Gate: 2026-10-08

The [fresh audit and public soak](conversations-audit-soak-20261008.md) reproduced
singleton confirmation, same-native readmission and global-lock coupling defects
in the earlier deployed release. The reviewed fix candidate in
[audit fixes and separate-agent re-review](conversations-audit-fixes-20261008.md)
address all three plus a reviewer-found cross-pair package/account deadlock.
Final review found no residual actionable issue in that scope. Final local
verification passed 73 real PostgreSQL, 145 encryption, 27 native/lock and three
authenticated browser checks. The operator has now authorized commit and push;
exact publication identity comes from Git, not this prepared record. Live
deployment of the fixes is not established by local verification.
Public production soak passed 99 read-only requests on the earlier release,
not authenticated messaging or capacity acceptance. External cryptographic
approval, production/physical-device acceptance and deployment remain open.

## Release Being Published

Latest device/history work is documented in
[conversations-device-history-acceptance-20261006.md](conversations-device-history-acceptance-20261006.md).
It adds native Remove/expanded replacement, paged nontruncating user-key recovery
and explicit same-owner historical attachment grants. The subsequent candidate
adds automatic own-native prior-epoch history reconciliation and historical Read
without false Delivered. Production acceptance, Shopping Rooms and independent
crypto review are not complete. The multi-device gate remains default-off.
The release and evidence paragraphs below are earlier dated checkpoints.

The subsequent [Shopping Room native candidate](shopping-room-native-candidate-20261006.md)
adds real multi-account MLS membership, all-native signed activation, role-bound
epochs and encrypted product/shortlist/poll projection. Its 35-test local suite
and actual native browser profiles use a synthetic canonical room authority.
The subsequent [real backend/UI integration](shopping-rooms-backend-ui-20261007.md)
adds typed canonical room streams, authenticated membership/receipts/media/push
and integrated creation/chat/products/shortlist/poll UI. Rooms remain default-off
pending controlled live rollout. The subsequent
[real PostgreSQL acceptance](shopping-rooms-postgres-acceptance-20261008.md)
adds bounded six-connection/two-store Room races and encrypted board load.
Synthetic native tests and local PostgreSQL tests do not prove production SLOs.

The [Room lifecycle follow-up](conversations-room-lifecycle-20261008.md) adds
operator-approved admin handoff, voluntary account-wide leave, immediate access
and push revocation, retained-device MLS rotation and read-only local history.
It closes the previously undecided role/leave implementation policy, not
production rollout or independent security acceptance. Final local Room evidence
is 49/49 native/projection checks and 28/28 genuine PostgreSQL service checks.

The operator requested commit/push/deploy of all pending conversation changes:
indefinite Mute, durable owner Archive, selected-text reporting, moderator
evidence viewing, four-language copy, source bundle and regression tests.
Prepared frontend build: 20261006140019; 87 synchronized source modules.
Local verification: 155 store/encryption/push/report tests, 77 chat browser
tests, 145 frontend core checks and 80 behavior tests. Four catalogs contain
1,497 matching keys and no hard-coded UI debt. The exact prepared assets and
Wrangler deployment dry-run passed.

Publication success and the exact commit/deployment IDs must be established
from release tool results, not inferred from this prepared record.
Three additive migrations run under the existing startup migration lock:

- 2026100601_conversation_notification_preferences
- 2026100602_conversation_archive_preferences
- 2026100603_conversation_report_evidence

The frontend is deployed to the existing mkubwa Worker, preserving dashboard
variables. WINGA backend is the existing Render Node service; Phoenix is a
separate transport service. No new secrets, encryption flags, CSP permissions,
instance increases or disk removal are requested by this release.
The operator has configured Render Auto-Deploy On Commit. There is no Render
API credential available in this workspace, and dashboard automation failed.
Public healthy responses alone do not prove the exact backend commit or new
migration/application-flow acceptance.

## Latest 158-189 Work

See [conversations-spec-158-189.md](conversations-spec-158-189.md) for the new local
search, explicit report subjects, opaque notification grouping, aggregate
transport metrics, foreground preference reconciliation, session-consistent
filtered history and exact open Shopping Room gates. The release record above
describes the preceding release, not deployment of these new changes.

## Foundation: 0-109

The integrated system has durable canonical acceptance, exact-ID retry,
ordering, bounded history/replay, device receipts, background push and Phoenix
transport. The operator reported working live delivery, Sent/Delivered/Read
and encrypted text between two different real accounts/devices. The earlier
operator-run REST/SSE cross-node exercise is separate from Phoenix evidence.

Native-bound device identity, MLS ciphertext transport, encrypted browser
vault/outbox, private encrypted attachments, approval/revocation, contact-verified
replacement and user-key/checkpoint recovery are implemented and tested locally.
Private R2 configuration and a synthetic storage roundtrip passed; media and
recovery activation were operator-reported. These facts do not certify every
production device/media/recovery flow or an independently audited protocol.

Section 109 Phase 6 remains open: independent cryptographic/security review,
physical-device attachment/recovery/replacement acceptance, approved retention
and erasure policy, complete fleet pressure/observability and measured
SLO/capacity/soak/dependency-failure evidence. Keep Phoenix at one instance;
the operator declined the additional paid production node-loss exercise.
Do not erase this distinction by calling the entire foundation complete.

## Product: 110-238

| Sections | Implemented scope | Still open / deliberately future |
| --- | --- | --- |
| 110-120 | Direct-first person-to-person inbox, canonical pair identity, summaries, ordering, cursor paging, unread and focused visible-message Read; refresh failures are isolated from a healthy inbox. | Full applicable direct-device/performance acceptance; no invented presence or verification signal. |
| 121-122 | All new direct messages bypass recipient approval under the operator override. Existing server auth, quotas, blocks and bounded exact retries remain. | Broader measured abuse/operational acceptance; do not introduce Message Requests. |
| 123-129 | Encrypted typed text, safe links, replies, reactions, sender-only text edits for 15 minutes and Delete for me. | Delete for everyone is not authorized. Production acceptance is distinct from local regressions. |
| 130-132 | Explicit private voice recording/playback, encrypted persistent draft, reload, cancellation and exact retry; native seek controls. | Whole-object retry is not resumable streaming; waveform/playback-speed enhancements are optional. |
| 133 | No external/private transcription processing. | Optional future transcription. |
| 134-144 | Private images/videos, approved public video references, canonical product/order/payment/delivery references and marketplace actions; context remains in the same direct pair. | Real-device private-media acceptance. Current private-media size is bounded to 2 MiB. Payment cards use existing canonical intents, not a new wallet/provider payment-request service. Historical product snapshots, new courier service and collaborative orders are not fabricated. |
| 145-149 | No silent extraction or external translation of private messages. Four-language UI localization exists. | Optional future smart context, provenance/correction and message translation; UI localization is not message translation. |
| 150 | Responsive universal text/plus/camera/send composer, approved rich choices, mobile/desktop/RTL layout. | Applicable physical-device/accessibility acceptance. |
| 151-154 | Human identity fallback, honest last-message timestamp, existing header/menu and canonical View Profile action. | No inferred online/verified badge or claim that every account-menu requirement is finished. |
| 155 | Owner-scoped durable Archive, archived view, explicit Move to Inbox; incoming messages retain history/unread and still notify unless muted. | New production migration and authenticated/cross-device UI acceptance. Archive refresh is not instantaneous multi-device fanout. |
| 156 | One indefinite account-level mute/unmute switch; enqueue, dispatch and foreground-alert suppression; unread/history unchanged. | New production migration/complete backend rollout and authenticated acceptance. Already provider-accepted push cannot be recalled. |
| 157 | Existing authoritative direct blocking and retained history protections. | Room-specific block/membership policy belongs to the group service. |
| 158-159 | Explicit selected-text and separately selected binary-file report consent; up to three 2 MiB files copied with independent encryption into the private report namespace; canonical membership checks, idempotency and current-role/reason-gated audited moderator evidence reads. No master key or automatic extraction of chat attachments. | Production moderation acceptance and post-case-close retention/deletion policy remain. Evidence is retained while the case is open. Reporter disclosure is explicitly unverified; no automatic punishment. |
| 160-164 | Private push copy, exact retries, explicit receipts, native Add/Remove/expanded replacement, sealed paged cache, user-key recovery and automatic own-approved-native prior-epoch history reconciliation. Historical Read is separate from original live grants; historical media needs explicit same-original-owner/current-native grants. | Multi-device composition remains default-off pending its applicable acceptance/audit. Production/physical-device acceptance and native-specific alert reconciliation remain open. Recovery never restores native identity/live ratchets or rewrites original-epoch grants. |
| 165 | Inbox/contact search and local projected message-content search exist: text, product references, sender and UTC dates; at most 5,000 scanned device-history rows and 100 results. Search now reads the current sealed-vault projection beyond the visible page, replacing stale encrypted view rows including hide/edit changes. No remote query, sync or plaintext index. | Incremental full-history indexing remains the spec's preferred future direction; production/device acceptance is separate. |
| 166-167 | No staff access to private keys/history by business role alone. | Future business inbox and separately authorized shared staff access. |
| 168-169 | Content-free bounded diagnostics, process counters and durable privacy-safe hourly fleet operation/outcome/duration metrics exist. Retry-idempotent cumulative publication, publisher heartbeat, bounded retention and separate actual ciphertext-record counts are implemented; the admin Operations dashboard displays aggregate status, attempts, accepted records and queue alerts. | Publication/activation must be verified on the exact release. Human-send versus encrypted-control attribution, adoption metrics and measured response/delivery SLOs are not inferred from attempt counters. |
| 170 | Extensive local direct/encrypted/store/browser regression evidence. | Full direct acceptance gate, physical devices, measured resilience/scale and independent security review. |
| 171-189 | Default-off native multi-account MLS integrated with real typed canonical room backend, durable invitations/membership, ordered ciphertext/receipts/private media/events/generic push and searchable creation/chat/products/shortlist/poll UI. Real SQL and authenticated HTTP browser tests cover three-owner activation, retries and removal. Spec 180/181 adds current canonical product comparison and the encrypted outside-seller question/response bridge. Room-specific account-level mute/archive, archived view and Move to Inbox are implemented. The 2026-10-08 follow-up adds approved own-native prior-epoch history transfer, recovered board roles, historical Read and explicit old-attachment grants. Real PostgreSQL acceptance adds six-connection/two-store admission, preferences, membership-freeze races and encrypted product/poll load. Approved admin transfer and voluntary account-wide leave now include immediate access/push revocation, retained-device MLS rotation and read-only saved history. | Production rollout/physical-device acceptance, sustained fleet load/failure evidence, independent audit and complete rollout acceptance. Orders/wallet/automatic group purchase/AI/public communities remain future scope. |
| 190-192 | Optional services do not receive private plaintext or control commerce. | Optional intelligence/privacy/provenance design and independently tested failure isolation. |
| 193-201 | Four languages/RTL, bounded media, responsive/local-first draft and history behavior, scoped reconciliation and existing rollout flags. | Full accessibility/low-bandwidth acceptance and measured conversation-open/performance SLOs. |
| 202-207 | Existing kill switches, fail-closed no-downgrade guards, legacy separation and versioned startup migrations. | Remaining applicable rollout/retention/security acceptance; encrypted routes disabled must never fall back to plaintext. |
| 208-209 | Authenticated aggregate Conversations health combines schema/guards, Room invariants, full rollout flags, supported runtime, private bucket, active publishers and dispatch/push/media pressure. Existing administrator-only Operations now shows those aggregate gauges without a browser ops token; a safe scheduled monitor is included. | Complete dedicated telemetry still needs Phoenix connection/reconnect/resume, BEAM memory/scheduler, database-pool and protocol/media failure gauges plus true recipient delivery/read, offline retry and multi-device sync-delay measurements. Operational ready is not full product/crypto acceptance. |
| 210-221 | Existing tested message-ID, canonical ordering, auth, ciphertext/device and canonical commerce boundaries. | Fleet/failure/performance evidence and future room invariants are not proven by direct fixtures. |
| 222-226 | Direct, crypto, store/browser suites and native room crypto/projection/concurrent-sender tests with recorded scope. Real PostgreSQL Room service coverage passed 21/21; final six-connection/two-store race/load cases passed 4/4, including three converged encrypted boards. Synthetic accounts/storage stay separate from production. | Production HTTP/fleet failure races, independent security review and realistic measured production load/soak acceptance. |
| 227-238 | Source principles and Definition of Done are preserved. | Formal security/product/foundation acceptance and final handoff remain open. These are acceptance criteria, not 12 additional UI features. |

## Next Work

Production operations follow-up (2026-10-08): see
`conversations-production-activation-20261008.md` for the seven existing encrypted
feature flags, Node 24 target and one loopback production verification command.
The operator deferred physical-device testing and asked for full capability
activation. No Render API credential is available here, so live flag changes
require the WINGA backend dashboard; they are not claimed as performed by code
changes. CSP, existing secrets, original message grants and Phoenix's agreed one
instance remain unchanged. Report references can reopen retained evidence after
case closure; automatic post-close deletion remains unconfigured, not silently
replaced by an invented legal retention policy.

Spec 180/181 follow-up (2026-10-07): canonical current-product comparison and
explicit encrypted Seller question/response relay are implemented. Seller access
is limited to the direct product/question context; Room membership/history is not
granted. See `conversations-spec-180-181-20261007.md` for local test evidence and
production/audit boundaries. The grouped 171-189 row above is historical; product
comparison and correlated Seller response are no longer unimplemented scope.

Spec 188/189 follow-up (2026-10-07): configuration-driven small private Room
admission limits now reach backend authorization, authenticated capabilities,
client review and localized UI. Existing rosters and already-reserved retries
remain usable after stricter configuration; removals can shrink oversized Rooms.
The public-community boundary remains intact. See
`conversations-spec-188-189-20261007.md`. Future orders/AI/non-user invitations
are still future scope, not completed features.

Room history follow-up (2026-10-08): approved own-account native Room devices now
participate in bounded prior-epoch encrypted history reconciliation. Recovered
Room records can project original public roles after current native admission;
historical Read and explicit old-attachment grants preserve original epoch
authorization. See `conversations-room-history-20261008.md` for tested scope and
remaining production/audit boundaries. Old-room-history transfer/recovery is no
longer an unimplemented code path; its physical-device acceptance remains open.

1. Confirm the exact Render commit is Live and the three migrations applied;
   exercise Mute/Archive/selected reporting with authenticated test accounts.
2. Decide retention/deletion and private binary-media report policy before
   extending moderator disclosure beyond selected text/metadata.
3. Consolidate physical-device media/recovery/replacement evidence and measured
   direct reliability/performance; obtain independent crypto review.
4. Continue server-backed Shopping Rooms only through their approved membership,
   ciphertext and canonical-commerce contracts. Do not invent wallet rules,
   mandatory member-voted leaving/removal or calling from prior brainstorming.

Detailed evidence remains in the product roadmap, rich-message 123-150 ledger,
direct 151-170 ledger and encrypted-chat acceptance record. Enabled features
and passing tests are not synonymous with full specification acceptance.
