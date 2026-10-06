const {test}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createEncryptedConversationStore,operationBytes}=require('../backend/encrypted-conversations');
const {createEncryptedConversationsApi}=require('../backend/encrypted-conversations-api');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t,options={}) {
  const db=new PGlite();t.after(()=>db.close());await db.exec(require('./helpers/conversation-event-fixture'));
  for(const name of ['message-web-push','conversation-notification-preferences','conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery'])
    await db.transaction(async tx=>{for(const sql of require(`../backend/migrations/${name}`).statements)await tx.exec(sql);});
  for(const sql of require('../backend/migrations/encrypted-device-admissions').statements)await db.exec(sql);
  const mls=await import('ts-mls'),suite=await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const members={};
  for(const [owner,token]of [['alice','a'],['bob','b1'],['eve','e']]) {
    const keys=crypto.generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32);
    const member={id:crypto.randomUUID(),keys,context:{owner,deviceId:token,token},fingerprint:hash(publicKey)};
    await db.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,$2,$3,$4,'active')`,[member.id,owner,publicKey.toString('base64url'),member.fingerprint]);
    const seconds=BigInt(Math.floor(Date.now()/1000));
    member.pkg=await mls.generateKeyPackage({credentialType:'basic',identity:new TextEncoder().encode(JSON.stringify(['winga-mls-device',1,owner,member.id,member.fingerprint]))},mls.defaultCapabilities(),{notBefore:seconds-10n,notAfter:seconds+86400n},[],suite);
    const bytes=Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_key_package',keyPackage:member.pkg.publicPackage}));member.hash=hash(bytes);
    await db.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,$3,$4,'{}',NOW()+interval '1 day')`,[member.hash,member.id,bytes.toString('base64url'),Buffer.from(member.pkg.publicPackage.leafNode.signaturePublicKey).toString('base64url')]);
    member.sign=(action,payload,requestId=crypto.randomUUID())=>{
      const op={action,actorId:member.id,requestId,issuedAt:Date.now(),payload};op.signature=crypto.sign(null,operationBytes(member.context,op),keys.privateKey).toString('base64url');return op;
    };
    members[owner]=member;
  }
  const store=createEncryptedConversationStore({withTransaction:work=>db.transaction(work),mediaEnabled:true,enqueuePush:require('../backend/message-web-push').enqueueMessagePush,...options}),id=crypto.randomUUID(),transferId=crypto.randomUUID();
  const reserve={conversationId:id,peer:'bob',sourceHash:members.alice.hash,targetHash:members.bob.hash};
  const call=(owner,action,payload)=>store.encryptedOperation(members[owner].context,members[owner].sign(action,payload));
  let group=await mls.createGroup(new TextEncoder().encode(id),members.alice.pkg.publicPackage,members.alice.pkg.privatePackage,[],suite);
  const committed=await mls.createCommit({state:group,cipherSuite:suite},{extraProposals:[{proposalType:'add',add:{keyPackage:members.bob.pkg.publicPackage}}]});group=committed.newState;
  const {encodeRatchetTree}=await import('ts-mls/ratchetTree.js');
  const transfer={id:transferId,conversationId:id,epoch:'1',packageHash:members.bob.hash,
    commit:Buffer.from(mls.encodeMlsMessage(committed.commit)).toString('base64url'),welcome:Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:committed.welcome})).toString('base64url'),tree:Buffer.from(encodeRatchetTree(group.ratchetTree)).toString('base64url')};
  const privateMessage=await mls.createApplicationMessage(group,new TextEncoder().encode('server must not receive this'),suite);
  const ciphertext=Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:privateMessage.privateMessage}));
  const packet={id:crypto.randomUUID(),conversationId:id,epoch:'1',deviceId:members.alice.id,ciphertext:ciphertext.toString('base64url'),hash:hash(ciphertext)};
  const active=async()=>{await call('alice','reserve',reserve);await call('alice','transfer',transfer);await call('bob','accept',{conversationId:id,transferId});};
  return {db,members,store,id,reserve,transfer,packet,call,active,mls,suite,group:privateMessage.newState,committed};
}

async function newMember(f,label,owner) {
  const keys=crypto.generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32);
  const member={id:crypto.randomUUID(),keys,context:{...f.members[owner].context},fingerprint:hash(publicKey)};
  await f.db.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,$2,$3,$4,'active')`,[member.id,owner,publicKey.toString('base64url'),member.fingerprint]);
  const seconds=BigInt(Math.floor(Date.now()/1000));
  member.pkg=await f.mls.generateKeyPackage({credentialType:'basic',identity:new TextEncoder().encode(JSON.stringify(['winga-mls-device',1,owner,member.id,member.fingerprint]))},f.mls.defaultCapabilities(),{notBefore:seconds-10n,notAfter:seconds+86400n},[],f.suite);
  const bytes=Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_key_package',keyPackage:member.pkg.publicPackage}));member.hash=hash(bytes);
  await f.db.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,$3,$4,'{}',NOW()+interval '1 day')`,[member.hash,member.id,bytes.toString('base64url'),Buffer.from(member.pkg.publicPackage.leafNode.signaturePublicKey).toString('base64url')]);
  member.sign=(action,payload)=>{const op={action,actorId:member.id,requestId:crypto.randomUUID(),issuedAt:Date.now(),payload};op.signature=crypto.sign(null,operationBytes(member.context,op),keys.privateKey).toString('base64url');return op;};
  f.members[label]=member;return member;
}

async function admissionPacket(f,target) {
  const intent={id:crypto.randomUUID(),conversationId:f.id,previousEpoch:'1',actorOwner:'alice',actorDeviceId:f.members.alice.id,
    addedOwner:target.context.owner,addedDeviceId:target.id,packageHash:target.hash};
  const committed=await f.mls.createCommit({state:f.group,cipherSuite:f.suite},
    {extraProposals:[{proposalType:'add',add:{keyPackage:target.pkg.publicPackage}}]});
  const roster=committed.newState.ratchetTree.filter(n=>n?.nodeType==='leaf').map(n=>{
    const credential=JSON.parse(new TextDecoder().decode(n.leaf.credential.identity));
    return {owner:credential[2],id:credential[3],fingerprint:credential[4],key:Array.from(n.leaf.signaturePublicKey)};
  }).sort((a,b)=>`${a.owner}/${a.id}`<`${b.owner}/${b.id}`?-1:1);
  const {encodeRatchetTree}=await import('ts-mls/ratchetTree.js');
  const transfer={...intent,version:2,epoch:'2',roster:JSON.stringify(roster),
    commit:Buffer.from(f.mls.encodeMlsMessage(committed.commit)).toString('base64url'),
    welcome:Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:committed.welcome})).toString('base64url'),
    tree:Buffer.from(encodeRatchetTree(committed.newState.ratchetTree)).toString('base64url')};
  const acceptance={conversationId:f.id,transferId:intent.id,epoch:'2',transferHash:hash(JSON.stringify(transfer,Object.keys(transfer).sort()))};
  return {intent,transfer,acceptance,committed};
}

