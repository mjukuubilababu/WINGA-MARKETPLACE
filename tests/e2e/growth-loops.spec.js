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
  await page.locator('#product-detail-modal [data-share-product="'+product.id+'"]').first().click();
  await expect(page.locator('#media-action-sheet')).toBeVisible();
  expect(await page.evaluate(()=>window.__copiedGrowthLink||'')).toBe('');
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
  const dialog=page.locator('dialog[data-internal-share]');
  await expect(dialog.locator('[data-share-person="market_seller"]')).toBeVisible();
  await expect(dialog.locator('[data-share-person="legacy_peer"]')).toBeVisible();
  expect(await page.evaluate(()=>window.__internalShares.length)).toBe(0);
  await dialog.locator('[data-share-person="market_seller"]').click();
  await expect(dialog.locator('[role=status]')).toContainText('Unable to share');
  await dialog.locator('[data-share-person="market_seller"]').click();
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

test('product Share keeps Winga and external choices explicit and returns internal sharing after auth',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request);
  await context.addInitScript(()=>{
    window.__nativeShareCalls=[];
    Object.defineProperty(navigator,'share',{value:async value=>{window.__nativeShareCalls.push(value);},configurable:true});
  });
  await page.goto('/product/'+product.id);
  await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  const share=page.locator('#product-detail-modal [data-share-product="'+product.id+'"]').first();
  await share.click();
  const sheet=page.locator('#media-action-sheet');
  await expect(sheet.locator('[data-media-action="share-winga"]')).toBeVisible();
  await expect(sheet.locator('[data-media-action="share-whatsapp"]')).toBeVisible();
  await expect(sheet.locator('[data-media-action="share-external"]')).toBeVisible();
  expect(await page.evaluate(()=>window.__nativeShareCalls.length)).toBe(0);
  expect(await page.evaluate(()=>window.__copiedGrowthLink||'')).toBe('');
  await sheet.locator('[data-media-action="share-copy"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/product/'+product.id+'?share=');
  await expect(page.locator('#auth-container')).toBeHidden();
  await share.click();await sheet.locator('[data-media-action="share-external"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__nativeShareCalls.length)).toBe(1);
  const native=await page.evaluate(()=>window.__nativeShareCalls[0]);
  expect(new URL(native.url).pathname).toBe('/product/'+product.id);
  await share.click();await sheet.locator('[data-media-action="share-winga"]').click();
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.evaluate(()=>{
    WingaDataLayer.loadInboxPage=async()=>({items:[{withUser:'market_seller',encrypted:true}]});
    WingaDataLayer.shoppingRoom=async()=>[];
  });
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');
  await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  const internal=page.locator('dialog[data-internal-share]');
  await expect(internal.locator('[data-share-person="market_seller"]')).toBeVisible();
  await expect(page.locator('#product-detail-title')).toHaveText(product.name);
  await expect(page).toHaveURL(new RegExp('/product/'+product.id+'(?:\\?|$)'));
  await context.close();
});

test('visible feed Share opens Winga choices and copies the selected product rather than its seller profile',async({browser,request})=>{
  const {context,page}=await guest(browser,request);
  await page.goto('/');
  const share=page.locator('#products-container [data-share-product]').first();
  await expect(share).toBeVisible({timeout:30000});
  const id=await share.getAttribute('data-share-product');
  await share.click();
  const sheet=page.locator('#media-action-sheet');
  await expect(sheet.locator('[data-media-action="share-winga"]')).toBeVisible();
  expect(await page.evaluate(()=>window.__copiedGrowthLink||'')).toBe('');
  await sheet.locator('[data-media-action="share-copy"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/product/'+id);
  expect(await page.evaluate(()=>window.__copiedGrowthLink)).not.toContain('/profile/');
  await expect(page.locator('#auth-container')).toBeHidden();
  await context.close();
});

