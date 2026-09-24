# Durable Message Replay Journal

This is the PostgreSQL foundation for reconnect recovery, not the complete
Conversations 0-109 event protocol, a new realtime transport, or E2EE.

## Persistence

Migration `2026092203_message_replay` adds per-user stream counters and an
append-only message-created reference journal. Existing history is not backfilled
or rewritten. New canonical PostgreSQL sends journal both participants in the same
transaction as the message, notification, retry ledger and NOTIFY. A failed
transaction rolls everything back. Accepted logical retries do not append again.

Counters use transactional row locks, acquired in sorted participant order.
They are per-user positions, not conversation event sequences or device receipts.
Positions travel as decimal strings, never JavaScript numbers. PostgreSQL sequence
allocation alone would not establish commit order, so no global serial cursor is
used. The message-id index also bounds foreign-key deletion lookups.

The journal contains references and timestamps, not copied message bodies or
notification previews. Deleting a message nulls its reference, preserving the
position without returning the deleted ID. Account deletion cascades its stream.
No automatic retention pruning is enabled yet; retention/resync policy must be
implemented before pruning. Storage growth must be monitored during rollout.

## API

Authenticated `GET /api/messages/replay?cursor=...&limit=25` returns:

```json
{
  "version": 1,
  "scope": "message-created-references",
  "resyncRequired": false,
  "events": [{ "position": "1", "messageId": "...", "type": "message_created" }],
  "cursor": "opaque owner-scoped cursor",
  "hasMore": false
}
```

Without a cursor, the endpoint returns the current checkpoint and
`resyncRequired: true`, with no historical events. A consumer must reconcile
canonical inbox/history before committing that initial checkpoint, then replay
above it to cover writes racing the reconciliation.

Pages scan at most limit + 1 journal rows; limit is 1-50. Current participant and
bidirectional block checks determine which references are returned. Empty event
pages may still advance the cursor over hidden/deleted entries; honor `hasMore`.
Cursor owner/version/position are validated, but a cursor is never authorization.
The authenticated session selects the owner. Responses are no-store. Non-Postgres
runtimes return 503, and capabilities advertise `durableMessageReplay: false`.

## Integration Boundary

The browser consumes replay on SSE open, including reconnect, while retaining
SSE immediate merge and canonical reconciliation. Checkpoints are owner-scoped
in-memory state, committed only after successful canonical inbox/active-history
refresh. Reload starts a fresh checkpoint/resync; private messages are not added
to another persistent store. Closed channels and account changes reject late
recovery completions. Catch-up scans at most five pages per batch, then yields.
Invalid cursors reset through initial reconciliation; replay failure falls back
to the existing refresh without advancing the checkpoint. No delivery
or read claim is made by advancing a replay position. Read/delete mutations use
the reconciliation barriers below. Commerce events are not journaled here.

Durable fan-out jobs, device identity, per-device
ACKs, event retention, and multi-region writer ownership remain separate work.

## Read/Delete Reconciliation (2026-09-24)

Migration `2026092401_message_replay_resync` adds `resync_position` to each
owner stream, initially zero. A changed canonical read or sender-authorized
delete advances both participant counters, records the barrier, and sends a
version-1 `message_state_changed` NOTIFY in the same transaction. A failed
transaction rolls back the message mutation and barrier together. Repeated
read/delete no-ops and unauthorized deletes do not advance counters or notify.
Counter locks retain sorted owner order. No historical messages are rewritten.
Historical messages may reference deleted accounts; barriers are written only
for existing users under a key-share lock, without recreating removed accounts.

The internal event contains only its version, type and at most two owner IDs.
Each backend forwards `{version: 1}` to those owners' existing authenticated SSE
connections. It exposes no counterpart, message ID, body or receipt details.
The browser responds with authorized canonical reads, including notifications.
Existing local read events remain for older browsers during rolling deployment.

When a replay cursor predates a barrier, the existing version-1 response returns
`resyncRequired: true`, an empty events array, and a captured head cursor. The
client reconciles before committing it, then resumes above it to cover mutations
or sends racing the refresh. This reuses the existing resync contract; deleted
message IDs never need to be disclosed. Many mutations coalesce into one latest
barrier per owner rather than an unbounded receipt journal.

