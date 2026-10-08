const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCryptoDeviceClient } = require('../src/chat/crypto-devices');
const { operationBytes } = require('../backend/conversation-crypto-devices');

const initialSession = { username: 'bob', sessionId: 'b1', token: 'b1' };

// Only IDB persistence is synthetic; enrollment uses the real client and Ed25519 proofs.
function identityDatabase(initial, calls) {
  let row = initial;
  const db = {
    close: () => calls.push('identity:close'),
    transaction() {
      let aborted = false;
      const tx = {
        abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
        objectStore: () => ({
          put: value => { row = value; },
          get() {
            const request = {};
            queueMicrotask(() => {
              request.result = row;
              request.onsuccess();
              queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
            });
            return request;
          }
        })
      };
      return tx;
    }
  };
  return {
    open() {
      calls.push('identity:open');
      const request = {};
      queueMicrotask(() => { request.result = db; request.onsuccess(); });
      return request;
    }
  };
}

async function fixture({ status = 'active', switchOnRegister, switchOnVault = false, registerError,
  switchOnIdentityCreated, switchAfterEnroll, switchAfterRecoveryCreated, initialChanges } = {}) {
  const calls = [];
  let session = { ...initialSession, ...initialChanges };
  const keys = await crypto.webcrypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
  const raw = Buffer.from(await crypto.webcrypto.subtle.exportKey('raw', keys.publicKey));
  const identity = { owner: 'bob', id: crypto.randomUUID(), privateKey: keys.privateKey,
    publicKey: raw.toString('base64url'), fingerprint: crypto.createHash('sha256').update(raw).digest('hex'), pending: null };
  const indexedDB = identityDatabase(identity, calls);
  const view = { id: identity.id, owner: identity.owner, publicKey: identity.publicKey,
    fingerprint: identity.fingerprint, status };
  const sandbox = {
    window: {}, URLSearchParams,
    WingaCryptoDevices: { async createCryptoDeviceClient(options) {
      const client = await createCryptoDeviceClient({ ...options, indexedDB, crypto: crypto.webcrypto, secureContext: true });
      if (switchOnIdentityCreated) session = { ...session, ...switchOnIdentityCreated };
      return { ...client, async enroll() {
        const result = await client.enroll();
        if (switchAfterEnroll) session = { ...session, ...switchAfterEnroll };
        return result;
      } };
    } },
    WingaEncryptedVault: { async createEncryptedVault({ owner, getSession }) {
      calls.push('recovery:vault');
      assert.equal(owner, 'bob');
      assert.equal(getSession().token, 'b1');
      if (switchOnVault) session = { ...session, token: 'replacement' };
      return { close: () => calls.push('vault:close') };
    } },
    WingaSecureContent: { async loadSecureContent() { calls.push('recovery:codec'); return {}; } },
    WingaRecoveryClient: { createRecoveryClient: () => ({}) }
  };
  vm.createContext(sandbox);
  for (const file of ['src/chat/recovery-ui.js', 'src/api/communications-client.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  if (switchAfterRecoveryCreated) {
    const createRecoverySession = sandbox.WingaRecoveryUi.createRecoverySession;
    sandbox.WingaRecoveryUi.createRecoverySession = async options => {
      const recovery = await createRecoverySession(options);
      session = { ...session, ...switchAfterRecoveryCreated };
      return recovery;
    };
  }
  const client = sandbox.window.WingaModules.api.communications.createCommunicationsApiClient({
    baseUrl: '/api', getSession: () => session,
    createAuthHeaders: () => ({ Authorization: 'Bearer ' + session.token }),
    async fetchJson(url, options) {
      assert.equal(options.headers.Authorization, 'Bearer b1');
      if (url === '/api/conversations/crypto/devices') {
        if (options.method === 'POST') {
          calls.push('device:register');
          const payload = JSON.parse(options.body);
          assert.equal(payload.action, 'register');
          assert.equal(payload.deviceId, identity.id);
          assert.equal(payload.actorId, identity.id);
          assert.equal(Object.hasOwn(payload, 'privateKey'), false);
          const context = { owner: 'bob', deviceId: 'b1', token: 'b1' };
          assert.ok(crypto.verify(null, operationBytes(context, payload), crypto.KeyObject.from(keys.publicKey),
            Buffer.from(payload.signature, 'base64url')));
          if (registerError) throw registerError;
          if (switchOnRegister) session = { ...session, ...switchOnRegister };
          return { version: 1, device: { ...view, status: 'active' } };
        }
        calls.push('device:list');
        return { version: 1, devices: [view] };
      }
      assert.equal(url, '/api/conversations/recovery');
      assert.equal(options.method, 'GET');
      calls.push('recovery:GET');
      return { version: 1, revision: '0', capsule: null };
    }
  });
  return { client, calls, replaceSession: changes => { session = { ...session, ...changes }; } };
}

test('recovery-first bootstrap signs the existing identity before its first backup GET and closes enrollment', async () => {
  const f = await fixture();
  const recovery = await f.client.createEncryptedRecovery();
  assert.deepEqual(f.calls, ['identity:open', 'device:register', 'device:list',
    'recovery:vault', 'recovery:codec', 'identity:close']);
  try {
    assert.deepEqual(await recovery.state(), { version: 1, revision: '0', capsule: null });
    assert.equal(f.calls.at(-1), 'recovery:GET');
  } finally { recovery.close(); }
  assert.equal(f.calls.at(-1), 'vault:close');
});

for (const status of ['pending', 'revoked']) {
  test('recovery-first bootstrap rejects authoritative ' + status + ' device status without backup access', async () => {
    const f = await fixture({ status });
    await assert.rejects(f.client.createEncryptedRecovery(), { code: 'crypto_device_pending' });
    assert.deepEqual(f.calls, ['identity:open', 'device:register', 'device:list', 'identity:close']);
  });
}

for (const [field, value] of [['username', 'alice'], ['sessionId', 'b2'], ['token', 'replacement']]) {
  test('recovery-first bootstrap fails closed when ' + field + ' changes during signed enrollment', async () => {
    const f = await fixture({ switchOnRegister: { [field]: value } });
    await assert.rejects(f.client.createEncryptedRecovery(), { code: 'crypto_device_session_changed' });
    assert.deepEqual(f.calls, ['identity:open', 'device:register', 'identity:close']);
  });
}

for (const phase of ['switchOnIdentityCreated', 'switchAfterEnroll', 'switchAfterRecoveryCreated']) {
  for (const [field, value] of [['username', 'alice'], ['sessionId', 'b2'], ['token', 'replacement']]) {
    test('actual recovery factory fences ' + field + ' changes at ' + phase + ' and closes allocated resources', async () => {
      const f = await fixture({ [phase]: { [field]: value } });
      await assert.rejects(f.client.createEncryptedRecovery(), { code: 'recovery_session_changed' });
      const expected = ['identity:open'];
      if (phase !== 'switchOnIdentityCreated') expected.push('device:register', 'device:list');
      if (phase === 'switchAfterRecoveryCreated') expected.push('recovery:vault', 'recovery:codec', 'vault:close');
      expected.push('identity:close');
      assert.deepEqual(f.calls, expected);
    });
  }
}

test('actual recovery factory rejects a missing initial account before opening identity or recovery', async () => {
  const f = await fixture({ initialChanges: { username: '' } });
  await assert.rejects(f.client.createEncryptedRecovery(), { code: 'recovery_session_changed' });
  assert.deepEqual(f.calls, []);
});

test('recovery bootstrap closes identity and vault when session changes during recovery initialization', async () => {
  const f = await fixture({ switchOnVault: true });
  await assert.rejects(f.client.createEncryptedRecovery(), { code: 'recovery_session_changed' });
  assert.deepEqual(f.calls, ['identity:open', 'device:register', 'device:list',
    'recovery:vault', 'recovery:codec', 'vault:close', 'identity:close']);
});

test('a replacement session cannot fetch backup state from an already bootstrapped recovery session', async () => {
  const f = await fixture();
  const recovery = await f.client.createEncryptedRecovery();
  try {
    f.replaceSession({ sessionId: 'b2', token: 'b2' });
    await assert.rejects(recovery.state(), { code: 'recovery_session_changed' });
    assert.equal(f.calls.includes('recovery:GET'), false);
  } finally { recovery.close(); }
});

test('failed signed enrollment closes identity without creating recovery or fetching backups', async () => {
  const rejected = Object.assign(new Error('crypto_device_identity_conflict'), { code: 'crypto_device_identity_conflict', status: 409 });
  const f = await fixture({ registerError: rejected });
  await assert.rejects(f.client.createEncryptedRecovery(), error => error === rejected);
  assert.deepEqual(f.calls, ['identity:open', 'device:register', 'identity:close']);
});
