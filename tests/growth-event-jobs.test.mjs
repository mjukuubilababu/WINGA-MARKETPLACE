import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {growthFixture} from './helpers/growth-database.mjs';
import {realPostgres} from './helpers/shopping-room-database.mjs';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {key,insertEvent}=require('../backend/growth-infrastructure');
const {enqueueGrowthEvent,createGrowthEventJobs}=require('../backend/growth-event-jobs');
const {createGrowthApi}=require('../backend/growth-api');
const pgTest=(name,fn)=>test('PostgreSQL resilience: '+name,{skip:!realPostgres,timeout:60000},fn);
async function publicDestination(f){
  let response;
  const api=createGrowthApi({findSession:()=>null,readAuthToken:()=>'',clientIp:()=> '127.0.0.1',ensureUser:()=>true,
    isAdminSession:()=>false,getStore:()=>f.store,productSharingEnabled:false,measurementEnabled:false,
    sendJson:(_res,status,body)=>{response={status,body};}});
  await api.handle({method:'GET',headers:{'user-agent':'Mozilla/5.0'}},{},new URL('http://localhost/api/growth/shares/'+f.shareId));
  assert.equal(response.status,200);assert.equal(response.body.destinationId,'p1');return response;
}
async function backlog(f,count){
  const occurredAt=new Date(Date.now()-60000).toISOString(),ids=Array.from({length:count},()=>randomUUID());
  await Promise.all(ids.map((id,i)=>f.enqueue(id,f.shareId,key('synthetic-recipient:'+i),'product_share_opened','client_observed',null,occurredAt)));
  return {ids,occurredAt};
}
async function fixture(t){
  const f=await growthFixture(t);await f.store.createGrowthShare(f.payload,f.source);
  await f.db.exec('CREATE TABLE conversation_crypto_devices(id TEXT PRIMARY KEY)');
  for(const name of ['growth-loop-invites','growth-event-jobs'])for(const sql of require('../backend/migrations/'+name).statements)await f.db.exec(sql);
  const options={query:(...args)=>f.db.query(...args),withTransaction:work=>f.db.transaction(work),enabled:true};
  const payload=[randomUUID(),f.payload.shareId,key('recipient'),'product_share_opened','client_observed'];
  const enqueue=(...args)=>f.db.transaction(c=>enqueueGrowthEvent(c,...args));
  return {...f,shareId:f.payload.shareId,payload,enqueue,jobs:createGrowthEventJobs(options),options};
}

test('durable jobs deduplicate receipt and preserve occurrence time through async delivery',async t=>{
  const f=await fixture(t),occurredAt=new Date(Date.now()-60000).toISOString();
  assert.equal(await f.enqueue(...f.payload,null,occurredAt),true);
  const durable=(await f.db.query('SELECT created_at,deadline_at FROM growth_event_jobs')).rows[0];
  assert.equal(new Date(durable.created_at).toISOString(),occurredAt);assert.equal(new Date(durable.deadline_at)-new Date(durable.created_at),86400000);
  assert.equal(await f.enqueue(...f.payload,null,new Date().toISOString()),false);
  assert.equal((await f.db.query("SELECT COUNT(*)::int AS count FROM growth_events WHERE event_type='product_share_opened'")).rows[0].count,0);
  await assert.rejects(f.enqueue(f.payload[0],f.payload[1],key('another'),...f.payload.slice(3)),{code:'growth_event_conflict'});
  assert.equal((await f.jobs.processGrowthEventJobs()).processed,1);assert.equal((await f.jobs.processGrowthEventJobs()).processed,0);
  const event=(await f.db.query('SELECT created_at FROM growth_events WHERE event_id=$1',[f.payload[0]])).rows[0];
  assert.equal(new Date(event.created_at).toISOString(),occurredAt);
  assert.equal((await f.jobs.readGrowthEventJobHealth()).states.find(r=>r.status==='completed').count,1);
});

