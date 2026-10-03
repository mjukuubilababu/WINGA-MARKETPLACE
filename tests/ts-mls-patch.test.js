const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { correctedSource, patchTsMls, BEFORE, AFTER, BEFORE_HASH, AFTER_HASH } = require('../scripts/patch-ts-mls');
const digest = source => createHash('sha256').update(source).digest('hex');
const installed = fs.readFileSync(path.resolve(__dirname, '../node_modules/ts-mls/dist/src/clientState.js'), 'utf8').replace(/\r\n/g, '\n');
const original = installed.includes(AFTER) ? installed.replace(AFTER, BEFORE) : installed;

test('exact ts-mls source correction is a single validated proposal-membership change', () => {
  assert.equal(digest(original), BEFORE_HASH);
  const changed = correctedSource(original, '1.6.4');
  assert.equal(digest(changed), AFTER_HASH); assert.equal(changed, original.replace(BEFORE, AFTER));
  assert.equal(correctedSource(changed, '1.6.4'), changed);
});
test('canonical CRLF installs get the same verified correction', () => {
  assert.equal(digest(correctedSource(original.replace(/\n/g, '\r\n'), '1.6.4')), AFTER_HASH);
});
test('unexpected package version or any source drift fails closed', () => {
  assert.throws(() => correctedSource(original, '1.6.5'), /version_mismatch/);
  assert.throws(() => correctedSource(original + '\n', '1.6.4'), /source_mismatch/);
  assert.throws(() => correctedSource(original.replace(BEFORE, AFTER + '\n' + AFTER), '1.6.4'), /source_mismatch/);
  assert.throws(() => correctedSource('const selfRemoved = true;', '1.6.4'), /source_mismatch/);
});
test('install correction, verification-only guard and repeated install are reproducible', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-ts-mls-patch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'node_modules/ts-mls'), file = path.join(pkg, 'dist/src/clientState.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true }));
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'ts-mls', version: '1.6.4', main: 'dist/src/index.js' }));
  fs.writeFileSync(path.join(pkg, 'dist/src/index.js'), ''); fs.writeFileSync(file, original);
  assert.throws(() => patchTsMls(root, { checkOnly: true }), /patch_missing/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.deepEqual(patchTsMls(root), { version: '1.6.4', verified: true, changed: true });
  assert.deepEqual(patchTsMls(root), { version: '1.6.4', verified: true, changed: false });
  assert.deepEqual(patchTsMls(root, { checkOnly: true }), { version: '1.6.4', verified: true, changed: false });
  const drift = fs.readFileSync(file, 'utf8') + '\n'; fs.writeFileSync(file, drift);
  assert.throws(() => patchTsMls(root), /source_mismatch/); assert.equal(fs.readFileSync(file, 'utf8'), drift);
});
test('root and backend resolve verified independently patched dependency sources', () => {
  for (const root of [path.resolve(__dirname, '..'), path.resolve(__dirname, '../backend')])
    assert.equal(patchTsMls(root, { checkOnly: true }).verified, true);
});
