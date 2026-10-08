const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../src/api/communications-client.js'),'utf8');
const summary = {withUser:'seller',lastMessageId:'legacy',latestMessage:'Hello',timestamp:'2026-10-05T10:00:00Z',unreadCount:0};
const saved = {id:'encrypted',senderId:'rey',receiverId:'me',message:'Verified saved message',timestamp:'2026-10-05T11:00:00Z',encrypted:true,isRead:false};
const page = () => ({items:[summary],hasMore:false,nextCursor:'',totalUnread:0,totalConversations:1});
function fixture({sync=async()=>{},history=async()=>[saved],create,fetchPage=async()=>page()}={}) {
  let session = {username:'me',sessionId:'fixture-session'};
  const calls = [];
  const service = {sync,history,close(){},isEncrypted:async()=>true,sendMessage:async()=>{throw Object.assign(new Error('membership missing'),{code:'encrypted_membership_required'});}};
  const context = {window:{},URLSearchParams,WingaEncryptionSession:{createEncryptionSession:async options=>{
    calls.push('initialize');
    if(create)return create(options);
    return service;
  }}};
  vm.runInNewContext(source,context);
  const client = context.window.WingaModules.api.communications.createCommunicationsApiClient({baseUrl:'/api',getSession:()=>session,fetchJson:async url=>{
    calls.push(url);
    if(url.includes('/messages/inbox?'))return fetchPage();
    if(url.endsWith('/encrypted/capabilities'))return {version:1,enabled:true};
    throw new Error('Unexpected route: '+url);
  }});
  return {client,calls,setSession:value=>{session=value;}};
}

test('encrypted sync failure does not turn a healthy inbox into a global retry error',async()=>{
  const f=fixture({sync:async()=>{throw Object.assign(new Error('provider details'),{code:'mls_membership_confirmation_rejected'});}});
  const result=await f.client.loadInboxPage({limit:25});
  assert.deepEqual(Array.from(result.items,item=>item.withUser),['rey','seller']);
  assert.equal(result.items[0].latestMessage,saved.message);
  assert.equal(result.items[0].encrypted,true);
  assert.equal(result.encryptedSyncError,true);
  assert.match(f.calls[0],/messages\/inbox/);
  assert.equal(JSON.stringify(result).includes('provider details'),false);
  await assert.rejects(f.client.sendMessage({receiverId:'rey',message:'Cannot downgrade'}),{code:'encrypted_membership_required'});
  assert.equal(f.calls.some(url=>url==='/api/messages'),false);
});

test('vault initialization failure preserves the canonical inbox with a scoped warning',async()=>{
  const f=fixture({create:async()=>{throw Object.assign(new Error('vault details'),{code:'crypto_vault_storage_blocked'});}});
  const result=await f.client.loadInboxPage();
  assert.equal(result.items[0].withUser,'seller');
  assert.equal(result.encryptedSyncError,true);
  assert.equal(JSON.stringify(result).includes('vault details'),false);
});

test('canonical inbox HTTP failure is not replaced with an empty success',async()=>{
  const f=fixture({fetchPage:async()=>{throw Object.assign(new Error('unavailable'),{status:503});}});
  await assert.rejects(f.client.loadInboxPage(),{status:503});
  assert.equal(f.calls.includes('initialize'),false);
});

test('encrypted authentication refusal and stale sessions still fail closed',async()=>{
  for(const status of [401,403]) {
    const f=fixture({sync:async()=>{throw Object.assign(new Error('auth refused'),{status});}});
    await assert.rejects(f.client.loadInboxPage(),{status});
  }
  let finish;
  const f=fixture({fetchPage:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=f.client.loadInboxPage();
  await new Promise(setImmediate);
  f.setSession({username:'other',sessionId:'other-session'});
  finish(page());
  await assert.rejects(pending,{code:'mls_session_changed'});
  assert.equal(f.calls.includes('initialize'),false);
});

test('successful encrypted retry clears its warning and preserves original server cursors',async()=>{
  let attempts=0;
  const f=fixture({sync:async()=>{if(++attempts===1)throw new TypeError('offline');},fetchPage:async()=>({...page(),hasMore:true,nextCursor:'server-only-cursor'})});
  const first=await f.client.loadInboxPage();
  assert.equal(first.encryptedSyncError,true);
  const next=await f.client.loadInboxPage();
  assert.equal(next.encryptedSyncError,false);
  assert.equal(next.nextCursor,'server-only-cursor');
  assert.equal(next.hasMore,true);
  assert.equal(next.items.length,2);
});

test('failed encrypted history cannot replace other healthy conversations',async()=>{
  const f=fixture({history:async()=>{throw Object.assign(new Error('cache details'),{code:'crypto_vault_corrupt'});}});
  const result=await f.client.loadInboxPage();
  assert.equal(result.encryptedSyncError,true);
  assert.deepEqual(Array.from(result.items,item=>item.withUser),['seller']);
});

test('persistent local search reads only the initialized vault projection without sync or network',async()=>{
  let syncs=0,peer;
  const f=fixture({sync:async()=>{syncs++;},history:async value=>{peer=value;return [saved];}});
  await f.client.loadInboxPage();const calls=f.calls.length,before=syncs;
  const result=await f.client.localConversationHistory('rey');
  assert.equal(peer,'rey');assert.equal(result[0].id,saved.id);assert.equal(f.calls.length,calls);assert.equal(syncs,before);
  f.setSession({username:'other',sessionId:'other-session'});
  await assert.rejects(f.client.localConversationHistory('rey'));
});

test('session changes during local history search discard the result',async()=>{
  let finish,pause=false;
  const f=fixture({history:async()=>pause?new Promise(resolve=>{finish=resolve;}):[saved]});
  await f.client.loadInboxPage();pause=true;const pending=f.client.localConversationHistory('rey');
  await new Promise(setImmediate);f.setSession({username:'me',sessionId:'replacement'});finish([saved]);
  await assert.rejects(pending,{code:'mls_session_changed'});
});
