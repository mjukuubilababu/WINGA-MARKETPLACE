const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool,Client}=require('pg');
const {setTimeout:delay}=require('node:timers/promises');
const {createEncryptedConversationStore,operationBytes}=require('../backend/encrypted-conversations');
const connectionString=process.env.WINGA_TEST_POSTGRES_URL;
if(!connectionString || !['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname))throw new Error('Explicit disposable localhost WINGA_TEST_POSTGRES_URL is required.');
async function transaction(client,work){await client.query('BEGIN');try{const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}}
async function fixture(t,options={}){
  const schema='winga_encrypted_test_'+crypto.randomBytes(10).toString('hex');
  const admin=new Client({connectionString});await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool=new Pool({connectionString,max:6,options:`-c search_path=${schema},public -c statement_timeout=10000 -c lock_timeout=7000`});
  t.after(async()=>{await pool.end();try{await admin.query(`DROP SCHEMA "${schema}" CASCADE`);}finally{await admin.end();}});
  await pool.query(require('./helpers/conversation-event-fixture'));
  const migrationClient=await pool.connect();
  try { for(const name of ['conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-session-bindings','conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery','encrypted-device-admissions','encrypted-device-lifecycle','encrypted-native-history','encrypted-message-invariants'])
    await transaction(migrationClient,async c=>{for(const sql of require(`../backend/migrations/${name}`).statements)await c.query(sql);}); }
  finally { migrationClient.release(); }
  const members={};
  const native=require('../backend/conversation-crypto-devices'),devices=native.createConversationCryptoDeviceStore({withTransaction:async work=>{
    const c=await pool.connect();try{return await transaction(c,work);}finally{c.release();}
  }});
  for(const [owner,token]of [['alice','a'],['bob','b1']]){
    const keys=crypto.generateKeyPairSync('ed25519'),raw=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32),id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(owner).digest('hex');
    const context={owner,deviceId:token,token},registration={action:'register',deviceId:id,actorId:id,publicKey:raw.toString('base64url'),
      fingerprint:crypto.createHash('sha256').update(raw).digest('hex'),requestId:crypto.randomUUID(),issuedAt:Date.now(),signature:Buffer.alloc(64).toString('base64url')};
    registration.signature=crypto.sign(null,native.operationBytes(context,registration),keys.privateKey).toString('base64url');
    await devices.mutateConversationCryptoDevice(context,registration);
    await pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,'public-fixture','public-fixture','{}',NOW()+interval '1 day')`,[hash,id]);
    members[owner]={id,hash,context,sign(action,payload){const op={action,actorId:id,requestId:crypto.randomUUID(),issuedAt:Date.now(),payload};op.signature=crypto.sign(null,operationBytes(context,op),keys.privateKey).toString('base64url');return op;}};
  }
  const store=createEncryptedConversationStore({mediaEnabled:true,...options,withTransaction:async work=>{const c=await pool.connect();try{return await transaction(c,work);}finally{c.release();}}});
  const id=crypto.randomUUID(),reserve={conversationId:id,peer:'bob',sourceHash:members.alice.hash,targetHash:members.bob.hash};
  return {pool,admin,members,store,id,reserve};
}
test('independent encrypted stores share one owner creation quota without charging reservation retries',async t=>{
  const f=await fixture(t),a=f.members.alice,eve=crypto.randomUUID();
  await f.pool.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status)
    SELECT $1,'eve',public_key,fingerprint,'active' FROM conversation_crypto_devices WHERE id=$2`,[eve,f.members.bob.id]);
  const sourceHash=crypto.createHash('sha256').update('alice-another-package').digest('hex');
  const targetHash=crypto.createHash('sha256').update('eve-package').digest('hex');
  for(const [hash,device] of [[sourceHash,a.id],[targetHash,eve]])
    await f.pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at)
      VALUES($1,$2,'public-fixture','public-fixture','{}',NOW()+interval '1 day')`,[hash,device]);
  const withTransaction=async work=>{const c=await f.pool.connect();try{return await transaction(c,work);}finally{c.release();}};
  const nodes=[0,1].map(()=>createEncryptedConversationStore({withTransaction,newConversationLimitPerHour:1}));
  const intents=[f.reserve,{conversationId:crypto.randomUUID(),peer:'eve',sourceHash,targetHash}];
  const results=await Promise.allSettled(nodes.map((node,index)=>node.encryptedOperation(a.context,a.sign('reserve',intents[index]))));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'encrypted_new_conversation_limit');
  const winner=results.findIndex(result=>result.status==='fulfilled');
  await Promise.all(Array.from({length:8},(_,index)=>nodes[index%2].encryptedOperation(a.context,a.sign('reserve',intents[winner]))));
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,1);
  assert.equal((await f.pool.query("SELECT count FROM api_rate_limit_buckets WHERE scope='encrypted-new-conversations'")).rows[0].count,1);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,2);
});

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

test('cross-pair reservations sharing one native package cannot deadlock account foreign-key locks',async t=>{
  const f=await fixture(t),a=f.members.alice,b=f.members.bob,eve=crypto.randomUUID();
  const eveHash=crypto.createHash('sha256').update('cross-pair-eve-package').digest('hex');
  await f.pool.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status)
    SELECT $1,'eve',public_key,fingerprint,'active' FROM conversation_crypto_devices WHERE id=$2`,[eve,b.id]);
  await f.pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at)
    VALUES($1,$2,'public-fixture','public-fixture','{}',NOW()+INTERVAL '1 day')`,[eveHash,eve]);
  await f.pool.query("SELECT winga_ensure_conversation('bob','eve')");
  const connections=[await f.pool.connect(),await f.pool.connect()],ready=deferred(),release=deferred(),pending=[];
  const alice=createEncryptedConversationStore({withTransaction:work=>transaction(connections[0],c=>work({async query(sql,args){
    const result=await c.query(sql,args);if(sql.includes('ORDER BY p.hash FOR UPDATE OF p')){ready.resolve();await release.promise;}return result;
  }}))});
  const bob=createEncryptedConversationStore({withTransaction:work=>transaction(connections[1],work)});
  const first=a.sign('reserve',f.reserve),other={conversationId:crypto.randomUUID(),peer:'eve',sourceHash:b.hash,targetHash:eveHash};
  const second=b.sign('reserve',other);
  try{
    pending.push(alice.encryptedOperation(a.context,first));const firstResult=Promise.allSettled(pending);await ready.promise;
    pending.push(bob.encryptedOperation(b.context,second));const secondResult=Promise.allSettled([pending[1]]);
    let blocked=false;for(let n=0;n<100;n++){
      const r=await f.admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[connections[0].processID,connections[1].processID]);
      if(r.rows[0].blocked){blocked=true;break;}await delay(20);
    }
    assert.equal(blocked,true);release.resolve();
    const [winner]=await firstResult,[loser]=await secondResult;
    assert.equal(winner.status,'fulfilled');assert.equal(loser.status,'rejected');assert.equal(loser.reason.code,'encrypted_package_unavailable');
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n,1);
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_key_packages WHERE consumed_at IS NOT NULL')).rows[0].n,2);
    assert.equal((await f.pool.query('SELECT consumed_at FROM conversation_crypto_key_packages WHERE hash=$1',[eveHash])).rows[0].consumed_at,null);
    await alice.encryptedOperation(a.context,first);await assert.rejects(bob.encryptedOperation(b.context,second),{code:'encrypted_package_unavailable'});
    assert.equal((await f.pool.query("SELECT COALESCE(SUM(count),0)::int AS n FROM api_rate_limit_buckets WHERE scope='encrypted-new-conversations'")).rows[0].n,1);
  }finally{release.resolve();await Promise.allSettled(pending);for(const c of connections){await c.query('ROLLBACK');c.release();}}
});

test('crypto account serialization permits foreign-key reads but still blocks concurrent auth and status mutation',async t=>{
  const f=await fixture(t),b=f.members.bob,{authenticateCryptoSession}=require('../backend/conversation-crypto-auth');
  const actor=await f.pool.connect(),other=await f.pool.connect();let update;
  try{
    await actor.query('BEGIN');await authenticateCryptoSession(actor,b.context);
    await other.query('BEGIN');assert.equal((await other.query("SELECT username FROM users WHERE username='bob' FOR KEY SHARE NOWAIT")).rows.length,1);await other.query('ROLLBACK');
    for(const strength of ['NO KEY UPDATE','UPDATE']){
      await other.query('BEGIN');await assert.rejects(other.query("SELECT username FROM users WHERE username='bob' FOR "+strength+' NOWAIT'),{code:'55P03'});await other.query('ROLLBACK');
    }
    await other.query('BEGIN');update=other.query("UPDATE users SET status='suspended' WHERE username='bob'");const settled=Promise.allSettled([update]);
    let blocked=false;for(let n=0;n<100;n++){
      const r=await f.admin.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[actor.processID,other.processID]);
      if(r.rows[0].blocked){blocked=true;break;}await delay(20);
    }
    assert.equal(blocked,true);await actor.query('COMMIT');assert.equal((await settled)[0].status,'fulfilled');await other.query('COMMIT');
    await assert.rejects(f.store.encryptedOperation(b.context,b.sign('directory',{peer:'alice'})),{code:'crypto_device_unauthorized'});
  }finally{await actor.query('ROLLBACK');if(update)await Promise.allSettled([update]);await other.query('ROLLBACK');actor.release();other.release();}
});

test('bounded real PostgreSQL load: two stores persist decryptable messages once with contiguous sequence and receipt convergence',async t=>{
  const f=await fixture(t),a=f.members.alice,b=f.members.bob,count=64;
  await f.store.encryptedOperation(a.context,a.sign('reserve',f.reserve));
  // This load exercise starts from admitted synthetic membership, not a production admission claim.
  const mls=await import('ts-mls'),suite=await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const packageFor=owner=>mls.generateKeyPackage({credentialType:'basic',identity:new TextEncoder().encode('load-fixture:'+owner)},
    mls.defaultCapabilities(),{notBefore:0n,notAfter:BigInt(Math.floor(Date.now()/1000)+86400)},[],suite);
  const ap=await packageFor('alice'),bp=await packageFor('bob');
  let state=await mls.createGroup(new TextEncoder().encode(f.id),ap.publicPackage,ap.privatePackage,[],suite);
  const add=await mls.createCommit({state,cipherSuite:suite},{extraProposals:[{proposalType:'add',add:{keyPackage:bp.publicPackage}}]});
  state=add.newState;
  let recipient=await mls.joinGroup(add.welcome,bp.publicPackage,bp.privatePackage,mls.emptyPskIndex,suite,state.ratchetTree);
  const epoch=String(state.groupContext.epoch);
  await f.pool.query("UPDATE encrypted_conversations SET status='active',epoch=$2 WHERE id=$1",[f.id,epoch]);
  await f.pool.query('INSERT INTO encrypted_conversation_epochs(conversation_id,epoch,creator_device,recipient_device) VALUES($1,$2,$3,$4)',[f.id,epoch,a.id,b.id]);
  const packets=[];
  for(let i=0;i<count;i++) {
    const sealed=await mls.createApplicationMessage(state,new TextEncoder().encode('synthetic-load-'+i),suite);state=sealed.newState;
    const bytes=Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:sealed.privateMessage}));
    packets.push({id:crypto.randomUUID(),conversationId:f.id,epoch,deviceId:a.id,ciphertext:bytes.toString('base64url'),hash:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  let terminated=false,terminationResult;
  const interrupted=createEncryptedConversationStore({withTransaction:async work=>{
    const c=await f.pool.connect();c.on('error',()=>{});
    try {
      await c.query('BEGIN');
      const result=await work({query:async(sql,args)=>{
        const result=await c.query(sql,args);
        if(!terminated&&sql.includes('INSERT INTO encrypted_conversation_messages')) {
          terminationResult=(await f.admin.query('SELECT pg_terminate_backend($1) AS stopped',[c.processID])).rows[0].stopped;
          terminated=terminationResult===true;
          await c.query('SELECT 1');
        }
        return result;
      }});
      await c.query('COMMIT');return result;
    }catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}
    finally{c.release(true);}
  }});
  const retryProof=a.sign('send',packets[0]);
  await assert.rejects(interrupted.encryptedOperation(a.context,retryProof),error=>['57P01','08006'].includes(error.code)
    ||['Connection terminated unexpectedly','Client has encountered a connection error and is not queryable'].includes(error.message));
  assert.equal(terminationResult,true);assert.equal(terminated,true);
  for(const table of ['encrypted_conversation_messages','encrypted_message_acceptances','encrypted_message_push_outbox'])
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM '+table)).rows[0].n,0);
  assert.equal(String((await f.pool.query('SELECT next_sequence FROM encrypted_conversations WHERE id=$1',[f.id])).rows[0].next_sequence),'0');
  const recovered=await f.store.encryptedOperation(a.context,retryProof);assert.equal(recovered.status,'sent');
  assert.equal((await f.pool.query('SELECT ciphertext FROM encrypted_conversation_messages WHERE id=$1',[packets[0].id])).rows[0].ciphertext,packets[0].ciphertext);
  const withTransaction=async work=>{const c=await f.pool.connect();try{return await transaction(c,work);}finally{c.release();}};
  const nodes=[0,1].map(()=>createEncryptedConversationStore({withTransaction}));
  const jobs=packets.flatMap((p,i)=>i%7===0?[p,p]:[p]),latencies=[];let next=0;
  const started=performance.now();
  await Promise.all(Array.from({length:6},(_,worker)=>(async()=>{
    while(next<jobs.length) {const p=jobs[next++],at=performance.now();await nodes[worker%2].encryptedOperation(a.context,a.sign('send',p));latencies.push(performance.now()-at);}
  })()));
  const durationMs=performance.now()-started;
  const stored=(await f.pool.query('SELECT id,sequence::text,ciphertext,hash FROM encrypted_conversation_messages ORDER BY encrypted_conversation_messages.sequence')).rows;
  assert.equal(stored.length,count);assert.deepEqual(stored.map(r=>r.sequence),Array.from({length:count},(_,i)=>String(i+1)));
  const decoded=new Set();
  for(const row of stored) {
    const bytes=Buffer.from(row.ciphertext,'base64url'),[wire,offset]=mls.decodeMlsMessage(bytes,0);
    assert.equal(offset,bytes.length);
    const result=await mls.processPrivateMessage(recipient,wire.privateMessage,mls.emptyPskIndex,suite);recipient=result.newState;
    assert.equal(result.kind,'applicationMessage');decoded.add(new TextDecoder().decode(result.message));
    const receipt={id:row.id,conversationId:f.id,epoch,hash:row.hash,kind:'delivered'};
    await Promise.all(nodes.map(node=>node.encryptedOperation(b.context,b.sign('receipt',receipt))));
  }
  assert.equal(decoded.size,count);
  assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts WHERE kind='delivered'")).rows[0].n,count);
  const inbox=await f.store.encryptedOperation(b.context,b.sign('poll',{}));
  assert.ok(inbox.groups.every(g=>g.messages.length===0));
  latencies.sort((x,y)=>x-y);
  t.diagnostic(JSON.stringify({scope:'disposable-local-postgres-synthetic-pair',uniqueMessages:count,attempts:jobs.length,
    concurrentConnections:6,stores:2,duplicateRows:0,recipientDecryptions:decoded.size,durationMs:Math.round(durationMs),
    p95StoreAttemptMs:Math.round(latencies[Math.ceil(latencies.length*0.95)-1]),terminatedConnectionRecovered:true,
    productionOutageProven:false,productionSloProven:false,shoppingRoomsProven:false}));
});
test('independent connections ACK one receipt device exactly once without draining another',async t=>{
  const f=await replacementFixture(t),a=f.members.alice,b=f.members.bob,other=f.targets[0],message=crypto.randomUUID();
  await f.pool.query('INSERT INTO encrypted_conversation_epochs VALUES($1,$2,$3,$4)',[f.id,'1',a.id,b.id]);
  await f.pool.query('INSERT INTO encrypted_conversation_epoch_devices VALUES($1,$2,$3,$4)',[f.id,'1',other.id,'bob']);
  await f.pool.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof)
    VALUES($1,$2,$3,'1',1,'synthetic-opaque','synthetic-hash','{}')`,[message,f.id,a.id]);
  const receipt={id:message,conversationId:f.id,epoch:'1',hash:'synthetic-hash',kind:'delivered'};
  await f.store.encryptedOperation(b.context,b.sign('receipt',receipt));
  // A pre-admitted synthetic receipt tests ACK isolation, not MLS admission or group capacity.
  await f.pool.query(`INSERT INTO encrypted_conversation_receipts VALUES($1,$2,'delivered',$3,NULL)`,[message,other.id,
    JSON.stringify({actorId:other.id,owner:'bob',payload:receipt})]);
  const nodes=[0,1].map(()=>createEncryptedConversationStore({withTransaction:async work=>{
    const c=await f.pool.connect();try{return await transaction(c,work);}finally{c.release();}
  }}));
  await assert.rejects(nodes[0].encryptedOperation(a.context,a.sign('receipt-ack',receipt)),{code:'encrypted_receipt_ack_ambiguous'});
  await Promise.all(Array.from({length:16},(_,index)=>nodes[index%2].encryptedOperation(a.context,a.sign('receipt-ack',{
    ...receipt,receiptDeviceId:b.id
  }))));
  const pending=(await f.store.encryptedOperation(a.context,a.sign('poll',{}))).groups[0].receipts;
  assert.equal(pending.length,1);assert.equal(pending[0].actorId,other.id);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipt_acks')).rows[0].n,1);
  // An ACK observed on another native sender profile must not suppress this sender's queue.
  await f.pool.query(`INSERT INTO encrypted_conversation_receipt_acks(message_id,receipt_device,kind,observer_device,proof)
    VALUES($1,$2,'delivered',$3,'{}')`,[message,other.id,b.id]);
  assert.equal((await f.store.encryptedOperation(a.context,a.sign('poll',{}))).groups[0].receipts.length,1);
  await nodes[1].encryptedOperation(a.context,a.sign('receipt-ack',{...receipt,receiptDeviceId:other.id}));
  assert.equal((await f.store.encryptedOperation(a.context,a.sign('poll',{}))).groups[0].receipts.length,0);
});

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

