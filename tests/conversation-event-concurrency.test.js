const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { Pool, Client } = require('pg');
const migration = require('../backend/migrations/conversation-event-ledger');
const progressMigration = require('../backend/migrations/conversation-delivery-progress');
const { createConversationEventStore } = require('../backend/conversation-event-ledger');
const fixtureSql = require('./helpers/conversation-event-fixture');
const {createPostgresStore}=require('../backend/db');
const {verifyConversationEvents}=require('../backend/verify-conversation-events');

// Never fall back to DATABASE_URL: this suite writes only its own disposable local schema.
const connectionString = process.env.WINGA_TEST_POSTGRES_URL;
if (!connectionString) throw new Error('WINGA_TEST_POSTGRES_URL is required; use a disposable localhost PostgreSQL cluster.');
const target = new URL(connectionString);
if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname)
  || target.search || target.hash) throw new Error('Only an explicit localhost test database URL without options is permitted.');
const context = (deviceId='b1') => ({owner:'bob',token:deviceId,deviceId});

async function transaction(client, work) {
  await client.query('BEGIN');
  try { const result=await work(client); await client.query('COMMIT'); return result; }
  catch(error) { await client.query('ROLLBACK'); throw error; }
}
async function fixture(t, canonical=false) {
  const schema='winga_event_test_'+randomBytes(10).toString('hex');
  const admin=new Client({connectionString,connectionTimeoutMillis:5000});
  await admin.connect();
  const pool=new Pool({connectionString,max:12,connectionTimeoutMillis:5000,
    options:`-c search_path=${schema},public -c statement_timeout=10000 -c lock_timeout=7000`});
  const held=[];
  t.after(async()=>{
    for(const client of held) { await client.query('ROLLBACK').catch(()=>{}); client.release(); }
    await pool.end();
    try { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const bootstrap=await pool.connect();
  try {
    if(!canonical) {
      await bootstrap.query(fixtureSql);
      await transaction(bootstrap,async client=>{
        for(const sql of [...migration.statements,...progressMigration.statements]) await client.query(sql);
      });
    }
  } finally {bootstrap.release();}
  const live=canonical?createPostgresStore({queryClient:pool}):null;
  if(live) await live.init();
  const storeFor=client=>createConversationEventStore({withTransaction:work=>transaction(client,work)});
  const store=createConversationEventStore({withTransaction:async work=>{
    const client=await pool.connect();
    try{return await transaction(client,work);}finally{client.release();}
  }});
  const client=async()=>{const c=await pool.connect();held.push(c);return c;};
  const blocked=async(waiter,blocker)=>{
    for(let n=0;n<150;n++) {
      const r=await admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[blocker.processID,waiter.processID]);
      if(r.rows[0].blocked)return;
      await delay(20);
    }
    assert.fail('Expected independent connection to wait for the held transaction lock');
  };
  const poll=(device='b1')=>store.pollConversationDeviceEvents(context(device));
  const ack=(batch,device='b1')=>store.acknowledgeConversationDeviceEvents(context(device),{deviceId:device,eventIds:batch.events.map(e=>e.id)});
  return {pool,store,storeFor,client,blocked,poll,ack,live};
}

test('independent writers allocate contiguous positions and fan out once per device',async t=>{
  const f=await fixture(t);
  await f.poll();await f.poll('b2');
  await Promise.all(Array.from({length:24},(_,i)=>f.pool.query(
    "INSERT INTO messages(id,sender_id,receiver_id) VALUES($1,'alice','bob')",['parallel-'+i])));
  const events=(await f.pool.query('SELECT e.position::text FROM conversation_events e ORDER BY e.position')).rows;
  assert.deepEqual(events.map(e=>e.position),Array.from({length:26},(_,i)=>String(i+1)));
  const counts=(await f.pool.query('SELECT device_id,COUNT(*)::int AS n FROM conversation_device_deliveries GROUP BY device_id')).rows;
  assert.equal(counts.length,2);assert.ok(counts.every(row=>row.n===26));
});

test('concurrent duplicate ACK and polls preserve another device obligations',async t=>{
  const f=await fixture(t),first=await f.poll();await f.poll('b2');
  await Promise.all([f.ack(first),f.ack(first),f.poll()]);
  assert.equal((await f.poll()).events.length,0);
  assert.equal((await f.poll('b2')).events.length,2);
  assert.equal((await f.pool.query("SELECT is_delivered FROM messages WHERE id='legacy'")).rows[0].is_delivered,false);
});

test('ACK pruning and concurrent replay preserve pending work on another device',async t=>{
  const f=await fixture(t),first=await f.poll();await f.poll('b2');
  await f.ack(first);
  await f.pool.query("UPDATE conversation_device_deliveries SET acknowledged_at=NOW()-INTERVAL '8 days' WHERE device_id='b1'");
  const [pruned,replayed]=await Promise.all([
    f.store.pruneAcknowledgedConversationDeliveries({retentionDays:7,batchSize:1}),f.poll()
  ]);
  assert.ok(pruned.pruned<=1);
  assert.deepEqual(replayed.events,[]);
  await f.store.pruneAcknowledgedConversationDeliveries({retentionDays:7});
  assert.deepEqual((await f.poll()).events,[]);
  await f.ack(first);
  assert.equal((await f.poll('b2')).events.length,first.events.length);
});

for(const operation of ['poll','ack']) test(`${operation} waiting behind a block cannot return or acknowledge hidden events`,async t=>{
  const f=await fixture(t),batch=await f.poll(),blocker=await f.client(),waiter=await f.client();
  await blocker.query('BEGIN');await blocker.query("INSERT INTO user_blocks VALUES('alice','bob')");
  const store=f.storeFor(waiter);
  const pending=operation==='poll'?store.pollConversationDeviceEvents(context()):store.acknowledgeConversationDeviceEvents(context(),{deviceId:'b1',eventIds:batch.events.map(e=>e.id)});
  pending.catch(()=>{});
  await f.blocked(waiter,blocker);await blocker.query('COMMIT');
  if(operation==='poll') {const result=await pending;assert.deepEqual(result.events,[]);assert.deepEqual(result.items,[]);}
  else await assert.rejects(pending,{status:409});
});

test('session revocation wins over an ACK waiting for session authorization',async t=>{
  const f=await fixture(t),batch=await f.poll(),revoke=await f.client(),waiter=await f.client();
  await revoke.query('BEGIN');await revoke.query("DELETE FROM sessions WHERE session_id='b1'");
  const pending=f.storeFor(waiter).acknowledgeConversationDeviceEvents(context(),{deviceId:'b1',eventIds:batch.events.map(e=>e.id)});
  pending.catch(()=>{});await f.blocked(waiter,revoke);await revoke.query('COMMIT');
  await assert.rejects(pending,{status:401});
  const rows=(await f.pool.query("SELECT acknowledged_at,cancelled_at FROM conversation_device_deliveries WHERE device_id='b1'")).rows;
  assert.ok(rows.every(row=>!row.acknowledged_at && row.cancelled_at));
});

test('rolled back edits cannot leak content or consume sequence positions through a waiting poll',async t=>{
  const f=await fixture(t);await f.poll();
  const edit=await f.client(),waiter=await f.client();
  await edit.query('BEGIN');await edit.query("UPDATE messages SET message='never committed' WHERE id='legacy'");
  const pending=f.storeFor(waiter).pollConversationDeviceEvents(context());pending.catch(()=>{});
  await f.blocked(waiter,edit);await edit.query('ROLLBACK');
  const result=await pending;
  assert.equal(result.items[0].message,'private text');
  assert.equal(result.events.length,2);
  assert.equal((await f.pool.query('SELECT position::text FROM conversation_event_streams')).rows[0].position,'2');
});

test('a late commit in another conversation is not skipped after a prior batch ACK',async t=>{
  const f=await fixture(t);await f.ack(await f.poll());
  const late=await f.client();await late.query('BEGIN');
  await late.query("INSERT INTO messages(id,sender_id,receiver_id) VALUES('late','eve','bob')");
  await f.pool.query("INSERT INTO messages(id,sender_id,receiver_id) VALUES('early','alice','bob')");
  const first=await f.poll();assert.deepEqual(first.items.map(m=>m.id),['early']);await f.ack(first);
  await late.query('COMMIT');
  const second=await f.poll();assert.deepEqual(second.items.map(m=>m.id),['late']);
  await f.ack(second);assert.equal((await f.poll()).events.length,0);
});

test('migration locks close the backfill to trigger installation write gap',async t=>{
  const f=await fixture(t),migrate=await f.client(),writer=await f.client();
  await migrate.query('BEGIN');await migrate.query(migration.statements[0]);
  const pending=writer.query("INSERT INTO messages(id,sender_id,receiver_id) VALUES('during-migration','alice','bob')");
  pending.catch(()=>{});await f.blocked(writer,migrate);
  for(const sql of migration.statements.slice(1)) await migrate.query(sql);
  await migrate.query('COMMIT');await pending;
  assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM conversation_events WHERE message_id='during-migration'")).rows[0].n,1);
});

test('registration racing with event commit is repaired by lazy per-device backfill',async t=>{
  const f=await fixture(t),register=await f.client();
  await register.query('BEGIN');
  await register.query("INSERT INTO conversation_delivery_devices(device_id,owner_id) VALUES('b1','bob')");
  await f.pool.query("INSERT INTO messages(id,sender_id,receiver_id) VALUES('registration-race','alice','bob')");
  assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM conversation_device_deliveries WHERE device_id='b1'")).rows[0].n,0);
  await register.query('COMMIT');
  const batch=await f.poll();
  assert.ok(batch.items.some(m=>m.id==='registration-race'));
  assert.equal(batch.events.length,3);
  await f.ack(batch);assert.equal((await f.poll()).events.length,0);
});

for (const revoked of ['session', 'device']) test(`canonical transport send waits for and respects committed ${revoked} revocation`, async t => {
  const f = await fixture(t, true);
  await f.pool.query(`INSERT INTO users(username,password,phone_number,primary_category,role,created_at)
    VALUES('alice','no-login','synthetic-a','general','seller',NOW()),
          ('bob','no-login','synthetic-b','general','buyer',NOW());
    INSERT INTO sessions(token,session_id,username,expires_at) VALUES('a1','a1','alice',9999999999999);
    INSERT INTO conversation_delivery_devices(device_id,owner_id) VALUES('a1','alice');`);
  const blocker = await f.client(), waiter = await f.client();
  await blocker.query('BEGIN');
  await blocker.query(revoked === 'session'
    ? "DELETE FROM sessions WHERE session_id='a1'"
    : "UPDATE conversation_delivery_devices SET revoked_at=NOW() WHERE device_id='a1'");
  const writer = createPostgresStore({queryClient: {query: waiter.query.bind(waiter)}});
  const pending = writer.createMessageWithNotification({
    id: 'must-not-commit', senderId: 'alice', receiverId: 'bob',
    message: 'synthetic revoked send', createdAt: new Date().toISOString()
  }, null, {authorization: {token: 'a1', owner: 'alice', deviceId: 'a1', requireRegisteredDevice: true}});
  pending.catch(() => {});
  await f.blocked(waiter, blocker);
  await blocker.query('COMMIT');
  assert.deepEqual(await pending, {created: false, code: 'message_unauthorized'});
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n, 0);
});

test('full canonical bootstrap, Stored/Read, snapshot restore and deletion work on real PostgreSQL',async t=>{
  const f=await fixture(t,true),store=f.live;
  await f.pool.query(`INSERT INTO users(username,password,phone_number,primary_category,role,created_at)
    VALUES('alice','not-a-login','synthetic-a','general','seller',NOW()),('bob','not-a-login','synthetic-b','general','buyer',NOW());
    INSERT INTO sessions(token,session_id,username,expires_at) VALUES('b1','b1','bob',9999999999999);`);
  const result=await store.createMessageWithNotification({id:'canonical',senderId:'alice',receiverId:'bob',
    message:'synthetic canonical message',createdAt:new Date().toISOString()});
  assert.equal(result.created,true);
  const batch=await f.poll();assert.equal(batch.items.length,1);
  for(const kind of ['stored','read']) await store.acknowledgeMessageDevice({...context(),payload:{
    deviceId:'b1',kind,withUser:'alice',messageIds:['canonical']}});
  const before=(await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_events')).rows[0].n;
  const snapshot=await store.readStore();
  await store.writeStore(snapshot);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_events')).rows[0].n,before);
  const restored=await f.poll();
  assert.equal(restored.items[0].isRead,true);
  assert.equal(restored.items[0].isDelivered,true);
  await f.ack(restored);
  assert.equal((await store.deleteMessage('canonical','alice')).deleted,true);
  const deleted=await f.poll();assert.equal(deleted.items.length,0);
  assert.equal(deleted.events[0].kind,'message_deleted');assert.equal(deleted.events[0].tombstone,true);
  assert.equal((await verifyConversationEvents(f.pool)).ok,true);
});
