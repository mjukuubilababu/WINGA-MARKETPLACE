const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
const failure = (status, code) => Object.assign(new Error(code), { status, code });
const id = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
function base64(value, maxBytes, exactBytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)
    || value.length > Math.ceil(maxBytes * 4 / 3)) throw failure(400, 'invalid_encrypted_backup');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || bytes.length > maxBytes
    || (exactBytes && bytes.length !== exactBytes)) throw failure(400, 'invalid_encrypted_backup');
  return bytes.length;
}
function validateRevision(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value)
    || !Number.isSafeInteger(Number(value)) || Number(value) >= Number.MAX_SAFE_INTEGER) {
    throw failure(400, 'invalid_backup_revision');
  }
  return value;
}
function validateCapsule(capsule, owner, expectedRevision) {
  const keys = ['version', 'algorithm', 'purpose', 'owner', 'id', 'generation', 'nonce', 'ciphertext'];
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)
    || Object.keys(capsule).length !== keys.length || keys.some(key => !Object.hasOwn(capsule, key))
    || capsule.version !== 1 || capsule.algorithm !== 'webcrypto-aes256gcm-v1'
    || capsule.purpose !== 'history-recovery' || capsule.owner !== owner || !id(capsule.id)
    || capsule.generation !== Number(validateRevision(expectedRevision)) + 1) {
    throw failure(400, 'invalid_encrypted_backup');
  }
  base64(capsule.nonce, 12, 12);
  if (base64(capsule.ciphertext, MAX_BACKUP_BYTES + 16) < 17) {
    throw failure(400, 'invalid_encrypted_backup');
  }
  return Object.fromEntries(keys.map(key => [key, capsule[key]]));
}
function requireLegacyPayload(payload) {
  if (!payload || typeof payload !== 'object'
    || ['ciphertext', 'encryption', 'encryptedAttachment', 'cryptoEnvelope', 'recoveryKey']
      .some(field => Object.hasOwn(payload, field))
    || (Object.hasOwn(payload, 'securityMode') && payload.securityMode !== 'legacy-plaintext')) {
    throw failure(400, 'encrypted_protocol_unavailable');
  }
}
module.exports = { validateRevision, validateCapsule, requireLegacyPayload, failure, MAX_BACKUP_BYTES };
