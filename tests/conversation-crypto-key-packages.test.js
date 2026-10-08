const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { createConversationCryptoDeviceStore, operationBytes } = require('../backend/conversation-crypto-devices');
const { createCryptoKeyPackageStore, packageProofBytes } = require('../backend/conversation-crypto-key-packages');
const { MIGRATIONS } = require('../backend/migrations');
const { createConversationCryptoDevicesApi } = require('../backend/conversation-crypto-devices-api');
const context = { owner: 'bob', deviceId: 'b1', token: 'b1' };
async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(require('./helpers/conversation-event-fixture'));
  for (const name of ['conversation-event-ledger', 'conversation-crypto-devices', 'conversation-crypto-session-bindings', 'conversation-crypto-key-packages']) {
    await db.transaction(async tx => { for (const sql of require(`../backend/migrations/${name}`).statements) await tx.exec(sql); });
  }
  const keys = crypto.generateKeyPairSync('ed25519');
  const raw = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const identity = { owner: 'bob', id: crypto.randomUUID(), fingerprint: crypto.createHash('sha256').update(raw).digest('hex') };
  const payload = { action: 'register', deviceId: identity.id, actorId: identity.id, publicKey: raw.toString('base64url'),
    fingerprint: identity.fingerprint, requestId: crypto.randomUUID(), issuedAt: Date.now(), signature: Buffer.alloc(64).toString('base64url') };
  payload.signature = crypto.sign(null, operationBytes(context, payload), keys.privateKey).toString('base64url');
  const deviceStore = createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work) });
  await deviceStore.mutateConversationCryptoDevice(context, payload);
  const mls = await import('ts-mls');
  const suite = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const generate = async (binding = identity, lifetime) => {
    const seconds = BigInt(Math.floor(Date.now() / 1000));
    return mls.generateKeyPackage({ credentialType: 'basic', identity: new TextEncoder().encode(JSON.stringify([
      'winga-mls-device', 1, binding.owner, binding.id, binding.fingerprint])) }, mls.defaultCapabilities(),
    lifetime || { notBefore: seconds - 10n, notAfter: seconds + 86400n }, [], suite);
  };
  const proof = pkg => {
    const wire = Buffer.from(mls.encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: pkg.publicPackage }));
    const value = { deviceId: identity.id, requestId: crypto.randomUUID(), issuedAt: Date.now(), keyPackage: wire.toString('base64url'),
      hash: crypto.createHash('sha256').update(wire).digest('hex'), signature: Buffer.alloc(64).toString('base64url') };
    value.signature = crypto.sign(null, packageProofBytes(context, value), keys.privateKey).toString('base64url');
    return value;
  };
  return { db, identity, mls, suite, generate, proof, keys,
    store: createCryptoKeyPackageStore({ withTransaction: work => db.transaction(work) }) };
}
test('package migration is registered after device and ledger dependencies', () => {
  const ids = MIGRATIONS.map(item => item.id), index = ids.indexOf('2026100303_conversation_crypto_key_packages');
  assert.ok(index > ids.indexOf('2026100301_conversation_crypto_devices'));
  assert.equal(ids.filter(id => id === '2026100303_conversation_crypto_key_packages').length, 1);
});
test('native identity attests independent MLS signing key, publishes once and exposes public material only', async t => {
  const f = await fixture(t), packageKeys = await f.generate(), payload = f.proof(packageKeys);
  const result = await f.store.publishCryptoKeyPackage(context, payload);
  assert.equal(result.package.hash, payload.hash);
  assert.notEqual(result.package.mlsPublicKey, f.keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url'));
  assert.deepEqual(await f.store.publishCryptoKeyPackage(context, payload), result);
  assert.equal((await f.store.readOwnCryptoKeyPackages(context)).packages.length, 1);
  const saved = JSON.stringify((await f.db.query('SELECT * FROM conversation_crypto_key_packages')).rows);
  assert.equal(saved.includes(Buffer.from(packageKeys.privatePackage.signaturePrivateKey).toString('base64url')), false);
  assert.equal((await f.store.readOwnCryptoKeyPackages({ owner: 'alice', deviceId: 'a', token: 'a' })).packages.length, 0);
});
test('substituted owner, device, native identity and expired lifetime are rejected', async t => {
  const f = await fixture(t);
  for (const binding of [{ ...f.identity, owner: 'alice' }, { ...f.identity, id: crypto.randomUUID() },
    { ...f.identity, fingerprint: '0'.repeat(64) }]) {
    await assert.rejects(f.store.publishCryptoKeyPackage(context, f.proof(await f.generate(binding))), error => error.code === 'crypto_package_invalid');
  }
  const seconds = BigInt(Math.floor(Date.now() / 1000));
  await assert.rejects(f.store.publishCryptoKeyPackage(context, f.proof(await f.generate(f.identity,
    { notBefore: seconds - 200n, notAfter: seconds - 100n }))), error => error.code === 'crypto_package_invalid');
});
test('invalid internal leaf signature fails even with valid outer MLS and native signatures', async t => {
  const f = await fixture(t), pkg = await f.generate();
  pkg.publicPackage.leafNode.signature = new Uint8Array(64);
  const { signKeyPackage } = await import('ts-mls/keyPackage.js');
  pkg.publicPackage = await signKeyPackage(pkg.publicPackage, pkg.privatePackage.signaturePrivateKey, f.suite.signature);
  await assert.rejects(f.store.publishCryptoKeyPackage(context, f.proof(pkg)), error => error.code === 'crypto_package_invalid');
});
test('revoked and pending devices cannot republish or read packages', async t => {
  const f = await fixture(t), payload = f.proof(await f.generate());
  await f.store.publishCryptoKeyPackage(context, payload);
  await f.db.query("UPDATE conversation_crypto_devices SET status='pending' WHERE id=$1", [f.identity.id]);
  await assert.rejects(f.store.publishCryptoKeyPackage(context, payload), error => error.status === 403);
  assert.equal((await f.store.readOwnCryptoKeyPackages(context)).packages.length, 0);
  await f.db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE id=$1", [f.identity.id]);
  await assert.rejects(f.store.publishCryptoKeyPackage(context, payload), error => error.status === 403);
});

test('key-package API needs both gates, scopes authenticated owner and bounds request size', async () => {
  let sent, bodyLimit, reads = 0;
  const deps = { collectBody: async (_, options) => { bodyLimit = options.maxBytes; return {}; },
    sendJson: (_, status, body, headers) => { sent = { status, body, headers }; },
    findSession: () => ({ token: 'b1', sessionId: 'b1', username: 'bob' }), readAuthToken: () => 'b1',
    ensureMarketplaceUser: value => ({ username: value.username }), getPostgresStore: () => ({
      readOwnCryptoKeyPackages: async value => { assert.deepEqual(value, context); reads++; return { packages: [] }; },
      publishCryptoKeyPackage: async value => { assert.deepEqual(value, context); throw new Error('private provider details'); } }) };
  const url = new URL('https://winga.test/api/conversations/crypto/key-packages?owner=alice');
  for (const gates of [{}, { enabled: true }, { packagesEnabled: true }]) {
    await createConversationCryptoDevicesApi({ ...deps, ...gates }).handle({ method: 'GET' }, {}, url);
    assert.equal(sent.status, 404);
  }
  assert.equal(reads, 0);
  const api = createConversationCryptoDevicesApi({ ...deps, enabled: true, packagesEnabled: true });
  await api.handle({ method: 'GET' }, {}, url);
  assert.equal(sent.status, 200); assert.equal(sent.headers['Cache-Control'], 'private, no-store');
  await api.handle({ method: 'POST' }, {}, url);
  assert.equal(bodyLimit, 16384); assert.equal(sent.status, 503);
  assert.equal(JSON.stringify(sent.body).includes('private provider'), false);
});
