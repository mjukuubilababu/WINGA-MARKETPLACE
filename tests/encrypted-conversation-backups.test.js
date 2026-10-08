const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { createSecureContent } = require('../src/chat/secure-content');
const migration = require('../backend/migrations/encrypted-conversation-backups');
const { createEncryptedConversationBackupStore } = require('../backend/encrypted-conversation-backups');
const { createEncryptedConversationBackupsApi } = require('../backend/encrypted-conversation-backups-api');
const { createConversationCryptoDeviceStore, operationBytes } = require('../backend/conversation-crypto-devices');
const { createConversationCryptoDevicesApi } = require('../backend/conversation-crypto-devices-api');
const { validateRevision, validateCapsule, requireLegacyPayload } = require('../backend/encrypted-content-contract');
const { MIGRATIONS } = require('../backend/migrations');
const { verifyEncryptedConversationBackups } = require('../backend/verify-encrypted-conversation-backups');

const context = (owner = 'bob', deviceId = 'b1', token = deviceId) => ({ owner, deviceId, token });
function device() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const bytes = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { id: crypto.randomUUID(), privateKey: keys.privateKey, publicKey: bytes.toString('base64url'),
    fingerprint: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function proof(ctx, target, actor = target, action = 'register') {
  const payload = { action, deviceId: target.id, actorId: actor.id, publicKey: target.publicKey,
    fingerprint: target.fingerprint, requestId: crypto.randomUUID(), issuedAt: Date.now(),
    signature: Buffer.alloc(64).toString('base64url') };
  payload.signature = crypto.sign(null, operationBytes(ctx, payload), actor.privateKey).toString('base64url');
  return payload;
}
const fixture = async ({ enroll = true } = {}) => {
  const db = new PGlite();
  await db.exec(require('./helpers/conversation-event-fixture'));
  await db.exec(`ALTER TABLE sessions DROP CONSTRAINT sessions_session_id_key;
    ALTER TABLE sessions ALTER COLUMN session_id SET DEFAULT '';
    CREATE UNIQUE INDEX idx_sessions_session_id_unique ON sessions(session_id) WHERE session_id<>'';`);
  for (const sql of migration.statements) await db.exec(sql);
  for (const sql of require('../backend/migrations/encrypted-history-pages').statements) await db.exec(sql);
  for (const name of ['conversation-crypto-devices', 'conversation-crypto-session-bindings']) {
    for (const sql of require('../backend/migrations/' + name).statements) await db.exec(sql);
  }
  await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');
  await db.query('INSERT INTO schema_migrations VALUES($1)', [migration.id]);
  await db.query('INSERT INTO schema_migrations VALUES($1)', ['2026100608_encrypted_history_pages']);
  const codec = await createSecureContent();
  const key = codec.generateRecoveryKey();
  const seal = (generation = 1, owner = 'bob', text = 'private history') => codec.sealRecovery(
    new TextEncoder().encode(text), key, { owner, id: 'archive-1', generation },
  );
  const store = createEncryptedConversationBackupStore({ withTransaction: work => db.transaction(work) });
  const cryptoStore = createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work) });
  const devices = { first: device(), survivor: device(), alice: device() };
  const deps = {
    enabled: true, collectBody: async req => req.payload,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    findSession: token => ({ username: { b1: 'bob', b2: 'bob', a: 'alice', e: 'eve' }[token], token, sessionId: token }),
    readAuthToken: req => req.token, ensureMarketplaceUser: session => ({ username: session.username }),
    getPostgresStore: () => ({ ...store, ...cryptoStore })
  };
  const cryptoApi = createConversationCryptoDevicesApi(deps), backupApi = createEncryptedConversationBackupsApi(deps);
  async function cryptoRequest(ctx, payload) {
    const res = {};
    await cryptoApi.handle({ method: 'POST', token: ctx.token, payload }, res, new URL('https://winga.test/api/conversations/crypto/devices'));
    return res;
  }
  async function backupRequest(ctx, method, payload, path = '/api/conversations/recovery') {
    const res = {};
    await backupApi.handle({ method, token: ctx.token, payload }, res, new URL(path, 'https://winga.test'));
    return res;
  }
  if (enroll) {
    for (const [ctx, target] of [[context(), devices.first], [context('bob', 'b2'), devices.survivor], [context('alice', 'a'), devices.alice]]) {
      assert.equal((await cryptoRequest(ctx, proof(ctx, target))).status, 200);
    }
    assert.equal((await cryptoRequest(context(), proof(context(), devices.survivor, devices.first, 'approve'))).status, 200);
  }
  return { db, codec, key, seal, store, devices, cryptoRequest, backupRequest };
};

