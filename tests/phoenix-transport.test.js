const test = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes, randomUUID} = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFile} = require('node:child_process');
const {once} = require('node:events');
const {setTimeout:delay} = require('node:timers/promises');
const {Client, Pool} = require('pg');
const {createPostgresStore} = require('../backend/db');
const {startupDiagnostic, fixturePorts} = require('./helpers/phoenix-fixture-startup');

const target = new URL(process.env.WINGA_TEST_POSTGRES_URL || 'http://invalid');
if (!['postgres:','postgresql:'].includes(target.protocol)
  || !['127.0.0.1','localhost','[::1]'].includes(target.hostname) || target.search || target.hash) {
  throw new Error('WINGA_TEST_POSTGRES_URL must point to a disposable localhost PostgreSQL cluster.');
}
const root=path.resolve(__dirname,'..');
const startupFiles = new WeakMap();
async function ready(url, child) {
  for(let n=0;n<200;n++) {
    if(child.exitCode!==null || child.signalCode!==null)throw new Error('Fixture process exited before readiness '+JSON.stringify(
      startupDiagnostic({...startupFiles.get(child),code:child.exitCode,signal:child.signalCode})));
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
  return {ws,command,wait,pendingBatches:()=>frames.filter(frame=>frame[3]==='events').length};
}

async function rejectUntrustedOrigin(port) {
  await new Promise((resolve,reject)=>{
    const request=http.request({
      host:'127.0.0.1',port,path:'/socket/websocket?vsn=2.0.0',
      headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13',
        'Sec-WebSocket-Key':randomBytes(16).toString('base64'),Origin:'http://127.0.0.1:4174'}
    });
    request.setTimeout(3000,()=>request.destroy(new Error('Origin probe timed out')));
    request.once('error',reject);
    request.once('response',response=>{
      response.resume();
      try{assert.equal(response.statusCode,403,'unlisted origins must fail before socket authentication');resolve();}
      catch(error){reject(error);}
    });
    request.once('upgrade',(_response,socket)=>{
      socket.destroy();reject(new Error('Phoenix accepted an unlisted origin'));
    });
    request.end();
  });
}

