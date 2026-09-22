const { createHash } = require("node:crypto");

function readMessageIdempotencyKey(headers = {}, payload = {}) {
  const header = headers["idempotency-key"];
  const body = payload.clientMessageId;
  for (const value of [header, body]) {
    if (value !== undefined && (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,120}$/.test(value))) {
      throw Object.assign(new Error("Invalid message idempotency key."), { status: 400 });
    }
  }
  if (header !== undefined && body !== undefined && header !== body) {
    throw Object.assign(new Error("Conflicting message idempotency keys."), { status: 400 });
  }
  return header || body || "";
}

function messageRequestHash(message) {
  // Explicit normalized request fields exclude server timestamps and generated IDs.
  return createHash("sha256").update(JSON.stringify([
    message.senderId, message.receiverId, message.conversationId, message.message,
    message.messageType, message.productId, message.productName, message.productItems,
    message.replyToMessageId
  ])).digest("hex");
}

async function reconcileMessageRetry(client, senderId, key, hash) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`winga-message-retry:${senderId}:${key}`]);
  const result = await client.query(
    `SELECT i.request_hash AS "requestHash", m.id, m.sender_id AS "senderId",
      m.receiver_id AS "receiverId", m.conversation_id AS "conversationId",
      m.message, m.message_type AS "messageType", m.product_id AS "productId",
      m.product_name AS "productName", m.product_items AS "productItems",
      m.reply_to_message_id AS "replyToMessageId", m.timestamp,
      m.created_at AS "createdAt", m.updated_at AS "updatedAt",
      m.delivered_at AS "deliveredAt", m.read_at AS "readAt",
      m.is_delivered AS "isDelivered", m.is_read AS "isRead"
     FROM message_idempotency i LEFT JOIN messages m
       ON m.id = i.message_id AND m.sender_id = i.sender_id
     WHERE i.sender_id = $1 AND i.client_message_id = $2`, [senderId, key]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.requestHash !== hash) return { created: false, code: "message_idempotency_conflict" };
  if (!row.id) return { created: false, code: "message_retry_deleted" };
  const { requestHash, ...message } = row;
  return { created: false, code: "", replayed: true, message };
}

async function recordMessageAcceptance(client, message, key, hash) {
  // No message FK: deletion must not make an old retry create a new message.
  await client.query(
    `INSERT INTO message_idempotency(sender_id, client_message_id, message_id, request_hash)
     VALUES ($1, $2, $3, $4)`, [message.senderId, key, message.id, hash]
  );
}

module.exports = { readMessageIdempotencyKey, messageRequestHash, reconcileMessageRetry, recordMessageAcceptance };
