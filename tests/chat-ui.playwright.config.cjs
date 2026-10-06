const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: ['chat-ui.spec.js','rich-chat-ui.spec.js','recovery-ui.spec.js','notification-ui.spec.js','archive-ui.spec.js','report-ui.spec.js','message-search-ui.spec.js'], timeout: 30000,
  workers: 1, use: { channel: 'msedge', headless: true },
});
