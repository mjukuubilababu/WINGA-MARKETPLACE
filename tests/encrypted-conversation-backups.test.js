const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { createSecureContent } = require('../src/chat/secure-content');
const migration = require('../backend/migrations/encrypted-conversation-backups');
const { createEncryptedConversationBackupStore } = require('../backend/encrypted-conversation-backups');
const { createEncryptedConversationBackupsApi } = require('../backend/encrypted-conversation-backups-api');
const { validateRevision, validateCapsule, requireLegacyPayload } = require('../backend/encrypted-content-contract');
const { MIGRATIONS } = require('../backend/migrations');
const { verifyEncryptedConversationBackups } = require('../backend/verify-encrypted-conversation-backups');

const context = (owner = 'bob', deviceId = 'b1', token = deviceId) => ({ owner, deviceId, token });
const fixture = async () => {
  const db = new PGlite();
  await db.exec(require('./helpers/conversation-event-fixture'));
  for (const sql of migration.statements) await db.exec(sql);
  await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');
  await db.query('INSERT INTO schema_migrations VALUES($1)', [migration.id]);
  const codec = await createSecureContent();
  const key = codec.generateRecoveryKey();
  const seal = (generation = 1, owner = 'bob', text = 'private history') => codec.sealRecovery(
    new TextEncoder().encode(text), key, { owner, id: 'archive-1', generation },
  );
  const store = createEncryptedConversationBackupStore({ withTransaction: work => db.transaction(work) });
  return { db, codec, key, seal, store };
};

test('backup migration is additive and registered once', () => {
  assert.equal(MIGRATIONS.filter(value => value.id === migration.id).length, 1);
  assert.equal(migration.statements.some(sql => /ALTER TABLE messages|UPDATE messages/.test(sql)), false);
});

test('revisions and capsules reject coercion, secret fields and plaintext input', async () => {
  const codec = await createSecureContent();
  const capsule = await codec.sealRecovery(new Uint8Array([1]), codec.generateRecoveryKey(), { owner: 'bob', id: 'archive', generation: 1 });
  assert.ok(validateCapsule(capsule, 'bob', '0'));
  for (const value of [0, '-1', '01', '9007199254740991', '1.0', null]) assert.throws(() => validateRevision(value));
  for (const changed of [{ ...capsule, recoveryKey: 'secret' }, { ...capsule, ciphertext: 'plaintext!' },
    { ...capsule, owner: 'alice' }, { ...capsule, version: 2 }, { ...capsule, generation: 2 }]) {
    assert.throws(() => validateCapsule(changed, 'bob', '0'));
  }
  requireLegacyPayload({ message: 'legacy chat' });
  for (const payload of [{ message: 'fallback', securityMode: 'e2ee' }, { message: 'fallback', ciphertext: 'encrypted' },
    { message: 'fallback', cryptoEnvelope: {} }, { recoveryKey: 'secret' }]) {
    assert.throws(() => requireLegacyPayload(payload), error => error.code === 'encrypted_protocol_unavailable');
  }
});

test('ciphertext backups survive a second store, isolate accounts and retry exactly once', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.store.readEncryptedConversationBackup(context()), { version: 1, revision: '0', capsule: null });
    const payload = { expectedRevision: '0', capsule: await f.seal() };
    const accepted = await f.store.writeEncryptedConversationBackup(context(), payload);
    assert.equal(accepted.revision, '1');
    assert.deepEqual(await f.store.writeEncryptedConversationBackup(context('bob', 'b2'), payload), accepted);
    const reversed = { ...payload, capsule: Object.fromEntries(Object.entries(payload.capsule).reverse()) };
    assert.deepEqual(await f.store.writeEncryptedConversationBackup(context(), reversed), accepted);
    await assert.rejects(f.store.writeEncryptedConversationBackup(context(), { expectedRevision: '0', capsule: await f.seal(1, 'bob', 'different') }), error => error.status === 409);
    const otherNode = createEncryptedConversationBackupStore({ withTransaction: work => f.db.transaction(work) });
    assert.deepEqual(await otherNode.readEncryptedConversationBackup(context()), accepted);
    assert.equal((await otherNode.readEncryptedConversationBackup(context('alice', 'a'))).capsule, null);
    assert.deepEqual(await f.codec.openRecovery(accepted.capsule, f.key, { owner: 'bob', id: 'archive-1', generation: 1 }), new TextEncoder().encode('private history'));
    const saved = (await f.db.query('SELECT capsule::text FROM encrypted_conversation_backups')).rows[0].capsule;
    assert.equal(saved.includes('private history'), false);
    assert.equal(saved.includes(f.key), false);
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM encrypted_conversation_backups')).rows[0].count, 1);
  } finally { await f.db.close(); }
});

