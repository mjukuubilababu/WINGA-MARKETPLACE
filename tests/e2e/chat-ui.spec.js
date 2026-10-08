const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

async function openChatUi(page, {width=390,height=844,rtl=false}={}) {
  await page.setViewportSize({width,height});
  await page.route('http://chat-ui.test/**', async route => {
    const url = new URL(route.request().url());
    if(url.pathname === '/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="profile-div" data-active-section="profile-messages-panel"><div class="profile-shell"></div></div><script>window.WingaModules={chat:{}};</script><script src="/src/chat/ui.js"></script><script src="/src/chat/controller.js"></script></body></html>'});
    const icon = url.pathname.match(/^\/icons\/navigation\/([a-z-]+)\.svg$/);
    const file = icon ? path.join(root,'node_modules/lucide-static/icons',icon[1]+'.svg') : path.join(root,url.pathname.slice(1));
    if(![path.join(root,'style.css'),path.join(root,'src/chat/ui.js'),path.join(root,'src/chat/controller.js')].includes(file) && !icon)return route.abort();
    await route.fulfill({contentType:icon?'image/svg+xml':url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)});
  });
  await page.goto('http://chat-ui.test/');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  await page.addScriptTag({content:app.slice(app.indexOf('function normalizeDisplayName('),app.indexOf('function getUserShopLabel('))});
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs',rtl?'ar.json':'sw.json'),'utf8')).messages;
  await page.evaluate(({catalog,rtl})=>{
    document.documentElement.lang=rtl?'ar':'sw';document.documentElement.dir=rtl?'rtl':'ltr';
    const state={view:'chats',mode:'list',filter:'all',context:null,draft:'',home:0,alerts:0,profile:0,reads:0,sends:0,owner:'alice',session:{id:'fixture-session'}};
    const now=new Date().toISOString();
    const summaries=[{key:'rey',withUser:'rey',displayName:'Rey',productId:'',productName:'',latestMessage:'Sawa, nitakutumia picha nyingine.',timestamp:now,unreadCount:2},{key:'amina',withUser:'amina',displayName:'Amina',productId:'',productName:'',latestMessage:'Picha imefika, asante.',timestamp:now,unreadCount:1},{key:'wizad',withUser:'wizad',displayName:'Wizad',productId:'',productName:'',latestMessage:'Asante, nimepokea.',timestamp:now,unreadCount:0}];
    const messages=[{id:'m1',senderId:'rey',message:'Habari! Picha imefika vizuri.',timestamp:now},{id:'m2',senderId:'alice',message:'Asante, nimepokea. Tutaendelea hapa.',timestamp:now,isRead:true,deviceDeliveredAt:now},{id:'m3',senderId:'rey',message:'Ujumbe wenye neno refu '+ 'x'.repeat(180),timestamp:now}];
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const deps={translate:(key,variables,fallback)=>Object.entries(variables||{}).reduce((text,[name,value])=>text.replace('{'+name+'}',value),catalog[key]||fallback),escapeHtml,getCurrentUser:()=> 'alice',getUserDisplayName:name=>name==='rey'?'Rey':name,getMarketplaceUser:()=>null,getProductById:()=>null,getConversationSummaries:()=>summaries,getConversationSummariesFiltered:filter=>summaries.filter(row=>filter!=='unread'||row.unreadCount),getActiveChatContext:()=>state.context,getProfileMessagesMode:()=>state.mode,getProfileMessagesFilter:()=>state.filter,getConversationsView:()=>state.view,getActiveConversationMessages:()=>messages,getCurrentMessageDraft:()=>state.draft,getMessageProductItems:()=>[],getReplyPreviewMessage:()=>null,getActiveChatReplyMessageId:()=>'',getOpenChatMessageMenuId:()=>'',getChatContextKey:context=>context.withUser,getChatContactState:()=>({}),getMessagePreviewText:message=>message.message,getPendingMessages:()=>[],renderEmojiPicker:()=>'',getAssistantSearchState:()=>({}),sanitizeImageSource:value=>value,getImageFallbackDataUri:()=>'',createResponsiveImage:()=>document.createElement('img'),getUnreadNotifications:()=>[]};
    deps.getCurrentUser=()=>state.owner;
    deps.isPresentableDisplayName=isPresentableDisplayName;
    deps.getUserDisplayName=(username,options={})=>options.fallback || (username==='rey'?'Rey':username);
    const ui=window.WingaModules.chat.createChatUiModule(deps);
    const translate=(key,variables,fallback)=>deps.translate(key,variables,fallback);
    const controller=window.WingaModules.chat.createChatControllerModule({
      ...deps,translate,getProfileDiv:()=>document.getElementById('profile-div'),getCurrentSession:()=>state.session,
      setConversationsView:value=>state.view=value,
      setProfileMessagesMode:value=>{state.mode=value;if(value==='detail'&&!['chats','private'].includes(state.view))state.view='chats';},
      setProfileMessagesFilter:value=>state.filter=value,setProfileHasSelection:()=>{},
      setActiveChatContext:value=>state.context=value,setActiveChatReplyMessageId:()=>{},
      setOpenChatMessageMenuId:()=>{},setOpenEmojiScope:()=>{},
      setCurrentMessageDraft:value=>state.draft=value,loadStoredChatDraft:()=>state.draft,
      refreshActiveMessageHistory:async()=>{if(state.holdHistory)await new Promise(resolve=>(state.historyWaits||(state.historyWaits=[])).push(resolve));},markActiveConversationRead:async()=>{state.reads++;},
      refreshConversationOffersState:async()=>{if(state.holdOffers)await new Promise(resolve=>state.releaseOffers=resolve);},
      navigateConversationHome:()=>state.home++,openConversationAlerts:()=>state.alerts++,openConversationProfile:()=>state.profile++,
      refreshMessagesState:async()=>{if(state.refreshFailure)throw Error('private refresh failure');},refreshNotificationsState:async()=>{},
      captureError:(event,error,context)=>{(state.captured||(state.captured=[])).push({event,message:error.message,name:error.name,context});},
      createNotificationsContainerFromState:()=>document.createElement('div'),
      dataLayer:{isEncryptedConversation:async()=>true,
        loadSocialProfile:async username=>{
          if(username==='pending')return new Promise(resolve=>{state.resolveLookup=()=>resolve({profile:{username:'pending'}});});
          return {profile:{username:username==='invalid'?'different':username,displayName:username,fullName:username==='named'?'Asha Mussa':''}};
        },
        sendMessage:async payload=>{if(state.sendFailure)throw Object.assign(new Error(state.sendFailure),{status:503});state.sends++;state.lastPayload=payload;return {id:'sent-'+state.sends};}
      },setChatComposeStatus:(_scope,value)=>{state.composeStatus=value;},replaceMessagesPanel:()=>render()
    });
    function render(){document.querySelector('.profile-shell').innerHTML=ui.renderMessagesSection();controller.bindMessageActions(document.getElementById('profile-messages-panel'));}
    window.chatUiFixture={state,messages,render,ui,deps};render();
  },{catalog,rtl});
}

