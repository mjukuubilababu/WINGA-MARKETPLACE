import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMlsRuntime, inspectBoundKeyPackage, encodeDeviceAdmissionPayload, decodeDeviceAdmissionPayload } from '../src/chat/mls-runtime.mjs';
import { verifyBoundKeyPackage } from '../backend/conversation-mls-protocol.mjs';
import { operationBytes } from '../backend/encrypted-conversations.js';
import { decodeGroupState, decodeMlsMessage, processPrivateMessage, emptyPskIndex, getCiphersuiteFromName, getCiphersuiteImpl,
  createGroup, createCommit, joinGroup, createApplicationMessage, encodeGroupState, encodeMlsMessage } from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';

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
async function participant(owner, { multiDevice = false } = {}) {
  const session = { username: owner, sessionId: randomUUID(), token: randomUUID() };
  const identity = { owner, id: randomUUID(), fingerprint: hash(webcrypto.getRandomValues(new Uint8Array(32))), status: 'active' };
  const vault = memoryVault(), pins = [], packets = [], publications = [];
  const options = {
    getSession: () => session, vault, locks, crypto: webcrypto, multiDevice,
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
async function pair(options) {
  const alice = await participant('alice', options), bob = await participant('bob', options);
  for (const [a, b] of [[alice, bob], [bob, alice]]) a.pins.push({ ...b.device, status: 'active' });
  const id = await alice.runtime.createConversation('bob');
  const transfer = await alice.runtime.addPeer(id, bob.device.keyPackage);
  await bob.runtime.acceptWelcome('alice', transfer);
  await alice.runtime.confirmMembership(id, transfer.id);
  return { alice, bob, id, transfer };
}
const message = text => ({ clientMessageId: randomUUID(), receiverId: 'bob', message: text, messageType: 'text' });

const deviceIntent = transfer => Object.fromEntries(['id','previousEpoch','actorOwner','actorDeviceId','addedOwner','addedDeviceId','packageHash']
  .map(key => [key, transfer[key]]));
async function deviceFixture() {
  const result = await pair({ multiDevice: true }), next = await participant('alice', { multiDevice: true });
  for (const [a, b] of [[result.alice, next], [result.bob, next], [next, result.alice], [next, result.bob]])
    a.pins.push({ ...b.device, status: 'active' });
  return { ...result, next };
}
async function admitSibling(fixture) {
  const { alice, bob, next, id } = fixture;
  const transfer = await alice.runtime.addDevice(id, await alice.runtime.conversationEpoch('bob'), next.device.keyPackage,
    { owner: 'alice', id: next.device.id });
  await bob.runtime.applyDeviceCommit('alice', transfer, deviceIntent(transfer));
  await next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer));
  await alice.runtime.confirmMembership(id, transfer.id);
  return transfer;
}

test('candidate native three-device admission converges future history in both send directions without granting old keys', async () => {
  const fixture = await deviceFixture(), { alice, bob, next, id } = fixture;
  await alice.runtime.sendMessage(message('before admission'));
  const oldPacket = alice.packets.at(-1); await bob.runtime.receive('alice', oldPacket);
  const transfer = await admitSibling(fixture);
  assert.equal(transfer.previousEpoch, '1'); assert.equal(transfer.epoch, '2'); assert.equal(transfer.roster.length, 3);
  await assert.rejects(next.runtime.receive('bob', oldPacket), { code: 'mls_envelope_binding_rejected' });
  for (const [sender, receivers, peer, body] of [
    [alice, [bob, next], 'bob', 'from first device'],
    [next, [bob, alice], 'bob', 'from sibling device'],
    [bob, [alice, next], 'alice', 'from peer'],
  ]) {
    await sender.runtime.sendMessage({ ...message(body), receiverId: peer });
    const packet = sender.packets.at(-1);
    for (const recipient of receivers) {
      const received = await recipient.runtime.receive(recipient.identity.owner === 'alice' ? 'bob' : 'alice', packet);
      assert.equal(received.message, body);
      assert.equal(received.status, recipient.identity.owner === sender.identity.owner ? 'sent' : 'delivered');
      const saved = await recipient.vault.snapshot();
      await recipient.runtime.receive(recipient.identity.owner === 'alice' ? 'bob' : 'alice', packet);
      assert.deepEqual(await recipient.vault.snapshot(), saved);
    }
  }
  const contents = async p => (await p.runtime.history()).filter(row => row.epoch === '2').map(row => [row.id,row.owner,row.peer,row.message]).sort();
  assert.deepEqual(await contents(alice), await contents(next)); assert.deepEqual(await contents(bob), await contents(next));
  assert.equal((await next.runtime.history()).length, 3);
  assert.equal((await alice.runtime.history()).length, 4);
  assert.equal(await next.runtime.conversationId('bob'), id);
  for (const p of [alice, bob, next]) {
    p.runtime.close(); p.runtime = await createMlsRuntime(p.options);
    assert.equal(await p.runtime.conversationEpoch(p.identity.owner === 'alice' ? 'bob' : 'alice'), '2');
  }
});