test('native device admission freezes all writers and activates only after every retained and new endpoint accepts',async t=>{
  const f=await fixture(t,{multiDeviceEnabled:true});await f.active();const next=await newMember(f,'next','alice'),a=await admissionPacket(f,next);
  await f.call('alice','device-reserve',a.intent);await f.call('alice','device-reserve',a.intent);
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_membership_pending'});
  await assert.rejects(f.call('alice','media-reserve',{id:crypto.randomUUID(),conversationId:f.id,messageId:f.packet.id,bytes:32,sha256:'a'.repeat(64)}),{code:'encrypted_membership_pending'});
  await assert.rejects(f.call('alice','device-retire',a.intent),{code:'encrypted_device_admission_exists'});
  await f.call('alice','device-transfer',a.transfer);await f.call('alice','device-transfer',a.transfer);
  const pending=(await f.call('next','poll',{})).groups[0];assert.equal(pending.status,'device-pending');assert.equal(pending.messages.length,0);
  await assert.rejects(f.call('eve','device-accept',a.acceptance),{code:'encrypted_membership_required'});
  await assert.rejects(f.call('next','device-accept',{...a.acceptance,transferHash:'a'.repeat(64)}),{code:'encrypted_device_admission_conflict'});
  assert.equal((await f.call('next','device-accept',a.acceptance)).status,'pending');
  assert.equal((await f.call('bob','device-accept',a.acceptance)).status,'pending');
  assert.equal((await f.db.query('SELECT epoch FROM encrypted_conversations WHERE id=$1',[f.id])).rows[0].epoch,'1');
  assert.equal((await f.call('alice','device-accept',a.acceptance)).status,'active');
  assert.equal((await f.call('alice','device-accept',a.acceptance)).status,'active');
  const admitted=(await f.call('next','poll',{})).groups[0];assert.equal(admitted.status,'active');assert.equal(admitted.roster.length,3);
  assert.equal(admitted.admission.acceptances.length,3);assert.equal(admitted.epoch,'2');
  assert.equal((await f.db.query(`SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch='1'`,[f.id])).rows[0].n,2);
  await assert.rejects(f.call('alice','replace-reserve',{id:crypto.randomUUID(),conversationId:f.id,previousEpoch:'2',removedDeviceId:f.members.bob.id,
    replacementDeviceId:next.id,packageHash:next.hash}),{code:'encrypted_multidevice_replacement_required'});
});

test('sibling synchronization is independently acknowledged without falsely delivering or reading a peer message',async t=>{
  const f=await fixture(t,{multiDeviceEnabled:true});await f.active();const next=await newMember(f,'next','alice'),a=await admissionPacket(f,next);
  await f.call('alice','device-reserve',a.intent);await f.call('alice','device-transfer',a.transfer);
  for(const name of ['alice','bob','next'])await f.call(name,'device-accept',a.acceptance);
  const application=await f.mls.createApplicationMessage(a.committed.newState,new TextEncoder().encode('encrypted sibling copy'),f.suite);
  const bytes=Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:application.privateMessage}));
  const packet={...f.packet,id:crypto.randomUUID(),epoch:'2',ciphertext:bytes.toString('base64url'),hash:hash(bytes)};
  await f.call('alice','send',packet);assert.equal((await f.call('next','poll',{})).groups[0].messages.length,1);
  const ack={id:packet.id,conversationId:f.id,epoch:'2',hash:packet.hash};
  await assert.rejects(f.call('next','receipt',{...ack,kind:'delivered'}),{code:'encrypted_receipt_rejected'});
  await assert.rejects(f.call('bob','sync-ack',ack),{code:'encrypted_receipt_rejected'});
  await f.call('next','sync-ack',ack);await f.call('next','sync-ack',ack);
  assert.equal((await f.call('next','poll',{})).groups[0].messages.length,0);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n,0);
  await f.call('bob','receipt',{...ack,kind:'delivered'});
  assert.equal((await f.call('alice','poll',{})).groups[0].receipts.length,1);
  assert.equal((await f.call('next','poll',{})).groups[0].receipts.length,1);
  await f.call('next','receipt-ack',{...ack,kind:'delivered',receiptDeviceId:f.members.bob.id});
  assert.equal((await f.call('next','poll',{})).groups[0].receipts.length,0);
  assert.equal((await f.call('alice','poll',{})).groups[0].receipts.length,1);
});

test('device admission drains every old-epoch inbox and excludes new endpoints from historical traffic',async t=>{
  const f=await fixture(t,{multiDeviceEnabled:true});await f.active();const next=await newMember(f,'next','bob'),a=await admissionPacket(f,next);
  await f.call('alice','send',f.packet);
  await assert.rejects(f.call('alice','device-reserve',a.intent),{code:'encrypted_device_inbox_pending'});
  await f.call('bob','receipt',{id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,kind:'delivered'});
  await f.call('alice','device-reserve',a.intent);await f.call('alice','device-transfer',a.transfer);
  for(const name of ['alice','bob','next'])await f.call(name,'device-accept',a.acceptance);
  const joined=(await f.call('next','poll',{})).groups[0];assert.equal(joined.messages.length,0);assert.equal(joined.receipts.length,0);
  await assert.rejects(f.call('next','receipt',{id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,kind:'read'}),{code:'encrypted_receipt_rejected'});
});

