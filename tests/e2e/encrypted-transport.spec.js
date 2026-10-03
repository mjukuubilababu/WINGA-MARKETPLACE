const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {PGlite}=require('@electric-sql/pglite');
const {buildMlsBrowser}=require('../../scripts/build-mls-browser');
const {createConversationCryptoDeviceStore}=require('../../backend/conversation-crypto-devices');
const {createCryptoKeyPackageStore}=require('../../backend/conversation-crypto-key-packages');
const {createEncryptedConversationStore}=require('../../backend/encrypted-conversations');
const {createEncryptedConversationsApi}=require('../../backend/encrypted-conversations-api');
let server,origin,output,db,devices,packages,transport,loseNextSend=false,enabled=true,tamperDirectory=false;
const sessions={a:{username:'alice',sessionId:'a',token:'a'},b1:{username:'bob',sessionId:'b1',token:'b1'},e:{username:'eve',sessionId:'e',token:'e'}};
test.beforeAll(async()=>{
  output=fs.mkdtempSync(path.join(os.tmpdir(),'winga-encrypted-transport-'));buildMlsBrowser(output);
  db=new PGlite();await db.exec(require('../helpers/conversation-event-fixture'));
  for(const name of ['conversation-crypto-devices','conversation-event-ledger','conversation-security-mode','conversation-crypto-key-packages','encrypted-conversations'])
    await db.transaction(async tx=>{for(const sql of require(`../../backend/migrations/${name}`).statements)await tx.exec(sql);});
  devices=createConversationCryptoDeviceStore({withTransaction:work=>db.transaction(work)});
  packages=createCryptoKeyPackageStore({withTransaction:work=>db.transaction(work)});
  transport=createEncryptedConversationStore({withTransaction:work=>db.transaction(work)});
  const sendJson=(res,status,value,headers={})=>{
    if(tamperDirectory && value?.packages)value={...value,packages:value.packages.map(p=>({...p,mlsPublicKey:Buffer.alloc(32).toString('base64url')}))};
    res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(value));
  };
  const collectBody=req=>new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>262144)reject(new Error('too_large'));});req.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});});
  server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; object-src 'none'");
    const url=new URL(req.url,'http://localhost'),session=sessions[req.headers['x-session']];
    const assets={'/devices.js':'src/chat/crypto-devices.js','/vault.js':'src/chat/encrypted-vault.js','/policy.js':'src/chat/encrypted-policy.js',
      '/api.js':'src/api/communications-client.js','/session.js':'src/chat/encryption-session.js','/security-ui.js':'src/chat/encryption-ui.js','/ui.js':'src/chat/ui.js','/style.css':'style.css'};
    if(assets[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.resolve(__dirname,'../..',assets[url.pathname])));return;}
    if(url.pathname==='/vendor/winga-mls-candidate.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(output,'winga-mls-candidate.js')));return;}
    if(url.pathname==='/fixture.js'){
      res.setHeader('Content-Type','text/javascript');res.end(`
        window.WingaModules.chat=window.WingaModules.chat||{};
        window.start=async function(owner){
          window.owner=owner;window.peer=owner==='alice'?'bob':'alice';
          const token=owner==='alice'?'a':owner==='bob'?'b1':'e';
          window.client=WingaModules.api.communications.createCommunicationsApiClient({baseUrl:'/api',getSession:()=>({username:owner,sessionId:token,token}),
            createAuthHeaders:()=>({'X-Session':token}),fetchJson:async(url,options)=>{const response=await fetch(url,options);const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.code),{code:value.code,status:response.status});return value;}});
          window.render=async()=>{
            const items=(await client.loadConversationPage(peer)).items;
            const ui=WingaModules.chat.createChatUiModule({getCurrentUser:()=>owner,getActiveChatContext:()=>({withUser:peer}),escapeHtml:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),getMessageProductItems:()=>[],getReplyPreviewMessage:()=>null,getOpenChatMessageMenuId:()=>''});
            document.querySelector('[data-chat-read-user]').dataset.chatReadUser=peer;
            document.querySelector('[data-chat-read-user]').innerHTML=ui.renderConversationMessagesMarkup(items,{enableActions:true});return items;
          };
          document.querySelector('[data-chat-security]').dataset.chatSecurity=peer;
          WingaEncryptedChatUi.bind(document,{dataLayer:client,refresh:render});
          return client.inspectEncryptedConversation(peer);
        };
      `);return;
    }
    if(url.pathname.startsWith('/api/')) {
      if(!session){sendJson(res,401,{code:'session_required'});return;}
      const context={owner:session.username,deviceId:session.sessionId,token:session.token};
      try {
        const api=createEncryptedConversationsApi({collectBody,sendJson,findSession:t=>sessions[t],readAuthToken:r=>r.headers['x-session'],ensureMarketplaceUser:s=>s&&{username:s.username},getPostgresStore:()=>transport,enabled});
        if(url.pathname==='/api/conversations/encrypted/operations' && loseNextSend){
          const body=await collectBody(req);
          if(body.action==='send'){loseNextSend=false;await transport.encryptedOperation(context,body);req.socket.destroy();return;}
          sendJson(res,200,await transport.encryptedOperation(context,body));return;
        }
        if(await api.handle(req,res,url))return;
        if(url.pathname.endsWith('/crypto/devices')){sendJson(res,200,req.method==='POST'?await devices.mutateConversationCryptoDevice(context,await collectBody(req)):await devices.readConversationCryptoDevices(context));return;}
        if(url.pathname.endsWith('/crypto/key-packages')){sendJson(res,200,await packages.publishCryptoKeyPackage(context,await collectBody(req)));return;}
        if(url.pathname==='/api/messages'){sendJson(res,200,[]);return;}
        if(['/api/messages/history','/api/messages/inbox'].includes(url.pathname)){sendJson(res,200,{items:[],hasMore:false,nextCursor:''});return;}
        sendJson(res,404,{code:'not_found'});
      }catch(error){sendJson(res,error.status||500,{code:error.code||error.message});}
      return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><link rel="stylesheet" href="/style.css"><title>Winga encrypted chat integration</title></head><body><main><button class="chat-security-control" data-chat-security="" hidden>Chat security</button><div class="messages-thread-body" data-chat-read-user=""></div></main><script src="/devices.js"></script><script src="/vault.js"></script><script src="/policy.js"></script><script src="/api.js"></script><script src="/session.js"></script><script src="/security-ui.js"></script><script src="/fixture.js"></script><script src="/ui.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();fs.rmSync(output,{recursive:true,force:true});});
test('authenticated server membership, ciphertext-only HTTP, real chat renderer, receipts, reload and exact retry',async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  try {
    const alice=await a.newPage(),bob=await b.newPage();await alice.goto(origin);await bob.goto(origin);
    const ai=await test.step('enroll Alice',()=>alice.evaluate(()=>start('alice'))),bi=await test.step('enroll Bob',()=>bob.evaluate(()=>start('bob')));
    await alice.locator('[data-chat-security]').click();
    await alice.locator('dialog input[name=fingerprint]').fill('0'.repeat(64));await alice.getByRole('button',{name:'Verify and accept'}).click();
    await expect(alice.locator('dialog [role=status]')).toContainText('Verification failed');
    await expect(alice.getByRole('button',{name:'Verify and accept'})).toBeEnabled();
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n).toBe(0);
    tamperDirectory=true;
    await alice.locator('dialog input[name=fingerprint]').fill(bi.ownFingerprint);await alice.getByRole('button',{name:'Verify and accept'}).click();
    await test.step('reject substituted directory signing key',()=>expect(alice.locator('dialog [role=status]')).toContainText('Verification failed'));
    await expect(alice.getByRole('button',{name:'Verify and accept'})).toBeEnabled();
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversations')).rows[0].n).toBe(0);
    tamperDirectory=false;
    await alice.locator('dialog input[name=fingerprint]').fill(bi.ownFingerprint);await alice.getByRole('button',{name:'Verify and accept'}).click();
    await test.step('publish real membership invitation',()=>expect(alice.locator('dialog [role=status]')).toContainText('Waiting'));await alice.getByRole('button',{name:'Close',exact:true}).click();
    expect((await db.query('SELECT security_mode FROM conversation_event_streams')).rows[0].security_mode).toBe('legacy-plaintext');
    await bob.locator('[data-chat-security]').click();await bob.locator('dialog input[name=fingerprint]').fill(ai.ownFingerprint);
    await bob.getByRole('button',{name:'Verify and accept'}).click();await expect(bob.locator('dialog [role=status]')).toContainText('End-to-end encrypted');await bob.getByRole('button',{name:'Close',exact:true}).click();
    await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));
    const payload=await alice.evaluate(async()=>{window.payload=await client.prepareMessage({receiverId:'bob',message:'Private Winga text',messageType:'text'});return payload;});
    const sent=await alice.evaluate(()=>client.sendMessage(payload));expect(sent.status).toBe('sent');
    await alice.evaluate(()=>render());await expect(alice.locator('.message-bubble')).toContainText('Sent');
    const storage=(await db.query('SELECT * FROM encrypted_conversation_messages')).rows;
    expect(storage).toHaveLength(1);expect(JSON.stringify(storage)).not.toContain('Private Winga text');
    expect((await db.query('SELECT security_mode FROM conversation_event_streams')).rows[0].security_mode).toBe('encrypted');
    await expect(db.query("INSERT INTO messages(id,sender_id,receiver_id,message) VALUES('downgrade','alice','bob','no')")).rejects.toThrow('conversation_encryption_required');
    await bob.evaluate(()=>render());await expect(bob.locator('.message-bubble')).toContainText('Private Winga text');
    await alice.evaluate(()=>render());await expect(alice.locator('.message-bubble')).toContainText('Delivered');
    await bob.bringToFront();await bob.evaluate(id=>client.markConversationRead({withUser:'alice',messageIds:[id]}),sent.id);
    await alice.evaluate(()=>render());await expect(alice.locator('.message-bubble')).toContainText('Read');
    loseNextSend=true;
    const second=await alice.evaluate(async()=>{const p=await client.prepareMessage({receiverId:'bob',message:'Retry the same ciphertext',messageType:'text'});try{await client.sendMessage(p);}catch{}return p;});
    const before=(await db.query('SELECT ciphertext FROM encrypted_conversation_messages WHERE id=$1',[second.clientMessageId])).rows[0].ciphertext;
    await alice.reload();await alice.evaluate(()=>start('alice'));await alice.evaluate(id=>client.retryEncryptedMessage(id),second.clientMessageId);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(2);
    expect((await db.query('SELECT ciphertext FROM encrypted_conversation_messages WHERE id=$1',[second.clientMessageId])).rows[0].ciphertext).toBe(before);
    await bob.evaluate(()=>render());await bob.reload();await bob.evaluate(()=>start('bob'));await bob.evaluate(()=>render());
    await expect(bob.locator('.message-bubble')).toHaveCount(2);
    expect(await bob.evaluate(()=>localStorage.length)).toBe(0);
    await a.setOffline(true);
    const queued=await alice.evaluate(async()=>{const p=await client.prepareMessage({receiverId:'bob',message:'Retained encrypted offline message',messageType:'text'});return client.sendMessage(p);});
    expect(queued.isQueued).toBe(true);await alice.evaluate(()=>render());await expect(alice.locator('.message-bubble')).toHaveCount(3);
    await a.setOffline(false);await alice.evaluate(()=>render());await bob.evaluate(()=>render());await expect(bob.locator('.message-bubble')).toHaveCount(3);
    await bob.setViewportSize({width:390,height:844});await bob.locator('[data-chat-security]').click();
    await expect(bob.locator('dialog')).toBeVisible();
    expect(await bob.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await bob.screenshot({path:'test-results/encrypted-chat-mobile.png'});await bob.getByRole('button',{name:'Close',exact:true}).click();
    await db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");
    await expect(alice.evaluate(async()=>{const p=await client.prepareMessage({receiverId:'bob',message:'must block',messageType:'text'});await client.sendMessage(p);})).rejects.toThrow('encrypted_access_denied');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(3);
  }finally{await a.close().catch(()=>{});await b.close().catch(()=>{});}
});
