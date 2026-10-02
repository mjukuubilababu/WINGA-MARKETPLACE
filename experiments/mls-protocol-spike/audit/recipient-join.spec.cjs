const {test,expect}=require('@playwright/test');
const {startAuditServer}=require('./server.cjs');let app,contexts;
test.beforeEach(async()=>{contexts=[];app=await startAuditServer({auditOnly:true});});
test.afterEach(async()=>{for(const c of contexts)await c.close();await app.close();});
async function device(browser,owner){const context=await browser.newContext();contexts.push(context);await context.route('**/ui.js',r=>r.fulfill({contentType:'text/javascript',body:''}));const page=await context.newPage();await page.goto(app.origin);const identity=await page.evaluate(async owner=>{window.c=WingaAudit.createClient();return c.login(owner,'local-audit-only');},owner);return{page,context,identity};}
async function pin(a,b){await a.page.evaluate(i=>c.trustDevice(i.deviceId,i.fingerprint),b.identity);}
async function initial(a,b){await pin(a,b);await pin(b,a);return a.page.evaluate(owner=>c.createRoom(owner),b.identity.owner);}
const add=(a,b,room)=>a.page.evaluate(({room,id})=>c.addDevice(room,id),{room,id:b.identity.deviceId});

test('recipient preflight rejects text and media without advancing state or writing an outbox',async({browser})=>{
 const alice=await device(browser,'alice'),bob=await device(browser,'bob'),room=await initial(alice,bob);
 const snapshot=p=>p.evaluate(async room=>({bytes:Array.from((await c.vault.get(`group:${room}`)).bytes),history:await c.history(room),pending:await c.vault.list('pending:'),clock:await c.vault.get('clock')}),room);
 const before=await snapshot(alice.page);
 await expect(alice.page.evaluate(room=>c.sendText(room,'must remain unsent'),room)).rejects.toThrow('recipient_not_joined');
 await expect(alice.page.evaluate(room=>c.sendMedia(room,new Blob(['private bytes']),{name:'private.txt',mime:'text/plain'}),room)).rejects.toThrow('recipient_not_joined');
 expect(await snapshot(alice.page)).toEqual(before);
 expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_messages')).rows[0].n).toBe(0);
 expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_media')).rows[0].n).toBe(0);
 await add(alice,bob,room);await bob.page.evaluate(()=>c.sync());
 const sent=await alice.page.evaluate(room=>c.sendText(room,'after joining'),room);expect(sent.status).toBe('sent');await bob.page.evaluate(()=>c.sync());
 expect((await bob.page.evaluate(room=>c.history(room),room))[0].text).toBe('after joining');
});

test('definitely rejected legacy pending message preserves failed history and permits recipient joining',async({browser})=>{
 const alice=await device(browser,'alice'),bob=await device(browser,'bob'),room=await initial(alice,bob);
 await alice.context.route('**/api/messages',r=>r.abort('connectionfailed'));
 // Reconstruct a queue made by the old client: bypass only new preflight,
 // while the real server roster still contains one device and accepts no message.
 const legacy=await alice.page.evaluate(async({room,device})=>{const actual=c.rooms.bind(c);c.rooms=async()=>{const rooms=await actual();return rooms.map(r=>r.id===room?{...r,devices:[...r.devices,{id:device,status:'active',owner:'bob'}]}:r);};try{return await c.sendText(room,'old queued text retained');}finally{c.rooms=actual;}},{room,device:bob.identity.deviceId});
 expect(legacy.status).toBe('pending');await alice.context.unroute('**/api/messages');
 const ratchet=await alice.page.evaluate(async room=>Array.from((await c.vault.get(`group:${room}`)).bytes),room);
 await alice.page.evaluate(()=>c.flush());
 expect(await alice.page.evaluate(async room=>Array.from((await c.vault.get(`group:${room}`)).bytes),room)).toEqual(ratchet);
 const failed=(await alice.page.evaluate(room=>c.history(room),room))[0];expect(failed.text).toBe('old queued text retained');expect(failed.status).toBe('failed');expect(failed.id).toBe(legacy.id);
 expect(await alice.page.evaluate(()=>c.vault.list('pending:'))).toHaveLength(0);
 await add(alice,bob,room);await bob.page.evaluate(()=>c.sync());
 const message=await alice.page.evaluate(room=>c.sendText(room,'new epoch after join'),room);expect(message.status).toBe('sent');await bob.page.evaluate(()=>c.sync());
 expect((await bob.page.evaluate(room=>c.history(room),room)).map(r=>r.text)).toEqual(['new epoch after join']);
 expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_messages')).rows[0].n).toBe(1);
 expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_receipts WHERE message_id=$1',[legacy.id])).rows[0].n).toBe(0);
});

test('accepted but lost response remains canonical when recipient later leaves',async({browser})=>{
 const alice=await device(browser,'alice'),bob=await device(browser,'bob'),room=await initial(alice,bob);await add(alice,bob,room);await bob.page.evaluate(()=>c.sync());
 await alice.context.route('**/api/messages',async r=>{await r.fetch();await r.abort('connectionfailed');});
 const pending=await alice.page.evaluate(room=>c.sendText(room,'accepted reply lost'),room);expect(pending.status).toBe('pending');await alice.context.unroute('**/api/messages');
 // Model the later singleton server roster; idempotency must win before rejection.
 await app.db.query('UPDATE audit_members SET active=FALSE WHERE room_id=$1 AND device_id=$2',[room,bob.identity.deviceId]);
 await alice.page.evaluate(()=>c.flush());
 const item=(await alice.page.evaluate(room=>c.history(room),room)).find(r=>r.id===pending.id);expect(item.status).toBe('sent');
 expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_messages')).rows[0].n).toBe(1);
 expect(await alice.page.evaluate(()=>c.vault.list('pending:'))).toHaveLength(0);
});

test('compose explains missing selection and missing recipient while retaining the typed message',async({browser})=>{
 const alice=await device(browser,'alice'),bob=await device(browser,'bob');await initial(alice,bob);
 await alice.context.unroute('**/ui.js');await alice.page.reload();await expect(alice.page.locator('#workspace')).toBeVisible();
 await alice.page.locator('#text').fill('keep my typed message');await alice.page.locator('#compose button').click();
 await expect(alice.page.locator('#notice')).toContainText('Chagua conversation');await expect(alice.page.locator('#text')).toHaveValue('keep my typed message');
 await alice.page.locator('.room-button').click();await alice.page.locator('#compose button').click();
 await expect(alice.page.locator('#notice')).toContainText('Kifaa cha recipient bado hakijaongezwa');await expect(alice.page.locator('#text')).toHaveValue('keep my typed message');
 await expect(alice.page.locator('#notice')).toContainText('Join Conversation');
});
