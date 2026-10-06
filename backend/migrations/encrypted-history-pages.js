module.exports = Object.freeze({
  id: '2026100608_encrypted_history_pages',
  statements: Object.freeze([
    `ALTER TABLE encrypted_conversation_backups ADD COLUMN IF NOT EXISTS page_ids TEXT[] NOT NULL DEFAULT '{}';`,
    `ALTER TABLE encrypted_conversation_backups ADD CONSTRAINT encrypted_backup_page_limit CHECK(cardinality(page_ids)<=64);`,
    `CREATE TABLE encrypted_conversation_backup_pages (
      owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      id TEXT NOT NULL CHECK(id ~ '^[A-Za-z0-9._:-]{1,128}$'),
      generation BIGINT NOT NULL CHECK(generation>0),
      capsule JSONB NOT NULL CHECK(jsonb_typeof(capsule)='object' AND octet_length(capsule::text)<=2900000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id,id)
    );`
  ])
});
