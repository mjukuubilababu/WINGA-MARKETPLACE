import {
  createApplicationMessage, createCommit, defaultCapabilities,
  emptyPskIndex, encodeGroupState, generateKeyPackage, getCiphersuiteFromName,
  getCiphersuiteImpl, joinGroup, processPrivateMessage, zeroOutUint8Array,
} from 'ts-mls';
import {
  createAuthenticatedGroup, pinnedDeviceConfig, restoreAuthenticatedState,
  syntheticDeviceCredential,
} from './device-identity.mjs';
import { keyPackageLifetime } from './key-package-policy.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function rejected(operation) {
  try { await operation(); } catch { return true; }
  return false;
}

export async function runIdentitySpike() {
  const cipherSuite = await getCiphersuiteImpl(
    getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'),
  );
  const makeDevice = (owner, device) => generateKeyPackage(
    syntheticDeviceCredential(owner, device), defaultCapabilities(), keyPackageLifetime(), [], cipherSuite,
  );
  const alice = await makeDevice('alice', 'desktop');
  const bob = await makeDevice('bob', 'phone');
  const impostor = await makeDevice('bob', 'phone');
  const unknown = await makeDevice('mallory', 'phone');
  const pins = [
    { owner: 'alice', device: 'desktop', status: 'active',
      signaturePublicKey: alice.publicPackage.leafNode.signaturePublicKey },
    { owner: 'bob', device: 'phone', status: 'active',
      signaturePublicKey: bob.publicPackage.leafNode.signaturePublicKey },
  ];
  const config = pinnedDeviceConfig(pins);
  const revokedConfig = pinnedDeviceConfig(pins.map(pin => (
    pin.owner === 'bob' ? { ...pin, status: 'revoked' } : pin
  )));
  const groupId = encoder.encode('synthetic-pinned-devices');
  let aliceState = await createAuthenticatedGroup(groupId, alice, cipherSuite, config);
  const addTo = (state, device) => createCommit({ state, cipherSuite }, {
    extraProposals: [{ proposalType: 'add', add: { keyPackage: device.publicPackage } }],
  });
  const initialImpostorRejected = await rejected(
    () => createAuthenticatedGroup(groupId, impostor, cipherSuite, config),
  );
  const substitutedKeyRejected = await rejected(() => addTo(aliceState, impostor));
  const unknownDeviceRejected = await rejected(() => addTo(aliceState, unknown));
  const revokedInitial = await createAuthenticatedGroup(groupId, alice, cipherSuite, revokedConfig);
  const revokedAddRejected = await rejected(() => addTo(revokedInitial, bob));
  const add = await addTo(aliceState, bob);
  aliceState = add.newState;
  add.consumed.forEach(zeroOutUint8Array);
  if (!add.welcome) throw new Error('Missing synthetic welcome');
  const join = (clientConfig) => joinGroup(
    add.welcome, bob.publicPackage, bob.privatePackage, emptyPskIndex, cipherSuite,
    structuredClone(aliceState.ratchetTree), undefined, clientConfig,
  );
  const untrustedSignerConfig = pinnedDeviceConfig(pins.filter(pin => pin.owner !== 'alice'));
  const untrustedWelcomeRejected = await rejected(() => join(untrustedSignerConfig));
  const revokedWelcomeRejected = await rejected(() => join(revokedConfig));
  let bobState = await join(config);
  const send = await createApplicationMessage(aliceState, encoder.encode('pinned device hello'), cipherSuite);
  const read = await processPrivateMessage(bobState, send.privateMessage, emptyPskIndex, cipherSuite);
  if (read.kind !== 'applicationMessage' || decoder.decode(read.message) !== 'pinned device hello') {
    throw new Error('Synthetic authenticated delivery failed');
  }
  bobState = read.newState;
  send.consumed.forEach(zeroOutUint8Array);
  read.consumed.forEach(zeroOutUint8Array);
  const stored = encodeGroupState(bobState);
  bobState = await restoreAuthenticatedState(stored, config);
  const restoredSubstitutionRejected = await rejected(() => addTo(bobState, impostor));
  const revokedRestoreRejected = await rejected(() => restoreAuthenticatedState(stored, revokedConfig));
  return {
    trustedDelivery: true, initialImpostorRejected, substitutedKeyRejected, unknownDeviceRejected,
    revokedAddRejected, untrustedWelcomeRejected, revokedWelcomeRejected,
    authenticationSurvivesRestore: bobState.clientConfig === config,
    restoredSubstitutionRejected, revokedRestoreRejected,
  };
}
