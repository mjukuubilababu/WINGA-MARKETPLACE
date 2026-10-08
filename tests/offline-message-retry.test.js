const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function fixture(storage = new Map(), navigator = { onLine: true }) {
  const context = vm.createContext({ window: {}, crypto: { randomUUID }, URLSearchParams });
  for (const name of ['offline-queue', 'communications-client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/api', `${name}.js`), 'utf8'), context);
  }
  const events = [];
  let session = { username: 'alice' };
  let writable = true;
  const queue = context.window.WingaModules.api.offlineQueue.createOfflineQueueTools({
    readSession: () => session,
    safeStorageGet: key => storage.get(key),
    safeStorageSet: (key, value) => { if (!writable) return false; storage.set(key, value); return true; },
    safeStorageRemove: key => storage.delete(key),
    getNavigator: () => navigator,
    dispatchEvent: (name, detail) => events.push({ name, detail })
  });
  return { queue, storage, events, api: context.window.WingaModules.api,
    switchUser: username => { session = { username }; },
    denyStorage: () => { writable = false; } };
}
const payload = { receiverId: 'bob', message: 'Hello' };

async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Expected asynchronous queue operation did not start');
}

function sharedLocks() {
  const tails = new Map();
  return { request(name, run) {
    const previous = tails.get(name) || Promise.resolve();
    const result = previous.then(run);
    tails.set(name, result.catch(() => {}));
    return result;
  } };
}

test('explicit retry waits for unrelated background work without losing the selected send', async () => {
  const f = fixture();
  const selected = await f.queue.queueOfflineMessageAction({ ...payload, clientMessageId: randomUUID() });
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => {
    throw Object.assign(new Error('Denied'), { status: 403 });
  } });
  await f.queue.queueOfflineMessageAction({ ...payload, message: 'Background', clientMessageId: randomUUID() });
  let release;
  const seen = [];
  const adapter = { sendMessage: p => {
    seen.push(p.message);
    return p.message === 'Background' ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ id: 'selected' });
  } };
  const background = f.queue.flushOfflineActionQueue(adapter);
  const retry = f.queue.flushOfflineActionQueue(adapter, selected.id);
  const duplicateTap = f.queue.flushOfflineActionQueue(adapter, selected.id);
  await waitFor(() => release);
  assert.deepEqual(seen, ['Background']);
  release({ id: 'background' });
  await Promise.all([background, retry, duplicateTap]);
  assert.deepEqual(seen, ['Background', 'Hello']);
  assert.equal(f.queue.readOfflineActionQueue().length, 0);
});

test('waiting retry cannot send after account switch', async () => {
  const f = fixture();
  const selected = await f.queue.queueOfflineMessageAction(payload);
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => {
    throw Object.assign(new Error('Denied'), { status: 403 });
  } });
  await f.queue.queueOfflineMessageAction({ ...payload, message: 'Background' });
  let release, calls = 0;
  const adapter = { sendMessage: () => { calls++; return new Promise(resolve => { release = resolve; }); } };
  const background = f.queue.flushOfflineActionQueue(adapter);
  const retry = f.queue.flushOfflineActionQueue(adapter, selected.id);
  await waitFor(() => release);
  f.switchUser('carol');
  release({ id: 'background' });
  await Promise.all([background, retry]);
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue({ username: 'alice' })[0].id, selected.id);
});

test('retry joining a background attempt does not immediately repeat a rejected send', async () => {
  const f = fixture();
  const selected = await f.queue.queueOfflineMessageAction(payload);
  let reject, calls = 0;
  const adapter = { sendMessage: () => { calls++; return new Promise((resolve, fail) => { reject = fail; }); } };
  const background = f.queue.flushOfflineActionQueue(adapter);
  const retry = f.queue.flushOfflineActionQueue(adapter, selected.id);
  await waitFor(() => reject);
  reject(Object.assign(new Error('Denied'), { status: 403 }));
  await Promise.all([background, retry]);
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue()[0].status, 'FAILED');
});

