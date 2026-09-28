const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { createMessageDeviceReceiptsStore, validateReceipt } = require('../backend/message-device-receipts');
const migration = require('../backend/migrations/message-device-receipts');

test('receipt payload is bounded, session bound and rejects forged participants', () => {
  const good = { deviceId: 'd1', kind: 'stored', withUser: 'alice', messageIds: ['m1', 'm1'] };
  assert.deepEqual(validateReceipt(good, 'bob', 'd1'), ['m1']);
  for (const payload of [null, { ...good, deviceId: 'd2' }, { ...good, withUser: 'bob' },
    { ...good, kind: 'delivered' }, { ...good, messageIds: [] }, { ...good, messageIds: Array(101).fill('m1') },
    { ...good, messageIds: [{}] }]) assert.throws(() => validateReceipt(payload, 'bob', 'd1'));
});

test('device receipt SQL is exact, durable, idempotent, revocation-aware and transactional', async () => {
  const db = new PGlite();
  let fail = false, invalidations = 0;
  const store = createMessageDeviceReceiptsStore({
    withTransaction: work => db.transaction(tx => work({ query: (sql, params) =>
      sql.includes('pg_advisory_xact_lock') ? { rows: [] } : tx.query(sql, params) })),
    invalidate: async () => { if (fail) throw new Error('wake-up unavailable'); invalidations++; }
  });
  const ack = (kind, ids = ['m1'], deviceId = 'd1', owner = 'bob', token = deviceId) =>
    store.acknowledgeMessageDevice({ owner, token, deviceId,
      payload: { kind, deviceId, messageIds: ids, withUser: 'alice' } });
  const message = async id => (await db.query('SELECT * FROM messages WHERE id=$1', [id])).rows[0];
  try {
    await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active');
      INSERT INTO users(username) VALUES ('alice'),('bob'),('mallory');
      CREATE TABLE sessions(token TEXT PRIMARY KEY,username TEXT,session_id TEXT,expires_at BIGINT);
      INSERT INTO sessions VALUES ('d1','bob','d1',9999999999999),('d2','bob','d2',9999999999999),('d3','mallory','d3',9999999999999);
      CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
      CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,
        is_delivered BOOLEAN DEFAULT FALSE,is_read BOOLEAN DEFAULT FALSE,delivered_at TIMESTAMPTZ,read_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ,row_version INT DEFAULT 1);
      INSERT INTO messages(id,sender_id,receiver_id) VALUES ('m1','alice','bob'),('m2','alice','bob'),('other','alice','mallory');
      CREATE TABLE notifications(user_id TEXT,message_id TEXT,is_read BOOLEAN DEFAULT FALSE,read_at TIMESTAMPTZ,row_version INT DEFAULT 1);
      INSERT INTO notifications(user_id,message_id) VALUES ('bob','m1'),('bob','m2');`);
    for (let i = 0; i < 2; i++) for (const sql of migration.statements) await db.exec(sql);
    await assert.rejects(ack('read'), { status: 409 });
    await assert.rejects(ack('stored', ['m1','other']), { status: 404 });
    assert.equal((await db.query('SELECT * FROM message_device_receipts')).rows.length, 0);
    await ack('stored');
    assert.equal((await message('m1')).is_delivered, true);
    assert.equal((await message('m1')).is_read, false);
    const first = await message('m1');
    const count = invalidations;
    await ack('stored');
    assert.equal(invalidations, count);
    assert.deepEqual(await message('m1'), first);
    await assert.rejects(ack('read', ['m1'], 'd2'), { status: 409 });
    await ack('stored', ['m1'], 'd2');
    await db.exec("INSERT INTO messages(id,sender_id,receiver_id) VALUES ('later','alice','bob')");
    await ack('read');
    assert.equal((await message('m1')).is_read, true);
    assert.equal((await message('m2')).is_read, false);
    assert.equal((await message('later')).is_read, false);
    assert.equal((await db.query("SELECT is_read FROM notifications WHERE message_id='m2'")).rows[0].is_read, false);
    assert.equal((await db.query("SELECT read_at FROM message_device_receipts WHERE device_id='d2'")).rows[0].read_at, null);
    const readOnce = await message('m1');
    await ack('read');
    assert.deepEqual(await message('m1'), readOnce);
    await assert.rejects(ack('stored', ['m1'], 'd3', 'mallory'), { status: 404 });
    await db.exec("DELETE FROM sessions WHERE session_id='d1'");
    await assert.rejects(ack('stored'), { status: 401 });
    await db.exec("UPDATE sessions SET token='rotated' WHERE session_id='d2'");
    await assert.rejects(ack('stored', ['m1'], 'd2'), { status: 401 });
    await ack('read', ['m1'], 'd2', 'bob', 'rotated');
    await db.exec("INSERT INTO user_blocks VALUES ('bob','alice')");
    await assert.rejects(ack('stored', ['m2'], 'd2', 'bob', 'rotated'), { status: 403 });
    await db.exec('DELETE FROM user_blocks');
    fail = true;
    await assert.rejects(ack('stored', ['m2'], 'd2', 'bob', 'rotated'), /wake-up/);
    assert.equal((await message('m2')).is_delivered, false);
    assert.equal((await db.query("SELECT * FROM message_device_receipts WHERE message_id='m2'")).rows.length, 0);
    fail = false;
    // Legacy snapshot replacement cannot erase independent recipient proof.
    await db.exec("DELETE FROM messages WHERE id='m1'; INSERT INTO messages(id,sender_id,receiver_id) VALUES ('m1','alice','bob')");
    assert.equal((await message('m1')).is_read, true);
    assert.equal((await message('m1')).is_delivered, true);
    await db.exec("UPDATE users SET status='suspended' WHERE username='bob'");
    await assert.rejects(ack('stored', ['m2'], 'd2', 'bob', 'rotated'), { status: 401 });
    const { verifyDeviceReceiptSchema } = require('../backend/verify-message-device-receipts');
    await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');
    assert.equal((await verifyDeviceReceiptSchema(db)).ok, false);
    await db.exec("INSERT INTO schema_migrations VALUES ('2026092803_message_device_receipts'); CREATE UNIQUE INDEX idx_sessions_session_id_unique ON sessions(session_id)");
    assert.equal((await verifyDeviceReceiptSchema(db)).ok, true);
    await db.exec('ALTER TABLE messages DISABLE TRIGGER preserve_message_device_receipts');
    assert.equal((await verifyDeviceReceiptSchema(db)).ok, false);
  } finally { await db.close(); }
});
