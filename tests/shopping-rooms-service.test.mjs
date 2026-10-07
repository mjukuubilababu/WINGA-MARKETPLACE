import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createECDH,createHash,generateKeyPairSync,sign,verify,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {createMlsRuntime,encodeRoomTransferPayload,decodeRoomTransferPayload} from '../src/chat/mls-runtime.mjs';
const require=createRequire(import.meta.url),{createEncryptedConversationStore,operationBytes}=require('../backend/encrypted-conversations');
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=b=>Buffer.from(b).toString('base64url'),decode=b=>new Uint8Array(Buffer.from(b,'base64url'));
async function fixture(t,{four=false,sibling=false,mediaEnabled=false,roomLimits}={}){
  const db=new PGlite();t.after(()=>db.close());await db.exec(require('./helpers/conversation-event-fixture'));
  for(const name of ['message-web-push','conversation-notification-preferences','conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-key-packages',
    'encrypted-conversations','encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery','encrypted-device-admissions','encrypted-device-lifecycle','encrypted-native-history','encrypted-shopping-rooms','encrypted-room-preferences'])
    await db.transaction(async c=>{for(const sql of require(`../backend/migrations/${name}`).statements)await c.exec(sql);});
  const {enqueueMessagePush}=require('../backend/message-web-push');
  const pushes=[],options={withTransaction:work=>db.transaction(work),roomsEnabled:true,multiDeviceEnabled:sibling,mediaEnabled,roomLimits,enqueuePush:async(c,p)=>{pushes.push(p);await enqueueMessagePush(c,p);}};
  let store=createEncryptedConversationStore(options);
  let tamperHistoryEpoch=false;
  const setLimits=value=>{store=createEncryptedConversationStore({...options,roomLimits:value});};
  if(four)await db.exec("INSERT INTO users(username) VALUES('dave'); INSERT INTO sessions VALUES('d','dave','d',9999999999999)");
  if(sibling)await db.exec("INSERT INTO sessions VALUES('a2','alice','a2',9999999999999)");
  const people=[];
  for(const [owner,token] of [['alice','a'],['bob','b1'],['eve','e'],...(four?[['dave','d']]:[]),...(sibling?[['alice','a2']]:[])]){
    const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32);
    const native={owner,id:randomUUID(),fingerprint:hash(publicKey),publicKey:encode(publicKey),status:'active'},context={owner,token,deviceId:token};
    await db.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,$2,$3,$4,'active')`,[native.id,owner,native.publicKey,native.fingerprint]);
    let values={},revision=0;const vault={async snapshot(){return {revision:String(revision),values:structuredClone(values)};},async lookup(k){return structuredClone(values[k]);},
      async historySnapshot({filter}={}){return {revision:String(revision),values:Object.fromEntries(Object.entries(structuredClone(values)).filter(([k,v])=>k.startsWith('history:')&&(!filter||filter(v,k))))};},
      async write(p){assert.equal(p.expectedRevision,String(revision));for(const k of p.deleted||[])delete values[k];Object.assign(values,structuredClone(p.values));return String(++revision);}};
    const p={owner,native,context,vault,pins:[],keys};
    p.signed=(action,payload,requestId=randomUUID(),session=context)=>{const op={action,actorId:native.id,requestId,issuedAt:Date.now(),payload};op.signature=encode(sign(null,operationBytes(session,op),keys.privateKey));return op;};
    p.operation=async(action,payload)=>store.encryptedOperation(context,p.signed(action,payload));
    const authorization={
      async verifyIntent(i){const r=await p.operation('room-intent',{conversationId:i.conversationId,transitionId:i.id});assert.equal(r.room.transition.intent,JSON.stringify(i));return true;},
      async check(conversationId,epoch,revision){return p.operation('room-check',{conversationId,epoch,revision});},
      historyEpoch:async(conversationId,epoch)=>{const r=await p.operation('room-history-epoch',{conversationId,epoch});
        if(tamperHistoryEpoch)r.acceptances[0].signature=encode(randomBytes(64));return r;},
      async confirm(t){const r=await p.operation('room-intent',{conversationId:t.conversationId,transitionId:JSON.parse(t.intent).id});
        return {status:r.room.transition.status==='accepted'?'active':'pending',conversationId:t.conversationId,epoch:t.epoch,transferHash:r.room.transition.transfer_hash};}
    };
    p.runtime=await createMlsRuntime({getSession:()=>({username:owner,sessionId:token,token}),vault,crypto:webcrypto,locks:{request:(_,work)=>work()},rooms:true,roomAuthorization:authorization,
      trustedPins:()=>p.pins,policy:{async markEncrypted(){},async markRoomEncrypted(){}},
      identityClient:{async enroll(){return native;},async attestKeyPackage(bytes){return {deviceId:native.id,keyPackage:encode(bytes),hash:hash(bytes)};}},
      async publishPackage(pkg){const {inspectBoundKeyPackage}=await import('../src/chat/mls-runtime.mjs');
        const key=await inspectBoundKeyPackage(decode(pkg.keyPackage),native);
        await db.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,$3,$4,'{}',NOW()+interval '1 day') ON CONFLICT DO NOTHING`,[pkg.hash,native.id,pkg.keyPackage,encode(key)]);
        return {version:1,package:{hash:pkg.hash,deviceId:native.id}};},
      transport:{send:job=>p.operation('room-send',{...job,ciphertext:encode(job.ciphertext)})}});
    p.device=await p.runtime.initialize();people.push(p);
  }
  for(const a of people)for(const b of people)if(a!==b)a.pins.push({...b.device,status:'active'});
  const members=people.filter(p=>p.context.deviceId!=='a2');
  const id=randomUUID(),[alice,bob,eve]=people,roster=members.map(p=>({owner:p.owner,id:p.device.id,fingerprint:p.device.fingerprint,key:Array.from(p.device.signaturePublicKey)})).sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
  const intent={version:1,kind:'shopping-room',id:randomUUID(),conversationId:id,previousEpoch:'0',revision:'1',actorOwner:'alice',actorDeviceId:alice.device.id,roster:JSON.stringify(roster),
    roles:JSON.stringify(members.map(p=>({owner:p.owner,role:p===alice?'admin':'member'})).sort((a,b)=>a.owner<b.owner?-1:1)),changes:JSON.stringify(members.slice(1).map(p=>({type:'add',owner:p.owner,id:p.device.id,packageHash:p.device.hash})).sort((a,b)=>a.id<b.id?-1:1))};
  const reserve=()=>alice.operation('room-reserve',{intent:JSON.stringify(intent),name:'Shopping',sourceHash:alice.device.hash});
  async function transfer(){await reserve();const tr=await alice.runtime.room.create(intent,new Map(members.slice(1).map(p=>[p.device.id,p.device.keyPackage])));
    await alice.operation('room-transfer',encodeRoomTransferPayload(tr));for(const p of members.slice(1))await p.runtime.room.acceptWelcome(tr);return tr;}
  async function activate(){const tr=await transfer(),proofs=[];for(const p of members){const a=await p.runtime.room.acceptance(id);proofs.push(a);
      const r=await p.operation('room-intent',{conversationId:id,transitionId:intent.id});await p.operation('room-accept',{conversationId:id,transitionId:intent.id,transferHash:r.room.transition.transfer_hash,signature:encode(a.signature)});}
    for(const p of members)await p.runtime.room.confirm(id,proofs);return tr;}
  return {db,store,setLimits,tamperHistoryEpoch(){tamperHistoryEpoch=true;},people,alice,bob,eve,sibling:people.find(p=>p.context.deviceId==='a2'),id,intent,reserve,transfer,activate,pushes};
}

