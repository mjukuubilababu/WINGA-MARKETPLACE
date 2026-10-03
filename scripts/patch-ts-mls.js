const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

const VERSION = '1.6.4';
const BEFORE_HASH = '63645bc3be6ec7f6d4f6d88af5c0b63e34f5e1fea693c62bd958d228b51b6f61';
const AFTER_HASH = '24444f64d45ea4e62939d93dbea74b428357a5891a00ab5fd69232638c266b34';
const BEFORE = 'const selfRemoved = mutatedTree[leafToNodeIndex(toLeafIndex(state.privatePath.leafIndex))] === undefined;';
const AFTER = 'const selfRemoved = grouped.remove.some(({ proposal }) => proposal.remove.removed === state.privatePath.leafIndex);';
const digest = source => createHash('sha256').update(source).digest('hex');

function correctedSource(source, version) {
  if (version !== VERSION) throw new Error('ts_mls_patch_version_mismatch');
  const canonical = source.replace(/\r\n/g, '\n'), hash = digest(canonical);
  if (hash === AFTER_HASH) return canonical;
  if (hash !== BEFORE_HASH || canonical.split(BEFORE).length !== 2) throw new Error('ts_mls_patch_source_mismatch');
  // Detect removal from validated proposals, not a slot subsequently reused by Add.
  const corrected = canonical.replace(BEFORE, AFTER);
  if (digest(corrected) !== AFTER_HASH) throw new Error('ts_mls_patch_result_mismatch');
  return corrected;
}

function patchTsMls(appRoot, { checkOnly = false } = {}) {
  const entry = createRequire(path.resolve(appRoot, 'package.json')).resolve('ts-mls');
  const packageRoot = path.resolve(path.dirname(entry), '../..');
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.name !== 'ts-mls') throw new Error('ts_mls_patch_package_mismatch');
  const file = path.join(packageRoot, 'dist/src/clientState.js'), source = fs.readFileSync(file, 'utf8');
  const corrected = correctedSource(source, metadata.version);
  const alreadyPatched = digest(source.replace(/\r\n/g, '\n')) === AFTER_HASH;
  if (!alreadyPatched && checkOnly) throw new Error('ts_mls_patch_missing');
  if (!alreadyPatched) {
    fs.writeFileSync(file, corrected, 'utf8');
    if (digest(fs.readFileSync(file, 'utf8')) !== AFTER_HASH) throw new Error('ts_mls_patch_write_mismatch');
  }
  return { version: VERSION, verified: true, changed: !alreadyPatched };
}

if (require.main === module) {
  try { console.log(JSON.stringify(patchTsMls(process.cwd(), { checkOnly: process.argv.includes('--check') }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { patchTsMls, correctedSource, BEFORE_HASH, AFTER_HASH, BEFORE, AFTER };
