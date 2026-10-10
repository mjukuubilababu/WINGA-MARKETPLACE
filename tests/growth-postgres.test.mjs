import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as pause } from 'node:timers/promises';
import { realPostgres } from './helpers/shopping-room-database.mjs';
import { growthFixture } from './helpers/growth-database.mjs';
const require = createRequire(import.meta.url);
const { createGrowthStore } = require('../backend/growth-store');
const { createGrowthApi } = require('../backend/growth-api');
const { readOnlyCheck, migrationIds } = require('../backend/verify-growth-production');
const { MIGRATIONS, runSchemaMigrations } = require('../backend/migrations');
const migration = require('../backend/migrations/growth-loops');
const pgTest = (name, fn) => test('PostgreSQL Growth: ' + name, { skip: !realPostgres, timeout: 60000 }, fn);
const hash = value => createHash('sha256').update(value).digest('hex');
const secondStore = db => createGrowthStore({ query: (...args) => db.query(...args), withTransaction: fn => db.transaction(fn) });
const rows = async (db, table) => (await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
const outcomes = results => {
  const accepted = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');
  for (const r of rejected) assert.equal(r.reason.code, 'growth_rate_limited');
  return { accepted, rejected };
};

pgTest('production verifier enforces a read-only repeatable snapshot across concurrent commits', async t => {
  const f = await growthFixture(t);
  await f.db.query('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');
  for (const id of migrationIds) await f.db.query('INSERT INTO schema_migrations VALUES($1)', [id]);
  const client = await f.db.pool.connect();
  let concurrentWrite = false;
  try {
    const checked = { query: async (sql, params) => {
      const result = await client.query(sql, params);
      if (sql.startsWith('BEGIN')) {
        assert.equal((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation, 'repeatable read');
        assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
        await client.query('SAVEPOINT readonly_probe');
        await assert.rejects(client.query('UPDATE growth_shares SET revoked_at=NOW()'), { code: '25006' });
        await client.query('ROLLBACK TO SAVEPOINT readonly_probe');
        await client.query('RELEASE SAVEPOINT readonly_probe');
      }
      if (sql.includes("to_regclass('schema_migrations')") && !concurrentWrite) {
        concurrentWrite = true;
        await f.store.createGrowthShare(f.payload, f.source);
      }
      return result;
    }};
    const before = await readOnlyCheck(checked, {});
    assert.equal(before.ok, true);
    assert.equal(before.metrics.shares, 0, 'later queries must retain the initial snapshot');
    assert.equal(await rows(f.db, 'growth_shares'), 1);
    const after = await readOnlyCheck(checked, {});
    assert.equal(after.ok, true);
    assert.equal(after.metrics.shares, 1);
    assert.equal(after.authenticatedShareFlowVerified, false);
    assert.equal(after.productionLoadVerified, false);
    await assert.rejects(readOnlyCheck({ query: sql => client.query(sql.startsWith('SELECT') ? 'SELECT 1/0' : sql) }, {}), { code: '22012' });
    assert.equal((await client.query('SELECT 1 AS ready')).rows[0].ready, 1, 'failed verifier must roll back its transaction');
  } finally { client.release(); }
});

async function waitForBlocked(db, blockerPid) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await db.admin.query(`SELECT pid FROM pg_stat_activity
      WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'`, [blockerPid]);
    if (result.rows.length) return result.rows[0].pid;
    await pause(10);
  }
  assert.fail('Expected an independent PostgreSQL backend waiting on our held lock.');
}

