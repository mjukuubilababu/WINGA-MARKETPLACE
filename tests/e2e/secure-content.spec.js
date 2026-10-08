const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
let server, origin;
const assets = {
  '/secure-content.js': 'src/chat/secure-content.js',
};
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/csp-probe.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end("window.cspEvalBlocked=false;try{window.eval('1+1');}catch{window.cspEvalBlocked=true;}");
      return;
    }
    if (assets[req.url]) {
      const bytes = fs.readFileSync(path.join(root, assets[req.url]));
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(bytes);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none'" });
    res.end('<!doctype html><title>Encrypted content test</title><script src="/secure-content.js"></script><script src="/csp-probe.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`self-hosted crypto works under strict script CSP at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const codec = await WingaSecureContent.loadSecureContent();
      const binding = { conversationId: 'synthetic-thread', attachmentId: 'synthetic-file' };
      const sealed = await codec.encryptMedia(new Blob(['private image bytes']), binding,
        { name: 'private-image.png', mime: 'image/png' });
      const opened = await codec.decryptMedia(sealed.ciphertext, sealed.descriptor, binding);
      const key = codec.generateRecoveryKey();
      const recovery = { owner: 'synthetic-user', id: 'archive-1', generation: 1 };
      const capsule = await codec.sealRecovery(new TextEncoder().encode('private history'), key, recovery);
      let wrongKeyRejected = false;
      try { await codec.openRecovery(capsule, codec.generateRecoveryKey(), recovery); } catch { wrongKeyRejected = true; }
      return { content: await opened.blob.text(), name: opened.name,
        history: new TextDecoder().decode(await codec.openRecovery(capsule, key, recovery)),
        wrongKeyRejected, localStorageEmpty: localStorage.length === 0,
        sharedLoader: codec === await WingaSecureContent.loadSecureContent() };
    });
    expect(result).toEqual({ content: 'private image bytes', name: 'private-image.png',
      history: 'private history', wrongKeyRejected: true, localStorageEmpty: true, sharedLoader: true });
  });
}

test('a user-held recovery key opens stored encrypted media after a complete browser restart', async () => {
  test.setTimeout(120000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-secure-content-'));
  let context;
  const launch = () => chromium.launchPersistentContext(profile, { channel: process.env.WINGA_TEST_BROWSER_CHANNEL==='chromium'?undefined:'msedge', headless: true });
  try {
    context = await launch();
    let page = context.pages()[0] || await context.newPage();
    await page.goto(origin);
    const userHeldKey = await page.evaluate(async () => {
      const codec = await WingaSecureContent.loadSecureContent();
      const binding = { conversationId: 'synthetic-thread', attachmentId: 'synthetic-file' };
      const sealed = await codec.encryptMedia(new Blob(['file survives restart']), binding,
        { name: 'private-contract.pdf', mime: 'application/pdf' });
      const key = codec.generateRecoveryKey();
      const capsule = await codec.sealRecovery(new TextEncoder().encode(JSON.stringify(sealed.descriptor)),
        key, { owner: 'synthetic-user', id: 'archive-1', generation: 1 });
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('winga-encrypted-content-test', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('encrypted');
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('encrypted', 'readwrite');
          tx.objectStore('encrypted').put({ capsule, blob: sealed.ciphertext }, 'archive');
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
      // Test runner simulates the user keeping the recovery key outside browser storage.
      return key;
    });
    await context.close(); context = undefined;
    context = await launch(); page = context.pages()[0] || await context.newPage();
    await page.goto(origin);
    const restored = await page.evaluate(async key => {
      const codec = await WingaSecureContent.loadSecureContent();
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('winga-encrypted-content-test', 1);
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      try {
        const stored = await new Promise((resolve, reject) => {
          const req = db.transaction('encrypted', 'readonly').objectStore('encrypted').get('archive');
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        const descriptor = JSON.parse(new TextDecoder().decode(await codec.openRecovery(stored.capsule, key,
          { owner: 'synthetic-user', id: 'archive-1', generation: 1 })));
        const opened = await codec.decryptMedia(stored.blob, descriptor,
          { conversationId: 'synthetic-thread', attachmentId: 'synthetic-file' });
        return { name: opened.name, content: await opened.blob.text(),
          keyAbsentFromStoredRecord: !JSON.stringify(stored.capsule).includes(key),
          plaintextAbsentFromStoredRecord: !JSON.stringify(stored.capsule).includes('private-contract'),
          localStorageEmpty: localStorage.length === 0 };
      } finally { db.close(); }
    }, userHeldKey);
    expect(restored).toEqual({ name: 'private-contract.pdf', content: 'file survives restart',
      keyAbsentFromStoredRecord: true, plaintextAbsentFromStoredRecord: true, localStorageEmpty: true });
  } finally {
    if (context) await context.close();
    const resolved = fs.realpathSync(profile), temp = fs.realpathSync(os.tmpdir());
    if (path.dirname(resolved) !== temp || !path.basename(resolved).startsWith('winga-secure-content-')) {
      throw new Error('Unexpected synthetic browser profile path');
    }
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('strict CSP still blocks JavaScript eval and unsupported crypto never returns plaintext', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    let unsupportedRejected = false, unavailableRejected = false;
    const codec = await WingaSecureContent.loadSecureContent();
    const binding = { conversationId: 'thread', attachmentId: 'file' };
    const sealed = await codec.encryptMedia(new Blob(['secret']), binding);
    try { await codec.decryptMedia(sealed.ciphertext, { ...sealed.descriptor, algorithm: 'plaintext' }, binding); }
    catch { unsupportedRejected = true; }
    try { await WingaSecureContent.createSecureContent(null); } catch { unavailableRejected = true; }
    return { evalBlocked: window.cspEvalBlocked, unsupportedRejected, unavailableRejected,
      externalDependencies: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/vendor/')).length };
  });
  expect(result).toEqual({ evalBlocked: true, unsupportedRejected: true, unavailableRejected: true, externalDependencies: 0 });
});