test('native admission rejects mutated rosters, revoked targets, competing reservations and delayed retired intents',async t=>{
  const f=await fixture(t,{multiDeviceEnabled:true});await f.active();const next=await newMember(f,'next','bob'),a=await admissionPacket(f,next);
  const retired={...a.intent,id:crypto.randomUUID()};await f.call('alice','device-retire',retired);
  await assert.rejects(f.call('alice','device-reserve',retired),{code:'encrypted_device_admission_retired'});
  await f.call('alice','device-reserve',a.intent);
  await assert.rejects(f.call('alice','device-reserve',{...a.intent,id:crypto.randomUUID()}),{code:'encrypted_device_admission_conflict'});
  const wrong=JSON.parse(a.transfer.roster);wrong[0].owner='eve';
  await assert.rejects(f.call('alice','device-transfer',{...a.transfer,roster:JSON.stringify(wrong)}),{code:'encrypted_device_roster_rejected'});
  await f.call('alice','device-transfer',a.transfer);
  await assert.rejects(f.call('alice','device-transfer',{...a.transfer,tree:a.transfer.tree.slice(0,-1)}));
  await f.db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE id=$1",[next.id]);
  await assert.rejects(f.call('alice','device-accept',a.acceptance),{code:'encrypted_access_denied'});
  assert.equal((await f.db.query('SELECT epoch FROM encrypted_conversations WHERE id=$1',[f.id])).rows[0].epoch,'1');
});

test('multi-device actions remain unavailable when their production gate is disabled',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'next','alice'),a=await admissionPacket(f,next);
  await assert.rejects(f.call('alice','device-reserve',a.intent),{code:'encrypted_multidevice_disabled'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_device_admissions')).rows[0].n,0);
});

test('new encrypted chat quota is durable, owner-wide, transactional and does not charge exact retries',async t=>{
  const f=await fixture(t),withTransaction=work=>f.db.transaction(work);
  const limited=createEncryptedConversationStore({withTransaction,newConversationLimitPerHour:1});
  const invoke=(member,payload)=>limited.encryptedOperation(member.context,member.sign('reserve',payload));
  await assert.rejects(invoke(f.members.alice,{...f.reserve,targetHash:'missing'}),{code:'encrypted_package_unavailable'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM api_rate_limit_buckets')).rows[0].n,0);
  await invoke(f.members.alice,f.reserve);
  const anotherNode=createEncryptedConversationStore({withTransaction,newConversationLimitPerHour:1});
  await anotherNode.encryptedOperation(f.members.alice.context,f.members.alice.sign('reserve',f.reserve));
  assert.equal((await f.db.query('SELECT count FROM api_rate_limit_buckets')).rows[0].count,1);
  const fresh=await newMember(f,'freshAlice','alice');
  const second={conversationId:crypto.randomUUID(),peer:'eve',sourceHash:fresh.hash,targetHash:f.members.eve.hash};
  await assert.rejects(invoke(fresh,second),error=>error.status===429 && error.code==='encrypted_new_conversation_limit'
    && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds>0 && error.retryAfterSeconds<=3600);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,1);
  assert.equal((await f.db.query("SELECT COUNT(*)::int AS n FROM conversation_event_streams WHERE participant_high='eve'")).rows[0].n,0);
  assert.equal((await f.db.query('SELECT consumed_at FROM conversation_crypto_key_packages WHERE hash=$1',[fresh.hash])).rows[0].consumed_at,null);
  assert.equal((await f.db.query('SELECT count FROM api_rate_limit_buckets')).rows[0].count,1);
  const rollbackProbe=createEncryptedConversationStore({withTransaction,newConversationLimitPerHour:2});
  await assert.rejects(rollbackProbe.encryptedOperation(fresh.context,fresh.sign('reserve',{...second,conversationId:f.id})),{code:'23505'});
  assert.equal((await f.db.query('SELECT count FROM api_rate_limit_buckets')).rows[0].count,1);
  await f.db.query("INSERT INTO user_blocks VALUES('eve','alice')");
  await assert.rejects(invoke(fresh,second),{code:'encrypted_access_denied'});
  await f.db.query('DELETE FROM user_blocks');
  const bob=await newMember(f,'freshBob','bob');
  await invoke(bob,{...second,conversationId:crypto.randomUUID(),sourceHash:bob.hash});
  const buckets=(await f.db.query('SELECT key_hash,scope,count FROM api_rate_limit_buckets')).rows;
  assert.equal(buckets.length,2);assert(buckets.every(row=>/^[a-f0-9]{64}$/.test(row.key_hash) && row.count===1 && row.scope==='encrypted-new-conversations'));
  const eve=await newMember(f,'freshEve','eve'),later=Date.now()+3600000;
  const nextWindow=createEncryptedConversationStore({withTransaction,newConversationLimitPerHour:1,now:()=>later});
  const operation=fresh.sign('reserve',{...second,targetHash:eve.hash});operation.issuedAt=later;
  operation.signature=crypto.sign(null,operationBytes(fresh.context,operation),fresh.keys.privateKey).toString('base64url');
  await nextWindow.encryptedOperation(fresh.context,operation);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,3);
});

test('invalid new-conversation quota configuration cannot silently disable enforcement',()=>{
  for(const value of [0,-1,1.5,'invalid',Infinity,1001])
    assert.throws(()=>createEncryptedConversationStore({withTransaction:()=>{},newConversationLimitPerHour:value}),/quota/i);
});

test('encrypted quota response retains private headers and exposes only bounded retry timing',async()=>{
  let response;
  const api=createEncryptedConversationsApi({enabled:true,collectBody:async()=>({}),findSession:()=>({username:'alice',token:'a',sessionId:'a'}),
    readAuthToken:()=>'',ensureMarketplaceUser:session=>session,getPostgresStore:()=>({encryptedOperation:async()=>{
      throw Object.assign(new Error('internal details'),{status:429,code:'encrypted_new_conversation_limit',retryAfterSeconds:17});
    }}),sendJson:(_,status,body,headers)=>response={status,body,headers}});
  await api.handle({method:'POST'},{},new URL('https://localhost/api/conversations/encrypted/operations'));
  assert.equal(response.status,429);assert.deepEqual(response.body,{code:'encrypted_new_conversation_limit'});
  assert.equal(response.headers['Retry-After'],'17');assert.equal(response.headers['Cache-Control'],'private, no-store');
});

