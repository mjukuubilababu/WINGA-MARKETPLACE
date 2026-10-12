const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const apiBaseUrl = 'http://127.0.0.1:43080/api';

async function guest(browser, request) {
  const response = await request.get(apiBaseUrl+'/products?limit=50');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const products = Array.isArray(body) ? body : body.items;
  const product = [...products].reverse().find(p => p.status==='approved' && p.availability==='available' && p.image && Number(p.price)>0);
  expect(product).toBeTruthy();
  const context = await browser.newContext();
  await context.addInitScript(base => {
    window.__WINGA_CONFIG_OVERRIDE__ = {provider:'api',apiBaseUrl:base,growthProductSharing:true,growthMeasurement:true,disableServiceWorker:true};
    Object.defineProperty(navigator,'share',{value:undefined,configurable:true});
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copiedGrowthLink=text;}},configurable:true});
  },apiBaseUrl);
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
