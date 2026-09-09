const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const baseUrl = "http://127.0.0.1:43080/api";

async function sellerPage(browser, viewport = { width: 390, height: 844 }, unsupported = false) {
  const context = await browser.newContext({ viewport });
  const session = JSON.parse(fs.readFileSync(path.join(__dirname, ".seed-sessions.json"), "utf8")).buyer_seller;
  await context.addCookies([{ name: "winga_auth", value: session.authCookie, url: "http://127.0.0.1:43080", httpOnly: true, sameSite: "Lax" }]);
  const { authCookie, ...storedSession } = session;
  await context.addInitScript(({ session, baseUrl, unsupported }) => {
    window.__WINGA_CONFIG_OVERRIDE__ = { provider: "api", fallbackProvider: "api", apiBaseUrl: baseUrl };
    localStorage.setItem("winga-current-user", JSON.stringify(session));
    if (unsupported) window.MediaRecorder = undefined;
  }, { session: storedSession, baseUrl, unsupported });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#post-product-fab").click();
  await expect(page.locator("#upload-form")).toBeVisible();
  return { context, page };
}

async function photos() {
  return Promise.all([
    { name: "portrait.png", width: 300, height: 600, background: "#ee2020" },
    { name: "wide.png", width: 800, height: 300, background: "#20dd20" },
    { name: "square.png", width: 400, height: 400, background: "#2020ee" }
  ].map(async ({ name, ...create }) => ({
    name, mimeType: "image/png", buffer: await sharp({ create: { ...create, channels: 3 } }).png().toBuffer()
  })));
}

