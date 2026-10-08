const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mode, openTestLogins, verifyLogin } = require('../scripts/open-production-test-logins');

test('login helper accepts only login or offline browser check, never credentials or arbitrary URLs', () => {
  assert.equal(mode([]), 'login');
  assert.equal(mode(['--check']), 'check');
  assert.equal(mode(['--devices']), 'devices');
  assert.equal(mode(['--account=wizad']), 'login');
  assert.equal(mode(['--account=rey']), 'login');
  for (const args of [['--password=private'], ['--account=other'], ['https://example.com'], ['--check', '--check']]) {
    assert.throws(() => mode(args), /LOGIN_HELPER_OPTIONS_INVALID/);
  }
});

test('two private profiles navigate only to Winga and verify identity independently of Enter', async () => {
  const opened = [], navigations = [], prompts = [], closed = [], verified = [];
  const result = await openTestLogins({
    launch: async (directory, options) => {
      opened.push({ directory, options });
      return { pages: () => [{ goto: async url => navigations.push(url), bringToFront: async () => {} }],
        close: async () => closed.push(directory) };
    },
    readLine: async account => prompts.push(account),
    verify: async (_, account) => { verified.push(account); return true; }
  });
  assert.deepEqual(prompts, ['rey', 'wizad']);
  assert.deepEqual(verified, ['rey', 'wizad']);
  assert.deepEqual(navigations, ['https://wingamarket.com/', 'https://wingamarket.com/']);
  assert.equal(new Set(opened.map(x => x.directory)).size, 2);
  assert.ok(opened.every(x => path.basename(x.directory).startsWith('.tmp-production-login-')));
  assert.ok(opened.every(x => x.options.headless === false && x.options.channel === 'msedge'));
  assert.equal(opened[0].directory, closed[0]);
  assert.equal(opened[1].directory, closed[1]);
  assert.equal(result.authenticatedSessionsVerified, true);
  assert.equal(result.productionLoadVerified, false);
  assert.equal(result.deviceApprovalsVerified, false);
  assert.equal(result.testMessagesSent, 0);
});

test('device review cannot claim approval from Enter or from authentication alone', async () => {
  let opened = 0, checks = 0, closed = 0;
  await assert.rejects(openTestLogins({ accounts: ['rey'], reviewDevices: true,
    launch: async () => ({ pages: () => [{ goto: async () => {}, bringToFront: async () => {} }], close: async () => { closed++; } }),
    readLine: async () => {}, verify: async () => true,
    openReview: async () => { opened++; }, verifyApproval: async () => { checks++; return false; }
  }), /DEVICE_APPROVAL_NOT_CONFIRMED/);
  assert.equal(opened, 1);
  assert.equal(checks, 3);
  assert.equal(closed, 1);
});

test('device review shows existing UI and requires verified native approval without approving or sending', async () => {
  const reviews = [];
  const result = await openTestLogins({ accounts: ['rey','wizad'], reviewDevices: true,
    launch: async () => ({ pages: () => [{ goto: async () => {}, bringToFront: async () => {} }], close: async () => {} }),
    readLine: async () => {}, verify: async () => true,
    openReview: async () => { reviews.push('existing-device-UI'); }, verifyApproval: async () => true
  });
  assert.equal(reviews.length, 2);
  assert.equal(result.deviceApprovalsVerified, true);
  assert.equal(result.productionLoadVerified, false);
  assert.equal(result.testMessagesSent, 0);
});

test('missing login cannot complete by pressing Enter and is bounded to three checks', async () => {
  let prompts = 0, checks = 0, closed = 0;
  await assert.rejects(openTestLogins({ accounts: ['wizad'],
    launch: async () => ({ pages: () => [{ goto: async () => {}, bringToFront: async () => {} }], close: async () => { closed++; } }),
    readLine: async () => { prompts++; }, verify: async () => { checks++; return false; }
  }), /LOGIN_SESSION_NOT_CONFIRMED/);
  assert.equal(prompts, 3);
  assert.equal(checks, 3);
  assert.equal(closed, 1);
});

test('one-account correction never opens or resets the already prepared other account', async () => {
  const opened = [];
  const result = await openTestLogins({ accounts: ['wizad'],
    launch: async directory => {
      opened.push(directory);
      return { pages: () => [{ goto: async () => {}, bringToFront: async () => {} }], close: async () => {} };
    }, readLine: async () => {}, verify: async () => true
  });
  assert.equal(opened.length, 1);
  assert.equal(path.basename(opened[0]), '.tmp-production-login-wizad');
  assert.deepEqual(result.accounts, ['wizad']);
  await assert.rejects(openTestLogins({ accounts: ['other'], launch: async () => assert.fail('invalid account must not launch') }), /LOGIN_ACCOUNT_INVALID/);
});

test('login verifier requires both the expected browser identity and authenticated server session', async () => {
  let checks = 0;
  assert.equal(await verifyLogin({ waitForFunction: async () => {}, evaluate: async () => { checks++; return true; } }, 'wizad'), true);
  assert.equal(checks, 1);
  assert.equal(await verifyLogin({ waitForFunction: async () => {}, evaluate: async () => false }, 'wizad'), false);
  assert.equal(await verifyLogin({ waitForFunction: async () => { throw new Error('not signed in'); }, evaluate: async () => assert.fail('no server read without local identity') }, 'wizad'), false);
});

test('failed navigation closes its own browser without opening another account', async () => {
  let opened = 0, closed = 0;
  await assert.rejects(openTestLogins({
    launch: async () => {
      opened++;
      return { pages: () => [{ goto: async () => { throw new Error('navigation failed'); } }], close: async () => { closed++; } };
    }, readLine: async () => assert.fail('login prompt must not open after a failed navigation')
  }), /navigation failed/);
  assert.equal(opened, 1);
  assert.equal(closed, 1);
});

test('cancelled login closes the current profile and never opens or writes another', async () => {
  let opened = 0, closed = 0;
  await assert.rejects(openTestLogins({
    launch: async () => {
      opened++;
      return { pages: () => [{ goto: async () => {}, bringToFront: async () => {} }], close: async () => { closed++; } };
    }, readLine: async () => { throw new Error('operator cancelled'); }
  }), /operator cancelled/);
  assert.equal(opened, 1);
  assert.equal(closed, 1);
});
