function invalidCursor() {
  return Object.assign(new Error("Invalid message replay cursor"), { status: 400 });
}

function encodeCursor(owner, position) {
  return Buffer.from(JSON.stringify({ v: 1, owner, position })).toString("base64url");
}

function decodeCursor(owner, value) {
  try {
    if (typeof value !== "string" || value.length > 512) throw invalidCursor();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (cursor.v !== 1 || cursor.owner !== owner || typeof cursor.position !== "string"
      || !/^(0|[1-9][0-9]{0,18})$/.test(cursor.position)
      || BigInt(cursor.position) > 9223372036854775807n) throw invalidCursor();
    return cursor.position;
  } catch { throw invalidCursor(); }
}

async function appendMessageReplay(client, message) {
  // Counter row locks serialize commits per participant; sorted owners avoid
  // deadlocks when different conversations share participants.
  for (const owner of [...new Set([message.senderId, message.receiverId])].sort()) {
    await client.query(`WITH next_position AS (
      INSERT INTO message_replay_streams (owner_id, position) VALUES ($1, 1)
      ON CONFLICT (owner_id) DO UPDATE SET position = message_replay_streams.position + 1
      RETURNING position
    ) INSERT INTO message_replay_events (owner_id, position, message_id)
      SELECT $1, position, $2 FROM next_position`, [owner, message.id]);
  }
}

function createMessageReplayStore({ query }) {
  async function readMessageReplay(owner, options = {}) {
    const limit = options.limit === undefined ? 25 : Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw Object.assign(new Error("Invalid replay page size"), { status: 400 });
    }
    const position = options.cursor ? decodeCursor(owner, options.cursor) : null;
    const result = await query(`WITH state AS (
      SELECT COALESCE((SELECT position FROM message_replay_streams WHERE owner_id = $1), 0)::bigint AS head,
        COALESCE((SELECT resync_position FROM message_replay_streams WHERE owner_id = $1), 0)::bigint AS resync_position
    ), scanned AS (
      SELECT e.position, e.message_id FROM message_replay_events e, state s
      WHERE e.owner_id = $1 AND $2::bigint IS NOT NULL
        AND e.position > $2::bigint AND e.position <= s.head
      ORDER BY e.position LIMIT $3
    ), page AS (
      SELECT e.position::text AS position,
        CASE WHEN m.id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_username = $1 AND b.blocked_username = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END)
             OR (b.blocked_username = $1 AND b.blocker_username = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END)
        ) THEN m.id ELSE NULL END AS "messageId"
      FROM scanned e LEFT JOIN messages m ON m.id = e.message_id
        AND (m.sender_id = $1 OR m.receiver_id = $1)
    ) SELECT head::text AS head, resync_position::text AS "resyncPosition",
      COALESCE((SELECT jsonb_agg(p ORDER BY p.position::bigint) FROM page p), '[]'::jsonb) AS items
      FROM state`, [owner, position, limit + 1]);
    const { head, resyncPosition, items } = result.rows[0];
    if (position !== null && BigInt(position) > BigInt(head)) throw invalidCursor();
    if (position !== null && BigInt(position) < BigInt(resyncPosition)) {
      return {
        version: 1, scope: "message-created-references", resyncRequired: true,
        events: [], cursor: encodeCursor(owner, head), hasMore: false
      };
    }
    const selected = items.slice(0, limit);
    const hasMore = items.length > limit;
    const nextPosition = selected.length ? selected[selected.length - 1].position : head;
    return {
      version: 1, scope: "message-created-references", resyncRequired: position === null,
      events: selected.filter(item => item.messageId).map(item => ({ ...item, type: "message_created" })),
      cursor: encodeCursor(owner, nextPosition), hasMore
    };
  }
  return { readMessageReplay };
}

async function invalidateMessageReplay(client, participantIds) {
  const owners = [...new Set(participantIds)].sort();
  const notifiedOwners = [];
  // Commit the barrier with the mutation, without copying deleted IDs or receipts.
  // Clients reconcile through authorized canonical reads before advancing it.
  for (const owner of owners) {
    const result = await client.query(`INSERT INTO message_replay_streams (owner_id, position, resync_position)
      SELECT username, 1, 1 FROM users WHERE username = $1 FOR KEY SHARE
      ON CONFLICT (owner_id) DO UPDATE SET
        position = message_replay_streams.position + 1,
        resync_position = message_replay_streams.position + 1`, [owner]);
    if (result.rowCount) notifiedOwners.push(owner);
  }
  if (!notifiedOwners.length) return;
  await client.query("SELECT pg_notify('winga_messages', $1)", [
    JSON.stringify({ version: 1, type: "message_state_changed", owners: notifiedOwners })
  ]);
}

function getMessageStateEventOwners(event) {
  if (event?.version !== 1 || event.type !== "message_state_changed"
    || !Array.isArray(event.owners) || !event.owners.length || event.owners.length > 2
    || event.owners.some(owner => typeof owner !== "string" || !/^[a-z0-9._-]{3,40}$/i.test(owner))) return [];
  return [...new Set(event.owners)];
}

module.exports = { appendMessageReplay, invalidateMessageReplay, getMessageStateEventOwners, createMessageReplayStore };
