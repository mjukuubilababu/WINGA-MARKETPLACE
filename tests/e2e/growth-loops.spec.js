const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const apiBaseUrl = 'http://127.0.0.1:43080/api';

async function guest(browser, request, flags = {}) {
  const response = await request.get(apiBaseUrl+'/products?limit=50');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const products = Array.isArray(body) ? body : body.items;
  const product = [...products].reverse().find(p => p.status==='approved' && p.availability==='available' && p.image && Number(p.price)>0);
  expect(product).toBeTruthy();
  const context = await browser.newContext();
  await context.addInitScript(({base,flags}) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {provider:'api',apiBaseUrl:base,growthProductSharing:true,growthMeasurement:true,disableServiceWorker:true,...flags};
    Object.defineProperty(navigator,'share',{value:undefined,configurable:true});
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copiedGrowthLink=text;}},configurable:true});
  },{base:apiBaseUrl,flags});
  // Simulate measurement outage, while all canonical content/auth APIs remain real.
  await context.route('**/api/growth/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'growth_unavailable'})}));
  const page = await context.newPage();
  return {context,page,product};
}

test('guest share content, copy and activation work while attribution is unavailable',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  const shareId=randomUUID();
  await page.goto('/product/'+encodeURIComponent(product.id)+'?share='+shareId);
  await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  await expect(page.locator('#auth-container')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>{
    const entries=JSON.parse(localStorage.getItem('winga-growth-outbox-v1')||'[]');
    return entries.some(e=>e.payload.eventType==='shared_product_viewed');
  })).toBe(true);
  await page.evaluate(id=>openMediaActionSheet(getProductById(id)),product.id);
  await page.locator('[data-media-action="share-copy"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/product/'+encodeURIComponent(product.id)+'?share=');
  await expect(page.locator('#auth-container')).toBeHidden();
  const copied=await page.evaluate(()=>window.__copiedGrowthLink);
  const url=new URL(copied.match(/Link: (.+)$/)[1]);
  expect([...url.searchParams.keys()]).toEqual(['share']);
  expect(url.searchParams.get('share')).not.toBe(shareId);
  const recipient=await context.newPage();
  await recipient.goto(url.href);
  await expect(recipient.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  await expect(recipient.locator('#auth-container')).toBeHidden();
  await context.close();
});

test('authentication returns a guest purchase action to exact product detail',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  await page.goto('/product/'+encodeURIComponent(product.id)+'?share='+randomUUID());
  await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  await page.locator('#product-detail-modal [data-buy-product]').first().click();
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();
  await page.locator('#username').fill('buyer_seller');
  await page.locator('#password').fill('Pass1234!Secure');
  await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  await expect(page.locator('#auth-container')).toBeHidden();
  await expect(page.locator('#product-detail-title')).toHaveText(product.name);
  await expect(page.locator('#product-detail-modal')).toBeVisible();
  await expect(page).toHaveURL(new RegExp('/product/'+product.id+'(?:\\?|$)'));
  expect(await page.evaluate(()=>localStorage.getItem('winga-pending-guest-intent'))).toBeNull();
  await context.close();
});

async function roomPreview(context,product,{expired=false}={}) {
  const token='A'.repeat(43),inviteId=randomUUID(),conversationId=randomUUID();
  await context.route('**/api/growth/invites/'+token,route=>route.fulfill({status:expired?404:200,contentType:'application/json',body:JSON.stringify(expired?{code:'growth_invite_unavailable'}:{version:1,inviteId,purpose:'choose_products',joiningEnabled:true,productIds:[product.id],expiresAt:new Date(Date.now()+86400000).toISOString(),joinContext:{conversationId,tokenHash:'b'.repeat(64)}})}));
  return {token,conversationId};
}

test('guest room invitation shows public value during analytics outage',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  const {token}=await roomPreview(context,product);
  await page.goto('/invite/'+token);
  const preview=page.locator('.room-invitation-preview');
  await expect(preview).toBeVisible({timeout:30000});
  await expect(preview.locator('h3')).toHaveText(product.name);
  await expect(page.locator('#auth-container')).toBeHidden();
  await expect(page).toHaveURL('/invite/'+token);
  await preview.locator('.room-invite-product button').click();
  await expect(page.locator('#product-detail-title')).toHaveText(product.name);
  await expect(page.locator('#auth-container')).toBeHidden();
  await context.close();
});

test('room join authentication returns to exact invite and requests approval',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  const {token,conversationId}=await roomPreview(context,product);
  await page.goto('/invite/'+token);
  await expect(page.locator('.room-invitation-preview h3')).toHaveText(product.name,{timeout:30000});
  // Browser checks navigation/auth continuity; real MLS admission is covered by database tests.
  await page.evaluate(id=>{window.WingaDataLayer.shoppingRoom=async(action,args)=>{window.__roomInviteRequest={action,args};return {status:'requested',conversationId:id};};},conversationId);
  await page.locator('[data-room-join]').click();
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();
  await page.locator('#username').fill('buyer_seller');
  await page.locator('#password').fill('Pass1234!Secure');
  await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  await expect(page.locator('.room-invitation-preview [role=status]')).toContainText(/approve|idhini/i);
  await expect(page).toHaveURL('/invite/'+token);
  expect(await page.evaluate(()=>window.__roomInviteRequest.action)).toBe('requestInvite');
  expect(await page.evaluate(()=>localStorage.getItem('winga-pending-guest-intent'))).toBeNull();
  await context.close();
});