test('stale writes cannot overwrite or resurrect a deleted backup', async () => {
  const f = await fixture();
  try {
    const payload = { expectedRevision: '0', capsule: await f.seal() };
    await f.store.writeEncryptedConversationBackup(context(), payload);
    const deleted = await f.store.deleteEncryptedConversationBackup(context(), { expectedRevision: '1' });
    assert.deepEqual(deleted, { version: 1, revision: '2', capsule: null });
    await assert.rejects(f.store.writeEncryptedConversationBackup(context(), payload), error => error.status === 409);
    await assert.rejects(f.store.deleteEncryptedConversationBackup(context(), { expectedRevision: '1' }), error => error.status === 409);
    const next = await f.store.writeEncryptedConversationBackup(context(), { expectedRevision: '2', capsule: await f.seal(3) });
    assert.equal(next.revision, '3');
    await assert.rejects(f.store.writeEncryptedConversationBackup(context('alice', 'a'), { expectedRevision: '0', capsule: await f.seal() }), error => error.status === 400);
  } finally { await f.db.close(); }
});

test('expired, revoked, cross-owner sessions and suspended users cannot read or mutate backups', async () => {
  const f = await fixture();
  try {
    for (const invalid of [context('alice', 'b1'), context('bob', 'b1', 'forged'), context('bob', 'absent'), {}]) {
      await assert.rejects(f.store.readEncryptedConversationBackup(invalid), error => error.status === 401);
    }
    await f.db.exec("UPDATE sessions SET expires_at=0 WHERE session_id='b1'");
    await assert.rejects(f.store.writeEncryptedConversationBackup(context(), { expectedRevision: '0', capsule: await f.seal() }), error => error.status === 401);
    await f.db.exec("DELETE FROM sessions WHERE session_id='b2'");
    await assert.rejects(f.store.readEncryptedConversationBackup(context('bob', 'b2')), error => error.status === 401);
    await f.db.exec("UPDATE users SET status='suspended' WHERE username='alice'");
    await assert.rejects(f.store.readEncryptedConversationBackup(context('alice', 'a')), error => error.status === 401);
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM encrypted_conversation_backups')).rows[0].count, 0);
  } finally { await f.db.close(); }
});

test('API is disabled by default, owner-scoped, no-store and does not disclose storage failures', async () => {
  const calls = [];
  const deps = {
    collectBody: async () => ({}), sendJson: (res, status, body, headers) => calls.push({ status, body, headers }),
    findSession: () => ({ username: 'bob', token: 'b1', sessionId: 'b1' }), readAuthToken: () => 'b1',
    ensureMarketplaceUser: session => ({ username: session.username }),
    getPostgresStore: () => ({ readEncryptedConversationBackup: async input => {
      assert.deepEqual(input, context()); return { revision: '0', capsule: null };
    } })
  };
  const url = new URL('https://winga.test/api/conversations/recovery?owner=alice');
  await createEncryptedConversationBackupsApi(deps).handle({ method: 'GET' }, {}, url);
  assert.equal(calls.at(-1).status, 404);
  const api = createEncryptedConversationBackupsApi({ ...deps, enabled: true });
  await api.handle({ method: 'GET' }, {}, url);
  assert.equal(calls.at(-1).status, 200);
  assert.match(calls.at(-1).headers['Cache-Control'], /no-store/);
  await api.handle({ method: 'POST' }, {}, url);
  assert.equal(calls.at(-1).status, 405);
  await createEncryptedConversationBackupsApi({ ...deps, enabled: true,
    getPostgresStore: () => ({ readEncryptedConversationBackup: () => { throw Object.assign(new Error('private database detail'), { code: 'XXPRIVATE' }); } })
  }).handle({ method: 'GET' }, {}, url);
  assert.deepEqual(calls.at(-1).body, { code: 'encrypted_backup_unavailable' });
});

test('read-only verifier reports aggregate shape evidence, never keys or recovery completion', async () => {
  const f = await fixture();
  try {
    await f.store.writeEncryptedConversationBackup(context(), { expectedRevision: '0', capsule: await f.seal() });
    await f.db.exec('BEGIN READ ONLY');
    const verified = await verifyEncryptedConversationBackups(f.db);
    await f.db.exec('COMMIT');
    assert.equal(verified.ok, true);
    assert.equal(verified.backups, 1);
    assert.equal(verified.invalidCapsules, 0);
    assert.equal(verified.authenticatedRecoveryFlowVerified, false);
    assert.equal(verified.encryptionIntegrityVerified, false);
    assert.equal(JSON.stringify(verified).includes(f.key), false);
    await f.store.deleteEncryptedConversationBackup(context(), { expectedRevision: '1' });
    assert.equal((await verifyEncryptedConversationBackups(f.db)).tombstones, 1);
    await f.db.exec("UPDATE encrypted_conversation_backups SET capsule='{}'::jsonb");
    const invalid = await verifyEncryptedConversationBackups(f.db);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.invalidCapsules, 1);
    await f.db.exec('DELETE FROM schema_migrations');
    assert.equal((await verifyEncryptedConversationBackups(f.db)).ok, false);
  } finally { await f.db.close(); }
});