async function addSibling(f){
  const p=f.sibling,roster=[...JSON.parse(f.intent.roster),{owner:p.owner,id:p.device.id,fingerprint:p.device.fingerprint,key:Array.from(p.device.signaturePublicKey)}].sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
  const i={...f.intent,id:randomUUID(),previousEpoch:'1',revision:'2',roster:JSON.stringify(roster),changes:JSON.stringify([{type:'add',owner:p.owner,id:p.device.id,packageHash:p.device.hash}])};
  await f.alice.operation('room-reserve',{intent:JSON.stringify(i),name:'Shopping',sourceHash:''});
  const tr=await f.alice.runtime.room.change(i,new Map([[p.device.id,p.device.keyPackage]]));await f.alice.operation('room-transfer',encodeRoomTransferPayload(tr));
  for(const other of [f.bob,f.eve])await other.runtime.room.applyCommit(tr);await p.runtime.room.acceptWelcome(tr);
  const r=await f.alice.operation('room-intent',{conversationId:f.id,transitionId:i.id}),proofs=[];
  for(const member of f.people){const a=await member.runtime.room.acceptance(f.id);proofs.push(a);await member.operation('room-accept',{conversationId:f.id,transitionId:i.id,transferHash:r.room.transition.transfer_hash,signature:encode(a.signature)});}
  for(const member of f.people)await member.runtime.room.confirm(f.id,proofs);return i;
}
async function receiveAll(f,sender,sent){
  for(const p of f.people.filter(p=>p!==sender&&p!==f.sibling)){
    const m=(await p.operation('room-poll',{after:null})).rooms[0].messages.find(m=>m.id===sent.id);
    await p.runtime.room.receive({...m,deviceId:m.sender_device,conversationId:f.id,ciphertext:decode(m.ciphertext)});
    await p.operation('room-receipt',{id:m.id,conversationId:f.id,epoch:m.epoch,hash:m.hash,kind:'delivered'});
  }
}
async function roomHistoryCoordinator(f,p,hooks={}){
  const codec=await require('../src/chat/secure-content').createSecureContent(webcrypto),session={username:p.owner,sessionId:p.context.deviceId,token:p.context.token};
  return require('../src/chat/native-history-client').createNativeHistoryClient({owner:p.owner,deviceId:p.device.id,getSession:()=>session,vault:p.vault,codec,crypto:webcrypto,locks:{request:(_,work)=>work()},
    operation:async(action,payload)=>{const r=await p.operation(action,payload);return hooks.after?hooks.after(action,r):r;},
    verifyProof:async(proof,action)=>{const signer=f.people.find(p=>p.device.id===proof.actorId);assert.equal(proof.owner,p.owner);assert.equal(proof.action,action);
      assert.equal(verify(null,operationBytes({owner:proof.owner,deviceId:proof.sessionId},proof),signer.keys.publicKey,Buffer.from(proof.signature,'base64url')),true);},
    validateRoomHistory:async(g,items)=>{const epochs=new Map();for(const item of Object.values(items)){
      if(!epochs.has(item.epoch)){const r=await p.operation('room-history-epoch',{conversationId:g.id,epoch:item.epoch});epochs.set(item.epoch,JSON.parse(JSON.parse(r.intent).roster));}
      assert.ok(epochs.get(item.epoch).some(m=>m.owner===item.owner&&m.id===item.deviceId));}},
    validateMembership:async g=>{assert.equal((await p.operation('room-check',{conversationId:g.id,epoch:g.epoch,revision:'2'})).active,true);}});
}
async function roomHistoryGroups(f,p){return (await p.operation('room-poll',{after:null})).rooms.map(r=>({...r,roster:JSON.parse(JSON.parse(r.transition.intent).roster).map(m=>({...m,status:'active'}))}));}

