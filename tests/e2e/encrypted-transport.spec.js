const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {PGlite}=require('@electric-sql/pglite');
const {buildMlsBrowser}=require('../../scripts/build-mls-browser');
const {createConversationCryptoDeviceStore}=require('../../backend/conversation-crypto-devices');
const {createCryptoKeyPackageStore}=require('../../backend/conversation-crypto-key-packages');
const {createEncryptedConversationStore}=require('../../backend/encrypted-conversations');
const {createEncryptedConversationsApi}=require('../../backend/encrypted-conversations-api');
const {createEncryptedConversationBackupStore}=require('../../backend/encrypted-conversation-backups');
const {createEncryptedConversationBackupsApi}=require('../../backend/encrypted-conversation-backups-api');
const {createEncryptedMediaApi}=require('../../backend/encrypted-media-api');
let server,origin,output,db,devices,packages,transport,backups,storage,objects,loseNextSend=false,loseNextUpload=false,loseReplacementTransfer=false,loseReplacementReserve=false,rejectReplacementReserve=false,rejectReplacementTransfer=false,tamperReservation=false,enabled=true,tamperDirectory=false;
const sessions={a:{username:'alice',sessionId:'a',token:'a'},b1:{username:'bob',sessionId:'b1',token:'b1'},e:{username:'eve',sessionId:'e',token:'e'}};
const cookieSessions=new Map(Object.values(sessions).map(s=>[require('node:crypto').randomBytes(32).toString('hex'),s]));
test.beforeAll(async()=>{
  output=fs.mkdtempSync(path.join(os.tmpdir(),'winga-encrypted-transport-'));buildMlsBrowser(output);
  db=new PGlite();await db.exec(require('../helpers/conversation-event-fixture'));
  for(const name of ['conversation-crypto-devices','conversation-event-ledger','conversation-security-mode','conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-conversation-backups'])
    await db.transaction(async tx=>{for(const sql of require(`../../backend/migrations/${name}`).statements)await tx.exec(sql);});
  devices=createConversationCryptoDeviceStore({withTransaction:work=>db.transaction(work)});
  packages=createCryptoKeyPackageStore({withTransaction:work=>db.transaction(work)});
  transport=createEncryptedConversationStore({withTransaction:work=>db.transaction(work),mediaEnabled:true});
  backups=createEncryptedConversationBackupStore({withTransaction:work=>db.transaction(work)});
  objects=new Map();
  storage=require('../../backend/conversation-private-media').createPrivateMediaStorage({
    env:{R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET_NAME:'public-assets',R2_CONVERSATION_BUCKET_NAME:'chat-private',R2_CONVERSATION_ACCESS_KEY_ID:'fixture',R2_CONVERSATION_SECRET_ACCESS_KEY:'fixture',R2_CONVERSATION_API_TOKEN:'fixture',R2_CONVERSATION_ISOLATION_CONFIRMED:'true'},
    privacyCheck:async()=>{},authorize:transport.authorizeEncryptedMedia,client:{send:async cmd=>{
      const p=cmd.input;
      if(cmd.constructor.name==='PutObjectCommand'){if(objects.has(p.Key))throw {$metadata:{httpStatusCode:412}};objects.set(p.Key,Buffer.from(p.Body));return {};}
      if(cmd.constructor.name==='DeleteObjectCommand'){objects.delete(p.Key);return {};}
      const bytes=objects.get(p.Key);if(!bytes)throw new Error('missing');return {ContentLength:bytes.length,ContentType:'application/octet-stream',Metadata:{sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')},Body:require('node:stream').Readable.from([bytes])};
    }}
  });
  const sendJson=(res,status,value,headers={})=>{
    if(tamperReservation && value?.groups)value={...value,groups:value.groups.map(g=>g.replacement?{...g,replacement:{...g.replacement,reservation_proof:{...g.replacement.reservation_proof,signature:'A'.repeat(86)}}}:g)};
    if(tamperDirectory && value?.packages)value={...value,packages:value.packages.map(p=>({...p,mlsPublicKey:Buffer.alloc(32).toString('base64url')}))};
    res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(value));
  };
  const collectBody=req=>new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>262144)reject(new Error('too_large'));});req.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});});
  server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; object-src 'none'");
    const url=new URL(req.url,'http://localhost');
    const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('fixture_session='))?.slice('fixture_session='.length);
    const session=cookieSessions.get(cookie);
    if(url.pathname==='/test-session') {
      const wanted=Object.values(sessions).find(s=>s.username===url.searchParams.get('owner'));
      const entry=[...cookieSessions].find(([,s])=>s===wanted);
      if(!entry){sendJson(res,401,{code:'session_required'});return;}
      res.setHeader('Set-Cookie',`fixture_session=${entry[0]}; HttpOnly; SameSite=Strict; Path=/`);
      sendJson(res,200,{username:wanted.username,sessionId:wanted.sessionId});return;
    }
    const assets={'/devices.js':'src/chat/crypto-devices.js','/vault.js':'src/chat/encrypted-vault.js','/policy.js':'src/chat/encrypted-policy.js',
      '/api.js':'src/api/communications-client.js','/session.js':'src/chat/encryption-session.js','/security-ui.js':'src/chat/encryption-ui.js','/ui.js':'src/chat/ui.js','/style.css':'style.css',
      '/media.js':'src/chat/encrypted-media-client.js','/media-ui.js':'src/chat/encrypted-media-ui.js','/content.js':'src/chat/secure-content.js','/recovery.js':'src/chat/recovery-client.js','/recovery-ui.js':'src/chat/recovery-ui.js','/device-ui.js':'src/chat/device-management-ui.js'};
    if(/^\/icons\/navigation\/(key-round|paperclip|download|monitor-smartphone)\.svg$/.test(url.pathname)){res.setHeader('Content-Type','image/svg+xml');res.end(fs.readFileSync(path.resolve(__dirname,'../../public'+url.pathname)));return;}
    if(assets[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.resolve(__dirname,'../..',assets[url.pathname])));return;}
    if(url.pathname==='/vendor/winga-mls-candidate.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(output,'winga-mls-candidate.js')));return;}
    if(url.pathname==='/fixture.js'){
      res.setHeader('Content-Type','text/javascript');res.end(`
        window.WingaModules.chat=window.WingaModules.chat||{};
        window.start=async function(owner){
          window.owner=owner;window.peer=owner==='alice'?'bob':'alice';
          window.browserSession=await (await fetch('/test-session?owner='+encodeURIComponent(owner))).json();
          window.client=WingaModules.api.communications.createCommunicationsApiClient({baseUrl:'/api',getSession:()=>window.browserSession,
            createAuthHeaders:()=>({}),fetchJson:async(url,options)=>{const response=await fetch(url,options);const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.code),{code:value.code,status:response.status});return value;}});
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
        const common={collectBody,sendJson,findSession:t=>sessions[t],readAuthToken:()=>session.token,ensureMarketplaceUser:s=>s&&{username:s.username},enabled};
        const api=createEncryptedConversationsApi({...common,getPostgresStore:()=>transport,mediaEnabled:true});
        const media=createEncryptedMediaApi({...common,getPostgresStore:()=>transport,getStorage:()=>storage});
        const backupApi=createEncryptedConversationBackupsApi({...common,getPostgresStore:()=>backups});
        if(await backupApi.handle(req,res,url))return;
        if(url.pathname.startsWith('/api/conversations/encrypted/media/') && loseNextUpload && req.method==='PUT') {
          loseNextUpload=false;const originalEnd=res.end.bind(res);res.end=()=>req.socket.destroy();await media.handle(req,res,url);res.end=originalEnd;return;
        }
        if(await media.handle(req,res,url))return;
        if(url.pathname==='/api/conversations/encrypted/operations' && (loseNextSend || loseReplacementTransfer || loseReplacementReserve || rejectReplacementTransfer || rejectReplacementReserve)){
          const body=await collectBody(req);
          if(body.action==='replace-reserve' && rejectReplacementReserve){rejectReplacementReserve=false;sendJson(res,409,{code:'encrypted_package_unavailable'});return;}
          if(body.action==='replace-reserve' && loseReplacementReserve){loseReplacementReserve=false;await transport.encryptedOperation(context,body);sendJson(res,503,{code:'fixture_lost_reservation_reply'});return;}
          if(body.action==='replace-transfer' && rejectReplacementTransfer){sendJson(res,503,{code:'fixture_transfer_unavailable'});return;}
          if(body.action==='replace-transfer' && loseReplacementTransfer){loseReplacementTransfer=false;await transport.encryptedOperation(context,body);req.socket.destroy();return;}
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
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Winga encrypted chat integration</title></head><body><main><button class="chat-security-control" data-chat-security="" hidden>Chat security</button><div class="messages-thread-body" data-chat-read-user=""></div><form class="messages-compose"><div class="chat-compose-footer"></div></form></main><script src="/devices.js"></script><script src="/device-ui.js"></script><script src="/vault.js"></script><script src="/policy.js"></script><script src="/content.js"></script><script src="/recovery.js"></script><script src="/recovery-ui.js"></script><script src="/media.js"></script><script src="/media-ui.js"></script><script src="/api.js"></script><script src="/session.js"></script><script src="/security-ui.js"></script><script src="/fixture.js"></script><script src="/ui.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();fs.rmSync(output,{recursive:true,force:true});});
test('HttpOnly cookie-only sessions support server membership, ciphertext-only HTTP, chat, receipts, reload and exact retry',async({browser})=>{
  test.setTimeout(120000);
  const a=await browser.newContext(),b=await browser.newContext();
  try {
    const alice=await a.newPage(),bob=await b.newPage();await alice.goto(origin);await bob.goto(origin);
    const ai=await test.step('enroll Alice',()=>alice.evaluate(()=>start('alice'))),bi=await test.step('enroll Bob',()=>bob.evaluate(()=>start('bob')));
    for(const page of [alice,bob])expect(await page.evaluate(()=>({hasToken:Object.hasOwn(browserSession,'token'),visibleCookie:document.cookie}))).toEqual({hasToken:false,visibleCookie:''});
    expect((await alice.evaluate(()=>client.loadInboxPage())).items).toEqual([]);
    await expect(alice.locator('[data-chat-devices]')).toBeVisible();await alice.locator('[data-chat-devices]').click();
    await expect(alice.locator('dialog .chat-fingerprint').first()).toHaveText(ai.ownFingerprint);
    await expect(alice.locator('[data-crypto-device-apply]')).toBeDisabled();await alice.getByRole('button',{name:'Close',exact:true}).click();
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
    await test.step('encrypted media survives a lost upload reply and browser reload',async()=>{
      loseNextUpload=true;
      const uploaded=await alice.evaluate(()=>client.sendEncryptedMedia('bob',new File(['A private document body'], 'private-document.txt',{type:'text/plain'}),'Encrypted attachment caption'));
      // Chromium may retry an idempotent PUT itself after a lost socket response.
      expect(['pending','sent']).toContain(uploaded.status);expect(objects.size).toBe(1);
      const before=Buffer.from([...objects.values()][0]);expect(before.includes(Buffer.from('A private document body'))).toBe(false);
      expect(JSON.stringify((await db.query('SELECT * FROM encrypted_conversation_media')).rows)).not.toContain('private-document.txt');
      await alice.reload();await alice.evaluate(()=>start('alice'));await alice.evaluate(()=>render());await bob.evaluate(()=>render());
      expect(objects.size).toBe(1);expect(Buffer.from([...objects.values()][0]).equals(before)).toBe(true);
      expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(4);
      await expect(bob.locator('[data-encrypted-media-download]')).toHaveCount(1);
      await bob.evaluate(()=>WingaEncryptedMediaUi.bindDownloads(document,{dataLayer:client}));
      const download=await Promise.all([bob.waitForEvent('download'),bob.locator('[data-encrypted-media-download]').click()]);
      expect(fs.readFileSync(await download[0].path(),'utf8')).toBe('A private document body');expect(download[0].suggestedFilename()).toBe('private-document.txt');
    });
    await test.step('real attachment UI retains offline ciphertext and resumes after reload',async()=>{
      await expect(alice.locator('[data-encrypted-media-upload]')).toBeVisible();await a.setOffline(true);
      await alice.locator('.messages-compose input[type=file]').setInputFiles({name:'offline-private.txt',mimeType:'text/plain',buffer:Buffer.from('Offline private document')});
      await alice.locator('dialog textarea').fill('Offline encrypted file caption');await alice.getByRole('button',{name:'Send encrypted file'}).click();await expect(alice.locator('dialog')).toHaveCount(0);
      const staged=await alice.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'alice',getSession:()=>({username:'alice',sessionId:'a',token:'a'})});try{const job=Object.entries((await v.snapshot()).values).find(([k])=>k.startsWith('media:pending:'))[1];return {id:job.id,object:job.attachment.object,bytes:Array.from(job.ciphertext)};}finally{v.close();}});
      expect(objects.size).toBe(1);await a.setOffline(false);await alice.reload();await alice.evaluate(()=>start('alice'));await alice.evaluate(()=>render());await bob.evaluate(()=>render());
      expect(objects.size).toBe(2);expect([...objects.values()].some(bytes=>bytes.equals(Buffer.from(staged.bytes)))).toBe(true);
      await expect(bob.locator('[data-encrypted-media-download]')).toHaveCount(2);
      expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(5);
    });
    await test.step('user-held recovery kit restores history on a fresh pending device without MLS secrets',async()=>{
      await expect(bob.locator('[data-chat-recovery]')).toBeVisible();await bob.locator('[data-chat-recovery]').click();
      await bob.setViewportSize({width:390,height:844});
      const provisional=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Create recovery key'}).click()]);
      const keyOnly=JSON.parse(fs.readFileSync(await provisional[0].path(),'utf8'));expect(keyOnly.checkpoint).toBe(null);
      await expect(bob.getByRole('button',{name:'Back up and export'})).toBeDisabled();
      await bob.locator('[data-recovery-confirm]').fill(keyOnly.key);await bob.locator('[data-recovery-saved]').check();
      const exported=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Back up and export'}).click()]);
      const kit=JSON.parse(fs.readFileSync(await exported[0].path(),'utf8'));expect(kit.checkpoint.revision).toBe('1');
      const stored=JSON.stringify((await db.query('SELECT capsule FROM encrypted_conversation_backups')).rows);
      expect(stored).not.toContain(kit.key);expect(stored).not.toContain('Private Winga text');
      await expect(bob.getByRole('button',{name:'Close',exact:true})).toBeDisabled();
      expect(await bob.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await bob.screenshot({path:'test-results/encrypted-recovery-mobile.png'});await bob.locator('[data-recovery-saved]').check();await bob.getByRole('button',{name:'Close',exact:true}).click();
      const fresh=await browser.newContext();try {
        const page=await fresh.newPage();await page.goto(origin);await page.evaluate(async()=>{try{await start('bob');}catch{}});
        await page.locator('[data-chat-recovery]').click();
        await page.locator('[data-recovery-file]').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...kit,owner:'alice'}))});
        await expect(page.locator('dialog [role=status]')).toContainText('Recovery failed');
        await page.locator('[data-recovery-file]').setInputFiles({name:'key-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(keyOnly))});
        await expect(page.locator('dialog [role=status]')).toContainText('Recovery file loaded');
        await expect(page.getByRole('button',{name:'Restore history'})).toBeDisabled();
        await page.locator('[data-recovery-file]').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(kit))});
        await expect(page.getByRole('button',{name:'Restore history'})).toBeEnabled();await page.getByRole('button',{name:'Restore history'}).click();
        await expect(page.locator('dialog [role=status]')).toContainText('History restored: 5');await expect(page.locator('.chat-recovery-archive')).toContainText('Private Winga text');
        expect(await page.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'bob',getSession:()=>({username:'bob',sessionId:'b1',token:'b1'})});try{return Object.keys((await v.snapshot()).values).some(k=>k.startsWith('mls:group:'));}finally{v.close();}})).toBe(false);
        await page.getByRole('button',{name:'Close',exact:true}).click();
      }finally{await fresh.close();}
    });
    await test.step('client follows signed poll pages when the real MLS conversation is beyond 100 queue fixtures',async()=>{
      const group=(await db.query("SELECT * FROM encrypted_conversations WHERE creator='alice' AND recipient='bob'")).rows[0];
      // These empty authorized queue fixtures test paging, not 100 additional cryptographic admissions.
      for(let n=1;n<=100;n++) {
        const peer='paging-peer-'+n,id='00000000-0000-4000-8000-'+String(n).padStart(12,'0'),device=require('node:crypto').randomUUID();
        await db.query('INSERT INTO users(username) VALUES($1)',[peer]);
        await db.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status)
          SELECT $1,$2,public_key,fingerprint,'active' FROM conversation_crypto_devices WHERE id=$3`,[device,peer,group.recipient_device]);
        const cid=(await db.query('SELECT winga_ensure_conversation($1,$2) AS id',['alice',peer])).rows[0].id;
        await db.query(`INSERT INTO encrypted_conversations(id,canonical_id,creator,recipient,creator_device,recipient_device,source_hash,target_hash,status,created_at)
          VALUES($1,$2,'alice',$3,$4,$5,$6,$7,'active',NOW()-interval '1 day')`,[id,cid,peer,group.creator_device,device,group.source_hash,group.target_hash]);
      }
      expect((await alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).status).toBe('active');
    });
    await test.step('approved fresh device rejoins through verified replacement, lost response and reload without old history',async()=>{
      const fresh=await browser.newContext();try {
        const page=await fresh.newPage();await page.goto(origin);await page.evaluate(async()=>{try{await start('bob');}catch{}});
        const device=await page.evaluate(async()=>{const management=await client.createCryptoDeviceManagement();try{return (await management.list()).ownDevice;}finally{management.close();}});
        await bob.evaluate(async device=>{const management=await client.createCryptoDeviceManagement();try{await management.manage('approve',device.id,device.fingerprint);}finally{management.close();}},device);
        // The previously rejected client must recover after native approval.
        expect((await page.evaluate(()=>client.inspectEncryptedConversation('alice'))).status).toBe('rejoin-required');
        await page.reload();
        const ready=await page.evaluate(()=>start('bob'));expect(ready.status).toBe('rejoin-required');
        await alice.locator('[data-chat-security]').click();await expect(alice.getByRole('button',{name:'Replace contact device'})).toBeVisible();
        await alice.locator('dialog input[name=fingerprint]').fill('0'.repeat(64));await alice.getByRole('button',{name:'Replace contact device'}).click();
        await expect(alice.locator('dialog [role=status]')).toContainText('Verification failed');
        await expect(alice.getByRole('button',{name:'Replace contact device'})).toBeEnabled();
        expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n).toBe(0);
        rejectReplacementReserve=true;
        await expect(alice.evaluate(device=>client.replaceEncryptedConversationDevice('bob',device.id,device.fingerprint),device)).rejects.toThrow('encrypted_package_unavailable');
        expect((await alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).status).toBe('active');
        expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_replacement_retirements')).rows[0].n).toBe(1);
        expect(await alice.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'alice',getSession:()=>({username:'alice',sessionId:'a',token:'a'})});try{return Boolean((await v.snapshot()).values['mls:replacement:bob']);}finally{v.close();}})).toBe(false);
        await db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob' AND id<>$1",[device.id]);
        const revokedPeer=await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));expect(revokedPeer.status).toBe('blocked');expect(revokedPeer.canReplace).toBe(true);
        await db.query("UPDATE conversation_crypto_devices SET status='active',revoked_at=NULL WHERE owner_id='bob' AND id<>$1",[device.id]);
        loseReplacementReserve=true;await alice.locator('dialog input[name=fingerprint]').fill(device.fingerprint);await alice.getByRole('button',{name:'Replace contact device'}).click();
        await expect.poll(async()=>(await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_replacements')).rows[0].n).toBe(1);
        await expect(alice.locator('dialog [role=status]')).toContainText('Verification failed');
        await expect(alice.getByRole('button',{name:'Replace contact device'})).toBeEnabled();
        const reservation=(await db.query('SELECT id,intent,status,transfer FROM encrypted_conversation_replacements')).rows[0];
        expect(reservation.status).toBe('reserved');expect(reservation.transfer).toBeNull();
        await alice.reload();expect((await alice.evaluate(()=>start('alice'))).canResume).toBe(true);
        const historyBefore=await alice.evaluate(()=>client.loadConversationPage('bob'));
        await expect(alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'must not stage during replacement',messageType:'text'})))).rejects.toThrow('encrypted_membership_pending');
        await expect(alice.evaluate(()=>client.sendEncryptedMedia('bob',new File(['blocked'],'blocked.txt',{type:'text/plain'}),'blocked'))).rejects.toThrow('encrypted_membership_pending');
        expect(await alice.evaluate(()=>client.loadConversationPage('bob'))).toEqual(historyBefore);
        expect(await alice.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'alice',getSession:()=>({username:'alice',sessionId:'a',token:'a'})});try{return Object.keys((await v.snapshot()).values).filter(k=>k.startsWith('mls:outbox:')||k.startsWith('media:pending:')).length;}finally{v.close();}})).toBe(0);
        tamperReservation=true;await expect(alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).rejects.toThrow('mls_receipt_rejected');tamperReservation=false;
        await alice.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'alice',getSession:()=>({username:'alice',sessionId:'a',token:'a'})});try {
          const s=await v.snapshot();window.replacementState=Object.fromEntries(Object.entries(s.values).filter(([k])=>k.startsWith('mls:group:')||k.startsWith('mls:route:')));
          await v.write({expectedRevision:s.revision,values:{},deleted:Object.keys(window.replacementState)});
        }finally{v.close();}});
        expect((await alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).status).toBe('replacement-recovery-required');
        await expect(alice.evaluate(()=>client.resumeEncryptedConversationReplacement('bob'))).rejects.toThrow('mls_replacement_recovery_required');
        expect((await db.query('SELECT id,intent,status,transfer FROM encrypted_conversation_replacements')).rows[0]).toEqual(reservation);
        await alice.locator('[data-chat-security]').click();await expect(alice.locator('dialog [role=status]')).toContainText('Use the original device');await expect(alice.getByRole('button',{name:'Resume device replacement'})).toHaveCount(0);await alice.getByRole('button',{name:'Close',exact:true}).click();
        await alice.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'alice',getSession:()=>({username:'alice',sessionId:'a',token:'a'})});try {const s=await v.snapshot();await v.write({expectedRevision:s.revision,values:window.replacementState});}finally{v.close();}});
        rejectReplacementTransfer=true;await alice.locator('[data-chat-security]').click();await alice.getByRole('button',{name:'Resume device replacement'}).click();
        await expect(alice.locator('dialog [role=status]')).toContainText('Verification failed');
        await expect(alice.getByRole('button',{name:'Resume device replacement'})).toBeEnabled();
        expect((await db.query('SELECT transfer FROM encrypted_conversation_replacements')).rows[0].transfer).toBeNull();
        await alice.reload();expect((await alice.evaluate(()=>start('alice'))).canResume).toBe(true);
        await alice.locator('[data-chat-security]').click();await expect(alice.getByRole('button',{name:'Resume device replacement'})).toBeVisible();
        rejectReplacementTransfer=false;loseReplacementTransfer=true;await alice.getByRole('button',{name:'Resume device replacement'}).click();
        // Chromium may retry the same POST after the fixture drops its accepted reply.
        await expect.poll(async()=>(await db.query('SELECT transfer FROM encrypted_conversation_replacements')).rows[0]?.transfer?.epoch).toBe('2');
        await expect.poll(()=>alice.getByRole('button',{name:'Resume device replacement'}).count()).toBe(0);
        const before=(await db.query('SELECT id,transfer_hash,transfer FROM encrypted_conversation_replacements')).rows[0];expect(before.transfer.epoch).toBe('2');
        await alice.reload();await alice.evaluate(()=>start('alice'));
        expect((await db.query('SELECT id,transfer_hash,transfer FROM encrypted_conversation_replacements')).rows[0]).toEqual(before);
        const invitation=await page.evaluate(()=>client.inspectEncryptedConversation('alice'));expect(invitation.status).toBe('replacement-pending');expect(invitation.packages.length).toBeGreaterThan(0);
        await page.setViewportSize({width:390,height:844});await page.locator('[data-chat-security]').click();
        await expect(page.locator('dialog input[name=fingerprint]')).toBeVisible();
        await page.locator('dialog input[name=fingerprint]').fill(ai.ownFingerprint);await page.getByRole('button',{name:'Verify and accept'}).click();
        await expect(page.locator('dialog [role=status]')).toContainText('End-to-end encrypted');
        expect(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
        await page.screenshot({path:'test-results/encrypted-rejoin-mobile.png'});await page.getByRole('button',{name:'Close',exact:true}).click();
        expect((await alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).status).toBe('active');
        await alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'New device private message',messageType:'text'})));
        await page.evaluate(()=>render());await expect(page.locator('.message-bubble')).toHaveCount(1);await expect(page.locator('.message-bubble')).toContainText('New device private message');
        await bob.evaluate(()=>render());await expect(bob.locator('.message-bubble')).toHaveCount(5);
        await expect(bob.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'alice',message:'retired device must not send',messageType:'text'})))).rejects.toThrow('encrypted_membership_required');
        await page.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'alice',message:'New device reply',messageType:'text'})));
        await alice.evaluate(()=>render());await expect(alice.locator('.message-bubble')).toHaveCount(7);await expect(alice.locator('.message-bubble').last()).toContainText('New device reply');
        const thirdContext=await browser.newContext();try {
          const third=await thirdContext.newPage();await third.goto(origin);await third.evaluate(async()=>{try{await start('bob');}catch{}});
          const thirdDevice=await third.evaluate(async()=>{const m=await client.createCryptoDeviceManagement();try{return (await m.list()).ownDevice;}finally{m.close();}});
          await page.evaluate(async d=>{const m=await client.createCryptoDeviceManagement();try{await m.manage('approve',d.id,d.fingerprint);}finally{m.close();}},thirdDevice);
          await third.reload();await third.evaluate(()=>start('bob'));
          const offered=await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));expect(offered.packages.some(p=>p.deviceId===thirdDevice.id)).toBe(true);
          await alice.evaluate(d=>client.replaceEncryptedConversationDevice('bob',d.id,d.fingerprint),thirdDevice);
          // Revocation after reservation must be displayed as blocked, not active.
          await db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE id=$1",[thirdDevice.id]);
          expect((await alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).status).toBe('blocked');
          await db.query("UPDATE conversation_crypto_devices SET status='active',revoked_at=NULL WHERE id=$1",[thirdDevice.id]);
          const invitation=await third.evaluate(()=>client.inspectEncryptedConversation('alice'));
          await third.evaluate(({p,fp})=>client.enableEncryptedConversation('alice',p.deviceId,fp),{p:invitation.packages[0],fp:ai.ownFingerprint});
          expect((await alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).status).toBe('active');
          expect((await db.query("SELECT epoch FROM encrypted_conversations WHERE creator='alice' AND recipient='bob'")).rows[0].epoch).toBe('3');
          await expect(page.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'alice',message:'second retired device',messageType:'text'})))).rejects.toThrow('encrypted_membership_required');
          await alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'Third epoch',messageType:'text'})));
          const latest=await third.evaluate(()=>render());expect(latest).toHaveLength(1);expect(latest[0].message).toBe('Third epoch');
        }finally{await thirdContext.close();}
      }finally{await fresh.close();}
    });
    await bob.setViewportSize({width:390,height:844});await bob.locator('[data-chat-security]').click();
    await expect(bob.locator('dialog')).toBeVisible();
    expect(await bob.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await bob.screenshot({path:'test-results/encrypted-chat-mobile.png'});await bob.getByRole('button',{name:'Close',exact:true}).click();
    await db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");
    await expect(alice.evaluate(async()=>{const p=await client.prepareMessage({receiverId:'bob',message:'must block',messageType:'text'});await client.sendMessage(p);})).rejects.toThrow('encrypted_access_denied');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(8);
    await a.clearCookies();
    await expect(alice.evaluate(()=>client.loadInboxPage())).rejects.toThrow('session_required');
    await expect(alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'no cookie must not send',messageType:'text'})))).rejects.toThrow('session_required');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(8);
  }finally{await a.close().catch(()=>{});await b.close().catch(()=>{});}
});
