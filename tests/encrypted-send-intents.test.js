const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID,webcrypto}=require('node:crypto');
const tick=()=>new Promise(setImmediate);
async function fixture() {
  const id=randomUUID(),deviceId=randomUUID(),session={username:'alice',sessionId:'session-a',token:'token-a'},changes=[];
  let revision=0,storageFailure=false,hold=false,release,sends=0;
  const values={['mls:route:bob']:{conversationId:id},['mls:group:'+id]:{confirmed:true}};
  const vault={snapshot:async()=>({revision:String(revision),values:structuredClone(values)}),lookup:async key=>structuredClone(values[key]),
    write:async change=>{if(storageFailure)throw Error('disk failed');
      if(change.expectedRevision!==String(revision))throw Object.assign(Error('CAS'),{code:'crypto_vault_revision_conflict'});
      Object.assign(values,structuredClone(change.values));for(const key of change.deleted||[])delete values[key];revision++;},close(){}};
  const own={id:deviceId},runtime={initialize:async()=>own,prepareKeyPackage:async()=>own,
    conversationId:async()=>id,history:async()=>Object.entries(values).filter(([k])=>k.startsWith('history:')).map(([,v])=>structuredClone(v)),close(){},
    sendMessage:async wire=>{sends++;const item={id:wire.clientMessageId,owner:'alice',peer:'bob',message:wire.message,conversationId:id,status:'sent'};
      values['history:'+item.id]=item;delete values['send:intent:'+item.id];revision++;return item;}};
  const context={TextEncoder,Uint8Array,crypto:webcrypto,structuredClone,queueMicrotask,setTimeout,
    navigator:{locks:{request:async(_name,work)=>work()}},WingaMlsCandidate:{createMlsRuntime:async()=>runtime},
    WingaCryptoDevices:{createCryptoDeviceClient:async()=>({enroll:async()=>own,signCryptoOperation:async(action,payload)=>({action,payload}),close(){}})},
    WingaEncryptedVault:{createEncryptedVault:async()=>vault}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/chat/encryption-session.js'),'utf8'),context);
  const service=await context.WingaEncryptionSession.createEncryptionSession({getSession:()=>session,initialSync:false,onChange:v=>changes.push(v),
    operationRequest:async()=>{if(hold)await new Promise(resolve=>release=resolve);
      return {version:1,groups:[{id,creator:'alice',recipient:'bob',status:'active',epoch:'1',messages:[],receipts:[]}]};}});
  return {service,session,changes,values,vault,runtime,id,deviceId,get sends(){return sends;},
    hold(){hold=true;},release(){hold=false;release();},failStorage(){storageFailure=true;}};
}
test('a held account poll cannot prevent durable local creation or claim server Sent',async()=>{
  const f=await fixture();f.hold();const poll=f.service.sync();await tick();
  const id=randomUUID(),send=f.service.sendMessage({clientMessageId:id,receiverId:'bob',message:'saved privately'});
  await tick();assert.equal(f.sends,0);assert.ok(f.values['send:intent:'+id]);
  const item=(await f.service.history('bob'))[0];
  assert.equal(item.isQueued,true);assert.equal(item.waiting,true);assert.equal(item.sendState,'pending');
  assert.equal(item.sequence,undefined);assert.equal(f.changes.find(v=>v?.localMessage)?.localMessage.id,id);
  f.release();await poll;assert.equal((await send).status,'sent');assert.equal(f.sends,1);
  assert.equal(f.values['send:intent:'+id],undefined);
});
test('storage failure never claims a saved intent and never sends',async()=>{
  const f=await fixture();f.failStorage();
  await assert.rejects(f.service.sendMessage({clientMessageId:randomUUID(),receiverId:'bob',message:'not saved'}),/disk failed/);
  assert.equal(f.sends,0);assert.equal(f.changes.length,0);
});

test('snapshot conflicts are retried before local staging without duplicate transmission',async()=>{
  const f=await fixture(),snapshot=f.vault.snapshot;let conflicts=2;
  f.vault.snapshot=async()=>{if(conflicts-->0)throw Object.assign(Error('CAS'),{code:'crypto_vault_revision_conflict'});return snapshot();};
  const sent=await f.service.sendMessage({clientMessageId:randomUUID(),receiverId:'bob',message:'snapshot retry'});
  assert.equal(sent.status,'sent');assert.equal(f.sends,1);
});

test('known membership replacement refuses a new local intent without changing history',async()=>{
  const f=await fixture();f.values['mls:replacement:bob']={id:randomUUID()};
  await assert.rejects(f.service.sendMessage({clientMessageId:randomUUID(),receiverId:'bob',message:'blocked'}),{code:'encrypted_membership_pending'});
  assert.equal(f.sends,0);assert.equal(f.changes.length,0);
  assert.equal(Object.keys(f.values).some(k=>k.startsWith('send:intent:')),false);
});

test('membership and binding snapshot conflicts retry after local staging without treating the send as failed',async()=>{
  const f=await fixture(),snapshot=f.vault.snapshot;let calls=0,conflicts=0;
  f.vault.snapshot=async()=>{calls++;if([4,6].includes(calls)){conflicts++;throw Object.assign(Error('CAS'),{code:'crypto_vault_revision_conflict'});}return snapshot();};
  assert.equal((await f.service.sendMessage({clientMessageId:randomUUID(),receiverId:'bob',message:'pre-transmission snapshots'})).status,'sent');
  assert.equal(conflicts,2);assert.equal(f.sends,1);
});
test('session switch while queued cannot transmit or expose prior-owner history',async()=>{
  const f=await fixture();f.hold();const poll=f.service.sync();await tick();
  const send=f.service.sendMessage({clientMessageId:randomUUID(),receiverId:'bob',message:'private'});
  const rejected=assert.rejects(send,{code:'mls_session_changed'}),pollRejected=assert.rejects(poll,{code:'mls_session_changed'});
  await tick();f.session.username='eve';f.release();await pollRejected;await rejected;assert.equal(f.sends,0);
});

test('verified foreground sync automatically resumes a retained intent with its original logical ID once',async()=>{
  const f=await fixture(),id=randomUUID(),send=f.runtime.sendMessage;let unavailable=true;
  f.runtime.sendMessage=async wire=>{if(unavailable)throw Object.assign(new TypeError('offline'),{status:503});return send(wire);};
  const pending=await f.service.sendMessage({clientMessageId:id,receiverId:'bob',message:'recover automatically'});
  assert.equal(pending.isQueued,true);assert.ok(f.values['send:intent:'+id]);assert.equal(f.sends,0);
  unavailable=false;await f.service.sync();await f.service.sync();
  assert.equal(f.sends,1);assert.equal(f.values['send:intent:'+id],undefined);
  assert.equal(f.values['history:'+id].message,'recover automatically');
});

test('automatic intent recovery excludes another device and a frozen membership without altering drafts',async()=>{
  for(const blocked of ['device','membership']){
    const f=await fixture(),id=randomUUID();
    f.values['send:intent:'+id]={id,owner:'alice',peer:'bob',conversationId:f.id,deviceId:blocked==='device'?randomUUID():f.deviceId,
      message:'retained',timestamp:new Date().toISOString(),status:'pending',localIntent:true};
    if(blocked==='membership')f.values['mls:replacement:bob']={id:randomUUID()};
    await f.service.sync();assert.equal(f.sends,0);assert.ok(f.values['send:intent:'+id]);
  }
});