pgTest('independent connections and share retries converge without extra quota', async t => {
  const f = await growthFixture(t), clients = [];
  assert.equal((await f.db.query('SHOW transaction_isolation')).rows[0].transaction_isolation, 'read committed');
  try {
    for (let i = 0; i < 6; i++) clients.push(await f.db.pool.connect());
    const pids = await Promise.all(clients.map(c => c.query('SELECT pg_backend_pid() AS pid')));
    assert.equal(new Set(pids.map(r => r.rows[0].pid)).size, 6);
  } finally { clients.forEach(c => c.release()); }
  const stores = [f.store, secondStore(f.db)], start = performance.now();
  const results = await Promise.all(Array.from({ length: 48 }, (_, i) => stores[i % 2].createGrowthShare(f.payload, f.source)));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(await rows(f.db, 'growth_shares'), 1);
  assert.equal(await rows(f.db, 'growth_events'), 1);
  assert.deepEqual((await f.db.query('SELECT count FROM growth_rate_buckets')).rows.map(r => r.count), [1, 1, 1]);
  const collisions = await Promise.allSettled(Array.from({ length: 24 }, () => f.store.createGrowthShare({ ...f.payload, contentId: 'p2' }, f.source)));
  assert.ok(collisions.every(r => r.status === 'rejected' && r.reason.code === 'growth_share_conflict'));
  t.diagnostic(`48 retry attempts, one share/entry, six backend PIDs; ${Math.round(performance.now() - start)} ms including 24 conflicts.`);
});

pgTest('event retries, logical duplicates and reused IDs converge under contention', async t => {
  const f = await growthFixture(t), stores = [f.store, secondStore(f.db)];
  await f.store.createGrowthShare(f.payload, f.source);
  const event = f.event('product_share_opened');
  const results = await Promise.all(Array.from({ length: 48 }, (_, i) => stores[i % 2].recordGrowthEvent(event, f.recipient)));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  const logical = await Promise.all(Array.from({ length: 48 }, (_, i) => stores[i % 2].recordGrowthEvent({ ...event, eventId: randomUUID() }, f.recipient)));
  assert.ok(logical.every(r => r.duplicate));
  const collision = f.event('product_share_opened');
  const raced = await Promise.allSettled([
    f.store.recordGrowthEvent(collision, f.recipient),
    stores[1].recordGrowthEvent({ ...collision, eventType: 'shared_product_viewed' }, f.recipient)
  ]);
  assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(raced.find(r => r.status === 'rejected').reason.code, 'growth_event_conflict');
  assert.equal(await rows(f.db, 'growth_events'), 3);
  // Expected rejected ID collision rolls back its quota increment.
  assert.deepEqual((await f.db.query("SELECT SUM(count)::int AS count FROM growth_rate_buckets WHERE bucket_key LIKE 'event:%' GROUP BY bucket_key")).rows.map(r => r.count), [97, 97]);
});

pgTest('account share quota is atomic across independent sessions and stores', async t => {
  const f = await growthFixture(t), stores = [f.store, secondStore(f.db)];
  const results = outcomes(await Promise.allSettled(Array.from({ length: 48 }, (_, i) => stores[i % 2].createGrowthShare({
    ...f.payload, shareId: randomUUID(), sessionId: randomUUID()
  }, f.source))));
  assert.equal(results.accepted.length, 30); assert.equal(results.rejected.length, 18);
  assert.equal(await rows(f.db, 'growth_shares'), 30);
  assert.deepEqual((await f.db.query('SELECT count FROM growth_rate_buckets')).rows.map(r => r.count), [30, 30, 30]);
  t.diagnostic('48 unique simultaneous account/session attempts: exactly 30 accepted, 18 rate-limited.');
});

