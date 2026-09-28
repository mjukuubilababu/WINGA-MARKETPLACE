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

## 24. User-reported idle runtime proof and message probe extension

The user subsequently supplied a successful authenticated Render result from
the session verifier: logout confirmed, revoked stream closed, revoked session
denied, same-account control session alive with a heartbeat, and
`idleRevocationProven: true`. This is user-supplied runtime evidence, not an
independently observed security certification. Message delivery after logout and
cross-node failover were explicitly false/unproven in that result.

The existing verifier now has a separately consented `--send-probe-message` mode.
It requires a third session from another test account, an explicitly selected
receiver username, and canonical durable-retry capability BEFORE mutations.
It logs out only the designated receiver session, sends one labelled synthetic
message with a logical idempotency key, and correlates the control stream with
the exact canonical acknowledgement while rejecting events on the revoked stream.
It neither reads messages as READ nor deletes the synthetic message/history.
Unknown send outcomes remain explicit and are never automatically re-sent.

This is verification tooling only; no production schema, runtime route, browser
transport or crypto change is required. Actual message-mode Render evidence
remains pending the operator's explicit test with fresh sessions. The legacy
file-backed HTTP fixture has no durable-send capability and must refuse this
mode before logout; the existing real HTTP test separately checks a post-logout
message while the correlation/error paths use controlled transport fixtures.
Cross-node failover, BEAM, E2EE and device delivery acknowledgements remain open.

Local verification on 2026-09-24: targeted verifier tests passed 25/25 and the
combined realtime suite passed 31/31. Full CI passed module sync, non-browser
suites and API integration 202/202, but is NOT green: two complete attempts each
ended at 140/141 browser tests. The first timed out clicking `#creation-back`
in the seller Home composer test; the second timed out after the Profile menu
item detached/closed in the empty request-box test. Each failed test subsequently
passed 3/3 isolated repeats without application or assertion changes. This is
intermittent UI-test evidence, not a root-cause fix or a full-CI pass. Resolve the
UI timing failures and obtain a clean full CI run before claiming that gate done.
The final code includes the partial-SSE-byte rejection checked by the second run.
Public production shell/API checks passed for build `20260924170158`; no new
frontend deployment or migration is required for this verification-only patch.

## 25. Message-mode runtime evidence and late session hydration repair

The user supplied a successful authenticated Render message-mode result after
running the opt-in probe with two test accounts: logout and message send confirmed,
revoked stream closed, revoked session denied, control session alive with a
heartbeat, and `messageDeliveryRevocationProven: true`. Together with the earlier
idle result this covers both observed revocation scenarios. In message mode,
`idleRevocationProven: false` distinguishes the scenario, not a regression.
This remains operator-supplied evidence; `crossNodeFailoverProven` is still false.

The earlier Home composer and Profile menu timeouts were reproduced deterministically
by holding `/api/auth/session` until after opening each surface. Both tests failed
before the patch: `loginSuccess()` treated background hydration as a fresh login,
closed the header menu, cleared the upload draft and navigated the composer Home.
The menu renderer also replaced all buttons on passive updates.

Session runtime now explicitly permits retaining these interactions only when
the cached and restored username and role match and the role is not staff.
Login retains an active eligible upload view and its draft instead of resetting it;
new login, identity/role changes and forced staff navigation keep existing cleanup.
Header menu rendering retains nodes when action/permission structure is unchanged,
updating labels/counts in place; identity/structural changes still rebuild it.
No auth endpoint, authorization policy, messaging transport or database schema changes.

Regression coverage holds the actual restore request on desktop and mobile and
checks menu visibility, node identity, keyboard focus, changing unread labels,
image/caption/price drafts, details step and Back. Unit tests cover matching identity,
different identity, role changes and staff restores. Existing assertions and timeout
limits remain intact; no forced clicks, retries or test skips were added.

The first full run after this repair passed the new regressions and original
Home/Profile failures, but finished 144/145 because an existing desktop
product-detail navigation test used `force: true` on an off-viewport continuation
card. The matching desktop/mobile tests now use normal Playwright clicks with
actionability checks; all outcome assertions remain unchanged. Those two tests
passed six isolated runs (three per viewport). This is test interaction hardening,
not a claimed change to product-detail runtime behavior.

