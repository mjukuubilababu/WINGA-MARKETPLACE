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
let server,origin,output,db,devices,packages,transport,backups,storage,objects,loseNextSend=false,loseNextUpload=false,loseReplacementTransfer=false,loseReplacementReserve=false,rejectReplacementReserve=false,rejectReplacementTransfer=false,tamperReservation=false,enabled=true,tamperDirectory=false,multiDeviceEnabled=false,loseDeviceTransfer=false,roomsEnabled=false,roomLimits,loseRoomReserve=false,loseSellerAnswer=false,loseSellerQuestion=false,tamperSellerEvidence=false;
const sessions={a:{username:'alice',sessionId:'a',token:'a'},b1:{username:'bob',sessionId:'b1',token:'b1'},e:{username:'eve',sessionId:'e',token:'e'},s:{username:'outside-seller',sessionId:'s',token:'s'}};
const roomCatalogProduct={id:'room-fixture-product',name:'Kariakoo simu',price:850000,currency:'TZS',status:'approved',availability:'available',uploadedBy:'outside-seller'};
const roomSecondProduct={id:'room-fixture-laptop',name:'Laptop',price:950000,currency:'TZS',status:'approved',availability:'reserved',uploadedBy:'outside-seller'};
const cookieSessions=new Map(Object.values(sessions).map(s=>[require('node:crypto').randomBytes(32).toString('hex'),s]));
test.beforeAll(async()=>{
  output=fs.mkdtempSync(path.join(os.tmpdir(),'winga-encrypted-transport-'));buildMlsBrowser(output);
  db=new PGlite();await db.exec(require('../helpers/conversation-event-fixture'));
  for(const name of ['conversation-crypto-devices','conversation-crypto-session-bindings','conversation-event-ledger','conversation-security-mode','conversation-crypto-key-packages','encrypted-conversations','encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery','encrypted-conversation-backups','encrypted-history-pages','encrypted-message-invariants'])
    await db.transaction(async tx=>{for(const sql of require(`../../backend/migrations/${name}`).statements)await tx.exec(sql);});
  devices=createConversationCryptoDeviceStore({withTransaction:work=>db.transaction(work)});
  packages=createCryptoKeyPackageStore({withTransaction:work=>db.transaction(work)});
  transport=createEncryptedConversationStore({withTransaction:work=>db.transaction(work),mediaEnabled:true});
  backups=createEncryptedConversationBackupStore({withTransaction:work=>db.transaction(work)});
  objects=new Map();
  storage=require('../../backend/conversation-private-media').createPrivateMediaStorage({
    env:{R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET_NAME:'public-assets',R2_CONVERSATION_BUCKET_NAME:'chat-private',R2_CONVERSATION_ACCESS_KEY_ID:'fixture',R2_CONVERSATION_SECRET_ACCESS_KEY:'fixture',R2_CONVERSATION_API_TOKEN:'fixture',R2_CONVERSATION_ISOLATION_CONFIRMED:'true'},
    privacyCheck:async()=>{},authorize:(...args)=>transport.authorizeEncryptedMedia(...args),client:{send:async cmd=>{
      const p=cmd.input;
      if(cmd.constructor.name==='PutObjectCommand'){if(objects.has(p.Key))throw {$metadata:{httpStatusCode:412}};objects.set(p.Key,Buffer.from(p.Body));return {};}
      if(cmd.constructor.name==='DeleteObjectCommand'){objects.delete(p.Key);return {};}
      const bytes=objects.get(p.Key);if(!bytes)throw new Error('missing');return {ContentLength:bytes.length,ContentType:'application/octet-stream',Metadata:{sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')},Body:require('node:stream').Readable.from([bytes])};
    }}
  });
  const sendJson=(res,status,value,headers={})=>{
    if(tamperReservation && value?.groups)value={...value,groups:value.groups.map(g=>g.replacement?{...g,replacement:{...g.replacement,reservation_proof:{...g.replacement.reservation_proof,signature:'A'.repeat(86)}}}:g)};
    if(tamperDirectory && value?.packages)value={...value,packages:value.packages.map(p=>({...p,mlsPublicKey:Buffer.alloc(32).toString('base64url')}))};
    if(tamperSellerEvidence&&value?.question&&value?.answer)value={...value,answer:{...value.answer,proof:{...value.answer.proof,signature:'A'.repeat(86)}}};
    res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(value));
  };
  const collectBody=req=>new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>262144)reject(new Error('too_large'));});req.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});});
  server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; img-src 'self' blob:; object-src 'none'");
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
      '/room-session.js':'src/chat/room-session.js','/rooms-ui.js':'src/chat/rooms-ui.js','/src/chat/shopping-room-content.mjs':'src/chat/shopping-room-content.mjs',
      '/rich.js':'src/chat/rich-content.js','/media.js':'src/chat/encrypted-media-client.js','/media-ui.js':'src/chat/encrypted-media-ui.js','/content.js':'src/chat/secure-content.js','/history-sync.js':'src/chat/native-history-client.js','/recovery.js':'src/chat/recovery-client.js','/recovery-ui.js':'src/chat/recovery-ui.js','/device-ui.js':'src/chat/device-management-ui.js'};
    assets['/rich-ui.js']='src/chat/rich-ui.js';
    if(/^\/icons\/navigation\/[a-z0-9-]+\.svg$/.test(url.pathname)){res.setHeader('Content-Type','image/svg+xml');res.end(fs.readFileSync(path.resolve(__dirname,'../../node_modules/lucide-static/icons',path.basename(url.pathname))));return;}
    if(assets[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.resolve(__dirname,'../..',assets[url.pathname])));return;}
    if(url.pathname==='/room-read-visibility.js'){const app=fs.readFileSync(path.resolve(__dirname,'../../app.js'),'utf8');res.setHeader('Content-Type','text/javascript');
      res.end(app.slice(app.indexOf('function isActiveConversationVisible()'),app.indexOf('async function markActiveConversationRead()')));return;}
    if(url.pathname==='/vendor/winga-mls-candidate.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(output,'winga-mls-candidate.js')));return;}
    if(url.pathname==='/fixture.js'){
      res.setHeader('Content-Type','text/javascript');res.end(`
        window.WingaModules.chat=window.WingaModules.chat||{};
        window.start=async function(owner,{inspect=true}={}){
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
          return inspect?client.inspectEncryptedConversation(peer):null;
        };
      `);return;
    }
    if(url.pathname.startsWith('/api/')) {
      if(!session){sendJson(res,401,{code:'session_required'});return;}
      const context={owner:session.username,deviceId:session.sessionId,token:session.token};
      try {
        const contact=url.pathname.match(/^\/api\/social\/users\/([^/]+)$/);
        if(contact&&req.method==='GET'){const profile=(await db.query("SELECT username FROM users WHERE LOWER(username)=LOWER($1) AND status='active'",[decodeURIComponent(contact[1])])).rows[0];
          sendJson(res,profile?200:404,profile?{profile}:{code:'social_profile_not_found'});return;}
        const common={collectBody,sendJson,findSession:t=>sessions[t],readAuthToken:()=>session.token,ensureMarketplaceUser:s=>s&&{username:s.username},enabled};
        const api=createEncryptedConversationsApi({...common,getPostgresStore:()=>transport,mediaEnabled:true,multiDeviceEnabled,roomsEnabled,roomLimits});
        const media=createEncryptedMediaApi({...common,getPostgresStore:()=>transport,getStorage:()=>storage});
        const backupApi=createEncryptedConversationBackupsApi({...common,getPostgresStore:()=>backups});
        if(await backupApi.handle(req,res,url))return;
        if(url.pathname.startsWith('/api/conversations/encrypted/media/') && loseNextUpload && req.method==='PUT') {
          loseNextUpload=false;const originalEnd=res.end.bind(res);res.end=()=>req.socket.destroy();await media.handle(req,res,url);res.end=originalEnd;return;
        }
        if(await media.handle(req,res,url))return;
        if(url.pathname==='/api/conversations/encrypted/operations' && (loseNextSend || loseReplacementTransfer || loseReplacementReserve || rejectReplacementTransfer || rejectReplacementReserve || loseDeviceTransfer || loseRoomReserve || loseSellerAnswer || loseSellerQuestion)){
          const body=await collectBody(req);
          if(body.action==='send'&&loseSellerQuestion){loseSellerQuestion=false;await transport.encryptedOperation(context,body);sendJson(res,503,{code:'fixture_lost_seller_question_reply'});return;}
          if(body.action==='seller-answer-register'&&loseSellerAnswer){loseSellerAnswer=false;await transport.encryptedOperation(context,body);sendJson(res,503,{code:'fixture_lost_seller_answer_reply'});return;}
          if(body.action==='room-reserve'&&loseRoomReserve){loseRoomReserve=false;await transport.encryptedOperation(context,body);sendJson(res,503,{code:'fixture_lost_room_reservation_reply'});return;}
          if(['device-transfer','device-change-transfer'].includes(body.action) && loseDeviceTransfer){loseDeviceTransfer=false;await transport.encryptedOperation(context,body);sendJson(res,503,{code:'fixture_lost_device_transfer_reply'});return;}
          if(body.action==='replace-reserve' && rejectReplacementReserve){rejectReplacementReserve=false;sendJson(res,409,{code:'encrypted_package_unavailable'});return;}
          if(body.action==='replace-reserve' && loseReplacementReserve){loseReplacementReserve=false;await transport.encryptedOperation(context,body);sendJson(res,503,{code:'fixture_lost_reservation_reply'});return;}
          if(body.action==='replace-transfer' && rejectReplacementTransfer){sendJson(res,503,{code:'fixture_transfer_unavailable'});return;}
          if(body.action==='replace-transfer' && loseReplacementTransfer){loseReplacementTransfer=false;await transport.encryptedOperation(context,body);req.socket.destroy();return;}
          if(body.action==='send'&&loseNextSend){loseNextSend=false;await transport.encryptedOperation(context,body);req.socket.destroy();return;}
          sendJson(res,200,await transport.encryptedOperation(context,body));return;
        }
        if(await api.handle(req,res,url))return;
        if(url.pathname==='/api/products'){sendJson(res,200,{items:[roomCatalogProduct,roomSecondProduct].filter(p=>!url.searchParams.get('productId')||p.id===url.searchParams.get('productId'))});return;}
        if(url.pathname==='/api/conversations/references'&&url.searchParams.get('kind')==='product'){
          const p=[roomCatalogProduct,roomSecondProduct].find(p=>p.id===url.searchParams.get('id'));
          sendJson(res,p?200:404,p?{kind:'product',...p}:{code:'conversation_reference_unavailable'});return;}
        if(url.pathname.endsWith('/crypto/devices')){sendJson(res,200,req.method==='POST'?await devices.mutateConversationCryptoDevice(context,await collectBody(req)):await devices.readConversationCryptoDevices(context));return;}
        if(url.pathname.endsWith('/crypto/key-packages')){sendJson(res,200,await packages.publishCryptoKeyPackage(context,await collectBody(req)));return;}
        if(url.pathname==='/api/messages'){sendJson(res,200,[]);return;}
        if(['/api/messages/history','/api/messages/inbox'].includes(url.pathname)){sendJson(res,200,{items:[],hasMore:false,nextCursor:''});return;}
        sendJson(res,404,{code:'not_found'});
      }catch(error){sendJson(res,error.status||500,{code:error.code||error.message});}
      return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Winga encrypted chat integration</title></head><body><main><button class="chat-security-control" data-chat-security="" hidden>Chat security</button><div class="messages-thread-body" data-chat-read-user=""></div><form class="messages-compose"><div class="chat-compose-footer"></div></form></main><script src="/devices.js"></script><script src="/device-ui.js"></script><script src="/vault.js"></script><script src="/policy.js"></script><script src="/content.js"></script><script src="/history-sync.js"></script><script src="/recovery.js"></script><script src="/recovery-ui.js"></script><script src="/media.js"></script><script src="/media-ui.js"></script><script src="/api.js"></script><script src="/session.js"></script><script src="/security-ui.js"></script><script src="/fixture.js"></script><script src="/ui.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();fs.rmSync(output,{recursive:true,force:true});});
async function resetStores(multidevice=false,rooms=false,limits) {
  await db.close();db=new PGlite();await db.exec(require('../helpers/conversation-event-fixture'));
  for(const name of ['message-web-push','conversation-crypto-devices','conversation-crypto-session-bindings','conversation-event-ledger','conversation-security-mode','conversation-crypto-key-packages','encrypted-conversations',
    'encrypted-conversation-media','encrypted-conversation-replacement','encrypted-replacement-retirements','encrypted-device-delivery','encrypted-device-admissions','encrypted-device-lifecycle','encrypted-native-history','encrypted-conversation-backups','encrypted-history-pages','encrypted-shopping-rooms','encrypted-room-sellers','encrypted-room-preferences','encrypted-room-departures','encrypted-message-invariants'])
    await db.transaction(async tx=>{for(const sql of require(`../../backend/migrations/${name}`).statements)await tx.exec(sql);});
  await db.exec(`INSERT INTO users(username) VALUES('outside-seller');INSERT INTO sessions VALUES('s','outside-seller','s',9999999999999);
    CREATE TABLE products(id TEXT PRIMARY KEY,uploaded_by TEXT,status TEXT);
    INSERT INTO products VALUES('room-fixture-product','outside-seller','approved'),('room-fixture-laptop','outside-seller','approved');
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);`);
  const withTransaction=work=>db.transaction(work);
  devices=createConversationCryptoDeviceStore({withTransaction});packages=createCryptoKeyPackageStore({withTransaction});
  roomLimits=limits;transport=createEncryptedConversationStore({withTransaction,mediaEnabled:true,multiDeviceEnabled:multidevice,roomsEnabled:rooms,roomLimits});
  backups=createEncryptedConversationBackupStore({withTransaction});objects.clear();multiDeviceEnabled=multidevice;roomsEnabled=rooms;
}

test('Room own-device archive synchronization, recovery and encrypted old attachment download work over real HTTP',async({browser})=>{
  test.setTimeout(120000);await resetStores(true,true);
  const contexts=await Promise.all(Array.from({length:4},()=>browser.newContext({viewport:{width:390,height:844}})));
  try{
    const [alice,bob,eve,sibling]=await Promise.all(contexts.map(c=>c.newPage()));
    async function startRoom(page,owner){await page.goto(origin);await page.addScriptTag({url:origin+'/room-session.js'});return page.evaluate(name=>start(name),owner);}
    for(const [page,owner] of [[alice,'alice'],[bob,'bob'],[eve,'eve']])await startRoom(page,owner);
    const selected=await alice.evaluate(()=>client.shoppingRoom('inspectOwners',[['bob','eve']]));
    const id=await alice.evaluate(p=>client.shoppingRoom('create',['History Room',p]),selected);
    for(const p of [bob,eve])await p.evaluate(id=>client.shoppingRoom('join',[id]),id);
    for(let n=0;n<2;n++)for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    const old=await bob.evaluate(id=>client.shoppingRoom('send',[id,'Old private Room text']),id);
    const file=await alice.evaluate(id=>client.shoppingRoom('sendMedia',[id,new File(['Old encrypted Room file'],'historic-room.txt',{type:'text/plain'}),'History file']),id);
    for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    const kit=await alice.evaluate(async()=>{const r=await client.createEncryptedRecovery();try{return await r.backup(r.generateKey());}finally{r.close();}});
    await expect(startRoom(sibling,'alice')).rejects.toThrow();
    const next=(await db.query("SELECT id,fingerprint FROM conversation_crypto_devices WHERE owner_id='alice' AND status='pending'")).rows[0];
    await alice.evaluate(async d=>{const m=await client.createCryptoDeviceManagement();try{await m.manage('approve',d.id,d.fingerprint);}finally{m.close();}},next);
    await startRoom(sibling,'alice');
    const added=await alice.evaluate(id=>client.shoppingRoom('inspectChange',[id,['alice']]),id);expect(added).toHaveLength(1);expect(added[0].deviceId).toBe(next.id);
    await alice.evaluate(({id,added})=>client.shoppingRoom('change',[id,added]),{id,added});
    for(const p of [bob,eve,sibling])await p.evaluate(id=>client.shoppingRoom('join',[id]),id);
    await expect.poll(async()=>{
      for(const p of [alice,bob,eve,sibling])await p.evaluate(()=>client.shoppingRoom('sync'));
      return (await sibling.evaluate(id=>client.shoppingRoom('history',[id]),id)).map(m=>m.id);
    },{timeout:30000}).toEqual([old.id,file.id]);
    const board=await sibling.evaluate(id=>client.shoppingRoom('board',[id]),id);expect(board.conversationId).toBe(id);expect(board.rejected).toEqual([]);
    expect(await sibling.evaluate(async({id,fileId})=>(await client.shoppingRoom('downloadMedia',[id,fileId])).blob.text(),{id,fileId:file.id})).toBe('Old encrypted Room file');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_media_archive_grants WHERE device_id=$1',[next.id])).rows[0].n).toBe(1);
    expect((await db.query("SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch='1'",[id])).rows[0].n).toBe(3);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts WHERE device_id=$1 AND message_id=ANY($2::text[])',[next.id,[old.id,file.id]])).rows[0].n).toBe(0);
    await sibling.evaluate(async kit=>{const r=await client.createEncryptedRecovery();try{await r.restore(kit);}finally{r.close();}},kit);
    await sibling.reload();await sibling.addScriptTag({url:origin+'/room-session.js'});await sibling.evaluate(()=>start('alice'));
    await sibling.evaluate(()=>client.shoppingRoom('sync'));expect((await sibling.evaluate(id=>client.shoppingRoom('board',[id]),id)).rejected).toEqual([]);
    expect((await sibling.evaluate(id=>client.shoppingRoom('history',[id]),id)).map(m=>m.id)).toEqual([old.id,file.id]);
    const fresh=await sibling.evaluate(id=>client.shoppingRoom('send',[id,'Live Room message after restored history']),id);
    for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    expect((await bob.evaluate(id=>client.shoppingRoom('history',[id]),id)).filter(m=>m.id===fresh.id)).toHaveLength(1);
    expect([...objects.values()].some(bytes=>bytes.includes(Buffer.from('Old encrypted Room file')))).toBe(false);
  }finally{for(const c of contexts)await c.close();}
});

test('real Rooms UI creates a three-owner native MLS room and converges encrypted text and poll votes over HTTP',async({browser})=>{
  test.setTimeout(120000);await resetStores(false,true,{maxOwners:3,maxDevices:3});
  await db.query("INSERT INTO users(username,status) VALUES('offline','active')");
  const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext(),browser.newContext()]);
  try{
    const pages=await Promise.all(contexts.map(c=>c.newPage()));
    for(const [index,page] of pages.entries()){
      page.on('response',async response=>{if(response.url().includes('/api/')&&!response.ok())console.log('room-http-diagnostic',response.status(),(await response.json().catch(()=>({}))).code);});
      page.on('console',message=>{if(message.text().startsWith('room-ui-diagnostic'))console.log(message.text());});
      await page.goto(origin);await page.addScriptTag({url:origin+'/room-read-visibility.js'});await page.addScriptTag({url:origin+'/room-session.js'});await page.addScriptTag({url:origin+'/rooms-ui.js'});
      await page.evaluate(name=>start(name),['alice','bob','eve'][index]);
      await page.evaluate(()=>{
        const ui=WingaModules.chat.createChatUiModule({escapeHtml:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
          getCurrentUser:()=>browserSession.username,getCurrentSession:()=>browserSession,getConversationSummaries:()=>[],getActiveChatContext:()=>null,
          getCurrentMessageDraft:()=>'',getConversationsView:()=> 'rooms',getProfileMessagesMode:()=> 'list',getProfileMessagesFilter:()=> 'all',
          getUserDisplayName:v=>v,getMarketplaceUser:()=>null,getProductById:()=>null,getActiveConversationMessages:()=>[],getUnreadNotifications:()=>[]});
        const profile=document.createElement('div');profile.id='profile-div';profile.dataset.activeSection='profile-messages-panel';profile.style.display='block';
        const shell=document.createElement('div');shell.className='profile-shell';shell.innerHTML=ui.renderMessagesSection();profile.append(shell);
        document.querySelector('main').replaceChildren(profile);document.body.classList.add('conversations-open');
        WingaShoppingRoomsUi.bind(document.querySelector('.conversation-workspace'),{dataLayer:client,getSession:()=>browserSession,
          translate:(key,fallback)=>key==='rooms.memberLimit'?'A chatroom can have up to 12 accounts.':fallback,
          actions:{onError:code=>console.log('room-ui-diagnostic',code)}});
      });
    }
    const [alice,bob,eve]=pages;
    await alice.locator('[data-room-list]').getByRole('button',{name:'New chatroom'}).click();
    await alice.locator('input[name="name"]').fill('Winga Kariakoo');await alice.locator('textarea[name="members"]').fill('Alice Room');
    let directoryRequests=0;alice.on('request',request=>{if(request.url().endsWith('/encrypted/operations')&&request.postDataJSON()?.action==='room-directory')directoryRequests++;});
    await alice.getByRole('button',{name:'Review devices',exact:true}).click();await expect(alice.locator('[data-room-error]')).toHaveText('At least two other accounts are required.');
    expect(directoryRequests).toBe(0);
    expect(await alice.evaluate(()=>client.shoppingRoom('limits'))).toEqual({maxOwners:3,maxDevices:3});
    await alice.locator('textarea[name="members"]').fill('bob eve outside-seller');await alice.getByRole('button',{name:'Review devices',exact:true}).click();
    await expect(alice.locator('[data-room-error]')).toHaveText('A chatroom can have up to 3 accounts.');expect(directoryRequests).toBe(0);
    await alice.locator('textarea[name="members"]').fill('bob eve!');await alice.getByRole('button',{name:'Review devices',exact:true}).click();
    await expect(alice.locator('[data-room-error]')).toHaveText('One or more usernames are invalid.');expect(directoryRequests).toBe(0);
    await alice.locator('textarea[name="members"]').fill('bob missing');await alice.getByRole('button',{name:'Review devices',exact:true}).click();
    await expect(alice.locator('[data-room-error]')).toHaveText('Account missing is unavailable.');expect(directoryRequests).toBe(0);
    await alice.locator('textarea[name="members"]').fill('bob offline');await alice.getByRole('button',{name:'Review devices',exact:true}).click();
    await expect(alice.locator('[data-room-error]')).toHaveText('Some members do not have a ready encrypted chat device yet.');
    expect(await alice.locator('.room-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-shopping-rooms-member-validation.png'),fullPage:true});
    await alice.locator('textarea[name="members"]').fill('BOB Eve bob ALICE');
    await alice.getByRole('button',{name:'Review devices',exact:true}).click();await expect(alice.locator('.room-key-review li')).toHaveCount(3);
    await expect(alice.locator('[data-room-error]')).toHaveText('');
    loseRoomReserve=true;await alice.locator('dialog').getByRole('button',{name:'New chatroom',exact:true}).click();
    await expect(alice.locator('dialog [data-room-error]')).toContainText('Try again');
    await alice.locator('dialog').getByRole('button',{name:'Close chat',exact:true}).click();
    await alice.locator('[data-room-list]').getByRole('button',{name:'Try again',exact:true}).click();
    await alice.locator('[data-room-list]').getByRole('button',{name:'Try again: Winga Kariakoo',exact:true}).click();
    await expect(alice.locator('[data-room-row]')).toHaveCount(1);
    const id=await alice.locator('[data-room-row]').getAttribute('data-room-row');
    for(const page of [bob,eve]){await page.evaluate(async()=>{await client.shoppingRoom('sync');});
      await expect(page.locator('[data-room-row]')).toHaveCount(1);await page.locator('[data-room-row]').click();
      await page.getByRole('button',{name:'Review devices',exact:true}).click();await page.getByRole('button',{name:'Approve and join'}).click();}
    for(const page of pages)await page.evaluate(()=>client.shoppingRoom('sync'));
    await expect(alice.locator('textarea[name="message"]')).toBeVisible({timeout:15000});
    await expect(alice.locator('.room-head-identity')).toContainText('3 members');
    await bob.evaluate(()=>{window.roomTestViewport=Object.getOwnPropertyDescriptor(window,'visualViewport');
      Object.defineProperty(window,'visualViewport',{configurable:true,value:{offsetTop:0,offsetLeft:0,height:0,width:innerWidth}});});
    await alice.locator('textarea[name="message"]').fill('Habari za Kariakoo');await alice.getByRole('button',{name:'Send message',exact:true}).click();
    for(const page of [bob,eve]){await page.evaluate(()=>client.shoppingRoom('sync'));await expect(page.locator('.room-thread')).toContainText('Habari za Kariakoo',{timeout:15000});}
    const firstId=await bob.evaluate(async id=>(await client.shoppingRoom('history',[id])).find(m=>m.message==='Habari za Kariakoo').id,id);
    await bob.bringToFront();await bob.evaluate(({id,firstId})=>client.shoppingRoom('markRead',[id,[firstId]]),{id,firstId});
    const bobReads=async()=>(await db.query(`SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts r
      JOIN conversation_crypto_devices d ON d.id=r.device_id WHERE r.message_id=$1 AND r.kind='read' AND d.owner_id='bob'`,[firstId])).rows[0].n;
    expect(await bobReads()).toBe(0);
    await bob.evaluate(()=>{if(window.roomTestViewport)Object.defineProperty(window,'visualViewport',window.roomTestViewport);else delete window.visualViewport;
      window.dispatchEvent(new Event('focus'));});
    await bob.evaluate(({id,firstId})=>client.shoppingRoom('markRead',[id,[firstId]]),{id,firstId});
    await expect.poll(bobReads).toBe(1);
    await bob.setViewportSize({width:390,height:844});
    await bob.getByRole('button',{name:'Settings',exact:true}).click();
    await bob.getByRole('checkbox',{name:'Mute alerts',exact:true}).check();
    await expect.poll(()=>bob.evaluate(id=>client.shoppingRoom('preferences',[id]),id)).toEqual({revision:'1',muted:true,archived:false});
    expect(await bob.locator('.room-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await bob.screenshot({path:path.resolve(__dirname,'../../.tmp-room-preferences.png'),fullPage:true});
    expect(await eve.evaluate(id=>client.shoppingRoom('preferences',[id]),id)).toEqual({revision:'0',muted:false,archived:false});
    await bob.locator('dialog').getByRole('button',{name:'Archive',exact:true}).click();
    await expect(bob.locator('[data-room-row]')).toHaveCount(0);
    await alice.locator('textarea[name="message"]').fill('Arrives in the archived room');await alice.getByRole('button',{name:'Send message',exact:true}).click();
    await bob.evaluate(()=>client.shoppingRoom('sync'));await expect(bob.locator('[data-room-row]')).toHaveCount(0);
    await bob.getByRole('button',{name:'Archived chats',exact:true}).click();await expect(bob.getByRole('button',{name:'Archived chats',exact:true})).toHaveAttribute('aria-pressed','true');
    await bob.locator('[data-room-row]').click();await expect(bob.locator('.room-thread')).toContainText('Arrives in the archived room');
    await bob.getByRole('button',{name:'Settings',exact:true}).click();await expect(bob.getByRole('checkbox',{name:'Mute alerts',exact:true})).toBeChecked();
    await bob.evaluate(async id=>{const before=await client.shoppingRoom('preferences',[id]);await client.shoppingRoom('setPreference',[id,before.revision,'muted',false]);},id);
    await expect(bob.getByRole('checkbox',{name:'Mute alerts',exact:true})).not.toBeChecked({timeout:15000});
    await bob.locator('dialog').getByRole('button',{name:'Move to Inbox',exact:true}).click();
    await expect(bob.getByRole('button',{name:'Archived chats',exact:true})).toHaveAttribute('aria-pressed','false');
    await bob.locator('[data-room-row]').click();await expect(bob.locator('.room-thread')).toContainText('Habari za Kariakoo');
    expect(await bob.evaluate(id=>client.shoppingRoom('preferences',[id]),id)).toEqual({revision:'4',muted:false,archived:false});
    await alice.getByRole('button',{name:'Attach file',exact:true}).click();
    await alice.locator('input[type=file]').setInputFiles({name:'room-note.txt',mimeType:'text/plain',buffer:Buffer.from('Private room file contents')});
    await alice.locator('textarea[name=caption]').fill('Faili yetu');await alice.locator('dialog').getByRole('button',{name:'Send message',exact:true}).click();
    for(const page of [bob,eve]){await page.evaluate(()=>client.shoppingRoom('sync'));await expect(page.locator('.room-thread')).toContainText('room-note.txt',{timeout:15000});}
    await bob.getByRole('button',{name:'room-note.txt',exact:true}).click();await expect(bob.locator('dialog a[download]')).toHaveAttribute('download','room-note.txt');
    const fileId=await bob.evaluate(async id=>(await client.shoppingRoom('history',[id])).find(m=>m.message.startsWith('WINGA-MEDIA/')).id,id);
    expect(await bob.evaluate(async({id,fileId})=>(await client.shoppingRoom('downloadMedia',[id,fileId])).blob.text(),{id,fileId})).toBe('Private room file contents');
    await bob.locator('dialog').getByRole('button',{name:'Close chat',exact:true}).click();
    expect([...objects.values()].some(bytes=>bytes.includes(Buffer.from('Private room file contents')))).toBe(false);
    await alice.getByRole('tab',{name:'Products',exact:true}).click();await alice.getByRole('button',{name:'Share product',exact:true}).click();
    await alice.locator('input[name=query]').fill('Kariakoo');await alice.locator('dialog').getByRole('button',{name:'Search',exact:true}).click();
    await expect(alice.locator('.room-product-result')).toContainText('Kariakoo simu');await alice.locator('.room-product-result').getByRole('button',{name:'Share product',exact:true}).click();
    await expect(alice.locator('.room-product-item')).toContainText('850000');
    await bob.evaluate(()=>client.shoppingRoom('sync'));await bob.getByRole('tab',{name:'Products',exact:true}).click();await expect(bob.locator('.room-product-item')).toContainText('Kariakoo simu');
    await bob.locator('.room-product-item').getByRole('button',{name:'Shortlist',exact:true}).click();await bob.getByRole('tab',{name:'Shortlist',exact:true}).click();await expect(bob.locator('.room-product-item')).toHaveCount(1);
    await alice.getByRole('tab',{name:'Shortlist',exact:true}).click();await expect(alice.locator('.room-product-item')).toHaveCount(0);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM conversation_event_members WHERE conversation_id=(SELECT canonical_id FROM encrypted_conversations WHERE id=$1)',[id])).rows[0].n).toBe(3);
    await alice.getByRole('tab',{name:'Polls',exact:true}).click();await alice.getByRole('button',{name:'New poll',exact:true}).click();
    await alice.locator('input[name="question"]').fill('Tunachagua nini?');await alice.locator('textarea[name="options"]').fill('Simu\nLaptop');await alice.locator('dialog').getByRole('button',{name:'New poll',exact:true}).click();
    await bob.evaluate(()=>client.shoppingRoom('sync'));await bob.getByRole('tab',{name:'Polls',exact:true}).click();await expect(bob.locator('.room-poll')).toContainText('Tunachagua nini?');
    await bob.locator('.room-poll-option').filter({hasText:'Simu'}).locator('input').check();
    await expect.poll(()=>bob.evaluate(id=>client.shoppingRoom('board',[id]).then(board=>board.polls[0].options[0].votes),id)).toBe(1);
    for(const page of pages)await page.evaluate(()=>client.shoppingRoom('sync'));
    const boards=await Promise.all(pages.map(p=>p.evaluate(id=>client.shoppingRoom('board',[id]),id)));
    assertRoomBoards(boards);await expect(alice.locator('.room-poll-option').filter({hasText:'Simu'}).locator('strong')).toHaveText('1',{timeout:15000});
    await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-shopping-rooms-mobile.png'),fullPage:true});
    await alice.setViewportSize({width:1280,height:900});await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-shopping-rooms-desktop.png'),fullPage:true});
    const overflow=await alice.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
    await alice.setViewportSize({width:390,height:844});await alice.getByRole('tab',{name:'Chats',exact:true}).click();
    await expect(alice.locator('.room-thread')).toContainText('Faili yetu');
    await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-shopping-rooms-chat.png'),fullPage:true});
    expect(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await alice.evaluate(()=>{document.documentElement.dir='rtl';document.documentElement.lang='ar';});
    expect(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await alice.evaluate(()=>{document.documentElement.dir='ltr';document.documentElement.lang='en';});
    await alice.locator('textarea[name=message]').fill('long-word-'+ 'x'.repeat(700));await alice.getByRole('button',{name:'Send message',exact:true}).click();
    await bob.evaluate(()=>client.shoppingRoom('sync'));await bob.getByRole('tab',{name:'Chats',exact:true}).click();
    await expect(bob.locator('.room-thread')).toContainText('long-word-');await bob.setViewportSize({width:390,height:844});
    expect(await bob.locator('.room-thread').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await bob.locator('.room-thread').evaluate(el=>{el.scrollTop=0;});
    await alice.locator('textarea[name=message]').fill('Keep the reader in place');await alice.getByRole('button',{name:'Send message',exact:true}).click();
    await bob.evaluate(()=>client.shoppingRoom('sync'));await expect(bob.locator('.room-thread')).toContainText('Keep the reader in place');
    expect(await bob.locator('.room-thread').evaluate(el=>el.scrollTop)).toBeLessThan(5);
    for(const page of pages)await page.evaluate(()=>client.shoppingRoom('sync'));
    await alice.getByRole('button',{name:'Room members',exact:true}).click();
    expect(await alice.locator('.room-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await alice.locator('.room-members-list li').filter({hasText:'eve'}).getByRole('button',{name:'Remove',exact:true}).click();
    await alice.locator('dialog').last().getByRole('button',{name:'Remove',exact:true}).click();
    await expect(alice.locator('dialog')).toHaveCount(0);
    await bob.evaluate(()=>client.shoppingRoom('sync'));
    // Retained pinned members reconcile removal without a new-admission prompt.
    const reconciled=await bob.evaluate(()=>client.shoppingRoom('sync'));
    expect(reconciled[0].clientError).toBeUndefined();expect(retainedMembership(reconciled)).toBe(true);
    for(const page of [alice,bob])await page.evaluate(()=>client.shoppingRoom('sync'));
    await expect(alice.locator('textarea[name=message]')).toBeVisible({timeout:15000});
    await alice.locator('textarea[name=message]').fill('Retained members only');await alice.getByRole('button',{name:'Send message',exact:true}).click();
    const retained=await bob.evaluate(()=>client.shoppingRoom('sync'));expect(retained[0].clientError).toBeUndefined();
    await bob.getByRole('tab',{name:'Chats',exact:true}).click();await expect(bob.locator('.room-thread')).toContainText('Retained members only',{timeout:15000});
    await eve.evaluate(()=>client.shoppingRoom('sync'));await expect(eve.locator('[data-room-detail]')).toContainText('Access ended',{timeout:15000});
    await expect(eve.evaluate(({id,fileId})=>client.shoppingRoom('downloadMedia',[id,fileId]),{id,fileId})).rejects.toThrow();
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch=$2',[id,'1'])).rows[0].n).toBe(3);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch=$2',[id,'2'])).rows[0].n).toBe(2);
    const plain=(await db.query(`SELECT COUNT(*)::int AS n FROM messages WHERE message LIKE '%Kariakoo%'`)).rows[0].n;expect(plain).toBe(0);
    await alice.getByRole('button',{name:'Settings',exact:true}).click();await alice.getByRole('button',{name:'Leave chatroom',exact:true}).click();
    await alice.locator('dialog').last().getByRole('button',{name:'Leave chatroom',exact:true}).click();
    await expect(alice.locator('dialog').last().locator('[data-room-error]')).toHaveText('Transfer admin before leaving.');
    await alice.keyboard.press('Escape');await expect(alice.locator('.room-dialog')).toHaveCount(1);
    await alice.keyboard.press('Escape');await expect(alice.locator('.room-dialog')).toHaveCount(0);
    console.log('room-lifecycle: last-admin guard verified, confirmations closed');
    await alice.getByRole('button',{name:'Room members',exact:true}).click({timeout:10000});
    await alice.locator('.room-members-list li').filter({hasText:'bob'}).getByRole('button',{name:'Transfer admin',exact:true}).click({timeout:10000});
    await expect(alice.locator('dialog').last()).toContainText('You will become a member');
    await expect(alice.locator('dialog').last().getByRole('button',{name:'Transfer admin',exact:true})).toBeEnabled();
    expect(await alice.locator('dialog').last().evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-room-admin-transfer-390.png'),fullPage:true});
    await alice.setViewportSize({width:1280,height:900});
    await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-room-admin-transfer-1280.png'),fullPage:true});
    await alice.locator('dialog').last().getByRole('button',{name:'Transfer admin',exact:true}).click();
    await expect(alice.locator('dialog')).toHaveCount(0);
    console.log('room-lifecycle: admin handoff submitted');
    for(let n=0;n<2;n++)for(const p of [bob,alice])await p.evaluate(()=>client.shoppingRoom('sync'));
    await expect.poll(async()=>(await db.query('SELECT epoch FROM encrypted_conversations WHERE id=$1',[id])).rows[0].epoch).toBe('3');
    console.log('room-lifecycle: admin handoff accepted');
    await alice.getByRole('button',{name:'Settings',exact:true}).click();await alice.getByRole('button',{name:'Leave chatroom',exact:true}).click();
    await expect(alice.locator('dialog').last()).toContainText('business obligations will not be deleted');
    await alice.locator('dialog').last().getByRole('button',{name:'Leave chatroom',exact:true}).click();
    for(let n=0;n<2;n++)await bob.evaluate(()=>client.shoppingRoom('sync'));
    await expect.poll(async()=>(await db.query('SELECT epoch FROM encrypted_conversations WHERE id=$1',[id])).rows[0].epoch).toBe('4');
    await expect(alice.locator('[data-room-detail]')).toContainText('Access ended',{timeout:15000});
    await expect(alice.locator('[data-room-detail]')).toContainText('Habari za Kariakoo');
    await expect(alice.locator('textarea[name=message]')).toHaveCount(0);
    const remaining=(await bob.evaluate(()=>client.shoppingRoom('sync')))[0];expect(JSON.parse(JSON.parse(remaining.transition.intent).roles)).toEqual([{owner:'bob',role:'admin'}]);
    await bob.getByRole('button',{name:'Settings',exact:true}).click();await bob.getByRole('button',{name:'Leave chatroom',exact:true}).click();
    await bob.locator('dialog').last().getByRole('button',{name:'Leave chatroom',exact:true}).click();
    await expect(bob.locator('[data-room-detail]')).toContainText('Access ended');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM conversation_event_members WHERE conversation_id=(SELECT canonical_id FROM encrypted_conversations WHERE id=$1)',[id])).rows[0].n).toBe(0);
  }finally{for(const c of contexts)await c.close().catch(()=>{});roomsEnabled=false;}
});
function assertRoomBoards(boards){for(const board of boards){expect(board.polls).toHaveLength(1);expect(board.polls[0].options[0].votes).toBe(1);}}
function retainedMembership(rooms){return rooms[0]?.transition?.status==='accepted'&&!rooms[0].clientError;}

test('spec 180 and 181 compare canonical products and relay an outside seller signed encrypted response without Room access',async({browser})=>{
  test.setTimeout(180000);await resetStores(false,true);
  const contexts=await Promise.all(Array.from({length:4},()=>browser.newContext({viewport:{width:390,height:844}})));
  try{
    const pages=await Promise.all(contexts.map(c=>c.newPage())),[alice,bob,eve,seller]=pages;
    for(const [i,p]of pages.entries()){
      p.on('response',async r=>{if(r.url().includes('/api/')&&!r.ok())console.log('seller-http',i,r.request().postData()?.startsWith('{')?r.request().postDataJSON()?.action:null,r.status(),(await r.json().catch(()=>({}))).code);});
      await p.goto(origin);for(const url of ['/rich.js','/rich-ui.js','/room-session.js','/rooms-ui.js'])await p.addScriptTag({url:origin+url});
      await p.evaluate(name=>start(name),['alice','bob','eve','outside-seller'][i]);
      await p.evaluate(()=>{window.nativeOperation=async(action,payload)=>{const device=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>browserSession,
        request:async signed=>{const r=await fetch('/api/conversations/crypto/devices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signed)});return r.json();}});
        const op=await device.signCryptoOperation(action,payload);const r=await fetch('/api/conversations/encrypted/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)});return {status:r.status,body:await r.json()};};});
    }
    const id=await alice.evaluate(async()=>{const selected=await client.shoppingRoom('inspectOwners',[['bob','eve']]);return client.shoppingRoom('create',['Private Shopping',selected]);});
    for(const p of [bob,eve])await p.evaluate(id=>client.shoppingRoom('join',[id]),id);
    for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    for(const productId of [roomCatalogProduct.id,roomSecondProduct.id])await alice.evaluate(({id,productId})=>client.shoppingRoom('command',[id,'product-share',{productId,note:'private Room note',snapshot:null}]),{id,productId});
    for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    const board=await alice.evaluate(id=>client.shoppingRoom('board',[id]),id),shareId=board.products[0].shareId;
    console.log('seller-flow: native Room activated, canonical products shared');
    await alice.evaluate(()=>{
      window.renderRoomUi=()=>{
      const ui=WingaModules.chat.createChatUiModule({escapeHtml:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        getCurrentUser:()=>browserSession.username,getCurrentSession:()=>browserSession,getConversationSummaries:()=>[],getActiveChatContext:()=>null,
        getCurrentMessageDraft:()=>'',getConversationsView:()=> 'rooms',getProfileMessagesMode:()=> 'list',getProfileMessagesFilter:()=> 'all',
        getUserDisplayName:v=>v,getMarketplaceUser:()=>null,getProductById:()=>null,getActiveConversationMessages:()=>[],getUnreadNotifications:()=>[]});
      document.querySelector('main').innerHTML=ui.renderMessagesSection();WingaShoppingRoomsUi.bind(document.querySelector('.conversation-workspace'),{dataLayer:client,getSession:()=>browserSession});};renderRoomUi();
    });
    await alice.locator('[data-room-row]').click();await alice.getByRole('tab',{name:'Products',exact:true}).click();
    await expect(alice.locator('.room-product-item')).toHaveCount(2);
    await alice.getByRole('checkbox',{name:'Compare Kariakoo simu'}).check();await alice.getByRole('checkbox',{name:'Compare Laptop'}).check();
    await alice.getByRole('button',{name:'Compare products',exact:true}).click();
    console.log('seller-flow: comparison controls opened');
    await expect(alice.locator('[data-compare-attribute=sizes]')).toHaveText(['Not provided','Not provided']);
    await expect(alice.locator('[data-compare-attribute=price]')).toHaveText(['850,000 TZS','950,000 TZS']);
    for(const width of [390,1280]){await alice.setViewportSize({width,height:844});expect(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-room-comparison-'+width+'.png'),fullPage:true});}
    await alice.evaluate(()=>{document.documentElement.dir='rtl';});expect(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await alice.evaluate(()=>{document.documentElement.dir='ltr';});await alice.locator('dialog').getByRole('button',{name:'Close chat'}).click();
    await expect(alice.evaluate(({id,shareId})=>client.seller('ask',[id,shareId,'Does it have size M?', 'room-fixture-product','outside-seller',false]),{id,shareId})).rejects.toThrow('room_seller_consent_required');
    await alice.locator('.room-product-item').first().getByRole('button',{name:'Ask seller'}).click();
    await alice.locator('textarea[name=seller-question]').fill('Does it have size M?');await expect(alice.locator('dialog').getByRole('button',{name:'Send message'})).toBeDisabled();
    await alice.locator('dialog input[type=checkbox]').check();await alice.locator('dialog').getByRole('button',{name:'Send message'}).click();
    await expect(alice.locator('[data-room-error]')).toHaveText('Seller chat encryption is not ready.');
    await alice.locator('dialog').getByRole('button',{name:'Close chat'}).click();
    const pending=await alice.evaluate(()=>client.seller('pending'));expect(pending).toHaveLength(1);const questionId=pending[0].id;
    console.log('seller-flow: consent and pre-encryption draft saved');
    const ai=await alice.evaluate(()=>client.inspectEncryptedConversation('outside-seller')),si=await seller.evaluate(()=>client.inspectEncryptedConversation('alice'));
    const sd=(await db.query("SELECT id FROM conversation_crypto_devices WHERE owner_id='outside-seller' AND status='active'")).rows[0].id,
      ad=(await db.query("SELECT id FROM conversation_crypto_devices WHERE owner_id='alice' AND status='active'")).rows[0].id;
    await alice.evaluate(({id,fp})=>client.enableEncryptedConversation('outside-seller',id,fp),{id:sd,fp:si.ownFingerprint});
    await seller.evaluate(({id,fp})=>client.enableEncryptedConversation('alice',id,fp),{id:ad,fp:ai.ownFingerprint});
    console.log('seller-flow: direct native fingerprints verified');
    loseSellerQuestion=true;await expect(alice.evaluate(id=>client.seller('resume',[id]),questionId)).rejects.toThrow();expect(loseSellerQuestion).toBe(false);
    await alice.evaluate(id=>client.seller('resume',[id]),questionId);await alice.evaluate(id=>client.seller('resume',[id]),questionId);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages WHERE id=$1',[questionId])).rows[0].n).toBe(1);
    await seller.evaluate(()=>client.loadConversationPage('alice'));
    console.log('seller-flow: exact retried question decrypted by seller');
    const directId=(await db.query('SELECT direct_id FROM encrypted_room_seller_questions WHERE id=$1',[questionId])).rows[0].direct_id;
    const read=await seller.evaluate(({questionId,directId})=>nativeOperation('seller-question-read',{id:questionId,conversationId:directId}),{questionId,directId});
    expect(read.status).toBe(200);expect(JSON.stringify(read.body)).not.toContain(id);expect(JSON.stringify(read.body)).not.toContain('Private Shopping');
    expect(read.body.question).toEqual({id:questionId,productId:roomCatalogProduct.id,buyerId:'alice',sellerId:'outside-seller',questionHash:expect.any(String)});
    expect((await seller.evaluate(({questionId,id})=>nativeOperation('seller-evidence',{id:questionId,conversationId:id}),{questionId,id})).status).toBe(403);
    expect(await seller.evaluate(()=>client.shoppingRoom('list'))).toHaveLength(0);
    expect((await bob.evaluate(({questionId,directId})=>nativeOperation('seller-answer-register',{id:questionId,conversationId:directId,messageId:questionId,answerHash:'a'.repeat(64)}),{questionId,directId})).status).toBe(403);
    seller.on('console',m=>{if(m.text().startsWith('seller-native'))console.log(m.text());});
    await seller.evaluate(async()=>{const messages=await render();WingaRichUi.bind(document,{peer:'alice',dataLayer:client,getSession:()=>browserSession,refresh:render,getMessages:()=>messages,actions:{onError:code=>console.log('seller-native',code)}});});
    await seller.getByRole('button',{name:'Respond',exact:true}).click();await seller.locator('dialog textarea').fill('Yes, size M is available.');
    await expect(seller.locator('dialog').getByRole('button',{name:'Respond',exact:true})).toBeDisabled();await seller.locator('dialog input[type=checkbox]').check();
    loseSellerAnswer=true;await seller.locator('dialog').getByRole('button',{name:'Respond',exact:true}).click();
    await expect(seller.locator('dialog [role=status]')).toContainText('action failed');
    await seller.locator('dialog').getByRole('button',{name:'Respond',exact:true}).click();await expect(seller.locator('dialog')).toHaveCount(0);
    const answerId=(await db.query('SELECT message_id FROM encrypted_room_seller_answers WHERE question_id=$1',[questionId])).rows[0].message_id;
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_room_seller_answers')).rows[0].n).toBe(1);
    const changed=await seller.evaluate(({questionId,directId,answerId})=>nativeOperation('seller-answer-register',{id:questionId,conversationId:directId,messageId:answerId,answerHash:'a'.repeat(64)}),{questionId,directId,answerId});expect(changed.status).toBe(409);
    const missing=await seller.evaluate(({questionId,directId})=>nativeOperation('seller-answer-register',{id:questionId,conversationId:directId,messageId:crypto.randomUUID(),answerHash:'b'.repeat(64)}),{questionId,directId});expect(missing.status).toBe(409);
    await alice.evaluate(()=>client.loadConversationPage('outside-seller'));
    await expect(alice.evaluate(answerId=>client.seller('share',['outside-seller',answerId,false]),answerId)).rejects.toThrow('room_seller_consent_required');
    tamperSellerEvidence=true;await expect(alice.evaluate(answerId=>client.seller('share',['outside-seller',answerId,true]),answerId)).rejects.toThrow('mls_receipt_rejected');tamperSellerEvidence=false;
    await alice.evaluate(async()=>{window.peer='outside-seller';document.querySelector('main').innerHTML='<div data-chat-read-user="outside-seller"></div><form class="messages-compose"><div class="chat-compose-footer"></div></form>';
      const messages=await render();WingaRichUi.bind(document,{peer:'outside-seller',dataLayer:client,getSession:()=>browserSession,getPeer:()=>window.peer,refresh:render,getMessages:()=>messages});});
    await alice.getByRole('button',{name:'Share response to room',exact:true}).click();await expect(alice.locator('dialog')).toContainText('Yes, size M is available.');
    await expect(alice.locator('dialog').getByRole('button',{name:'Share response to room',exact:true})).toBeDisabled();await alice.locator('dialog input[type=checkbox]').check();
    await alice.locator('dialog').getByRole('button',{name:'Share response to room',exact:true}).click();await expect(alice.locator('dialog')).toHaveCount(0);
    await alice.evaluate(answerId=>client.seller('share',['outside-seller',answerId,true]),answerId);
    for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    for(const p of [alice,bob,eve])expect((await p.evaluate(id=>client.shoppingRoom('board',[id]),id)).sellerQuestions[0].answer.text).toBe('Yes, size M is available.');
    await bob.evaluate(({id,questionId,answerId})=>client.shoppingRoom('command',[id,'seller-response',{questionId,answerId,answer:'Forged seller answer'}]),{id,questionId,answerId});
    await bob.evaluate(({id,questionId,shareId})=>client.shoppingRoom('command',[id,'seller-question',{questionId,shareId,productId:'room-fixture-product',sellerId:'outside-seller',question:'Forged question'}]),{id,questionId,shareId});
    for(const p of [alice,bob,eve])await p.evaluate(()=>client.shoppingRoom('sync'));
    for(const p of [alice,bob,eve]){const board=await p.evaluate(id=>client.shoppingRoom('board',[id]),id);expect(board.sellerQuestions).toHaveLength(1);expect(board.sellerQuestions[0].answer.text).toBe('Yes, size M is available.');expect(board.rejected.length).toBe(2);}
    await alice.evaluate(()=>renderRoomUi());await alice.getByRole('tab',{name:'Products',exact:true}).click();
    await expect(alice.locator('.room-seller-card')).toContainText('Yes, size M is available.',{timeout:15000});
    await alice.setViewportSize({width:390,height:844});await alice.screenshot({path:path.resolve(__dirname,'../../.tmp-room-seller-response.png'),fullPage:true});
    await expect(db.query(`UPDATE encrypted_room_seller_answers SET answer_hash=$1`,['0'.repeat(64)])).rejects.toThrow();
    const stored=JSON.stringify((await db.query('SELECT * FROM encrypted_room_seller_questions')).rows)+JSON.stringify((await db.query('SELECT * FROM encrypted_room_seller_answers')).rows);
    expect(stored).not.toContain('Does it have');expect(stored).not.toContain('size M is available');
    await db.exec('CREATE TABLE schema_migrations(migration_id TEXT PRIMARY KEY)');const {verifyRoomSellerRequests,migrationId}=require('../../backend/verify-room-seller-requests');
    await db.query('INSERT INTO schema_migrations VALUES($1)',[migrationId]);const ready=await verifyRoomSellerRequests(db);expect(ready.ok).toBe(true);expect(ready.authenticatedSellerFlowVerified).toBe(false);
    await db.query("INSERT INTO user_blocks VALUES('alice','outside-seller')");
    expect((await seller.evaluate(({questionId,directId})=>nativeOperation('seller-question-read',{id:questionId,conversationId:directId}),{questionId,directId})).status).toBe(403);
    await expect(alice.evaluate(answerId=>client.seller('share',['outside-seller',answerId,true]),answerId)).rejects.toThrow('encrypted_access_denied');
    await db.query("DELETE FROM user_blocks WHERE blocker_username='alice' AND blocked_username='outside-seller'");
    await db.query("INSERT INTO user_blocks VALUES('bob','alice')");
    expect((await bob.evaluate(({questionId,id})=>nativeOperation('seller-evidence',{id:questionId,conversationId:id}),{questionId,id})).status).toBe(403);
  }finally{for(const c of contexts)await c.close().catch(()=>{});roomsEnabled=false;loseNextSend=false;loseSellerAnswer=false;loseSellerQuestion=false;tamperSellerEvidence=false;}
});

test('production session admits a third approved native device and converges encrypted messages and receipts',async({browser})=>{
  test.setTimeout(120000);await resetStores(true);
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  try {
    const [alice,bob,sibling]=await Promise.all(contexts.map(c=>c.newPage()));for(const p of [alice,bob,sibling])await p.goto(origin);
    const legacyBefore=(await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n;
    const ai=await alice.evaluate(()=>start('alice')),bi=await bob.evaluate(()=>start('bob'));
    const bobDevice=(await db.query("SELECT id FROM conversation_crypto_devices WHERE owner_id='bob'")).rows[0].id;
    const aliceDevice=(await db.query("SELECT id FROM conversation_crypto_devices WHERE owner_id='alice'")).rows[0].id;
    await alice.evaluate(({id,fp})=>client.enableEncryptedConversation('bob',id,fp),{id:bobDevice,fp:bi.ownFingerprint});
    await bob.evaluate(({id,fp})=>client.enableEncryptedConversation('alice',id,fp),{id:aliceDevice,fp:ai.ownFingerprint});
    await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));
    const historicFile=await alice.evaluate(()=>client.sendEncryptedMedia('bob',new File(['Historic encrypted document'],'historic.txt',{type:'text/plain'}),'Historic file'));
    await bob.evaluate(()=>render());await alice.evaluate(()=>render());
    const historicIncoming=await bob.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'alice',message:'Prior epoch incoming',messageType:'text'})));
    await alice.evaluate(()=>render());await bob.evaluate(()=>render());
    const historyKit=await alice.evaluate(async()=>{
      const session=await client.createEncryptedRecovery();try{const key=session.generateKey();return await session.backup(key);}finally{session.close();}
    });
    await expect(sibling.evaluate(()=>start('alice'))).rejects.toThrow();
    const next=(await db.query("SELECT id,fingerprint FROM conversation_crypto_devices WHERE owner_id='alice' AND status='pending'")).rows[0];
    expect(next).toBeTruthy();
    await alice.evaluate(async({id,fp})=>{const m=await client.createCryptoDeviceManagement();try{return await m.manage('approve',id,fp);}finally{m.close();}},{id:next.id,fp:next.fingerprint});
    await sibling.reload();await sibling.evaluate(()=>{
      const create=WingaEncryptedVault.createEncryptedVault;
      WingaEncryptedVault.createEncryptedVault=async options=>{const vault=await create(options),write=vault.write;
        vault.write=async change=>{if(window.syncConflictsRemaining>0&&Object.keys(change.values||{}).some(key=>key.startsWith('mls:group:'))){
          window.syncConflictsRemaining--;window.syncConflictsObserved++;throw Object.assign(new Error('crypto_vault_revision_conflict'),{code:'crypto_vault_revision_conflict'});}
          return write(change);};return vault;};
    });await sibling.evaluate(()=>start('alice'));
    await alice.locator('[data-chat-security]').click();
    const add=alice.locator('dialog form').filter({has:alice.getByRole('button',{name:'Add chat device',exact:true})});
    await add.locator('select').selectOption(next.id);await add.locator('input').fill(next.fingerprint);
    for(const width of [390,1440]) {
      await alice.setViewportSize({width,height:844});
      expect(await alice.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await alice.screenshot({path:`test-results/encrypted-device-admission-${width}.png`});
    }
    loseDeviceTransfer=true;await add.getByRole('button',{name:'Add chat device',exact:true}).click();
    await expect(alice.locator('dialog [role=status]')).toContainText('Waiting for every chat device');
    await alice.getByRole('button',{name:'Close',exact:true}).click();
    await alice.reload();await alice.evaluate(()=>start('alice'));
    expect((await db.query('SELECT epoch FROM encrypted_conversations')).rows[0].epoch).toBe('1');
    await expect(bob.evaluate(()=>client.sendMessage({receiverId:'alice',clientMessageId:crypto.randomUUID(),message:'must remain frozen',messageType:'text'}))).rejects.toThrow('encrypted_membership_pending');
    const info=await bob.evaluate(()=>client.inspectEncryptedConversation('alice'));expect(info.status).toBe('device-pending');
    expect(info.verificationPackages.map(p=>p.deviceId)).toContain(next.id);
    await bob.evaluate(({id,fp})=>client.verifyEncryptedConversationAdmission('alice',{[id]:fp}),{id:next.id,fp:next.fingerprint});
    await sibling.evaluate(fps=>client.verifyEncryptedConversationAdmission('bob',fps),{[aliceDevice]:ai.ownFingerprint,[bobDevice]:bi.ownFingerprint});
    await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));
    for(const page of [alice,bob,sibling])expect((await page.evaluate(()=>client.inspectEncryptedConversation(peer))).status).toBe('active');
    const collision=await bob.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'alice',message:'CAS guarded incoming',messageType:'text'})));
    await sibling.evaluate(()=>{window.syncConflictsRemaining=2;window.syncConflictsObserved=0;});
    const afterConflict=await sibling.evaluate(()=>render());
    expect(afterConflict.filter(m=>m.id===collision.id)).toHaveLength(1);
    expect(await sibling.evaluate(()=>window.syncConflictsObserved)).toBe(2);
    const bounded=await bob.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'alice',message:'Bounded sync retry',messageType:'text'})));
    await sibling.evaluate(()=>{window.syncConflictsRemaining=3;window.syncConflictsObserved=0;});
    await expect(sibling.evaluate(()=>render())).rejects.toThrow('crypto_vault_revision_conflict');
    expect(await sibling.evaluate(()=>window.syncConflictsObserved)).toBe(3);
    expect((await sibling.evaluate(()=>render())).filter(m=>m.id===bounded.id)).toHaveLength(1);
    await expect.poll(async()=>{
      await alice.evaluate(()=>render());const rows=await sibling.evaluate(()=>render());return rows.some(m=>m.id===historicFile.id)&&rows.some(m=>m.id===historicIncoming.id);
    },{timeout:30000}).toBe(true);
    await sibling.bringToFront();await sibling.evaluate(id=>client.markConversationRead({withUser:'bob',messageIds:[id]}),historicIncoming.id);
    for(const page of [alice,bob])expect((await page.evaluate(()=>render())).find(m=>m.id===historicIncoming.id).status).toBe('read');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts WHERE message_id=$1 AND device_id=$2',[historicIncoming.id,next.id])).rows[0].n).toBe(0);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_archive_reads WHERE message_id=$1',[historicIncoming.id])).rows[0].n).toBe(1);
    await sibling.evaluate(async kit=>{const session=await client.createEncryptedRecovery();try{return await session.restore(kit);}finally{session.close();}},historyKit);
    expect(await sibling.evaluate(async id=>(await client.downloadEncryptedMedia(id)).blob.text(),historicFile.id)).toBe('Historic encrypted document');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_media_archive_grants')).rows[0].n).toBe(1);
    expect((await db.query("SELECT COUNT(*)::int AS n FROM encrypted_conversation_epoch_devices WHERE epoch='1'")).rows[0].n).toBe(2);
    const sent=await alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'Three-device encrypted convergence',messageType:'text'})));
    const copy=(await sibling.evaluate(()=>render())).find(m=>m.id===sent.id);expect(copy.message).toBe('Three-device encrypted convergence');expect(copy.status).toBe('sent');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_sync_acks')).rows[0].n).toBe(1);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts WHERE message_id=$1',[sent.id])).rows[0].n).toBe(0);
    await bob.evaluate(()=>render());for(const page of [alice,sibling])expect((await page.evaluate(()=>render())).find(m=>m.id===sent.id).status).toBe('delivered');
    await bob.bringToFront();await bob.evaluate(id=>client.markConversationRead({withUser:'alice',messageIds:[id]}),sent.id);
    for(const page of [alice,sibling])expect((await page.evaluate(()=>render())).find(m=>m.id===sent.id).status).toBe('read');
    await sibling.reload();await sibling.evaluate(()=>start('alice'));expect((await sibling.evaluate(()=>render())).filter(m=>m.id===sent.id)).toHaveLength(1);
    const reverse=await sibling.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'Sent by second native endpoint',messageType:'text'})));
    expect((await bob.evaluate(()=>render())).find(m=>m.id===reverse.id).message).toBe('Sent by second native endpoint');
    expect((await alice.evaluate(()=>render())).find(m=>m.id===reverse.id).message).toBe('Sent by second native endpoint');
    await alice.locator('[data-chat-security]').click();
    const remove=alice.locator('dialog form').filter({has:alice.getByRole('button',{name:'Remove chat device',exact:true})});
    await remove.getByLabel('Manage chat device').selectOption(next.id);
    for(const width of [390,1440]) {
      await alice.setViewportSize({width,height:844});
      expect(await alice.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await alice.screenshot({path:`test-results/encrypted-device-removal-${width}.png`});
    }
    loseDeviceTransfer=true;await remove.getByRole('button',{name:'Remove chat device',exact:true}).click();
    await expect(alice.locator('dialog [role=status]')).toContainText('Waiting for every chat device');
    await alice.getByRole('button',{name:'Close',exact:true}).click();
    await alice.reload();await alice.evaluate(()=>start('alice'));
    await bob.evaluate(()=>client.inspectEncryptedConversation('alice'));
    await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));
    expect((await bob.evaluate(()=>client.inspectEncryptedConversation('alice'))).status).toBe('active');
    expect((await db.query('SELECT epoch FROM encrypted_conversations')).rows[0].epoch).toBe('3');
    await expect(sibling.evaluate(()=>client.sendMessage({receiverId:'bob',clientMessageId:crypto.randomUUID(),message:'removed endpoint',messageType:'text'}))).rejects.toThrow();
    await expect(sibling.evaluate(id=>client.downloadEncryptedMedia(id),historicFile.id)).rejects.toThrow();
    const afterRemove=await alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'Retained devices only',messageType:'text'})));
    expect((await bob.evaluate(()=>render())).find(m=>m.id===afterRemove.id).message).toBe('Retained devices only');
    expect((await sibling.evaluate(()=>render())).some(m=>m.id===afterRemove.id)).toBe(false);
    expect(JSON.stringify((await db.query('SELECT * FROM encrypted_conversation_messages')).rows)).not.toContain('Three-device encrypted convergence');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n).toBe(legacyBefore);
  } finally {for(const c of contexts)await c.close();multiDeviceEnabled=false;}
});
test('offline encrypted recipient resumes all missed canonical messages once and incompatible protocol fails without plaintext downgrade',async({browser})=>{
  test.setTimeout(120000);await resetStores();
  const a=await browser.newContext(),b=await browser.newContext();
  const minimum=process.env.WINGA_CONVERSATION_MIN_PROTOCOL;
  const legacyBefore=(await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n;
  try {
    const alice=await a.newPage(),bob=await b.newPage();await alice.goto(origin);await bob.goto(origin);
    const ai=await alice.evaluate(()=>start('alice')),bi=await bob.evaluate(()=>start('bob'));
    const natives=(await db.query('SELECT owner_id,id FROM conversation_crypto_devices')).rows;
    await alice.evaluate(({id,fp})=>client.enableEncryptedConversation('bob',id,fp),{id:natives.find(d=>d.owner_id==='bob').id,fp:bi.ownFingerprint});
    await bob.evaluate(({id,fp})=>client.enableEncryptedConversation('alice',id,fp),{id:natives.find(d=>d.owner_id==='alice').id,fp:ai.ownFingerprint});
    await alice.evaluate(()=>client.inspectEncryptedConversation('bob'));
    await b.setOffline(true);
    const accepted=[];
    for(let n=0;n<3;n++)accepted.push(await alice.evaluate(async n=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'Missed encrypted '+n,messageType:'text'})),n));
    expect(accepted.every(message=>message.status==='sent')).toBe(true);
    expect((await alice.evaluate(()=>render())).map(message=>message.status)).toEqual(['sent','sent','sent']);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_receipts')).rows[0].n).toBe(0);
    const stored=(await db.query('SELECT id,sequence,ciphertext FROM encrypted_conversation_messages ORDER BY sequence')).rows;
    expect(stored.map(message=>String(message.sequence))).toEqual(['1','2','3']);
    expect(JSON.stringify(stored)).not.toContain('Missed encrypted');
    await b.setOffline(false);await bob.reload();await bob.evaluate(()=>start('bob'));
    const received=await bob.evaluate(()=>render());
    expect(received.map(message=>message.id)).toEqual(accepted.map(message=>message.id));
    expect(received.map(message=>message.message)).toEqual(['Missed encrypted 0','Missed encrypted 1','Missed encrypted 2']);
    expect((await bob.evaluate(()=>render())).map(message=>message.id)).toEqual(accepted.map(message=>message.id));
    expect((await alice.evaluate(()=>render())).map(message=>message.status)).toEqual(['delivered','delivered','delivered']);
    await bob.evaluate(ids=>client.markConversationRead({withUser:'alice',messageIds:ids}),accepted.map(message=>message.id));
    expect((await alice.evaluate(()=>render())).map(message=>message.status)).toEqual(['read','read','read']);
    // Do not reopen the protocol gate while this deliberately rejected local intent is retained.
    process.env.WINGA_CONVERSATION_MIN_PROTOCOL='2';
    await expect(alice.evaluate(()=>client.inspectEncryptedConversation('bob'))).rejects.toThrow('conversation_upgrade_required');
    await expect(alice.evaluate(()=>client.sendMessage({clientMessageId:crypto.randomUUID(),receiverId:'bob',message:'must not downgrade obsolete protocol',messageType:'text'}))).rejects.toThrow('conversation_upgrade_required');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(3);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n).toBe(legacyBefore);
  }finally {
    if(minimum===undefined)delete process.env.WINGA_CONVERSATION_MIN_PROTOCOL;else process.env.WINGA_CONVERSATION_MIN_PROTOCOL=minimum;
    await a.close();await b.close();
  }
});

