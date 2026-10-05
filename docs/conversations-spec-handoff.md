# Winga Conversations: spec handoff for 110 onward

Date: 2026-10-02. Original contract: ARCHITECTURE & SECURITY CONTRACT v1.0.

The original supplied specification is [spec 0-109](winga-conversations-spec-0-109.txt).
It contains every section from 0 through 109 exactly once, followed by the
original heading `110. AFTER FOUNDATION - FEATURE ROAD` (an em dash in the source).
That original attachment has only the heading at 110. On 2026-10-05 the operator
supplied [sections 110-238](winga-conversations-spec-110-238.txt), including the
complete section 110 body and the end of the contract. The new text matches the
attachment after newline normalization; its 129 section headings are contiguous.
The original 0-109 source has not been rewritten.

The [current execution plan](conversations-product-roadmap.md) follows that
contract's direct-first order. Evidence below is the historical 2026-10-02
checkpoint, not a current claim that the subsequently integrated E2EE runtime
is absent or disabled. See [encrypted chat acceptance](encrypted-chat-acceptance-20261004.md)
and [the deployed UI record](conversations-ui-20261004.md) for later evidence.

This handoff completes the source restoration and current evidence update. It
does **not** declare the full foundation accepted. Transport tests passing does
not close the E2EE, encrypted-media, recovery or capacity gates in section 109.

## Source provenance

Two user attachments supplied the contract. The first stops inside section 57;
the second supplies its complete text. Consolidation keeps sections 0-56 from
the first and sections 57 onward from the second, normalizing line endings.
The restored text was compared against both sources and matches. Section
numbering was verified to be contiguous from 0 to 110, with 110 a heading only.

| Original attachment | SHA-256 of original file |
| --- | --- |
| `dd8f37cd-8799-40f5-92b4-4dc04b506053/Pasted text.txt` | `52c0a98a52f0f4abe28d6f33ed442f8d592f579d800241fa825b261dbac8f0ea` |
| `43ae9ac2-4479-49ec-909e-5fabf89f2641/Pasted text.txt` | `cb919b04e81a18d145e608f754c548fd8e4f51be766430829429e29877223bcb` |

The [architecture contract](conversations-foundation-contract.md) is the
implementation interpretation, not a replacement for the original text.
The [completion gates](conversations-completion-gates.md) retain detailed
historical evidence and outstanding acceptance criteria.

## Current evidence

Phoenix transport is enabled in the production browser for all authenticated
accounts. The operator reported the live backend, active device event stream,
Sent/Delivered/Read, and notifications working. This is operator evidence;
it is not an independently captured authenticated production trace.

Local real-PostgreSQL, real-Phoenix and browser tests covered two nodes, lost
replies after commit, stable-ID retry, node termination, canonical-writer
restart, explicit receipts, revocation and bounded replay. The latest combined
suite passed 14/14, including 65 persisted messages, 65 canonical-ID retries
and 65 acknowledged replay obligations. No duplicate canonical sends or
implicit Delivered/Read were observed. This is bounded local correctness,
not a production capacity benchmark.

The operator declined an additional paid two-instance Phoenix exercise.
Keep Phoenix at one instance. Deployed Phoenix node-loss acceptance is deferred
by that decision; it is neither newly tested nor a reason to raise instance
count. The earlier operator-run REST/SSE cross-node exercise is separate evidence.

The isolated MLS experiment now checks independently supplied synthetic
account/device signing-key pins at initial group creation, add, welcome and
state restore. It rejects unknown devices, substituted keys, revoked pins,
malformed credentials and ambiguous registration. Node tests passed 15/15;
Edge tests passed 4/4, retaining prior persistence and retry checks.
This is not Winga account enrollment, production E2EE or a security audit.

## Section 109 Phases

