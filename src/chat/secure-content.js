(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WingaSecureContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
  const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
  const ALGORITHM = 'webcrypto-aes256gcm-v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const magic = encoder.encode('WINGAEM2');
  const failure = code => Object.assign(new Error(code), { code });
  const fail = () => { throw failure('encrypted_content_invalid'); };
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const validMetadata = value => exact(value, ['version', 'name', 'mime', 'bytes'])
    && value.version === 1 && typeof value.name === 'string' && value.name.length <= 255
    && typeof value.mime === 'string' && value.mime.length <= 127
    && /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(value.mime)
    && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= MAX_MEDIA_BYTES;
  let loading;
  function loadSecureContent() {
    if (!globalThis.isSecureContext) return Promise.reject(failure('crypto_secure_context_required'));
    if (!loading) loading = createSecureContent(globalThis.crypto);
    return loading;
  }

  async function createSecureContent(crypto = globalThis.crypto) {
    if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function'
      || ['encrypt', 'decrypt', 'importKey'].some(method => typeof crypto.subtle[method] !== 'function')) fail();
    const random = length => crypto.getRandomValues(new Uint8Array(length));
    function encode(bytes) {
      let result = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        result += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      return btoa(result).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function decode(value, maxBytes, length) {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)
        || value.length > Math.ceil(maxBytes * 4 / 3)) fail();
      const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
      if (bytes.length > maxBytes || (length && bytes.length !== length) || encode(bytes) !== value) fail();
      return bytes;
    }
    function recoveryContext(value) {
      if (!id(value?.owner) || !id(value?.id) || !Number.isSafeInteger(value.generation) || value.generation < 1) fail();
      return encoder.encode(JSON.stringify(['winga-secure-content', 1, ALGORITHM, 'history-recovery',
        value.owner, value.id, value.generation]));
    }
    function mediaContext(value) {
      if (!id(value?.conversationId) || !id(value?.attachmentId)) fail();
      return encoder.encode(JSON.stringify(['winga-private-media', 2, ALGORITHM,
        value.conversationId, value.attachmentId]));
    }
    const importKey = (bytes, usage) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [usage]);
    const parameters = (nonce, ad) => ({ name: 'AES-GCM', iv: nonce, additionalData: ad, tagLength: 128 });
    async function encryptMedia(blob, binding, metadata = {}) {
      const ad = mediaContext(binding);
      if (!(blob instanceof Blob) || blob.size > MAX_MEDIA_BYTES) fail();
      const info = { version: 1, name: metadata.name ?? 'attachment',
        mime: metadata.mime ?? (blob.type || 'application/octet-stream'), bytes: blob.size };
      if (!validMetadata(info)) fail();
      const header = encoder.encode(JSON.stringify(info));
      if (header.length > 4096) fail();
      const keyBytes = random(32), nonce = random(12);
      const descriptor = { version: 2, algorithm: ALGORITHM,
        conversationId: binding.conversationId, attachmentId: binding.attachmentId, key: encode(keyBytes) };
      let plaintext, source;
      try {
        source = new Uint8Array(await blob.arrayBuffer());
        plaintext = new Uint8Array(4 + header.length + source.length);
        new DataView(plaintext.buffer).setUint32(0, header.length);
        plaintext.set(header, 4); plaintext.set(source, 4 + header.length);
        const encrypted = await crypto.subtle.encrypt(parameters(nonce, ad), await importKey(keyBytes, 'encrypt'), plaintext);
        return { ciphertext: new Blob([magic, nonce, encrypted], { type: 'application/octet-stream' }), descriptor };
      } finally { keyBytes.fill(0); plaintext?.fill(0); source?.fill(0); header.fill(0); }
    }
    async function decryptMedia(blob, descriptor, binding) {
      if (!exact(descriptor, ['version', 'algorithm', 'conversationId', 'attachmentId', 'key'])
        || descriptor.version !== 2 || descriptor.algorithm !== ALGORITHM
        || descriptor.conversationId !== binding?.conversationId || descriptor.attachmentId !== binding?.attachmentId
        || !(blob instanceof Blob) || blob.size < 40 || blob.size > MAX_MEDIA_BYTES + 4136) fail();
      const ad = mediaContext(binding), keyBytes = decode(descriptor.key, 32, 32);
      let plaintext;
      try {
        const encrypted = new Uint8Array(await blob.arrayBuffer());
        if (!magic.every((byte, index) => encrypted[index] === byte)) fail();
        // Native AEAD authenticates the complete bounded file before any plaintext is returned.
        plaintext = new Uint8Array(await crypto.subtle.decrypt(parameters(encrypted.subarray(8, 20), ad),
          await importKey(keyBytes, 'decrypt'), encrypted.subarray(20)));
        if (plaintext.length < 4) fail();
        const headerSize = new DataView(plaintext.buffer).getUint32(0);
        if (!headerSize || headerSize > 4096 || headerSize + 4 > plaintext.length) fail();
        const info = JSON.parse(decoder.decode(plaintext.subarray(4, 4 + headerSize)));
        if (!validMetadata(info) || plaintext.length !== 4 + headerSize + info.bytes) fail();
        return { blob: new Blob([plaintext.subarray(4 + headerSize)], { type: info.mime }), name: info.name };
      } finally { keyBytes.fill(0); plaintext?.fill(0); }
    }
    function generateRecoveryKey() {
      const bytes = random(32);
      try { return encode(bytes); } finally { bytes.fill(0); }
    }
    async function sealRecovery(archive, recoveryKey, binding) {
      const ad = recoveryContext(binding);
      if (!(archive instanceof Uint8Array) || !archive.length || archive.length > MAX_BACKUP_BYTES) fail();
      const keyBytes = decode(recoveryKey, 32, 32), nonce = random(12), plaintext = archive.slice();
      const capsule = { version: 1, algorithm: ALGORITHM, purpose: 'history-recovery',
        owner: binding.owner, id: binding.id, generation: binding.generation, nonce: encode(nonce) };
      try {
        capsule.ciphertext = encode(new Uint8Array(await crypto.subtle.encrypt(parameters(nonce, ad),
          await importKey(keyBytes, 'encrypt'), plaintext)));
        return capsule;
      } finally { keyBytes.fill(0); plaintext.fill(0); }
    }
    async function openRecovery(capsule, recoveryKey, binding) {
      if (!exact(capsule, ['version', 'algorithm', 'purpose', 'owner', 'id', 'generation', 'nonce', 'ciphertext'])
        || capsule.version !== 1 || capsule.algorithm !== ALGORITHM || capsule.purpose !== 'history-recovery'
        || capsule.owner !== binding?.owner || capsule.id !== binding?.id || capsule.generation !== binding?.generation) fail();
      const ad = recoveryContext(binding), encrypted = decode(capsule.ciphertext, MAX_BACKUP_BYTES + 16);
      if (encrypted.length < 17) fail();
      const nonce = decode(capsule.nonce, 12, 12), keyBytes = decode(recoveryKey, 32, 32);
      try {
        return new Uint8Array(await crypto.subtle.decrypt(parameters(nonce, ad), await importKey(keyBytes, 'decrypt'), encrypted));
      } finally { keyBytes.fill(0); }
    }
    return { encryptMedia, decryptMedia, generateRecoveryKey, sealRecovery, openRecovery };
  }
  return { createSecureContent, loadSecureContent, ALGORITHM, MAX_MEDIA_BYTES, MAX_BACKUP_BYTES };
});
