const { test, expect } = require('@playwright/test');
const { startAuditServer } = require('./server.cjs');
let app, contexts;
test.beforeEach(async () => { contexts = []; app = await startAuditServer({ auditOnly: true }); });
test.afterEach(async () => { try { for (const context of contexts) await context.close(); } finally { await app.close(); } });
async function device(browser, owner) {
  const context = await browser.newContext(); contexts.push(context);
  await context.route('**/ui.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  const page = await context.newPage(); await page.goto(app.origin);
  const identity = await page.evaluate(async owner => { window.c = WingaAudit.createClient(); return c.login(owner, 'local-audit-only'); }, owner);
  return { page, context, identity };
}
const pin = (page, identity) => page.evaluate(i => c.trustDevice(i.deviceId, i.fingerprint), identity);
async function conversation(a, b) {
  await pin(a.page, b.identity); await pin(b.page, a.identity);
  const room = await a.page.evaluate(peer => c.createRoom(peer), b.identity.owner);
  await a.page.evaluate(({room,id}) => c.addDevice(room,id), {room,id:b.identity.deviceId});
  await b.page.evaluate(() => c.sync()); return room;
}

test('AUD-001 authenticated invalid content must not block unrelated conversations', async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob'), eve = await device(browser, 'eve');
  const badRoom = await conversation(alice, bob), goodRoom = await conversation(alice, eve);
  // Model a malicious participant with a custom MLS client, not a transport attacker.
  const poison = await bob.page.evaluate(async room => { c.validateContent = () => {}; return c.sendText(room, ''); }, badRoom);
  expect(poison.status).toBe('sent');
  const before = await alice.page.evaluate(async room => Array.from((await c.vault.get(`group:${room}`)).bytes), badRoom);
  await eve.page.evaluate(room => c.sendText(room, 'independent valid conversation'), goodRoom);
  await alice.page.evaluate(() => c.sync()); await alice.page.evaluate(() => c.sync());
  const history = await alice.page.evaluate(room => c.history(room), goodRoom);
  expect(history.some(row => row.text === 'independent valid conversation')).toBe(true);
  expect(await alice.page.evaluate(room => c.history(room), badRoom)).toHaveLength(0);
  expect(await alice.page.evaluate(async room => Array.from((await c.vault.get(`group:${room}`)).bytes), badRoom)).toEqual(before);
  expect(await alice.page.evaluate(async room => (await c.vault.get(`group:${room}`)).quarantined, badRoom)).toBe(true);
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_receipts WHERE message_id=$1', [poison.id])).rows[0].count).toBe(0);
  expect((await app.db.query("SELECT acknowledged FROM audit_events WHERE device_id=$1 AND payload->>'id'=$2", [alice.identity.deviceId, poison.id])).rows[0].acknowledged).toBe(false);
  await expect(alice.page.evaluate(room => c.sendText(room, 'no fallback'), badRoom)).rejects.toThrow('fresh_welcome_required');
  await bob.page.evaluate(({room,id}) => c.removeDevice(room,id), {room:badRoom,id:alice.identity.deviceId});
  await alice.page.evaluate(room => c.prepareRejoin(room), badRoom);
  await bob.page.evaluate(({room,id}) => c.addDevice(room,id), {room:badRoom,id:alice.identity.deviceId});
  await alice.page.evaluate(() => c.sync());
  await bob.page.evaluate(room => c.sendText(room,'fresh welcome after quarantine'), badRoom); await alice.page.evaluate(() => c.sync());
  expect((await alice.page.evaluate(room => c.history(room), badRoom)).map(row => row.text)).toEqual(['fresh welcome after quarantine']);
});

