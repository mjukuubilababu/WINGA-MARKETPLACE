import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,webcrypto,generateKeyPairSync,sign,verify} from 'node:crypto';
import {createMlsRuntime,encodeRoomTransferPayload,decodeRoomTransferPayload} from '../src/chat/mls-runtime.mjs';
import {operationBytes} from '../backend/encrypted-conversations.js';
import {decodeGroupState,createApplicationMessage,encodeMlsMessage,getCiphersuiteFromName,getCiphersuiteImpl,processPrivateMessage,decodeMlsMessage,emptyPskIndex} from 'ts-mls';
import {defaultClientConfig} from 'ts-mls/clientConfig.js';
import {verifyBoundKeyPackage} from '../backend/conversation-mls-protocol.mjs';
import {encodeRoomContent,projectRoomContent} from '../src/chat/shopping-room-content.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex'),encoder=new TextEncoder();
const queues=new Map(),locks={async request(key,work){const before=queues.get(key)||Promise.resolve();let release;
  const after=new Promise(r=>release=r);queues.set(key,after);await before;try{return await work();}finally{release();if(queues.get(key)===after)queues.delete(key);}}};
function vault(){let revision=0,values={};return {rejectNext:false,async snapshot(){return {revision:String(revision),values:structuredClone(values)};},
  async write(change){if(this.rejectNext){this.rejectNext=false;throw Object.assign(new Error('storage_aborted'),{code:'storage_aborted'});}
    assert.equal(change.expectedRevision,String(revision));for(const k of change.deleted||[])delete values[k];Object.assign(values,structuredClone(change.values));return String(++revision);}};}
function authority(){
  const keys=generateKeyPairSync('ed25519'),reservations=new Map(),active=new Map(),sent=new Map();let sequence=0;
  const control={reservations,active,sent,rejectConfirmation:false,failSend:false,
    authorize(value){const bytes=encoder.encode(JSON.stringify(value));reservations.set(value.id,{bytes,signature:sign(null,bytes,keys.privateKey)});},
    adapter:{async verifyIntent(v){const row=reservations.get(v.id);return !!row && verify(null,encoder.encode(JSON.stringify(v)),keys.publicKey,row.signature);},
      async confirm(t){const v=JSON.parse(t.intent),h=digest(encoder.encode(JSON.stringify(['winga-mls-room-transfer',1,t.intent,t.epoch,digest(t.commit),digest(t.welcome),digest(t.tree)])));
        if(control.rejectConfirmation)return {status:'pending',conversationId:t.conversationId,epoch:t.epoch,transferHash:h};
        active.set(t.conversationId,{active:true,conversationId:t.conversationId,epoch:t.epoch,revision:v.revision});return {status:'active',conversationId:t.conversationId,epoch:t.epoch,transferHash:h};},
      async check(id){return active.get(id)||{active:false,conversationId:id,epoch:'0',revision:'0'};}},
    transport:{async send(packet){control.packets.push(structuredClone(packet));if(control.failSend)throw Object.assign(new Error('synthetic_offline'),{code:'synthetic_offline'});
      const prior=sent.get(packet.id);if(prior){assert.equal(prior.hash,packet.hash);return prior;}
      const response={id:packet.id,hash:packet.hash,status:'sent',sequence:String(++sequence),createdAt:new Date().toISOString()};sent.set(packet.id,response);return response;}},
    packets:[],
  };
  return control;
}
// A synthetic signed canonical authority; these fixtures do not prove an implemented room backend.
async function participant(owner,control,{rooms=true}={}){
  const session={username:owner,sessionId:randomUUID(),token:randomUUID()},storage=vault(),pins=[];
  const native={owner,id:randomUUID(),fingerprint:digest(webcrypto.getRandomValues(new Uint8Array(32))),status:'active'};
  const options={getSession:()=>session,vault:storage,locks,crypto:webcrypto,rooms,roomAuthorization:control.adapter,
    policy:{async markEncrypted(){},async markRoomEncrypted(){}},trustedPins:()=>pins,transport:control.transport,
    identityClient:{async enroll(){return native;},async attestKeyPackage(bytes){return {deviceId:native.id,keyPackage:Buffer.from(bytes).toString('base64url'),hash:digest(bytes)};}},
    async publishPackage(p){await verifyBoundKeyPackage(Buffer.from(p.keyPackage,'base64url'),native);return {version:1,package:{hash:p.hash,deviceId:native.id}};}};
  const runtime=await createMlsRuntime(options),device=await runtime.initialize();return {owner,runtime,device,storage,pins,session,options};
}
const member=p=>({owner:p.owner,id:p.device.id,fingerprint:p.device.fingerprint,key:Array.from(p.device.signaturePublicKey)});
const sortMembers=members=>members.sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
const pinAll=people=>{for(const a of people)for(const b of people)if(a!==b&&!a.pins.some(p=>p.id===b.device.id))a.pins.push({...b.device,status:'active'});};
function reserve(f,members,changes,previousEpoch='0'){
  const intent={version:1,kind:'shopping-room',id:randomUUID(),conversationId:f.id,previousEpoch,revision:String(BigInt(previousEpoch)+1n),
    actorOwner:f.alice.owner,actorDeviceId:f.alice.device.id,roster:JSON.stringify(sortMembers(members)),
    roles:JSON.stringify([...new Set(members.map(m=>m.owner))].sort().map(owner=>({owner,role:owner===f.alice.owner?'admin':'member'}))),
    changes:JSON.stringify(changes.sort((a,b)=>a.id<b.id?-1:1))};
  f.control.authorize(intent);return intent;
}
const addition=p=>({type:'add',owner:p.owner,id:p.device.id,packageHash:p.device.hash});
const removal=p=>({type:'remove',owner:p.owner,id:p.device.id});
async function fixture(){const control=authority(),alice=await participant('alice',control),bob=await participant('bob',control),carol=await participant('carol',control);
  const f={control,alice,bob,carol,id:randomUUID(),people:[alice,bob,carol]};pinAll(f.people);
  f.intent=reserve(f,f.people.map(member),[addition(bob),addition(carol)]);
  f.transfer=await alice.runtime.room.create(f.intent,new Map([[bob.device.id,bob.device.keyPackage],[carol.device.id,carol.device.keyPackage]]));return f;}
