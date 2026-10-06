const test = require('node:test');
const assert = require('node:assert/strict');
const { createECDH, randomBytes } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { createMessageWebPushStore, enqueueMessagePush, validateSubscription } = require('../backend/message-web-push');
const migration = {statements:[...require('../backend/migrations/message-web-push').statements,...require('../backend/migrations/conversation-notification-preferences').statements,...require('../backend/migrations/conversation-archive-preferences').statements]};
const fs = require('node:fs');
const vm = require('node:vm');

function subscription(endpoint = 'https://fcm.googleapis.com/fcm/send/test') {
  const ec = createECDH('prime256v1'); ec.generateKeys();
  return { endpoint, keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}
test('push endpoints reject SSRF, userinfo, fragments, bad keys and lookalike providers', () => {
  const good = subscription();
  assert.deepEqual(validateSubscription(good), good);
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/', 'https://fcm.googleapis.com.attacker.test/x',
    'https://fcm.googleapis.com:444/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com/x#secret']) {
    assert.throws(() => validateSubscription({ ...good, endpoint }), { status: 400 });
  }
  assert.throws(() => validateSubscription({ ...good, keys: { ...good.keys, p256dh: randomBytes(65).toString('base64url') } }));
  assert.throws(() => validateSubscription({ ...good, keys: { ...good.keys, auth: 'bad' } }));
});