test('multi-device methods are disabled by default and ordinary initial admission cannot add extra leaves', async () => {
  const { alice, bob, id } = await pair(), extra = await participant('alice');
  const before = await alice.vault.snapshot();
  await assert.rejects(alice.runtime.addDevice(id, '1', extra.device.keyPackage, { owner: 'alice', id: extra.device.id }), { code: 'mls_multidevice_disabled' });
  await assert.rejects(alice.runtime.applyDeviceCommit('bob', {}, {}), { code: 'mls_multidevice_disabled' });
  await assert.rejects(alice.runtime.acceptDeviceWelcome('bob', {}, {}), { code: 'mls_multidevice_disabled' });
  await assert.rejects(alice.runtime.addPeer(id, bob.device.keyPackage), { code: 'mls_initial_admission_required' });
  assert.deepEqual(await alice.vault.snapshot(), before);
});

test('device admission rejects stale epochs, wrong target, unverified and revoked pins atomically', async () => {
  const { alice, next, id } = await deviceFixture(), before = await alice.vault.snapshot();
  await assert.rejects(alice.runtime.addDevice(id, '2', next.device.keyPackage, { owner: 'alice', id: next.device.id }), { code: 'mls_device_epoch_conflict' });
  await assert.rejects(alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'bob', id: next.device.id }), { code: 'mls_untrusted_package' });
  alice.pins.find(pin => pin.id === next.device.id).status = 'revoked';
  await assert.rejects(alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id }), { code: 'mls_untrusted_package' });
  alice.pins.pop();
  await assert.rejects(alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id }), { code: 'mls_untrusted_package' });
  assert.deepEqual(await alice.vault.snapshot(), before);
});

test('an admission freezes initiator sends, survives reload, and exact authenticated commit retries do not advance twice', async () => {
  const { alice, bob, next, id } = await deviceFixture();
  const transfer = await alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id });
  await assert.rejects(alice.runtime.sendMessage(message('too early')), { code: 'mls_membership_pending' });
  await assert.rejects(alice.runtime.addDevice(id, '2', next.device.keyPackage, { owner: 'alice', id: next.device.id }), { code: 'mls_membership_pending' });
  alice.runtime.close(); alice.runtime = await createMlsRuntime(alice.options);
  assert.deepEqual((await alice.vault.snapshot()).values[`mls:membership:${id}`], transfer);
  await bob.runtime.applyDeviceCommit('alice', transfer, deviceIntent(transfer));
  const before = await bob.vault.snapshot();
  await bob.runtime.applyDeviceCommit('alice', transfer, deviceIntent(transfer));
  assert.deepEqual(await bob.vault.snapshot(), before);
  const altered = structuredClone(transfer); altered.welcome[altered.welcome.length - 1] ^= 1;
  await assert.rejects(bob.runtime.applyDeviceCommit('alice', altered, deviceIntent(altered)), { code: 'mls_replay_conflict' });
  await next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer));
  const joined = await next.vault.snapshot();
  await next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer));
  assert.deepEqual(await next.vault.snapshot(), joined);
  await assert.rejects(next.runtime.acceptDeviceWelcome('bob', altered, deviceIntent(altered)), { code: 'mls_replay_conflict' });
  await alice.runtime.confirmMembership(id, transfer.id);
  await alice.runtime.sendMessage(message('confirmed after reload'));
  assert.equal((await next.runtime.receive('bob', alice.packets.at(-1))).message, 'confirmed after reload');
});

