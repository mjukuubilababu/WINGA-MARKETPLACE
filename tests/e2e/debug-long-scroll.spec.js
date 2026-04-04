const fs = require("node:fs");
const path = require("node:path");
const { test, expect, request: playwrightRequest } = require("@playwright/test");

const apiBaseUrl = "http://127.0.0.1:43080/api";
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");

async function applyApiConfigOverride(target) {
  await target.addInitScript((baseUrl) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {
      provider: "api",
      fallbackProvider: "api",
      apiBaseUrl: baseUrl
    };
  }, apiBaseUrl);
}

async function createLoggedInPage(browser, username, password, options = {}) {
  let session = null;
  if (fs.existsSync(seedSessionsPath)) {
    const seededSessions = JSON.parse(fs.readFileSync(seedSessionsPath, "utf8"));
    session = seededSessions[username] || null;
  }
  if (!session) {
    const api = await playwrightRequest.newContext({ baseURL: apiBaseUrl });
    const response = await api.post("/auth/login", {
      data: { username, password }
    });
    expect(response.ok()).toBeTruthy();
    session = await response.json();
    await api.dispose();
  }

  const context = await browser.newContext(options);
  await applyApiConfigOverride(context);
  await context.addInitScript((payload) => {
    window.localStorage.setItem("winga-current-user", JSON.stringify(payload));
  }, session);
  const page = await context.newPage();
  return { context, page };
}

test("debug long scroll runtime and DOM growth", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  const consoleEvents = [];
  const pageErrors = [];

  page.on("console", (message) => {
    consoleEvents.push({
      type: message.type(),
      text: message.text()
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  const samples = [];
  for (let step = 0; step < 12; step += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    samples.push(await page.evaluate(() => ({
      productCards: document.querySelectorAll("#products-container .product-card").length,
      showcaseTracks: document.querySelectorAll(".showcase-track").length,
      discoverySections: document.querySelectorAll("[data-continuous-discovery-section]").length,
      detailSections: document.querySelectorAll("[data-product-detail-continuation-section]").length,
      bodyHeight: document.body.scrollHeight,
      topBarHidden: document.body.classList.contains("mobile-header-hidden"),
      appContainerPaddingTop: window.getComputedStyle(document.getElementById("app-container") || document.body).paddingTop
    })));
  }

  console.log("DEBUG_LONG_SCROLL_SAMPLES", JSON.stringify(samples, null, 2));
  console.log("DEBUG_LONG_SCROLL_CONSOLE", JSON.stringify(consoleEvents, null, 2));
  console.log("DEBUG_LONG_SCROLL_PAGE_ERRORS", JSON.stringify(pageErrors, null, 2));

  await context.close();
});
