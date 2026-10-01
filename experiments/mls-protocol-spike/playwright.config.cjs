const path = require('node:path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'browser'),
  testMatch: '*.spec.cjs',
  timeout: 60000,
  use: { channel: 'msedge', headless: true },
});
