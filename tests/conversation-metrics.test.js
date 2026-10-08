const test=require('node:test'),assert=require('node:assert/strict');
const {createConversationMetrics,ACTIONS}=require('../backend/conversation-metrics');
const {createEncryptedConversationsApi}=require('../backend/encrypted-conversations-api');
test('metrics whitelist dimensions, bound storage and never retain caller content or identifiers',()=>{
  const metrics=createConversationMetrics({now:()=>0});
  metrics.record('send',200,20);metrics.record('send',200,40);metrics.record('send',503,100);
  metrics.record('SECRET USER BODY',200,1);metrics.record('send',0,1);metrics.record('send',200,NaN);
  const result=metrics.snapshot();assert.equal(result.scope,'process-since-start');
  assert.equal(result.operations.length,2);assert.equal(result.operations[0].count,2);
  assert.equal(result.operations[0].averageDurationMs,30);
  result.operations[0].count=500;assert.equal(metrics.snapshot().operations[0].count,2);
  for(let i=0;i<10000;i++)metrics.record('arbitrary-'+i,200,1);
  for(const action of ACTIONS)for(const status of [200,403,429,503])metrics.record(action,status,1e10);
  assert.equal(metrics.snapshot().operations.length,ACTIONS.length*4);
  assert.ok(metrics.snapshot().operations.every(v=>v.maxDurationMs<=300000));
  assert.equal(JSON.stringify(metrics.snapshot()).includes('SECRET'),false);
});
test('encrypted API metrics record durable success and safe errors; telemetry failure cannot fail sending',async()=>{
  let result,fail=false,metricFailure=false;
  const metrics=createConversationMetrics();
  const api=createEncryptedConversationsApi({enabled:true,findSession:()=>({token:'SECRET',sessionId:'device'}),
    readAuthToken:()=>'',ensureMarketplaceUser:()=>({username:'PRIVATE'}),
    collectBody:async()=>({action:'send',payload:{ciphertext:'PRIVATE CONTENT'}}),
    getPostgresStore:()=>({encryptedOperation:async()=>{if(fail)throw {status:429,code:'limited'};return {status:'sent'};}}),
    sendJson:(_,status,body)=>{result={status,body};},
    metrics:{record(...args){if(metricFailure)throw Error('metric unavailable');metrics.record(...args);}}});
  const url=new URL('https://localhost/api/conversations/encrypted/operations');
  await api.handle({method:'POST'},{},url);assert.deepEqual(result,{status:200,body:{status:'sent'}});
  fail=true;await api.handle({method:'POST'},{},url);assert.equal(result.status,429);
  assert.deepEqual(metrics.snapshot().operations.map(v=>v.outcome),['success','limited']);
  metricFailure=true;fail=false;await api.handle({method:'POST'},{},url);assert.equal(result.status,200);
  assert.equal(JSON.stringify(metrics.snapshot()).includes('PRIVATE'),false);
});

test('dashboard projects populated server and client observations with explicit unobserved values',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),context={window:{WingaModules:{admin:{}}}};
  const source=fs.readFileSync(require.resolve('../src/admin/controller.js'),'utf8').replace('return { renderAdminView };','return { renderAdminView, buildOpsSignalLines };');
  vm.runInNewContext(source,context);
  const controller=context.window.WingaModules.admin.createAdminControllerModule({translate:(_key,variables,fallback)=>Object.entries(variables||{}).reduce((s,[key,value])=>s.replace('{'+key+'}',value),fallback)});
  const empty=controller.buildOpsSignalLines({}).filter(row=>row.type.startsWith('conversation-'));
  assert.equal(empty.filter(row=>row.type==='conversation-operation').length,5);
  assert.ok(empty.some(row=>row.value.includes('unobserved')));
  const populated=controller.buildOpsSignalLines({conversations:{metrics:{available:true,operations:[{action:'protocol-error',outcome:'rejected',count:7,averageDurationMs:9,maxDurationMs:10}]},
    observation:{samples:20,sendAccepted:15,sendAttempts:20,sendAttemptAcceptanceRate:0.75},multiDevice:{samples:3,averageSyncDelayMs:42},
    media:{cleanupOverdue:2,oldestCleanupAgeSeconds:11},experience:{metrics:[{name:'transport-reconnect',count:48}]}}});
  assert.ok(populated.find(row=>row.type==='conversation-acceptance').value.includes('75%'));
  assert.ok(populated.find(row=>row.type==='conversation-operation'&&row.value.includes('protocol-error')).value.includes(': 7;'));
  assert.ok(populated.find(row=>row.type==='conversation-sync-delay').value.includes('42 ms'));
  assert.ok(populated.find(row=>row.type==='conversation-media-cleanup').value.includes('11000 ms'));
  assert.ok(populated.find(row=>row.type==='conversation-reconnect-rate').value.includes('2 per hour'));
});

test('authenticated encrypted media failures record only fixed dimensions without object or error details',async()=>{
  const metrics=createConversationMetrics(),{createEncryptedMediaApi}=require('../backend/encrypted-media-api');
  const object={id:require('node:crypto').randomUUID(),bytes:40,sha256:'a'.repeat(64)},proof=Buffer.from(JSON.stringify({payload:object})).toString('base64url');
  const api=createEncryptedMediaApi({enabled:true,metrics,findSession:()=>({token:'PRIVATE',sessionId:'PRIVATE'}),readAuthToken:()=>'',ensureMarketplaceUser:()=>({username:'PRIVATE'}),
    getPostgresStore:()=>({authorizeEncryptedMedia:async()=>{throw {status:503,code:'private_media_unavailable',message:'PRIVATE'};}}),sendJson:()=>{}});
  for(const method of ['GET','PUT'])await api.handle({method,headers:{'x-winga-crypto-proof':proof}},{},new URL('https://localhost/api/conversations/encrypted/media/'+object.id));
  assert.deepEqual(metrics.snapshot().operations.map(row=>row.action),['media-download','media-upload']);
  assert.ok(metrics.snapshot().operations.every(row=>row.outcome==='unavailable'&&row.count===1));
  assert.equal(JSON.stringify(metrics.snapshot()).includes(object.id),false);assert.equal(JSON.stringify(metrics.snapshot()).includes('PRIVATE'),false);
});