test('AUD-002 new sender device must not stall on a receipt for pre-enrollment history', async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob');
  const room = await conversation(alice, bob);
  const message = await alice.page.evaluate(room => c.sendText(room, 'before second device'), room);
  const second = await device(browser, 'alice');
  await alice.page.evaluate(i => c.approveDevice(i.deviceId,i.fingerprint), second.identity);
  await pin(bob.page, second.identity); await pin(second.page, alice.identity); await pin(second.page, bob.identity);
  await alice.page.evaluate(({room,id}) => c.addDevice(room,id), {room,id:second.identity.deviceId});
  await second.page.evaluate(() => c.sync()); expect(await second.page.evaluate(room => c.history(room), room)).toHaveLength(0);
  await bob.page.evaluate(() => c.sync());
  const events = await second.page.evaluate(() => c.request('/api/events'));
  expect(events.some(e => e.kind === 'receipt' && e.payload.id === message.id)).toBe(false);
  await second.page.evaluate(() => c.sync());
  const key = await alice.page.evaluate(() => c.generateRecoveryKey()); await alice.page.evaluate(key => c.backup(key), key);
  const checkpoint = await alice.page.evaluate(() => c.recoveryCheckpoint());
  await second.page.evaluate(({key,checkpoint}) => c.restore(key,{checkpoint}), {key,checkpoint}); await second.page.evaluate(() => c.sync());
  expect((await second.page.evaluate(room => c.history(room), room)).find(row => row.id === message.id).status).toBe('delivered');
  await bob.page.evaluate(async room => c.markRead(room, (await c.history(room)).map(row => row.id)), room); await second.page.evaluate(() => c.sync());
  expect((await second.page.evaluate(room => c.history(room), room)).find(row => row.id === message.id).status).toBe('read');
  const newer = await alice.page.evaluate(room => c.sendText(room,'new eligible message'), room);
  await second.page.evaluate(() => c.sync()); await bob.page.evaluate(() => c.sync()); await second.page.evaluate(() => c.sync());
  expect((await second.page.evaluate(room => c.history(room), room)).find(row => row.id === newer.id).status).toBe('delivered');
});

test('AUD-003 retry after a Read receipt must preserve the monotonic status', async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob'); const room = await conversation(alice, bob);
  await alice.context.route('**/api/messages', async route => { await route.fetch(); await route.abort('connectionfailed'); });
  const message = await alice.page.evaluate(room => c.sendText(room, 'accepted with lost response'), room); expect(message.status).toBe('pending');
  await alice.context.unroute('**/api/messages'); await bob.page.evaluate(() => c.sync()); await bob.page.evaluate(async room => c.markRead(room, (await c.history(room)).map(row => row.id)), room);
  const queued = await alice.page.evaluate(() => c.request('/api/events')); expect(queued.some(e => e.kind === 'receipt' && e.payload.kind === 'read')).toBe(true);
  await alice.page.evaluate(() => c.sync());
  const final = (await alice.page.evaluate(room => c.history(room), room)).find(row => row.id === message.id);
  expect(final.status).toBe('read');
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_messages')).rows[0].count).toBe(1);
  await alice.page.reload(); await alice.page.evaluate(async () => { window.c = WingaAudit.createClient(); await c.resume(); await c.sync(); });
  expect((await alice.page.evaluate(room => c.history(room), room)).find(row => row.id === message.id).status).toBe('read');
});

