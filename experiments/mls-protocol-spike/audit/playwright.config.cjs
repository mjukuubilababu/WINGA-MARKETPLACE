const path = require('node:path');
module.exports = { testDir: __dirname, testMatch: 'flow.spec.cjs', workers: 1, timeout: 90000, reporter: 'list', outputDir: path.join(__dirname, '../test-results/audit'), use: { browserName: 'chromium', channel: 'msedge', headless: true } };
