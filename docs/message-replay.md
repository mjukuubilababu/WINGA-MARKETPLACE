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

The current browser still uses SSE immediate merge and canonical reconciliation.
It does not yet consume this replay API or persist its checkpoints. No delivery
or read claim is made by advancing a replay position. Existing read/delete and
commerce events are not journaled by this message-created-only increment.

Next: an owner-scoped reconnect consumer with bounded catch-up, checkpoint only
after successful application, reset/resync behavior, and failure isolation. Keep
the existing refresh fallback. Durable fan-out jobs, device identity, per-device
ACKs, event retention, and multi-region writer ownership remain separate work.

## Verification Scope

Tests use executable PostgreSQL-compatible SQL through PGlite for bounded replay,
owner isolation, both-participant journaling, rollback, deletion and blocks. The
existing message-acceptance transaction test checks retry deduplication and journal
rollback with a notification failure. PGlite does not prove cross-connection lock
ordering or real LISTEN/NOTIFY failover; those require isolated PostgreSQL staging.
Authenticated production replay and migration completion require runtime proof.

### Local Results (2026-09-22)

- Final `npm run test:ci`: exit 0; browser regression suite 137/137 passed.
- Message paging/replay: 20/20; integration API: 200/200.
- `npm run build:vercel` and `git diff --check` passed.
- The first full CI run failed the unchanged Home scroll/navigation test
  (`tests/e2e/app.spec.js:745`). An isolated three-repeat run passed 2/3,
  with the other failure at scroll-to-top after Home. The final full run
  passed without changing Home code or weakening assertions. Root cause
  remains unconfirmed; this is a recorded intermittent regression-test risk.
