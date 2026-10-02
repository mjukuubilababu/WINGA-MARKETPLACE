import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinnedDeviceConfig, syntheticDeviceCredential } from '../device-identity.mjs';
import { runIdentitySpike } from '../identity-spike.mjs';

const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const pin = () => ({ owner: 'alice', device: 'phone', status: 'active', signaturePublicKey: key.slice() });

test('synthetic identity matches account, device and independently pinned signing key', async () => {
  const config = pinnedDeviceConfig([pin()]);
  const validate = config.authService.validateCredential;
  assert.equal(await validate(syntheticDeviceCredential('alice', 'phone'), key), true);
  assert.equal(await validate(syntheticDeviceCredential('bob', 'phone'), key), false);
  assert.equal(await validate(syntheticDeviceCredential('alice', 'desktop'), key), false);
  assert.equal(await validate(syntheticDeviceCredential('alice', 'phone'), new Uint8Array(32)), false);
  assert.equal(await validate(syntheticDeviceCredential('alice', 'phone'), key.subarray(1)), false);
  assert.equal(await validate(syntheticDeviceCredential('alice', 'phone'), undefined), false);
});

test('pin snapshots cannot be changed by mutating the fixture', async () => {
  const record = pin();
  const config = pinnedDeviceConfig([record]);
  record.signaturePublicKey.fill(255);
  record.owner = 'bob';
  record.status = 'revoked';
  assert.equal(await config.authService.validateCredential(syntheticDeviceCredential('alice', 'phone'), key), true);
});

test('revocation, conflicting pins and unsupported pin policy fail closed', async () => {
  const config = pinnedDeviceConfig([{ ...pin(), status: 'revoked' }]);
  assert.equal(await config.authService.validateCredential(syntheticDeviceCredential('alice', 'phone'), key), false);
  assert.throws(() => pinnedDeviceConfig([pin(), pin()]), /ambiguous/);
  assert.throws(() => pinnedDeviceConfig([{ ...pin(), status: 'pending' }]), /ambiguous/);
  assert.throws(() => pinnedDeviceConfig([{ ...pin(), signaturePublicKey: key.subarray(1) }]), /ambiguous/);
});

for (const [name, bytes] of [
  ['unknown version', new TextEncoder().encode('["winga-mls-device-spike",2,"alice","phone"]')],
  ['unknown domain', new TextEncoder().encode('["other",1,"alice","phone"]')],
  ['extra field', new TextEncoder().encode('["winga-mls-device-spike",1,"alice","phone",true]')],
  ['non-canonical whitespace', new TextEncoder().encode('["winga-mls-device-spike", 1,"alice","phone"]')],
  ['invalid identifier', new TextEncoder().encode('["winga-mls-device-spike",1,"alice/other","phone"]')],
  ['wrong identifier type', new TextEncoder().encode('["winga-mls-device-spike",1,null,"phone"]')],
  ['invalid UTF-8', new Uint8Array([255])],
  ['oversized credential', new Uint8Array(257)],
  ['empty credential', new Uint8Array()],
]) {
  test(`credential rejects ${name}`, async () => {
    assert.equal(await pinnedDeviceConfig([pin()]).authService.validateCredential(
      { credentialType: 'basic', identity: bytes }, key,
    ), false);
  });
}

test('unsupported and missing credentials fail closed', async () => {
  const validate = pinnedDeviceConfig([pin()]).authService.validateCredential;
  assert.equal(await validate(undefined, key), false);
  assert.equal(await validate({ credentialType: 'x509', identity: new Uint8Array() }, key), false);
});

test('real MLS create, add, welcome and restored state enforce pinned identity', async () => {
  const result = await runIdentitySpike();
  assert.equal(Object.keys(result).length, 10);
  for (const [gate, passed] of Object.entries(result)) assert.equal(passed, true, gate);
});
