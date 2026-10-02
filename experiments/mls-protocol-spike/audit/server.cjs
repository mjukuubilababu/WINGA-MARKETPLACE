const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { createEncryptedConversationBackupStore } = require('../../../backend/encrypted-conversation-backups');
const backupMigration = require('../../../backend/migrations/encrypted-conversation-backups');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const error = (status, code) => Object.assign(new Error(code), { status, code });
const demand = (condition, code = 'invalid_request', status = 400) => { if (!condition) throw error(status, code); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const b64 = bytes => Buffer.from(bytes).toString('base64url');
function bytes(value, max, size) {
  demand(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= Math.ceil(max * 4 / 3));
  const decoded = Buffer.from(value, 'base64url');
  demand(decoded.length <= max && (!size || decoded.length === size) && b64(decoded) === value);
  return decoded;
}
function exact(value, fields) {
  demand(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)));
}
async function body(req, max = 2 * 1024 * 1024) {
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; demand(size <= max, 'request_too_large', 413); parts.push(part); }
  return Buffer.concat(parts);
}
const schema = `
 CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'active',salt TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,username TEXT REFERENCES users(username),session_id TEXT UNIQUE,expires_at BIGINT,csrf TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit_devices(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(username),public_key TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','pending','revoked')));
 CREATE TABLE IF NOT EXISTS audit_packages(hash TEXT PRIMARY KEY,device_id TEXT REFERENCES audit_devices(id),package TEXT NOT NULL,used_room TEXT);
 CREATE TABLE IF NOT EXISTS audit_proofs(session_id TEXT,request_id TEXT,PRIMARY KEY(session_id,request_id));
 CREATE TABLE IF NOT EXISTS audit_rooms(id TEXT PRIMARY KEY,participants JSONB NOT NULL,epoch INT NOT NULL DEFAULT 0,blocked BOOLEAN NOT NULL DEFAULT FALSE);
 CREATE TABLE IF NOT EXISTS audit_members(room_id TEXT REFERENCES audit_rooms(id),device_id TEXT REFERENCES audit_devices(id),active BOOLEAN NOT NULL DEFAULT TRUE,start_event BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(room_id,device_id));
 CREATE TABLE IF NOT EXISTS audit_operations(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,digest TEXT NOT NULL,result JSONB NOT NULL);
 CREATE TABLE IF NOT EXISTS audit_messages(id TEXT PRIMARY KEY,room_id TEXT REFERENCES audit_rooms(id),device_id TEXT REFERENCES audit_devices(id),epoch INT NOT NULL,ciphertext TEXT NOT NULL,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit_events(id BIGSERIAL PRIMARY KEY,device_id TEXT REFERENCES audit_devices(id),room_id TEXT REFERENCES audit_rooms(id),kind TEXT NOT NULL,payload JSONB NOT NULL,acknowledged BOOLEAN NOT NULL DEFAULT FALSE);
 CREATE TABLE IF NOT EXISTS audit_media(id TEXT PRIMARY KEY,room_id TEXT REFERENCES audit_rooms(id),owner TEXT REFERENCES users(username),ciphertext BYTEA NOT NULL,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit_receipts(message_id TEXT REFERENCES audit_messages(id),device_id TEXT REFERENCES audit_devices(id),kind TEXT NOT NULL CHECK(kind IN ('stored','read')),PRIMARY KEY(message_id,device_id,kind));
 CREATE TABLE IF NOT EXISTS audit_receipt_devices(message_id TEXT REFERENCES audit_messages(id),device_id TEXT REFERENCES audit_devices(id),history BOOLEAN NOT NULL DEFAULT FALSE,PRIMARY KEY(message_id,device_id));
 CREATE TABLE IF NOT EXISTS audit_quarantines(device_id TEXT REFERENCES audit_devices(id),room_id TEXT REFERENCES audit_rooms(id),event_id BIGINT REFERENCES audit_events(id),fingerprint TEXT NOT NULL,PRIMARY KEY(device_id,room_id));
 CREATE TABLE IF NOT EXISTS schema_migrations(migration_id TEXT PRIMARY KEY);
`;