test('HttpOnly cookie-only sessions support server membership, ciphertext-only HTTP, chat, receipts, reload and exact retry',async({browser})=>{
  await resetStores();
  test.setTimeout(120000);
  const a=await browser.newContext(),b=await browser.newContext();
  try {
    const alice=await a.newPage(),bob=await b.newPage();await alice.goto(origin);await bob.goto(origin);
    await test.step('a temporary crypto script outage retries without page reload or plaintext fallback',async()=>{
      await alice.route('**/vendor/winga-mls-candidate.js',route=>route.fulfill({status:503,contentType:'text/plain',body:'temporarily unavailable'}),{times:1});
      await expect(alice.evaluate(()=>start('alice'))).rejects.toThrow('mls_runtime_unavailable');
      expect((await db.query('SELECT COUNT(*)::int AS n FROM conversation_crypto_devices')).rows[0].n).toBe(0);
    });
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
    await test.step('deferred inbox startup cannot downgrade pending encrypted membership to plaintext',async()=>{
      const legacyBefore=(await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n;
      await bob.reload();await bob.evaluate(()=>start('bob',{inspect:false}));
      await expect(bob.evaluate(()=>client.sendMessage({receiverId:'alice',message:'Pending encrypted chat must not use plaintext'}))).rejects.toThrow('encrypted_membership_required');
      expect((await db.query('SELECT COUNT(*)::int AS n FROM messages')).rows[0].n).toBe(legacyBefore);
      expect((await db.query('SELECT COUNT(*)::int AS n FROM messages WHERE message=$1',['Pending encrypted chat must not use plaintext'])).rows[0].n).toBe(0);
    });
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
    const deviceAcks=(await db.query(`SELECT receipt_device,observer_device,proof FROM encrypted_conversation_receipt_acks
      WHERE message_id=$1 ORDER BY kind`,[sent.id])).rows;
    expect(deviceAcks).toHaveLength(2);
    for(const ack of deviceAcks){expect(ack.proof.payload.receiptDeviceId).toBe(ack.receipt_device);expect(ack.proof.actorId).toBe(ack.observer_device);}
    expect((await db.query('SELECT sender_ack_at FROM encrypted_conversation_receipts WHERE message_id=$1',[sent.id])).rows.every(r=>r.sender_ack_at===null)).toBe(true);
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
      const image=await require('sharp')({create:{width:160,height:120,channels:3,background:'#259a67'}}).png().toBuffer();
      await alice.locator('.messages-compose input[type=file]').setInputFiles({name:'offline-private.png',mimeType:'image/png',buffer:image});
      await alice.locator('dialog textarea').fill('Offline encrypted file caption');await alice.getByRole('button',{name:'Send encrypted file'}).click();await expect(alice.locator('dialog')).toHaveCount(0);
      const staged=await alice.evaluate(async()=>{const v=await WingaEncryptedVault.createEncryptedVault({owner:'alice',getSession:()=>({username:'alice',sessionId:'a',token:'a'})});try{const job=Object.entries((await v.snapshot()).values).find(([k])=>k.startsWith('media:pending:'))[1];return {id:job.id,object:job.attachment.object,bytes:Array.from(job.ciphertext)};}finally{v.close();}});
      expect(objects.size).toBe(1);await a.setOffline(false);await alice.reload();await alice.evaluate(()=>start('alice'));await alice.evaluate(()=>render());await bob.evaluate(()=>render());
      expect(objects.size).toBe(2);expect([...objects.values()].some(bytes=>bytes.equals(Buffer.from(staged.bytes)))).toBe(true);
      await expect(bob.locator('[data-encrypted-media-download]')).toHaveCount(2);
      expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(5);
      await bob.evaluate(()=>WingaEncryptedMediaUi.bindDownloads(document,{dataLayer:client}));
      for(const width of [390,1440]) {
        await bob.setViewportSize({width,height:844});
        await bob.locator('[data-encrypted-media-preview]').last().click();
        await expect(bob.locator('.chat-decrypted-preview')).toBeVisible();
        const pixels=await bob.locator('.chat-decrypted-preview').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight,source:img.src}));
        expect(pixels.width).toBe(160);expect(pixels.height).toBe(120);expect(pixels.source.startsWith('blob:')).toBe(true);
        expect(await bob.locator('.chat-media-preview-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
        await bob.screenshot({path:`test-results/encrypted-media-${width}.png`});
        await bob.getByRole('button',{name:'Close',exact:true}).click();
        expect(await bob.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},pixels.source)).toBe(true);
      }
      await bob.locator('[data-encrypted-media-preview]').first().click();
      await expect(bob.locator('.chat-media-preview-dialog [role=status]')).toHaveText('Preview unavailable');
      await expect(bob.locator('.chat-decrypted-preview')).toHaveCount(0);await bob.getByRole('button',{name:'Close',exact:true}).click();
      for(const mime of ['image/svg+xml','text/html','image/png']) {
        await bob.evaluate(mime=>{window.savedDownload=client.downloadEncryptedMedia;client.downloadEncryptedMedia=async id=>{
          const result=await savedDownload(id);return {...result,blob:new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="window.unsafePreview=true"></svg>'],{type:mime})};
        };},mime);
        await bob.locator('[data-encrypted-media-preview]').last().click();
        await expect(bob.locator('.chat-media-preview-dialog [role=status]')).toHaveText('Preview unavailable');
        await expect(bob.locator('.chat-decrypted-preview')).toHaveCount(0);
        expect(await bob.evaluate(()=>Boolean(window.unsafePreview))).toBe(false);
        await bob.getByRole('button',{name:'Close',exact:true}).click();await bob.evaluate(()=>{client.downloadEncryptedMedia=savedDownload;});
      }
      await bob.locator('[data-encrypted-media-preview]').last().click();await expect(bob.locator('.chat-decrypted-preview')).toBeVisible();
      await bob.evaluate(()=>{window.originalSession=browserSession;browserSession={username:'alice',sessionId:'other'};});
      await expect(bob.locator('.chat-media-preview-dialog')).toHaveCount(0);await bob.evaluate(()=>{browserSession=originalSession;});
    });
    await test.step('user-held recovery kit restores history on a freshly approved device without MLS secrets',async()=>{
      await expect(bob.locator('[data-chat-recovery]')).toBeVisible();await bob.locator('[data-chat-recovery]').click();
      await bob.setViewportSize({width:390,height:844});
      const provisional=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Create recovery key'}).click()]);
      const keyOnly=JSON.parse(fs.readFileSync(await provisional[0].path(),'utf8'));expect(keyOnly.checkpoint).toBe(null);
      await expect(bob.getByRole('button',{name:'Back up and export'})).toBeDisabled();
      await bob.locator('[data-recovery-confirm]').fill(keyOnly.key);await bob.locator('[data-recovery-saved]').check();
      const exported=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Back up and export'}).click()]);
      let kit=JSON.parse(fs.readFileSync(await exported[0].path(),'utf8'));expect(kit.checkpoint.revision).toBe('1');
      const stored=JSON.stringify((await db.query('SELECT capsule FROM encrypted_conversation_backups')).rows);
      expect(stored).not.toContain(kit.key);expect(stored).not.toContain('Private Winga text');
      await expect(bob.getByRole('button',{name:'Close',exact:true})).toBeDisabled();
      expect(await bob.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await bob.screenshot({path:'test-results/encrypted-recovery-mobile.png'});await bob.locator('[data-recovery-saved]').check();
      const retiredKey=kit.key;
      const rotated=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Replace recovery key'}).click()]);
      const replacement=JSON.parse(fs.readFileSync(await rotated[0].path(),'utf8'));
      expect(replacement.key).not.toBe(retiredKey);expect(replacement.checkpoint).toBe(null);
      await expect(bob.getByRole('button',{name:'Back up and export'})).toBeDisabled();
      await bob.locator('[data-recovery-confirm]').fill(retiredKey);await bob.locator('[data-recovery-saved]').check();
      await expect(bob.getByRole('button',{name:'Back up and export'})).toBeDisabled();
      await bob.locator('[data-recovery-confirm]').fill(replacement.key);
      const resealed=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Back up and export'}).click()]);
      kit=JSON.parse(fs.readFileSync(await resealed[0].path(),'utf8'));expect(kit.checkpoint.revision).toBe('2');
      await bob.locator('[data-recovery-saved]').check();await bob.getByRole('button',{name:'Close',exact:true}).click();
      const fresh=await browser.newContext();try {
        const page=await fresh.newPage();await page.goto(origin);await page.evaluate(async()=>{try{await start('bob');}catch{}});
        await expect(page.evaluate(()=>client.createEncryptedRecovery())).rejects.toThrow('crypto_device_pending');
        const device=await page.evaluate(async()=>{const management=await client.createCryptoDeviceManagement();try{return (await management.list()).ownDevice;}finally{management.close();}});
        await bob.evaluate(async device=>{const management=await client.createCryptoDeviceManagement();try{await management.manage('approve',device.id,device.fingerprint);}finally{management.close();}},device);
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
          await test.step('typed encrypted replies, edits, reactions, own deletion and persistent voice drafts',async()=>{
            for(const p of [alice,third])await p.addScriptTag({url:origin+'/rich.js'});
            const target=latest[0].id;
            expect((await alice.evaluate(()=>render())).find(m=>m.id===target).timestamp).toBe(latest[0].timestamp);
            await expect(third.evaluate(id=>client.mutateEncryptedMessage('alice','edit',id,'Forbidden'),target)).rejects.toThrow('rich_edit_window_closed');
            await alice.evaluate(id=>client.mutateEncryptedMessage('bob','edit',id,'Third epoch edited'),target);
            let received=(await third.evaluate(()=>render())).find(m=>m.id===target);
            expect(received.message).toBe('Third epoch edited');expect(received.edited).toBe(true);
            expect(received.id).toBe(target);
            await third.evaluate(id=>client.mutateEncryptedMessage('alice','reaction',id,WingaRichContent.REACTIONS[1]),target);
            expect((await alice.evaluate(()=>render())).find(m=>m.id===target).reactions[0].owners).toEqual(['bob']);
            const reply=await third.evaluate(id=>client.sendRichMessage('alice',WingaRichContent.create('text','Encrypted reply',{}, {id,quote:''})),target);
            expect((await alice.evaluate(()=>render())).find(m=>m.id===reply.id).replyToMessageId).toBe(target);
            await alice.evaluate(()=>client.sendRichMessage('bob',WingaRichContent.create('product','Canonical product',{ids:['fixture-product']})));
            expect((await third.evaluate(()=>render())).at(-1).richContent.data.ids).toEqual(['fixture-product']);
            await third.evaluate(id=>client.mutateEncryptedMessage('alice','hide',id),target);
            expect((await third.evaluate(()=>render())).some(m=>m.id===target)).toBe(false);
            expect((await alice.evaluate(()=>render())).some(m=>m.id===target)).toBe(true);
            const draft=await alice.evaluate(()=>client.stageEncryptedMediaDraft('bob',new File(['voice fixture'],'voice.webm',{type:'audio/webm'}),'voice'));
            await alice.reload();await alice.evaluate(()=>start('alice'));await alice.addScriptTag({url:origin+'/rich.js'});
            expect(await alice.evaluate(async()=>{const d=await client.readEncryptedMediaDraft('bob');return {id:d.id,text:await d.blob.text()};})).toEqual({id:draft.id,text:'voice fixture'});
            const sent=await alice.evaluate(()=>client.sendEncryptedMediaDraft('bob','Encrypted voice'));
            received=(await third.evaluate(()=>render())).find(m=>m.id===sent.id);expect(received.attachmentKind).toBe('voice');
            expect(await third.evaluate(async id=>(await client.downloadEncryptedMedia(id)).blob.text(),sent.id)).toBe('voice fixture');
            const stored=(await db.query('SELECT ciphertext FROM encrypted_conversation_messages')).rows;
            expect(JSON.stringify(stored)).not.toContain('Third epoch edited');
            expect(JSON.stringify(stored)).not.toContain('fixture-product');
          });
        }finally{await thirdContext.close();}
      }finally{await fresh.close();}
    });
    await bob.setViewportSize({width:390,height:844});await bob.locator('[data-chat-security]').click();
    await expect(bob.locator('dialog')).toBeVisible();
    expect(await bob.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await bob.screenshot({path:'test-results/encrypted-chat-mobile.png'});await bob.getByRole('button',{name:'Close',exact:true}).click();
    const acceptedCount=(await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n;
    expect(acceptedCount).toBeGreaterThan(8);
    await db.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE owner_id='bob'");
    await expect(alice.evaluate(async()=>{const p=await client.prepareMessage({receiverId:'bob',message:'must block',messageType:'text'});await client.sendMessage(p);})).rejects.toThrow('encrypted_access_denied');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(acceptedCount);
    await a.clearCookies();
    await expect(alice.evaluate(()=>client.loadInboxPage())).rejects.toThrow('session_required');
    // A known local membership freeze can reject before the authenticated network check.
    await expect(alice.evaluate(async()=>client.sendMessage(await client.prepareMessage({receiverId:'bob',message:'no cookie must not send',messageType:'text'})))).rejects.toThrow(/session_required|encrypted_membership_pending/);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_messages')).rows[0].n).toBe(acceptedCount);
  }finally{await a.close().catch(()=>{});await b.close().catch(()=>{});}
});