test('analytics SQL failures retry with backoff then dead-letter; replay preserves original deadline and event identity',async t=>{
  const f=await fixture(t);await f.enqueue(...f.payload);
  const broken=createGrowthEventJobs({...f.options,eventWriter:async c=>c.query('SELECT deliberately_missing_growth_analytics_column')});
  for(let attempt=1;attempt<=6;attempt++){
    assert.equal((await broken.processGrowthEventJobs()).failed,1);
    const job=(await f.db.query('SELECT * FROM growth_event_jobs')).rows[0];assert.equal(job.attempts,attempt);
    assert.equal(job.status,attempt===6?'dead':'pending');assert.ok(new Date(job.available_at)>new Date(job.updated_at));
    if(attempt<6){assert.equal((await broken.processGrowthEventJobs()).failed,0);await f.db.query('UPDATE growth_event_jobs SET available_at=clock_timestamp()');}
  }
  const before=(await f.db.query('SELECT * FROM growth_event_jobs')).rows[0];
  assert.equal((await f.jobs.replayGrowthEventJobs([f.payload[0]])).replayed,1);
  const after=(await f.db.query('SELECT * FROM growth_event_jobs')).rows[0];assert.equal(new Date(after.deadline_at).toISOString(),new Date(before.deadline_at).toISOString());
  assert.equal(new Date(after.created_at).toISOString(),new Date(before.created_at).toISOString());assert.equal(after.event_id,before.event_id);
  assert.equal((await f.jobs.processGrowthEventJobs()).processed,1);
  assert.equal((await f.db.query("SELECT COUNT(*)::int AS count FROM growth_events WHERE event_type='product_share_opened'")).rows[0].count,1);
});

test('expired jobs cannot renew their replay lifetime and measurement kill switch leaves core records intact',async t=>{
  const f=await fixture(t);await f.enqueue(...f.payload);
  const off=createGrowthEventJobs({...f.options,enabled:false});assert.equal((await off.processGrowthEventJobs()).disabled,true);
  await f.db.exec("UPDATE growth_event_jobs SET created_at=NOW()-INTERVAL '2 days',deadline_at=NOW()-INTERVAL '1 day'");
  assert.equal((await f.jobs.processGrowthEventJobs()).processed,0);assert.equal((await f.jobs.replayGrowthEventJobs([f.payload[0]])).replayed,0);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM growth_shares')).rows[0].count,1);
  assert.equal((await f.jobs.readGrowthEventJobHealth()).states[0].status,'dead');
  await assert.rejects(f.jobs.replayGrowthEventJobs(['../private']),{code:'growth_replay_invalid'});
});

pgTest('analytics SQL outage leaves public destinations accessible and recovery keeps original identities',async t=>{
  const f=await fixture(t),batch=await backlog(f,8);
  const before=(await f.db.query('SELECT event_id,created_at,deadline_at FROM growth_event_jobs ORDER BY event_id')).rows;
  const broken=createGrowthEventJobs({...f.options,eventWriter:async client=>client.query('SELECT deliberately_missing_growth_analytics_column')});
  assert.equal((await broken.processGrowthEventJobs()).failed,8);
  await Promise.all(Array.from({length:24},()=>publicDestination(f)));
  assert.equal((await f.db.query("SELECT COUNT(*)::int AS n FROM growth_events WHERE event_type='product_share_opened'")).rows[0].n,0);
  const pending=(await f.db.query('SELECT status,attempts,available_at,updated_at FROM growth_event_jobs')).rows;
  assert.ok(pending.every(j=>j.status==='pending'&&j.attempts===1&&new Date(j.available_at)>new Date(j.updated_at)));
  assert.equal((await broken.processGrowthEventJobs()).failed,0);
  // Make only this fixture's delayed retry eligible; retain occurrence/deadline.
  await f.db.query('UPDATE growth_event_jobs SET available_at=clock_timestamp()');
  const recovered=createGrowthEventJobs(f.options);assert.equal((await recovered.processGrowthEventJobs()).processed,8);
  assert.deepEqual((await f.db.query('SELECT event_id,created_at,deadline_at FROM growth_event_jobs ORDER BY event_id')).rows,before);
  const events=(await f.db.query("SELECT event_id,created_at FROM growth_events WHERE event_type='product_share_opened'")).rows;
  assert.deepEqual(events.map(e=>e.event_id).sort(),batch.ids.sort());
  assert.ok(events.every(e=>new Date(e.created_at).toISOString()===batch.occurredAt));
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n,4);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM orders')).rows[0].n,0);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM product_likes')).rows[0].n,0);
  t.diagnostic('8 failed analytics writes, 24 successful canonical public resolves, 8 original events recovered; no orders or saves.');
});