test('approved same-owner native Room history transfers prior epochs only and projects public roles without restoring ratchets',async t=>{
  const f=await fixture(t,{sibling:true});await f.activate();
  const old=await f.bob.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'private old room text'});await receiveAll(f,f.bob,old);
  await addSibling(f);const target=f.sibling;
  const live=await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'live epoch uses MLS'});
  const before=await target.vault.snapshot(),oldGrants=(await f.db.query("SELECT * FROM encrypted_conversation_epoch_devices WHERE epoch='1' ORDER BY device_id")).rows;
  const donor=await roomHistoryCoordinator(f,f.alice),receiver=await roomHistoryCoordinator(f,target),groups=await roomHistoryGroups(f,target);
  for(let n=0;n<5;n++){await receiver.sync(groups);await donor.sync(groups);}
  const history=await target.runtime.room.history(f.id);assert.equal(history.length,1);assert.equal(history[0].message,old.message);
  assert.equal(history[0].kind,'shopping-room');assert.equal(history[0].sequence,old.sequence);assert.equal(history[0].peer,'room:'+f.id);assert.equal(history[0].id,old.id);
  assert.equal(history.some(m=>m.id===live.id),false);assert.equal((await target.vault.snapshot()).values[`mls:group:${f.id}`].bytes.toString(),before.values[`mls:group:${f.id}`].bytes.toString());
  const epochs=await target.runtime.room.epochs(f.id);assert.equal(epochs.get('1').find(m=>m.owner==='alice').role,'admin');
  assert.deepEqual((await f.db.query("SELECT * FROM encrypted_conversation_epoch_devices WHERE epoch='1' ORDER BY device_id")).rows,oldGrants);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_history_pages')).rows[0].n,0);
  assert.equal(JSON.stringify((await f.db.query('SELECT * FROM encrypted_conversation_history_transfers')).rows).includes(old.message),false);
  const original=(await f.db.query('SELECT * FROM encrypted_conversation_receipts')).rows;
  await target.operation('room-archive-read',{id:old.id,conversationId:f.id,epoch:'1',hash:old.hash,kind:'read'});
  await assert.rejects(target.operation('room-receipt',{id:old.id,conversationId:f.id,epoch:'1',hash:old.hash,kind:'delivered'}),{code:'encrypted_room_receipt_rejected'});
  await assert.rejects(target.operation('room-archive-read',{id:old.id,conversationId:f.id,epoch:'1',hash:old.hash,kind:'delivered'}),{code:'encrypted_room_receipt_rejected'});
  assert.deepEqual((await f.db.query('SELECT * FROM encrypted_conversation_receipts')).rows,original);
  const reads=(await f.alice.operation('room-poll',{after:null})).rooms[0].archiveReceipts;assert.equal(reads.length,1);
  await f.alice.operation('room-archive-read-ack',{...reads[0].payload,receiptDeviceId:target.device.id});
  assert.equal((await f.alice.operation('room-poll',{after:null})).rooms[0].archiveReceipts.length,0);
  donor.close();receiver.close();
});

test('Room archive transfer denies another owner, unadmitted device, membership freeze and disabled features',async t=>{
  const f=await fixture(t,{sibling:true});await f.activate();const key=createECDH('prime256v1');key.generateKeys();
  const request={id:randomUUID(),conversationId:f.id,epoch:'1',donorDeviceId:f.alice.device.id,publicKey:encode(key.getPublicKey()),historyHash:hash('empty')};
  await assert.rejects(f.sibling.operation('history-reserve',request),{code:'encrypted_room_membership_required'});
  await assert.rejects(f.bob.operation('history-reserve',request),{code:'encrypted_history_access_denied'});
  await addSibling(f);request.epoch='2';await f.sibling.operation('history-reserve',request);
  const remove={...f.intent,id:randomUUID(),previousEpoch:'2',revision:'3',roster:JSON.parse((await f.alice.operation('room-poll',{after:null})).rooms[0].transition.intent).roster,changes:JSON.stringify([{type:'remove',owner:'eve',id:f.eve.device.id}])};
  remove.roster=JSON.stringify(JSON.parse(remove.roster).filter(m=>m.owner!=='eve'));remove.roles=JSON.stringify(JSON.parse(f.intent.roles).filter(m=>m.owner!=='eve'));
  await f.alice.operation('room-reserve',{intent:JSON.stringify(remove),name:'Shopping',sourceHash:''});
  assert.equal((await f.sibling.operation('history-tasks',{})).tasks.length,0);
  await assert.rejects(f.sibling.operation('history-reserve',{...request,id:randomUUID()}),{code:'encrypted_room_membership_pending'});
  const disabled=createEncryptedConversationStore({withTransaction:work=>f.db.transaction(work),multiDeviceEnabled:true});
  await assert.rejects(disabled.encryptedOperation(f.sibling.context,f.sibling.signed('history-reserve',request)),{code:'encrypted_rooms_disabled'});
  const single=createEncryptedConversationStore({withTransaction:work=>f.db.transaction(work),roomsEnabled:true});
  await assert.rejects(single.encryptedOperation(f.alice.context,f.alice.signed('room-history-epoch',{conversationId:f.id,epoch:'1'})),{code:'encrypted_multidevice_disabled'});
});