test('failed messages require explicit scoped retry and retain their logical ID', async () => {
  const f = fixture();
  const clientMessageId = randomUUID();
  const queued = await f.queue.queueOfflineMessageAction({ ...payload, clientMessageId });
  let calls = 0;
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => {
    calls++; throw Object.assign(new Error('Denied'), { status: 403 });
  } });
  const adapter = { sendMessage: async p => {
    calls++; assert.equal(p.clientMessageId, clientMessageId); return { id: 'accepted' };
  } };
  assert.equal(await f.queue.flushOfflineActionQueue(adapter), 0);
  assert.equal(calls, 1);
  assert.equal(f.queue.getPendingMessages('bob')[0].status, 'FAILED');
  assert.equal(f.queue.getPendingMessages('carol').length, 0);
  f.switchUser('carol');
  assert.equal(f.queue.getPendingMessages('bob').length, 0);
  assert.equal(await f.queue.flushOfflineActionQueue(adapter, queued.id), 0);
  f.switchUser('alice');
  await f.queue.queueOfflineMessageAction({ ...payload, message: 'Leave this queued' });
  assert.equal(await f.queue.flushOfflineActionQueue(adapter, queued.id), 1);
  assert.equal(calls, 2);
  assert.equal(f.queue.readOfflineActionQueue().length, 1);
  assert.equal(await f.queue.flushOfflineActionQueue(adapter, queued.id), 0);
});

test('concurrent explicit retries coalesce to a single attempt', async () => {
  const f = fixture();
  const queued = await f.queue.queueOfflineMessageAction({ ...payload, clientMessageId: randomUUID() });
  let release, calls = 0;
  const adapter = { sendMessage: () => { calls++; return new Promise(resolve => { release = resolve; }); } };
  const first = f.queue.flushOfflineActionQueue(adapter, queued.id);
  const second = f.queue.flushOfflineActionQueue(adapter, queued.id);
  await waitFor(() => release);
  release({ id: 'accepted' });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue().length, 0);
});

test('permanent send failure retains message and reports failure', async () => {
  const f = fixture();
  await f.queue.queueOfflineMessageAction(payload);
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
  await f.queue.queueOfflineMessageAction(payload);
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
  await f.queue.queueOfflineMessageAction(payload);
  const first = f.queue.flushOfflineActionQueue(adapter);
  const second = f.queue.flushOfflineActionQueue(adapter);
  await f.queue.queueOfflineMessageAction({ ...payload, message: 'New arrival' });
  await waitFor(() => release);
  release({ id: 'accepted' });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue()[0].payload.message, 'New arrival');
});

test('account switch stops flush without moving messages between accounts', async () => {
  const f = fixture();
  await f.queue.queueOfflineMessageAction(payload);
  await f.queue.queueOfflineMessageAction({ ...payload, message: 'Second' });
  let calls = 0;
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => { calls++; f.switchUser('carol'); return { id: 'accepted' }; } });
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue().length, 0);
  assert.equal(f.queue.readOfflineActionQueue({ username: 'alice' }).length, 1);
  assert.equal(f.events.at(-1).detail.username, 'alice');
});

test('storage failures never claim a queued message or overwrite corruption', async () => {
  const f = fixture();
  f.denyStorage();
  await assert.rejects(f.queue.queueOfflineMessageAction(payload), /could not be saved/);
  const key = f.queue.getOfflineActionQueueStorageKey();
  f.storage.set(key, 'broken-json');
  await assert.rejects(f.queue.queueOfflineMessageAction(payload), /could not be read/);
  assert.equal(f.storage.get(key), 'broken-json');
});

test('unconfirmed acknowledgement does not remove queue entry', async () => {
  const f = fixture();
  await f.queue.queueOfflineMessageAction(payload);
  await f.queue.flushOfflineActionQueue({ sendMessage: async () => ({ isQueued: true, id: 'local' }) });
  assert.equal(f.queue.readOfflineActionQueue().length, 1);
});