test('definitively refused reservation can be retired, exact delayed requests cannot resurrect it, and a fresh intent succeeds',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'next','bob'),r=await replacementPacket(f,next);
  await f.db.query("UPDATE conversation_crypto_key_packages SET expires_at=NOW()-interval '1 second' WHERE hash=$1",[next.hash]);
  await assert.rejects(f.call('alice','replace-reserve',r.intent),{code:'encrypted_package_unavailable'});
  await assert.rejects(f.call('bob','replace-retire',r.intent),{code:'encrypted_replacement_conflict'});
  await f.db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE id=$1",[f.members.bob.id]);
  const retired=await f.call('alice','replace-retire',r.intent);assert.equal(retired.status,'retired');
  assert.deepEqual(await f.call('alice','replace-retire',r.intent),retired);
  await f.db.query("UPDATE conversation_crypto_key_packages SET expires_at=NOW()+interval '1 day' WHERE hash=$1",[next.hash]);
  await assert.rejects(f.call('alice','replace-reserve',r.intent),{code:'encrypted_replacement_retired'});
  const fresh={...r.intent,id:crypto.randomUUID()};await f.call('alice','replace-reserve',fresh);
  await assert.rejects(f.call('alice','replace-retire',fresh),{code:'encrypted_replacement_exists'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n,1);
});

