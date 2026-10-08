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
