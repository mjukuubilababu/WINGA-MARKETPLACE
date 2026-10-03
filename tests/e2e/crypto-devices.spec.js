const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const migration = require('../../backend/migrations/conversation-crypto-devices');
const { createConversationCryptoDeviceStore } = require('../../backend/conversation-crypto-devices');
const backupMigration = require('../../backend/migrations/encrypted-conversation-backups');
const { createEncryptedConversationBackupStore } = require('../../backend/encrypted-conversation-backups');
const { createCryptoKeyPackageStore } = require('../../backend/conversation-crypto-key-packages');
let server, origin, db, store, backups;
const session = { username: 'bob', sessionId: 'b1', token: 'b1' };
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none'");
    const assets = { '/crypto-devices.js': 'crypto-devices.js', '/encrypted-vault.js': 'encrypted-vault.js',
      '/secure-content.js': 'secure-content.js', '/recovery-client.js': 'recovery-client.js', '/device-ui.js':'device-management-ui.js' };
    if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.resolve(__dirname,'../../style.css')));return;}
    if (assets[req.url]) {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(fs.readFileSync(path.resolve(__dirname, '../../src/chat', assets[req.url])));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device identity test</title><link rel="stylesheet" href="/style.css"><script src="/crypto-devices.js"></script><script src="/device-ui.js"></script><script src="/encrypted-vault.js"></script><script src="/secure-content.js"></script><script src="/recovery-client.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.beforeEach(async () => {
  db = new PGlite();
  await db.exec(require('../helpers/conversation-event-fixture'));
  for (const sql of migration.statements) await db.exec(sql);
  for (const sql of backupMigration.statements) await db.exec(sql);
  store = createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work) });
  backups = createEncryptedConversationBackupStore({ withTransaction: work => db.transaction(work) });
});
test.afterEach(async () => { await db.close(); });
async function prepare(page, gateway) {
  await page.exposeFunction('deviceRequest', gateway || ((method, payload, context) => method === 'GET'
    ? store.readConversationCryptoDevices(context) : store.mutateConversationCryptoDevice(context, payload)));
  await page.exposeFunction('recoveryRequest', (method, payload, context) => method === 'GET'
    ? backups.readEncryptedConversationBackup(context) : backups.writeEncryptedConversationBackup(context, payload));
  await page.goto(origin);
}
const enroll = page => page.evaluate(async session => {
  const client = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => session, request: window.deviceRequest });
  try { return await client.enroll(); } finally { client.close(); }
}, session);

test('browser signatures enroll through backend and nonextractable identity survives reload', async ({ page }) => {
  await prepare(page);
  const first = await enroll(page);
  expect(first.status).toBe('active');
  await page.reload();
  expect(await enroll(page)).toEqual(first);
  const secret = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const open = indexedDB.open('winga-crypto-identity-v1'); open.onsuccess = () => resolve(open.result); });
    try {
      const row = await new Promise(resolve => { const read = db.transaction('identities').objectStore('identities').get('bob'); read.onsuccess = () => resolve(read.result); });
      let exportRejected = false;
      try { await crypto.subtle.exportKey('pkcs8', row.privateKey); } catch { exportRejected = true; }
      return { extractable: row.privateKey.extractable, exportRejected, pending: row.pending, localStorage: localStorage.length };
    } finally { db.close(); }
  });
  expect(secret).toEqual({ extractable: false, exportRejected: true, pending: null, localStorage: 0 });
});

test('browser native identity attestation validates an actual MLS key package on the backend', async ({ page }) => {
  await prepare(page);
  const device = await enroll(page);
  for (const name of ['conversation-event-ledger', 'conversation-crypto-key-packages']) {
    await db.transaction(async tx => { for (const sql of require(`../../backend/migrations/${name}`).statements) await tx.exec(sql); });
  }
  const mls = await import('ts-mls');
  const suite = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  const seconds = BigInt(Math.floor(Date.now() / 1000));
  const pkg = await mls.generateKeyPackage({ credentialType: 'basic', identity: new TextEncoder().encode(JSON.stringify([
    'winga-mls-device', 1, session.username, device.id, device.fingerprint])) }, mls.defaultCapabilities(),
  { notBefore: seconds - 10n, notAfter: seconds + 86400n }, [], suite);
  const raw = Array.from(mls.encodeMlsMessage({ version: 'mls10', wireformat: 'mls_key_package', keyPackage: pkg.publicPackage }));
  const proof = await page.evaluate(async ({ session, raw }) => {
    const client = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => session, request: window.deviceRequest });
    try { return await client.attestKeyPackage(new Uint8Array(raw)); } finally { client.close(); }
  }, { session, raw });
  const packages = createCryptoKeyPackageStore({ withTransaction: work => db.transaction(work) });
  const accepted = await packages.publishCryptoKeyPackage({ owner: 'bob', token: 'b1', deviceId: 'b1' }, proof);
  expect(accepted.package.deviceId).toBe(device.id); expect(accepted.package.hash).toBe(proof.hash);
});

