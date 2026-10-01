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
