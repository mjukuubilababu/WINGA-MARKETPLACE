# Conversations 210-221: 2026-10-08

Scope: sections 210-221 of the preserved Conversations 110-238 specification.
This is implementation and local verification evidence, not production capacity
acceptance or independent cryptographic certification. The operator deferred
physical-device approval and authenticated production load until evening.

## Implementation Matrix

| Spec | Implemented contract | Remaining acceptance |
| --- | --- | --- |
| 210 | Canonical insert records independent immutable acceptance evidence in the same transaction. Direct and Room Sent require matching ciphertext digest, metadata and five enabled guards. Missing/altered records or sequence disagreement emit critical aggregate health alerts. | Observe deployed monitor; historical migration baselines do not prove a client's past ACK. |
| 211 | Original logical IDs and ciphertext survive durable retries; canonical uniqueness and immutable record guards prevent changed-content reuse. Deferred push jobs coalesce by subscription/message. | Physical-device reconnect acceptance. |
| 212 | Transactional canonical sequences, ordered paged replay and prior-epoch history retain their existing native authorization and deterministic ordering. | Physical multi-device convergence and production capacity. |
| 213 | Signed native operations authorize ciphertext, media and Room access. Poll, event history and event ACK require an active session-bound native in the current epoch for protected streams; legacy events retain account authorization. | Authenticated production exercise; no identifier-only access. |
| 214 | Ordinary sends, attachments and recovery store opaque encrypted records. Explicit report evidence and consented seller questions remain documented exceptions, not general plaintext ingestion. | External cryptographic/security assessment. |
| 215 | Revoked natives cannot re-enroll, receive protected events or access future backup roots/pages using a retained marketplace session. Signed session binding gates all recovery CRUD. Existing MLS removal/replacement rotates future membership. | Production native approval/revocation acceptance; no silent identity reset. |
| 216 | Current Room epoch membership and active native/account status govern future delivery; membership freezes retain optional work until acceptance. Removed endpoints are excluded, without claiming erasure of legitimately held old content. | Physical-device Room lifecycle exercise. |
| 217 | Product/inventory/order/payment/delivery systems remain canonical. Chat cards, comparison and consented seller references cannot mutate commerce truth by projecting messages. | Existing commerce production acceptance. |
| 218 | Encrypted sends do not invoke subscription/provider fan-out. Optional notification failures retry a separately processed durable outbox; existing best-effort telemetry cannot invalidate committed Sent. Unimplemented AI/translation/transcription are not silently enabled. | Live optional-service fault exercise. |
| 219 | Push provider payloads stay opaque and generic. Health and failure evidence are aggregate-only; no message text, filenames, keys, fingerprints or private provider errors enter these observations. | External privacy assessment. |
| 220 | Create/encrypt/authenticate/persist/Sent is the acceptance path. Canonical insertion durably schedules optional notification work; the worker fans out after commit. The outbox insert is durable scheduling, not provider I/O. | Authenticated production latency targets and measurements. |
| 221 | Fresh successful sync resumes bounded retained local intents with original IDs. Worker SQL failure retains notification work; transient Room/native freezes defer eligible work for 30 seconds without blocking unrelated later rows. Existing leased delivery/replay/media recovery remains automatic. | Process/network/physical-device soak and production load. |

## Additive Migration And Rollout

- `2026100803_encrypted_message_invariants`: immutable canonical acceptance
  evidence, five SQL guards and a 24-hour optional notification outbox. Existing
  ciphertext is labeled `migration-baseline`; old notifications are not replayed.
- `2026100804_crypto_session_bindings`: exact signed native/session association.
  Existing sessions are not guessed or force-approved. The production session
  schema permits old empty IDs; a composite session FK preserves those rows.
- Existing approved native identities signed re-enroll on normal initialization.
  Opening recovery first performs the same enrollment before root access.
  Pending devices still require active-survivor approval; recovery keys alone
  do not activate a device or restore live MLS ratchets/membership.
- Backend migrations must precede publication of the updated frontend bundle.
  Keep device/MLS/Conversations/media/recovery/multi-device/Rooms and dispatch/push
  gates as configured. CSP and production approvals were not changed here.

## Critical Correctness Investigation

The existing protected Conversations health monitor becomes degraded for
`conversation_accepted_message_missing_critical`,
`conversation_message_evidence_mismatch_critical`,
`conversation_sequence_mismatch_critical`, or missing invariant guards.
The admin aggregate summary carries the same evidence and alert codes.

Do not delete acceptance witnesses, disable guards, rewrite sequences or retry
with a new logical ID to conceal the failure. Preserve the database and release
identity, investigate canonical/evidence divergence in an authorized private
environment and follow the existing incident/backup recovery procedure. A
privileged actor deleting both database and evidence is outside an in-database
tamper-proof guarantee; external backups/operational controls remain essential.

Optional enqueue delay is separately reported as
`conversation_notification_enqueue_delayed`; it is not message loss or a
Delivered/Read acknowledgement. Notification work expires after 24 hours;
canonical encrypted messages and account history do not expire with that queue.

## Verification And Review

- Secure-content Node suites: 159 passed, no skips.
- Disposable PostgreSQL suites: 90 passed, no skips; an additional genuine
  session-token refresh/cascade regression passed separately. The temporary
  cluster was stopped after testing; no production database was used.
- Conversation operations: 58 passed. Focused event ledger, retained send
  intents and legacy push suites: 31 passed.
- Frontend core: 145 passed. All 93 frontend modules match the rebuilt bundle;
  localization checks cover four catalogs with 1632 keys and no new debt.
- Real browser native devices and encrypted HTTP/Rooms/media/recovery: 38
  passed. The additional later-page ciphertext corruption regression passed.
  History revision churn retries the complete snapshot at most three times;
  corruption and session changes fail without returning partial plaintext.
- Separate agents performed scoped implementation and read-only reviews.
  The final late-change review found no remaining P1/P2 issues. These agents
  are not an independent cryptographic auditor.

The release commit is the Git commit containing this document. Frontend assets
were rebuilt as `20261008184751`. Push/deploy results must be checked against
that release identity; local tests alone do not establish production load,
physical-device acceptance or cryptographic audit approval.
