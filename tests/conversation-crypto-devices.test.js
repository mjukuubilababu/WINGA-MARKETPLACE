const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const migration = require('../backend/migrations/conversation-crypto-devices');
const bindingsMigration = require('../backend/migrations/conversation-crypto-session-bindings');
const { MIGRATIONS } = require('../backend/migrations');
const { createConversationCryptoDeviceStore, operationBytes } = require('../backend/conversation-crypto-devices');
const { createConversationCryptoDevicesApi } = require('../backend/conversation-crypto-devices-api');

const context = { owner: 'bob', deviceId: 'b1', token: 'b1' };
function device() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const bytes = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { id: crypto.randomUUID(), privateKey: keys.privateKey,
    publicKey: bytes.toString('base64url'), fingerprint: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function proof(target, actor = target, action = 'register', ctx = context, overrides = {}) {
  const value = { action, deviceId: target.id, actorId: actor.id, publicKey: target.publicKey,
    fingerprint: target.fingerprint, requestId: crypto.randomUUID(), issuedAt: Date.now(),
    signature: Buffer.alloc(64).toString('base64url'), ...overrides };
  value.signature = crypto.sign(null, operationBytes(ctx, value), actor.privateKey).toString('base64url');
  return value;
}
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(require('./helpers/conversation-event-fixture'));
  await db.exec(`ALTER TABLE sessions DROP CONSTRAINT sessions_session_id_key;
    ALTER TABLE sessions ALTER COLUMN session_id SET DEFAULT '';
    CREATE UNIQUE INDEX idx_sessions_session_id_unique ON sessions(session_id) WHERE session_id<>'';`);
  for (const sql of migration.statements) await db.exec(sql);
  for (const sql of bindingsMigration.statements) await db.exec(sql);
  return { db, store: createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work) }) };
}

test('device migration is additive and registered exactly once', () => {
  assert.equal(MIGRATIONS.filter(item => item.id === migration.id).length, 1);
  assert.equal(migration.statements.some(sql => /ALTER TABLE messages|UPDATE messages/.test(sql)), false);
});

