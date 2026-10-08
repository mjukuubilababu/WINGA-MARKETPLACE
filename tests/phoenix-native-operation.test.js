const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createConversationTransport, MAX_NATIVE_OPERATION_BYTES} = require('../backend/conversation-transport');
const {operationBytes} = require('../backend/encrypted-conversations');
const tick = () => new Promise(setImmediate);
const env = {WINGA_PHOENIX_TRANSPORT_ENABLED: 'true', WINGA_PHOENIX_ALL_USERS: 'true',
  WINGA_ENCRYPTED_CONVERSATIONS_ENABLED: 'true', WINGA_CRYPTO_DEVICES_ENABLED: 'true', WINGA_MLS_CANDIDATE_ENABLED: 'true',
  CONVERSATION_TICKET_SECRET: 't'.repeat(48), CONVERSATION_SERVICE_TOKEN: 's'.repeat(48)};
const session = {username: 'alice', sessionId: 'session-a', token: 'synthetic-only', expiresAt: Date.now() + 600000};
const context = {owner: session.username, deviceId: session.sessionId, token: session.token};
function signed(action = 'poll', payload = {}) {
  const {privateKey} = crypto.generateKeyPairSync('ed25519');
  const op = {action, payload, actorId: crypto.randomUUID(), requestId: crypto.randomUUID(), issuedAt: Date.now()};
  op.signature = crypto.sign(null, operationBytes(context, op), privateKey).toString('base64url');
  return op;
}

test('native capability is explicit, preserves legacy health mode and forwards unchanged to canonical authority', async () => {
  const transport = createConversationTransport({env}), operation = signed();
  const input = {version: 1, command: 'native', payload: operation};
  assert.equal(transport.validateCommand(input), input);
  const principal = await transport.execute(context, {command: 'authorize'}, {});
  assert.equal(principal.securityMode, 'legacy-plaintext');
  assert.equal(principal.nativeOperations, true);
  let calls = 0;
  const store = {encryptedOperation: async (authority, op) => {
    calls++; assert.deepEqual(authority, context); assert.equal(op, operation); return {groups: []};
  }};
  assert.deepEqual(await transport.execute({...context, actorId: 'forged', payload: {plaintext: 'forged'}}, input, store),
    {version: 1, requestId: operation.requestId, result: {groups: []}});
  for (const gate of ['WINGA_ENCRYPTED_CONVERSATIONS_ENABLED', 'WINGA_CRYPTO_DEVICES_ENABLED', 'WINGA_MLS_CANDIDATE_ENABLED']) {
    const disabled = createConversationTransport({env: {...env, [gate]: 'false'}});
    assert.equal((await disabled.execute(context, {command: 'authorize'}, {})).nativeOperations, false);
    await assert.rejects(disabled.execute(context, input, store), {status: 404});
  }
  assert.equal(calls, 1);
});

test('native envelopes fail closed on malformed commands, extra identity fields and UTF-8 byte limits', () => {
  const transport = createConversationTransport({env}), op = signed();
  const validate = payload => transport.validateCommand({version: 1, command: 'native', payload});
  for (const change of [{action: 'send plaintext'}, {actorId: 'forged'}, {requestId: 'bad'}, {issuedAt: 1.1},
    {payload: []}, {signature: 'fake'}, {owner: 'eve'}, {sessionId: 'session-b'},
    {payload: {ciphertext: 'x'.repeat(MAX_NATIVE_OPERATION_BYTES)}}, {payload: {ciphertext: '\u20ac'.repeat(8000)}}])
    assert.throws(() => validate({...op, ...change}), {status: 400});
  assert.throws(() => validate(null), {status: 400});
});

test('ticket/session revocation is checked afresh and canonical proof, binding and rate denials propagate', async () => {
  const transport = createConversationTransport({env}), ticket = transport.issue(session).ticket;
  let live = session;
  const store = {resolveConversationTransportSession: async () => live};
  await transport.authorize(ticket, store);
  live = {...session, token: 'rotated'};
  await assert.rejects(transport.authorize(ticket, store), {status: 401});
  live = null;
  await assert.rejects(transport.authorize(ticket, store), {status: 401});
  for (const [status, code] of [[401, 'crypto_session_required'], [403, 'encrypted_proof_rejected'],
    [403, 'encrypted_membership_required'], [429, 'encrypted_new_conversation_limit']]) {
    const error = Object.assign(new Error(code), {status, code, retryAfterSeconds: 7});
    store.encryptedOperation = async () => {throw error;};
    await assert.rejects(transport.execute(context, {command: 'native', payload: signed()}, store), value => value === error);
  }
});

function browserFixture(nativeOperations = true) {
  const timers = new Map(), pushes = [];
  const later = fn => {const id = {}; timers.set(id, fn); return id;};
  const cancel = id => timers.delete(id);
  class Push {
    receive(kind, fn) {this[kind] = fn; return this;}
  }
  let socket;
  class Socket {
    constructor() {socket = this;}
    onOpen(fn) {this.open = fn;}
    onClose(fn) {this.closed = fn;}
    onError() {}
    disconnect() {this.connected = false;}
    connect() {this.connected = true; queueMicrotask(() => this.open());}
    channel() {return {
      canPush: () => this.connected, on() {}, onError() {}, onClose() {}, leave() {},
      join: () => (this.join = new Push()),
      push: (event, body) => {const push = new Push(); pushes.push({event, body, push}); return push;}
    };}
  }
  const sandbox = {window: {location: {hostname: 'localhost'}}, URL, TextEncoder,
    setTimeout: later, clearTimeout: cancel};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/api/phoenix-transport.js'), 'utf8'), sandbox);
  const expiry = Date.now() + 300000;
  const client = sandbox.window.WingaModules.api.phoenix.createPhoenixTransport({
    url: 'ws://127.0.0.1:4100/socket', deviceId: session.sessionId, isCurrent: () => true,
    fetchTicket: async () => ({version: 1, ticket: 'synthetic-ticket', expiresAt: expiry}), loadSocket: async () => Socket
  });
  return {client, pushes, timers, async ready() {
    await tick();
    socket.join.ok({deviceId: session.sessionId, expiresAt: expiry, securityMode: 'legacy-plaintext', nativeOperations});
  }};
}

