# Winga Conversations: architecture and security contract v1.0

Date: 2026-09-22. Repository baseline: `15170f7`.
Status: foundation review candidate, NOT an implemented E2EE service.
The audit below is historical; subsequent runtime increments are recorded at the
end and in `message-replay.md`. It is not a current completion checklist.
Scope: supplied specification sections 0-109, including the second attachment.
Section 110 contains only "AFTER FOUNDATION - FEATURE ROAD"; no missing requirements are assumed.
This document changes no runtime, schema, deployment topology, or public promise.
Freeze the invariants below before feature work; crypto selection and launch remain gated.

## 1. Repository audit and immediate risks

Evidence is source inspection, not authenticated production/security/load certification.

| Area | Current evidence | Finding / target gap |
| --- | --- | --- |
| Persistence | `backend/db.js:createMessageWithNotification` | PostgreSQL transaction includes message, notification and `pg_notify`; retain durable-before-success semantics. |
| Transport | `src/api/communications-client.js:openRealtimeChannel`, `backend/server.js` GET `/api/messages/stream` | EventSource/SSE with PostgreSQL LISTEN/NOTIFY, not Phoenix. Notifications are not a durable replay log. |
| Identity/auth | POST `/api/messages` derives sender from session, checks receiver/product/block | Reuse platform identity; cryptographic device identity is not established by a user session. |
| Inbox/history | `backend/message-pages.js:createMessagePagesStore`, `docs/message-pagination.md` | Person-grouped summaries, bounded history and owner-scoped cursors exist. No need for new per-product threads. |
| Client reconciliation | `src/chat/pagination.js`, `app.js`, `src/chat/controller.js` | POST/SSE immediate merge plus background refresh exists. Keep it during migration. |
| Retry | `backend/db.js:createMessageWithNotification`, `src/chat/controller.js:runRetrySafeMessageSend` | Content/time-window duplicate suppression is NOT durable logical-message idempotency; duplicate rejection can follow a lost success response. |
| Receipts | `backend/server.js` POST `/api/messages` sets `deliveredAt: now`, `isDelivered: true` | P0 semantic gap: server acceptance is currently treated as delivery; no recipient-device evidence at this assignment. |
| Offline | `src/api/offline-queue.js:queueOfflineMessageAction/flushOfflineActionQueue` | JSON payload queue, separate locally generated ID; non-retryable errors are discarded. P0 retention gap. This is not secure encrypted outbox storage. |
| Confidentiality | `backend/db.js` messages INSERT; notification body in POST `/api/messages` | Server persists plaintext message and creates plaintext snippet. Current chat MUST NOT be described as E2EE. |
| Ordering | `backend/message-pages.js:readConversationPage` | Server timestamp + ID keyset ordering exists; not a monotonic conversation event sequence/replay ledger. |
| Commerce | `backend/conversation-offers-api.js`, `backend/conversation-offers-store.js`, `backend/conversation-availability-api.js` | Existing authorized/idempotent structured actions are reusable; do not move their domain state into ciphertext-only chat. |
| Scale | Message transaction uses participant advisory lock; summary query scans visible history | Useful foundations, not evidence for millions of concurrent users. Bound hot-room/database contention before scaling. |

Keep existing messages, IDs, participant relationships, read data, API clients,
commerce actions and tests. Do not reinterpret old delivered flags as verified
device receipts. Do not delete plaintext history or pretend later encryption
erases old copies, backups, notifications or prior server access.

## 2. Ownership and trust boundaries

Target path: endpoint crypto/client -> TLS -> authenticated Phoenix channel ->
single durable Conversations writer -> PostgreSQL commit -> acceptance ACK ->
outbox fan-out -> authorized receiving devices.

BEAM owns connections, bounded routing, ephemeral presence/typing, retries and
fan-out. PostgreSQL owns membership, accepted ciphertext/events, sequence,
outbox and receipt positions. Private object storage holds encrypted media.
Platform services continue to own Users/Auth, Products, Orders, Payments,
Inventory, Delivery, Ads, Feed, Search and intelligence.

Initially expose a bounded internal persistence adapter from the existing
backend; Phoenix must not load the platform store or duplicate domain mutations.
Only one writer allocates conversation positions. A later writer relocation
requires an explicit cutover, not independent Node and Phoenix writes.

Threat model includes malicious peers, stolen sessions, replay, unauthorized
subscriptions, revoked devices, compromised routing/storage, metadata leaks,
queue loss, malicious media, supply-chain compromise and malicious web script.
E2EE does not protect plaintext on a compromised endpoint or erase screenshots.
TLS remains required. Web-origin/XSS compromise can defeat browser E2EE.

## 3. Authentication and authorization contract

- Platform auth issues a short-lived, audience-bound Conversations credential
  for an already registered device; no password exchange with BEAM. Verify issuer,
  audience, expiry, signature, session revocation and device binding.
- Validate browser Origin on socket upgrade. Reuse CSRF protection for cookie
  authenticated ticket issuance/mutations. Never put bearer secrets in URLs/logs.
- Authenticate connections AND authorize every join, send, history read, resume,
  receipt, attachment access and membership mutation. A topic name is not access.
- Resolve sender user/device from authentication, not supplied envelope fields.
  Recheck membership/device/block state at commit and at delivery boundaries.
- Service-to-service credentials have narrow scope and rotation; BEAM cannot
  approve payments, update inventory or impersonate arbitrary users.
- Revocation disconnects devices and prevents new sends/download grants. A
  partition cannot extend authorization indefinitely; require bounded revalidation.
- Read cursors are never capabilities. Guessed IDs or valid cursors from another
  account must not reveal existence/content. Apply bounded abuse controls.

## 4. Proposed durable model (not a migration)

