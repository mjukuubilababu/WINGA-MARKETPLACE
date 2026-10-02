const path = require('node:path');
module.exports = { testDir: __dirname, testMatch: 'deep-review.spec.cjs', workers: 1, timeout: 90000,
  reporter: [['list'], ['json', { outputFile: path.join(__dirname, '../test-results/deep-review/results.json') }]],
  outputDir: path.join(__dirname, '../test-results/deep-review'),
  use: { browserName: 'chromium', channel: 'msedge', headless: true } };
