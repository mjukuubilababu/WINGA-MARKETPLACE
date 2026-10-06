module.exports = {
  id: "2026100601_conversation_notification_preferences",
  statements: [
    `CREATE TABLE IF NOT EXISTS conversation_notification_preferences (
      owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      peer_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      muted BOOLEAN NOT NULL DEFAULT FALSE,
      row_version BIGINT NOT NULL DEFAULT 1 CHECK(row_version>0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id,peer_id), CHECK(owner_id<>peer_id)
    )`
  ]
};
