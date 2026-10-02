import {
  createApplicationMessage, createCommit, defaultCapabilities, emptyPskIndex,
  encodeGroupState, encodeMlsMessage, decodeMlsMessage, generateKeyPackage, generateKeyPackageWithKey,
  getCiphersuiteFromName, getCiphersuiteImpl, joinGroup, processPrivateMessage, zeroOutUint8Array,
} from 'ts-mls';
import { encodeRatchetTree, decodeRatchetTree } from 'ts-mls/ratchetTree.js';
import { createAuthenticatedGroup, restoreAuthenticatedState, pinnedDeviceConfig, syntheticDeviceCredential } from '../device-identity.mjs';
import secureContent from '../../../src/chat/secure-content.js';
import { keyPackageLifetime, validateKeyPackageLifetime } from '../key-package-policy.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const need = (condition, code = 'encrypted_flow_rejected') => { if (!condition) throw new Error(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const encode = bytes => { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const decode = value => { need(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)); const result = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)); need(encode(result) === value); return result; };
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const pack = value => encoder.encode(JSON.stringify(value, (_, item) => item instanceof Uint8Array ? { $bytes: encode(item) } : typeof item === 'bigint' ? { $integer: String(item) } : item));
const unpack = value => JSON.parse(decoder.decode(value), (_, item) => item && Object.keys(item).length === 1
  ? typeof item.$bytes === 'string' ? decode(item.$bytes) : typeof item.$integer === 'string' && /^[0-9]+$/.test(item.$integer) ? BigInt(item.$integer) : item : item);
const decodeExact = (method, value) => { const bytes = typeof value === 'string' ? decode(value) : value; const decoded = method(bytes, 0); need(decoded && decoded[1] === bytes.length); return decoded[0]; };
const consumed = value => value.consumed.forEach(zeroOutUint8Array);
const equalSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const advanceStatus = (current, next) => {
  const order = { failed: 0, pending: 0, sent: 1, delivered: 2, read: 3 };
  need(Object.hasOwn(order, current) && Object.hasOwn(order, next), 'invalid_outgoing_status');
  return order[next] > order[current] ? next : current;
};
const credential = value => {
  need(value?.credentialType === 'basic');
  const tuple = JSON.parse(decoder.decode(value.identity));
  need(Array.isArray(tuple) && tuple.length === 4 && tuple[0] === 'winga-mls-device-spike' && tuple[1] === 1);
  const expected = syntheticDeviceCredential(tuple[2], tuple[3]);
  need(encode(expected.identity) === encode(value.identity)); return { owner: tuple[2], device: tuple[3] };
};
const suitePromise = getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
const codecPromise = secureContent.createSecureContent();

class Vault {
  constructor(owner) { this.name = `winga-e2ee-audit-v1:${owner}`; }
  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('keys'); req.result.createObjectStore('records'); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  async access(store, mode, work) {
    const db = await this.open();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode); let result;
      try { const req = work(tx.objectStore(store)); if (req) req.onsuccess = () => { result = req.result; }; }
      catch (failure) { tx.abort(); reject(failure); }
      tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error || new Error('durable_write_aborted'));
    }); } finally { db.close(); }
  }
  async initialize() {
    let key = await this.access('keys', 'readonly', store => store.get('local'));
    if (!key) {
      need((await this.access('records', 'readonly', store => store.count())) === 0, 'storage_key_missing');
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await this.access('keys', 'readwrite', store => store.add(key, 'local'));
    }
    need(key instanceof CryptoKey && key.extractable === false); this.key = key;
  }
  parameters(id, nonce) { return { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(JSON.stringify([this.name, 1, id])), tagLength: 128 }; }
  async protect(id, value) {
    const plaintext = pack(value), nonce = crypto.getRandomValues(new Uint8Array(12));
    try { return { v: 1, nonce, ciphertext: new Uint8Array(await crypto.subtle.encrypt(this.parameters(id, nonce), this.key, plaintext)) }; }
    finally { plaintext.fill(0); }
  }
  async reveal(id, value) {
    need(value?.v === 1 && value.nonce instanceof Uint8Array && value.ciphertext instanceof Uint8Array);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(this.parameters(id, value.nonce), this.key, value.ciphertext));
    try { return unpack(plaintext); } finally { plaintext.fill(0); }
  }
  async get(id) { const value = await this.access('records', 'readonly', store => store.get(id)); return value ? this.reveal(id, value) : null; }
  async list(prefix) {
    const db = await this.open();
    let rows;
    try { rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly'), result = [], req = tx.objectStore('records').openCursor();
      req.onsuccess = () => { const cursor = req.result; if (cursor) { if (String(cursor.key).startsWith(prefix)) result.push([cursor.key, cursor.value]); cursor.continue(); } };
      tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
    return Promise.all(rows.map(async ([id, value]) => [id, await this.reveal(id, value)]));
  }
  async write(values = {}, deleted = [], abort = false) {
    const records = await Promise.all(Object.entries(values).map(async ([id, value]) => [id, await this.protect(id, value)]));
    const db = await this.open();
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
      for (const [id, value] of records) store.put(value, id);
      for (const id of deleted) store.delete(id);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('durable_write_aborted'));
      if (abort) tx.abort();
    }); } finally { db.close(); }
  }
}

