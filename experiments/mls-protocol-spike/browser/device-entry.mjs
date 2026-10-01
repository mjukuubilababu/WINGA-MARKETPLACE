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
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { encodeRatchetTree, decodeRatchetTree } from 'ts-mls/ratchetTree.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const databaseName = 'winga-mls-two-context-spike-v1';
let localKeyPackage;
let cipherSuite;

function decodeExact(decode, values) {
  const bytes = Uint8Array.from(values);
  const result = decode(bytes, 0);
  if (!result || result[1] !== bytes.length) throw new Error('Invalid MLS data');
  return result[0];
}

async function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('group')) request.result.createObjectStore('group');
      if (!request.result.objectStoreNames.contains('outbox')) request.result.createObjectStore('outbox');
      if (!request.result.objectStoreNames.contains('inbox')) request.result.createObjectStore('inbox');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveOutgoing(state, bytes, abortBeforeCommit) {
  const db = await openStore();
  const id = crypto.randomUUID();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['group', 'outbox'], 'readwrite');
      tx.objectStore('group').put(encodeGroupState(state), 'state');
      tx.objectStore('outbox').put({ id, bytes, createdAt: Date.now() }, id);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('Synthetic transaction aborted'));
      if (abortBeforeCommit) tx.abort();
    });
    return id;
  } finally {
    db.close();
  }
}

async function readOutbox() {
  const db = await openStore();
  try {
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows.map(({ id, bytes }) => ({ id, bytes: Array.from(bytes) }));
  } finally {
    db.close();
  }
}

async function readInbox(id) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const store = db.transaction('inbox', 'readonly').objectStore('inbox');
      const request = id === undefined ? store.getAll() : store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function saveIncoming(state, record, abortBeforeCommit) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['group', 'inbox'], 'readwrite');
      tx.objectStore('group').put(encodeGroupState(state), 'state');
      tx.objectStore('inbox').put(record, record.id);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('Synthetic transaction aborted'));
      if (abortBeforeCommit) tx.abort();
    });
  } finally {
    db.close();
  }
}