test('concurrent tabs persist one identity and one signed registration operation', async ({ page, context }) => {
  const other = await context.newPage();
  await prepare(page); await prepare(other);
  const [a, b] = await Promise.all([enroll(page), enroll(other)]);
  expect(a).toEqual(b);
  expect((await db.query('SELECT COUNT(*)::int AS count FROM conversation_crypto_devices')).rows[0].count).toBe(1);
});

test('lost accepted response resumes the same request after reload', async ({ page }) => {
  let lost = false;
  await prepare(page, async (method, payload, context) => {
    if (method === 'GET') return store.readConversationCryptoDevices(context);
    const result = await store.mutateConversationCryptoDevice(context, payload);
    if (!lost) { lost = true; throw new Error('synthetic_lost_reply'); }
    return result;
  });
  await expect(enroll(page)).rejects.toThrow('synthetic_lost_reply');
  await page.reload();
  expect((await enroll(page)).status).toBe('active');
  expect((await db.query('SELECT COUNT(*)::int AS count FROM conversation_crypto_operations')).rows[0].count).toBe(1);
});

test('a separate browser device stays pending; server key substitution fails closed', async ({ page, browser }) => {
  await prepare(page); const first = await enroll(page);
  const otherContext = await browser.newContext();
  try {
    const second = await otherContext.newPage(); await prepare(second);
    const pending = await enroll(second);
    expect(pending.id).not.toBe(first.id); expect(pending.status).toBe('pending');
  } finally { await otherContext.close(); }
  await page.reload();
  const mismatch = await page.evaluate(async session => {
    const client = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => session,
      request: async (...args) => { const result = await window.deviceRequest(...args); return args[0] === 'POST'
        ? { ...result, device: { ...result.device, publicKey: 'substituted' } } : result; } });
    try { await client.enroll(); return false; } catch (error) { return error.message; } finally { client.close(); }
  }, session);
  expect(mismatch).toBe('crypto_device_server_identity_mismatch');
});

test('missing crypto and session changes cannot produce a successful enrollment', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    let unavailable = false;
    try { await WingaCryptoDevices.createCryptoDeviceClient({ crypto: {}, getSession: () => session, request: window.deviceRequest }); }
    catch { unavailable = true; }
    let active = session;
    const client = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => active,
      request: async (...args) => { const result = await window.deviceRequest(...args); active = { ...session, token: 'changed' }; return result; } });
    try { await client.enroll(); return { unavailable, changed: false }; }
    catch (error) { return { unavailable, changed: error.message }; }
    finally { client.close(); }
  }, session);
  expect(result).toEqual({ unavailable: true, changed: 'crypto_device_session_changed' });
});

test('an explicitly expired unaccepted proof is retired before a fresh signed retry', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    let expired = false, firstId, nextId;
    const client = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => session,
      request: async (method, payload, context) => {
        if (method === 'POST' && !expired) {
          expired = true; firstId = payload.requestId;
          throw Object.assign(new Error('expired'), { code: 'crypto_device_proof_expired' });
        }
        if (method === 'POST') nextId = payload.requestId;
        return window.deviceRequest(method, payload, context);
      } });
    try {
      try { await client.enroll(); } catch (error) { if (error.code !== 'crypto_device_proof_expired') throw error; }
      return { device: await client.enroll(), changed: firstId !== nextId };
    } finally { client.close(); }
  }, session);
  expect(result.device.status).toBe('active'); expect(result.changed).toBe(true);
});

