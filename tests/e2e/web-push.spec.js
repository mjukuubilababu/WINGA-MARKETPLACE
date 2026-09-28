const { test, expect } = require('@playwright/test');

async function fixture(page) {
  await page.route('**/__web-push__', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html lang="sw"><script src="/src/notifications/push.js"></script></html>' }));
  await page.goto('/__web-push__');
  await page.evaluate(() => {
    window.session = { username: 'bob', sessionId: 'one' };
    window.calls = []; window.opened = []; window.unsubscribed = 0; window.closedNotifications = 0;
    window.permission = 'granted'; window.subscribed = 0;
    const key = new Uint8Array([1,2,3]);
    const sub = { options: { applicationServerKey: key.buffer }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test', keys: {} }),
      unsubscribe: async () => { unsubscribed++; } };
    const reg = { pushManager: { getSubscription: async () => subscribed ? sub : null, subscribe: async options => { subscribed++; calls.push(['subscribe', options.userVisibleOnly]); return sub; } },
      getNotifications: async () => [{ close: () => closedNotifications++ }] };
    window.swMessages = {};
    const fakeWindow = {
      navigator: { serviceWorker: { ready: Promise.resolve(reg), addEventListener: (type, handler) => { swMessages[type] = handler; } } },
      PushManager: function() {}, Notification: { get permission() { return window.permission; } },
      document, location: window.location, history: window.history,
      setTimeout: (...args) => window.setTimeout(...args), clearTimeout: id => window.clearTimeout(id), atob: value => window.atob(value),
      addEventListener: (...args) => window.addEventListener(...args)
    };
    window.failResolve = false;
    window.push = WingaModules.notifications.createPushModule({ getWindow: () => fakeWindow, getSession: () => session,
      request: async (path, payload, method) => {
        calls.push([path, payload, method]);
        if (path === 'config') return { supported: true, publicKey: 'AQID' };
        if (path.startsWith('resolve')) {
          if (failResolve) throw Object.assign(new Error('not owner'), { status: 404 });
          return { withUser: 'alice' };
        }
        return { ok: true };
      }, openConversation: async context => opened.push(context) });
  });
}

test('permission grant subscribes and logout removes subscription and visible notifications', async ({ page }) => {
  await fixture(page);
  expect(await page.evaluate(() => push.sync())).toBe(true);
  expect(await page.evaluate(() => calls.find(c => c[0] === 'subscription')[1].locale)).toBe('sw');
  expect(await page.evaluate(() => push.active)).toBe(true);
  await page.evaluate(() => push.logout());
  expect(await page.evaluate(() => ({ active: push.active, closedNotifications, unsubscribed }))).toEqual({ active: false, closedNotifications: 1, unsubscribed: 1 });
});

test('denied permission never subscribes; notification navigation waits for authenticated owner resolution', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => { permission = 'denied'; });
  expect(await page.evaluate(() => push.sync())).toBe(false);
  expect(await page.evaluate(() => subscribed)).toBe(0);
  const id = '11111111-1111-4111-8111-111111111111';
  await page.evaluate(id => { session = null; push.receive(id); }, id);
  expect(await page.evaluate(() => opened)).toEqual([]);
  await page.evaluate(async () => { session = { username: 'bob', sessionId: 'one' }; await push.sync(); });
  await expect.poll(() => page.evaluate(() => opened)).toEqual([{ withUser: 'alice' }]);
  await page.evaluate(id => { failResolve = true; push.receive(id); }, id);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => opened.length)).toBe(1);
});

test('service worker displays generic notification without any open app and routes a cold click', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await page.goto('/offline.html');
  const workerPromise = context.waitForEvent('serviceworker');
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
  const worker = await workerPromise;
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.close();
  const id = '22222222-2222-4222-8222-222222222222';
  const shown = await worker.evaluate(async id => {
    self.dispatchEvent(new PushEvent('push', { data: JSON.stringify({ version: 1, id, locale: 'en', title: 'PRIVATE SENDER', body: 'PRIVATE BODY' }) }));
    let notifications = [];
    for (let attempt=0;attempt<30;attempt++) {
      notifications = await self.registration.getNotifications();
      if (notifications.length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return notifications.map(item => ({ title: item.title, body: item.body, data: item.data }));
  }, id);
  expect(shown).toEqual([{ title: 'Winga', body: 'You have a new message.', data: { id } }]);
  // Browser openWindow requires a trusted OS click; VM tests cover cold routing.
});
