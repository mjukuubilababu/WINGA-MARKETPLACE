const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: "http://127.0.0.1:4173/winga.html",
    channel: "msedge",
    headless: true
  },
  webServer: {
    command: "node tests/e2e/start-servers.js",
    url: "http://127.0.0.1:4173/winga.html",
    reuseExistingServer: true,
    timeout: 120000
  }
});
