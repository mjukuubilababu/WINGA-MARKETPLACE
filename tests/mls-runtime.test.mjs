import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMlsRuntime, inspectBoundKeyPackage } from '../src/chat/mls-runtime.mjs';
import { verifyBoundKeyPackage } from '../backend/conversation-mls-protocol.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const queues = new Map();
const locks = { async request(name, work) {
  const before = queues.get(name) || Promise.resolve(); let release;
  const tail = new Promise(resolve => { release = resolve; }); queues.set(name, tail);
  await before; try { return await work(); } finally { release(); if (queues.get(name) === tail) queues.delete(name); }
} };
function memoryVault() {
  let revision = 0, values = {};
  return {
    rejectNext: false,
    async snapshot() { return { revision: String(revision), values: structuredClone(values) }; },
    async write(change) {
      if (this.rejectNext) { this.rejectNext = false; throw Object.assign(new Error('storage_aborted'), { code: 'storage_aborted' }); }
      assert.equal(change.expectedRevision, String(revision));
      for (const key of change.deleted || []) delete values[key];
      Object.assign(values, structuredClone(change.values)); return String(++revision);
    },
  };
}
async function participant(owner) {
  const session = { username: owner, sessionId: randomUUID(), token: randomUUID() };
  const identity = { owner, id: randomUUID(), fingerprint: hash(webcrypto.getRandomValues(new Uint8Array(32))), status: 'active' };
  const vault = memoryVault(), pins = [], packets = [], publications = [];
  const options = {
    getSession: () => session, vault, locks, crypto: webcrypto,
    policy: { async markEncrypted() {} },
    identityClient: {
      async enroll() { return identity; },
      async attestKeyPackage(bytes) { return { deviceId: identity.id, requestId: randomUUID(), issuedAt: Date.now(),
        keyPackage: Buffer.from(bytes).toString('base64url'), hash: hash(bytes) }; },
    },
    trustedPins: () => pins,
    async publishPackage(payload) {
      publications.push(structuredClone(payload));
      await verifyBoundKeyPackage(Buffer.from(payload.keyPackage, 'base64url'), identity);
      return { version: 1, package: { hash: payload.hash, deviceId: identity.id } };
    },
    transport: { async send(packet) {
      packets.push(structuredClone(packet)); return { id: packet.id, hash: packet.hash, status: 'sent' };
    } },
  };
  const runtime = await createMlsRuntime(options), device = await runtime.initialize();
  return { runtime, options, session, identity, device, vault, pins, packets, publications };
}
async function pair() {
  const alice = await participant('alice'), bob = await participant('bob');
  for (const [a, b] of [[alice, bob], [bob, alice]]) a.pins.push({ ...b.device, status: 'active' });
  const id = await alice.runtime.createConversation('bob');
  const transfer = await alice.runtime.addPeer(id, bob.device.keyPackage);
  await bob.runtime.acceptWelcome('alice', transfer);
  await alice.runtime.confirmMembership(id, transfer.id);
  return { alice, bob, id, transfer };
}
const message = text => ({ clientMessageId: randomUUID(), receiverId: 'bob', message: text, messageType: 'text' });

