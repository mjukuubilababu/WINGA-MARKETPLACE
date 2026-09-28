module.exports = Object.freeze({
  id: "2026092801_message_dispatch_outbox",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS message_dispatch_outbox (
      owner_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      position BIGINT NOT NULL CHECK (position > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_message_dispatch_pending
      ON message_dispatch_outbox (created_at, owner_id);`
  ])
});