test('commit rejects forged intent, actor, roster, tree and ciphertext without ratchet or journal changes', async () => {
  const { alice, bob, next, id } = await deviceFixture();
  const transfer = await alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id });
  const before = await bob.vault.snapshot();
  await assert.rejects(bob.runtime.applyDeviceCommit('alice', transfer, { ...deviceIntent(transfer), id: randomUUID() }), { code: 'mls_device_intent_rejected' });
  const changes = [
    value => { value.actorOwner = 'bob'; value.actorDeviceId = bob.device.id; },
    value => { value.roster[0].fingerprint = '0'.repeat(64); },
    value => { value.roster.push(structuredClone(value.roster[0])); },
    value => { value.tree[value.tree.length - 1] ^= 1; },
    value => { value.commit[value.commit.length - 1] ^= 1; },
    value => { value.packageHash = '0'.repeat(64); },
    value => { value.roster.find(entry => entry.id === next.device.id).owner = 'mallory'; },
  ];
  for (const change of changes) {
    const altered = structuredClone(transfer); change(altered);
    await assert.rejects(bob.runtime.applyDeviceCommit('alice', altered, deviceIntent(altered)));
    assert.deepEqual(await bob.vault.snapshot(), before);
  }
  bob.vault.rejectNext = true;
  await assert.rejects(bob.runtime.applyDeviceCommit('alice', transfer, deviceIntent(transfer)), { code: 'storage_aborted' });
  assert.deepEqual(await bob.vault.snapshot(), before);
  await bob.runtime.applyDeviceCommit('alice', transfer, deviceIntent(transfer));
});

test('candidate Welcome rejects unverified roster, wrong recipient, malformed bounds and aborted persistence without consuming admission keys', async () => {
  const { alice, bob, next, id } = await deviceFixture();
  const transfer = await alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id });
  const before = await next.vault.snapshot();
  await assert.rejects(next.runtime.acceptDeviceWelcome('bob', transfer, undefined), { code: 'mls_device_intent_rejected' });
  const huge = { ...transfer, welcome: new Uint8Array(65537) };
  await assert.rejects(next.runtime.acceptDeviceWelcome('bob', huge, deviceIntent(huge)), { code: 'mls_wire_rejected' });
  const wrong = { ...transfer, addedOwner: 'bob', addedDeviceId: bob.device.id };
  await assert.rejects(next.runtime.acceptDeviceWelcome('bob', wrong, deviceIntent(wrong)), { code: 'mls_device_intent_rejected' });
  next.pins.find(pin => pin.id === alice.device.id).status = 'revoked';
  await assert.rejects(next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer)));
  next.pins.find(pin => pin.id === alice.device.id).status = 'active';
  assert.deepEqual(await next.vault.snapshot(), before);
  next.vault.rejectNext = true;
  await assert.rejects(next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer)), { code: 'storage_aborted' });
  assert.deepEqual(await next.vault.snapshot(), before);
  await next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer));
});

test('a fourth native endpoint processes commits on every existing device and excludes unrelated identities', async () => {
  const fixture = await deviceFixture(), { alice, bob, next, id } = fixture;
  await admitSibling(fixture);
  const fourth = await participant('bob', { multiDevice: true });
  for (const p of [alice, bob, next]) {
    p.pins.push({ ...fourth.device, status: 'active' }); fourth.pins.push({ ...p.device, status: 'active' });
  }
  const transfer = await next.runtime.addDevice(id, '2', fourth.device.keyPackage, { owner: 'bob', id: fourth.device.id });
  for (const p of [alice, bob]) await p.runtime.applyDeviceCommit(p.identity.owner === 'alice' ? 'bob' : 'alice', transfer, deviceIntent(transfer));
  await fourth.runtime.acceptDeviceWelcome('alice', transfer, deviceIntent(transfer));
  await next.runtime.confirmMembership(id, transfer.id);
  await fourth.runtime.sendMessage({ ...message('four endpoint secret'), receiverId: 'alice' });
  for (const p of [alice, bob, next]) assert.equal((await p.runtime.receive(p.identity.owner === 'alice' ? 'bob' : 'alice', fourth.packets[0])).message, 'four endpoint secret');
  const stranger = await participant('mallory', { multiDevice: true });
  alice.pins.push({ ...stranger.device, status: 'active' });
  const before = await alice.vault.snapshot();
  await assert.rejects(alice.runtime.addDevice(id, '3', stranger.device.keyPackage, { owner: 'mallory', id: stranger.device.id }), { code: 'mls_untrusted_package' });
  assert.deepEqual(await alice.vault.snapshot(), before);
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '3', fourth.device.keyPackage), { code: 'mls_replacement_member_conflict' });
});