test('vault persists encrypted MLS state and outbox atomically and rejects stale revision', async ({ page }) => {
  await prepare(page);
  const first = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    try {
      const revision = await vault.write({ expectedRevision: '0', values: {
        'group:test': { epoch: 2n, privateBytes: new Uint8Array([1, 2, 3]) },
        'outbox:logical-id': { ciphertext: 'opaque-retry', draft: 'private draft' }
      } });
      let conflict = false;
      try { await vault.write({ expectedRevision: '0', deleted: ['outbox:logical-id'] }); } catch (error) { conflict = error.message; }
      return { revision, conflict };
    } finally { vault.close(); }
  }, session);
  expect(first).toEqual({ revision: '1', conflict: 'crypto_vault_revision_conflict' });
  await page.reload();
  const restored = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    try {
      const snapshot = await vault.snapshot();
      const db = await new Promise(resolve => { const open = indexedDB.open('winga-encrypted-vault-v1:bob'); open.onsuccess = () => resolve(open.result); });
      try {
        const rows = await new Promise(resolve => { const req = db.transaction('records').objectStore('records').getAll(); req.onsuccess = () => resolve(req.result); });
        return { revision: snapshot.revision, epoch: String(snapshot.values['group:test'].epoch),
          bytes: Array.from(snapshot.values['group:test'].privateBytes), draft: snapshot.values['outbox:logical-id'].draft,
          plaintextStored: JSON.stringify(rows).includes('private draft') };
      } finally { db.close(); }
    } finally { vault.close(); }
  }, session);
  expect(restored).toEqual({ revision: '1', epoch: '2', bytes: [1, 2, 3], draft: 'private draft', plaintextStored: false });
});

test('two vault tabs cannot replace an accepted state using the same old revision', async ({ page, context }) => {
  await prepare(page);
  const other = await context.newPage(); await prepare(other);
  for (const tab of [page, other]) await tab.evaluate(async session => {
    window.vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
  }, session);
  const results = await Promise.all([page, other].map((tab, n) => tab.evaluate(async n => {
    try { return await vault.write({ expectedRevision: '0', values: { 'group:test': { writer: n } } }); }
    catch (error) { return error.message; }
  }, n)));
  expect(results.sort()).toEqual(['1', 'crypto_vault_revision_conflict']);
  for (const tab of [page, other]) await tab.evaluate(() => vault.close());
});

test('vault rejects unreadable aggregate state atomically and preserves typed integers', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    try {
      const values = Object.fromEntries(Array.from({ length: 1999 }, (_, i) => [`history:${i}`, { position: BigInt(-i) }]));
      await vault.write({ expectedRevision: '0', values });
      let limit, collision;
      try { await vault.write({ expectedRevision: '1', values: { 'history:extra1': 1, 'history:extra2': 2 }, deleted: ['history:0'] }); }
      catch (error) { limit = error.message; }
      // The first write reaches exactly 2000; a later extra record must roll back its deletion too.
      try { await vault.write({ expectedRevision: '2', values: { 'history:extra3': 3, 'history:extra4': 4 }, deleted: ['history:1'] }); }
      catch (error) { limit = error.message; }
      try { await vault.write({ expectedRevision: '2', values: { 'history:bad': { $integer: '1' } } }); }
      catch (error) { collision = error.message; }
      const saved = await vault.snapshot();
      return { revision: saved.revision, count: Object.keys(saved.values).length, limit, collision,
        negativeInteger: saved.values['history:1']?.position === -1n, rolledBack: !saved.values['history:extra3'] };
    } finally { vault.close(); }
  }, session);
  expect(result).toEqual({ revision: '2', count: 2000, limit: 'crypto_vault_snapshot_too_large',
    collision: 'crypto_vault_value_invalid', negativeInteger: true, rolledBack: true });
});

test('vault ciphertext corruption never yields a partially decrypted snapshot', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    try {
      await vault.write({ expectedRevision: '0', values: { 'history:a': 'secret', 'history:b': 'also secret' } });
      const db = await new Promise(resolve => { const open = indexedDB.open('winga-encrypted-vault-v1:bob'); open.onsuccess = () => resolve(open.result); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite'), records = tx.objectStore('records'), read = records.get('history:b');
        read.onsuccess = () => { const value = read.result; value.ciphertext[0] ^= 1; records.put(value, 'history:b'); };
        tx.oncomplete = resolve; tx.onabort = reject;
      }); db.close();
      try { await vault.snapshot(); return false; } catch { return true; }
    } finally { vault.close(); }
  }, session);
  expect(result).toBe(true);
});