pgTest('two workers partition a 60-event backlog while public reads bypass held analytics locks',async t=>{
  const f=await fixture(t),batch=await backlog(f,60);
  let announce,release,first=true;
  const entered=new Promise(resolve=>{announce=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const held=createGrowthEventJobs({...f.options,eventWriter:async(...args)=>{
    const result=await insertEvent(...args);if(first){first=false;announce();await gate;}return result;
  }});
  const processing=held.processGrowthEventJobs({batchSize:999});
  try{
    await Promise.race([entered,processing.then(()=>{throw Error('fixture worker completed before holding a job');})]);
    await Promise.all(Array.from({length:24},()=>publicDestination(f)));
    const other=await f.jobs.processGrowthEventJobs({batchSize:50});assert.equal(other.processed,10);
    release();assert.equal((await processing).processed,50);
    assert.equal((await f.jobs.processGrowthEventJobs()).processed,0);
    const rows=(await f.db.query("SELECT event_id FROM growth_events WHERE event_type='product_share_opened'")).rows;
    assert.deepEqual(rows.map(r=>r.event_id).sort(),batch.ids.sort());
    const states=(await f.db.query('SELECT status,attempts FROM growth_event_jobs')).rows;
    assert.equal(states.length,60);assert.ok(states.every(s=>s.status==='completed'&&s.attempts===0));
  }finally{release();await processing;}
  t.diagnostic('60 events partitioned 50/10; batch size capped at 50; 24 canonical reads succeeded during held transaction.');
});

pgTest('killing the owned worker after an uncommitted insert rolls back and a fresh worker drains once',async t=>{
  const f=await fixture(t);await f.enqueue(...f.payload,null,new Date(Date.now()-60000).toISOString());
  const schema=(await f.db.query('SELECT current_schema() AS name')).rows[0].name;
  const env={...process.env,WINGA_TEST_GROWTH_SCHEMA:schema};delete env.NODE_TEST_CONTEXT;
  const child=fork(fileURLToPath(new URL('./helpers/growth-event-crash-worker.cjs',import.meta.url)),[],{env,stdio:['ignore','ignore','ignore','ipc']});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  try{
  let timeout;
  const ready=await Promise.race([
    new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('fixture exited before its insertion')));}),
    new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('fixture insertion deadline')),10000);})
  ]).finally(()=>clearTimeout(timeout));
  assert.equal(ready.stage,'uncommitted_insert');
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM growth_events WHERE event_id=$1',[f.payload[0]])).rows[0].n,0);
  await publicDestination(f);
  child.kill('SIGKILL');assert.equal((await exited).signal,'SIGKILL');
  // Observe PostgreSQL's actual socket-close rollback, not an arbitrary delay.
  const deadline=Date.now()+5000;
  while((await f.db.admin.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[ready.pid])).rows.length){
    if(Date.now()>deadline)assert.fail('Owned worker backend did not close');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  const job=(await f.db.query('SELECT status,attempts FROM growth_event_jobs')).rows[0];assert.deepEqual(job,{status:'pending',attempts:0});
  const fresh=createGrowthEventJobs(f.options);assert.equal((await fresh.processGrowthEventJobs()).processed,1);
  assert.equal((await fresh.processGrowthEventJobs()).processed,0);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM growth_events WHERE event_id=$1',[f.payload[0]])).rows[0].n,1);
  await publicDestination(f);
  t.diagnostic('Owned Node worker SIGKILL after SQL insertion; actual backend rollback observed; original event accepted once after recovery.');
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;}
});

pgTest('a lost post-commit response never repeats an already completed measurement event',async t=>{
  const f=await fixture(t);await f.enqueue(...f.payload);
  const uncertain=createGrowthEventJobs({...f.options,withTransaction:async work=>{
    await f.db.transaction(work);throw Object.assign(Error('synthetic committed response loss'),{code:'fixture_commit_reply_lost'});
  }});
  await assert.rejects(uncertain.processGrowthEventJobs(),{code:'fixture_commit_reply_lost'});
  const before=(await f.db.query('SELECT event_id,status,created_at,deadline_at FROM growth_event_jobs')).rows;
  assert.equal(before[0].status,'completed');
  assert.equal((await createGrowthEventJobs(f.options).processGrowthEventJobs()).processed,0);
  assert.equal(await f.enqueue(...f.payload),false);
  assert.deepEqual((await f.db.query('SELECT event_id,status,created_at,deadline_at FROM growth_event_jobs')).rows,before);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM growth_events WHERE event_id=$1',[f.payload[0]])).rows[0].n,1);
  await publicDestination(f);
});
