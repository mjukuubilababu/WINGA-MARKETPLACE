const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const migration = require('../backend/migrations/conversation-event-ledger');
const { createConversationEventStore, validateEventIds } = require('../backend/conversation-event-ledger');
const { verifyConversationEvents } = require('../backend/verify-conversation-events');
const { MIGRATIONS } = require('../backend/migrations');

test('ledger migration runs after its receipt, sequence and block dependencies on a fresh database', () => {
  const ids=MIGRATIONS.map(m=>m.id), ledger=ids.indexOf(migration.id);
  for(const dependency of ['2026092802_message_conversation_sequence','2026092803_message_device_receipts','2026091201_person_social_graph']) {
    assert.ok(ids.indexOf(dependency)>=0 && ids.indexOf(dependency)<ledger,dependency);
  }
});

async function fixture() {
  const db = new PGlite();
  await db.exec(require('./helpers/conversation-event-fixture'));
  const apply = () => db.transaction(async tx => { for (const sql of migration.statements) await tx.exec(sql); });
  await apply();
  await db.exec(`CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY);
    INSERT INTO schema_migrations VALUES ('${migration.id}');`);
  const store = createConversationEventStore({ withTransaction: work => db.transaction(work) });
  const context = (deviceId = 'b1', owner = 'bob', token = deviceId) => ({deviceId,owner,token});
  const poll = (d='b1') => store.pollConversationDeviceEvents(context(d));
  const ack = (batch,d='b1') => store.acknowledgeConversationDeviceEvents(context(d),{ deviceId:d,eventIds:batch.events.map(e=>e.id) });
  return { db,apply,store,context,poll,ack };
}

test('event ACK payloads are bounded and device-bound', () => {
  const id='a'.repeat(32)+':1';
  assert.deepEqual(validateEventIds({deviceId:'d',eventIds:[id,id]},'d'),[id]);
  for (const p of [null,{deviceId:'other',eventIds:[id]},{deviceId:'d',eventIds:[]},
    {deviceId:'d',eventIds:Array(51).fill(id)},{deviceId:'d',eventIds:['bad']}]) assert.throws(()=>validateEventIds(p,'d'));
});

test('ledger backfill, revisions, tombstones and snapshot rewrite are transactional', async () => {
  const f=await fixture(); const {db}=f;
  const events=async()=> (await db.query('SELECT kind,position::text,revision::text FROM conversation_events ORDER BY position')).rows;
  try {
    assert.deepEqual((await events()).map(e=>e.kind),['membership_initialized','message_imported']);
    await f.apply(); assert.equal((await events()).length,2);
    await db.exec("UPDATE messages SET message='edited' WHERE id='legacy'");
    assert.equal((await events()).at(-1).kind,'message_edited');
    await db.exec("UPDATE messages SET message='edited' WHERE id='legacy'");
    assert.equal((await events()).length,3);
    const before=await events();
    await assert.rejects(db.transaction(async tx=> { await tx.exec("UPDATE messages SET message='rollback' WHERE id='legacy'"); throw new Error('abort'); }), /abort/);
    assert.deepEqual(await events(),before);
    await db.transaction(async tx=> {
      await tx.exec("SELECT set_config('winga.snapshot_restore','on',true); DELETE FROM messages;");
      await tx.exec("INSERT INTO messages(id,sender_id,receiver_id,message) VALUES('legacy','alice','bob','edited')");
    });
    assert.deepEqual(await events(),before);
    await assert.rejects(db.transaction(async tx=> {
      await tx.exec("SELECT set_config('winga.snapshot_restore','on',true); UPDATE messages SET message='stale'");
    }), /Snapshot/);
    await db.exec("DELETE FROM messages WHERE id='legacy'");
    assert.equal((await events()).at(-1).kind,'message_deleted');
    await assert.rejects(db.exec("INSERT INTO messages(id,sender_id,receiver_id) VALUES('legacy','alice','bob')"),/immutable/);
    assert.equal((await db.query('SELECT * FROM messages')).rows.length,0);
    assert.equal(JSON.stringify(await db.query('SELECT * FROM conversation_events')).includes('private text'),false);
  } finally { await db.close(); }
});