Final verification: `npm run test:ci` passed in full, including realtime 31/31,
paging/replay 34/34, frontend core 144/144, integration 202/202 and browser 145/145.
Module synchronization, commerce, additional frontend and localization gates also
passed. The passing full run used the final patch with normal actionable clicks,
not a retry/skip configuration. Earlier failures above remain recorded as evidence.

Next production proof remains cross-node reconnect/failover. It requires an
explicitly identified isolated staging environment or an approved multi-instance
production exercise with node identity evidence, test accounts and a rollback plan.
Do not terminate an arbitrary production instance or infer multi-node proof from
ordinary SSE reconnect. After a controlled node loss, verify canonical message IDs
are recovered once by replay for the valid session and denied to the revoked session.

## 26. Listener reconnect gap

The browser's existing replay covered SSE reconnect, but not a PostgreSQL
`LISTEN` interruption while an SSE stream remained open. A successful listener
resubscription now prompts authenticated live clients to run bounded canonical
replay; it sends no message body or private metadata in the prompt. Unit tests
cover the listener's recovery signal and browser consumer. This is a Phase 1
transport-recovery improvement, not a Phase 2 BEAM deployment or a cross-node
runtime proof. The remaining contract decisions and later phases above stay open.

Local verification on 2026-09-25: `npm run test:ci` passed, including module
sync, PostgreSQL/integration tests 203/203, and browser E2E 146/146. The
listener-recovery and browser replay unit tests passed. Production listener
recovery and controlled cross-node failover are still unverified.

## 27. Controlled cross-node verifier prepared

The ops-only SSE node evidence and the two-stage verifier are described in
`docs/message-cross-node-failover.md`. Preflight is non-disruptive and cannot
claim failover. The exercise requires an explicit operator-controlled drain,
two simultaneously observed same-commit instances, one test message and a
single post-failure replay reference. No production node was drained while
preparing this verifier; live cross-node acceptance remains pending.

## 28. Disk migration dependency and private-reference diagnostics

On 2026-09-27, work resumed at the cross-node prerequisite. The operator's
public media copy result recorded 357 verified objects without rewriting URLs
or removing the Render disk. The remaining reported blockers were 238
unclassified files and 19 missing embedded paths. A public R2 copy alone does
not make this API deployment stateless or prove multi-instance availability.

`audit:legacy-uploads -- --diagnose` now separates those blockers by aggregate
reference source and exact stored image-variant family. Private message text
continues to stay in PostgreSQL; the query returns path tokens and fixed source
labels, and CLI output contains counts only. Missing siblings are evidence for
investigation, not automatic replacements or public-copy permission. Existing
copy allowlists, message routes, replay, ordering and visibility are unchanged.

The disk remains required. The diagnostic needs an operator run on Render;
local fixtures cannot establish the current production file inventory. Private
preservation, missing-reference recovery, serving-path migration, disk removal,
two-instance preflight and controlled cross-node proof remain pending. No node
was drained and no private or unclassified file was copied or deleted here.
BEAM, E2EE and the other outstanding foundation gates remain explicitly open.

Local verification on 2026-09-27: focused audit/copy tests passed 17/17;
`npm run test:ci` completed with exit code 0, including 220 integration tests
and 147 browser tests. Realtime, message pagination, commerce outcomes,
localization, frontend and generated-bundle checks also passed. These local
results do not establish the production disk inventory or cross-node failover.

## 29. Private preservation tooling (runtime execution pending)

The operator subsequently ran diagnostics on Render at e6a4a3d. All 303 product
references existed; the 19 missing paths belonged to message product-item
snapshots, not message text. The 238 unclassified files had no known references
in the inspected sources (78 complete variant families and four standalone
files). This evidence does not authorize public copying or deletion.

`backup:legacy-private-media` now provides dry-run, private-bucket preflight,
explicit conditional backup and independent R2-only manifest verification.
It preserves existing upload settings, routes, disk and database. No bucket was
created or live private backup executed during implementation. Operator bucket
creation, separate credentials, isolation confirmation and runtime copy/verify
are required; see `docs/legacy-private-media-backup.md`.

The private manifest preserves names, sizes and hashes for recovery. Cross-node
proof, disk detachment, authorized serving-path migration and recovery of the
19 already-missing references remain unverified. No foundation gate is closed
merely because this backup CLI exists.

