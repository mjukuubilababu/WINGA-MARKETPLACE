# Conversations Security & Realtime — current partial-contract audit

Date: 14 October 2026. Baseline `55edc14169ca159ffb0f56a8c83a0ba6d93841c7`.
**New supplied contract is incomplete: sections 0–53 are complete; section 54
ends at “Do not assume every user”. The user is looking for the remainder.**
This contract has different numbering from the stored Architecture & Security
0–109 and product 110–238 specifications. Their historical section labels are
not silently mapped onto this new contract. No full-contract completion is claimed.

**Conversations has actual implementation/hardening gaps, not only tests.**
Growth's “implementation mostly complete” status does not mean this foundational
Conversations contract is accepted. User-reported Messages incompleteness and real
internal sharing/Room acceptance remain open. Runtime source, isolated fixtures,
real infrastructure and independent cryptographic approval are separate evidence.

Current follow-up: [activity, device notices and infrastructure hardening](conversations-activity-devices-hardening-20261014.md) supersedes the earlier missing-source findings below. Full foundation acceptance remains open.

## Audit summary and canonical reuse

Existing canonical code implements authenticated Phoenix routing to Node's
PostgreSQL writer; MLS candidate direct/group encryption; signed native devices,
explicit approval/revocation and membership epochs; encrypted local vault/outbox;
signed recipient receipts; user-held-key history recovery; private encrypted
media; safe reporting/blocks/quotas and legacy mode separation. Marketplace
Feed/Search/Products/Orders/Payments/Ads/Inventory remain outside BEAM.

Old reports that say no crypto integration existed describe their historical
checkpoint. They must not be used to rebuild systems now implemented. Conversely,
source implementation and a successful deployment must not be used to claim
universal private-conversation E2EE, approved library selection or real delivery.
`ts-mls@1.6.4` remains a pinned, integrated **unaudited candidate**, not independent
protocol/library approval. C/C++ core requirements are conditional because no
Winga C/C++ crypto core is selected; do not create custom crypto to tick them.

## Verified source hardening in this audit

Direct MLS client accepted `{id,hash,status:sent}` with no committed time/sequence,
substituting its local pending timestamp. The existing canonical writer always
returns committed `createdAt` and decimal `sequence`; Room client already requires
both. Direct confirmation now also requires those canonical fields before it sets
SENT and retires the exact outbox. Incomplete/noncanonical replies keep the logical
UUID, ciphertext and ratchet work for reconciliation; no plaintext fallback or
new crypto/envelope/schema is introduced.

The server assigns the canonical encrypted message ID by accepting the validated
client UUID. A separate new server UUID is not introduced: changing it would break
existing exact-retry/history/attachment binding. Transport idempotency and library
cryptographic replay protection remain separate.

Focused proof: 57 runtime cases passed (49 top-level cases including one new
8-case invalid-ACK matrix), with eight rejected ACK variations, actual MLS decrypt,
reload, exact ciphertext and logical-ID reuse. One isolated Chromium **HTTP +
HttpOnly cookie + canonical API/store + PGlite** scenario commits one row, removes
only the response timestamp, observes pending encrypted endpoint storage, reloads
and reconciles with identical ciphertext and the original canonical time/sequence.
Legacy message row count stays unchanged. The final complete strict-CSP
encrypted browser suite passes **51/51** (3.6 minutes), four 1,766-key catalogs
remain valid with zero new UI debt, and 98 modules remain synchronized.
[Exact isolated evidence/source hashes](evidence/conversations-security-realtime-ack-isolated-20261014.json). This is not a physical device or a
live user journey, nor independent PostgreSQL connection/crash acceptance.

The browser test initially assumed a wrapped response, then used history render
to inspect pending state. Both fixture assumptions were corrected: this API has
a flat response, and history render triggers automatic reconciliation. Final
proof reads the encrypted endpoint vault before triggering that reconciliation.
No production outage is inferred from these test-construction failures.

## Mandatory source gaps / preparation work still open

