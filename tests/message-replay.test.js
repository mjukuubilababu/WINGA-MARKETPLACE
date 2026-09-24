const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { appendMessageReplay, createMessageReplayStore, getMessageStateEventOwners } = require('../backend/message-replay');
const migration = require('../backend/migrations/message-replay');
const resyncMigration = require('../backend/migrations/message-replay-resync');

test('replay is bounded, owner-scoped, ordered and respects current blocks/deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY);
      INSERT INTO users VALUES ('a'), ('b'), ('c');
      CREATE TABLE messages(id TEXT PRIMARY KEY, sender_id TEXT, receiver_id TEXT);
      CREATE TABLE user_blocks(blocker_username TEXT, blocked_username TEXT);`);
    for (let i = 0; i < 2; i++) for (const sql of migration.statements) await db.exec(sql);
    for (let i = 0; i < 2; i++) for (const sql of resyncMigration.statements) await db.exec(sql);
    const store = createMessageReplayStore({ query: (sql, params) => db.query(sql, params) });
    const initial = await store.readMessageReplay('a');
    assert.equal(initial.resyncRequired, true);
    assert.deepEqual(initial.events, []);
    const add = async (id, receiverId = 'b') => {
      await db.exec('BEGIN');
      await db.query('INSERT INTO messages VALUES ($1, $2, $3)', [id, 'a', receiverId]);
      await appendMessageReplay(db, { id, senderId: 'a', receiverId });
      await db.exec('COMMIT');
    };
    await add('m1');
    await add('m2', 'c');
    await add('m3');
    const first = await store.readMessageReplay('a', { cursor: initial.cursor, limit: 1 });
    assert.deepEqual(first.events, [{ position: '1', messageId: 'm1', type: 'message_created' }]);
    assert.equal(first.hasMore, true);
    const second = await store.readMessageReplay('a', { cursor: first.cursor, limit: 1 });
    assert.equal(second.events[0].messageId, 'm2');
    await assert.rejects(store.readMessageReplay('b', { cursor: first.cursor }), { status: 400 });
    for (const limit of [0, -1, 51, 'bad', 1.5]) await assert.rejects(store.readMessageReplay('a', { limit }), { status: 400 });
    await assert.rejects(store.readMessageReplay('a', { cursor: 'bad' }), { status: 400 });
    const future = Buffer.from(JSON.stringify({ v: 1, owner: 'a', position: '99' })).toString('base64url');
    await assert.rejects(store.readMessageReplay('a', { cursor: future }), { status: 400 });
    await db.exec("INSERT INTO user_blocks VALUES ('b','a'); DELETE FROM messages WHERE id = 'm2';");
    const hidden = await store.readMessageReplay('a', { cursor: initial.cursor, limit: 1 });
    assert.deepEqual(hidden.events, []);
    assert.equal(hidden.hasMore, true);
    assert.notEqual(hidden.cursor, initial.cursor);
    const rest = await store.readMessageReplay('a', { cursor: hidden.cursor });
    assert.deepEqual(rest.events, []);
    assert.equal(rest.hasMore, false);
    const head = await store.readMessageReplay('a');
    assert.equal(head.cursor, rest.cursor);
    assert.equal((await db.query("SELECT message_id FROM message_replay_events WHERE owner_id='a' AND position=2")).rows[0].message_id, null);
    await db.exec("BEGIN; INSERT INTO messages VALUES ('rollback','a','b');");
    await appendMessageReplay(db, { id: 'rollback', senderId: 'a', receiverId: 'b' });
    await db.exec('ROLLBACK');
    assert.equal((await store.readMessageReplay('a')).cursor, head.cursor);
    await db.exec('DELETE FROM user_blocks');
    await add('m4');
    const tail = await store.readMessageReplay('a', { cursor: rest.cursor });
    assert.equal(tail.events[0].position, '4');
    assert.equal(tail.events[0].messageId, 'm4');
    assert.equal(tail.hasMore, false);
    assert.deepEqual((await store.readMessageReplay('a', { cursor: tail.cursor })).events, []);
    await db.exec("UPDATE message_replay_streams SET position=9007199254740992 WHERE owner_id='a'");
    const largeCheckpoint = await store.readMessageReplay('a');
    await add('large-position');
    const large = await store.readMessageReplay('a', { cursor: largeCheckpoint.cursor });
    assert.equal(large.events[0].position, '9007199254740993');
    await db.exec("INSERT INTO user_blocks VALUES ('a','b')");
    assert.deepEqual((await store.readMessageReplay('a', { cursor: largeCheckpoint.cursor })).events, []);
  } finally { await db.close(); }
});

test('journal acquires participant counters in stable order without copying message content', async () => {
  const calls = [];
  await appendMessageReplay({ query: async (sql, params) => calls.push({ sql, params }) }, {
    id: 'm', senderId: 'z', receiverId: 'a', message: 'PRIVATE BODY'
  });
  assert.deepEqual(calls.map(call => call.params), [['a', 'm'], ['z', 'm']]);
  assert.ok(calls.every(call => !JSON.stringify(call).includes('PRIVATE BODY')));
});

test('state event routing accepts only the versioned bounded owner contract', () => {
  const event = { version: 1, type: 'message_state_changed', owners: ['alice', 'bob'] };
  assert.deepEqual(getMessageStateEventOwners(event), ['alice', 'bob']);
  assert.deepEqual(getMessageStateEventOwners({ ...event, owners: ['alice', 'alice'] }), ['alice']);
  for (const invalid of [null, {}, { ...event, version: 2 }, { ...event, type: 'message_created' },
    { ...event, owners: [] }, { ...event, owners: ['alice', 'bob', 'eve'] },
    { ...event, owners: ['alice', {}] }, { ...event, owners: ['alice', 'bob\nother'] }]) {
    assert.deepEqual(getMessageStateEventOwners(invalid), []);
  }
});