Local focused audit/public-copy/private-backup tests passed 34/34. The first
full CI run passed backend checks and 146/147 browser tests, but the existing
`signed-in home keeps lower rows visible without the hero` test could not find
a showcase image row within 10 seconds. Three isolated repetitions then passed
without changing code or assertions. The cause is not established; preserve
this intermittent Home-test observation rather than claim it was fixed by
backup tooling. No Home implementation or test assertions were modified.

The subsequent complete `npm run test:ci` run passed with exit code 0: private
backup 17/17, realtime 38/38, message pages 35/35, commerce outcomes 71/71,
frontend checks, integration 220/220 and browser 147/147, including the unchanged
Home showcase test. Live bucket privacy checks, backup and independent R2
verification remain pending operator configuration and execution.

## 30. Private backup verified; isolated R2 public-read canary

The operator supplied successful production `check-private`, `backup-private`
and independent `verify-backup` results. Backup ID:
`3e248d86f02a08f01bbcc519f0bd79836ead9c6ee92a261bb3d2393520d64019`.
All 238 manifest entries and 15,202,912 bytes verified from R2 without the
source disk. No files were restored, database changed or disk removed. This
supersedes section 29's pending runtime backup status, not its other gates.

The next audit found disk-bound image serving/repair/writes and a Worker cache
that bypasses origin checks. A default-off `/api/media/legacy-public/` canary
therefore proves primary-authorized R2 reads independently of the production
URL/cache paths. It denies restricted/unknown media, verifies remote checksums,
isolates R2 failures and explicitly labels authorized disk fallback. A runtime
probe rejects that fallback as evidence of R2 success. No app URL was switched
and no Worker cache policy was changed. See `docs/legacy-public-media-read-canary.md`
for evidence, rollout, rollback and the remaining cutover gates.

Local canary tests passed 13/13. The first full CI run passed integration
220/220 and browser 146/147. The existing `backend appended Home page is
rendered into the visible feed stream` test observed request pages `[1,2,2]`
instead of `[1,2]` after its rendering assertions passed. Three isolated
repetitions passed without code or assertion changes. The cause of the extra
request remains unestablished; this patch does not claim to fix it. No Home
implementation or existing browser test was modified.

A read-only public production API check confirmed cursor pagination and eligible
legacy image samples starting on page two. It did not test the new canary,
change media URLs or prove disk independence.

The subsequent full `npm run test:ci` completed with exit code 0, including
canary 13/13, integration 220/220 and browser 147/147 (6.6 minutes). The unchanged
pagination test passed in that complete run. `git diff --cached --check` also
passed. Canary production authorization/R2 reads remain pending deployment,
flag enablement and the operator's `verify:legacy-public-r2` result. Physical
device checks, serving cutover and cross-node failover are not proven here.

## 31. Production public-read sample passed; full inventory verification

Operator evidence from Render commit `2879d549f03c4b48f820605b60348b3d02ebc109`
confirms the HTTP R2 canary: 3 images, 181,240 bytes, `r2ReadProven: true`,
`legacyBytesMatch: true`. This supersedes section 30's pending sample execution,
not its pending serving-path cutover, physical-device or cross-node gates.

The next CLI, `npm run verify:legacy-public-r2:all` in backend, compares every
current approved-public legacy candidate and stored variant using primary
authorization, bounded local reads and metadata-verified direct R2 GETs. It
fails closed on changed selection, source bytes, permissions or unavailable
storage; it cannot substitute disk fallback for R2. It reuses existing audit
and canary helpers and runs PostgreSQL in read-only mode without migrations.
No existing serving route, Worker, UI or media reference changes in this patch.

The disk-coupling audit remains unchanged: `resolveProductImageForDelivery`
tests local existence; `repairNormalizedProductImageState` drops missing local
references; `normalizeProductImages`/metadata/cleanup retain disk assumptions;
`worker.js:handleImageCache` still serves cached public bytes before origin.
These need coordinated delivery, cache, private-media and writer changes, not
just successful checksums. Full-inventory runtime results remain pending the
operator command; `diskRemovalReady` and `servingPathSwitched` remain false.

Focused media verification tests passed 25/25. The first complete CI run passed
integration 220/220 and browser 146/147. The existing `load-more commits its
primary page before background runway prefetch` test observed requests
`[1,2,3]` where it expected `[1,2]` before its second append call. Three isolated
repetitions passed unchanged. This is an intermittent assertion observation,
not a demonstrated media regression or a fixed Home defect. No Home runtime
or existing browser assertion was changed; retain this risk for separate triage.

