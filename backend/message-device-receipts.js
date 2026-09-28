const { invalidateMessageReplay } = require("./message-replay");

function invalid(status = 400) {
  return Object.assign(new Error("Message receipt rejected."), { status });
}

function validateReceipt(payload, owner, deviceId) {
  if (!payload || payload.deviceId !== deviceId || !deviceId
    || !["stored", "read"].includes(payload.kind)
    || typeof payload.withUser !== "string" || !payload.withUser.trim()
    || payload.withUser.length > 40 || payload.withUser === owner
    || !Array.isArray(payload.messageIds) || !payload.messageIds.length || payload.messageIds.length > 100
    || payload.messageIds.some(id => typeof id !== "string" || !id.trim() || id.length > 80)) throw invalid();
  return [...new Set(payload.messageIds)];
}

function createMessageDeviceReceiptsStore({ withTransaction, invalidate = invalidateMessageReplay }) {
  async function acknowledgeMessageDevice({ owner, token, deviceId, payload }) {
    const ids = validateReceipt(payload, owner, deviceId);
    const partner = payload.withUser;
    return withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`winga-message:${[owner, partner].sort().join(":")}`]);
      // Lock the live session: a stale request cannot race past completed revocation.
      const session = await client.query(`SELECT s.session_id FROM sessions s JOIN users u ON u.username=s.username
        WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'
        FOR SHARE OF s, u`, [token, owner, deviceId, Date.now()]);
      if (!session.rows.length) throw invalid(401);
      const blocked = await client.query(`SELECT 1 FROM user_blocks WHERE
        (blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)`, [owner, partner]);
      if (blocked.rows.length) throw invalid(403);
      const messages = await client.query(`SELECT id FROM messages
        WHERE id=ANY($1::text[]) AND receiver_id=$2 AND sender_id=$3 ORDER BY id FOR UPDATE`, [ids, owner, partner]);
      if (messages.rows.length !== ids.length) throw invalid(404);
      let proof;
      if (payload.kind === "stored") {
        proof = await client.query(`INSERT INTO message_device_receipts(message_id,device_id,sender_id,receiver_id)
          SELECT id,$2,sender_id,receiver_id FROM messages WHERE id=ANY($1::text[])
          ON CONFLICT(message_id,device_id) DO NOTHING RETURNING message_id`, [ids, deviceId]);
      } else {
        const stored = await client.query(`SELECT message_id FROM message_device_receipts
          WHERE message_id=ANY($1::text[]) AND device_id=$2 AND receiver_id=$3 AND sender_id=$4`, [ids, deviceId, owner, partner]);
        if (stored.rows.length !== ids.length) throw invalid(409);
        proof = await client.query(`UPDATE message_device_receipts SET read_at=GREATEST(NOW(),stored_at)
          WHERE message_id=ANY($1::text[]) AND device_id=$2 AND read_at IS NULL RETURNING message_id`, [ids, deviceId]);
      }
      const changed = await client.query(`UPDATE messages SET is_delivered=TRUE, delivered_at=COALESCE(delivered_at,NOW()),
        is_read=CASE WHEN $2 THEN TRUE ELSE is_read END,
        read_at=CASE WHEN $2 THEN COALESCE(read_at,NOW()) ELSE read_at END,
        updated_at=NOW(),row_version=row_version+1
        WHERE id=ANY($1::text[]) AND (NOT is_delivered OR ($2 AND NOT is_read)) RETURNING id`, [ids, payload.kind === "read"]);
      if (payload.kind === "read") await client.query(`UPDATE notifications SET is_read=TRUE,
        read_at=COALESCE(read_at,NOW()),row_version=row_version+1
        WHERE user_id=$1 AND message_id=ANY($2::text[]) AND NOT is_read`, [owner, ids]);
      if (proof.rows.length || changed.rows.length) await invalidate(client, [owner, partner]);
      return { ok: true, kind: payload.kind, acknowledged: ids.length };
    });
  }
  return { acknowledgeMessageDevice };
}

module.exports = { createMessageDeviceReceiptsStore, validateReceipt };