test('capability contract prepares unique IDs and preserves retries', async () => {
  const f = fixture();
  let requests = 0;
  const client = f.api.communications.createCommunicationsApiClient({getSession:()=>({username:'sender',sessionId:'fixture'}),fetchJson:async url=>{
    if(url.includes('/encrypted/mode?'))return {version:1,mode:'legacy-plaintext'};
    requests++;return {durableMessageRetries:true};
  }});
  const prepared = await client.prepareMessage(payload);
  assert.match(prepared.clientMessageId, /^[a-z0-9-]{36}$/);
  assert.equal(await client.prepareMessage(prepared), prepared);
  assert.notEqual((await client.prepareMessage(payload)).clientMessageId, prepared.clientMessageId);
  assert.equal(requests, 1);
});

test('legacy capability preserves sending while server failure does not downgrade', async () => {
  const f = fixture();
  for (const status of [404, 503]) {
    const client = f.api.communications.createCommunicationsApiClient({getSession:()=>({username:'sender',sessionId:'fixture'}),fetchJson:async url=>{
      if(url.includes('/encrypted/mode?'))return {version:1,mode:'legacy-plaintext'};
      throw Object.assign(new Error('Unavailable'),{status});
    }});
    if (status === 404) assert.equal(await client.prepareMessage(payload), payload);
    else await assert.rejects(client.prepareMessage(payload), /Unavailable/);
  }
});

test('online send persists before POST and background flush does not resend it', async () => {
  const f = fixture();
  const prepared = { ...payload, clientMessageId: randomUUID() };
  let release;
  let calls = 0;
  const adapter = { sendMessage: p => {
    calls++;
    assert.equal(f.queue.readOfflineActionQueue()[0].payload.clientMessageId, p.clientMessageId);
    return new Promise(resolve => { release = resolve; });
  } };
  const sending = f.queue.sendPersistedMessage(prepared, adapter);
  await waitFor(() => release);
  assert.equal(await f.queue.flushOfflineActionQueue(adapter), 0);
  release({ id: 'accepted-online' });
  assert.equal((await sending).id, 'accepted-online');
  assert.equal(calls, 1);
  assert.equal(f.queue.readOfflineActionQueue().length, 0);
});

test('reload after an online lost response replays the original logical ID', async () => {
  const first = fixture();
  const prepared = { ...payload, clientMessageId: randomUUID() };
  const accepted = new Set();
  const pending = first.queue.sendPersistedMessage(prepared, { sendMessage: async p => {
    accepted.add(p.clientMessageId);
    return new Promise(() => {}); // Simulate a closed tab before acknowledgement.
  } });
  assert.ok(pending);
  await waitFor(() => accepted.size === 1);
  const reloaded = fixture(first.storage);
  assert.equal(await reloaded.queue.flushOfflineActionQueue({ sendMessage: async p => {
    accepted.add(p.clientMessageId);
    return { id: 'same-canonical-message' };
  } }), 1);
  assert.equal(accepted.size, 1);
  assert.equal(reloaded.queue.readOfflineActionQueue().length, 0);
});

test('online network failure retains one queued entry, permanent failure retains FAILED', async () => {
  for (const status of [503, 403]) {
    const f = fixture();
    const sending = f.queue.sendPersistedMessage({ ...payload, clientMessageId: randomUUID() }, {
      sendMessage: async () => { throw Object.assign(new Error('Rejected'), { status }); }
    });
    if (status === 503) assert.equal((await sending).isQueued, true);
    else await assert.rejects(sending, /Rejected/);
    assert.equal(f.queue.readOfflineActionQueue().length, 1);
    assert.equal(f.queue.readOfflineActionQueue()[0].status, status === 503 ? 'QUEUED' : 'FAILED');
  }
});