async function admissionRaceFixture(t) {
  const f=await fixture(t,{multiDeviceEnabled:true}),a=f.members.alice,b=f.members.bob;
  await f.store.encryptedOperation(a.context,a.sign('reserve',f.reserve));
  await f.pool.query("UPDATE encrypted_conversations SET status='active' WHERE id=$1",[f.id]);
  await f.pool.query('INSERT INTO encrypted_conversation_epochs VALUES($1,$2,$3,$4)',[f.id,'1',a.id,b.id]);
  const keys=crypto.generateKeyPairSync('ed25519'),raw=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32),id=crypto.randomUUID();
  const fingerprint=crypto.createHash('sha256').update(raw).digest('hex'),context={...a.context};
  await f.pool.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,'alice',$2,$3,'active')`,[id,raw.toString('base64url'),fingerprint]);
  const target={id,context,sign(action,payload){const op={action,actorId:id,requestId:crypto.randomUUID(),issuedAt:Date.now(),payload};
    op.signature=crypto.sign(null,operationBytes(context,op),keys.privateKey).toString('base64url');return op;}};
  const mls=await import('ts-mls'),suite=await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const packages=[];
  for(const member of [a,b,target]) {
    const d=(await f.pool.query('SELECT owner_id,fingerprint FROM conversation_crypto_devices WHERE id=$1',[member.id])).rows[0];
    const pkg=await mls.generateKeyPackage({credentialType:'basic',identity:new TextEncoder().encode(JSON.stringify(['winga-mls-device',1,d.owner_id,member.id,d.fingerprint]))},
      mls.defaultCapabilities(),{notBefore:0n,notAfter:BigInt(Math.floor(Date.now()/1000)+86400)},[],suite);
    const bytes=Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_key_package',keyPackage:pkg.publicPackage})),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    await f.pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at)
      VALUES($1,$2,$3,$4,'{}',NOW()+INTERVAL '1 day')`,[hash,member.id,bytes.toString('base64url'),Buffer.from(pkg.publicPackage.leafNode.signaturePublicKey).toString('base64url')]);
    packages.push(pkg);if(member===target)target.hash=hash;
  }
  const [ap,bp,tp]=packages;
  let group=await mls.createGroup(new TextEncoder().encode(f.id),ap.publicPackage,ap.privatePackage,[],suite);
  const pair=await mls.createCommit({state:group,cipherSuite:suite},{extraProposals:[{proposalType:'add',add:{keyPackage:bp.publicPackage}}]});
  const added=await mls.createCommit({state:pair.newState,cipherSuite:suite},{extraProposals:[{proposalType:'add',add:{keyPackage:tp.publicPackage}}]});
  const roster=added.newState.ratchetTree.filter(n=>n?.nodeType==='leaf').map(n=>{const d=JSON.parse(new TextDecoder().decode(n.leaf.credential.identity));
    return {owner:d[2],id:d[3],fingerprint:d[4],key:Array.from(n.leaf.signaturePublicKey)};}).sort((a,b)=>`${a.owner}/${a.id}`<`${b.owner}/${b.id}`?-1:1);
  const intent={id:crypto.randomUUID(),conversationId:f.id,previousEpoch:'1',actorOwner:'alice',actorDeviceId:a.id,
    addedOwner:'alice',addedDeviceId:target.id,packageHash:target.hash};
  const {encodeRatchetTree}=await import('ts-mls/ratchetTree.js');
  const transfer={...intent,version:2,epoch:'2',roster:JSON.stringify(roster),commit:Buffer.from(mls.encodeMlsMessage(added.commit)).toString('base64url'),
    welcome:Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:added.welcome})).toString('base64url'),
    tree:Buffer.from(encodeRatchetTree(added.newState.ratchetTree)).toString('base64url')};
  const acceptance={conversationId:f.id,transferId:intent.id,epoch:'2',transferHash:crypto.createHash('sha256').update(JSON.stringify(transfer,Object.keys(transfer).sort())).digest('hex')};
  const nodes=[0,1].map(()=>createEncryptedConversationStore({multiDeviceEnabled:true,withTransaction:async work=>{const c=await f.pool.connect();try{return await transaction(c,work);}finally{c.release();}}}));
  return {...f,target,intent,transfer,acceptance,nodes,mls,suite,expandedState:added.newState};
}