Live signals received during an in-flight reconciliation request one follow-up
batch. Only one recovery runs at a time. Closed channels and account switches
still reject late completions; failed refreshes cannot commit a checkpoint.
An authoritative resync replaces cached Inbox/history pages after successful
reads and resets older-page cursors to the current canonical boundary. Previously
loaded older pages can be loaded again; they are not retained as stale proof of
message existence. Failed reads retain visible items and a pending resync flag.
Inactive cached histories resync when next opened. Complete non-paginated ranges
also replace old items, fixing deleted oldest messages lingering in the cache.
LISTEN/NOTIFY is a wake-up hint, not durable fan-out. A missed hint is recovered
on reconnect through the barrier and the existing reconciliation fallback.

Apply the additive migration before deploying the new backend, then deploy the
browser bundle. Old backend code remains compatible with the added column;
rollback must retain it. Changes made through an old writer during mixed-version
rollout do not create barriers, so ordinary reconnect reconciliation remains
necessary. This is not device-delivery proof, E2EE, or the complete event protocol.

Capabilities now include `messageStateResync`; the existing authenticated probe
prints it as `stateChangeReplayEnabled`. A successful probe with this flag proves
the new code and schema are readable. Two-account writes and real PostgreSQL
multi-node failure/reconnect still require separate runtime verification.

## Verification Scope

Tests use executable PostgreSQL-compatible SQL through PGlite for bounded replay,
owner isolation, both-participant journaling, rollback, deletion and blocks. The
existing message-acceptance transaction test checks retry deduplication and journal
rollback with a notification failure. PGlite does not prove cross-connection lock
ordering or real LISTEN/NOTIFY failover; those require isolated PostgreSQL staging.
Authenticated production replay and migration completion require runtime proof.

Run `node scripts/verify-message-replay-runtime.js` with a valid session cookie
value supplied locally as `WINGA_SESSION_TOKEN`. It calls Render directly,
requires advertised replay support, and checks initial and resumed reads.
Output contains only status flags, not credentials, cursors or message content.
Successful reads prove the journal schema is readable, not that two-account
message writes and reconnect delivery have been verified in production.

### Local Results (2026-09-22)

- Final `npm run test:ci`: exit 0; browser regression suite 137/137 passed.
- Message paging/replay: 20/20; integration API: 200/200.
- `npm run build:vercel` and `git diff --check` passed.
- The first full CI run failed the unchanged Home scroll/navigation test
  (`tests/e2e/app.spec.js:745`). An isolated three-repeat run passed 2/3,
  with the other failure at scroll-to-top after Home. The final full run
  passed without changing Home code or weakening assertions. Root cause
  remains unconfirmed; this is a recorded intermittent regression-test risk.

### Browser Consumer Verification (2026-09-22)

- Final `npm run test:ci`: exit 0, browser tests 138/138, message paging/replay
  27/27, frontend core 144/144, integration 200/200.
- New browser test exercises SSE open/reconnect, checkpoint reuse and canonical
  message reconciliation without reloading the page. Seven client unit tests
  cover failed batches, owner changes, close, invalid cursors and bounded catch-up.
- Earlier full runs failed Home scroll and photo-reel timeout, then a profile
  enrichment test waiting for a response. The latter now installs interception
  before bootstrap and awaits fulfillment directly; its draft assertions remain
  unchanged. That test passed 3/3 isolated repeats and the final full run.
  Home/photo-reel production code and assertions were not changed.
- Authenticated Render verification is still pending user-run probe output;
  the browser automation tool could not access the existing authenticated session
  because its Windows sandbox failed to initialize. Do not infer runtime migration
  proof from local tests or successful public health checks.

### Read/Delete Resync Verification (2026-09-24)

- `npm run build:vercel` passed (asset version `20260924154017`).
- `npm run test:ci` passed: browser 139/139, message paging/replay 34/34,
  frontend core 144/144, extra frontend 47/47, integration 200/200.
- The new browser test initially exposed a deleted oldest message remaining in
  the cached history. Canonical page replacement and explicit resync handling
  fixed it; the original deletion assertion now passes.
- After full CI, a backend-only compatibility guard was added for historical
  messages whose counterpart account no longer exists. The final targeted
  replay, PostgreSQL pagination and integration API suite passed 128/128.
- These are local checks. New authenticated Render migration reads and real
  two-account cross-instance read/delete reconnect remain unproven.

### Subsequent Runtime Evidence

The user supplied an authenticated Render probe after deployment with
`stateChangeReplayEnabled: true` and `migrationReadable: true`. They subsequently
confirmed functional messaging/reconnect and, after the Inbox action fix
`301913e`, Reply/Forward/Delete. This is user-reported runtime evidence; the probe
does not execute writes and still correctly prints `writeAndReconnectProven: false`.
Controlled cross-node failure and primary failover remain staging gates.