test('expired room invitation offers a useful fallback before signup',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  const {token}=await roomPreview(context,product,{expired:true});
  await page.goto('/invite/'+token);
  await expect(page.locator('.room-invitation-preview [role=status]')).toContainText(/no longer available|haipatikani/i,{timeout:30000});
  await expect(page.locator('[data-room-join]')).toHaveCount(0);
  await expect(page.locator('#auth-container')).toBeHidden();
  await context.close();
});

test('internal product sharing uses rich canonical transports and stable retry IDs',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  await page.goto('/product/'+product.id);
  await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  await page.evaluate(id=>openMediaActionSheet(getProductById(id)),product.id);
  await page.locator('[data-media-action="share-winga"]').click();
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();
  await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');
  await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  // Verify explicit selection and retry wiring; real transport authorization is tested separately.
  await page.evaluate(()=>{
    window.__internalShares=[];window.__roomShares=[];
    WingaDataLayer.loadInboxPage=async()=>({items:[{withUser:'market_seller',encrypted:true},{withUser:'legacy_peer',encrypted:false}]});
    WingaDataLayer.shoppingRoom=async(action,args)=>{
      if(action==='list')return [{id:'11111111-1111-4111-8111-111111111111',name:'Choose a gift',status:'active',transition:{status:'accepted'}}];
      window.__roomShares.push({action,args});return {id:args[3]};
    };
    WingaDataLayer.sendRichMessage=async(peer,content,options)=>{
      window.__internalShares.push({peer,content,options});if(window.__internalShares.length===1)throw Error('network unavailable');return {id:options.clientMessageId};
    };
  });
  await page.evaluate(id=>openInternalProductShare(id),product.id);
  const dialog=page.locator('dialog').filter({has:page.getByRole('heading',{name:'Share to Winga'})});
  await expect(dialog.getByRole('button',{name:'market_seller',exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'legacy_peer',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>window.__internalShares.length)).toBe(0);
  await dialog.getByRole('button',{name:'market_seller',exact:true}).click();
  await expect(dialog.locator('[role=status]')).toContainText('Unable to share');
  await dialog.getByRole('button',{name:'market_seller',exact:true}).click();
  await expect(dialog.locator('[role=status]')).toHaveText('Shared.');
  const messages=await page.evaluate(()=>window.__internalShares);
  expect(messages).toHaveLength(2);expect(messages[0].options.clientMessageId).toBe(messages[1].options.clientMessageId);
  expect(messages[1].content.type).toBe('product');expect(messages[1].content.data.ids).toEqual([product.id]);
  await dialog.getByRole('button',{name:'Choose a gift',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__roomShares.length)).toBe(1);
  const rooms=await page.evaluate(()=>window.__roomShares);
  expect(rooms).toHaveLength(1);expect(rooms[0].action).toBe('command');expect(rooms[0].args[1]).toBe('product-share');
  expect(rooms[0].args[2]).toEqual({productId:product.id,note:'',snapshot:null});
  await context.close();
});

test('failed-search notification request preserves exact query through authentication',async({browser,request})=>{
  const {context,page}=await guest(browser,request,{growthDemandResolution:true});
  await context.route('**/api/search-demand/subscriptions',route=>{
    const body=route.request().postDataJSON();
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({goalId:'goal_search_fixture',status:'looking',queryReceived:body.query})});
  });
  let releaseBoot;const bootDelay=new Promise(resolve=>{releaseBoot=resolve;});
  await context.route('**/api/products**',async route=>{await bootDelay;await route.continue();});
  await page.goto('/');
  await page.waitForFunction(()=>typeof notifySearchDemand==='function');
  // Exercise the common auth-return contract with a previously selected Search context.
  // Canonical Search itself remains members-only. Wait for boot to finish before an action.
  const pending=page.waitForRequest('**/api/search-demand/subscriptions');
  await page.evaluate(()=>notifySearchDemand('unfindable purple walking moon boots'));
  await expect(page.locator('#auth-container')).toBeVisible();
  releaseBoot();await expect(page.locator('.product-card').first()).toBeAttached({timeout:30000});
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  const subscription=await pending;expect(subscription.postDataJSON()).toEqual({query:'unfindable purple walking moon boots'});
  await expect(page.locator('#search-input')).toHaveValue('unfindable purple walking moon boots');
  expect(await page.evaluate(()=>localStorage.getItem('winga-pending-guest-intent'))).toBeNull();
  await context.close();
});

