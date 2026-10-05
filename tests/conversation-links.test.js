const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const window = { WingaModules: { chat: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/chat/ui.js'), 'utf8'), { window, URL });
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  return { normalize: window.WingaModules.chat.normalizeConversationLink,
    ui: window.WingaModules.chat.createChatUiModule({ escapeHtml }) };
}

test('conversation links normalize only explicit HTTP(S) destinations', () => {
  const { normalize } = fixture();
  assert.equal(normalize('HTTPS://Example.com:443/a?x=1&y=2').href, 'https://example.com/a?x=1&y=2');
  assert.equal(normalize('https://münich.example/你好').host, 'xn--mnich-kva.example');
  assert.equal(normalize('http://example.com/a').protocol, 'http:');
});

test('conversation links reject active schemes, credentials and ambiguous URL characters', () => {
  const { normalize } = fixture();
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/x', '//example.com', 'www.example.com', 'https:example.com', 'https://', 'https://user:pass@example.com', 'https://@example.com', 'https://example.com\\@evil.test', 'https://exa\nmple.com', ' https://example.com', 'https://example.com/%0aheader', 'https://example.com/\u202Efake', 'https://example.com/\u200Bhidden', 'https://example.com/' + 'x'.repeat(2048), null, {}]) {
    assert.equal(normalize(value), null, String(value));
  }
});

test('conversation text keeps Unicode, line breaks and balanced URL punctuation', () => {
  const { ui } = fixture();
  const text = 'Habari 👋\n(https://example.com/a_(b)), na https://example.org/?x=1&y=2!\nشكراً';
  const html = ui.renderMessageText(text);
  assert.equal((html.match(/data-chat-link=/g) || []).length, 2);
  assert.match(html, /data-chat-link="https:\/\/example.com\/a_\(b\)"/);
  assert.match(html, /data-chat-link="https:\/\/example.org\/\?x=1&amp;y=2"/);
  assert.match(html, /Habari 👋\n\(/);
  assert.match(html, /<\/button>\), na/);
  assert.match(html, /<\/button>!\nشكراً/);
  assert.doesNotMatch(html, /href=|<img|<iframe|<script/);
});

test('unsafe or embedded URL tokens stay escaped non-interactive text', () => {
  const { ui } = fixture();
  const text = '<img onerror="alert(1)"> javascript:https://example.com data:https://example.org https://user:pass@example.com https://evil.test\\@example.com';
  const html = ui.renderMessageText(text);
  assert.doesNotMatch(html, /data-chat-link|<img|<script|onclick=/);
  assert.match(html, /&lt;img onerror=&quot;alert\(1\)&quot;&gt;/);
});

test('rendered links carry dialog semantics but never trigger preview fetching', () => {
  const { ui } = fixture();
  const html = ui.renderMessageText('https://example.com/?next=%22%3E');
  assert.match(html, /type="button"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /dir="ltr"/);
  assert.doesNotMatch(html, /href=|src=|prefetch|on\w+=/);
});
