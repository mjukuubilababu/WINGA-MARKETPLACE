const { test, expect } = require('@playwright/test');

test('non-extractable browser key survives tab restart without export or localStorage', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  try {
    await first.goto('/');
    const created = await first.evaluate(async () => {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('winga-crypto-feasibility-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('keys', 'readwrite');
          tx.objectStore('keys').put(key, 'synthetic-device');
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
      return { extractable: key.extractable, localStorageKey: localStorage.getItem('synthetic-device') };
    });
    expect(created).toEqual({ extractable: false, localStorageKey: null });
    await first.close();

    const reopened = await context.newPage();
    await reopened.goto('/');
    const restored = await reopened.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('winga-crypto-feasibility-v1', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const key = await new Promise((resolve, reject) => {
          const request = db.transaction('keys').objectStore('keys').get('synthetic-device');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        let exportDenied = false;
        try { await crypto.subtle.exportKey('raw', key); }
        catch { exportDenied = true; }
        return { persisted: key instanceof CryptoKey, extractable: key.extractable, exportDenied };
      } finally { db.close(); }
    });
    expect(restored).toEqual({ persisted: true, extractable: false, exportDenied: true });
  } finally { await context.close(); }
});
