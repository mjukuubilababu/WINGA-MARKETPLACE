module.exports = Object.freeze({
  id: '2026100304_encrypted_conversations',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_conversations (
      id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL UNIQUE REFERENCES conversation_event_streams(id),
      creator TEXT NOT NULL REFERENCES users(username), recipient TEXT NOT NULL REFERENCES users(username),
      creator_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      recipient_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      source_hash TEXT NOT NULL REFERENCES conversation_crypto_key_packages(hash),
      target_hash TEXT NOT NULL REFERENCES conversation_crypto_key_packages(hash),
      status TEXT NOT NULL CHECK(status IN ('reserved','pending','active')),
      transfer JSONB, transfer_hash TEXT, transfer_proof JSONB, acceptance JSONB, epoch TEXT NOT NULL DEFAULT '1',
      next_sequence BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(creator<>recipient)
    );`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id),
      sender_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      epoch TEXT NOT NULL, sequence BIGINT NOT NULL, ciphertext TEXT NOT NULL,
      hash TEXT NOT NULL, proof JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(conversation_id,sequence)
    );`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_receipts (
      message_id TEXT NOT NULL REFERENCES encrypted_conversation_messages(id),
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      kind TEXT NOT NULL CHECK(kind IN ('delivered','read')), proof JSONB NOT NULL, sender_ack_at TIMESTAMPTZ,
      PRIMARY KEY(message_id,device_id,kind)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_encrypted_messages_queue ON encrypted_conversation_messages(conversation_id,sequence);`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_rejections (
      message_id TEXT NOT NULL REFERENCES encrypted_conversation_messages(id),
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id), proof JSONB NOT NULL,
      PRIMARY KEY(message_id,device_id)
    );`
  ])
});