pgTest('IP share quota and daily quota roll back earlier bucket increments', async t => {
  const f = await growthFixture(t);
  const guest = { ...f.source, username: '' };
  const results = outcomes(await Promise.allSettled(Array.from({ length: 72 }, () => f.store.createGrowthShare({
    ...f.payload, shareId: randomUUID(), sessionId: randomUUID()
  }, guest))));
  assert.equal(results.accepted.length, 60); assert.equal(results.rejected.length, 12);
  assert.equal(await rows(f.db, 'growth_shares'), 60);
  assert.equal((await f.db.query("SELECT count FROM growth_rate_buckets WHERE bucket_key LIKE 'share:ip:%'")).rows[0].count, 60);
  assert.equal((await f.db.query("SELECT SUM(count)::int AS n FROM growth_rate_buckets WHERE bucket_key LIKE 'share:actor:%'")).rows[0].n, 60);
  await f.db.query('DELETE FROM growth_rate_buckets');
  await f.db.query(`INSERT INTO growth_rate_buckets VALUES($1,to_timestamp(floor(extract(epoch FROM NOW())/86400)*86400),299)`,
    ['share:daily:' + hash('user:sender')]);
  const daily = outcomes(await Promise.allSettled(Array.from({ length: 12 }, () => f.store.createGrowthShare({ ...f.payload, shareId: randomUUID() }, f.source))));
  assert.equal(daily.accepted.length, 1); assert.equal(daily.rejected.length, 11);
  assert.deepEqual((await f.db.query('SELECT count FROM growth_rate_buckets ORDER BY count')).rows.map(r => r.count), [1, 1, 300]);
});

pgTest('event account and IP limits are atomic and leave no rejected events', async t => {
  const f = await growthFixture(t);
  await f.store.createGrowthShare(f.payload, f.source);
  const account = outcomes(await Promise.allSettled(Array.from({ length: 144 }, () => f.store.recordGrowthEvent(f.event('product_share_opened'), f.recipient))));
  assert.equal(account.accepted.length, 120); assert.equal(account.rejected.length, 24);
  assert.equal(await rows(f.db, 'growth_events'), 121);
  assert.deepEqual((await f.db.query("SELECT count FROM growth_rate_buckets WHERE bucket_key LIKE 'event:%'")).rows.map(r => r.count), [120, 120]);
  await f.db.query("DELETE FROM growth_rate_buckets WHERE bucket_key LIKE 'event:%'");
  const ip = outcomes(await Promise.allSettled(Array.from({ length: 264 }, () => f.store.recordGrowthEvent(f.event('product_share_opened'), { ...f.recipient, username: '' }))));
  assert.equal(ip.accepted.length, 240); assert.equal(ip.rejected.length, 24);
  assert.equal(await rows(f.db, 'growth_events'), 361);
  assert.equal((await f.db.query("SELECT count FROM growth_rate_buckets WHERE bucket_key LIKE 'event:ip:%'")).rows[0].count, 240);
  t.diagnostic('144 account events: 120 accepted; 264 anonymous events from one IP: 240 accepted. Rejected transactions leave no quota/event residue.');
});

pgTest('a late write failure rolls back the share, events, quotas and advisory lock', async t => {
  const f = await growthFixture(t);
  const failing = createGrowthStore({ query: (...args) => f.db.query(...args), withTransaction: fn => f.db.transaction(c => fn({
    query: async (...args) => {
      const result = await c.query(...args);
      if (args[0].includes('INSERT INTO growth_events')) throw new Error('synthetic post-insert failure');
      return result;
    }
  })) });
  await assert.rejects(failing.createGrowthShare(f.payload, f.source), /synthetic post-insert failure/);
  for (const table of ['growth_shares', 'growth_events', 'growth_rate_buckets']) assert.equal(await rows(f.db, table), 0);
  assert.equal((await f.store.createGrowthShare(f.payload, f.source)).duplicate, false);
  assert.equal(await rows(f.db, 'growth_shares'), 1);
});