test('real PostgreSQL admission races activate one epoch once across independent stores and all endpoint acceptance retries',async t=>{
  const f=await admissionRaceFixture(t),a=f.members.alice;
  const intents=[f.intent,{...f.intent,id:crypto.randomUUID()}];
  const racing=await Promise.allSettled(intents.map((intent,i)=>f.nodes[i].encryptedOperation(a.context,a.sign('device-reserve',intent))));
  assert.equal(racing.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(racing.find(r=>r.status==='rejected').reason.code,'encrypted_device_admission_conflict');
  const winner=intents[racing.findIndex(r=>r.status==='fulfilled')];
  const transfer={...f.transfer,id:winner.id},acceptance={...f.acceptance,transferId:winner.id,
    transferHash:crypto.createHash('sha256').update(JSON.stringify(transfer,Object.keys(transfer).sort())).digest('hex')};
  await Promise.all(Array.from({length:8},(_,i)=>f.nodes[i%2].encryptedOperation(a.context,a.sign('device-reserve',winner))));
  await Promise.all(Array.from({length:8},(_,i)=>f.nodes[i%2].encryptedOperation(a.context,a.sign('device-transfer',transfer))));
  const actors=[a,f.members.bob,f.target];
  await Promise.all(Array.from({length:18},(_,i)=>{const member=actors[i%3];return f.nodes[i%2].encryptedOperation(member.context,member.sign('device-accept',acceptance));}));
  assert.equal((await f.pool.query('SELECT epoch FROM encrypted_conversations WHERE id=$1',[f.id])).rows[0].epoch,'2');
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_device_admissions')).rows[0].n,1);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_device_acceptances')).rows[0].n,3);
  assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE epoch='2'")).rows[0].n,3);
  assert.equal((await f.pool.query('SELECT membership_version::int AS n FROM conversation_event_streams WHERE id=(SELECT canonical_id FROM encrypted_conversations WHERE id=$1)',[f.id])).rows[0].n,2);
  const events=(await f.pool.query("SELECT kind FROM conversation_events WHERE kind='access_changed'")).rows;
  assert.equal(events.length,3);
  t.diagnostic(JSON.stringify({scope:'disposable-local-postgres-native-admission',stores:2,concurrentConnections:6,
    reserveAttempts:10,transferAttempts:8,acceptanceAttempts:18,uniqueEpochTransitions:1,uniqueEndpointAcceptances:3,shoppingRoomsProven:false}));
});