test('session binding migration has the agreed schema and never guesses existing device mappings', async t => {
  const { db, store } = await fixture(t);
  assert.equal(bindingsMigration.id, '2026100804_crypto_session_bindings');
  assert.equal(bindingsMigration.statements.some(sql => /(?:^|\n)\s*(?:INSERT INTO|UPDATE |ALTER TABLE)/.test(sql)), false);
  assert.equal((await db.query('SELECT * FROM conversation_crypto_session_bindings')).rows.length, 0);
  assert.equal((await db.query('SELECT * FROM sessions')).rows.length, 4);
  await db.exec(`INSERT INTO sessions(token,username,expires_at) VALUES
    ('legacy-1','bob',9999999999999),('legacy-2','bob',9999999999999);`);
  for (const sql of bindingsMigration.statements) await db.exec(sql);
  assert.equal((await db.query('SELECT * FROM sessions WHERE session_id=$1', [''])).rows.length, 2);
  assert.deepEqual((await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_name='conversation_crypto_session_bindings' ORDER BY column_name`)).rows.map(row => row.column_name),
  ['crypto_device_id', 'owner_id', 'session_id', 'session_token']);
  assert.deepEqual((await db.query(`SELECT confupdtype,confdeltype FROM pg_constraint
    WHERE conrelid='conversation_crypto_session_bindings'::regclass AND confrelid='sessions'::regclass`)).rows,
  [{ confupdtype: 'c', confdeltype: 'c' }]);
  const target = device();
  await store.mutateConversationCryptoDevice(context, proof(target));
  const insert = 'INSERT INTO conversation_crypto_session_bindings(session_id,session_token,owner_id,crypto_device_id) VALUES($1,$2,$3,$4)';
  await assert.rejects(db.query(insert, ['b2', 'b1', 'bob', target.id]), { code: '23503' });
  await assert.rejects(db.query(insert, ['a', 'a', 'bob', target.id]), { code: '23503' });
  await assert.rejects(db.query(insert, ['', 'legacy-1', 'bob', target.id]), { code: '23514' });
});

test('noncanonical keys, mismatched fingerprints and extra secret fields are rejected', () => {
  const payload = proof(device());
  for (const changed of [{ ...payload, privateKey: 'secret' }, { ...payload, issuedAt: '1' },
    { ...payload, publicKey: payload.publicKey + '=' }, { ...payload, fingerprint: '0'.repeat(64) },
    { ...payload, signature: 'AA' }, { ...payload, action: 'reset' }]) {
    assert.throws(() => operationBytes(context, changed), error => error.code === 'crypto_device_invalid');
  }
});

test('first device activates; additional device requires active-device signature', async t => {
  const { store, db } = await fixture(t);
  const first = device(), second = device();
  const secondContext = { ...context, deviceId: 'b2', token: 'b2' };
  assert.equal((await store.mutateConversationCryptoDevice(context, proof(first))).device.status, 'active');
  assert.equal((await store.mutateConversationCryptoDevice(secondContext, proof(second, second, 'register', secondContext))).device.status, 'pending');
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(second, second, 'approve')),
    error => error.code === 'crypto_device_proof_rejected');
  assert.equal((await store.mutateConversationCryptoDevice(context, proof(second, first, 'approve'))).device.status, 'active');
  assert.equal((await store.readConversationCryptoDevices(context)).devices.length, 2);
  assert.deepEqual((await db.query('SELECT * FROM conversation_crypto_session_bindings ORDER BY session_id')).rows,
    [{ session_id: 'b1', session_token: 'b1', owner_id: 'bob', crypto_device_id: first.id },
      { session_id: 'b2', session_token: 'b2', owner_id: 'bob', crypto_device_id: second.id }]);
});

test('exact retries survive expiry but changed requests and cross-session replays fail', async t => {
  const { db, store } = await fixture(t);
  const target = device(), payload = proof(target);
  const accepted = await store.mutateConversationCryptoDevice(context, payload);
  // Simulate an accepted registration predating this additive migration.
  await db.exec('DELETE FROM conversation_crypto_session_bindings');
  for (const sql of bindingsMigration.statements) await db.exec(sql);
  assert.equal((await db.query('SELECT * FROM conversation_crypto_session_bindings')).rows.length, 0);
  const later = createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work), now: () => Date.now() + 60000 });
  assert.deepEqual(await later.mutateConversationCryptoDevice(context, payload), accepted);
  assert.deepEqual((await db.query('SELECT * FROM conversation_crypto_session_bindings')).rows,
    [{ session_id: 'b1', session_token: 'b1', owner_id: 'bob', crypto_device_id: target.id }]);
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(target, target, 'register', context,
    { requestId: payload.requestId, issuedAt: payload.issuedAt + 1 })), error => error.status === 409);
  await assert.rejects(store.mutateConversationCryptoDevice({ ...context, token: 'b2', deviceId: 'b2' }, payload),
    error => error.code === 'crypto_device_operation_conflict');
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM conversation_crypto_operations')).rows[0].count, 1);
});

test('proof binds owner and session; substituted signatures and expired proofs leave no rows', async t => {
  const { store, db } = await fixture(t);
  const target = device(), payload = proof(target);
  await assert.rejects(store.mutateConversationCryptoDevice({ owner: 'alice', token: 'a', deviceId: 'a' }, payload),
    error => error.status === 403);
  await assert.rejects(store.mutateConversationCryptoDevice(context, { ...payload, signature: Buffer.alloc(64).toString('base64url') }),
    error => error.status === 403);
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(target, target, 'register', context, { issuedAt: Date.now() - 60000 })),
    error => error.code === 'crypto_device_proof_expired');
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM conversation_crypto_devices')).rows[0].count, 0);
  assert.equal((await db.query('SELECT * FROM conversation_crypto_session_bindings')).rows.length, 0);
});

test('existing devices bind only after signed session-specific re-enrollment and session deletion cascades', async t => {
  const { store, db } = await fixture(t);
  const target = device(), secondContext = { ...context, deviceId: 'b2', token: 'b2' };
  const original = proof(target);
  await store.mutateConversationCryptoDevice(context, original);
  await assert.rejects(store.mutateConversationCryptoDevice(secondContext, original), { code: 'crypto_device_operation_conflict' });
  assert.equal((await db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b2'])).rows.length, 0);
  const secondEnrollment = proof(target, target, 'register', secondContext);
  await store.mutateConversationCryptoDevice(secondContext, secondEnrollment);
  assert.deepEqual((await db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b2'])).rows,
    [{ session_id: 'b2', session_token: 'b2', owner_id: 'bob', crypto_device_id: target.id }]);
  await db.query('DELETE FROM sessions WHERE session_id=$1', ['b2']);
  assert.equal((await db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b2'])).rows.length, 0);
  await db.query('INSERT INTO sessions(token,username,session_id,expires_at) VALUES($1,$2,$3,$4)', ['new-b2-token', 'bob', 'b2', 9999999999999]);
  await store.mutateConversationCryptoDevice({ ...secondContext, token: 'new-b2-token' }, secondEnrollment);
  assert.deepEqual((await db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b2'])).rows,
    [{ session_id: 'b2', session_token: 'new-b2-token', owner_id: 'bob', crypto_device_id: target.id }]);
  assert.equal((await store.readConversationCryptoDevices(context)).devices[0].status, 'active');
});

test('fresh and cached revoked registration stay denied without logging out retained marketplace sessions', async t => {
  const { store, db } = await fixture(t);
  const first = device(), survivor = device(), secondContext = { ...context, deviceId: 'b2', token: 'b2' };
  const original = proof(first);
  await store.mutateConversationCryptoDevice(context, original);
  await store.mutateConversationCryptoDevice(secondContext, proof(survivor, survivor, 'register', secondContext));
  await store.mutateConversationCryptoDevice(context, proof(survivor, first, 'approve'));
  await store.mutateConversationCryptoDevice(secondContext, proof(first, survivor, 'revoke', secondContext));
  await assert.rejects(store.mutateConversationCryptoDevice(context, original), { code: 'crypto_device_identity_conflict' });
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(first)), { code: 'crypto_device_identity_conflict' });
  assert.equal((await db.query('SELECT * FROM sessions WHERE session_id=$1', ['b1'])).rows.length, 1);
  assert.equal((await store.readConversationCryptoDevices(context)).devices.find(item => item.id === first.id).status, 'revoked');
  assert.deepEqual((await db.query('SELECT * FROM conversation_crypto_session_bindings WHERE session_id=$1', ['b2'])).rows,
    [{ session_id: 'b2', session_token: 'b2', owner_id: 'bob', crypto_device_id: survivor.id }]);
});

test('revocation retains tombstones and prevents silent reset after the last active device', async t => {
  const { store } = await fixture(t);
  const first = device(), pending = device();
  await store.mutateConversationCryptoDevice(context, proof(first));
  await store.mutateConversationCryptoDevice(context, proof(pending));
  await store.mutateConversationCryptoDevice(context, proof(first, first, 'revoke'));
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(first)), error => error.status === 409);
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(pending, first, 'approve')), error => error.status === 403);
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof(device())), error => error.code === 'crypto_identity_recovery_required');
  assert.ok((await store.readConversationCryptoDevices(context)).devices.some(item => item.status === 'revoked'));
});

test('key reuse and cross-owner device takeover are rejected', async t => {
  const { store } = await fixture(t);
  const first = device();
  await store.mutateConversationCryptoDevice(context, proof(first));
  await assert.rejects(store.mutateConversationCryptoDevice(context, proof({ ...first, id: crypto.randomUUID() })), error => error.status === 409);
  const alice = { owner: 'alice', token: 'a', deviceId: 'a' };
  await assert.rejects(store.mutateConversationCryptoDevice(alice, proof(first, first, 'register', alice)), error => error.status === 409);
});

test('session expiry, deletion and account suspension block reads and cached mutations', async t => {
  const { store, db } = await fixture(t);
  const payload = proof(device());
  await store.mutateConversationCryptoDevice(context, payload);
  await db.exec("UPDATE sessions SET expires_at=0 WHERE session_id='b1'");
  await assert.rejects(store.readConversationCryptoDevices(context), error => error.status === 401);
  await assert.rejects(store.mutateConversationCryptoDevice(context, payload), error => error.status === 401);
  await db.exec("DELETE FROM sessions WHERE session_id='b2'");
  await assert.rejects(store.readConversationCryptoDevices({ ...context, token: 'b2', deviceId: 'b2' }), error => error.status === 401);
  await db.exec("UPDATE users SET status='suspended' WHERE username='alice'");
  await assert.rejects(store.readConversationCryptoDevices({ owner: 'alice', token: 'a', deviceId: 'a' }), error => error.status === 401);
});

test('API defaults off, scopes owner to session and hides storage errors', async () => {
  const calls = [];
  const deps = { collectBody: async () => ({}), sendJson: (res, status, body, headers) => calls.push({ status, body, headers }),
    findSession: () => ({ username: 'bob', token: 'b1', sessionId: 'b1' }), readAuthToken: () => 'b1',
    ensureMarketplaceUser: session => ({ username: session.username }),
    getPostgresStore: () => ({ readConversationCryptoDevices: async input => { assert.deepEqual(input, context); return { version: 1, devices: [] }; },
      mutateConversationCryptoDevice: async () => { throw new Error('private storage detail'); } }) };
  const url = new URL('https://winga.test/api/conversations/crypto/devices?owner=alice');
  await createConversationCryptoDevicesApi(deps).handle({ method: 'GET' }, {}, url);
  assert.equal(calls.at(-1).status, 404);
  const api = createConversationCryptoDevicesApi({ ...deps, enabled: true });
  await api.handle({ method: 'GET' }, {}, url);
  assert.equal(calls.at(-1).status, 200);
  assert.equal(calls.at(-1).headers['Cache-Control'], 'private, no-store');
  await api.handle({ method: 'POST' }, {}, url);
  assert.deepEqual(calls.at(-1).body, { code: 'crypto_devices_unavailable' });
  await api.handle({ method: 'DELETE' }, {}, url);
  assert.equal(calls.at(-1).status, 405);
});

test('communications helper uses current auth headers and rejects account/session changes', async () => {
  const sandbox = { window: {}, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/api/communications-client.js'), 'utf8'), sandbox);
  let session = { username: 'bob', sessionId: 'b1', token: 'b1' };
  const calls = [];
  const client = sandbox.window.WingaModules.api.communications.createCommunicationsApiClient({
    baseUrl: '/api', getSession: () => session, createAuthHeaders: () => ({ Authorization: 'Bearer b1' }),
    fetchJson: async (url, options) => { calls.push({ url, options }); return { version: 1 }; }
  });
  await client.cryptoDeviceRequest('POST', { action: 'register' }, context);
  assert.equal(calls[0].url, '/api/conversations/crypto/devices');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer b1');
  assert.equal(calls[0].options.body, '{"action":"register"}');
  session = { ...session, username: 'alice' };
  assert.throws(() => client.cryptoDeviceRequest('GET', undefined, context), /crypto_device_session_changed/);
  assert.equal(calls.length, 1);
});