test('vault captures the logical write before waiting on a tab lock', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    let hold = false, resume, entered;
    const gate = new Promise(resolve => { resume = resolve; }), waiting = new Promise(resolve => { entered = resolve; });
    const locks = { request: async (name, work) => { if (hold) { entered(); await gate; } return navigator.locks.request(name, work); } };
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session, locks });
    try {
      await vault.write({ expectedRevision: '0', values: { 'history:keep': 'retained' } });
      hold = true;
      const values = { 'history:new': { text: 'original', bytes: new Uint8Array([1, 2]) } }, deleted = [];
      const pending = vault.write({ expectedRevision: '1', values, deleted });
      await waiting; values['history:new'].text = 'changed'; values['history:new'].bytes.fill(0); deleted.push('history:keep'); resume();
      await pending; const saved = await vault.snapshot();
      return { revision: saved.revision, keep: saved.values['history:keep'], text: saved.values['history:new'].text,
        bytes: Array.from(saved.values['history:new'].bytes) };
    } finally { resume(); vault.close(); }
  }, session);
  expect(result).toEqual({ revision: '2', keep: 'retained', text: 'original', bytes: [1, 2] });
});

test('vault corruption and key loss never reset or return plaintext, and logout blocks reads', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    let active = session;
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => active });
    await vault.write({ expectedRevision: '0', values: { 'group:test': { value: 'private' } } });
    active = null; let logout;
    try { await vault.snapshot(); } catch (error) { logout = error.message; }
    vault.close();
    const db = await new Promise(resolve => { const open = indexedDB.open('winga-encrypted-vault-v1:bob'); open.onsuccess = () => resolve(open.result); });
    await new Promise(resolve => { const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').clear(); tx.oncomplete = resolve; });
    db.close(); let keyLoss;
    try { await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session }); }
    catch (error) { keyLoss = error.message; }
    return { logout, keyLoss };
  }, session);
  expect(result).toEqual({ logout: 'crypto_vault_session_required', keyLoss: 'crypto_vault_key_missing' });
});

test('user key and independent checkpoint restore history on a fresh browser, never group secrets', async ({ page, browser }) => {
  await prepare(page);
  const exported = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    const codec = await WingaSecureContent.loadSecureContent(), key = codec.generateRecoveryKey();
    const recovery = WingaRecoveryClient.createRecoveryClient({ owner: session.username, getSession: () => session,
      vault, codec, request: window.recoveryRequest });
    try {
      await vault.write({ expectedRevision: '0', values: { 'history:message-1': { text: 'private recovered history' },
        'group:test': { privateKey: 'never recover active group secret' } } });
      const result = await recovery.backup(key);
      return { key, checkpoint: result.checkpoint };
    } finally { vault.close(); }
  }, session);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage(); await prepare(fresh);
    const result = await fresh.evaluate(async ({ session, exported }) => {
      const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
      const recovery = WingaRecoveryClient.createRecoveryClient({ owner: session.username, getSession: () => session,
        vault, codec: await WingaSecureContent.loadSecureContent(), request: window.recoveryRequest });
      try {
        let missing;
        try { await recovery.restore(exported.key); } catch (error) { missing = error.message; }
        const accepted = await recovery.restore(exported.key, { checkpoint: exported.checkpoint });
        const saved = await vault.snapshot();
        return { missing, accepted, history: saved.values['history:message-1'], groupAbsent: !saved.values['group:test'] };
      } finally { vault.close(); }
    }, { session, exported });
    expect(result).toEqual({ missing: 'recovery_checkpoint_required', accepted: { restored: 1, revision: '1' },
      history: { text: 'private recovered history' }, groupAbsent: true });
  } finally { await context.close(); }
  const stored = JSON.stringify((await db.query('SELECT capsule FROM encrypted_conversation_backups')).rows);
  expect(stored).not.toContain('private recovered history'); expect(stored).not.toContain(exported.key);
});