test('cached chat shell does not wait for network history or optional commerce and late navigation cannot mark another chat read',async({page})=>{
  await openChatUi(page);
  await page.evaluate(()=>{chatUiFixture.state.holdHistory=true;chatUiFixture.state.holdOffers=true;});
  await page.locator('[data-conversation-user="rey"]').click();
  await expect(page.locator('.messages-thread-body')).toContainText('Habari! Picha imefika vizuri.');
  expect(await page.evaluate(()=>chatUiFixture.state.reads)).toBe(0);
  await page.evaluate(()=>document.querySelector('[data-conversation-user="wizad"]').click());
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.historyWaits.length)).toBe(2);
  await page.evaluate(()=>chatUiFixture.state.historyWaits[0]());
  expect(await page.evaluate(()=>chatUiFixture.state.reads)).toBe(0);
  await page.evaluate(()=>chatUiFixture.state.historyWaits[1]());
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.reads)).toBe(1);
  expect(await page.evaluate(()=>chatUiFixture.state.context.withUser)).toBe('wizad');
});

test('returning to the same peer does not let an older navigation complete the newer request',async({page})=>{
  await openChatUi(page);await page.evaluate(()=>chatUiFixture.state.holdHistory=true);
  for(const peer of ['rey','wizad','rey'])await page.evaluate(peer=>document.querySelector('[data-conversation-user="'+peer+'"]').click(),peer);
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.historyWaits.length)).toBe(3);
  await page.evaluate(()=>{chatUiFixture.state.historyWaits[0]();chatUiFixture.state.historyWaits[1]();});
  expect(await page.evaluate(()=>chatUiFixture.state.reads)).toBe(0);
  await page.evaluate(()=>chatUiFixture.state.historyWaits[2]());
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.reads)).toBe(1);
});