test('Room history rejects mutated pages and unsigned historical role bindings without partial imports',async t=>{
  const f=await fixture(t,{sibling:true});await f.activate();
  const old=await f.bob.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'OLD ROOM DATA stays encrypted'});await receiveAll(f,f.bob,old);await addSibling(f);
  const donor=await roomHistoryCoordinator(f,f.alice),target=await roomHistoryCoordinator(f,f.sibling,{after:(action,r)=>{
    if(action==='history-pages'&&r.pages.length){r=structuredClone(r);r.pages[0].capsule.ciphertext=encode(randomBytes(32));}return r;
  }}),groups=await roomHistoryGroups(f,f.sibling);
  await target.sync(groups);await donor.sync(groups);await target.sync(groups);
  assert.equal(target.state(f.id),'failed');assert.deepEqual((await f.sibling.vault.historySnapshot()).values,{});
  const local=await f.sibling.vault.snapshot();await f.sibling.vault.write({expectedRevision:local.revision,values:{['history:'+old.id]:(await f.alice.runtime.room.history(f.id))[0]},historyRestore:true});
  await assert.rejects(f.db.query(`UPDATE encrypted_room_acceptances SET signature=$1 WHERE transition_id=$2 AND owner_id='bob'`,[encode(randomBytes(64)),f.intent.id]),{code:'23514'});
  f.tamperHistoryEpoch();
  await assert.rejects(f.sibling.runtime.room.epochs(f.id),{code:'mls_room_archive_rejected'});
  donor.close();target.close();
});

test('a removed native Room endpoint cannot retrieve staged archive pages or original epoch metadata',async t=>{
  const f=await fixture(t,{sibling:true});await f.activate();const i=await addSibling(f),key=createECDH('prime256v1');key.generateKeys();
  const request={id:randomUUID(),conversationId:f.id,epoch:'2',donorDeviceId:f.alice.device.id,publicKey:encode(key.getPublicKey()),historyHash:hash('empty')};
  await f.sibling.operation('history-reserve',request);
  const next={...i,id:randomUUID(),previousEpoch:'2',revision:'3',roster:JSON.stringify(JSON.parse(i.roster).filter(m=>m.id!==f.sibling.device.id)),
    changes:JSON.stringify([{type:'remove',owner:'alice',id:f.sibling.device.id}])};
  await f.alice.operation('room-reserve',{intent:JSON.stringify(next),name:'Shopping',sourceHash:''});
  const tr=await f.alice.runtime.room.change(next,new Map());await f.alice.operation('room-transfer',encodeRoomTransferPayload(tr));
  for(const p of [f.bob,f.eve])await p.runtime.room.applyCommit(tr);
  const r=await f.alice.operation('room-intent',{conversationId:f.id,transitionId:next.id}),proofs=[];
  for(const p of [f.alice,f.bob,f.eve]){const a=await p.runtime.room.acceptance(f.id);proofs.push(a);await p.operation('room-accept',{conversationId:f.id,transitionId:next.id,transferHash:r.room.transition.transfer_hash,signature:encode(a.signature)});}
  for(const p of [f.alice,f.bob,f.eve])await p.runtime.room.confirm(f.id,proofs);
  assert.equal((await f.sibling.operation('history-tasks',{})).tasks.length,0);
  await assert.rejects(f.sibling.operation('history-pages',{id:request.id,conversationId:f.id,epoch:'3',after:-1}),{code:'encrypted_room_membership_required'});
  await assert.rejects(f.sibling.operation('room-history-epoch',{conversationId:f.id,epoch:'1'}),{code:'encrypted_room_membership_required'});
});