async function assertBackupDenied(f, ctx, root, page, revision) {
  const pagePath = '/api/conversations/recovery/pages';
  for (const [method, payload, path] of [
    ['GET', undefined, '/api/conversations/recovery'],
    ['PUT', root, '/api/conversations/recovery'],
    ['DELETE', { expectedRevision: revision }, '/api/conversations/recovery'],
    ['GET', undefined, pagePath + '?id=' + page.capsule.id + '&revision=' + revision],
    ['PUT', page, pagePath]
  ]) {
    assert.deepEqual(await f.backupRequest(ctx, method, payload, path),
      { status: 401, body: { code: 'backup_unauthorized' } });
  }
}

test('backup migration is additive and registered once', () => {
  assert.equal(MIGRATIONS.filter(value => value.id === migration.id).length, 1);
  assert.equal(migration.statements.some(sql => /ALTER TABLE messages|UPDATE messages/.test(sql)), false);
});

test('unbound and signed pending devices cannot recover or mutate archives until active-device approval', async () => {
  const f = await fixture({ enroll: false });
  try {
    const firstContext = context(), secondContext = context('bob', 'b2');
    assert.equal((await f.cryptoRequest(firstContext, proof(firstContext, f.devices.first))).status, 200);
    const page = { expectedRevision: '0', capsule: await f.codec.sealRecovery(new Uint8Array([7]), f.key,
      { owner: 'bob', id: 'approved-history', generation: 1 }) };
    const root = { expectedRevision: '0', capsule: await f.seal(), pageIds: [page.capsule.id] };
    await f.store.writeEncryptedHistoryPage(firstContext, page);
    await f.store.writeEncryptedConversationBackup(firstContext, root);
    // An account's active first device is not evidence for another native session.
    await assertBackupDenied(f, secondContext, root, page, '1');
    const registration = proof(secondContext, f.devices.survivor);
    const pending = await f.cryptoRequest(secondContext, registration);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.device.status, 'pending');
    await assertBackupDenied(f, secondContext, root, page, '1');
    assert.deepEqual(await f.cryptoRequest(secondContext, registration), pending);
    await assertBackupDenied(f, secondContext, root, page, '1');
    assert.equal((await f.cryptoRequest(firstContext, proof(firstContext, f.devices.survivor, f.devices.first, 'approve'))).status, 200);
    const recovered = await f.backupRequest(secondContext, 'GET');
    assert.equal(recovered.status, 200);
    assert.deepEqual(await f.codec.openRecovery(recovered.body.capsule, f.key,
      { owner: 'bob', id: 'archive-1', generation: 1 }), new TextEncoder().encode('private history'));
    assert.deepEqual((await f.backupRequest(secondContext, 'GET', undefined,
      '/api/conversations/recovery/pages?id=approved-history&revision=1')).body.capsule, page.capsule);
    assert.equal((await f.backupRequest(secondContext, 'PUT', root)).status, 200);
  } finally { await f.db.close(); }
});

