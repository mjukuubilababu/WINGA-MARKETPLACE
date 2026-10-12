import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {growthFixture} from './helpers/growth-database.mjs';
const require=createRequire(import.meta.url);
const {key,insertEvent}=require('../backend/growth-infrastructure');
const {enqueueGrowthEvent,createGrowthEventJobs}=require('../backend/growth-event-jobs');
async function fixture(t){
  const f=await growthFixture(t);await f.store.createGrowthShare(f.payload,f.source);
  await f.db.exec('CREATE TABLE conversation_crypto_devices(id TEXT PRIMARY KEY)');
  for(const name of ['growth-loop-invites','growth-event-jobs'])for(const sql of require('../backend/migrations/'+name).statements)await f.db.exec(sql);
  const options={query:(...args)=>f.db.query(...args),withTransaction:work=>f.db.transaction(work),enabled:true};
  const payload=[randomUUID(),f.payload.shareId,key('recipient'),'product_share_opened','client_observed'];
  const enqueue=(...args)=>f.db.transaction(c=>enqueueGrowthEvent(c,...args));
  return {...f,payload,enqueue,jobs:createGrowthEventJobs(options),options};
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
