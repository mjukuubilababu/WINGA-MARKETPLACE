const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createConversationMetrics}=require('../backend/conversation-metrics');
const {createConversationOperationsStore}=require('../backend/conversation-operations-store');
const {FLAGS,readConversationProductionPolicy}=require('../backend/conversation-production-policy');
const {evaluateConversationOperations,createConversationOperationsHealth}=require('../backend/conversation-operations-health');
const {checkConversationHealth}=require('../scripts/check-conversation-health');
const fullEnv=Object.fromEntries(Object.values(FLAGS).map(key=>[key,'true']));
const privateEnv={...fullEnv,R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET_NAME:'public-fixture',R2_CONVERSATION_BUCKET_NAME:'private-fixture',
  R2_CONVERSATION_ACCESS_KEY_ID:'secret-access',R2_CONVERSATION_SECRET_ACCESS_KEY:'secret-key',R2_CONVERSATION_API_TOKEN:'secret-token',R2_CONVERSATION_ISOLATION_CONFIRMED:'true'};
const healthy=()=>({schema:{ready:true},rooms:{ok:true,schemaReady:true},
  metrics:{available:true,activePublishers:1,operations:[],lastPublishedAt:null},dispatch:{pendingOwners:0,oldestPendingAgeSeconds:0},
  push:{pending:0,exhausted:0,oldestDueAgeSeconds:0},media:{cleanupOverdue:0,oldestCleanupAgeSeconds:0}});

test('production policy preserves kill switches and identifies dependent flags',()=>{
  assert.equal(readConversationProductionPolicy(fullEnv).fullProfileEnabled,true);
  const partial=readConversationProductionPolicy({...fullEnv,WINGA_CRYPTO_DEVICES_ENABLED:'false',WINGA_ENCRYPTED_BACKUP_ENABLED:'false'});
  assert.equal(partial.fullProfileEnabled,false);assert.ok(partial.dependencyErrors.includes('mls_requires_devices'));
  assert.ok(partial.dependencyErrors.includes('multi_device_requires_recovery'));
  assert.deepEqual(readConversationProductionPolicy({}).missingFlags.sort(),Object.values(FLAGS).sort());
});

test('hourly metrics remain bounded and include Rooms without user/content dimensions',()=>{
  let time=0;const m=createConversationMetrics({now:()=>time});
  for(let i=0;i<100;i++){time=i*3600000;m.record('room-send',200,5);m.record('PRIVATE BODY',200,1);}
  const saved=m.fleetSnapshot();assert.equal(saved.buckets.length,24);assert.equal(saved.buckets[0].hour,new Date(76*3600000).toISOString());
  saved.buckets[0].count=999;assert.equal(m.fleetSnapshot().buckets[0].count,1);
  assert.equal(JSON.stringify(saved).includes('PRIVATE'),false);
  assert.notEqual(m.fleetSnapshot().runId,createConversationMetrics().fleetSnapshot().runId);
});

test('SQL publication is idempotent across retries, preserves independent boots, and prunes only old metrics',async t=>{
  const db=await (await import('./helpers/shopping-room-database.mjs')).roomDatabase(t);
  await db.exec('CREATE TABLE encrypted_conversation_messages(created_at TIMESTAMPTZ)');
  for(const sql of require('../backend/migrations/conversation-operation-metrics').statements)await db.exec(sql);
  const store=createConversationOperationsStore({withTransaction:work=>db.transaction(work)}),m=createConversationMetrics();
  m.record('send',200,10);await store.publishConversationMetrics(m.fleetSnapshot());
  await store.publishConversationMetrics(m.fleetSnapshot());
  m.record('send',200,20);await store.publishConversationMetrics(m.fleetSnapshot());
  const other=createConversationMetrics();other.record('room-send',503,8);await store.publishConversationMetrics(other.fleetSnapshot());
  assert.equal((await db.query('SELECT SUM(count)::int AS total FROM conversation_operation_metrics')).rows[0].total,3);
  await db.query(`INSERT INTO conversation_operation_metrics VALUES($1,NOW()-INTERVAL '10 days','send','success',1,1,1,NOW())`,[randomUUID()]);
  await store.publishConversationMetrics(m.fleetSnapshot());
  assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM conversation_operation_metrics')).rows[0].total,2);
  await assert.rejects(store.publishConversationMetrics({runId:randomUUID(),buckets:[{...m.fleetSnapshot().buckets[0],action:'private-username'}]}),/snapshot_invalid/);
});

test('operational ready does not certify devices, external audit, or load; failures are explicit',()=>{
  const policy=readConversationProductionPolicy(fullEnv),privateStorage={privacyVerified:true};
  const evaluate=state=>evaluateConversationOperations({state,policy,privateStorage,now:1000000});
  const ready=evaluate(healthy());assert.equal(ready.ok,true);assert.equal(ready.observation.sufficientSamples,false);
  assert.deepEqual(Object.values(ready.acceptance),[false,false,false]);
  const oldRuntime=evaluateConversationOperations({state:healthy(),policy,privateStorage,nodeVersion:'20.20.2'});
  assert.equal(oldRuntime.ok,false);assert.ok(oldRuntime.alerts.includes('conversation_runtime_unsupported'));
  for(const [part,value,alert] of [['schema',{ready:false},'conversation_schema_not_ready'],
    ['rooms',{ok:false,schemaReady:true},'room_invariants_not_ready'],
    ['dispatch',{oldestPendingAgeSeconds:61},'conversation_dispatch_delayed'],
    ['push',{oldestDueAgeSeconds:301},'conversation_push_delayed'],
    ['media',{oldestCleanupAgeSeconds:601},'conversation_media_cleanup_delayed']]) {
    const result=evaluate({...healthy(),[part]:value});assert.equal(result.ok,false);assert.ok(result.alerts.includes(alert));
  }
  const degraded=evaluate({...healthy(),metrics:{available:true,lastPublishedAt:new Date(0).toISOString(),
    operations:[{count:20,outcome:'unavailable'}]}});
  assert.ok(degraded.alerts.includes('conversation_operation_unavailability_exceeded'));
  assert.ok(degraded.alerts.includes('conversation_metrics_publisher_stale'));
});