pgTest('queued writes recheck committed privacy, moderation, blocks and revocation', async t => {
  const changes = [
    ["INSERT INTO public_content_visibility VALUES('product','p1','private')", 'DELETE FROM public_content_visibility'],
    ["INSERT INTO public_content_visibility VALUES('product','p1','followers')", 'DELETE FROM public_content_visibility'],
    ["UPDATE users SET status='suspended' WHERE username='seller'", "UPDATE users SET status='active' WHERE username='seller'"],
    ["UPDATE products SET status='pending' WHERE id='p1'", "UPDATE products SET status='approved' WHERE id='p1'"],
    ["DELETE FROM products WHERE id='p1'", "INSERT INTO products VALUES('p1','seller','approved')"],
    ["INSERT INTO user_blocks VALUES('seller','sender'),('sender','recipient')", 'DELETE FROM user_blocks'],
    ["INSERT INTO user_blocks VALUES('sender','seller'),('recipient','sender')", 'DELETE FROM user_blocks']
  ];
  for (const mode of ['share', 'event']) {
    const f = await growthFixture(t);
    await f.store.createGrowthShare(f.payload, f.source);
    const cases = mode === 'event' ? [...changes,
      ["UPDATE growth_shares SET revoked_at=NOW()", 'UPDATE growth_shares SET revoked_at=NULL'],
      ["UPDATE growth_shares SET created_at=NOW()-INTERVAL '31 days',expires_at=NOW()-INTERVAL '1 day'", "UPDATE growth_shares SET created_at=NOW(),expires_at=NOW()+INTERVAL '30 days'"]
    ] : changes;
    for (const [change, restore] of cases) {
      // Hold the actual quota row, so the service has already read eligibility
      // but cannot proceed until a different connection commits the change.
      const blocker = await f.db.pool.connect();
      let pending;
      const quotaBefore = (await f.db.query('SELECT COALESCE(SUM(count),0)::int AS n FROM growth_rate_buckets')).rows[0].n;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const bucket = mode === 'share' ? 'share:actor:' + hash('user:sender') : 'event:ip:' + hash(f.recipient.ip);
        await blocker.query(`INSERT INTO growth_rate_buckets VALUES($1,to_timestamp(floor(extract(epoch FROM NOW())/60)*60),1)
          ON CONFLICT(bucket_key,window_start) DO UPDATE SET count=growth_rate_buckets.count`, [bucket]);
        pending = (mode === 'share'
          ? f.store.createGrowthShare({ ...f.payload, shareId: randomUUID() }, f.source)
          : f.store.recordGrowthEvent(f.event('product_share_opened'), f.recipient)).then(
            value => ({ value }), error => ({ error }));
        const blockedPid = await waitForBlocked(f.db, pid);
        assert.notEqual(blockedPid, pid);
        await f.db.query(change);
        await blocker.query('COMMIT');
        const outcome = await pending;
        assert.equal(outcome.error?.code, 'growth_share_unavailable', `${mode} accepted after committed: ${change}`);
        assert.equal(await rows(f.db, 'growth_shares'), 1);
        assert.equal(await rows(f.db, 'growth_events'), 1);
        // The held transaction itself inserted one quota row if absent.
        const quotaAfter = (await f.db.query('SELECT COALESCE(SUM(count),0)::int AS n FROM growth_rate_buckets')).rows[0].n;
        assert.equal(quotaAfter, quotaBefore + (mode === 'event' && quotaBefore === 3 ? 1 : 0));
      } finally {
        await blocker.query('ROLLBACK'); blocker.release();
        if (pending) await pending;
        await f.db.query(restore);
      }
    }
  }
});

