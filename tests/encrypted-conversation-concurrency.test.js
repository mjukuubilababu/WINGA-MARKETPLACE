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
  try { for(const name of ['conversation-event-ledger','conversation-security-mode','conversation-crypto-devices','conversation-crypto-key-packages','encrypted-conversations'])
    await transaction(migrationClient,async c=>{for(const sql of require(`../backend/migrations/${name}`).statements)await c.query(sql);}); }
  finally { migrationClient.release(); }
  const members={};
  for(const [owner,token]of [['alice','a'],['bob','b1']]){
    const keys=crypto.generateKeyPairSync('ed25519'),raw=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32),id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(owner).digest('hex');
    await pool.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status) VALUES($1,$2,$3,$4,'active')`,[id,owner,raw.toString('base64url'),crypto.createHash('sha256').update(raw).digest('hex')]);
    await pool.query(`INSERT INTO conversation_crypto_key_packages(hash,device_id,package,mls_public_key,identity_proof,expires_at) VALUES($1,$2,'public-fixture','public-fixture','{}',NOW()+interval '1 day')`,[hash,id]);
    const context={owner,deviceId:token,token};
    members[owner]={id,hash,context,sign(action,payload){const op={action,actorId:id,requestId:crypto.randomUUID(),issuedAt:Date.now(),payload};op.signature=crypto.sign(null,operationBytes(context,op),keys.privateKey).toString('base64url');return op;}};
  }
  const store=createEncryptedConversationStore({withTransaction:async work=>{const c=await pool.connect();try{return await transaction(c,work);}finally{c.release();}}});
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
