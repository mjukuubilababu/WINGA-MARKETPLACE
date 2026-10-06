const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {CONSENT,validateDisclosure,createConversationReportStore}=require('../backend/conversation-reports');
const migration={statements:[...require('../backend/migrations/conversation-report-evidence').statements,
  ...require('../backend/migrations/conversation-report-subject').statements]};
const fs=require('node:fs'),vm=require('node:vm');
const alice={owner:'alice',token:'ta',deviceId:'sa'};
const mod={owner:'mod',token:'tm',deviceId:'sm'};
const payload=(more={})=>({owner:'alice',sessionId:'sa',peer:'bob',requestId:randomUUID(),consent:CONSENT,
  reason:'harassment',description:'Selected evidence only',selection:[{id:'m1',kind:'text',text:'Reported text'}],...more});
async function fixture() {
  const db=new PGlite();
  await db.exec("CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active',role TEXT DEFAULT 'buyer'); INSERT INTO users(username,role) VALUES('alice','buyer'),('bob','buyer'),('mallory','buyer'),('mod','moderator'); CREATE TABLE sessions(token TEXT,username TEXT,session_id TEXT,expires_at BIGINT); INSERT INTO sessions VALUES('ta','alice','sa',9999999999999),('tb','bob','sb',9999999999999),('tm','mod','sm',9999999999999); CREATE TABLE reports(id TEXT PRIMARY KEY,target_type TEXT,target_user_id TEXT,target_product_id TEXT,reporter_user_id TEXT,reason TEXT,description TEXT,status TEXT,review_note TEXT,reviewed_by TEXT,created_at TEXT,updated_at TEXT,row_version BIGINT); CREATE TABLE open_report_claims(reporter_user_id TEXT,target_type TEXT,target_user_id TEXT,target_product_id TEXT,report_id TEXT,PRIMARY KEY(reporter_user_id,target_type,target_user_id,target_product_id)); CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,timestamp TEXT); INSERT INTO messages VALUES('m1','bob','alice','2026-10-06T10:00:00Z'),('own','alice','bob','2026-10-06T10:01:00Z'),('unselected','bob','alice','2026-10-06T10:02:00Z'),('outsider','bob','mallory','2026-10-06T10:03:00Z'); CREATE TABLE encrypted_conversations(id TEXT PRIMARY KEY,creator TEXT,recipient TEXT); INSERT INTO encrypted_conversations VALUES('g1','bob','alice'); CREATE TABLE conversation_crypto_devices(id TEXT PRIMARY KEY,owner_id TEXT); INSERT INTO conversation_crypto_devices VALUES('db','bob'); CREATE TABLE encrypted_conversation_messages(id TEXT PRIMARY KEY,conversation_id TEXT,sender_device TEXT,created_at TEXT,hash TEXT,media_id TEXT); INSERT INTO encrypted_conversation_messages VALUES('e1','g1','db','2026-10-06T10:04:00Z','ciphertext-hash',NULL),('media1','g1','db','2026-10-06T10:05:00Z','media-hash','attachment1');");
  for(let i=0;i<2;i++)for(const sql of migration.statements)await db.exec(sql);
  const withTransaction=work=>db.transaction(tx=>work({query:(sql,params)=>
    sql.includes('pg_advisory_xact_lock')?{rows:[]}:tx.query(sql,params)}));
  return {db,store:createConversationReportStore({withTransaction}),count:async table=>(await db.query('SELECT COUNT(*)::int AS n FROM '+table)).rows[0].n};
}
test('disclosure requires explicit consent, exact whitelists, bounded selections and canonical identities',()=>{
  assert.equal(validateDisclosure(alice,payload()).consent,CONSENT);
  for(const more of [{consent:false},{owner:'bob'},{sessionId:'sb'},{peer:'alice'},{peer:'bob\n'},
    {requestId:'arbitrary'},{reason:'ban'},{description:'x'.repeat(501)},{selection:[]},{key:'secret'},
    {selection:[{id:'m1',kind:'text',text:'hi',key:'secret'}]},
    {selection:[{id:'m1',kind:'text',text:'WINGA-MEDIA/PRIVATE'}]},
    {selection:[{id:'m1',kind:'text',text:'x\u0000'}]},
    {selection:[{id:'m1',kind:'text',text:'x'.repeat(4097)}]},
    {selection:Array.from({length:11},(_,i)=>({id:'m'+i,kind:'text',text:'x'}))},
    {selection:[{id:'m1',kind:'text',text:'x'},{id:'m1',kind:'text',text:'y'}]},
    {selection:Array.from({length:10},(_,i)=>({id:'m'+i,kind:'text',text:'界'.repeat(4096)}))}])
    assert.throws(()=>validateDisclosure(alice,payload(more)),{status:400});
});
test('report subject migration is additive and registered once after its evidence dependency',()=>{
  const ids=require('../backend/migrations').MIGRATIONS.map(m=>m.id);
  const subject='2026100604_conversation_report_subject';
  assert.equal(ids.filter(id=>id===subject).length,1);
  assert.ok(ids.indexOf(subject)>ids.indexOf('2026100603_conversation_report_evidence'));
  assert.equal(validateDisclosure(alice,payload({peer:'مريم',subject:{type:'user',id:'مريم'}})).subject.id,'مريم');
});
test('real SQL: report subjects are selected canonical peer evidence, never arbitrary targets',async()=>{
  const f=await fixture();try {
    for(const subject of [{type:'user',id:'mallory'},{type:'conversation',id:'g-unrelated'},
      {type:'message',id:'unselected'},{type:'media',id:'m1'},{type:'unknown',id:'m1'},
      {type:'message',id:'m1',privateKey:'SECRET'}])
      assert.throws(()=>validateDisclosure(alice,payload({subject})),{status:400});
    await assert.rejects(f.store.submitConversationReport(alice,payload({subject:{type:'message',id:'own'},
      selection:[{id:'own',kind:'text',text:'my message'},{id:'m1',kind:'text',text:'incoming'}]})),{status:403});
    for(const subject of [{type:'user',id:'bob'},{type:'conversation',id:'bob'},{type:'message',id:'m1'},{type:'media',id:'media1'}]) {
      await f.db.exec('DELETE FROM open_report_claims');
      const p=payload({subject,selection:subject.type==='media'?[{id:'media1',kind:'media',text:'File not shared'}]:[{id:'m1',kind:'text',text:'selected'}]});
      const submitted=await f.store.submitConversationReport(alice,p);
      const result=await f.store.readConversationReportEvidence(mod,{owner:'mod',sessionId:'sm',reportId:submitted.id,reason:'Inspect selected evidence'});
      assert.deepEqual(result.subject,subject);assert.equal(result.filesShared,false);
      await f.db.query("UPDATE reports SET status='closed' WHERE id=$1",[submitted.id]);
      assert.equal((await f.store.submitConversationReport(alice,p)).replayed,true);
      assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM conversation_report_evidence WHERE report_id=$1',[submitted.id])).rows[0].n,1);
    }
  }finally{await f.db.close();}
});
test('real SQL: selected plaintext is stored separately, retry is idempotent and only moderator reads are audited',async()=>{
  const f=await fixture();try{
    const p=payload({selection:[{id:'m1',kind:'text',text:'Claimed text, not verified by ciphertext'},
      {id:'e1',kind:'text',text:'Decrypted selected message'},
      {id:'media1',kind:'media',text:'Encrypted attachment (file not shared)'}]});
    const result=await f.store.submitConversationReport(alice,p);
    assert.equal(result.ok,true);assert.equal(result.replayed,false);
    assert.deepEqual(await f.store.submitConversationReport(alice,p),{...result,replayed:true});
    assert.equal(await f.count('reports'),1);assert.equal(await f.count('conversation_report_evidence'),1);
    await assert.rejects(f.store.submitConversationReport(alice,{...p,description:'changed'}),{status:409});
    await assert.rejects(f.store.submitConversationReport(alice,payload()),{status:409});
    assert.equal(await f.count('reports'),1);
    assert.deepEqual(await f.store.readConversationReportFlags(mod),[result.id]);
    assert.equal(await f.count('conversation_report_evidence_reads'),0);
    const read={owner:'mod',sessionId:'sm',reportId:result.id,reason:'Investigate selected harassment'};
    await assert.rejects(f.store.readConversationReportEvidence(alice,{...read,owner:'alice',sessionId:'sa'}),{status:403});
    await assert.rejects(f.store.readConversationReportEvidence(mod,{...read,reason:'  '}),{status:400});
    await assert.rejects(f.store.readConversationReportEvidence(mod,{...read,reportId:'unknown'}),{status:404});
    assert.equal(await f.count('conversation_report_evidence_reads'),0);
    const evidence=await f.store.readConversationReportEvidence(mod,read);
    assert.equal(evidence.filesShared,false);assert.equal(evidence.plaintextVerified,false);
    assert.deepEqual(evidence.selection.map(row=>row.id),['m1','e1','media1']);
    assert.ok(evidence.selection.every(row=>row.sender==='bob'&&row.receiver==='alice'&&row.plaintextVerified===false));
    assert.equal(evidence.selection[1].ciphertextHash,'ciphertext-hash');
    assert.equal(evidence.selection[2].mediaPresent,true);
    const wire=JSON.stringify(evidence);
    for(const forbidden of ['unselected','attachment1','sender_device','recoveryKey','privateKey'])assert.equal(wire.includes(forbidden),false);
    const audit=(await f.db.query('SELECT reviewer_id,reviewer_role,reason FROM conversation_report_evidence_reads')).rows;
    assert.deepEqual(audit,[{reviewer_id:'mod',reviewer_role:'moderator',reason:read.reason}]);
    await f.db.exec("UPDATE users SET role='buyer' WHERE username='mod'");
    await assert.rejects(f.store.readConversationReportEvidence(mod,read),{status:403});
    await assert.rejects(f.store.readConversationReportFlags(mod),{status:403});
    assert.equal(await f.count('conversation_report_evidence_reads'),1);
    await f.db.exec("DELETE FROM open_report_claims; UPDATE reports SET status='closed'");
    assert.deepEqual(await f.store.submitConversationReport(alice,p),{...result,replayed:true});
    assert.notEqual((await f.store.submitConversationReport(alice,payload())).id,result.id);
  }finally{await f.db.close();}
});
test('real SQL: other chats, sender-only selections, ambiguous IDs and unbacked media cannot create reports',async()=>{
  const f=await fixture();try{
    for(const [id,status,kind]of [['outsider',403,'text'],['unknown',403,'text'],['own',403,'text'],['m1',400,'media']]){
      await assert.rejects(f.store.submitConversationReport(alice,payload({selection:[{id,kind,text:'claim'}]})),{status});
      assert.equal(await f.count('reports'),0);assert.equal(await f.count('open_report_claims'),0);
    }
    await assert.rejects(f.store.submitConversationReport(alice,payload({peer:'mallory'})),{status:403});
    await f.db.exec("INSERT INTO messages VALUES('e1','bob','alice','2026-10-06')");
    await assert.rejects(f.store.submitConversationReport(alice,payload({selection:[{id:'e1',kind:'text',text:'claim'}]})),{status:409});
    assert.equal(await f.count('conversation_report_evidence'),0);
  }finally{await f.db.close();}
});
test('real SQL: expired or revoked sessions and disabled users cannot disclose or open evidence',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.store.submitConversationReport({...alice,token:'wrong'},payload()),{status:401});
    await f.db.exec("UPDATE sessions SET expires_at=1 WHERE username='alice'");
    await assert.rejects(f.store.submitConversationReport(alice,payload()),{status:401});
    await f.db.exec("UPDATE sessions SET expires_at=9999999999999; UPDATE users SET status='disabled' WHERE username='alice'");
    await assert.rejects(f.store.submitConversationReport(alice,payload()),{status:401});
    await f.db.exec("DELETE FROM sessions WHERE username='mod'");
    await assert.rejects(f.store.readConversationReportFlags(mod),{status:401});
    assert.equal(await f.count('reports'),0);
  }finally{await f.db.close();}
});
test('real SQL: submission rolls back claims and metadata when evidence insertion fails',async()=>{
  const f=await fixture();try{
    await f.db.exec("ALTER TABLE conversation_report_evidence ADD CONSTRAINT reject_fixture CHECK(selection='[]'::jsonb)");
    await assert.rejects(f.store.submitConversationReport(alice,payload()));
    assert.equal(await f.count('reports'),0);assert.equal(await f.count('open_report_claims'),0);
  }finally{await f.db.close();}
});
test('real SQL: same request UUID is owner-bound and blocked historical chats remain reportable',async()=>{
  const f=await fixture();try{
    await f.db.exec("CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT); INSERT INTO user_blocks VALUES('alice','bob')");
    const p=payload();
    const first=await f.store.submitConversationReport(alice,p);
    const second=await f.store.submitConversationReport({owner:'bob',token:'tb',deviceId:'sb'},
      {...p,owner:'bob',sessionId:'sb',peer:'alice',selection:[{id:'own',kind:'text',text:'Incoming evidence'}]});
    assert.notEqual(first.id,second.id);assert.equal(await f.count('reports'),2);
  }finally{await f.db.close();}
});
test('report API adapter uses explicit authenticated JSON POST paths without putting evidence in URLs',async()=>{
  const window={},calls=[];
  vm.runInNewContext(fs.readFileSync('src/api/admin-client.js','utf8'),{window,URLSearchParams});
  const client=window.WingaModules.api.admin.createAdminApiClient({baseUrl:'/api',
    createAuthHeaders:()=>({'X-CSRF-Token':'synthetic-csrf'}),
    fetchJson:async(url,options)=>{calls.push({url,...options});return {ok:true};}});
  const p=payload();
  await client.createConversationReport(p);
  await client.readSharedReportEvidence({owner:'mod',sessionId:'sm',reportId:'report1',reason:'Review reason'});
  assert.deepEqual(calls.map(row=>row.url),['/api/messages/reports','/api/admin/reports/evidence']);
  for(const call of calls){assert.equal(call.method,'POST');assert.equal(call.headers['Content-Type'],'application/json');
    assert.equal(call.headers['X-CSRF-Token'],'synthetic-csrf');assert.equal(call.url.includes('Reported text'),false);}
  assert.deepEqual(JSON.parse(calls[0].body),p);
});