test('an independent old-epoch send waits behind admission and cannot cross the committed freeze',async t=>{
  const f=await admissionRaceFixture(t),a=f.members.alice,b=f.members.bob,blocker=await f.pool.connect(),waiter=await f.pool.connect();
  const ready=deferred(),release=deferred();let freezing,waiting;
  try {
    freezing=heldStore(f,blocker,ready,release,{multiDeviceEnabled:true}).encryptedOperation(a.context,a.sign('device-reserve',f.intent));
    await ready.promise;
    const bytes=Buffer.from([1]),packet={id:crypto.randomUUID(),conversationId:f.id,epoch:'1',deviceId:b.id,
      ciphertext:bytes.toString('base64url'),hash:crypto.createHash('sha256').update(bytes).digest('hex')};
    waiting=createEncryptedConversationStore({multiDeviceEnabled:true,withTransaction:work=>transaction(waiter,work)})
      .encryptedOperation(b.context,b.sign('send',packet)).catch(error=>error);
    await waitBlocked(f,blocker,waiter);release.resolve();await freezing;
    assert.equal((await waiting).code,'encrypted_membership_pending');
    assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n,0);
    assert.equal((await f.pool.query('SELECT epoch FROM encrypted_conversations')).rows[0].epoch,'1');
  } finally {release.resolve();await Promise.allSettled([freezing,waiting]);blocker.release();waiter.release();}
});