test('signed group polling follows keyset pages past 100 including a pending replacement and concurrent insertions',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'next','bob'),r=await replacementPacket(f,next);
  await f.call('alice','replace-reserve',r.intent);
  async function seed(n) {
    const peer='peer'+n,id='00000000-0000-4000-8000-'+String(n).padStart(12,'0'),device=crypto.randomUUID();
    await f.db.query('INSERT INTO users(username) VALUES($1)',[peer]);
    await f.db.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status)
      SELECT $1,$2,public_key,fingerprint,'active' FROM conversation_crypto_devices WHERE id=$3`,[device,peer,f.members.bob.id]);
    const cid=(await f.db.query('SELECT winga_ensure_conversation($1,$2) AS id',['alice',peer])).rows[0].id;
    await f.db.query(`INSERT INTO encrypted_conversations(id,canonical_id,creator,recipient,creator_device,recipient_device,source_hash,target_hash,status)
      VALUES($1,$2,'alice',$3,$4,$5,$6,$7,'active')`,[id,cid,peer,f.members.alice.id,device,f.members.alice.hash,f.members.bob.hash]);return id;
  }
  for(let n=1;n<=100;n++)await seed(n);
  const first=await f.call('alice','poll',{});assert.equal(first.groups.length,100);assert.equal(first.next,first.groups.at(-1).id);
  const late=await seed(0),second=await f.call('alice','poll',{after:first.next});
  assert.equal(second.groups.length,1);assert.equal(second.groups[0].id,f.id);assert.equal(second.groups[0].status,'replacement-reserved');assert.equal(second.next,null);
  assert.equal(new Set([...first.groups,...second.groups].map(g=>g.id)).size,101);
  assert.equal((await f.call('alice','poll',{})).groups[0].id,late);
  assert.deepEqual((await f.call('eve','poll',{after:first.next})).groups,[]);
  await assert.rejects(f.call('alice','poll',{after:'not-a-cursor'}),{code:'encrypted_operation_invalid'});
});
async function replacementPacket(f,next,issuer='alice') {
  let state=f.group;
  if(issuer==='bob')state=await f.mls.joinGroup(f.committed.welcome,f.members.bob.pkg.publicPackage,f.members.bob.pkg.privatePackage,f.mls.emptyPskIndex,f.suite,f.committed.newState.ratchetTree);
  const removedOwner=issuer==='alice'?'bob':'alice';
  const changed=await f.mls.createCommit({state,cipherSuite:f.suite},{extraProposals:[
    {proposalType:'remove',remove:{removed:issuer==='alice'?1:0}}, {proposalType:'add',add:{keyPackage:next.pkg.publicPackage}}
  ]});
  const intent={id:crypto.randomUUID(),conversationId:f.id,previousEpoch:'1',removedDeviceId:f.members[removedOwner].id,replacementDeviceId:next.id,packageHash:next.hash};
  const {encodeRatchetTree}=await import('ts-mls/ratchetTree.js');
  const transfer={...intent,epoch:'2',commit:Buffer.from(f.mls.encodeMlsMessage(changed.commit)).toString('base64url'),
    welcome:Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:changed.welcome})).toString('base64url'),tree:Buffer.from(encodeRatchetTree(changed.newState.ratchetTree)).toString('base64url')};
  const sealed=await f.mls.createApplicationMessage(changed.newState,new TextEncoder().encode('replacement epoch secret'),f.suite);
  const bytes=Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:sealed.privateMessage}));
  return {intent,transfer,accept:{conversationId:f.id,transferId:intent.id,epoch:'2'},packet:{id:crypto.randomUUID(),conversationId:f.id,epoch:'2',deviceId:f.members[issuer].id,ciphertext:bytes.toString('base64url'),hash:hash(bytes)}};
}

test('replacement freezes traffic, admits only verified target, retains old epoch authorization and retries exactly',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'next','bob'),r=await replacementPacket(f,next);
  const m=privateStorage(f);await m.reserve();await m.storage.put(m.context('alice','upload'),m.object,m.bytes);await f.store.completeEncryptedMediaUpload(m.context('alice','upload'),m.object);
  await f.call('alice','send',{...f.packet,mediaId:m.object.id});
  await f.db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE id=$1",[f.members.bob.id]);
  await f.call('alice','replace-reserve',r.intent);await f.call('alice','replace-reserve',r.intent);
  await assert.rejects(f.call('alice','replace-reserve',{...r.intent,id:crypto.randomUUID()}),{code:'encrypted_replacement_conflict'});
  await assert.rejects(f.call('next','replace-accept',r.accept),{code:'encrypted_membership_required'});
  await f.call('alice','replace-transfer',r.transfer);await f.call('alice','replace-transfer',r.transfer);
  await assert.rejects(f.call('alice','replace-transfer',{...r.transfer,tree:'AQ'}),{code:'encrypted_transfer_conflict'});
  const waiting=(await f.call('next','poll',{})).groups[0];assert.equal(waiting.status,'replacement-pending');assert.equal(waiting.messages.length,0);
  await assert.rejects(f.call('alice','replace-accept',r.accept),{code:'encrypted_membership_required'});
  await f.call('next','replace-accept',r.accept);await f.call('next','replace-accept',r.accept);
  await f.call('alice','replace-transfer',r.transfer);await f.call('alice','replace-reserve',r.intent);
  const g=(await f.call('alice','poll',{})).groups[0];assert.equal(g.epoch,'2');assert.equal(g.recipient_device,next.id);assert.equal(g.replacement.acceptance.actorId,next.id);
  assert.equal((await f.call('next','poll',{})).groups[0].messages.length,0);
  await assert.rejects(f.call('next','receipt',{id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,kind:'delivered'}),{code:'encrypted_receipt_rejected'});
  const context={...next.context,proof:next.sign('media-download',m.object)};
  await assert.rejects(m.storage.get(context,m.object),{code:'private_media_access_rejected'});
  assert.deepEqual(await m.storage.get(m.context('alice','download'),m.object),m.bytes);
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_operation_invalid'});
  await f.call('alice','send',r.packet);assert.equal((await f.call('next','poll',{})).groups[0].messages[0].id,r.packet.id);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_epochs')).rows[0].n,2);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n,1);
});

test('recipient can replace the creator without changing participant roles and retired active devices lose membership',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'next','alice'),r=await replacementPacket(f,next,'bob');
  await f.call('bob','replace-reserve',r.intent);
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_membership_pending'});
  await f.call('bob','replace-transfer',r.transfer);await f.call('next','replace-accept',r.accept);
  const g=(await f.call('bob','poll',{})).groups[0];assert.equal(g.creator,'alice');assert.equal(g.creator_device,next.id);assert.equal(g.recipient_device,f.members.bob.id);
  assert.deepEqual((await f.call('alice','poll',{})).groups,[]);
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_membership_required'});
  await f.call('bob','send',r.packet);assert.equal((await f.call('next','poll',{})).groups[0].messages.length,1);
});

test('replacement rejects outsiders, changed epochs, wrong owners, pending targets and block policy without consuming packages',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'next','bob'),r=await replacementPacket(f,next);
  await assert.rejects(f.call('eve','replace-reserve',r.intent),{code:'encrypted_membership_required'});
  await assert.rejects(f.call('alice','replace-reserve',{...r.intent,previousEpoch:'2'}),{code:'encrypted_replacement_conflict'});
  await assert.rejects(f.call('alice','replace-reserve',{...r.intent,replacementDeviceId:f.members.eve.id,packageHash:f.members.eve.hash}),{code:'encrypted_package_unavailable'});
  await f.db.query("UPDATE conversation_crypto_devices SET status='pending' WHERE id=$1",[next.id]);
  await assert.rejects(f.call('alice','replace-reserve',r.intent),{code:'encrypted_package_unavailable'});
  await f.db.query("UPDATE conversation_crypto_devices SET status='active' WHERE id=$1",[next.id]);await f.db.query("INSERT INTO user_blocks VALUES('bob','alice')");
  await assert.rejects(f.call('alice','replace-reserve',r.intent),{code:'encrypted_access_denied'});
  assert.equal((await f.db.query('SELECT consumed_at FROM conversation_crypto_key_packages WHERE hash=$1',[next.hash])).rows[0].consumed_at,null);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n,0);
});
test('native proof rejects substitution, expired evidence and invalid sessions before package discovery',async t=>{
  const f=await fixture(t),a=f.members.alice,op=a.sign('directory',{peer:'bob'});
  op.payload.peer='eve';await assert.rejects(f.store.encryptedOperation(a.context,op),{code:'encrypted_proof_rejected'});
  const expired=a.sign('directory',{peer:'bob'});expired.issuedAt-=60000;
  await assert.rejects(f.store.encryptedOperation(a.context,expired),{code:'encrypted_proof_expired'});
  await assert.rejects(f.store.encryptedOperation(f.members.eve.context,a.sign('poll',{})),{code:'encrypted_proof_rejected'});
  const result=await f.call('alice','directory',{peer:'bob'});assert.equal(result.packages.length,1);
  assert.equal(JSON.stringify(result).includes('signaturePrivateKey'),false);
});
test('package reservation is atomic, mutually scoped, one time and exact-retry safe',async t=>{
  const f=await fixture(t);await f.call('alice','reserve',f.reserve);await f.call('alice','reserve',f.reserve);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,1);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,2);
  await assert.rejects(f.call('alice','reserve',{...f.reserve,conversationId:crypto.randomUUID()}),{code:'encrypted_group_exists'});
  await assert.rejects(f.call('eve','reserve',{...f.reserve,sourceHash:f.members.eve.hash}),{code:'encrypted_package_unavailable'});
  const other=await f.call('eve','poll',{});assert.deepEqual(other.groups,[]);
});
test('only the selected recipient can activate mode and membership acceptance proof is retained',async t=>{
  const f=await fixture(t);await f.call('alice','reserve',f.reserve);await f.call('alice','transfer',f.transfer);
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_membership_pending'});
  await assert.rejects(f.call('alice','accept',{conversationId:f.id,transferId:f.transfer.id}),{code:'encrypted_membership_required'});
  await assert.rejects(f.call('eve','accept',{conversationId:f.id,transferId:f.transfer.id}),{code:'encrypted_membership_required'});
  await assert.rejects(f.call('alice','transfer',{...f.transfer,tree:'AQ'}),{code:'encrypted_transfer_conflict'});
  await f.call('bob','accept',{conversationId:f.id,transferId:f.transfer.id});
  const g=(await f.call('alice','poll',{})).groups[0];assert.equal(g.status,'active');assert.equal(g.acceptance.actorId,f.members.bob.id);
  assert.equal((await f.store.readEncryptedConversationMode(f.members.bob.context,'alice')).mode,'encrypted');
  await assert.rejects(f.db.query("INSERT INTO messages(id,sender_id,receiver_id,message) VALUES('bad','alice','bob','plaintext')"),/conversation_encryption_required/);
});
test('ciphertext exact retries do not duplicate and unauthorized metadata, bodies, epochs and ID reuse are rejected',async t=>{
  const f=await fixture(t);await f.active();
  const sent=await f.call('alice','send',f.packet);assert.equal(sent.status,'sent');await f.call('alice','send',f.packet);
  await assert.rejects(f.call('alice','send',{...f.packet,message:'plaintext'}),{code:'encrypted_operation_invalid'});
  await assert.rejects(f.call('alice','send',{...f.packet,epoch:'2'}),{code:'encrypted_operation_invalid'});
  await assert.rejects(f.call('bob','send',{...f.packet,deviceId:f.members.bob.id}),{code:'encrypted_send_conflict'});
  const rows=(await f.db.query('SELECT * FROM encrypted_conversation_messages')).rows;assert.equal(rows.length,1);
  assert.equal(JSON.stringify(rows).includes('server must not receive this'),false);
});
test('receipts require recipient proof, persist idempotently and sender ACK drains only verified evidence',async t=>{
  const f=await fixture(t);await f.active();await f.call('alice','send',f.packet);
  const p={id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,kind:'delivered'};
  await assert.rejects(f.call('alice','receipt',p),{code:'encrypted_receipt_rejected'});
  await assert.rejects(f.call('bob','receipt',{...p,hash:'0'.repeat(64)}),{code:'encrypted_receipt_rejected'});
  await f.call('bob','receipt',p);await f.call('bob','receipt',p);
  assert.equal((await f.call('bob','poll',{})).groups[0].messages.length,0);
  const receipts=(await f.call('alice','poll',{})).groups[0].receipts;assert.equal(receipts.length,1);assert.equal(receipts[0].owner,'bob');
  await assert.rejects(f.call('bob','receipt-ack',p),{code:'encrypted_receipt_rejected'});
  await f.call('alice','receipt-ack',p);assert.equal((await f.call('alice','poll',{})).groups[0].receipts.length,0);
  await f.call('bob','receipt',{...p,kind:'read'});assert.equal((await f.call('alice','poll',{})).groups[0].receipts.length,1);
});
test('device-qualified receipt ACK cannot consume another recipient device or receipt kind',async t=>{
  const f=await fixture(t);await f.active();await f.call('alice','send',f.packet);
  const next=await newMember(f,'bob2','bob'),p={id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,kind:'delivered'};
  await f.call('bob','receipt',p);await f.call('bob','receipt',{...p,kind:'read'});
  // Synthetic future roster: the store still refuses unselected devices and does not admit this endpoint.
  await f.db.query('INSERT INTO encrypted_conversation_epoch_devices VALUES($1,$2,$3,$4)',[f.id,'1',next.id,'bob']);
  await f.db.query(`INSERT INTO encrypted_conversation_receipts(message_id,device_id,kind,proof) VALUES($1,$2,'delivered',$3)`,
    [f.packet.id,next.id,JSON.stringify({owner:'bob',sessionId:next.context.deviceId,...next.sign('receipt',p)})]);
  await assert.rejects(f.call('bob2','receipt',p),{code:'encrypted_membership_required'});
  await assert.rejects(f.call('alice','receipt-ack',p),{code:'encrypted_receipt_ack_ambiguous'});
  const ack={...p,receiptDeviceId:f.members.bob.id};
  await f.call('alice','receipt-ack',ack);await f.call('alice','receipt-ack',ack);
  let receipts=(await f.call('alice','poll',{})).groups[0].receipts;
  assert.equal(receipts.length,2);assert(receipts.some(r=>r.actorId===next.id));assert(receipts.some(r=>r.payload.kind==='read'));
  await assert.rejects(f.call('alice','receipt-ack',{...ack,receiptDeviceId:f.members.eve.id}),{code:'encrypted_receipt_ack_ambiguous'});
  await assert.rejects(f.call('alice','receipt-ack',{...ack,receiptDeviceId:'invalid'}),{code:'encrypted_operation_invalid'});
  await assert.rejects(f.call('alice','receipt-ack',{...ack,hash:'0'.repeat(64)}),{code:'encrypted_receipt_rejected'});
  await f.call('alice','receipt-ack',{...ack,kind:'read'});
  receipts=(await f.call('alice','poll',{})).groups[0].receipts;assert.equal(receipts.length,1);assert.equal(receipts[0].actorId,next.id);
  const rows=(await f.db.query('SELECT * FROM encrypted_conversation_receipt_acks')).rows;
  assert.equal(rows.length,2);assert(rows.every(r=>r.observer_device===f.members.alice.id && r.receipt_device===f.members.bob.id));
  assert(rows.every(r=>r.proof.payload.receiptDeviceId===f.members.bob.id));
  assert((await f.db.query('SELECT sender_ack_at FROM encrypted_conversation_receipts')).rows.every(r=>r.sender_ack_at===null));
});

test('a sibling sender copy cannot become Delivered or Read for the peer account',async t=>{
  const f=await fixture(t);await f.active();const sibling=await newMember(f,'alice2','alice'),id=crypto.randomUUID();
  await f.db.query('INSERT INTO encrypted_conversation_epoch_devices VALUES($1,$2,$3,$4)',[f.id,'1',sibling.id,'alice']);
  await f.db.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof)
    VALUES($1,$2,$3,'1',1,'synthetic-opaque','synthetic-hash','{}')`,[id,f.id,sibling.id]);
  for(const kind of ['delivered','read'])await assert.rejects(f.call('alice','receipt',{
    id,conversationId:f.id,epoch:'1',hash:'synthetic-hash',kind
  }),{code:'encrypted_receipt_rejected'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n,0);
  await f.call('bob','receipt',{id,conversationId:f.id,epoch:'1',hash:'synthetic-hash',kind:'delivered'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n,1);
});

