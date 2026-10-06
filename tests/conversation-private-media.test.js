const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { createPrivateMediaStorage, readPrivateMediaConfig, MAX_BYTES } = require('../backend/conversation-private-media');
const env = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET_NAME: 'market-public', R2_BACKUP_BUCKET_NAME: 'legacy-private',
  R2_CONVERSATION_BUCKET_NAME: 'conversation-private', R2_CONVERSATION_ACCESS_KEY_ID: 'test-access',
  R2_CONVERSATION_SECRET_ACCESS_KEY: 'test-secret', R2_CONVERSATION_API_TOKEN: 'test-token', R2_CONVERSATION_ISOLATION_CONFIRMED: 'true' };
const data = () => Buffer.concat([Buffer.from('WINGAEM2'), crypto.randomBytes(80)]);
const descriptor = bytes => ({ id: crypto.randomUUID(), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
function fixture(options = {}) {
  const calls = [], objects = new Map();
  const client = { send: async command => {
    const input = command.input; calls.push(command);
    if (command.constructor.name === 'PutObjectCommand') {
      if (objects.has(input.Key)) throw { $metadata: { httpStatusCode: 412 } };
      objects.set(input.Key, Buffer.from(input.Body)); return {};
    }
    const bytes = objects.get(input.Key);
    if (!bytes) throw new Error('secret provider details');
    return { ContentLength: bytes.length, ContentType: 'application/octet-stream',
      Metadata: { sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, Body: Readable.from([bytes]) };
  } };
  const store = createPrivateMediaStorage({ env, client, authorize: async () => true, privacyCheck: async () => {}, ...options });
  return { store, calls, objects };
}
test('encrypted storage requires isolated private configuration and authorization hook', () => {
  for (const change of [{ R2_CONVERSATION_BUCKET_NAME: env.R2_BUCKET_NAME }, { R2_CONVERSATION_BUCKET_NAME: env.R2_BACKUP_BUCKET_NAME },
    { R2_CONVERSATION_ISOLATION_CONFIRMED: 'false' }, { R2_CONVERSATION_API_TOKEN: '' }]) {
    assert.throws(() => readPrivateMediaConfig({ ...env, ...change }), error => error.code === 'private_media_configuration_required');
  }
  assert.throws(() => createPrivateMediaStorage({ env }), error => error.code === 'private_media_unavailable');
  assert.throws(() => fixture({purpose:'../../chat'}),error=>error.code==='private_media_unavailable');
});

test('trusted report-copy namespace cannot overwrite an original conversation object with the same descriptor',async()=>{
  const bytes=data(),object=descriptor(bytes),f=fixture({purpose:'report-evidence'});
  await f.store.put({},object,bytes);
  assert.ok(f.calls.every(c=>c.input.Key===`report-evidence/v1/${object.id}/${object.sha256}.bin`));
  assert.equal(f.objects.has(`conversation-encrypted/v1/${object.id}/${object.sha256}.bin`),false);
});
test('upload stores only opaque ciphertext with immutable exact retry and private headers', async () => {
  const f = fixture(), bytes = data(), object = descriptor(bytes);
  assert.deepEqual(await f.store.put({}, object, bytes), object);
  assert.deepEqual(await f.store.put({}, object, bytes), object);
  assert.deepEqual(await f.store.get({}, object), bytes);
  const upload = f.calls[0].input;
  assert.equal(upload.CacheControl, 'private, no-store'); assert.equal(upload.IfNoneMatch, '*');
  assert.equal(upload.ContentType, 'application/octet-stream');
  assert.deepEqual(upload.Metadata, { sha256: object.sha256 });
  assert.equal(JSON.stringify(object).includes('url'), false);
});
test('unauthorized caller never reads or writes the object store', async () => {
  const f = fixture({ authorize: async () => false }), bytes = data(), object = descriptor(bytes);
  await assert.rejects(f.store.put({}, object, bytes), error => error.status === 403);
  await assert.rejects(f.store.get({}, object), error => error.status === 403);
  assert.equal(f.calls.length, 0);
});
test('managed public access and custom domain attachment block encrypted storage', async () => {
  for (const result of [{ enabled: true }, { enabled: false, custom: true }]) {
    const f = fixture({ privacyCheck: undefined, fetchImpl: async url => ({ ok: true, json: async () => ({ success: true,
      result: url.endsWith('/managed') ? { enabled: result.enabled } : { domains: result.custom ? [{ enabled: false }] : [] } }) }) });
    const bytes = data();
    await assert.rejects(f.store.put({}, descriptor(bytes), bytes), error => error.code === 'private_media_privacy_unverified');
    assert.equal(f.calls.length, 0);
  }
});
test('malformed, oversized and plaintext metadata are rejected before object access', async () => {
  const f = fixture(), bytes = data(), object = descriptor(bytes);
  for (const invalid of [{ ...object, bytes: MAX_BYTES + 1 }, { ...object, id: '../private' }, { ...object, key: 'plaintext-key' },
    { ...object, sha256: '0'.repeat(64) }]) await assert.rejects(f.store.put({}, invalid, bytes), error => error.status === 400);
  assert.equal(f.calls.length, 0);
});
test('revocation while downloading prevents ciphertext release', async () => {
  let allowed = true;
  const f = fixture({ authorize: async () => allowed }), bytes = data(), object = descriptor(bytes);
  await f.store.put({}, object, bytes);
  const client = { send: async () => {
    allowed = false;
    return { ContentLength: bytes.length, ContentType: 'application/octet-stream', Metadata: { sha256: object.sha256 }, Body: Readable.from([bytes]) };
  } };
  const store = createPrivateMediaStorage({ env, client, authorize: async () => allowed, privacyCheck: async () => {} });
  await assert.rejects(store.get({}, object), error => error.status === 403);
});
test('wrong remote digest and oversized streams fail closed without exposing provider errors', async () => {
  const bytes = data(), object = descriptor(bytes);
  for (const body of [Buffer.concat([bytes, Buffer.from('x')]), Buffer.from(bytes).fill(0)]) {
    const f = fixture({ client: { send: async () => ({ ContentLength: object.bytes, ContentType: 'application/octet-stream',
      Metadata: { sha256: object.sha256 }, Body: Readable.from([body]) }) } });
    await assert.rejects(f.store.get({}, object), error => error.code === 'private_media_integrity_rejected');
  }
  const f = fixture({ client: { send: async () => { throw new Error('secret key / bucket name'); } } });
  await assert.rejects(f.store.get({}, object), error => error.message === 'private_media_unavailable');
});
test('stalled object stream is bounded by a deadline', async () => {
  const bytes = data(), object = descriptor(bytes), body = new Readable({ read() {} });
  const f = fixture({ timeoutMs: 20, client: { send: async () => ({ ContentLength: object.bytes,
    ContentType: 'application/octet-stream', Metadata: { sha256: object.sha256 }, Body: body }) } });
  await assert.rejects(f.store.get({}, object), error => error.code === 'private_media_unavailable');
  assert.equal(body.destroyed, true);
});

test('caller mutations cannot change the resource authorized after an await', async () => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  const seen = [];
  const f = fixture({ authorize: async (context, object) => { seen.push({ owner: context.owner, id: object.id }); started(); await gate; return true; } });
  const bytes = data(), object = descriptor(bytes), original = object.id, context = { owner: 'bob' };
  const pending = f.store.put(context, object, bytes);
  await ready; object.id = crypto.randomUUID(); context.owner = 'alice'; bytes.fill(0); release();
  const accepted = await pending;
  assert.equal(accepted.id, original); assert.ok(seen.every(value => value.owner === 'bob' && value.id === original));
  assert.equal(f.calls[0].input.Body.subarray(0, 8).toString(), 'WINGAEM2');
});
