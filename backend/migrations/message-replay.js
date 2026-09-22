module.exports = Object.freeze({
  id: "2026092203_message_replay",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS message_replay_streams (
      owner_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      position BIGINT NOT NULL DEFAULT 0 CHECK (position >= 0)
    );`,
    `CREATE TABLE IF NOT EXISTS message_replay_events (
      owner_id TEXT NOT NULL REFERENCES message_replay_streams(owner_id) ON DELETE CASCADE,
      position BIGINT NOT NULL CHECK (position > 0),
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (owner_id, position),
      UNIQUE (owner_id, message_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_message_replay_message ON message_replay_events(message_id);`
  ])
});
