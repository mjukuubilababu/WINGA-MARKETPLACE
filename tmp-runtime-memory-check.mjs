import fs from "node:fs";
import path from "node:path";
import { request as playwrightRequest, chromium, expect } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:43080/api";
const appBaseUrl = "http://127.0.0.1:4173/";
const seedSessionsPath = path.join(process.cwd(), "tests", "e2e", ".seed-sessions.json");

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

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    ...options
  });
  await applyApiConfigOverride(context);
  await context.addInitScript((payload) => {
    window.localStorage.setItem("winga-current-user", JSON.stringify(payload));
  }, session);
  const page = await context.newPage();
  return { context, page };
}

async function snapshot(page, label) {
  return page.evaluate((name) => {
    const diagnostics = window.__WINGA_DIAGNOSTICS__?.snapshot?.() || {};
    const memory = performance?.memory
      ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        }
      : null;
    return {
      label: name,
      diagnostics,
      memory,
      productCards: document.querySelectorAll("#products-container .product-card").length,
      continuationCards: document.querySelectorAll("#product-detail-modal .seller-product-card").length,
      galleryCount: document.querySelectorAll("[data-feed-gallery-carousel]").length
    };
  }, label);
}

async function main() {
  const totalLoops = Math.max(1, Number(process.env.WINGA_MEMCHECK_LOOPS || 8));
  const browser = await chromium.launch({ headless: true });
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });

  console.log("MEMCHECK step=goto");
  await page.goto(appBaseUrl);
  console.log("MEMCHECK step=wait_feed");
  await page.waitForSelector("#products-container .product-card", { timeout: 30000 });
  await page.waitForTimeout(1500);

  const samples = [];
  samples.push(await snapshot(page, "start"));

  const samplePoints = new Set([
    Math.max(1, Math.floor(totalLoops * 0.25)),
    Math.max(1, Math.floor(totalLoops * 0.5)),
    Math.max(1, totalLoops)
  ]);

  for (let loop = 0; loop < totalLoops; loop += 1) {
    console.log(`MEMCHECK step=loop_${loop + 1}_start`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(350);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(220);

    const firstCard = page.locator("#products-container .product-card").first();
    await firstCard.click();
    await page.waitForSelector("#product-detail-modal", { timeout: 15000 });

    const firstImageSlide = page.locator("#product-detail-modal [data-feed-gallery-track]").first();
    if (await firstImageSlide.count()) {
      await firstImageSlide.evaluate((node) => {
        node.scrollLeft = Math.min(node.scrollWidth, node.clientWidth * 1.2);
        node.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
    }

    const messageButton = page.locator("#product-detail-modal [data-chat-product]").first();
    if (await messageButton.count()) {
      await messageButton.click();
      await page.waitForTimeout(150);
      const closeButton = page.locator("#context-chat-modal .context-chat-close").first();
      if (await closeButton.count()) {
        await closeButton.click();
      }
    }

    const backButton = page.locator("#product-detail-modal .product-detail-back").first();
    await backButton.click();
    await page.waitForTimeout(180);

    if (loop % 6 === 0) {
      await page.locator("#header-user-trigger").click();
      await page.locator("[data-header-menu-action='profile']").click();
      await page.waitForTimeout(260);
      const messagesSection = page.locator("#profile-messages-panel");
      if (await messagesSection.count()) {
        const thread = messagesSection.locator(".message-thread-item").first();
        if (await thread.count()) {
          await thread.click();
          await page.waitForTimeout(180);
          const listBack = messagesSection.locator(".message-list-back").first();
          if (await listBack.count()) {
            await listBack.click();
          }
        }
      }
      const homeBack = page.locator("#view-home-back").first();
      if (await homeBack.count()) {
        await homeBack.click();
      }
      await page.waitForTimeout(180);
    }

    if (samplePoints.has(loop + 1)) {
      samples.push(await snapshot(page, `loop_${loop + 1}`));
    }
  }

  console.log(JSON.stringify({
    samples,
    pageErrors,
    consoleErrors
  }, null, 2));

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
