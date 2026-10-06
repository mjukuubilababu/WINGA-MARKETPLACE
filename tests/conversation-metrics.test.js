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
