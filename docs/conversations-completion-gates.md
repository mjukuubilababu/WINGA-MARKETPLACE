# Conversations completion gates (spec 0-109)

Status: evidence audit on 2026-10-02. This is a gate ledger, not a declaration
that spec 0-109 is complete. The architecture contract is
`docs/conversations-foundation-contract.md`; this file separates running
behavior, local tests and evidence still needed before changing user-facing
security claims.

Follow-up 2026-10-03: experimental receipts now require recipient-device
signatures verified against message-era pinned keys. Fresh-device history
restore requires an independently retained latest ciphertext checkpoint as well
as the user-held key; server-reported revision alone is never sufficient. Root
and backend dependency audits are clean after sharp 0.35.5 remediation. These
changes close local F06/F07/F09 remediation boundaries, not production E2EE or
section 109 acceptance. The integrated workbench still cannot run in production.
Protocol audit/approval, real account crypto enrollment, encrypted message mode,
private ciphertext media and authenticated production recovery remain open.

Device foundation follow-up 2026-10-03: an additive PostgreSQL crypto-device
registry and own-account API are wired behind `WINGA_CRYPTO_DEVICES_ENABLED`,
which defaults off. Ed25519 proofs bind account, session, operation and target
key. First enrollment activates; later devices stay pending until an active
device signs approval. Revocation keeps tombstones; losing all active devices
cannot silently bootstrap a replacement identity. Exact retries are recorded
transactionally and still require a live session. Focused PGlite and API tests
cover these boundaries, not independent PostgreSQL connection concurrency.
The opt-in browser client now persists a nonextractable Ed25519 identity in IDB,
atomically chooses one identity across tabs, retains signed pending registration
through lost replies/reload, and rejects server key substitution and session
changes. Its request helper uses existing authenticated/CSRF-aware networking.
Real Edge browser tests call the backend store through a synthetic test bridge;
this proves interoperability/persistence, not production authenticated HTTP or
physical Android acceptance. No enrollment UI or automatic activation is wired.
Own-device MLS package publication is now implemented as described below, but
there is no peer key transparency, encrypted-message writer integration or group rekey yet. Do not enable this flag as an
E2EE rollout: existing production messages remain legacy plaintext.

Persistent mode follow-up: `2026100302_conversation_security_mode` adds a
`legacy-plaintext` default to the participant-pair ledger stream. The reserved
`encrypted` mode is irreversible through ordinary row updates/deletes/renames.
The canonical writer returns `conversation_encryption_required` (HTTP 409)
before retry acceptance, insert, notification or push. A BEFORE message trigger
also protects direct/old PostgreSQL writers and snapshot-restore INSERTs/edits;
exact body comparisons do not rely on an MD5 collision-resistant assumption.
Existing historical receipt-only updates remain valid. Stream creation and row
locking close the absent-stream race before a message write is accepted.
Independent PostgreSQL connections prove both upgrade-before-write rejection
and write-before-upgrade serialization. This does not establish crypto-device
enrollment concurrency or cryptographic membership/epoch validation.

At the foundation checkpoint no activation API, ciphertext writer, peer package
exchange or authenticated mode transition existed. The connected text workflow
is now implemented locally as recorded in `e2ee-runtime-integration.md`; group
removal/rekey/rejoin and independent release approval remain open. Do not manually switch production
streams to `encrypted`: legacy sending and snapshot restore for those streams
will intentionally fail closed. The migration needs a bounded writer-maintenance
window for its table locks. It does not re-encrypt historical messages and must
not be advertised as E2EE. No production database was touched.

Candidate integration follow-up 2026-10-03:

- Migration `2026100303_conversation_crypto_key_packages` and the own-account
  `/api/conversations/crypto/key-packages` route require both
  `WINGA_CRYPTO_DEVICES_ENABLED` and `WINGA_MLS_CANDIDATE_ENABLED`; both remain off.
  The pinned candidate is `ts-mls@1.6.4` with exact noble provider pins. It is
  unaudited, not approved for release. Native nonextractable Ed25519 identity
  attests the package hash/account/session/device; the separate MLS signing key
  and basic credential bind that device fingerprint. Both MLS leaf and outer
  package signatures, suite, lifetime and complete wire decoding are checked.
  No private MLS key is uploaded. The connected browser admission path now checks
  both package signatures and native attestation against an independently entered
  fingerprint, never just the directory's asserted signing key.
- `src/chat/encrypted-vault.js` encrypts typed state and outbox records with a
  nonextractable native AES-256-GCM key. A revision CAS, Web Lock and strict IDB
  transaction make all related puts/deletes atomic. Record-count and aggregate
  byte limits are checked before commit. Corruption, key loss and account/session
  changes fail closed. The gated real-chat MLS runtime now uses this vault; no
  production activation or independent security acceptance has occurred.
- `src/chat/recovery-client.js` connects this vault to the existing backup store
  through the authenticated communications helper. The user key and independently
  retained latest ciphertext checkpoint are required for fresh-device restore.
  Pending exact ciphertext survives a lost accepted response and reload; prior
  archive records survive local eviction. Only history records are archived,
  never identity/group/ratchet/outbox secrets. Conflicting history or server
  rollback is rejected. The recovery confirmation/export/restore UI is still open.
- `backend/conversation-private-media.js` adds an opt-in storage adapter, not an
  HTTP endpoint or durable attachment-grant ledger. It requires a separate bucket
  and credentials, checks both managed public access and custom-domain absence,
  rechecks authorization/privacy around I/O, bounds ciphertext/stream lifetime,
  and verifies hashes and immutable retries. It returns no public/presigned URL
  and never uploads filename, MIME, attachment key or plaintext. Real R2 access,
  membership/epoch grants, durable cleanup and browser route integration are open.

Local evidence: 48/48 native/store/API/storage cases; 20/20 Edge browser cases
(19 dedicated full-suite cases plus the final immutability case, all included in CI);
18/18 independent PostgreSQL connection cases including first-device enrollment,
logout and publication/revocation races. The candidate package/private-media subset
also passes 15/15 on Node 20.20.0, in addition to local Node 24.12.0. The bundle
contains 74 synchronized modules. Synthetic bridges are not production HTTP,
Android, actual R2 or independent protocol acceptance. No production flag,
database, CSP, Phoenix instance count, commit, push or deploy changed in this work.

Final release regression: `npm run test:ci` passed end to end, including 192/192
browser cases, 226/226 integration cases, 61/61 realtime cases, 58/58 message-page
cases, 71/71 commerce cases, 144/144 frontend core checks and 68/68 frontend
behavior cases. Localization has four matching 1,321-key catalogs and zero new
hard-coded UI debt. Root and backend production dependency audits again report
zero known advisories. The disposable PostgreSQL cluster was stopped; CI services
completed teardown. This is local regression evidence, not production activation
or independent cryptographic/security approval.

Push inventory for this work must include native crypto device source, database
store, API, migration registration, server wiring and both new test suites;
the security-mode helper/migration/tests and canonical writer, route, pagination
fixture and independent-connection concurrency regression updates;
the MLS auth/validator/package store/migration/API and package regressions;
encrypted vault/recovery client, private media adapter and their browser/storage
tests, and `docs/encrypted-content-and-recovery.md`;
`src/api/communications-client.js`, the build source list and generated
`winga-modules.js`; secure-content test commands/config; dependency manifests
and both lockfiles; the signed-receipt and recovery-checkpoint modules plus their
workbench/client/server/UI/regression changes; and this ledger/audit report.
The six previously untracked onboarding/pending-reload/recipient-join probe and
config files are relevant audit regressions and must be included after passing
their tests. Generated `public/`, browser reports, `.audit-data`, credentials and
local backup snapshots remain excluded. Recheck `git status` and staged diff
immediately before any commit/push; do not use a blanket stage operation.