test('real SQL: push is durable, private, session-bound, retryable and does not acknowledge messages', async () => {
  const db = new PGlite();
  const sent = [];
  let failure = null;
  const provider = {
    generateVAPIDKeys: () => ({ publicKey: 'public-test', privateKey: 'private-test' }),
    async sendNotification(sub, body, options) { if (failure) throw failure; sent.push({ sub, body: JSON.parse(body), options }); }
  };
  const transaction = work => db.transaction(tx => work({ query: (sql, params) =>
    sql.includes('pg_advisory_xact_lock') ? { rows: [] } : tx.query(sql, params) }));
  const store = createMessageWebPushStore({ query: db.query.bind(db), withTransaction: transaction, provider });
  const context = { owner: 'bob', token: 'd1', sessionId: 'd1' };
  const sub = subscription();
  const enqueue = id => transaction(client => enqueueMessagePush(client, { id, receiverId: 'bob' }));
  const rows = async table => (await db.query(`SELECT * FROM ${table}`)).rows;
  try {
    await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active');
      INSERT INTO users(username) VALUES('alice'),('bob'),('mallory');
      CREATE TABLE sessions(token TEXT,username TEXT,session_id TEXT,expires_at BIGINT);
      INSERT INTO sessions VALUES('d1','bob','d1',9999999999999),('d2','bob','d2',9999999999999),('d3','mallory','d3',9999999999999);
      CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,is_read BOOLEAN DEFAULT FALSE,is_delivered BOOLEAN DEFAULT FALSE);
      INSERT INTO messages(id,sender_id,receiver_id) VALUES('m1','alice','bob'),('m2','alice','bob'),('m3','alice','bob');
      CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);`);
    for (let i=0;i<2;i++) for (const sql of migration.statements) await db.exec(sql);
    assert.deepEqual(await store.readWebPushConfig(), { supported: true, publicKey: 'public-test' });
    const restarted = createMessageWebPushStore({ query: db.query.bind(db), withTransaction: transaction, provider: { generateVAPIDKeys() { throw Error('must reuse'); } } });
    assert.deepEqual(await restarted.readWebPushConfig(), await store.readWebPushConfig());
    await store.saveWebPush({ ...context, payload: { subscription: sub, locale: 'sw' } });
    await assert.rejects(store.saveWebPush({ owner: 'mallory', token: 'd3', sessionId: 'd3', payload: { subscription: sub } }), { status: 409 });
    await assert.rejects(store.saveWebPush({ ...context, token: 'wrong', payload: { subscription: sub } }), { status: 401 });
    await assert.rejects(transaction(async client => { await enqueueMessagePush(client, { id: 'rollback', receiverId: 'bob' }); throw Error('rollback'); }));
    assert.equal((await rows('web_push_jobs')).length, 0);
    await enqueue('m1'); await enqueue('m1');
    assert.equal((await rows('web_push_jobs')).length, 1);
    const id = (await rows('web_push_jobs'))[0].id;
    await assert.rejects(store.resolveWebPush({ owner: 'mallory', token: 'd3', sessionId: 'd3', id }), { status: 404 });
    await assert.rejects(store.resolveWebPush({ ...context, token: 'd2', sessionId: 'd2', id }), { status: 404 });
    assert.deepEqual(await store.resolveWebPush({ ...context, id }), { withUser: 'alice' });
    await db.exec("UPDATE web_push_jobs SET lease_until=NOW()+INTERVAL '5 minutes'");
    await store.dispatchWebPushBatch(); assert.equal(sent.length, 0);
    await db.exec('UPDATE web_push_jobs SET lease_until=NULL');
    failure = { statusCode: 503 };
    await store.dispatchWebPushBatch();
    assert.equal((await rows('web_push_jobs'))[0].completed_at, null);
    assert.equal((await rows('web_push_jobs'))[0].attempts, 1);
    failure = null;
    await db.exec('UPDATE web_push_jobs SET next_attempt_at=NOW()');
    await store.dispatchWebPushBatch(); await store.dispatchWebPushBatch();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, { version: 1, id, locale: 'sw',group:sent[0].options.topic });
    assert.match(sent[0].options.topic,/^[A-Za-z0-9_-]{32}$/);
    assert.equal(sent[0].options.TTL, 86400);
    assert.equal(sent[0].options.urgency, 'high');
    assert.equal((await rows('messages'))[0].is_delivered, false);
    await enqueue('m2');
    await db.exec("INSERT INTO user_blocks VALUES('bob','alice')");
    await assert.rejects(store.resolveWebPush({ ...context, id }), { status: 404 });
    await store.dispatchWebPushBatch(); assert.equal(sent.length, 1);
    await db.exec('DELETE FROM user_blocks');
    await enqueue('m3'); failure = { statusCode: 410 };
    await store.dispatchWebPushBatch();
    assert.equal((await rows('web_push_subscriptions')).length, 0);
    assert.equal((await rows('web_push_jobs')).length, 0);
    failure = null;
    await store.saveWebPush({ ...context, payload: { subscription: sub } });
    await enqueue('m1');
    await db.exec("DELETE FROM sessions WHERE session_id='d1'");
    await store.dispatchWebPushBatch(); assert.equal(sent.length, 1);
    assert.equal((await rows('web_push_subscriptions')).length, 0);
  } finally { await db.close(); }
});

test('push retries are bounded and distinguish permanent payload errors from transient provider failures',async()=>{
  const db=new PGlite();let failure;
  const provider={generateVAPIDKeys:()=>({publicKey:'public-test',privateKey:'private-test'}),
    async sendNotification(){throw failure;}};
  const transaction=work=>db.transaction(tx=>work({query:(sql,params)=>
    sql.includes('pg_advisory_xact_lock')?{rows:[]}:tx.query(sql,params)}));
  const store=createMessageWebPushStore({query:db.query.bind(db),withTransaction:transaction,provider});
  try {
    await db.exec("CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active'); INSERT INTO users VALUES('alice','active'),('bob','active'); CREATE TABLE sessions(token TEXT,username TEXT,session_id TEXT,expires_at BIGINT); INSERT INTO sessions VALUES('d1','bob','d1',9999999999999); CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,is_read BOOLEAN DEFAULT FALSE,is_delivered BOOLEAN DEFAULT FALSE); CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);");
    for(const sql of migration.statements)await db.exec(sql);
    await store.saveWebPush({owner:'bob',token:'d1',sessionId:'d1',payload:{subscription:subscription()}});
    for(const [index,[error,retry,attempts]] of [
      [{statusCode:400},false,0],[{statusCode:413},false,0],[{status:400},false,0],
      [{statusCode:408},true,0],[{statusCode:429},true,0],[{statusCode:503},true,0],
      [{statusCode:401},true,0],[{statusCode:403},true,0],[{},true,0],[{},false,7]
    ].entries()) {
      const id='push-case-'+index;failure={...error,body:'PRIVATE PROVIDER BODY',message:'SECRET ERROR'};
      await db.query("INSERT INTO messages(id,sender_id,receiver_id) VALUES($1,'alice','bob')",[id]);
      await transaction(client=>enqueueMessagePush(client,{id,receiverId:'bob'}));
      await db.query("UPDATE web_push_jobs SET attempts=$2 WHERE message_id=$1",[id,attempts]);
      const result=await store.dispatchWebPushBatch();
      const job=(await db.query('SELECT * FROM web_push_jobs WHERE message_id=$1',[id])).rows[0];
      assert.equal(job.completed_at===null,retry);
      assert.equal(result.retrying,retry?1:0);assert.equal(result.rejected,retry?0:1);
      assert.equal(result.accepted,0);
      assert.equal(JSON.stringify(result).includes('SECRET'),false);
      assert.equal((await db.query('SELECT is_delivered FROM messages WHERE id=$1',[id])).rows[0].is_delivered,false);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM web_push_subscriptions')).rows[0].n,1);
      await db.query('DELETE FROM web_push_jobs WHERE message_id=$1',[id]);
    }
  }finally{await db.close();}
});

function workerHarness() {
  const handlers = {}, shown = [], opened = [], messages = [];
  let clients = [];
  const self = { addEventListener: (type, callback) => { handlers[type] = callback; }, location: { origin: 'https://wingamarket.com' },
    registration: { showNotification: async (title, options) => shown.push({ title, ...options }) },
    clients: { matchAll: async () => clients, openWindow: async url => opened.push(url) } };
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'), { self, URL });
  return { shown, opened, messages, setClients(value) { clients = value; },
    async fire(type, extra) { let pending; handlers[type]({ ...extra, waitUntil: promise => { pending = promise; } }); await pending; } };
}

test('account-level mute is session-bound, revisioned and suppresses alerts without changing delivery',async()=>{
  const db=new PGlite(),sent=[];
  const transaction=work=>db.transaction(tx=>work({query:(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:tx.query(sql,params)}));
  const store=createMessageWebPushStore({query:db.query.bind(db),withTransaction:transaction,
    provider:{generateVAPIDKeys:()=>({publicKey:'public',privateKey:'private'}),async sendNotification(sub){sent.push(sub.endpoint);}}});
  const context={owner:'bob',token:'d1',sessionId:'d1'},otherDevice={owner:'bob',token:'d2',sessionId:'d2'};
  const payload=(ctx=context,more={})=>({owner:ctx.owner,sessionId:ctx.sessionId,peer:'alice',...more});
  const enqueue=id=>transaction(client=>enqueueMessagePush(client,{id,senderId:'alice',receiverId:'bob'}));
  try {
    await db.exec("CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active'); INSERT INTO users VALUES('alice','active'),('bob','active'),('mallory','active'); CREATE TABLE sessions(token TEXT,username TEXT,session_id TEXT,expires_at BIGINT); INSERT INTO sessions VALUES('d1','bob','d1',9999999999999),('d2','bob','d2',9999999999999),('d3','mallory','d3',9999999999999); CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,is_read BOOLEAN DEFAULT FALSE,is_delivered BOOLEAN DEFAULT FALSE); INSERT INTO messages(id,sender_id,receiver_id) VALUES('m1','alice','bob'),('m2','alice','bob'),('m3','alice','bob'); CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);");
    for(let n=0;n<2;n++)for(const sql of migration.statements)await db.exec(sql);
    await store.saveWebPush({...context,payload:{subscription:subscription()}});
    await store.saveWebPush({...otherDevice,payload:{subscription:subscription('https://fcm.googleapis.com/fcm/send/second')}});
    assert.deepEqual(await store.readConversationMute({...context,payload:payload()}),{revision:'0',muted:false});
    await enqueue('m1');
    const muted=await store.saveConversationMute({...context,payload:payload(context,{revision:'0',muted:true})});
    assert.deepEqual(muted,{revision:'1',muted:true});
    assert.deepEqual(await store.readConversationMute({...otherDevice,payload:payload(otherDevice)}),muted);
    await store.dispatchWebPushBatch();assert.equal(sent.length,0);
    await enqueue('m2');assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM web_push_jobs WHERE message_id='m2'")).rows[0].n,0);
    await assert.rejects(store.saveConversationMute({...otherDevice,payload:payload(otherDevice,{revision:'0',muted:false})}),{status:409});
    for(const change of [{owner:'mallory'},{sessionId:'d2'},{peer:'bob'},{peer:' alice'},{duration:'1h'},{muted:'false'}])
      await assert.rejects(store.saveConversationMute({...context,payload:payload(context,{revision:'1',muted:false,...change})}),{status:400});
    await assert.rejects(store.saveConversationMute({...context,token:'wrong',payload:payload(context,{revision:'1',muted:false})}),{status:401});
    await assert.rejects(store.saveConversationMute({...context,payload:payload(context,{peer:'unknown',revision:'0',muted:true})}),{status:404});
    const mallory={owner:'mallory',sessionId:'d3',token:'d3'};
    assert.equal((await store.readConversationMute({...mallory,payload:payload(mallory)})).muted,false);
    await db.exec("UPDATE conversation_notification_preferences SET updated_at=NOW()-INTERVAL '1 year'");
    assert.equal((await store.readConversationMute({...otherDevice,payload:payload(otherDevice)})).muted,true);
    const state=await store.saveConversationMute({...otherDevice,payload:payload(otherDevice,{revision:muted.revision,muted:false})});
    assert.equal(state.muted,false);
    await enqueue('m3');await store.dispatchWebPushBatch();
    assert.equal(sent.length,2);
    const messages=(await db.query('SELECT * FROM messages')).rows;
    assert.ok(messages.every(message=>!message.is_read&&!message.is_delivered));
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM web_push_subscriptions')).rows[0].n,2);
  }finally{await db.close();}
});
test('archive persists across devices, preserves mute and history, and new messages do not unarchive',async()=>{
  const db=new PGlite(),sent=[];
  const transaction=work=>db.transaction(tx=>work({query:(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:tx.query(sql,params)}));
  const store=createMessageWebPushStore({query:db.query.bind(db),withTransaction:transaction,
    provider:{generateVAPIDKeys:()=>({publicKey:'public',privateKey:'private'}),async sendNotification(){sent.push(true);}}});
  const context={owner:'bob',token:'d1',sessionId:'d1'},second={owner:'bob',token:'d2',sessionId:'d2'},other={owner:'mallory',token:'d3',sessionId:'d3'};
  const payload=(ctx=context,more={})=>({owner:ctx.owner,sessionId:ctx.sessionId,peer:'alice',...more});
  const list=ctx=>store.readConversationArchives({...ctx,payload:{owner:ctx.owner,sessionId:ctx.sessionId}});
  try {
    await db.exec("CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active'); INSERT INTO users VALUES('alice','active'),('bob','active'),('mallory','active'); CREATE TABLE sessions(token TEXT,username TEXT,session_id TEXT,expires_at BIGINT); INSERT INTO sessions VALUES('d1','bob','d1',9999999999999),('d2','bob','d2',9999999999999),('d3','mallory','d3',9999999999999); CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,is_read BOOLEAN DEFAULT FALSE,is_delivered BOOLEAN DEFAULT FALSE); INSERT INTO messages(id,sender_id,receiver_id) VALUES('old','alice','bob'); CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);");
    for(let i=0;i<2;i++)for(const sql of migration.statements)await db.exec(sql);
    await store.saveWebPush({...context,payload:{subscription:subscription()}});
    assert.deepEqual(await store.readConversationArchive({...context,payload:payload()}),{revision:'0',archived:false});
    const saved=await store.saveConversationArchive({...context,payload:payload(context,{revision:'0',archived:true})});
    assert.deepEqual(saved,{revision:'1',archived:true});
    assert.deepEqual(await list(second),{peers:['alice']});assert.deepEqual(await list(other),{peers:[]});
    await assert.rejects(store.saveConversationArchive({...second,payload:payload(second,{revision:'0',archived:false})}),{status:409});
    for(const change of [{owner:'mallory'},{sessionId:'d2'},{peer:'bob'},{peer:' alice'},{archived:'true'},{extra:true}])
      await assert.rejects(store.saveConversationArchive({...context,payload:payload(context,{revision:'1',archived:false,...change})}),{status:400});
    await assert.rejects(list({...context,token:'bad'}),{status:401});
    await assert.rejects(store.readConversationArchives({...context,payload:{owner:'mallory',sessionId:'d1'}}),{status:400});
    await db.exec("INSERT INTO messages(id,sender_id,receiver_id) VALUES('new','alice','bob')");
    await transaction(client=>enqueueMessagePush(client,{id:'new',senderId:'alice',receiverId:'bob'}));
    await store.dispatchWebPushBatch();assert.equal(sent.length,1);assert.deepEqual(await list(second),{peers:['alice']});
    assert.ok((await db.query('SELECT * FROM messages')).rows.every(row=>!row.is_read&&!row.is_delivered));
    await store.saveConversationMute({...context,payload:payload(context,{revision:'1',muted:true})});
    assert.deepEqual(await store.readConversationArchive({...second,payload:payload(second)}),{revision:'2',archived:true});
    await store.saveConversationArchive({...second,payload:payload(second,{revision:'2',archived:false})});
    assert.deepEqual(await list(context),{peers:[]});
    assert.deepEqual(await store.readConversationMute({...context,payload:payload()}),{revision:'3',muted:true});
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n,2);
    await db.exec("UPDATE sessions SET expires_at=0 WHERE session_id='d2'");
    await assert.rejects(list(second),{status:401});
    await db.exec("UPDATE users SET status='disabled' WHERE username='bob'");
    await assert.rejects(list(context),{status:401});
  }finally{await db.close();}
});

test('build cache cleanup preserves canonical push registration but explicit recovery can remove it', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const cleanup = source.slice(source.indexOf('async function purgeStaleBrowserCacheArtifacts('), source.indexOf('function hasCompletedServiceWorkerFirstRun('));
  const bootstrap = source.slice(source.indexOf('function initializeBootstrapStorageVersion('), source.indexOf('function getSellerHistoryStorageKey('));
  const removed = [], caches = [];
  const registrations = [
    { scope: 'https://wingamarket.com/', active: { scriptURL: 'https://wingamarket.com/sw.js?v=old' }, unregister: () => removed.push('canonical') },
    { scope: 'https://wingamarket.com/old/', active: { scriptURL: 'https://wingamarket.com/old-worker.js' }, unregister: () => removed.push('obsolete') }
  ];
  const context = { URL, APP_SERVICE_WORKER_PATH: '/sw.js', APP_BOOT_BUILD_VERSION: 'new',
    getStoredAppStorageSchemaVersion: () => 'old', clearStaleAppBootstrapState() {}, saveAppStorageSchemaVersion() {},
    navigator: { onLine: true }, window: { location: { origin: 'https://wingamarket.com' },
      navigator: { serviceWorker: { getRegistrations: async () => registrations } },
      caches: { keys: async () => ['stale-assets'], delete: async key => caches.push(key) } } };
  vm.createContext(context);
  vm.runInContext(cleanup + bootstrap, context);
  await context.initializeBootstrapStorageVersion();
  assert.deepEqual(removed, ['obsolete']);
  assert.deepEqual(caches, ['stale-assets']);
  removed.length = 0;
  await context.purgeStaleBrowserCacheArtifacts();
  assert.deepEqual(removed, ['canonical', 'obsolete']);
});

test('closed-app push only displays fixed private copy; click opens fixed same-origin route', async () => {
  const worker = workerHarness();
  const id = '11111111-1111-4111-8111-111111111111';
  await worker.fire('push', { data: { json: () => ({ id, locale: 'sw', title: 'Alice', body: 'SECRET', url: 'https://attacker.test' }) } });
  assert.equal(worker.shown[0].title, 'Winga'); assert.equal(worker.shown[0].body, 'Una ujumbe mpya.');
  assert.equal(JSON.stringify(worker.shown).includes('SECRET'), false);
  await worker.fire('notificationclick', { notification: { data: { id }, close() {} } });
  assert.deepEqual(worker.opened, [`/#winga-push=${id}`]);
  worker.setClients([{ url: 'https://wingamarket.com/', async focus() {}, postMessage: message => worker.messages.push(message) }]);
  await worker.fire('notificationclick', { notification: { data: { id }, close() {} } });
  assert.equal(worker.messages[0].id, id); assert.equal(worker.opened.length, 1);
  worker.setClients([]);
  await worker.fire('notificationclick', { notification: { data: { id: 'https://attacker.test' }, close() {} } });
  assert.equal(worker.opened[1], '/');
});
test('worker groups opaque conversation alerts, retains current navigation, and ignores arbitrary grouping values',async()=>{
  const worker=workerHarness(),group='a'.repeat(32),id='11111111-1111-4111-8111-111111111111';
  await worker.fire('push',{data:{json:()=>({id,group,locale:'en',body:'PRIVATE'})}});
  assert.equal(worker.shown[0].tag,'winga-conversation-'+group);
  assert.deepEqual(JSON.parse(JSON.stringify(worker.shown[0].data)),{id});
  await worker.fire('push',{data:{json:()=>({id,group:'PRIVATE-USERNAME',locale:'en'})}});
  assert.equal(worker.shown[1].tag,'winga-push-'+id);
  assert.equal(JSON.stringify(worker.shown).includes('PRIVATE'),false);
});
