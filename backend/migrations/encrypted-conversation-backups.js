module.exports = Object.freeze({
  id: '2026100201_encrypted_conversation_backups',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_backups (
       owner_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
       revision BIGINT NOT NULL CHECK (revision > 0),
       capsule JSONB,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CHECK (capsule IS NULL OR (jsonb_typeof(capsule)='object'
         AND octet_length(capsule::text) <= 5600000))
     );`
  ])
});
