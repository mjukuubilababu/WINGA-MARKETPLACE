const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect, chromium } = require('@playwright/test');

let server;
let url;
const accepted = new Map();
let failNextAck = false;

test.beforeAll(async () => {
  server = http.createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/synthetic/outbox') {
      try {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const item = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof item.id !== 'string' || !Array.isArray(item.bytes)) {
          throw new Error('Invalid synthetic item');
        }
        const previous = accepted.get(item.id);
        if (previous && JSON.stringify(previous.bytes) !== JSON.stringify(item.bytes)) {
          response.writeHead(409).end();
          return;
        }
        accepted.set(item.id, { bytes: item.bytes, attempts: (previous?.attempts || 0) + 1 });
        if (failNextAck) {
          failNextAck = false;
          response.writeHead(503).end();
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ id: item.id }));
      } catch {
        if (!response.destroyed) response.writeHead(400).end();
      }
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><title>MLS protocol spike</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('synthetic MLS flow runs in Edge with IndexedDB state roundtrip and tab persistence', async ({ page }) => {
  await page.goto(url);
  await page.addScriptTag({ path: path.join(__dirname, 'dist', 'spike.js') });
  const result = await page.evaluate(() => window.runWingaMlsProtocolSpike());
  expect(result).toEqual({
    joined: true,
    encryptedDelivery: true,
    stateRestored: true,
    outOfOrderDelivered: true,
    replayRejected: true,
    removedDeviceRejected: true,
  });

  const context = page.context();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  const storedBytes = await reopened.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('winga-mls-protocol-spike-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('states', 'readonly').objectStore('states')
          .get('synthetic-bob-device');
        request.onsuccess = () => resolve(request.result?.byteLength || 0);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
  expect(storedBytes).toBeGreaterThan(0);
});

test('separate browser contexts deliver after receiver tab restart', async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  try {
    const alice = await aliceContext.newPage();
    let bob = await bobContext.newPage();
    for (const page of [alice, bob]) {
      await page.goto(url);
      await page.addScriptTag({ path: path.join(__dirname, 'dist', 'device.js') });
    }
    await alice.evaluate(() => window.syntheticMlsDevice.initialize('alice'));
    const bobPackage = await bob.evaluate(() => window.syntheticMlsDevice.initialize('bob'));
    await alice.evaluate(() => window.syntheticMlsDevice.create());
    const welcome = await alice.evaluate(
      (bytes) => window.syntheticMlsDevice.addPeer(bytes), bobPackage,
    );
    await bob.evaluate((data) => window.syntheticMlsDevice.join(data), welcome);

    const first = await alice.evaluate(() => window.syntheticMlsDevice.send('before restart'));
    expect(await bob.evaluate((bytes) => window.syntheticMlsDevice.receive(bytes), first))
      .toBe('before restart');

    await bob.close();
    bob = await bobContext.newPage();
    await bob.goto(url);
    await bob.addScriptTag({ path: path.join(__dirname, 'dist', 'device.js') });
    expect(await bob.evaluate(() => window.syntheticMlsDevice.hasState())).toBe(true);
    const second = await alice.evaluate(() => window.syntheticMlsDevice.send('after restart'));
    expect(await bob.evaluate((bytes) => window.syntheticMlsDevice.receive(bytes), second))
      .toBe('after restart');

    const aliceSecondTab = await aliceContext.newPage();
    await aliceSecondTab.goto(url);
    await aliceSecondTab.addScriptTag({ path: path.join(__dirname, 'dist', 'device.js') });
    const [fromFirstTab, fromSecondTab] = await Promise.all([
      alice.evaluate(() => window.syntheticMlsDevice.send('first tab')),
      aliceSecondTab.evaluate(() => window.syntheticMlsDevice.send('second tab')),
    ]);
    expect(await bob.evaluate((bytes) => window.syntheticMlsDevice.receive(bytes), fromFirstTab))
      .toBe('first tab');
    expect(await bob.evaluate((bytes) => window.syntheticMlsDevice.receive(bytes), fromSecondTab))
      .toBe('second tab');

    expect(await alice.evaluate(() => localStorage.length)).toBe(0);
    expect(await bob.evaluate(() => localStorage.length)).toBe(0);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});

test('atomic outbox retries idempotently after ambiguous ACK and Edge process restart', async () => {
  test.setTimeout(120000);
  accepted.clear();
  failNextAck = false;
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-mls-spike-'));
  const launch = (name) => chromium.launchPersistentContext(path.join(profileRoot, name), {
    channel: 'msedge', headless: true,
  });
  const loadPage = async (context) => {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url);
    await page.addScriptTag({ path: path.join(__dirname, 'dist', 'device.js') });
    return page;
  };
  let aliceContext;
  let bobContext;
  try {
    aliceContext = await launch('alice');
    bobContext = await launch('bob');
    let alice = await loadPage(aliceContext);
    let bob = await loadPage(bobContext);
    await alice.evaluate(() => window.syntheticMlsDevice.initialize('alice'));
    const bobPackage = await bob.evaluate(() => window.syntheticMlsDevice.initialize('bob'));
    await alice.evaluate(() => window.syntheticMlsDevice.create());
    const welcome = await alice.evaluate(
      (bytes) => window.syntheticMlsDevice.addPeer(bytes), bobPackage,
    );
    await bob.evaluate((data) => window.syntheticMlsDevice.join(data), welcome);

    const aborted = await alice.evaluate(async () => {
      try {
        await window.syntheticMlsDevice.send('aborted', true);
        return false;
      } catch {
        return true;
      }
    });
    expect(aborted).toBe(true);
    expect(await alice.evaluate(() => window.syntheticMlsDevice.pending())).toEqual([]);

    const queuedBytes = await alice.evaluate(
      () => window.syntheticMlsDevice.send('survives process restart'),
    );
    const beforeRestart = await alice.evaluate(() => window.syntheticMlsDevice.pending());
    expect(beforeRestart).toHaveLength(1);
    failNextAck = true;
    await expect(alice.evaluate(
      (endpoint) => window.syntheticMlsDevice.deliverPending(endpoint), `${url}synthetic/outbox`,
    )).rejects.toThrow();
    expect(accepted.size).toBe(1);
    expect(accepted.get(beforeRestart[0].id).attempts).toBe(1);
    const conflict = await fetch(`${url}synthetic/outbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: beforeRestart[0].id, bytes: [0] }),
    });
    expect(conflict.status).toBe(409);
    expect(accepted.get(beforeRestart[0].id).attempts).toBe(1);
    expect(await alice.evaluate(() => window.syntheticMlsDevice.pending())).toHaveLength(1);
    await aliceContext.close();
    aliceContext = undefined;
    await bobContext.close();
    bobContext = undefined;

    aliceContext = await launch('alice');
    bobContext = await launch('bob');
    alice = await loadPage(aliceContext);
    bob = await loadPage(bobContext);
    const pending = await alice.evaluate(() => window.syntheticMlsDevice.pending());
    expect(pending).toHaveLength(1);
    expect(pending[0].bytes).toEqual(queuedBytes);
    expect(await alice.evaluate(
      (endpoint) => window.syntheticMlsDevice.deliverPending(endpoint), `${url}synthetic/outbox`,
    )).toBe(1);
    expect(accepted.size).toBe(1);
    expect(accepted.get(pending[0].id)).toEqual({ bytes: queuedBytes, attempts: 2 });
    expect(await alice.evaluate(() => window.syntheticMlsDevice.pending())).toEqual([]);
    expect(await bob.evaluate(() => window.syntheticMlsDevice.hasState())).toBe(true);
    expect(await bob.evaluate(
      (bytes) => window.syntheticMlsDevice.receive(bytes), accepted.get(pending[0].id).bytes,
    ))
      .toBe('survives process restart');

    const afterAck = await alice.evaluate(() => window.syntheticMlsDevice.send('after ack'));
    const secondPending = await alice.evaluate(() => window.syntheticMlsDevice.pending());
    expect(secondPending).toHaveLength(1);
    await expect(alice.evaluate(
      (endpoint) => window.syntheticMlsDevice.deliverPending(endpoint, true), `${url}synthetic/outbox`,
    )).rejects.toThrow('Synthetic crash after ACK');
    expect(accepted.size).toBe(2);
    expect(await alice.evaluate(() => window.syntheticMlsDevice.pending())).toHaveLength(1);
    await alice.close();
    alice = await loadPage(aliceContext);
    expect(await alice.evaluate(
      (endpoint) => window.syntheticMlsDevice.deliverPending(endpoint), `${url}synthetic/outbox`,
    )).toBe(1);
    expect(accepted.size).toBe(2);
    expect(accepted.get(secondPending[0].id)).toEqual({ bytes: afterAck, attempts: 2 });
    expect(await alice.evaluate(() => window.syntheticMlsDevice.pending())).toEqual([]);
    expect(await bob.evaluate((bytes) => window.syntheticMlsDevice.receive(bytes), afterAck))
      .toBe('after ack');
  } finally {
    if (aliceContext) await aliceContext.close();
    if (bobContext) await bobContext.close();
    const tempRoot = fs.realpathSync(os.tmpdir());
    const resolved = fs.realpathSync(profileRoot);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('winga-mls-spike-')) {
      throw new Error('Refusing to remove unexpected browser profile path');
    }
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