Latest local verification: secure-content/device/backup/mode Node suite 33/33,
security-mode plus PostgreSQL writer regression run 126/126, independent local
PostgreSQL ledger/writer/mode concurrency run 15/15,
strict-CSP real Edge browser suite 10/10, existing message replay/Phoenix/offline
retry suite 47/47, and retained onboarding/recipient-join/pending-reload audit
probes 6/6. Frontend source/bundle verification covers 72 modules. The generated
Cloudflare build version is `20261002222353`; its `wrangler.toml` version change
and generated bundle belong in the push inventory. Migrations were applied only
in disposable test schemas/databases. No commit, push, production migration,
feature activation or deploy was performed for this follow-up.

## Current production evidence (2026-10-02)

Rollout commit `1df70b9` enables the production browser for all authenticated
accounts, using `wss://winga-phoenix.onrender.com/socket` and exact-host CSP.
Node still requires both `WINGA_PHOENIX_TRANSPORT_ENABLED=true` and
`WINGA_PHOENIX_ALL_USERS=true`. The operator reported the backend live and all
requested checks passing: active Phoenix device stream plus Sent/Delivered/Read.
This is operator-reported authenticated evidence, not an agent-captured trace.

Agent checks confirmed Phoenix health and Node readiness HTTP 200, the matching
frontend build `20261002002028`, allowed WebSocket origins for both public domain
names, rejection of an untrusted origin and rejection of an invalid ticket.
No live Phoenix instance was stopped and no production load was generated.
Deployed Phoenix node-loss recovery and production capacity remain unproven.
Historical pre-activation results below must not override this rollout status.

| Workstream | Current evidence | Gate still open |
| --- | --- | --- |
| Existing REST/SSE chat | Logical send idempotency, replay, ordering, receipts, Web Push and cross-node exercise have tests or operator-reported production evidence. | Keep legacy compatibility through any transport migration; rerun physical-device and failure tests after each cutover. |
| Conversation ledger and device queue | Additive PostgreSQL ledger, per-session device queue, contiguous ACK progress and bounded ACK pruning are implemented. Read-only production verifier was operator-reported healthy with two devices on 2026-10-01. | Authenticated physical-device poll/ACK after restart on the deployed build, ongoing queue-age monitoring, and production-size query plans. `verify:conversation-events` cannot prove the physical-device flow by itself. |
| Cross-node | Operator-reported two-instance scale-down test proved the existing stream survived and replayed once. Local tests now exercise two real Phoenix nodes, PostgreSQL, failure before write, lost reply after commit, node loss and concurrent retry without duplicate writes. Independent-connection PostgreSQL queue and send-revocation tests pass. | Repeat against deployed Phoenix and physical devices; test sustained slow-client load, network partitions and canonical-writer crash/recovery. |
| BEAM/Phoenix transport | Production service and exact-host CSP are deployed. All-user rollout and active device stream/receipt checks are operator-reported successful. Short-lived tickets, canonical transaction/outbox, explicit ACKs and local real-browser persistence/replay tests remain in place. Rich messages and unavailable channels retain REST/SSE compatibility. This is not E2EE. | Agent-captured authenticated trace, deployed node-loss and rollback exercises, fleet-wide backpressure, presence, metrics and sustained load. A socket ACK alone must never mean durable persistence. |
| E2EE protocol and identity | Desktop synthetic `ts-mls` experiments prove API and storage feasibility only. No cryptographic device identity or production E2EE is present. Stock pinned OpenMLS WASM binding lacks exposed persistence/restore; no protocol candidate has passed selection. | License and security review, interoperable browser implementation, authenticated device enrollment, verification and transparency, independent-device revocation and recovery, crash-safe state, and actual Android PWA tests. Keep current chat honestly labelled and never silently downgrade encrypted conversations. |
| Encrypted media and privacy | Existing media migration and private backup evidence concern legacy media availability, not encrypted chat attachments. | Client-side attachment and thumbnail encryption, capability-bound access, key rotation/revocation, orphan cleanup and no plaintext-derived push/intelligence leakage. |
| Retention and erasure | ACK obligations older than the configured window can be pruned only behind a contiguous per-device cursor. Pending obligations, ledger, tombstones and revoked devices remain durable. | Explicit account-erasure/replay policy for those remaining records, legal and product approval, then implementation and load evidence. No silent queue timeout may manufacture delivery. |
| Scale and operations | Focused local suites and one operator-run cross-node exercise exist. | Define SLOs and capacity targets, run PostgreSQL multi-connection load, hot-conversation, node/DB failover, backlog and recovery tests, then observe a staged canary before any million-user claim. |