test('AUD-004 conflicting backup must have a safe public recovery path', async ({ browser }) => {
  const bob = await device(browser, 'bob'), second = await device(browser, 'bob');
  await bob.page.evaluate(i => c.approveDevice(i.deviceId,i.fingerprint), second.identity);
  const key = await bob.page.evaluate(() => c.generateRecoveryKey());
  await bob.context.route('**/api/recovery', async route => { if (route.request().method() === 'PUT') await route.abort('connectionfailed'); else await route.continue(); });
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow(); await bob.context.unroute('**/api/recovery');
  const otherKey = await second.page.evaluate(() => c.generateRecoveryKey()); expect((await second.page.evaluate(key => c.backup(key), otherKey)).revision).toBe('1');
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow('backup_revision_conflict');
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow('backup_revision_conflict');
  expect((await bob.page.evaluate(() => c.vault.get('backup:pending'))).expectedRevision).toBe('0');
  // Never clear or silently overwrite someone else's accepted backup to satisfy a retry.
  await expect(bob.page.evaluate(() => c.discardPendingBackup())).rejects.toThrow('backup_discard_confirmation_required');
  const remote = await second.page.evaluate(() => c.request('/api/recovery'));
  expect(await bob.page.evaluate(() => c.discardPendingBackup({confirmed:true}))).toMatchObject({discarded:true,remoteChanged:false,revision:'1'});
  expect(await bob.page.evaluate(() => c.request('/api/recovery'))).toEqual(remote);
  expect((await second.page.evaluate(key => c.restore(key), otherKey)).identityRestored).toBe(false);
  expect((await bob.page.evaluate(key => c.backup(key), key)).revision).toBe('2');
});

for (const damage of ['AEAD', 'inner signature', 'untrusted Add']) test(`AUD-001 isolates ${damage} without acknowledging rejected content`, async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob'), eve = await device(browser, 'eve');
  const badRoom = await conversation(alice,bob), goodRoom = await conversation(alice,eve);
  if (damage === 'untrusted Add') {
    const extra = await device(browser,'bob'); await bob.page.evaluate(i => c.approveDevice(i.deviceId,i.fingerprint), extra.identity);
    await bob.page.evaluate(({room,id}) => c.addDevice(room,id), {room:badRoom,id:extra.identity.deviceId});
  } else {
    if (damage === 'inner signature') await bob.page.evaluate(() => { c.contentBytes = () => new TextEncoder().encode('wrong signed content'); });
    const sent = await bob.page.evaluate(room => c.sendText(room,'rejected ciphertext'), badRoom);
    if (damage === 'AEAD') {
      const row = (await app.db.query("SELECT id,payload FROM audit_events WHERE device_id=$1 AND payload->>'id'=$2", [alice.identity.deviceId,sent.id])).rows[0];
      const bytes = Buffer.from(row.payload.ciphertext,'base64url'); bytes[bytes.length-1] ^= 1; row.payload.ciphertext = bytes.toString('base64url');
      await app.db.query('UPDATE audit_events SET payload=$2 WHERE id=$1', [row.id,JSON.stringify(row.payload)]);
    }
  }
  await eve.page.evaluate(room => c.sendText(room,'healthy room'), goodRoom); await alice.page.evaluate(() => c.sync());
  expect((await alice.page.evaluate(room => c.history(room), goodRoom)).map(row => row.text)).toEqual(['healthy room']);
  expect(await alice.page.evaluate(room => c.history(room), badRoom)).toHaveLength(0);
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_quarantines WHERE device_id=$1 AND room_id=$2', [alice.identity.deviceId,badRoom])).rows[0].count).toBe(1);
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_receipts r JOIN audit_messages m ON m.id=r.message_id WHERE m.room_id=$1', [badRoom])).rows[0].count).toBe(0);
});

test('AUD-001 quarantine survives lost reject response and bypasses more than 64 poisoned-room events', async ({ browser }) => {
  const alice = await device(browser,'alice'), bob = await device(browser,'bob'), eve = await device(browser,'eve');
  const badRoom = await conversation(alice,bob), goodRoom = await conversation(alice,eve);
  await bob.page.evaluate(async room => {
    const validate = c.validateContent; c.validateContent = () => {}; await c.sendText(room,''); c.validateContent = validate;
    for (let i=0;i<65;i++) await c.sendText(room,`blocked room backlog ${i}`);
  }, badRoom);
  await eve.page.evaluate(room => c.sendText(room,'beyond first batch'), goodRoom);
  await alice.context.route('**/api/events/reject', async route => { await route.fetch(); await route.abort('connectionfailed'); });
  await expect(alice.page.evaluate(() => c.sync())).rejects.toThrow(); await alice.context.unroute('**/api/events/reject');
  await alice.page.reload(); await alice.page.evaluate(async () => { window.c = WingaAudit.createClient(); await c.resume(); await c.sync(); await c.sync(); });
  expect((await alice.page.evaluate(room => c.history(room), goodRoom)).map(row => row.text)).toEqual(['beyond first batch']);
  expect(await alice.page.evaluate(room => c.history(room), badRoom)).toHaveLength(0);
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_quarantines WHERE device_id=$1', [alice.identity.deviceId])).rows[0].count).toBe(1);
});