The second complete CI run also exited 1 with browser 146/147: prefetch passed,
but `lost publish response reconciles the posted reel without another upload
or duplicate post` observed zero writes before its 25-second timeout. That
unchanged photo-reel test then passed three isolated repetitions. These results
do NOT constitute a green complete CI run or a fix for either intermittent
failure. Both full runs passed integration 220/220 and focused media tests
25/25. Existing runtime and browser-test files have an empty diff in this patch.

The new CLI also rejected `--copy-public` with `UNEXPECTED_ARGUMENTS` before
storage/database initialization. `git diff --cached --check` passed. This patch
ships only the manual read-only CLI, command/test wiring and documentation;
it is not invoked by API startup or production traffic. Full CI stability,
production full-inventory execution and all serving/disk cutover gates remain
explicitly unverified. Do not describe the entire migration or spec as complete.

## 32. Full public inventory verified; reversible product reference cutover

Operator evidence from Render commit `a48cc4256a70cc42df34526536514fdbf7755133`
verified 357/357 files and 43,063,737 bytes: inventory stable, authorization
rechecked, full public inventory verified. This closes section 31's pending
full-inventory execution only. It did not switch serving or remove disk.

The next implementation adds an operator-only, default-dry-run product IMAGE
reference cutover using the same public CDN URL format as current R2 uploads.
An additive schema migration creates its durable apply/rollback journal; no
products change on deployment. Explicit apply requires the reviewed plan ID,
fresh local/R2/CDN byte verification, current primary authorization, bounded
table locks, media-field comparisons and atomic journal/write commit. An
uncertain COMMIT acknowledgement is reconciled by repeating the same plan ID.

Rollback verifies retained source hashes and rejects later media/ownership or
visibility changes. Unrelated price/views/likes survive either direction.
Public CDN visibility-revocation limitations, historical URLs, private writers,
Worker caching and missing chat image recovery remain separate pending work.
See `docs/legacy-public-media-cutover.md` for exact scope, operational write-lock
risk, rollout, rollback, and post-apply acceptance. Product cutover has NOT been
executed in production by this implementation turn.

Verification for this patch: `npm run test:ci` passed module synchronization,
private backup 17/17, legacy media 39/39 (including 14 cutover tests), the other
Node suites 38/38, 35/35, 71/71, 54/54, and integration 220/220. Browser E2E
finished 146/147: `mobile header auto-hide does not reflow the feed container
while users scroll` at `tests/e2e/app.spec.js:2373` expected `search_only` but
observed `hidden`. The unchanged test passed three isolated repetitions. This
does not constitute a green full CI run or a fix for that intermittent failure.
No Home/header, browser-test, Worker or normal API-route code changed here.
Production dry-run/apply, real PostgreSQL lock timing under traffic, CDN/UI
acceptance after cutover, and all disk-detachment gates remain pending.

## 33. Production public reference cutover applied; audit retained dependencies

Operator output from `f6c113096e8bc1d2b8679d09640277c20cda37ee` confirms plan
`82291d13ea32112820a8a9e86ba54962cbecc37b727961530b506870b7572a8c` applied to
93 products / 303 references after all 357 source/R2/CDN files were verified.
`publicDeliveryVerified` and `databaseChanged` were true; disk/file deletion and
disk-removal readiness were false. The user reported that images display
correctly. This supersedes the pending production apply in section 32, not the
remaining disk-independence, lock-load, cache/privacy or cross-node gates.

The existing audit now optionally accepts `--post-cutover` alongside `--diagnose`.
Applied journal evidence identifies retained public files even when canonical
URLs no longer contain `/uploads/`. Structured chat snapshots are classified
into exact journal candidates, different current images needing review, missing
products, restricted products, no verified replacement and invalid references.
It reads no message bodies, exposes only aggregates, performs no repairs and
does not claim the 19 missing historical files recovered. Database reads use
a repeatable-read read-only transaction. Malformed JSON, missing schema and
bounded scan failures remain distinguishable from empty results.

The code audit found legacy local writes in product normalization and the
unconfigured-R2 fallback, local image delivery/repair/metadata/cleanup, and Worker
legacy cache dependencies. Current profile/identity upload validation accepts
data URLs; a current private-media disk writer was not proven and must not be
assumed. No server routes, frontend or Worker code change in this patch.
See `docs/legacy-post-cutover-audit.md` for the command and remaining decision gates.