| Record | Essential fields / constraints |
| --- | --- |
| Conversation | UUID, kind DIRECT/GROUP, protocol/security mode, nextEventSequence; unique canonical unordered person pair for direct chat |
| Membership | conversationId, userId, membershipVersion, joined position, left position; explicit authorized history interval |
| Device | deviceId, platform user reference, public identity bundle/version, status, registered/revoked timestamps; never private identity keys |
| Message | messageId, conversationId, senderUserId, senderDeviceId, clientMessageId, serverReceivedAt, protocolVersion, cipherSuiteVersion, ciphertext/envelope reference |
| ConversationEvent | conversationId + sequence UNIQUE, eventId UNIQUE, messageId where applicable, membershipVersion, encrypted/protocol payload |
| DeviceDelivery | messageId + destinationDeviceId UNIQUE, opaque encrypted device envelope; durable recipient obligations |
| Receipt | conversationId + deviceId, contiguous received/read position; monotonic, bounded by authorized delivered positions |
| Outbox | eventId + destination unique, attempts, dueAt, leaseUntil, status; inserted in message transaction |
| Attachment | opaque objectId, owner/device, ciphertext byte length, upload/finalization state, access policy, expiry; no media decryption key |

Use foreign keys and indexes for member history, device inbox, replay position,
outbox due/lease recovery, idempotency and attachment ownership. Reuse immutable
platform user identity if available; do not invent a second login system. Current
username references need an explicit mapping if immutable identity is introduced.
SQL and retention policies require separate review before migrations.

## 5. Send/ACK and idempotency invariants

1. Device durably saves user draft, logical clientMessageId and encrypted outbox
   using the crypto adapter's atomic state transaction before reporting QUEUED.
2. Encrypt once per logical send and save exact retry envelope(s) with ratchet
   state. Do not re-encrypt/reuse nonces ad hoc on retries.
3. Validate payload size/version, active device, membership, blocks and quotas.
4. In ONE database transaction lock the conversation sequencer, enforce UNIQUE
   `(conversationId, senderUserId, senderDeviceId, clientMessageId)`, insert message,
   authorized destination envelopes and event/outbox; then commit.
5. Matching retry returns the same messageId, sequence and serverReceivedAt.
   Same idempotency key with different envelope digest returns conflict, never a
   second message. After membership revocation even duplicate lookup is authorized.
6. Only committed success means SENT. Lost ACK remains an unknown outcome that
   is retried with the same ID. A timeout is not proof that storage failed.
7. Fan-out is at-least-once and deduplicated by eventId/messageId. Worker crash
   after delivery but before outbox completion is safe. NOTIFY/PubSub wakes a
   worker; neither is the durable work ledger.

Proposed ACK: `{protocolVersion, clientMessageId, messageId, conversationId,
sequence, serverReceivedAt, status: "SENT"}`. Sequence is a decimal string to
avoid JavaScript integer precision loss. Reject unknown critical versions;
never silently downgrade an encrypted conversation to plaintext.

Retention of accepted-ID tombstones must cover supported retry lifetime, even
after content deletion. Document that lifetime before launch. Expired retries
return an explicit non-accepting error, not an unseen duplicate creation.

## 6. State, ordering and resume

LOCAL_PENDING -> QUEUED/SENDING -> SENT -> DELIVERED -> READ.
SENDING -> FAILED on definite rejection; FAILED -> SENDING on explicit retry
with the original logical ID. Unknown-outcome sends reconcile before replacement.
Terminal policy errors remain visible/exportable; never silently discard them.

DELIVERED requires authenticated recipient-device acknowledgement after local
durable storage, not socket write, HTTP ACK, push receipt or presence. For direct
chat, user-level delivered means at least one authorized recipient device; expose
group receipt aggregates separately. READ requires a qualifying foreground view
and enabled receipt policy; it does not prove human comprehension. Read implies
delivery but off preferences mean unknown, not unread. Store per-device positions.

Allocate a monotonically increasing event sequence under the conversation lock
in the same transaction as persistence. Message order is its creation-event
position; edits/reactions/receipts do not move the original message. Database
timestamps are display metadata. Do not sort canonical history by client clocks.

Resume request includes device and last contiguous acknowledged event position.
Replay authorized events above that position in bounded batches, with a captured
high-water mark and hasMore. Deduplicate the live/replay overlap; detect gaps and
fetch them before advancing the checkpoint. Do not advance to the largest seen
position if earlier events are missing. Exclude unauthorized historical epochs.
Expired replay cursors return explicit RESYNC_REQUIRED with a bounded authorized
snapshot/history path. Retention cannot silently skip missing messages. Cross-
conversation device sync needs a durable per-device inbox cursor, not timestamps.

## 7. Device security and crypto decision gate

No custom crypto, hand-written ratchet, permanent room key, or server master key.
High-level client adapter operations: register identity, verify contact/device,
establish session/group, seal/open event, prepare encrypted attachment, apply
membership commit, revoke device, export/import encrypted recovery. Primitive
choice, nonce handling and ratchet persistence belong to the selected library.

Preliminary evaluation (sources checked 2026-09-22; not library approval):

| Candidate | Fit / maturity | Platform and integration | Gate |
| --- | --- | --- | --- |
| Signal protocol family + libsignal | Asynchronous direct messaging; evaluate PQXDH/ratchet and Sesame multi-device model together, not merely encryption primitives | libsignal exposes Java, Swift, TypeScript with Rust implementation; TypeScript is NOT proof of browser/PWA support | AGPL-3.0 license and unsupported third-party use require review; pin version, verify browser feasibility and exact audit scope |
| MLS RFC 9420 + OpenMLS | Standards-based dynamic groups; possible common protocol for direct and group devices, but application delivery/identity remain our responsibility | Rust library; WASM/mobile targets need actual device/browser testing, not assumption from compilation | MIT; choose crypto provider, review storage/epoch recovery and independent audit at exact release |
| MLS RFC 9420 + MLS++ | C++ implementation to evaluate when native integration matters | C++ binding/mobile/WASM packaging and secure persistence remain Winga integration work | Check pinned LICENSE/dependencies, audit and maintenance; no production recommendation from language choice alone |

