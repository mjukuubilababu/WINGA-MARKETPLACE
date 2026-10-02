const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const ledger = require('../backend/migrations/conversation-event-ledger');
const migration = require('../backend/migrations/conversation-security-mode');
const { MIGRATIONS } = require('../backend/migrations');
const { isLegacyConversation } = require('../backend/conversation-security-mode');
const { createPostgresStore } = require('../backend/db');
async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(require('./helpers/conversation-event-fixture'));
  const apply = item => db.transaction(async tx => { for (const sql of item.statements) await tx.exec(sql); });
  await apply(ledger); await apply(migration);
  const upgrade = () => db.exec("UPDATE conversation_event_streams SET security_mode='encrypted' WHERE participant_low='alice' AND participant_high='bob'");
  return { db, upgrade, apply };
}
const blocked = error => /conversation_encryption_required/.test(error.message);
test('mode migration follows ledger, does not activate encryption and registers once', () => {
  const ids = MIGRATIONS.map(item => item.id);
  assert.equal(ids.filter(id => id === migration.id).length, 1);
  assert.ok(ids.indexOf(migration.id) > ids.indexOf(ledger.id));
  assert.equal(migration.statements.some(sql => /SET security_mode='encrypted'/.test(sql)), false);
});
test('canonical writer rejects encrypted mode before retry, inserts, push or notifications', async () => {
  const calls = [];
  const client = { release() {}, async query(sql) {
    calls.push(sql);
    if (sql.includes('SELECT security_mode')) return { rows: [{ security_mode: 'encrypted' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
  const store = createPostgresStore({ queryClient: { query: client.query.bind(client), connect: async () => client } });
  const result = await store.createMessageWithNotification({ id: 'unsafe', senderId: 'alice', receiverId: 'bob', message: 'plaintext' },
    { id: 'notification' }, { clientMessageId: 'logical-message-001' });
  assert.deepEqual(result, { created: false, code: 'conversation_encryption_required' });
  assert.equal(calls.some(sql => /INSERT INTO|message_idempotency|pg_notify/.test(sql)), false);
  assert.equal(calls.at(-1), 'COMMIT');
});
test('legacy writes and newly created streams remain compatible', async t => {
  const { db } = await fixture(t);
  assert.equal(await isLegacyConversation(db, 'bob', 'alice'), true);
  assert.equal(await isLegacyConversation(db, 'alice', 'eve'), true);
  await db.exec("INSERT INTO messages(id,sender_id,receiver_id,message) VALUES('new','alice','eve','hello')");
  const modes = (await db.query('SELECT security_mode FROM conversation_event_streams')).rows;
  assert.ok(modes.every(row => row.security_mode === 'legacy-plaintext'));
});
test('reserved encrypted mode blocks direct plaintext inserts and rolls back all ledger effects', async t => {
  const { db, upgrade } = await fixture(t);
  await upgrade(); assert.equal(await isLegacyConversation(db, 'bob', 'alice'), false);
  const before = (await db.query('SELECT position FROM conversation_event_streams')).rows;
  await assert.rejects(db.exec("INSERT INTO messages(id,sender_id,receiver_id,conversation_id,message) VALUES('bad','bob','alice','forged-room','plaintext')"), blocked);
  assert.deepEqual((await db.query('SELECT position FROM conversation_event_streams')).rows, before);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM messages WHERE id='bad'")).rows[0].n, 0);
});
test('plaintext edits and identity changes are blocked but historical receipt updates still work', async t => {
  const { db, upgrade } = await fixture(t); await upgrade();
  for (const set of ["message='replacement'", "product_name='plaintext'", "product_items='[{\"name\":\"leak\"}]'",
    "id='replacement-id'", "receiver_id='eve'", "conversation_id='forged'"]) {
    await assert.rejects(db.exec(`UPDATE messages SET ${set} WHERE id='legacy'`), blocked);
  }
  await db.exec("UPDATE messages SET is_read=TRUE, read_at=NOW() WHERE id='legacy'");
  assert.equal((await db.query("SELECT is_read FROM messages WHERE id='legacy'")).rows[0].is_read, true);
  assert.equal((await db.query('SELECT security_mode FROM conversation_event_streams')).rows[0].security_mode, 'encrypted');
});
test('snapshot restore setting does not bypass plaintext guard', async t => {
  const { db, upgrade } = await fixture(t); await upgrade();
  await assert.rejects(db.transaction(async tx => {
    await tx.exec("SET LOCAL winga.snapshot_restore='on'");
    await tx.exec("INSERT INTO messages(id,sender_id,receiver_id) VALUES('restored','alice','bob')");
  }), blocked);
});
test('encrypted mode cannot be reset, renamed or deleted and migration rerun preserves it', async t => {
  const { db, upgrade, apply } = await fixture(t); await upgrade();
  for (const sql of ["UPDATE conversation_event_streams SET security_mode='legacy-plaintext'",
    "UPDATE conversation_event_streams SET participant_high='eve'", "UPDATE conversation_event_streams SET id='changed'",
    'DELETE FROM conversation_event_streams']) {
    await assert.rejects(db.exec(sql), error => /conversation_security_mode_immutable/.test(error.message));
  }
  await apply(migration);
  assert.equal((await db.query('SELECT security_mode FROM conversation_event_streams')).rows[0].security_mode, 'encrypted');
  await assert.rejects(db.exec("UPDATE conversation_event_streams SET security_mode='unsupported'"));
});
