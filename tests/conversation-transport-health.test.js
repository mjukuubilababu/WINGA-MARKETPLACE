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

function sample(change={}) {
  return {ok:true,privacy:'aggregate-only',scope:'phoenix-node-since-start',...change};
}
async function observe(data) {
  return read({env,fetchImpl:async()=>new Response(JSON.stringify(data))});
}

test('native encrypted operation counters survive projection without implying plaintext mode or message counts',async()=>{
  const result=await observe(sample({supportedOperationModes:['PRIVATE','signed-native-operation','legacy-message','signed-native-operation'],
    counters:[{event:'native_confirmed',count:7,averageDurationMs:11,deviceId:'PRIVATE'},
      {event:'native_unknown',count:2,averageDurationMs:13},{event:'PRIVATE',count:99}]}));
  assert.deepEqual(result.supportedOperationModes,['legacy-message','signed-native-operation']);
  assert.equal(result.securityModeScope,'legacy-message-command-only');
  assert.deepEqual(result.counters,[{event:'native_confirmed',count:7,averageDurationMs:11},
    {event:'native_unknown',count:2,averageDurationMs:13}]);
  assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  assert.equal(result.reconnectRate,null);assert.equal(result.resumeSuccessRate,null);
});

test('impossible integer gauges and scheduler utilization remain unobserved',async()=>{
  for(const invalid of [-1,0.5,'4',null,Number.MAX_SAFE_INTEGER+1]) {
    const result=await observe(sample({connectionGaugeComplete:true,connections:invalid,queuedMessages:invalid,beamMemoryBytes:invalid}));
    for(const field of ['connections','queuedMessages','beamMemoryBytes'])assert.equal(result[field],null);
  }
  for(const invalid of [-0.1,1.01,'0.2',null])
    assert.equal((await observe(sample({schedulerUtilization:invalid}))).schedulerUtilization,null);
  const valid=await observe(sample({connectionGaugeComplete:true,connections:0,queuedMessages:0,beamMemoryBytes:1,schedulerUtilization:1}));
  assert.equal(valid.connections,0);assert.equal(valid.queuedMessages,0);assert.equal(valid.schedulerUtilization,1);
  assert.equal((await observe(sample({connectionGaugeComplete:false,connections:3}))).connections,null);
});

test('duplicate or malformed fixed counters cannot inflate transport observations',async()=>{
  const result=await observe(sample({counters:[null,[],{event:'native_confirmed',count:8,averageDurationMs:10},
    {event:'native_confirmed',count:8,averageDurationMs:10},{event:'native_unknown',count:'2'},
    {event:'poll_success',count:1.5},{event:'ack_failed',count:-1},{event:'ack_success',count:Number.MAX_SAFE_INTEGER+1},
    {event:'send_accepted',count:0,averageDurationMs:300001}]}));
  assert.deepEqual(result.counters,[{event:'send_accepted',count:0,averageDurationMs:null}]);
  for(const invalid of [null,{},'PRIVATE',[]]) {
    const missing=await observe(sample({counters:invalid,supportedOperationModes:invalid}));
    assert.deepEqual(missing.counters,[]);assert.deepEqual(missing.supportedOperationModes,[]);
  }
});

test('untrusted responses and unavailable telemetry do not expose response or request secrets',async()=>{
  for(const data of [sample({ok:false}),sample({privacy:'PRIVATE'}),sample({scope:'PRIVATE'}),{error:'PRIVATE'}])
    assert.deepEqual(await observe(data),{available:false,scope:'phoenix-node-since-start'});
  const failed=await read({env,fetchImpl:async()=>{throw Error('PRIVATE '+env.CONVERSATION_SERVICE_TOKEN);}});
  assert.equal(failed.available,false);assert.equal(JSON.stringify(failed).includes('PRIVATE'),false);
  let calls=0;
  const disabled=await read({env:{...env,WINGA_PHOENIX_TRANSPORT_ENABLED:'false'},fetchImpl:async()=>{calls++;}});
  assert.equal(disabled.enabled,false);assert.equal(calls,0);
});

test('a zero-sample counter cannot fabricate an average duration',async()=>{
  const result=await observe(sample({counters:[{event:'native_confirmed',count:0,averageDurationMs:10}]}));
  assert.deepEqual(result.counters,[{event:'native_confirmed',count:0,averageDurationMs:null}]);
});

test('actual HTTP response consumption stops when a partial telemetry body stalls', {timeout:15000},async t=>{
  const http=require('node:http');
  const server=http.createServer((_request,response)=>{
    response.writeHead(200,{'Content-Type':'application/json'});
    response.write('{"ok":true');
  });
  let watchdog,closing,requestSignal;
  const stop=()=>{
    server.closeAllConnections();
    if(!closing)closing=new Promise(resolve=>server.close(resolve));
    return closing;
  };
  t.signal.addEventListener('abort',stop,{once:true});
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const port=server.address().port,started=Date.now();
    // Cleanup must still run if the production abort signal is accidentally removed.
    watchdog=setTimeout(stop,10000);
    const result=await read({env,fetchImpl:(url,options)=>{
      assert.equal(url,'https://winga-phoenix.onrender.com/ops/health');
      assert.equal(options.redirect,'error');
      requestSignal=options.signal;
      return fetch('http://127.0.0.1:'+port+'/ops/health',options);
    }});
    assert.deepEqual(result,{available:false,scope:'phoenix-node-since-start'});
    assert.equal(requestSignal.aborted,true);
    assert.ok(Date.now()-started<10000);
  }finally {
    clearTimeout(watchdog);t.signal.removeEventListener('abort',stop);
    await stop();
  }
});
