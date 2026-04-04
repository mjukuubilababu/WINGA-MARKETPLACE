const { test, expect, request: playwrightRequest } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = "http://127.0.0.1:43080/api";
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");
const tinyPngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=",
  "base64"
);

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
    const loginPath = username === "admin" || username === "moderator" ? "/auth/admin-login" : "/auth/login";
    const response = await api.post(loginPath, {
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

test("app load renders marketplace feed, hero, images, and category navigation", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#products-container .product-card img").first()).toBeVisible();
  await expect(page.locator("#public-footer")).toBeVisible();

  const categoryButton = page.locator("#categories .cat-btn").nth(1);
  await categoryButton.click();
  await expect(page.locator("#results-count")).toContainText("results");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await expect(page.locator("[data-continuous-discovery-anchor='home']")).toHaveCount(0);
});

test("mobile category trigger opens sheet, drills into subcategories, and closes cleanly", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });

  await page.goto("/");
  const trigger = page.locator("#mobile-category-button");
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menu = page.locator("#mobile-category-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".mobile-category-sheet")).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(Math.round(menuBox.width)).toBeGreaterThanOrEqual(388);
  expect(Math.round(menuBox.height)).toBeGreaterThan(640);
  await expect(menu.locator(".mobile-main-category-row .mobile-category-row-chevron").first()).toBeVisible();

  const firstDrillCategory = menu.locator(".mobile-main-category-row").nth(1);
  await firstDrillCategory.click();
  await expect(menu.locator("[data-mobile-category-depth='subcategories']")).toBeVisible();
  await expect(menu.locator(".mobile-subcategory-list .mobile-subcategory-row").first()).toBeVisible();
  await expect(menu.locator(".mobile-subcategory-list .mobile-category-row-chevron")).toHaveCount(0);
  const subScreenBox = await menu.locator(".mobile-category-screen-sub").boundingBox();
  expect(subScreenBox).not.toBeNull();
  expect(Math.round(subScreenBox.width)).toBeGreaterThanOrEqual(388);

  await menu.locator("[data-mobile-category-back='true']").dispatchEvent("click");
  await expect(menu.locator("[data-mobile-category-depth='categories']")).toBeVisible();

  await page.mouse.click(12, 12);
  await expect(menu).not.toBeVisible();

  await context.close();
});

test("closed mobile category sheet does not sit on top of the logged-in home feed", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });

  await page.goto("/");
  await expect(page.locator("#mobile-category-shell")).not.toHaveClass(/open/);
  await page.evaluate(() => window.scrollTo(0, 900));

  const hit = await page.evaluate(() => {
    const node = document.elementFromPoint(36, 620);
    return {
      tag: node?.tagName || "",
      id: node?.id || "",
      className: node?.className || "",
      insideMobileCategoryMenu: Boolean(node?.closest?.("#mobile-category-menu")),
      insideProductCard: Boolean(node?.closest?.(".product-card"))
    };
  });

  expect(hit.insideMobileCategoryMenu).toBeFalsy();
  expect(hit.insideProductCard).toBeTruthy();

  await context.close();
});

test("seller signup completes immediately after account creation without hanging in the auth UI", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/");

  const uniqueSuffix = `${Date.now()}`.slice(-8);
  const username = `seller_${uniqueSuffix}`;
  const phoneNumber = `2557${uniqueSuffix}`;
  const idNumber = `1990${uniqueSuffix}55`;
  let signupRequests = 0;

  page.on("request", (request) => {
    if (request.url().includes("/auth/signup") && request.method() === "POST") {
      signupRequests += 1;
    }
  });

  await page.locator("#header-signup-button").click();
  await expect(page.locator("#auth-container")).toBeVisible();
  await expect(page.locator("#auth-role-selector")).toBeVisible();
  await page.locator("#auth-role-seller").click();
  await expect(page.locator("#seller-identity-document-type")).toBeVisible();

  await page.locator("#username").fill(username);
  await page.locator("#phone-number").fill(phoneNumber);
  await page.locator("#seller-identity-document-type").selectOption("NIDA");
  await page.locator("#seller-identity-document-number").fill(idNumber);
  await page.locator("#seller-identity-document-image").setInputFiles({
    name: "seller-id.png",
    mimeType: "image/png",
    buffer: tinyPngBuffer
  });
  await page.locator("#password").fill("Pass1234");
  await page.locator("#confirm-password").fill("Pass1234");

  const signupResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/auth/signup") && response.request().method() === "POST"
  );

  await page.locator("#auth-button").click();
  const signupResponse = await signupResponsePromise;
  expect(signupResponse.ok()).toBeTruthy();

  await expect(page.locator("#auth-container")).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#header-user-trigger")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#search-box")).toBeVisible();
  await expect(page.locator("#auth-button")).not.toContainText("Inatengeneza akaunti...");
  expect(signupRequests).toBe(1);
});