test('AUD-001 transient durable-write failure does not quarantine or acknowledge valid content', async ({ browser }) => {
  const alice = await device(browser,'alice'), bob = await device(browser,'bob'), room = await conversation(alice,bob);
  await bob.page.evaluate(room => c.sendText(room,'retry durable write'), room);
  await alice.page.evaluate(() => { window.stage = c.stage.bind(c); c.stage = () => { throw Error('durable_write_aborted'); }; });
  await expect(alice.page.evaluate(() => c.sync())).rejects.toThrow('durable_write_aborted');
  expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_quarantines')).rows[0].count).toBe(0);
  expect(await alice.page.evaluate(room => c.history(room), room)).toHaveLength(0);
  await alice.page.evaluate(async () => { c.stage = window.stage; await c.sync(); });
  expect((await alice.page.evaluate(room => c.history(room), room)).map(row => row.text)).toEqual(['retry durable write']);
});

test('AUD-002 unknown historical receipt is isolated and receiver cannot subscribe to sender history', async ({ browser }) => {
  const alice = await device(browser,'alice'), bob = await device(browser,'bob'), room = await conversation(alice,bob);
  const sent = await alice.page.evaluate(room => c.sendText(room,'sender history'), room);
  await expect(bob.page.evaluate(({room,id}) => c.request('/api/receipts/history','POST',{id:crypto.randomUUID(),roomId:room,messageIds:[id]}), {room,id:sent.id})).rejects.toThrow('history_receipt_forbidden');
  const crypto = require('node:crypto'), unknown = crypto.randomUUID();
  await app.db.query("INSERT INTO audit_events(device_id,room_id,kind,payload) VALUES($1,$2,'receipt',$3)", [alice.identity.deviceId,room,JSON.stringify({id:unknown,kind:'read'})]);
  await bob.page.evaluate(room => c.sendText(room,'after unknown historical receipt'), room); await alice.page.evaluate(() => c.sync());
  expect(await alice.page.evaluate(id => c.vault.get(`history:${id}`), unknown)).toBe(null);
  expect((await alice.page.evaluate(room => c.history(room), room)).some(row => row.text === 'after unknown historical receipt')).toBe(true);
});

test('AUD-003 Delivered survives lost-response retry and later Stored cannot downgrade Read', async ({ browser }) => {
  const alice = await device(browser,'alice'), bob = await device(browser,'bob'), room = await conversation(alice,bob);
  await alice.context.route('**/api/messages', async route => { await route.fetch(); await route.abort('connectionfailed'); });
  const sent = await alice.page.evaluate(room => c.sendText(room,'delivered before retry'), room); await alice.context.unroute('**/api/messages');
  await bob.page.evaluate(() => c.sync()); await alice.page.evaluate(() => c.sync());
  expect((await alice.page.evaluate(room => c.history(room), room)).find(row => row.id===sent.id).status).toBe('delivered');
  await bob.page.evaluate(async room => c.markRead(room, (await c.history(room)).map(row => row.id)), room); await alice.page.evaluate(() => c.sync());
  const storedProof=(await app.db.query("SELECT proof FROM audit_receipts WHERE message_id=$1 AND kind='stored'",[sent.id])).rows[0].proof;
  await app.db.query("INSERT INTO audit_events(device_id,room_id,kind,payload) VALUES($1,$2,'receipt',$3)", [alice.identity.deviceId,room,JSON.stringify(storedProof)]);
  await alice.page.evaluate(() => c.sync());
  expect((await alice.page.evaluate(room => c.history(room), room)).find(row => row.id===sent.id).status).toBe('read');
});

