module.exports = Object.freeze({
  id: '2026100301_conversation_crypto_devices',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS conversation_crypto_devices (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      public_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','pending','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ,
      CHECK((status='revoked')=(revoked_at IS NOT NULL)), UNIQUE(owner_id,public_key)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_crypto_devices_owner
      ON conversation_crypto_devices(owner_id,status);`,
    `CREATE TABLE IF NOT EXISTS conversation_crypto_operations (
      owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      request_id TEXT NOT NULL, digest TEXT NOT NULL, result JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(owner_id,request_id)
    );`
  ])
});
