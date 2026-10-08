const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const {chromium} = require('@playwright/test');

module.exports = async function exerciseBrowser({root,backend,port,tokens,csrf,pool}) {
  const browser=await chromium.launch({channel:process.env.WINGA_TEST_BROWSER_CHANNEL==='chromium'?undefined:'msedge',headless:true});
  const contexts=[];
  const origin='http://localhost:4173';
  const files=new Map([
    ['/src/api/phoenix-transport.js','src/api/phoenix-transport.js'],
    ['/src/api/communications-client.js','src/api/communications-client.js'],
    ['/src/chat/device-receipts.js','src/chat/device-receipts.js'],
    ['/vendor/phoenix.min.js','node_modules/phoenix/priv/static/phoenix.min.js']
  ]);
  async function contextFor(account) {
    const context=await browser.newContext();contexts.push(context);
    await context.grantPermissions(['local-network-access'], {origin});
    await context.route(origin+'/**', async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:
        '<!doctype html><title>Phoenix device test</title><script src="/src/api/phoenix-transport.js"></script><script src="/src/api/communications-client.js"></script><script src="/src/chat/device-receipts.js"></script>'});
      if(files.has(url.pathname))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,files.get(url.pathname))),'headers':{'cache-control':'no-store'}});
      if(url.pathname.startsWith('/api/')) {
        const response=await route.fetch({url:backend+url.pathname+url.search,
          headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,
            Cookie:`winga_auth=${tokens[account]}; winga_csrf=${csrf}`,Origin:origin}});
        return route.fulfill({response});
      }
      return route.abort();
    });
    return context;
  }
  async function pageFor(context,account) {
    const page=await context.newPage(),trace=[];
    page.transportTrace=trace;
    page.on('response',response=>trace.push({path:new URL(response.url()).pathname,status:response.status()}));
    page.on('websocket',socket=>{
      trace.push({socketPath:new URL(socket.url()).pathname});
      socket.on('framesent',frame=>{
        try {const value=JSON.parse(frame.payload);trace.push({sentEvent:value[3]});}catch{}
      });
      socket.on('close',()=>trace.push({socketClosed:true}));
      socket.on('framereceived',frame=>{
        try { const value=JSON.parse(frame.payload);trace.push({event:value[3],status:value[4]?.status,code:value[4]?.response?.code}); } catch {}
      });
      socket.on('socketerror',()=>trace.push({socketError:true}));
    });
    page.on('pageerror',error=>trace.push({pageError:error.name}));
    page.on('console',message=>{
      if(message.type()==='error' && /WebSocket|Content Security|connect-src|Refused|Mixed Content/.test(message.text()))
        trace.push({browserPolicy:message.text().slice(0,400)});
    });
    await page.goto(origin);
    await page.evaluate(({port,account})=>{
      const owner=account==='bob2'?'bob':account;
      window.session={username:owner,sessionId:account};
      window.calls={restSends:0,failedAcks:0,failedAckMessageIds:[],tickets:0,states:[]};
      window.failAck=false;window.active=true;
      const client=WingaModules.api.communications.createCommunicationsApiClient({
        baseUrl:'/api',getSession:()=>session,
        getTransportConfig:()=>({phoenixTransportEnabled:true,phoenixCanaryUsers:['alice','bob'],
          phoenixTransportUrl:`ws://127.0.0.1:${port}/socket`}),
        getEventSource:()=>class {addEventListener(){} close(){}},
        fetchJson:async(url,options={})=>{
          if(url==='/api/messages' && options.method==='POST')calls.restSends++;
          if(url.endsWith('transport-ticket'))calls.tickets++;
          const result=await fetch(url,options),body=await result.json();
          if(url.endsWith('transport-ticket'))calls.ticketShape={version:body.version,bytes:body.ticket?.length,ttl:body.expiresAt-Date.now()};
          if(!result.ok)throw Object.assign(new Error('Test API rejected'),{status:result.status});
          return body;
        }
      });
      const receipts=WingaModules.chat.createDeviceReceipts({owner,dataLayer:client,isCurrent:()=>active});
      window.client=client;window.receipts=receipts;
      window.stream=client.openRealtimeChannel({isCurrent:()=>active,onTransportState:state=>calls.states.push(state),onDeviceEvents:(batch,ack)=>
        receipts.acceptEvents(batch,ids=>{
          if(failAck){calls.failedAcks++;calls.failedAckMessageIds.push(...batch.items.map(message=>message.id));throw new Error('Simulated lost ACK before write');}
          return ack(ids);
        }).catch(error=>{calls.consumerError={name:error.name,message:error.message,stack:error.stack};throw error;})});
      window.inbox=()=>new Promise((resolve,reject)=>{
        const request=indexedDB.open('winga-received-messages-v1',2);
        let absent=false;
        request.onupgradeneeded=()=>{absent=true;request.transaction.abort();};
        request.onerror=()=>absent?resolve([]):reject(request.error);
        request.onsuccess=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('messages')){db.close();resolve([]);return;}
          const tx=db.transaction('messages'),rows=tx.objectStore('messages').getAll();
          tx.oncomplete=()=>{db.close();resolve(rows.result);};
        };
      });
    },{port,account});
    try { await page.waitForFunction(()=>client.hasDeviceEventStream(),{},{timeout:15000}); }
    catch { throw new Error('Browser canary readiness failed: '+JSON.stringify({trace,state:await page.evaluate(()=>({calls,library:typeof window.Phoenix?.Socket}))})); }
    return page;
  }
  try {
    const receiverContext=await contextFor('bob2');
    let receiver=await pageFor(receiverContext,'bob2');
    await receiver.waitForFunction(async()=> (await inbox()).some(row=>row.message?.id),{},{timeout:15000});
    const sender=await pageFor(await contextFor('alice'),'alice');
    await receiver.evaluate(()=>{failAck=true;});
    const sent=await sender.evaluate(async clientMessageId=>client.sendMessage({
      clientMessageId,receiverId:'bob',message:'synthetic browser Phoenix message',
      productId:'',productName:'',replyToMessageId:'',productItems:[]
    }),randomUUID());
    assert.ok(sent.id);
    assert.equal(await sender.evaluate(()=>calls.restSends),0);
    await receiver.waitForFunction(async id=>(await inbox()).some(row=>row.message?.id===id),sent.id,{timeout:15000});
    try { await receiver.waitForFunction(id=>calls.failedAckMessageIds.includes(id),sent.id,{timeout:15000}); }
    catch { throw new Error('Durable browser ACK stalled: '+JSON.stringify({trace:receiver.transportTrace,state:await receiver.evaluate(()=>calls)})); }
    const proof=(await pool.query(`SELECT stored_at,read_at FROM message_device_receipts
      WHERE message_id=$1 AND device_id='bob2' AND sender_id='alice' AND receiver_id='bob'`,[sent.id])).rows;
    assert.equal(proof.length,1);
    assert.ok(proof[0].stored_at);
    assert.equal(proof[0].read_at,null);
    const stored=(await pool.query('SELECT is_delivered,is_read FROM messages WHERE id=$1',[sent.id])).rows[0];
    assert.deepEqual(stored,{is_delivered:true,is_read:false});
    assert.ok((await pool.query(`SELECT COUNT(*)::int AS n FROM conversation_device_deliveries d
      JOIN conversation_events e ON e.id=d.event_id
      WHERE d.device_id='bob2' AND d.acknowledged_at IS NULL AND e.message_id=$1`,[sent.id])).rows[0].n>0);
    await receiver.close();
    receiver=await pageFor(receiverContext,'bob2');
    await receiver.waitForFunction(async id=>(await inbox()).filter(row=>row.message?.id===id).length===1,sent.id,{timeout:15000});
    for(let n=0;n<150;n++){
      const pending=(await pool.query("SELECT COUNT(*)::int AS n FROM conversation_device_deliveries WHERE device_id='bob2' AND acknowledged_at IS NULL AND cancelled_at IS NULL")).rows[0].n;
      if(!pending)break;
      if(n===149)assert.fail('Browser did not ACK replay after durable storage');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal((await pool.query('SELECT is_read FROM messages WHERE id=$1',[sent.id])).rows[0].is_read,false);
    await receiver.evaluate(async message=>receipts.markRead([message],()=>true),sent);
    assert.equal((await pool.query('SELECT is_read FROM messages WHERE id=$1',[sent.id])).rows[0].is_read,true);
    const ticketsBeforeResume=await sender.evaluate(()=>calls.tickets);
    await sender.evaluate(()=>{
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await sender.waitForFunction(before=>calls.tickets>before && client.hasDeviceEventStream(),ticketsBeforeResume,{timeout:15000});
    await sender.evaluate(()=>{stream.close();active=false;});
    assert.equal(await sender.evaluate(()=>client.hasDeviceEventStream()),false);
    return {browserSend:true,restSendFallbacks:0,persistedBeforeAck:true,replayedAfterReload:true,readExplicit:true,resumeRenewed:true};
  } finally {
    for(const context of contexts){
      await context.unrouteAll({behavior:'ignoreErrors'});
      await context.close();
    }
    await browser.close();
  }
};
