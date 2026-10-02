module.exports = Object.freeze({
  id: '2026100303_conversation_crypto_key_packages',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS conversation_crypto_key_packages (
      hash TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      package TEXT NOT NULL, mls_public_key TEXT NOT NULL, identity_proof JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_by TEXT REFERENCES conversation_event_streams(id), consumed_at TIMESTAMPTZ,
      CHECK((consumed_by IS NULL)=(consumed_at IS NULL))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_crypto_key_packages_available
      ON conversation_crypto_key_packages(device_id,expires_at) WHERE consumed_at IS NULL;`
  ])
});
