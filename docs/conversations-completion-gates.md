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
| Cross-node | Operator-reported two-instance scale-down test proved the existing message stream survived and replayed once. Local independent-connection PostgreSQL queue tests were previously reported passing. | Repeat on the final transport and device-queue implementation; prove slow-client, partition and writer-crash behavior. |
| BEAM/Phoenix transport | No BEAM runtime or Phoenix channel is integrated. Existing REST/SSE remains the serving path. | Authenticated channel, durable writer, commit-before-ACK, outbox, replay, bounded backpressure, presence and rollout/rollback evidence. A socket ACK alone must never mean durable persistence. |
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
2. Start the Phoenix durable-channel service as a separate, flagged transport
   with synthetic accounts and independent PostgreSQL connections. Preserve
   existing message IDs and receipt semantics while comparing old and new
   projections; do not switch public traffic before failure-injection tests.
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
non-member. `npm run test:conversation-concurrency` could not run in this
workspace because `WINGA_TEST_POSTGRES_URL` and a disposable local PostgreSQL
cluster are absent; previously reported results are not a substitute for a
fresh run. No production mutation, push or deploy was performed by this audit.