async function startAuditServer({ auditOnly = false, dataDir, port = 0, password = 'local-audit-only' } = {}) {
  demand(auditOnly && process.env.NODE_ENV !== 'production' && !process.env.RENDER && !process.env.VERCEL,
    'audit_workbench_must_not_run_in_production', 503);
  demand(typeof password === 'string' && password.length >= 12);
  const db = new PGlite(dataDir);
  await db.exec(schema);
  await db.exec('ALTER TABLE audit_receipts ADD COLUMN IF NOT EXISTS proof JSONB');
  await db.exec('ALTER TABLE audit_members ADD COLUMN IF NOT EXISTS start_event BIGINT NOT NULL DEFAULT 0');
  if (!(await db.query('SELECT 1 FROM schema_migrations WHERE migration_id=$1', ['audit_receipt_eligibility_v1'])).rows.length) {
    await db.exec(`INSERT INTO audit_receipt_devices(message_id,device_id)
    SELECT msg.id,d.id FROM audit_messages msg JOIN audit_devices actor ON actor.id=msg.device_id
    JOIN audit_devices d ON d.owner=actor.owner JOIN audit_members m ON m.device_id=d.id AND m.room_id=msg.room_id
    WHERE m.active AND (d.id=msg.device_id OR EXISTS(SELECT 1 FROM audit_events e
      WHERE e.device_id=d.id AND e.room_id=msg.room_id AND e.kind='message' AND e.payload->>'id'=msg.id AND e.id>=m.start_event))
    ON CONFLICT DO NOTHING`);
    await db.query('INSERT INTO schema_migrations VALUES($1)', ['audit_receipt_eligibility_v1']);
  }
  for (const sql of backupMigration.statements) await db.exec(sql);
  await db.query('INSERT INTO schema_migrations VALUES($1) ON CONFLICT DO NOTHING', [backupMigration.id]);
  for (const owner of ['alice', 'bob', 'eve']) {
    const salt = crypto.randomBytes(16).toString('hex');
    await db.query('INSERT INTO users(username,salt,password_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [owner, salt, crypto.scryptSync(password, salt, 32).toString('hex')]);
  }
  const mls = await import('ts-mls');
  const { verifyKeyPackage } = await import('ts-mls/keyPackage.js');
  const { validateKeyPackageLifetime } = await import('../key-package-policy.mjs');
  const { receiptBytes } = await import('../receipt-proof.mjs');
  const suite = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'));
  let origin, chain = Promise.resolve();
  const serial = work => { const next = chain.then(work); chain = next.catch(() => {}); return next; };
  const transaction = work => serial(() => db.transaction(work));
  async function packageInfo(value, owner, device) {
    const raw = bytes(value, 8192);
    const decoded = mls.decodeMlsMessage(raw, 0);
    demand(decoded && decoded[1] === raw.length && decoded[0].wireformat === 'mls_key_package');
    const kp = decoded[0].keyPackage;
    try { validateKeyPackageLifetime(kp); }
    catch (failure) { throw error(400, failure.message); }
    demand(kp.cipherSuite === suite.name && kp.leafNode.credential.credentialType === 'basic'
      && Buffer.from(kp.leafNode.credential.identity).toString() === JSON.stringify(['winga-mls-device-spike', 1, owner, device])
      && await verifyKeyPackage(kp, suite.signature));
    return { publicKey: b64(kp.leafNode.signaturePublicKey), hash: hash(raw) };
  }
  async function authenticated(client, req) {
    const token = /(?:^|;\s*)winga_audit=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    demand(token, 'authentication_required', 401);
    const result = await client.query(`SELECT s.* FROM sessions s JOIN users u ON u.username=s.username
      WHERE s.token=$1 AND s.expires_at>$2 AND u.status='active'`, [token, Date.now()]);
    demand(result.rows.length, 'session_revoked', 401);
    return result.rows[0];
  }
  async function authorize(client, req, url, raw, candidate) {
    const session = await authenticated(client, req);
    if (req.method !== 'GET') demand(req.headers['x-csrf-token'] === session.csrf, 'csrf_rejected', 403);
    const device = req.headers['x-device-id'], requestId = req.headers['x-request-id'];
    const time = Number(req.headers['x-proof-time']);
    demand(uuid(device) && uuid(requestId) && Number.isSafeInteger(time) && Math.abs(Date.now() - time) < 30000, 'device_proof_required', 401);
    const found = await client.query("SELECT * FROM audit_devices WHERE id=$1 AND owner=$2 AND status='active'", [device, session.username]);
    const publicKey = candidate || found.rows[0]?.public_key;
    demand(publicKey, 'device_not_authorized', 403);
    const message = Buffer.from(JSON.stringify(['winga-audit-request', 1, session.username, session.session_id,
      device, req.method, url.pathname + url.search, requestId, time, hash(raw)]));
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), bytes(publicKey, 32, 32)]), type: 'spki', format: 'der' });
    demand(crypto.verify(null, message, key, bytes(req.headers['x-device-proof'], 64, 64)), 'invalid_device_proof', 401);
    const prior = await client.query('INSERT INTO audit_proofs VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING request_id', [session.session_id, requestId]);
    demand(prior.rows.length, 'request_replayed', 409);
    return { session, owner: session.username, device };
  }
  async function room(client, id, context, active = true) {
    demand(uuid(id));
    const row = (await client.query('SELECT * FROM audit_rooms WHERE id=$1 FOR UPDATE', [id])).rows[0];
    demand(row && row.participants.includes(context.owner), 'room_forbidden', 403);
    if (active) demand((await client.query('SELECT 1 FROM audit_members WHERE room_id=$1 AND device_id=$2 AND active', [id, context.device])).rows.length, 'room_device_not_joined', 403);
    return row;
  }
  async function event(client, device, roomId, kind, payload) {
    await client.query('INSERT INTO audit_events(device_id,room_id,kind,payload) VALUES($1,$2,$3,$4)', [device, roomId, kind, JSON.stringify(payload)]);
  }
  async function idempotent(client, context, payload, work) {
    demand(uuid(payload.id));
    const digest = hash(Buffer.from(JSON.stringify(payload)));
    const previous = (await client.query('SELECT * FROM audit_operations WHERE id=$1', [payload.id])).rows[0];
    if (previous) { demand(previous.device_id === context.device && previous.digest === digest, 'operation_conflict', 409); return previous.result; }
    const result = await work();
    await client.query('INSERT INTO audit_operations VALUES($1,$2,$3,$4)', [payload.id, context.device, digest, JSON.stringify(result)]);
    return result;
  }
  function wire(value, roomId, epoch, kind = 'application') {
    const raw = bytes(value, 256 * 1024), decoded = mls.decodeMlsMessage(raw, 0);
    demand(decoded && decoded[1] === raw.length && decoded[0].wireformat === 'mls_private_message');
    const message = decoded[0].privateMessage;
    demand(Buffer.from(message.groupId).toString() === roomId && message.epoch === BigInt(epoch)
      && message.contentType === kind, 'invalid_encrypted_envelope');
  }
  const failedLogins = new Map();
  const server = http.createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer' };
    const json = (status, value, extra = {}) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(value)); };
    try {
      demand(req.headers.host === new URL(origin).host, 'invalid_host', 403);
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && ['/', '/client.js', '/ui.js', '/style.css'].includes(url.pathname)) {
        const file = { '/': 'index.html', '/client.js': 'dist/client.js', '/ui.js': 'ui.js', '/style.css': 'style.css' }[url.pathname];
        const mime = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
        res.writeHead(200, { ...headers, 'Content-Type': mime }); res.end(fs.readFileSync(path.join(__dirname, file))); return;
      }
      demand(url.pathname.startsWith('/api/'), 'not_found', 404);
      if (req.method !== 'GET') demand(req.headers.origin === origin, 'origin_rejected', 403);
      const raw = req.method === 'GET' ? Buffer.alloc(0) : await body(req, url.pathname.startsWith('/api/media/') ? 8 * 1024 * 1024 + 4136 : 6 * 1024 * 1024);
      if (raw.length && !url.pathname.startsWith('/api/media/')) demand((req.headers['content-type'] || '').startsWith('application/json'), 'json_required', 415);
      let payload = {};
      if (raw.length && !url.pathname.startsWith('/api/media/')) {
        try { payload = JSON.parse(raw.toString('utf8')); } catch { throw error(400, 'invalid_json'); }
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        exact(payload, ['owner', 'password']);
        const attempts = failedLogins.get(payload.owner) || { count: 0, since: Date.now() };
        if (Date.now() - attempts.since > 60000) attempts.count = 0;
        demand(attempts.count < 10, 'login_throttled', 429);
        const user = (await db.query('SELECT * FROM users WHERE username=$1', [payload.owner])).rows[0];
        const valid = typeof payload.password === 'string' && payload.password.length <= 256 && user
          && crypto.timingSafeEqual(Buffer.from(user.password_hash, 'hex'), crypto.scryptSync(payload.password, user.salt, 32));
        if (!valid) { attempts.count++; failedLogins.set(payload.owner, attempts); throw error(401, 'invalid_login'); }
        const token = crypto.randomBytes(32).toString('hex'), sid = crypto.randomUUID(), csrf = b64(crypto.randomBytes(32));
        const expiresAt = Date.now() + 86400000;
        await transaction(client => client.query('INSERT INTO sessions VALUES($1,$2,$3,$4,$5)', [token, user.username, sid, expiresAt, csrf]));
        json(200, { owner: user.username, sessionId: sid, csrf, expiresAt }, { 'Set-Cookie': `winga_audit=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` }); return;
      }
      if (url.pathname === '/api/session' && req.method === 'GET') {
        const session = await serial(() => authenticated(db, req)); json(200, { owner: session.username, sessionId: session.session_id, csrf: session.csrf, expiresAt: Number(session.expires_at) }); return;
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        await transaction(async client => { const session = await authenticated(client, req); demand(req.headers['x-csrf-token'] === session.csrf, 'csrf_rejected', 403); await client.query('DELETE FROM sessions WHERE token=$1', [session.token]); });
        json(200, { ok: true }, { 'Set-Cookie': 'winga_audit=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return;
      }
      if (url.pathname === '/api/devices' && req.method === 'GET') {
        const result = await transaction(async client => {
          await authenticated(client, req);
          const rows = (await client.query('SELECT id,owner,public_key,status FROM audit_devices ORDER BY owner,id')).rows;
          for (const device of rows) {
            device.package = null;
            const packages = (await client.query('SELECT package FROM audit_packages WHERE device_id=$1 AND used_room IS NULL ORDER BY hash LIMIT 32', [device.id])).rows;
            for (const candidate of packages) {
              try { await packageInfo(candidate.package, device.owner, device.id); device.package = candidate.package; break; }
              catch (failure) { if (failure.status !== 400) throw failure; }
            }
          }
          return rows;
        });
        json(200, result); return;
      }
      if (url.pathname === '/api/devices/register' && req.method === 'POST') {
        exact(payload, ['id', 'package', 'resetIdentity']); demand(uuid(payload.id) && typeof payload.resetIdentity === 'boolean');
        const result = await transaction(async client => {
          const session = await authenticated(client, req), info = await packageInfo(payload.package, session.username, payload.id);
          const context = await authorize(client, req, url, raw, info.publicKey); demand(context.device === payload.id);
          const existing = (await client.query('SELECT * FROM audit_devices WHERE id=$1', [payload.id])).rows[0];
          if (existing) {
            demand(existing.owner === context.owner && existing.public_key === info.publicKey && existing.status !== 'revoked', 'identity_conflict', 409);
            await client.query('INSERT INTO audit_packages VALUES($1,$2,$3,NULL) ON CONFLICT DO NOTHING', [info.hash, payload.id, payload.package]);
            return existing;
          }
          const old = (await client.query('SELECT status FROM audit_devices WHERE owner=$1', [context.owner])).rows;
          demand(!old.length || old.some(row => row.status === 'active') || payload.resetIdentity, 'explicit_identity_reset_required', 409);
          const status = old.some(row => row.status === 'active') ? 'pending' : 'active';
          await client.query('INSERT INTO audit_devices VALUES($1,$2,$3,$4)', [payload.id, context.owner, info.publicKey, status]);
          await client.query('INSERT INTO audit_packages VALUES($1,$2,$3,NULL)', [info.hash, payload.id, payload.package]);
          return { id: payload.id, owner: context.owner, public_key: info.publicKey, status };
        }); json(200, result); return;
      }
      if (url.pathname === '/api/recovery') {
        const stores = createEncryptedConversationBackupStore({ withTransaction: work => transaction(async client => {
          const context = await authorize(client, req, url, raw);
          return work({ query: (...args) => client.query(...args) }, context);
        }) });
        const session = await serial(() => authenticated(db, req));
        const context = { owner: session.username, token: session.token, deviceId: session.session_id };
        const result = req.method === 'GET' ? await stores.readEncryptedConversationBackup(context)
          : req.method === 'PUT' ? await stores.writeEncryptedConversationBackup(context, payload)
            : req.method === 'DELETE' ? await stores.deleteEncryptedConversationBackup(context, payload) : null;
        demand(result, 'method_not_allowed', 405); json(200, result); return;
      }
      const result = await transaction(async client => {
        const context = await authorize(client, req, url, raw);
        return handle(client, req, url, raw, payload, context);
      });
      if (result.binary) { res.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment' }); res.end(result.binary); }
      else json(200, result);
    } catch (failure) { json(failure.status || 500, { code: failure.status ? failure.code : 'audit_request_failed' }); }
  });

  async function handle(client, req, url, raw, payload, context) {
    if (['/api/devices/approve', '/api/devices/revoke'].includes(url.pathname) && req.method === 'POST') {
      exact(payload, ['id', 'fingerprint']); demand(uuid(payload.id) && /^[a-f0-9]{64}$/.test(payload.fingerprint));
      const target = (await client.query('SELECT * FROM audit_devices WHERE id=$1 AND owner=$2', [payload.id, context.owner])).rows[0];
      demand(target && hash(bytes(target.public_key, 32, 32)) === payload.fingerprint, 'device_fingerprint_mismatch', 403);
      if (url.pathname.endsWith('approve')) {
        demand(target.status === 'pending', 'device_cannot_be_approved', 409);
        await client.query("UPDATE audit_devices SET status='active' WHERE id=$1", [payload.id]);
      } else {
        demand(target.status !== 'revoked', 'device_already_revoked', 409);
        await client.query("UPDATE audit_devices SET status='revoked' WHERE id=$1", [payload.id]);
        await client.query('UPDATE audit_rooms SET blocked=TRUE WHERE id IN (SELECT room_id FROM audit_members WHERE device_id=$1 AND active)', [payload.id]);
      }
      return { ok: true };
    }
    if (url.pathname === '/api/devices/package' && req.method === 'POST') {
      exact(payload, ['package']); const info = await packageInfo(payload.package, context.owner, context.device);
      const device = (await client.query('SELECT public_key FROM audit_devices WHERE id=$1', [context.device])).rows[0];
      demand(info.publicKey === device.public_key, 'identity_changed', 409);
      await client.query('INSERT INTO audit_packages VALUES($1,$2,$3,NULL) ON CONFLICT DO NOTHING', [info.hash, context.device, payload.package]);
      return { hash: info.hash };
    }
    if (url.pathname === '/api/rooms' && req.method === 'GET') {
      const rooms = (await client.query('SELECT * FROM audit_rooms WHERE participants ? $1 ORDER BY id LIMIT 100', [context.owner])).rows;
      for (const value of rooms) value.devices = (await client.query(`SELECT d.id,d.owner,d.status FROM audit_members m JOIN audit_devices d ON d.id=m.device_id WHERE m.room_id=$1 AND m.active ORDER BY d.id`, [value.id])).rows;
      return rooms;
    }
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      exact(payload, ['id', 'roomId', 'peer', 'packageHash']); demand(uuid(payload.roomId) && typeof payload.peer === 'string' && payload.peer !== context.owner);
      return idempotent(client, context, payload, async () => {
        demand((await client.query("SELECT 1 FROM users WHERE username=$1 AND status='active'", [payload.peer])).rows.length, 'unknown_peer');
        const kp = (await client.query('SELECT * FROM audit_packages WHERE hash=$1 AND device_id=$2 AND used_room IS NULL', [payload.packageHash, context.device])).rows[0];
        demand(kp, 'key_package_already_used', 409);
        await packageInfo(kp.package, context.owner, context.device);
        await client.query('INSERT INTO audit_rooms(id,participants) VALUES($1,$2)', [payload.roomId, JSON.stringify([context.owner, payload.peer].sort())]);
        await client.query('INSERT INTO audit_members(room_id,device_id,active) VALUES($1,$2,TRUE)', [payload.roomId, context.device]);
        await client.query('UPDATE audit_packages SET used_room=$1 WHERE hash=$2', [payload.roomId, payload.packageHash]);
        return { id: payload.id, roomId: payload.roomId, epoch: 0 };
      });
    }
    if (url.pathname === '/api/commits' && req.method === 'POST') {
      exact(payload, ['id', 'roomId', 'expectedEpoch', 'ciphertext', 'adds', 'removes', 'welcome', 'tree']);
      demand(Number.isSafeInteger(payload.expectedEpoch) && payload.expectedEpoch >= 0 && payload.expectedEpoch < 1000000
        && Array.isArray(payload.adds) && Array.isArray(payload.removes) && payload.adds.length + payload.removes.length > 0
        && payload.adds.length + payload.removes.length <= 8 && payload.removes.every(uuid)
        && new Set(payload.removes).size === payload.removes.length);
      return idempotent(client, context, payload, async () => {
        const current = await room(client, payload.roomId, context);
        demand(current.epoch === payload.expectedEpoch, 'epoch_conflict', 409);
        wire(payload.ciphertext, payload.roomId, current.epoch, 'commit');
        const before = (await client.query('SELECT device_id FROM audit_members WHERE room_id=$1 AND active ORDER BY device_id', [payload.roomId])).rows.map(row => row.device_id);
        demand(payload.removes.every(id => before.includes(id) && id !== context.device), 'invalid_removal');
        const added = [];
        for (const add of payload.adds) {
          exact(add, ['deviceId', 'packageHash']); demand(uuid(add.deviceId) && !before.includes(add.deviceId) && !added.includes(add.deviceId));
          const device = (await client.query("SELECT * FROM audit_devices WHERE id=$1 AND status='active'", [add.deviceId])).rows[0];
          demand(device && current.participants.includes(device.owner), 'unapproved_room_device', 403);
          const kp = (await client.query('SELECT package FROM audit_packages WHERE hash=$1 AND device_id=$2 AND used_room IS NULL', [add.packageHash, add.deviceId])).rows;
          demand(kp.length, 'key_package_already_used', 409);
          await packageInfo(kp[0].package, device.owner, add.deviceId); added.push(add.deviceId);
          await client.query('UPDATE audit_packages SET used_room=$1 WHERE hash=$2', [payload.roomId, add.packageHash]);
        }
        demand(before.length - payload.removes.length + added.length <= 8, 'room_device_limit');
        if (added.length) { bytes(payload.welcome, 64 * 1024); bytes(payload.tree, 64 * 1024); }
        else demand(payload.welcome === null && payload.tree === null);
        for (const id of payload.removes) await client.query('UPDATE audit_members SET active=FALSE WHERE room_id=$1 AND device_id=$2', [payload.roomId, id]);
        for (const id of added) {
          await client.query('DELETE FROM audit_quarantines WHERE device_id=$1 AND room_id=$2', [id, payload.roomId]);
          await client.query('DELETE FROM audit_receipt_devices r USING audit_messages msg WHERE r.message_id=msg.id AND r.device_id=$1 AND msg.room_id=$2 AND NOT r.history', [id, payload.roomId]);
          await client.query('INSERT INTO audit_members(room_id,device_id,active,start_event) VALUES($1,$2,TRUE,(SELECT COALESCE(MAX(id),0)+1 FROM audit_events)) ON CONFLICT(room_id,device_id) DO UPDATE SET active=TRUE,start_event=EXCLUDED.start_event', [payload.roomId, id]);
        }
        await client.query(`UPDATE audit_rooms SET epoch=epoch+1,blocked=EXISTS(SELECT 1 FROM audit_members m JOIN audit_devices d ON d.id=m.device_id WHERE m.room_id=$1 AND m.active AND d.status='revoked') WHERE id=$1`, [payload.roomId]);
        const notice = { ...payload, actor: context.device, owner: context.owner, epoch: current.epoch + 1 };
        for (const id of before.filter(id => id !== context.device && !payload.removes.includes(id))) await event(client, id, payload.roomId, 'commit', notice);
        for (const add of payload.adds) await event(client, add.deviceId, payload.roomId, 'welcome', { ...notice, packageHash: add.packageHash });
        return { id: payload.id, roomId: payload.roomId, epoch: current.epoch + 1 };
      });
    }
    if (url.pathname === '/api/messages' && req.method === 'POST') {
      exact(payload, ['id', 'roomId', 'epoch', 'ciphertext', 'attachmentIds']);
      demand(Number.isSafeInteger(payload.epoch) && payload.epoch >= 0 && Array.isArray(payload.attachmentIds)
        && payload.attachmentIds.length <= 1 && payload.attachmentIds.every(uuid));
      return idempotent(client, context, payload, async () => {
        const current = await room(client, payload.roomId, context);
        demand(!current.blocked, 'room_rekey_required', 409); demand(current.epoch === payload.epoch, 'epoch_conflict', 409);
        wire(payload.ciphertext, payload.roomId, payload.epoch);
        const members = (await client.query("SELECT m.device_id FROM audit_members m JOIN audit_devices d ON d.id=m.device_id WHERE m.room_id=$1 AND m.active AND d.status='active' ORDER BY m.device_id", [payload.roomId])).rows;
        demand(members.length > 1, 'recipient_not_joined', 409);
        for (const id of payload.attachmentIds) demand((await client.query('SELECT 1 FROM audit_media WHERE id=$1 AND room_id=$2 AND owner=$3', [id, payload.roomId, context.owner])).rows.length, 'attachment_not_uploaded');
        await client.query('INSERT INTO audit_messages VALUES($1,$2,$3,$4,$5,$6)', [payload.id, payload.roomId, context.device, payload.epoch, payload.ciphertext, hash(bytes(payload.ciphertext, 256 * 1024))]);
        await client.query(`INSERT INTO audit_receipt_devices(message_id,device_id)
          SELECT $1,d.id FROM audit_members m JOIN audit_devices d ON d.id=m.device_id
          WHERE m.room_id=$2 AND m.active AND d.status='active' AND d.owner=$3`, [payload.id, payload.roomId, context.owner]);
        const notice = { ...payload, actor: context.device, owner: context.owner };
        for (const member of members.filter(row => row.device_id !== context.device)) await event(client, member.device_id, payload.roomId, 'message', notice);
        return { id: payload.id, status: 'sent' };
      });
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const rows = (await client.query(`SELECT e.id::text,e.room_id,e.kind,e.payload FROM audit_events e JOIN audit_members m ON m.room_id=e.room_id AND m.device_id=e.device_id
        WHERE e.device_id=$1 AND NOT e.acknowledged AND m.active AND (e.id>=m.start_event OR
          (e.kind='receipt' AND EXISTS(SELECT 1 FROM audit_receipt_devices r WHERE r.device_id=e.device_id AND r.message_id=e.payload->>'id' AND r.history)))
        AND NOT EXISTS(SELECT 1 FROM audit_quarantines q WHERE q.device_id=e.device_id AND q.room_id=e.room_id)
        ORDER BY e.id LIMIT 64`, [context.device])).rows;
      return rows;
    }
    if (url.pathname === '/api/events/reject' && req.method === 'POST') {
      exact(payload, ['id', 'roomId', 'fingerprint']);
      demand(typeof payload.id === 'string' && /^[1-9][0-9]{0,15}$/.test(payload.id) && uuid(payload.roomId) && /^[a-f0-9]{64}$/.test(payload.fingerprint));
      await room(client, payload.roomId, context, false);
      const rejected = (await client.query('SELECT id::text,room_id,kind,payload FROM audit_events WHERE id=$1 AND device_id=$2 AND room_id=$3', [payload.id, context.device, payload.roomId])).rows[0];
      demand(rejected && hash(Buffer.from(JSON.stringify(rejected))) === payload.fingerprint, 'rejected_event_mismatch', 409);
      await client.query('INSERT INTO audit_quarantines VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [context.device, payload.roomId, payload.id, payload.fingerprint]);
      // Rejection never acknowledges a message as stored or issues a receipt.
      return { quarantined: true };
    }
    if (url.pathname === '/api/events/ack' && req.method === 'POST') {
      exact(payload, ['ids']); demand(Array.isArray(payload.ids) && payload.ids.length <= 64 && payload.ids.every(value => typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)));
      let acknowledged = 0;
      for (const id of new Set(payload.ids)) acknowledged += (await client.query('UPDATE audit_events SET acknowledged=TRUE WHERE id=$1 AND device_id=$2 RETURNING id', [id, context.device])).rows.length;
      return { acknowledged };
    }
    if (url.pathname === '/api/receipts' && req.method === 'POST') {
      let signed;
      try { signed = receiptBytes(payload); } catch { throw error(400, 'receipt_proof_rejected'); }
      demand(payload.owner === context.owner && payload.device === context.device, 'receipt_proof_rejected', 403);
      const message = (await client.query('SELECT m.*,d.owner FROM audit_messages m JOIN audit_devices d ON d.id=m.device_id WHERE m.id=$1', [payload.id])).rows[0];
      demand(message && message.owner !== context.owner, 'receipt_forbidden', 403);
      demand(payload.roomId === message.room_id && payload.epoch === message.epoch && payload.cipherHash === message.digest, 'receipt_proof_rejected', 403);
      const receiver = (await client.query('SELECT public_key FROM audit_devices WHERE id=$1', [context.device])).rows[0];
      const receiptKey = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), bytes(receiver.public_key, 32, 32)]), type: 'spki', format: 'der' });
      demand(crypto.verify(null, signed, receiptKey, bytes(payload.signature, 64, 64)), 'receipt_proof_rejected', 403);
      await room(client, message.room_id, context);
      demand((await client.query("SELECT 1 FROM audit_events WHERE device_id=$1 AND kind='message' AND payload->>'id'=$2 AND acknowledged", [context.device, payload.id])).rows.length, 'message_not_stored', 409);
      if (payload.kind === 'read') demand((await client.query("SELECT 1 FROM audit_receipts WHERE message_id=$1 AND device_id=$2 AND kind='stored'", [payload.id, context.device])).rows.length, 'message_not_delivered', 409);
      const added = await client.query(`INSERT INTO audit_receipts(message_id,device_id,kind,proof) VALUES($1,$2,$3,$4)
        ON CONFLICT(message_id,device_id,kind) DO UPDATE SET proof=EXCLUDED.proof
        WHERE audit_receipts.proof IS NULL RETURNING message_id`, [payload.id, context.device, payload.kind, JSON.stringify(payload)]);
      if (added.rows.length) {
        const senders = (await client.query("SELECT d.id FROM audit_receipt_devices r JOIN audit_devices d ON d.id=r.device_id JOIN audit_members m ON m.device_id=d.id AND m.room_id=$1 WHERE r.message_id=$3 AND m.active AND d.owner=$2 AND d.status='active'", [message.room_id, message.owner, payload.id])).rows;
        for (const sender of senders) await event(client, sender.id, message.room_id, 'receipt', payload);
      }
      return { id: payload.id, kind: payload.kind };
    }
    if (url.pathname === '/api/receipts/history' && req.method === 'POST') {
      exact(payload, ['id', 'roomId', 'messageIds']);
      demand(Array.isArray(payload.messageIds) && payload.messageIds.length > 0 && payload.messageIds.length <= 64 && payload.messageIds.every(uuid));
      return idempotent(client, context, payload, async () => {
        await room(client, payload.roomId, context, false);
        for (const id of new Set(payload.messageIds)) {
          const message = (await client.query('SELECT msg.id FROM audit_messages msg JOIN audit_devices d ON d.id=msg.device_id WHERE msg.id=$1 AND msg.room_id=$2 AND d.owner=$3', [id, payload.roomId, context.owner])).rows[0];
          demand(message, 'history_receipt_forbidden', 403);
          await client.query('INSERT INTO audit_receipt_devices VALUES($1,$2,TRUE) ON CONFLICT(message_id,device_id) DO UPDATE SET history=TRUE', [id, context.device]);
          const receipts = (await client.query('SELECT proof FROM audit_receipts WHERE message_id=$1 AND proof IS NOT NULL ORDER BY kind,device_id', [id])).rows;
          for (const receipt of receipts) await event(client, context.device, payload.roomId, 'receipt', receipt.proof);
        }
        return { id: payload.id, subscribed: new Set(payload.messageIds).size };
      });
    }
    if (url.pathname.startsWith('/api/media/')) {
      const id = url.pathname.slice('/api/media/'.length); demand(uuid(id));
      const roomId = url.searchParams.get('roomId'); await room(client, roomId, context, req.method === 'PUT');
      const previous = (await client.query('SELECT * FROM audit_media WHERE id=$1', [id])).rows[0];
      if (req.method === 'PUT') {
        demand((req.headers['content-type'] || '') === 'application/octet-stream' && raw.length >= 40 && raw.subarray(0, 8).toString() === 'WINGAEM2');
        const digest = hash(raw);
        if (previous) demand(previous.room_id === roomId && previous.owner === context.owner && previous.digest === digest, 'attachment_conflict', 409);
        else await client.query('INSERT INTO audit_media VALUES($1,$2,$3,$4,$5)', [id, roomId, context.owner, raw, digest]);
        return { id, digest };
      }
      if (req.method === 'GET') { demand(previous && previous.room_id === roomId, 'attachment_forbidden', 403); return { binary: Buffer.from(previous.ciphertext) }; }
    }
    throw error(404, 'not_found');
  }
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (failure) { await db.close(); throw failure; }
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, db, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await chain; await db.close(); } };
}
if (require.main === module) {
  startAuditServer({ auditOnly: process.argv.includes('--audit-only'), dataDir: path.join(__dirname, '../.audit-data'), port: Number(process.env.WINGA_AUDIT_PORT || 4317), password: process.env.WINGA_AUDIT_PASSWORD || 'local-audit-only' })
    .then(app => { console.log(`Audit pending, local-only: ${app.origin}`); for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0))); })
    .catch(() => { console.error('Audit workbench could not start.'); process.exitCode = 1; });
}
module.exports = { startAuditServer };
