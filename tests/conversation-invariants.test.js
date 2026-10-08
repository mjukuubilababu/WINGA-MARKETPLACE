const test=require('node:test'),assert=require('node:assert/strict');
const {readConversationInvariants,assertEncryptedAcceptance}=require('../backend/conversation-invariants');
const {evaluateConversationOperations}=require('../backend/conversation-operations-health');
async function fixture(t,{baseline=false}={}) {
  const db=await(await import('./helpers/shopping-room-database.mjs')).roomDatabase(t);
  await db.exec(`CREATE TABLE encrypted_conversations(id TEXT PRIMARY KEY,next_sequence BIGINT NOT NULL DEFAULT 0);
    CREATE TABLE encrypted_conversation_messages(id TEXT PRIMARY KEY,conversation_id TEXT,sender_device TEXT,epoch TEXT,sequence BIGINT,
      ciphertext TEXT,hash TEXT,proof JSONB,media_id TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(conversation_id,sequence));
    CREATE TABLE encrypted_conversation_media(id TEXT,message_id TEXT,conversation_id TEXT,uploader_device TEXT,status TEXT);
    INSERT INTO encrypted_conversations VALUES('direct',0),('room',0)`);
  const insert=async(client,id,group='direct',mediaId=null)=>{
    const sequence=(await client.query('UPDATE encrypted_conversations SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence',[group])).rows[0].next_sequence;
    await client.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof)
      VALUES($1,$2,'device','1',$3,'OPAQUE-CIPHERTEXT','digest',$4)`,[id,group,sequence,JSON.stringify({payload:{...(mediaId?{mediaId}:{})}})]);
  };
  if(baseline)await db.transaction(client=>insert(client,'baseline'));
  await db.transaction(async client=>{for(const sql of require('../backend/migrations/encrypted-message-invariants').statements)await client.exec(sql);});
  return {db,insert};
}
test('canonical insert atomically records durable evidence and optional work; rollback never creates Sent evidence',async t=>{
  const f=await fixture(t,{baseline:true});
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM encrypted_message_push_outbox')).rows[0].n,0);
  await assert.rejects(f.db.transaction(async c=>{await f.insert(c,'aborted');throw Error('commit failed');}),/commit failed/);
  await f.db.transaction(c=>f.insert(c,'accepted'));
  await f.db.transaction(c=>f.insert(c,'room-message','room'));
  const state=await readConversationInvariants(f.db);assert.equal(state.ok,true);
  assert.equal(state.baselineRecords,1);assert.equal(state.transactionRecords,2);assert.equal(state.push.pending,2);
  await assertEncryptedAcceptance(f.db,'accepted');await assert.rejects(assertEncryptedAcceptance(f.db,'aborted'),{code:'encrypted_message_durability_unavailable'});
  assert.equal(JSON.stringify(state).includes('CIPHERTEXT'),false);assert.equal(JSON.stringify(state).includes('accepted'),false);
});
test('canonical record and acceptance guards forbid mutation, deletion and truncate but permit only the signed initial attachment',async t=>{
  const f=await fixture(t);await f.db.transaction(c=>f.insert(c,'accepted','direct','media'));
  await f.db.exec("INSERT INTO encrypted_conversation_media VALUES('media','accepted','direct','device','attached')");
  await f.db.query('UPDATE encrypted_conversation_messages SET media_id=$1 WHERE id=$2',['media','accepted']);
  await assertEncryptedAcceptance(f.db,'accepted');
  for(const sql of ["UPDATE encrypted_conversation_messages SET ciphertext='changed'","DELETE FROM encrypted_conversation_messages",
    'TRUNCATE encrypted_conversation_messages',"UPDATE encrypted_conversation_messages SET media_id=NULL",
    "DELETE FROM encrypted_message_acceptances","UPDATE encrypted_message_acceptances SET hash='changed'",
    'TRUNCATE encrypted_message_acceptances CASCADE'])await assert.rejects(f.db.exec(sql),/encrypted_message_invariant_violation/);
  assert.equal((await readConversationInvariants(f.db)).ok,true);
});
test('privileged record loss, altered ciphertext and disabled guards raise aggregate critical alerts and never reissue Sent',async t=>{
  for(const fault of ['delete','ciphertext','evidence','sequence','guard']){
    const f=await fixture(t);await f.db.transaction(c=>f.insert(c,'accepted'));
    if(fault==='delete')await f.db.exec('ALTER TABLE encrypted_conversation_messages DISABLE TRIGGER guard_encrypted_message_record; DELETE FROM encrypted_conversation_messages');
    if(fault==='ciphertext')await f.db.exec("ALTER TABLE encrypted_conversation_messages DISABLE TRIGGER guard_encrypted_message_record; UPDATE encrypted_conversation_messages SET ciphertext='corrupted'");
    if(fault==='evidence')await f.db.exec('DELETE FROM encrypted_message_push_outbox; ALTER TABLE encrypted_message_acceptances DISABLE TRIGGER guard_encrypted_acceptance; DELETE FROM encrypted_message_acceptances');
    if(fault==='sequence')await f.db.exec('UPDATE encrypted_conversations SET next_sequence=9');
    if(fault==='guard')await f.db.exec('ALTER TABLE encrypted_conversation_messages DISABLE TRIGGER record_encrypted_acceptance');
    const state=await readConversationInvariants(f.db);assert.equal(state.ok,false);
    const result=evaluateConversationOperations({state:{invariants:state},privateStorage:{privacyVerified:true},policy:{fullProfileEnabled:true,dispatchEnabled:true,pushEnabled:true}});
    assert.ok(result.alerts.some(v=>v.includes('critical')||v==='conversation_invariant_guards_unavailable'));
    if(['delete','ciphertext','evidence'].includes(fault))await assert.rejects(assertEncryptedAcceptance(f.db,'accepted'),{code:'encrypted_message_durability_unavailable'});
    assert.equal(JSON.stringify(result).includes('corrupted'),false);
  }
});
