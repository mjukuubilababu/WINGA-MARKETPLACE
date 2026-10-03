const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const { buildMlsBrowser } = require('../../scripts/build-mls-browser');
const { createConversationCryptoDeviceStore } = require('../../backend/conversation-crypto-devices');
const { createCryptoKeyPackageStore } = require('../../backend/conversation-crypto-key-packages');
let server, origin, output, db, devices, packages;

test.beforeAll(async () => {
  output = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-mls-candidate-')); buildMlsBrowser(output);
  server = http.createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none'");
    const assets = {
      '/devices.js': path.resolve(__dirname, '../../src/chat/crypto-devices.js'),
      '/vault.js': path.resolve(__dirname, '../../src/chat/encrypted-vault.js'),
      '/api.js': path.resolve(__dirname, '../../src/api/communications-client.js'),
      '/policy.js': path.resolve(__dirname, '../../src/chat/encrypted-policy.js'),
      '/mls.js': path.join(output, 'winga-mls-candidate.js'),
    };
    if (assets[request.url]) { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(assets[request.url])); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>MLS candidate integration</title><script src="/devices.js"></script><script src="/vault.js"></script><script src="/policy.js"></script><script src="/mls.js"></script><script src="/api.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(output, { recursive: true, force: true });
});
test.beforeEach(async () => {
  db = new PGlite(); await db.exec(require('../helpers/conversation-event-fixture'));
  for (const name of ['conversation-crypto-devices', 'conversation-event-ledger', 'conversation-crypto-key-packages']) {
    await db.transaction(async tx => { for (const sql of require(`../../backend/migrations/${name}`).statements) await tx.exec(sql); });
  }
  devices = createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work) });
  packages = createCryptoKeyPackageStore({ withTransaction: work => db.transaction(work) });
});
test.afterEach(async () => db.close());

async function boot(page, username) {
  return page.evaluate(async username => {
    window.session = { username, sessionId: username === 'alice' ? 'a' : 'b1', token: username === 'alice' ? 'a' : 'b1' };
    window.pins = []; window.failTransport = false;
    window.client = WingaModules.api.communications.createCommunicationsApiClient({ baseUrl: '/api',
      getSession: () => session, createAuthHeaders: () => ({}), fetchJson: window.cryptoGateway });
    window.runtime = await client.createEncryptedCandidate({ trustedPins: () => pins,
      transport: { async send(packet) {
        await window.capturePacket({ ...packet, ciphertext: Array.from(packet.ciphertext) });
        if (window.failTransport) throw new TypeError('lost_reply');
        return { id: packet.id, hash: packet.hash, status: 'sent' };
      } } });
    const identity = await runtime.initialize();
    return { ...identity, keyPackage: Array.from(identity.keyPackage), signaturePublicKey: Array.from(identity.signaturePublicKey) };
  }, username);
}
async function prepare(page, username, captured) {
  const context = { owner: username, deviceId: username === 'alice' ? 'a' : 'b1', token: username === 'alice' ? 'a' : 'b1' };
  await page.exposeFunction('cryptoGateway', async (url, options) => {
    const payload = options.body ? JSON.parse(options.body) : undefined;
    if (url.endsWith('/crypto/devices')) return options.method === 'POST'
      ? devices.mutateConversationCryptoDevice(context, payload) : devices.readConversationCryptoDevices(context);
    if (url.endsWith('/crypto/key-packages')) return packages.publishCryptoKeyPackage(context, payload);
    throw new Error('legacy_transport_must_not_be_used');
  });
  await page.exposeFunction('capturePacket', packet => { captured.push(packet); });
  await page.goto(origin); return boot(page, username);
}
const pin = (page, value) => page.evaluate(value => { pins.push({ ...value,
  signaturePublicKey: new Uint8Array(value.signaturePublicKey), status: 'active' }); }, value);

test('browser MLS replacement rotates keys under strict CSP without transferring old epoch history', async ({ page }) => {
  const violations = []; page.on('console', entry => { if (entry.text().includes('Content Security Policy')) violations.push(entry.text()); });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const records = [];
    async function participant(owner) {
      const session = { username: owner, sessionId: crypto.randomUUID(), token: crypto.randomUUID() };
      const native = { owner, id: crypto.randomUUID(), fingerprint: 'a'.repeat(64), status: 'active' };
      let revision = 0, values = {}; const pins = [], packets = [];
      const vault = { async snapshot() { return { revision: String(revision), values: structuredClone(values) }; },
        async write(change) {
          if (change.expectedRevision !== String(revision)) throw new Error('vault_conflict');
          for (const key of change.deleted || []) delete values[key];
          Object.assign(values, structuredClone(change.values)); return String(++revision);
        } };
      const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      const runtime = await WingaMlsCandidate.createMlsRuntime({ getSession: () => session, vault, trustedPins: () => pins,
        policy: { async markEncrypted() {} }, identityClient: { async enroll() { return native; },
          async attestKeyPackage(bytes) { return { hash: await digest(bytes), deviceId: native.id }; } },
        async publishPackage(payload) { return { version: 1, package: payload }; },
        transport: { async send(packet) { packets.push(packet); return { id: packet.id, hash: packet.hash, status: 'sent' }; } },
      });
      const device = await runtime.initialize(); const participant = { runtime, device, pins, packets }; records.push(participant); return participant;
    }
    try {
      const alice = await participant('alice'), old = await participant('bob'), next = await participant('bob');
      alice.pins.push({ ...old.device, status: 'active' }, { ...next.device, status: 'active' });
      old.pins.push({ ...alice.device, status: 'active' }); next.pins.push({ ...alice.device, status: 'active' });
      const id = await alice.runtime.createConversation('bob'), initial = await alice.runtime.addPeer(id, old.device.keyPackage);
      await old.runtime.acceptWelcome('alice', initial); await alice.runtime.confirmMembership(id, initial.id);
      await alice.runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'old epoch' });
      await old.runtime.receive('alice', alice.packets[0]); alice.pins[0].status = 'revoked';
      const transfer = await alice.runtime.replacePeer(id, old.device.id, '1', next.device.keyPackage);
      let pendingBlocked = false;
      try { await alice.runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'not confirmed' }); }
      catch (error) { pendingBlocked = error.code === 'mls_membership_pending'; }
      await next.runtime.acceptWelcome('alice', transfer); await alice.runtime.confirmMembership(id, transfer.id);
      await alice.runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'replacement secret' });
      const received = await next.runtime.receive('alice', alice.packets[1]); let oldExcluded = false, historyExcluded = false;
      try { await old.runtime.receive('alice', alice.packets[1]); } catch { oldExcluded = true; }
      try { await next.runtime.receive('alice', alice.packets[0]); } catch { historyExcluded = true; }
      return { epoch: transfer.epoch, pendingBlocked, oldExcluded, historyExcluded, message: received.message,
        history: (await next.runtime.history()).length };
    } finally { for (const record of records) record.runtime.close(); }
  });
  expect(result).toEqual({ epoch: '2', pendingBlocked: true, oldExcluded: true, historyExcluded: true, message: 'replacement secret', history: 1 });
  expect(violations).toEqual([]);
});