The acceptance matrix in section 12 of the architecture contract remains the
release checklist for durable ACK, concurrent retries, fan-out, resume, auth,
receipts, offline behavior, crypto, recovery, media, privacy, commerce,
compatibility and scale. Passing one row does not imply the others passed.

## Immediate order

1. Preserve current REST/SSE service and collect a final authenticated
   physical-device queue poll/ACK trace with aggregate-only evidence. Do not
   infer this from `ok:true` in the read-only verifier.
2. Bounded local load and writer-restart evidence are complete as recorded
   below. The operator declined an additional paid two-instance Phoenix
   exercise on 2026-10-02. Keep one deployed instance. Deployed node-loss
   acceptance is deferred, not proven; do not repeat the request or scale up
   implicitly. Preserve stable client IDs, receipt semantics and rollback.
3. In parallel, select a browser-capable MLS implementation only after its
   license, audit, persistence and Android recovery gates. The `ts-mls` spike
   stops at feasibility; it is not a production dependency.
4. Design encrypted-media, device recovery and account-erasure contracts with
   policy owners, then implement and canary them. Run load and failover gates
   on the final architecture, not only the current legacy path.

## Bounded local load and restart evidence (2026-10-02)

The extended `test:phoenix-transport` passed against disposable localhost
PostgreSQL, two real Phoenix nodes and real browser storage. All-user enrollment
was enabled with an empty canary list. The additional phase used 16 synthetic
senders and at most eight simultaneous send commands: 65 messages persisted,
65 retries returned their original canonical IDs after node loss and writer
restart, and all 65 recipient obligations were replayed and acknowledged.
No implicit Delivered/Read receipts or canonical duplicates were observed.
Withholding ACKs kept only one event batch outstanding. The canonical
five-per-minute burst guard rejected the next new message without storing it.

One local run measured p50 616 ms and p95 1,228 ms across the initial 64-message
concurrent phase, with 5,673 ms elapsed including the additional burst checks.
These figures are diagnostic observations on this Windows host, not a target,
Render benchmark or proof of fleet capacity. Sustained load, real TCP slow
readers, network partitions and deployed failover remain separate open gates.

A second run together with the independent-connection PostgreSQL suite passed
14/14 tests, repeating the same 65-message/65-retry recovery and zero-duplicate
assertions. The disposable database and all fixture services were cleaned up.

## This audit's checks

The original supplied contract has now been restored as
`docs/winga-conversations-spec-0-109.txt`, with a source/evidence handoff in
`docs/conversations-spec-handoff.md`. The MLS experiment adds independently
pinned synthetic identity validation at create/add/welcome/restore boundaries;
15/15 Node and 4/4 Edge tests passed. Production cryptographic identity, E2EE,
encrypted media and recovery remain open. See the handoff phase table before
declaring section 109 accepted or extending the product specification at 110.

`npm run test:message-pages` passed 58/58 after the verifier change, realtime
tests passed 46/46, and the focused ledger suite passed 11/11. Browser push
tests passed 5/5 before release, including a stopped-worker wake-up with no
open Winga window. The read-only verifier now rejects
an ACK cursor beyond the stream head and queue/progress rows assigned to a
non-member.