class AuditClient {
  constructor() {
    need(isSecureContext && ['127.0.0.1', 'localhost'].includes(location.hostname), 'audit_requires_localhost');
    need(navigator.locks?.request, 'web_locks_required'); this.closed = false;
  }
  lock(work) { need(this.session && !this.closed, 'signed_out'); return navigator.locks.request(`winga-audit:${this.session.owner}`, work); }
  async plain(path, method = 'GET', payload) {
    const response = await fetch(path, { method, credentials: 'same-origin', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(this.session ? { 'X-CSRF-Token': this.session.csrf } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.code || 'request_failed'), { status: response.status, code: value.code }); return value;
  }
  async login(owner, password) { this.session = await this.plain('/api/login', 'POST', { owner, password }); return this.initialize(); }
  async resume() { this.session = await this.plain('/api/session'); return this.initialize(); }
  async assertSession(offline = false) {
    need(this.session && !this.closed, 'signed_out');
    let current;
    try { current = await this.plain('/api/session'); }
    catch (failure) { if (offline && !failure.status && this.session.expiresAt > Date.now()) return; throw failure; }
    need(current.owner === this.session.owner && current.sessionId === this.session.sessionId && !this.closed, 'account_changed');
  }
  async initialize(resetIdentity = false) {
    this.vault = new Vault(this.session.owner);
    return this.lock(async () => {
      await this.vault.initialize(); let device = await this.vault.get('device');
      if (!device) {
        const id = crypto.randomUUID(), suite = await suitePromise;
        const kp = await generateKeyPackage(syntheticDeviceCredential(this.session.owner, id), defaultCapabilities(), keyPackageLifetime(), [], suite);
        const wire = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: kp.publicPackage });
        device = { id, owner: this.session.owner, publicKey: encode(kp.publicPackage.leafNode.signaturePublicKey), signaturePrivateKey: kp.privatePackage.signaturePrivateKey, package: encode(wire) };
        await this.vault.write({ device, [`package:${await digest(wire)}`]: kp });
      }
      need(device.owner === this.session.owner); this.device = device;
      try { validateKeyPackageLifetime(decodeExact(decodeMlsMessage, device.package).keyPackage); }
      catch {
        const kp = await generateKeyPackageWithKey(syntheticDeviceCredential(device.owner, device.id), defaultCapabilities(), keyPackageLifetime(), [],
          { signKey: device.signaturePrivateKey.slice(), publicKey: decode(device.publicKey) }, await suitePromise);
        const wire = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: kp.publicPackage });
        device = { ...device, package: encode(wire) }; this.device = device;
        await this.vault.write({ device, [`package:${await digest(wire)}`]: kp });
      }
      const registered = await this.request('/api/devices/register', 'POST', { id: device.id, package: device.package, resetIdentity });
      need(registered.public_key === device.publicKey && registered.owner === device.owner, 'server_identity_substitution');
      const pins = await this.vault.get('pins') || {};
      pins[device.id] = { owner: device.owner, device: device.id, key: device.publicKey };
      await this.vault.write({ pins }); this.status = registered.status;
      return { owner: device.owner, deviceId: device.id, fingerprint: await digest(decode(device.publicKey)), status: this.status };
    });
  }
  async request(path, method = 'GET', payload, binary = false) {
    await this.assertSession(); need(this.device, 'device_missing');
    const raw = payload === undefined ? new Uint8Array() : binary ? payload : encoder.encode(JSON.stringify(payload));
    const time = Date.now(), id = crypto.randomUUID();
    const signed = encoder.encode(JSON.stringify(['winga-audit-request', 1, this.session.owner, this.session.sessionId,
      this.device.id, method, path, id, time, await digest(raw)]));
    const proof = await (await suitePromise).signature.sign(this.device.signaturePrivateKey, signed);
    const response = await fetch(path, { method, credentials: 'same-origin', redirect: 'error', headers: {
      'Content-Type': binary ? 'application/octet-stream' : 'application/json', 'X-CSRF-Token': this.session.csrf,
      'X-Device-Id': this.device.id, 'X-Request-Id': id, 'X-Proof-Time': String(time), 'X-Device-Proof': encode(proof),
    }, body: method === 'GET' ? undefined : raw });
    if (response.ok && binary && method === 'GET') return new Blob([await response.arrayBuffer()], { type: 'application/octet-stream' });
    const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.code || 'request_failed'), { status: response.status, code: value.code }); return value;
  }
  async directory() {
    await this.assertSession(); const rows = await this.plain('/api/devices'), pins = await this.vault.get('pins') || {};
    return Promise.all(rows.map(async value => ({ ...value, fingerprint: await digest(decode(value.public_key)), trusted: pins[value.id]?.key === value.public_key })));
  }
  async trustDevice(id, fingerprint) {
    return this.lock(async () => {
      const target = (await this.directory()).find(value => value.id === id);
      need(target && target.status !== 'revoked' && target.fingerprint === fingerprint, 'fingerprint_mismatch');
      const pins = await this.vault.get('pins') || {};
      need(!pins[id] || pins[id].key === target.public_key, 'pinned_identity_changed');
      pins[id] = { owner: target.owner, device: id, key: target.public_key }; await this.vault.write({ pins }); return true;
    });
  }
  async approveDevice(id, fingerprint) { await this.trustDevice(id, fingerprint); return this.request('/api/devices/approve', 'POST', { id, fingerprint }); }
  async revokeDevice(id, fingerprint) { return this.request('/api/devices/revoke', 'POST', { id, fingerprint }); }
  async config() {
    const pins = Object.values(await this.vault.get('pins') || {});
    // Old pinned leaves remain verifiable while a revocation-removal commit is processed.
    // Admission and all server reads/writes separately require an active approved device.
    return pinnedDeviceConfig(pins.map(pin => ({ owner: pin.owner, device: pin.device, status: 'active', signaturePublicKey: decode(pin.key) })));
  }
  async state(roomId) {
    const saved = await this.vault.get(`group:${roomId}`); need(saved && !saved.quarantined, 'fresh_welcome_required');
    return restoreAuthenticatedState(saved.bytes, await this.config());
  }
  async freshPackage() {
    const suite = await suitePromise, kp = await generateKeyPackageWithKey(syntheticDeviceCredential(this.session.owner, this.device.id),
      defaultCapabilities(), keyPackageLifetime(), [], { signKey: this.device.signaturePrivateKey.slice(), publicKey: decode(this.device.publicKey) }, suite);
    const wire = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: kp.publicPackage }), hash = await digest(wire);
    await this.vault.write({ [`package:${hash}`]: kp }); await this.request('/api/devices/package', 'POST', { package: encode(wire) }); return { hash, kp };
  }
  async stage(values, jobs, deleted = [], abort = false) {
    await this.assertSession(true);
    const pending = await this.vault.list('pending:'); need(pending.length + jobs.length <= 256, 'outbox_limit');
    let order = (await this.vault.get('clock')) || 0;
    for (const job of jobs) values[`pending:${job.id}`] = { ...job, order: ++order };
    values.clock = order; await this.vault.write(values, deleted, abort);
  }
  async flush() { return this.lock(() => this.flushLocked()); }
  async flushLocked({ roomId: selectedRoom, ignoreRekey = false } = {}) {
    const pending = (await this.vault.list('pending:')).sort((a, b) => a[1].order - b[1].order);
    for (const entry of [...pending]) {
      const job = entry[1], roomId = job.payload?.roomId;
      if (job.kind === 'commit' && pending.some(([, item]) => item.kind === 'message'
        && item.payload.roomId === roomId && item.blockedCode === 'room_rekey_required')) {
        pending.splice(pending.indexOf(entry), 1); pending.unshift(entry);
      }
    }
    const blocked = new Set(); let selectedFailure;
    for (const [key, job] of pending) {
      const roomId = job.payload?.roomId || new URL(job.path, location.origin).searchParams.get('roomId');
      if (selectedRoom && roomId !== selectedRoom) continue;
      if (!await this.vault.get(key)) continue;
      if (blocked.has(roomId) && !(ignoreRekey && job.kind === 'commit'
        && (await this.vault.get(`outbox-block:${roomId}`))?.code === 'room_rekey_required')) continue;
      if (roomId && (await this.vault.get(`group:${roomId}`))?.quarantined) continue;
      try {
        const result = await this.request(job.path, job.method, job.payload, job.binary);
        if (job.payload?.id) need(result.id === job.payload.id, 'ack_mismatch');
        const values = {}, deleted = [key];
        if (job.kind === 'message') { const item = await this.vault.get(`history:${job.payload.id}`); if (item) values[`history:${item.id}`] = { ...item, status: advanceStatus(item.status, 'sent') }; }
        if (job.kind === 'commit') {
          // Only an explicit pre-commit rejection proves that an old-epoch send
          // was never accepted. Unknown outcomes retain their exact retry bytes.
          const rejected = (await this.vault.list('pending:')).filter(([, item]) =>
            item.kind === 'message' && item.payload.roomId === roomId && item.blockedCode === 'room_rekey_required');
          for (const [, item] of rejected) {
            const history = await this.vault.get(`history:${item.payload.id}`);
            if (history?.status === 'pending') values[`history:${history.id}`] = { ...history, status: 'failed' };
          }
          deleted.push(`outbox-block:${roomId}`, ...rejected.map(([id]) => id));
          blocked.delete(roomId);
        }
        await this.vault.write(values, deleted);
      } catch (failure) {
        if (failure.code === 'message_not_stored' || failure.code === 'message_not_delivered') continue;
        // This explicit 409 is a definite non-acceptance: the server checks an
        // earlier idempotent acceptance before checking recipient membership.
        // Keep failed history and the advanced ratchet; only retire this queue job.
        if (job.kind === 'message' && failure.status === 409 && failure.code === 'recipient_not_joined') {
          const item = await this.vault.get(`history:${job.payload.id}`);
          if (item?.status === 'pending') {
            await this.vault.write({ [`history:${item.id}`]: { ...item, status: 'failed' } }, [key]);
            continue;
          }
        }
        if (failure.code === 'epoch_conflict') {
          const state = await this.vault.get(`group:${job.payload.roomId}`);
          await this.vault.write({ [`group:${job.payload.roomId}`]: { ...state, quarantined: true } });
        }
        if (failure.status === 401) throw failure;
        blocked.add(roomId);
        await this.vault.write({ [key]: { ...job, blockedCode: failure.code || 'outcome_unknown' },
          [`outbox-block:${roomId}`]: { code: failure.code || 'outcome_unknown' } });
        if (selectedRoom && !(ignoreRekey && failure.code === 'room_rekey_required')) selectedFailure ||= failure;
      }
    }
    if (selectedFailure) throw selectedFailure;
    return pending.length;
  }
  async createRoom(peer) {
    return this.lock(async () => {
      await this.flushLocked(); const { hash, kp } = await this.freshPackage(), roomId = crypto.randomUUID();
      const state = await createAuthenticatedGroup(encoder.encode(roomId), kp, await suitePromise, await this.config());
      const id = crypto.randomUUID();
      await this.stage({ [`group:${roomId}`]: { bytes: encodeGroupState(state) } }, [{ id, kind: 'create', path: '/api/rooms', method: 'POST', payload: { id, roomId, peer, packageHash: hash } }]);
      await this.flushLocked({ roomId }); return roomId;
    });
  }
  async addDevice(roomId, id) { return this.changeMembers(roomId, id, true); }
  async removeDevice(roomId, id) { return this.changeMembers(roomId, id, false); }
  async prepareRejoin(roomId) {
    return this.lock(async () => {
      const remote = (await this.rooms()).find(row => row.id === roomId);
      need(remote && !remote.devices.some(row => row.id === this.device.id), 'peer_must_remove_device_first');
      const pending = (await this.vault.list('pending:')).filter(([, job]) => job.payload?.roomId === roomId || job.path.includes(`roomId=${roomId}`));
      const values = {};
      for (const [, job] of pending.filter(([, job]) => job.kind === 'message')) {
        const item = await this.vault.get(`history:${job.payload.id}`);
        if (item && ['pending','sent'].includes(item.status)) values[`history:${item.id}`] = { ...item, status: 'failed' };
      }
      await this.freshPackage();
      await this.vault.write(values, [`group:${roomId}`, `quarantine:${roomId}`, ...pending.map(([id]) => id)]);
      return { freshWelcomeRequired: true };
    });
  }
  async changeMembers(roomId, deviceId, add) {
    return this.lock(async () => {
      await this.flushLocked({ roomId, ignoreRekey: !add }); const state = await this.state(roomId), expectedEpoch = Number(state.groupContext.epoch);
      const directory = await this.directory(), pins = await this.vault.get('pins');
      let proposal, adds = [], removes = [];
      if (add) {
        const target = directory.find(row => row.id === deviceId);
        need(target?.status === 'active' && target.trusted && target.package, 'verified_device_required');
        const kp = decodeExact(decodeMlsMessage, target.package); need(kp.wireformat === 'mls_key_package');
        validateKeyPackageLifetime(kp.keyPackage);
        need(encode(kp.keyPackage.leafNode.signaturePublicKey) === pins[deviceId].key, 'identity_changed');
        proposal = { proposalType: 'add', add: { keyPackage: kp.keyPackage } };
        adds = [{ deviceId, packageHash: await digest(decode(target.package)) }];
      } else {
        const index = state.ratchetTree.findIndex(node => node?.nodeType === 'leaf' && credential(node.leaf.credential).device === deviceId);
        need(index >= 0 && deviceId !== this.device.id, 'invalid_removal');
        proposal = { proposalType: 'remove', remove: { removed: index / 2 } }; removes = [deviceId];
      }
      const changed = await createCommit({ state, cipherSuite: await suitePromise }, { extraProposals: [proposal] });
      try {
        const id = crypto.randomUUID(), payload = { id, roomId, expectedEpoch, ciphertext: encode(encodeMlsMessage(changed.commit)), adds, removes,
          welcome: add ? encode(encodeMlsMessage({ version: 'mls10', wireformat: 'mls_welcome', welcome: changed.welcome })) : null,
          tree: add ? encode(encodeRatchetTree(changed.newState.ratchetTree)) : null };
        await this.stage({ [`group:${roomId}`]: { bytes: encodeGroupState(changed.newState) } }, [{ id, kind: 'commit', path: '/api/commits', method: 'POST', payload }]);
        await this.flushLocked({ roomId, ignoreRekey: !add }); return { epoch: expectedEpoch + 1 };
      } finally { consumed(changed); }
    });
  }
  contentBytes(value) { return encoder.encode(JSON.stringify(['winga-audit-content', 1, value.id, value.roomId, value.epoch, value.owner, value.device, value.kind, value.text, value.attachment])); }
  validateContent(value) {
    need(value && equalSet(Object.keys(value), ['v','id','roomId','epoch','owner','device','kind','text','attachment','signature']) && value.v === 1
      && uuid(value.id) && uuid(value.roomId) && uuid(value.device) && Number.isSafeInteger(value.epoch) && value.epoch >= 0
      && ['alice','bob','eve'].includes(value.owner) && ['text','media'].includes(value.kind) && typeof value.text === 'string' && value.text.length <= 4000);
    need(value.kind === 'text' ? value.text.trim().length > 0 && value.attachment === null
      : value.attachment?.conversationId === value.roomId && uuid(value.attachment.attachmentId), 'invalid_content');
  }
  async sendText(roomId, text, options = {}) { return this.send(roomId, text, null, options); }
  async sendMedia(roomId, blob, metadata, text = '', options = {}) { return this.send(roomId, text, { blob, metadata }, options); }
  async send(roomId, text, media, { abort = false } = {}) {
    return this.lock(async () => {
      await this.assertSession(true); const state = await this.state(roomId), suite = await suitePromise;
      try {
        const remote = (await this.rooms()).find(row => row.id === roomId);
        need(remote && remote.devices.some(row => row.id === this.device.id), 'room_device_not_joined');
        need(!remote.blocked, 'room_rekey_required');
        need(remote.devices.some(row => row.id !== this.device.id && row.status === 'active'), 'recipient_not_joined');
        need(remote.epoch === Number(state.groupContext.epoch), 'pending_sync_required');
      } catch (failure) { if (failure.status || failure.code || !(failure instanceof TypeError)) throw failure; }
      const id = crypto.randomUUID(), epoch = Number(state.groupContext.epoch), jobs = [];
      let attachment = null;
      if (media) {
        const attachmentId = crypto.randomUUID(), codec = await codecPromise;
        const encrypted = await codec.encryptMedia(media.blob, { conversationId: roomId, attachmentId }, media.metadata);
        attachment = encrypted.descriptor;
        const pendingBytes = (await this.vault.list('pending:')).reduce((size, [, job]) => size + (job.binary ? job.payload.length : 0), 0);
        need(pendingBytes + encrypted.ciphertext.size <= 32 * 1024 * 1024, 'outbox_media_limit');
        jobs.push({ id: attachmentId, kind: 'media', path: `/api/media/${attachmentId}?roomId=${roomId}`, method: 'PUT', binary: true, payload: new Uint8Array(await encrypted.ciphertext.arrayBuffer()) });
      }
      const envelope = { v: 1, id, roomId, epoch, owner: this.session.owner, device: this.device.id, kind: media ? 'media' : 'text', text, attachment, signature: '' };
      this.validateContent(envelope); envelope.signature = encode(await suite.signature.sign(this.device.signaturePrivateKey, this.contentBytes(envelope)));
      const plaintext = pack(envelope), encrypted = await createApplicationMessage(state, plaintext, suite);
      plaintext.fill(0);
      try {
        const wire = encodeMlsMessage({ version: 'mls10', wireformat: 'mls_private_message', privateMessage: encrypted.privateMessage });
        jobs.push({ id, kind: 'message', path: '/api/messages', method: 'POST', payload: { id, roomId, epoch, ciphertext: encode(wire), attachmentIds: attachment ? [attachment.attachmentId] : [] } });
        const history = { ...envelope, status: 'pending', at: Date.now(), cipherHash: await digest(wire) };
        await this.stage({ [`group:${roomId}`]: { bytes: encodeGroupState(encrypted.newState) }, [`history:${id}`]: history }, jobs, [], abort);
        try { await this.flushLocked({ roomId }); } catch (failure) { if (failure.status || failure.code) throw failure; }
        return this.vault.get(`history:${id}`);
      } finally { consumed(encrypted); }
    });
  }
  async sync() {
    return this.lock(async () => {
      // Persist one quarantine per room locally before excluding its queue remotely.
      // A lost reject response is retried without rolling back a consumed ratchet.
      for (const [, rejected] of await this.vault.list('quarantine:')) await this.request('/api/events/reject', 'POST', rejected);
      const events = await this.request('/api/events'), suite = await suitePromise; const acknowledgements = [];
      const blocked = new Set();
      for (const event of events) {
        if (blocked.has(event.room_id)) continue;
        const fingerprint = await digest(pack(event)), seen = await this.vault.get(`seen:${event.id}`);
        if (seen) { need(seen === fingerprint, 'event_substitution'); acknowledgements.push(event.id); continue; }
        const p = event.payload, roomId = event.room_id, values = {}, deleted = [], jobs = [];
        need(uuid(roomId)); let result, validated = false;
        try {
          if (event.kind === 'welcome') {
            need(!(await this.vault.get(`group:${roomId}`)), 'existing_group_cannot_be_replaced');
            const kp = await this.vault.get(`package:${p.packageHash}`); need(kp, 'key_package_missing');
            validateKeyPackageLifetime(kp.publicPackage);
            const welcome = decodeExact(decodeMlsMessage, p.welcome); need(welcome.wireformat === 'mls_welcome');
            const config = await this.config();
            // Welcome validates a historical tree, not fresh admission of every
            // existing member. Own admission is checked above; future Adds use
            // strict expiry again, including the explicit maximum-lifetime check.
            const joined = await joinGroup(welcome.welcome, kp.publicPackage, kp.privatePackage, emptyPskIndex, suite,
              decodeExact(decodeRatchetTree, p.tree), undefined,
              { ...config, lifetimeConfig: { ...config.lifetimeConfig, validateLifetimeOnReceive: false } });
            joined.clientConfig = config;
            need(decoder.decode(joined.groupContext.groupId) === roomId && joined.groupContext.epoch === BigInt(p.epoch), 'welcome_binding_mismatch');
            values[`group:${roomId}`] = { bytes: encodeGroupState(joined) }; deleted.push(`package:${p.packageHash}`);
          } else if (event.kind === 'commit' || event.kind === 'message') {
            const state = await this.state(roomId), decoded = decodeExact(decodeMlsMessage, p.ciphertext);
            need(decoded.wireformat === 'mls_private_message' && decoder.decode(decoded.privateMessage.groupId) === roomId
              && decoded.privateMessage.epoch === BigInt(event.kind === 'commit' ? p.expectedEpoch : p.epoch), 'envelope_binding_mismatch');
            const directory = event.kind === 'commit' ? await this.directory() : null;
            result = await processPrivateMessage(state, decoded.privateMessage, emptyPskIndex, suite, notice => {
              need(notice.kind === 'commit', 'unexpected_proposal');
              const sender = credential(state.ratchetTree[notice.senderLeafIndex * 2].leaf.credential);
              need(sender.device === p.actor && sender.owner === p.owner, 'commit_sender_mismatch');
              const additions = [], removals = [];
              for (const entry of notice.proposals) {
                const proposal = entry.proposal;
                if (proposal.proposalType === 'add') {
                  validateKeyPackageLifetime(proposal.add.keyPackage);
                  const added = credential(proposal.add.keyPackage.leafNode.credential), target = directory.find(row => row.id === added.device);
                  need(target?.status === 'active' && target.trusted && target.owner === added.owner, 'verified_device_required'); additions.push(added.device);
                } else if (proposal.proposalType === 'remove') removals.push(credential(state.ratchetTree[proposal.remove.removed * 2].leaf.credential).device);
                else throw new Error('unsupported_proposal');
              }
              need(equalSet(additions, p.adds.map(row => row.deviceId)) && equalSet(removals, p.removes), 'commit_roster_mismatch');
              return 'accept';
            });
            if (event.kind === 'commit') {
              need(result.kind === 'newState' && result.actionTaken === 'accept' && result.newState.groupContext.epoch === BigInt(p.epoch), 'commit_rejected');
            } else {
              need(result.kind === 'applicationMessage', 'message_rejected');
              const envelope = unpack(result.message); this.validateContent(envelope);
              const pins = await this.vault.get('pins'), pin = pins[envelope.device];
              need(state.ratchetTree.some(node => node?.nodeType === 'leaf' && credential(node.leaf.credential).device === envelope.device), 'sender_not_joined');
              need(pin?.owner === envelope.owner && envelope.device === p.actor && envelope.owner === p.owner && envelope.id === p.id
                && envelope.roomId === roomId && envelope.epoch === p.epoch && await suite.signature.verify(decode(pin.key), this.contentBytes(envelope), decode(envelope.signature)), 'content_signature_rejected');
              need(equalSet(p.attachmentIds, envelope.attachment ? [envelope.attachment.attachmentId] : []), 'attachment_binding_mismatch');
              const prior = await this.vault.get(`history:${envelope.id}`), cipherHash = await digest(decode(p.ciphertext));
              need(!prior || prior.cipherHash === cipherHash, 'message_id_collision');
              values[`history:${envelope.id}`] = prior || { ...envelope, at: Date.now(), cipherHash, status: envelope.owner === this.session.owner ? 'sent' : 'received' };
              if (envelope.owner !== this.session.owner) jobs.push({ id: crypto.randomUUID(), kind: 'receipt', path: '/api/receipts', method: 'POST', payload: { id: envelope.id, kind: 'stored' } });
            }
            values[`group:${roomId}`] = { bytes: encodeGroupState(result.newState) };
          } else if (event.kind === 'receipt') {
            need(uuid(p.id) && ['stored','read'].includes(p.kind)); const item = await this.vault.get(`history:${p.id}`);
            if (item) {
              need(item.owner === this.session.owner && item.roomId === roomId, 'receipt_binding_mismatch');
              values[`history:${p.id}`] = { ...item, status: advanceStatus(item.status, p.kind === 'read' ? 'read' : 'delivered') };
            }
            // Unknown history is not invented; authenticated recovery explicitly
            // subscribes again to the server's canonical receipt state.
          } else throw new Error('unknown_event');
          validated = true;
          values[`seen:${event.id}`] = fingerprint; await this.stage(values, jobs, deleted); acknowledgements.push(event.id);
        } catch (failure) {
          if (validated || failure.status || (failure instanceof DOMException && !['OperationError','DataError'].includes(failure.name))
            || (failure instanceof TypeError && /fetch/i.test(failure.message))) throw failure;
          const rejected = { id: event.id, roomId, fingerprint };
          const saved = await this.vault.get(`group:${roomId}`);
          await this.vault.write({ [`group:${roomId}`]: { ...saved, quarantined: true }, [`quarantine:${roomId}`]: rejected });
          blocked.add(roomId);
        } finally { if (result) { if (result.message) result.message.fill(0); consumed(result); } }
      }
      if (acknowledgements.length) await this.request('/api/events/ack', 'POST', { ids: acknowledgements });
      if (events.some(event => event.kind === 'welcome' && acknowledgements.includes(event.id))) await this.freshPackage();
      for (const [, rejected] of await this.vault.list('quarantine:')) await this.request('/api/events/reject', 'POST', rejected);
      await this.flushLocked(); return events.length;
    });
  }
  async markRead(roomId, visibleIds = []) {
    return this.lock(async () => {
      need(Array.isArray(visibleIds) && visibleIds.length <= 1000 && visibleIds.every(uuid), 'visible_message_ids_required');
      const visible = new Set(visibleIds);
      const rows = await this.history(roomId), jobs = [];
      for (const item of rows.filter(row => visible.has(row.id) && row.owner !== this.session.owner && !row.readLocally && !row.recovered)) {
        jobs.push({ id: crypto.randomUUID(), kind: 'receipt', path: '/api/receipts', method: 'POST', payload: { id: item.id, kind: 'read' } });
      }
      const values = Object.fromEntries(rows.filter(row => visible.has(row.id) && row.owner !== this.session.owner && !row.recovered).map(row => [`history:${row.id}`, { ...row, readLocally: true }]));
      await this.stage(values, jobs); await this.flushLocked(); return jobs.length;
    });
  }
  async openAttachment(id) {
    const item = await this.vault.get(`history:${id}`); need(item?.attachment, 'attachment_missing');
    const binding = { conversationId: item.roomId, attachmentId: item.attachment.attachmentId };
    const encrypted = await this.request(`/api/media/${binding.attachmentId}?roomId=${item.roomId}`, 'GET', undefined, true);
    return (await codecPromise).decryptMedia(encrypted, item.attachment, binding);
  }
  async generateRecoveryKey() { return (await codecPromise).generateRecoveryKey(); }
  async backup(key) {
    return this.lock(async () => {
      await this.assertSession(); let pending = await this.vault.get('backup:pending');
      if (!pending) {
        const remote = await this.request('/api/recovery'), rows = await this.history(); need(rows.length <= 1000, 'recovery_history_limit');
        const archive = pack({ v: 1, owner: this.session.owner, purpose: 'history-only', rows });
        try {
          const capsule = await (await codecPromise).sealRecovery(archive, key, { owner: this.session.owner, id: crypto.randomUUID(), generation: Number(remote.revision) + 1 });
          pending = { expectedRevision: remote.revision, capsule }; await this.vault.write({ 'backup:pending': pending });
        } finally { archive.fill(0); }
      } else {
        // A retry retains exactly the accepted ciphertext; it never regenerates the capsule.
        const checked = await (await codecPromise).openRecovery(pending.capsule, key, { owner: this.session.owner, id: pending.capsule.id, generation: pending.capsule.generation }); checked.fill(0);
      }
      const result = await this.request('/api/recovery', 'PUT', pending); await this.vault.write({}, ['backup:pending']); return result;
    });
  }
  async restore(key) {
    return this.lock(async () => {
      const remote = await this.request('/api/recovery'); need(remote.capsule, 'recovery_missing'); const capsule = remote.capsule;
      const plaintext = await (await codecPromise).openRecovery(capsule, key, { owner: this.session.owner, id: capsule.id, generation: capsule.generation });
      try {
        const archive = unpack(plaintext);
        need(archive?.v === 1 && archive.owner === this.session.owner && archive.purpose === 'history-only'
          && equalSet(Object.keys(archive), ['v','owner','purpose','rows']) && Array.isArray(archive.rows) && archive.rows.length <= 1000, 'invalid_recovery_archive');
        const values = {}, ids = new Set();
        for (const row of archive.rows) {
          const { status, at, cipherHash, readLocally, recovered, ...envelope } = row; this.validateContent(envelope);
          need(equalSet(Object.keys(row).filter(k => !['readLocally','recovered'].includes(k)), ['v','id','roomId','epoch','owner','device','kind','text','attachment','signature','status','at','cipherHash'])
            && ['pending','sent','delivered','read','received','failed'].includes(status) && Number.isSafeInteger(at) && /^[a-f0-9]{64}$/.test(cipherHash) && !ids.has(row.id), 'invalid_recovery_row');
          ids.add(row.id); const prior = await this.vault.get(`history:${row.id}`); need(!prior || prior.cipherHash === cipherHash, 'recovery_conflict');
          if (!prior) values[`history:${row.id}`] = { ...row, recovered: true };
        }
        const jobs = [];
        const rooms = new Map();
        for (const row of archive.rows.filter(row => row.owner === this.session.owner && ['sent','delivered','read'].includes(row.status))) {
          if (!rooms.has(row.roomId)) rooms.set(row.roomId, []); rooms.get(row.roomId).push(row.id);
        }
        for (const [roomId, ids] of rooms) for (let offset = 0; offset < ids.length; offset += 64) {
          const id = crypto.randomUUID();
          jobs.push({ id, kind: 'history-receipts', path: '/api/receipts/history', method: 'POST', payload: { id, roomId, messageIds: ids.slice(offset, offset + 64) } });
        }
        const restored = Object.keys(values).length;
        await this.stage(values, jobs); await this.flushLocked();
        return { restored, identityRestored: false, groupStateRestored: false };
      } finally { plaintext.fill(0); }
    });
  }
  async discardPendingBackup({ confirmed = false } = {}) {
    need(confirmed === true, 'backup_discard_confirmation_required');
    return this.lock(async () => {
      const pending = await this.vault.get('backup:pending');
      need(pending, 'pending_backup_missing');
      const remote = await this.request('/api/recovery');
      const accepted = remote.revision === String(Number(pending.expectedRevision) + 1)
        && remote.capsule && equalSet(Object.keys(remote.capsule), Object.keys(pending.capsule))
        && Object.keys(pending.capsule).every(field => remote.capsule[field] === pending.capsule[field]);
      need(accepted || remote.revision !== pending.expectedRevision, 'backup_conflict_not_observed');
      await this.vault.write({}, ['backup:pending']);
      return { discarded: !accepted, alreadyAccepted: Boolean(accepted), revision: remote.revision, remoteChanged: false };
    });
  }
  async deleteBackup() { return this.lock(async () => { const remote = await this.request('/api/recovery'); return this.request('/api/recovery', 'DELETE', { expectedRevision: remote.revision }); }); }
  async rooms() { return this.request('/api/rooms'); }
  async history(roomId) { await this.assertSession(); return (await this.vault.list('history:')).map(([, row]) => row).filter(row => !roomId || row.roomId === roomId).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)); }
  async logout() { try { await this.plain('/api/logout', 'POST', {}); } finally { this.closed = true; this.session = null; this.device = null; this.vault = null; } }
}
window.WingaAudit = { createClient: () => new AuditClient(), productionEnabled: false };
