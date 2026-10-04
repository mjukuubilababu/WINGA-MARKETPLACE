const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: ['chat-ui.spec.js'], timeout: 30000,
  workers: 1, use: { channel: 'msedge', headless: true },
});
