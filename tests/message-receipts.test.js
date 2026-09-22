const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

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
  assert.doesNotMatch(ui.renderConversationMessagesMarkup([{ ...message, senderId: 'other' }]), /\| (Sent|Read)/);
});