test('public collection internal sharing uses live rich cards and stable encrypted Room sends',async({browser,request})=>{
  const {context,page,product}=await guest(browser,request,{growthInternalContentSharing:true});
  const id=await collectionPreview(context,product);await page.goto('/collection/'+id);
  const preview=page.locator('[data-collection-id="'+id+'"]');
  await expect(preview.getByRole('heading')).toHaveText('Help choose a gift',{timeout:30000});
  await preview.getByRole('button',{name:/^(Share to Winga|Shiriki ndani ya Winga)$/,exact:true}).click();
  await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  await page.evaluate(()=>{
    window.__contentShares=[];WingaDataLayer.loadInboxPage=async()=>({items:[{withUser:'market_seller',encrypted:true}]});
    WingaDataLayer.shoppingRoom=async(action,args)=>action==='list'?[{id:'11111111-1111-4111-8111-111111111111',name:'Choose together',status:'active',transition:{status:'accepted'}}]:
      (window.__contentShares.push({action,args}),{id:args[2]});
    WingaDataLayer.sendRichMessage=async(peer,content,options)=>(window.__contentShares.push({peer,content,options}),{id:options.clientMessageId});
  });
  await page.evaluate(id=>openInternalProductShare(id,'COLLECTION'),id);
  const dialog=page.locator('dialog[data-internal-share]');
  await dialog.locator('[data-share-person="market_seller"]').click();
  await expect(dialog.locator('[role=status]')).toHaveText('Shared.');
  await dialog.getByRole('button',{name:'Choose together',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__contentShares.length)).toBe(2);
  const sent=await page.evaluate(()=>window.__contentShares);
  expect(sent[0].content.type).toBe('collection');expect(sent[0].content.data.ids).toEqual([id]);
  expect(sent[1].action).toBe('send');expect(sent[1].args[1]).toContain('WINGA-CONTENT/1\n');
  expect(JSON.parse(sent[1].args[1].split('\n')[1]).data.ids).toEqual([id]);
  expect(sent[1].args[2]).toMatch(/^[a-f0-9-]{36}$/);await context.close();
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

test('authorized Opportunity link preserves exact context and reveals details only after authentication',async({browser,request})=>{
  const {context,page}=await guest(browser,request),id='opp_growth_fixture';let reads=0;
  await context.route('**/api/opportunities/'+id,route=>{reads++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({opportunityId:id,type:'zero_result',queryKey:'white-maxi-dress',category:'wanawake-magauni',region:'mwanza',demandScore:1,evidenceCount:1,status:'open',expiresAt:new Date(Date.now()+86400000).toISOString(),metadata:{evidenceLevel:'single_signal'}})});});
  await page.goto('/opportunity/'+id);
  const dialog=page.locator('[data-opportunity-id="'+id+'"]');
  await expect(dialog.locator('[role=status]')).toContainText(/Sign in|Ingia/,{timeout:30000});expect(reads).toBe(0);
  await dialog.getByRole('button',{name:/^(Sign in|Ingia)$/i}).click();await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(dialog).toBeVisible({timeout:30000});await expect(dialog).toContainText('white maxi dress');
  await expect(page).toHaveURL('/opportunity/'+id);expect(reads).toBeGreaterThan(0);
  expect(await page.evaluate(()=>localStorage.getItem('winga-pending-guest-intent'))).toBeNull();await context.close();
});

test('utility seller referral delivers a privacy-safe guest preview and exact authenticated opportunity',async({browser,request})=>{
  const {context,page}=await guest(browser,request),id=randomUUID();
  await context.route('**/api/growth/referrals/'+id,route=>{
    const authorized=/winga_auth=/.test(route.request().headers().cookie||'')||Boolean(route.request().headers().authorization);
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schemaVersion:1,referralId:id,purpose:'supply_for_real_demand',category:'dress',evidenceLevel:'single_signal',measurementEnabled:true,opportunityDestination:authorized?'/opportunity/opp_referred':null})});
  });
  await context.route('**/api/opportunities/opp_referred',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({opportunityId:'opp_referred',queryKey:'white-maxi-dress',category:'dress',demandScore:1,evidenceCount:1})}));
  await page.goto('/seller-referral/'+id);
  const preview=page.locator('[data-seller-referral-id="'+id+'"]');
  await expect(preview).toContainText(/single demand signal|demand signal moja/,{timeout:30000});await expect(page.locator('#auth-container')).toBeHidden();
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('winga-growth-outbox-v1')||'[]').some(e=>e.payload.shareId===id&&e.payload.eventType==='seller_referral_opened'),id)).toBe(true);
  await preview.getByRole('button',{name:/^(Sign in|Ingia)$/i}).click();await expect(page.locator('#auth-container')).toBeVisible();
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(preview).toBeVisible({timeout:30000});await expect(page).toHaveURL('/seller-referral/'+id);
  await preview.getByRole('button',{name:/^(Supply opportunities|Fursa za bidhaa)$/}).click();
  await expect(page.locator('[data-opportunity-id="opp_referred"]')).toContainText('white maxi dress');await expect(page).toHaveURL('/opportunity/opp_referred');
  await context.close();
});

