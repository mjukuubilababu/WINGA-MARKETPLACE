const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {MAX_LOG_BYTES, startupDiagnostic, fixturePorts} = require('./helpers/phoenix-fixture-startup');

function fixture(t, text) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-phoenix-startup-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const logPath = path.join(directory, 'phoenix-a.log');
  fs.writeFileSync(logPath, text);
  return logPath;
}
const diagnostic = logPath => startupDiagnostic({name: 'phoenix-a', code: 1, signal: null, logPath});

test('startup diagnostics emit fixed metadata, never raw log text or arbitrary values', t => {
  const secret = 'SYNTHETIC_PRIVATE_TICKET_PROOF_SOURCE_DO_NOT_LOG';
  for (const [text, category] of [
    ['EADDRINUSE', 'address-in-use'], ['Failed to create dirty cpu scheduler thread 7', 'scheduler-resource'],
    ['Could not acquire build lock', 'mix-lock'], ['Could not find application file', 'missing-application'],
    ['CONVERSATION_BACKEND_URL must use HTTPS', 'invalid-configuration'],
    ['Could not start application winga', 'application-start'], ['arbitrary data', 'unclassified']
  ]) {
    const result = diagnostic(fixture(t, secret + '\n' + text));
    assert.deepEqual(result, {fixture: 'phoenix-a', code: 1, signal: 'none', category});
    assert.ok(JSON.stringify(result).length < 180);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.deepEqual(startupDiagnostic({name: secret, code: secret, signal: secret, logPath: secret}),
    {fixture: 'unknown', code: 'unknown', signal: 'unknown', category: 'log-unavailable'});
  for (const code of [-1, 256, NaN, 1.5, null]) assert.equal(startupDiagnostic({code}).code, 'unknown');
  assert.equal(startupDiagnostic({name: 'node', code: 0, signal: 'SIGABRT'}).signal, 'SIGABRT');
});

test('startup diagnostics read at most 16 KiB from a regular descriptor and close it', t => {
  const logPath = fixture(t, 'EADDRINUSE\n' + 'x'.repeat(MAX_LOG_BYTES * 2) + '\nFailed to create scheduler thread 1');
  const originalRead = fs.readSync, originalClose = fs.closeSync;
  let bytes = 0, closes = 0;
  t.mock.method(fs, 'readSync', (...args) => {
    assert.ok(args[3] <= MAX_LOG_BYTES - bytes);
    const read = originalRead(...args);
    bytes += read;
    return read;
  });
  t.mock.method(fs, 'closeSync', (...args) => { closes++; return originalClose(...args); });
  assert.equal(diagnostic(logPath).category, 'scheduler-resource');
  assert.equal(bytes, MAX_LOG_BYTES);
  assert.equal(closes, 1);
});

test('startup diagnostics reject unavailable, nonregular and substituted descriptors without byte reads', t => {
  const logPath = fixture(t, 'EADDRINUSE');
  assert.equal(diagnostic(path.dirname(logPath)).category, 'log-unavailable');
  assert.equal(diagnostic(logPath + '.missing').category, 'log-unavailable');
  const originalStat = fs.fstatSync, originalClose = fs.closeSync;
  let reads = 0, closes = 0;
  t.mock.method(fs, 'fstatSync', fd => {
    const stat = originalStat(fd);
    stat.ino = -1;
    return stat;
  });
  t.mock.method(fs, 'readSync', () => { reads++; throw new Error('SYNTHETIC_PRIVATE_ERROR'); });
  t.mock.method(fs, 'closeSync', (...args) => { closes++; return originalClose(...args); });
  assert.equal(diagnostic(logPath).category, 'log-unavailable');
  assert.equal(reads, 0);
  assert.equal(closes, 1);
});

test('startup diagnostics reject post-read changes and close descriptors on read errors', t => {
  const logPath = fixture(t, 'EADDRINUSE');
  const originalStat = fs.fstatSync, originalClose = fs.closeSync;
  let stats = 0, closes = 0;
  t.mock.method(fs, 'fstatSync', fd => {
    const stat = originalStat(fd);
    if (++stats > 1) stat.size++;
    return stat;
  });
  t.mock.method(fs, 'closeSync', (...args) => { closes++; return originalClose(...args); });
  assert.equal(diagnostic(logPath).category, 'log-unavailable');
  assert.equal(closes, 1);
  t.mock.restoreAll();
  closes = 0;
  t.mock.method(fs, 'readSync', () => { throw new Error('SYNTHETIC_PRIVATE_ERROR'); });
  t.mock.method(fs, 'closeSync', (...args) => { closes++; return originalClose(...args); });
  assert.deepEqual(diagnostic(logPath), {fixture: 'phoenix-a', code: 1, signal: 'none', category: 'log-unavailable'});
  assert.equal(closes, 1);
});

test('fixture port reservations are distinct and released without retries', async () => {
  const ports = await fixturePorts();
  assert.equal(ports.length, 3);
  assert.equal(new Set(ports).size, 3);
  for (const port of ports) {
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
    const server = net.createServer();
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});
