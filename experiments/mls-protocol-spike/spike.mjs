import {
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeGroupState,
  decodeMlsMessage,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  generateKeyPackage,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  processPrivateMessage,
  zeroOutUint8Array,
} from 'ts-mls';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeExact(decode, bytes) {
  const result = decode(bytes, 0);
  if (!result || result[1] !== bytes.length) throw new Error('Invalid encoded MLS data');
  return result[0];
}

function clearConsumed(result) {
  result.consumed.forEach(zeroOutUint8Array);
}

function requirePrivateMessage(bytes) {
  const message = decodeExact(decodeMlsMessage, bytes);
  if (message.wireformat !== 'mls_private_message') throw new Error('Expected private message');
  return message.privateMessage;
}

export async function runProtocolSpike(roundTrip = async (bytes) => Uint8Array.from(bytes)) {
  const cipherSuite = await getCiphersuiteImpl(
    getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'),
  );
  const makeDevice = (name) => generateKeyPackage(
    { credentialType: 'basic', identity: encoder.encode(name) },
    defaultCapabilities(), defaultLifetime, [], cipherSuite,
  );
  const alice = await makeDevice('synthetic-alice-device');
  const bob = await makeDevice('synthetic-bob-device');
  let aliceState = await createGroup(
    encoder.encode('synthetic-conversation'), alice.publicPackage, alice.privatePackage, [], cipherSuite,
  );

  const publicBob = decodeExact(decodeMlsMessage, encodeMlsMessage({
    version: 'mls10', wireformat: 'mls_key_package', keyPackage: bob.publicPackage,
  }));
  if (publicBob.wireformat !== 'mls_key_package') throw new Error('Expected key package');
  const add = await createCommit({ state: aliceState, cipherSuite }, {
    extraProposals: [{ proposalType: 'add', add: { keyPackage: publicBob.keyPackage } }],
  });
  aliceState = add.newState;
  clearConsumed(add);
  if (!add.welcome) throw new Error('Add commit did not produce a welcome');
  const welcome = decodeExact(decodeMlsMessage, encodeMlsMessage({
    version: 'mls10', wireformat: 'mls_welcome', welcome: add.welcome,
  }));
  if (welcome.wireformat !== 'mls_welcome') throw new Error('Expected welcome');
  let bobState = await joinGroup(
    welcome.welcome, bob.publicPackage, bob.privatePackage, emptyPskIndex,
    cipherSuite, structuredClone(aliceState.ratchetTree),
  );

  const first = await createApplicationMessage(aliceState, encoder.encode('private one'), cipherSuite);
  aliceState = first.newState;
  const firstWire = encodeMlsMessage({
    version: 'mls10', wireformat: 'mls_private_message', privateMessage: first.privateMessage,
  });
  clearConsumed(first);
  const firstRead = await processPrivateMessage(
    bobState, requirePrivateMessage(firstWire), emptyPskIndex, cipherSuite,
  );
  if (firstRead.kind !== 'applicationMessage' || decoder.decode(firstRead.message) !== 'private one') {
    throw new Error('First encrypted delivery failed');
  }
  bobState = firstRead.newState;
  clearConsumed(firstRead);

  let replayRejected = false;
  try {
    await processPrivateMessage(bobState, requirePrivateMessage(firstWire), emptyPskIndex, cipherSuite);
  } catch {
    replayRejected = true;
  }

  const stored = encodeGroupState(bobState);
  const restored = await roundTrip(stored, 'synthetic-bob-device');
  const decodedState = decodeExact(decodeGroupState, restored);
  bobState = { ...decodedState, clientConfig: bobState.clientConfig };

  const second = await createApplicationMessage(aliceState, encoder.encode('private two'), cipherSuite);
  aliceState = second.newState;
  const secondWire = encodeMlsMessage({
    version: 'mls10', wireformat: 'mls_private_message', privateMessage: second.privateMessage,
  });
  clearConsumed(second);
  const secondRead = await processPrivateMessage(
    bobState, requirePrivateMessage(secondWire), emptyPskIndex, cipherSuite,
  );
  if (secondRead.kind !== 'applicationMessage' || decoder.decode(secondRead.message) !== 'private two') {
    throw new Error('Delivery after state restore failed');
  }
  bobState = secondRead.newState;
  clearConsumed(secondRead);

  const outOfOrderWire = [];
  for (const content of ['private three', 'private four']) {
    const sent = await createApplicationMessage(aliceState, encoder.encode(content), cipherSuite);
    aliceState = sent.newState;
    outOfOrderWire.push(encodeMlsMessage({
      version: 'mls10', wireformat: 'mls_private_message', privateMessage: sent.privateMessage,
    }));
    clearConsumed(sent);
  }
  for (const [index, expected] of [[1, 'private four'], [0, 'private three']]) {
    const received = await processPrivateMessage(
      bobState, requirePrivateMessage(outOfOrderWire[index]), emptyPskIndex, cipherSuite,
    );
    if (received.kind !== 'applicationMessage' || decoder.decode(received.message) !== expected) {
      throw new Error('Out-of-order delivery failed');
    }
    bobState = received.newState;
    clearConsumed(received);
  }

  const removal = await createCommit({ state: aliceState, cipherSuite }, {
    extraProposals: [{ proposalType: 'remove', remove: { removed: 1 } }],
  });
  aliceState = removal.newState;
  clearConsumed(removal);
  const afterRemoval = await createApplicationMessage(
    aliceState, encoder.encode('after removal'), cipherSuite,
  );
  const afterRemovalWire = encodeMlsMessage({
    version: 'mls10', wireformat: 'mls_private_message', privateMessage: afterRemoval.privateMessage,
  });
  clearConsumed(afterRemoval);
  let removedDeviceRejected = false;
  try {
    await processPrivateMessage(bobState, requirePrivateMessage(afterRemovalWire), emptyPskIndex, cipherSuite);
  } catch {
    removedDeviceRejected = true;
  }

  return {
    joined: true,
    encryptedDelivery: true,
    stateRestored: true,
    outOfOrderDelivered: true,
    replayRejected,
    removedDeviceRejected,
  };
}