test('survivor revokes a crypto device without deleting its session; only survivor can access future roots and pages', async () => {
  const f = await fixture();
  try {
    const retained = context(), survivor = context('bob', 'b2');
    const registration = proof(retained, f.devices.first);
    assert.equal((await f.cryptoRequest(retained, registration)).status, 200);
    const page1 = { expectedRevision: '0', capsule: await f.codec.sealRecovery(new Uint8Array([1]), f.key,
      { owner: 'bob', id: 'before-revoke', generation: 1 }) };
    await f.store.writeEncryptedHistoryPage(retained, page1);
    await f.store.writeEncryptedConversationBackup(retained,
      { expectedRevision: '0', capsule: await f.seal(), pageIds: [page1.capsule.id] });
    const revoked = await f.cryptoRequest(survivor, proof(survivor, f.devices.first, f.devices.survivor, 'revoke'));
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.device.status, 'revoked');
    assert.deepEqual(await f.cryptoRequest(retained, registration),
      { status: 409, body: { code: 'crypto_device_identity_conflict' } });
    assert.deepEqual(await f.cryptoRequest(retained, proof(retained, f.devices.first)),
      { status: 409, body: { code: 'crypto_device_identity_conflict' } });
    const sessions = (await f.db.query('SELECT session_id,expires_at FROM sessions ORDER BY session_id')).rows;
    assert.equal(sessions.length, 4);
    assert.ok(Number(sessions.find(row => row.session_id === retained.deviceId).expires_at) > Date.now());
    assert.deepEqual((await f.db.query('SELECT * FROM conversation_crypto_session_bindings WHERE owner_id=$1 ORDER BY session_id', ['bob'])).rows,
      [{ session_id: 'b1', session_token: 'b1', owner_id: 'bob', crypto_device_id: f.devices.first.id },
        { session_id: 'b2', session_token: 'b2', owner_id: 'bob', crypto_device_id: f.devices.survivor.id }]);
    const page2 = { expectedRevision: '1', capsule: await f.codec.sealRecovery(new Uint8Array([2]), f.key,
      { owner: 'bob', id: 'after-revoke', generation: 2 }) };
    const root2 = { expectedRevision: '1', capsule: await f.seal(2), pageIds: [page2.capsule.id] };
    assert.equal((await f.backupRequest(survivor, 'PUT', page2, '/api/conversations/recovery/pages')).status, 200);
    const published = await f.backupRequest(survivor, 'PUT', root2);
    assert.equal(published.status, 200);
    assert.equal(published.body.revision, '2');
    // Even exact accepted retries must authorize before returning root/page data.
    await assertBackupDenied(f, retained, root2, page2, '2');
    const page3 = { expectedRevision: '2', capsule: await f.codec.sealRecovery(new Uint8Array([3]), f.key,
      { owner: 'bob', id: 'next-page', generation: 3 }) };
    const root3 = { expectedRevision: '2', capsule: await f.seal(3), pageIds: [page3.capsule.id] };
    await assertBackupDenied(f, retained, root3, page3, '2');
    assert.deepEqual(await f.backupRequest(survivor, 'GET'), published);
    assert.deepEqual((await f.backupRequest(survivor, 'GET', undefined,
      '/api/conversations/recovery/pages?id=after-revoke&revision=2')).body.capsule, page2.capsule);
    assert.equal((await f.backupRequest(survivor, 'PUT', page3, '/api/conversations/recovery/pages')).status, 200);
    assert.equal((await f.backupRequest(survivor, 'PUT', root3)).status, 200);
    assert.deepEqual(await f.backupRequest(survivor, 'DELETE', { expectedRevision: '3' }),
      { status: 200, body: { version: 1, revision: '4', capsule: null } });
    assert.equal((await f.db.query('SELECT * FROM encrypted_conversation_backup_pages')).rows.length, 0);
  } finally { await f.db.close(); }
});