test('candidate device limit rejects a fifth endpoint for one owner without consuming the package or advancing epoch', async () => {
  const fixture = await deviceFixture(), { alice, bob, next, id } = fixture;
  await admitSibling(fixture); const members = [alice, bob, next];
  for (let index = 0; index < 2; index++) {
    const additional = await participant('alice', { multiDevice: true });
    for (const p of members) {
      p.pins.push({ ...additional.device, status: 'active' }); additional.pins.push({ ...p.device, status: 'active' });
    }
    const transfer = await alice.runtime.addDevice(id, await alice.runtime.conversationEpoch('bob'), additional.device.keyPackage,
      { owner: 'alice', id: additional.device.id });
    for (const p of members.slice(1)) await p.runtime.applyDeviceCommit(p.identity.owner === 'alice' ? 'bob' : 'alice', transfer, deviceIntent(transfer));
    await additional.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer));
    await alice.runtime.confirmMembership(id, transfer.id); members.push(additional);
  }
  const excessive = await participant('alice', { multiDevice: true });
  alice.pins.push({ ...excessive.device, status: 'active' });
  const before = await alice.vault.snapshot(), targetBefore = await excessive.vault.snapshot();
  await assert.rejects(alice.runtime.addDevice(id, '4', excessive.device.keyPackage, { owner: 'alice', id: excessive.device.id }), { code: 'mls_device_roster_rejected' });
  assert.deepEqual(await alice.vault.snapshot(), before); assert.deepEqual(await excessive.vault.snapshot(), targetBefore);
});

test('candidate admission cannot discard pending text or media, and vault abort permits an exact old-epoch send', async () => {
  const { alice, bob, next, id } = await deviceFixture();
  for (const prefix of ['mls:outbox:', 'media:pending:']) {
    const key = prefix + randomUUID(), saved = await alice.vault.snapshot();
    await alice.vault.write({ expectedRevision: saved.revision, values: { [key]: { conversationId: id } } });
    const before = await alice.vault.snapshot();
    await assert.rejects(alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id }), { code: 'mls_pending_send_requires_retry' });
    assert.deepEqual(await alice.vault.snapshot(), before);
    await alice.vault.write({ expectedRevision: before.revision, values: {}, deleted: [key] });
  }
  const before = await alice.vault.snapshot(); alice.vault.rejectNext = true;
  await assert.rejects(alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id }), { code: 'storage_aborted' });
  assert.deepEqual(await alice.vault.snapshot(), before);
  await alice.runtime.sendMessage(message('after admission write abort'));
  assert.equal((await bob.runtime.receive('alice', alice.packets[0])).message, 'after admission write abort');
});

test('candidate admission checks the original session after awaits and cannot be reopened by a default runtime', async () => {
  const fixture = await deviceFixture(), { alice, bob, next, id } = fixture;
  const transfer = await alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id });
  const before = await bob.vault.snapshot(), options = { ...bob.options, trustedPins: async () => {
    bob.session.token = randomUUID(); return bob.pins;
  } };
  bob.runtime.close(); const switched = await createMlsRuntime(options);
  await assert.rejects(switched.applyDeviceCommit('alice', transfer, deviceIntent(transfer)), { code: 'mls_session_changed' });
  assert.deepEqual(await bob.vault.snapshot(), before);
  await next.runtime.acceptDeviceWelcome('bob', transfer, deviceIntent(transfer));
  next.runtime.close(); const disabled = await createMlsRuntime({ ...next.options, multiDevice: false });
  await assert.rejects(disabled.sendMessage(message('cannot silently downgrade')), { code: 'mls_multidevice_disabled' });
});