test('recovery resumes a lost accepted PUT after reload and rejects server rollback', async ({ page }) => {
  await prepare(page);
  const exported = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    const codec = await WingaSecureContent.loadSecureContent(), key = codec.generateRecoveryKey();
    await vault.write({ expectedRevision: '0', values: { 'history:message': { text: 'retained' } } });
    const recovery = WingaRecoveryClient.createRecoveryClient({ owner: session.username, getSession: () => session,
      vault, codec, request: async (...args) => { const result = await window.recoveryRequest(...args); if (args[0] === 'PUT') throw new Error('lost_reply'); return result; } });
    try { await recovery.backup(key); } catch (error) { if (error.message !== 'lost_reply') throw error; }
    finally { vault.close(); }
    return { key };
  }, session);
  await page.reload();
  const result = await page.evaluate(async ({ session, exported }) => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    const recovery = WingaRecoveryClient.createRecoveryClient({ owner: session.username, getSession: () => session,
      vault, codec: await WingaSecureContent.loadSecureContent(), request: window.recoveryRequest });
    try {
      const first = await recovery.backup(exported.key), oldRemote = await window.recoveryRequest('GET', undefined,
        { owner: session.username, deviceId: session.sessionId, token: session.token });
      await recovery.backup(exported.key);
      const rollback = WingaRecoveryClient.createRecoveryClient({ owner: session.username, getSession: () => session,
        vault, codec: await WingaSecureContent.loadSecureContent(), request: async () => oldRemote });
      let rejected;
      try { await rollback.restore(exported.key); } catch (error) { rejected = error.message; }
      return { first: first.revision, checkpoint: await recovery.exportCheckpoint(), rejected };
    } finally { vault.close(); }
  }, { session, exported });
  expect(result.first).toBe('1'); expect(result.checkpoint.revision).toBe('2');
  expect(result.rejected).toBe('recovery_freshness_rejected');
});

test('recovery retains prior archive history when a local record has been evicted', async ({ page }) => {
  await prepare(page);
  const result = await page.evaluate(async session => {
    const vault = await WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: () => session });
    const codec = await WingaSecureContent.loadSecureContent(), key = codec.generateRecoveryKey();
    const recovery = WingaRecoveryClient.createRecoveryClient({ owner: session.username, getSession: () => session,
      vault, codec, request: window.recoveryRequest });
    try {
      await vault.write({ expectedRevision: '0', values: { 'history:old': { text: 'older' }, 'history:current': { text: 'current' } } });
      await recovery.backup(key);
      let saved = await vault.snapshot();
      await vault.write({ expectedRevision: saved.revision, values: { 'history:new': { text: 'newer' } }, deleted: ['history:old'] });
      const accepted = await recovery.backup(key);
      await recovery.restore(key);
      saved = await vault.snapshot();
      return { revision: accepted.revision, texts: ['history:old', 'history:current', 'history:new'].map(id => saved.values[id].text) };
    } finally { vault.close(); }
  }, session);
  expect(result).toEqual({ revision: '2', texts: ['older', 'current', 'newer'] });
});

test('device approval UI confirms an independent pending device and revokes it without transferring keys',async({page,browser})=>{
  await prepare(page);const own=await enroll(page),otherContext=await browser.newContext();
  try {
    const other=await otherContext.newPage();await prepare(other);const pending=await enroll(other);expect(pending.status).toBe('pending');
    await other.evaluate(async session=>WingaDeviceManagementUi.open({dataLayer:{createCryptoDeviceManagement:()=>WingaDeviceManagementUi.createManagementSession({getSession:()=>session,request:window.deviceRequest})}}),session);
    await other.locator('[data-crypto-device-confirm]').fill(pending.fingerprint);
    await expect(other.locator('[data-crypto-device-apply]')).toBeDisabled();await expect(other.locator('dialog [role=status]')).toHaveText('Pending approval');
    await expect(other.getByRole('button',{name:'Stop retrying this action'})).toBeHidden();
    await other.getByRole('button',{name:'Close',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async session=>WingaDeviceManagementUi.open({dataLayer:{createCryptoDeviceManagement:()=>WingaDeviceManagementUi.createManagementSession({getSession:()=>session,request:window.deviceRequest})}}),session);
    await expect(page.getByRole('button',{name:'Stop retrying this action'})).toBeHidden();
    await page.locator('[data-crypto-device-target]').selectOption(pending.id);
    await page.locator('[data-crypto-device-confirm]').fill('0'.repeat(64));await expect(page.locator('[data-crypto-device-apply]')).toBeDisabled();
    await page.locator('[data-crypto-device-confirm]').fill(pending.fingerprint);await expect(page.locator('[data-crypto-device-apply]')).toBeEnabled();
    await page.locator('[data-crypto-device-apply]').click();await expect(page.locator('[data-crypto-device-apply]')).toBeDisabled();
    expect((await enroll(other)).status).toBe('active');
    expect((await store.readConversationCryptoDevices({owner:'bob',deviceId:'b1',token:'b1'})).devices.find(d=>d.id===own.id).status).toBe('active');
    await page.locator('[data-crypto-device-target]').selectOption(pending.id);await expect(page.locator('[data-crypto-device-action]')).toHaveValue('revoke');
    await page.locator('[data-crypto-device-confirm]').fill(pending.fingerprint);await page.locator('[data-crypto-device-apply]').click();
    await expect(page.locator('[data-crypto-device-target] option[value="'+pending.id+'"]').first()).toHaveCount(0);
    expect((await store.readConversationCryptoDevices({owner:'bob',deviceId:'b1',token:'b1'})).devices.find(d=>d.id===pending.id).status).toBe('revoked');
    expect(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:'test-results/crypto-device-management-mobile.png'});
    expect(await other.evaluate(async()=>{const d=await new Promise(resolve=>{const r=indexedDB.databases();r.then(resolve);});return d.some(v=>String(v.name).startsWith('winga-encrypted-vault'));})).toBe(false);
    await page.getByRole('button',{name:'Close',exact:true}).click();
  }finally{await otherContext.close();}
});