Protocol properties are conditional: ratchet erasure/epoch advancement support
forward secrecy; post-compromise recovery requires uncompromised endpoints and
fresh protocol entropy/updates. It is not instantaneous or protection against
ongoing endpoint compromise. RFC 9420 does not by itself supply device trust,
backup, abuse handling, delivery durability or post-quantum guarantees.

Decision: freeze crypto boundary, NOT a vendor/library. Evaluate direct Signal
plus MLS versus MLS for all conversations in an isolated prototype. Launch needs
versioned audit reports covering selected code/providers/FFI and our integration,
license review, mobile memory/storage budgets, offline interoperability and
security review. No current audit coverage was established for Winga.

New device authorization requires existing verified-device approval where
available, contact-visible identity change verification, and a documented recovery
path. Server-issued device lists alone do not stop malicious server substitution.
Evaluate key transparency/consistency checking plus QR/safety-code verification;
do not advertise undetectable-substitution resistance before that gate passes.
Revoke keys/sessions and advance group epochs; removed devices cannot obtain
future protected envelopes. Old decrypted copies cannot be recalled. New members
do not automatically receive old history or old keys. Handle concurrent group
commits via the chosen protocol, not custom merge of cryptographic state.

## 8. Local storage, recovery, attachments and metadata

Use OS protected key storage for native clients; browser design uses a reviewed
key-storage/encrypted IndexedDB adapter, origin hardening and explicit recovery.
Non-exportable browser keys are not protection from malicious same-origin code.
No private keys/plaintext queued payloads in ordinary localStorage. Handle quota,
eviction, locked keys, account switching and multiple tabs without acknowledging
unsaved work. Warn before deleting unsent local data on logout/device reset.

Prefer explicit verified-device transfer first; encrypted backup with user-held
recovery secret is optional only after review. Password reset restores identity
access, NOT old plaintext. Lost devices and lost recovery secrets may mean lost
history. Server-held universal recovery keys are forbidden. Revoked-device and
backup rollback semantics must be tested; do not resurrect compromised sessions.

Private media is prepared/encrypted on-device, including thumbnails and voice.
Use library-supported authenticated streaming/chunked media format; do not invent
nonce/chunk crypto. Ciphertext uploads are resumable and quota-limited. Finalize
before referencing from an accepted event; sweep abandoned objects by policy.
Object fetch requires authorized access grants; possession of an object URL must
not reveal plaintext. Key, original name/type and private caption remain encrypted.
Validate decrypted media safely at endpoints. Encrypted bytes cannot use public
product transcoding/moderation as if they were plaintext. Server processing needs
separate explicit disclosure/consent, never an invisible fallback.

Server necessarily sees routing identities/devices, membership, times, sequence,
ciphertext sizes, receipt metadata and operational IP data where needed. Minimize
retention/access, prohibit content/key logging, and audit privileged access. Do
not copy those metadata into Ads audiences or public buyer histories. Before
launch set reviewed numeric retention limits for messages, replay, tombstones,
attachments, backups and security logs; these limits are presently unresolved.
Default push contains an opaque event reference and generic new-message text;
sender-name previews are a user policy choice. No private snippet to push provider.

## 9. Commerce, safety and future event semantics

Encrypted typed payloads reference canonical product/order/payment/delivery IDs.
Clients fetch current domain truth using existing participant permissions; a
chat reference grants no extra access. Money actions retain canonical API
authorization/idempotency. Explicit structured commerce actions may generate
consented/minimized domain signals; do not mine private text into intelligence.

Future room Ask Seller creates a separately authorized structured request with
only user-selected fields; seller never becomes room member by receiving it.
Room polls use encrypted content/votes and client reduction initially; any server
tally design must disclose its visible metadata and require separate review.
Persistent boards, polls and group ordering are future capabilities, not shipped.

Edits are authenticated versioned events referencing own message, with reviewed
edit-window policy. Deletes-for-me are per-user visibility events; deletes-for-
everyone are tombstone events with best-effort endpoint removal, not a recall
promise. Replies/reactions carry encrypted references; do not copy quoted text
into server metadata. Room epoch changes and event schema versions are distinct.

Reports disclose only selected decrypted evidence after explicit user preview/
confirmation; store in an access-controlled, retention-bounded moderation domain.
Do not claim screenshots or submitted text prove sender authorship automatically.
Blocks override direct send/fan-out/push/presence policy; group coexistence needs
explicit room rules and cryptographic removal, not pretend per-user secrecy.
Keep audit evidence. Rate-limit by account/device and unsolicited requests without
plaintext surveillance. Presence defaults to restricted/opt-in audience; typing
and receipts are configurable. Disable receipts symmetrically at user UI level.
On-device search/indexing, translation, transcription, memory and AI are optional.
Any external processing is selected-content disclosure, not a condition of chat.

## 10. BEAM operations and failure isolation

Phoenix.PubSub handles cross-node topics; Presence/Tracker supports ephemeral
device sessions. Node-local socket registries are reconstructible. Never use a
single global map as canonical device delivery state. On node loss devices
reauthenticate anywhere and resume from durable cursor. No sticky-session
dependency for correctness. Presence has TTL and tolerates temporary inconsistency;
typing can be dropped/rate-limited and never becomes durable message history.

