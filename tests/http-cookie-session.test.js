const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const sharp = require("sharp");
const vm = require("node:vm");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-cookie-session-"));
const baseUrl = `http://127.0.0.1:${44000 + Math.floor(Math.random() * 1000)}/api`;
let serverProcess;
let startupOutput = "";
let csrf;

async function request(pathname, options = {}) {
  const headers = new Headers(options.headers);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method)) {
    if (!csrf) {
      const response = await fetch(baseUrl + "/auth/csrf-token");
      const body = await response.json();
      assert.equal(response.status, 200);
      const match = (response.headers.get("set-cookie") || "").match(/winga_csrf=([^;,]+)/);
      assert.ok(match);
      csrf = { token: body.csrfToken, cookie: `winga_csrf=${match[1]}` };
    }
    headers.set("Cookie", [headers.get("Cookie"), csrf.cookie].filter(Boolean).join("; "));
    headers.set("X-CSRF-Token", csrf.token);
  }
  const response = await fetch(baseUrl + pathname, { ...options, headers });
  return { response, body: await response.json() };
}

function getAuthCookieHeader(response) {
  const match = (response.headers.get("set-cookie") || "").match(/winga_auth=([^;,]+)/);
  assert.ok(match);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  return `winga_auth=${match[1]}`;
}

test.before(async () => {
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, "..", "backend"),
    env: {
      ...process.env,
      PORT: new URL(baseUrl).port,
      NODE_ENV: "test",
      WINGA_DATA_DIR: path.join(tempRoot, "data"),
      WINGA_UPLOADS_DIR: path.join(tempRoot, "uploads"),
      DATABASE_URL: "",
      R2_ACCOUNT_ID: "",
      ALLOWED_ORIGINS: "http://localhost:3000,https://wingamarket.com",
      WINGA_ENCRYPTED_BACKUP_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (const stream of [serverProcess.stdout, serverProcess.stderr]) {
    stream.on("data", chunk => { startupOutput = (startupOutput + chunk.toString()).slice(-6000); });
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if ((await fetch(baseUrl + "/health")).ok) return; } catch {}
    if (serverProcess.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Isolated backend startup failed. ${startupOutput}`);
});

test.after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    await new Promise(resolve => {
      serverProcess.once("exit", resolve);
      serverProcess.kill();
    });
  }
  assert.ok(path.resolve(tempRoot).startsWith(path.join(os.tmpdir(), "winga-cookie-session-")));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("cookie-only auth responses preserve the current session ID without exposing a bearer", async () => {
  const username = 'cookie_crypto_contract', password = 'Pass1234!Secure';
  const signup = await request('/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, phoneNumber: '255712880011' })
  });
  assert.equal(signup.response.status, 200);
  assert.match(signup.body.sessionId || '', /^sess-[a-f0-9]{24}$/);
  assert.equal(Object.hasOwn(signup.body, 'token'), false);
  const login = await request('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  assert.equal(login.response.status, 200);
  assert.match(login.body.sessionId || '', /^sess-[a-f0-9]{24}$/);
  assert.notEqual(login.body.sessionId, signup.body.sessionId);
  assert.equal(Object.hasOwn(login.body, 'token'), false);
  const cookie = getAuthCookieHeader(login.response);
  const restored = await request('/auth/session', { headers: { Cookie: cookie } });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.sessionId, login.body.sessionId);
  assert.equal(Object.hasOwn(restored.body, 'token'), false);
  const browser = { window: {}, AbortController };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'auth-client.js'), 'utf8'), browser);
  let cachedSession = { username };
  const authClient = browser.window.WingaModules.api.auth.createAuthApiClient({
    baseUrl, getWindow: () => browser.window,
    sessionAdapter: { saveSession: data => { cachedSession = data; } },
    fetchJson: async (url, options) => {
      const result = await request(new URL(url).pathname.replace(/^\/api/, ''), {
        ...options, headers: { ...options.headers, Cookie: cookie }
      });
      assert.equal(result.response.status, 200);
      return result.body;
    }
  });
  await authClient.restoreSession();
  assert.equal(cachedSession.sessionId, login.body.sessionId);
  assert.equal(Object.hasOwn(cachedSession, 'token'), false);
  const profile = await request('/users/me/profile', {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileImage: `data:image/png;base64,${(await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer()).toString('base64')}`,
      sessionId: 'forged-client-session-id'
    })
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.sessionId, login.body.sessionId);
  assert.equal(Object.hasOwn(profile.body, 'token'), false);
  const listed = await request('/auth/sessions', { headers: { Cookie: cookie } });
  assert.equal(listed.body.items.find(s => s.current).sessionId, restored.body.sessionId);
  const storePath = path.join(tempRoot, 'data', 'store.json');
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  store.sessions.find(s => s.sessionId === login.body.sessionId).lastRotatedAt =
    new Date(Date.now() - 31 * 60 * 1000).toISOString();
  fs.writeFileSync(storePath, JSON.stringify(store));
  const rotated = await request('/auth/me', { headers: { Cookie: cookie } });
  assert.equal(rotated.response.status, 200);
  assert.equal(rotated.body.sessionId, login.body.sessionId);
  assert.equal(Object.hasOwn(rotated.body, 'token'), false);
  const rotatedCookie = getAuthCookieHeader(rotated.response);
  assert.ok(rotatedCookie);
  assert.notEqual(rotatedCookie, cookie);
  const rotatedList = await request('/auth/sessions', { headers: { Cookie: rotatedCookie } });
  assert.equal(rotatedList.body.items.find(s => s.current).sessionId, rotated.body.sessionId);
  const stale = await request('/auth/session', { headers: { Cookie: cookie } });
  assert.equal(stale.response.status, 401);
  assert.equal(Object.hasOwn(stale.body, 'sessionId'), false);
  await request('/auth/logout', { method: 'POST', headers: { Cookie: rotatedCookie } });
  assert.equal((await request('/auth/session', { headers: { Cookie: rotatedCookie } })).response.status, 401);
  assert.equal((await request('/auth/session', { headers: { Cookie: cookie } })).response.status, 401);
});
