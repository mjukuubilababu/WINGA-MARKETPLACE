import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {resolutionFixture} from './helpers/demand-resolution.mjs';
import {realPostgres} from './helpers/shopping-room-database.mjs';
const require=createRequire(import.meta.url);
const {createDemandResolution}=require('../backend/demand-resolution');

test('twelve concurrent subscription retries and eight workers keep one request, transition and notice',async t=>{
  const {db,store}=await resolutionFixture(t),input={userId:'buyer',audienceKey:'buyer-key',query:'white dress'};
  const started=performance.now(),requests=await Promise.all(Array.from({length:12},()=>store.subscribeSearchDemand(input)));
  assert.equal(new Set(requests.map(r=>r.goalId)).size,1);assert.equal(requests.filter(r=>!r.duplicate).length,1);
  const workers=await Promise.all(Array.from({length:8},()=>store.processDemandResolutions()));
  assert.equal(workers.reduce((sum,r)=>sum+r.processed,0),1);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n,1);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM commerce_goal_transitions WHERE to_status='matched'")).rows[0].n,1);
  t.diagnostic(`${realPostgres?'PostgreSQL multi-connection':'PGlite serialized'} bounded retry/worker exercise: ${Math.round(performance.now()-started)}ms; no regional SLO claim.`);
});

test('eight worker bursts over sixty requests preserve the shared per-recipient cap and later recovery',async t=>{
  const {db,store}=await resolutionFixture(t);
  await db.exec(`INSERT INTO users SELECT 'recipient-'||n,'active' FROM generate_series(1,6) n;
    INSERT INTO products SELECT 'burst-product-'||n,'approved','seller','available',NOW() FROM generate_series(1,10) n;
    INSERT INTO commerce_goals(goal_id,user_id,product_id,metadata)
      SELECT 'burst-'||n,'recipient-'||(((n-1)%6)+1),'burst-product-'||(((n-1)/6)+1),
        '{"source":"sold_out_demand","notificationConsent":true,"notificationMode":"in_app"}'::jsonb
      FROM generate_series(1,60) n;`);
  const started=performance.now();
  const results=await Promise.all(Array.from({length:8},()=>store.processDemandResolutions({batchSize:5000})));
  assert.equal(results.reduce((sum,r)=>sum+r.processed,0),12);
  const counts=(await db.query('SELECT user_id,COUNT(*)::int AS n FROM notifications GROUP BY user_id')).rows;
  assert.equal(counts.length,6);assert.ok(counts.every(r=>r.n===2));
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM commerce_goals WHERE status='looking'")).rows[0].n,48);
  assert.equal((await store.processDemandResolutions()).processed,0);
  await db.exec("UPDATE notifications SET created_at=NOW()-INTERVAL '25 hours'");
  assert.equal((await store.processDemandResolutions()).processed,12);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM commerce_goals WHERE status='matched'")).rows[0].n,24);
  t.diagnostic(`${realPostgres?'PostgreSQL multi-connection':'PGlite serialized'} 60-request/8-worker fixture: ${Math.round(performance.now()-started)}ms; bounded synthetic capacity only.`);
});

test('notification outage rolls back an entire worker batch and recovery delivers each goal once',async t=>{
  const {db,store}=await resolutionFixture(t);
  await db.exec(`INSERT INTO products VALUES('second-product','approved','seller','available',NOW());
    INSERT INTO commerce_goals(goal_id,user_id,product_id,metadata) VALUES
    ('outage-one','buyer','new-dress','{"source":"sold_out_demand","notificationConsent":true,"notificationMode":"in_app"}'),
    ('outage-two','buyer','second-product','{"source":"sold_out_demand","notificationConsent":true,"notificationMode":"in_app"}');
    CREATE FUNCTION fail_second_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF (SELECT COUNT(*) FROM notifications)>0 THEN RAISE EXCEPTION 'isolated notification outage'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER notice_outage BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_second_notice();`);
  await assert.rejects(store.processDemandResolutions(),/isolated notification outage/);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n,0);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM commerce_goals WHERE status='matched'")).rows[0].n,0);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM commerce_goal_transitions WHERE to_status='matched'")).rows[0].n,0);
  await db.exec('DROP TRIGGER notice_outage ON notifications');
  assert.equal((await store.processDemandResolutions()).processed,2);
  assert.equal((await store.processDemandResolutions()).processed,0);
});

test('stop is retry-safe under worker bursts and withdrawn/expired supply cannot notify',async t=>{
  const {db,store}=await resolutionFixture(t);
  const goal=await store.subscribeSearchDemand({userId:'buyer',audienceKey:'buyer-key',query:'white dress'});
  const stopped=await store.resolveCommerceGoal(goal.goalId,'buyer','stopped');assert.equal(stopped.status,'stopped');
  const stoppedRetries=await Promise.all(Array.from({length:8},()=>store.resolveCommerceGoal(goal.goalId,'buyer','stopped')));
  assert.ok(stoppedRetries.every(r=>r.duplicate));
  const results=await Promise.all(Array.from({length:4},()=>store.processDemandResolutions()));
  assert.ok(results.every(r=>r.processed===0));
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n,0);
  await db.exec(`INSERT INTO search_demand_events SELECT 'renewed',query_key,detected_category,detected_color,region,audience_type,audience_key,NOW()+INTERVAL '1 second',zero_result,result_count,location FROM search_demand_events;`);
  await store.subscribeSearchDemand({userId:'buyer',audienceKey:'buyer-key',query:'white dress'});
  await db.exec("UPDATE supply_responses SET status='withdrawn'");assert.equal((await store.processDemandResolutions()).processed,0);
  await db.exec("UPDATE supply_responses SET status='active';UPDATE rediscovery_eligibility SET expires_at=NOW()-INTERVAL '1 second'");
  assert.equal((await store.processDemandResolutions()).processed,0);
  await db.exec("UPDATE rediscovery_eligibility SET expires_at=NOW()+INTERVAL '1 day'");
  assert.equal((await store.processDemandResolutions()).processed,1);
});

test('Phase 3 kill switch touches no database and core inventory remains readable during notification failure',async t=>{
  const disabled=createDemandResolution({enabled:false,withTransaction:()=>{throw Error('must not read/write');}});
  assert.deepEqual(await disabled.processDemandResolutions(),{processed:0,disabled:true});
  await assert.rejects(disabled.subscribeSearchDemand({userId:'buyer',query:'dress'}),{code:'demand_resolution_disabled'});
  const {db,store}=await resolutionFixture(t);
  await store.subscribeSearchDemand({userId:'buyer',audienceKey:'buyer-key',query:'white dress'});
  await db.exec('ALTER TABLE notifications RENAME TO notifications_unavailable');
  await assert.rejects(store.processDemandResolutions(),/notifications/);
  assert.equal((await db.query("SELECT id FROM products WHERE status='approved' AND availability='available'")).rows[0].id,'new-dress');
  assert.equal((await db.query('SELECT status FROM commerce_goals')).rows[0].status,'looking');
  await db.exec('ALTER TABLE notifications_unavailable RENAME TO notifications');
  assert.equal((await store.processDemandResolutions()).processed,1);
});
