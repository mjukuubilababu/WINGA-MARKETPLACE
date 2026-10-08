const crypto = require("node:crypto");
const { readPrivateMediaConfig, createPrivateMediaStorage } = require("./conversation-private-media");
const { assertPrivateBucket } = require("./backup-legacy-private-media");
const { verifyEncryptedConversationBackups } = require("./verify-encrypted-conversation-backups");

const migrations = [
  "2026100201_encrypted_conversation_backups", "2026100301_conversation_crypto_devices",
  "2026100302_conversation_security_mode", "2026100303_conversation_crypto_key_packages",
  "2026100304_encrypted_conversations", "2026100305_encrypted_conversation_media",
  "2026100306_encrypted_conversation_replacement", "2026100307_encrypted_replacement_retirements",
  "2026100605_encrypted_device_delivery", "2026100606_encrypted_device_admissions", "2026100607_encrypted_device_lifecycle", "2026100608_encrypted_history_pages", "2026100609_encrypted_native_history"
];
const configurationKeys = [
  "R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_CONVERSATION_BUCKET_NAME",
  "R2_CONVERSATION_ACCESS_KEY_ID", "R2_CONVERSATION_SECRET_ACCESS_KEY",
  "R2_CONVERSATION_API_TOKEN", "R2_CONVERSATION_ISOLATION_CONFIRMED"
];

async function verifyEncryptedChatReadiness({ client, env = process.env, privacyCheck = assertPrivateBucket, checkStorage = true } = {}) {
  const result = {
    ok: false, mode: "verify-encrypted-chat-readiness", privacy: "aggregate-only",
    databaseChanged: false, remoteWrites: false, flagsChanged: false,
    authenticatedMediaFlowVerified: false, authenticatedRecoveryFlowVerified: false,
    deviceReplacementFlowVerified: false, cryptographicAuditApproved: false
  };
  const schema = (await client.query(`SELECT
    (SELECT COUNT(*)::int FROM schema_migrations WHERE migration_id=ANY($1::text[])) AS migrations,
    (SELECT COUNT(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A')
      AND ((tgname='guard_conversation_security_mode' AND tgrelid=to_regclass('conversation_event_streams'))
        OR (tgname='guard_legacy_message' AND tgrelid=to_regclass('messages')))) AS guards,
    to_regclass('encrypted_conversation_media') IS NOT NULL AS media,
    to_regclass('conversation_crypto_devices') IS NOT NULL AS devices,
    to_regclass('encrypted_conversation_replacements') IS NOT NULL AS replacements,
    to_regclass('encrypted_replacement_retirements') IS NOT NULL AS retirements,
    to_regclass('encrypted_conversation_epoch_devices') IS NOT NULL AS epoch_devices,
    to_regclass('encrypted_conversation_receipt_acks') IS NOT NULL AS receipt_acks,
    to_regclass('encrypted_conversation_device_admissions') IS NOT NULL AS admissions,
    to_regclass('encrypted_conversation_device_acceptances') IS NOT NULL AS acceptances,
    to_regclass('encrypted_conversation_device_retirements') IS NOT NULL AS device_retirements,
    to_regclass('encrypted_conversation_sync_acks') IS NOT NULL AS sync_acks,
    to_regclass('encrypted_conversation_backup_pages') IS NOT NULL AS backup_pages,
    to_regclass('encrypted_conversation_media_archive_grants') IS NOT NULL AS archive_grants,
    to_regclass('encrypted_conversation_history_transfers') IS NOT NULL AS history_transfers,
    to_regclass('encrypted_conversation_history_pages') IS NOT NULL AS history_pages,
    to_regclass('encrypted_conversation_archive_reads') IS NOT NULL AS archive_reads,
    to_regclass('encrypted_conversation_archive_read_acks') IS NOT NULL AS archive_read_acks,
    (SELECT COUNT(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A')
      AND ((tgname='guard_encrypted_epoch_device' AND tgrelid=to_regclass('encrypted_conversation_epoch_devices'))
        OR (tgname='seed_encrypted_epoch_devices' AND tgrelid=to_regclass('encrypted_conversation_epochs')))) AS device_guards`, [migrations])).rows[0];
  result.schema = { ready: schema.migrations === migrations.length && schema.guards === 2
      && schema.media && schema.devices && schema.replacements && schema.retirements
      && schema.epoch_devices && schema.receipt_acks && schema.admissions && schema.acceptances
      && schema.device_retirements && schema.sync_acks && schema.backup_pages && schema.archive_grants && schema.history_transfers
      && schema.history_pages && schema.archive_reads && schema.archive_read_acks && schema.device_guards===2,
    migrationsApplied: schema.migrations, migrationsRequired: migrations.length, guardTriggersEnabled: schema.guards,
    deviceGrantTriggersEnabled: schema.device_guards };
  result.recovery = await verifyEncryptedConversationBackups(client);
  result.schema.ready = result.schema.ready && result.recovery.ok;
  result.features = {
    devicesEnabled: env.WINGA_CRYPTO_DEVICES_ENABLED === "true",
    mlsEnabled: env.WINGA_MLS_CANDIDATE_ENABLED === "true",
    conversationsEnabled: env.WINGA_ENCRYPTED_CONVERSATIONS_ENABLED === "true",
    mediaEnabled: env.WINGA_ENCRYPTED_MEDIA_ENABLED === "true",
    recoveryEnabled: env.WINGA_ENCRYPTED_BACKUP_ENABLED === "true",
    multiDeviceEnabled: env.WINGA_ENCRYPTED_MULTIDEVICE_ENABLED === "true"
  };
  result.privateStorage = {
    configurationValid: false, privacyVerified: false,
    missingConfiguration: configurationKeys.filter(key => !String(env[key] || "").trim()),
    credentialScopeAttested: env.R2_CONVERSATION_ISOLATION_CONFIRMED === "true",
    credentialScopeIndependentlyVerified: false
  };
  let config;
  try {
    config = readPrivateMediaConfig(env);
    result.privateStorage.configurationValid = true;
    if(checkStorage) {
      await privacyCheck(config);
      result.privateStorage.privacyVerified = true;
    }
  } catch {
    result.privateStorage.errorCode = result.privateStorage.configurationValid
      ? "PRIVATE_BUCKET_PRIVACY_CHECK_FAILED" : "PRIVATE_BUCKET_CONFIGURATION_REQUIRED";
  }
  result.preflightReady = Boolean(result.schema.ready && result.privateStorage.privacyVerified);
  result.ok = result.preflightReady;
  return result;
}

