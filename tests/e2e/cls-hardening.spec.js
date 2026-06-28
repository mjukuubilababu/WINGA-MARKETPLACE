const fs = require("node:fs");
const path = require("node:path");
const { test, expect, request: playwrightRequest } = require("@playwright/test");

const apiBaseUrl = "http://127.0.0.1:43080/api";
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");

async function createLoggedInPage(browser) {
  let session = null;
  if (fs.existsSync(seedSessionsPath)) {
    const seededSessions = JSON.parse(fs.readFileSync(seedSessionsPath, "utf8"));
    session = seededSessions.buyer_seller || null;
  }
  if (!session) {
    const api = await playwrightRequest.newContext({ baseURL: apiBaseUrl });
    const response = await api.post("/auth/login", {
      data: { username: "buyer_seller", password: "Pass1234" }
    });
    expect(response.ok()).toBeTruthy();
    session = await response.json();
    await api.dispose();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  if (session.authCookie) {
    await context.addCookies([{
      name: "winga_auth",
      value: session.authCookie,
      url: "http://127.0.0.1:43080",
      httpOnly: true,
      sameSite: "Lax"
    }]);
  }
  const { authCookie, ...storedSession } = session;
  await context.addInitScript(({ baseUrl, storedSession }) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {
      provider: "api",
      fallbackProvider: "api",
      apiBaseUrl: baseUrl
    };
    window.localStorage.setItem("winga-current-user", JSON.stringify(storedSession));
    window.__wingaLayoutShiftValue = 0;
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (!entry.hadRecentInput) {
          window.__wingaLayoutShiftValue += entry.value;
        }
      });
    }).observe({ type: "layout-shift", buffered: true });
  }, { baseUrl: apiBaseUrl, storedSession });
  const page = await context.newPage();
  return { context, page };
}

test("home feed reserves card and recommendation geometry during continuation", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser);

  await page.goto("/");
  const firstCard = page.locator("#products-container > .product-card").first();
  const firstMedia = firstCard.locator(".product-card-media").first();
  await expect(firstCard).toBeVisible({ timeout: 30000 });
  await expect(firstMedia).toBeVisible({ timeout: 10000 });

  const beforeDecode = await firstMedia.boundingBox();
  expect(beforeDecode).toBeTruthy();
  expect(Math.abs((beforeDecode.width / beforeDecode.height) - 0.8)).toBeLessThan(0.03);

  await firstMedia.locator("img").first().evaluate((image) => {
    if (image.complete) {
      return;
    }
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 3000);
      const finish = () => {
        window.clearTimeout(timer);
        resolve();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
  });
  const afterDecode = await firstMedia.boundingBox();
  expect(Math.abs(afterDecode.height - beforeDecode.height)).toBeLessThan(2);

  for (let step = 0; step < 2; step += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(350);
  }

  const sectionMetrics = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll(
      "#products-container > .showcase-inline, #products-container > .recommendation-strip, #products-container > .continuous-discovery-section"
    ));
    return sections.map((section) => {
      const style = getComputedStyle(section);
      return {
        containment: style.contain,
        intrinsicSize: style.containIntrinsicSize,
        height: section.getBoundingClientRect().height
      };
    });
  });
  expect(sectionMetrics.length).toBeGreaterThan(0);
  sectionMetrics.forEach((metric) => {
    expect(metric.containment).toContain("layout");
    expect(metric.height).toBeGreaterThan(0);
  });

  const cls = await page.evaluate(() => Number(window.__wingaLayoutShiftValue || 0));
  console.log("CLS_HARDENING_METRICS", JSON.stringify({
    cls,
    beforeDecode,
    afterDecode,
    sectionMetrics
  }));
  expect(cls).toBeLessThan(0.1);
});
