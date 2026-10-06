module.exports=Object.freeze({
  id:'2026100609_encrypted_native_history',
  statements:Object.freeze([
    `CREATE TABLE encrypted_conversation_history_transfers (
      id TEXT PRIMARY KEY CHECK(id ~ '^[a-f0-9-]{36}$'),
      conversation_id TEXT NOT NULL REFERENCES encrypted_conversations(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      epoch TEXT NOT NULL CHECK(epoch ~ '^[1-9][0-9]{0,19}$'),
      recipient_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      donor_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      request JSONB NOT NULL, request_proof JSONB NOT NULL,
      publication JSONB, publication_proof JSONB,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','accepted','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+interval '24 hours',
      CHECK(recipient_device<>donor_device),
      CHECK((status='pending' AND publication IS NULL AND publication_proof IS NULL)
        OR (status IN ('ready','accepted') AND publication IS NOT NULL AND publication_proof IS NOT NULL)
        OR status='cancelled')
    );`,
    `CREATE UNIQUE INDEX encrypted_history_recipient_pending ON encrypted_conversation_history_transfers(conversation_id,recipient_device) WHERE status IN ('pending','ready');`,
    `CREATE INDEX encrypted_history_donor_pending ON encrypted_conversation_history_transfers(donor_device,id) WHERE status='pending';`,
    `CREATE INDEX encrypted_history_expiry ON encrypted_conversation_history_transfers(expires_at);`,
    `CREATE TABLE encrypted_conversation_history_pages (
      transfer_id TEXT NOT NULL REFERENCES encrypted_conversation_history_transfers(id) ON DELETE CASCADE,
      page_index INTEGER NOT NULL CHECK(page_index>=0 AND page_index<1024),
      capsule JSONB NOT NULL CHECK(jsonb_typeof(capsule)='object' AND octet_length(capsule::text)<=180000),
      hash TEXT NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
      bytes INTEGER NOT NULL CHECK(bytes>=17 AND bytes<=131088),
      PRIMARY KEY(transfer_id,page_index)
    );`,
    `CREATE TABLE encrypted_conversation_archive_reads (
      message_id TEXT NOT NULL REFERENCES encrypted_conversation_messages(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      owner_id TEXT NOT NULL REFERENCES users(username),
      proof JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(message_id,device_id)
    );`,
    `CREATE TABLE encrypted_conversation_archive_read_acks (
      message_id TEXT NOT NULL,receipt_device TEXT NOT NULL,
      observer_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      proof JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(message_id,receipt_device,observer_device),
      FOREIGN KEY(message_id,receipt_device) REFERENCES encrypted_conversation_archive_reads(message_id,device_id) ON DELETE CASCADE
    );`
  ])
});
