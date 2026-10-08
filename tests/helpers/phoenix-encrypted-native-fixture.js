const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {once} = require('node:events');
const {buildMlsBrowser} = require('../../scripts/build-mls-browser');
const {createEncryptedConversationsApi} = require('../../backend/encrypted-conversations-api');
const {createConversationCryptoDevicesApi} = require('../../backend/conversation-crypto-devices-api');

// Serve real browser crypto and optionally proxy authenticated recovery to the real backend.
module.exports = async function nativeFixture({root, output, store, sessions, backend, csrf, phoenixPort, phoenixPorts, fixturePort = 0}) {
  if (!Number.isInteger(fixturePort) || fixturePort < 0 || fixturePort > 65535)
    throw new TypeError('Invalid native fixture port');
  buildMlsBrowser(output);
  const requests = [], responses = [];
  const faults = {loseSendReply: false, withholdDelivered: false};
  const assets = new Map([
    ['/devices.js', 'src/chat/crypto-devices.js'], ['/vault.js', 'src/chat/encrypted-vault.js'],
    ['/policy.js', 'src/chat/encrypted-policy.js'], ['/session.js', 'src/chat/encryption-session.js'],
    ['/phoenix.js', 'src/api/phoenix-transport.js'], ['/communications.js', 'src/api/communications-client.js'],
    ['/receipts.js', 'src/chat/device-receipts.js'], ['/vendor/phoenix.min.js', 'node_modules/phoenix/priv/static/phoenix.min.js'],
    ['/vendor/winga-mls-candidate.js', path.join(output, 'winga-mls-candidate.js')]
  ]);
  const byToken = new Map(Object.values(sessions).map(s => [s.token, s]));
  function sendJson(res, status, value, headers = {}) {
    responses.push({status, value: structuredClone(value), transport: 'HTTP'});
    res.writeHead(status, {'Content-Type': 'application/json', ...headers});
    res.end(JSON.stringify(value));
  }
  async function collectBody(req, {maxBytes = 262144} = {}) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw Object.assign(new Error('too_large'), {status: 413});
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  const common = {
    collectBody, sendJson, findSession: token => byToken.get(token),
    readAuthToken: req => req.headers.cookie?.split(';').map(v => v.trim())
      .find(v => v.startsWith('native_fixture='))?.slice('native_fixture='.length),
    ensureMarketplaceUser(session, res) {
      if (!session) {sendJson(res, 401, {code: 'session_required'}); return null;}
      return {username: session.username};
    },
    getPostgresStore: () => store, enabled: true
  };
  const native = createEncryptedConversationsApi(common);
  const devices = createConversationCryptoDevicesApi({...common, packagesEnabled: true});
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/test-session') {
        const session = sessions[url.searchParams.get('account')];
        if (!session) return sendJson(res, 401, {code: 'session_required'});
        res.setHeader('Set-Cookie', `native_fixture=${session.token}; HttpOnly; SameSite=Strict; Path=/`);
        return sendJson(res, 200, {username: session.username, sessionId: session.sessionId});
      }
      if (assets.has(url.pathname)) {
        res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-store'});
        return res.end(fs.readFileSync(path.resolve(root, assets.get(url.pathname))));
      }
      if (url.pathname === '/') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        return res.end('<!doctype html><title>Native encryption BEAM fixture</title><main data-chat-read-user="">Native acceptance fixture</main><script src="/devices.js"></script><script src="/vault.js"></script><script src="/policy.js"></script><script src="/session.js"></script><script src="/phoenix.js"></script><script src="/communications.js"></script><script src="/receipts.js"></script>');
      }
      if (backend && url.pathname.startsWith('/api/')) {
        const session = byToken.get(common.readAuthToken(req));
        if (!session) return sendJson(res, 401, {code: 'session_required'});
        let body;
        if (req.method !== 'GET') {
          body = await collectBody(req);
          if (url.pathname.endsWith('/operations')) {
            requests.push({account: session.sessionId, operation: structuredClone(body), transport: 'HTTP'});
            if (session.username === 'bob' && body.action === 'receipt'
              && body.payload.kind === 'delivered' && faults.withholdDelivered)
              return sendJson(res, 503, {code: 'fixture_receipt_withheld'});
          }
        }
        const upstream = await fetch(backend + url.pathname + url.search, {
          method: req.method, headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf,
            Cookie: `winga_auth=${session.token}; winga_csrf=${csrf}`, Origin: 'http://localhost:4173'},
          ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(15000)
        });
        return sendJson(res, upstream.status, await upstream.json());
      }
      if (req.method === 'POST' && url.pathname.endsWith('/operations')) {
        const operation = await collectBody(req);
        const session = byToken.get(common.readAuthToken(req));
        requests.push({account: session?.sessionId, operation: structuredClone(operation)});
        // Faults occur at the real handler boundary; no acceptance or receipt is invented.
        if (session?.username === 'bob' && operation.action === 'receipt'
          && operation.payload.kind === 'delivered' && faults.withholdDelivered)
          return sendJson(res, 503, {code: 'fixture_receipt_withheld'});
        const lose = operation.action === 'send' && faults.loseSendReply;
        if (lose) faults.loseSendReply = false;
        const handler = createEncryptedConversationsApi({...common,
          collectBody: async () => operation,
          sendJson: lose ? (response, status, value, headers) => {
            if (status === 200) {
              responses.push({status, value: structuredClone(value), lost: true});
              sendJson(response, 503, {code: 'fixture_accepted_reply_lost'}, headers);
            } else sendJson(response, status, value, headers);
          } : sendJson
        });
        await handler.handle(req, res, url); return;
      }
      if (await devices.handle(req, res, url)) return;
      if (await native.handle(req, res, url)) return;
      sendJson(res, 404, {code: 'not_found'});
    } catch (error) {sendJson(res, error.status || 500, {code: error.code || error.message});}
  });
  // Match the existing Phoenix dev allowlist; never relax it for this fixture.
  server.listen(fixturePort, '127.0.0.1'); await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests, responses, faults, phoenixPort, phoenixPorts,
    async close() {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  };
};