test('native-bound packages and actual MLS encrypted text round trip without plaintext transport', async () => {
  const { alice, bob } = await pair(), payload = message('siri ya Winga');
  const sent = await alice.runtime.sendMessage(payload);
  assert.equal(sent.status, 'sent'); assert.equal(sent.encrypted, true);
  const packet = alice.packets[0];
  assert.equal(Object.hasOwn(packet, 'message'), false);
  assert.equal(Buffer.from(packet.ciphertext).includes(Buffer.from(payload.message)), false);
  const received = await bob.runtime.receive('alice', packet);
  assert.equal(received.message, payload.message); assert.equal(received.status, 'delivered');
  assert.equal(received.owner, 'alice'); assert.equal(received.peer, 'bob');
});
test('browser independently verifies the native-bound MLS package signing key instead of trusting directory metadata',async()=>{
  const alice=await participant('alice');
  const actual=await inspectBoundKeyPackage(alice.device.keyPackage,{owner:'alice',id:alice.device.id,fingerprint:alice.device.fingerprint});
  assert.deepEqual(actual,alice.device.signaturePublicKey);
  await assert.rejects(inspectBoundKeyPackage(alice.device.keyPackage,{owner:'bob',id:alice.device.id,fingerprint:alice.device.fingerprint}),{code:'mls_untrusted_package'});
  const corrupted=alice.device.keyPackage.slice();corrupted[corrupted.length-1]^=1;
  await assert.rejects(inspectBoundKeyPackage(corrupted,{owner:'alice',id:alice.device.id,fingerprint:alice.device.fingerprint}),{code:'mls_untrusted_package'});
});
test('fresh one-time packages reuse the verified signing identity and support another encrypted conversation',async()=>{
  const {alice,bob}=await pair(),charlie=await participant('charlie');
  const fresh=await alice.runtime.prepareKeyPackage();assert.notEqual(fresh.hash,alice.device.hash);assert.deepEqual(fresh.signaturePublicKey,alice.device.signaturePublicKey);
  alice.pins.push({...charlie.device,status:'active'});charlie.pins.push({...fresh,status:'active'});
  const id=await alice.runtime.createConversation('charlie'),transfer=await alice.runtime.addPeer(id,charlie.device.keyPackage);
  await charlie.runtime.acceptWelcome('alice',transfer);await alice.runtime.confirmMembership(id,transfer.id);
  await alice.runtime.sendMessage({clientMessageId:randomUUID(),receiverId:'charlie',message:'second conversation',messageType:'text'});
  assert.equal((await charlie.runtime.receive('alice',alice.packets[0])).message,'second conversation');
  await alice.runtime.sendMessage(message('first conversation still works'));
  assert.equal((await bob.runtime.receive('alice',alice.packets[1])).message,'first conversation still works');
});

test('lost accepted send response and runtime reload reuse exact ciphertext and logical message', async () => {
  const { alice, bob } = await pair(), payload = message('retry bila duplicate');
  let calls = 0;
  alice.options.transport.send = async packet => {
    alice.packets.push(structuredClone(packet));
    if (++calls === 1) throw new TypeError('connection_lost');
    return { id: packet.id, hash: packet.hash, status: 'sent' };
  };
  await assert.rejects(alice.runtime.sendMessage(payload), /connection_lost/);
  const first = alice.packets[0]; await bob.runtime.receive('alice', first);
  alice.runtime.close(); alice.runtime = await createMlsRuntime(alice.options);
  const retry = await alice.runtime.sendMessage(payload);
  assert.equal(retry.status, 'sent'); assert.deepEqual(alice.packets[1], first);
  assert.deepEqual(await bob.runtime.receive('alice', first), (await bob.vault.snapshot()).values[`history:${payload.clientMessageId}`]);
  const revision = (await alice.vault.snapshot()).revision;
  await alice.runtime.sendMessage(payload);
  assert.equal(alice.packets.length, 2); assert.equal((await alice.vault.snapshot()).revision, revision);
});

test('accepted send retries cannot change content or recipient', async () => {
  const { alice } = await pair(), payload = message('same id'); await alice.runtime.sendMessage(payload);
  await assert.rejects(alice.runtime.sendMessage({ ...payload, message: 'changed' }), { code: 'mls_send_retry_conflict' });
  assert.equal(alice.packets.length, 1);
});

test('invalid ciphertext, id substitution and epoch substitution do not consume receiver ratchet', async () => {
  const { alice, bob } = await pair(); await alice.runtime.sendMessage(message('authentic'));
  const packet = alice.packets[0], revision = (await bob.vault.snapshot()).revision;
  const bad = structuredClone(packet); bad.ciphertext[bad.ciphertext.length - 1] ^= 1;
  await assert.rejects(bob.runtime.receive('alice', bad));
  await assert.rejects(bob.runtime.receive('alice', { ...packet, id: randomUUID() }));
  await assert.rejects(bob.runtime.receive('alice', { ...packet, epoch: '999' }));
  assert.equal((await bob.vault.snapshot()).revision, revision);
  assert.equal((await bob.runtime.receive('alice', packet)).message, 'authentic');
  await assert.rejects(bob.runtime.receive('alice', bad), { code: 'mls_replay_conflict' });
});