Admission states: NORMAL -> PRESSURED -> THROTTLED -> PAUSED, driven by configured
DB latency, pool saturation, durable outbox age/bytes and mailbox thresholds.
Bound frame sizes, connections/account, queued work/device and fan-out batches.
Reject before acceptance with retryAfter when throttled; retain client outbox.
Persisted messages remain SENT even if fan-out is delayed. Shed typing/presence
before durable messages; disconnect slow consumers with resumable positions.
DB unavailable means no SENT. Broker unavailable means durable outbox retry.
AI, commerce enrichment, thumbnails and push failures never block human chat.

Start one write region; capacity is unproven. No active-active sequencer now.
Future failover needs fencing/single-writer ownership, tested recovery and explicit
RPO/RTO; async replica loss must not be hidden by a blanket durability claim.
Measure socket/memory load, slow-client queues, hot-room ordering, DB contention,
replay throughput and node/DB recovery before any concurrency-scale claim.
Metrics: persist/ACK latency, unknown outcomes, idempotent replays/conflicts,
outbox age/retries, replay gaps, invalid receipt/device attempts, queue loss and
disconnects. Normal telemetry contains no bodies, keys or private attachment URLs.

## 11. Migration and smallest safe next patch

1. Freeze/review this contract and obtain remaining spec; agree policy owners.
2. Smallest runtime patch: durable logical-message IDs/idempotent return for
   current message API, with lost-ACK/concurrent retry tests. Preserve SSE and
   pagination. Pair with secure queue design; do not call current queue secure.
3. Correct acceptance versus delivery evidence and retain failed offline messages.
   Compatibility adapter must not fabricate receipt proof for historical flags.
4. Add additive conversations/membership/event/outbox projections behind flags;
   backfill person pairs deterministically, retain old context references, compare
   counts/ownership/unread/history before any read cutover. No destructive rewrite.
5. Prove Phoenix authenticated channel -> durable writer -> ACK -> replay with
   synthetic data and failure injection. Existing REST/SSE remains operational.
6. Select/audit crypto and device/recovery/media contracts in an isolated prototype.
   Gate encryption by conversation capabilities and explicit mode. Legacy histories
   stay honestly labelled; encrypted mode must never fall back to plaintext.
7. Canary new encrypted conversations, reconcile multi-device state and evaluate
   security/load/operational gates before wider migration. Rollback can disable
   new enrollment and keep encrypted history; cannot downgrade existing secrets.

No BEAM service, crypto dependency, production migration or feature flag is added
by this foundation document. No claim of million-user readiness is made.

## 12. Required acceptance evidence (future tests, not current passes)

| Invariant | Required proof |
| --- | --- |
| Durable ACK | Kill writer before commit: no SENT; kill after commit/before ACK: retry returns exactly same canonical message |
| Concurrent retries | Multiple devices/nodes retry same logical key; one row/event, deterministic conflict for different payload |
| Fan-out | Crash after delivery before outbox completion; dedupe; slow socket cannot exhaust process memory |
| Resume | Miss NOTIFY, reorder/duplicate live events, reconnect to another node, expire cursor: no silent gaps |
| Auth | Forged sender/device, cross-account cursor/topic, revoked session/device, block races all denied |
| Receipts | No recipient ACK means no DELIVERED; disabled receipts never imply READ; positions cannot exceed authorized delivery |
| Offline | Reload, lost response, quota failure, two tabs, logout: preserve logical ID, keys and failed payload or explicit user choice |
| Crypto | Published vectors/interoperability, tamper/replay rejection, no nonce reuse, crash-safe ratchet state, epoch removal |
| Recovery | New-device verification, revoked-device exclusion, lost secrets, backup rollback, no server master key |
| Media | No plaintext thumbnail/CDN upload, invalid ciphertext handling, orphan sweep, revoked grants |
| Privacy | No body/key/push snippet leakage, consented reporting only, no cross-domain plaintext intelligence |
| Commerce | Reference authorization and order/payment idempotency remain canonical when chat or crypto is unavailable |
| Compatibility | Legacy messages, Inbox paging, instant merge, read counts, guest/auth flows and ordinary Feed remain intact |
| Scale | Real PostgreSQL multi-connection load, node partitions, DB failover, bounded resources and measured recovery |

Current regression suites to preserve: `tests/message-pages.test.js`,
`tests/message-pagination-client.test.js`, `tests/postgres-pagination.test.js`,
`tests/conversation-offers.test.js`, `tests/conversation-availability.test.js`,
and existing browser/HTTP integration tests. None proves E2EE or Phoenix today.

## 13. External primary references

