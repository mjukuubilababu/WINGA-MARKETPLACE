async function verifyDeviceReceiptSchema(client) {
  const result = await client.query(`SELECT
    EXISTS(SELECT 1 FROM schema_migrations WHERE migration_id='2026092803_message_device_receipts') AS "migrationApplied",
    to_regclass('message_device_receipts') IS NOT NULL AS "receiptTablePresent",
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('messages')
      AND tgname='preserve_message_device_receipts' AND tgenabled='O') AS "restoreTriggerPresent",
    EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('idx_sessions_session_id_unique')
      AND indisvalid AND indisunique) AS "deviceIdentityIndexed"`);
  const row = result.rows[0];
  return { ok: Object.values(row).every(value => value === true), mode: "verify-message-device-receipts",
    privacy: "aggregate-only", ...row, databaseChanged: false, authenticatedDeviceFlowVerified: false };
}

if (require.main === module) {
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL).toLowerCase() === "true" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  (async () => {
    try {
      if (!process.env.DATABASE_URL) throw new Error("Database unavailable");
      await client.connect();
      await client.query("BEGIN READ ONLY");
      const result = await verifyDeviceReceiptSchema(client);
      await client.query("COMMIT");
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } catch {
      console.log(JSON.stringify({ ok: false, errorCode: "DEVICE_RECEIPT_SCHEMA_CHECK_FAILED", databaseChanged: false }));
      process.exitCode = 1;
    } finally { await client.end().catch(() => {}); }
  })();
}

module.exports = { verifyDeviceReceiptSchema };