test('independent native Remove retries advance one epoch once and cannot deliver protected content to the removed endpoint',async t=>{
  const f=await admissionRaceFixture(t),a=f.members.alice;
  await f.nodes[0].encryptedOperation(a.context,a.sign('device-reserve',f.intent));
  await f.nodes[0].encryptedOperation(a.context,a.sign('device-transfer',f.transfer));
  for(const member of [a,f.members.bob,f.target])await f.nodes[0].encryptedOperation(member.context,member.sign('device-accept',f.acceptance));
  const intent={id:crypto.randomUUID(),conversationId:f.id,previousEpoch:'2',actorOwner:'alice',actorDeviceId:a.id,
    removedOwner:'alice',removedDeviceId:f.target.id,addedOwner:'',addedDeviceId:'',packageHash:''};
  const index=f.expandedState.ratchetTree.findIndex(n=>n?.nodeType==='leaf'&&JSON.parse(new TextDecoder().decode(n.leaf.credential.identity))[3]===f.target.id)/2;
  const committed=await f.mls.createCommit({state:f.expandedState,cipherSuite:f.suite},{extraProposals:[{proposalType:'remove',remove:{removed:index}}]});
  const roster=committed.newState.ratchetTree.filter(n=>n?.nodeType==='leaf').map(n=>{const d=JSON.parse(new TextDecoder().decode(n.leaf.credential.identity));
    return {owner:d[2],id:d[3],fingerprint:d[4],key:Array.from(n.leaf.signaturePublicKey)};}).sort((a,b)=>`${a.owner}/${a.id}`<`${b.owner}/${b.id}`?-1:1);
  const {encodeRatchetTree}=await import('ts-mls/ratchetTree.js');
  const payload={...intent,version:3,epoch:'3',roster:JSON.stringify(roster),commit:Buffer.from(f.mls.encodeMlsMessage(committed.commit)).toString('base64url'),welcome:'',tree:Buffer.from(encodeRatchetTree(committed.newState.ratchetTree)).toString('base64url')};
  await Promise.all(Array.from({length:12},(_,i)=>f.nodes[i%2].encryptedOperation(a.context,a.sign('device-change-reserve',intent))));
  await Promise.all(Array.from({length:12},(_,i)=>f.nodes[i%2].encryptedOperation(a.context,a.sign('device-change-transfer',payload))));
  const acceptance={conversationId:f.id,transferId:intent.id,epoch:'3',transferHash:crypto.createHash('sha256').update(JSON.stringify(payload,Object.keys(payload).sort())).digest('hex')};
  await assert.rejects(f.nodes[1].encryptedOperation(f.target.context,f.target.sign('device-change-accept',acceptance)),{code:'encrypted_membership_required'});
  const actors=[a,f.members.bob];
  await Promise.all(Array.from({length:20},(_,i)=>f.nodes[i%2].encryptedOperation(actors[i%2].context,actors[i%2].sign('device-change-accept',acceptance))));
  assert.equal((await f.pool.query('SELECT epoch FROM encrypted_conversations')).rows[0].epoch,'3');
  assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE epoch='2'")).rows[0].n,3);
  assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE epoch='3'")).rows[0].n,2);
  const poll=await f.nodes[1].encryptedOperation(f.target.context,f.target.sign('poll',{}));assert.equal(poll.groups.length,0);
  const data=await f.mls.createApplicationMessage(committed.newState,new TextEncoder().encode('after native removal'),f.suite);
  const bytes=Buffer.from(f.mls.encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:data.privateMessage}));
  const packet={id:crypto.randomUUID(),conversationId:f.id,epoch:'3',deviceId:a.id,ciphertext:bytes.toString('base64url'),hash:crypto.createHash('sha256').update(bytes).digest('hex')};
  await f.nodes[0].encryptedOperation(a.context,a.sign('send',packet));
  const peer=await f.nodes[1].encryptedOperation(f.members.bob.context,f.members.bob.sign('poll',{}));assert.equal(peer.groups[0].messages.length,1);
  await assert.rejects(f.nodes[1].encryptedOperation(f.target.context,f.target.sign('send',{...packet,deviceId:f.target.id})),{code:'encrypted_membership_required'});
  t.diagnostic(JSON.stringify({scope:'disposable-local-postgres-native-removal',stores:2,concurrentConnections:6,reserveAttempts:12,transferAttempts:12,acceptanceAttempts:20,uniqueEpochTransitions:1,removedEndpointDenied:true,shoppingRoomsProven:false}));
});