test('online storage failure stops POST and preserves existing queue', async () => {
  const f = fixture();
  await f.queue.queueOfflineMessageAction(payload);
  f.denyStorage();
  let calls = 0;
  await assert.rejects(f.queue.sendPersistedMessage({ ...payload, clientMessageId: randomUUID() }, {
    sendMessage: async () => { calls++; return { id: 'unexpected' }; }
  }), /could not be saved/);
  assert.equal(calls, 0);
  assert.equal(f.queue.readOfflineActionQueue().length, 1);
});

test('account switch while waiting for send lock leaves original owner queue unsent', async () => {
  const storage = new Map();
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/api/offline-queue.js'), 'utf8'), context);
  let session = { username: 'alice' };
  let resume;
  const q = context.window.WingaModules.api.offlineQueue.createOfflineQueueTools({
    readSession: () => session,
    safeStorageGet: k => storage.get(k),
    safeStorageSet: (k, v) => { storage.set(k, v); return true; },
    getNavigator: () => ({ onLine: true, locks: { request: (key, run) => {
      if (key.startsWith('winga-offline-queue:')) return Promise.resolve(run());
      assert.equal(key, 'winga-offline-send:alice');
      return new Promise(resolve => { resume = () => resolve(run()); });
    } } })
  });
  let calls = 0;
  const sending = q.sendPersistedMessage({ ...payload, clientMessageId: randomUUID() }, {
    sendMessage: async () => { calls++; return { id: 'unexpected' }; }
  });
  await waitFor(() => resume);
  session = { username: 'carol' };
  resume();
  assert.equal((await sending).isQueued, true);
  assert.equal(calls, 0);
  assert.equal(q.readOfflineActionQueue({ username: 'alice' }).length, 1);
  assert.equal(q.readOfflineActionQueue().length, 0);
});

test('unknown online ACK is queued, and accepted ACK survives cleanup failure', async () => {
  const f = fixture();
  const prepared = { ...payload, clientMessageId: randomUUID() };
  assert.equal((await f.queue.sendPersistedMessage(prepared, { sendMessage: async () => null })).isQueued, true);
  const result = await f.queue.sendPersistedMessage({ ...prepared, clientMessageId: randomUUID() }, {
    sendMessage: async () => { f.denyStorage(); return { id: 'accepted' }; }
  });
  assert.equal(result.id, 'accepted');
  assert.equal(f.queue.readOfflineActionQueue().length, 2);
});