Local verification: module sync, private backup 17/17, legacy media 50/50,
other Node suites and integration 220/220 passed. Full CI failed two of 147
browser tests in unchanged Home pagination code: extra page-3 request at
`pagination-bootstrap.spec.js:556`, and loadedCount 13 versus 12 at line 762.
Both passed three isolated repetitions each (6/6); these are not fixes and do
not constitute a green full CI run. Production post-cutover audit is pending.

## 34. Post-cutover audit proved; legacy URL compatibility prepared

The supplied production audit from `35c62d2` supersedes section 33's pending
audit execution: all 93 applied product entries were unchanged, all 357
journaled files remained on disk, and 238 files were outside the journal.
There were 29 chat snapshot items: 7 exact journal candidates and 22 items
referencing 19 unique missing images, with the corresponding products absent.
This is not evidence that the missing originals can be reconstructed.

An opt-in backend compatibility layer now serves known public legacy URLs from
R2 without rewriting messages or their replay/version state. Primary journal
and current product/owner/visibility checks happen before and after remote I/O;
private/identity overlap, corruption, missing schema or authorization errors fail
closed. Known mappings never fall through to disk. Unknown legacy URLs and all
routes with the flag off retain existing behavior. No new migration is added.

`verify:legacy-upload-compat` checks all applied journal files through direct
origin HTTP, requires matching checksums and R2/no-store headers, samples proxy
and HEAD behavior and rechecks journal stability without reading source disk.
Production activation/verification is pending. Worker legacy caching and public
CDN revocation limitations remain unresolved, as do disk detachment and actual
cross-node failover. See `docs/legacy-upload-compatibility.md` for rollout and
flag rollback; never interpret origin proof as end-to-end edge privacy proof.

Verification: `npm run test:ci` passed in full with media 61/61, private backup
17/17, realtime 38/38, paging/replay 35/35, commerce 71/71, additional frontend
54/54, integration 220/220 and browser E2E 147/147, plus module synchronization,
localization and frontend-core checks. Eleven new compatibility tests include
real isolated backend GET/HEAD and proxy behavior with the flag off and primary
unavailable, SQL authorization and an HTTP R2 fixture without source-disk reads.
No unrelated browser assertions were changed. Production flag activation,
origin verification, physical-device chat checks and remaining gates are pending.

## 35. Legacy origin proof and Worker cache correction

Operator evidence at `66f1e3c5eb9138b1ddb3770200883cac92db95cc` proves all 357
legacy files / 43,063,737 bytes through Render HTTP with matching R2 bytes,
stable manifest, proxy sample, no observed disk fallback, and no verifier disk
reads. This supersedes section 34's pending origin runtime proof, not its other
remaining gates. No database/files were changed by the verifier.

The Worker now forwards `/uploads/*` and `/__winga-image__` without consulting
old edge cache or forcing public TTL. GET/HEAD, origin error statuses and R2
proof headers survive; failures cannot become a cached or placeholder 200.
The existing verifier has opt-in frontend edge-policy checks. Nine focused
tests pass. Full confirmation CI passed, including media 70/70, integration
220/220 and browser E2E 147/147. The initial run had one unchanged mobile
search-focus failure (146/147), followed by three isolated passes and the full
green confirmation; no UI fix is claimed. Code commit `ab480e5` was pushed and
Worker version `edc67616-6b7d-497b-b107-b934b5eed6ca` deployed. Production
three-image smoke passed through wingamarket.com: 200,854 bytes, R2/edge policy,
GET/HEAD/proxy/repeated-read checks, missing-image 404 and Home HTML 200.
This sample is not the full primary-journal inventory proof; the 357-file edge
verification still requires the documented Render Shell command.
See `docs/legacy-media-edge-policy.md` for scope, commands and limitations.
Direct public CDN access and previously downloaded/browser-cached copies are
not revoked by this policy. Disk detachment and cross-node proof remain false.

## 36. Full edge inventory proof blocked on an unidentified HTTP response

