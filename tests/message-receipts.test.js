const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

function receiptFixture() {
  const surface = { dataset: { chatReadUser: 'bob' }, getClientRects: () => [{}],
    getBoundingClientRect: () => ({ top: 0, bottom: 600, left: 0, right: 400 }),
    querySelectorAll: () => [{ dataset: { messageBubbleId: 'visible' },
      getBoundingClientRect: () => ({ top: 100, bottom: 180, left: 10, right: 300, height: 80 }) }] };
  const calls = [];
  let refreshes = 0;
  const context = vm.createContext({
    currentUser: 'alice', currentView: 'profile', profileDiv: {},
    replaceMessagesPanel: () => {}, replaceContextChatModal: () => {},
    chatUiState: { activeContext: { withUser: 'bob' }, isContextOpen: false },
    currentMessages: [{ id: 'visible', receiverId: 'alice', senderId: 'bob', isRead: false }],
    getMessageDeviceReceipts: () => ({ markRead: async (messages, visible) => {
      if (!messages.some(message => visible(message.id))) return false;
      await context.window.WingaDataLayer.markConversationRead({ withUser: 'bob' });
      return true;
    } }),
    getMessagePartner: message => message.senderId,
    getConversationSummaries: () => [],
    document: { visibilityState: 'visible', hasFocus: () => true, querySelector: () => surface },
    window: {
      innerHeight: 800, innerWidth: 400,
      getComputedStyle: () => ({ visibility: 'visible' }),
      WingaDataLayer: { markConversationRead: async payload => { calls.push(payload.withUser); } }
    },
    refreshMessagesState: async () => { refreshes++; },
    refreshNotificationsState: async () => { refreshes++; }
  });
  vm.runInContext(appSource.slice(appSource.indexOf('function isActiveConversationVisible()'),
    appSource.indexOf('function disconnectRealtimeChannel()')), context);
  return { context, surface, calls, get refreshes() { return refreshes; } };
}

test('read acknowledgement requires a rendered matching conversation in a focused visible tab', async () => {
  const changes = [
    f => { f.context.document.visibilityState = 'hidden'; },
    f => { f.context.document.hasFocus = () => false; },
    f => { f.context.currentUser = ''; },
    f => { f.context.currentView = 'home'; f.context.document.querySelector = () => { throw new Error('No surface lookup expected'); }; },
    f => { f.context.chatUiState.activeContext = null; },
    f => { f.context.document.querySelector = () => null; },
    f => { f.surface.dataset.chatReadUser = 'carol'; },
    f => { f.surface.getClientRects = () => []; },
    f => { f.context.window.getComputedStyle = () => ({ visibility: 'hidden' }); }
  ];
  for (const change of changes) {
    const f = receiptFixture();
    change(f);
    await f.context.markActiveConversationRead();
    assert.equal(f.calls.length, 0);
    assert.equal(f.refreshes, 0);
  }
});

test('foreground inbox and modal acknowledge only their active incoming conversation', async () => {
  for (const modal of [false, true]) {
    const f = receiptFixture();
    f.context.chatUiState.isContextOpen = modal;
    if (modal) f.context.currentView = 'home';
    f.context.document.querySelector = selector => {
      assert.equal(selector, modal ? '#context-chat-modal [data-chat-read-user]' : '#profile-messages-panel [data-chat-read-user]');
      return f.surface;
    };
    await f.context.markActiveConversationRead();
    assert.deepEqual(f.calls, ['bob']);
    assert.equal(f.refreshes, 2);
  }
  const f = receiptFixture();
  f.context.currentMessages = [{ senderId: 'alice', receiverId: 'bob', isRead: false }];
  await f.context.markActiveConversationRead();
  assert.equal(f.calls.length, 0);
});

test('viewport reads exclude offscreen history, outgoing messages and occluded bubbles', async () => {
  const f = receiptFixture();
  const reached = [];
  f.surface.querySelectorAll = () => [
    { dataset: { messageBubbleId: 'visible' }, getBoundingClientRect: () => ({ top: 80, bottom: 160, left: 10, right: 300, height: 80 }) },
    { dataset: { messageBubbleId: 'offscreen' }, getBoundingClientRect: () => ({ top: 700, bottom: 780, left: 10, right: 300, height: 80 }) }
  ];
  f.context.currentMessages.push({ id: 'offscreen', receiverId: 'alice', senderId: 'bob', isRead: false });
  f.context.getMessageDeviceReceipts = () => ({ markRead: async (rows, visible) => {
    reached.push(...rows.filter(row => visible(row.id)).map(row => row.id)); return true;
  } });
  await f.context.markActiveConversationRead();
  assert.deepEqual(reached, ['visible']);
  f.context.document.elementFromPoint = () => ({});
  f.surface.querySelectorAll = () => [{ dataset: { messageBubbleId: 'visible' }, contains: () => false,
    getBoundingClientRect: () => ({ top: 80, bottom: 160, left: 10, right: 300, height: 80 }) }];
  await f.context.markActiveConversationRead();
  assert.deepEqual(reached, ['visible']);
});