test('seller utility referral waits for canonical creation and shares only its opaque ID',async({browser,request})=>{
  const {context,page}=await guest(browser,request,{growthSellerReferral:true}),canonicalId=randomUUID();let posted;
  await context.route('**/api/opportunities/opp_source',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({opportunityId:'opp_source',queryKey:'white-maxi-dress',category:'dress',demandScore:1,evidenceCount:1})}));
  await context.route('**/api/growth/shares',route=>{posted=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({shareId:canonicalId,duplicate:true})});});
  await page.goto('/opportunity/opp_source');await page.locator('[data-opportunity-id] button').filter({hasText:/^(Sign in|Ingia)$/i}).click();
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  const opportunity=page.locator('[data-opportunity-id="opp_source"]');await expect(opportunity).toContainText('white maxi dress',{timeout:30000});
  await opportunity.getByRole('button',{name:/^(Share this supply opportunity|Shiriki supply opportunity hii)$/}).click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/seller-referral/'+canonicalId);
  expect(posted.contentType).toBe('SELLER_REFERRAL');expect(posted.contentId).toBe('opp_source');
  const copied=await page.evaluate(()=>window.__copiedGrowthLink);expect(copied).not.toContain('opp_source');
  const url=new URL(copied.split('\n').at(-1));expect(url.search).toBe('');await context.close();
});

test('account rollout keeps guest measurement off and enables only the authenticated cohort response',async({browser,request})=>{
 const {context,page,product}=await guest(browser,request,{growthAccountRolloutEnabled:true,growthProductSharing:false,growthMeasurement:false});
 let capabilityRequests=0;const shareId=randomUUID();
 await context.route('**/api/growth/capabilities',route=>{capabilityRequests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schemaVersion:1,account:'buyer_seller',productSharing:true,measurement:true})});});
 await page.goto('/product/'+product.id+'?share='+shareId);await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
 expect(capabilityRequests).toBe(0);expect(await page.evaluate(()=>WingaGrowth.getJourney().touches.length)).toBe(0);
 await page.locator('#product-detail-modal [data-buy-product]').first().click();await page.locator('#auth-gate-login').click();
 await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
 await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});await expect.poll(()=>page.evaluate(()=>WINGA_CONFIG.growthMeasurement)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>WingaGrowth.getJourney().firstTouch?.shareId)).toBe(shareId);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('winga-growth-outbox-v1')||'[]').some(x=>x.payload.eventType==='shared_product_viewed'))).toBe(true);
 await page.evaluate(id=>openMediaActionSheet(getProductById(id)),product.id);await page.locator('[data-media-action="share-copy"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('?share=');
 await page.evaluate(()=>logout());expect(await page.evaluate(()=>WINGA_CONFIG.growthMeasurement)).toBe(false);expect(await page.evaluate(()=>WINGA_CONFIG.growthProductSharing)).toBe(false);
 await context.close();
});

test('account rollout outage leaves exact public content and plain sharing available after real authentication',async({browser,request})=>{
 const {context,page,product}=await guest(browser,request,{growthAccountRolloutEnabled:true,growthProductSharing:false,growthMeasurement:false});
 await page.goto('/product/'+product.id);await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
 await page.locator('#product-detail-modal [data-buy-product]').first().click();await page.locator('#auth-gate-login').click();
 await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
 await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});await expect(page.locator('#product-detail-title')).toHaveText(product.name);
 await page.evaluate(id=>openMediaActionSheet(getProductById(id)),product.id);await page.locator('[data-media-action="share-copy"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/product/'+product.id);
 expect(await page.evaluate(()=>window.__copiedGrowthLink)).not.toContain('?share=');expect(await page.evaluate(()=>WINGA_CONFIG.growthMeasurement)).toBe(false);
 await context.close();
});

async function recipientPicker(browser,request,{recent=[],rooms=[]}={}) {
  const setup=await guest(browser,request);const {page,product}=setup;
  await page.goto('/product/'+product.id);
  await expect(page.locator('#product-detail-title')).toHaveText(product.name,{timeout:30000});
  await page.locator('#product-detail-modal [data-share-product]').first().click();
  await page.locator('[data-media-action=share-winga]').click();
  await page.evaluate(({recent,rooms})=>{
    window.__recipientSends=[];window.__peopleQueries=[];
    WingaDataLayer.getUsers=()=>[];
    WingaDataLayer.loadInboxPage=async()=>({items:recent});
    WingaDataLayer.shoppingRoom=async action=>action==='list'?rooms:{id:crypto.randomUUID()};
    WingaDataLayer.searchPeople=async query=>{window.__peopleQueries.push(query);return {items:[]};};
    WingaDataLayer.sendRichMessage=async(peer,content,options)=>{window.__recipientSends.push({peer,content,options});return {id:options.clientMessageId};};
  },{recent,rooms});
  await page.locator('#auth-gate-login').click();await page.locator('#username').fill('buyer_seller');await page.locator('#password').fill('Pass1234!Secure');await page.locator('#auth-button').click();
  await expect(page.locator('#header-user-trigger')).toBeVisible({timeout:30000});
  const picker=page.locator('dialog[data-internal-share]');await expect(picker).toBeVisible();
  return {...setup,picker,search:picker.locator('[data-share-recipient-search]')};
}