test('browser uses only negotiated native channel and delivers canonical result, never legacy message.send', async () => {
  const f = browserFixture(), op = signed('send', {ciphertext: 'opaque'});
  assert.equal(await f.client.forwardEncryptedOperation(op), null);
  await f.ready();
  const pending = f.client.forwardEncryptedOperation(op);
  assert.equal(f.pushes[0].event, 'encrypted.operation'); assert.equal(f.pushes[0].body, op);
  f.pushes[0].push.ok({version: 1, requestId: op.requestId, result: {status: 'sent', id: 'canonical'}});
  assert.equal((await pending).status, 'sent');
  assert.equal(await f.client.forwardEncryptedOperation(signed('send', {ciphertext: '\u20ac'.repeat(8000)})), null);
  assert.equal(f.pushes.length, 1);
  f.client.close();
  const legacy = browserFixture(false); await legacy.ready();
  assert.equal(await legacy.client.forwardEncryptedOperation(op), null);
  assert.equal(legacy.pushes.length, 0); legacy.client.close();
});

test('browser rejects mismatched replies, rejection/rate ambiguity and node loss without hidden retransmission', async () => {
  const f = browserFixture(), op = signed(); await f.ready();
  for (const reply of [{version: 1, requestId: 'wrong', result: {}},
    {version: 1, requestId: op.requestId, result: []}, {accepted: true}]) {
    const pending = f.client.forwardEncryptedOperation(op);
    f.pushes.at(-1).push.ok(reply);
    await assert.rejects(pending, {code: 'outcome_unknown'});
  }
  for (const code of ['rejected', 'outcome_unknown', 'native_unavailable']) {
    const pending = f.client.forwardEncryptedOperation(op);
    f.pushes.at(-1).push.error({code});
    await assert.rejects(pending, {code: 'outcome_unknown'});
  }
  const pending = f.client.forwardEncryptedOperation(op); f.client.close();
  await assert.rejects(pending, {code: 'outcome_unknown'});
  assert.equal(f.pushes.length, 7);
});

async function communicationsFixture(forward) {
  let current = {...session}, operationRequest;
  const calls = [], intervals = new Map();
  const native = {forwardEncryptedOperation: forward, close() {}, isReady: () => true};
  const sandbox = {window: {WingaModules: {api: {phoenix: {
    canaryUrl: () => 'ws://127.0.0.1:4100/socket', createPhoenixTransport: () => native
  }}}}, setInterval: fn => {const id = {}; intervals.set(id, fn); return id;},
  clearInterval: id => intervals.delete(id), setTimeout, clearTimeout,
  WingaEncryptionSession: {createEncryptionSession: async options => {
    operationRequest = options.operationRequest;
    return {close() {}, inspect: async () => ({status: 'active'})};
  }}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/api/communications-client.js'), 'utf8'), sandbox);
  const client = sandbox.window.WingaModules.api.communications.createCommunicationsApiClient({
    baseUrl: '/api', getSession: () => current, getEventSource: () => class {addEventListener() {} close() {}},
    fetchJson: async (url, options) => {
      calls.push({url, options});
      if (url.endsWith('/device')) return {supported: true, eventDelivery: true, username: 'alice', deviceId: session.sessionId};
      if (url.endsWith('/capabilities')) return {version: 1, enabled: true};
      if (url.endsWith('/operations')) return {groups: []};
      return {};
    }
  });
  const stream = client.openRealtimeChannel({onDeviceEvents: async () => true});
  await tick(); await client.inspectEncryptedConversation('bob');
  return {calls, operation: op => operationRequest(op), changeSession: () => {current = {...current, sessionId: 'session-b'};},
    close: () => stream.close()};
}

test('communications recovery sends the identical signed envelope once via HTTP, never plaintext messages', async () => {
  const op = signed('send', {ciphertext: 'opaque'}), body = JSON.stringify(op);
  let seen;
  const f = await communicationsFixture(async operation => {
    seen = operation; throw Object.assign(new Error('lost'), {code: 'outcome_unknown', status: 503});
  });
  await f.operation(op);
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), op);
  const requests = f.calls.filter(r => r.url.endsWith('/operations'));
  assert.equal(requests.length, 1); assert.equal(requests[0].options.body, body);
  assert.equal(f.calls.some(r => r.url === '/api/messages'), false); f.close();
});

test('communications fail closed on session switches and canonical denials; HTTP-only mode remains available', async () => {
  let f;
  f = await communicationsFixture(async () => {f.changeSession(); throw Object.assign(new Error('lost'), {code: 'outcome_unknown'});});
  await assert.rejects(f.operation(signed()), {code: 'mls_session_changed'});
  assert.equal(f.calls.some(r => r.url.endsWith('/operations')), false); f.close();
  for (const status of [401, 403, 429]) {
    const denied = await communicationsFixture(async () => {throw Object.assign(new Error('denied'), {status, code: 'denied'});});
    await assert.rejects(denied.operation(signed()), {status});
    assert.equal(denied.calls.some(r => r.url.endsWith('/operations')), false); denied.close();
  }
  const http = await communicationsFixture(async () => null);
  await http.operation(signed()); assert.equal(http.calls.filter(r => r.url.endsWith('/operations')).length, 1); http.close();
});