test('lost accepted device approval survives reload with the exact native proof and request ID',async({page,browser})=>{
  const proofs=[];let lose=true;
  await prepare(page,async(method,payload,context)=>{const result=method==='GET'?await store.readConversationCryptoDevices(context):await store.mutateConversationCryptoDevice(context,payload);if(payload?.action==='approve'){proofs.push(payload);if(lose){lose=false;throw new Error('lost_reply');}}return result;});
  await enroll(page);const second=await browser.newContext();
  try {
    const other=await second.newPage();await prepare(other);const pending=await enroll(other);
    expect(await page.evaluate(async({session,pending})=>{const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>session,request:window.deviceRequest});try{await c.manage('approve',pending.id,pending.fingerprint);}catch(e){return e.message;}finally{c.close();}},{session,pending})).toContain('lost_reply');
    await page.reload();
    const result=await page.evaluate(async({session,pending})=>{const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>session,request:window.deviceRequest});try{return await c.manage('approve',pending.id,pending.fingerprint);}finally{c.close();}},{session,pending});
    expect(result.pendingOperation).toBe(null);expect(result.devices.find(d=>d.id===pending.id).status).toBe('active');expect(proofs).toHaveLength(2);expect(proofs[1]).toEqual(proofs[0]);
    expect((await db.query("SELECT COUNT(*)::int AS n FROM conversation_crypto_operations WHERE result->'device'->>'id'=$1",[pending.id])).rows[0].n).toBe(2);
  }finally{await second.close();}
});

test('lost self-revocation can reconcile its exact retained proof but cannot approve another device',async({page})=>{
  let lose=true;const proofs=[];
  await prepare(page,async(method,payload,context)=>{const result=method==='GET'?await store.readConversationCryptoDevices(context):await store.mutateConversationCryptoDevice(context,payload);if(payload?.action==='revoke'){proofs.push(payload);if(lose){lose=false;throw new Error('lost_reply');}}return result;});
  const own=await enroll(page);
  await page.evaluate(async({session,own})=>{const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>session,request:window.deviceRequest});try{await c.manage('revoke',own.id,own.fingerprint);}catch(e){if(!e.message.includes('lost_reply'))throw e;}finally{c.close();}},{session,own});
  await page.reload();
  const result=await page.evaluate(async({session,own})=>{const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>session,request:window.deviceRequest});try{const result=await c.manage('revoke',own.id,own.fingerprint);let denied='';try{await c.manage('approve',own.id,own.fingerprint);}catch(e){denied=e.code;}return {status:result.ownDevice.status,pending:result.pendingOperation,denied};}finally{c.close();}},{session,own});
  expect(result).toEqual({status:'revoked',pending:null,denied:'crypto_device_confirmation_required'});expect(proofs[1]).toEqual(proofs[0]);
});