test('real PostgreSQL archive load stages immutable pages across two stores and publishes one CAS root',async t=>{
  const f=await fixture(t);
  for(const name of ['encrypted-conversation-backups','encrypted-history-pages'])for(const sql of require('../backend/migrations/'+name).statements)await f.pool.query(sql);
  const {createEncryptedConversationBackupStore}=require('../backend/encrypted-conversation-backups');
  const nodes=[0,1].map(()=>createEncryptedConversationBackupStore({withTransaction:async work=>{const c=await f.pool.connect();try{return await transaction(c,work);}finally{c.release();}}}));
  const codec=await require('../src/chat/secure-content').createSecureContent(),key=codec.generateRecoveryKey(),context=f.members.bob.context,pages=[];
  for(let n=0;n<64;n++)pages.push(await codec.sealRecovery(new TextEncoder().encode('archive-'+n+'x'.repeat(32768)),key,{owner:'bob',id:'pg-page-'+n,generation:1}));
  const latencies=[];let accepted=0,next=0;
  await Promise.all(Array.from({length:6},async(_,worker)=>{while(next<384){const attempt=next++,start=performance.now();
    await nodes[worker%2].writeEncryptedHistoryPage(context,{expectedRevision:'0',capsule:pages[attempt%64]});latencies.push(performance.now()-start);accepted++;}}));
  assert.equal(accepted,384);assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_backup_pages')).rows[0].n,64);
  const roots=[];for(let n=0;n<2;n++)roots.push({expectedRevision:'0',pageIds:pages.map(p=>p.id),capsule:await codec.sealRecovery(new Uint8Array([n+1]),key,{owner:'bob',id:'pg-root-'+n,generation:1})});
  const race=await Promise.allSettled(nodes.map((node,n)=>node.writeEncryptedConversationBackup(context,roots[n])));
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.code,'backup_revision_conflict');
  for(let n=0;n<64;n++)assert.deepEqual((await nodes[n%2].readEncryptedHistoryPage(context,{id:pages[n].id,revision:'1'})).capsule,pages[n]);
  latencies.sort((a,b)=>a-b);
  t.diagnostic(JSON.stringify({scope:'disposable-local-postgres-encrypted-history-pages',stores:2,concurrentConnections:6,uniquePages:64,writeAttempts:384,acceptedAttempts:accepted,uniqueRootRevisions:1,p50WriteMs:Math.round(latencies[Math.floor(latencies.length*.5)]),p95WriteMs:Math.round(latencies[Math.floor(latencies.length*.95)]),productionCapacityProven:false,shoppingRoomsProven:false}));
});
test('real PostgreSQL own-native archive retries store each encrypted page once and acknowledge one publication',async t=>{
  const f=await admissionRaceFixture(t),a=f.members.alice,b=f.members.bob,target=f.target;
  await f.nodes[0].encryptedOperation(a.context,a.sign('device-reserve',f.intent));
  await f.nodes[0].encryptedOperation(a.context,a.sign('device-transfer',f.transfer));
  for(const actor of [a,b,target])await f.nodes[0].encryptedOperation(actor.context,actor.sign('device-accept',f.acceptance));
  const ec=crypto.createECDH('prime256v1');ec.generateKeys();
  const request={id:crypto.randomUUID(),conversationId:f.id,epoch:'2',donorDeviceId:a.id,publicKey:ec.getPublicKey().toString('base64url'),historyHash:'0'.repeat(64)};
  const call=(actor,action,payload,n=0)=>f.nodes[n%2].encryptedOperation(actor.context,actor.sign(action,payload));
  await Promise.all(Array.from({length:12},(_,n)=>call(target,'history-reserve',request,n)));
  const codec=await require('../src/chat/secure-content').createSecureContent(),key=codec.generateRecoveryKey(),pages=[];
  for(let index=0;index<64;index++){
    const capsule=await codec.sealRecovery(new TextEncoder().encode('SYNTHETIC PRIVATE PAGE '+index+'x'.repeat(8192)),key,{owner:'alice',id:request.id+':'+index,generation:1});
    pages.push({...request,index,capsule,hash:crypto.createHash('sha256').update(JSON.stringify(capsule,Object.keys(capsule).sort())).digest('hex')});
    delete pages[index].donorDeviceId;delete pages[index].publicKey;delete pages[index].historyHash;
  }
  let next=0;const timings=[];
  await Promise.all(Array.from({length:6},async(_,worker)=>{while(next<256){const index=next++,start=performance.now();await call(a,'history-page-put',pages[index%64],worker);timings.push(performance.now()-start);}}));
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_history_pages')).rows[0].n,64);
  const capsule=await codec.sealRecovery(new Uint8Array([1,2,3]),key,{owner:'alice',id:request.id,generation:1}),root={id:request.id,conversationId:f.id,epoch:'2',publicKey:request.publicKey,capsule,
    hash:crypto.createHash('sha256').update(JSON.stringify(capsule,Object.keys(capsule).sort())).digest('hex'),pageCount:64};
  await Promise.all(Array.from({length:12},(_,n)=>call(a,'history-publish',root,n)));
  const stored=[];let after=-1;
  do{const r=await call(target,'history-pages',{id:request.id,conversationId:f.id,epoch:'2',after});stored.push(...r.pages);after=r.next;}while(after!==null);
  assert.equal(stored.length,64);for(const page of stored)assert.equal(new TextDecoder().decode(await codec.openRecovery(page.capsule,key,{owner:'alice',id:request.id+':'+page.index,generation:1})), 'SYNTHETIC PRIVATE PAGE '+page.index+'x'.repeat(8192));
  const accept={id:request.id,conversationId:f.id,epoch:'2',hash:root.hash};
  await Promise.all(Array.from({length:12},(_,n)=>call(target,'history-accept',accept,n)));
  assert.equal((await call(a,'history-publish',root)).status,'accepted');
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_history_pages')).rows[0].n,0);
  const transfers=(await f.pool.query('SELECT * FROM encrypted_conversation_history_transfers')).rows;
  assert.equal(transfers.length,1);assert.equal(transfers[0].status,'accepted');assert.equal(JSON.stringify(transfers).includes('SYNTHETIC PRIVATE'),false);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n,0);
  timings.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({scope:'disposable-local-postgres-own-native-archive',stores:2,concurrentConnections:6,uniquePages:64,writeAttempts:256,
    publicationAttempts:12,acceptanceAttempts:12,p50WriteMs:Math.round(timings[Math.floor(timings.length*.5)]),p95WriteMs:Math.round(timings[Math.floor(timings.length*.95)]),productionCapacityProven:false,shoppingRoomsProven:false}));
});

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
function heldStore(f,client,ready,release,options={}) {
  return createEncryptedConversationStore({mediaEnabled:true,...options,withTransaction:work=>transaction(client,async c=>{
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