test("logged in seller-buyer can open detail, add to requests, and open chat", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  const requestButton = page.locator("#products-container [data-request-product]").first();
  await requestButton.click();
  await expect(requestButton).toContainText("Added");

  await page.locator("#products-container .product-card", { hasText: "Sneaker Classic" }).first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.locator("#product-detail-modal [data-chat-product]").first().click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await expect(page.locator("#context-chat-title")).toContainText("Market Seller Shop");

  const compose = page.locator("#context-chat-compose-input");
  await compose.fill("Habari, bidhaa hii bado ipo?");
  await page.locator("#context-chat-compose-form button[type='submit']").click();
  await expect(page.locator("#context-chat-modal .message-bubble").last()).toContainText("Habari, bidhaa hii bado ipo?");

  await page.locator("#context-chat-modal .context-chat-close").click();
  await expect(page.locator("#context-chat-modal")).not.toBeVisible();
  await page.locator("#product-detail-modal .product-detail-back").click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel")).toBeVisible();
  await expect(page.locator("#profile-request-box-panel .request-group-card").first()).toBeVisible();
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#profile-request-box-panel")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("request toggle stays consistent across reload for seller-buyer sessions", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  const firstRequestButton = page.locator("#products-container [data-request-product]").first();
  await firstRequestButton.click();
  await expect(firstRequestButton).toContainText("Added");

  await page.reload();
  await expect(page.locator("#products-container [data-request-product]").first()).toContainText("Added");

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel")).toBeVisible();
  await page.locator("#profile-request-box-panel [data-request-remove]").first().click();
  await expect(page.locator("#profile-request-box-panel .request-group-card").first()).not.toBeVisible();

  await context.close();
});

test("request box clear asks for confirmation and clears selected items after acceptance", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  const requestButton = page.locator("#products-container [data-request-product]").first();
  await requestButton.click();
  await expect(requestButton).toContainText("Added");

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel .request-group-card").first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#profile-request-box-panel [data-request-clear]").click();
  await expect(page.locator("#profile-request-box-panel .request-group-card")).toHaveCount(0);
  await expect(page.locator("#profile-request-box-panel")).toContainText("Hakuna bidhaa kwenye My Requests bado");

  await context.close();
});

test("buyer-only sessions do not show the bottom footer nav and can still reach profile from the header menu", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_only", "Pass1234");
  await page.goto("/");

  await expect(page.locator("#bottom-nav")).not.toBeVisible();
  await expect(page.locator("#post-product-fab")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#hero-panel")).toBeVisible();

  await context.close();
});

test("buyer-only profile photo upload stays stable and updates the profile avatar", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_only", "Pass1234");
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-identity-card")).toBeVisible();

  await page.locator("#profile-photo-input").setInputFiles({
    name: "buyer-profile.png",
    mimeType: "image/png",
    buffer: tinyPngBuffer
  });

  await expect(page.locator("#profile-identity-card .profile-identity-image")).toBeVisible();
  await expect(page.locator("#header-user-avatar-image")).toBeVisible();
  expect(pageErrors).toEqual([]);

  await context.close();
});

