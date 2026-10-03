const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');

function buildMlsBrowser(outdir) {
  const result = buildSync({
    entryPoints: [path.resolve(__dirname, '../src/chat/mls-runtime.mjs')],
    outfile: path.join(outdir, 'winga-mls-candidate.js'), bundle: true,
    platform: 'browser', target: ['es2022'], format: 'iife', globalName: 'WingaMlsCandidate',
    minify: true, sourcemap: false, legalComments: 'eof',
  });
  const root = path.resolve(__dirname, '..');
  const notices = ['ts-mls', '@noble/ciphers', '@noble/hashes'].map(name =>
    `${name}\n\n${fs.readFileSync(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`);
  fs.writeFileSync(path.join(outdir, 'winga-mls-candidate-LICENSE.txt'), notices.join('\n\n---\n\n'));
  return result;
}

module.exports = { buildMlsBrowser };
