# Durable message wake-up outbox

## Scope

PostgreSQL message creation now commits a pending owner wake-up in the same
transaction as the canonical message, idempotency record and replay events.
Read/delete replay invalidations also enqueue work. A matching send retry does
not create another message, event or wake-up. The existing immediate live path
remains for compatibility and low latency.

The outbox stores only owner ID, highest replay position and original enqueue
time. Pending work coalesces per owner; individual events remain in the existing
replay journal. There is no message body, attachment URL or credential in this
queue. Account deletion cascades its pending work.

## Worker

Each PostgreSQL backend starts a worker by default. Every two seconds it selects
at most 50 owners using `FOR UPDATE SKIP LOCKED`, emits content-free
`message_state_changed` notifications and deletes those rows in one transaction.
Statement/lock timeouts bound each database operation. A concurrent enqueue waits
for the selected row's transaction and creates fresh work after deletion.
Other instances skip locked rows. A failed transaction rolls back its deletion;
a later worker can retry. Retry intervals back off to at most 30 seconds, and
shutdown stops scheduling and waits for an in-flight batch within the server's
existing grace period.

PostgreSQL NOTIFY is delivered on commit, but is NOT a durable subscriber ACK.
A completed batch means the database committed a wake-up, not that a device
received or read a message. Disconnected listeners/clients still use the existing
canonical replay and reconnect reconciliation. Duplicate wake-ups are expected.
This increment does not implement per-device envelopes, conversation sequences,
E2EE, BEAM fan-out, delivery receipts or production throughput guarantees.

## Operations

Migration `2026092801_message_dispatch_outbox` is additive and runs through the
existing migration lock. Older binaries ignore this table during a rolling
deploy; sends handled by an older binary still use its existing live/replay path
and do not acquire a new outbox record retroactively.

Set `WINGA_MESSAGE_DISPATCH_ENABLED=false` and redeploy to pause dispatch workers.
Enqueueing and canonical replay remain active; re-enabling drains pending owners.
Do not delete queued work to roll back. File-storage mode does not start a worker.

`GET /api/ops/messages/dispatch-health`, with the existing `X-Ops-Health-Token`,
returns only `pendingOwners`, `oldestPendingAgeSeconds`, worker configuration and
an aggregate privacy marker. It is `no-store`; unauthenticated access is denied,
and file mode or database failure returns unavailable. A zero count is not proof
of device delivery.
Increasing queue age warrants checking worker retry logs and PostgreSQL health.
Retry warnings contain only a consecutive-failure count, never SQL error contents.

## Verification Boundary

`tests/message-dispatch.test.js` exercises real PGlite migration/SQL, transactional
rollback before commit and on a notification failure, coalescing, bounded drain,
re-enqueue, account deletion and aggregate health. Worker tests cover backoff,
reset, non-overlap and shutdown. Message-store tests cover idempotent retries and
read invalidation, and API integration checks cover endpoint authorization.

PGlite does not establish real multi-connection lock contention or live
cross-node notification delivery. The prior production cross-node exercise is
evidence for its tested replay scenario, not a production test of this new worker.
Deployment activation and live queue drainage require runtime observation.