test('staging abort never transmits and sender can recover from the durable unadvanced ratchet', async () => {
  const { alice, bob } = await pair(), payload = message('atomic');
  alice.vault.rejectNext = true;
  await assert.rejects(alice.runtime.sendMessage(payload), { code: 'storage_aborted' });
  assert.equal(alice.packets.length, 0);
  await alice.runtime.sendMessage(payload);
  assert.equal((await bob.runtime.receive('alice', alice.packets[0])).message, 'atomic');
});

test('two runtimes share the account lock and stage distinct ratchet generations safely', async () => {
  const { alice, bob } = await pair(), second = await createMlsRuntime(alice.options);
  await Promise.all([alice.runtime.sendMessage(message('one')), second.sendMessage(message('two'))]);
  assert.equal(alice.packets.length, 2);
  const result = [];
  for (const packet of alice.packets) result.push((await bob.runtime.receive('alice', packet)).message);
  assert.deepEqual(result, ['one', 'two']);
});

test('trusted pin revocation blocks sends even when there is an uncertain outbox job', async () => {
  const { alice } = await pair(), payload = message('outcome unknown');
  alice.options.transport.send = async () => { throw new TypeError('offline'); };
  await assert.rejects(alice.runtime.sendMessage(payload));
  alice.pins[0].status = 'revoked';
  await assert.rejects(alice.runtime.sendMessage(payload), { code: 'mls_untrusted_member' });
});

test('unconfirmed membership and unpinned package admission fail closed', async () => {
  const alice = await participant('alice'), bob = await participant('bob');
  const id = await alice.runtime.createConversation('bob');
  await assert.rejects(alice.runtime.addPeer(id, bob.device.keyPackage), { code: 'mls_untrusted_package' });
  alice.pins.push({ ...bob.device, status: 'active' });
  const transfer = await alice.runtime.addPeer(id, bob.device.keyPackage);
  await assert.rejects(alice.runtime.sendMessage(message('too soon')), { code: 'mls_membership_pending' });
  await assert.rejects(alice.runtime.confirmMembership(id, randomUUID()), { code: 'mls_membership_confirmation_rejected' });
  await alice.runtime.confirmMembership(id, transfer.id);
  assert.equal(alice.packets.length, 0);
});

test('Welcome cannot overwrite a group or reuse a consumed private package', async () => {
  const { alice, bob, transfer } = await pair();
  assert.equal(await bob.runtime.acceptWelcome('alice', transfer), transfer.conversationId);
  const changed=structuredClone(transfer);changed.tree[0]^=1;
  await assert.rejects(bob.runtime.acceptWelcome('alice', changed), { code: 'mls_replay_conflict' });
  await assert.rejects(alice.runtime.createConversation('charlie'), { code: 'mls_package_consumed' });
  for (const participant of [alice, bob]) {
    const saved = (await participant.vault.snapshot()).values['mls:identity'].package.privatePackage;
    assert.equal(saved.initPrivateKey.length, 0); assert.equal(saved.hpkePrivateKey.length, 0);
    assert.ok(saved.signaturePrivateKey.length > 0);
  }
});

test('account switch and unavailable encrypted transport do not send a legacy request', async () => {
  const { alice } = await pair(); delete alice.options.transport.send;
  await assert.rejects(alice.runtime.sendMessage(message('no transport')), { code: 'mls_transport_unavailable' });
  alice.session.token = randomUUID();
  await assert.rejects(alice.runtime.sendMessage(message('switched')), { code: 'mls_session_changed' });
});