The operator ran the edge verifier at Render `ab480e5`; it stopped with
`COMPAT_HTTP_FAILED`, without enough status/phase evidence to identify cause.
A repeat three-image public smoke passed, but does not prove all 357 journal
files. The read-only verifier now exposes privacy-safe failure diagnostics and
an opt-in, bounded same-request comparison against the fixed API origin.
No retries skip a failure, no permissions are relaxed and no success is inferred
from the comparison. Media tests 75/75 pass; full CI is not rerun for this
verifier-only follow-up. Run the --diagnose command in
`docs/legacy-media-edge-policy.md`; retain disk and all existing failover gates.

## 37. Full edge inventory evidence and opt-in remote-only preparation

The operator supplied a successful frontend-domain compatibility result for all
357 files (43,063,737 bytes), stable journal, R2 source, proxy sample and edge
policy. Prior proxy HTML 403 responses were matched by exact Ray ID to
Cloudflare Bot Fight Mode managed challenges, not missing R2 bytes. The passing
run followed instructions for a temporary Bot Fight Mode test window; restoration
to ON still requires confirmation. See `docs/legacy-media-edge-policy.md`.

The next code increment adds opt-in `WINGA_MEDIA_STORAGE_MODE=remote_only`,
defaulting to unchanged hybrid behavior. It prevents local media fallback and
artifact writes, preserves historical references, uses PostgreSQL audit and the
existing R2 upload/authorized read contracts, and rejects unsafe prerequisites.
The operations policy endpoint reports configuration, not successful I/O.
See `docs/media-remote-only-mode.md` for tests, rollback and runtime gates.
This does not remove disk, create a new media pipeline, claim historical image
recovery or establish cross-node failover. Production activation remains pending.

## 38. Remote-only production observation and retained-disk audit

Operator evidence from Render `7302396` supersedes section 37's pending
activation: the policy endpoint reported `remote_only`; direct-origin legacy
verification passed 357/357 files and 43,063,737 bytes from R2 without observed
disk fallback. A new product image and historical images were reported visible.
The follow-up read-only audit showed the retained disk unchanged at 595 files /
58,266,649 bytes, 93/93 applied-journal products unchanged, 357/357 journal
files present and 238 files outside that journal. The private backup was
independently reverified at 238/238 files and 15,202,912 bytes without source
disk. Historical missing chat images remain 19 unique files; no recovery is
claimed. See `docs/media-remote-only-mode.md` for the evidence boundary.

This is not disk-detachment or cross-node-failover proof. The post-cutover audit
did not recheck local hashes, remote delivery and private backup atomically;
the private-backup verifier did not examine live source disk. Bot Fight Mode
restoration to ON remains unconfirmed. Preserve the mounted disk until a
separately controlled diskless-instance and authenticated workflow check.

## 39. Combined retained-disk coverage verifier prepared

The new read-only `verify:legacy-disk-coverage` command combines applied
public journal hashes, current product state, local source bytes, public R2
objects, current delivery authorization and the previously verified private
manifest/objects. It rejects
overlap, uncovered files, changed local/remote bytes, invalid bucket privacy
and unstable inventory/database state. Progress and failure output remain
aggregate-only. Tests cover normal and fail-closed paths; the private manifest
callback is released only after full backup verification. See
`docs/media-remote-only-mode.md` for the production command and limitations.
This verifier has not yet been run on Render. It cannot certify disk removal or
two live nodes; the existing production disk remains the rollback source.

## 40. Operator-reported production cross-node exercise (2026-09-28)

The operator reported that the Render disk was detached, the service was scaled
to two live instances, and the direct-origin preflight returned
`preflightReady: true` and `twoInstancesObserved: true`. The first exercise run
stopped at `SCALE_DOWN_NOT_CONFIRMED` without attempting a message send. A second
run, after manual scaling from two instances to one, returned
`crossNodeFailoverProven: true`: one observed SSE stream closed, the original
surviving process was seen again, one synthetic message was accepted, and its
canonical ID appeared exactly once in bounded replay. The operator then
reported restoring the service to two instances and seeing the test message in
both accounts. A separate public API health check returned HTTP 200, `ready`,
with PostgreSQL storage after the exercise.

This is operator-supplied production evidence for the controlled node-loss and
replay scenario in `docs/message-cross-node-failover.md`. Render's instance/event
timeline was not independently retrieved here. It does not prove database
primary failover, live SSE delivery during node loss, revoked-device behavior,
E2EE, BEAM deployment, per-device receipts, or production load capacity. The
earlier sections record their historical state at the time and are not current
status assertions for this one gate.
