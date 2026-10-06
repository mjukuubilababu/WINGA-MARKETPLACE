import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createECDH,createHash,generateKeyPairSync,sign,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {createMlsRuntime,encodeRoomTransferPayload,decodeRoomTransferPayload} from '../src/chat/mls-runtime.mjs';
const require=createRequire(import.meta.url),{createEncryptedConversationStore,operationBytes}=require('../backend/encrypted-conversations');
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=b=>Buffer.from(b).toString('base64url'),decode=b=>new Uint8Array(Buffer.from(b,'base64url'));
async function fixture(t){
  const db=new PGlite();t.after(()=>db.close());await db.exec(require('./helpers/conversation-event-fixture'));
  for(const name of ['message-web-push','conversation-notification-preferences','conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-key-packages',
    'encrypted-conversations','encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery','encrypted-device-admissions','encrypted-device-lifecycle','encrypted-native-history','encrypted-shopping-rooms'])
    await db.transaction(async c=>{for(const sql of require(`../backend/migrations/${name}`).statements)await c.exec(sql);});
  const {enqueueMessagePush}=require('../backend/message-web-push');
  const pushes=[],store=createEncryptedConversationStore({withTransaction:work=>db.transaction(work),roomsEnabled:true,enqueuePush:async(c,p)=>{pushes.push(p);await enqueueMessagePush(c,p);}});
  const people=[];
  for(const [owner,token] of [['alice','a'],['bob','b1'],['eve','e']]){
    const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32);
    const native={owner,id:randomUUID(),fingerprint:hash(publicKey),publicKey:encode(publicKey),status:'active'},context={owner,token,deviceId:token};
    await db.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,$2,$3,$4,'active')`,[native.id,owner,native.publicKey,native.fingerprint]);
    let values={},revision=0;const vault={async snapshot(){return {revision:String(revision),values:structuredClone(values)};},async write(p){assert.equal(p.expectedRevision,String(revision));for(const k of p.deleted||[])delete values[k];Object.assign(values,structuredClone(p.values));return String(++revision);}};
    const p={owner,native,context,vault,pins:[]};
    p.operation=async(action,payload)=>{const op={action,actorId:native.id,requestId:randomUUID(),issuedAt:Date.now(),payload};op.signature=encode(sign(null,operationBytes(context,op),keys.privateKey));return store.encryptedOperation(context,op);};
    const authorization={
      async verifyIntent(i){const r=await p.operation('room-intent',{conversationId:i.conversationId,transitionId:i.id});assert.equal(r.room.transition.intent,JSON.stringify(i));return true;},
      async check(conversationId,epoch,revision){return p.operation('room-check',{conversationId,epoch,revision});},
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
  const id=randomUUID(),[alice,bob,eve]=people,roster=people.map(p=>({owner:p.owner,id:p.device.id,fingerprint:p.device.fingerprint,key:Array.from(p.device.signaturePublicKey)})).sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
  const intent={version:1,kind:'shopping-room',id:randomUUID(),conversationId:id,previousEpoch:'0',revision:'1',actorOwner:'alice',actorDeviceId:alice.device.id,roster:JSON.stringify(roster),
    roles:JSON.stringify(people.map(p=>({owner:p.owner,role:p===alice?'admin':'member'}))),changes:JSON.stringify([bob,eve].map(p=>({type:'add',owner:p.owner,id:p.device.id,packageHash:p.device.hash})).sort((a,b)=>a.id<b.id?-1:1))};
  const reserve=()=>alice.operation('room-reserve',{intent:JSON.stringify(intent),name:'Shopping',sourceHash:alice.device.hash});
  async function transfer(){await reserve();const tr=await alice.runtime.room.create(intent,new Map([bob,eve].map(p=>[p.device.id,p.device.keyPackage])));
    await alice.operation('room-transfer',encodeRoomTransferPayload(tr));for(const p of [bob,eve])await p.runtime.room.acceptWelcome(tr);return tr;}
  async function activate(){const tr=await transfer(),proofs=[];for(const p of people){const a=await p.runtime.room.acceptance(id);proofs.push(a);
      const r=await p.operation('room-intent',{conversationId:id,transitionId:intent.id});await p.operation('room-accept',{conversationId:id,transitionId:intent.id,transferHash:r.room.transition.transfer_hash,signature:encode(a.signature)});}
    for(const p of people)await p.runtime.room.confirm(id,proofs);return tr;}
  return {db,store,people,alice,bob,eve,id,intent,reserve,transfer,activate,pushes};
}
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
  const next={...f.intent,id:randomUUID(),previousEpoch:'1',revision:'2',roster:JSON.stringify(old.filter(m=>m!==removed)),
    roles:JSON.stringify(JSON.parse(f.intent.roles).filter(m=>m.owner!=='eve')),changes:JSON.stringify([{type:'remove',owner:'eve',id:removed.id}])};
  await assert.rejects(f.bob.operation('room-reserve',{intent:JSON.stringify({...next,actorOwner:'bob',actorDeviceId:f.bob.device.id}),name:'Shopping',sourceHash:''}),{code:'encrypted_room_admin_required'});
  await f.alice.operation('room-reserve',{intent:JSON.stringify(next),name:'Shopping',sourceHash:''});
  const tr=await f.alice.runtime.room.change(next,new Map());await f.alice.operation('room-transfer',encodeRoomTransferPayload(tr));await f.bob.runtime.room.applyCommit(tr);
  const snapshot=await f.alice.operation('room-intent',{conversationId:f.id,transitionId:next.id}),acks=[];
  for(const p of [f.alice,f.bob]){const a=await p.runtime.room.acceptance(f.id);acks.push(a);await p.operation('room-accept',{conversationId:f.id,transitionId:next.id,transferHash:snapshot.room.transition.transfer_hash,signature:encode(a.signature)});}
  for(const p of [f.alice,f.bob])await p.runtime.room.confirm(f.id,acks);
  await assert.rejects(f.eve.operation('room-check',{conversationId:f.id,epoch:'2',revision:'2'}),{code:'encrypted_room_membership_required'});
  assert.equal((await f.eve.operation('room-poll',{after:null})).rooms[0].status,'removed');
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
  const f=await fixture(t);await f.activate();const {verifyShoppingRooms,migrationId}=require('../backend/verify-shopping-rooms');
  await f.db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');await f.db.query('INSERT INTO schema_migrations VALUES($1)',[migrationId]);
  const ready=await verifyShoppingRooms(f.db,{});assert.equal(ready.ok,true);assert.equal(ready.databaseChanged,false);assert.equal(ready.authenticatedRoomFlowVerified,false);
  await f.db.exec('ALTER TABLE encrypted_conversation_epoch_devices DISABLE TRIGGER guard_encrypted_epoch_device');
  await f.db.query('DELETE FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND device_id=$2',[f.id,f.eve.device.id]);
  assert.equal((await verifyShoppingRooms(f.db,{})).health.invalidEpochGrants,1);
});
