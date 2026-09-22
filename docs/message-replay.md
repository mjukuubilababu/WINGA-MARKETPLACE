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
or read claim is made by advancing a replay position. Existing read/delete and
commerce events are not journaled by this message-created-only increment.

Durable fan-out jobs, device identity, per-device
ACKs, event retention, and multi-region writer ownership remain separate work.

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
