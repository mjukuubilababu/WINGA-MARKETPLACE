const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {deployWorker} = require('./deploy-cloudflare-worker');

const root = path.resolve(__dirname, '..');

async function deployFrontend({build = () => spawnSync(process.execPath, [path.join(root, 'scripts/build-vercel-static.js')], {
  cwd: root, stdio: 'inherit', env: {...process.env, WINGA_BUILD_OUTPUT: 'public'}
}), readVersion = () => JSON.parse(fs.readFileSync(path.join(root, 'public/build-version.json'), 'utf8')).version,
deploy = deployWorker, dryRun = false} = {}) {
  const result = build();
  if (result.error) throw result.error;
  if (result.status !== 0) return result.status || 1;
  const version = readVersion();
  if (typeof version !== 'string' || !/^\d{14}$/.test(version)) throw new Error('Invalid frontend build version.');
  // Read the generated manifest after building; remote BUILD_VERSION must not override this release.
  const args = ['deploy', '--config', path.join(root, 'wrangler.toml'), '--keep-vars',
    '--var', `BUILD_VERSION:${version}`, '--var', `WINGA_BUILD_VERSION:${version}`];
  if (dryRun) args.push('--dry-run');
  return deploy(args, {env: {...process.env, WINGA_ASSET_VERSION: version, WINGA_BUILD_OUTPUT: 'public'}});
}

module.exports = {deployFrontend};
if (require.main === module) {
  const options = process.argv.slice(2);
  if (options.some(option => option !== '--dry-run')) {
    process.stderr.write('Supported frontend deployment option: --dry-run\n');
    process.exitCode = 1;
  } else deployFrontend({dryRun: options.includes('--dry-run')}).then(code => {
    process.exitCode = code;
  }).catch(() => {
    process.stderr.write('Frontend build/deployment failed. Review the build and Wrangler output.\n');
    process.exitCode = 1;
  });
}
