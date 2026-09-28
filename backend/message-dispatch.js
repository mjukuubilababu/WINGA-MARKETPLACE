async function enqueueMessageDispatch(client, owners) {
  for (const owner of [...new Set(owners)].sort()) {
    await client.query(`INSERT INTO message_dispatch_outbox (owner_id, position)
      SELECT owner_id, position FROM message_replay_streams WHERE owner_id = $1 AND position > 0
      ON CONFLICT (owner_id) DO UPDATE SET
        position = GREATEST(message_dispatch_outbox.position, EXCLUDED.position)`, [owner]);
  }
}

function createMessageDispatchStore({ withTransaction, query }) {
  async function dispatchMessageBatch(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid dispatch batch size");
    return withTransaction(async (client) => {
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      const pending = await client.query(`SELECT owner_id FROM message_dispatch_outbox
        ORDER BY created_at, owner_id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
      const owners = pending.rows.map(row => row.owner_id);
      if (!owners.length) return { dispatchedOwners: 0 };
      // PostgreSQL publishes NOTIFY only at commit; deletion shares that commit.
      // Row locks make a concurrent enqueue wait and then create fresh work.
      await client.query(`SELECT pg_notify('winga_messages', json_build_object(
        'version', 1, 'type', 'message_state_changed', 'owners', json_build_array(owner))::text)
        FROM unnest($1::text[]) AS recipients(owner)`, [owners]);
      await client.query("DELETE FROM message_dispatch_outbox WHERE owner_id = ANY($1::text[])", [owners]);
      return { dispatchedOwners: owners.length };
    });
  }

  async function readMessageDispatchHealth() {
    const result = await query(`SELECT COUNT(*)::int AS "pendingOwners",
      COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))), 0)::float8
        AS "oldestPendingAgeSeconds" FROM message_dispatch_outbox`);
    return result.rows[0];
  }
  return { dispatchMessageBatch, readMessageDispatchHealth };
}

function createMessageDispatchWorker({ dispatch, onError = () => {}, intervalMs = 2000,
  maxBackoffMs = 30000, schedule = setTimeout, cancel = clearTimeout }) {
  let stopped = true, timer = null, running = null, failures = 0;
  function tick() {
    if (stopped || running) return;
    running = Promise.resolve().then(dispatch).then(() => { failures = 0; }).catch(() => {
      failures += 1;
      try { onError({ consecutiveFailures: failures }); } catch (_) {}
    }).finally(() => {
      running = null;
      if (!stopped) {
        timer = schedule(tick, Math.min(maxBackoffMs, intervalMs * (2 ** Math.min(failures, 5))));
        timer?.unref?.();
      }
    });
  }
  return {
    start() { if (stopped) { stopped = false; tick(); } },
    stop() { stopped = true; if (timer) cancel(timer); timer = null; return running || Promise.resolve(); }
  };
}

module.exports = { enqueueMessageDispatch, createMessageDispatchStore, createMessageDispatchWorker };
