const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: ['internal-share-ui.spec.js','rich-chat-ui.spec.js'],
  timeout: 30000, workers: 1,
  use: { channel: process.env.WINGA_TEST_BROWSER_CHANNEL==='chromium'?undefined:'msedge', headless: true }
});