| Gate | What remains / why |
| --- | --- |
| EPHEMERAL | Source now implemented on existing Phoenix with mutual opt-in, native authorization, TTL, bounded QoS and direct UI. Physical PWA, regional capacity and clustered presence acceptance remain open. |
| DEVICE_NOTICES | Durable deduped own-account register/approve/revoke notices now reuse canonical notifications/SSE and link to device management. Dates reflect stored truth; physical device acceptance remains open. |
| ORDERING | [14 October follow-up](conversations-ordering-20261014.md) replaces direct/mixed/pager/UI timestamp overrides with shared scoped sequence ordering and correct inbox latest selection. Unknown recovered metadata and separate legacy/native domains stay explicit; live/migration/device acceptance remains open. |
| LEGACY | Explicit plaintext compatibility remains. New encrypted mode is irreversible/fail-closed. Universal E2EE needs approved migration/activation; do not relabel old history or enable unaudited encryption automatically. |
| INFRA_TLS | Requested pool/replica/listener TLS now verifies certificate and hostname; local TLS checks pass. Production provider trust activation, at-rest/backup and least-privilege evidence remain open; failed Render preflight needs operator logs. |
| CRYPTO | Final protocol/library/license/integration review and actual independent security/crypto approval. Latest baseline CodeQL still reports 54 findings, zero reviewed, CODEQL_REVIEW_STALE; no waiver or forged review. |
| RETENTION | Approved numeric message/metadata/attachment/backup/tombstone/erasure policies and execution evidence. Existing limited queue pruning is not whole-account erasure. |
| MOBILE / LIVE | Real trusted-device approval, physical Android/PWA secure-store/reload/offline/recovery/media/receipt/Room acceptance. Handles/old Pending reports are not current sessions. |
| CAPACITY | Controlled staging node/DB/provider failure, hot Room/slow-device/reconnect pressure, regional SLO and recovery evidence. Keep the existing one deployed Phoenix instance; earlier paid expansion was declined. |
| INPUT | Rest of section 54 and any later new-contract requirements. Do not assume that the historical 0–109 contract supplies missing new text. |

No existing device is approved/revoked on behalf of the user, no library/provider
is replaced, no production feature flag/CA/CSP is changed, no live message/invite
or load test is performed, and video failure work stays deferred. These boundaries
preserve the user's earlier instructions while source hardening proceeds.

## Complete received-section map

“IMPLEMENTED” means canonical source exists, not production/independent acceptance.
“PARTIAL” identifies a gap or remaining policy/infrastructure obligation;
“MISSING” means no dedicated canonical runtime was found; “CONDITIONAL” applies
only if its triggering architecture is selected; “INPUT_INCOMPLETE” is not a pass.
Detailed source references and gates are retained in
[the machine-readable mapping](conversations-security-realtime-readiness-20261014.json).

