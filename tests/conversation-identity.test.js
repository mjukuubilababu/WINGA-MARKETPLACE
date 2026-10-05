const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/localization/catalogs/sw.json'), 'utf8')).messages;
function fixture(users = []) {
  const context = vm.createContext({ currentUser: 'alice', currentSession: null,
    products: [], getMarketplaceUser: username => users.find(user => user.username === username),
    translateUi: (key, _variables, fallback) => catalog[key] || fallback });
  vm.runInContext(source.slice(source.indexOf('function normalizeDisplayName('),
    source.indexOf('function getCurrentUserDisplayName(')), context);
  return context;
}

test('generated technical identities and phone identifiers are not primary display names', () => {
  const context = fixture();
  for (const name of ['buyer-1782938472398-abcd', 'user-1782938472398-a1b2',
    'guest-1782938472398-abcd', 'seller-1782938472398', 'buyer-123456',
    '+255 700 123 456', '255700123456', 'null', 'undefined', '']) {
    assert.equal(context.isPresentableDisplayName(name), false, name);
  }
  for (const name of ['Rey', 'Asha Mussa', 'user-friendly', 'guest-house', 'buyer-42']) {
    assert.equal(context.isPresentableDisplayName(name), true, name);
  }
});

test('human identity comes from canonical profile or supplied name without changing the account key', () => {
  const username = 'guest-1782938472398-abcd';
  const user = { username, fullName: 'Asha Mussa' };
  const context = fixture([user]);
  assert.equal(context.getUserDisplayName(username), 'Asha Mussa');
  assert.equal(user.username, username);
  assert.equal(context.getUserDisplayName('buyer-1782938472398-abcd', { fallback: 'Rey' }), 'Rey');
  assert.equal(context.getUserDisplayName('buyer-1782938472398-abcd'), 'Mtumiaji wa Winga');
  assert.equal(context.getUserDisplayName('255700123456'), 'Mtumiaji wa Winga');
});

test('missing human names use the current language without translating account identity', () => {
  const context = fixture();
  const username = 'guest-1782938472398-abcd';
  context.translateUi = key => { assert.equal(key, 'inbox.person'); return 'Localized person'; };
  assert.equal(context.getUserDisplayName(username), 'Localized person');
  assert.equal(username, 'guest-1782938472398-abcd');
});