async function activate(people,id){const proofs=[];for(const p of people)proofs.push(await p.runtime.room.acceptance(id));
  for(const p of people)await p.runtime.room.confirm(id,proofs);return proofs;}
async function admitted(){const f=await fixture();for(const p of [f.bob,f.carol])await p.runtime.room.acceptWelcome(f.transfer);await activate(f.people,f.id);return f;}
const message=(f,text)=>({conversationId:f.id,clientMessageId:randomUUID(),message:text});
function envelope(control,packet){const receipt=control.sent.get(packet.id);return {...structuredClone(packet),sequence:receipt.sequence,created_at:receipt.createdAt};}

test('room support is default-off, validates limits and requires an explicit verified service adapter',async()=>{
  const p=await participant('alice',authority(),{rooms:false});assert.equal(p.runtime.room,null);
  await assert.rejects(createMlsRuntime({...p.options,rooms:true,roomAuthorization:undefined}),{code:'mls_room_service_required'});
  await assert.rejects(createMlsRuntime({...p.options,rooms:true,roomMaxOwners:2}),{code:'mls_room_limits_invalid'});
});
test('three distinct owners join one real MLS group but cannot send before every native acceptance and durable activation',async()=>{
  const f=await fixture(),{alice,bob,carol}=f;
  for(const p of [bob,carol])await p.runtime.room.acceptWelcome(f.transfer);
  await assert.rejects(alice.runtime.room.send(message(f,'frozen')),{code:'mls_room_membership_pending'});
  const proofs=await Promise.all(f.people.map(p=>p.runtime.room.acceptance(f.id)));
  await assert.rejects(alice.runtime.room.confirm(f.id,proofs.slice(0,2)),{code:'mls_room_acceptance_required'});
  await assert.rejects(alice.runtime.room.confirm(f.id,[proofs[0],proofs[0],proofs[2]]),{code:'mls_room_acceptance_rejected'});
  const forged=structuredClone(proofs);forged[1].signature[0]^=1;
  await assert.rejects(alice.runtime.room.confirm(f.id,forged),{code:'mls_room_acceptance_rejected'});
  f.control.rejectConfirmation=true;await assert.rejects(alice.runtime.room.confirm(f.id,proofs),{code:'mls_room_activation_rejected'});
  f.control.rejectConfirmation=false;for(const p of f.people)await p.runtime.room.confirm(f.id,proofs);
  const before=await alice.storage.snapshot();await alice.runtime.room.confirm(f.id,[...proofs].reverse());assert.deepEqual(await alice.storage.snapshot(),before);
  await assert.rejects(alice.runtime.room.confirm(f.id,forged),{code:'mls_room_acceptance_rejected'});
  await alice.runtime.room.send(message(f,'only admitted members'));const packet=f.control.packets.at(-1);
  for(const p of [bob,carol])assert.equal((await p.runtime.room.receive(envelope(f.control,packet))).message,'only admitted members');
});
test('room native journal never creates a direct route or leaks room history into direct histories',async()=>{
  const f=await admitted();await f.alice.runtime.room.send(message(f,'room scoped'));
  for(const p of [f.bob,f.carol])await p.runtime.room.receive(envelope(f.control,f.control.packets.at(-1)));
  for(const p of f.people){assert.deepEqual(await p.runtime.history(),[]);assert.equal((await p.runtime.room.history(f.id)).length,1);
    const values=(await p.storage.snapshot()).values;assert.ok(!Object.keys(values).some(k=>k.startsWith('mls:route:')));}
  await assert.rejects(f.alice.runtime.addPeer(f.id,f.bob.device.keyPackage),{code:'mls_group_scope_rejected'});
  await assert.rejects(f.alice.runtime.confirmMembership(f.id,f.intent.id),{code:'mls_group_scope_rejected'});
});
test('admission intent tampering, unpinned members and changing a package hash cannot consume a fresh package',async()=>{
  const f=await fixture(),before=await f.bob.storage.snapshot();
  const altered=structuredClone(f.transfer),intent=JSON.parse(altered.intent);intent.actorOwner='carol';altered.intent=JSON.stringify(intent);
  await assert.rejects(f.bob.runtime.room.acceptWelcome(altered));assert.deepEqual(await f.bob.storage.snapshot(),before);
  f.bob.pins.splice(f.bob.pins.findIndex(p=>p.owner==='carol'),1);
  await assert.rejects(f.bob.runtime.room.acceptWelcome(f.transfer),{code:'mls_untrusted_member'});assert.deepEqual(await f.bob.storage.snapshot(),before);
});
test('initial admission is retry-stable and Welcome storage abort rolls back package consumption and group creation',async()=>{
  const f=await fixture(),snapshot=await f.alice.storage.snapshot();
  assert.deepEqual(await f.alice.runtime.room.create(f.intent,new Map()),f.transfer);assert.deepEqual(await f.alice.storage.snapshot(),snapshot);
  f.bob.storage.rejectNext=true;const before=await f.bob.storage.snapshot();
  await assert.rejects(f.bob.runtime.room.acceptWelcome(f.transfer),{code:'storage_aborted'});assert.deepEqual(await f.bob.storage.snapshot(),before);
  await f.bob.runtime.room.acceptWelcome(f.transfer);const accepted=await f.bob.storage.snapshot();await f.bob.runtime.room.acceptWelcome(f.transfer);
  assert.deepEqual(await f.bob.storage.snapshot(),accepted);
  const bad=structuredClone(f.transfer);bad.tree[bad.tree.length-1]^=1;
  await assert.rejects(f.bob.runtime.room.acceptWelcome(bad),{code:'mls_replay_conflict'});
  await assert.rejects(f.bob.runtime.room.create(f.intent,new Map()),{code:'mls_room_membership_required'});
});