test('native epoch membership is immutable, account-bound and never created by login alone',async t=>{
  const f=await fixture(t);await f.active();const next=await newMember(f,'bob2','bob');
  const rows=(await f.db.query('SELECT device_id,owner_id FROM encrypted_conversation_epoch_devices ORDER BY owner_id')).rows;
  assert.deepEqual(rows,[{device_id:f.members.alice.id,owner_id:'alice'},{device_id:f.members.bob.id,owner_id:'bob'}]);
  await assert.rejects(f.db.query(`UPDATE encrypted_conversation_epoch_devices SET owner_id='bob' WHERE owner_id='alice'`),{code:'23514'});
  await assert.rejects(f.db.query('DELETE FROM encrypted_conversation_epoch_devices'),{code:'23514'});
  await assert.rejects(f.db.query('INSERT INTO encrypted_conversation_epoch_devices VALUES($1,$2,$3,$4)',[f.id,'1',next.id,'alice']),{code:'23514'});
  await assert.rejects(f.db.query('INSERT INTO encrypted_conversation_epoch_devices VALUES($1,$2,$3,$4)',[f.id,'1',f.members.eve.id,'eve']),{code:'23514'});
  assert.deepEqual((await f.call('bob2','poll',{})).groups,[]);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices')).rows[0].n,2);
  const currentEpoch=require('../backend/encrypted-membership-replacement').createMembershipReplacement({access:()=>{}}).currentEpoch;
  const group=(await f.db.query('SELECT * FROM encrypted_conversations WHERE id=$1',[f.id])).rows[0];
  await assert.rejects(f.db.transaction(client=>currentEpoch(client,{...group,recipient_device:next.id})),{code:'encrypted_epoch_membership_conflict'});
});

