const path = require('node:path');
const { chromium } = require('@playwright/test');

const ORIGIN = 'https://wingamarket.com/';
const ROOT = path.resolve(__dirname, '..');
const ACCOUNTS = Object.freeze(['rey', 'wizad']);

function mode(args) {
  if (args.length === 0) return 'login';
  if (args.length === 1 && args[0] === '--check') return 'check';
  if (args.length === 1 && args[0] === '--devices') return 'devices';
  if (args.length === 1 && /^--account=(rey|wizad)$/.test(args[0])) return 'login';
  throw new Error('LOGIN_HELPER_OPTIONS_INVALID');
}

async function verifyLogin(page, account) {
  try {
    await page.waitForFunction(expected => window.WingaDataLayer?.getSessionUser()?.username === expected, account, { timeout: 10000 });
    return await page.evaluate(async expected => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) return false;
        const session = await response.json();
        return session?.username === expected;
      } catch { return false; }
    }, account);
  } catch { return false; }
}

async function openDeviceReview(page) {
  await page.evaluate(async () => {
    await window.WingaDeviceManagementUi.open({ dataLayer: window.WingaDataLayer });
  });
}

async function verifyDevice(page) {
  return page.evaluate(async () => {
    let management;
    try {
      management = await window.WingaDataLayer.createCryptoDeviceManagement();
      const view = await management.list();
      return view.ownDevice?.status === 'active';
    } catch { return false; }
    finally { management?.close(); }
  });
}

async function openTestLogins({ launch = chromium.launchPersistentContext.bind(chromium), readLine,
  accounts = ACCOUNTS, verify = verifyLogin, reviewDevices = false,
  openReview = openDeviceReview, verifyApproval = verifyDevice, progress = () => {} }) {
  if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 2 || new Set(accounts).size !== accounts.length
    || accounts.some(account => !ACCOUNTS.includes(account))) throw new Error('LOGIN_ACCOUNT_INVALID');
  const contexts = [];
  try {
    for (const account of accounts) {
      progress({ account, step: 'open-login-window' });
      const context = await launch(path.join(ROOT, '.tmp-production-login-' + account), {
        channel: 'msedge', headless: false, viewport: null,
        args: ['--window-size=700,850']
      });
      contexts.push(context);
      const page = context.pages()[0] || await context.newPage();
      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.bringToFront();
      if (reviewDevices) {
        if (!await verify(page, account)) throw new Error('LOGIN_SESSION_NOT_CONFIRMED');
        await openReview(page);
      }
      let verified = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await readLine(account);
        if (await verify(page, account) && (!reviewDevices || await verifyApproval(page))) { verified = true; break; }
        progress({ account, step: reviewDevices ? 'device-not-confirmed' : 'login-not-confirmed' });
      }
      if (!verified) throw new Error(reviewDevices ? 'DEVICE_APPROVAL_NOT_CONFIRMED' : 'LOGIN_SESSION_NOT_CONFIRMED');
      progress({ account, step: reviewDevices ? 'device-confirmed' : 'login-confirmed' });
    }
    // Identity verification does not certify device trust, decryption or load capacity.
    return { ok: true, mode: 'prepare-production-test-logins', accounts: [...accounts],
      operatorStepsCompleted: true, authenticatedSessionsVerified: true,
      deviceApprovalsVerified: reviewDevices,
      productionLoadVerified: false, testMessagesSent: 0 };
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
}

async function main(args) {
  const selectedMode = mode(args);
  if (selectedMode === 'check') {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
      console.log(JSON.stringify({ ok: true, browserReady: true, productionAccessed: false,
        authenticatedSessionsVerified: false, testMessagesSent: 0 }));
    } finally { await browser.close(); }
    return;
  }
  const readline = require('node:readline/promises').createInterface({ input: process.stdin, output: process.stdout });
  const abort = new AbortController();
  readline.on('SIGINT', () => abort.abort());
  console.log('Enter passwords only inside the Winga browser window, never in this terminal or chat.');
  console.log('Use the existing account. Do not reset encryption/history, create an account, or send a message.');
  console.log('If Winga asks for device approval, use its normal approval flow on your existing device.');
  if (selectedMode === 'devices') console.log('Compare this browser fingerprint on your trusted existing device. Approve only the exact matching pending device. Never choose Revoke or reset history.');
  try {
    const result = await openTestLogins({
      accounts: args[0]?.startsWith('--account=') ? [args[0].slice('--account='.length)] : ACCOUNTS,
      reviewDevices: selectedMode === 'devices',
      progress: ({ account, step }) => {
        if (step === 'open-login-window') console.log('Opening the separate Winga window for ' + account + '.');
        else if (step === 'login-confirmed') console.log('Login verified for ' + account + '.');
        else if (step === 'device-confirmed') console.log('Device approval verified for ' + account + '.');
        else if (step === 'device-not-confirmed') console.log('This browser device is not active yet. Complete approval on the trusted existing device, then return here.');
        else console.log('Login not confirmed for ' + account + '. Finish Sign In in the browser, then return here.');
      },
      readLine: account => readline.question(selectedMode === 'devices'
        ? 'Approve this exact ' + account + ' browser from the existing trusted device. When finished, return here and press Enter: '
        : 'Log in as ' + account + ' in Winga. When finished, return here and press Enter: ', { signal: abort.signal })
    });
    console.log(JSON.stringify(result, null, 2));
    console.log('Browser windows closed; local profiles retained privately. Tell Codex the login steps are finished.');
  } finally { readline.close(); }
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error(JSON.stringify({ ok: false, errorCode: 'LOGIN_WINDOWS_NOT_COMPLETED',
    authenticatedSessionsVerified: false, productionLoadVerified: false }));
  process.exitCode = 1;
});

module.exports = { mode, openTestLogins, verifyLogin, verifyDevice };