test("seller can change and verify whatsapp number from profile and upload uses the new verified number", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  await expect(page.locator("#profile-whatsapp-block")).toContainText("255700111221");

  const changeRequestPromise = page.waitForResponse((response) =>
    response.url().includes("/users/me/whatsapp/request-change") && response.request().method() === "POST"
  );

  await page.locator("#profile-whatsapp-change-toggle").click();
  await page.locator("#profile-whatsapp-input").fill("255700777331");
  await page.locator("#profile-whatsapp-request-button").click();
  const changeRequestResponse = await changeRequestPromise;
  const changeRequestBody = await changeRequestResponse.json();

  await expect(page.locator("#profile-whatsapp-block")).toContainText("Pending");
  await expect(page.locator("#profile-whatsapp-block")).toContainText("255700777331");

  await page.locator("#profile-whatsapp-code").fill(String(changeRequestBody.previewCode || ""));
  await page.locator("#profile-whatsapp-verify-button").click();

  await expect(page.locator("#profile-whatsapp-block")).toContainText("Verified");
  await expect(page.locator("#profile-whatsapp-block")).toContainText("255700777331");

  await page.locator("#view-home-back").click();
  await page.locator("#post-product-fab").click();
  await expect(page.locator("#product-whatsapp")).toHaveValue("255700777331");

  await context.close();
});

test("seller-capable home feed hides the normal footer nav and shows the floating post action", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await expect(page.locator("#bottom-nav")).not.toBeVisible();
  const postFab = page.locator("#post-product-fab");
  await expect(postFab).toBeVisible();

  await postFab.click();
  await expect(page.locator("#upload-form")).toBeVisible();
  await expect(page.locator("#product-whatsapp")).toHaveValue(/^\d{12}$/);
  await expect(page.locator("#product-whatsapp")).toHaveAttribute("readonly", "");
  await expect(page.locator("#product-whatsapp-note")).toContainText("namba ya WhatsApp ya account yako");
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#upload-form")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("seller home still shows products from other sellers in the marketplace feed", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234");
  await page.goto("/");

  await expect(page.locator("#products-container .product-card", { hasText: "Bag Travel Pro" }).first()).toBeVisible();

  await context.close();
});

test("logged in sellers can scroll below the hero and still see marketplace rows", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  await page.goto("/");

  await expect(page.locator("#hero-panel")).toBeVisible();
  await expect(page.locator("#market-showcase .showcase-card").first()).toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  const initialY = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialY);

  await context.close();
});

test("seller can post without price and sees negotiation fallback in product management", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  const postResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/products") && response.request().method() === "POST"
  );

  await page.locator("#post-product-fab").click();
  await page.locator("#product-name").fill("Bidhaa ya maelewano");
  await page.locator("#product-price").fill("");
  await page.locator("#product-shop").fill("Buyer Seller Shop");
  await page.locator("#product-category-top").selectOption("viatu");
  await page.locator("#product-category").selectOption("viatu-sneakers");
  await page.locator("#product-image-file").setInputFiles({
    name: "negotiable-product.png",
    mimeType: "image/png",
    buffer: tinyPngBuffer
  });
  await page.locator("#upload-button").click();

  const postResponse = await postResponsePromise;
  expect(postResponse.ok()).toBeTruthy();
  await expect(page.locator("#upload-form")).not.toBeVisible();
  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#user-products-container")).toContainText("Bidhaa ya maelewano");
  await expect(page.locator("#user-products-container .profile-product-card").first()).toBeVisible();
  await expect(page.locator("#user-products-container .profile-product-stage").first()).toBeVisible();
  await page.locator("#user-products-container .profile-product-card", { hasText: "Bidhaa ya maelewano" }).first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("#product-detail-title")).toContainText("Bidhaa ya maelewano");

  await context.close();
});

test("session restore keeps seller-as-buyer browsing and product-detail continuation stable", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");
  await page.reload();

  await expect(page.locator("#header-user-trigger")).toBeVisible();
  await page.locator("#products-container .product-card").nth(1).click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const originalTitle = await page.locator("#product-detail-title").textContent();
  const sellerCard = page.locator("#product-detail-modal .seller-product-card").first();
  await expect(sellerCard).toBeVisible();
  await expect(page.locator("#product-detail-modal [data-request-product]").first()).toBeVisible();
  await sellerCard.click();
  await expect(page.locator("#product-detail-title")).not.toHaveText(originalTitle || "");
  await page.locator("#product-detail-modal .product-detail-back").click();
  await expect(page.locator("#product-detail-title")).toHaveText(originalTitle || "");

  await context.close();
});