test('additive delivery migration preserves historic grants and backfills legacy ACK only for its sender',async t=>{
  const f=await fixture(t);await f.active();await f.call('alice','send',f.packet);
  const p={id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,kind:'delivered'};
  await f.call('bob','receipt',p);
  await f.db.query('UPDATE encrypted_conversation_receipts SET sender_ack_at=NOW()');
  await f.db.transaction(async client=>{for(const sql of require('../backend/migrations/encrypted-device-delivery').statements)await client.exec(sql);});
  assert.equal((await f.call('alice','poll',{})).groups[0].receipts.length,0);
  const rows=(await f.db.query('SELECT * FROM encrypted_conversation_receipt_acks')).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].observer_device,f.members.alice.id);assert.equal(rows[0].receipt_device,f.members.bob.id);
  assert.deepEqual(rows[0].proof,{legacy:true});assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices')).rows[0].n,2);
});

test('block, suspension and native revocation fail closed without revealing queued content',async t=>{
  const f=await fixture(t);await f.active();await f.call('alice','send',f.packet);
  await f.db.query("INSERT INTO user_blocks VALUES('bob','alice')");await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_access_denied'});
  assert.deepEqual((await f.call('alice','poll',{})).groups,[{id:f.id,status:'blocked'}]);
  await f.db.query('DELETE FROM user_blocks');await f.db.query("UPDATE users SET status='suspended' WHERE username='bob'");
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_access_denied'});
  await f.db.query("UPDATE users SET status='active' WHERE username='bob'");await f.db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_access_denied'});
});
test('invalid packet quarantine is recipient-scoped and is never a Delivered or Read receipt',async t=>{
  const f=await fixture(t);await f.active();await f.call('alice','send',f.packet);
  const p={id:f.packet.id,conversationId:f.id,epoch:'1',hash:f.packet.hash,reason:'invalid-ciphertext'};
  await assert.rejects(f.call('alice','reject',p),{code:'encrypted_receipt_rejected'});
  await assert.rejects(f.call('eve','reject',p),{code:'encrypted_membership_required'});
  await f.call('bob','reject',p);await f.call('bob','reject',p);
  assert.equal((await f.call('bob','poll',{})).groups[0].messages.length,0);
  assert.equal((await f.call('alice','poll',{})).groups[0].receipts.length,0);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n,0);
});
test('transport API remains default off but canonical mode guard remains authenticated and no-store',async()=>{
  let result;
  const deps={sendJson:(_,status,body,headers)=>{result={status,body,headers};},findSession:()=>({username:'alice',sessionId:'a',token:'a'}),readAuthToken:()=>'',ensureMarketplaceUser:session=>session,getPostgresStore:()=>({readEncryptedConversationMode:async()=>({version:1,mode:'encrypted'})}),collectBody:async()=>({})};
  const api=createEncryptedConversationsApi(deps);
  await api.handle({method:'GET'},{},new URL('https://localhost/api/conversations/encrypted/capabilities'));assert.equal(result.status,404);
  await api.handle({method:'GET'},{},new URL('https://localhost/api/conversations/encrypted/mode?peer=bob'));assert.equal(result.body.mode,'encrypted');assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('encrypted sends enqueue one generic background push, authorize deep links and never disclose message text',async t=>{
  const f=await fixture(t);await f.active();
  const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/winga-test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  await f.db.query(`INSERT INTO web_push_subscriptions(id,owner_id,session_id,subscription,locale) VALUES($1,'bob','b1',$2,'en')`,[crypto.randomUUID(),JSON.stringify(subscription)]);
  await f.call('alice','send',f.packet);await f.call('alice','send',f.packet);
  const jobs=(await f.db.query('SELECT * FROM web_push_jobs')).rows;assert.equal(jobs.length,1);
  const payloads=[],push=require('../backend/message-web-push').createMessageWebPushStore({query:(...args)=>f.db.query(...args),withTransaction:work=>f.db.transaction(tx=>work({query:(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:tx.query(sql,params)})),encrypted:true,
    provider:{generateVAPIDKeys:()=>require('web-push').generateVAPIDKeys(),sendNotification:async(subscription,payload)=>payloads.push(JSON.parse(payload))}});
  assert.deepEqual(await push.resolveWebPush({owner:'bob',token:'b1',sessionId:'b1',id:jobs[0].id}),{withUser:'alice'});
  const result=await push.dispatchWebPushBatch();assert.equal(result.accepted,1);
  assert.deepEqual(Object.keys(payloads[0]).sort(),['group','id','locale','version']);assert.equal(JSON.stringify(payloads).includes('server must not receive this'),false);
  const context={owner:'bob',token:'b1',sessionId:'b1'},payload={owner:'bob',sessionId:'b1',peer:'alice'};
  await f.db.exec('UPDATE web_push_jobs SET completed_at=NULL');
  const muted=await push.saveConversationMute({...context,payload:{...payload,revision:'0',muted:true}});
  assert.equal(muted.muted,true);
  async function nextPacket(){
    const message=await f.mls.createApplicationMessage(f.group,new TextEncoder().encode('another private message'),f.suite);f.group=message.newState;
    const bytes=Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:message.privateMessage}));
    return {...f.packet,id:crypto.randomUUID(),ciphertext:bytes.toString('base64url'),hash:hash(bytes)};
  }
  await f.call('alice','send',await nextPacket());
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n,2);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM web_push_jobs WHERE completed_at IS NULL')).rows[0].n,0);
  await push.dispatchWebPushBatch();assert.equal(payloads.length,1);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n,0);
  await push.saveConversationMute({...context,payload:{...payload,revision:muted.revision,muted:false}});
  await f.call('alice','send',await nextPacket());await push.dispatchWebPushBatch();assert.equal(payloads.length,2);
});

