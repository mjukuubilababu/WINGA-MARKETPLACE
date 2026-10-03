import {
  createGroup, createCommit, createApplicationMessage, processPrivateMessage, joinGroup,
  defaultCapabilities, emptyPskIndex, generateKeyPackage, encodeGroupState, decodeGroupState,
  encodeMlsMessage, decodeMlsMessage, getCiphersuiteFromName, getCiphersuiteImpl, zeroOutUint8Array,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { encodeRatchetTree, decodeRatchetTree } from 'ts-mls/ratchetTree.js';
import { verifyKeyPackage, generateKeyPackageWithKey } from 'ts-mls/keyPackage.js';
import { verifyLeafNodeSignatureKeyPackage } from 'ts-mls/leafNode.js';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (value, code = 'mls_binding_rejected') => { if (!value) fail(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const ownerId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const equal = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((v, i) => v === b[i]);
const exact = (method, bytes) => {
  need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 65536, 'mls_wire_rejected');
  const parsed = method(bytes, 0); need(parsed && parsed[1] === bytes.length, 'mls_wire_rejected'); return parsed[0];
};
const wipe = result => result?.consumed?.forEach(zeroOutUint8Array);
const wire = value => encodeMlsMessage({ version: 'mls10', wireformat: 'mls_private_message', privateMessage: value });
const credential = identity => ({ credentialType: 'basic', identity: encoder.encode(JSON.stringify([
  'winga-mls-device', 1, identity.owner, identity.id, identity.fingerprint])) });
const retirePackage = identity => ({ ...identity, package: { ...identity.package, privatePackage: {
  signaturePrivateKey: identity.package.privatePackage.signaturePrivateKey,
  initPrivateKey: new Uint8Array(), hpkePrivateKey: new Uint8Array(),
} } });
const wipePackageAdmission = identity => {
  zeroOutUint8Array(identity.package.privatePackage.initPrivateKey);
  zeroOutUint8Array(identity.package.privatePackage.hpkePrivateKey);
};
const contentBytes = value => encoder.encode(JSON.stringify(['winga-mls-content', 1,
  value.id, value.conversationId, value.epoch, value.owner, value.deviceId, value.peer, value.message]));

export async function inspectBoundKeyPackage(bytes,identity,now=Date.now()) {
  need(bytes instanceof Uint8Array && bytes.length<=8192 && ownerId(identity?.owner) && uuid(identity?.id)
    && /^[a-f0-9]{64}$/.test(identity.fingerprint),'mls_package_invalid');
  const decoded=exact(decodeMlsMessage,bytes);need(decoded.wireformat==='mls_key_package','mls_package_invalid');
  const kp=decoded.keyPackage,suite=await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const lifetime=kp.leafNode.lifetime,time=BigInt(Math.floor(now/1000));
  need(kp.version==='mls10' && kp.cipherSuite===suite.name && kp.leafNode.credential.credentialType==='basic'
    && equal(kp.leafNode.credential.identity,credential(identity).identity)
    && lifetime && lifetime.notBefore>=0n && lifetime.notAfter>lifetime.notBefore && lifetime.notAfter-lifetime.notBefore<=2628000n
    && time>=lifetime.notBefore && time<=lifetime.notAfter
    && await verifyKeyPackage(kp,suite.signature) && await verifyLeafNodeSignatureKeyPackage(kp.leafNode,suite.signature),'mls_untrusted_package');
  return kp.leafNode.signaturePublicKey.slice();
}

// This is a candidate runtime, not an activation API. Membership delivery must be
// durably accepted by the authorized server before confirmMembership is called.
export async function createMlsRuntime({ getSession, vault, identityClient, publishPackage,
  trustedPins, transport, locks = globalThis.navigator?.locks, crypto = globalThis.crypto,
  policy = globalThis.WingaEncryptedPolicy, now = Date.now } = {}) {
  need(typeof getSession === 'function' && vault?.snapshot && vault?.write && identityClient?.enroll
    && identityClient?.attestKeyPackage && typeof publishPackage === 'function'
    && typeof trustedPins === 'function' && locks?.request && crypto?.subtle
    && policy?.markEncrypted, 'mls_runtime_unavailable');
  const initial = getSession(), owner = initial?.username;
  need(ownerId(owner) && initial.sessionId && initial.token, 'mls_session_required');
  const session = { ...initial };
  let closed = false;
  const current = () => {
    const value = getSession();
    need(!closed && value?.username === owner && value.sessionId === session.sessionId
      && value.token === session.token, 'mls_session_changed');
  };
  const suite = await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const locked = work => { current(); return locks.request(`winga-mls-operation:${owner}`, async () => { current(); return work(); }); };
  const put = async (saved, values, deleted = []) => { current(); return vault.write({ expectedRevision: saved.revision, values, deleted }); };
  function validLifetime(kp) {
    const life = kp?.leafNode?.lifetime, time = BigInt(Math.floor(now() / 1000));
    need(life && typeof life.notBefore === 'bigint' && typeof life.notAfter === 'bigint'
      && life.notBefore >= 0n && life.notAfter > life.notBefore && life.notAfter - life.notBefore <= 2628000n
      && time >= life.notBefore && time <= life.notAfter, 'mls_package_expired');
  }
  async function config(saved) {
    const own = saved.values['mls:identity']; need(own, 'mls_identity_required');
    const pins = structuredClone(await trustedPins()); current();
    need(Array.isArray(pins) && pins.length <= 128, 'mls_pins_invalid');
    const all = [...pins, { owner, id: own.id, fingerprint: own.fingerprint,
      signaturePublicKey: own.package.publicPackage.leafNode.signaturePublicKey, status: 'active' }];
    const records = new Map();
    for (const pin of all) {
      need(ownerId(pin.owner) && uuid(pin.id) && /^[a-f0-9]{64}$/.test(pin.fingerprint)
        && pin.signaturePublicKey instanceof Uint8Array && pin.signaturePublicKey.length === 32
        && ['active', 'revoked'].includes(pin.status), 'mls_pins_invalid');
      const key = `${pin.owner}/${pin.id}`, prior = records.get(key);
      need(!prior || (prior.status === pin.status && prior.fingerprint === pin.fingerprint
        && equal(prior.signaturePublicKey, pin.signaturePublicKey)), 'mls_pin_conflict'); records.set(key, pin);
    }
    const configuration = { ...defaultClientConfig,
      lifetimeConfig: { ...defaultClientConfig.lifetimeConfig, maximumTotalLifetime: 2628000n, validateLifetimeOnReceive: true },
      authService: { async validateCredential(value, key) {
        try {
          const tuple = JSON.parse(decoder.decode(value.identity));
          const pin = records.get(`${tuple[2]}/${tuple[3]}`);
          return value.credentialType === 'basic' && tuple.length === 5 && tuple[0] === 'winga-mls-device'
            && tuple[1] === 1 && pin?.status === 'active' && tuple[4] === pin.fingerprint
            && equal(value.identity, credential(pin).identity) && equal(key, pin.signaturePublicKey);
        } catch { return false; }
      } } };
    return { configuration, records };
  }
  async function state(saved, id, retiringDeviceId = null) {
    const row = saved.values[`mls:group:${id}`]; need(row && uuid(id), 'mls_group_required');
    const parsed = decodeGroupState(row.bytes, 0); need(parsed && parsed[1] === row.bytes.length, 'mls_state_invalid');
    const { configuration, records } = await config(saved);
    for (const node of parsed[0].ratchetTree) if (node?.nodeType === 'leaf') {
      const tuple = JSON.parse(decoder.decode(node.leaf.credential.identity));
      const pin = records.get(`${tuple[2]}/${tuple[3]}`);
      // Only replacement may load the exact previously pinned, revoked peer leaf.
      // The MLS auth service still rejects revoked credentials in the new tree.
      const retiring = retiringDeviceId && tuple[3] === retiringDeviceId && tuple[2] === row.peer
        && pin?.status === 'revoked' && equal(node.leaf.credential.identity, credential(pin).identity)
        && equal(node.leaf.signaturePublicKey, pin.signaturePublicKey);
      need(retiring || await configuration.authService.validateCredential(node.leaf.credential, node.leaf.signaturePublicKey), 'mls_untrusted_member');
      need(tuple[2] === owner || tuple[2] === row.peer, 'mls_unexpected_member');
    }
    need(decoder.decode(parsed[0].groupContext.groupId) === id, 'mls_state_invalid');
    return { value: { ...parsed[0], clientConfig: configuration }, row, records };
  }
  async function initialize() {
    return locked(async () => {
      const native = await identityClient.enroll(); current();
      need(native?.status === 'active' && native.owner === owner, 'mls_device_not_active');
      let saved = await vault.snapshot(), identity = saved.values['mls:identity'];
      if (identity) need(identity.id === native.id && identity.fingerprint === native.fingerprint, 'mls_identity_changed');
      else {
        const time = BigInt(Math.floor(now() / 1000)), pkg = await generateKeyPackage(credential(native), defaultCapabilities(),
          { notBefore: time - 10n, notAfter: time + 86400n }, [], suite);
        const bytes = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: pkg.publicPackage });
        identity = { owner, id: native.id, fingerprint: native.fingerprint, package: pkg, bytes, hash: await hash(bytes) };
        await put(saved, { 'mls:identity': identity }); saved = await vault.snapshot();
      }
      if (saved.values['mls:published'] === identity.hash) return publicIdentity(identity);
      validLifetime(identity.package.publicPackage);
      let pending = saved.values['mls:publication'];
      if (!pending || pending.sessionId !== session.sessionId || pending.payload.hash !== identity.hash) {
        pending = { sessionId: session.sessionId, payload: await identityClient.attestKeyPackage(identity.bytes.slice()) };
        need(pending.payload.hash === identity.hash, 'mls_package_attestation_mismatch');
        await put(saved, { 'mls:publication': pending }); saved = await vault.snapshot();
      }
      let response;
      try { response = await publishPackage(structuredClone(pending.payload), { owner, deviceId: session.sessionId, token: session.token }); }
      catch (error) {
        if (error.code === 'crypto_device_proof_expired') await put(saved, {}, ['mls:publication']);
        throw error;
      }
      current();
      need(response?.version === 1 && response.package?.hash === identity.hash
        && response.package.deviceId === identity.id, 'mls_package_publication_mismatch');
      await put(saved, { 'mls:published': identity.hash });
      return publicIdentity(identity);
    });
  }
  async function createConversation(peer, conversationId = crypto.randomUUID()) {
    return locked(async () => {
      need(ownerId(peer) && peer !== owner && uuid(conversationId), 'mls_peer_invalid');
      const saved = await vault.snapshot(), identity = saved.values['mls:identity'];
      need(identity && saved.values['mls:published'] === identity.hash, 'mls_identity_required');
      need(!saved.values[`mls:route:${peer}`] && !saved.values[`mls:group:${conversationId}`], 'mls_group_exists');
      need(!saved.values[`mls:consumed:${identity.hash}`] && saved.values['mls:package-consumed'] !== identity.hash, 'mls_package_consumed');
      validLifetime(identity.package.publicPackage);
      const { configuration } = await config(saved);
      const group = await createGroup(encoder.encode(conversationId), identity.package.publicPackage,
        identity.package.privatePackage, [], suite, configuration);
      current(); await policy.markEncrypted(owner, peer); current();
      await put(saved, { [`mls:group:${conversationId}`]: { peer, bytes: encodeGroupState(group), confirmed: false },
        [`mls:route:${peer}`]: { conversationId }, 'mls:package-consumed': identity.hash,
        [`mls:consumed:${identity.hash}`]: true, 'mls:identity': retirePackage(identity) });
      wipePackageAdmission(identity);
      return conversationId;
    });
  }
  async function addPeer(conversationId, packageBytes) {
    need(packageBytes instanceof Uint8Array && packageBytes.length > 0 && packageBytes.length <= 8192, 'mls_package_invalid');
    packageBytes = packageBytes.slice();
    return locked(async () => {
      const saved = await vault.snapshot(), group = await state(saved, conversationId);
      need(!saved.values[`mls:membership:${conversationId}`], 'mls_membership_pending');
      const decoded = exact(decodeMlsMessage, packageBytes); need(decoded.wireformat === 'mls_key_package', 'mls_package_invalid');
      const kp = decoded.keyPackage; validLifetime(kp);
      need(kp.version === 'mls10' && kp.cipherSuite === suite.name
        && await verifyKeyPackage(kp, suite.signature) && await verifyLeafNodeSignatureKeyPackage(kp.leafNode, suite.signature)
        && await group.value.clientConfig.authService.validateCredential(kp.leafNode.credential, kp.leafNode.signaturePublicKey), 'mls_untrusted_package');
      const who = JSON.parse(decoder.decode(kp.leafNode.credential.identity)); need(who[2] === group.row.peer, 'mls_peer_invalid');
      need(!group.value.ratchetTree.some(node => node?.nodeType === 'leaf'
        && equal(node.leaf.signaturePublicKey, kp.leafNode.signaturePublicKey)), 'mls_member_exists');
      const changed = await createCommit({ state: group.value, cipherSuite: suite }, { extraProposals: [{ proposalType: 'add', add: { keyPackage: kp } }] });
      try {
        const transfer = { id: crypto.randomUUID(), conversationId, epoch: String(changed.newState.groupContext.epoch),
          packageHash: await hash(packageBytes), commit: encodeMlsMessage(changed.commit),
          welcome: encodeMlsMessage({ version: 'mls10', wireformat: 'mls_welcome', welcome: changed.welcome }),
          tree: encodeRatchetTree(changed.newState.ratchetTree) };
        await put(saved, { [`mls:group:${conversationId}`]: { ...group.row, bytes: encodeGroupState(changed.newState), confirmed: false },
          [`mls:membership:${conversationId}`]: transfer }); return structuredClone(transfer);
      } finally { wipe(changed); }
    });
  }
  async function replacePeer(conversationId, removedDeviceId, expectedEpoch, packageBytes, operationId = crypto.randomUUID()) {
    need(uuid(conversationId) && uuid(removedDeviceId) && uuid(operationId) && typeof expectedEpoch === 'string'
      && /^[1-9][0-9]*$/.test(expectedEpoch) && expectedEpoch.length <= 20
      && packageBytes instanceof Uint8Array && packageBytes.length > 0 && packageBytes.length <= 8192, 'mls_replacement_invalid');
    packageBytes = packageBytes.slice();
    return locked(async () => {
      const saved = await vault.snapshot(), group = await state(saved, conversationId, removedDeviceId);
      need(group.row.confirmed && !saved.values[`mls:membership:${conversationId}`], 'mls_membership_pending');
      need(String(group.value.groupContext.epoch) === expectedEpoch, 'mls_replacement_epoch_conflict');
      need(!Object.entries(saved.values).some(([key, job]) => (key.startsWith('mls:outbox:') || key.startsWith('media:pending:'))
        && job.conversationId === conversationId), 'mls_pending_send_requires_retry');
      const leaves = group.value.ratchetTree.flatMap((node, index) => node?.nodeType === 'leaf'
        ? [{ index, leaf: node.leaf, who: JSON.parse(decoder.decode(node.leaf.credential.identity)) }] : []);
      const retired = leaves.find(node => node.who[2] === group.row.peer && node.who[3] === removedDeviceId);
      const own = saved.values['mls:identity'];
      need(leaves.length === 2 && retired && leaves.some(node => node.who[2] === owner && node.who[3] === own.id), 'mls_replacement_member_conflict');
      const decoded = exact(decodeMlsMessage, packageBytes); need(decoded.wireformat === 'mls_key_package', 'mls_package_invalid');
      const kp = decoded.keyPackage; validLifetime(kp);
      need(kp.version === 'mls10' && kp.cipherSuite === suite.name
        && await verifyKeyPackage(kp, suite.signature) && await verifyLeafNodeSignatureKeyPackage(kp.leafNode, suite.signature)
        && await group.value.clientConfig.authService.validateCredential(kp.leafNode.credential, kp.leafNode.signaturePublicKey), 'mls_untrusted_package');
      const who = JSON.parse(decoder.decode(kp.leafNode.credential.identity));
      need(who[2] === group.row.peer && who[3] !== removedDeviceId
        && !leaves.some(node => equal(node.leaf.signaturePublicKey, kp.leafNode.signaturePublicKey)), 'mls_replacement_member_conflict');
      const changed = await createCommit({ state: group.value, cipherSuite: suite }, { extraProposals: [
        { proposalType: 'remove', remove: { removed: retired.index / 2 } },
        { proposalType: 'add', add: { keyPackage: kp } },
      ] });
      try {
        need(changed.newState.groupContext.epoch === group.value.groupContext.epoch + 1n, 'mls_replacement_epoch_conflict');
        const transfer = { id: operationId, conversationId, previousEpoch: expectedEpoch,
          removedDeviceId, replacementDeviceId: who[3], epoch: String(changed.newState.groupContext.epoch),
          packageHash: await hash(packageBytes), commit: encodeMlsMessage(changed.commit),
          welcome: encodeMlsMessage({ version: 'mls10', wireformat: 'mls_welcome', welcome: changed.welcome }),
          tree: encodeRatchetTree(changed.newState.ratchetTree) };
        await put(saved, { [`mls:group:${conversationId}`]: { ...group.row, bytes: encodeGroupState(changed.newState), confirmed: false },
          [`mls:membership:${conversationId}`]: transfer });
        return structuredClone(transfer);
      } finally { wipe(changed); }
    });
  }
  async function confirmMembership(conversationId, operationId) {
    return locked(async () => {
      const saved = await vault.snapshot(), group = await state(saved, conversationId), pending = saved.values[`mls:membership:${conversationId}`];
      if (!pending && group.row.confirmed) return;
      need(pending?.id === operationId, 'mls_membership_confirmation_rejected');
      await put(saved, { [`mls:group:${conversationId}`]: { ...group.row, confirmed: true } }, [`mls:membership:${conversationId}`]);
    });
  }
  async function acceptWelcome(peer, transfer, expectedPeerDeviceId) {
    need(expectedPeerDeviceId === undefined || uuid(expectedPeerDeviceId), 'mls_peer_invalid');
    transfer = structuredClone(transfer);
    return locked(async () => {
      const id = transfer.conversationId; need(uuid(id) && ownerId(peer) && peer !== owner, 'mls_peer_invalid');
      const saved = await vault.snapshot(); let identity = saved.values['mls:identity']; need(identity, 'mls_identity_required');
      const previous = saved.values[`mls:group:${id}`];
      const transferHash = await hash(encoder.encode(JSON.stringify(['winga-mls-welcome',1,id,transfer.id,transfer.epoch,transfer.packageHash,
        Array.from(transfer.commit),Array.from(transfer.welcome),Array.from(transfer.tree)])));
      if (previous?.acceptedTransfer === transfer.id && previous.peer === peer) {
        need(previous.acceptedHash === transferHash && (!expectedPeerDeviceId || previous.acceptedPeerDevice === expectedPeerDeviceId),'mls_replay_conflict');return id;
      }
      need(!previous && !saved.values[`mls:route:${peer}`], 'mls_group_exists');
      const admission = saved.values[`mls:package:${transfer.packageHash}`] || identity;
      need(!saved.values[`mls:consumed:${admission.hash}`] && saved.values['mls:package-consumed'] !== admission.hash && transfer.packageHash === admission.hash, 'mls_package_consumed');
      identity = admission;
      validLifetime(identity.package.publicPackage);
      const { configuration } = await config(saved), decoded = exact(decodeMlsMessage, transfer.welcome);
      need(decoded.wireformat === 'mls_welcome', 'mls_welcome_invalid');
      const joined = await joinGroup(decoded.welcome, identity.package.publicPackage, identity.package.privatePackage,
        emptyPskIndex, suite, exact(decodeRatchetTree, transfer.tree), undefined, configuration);
      need(decoder.decode(joined.groupContext.groupId) === id && String(joined.groupContext.epoch) === transfer.epoch, 'mls_welcome_binding_rejected');
      const leaves=joined.ratchetTree.filter(node=>node?.nodeType==='leaf');
      need(leaves.length===2,'mls_unexpected_member');
      let peerDevice;
      for (const node of leaves) {
        need(await configuration.authService.validateCredential(node.leaf.credential, node.leaf.signaturePublicKey), 'mls_untrusted_member');
        const who = JSON.parse(decoder.decode(node.leaf.credential.identity)); need(who[2] === owner || who[2] === peer, 'mls_unexpected_member');
        if(who[2]===owner)need(who[3]===identity.id,'mls_unexpected_member');
        else {need(!peerDevice && (!expectedPeerDeviceId || who[3]===expectedPeerDeviceId),'mls_unexpected_member');peerDevice=who[3];}
      }
      need(peerDevice,'mls_unexpected_member');
      current(); await policy.markEncrypted(owner, peer); current();
      await put(saved, { [`mls:group:${id}`]: { peer, bytes: encodeGroupState(joined), confirmed: true, acceptedTransfer: transfer.id, acceptedHash: transferHash,acceptedPeerDevice:peerDevice },
        [`mls:route:${peer}`]: { conversationId: id }, 'mls:package-consumed': identity.hash,
        [`mls:consumed:${identity.hash}`]: true,
        [`mls:package:${identity.hash}`]: retirePackage(identity),
        'mls:identity': identity.hash === saved.values['mls:identity'].hash ? retirePackage(identity) : saved.values['mls:identity'] });
      wipePackageAdmission(identity); return id;
    });
  }
  async function isEncrypted(peer) {
    current(); const saved = await vault.snapshot(); current(); return Boolean(saved.values[`mls:route:${peer}`]);
  }
  async function sendMessage(payload) {
    payload = structuredClone(payload);
    need(uuid(payload?.clientMessageId) && ownerId(payload.receiverId) && typeof payload.message === 'string'
      && payload.message.trim().length && encoder.encode(payload.message).length <= 16384
      && (!payload.messageType || payload.messageType === 'text') && !payload.productItems?.length
      && !payload.productId && !payload.productName && !payload.replyToMessageId, 'mls_content_unsupported');
    return locked(async () => {
      let saved = await vault.snapshot(); const id = saved.values[`mls:route:${payload.receiverId}`]?.conversationId;
      need(uuid(id), 'mls_group_required'); const identity = saved.values['mls:identity'];
      need(!Object.entries(saved.values).some(([key, job]) => key.startsWith('mls:outbox:')
        && job.conversationId === id && job.id !== payload.clientMessageId), 'mls_pending_send_requires_retry');
      let job = saved.values[`mls:outbox:${payload.clientMessageId}`], history = saved.values[`history:${payload.clientMessageId}`];
      if (history) need(history.owner === owner && history.peer === payload.receiverId && history.message === payload.message
        && history.conversationId === id, 'mls_send_retry_conflict');
      if (history && !job) return { ...history, encrypted: true };
      const group = await state(saved, id);
      need(group.row.confirmed && !saved.values[`mls:membership:${id}`], 'mls_membership_pending');
      need(group.value.ratchetTree.some(node => node?.nodeType === 'leaf'
        && JSON.parse(decoder.decode(node.leaf.credential.identity))[2] === payload.receiverId), 'mls_recipient_not_joined');
      if (!job) {
        const content = { id: payload.clientMessageId, conversationId: id, epoch: String(group.value.groupContext.epoch),
          owner, deviceId: identity.id, peer: payload.receiverId, message: payload.message };
        const signature = await suite.signature.sign(identity.package.privatePackage.signaturePrivateKey, contentBytes(content));
        const bytes = encoder.encode(JSON.stringify({ ...content, signature: Array.from(signature) })); let changed;
        try { changed = await createApplicationMessage(group.value, bytes, suite); } finally { bytes.fill(0); }
        try {
          const ciphertext = wire(changed.privateMessage);
          need(!payload.mediaId || uuid(payload.mediaId),'mls_content_unsupported');
          job = { id: content.id, conversationId: id, epoch: content.epoch, deviceId: identity.id, ciphertext, hash: await hash(ciphertext),...(payload.mediaId?{mediaId:payload.mediaId}:{}) };
          history = { ...content, hash: job.hash, timestamp: new Date(now()).toISOString(), status: 'pending' };
          await put(saved, { [`mls:group:${id}`]: { ...group.row, bytes: encodeGroupState(changed.newState) },
            [`mls:outbox:${content.id}`]: job, [`history:${content.id}`]: history });
        } finally { wipe(changed); }
      }
      // A missing/rejected encrypted transport never falls back to legacy HTTP/Phoenix.
      need(typeof transport?.send === 'function', 'mls_transport_unavailable'); current();
      const reply = await transport.send(structuredClone(job)); current();
      need(reply?.id === job.id && reply.hash === job.hash && reply.status === 'sent', 'mls_send_confirmation_rejected');
      saved = await vault.snapshot();
      need(saved.values[`mls:outbox:${job.id}`]?.hash === job.hash, 'mls_send_retry_conflict');
      const result = { ...history, status: 'sent' };
      await put(saved, { [`history:${job.id}`]: result }, [`mls:outbox:${job.id}`]); return { ...result, encrypted: true };
    });
  }
  async function receive(peer, envelope) {
    need(envelope?.ciphertext instanceof Uint8Array && envelope.ciphertext.length > 0
      && envelope.ciphertext.length <= 65536, 'mls_wire_rejected');
    envelope = structuredClone(envelope);
    return locked(async () => {
      need(uuid(envelope?.id) && uuid(envelope.conversationId) && envelope.ciphertext instanceof Uint8Array, 'mls_wire_rejected');
      const saved = await vault.snapshot(), id = saved.values[`mls:route:${peer}`]?.conversationId;
      need(id === envelope.conversationId, 'mls_peer_invalid');
      const digest = await hash(envelope.ciphertext), prior = saved.values[`mls:received:${envelope.id}`];
      if (prior) { need(prior === digest, 'mls_replay_conflict'); return saved.values[`history:${envelope.id}`]; }
      if(envelope.hash)need(envelope.hash===digest,'mls_envelope_binding_rejected');
      need(!saved.values[`history:${envelope.id}`], 'mls_message_id_conflict');
      const group = await state(saved, id), parsed = exact(decodeMlsMessage, envelope.ciphertext);
      need(group.row.confirmed && parsed.wireformat === 'mls_private_message'
        && decoder.decode(parsed.privateMessage.groupId) === id && String(parsed.privateMessage.epoch) === envelope.epoch
        && parsed.privateMessage.epoch === group.value.groupContext.epoch, 'mls_envelope_binding_rejected');
      let result;
      try {
        try { result = await processPrivateMessage(group.value, parsed.privateMessage, emptyPskIndex, suite, () => 'reject'); }
        catch { fail('mls_ciphertext_rejected'); }
        need(result.kind === 'applicationMessage', 'mls_application_required');
        let content;try { content = JSON.parse(decoder.decode(result.message)); }catch{fail('mls_content_binding_rejected');}
        need(content && Object.keys(content).sort().join(',') === 'conversationId,deviceId,epoch,id,message,owner,peer,signature'
          && content.id === envelope.id && content.conversationId === id && content.epoch === envelope.epoch
          && content.owner === peer && content.peer === owner && typeof content.message === 'string'
          && content.message.trim().length && encoder.encode(content.message).length <= 16384
          && Array.isArray(content.signature) && content.signature.length === 64
          && content.signature.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255), 'mls_content_binding_rejected');
        const pin = group.records.get(`${peer}/${content.deviceId}`);
        need(pin?.status === 'active' && group.value.ratchetTree.some(node => node?.nodeType === 'leaf'
          && equal(node.leaf.signaturePublicKey, pin.signaturePublicKey))
          && await suite.signature.verify(pin.signaturePublicKey, contentBytes(content), new Uint8Array(content.signature)), 'mls_sender_rejected');
        const history = { ...content, hash: digest, timestamp: envelope.created_at || new Date(now()).toISOString(), status: 'delivered', encrypted: true }; delete history.signature;
        await put(saved, { [`mls:group:${id}`]: { ...group.row, bytes: encodeGroupState(result.newState) },
          [`history:${envelope.id}`]: history, [`mls:received:${envelope.id}`]: digest }); return history;
      } finally { if (result?.message) result.message.fill(0); wipe(result); }
    });
  }
  async function retryMessage(id) {
    current(); need(uuid(id), 'mls_message_id_invalid');
    const saved = await vault.snapshot(), pending = saved.values[`mls:outbox:${id}`], item = saved.values[`history:${id}`];
    if (!pending) return null;
    need(item?.owner === owner && item.status === 'pending', 'mls_send_retry_conflict');
    return sendMessage({ clientMessageId: id, receiverId: item.peer, message: item.message, messageType: 'text' });
  }
  function publicIdentity(identity) {
    return { owner, id: identity.id, fingerprint: identity.fingerprint, hash: identity.hash,
      keyPackage: identity.bytes.slice(), signaturePublicKey: identity.package.publicPackage.leafNode.signaturePublicKey.slice() };
  }
  async function prepareKeyPackage() {
    await locked(async () => {
      const saved = await vault.snapshot(), identity = saved.values['mls:identity'];
      need(identity, 'mls_identity_required');
      const expired = identity.package.publicPackage.leafNode.lifetime.notAfter <= BigInt(Math.floor(now() / 1000));
      if (!expired && !saved.values[`mls:consumed:${identity.hash}`] && saved.values['mls:package-consumed'] !== identity.hash) return;
      const time = BigInt(Math.floor(now() / 1000));
      const pkg = await generateKeyPackageWithKey(credential(identity), defaultCapabilities(),
        { notBefore: time - 10n, notAfter: time + 86400n }, [], {
          signKey: identity.package.privatePackage.signaturePrivateKey,
          publicKey: identity.package.publicPackage.leafNode.signaturePublicKey,
        }, suite);
      const bytes = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: pkg.publicPackage });
      const next = { ...identity, package: pkg, bytes, hash: await hash(bytes) };
      await put(saved, { 'mls:identity': next, [`mls:package:${identity.hash}`]: identity }, ['mls:publication','mls:published']);
    });
    return initialize();
  }
  async function history(peer) {
    current(); const saved = await vault.snapshot(); current();
    return Object.entries(saved.values).filter(([key,value]) => key.startsWith('history:') && (!peer || value.owner === peer || value.peer === peer))
      .map(([,value]) => structuredClone(value)).sort((a,b) => a.timestamp.localeCompare(b.timestamp));
  }
  async function applyReceipt(p, pin) {
    return locked(async () => {
      const saved = await vault.snapshot(), item = saved.values[`history:${p.id}`];
      need(item && item.owner === owner && p.hash === item.hash && p.conversationId === item.conversationId && p.epoch === item.epoch
        && pin?.owner === item.peer && ['delivered','read'].includes(p.kind), 'mls_receipt_rejected');
      await put(saved, { [`history:${p.id}`]: { ...item, status: item.status === 'read' ? 'read' : p.kind } }, [`mls:outbox:${p.id}`]);
    });
  }
  async function conversationId(peer) {
    current();const saved=await vault.snapshot(),id=saved.values[`mls:route:${peer}`]?.conversationId;
    need(uuid(id) && saved.values[`mls:group:${id}`]?.confirmed,'mls_group_required');return id;
  }
  return { initialize, prepareKeyPackage, history, applyReceipt, createConversation, addPeer, replacePeer, confirmMembership, acceptWelcome, isEncrypted, sendMessage, receive,conversationId,
    retryMessage,
    close() { closed = true; } };
}
