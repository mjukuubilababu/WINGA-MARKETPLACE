import {
  createGroup, createCommit, createApplicationMessage, processPrivateMessage, joinGroup,
  defaultCapabilities, emptyPskIndex, generateKeyPackage, encodeGroupState, decodeGroupState,
  encodeMlsMessage, decodeMlsMessage, getCiphersuiteFromName, getCiphersuiteImpl, zeroOutUint8Array,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { encodeRatchetTree, decodeRatchetTree } from 'ts-mls/ratchetTree.js';
import { verifyKeyPackage, generateKeyPackageWithKey } from 'ts-mls/keyPackage.js';
import { verifyLeafNodeSignatureKeyPackage } from 'ts-mls/leafNode.js';
import { decryptSenderData } from 'ts-mls/privateMessage.js';

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
const deviceTransferFields = ['actorDeviceId','actorOwner','addedDeviceId','addedOwner','commit','conversationId','epoch','id',
  'packageHash','previousEpoch','roster','tree','version','welcome'];
const deviceChangeFields = [...deviceTransferFields,'removedDeviceId','removedOwner'].sort();
const encodeBase64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Native transport v1 canonicalizes flat payload keys. Keep the entire roster
// in one signed string so nested credential fields cannot disappear from its hash.
export function encodeDeviceAdmissionPayload(transfer) {
  need(transfer?.version === 2 && Object.keys(transfer).sort().join(',') === deviceTransferFields.join(','), 'mls_device_transfer_rejected');
  const payload = structuredClone(transfer);
  for (const key of ['commit','welcome','tree']) {
    need(payload[key] instanceof Uint8Array && payload[key].length > 0 && payload[key].length <= 65536, 'mls_wire_rejected');
    payload[key] = encodeBase64(payload[key]);
  }
  need(Array.isArray(payload.roster) && payload.roster.length >= 3 && payload.roster.length <= 8, 'mls_device_roster_rejected');
  payload.roster = JSON.stringify(payload.roster);
  need(payload.roster.length <= 8192 && encoder.encode(JSON.stringify(payload)).length <= 262144, 'mls_wire_rejected');
  return payload;
}
export function decodeDeviceAdmissionPayload(payload) {
  need(payload?.version === 2 && Object.keys(payload).sort().join(',') === deviceTransferFields.join(',')
    && typeof payload.roster === 'string' && payload.roster.length <= 8192, 'mls_device_transfer_rejected');
  need(encoder.encode(JSON.stringify(payload)).length <= 262144, 'mls_wire_rejected');
  const transfer = structuredClone(payload);
  for (const key of ['commit','welcome','tree']) {
    const text = transfer[key];
    need(typeof text === 'string' && text.length > 0 && text.length <= 87382 && /^[A-Za-z0-9_-]+$/.test(text), 'mls_wire_rejected');
    try { transfer[key] = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), byte => byte.charCodeAt(0)); }
    catch { fail('mls_wire_rejected'); }
    need(transfer[key].length <= 65536 && encodeBase64(transfer[key]) === text, 'mls_wire_rejected');
  }
  try { transfer.roster = JSON.parse(transfer.roster); } catch { fail('mls_device_roster_rejected'); }
  need(Array.isArray(transfer.roster) && transfer.roster.length >= 3 && transfer.roster.length <= 8
    && JSON.stringify(transfer.roster) === payload.roster, 'mls_device_roster_rejected');
  return transfer;
}