test('key package publication lost response retains exact signed operation', async () => {
  const alice = await participant('alice');
  const original = alice.options.publishPackage; let first;
  const saved=await alice.vault.snapshot();await alice.vault.write({expectedRevision:saved.revision,values:{},deleted:['mls:published']});
  alice.options.publishPackage = async payload => { first = structuredClone(payload); throw new TypeError('lost'); };
  alice.runtime = await createMlsRuntime(alice.options);
  await assert.rejects(alice.runtime.initialize());
  alice.options.publishPackage = async payload => { assert.deepEqual(payload, first); return original(payload); };
  const retry = await createMlsRuntime(alice.options); assert.equal((await retry.initialize()).hash, alice.device.hash);
});

test('uncertain outbox blocks a different logical send until dedicated retry resolves it', async () => {
  const { alice } = await pair(), payload = message('uncertain');
  const send = alice.options.transport.send; alice.options.transport.send = async () => { throw new TypeError('offline'); };
  await assert.rejects(alice.runtime.sendMessage(payload));
  await assert.rejects(alice.runtime.sendMessage(message('another')), { code: 'mls_pending_send_requires_retry' });
  alice.options.transport.send = send;
  assert.equal((await alice.runtime.retryMessage(payload.clientMessageId)).status, 'sent');
  assert.equal(await alice.runtime.retryMessage(payload.clientMessageId), null);
});

test('oversized package and wire input are rejected before cryptographic processing', async () => {
  const { alice, bob, id } = await pair();
  await assert.rejects(alice.runtime.addPeer(id, new Uint8Array(8193)), { code: 'mls_package_invalid' });
  await assert.rejects(bob.runtime.receive('alice', { ciphertext: new Uint8Array(65537) }), { code: 'mls_wire_rejected' });
});

function communications(encryptedConversations, extra = {}) {
  const requests = [], window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../src/api/communications-client.js', import.meta.url), 'utf8'),
    { window, WingaEncryptedPolicy: extra.policy });
  const client = window.WingaModules.api.communications.createCommunicationsApiClient({ encryptedConversations,
    getSession: extra.getSession,
    fetchJson: async (...args) => { requests.push(args); return { plain: true }; } });
  return { client, requests };
}
test('real communications send delegates encrypted conversations without legacy HTTP fallback', async () => {
  const { alice } = await pair(), { client, requests } = communications(alice.runtime);
  assert.equal((await client.sendMessage(message('composer'))).encrypted, true); assert.equal(requests.length, 0);
  alice.options.transport.send = async () => { throw new TypeError('offline'); };
  await assert.rejects(client.sendMessage(message('offline'))); assert.equal(requests.length, 0);
});
test('mode lookup failure and explicit encryption without runtime never fall back to plaintext', async () => {
  const broken = communications({ isEncrypted: async () => { throw new Error('vault_locked'); } });
  await assert.rejects(broken.client.sendMessage(message('private'))); assert.equal(broken.requests.length, 0);
  const absent = communications(null);
  await assert.rejects(absent.client.sendMessage({ ...message('private'), securityMode: 'encrypted' }));
  assert.equal(absent.requests.length, 0);
  assert.equal((await absent.client.sendMessage(message('legacy'))).plain, true); assert.equal(absent.requests.length, 1);
});

test('durable encrypted policy blocks a fresh API client without a loaded runtime', async () => {
  const { client, requests } = communications(null, { getSession: () => ({ username: 'alice', sessionId: 'a', token: 'a' }),
    policy: { async isEncrypted() { return true; } } });
  await assert.rejects(client.sendMessage(message('do not downgrade')), { code: 'mls_runtime_required' });
  assert.equal(requests.length, 0);
});

test('session switch during policy lookup rejects before either encrypted or legacy transport', async () => {
  const session = { username: 'alice', sessionId: 'a', token: 'a' };
  const { client, requests } = communications(null, { getSession: () => session,
    policy: { async isEncrypted() { session.username = 'eve'; return false; } } });
  await assert.rejects(client.sendMessage(message('wrong account')), { code: 'mls_session_changed' });
  assert.equal(requests.length, 0);
});
