const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool,Client}=require('pg');
const {setTimeout:delay}=require('node:timers/promises');
const {createEncryptedConversationStore,operationBytes}=require('../backend/encrypted-conversations');
const connectionString=process.env.WINGA_TEST_POSTGRES_URL;
if(!connectionString || !['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname))throw new Error('Explicit disposable localhost WINGA_TEST_POSTGRES_URL is required.');
async function transaction(client,work){await client.query('BEGIN');try{const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}}
async function fixture(t){
  const schema='winga_encrypted_test_'+crypto.randomBytes(10).toString('hex');
  const admin=new Client({connectionString});await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool=new Pool({connectionString,max:6,options:`-c search_path=${schema},public -c statement_timeout=10000 -c lock_timeout=7000`});
  t.after(async()=>{await pool.end();try{await admin.query(`DROP SCHEMA "${schema}" CASCADE`);}finally{await admin.end();}});
  await pool.query(require('./helpers/conversation-event-fixture'));
  const migrationClient=await pool.connect();
  try { for(const name of ['conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-replacement','encrypted-replacement-retirements'])
    await transaction(migrationClient,async c=>{for(const sql of require(`../backend/migrations/${name}`).statements)await c.query(sql);});
    await transaction(migrationClient,async c=>{for(const sql of require('../backend/migrations/encrypted-conversation-media').statements)await c.query(sql);}); }
  finally { migrationClient.release(); }
  const members={};
  for(const [owner,token]of [['alice','a'],['bob','b1']]){
    const keys=crypto.generateKeyPairSync('ed25519'),raw=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32),id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(owner).digest('hex');
    await pool.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,$2,$3,$4,'active')`,[id,owner,raw.toString('base64url'),crypto.createHash('sha256').update(raw).digest('hex')]);
    await pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,'public-fixture','public-fixture','{}',NOW()+interval '1 day')`,[hash,id]);
    const context={owner,deviceId:token,token};
    members[owner]={id,hash,context,sign(action,payload){const op={action,actorId:id,requestId:crypto.randomUUID(),issuedAt:Date.now(),payload};op.signature=crypto.sign(null,operationBytes(context,op),keys.privateKey).toString('base64url');return op;}};
  }
  const store=createEncryptedConversationStore({mediaEnabled:true,withTransaction:async work=>{const c=await pool.connect();try{return await transaction(c,work);}finally{c.release();}}});
  const id=crypto.randomUUID(),reserve={conversationId:id,peer:'bob',sourceHash:members.alice.hash,targetHash:members.bob.hash};
  return {pool,admin,members,store,id,reserve};
}
test('independent connections retry one reservation and racing opposite initiators consume one package pair',async t=>{
  const f=await fixture(t),a=f.members.alice,b=f.members.bob;
  const results=await Promise.allSettled([
    f.store.encryptedOperation(a.context,a.sign('reserve',f.reserve)),
    f.store.encryptedOperation(b.context,b.sign('reserve',{conversationId:crypto.randomUUID(),peer:'alice',sourceHash:b.hash,targetHash:a.hash})),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'encrypted_group_exists');
  const groups=(await f.pool.query('SELECT * FROM encrypted_conversations')).rows;assert.equal(groups.length,1);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,2);
  const g=groups[0],actor=f.members[g.creator],intent={conversationId:g.id,peer:g.recipient,sourceHash:g.source_hash,targetHash:g.target_hash};
  await Promise.all(Array.from({length:8},()=>f.store.encryptedOperation(actor.context,actor.sign('reserve',intent))));
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,1);
});
test('authorization is rechecked after a transaction waits for membership serialization',async t=>{
  const f=await fixture(t),a=f.members.alice;
  const blocker=await f.pool.connect(),waiter=await f.pool.connect();
  try{
    await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))");
    const waiting=createEncryptedConversationStore({withTransaction:work=>transaction(waiter,work)}).encryptedOperation(a.context,a.sign('reserve',f.reserve));
    let blocked=false;
    for(let n=0;n<100;n++){
      const r=await f.admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[blocker.processID,waiter.processID]);if(r.rows[0].blocked){blocked=true;break;}await delay(20);
    }
    assert.equal(blocked,true);
    await blocker.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");await blocker.query('COMMIT');
    await assert.rejects(waiting,{code:'encrypted_package_unavailable'});
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,0);
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,0);
  }finally{await blocker.query('ROLLBACK');await waiter.query('ROLLBACK');blocker.release();waiter.release();}
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('reservation retirement and a delayed reservation serialize to exactly one durable outcome',async t=>{
  const f=await replacementFixture(t),a=f.members.alice,intent=f.intent(f.targets[0]);
  const results=await Promise.allSettled([
    f.store.encryptedOperation(a.context,a.sign('replace-retire',intent)),
    f.store.encryptedOperation(a.context,a.sign('replace-reserve',intent))
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const retired=(await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_replacement_retirements')).rows[0].n;
  const reserved=(await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n;
  assert.equal(retired+reserved,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,retired?'encrypted_replacement_retired':'encrypted_replacement_exists');
  assert.equal(Boolean((await f.pool.query('SELECT consumed_at FROM conversation_crypto_key_packages WHERE hash=$1',[intent.packageHash])).rows[0].consumed_at),Boolean(reserved));
});
async function replacementFixture(t) {
  const f=await fixture(t),a=f.members.alice;
  await f.store.encryptedOperation(a.context,a.sign('reserve',f.reserve));
  await f.pool.query("UPDATE encrypted_conversations SET status='active' WHERE id=$1",[f.id]);
  const targets=[];
  for(let n=0;n<2;n++) {
    const keys=crypto.generateKeyPairSync('ed25519'),raw=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32),id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(raw).digest('hex');
    await f.pool.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,'bob',$2,$3,'active')`,[id,raw.toString('base64url'),hash]);
    await f.pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,'public-fixture','public-fixture','{}',NOW()+INTERVAL '1 day')`,[hash,id]);
    targets.push({id,hash});
  }
  const intent=target=>({id:crypto.randomUUID(),conversationId:f.id,previousEpoch:'1',removedDeviceId:f.members.bob.id,replacementDeviceId:target.id,packageHash:target.hash});
  return {...f,targets,intent};
}
test('replacement reservations on independent connections consume only one target package and retain exact retry',async t=>{
  const f=await replacementFixture(t),a=f.members.alice,intents=f.targets.map(f.intent);
  const results=await Promise.allSettled(intents.map(intent=>f.store.encryptedOperation(a.context,a.sign('replace-reserve',intent))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'encrypted_replacement_conflict');
  const winner=intents[results.findIndex(r=>r.status==='fulfilled')];
  await Promise.all(Array.from({length:8},()=>f.store.encryptedOperation(a.context,a.sign('replace-reserve',winner))));
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n,1);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,3);
});
test('replacement refuses an undrained initiator inbox without consuming the target admission',async t=>{
  const f=await replacementFixture(t),a=f.members.alice,message=crypto.randomUUID(),intent=f.intent(f.targets[0]);
  await f.pool.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof)
    VALUES($1,$2,$3,'1',1,'opaque-fixture','opaque-fixture','{}')`,[message,f.id,f.members.bob.id]);
  await assert.rejects(f.store.encryptedOperation(a.context,a.sign('replace-reserve',intent)),{code:'encrypted_replacement_inbox_pending'});
  assert.equal((await f.pool.query('SELECT consumed_at FROM conversation_crypto_key_packages WHERE hash=$1',[intent.packageHash])).rows[0].consumed_at,null);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n,0);
});
test('send waiting behind replacement freeze cannot commit an old epoch message',async t=>{
  const f=await replacementFixture(t),a=f.members.alice,b=f.members.bob,blocker=await f.pool.connect(),waiter=await f.pool.connect();
  const ready=deferred(),release=deferred();let freezing,waiting;
  try {
    freezing=heldStore(f,blocker,ready,release).encryptedOperation(a.context,a.sign('replace-reserve',f.intent(f.targets[0])));
    await ready.promise;
    const bytes=Buffer.from([1]),packet={id:crypto.randomUUID(),conversationId:f.id,epoch:'1',deviceId:b.id,ciphertext:bytes.toString('base64url'),hash:crypto.createHash('sha256').update(bytes).digest('hex')};
    waiting=createEncryptedConversationStore({withTransaction:work=>transaction(waiter,work)}).encryptedOperation(b.context,b.sign('send',packet)).catch(error=>error);
    await waitBlocked(f,blocker,waiter);release.resolve();await freezing;
    assert.equal((await waiting).code,'encrypted_membership_pending');
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n,0);
  } finally {release.resolve();await Promise.allSettled([freezing,waiting]);blocker.release();waiter.release();}
});
async function mediaFixture(t) {
  const f=await fixture(t),a=f.members.alice;
  await f.store.encryptedOperation(a.context,a.sign('reserve',f.reserve));
  // Admission itself is covered above and in the transport suite; these races start from admitted membership.
  await f.pool.query("UPDATE encrypted_conversations SET status='active' WHERE id=$1",[f.id]);
  await f.pool.query("UPDATE conversation_event_streams SET security_mode='encrypted' WHERE id=(SELECT canonical_id FROM encrypted_conversations WHERE id=$1)",[f.id]);
  const messageId=crypto.randomUUID(),object={id:crypto.randomUUID(),bytes:80,sha256:'a'.repeat(64)};
  await f.store.encryptedOperation(a.context,a.sign('media-reserve',{...object,conversationId:f.id,messageId}));
  const context={...a.context,proof:a.sign('media-upload',object)};
  const mls=await import('ts-mls'),suite=await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const pkg=await mls.generateKeyPackage({credentialType:'basic',identity:new TextEncoder().encode('concurrency-fixture')},mls.defaultCapabilities(),{notBefore:0n,notAfter:BigInt(Math.floor(Date.now()/1000)+86400)},[],suite);
  const group=await mls.createGroup(new TextEncoder().encode(f.id),pkg.publicPackage,pkg.privatePackage,[],suite);
  const sealed=await mls.createApplicationMessage(group,new TextEncoder().encode('private race fixture'),suite);
  const bytes=Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:sealed.privateMessage}));
  const packet={id:messageId,conversationId:f.id,epoch:'0',deviceId:a.id,ciphertext:bytes.toString('base64url'),hash:crypto.createHash('sha256').update(bytes).digest('hex'),mediaId:object.id};
  await f.pool.query("UPDATE encrypted_conversations SET epoch='0' WHERE id=$1",[f.id]);
  await f.pool.query(`INSERT INTO encrypted_conversation_epochs(conversation_id,epoch,creator_device,recipient_device) VALUES($1,'0',$2,$3)`,[f.id,a.id,f.members.bob.id]);
  return {...f,object,context,packet};
}
function heldStore(f,client,ready,release) {
  return createEncryptedConversationStore({mediaEnabled:true,withTransaction:work=>transaction(client,async c=>{
    const result=await work(c);ready.resolve();await release.promise;return result;
  })});
}
async function waitBlocked(f,blocker,waiter) {
  for(let n=0;n<100;n++) {
    const r=await f.admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[blocker.processID,waiter.processID]);
    if(r.rows[0].blocked)return;
    await delay(20);
  }
  assert.fail('Expected independent PostgreSQL connection to be blocked');
}

test('cleanup workers on independent connections claim an orphan once and reject stale leases',async t=>{
  const f=await mediaFixture(t);
  await f.pool.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '1 day'");
  const results=await Promise.all(Array.from({length:12},()=>f.store.claimEncryptedMediaCleanup(1)));
  const jobs=results.flat();assert.equal(jobs.length,1);const old=jobs[0];
  await assert.rejects(f.store.authorizeEncryptedMedia(f.context,f.object,'upload'),{code:'private_media_access_rejected'});
  await f.pool.query("UPDATE encrypted_conversation_media SET lease_until=NOW()-INTERVAL '1 second'");
  const [current]=await f.store.claimEncryptedMediaCleanup(1);assert.notEqual(current.lease,old.lease);
  await assert.rejects(f.store.authorizeEncryptedMedia({lease:old.lease},f.object,'cleanup'),{code:'private_media_access_rejected'});
  assert.equal((await f.store.finishEncryptedMediaCleanup(old)).rowCount,0);
  assert.equal(await f.store.authorizeEncryptedMedia({lease:current.lease},f.object,'cleanup'),true);
  assert.equal((await f.store.finishEncryptedMediaCleanup(current)).rowCount,1);
  assert.equal((await f.store.claimEncryptedMediaCleanup(1)).length,0);
  await assert.rejects(f.store.encryptedOperation(f.members.alice.context,f.members.alice.sign('media-reserve',{...f.object,conversationId:f.id,messageId:f.packet.id})),{code:'private_media_conflict'});
});

test('in-flight upload authorization holds the row and extends expiry before cleanup can claim it',async t=>{
  const f=await mediaFixture(t),client=await f.pool.connect(),ready=deferred(),release=deferred();let uploading;
  try {
    await f.pool.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '1 day'");
    uploading=heldStore(f,client,ready,release).authorizeEncryptedMedia(f.context,f.object,'upload');
    await Promise.race([ready.promise,uploading]);
    assert.deepEqual(await f.store.claimEncryptedMediaCleanup(1),[]);
    release.resolve();assert.equal(await uploading,true);
    assert.deepEqual(await f.store.claimEncryptedMediaCleanup(1),[]);
    assert.equal((await f.pool.query('SELECT expires_at>NOW() AS protected FROM encrypted_conversation_media')).rows[0].protected,true);
  }finally{release.resolve();await Promise.allSettled([uploading]);client.release();}
});

test('an attaching send wins the row race and cleanup never claims the committed attachment',async t=>{
  const f=await mediaFixture(t),client=await f.pool.connect(),ready=deferred(),release=deferred();let sending;
  try {
    await f.store.completeEncryptedMediaUpload(f.context,f.object);
    await f.pool.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '1 day'");
    sending=heldStore(f,client,ready,release).encryptedOperation(f.members.alice.context,f.members.alice.sign('send',f.packet));
    await Promise.race([ready.promise,sending]);assert.deepEqual(await f.store.claimEncryptedMediaCleanup(1),[]);
    release.resolve();assert.equal((await sending).status,'sent');
    assert.deepEqual(await f.store.claimEncryptedMediaCleanup(1),[]);
    const row=(await f.pool.query('SELECT status FROM encrypted_conversation_media')).rows[0];assert.equal(row.status,'attached');
    assert.equal((await f.pool.query('SELECT media_id FROM encrypted_conversation_messages')).rows[0].media_id,f.object.id);
  }finally{release.resolve();await Promise.allSettled([sending]);client.release();}
});

test('cleanup winning a row race prevents attachment and rolls back message insertion and sequence',async t=>{
  const f=await mediaFixture(t),cleaner=await f.pool.connect(),sender=await f.pool.connect(),ready=deferred(),release=deferred();let claiming,sending;
  try {
    await f.store.completeEncryptedMediaUpload(f.context,f.object);
    await f.pool.query("UPDATE encrypted_conversation_media SET expires_at=NOW()-INTERVAL '1 day'");
    claiming=heldStore(f,cleaner,ready,release).claimEncryptedMediaCleanup(1);await Promise.race([ready.promise,claiming]);
    const sendStore=createEncryptedConversationStore({mediaEnabled:true,withTransaction:work=>transaction(sender,work)});
    sending=sendStore.encryptedOperation(f.members.alice.context,f.members.alice.sign('send',f.packet));
    const rejected=assert.rejects(sending,{code:'private_media_not_uploaded'});
    await waitBlocked(f,cleaner,sender);release.resolve();await rejected;assert.equal((await claiming).length,1);
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n,0);
    assert.equal((await f.pool.query('SELECT next_sequence FROM encrypted_conversations')).rows[0].next_sequence,'0');
    assert.equal((await f.pool.query('SELECT status FROM encrypted_conversation_media')).rows[0].status,'cleaning');
  }finally{release.resolve();await Promise.allSettled([claiming,sending]);cleaner.release();sender.release();}
});

test('racing media reservations enforce uploader quota without accepting partial rows',async t=>{
  const f=await mediaFixture(t),a=f.members.alice;
  const results=await Promise.allSettled(Array.from({length:55},()=>f.store.encryptedOperation(a.context,a.sign('media-reserve',{
    id:crypto.randomUUID(),messageId:crypto.randomUUID(),conversationId:f.id,bytes:80,sha256:'b'.repeat(64)
  }))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,49);
  const rejected=results.filter(r=>r.status==='rejected');assert.equal(rejected.length,6);
  assert.equal(rejected.every(r=>r.reason.code==='private_media_quota'),true);
  const rows=(await f.pool.query('SELECT COUNT(*)::int AS n,SUM(bytes)::int AS bytes FROM encrypted_conversation_media')).rows[0];
  assert.deepEqual(rows,{n:50,bytes:4000});
});

test('media authorization rechecks revocation after waiting on the transport guard',async t=>{
  const f=await mediaFixture(t),blocker=await f.pool.connect(),waiter=await f.pool.connect();let uploading;
  try {
    await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))");
    uploading=createEncryptedConversationStore({mediaEnabled:true,withTransaction:work=>transaction(waiter,work)}).authorizeEncryptedMedia(f.context,f.object,'upload');
    const rejected=assert.rejects(uploading,{code:'encrypted_access_denied'});
    await waitBlocked(f,blocker,waiter);
    await blocker.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");await blocker.query('COMMIT');await rejected;
    assert.equal((await f.pool.query('SELECT status FROM encrypted_conversation_media')).rows[0].status,'reserved');
  }finally{await blocker.query('ROLLBACK');await Promise.allSettled([uploading]);blocker.release();waiter.release();}
});