test("refresh while authenticated keeps in-app header and does not show public auth buttons", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await page.reload();
  await expect(page.locator("#header-user-trigger")).toBeVisible();
  await expect(page.locator("#header-login-button")).toBeHidden();
  await expect(page.locator("#header-signup-button")).toBeHidden();
  await expect(page.locator("#search-box")).toBeVisible();

  await context.close();
});

test("browser back from the first product detail returns to the in-app feed without leaving the app shell", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.goBack();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#header-user-trigger")).toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("browser back follows product-detail history instead of dumping users home", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const firstTitle = await page.locator("#product-detail-title").textContent();

  await page.locator("#product-detail-modal .seller-product-card").first().click();
  await expect(page.locator("#product-detail-title")).not.toHaveText(firstTitle || "");

  await page.goBack();
  await expect(page.locator("#product-detail-title")).toHaveText(firstTitle || "");
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.goBack();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("floating home action appears only for deeper product browsing and returns users home quickly", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("#product-detail-modal [data-product-detail-home]")).toHaveCount(0);

  await page.locator("#product-detail-modal .seller-product-card").first().click();
  const homeFab = page.locator("#product-detail-modal [data-product-detail-home]");
  await expect(homeFab).toBeVisible();

  await homeFab.click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("desktop product-detail home clears search context and returns to a clean home page", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await page.locator("#search-input").fill("Sneaker");
  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.locator("#product-detail-modal .seller-product-card").first().click();
  const homeFab = page.locator("#product-detail-modal [data-product-detail-home]");
  await expect(homeFab).toBeVisible();

  await homeFab.click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#search-input")).toHaveValue("");
  await expect(page.locator("#hero-panel")).toBeVisible();

  await context.close();
});

test("mobile product-detail home clears search context and returns to a clean home page", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 }
  });
  await page.goto("/");

  await page.locator("#search-toggle-button").click();
  await page.locator("#search-input").fill("Sneaker");
  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.locator("#product-detail-modal .seller-product-card").first().click();
  const homeFab = page.locator("#product-detail-modal [data-product-detail-home]");
  await expect(homeFab).toBeVisible();

  await homeFab.click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#search-input")).toHaveValue("");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("mobile header hides on downward scroll, reappears on upward scroll, and stays visible near the top", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 }
  });
  await page.goto("/");

  await expect(page.locator("#top-bar")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(false);

  await page.evaluate(() => window.scrollTo(0, 720));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 712));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(false);

  await page.evaluate(() => window.scrollTo(0, 24));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(false);
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("mobile header auto-hide does not reflow the feed container while users scroll", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 390, height: 844 }
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  const initialPaddingTop = await page.locator("#app-container").evaluate((element) => window.getComputedStyle(element).paddingTop);

  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(true);
  const hiddenPaddingTop = await page.locator("#app-container").evaluate((element) => window.getComputedStyle(element).paddingTop);

  await page.evaluate(() => window.scrollTo(0, 32));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(false);
  const restoredPaddingTop = await page.locator("#app-container").evaluate((element) => window.getComputedStyle(element).paddingTop);

  expect(hiddenPaddingTop).toBe(initialPaddingTop);
  expect(restoredPaddingTop).toBe(initialPaddingTop);

  await context.close();
});

test("desktop header remains stable and does not enter the mobile auto-hide state", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 1280, height: 900 }
  });
  await page.goto("/");

  await page.evaluate(() => window.scrollTo(0, 720));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(false);
  await expect(page.locator("#top-bar")).toBeVisible();

  await context.close();
});

test("vertical page scroll still works while the pointer is over showcase rows", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 1280, height: 900 }
  });
  await page.goto("/");

  const showcaseTrack = page.locator("#market-showcase .showcase-track");
  await expect(showcaseTrack).toBeVisible();
  const box = await showcaseTrack.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x || 0) + 40, (box?.y || 0) + 40);

  const initialY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialY);

  await context.close();
});