test('a member cannot wrap another device\'s valid signed content in its own MLS frame to impersonate the sender', async () => {
  const fixture = await deviceFixture(), { alice, bob, next, id } = fixture;
  await admitSibling(fixture);
  await alice.runtime.sendMessage(message('authentic inner signature'));
  const packet = alice.packets.at(-1), suite = await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const saved = (await next.vault.snapshot()).values[`mls:group:${id}`].bytes;
  const restore = () => ({ ...decodeGroupState(saved, 0)[0], clientConfig: defaultClientConfig });
  const opened = await processPrivateMessage(restore(), decodeMlsMessage(packet.ciphertext, 0)[0].privateMessage, emptyPskIndex, suite);
  try {
    const wrapped = await createApplicationMessage(restore(), opened.message, suite);
    const ciphertext = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_private_message', privateMessage: wrapped.privateMessage });
    const before = await bob.vault.snapshot();
    await assert.rejects(bob.runtime.receive('alice', { id: packet.id, conversationId: id, epoch: '2', ciphertext, hash: hash(ciphertext) }), { code: 'mls_sender_rejected' });
    assert.deepEqual(await bob.vault.snapshot(), before);
    assert.equal((await bob.runtime.receive('alice', packet)).message, 'authentic inner signature');
    await next.runtime.sendMessage(message('authentic sibling signature'));
    assert.equal((await bob.runtime.receive('alice', next.packets.at(-1))).message, 'authentic sibling signature');
  } finally { opened.message.fill(0); }
});

test('replay requires the original native sender, epoch and digest metadata without advancing the receiver state', async () => {
  const { alice, bob } = await pair();
  await alice.runtime.sendMessage(message('strict replay metadata'));
  const packet = alice.packets[0]; await bob.runtime.receive('alice', packet); const before = await bob.vault.snapshot();
  for (const change of [{ deviceId: randomUUID() }, { sender_device: randomUUID() }, { epoch: '2' }, { hash: '0'.repeat(64) }])
    await assert.rejects(bob.runtime.receive('alice', { ...packet, ...change }), { code: 'mls_envelope_binding_rejected' });
  assert.deepEqual(await bob.vault.snapshot(), before);
});

test('native transport codec signs every roster field, rejects ambiguous wire shapes and roundtrips the exact admission', async () => {
  const { alice, next, id } = await deviceFixture();
  const transfer = await alice.runtime.addDevice(id, '1', next.device.keyPackage, { owner: 'alice', id: next.device.id });
  const payload = encodeDeviceAdmissionPayload(transfer);
  assert.equal(typeof payload.roster, 'string'); assert.deepEqual(decodeDeviceAdmissionPayload(payload), transfer);
  const native = await webcrypto.subtle.generateKey('Ed25519', false, ['sign','verify']);
  const context = { owner: 'alice', deviceId: 'synthetic-session' }, op = { action: 'device-transfer', actorId: alice.device.id,
    requestId: transfer.id, issuedAt: Date.now(), payload };
  const proof = await webcrypto.subtle.sign('Ed25519', native.privateKey, operationBytes(context, op));
  assert.equal(await webcrypto.subtle.verify('Ed25519', native.publicKey, proof, operationBytes(context, op)), true);
  for (const field of ['owner','id','fingerprint','key']) {
    const altered = structuredClone(transfer);
    altered.roster[0][field] = field === 'key' ? new Array(32).fill(0) : field === 'id' ? randomUUID() : field === 'owner' ? 'mallory' : '0'.repeat(64);
    assert.equal(await webcrypto.subtle.verify('Ed25519', native.publicKey, proof,
      operationBytes(context, { ...op, payload: encodeDeviceAdmissionPayload(altered) })), false);
  }
  for (const change of [{ roster: transfer.roster }, { roster: ' ' + payload.roster }, { commit: payload.commit + '=' },
    { welcome: 'A' }, { tree: 'A'.repeat(87383) }, { extra: true }]) assert.throws(() => decodeDeviceAdmissionPayload({ ...payload, ...change }));
  assert.throws(() => encodeDeviceAdmissionPayload({ ...transfer, extra: true }), { code: 'mls_device_transfer_rejected' });
});

