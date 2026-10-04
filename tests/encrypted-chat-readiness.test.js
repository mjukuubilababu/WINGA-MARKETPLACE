const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { verifyEncryptedChatReadiness, probePrivateEncryptedStorage } = require("../backend/verify-encrypted-chat-readiness");
const { migrations } = require("../backend/verify-encrypted-chat-readiness");
const env = {
  R2_ACCOUNT_ID: "a".repeat(32), R2_BUCKET_NAME: "public-fixture", R2_CONVERSATION_BUCKET_NAME: "private-fixture",
  R2_CONVERSATION_ACCESS_KEY_ID: "secret-access-fixture", R2_CONVERSATION_SECRET_ACCESS_KEY: "secret-key-fixture",
  R2_CONVERSATION_API_TOKEN: "secret-api-fixture", R2_CONVERSATION_ISOLATION_CONFIRMED: "true"
};
function client(schemaOverrides = {}) {
  return { query: async sql => {
    assert.match(sql.trim(), /^SELECT/);
    if (sql.includes("AS migrations")) return { rows: [{ migrations: 8, guards: 2, media: true, devices: true, replacements: true, retirements: true, ...schemaOverrides }] };
    if (sql.includes('AS "migrationApplied"')) return { rows: [{ migrationApplied: true, backupTablePresent: true }] };
    return { rows: [{ backups: 0, tombstones: 0, invalidCapsules: 0 }] };
  } };
}
test("readiness verifies private isolation and schema without enabling features or exposing credentials", async () => {
  let checks = 0;
  const result = await verifyEncryptedChatReadiness({ client: client(), env,
    privacyCheck: async config => { checks++; assert.equal(config.bucket, env.R2_CONVERSATION_BUCKET_NAME); } });
  assert.equal(result.preflightReady, true); assert.equal(result.ok, true); assert.equal(checks, 1);
  assert.equal(result.features.mediaEnabled, false); assert.equal(result.features.recoveryEnabled, false);
  assert.equal(result.remoteWrites, false); assert.equal(result.databaseChanged, false); assert.equal(result.flagsChanged, false);
  assert.equal(result.authenticatedMediaFlowVerified, false); assert.equal(result.cryptographicAuditApproved, false);
  for (const key of ["R2_CONVERSATION_ACCESS_KEY_ID", "R2_CONVERSATION_SECRET_ACCESS_KEY", "R2_CONVERSATION_API_TOKEN", "R2_CONVERSATION_BUCKET_NAME"])
    assert.equal(JSON.stringify(result).includes(env[key]), false);
});

test("read-only readiness checks the actual migrated schema and rejects disabled downgrade guards", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(require('./helpers/conversation-event-fixture'));
  await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');
  for (const name of ['conversation-event-ledger','conversation-crypto-devices','conversation-security-mode',
    'conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-media',
    'encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-conversation-backups']) {
    const migration = require(`../backend/migrations/${name}`);
    await db.transaction(async tx => { for (const sql of migration.statements) await tx.exec(sql); });
    if (migrations.includes(migration.id)) await db.query('INSERT INTO schema_migrations VALUES($1)',[migration.id]);
  }
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const ready = await verifyEncryptedChatReadiness({client:db,env,privacyCheck:async()=>{}});
  await db.exec('COMMIT');
  assert.equal(ready.ok,true); assert.equal(ready.schema.migrationsApplied,8);
  assert.equal(ready.schema.guardTriggersEnabled,2);
  await db.exec('ALTER TABLE messages DISABLE TRIGGER guard_legacy_message');
  const denied = await verifyEncryptedChatReadiness({client:db,env,privacyCheck:async()=>{}});
  assert.equal(denied.ok,false); assert.equal(denied.schema.guardTriggersEnabled,1);
});
test("missing configuration, public bucket, privacy denial and missing guards fail closed", async () => {
  for (const changed of [{ R2_CONVERSATION_BUCKET_NAME: "" }, { R2_CONVERSATION_BUCKET_NAME: env.R2_BUCKET_NAME },
    { R2_CONVERSATION_ISOLATION_CONFIRMED: "false" }]) {
    let checked = false;
    const result = await verifyEncryptedChatReadiness({ client: client(), env: { ...env, ...changed },
      privacyCheck: async () => { checked = true; } });
    assert.equal(result.ok, false); assert.equal(result.privateStorage.configurationValid, false); assert.equal(checked, false);
  }
  const rejected = await verifyEncryptedChatReadiness({ client: client(), env, privacyCheck: async () => { throw Error("secret-provider-error"); } });
  assert.equal(rejected.ok, false); assert.equal(rejected.privateStorage.privacyVerified, false);
  assert.equal(JSON.stringify(rejected).includes("secret-provider-error"), false);
  const schema = await verifyEncryptedChatReadiness({ client: client({ guards: 1 }), env, privacyCheck: async () => {} });
  assert.equal(schema.ok, false); assert.equal(schema.schema.ready, false);
});
test("explicit synthetic storage probe roundtrips ciphertext and always cleans up, never certifying account flow", async () => {
  let stored, deleted = false, authorized = false;
  const result = await probePrivateEncryptedStorage({ env, storageFactory: ({ authorize }) => ({
    put: async (context, object, bytes) => { authorized = await authorize(context, object); stored = Buffer.from(bytes);
      assert.equal(stored.subarray(0,8).toString(), "WINGAEM2"); },
    get: async () => stored,
    remove: async () => { deleted = true; },
    close: () => {}
  }) });
  assert.equal(result.ok, true); assert.equal(authorized, true); assert.equal(deleted, true);
  assert.equal(result.cleanupAcknowledged,true);
  assert.equal(result.databaseChanged, false); assert.equal(result.authenticatedMediaFlowVerified, false);
});
test("uncertain upload and failed cleanup are reported without leaking provider details", async () => {
  let removed = false;
  const result = await probePrivateEncryptedStorage({ env, storageFactory: () => ({
    put: async () => { throw Error("secret-provider-error"); },
    remove: async () => { removed = true; throw Error("secret-cleanup-error"); },
    close: () => {}
  }) });
  assert.equal(removed, true); assert.equal(result.ok, false); assert.equal(result.remoteWrites, true);
  assert.equal(result.errorCode, "PRIVATE_ENCRYPTED_STORAGE_CLEANUP_REQUIRED");
  assert.equal(JSON.stringify(result).includes("secret-provider"), false);
});