test("showcase rows still move horizontally when users drag across product cards", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 1280, height: 900 }
  });

  await page.goto("/");
  const track = page.locator("#market-showcase .showcase-track");
  await expect(track).toBeVisible();

  const initialScrollLeft = await track.evaluate((element) => element.scrollLeft);
  const box = await track.boundingBox();
  expect(box).not.toBeNull();

  const startX = box.x + (box.width * 0.82);
  const endX = box.x + (box.width * 0.22);
  const pointerY = box.y + Math.min(80, box.height / 2);

  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  await page.mouse.move(endX, pointerY + 2, { steps: 12 });
  await page.mouse.up();

  const finalScrollLeft = await track.evaluate((element) => element.scrollLeft);
  const movedBy = finalScrollLeft - initialScrollLeft;

  expect(movedBy).toBeGreaterThan(24);

  await context.close();
});

test("deeper showcase rows keep the same horizontal swipe behavior", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234", {
    viewport: { width: 1280, height: 900 }
  });

  await page.goto("/");
  await expect(page.locator(".showcase-inline .showcase-track").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const track = page.locator(".showcase-inline .showcase-track").last();
  await expect(track).toBeVisible();

  const initialScrollLeft = await track.evaluate((element) => element.scrollLeft);
  const box = await track.boundingBox();
  expect(box).not.toBeNull();

  const startX = box.x + (box.width * 0.8);
  const endX = box.x + (box.width * 0.24);
  const pointerY = box.y + Math.min(80, box.height / 2);

  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  await page.mouse.move(endX, pointerY + 2, { steps: 12 });
  await page.mouse.up();

  await expect.poll(async () => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialScrollLeft);

  await context.close();
});

test("marketplace cards keep verified copy out of compact card surfaces", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await expect(page.locator("#market-showcase")).not.toContainText("Muuzaji Aliyethibitishwa");
  await expect(page.locator("#products-container")).not.toContainText("Muuzaji Aliyethibitishwa");

  await context.close();
});

test("signed-in home keeps lower rows visible below the hero", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await expect(page.locator(".showcase-inline, [data-recommendation-type]").first()).toBeVisible();

  await context.close();
});

test("home feed keeps loading continuous discovery sections before users hit a hard end", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  await expect(page.locator("[data-continuous-discovery-anchor='home']")).toBeVisible();
  const initialCount = await page.locator("[data-continuous-discovery-section]").count();

  await page.locator("[data-continuous-discovery-anchor='home']").scrollIntoViewIfNeeded();
  await expect.poll(async () => page.locator("[data-continuous-discovery-section]").count()).toBeGreaterThan(initialCount);
  await page.waitForTimeout(500);
  await expect.poll(async () => page.locator("[data-continuous-discovery-section]").count()).toBeLessThanOrEqual(initialCount + 2);

  await context.close();
});

test("guest home keeps the classic feed without logged-in continuous discovery loading", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/");

  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await expect(page.locator("[data-continuous-discovery-anchor='home']")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await expect(page.locator("[data-continuous-discovery-section]")).toHaveCount(0);
});

test("seller-owned marketplace cards expose the three-dots delete menu on home", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234");
  await page.goto("/");

  const ownCardMenu = page.locator("[data-product-card='e2e-prod-1'] [data-menu-toggle='e2e-prod-1']").first();
  await expect(ownCardMenu).toBeVisible();
  await ownCardMenu.click();
  await expect(page.locator("[data-product-card='e2e-prod-1'] [data-menu-popup='e2e-prod-1']").first()).toContainText("Delete");
  const popupBox = await page.locator("[data-product-card='e2e-prod-1'] [data-menu-popup='e2e-prod-1']").first().boundingBox();
  const toggleBox = await ownCardMenu.boundingBox();
  expect(popupBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(popupBox.y).toBeGreaterThan(toggleBox.y);

  await context.close();
});

test("seller can delete an owned marketplace card from home via the three-dots menu", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234");
  await page.goto("/");

  page.once("dialog", (dialog) => dialog.accept());

  const card = page.locator("[data-product-card='e2e-prod-delete']").first();
  await expect(card).toBeVisible();
  await card.locator("[data-menu-toggle='e2e-prod-delete']").click();
  await card.locator("[data-menu-action='delete'][data-id='e2e-prod-delete']").evaluate((button) => {
    button.click();
  });
  await expect(card).toHaveCount(0);

  await context.close();
});

