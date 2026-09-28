const { test, expect } = require('@playwright/test');

async function fixture(page) {
  await page.route('**/__device-receipts__', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><script src="/src/chat/device-receipts.js"></script>' }));
  await page.goto('http://127.0.0.1:4173/__device-receipts__');
  await page.evaluate(() => {
    window.active = true;
    window.calls = [];
    window.messages = [{ id: 'one', senderId: 'alice', receiverId: 'bob', message: 'Stored private body' },
      { id: 'offscreen', senderId: 'alice', receiverId: 'bob', message: 'Offscreen body' }];
    window.readInbox = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('winga-received-messages-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('messages');
        const rows = tx.objectStore('messages').getAll();
        tx.oncomplete = () => { db.close(); resolve(rows.result); };
      };
    });
    window.api = {
      loadChatDevice: async () => ({ supported: true, deviceId: 'device-one', username: 'bob' }),
      acknowledgeMessages: async payload => {
        const rows = await readInbox();
        if (payload.kind === 'stored' && !payload.messageIds.every(id => rows.some(row => row.message.id === id && row.message.message))) {
          throw new Error('Receipt preceded complete durable payload');
        }
        calls.push(payload);
        return { ok: true };
      }
    };
    window.receipts = window.WingaModules.chat.createDeviceReceipts({ owner: 'bob', dataLayer: api, isCurrent: () => active });
  });
}

test('native IndexedDB commits full payload before Delivered and reads only visible IDs', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    await receipts.persist(messages);
    await receipts.markRead(messages, id => id === 'one');
    await receipts.markRead(messages, id => id === 'one');
    await receipts.persist(messages);
  });
  expect(await page.evaluate(() => calls.map(call => [call.kind, call.messageIds]))).toEqual([
    ['stored', ['one', 'offscreen']], ['read', ['one']]
  ]);
  await page.evaluate(async () => {
    await receipts.markRead(messages, () => false);
    await receipts.markRead(messages, id => id === 'offscreen');
  });
  expect(await page.evaluate(() => calls.at(-1).messageIds)).toEqual(['offscreen']);
  await page.evaluate(() => receipts.dispose());
  expect(await page.evaluate(() => readInbox())).toEqual([]);
});

test('aborted storage, unavailable storage and account switches never acknowledge delivery', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
      return tx;
    };
    let rejected = false;
    try { await receipts.markRead(messages, () => true); } catch { rejected = true; }
    IDBDatabase.prototype.transaction = original;
    const unavailable = window.WingaModules.chat.createDeviceReceipts({ owner: 'bob', dataLayer: api, isCurrent: () => true, indexedDB: null });
    let unavailableRejected = false;
    try { await unavailable.persist(messages); } catch { unavailableRejected = true; }
    active = false;
    await receipts.persist(messages);
    return { rejected, unavailableRejected, calls: calls.length, rows: (await readInbox()).length };
  });
  expect(result).toEqual({ rejected: true, unavailableRejected: true, calls: 0, rows: 0 });
});

test('lost ACK retries safely and a revoked device clears its local inbox', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const send = api.acknowledgeMessages;
    let fail = true;
    api.acknowledgeMessages = async payload => {
      if (fail) { fail = false; throw Object.assign(new Error('Lost response'), { status: 503 }); }
      return send(payload);
    };
    await receipts.persist(messages).catch(() => {});
    const afterFailure = calls.length;
    await receipts.persist(messages);
    api.acknowledgeMessages = async () => { throw Object.assign(new Error('Revoked'), { status: 401 }); };
    await receipts.markRead(messages, () => true).catch(() => {});
    return { afterFailure, stored: calls.filter(c => c.kind === 'stored').length, rows: (await readInbox()).length };
  });
  expect(result).toEqual({ afterFailure: 0, stored: 1, rows: 0 });
});

test('read rechecks focus after storage and logout cannot leave an in-flight write', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    let visible = true;
    const send = api.acknowledgeMessages;
    api.acknowledgeMessages = async payload => { const result = await send(payload); visible = false; return result; };
    await receipts.markRead(messages, () => visible);
    const reads = calls.filter(c => c.kind === 'read').length;
    const pending = receipts.persist([{ ...messages[0], id: 'late' }]);
    const cleanup = receipts.dispose();
    await Promise.all([pending, cleanup]);
    return { reads, rows: (await readInbox()).length };
  });
  expect(result).toEqual({ reads: 0, rows: 0 });
});

test('inbox retention stays bounded and separates authenticated device sessions', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    await receipts.persist(Array.from({ length: 1200 }, (_, i) => ({ ...messages[0], id: `bulk-${i}` })));
    const firstCount = (await readInbox()).length;
    const second = window.WingaModules.chat.createDeviceReceipts({ owner: 'bob', isCurrent: () => true,
      dataLayer: { ...api, loadChatDevice: async () => ({ supported: true, deviceId: 'device-two', username: 'bob' }) } });
    await second.persist(messages);
    await receipts.dispose();
    const rows = await readInbox();
    return { firstCount, remaining: rows.length, otherDevice: rows.every(row => row.scope.includes('device-two')) };
  });
  expect(result).toEqual({ firstCount: 1000, remaining: 2, otherDevice: true });
});
