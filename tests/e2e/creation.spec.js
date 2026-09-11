const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

async function getCreationTrigger(page) {
  const mobileSell = page.locator("#bottom-nav [data-shell-action='sell']");
  return await mobileSell.isVisible() ? mobileSell : page.locator("#post-product-fab");
}

async function openCreationMenu(page) {
  const trigger = await getCreationTrigger(page);
  await expect(trigger).toBeVisible();
  await trigger.click();
  return trigger;
}

async function seller(browser, viewport = { width: 390, height: 844 }, contextOptions = {}) {
  const context = await browser.newContext({ viewport, ...contextOptions });
  const { authCookie, ...session } = JSON.parse(fs.readFileSync(path.join(__dirname, ".seed-sessions.json"), "utf8")).buyer_seller;
  await context.addCookies([{ name: "winga_auth", value: authCookie, url: "http://127.0.0.1:43080", httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(session => {
    window.__WINGA_CONFIG_OVERRIDE__ = { provider: "api", fallbackProvider: "api", apiBaseUrl: "http://127.0.0.1:43080/api" };
    localStorage.setItem("winga-current-user", JSON.stringify(session));
  }, session);
  const page = await context.newPage();
  await page.goto("/");
  await expect(await getCreationTrigger(page)).toBeVisible();
  return { context, page };
}

test("plus opens the creation menu, Post opens a clean composer and Back restores Home", async ({ browser }, info) => {
  const { context, page } = await seller(browser);
  let pickers = 0; page.on("filechooser", () => { pickers++; });
  const trigger = await openCreationMenu(page);
  await expect(page.locator("#creation-menu")).toBeVisible();
  await expect(page.locator("#creation-menu [data-creation-action]")).toHaveCount(5);
  await expect(page.locator('[data-creation-action="story"]')).toBeDisabled();
  await expect(page.locator('[data-creation-action="live"]')).toBeDisabled();
  await page.screenshot({ path: info.outputPath("creation-menu-mobile.png") });
  await page.locator('[data-creation-action="post"]').click();
  await expect(page.locator("#creation-menu")).not.toBeVisible();
  await expect(page.locator("#creation-account-name")).toHaveText("buyer_seller");
  await expect(page.locator("#product-name")).toBeVisible();
  await expect(page.locator("#creation-pick-media")).toBeVisible();
  await expect(page.locator("#product-category")).not.toBeVisible();
  await expect(page.locator("#creation-next")).toBeDisabled();
  expect(pickers).toBe(0);
  await page.screenshot({ path: info.outputPath("new-post-mobile.png") });
  await page.locator("#creation-back").click();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await expect(trigger).toBeVisible();
  await context.close();
});

test("Photo/video opens one native picker and Next preserves media and details through Back", async ({ browser }) => {
  const { context, page } = await seller(browser);
  await openCreationMenu(page);
  await page.locator('[data-creation-action="post"]').click();
  await page.locator("#product-name").fill("My new shoes");
  const fileChooser = page.waitForEvent("filechooser");
  await page.locator("#creation-pick-media").click();
  const picker = await fileChooser;
  expect(picker.isMultiple()).toBe(true);
  await picker.setFiles({ name: "shoes.png", mimeType: "image/png", buffer: await sharp({ create: { width: 300, height: 400, channels: 3, background: "#327855" } }).png().toBuffer() });
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await page.locator("#creation-next").click();
  await expect(page.locator("#product-category-top")).toBeVisible();
  await page.locator("#product-category-top").selectOption("viatu");
  await page.locator("#product-category").selectOption("viatu-sneakers");
  await page.locator("#product-price").fill("75000");
  await page.locator("#creation-back").click();
  await expect(page.locator("#product-name")).toHaveValue("My new shoes");
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  expect(await page.locator("#product-image-file").evaluate(input => input.files.length)).toBe(1);
  await page.locator("#creation-next").click();
  await expect(page.locator("#product-price")).toHaveValue("75000");
  await expect(page.locator("#product-category")).toHaveValue("viatu-sneakers");
  await expect(page.locator("#upload-button")).toBeVisible();
  await context.close();
});

test("posting a server failure retains the draft and does not blame the network", async ({ browser }) => {
  const { context, page } = await seller(browser, { width: 390, height: 844 }, { serviceWorkers: "block" });
  await page.evaluate(async () => { await globalLocalizationRuntime.setLanguage("en"); await globalLocalizationRuntime.loadCatalog("en"); });
  await context.route("**/api/products", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service unavailable" }) });
  });
  await openCreationMenu(page);
  await page.locator('[data-creation-action="post"]').click();
  await page.locator("#product-name").fill("Keep my draft");
  const buffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#327855" } }).png().toBuffer();
  await page.locator("#product-image-file").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer });
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await page.locator("#creation-next").click();
  await page.locator("#product-category-top").selectOption("viatu");
  await page.locator("#product-category").selectOption("viatu-sneakers");
  await page.locator("#upload-button").click();
  await expect(page.locator("#upload-form")).toContainText("The server encountered an error while processing the upload. Try again shortly.");
  await expect(page.locator("#upload-form")).not.toContainText("connection was interrupted");
  await page.locator("#creation-back").click();
  await expect(page.locator("#product-name")).toHaveValue("Keep my draft");
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await context.close();
});

