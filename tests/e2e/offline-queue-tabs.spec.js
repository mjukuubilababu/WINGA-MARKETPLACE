const { test, expect } = require("@playwright/test");

async function openQueueTab(context) {
  const page = await context.newPage();
  await page.route("**/__queue-test__", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><script src="/src/api/offline-queue.js"></script>'
  }));
  await page.goto("http://127.0.0.1:4173/__queue-test__");
  await page.evaluate(() => {
    window.queue = window.WingaModules.api.offlineQueue.createOfflineQueueTools({
      readSession: () => ({ username: "queue-owner" }),
      safeStorageGet: key => localStorage.getItem(key),
      safeStorageSet: (key, value) => { localStorage.setItem(key, value); return true; },
      safeStorageRemove: key => localStorage.removeItem(key)
    });
  });
  return page;
}

test("real tabs honor queue storage lock and retain simultaneous arrivals", async ({ context }) => {
  const first = await openQueueTab(context);
  const second = await openQueueTab(context);
  await first.evaluate(() => {
    window.held = navigator.locks.request("winga-offline-queue:winga-offline-action-queue:queue-owner", () => {
      window.lockHeld = true;
      return new Promise(resolve => { window.releaseQueue = resolve; });
    });
  });
  await expect.poll(() => first.evaluate(() => window.lockHeld)).toBe(true);
  await second.evaluate(() => {
    window.enqueue = queue.queueOfflineMessageAction({ receiverId: "receiver", message: "Waiting", clientMessageId: crypto.randomUUID() });
  });
  await expect.poll(() => first.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
  expect(await first.evaluate(() => queue.readOfflineActionQueue().length)).toBe(0);
  await first.evaluate(() => window.releaseQueue());
  await second.evaluate(() => window.enqueue);
  const enqueueBatch = (page, prefix) => page.evaluate(async prefix => {
    await Promise.all(Array.from({ length: 40 }, (_, index) => queue.queueOfflineMessageAction({
      receiverId: "receiver", message: `${prefix}-${index}`, clientMessageId: crypto.randomUUID()
    })));
  }, prefix);
  await Promise.all([enqueueBatch(first, "first"), enqueueBatch(second, "second")]);
  const result = await first.evaluate(() => {
    const entries = queue.readOfflineActionQueue();
    return { count: entries.length, unique: new Set(entries.map(item => item.payload.clientMessageId)).size };
  });
  expect(result).toEqual({ count: 81, unique: 81 });
});

test("cross-tab flush waits for sender while enqueue remains available", async ({ context }) => {
  const first = await openQueueTab(context);
  const second = await openQueueTab(context);
  await first.evaluate(() => {
    window.send = queue.sendPersistedMessage({ receiverId: "receiver", message: "In flight", clientMessageId: crypto.randomUUID() }, {
      sendMessage: () => new Promise(resolve => { window.acceptSend = () => resolve({ id: "accepted-first" }); })
    });
  });
  await expect.poll(() => first.evaluate(() => typeof window.acceptSend)).toBe("function");
  await second.evaluate(async () => {
    await queue.queueOfflineMessageAction({ receiverId: "receiver", message: "New arrival", clientMessageId: crypto.randomUUID() });
    window.sent = [];
    window.flush = queue.flushOfflineActionQueue({ sendMessage: async payload => {
      window.sent.push(payload.message);
      return { id: "accepted-second" };
    } });
  });
  await expect.poll(() => first.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
  expect(await second.evaluate(() => queue.readOfflineActionQueue().length)).toBe(2);
  expect(await second.evaluate(() => window.sent)).toEqual([]);
  await first.evaluate(() => window.acceptSend());
  expect(await first.evaluate(async () => (await window.send).id)).toBe("accepted-first");
  expect(await second.evaluate(() => window.flush)).toBe(1);
  expect(await second.evaluate(() => window.sent)).toEqual(["New arrival"]);
  expect(await first.evaluate(() => queue.readOfflineActionQueue().length)).toBe(0);
});
