module.exports=Object.freeze({
  id:'2026100607_encrypted_device_lifecycle',
  statements:Object.freeze([
    `ALTER TABLE encrypted_conversation_device_admissions
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'add',
      ADD COLUMN IF NOT EXISTS removed_device TEXT REFERENCES conversation_crypto_devices(id),
      ADD COLUMN IF NOT EXISTS removed_owner TEXT REFERENCES users(username),
      ADD COLUMN IF NOT EXISTS removed_status TEXT;`,
    `ALTER TABLE encrypted_conversation_device_admissions ALTER COLUMN added_device DROP NOT NULL,
      ALTER COLUMN added_owner DROP NOT NULL, ALTER COLUMN package_hash DROP NOT NULL;`,
    `ALTER TABLE encrypted_conversation_device_admissions ADD CONSTRAINT encrypted_device_lifecycle_shape CHECK(
      (kind='add' AND removed_device IS NULL AND removed_owner IS NULL AND removed_status IS NULL
        AND added_device IS NOT NULL AND added_owner IS NOT NULL AND package_hash IS NOT NULL AND package_hash ~ '^[a-f0-9]{64}$') OR
      (kind='remove' AND removed_device IS NOT NULL AND removed_owner IS NOT NULL AND removed_status IS NOT NULL AND removed_status IN ('active','revoked')
        AND added_device IS NULL AND added_owner IS NULL AND package_hash IS NULL) OR
      (kind='replace' AND removed_device IS NOT NULL AND removed_owner IS NOT NULL AND removed_status IS NOT NULL AND removed_status IN ('active','revoked')
        AND added_device IS NOT NULL AND added_owner IS NOT NULL AND added_device<>removed_device AND added_owner=removed_owner
        AND package_hash IS NOT NULL AND package_hash ~ '^[a-f0-9]{64}$')
    );`,
    `CREATE TABLE encrypted_conversation_media_archive_grants (
      media_id TEXT NOT NULL REFERENCES encrypted_conversation_media(id),
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      owner_id TEXT NOT NULL REFERENCES users(username),
      proof JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(media_id,device_id)
    );`
  ])
});