test('empty Share to Winga history can search a new person and send a rich card explicitly',async({browser,request})=>{
  const {context,page,picker,search,product}=await recipientPicker(browser,request);
  await expect(search).toBeVisible();
  await page.evaluate(()=>{WingaDataLayer.searchPeople=async query=>{window.__peopleQueries.push(query);return {items:[{username:'new_person',fullName:'New Friend'}]};};});
  await search.fill('New');
  const person=picker.locator('[data-share-person=new_person]');await expect(person).toBeVisible();
  expect(await page.evaluate(()=>window.__recipientSends.length)).toBe(0);
  await person.click();await expect.poll(()=>page.evaluate(()=>window.__recipientSends.length)).toBe(1);
  const sent=await page.evaluate(()=>window.__recipientSends[0]);expect(sent.peer).toBe('new_person');expect(sent.content.type).toBe('product');expect(sent.content.data.ids).toEqual([product.id]);
  await search.fill('');await search.fill('New');await expect.poll(()=>page.evaluate(()=>window.__peopleQueries.length)).toBeGreaterThan(1);
  await expect(picker.locator('[data-share-person=new_person]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__recipientSends.length)).toBe(1);await context.close();
});

test('recent people without an encrypted inbox marker remain visible and retry IDs survive filtering',async({browser,request})=>{
  const {context,page,picker,search}=await recipientPicker(browser,request,{recent:[{withUser:'market_seller'}]});
  await page.evaluate(()=>{WingaDataLayer.sendRichMessage=async(peer,content,options)=>{window.__recipientSends.push({peer,content,options});if(window.__recipientSends.length===1)throw Error('offline');return {id:options.clientMessageId};};});
  await picker.locator('[data-share-person=market_seller]').click();await expect(picker.locator('[role=status]').first()).toContainText('Unable to share');
  await search.fill('unrelated');await expect(picker.locator('[data-share-person=market_seller]')).toHaveCount(0);
  await search.fill('');await picker.locator('[data-share-person=market_seller]').click();
  await expect.poll(()=>page.evaluate(()=>window.__recipientSends.length)).toBe(2);
  const sends=await page.evaluate(()=>window.__recipientSends);expect(sends[0].options.clientMessageId).toBe(sends[1].options.clientMessageId);await context.close();
});

test('people search ignores stale replies and Room search uses only ready memberships',async({browser,request})=>{
  const roomId='11111111-1111-4111-8111-111111111111';
  const {context,page,picker,search}=await recipientPicker(browser,request,{rooms:[...Array.from({length:30},(_,i)=>({id:'recent-room-'+i,name:'Other choices '+i,status:'active',transition:{status:'accepted'}})),{id:roomId,name:'Gift choices',status:'active',transition:{status:'accepted'}},{id:'closed',name:'Private closed',status:'closed',transition:{status:'accepted'}}]});
  await page.evaluate(()=>{WingaDataLayer.searchPeople=query=>{window.__peopleQueries.push(query);return query==='rey'?new Promise(resolve=>{window.__oldPeopleReply=resolve;}):Promise.resolve({items:query==='jan'?[{username:'janeth',fullName:'Janeth'}]:[]});};});
  await search.fill('rey');await expect.poll(()=>page.evaluate(()=>typeof window.__oldPeopleReply)).toBe('function');
  await search.fill('jan');await expect(picker.locator('[data-share-person=janeth]')).toBeVisible();
  await page.evaluate(()=>window.__oldPeopleReply({items:[{username:'rey',fullName:'Rey'}]}));
  await expect(picker.locator('[data-share-person=rey]')).toHaveCount(0);await expect(picker.locator('[data-share-person=janeth]')).toBeVisible();
  await picker.locator('[data-share-filter=rooms]').click();await expect(picker.locator('[data-share-person=janeth]')).toHaveCount(0);
  await search.fill('Gift');await expect(picker.locator('[data-share-room="'+roomId+'"]').first()).toBeVisible();
  await picker.locator('[data-share-filter=people]').click();await expect(picker.locator('[data-share-room="'+roomId+'"]')).toHaveCount(0);
  await picker.locator('[data-share-filter=all]').click();await expect(picker.locator('[data-share-room="'+roomId+'"]')).toBeVisible();
  await expect(picker.locator('[data-share-room=closed]')).toHaveCount(0);expect(await page.evaluate(()=>window.__recipientSends.length)).toBe(0);await context.close();
});

test('first individual sharing reuses secure setup without a plaintext fallback or a second action ID',async({browser,request})=>{
  const {context,page,picker}=await recipientPicker(browser,request,{recent:[{withUser:'market_seller'}]});
  await page.evaluate(()=>{
    window.__shareSecureReady=false;window.__plainSends=0;
    WingaDataLayer.sendMessage=async()=>{window.__plainSends++;};
    WingaDataLayer.inspectEncryptedConversation=async()=>({status:window.__shareSecureReady?'active':'available'});
    WingaDataLayer.sendRichMessage=async(peer,content,options)=>{window.__recipientSends.push({peer,content,options});if(!window.__shareSecureReady)throw Object.assign(Error('setup'),{code:'mls_runtime_required'});return {id:options.clientMessageId};};
    WingaEncryptedChatUi.bind=(scope,options)=>{scope.querySelector('[data-chat-security]').onclick=async()=>{window.__shareSecureReady=true;await options.refresh();};};
  });
  await picker.locator('[data-share-person=market_seller]').click();
  await expect(picker.locator('[data-chat-security=market_seller]')).toBeVisible();expect(await page.evaluate(()=>window.__plainSends)).toBe(0);
  await picker.locator('[data-chat-security=market_seller]').click();await expect.poll(()=>page.evaluate(()=>window.__recipientSends.length)).toBe(2);
  const sends=await page.evaluate(()=>window.__recipientSends);expect(sends[0].options.clientMessageId).toBe(sends[1].options.clientMessageId);expect(await page.evaluate(()=>window.__plainSends)).toBe(0);await context.close();
});

test('unavailable people search retains recent contacts and invitation shares only public product context',async({browser,request})=>{
  const {context,page,picker,search,product}=await recipientPicker(browser,request,{recent:[{withUser:'market_seller'}]});
  await page.evaluate(()=>{WingaDataLayer.searchPeople=async()=>{throw Error('directory unavailable');};});
  await search.fill('market');await expect(picker.locator('[data-share-person=market_seller]')).toBeVisible();
  await expect(picker.locator('[role=status]').first()).toContainText(/unavailable|haipatikani/i);
  await picker.getByRole('button',{name:/Invite someone|Mwalike mtu/}).click();
  await expect.poll(()=>page.evaluate(()=>window.__copiedGrowthLink||'')).toContain('/product/'+product.id);
  expect(await page.evaluate(()=>window.__copiedGrowthLink)).not.toContain('market');await context.close();
});

test('share picker owns the native security dialog and closes both on a session change',async({browser,request})=>{
  const {context,page,picker}=await recipientPicker(browser,request,{recent:[{withUser:'market_seller'}]});
  await page.evaluate(()=>{
    WingaDataLayer.inspectEncryptedConversation=async()=>({status:'available',packages:[]});
    WingaDataLayer.sendRichMessage=async()=>{throw Object.assign(Error('setup'),{code:'mls_runtime_required'});};
  });
  await picker.locator('[data-share-person=market_seller]').click();
  await picker.locator('[data-chat-security=market_seller]').click();
  const security=page.locator('dialog.chat-security-dialog:not([data-internal-share])');await expect(security).toBeVisible();
  await expect(security).toContainText(/no available encryption device|hana kifaa cha encryption/i);
  await page.evaluate(()=>{currentSession={...currentSession,sessionId:'changed-session'};});
  await expect(picker).toHaveCount(0);await expect(security).toHaveCount(0);
  expect(await page.evaluate(()=>window.__recipientSends.length)).toBe(0);await context.close();
});

test('a delayed people reply cannot survive an account session change',async({browser,request})=>{
  const {context,page,picker,search}=await recipientPicker(browser,request);
  await page.evaluate(()=>{WingaDataLayer.searchPeople=()=>new Promise(resolve=>{window.__lateRecipientReply=resolve;});});
  await search.fill('new');await expect.poll(()=>page.evaluate(()=>typeof window.__lateRecipientReply)).toBe('function');
  await page.evaluate(()=>{currentSession={...currentSession,sessionId:'changed-session'};window.__lateRecipientReply({items:[{username:'new_person',fullName:'New Friend'}]});});
  await expect(picker).toHaveCount(0);await expect(page.locator('[data-share-person=new_person]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__recipientSends.length)).toBe(0);await context.close();
});