test('archived history and replay markers remain usable without loading them into the ratchet snapshot',async()=>{
  const {alice,bob}=await pair();
  for(const p of [alice,bob]) {
    const snapshot=p.vault.snapshot.bind(p.vault);p.vault.historySnapshot=snapshot;
    p.vault.lookup=async key=>(await snapshot()).values[key];
    p.vault.snapshot=async()=>{const s=await snapshot();s.values=Object.fromEntries(Object.entries(s.values).filter(([k])=>!k.startsWith('history:')&&!k.startsWith('mls:received:')&&!k.startsWith('mls:consumed:')&&!k.startsWith('mls:package:')));return s;};
  }
  for(let n=0;n<130;n++){await alice.runtime.sendMessage(message('paged '+n));await bob.runtime.receive('alice',alice.packets.at(-1));}
  const before=await bob.vault.snapshot(),replay=await bob.runtime.receive('alice',alice.packets[0]);
  assert.equal(replay.message,'paged 0');assert.deepEqual(await bob.vault.snapshot(),before);
  await assert.rejects(bob.runtime.receive('alice',{...alice.packets[1],id:alice.packets[0].id}),{code:'mls_replay_conflict'});
  assert.equal((await bob.runtime.history('alice')).length,130);
  const old=alice.packets[0];await alice.runtime.applyReceipt({id:old.id,conversationId:old.conversationId,epoch:old.epoch,hash:old.hash,kind:'read'},bob.device);
  assert.equal((await alice.runtime.history('bob'))[0].status,'read');
  await alice.runtime.prepareKeyPackage();
});

async function replacementFixture() {
  const old = await pair(), next = await participant('bob');
  old.alice.pins.push({ ...next.device, status: 'active' });
  next.pins.push({ ...old.alice.device, status: 'active' });
  return { ...old, next };
}

test('peer replacement advances the MLS epoch and excludes the old device from future ciphertext', async () => {
  const { alice, bob, next, id } = await replacementFixture();
  await alice.runtime.sendMessage(message('old epoch history'));
  const oldPacket = alice.packets[0]; await bob.runtime.receive('alice', oldPacket);
  alice.pins.find(pin => pin.id === bob.device.id).status = 'revoked';
  await assert.rejects(alice.runtime.sendMessage(message('revoked')), { code: 'mls_untrusted_member' });
  const transfer = await alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage);
  assert.equal(transfer.previousEpoch, '1'); assert.equal(transfer.epoch, '2');
  assert.equal(transfer.removedDeviceId, bob.device.id); assert.equal(transfer.replacementDeviceId, next.device.id);
  const suite = await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const oldStateBytes = (await bob.vault.snapshot()).values[`mls:group:${id}`].bytes;
  const oldState = { ...decodeGroupState(oldStateBytes, 0)[0], clientConfig: defaultClientConfig };
  const removed = await processPrivateMessage(oldState, decodeMlsMessage(transfer.commit, 0)[0].privateMessage,
    emptyPskIndex, suite, () => 'accept');
  assert.equal(removed.newState.groupActiveState.kind, 'removedFromGroup');
  assert.equal(removed.newState.groupContext.epoch, 1n);
  await assert.rejects(alice.runtime.sendMessage(message('unconfirmed')), { code: 'mls_membership_pending' });
  await next.runtime.acceptWelcome('alice', transfer);
  await alice.runtime.confirmMembership(id, transfer.id);
  await alice.runtime.sendMessage(message('new epoch secret'));
  const fresh = alice.packets[1]; assert.equal(fresh.epoch, '2');
  // Even bypassing the runtime's epoch gate cannot decrypt with retained old secrets.
  const retained = { ...decodeGroupState(oldStateBytes, 0)[0], clientConfig: defaultClientConfig };
  await assert.rejects(processPrivateMessage({ ...retained, groupContext: { ...retained.groupContext, epoch: 2n } },
    decodeMlsMessage(fresh.ciphertext, 0)[0].privateMessage, emptyPskIndex, suite, () => 'reject'));
  assert.equal((await next.runtime.receive('alice', fresh)).message, 'new epoch secret');
  const oldBefore = await bob.vault.snapshot();
  await assert.rejects(bob.runtime.receive('alice', fresh));
  assert.deepEqual(await bob.vault.snapshot(), oldBefore);
  await assert.rejects(next.runtime.receive('alice', oldPacket));
  assert.equal((await next.runtime.history()).length, 1);
  await next.runtime.sendMessage({ clientMessageId: randomUUID(), receiverId: 'alice', message: 'new device reply', messageType: 'text' });
  assert.equal((await alice.runtime.receive('bob', next.packets[0])).message, 'new device reply');
});

