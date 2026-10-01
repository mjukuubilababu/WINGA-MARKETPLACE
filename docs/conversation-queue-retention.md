# Conversation device queue retention

Status: implemented and locally verified on 2026-10-01. Production deployment
and post-deploy verifier output must be recorded separately.

Migration `2026100101_conversation_delivery_progress` adds a per-device,
per-conversation contiguous ACK position and an enqueue timestamp on device
obligations. The position advances only through events that this exact device
has acknowledged. An ACK out of order leaves the gap open. Once the gap is ACKed,
the position can catch up through already acknowledged events. Poll backfill
skips positions behind the recorded position, so deleting old ACK rows cannot
recreate them or replay them to the device. An authorized duplicate ACK behind
the position still succeeds.

The backend prunes at most 1,000 old ACK rows per run in five transactions of
200 rows. It runs at startup and every 15 minutes. Multiple instances use row
locks with `SKIP LOCKED`. Default retention is 30 days after ACK;
`CONVERSATION_ACK_RETENTION_DAYS` accepts integers from 7 to 365. A row is
eligible only after the same device's contiguous position covers its event.
Pending, unoffered and cancelled rows are not deleted by this sweeper.

`npm run verify:conversation-events` remains read-only and aggregate-only. It
now reports pending devices, pending older than 24 hours, oldest pending age,
maximum pending attempts, progress table presence and progress consistency.
These counts show pressure, not proof that a particular phone received an event.
The verifier itself still reports physical-device and cross-connection exercise
fields as false; those require separate tests and operator evidence.

The append-only `conversation_events` ledger, message tombstones, revoked device
records and cancelled obligations remain durable. Their deletion needs a separate
account erasure and replay-retention contract. No queue timeout silently advances
a device or marks a message Stored/Read. Production growth and query plans should
be observed after rollout before increasing pruning throughput.

Local validation: 10/10 PGlite ledger tests and 11/11 independent-connection
PostgreSQL 18 tests passed, including out-of-order ACKs, old ACK pruning,
upgrade with pre-existing queue rows, concurrent poll/prune and isolation of a
second device's pending work. The
PostgreSQL suite used only a disposable localhost cluster and synthetic data.

## Production verification

The operator supplied a read-only Render verifier result after release
`58f5f40a44cd42d6bd81788096a1fb212d5ae781`: `ok:true`, migration, queue,
progress table and triggers present, with sequence, queue and progress consistency
all true. It reported 8 conversations, 129 events, two registered devices,
138 acknowledged obligations and 49 pending obligations on one device. The oldest
pending obligation was 91 seconds old, maximum pending attempts was one, and none
was older than 24 hours. That snapshot shows no aged backlog; it does not prove
future queue drainage or identify the device. The verifier's two exercise fields
remain false by design because it does not perform physical-device or concurrent
connection tests. Separate physical-device delivery was reported by the operator
for the preceding release, and local PostgreSQL concurrency tests are listed above.