test('configured owner limits reject real signed directory and creation work before reservation or package consumption',async t=>{
  const f=await fixture(t,{four:true,roomLimits:{maxOwners:3,maxDevices:3}});
  await assert.rejects(f.alice.operation('room-directory',{owners:JSON.stringify(['alice','bob','dave','eve'])}),{code:'encrypted_room_member_limit'});
  await assert.rejects(f.reserve(),{code:'encrypted_room_member_limit'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_room_transitions')).rows[0].n,0);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,0);
});
test('configured device limits reject an excess native roster independently of owner count',async t=>{
  const f=await fixture(t,{roomLimits:{maxOwners:3,maxDevices:3}}),id=randomUUID();
  const roster=[...JSON.parse(f.intent.roster),{owner:'bob',id,fingerprint:hash('extra'),key:Array.from(randomBytes(32))}].sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
  const changes=[...JSON.parse(f.intent.changes),{type:'add',owner:'bob',id,packageHash:hash('package')}].sort((a,b)=>a.id<b.id?-1:1);
  const intent={...f.intent,roster:JSON.stringify(roster),changes:JSON.stringify(changes)};
  await assert.rejects(f.alice.operation('room-reserve',{intent:JSON.stringify(intent),name:'Shopping',sourceHash:f.alice.device.hash}),{code:'encrypted_room_device_limit'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_room_transitions')).rows[0].n,0);
});
test('lowering configured limits preserves accepted reservation retries, encrypted traffic and shrinking membership',async t=>{
  const f=await fixture(t,{four:true});await f.reserve();f.setLimits({maxOwners:3,maxDevices:3});await f.activate();
  assert.equal((await f.alice.operation('room-check',{conversationId:f.id,epoch:'1',revision:'1'})).active,true);
  const {verifyShoppingRooms,migrationId,preferencesMigrationId}=require('../backend/verify-shopping-rooms');
  await f.db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');await f.db.query('INSERT INTO schema_migrations VALUES($1),($2)',[migrationId,preferencesMigrationId]);
  const health=await verifyShoppingRooms(f.db,{WINGA_ENCRYPTED_ROOM_MAX_OWNERS:'3',WINGA_ENCRYPTED_ROOM_MAX_DEVICES:'3'});
  assert.equal(health.ok,true);assert.equal(health.health.roomsAboveConfiguredOwnerLimit,1);assert.equal(health.health.roomsAboveConfiguredDeviceLimit,1);
  for(const [extraOwner,code]of [['frank','encrypted_room_member_limit'],['bob','encrypted_room_device_limit']]){
    const extra={owner:extraOwner,id:randomUUID(),fingerprint:hash(extraOwner),key:Array.from(randomBytes(32))};
    const roster=[...JSON.parse(f.intent.roster),extra].sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
    const roles=[...new Set(roster.map(m=>m.owner))].sort().map(owner=>({owner,role:owner==='alice'?'admin':'member'}));
    const growth={...f.intent,id:randomUUID(),previousEpoch:'1',revision:'2',roster:JSON.stringify(roster),roles:JSON.stringify(roles),
      changes:JSON.stringify([{type:'add',owner:extraOwner,id:extra.id,packageHash:hash('package')}])};
    await assert.rejects(f.alice.operation('room-reserve',{intent:JSON.stringify(growth),name:'Shopping',sourceHash:''}),{code});
  }
  const sent=await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'still private after lowering the limit'});
  for(const p of f.people.slice(1)){const m=(await p.operation('room-poll',{after:null})).rooms[0].messages[0];
    assert.equal((await p.runtime.room.receive({...m,deviceId:m.sender_device,conversationId:f.id,ciphertext:decode(m.ciphertext)})).message,'still private after lowering the limit');
    await p.operation('room-receipt',{id:sent.id,conversationId:f.id,epoch:'1',hash:m.hash,kind:'delivered'});}
  const old=JSON.parse(f.intent.roster),removed=old.find(m=>m.owner==='dave');
  const next={...f.intent,id:randomUUID(),previousEpoch:'1',revision:'2',roster:JSON.stringify(old.filter(m=>m!==removed)),
    roles:JSON.stringify(JSON.parse(f.intent.roles).filter(m=>m.owner!=='dave')),changes:JSON.stringify([{type:'remove',owner:'dave',id:removed.id}])};
  await f.alice.operation('room-reserve',{intent:JSON.stringify(next),name:'Shopping',sourceHash:''});
  const tr=await f.alice.runtime.room.change(next,new Map());await f.alice.operation('room-transfer',encodeRoomTransferPayload(tr));
  const remaining=f.people.filter(p=>p.owner!=='dave');for(const p of remaining.slice(1))await p.runtime.room.applyCommit(tr);
  const snapshot=await f.alice.operation('room-intent',{conversationId:f.id,transitionId:next.id}),acks=[];
  for(const p of remaining){const a=await p.runtime.room.acceptance(f.id);acks.push(a);await p.operation('room-accept',{conversationId:f.id,transitionId:next.id,transferHash:snapshot.room.transition.transfer_hash,signature:encode(a.signature)});}
  for(const p of remaining)await p.runtime.room.confirm(f.id,acks);
  assert.equal((await f.alice.operation('room-check',{conversationId:f.id,epoch:'2',revision:'2'})).active,true);
  assert.equal((await f.people[3].operation('room-poll',{after:null})).rooms[0].status,'removed');
});
test('real room service requires all native signatures before activating and shares the canonical encrypted stream',async t=>{
  const f=await fixture(t);await f.transfer();const a=await f.alice.runtime.room.acceptance(f.id),r=await f.alice.operation('room-intent',{conversationId:f.id,transitionId:f.intent.id});
  const payload={conversationId:f.id,transitionId:f.intent.id,transferHash:r.room.transition.transfer_hash,signature:encode(a.signature)};
  const partial=await f.alice.operation('room-accept',payload);assert.equal(partial.status,'pending');
  await assert.rejects(f.bob.operation('room-accept',payload),{status:403});
  for(const p of [f.bob,f.eve]){const a=await p.runtime.room.acceptance(f.id);await p.operation('room-accept',{...payload,signature:encode(a.signature)});}
  const g=(await f.db.query(`SELECT c.kind,c.security_mode,c.participant_low,g.recipient FROM conversation_event_streams c JOIN encrypted_conversations g ON g.canonical_id=c.id WHERE g.id=$1`,[f.id])).rows[0];
  assert.deepEqual(g,{kind:'shopping-room',security_mode:'encrypted',participant_low:null,recipient:null});
  assert.equal((await f.db.query(`SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1`,[f.id])).rows[0].n,3);
});
test('durable real-service sends reach both members once, retain exact retries and never enter direct polls',async t=>{
  const f=await fixture(t);await f.activate();const id=randomUUID();const sent=await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:id,message:'encrypted room text'});
  assert.equal(sent.status,'sent');assert.equal(sent.sequence,'1');assert.equal((await f.alice.operation('poll',{})).groups.length,0);
  for(const p of [f.bob,f.eve]){const r=await p.operation('room-poll',{after:null}),m=r.rooms[0].messages[0];
    const item=await p.runtime.room.receive({...m,deviceId:m.sender_device,conversationId:f.id,ciphertext:decode(m.ciphertext)});assert.equal(item.message,'encrypted room text');
    await p.operation('room-receipt',{id,conversationId:f.id,epoch:item.epoch,hash:item.hash,kind:'delivered'});
    assert.equal((await p.operation('room-poll',{after:null})).rooms[0].messages.length,0);}
  assert.equal(f.pushes.length,2);assert.deepEqual(await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:id,message:'encrypted room text'}),sent);
  await assert.rejects(f.alice.operation('send',{id:randomUUID(),conversationId:f.id,epoch:'1',deviceId:f.alice.device.id,ciphertext:'x',hash:'x'}),{code:'encrypted_group_scope_rejected'});
});

