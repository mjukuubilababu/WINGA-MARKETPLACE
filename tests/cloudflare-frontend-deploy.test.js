const test = require('node:test');
const assert = require('node:assert/strict');
const {deployFrontend} = require('../scripts/deploy-cloudflare-frontend');

test('frontend deploy uses the built asset version for both bindings and preserves remote variables', async () => {
  const order = [];
  let args;
  const result = await deployFrontend({
    build: () => {order.push('build'); return {status: 0};},
    readVersion: () => {order.push('manifest'); return '20261012230000';},
    deploy: async (given, options) => {
      order.push('deploy'); args = given;
      assert.equal(options.env.WINGA_ASSET_VERSION, '20261012230000');
      assert.equal(options.env.WINGA_BUILD_OUTPUT, 'public');
      return 0;
    }
  });
  assert.equal(result, 0);
  assert.deepEqual(order, ['build', 'manifest', 'deploy']);
  assert.ok(args.includes('--keep-vars'));
  assert.ok(args.includes('BUILD_VERSION:20261012230000'));
  assert.ok(args.includes('WINGA_BUILD_VERSION:20261012230000'));
});

test('failed builds and invalid versions cannot deploy stale frontend assets', async () => {
  assert.equal(await deployFrontend({build: () => ({status: 2}),
    readVersion: () => assert.fail('No stale manifest read'), deploy: () => assert.fail('No deploy')}), 2);
  await assert.rejects(deployFrontend({build: () => ({status: 0}), readVersion: () => 'invalid',
    deploy: () => assert.fail('No deploy')}), /Invalid frontend build version/);
});

test('frontend dry run never requests publication and returns deployment failures', async () => {
  assert.equal(await deployFrontend({build: () => ({status: 0}), readVersion: () => '20261012230000',
    dryRun: true, deploy: async args => {assert.ok(args.includes('--dry-run')); return 3;}}), 3);
});