pgTest('a real PostgreSQL lock timeout returns retryable API failure without partial writes', async t => {
  const f = await growthFixture(t), blocker = await f.db.pool.connect();
  let response;
  const timedStore = createGrowthStore({ query: (...args) => f.db.query(...args), withTransaction: fn => f.db.transaction(async c => {
    await c.query("SET LOCAL lock_timeout='150ms'");
    return fn(c);
  }) });
  const api = createGrowthApi({
    collectBody: async () => f.payload, sendJson: (_res, status, body) => { response = { status, body }; },
    findSession: () => ({ username: f.source.username }), readAuthToken: () => '', clientIp: () => f.source.ip,
    ensureUser: () => true, isAdminSession: () => false, getStore: () => timedStore,
    productSharingEnabled: true, measurementEnabled: true
  });
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['growth-share:' + f.payload.shareId]);
    await api.handle({ method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' } }, {}, new URL('https://winga.test/api/growth/shares'));
    assert.deepEqual(response, { status: 503, body: { code: 'growth_unavailable' } });
    for (const table of ['growth_shares', 'growth_events', 'growth_rate_buckets']) assert.equal(await rows(f.db, table), 0);
    await blocker.query('COMMIT');
    await api.handle({ method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' } }, {}, new URL('https://winga.test/api/growth/shares'));
    assert.equal(response.status, 200); assert.equal(response.body.duplicate, false);
    assert.equal(await rows(f.db, 'growth_shares'), 1);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
});

pgTest('canonical runner rolls back failed DDL and serializes concurrent retries', async t => {
  const f = await growthFixture(t, { migrate: false });
  // Represent the already-applied production history; exercise only the new
  // migration through the unmodified canonical runner, not copied runner code.
  await f.db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const timingMigration = require('../backend/migrations/growth-event-timing');
  for (const m of MIGRATIONS.filter(m => ![migration.id,timingMigration.id].includes(m.id)))
    await f.db.query('INSERT INTO schema_migrations(migration_id) VALUES($1)', [m.id]);
  const before = await rows(f.db, 'schema_migrations');
  const failingPool = { query: (...args) => f.db.query(...args), connect: async () => {
    const c = await f.db.pool.connect();
    return { release: () => c.release(), query: (...args) => args[0] === migration.statements[2]
      ? c.query('SELECT deliberately_missing_growth_migration_column') : c.query(...args) };
  } };
  await assert.rejects(runSchemaMigrations({ pool: failingPool, logger: {} }), { code: '42703' });
  assert.equal(await rows(f.db, 'schema_migrations'), before);
  assert.deepEqual((await f.db.query("SELECT to_regclass('growth_shares') AS shares,to_regclass('growth_events') AS events,to_regclass('growth_rate_buckets') AS rates")).rows[0], { shares: null, events: null, rates: null });
  assert.equal(await rows(f.db, 'users'), 4);
  let announce, unblock;
  const entered = new Promise(resolve => { announce = resolve; });
  const resume = new Promise(resolve => { unblock = resolve; });
  const heldPool = { query: (...args) => f.db.query(...args), connect: async () => {
    const c = await f.db.pool.connect();
    return { release: () => c.release(), query: async (...args) => {
      const result = await c.query(...args);
      if (args[0] === migration.statements[2]) {
        announce((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        await resume;
      }
      return result;
    } };
  } };
  const first = runSchemaMigrations({ pool: heldPool, logger: {} });
  const blockerPid = await entered;
  const second = runSchemaMigrations({ pool: f.db.pool, logger: {} });
  try {
    const blockedPid = await waitForBlocked(f.db, blockerPid);
    assert.notEqual(blockedPid, blockerPid);
    assert.equal(await rows(f.db, 'schema_migrations'), before);
  } finally { unblock(); }
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.flatMap(r => r.applied), [migration.id,timingMigration.id]);
  assert.equal(await rows(f.db, 'schema_migrations'), before + 2);
  assert.deepEqual((await runSchemaMigrations({ pool: f.db.pool, logger: {} })).applied, []);
  await f.store.createGrowthShare(f.payload, f.source);
  // Actual checks, uniqueness, FK/cascade and indexes survived runner commit.
  await assert.rejects(f.db.query('UPDATE growth_shares SET expires_at=created_at'), { code: '23514' });
  await assert.rejects(f.db.query('UPDATE growth_shares SET owner_username=$1', ['missing']), { code: '23503' });
  await assert.rejects(f.db.query('INSERT INTO growth_events SELECT * FROM growth_events'), { code: '23505' });
  const indexes = (await f.db.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename IN ('growth_events','growth_shares')")).rows.map(r => r.indexname);
  assert.ok(indexes.includes('growth_events_recent')); assert.ok(indexes.includes('growth_shares_owner_recent'));
  await f.db.query('DELETE FROM growth_shares WHERE id=$1', [f.payload.shareId]);
  assert.equal(await rows(f.db, 'growth_events'), 0);
});
