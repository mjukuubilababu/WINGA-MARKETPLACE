const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { appendMessageReplay, invalidateMessageReplay } = require('../backend/message-replay');
const { createMessageDispatchStore, createMessageDispatchWorker } = require('../backend/message-dispatch');

test('outbox coalesces committed replay positions and survives dispatch failure without private content', async () => {
  const db = new PGlite();
  let failure = '';
  const notifications = [];
  const calls = [];
  const client = { async query(sql, params) {
    calls.push(sql);
    // PGlite covers SQL/rollback, not cross-connection locking or live NOTIFY delivery.
    if (sql.includes('pg_notify')) {
      if (failure === 'notify') throw new Error('injected notify failure');
      notifications.push(params);
      return db.query(sql, params);
    }
    return db.query(sql, params);
  } };
  const withTransaction = async (work) => {
    await db.exec('BEGIN');
    try {
      const result = await work(client);
      if (failure === 'before-commit') throw new Error('injected failure before commit');
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  };
  const add = (id) => withTransaction(async (tx) => {
    await tx.query('INSERT INTO messages VALUES ($1, $2, $3)', [id, 'alice', 'bob']);
    await appendMessageReplay(tx, { id, senderId: 'alice', receiverId: 'bob', message: 'PRIVATE BODY' });
  });
  const rows = async () => (await db.query('SELECT owner_id, position::text FROM message_dispatch_outbox ORDER BY owner_id')).rows;
  try {
    await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY);
      INSERT INTO users VALUES ('alice'), ('bob');
      CREATE TABLE messages(id TEXT PRIMARY KEY, sender_id TEXT, receiver_id TEXT);`);
    for (const name of ['message-replay', 'message-replay-resync', 'message-dispatch-outbox']) {
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const sql of require('../backend/migrations/' + name).statements) await db.exec(sql);
      }
    }
    const store = createMessageDispatchStore({ withTransaction, query: (sql, params) => db.query(sql, params) });
    assert.deepEqual(await store.readMessageDispatchHealth(), { pendingOwners: 0, oldestPendingAgeSeconds: 0 });
    assert.deepEqual(await store.dispatchMessageBatch(), { dispatchedOwners: 0 });
    for (const invalid of [0, -1, 101, 1.5, '50', NaN]) await assert.rejects(store.dispatchMessageBatch(invalid), RangeError);
    await add('m1');
    await db.exec("UPDATE message_dispatch_outbox SET created_at = NOW() - INTERVAL '1 minute'");
    const dates = (await db.query('SELECT created_at FROM message_dispatch_outbox ORDER BY owner_id')).rows;
    await add('m2');
    assert.deepEqual(await rows(), [{ owner_id: 'alice', position: '2' }, { owner_id: 'bob', position: '2' }]);
    assert.deepEqual((await db.query('SELECT created_at FROM message_dispatch_outbox ORDER BY owner_id')).rows, dates);
    assert.equal((await store.readMessageDispatchHealth()).pendingOwners, 2);
    assert.ok((await store.readMessageDispatchHealth()).oldestPendingAgeSeconds >= 59);
    const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='message_dispatch_outbox' ORDER BY ordinal_position")).rows;
    assert.deepEqual(columns.map(row => row.column_name), ['owner_id', 'position', 'created_at']);
    const before = await rows();
    failure = 'before-commit';
    await assert.rejects(add('rolled-back'), /injected/);
    assert.deepEqual(await rows(), before);
    assert.equal((await db.query("SELECT * FROM messages WHERE id='rolled-back'")).rows.length, 0);
    for (const reason of ['notify', 'before-commit']) {
      failure = reason;
      await assert.rejects(store.dispatchMessageBatch(), /injected/);
      assert.deepEqual(await rows(), before);
    }
    failure = '';
    notifications.length = 0;
    assert.deepEqual(await store.dispatchMessageBatch(1), { dispatchedOwners: 1 });
    assert.equal((await rows()).length, 1);
    assert.deepEqual(await store.dispatchMessageBatch(1), { dispatchedOwners: 1 });
    assert.deepEqual(notifications, [[['alice']], [['bob']]]);
    assert.equal((await store.readMessageDispatchHealth()).pendingOwners, 0);
    assert.ok(calls.some(sql => sql.includes('FOR UPDATE SKIP LOCKED')));
    await add('after-dispatch');
    assert.deepEqual(await rows(), [{ owner_id: 'alice', position: '3' }, { owner_id: 'bob', position: '3' }]);
    await withTransaction(tx => invalidateMessageReplay(tx, ['bob', 'alice']));
    assert.deepEqual(await rows(), [{ owner_id: 'alice', position: '4' }, { owner_id: 'bob', position: '4' }]);
    await db.exec("DELETE FROM users WHERE username='bob'");
    assert.deepEqual(await rows(), [{ owner_id: 'alice', position: '4' }]);
    assert.ok(!JSON.stringify(notifications).includes('PRIVATE BODY'));
  } finally { await db.close(); }
});

const settle = () => new Promise(resolve => setImmediate(resolve));

test('ops dispatch handler reports aggregate health and contains database failures', async () => {
  const source = require('node:fs').readFileSync(require.resolve('../backend/server'), 'utf8');
  const start = source.indexOf('  if (req.method === "GET" && url.pathname === "/api/ops/messages/dispatch-health")');
  const end = source.indexOf('  if (req.method === "GET" && url.pathname === "/api/ops/media/storage-policy")', start);
  assert.ok(start > 0 && end > start);
  const route = source.slice(start, end);
  for (const failed of [false, true]) {
    let response;
    await require('node:vm').runInNewContext(`(async () => { ${route} })()`, {
      req: { method: 'GET' }, res: {}, url: { pathname: '/api/ops/messages/dispatch-health' },
      isValidOpsHealthToken: () => true,
      postgresStore: { readMessageDispatchHealth: async () => {
        if (failed) throw new Error('PRIVATE DATABASE DETAIL');
        return { pendingOwners: 2, oldestPendingAgeSeconds: 5 };
      } },
      messageDispatchWorker: {},
      sendJson: (_res, status, body, headers) => { response = JSON.parse(JSON.stringify({ status, body, headers })); }
    });
    assert.equal(response.status, failed ? 503 : 200);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(response.body, failed ? { ok: false, code: 'message_dispatch_unavailable' } : {
      ok: true, privacy: 'aggregate-only', workerEnabled: true, pendingOwners: 2, oldestPendingAgeSeconds: 5
    });
    assert.ok(!JSON.stringify(response).includes('PRIVATE'));
  }
});

test('worker retries with bounded backoff, resets after success and logs no error contents', async () => {
  const timers = [];
  const errors = [];
  let fail = true;
  const worker = createMessageDispatchWorker({
    dispatch: async () => { if (fail) throw new Error('PRIVATE DATABASE DETAIL'); },
    onError: error => errors.push(error),
    schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    cancel: timer => { timer.cancelled = true; }
  });
  worker.start();
  await settle();
  for (const delay of [4000, 8000, 16000, 30000, 30000]) {
    assert.equal(timers.at(-1).delay, delay);
    timers.at(-1).callback();
    await settle();
  }
  assert.deepEqual(errors.map(error => error.consecutiveFailures), [1, 2, 3, 4, 5, 6]);
  assert.ok(!JSON.stringify(errors).includes('PRIVATE'));
  fail = false;
  timers.at(-1).callback();
  await settle();
  assert.equal(timers.at(-1).delay, 2000);
  fail = true;
  timers.at(-1).callback();
  await settle();
  assert.equal(timers.at(-1).delay, 4000);
  await worker.stop();
  assert.equal(timers.at(-1).cancelled, true);
  const count = timers.length;
  timers.at(-1).callback();
  await settle();
  assert.equal(timers.length, count);
});

test('worker does not overlap dispatch and shutdown waits for in-flight work', async () => {
  let release;
  let dispatched = 0;
  let scheduled = 0;
  const worker = createMessageDispatchWorker({
    dispatch: () => { dispatched++; return new Promise(resolve => { release = resolve; }); },
    schedule: () => { scheduled++; }
  });
  worker.start();
  worker.start();
  await settle();
  assert.equal(dispatched, 1);
  let stopped = false;
  const stop = worker.stop().then(() => { stopped = true; });
  await settle();
  assert.equal(stopped, false);
  release();
  await stop;
  assert.equal(stopped, true);
  assert.equal(scheduled, 0);
});