export function encodeDeviceChangePayload(transfer) {
  need(transfer?.version===3 && Object.keys(transfer).sort().join(',')===deviceChangeFields.join(','),'mls_device_transfer_rejected');
  const payload=structuredClone(transfer);
  for(const key of ['commit','welcome','tree']) {
    need(payload[key] instanceof Uint8Array && payload[key].length<=65536
      && (payload[key].length>0 || key==='welcome' && payload.addedDeviceId===''),'mls_wire_rejected');
    payload[key]=encodeBase64(payload[key]);
  }
  need(Array.isArray(payload.roster) && payload.roster.length>=2 && payload.roster.length<=8,'mls_device_roster_rejected');
  payload.roster=JSON.stringify(payload.roster);
  need(payload.roster.length<=8192 && encoder.encode(JSON.stringify(payload)).length<=262144,'mls_wire_rejected');return payload;
}
export function decodeDeviceChangePayload(payload) {
  need(payload?.version===3 && Object.keys(payload).sort().join(',')===deviceChangeFields.join(',')
    && typeof payload.roster==='string' && payload.roster.length<=8192
    && encoder.encode(JSON.stringify(payload)).length<=262144,'mls_device_transfer_rejected');
  const transfer=structuredClone(payload);
  for(const key of ['commit','welcome','tree']) {
    const text=transfer[key];need(typeof text==='string' && text.length<=87382
      && (/^[A-Za-z0-9_-]+$/.test(text) || text==='' && key==='welcome' && payload.addedDeviceId===''),'mls_wire_rejected');
    try{transfer[key]=Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),b=>b.charCodeAt(0));}catch{fail('mls_wire_rejected');}
    need(transfer[key].length<=65536 && encodeBase64(transfer[key])===text,'mls_wire_rejected');
  }
  try{transfer.roster=JSON.parse(transfer.roster);}catch{fail('mls_device_roster_rejected');}
  need(Array.isArray(transfer.roster) && transfer.roster.length>=2 && transfer.roster.length<=8
    && JSON.stringify(transfer.roster)===payload.roster,'mls_device_roster_rejected');return transfer;
}

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
  policy = globalThis.WingaEncryptedPolicy, now = Date.now, multiDevice = false } = {}) {
  need(typeof multiDevice === 'boolean', 'mls_runtime_unavailable');
  need(typeof getSession === 'function' && vault?.snapshot && vault?.write && identityClient?.enroll
    && identityClient?.attestKeyPackage && typeof publishPackage === 'function'
    && typeof trustedPins === 'function' && locks?.request && crypto?.subtle
    && policy?.markEncrypted, 'mls_runtime_unavailable');
  const initial = getSession(), owner = initial?.username;
  need(ownerId(owner) && initial.sessionId, 'mls_session_required');
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
  const record = async (saved,key) => saved.values[key] ?? (vault.lookup?await vault.lookup(key):undefined);
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
    need(!row.multiDevice || multiDevice, 'mls_multidevice_disabled');
    const parsed = decodeGroupState(row.bytes, 0); need(parsed && parsed[1] === row.bytes.length, 'mls_state_invalid');
    const { configuration, records } = await config(saved);
    for (const node of parsed[0].ratchetTree) if (node?.nodeType === 'leaf') {
      const tuple = JSON.parse(decoder.decode(node.leaf.credential.identity));
      const pin = records.get(`${tuple[2]}/${tuple[3]}`);
      // Only replacement may load the exact previously pinned, revoked peer leaf.
      // The MLS auth service still rejects revoked credentials in the new tree.
      const retiring = retiringDeviceId && tuple[3] === retiringDeviceId && [owner,row.peer].includes(tuple[2])
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
      need(!(await record(saved,`mls:consumed:${identity.hash}`)) && saved.values['mls:package-consumed'] !== identity.hash, 'mls_package_consumed');
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
      need(!group.row.confirmed && group.value.ratchetTree.filter(node => node?.nodeType === 'leaf').length === 1, 'mls_initial_admission_required');
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
  function roster(value) {
    const entries = value.ratchetTree.flatMap(node => {
      if (node?.nodeType !== 'leaf') return [];
      const who = JSON.parse(decoder.decode(node.leaf.credential.identity));
      return [{ owner: who[2], id: who[3], fingerprint: who[4], key: Array.from(node.leaf.signaturePublicKey) }];
    });
    return entries.sort((a, b) => `${a.owner}/${a.id}` < `${b.owner}/${b.id}` ? -1 : 1);
  }
  function noPendingSend(saved, id) {
    need(!Object.entries(saved.values).some(([key, job]) => (key.startsWith('mls:outbox:') || key.startsWith('media:pending:'))
      && job.conversationId === id), 'mls_pending_send_requires_retry');
  }
  function validRoster(entries, peer, minimum=3) {
    need(Array.isArray(entries) && entries.length >= minimum && entries.length <= 8, 'mls_device_roster_rejected');
    const seen = new Set(), keys = new Set(), counts = new Map();
    for (const entry of entries) {
      need(entry && Object.keys(entry).sort().join(',') === 'fingerprint,id,key,owner'
        && [owner, peer].includes(entry.owner) && uuid(entry.id) && /^[a-f0-9]{64}$/.test(entry.fingerprint)
        && Array.isArray(entry.key) && entry.key.length === 32
        && entry.key.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255), 'mls_device_roster_rejected');
      const key = entry.key.join(',');
      need(!seen.has(entry.id) && !keys.has(key), 'mls_device_roster_rejected');
      seen.add(entry.id); keys.add(key); counts.set(entry.owner, (counts.get(entry.owner) || 0) + 1);
    }
    need(counts.size === 2 && [...counts.values()].every(count => count <= 4), 'mls_device_roster_rejected');
  }
  async function deviceTransfer(transfer, expected, peer) {
    need(multiDevice, 'mls_multidevice_disabled');
    need(transfer && Object.keys(transfer).sort().join(',') === deviceTransferFields.join(',')
      && transfer.version === 2 && uuid(transfer.id) && uuid(transfer.conversationId)
      && [owner, peer].includes(transfer.actorOwner) && [owner, peer].includes(transfer.addedOwner)
      && uuid(transfer.actorDeviceId) && uuid(transfer.addedDeviceId) && transfer.actorDeviceId !== transfer.addedDeviceId
      && /^[a-f0-9]{64}$/.test(transfer.packageHash)
      && typeof transfer.previousEpoch === 'string' && /^[1-9][0-9]{0,19}$/.test(transfer.previousEpoch)
      && typeof transfer.epoch === 'string' && /^[1-9][0-9]{0,19}$/.test(transfer.epoch)
      && BigInt(transfer.epoch) === BigInt(transfer.previousEpoch) + 1n, 'mls_device_transfer_rejected');
    for (const bytes of [transfer.commit, transfer.welcome, transfer.tree])
      need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 65536, 'mls_wire_rejected');
    const fields = ['id','previousEpoch','actorOwner','actorDeviceId','addedOwner','addedDeviceId','packageHash'];
    // The caller must derive this expectation from an authenticated, authorized
    // canonical reservation/proof, not copy the untrusted transfer into it.
    need(expected && Object.keys(expected).sort().join(',') === [...fields].sort().join(',')
      && fields.every(key => expected[key] === transfer[key]), 'mls_device_intent_rejected');
    validRoster(transfer.roster, peer);
    return hash(encoder.encode(JSON.stringify(['winga-mls-device-admission', 2,
      transfer.conversationId, ...fields.map(key => transfer[key]), transfer.epoch, transfer.roster,
      await hash(transfer.commit), await hash(transfer.welcome), await hash(transfer.tree)])));
  }
  async function addDevice(conversationId, expectedEpoch, packageBytes, target, operationId = crypto.randomUUID()) {
    need(multiDevice, 'mls_multidevice_disabled');
    need(uuid(conversationId) && uuid(operationId) && target && Object.keys(target).sort().join(',') === 'id,owner'
      && ownerId(target.owner) && uuid(target.id) && typeof expectedEpoch === 'string'
      && /^[1-9][0-9]{0,19}$/.test(expectedEpoch), 'mls_device_intent_rejected');
    need(packageBytes instanceof Uint8Array && packageBytes.length > 0 && packageBytes.length <= 8192, 'mls_package_invalid');
    packageBytes = packageBytes.slice(); target = structuredClone(target);
    return locked(async () => {
      const saved = await vault.snapshot(), group = await state(saved, conversationId), own = saved.values['mls:identity'];
      need(group.row.confirmed && !saved.values[`mls:membership:${conversationId}`], 'mls_membership_pending');
      need(String(group.value.groupContext.epoch) === expectedEpoch, 'mls_device_epoch_conflict');
      noPendingSend(saved, conversationId);
      const before = roster(group.value), pin = group.records.get(`${target.owner}/${target.id}`);
      need([owner, group.row.peer].includes(target.owner) && pin?.status === 'active', 'mls_untrusted_package');
      need(!before.some(entry => entry.id === target.id), 'mls_member_exists');
      await inspectBoundKeyPackage(packageBytes, pin, now());
      const kp = exact(decodeMlsMessage, packageBytes).keyPackage;
      need(equal(kp.leafNode.signaturePublicKey, pin.signaturePublicKey), 'mls_untrusted_package');
      const after = [...before, { owner: target.owner, id: target.id, fingerprint: pin.fingerprint, key: Array.from(pin.signaturePublicKey) }]
        .sort((a, b) => `${a.owner}/${a.id}` < `${b.owner}/${b.id}` ? -1 : 1);
      validRoster(after, group.row.peer);
      const changed = await createCommit({ state: group.value, cipherSuite: suite }, { extraProposals: [{ proposalType: 'add', add: { keyPackage: kp } }] });
      try {
        need(changed.newState.groupContext.epoch === group.value.groupContext.epoch + 1n
          && JSON.stringify(roster(changed.newState)) === JSON.stringify(after), 'mls_device_roster_rejected');
        const transfer = { version: 2, id: operationId, conversationId, previousEpoch: expectedEpoch,
          epoch: String(changed.newState.groupContext.epoch), actorOwner: owner, actorDeviceId: own.id,
          addedOwner: target.owner, addedDeviceId: target.id, packageHash: await hash(packageBytes), roster: after,
          commit: encodeMlsMessage(changed.commit), tree: encodeRatchetTree(changed.newState.ratchetTree),
          welcome: encodeMlsMessage({ version: 'mls10', wireformat: 'mls_welcome', welcome: changed.welcome }) };
        await put(saved, { [`mls:group:${conversationId}`]: { ...group.row, multiDevice: true, bytes: encodeGroupState(changed.newState), confirmed: false },
          [`mls:membership:${conversationId}`]: transfer });
        return structuredClone(transfer);
      } finally { wipe(changed); }
    });
  }
  async function applyDeviceCommit(peer, transfer, expected) {
    transfer = structuredClone(transfer); expected = structuredClone(expected);
    return locked(async () => {
      need(ownerId(peer) && peer !== owner, 'mls_peer_invalid');
      const digest = await deviceTransfer(transfer, expected, peer), saved = await vault.snapshot(), id = transfer.conversationId;
      need(saved.values[`mls:route:${peer}`]?.conversationId === id, 'mls_peer_invalid');
      const prior = await record(saved, `mls:device-transition:${transfer.id}`);
      if (prior) { need(prior === digest, 'mls_replay_conflict'); return id; }
      const group = await state(saved, id), before = roster(group.value);
      need(group.row.confirmed && !saved.values[`mls:membership:${id}`], 'mls_membership_pending');
      need(String(group.value.groupContext.epoch) === transfer.previousEpoch, 'mls_device_epoch_conflict');
      noPendingSend(saved, id);
      need(before.some(entry => entry.owner === transfer.actorOwner && entry.id === transfer.actorDeviceId)
        && !before.some(entry => entry.id === transfer.addedDeviceId), 'mls_device_intent_rejected');
      need(JSON.stringify(transfer.roster.filter(entry => entry.id !== transfer.addedDeviceId)) === JSON.stringify(before), 'mls_device_roster_rejected');
      const pin = group.records.get(`${transfer.addedOwner}/${transfer.addedDeviceId}`);
      need(pin?.status === 'active', 'mls_untrusted_package');
      const parsed = exact(decodeMlsMessage, transfer.commit);
      need(parsed.wireformat === 'mls_private_message' && parsed.privateMessage.contentType === 'commit'
        && decoder.decode(parsed.privateMessage.groupId) === id && String(parsed.privateMessage.epoch) === transfer.previousEpoch, 'mls_device_transfer_rejected');
      let changed, addition;
      try {
        changed = await processPrivateMessage(group.value, parsed.privateMessage, emptyPskIndex, suite, event => {
          const actor = event.kind === 'commit' && group.value.ratchetTree[event.senderLeafIndex * 2];
          const who = actor?.nodeType === 'leaf' && JSON.parse(decoder.decode(actor.leaf.credential.identity));
          addition = event.kind === 'commit' && event.proposals.length === 1 && event.proposals[0].proposal;
          return who?.[2] === transfer.actorOwner && who[3] === transfer.actorDeviceId && addition?.proposalType === 'add'
            && equal(addition.add.keyPackage.leafNode.credential.identity, credential(pin).identity)
            && equal(addition.add.keyPackage.leafNode.signaturePublicKey, pin.signaturePublicKey) ? 'accept' : 'reject';
        });
        need(changed.kind === 'newState' && changed.actionTaken === 'accept' && addition
          && await hash(encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: addition.add.keyPackage })) === transfer.packageHash
          && String(changed.newState.groupContext.epoch) === transfer.epoch
          && JSON.stringify(roster(changed.newState)) === JSON.stringify(transfer.roster)
          && equal(encodeRatchetTree(changed.newState.ratchetTree), transfer.tree), 'mls_device_transfer_rejected');
        await put(saved, { [`mls:group:${id}`]: { ...group.row, multiDevice: true, bytes: encodeGroupState(changed.newState) },
          [`mls:device-transition:${transfer.id}`]: digest });
        return id;
      } finally { wipe(changed); }
    });
  }
  async function acceptDeviceWelcome(peer, transfer, expected) {
    need(multiDevice, 'mls_multidevice_disabled');
    need(expected && typeof expected === 'object', 'mls_device_intent_rejected');
    return acceptWelcome(peer, transfer, undefined, expected);
  }
  async function deviceChangeTransfer(transfer,expected,peer) {
    need(multiDevice,'mls_multidevice_disabled');
    const fields=['id','previousEpoch','actorOwner','actorDeviceId','addedOwner','addedDeviceId','packageHash','removedOwner','removedDeviceId'];
    need(transfer?.version===3 && Object.keys(transfer).sort().join(',')===deviceChangeFields.join(',')
      && expected && Object.keys(expected).sort().join(',')===[...fields].sort().join(',')
      && fields.every(k=>expected[k]===transfer[k]) && uuid(transfer.id) && uuid(transfer.conversationId)
      && uuid(transfer.actorDeviceId) && uuid(transfer.removedDeviceId) && transfer.actorDeviceId!==transfer.removedDeviceId
      && [owner,peer].includes(transfer.actorOwner) && [owner,peer].includes(transfer.removedOwner)
      && typeof transfer.previousEpoch==='string' && /^[1-9][0-9]{0,19}$/.test(transfer.previousEpoch)
      && typeof transfer.epoch==='string' && /^[1-9][0-9]{0,19}$/.test(transfer.epoch)
      && BigInt(transfer.epoch)===BigInt(transfer.previousEpoch)+1n,'mls_device_intent_rejected');
    const add=transfer.addedDeviceId!=='';
    need(add ? uuid(transfer.addedDeviceId) && transfer.addedOwner===transfer.removedOwner
      && transfer.addedDeviceId!==transfer.removedDeviceId && /^[a-f0-9]{64}$/.test(transfer.packageHash)
      : transfer.addedOwner==='' && transfer.packageHash==='' && transfer.welcome instanceof Uint8Array && transfer.welcome.length===0,
      'mls_device_intent_rejected');
    for(const key of ['commit','tree','welcome'])need(transfer[key] instanceof Uint8Array && transfer[key].length<=65536
      && (transfer[key].length>0 || key==='welcome'&&!add),'mls_wire_rejected');
    validRoster(transfer.roster,peer,2);
    need(!transfer.roster.some(m=>m.id===transfer.removedDeviceId),'mls_device_roster_rejected');
    return hash(encoder.encode(JSON.stringify(['winga-mls-device-change',3,transfer.conversationId,
      ...fields.map(k=>transfer[k]),transfer.epoch,transfer.roster,await hash(transfer.commit),await hash(transfer.welcome),await hash(transfer.tree)])));
  }
  async function changeDevice(conversationId,expectedEpoch,removedDeviceId,packageBytes=null,target=null,operationId=crypto.randomUUID()) {
    need(multiDevice,'mls_multidevice_disabled');
    need(uuid(conversationId) && uuid(removedDeviceId) && uuid(operationId) && typeof expectedEpoch==='string'
      && /^[1-9][0-9]{0,19}$/.test(expectedEpoch),'mls_device_intent_rejected');
    need(target===null ? packageBytes===null : target && Object.keys(target).sort().join(',')==='id,owner'
      && uuid(target.id) && ownerId(target.owner) && packageBytes instanceof Uint8Array && packageBytes.length<=8192,'mls_device_intent_rejected');
    packageBytes=packageBytes?.slice();target=structuredClone(target);
    return locked(async()=>{
      const saved=await vault.snapshot(),group=await state(saved,conversationId,removedDeviceId),own=saved.values['mls:identity'];
      need(group.row.confirmed && !saved.values[`mls:membership:${conversationId}`],'mls_membership_pending');
      need(String(group.value.groupContext.epoch)===expectedEpoch,'mls_device_epoch_conflict');noPendingSend(saved,conversationId);
      const before=roster(group.value),removed=before.find(m=>m.id===removedDeviceId),pin=removed&&group.records.get(`${removed.owner}/${removed.id}`);
      need(removed && removed.id!==own.id && (removed.owner===owner || pin?.status==='revoked'),'mls_device_intent_rejected');
      const index=group.value.ratchetTree.findIndex(n=>n?.nodeType==='leaf' && equal(n.leaf.credential.identity,credential(removed).identity));
      const proposals=[{proposalType:'remove',remove:{removed:index/2}}],after=before.filter(m=>m.id!==removedDeviceId);
      if(target) {
        const fresh=group.records.get(`${target.owner}/${target.id}`);
        need(target.owner===removed.owner && fresh?.status==='active' && !before.some(m=>m.id===target.id),'mls_untrusted_package');
        await inspectBoundKeyPackage(packageBytes,fresh,now());const kp=exact(decodeMlsMessage,packageBytes).keyPackage;
        need(equal(kp.leafNode.signaturePublicKey,fresh.signaturePublicKey),'mls_untrusted_package');
        proposals.push({proposalType:'add',add:{keyPackage:kp}});after.push({owner:target.owner,id:target.id,fingerprint:fresh.fingerprint,key:Array.from(fresh.signaturePublicKey)});
      }
      after.sort((a,b)=>`${a.owner}/${a.id}`<`${b.owner}/${b.id}`?-1:1);validRoster(after,group.row.peer,2);
      const changed=await createCommit({state:group.value,cipherSuite:suite},{extraProposals:proposals});
      try {
        need(changed.newState.groupContext.epoch===group.value.groupContext.epoch+1n
          && JSON.stringify(roster(changed.newState))===JSON.stringify(after),'mls_device_roster_rejected');
        const transfer={version:3,id:operationId,conversationId,previousEpoch:expectedEpoch,epoch:String(changed.newState.groupContext.epoch),
          actorOwner:owner,actorDeviceId:own.id,removedOwner:removed.owner,removedDeviceId,addedOwner:target?.owner||'',addedDeviceId:target?.id||'',
          packageHash:target?await hash(packageBytes):'',roster:after,commit:encodeMlsMessage(changed.commit),tree:encodeRatchetTree(changed.newState.ratchetTree),
          welcome:target?encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:changed.welcome}):new Uint8Array()};
        await put(saved,{[`mls:group:${conversationId}`]:{...group.row,multiDevice:true,bytes:encodeGroupState(changed.newState),confirmed:false},
          [`mls:membership:${conversationId}`]:transfer});return structuredClone(transfer);
      }finally{wipe(changed);}
    });
  }
  async function applyDeviceChange(peer,transfer,expected) {
    transfer=structuredClone(transfer);expected=structuredClone(expected);
    return locked(async()=>{
      need(ownerId(peer)&&peer!==owner,'mls_peer_invalid');const digest=await deviceChangeTransfer(transfer,expected,peer);
      const saved=await vault.snapshot(),id=transfer.conversationId,own=saved.values['mls:identity'];
      need(saved.values[`mls:route:${peer}`]?.conversationId===id && own.id!==transfer.removedDeviceId,'mls_peer_invalid');
      const prior=await record(saved,`mls:device-transition:${transfer.id}`);if(prior){need(prior===digest,'mls_replay_conflict');return id;}
      const group=await state(saved,id,transfer.removedDeviceId),before=roster(group.value),removed=before.find(m=>m.id===transfer.removedDeviceId);
      need(group.row.confirmed && !saved.values[`mls:membership:${id}`],'mls_membership_pending');
      need(String(group.value.groupContext.epoch)===transfer.previousEpoch,'mls_device_epoch_conflict');noPendingSend(saved,id);
      need(removed?.owner===transfer.removedOwner && before.some(m=>m.id===transfer.actorDeviceId && m.owner===transfer.actorOwner)
        && (removed.owner===transfer.actorOwner || group.records.get(`${removed.owner}/${removed.id}`)?.status==='revoked'),'mls_device_intent_rejected');
      const after=before.filter(m=>m.id!==removed.id),add=transfer.addedDeviceId!=='';
      const pin=add&&group.records.get(`${transfer.addedOwner}/${transfer.addedDeviceId}`);
      if(add){need(pin?.status==='active' && !before.some(m=>m.id===pin.id),'mls_untrusted_package');after.push({owner:pin.owner,id:pin.id,fingerprint:pin.fingerprint,key:Array.from(pin.signaturePublicKey)});}
      after.sort((a,b)=>`${a.owner}/${a.id}`<`${b.owner}/${b.id}`?-1:1);
      need(JSON.stringify(after)===JSON.stringify(transfer.roster),'mls_device_roster_rejected');
      const index=group.value.ratchetTree.findIndex(n=>n?.nodeType==='leaf' && equal(n.leaf.credential.identity,credential(removed).identity))/2;
      const parsed=exact(decodeMlsMessage,transfer.commit);
      need(parsed.wireformat==='mls_private_message' && parsed.privateMessage.contentType==='commit'
        && decoder.decode(parsed.privateMessage.groupId)===id && String(parsed.privateMessage.epoch)===transfer.previousEpoch,'mls_device_transfer_rejected');
      let changed,addition;
      try {
        changed=await processPrivateMessage(group.value,parsed.privateMessage,emptyPskIndex,suite,event=>{
          const actor=event.kind==='commit' && group.value.ratchetTree[event.senderLeafIndex*2],who=actor?.nodeType==='leaf'&&JSON.parse(decoder.decode(actor.leaf.credential.identity));
          const proposals=event.kind==='commit'&&event.proposals.map(p=>p.proposal),removals=proposals&&proposals.filter(p=>p.proposalType==='remove');
          addition=proposals&&proposals.find(p=>p.proposalType==='add');
          return who?.[2]===transfer.actorOwner && who[3]===transfer.actorDeviceId && proposals.length===(add?2:1)
            && removals.length===1 && removals[0].remove.removed===index && (add?addition
              && equal(addition.add.keyPackage.leafNode.credential.identity,credential(pin).identity)
              && equal(addition.add.keyPackage.leafNode.signaturePublicKey,pin.signaturePublicKey):!addition)?'accept':'reject';
        });
        need(changed.kind==='newState' && changed.actionTaken==='accept' && (!add||addition
          && await hash(encodeMlsMessage({version:'mls10',wireformat:'mls_key_package',keyPackage:addition.add.keyPackage}))===transfer.packageHash)
          && String(changed.newState.groupContext.epoch)===transfer.epoch && JSON.stringify(roster(changed.newState))===JSON.stringify(transfer.roster)
          && equal(encodeRatchetTree(changed.newState.ratchetTree),transfer.tree),'mls_device_transfer_rejected');
        await put(saved,{[`mls:group:${id}`]:{...group.row,multiDevice:true,bytes:encodeGroupState(changed.newState)},[`mls:device-transition:${transfer.id}`]:digest});return id;
      }finally{wipe(changed);}
    });
  }
  async function acceptDeviceChangeWelcome(peer,transfer,expected) {
    need(transfer?.version===3 && uuid(transfer.addedDeviceId),'mls_device_intent_rejected');return acceptWelcome(peer,transfer,undefined,expected);
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
  async function acceptWelcome(peer, transfer, expectedPeerDeviceId, deviceExpected) {
    need(expectedPeerDeviceId === undefined || uuid(expectedPeerDeviceId), 'mls_peer_invalid');
    transfer = structuredClone(transfer);
    deviceExpected = structuredClone(deviceExpected);
    return locked(async () => {
      const id = transfer.conversationId; need(uuid(id) && ownerId(peer) && peer !== owner, 'mls_peer_invalid');
      const saved = await vault.snapshot(); let identity = saved.values['mls:identity']; need(identity, 'mls_identity_required');
      const previous = saved.values[`mls:group:${id}`];
      const deviceAdmission = deviceExpected !== undefined;
      const transferHash = deviceAdmission ? (transfer.version===3?await deviceChangeTransfer(transfer,deviceExpected,peer):await deviceTransfer(transfer, deviceExpected, peer))
        : await hash(encoder.encode(JSON.stringify(['winga-mls-welcome',1,id,transfer.id,transfer.epoch,transfer.packageHash,
          Array.from(transfer.commit),Array.from(transfer.welcome),Array.from(transfer.tree)])));
      if (previous?.acceptedTransfer === transfer.id && previous.peer === peer) {
        need(previous.acceptedHash === transferHash && (!expectedPeerDeviceId || previous.acceptedPeerDevice === expectedPeerDeviceId),'mls_replay_conflict');return id;
      }
      need(!previous && !saved.values[`mls:route:${peer}`], 'mls_group_exists');
      const admission = await record(saved,`mls:package:${transfer.packageHash}`) || identity;
      if (deviceAdmission) need(transfer.addedOwner === owner && transfer.addedDeviceId === admission.id, 'mls_device_intent_rejected');
      need(!(await record(saved,`mls:consumed:${admission.hash}`)) && saved.values['mls:package-consumed'] !== admission.hash && transfer.packageHash === admission.hash, 'mls_package_consumed');
      identity = admission;
      validLifetime(identity.package.publicPackage);
      const { configuration } = await config(saved), decoded = exact(decodeMlsMessage, transfer.welcome);
      need(decoded.wireformat === 'mls_welcome', 'mls_welcome_invalid');
      const joined = await joinGroup(decoded.welcome, identity.package.publicPackage, identity.package.privatePackage,
        emptyPskIndex, suite, exact(decodeRatchetTree, transfer.tree), undefined, configuration);
      need(decoder.decode(joined.groupContext.groupId) === id && String(joined.groupContext.epoch) === transfer.epoch, 'mls_welcome_binding_rejected');
      const leaves=joined.ratchetTree.filter(node=>node?.nodeType==='leaf');
      need(deviceAdmission ? JSON.stringify(roster(joined)) === JSON.stringify(transfer.roster) : leaves.length===2,'mls_unexpected_member');
      let peerDevice;
      for (const node of leaves) {
        need(await configuration.authService.validateCredential(node.leaf.credential, node.leaf.signaturePublicKey), 'mls_untrusted_member');
        const who = JSON.parse(decoder.decode(node.leaf.credential.identity)); need(who[2] === owner || who[2] === peer, 'mls_unexpected_member');
        if (!deviceAdmission) {
          if(who[2]===owner)need(who[3]===identity.id,'mls_unexpected_member');
          else {need(!peerDevice && (!expectedPeerDeviceId || who[3]===expectedPeerDeviceId),'mls_unexpected_member');peerDevice=who[3];}
        } else if (who[2] === peer) peerDevice = who[3];
      }
      need(peerDevice,'mls_unexpected_member');
      if (deviceAdmission) need(leaves.some(node => equal(node.leaf.credential.identity, credential(identity).identity))
        && transfer.roster.some(entry => entry.owner === transfer.actorOwner && entry.id === transfer.actorDeviceId), 'mls_device_roster_rejected');
      current(); await policy.markEncrypted(owner, peer); current();
      await put(saved, { [`mls:group:${id}`]: { peer, ...(deviceAdmission ? { multiDevice: true } : {}), bytes: encodeGroupState(joined), confirmed: true, acceptedTransfer: transfer.id, acceptedHash: transferHash,acceptedPeerDevice:peerDevice },
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
      let job = saved.values[`mls:outbox:${payload.clientMessageId}`], history = await record(saved,`history:${payload.clientMessageId}`);
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
      need(reply.createdAt===undefined||typeof reply.createdAt==='string'&&Number.isFinite(Date.parse(reply.createdAt)), 'mls_send_confirmation_rejected');
      saved = await vault.snapshot();
      need(saved.values[`mls:outbox:${job.id}`]?.hash === job.hash, 'mls_send_retry_conflict');
      const result = { ...history, timestamp:reply.createdAt||history.timestamp, status: 'sent' };
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
      const digest = await hash(envelope.ciphertext), prior = await record(saved,`mls:received:${envelope.id}`);
      if (prior) {
        need(prior === digest, 'mls_replay_conflict'); const item = await record(saved,`history:${envelope.id}`);
        need((!envelope.hash || envelope.hash === digest) && item?.epoch === envelope.epoch && (!envelope.deviceId || envelope.deviceId === item.deviceId)
          && (!envelope.sender_device || envelope.sender_device === item.deviceId), 'mls_envelope_binding_rejected');
        return item;
      }
      if(envelope.hash)need(envelope.hash===digest,'mls_envelope_binding_rejected');
      need(!(await record(saved,`history:${envelope.id}`)), 'mls_message_id_conflict');
      const group = await state(saved, id), parsed = exact(decodeMlsMessage, envelope.ciphertext);
      need(group.row.confirmed && parsed.wireformat === 'mls_private_message'
        && decoder.decode(parsed.privateMessage.groupId) === id && String(parsed.privateMessage.epoch) === envelope.epoch
        && parsed.privateMessage.epoch === group.value.groupContext.epoch, 'mls_envelope_binding_rejected');
      let result, sender;
      try {
        try {
          sender = await decryptSenderData(parsed.privateMessage, group.value.keySchedule.senderDataSecret, suite);
          result = await processPrivateMessage(group.value, parsed.privateMessage, emptyPskIndex, suite, () => 'reject');
        }
        catch { fail('mls_ciphertext_rejected'); }
        need(result.kind === 'applicationMessage', 'mls_application_required');
        let content;try { content = JSON.parse(decoder.decode(result.message)); }catch{fail('mls_content_binding_rejected');}
        need(content && Object.keys(content).sort().join(',') === 'conversationId,deviceId,epoch,id,message,owner,peer,signature'
          && content.id === envelope.id && content.conversationId === id && content.epoch === envelope.epoch
          && ((content.owner === peer && content.peer === owner) || (multiDevice && group.row.multiDevice
            && content.owner === owner && content.peer === peer && content.deviceId !== saved.values['mls:identity'].id)) && typeof content.message === 'string'
          && content.message.trim().length && encoder.encode(content.message).length <= 16384
          && Array.isArray(content.signature) && content.signature.length === 64
          && content.signature.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255), 'mls_content_binding_rejected');
        const pin = group.records.get(`${content.owner}/${content.deviceId}`);
        const leaf = Number.isInteger(sender?.leafIndex) && group.value.ratchetTree[sender.leafIndex * 2];
        need(pin?.status === 'active' && leaf?.nodeType === 'leaf'
          && equal(leaf.leaf.credential.identity, credential(pin).identity) && equal(leaf.leaf.signaturePublicKey, pin.signaturePublicKey)
          && (!envelope.deviceId || envelope.deviceId === content.deviceId) && (!envelope.sender_device || envelope.sender_device === content.deviceId)
          && await suite.signature.verify(pin.signaturePublicKey, contentBytes(content), new Uint8Array(content.signature)), 'mls_sender_rejected');
        const history = { ...content, hash: digest, timestamp: envelope.created_at || new Date(now()).toISOString(), status: content.owner === owner ? 'sent' : 'delivered', encrypted: true }; delete history.signature;
        await put(saved, { [`mls:group:${id}`]: { ...group.row, bytes: encodeGroupState(result.newState) },
          [`history:${envelope.id}`]: history, [`mls:received:${envelope.id}`]: digest }); return history;
      } finally { if (result?.message) result.message.fill(0); if (sender?.reuseGuard) sender.reuseGuard.fill(0); wipe(result); }
    });
  }
  async function retryMessage(id) {
    current(); need(uuid(id), 'mls_message_id_invalid');
    const saved = await vault.snapshot(), pending = saved.values[`mls:outbox:${id}`], item = await record(saved,`history:${id}`);
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
      if(vault.pruneExpiredAdmissions)await vault.pruneExpiredAdmissions(now());
      const saved = await vault.snapshot(), identity = saved.values['mls:identity'];
      need(identity, 'mls_identity_required');
      const expired = identity.package.publicPackage.leafNode.lifetime.notAfter <= BigInt(Math.floor(now() / 1000));
      if (!expired && !(await record(saved,`mls:consumed:${identity.hash}`)) && saved.values['mls:package-consumed'] !== identity.hash) return;
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
    const belongs=(value,key)=>key.startsWith('history:')&&(!peer||value.owner===peer||value.peer===peer);
    current(); const saved = await (vault.historySnapshot?vault.historySnapshot({filter:belongs}):vault.snapshot()); current();
    return Object.entries(saved.values).filter(([key,value]) => belongs(value,key))
      .map(([,value]) => structuredClone(value)).sort((a,b) => a.timestamp.localeCompare(b.timestamp));
  }
  async function applyReceipt(p, pin) {
    return locked(async () => {
      const saved = await vault.snapshot(), item = await record(saved,`history:${p.id}`);
      need(item && item.owner === owner && p.hash === item.hash && p.conversationId === item.conversationId && p.epoch === item.epoch
        && pin?.owner === item.peer && ['delivered','read'].includes(p.kind), 'mls_receipt_rejected');
      await put(saved, { [`history:${p.id}`]: { ...item, status: item.status === 'read' ? 'read' : p.kind } }, [`mls:outbox:${p.id}`]);
    });
  }
  async function conversationId(peer) {
    current();const saved=await vault.snapshot(),id=saved.values[`mls:route:${peer}`]?.conversationId;
    need(uuid(id) && saved.values[`mls:group:${id}`]?.confirmed,'mls_group_required');return id;
  }
  async function conversationEpoch(peer) {
    current();const saved=await vault.snapshot(),id=saved.values[`mls:route:${peer}`]?.conversationId,row=saved.values[`mls:group:${id}`];
    need(uuid(id) && row?.confirmed,'mls_group_required');
    const parsed=decodeGroupState(row.bytes,0);need(parsed && parsed[1]===row.bytes.length && decoder.decode(parsed[0].groupContext.groupId)===id,'mls_state_invalid');
    current();return String(parsed[0].groupContext.epoch);
  }
  return { initialize, prepareKeyPackage, history, applyReceipt, createConversation, addPeer, replacePeer, confirmMembership, acceptWelcome, isEncrypted, sendMessage, receive,conversationId,
    retryMessage,conversationEpoch,addDevice,applyDeviceCommit,acceptDeviceWelcome,changeDevice,applyDeviceChange,acceptDeviceChangeWelcome,
    close() { closed = true; } };
}