| Phase | Status | Remaining acceptance |
| --- | --- | --- |
| 0: Current system audit | Audit and repository contracts recorded. | Revalidate affected interfaces when changing the final architecture. |
| 1: Contract freeze | Durable acceptance, ordering, idempotency, queue/ACK and service boundaries implemented and tested. | Audited E2EE implementation selection, cryptographic identity/recovery and retention policies are unresolved. |
| 2: BEAM realtime foundation | Live Phoenix send/resume path, authentication, device routing and supervisors; local failure/retry evidence. | Complete observability, fleet-wide admission/backpressure and measured acceptance targets. Deployed node-loss test is deferred. |
| 3: E2EE foundation | Protocol, persistence and pinned-identity experiments only. | Reviewed production library, authenticated trust establishment, encryption/decryption integration, verification and secure device state. |
| 4: Encrypted media | Public/private media boundaries and legacy migration evidence exist. | Endpoint-encrypted media and thumbnails, encrypted key references, authenticated download and retry. Legacy R2 availability is not encrypted-media evidence. |
| 5: Multi-device and recovery | Session-bound device queues, replay and receipts are implemented. | Cryptographic device add/revoke, recovery/backup/transfer and identity-change notifications. A queue device ID is not a cryptographic identity. |
| 6: Foundation acceptance | Not passed in full. | Close the preceding gates and dedicated security/mobile/scale acceptance before declaring full foundation completion. |

## Coverage Map

This is a grouped status index, not a percentage or a claim that every
requirement within a range passed. Many original sections deliberately require
preparation rather than full feature implementation.

| Spec sections | Workstream | Current boundary |
| --- | --- | --- |
| 0-3 | Mission, ownership and planes | Existing Node commerce/auth remains authoritative; Phoenix is a bounded transport. Million-user support remains a target. |
| 4-10 | State, IDs, idempotency, ordering, resume and offline queue | Implemented paths with local tests and operator-reported live flow; plaintext legacy compatibility remains. |
| 11-15 | Pressure, scaling, routing, presence and typing | Bounded transport replay and local failover tested; fleet pressure, complete ephemeral presence and typing remain open. |
| 16-27 | E2EE and cryptographic devices/groups | Evaluation and isolated MLS experiments only. No production E2EE or verified cryptographic device enrollment. |
| 28-33 | Encrypted media, local storage and recovery | Storage feasibility exists; production encrypted media, key custody and recovery remain open. No universal recovery key introduced. |
| 34-38 | Metadata, push, reporting, blocking and abuse | Existing push and authorization guards have evidence; encrypted-content privacy and explicit reporting require E2EE integration. |
| 39-56 | Commerce, future features and privacy preferences | Boundaries documented. Orders/payments remain canonical outside chat; these preparation sections do not authorize implementing every future feature now. |
| 57-65 | Regions, stores, events and integration | Single-region deployment with durable versioned events and adapter boundaries. Multi-region/residency deployment is not proven or required immediately. |
| 66-74 | Auth, replay, downgrade, secrets, logging and tracing | Ticket/session/member/CSRF checks and aggregate verifiers have tests. Crypto downgrade/agility and comprehensive privacy-safe tracing remain open. |
| 75-88 | Observability, SLOs, failure domains, load and scale | Bounded correctness and selected crash tests pass. Complete metrics, realistic soak/capacity and broader dependency-failure evidence are outstanding. |
| 89-95 | Deployment, migrations, protocol and PWA/mobile | Independent service and staged schema/browser paths exist. Physical-device crypto recovery, network switching and battery acceptance remain open. |
| 96-103 | Future calling, sharing, businesses and export | Architecture preparation, not a completed calling/business/export product. Keep future requirements separate. |
| 104-108 | Retention, erasure, threats and review | Partial ACK pruning and threat analysis recorded; full policy approval, E2EE review and independent audit remain open. No E2EE label is warranted. |
| 109 | Acceptance phases | See the phase table; full foundation acceptance remains open. |

## Continuing at 110

Append the user's new product specification starting at section 110 to the
original contract, preserving the completed sections and outstanding gates.
Do not renumber the implementation contract's internal chapters as if they
were the original spec. Writing the next specification can proceed now;
release of dependent features must still respect the original acceptance gates.

This handoff changes only documentation and the isolated crypto experiment.
There is no production migration, frontend deployment, Render change or
instance increase required for this commit.
