const crypto = require('node:crypto');
const { failure } = require('./encrypted-content-contract');
const { authenticateCryptoSession, verifyDeviceSignature } = require('./conversation-crypto-auth');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function packageProofBytes(context, payload) {
  const keys = ['deviceId', 'requestId', 'issuedAt', 'keyPackage', 'hash', 'signature'];
  if (!payload || Object.keys(payload).length !== keys.length || keys.some(key => !Object.hasOwn(payload, key))
    || !uuid(payload.deviceId) || !uuid(payload.requestId) || !Number.isSafeInteger(payload.issuedAt) || payload.issuedAt < 0
    || typeof payload.keyPackage !== 'string' || !/^[A-Za-z0-9_-]{1,10923}$/.test(payload.keyPackage)
    || typeof payload.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(payload.signature)) throw failure(400, 'crypto_package_invalid');
  const raw = Buffer.from(payload.keyPackage, 'base64url'), signature = Buffer.from(payload.signature, 'base64url');
  if (raw.length > 8192 || raw.toString('base64url') !== payload.keyPackage || signature.length !== 64
    || signature.toString('base64url') !== payload.signature
    || crypto.createHash('sha256').update(raw).digest('hex') !== payload.hash) throw failure(400, 'crypto_package_invalid');
  return Buffer.from(JSON.stringify(['winga-crypto-key-package', 1, context.owner, context.deviceId,
    payload.deviceId, payload.requestId, payload.issuedAt, payload.hash]));
}
function createCryptoKeyPackageStore({ withTransaction, now = Date.now,
  verifyPackage = async (...args) => (await import('./conversation-mls-protocol.mjs')).verifyBoundKeyPackage(...args) }) {
  const view = row => ({ hash: row.hash, deviceId: row.device_id, keyPackage: row.package,
    mlsPublicKey: row.mls_public_key, identityProof: row.identity_proof, expiresAt: new Date(row.expires_at).toISOString() });
  async function publishCryptoKeyPackage(context, payload) {
    const proof = packageProofBytes(context || {}, payload);
    return withTransaction(async client => {
      await authenticateCryptoSession(client, context, now());
      const device = (await client.query(`SELECT * FROM conversation_crypto_devices
        WHERE id=$1 AND owner_id=$2 AND status='active' FOR SHARE`, [payload.deviceId, context.owner])).rows[0];
      if (!device || !verifyDeviceSignature(device.public_key, proof, payload.signature)) throw failure(403, 'crypto_package_proof_rejected');
      const existing = (await client.query('SELECT * FROM conversation_crypto_key_packages WHERE hash=$1 FOR UPDATE', [payload.hash])).rows[0];
      if (existing) {
        if (existing.device_id !== device.id || existing.package !== payload.keyPackage) throw failure(409, 'crypto_package_conflict');
        if (existing.consumed_at) throw failure(409, 'crypto_package_consumed');
        if (new Date(existing.expires_at).getTime() <= now()) throw failure(409, 'crypto_package_expired');
        return { version: 1, package: view(existing) };
      }
      if (Math.abs(now() - payload.issuedAt) > 30000) throw failure(401, 'crypto_device_proof_expired');
      let checked;
      try { checked = await verifyPackage(Buffer.from(payload.keyPackage, 'base64url'),
        { owner: context.owner, id: device.id, fingerprint: device.fingerprint }, now()); }
      catch { throw failure(400, 'crypto_package_invalid'); }
      const count = await client.query(`SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages
        WHERE device_id=$1 AND consumed_at IS NULL AND expires_at>NOW()`, [device.id]);
      if (count.rows[0].n >= 20) throw failure(409, 'crypto_package_limit');
      const attestation = { owner: context.owner, sessionId: context.deviceId, ...payload };
      const inserted = await client.query(`INSERT INTO conversation_crypto_key_packages
        (hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT DO NOTHING RETURNING *`, [payload.hash, device.id, payload.keyPackage, checked.mlsPublicKey,
        JSON.stringify(attestation), checked.expiresAt]);
      if (!inserted.rows.length) throw failure(409, 'crypto_package_conflict');
      return { version: 1, package: view(inserted.rows[0]) };
    });
  }
  async function readOwnCryptoKeyPackages(context) {
    return withTransaction(async client => {
      await authenticateCryptoSession(client, context, now());
      const rows = await client.query(`SELECT p.* FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
        WHERE d.owner_id=$1 AND d.status='active' AND p.consumed_at IS NULL AND p.expires_at>NOW()
        ORDER BY p.published_at,p.hash LIMIT 20`, [context.owner]);
      return { version: 1, packages: rows.rows.map(view) };
    });
  }
  return { publishCryptoKeyPackage, readOwnCryptoKeyPackages };
}
module.exports = { createCryptoKeyPackageStore, packageProofBytes };