async function probePrivateEncryptedStorage({ env = process.env, storageFactory = createPrivateMediaStorage } = {}) {
  const result = { ok: false, scope: "synthetic-storage-only", remoteWrites: false,
    ciphertextRoundtripVerified: false, plaintextRoundtripVerified: false, cleanupAcknowledged: false,
    databaseChanged: false, authenticatedMediaFlowVerified: false };
  const codec = await require("../src/chat/secure-content").createSecureContent(crypto.webcrypto);
  const binding = { conversationId: crypto.randomUUID(), attachmentId: crypto.randomUUID() };
  const input = Buffer.from(crypto.randomBytes(32));
  const sealed = await codec.encryptMedia(new Blob([input]), binding, { name: "storage-probe", mime: "application/octet-stream" });
  const bytes = new Uint8Array(await sealed.ciphertext.arrayBuffer());
  const object = { id: binding.attachmentId, bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  const context = Object.freeze({ purpose: "synthetic-encrypted-storage-probe" });
  const storage = storageFactory({ env, authorize: async (candidate, resource) =>
    candidate.purpose === context.purpose && resource.id === object.id
      && resource.sha256 === object.sha256 && resource.bytes === object.bytes });
  let attempted = false;
  try {
    attempted = result.remoteWrites = true;
    await storage.put(context, object, bytes);
    const received = await storage.get(context, object);
    result.ciphertextRoundtripVerified = Buffer.from(received).equals(Buffer.from(bytes));
    const opened = await codec.decryptMedia(new Blob([received]), sealed.descriptor, binding);
    result.plaintextRoundtripVerified = Buffer.from(await opened.blob.arrayBuffer()).equals(input);
  } catch { result.errorCode = "PRIVATE_ENCRYPTED_STORAGE_PROBE_FAILED"; }
  finally {
    if (attempted) {
      try { await storage.remove(context, object); result.cleanupAcknowledged = true; }
      catch { result.errorCode = "PRIVATE_ENCRYPTED_STORAGE_CLEANUP_REQUIRED"; }
    }
    input.fill(0); bytes.fill(0); await storage.close();
  }
  result.ok = result.ciphertextRoundtripVerified && result.plaintextRoundtripVerified && result.cleanupAcknowledged;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const probe = args.includes("--storage-probe");
  if (args.some(arg => !["--storage-probe", "--confirm=probe-private-encrypted-media"].includes(arg))
    || (probe && !args.includes("--confirm=probe-private-encrypted-media"))) {
    console.log(JSON.stringify({ ok: false, errorCode: "EXPLICIT_STORAGE_PROBE_CONFIRMATION_REQUIRED",
      databaseChanged: false, remoteWrites: false }));
    process.exitCode = 1; return;
  }
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL).toLowerCase() === "true" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  try {
    if (!process.env.DATABASE_URL) throw new Error();
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await verifyEncryptedChatReadiness({ client });
    await client.query("COMMIT");
    if (probe && result.preflightReady) {
      result.storageProbe = await probePrivateEncryptedStorage();
      result.remoteWrites = result.storageProbe.remoteWrites;
      result.ok = result.ok && result.storageProbe.ok;
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ ok: false, errorCode: "ENCRYPTED_CHAT_READINESS_CHECK_FAILED",
      databaseChanged: false, remoteWrites: false, flagsChanged: false }));
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
if (require.main === module) main();
module.exports = { verifyEncryptedChatReadiness, probePrivateEncryptedStorage, migrations };