| Section | Requirement | Source classification | Open gates |
| --- | --- | --- | --- |
| 0 | CORE ARCHITECTURAL DECISION | IMPLEMENTED | CAPACITY, LIVE |
| 1 | SECURITY PRINCIPLE | PARTIAL | LEGACY, CRYPTO, LIVE |
| 2 | DO NOT INVENT CRYPTOGRAPHY | IMPLEMENTED | CRYPTO |
| 3 | PROTOCOL EVALUATION | PARTIAL | CRYPTO, MOBILE |
| 4 | C/C++ CRYPTO CORE | CONDITIONAL | CRYPTO |
| 5 | MEMORY SAFETY REVIEW | CONDITIONAL | CRYPTO |
| 6 | DEVICE IDENTITY | IMPLEMENTED | MOBILE, LIVE |
| 7 | DEVICE REGISTRATION | IMPLEMENTED | MOBILE, LIVE |
| 8 | ADDING A DEVICE | PARTIAL | DEVICE_NOTICES, LIVE |
| 9 | DEVICE REVOCATION | IMPLEMENTED | CRYPTO, LIVE |
| 10 | IDENTITY VERIFICATION | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 11 | MESSAGE ENVELOPE | IMPLEMENTED | CRYPTO |
| 12 | MESSAGE IDENTITY | IMPLEMENTED | LIVE |
| 13 | DURABLE ACK CONTRACT | IMPLEMENTED | LIVE, CAPACITY |
| 14 | DELIVERY STATE MACHINE | IMPLEMENTED | LIVE |
| 15 | SENT | IMPLEMENTED | LIVE, CAPACITY |
| 16 | DELIVERED | IMPLEMENTED | LIVE |
| 17 | READ | IMPLEMENTED | LIVE |
| 18 | OFFLINE DELIVERY | IMPLEMENTED | MOBILE, LIVE, CAPACITY |
| 19 | OFFLINE SEND QUEUE | IMPLEMENTED | MOBILE, LIVE, CAPACITY |
| 20 | RECONNECT / RESUME | IMPLEMENTED | MOBILE, LIVE, CAPACITY |
| 21 | EVENT ORDERING | PARTIAL | ORDERING |
| 22 | REALTIME PLANE — BEAM | PARTIAL | EPHEMERAL, CAPACITY, LIVE |
| 23 | START SIMPLE, SCALE HORIZONTALLY | IMPLEMENTED | CAPACITY, LIVE |
| 24 | STATE OWNERSHIP | IMPLEMENTED | CAPACITY, LIVE |
| 25 | PROCESS FAILURE | IMPLEMENTED | CAPACITY, LIVE |
| 26 | NODE FAILURE | PARTIAL | CAPACITY, LIVE |
| 27 | BACKPRESSURE | PARTIAL | CAPACITY |
| 28 | PRESENCE | IMPLEMENTED | MOBILE, LIVE, CAPACITY |
| 29 | MULTI-DEVICE PRESENCE | IMPLEMENTED | MOBILE, LIVE, CAPACITY |
| 30 | TYPING INDICATORS | IMPLEMENTED | MOBILE, LIVE, CAPACITY |
| 31 | SHOPPING ROOM REALTIME | PARTIAL | EPHEMERAL, CAPACITY, LIVE |
| 32 | GROUP ENCRYPTION | IMPLEMENTED | CRYPTO, LIVE |
| 33 | LARGE ROOM FAN-OUT | PARTIAL | CAPACITY |
| 34 | ATTACHMENT E2EE | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 35 | ATTACHMENT INTEGRITY | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 36 | ATTACHMENT RETRY | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 37 | ATTACHMENT LIMITS | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 38 | PUSH NOTIFICATION PRIVACY | IMPLEMENTED | LIVE |
| 39 | METADATA MINIMIZATION | PARTIAL | RETENTION, CRYPTO |
| 40 | DATABASE CONTENT | PARTIAL | LEGACY, CRYPTO, LIVE |
| 41 | DATABASE ENCRYPTION | PARTIAL | INFRA_TLS, RETENTION |
| 42 | KEY STORAGE ON DEVICE | PARTIAL | CRYPTO, MOBILE |
| 43 | WEB/PWA SECURITY | PARTIAL | CRYPTO, MOBILE |
| 44 | KEY BACKUP / RECOVERY | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 45 | RECOVERY UX | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 46 | PASSWORD RESET | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 47 | ACCOUNT TAKEOVER | IMPLEMENTED | CRYPTO, MOBILE, LIVE |
| 48 | SECURITY NOTIFICATIONS | IMPLEMENTED | MOBILE, LIVE |
| 49 | REPORTING ABUSE UNDER E2EE | IMPLEMENTED | CRYPTO, CAPACITY, LIVE |
| 50 | BLOCKING | IMPLEMENTED | CRYPTO, CAPACITY, LIVE |
| 51 | SPAM / RATE LIMITING | IMPLEMENTED | CRYPTO, CAPACITY, LIVE |
| 52 | REPLAY PROTECTION | IMPLEMENTED | CRYPTO, CAPACITY, LIVE |
| 53 | DOWNGRADE PROTECTION | IMPLEMENTED | CRYPTO, CAPACITY, LIVE |
| 54 | VERSIONING | INPUT_INCOMPLETE | INPUT |

## Resume / source-of-truth handoff

Continue source work on the gates above; integrate any new contract continuation
into this mapping before claiming completeness. Do not reuse the Growth ledger's
106-section coverage as Conversations acceptance. Preserve native trust and
separate account auth, crypto device approval, group membership and history keys.

Use existing secure-content/Rooms/native/real PostgreSQL runners and required
functional/dependency/Phoenix deployment checks. Keep independent CodeQL/crypto
review open. Update this report with exact subsequent evidence, not synthetic
production claims. The ACK guard changes no server schema or protocol, and can
be reverted as a bounded client patch while canonical ciphertext/events remain.

## CodeQL engineering triage follow-up — 14 October 2026

[All 55 baseline findings and two reproduced local I/O fixes](conversations-codeql-triage-20261014.md) now have actual message/flow evidence and source assessments. The read-only artifact projection provides full baseline location threads; three readers reject FIFO swaps and three local harnesses reject sibling-root traversal. Independent review/source rebinding remains open; no reviewer identity, manifest or release gate was changed.