test('two devices have independent durable replay, ACK retry, late registration and revocation', async () => {
  const f=await fixture(); const {db,store,context,poll,ack}=f;
  try {
    const first=await poll(); assert.equal(first.events.length,2); assert.equal(first.items[0].id,'legacy');
    assert.deepEqual((await poll()).events,first.events);
    await ack(first); await ack(first);
    assert.equal((await poll()).events.length,0);
    const second=await poll('b2'); assert.equal(second.events.length,2);
    assert.equal((await db.query("SELECT is_delivered FROM messages WHERE id='legacy'")).rows[0].is_delivered,false);
    await assert.rejects(store.acknowledgeConversationDeviceEvents(context('e','eve'),{deviceId:'e',eventIds:first.events.map(e=>e.id)}));
    await db.exec("INSERT INTO messages(id,sender_id,receiver_id) VALUES('new','alice','bob')");
    assert.equal((await poll()).items[0].id,'new');
    assert.equal((await poll('b2')).items.length,2);
    await db.exec("DELETE FROM sessions WHERE session_id='b1'");
    await assert.rejects(poll(),{status:401});
    assert.ok((await db.query("SELECT cancelled_at FROM conversation_device_deliveries WHERE device_id='b1' AND acknowledged_at IS NULL")).rows.every(r=>r.cancelled_at));
    await db.exec("UPDATE sessions SET token='rotated' WHERE session_id='b2'");
    await assert.rejects(poll('b2'),{status:401});
    assert.ok((await store.pollConversationDeviceEvents(context('b2','bob','rotated'))).events.length);
    await db.exec("UPDATE sessions SET expires_at=0 WHERE session_id='b2'");
    await assert.rejects(store.pollConversationDeviceEvents(context('b2','bob','rotated')),{status:401});
  } finally {await db.close();}
});

test('event history and device ACKs reauthorize membership, blocks and cursors', async () => {
  const f=await fixture(); const {db,store,context,poll,ack}=f;
  try {
    const first=await store.readConversationEvents(context(),{withUser:'alice',limit:1});
    assert.equal(first.hasMore,true);
    const second=await store.readConversationEvents(context(),{withUser:'alice',cursor:first.cursor});
    assert.equal(second.events[0].sequence,'2');
    await assert.rejects(store.readConversationEvents(context('e','eve'),{withUser:'alice',cursor:first.cursor}),{status:404});
    await assert.rejects(store.readConversationEvents(context(),{withUser:'alice',cursor:'garbage'}),{status:400});
    const batch=await poll();
    await db.exec("INSERT INTO user_blocks VALUES('alice','bob')");
    assert.equal((await poll()).events.length,0);
    await assert.rejects(ack(batch),{status:409});
    await assert.rejects(store.readConversationEvents(context(),{withUser:'alice'}),{status:404});
    await db.exec("DELETE FROM user_blocks");
    const unblocked=await store.readConversationEvents(context(),{withUser:'alice',cursor:first.cursor});
    assert.equal(unblocked.accessChanged,true);
    assert.equal(unblocked.events.filter(e=>e.kind==='access_changed').length,2);
    await db.exec("DELETE FROM messages WHERE id='legacy'");
    const deleted=await poll(); assert.equal(deleted.items.length,0);
    assert.ok(deleted.events.filter(e=>e.messageId).every(e=>e.tombstone));
    await ack(deleted); assert.equal((await poll()).events.length,0);
  } finally {await db.close();}
});

test('large backlogs drain in bounded ordered batches without consuming another device', async () => {
  const f=await fixture(); const {db,store,context,poll,ack}=f;
  try {
    await store.registerConversationDevice(context());
    await db.exec(`INSERT INTO messages(id,sender_id,receiver_id)
      SELECT 'backlog-'||n,'alice','bob' FROM generate_series(1,123) n`);
    const unoffered=(await db.query('SELECT id FROM conversation_events ORDER BY position DESC LIMIT 1')).rows[0].id;
    await assert.rejects(store.acknowledgeConversationDeviceEvents(context(),{deviceId:'b1',eventIds:[unoffered]}),{status:409});
    for (const device of ['b1','b2']) {
      const seen=[];
      for(let page=0;page<10;page++) {
        const batch=await poll(device);
        assert.ok(batch.events.length<=50);
        seen.push(...batch.events.map(e=>e.sequence));
        if(batch.events.length) await ack(batch,device);
        if(!batch.hasMore) break;
      }
      assert.deepEqual(seen,Array.from({length:125},(_,i)=>String(i+1)));
      assert.equal((await poll(device)).events.length,0);
    }
  } finally {await db.close();}
});

