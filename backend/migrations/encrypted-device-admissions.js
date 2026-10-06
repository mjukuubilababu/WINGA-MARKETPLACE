module.exports = Object.freeze({
  id: '2026100606_encrypted_device_admissions',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_device_admissions (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id),
      previous_epoch TEXT NOT NULL, epoch TEXT NOT NULL,
      actor_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      added_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      added_owner TEXT NOT NULL REFERENCES users(username), package_hash TEXT NOT NULL,
      intent JSONB NOT NULL, reservation_proof JSONB NOT NULL,
      transfer JSONB, transfer_hash TEXT, transfer_proof JSONB,
      status TEXT NOT NULL CHECK(status IN ('reserved','pending','accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ,
      UNIQUE(conversation_id,previous_epoch),
      CHECK(previous_epoch ~ '^[1-9][0-9]{0,19}$' AND epoch ~ '^[1-9][0-9]{0,19}$'),
      CHECK(epoch::numeric=previous_epoch::numeric+1)
    );`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_device_acceptances (
      admission_id TEXT NOT NULL REFERENCES encrypted_conversation_device_admissions(id),
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      proof JSONB NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(admission_id,device_id)
    );`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_device_retirements (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id),
      actor_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      intent JSONB NOT NULL, proof JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_sync_acks (
      message_id TEXT NOT NULL REFERENCES encrypted_conversation_messages(id),
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      proof JSONB NOT NULL, acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(message_id,device_id)
    );`
  ])
});
