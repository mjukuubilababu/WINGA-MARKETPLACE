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
    const ui=window.WingaModules.chat.createChatUiModule(deps);
    const translate=(key,fallback,variables)=>deps.translate(key,variables,fallback);
    const controller=window.WingaModules.chat.createChatControllerModule({
      ...deps,translate,getProfileDiv:()=>document.getElementById('profile-div'),getCurrentSession:()=>state.session,
      setConversationsView:value=>state.view=value,
      setProfileMessagesMode:value=>{state.mode=value;if(value==='detail'&&!['chats','private'].includes(state.view))state.view='chats';},
      setProfileMessagesFilter:value=>state.filter=value,setProfileHasSelection:()=>{},
      setActiveChatContext:value=>state.context=value,setActiveChatReplyMessageId:()=>{},
      setOpenChatMessageMenuId:()=>{},setOpenEmojiScope:()=>{},
      setCurrentMessageDraft:value=>state.draft=value,loadStoredChatDraft:()=>state.draft,
      refreshActiveMessageHistory:async()=>{},markActiveConversationRead:async()=>{state.reads++;},
      navigateConversationHome:()=>state.home++,openConversationAlerts:()=>state.alerts++,openConversationProfile:()=>state.profile++,
      refreshMessagesState:async()=>{},refreshNotificationsState:async()=>{},
      createNotificationsContainerFromState:()=>document.createElement('div'),
      dataLayer:{isEncryptedConversation:async()=>true,
        loadSocialProfile:async username=>{
          if(username==='pending')return new Promise(resolve=>{state.resolveLookup=()=>resolve({profile:{username:'pending'}});});
          return {profile:{username:username==='invalid'?'different':username,displayName:username}};
        },
        sendMessage:async payload=>{state.sends++;state.lastPayload=payload;return {id:'sent-'+state.sends};}
      },setChatComposeStatus:()=>{},replaceMessagesPanel:()=>render()
    });
    function render(){document.querySelector('.profile-shell').innerHTML=ui.renderMessagesSection();controller.bindMessageActions(document.getElementById('profile-messages-panel'));}
    window.chatUiFixture={state,render,ui};render();
  },{catalog,rtl});
}

test('mobile inbox navigation, search, real controller send and honest room empty state',async({page})=>{
  await openChatUi(page);
  await expect(page.locator('.message-thread-item')).toHaveCount(3);
  const toolbarBottom=await page.locator('.conversations-heading [data-conversations-action="new"]').evaluate(node=>node.getBoundingClientRect().bottom);
  expect(toolbarBottom).toBeLessThanOrEqual(await page.locator('.conversation-search-field').evaluate(node=>node.getBoundingClientRect().top));
  expect(await page.locator('.conversation-search-field').evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(await page.locator('.conversation-view-tabs').evaluate(node=>node.getBoundingClientRect().top));
  await expect(page.locator('.conversation-view-tabs button')).toHaveText(['Zote','Binafsi','Chatrooms']);
  await expect(page.locator('.conversation-bottom-nav button')).toHaveText(['Chats','Chatrooms','Calls','Mimi']);
  await expect(page.locator('[data-inbox-filter]')).toHaveCount(0);
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
