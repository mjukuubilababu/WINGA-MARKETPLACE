const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
async function fixture(page) {
  await page.setContent('<main id="analytics"></main>');
  await page.evaluate(()=>{window.WingaModules={admin:{},api:{admin:{}}};});
  await page.addScriptTag({path:path.resolve('src/api/admin-client.js')});
  await page.addScriptTag({path:path.resolve('src/admin/ui.js')});
  await page.evaluate(()=>{
    window.__ops={session:{},admin:true,calls:[],urls:[],revoked:[]};
    const ops=window.__ops;
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);ops.urls.push(url);return url;};
    URL.revokeObjectURL=url=>{ops.revoked.push(url);revoke(url);};
    const el=(tag,props={})=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(props)){
      if(value===undefined)continue;
      if(key==='attributes')for(const [attr,text] of Object.entries(value))node.setAttribute(attr,text);else node[key]=value;
    }return node;};
    const client=window.WingaModules.api.admin.createAdminApiClient({baseUrl:'/api',createAuthHeaders:()=>({'X-Fixture':'synthetic-only'}),fetchJson:async(url,options)=>{
      ops.calls.push({url,method:options.method||'GET',timeoutMs:options.timeoutMs});
      if(url.endsWith('/rooms'))throw Error('fixture analytics outage');
      if(url.endsWith('/network'))return {schemaVersion:1,windowDays:30,conversation:{entryCount:2},trust:{},follow:{}};
      if(url.endsWith('/events'))return {schemaVersion:1,enabled:true,states:[{status:'pending',count:3,maxAttempts:5,oldestAgeSeconds:72000}]};
      return {schemaVersion:1,windowDays:30,cohort:{entryCount:4,recipientJourneys:2,activationRate:null},userId:'SECRET_USER',inviteToken:'SECRET_TOKEN',limitations:['SECRET_MESSAGE']};
    }});
    const ui=window.WingaModules.admin.createAdminUiModule({createElement:el,createSectionHeading:()=>el('h2'),createEmptyState:text=>el('p',{textContent:text}),getAnalyticsPanel:()=>document.querySelector('#analytics'),
      formatNumber:String,isAdminUser:()=>ops.admin,getCurrentUser:()=> 'fixture-admin',getCurrentSession:()=>ops.session,isAdminAnalyticsContext:()=>ops.admin,
      loadGrowthLoopReports:()=>client.loadGrowthLoopReports(),translate:(_key,_vars,fallback)=>fallback});
    ui.renderAnalyticsPanel({topCategories:[],recentProducts:[]},'Fixture admin','');
  });
  await expect(page.locator('[data-growth-export]')).toBeVisible();
}
test('real browser downloads the existing aggregate reports without identities or mutations',async({page})=>{
  await fixture(page);
  const downloaded=page.waitForEvent('download');await page.locator('[data-growth-export]').click();
  const download=await downloaded;expect(download.suggestedFilename()).toMatch(/^winga-growth-.*\.json$/);
  const raw=await fs.readFile(await download.path(),'utf8'),body=JSON.parse(raw);
  expect(raw).not.toMatch(/SECRET_USER|SECRET_TOKEN|SECRET_MESSAGE/);
  expect(body.reports).toHaveLength(13);expect(body.productionReady).toBe(false);
  expect(body.reports.find(r=>r.loop==='room')).toEqual({loop:'room',status:'unavailable',windowDays:null,metrics:null});
  expect(body.reports.find(r=>r.loop==='conversation').windowDays).toBe(30);
  expect(body.reports.find(r=>r.loop==='delivery').metrics['pending.oldestAgeSeconds']).toBe(72000);
  expect(body.reports.find(r=>r.loop==='product').metrics['cohort.activationRate']).toBeNull();
  expect(await page.evaluate(()=>__ops.calls.every(c=>c.method==='GET'&&c.timeoutMs===8000))).toBe(true);
  await expect(page.locator('[role=status]')).toHaveText('Snapshot download started.');
  await expect.poll(()=>page.evaluate(()=>__ops.revoked.length)).toBe(1);
  expect(await page.evaluate(()=>document.querySelectorAll('a[download]').length)).toBe(0);
});
test('a replaced admin session cannot download the already rendered snapshot',async({page})=>{
  await fixture(page);await page.evaluate(()=>{__ops.session={};});
  await page.locator('[data-growth-export]').click();
  expect(await page.evaluate(()=>__ops.urls.length)).toBe(0);
  await page.evaluate(()=>{__ops.admin=false;});await page.locator('[data-growth-export]').click();
  expect(await page.evaluate(()=>__ops.urls.length)).toBe(0);
});
test('a failed browser download remains contained in the operations panel',async({page})=>{
  await fixture(page);await page.evaluate(()=>{URL.createObjectURL=()=>{throw Error('fixture download failure');};});
  await page.locator('[data-growth-export]').click();
  await expect(page.locator('[role=status]')).toHaveText('Unable to download snapshot. Try again.');
  await expect(page.locator('[data-growth-loop=product]')).toBeVisible();
});