test('room native wire binds nested roster/package fields inside a single signed string and rejects noncanonical encodings',async()=>{
  const f=await fixture(),payload=encodeRoomTransferPayload(f.transfer);assert.deepEqual(decodeRoomTransferPayload(payload),f.transfer);
  const context={owner:'alice',deviceId:'native-login'},op={action:'room-transfer',actorId:f.alice.device.id,requestId:randomUUID(),issuedAt:Date.now(),payload};
  const before=operationBytes(context,op),reservation=JSON.parse(payload.intent),members=JSON.parse(reservation.roster);members[1].fingerprint='0'.repeat(64);
  reservation.roster=JSON.stringify(members);assert.notDeepEqual(operationBytes(context,{...op,payload:{...payload,intent:JSON.stringify(reservation)}}),before);
  for(const value of [{...payload,welcome:payload.welcome+'='},{...payload,tree:'!'}, {...payload,extra:true}, {...payload,intent:'x'.repeat(65537)}])
    assert.throws(()=>decodeRoomTransferPayload(value));
});

test('a valid application signature from another member cannot impersonate the actual MLS sender leaf',async()=>{
  const f=await admitted(),a=(await f.alice.storage.snapshot()).values,b=(await f.bob.storage.snapshot()).values;
  const suite=await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const content={id:randomUUID(),conversationId:f.id,epoch:'1',owner:'bob',deviceId:f.bob.device.id,message:'claimed Bob, encrypted by Alice'};
  const signed=encoder.encode(JSON.stringify(['winga-mls-room-content',1,content.id,f.id,'1','bob',content.deviceId,content.message]));
  const signature=await suite.signature.sign(b['mls:identity'].package.privatePackage.signaturePrivateKey,signed);
  const state={...decodeGroupState(a[`mls:group:${f.id}`].bytes,0)[0],clientConfig:defaultClientConfig},sealed=await createApplicationMessage(state,encoder.encode(JSON.stringify({...content,signature:Array.from(signature)})),suite);
  const ciphertext=encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:sealed.privateMessage});
  const before=await f.carol.storage.snapshot();await assert.rejects(f.carol.runtime.room.receive({...content,ciphertext,hash:digest(ciphertext),sequence:'1',created_at:new Date().toISOString()}),{code:'mls_sender_rejected'});
  assert.deepEqual(await f.carol.storage.snapshot(),before);
});

