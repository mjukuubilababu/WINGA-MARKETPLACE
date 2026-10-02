async function verifyEncryptedConversationBackups(client) {
  const schema = (await client.query(`SELECT
    EXISTS(SELECT 1 FROM schema_migrations WHERE migration_id='2026100201_encrypted_conversation_backups') AS "migrationApplied",
    to_regclass('encrypted_conversation_backups') IS NOT NULL AS "backupTablePresent"`)).rows[0];
  const ready = schema.migrationApplied === true && schema.backupTablePresent === true;
  const counts = ready ? (await client.query(`SELECT
    COUNT(*) FILTER (WHERE capsule IS NOT NULL)::int AS backups,
    COUNT(*) FILTER (WHERE capsule IS NULL)::int AS tombstones,
    COUNT(*) FILTER (WHERE capsule IS NOT NULL AND NOT COALESCE(
      jsonb_typeof(capsule)='object'
      AND (SELECT COUNT(*) FROM jsonb_object_keys(capsule))=8
      AND capsule ?& ARRAY['version','algorithm','purpose','owner','id','generation','nonce','ciphertext']
      AND capsule->'version'='1'::jsonb
      AND capsule->>'algorithm'='webcrypto-aes256gcm-v1'
      AND capsule->>'purpose'='history-recovery' AND capsule->>'owner'=owner_id
      AND capsule->>'generation'=revision::text AND jsonb_typeof(capsule->'generation')='number'
      AND capsule->>'id' ~ '^[a-zA-Z0-9._:-]{1,128}$'
      AND jsonb_typeof(capsule->'nonce')='string' AND capsule->>'nonce' ~ '^[A-Za-z0-9_-]{16}$'
      AND jsonb_typeof(capsule->'ciphertext')='string'
      AND capsule->>'ciphertext' ~ '^[A-Za-z0-9_-]+$'
      AND length(capsule->>'ciphertext') BETWEEN 23 AND 5592427, false))::int AS "invalidCapsules"
    FROM encrypted_conversation_backups`)).rows[0] : {};
  return { ok: ready && counts.invalidCapsules === 0,
    mode: 'verify-encrypted-conversation-backups', privacy: 'aggregate-only', ...schema, ...counts,
    databaseChanged: false, authenticatedRecoveryFlowVerified: false, encryptionIntegrityVerified: false,
    crossConnectionConcurrencyVerified: false };
}
if (require.main === module) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  (async () => {
    try {
      if (!process.env.DATABASE_URL) throw new Error('Database unavailable');
      await client.connect(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await verifyEncryptedConversationBackups(client); await client.query('COMMIT');
      console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
    } catch {
      console.log(JSON.stringify({ ok: false, errorCode: 'ENCRYPTED_BACKUP_CHECK_FAILED', databaseChanged: false }));
      process.exitCode = 1;
    } finally { await client.end().catch(() => {}); }
  })();
}
module.exports = { verifyEncryptedConversationBackups };