test('replacement membership survives reload with exact durable commit and blocks concurrent replacement', async () => {
  const { alice, bob, next, id } = await replacementFixture();
  const transfer = await alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage);
  alice.runtime.close(); alice.runtime = await createMlsRuntime(alice.options);
  assert.deepEqual((await alice.vault.snapshot()).values[`mls:membership:${id}`], transfer);
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '2', next.device.keyPackage), { code: 'mls_membership_pending' });
  await assert.rejects(alice.runtime.confirmMembership(id, randomUUID()), { code: 'mls_membership_confirmation_rejected' });
  await next.runtime.acceptWelcome('alice', transfer);
  await alice.runtime.confirmMembership(id, transfer.id);
  await alice.runtime.sendMessage(message('reload survived'));
  assert.equal((await next.runtime.receive('alice', alice.packets[0])).message, 'reload survived');
});

test('remove-and-add leaf reuse marks only the removed member while another existing member advances and decrypts', async () => {
  const alice = await participant('alice'), bob = await participant('bob'), charlie = await participant('charlie'), next = await participant('bob');
  const suite = await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const packages = await Promise.all([alice, bob, charlie, next].map(async person => (await person.vault.snapshot()).values['mls:identity'].package));
  let group = await createGroup(new TextEncoder().encode(randomUUID()), packages[0].publicPackage, packages[0].privatePackage, [], suite, defaultClientConfig);
  const admission = await createCommit({ state: group, cipherSuite: suite }, { extraProposals: [
    { proposalType: 'add', add: { keyPackage: packages[1].publicPackage } },
    { proposalType: 'add', add: { keyPackage: packages[2].publicPackage } },
  ] });
  group = admission.newState;
  const old = await joinGroup(admission.welcome, packages[1].publicPackage, packages[1].privatePackage, emptyPskIndex, suite, group.ratchetTree, undefined, defaultClientConfig);
  const survivor = await joinGroup(admission.welcome, packages[2].publicPackage, packages[2].privatePackage, emptyPskIndex, suite, group.ratchetTree, undefined, defaultClientConfig);
  const savedGroup = encodeGroupState(group), savedOld = encodeGroupState(old), savedSurvivor = encodeGroupState(survivor);
  const restore = bytes => ({ ...decodeGroupState(bytes, 0)[0], clientConfig: defaultClientConfig });
  const replacement = await createCommit({ state: group, cipherSuite: suite }, { extraProposals: [
    { proposalType: 'remove', remove: { removed: old.privatePath.leafIndex } },
    { proposalType: 'add', add: { keyPackage: packages[3].publicPackage } },
  ] });
  const newDevice = await joinGroup(replacement.welcome, packages[3].publicPackage, packages[3].privatePackage, emptyPskIndex, suite, replacement.newState.ratchetTree, undefined, defaultClientConfig);
  assert.equal(newDevice.privatePath.leafIndex, old.privatePath.leafIndex);
  const corrupted = structuredClone(replacement.commit.privateMessage); corrupted.ciphertext[corrupted.ciphertext.length - 1] ^= 1;
  let authenticated = false;
  await assert.rejects(processPrivateMessage(restore(savedOld), corrupted, emptyPskIndex, suite, () => { authenticated = true; return 'accept'; }));
  assert.equal(authenticated, false);
  const declined = await processPrivateMessage(restore(savedOld), replacement.commit.privateMessage, emptyPskIndex, suite, () => 'reject');
  assert.equal(declined.newState.groupActiveState.kind, 'active'); assert.equal(declined.newState.groupContext.epoch, 1n);
  const removed = await processPrivateMessage(old, replacement.commit.privateMessage, emptyPskIndex, suite, () => 'accept');
  assert.equal(removed.newState.groupActiveState.kind, 'removedFromGroup');
  const continued = await processPrivateMessage(survivor, replacement.commit.privateMessage, emptyPskIndex, suite, () => 'accept');
  assert.equal(continued.newState.groupActiveState.kind, 'active'); assert.equal(continued.newState.groupContext.epoch, 2n);
  const application = await createApplicationMessage(replacement.newState, new TextEncoder().encode('only current members'), suite);
  for (const state of [newDevice, continued.newState]) {
    const received = await processPrivateMessage(state, application.privateMessage, emptyPskIndex, suite, () => 'reject');
    assert.equal(new TextDecoder().decode(received.message), 'only current members');
  }
  await assert.rejects(createApplicationMessage(removed.newState, new TextEncoder().encode('removed sender'), suite));
  const removeOnly = await createCommit({ state: restore(savedGroup), cipherSuite: suite }, { extraProposals: [
    { proposalType: 'remove', remove: { removed: old.privatePath.leafIndex } },
  ] });
  const plainRemoval = await processPrivateMessage(restore(savedOld), removeOnly.commit.privateMessage, emptyPskIndex, suite, () => 'accept');
  assert.equal(plainRemoval.newState.groupActiveState.kind, 'removedFromGroup');
  const untouched = await processPrivateMessage(restore(savedSurvivor), removeOnly.commit.privateMessage, emptyPskIndex, suite, () => 'accept');
  assert.equal(untouched.newState.groupActiveState.kind, 'active'); assert.equal(untouched.newState.groupContext.epoch, 2n);
  await assert.rejects(createCommit({ state: restore(savedGroup), cipherSuite: suite }, { extraProposals: [
    { proposalType: 'remove', remove: { removed: group.privatePath.leafIndex } },
  ] }));
});