test('real commit proposal package hash is checked even if a canonical authority incorrectly signs a mismatched reservation',async()=>{
  const f=await admitted(),dave=await participant('dave',f.control);pinAll([...f.people,dave]);
  const reserved=reserve(f,[...f.people,dave].map(member),[addition(dave)],'1');
  const transition=await f.alice.runtime.room.change(reserved,new Map([[dave.device.id,dave.device.keyPackage]]));
  const wrong={...reserved,changes:JSON.stringify([{...addition(dave),packageHash:'0'.repeat(64)}])};f.control.authorize(wrong);
  const before=await f.bob.storage.snapshot();await assert.rejects(f.bob.runtime.room.applyCommit({...transition,intent:JSON.stringify(wrong)}),{code:'mls_room_packages_rejected'});
  assert.deepEqual(await f.bob.storage.snapshot(),before);
});
test('room send retries identical ciphertext after network failure and never reports Sent before storage acceptance',async()=>{
  const f=await admitted(),payload=message(f,'retry without a second ratchet advance');f.control.failSend=true;
  await assert.rejects(f.alice.runtime.room.send(payload),{code:'synthetic_offline'});
  assert.equal((await f.alice.runtime.room.history(f.id))[0].status,'pending');const first=f.control.packets.at(-1);
  await assert.rejects(f.alice.runtime.room.send({...payload,message:'changed'}),{code:'mls_send_retry_conflict'});
  f.control.failSend=false;await f.alice.runtime.retryMessage(payload.clientMessageId);
  assert.deepEqual(f.control.packets.at(-1),first);assert.equal((await f.alice.runtime.room.history(f.id))[0].status,'sent');
  const received=await f.bob.runtime.room.receive(envelope(f.control,first));assert.equal(received.message,payload.message);assert.equal(received.status,'delivered');
});
test('receive CAS failure is retryable while duplicate ciphertext cannot change ID, sender, sequence or timestamp',async()=>{
  const f=await admitted();await f.alice.runtime.room.send(message(f,'atomic receive'));const packet=envelope(f.control,f.control.packets.at(-1));
  const before=await f.bob.storage.snapshot();f.bob.storage.rejectNext=true;
  await assert.rejects(f.bob.runtime.room.receive(packet),{code:'storage_aborted'});assert.deepEqual(await f.bob.storage.snapshot(),before);
  const result=await f.bob.runtime.room.receive(packet),snapshot=await f.bob.storage.snapshot();assert.deepEqual(await f.bob.runtime.room.receive(packet),result);
  assert.deepEqual(await f.bob.storage.snapshot(),snapshot);
  for(const extra of [{deviceId:f.carol.device.id},{sequence:'999'},{created_at:'2026-10-01T00:00:00.000Z'},{epoch:'2'}])
    await assert.rejects(f.bob.runtime.room.receive({...packet,...extra}),{code:'mls_replay_conflict'});
});
test('a fourth owner can join via one real Add commit but receives no old epoch key',async()=>{
  const f=await admitted();await f.alice.runtime.room.send(message(f,'before admission'));const old=envelope(f.control,f.control.packets.at(-1));
  for(const p of [f.bob,f.carol])await p.runtime.room.receive(old);
  const dave=await participant('dave',f.control);pinAll([...f.people,dave]);
  const intent=reserve(f,[...f.people,dave].map(member),[addition(dave)],'1');
  const transition=await f.alice.runtime.room.change(intent,new Map([[dave.device.id,dave.device.keyPackage]]));
  await assert.rejects(f.alice.runtime.room.send(message(f,'not accepted')),{code:'mls_room_membership_pending'});
  for(const p of [f.bob,f.carol])await p.runtime.room.applyCommit(transition);await dave.runtime.room.acceptWelcome(transition);
  await activate([...f.people,dave],f.id);
  await assert.rejects(dave.runtime.room.receive(old),{code:'mls_envelope_binding_rejected'});
  await dave.runtime.room.send(message(f,'new member'));const packet=envelope(f.control,f.control.packets.at(-1));
  for(const p of f.people)assert.equal((await p.runtime.room.receive(packet)).owner,'dave');
});
test('removal rotates the real MLS epoch, freezes retained writers and excludes removed future delivery',async()=>{
  const f=await admitted(),intent=reserve(f,[f.alice,f.bob].map(member),[removal(f.carol)],'1');
  const transition=await f.alice.runtime.room.change(intent);assert.equal(transition.epoch,'2');assert.equal(transition.welcome.length,0);
  await assert.rejects(f.carol.runtime.room.applyCommit(transition),{code:'mls_room_membership_required'});
  await f.bob.runtime.room.applyCommit(transition);await assert.rejects(f.bob.runtime.room.send(message(f,'frozen')),{code:'mls_room_membership_pending'});
  await activate([f.alice,f.bob],f.id);await f.alice.runtime.room.send(message(f,'after removal'));const packet=envelope(f.control,f.control.packets.at(-1));
  assert.equal((await f.bob.runtime.room.receive(packet)).message,'after removal');
  await assert.rejects(f.carol.runtime.room.receive(packet),{code:'mls_room_access_denied'});
  const snapshot=(await f.carol.storage.snapshot()).values,oldState={...decodeGroupState(snapshot[`mls:group:${f.id}`].bytes,0)[0],clientConfig:defaultClientConfig};
  const suite=await getCiphersuiteImpl(getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  await assert.rejects(processPrivateMessage(oldState,decodeMlsMessage(packet.ciphertext,0)[0].privateMessage,emptyPskIndex,suite),error=>!(error instanceof TypeError));
});

test('account removal retires both native leaves in one actual epoch, never an intermediate half-removed account',async()=>{
  const f=await admitted(),sibling=await participant('bob',f.control);pinAll([...f.people,sibling]);
  const add=reserve(f,[...f.people,sibling].map(member),[addition(sibling)],'1');
  const joined=await f.alice.runtime.room.change(add,new Map([[sibling.device.id,sibling.device.keyPackage]]));
  for(const p of [f.bob,f.carol])await p.runtime.room.applyCommit(joined);await sibling.runtime.room.acceptWelcome(joined);await activate([...f.people,sibling],f.id);
  const remove=reserve(f,[f.alice,f.carol].map(member),[removal(f.bob),removal(sibling)],'2');
  const changed=await f.alice.runtime.room.change(remove);assert.equal(changed.epoch,'3');assert.equal(JSON.parse(remove.changes).length,2);
  await f.carol.runtime.room.applyCommit(changed);await activate([f.alice,f.carol],f.id);
  await f.alice.runtime.room.send(message(f,'both Bob devices removed'));const packet=envelope(f.control,f.control.packets.at(-1));
  assert.equal((await f.carol.runtime.room.receive(packet)).message,'both Bob devices removed');
  for(const p of [f.bob,sibling])await assert.rejects(p.runtime.room.receive(packet),{code:'mls_room_access_denied'});
});

test('a singleton real MLS Room confirms exactly its one native proof and remains usable across reload',async()=>{
  const f=await admitted(),intent=reserve(f,[f.alice].map(member),[removal(f.bob),removal(f.carol)],'1');
  await f.alice.runtime.room.change(intent);
  const a=await f.alice.runtime.room.acceptance(f.id);
  await assert.rejects(f.alice.runtime.room.confirm(f.id,[]),{code:'mls_room_acceptance_required'});
  const forged={...a,signature:a.signature.slice()};forged.signature[0]^=1;
  await assert.rejects(f.alice.runtime.room.confirm(f.id,[forged]),{code:'mls_room_acceptance_rejected'});
  await f.alice.runtime.room.confirm(f.id,[a]);
  const rt=await createMlsRuntime(f.alice.options);await rt.initialize();
  await rt.room.send(message(f,'singleton remains confirmed'));assert.equal((await rt.room.history(f.id))[0].status,'sent');
  assert.equal((await f.alice.storage.snapshot()).values[`mls:membership:${f.id}`],undefined);
});

test('removed own-native re-admission uses a fresh Welcome, preserves history and retries without recovering the excluded epoch',async()=>{
  const f=await admitted(),other={...f,id:randomUUID()};
  for(const p of f.people)p.device=await p.runtime.prepareKeyPackage();
  const otherIntent=reserve(other,f.people.map(member),[addition(f.bob),addition(f.carol)]);
  const otherTransfer=await f.alice.runtime.room.create(otherIntent,new Map([[f.bob.device.id,f.bob.device.keyPackage],[f.carol.device.id,f.carol.device.keyPackage]]));
  for(const p of [f.bob,f.carol])await p.runtime.room.acceptWelcome(otherTransfer);await activate(f.people,other.id);
  const otherState=(await f.carol.storage.snapshot()).values[`mls:group:${other.id}`];
  await f.alice.runtime.room.send(message(f,'retained history'));
  await f.carol.runtime.room.receive(envelope(f.control,f.control.packets.at(-1)));
  const remove=reserve(f,[f.alice,f.bob].map(member),[removal(f.carol)],'1'),removed=await f.alice.runtime.room.change(remove);
  await f.bob.runtime.room.applyCommit(removed);await activate([f.alice,f.bob],f.id);
  await f.alice.runtime.room.send(message(f,'excluded epoch'));const excluded=envelope(f.control,f.control.packets.at(-1));
  f.carol.device=await f.carol.runtime.prepareKeyPackage();
  const add=reserve(f,f.people.map(member),[addition(f.carol)],'2'),rejoin=await f.alice.runtime.room.change(add,new Map([[f.carol.device.id,f.carol.device.keyPackage]]));
  await f.bob.runtime.room.applyCommit(rejoin);const before=await f.carol.storage.snapshot();
  f.carol.storage.rejectNext=true;await assert.rejects(f.carol.runtime.room.acceptWelcome(rejoin),{code:'storage_aborted'});
  assert.deepEqual(await f.carol.storage.snapshot(),before);
  await f.carol.runtime.room.acceptWelcome(rejoin);const accepted=await f.carol.storage.snapshot();
  const rt=await createMlsRuntime(f.carol.options);await rt.initialize();await rt.room.acceptWelcome(rejoin);
  assert.deepEqual(await f.carol.storage.snapshot(),accepted);f.carol.runtime=rt;await activate(f.people,f.id);
  const activated=await f.carol.storage.snapshot();await assert.rejects(rt.room.receive(excluded),{code:'mls_envelope_binding_rejected'});
  assert.deepEqual(await f.carol.storage.snapshot(),activated);
  assert.deepEqual(activated.values[`mls:group:${other.id}`],otherState);
  await f.alice.runtime.room.send(message(f,'after re-admission'));
  await rt.room.receive(envelope(f.control,f.control.packets.at(-1)));
  assert.deepEqual((await rt.room.history(f.id)).map(m=>m.message),['retained history','after re-admission']);
});

test('fresh own-native Welcome cannot discard unresolved text, media or lifecycle journals, or overwrite an unconfirmed group',async()=>{
  const f=await admitted();f.control.failSend=true;await assert.rejects(f.carol.runtime.room.send(message(f,'unresolved')));f.control.failSend=false;
  const remove=reserve(f,[f.alice,f.bob].map(member),[removal(f.carol)],'1'),removed=await f.alice.runtime.room.change(remove);
  await f.bob.runtime.room.applyCommit(removed);await activate([f.alice,f.bob],f.id);
  f.carol.device=await f.carol.runtime.prepareKeyPackage();const add=reserve(f,f.people.map(member),[addition(f.carol)],'2');
  const rejoin=await f.alice.runtime.room.change(add,new Map([[f.carol.device.id,f.carol.device.keyPackage]])),before=await f.carol.storage.snapshot();
  await assert.rejects(f.carol.runtime.room.acceptWelcome(rejoin),{code:'mls_pending_send_requires_retry'});assert.deepEqual(await f.carol.storage.snapshot(),before);
  const mediaKey='media:pending:'+randomUUID();await f.carol.storage.write({expectedRevision:before.revision,
    values:{[mediaKey]:{conversationId:f.id}},deleted:Object.keys(before.values).filter(k=>k.startsWith('mls:outbox:'))});
  const media=await f.carol.storage.snapshot();await assert.rejects(f.carol.runtime.room.acceptWelcome(rejoin),{code:'mls_pending_send_requires_retry'});
  assert.deepEqual(await f.carol.storage.snapshot(),media);
  await f.carol.storage.write({expectedRevision:media.revision,values:{['room:leave:'+f.id]:{conversationId:f.id}},deleted:[mediaKey]});
  const leaving=await f.carol.storage.snapshot();await assert.rejects(f.carol.runtime.room.acceptWelcome(rejoin),{code:'mls_room_membership_pending'});
  assert.deepEqual(await f.carol.storage.snapshot(),leaving);
  const row=leaving.values[`mls:group:${f.id}`];await f.carol.storage.write({expectedRevision:leaving.revision,values:{[`mls:group:${f.id}`]:{...row,confirmed:false}}});
  await assert.rejects(f.carol.runtime.room.acceptWelcome(rejoin),{code:'mls_group_exists'});
});
test('unauthorized canonical reservation, stale revision and an offline outbox cannot produce a room membership commit',async()=>{
  const f=await admitted(),intent=reserve(f,[f.alice,f.bob].map(member),[removal(f.carol)],'1');
  await assert.rejects(f.alice.runtime.room.change({...intent,revision:'3'}),{code:'mls_room_authorization_rejected'});
  f.control.failSend=true;await assert.rejects(f.alice.runtime.room.send(message(f,'pending')));
  await assert.rejects(f.alice.runtime.room.change(intent),{code:'mls_pending_send_requires_retry'});
});

test('member role cannot authorize membership writes even if an incorrect canonical authority signs the request',async()=>{
  const f=await admitted(),base=reserve(f,[f.alice,f.bob].map(member),[removal(f.carol)],'1');
  const intent={...base,actorOwner:'bob',actorDeviceId:f.bob.device.id};f.control.authorize(intent);
  const before=await f.bob.storage.snapshot();await assert.rejects(f.bob.runtime.room.change(intent),{code:'mls_room_admin_required'});
  assert.deepEqual(await f.bob.storage.snapshot(),before);
});

test('a role promotion cannot be smuggled into an Add/Remove transfer and historical accepted roles stay sealed by epoch',async()=>{
  const f=await admitted();await f.alice.runtime.room.send(message(f,'epoch one'));for(const p of [f.bob,f.carol])await p.runtime.room.receive(envelope(f.control,f.control.packets.at(-1)));
  const intent=reserve(f,[f.alice,f.bob].map(member),[removal(f.carol)],'1'),promoted={...intent,
    roles:JSON.stringify([{owner:'alice',role:'admin'},{owner:'bob',role:'admin'}])};f.control.authorize(promoted);
  await assert.rejects(f.alice.runtime.room.change(promoted),{code:'mls_room_roles_rejected'});
  f.control.authorize(intent);const transition=await f.alice.runtime.room.change(intent);f.control.authorize(promoted);
  await assert.rejects(f.bob.runtime.room.applyCommit({...transition,intent:JSON.stringify(promoted)}),{code:'mls_room_roles_rejected'});
  f.control.authorize(intent);await f.bob.runtime.room.applyCommit(transition);await activate([f.alice,f.bob],f.id);
  const epochs=await f.alice.runtime.room.epochs(f.id);assert.equal(epochs.get('1').length,3);assert.equal(epochs.get('2').length,2);
  assert.equal(epochs.get('2').find(m=>m.owner==='bob').role,'member');epochs.get('1')[0].role='bad';
  assert.notEqual((await f.alice.runtime.room.epochs(f.id)).get('1')[0].role,'bad');
});

test('room device limits are explicit and cannot admit a fifth native leaf for one owner',async()=>{
  const f=await fixture(),members=JSON.parse(f.intent.roster),changes=JSON.parse(f.intent.changes);
  for(let i=0;i<4;i++){const id=randomUUID();members.push({owner:'alice',id,fingerprint:digest(encoder.encode(id)),key:Array.from(webcrypto.getRandomValues(new Uint8Array(32)))});
    changes.push({type:'add',owner:'alice',id,packageHash:digest(encoder.encode('package:'+id))});}
  const rejected={...f.intent,id:randomUUID(),roster:JSON.stringify(sortMembers(members)),changes:JSON.stringify(changes.sort((a,b)=>a.id<b.id?-1:1))};f.control.authorize(rejected);
  await assert.rejects(f.alice.runtime.room.create(rejected,new Map()),{code:'mls_room_roster_rejected'});
});
test('session replacement during authority I/O aborts before exposing membership or committing a send result',async()=>{
  const f=await admitted(),old=f.alice.options.roomAuthorization.check;
  f.alice.options.roomAuthorization.check=async(...args)=>{const reply=await old(...args);f.alice.session.token=randomUUID();return reply;};
  const before=await f.alice.storage.snapshot();await assert.rejects(f.alice.runtime.room.send(message(f,'must not be sent')),{code:'mls_session_changed'});
  assert.deepEqual(await f.alice.storage.snapshot(),before);assert.equal(f.control.packets.length,0);
});
test('bounded native room load: 72 ciphertexts, three senders and two receivers each converge one encrypted product/poll board',async t=>{
  const f=await admitted(),options=[{id:randomUUID(),label:'One'},{id:randomUUID(),label:'Two'}],pollId=randomUUID(),start=performance.now();
  const events=[{clientMessageId:randomUUID(),message:encodeRoomContent('product-share',{productId:'canonical-product',note:'Private',snapshot:null})},
    {clientMessageId:pollId,message:encodeRoomContent('poll-create',{question:'Choose?',options,closesAt:null})}];
  for(let i=2;i<72;i++)events.push({clientMessageId:randomUUID(),message:encodeRoomContent('poll-vote',{pollId,optionId:options[i%2].id})});
  const latencies=[];
  // Separate native owner locks run concurrently; each owner's sender chain stays ordered.
  for(let i=0;i<events.length;i++) {
    const sender=i<2?f.alice:f.people[i%3],at=performance.now();await sender.runtime.room.send({conversationId:f.id,...events[i]});
    const packet=envelope(f.control,f.control.packets.at(-1));await Promise.all(f.people.filter(p=>p!==sender).map(p=>p.runtime.room.receive(packet)));
    latencies.push(performance.now()-at);
  }
  const boards=[];for(const p of f.people){const history=await p.runtime.room.history(f.id);assert.equal(history.length,72);
    boards.push(projectRoomContent(history,{conversationId:f.id,epochs:await p.runtime.room.epochs(f.id)}));}
  assert.deepEqual(boards[0],boards[1]);assert.deepEqual(boards[1],boards[2]);assert.equal(Object.keys(boards[0].polls[0].ballots).length,3);
  assert.equal(f.control.sent.size,72);assert.ok(f.control.packets.every(p=>!Buffer.from(p.ciphertext).includes(Buffer.from('canonical-product'))));
  latencies.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({scope:'local-native-MLS-room-with-synthetic-signed-authority',owners:3,uniqueMessages:72,
    receiverDecryptions:144,duplicateRows:0,durationMs:Math.round(performance.now()-start),p95RoundtripMs:Math.round(latencies[Math.ceil(latencies.length*.95)-1]),
    roomBackendVerified:false,productionLoadProven:false}));
});

