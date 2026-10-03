module.exports = Object.freeze({
  id: '2026100306_encrypted_conversation_replacement',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_epochs (
      conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id), epoch TEXT NOT NULL,
      creator_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      recipient_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      PRIMARY KEY(conversation_id,epoch), CHECK(creator_device<>recipient_device)
    );`,
    `INSERT INTO encrypted_conversation_epochs(conversation_id,epoch,creator_device,recipient_device)
      SELECT id,epoch,creator_device,recipient_device FROM encrypted_conversations ON CONFLICT DO NOTHING;`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_replacements (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id),
      previous_epoch TEXT NOT NULL, epoch TEXT NOT NULL,
      initiator_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      removed_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      replacement_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      package_hash TEXT NOT NULL REFERENCES conversation_crypto_key_packages(hash),
      intent JSONB NOT NULL, reservation_proof JSONB NOT NULL,
      transfer JSONB, transfer_hash TEXT, transfer_proof JSONB, acceptance JSONB,
      status TEXT NOT NULL CHECK(status IN ('reserved','pending','accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ,
      UNIQUE(conversation_id,previous_epoch), CHECK(initiator_device<>removed_device),
      CHECK(initiator_device<>replacement_device), CHECK(removed_device<>replacement_device)
    );`
  ])
});
