const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const migration = require('../backend/migrations/message-conversation-sequence');

test('conversation sequence backfills stable legacy order and preserves immutable bindings across retries and restores', async () => {
  const db = new PGlite();
  const apply = async () => {
    await db.exec('BEGIN');
    try {
      for (const sql of migration.statements) await db.exec(sql);
      await db.exec('COMMIT');
    } catch (error) { await db.exec('ROLLBACK'); throw error; }
  };
  const positions = async () => (await db.query('SELECT id, conversation_sequence::text AS sequence FROM messages ORDER BY id')).rows;
  try {
    await db.exec(`CREATE TABLE messages(id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
      conversation_id TEXT, timestamp TIMESTAMPTZ NOT NULL);
      INSERT INTO messages VALUES
        ('z','alice','bob','old-product-thread','2026-09-27T10:00:00Z'),
        ('a','bob','alice','different-product-thread','2026-09-27T10:00:00Z'),
        ('other','alice','carol','other','2026-09-27T09:00:00Z');`);
    await apply();
    assert.deepEqual(await positions(), [{ id: 'a', sequence: '1' }, { id: 'other', sequence: '1' }, { id: 'z', sequence: '2' }]);
    const snapshot = await positions();
    await apply();
    assert.deepEqual(await positions(), snapshot);
    // Old binaries omit the column; the database still assigns the canonical value.
    await db.exec(`INSERT INTO messages(id,sender_id,receiver_id,timestamp)
      VALUES ('clock-backwards','alice','bob','2000-01-01');`);
    assert.equal((await db.query("SELECT conversation_sequence::text AS sequence FROM messages WHERE id='clock-backwards'")).rows[0].sequence, '3');
    await db.exec("UPDATE messages SET conversation_sequence=999 WHERE id='clock-backwards'");
    assert.equal((await db.query("SELECT conversation_sequence::text AS sequence FROM messages WHERE id='clock-backwards'")).rows[0].sequence, '3');
    await assert.rejects(db.exec("UPDATE messages SET receiver_id='carol' WHERE id='clock-backwards'"), /participant binding/);
    await assert.rejects(db.exec("UPDATE messages SET id='renamed' WHERE id='clock-backwards'"), /identity cannot change/);
    await db.exec("BEGIN; INSERT INTO messages(id,sender_id,receiver_id,timestamp) VALUES ('rolled-back','bob','alice',NOW()); ROLLBACK;");
    assert.equal((await db.query("SELECT * FROM message_conversation_positions WHERE message_id='rolled-back'")).rows.length, 0);
    assert.equal((await db.query("SELECT position::text FROM message_conversation_streams WHERE participant_low='alice' AND participant_high='bob'")).rows[0].position, '3');
    await assert.rejects(db.exec("INSERT INTO messages(id,sender_id,receiver_id,timestamp) VALUES ('z','alice','bob',NOW())"), /duplicate key/);
    // Snapshot restore cannot reuse a new position for an existing message ID.
    await db.exec("DELETE FROM messages WHERE id='z'; INSERT INTO messages(id,sender_id,receiver_id,timestamp) VALUES ('z','alice','bob',NOW());");
    assert.equal((await db.query("SELECT conversation_sequence::text AS sequence FROM messages WHERE id='z'")).rows[0].sequence, '2');
    await db.exec("DELETE FROM messages WHERE id='clock-backwards'; INSERT INTO messages(id,sender_id,receiver_id,timestamp,conversation_sequence) VALUES ('after-delete','bob','alice',NOW(),12345);");
    assert.equal((await db.query("SELECT conversation_sequence::text AS sequence FROM messages WHERE id='after-delete'")).rows[0].sequence, '4');
    await db.exec("UPDATE message_conversation_streams SET position=9007199254740992 WHERE participant_low='alice' AND participant_high='bob'; INSERT INTO messages(id,sender_id,receiver_id,timestamp) VALUES ('large','alice','bob',NOW());");
    assert.equal((await db.query("SELECT conversation_sequence::text AS sequence FROM messages WHERE id='large'")).rows[0].sequence, '9007199254740993');
    const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='message_conversation_positions' ORDER BY ordinal_position")).rows;
    assert.deepEqual(columns.map(row => row.column_name), ['message_id', 'participant_low', 'participant_high', 'position']);
  } finally { await db.close(); }
});