test("recommendation cards also support add-to-requests for seller-buyer sessions", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  const recommendationRequestButton = page.locator("[data-recommendation-type] [data-request-product]").first();
  await expect(recommendationRequestButton).toBeVisible();
  await recommendationRequestButton.click();
  await expect(recommendationRequestButton).toContainText("Added");

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel .request-group-card").first()).toBeVisible();

  await context.close();
});

test("buyer-side card buttons on the home feed still work for request and message flows", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  const feedRequestButton = page.locator("#products-container [data-request-product]").first();
  await expect(feedRequestButton).toBeVisible();
  await feedRequestButton.click();
  await expect(feedRequestButton).toContainText("Added");

  const feedChatButton = page.locator("#products-container [data-chat-product]").first();
  await expect(feedChatButton).toBeVisible();
  await feedChatButton.click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-modal .context-chat-close").click();
  await expect(page.locator("#context-chat-modal")).not.toBeVisible();

  await context.close();
});

test("buyer-side action buttons still work inside deeper product continuation cards", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  const continuationCard = page.locator("#product-detail-modal .seller-product-card").first();
  await expect(continuationCard).toBeVisible();

  const requestButton = continuationCard.locator("[data-request-product]").first();
  await expect(requestButton).toBeVisible();
  await requestButton.click();
  await expect(requestButton).toContainText("Added");

  const chatButton = continuationCard.locator("[data-chat-product]").first();
  await expect(chatButton).toBeVisible();
  await chatButton.click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-modal .context-chat-close").click();
  await expect(page.locator("#context-chat-modal")).not.toBeVisible();

  const originalTitle = await page.locator("#product-detail-title").textContent();
  const buyButton = continuationCard.locator("button[data-open-product]").first();
  await expect(buyButton).toBeVisible();
  await buyButton.click();
  await expect(page.locator("#product-detail-title")).not.toHaveText(originalTitle || "");

  await context.close();
});

test("product detail keeps same-seller continuation and broader discovery surfaces available", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const continuationSections = page.locator("#product-detail-modal .product-detail-seller-products");
  await expect(continuationSections.first()).toBeVisible();
  await expect(page.locator("#product-detail-modal .seller-product-card").first()).toBeVisible();
  await expect(page.locator("#product-detail-modal")).toContainText("Related Products");
  await expect(continuationSections).toHaveCount(2);

  await page.locator("#product-detail-modal .seller-product-card").first().click();
  await expect(page.locator("#product-detail-modal [data-product-detail-home]")).toBeVisible();
  await expect(page.locator("#product-detail-modal .seller-product-card").first()).toBeVisible();

  await context.close();
});

test("product detail keeps loading deeper discovery sections while users browse inside it", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("[data-product-detail-continuous-anchor='true']")).toBeVisible();

  const initialSections = await page.locator("#product-detail-modal .product-detail-seller-products").count();
  await page.locator("[data-product-detail-continuous-anchor='true']").scrollIntoViewIfNeeded();
  await expect.poll(async () => page.locator("#product-detail-modal .product-detail-seller-products").count()).toBeGreaterThan(initialSections);

  await context.close();
});

test("home feed multi-image posts show a compact preview grid with +more and open the full gallery", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/");

  const multiImageCard = page.locator("#products-container .product-card", { hasText: "Sneaker Classic" }).first();
  await expect(multiImageCard).toBeVisible();
  await expect(multiImageCard.locator(".feed-gallery-tile")).toHaveCount(3);
  await expect(multiImageCard.locator(".feed-gallery-more-badge")).toHaveText("+2");

  await multiImageCard.locator(".feed-gallery-tile").nth(2).click();
  await expect(page.locator("#image-lightbox")).toHaveClass(/open/);
  await expect(page.locator("#image-lightbox-title")).toContainText("(3/5)");
  await expect(page.locator("[data-image-lightbox-actions]")).toBeVisible();
  await page.locator(".image-lightbox-close").click();
  await expect(page.locator("#image-lightbox")).not.toHaveClass(/open/);
});

test("admin login route opens the admin surface without exposing admin in normal auth", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/#/admin-login");

  await expect(page.locator("#admin-login-container")).toBeVisible();
  await page.fill("#admin-login-identifier", "admin");
  await page.fill("#admin-login-password", "Admin1234");
  await page.click("#admin-login-button");

  await expect(page.locator("#admin-panel")).toBeVisible();
  await expect(page.locator("#admin-nav-item")).toBeVisible();
  await expect(page.locator("[data-header-menu-action='profile']")).toHaveCount(0);
});

