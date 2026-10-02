import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPackageLifetime, maximumKeyPackageLifetime, validateKeyPackageLifetime } from '../key-package-policy.mjs';

const now = 1791000000000;
const packageWith = lifetime => ({ leafNode: { leafNodeSource: 'key_package', lifetime } });
test('generated package lifetime is current and bounded', () => {
  const lifetime = keyPackageLifetime(now);
  assert.equal(lifetime.notAfter - lifetime.notBefore, maximumKeyPackageLifetime);
  assert.equal(validateKeyPackageLifetime(packageWith(lifetime), now), true);
});
test('expired and not-yet-valid admission packages are rejected', () => {
  const seconds = BigInt(now / 1000);
  for (const lifetime of [{ notBefore: seconds - 5n, notAfter: seconds - 1n },
    { notBefore: seconds + 1n, notAfter: seconds + 5n }]) {
    assert.throws(() => validateKeyPackageLifetime(packageWith(lifetime), now), /key_package_expired/);
  }
});
test('maximum lifetime and malformed intervals are enforced independently of signatures', () => {
  for (const lifetime of [{ notBefore: 0n, notAfter: 9223372036854775807n },
    { notBefore: 2n, notAfter: 1n }, { notBefore: 1, notAfter: 2n }, { notBefore: -1n, notAfter: 5n }]) {
    assert.throws(() => validateKeyPackageLifetime(packageWith(lifetime), now), /key_package_lifetime_rejected/);
  }
});
test('historical member package expiry does not invalidate trusted restored state', async () => {
  const mls = await import('ts-mls');
  const identity = await import('../device-identity.mjs');
  const suite = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const kp = await mls.generateKeyPackage(identity.syntheticDeviceCredential('alice', 'historical-device'), mls.defaultCapabilities(), keyPackageLifetime(), [], suite);
  const config = identity.pinnedDeviceConfig([{ owner: 'alice', device: 'historical-device', status: 'active', signaturePublicKey: kp.publicPackage.leafNode.signaturePublicKey }]);
  const state = await identity.createAuthenticatedGroup(new TextEncoder().encode('historical-group'), kp, suite, config);
  const clock = Date.now;
  try {
    Date.now = () => Number(kp.publicPackage.leafNode.lifetime.notAfter + 1n) * 1000;
    assert.throws(() => validateKeyPackageLifetime(kp.publicPackage), /key_package_expired/);
    const restored = await identity.restoreAuthenticatedState(mls.encodeGroupState(state), config);
    assert.equal(restored.groupContext.epoch, state.groupContext.epoch);
  } finally { Date.now = clock; }
});