test('ordinary session token rotation cascades the signed binding; new-token backup CRUD works and logout removes it', async () => {
  const f = await fixture();
  try {
    const oldContext = context(), refreshed = context('bob', 'b1', 'refreshed-b1-token');
    const original = (await f.db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b1'])).rows[0];
    await f.db.query('UPDATE sessions SET token=$1 WHERE token=$2 AND username=$3',
      [refreshed.token, oldContext.token, oldContext.owner]);
    assert.deepEqual((await f.db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b1'])).rows,
      [{ ...original, session_token: refreshed.token }]);
    const page = { expectedRevision: '0', capsule: await f.codec.sealRecovery(new Uint8Array([9]), f.key,
      { owner: 'bob', id: 'after-token-refresh', generation: 1 }) };
    const root = { expectedRevision: '0', capsule: await f.seal(), pageIds: [page.capsule.id] };
    for (const operation of [
      () => f.store.readEncryptedConversationBackup(oldContext),
      () => f.store.writeEncryptedConversationBackup(oldContext, root),
      () => f.store.deleteEncryptedConversationBackup(oldContext, { expectedRevision: '0' }),
      () => f.store.readEncryptedHistoryPage(oldContext, { id: page.capsule.id, revision: '0' }),
      () => f.store.writeEncryptedHistoryPage(oldContext, page)
    ]) await assert.rejects(operation(), { code: 'backup_unauthorized' });
    assert.deepEqual(await f.store.readEncryptedConversationBackup(refreshed), { version: 1, revision: '0', capsule: null });
    await f.store.writeEncryptedHistoryPage(refreshed, page);
    const accepted = await f.store.writeEncryptedConversationBackup(refreshed, root);
    assert.deepEqual(await f.store.readEncryptedConversationBackup(refreshed), accepted);
    assert.deepEqual((await f.store.readEncryptedHistoryPage(refreshed, { id: page.capsule.id, revision: '1' })).capsule, page.capsule);
    const updated = await f.store.writeEncryptedConversationBackup(refreshed,
      { expectedRevision: '1', capsule: await f.seal(2) });
    assert.equal(updated.revision, '2');
    assert.deepEqual(await f.store.deleteEncryptedConversationBackup(refreshed, { expectedRevision: '2' }),
      { version: 1, revision: '3', capsule: null });
    assert.equal((await f.db.query('SELECT * FROM encrypted_conversation_backup_pages')).rows.length, 0);
    await f.db.query('DELETE FROM sessions WHERE token=$1 AND username=$2', [refreshed.token, refreshed.owner]);
    assert.equal((await f.db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b1'])).rows.length, 0);
    await assert.rejects(f.store.readEncryptedConversationBackup(refreshed), { code: 'backup_unauthorized' });
    assert.equal((await f.store.readEncryptedConversationBackup(context('bob', 'b2'))).revision, '3');
  } finally { await f.db.close(); }
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

test('paged roots publish only complete owner-bound pages and retry exactly across stores',async()=>{
  const f=await fixture();
  try {
    const page=await f.codec.sealRecovery(new TextEncoder().encode('private archive page'),f.key,{owner:'bob',id:'page-1',generation:1});
    const root={expectedRevision:'0',capsule:await f.seal(),pageIds:[page.id]};
    await assert.rejects(f.store.writeEncryptedConversationBackup(context(),root),{code:'backup_pages_incomplete'});
    assert.equal((await f.store.readEncryptedConversationBackup(context())).revision,'0');
    await assert.rejects(f.store.writeEncryptedHistoryPage(context('alice','a'),{expectedRevision:'0',capsule:page}),{code:'invalid_encrypted_backup'});
    await f.store.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule:page});
    await assert.rejects(f.store.readEncryptedHistoryPage(context(),{id:page.id,revision:'0'}),{code:'backup_page_unavailable'});
    const accepted=await f.store.writeEncryptedConversationBackup(context(),root);
    const other=createEncryptedConversationBackupStore({withTransaction:work=>f.db.transaction(work)});
    assert.deepEqual(await other.writeEncryptedConversationBackup(context('bob','b2'),root),accepted);
    assert.deepEqual((await other.readEncryptedHistoryPage(context('bob','b2'),{id:page.id,revision:'1'})).capsule,page);
    assert.deepEqual(await other.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule:page}),{version:1,id:page.id});
    for(const pageIds of [null,[page.id,page.id],['missing']])await assert.rejects(other.writeEncryptedConversationBackup(context(),{...root,pageIds}));
    const changed=await f.codec.sealRecovery(new Uint8Array([9]),f.key,{owner:'bob',id:'page-1',generation:1});
    await assert.rejects(other.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule:changed}),{code:'backup_page_conflict'});
    await assert.rejects(other.readEncryptedHistoryPage(context('alice','a'),{id:page.id,revision:'1'}),{code:'backup_revision_conflict'});
    const stored=JSON.stringify((await f.db.query('SELECT capsule FROM encrypted_conversation_backup_pages')).rows);
    assert.equal(stored.includes('private archive page'),false);assert.equal(stored.includes(f.key),false);
    await other.deleteEncryptedConversationBackup(context(),{expectedRevision:'1'});
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_backup_pages')).rows[0].n,0);
    await assert.rejects(other.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule:page}),{code:'backup_revision_conflict'});
  }finally{await f.db.close();}
});

test('archive page staging is bounded and revoked sessions cannot publish or retrieve it',async()=>{
  const f=await fixture();
  try {
    for(let n=0;n<64;n++) {
      const capsule=await f.codec.sealRecovery(new Uint8Array([n]),f.key,{owner:'bob',id:'p-'+n,generation:1});
      await f.store.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule});
    }
    const capsule=await f.codec.sealRecovery(new Uint8Array([1]),f.key,{owner:'bob',id:'too-many',generation:1});
    await assert.rejects(f.store.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule}),{code:'backup_page_limit'});
    await f.db.exec("UPDATE sessions SET expires_at=0 WHERE session_id='b1'");
    await assert.rejects(f.store.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule}),{code:'backup_unauthorized'});
    await assert.rejects(f.store.readEncryptedHistoryPage(context(),{id:'p-0',revision:'0'}),{code:'backup_unauthorized'});
    assert.equal((await f.store.readEncryptedConversationBackup(context('bob','b2'))).revision,'0');
  }finally{await f.db.close();}
});

test('deleting an unpublished paged archive tombstones its revision and blocks delayed publication',async()=>{
  const f=await fixture();try{
    const capsule=await f.codec.sealRecovery(new Uint8Array([1]),f.key,{owner:'bob',id:'unpublished',generation:1});
    await f.store.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule});
    assert.deepEqual(await f.store.deleteEncryptedConversationBackup(context(),{expectedRevision:'0'}),{version:1,revision:'1',capsule:null});
    await assert.rejects(f.store.writeEncryptedHistoryPage(context(),{expectedRevision:'0',capsule}),{code:'backup_revision_conflict'});
    await assert.rejects(f.store.writeEncryptedConversationBackup(context(),{expectedRevision:'0',capsule:await f.seal(),pageIds:[capsule.id]}),{code:'backup_revision_conflict'});
    assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_backup_pages')).rows[0].n,0);
  }finally{await f.db.close();}
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