test('retiring an old-session device retry changes no server state and allows a fresh current-session action',async({page,browser})=>{
  await prepare(page,async(method,payload,context)=>{if(payload?.action==='approve' && context.deviceId==='b1')throw new Error('offline');return method==='GET'?store.readConversationCryptoDevices(context):store.mutateConversationCryptoDevice(context,payload);});
  await enroll(page);const otherContext=await browser.newContext();try{
    const other=await otherContext.newPage();await prepare(other);const pending=await enroll(other);
    await page.evaluate(async({session,pending})=>{const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>session,request:window.deviceRequest});try{await c.manage('approve',pending.id,pending.fingerprint);}catch(e){if(!e.message.includes('offline'))throw e;}finally{c.close();}},{session,pending});
    const result=await page.evaluate(async pending=>{const current={username:'bob',sessionId:'b2',token:'b2'};
      const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>current,request:window.deviceRequest});
      try{let blocked='';try{await c.manage('approve',pending.id,pending.fingerprint);}catch(e){blocked=e.code;}
        const view=await c.clearPending(),accepted=await c.manage('approve',pending.id,pending.fingerprint);return {blocked,pending:view.pendingOperation,status:view.devices.find(d=>d.id===pending.id).status,accepted:accepted.devices.find(d=>d.id===pending.id).status};}finally{c.close();}
    },pending);
    expect(result).toEqual({blocked:'crypto_device_pending_operation',pending:null,status:'pending',accepted:'active'});
    expect((await db.query("SELECT COUNT(*)::int AS n FROM conversation_crypto_operations WHERE result->'device'->>'id'=$1",[pending.id])).rows[0].n).toBe(2);
  }finally{await otherContext.close();}
});

test('device directory substitution and session switching fail before a management mutation',async({page})=>{
  await prepare(page);const own=await enroll(page);
  const result=await page.evaluate(async({session,own})=>{
    let active={...session},posts=0;
    const c=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>active,request:async(method,payload,context)=>{
      if(method==='POST'){posts++;return deviceRequest(method,payload,context);}const r=await deviceRequest(method,payload,context);return {...r,devices:r.devices.map(d=>({...d,fingerprint:'0'.repeat(64)}))};}});
    let substituted='';try{await c.manage('revoke',own.id,own.fingerprint);}catch(e){substituted=e.code;}finally{c.close();}
    const changed=await WingaCryptoDevices.createCryptoDeviceClient({getSession:()=>active,request:async(...args)=>{const r=await deviceRequest(...args);active={username:'alice',sessionId:'a',token:'a'};return r;}});
    let switched='';try{await changed.manage('revoke',own.id,own.fingerprint);}catch(e){switched=e.code;}finally{changed.close();}
    return {posts,substituted,switched};
  },{session,own});
  expect(result).toEqual({posts:0,substituted:'crypto_device_server_identity_mismatch',switched:'crypto_device_session_changed'});
});

test('recovery merges receipt progress monotonically but rejects changed message contents',async({page})=>{
  await prepare(page);
  const result=await page.evaluate(async session=>{
    const vault=await WingaEncryptedVault.createEncryptedVault({owner:session.username,getSession:()=>session});
    const codec=await WingaSecureContent.loadSecureContent(),key=codec.generateRecoveryKey();
    const recovery=WingaRecoveryClient.createRecoveryClient({owner:session.username,getSession:()=>session,vault,codec,request:window.recoveryRequest});
    const write=async status=>{const s=await vault.snapshot();await vault.write({expectedRevision:s.revision,values:{'history:one':{id:'one',message:'immutable',status}}});};
    try {
      await write('sent');await recovery.backup(key);
      await write('read');await recovery.restore(key);
      const advanced=(await vault.snapshot()).values['history:one'].status;
      await recovery.backup(key);await write('delivered');await recovery.restore(key);
      const retained=(await vault.snapshot()).values['history:one'].status;
      let s=await vault.snapshot();await vault.write({expectedRevision:s.revision,values:{'history:one':{id:'one',message:'changed',status:'read'}}});
      s=await vault.snapshot();let rejected='';try{await recovery.restore(key);}catch(e){rejected=e.code;}
      const after=await vault.snapshot();return {advanced,retained,rejected,unchanged:JSON.stringify(s)===JSON.stringify(after)};
    }finally{vault.close();}
  },session);
  expect(result).toEqual({advanced:'read',retained:'read',rejected:'recovery_local_history_conflict',unchanged:true});
});