async function deleteOutgoing(id) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').delete(id);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function saveState(state) {
  const db = await openStore();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('group', 'readwrite');
      tx.objectStore('group').put(encodeGroupState(state), 'state');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function loadState() {
  const db = await openStore();
  try {
    const bytes = await new Promise((resolve, reject) => {
      const request = db.transaction('group', 'readonly').objectStore('group').get('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return bytes ? { ...decodeExact(decodeGroupState, bytes), clientConfig: defaultClientConfig } : null;
  } finally {
    db.close();
  }
}

async function getCipherSuite() {
  cipherSuite ||= await getCiphersuiteImpl(
    getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'),
  );
  return cipherSuite;
}

function clearConsumed(result) {
  result.consumed.forEach(zeroOutUint8Array);
}

function withStateLock(work) {
  if (!navigator.locks?.request) throw new Error('Web Locks unavailable');
  return navigator.locks.request(`${databaseName}:group`, work);
}

function privateMessage(values) {
  const message = decodeExact(decodeMlsMessage, values);
  if (message.wireformat !== 'mls_private_message') throw new Error('Expected private message');
  return message.privateMessage;
}

async function ciphertextHash(values) {
  const bytes = Uint8Array.from(values);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

window.syntheticMlsDevice = {
  async initialize(label) {
    const suite = await getCipherSuite();
    localKeyPackage = await generateKeyPackage(
      { credentialType: 'basic', identity: textEncoder.encode(`synthetic-${label}`) },
      defaultCapabilities(), defaultLifetime, [], suite,
    );
    return Array.from(encodeMlsMessage({
      version: 'mls10', wireformat: 'mls_key_package', keyPackage: localKeyPackage.publicPackage,
    }));
  },

  async create() {
    return withStateLock(async () => {
      if (!localKeyPackage) throw new Error('Device not initialized');
      const state = await createGroup(
        textEncoder.encode('synthetic-two-context-group'),
        localKeyPackage.publicPackage, localKeyPackage.privatePackage, [], await getCipherSuite(),
      );
      await saveState(state);
    });
  },

  async addPeer(keyPackageBytes) {
    return withStateLock(async () => {
      const state = await loadState();
      const peer = decodeExact(decodeMlsMessage, keyPackageBytes);
      if (!state || peer.wireformat !== 'mls_key_package') throw new Error('Invalid add peer state');
      const result = await createCommit({ state, cipherSuite: await getCipherSuite() }, {
        extraProposals: [{ proposalType: 'add', add: { keyPackage: peer.keyPackage } }],
      });
      if (!result.welcome) throw new Error('Welcome missing');
      await saveState(result.newState);
      clearConsumed(result);
      return {
        welcome: Array.from(encodeMlsMessage({
          version: 'mls10', wireformat: 'mls_welcome', welcome: result.welcome,
        })),
        tree: Array.from(encodeRatchetTree(result.newState.ratchetTree)),
      };
    });
  },

  async join({ welcome, tree }) {
    return withStateLock(async () => {
      if (!localKeyPackage) throw new Error('Device not initialized');
      const message = decodeExact(decodeMlsMessage, welcome);
      if (message.wireformat !== 'mls_welcome') throw new Error('Expected welcome');
      const state = await joinGroup(
        message.welcome, localKeyPackage.publicPackage, localKeyPackage.privatePackage,
        emptyPskIndex, await getCipherSuite(), decodeExact(decodeRatchetTree, tree),
      );
      await saveState(state);
    });
  },

  async send(content, abortBeforeCommit = false) {
    return withStateLock(async () => {
      const state = await loadState();
      if (!state) throw new Error('Group state missing');
      const result = await createApplicationMessage(state, textEncoder.encode(content), await getCipherSuite());
      try {
        const bytes = encodeMlsMessage({
          version: 'mls10', wireformat: 'mls_private_message', privateMessage: result.privateMessage,
        });
        await saveOutgoing(result.newState, bytes, abortBeforeCommit);
        return Array.from(bytes);
      } finally {
        clearConsumed(result);
      }
    });
  },

  async receive(values) {
    return withStateLock(async () => {
      const state = await loadState();
      if (!state) throw new Error('Group state missing');
      const result = await processPrivateMessage(
        state, privateMessage(values), emptyPskIndex, await getCipherSuite(),
      );
      if (result.kind !== 'applicationMessage') throw new Error('Expected application message');
      await saveState(result.newState);
      const content = textDecoder.decode(result.message);
      clearConsumed(result);
      return content;
    });
  },

  async receiveEvent(id, values, abortBeforeCommit = false) {
    if (typeof id !== 'string' || !id || id.length > 120) throw new Error('Invalid synthetic event ID');
    return withStateLock(async () => {
      const hash = await ciphertextHash(values);
      const existing = await readInbox(id);
      if (existing) {
        if (existing.hash !== hash) throw new Error('Synthetic event ciphertext conflict');
        return { kind: 'duplicate', content: existing.content };
      }
      const state = await loadState();
      if (!state) throw new Error('Group state missing');
      const result = await processPrivateMessage(
        state, privateMessage(values), emptyPskIndex, await getCipherSuite(),
      );
      try {
        if (result.kind !== 'applicationMessage') throw new Error('Expected application message');
        const content = textDecoder.decode(result.message);
        await saveIncoming(result.newState, { id, hash, content, createdAt: Date.now() }, abortBeforeCommit);
        return { kind: 'new', content };
      } finally {
        clearConsumed(result);
      }
    });
  },

  async hasState() {
    return Boolean(await loadState());
  },

  async pending() {
    return readOutbox();
  },

  async inbox() {
    return readInbox();
  },

  async deliverPending(endpoint, abortAfterAck = false) {
    return withStateLock(async () => {
      const pending = await readOutbox();
      for (const item of pending) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (!response.ok) throw new Error(`Synthetic delivery failed: ${response.status}`);
        const ack = await response.json();
        if (ack.id !== item.id) throw new Error('Synthetic ACK mismatch');
        if (abortAfterAck) throw new Error('Synthetic crash after ACK');
        await deleteOutgoing(item.id);
      }
      return pending.length;
    });
  },
};
