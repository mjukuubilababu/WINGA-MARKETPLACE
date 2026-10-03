module.exports = Object.freeze({
  id: '2026100305_encrypted_conversation_media',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_media (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id),
      message_id TEXT NOT NULL UNIQUE, uploader_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      bytes INTEGER NOT NULL CHECK(bytes BETWEEN 40 AND 8392744), sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
      status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','uploaded','attached','cleaning','deleted')),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
      cleanup_lease TEXT, lease_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `ALTER TABLE encrypted_conversation_messages ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES encrypted_conversation_media(id);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_encrypted_media_message ON encrypted_conversation_messages(media_id) WHERE media_id IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_encrypted_media_cleanup ON encrypted_conversation_media(expires_at) WHERE status IN ('reserved','uploaded','cleaning');`
  ])
});
