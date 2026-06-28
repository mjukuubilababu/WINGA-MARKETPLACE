const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",
  globalTeardown: "./tests/e2e/global-teardown.js",
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: "http://127.0.0.1:4173/index.html",
    channel: "msedge",
    headless: true
  },
  webServer: undefined
});
