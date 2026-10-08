const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('browser experience observations are bounded, local, content-free and defensive copies',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/monitoring/performance.js'),'utf8'),context);
  const metrics=context.window.WingaConversationExperience;
  for(let i=0;i<200;i++)metrics.record('open-shell',i);
  for(const value of [NaN,-1,300001,'PRIVATE'])metrics.record('send-failed',value);
  metrics.record('PRIVATE USER',100);
  const result=metrics.snapshot();assert.equal(result.scope,'browser-process-local');
  assert.equal(result.metrics.find(row=>row.name==='open-shell').count,128);
  assert.equal(result.metrics.find(row=>row.name==='send-failed').count,0);
  assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  result.metrics[0].count=999;assert.equal(metrics.snapshot().metrics[0].count,128);
  metrics.reset();assert.equal(metrics.snapshot().metrics[0].count,0);
});
test('HttpOnly session reports only cumulative aggregate buckets and resets on account changes',async()=>{
  let session={username:'alice',sessionId:'a'},requests=[];
  const context={window:{},crypto:require('node:crypto').webcrypto,clearTimeout};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/monitoring/performance.js'),'utf8'),context);
  const metrics=context.window.WingaConversationExperience;
  metrics.connect({getSession:()=>session,request:async payload=>requests.push(payload)});
  metrics.record('send-confirmed',20);await metrics.flush();await metrics.flush();
  assert.equal(requests.length,2);assert.equal(requests[0].runId,requests[1].runId);assert.equal(requests[1].buckets[0].count,1);
  const wire=JSON.stringify(requests);assert.equal(wire.includes('alice'),false);assert.equal(wire.includes('session'),false);
  session={username:'bob',sessionId:'b'};metrics.record('sync-confirmed',40);await metrics.flush();
  assert.notEqual(requests[2].runId,requests[0].runId);assert.equal(requests[2].buckets.length,1);
  assert.equal(requests[2].buckets[0].name,'sync-confirmed');
});

test('shared composer metrics include pending, skip duplicate clicks and never publish prior-session outcomes',async()=>{
  let owner='alice',session={sessionId:'a'},finish;const observations=[];
  const context={window:{WingaModules:{chat:{}},WingaConversationExperience:{record:(...v)=>observations.push(v)}},performance};
  const source=fs.readFileSync(require.resolve('../src/chat/controller.js'),'utf8').replace('      bindMessageActions,','      runRetrySafeMessageSend,\n      bindMessageActions,');
  vm.runInNewContext(source,context);
  const controller=context.window.WingaModules.chat.createChatControllerModule({getCurrentUser:()=>owner,getCurrentSession:()=>session});
  const copy={pending:'pending',completed:'complete'};
  await controller.runRetrySafeMessageSend('one',async()=>({id:'one'}),copy);
  await controller.runRetrySafeMessageSend('one',async()=>{throw Error('duplicate must not execute');},copy);
  await controller.runRetrySafeMessageSend('two',async()=>({id:'two',isQueued:true}),copy);
  assert.deepEqual(observations.map(v=>v[0]),['send-confirmed','send-pending']);
  for(const rejected of [false,true]){
    owner='alice';session={sessionId:'a'};
    const pending=controller.runRetrySafeMessageSend('late-'+rejected,()=>new Promise((resolve,reject)=>finish=()=>rejected?reject(Error('mls_session_changed')):resolve({id:'late'})),copy);
    const settled=pending.catch(()=>{});owner='eve';session={sessionId:'e'};finish();await settled;
  }
  assert.equal(observations.length,2);
});

test('retry outcomes and refresh cannot enter another account or a replacement session',async()=>{
  for(const change of ['owner','replacement','mutated-identity','unchanged'])for(const rejected of [false,true]){
    let owner='alice',session={sessionId:'a'},finish,refreshes=0;const observations=[];
    const context={window:{WingaModules:{chat:{}},WingaConversationExperience:{record:(...v)=>observations.push(v)}},performance};
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/chat/controller.js'),'utf8'),context);
    const button={dataset:{messageRetry:'pending'},disabled:false};
    const scope={id:'profile-messages-panel',dataset:{},querySelector:()=>null,
      querySelectorAll:selector=>selector==='[data-message-retry]'?[button]:[]};
    const controller=context.window.WingaModules.chat.createChatControllerModule({
      getCurrentUser:()=>owner,getCurrentSession:()=>session,getActiveChatContext:()=>({withUser:'bob'}),
      refreshMessagesState:async()=>refreshes++,replaceMessagesPanel:()=>{},
      dataLayer:{retryPendingMessage:()=>new Promise((resolve,reject)=>finish=()=>rejected?reject(Error('private')):resolve(1))}
    });
    controller.bindMessageActions(scope);const pending=button.onclick();
    if(change==='owner'){owner='eve';session={sessionId:'e'};}
    if(change==='replacement')session={sessionId:'a-new'};
    if(change==='mutated-identity')session.sessionId='a-new';
    finish();await pending;
    assert.deepEqual(observations.map(v=>v[0]),change==='unchanged'?[rejected?'retry-failed':'retry-confirmed']:[]);
    assert.equal(refreshes,change==='unchanged'?1:0);assert.equal(button.disabled,false);
  }
});

test('offline replay observations bind parsed session identity and exclude late successes and rejections',async()=>{
  for(const change of ['owner','same-owner-login','unchanged'])for(const rejected of [false,true]){
    let session={username:'alice',sessionId:'a'},finish;const observations=[],storage=new Map();
    const context={window:{},WingaConversationExperience:{record:(...v)=>observations.push(v)}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/api/offline-queue.js'),'utf8'),context);
    const queue=context.window.WingaModules.api.offlineQueue.createOfflineQueueTools({
      readSession:()=>({...session}),safeStorageGet:key=>storage.get(key),
      safeStorageSet:(key,value)=>{storage.set(key,value);return true;},safeStorageRemove:key=>storage.delete(key),
      getNavigator:()=>({onLine:true})
    });
    await queue.queueOfflineMessageAction({receiverId:'bob',message:'private',clientMessageId:'logical'});
    const pending=queue.flushOfflineActionQueue({sendMessage:()=>new Promise((resolve,reject)=>finish=()=>rejected?reject(Object.assign(Error('private'),{retryable:true})):resolve({id:'accepted'}))});
    for(let i=0;i<20&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(typeof finish,'function');
    if(change==='owner')session={username:'eve',sessionId:'e'};
    if(change==='same-owner-login')session={username:'alice',sessionId:'a-new'};
    finish();assert.equal(await pending,rejected?0:1);
    assert.deepEqual(observations.map(v=>v[0]),change==='unchanged'?[rejected?'offline-failed':'offline-confirmed']:[]);
  }
});
