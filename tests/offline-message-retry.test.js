const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function fixture() {
  const context = vm.createContext({ window: {}, crypto: { randomUUID }, URLSearchParams });
  for (const name of ['offline-queue', 'communications-client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/api', `${name}.js`), 'utf8'), context);
  }
  const storage = new Map();
  const events = [];
  let session = { username: 'alice' };
  let writable = true;
  const queue = context.window.WingaModules.api.offlineQueue.createOfflineQueueTools({
    readSession: () => session,
    safeStorageGet: key => storage.get(key),
    safeStorageSet: (key, value) => { if (!writable) return false; storage.set(key, value); return true; },
    safeStorageRemove: key => storage.delete(key),
    getNavigator: () => ({ onLine: true }),
    dispatchEvent: (name, detail) => events.push({ name, detail })
  });
  return { queue, storage, events, api: context.window.WingaModules.api,
    switchUser: username => { session = { username }; },
    denyStorage: () => { writable = false; } };
}
const payload = { receiverId: 'bob', message: 'Hello' };

test('permanent send failure retains message and reports failure', async () => {
  const f = fixture();
  f.queue.queueOfflineMessageAction(payload);
  assert.equal(await f.queue.flushOfflineActionQueue({ sendMessage: async () => { throw Object.assign(new Error('Denied'), { status: 403 }); } }), 0);
  assert.equal(f.queue.readOfflineActionQueue()[0].status, 'FAILED');
  assert.equal(f.events.at(-1).detail.failed, 1);
});

test('lost acknowledgement retries the same persisted client ID', async () => {
  const f = fixture();
  const accepted = new Set();
  let attempts = 0;
  const adapter = {
    prepareMessage: async p => p.clientMessageId ? p : { ...p, clientMessageId: randomUUID() },
    sendMessage: async p => {
      assert.equal(f.queue.readOfflineActionQueue()[0].payload.clientMessageId, p.clientMessageId);
      accepted.add(p.clientMessageId);
      if (++attempts === 1) throw new TypeError('Failed to fetch');
      return { id: 'canonical-message' };
    }
  };
  f.queue.queueOfflineMessageAction(payload);
  assert.equal(await f.queue.flushOfflineActionQueue(adapter), 0);
  assert.equal(await f.queue.flushOfflineActionQueue(adapter), 1);
  assert.equal(accepted.size, 1);
  assert.equal(f.queue.readOfflineActionQueue().length, 0);
});

test('concurrent flush coalesces and preserves newly queued arrivals', async () => {
  const f = fixture();
  let release;
  let calls = 0;
  const adapter = { sendMessage: () => { calls++; return new Promise(resolve => { release = resolve; }); } };
  f.queue.queueOfflineMessageAction(payload);
  const first = f.queue.flushOfflineActionQueue(adapter);
  const second = f.queue.flushOfflineActionQueue(adapter);
  f.queue.queueOfflineMessageAction({ ...payload, message: 'New arrival' });
  release({ id: 'accepted' });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue()[0].payload.message, 'New arrival');
});

test('account switch stops flush without moving messages between accounts', async () => {
  const f = fixture();
  f.queue.queueOfflineMessageAction(payload);
  f.queue.queueOfflineMessageAction({ ...payload, message: 'Second' });
  let calls = 0;
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => { calls++; f.switchUser('carol'); return { id: 'accepted' }; } });
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue().length, 0);
  assert.equal(f.queue.readOfflineActionQueue({ username: 'alice' }).length, 1);
  assert.equal(f.events.at(-1).detail.username, 'alice');
});

test('storage failures never claim a queued message or overwrite corruption', () => {
  const f = fixture();
  f.denyStorage();
  assert.throws(() => f.queue.queueOfflineMessageAction(payload), /could not be saved/);
  const key = f.queue.getOfflineActionQueueStorageKey();
  f.storage.set(key, 'broken-json');
  assert.throws(() => f.queue.queueOfflineMessageAction(payload), /could not be read/);
  assert.equal(f.storage.get(key), 'broken-json');
});

test('unconfirmed acknowledgement does not remove queue entry', async () => {
  const f = fixture();
  f.queue.queueOfflineMessageAction(payload);
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => ({ isQueued: true, id: 'local' }) });
  assert.equal(f.queue.readOfflineActionQueue().length, 1);
});

test('capability contract prepares unique IDs and preserves retries', async () => {
  const f = fixture();
  let requests = 0;
  const client = f.api.communications.createCommunicationsApiClient({ fetchJson: async () => { requests++; return { durableMessageRetries: true }; } });
  const prepared = await client.prepareMessage(payload);
  assert.match(prepared.clientMessageId, /^[a-z0-9-]{36}$/);
  assert.equal(await client.prepareMessage(prepared), prepared);
  assert.notEqual((await client.prepareMessage(payload)).clientMessageId, prepared.clientMessageId);
  assert.equal(requests, 1);
});

test('legacy capability preserves sending while server failure does not downgrade', async () => {
  const f = fixture();
  for (const status of [404, 503]) {
    const client = f.api.communications.createCommunicationsApiClient({ fetchJson: async () => { throw Object.assign(new Error('Unavailable'), { status }); } });
    if (status === 404) assert.equal(await client.prepareMessage(payload), payload);
    else await assert.rejects(client.prepareMessage(payload), /Unavailable/);
  }
});
