const test=require('node:test'),assert=require('node:assert/strict');
const compatibility=require('../backend/legacy-conversation-compatibility');
const ledger=require('../backend/migrations/conversation-event-ledger');
test('fresh legacy import retains malformed and obsolete history, imports compatible rows once, and keeps write guards',async t=>{
  const db=await (await import('./helpers/shopping-room-database.mjs')).roomDatabase(t);
  await db.exec(require('./helpers/conversation-event-fixture'));
  await db.exec(`INSERT INTO messages(id,sender_id,receiver_id) VALUES
    ('self','alice','alice'),('missing',NULL,'bob'),('empty','','bob'),('obsolete','gone','bob')`);
  const classified=await compatibility.classifyLegacyConversationHistory(db);
  assert.deepEqual(classified,{privacy:'aggregate-only',total:5,incomplete:2,selfAddressed:1,compatible:1,retainedOutsideLedger:4});
  const originals=(await db.query('SELECT * FROM messages ORDER BY id')).rows;
  await db.transaction(async client=>{for(const sql of ledger.statements)
    await client.query(sql===compatibility.originalBackfill?compatibility.compatibilityBackfill:sql);});
  assert.deepEqual((await db.query('SELECT * FROM messages ORDER BY id')).rows,originals);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM conversation_message_state')).rows[0].n,1);
  await db.exec(compatibility.compatibilityBackfill);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM conversation_events WHERE kind='message_imported'")).rows[0].n,1);
  await assert.rejects(db.query("INSERT INTO messages(id,sender_id,receiver_id) VALUES('invalid-new','alice','alice')"),/two participants/);
});
test('migration runner rolls back an incomplete import, retries safely, and bypasses an already applied ledger',async t=>{
  const db=await (await import('./helpers/shopping-room-database.mjs')).roomDatabase(t);
  await db.exec(require('./helpers/conversation-event-fixture'));
  await db.exec("INSERT INTO messages(id,sender_id,receiver_id) VALUES('retained-self','alice','alice')");
  const originals=(await db.query('SELECT * FROM messages ORDER BY id')).rows;
  const {MIGRATIONS,runSchemaMigrations}=require('../backend/migrations');
  await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT NOW())');
  for(const migration of MIGRATIONS)if(migration.id!==ledger.id)await db.query('INSERT INTO schema_migrations(migration_id) VALUES($1)',[migration.id]);
  let reject=true,checks=0;
  const wrap=client=>({query:async(sql,args)=>{
    if(sql.includes('AS missing FROM messages entry')){checks++;if(reject)throw Error('injected completeness failure');}
    return client.query(sql,args);},release:()=>client.release?.()});
  const pool=db.pool?{query:db.query,connect:async()=>wrap(await db.pool.connect())}:wrap(db),logs=[];
  await assert.rejects(runSchemaMigrations({pool,logger:{info:(...v)=>logs.push(v)}}),/injected completeness failure/);
  assert.equal((await db.query("SELECT to_regclass('conversation_message_state') AS name")).rows[0].name,null);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM schema_migrations WHERE migration_id=$1',[ledger.id])).rows[0].n,0);
  assert.deepEqual((await db.query('SELECT * FROM messages ORDER BY id')).rows,originals);
  reject=false;
  const first=await runSchemaMigrations({pool,logger:{info:(...v)=>logs.push(v)}});assert.deepEqual(first.applied,[ledger.id]);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM conversation_message_state')).rows[0].n,1);
  const second=await runSchemaMigrations({pool,logger:{info(){}}});assert.deepEqual(second.applied,[]);assert.equal(checks,2);
  assert.deepEqual((await db.query('SELECT * FROM messages ORDER BY id')).rows,originals);
  assert.ok(logs.some(v=>v[1]?.retainedOutsideLedger===1));
});
