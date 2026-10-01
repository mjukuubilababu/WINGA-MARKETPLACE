# Conversation events and per-device delivery

Status: implemented locally, not deployed or certified on production (2026-10-01).
This is the direct-chat implementation of the next ledger and device-queue
increments. It does not mark the entire 0-109 foundation contract complete.

## Event contract

Migration `2026092805_conversation_event_ledger` adds independent stream, member,
event, message-state, enrolled-device and device-delivery tables. The stream ID
is distinct from the legacy product-context `messages.conversation_id`. Each
sorted participant pair has one stream; database row locking allocates its next
position in the same transaction as the mutation. Positions and revisions cross
the API as decimal strings, not lossy JavaScript numbers.

Captured events are `membership_initialized`, `access_changed`,
`message_imported`, `message_created`, `message_edited`, `message_deleted`,
`message_state_changed`, `device_stored` and `device_read`. Existing messages are
imported in timestamp/ID order; past edits, membership actions and receipts are
not invented. Membership initialization identifies the existing two participants,
not an invitation acceptance. Symmetric block state changes increment the access
version and prevent history, delivery and ACK access while blocked.

The log is append-only under ordinary UPDATE/DELETE, not cryptographically
tamper-proof against a database administrator. It stores metadata and pointers,
not historical body copies. Polling hydrates the current authorized canonical
message. Revision tombstones survive message deletion and reject ID reuse,
participant rebinding and stale snapshot body replacement. This is an ordered
mutation ledger, not a complete event-sourced reconstruction of every old body.
No new edit UI, group invitations, join/leave protocol, E2EE or BEAM runtime is
introduced by this change.

## Delivery contract

- `POST /api/messages/device-events/poll` enrolls the authenticated session and
  returns at most 50 event obligations plus current message projections.
- `POST /api/messages/device-events/ack` accepts 1-50 offered event IDs bound to
  that exact authenticated device/session. Repeated ACKs are idempotent.
- `GET /api/messages/events?withUser=...` provides bounded, owner/pair-scoped
  history. Its cursor is a position, never authorization.
- `/api/messages/device` advertises `eventDelivery`; older servers/clients keep
  their existing receipts, REST, SSE, replay and pending-delivery behavior.

Session identity is the existing device identity, not a hardware or cryptographic
key. Each enrolled device owns a separate `(device_id,event_id)` obligation;
acknowledging on one cannot drain another. New events fan out transactionally.
First login and enrollment races are repaired by bounded lazy backfill (100 rows
per poll), not a global cursor that could skip late commits in another stream.
Session deletion revokes the enrollment and cancels pending work. Expired or
inactive-account sessions fail authorization; later session cleanup cancels rows.
Revoked identities cannot enroll again; signing in creates a new session.

Delivery is at least once. Poll records attempts but does not delete or lease
work; simultaneous polls may offer the same event. Only an explicit authorized
ACK consumes that device's obligation. Blocks and membership are rechecked for
both poll and ACK. A transactional `pg_notify` is a latency hint only; polling
remains authoritative after missed notifications or process restart.

The client commits events and message projections/tombstones atomically to
IndexedDB before event ACK. Aborts, full/unavailable storage, account changes and
lost HTTP responses cannot advance the server queue. Older REST/SSE results must
not overwrite ledger revisions or resurrect a retained tombstone. A separate
existing Stored receipt follows durable incoming payload storage. Event ACK is
not a message Delivered receipt; neither polling nor ACK creates Read. Read still
requires the existing focused, visible, exact-message path.

The client drains at most five pages per pass and retries with bounded delays.
Its per-session cache retains at most 1,000 message projections and 2,000 events
for seven days and clears both on logout. It is a bounded cache, not a permanent
archive. IndexedDB v2 adds the events store to the existing database; old v1 tabs
must reload and fail closed rather than send unbacked receipts during upgrade.

## Snapshot and rollout safety

The new `writeStore` sets transaction-local `winga.snapshot_restore=on`, rewrites
legacy tables, then calls `winga_reconcile_conversation_snapshot()` before commit.
Temporary removals do not revoke retained sessions or tombstone retained messages.
Actual missing messages, session removals and block changes are reconciled once.
Stale content replacement or a tombstoned message resurrection aborts the restore.

**Do not apply this migration while an unpatched bulk snapshot writer is active.**
Old bulk delete/reinsert paths do not set this transaction marker and can conflict
with tombstones. Ordinary old-client HTTP compatibility does not imply arbitrary
old-binary snapshot compatibility. Startup applies registered migrations
automatically; there is no opt-in migration flag here.

The release baseline `cbc8f08` was checked before this rollout: its server rejects
PostgreSQL bulk store replacement at `writeStoreWithOptions`, and the repository
has no runtime `.writeStore(...)` callers in backend/scripts. Store bootstrap only
imports a legacy snapshot into an empty database. Its normal running PostgreSQL
request/background paths therefore do not perform a bulk restore. Do not run an
external restore/import job during deployment. An unknown or earlier baseline
requires stopping/auditing its writers instead of relying on this finding.

Controlled rollout checklist:

1. Take a database recovery point and test restore on a disposable staging copy.
   Exercise this migration and the new snapshot path there. Measure backfill
   duration; the migration transaction and trigger installation take write locks.
2. Disable Auto-Deploy before pushing, then use Render Maintenance Mode for the
   reviewed `cbc8f08` baseline to block public traffic during manual deployment.
   Maintenance Mode leaves processes and private-network access running: it is
   not a worker pause. Stop any external snapshot/import writers and drain active
   requests before migration. Unreviewed old snapshot writers must be stopped.
   Do not use Suspend as a substitute: suspended services cannot trigger deploys.
