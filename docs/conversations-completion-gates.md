# Conversations completion gates (spec 0-109)

Status: evidence audit on 2026-10-02. This is a gate ledger, not a declaration
that spec 0-109 is complete. The architecture contract is
`docs/conversations-foundation-contract.md`; this file separates running
behavior, local tests and evidence still needed before changing user-facing
security claims.

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