test("tampered cached admin session is not trusted before backend restore completes", async ({ browser }) => {
  const context = await browser.newContext();
  await applyApiConfigOverride(context);
  await context.addInitScript(() => {
    window.localStorage.setItem("winga-current-user", JSON.stringify({
      username: "admin",
      fullName: "Winga Admin",
      role: "admin",
      token: "tampered-admin-token"
    }));
  });
  const page = await context.newPage();

  await page.goto("/#/admin-login");
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#admin-login-container")).toBeVisible();
  await expect(page.locator("#admin-login-copy")).toContainText("Session");

  await context.close();
});

test("logged in marketplace users are blocked from the admin route and returned safely home", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/#/admin-login");

  await expect(page.locator("#admin-login-container")).not.toBeVisible();
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("admin can approve pending products and the admin session survives refresh", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/#/admin-login");

  await page.fill("#admin-login-identifier", "admin");
  await page.fill("#admin-login-password", "Admin1234");
  await page.click("#admin-login-button");

  const pendingCard = page.locator("[data-admin-product-card='e2e-prod-pending']");
  await expect(pendingCard).toBeVisible();
  await pendingCard.locator("[data-admin-product-action='approved']").click();
  await expect(pendingCard).toHaveCount(0);

  await page.reload();
  await expect(page.locator("#admin-panel")).toBeVisible();
  await expect(page.locator("[data-admin-product-card='e2e-prod-pending']")).toHaveCount(0);
});

test("admin can open a reasoned fraud review from a user card", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/#/admin-login");

  await page.fill("#admin-login-identifier", "admin");
  await page.fill("#admin-login-password", "Admin1234");
  await page.click("#admin-login-button");

  const userCard = page.locator("[data-admin-investigate-username='buyer_seller']").first();
  await expect(userCard).toBeVisible();
  await userCard.click();

  const modal = page.locator("#admin-investigation-modal");
  await expect(modal).toBeVisible();
  await modal.locator("[data-admin-investigation-reason='true']").fill("Fraud review for suspicious account behavior.");
  await modal.locator("[data-admin-investigation-submit='buyer_seller']").click();

  await expect(modal).toContainText("Message Evidence Access");
  await expect(modal).toContainText("Direct private messages");
  await expect(modal).toContainText("Login & Account Activity");
});

test("stale admin session is blocked during moderation actions and the UI stays stable", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/#/admin-login");

  await page.fill("#admin-login-identifier", "admin");
  await page.fill("#admin-login-password", "Admin1234");
  await page.click("#admin-login-button");

  await expect(page.locator("#admin-panel")).toBeVisible();
  await page.evaluate(() => {
    const session = JSON.parse(window.localStorage.getItem("winga-current-user") || "null");
    if (!session) {
      return;
    }
    session.token = "invalid-admin-token";
    window.localStorage.setItem("winga-current-user", JSON.stringify(session));
  });

  const staleCard = page.locator("[data-admin-product-card='e2e-prod-pending-2']");
  await expect(staleCard).toBeVisible();
  await staleCard.locator("[data-admin-product-action='approved']").click();

  await expect(page.locator("#admin-login-container")).toBeVisible();
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#admin-login-copy")).toContainText("Session");
});

test("moderator can use the admin route but cannot see admin-only controls", async ({ page }) => {
  await applyApiConfigOverride(page);
  await page.goto("/#/admin-login");

  await page.fill("#admin-login-identifier", "moderator");
  await page.fill("#admin-login-password", "Moderator1234");
  await page.click("#admin-login-button");

  await expect(page.locator("#admin-panel")).toBeVisible();
  await expect(page.locator("[data-admin-promotion-disable]")).toHaveCount(0);
  await expect(page.locator("[data-admin-user-action='suspend']")).toHaveCount(0);
  await expect(page.locator("[data-admin-user-action='ban']")).toHaveCount(0);
  await expect(page.locator("[data-admin-investigate-username]")).toHaveCount(0);
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#view-home-back")).not.toBeVisible();
});