test('real Phoenix nodes preserve canonical sends and device replay through lost replies and node loss', {timeout:240000}, async t=>{
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
  for(let i=0;i<16;i++) {
    const owner=`load${i}`;
    tokens[owner]=randomBytes(24).toString('hex');
    await pool.query(`INSERT INTO users(username,password,phone_number,primary_category,role,created_at)
      VALUES($1,'no-login',$2,'general','seller',NOW())`,[owner,`synthetic-load-${i}`]);
  }
  for(const [owner,token] of Object.entries(tokens))await pool.query(
    'INSERT INTO sessions(token,session_id,username,expires_at) VALUES($1,$2,$3,$4)',
    [token,owner,owner==='bob2'?'bob':owner,Date.now()+3600000]);
  const [backendPort,firstPort,secondPort]=await fixturePorts();
  assert.equal(new Set([backendPort,firstPort,secondPort]).size,3,'fixture ports must be distinct');
  const backend=`http://127.0.0.1:${backendPort}`;
  const serviceToken=randomBytes(32).toString('hex');
  const tempRoot=fs.mkdtempSync(path.join(root,'.tmp-phoenix-e2e-'));
  const childEnv={...process.env,NODE_ENV:'test',DATABASE_URL:local.toString(),DATABASE_SSL:'false',READ_REPLICA_DATABASE_URL:'',
    WINGA_DATA_DIR:path.join(tempRoot,'data'),WINGA_UPLOADS_DIR:path.join(tempRoot,'uploads'),R2_ACCOUNT_ID:'',
    WINGA_PHOENIX_TRANSPORT_ENABLED:'true',WINGA_PHOENIX_ALL_USERS:'true',WINGA_PHOENIX_CANARY_USERS:'',CONVERSATION_SERVICE_TOKEN:serviceToken,
    CONVERSATION_TICKET_SECRET:randomBytes(32).toString('hex'),WINGA_WEB_PUSH_ENABLED:'false',
    WINGA_ENCRYPTED_CONVERSATIONS_ENABLED:'true',WINGA_CRYPTO_DEVICES_ENABLED:'true',WINGA_MLS_CANDIDATE_ENABLED:'true',
    INTELLIGENCE_QUEUE_PROCESSOR_MODE:'off',WINGA_DISABLE_RATE_LIMIT:'1',ALLOWED_ORIGINS:'http://localhost:4173'};
  function launch(command,args,env,cwd,name){
    const logPath=path.join(tempRoot,name+'.log'),log=fs.openSync(logPath,'a');
    const child=spawn(command,args,{env,cwd,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
    startupFiles.set(child,{name,logPath});children.push(child);return child;
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
  for(let i=0;i<16;i++)tickets[`load${i}`]=await ticket(`load${i}`);
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
  let failBefore=false,dropAfter=false,nativeFixture,nativeFirst;
  proxy=http.createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      const input=JSON.parse(body),command=input.command,operation=command==='native'?input.payload:null;
      if(operation && nativeFixture) {
        nativeFixture.requests.push({operation:structuredClone(operation),transport:'Phoenix'});
        if(operation.action==='receipt' && operation.payload.kind==='delivered' && nativeFixture.faults.withholdDelivered) {
          res.writeHead(503).end('{}');return;
        }
      }
      if(command==='send' && failBefore){const status=failBefore;failBefore=false;res.writeHead(status).end('{}');return;}
      const upstream=await fetch(backend+'/api/internal/conversations/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${serviceToken}`},body});
      const result=await upstream.text();
      if(operation && nativeFixture && upstream.ok)nativeFixture.responses.push({status:upstream.status,value:JSON.parse(result).result,transport:'Phoenix'});
      if(operation?.action==='send' && nativeFixture?.faults.loseSendReply && upstream.ok) {
        nativeFixture.faults.loseSendReply=false;
        nativeFixture.responses.push({status:upstream.status,value:JSON.parse(result).result,lost:true,transport:'Phoenix'});
        await stop(nativeFirst);req.socket.destroy();return;
      }
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
  await rejectUntrustedOrigin(firstPort);
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
  for (const socket of sockets) socket.ws.close();
  const restarted=phoenix(firstPort,'phoenix-a-restarted');
  await ready(`http://127.0.0.1:${firstPort}/health`,restarted);
  const loadEvidence=await require('./helpers/phoenix-load-exercise')({
    pool,device,firstPort,secondPort,tickets,
    sampleNodes:async()=>{
      const nodes=await Promise.all([firstPort,secondPort].map(async port=>{
        const response=await fetch(`http://127.0.0.1:${port}/ops/health`,{
          headers:{Authorization:`Bearer ${serviceToken}`},signal:AbortSignal.timeout(3000)});
        assert.equal(response.status,200);
        const value=await response.json();
        return {connections:value.connections,connectionGaugeComplete:value.connectionGaugeComplete,
          beamMemoryBytes:value.beamMemoryBytes};
      }));
      return {scope:'two-local-nodes-point-in-time',sampledNodes:nodes.length,
        connections:nodes.every(n=>n.connectionGaugeComplete && Number.isSafeInteger(n.connections))
          ?nodes.reduce((sum,n)=>sum+n.connections,0):null,
        beamMemoryBytes:nodes.every(n=>Number.isSafeInteger(n.beamMemoryBytes))
          ?nodes.reduce((sum,n)=>sum+n.beamMemoryBytes,0):null};
    },
    stopFirst:()=>stop(restarted),
    restartWriter:async()=>{
      await stop(node);
      const replacement=launch(process.execPath,['server.js'],{...childEnv,PORT:String(backendPort)},path.join(root,'backend'),'node-restarted');
      await ready(backend+'/api/health',replacement);
    }
  });
  t.diagnostic(JSON.stringify(loadEvidence));
  await t.test('signed native MLS operations traverse Phoenix and recover exact ciphertext through real BEAM node loss', async nativeTest=>{
    const activeFirst=phoenix(firstPort,'phoenix-encrypted-a');
    nativeFirst=activeFirst;
    await ready(`http://127.0.0.1:${firstPort}/health`,activeFirst);
    const firstDevice=await device(firstPort,await ticket('alice'));
    const secondDevice=await device(secondPort,await ticket('alice'));
    nativeFixture=await require('./helpers/phoenix-encrypted-native-fixture')({
      root,output:tempRoot,store,backend,csrf,phoenixPort:firstPort,fixturePort:4173,
      phoenixPorts:{alice:firstPort,bob2:secondPort},sessions:{
        alice:{username:'alice',sessionId:'alice',token:tokens.alice},
        bob2:{username:'bob',sessionId:'bob2',token:tokens.bob2}
      }
    });
    nativeTest.after(()=>nativeFixture.close());
    assert.equal(nativeFixture.origin,'http://127.0.0.1:4173','native browser must use the existing dev allowlist');
    const phases=[];
    const evidence=await require('./helpers/phoenix-encrypted-native-exercise')({
      fixture:nativeFixture,pool,accounts:{alice:'alice',bob:'bob2'},
      onSecurity:operations=>require('./helpers/phoenix-native-security')({
        pool,operations,sessions:{
          alice:{username:'alice',sessionId:'alice',token:tokens.alice},
          bob:{username:'bob',sessionId:'bob2',token:tokens.bob2}
        },
        request:async(session,operation,{revoke=false}={})=>{
          const issued=await fetch(backend+'/api/messages/transport-ticket',{method:'POST',headers:{
            'Content-Type':'application/json','X-CSRF-Token':csrf,
            Cookie:`winga_auth=${session.token}; winga_csrf=${csrf}`,Origin:'http://localhost:4173'},body:'{}'});
          assert.equal(issued.status,200);
          const nativeTicket=(await issued.json()).ticket;
          if(revoke)await pool.query('DELETE FROM sessions WHERE session_id=$1',[session.sessionId]);
          const result=await fetch(backend+'/api/internal/conversations/command',{method:'POST',headers:adapterHeaders,
            body:JSON.stringify({version:1,ticket:nativeTicket,command:'native',payload:operation})});
          return {status:result.status,value:await result.json()};
        }
      }),
      onLoss:async(phase,operation)=>{
        const socket=phase==='accepted-reply-lost'?firstDevice:secondDevice;
        const child=phase==='accepted-reply-lost'?activeFirst:second;
        const closed=socket.ws.readyState===WebSocket.CLOSED?Promise.resolve():once(socket.ws,'close',{signal:AbortSignal.timeout(10000)});
        if(child.exitCode===null && child.signalCode===null)await stop(child);
        await closed;
        assert.ok(child.exitCode!==null || child.signalCode!==null,'real BEAM process must exit');
        const port=phase==='accepted-reply-lost'?firstPort:secondPort;
        await assert.rejects(fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)}));
        if(phase==='accepted-reply-lost') {
          nativeFixture.phoenixPort=secondPort;
          nativeFixture.phoenixPorts={alice:secondPort,bob2:secondPort};
        }
        else {
          const replacement=phoenix(firstPort,'phoenix-native-survivor');
          await ready(`http://127.0.0.1:${firstPort}/health`,replacement);
          nativeFixture.phoenixPort=firstPort;
          nativeFixture.phoenixPorts={alice:firstPort,bob2:firstPort};
        }
        phases.push(phase);
      }
    });
    assert.deepEqual(phases,['accepted-reply-lost','persisted-receipt-withheld']);
    assert.deepEqual(evidence,{nativeTransport:'Phoenix+HTTP-recovery',signedMls:true,canonicalCiphertext:true,
      decryptedBeforeReceipt:true,replayedAfterReload:true,explicitRead:true,beamLossPhases:2,nativePhoenixSupported:true,
      liveCrossNode:true,nativeMessages:2});
    nativeTest.diagnostic(JSON.stringify(evidence));
  });
});