test('concurrent native sender locks preserve 24 unique messages and all receiver chains across one room',async t=>{
  const f=await admitted(),jobs=f.people.flatMap(p=>Array.from({length:8},(_,i)=>({sender:p,payload:message(f,p.owner+' concurrent '+i)})));
  const start=performance.now();await Promise.all(jobs.map(j=>j.sender.runtime.room.send(j.payload)));
  const packets=[...f.control.packets].sort((a,b)=>BigInt(f.control.sent.get(a.id).sequence)<BigInt(f.control.sent.get(b.id).sequence)?-1:1);
  await Promise.all(packets.flatMap(packet=>f.people.filter(p=>p.device.id!==packet.deviceId).map(p=>p.runtime.room.receive(envelope(f.control,packet)))));
  const results=[];for(const p of f.people)results.push((await p.runtime.room.history(f.id)).map(v=>[v.id,v.owner,v.message,v.sequence]));
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);assert.equal(results[0].length,24);assert.equal(f.control.sent.size,24);
  t.diagnostic(JSON.stringify({scope:'local-MLS-native-rooms',simultaneousQueuedSends:24,nativeOwnerLocks:3,uniqueMessages:24,receiverDecryptions:48,
    durationMs:Math.round(performance.now()-start),roomBackendVerified:false,productionSloProven:false}));
});