test('replacement rejects wrong epoch, self removal, unpinned packages and the same device without changing vault', async () => {
  const { alice, bob, next, id } = await replacementFixture();
  const before = await alice.vault.snapshot();
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '2', next.device.keyPackage), { code: 'mls_replacement_epoch_conflict' });
  await assert.rejects(alice.runtime.replacePeer(id, alice.device.id, '1', next.device.keyPackage), { code: 'mls_replacement_member_conflict' });
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '1', bob.device.keyPackage), { code: 'mls_replacement_member_conflict' });
  alice.pins.pop();
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage), { code: 'mls_untrusted_package' });
  assert.deepEqual(await alice.vault.snapshot(), before);
});

test('a revoked replacement package is never admitted even when the retiring peer is also revoked', async () => {
  const { alice, bob, next, id } = await replacementFixture();
  for (const pin of alice.pins) pin.status = 'revoked';
  const before = await alice.vault.snapshot();
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage), { code: 'mls_untrusted_package' });
  assert.deepEqual(await alice.vault.snapshot(), before);
});

test('replacement refuses unresolved text and attachment journals rather than abandoning old epoch retries', async () => {
  const { alice, bob, next, id } = await replacementFixture();
  for (const prefix of ['mls:outbox:', 'media:pending:']) {
    const key = prefix + randomUUID(), saved = await alice.vault.snapshot();
    await alice.vault.write({ expectedRevision: saved.revision, values: { [key]: { conversationId: id } } });
    const before = await alice.vault.snapshot();
    await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage), { code: 'mls_pending_send_requires_retry' });
    assert.deepEqual(await alice.vault.snapshot(), before);
    await alice.vault.write({ expectedRevision: before.revision, values: {}, deleted: [key] });
  }
});

test('aborted replacement vault write preserves the old epoch and permits a clean retry', async () => {
  const { alice, bob, next, id } = await replacementFixture();
  const before = await alice.vault.snapshot(); alice.vault.rejectNext = true;
  await assert.rejects(alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage), { code: 'storage_aborted' });
  assert.deepEqual(await alice.vault.snapshot(), before);
  await alice.runtime.sendMessage(message('still old epoch'));
  assert.equal((await bob.runtime.receive('alice', alice.packets[0])).message, 'still old epoch');
  const transfer = await alice.runtime.replacePeer(id, bob.device.id, '1', next.device.keyPackage);
  await next.runtime.acceptWelcome('alice', transfer); await alice.runtime.confirmMembership(id, transfer.id);
  await alice.runtime.sendMessage(message('retry new epoch'));
  assert.equal((await next.runtime.receive('alice', alice.packets[1])).message, 'retry new epoch');
});

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
