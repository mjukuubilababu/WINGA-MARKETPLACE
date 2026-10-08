const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {validateExperience,createConversationExperienceStore}=require('../backend/conversation-experience-store');
const snapshot=()=>({version:1,runId:randomUUID(),buckets:[{name:'send-confirmed',hour:new Date(Math.floor(Date.now()/3600000)*3600000).toISOString(),count:1,totalDurationMs:20,maxDurationMs:20}]});
test('client experience accepts only fixed aggregate dimensions and rejects content or unbounded values',()=>{
  validateExperience(snapshot());
  for(const change of [row=>row.secret='PRIVATE',row=>row.buckets[0].name='PRIVATE USER',row=>row.buckets[0].count=1e10,
    row=>row.buckets[0].hour='invalid',row=>row.buckets.push({...row.buckets[0]})]){
    const value=snapshot();change(value);assert.throws(()=>validateExperience(value),{code:'conversation_experience_invalid'});
  }
});
test('SQL client publication is retry idempotent, session-bound, rate-limited and prunes only aggregates',async t=>{
  const db=await (await import('./helpers/shopping-room-database.mjs')).roomDatabase(t);
  await db.exec(require('./helpers/conversation-event-fixture'));
  for(const sql of require('../backend/migrations/conversation-experience-metrics').statements)await db.exec(sql);
  const store=createConversationExperienceStore({withTransaction:work=>db.transaction(work)}),value=snapshot();
  const context={owner:'alice',token:'a',deviceId:'a'};
  await store.publishConversationExperience(context,value);
  await db.query(`INSERT INTO conversation_experience_metrics(run_id,hour,name,count,total_duration_ms,max_duration_ms)
    VALUES($1,NOW()-INTERVAL '10 days','open-shell',1,1,1)`,[value.runId]);
  await store.publishConversationExperience(context,value);await store.publishConversationExperience(context,value);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM conversation_experience_metrics WHERE hour<NOW()-INTERVAL '7 days'")).rows[0].n,0);
  value.buckets[0].count=2;value.buckets[0].totalDurationMs=40;await store.publishConversationExperience(context,value);
  assert.equal((await db.query('SELECT SUM(count)::int AS n FROM conversation_experience_metrics')).rows[0].n,2);
  await assert.rejects(store.publishConversationExperience({owner:'bob',token:'b1',deviceId:'b1'},value),{code:'conversation_experience_scope_conflict'});
  await assert.rejects(store.publishConversationExperience({...context,token:'invalid'},snapshot()),{code:'conversation_experience_unauthorized'});
  for(let i=0;i<6;i++)await store.publishConversationExperience(context,value);
  await assert.rejects(store.publishConversationExperience(context,value),{code:'conversation_experience_limited'});
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n,1);
});