function privateStorage(f) {
  const objects=new Map(),calls=[];
  const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET_NAME:'public-assets',R2_CONVERSATION_BUCKET_NAME:'chat-private',R2_CONVERSATION_ACCESS_KEY_ID:'fixture',R2_CONVERSATION_SECRET_ACCESS_KEY:'fixture',R2_CONVERSATION_API_TOKEN:'fixture',R2_CONVERSATION_ISOLATION_CONFIRMED:'true'};
  const storage=require('../backend/conversation-private-media').createPrivateMediaStorage({env,privacyCheck:async()=>{},authorize:f.store.authorizeEncryptedMedia,client:{send:async cmd=>{
    const p=cmd.input;calls.push(cmd.constructor.name);
    if(cmd.constructor.name==='PutObjectCommand'){if(objects.has(p.Key))throw {$metadata:{httpStatusCode:412}};objects.set(p.Key,Buffer.from(p.Body));return {};}
    if(cmd.constructor.name==='DeleteObjectCommand'){objects.delete(p.Key);return {};}
    const bytes=objects.get(p.Key);if(!bytes)throw new Error('missing');return {ContentLength:bytes.length,ContentType:'application/octet-stream',Metadata:{sha256:hash(bytes)},Body:require('node:stream').Readable.from([bytes])};
  }}});
  const bytes=Buffer.concat([Buffer.from('WINGAEM2'),crypto.randomBytes(80)]),object={id:crypto.randomUUID(),bytes:bytes.length,sha256:hash(bytes)};
  const context=(owner,action)=>({...f.members[owner].context,proof:f.members[owner].sign(`media-${action}`,object)});
  const reserve=()=>f.call('alice','media-reserve',{...object,conversationId:f.id,messageId:f.packet.id});
  return {storage,objects,calls,bytes,object,context,reserve};
}
test('private media is immutable, member-scoped, bound to one accepted message and never public',async t=>{
  const f=await fixture(t);await f.active();const m=privateStorage(f);await m.reserve();await m.reserve();
  await assert.rejects(m.storage.get(m.context('bob','download'),m.object),{code:'private_media_access_rejected'});
  await assert.rejects(m.storage.put(m.context('bob','upload'),m.object,m.bytes),{code:'private_media_access_rejected'});
  await assert.rejects(f.call('alice','send',{...f.packet,mediaId:m.object.id}),{code:'private_media_not_uploaded'});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n,0);
  await m.storage.put(m.context('alice','upload'),m.object,m.bytes);await f.store.completeEncryptedMediaUpload(m.context('alice','upload'),m.object);
  await f.call('alice','send',{...f.packet,mediaId:m.object.id});await f.call('alice','send',{...f.packet,mediaId:m.object.id});
  assert.deepEqual(await m.storage.get(m.context('bob','download'),m.object),m.bytes);
  await assert.rejects(m.storage.get(m.context('eve','download'),m.object),{code:'encrypted_membership_required'});
  await assert.rejects(f.call('alice','send',f.packet),{code:'encrypted_send_conflict'});
  await f.db.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '2 days'");
  assert.deepEqual(await f.store.claimEncryptedMediaCleanup(),[]);assert.equal(m.objects.size,1);
  await f.db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");
  await assert.rejects(m.storage.get(m.context('bob','download'),m.object),{code:'encrypted_proof_rejected'});
});
test('expired orphan cleanup uses durable leases and blocks late upload or attachment resurrection',async t=>{
  const f=await fixture(t);await f.active();const m=privateStorage(f);await m.reserve();await m.storage.put(m.context('alice','upload'),m.object,m.bytes);
  await f.store.completeEncryptedMediaUpload(m.context('alice','upload'),m.object);
  await f.db.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '2 days'");
  const jobs=await f.store.claimEncryptedMediaCleanup();assert.equal(jobs.length,1);assert.deepEqual(await f.store.claimEncryptedMediaCleanup(),[]);
  await assert.rejects(m.storage.put(m.context('alice','upload'),m.object,m.bytes),{code:'private_media_access_rejected'});
  await assert.rejects(f.call('alice','send',{...f.packet,mediaId:m.object.id}),{code:'private_media_not_uploaded'});
  await assert.rejects(m.storage.remove({lease:crypto.randomUUID()},m.object),{code:'private_media_access_rejected'});
  await m.storage.remove({lease:jobs[0].lease},m.object);await m.storage.remove({lease:jobs[0].lease},m.object);await f.store.finishEncryptedMediaCleanup(jobs[0]);
  assert.equal(m.objects.size,0);assert.equal((await f.db.query('SELECT status FROM encrypted_conversation_media')).rows[0].status,'deleted');
  await assert.rejects(m.reserve(),{code:'private_media_conflict'});
});
test('media upload extends the orphan deadline and quotas and signed body bindings fail closed',async t=>{
  const f=await fixture(t);await f.active();const m=privateStorage(f);await m.reserve();
  await f.db.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '1 second'");
  await m.storage.put(m.context('alice','upload'),m.object,m.bytes);assert.deepEqual(await f.store.claimEncryptedMediaCleanup(),[]);
  const proof=m.context('alice','upload');proof.proof.payload={...m.object,sha256:'0'.repeat(64)};
  await assert.rejects(m.storage.put(proof,m.object,m.bytes),{code:'private_media_access_rejected'});
  await assert.rejects(f.call('alice','media-reserve',{...m.object,conversationId:f.id,messageId:f.packet.id,key:'must not reach server'}),{code:'encrypted_operation_invalid'});
  await f.db.query(`INSERT INTO encrypted_conversation_media(id,conversation_id,message_id,uploader_device,bytes,sha256)
    SELECT gen_random_uuid()::text,$1,gen_random_uuid()::text,$2,40,$3 FROM generate_series(1,49)`,[f.id,f.members.alice.id,m.object.sha256]);
  await assert.rejects(f.call('alice','media-reserve',{...m.object,id:crypto.randomUUID(),messageId:crypto.randomUUID(),conversationId:f.id}),{code:'private_media_quota'});
});
test('media API is default off, rejects extra binary bytes and hides provider details',async()=>{
  const {createEncryptedMediaApi,collectCiphertext}=require('../backend/encrypted-media-api');let response,accessed=false;
  const api=createEncryptedMediaApi({sendJson:(_,status,body)=>response={status,body},getStorage:()=>{accessed=true;}});
  assert.equal(await api.handle({method:'PUT'},{},new URL('https://localhost/api/conversations/encrypted/media/fixture')),true);
  assert.equal(response.status,404);assert.equal(accessed,false);
  await assert.rejects(collectCiphertext(require('node:stream').Readable.from([Buffer.from('extra')]),2),{code:'private_media_invalid'});
});
