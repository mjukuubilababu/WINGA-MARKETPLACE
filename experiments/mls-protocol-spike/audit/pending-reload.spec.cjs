const {test,expect}=require('@playwright/test');
const {startAuditServer}=require('./server.cjs');let app,contexts;
test.beforeEach(async()=>{contexts=[];app=await startAuditServer({auditOnly:true});});
test.afterEach(async()=>{for(const context of contexts)await context.close();await app.close();});
async function device(browser,owner){const context=await browser.newContext();contexts.push(context);await context.route('**/ui.js',route=>route.fulfill({contentType:'text/javascript',body:''}));const page=await context.newPage();await page.goto(app.origin);const identity=await page.evaluate(async owner=>{window.c=WingaAudit.createClient();return c.login(owner,'local-audit-only');},owner);return{page,context,identity};}
test('reload retires three legacy rejected sends and UI can join recipient and deliver a fresh message',async({browser})=>{
const eve=await device(browser,'eve'),alice=await device(browser,'alice');
await eve.page.evaluate(identity=>c.trustDevice(identity.deviceId,identity.fingerprint),alice.identity);
await alice.page.evaluate(identity=>c.trustDevice(identity.deviceId,identity.fingerprint),eve.identity);
const room=await eve.page.evaluate(()=>c.createRoom('alice'));
await eve.context.route('**/api/messages',route=>route.abort('connectionfailed'));
await eve.page.evaluate(async({room,device})=>{const real=c.rooms.bind(c);c.rooms=async()=>{const rooms=await real();return rooms.map(r=>r.id===room?{...r,devices:[...r.devices,{id:device,owner:'alice',status:'active'}]}:r);};try{for(let i=0;i<3;i++)await c.sendText(room,'fgfgfg');}finally{c.rooms=real;}},{room,device:alice.identity.deviceId});
const ratchet=await eve.page.evaluate(async room=>Array.from((await c.vault.get(`group:${room}`)).bytes),room);
await eve.context.unroute('**/api/messages');await eve.context.unroute('**/ui.js');await eve.page.reload();
await expect(eve.page.locator('.room-button')).toBeEnabled();await eve.page.locator('.room-button').click();
await expect(eve.page.locator('#messages article')).toHaveCount(3);
await expect(eve.page.locator('#messages small')).toHaveText(['eve / failed','eve / failed','eve / failed']);
const check=await eve.page.evaluate(async room=>{const client=WingaAudit.createClient();await client.resume();return{pending:(await client.vault.list('pending:')).length,ratchet:Array.from((await client.vault.get(`group:${room}`)).bytes)};},room);
expect(check.pending).toBe(0);expect(check.ratchet).toEqual(ratchet);
await eve.page.locator('#device-list').selectOption(alice.identity.deviceId);await eve.page.locator('#expected').fill(alice.identity.fingerprint);await eve.page.locator('#trust').click();await expect(eve.page.locator('#add')).toBeEnabled();await eve.page.locator('#add').click();await expect(eve.page.locator('.room-button')).toContainText('epoch 1');
await alice.page.evaluate(()=>c.sync());await eve.page.locator('#text').fill('after recipient join');await eve.page.locator('#compose button').click();await expect(eve.page.locator('#messages small').last()).toHaveText('eve / sent');
await alice.page.evaluate(()=>c.sync());expect((await alice.page.evaluate(room=>c.history(room),room)).map(row=>row.text)).toEqual(['after recipient join']);
expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_messages')).rows[0].n).toBe(1);
});
