# Winga Conversations: Specification 0-109 Audit

Audit date: 2026-10-02. Repository baseline: `abfcd49` on `master`.
Verdict: **FOUNDATION NOT ACCEPTED; section 109 Phase 6 remains blocked.**

## Trust Follow-Up (2026-10-03)

F06 is repaired in the isolated workbench: Stored/Read proofs are signed by
the recipient device and bind message ID, room, epoch, ciphertext hash, owner,
device and status. Senders verify against message-era authenticated MLS leaf
keys retained in encrypted history, not the current server directory. The
server retains and replays the original proof; legacy unsigned receipts cannot
advance a known message. Unknown historical IDs remain ignored without creating
history or blocking later legitimate messages. Server omission/availability,
malicious application updates and a compromised recipient remain outside this
signature guarantee; a proof does not establish human comprehension.

F07 now has a fail-closed freshness policy in the workbench. Each accepted backup
exports a user-held checkpoint containing owner, revision and a canonical
ciphertext-capsule hash. A fresh device must import the latest checkpoint from
the user or an independently trusted device, in addition to the recovery key.
The backup server cannot supply its own freshness witness. Lost-response exact
retries and confirmed accepted-pending reconciliation also retain the checkpoint.
An old checkpoint intentionally supplied by the user cannot establish global
latest freshness; no transparent witness service has been implemented.

F09 dependency remediation updates both root and backend sharp to 0.35.5 and
libvips binaries to 1.3.4. Both production dependency audits report zero known
vulnerabilities. Deployment of these new locks has not been performed here.

F01 production integration and F08 operational acceptance remain open. The
installed ts-mls 1.6.4 MIT license was inspected, and both its packaged README
and upstream maintainer explicitly state that no formal security audit has
been performed. This is a browser-compatible experimental candidate, not an
approved production crypto implementation. No CSP, production E2EE flag,
production database migration, private-R2 endpoint or Phoenix scaling change
is made by this follow-up. Earlier findings below remain historical evidence.