test('Room preferences are owner-scoped, revisioned and replay-safe across authenticated sessions',async t=>{
  const f=await fixture(t);await f.activate();const payload={conversationId:f.id,revision:'0',field:'muted',value:true};
  const op=f.bob.signed('room-preference-save',payload);
  assert.deepEqual(await f.bob.operation('room-preferences',{conversationId:f.id}),{revision:'0',muted:false,archived:false});
  const saved=await f.store.encryptedOperation(f.bob.context,op);assert.deepEqual(saved,{revision:'1',muted:true,archived:false});
  assert.deepEqual(await f.store.encryptedOperation(f.bob.context,op),saved);
  await assert.rejects(f.store.encryptedOperation(f.bob.context,f.bob.signed('room-preference-save',{...payload,value:false},op.requestId)),{code:'encrypted_room_preference_conflict'});
  const other={owner:'bob',token:'b2',deviceId:'b2'};
  assert.deepEqual(await f.store.encryptedOperation(other,f.bob.signed('room-preferences',{conversationId:f.id},randomUUID(),other)),saved);
  assert.deepEqual((await f.alice.operation('room-poll',{after:null})).rooms[0].preferences,{revision:'0',muted:false,archived:false});
  await assert.rejects(f.eve.operation('room-preferences',{conversationId:f.id,owner:'bob'}),{status:400});
  await assert.rejects(f.bob.operation('room-preference-save',{...payload,field:'notificationDuration'}),{status:400});
  await f.bob.operation('room-preference-save',{...payload,revision:'1',field:'archived'});
  await assert.rejects(f.store.encryptedOperation(f.bob.context,op),{code:'encrypted_room_preference_conflict'});
  await assert.rejects(f.store.encryptedOperation(other,f.bob.signed('room-preference-save',{...payload,revision:'1',value:false},randomUUID(),other)),{code:'encrypted_room_preference_conflict'});
  assert.deepEqual((await f.bob.operation('room-poll',{after:null})).rooms[0].preferences,{revision:'2',muted:true,archived:true});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_room_preferences')).rows[0].n,1);
  for(const sql of require('../backend/migrations/encrypted-room-preferences').statements)await f.db.exec(sql);
  assert.deepEqual(await f.bob.operation('room-preferences',{conversationId:f.id}),{revision:'2',muted:true,archived:true});
});

test('Room mute suppresses queued and future push without suppressing encrypted delivery; archive only changes presentation',async t=>{
  const f=await fixture(t);await f.activate();const sent=[];
  const {createMessageWebPushStore}=require('../backend/message-web-push');
  const push=createMessageWebPushStore({query:f.db.query.bind(f.db),withTransaction:work=>f.db.transaction(work),encrypted:true,roomsEnabled:true,
    provider:{generateVAPIDKeys:()=>({publicKey:'test-public',privateKey:'test-private'}),async sendNotification(sub,body){sent.push({endpoint:sub.endpoint,body:JSON.parse(body)});}}});
  for(const p of [f.bob,f.eve]){const ec=createECDH('prime256v1');ec.generateKeys();await push.saveWebPush({owner:p.owner,token:p.context.token,sessionId:p.context.deviceId,payload:{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/'+p.owner,keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}}});}
  const first=await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'queued before mute'});
  await f.bob.operation('room-preference-save',{conversationId:f.id,revision:'0',field:'muted',value:true});
  await f.bob.operation('room-preference-save',{conversationId:f.id,revision:'1',field:'archived',value:true});
  await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'arrives while muted and archived'});
  await push.dispatchWebPushBatch();assert.equal(sent.length,2);assert(sent.every(p=>p.endpoint.endsWith('/eve')));
  assert.equal(sent[0].body.group,sent[1].body.group);
  const poll=(await f.bob.operation('room-poll',{after:null})).rooms[0];assert.equal(poll.messages.length,2);assert.equal(poll.preferences.archived,true);
  for(const m of poll.messages)assert((await f.bob.runtime.room.receive({...m,deviceId:m.sender_device,conversationId:f.id,ciphertext:decode(m.ciphertext)})).message.length>0);
  const m=poll.messages.find(m=>m.id===first.id);await f.bob.operation('room-receipt',{id:m.id,conversationId:f.id,epoch:m.epoch,hash:m.hash,kind:'read'});
  await f.bob.operation('room-preference-save',{conversationId:f.id,revision:'2',field:'muted',value:false});
  await push.saveConversationMute({owner:'bob',token:'b1',sessionId:'b1',payload:{owner:'bob',sessionId:'b1',peer:'alice',revision:'0',muted:true}});
  await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'archived only still notifies'});
  await push.dispatchWebPushBatch();assert.equal(sent.length,4);assert(sent.slice(2).some(p=>p.endpoint.endsWith('/bob')));
  await f.bob.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'another sender in the same Room'});
  await push.dispatchWebPushBatch();assert.equal(sent.length,5);
  assert.equal(new Set(sent.filter(p=>p.endpoint.endsWith('/eve')).map(p=>p.body.group)).size,1);
  assert.equal((await f.bob.operation('room-preferences',{conversationId:f.id})).archived,true);
  assert.equal(JSON.stringify(sent).includes(f.id),false);assert.equal(JSON.stringify(sent).includes('archived only'),false);
});

