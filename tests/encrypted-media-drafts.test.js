const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
async function fixture() {
  let revision=0,values={},uploads=0,sends=0,rejectUpload=false,rows=[];
  const session={username:'alice',sessionId:'a',token:'a'};
  const vault={snapshot:async()=>({revision,values:structuredClone(values)}),write:async v=>{
    assert.equal(v.expectedRevision,revision++);Object.assign(values,structuredClone(v.values||{}));for(const key of v.deleted||[])delete values[key];
  }};
  const conversationId=crypto.randomUUID();
  const codec={
    encryptMedia:async(file,context,metadata)=>({ciphertext:new Blob([new Uint8Array(48)]),descriptor:{...context,version:2,algorithm:'webcrypto-aes256gcm-v1',key:'A'.repeat(43)},metadata}),
    decryptMedia:async()=>({blob:new Blob(['draft'],{type:'audio/webm'}),name:'voice.webm'})
  };
  const context={Blob,crypto,TextEncoder,Uint8Array,queueMicrotask,WingaSecureContent:{loadSecureContent:async()=>codec},TypeError};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/chat/encrypted-media-client'),'utf8'),context);
  const api=await context.WingaEncryptedMedia.createMediaClient({owner:'alice',getSession:()=>session,vault,
    runtime:{conversationId:async()=>conversationId,history:async()=>rows,retryMessage:async id=>rows.find(r=>r.id===id),
      sendMessage:async p=>{sends++;const row={id:p.clientMessageId,message:p.message,conversationId,owner:'alice',peer:'bob',timestamp:new Date().toISOString(),status:'sent'};rows.push(row);return row;}},
    identity:{signCryptoOperation:async()=>({})},operation:async(_action,object)=>({id:object.id,bytes:object.bytes,sha256:object.sha256}),
    request:async(_method,object)=>{uploads++;if(rejectUpload)throw Object.assign(new Error('denied'),{status:403});return object;}
  });
  return {api,session,get values(){return values;},get uploads(){return uploads;},get sends(){return sends;},reject:()=>rejectUpload=true,allow:()=>rejectUpload=false};
}
test('voice draft persists before any remote work, survives read, and explicit cancel deletes it',async()=>{
  const f=await fixture(),file=new Blob(['audio'],{type:'audio/webm'});
  const draft=await f.api.stageDraft('bob',file,'','voice');
  assert.equal(f.uploads,0);assert.equal(f.sends,0);assert.equal((await f.api.draft('bob')).id,draft.id);
  assert.ok(f.values['media:draft:bob'].ciphertext.some(()=>true));
  await assert.rejects(()=>f.api.stageDraft('bob',file),/private_media_draft_exists/);
  await f.api.discardDraft('bob');assert.equal(await f.api.draft('bob'),null);
});
test('failed upload preserves encrypted job and exact retry ID without duplicate logical sends',async()=>{
  const f=await fixture(),draft=await f.api.stageDraft('bob',new Blob(['audio']),'','voice');
  f.reject();await assert.rejects(()=>f.api.sendDraft('bob','Caption'),/denied/);
  assert.equal(await f.api.draft('bob'),null);assert.ok(f.values['media:pending:'+draft.id]);assert.equal(f.sends,0);
  f.allow();const result=await f.api.resume(draft.id);assert.equal(result.id,draft.id);assert.equal(f.sends,1);
  assert.equal(await f.api.resume(draft.id),null);assert.equal(f.sends,1);assert.match(result.message,/Caption/);
});
test('drafts remain bound to the authenticated owner and private media byte limit',async()=>{
  const f=await fixture();await assert.rejects(()=>f.api.stageDraft('bob',new Blob([new Uint8Array(2*1024*1024+1)])),/private_media_invalid/);
  await f.api.stageDraft('bob',new Blob(['audio']));
  f.session.username='eve';await assert.rejects(()=>f.api.draft('bob'),/mls_session_changed/);
  await assert.rejects(()=>f.api.sendDraft('bob'),/mls_session_changed/);assert.equal(f.sends,0);
});