References: [ts-mls security disclaimer](https://github.com/LukaJCB/ts-mls#readme),
[sharp security advisories](https://github.com/lovell/sharp/security/advisories).

Verification: 23/23 MLS and trust-contract unit tests; the final combined browser
run passed 29/29. The subsequent narrow changes to unsigned-receipt proof
upgrade and checkpoint re-export passed 3/3 targeted browser regressions,
including the complete encrypted text/media/device/recovery flow. The browser
suite now defines 30 distinct cases. Image/media/R2/native-backup regressions
passed 30/30. Root, backend and experimental production dependency scans report
zero known vulnerabilities; this is not an independent cryptographic audit.
Module synchronization at that workbench-only follow-up reported 71 production modules. No commit, push or
deployment has been performed for this follow-up, and section 109 remains open.

## Candidate Integration Follow-Up (2026-10-03)

The application now has a disabled own-account crypto registry and native
identity-attested MLS package publication, an irreversible reserved-mode/legacy
writer guard, an encrypted transactional browser vault, a headless user-key
history recovery client and a private ciphertext R2 adapter. See [GATES] and
[REC] for exact APIs, pins, configuration, limits and reproducible evidence.
Both MLS package signatures and native account/session/device proofs are
validated. Private packages/group secrets never belong in the server directory.

Local verification adds 48 native/store/API/storage cases, 19 full strict-CSP
browser cases plus one targeted logical-write immutability case, 18 real
independent PostgreSQL cases and 15 Node 20.20.0 candidate/storage cases.
The MLS/trust unit suite remains 23/23. These suites overlap; do not add them
together as accepted specification sections. Root/backend production dependency
audits again report zero known advisories. The generated source bundle now has
74 synchronized modules rather than the earlier workbench-only count.

F01 remains open: no encrypted canonical writer, authenticated mode activation,
peer package/admission/rekey integration, final encrypted transport acceptance,
attachment grants/cleanup/routes, onboarding/recovery UI or Android acceptance
is complete. The private storage tests use fake S3 responses, not a live private
bucket. The registry/vault/recovery browser tests use synthetic account bridges,
not production authenticated HTTP. F08 operational acceptance and section 107's
independent audit are still open. No production flag, CSP, Phoenix scaling,
database, commit, push or deployment was changed. The original matrix below is
the dated audit snapshot, not certification of these candidate components.

## Repair Follow-Up (2026-10-02)

The user authorized fixing the four reproducible workbench defects and pushing
the result. **F02, F03, F04 and F05 are repaired in the follow-up implementation.**
The original findings, matrix and test table below remain the audit snapshot;
their descriptions of these four defects are historical, not the current state.

- F02: failures are isolated by room. Explicit rekey-required non-acceptance is
  retained with exact pending bytes. An authorized removal commit can proceed;
  its exact retry has priority after a lost response. Commit ACK and retirement
  of only definitely rejected old-epoch messages share one vault transaction.
  Accepted-but-unacknowledged messages remain canonical Sent, not Failed.
- F03: restored Pending/Failed history remains recovered local history; only
  accepted Sent/Delivered/Read identities request canonical receipt updates.
  Restoring a never-accepted send neither fabricates a server message nor queues
  an impossible receipt subscription or restores an old ratchet.
- F04: one shared policy bounds package lifetime to 2628000 seconds, checks
  expiry/not-yet-valid intervals, and is applied at publication, initial/room
  admission, each actual incoming/outgoing Add and the joining device's Welcome.
  Admission is rechecked after publication; historical trusted group state is
  not invalidated merely because its original member package expired.
- F05: Read requires explicitly selected, focused viewport-visible message IDs.
  Missing IDs cannot mark an entire room read. The offscreen long-history test
  now asserts no Read until the message is scrolled into view.

Retest: 27 combined browser cases passed, including all five original defect
probes (F04 has two), the five integrated flows and all 14 previous regressions.
Two of those 27 are deliberate demonstrations of F06/F07 trust limitations,
not security acceptance. An additional accepted-send/rekey safeguard is tested
separately and passed. The final MLS/lifetime unit suite passed 19/19, including
the historical-state expiry guard. The first lost-commit-response test failed;
atomic ACK/retirement and retry priority repaired it before the successful retest.
Reproduce with the experiment's `npm test` and `npm run test:audit-repairs`.

**Still open:** F01 production integration, F06 trusted-server receipt semantics,
F07 fresh-device snapshot freshness, F08 operational acceptance and F09 root
dependency remediation. The narrower four-fix request does not close these
independent gates. Production E2EE stays disabled; existing CSP stays unchanged.
Pushing/deploying this repository revision must not publish the localhost-only
workbench or be described as a production E2EE rollout. The production frontend
release build is 20261002194351; it includes no experimental workbench assets.

This review covers all 110 foundation sections, not just the latest crypto demo.
The durable legacy messaging foundation has substantial verified implementation.
Production E2EE, encrypted private media, cryptographic device onboarding and
recovery are not an accepted, integrated production foundation.

## Findings First

### F01 [P1] Production security integration is still missing

Scope: production foundation acceptance, not a newly introduced vulnerability.
The ticket authorization response explicitly selects `legacy-plaintext` in [T].
The browser requires that mode in [PC]. Production outgoing content is persisted
as JSON by [O]; it is not the encrypted workbench vault. Session/device routing
identifiers are not cryptographic device identities. Production database/migration
inspection did not find the complete encrypted message envelope or persistent
conversation security mode needed to enforce an irreversible E2EE upgrade.

The native encryption helpers, gated encrypted backup API and MLS workbench are
valuable components, but do not make the live chat E2EE. The workbench explicitly
refuses production use and stores media ciphertext in local PGlite BYTEA, not the
production private object-storage pipeline. Sections 16, 20-28, 31-32 and 70, and
section 109 Phases 3-5, cannot be marked complete from these local experiments.

Acceptance: approve a protocol/library and threat model, resolve F02-F07, then
integrate the encrypted envelope, authenticated device directory, secure local
state, authorized private ciphertext media and user-held recovery end to end.
Preserve legacy compatibility without silently downgrading an encrypted room.

### F02 [P1] Revocation plus a pending send blocks rekey and unrelated outbox work

Scope: experimental MLS workbench. Reproduced by DEEP-001 in [DP].
The server rejects sends in a room requiring rekey at [AS303]. The global
oldest-first `flushLocked()` propagates that rejection at [AC191]. Membership
changes flush this same outbox before sending their removal commit at [AC251].
An offline pending send therefore prevents the operation required to unblock it;
outgoing work in an unrelated room also remains behind the failed job.

The probe observed the unrelated inbound message being stored before the final
flush failed: this is NOT evidence that every inbound message is lost.
Acceptance: isolate scheduling/failure state by room, allow authorized rekey
control operations, retain exact pending ciphertext and unknown outcomes, and
prove restart/retry recovery without discarding content or rolling back ratchets.
Sections 9-11, 20-24, 27 and 78 are affected.

### F03 [P1] Recovery invents receipt subscriptions for never-accepted messages

Scope: experimental recovery. Reproduced by DEEP-002 in [DP].
Restore includes pending/failed history and queues sender history subscriptions
at [AC449]. The server requires an existing canonical message at [AS362].
For an offline message that was never accepted, canonical message count is zero,
the subscription returns `history_receipt_forbidden`, and the retained global
outbox job repeatedly prevents later flush/create operations.

Acceptance: recover unsent history as explicitly local/unsent state, request
receipts only for proven accepted canonical identities, and isolate permanent
job rejection without losing recovered user content. Test mixed pending,
failed, accepted and ambiguously accepted history across a complete restart.
Sections 10, 31-32, 78 and section 109 Phase 5 are affected.

### F04 [P2] KeyPackage lifetime policy is not enforced at all admission boundaries

Scope: experimental device/key lifecycle. Reproduced by DEEP-003 and DEEP-008.
The server checks package decoding, credential identity and signature at [AS75],
but not the admission lifetime policy. The installed ts-mls 1.6.4 defaults disable
`validateLifetimeOnReceive`; [DI] inherits that configuration. Incoming Add and
Welcome processing therefore need additional explicit policy review.

The honest sender's ordinary add path DID reject an expired package. The probe
used a controlled malicious sender clock with valid signed requests to construct
a commit which the server admitted and the recipient joined after expiry.
A second probe admitted a signed lifetime of 9223372036854775807 seconds despite
the configured 2628000-second maximum. Do not generalize this to all honest adds.

Acceptance: enforce expiry and maximum lifetime at appropriate publish,
admission, Add/Commit and Welcome boundaries; test malicious peers, clock skew
and restart. Do not invalidate historical membership merely because its original
admission package later expires. Use [RFC] when specifying exact MLS rules.
Sections 21, 24-27, 69 and 107 are affected.

### F05 [P2] Workbench Read receipts include offscreen messages

Scope: experimental UI only. Reproduced by DEEP-006.
[UI64] calls room-wide `markRead()` on a focused visible room; [AC405] marks all
eligible incoming history rather than only rendered viewport-visible IDs.
On a 390x844 viewport, the first long message was above the scroll container,
yet a Read receipt was created.

Production viewport-scoped receipt tests passed in the focused regression suite;
this finding does not establish a live production regression.
Acceptance: pass visible message IDs from the focused rendered surface, and test
scrolling, background tabs, long history and recovery history. Sections 5, 55,
93 and 109 are affected.

### F06 [P2] Receipt authenticity depends on a trusted delivery server

Scope: documented trust limitation, not an ordinary peer-forgery exploit.
DEEP-004 inserted a receipt event through a controlled server/database; sender
status advanced to Read although genuine receipt count and receiver history were
zero. [AC379] validates receipt identity/context, but does not require a
cryptographic recipient assertion. This does NOT demonstrate plaintext
decryption or an unprivileged user injecting server events.

Acceptance: explicitly decide whether receipts are trusted infrastructure
assertions or cryptographically authenticated recipient claims. Keep UI/security
claims consistent with that decision and the compromised-server threat model.
Sections 4-5, 69, 106-108 require this distinction.

### F07 [P2] Fresh-device recovery cannot detect a valid older capsule

Scope: already documented threat-model limitation in [REC], confirmed by
DEEP-007. A controlled server returned authentic revision 1 instead of current
revision 2; a fresh device restored the older valid history without detecting
rollback. AEAD authentication and honest-server CAS/tombstones do not prove
freshness against a malicious server serving a complete old valid snapshot.

Acceptance: select a trusted freshness/recovery policy or explicitly accept and
communicate this limitation. Do not describe this as capsule tamper bypass,
server access to recovery keys, or broken honest concurrent-write CAS.
Sections 32, 69, 106-108 are affected.

### F08 [P2] Operational acceptance lacks measurable production evidence

Scope: section 109 Phase 2 operational completion and Phases 6 acceptance.
Phoenix has bounded channels, supervised processes, canonical durable send and
local failover evidence. Its public `/health` is process liveness, not a durable
writer/database dependency check. [FC] still leaves SLO targets unset.
Fleet-wide admission budgets, end-to-end tracing, the full BEAM metric set,
realistic load/soak, capacity and physical-mobile lifecycle acceptance are open.

The user previously declined another paid deployed two-node Phoenix exercise.
That choice is respected: local node-loss evidence is recorded, not relabeled as
deployed failover proof. Sections 11-13, 68, 74-78 and 84-95 remain scoped/partial.

### F09 [P2] Root production dependency audit reports a High sharp advisory

The root dependency audit reports one High finding for sharp 0.35.3, affected by
[SHARP]; the patched version is 0.35.4. Backend and MLS experiment dependency
audits each reported zero known findings in their own lockfiles. This review did
not prove that a deployed path exposes the vulnerable root AVIF decoder.

Acceptance: update the root lockfile to a patched compatible version, verify
image processing and rerun root/backend audits. Do not suppress the advisory or
claim that zero known advisories constitute a crypto security audit.

## Scope And Evidence Rules

- Canonical input: [SPEC], sections 0-109 inclusive, exactly 110 unique headings.
  Section 110 is only a heading; its missing product requirements were not invented.
- Exact source SHA-256:
  `09932d72eecb0b45ded50a04f5cfc4c527f07a19c4821ecd5dc5c180022f6939`.
- This is an internal implementation/security review, not an independent protocol
  audit, formal verification, exhaustive fuzzing or a compliance certification.
- Local experimental changes and probes were already uncommitted in this checkout.
  Their results describe that working tree, not necessarily the deployed commit.
  Existing edits were preserved. No runtime fix was made as part of this review.
- No production credentials, authenticated production data, paid scaling,
  production messages, migration, disk removal or deployment were used.
- Existing CSP was preserved, including its ban on JavaScript eval and the lack
  of a new WASM permission. The running localhost demo was kept available.
- Preparation/future sections are evaluated as design obligations. Missing full
  calling, shopping-room or AI products is not automatically a foundation defect.
- Earlier AUD-001 through AUD-004 fixes passed regressions. DEEP-001 through
  DEEP-008 are separate probes; passing a defect-reproduction test means that
  its described defect remains observable, not that it was fixed.

## Fresh Verification

| Check | Result | What It Establishes / Limit |
| --- | --- | --- |
| Focused Node regression, 20 test files | 188/188 passed | Current transport, ledger, pagination/replay, receipts, push, dispatch, retries, crypto helpers, backups and commerce boundaries. Includes 16 native crypto/backup cases; do not count those twice. |
| Independent PostgreSQL concurrency tests | 13/13 passed | Real localhost PostgreSQL 18, multiple connections, ordering/idempotency, device/session revocation races, migration locks and rollback. Synthetic schemas, not production DB. |
| Initial combined PostgreSQL/Phoenix run | 13 passed, 1 failed | Phoenix fixture readiness timed out. This first failure is retained in the audit record. |
| Unchanged two-node Phoenix test rerun | 1/1 passed | With local `ERL_FLAGS=+S 2:2`: 65 messages, 65 retries, zero canonical duplicates, stalled-ACK single batch, Phoenix node loss and writer restart recovery, 65 replayed/acknowledged. |
| Phoenix unit/channel tests, warnings as errors | 7/7 passed | Portable Elixir 1.20.4 / OTP 28; focused runtime/channel contracts. |
| MLS candidate baseline | 15/15 passed | Local identity pinning, membership, encrypt/decrypt and serialization; not audited protocol interoperability. |
| Integrated encrypted workbench browser flow | 5/5 passed | Text/media, device approval/revoke, recovery, offline/restart, strict CSP, account isolation, epoch conflicts and desktop/mobile-sized rendering. |
| Previous security-fix browser regressions | 14/14 passed | Existing isolation, history receipt, monotonic status, backup conflict and duplicate-key guards. |
| Deep adversarial probes | 8/8 expected observations | Five defect probes grouped into F02-F05, two trust-limit probes F06-F07, and one passing cross-room media/copied-device-ID safeguard. Not eight acceptance passes. |
| Native browser crypto under unchanged CSP | 4/4 passed | 390px/1440px, complete browser restart with user-held recovery key, eval blocked, fail-closed unsupported crypto. |
| Audit bundle build | Passed | Local experimental bundle builds; not a production rollout. |
| Module/source-of-truth checks | Passed | 71 frontend modules synchronized; authoritative root and remote confirmed, dirty worktree acknowledged. |
| Root npm dependency audit, omit dev | Exit 1; 1 High | F09. |
| Backend / MLS experiment dependency audits | Exit 0; 0 known advisories each | Limited to those resolved lockfiles and advisory database. |
| Read-only public production health | HTTP 200 from both services | Winga backend reported ready; Phoenix reported process alive. Does not prove private queue, crypto flow, dependency readiness or exact deployed commit. |

The local failover smoke sample reported send p50 784ms, p95 1410ms and elapsed
7210ms at 8-way concurrency/16 senders. It explicitly reported
`productionCapacityProven:false`; these numbers are not production SLOs.

Not freshly rerun: the entire unrelated Feed/video CI suite, additional
device-onboarding/pending-reload/recipient-join probe configurations, long soak,
large-room/churn/slow-consumer capacity runs, physical Android/iOS crypto and
battery tests, deployed Phoenix node loss, primary-database failover, production
authenticated encrypted recovery, full secret-history review, external protocol
audit or legal retention/residency approval. Historical operator screenshots and
completion notes are supporting context, not substitutes for these fresh tests.

The earlier video health 503 with Hive authentication dead letters remains a
separate operational concern; public backend health 200 and the Node-24 Actions
upgrade do not demonstrate that the video safety gate was repaired.

## Section Matrix

Status legend:
- **V**: implementation verified for the explicitly named current scope, not a
  blanket production/security acceptance.
- **D**: documented preparation; future full product implementation not claimed.
- **P**: partial implementation or design; the remaining contract is stated.
- **B**: blocked production foundation/security acceptance.
- **U**: necessary acceptance evidence is unverified.

Evidence keys below point to repository files and the finding/test descriptions
above. Each row maps to one canonical section; status is not a completion score.

| Section | Canonical Title | Status | Evidence And Remaining Acceptance |
| --- | --- | --- | --- |
| 0 | MISSION | D | [FC], [HANDOFF]: mission and constraints recorded; no million-user or production capacity claim. |
| 1 | HARD SYSTEM BOUNDARY | V | [T], [PH], focused tests: auth/commerce stay canonical in Node; Phoenix is a transport, not a second commerce authority. |
| 2 | BEAM RESPONSIBILITY | P | [PH], 7 channel tests: authenticated send/resume works; Presence, typing, fleet budgets and BEAM observability are incomplete. |
| 3 | DURABLE DATA PLANE | P | [PG]: durable legacy PostgreSQL ledger/outbox verified; production ciphertext envelope/private media plane absent (F01). |
| 4 | CRITICAL RELIABILITY RULE | V | [PG], [FAILOVER]: current legacy ACK follows canonical commit; connection loss is not device delivery. F06 limits receipt trust. |
| 5 | MESSAGE STATE MACHINE | P | 188 regressions: monotonic legacy Sent/Delivered/Read and viewport reads verified; encrypted workbench offscreen Read remains F05. |
| 6 | MESSAGE IDENTITY | P | Stable client IDs, canonical IDs and server sequences verified; complete persisted encrypted sender-device/protocol identity absent. |
| 7 | IDEMPOTENCY | V | [PG]: canonical dedup, conflicting retry rejection and deleted-message retry handling verified for current legacy send. |
| 8 | ORDERING | V | [PG], pagination/replay tests: contiguous server sequences and deterministic ordering; timestamps are not the ordering authority. |
| 9 | RECONNECT / RESUME | V | [FAILOVER]: device queue, contiguous ACK and replay recover locally after node/writer loss; deployed Phoenix failover not freshly proven. |
| 10 | OFFLINE-FIRST SENDING | P | Stable retained retries verified, but production queue is plaintext [O]; experimental global-outbox/recovery failures F02/F03 remain. |
| 11 | BACKPRESSURE | P | [PH]: bounded frames, commands, queues and HTTP responses; global/fleet admission and slow-consumer capacity unverified (F02/F08). |
| 12 | HORIZONTAL SCALABILITY | P | [FAILOVER]: local two-node correctness verified; one deployed Phoenix instance is not production horizontal capacity evidence. |
| 13 | CONNECTION ROUTING | P | [PH], [PG]: authorized device/session routing and durable queue work; distributed presence ownership/routing acceptance remains open. |
| 14 | PRESENCE | P | [FC]: TTL/ephemeral presence contract exists; dedicated runtime Presence and its failure/privacy acceptance are not implemented. |
| 15 | TYPING INDICATORS | D | [FC]: ephemeral, rate-limited typing is prepared; no durable typing guarantee or full feature implementation claimed. |
| 16 | E2EE PRINCIPLE | B | [T], [PC]: production explicitly uses legacy-plaintext; workbench encryption is not a live E2EE foundation (F01). |
| 17 | DO NOT INVENT CRYPTOGRAPHY | P | [CRYPTO], [WORK]: established MLS/native primitives used, not a homemade ratchet; exact library/integration review remains required. |
| 18 | CRYPTO CORE BOUNDARY | P | [CRYPTO], [REC]: crypto adapter and native helper boundaries exist experimentally; approved production crypto core is absent. |
| 19 | PROTOCOL EVALUATION | P | [CRYPTO], [MLS]: candidates evaluated; exact-version audit, interoperability/license decisions and final selection remain open. |
| 20 | DEVICE IDENTITY | B | [T], [DI]: production session/device IDs are not crypto identities; pinned experimental identities are not integrated onboarding. |
| 21 | DEVICE REGISTRATION | B | [WORK], [DI]: local signed enrollment/pending approval exists; production registration and full lifetime policy remain open (F04). |
| 22 | NEW DEVICE EXPERIENCE | P | [WORK]: local new-device approval works; production trusted enrollment, security alerts and clean-device acceptance are missing. |
| 23 | KEY VERIFICATION | P | [DI], baseline tests: independent fingerprint pinning verified locally; production verification UX/QR and broader trust policy open. |
| 24 | KEY ROTATION | B | [WORK], [DP]: local MLS membership change exists, but pending-send revocation deadlocks rekey (F02); no production key lifecycle. |
| 25 | FORWARD SECRECY | P | MLS ratchet/encrypted-state experiments exist; independently reviewed integration, erasure and complete compromise tests absent. |
| 26 | POST-COMPROMISE RECOVERY | P | [FC], [CRYPTO]: post-compromise recovery requirements recorded; full rotation/compromise recovery acceptance not established. |
| 27 | GROUP / SHOPPING ROOM SECURITY | B | [WORK]: experimental MLS epochs/revoke tests exist; F02/F04 and production group admission/security prevent acceptance. |
| 28 | ENCRYPTED ATTACHMENTS | B | [REC], [WORK]: local encrypted media works up to 8MiB; production private ciphertext storage/grants/cleanup not integrated. |
| 29 | MEDIA PIPELINE CONSEQUENCE | D | [FC], [REC]: public commerce media and private encrypted attachments are explicitly separate; no private server transcode promised. |
| 30 | MEDIA THUMBNAILS | P | [REC], integrated browser flow: local encrypted image rendering works; production client-created encrypted thumbnail pipeline open. |
| 31 | SECURE LOCAL STORAGE | P | [REC], restart/CSP tests: encrypted experimental vault verified; production plaintext retry persistence [O] remains (F01). |
| 32 | BACKUP / RECOVERY | B | [REC]: user-held recovery key and gated capsule API exist; production flow, unsent history and freshness policy open (F03/F07). |
| 33 | RECOVERY MUST NOT CREATE A MASTER KEY | D | [REC]: no server master recovery key selected; endpoint-held user key contract documented, integration custody still needs review. |
| 34 | SERVER METADATA | P | [FC]: metadata/log minimization designed; legacy plaintext content, retention rules and production metadata audit remain incomplete. |
| 35 | PUSH NOTIFICATIONS | V | Push regression tests and prior operator PWA evidence: generic provider notifications are separate from message delivery/read proof. |
| 36 | REPORTING UNDER E2EE | D | [FC]: reporting requires explicit user-selected evidence/consent; no blanket server decryption or automatic E2EE content scanning. |
| 37 | BLOCKING | P | [PG]: current direct-chat block/revocation races verified; future group/presence and encrypted-media block policies need integration. |
| 38 | ABUSE / SPAM | P | Send bursts, authorization and isolation checked; global spam/abuse budgets and complete production device/media protections open. |
| 39 | COMMERCE CARDS UNDER E2EE | D | [FC]: encrypted commerce-card references prepared; canonical product/order fields remain outside chat, future E2EE cards not claimed. |
| 40 | ORDERS / PAYMENTS REMAIN CANONICAL OUTSIDE CHAT | V | Commerce/offer regression tests: orders/payments stay canonical outside messaging; chat is not the settlement authority. |
| 41 | SHOPPING ROOM PREPARATION | D | [FC]: room membership/roles and typed commerce context prepared; full shopping-room product is not required in Phase 2. |
| 42 | ASK SELLER PRIVACY PREPARATION | D | [FC]: seller inquiry/request privacy separated from room membership; no implicit membership or seller access promise. |
| 43 | VOICE PREPARATION | D | [FC], [REC]: voice attachment type/key boundary prepared; no required transcription or full voice product claimed. |
| 44 | VIDEO PREPARATION | D | [FC], [REC]: private video remains client-encrypted content; large-video streaming/resume is not proven by an 8MiB helper. |
| 45 | TRANSLATION PREPARATION | D | [FC]: on-device or explicitly consented translation prepared; server plaintext translation is not assumed. |
| 46 | SMART CONVERSATION MEMORY PREPARATION | D | [FC]: private memory/intelligence requires explicit consent and scope; no automatic E2EE message mining feature claimed. |
| 47 | AI SUMMARY PREPARATION | D | [FC]: optional client/consented summary boundary; core messaging must function without AI, no summary product required now. |
| 48 | SEARCH PREPARATION | D | [FC]: endpoint-owned encrypted/local search prepared; production encrypted index/search is not claimed. |
| 49 | EDIT MESSAGE PREPARATION | D | [FC]: stable identity/revision and edit-event semantics documented; future encrypted edits require full protocol integration. |
| 50 | DELETE MESSAGE PREPARATION | D | [FC]: tombstone/delete semantics and limits documented; remote copies/backups cannot be promised universal immediate erasure. |
| 51 | REACTIONS PREPARATION | D | [FC]: typed encrypted reactions and reference semantics prepared; full reaction product not required for foundation. |
| 52 | REPLIES PREPARATION | D | [FC]: replies reference stable IDs with private quote context; plaintext quote leakage is not part of the approved design. |
| 53 | POLLS PREPARATION | D | [FC]: encrypted poll event/reduction preparation; server-side confidential tally and full product implementation not claimed. |
| 54 | PRESENCE PRIVACY | D | [FC]: presence audience/privacy controls prepared; no unrestricted global online-status runtime is accepted. |
| 55 | READ RECEIPT PRIVACY | P | [FC]: privacy preferences prepared; production preference policy open, and experimental read implementation violates visibility (F05). |
| 56 | TYPING PRIVACY | D | [FC]: typing privacy/ephemeral audience policy prepared; future typing feature remains separate from durable delivery. |
| 57 | MULTI-REGION PREPARATION | D | [FC]: single-writer regional authority/fencing prepared; active-active writing is not claimed. |
| 58 | REGION ROUTING | D | [FC]: RegionRouter/home-region/authority-epoch contracts prepared; regional routing behavior not deployed or verified. |
| 59 | DATA RESIDENCY PREPARATION | D | [FC]: residency includes content, metadata, replicas, backups/logs; placement/legal acceptance is not established by a design. |
| 60 | MESSAGE STORAGE ABSTRACTION | P | [PG], [FC]: current PostgreSQL durable adapter verified; full encrypted MessageStore abstraction/contract freeze remains incomplete. |
| 61 | ATTACHMENT STORAGE ABSTRACTION | P | [FC], [WORK]: EncryptedMediaStore contract and local ciphertext storage exist; production private object grants/resume absent. |
| 62 | EVENT ARCHITECTURE | P | Versioned durable message/revision/receipt queue exists; complete future device/group/media event families remain preparation. |
| 63 | EVENT VERSIONING | V | Current versioned ledger/transport envelopes and compatibility tests pass; future encrypted versions still need a minimum-version policy. |
| 64 | NOTIFICATION BOUNDARY | V | Dispatch/push regression tests: durable notification jobs are independent of successful chat delivery; push does not imply Read. |
| 65 | COMMERCE INTEGRATION BOUNDARY | V | Canonical commerce remains behind existing authenticated APIs; future encrypted chat integrations must carry references, not authority. |
| 66 | AUTHENTICATION | V | [T], [PG]: canonical sessions, bound short-lived audience tickets, revocation and service/browser trust separation verified locally. |
| 67 | AUTHORIZATION | P | Direct send/poll/ACK permissions and races pass; complete production encrypted room/device/media authorization not integrated. |
| 68 | RATE LIMITING | P | [PH], [PG]: per-channel budgets and durable send limits exist; fleet-wide enrollment/media/reconnect admission not demonstrated. |
| 69 | REPLAY PROTECTION | P | Stable dedup and signed-request/MLS replay safeguards exist locally; lifetime, receipt trust and backup freshness need F04/F06/F07. |
| 70 | PROTOCOL DOWNGRADE PROTECTION | B | [T], [PC]: claimed encrypted payloads fail closed, but persistent encrypted-room mode/upgrade/no-downgrade enforcement is absent. |
| 71 | CRYPTOGRAPHIC AGILITY | P | [FC], [REC]: codec versioning/crypto boundary prepared; audited library selection and secure protocol migration remain open. |
| 72 | SECRETS MANAGEMENT | P | Distinct environment secrets and fail-fast checks reviewed; actual production rotation/custody/secret-history review not performed. |
| 73 | LOGGING POLICY | P | [PH], [FC]: aggregate/redacted logging and disabled channel payload logging reviewed; full live proxy/tracing leakage audit open. |
| 74 | TRACING | P | Request/operation identities and scoped diagnostics exist; complete cross-service content-safe distributed tracing is not implemented. |
| 75 | CORE OBSERVABILITY | P | Durable queue/database health exists; full BEAM/transport metrics and dependency readiness are incomplete (F08). |
| 76 | USER-EXPERIENCE SLOS | U | [FC]: user-experience SLO targets remain unset; small local sample latency is not an accepted production SLO. |
| 77 | RELIABILITY SLOS | U | [PG], [FAILOVER]: selected durability/failure checks pass; quantified availability, RPO/RTO and recovery budgets not accepted. |
| 78 | FAILURE DOMAINS | P | Node loss, writer restart, rollback, revocation and browser loss tested locally; provider/primary DB/network fault coverage incomplete. |
| 79 | SUPERVISION | V | [PH]: bounded connection processes and one-for-one supervision implemented; no giant monolithic conversation owner design. |
| 80 | PROCESS MODEL | V | Current per-active-channel runtime verified; historical conversations are durable data, not all permanent resident BEAM processes. |
| 81 | SHOPPING ROOM FAN-OUT PREPARATION | D | [FC]: shopping-room fan-out, batching and slow-consumer constraints prepared; no large-room capacity claim. |
| 82 | FAN-OUT STRATEGY | D | [FC]: small/direct bounded fan-out exists; future hybrid large-room delivery strategy remains design, not measured scale. |
| 83 | ROOM SIZE POLICY | P | [FC], [WORK]: size policy prepared and experiment capped; production configurable room-size/admission acceptance remains open. |
| 84 | LOAD TESTING | P | [FAILOVER]: 16 senders/8 concurrent/65 messages is a bounded correctness smoke, not realistic room/churn/capacity load acceptance. |
| 85 | SOAK TESTING | U | No long-duration memory/queue/storage soak performed in this audit; bounded browser restart tests are not a soak. |
| 86 | CHAOS / FAILURE TESTING | P | Local node loss, writer restart and DB locking/rollback pass; deployed chaos, primary failover and partitions unverified. |
| 87 | CAPACITY MODEL | U | No measured safe per-node connection/RAM/CPU or DB/storage/bandwidth capacity model; no production capacity number accepted. |
| 88 | AUTOSCALING PREPARATION | D | [FC]: scaling signals and guards prepared; no validated autoscaling thresholds or paid deployed exercise claimed. |
| 89 | DEPLOYMENT | V | [PH]: separate Phoenix deployment/release layout exists; read-only public health returned 200 from backend and transport. |
| 90 | ZERO/LOW-DOWNTIME DEPLOYMENT | P | Local reconnect/replay after restarts verified; production drain/rolling deploy and rollback behavior not independently exercised. |
| 91 | DATABASE MIGRATIONS | P | [PG]: additive migration, locks and concurrency guards tested; production-volume duration/complete rollback acceptance unverified. |
| 92 | CLIENT PROTOCOL COMPATIBILITY | P | Current legacy version compatibility guarded; encrypted minimum versions and security-critical upgrade policy not finalized. |
| 93 | WEB / PWA CONSIDERATIONS | P | Desktop/mobile-sized Edge, strict CSP, restart and PWA push evidence exist; physical mobile E2EE lifecycle acceptance remains open. |
| 94 | MOBILE CONSIDERATIONS | U | No physical Android/iOS encrypted device-add/revoke/recovery under low memory/network switching acceptance in this audit. |
| 95 | BATTERY / NETWORK EFFICIENCY | U | Bounded polling/timeouts exist; power, wakeups, background network and mobile bandwidth were not measured. |
| 96 | FUTURE CALLING PREPARATION | D | [FC]: future calling/signaling/media plane is separate; full calling implementation not a foundation requirement. |
| 97 | FUTURE STORIES / SOCIAL SHARING | D | [FC]: stories/social sharing carry typed canonical references with private context; no full sharing product claimed. |
| 98 | FUTURE BUSINESS ACCOUNTS | D | [FC]: business account/participant roles prepared; no replacement CRM/business authority introduced in messaging. |
| 99 | FUTURE VERIFIED BUSINESS MESSAGING | D | [FC]: verification relies on canonical identity/claims, not trusted display names; future verification UX not required now. |
| 100 | FUTURE MESSAGE REQUESTS | D | [FC]: message-request states and privacy prepared; existing product inquiries do not prove the future unknown-contact flow. |
| 101 | FUTURE DISAPPEARING MESSAGES | D | [FC], [RET]: disappearing-message limits span recipients/backups/caches; guaranteed universal deletion is not promised. |
| 102 | FUTURE PIN / STAR / BOOKMARK | D | [FC]: per-user pin/star/bookmark derived state prepared; stable canonical message identity remains unchanged. |
| 103 | FUTURE CONVERSATION EXPORT | D | [FC], [REC]: endpoint-owned export and user-key model prepared; no server master-key or completed export product claimed. |
| 104 | DATA RETENTION | P | [RET]: acknowledged queue pruning implemented; events/media/backups/revoked-device metadata retention durations/policy remain open. |
| 105 | ACCOUNT DELETION | P | Revocation and backup ownership/cascade safeguards exist; complete account deletion across media/events/backups/peers unresolved. |
| 106 | SECURITY THREAT MODEL | P | [FC], [CRYPTO], [REC]: assets/adversaries/residual risks documented; F01-F08 show incomplete implementation/acceptance alignment. |
| 107 | SECURITY REVIEW | B | Internal review and adversarial tests are not the required independent review of the final protocol/library/integration. |
| 108 | NO FALSE SECURITY CLAIMS | V | [T], [WORK], [HANDOFF]: production marked legacy-plaintext and experimental guards explicit; no E2EE/audit/capacity certification. |
| 109 | FOUNDATION IMPLEMENTATION PHASES | B | Phase 6 not passed: phases 1-5 retain the contracts, production crypto/media/recovery and operational gates listed below. |

## Phase Acceptance

| Section 109 Phase | Verdict | Remaining Gate |
| --- | --- | --- |
| 0 Current system audit | Covered by this review and [FC]/[HANDOFF] | Actual secret configuration/history and private live infrastructure were not inspected; no certification implied. |
| 1 Contract freeze | Partial | Final approved crypto library/device model, persistent encrypted envelope/no-downgrade, metadata and retention policy. |
| 2 BEAM realtime foundation | Implemented core, partial operational acceptance | Authenticated durable send/resume proved locally; observability, fleet budgets, SLOs/capacity and deployment acceptance still incomplete. |
| 3 E2EE foundation | Blocked production acceptance | Experimental ts-mls integration only; approved audited protocol/library, F02/F04/F06 and production secure state/envelope. |
| 4 Encrypted media foundation | Blocked production acceptance | Private ciphertext object storage, grants, cleanup/retry/resume, client previews and abuse/reporting boundary. Local 8MiB whole-file helper is not large-media streaming. |
| 5 Multi-device + recovery | Blocked production acceptance | Production crypto enrollment/revoke/security notices; F02/F03/F07; browser-loss recovery and explicit freshness policy. |
| 6 Foundation acceptance | NOT PASSED | All preceding critical contracts and acceptance evidence must close before full product expansion under section 110. |

## Ordered Follow-Up

1. Fix F02-F05 in the experimental workbench with regression tests reproducing
   each failure before remediation; preserve stable identities, exact ciphertext
   retry and durable state. Do not silently drop pending content.
2. Decide and document F06/F07 receipt/freshness trust requirements, then finish
   protocol/version, device lifecycle and no-downgrade contract review. The
   upstream [MLS] project explicitly disclaims a formal security audit.
3. Address F09 separately with a compatible patched lockfile and image tests.
4. Obtain independent security review of the exact selected implementation and
   Winga integration before advertising E2EE; current tests are not that review.
5. Integrate approved crypto, private encrypted media, onboarding and user-key
   recovery into the real authenticated client/backend with migration/rollback
   and legacy coexistence tests. Keep public commerce/video paths independent.
6. Set measurable SLO/retention/deletion/privacy policies; implement missing
   observability/admission budgets and run bounded load, soak and mobile tests.
   Respect the user's decision not to spend on another deployed two-node test.
7. Re-audit every affected row and Phase 6. Do not mark foundation complete or
   invent section 110's feature-road requirements from its heading alone.

## Evidence Index

[SPEC]: C:/Users/user/Desktop/Winga-App/active-work/docs/winga-conversations-spec-0-109.txt
[FC]: C:/Users/user/Desktop/Winga-App/active-work/docs/conversations-foundation-contract.md
[HANDOFF]: C:/Users/user/Desktop/Winga-App/active-work/docs/conversations-spec-handoff.md
[GATES]: C:/Users/user/Desktop/Winga-App/active-work/docs/conversations-completion-gates.md
[REC]: C:/Users/user/Desktop/Winga-App/active-work/docs/encrypted-content-and-recovery.md
[CRYPTO]: C:/Users/user/Desktop/Winga-App/active-work/docs/conversation-crypto-feasibility.md
[RET]: C:/Users/user/Desktop/Winga-App/active-work/docs/conversation-queue-retention.md
[T]: C:/Users/user/Desktop/Winga-App/active-work/backend/conversation-transport.js:77
[PC]: C:/Users/user/Desktop/Winga-App/active-work/src/api/phoenix-transport.js:148
[O]: C:/Users/user/Desktop/Winga-App/active-work/src/api/offline-queue.js:53
[PH]: C:/Users/user/Desktop/Winga-App/active-work/services/conversations/README.md
[PG]: C:/Users/user/Desktop/Winga-App/active-work/tests/conversation-event-concurrency.test.js
[FAILOVER]: C:/Users/user/Desktop/Winga-App/active-work/tests/phoenix-transport.test.js
[WORK]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/README.md
[DP]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/deep-review.spec.cjs
[DI]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/device-identity.mjs:55
[AC191]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/client.mjs:191
[AC251]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/client.mjs:251
[AC379]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/client.mjs:379
[AC405]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/client.mjs:405
[AC449]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/client.mjs:449
[AS75]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/server.cjs:75
[AS303]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/server.cjs:303
[AS362]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/server.cjs:362
[UI64]: C:/Users/user/Desktop/Winga-App/active-work/experiments/mls-protocol-spike/audit/ui.js:64
[RFC]: https://www.rfc-editor.org/rfc/rfc9420.html
[MLS]: https://github.com/LukaJCB/ts-mls
[SHARP]: https://github.com/advisories/GHSA-rgj7-g3m4-5g8c
