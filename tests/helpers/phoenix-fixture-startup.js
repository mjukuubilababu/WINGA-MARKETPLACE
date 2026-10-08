const fs = require('node:fs');
const net = require('node:net');

const MAX_LOG_BYTES = 16 * 1024;
const NAMES = new Set(['node', 'node-restarted', 'phoenix-a', 'phoenix-b', 'phoenix-a-restarted',
  'phoenix-encrypted-a', 'phoenix-native-survivor']);
const SIGNALS = new Set(['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT', 'SIGHUP', 'SIGBUS']);
const CATEGORIES = [
  ['address-in-use', /\beaddrinuse\b|address already in use/i],
  ['scheduler-resource', /failed to create (?:dirty (?:cpu|io) )?scheduler thread/i],
  ['mix-lock', /(?:cannot|could not|unable to|failed to) acquire.*\block\b/i],
  ['missing-application', /could not find application file|could not start application.*(?:enoent|not found)/i],
  ['invalid-configuration', /CONVERSATION_BACKEND_URL must|CONVERSATION_SERVICE_TOKEN must|environment variable.*CONVERSATION_SERVICE_TOKEN.*not set/i],
  ['application-start', /could not start application|failed to start child/i]
];
const same = (a, b) => b.isFile()
  && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key]);

function logCategory(filename) {
  let fd;
  try {
    const before = fs.lstatSync(filename);
    if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < 0) return 'log-unavailable';
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const opened = fs.fstatSync(fd);
    if (!same(before, opened)) return 'log-unavailable';
    // Inspect only a bounded descriptor tail; never return log text.
    const bytes = Buffer.alloc(Math.min(opened.size, MAX_LOG_BYTES));
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, opened.size - bytes.length + offset);
      if (!read) return 'log-unavailable';
      offset += read;
    }
    if (!same(opened, fs.fstatSync(fd)) || !same(opened, fs.lstatSync(filename))) return 'log-unavailable';
    const text = bytes.toString('utf8');
    return CATEGORIES.find(([, pattern]) => pattern.test(text))?.[0] || 'unclassified';
  } catch {
    return 'log-unavailable';
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function startupDiagnostic({name, code, signal, logPath} = {}) {
  const fixture = NAMES.has(name) ? name : 'unknown';
  return {fixture, code: Number.isInteger(code) && code >= 0 && code <= 255 ? code : 'unknown',
    signal: signal === null ? 'none' : SIGNALS.has(signal) ? signal : 'unknown',
    category: fixture === 'unknown' ? 'log-unavailable' : logCategory(logPath)};
}

async function fixturePorts() {
  const servers = [];
  try {
    for (let n = 0; n < 3; n++) {
      const server = net.createServer();
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
    }
    // Concurrent reservations prevent reuse of an earlier ephemeral port.
    return servers.map(server => server.address().port);
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  }
}

module.exports = {MAX_LOG_BYTES, startupDiagnostic, fixturePorts};
