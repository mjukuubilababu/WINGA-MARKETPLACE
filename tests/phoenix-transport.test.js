const test = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes, randomUUID} = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFile} = require('node:child_process');
const {once} = require('node:events');
const {setTimeout:delay} = require('node:timers/promises');
const {Client, Pool} = require('pg');
const {createPostgresStore} = require('../backend/db');

const target = new URL(process.env.WINGA_TEST_POSTGRES_URL || 'http://invalid');
if (!['postgres:','postgresql:'].includes(target.protocol)
  || !['127.0.0.1','localhost','[::1]'].includes(target.hostname) || target.search || target.hash) {
  throw new Error('WINGA_TEST_POSTGRES_URL must point to a disposable localhost PostgreSQL cluster.');
}
const root=path.resolve(__dirname,'..');
async function freePort() {
  const server=net.createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port=server.address().port; await new Promise(resolve=>server.close(resolve)); return port;
}
async function ready(url, child) {
  for(let n=0;n<200;n++) {
    if(child.exitCode!==null)throw new Error('Fixture process exited before readiness');
    try{if((await fetch(url,{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
    await delay(100);
  }
  throw new Error('Fixture readiness timed out');
}
async function stop(child) {
  if(!child || child.exitCode!==null)return;
  if(process.platform==='win32') await new Promise(resolve=>execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>resolve()));
  else child.kill('SIGTERM');
  if(child.exitCode===null)await Promise.race([once(child,'exit'),delay(5000)]);
}
async function connect(port,ticket) {
  const ws=new WebSocket(`ws://127.0.0.1:${port}/socket/websocket?vsn=2.0.0`);
  const frames=[];
  ws.addEventListener('message',event=>frames.push(JSON.parse(event.data)));
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(new Error('WebSocket failed')),{once:true});});
  let sequence=0;
  async function wait(predicate,timeout=15000) {
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){const index=frames.findIndex(predicate);if(index>=0)return frames.splice(index,1)[0];await delay(20);}
    throw new Error('Expected Phoenix frame did not arrive');
  }
  async function command(event,payload) {
    const ref=String(++sequence);ws.send(JSON.stringify(['1',ref,'device',event,payload]));
    return (await wait(frame=>frame[1]===ref && frame[3]==='phx_reply'))[4];
  }
  const joined=await command('phx_join',{ticket});
  assert.equal(joined.status,'ok');
  return {ws,command,wait};
}

