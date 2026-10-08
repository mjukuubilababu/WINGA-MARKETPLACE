const test=require('node:test'),assert=require('node:assert/strict');
const {readConversationTransportHealth:read}=require('../backend/conversation-transport-health');
const env={WINGA_PHOENIX_TRANSPORT_ENABLED:'true',CONVERSATION_SERVICE_TOKEN:'s'.repeat(32)};
test('transport health never sends control credentials to an untrusted origin or redirect',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error();};
  for(const url of ['https://evil.example/ops/health','https://winga-phoenix.onrender.com.evil.example/ops/health',
    'https://winga-phoenix.onrender.com/ops/health?secret=1','http://winga-phoenix.onrender.com/ops/health'])
    assert.equal((await read({env:{...env,CONVERSATION_TRANSPORT_OPS_URL:url},fetchImpl})).available,false);
  assert.equal(calls,0);
});
test('transport gauges are whitelisted and unavailable values never become healthy zeros',async()=>{
  const result=await read({env,fetchImpl:async(url,options)=>{
    assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+env.CONVERSATION_SERVICE_TOKEN);
    return new Response(JSON.stringify({ok:true,privacy:'aggregate-only',scope:'phoenix-node-since-start',secret:'PRIVATE',
      connectionGaugeComplete:true,connections:3,beamMemoryBytes:4000,schedulerUtilization:0.2,
      counters:[{event:'send_accepted',count:5,averageDurationMs:20},{event:'PRIVATE',count:1}]}));
  }});
  assert.equal(result.available,true);assert.equal(result.connections,3);assert.equal(result.queuedMessages,null);
  assert.equal(result.counters.length,1);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  const huge=await read({env,fetchImpl:async()=>new Response('a'.repeat(32769))});assert.equal(huge.available,false);
});