test('push dispatch rechecks Room mute even when a pending job was inserted before the preference change',async t=>{
  const f=await fixture(t);await f.activate();const ec=createECDH('prime256v1');ec.generateKeys();let accepted=0;
  const push=require('../backend/message-web-push').createMessageWebPushStore({query:f.db.query.bind(f.db),withTransaction:work=>f.db.transaction(work),encrypted:true,roomsEnabled:true,
    provider:{generateVAPIDKeys:()=>({publicKey:'test-public',privateKey:'test-private'}),async sendNotification(){accepted++;}}});
  await push.saveWebPush({owner:'bob',token:'b1',sessionId:'b1',payload:{subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/bob',keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}}});
  await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'pending push'});
  await f.bob.operation('room-preference-save',{conversationId:f.id,revision:'0',field:'muted',value:true});
  await f.db.exec('UPDATE web_push_jobs SET completed_at=NULL');
  const result=await push.dispatchWebPushBatch();assert.equal(accepted,0);assert.equal(result.skipped,1);
});
test('blocked accounts and revoked native devices cannot read or acknowledge a room',async t=>{
  const f=await fixture(t);await f.activate();await f.db.query(`INSERT INTO user_blocks(blocker_username,blocked_username) VALUES('eve','alice')`);
  await assert.rejects(f.alice.operation('room-check',{conversationId:f.id,epoch:'1',revision:'1'}),{status:403});
  assert.equal((await f.bob.operation('room-poll',{after:null})).rooms[0].status,'removed');
});
test('default gate rejects room operations and identity/epoch membership cannot be rewritten',async t=>{
  const f=await fixture(t);await f.activate();const disabled=createEncryptedConversationStore({withTransaction:work=>f.db.transaction(work)});
  await assert.rejects(disabled.encryptedOperation(f.alice.context,{action:'room-poll',payload:{after:null}}),{code:'encrypted_rooms_disabled'});
  await assert.rejects(f.db.query(`UPDATE encrypted_room_epochs SET roles='[]' WHERE conversation_id=$1`,[f.id]));
  await assert.rejects(f.db.query(`UPDATE encrypted_conversations SET kind='direct' WHERE id=$1`,[f.id]));
  await assert.rejects(f.db.query(`UPDATE conversation_event_streams SET kind='direct' WHERE id=(SELECT canonical_id FROM encrypted_conversations WHERE id=$1)`,[f.id]));
  await assert.rejects(f.db.query(`UPDATE encrypted_room_transitions SET intent='{}' WHERE conversation_id=$1`,[f.id]));
  await assert.rejects(f.db.query(`UPDATE encrypted_room_acceptances SET signature='rewritten' WHERE transition_id=$1`,[f.intent.id]));
  await assert.rejects(f.db.query(`INSERT INTO encrypted_conversation_epochs(conversation_id,epoch) VALUES($1,'99')`,[f.id]));
});

test('Room removal rotates the real native epoch and never rewrites the original three-owner grant',async t=>{
  const f=await fixture(t);await f.activate();const old=JSON.parse(f.intent.roster),removed=old.find(m=>m.owner==='eve');
  await f.eve.operation('room-preference-save',{conversationId:f.id,revision:'0',field:'archived',value:true});
  const next={...f.intent,id:randomUUID(),previousEpoch:'1',revision:'2',roster:JSON.stringify(old.filter(m=>m!==removed)),
    roles:JSON.stringify(JSON.parse(f.intent.roles).filter(m=>m.owner!=='eve')),changes:JSON.stringify([{type:'remove',owner:'eve',id:removed.id}])};
  await assert.rejects(f.bob.operation('room-reserve',{intent:JSON.stringify({...next,actorOwner:'bob',actorDeviceId:f.bob.device.id}),name:'Shopping',sourceHash:''}),{code:'encrypted_room_admin_required'});
  await f.alice.operation('room-reserve',{intent:JSON.stringify(next),name:'Shopping',sourceHash:''});
  const tr=await f.alice.runtime.room.change(next,new Map());await f.alice.operation('room-transfer',encodeRoomTransferPayload(tr));await f.bob.runtime.room.applyCommit(tr);
  const snapshot=await f.alice.operation('room-intent',{conversationId:f.id,transitionId:next.id}),acks=[];
  for(const p of [f.alice,f.bob]){const a=await p.runtime.room.acceptance(f.id);acks.push(a);await p.operation('room-accept',{conversationId:f.id,transitionId:next.id,transferHash:snapshot.room.transition.transfer_hash,signature:encode(a.signature)});}
  for(const p of [f.alice,f.bob])await p.runtime.room.confirm(f.id,acks);
  await assert.rejects(f.eve.operation('room-check',{conversationId:f.id,epoch:'2',revision:'2'}),{code:'encrypted_room_membership_required'});
  await assert.rejects(f.eve.operation('room-preferences',{conversationId:f.id}),{code:'encrypted_room_membership_required'});
  await assert.rejects(f.eve.operation('room-preference-save',{conversationId:f.id,revision:'0',field:'muted',value:true}),{code:'encrypted_room_membership_required'});
  assert.equal((await f.eve.operation('room-poll',{after:null})).rooms[0].status,'removed');
  assert.equal((await f.eve.operation('room-poll',{after:null})).rooms[0].preferences.archived,true);
  const sent=await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'after removal'});
  const message=(await f.bob.operation('room-poll',{after:null})).rooms[0].messages[0];assert.equal(message.id,sent.id);
  assert.equal((await f.bob.runtime.room.receive({...message,deviceId:message.sender_device,conversationId:f.id,ciphertext:decode(message.ciphertext)})).message,'after removal');
  assert.deepEqual((await f.db.query('SELECT epoch,COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 GROUP BY epoch ORDER BY epoch',[f.id])).rows,[{epoch:'1',n:3},{epoch:'2',n:2}]);
});