test('combined health reads the real migrated schema and detects disabled guards and backlog',async t=>{
  const db=await (await import('./helpers/shopping-room-database.mjs')).roomDatabase(t);await db.exec(require('./helpers/conversation-event-fixture'));
  await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');
  for(const name of ['message-dispatch-outbox','message-web-push','conversation-event-ledger','conversation-security-mode',
    'conversation-crypto-devices','conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-media',
    'encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery','encrypted-device-admissions',
    'encrypted-device-lifecycle','encrypted-conversation-backups','encrypted-history-pages','encrypted-native-history',
    'encrypted-shopping-rooms','encrypted-room-preferences','encrypted-room-departures','conversation-operation-metrics']) {
    const migration=require('../backend/migrations/'+name);
    await db.transaction(async client=>{for(const sql of migration.statements)await client.exec(sql);});
    await db.query('INSERT INTO schema_migrations VALUES($1)',[migration.id]);
  }
  const store=createConversationOperationsStore({withTransaction:work=>db.transaction(work)});
  const state=await store.readConversationOperationsHealth();assert.equal(state.schema.ready,true);
  assert.equal(state.rooms.ok,true);assert.equal(state.rooms.schemaReady,true);assert.equal(state.metrics.available,true);
  assert.equal(state.push.pending,0);assert.equal(state.media.cleanupOverdue,0);
  await db.exec('ALTER TABLE encrypted_room_departures DISABLE TRIGGER guard_room_departure');
  const guarded=await store.readConversationOperationsHealth();assert.equal(guarded.rooms.schemaReady,false);
  await db.exec('ALTER TABLE encrypted_room_departures ENABLE TRIGGER guard_room_departure');
  await db.exec("INSERT INTO message_dispatch_outbox VALUES('alice',1,NOW()-INTERVAL '2 minutes')");
  const backlog=await store.readConversationOperationsHealth();assert.ok(backlog.dispatch.oldestPendingAgeSeconds>=120);
  const health=evaluateConversationOperations({state:backlog,policy:readConversationProductionPolicy(fullEnv),privateStorage:{privacyVerified:true}});
  assert.ok(health.alerts.includes('conversation_dispatch_delayed'));
});

test('health checks coalesce concurrent callers, clone cached results, and suppress private bucket errors',async()=>{
  let reads=0,checks=0,time=0;
  const read=createConversationOperationsHealth({env:privateEnv,now:()=>time,
    getStore:()=>({readConversationOperationsHealth:async()=>{reads++;return healthy();}}),
    privacyCheck:async()=>{checks++;}});
  const results=await Promise.all(Array.from({length:20},()=>read()));assert.equal(reads,1);assert.equal(checks,1);
  results[0].policy.features.media=false;assert.equal((await read()).policy.features.media,true);
  time=30001;await read();assert.equal(reads,2);
  const denied=createConversationOperationsHealth({env:privateEnv,getStore:()=>({readConversationOperationsHealth:async()=>healthy()}),
    privacyCheck:async()=>{throw Error('secret-access-provider');}});
  const result=await denied();assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('secret-access'),false);
});

test('monitor rejects credential exfiltration URLs and does not echo arbitrary response bodies',async()=>{
  const token='synthetic-ops-token';let calls=0;
  for(const url of ['https://evil.example/api/ops/conversations/health','https://winga-pflp.onrender.com.evil.example/api/ops/conversations/health',
    'https://winga-pflp.onrender.com/api/ops/conversations/health?secret=1','http://winga-pflp.onrender.com/api/ops/conversations/health']) {
    const result=await checkConversationHealth({url,token,fetchImpl:async()=>{calls++;}});assert.equal(result.ok,false);
  }
  assert.equal(calls,0);
  const state=evaluateConversationOperations({state:healthy(),privateStorage:{privacyVerified:true},policy:readConversationProductionPolicy(fullEnv)});
  const fetchImpl=async(_,options)=>{assert.equal(options.redirect,'error');assert.equal(options.headers['X-Ops-Health-Token'],token);
    return new Response(JSON.stringify({...state,secret:'DO NOT PRINT'}),{status:200,headers:{'content-type':'application/json'}});};
  const result=await checkConversationHealth({token,fetchImpl});assert.equal(result.ok,true);assert.equal(JSON.stringify(result).includes('PRINT'),false);
  const huge=await checkConversationHealth({token,fetchImpl:async()=>new Response('a'.repeat(262145),{headers:{'content-type':'application/json'}})});
  assert.equal(huge.status,'request_failed');
});
