const http = require('node:http');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

let server;
let url;

test.beforeAll(async () => {
  server = http.createServer((_request, response) => {
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