test('real Room push fanout is owner-specific, generic, and bound to current membership',async t=>{
  const f=await fixture(t);await f.activate();const sent=[];
  const provider={generateVAPIDKeys:()=>({publicKey:'test-public',privateKey:'test-private'}),async sendNotification(sub,body){sent.push({sub,body:JSON.parse(body)});}};
  const {createMessageWebPushStore}=require('../backend/message-web-push');
  const push=createMessageWebPushStore({query:f.db.query.bind(f.db),withTransaction:work=>f.db.transaction(work),provider,encrypted:true,roomsEnabled:true});
  for(const p of [f.bob,f.eve]){const ec=createECDH('prime256v1');ec.generateKeys();await push.saveWebPush({owner:p.owner,token:p.context.token,sessionId:p.context.deviceId,payload:{locale:'en',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/'+p.owner,keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}}});}
  const message=await f.alice.runtime.room.send({conversationId:f.id,clientMessageId:randomUUID(),message:'must never appear in push'});
  const envelope=(await f.bob.operation('room-poll',{after:null})).rooms[0].messages[0];await f.bob.operation('room-receipt',{id:message.id,conversationId:f.id,epoch:'1',hash:envelope.hash,kind:'read'});
  const jobs=(await f.db.query('SELECT id,owner_id FROM web_push_jobs ORDER BY owner_id')).rows;assert.equal(jobs.length,2);
  const job=jobs.find(j=>j.owner_id==='eve');assert.deepEqual(await push.resolveWebPush({owner:'eve',token:'e',sessionId:'e',id:job.id}),{withUser:'alice',roomId:f.id});
  await push.dispatchWebPushBatch();assert.equal(sent.length,1);assert.equal(sent[0].sub.endpoint.endsWith('/eve'),true);assert.equal(JSON.stringify(sent).includes('must never'),false);
  await f.db.query(`INSERT INTO user_blocks(blocker_username,blocked_username) VALUES('bob','alice')`);
  await assert.rejects(push.resolveWebPush({owner:'eve',token:'e',sessionId:'e',id:job.id}),{status:404});
});

test('aggregate Room readiness is read-only and detects missing historical native grants',async t=>{
  const f=await fixture(t);await f.activate();const {verifyShoppingRooms,migrationId,preferencesMigrationId}=require('../backend/verify-shopping-rooms');
  await f.db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');await f.db.query('INSERT INTO schema_migrations VALUES($1),($2)',[migrationId,preferencesMigrationId]);
  const ready=await verifyShoppingRooms(f.db,{});assert.equal(ready.ok,true);assert.equal(ready.preferencesReady,true);assert.equal(ready.databaseChanged,false);assert.equal(ready.authenticatedRoomFlowVerified,false);
  await f.db.query('DELETE FROM schema_migrations WHERE migration_id=$1',[preferencesMigrationId]);assert.equal((await verifyShoppingRooms(f.db,{})).preferencesReady,false);
  await f.db.query('INSERT INTO schema_migrations VALUES($1)',[preferencesMigrationId]);
  await f.db.exec('ALTER TABLE encrypted_conversation_epoch_devices DISABLE TRIGGER guard_encrypted_epoch_device');
  await f.db.query('DELETE FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND device_id=$2',[f.id,f.eve.device.id]);
  assert.equal((await verifyShoppingRooms(f.db,{})).health.invalidEpochGrants,1);
});
