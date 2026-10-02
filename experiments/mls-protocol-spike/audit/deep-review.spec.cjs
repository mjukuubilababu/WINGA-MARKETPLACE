const { test, expect } = require('@playwright/test');
const { startAuditServer } = require('./server.cjs');
let app, contexts;
test.beforeEach(async () => { contexts=[]; app=await startAuditServer({auditOnly:true}); });
test.afterEach(async () => { for(const context of contexts) await context.close(); await app.close(); });
async function device(browser, owner) {
  const context=await browser.newContext(); contexts.push(context);
  await context.route('**/ui.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
  const page=await context.newPage(); await page.goto(app.origin);
  const identity=await page.evaluate(async owner=>{ window.c=WingaAudit.createClient(); return c.login(owner,'local-audit-only'); },owner);
  return {context,page,identity};
}
const pin=(d,i)=>d.page.evaluate(i=>c.trustDevice(i.deviceId,i.fingerprint),i);
async function room(a,b) {
  await pin(a,b.identity); await pin(b,a.identity);
  const id=await a.page.evaluate(owner=>c.createRoom(owner),b.identity.owner);
  await a.page.evaluate(({id,device})=>c.addDevice(id,device),{id,device:b.identity.deviceId});
  await b.page.evaluate(()=>c.sync()); return id;
}
const result=async (info,value)=>{ console.log(JSON.stringify(value)); await info.attach('observed-evidence',{body:JSON.stringify(value,null,2),contentType:'application/json'}); };
// Trust regressions include a malicious delivery server and replayed recovery history.
test('DEEP-001 regression: queued revocation isolates rooms and permits rekey after a lost commit response',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),eve=await device(browser,'eve');
  const bad=await room(alice,bob),good=await room(alice,eve),second=await device(browser,'bob');
  await bob.page.evaluate(i=>c.approveDevice(i.deviceId,i.fingerprint),second.identity);
  await pin(alice,second.identity); await pin(second,alice.identity); await pin(second,bob.identity);
  await alice.page.evaluate(({room,id})=>c.addDevice(room,id),{room:bad,id:second.identity.deviceId});
  await bob.page.evaluate(()=>c.sync()); await second.page.evaluate(()=>c.sync());
  await alice.context.route('**/api/messages',r=>r.abort('connectionfailed'));
  const pending=await alice.page.evaluate(id=>c.sendText(id,'queued before revocation'),bad);
  await alice.context.unroute('**/api/messages'); expect(pending.status).toBe('pending');
  await bob.page.evaluate(i=>c.revokeDevice(i.deviceId,i.fingerprint),second.identity);
  await alice.page.evaluate(()=>c.flush());
  const before=await alice.page.evaluate(id=>c.vault.get(`pending:${id}`),pending.id);
  expect(before.blockedCode).toBe('room_rekey_required');
  const independent=await alice.page.evaluate(id=>c.sendText(id,'unrelated room should work'),good);
  expect(independent.status).toBe('sent');
  await eve.page.evaluate(id=>c.sendText(id,'independent incoming'),good);
  await alice.page.evaluate(()=>c.sync());
  const data=await alice.page.evaluate(async ({bad,good})=>({pending:(await c.vault.list('pending:')).map(([,j])=>({kind:j.kind,room:j.payload?.roomId})),quarantined:(await c.vault.get(`group:${bad}`)).quarantined===true,goodHistory:(await c.history(good)).map(r=>({text:r.text,status:r.status}))}),{bad,good});
  expect(data.quarantined).toBe(false); expect(data.pending.some(j=>j.room===good&&j.kind==='message')).toBe(false);
  expect(data.goodHistory.some(row=>row.text==='independent incoming')).toBe(true);
  expect((await alice.page.evaluate(id=>c.vault.get(`pending:${id}`),pending.id)).payload).toEqual(before.payload);
  await alice.context.route('**/api/commits',async route=>{await route.fetch();await route.abort('connectionfailed');});
  await expect(alice.page.evaluate(({room,id})=>c.removeDevice(room,id),{room:bad,id:second.identity.deviceId})).rejects.toThrow();
  const commit=await alice.page.evaluate(async()=> (await c.vault.list('pending:')).find(([,job])=>job.kind==='commit')[1]);
  await alice.context.unroute('**/api/commits');
  await alice.page.reload(); await alice.page.evaluate(async()=>{window.c=WingaAudit.createClient();await c.resume();await c.flush();});
  const history=await alice.page.evaluate(id=>c.vault.get(`history:${id}`),pending.id); expect(history.status).toBe('failed');
  expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_operations WHERE id=$1',[commit.id])).rows[0].n).toBe(1);
  expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_messages WHERE id=$1',[pending.id])).rows[0].n).toBe(0);
  await bob.page.evaluate(()=>c.sync());
  const after=await alice.page.evaluate(id=>c.sendText(id,'new epoch after revoked device'),bad); expect(after.status).toBe('sent');
  await bob.page.evaluate(()=>c.sync());
  expect((await bob.page.evaluate(id=>c.history(id),bad)).some(row=>row.text==='new epoch after revoked device')).toBe(true);
  await result(info,{regression:'DEEP-001',roomsIsolated:true,exactPendingPreserved:true,rekeyRetryDeduplicated:true,oldSendNeverAccepted:true});
});
test('DEEP-009 regression: accepted but unacknowledged send is not failed by revocation rekey',async({browser})=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),second=await device(browser,'bob');
  const id=await room(alice,bob);
  await bob.page.evaluate(i=>c.approveDevice(i.deviceId,i.fingerprint),second.identity);
  await pin(alice,second.identity);await pin(second,alice.identity);await pin(second,bob.identity);
  await alice.page.evaluate(({room,device})=>c.addDevice(room,device),{room:id,device:second.identity.deviceId});
  await bob.page.evaluate(()=>c.sync());await second.page.evaluate(()=>c.sync());
  await alice.context.route('**/api/messages',async route=>{await route.fetch();await route.abort('connectionfailed');});
  const uncertain=await alice.page.evaluate(id=>c.sendText(id,'accepted before revocation'),id);expect(uncertain.status).toBe('pending');
  await alice.context.unroute('**/api/messages');
  await bob.page.evaluate(i=>c.revokeDevice(i.deviceId,i.fingerprint),second.identity);
  await alice.page.evaluate(({room,device})=>c.removeDevice(room,device),{room:id,device:second.identity.deviceId});
  expect((await alice.page.evaluate(id=>c.vault.get(`history:${id}`),uncertain.id)).status).toBe('sent');
  expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_messages WHERE id=$1',[uncertain.id])).rows[0].n).toBe(1);
  await bob.page.evaluate(()=>c.sync());expect((await bob.page.evaluate(id=>c.history(id),id)).filter(row=>row.id===uncertain.id)).toHaveLength(1);
});
test('DEEP-002 regression: never-accepted recovered history stays local without blocking the outbox',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'); const oldRoom=await room(alice,bob);
  await alice.context.route('**/api/messages',r=>r.abort('connectionfailed'));
  const pending=await alice.page.evaluate(id=>c.sendText(id,'never reached server'),oldRoom); expect(pending.status).toBe('pending');
  const key=await alice.page.evaluate(()=>c.generateRecoveryKey()); await alice.page.evaluate(key=>c.backup(key),key);
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_messages')).rows[0].count).toBe(0);
  const fresh=await device(browser,'alice'); await alice.page.evaluate(i=>c.approveDevice(i.deviceId,i.fingerprint),fresh.identity);
  const checkpoint=await alice.page.evaluate(()=>c.recoveryCheckpoint());
  expect((await fresh.page.evaluate(({key,checkpoint})=>c.restore(key,{checkpoint}),{key,checkpoint})).restored).toBe(1);
  await fresh.page.evaluate(()=>c.flush());
  expect(await fresh.page.evaluate(()=>c.createRoom('eve'))).toMatch(/^[a-f0-9-]{36}$/);
  const data=await fresh.page.evaluate(async()=>({history:(await c.history()).map(r=>({status:r.status,recovered:r.recovered})),pending:(await c.vault.list('pending:')).map(([,j])=>j.kind)}));
  expect(data.history).toEqual([{status:'pending',recovered:true}]); expect(data.pending).toEqual([]);
  await fresh.page.reload();await fresh.page.evaluate(async()=>{window.c=WingaAudit.createClient();await c.resume();await c.flush();});
  expect((await fresh.page.evaluate(()=>c.history()))[0].status).toBe('pending');
  await result(info,{regression:'DEEP-002',unsentHistoryRetained:true,phantomReceipts:false,outboxBlocked:false});
});
test('DEEP-003 regression: signed expired packages fail publication and malicious-clock admission',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob');
  const mls=await import('ts-mls'),identity=await import('../device-identity.mjs');
  const suite=await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const d=await bob.page.evaluate(async()=>{const d=await c.vault.get('device');return {privateKey:Array.from(d.signaturePrivateKey),publicKey:d.publicKey};});
  const kp=await mls.generateKeyPackageWithKey(identity.syntheticDeviceCredential('bob',bob.identity.deviceId),mls.defaultCapabilities(),
    {notBefore:1n,notAfter:2n},[],{signKey:new Uint8Array(d.privateKey),publicKey:new Uint8Array(Buffer.from(d.publicKey,'base64url'))},suite);
  const wire=Buffer.from(mls.encodeMlsMessage({version:'mls10',wireformat:'mls_key_package',keyPackage:kp.publicPackage}));
  const hash=require('node:crypto').createHash('sha256').update(wire).digest('hex');
  const packed=JSON.stringify(kp,(_,v)=>v instanceof Uint8Array?{$bytes:Buffer.from(v).toString('base64url')}:typeof v==='bigint'?{$integer:String(v)}:v);
  await expect(bob.page.evaluate(async({wire,packed,hash})=>{
    const kp=JSON.parse(packed,(_,v)=>v&&Object.keys(v).length===1?typeof v.$bytes==='string'?Uint8Array.from(atob(v.$bytes.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)):typeof v.$integer==='string'?BigInt(v.$integer):v:v);
    await c.vault.write({[`package:${hash}`]:kp}); await c.request('/api/devices/package','POST',{package:wire});
  },{wire:wire.toString('base64url'),packed,hash})).rejects.toThrow('key_package_expired');
  expect((await app.db.query('SELECT COUNT(*)::int AS n FROM audit_packages WHERE hash=$1',[hash])).rows[0].n).toBe(0);
  // Model a package accepted by an older server, bypassing publication only in
  // this controlled fixture. The current commit boundary must recheck it.
  await app.db.query('INSERT INTO audit_packages VALUES($1,$2,$3,NULL)',[hash,bob.identity.deviceId,wire.toString('base64url')]);
  await app.db.query('DELETE FROM audit_packages WHERE device_id=$1 AND hash<>$2',[bob.identity.deviceId,hash]);
  await pin(alice,bob.identity); await pin(bob,alice.identity);
  const id=await alice.page.evaluate(()=>c.createRoom('bob'));
  // Ordinary honest creation rejects expiry. A custom member can still construct
  // a valid signed commit, modelled here with a sender-only clock and normal HTTP proofs.
  await expect(alice.page.evaluate(({id,device})=>c.addDevice(id,device),{id,device:bob.identity.deviceId})).rejects.toThrow('verified_device_required');
  await expect(alice.page.evaluate(async({id,device,wire})=>{
    const clock=Date.now,request=c.request.bind(c),directory=c.directory.bind(c); const old=()=>1500;
    c.directory=async()=> (await directory()).map(row=>row.id===device?{...row,package:wire}:row);
    c.request=async(...args)=>{Date.now=clock;try{return await request(...args);}finally{Date.now=old;}};
    Date.now=old;try{return await c.addDevice(id,device);}finally{Date.now=clock;c.request=request;c.directory=directory;}
  },{id,device:bob.identity.deviceId,wire:wire.toString('base64url')})).rejects.toThrow('key_package_expired');
  await bob.page.evaluate(()=>c.sync());
  expect((await app.db.query('SELECT epoch FROM audit_rooms WHERE id=$1',[id])).rows[0].epoch).toBe(0);
  expect(await bob.page.evaluate(id=>c.history(id),id)).toHaveLength(0);
  await result(info,{regression:'DEEP-003',expiredPublicationRejected:true,maliciousClockAdmissionRejected:true,joined:false});
});
test('DEEP-004 regression: delivery server cannot forge Read without recipient signing',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),id=await room(alice,bob);
  const message=await alice.page.evaluate(id=>c.sendText(id,'bob has not synced'),id);
  await app.db.query("INSERT INTO audit_events(device_id,room_id,kind,payload) VALUES($1,$2,'receipt',$3)",[alice.identity.deviceId,id,JSON.stringify({id:message.id,kind:'read'})]);
  await alice.page.evaluate(()=>c.sync());
  const status=(await alice.page.evaluate(id=>c.history(id),id))[0].status;
  const genuine=(await app.db.query('SELECT COUNT(*)::int AS count FROM audit_receipts')).rows[0].count;
  expect(status).toBe('sent'); expect(genuine).toBe(0); expect(await bob.page.evaluate(id=>c.history(id),id)).toHaveLength(0);
  await result(info,{regression:'DEEP-004',localStatus:status,genuineReceipts:genuine,recipientHistory:0,forgeryRejected:true});
});
test('DEEP-005 safeguard: media transplant and copied identity cannot bypass AEAD or proof',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),eve=await device(browser,'eve');
  const first=await room(alice,bob),second=await room(alice,eve);
  const a=await alice.page.evaluate(id=>c.sendMedia(id,new Blob(['one']),{name:'one.txt',mime:'text/plain'}),first);
  const b=await alice.page.evaluate(id=>c.sendMedia(id,new Blob(['two']),{name:'two.txt',mime:'text/plain'}),second);
  await bob.page.evaluate(()=>c.sync()); await eve.page.evaluate(()=>c.sync());
  const raw=(await app.db.query('SELECT ciphertext FROM audit_media WHERE id=$1',[b.attachment.attachmentId])).rows[0].ciphertext;
  await app.db.query('UPDATE audit_media SET ciphertext=$2 WHERE id=$1',[a.attachment.attachmentId,raw]);
  await expect(bob.page.evaluate(id=>c.openAttachment(id),a.id)).rejects.toThrow();
  await expect(eve.page.evaluate(async d=>{const prior=c.device.id;c.device.id=d;try{return await c.rooms();}finally{c.device.id=prior;}},alice.identity.deviceId)).rejects.toThrow('device_not_authorized');
  await result(info,{safeguard:'DEEP-005',mediaTransplantRejected:true,copiedDeviceIdRejected:true});
});

