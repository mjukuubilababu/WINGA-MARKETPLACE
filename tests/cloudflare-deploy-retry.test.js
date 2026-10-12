const test = require('node:test');
const assert = require('node:assert/strict');
const {deployWorker, transientFailure} = require('../scripts/deploy-cloudflare-worker');
const args = ['deploy', '--config', 'wrangler.toml', '--keep-vars', '--var', 'BUILD_VERSION:20261012120000'];

test('Cloudflare retries only the failed Worker and preserves the tested build arguments', async () => {
  const calls = [], waits = [];
  const results = [{code: 1, output: 'POST /versions -> 504 Gateway Timeout'}, {code: 0, output: 'Deployed'}];
  assert.equal(await deployWorker(args, {
    run: async given => {calls.push([...given]); return results.shift();},
    wait: async delay => waits.push(delay), write: () => {}
  }), 0);
  assert.deepEqual(calls, [args, args]);
  assert.deepEqual(waits, [5000]);
});

test('Cloudflare retries are bounded and cannot claim deployment success after exhaustion', async () => {
  let attempts = 0;
  const waits = [];
  assert.equal(await deployWorker(args, {
    run: async () => {attempts++; return {code: 1, output: 'Received a malformed response from the API'};},
    wait: async delay => waits.push(delay), write: () => {}
  }), 1);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [5000, 15000]);
});

test('Cloudflare permissions and configuration errors fail without repeated writes', async () => {
  for (const output of ['403 Forbidden', 'Authentication error', 'Invalid configuration', '504 earlier, now 401 Unauthorized']) {
    let attempts = 0;
    assert.equal(await deployWorker(args, {
      run: async () => {attempts++; return {code: 2, output};},
      wait: async () => assert.fail('Fatal errors must not retry.'), write: () => {}
    }), 2);
    assert.equal(attempts, 1);
  }
  assert.equal(transientFailure('503 Service Unavailable'), true);
  assert.equal(transientFailure('ECONNRESET'), true);
  assert.equal(transientFailure('BINDING_LIMIT=500; Invalid configuration'), false);
  await assert.rejects(deployWorker(['deploy']), /keep-vars/);
});
