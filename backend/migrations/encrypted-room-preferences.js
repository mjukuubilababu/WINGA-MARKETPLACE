module.exports = {
  id: '2026100702_encrypted_room_preferences',
  statements: [
    `CREATE TABLE IF NOT EXISTS encrypted_room_preferences (
      owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES encrypted_shopping_rooms(conversation_id) ON DELETE CASCADE,
      muted BOOLEAN NOT NULL DEFAULT FALSE,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      row_version BIGINT NOT NULL DEFAULT 1 CHECK(row_version>0),
      last_request_id TEXT NOT NULL,
      last_request_hash TEXT NOT NULL CHECK(last_request_hash ~ '^[a-f0-9]{64}$'),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id,conversation_id)
    )`
  ]
};