async function collectionPreview(context,product,{unavailable=false}={}){
  const id='collection_fixture_'+randomUUID();
  await context.route('**/api/social/collections/'+id,route=>route.fulfill({status:unavailable?404:200,contentType:'application/json',body:JSON.stringify(unavailable?{code:'collection_unavailable'}:{id,title:'Help choose a gift',description:'A public shortlist',ownerUsername:'market_seller',status:'published',visibility:'public',items:[{productId:product.id,name:product.name}],itemCount:1})}));
  await context.route('**/api/social/follows/market_seller',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({updated:true,following:true,followedUsername:'market_seller'})}));
  return id;
}

test('public collection links show exact products, share canonical identity and preserve follow auth context',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request),id=await collectionPreview(context,product);
  await page.goto('/collection/'+id);
  const preview=page.locator('[data-collection-id="'+id+'"]');
  await expect(preview.getByRole('heading')).toHaveText('Help choose a gift',{timeout:30000});
  await expect(preview.getByRole('button',{name:product.name,exact:true})).toBeVisible();
  await expect(page.locator('#auth-container')).toBeHidden();
  await preview.getByRole('button',{name:/^(Share|Shiriki)$/}).click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/collection/'+id);
  await preview.locator('[data-follow-collection-owner]').click();
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(preview).toBeVisible({timeout:30000});await expect(page).toHaveURL('/collection/'+id);
  expect(await page.evaluate(()=>localStorage.getItem('winga-pending-guest-intent'))).toBeNull();
  await context.close();
});

test('unavailable collection falls back without forcing signup',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request),id=await collectionPreview(context,product,{unavailable:true});
  await page.goto('/collection/'+id);
  await expect(page.locator('[data-collection-id] [role=status]')).toContainText('no longer available',{timeout:30000});
  await expect(page.locator('#auth-container')).toBeHidden();await context.close();
});

test('attributed public collection delivers guest value during measurement outage',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request,{growthCollectionSharing:true});
  const id=await collectionPreview(context,product),shareId=randomUUID();
  await page.goto('/collection/'+id+'?share='+shareId);
  const preview=page.locator('[data-collection-id="'+id+'"]');
  await expect(preview.getByRole('heading')).toHaveText('Help choose a gift',{timeout:30000});
  await expect(page.locator('#auth-container')).toBeHidden();
  await expect.poll(()=>page.evaluate(shareId=>{
    const entries=JSON.parse(localStorage.getItem('winga-growth-outbox-v1')||'[]');
    return ['content_share_opened','shared_content_viewed'].every(type=>entries.some(e=>e.payload.shareId===shareId&&e.payload.eventType===type));
  },shareId)).toBe(true);
  await preview.getByRole('button',{name:/^(Share|Shiriki)$/}).click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/collection/'+id+'?share=');
  const copied=await page.evaluate(()=>window.__copiedGrowthLink);
  const url=new URL(copied.match(/https?:\/\/\S+/)[0]);
  expect([...url.searchParams.keys()]).toEqual(['share']);
  expect(url.searchParams.get('share')).not.toBe(shareId);
  await expect(preview).toBeVisible();
  await context.close();
});

test('public profile remains visible when optional collections are unavailable',async({browser,request})=>{
  const {context,page}=await guest(browser,request);
  await context.route('**/api/social/users/market_seller',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{username:'market_seller',fullName:'Gift Curator',status:'active',publicContent:{products:1,reels:0,collections:0},followers:0,following:0,viewerFollows:false}})}));
  let releaseCollections;const collectionDelay=new Promise(resolve=>{releaseCollections=resolve;});
  await context.route('**/api/social/users/market_seller/collections?*',async route=>{await collectionDelay;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'collections_unavailable'})});});
  await page.goto('/profile/market_seller');
  await expect(page.locator('#person-profile-modal')).toBeVisible({timeout:30000});
  await expect(page.locator('#person-profile-modal')).toContainText('Gift Curator');
  releaseCollections();
  await expect(page.locator('#auth-container')).toBeHidden();await context.close();
});

test('member failed Search exposes an explicit notification action',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request,{growthDemandResolution:true});
  let subscribed='';await context.route('**/api/search-demand/subscriptions',route=>{subscribed=route.request().postDataJSON().query;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({goalId:'goal_search_member_fixture',status:'looking'})});});
  await page.goto('/product/'+product.id);await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  await page.locator('#product-detail-modal [data-buy-product]').first().click();await page.locator('#auth-gate-login').click();
  await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  await page.evaluate(()=>closeProductDetailModal({skipHistoryBack:true}));
  await page.locator('#search-input').fill('unfindable green underwater snow shoes');
  await expect(page.locator('[data-search-notify]')).toBeVisible({timeout:30000});
  await page.locator('[data-search-notify]').click();
  await expect.poll(()=>subscribed).toBe('unfindable green underwater snow shoes');
  await expect(page.locator('#auth-container')).toBeHidden();await context.close();
});