test('real browser native enrollment, MLS publication, encrypted text and durable retry under unchanged CSP', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const alice = await a.newPage(), bob = await b.newPage(), captured = [], bobCaptured = [];
    const aliceDevice = await prepare(alice, 'alice', captured), bobDevice = await prepare(bob, 'bob', bobCaptured);
    await pin(alice, bobDevice); await pin(bob, aliceDevice);
    const transfer = await alice.evaluate(async bob => {
      const id = await runtime.createConversation('bob'), result = await runtime.addPeer(id, new Uint8Array(bob.keyPackage));
      return { ...result, commit: Array.from(result.commit), welcome: Array.from(result.welcome), tree: Array.from(result.tree) };
    }, bobDevice);
    await bob.evaluate(async transfer => runtime.acceptWelcome('alice', { ...transfer,
      commit: new Uint8Array(transfer.commit), welcome: new Uint8Array(transfer.welcome), tree: new Uint8Array(transfer.tree) }), transfer);
    await alice.evaluate(transfer => runtime.confirmMembership(transfer.conversationId, transfer.id), transfer);
    const payload = await alice.evaluate(async () => {
      window.payload = await client.prepareMessage({ receiverId: 'bob', message: 'Encrypted Winga browser text', messageType: 'text' });
      window.failTransport = true;
      let error; try { await client.sendMessage(payload); } catch (failure) { error = failure.message; }
      return { id: payload.clientMessageId, error };
    });
    expect(payload.error).toBe('lost_reply'); expect(captured).toHaveLength(1);
    expect(Object.hasOwn(captured[0], 'message')).toBe(false);
    const received = await bob.evaluate(packet => runtime.receive('alice', { ...packet, ciphertext: new Uint8Array(packet.ciphertext) }), captured[0]);
    expect(received.message).toBe('Encrypted Winga browser text'); expect(received.status).toBe('delivered');
    const atRest = await alice.evaluate(async () => {
      const db = await new Promise(resolve => { const open = indexedDB.open('winga-encrypted-vault-v1:alice'); open.onsuccess = () => resolve(open.result); });
      try {
        if (!db.objectStoreNames.contains('records')) return { found: false };
        const records = await new Promise(resolve => { const read = db.transaction('records').objectStore('records').getAll(); read.onsuccess = () => resolve(read.result); });
        return { found: true, protected: records.length > 0 && records.every(row => row.v === 1 && row.ciphertext instanceof Uint8Array
          && !JSON.stringify(row).includes('Encrypted Winga browser text')), localStorage: localStorage.length };
      } finally { db.close(); }
    });
    expect(atRest).toEqual({ found: true, protected: true, localStorage: 0 });
    await alice.reload();
    const downgraded = await alice.evaluate(async () => {
      const client = WingaModules.api.communications.createCommunicationsApiClient({
        getSession: () => ({ username: 'alice', sessionId: 'a', token: 'a' }),
        fetchJson: () => { throw new Error('plaintext_leak'); },
      });
      try { await client.sendMessage({ receiverId: 'bob', message: 'must not leak' }); }
      catch (error) { return error.code; }
    });
    expect(downgraded).toBe('mls_runtime_required');
    const restored = await boot(alice, 'alice'); await pin(alice, bobDevice);
    expect(restored.id).toBe(aliceDevice.id); expect(restored.signaturePublicKey).toEqual(aliceDevice.signaturePublicKey);
    const retry = await alice.evaluate(id => runtime.retryMessage(id), payload.id);
    expect(retry.status).toBe('sent'); expect(captured).toHaveLength(2); expect(captured[1]).toEqual(captured[0]);
    const replay = await bob.evaluate(packet => runtime.receive('alice', { ...packet, ciphertext: new Uint8Array(packet.ciphertext) }), captured[1]);
    expect(replay).toEqual(received);
    const rows = await db.query('SELECT hash,device_id,identity_proof FROM conversation_crypto_key_packages ORDER BY device_id');
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every(row => row.identity_proof.signature && row.identity_proof.owner)).toBe(true);
  } finally { await a.close(); await b.close(); }
});