3. Boot the new backend, wait for successful migration/readiness, then run
   `npm --prefix backend run verify:conversation-events`. In Render's backend
   directory use `npm run verify:conversation-events` instead.
4. Deploy the matching built frontend and reload old tabs. Confirm independently
   in two sessions that the first ACK leaves the second session's backlog intact,
   and that reconnect, block/revoke and exact-message Read work. Use test accounts;
   do not publish their messages, tokens or event IDs in diagnostic logs.
5. Reopen traffic only after verification. Keep existing R2 and cross-node evidence;
   this change does not require repeating the media migration.

Rollback: stop the new client delivery path by restoring the previous frontend
while retaining the schema-compatible new backend. Keep the additive ledger,
tombstones and queue rows. Do not drop them or restart an unpatched old snapshot
writer against them. A backend rollback requires a reviewed compatibility build
or a coordinated database restore during write quiescence, not live SQL deletion.

The read-only verifier checks the migration row, five enabled triggers, sequence
continuity and queue-owner/offered-ACK consistency using aggregate counts only.
It deliberately reports `authenticatedDeviceFlowVerified:false` and
`crossConnectionConcurrencyVerified:false`; schema health alone proves neither.

## Verification and remaining gates

Local coverage includes PostgreSQL-compatible PGlite execution of the migration,
transaction rollback, idempotent backfill, edit/delete identity, snapshot removal,
session retention/revocation, block/unblock, device isolation, unoffered ACK denial,
125-event backlogs, append-only guards and the read-only verifier. API tests cover
unauthenticated access and CSRF. Browser tests cover native IndexedDB commit/abort,
lost ACK, stale-cache refresh, tombstones, logout and receipt semantics. Existing
push regressions also run; browser-injected push is not real Android/FCM evidence.

PGlite does not validate independent PostgreSQL connection contention. The later
real-PostgreSQL run below covers selected races and the full canonical lifecycle.
It is not an exhaustive concurrency proof: combined edit/delete/receipt races,
production-size backfill timing and live production topology remain staging/load
gates. No new production migration, physical-device flow or production load result
is claimed. The whole unrelated marketplace/browser suite has not been rerun.

Final local results on 2026-10-01:

- Ledger SQL tests: 8/8, including the final explicit migration write lock.
- Messaging suite: 54/54 before the additional migration-order assertion; that
  assertion is included in the final 8/8 ledger run.
- Ledger plus PostgreSQL persistence regression run: 127/127.
- API integration: 13/13; realtime/session/dispatch: 46/46.
- Frontend core command and its 68 related tests passed; localization has no new
  hard-coded UI debt. Module synchronization passed for 69 modules.
- Native device/push browser scenarios: 14/14; full-app messaging scenarios:
  5/5, including legacy and event-queue reconnect. A detached viewport scroll
  target failed on the first run; bounded action retry now tolerates receipt
  rerender, with all offscreen/read assertions retained. The final rerun passed.
- Static build succeeded with asset version `20261001185404`; not deployed.

### Real PostgreSQL follow-up

PostgreSQL 18 was subsequently found in its standard Windows installation folder,
outside PATH. An isolated temporary cluster listening on `127.0.0.1:55439` was
initialized with synthetic data only. `npm run test:conversation-concurrency`
passed **10/10** using independent `pg` connections, not PGlite. Test schemas are
randomly named and removed by the suite; no production URL is used or inferred.

The tests prove the following observed cases:

- 24 overlapping writes allocate all 26 expected positions (including the two
  initial events), with one obligation per event per enrolled device.
- Duplicate ACKs and concurrent polling do not consume the other device's queue.
- Poll and ACK demonstrably wait on a block transaction, then reauthorize.
- A session revocation committed ahead of a waiting ACK causes 401 and cancels
  pending obligations; the ACK cannot succeed with its earlier session snapshot.
- An edit rolled back ahead of a waiting poll leaks neither body nor sequence.
- A late commit in a different conversation is delivered after a prior batch ACK.
- Migration locking blocks writes through backfill and trigger installation.
- Lazy backfill repairs enrollment racing with event fan-out.
- The actual store's complete fresh migration chain, send, Stored/Read, snapshot
  rewrite, deletion and aggregate verifier work together on real PostgreSQL.

The first test run had one assertion-query error: ordering the cast output alias
sorted positions as text. Qualifying the numeric source column fixed the test;
the application already qualifies its sequence ordering. All final tests passed.

To repeat against a dedicated local test cluster, explicitly set
`WINGA_TEST_POSTGRES_URL`, then run `npm run test:conversation-concurrency`.
The suite refuses non-local URLs and never falls back to `DATABASE_URL`. It uses
10-second statement and 7-second lock timeouts and checks `pg_blocking_pids` to
prove waits rather than assuming a race happened after a sleep. Do not point it
at a production tunnel or an existing application's database. The read-only
production verifier still reports its own concurrency/physical-flow fields as
false because it does not itself run these destructive fixture tests.

The operator approved a short maintenance deployment, but no deployment was
attempted: browser and native dashboard runtimes failed to initialize, and no
Render API credential was configured. Production remains unchanged pending
operator dashboard coordination or authenticated API access.

Server event and acknowledged-queue retention is currently durable/unbounded.
Account erasure and retention policy need a separate reviewed migration; metadata
is not anonymous just because body copies are absent. Polling order is deterministic
per conversation, not a proven fair scheduler under sustained hot-conversation
load. Lazy backfill can scan historical rows despite bounded writes/responses.
Measure query plans, queue growth and latency on staging before capacity claims.
