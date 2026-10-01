# Conversations completion gates (spec 0-109)

Status: evidence audit on 2026-10-02. This is a gate ledger, not a declaration
that spec 0-109 is complete. The architecture contract is
`docs/conversations-foundation-contract.md`; this file separates running
behavior, local tests and evidence still needed before changing user-facing
security claims.

| Workstream | Current evidence | Gate still open |
| --- | --- | --- |
| Existing REST/SSE chat | Logical send idempotency, replay, ordering, receipts, Web Push and cross-node exercise have tests or operator-reported production evidence. | Keep legacy compatibility through any transport migration; rerun physical-device and failure tests after each cutover. |
| Conversation ledger and device queue | Additive PostgreSQL ledger, per-session device queue, contiguous ACK progress and bounded ACK pruning are implemented. Read-only production verifier was operator-reported healthy with two devices on 2026-10-01. | Authenticated physical-device poll/ACK after restart on the deployed build, ongoing queue-age monitoring, and production-size query plans. `verify:conversation-events` cannot prove the physical-device flow by itself. |
| Cross-node | Operator-reported two-instance scale-down test proved the existing stream survived and replayed once. Local tests now exercise two real Phoenix nodes, PostgreSQL, failure before write, lost reply after commit, node loss and concurrent retry without duplicate writes. Independent-connection PostgreSQL queue and send-revocation tests pass. | Repeat against deployed Phoenix and physical devices; test sustained slow-client load, network partitions and canonical-writer crash/recovery. |
| BEAM/Phoenix transport | Initial opt-in service under `services/conversations` uses short-lived device tickets, a service-authenticated Node adapter, the existing canonical transaction/outbox, explicit queue ACKs and bounded per-channel delivery. Phoenix channel tests and real two-node tests pass locally. Existing REST/SSE remains the serving path; no public client switch or E2EE claim. | Production service provisioning, browser adapter/ticket renewal, physical-device persistence, fleet-wide backpressure, presence, metrics, staged canary and rollback exercise. A socket ACK alone must never mean durable persistence. |
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
2. Deploy the locally verified Phoenix service as a separate, flagged canary
   with synthetic accounts. Implement and test the browser adapter and ticket
   renewal while preserving message IDs and receipt semantics. Follow
   `services/conversations/README.md`; do not switch public traffic before
   physical-device and deployed failure-injection tests.
3. In parallel, select a browser-capable MLS implementation only after its
   license, audit, persistence and Android recovery gates. The `ts-mls` spike
   stops at feasibility; it is not a production dependency.
4. Design encrypted-media, device recovery and account-erasure contracts with
   policy owners, then implement and canary them. Run load and failover gates
   on the final architecture, not only the current legacy path.

## This audit's checks

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
The Phoenix transport remains disabled by default and has not been provisioned
or enabled in production.