test('DEEP-010 regression: server cannot upgrade a valid Stored proof to Read',async({browser})=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),id=await room(alice,bob);
  const message=await alice.page.evaluate(id=>c.sendText(id,'bind receipt to its signed status'),id);
  await bob.page.evaluate(()=>c.sync());await alice.page.evaluate(()=>c.sync());
  expect((await alice.page.evaluate(id=>c.history(id),id))[0].status).toBe('delivered');
  const proof=(await app.db.query("SELECT proof FROM audit_receipts WHERE message_id=$1 AND kind='stored'",[message.id])).rows[0].proof;
  await app.db.query("INSERT INTO audit_events(device_id,room_id,kind,payload) VALUES($1,$2,'receipt',$3)",
    [alice.identity.deviceId,id,JSON.stringify({...proof,kind:'read'})]);
  await alice.page.evaluate(()=>c.sync());
  expect((await alice.page.evaluate(id=>c.history(id),id))[0].status).toBe('delivered');
  expect((await app.db.query("SELECT COUNT(*)::int AS n FROM audit_receipts WHERE message_id=$1 AND kind='read'",[message.id])).rows[0].n).toBe(0);
});

test('DEEP-011 regression: unsigned legacy receipt upgrades only through a valid device proof and retries once',async({browser})=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),id=await room(alice,bob);
  const message=await alice.page.evaluate(id=>c.sendText(id,'upgrade signed receipt only'),id);
  await app.db.query("INSERT INTO audit_receipts(message_id,device_id,kind) VALUES($1,$2,'stored')",[message.id,bob.identity.deviceId]);
  await bob.page.evaluate(()=>c.sync());
  const proof=(await app.db.query("SELECT proof FROM audit_receipts WHERE message_id=$1 AND kind='stored'",[message.id])).rows[0].proof;
  expect(proof.signature).toMatch(/^[A-Za-z0-9_-]+$/);
  await bob.page.evaluate(proof=>c.request('/api/receipts','POST',proof),proof);
  expect((await app.db.query("SELECT COUNT(*)::int AS n FROM audit_events WHERE device_id=$1 AND kind='receipt'",[alice.identity.deviceId])).rows[0].n).toBe(1);
  await alice.page.evaluate(()=>c.sync());expect((await alice.page.evaluate(id=>c.history(id),id))[0].status).toBe('delivered');
});
test('DEEP-006 regression: only viewport-visible focused messages emit Read',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),id=await room(alice,bob);
  const first=await alice.page.evaluate(id=>c.sendText(id,'Older unseen paragraph\n'.repeat(120)),id);
  const latest=await alice.page.evaluate(id=>c.sendText(id,'Latest paragraph\n'.repeat(120)),id);
  await bob.page.evaluate(()=>c.sync()); expect(await bob.page.evaluate(id=>c.markRead(id),id)).toBe(0);
  await bob.context.unroute('**/ui.js'); await bob.page.setViewportSize({width:390,height:844});
  await bob.page.reload(); await bob.page.bringToFront(); await expect(bob.page.locator('#workspace')).toBeVisible();
  await expect(bob.page.locator('.room-button')).toBeVisible(); await bob.page.locator('.room-button').click();
  await expect.poll(async()=> (await app.db.query("SELECT COUNT(*)::int AS n FROM audit_receipts WHERE message_id=$1 AND kind='read'",[latest.id])).rows[0].n).toBe(1);
  expect((await app.db.query("SELECT COUNT(*)::int AS n FROM audit_receipts WHERE message_id=$1 AND kind='read'",[first.id])).rows[0].n).toBe(0);
  const geometry=await bob.page.evaluate(()=>{const box=document.querySelector('#messages').getBoundingClientRect(),old=document.querySelector('.message').getBoundingClientRect();return {firstBottom:old.bottom,containerTop:box.top,focused:document.hasFocus(),visible:document.visibilityState};});
  expect(geometry.firstBottom).toBeLessThanOrEqual(geometry.containerTop);
  await bob.page.locator('#messages').evaluate(box=>{box.scrollTop=0;box.dispatchEvent(new Event('scroll'));});
  await expect.poll(async()=> (await app.db.query("SELECT COUNT(*)::int AS n FROM audit_receipts WHERE message_id=$1 AND kind='read'",[first.id])).rows[0].n).toBe(1);
  await result(info,{regression:'DEEP-006',offscreenFirstRead:false,readAfterVisible:true,...geometry});
});
test('DEEP-007 regression: independent checkpoint rejects rolled-back history on a fresh device',async({browser},info)=>{
  const alice=await device(browser,'alice'),bob=await device(browser,'bob'),id=await room(alice,bob);
  await alice.page.evaluate(id=>c.sendText(id,'archive revision one'),id);
  const key=await alice.page.evaluate(()=>c.generateRecoveryKey()); await alice.page.evaluate(key=>c.backup(key),key);
  const earlier=await alice.page.evaluate(()=>c.request('/api/recovery'));
  await alice.page.evaluate(id=>c.sendText(id,'archive revision two'),id); await alice.page.evaluate(key=>c.backup(key),key);
  const current=await alice.page.evaluate(()=>c.request('/api/recovery')); expect(current.revision).toBe('2');
  const fresh=await device(browser,'alice'); await alice.page.evaluate(i=>c.approveDevice(i.deviceId,i.fingerprint),fresh.identity);
  await fresh.context.route('**/api/recovery',r=>r.request().method()==='GET'?r.fulfill({contentType:'application/json',body:JSON.stringify(earlier)}):r.continue());
  const checkpoint=await alice.page.evaluate(()=>c.recoveryCheckpoint());
  await expect(fresh.page.evaluate(key=>c.restore(key),key)).rejects.toThrow('recovery_checkpoint_required');
  await expect(fresh.page.evaluate(({key,checkpoint})=>c.restore(key,{checkpoint}),{key,checkpoint})).rejects.toThrow('recovery_freshness_rejected');
  const rows=await fresh.page.evaluate(()=>c.history()); expect(rows).toHaveLength(0);
  await fresh.context.unroute('**/api/recovery');
  expect((await fresh.page.evaluate(({key,checkpoint})=>c.restore(key,{checkpoint}),{key,checkpoint})).restored).toBe(2);
  await result(info,{regression:'DEEP-007',actualRemoteRevision:current.revision,replayedRevision:earlier.revision,rollbackDetected:true});
});
test('DEEP-008 regression: authenticated admission rejects an overlong signed KeyPackage',async({},info)=>{
  const mls=await import('ts-mls'),identity=await import('../device-identity.mjs');
  const suite=await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const policy=await import('../key-package-policy.mjs');
  const one=await mls.generateKeyPackage(identity.syntheticDeviceCredential('alice','lifetime-one'),mls.defaultCapabilities(),policy.keyPackageLifetime(),[],suite);
  const two=await mls.generateKeyPackage(identity.syntheticDeviceCredential('bob','lifetime-two'),mls.defaultCapabilities(),mls.defaultLifetime,[],suite);
  const config=identity.pinnedDeviceConfig([{owner:'alice',device:'lifetime-one',status:'active',signaturePublicKey:one.publicPackage.leafNode.signaturePublicKey},{owner:'bob',device:'lifetime-two',status:'active',signaturePublicKey:two.publicPackage.leafNode.signaturePublicKey}]);
  await identity.createAuthenticatedGroup(new TextEncoder().encode('maximum-lifetime-probe'),one,suite,config);
  expect(()=>policy.validateKeyPackageLifetime(two.publicPackage)).toThrow('key_package_lifetime_rejected');
  await expect(identity.createAuthenticatedGroup(new TextEncoder().encode('overlong-initial-package'),two,suite,config)).rejects.toThrow('key_package_lifetime_rejected');
  expect(config.lifetimeConfig.validateLifetimeOnReceive).toBe(true);
  await result(info,{regression:'DEEP-008',configuredMaximumSeconds:String(config.lifetimeConfig.maximumTotalLifetime),overlongAdmissionRejected:true});
});
