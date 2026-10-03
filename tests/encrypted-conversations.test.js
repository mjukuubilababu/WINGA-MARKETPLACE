const {test}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createEncryptedConversationStore,operationBytes}=require('../backend/encrypted-conversations');
const {createEncryptedConversationsApi}=require('../backend/encrypted-conversations-api');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const db=new PGlite();t.after(()=>db.close());await db.exec(require('./helpers/conversation-event-fixture'));
  for(const name of ['message-web-push','conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-key-packages','encrypted-conversations'])
    await db.transaction(async tx=>{for(const sql of require(`../backend/migrations/${name}`).statements)await tx.exec(sql);});
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
  const store=createEncryptedConversationStore({withTransaction:work=>db.transaction(work),enqueuePush:require('../backend/message-web-push').enqueueMessagePush}),id=crypto.randomUUID(),transferId=crypto.randomUUID();
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
  return {db,members,store,id,reserve,transfer,packet,call,active};
}
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
  const payloads=[],push=require('../backend/message-web-push').createMessageWebPushStore({query:(...args)=>f.db.query(...args),withTransaction:work=>f.db.transaction(work),encrypted:true,
    provider:{generateVAPIDKeys:()=>require('web-push').generateVAPIDKeys(),sendNotification:async(subscription,payload)=>payloads.push(JSON.parse(payload))}});
  assert.deepEqual(await push.resolveWebPush({owner:'bob',token:'b1',sessionId:'b1',id:jobs[0].id}),{withUser:'alice'});
  const result=await push.dispatchWebPushBatch();assert.equal(result.accepted,1);
  assert.deepEqual(Object.keys(payloads[0]).sort(),['id','locale','version']);assert.equal(JSON.stringify(payloads).includes('server must not receive this'),false);
});