test('message direction is automatic, compose status is semantic and reduced motion removes chat animations',async({page})=>{
  await openChatUi(page,{rtl:true});await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('[data-conversation-user="rey"]').click();
  expect(await page.locator('.message-bubble p').evaluateAll(rows=>rows.every(row=>row.dir==='auto'))).toBe(true);
  const menu=page.locator('.message-menu-trigger').first();
  const box=await menu.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await menu.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('a passive refresh failure cannot turn a durable accepted send into a failed message',async({page})=>{
  await openChatUi(page);await page.locator('[data-conversation-user="rey"]').click();
  await page.evaluate(()=>chatUiFixture.state.refreshFailure=true);
  await page.locator('#message-compose-input').fill('Confirmed despite refresh outage');
  await page.locator('#message-compose-form button[type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.sends)).toBe(1);
  expect(await page.evaluate(()=>chatUiFixture.state.composeStatus.tone)).toBe('success');
  expect(await page.evaluate(()=>chatUiFixture.state.captured||[])).toHaveLength(0);
});

test('real conversation menu opens local message search through the existing controller',async({page})=>{
  await openChatUi(page);
  for(const file of ['message-search.js','message-search-ui.js'])
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/chat',file),'utf8')});
  await page.evaluate(()=>{
    const f=chatUiFixture;f.state.session={username:'alice',sessionId:'search-fixture'};
    for(const row of f.messages)row.receiverId=row.senderId==='alice'?'rey':'alice';
    f.render();
  });
  await page.locator('[data-conversation-user="rey"]').click();
  await page.locator('.inbox-conversation-menu summary').click();
  await page.locator('[data-chat-message-search]').click();
  await expect(page.locator('dialog h3')).toHaveText('Tafuta ujumbe');
  await page.locator('input[name=query]').fill('Picha');
  await page.locator('dialog form button[type=submit]').click();
  await expect(page.locator('.chat-message-search-result')).toHaveCount(1);
  await expect(page.locator('.chat-message-search-result')).toContainText('Habari! Picha imefika vizuri.');
});

for(const [width,rtl] of [[320,false],[1280,false],[390,true]])test('archived view keeps history and new-message unread state at '+width+(rtl?' RTL':''),async({page})=>{
  await openChatUi(page,{width,rtl});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/chat/archive-ui.js'),'utf8')});
  await page.evaluate(async()=>{
    const f=chatUiFixture;f.state.session={username:'alice',sessionId:'archive-fixture'};
    f.deps.getCurrentSession=()=>f.state.session;
    const summaries=f.deps.getConversationSummaries;
    f.deps.getConversationSummariesFiltered=filter=>WingaConversationArchive.filter(summaries(),filter,f.state.session);
    await WingaConversationArchive.refresh({getSession:()=>f.state.session,dataLayer:{pushRequest:async()=>({peers:['rey']})}});
    f.render();
  });
  await expect(page.locator('[data-conversation-user="rey"]')).toHaveCount(0);
  await expect(page.locator('.message-thread-item')).toHaveCount(2);
  await page.locator('[data-inbox-filter="archived"]').click();
  await expect(page.locator('.message-thread-item')).toHaveCount(1);
  await expect(page.locator('[data-conversation-user="rey"] .thread-badge')).toHaveText('2');
  await page.evaluate(()=>{const rows=chatUiFixture.deps.getConversationSummaries();rows[0].latestMessage='Ujumbe mpya';rows[0].unreadCount=3;chatUiFixture.render();});
  await expect(page.locator('[data-conversation-user="rey"] .inbox-preview')).toHaveText('Ujumbe mpya');
  const row=await page.locator('.conversation-archive-view').boundingBox();
  expect(await page.locator('.conversation-archive-view').evaluate(node=>getComputedStyle(node).boxShadow)).toBe('none');
  expect(row.x).toBeGreaterThanOrEqual(0);expect(row.x+row.width).toBeLessThanOrEqual(width+1);
  await page.screenshot({path:path.join(root,'.tmp-chat-ui','archive-view-'+width+(rtl?'-rtl':'')+'.png')});
  await page.locator('[data-conversation-user="rey"]').click();
  await expect(page.locator('.messages-thread-body')).toContainText('Habari! Picha imefika vizuri.');
  expect(await page.evaluate(()=>chatUiFixture.messages.length)).toBe(3);
});

test('healthy Conversations remain visible when encrypted sync fails and explicit refresh recovers',async({page})=>{
  await openChatUi(page);
  for(const file of ['src/chat/pagination.js','src/api/communications-client.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async()=>{
    const session={username:'alice',sessionId:'fixture-session'},now=new Date().toISOString();
    const probe={syncs:0,pages:0};window.inboxFixProbe=probe;
    WingaEncryptionSession={createEncryptionSession:async options=>{
      if(options.initialSync!==false)throw new Error('Inbox must not require initial group sync');
      return {close(){},sync:async()=>{if(++probe.syncs===1)throw Object.assign(new Error('private error details'),{code:'mls_membership_confirmation_rejected'});},
        history:async()=>[{id:'saved-encrypted',senderId:'rey',receiverId:'alice',message:'Ujumbe uliohifadhiwa',timestamp:now,isRead:false,encrypted:true}]};
    }};
    const client=WingaModules.api.communications.createCommunicationsApiClient({baseUrl:'/api',getSession:()=>session,fetchJson:async url=>{
      if(url.includes('/messages/inbox?')){probe.pages++;return {items:[{withUser:'amina',latestMessage:'Habari',timestamp:now,unreadCount:0}],nextCursor:'',hasMore:false,totalUnread:0};}
      if(url.endsWith('/encrypted/capabilities'))return {version:1,enabled:true};
      throw new Error('Unexpected fixture route');
    }});
    const pager=WingaModules.chat.createMessagePagination({getUser:()=>session.username,dataLayer:client});
    const pageState=()=>({enabled:true,inbox:pager.snapshot().inbox,history:null});
    const summaries=()=>pager.snapshot().inbox.items.map(row=>({...row,key:row.withUser}));
    const deps={...chatUiFixture.deps,getMessagePageState:pageState,getConversationSummaries:summaries,getConversationSummariesFiltered:summaries};
    const ui=WingaModules.chat.createChatUiModule(deps);
    let controller;
    const render=()=>{document.querySelector('.profile-shell').innerHTML=ui.renderMessagesSection();controller.bindMessageActions(document.getElementById('profile-messages-panel'));};
    controller=WingaModules.chat.createChatControllerModule({...deps,translate:(key,fallback,variables)=>deps.translate(key,variables,fallback),getProfileDiv:()=>document.getElementById('profile-div'),
      refreshMessagesState:()=>pager.refreshInbox(),replaceMessagesPanel:render});
    await pager.refreshInbox();render();
  });
  await expect(page.locator('.message-thread-item')).toHaveCount(2);
  await expect(page.locator('[data-conversation-user="amina"] .inbox-preview')).toHaveText('Habari');
  await expect(page.locator('[data-conversation-user="rey"] .inbox-preview')).toHaveText('Ujumbe uliohifadhiwa');
  await expect(page.locator('.message-sync-warning')).toContainText('Chats zilizosimbwa hazijasasishwa.');
  await expect(page.getByRole('button',{name:'Jaribu tena',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Sasisha mazungumzo',exact:true}).click();
  await expect(page.locator('.message-sync-warning')).toHaveCount(0);
  await expect(page.locator('.message-thread-item')).toHaveCount(2);
  expect(await page.evaluate(()=>inboxFixProbe)).toEqual({syncs:2,pages:2});
  await page.screenshot({path:path.join(root,'.tmp-chat-ui/inbox-sync-recovered.png')});
});

async function showLinkMessage(page, text) {
  await page.evaluate(text => {
    chatUiFixture.messages.splice(0, chatUiFixture.messages.length, {id:'link-message',senderId:'rey',message:text,encrypted:true,timestamp:new Date().toISOString()});
    chatUiFixture.render();
  }, text);
  await page.locator('[data-conversation-user="rey"]').click();
}

test('encrypted message links require confirmation and open without referrer or opener', async ({page,context}) => {
  await openChatUi(page);
  let visits = 0;
  await context.route('https://destination.test/**', route => {
    if (route.request().isNavigationRequest()) visits++;
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Destination</title><body>Destination</body></html>'});
  });
  await showLinkMessage(page, 'Habari 👋\nAngalia https://destination.test/?x=1&y=2.\nAsante!');
  const text = page.locator('[data-message-bubble-id="link-message"] > p');
  await expect(text).toHaveText('Habari 👋\nAngalia https://destination.test/?x=1&y=2.\nAsante!');
  expect(await text.evaluate(node => getComputedStyle(node).whiteSpace)).toBe('pre-wrap');
  const button = page.locator('[data-chat-link]');
  await button.click();
  const dialog = page.getByRole('dialog',{name:'Fungua link?'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.chat-link-address')).toHaveText('destination.test');
  await expect(dialog.locator('code')).toHaveText('https://destination.test/?x=1&y=2');
  expect(visits).toBe(0);
  await dialog.getByRole('button',{name:'Ghairi',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(visits).toBe(0);
  await button.press('Enter');
  const open = page.getByRole('dialog').getByRole('link',{name:'Fungua link',exact:true});
  await expect(open).toHaveAttribute('rel','noopener noreferrer');
  await expect(open).toHaveAttribute('referrerpolicy','no-referrer');
  const popupPromise = context.waitForEvent('page');
  await open.click();
  const popup = await popupPromise;
  await popup.waitForURL(url => url.hostname === 'destination.test', {waitUntil:'domcontentloaded'});
  expect(await popup.evaluate(() => ({referrer:document.referrer,opener:window.opener}))).toEqual({referrer:'',opener:null});
  expect(visits).toBe(1);
  await popup.close();
});

test('unsafe message URLs and HTML stay literal with no active content', async ({page}) => {
  await openChatUi(page);
  await showLinkMessage(page, '<img src=x onerror="window.linkInjection=true">\njavascript:alert(1) https://user:password@example.com https://evil.test\\@example.com');
  const bubble = page.locator('[data-message-bubble-id="link-message"]');
  await expect(bubble.locator('[data-chat-link],a,iframe,script')).toHaveCount(0);
  await expect(bubble.locator('p img')).toHaveCount(0);
  expect(await page.evaluate(() => window.linkInjection)).toBeUndefined();
});

for (const change of ['owner','session','partner','hidden']) {
  test(`link confirmation closes when its ${change} changes`, async ({page}) => {
    await openChatUi(page);
    await showLinkMessage(page, 'https://example.com/');
    await page.locator('[data-chat-link]').click();
    await page.evaluate(change => {
      if(change==='owner')chatUiFixture.state.owner='other';
      if(change==='session')chatUiFixture.state.session={id:'new-session'};
      if(change==='partner')chatUiFixture.state.context={withUser:'amina'};
      if(change==='hidden')document.getElementById('profile-div').style.display='none';
    },change);
    await expect(page.locator('.chat-link-dialog')).toHaveCount(0);
  });
}

test('link confirmation rejects navigation immediately if the account changes before its timer', async ({page}) => {
  await openChatUi(page);
  await showLinkMessage(page, 'https://example.com/');
  await page.locator('[data-chat-link]').click();
  expect(await page.evaluate(() => {
    chatUiFixture.state.owner='other';
    const event = new MouseEvent('click',{bubbles:true,cancelable:true});
    return document.querySelector('.chat-link-dialog a').dispatchEvent(event);
  })).toBe(false);
  await expect(page.locator('.chat-link-dialog')).toHaveCount(0);
});

for (const [name,width,rtl] of [['mobile',320,false],['desktop',1280,false],['rtl',320,true]]) {
  test(`long international message link confirmation fits ${name}`, async ({page}) => {
    await openChatUi(page,{width,rtl});
    await showLinkMessage(page, 'https://münich.example/'+'a'.repeat(600));
    await page.locator('[data-chat-link]').click();
    const dialog = page.locator('.chat-link-dialog');
    await expect(dialog.locator('.chat-link-address')).toHaveText('xn--mnich-kva.example');
    await expect(dialog.locator('code')).toHaveAttribute('dir','ltr');
    const geometry = await dialog.evaluate(node => ({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,client:node.clientWidth,scroll:node.scrollWidth}));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);
    await page.screenshot({path:path.join(root,`.tmp-chat-ui/link-dialog-${name}.png`)});
  });
}

test('encrypted new-chat quota refusal is localized and leaves verification retryable without sending plaintext',async({page})=>{
  await openChatUi(page);
  const messages=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs/sw.json'),'utf8')).messages;
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'src/chat/encryption-ui.js'),'utf8')});
  await page.evaluate(messages=>{
    const scope=document.createElement('section'),button=document.createElement('button');
    document.getElementById('profile-div').remove();
    button.textContent=messages['chat.security'];
    button.dataset.chatSecurity='rey';button.dataset.quotaProbe='true';scope.append(button);document.body.append(scope);
    window.quotaProbe={attempts:0,plaintext:0,refreshes:0};
    WingaEncryptedChatUi.bind(scope,{translate:(key,fallback)=>messages[key]||fallback,refresh:()=>window.quotaProbe.refreshes++,dataLayer:{
      inspectEncryptedConversation:async()=>({status:'inactive',packages:[{deviceId:'fixture-device',fingerprint:'a'.repeat(64)}]}),
      enableEncryptedConversation:async()=>{window.quotaProbe.attempts++;throw Object.assign(new Error('internal quota details'),{code:'encrypted_new_conversation_limit'});},
      sendMessage:()=>window.quotaProbe.plaintext++
    }});
  },messages);
  await page.locator('[data-quota-probe]').click();
  const dialog=page.locator('.chat-security-dialog');
  await dialog.locator('input[name="fingerprint"]').fill('a'.repeat(64));
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator('[role="status"]')).toHaveText(messages['chat.newConversationLimit']);
  await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
  expect(await page.evaluate(()=>window.quotaProbe)).toEqual({attempts:1,plaintext:0,refreshes:0});
});

test('mobile inbox navigation, search, real controller send and honest room empty state',async({page})=>{
  await openChatUi(page);
  await expect(page.locator('.message-thread-item')).toHaveCount(3);
  const toolbarBottom=await page.locator('.conversations-heading [data-conversations-action="new"]').evaluate(node=>node.getBoundingClientRect().bottom);
  expect(toolbarBottom).toBeLessThanOrEqual(await page.locator('.conversation-search-field').evaluate(node=>node.getBoundingClientRect().top));
  expect(await page.locator('.conversation-search-field').evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(await page.locator('.conversation-view-tabs').evaluate(node=>node.getBoundingClientRect().top));
  await expect(page.locator('.conversation-view-tabs button')).toHaveText(['Zote','Binafsi','Chatrooms']);
  await expect(page.locator('.conversation-bottom-nav button')).toHaveText(['Chats','Chatrooms','Calls','Mimi']);
  await expect(page.locator('.inbox-filters')).toHaveCount(0);
  await expect(page.locator('.conversation-archive-view[data-inbox-filter="archived"]')).toHaveCount(1);
  await expect(page.locator('.inbox-product-finder')).toHaveCount(0);
  await page.locator('[data-inbox-search]').fill('Rey');
  await expect(page.locator('.message-thread-item:visible')).toHaveCount(1);
  await page.locator('[data-inbox-search]').fill('');
  await expect(page.locator('.message-thread-item:visible')).toHaveCount(3);
  await page.locator('.conversations-heading [data-conversations-action="home"]').click();
  expect(await page.evaluate(()=>chatUiFixture.state.home)).toBe(1);
  await page.locator('.conversation-bottom-nav [data-conversations-action="calls"]').click();
  await expect(page.locator('.messages-list')).toContainText('Kupiga simu hakupatikani kwa sasa.');
  await expect(page.locator('#message-compose-form')).toHaveCount(0);
  await expect(page.locator('[data-chat-read-user]')).toHaveCount(0);
  expect(await page.evaluate(()=>chatUiFixture.state.sends)).toBe(0);
  await page.locator('.conversation-bottom-nav [data-conversations-action="profile"]').click();
  expect(await page.evaluate(()=>chatUiFixture.state.profile)).toBe(1);
  await page.locator('.conversation-bottom-nav [data-conversations-action="rooms"]').click();
  await expect(page.locator('.messages-list')).toContainText('Hakuna chatroom bado.');
  await expect(page.locator('[data-chat-read-user]')).toHaveCount(0);
  await page.locator('.conversation-bottom-nav [data-conversations-action="chats"]').click();
  await page.locator('.conversation-view-tabs [data-conversations-action="private"]').click();
  await expect(page.locator('.conversation-view-tabs [data-conversations-action="private"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.message-thread-item')).toHaveCount(3);
  await page.locator('[data-conversation-user="rey"]').click();
  await expect(page.locator('.messages-thread-body')).toBeVisible();
  await expect(page.locator('.messages-list')).toBeHidden();
  await page.locator('#message-compose-input').fill('Ujumbe wa majaribio');
  await page.getByRole('button',{name:'Tuma ujumbe',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.sends)).toBe(1);
  expect(await page.evaluate(()=>chatUiFixture.state.lastPayload)).toMatchObject({receiverId:'rey',message:'Ujumbe wa majaribio',productId:'',productName:''});
  await page.locator('[data-message-list-back]').click();
  await expect(page.locator('.messages-list')).toBeVisible();
  await expect(page.locator('.conversation-view-tabs [data-conversations-action="private"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.conversation-view-tabs [data-conversations-action="chats"]').click();
  await page.screenshot({path:path.join(root,'.tmp-chat-ui/conversations-mobile.png')});
});

test('header labels message time honestly and profile navigation keeps canonical identity',async({page})=>{
  await openChatUi(page);await page.locator('[data-conversation-user="rey"]').click();
  await expect(page.locator('.thread-presence')).toContainText('Ujumbe wa mwisho:');
  await page.locator('.inbox-conversation-menu summary').click();
  await expect(page.locator('[data-open-person-profile]')).toHaveAttribute('data-open-person-profile','rey');
  await expect(page.locator('[data-open-person-profile]')).toHaveText('Angalia wasifu');
  expect(await page.locator('.messages-thread-head').textContent()).not.toContain('Last active');
});

test('message failure telemetry contains no private error text or recipient identity',async({page})=>{
  await openChatUi(page);await page.locator('[data-conversation-user="rey"]').click();
  await page.evaluate(()=>chatUiFixture.state.sendFailure='PRIVATE MESSAGE ERROR AND RECOVERY SECRET');
  await page.locator('#message-compose-input').fill('Private text');
  await page.getByRole('button',{name:'Tuma ujumbe',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.captured?.length||0)).toBe(1);
  const diagnostic=await page.evaluate(()=>chatUiFixture.state.captured[0]);
  expect(diagnostic).toEqual({event:'profile_message_send_failed',message:'chat_send_failed',name:'ConversationSendError',
    context:{category:'messaging',status:503,retryable:true}});
});

test('new chat validates the public contact and never sends until explicit compose submit',async({page})=>{
  await openChatUi(page);
  await page.getByRole('button',{name:'Ujumbe mpya',exact:true}).click();
  const dialog=page.locator('.conversation-new-dialog');
  await dialog.getByRole('textbox',{name:'Jina la mtumiaji'}).fill('invalid');
  await dialog.getByRole('button',{name:'Fungua chat'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Mtumiaji hapatikani');
  await dialog.getByRole('textbox',{name:'Jina la mtumiaji'}).fill('rey');
  await dialog.getByRole('button',{name:'Fungua chat'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-chat-read-user="rey"]')).toBeVisible();
  expect(await page.evaluate(()=>chatUiFixture.state.sends)).toBe(0);
});

test('new chat uses the canonical profile name while routing by the original username',async({page})=>{
  await openChatUi(page);
  await page.getByRole('button',{name:'Ujumbe mpya',exact:true}).click();
  const dialog=page.locator('.conversation-new-dialog');
  await dialog.getByRole('textbox',{name:'Jina la mtumiaji'}).fill('named');
  await dialog.getByRole('button',{name:'Fungua chat'}).click();
  await expect(page.locator('.messages-thread-head strong').first()).toHaveText('Asha Mussa');
  expect(await page.evaluate(()=>chatUiFixture.state.context)).toMatchObject({withUser:'named',displayName:'Asha Mussa'});
  await expect(page.locator('[data-chat-read-user="named"]')).toBeVisible();
  expect(await page.evaluate(()=>chatUiFixture.state.sends)).toBe(0);
});

test('headers do not expose generated or phone identities when profile metadata is absent',async({page})=>{
  await openChatUi(page);
  const fallback=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs/sw.json'),'utf8')).messages['inbox.person'];
  for(const name of ['guest-1782938472398-abcd','buyer-123456-abcd','255700123456']) {
    await page.evaluate(name=>{
      chatUiFixture.state.context={withUser:'rey',displayName:name,productId:'',productName:''};
      chatUiFixture.state.mode='detail';chatUiFixture.render();
    },name);
    await expect(page.locator('.messages-thread-head strong').first()).toHaveText(fallback);
    await expect(page.locator('[data-chat-read-user="rey"]')).toBeVisible();
  }
});

for(const action of ['close','account','session'])test(`late new-chat lookup is discarded after ${action}`,async({page})=>{
  await openChatUi(page);
  await page.getByRole('button',{name:'Ujumbe mpya',exact:true}).click();
  const dialog=page.locator('.conversation-new-dialog');
  await dialog.getByRole('textbox',{name:'Jina la mtumiaji'}).fill('pending');
  await dialog.getByRole('button',{name:'Fungua chat'}).click();
  await expect.poll(()=>page.evaluate(()=>typeof chatUiFixture.state.resolveLookup)).toBe('function');
  if(action==='close')await dialog.locator('form > button[type="button"]').click();
  else await page.evaluate(action=>{if(action==='account')chatUiFixture.state.owner='other';else chatUiFixture.state.session={id:'different'};},action);
  await page.evaluate(()=>chatUiFixture.state.resolveLookup());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>chatUiFixture.state.context)).toBeNull();
  expect(await page.evaluate(()=>chatUiFixture.state.sends)).toBe(0);
});

test('mobile composer stays in the reduced keyboard viewport',async({page})=>{
  await openChatUi(page);
  await page.locator('[data-conversation-user="rey"]').click();
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:400});
    Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,value:20});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  expect(await page.locator('#message-compose-input').evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(420);
  expect(await page.locator('.messages-thread-head').evaluate(node=>node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(20);
});

test('actual Read visibility guard excludes keyboard-covered messages without changing the approved UI',async({page})=>{
  await openChatUi(page);
  await page.locator('[data-conversation-user="rey"]').click();
  await page.bringToFront();
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  await page.addScriptTag({content:'var currentUser="alice",currentView="profile",chatUiState={activeContext:{withUser:"rey"},isContextOpen:false};\n'+source.slice(source.indexOf('function isActiveConversationVisible()'),source.indexOf('async function markActiveConversationRead()'))});
  const before=await page.evaluate(()=>[...visibleIncomingMessageIds()]);
  expect(before.length).toBeGreaterThan(0);
  const layout=await page.locator('.messages-thread-body').boundingBox();
  await page.evaluate(()=>{
    const first=document.querySelector('.message-bubble.incoming[data-message-bubble-id]').getBoundingClientRect();
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:first.top+Math.min(10,first.height)});
  });
  expect(await page.evaluate(()=>[...visibleIncomingMessageIds()])).toEqual([]);
  expect(await page.locator('.messages-thread-body').boundingBox()).toEqual(layout);
  await page.evaluate(()=>Object.defineProperty(window.visualViewport,'height',{configurable:true,value:innerHeight}));
  expect(await page.evaluate(()=>[...visibleIncomingMessageIds()])).toEqual(before);
  await page.evaluate(()=>Object.defineProperty(window.visualViewport,'width',{configurable:true,value:0}));
  expect(await page.evaluate(()=>[...visibleIncomingMessageIds()])).toEqual([]);
});

test('chatroom layout has members and pinned messages but cannot use private-chat send or ACK',async({page})=>{
  await openChatUi(page);
  await page.evaluate(()=>{
    const now=new Date().toISOString();
    const members=[{username:'amina',displayName:'Amina',role:'admin'},{username:'juma',displayName:'Juma'},{username:'alice',displayName:'Rey'}];
    const messages=[{id:'welcome',senderId:'amina',message:'Karibuni! Leo kuna bidhaa mpya.',timestamp:now},{id:'product',senderId:'juma',message:'iPhone 13 ipo, TSh 850,000.',timestamp:now},{id:'reply',senderId:'alice',message:'Nipo karibu, nitapita leo.',timestamp:now}];
    chatUiFixture.state.mode='detail';chatUiFixture.render();
    document.querySelector('.messages-shell').innerHTML=chatUiFixture.ui.renderChatroomLayout({name:'Winga Kariakoo',members,messages,pinnedMessageId:'welcome'});
  });
  await expect(page.locator('[data-room-layout]')).toContainText('Winga Kariakoo');
  await expect(page.locator('.messages-thread-head')).toContainText('Wanachama 3');
  await expect(page.locator('.messages-thread-head .conversation-icon-button')).toHaveCSS('width','44px');
  await page.locator('.room-members-menu > summary').click();
  await expect(page.locator('.room-members-list li')).toHaveCount(3);
  await page.locator('.room-members-menu > summary').click();
  await page.locator('.chatroom-pinned-message').click();
  await expect(page.locator('#room-message-welcome')).toBeInViewport();
  await expect(page.locator('[data-chat-read-user]')).toHaveCount(0);
  await expect(page.locator('#message-compose-form')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Tuma ujumbe',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>chatUiFixture.state.sends)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('img[src^="/icons/"]')].every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
  await page.screenshot({path:path.join(root,'.tmp-chat-ui/conversations-room-preview.png')});
});

for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568},{width:390,height:844,rtl:true}]) {
  test(`thread fits ${viewport.width}x${viewport.height}${viewport.rtl?' RTL':''}`,async({page})=>{
    await openChatUi(page,viewport);
    await page.locator('[data-conversation-user="rey"]').click();
    await expect(page.locator('#message-compose-input')).toBeVisible();
    if(viewport.width>720)await expect(page.locator('.messages-list')).toBeVisible();
    else await expect(page.locator('.messages-list')).toBeHidden();
    const geometry=await page.evaluate(()=>{
      const panel=document.getElementById('profile-messages-panel'),input=document.getElementById('message-compose-input');
      const rect=input.getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:panel.scrollWidth,composerBottom:rect.bottom,composerTop:rect.top,brokenIcons:[...panel.querySelectorAll('img[src^="/icons/"]')].filter(img=>!img.complete||img.naturalWidth===0).length};
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
    expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.composerTop).toBeGreaterThan(0);
    expect(await page.locator('.messages-thread-head').evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(110);
    await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('img[src^="/icons/"]')].every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
    const filename=viewport.rtl?'conversations-rtl.png':viewport.width>720?'conversations-desktop.png':viewport.width===390?'conversations-thread-mobile.png':'conversations-small.png';
    await page.screenshot({path:path.join(root,'.tmp-chat-ui',filename)});
  });
}
test('incoming announcements survive rerenders without rereading old history or pagination',async({page})=>{
  await openChatUi(page);await page.locator('[data-conversation-user="rey"]').click();
  await page.evaluate(()=>{
    chatUiFixture.messages.push({id:'new-incoming',senderId:'rey',message:'Private content never announced',timestamp:new Date(Date.now()+1000).toISOString()});
    chatUiFixture.render();
  });
  const announcer=page.locator('#conversation-announcer');
  await expect(announcer).toContainText('1');
  expect(await announcer.textContent()).not.toContain('Private content');
  const node=await announcer.evaluate(el=>{window.originalAnnouncer=el;return el.textContent;});
  await page.evaluate(()=>{
    chatUiFixture.messages.unshift({id:'old-page',senderId:'rey',message:'Old history',timestamp:'2020-01-01T00:00:00.000Z'});
    chatUiFixture.render();chatUiFixture.render();
  });
  expect(await announcer.textContent()).toBe(node);
  expect(await announcer.evaluate(el=>el===window.originalAnnouncer)).toBe(true);
  await expect(page.locator('.messages-thread-body')).toHaveAttribute('aria-live','off');
});

test('durable local pending has no Sent label or failed retry while transmission is waiting',async({page})=>{
  await openChatUi(page);await page.locator('[data-conversation-user="rey"]').click();
  await page.evaluate(()=>{
    chatUiFixture.messages.push({id:'local-intent',senderId:'alice',receiverId:'rey',message:'Waiting safely',encrypted:true,status:'pending',waiting:true,timestamp:new Date().toISOString()});
    chatUiFixture.render();
  });
  const bubble=page.locator('[data-message-bubble-id="local-intent"]');
  await expect(bubble).toContainText('unasubiri kutumwa');
  await expect(bubble.locator('[data-message-retry]')).toHaveCount(0);
});
test('first incoming message is announced after an empty thread finishes its baseline load',async({page})=>{
  await openChatUi(page);await page.evaluate(()=>chatUiFixture.messages.splice(0));
  await page.locator('[data-conversation-user="rey"]').click();
  await page.evaluate(()=>{
    chatUiFixture.messages.push({id:'first-live',senderId:'rey',message:'First',timestamp:new Date().toISOString()});
    chatUiFixture.render();
  });
  await expect(page.locator('#conversation-announcer')).toContainText('1');
});

test('context composer keeps durable acceptance after optional refresh failure and excludes stale session completion',async({page})=>{
  await openChatUi(page);
  await page.evaluate(()=>{
    const f=chatUiFixture,s=f.state;s.context={withUser:'rey'};s.contextOpen=true;s.observations=[];
    window.WingaConversationExperience={record:name=>s.observations.push(name)};
    const modal=document.createElement('div');modal.id='context-chat-modal';modal.style.display='grid';modal.innerHTML='<form id="context-chat-compose-form"><input id="context-chat-compose-input"><button type="submit">Send</button></form>';document.body.append(modal);
    const c=WingaModules.chat.createChatControllerModule({...f.deps,getCurrentSession:()=>s.session,getSelectedChatProducts:()=>[],getIsContextOpen:()=>s.contextOpen,
      setCurrentMessageDraft:value=>s.draft=value,setSelectedChatProductIds:()=>{},setActiveChatReplyMessageId:()=>{},setOpenChatMessageMenuId:()=>{},setOpenEmojiScope:()=>{},
      setChatComposeStatus:(_scope,value)=>s.composeStatus=value,refreshMessagesState:async()=>{throw Error('optional refresh unavailable');},refreshNotificationsState:async()=>{},
      dataLayer:{isEncryptedConversation:async()=>true,sendMessage:async()=>s.holdSend?new Promise(resolve=>s.finishSend=()=>resolve({id:'late'})):{id:'accepted'}}});
    window.contextController=c;c.bindContextChatModalActions();
  });
  await page.locator('#context-chat-compose-input').fill('durably accepted');await page.locator('#context-chat-compose-form button').click();
  await expect.poll(()=>page.evaluate(()=>chatUiFixture.state.composeStatus.tone)).toBe('success');
  expect(await page.evaluate(()=>chatUiFixture.state.observations)).toEqual(['send-confirmed']);
  await page.evaluate(()=>chatUiFixture.state.holdSend=true);
  await page.locator('#context-chat-compose-input').fill('delayed send');await page.locator('#context-chat-compose-form button').click();
  await expect.poll(()=>page.evaluate(()=>typeof chatUiFixture.state.finishSend)).toBe('function');
  await page.evaluate(()=>{const s=chatUiFixture.state;s.owner='eve';s.session={id:'other'};s.composeStatus={tone:'new-owner'};s.finishSend();});
  await page.waitForTimeout(50);
  expect(await page.evaluate(()=>chatUiFixture.state.composeStatus.tone)).toBe('new-owner');
  expect(await page.evaluate(()=>chatUiFixture.state.observations)).toEqual(['send-confirmed']);
});

for(const action of ['same-seller-product','close-reopen'])test('late modal send cannot clear a new draft after '+action,async({page})=>{
  await openChatUi(page);
  await page.evaluate(()=>{
    const f=chatUiFixture,s=f.state;s.context={withUser:'rey',productId:'A'};s.contextOpen=true;s.draft='first';
    const modal=document.createElement('div');modal.id='context-chat-modal';modal.style.display='grid';modal.innerHTML='<form id="context-chat-compose-form"><input id="context-chat-compose-input" value="first"><button type="submit">Send</button></form>';document.body.append(modal);
    const c=WingaModules.chat.createChatControllerModule({...f.deps,getCurrentSession:()=>s.session,getSelectedChatProducts:()=>[],getIsContextOpen:()=>s.contextOpen,setIsContextOpen:value=>s.contextOpen=value,
      setCurrentMessageDraft:value=>s.draft=value,setSelectedChatProductIds:()=>{},setActiveChatReplyMessageId:()=>{},setOpenChatMessageMenuId:()=>{},setOpenEmojiScope:()=>{},
      setChatComposeStatus:()=>{},refreshMessagesState:async()=>{},refreshNotificationsState:async()=>{},
      dataLayer:{isEncryptedConversation:async()=>true,sendMessage:async()=>new Promise(resolve=>s.finishSend=()=>resolve({id:'accepted'}))}});
    window.contextController=c;c.bindContextChatModalActions();
  });
  await page.locator('#context-chat-compose-form button').click();
  await expect.poll(()=>page.evaluate(()=>typeof chatUiFixture.state.finishSend)).toBe('function');
  await page.evaluate(action=>{const s=chatUiFixture.state;if(action==='close-reopen'){contextController.closeContextChatModal();s.contextOpen=true;document.getElementById('context-chat-modal').style.display='grid';}
    s.context={withUser:'rey',productId:action==='same-seller-product'?'B':'A'};s.draft='new draft';s.finishSend();},action);
  await page.waitForTimeout(50);expect(await page.evaluate(()=>chatUiFixture.state.draft)).toBe('new draft');
});
