const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { startAuditServer } = require('./server.cjs');
let app, dataDir;
test.beforeEach(async () => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-audit-')); app = await startAuditServer({ auditOnly: true, dataDir }); });
test.afterEach(async () => { if (app) await app.close(); /* Retain the isolated test database for failure inspection. */ });
async function device(browser, owner, options = {}) {
  const context = await browser.newContext(options), page = await context.newPage();
  await context.route('**/ui.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(app.origin); await page.waitForFunction(() => window.WingaAudit);
  const identity = await page.evaluate(async owner => { window.c = WingaAudit.createClient(); return c.login(owner, 'local-audit-only'); }, owner);
  return { context, page, identity };
}
async function pin(page, identity) { return page.evaluate(async identity => c.trustDevice(identity.deviceId, identity.fingerprint), identity); }
test('complete encrypted text, attachment, approval, revocation and recovery flow', async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob'), eve = await device(browser, 'eve');
  try {
    await expect(alice.page.evaluate(i => c.trustDevice(i.deviceId, '0'.repeat(64)), bob.identity)).rejects.toThrow('fingerprint_mismatch');
    await pin(alice.page, bob.identity); await pin(bob.page, alice.identity);
    const room = await alice.page.evaluate(() => c.createRoom('bob'));
    await alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bob.identity.deviceId });
    await bob.page.evaluate(() => c.sync());
    const message = await alice.page.evaluate(room => c.sendText(room, 'audit secret text'), room);
    expect(message.status).toBe('sent');
    expect((await alice.page.evaluate(room => c.history(room), room))[0].status).toBe('sent');
    await bob.page.evaluate(() => c.sync()); await alice.page.evaluate(() => c.sync());
    expect((await alice.page.evaluate(room => c.history(room), room))[0].status).toBe('delivered');
    await bob.page.evaluate(async room => c.markRead(room, (await c.history(room)).map(row => row.id)), room); await alice.page.evaluate(() => c.sync());
    expect((await alice.page.evaluate(room => c.history(room), room))[0].status).toBe('read');
    const media = await alice.page.evaluate(room => c.sendMedia(room, new Blob(['private file bytes'], { type: 'text/plain' }), { name: 'secret-name.txt', mime: 'text/plain' }, 'private attachment'), room);
    await bob.page.evaluate(() => c.sync());
    expect(await bob.page.evaluate(async id => (await c.openAttachment(id)).blob.text(), media.id)).toBe('private file bytes');
    await expect(eve.page.evaluate(({ room, media }) => c.request(`/api/media/${media.attachment.attachmentId}?roomId=${room}`, 'GET', undefined, true), { room, media })).rejects.toThrow('room_forbidden');
    const stored = await app.db.query('SELECT ciphertext FROM audit_media');
    expect(Buffer.from(stored.rows[0].ciphertext).includes(Buffer.from('private file bytes'))).toBe(false);
    const messages = await app.db.query('SELECT ciphertext FROM audit_messages');
    expect(JSON.stringify(messages.rows)).not.toContain('audit secret text');
    expect(JSON.stringify(messages.rows)).not.toContain(media.attachment.key);
    const bob2 = await device(browser, 'bob');
    try {
      expect(bob2.identity.status).toBe('pending');
      await expect(bob2.page.evaluate(() => c.rooms())).rejects.toThrow('device_not_authorized');
      await bob.page.evaluate(i => c.approveDevice(i.deviceId, i.fingerprint), bob2.identity);
      await pin(alice.page, bob2.identity); await pin(bob2.page, alice.identity); await pin(bob2.page, bob.identity);
      await alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bob2.identity.deviceId });
      await bob.page.evaluate(() => c.sync()); await bob2.page.evaluate(() => c.sync());
      const key = await bob.page.evaluate(() => c.generateRecoveryKey());
      expect((await bob.page.evaluate(key => c.backup(key), key)).revision).toBe('1');
      await expect(bob2.page.evaluate(() => c.restore('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))).rejects.toThrow();
      const checkpoint = await bob.page.evaluate(() => c.recoveryCheckpoint());
      const restored = await bob2.page.evaluate(({key,checkpoint}) => c.restore(key,{checkpoint}), {key,checkpoint}); expect(restored.restored).toBe(2); expect(restored.identityRestored).toBe(false);
      expect(await bob2.page.evaluate(async id => (await c.openAttachment(id)).blob.text(), media.id)).toBe('private file bytes');
      await bob.page.evaluate(i => c.revokeDevice(i.deviceId, i.fingerprint), bob2.identity);
      await expect(bob2.page.evaluate(() => c.rooms())).rejects.toThrow('device_not_authorized');
      await expect(alice.page.evaluate(room => c.sendText(room, 'blocked before rekey'), room)).rejects.toThrow('room_rekey_required');
      expect(await alice.page.evaluate(async () => (await c.vault.list('pending:')).length)).toBe(0);
      await alice.page.evaluate(({ room, id }) => c.removeDevice(room, id), { room, id: bob2.identity.deviceId });
      await bob.page.evaluate(() => c.sync());
      const after = await alice.page.evaluate(room => c.sendText(room, 'after revocation'), room); expect(after.status).toBe('sent');
      await bob.page.evaluate(() => c.sync());
      expect((await bob.page.evaluate(room => c.history(room), room)).some(row => row.text === 'after revocation')).toBe(true);
    } finally { await bob2.context.close(); }
    const before = await alice.page.evaluate(async room => ({ bytes: Array.from((await c.vault.get(`group:${room}`)).bytes), history: (await c.history(room)).length, pending: (await c.vault.list('pending:')).length }), room);
    await expect(alice.page.evaluate(room => c.sendText(room, 'aborted write', { abort: true }), room)).rejects.toThrow('durable_write_aborted');
    expect(await alice.page.evaluate(async room => ({ bytes: Array.from((await c.vault.get(`group:${room}`)).bytes), history: (await c.history(room)).length, pending: (await c.vault.list('pending:')).length }), room)).toEqual(before);
  } finally { await alice.context.close(); await bob.context.close(); await eve.context.close(); }
});
test('offline outbox, lost acknowledgements, replay, tabs, browser and server restart', async ({ browser }) => {
  const alice = await device(browser, 'alice');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-audit-profile-'));
  let bobContext = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true });
  await bobContext.route('**/ui.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  let bob = await bobContext.newPage(); await bob.goto(app.origin);
  const bobIdentity = await bob.evaluate(async () => { window.c = WingaAudit.createClient(); return c.login('bob', 'local-audit-only'); });
  try {
    await pin(alice.page, bobIdentity); await pin(bob, alice.identity);
    const room = await alice.page.evaluate(() => c.createRoom('bob'));
    await alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bobIdentity.deviceId }); await bob.evaluate(() => c.sync());
    await alice.context.setOffline(true);
    const offline = await alice.page.evaluate(room => c.sendText(room, 'queued while offline'), room); expect(offline.status).toBe('pending');
    await alice.context.setOffline(false); await alice.page.evaluate(() => c.flush());
    expect((await alice.page.evaluate(room => c.history(room), room))[0].status).toBe('sent');
    await alice.context.route('**/api/messages', async route => { await route.fetch(); await route.abort('connectionfailed'); });
    const ambiguous = await alice.page.evaluate(room => c.sendText(room, 'lost response'), room); expect(ambiguous.status).toBe('pending');
    await alice.context.unroute('**/api/messages'); await alice.page.evaluate(() => c.flush());
    expect((await app.db.query('SELECT COUNT(*)::int AS count FROM audit_messages')).rows[0].count).toBe(2);
    // Receiver commits plaintext and ratchets, then its HTTP acknowledgement is lost.
    await bobContext.route('**/api/events/ack', async route => { await route.fetch(); await route.abort('connectionfailed'); });
    await expect(bob.evaluate(() => c.sync())).rejects.toThrow();
    await bobContext.unroute('**/api/events/ack');
    // Restore the unacknowledged delivery, as a transport replay would do.
    await app.db.query("UPDATE audit_events SET acknowledged=FALSE WHERE device_id=$1 AND kind='message'", [bobIdentity.deviceId]);
    await bob.evaluate(() => c.sync()); expect((await bob.evaluate(room => c.history(room), room)).length).toBe(2);
    await bobContext.close(); bobContext = null;
    const port = Number(new URL(app.origin).port); await app.close(); app = await startAuditServer({ auditOnly: true, dataDir, port });
    bobContext = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true });
    await bobContext.route('**/ui.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    bob = await bobContext.newPage(); await bob.goto(app.origin);
    expect((await bob.evaluate(async () => { window.c = WingaAudit.createClient(); return c.resume(); })).deviceId).toBe(bobIdentity.deviceId);
    expect((await bob.evaluate(room => c.history(room), room)).length).toBe(2);
    const otherTab = await alice.context.newPage(); await otherTab.goto(app.origin);
    await otherTab.evaluate(async () => { window.c = WingaAudit.createClient(); await c.resume(); });
    await Promise.all([alice.page.evaluate(room => c.sendText(room, 'tab one'), room), otherTab.evaluate(room => c.sendText(room, 'tab two'), room)]);
    await bob.evaluate(() => c.sync()); expect((await bob.evaluate(room => c.history(room), room)).length).toBe(4);
    const key = await alice.page.evaluate(() => c.generateRecoveryKey()); await alice.page.evaluate(key => c.backup(key), key);
    const fresh = await device(browser, 'alice');
    try {
      await alice.page.evaluate(i => c.approveDevice(i.deviceId, i.fingerprint), fresh.identity);
      const checkpoint = await alice.page.evaluate(() => c.recoveryCheckpoint());
      const restored = await fresh.page.evaluate(({key,checkpoint}) => c.restore(key,{checkpoint}), {key,checkpoint}); expect(restored.restored).toBe(4);
      expect(await fresh.page.evaluate(async () => (await c.vault.list('group:')).length)).toBe(0);
      expect(await fresh.page.evaluate(async () => (await c.vault.get('device')).id)).not.toBe(alice.identity.deviceId);
      await expect(fresh.page.evaluate(room => c.sendText(room, 'not joined yet'), room)).rejects.toThrow('fresh_welcome_required');
      await pin(alice.page, fresh.identity); await pin(bob, fresh.identity);
      await pin(fresh.page, alice.identity); await pin(fresh.page, bobIdentity);
      await alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: fresh.identity.deviceId });
      await bob.evaluate(() => c.sync()); await fresh.page.evaluate(() => c.sync());
      const own = await alice.page.evaluate(room => c.sendText(room, 'own device copy'), room);
      await fresh.page.evaluate(() => c.sync()); await alice.page.evaluate(() => c.sync());
      expect((await alice.page.evaluate(room => c.history(room), room)).find(row => row.id === own.id).status).toBe('sent');
      await bob.evaluate(() => c.sync()); await alice.page.evaluate(() => c.sync());
      expect((await alice.page.evaluate(room => c.history(room), room)).find(row => row.id === own.id).status).toBe('delivered');
    } finally { await fresh.context.close(); }
  } finally { await alice.context.close(); if (bobContext) await bobContext.close(); }
});
test('strict CSP, ciphertext tamper rejection, signed requests and account isolation', async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob');
  try {
    const response = await alice.page.request.get(app.origin);
    expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
    expect(response.headers()['content-security-policy']).not.toContain('wasm-unsafe-eval');
    await expect(alice.page.evaluate(async () => { const r = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'plaintext' }) }); if (!r.ok) throw Error((await r.json()).code); })).rejects.toThrow('csrf_rejected');
    await pin(alice.page, bob.identity); await pin(bob.page, alice.identity);
    const room = await alice.page.evaluate(() => c.createRoom('bob'));
    await alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bob.identity.deviceId }); await bob.page.evaluate(() => c.sync());
    await expect(alice.page.evaluate(room => c.request('/api/messages', 'POST', { id: crypto.randomUUID(), roomId: room, epoch: 1, ciphertext: 'invalid', attachmentIds: [], text: 'leak' }), room)).rejects.toThrow('invalid_request');
    let captured;
    await alice.context.route('**/api/rooms', async route => { captured = await route.request().allHeaders(); await route.continue(); });
    await alice.page.evaluate(() => c.rooms()); await alice.context.unroute('**/api/rooms');
    const replay = await alice.page.request.get(`${app.origin}/api/rooms`, { headers: captured });
    expect(replay.status()).toBe(409); expect((await replay.json()).code).toBe('request_replayed');
    const tamperedProof = await alice.page.request.get(`${app.origin}/api/rooms`, { headers: { ...captured, 'x-request-id': require('node:crypto').randomUUID() } });
    expect(tamperedProof.status()).toBe(401); expect((await tamperedProof.json()).code).toBe('invalid_device_proof');
    const media = await alice.page.evaluate(room => c.sendMedia(room, new Blob(['tamper proof']), { name: 'private.txt', mime: 'text/plain' }), room);
    await bob.page.evaluate(() => c.sync());
    const saved = (await app.db.query('SELECT ciphertext FROM audit_media WHERE id=$1', [media.attachment.attachmentId])).rows[0].ciphertext;
    const damaged = Buffer.from(saved); damaged[damaged.length - 1] ^= 1;
    await app.db.query('UPDATE audit_media SET ciphertext=$2 WHERE id=$1', [media.attachment.attachmentId, damaged]);
    await expect(bob.page.evaluate(id => c.openAttachment(id), media.id)).rejects.toThrow();
    await app.db.query('UPDATE audit_media SET ciphertext=$2 WHERE id=$1', [media.attachment.attachmentId, saved]);
    expect(await bob.page.evaluate(async id => (await c.openAttachment(id)).blob.text(), media.id)).toBe('tamper proof');
    await alice.page.evaluate(async () => { await c.plain('/api/login', 'POST', { owner: 'eve', password: 'local-audit-only' }); });
    await expect(alice.page.evaluate(() => c.history())).rejects.toThrow('account_changed');
  } finally { await alice.context.close(); await bob.context.close(); }
});
test('production guard and rendered desktop/mobile encrypted image', async ({ browser }, testInfo) => {
  await expect(startAuditServer()).rejects.toThrow('audit_workbench_must_not_run_in_production');
  const bob = await device(browser, 'bob'), context = await browser.newContext(), page = await context.newPage();
  try {
    const violations = []; page.on('console', entry => { if (entry.type() === 'error') violations.push(entry.text()); });
    await page.goto(app.origin); await page.locator('#password').fill('local-audit-only'); await page.locator('#login button').click(); await expect(page.locator('#workspace')).toBeVisible();
    const aliceIdentity = await page.evaluate(async () => { window.c = WingaAudit.createClient(); return c.resume(); });
    await pin(page, bob.identity); await pin(bob.page, aliceIdentity);
    const room = await page.evaluate(() => c.createRoom('bob')); await page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bob.identity.deviceId }); await bob.page.evaluate(() => c.sync());
    const bytes = [...fs.readFileSync(path.join(__dirname, '../../../winga-icon-192.png'))];
    await bob.page.evaluate(({ room, bytes }) => c.sendMedia(room, new Blob([new Uint8Array(bytes)], { type: 'image/png' }), { name: 'Winga.png', mime: 'image/png' }, 'Winga attachment'), { room, bytes });
    await page.setViewportSize({ width: 1440, height: 900 }); await expect(page.locator('.room-button')).toBeVisible(); await page.locator('.room-button').click();
    await expect(page.getByRole('button', { name: 'Open Attachment' })).toBeVisible({ timeout: 12000 }); await page.getByRole('button', { name: 'Open Attachment' }).click();
    await expect(page.locator('.message img')).toBeVisible(); expect(await page.locator('.message img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(violations.filter(value => value.includes('Content Security Policy'))).toEqual([]);
  } finally { await bob.context.close(); await context.close(); }
});
test('conflicting epochs quarantine local state and recover only with a fresh Welcome', async ({ browser }) => {
  const alice = await device(browser, 'alice'), bob = await device(browser, 'bob'), alice2 = await device(browser, 'alice'), bob2 = await device(browser, 'bob');
  try {
    await pin(alice.page, bob.identity); await pin(bob.page, alice.identity);
    await alice.page.evaluate(i => c.approveDevice(i.deviceId, i.fingerprint), alice2.identity);
    await bob.page.evaluate(i => c.approveDevice(i.deviceId, i.fingerprint), bob2.identity);
    await pin(alice.page, bob2.identity); await pin(alice.page, alice2.identity);
    await pin(bob2.page, alice.identity); await pin(bob2.page, bob.identity);
    const room = await alice.page.evaluate(() => c.createRoom('bob'));
    await alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bob.identity.deviceId }); await bob.page.evaluate(() => c.sync());
    await bob.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: bob2.identity.deviceId }); await bob2.page.evaluate(() => c.sync());
    // Alice attempts a change using the previous epoch, before receiving Bob's commit.
    await expect(alice.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: alice2.identity.deviceId })).rejects.toThrow('epoch_conflict');
    expect(await alice.page.evaluate(async room => (await c.vault.get(`group:${room}`)).quarantined, room)).toBe(true);
    await expect(alice.page.evaluate(room => c.sendText(room, 'must not fall back'), room)).rejects.toThrow('fresh_welcome_required');
    await expect(alice.page.evaluate(room => c.prepareRejoin(room), room)).rejects.toThrow('peer_must_remove_device_first');
    await bob.page.evaluate(({ room, id }) => c.removeDevice(room, id), { room, id: alice.identity.deviceId }); await bob2.page.evaluate(() => c.sync());
    expect((await alice.page.evaluate(room => c.prepareRejoin(room), room)).freshWelcomeRequired).toBe(true);
    await bob.page.evaluate(({ room, id }) => c.addDevice(room, id), { room, id: alice.identity.deviceId }); await bob2.page.evaluate(() => c.sync());
    await alice.page.evaluate(() => c.sync());
    const sent = await alice.page.evaluate(room => c.sendText(room, 'fresh epoch restored'), room); expect(sent.status).toBe('sent');
    await bob.page.evaluate(() => c.sync()); expect((await bob.page.evaluate(room => c.history(room), room))[0].text).toBe('fresh epoch restored');
  } finally { await Promise.all([alice.context.close(), bob.context.close(), alice2.context.close(), bob2.context.close()]); }
});