test('two tabs serialize enqueue against the shared owner queue lock', async () => {
  const storage = new Map();
  const locks = sharedLocks();
  const first = fixture(storage, { onLine: true, locks });
  const second = fixture(storage, { onLine: true, locks });
  let release;
  const held = locks.request('winga-offline-queue:winga-offline-action-queue:alice',
    () => new Promise(resolve => { release = resolve; }));
  await waitFor(() => release);
  const a = first.queue.queueOfflineMessageAction({ ...payload, clientMessageId: randomUUID() });
  const b = second.queue.queueOfflineMessageAction({ ...payload, message: 'Other tab', clientMessageId: randomUUID() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.size, 0, 'enqueue must not bypass the shared storage lock');
  release();
  await held;
  const results = await Promise.all([a, b]);
  const entries = first.queue.readOfflineActionQueue();
  assert.equal(entries.length, 2);
  assert.deepEqual(Array.from(entries, item => item.id), results.map(item => item.id));
  assert.equal(new Set(entries.map(item => item.payload.clientMessageId)).size, 2);
});

test('another tab can persist during network I/O and survives accepted-send cleanup', async () => {
  const storage = new Map();
  const locks = sharedLocks();
  const first = fixture(storage, { onLine: true, locks });
  const second = fixture(storage, { onLine: true, locks });
  let release;
  const send = first.queue.sendPersistedMessage({ ...payload, clientMessageId: randomUUID() }, {
    sendMessage: () => new Promise(resolve => { release = resolve; })
  });
  await waitFor(() => release);
  const arrival = await second.queue.queueOfflineMessageAction({ ...payload, message: 'Other tab', clientMessageId: randomUUID() });
  assert.equal(second.queue.readOfflineActionQueue().length, 2);
  release({ id: 'accepted' });
  assert.equal((await send).id, 'accepted');
  assert.equal(second.queue.readOfflineActionQueue().length, 1);
  assert.equal(second.queue.readOfflineActionQueue()[0].id, arrival.id);
});

test('cross-tab background flush sends each retained entry once', async () => {
  const storage = new Map();
  const locks = sharedLocks();
  const first = fixture(storage, { onLine: true, locks });
  const second = fixture(storage, { onLine: true, locks });
  await first.queue.queueOfflineMessageAction({ ...payload, clientMessageId: randomUUID() });
  await second.queue.queueOfflineMessageAction({ ...payload, clientMessageId: randomUUID() });
  const sent = [];
  const adapter = { sendMessage: async p => { sent.push(p.clientMessageId); return { id: p.clientMessageId }; } };
  const counts = await Promise.all([
    first.queue.flushOfflineActionQueue(adapter), second.queue.flushOfflineActionQueue(adapter)
  ]);
  assert.equal(counts.reduce((a, b) => a + b), 2);
  assert.equal(sent.length, 2);
  assert.equal(new Set(sent).size, 2);
  assert.equal(storage.size, 0);
});

test('account change while waiting for queue lock prevents enqueue and POST', async () => {
  const locks = sharedLocks();
  const f = fixture(new Map(), { onLine: true, locks });
  let release;
  const held = locks.request('winga-offline-queue:winga-offline-action-queue:alice',
    () => new Promise(resolve => { release = resolve; }));
  await waitFor(() => release);
  let posts = 0;
  const sending = f.queue.sendPersistedMessage({ ...payload, clientMessageId: randomUUID() }, {
    sendMessage: async () => { posts++; return { id: 'unexpected' }; }
  });
  const rejection = assert.rejects(sending, /Account changed/);
  f.switchUser('carol');
  release();
  await held;
  await rejection;
  assert.equal(posts, 0);
  assert.equal(f.storage.size, 0);
});

test('lock acquisition failure never silently falls back to unlocked writes', async () => {
  const f = fixture(new Map(), { onLine: true, locks: {
    request: async () => { throw new Error('Lock unavailable'); }
  } });
  await assert.rejects(f.queue.queueOfflineMessageAction(payload), /Lock unavailable/);
  assert.equal(f.storage.size, 0);
});

test('unknown replay ACK remains retryable with the original logical ID', async () => {
  for (const ack of [null, { id: 'local', isQueued: true }, { id: 'skip', skipped: true }]) {
    const f = fixture();
    const clientMessageId = randomUUID();
    await f.queue.queueOfflineMessageAction({ ...payload, clientMessageId });
    assert.equal(await f.queue.flushOfflineActionQueue({ sendMessage: async () => ack }), 0);
    assert.equal(f.queue.readOfflineActionQueue()[0].status, 'QUEUED');
    assert.equal(await f.queue.flushOfflineActionQueue({ sendMessage: async p => {
      assert.equal(p.clientMessageId, clientMessageId);
      return { id: 'confirmed' };
    } }), 1);
    assert.equal(f.queue.readOfflineActionQueue().length, 0);
  }
});

test('accepted replay remains successful when cleanup storage write fails', async () => {
  const f = fixture();
  await f.queue.queueOfflineMessageAction({ ...payload, clientMessageId: randomUUID() });
  await f.queue.queueOfflineMessageAction({ ...payload, message: 'Another message', clientMessageId: randomUUID() });
  const selected = f.queue.readOfflineActionQueue()[0];
  assert.equal(await f.queue.flushOfflineActionQueue({ sendMessage: async () => {
    f.denyStorage(); return { id: 'accepted' };
  } }, selected.id), 1);
  assert.equal(f.queue.readOfflineActionQueue()[0].status, 'QUEUED');
  assert.equal(f.queue.readOfflineActionQueue()[0].payload.clientMessageId, selected.payload.clientMessageId);
  assert.equal(f.events.at(-1).detail.failed, 0);
});