test("Media menu opens the existing mixed picker directly and menu Escape restores focus", async ({ browser }) => {
  const { context, page } = await seller(browser);
  const trigger = await openCreationMenu(page);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await openCreationMenu(page);
  const fileChooser = page.waitForEvent("filechooser");
  await page.locator('[data-creation-action="media"]').click();
  const picker = await fileChooser;
  expect(picker.isMultiple()).toBe(true);
  await expect(page.locator("#product-image-file")).toHaveAttribute("accept", /image\/\*,video\/\*/);
  await picker.setFiles([]);
  await expect(page.locator("#product-name")).toBeVisible();
  await expect(page.locator("#creation-next")).toBeDisabled();
  await context.close();
});

test("existing edit controller keeps media and details editable and cancel returns to Profile", async ({ browser }) => {
  const { context, page } = await seller(browser);
  await page.locator("#header-user-trigger").click();
  await page.locator('[data-header-menu-action="profile"]').click();
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  const product = page.locator("#user-products-container [data-profile-product-card]").first();
  await expect(product).toBeVisible();
  // Current profile tiles do not render an edit menu; cover the retained controller directly.
  await page.evaluate(id => startEditProduct(id), await product.getAttribute("data-profile-product-card"));
  await expect(page.locator("#product-name")).toBeVisible();
  await expect(page.locator("#product-name")).not.toHaveValue("");
  await expect(page.locator("#creation-pick-media")).toBeVisible();
  await expect(page.locator("#product-category-top")).toBeVisible();
  await expect(page.locator("#upload-button")).toBeVisible();
  await expect(page.locator("#creation-next")).not.toBeVisible();
  await page.locator("#creation-back").click();
  await expect(page.locator("#upload-form")).not.toBeVisible();
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/creation-view/);
  await context.close();
});

test("creation menu and composer fit desktop and Arabic narrow screens with loaded icons", async ({ browser }, info) => {
  const { context, page } = await seller(browser, { width: 1280, height: 900 });
  await openCreationMenu(page);
  await page.screenshot({ path: info.outputPath("creation-menu-desktop.png") });
  await page.locator('[data-creation-action="post"]').click();
  await page.screenshot({ path: info.outputPath("new-post-desktop.png") });
  await page.evaluate(async () => { await globalLocalizationRuntime.setLanguage("ar"); });
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#upload-title")).toHaveText("منشور جديد");
  const bounds = await page.locator("#upload-form").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath("new-post-arabic.png") });
  await page.locator("#creation-back").click();
  await openCreationMenu(page);
  await expect(page.locator("#creation-menu-title")).toHaveText("إنشاء محتوى جديد");
  await expect.poll(() => page.locator('#creation-menu img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  const metrics = await page.locator("#creation-menu").evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, right: el.getBoundingClientRect().right }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
  expect(metrics.right).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath("creation-menu-arabic.png") });
  await context.close();
});