The follow-up transport implementation installed a checksum-verified portable
Elixir 1.20.4 / OTP 28.4 runtime outside the checkout and initialized a disposable
localhost PostgreSQL 18 cluster. The independent-connection suite now passes
13/13, including session/device revocation racing a canonical send. A combined
canonical messaging, ledger, receipt, integration and ticket suite passed 57/57.
Phoenix channel tests pass 7/7; the real two-node scenario passes with lost
replies, node termination, concurrent idempotent retry, per-device ACK isolation,
explicit Stored/Read receipts and session revocation. None of these tests uses
production data or credentials, and they do not prove production capacity.
The final legacy-realtime/API/Phoenix run passed 61/61, including disabled
endpoints, CSRF boundaries, browser credential rejection and oversized adapter
requests. The production-mode Phoenix release built successfully; building a
release is not evidence of a running production service.

Release `b83407447a222e734cf93f716b0c305ea51ca883` was pushed to `master`.
GitHub reported Cloudflare Pages success and three Vercel preview successes.
Render's public health endpoint returned ready, but its exact deployed commit
was not verified: the dashboard browser tool failed to initialize and no Render
API credential was available. Do not label that as a verified Render cutover.
At that historical release the Phoenix transport was disabled and not yet
provisioned. See current production evidence above for the subsequent rollout.

## Browser adapter verification (2026-10-02)

The official Phoenix JS SDK is pinned and self-hosted. The original browser
verification used explicit canary accounts; the later all-user flag preserves
the server enable switch, session checks and ticket validation.
The adapter shares the existing IndexedDB consumer, renews scoped tickets,
retains uncertain logical sends for the offline queue, and never treats socket
delivery as Read. Native storage tests cover aborted writes, wrong-device
batches, account switches, revoked receipts and lost ACKs.

The complete `npm run test:ci` gate passed, including 172/172 browser tests,
225/225 integration tests, 58/58 realtime tests, 58/58 message-page/ledger tests,
module synchronization and the remaining media, commerce and frontend suites.
Phoenix's seven channel tests and the production release build also pass.
The final independent-connection PostgreSQL and real two-node/browser run
passed 14/14, including retryable HTTP 429, lost replies, node loss, durable
reload/replay and fresh-ticket enrollment after SDK page resume.
The Render build script passed Bash syntax validation. None of these results
is a production capacity or deployed failure-injection proof. The separate
Render service, exact-host CSP and rollout were subsequently completed as
described above.

## Native Encrypted Content Foundation (2026-10-02)

The operator chose a user-held recovery key and required CSP to stay unchanged.
The native Web Crypto codec now provides bounded authenticated media encryption
and history-capsule recovery without WASM, eval or third-party browser loaders.
An additive PostgreSQL migration and disabled-by-default recovery endpoint provide
session-rechecked, owner-scoped storage, exact retry handling and revision
tombstones. Claimed encrypted payloads are rejected by legacy HTTP acceptance,
not silently accepted as plaintext. This is not persisted conversation-mode
downgrade protection and does not enable production E2EE.

Focused verification passed 16/16 Node/PGlite tests and 4/4 Edge browser tests,
including complete process restart with the recovery key outside browser storage.
The API regression suite passed 15/15, including CSRF and no-plaintext-fallback
boundaries; frontend checks passed with 68/68 behavior tests and unchanged CSP.
The source bundle synchronization check passed. See
`docs/encrypted-content-and-recovery.md` for limits, threat model, deployment
checks and remaining integration/security gates. The codec and backup API are
not an audited messaging protocol, production media ACL path or recovery UI.

The follow-up message-page/receipt/ledger suite passed 58/58 and the realtime,
cross-node harness and Phoenix adapter suite passed 61/61. These are local
regressions, not deployed encrypted messaging or recovery acceptance.

## Integrated Local Audit Workbench (2026-10-02)