- [Signal Double Ratchet](https://signal.org/docs/specifications/doubleratchet/),
  [PQXDH](https://signal.org/docs/specifications/pqxdh/),
  [Sesame](https://signal.org/docs/specifications/sesame/): protocol evaluation, not Winga audit evidence.
- [libsignal](https://github.com/signalapp/libsignal): bindings, support policy and license.
- [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html): group protocol, epoch and security model.
- [OpenMLS](https://github.com/openmls/openmls), [MLS++](https://github.com/cisco/mlspp): candidate implementations, not selected dependencies.
- [Phoenix PubSub](https://phoenix-pubsub.hexdocs.pm/Phoenix.PubSub.html),
  [Tracker](https://phoenix-pubsub.hexdocs.pm/Phoenix.Tracker.html): transient distributed realtime boundary.

Release blockers: library/version/audit and licensing
decision, browser key/recovery design, retention and receipt/group-block policies,
real PostgreSQL fault/load proof, security review, operational rollback rehearsal.

## 14. Storage, routing and external event contracts (sections 57-71)

All proposed interfaces below require authenticated request context, bounded
deadlines, traceId, protocol version and typed errors. They are contracts only.

| Interface | Operations and guarantees |
| --- | --- |
| MessageStore | `persistMessage(context, envelope)` atomically returns canonical ACK; `getMessage`, `getConversationMessages`, `getMessagesAfterCursor` authorize and page; `updateDeliveryState` is monotonic; `reconcileMessage` resolves original logical ID without sending again |
| EncryptedMediaStore | `createUpload` returns restricted upload grant; `completeUpload` verifies bytes/ownership; `fetchMetadata`, `generateAuthorizedDownload` reauthorize; `deleteAccordingToPolicy` respects retention/legal holds without retaining unnecessary objects |
| DeviceDirectory | Register/revoke/resolve authorized device bundle versions; distinguish platform authorization from cryptographic verification |
| RegionRouter | Resolve conversation home authority and device connection region; transfer opaque envelopes over authenticated service channels, not private keys |

Errors distinguish UNAUTHORIZED, FORBIDDEN, INVALID_VERSION, IDEMPOTENCY_CONFLICT,
THROTTLED, UNAVAILABLE, CURSOR_EXPIRED and definite validation failures. Unknown
commit outcome is reconciled, not converted into a new logical send. Vendor SDKs
remain behind adapters; public-media URL conventions must not define private IDs.
Existing `backend/storage-r2.js` requires `R2_PUBLIC_URL_BASE`: reuse infrastructure
only after private access policy is designed, not that public-serving contract.

Stable IDs contain no node hostname or mandatory physical region. Routing metadata
separately records homeRegion, storagePolicyVersion and authorityEpoch. Initially
all writes use one region. Future migration fences the previous writer, copies/
verifies data and moves authority with an epoch; stale writers reject writes.
Regional socket termination is distinct from durable data residency. Residency
policy must cover replicas, backups, logs, attachment storage and cross-region
egress, not merely primary PostgreSQL. No multi-region deployment is authorized here.

External event envelope: `{eventType, eventVersion, eventId, occurredAt,
conversationId?, sequence?, actorDeviceId?, traceId, payload}`. Payload is an
allowlisted minimal metadata or ciphertext object; no decrypted text. Examples:
MessageAccepted, MessageDelivered, MessageRead, ConversationCreated,
ParticipantAdded/Removed, DeviceAdded/Revoked, RoomCreated/RoomMembershipChanged.
Event delivery is at-least-once; consumers deduplicate. Internal sensitive metadata
is not automatically exposed to all consumers. Notification consumer retries
independently after persistence; provider success cannot determine SENT.

Maintain minimum/current/supported protocol versions in server configuration.
Reject security-critical unsupported versions with upgrade-required; support
compatible additive fields while rejecting unknown critical fields. Changing field
meaning increments eventVersion. Bind routing/security-critical envelope values
to the selected protocol's authenticated framing, not custom signatures. A replay
under another conversation/device must fail. TLS reconnect does not reset replay
protection. Publish deprecation policy and canary compatibility before rollout.

## 15. Supervision, deployment and client lifecycle (sections 72-95)

Proposed independently deployable OTP application topology:

```text
Conversations.Application (supervisor)
  Endpoint / socket connection supervisors
  AuthDeviceAdapter (bounded verification/cache, revocation)
  Phoenix.PubSub and Presence
  PersistenceClient (bounded pool, durable service adapter)
  FanoutSupervisor (bounded leased-outbox workers)
  Telemetry / health
```

One failing connection terminates/restarts its own process, not the node. Fan-out
workers use durable leases and retry budgets; restart intensity prevents loops.
No permanent process for every historical conversation. Optional active-room
coordinators expire when idle and do not own canonical sequence. Membership/device
limits are configuration, independent from envelope schema. Commit one durable
fan-out obligation before ACK; expand large-room recipients in bounded authorized
batches against the relevant membership version, never unbounded synchronous sends.

Use canonical deployment secret injection, least-privilege DB/object credentials,
rotation and separate production/staging credentials. No secrets in manifests,
repository, query strings or debug output. Central redaction forbids bodies,
plaintext attachments, tokens, private keys and recovery data in logs/traces.
Disable crypto debug features. Trace ingress -> auth -> persist -> ACK -> outbox
-> delivery -> push using random IDs, not content-derived trace identifiers.

Deploy independently of Feed. Readiness requires persistence connectivity and
supported schema; optional push/cache outages do not make messaging unready.
Drain rolling nodes: refuse new connections, signal resumable reconnect, finish
bounded in-flight commits, release leases and stop. Do not ACK an aborted commit.
Use expand/backfill/validate/read-cutover/contract migrations, compatible with
old/new nodes and supported clients. Delay destructive schema removal until
retention/rollback windows and version telemetry justify it.

Browser/PWA must survive background suspension, service-worker updates and closed
tabs. Do not depend on service worker owning a permanent socket. Multi-tab sends
coordinate crypto state via one reviewed writer/transaction model; broadcast
notifications do not become a key store. On resume authenticate, unlock keys,
reconcile outbox and replay; do not trust cached auth after account switch.
Native clients handle process death, locked OS keys, Wi-Fi/cellular transitions and
iOS background limits. Push is a wake hint, not delivery evidence. Coalesce
receipts, expire typing and tune heartbeat/reconnect jitter through measured
mobile energy/network tests. No background polling storm.

## 16. SLO and capacity measurement plan

No measured BEAM baseline exists. Numeric targets and autoscaling thresholds are
UNSET until instrumented prototype/load results and product expectations agree.
For each SLO record cohort, window, numerator/denominator, percentiles, error
budget and owner; separate offline time, provider outage and server acceptance.

| Measurement | Definition / evidence required |
| --- | --- |
| Local responsiveness | Send tap to locally durable visible pending item, including low-end device/storage failures |
| Accept latency | Ingress to committed ACK; failed/rejected attempts counted separately |
| Delivery latency | Committed acceptance to eligible online recipient's durable receipt; no subtraction of unsynchronized client clocks |
| Resume | Reauthentication to complete contiguous replay through captured high-water mark |
| Durability/loss | Accepted IDs reconciled against recovered primary and device history after fault tests; objective zero lost accepted messages |
| Duplicate rate | Duplicate canonical logical IDs versus retries; transport duplicate events reported separately |
| Availability/upload | Valid requests accepted within agreed budget; finalized encrypted uploads over attempted uploads |

Required telemetry names: active_connections, connections_per_node,
connection_open_rate, connection_failure_rate, message_accept_rate,
message_accept_latency, message_persist_latency, message_delivery_latency,
message_failure_rate, duplicate_suppression_rate, reconnect_rate,
resume_success_rate, offline_queue_success_rate, read_receipt_latency,
presence_event_rate, fanout_latency, queue_depth, backpressure_state,
BEAM_memory, BEAM_scheduler_utilization, BEAM_process_count,
database_pool_usage, database_latency. Use bounded labels, never per-message IDs
or private content as metric dimensions. Traces/logs use separately controlled IDs.

Load matrix includes sockets/churn, direct and bounded-room fan-out, offline
recipients, reconnect storms, receipts, typing and encrypted media metadata.
Soak must outlast short benchmarks and test memory/process/mailbox/connection/DB
pool growth. Fault matrix: process/node crash, DB connection loss/primary failover,
LB reset, cache outage, push outage, storage outage, delayed service links and
interrupted uploads. Record accepted IDs before faults and reconcile afterwards.
Run destructive fault tests only in isolated staging with synthetic accounts.
Measure RAM/connection, CPU/message, writes/second, storage/bandwidth growth and
fan-out cost. Scale using scheduler, memory, queues and DB limits, not CPU alone.

## 17. Future compatibility and retention (sections 96-105)

Calls are a separate future media/signalling subsystem, never ordinary message
fan-out. Typed references allow Product/Reel/Short/Collection/Profile/Story without
schema tied to one content kind. Future business endpoints need explicit delegated
staff/device membership, audited access and revocation with key epoch changes;
display name does not verify business identity. No support-desk product now.
Future message-request states REQUESTED/ACCEPTED/DECLINED/BLOCKED are distinct
from message delivery and gate unsolicited traffic. No auto-accept from a send.
Pins/stars/bookmarks are derived user/room state, not message identity mutations.
Disappearing messages are best-effort removal policies, not guaranteed erasure.
User-controlled exports decrypt at authorized endpoint after confirmation; server
export supplies only permitted ciphertext/metadata, not universal plaintext.

| Data class | Required retention/deletion semantics; duration not yet approved |
| --- | --- |
| Ciphertext/events | User/history policy plus minimum documented replay window; deletion leaves necessary anti-replay tombstones |
| Delivery metadata | Compact into authorized monotonic positions; prune obsolete per-event receipt data |
| Presence/typing | Ephemeral bounded TTL, no permanent event log |
| Security logs/reports | Access-limited, purpose-specific expiry and explicit legal-hold process |
| Attachments | Reference/ownership-aware lifecycle; sweep incomplete/orphan uploads and expire download grants |
| Deleted accounts | Revoke sessions/devices and routing immediately; delete owned server data under policy, separate other participants' copies |
| Backups | Document rotation/expiry and deletion propagation; do not promise instant removal from immutable backups |
| Commerce records | Canonical transaction/legal retention remains in owning domain, not deleted by removing chat |

Account deletion cannot rewrite peers' already decrypted history. Separate identity
pseudonymization, retained security evidence, transaction records and remaining
encrypted peer copies in user-facing policy. Do not set blanket perpetual retention.

## 18. Threat register and freeze gates (sections 106-109)

| Asset / threat actor capability | Mitigation required | Residual risk |
| --- | --- | --- |
| Content: network observer / MITM | TLS plus verified endpoint protocol identity and authenticated envelopes | Traffic timing/size remains visible |
| Content/identity: malicious server or insider | Endpoint keys, device verification/transparency, minimal access and audited service grants | Metadata censorship/availability and compromised web delivery remain risks |
| Keys/history: stolen device or key compromise | Protected local state, lock policy, revoke/rotate, protocol recovery | Already decrypted history and ongoing endpoint compromise cannot be recovered by server |
| Message integrity: replay/downgrade attacker | Logical IDs, protocol replay defenses, authenticated context and enforced minimum versions | Legacy clients require explicit upgrade, not silent fallback |
| Room secrecy: malicious/removed member | Membership authorization, protocol epoch update, no future envelopes to removed device | Members can copy/share content already received |
| Media: tampered object or storage leak | On-device authenticated encryption, authorized access, safe decode | Ciphertext size/access patterns; endpoint decoder vulnerabilities |
| Access: stolen credentials/bot/spammer | Canonical auth/device approval, quotas, requests, blocks, reports | Account takeover and denial of service need continued operations |
| Persistence: database leak | Ciphertext-only new path, minimized metadata, least privilege | Existing plaintext history remains exposed; migration cannot retroactively protect it |
| Recovery: malicious backup/rollback | Reviewed user-secret backup or verified transfer, freshness and revocation checks | Lost secrets may irrecoverably lose history |

Phase 0: targeted source audit completed for the paths cited here; authenticated
runtime, secrets configuration, storage policy and deployment capacity remain
UNVERIFIED. Phase 1: REVIEW CANDIDATE, not frozen: crypto/vendor/audit, recovery,
retention, protocol version bounds and measured SLO decisions need approval.
Phase 2 BEAM, phase 3 E2EE, phase 4 encrypted media, phase 5 multi-device/recovery
and phase 6 acceptance are NOT IMPLEMENTED by this patch. Do not code around
these unresolved security gates. Independent security review must cover protocol,
library integration, keys, recovery, multi-device, groups, media, telemetry,
notifications and backups before a public E2EE claim. Full product features follow
foundation acceptance, not this document's existence.

## 19. Verification of this documentation patch

- `npm run test:message-pages`: PASS, 18/18 on 2026-09-22.
- No production code, dependency, schema or generated asset changed.
- Full CI was not rerun for this documentation-only patch. The preceding
  `15170f7` code release passed full CI, including 135 browser tests; those results
  are not evidence for the proposed Phoenix/E2EE system.
- No crypto interoperability, BEAM load, security audit or new-service deployment
  was performed. Acceptance tests in this document remain requirements.

## 20. First runtime increment: optional durable retry acceptance

Implemented after the documentation baseline, on 2026-09-22:

- PostgreSQL migration `2026092201_message_idempotency` adds only a ledger table.
  No message history rewrite or destructive migration is required.
- Authenticated `POST /api/messages` optionally accepts `Idempotency-Key` header
  or `clientMessageId` body (16-120 ASCII alphanumeric/underscore/hyphen characters).
  Supplying both requires equality. Invalid values return 400.
- Current scope is `(authenticated sender, clientMessageId)`, intentionally
  sender-wide to prevent reuse across recipients. This is a LEGACY bridge, not
  the future cryptographic device identity protocol. Keys must be unique for each
  intentional send and reused only for retry of that send.
- Normalized request content is hashed before server product enrichment. A
  sender-scoped transaction lock and primary key serialize duplicate acceptance.
  Message, notification, ledger and NOTIFY are in the same transaction.
- Matching retry returns HTTP 200 with the original canonical message, including
  current persisted read/delivery fields; it does not emit another notification,
  domain action, audit-send or realtime event. Existing receipt semantics are
  unchanged and still do not prove device delivery.
- Changed normalized request under the same key returns 409
  `message_idempotency_conflict`. Deleted message returns 410
  `message_retry_deleted`, without recreating the message. Current authorization,
  blocks and product validation still apply; a retry does not bypass revoked access.
- The ledger retains IDs/hashes, not copied plaintext bodies. No message FK cascade
  or timed pruning can erase the deletion tombstone. Sender account deletion
  cascades its ledger; account re-creation and global immutable identity remain a
  separate platform policy. No automatic ledger expiry is enabled in this increment.
- New keyed sends remain subject to burst limits. Accepted retries reconcile
  before content/burst checks in the transaction; generic HTTP rate limits remain.
- Legacy clients without keys retain existing behavior. Non-PostgreSQL adapters
  return 503 `message_idempotency_unavailable` for keyed sends rather than pretend
  durable idempotency. No frontend client or offline queue is switched in this patch.

Focused persistence/key tests: 6/6 PASS. Executable SQL test covers matching retry,
payload/recipient conflict, ownership, block override, notification deduplication,
delete tombstone, rollback and replay beyond the old content-duplicate window.
PGlite fixtures stub advisory locks and NOTIFY: they do NOT prove multi-connection
PostgreSQL concurrency or actual cross-node delivery. Those remain staging gates.

Rollout: normal backend migration before accepting requests; no frontend rebuild
needed. Rollback may restore previous backend code but must keep the additive
ledger. Do not enable clients requiring durable retries until backend capability
is verified. This increment does not complete phases 1-6 or E2EE acceptance.

### Runtime increment verification, 2026-09-22

- Final integration suite: 200/200 PASS; focused message persistence: 6/6 PASS;
  trusted/untrusted-origin HTTP preflight: 1/1 PASS.
- Message pagination, commerce outcomes, localization, module synchronization and
  frontend suites passed in the final CI run.
- Full `npm run test:ci` is NOT GREEN: final browser run 133/135. Failures were
  Settings restoration (`app.spec.js:644`, profile card hidden) and desktop detail
  navigation (`app.spec.js:1899`, forced click outside viewport).
- Earlier complete run also had 133/135, with different failures: optional Home
  product showcase absent and passive view count 5 versus expected 4.
- Both pairs passed three independent repetitions each (12/12 combined), with
  no browser test edits, skipped assertions or timeout increases. Intermittency
  is observed; exact root causes and production impact remain unproven.
- An intermediate CORS source-contract assertion failed after adding the intended
  header. Its exact allowlist expectation was updated; the real HTTP preflight
  test additionally enforces origin restrictions. No auth restriction was removed.
- No Home/Settings/frontend behavior was modified. Release is a backward-compatible
  optional backend capability under the user's standing release authorization,
  NOT a claim that all regressions or the complete foundation are resolved.
- Production migration completion, authenticated replay/concurrency, BEAM/E2EE,
  device receipts, durable replay outbox and secure offline client remain unverified
  or unimplemented. Render auto-deploy is expected on push; Live must be verified
  independently, not inferred from a generic health response.

## 21. Read/delete reconciliation increment (2026-09-24)

Sections 9, 50, 60, 62-63, 67, 78 and 91 receive an incremental implementation:
canonical read/delete mutations now commit an owner-scoped replay resync barrier
and a content-free cross-node wake-up in the same PostgreSQL transaction. The
existing SSE browser reconciles canonical message/notification state before
advancing its cursor, including a follow-up for changes racing that refresh.
See `message-replay.md` for compatibility, migration and rollback contracts.

This preserves the legacy sender-only deletion policy and account-level read
semantics. It does not add per-device acknowledgements, stronger deletion claims,
read-receipt privacy preferences, a durable notification worker, or encryption.
Tests cover unauthorized/repeated mutations, transaction rollback, owner isolation,
checkpoint races, and visible browser receipt/deletion reconciliation. Executable
SQL uses PGlite; actual multi-connection locking and LISTEN/NOTIFY failover still
need PostgreSQL staging proof.

The user-supplied authenticated Render probe for the earlier replay release
confirmed capability, checkpoint/resume reads and migration readability. It
explicitly reported `writeAndReconnectProven: false`; it does not verify this
new migration. Rerun the updated probe after deployment to verify readability.

Remaining foundation work: freeze reviewed protocol/device/recovery choices;
implement isolated BEAM realtime and its platform authentication contract;
integrate an audited E2EE implementation and protected endpoint state; implement
private encrypted media; multi-device/recovery; and measured load, failure,
security and production acceptance. These phases remain incomplete.

### User-reported runtime verification

After `e36ffb9`, the user supplied the authenticated Render probe with
`stateChangeReplayEnabled`, checkpoint/resume and migration readability all true.
The probe still reports `writeAndReconnectProven: false`: it is read-only.
The user subsequently tested two-account messaging/reconnect, reported broken
Inbox actions, and confirmed all actions worked after `301913e`. Record this as
user-reported functional acceptance, not independently observed multi-node
failover, load or security certification.

## 22. Active SSE session authorization

The legacy SSE route previously authenticated once at connection open and sent
unchecked heartbeats thereafter. An already-open connection could outlive logout,
session revocation/rotation, expiry or account restrictions.

The existing transport now validates the original token and owner against
primary PostgreSQL session/current-user state before each queued event. It does
not use the read replica, a cached user snapshot, or a bearer token in the URL.
Existing restricted-account and staff rules also apply. Legacy file-backed mode
re-reads canonical sessions/users for compatibility.

Idle connections revalidate on the 25-second heartbeat. Authorization errors or
checks exceeding five seconds close the connection without writing the queued
event. Event checks are serialized per connection, with at most 32 queued events
and 256 KiB of encoded pending data; slow socket backpressure also closes the
stream. No plaintext queue or token is written to telemetry or persistent logs.
The existing browser reconnect/replay remains the recovery path. No new browser
transport or schema migration is required.

This is current-session authorization at the delivery boundary, not a claim of
instant distributed revocation or device-bound E2EE. A revocation racing the
completed authorization read cannot retract already-written bytes. Idle closure
is bounded by heartbeat plus the check deadline under a responsive event loop.
Each event incurs a primary indexed lookup per receiving connection; benchmark
that cost before a large rollout. Check deadlines stop stream delivery but do not
cancel an already-running database query; database pool timeouts still apply.

Targeted tests passed 133/133: real HTTP logout denies the old stream while
another session receives; executable SQL excludes wrong-owner/expired/revoked
tokens and bypasses replicas; isolated stream tests cover failed/hung checks,
late completion, ordering, queue bounds, heartbeat and socket errors. The first
HTTP fixture hit the existing signup rate limit; it was moved into an isolated
test server without changing production limits.

Production two-session revocation remains a separate authenticated check.
BEAM, audited E2EE, device enrollment/recovery and security/load sign-off remain
pending; this increment does not freeze the unresolved protocol choices.

Browser verification also exposed a context race: an Inbox refresh could clear
an explicitly opened product chat while the underlying Inbox remained in list
mode. `syncActiveChatContext` now preserves an open modal's chosen context; the
product-finder browser test explicitly refreshes messages before checking seller,
product and canonical order cards. This small frontend fix requires publishing
the frontend assets, without redesigning chat.

The synthetic pagination fixture now disables its unrelated SSE transport: its
mock conversation rows have no corresponding replay journal. Dedicated real
reconnect/state-change tests remain enabled. The pagination case passed three
consecutive runs after fixture isolation; no pagination assertions were removed.

Final validation: `npm run test:ci` passed with realtime 6/6, message
paging/replay 34/34, commerce 71/71, frontend core 144/144, additional frontend
47/47, integration 202/202 and Playwright 141/141. Product-finder context retention
also passed three consecutive focused runs. Localization and module-sync gates,
static build, Worker deployment dry-run and `git diff --check` passed.

## 23. Opt-in runtime session revocation evidence

`scripts/verify-message-session-runtime.js` adds an explicitly authorized logout
probe for two sessions of one test account. It checks clean idle-stream closure,
401 for the revoked token, and a still-authenticated control session with a live
heartbeat. It sends no messages and cannot prove cross-node failover or delivery
revocation under load. See `message-session-runtime.md` for consent, hidden token
prompts, cleanup and interpretation. The read-only replay verifier is unchanged.

This is verification tooling, not a new messaging service or security protocol.
No migration, frontend rebuild or production runtime change is required. A
production result still needs locally supplied test-session tokens; absence of
credentials must not be reported as a passing authenticated runtime test.

Verification: realtime/probe unit tests passed 16/16; the real HTTP fixture
proved both message-after-logout exclusion and the new idle-heartbeat probe.
The first full CI run passed integration 202/202 but browser 140/141: the unchanged
`signed-in home keeps lower rows visible without the hero` test found no product
showcase row within 10 seconds. Its snapshot retained ordinary product cards.
Three isolated repetitions passed without application/test/assertion edits;
intermittency is observed, not a proven root cause or repaired Feed behavior.

The final unchanged `npm run test:ci` rerun passed: realtime/probe 16/16,
paging/replay 34/34, commerce 71/71, frontend core 144/144, additional frontend
47/47, integration 202/202 and browser 141/141. Module synchronization,
localization and diff checks passed. Public production shell/API verification
also passed for the existing deployed build; authenticated Render revocation
remains pending the operator's opt-in probe with test-session tokens.
