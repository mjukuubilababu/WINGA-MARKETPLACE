module.exports = Object.freeze({
  id: '2026100307_encrypted_replacement_retirements',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_replacement_retirements (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id),
      initiator_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      intent JSONB NOT NULL, proof JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`
  ])
});