test('snapshot reconciliation preserves retained sessions and records actual deletions and access changes', async () => {
  const f=await fixture(); const {db,poll}=f;
  try {
    await poll(); await poll('b2');
    await db.transaction(async tx=> {
      await tx.exec(`SELECT set_config('winga.snapshot_restore','on',true);
        DELETE FROM sessions WHERE session_id IN ('b1','b2');
        INSERT INTO sessions VALUES ('b1','bob','b1',9999999999999);
        DELETE FROM messages WHERE id='legacy';
        INSERT INTO user_blocks VALUES('alice','bob');
        SELECT winga_reconcile_conversation_snapshot();`);
    });
    const devices=(await db.query('SELECT device_id,revoked_at FROM conversation_delivery_devices ORDER BY device_id')).rows;
    assert.equal(devices[0].revoked_at,null); assert.ok(devices[1].revoked_at);
    assert.equal((await poll()).events.length,0);
    assert.ok((await db.query("SELECT cancelled_at FROM conversation_device_deliveries WHERE device_id='b2'")).rows.every(r=>r.cancelled_at));
    const kinds=(await db.query('SELECT kind FROM conversation_events ORDER BY position')).rows.map(e=>e.kind);
    assert.deepEqual(kinds,['membership_initialized','message_imported','message_deleted','access_changed']);
    await db.exec('SELECT winga_reconcile_conversation_snapshot()');
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM conversation_events')).rows[0].n,4);
    await db.exec('DELETE FROM user_blocks');
    const restored=await poll();
    assert.equal(restored.items.length,0);
    assert.ok(restored.events.filter(e=>e.messageId).every(e=>e.tombstone));
    assert.equal((await verifyConversationEvents(db)).ok,true);
  } finally {await db.close();}
});

test('receipt events, queue fan-out and aggregate verification remain transactional and append-only', async () => {
  const f=await fixture(); const {db,poll,ack}=f;
  try {
    const first=await poll(); await ack(first);
    await assert.rejects(db.transaction(async tx=> {
      await tx.exec("INSERT INTO message_device_receipts(message_id,device_id,sender_id,receiver_id) VALUES('legacy','b1','alice','bob')");
      throw new Error('abort receipt');
    }),/abort receipt/);
    assert.equal((await poll()).events.length,0);
    await db.exec(`INSERT INTO message_device_receipts(message_id,device_id,sender_id,receiver_id) VALUES('legacy','b1','alice','bob');
      UPDATE message_device_receipts SET read_at=NOW(); UPDATE message_device_receipts SET read_at=NOW();`);
    const batch=await poll();
    assert.deepEqual(batch.events.map(e=>e.kind),['device_stored','device_read']);
    for(const sql of ['DELETE FROM conversation_events',"UPDATE conversation_events SET kind='message_deleted'"]) {
      await assert.rejects(db.exec(sql),/append-only/);
    }
    const report=await db.transaction(async tx=> {
      await tx.exec('SET TRANSACTION READ ONLY');
      return verifyConversationEvents(tx);
    });
    assert.equal(report.ok,true); assert.equal(report.pending,2); assert.equal(report.acknowledged,2);
    assert.equal(report.databaseChanged,false); assert.equal(report.crossConnectionConcurrencyVerified,false);
    assert.equal(JSON.stringify(report).includes('alice'),false);
    await db.exec('ALTER TABLE messages DISABLE TRIGGER capture_conversation_message');
    assert.equal((await verifyConversationEvents(db)).ok,false);
  } finally {await db.close();}
});