The operator authorized building a complete experimental flow while waiting for
an independent audit, with production CSP unchanged. The isolated workbench in
`experiments/mls-protocol-spike/audit` connects pinned MLS device identities,
encrypted text/media, explicit Stored/Read receipts, device approval/revocation,
encrypted browser state/outbox and user-held-key history recovery through one
interactive browser/HTTP/database flow. It binds localhost only and refuses
production, Render and Vercel startup. No production E2EE or rollout flag is enabled.

Five integrated Edge scenarios cover offline and ambiguous send recovery,
ACK replay, two-tab serialization, browser/server process restart, ciphertext
tampering, account/device isolation, fresh-profile recovery, image rendering
and epoch-conflict quarantine/fresh-Welcome rejoin. Local ciphertext BYTEA is
an audit storage adapter, not production private-R2 media. The README contains
the threat model, limits, reproducible commands and independent-audit handoff.
Production cryptographic identity, private media integration and audited E2EE
acceptance remain open; no formal audit or deployed capacity result is implied.

Final local verification passed 5/5 integrated audit scenarios, 15/15 MLS baseline
tests, 16/16 native crypto/backup tests and 4/4 strict-CSP browser tests. Desktop
and mobile screenshots showed the authenticated encrypted image without overflow.
This is 40 passing local test cases, not 40 accepted specification sections.

## Internal Security Review Findings (2026-10-02)

The adversarial follow-up initially reproduced four integration defects: a peer's
invalid application envelope globally blocks device sync; a new sender device
stalls on pre-enrollment receipts; a lost-response retry downgrades Read to Sent;
and a stale pending backup capsule cannot recover through the public workflow.
The operator-authorized follow-up fixed all four locally: durable per-room
quarantine, per-message device receipt eligibility with explicit history recovery,
monotonic send/receipt status and confirmed local pending-backup conflict recovery.
All 14 security regressions now pass without expected failures or skips, including
desktop/mobile confirmation UI. This is not independent security acceptance. A separate
root dependency scan flags sharp 0.35.3, while the backend lock is already 0.35.4.
See `docs/e2ee-internal-security-review.md` for evidence, scope and retest gates.
Production E2EE remains blocked and disabled pending independent review and
production integration/dependency gates; the four audited local defects are closed.

The 2026-10-03 candidate runtime follow-up connects native-bound MLS text to the
communications/data-service send boundary, adds encrypted atomic outbox/retry and
a persistent local no-downgrade mode guard. See `e2ee-runtime-integration.md` for
the exact implemented scope. Server membership/ciphertext HTTP dispatch and the
real chat receipt/UI boundary are now connected locally. Encrypted media,
recovery UI, multi-device rekey/rejoin and independent-audit activation gates remain.
This is not production E2EE acceptance and no rollout switch is enabled.

Post-fix verification passed 14/14 security regressions, 5/5 integrated scenarios,
15/15 MLS/device-identity baseline cases, 16/16 native crypto/backup contracts and
4/4 strict-CSP browser cases. These 54 local passes are not production E2EE
acceptance or accepted specification-section counts.

## Full-Spec Audit Repair Follow-Up (2026-10-02)

The separate F02-F05 workbench defects from the full 0-109 audit are repaired:
revocation/outbox rekey deadlock, recovered unsent receipt subscriptions,
KeyPackage admission lifetime checks and offscreen Read. Tests preserve prior
AUD-001 through AUD-004 fixes and add exact lost-response/restart rekey and
accepted-send safeguards. See the follow-up record in
`docs/conversations-spec-0-109-audit-2026-10-02.md` and run the experiment's
`npm run test:audit-repairs`.

Receipt server trust, fresh-device recovery freshness, production crypto/media
integration, external review, operational SLO/capacity evidence and the root
dependency advisory are still independent open gates. Deployment of a repository
revision does not enable experimental E2EE or complete section 109 Phase 6.