test('AUD-004 tombstone conflict recovers and ambiguous accepted retry retains exact capsule', async ({ browser }) => {
  const bob = await device(browser,'bob'), second = await device(browser,'bob'); await bob.page.evaluate(i => c.approveDevice(i.deviceId,i.fingerprint), second.identity);
  const key = await bob.page.evaluate(() => c.generateRecoveryKey()); await bob.page.evaluate(key => c.backup(key), key);
  await bob.context.route('**/api/recovery', async route => { if(route.request().method()==='PUT') await route.abort('connectionfailed'); else await route.continue(); });
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow(); await bob.context.unroute('**/api/recovery');
  await second.page.evaluate(() => c.deleteBackup()); await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow('backup_revision_conflict');
  expect((await bob.page.evaluate(() => c.discardPendingBackup({confirmed:true}))).revision).toBe('2');
  expect((await bob.page.evaluate(() => c.request('/api/recovery'))).capsule).toBe(null);
  await bob.context.route('**/api/recovery', async route => { if(route.request().method()==='PUT') {await route.fetch(); await route.abort('connectionfailed');} else await route.continue(); });
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow(); await bob.context.unroute('**/api/recovery');
  const pending = await bob.page.evaluate(() => c.vault.get('backup:pending'));
  expect((await bob.page.evaluate(key => c.backup(key), key)).capsule).toEqual(pending.capsule);
  expect((await bob.page.evaluate(() => c.request('/api/recovery'))).revision).toBe('3');
  await bob.context.route('**/api/recovery', async route => { if(route.request().method()==='PUT') {await route.fetch(); await route.abort('connectionfailed');} else await route.continue(); });
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow(); await bob.context.unroute('**/api/recovery');
  expect(await bob.page.evaluate(() => c.discardPendingBackup({confirmed:true}))).toMatchObject({alreadyAccepted:true,discarded:false,remoteChanged:false,revision:'4'});
  const checkpoint = await bob.page.evaluate(() => c.recoveryCheckpoint());
  expect((await second.page.evaluate(({key,checkpoint}) => c.restore(key,{checkpoint}), {key,checkpoint})).identityRestored).toBe(false);
});

