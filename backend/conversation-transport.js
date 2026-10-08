const crypto = require('node:crypto');

const MAX_COMMAND_BYTES = 32768;
const MAX_NATIVE_OPERATION_BYTES = 24000;
const reject = (status = 401) => Object.assign(new Error('Transport request rejected.'), { status });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createConversationTransport({ env = process.env, now = Date.now } = {}) {
  const enabled = env.WINGA_PHOENIX_TRANSPORT_ENABLED === 'true';
  const nativeEnabled = enabled && ['WINGA_ENCRYPTED_CONVERSATIONS_ENABLED',
    'WINGA_CRYPTO_DEVICES_ENABLED', 'WINGA_MLS_CANDIDATE_ENABLED'].every(key => env[key] === 'true');
  const ticketSecret = env.CONVERSATION_TICKET_SECRET || '';
  const serviceSecret = env.CONVERSATION_SERVICE_TOKEN || '';
  const canaryUsers = new Set(String(env.WINGA_PHOENIX_CANARY_USERS || '').split(',').map(value => value.trim()).filter(Boolean));
  const allUsers = env.WINGA_PHOENIX_ALL_USERS === 'true';
  const canIssue = owner => enabled && typeof owner === 'string' && owner.length > 0
    && (allUsers || canaryUsers.has(owner));
  if (enabled && (ticketSecret.length < 32 || serviceSecret.length < 32 || ticketSecret === serviceSecret)) {
    throw new Error('Distinct conversation ticket and service secrets of at least 32 characters are required.');
  }
  const sign = value => crypto.createHmac('sha256', ticketSecret).update(value).digest('base64url');
  function issue(session) {
    if (!canIssue(session?.username)) throw reject(404);
    const iat = Math.floor(now() / 1000);
    const exp = Math.min(iat + 300, Math.floor(Number(session.expiresAt) / 1000));
    if (!session.token || !session.sessionId || !session.username || exp <= iat) throw reject();
    const encoded = Buffer.from(JSON.stringify({ v: 1, iss: 'winga', aud: 'winga-conversations',
      sub: session.username, sid: session.sessionId, iat, exp, binding: digest(session.token) })).toString('base64url');
    return { version: 1, ticket: `${encoded}.${sign(encoded)}`, expiresAt: exp * 1000 };
  }
  function verify(ticket) {
    if (!enabled) throw reject(404);
    if (typeof ticket !== 'string' || ticket.length > 2048) throw reject();
    const parts = ticket.split('.');
    if (parts.length !== 2 || !equal(parts[1], sign(parts[0]))) throw reject();
    let claims;
    try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { throw reject(); }
    const seconds = Math.floor(now() / 1000);
    if (claims?.v !== 1 || claims.iss !== 'winga' || claims.aud !== 'winga-conversations'
      || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
      || claims.iat > seconds || claims.exp <= seconds || claims.exp - claims.iat > 300
      || typeof claims.sub !== 'string' || typeof claims.sid !== 'string'
      || typeof claims.binding !== 'string' || !canIssue(claims.sub)) throw reject();
    return claims;
  }
  async function authorize(ticket, store) {
    const claims = verify(ticket);
    const session = await store.resolveConversationTransportSession(claims.sid, claims.sub);
    if (!session || !equal(claims.binding, digest(session.token))) throw reject();
    return { ...session, owner: session.username, deviceId: session.sessionId,
      ticketExpiresAt: claims.exp * 1000 };
  }
  function serviceAllowed(req) {
    return enabled && !req.headers.origin && !req.headers.cookie
      && equal(req.headers.authorization, `Bearer ${serviceSecret}`);
  }
  function validateCommand(input) {
    if (!input || input.version !== 1 || Buffer.byteLength(JSON.stringify(input)) > MAX_COMMAND_BYTES
      || !['authorize', 'send', 'poll', 'ack', 'receipt', 'native'].includes(input.command)
      || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw reject(400);
    if (input.command === 'native') {
      const operation = input.payload;
      if (Object.keys(operation).sort().join(',') !== 'action,actorId,issuedAt,payload,requestId,signature'
        || Buffer.byteLength(JSON.stringify(operation)) > MAX_NATIVE_OPERATION_BYTES
        || typeof operation.action !== 'string' || !/^[a-z][a-z-]{0,63}$/.test(operation.action)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.actorId || '')
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.requestId || '')
        || !Number.isSafeInteger(operation.issuedAt)
        || !operation.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload)
        || typeof operation.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(operation.signature)) throw reject(400);
    } else if (input.command === 'send') {
      const allowed = new Set(['clientMessageId', 'receiverId', 'message']);
      if (Object.keys(input.payload).some(key => !allowed.has(key))
        || typeof input.payload.message !== 'string' || !input.payload.message.trim()
        || input.payload.message.length > 4000
        || typeof input.payload.receiverId !== 'string'
        || !/^[a-z0-9._-]{3,40}$/i.test(input.payload.receiverId)
        || typeof input.payload.clientMessageId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.payload.clientMessageId)) throw reject(400);
    }
    return input;
  }
  async function execute(context, input, store) {
    if (input.command === 'authorize') return { version: 1, deviceId: context.deviceId,
      expiresAt: context.ticketExpiresAt, securityMode: 'legacy-plaintext', nativeOperations: nativeEnabled };
    if (input.command === 'native') {
      if (!nativeEnabled || typeof store.encryptedOperation !== 'function') throw reject(404);
      // The ticket authenticates the session, never the native actor or MLS membership.
      const result = await store.encryptedOperation({owner: context.owner, token: context.token,
        deviceId: context.deviceId}, input.payload);
      return {version: 1, requestId: input.payload.requestId, result};
    }
    if (input.command === 'poll') return store.pollConversationDeviceEvents(context);
    if (input.command === 'ack') return store.acknowledgeConversationDeviceEvents(context, input.payload);
    if (input.command === 'receipt') return store.acknowledgeMessageDevice({ ...context, payload: input.payload });
    throw reject(400);
  }
  return { enabled, nativeEnabled, canIssue, issue, verify, authorize, serviceAllowed, validateCommand, execute };
}

module.exports = { createConversationTransport, MAX_COMMAND_BYTES, MAX_NATIVE_OPERATION_BYTES };
