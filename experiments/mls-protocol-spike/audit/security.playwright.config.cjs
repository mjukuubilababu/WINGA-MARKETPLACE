const path = require('node:path');
module.exports = { testDir: __dirname, testMatch: 'security-probes.spec.cjs', workers: 1, timeout: 90000,
  reporter: [['list'], ['json', { outputFile: path.join(__dirname, '../test-results/security-audit/results.json') }]], outputDir: path.join(__dirname, '../test-results/security-audit'),
  use: { browserName: 'chromium', channel: 'msedge', headless: true } };
