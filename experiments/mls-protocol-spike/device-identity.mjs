import { createGroup, decodeGroupState } from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const identifier = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function sameBytes(a, b) {
  return a instanceof Uint8Array && b instanceof Uint8Array
    && a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export function syntheticDeviceCredential(owner, device) {
  if (!identifier.test(owner) || !identifier.test(device)
    || typeof owner !== 'string' || typeof device !== 'string') {
    throw new Error('Invalid synthetic device identity');
  }
  return {
    credentialType: 'basic',
    identity: encoder.encode(JSON.stringify(['winga-mls-device-spike', 1, owner, device])),
  };
}

function parseCredential(credential) {
  if (credential?.credentialType !== 'basic'
    || !(credential.identity instanceof Uint8Array) || credential.identity.length > 256) {
    throw new Error('Invalid synthetic credential');
  }
  const tuple = JSON.parse(decoder.decode(credential.identity));
  if (!Array.isArray(tuple) || tuple.length !== 4
    || tuple[0] !== 'winga-mls-device-spike' || tuple[1] !== 1) {
    throw new Error('Unsupported synthetic credential');
  }
  const [, , owner, device] = tuple;
  if (!sameBytes(credential.identity, syntheticDeviceCredential(owner, device).identity)) {
    throw new Error('Non-canonical synthetic credential');
  }
  return { owner, device };
}

// Pins are independently supplied test fixtures, never trust learned from a key package.
export function pinnedDeviceConfig(records) {
  const pins = new Map();
  for (const { owner, device, signaturePublicKey, status } of records) {
    syntheticDeviceCredential(owner, device);
    const id = `${owner}/${device}`;
    if (pins.has(id) || !(signaturePublicKey instanceof Uint8Array)
      || signaturePublicKey.length !== 32 || !['active', 'revoked'].includes(status)) {
      throw new Error('Invalid or ambiguous synthetic device pin');
    }
    pins.set(id, { status, key: Uint8Array.from(signaturePublicKey) });
  }
  return {
    ...defaultClientConfig,
    authService: {
      async validateCredential(credential, signaturePublicKey) {
        try {
          const { owner, device } = parseCredential(credential);
          const pin = pins.get(`${owner}/${device}`);
          return pin?.status === 'active' && sameBytes(pin.key, signaturePublicKey);
        } catch {
          return false;
        }
      },
    },
  };
}

export async function createAuthenticatedGroup(groupId, device, cipherSuite, clientConfig) {
  const leaf = device.publicPackage.leafNode;
  // The pinned library does not authenticate its initial leaf in createGroup.
  if (!await clientConfig.authService.validateCredential(leaf.credential, leaf.signaturePublicKey)) {
    throw new Error('Synthetic initial device is not trusted');
  }
  return createGroup(groupId, device.publicPackage, device.privatePackage, [], cipherSuite, clientConfig);
}

export async function restoreAuthenticatedState(bytes, clientConfig) {
  const decoded = decodeGroupState(bytes, 0);
  if (!decoded || decoded[1] !== bytes.length) throw new Error('Invalid synthetic MLS state');
  for (const node of decoded[0].ratchetTree) {
    if (node?.nodeType === 'leaf'
      && !await clientConfig.authService.validateCredential(
        node.leaf.credential, node.leaf.signaturePublicKey,
      )) {
      throw new Error('Synthetic restored device is not trusted');
    }
  }
  return { ...decoded[0], clientConfig };
}
