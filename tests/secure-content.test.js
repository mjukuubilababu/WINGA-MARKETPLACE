const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSecureContent, ALGORITHM, MAX_MEDIA_BYTES, MAX_BACKUP_BYTES } = require('../src/chat/secure-content');
const binding = { conversationId: 'thread-1', attachmentId: 'file-1' };
const recovery = { owner: 'alice', id: 'archive-1', generation: 1 };

for (const size of [0, 17, 65536, 65537, 131081]) {
  test(`media roundtrip authenticates ${size} bytes and hides filename and MIME`, async () => {
    const codec = await createSecureContent();
    const source = Uint8Array.from({ length: size }, (_, index) => index % 251);
    const sealed = await codec.encryptMedia(new Blob([source]), binding, { name: 'private-file.png', mime: 'image/png' });
    const opened = await codec.decryptMedia(sealed.ciphertext, sealed.descriptor, binding);
    assert.equal(opened.name, 'private-file.png');
    assert.equal(opened.blob.type, 'image/png');
    assert.deepEqual(new Uint8Array(await opened.blob.arrayBuffer()), source);
    const stored = Buffer.from(await sealed.ciphertext.arrayBuffer());
    assert.equal(stored.includes(Buffer.from('private-file.png')), false);
    assert.equal(stored.includes(Buffer.from('image/png')), false);
    assert.equal(sealed.descriptor.algorithm, ALGORITHM);
  });
}

test('every file uses a fresh key and nonce; wrong keys, damage and appended bytes fail atomically', async () => {
  const codec = await createSecureContent();
  const one = await codec.encryptMedia(new Blob(['sensitive content']), binding);
  const two = await codec.encryptMedia(new Blob(['sensitive content']), binding);
  assert.notEqual(one.descriptor.key, two.descriptor.key);
  const bytes = new Uint8Array(await one.ciphertext.arrayBuffer());
  assert.notDeepEqual(bytes.subarray(8, 20), new Uint8Array(await two.ciphertext.arrayBuffer()).subarray(8, 20));
  await assert.rejects(codec.decryptMedia(one.ciphertext, two.descriptor, binding));
  for (const offset of [0, 8, 20, bytes.length - 1]) {
    const damaged = bytes.slice(); damaged[offset] ^= 1;
    await assert.rejects(codec.decryptMedia(new Blob([damaged]), one.descriptor, binding));
  }
  for (const size of [0, 19, 40, bytes.length - 1]) {
    await assert.rejects(codec.decryptMedia(one.ciphertext.slice(0, size), one.descriptor, binding));
  }
  await assert.rejects(codec.decryptMedia(new Blob([bytes, new Uint8Array([0])]), one.descriptor, binding));
  const splice = bytes.slice(); splice.set(new Uint8Array(await two.ciphertext.arrayBuffer()).subarray(20), 20);
  await assert.rejects(codec.decryptMedia(new Blob([splice]), one.descriptor, binding));
});

test('media bindings, unsupported descriptors and over-limit files are rejected', async () => {
  const codec = await createSecureContent();
  const sealed = await codec.encryptMedia(new Blob(['private']), binding);
  for (const change of [{ conversationId: 'other' }, { attachmentId: 'other' }]) {
    const other = { ...binding, ...change };
    await assert.rejects(codec.decryptMedia(sealed.ciphertext, sealed.descriptor, other));
    await assert.rejects(codec.decryptMedia(sealed.ciphertext, { ...sealed.descriptor, ...other }, other));
  }
  for (const change of [{ version: 1 }, { algorithm: 'plaintext' }, { extra: true }, { key: sealed.descriptor.key + '=' }]) {
    await assert.rejects(codec.decryptMedia(sealed.ciphertext, { ...sealed.descriptor, ...change }, binding));
  }
  await assert.rejects(codec.encryptMedia(new Blob([new Uint8Array(MAX_MEDIA_BYTES + 1)]), binding));
  await assert.rejects(codec.decryptMedia(new Blob([new Uint8Array(MAX_MEDIA_BYTES + 4137)]), sealed.descriptor, binding));
});

test('recovery requires the user key and exact authenticated account, archive and generation', async () => {
  const codec = await createSecureContent(), key = codec.generateRecoveryKey();
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  const source = new TextEncoder().encode('private message history');
  const capsule = await codec.sealRecovery(source, key, recovery);
  const second = await codec.sealRecovery(source, key, recovery);
  assert.notEqual(capsule.nonce, second.nonce);
  assert.equal(Buffer.from(capsule.nonce, 'base64url').length, 12);
  assert.equal(JSON.stringify(capsule).includes(key), false);
  assert.equal(JSON.stringify(capsule).includes('private message history'), false);
  assert.deepEqual(await codec.openRecovery(capsule, key, recovery), source);
  assert.deepEqual(source, new TextEncoder().encode('private message history'));
  await assert.rejects(codec.openRecovery(capsule, codec.generateRecoveryKey(), recovery));
  for (const change of [{ owner: 'bob' }, { id: 'archive-2' }, { generation: 2 }]) {
    const other = { ...recovery, ...change };
    await assert.rejects(codec.openRecovery(capsule, key, other));
    await assert.rejects(codec.openRecovery({ ...capsule, ...other }, key, other));
  }
  for (const change of [{ purpose: 'device-identity' }, { version: 2 }, { key }, { nonce: capsule.nonce + '=' }]) {
    await assert.rejects(codec.openRecovery({ ...capsule, ...change }, key, recovery));
  }
  const damaged = Buffer.from(capsule.ciphertext, 'base64url'); damaged[0] ^= 1;
  await assert.rejects(codec.openRecovery({ ...capsule, ciphertext: damaged.toString('base64url') }, key, recovery));
  await assert.rejects(codec.sealRecovery(new Uint8Array(MAX_BACKUP_BYTES + 1), key, recovery));
  await assert.rejects(codec.sealRecovery(new Uint8Array(0), key, recovery));
});

test('native crypto unavailability is a hard failure with no plaintext substitute', async () => {
  for (const crypto of [null, {}, { getRandomValues: () => {}, subtle: null }, { getRandomValues: () => {}, subtle: {} }]) {
    await assert.rejects(createSecureContent(crypto));
  }
});
