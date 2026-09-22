module.exports = Object.freeze({
  id: "2026092201_message_idempotency",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS message_idempotency (
      sender_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      client_message_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sender_id, client_message_id)
    );`
  ])
});