test('real Phoenix nodes preserve canonical sends and device replay through lost replies and node loss', {timeout:180000}, async t=>{
  const database='winga_transport_test_'+randomBytes(8).toString('hex');
  const admin=new Client({connectionString:target.toString()});await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const local=new URL(target);local.pathname='/'+database;
  const pool=new Pool({connectionString:local.toString(),max:8});
  const children=[],sockets=[];
  let proxy;
  t.after(async()=>{
    for(const socket of sockets)socket.ws.close();
    for(const child of children.reverse())await stop(child);
    if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
    await pool.end();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);await admin.end();
  });
  const store=createPostgresStore({queryClient:pool});await store.init();
  const tokens={alice:randomBytes(24).toString('hex'),bob:randomBytes(24).toString('hex'),bob2:randomBytes(24).toString('hex')};
  await pool.query(`INSERT INTO users(username,password,phone_number,primary_category,role,created_at)
    VALUES('alice','no-login','synthetic-a','general','seller',NOW()),('bob','no-login','synthetic-b','general','buyer',NOW());`);
  for(const [owner,token] of Object.entries(tokens))await pool.query(
    'INSERT INTO sessions(token,session_id,username,expires_at) VALUES($1,$2,$3,$4)',
    [token,owner,owner==='bob2'?'bob':owner,Date.now()+3600000]);
  const backendPort=await freePort(),firstPort=await freePort(),secondPort=await freePort();
  const backend=`http://127.0.0.1:${backendPort}`;
  const serviceToken=randomBytes(32).toString('hex');
  const tempRoot=fs.mkdtempSync(path.join(root,'.tmp-phoenix-e2e-'));
  const childEnv={...process.env,NODE_ENV:'test',DATABASE_URL:local.toString(),DATABASE_SSL:'false',READ_REPLICA_DATABASE_URL:'',
    WINGA_DATA_DIR:path.join(tempRoot,'data'),WINGA_UPLOADS_DIR:path.join(tempRoot,'uploads'),R2_ACCOUNT_ID:'',
    WINGA_PHOENIX_TRANSPORT_ENABLED:'true',WINGA_PHOENIX_CANARY_USERS:'alice,bob',CONVERSATION_SERVICE_TOKEN:serviceToken,
    CONVERSATION_TICKET_SECRET:randomBytes(32).toString('hex'),WINGA_WEB_PUSH_ENABLED:'false',
    INTELLIGENCE_QUEUE_PROCESSOR_MODE:'off',WINGA_DISABLE_RATE_LIMIT:'1',ALLOWED_ORIGINS:'http://localhost:4173'};
  function launch(command,args,env,cwd,name){
    const log=fs.openSync(path.join(tempRoot,name+'.log'),'a');
    const child=spawn(command,args,{env,cwd,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);children.push(child);return child;
  }
  const node=launch(process.execPath,['server.js'],{...childEnv,PORT:String(backendPort)},path.join(root,'backend'),'node');
  await ready(backend+'/api/health',node);
  const csrf=(await (await fetch(backend+'/api/auth/csrf-token')).json()).csrfToken;
  async function ticket(owner){
    const r=await fetch(backend+'/api/messages/transport-ticket',{method:'POST',headers:{'Content-Type':'application/json',
      'X-CSRF-Token':csrf,Cookie:`winga_auth=${tokens[owner]}; winga_csrf=${csrf}`,Origin:'http://localhost:4173'},body:'{}'});
    assert.equal(r.status,200);return (await r.json()).ticket;
  }
  const tickets={alice:await ticket('alice'),bob:await ticket('bob'),bob2:await ticket('bob2')};
  assert.equal((await fetch(backend+'/api/internal/conversations/command',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const adapterHeaders = {'Content-Type': 'application/json', Authorization: `Bearer ${serviceToken}`};
  for (const extra of [{Origin: 'http://localhost:4173'}, {Cookie: 'winga_auth=synthetic'}]) {
    assert.equal((await fetch(backend+'/api/internal/conversations/command', {
      method: 'POST', headers: {...adapterHeaders, ...extra}, body: '{}'
    })).status, 401);
  }
  const oversized = await fetch(backend+'/api/internal/conversations/command', {
    method: 'POST', headers: adapterHeaders, body: JSON.stringify({padding: 'x'.repeat(32769)})
  });
  assert.equal(oversized.status, 413);
  assert.match(oversized.headers.get('cache-control'), /no-store/);
  let failBefore=false,dropAfter=false;
  proxy=http.createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      const command=JSON.parse(body).command;
      if(command==='send' && failBefore){const status=failBefore;failBefore=false;res.writeHead(status).end('{}');return;}
      const upstream=await fetch(backend+'/api/internal/conversations/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${serviceToken}`},body});
      const result=await upstream.text();
      if(command==='send' && dropAfter){dropAfter=false;req.socket.destroy();return;}
      res.writeHead(upstream.status,{'Content-Type':'application/json'}).end(result);
    }catch{if(!res.destroyed)res.writeHead(503).end('{}');}
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  const phoenixEnv={...process.env,MIX_ENV:'dev',PHX_SERVER:'true',CONVERSATION_SERVICE_TOKEN:serviceToken,
    CONVERSATION_BACKEND_URL:`http://127.0.0.1:${proxy.address().port}`};
  function phoenix(port,name){return process.platform==='win32'
    ?launch('cmd.exe',['/d','/c','mix.bat run --no-compile --no-halt'],{...phoenixEnv,PORT:String(port)},path.join(root,'services/conversations'),name)
    :launch('mix',['run','--no-compile','--no-halt'],{...phoenixEnv,PORT:String(port)},path.join(root,'services/conversations'),name);}
  const first=phoenix(firstPort,'phoenix-a'),second=phoenix(secondPort,'phoenix-b');
  const readiness = await Promise.allSettled([
    ready(`http://127.0.0.1:${firstPort}/health`,first),
    ready(`http://127.0.0.1:${secondPort}/health`,second)
  ]);
  for (const result of readiness) if (result.status === 'rejected') throw result.reason;
  async function device(port,ticket){const socket=await connect(port,ticket);sockets.push(socket);return socket;}
  const sender=await device(firstPort,tickets.alice);
  const payload={clientMessageId:randomUUID(),receiverId:'bob',message:'synthetic durable Phoenix message'};
  failBefore=429;
  assert.equal((await sender.command('message.send',payload)).response.code,'outcome_unknown');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n,0);
  failBefore=503;
  assert.equal((await sender.command('message.send',payload)).response.code,'outcome_unknown');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n,0);
  dropAfter=true;
  assert.equal((await sender.command('message.send',payload)).response.code,'outcome_unknown');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n,1);
  await stop(first);
  const survivor=await device(secondPort,tickets.alice),duplicate=await device(secondPort,tickets.alice);
  const replies=await Promise.all([survivor.command('message.send',payload),duplicate.command('message.send',payload)]);
  assert.ok(replies.every(r=>r.status==='ok' && r.response.accepted));
  assert.equal(replies[0].response.message.id,replies[1].response.message.id);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n,1);
  assert.equal((await survivor.command('message.send',{...payload,message:'conflicting'})).status,'error');
  const receiver=await device(secondPort,tickets.bob),otherDevice=await device(secondPort,tickets.bob2);
  const batch=(await receiver.wait(frame=>frame[3]==='events'))[4];
  const secondBatch=(await otherDevice.wait(frame=>frame[3]==='events'))[4];
  const ids=batch.events.map(e=>e.id);
  assert.deepEqual(secondBatch.events.map(e=>e.id),ids);
  assert.equal((await receiver.command('events.ack',{eventIds:ids})).status,'ok');
  assert.equal((await receiver.command('events.ack',{eventIds:ids})).status,'ok');
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM conversation_device_deliveries WHERE device_id='bob2' AND acknowledged_at IS NULL")).rows[0].n,ids.length);
  assert.equal((await pool.query('SELECT is_delivered FROM messages')).rows[0].is_delivered,false);
  const messageId=replies[0].response.message.id;
  assert.equal((await receiver.command('message.receipt',{kind:'stored',withUser:'alice',messageIds:[messageId]})).status,'ok');
  assert.deepEqual((await pool.query('SELECT is_delivered,is_read FROM messages')).rows[0],{is_delivered:true,is_read:false});
  assert.equal((await receiver.command('message.receipt',{kind:'read',withUser:'alice',messageIds:[messageId]})).status,'ok');
  assert.equal((await pool.query('SELECT is_read FROM messages')).rows[0].is_read,true);
  otherDevice.ws.close();
  const browserEvidence = await require('./helpers/phoenix-browser-exercise')({root,backend,port:secondPort,tokens,csrf,pool});
  assert.deepEqual(browserEvidence,{browserSend:true,restSendFallbacks:0,persistedBeforeAck:true,replayedAfterReload:true,readExplicit:true,resumeRenewed:true});
  await pool.query("DELETE FROM sessions WHERE session_id='bob'");
  await receiver.wait(frame=>frame[3]==='phx_close',15000);
  const reply=await fetch(backend+'/api/internal/conversations/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${serviceToken}`},
    body:JSON.stringify({version:1,ticket:tickets.bob,command:'poll',payload:{}})});
  assert.equal(reply.status,401);
});