test("seller creates a real reel, previews every photo, and explicitly uploads it through the existing mixed-media path", async ({ browser }, testInfo) => {
  const { context, page } = await sellerPage(browser);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const images = await photos();
  const intents = [];
  let bytes = 0;
  let saved = null;
  await context.route("**/api/media/videos/direct-upload", async (route) => {
    intents.push(route.request().postDataJSON());
    await route.fulfill({ json: { providerId: "reel-browser-test", status: "uploading", uploadProtocol: "tus", uploadUrl: "http://127.0.0.1:4173/reel-binary" } });
  });
  await context.route("**/reel-binary", async (route) => {
    bytes += route.request().postDataBuffer()?.length || 0;
    await route.fulfill({ status: 204, headers: { "Upload-Offset": String(bytes), "Tus-Resumable": "1.0.0" } });
  });
  await context.route("**/api/media/videos/reel-browser-test", (route) => route.fulfill({
    json: { status: "ready", width: 720, height: 1280, duration: 6, posterUrl: "", mimeType: "video/webm" }
  }));
  await context.route("**/api/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    saved = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: saved });
  });
  await page.locator("#product-image-file").setInputFiles(images[0]);
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await page.locator("#product-photo-reel summary").click();
  await expect(page.locator("[data-reel-list] li")).toHaveCount(1);
  await page.locator("[data-reel-input]").setInputFiles(images.slice(1));
  await expect(page.locator("[data-reel-list] li")).toHaveCount(3);
  await page.locator("[data-reel-list] li").nth(1).locator("button").first().click();
  await expect(page.locator("[data-reel-list] img").first()).toHaveAttribute("alt", "wide.png");
  await page.locator("[data-reel-list] li").first().locator("button").nth(1).click();
  await expect(page.locator("[data-reel-list] img").first()).toHaveAttribute("alt", "portrait.png");
  await page.locator("[data-reel-create]").click();
  await expect(page.locator("[data-reel-use]")).toBeVisible({ timeout: 20000 });
  expect(intents).toHaveLength(0);
  const preview = page.locator("[data-reel-preview]");
  await preview.scrollIntoViewIfNeeded();
  const visibleColors = await preview.evaluate(async (video) => {
    const canvas = document.createElement("canvas");
    canvas.width = 90; canvas.height = 160;
    const ctx = canvas.getContext("2d");
    const seen = new Set();
    const wideEdges = [];
    await video.play();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Generated reel did not finish playing")), 12000);
      video.addEventListener("ended", () => { clearTimeout(timeout); resolve(); }, { once: true });
      const sample = () => {
        if (video.ended) return;
        ctx.drawImage(video, 0, 0, 90, 160);
        const [r, g, b] = ctx.getImageData(45, 80, 1, 1).data;
        const color = r > 150 && g < 90 ? "red" : g > 150 && r < 90 ? "green" : b > 150 && r < 90 ? "blue" : "";
        if (color) seen.add(color);
        if (color === "green") {
          wideEdges.push(ctx.getImageData(1, 80, 1, 1).data[1], ctx.getImageData(88, 80, 1, 1).data[1]);
        }
        requestAnimationFrame(sample);
      };
      sample();
    });
    return { colors: [...seen], wideEdges };
  });
  expect(visibleColors.colors).toEqual(["red", "green", "blue"]);
  expect(Math.min(...visibleColors.wideEdges)).toBeGreaterThan(130);
  await page.screenshot({ path: testInfo.outputPath("photo-reel-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator("[data-reel-use]").click();
  await expect.poll(() => intents.length).toBe(1);
  await expect.poll(() => bytes).toBeGreaterThan(0);
  expect(intents[0].contentType).toMatch(/^video\/(webm|mp4)$/);
  expect(intents[0].idempotencyKey).toBeTruthy();
  await expect(page.locator("[data-reel-use]")).not.toBeVisible();
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await page.locator("#product-name").fill("Photo reel browser test");
  await page.locator("#product-shop").fill("Reel shop");
  await page.locator("#product-category-top").selectOption("viatu");
  await page.locator("#product-category").selectOption("viatu-sneakers");
  await page.locator("#upload-button").click();
  await expect.poll(() => saved?.mediaItems?.length).toBe(2);
  expect(saved.images).toHaveLength(1);
  expect(saved.mediaItems.map((item) => item.type)).toEqual(["image", "video"]);
  expect(saved.mediaItems[1].providerId).toBe("reel-browser-test");
  expect(errors).toEqual([]);
  await context.close();
});

test("reel editor cancels, resets across navigation and fits desktop and narrow RTL layouts", async ({ browser }, testInfo) => {
  const { context, page } = await sellerPage(browser, { width: 1280, height: 900 });
  await page.locator("#product-photo-reel summary").click();
  await page.locator("[data-reel-input]").setInputFiles(await photos());
  await expect(page.locator("[data-reel-list] li")).toHaveCount(3);
  await page.locator("[data-reel-create]").click();
  await expect(page.locator("[data-reel-cancel]")).toBeVisible();
  await page.locator("[data-reel-cancel]").click();
  await expect(page.locator("[data-reel-preview]")).not.toBeVisible();
  await expect(page.locator("[data-reel-create]")).toBeEnabled();
  await page.locator("#product-photo-reel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("photo-reel-desktop.png") });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.dir = "rtl"; });
  await page.locator("#product-photo-reel summary").click();
  const existingScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.locator("#product-photo-reel summary").click();
  await page.locator("#product-photo-reel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("photo-reel-narrow-rtl.png") });
  const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll("#product-photo-reel, #product-photo-reel *")).filter((el) => {
      const r = el.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1);
    }).map((el) => el.outerHTML.slice(0, 180)) }));
  expect(layout.overflowing).toEqual([]);
  expect(layout.scroll).toBeLessThanOrEqual(existingScrollWidth);
  await page.locator("[data-reel-create]").click();
  await page.evaluate(() => {
    setCurrentViewState("home");
    renderCurrentView();
  });
  await expect(page.locator("[data-reel-list] li")).toHaveCount(0);
  await expect(page.locator("[data-reel-use]")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await context.close();
});

test("unsupported reel generation leaves the ordinary photo picker usable", async ({ browser }) => {
  const { context, page } = await sellerPage(browser, { width: 390, height: 844 }, true);
  await page.locator("#product-photo-reel summary").click();
  await expect(page.locator("[data-reel-status]")).not.toBeEmpty();
  await expect(page.locator("[data-reel-create]")).toBeDisabled();
  await page.locator("#product-image-file").setInputFiles((await photos())[0]);
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await context.close();
});
