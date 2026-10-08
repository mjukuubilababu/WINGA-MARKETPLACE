// Synthetic localhost rehearsal. This script does not select or deploy a live cohort.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const databaseUrl = process.env.WINGA_TEST_POSTGRES_URL;
if (process.env.WINGA_TEST_GROWTH_CANARY !== 'true' || !databaseUrl
  || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Only an explicitly configured disposable localhost PostgreSQL rehearsal is supported.');
}
const api = 'http://127.0.0.1:43080/api', site = 'http://127.0.0.1:4173';
const db = new pg.Pool({ connectionString: databaseUrl });
const startedAt = new Date().toISOString();
const contexts = [], failures = [], requests = [], checks = [], healthSignals = [];
let server, browser, log = '';
const report = { scope: 'synthetic_local_rehearsal', liveCanaryRun: false, startedAt,
  cohort: { syntheticAccounts: 3, recipientJourneys: 2, controlBrowsers: 1 }, simulatedHumanUserAgent: true, checks, failures };
async function until(check, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(100); }
  throw new Error('Timed out: ' + label);
}
async function context({ session, growth = true } = {}) {
  // Normal desktop UA for the synthetic human journey: the production bot
  // filter intentionally excludes Chromium's default HeadlessChrome UA.
  const c = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' }); contexts.push(c);
  c.growthResponses = [];
  if (session) {
    await c.addCookies([{ name: 'winga_auth', value: session.authCookie, url: api, httpOnly: true, sameSite: 'Lax' }]);
    const { authCookie, ...cachedSession } = session;
    await c.addInitScript(payload => localStorage.setItem('winga-current-user', JSON.stringify(payload)), cachedSession);
  }
  await c.addInitScript(({ api, growth }) => {
    window.__WINGA_CONFIG_OVERRIDE__ = { provider: 'api', apiBaseUrl: api, growthProductSharing: growth,
      growthMeasurement: growth, disableServiceWorker: true };
    window.__growthHealth = [];
    window.addEventListener('winga:growth-health', e => window.__growthHealth.push(e.detail));
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__growthCopied = text; } }, configurable: true });
  }, { api, growth });
  c.on('response', response => {
    if (response.url().includes('/api/growth/')) {
      const observation = { method: response.request().method(), status: response.status(), path: new URL(response.url()).pathname };
      requests.push(observation); c.growthResponses.push(observation);
    }
  });
  return c;
}
async function drained(page) {
  await until(async () => await page.evaluate(() => window.WingaGrowth?.getHealth().pending === 0), 'outbox drain');
  const state = await page.evaluate(() => ({ health: window.WingaGrowth.getHealth(), signals: window.__growthHealth }));
  assert.equal(state.health.deadLetters, 0, JSON.stringify(state)); healthSignals.push(...state.signals);
}
async function copy(page, productId) {
  await page.evaluate(id => openMediaActionSheet(getProductById(id)), productId);
  await page.locator('[data-media-action="share-copy"]').click();
  await until(async () => await page.evaluate(() => !!window.__growthCopied), 'share copy');
  const text = await page.evaluate(() => window.__growthCopied);
  return text.match(/Link: (.+)$/)[1];
}
async function login(page, identifier) {
  await page.locator('#product-detail-modal [data-buy-product]').first().click();
  await page.locator('#auth-gate-login').click();
  await page.locator('#username').fill(identifier);
  await page.locator('#password').fill('Pass1234!Secure');
  await page.locator('#auth-button').click();
  await page.locator('#header-user-trigger').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#product-detail-modal').waitFor({ state: 'visible', timeout: 30000 });
}
async function canonicalSnapshot() {
  const result = await db.query(`SELECT (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM orders) AS orders,(SELECT COUNT(*)::int FROM product_likes) AS saves`);
  return result.rows[0];
}
try {
  // Refuse occupied ports so readiness can never select an unrelated server.
  for (const port of [4173, 43080]) {
    const net = await import('node:net');
    const probe = net.createServer();
    await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
    await new Promise(resolve => probe.close(resolve));
  }
  server = spawn(process.execPath, ['tests/e2e/start-servers.js'], { cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log = (log + data).slice(-12000); });
  server.stderr.on('data', data => { log = (log + data).slice(-12000); });
  await until(async () => {
    if (server.exitCode !== null) throw new Error('Local server startup failed: ' + log);
    try { return (await fetch(site)).ok; } catch { return false; }
  }, 'local server and canonical PostgreSQL seed', 120000);
  const sessions = JSON.parse(await readFile(root + 'tests/e2e/.seed-sessions.json', 'utf8'));
  const baseline = await canonicalSnapshot();
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM growth_events')).rows[0].n, 0);
  const version = (await db.query('SELECT version() AS version')).rows[0].version;
  report.postgresVersion = version;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
  const productId = 'e2e-prod-1';
  const sourceContext = await context({ session: sessions.market_seller });
  const source = await sourceContext.newPage();
  await source.goto(site + '/product/' + productId);
  await source.locator('#product-detail-title').waitFor({ timeout: 30000 });
  await source.locator('#header-user-trigger').waitFor({ state: 'visible', timeout: 30000 });
  const url = await copy(source, productId); await drained(source);
  const shareId = new URL(url).searchParams.get('share'); assert.ok(shareId);
  checks.push('source copied an opaque share; durable envelope/outbox confirmed');

  const recipientPages = [];
  for (let i = 0; i < 2; i++) {
    const c = await context(), page = await c.newPage(); recipientPages.push(page);
    await page.goto(url);
    await page.locator('#product-detail-title').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#auth-container').isVisible(), false);
    await until(async () => (await db.query("SELECT COUNT(*)::int AS n FROM growth_events WHERE event_type='shared_product_viewed'")).rows[0].n === i + 1, 'meaningful detail dwell');
    await drained(page);
  }
  checks.push('two independent guests opened product detail and recorded two-second meaningful views');
  await login(recipientPages[0], 'buyer_seller');
  await login(recipientPages[1], 'Buyer Only');
  for (const p of recipientPages) assert.ok(p.url().includes('/product/' + productId));
  checks.push('both guest auth returns preserved the exact product destination');
  await recipientPages[0].evaluate(id => window.WingaDataLayer.likeProduct(id, true), productId);
  await drained(recipientPages[0]);
  const order = await recipientPages[1].evaluate(id => window.WingaDataLayer.createOrder({ productId: id, transactionId: 'SYNTHETIC-CANARY-' + crypto.randomUUID() }), productId);
  assert.ok(order.id); await drained(recipientPages[1]);
  await copy(recipientPages[0], productId); await drained(recipientPages[0]);
  checks.push('canonical save and synthetic order start verified; recipient reshare linked to its parent');

  // An unselected browser keeps both defaults off and emits no growth requests.
  const controlContext = await context({ growth: false });
  const control = await controlContext.newPage();
  await control.goto(url); await control.locator('#product-detail-title').waitFor({ timeout: 30000 });
  const plain = await copy(control, productId);
  assert.equal(new URL(plain).searchParams.has('share'), false);
  await pause(2200); assert.equal(controlContext.growthResponses.length, 0);
  checks.push('unselected browser: usable guest detail/plain copy, zero growth writes');

  const admin = await (await context({ session: sessions.admin })).newPage();
  const healthResponse = await admin.request.get(api + '/admin/growth/health');
  assert.equal(healthResponse.status(), 200); const health = await healthResponse.json();
  assert.equal(health.shares, 2); assert.equal(health.recipientOpens, 2); assert.equal(health.meaningfulViews, 2);
  assert.equal(health.confirmedSaves, 1); assert.equal(health.confirmedOrderStarts, 1);
  assert.equal(health.counts.shared_product_reshared, 1);
  assert.equal(health.cohort.recipientJourneys, 2); assert.equal(health.cohort.valueCount, 2);
  assert.equal(health.cohort.continuationCount, 1);
  assert.equal((await control.request.get(api + '/admin/growth/health')).status(), 403);
  report.metrics = health;
  report.outbox = { pending: 0, deadLetters: 0, retrySignals: healthSignals.filter(s => s.type === 'retry').length };
  assert.ok(requests.every(r => r.status >= 200 && r.status < 300));
  report.growthRequests = { count: requests.length, failures: requests.filter(r => r.status >= 400).length };
  checks.push('admin-only aggregate reporting matches both canonical value journeys; growth responses/outboxes healthy');

  // Exercise rollback through the real API handler with flags disabled, backed
  // by the same PostgreSQL data. No runtime env mutation or production restart.
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  const { createGrowthStore } = require('../backend/growth-store');
  const { createGrowthApi } = require('../backend/growth-api');
  const store = createGrowthStore({ query: (...args) => db.query(...args), withTransaction: async work => {
    const c = await db.connect();
    try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
    catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  } });
  let result;
  const disabled = createGrowthApi({ collectBody: async () => ({}), sendJson: (_r, status, body) => { result = { status, body }; },
    findSession: () => null, readAuthToken: () => '', clientIp: () => '127.0.0.1', ensureUser: () => true,
    isAdminSession: () => false, getStore: () => store, productSharingEnabled: false, measurementEnabled: false });
  for (const [path, code] of [['shares', 'growth_sharing_disabled'], ['events', 'growth_measurement_disabled']]) {
    await disabled.handle({ method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' } }, {}, new URL(api + '/growth/' + path));
    assert.equal(result.status, 404); assert.equal(result.body.code, code);
  }
  await disabled.handle({ method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' } }, {}, new URL(api + '/growth/shares/' + shareId));
  assert.equal(result.status, 200); assert.equal(result.body.destinationId, productId);
  for (const p of [source, ...recipientPages]) await p.evaluate(() => {
    window.WINGA_CONFIG.growthProductSharing = false; window.WINGA_CONFIG.growthMeasurement = false;
  });
  assert.equal(new URL(await copy(source, productId)).searchParams.has('share'), false);
  checks.push('rollback handler rejects new writes, resolves existing share; browser flags restore plain sharing');
  const after = await canonicalSnapshot();
  assert.equal(after.products, baseline.products); assert.equal(after.orders, baseline.orders + 1); assert.equal(after.saves, baseline.saves + 1);
  report.canonicalDeltas = { products: 0, syntheticOrders: 1, saves: 1 };
  report.ok = true;
} catch (error) {
  report.ok = false; failures.push(error.stack || error.message); process.exitCode = 1;
} finally {
  await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser?.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM'); await until(() => server.exitCode !== null || server.signalCode !== null, 'local server cleanup', 10000).catch(() => server.kill('SIGKILL'));
  }
  await db.end(); report.finishedAt = new Date().toISOString();
  const reportPath = root + 'docs/evidence/growth-canary-local-20261008.json';
  await mkdir(root + 'docs/evidence', { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, scope: report.scope, checks: checks.length, failures, reportPath }));
}