test('returning to foreground resumes read but a changed account cannot refresh old chat state', async () => {
  const f = receiptFixture();
  f.context.document.visibilityState = 'hidden';
  await f.context.markActiveConversationRead();
  f.context.document.visibilityState = 'visible';
  f.context.window.WingaDataLayer.markConversationRead = async payload => {
    f.calls.push(payload.withUser);
    f.context.currentUser = 'carol';
  };
  await f.context.markActiveConversationRead();
  assert.deepEqual(f.calls, ['bob']);
  assert.equal(f.refreshes, 0);
});

test('read receipts use the mobile visual viewport, not the keyboard-covered layout viewport', async () => {
  const f = receiptFixture();
  f.context.window.visualViewport = { offsetTop: 200, offsetLeft: 30, height: 150, width: 200 };
  const reached = [];
  const bounds = [
    ['visible', 230, 290, 50, 180],
    ['above', 100, 180, 50, 180],
    ['keyboard', 400, 480, 50, 180],
    ['side', 230, 290, 250, 320],
    ['sliver', 330, 410, 50, 180]
  ];
  f.surface.querySelectorAll = () => bounds.map(([id, top, bottom, left, right]) => ({
    dataset: { messageBubbleId: id },
    getBoundingClientRect: () => ({ top, bottom, left, right, height: bottom - top })
  }));
  f.context.currentMessages = bounds.map(([id]) => ({ id, receiverId: 'alice', senderId: 'bob', isRead: false }));
  f.context.getMessageDeviceReceipts = () => ({ markRead: async (rows, visible) => {
    reached.push(...rows.filter(row => visible(row.id)).map(row => row.id)); return true;
  } });
  await f.context.markActiveConversationRead();
  assert.deepEqual(reached, ['visible']);
});

test('collapsed mobile visual viewport cannot acknowledge messages as read', async () => {
  for (const dimension of ['width', 'height']) {
    const f = receiptFixture();
    f.context.window.visualViewport = { offsetTop: 0, offsetLeft: 0, width: 400, height: 600, [dimension]: 0 };
    await f.context.markActiveConversationRead();
    assert.deepEqual(f.calls, []);
  }
});

test('invalid visual viewport measurements fail closed', async () => {
  for (const invalid of [NaN, Infinity, -1]) {
    const f = receiptFixture();
    f.context.window.visualViewport = { offsetTop: 0, offsetLeft: 0, width: 400, height: invalid };
    await f.context.markActiveConversationRead();
    assert.deepEqual(f.calls, []);
  }
});

test('mobile viewport events recheck Read after layout changes using one throttled timer', async () => {
  const f = receiptFixture();
  const listeners = new Map(), timers = [];
  f.context.window.visualViewport = { offsetTop: 0, offsetLeft: 0, width: 400, height: 80, addEventListener() {} };
  f.context.window.setTimeout = callback => { timers.push(callback); return timers.length; };
  f.context.registerAppEvent = (target, type, listener) => listeners.set(`${target === f.context.document ? 'document' : 'viewport'}:${type}`, listener);
  vm.runInContext(appSource.slice(appSource.indexOf('let conversationReadTimer = 0;'),
    appSource.indexOf('registerAppEvent(window, "pagehide"')), f.context);
  assert.deepEqual([...listeners.keys()], ['document:scroll', 'viewport:resize', 'viewport:scroll']);
  await f.context.markActiveConversationRead();
  assert.deepEqual(f.calls, []);
  f.context.window.visualViewport.height = 600;
  for (const listener of listeners.values()) listener();
  assert.equal(timers.length, 1);
  assert.deepEqual(f.calls, []);
  timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, ['bob']);
  f.context.window.visualViewport.height = 80;
  listeners.get('viewport:scroll')();
  assert.equal(timers.length, 1);
  timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, ['bob']);
});

test('read sync clears only the acknowledged unread badge without replacing the conversation', async () => {
  for (const modal of [false, true]) {
    const f = receiptFixture();
    f.context.chatUiState.isContextOpen = modal;
    const rendered = [];
    f.context.replaceMessagesPanel = () => rendered.push('inbox');
    f.context.replaceContextChatModal = () => rendered.push('modal');
    const cleared = [];
    f.context.getConversationSummaries = () => [{ withUser: 'bob', unreadCount: 0 }];
    f.context.document.querySelectorAll = () => ['bob', 'carol'].map(partner => ({
      dataset: { conversationUser: partner },
      classList: { remove: value => cleared.push(`${partner}:${value}`) },
      querySelector: () => ({ remove: () => cleared.push(`${partner}:badge`) })
    }));
    await f.context.markActiveConversationRead();
    assert.equal(rendered.length, 0);
    assert.deepEqual(cleared, ['bob:is-unread', 'bob:badge']);
  }
});

