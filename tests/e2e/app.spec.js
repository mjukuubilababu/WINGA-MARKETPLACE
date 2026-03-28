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
  await expect(page.locator("[data-recommendation-type]").first()).toBeVisible();
});

test("logged in seller-buyer can open detail, add to requests, and open chat", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234");
  await page.goto("/");

  const requestButton = page.locator("#products-container [data-request-product]").first();
  await requestButton.click();
  await expect(requestButton).toContainText("Added");

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.locator("#product-detail-modal [data-chat-product]").first().click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();

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
  await expect(page.locator("#user-products-container")).toContainText("Bei kwa maelewano");

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
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#view-home-back")).not.toBeVisible();
});