test('AUD-004 conflict UI requires confirmation, preserves remote backup and permits a new backup', async ({ browser }, testInfo) => {
  const bob = await device(browser,'bob'), second = await device(browser,'bob'); await bob.page.evaluate(i => c.approveDevice(i.deviceId,i.fingerprint), second.identity);
  const key = await bob.page.evaluate(() => c.generateRecoveryKey());
  await bob.context.route('**/api/recovery', async route => { if(route.request().method()==='PUT') await route.abort('connectionfailed'); else await route.continue(); });
  await expect(bob.page.evaluate(key => c.backup(key), key)).rejects.toThrow(); await bob.context.unroute('**/api/recovery');
  await expect(bob.page.evaluate(() => c.discardPendingBackup({confirmed:true}))).rejects.toThrow('backup_conflict_not_observed');
  await second.page.evaluate(async () => c.backup(await c.generateRecoveryKey()));
  const remote = await second.page.evaluate(() => c.request('/api/recovery'));
  await bob.context.unroute('**/ui.js'); await bob.page.reload(); await expect(bob.page.locator('#workspace')).toBeVisible();
  await bob.page.evaluate(async () => { window.c = WingaAudit.createClient(); await c.resume(); });
  await bob.page.locator('#recovery-key').fill(key); await bob.page.locator('#key-saved').check(); await bob.page.locator('#backup').click();
  await expect(bob.page.locator('#discard-pending')).toBeVisible();
  await bob.page.setViewportSize({width:1440,height:900}); await bob.page.screenshot({path:testInfo.outputPath('backup-conflict-desktop.png'),fullPage:true});
  await bob.page.setViewportSize({width:390,height:844}); await bob.page.locator('[data-tab=security]').click();
  await expect(bob.page.locator('#discard-pending')).toBeVisible();
  expect(await bob.page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await bob.page.screenshot({path:testInfo.outputPath('backup-conflict-mobile.png'),fullPage:true});
  bob.page.once('dialog', dialog => dialog.dismiss()); await bob.page.locator('#discard-pending').click();
  expect(await bob.page.evaluate(() => c.vault.get('backup:pending'))).not.toBe(null);
  bob.page.once('dialog', dialog => dialog.accept()); await bob.page.locator('#discard-pending').click();
  await expect(bob.page.locator('#notice')).toHaveText('Local pending backup discarded');
  expect(await second.page.evaluate(() => c.request('/api/recovery'))).toEqual(remote);
  const downloaded = bob.page.waitForEvent('download');
  await bob.page.locator('#backup').click(); await expect(bob.page.locator('#notice')).toHaveText('Backup revision 2');
  const checkpointFile = await downloaded; expect(checkpointFile.suggestedFilename()).toBe('winga-recovery-checkpoint.json');
  expect(await checkpointFile.failure()).toBe(null);
  const fs = require('node:fs');
  const exported = JSON.parse(fs.readFileSync(await checkpointFile.path(), 'utf8'));
  expect(exported).toEqual(await bob.page.evaluate(() => c.recoveryCheckpoint()));
  const reexported = bob.page.waitForEvent('download'); await bob.page.locator('#export-checkpoint').click();
  const secondFile = await reexported; expect(await secondFile.failure()).toBe(null);
  expect(JSON.parse(fs.readFileSync(await secondFile.path(), 'utf8'))).toEqual(exported);
});

test('AUD-005 pinned MLS candidate must reject duplicate signature keys in a group', async () => {
  const mls = await import('ts-mls'); const identity = await import('../device-identity.mjs');
  const policy = await import('../key-package-policy.mjs');
  const suite = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const makeCredential = id => identity.syntheticDeviceCredential('alice', id);
  const one = await mls.generateKeyPackage(makeCredential('device-one'), mls.defaultCapabilities(), policy.keyPackageLifetime(), [], suite);
  const two = await mls.generateKeyPackageWithKey(makeCredential('device-two'), mls.defaultCapabilities(), policy.keyPackageLifetime(), [],
    { signKey: one.privatePackage.signaturePrivateKey.slice(), publicKey: one.publicPackage.leafNode.signaturePublicKey.slice() }, suite);
  const config = identity.pinnedDeviceConfig([['device-one',one],['device-two',two]].map(([device,kp]) => ({ owner:'alice', device, status:'active', signaturePublicKey:kp.publicPackage.leafNode.signaturePublicKey })));
  const state = await identity.createAuthenticatedGroup(new TextEncoder().encode('duplicate-key-audit'), one, suite, config);
  let admitted = false, result;
  try { result = await mls.createCommit({state,cipherSuite:suite}, {extraProposals:[{proposalType:'add',add:{keyPackage:two.publicPackage}}]}); admitted = true; }
  catch (failure) { console.log('Duplicate key rejected:', failure.message); }
  if (admitted) {
    const leaves = result.newState.ratchetTree.filter(node => node?.nodeType === 'leaf');
    expect(leaves).toHaveLength(2); expect(Buffer.from(leaves[0].leaf.signaturePublicKey).equals(Buffer.from(leaves[1].leaf.signaturePublicKey))).toBe(true);
    result.consumed.forEach(mls.zeroOutUint8Array);
  }
  expect(admitted).toBe(false);
});
