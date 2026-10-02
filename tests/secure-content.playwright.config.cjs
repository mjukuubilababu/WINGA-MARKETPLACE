const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: 'secure-content.spec.js', timeout: 60000,
  workers: 1, use: { channel: 'msedge', headless: true },
});
