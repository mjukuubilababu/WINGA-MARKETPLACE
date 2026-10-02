import { decodeMlsMessage, getCiphersuiteFromName, getCiphersuiteImpl } from 'ts-mls';
import { verifyKeyPackage } from 'ts-mls/keyPackage.js';
import { verifyLeafNodeSignatureKeyPackage } from 'ts-mls/leafNode.js';
const suite = getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
export async function verifyBoundKeyPackage(raw, identity, now = Date.now()) {
  const parsed = decodeMlsMessage(raw, 0);
  if (!parsed || parsed[1] !== raw.length || parsed[0].wireformat !== 'mls_key_package') throw new Error('mls_package_invalid');
  const kp = parsed[0].keyPackage, impl = await suite, leaf = kp.leafNode;
  const expected = JSON.stringify(['winga-mls-device', 1, identity.owner, identity.id, identity.fingerprint]);
  if (kp.version !== 'mls10' || kp.cipherSuite !== impl.name || leaf.credential.credentialType !== 'basic'
    || Buffer.from(leaf.credential.identity).toString('utf8') !== expected
    || leaf.leafNodeSource !== 'key_package' || typeof leaf.lifetime.notBefore !== 'bigint'
    || typeof leaf.lifetime.notAfter !== 'bigint' || leaf.lifetime.notBefore < 0n
    || leaf.lifetime.notAfter <= leaf.lifetime.notBefore
    || leaf.lifetime.notAfter - leaf.lifetime.notBefore > 2628000n
    || BigInt(Math.floor(now / 1000)) < leaf.lifetime.notBefore
    || BigInt(Math.floor(now / 1000)) > leaf.lifetime.notAfter
    || !await verifyLeafNodeSignatureKeyPackage(leaf, impl.signature)
    || !await verifyKeyPackage(kp, impl.signature)) throw new Error('mls_package_invalid');
  return { mlsPublicKey: Buffer.from(leaf.signaturePublicKey).toString('base64url'),
    expiresAt: new Date(Number(leaf.lifetime.notAfter) * 1000).toISOString() };
}