test('private device notification payload omits sender, message, product and routing metadata', () => {
  const context = vm.createContext({ translateUi: (key, args, fallback) => fallback });
  vm.runInContext(appSource.slice(appSource.indexOf('function getDeviceNotificationContent('),
    appSource.indexOf('function showInAppNotification(')), context);
  for (const metadata of [{ type: 'message' }, { type: 'request' }, { type: 'MESSAGE' }, { type: 'order', messageId: 'secret-id' }]) {
    const result = context.getDeviceNotificationContent({ ...metadata,
      title: 'Private sender', body: 'Private message', productName: 'Private product', fromUser: 'secret-user' });
    assert.equal(result.title, 'Winga');
    assert.equal(result.body, 'Una ujumbe mpya.');
    assert.deepEqual(Object.keys(result), ['title', 'body']);
    assert.doesNotMatch(JSON.stringify(result), /Private|secret/);
  }
  const order = context.getDeviceNotificationContent({ type: 'order', title: 'Order update', body: 'Approved' });
  assert.equal(order.title, 'Order update');
  assert.equal(order.body, 'Approved');
});

test('pending messages offer retry without claiming Sent or exposing local errors', () => {
  const context = vm.createContext({ window: { WingaModules: { chat: {} } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/chat/ui.js'), 'utf8'), context);
  const ui = context.window.WingaModules.chat.createChatUiModule({
    escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    getActiveChatContext: () => ({ withUser: 'bob' }),
    getPendingMessages: partner => {
      assert.equal(partner, 'bob');
      return [{ id: 'local1', status: 'FAILED', lastErrorCode: 'private-internal-error', payload: { message: '<script>bad</script>' } }];
    }
  });
  const html = ui.renderConversationMessagesMarkup([]);
  assert.match(html, /data-message-retry="local1"/);
  assert.match(html, /Message failed/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|private-internal-error|\| Sent/);
});

test('conversation render follows durable sequence instead of timestamps', () => {
  const context = vm.createContext({ window: {}, document: { documentElement: { lang: 'en' } } });
  for (const file of ['pagination.js','ui.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/chat',file),'utf8'),context);
  const ui = context.window.WingaModules.chat.createChatUiModule({
    escapeHtml: String, getCurrentUser: () => 'sender',
    getMessageProductItems: () => [], getReplyPreviewMessage: () => null
  });
  const html = ui.renderConversationMessagesMarkup([
    { id:'late', senderId:'sender', message:'LATER_SEQUENCE', conversationSequence:'9007199254740993', timestamp:'2000-01-01T00:00:00Z' },
    { id:'early', senderId:'sender', message:'EARLIER_SEQUENCE', conversationSequence:'9007199254740992', timestamp:'2026-09-28T00:00:00Z' }
  ]);
  assert.ok(html.includes('EARLIER_SEQUENCE') && html.includes('LATER_SEQUENCE'));
  assert.ok(html.indexOf('EARLIER_SEQUENCE') < html.indexOf('LATER_SEQUENCE'));
});

test('receipt migration changes defaults without rewriting historical receipts', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE messages(id TEXT PRIMARY KEY, is_delivered BOOLEAN NOT NULL DEFAULT TRUE); INSERT INTO messages(id) VALUES ('legacy');");
    const migration = require('../backend/migrations/message-delivery-default');
    for (let i = 0; i < 2; i++) for (const sql of migration.statements) await db.exec(sql);
    await db.exec("INSERT INTO messages(id) VALUES ('new');");
    const rows = (await db.query('SELECT * FROM messages ORDER BY id')).rows;
    assert.equal(rows[0].is_delivered, true);
    assert.equal(rows[1].is_delivered, false);
  } finally { await db.close(); }
});

test('legacy delivery flag is not presented as recipient proof; canonical read stays visible', () => {
  const context = vm.createContext({ window: { WingaModules: { chat: {} } }, document: { documentElement: { lang: 'en' } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/chat/ui.js'), 'utf8'), context);
  const ui = context.window.WingaModules.chat.createChatUiModule({
    escapeHtml: String, getCurrentUser: () => 'sender',
    getMessageProductItems: () => [], getReplyPreviewMessage: () => null
  });
  const message = { id: 'm1', senderId: 'sender', message: 'Hello', timestamp: '2026-09-22T10:00:00Z', isDelivered: true, isRead: false };
  assert.match(ui.renderConversationMessagesMarkup([message]), /\| Sent/);
  assert.doesNotMatch(ui.renderConversationMessagesMarkup([message]), /Delivered/);
  assert.match(ui.renderConversationMessagesMarkup([{ ...message, isRead: true }]), /\| Read/);
  assert.match(ui.renderConversationMessagesMarkup([{ ...message, deviceDeliveredAt: message.timestamp }]), /\| Delivered/);
  assert.doesNotMatch(ui.renderConversationMessagesMarkup([{ ...message, senderId: 'other' }]), /\| (Sent|Read)/);
});
