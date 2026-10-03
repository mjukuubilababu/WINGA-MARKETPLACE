const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: ['secure-content.spec.js', 'crypto-devices.spec.js', 'mls-runtime.spec.js', 'encrypted-transport.spec.js'], timeout: 60000,
  workers: 1, use: { channel: 'msedge', headless: true },
});
