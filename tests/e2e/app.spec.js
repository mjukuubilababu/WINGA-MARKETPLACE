const { test, expect, request: playwrightRequest } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = "http://127.0.0.1:43080/api";
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");
const tinyPngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=",
  "base64"
);
const detailContinuationCardSelector = "#product-detail-modal [data-product-detail-feed-stack] > .product-card[data-open-product]";

async function dragTrackHorizontally(page, track, options = {}) {
  await track.scrollIntoViewIfNeeded();
  const initialScrollLeft = await track.evaluate((element) => {
    element.scrollTo({ left: 0, behavior: "auto" });
    return element.scrollLeft;
  });
  const box = await track.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + (box.width * Number(options.startRatio || 0.82));
  const endX = box.x + (box.width * Number(options.endRatio || 0.18));
  const pointerY = box.y + Math.min(120, Math.max(48, box.height / 2));

  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  await page.mouse.move(endX, pointerY + 2, { steps: Number(options.steps || 14) });
  await page.mouse.up();
  await page.waitForTimeout(Number(options.waitMs || 300));

  return {
    initialScrollLeft,
    finalScrollLeft: await track.evaluate((element) => element.scrollLeft)
  };
}

async function applyApiConfigOverride(target) {
  await target.addInitScript((baseUrl) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {
      provider: "api",
      fallbackProvider: "api",
      apiBaseUrl: baseUrl
    };
  }, apiBaseUrl);
}

async function createAnonymousPage(browser, options = {}) {
  const context = await browser.newContext(options);
  await applyApiConfigOverride(context);
  const page = await context.newPage();
  return { context, page };
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
  await context.addInitScript((payload) => {
    window.localStorage.setItem("winga-current-user", JSON.stringify(payload));
  }, storedSession);
  const page = await context.newPage();
  return { context, page };
}

async function openHeaderMenuAction(page, action) {
  const trigger = page.locator("#header-user-trigger");
  const actionButton = page.locator(`[data-header-menu-action='${action}']`);
  await expect(trigger).toBeVisible();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await trigger.click({ timeout: 3000 });
      await expect(actionButton).toBeVisible({ timeout: 2000 });
      await actionButton.click({ timeout: 3000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(150);
    }
  }
  throw lastError || new Error(`Header action ${action} was not available.`);
}

test("app load renders marketplace feed, hero, images, and category navigation", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  await page.goto("/");
  await expect(page.locator("#products-container .product-card, #products-container .seller-product-card").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#products-container .product-card img").first()).toBeVisible();
  await expect(page.locator("#public-footer")).toBeVisible();

  const categoryButton = page.locator("#categories .cat-btn").nth(1);
  await categoryButton.click();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await expect(page.locator("#products-container")).toContainText("Dress Elegant");

  await context.close();
});

test("vertical feed image tiles open the product detail correctly", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .feed-gallery-tile").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("#product-detail-content")).toBeVisible();
  await expect(page.locator("#product-detail-title")).toBeVisible();

  await context.close();
});

test("product detail main gallery stays visible and swipeable with natural media height", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  const multiImageCard = page.locator("#products-container .product-card.has-gallery-count-badge").first();
  await expect(multiImageCard).toBeVisible();
  await multiImageCard.click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  const gallery = page.locator("#product-detail-modal .product-detail-media [data-feed-gallery-surface='detail']").first();
  await expect(gallery).toBeVisible();
  await expect(gallery.locator("img").first()).toBeVisible();

  const geometry = await gallery.evaluate((node) => {
    const image = node.querySelector("img");
    const track = node.querySelector("[data-feed-gallery-track]");
    const rect = node.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect?.();
    return {
      galleryWidth: Math.round(rect.width),
      galleryHeight: Math.round(rect.height),
      imageWidth: Math.round(imageRect?.width || 0),
      imageHeight: Math.round(imageRect?.height || 0),
      scrollWidth: Math.round(track?.scrollWidth || 0),
      clientWidth: Math.round(track?.clientWidth || 0),
      total: Number(node.getAttribute("data-feed-gallery-total") || 0),
      currentSrc: String(image?.currentSrc || image?.src || "").trim()
    };
  });
  expect(geometry.galleryWidth).toBeGreaterThan(300);
  expect(geometry.galleryHeight).toBeGreaterThan(240);
  expect(geometry.imageWidth).toBeGreaterThan(280);
  expect(geometry.imageHeight).toBeGreaterThan(200);
  expect(geometry.currentSrc).not.toBe("");
  expect(geometry.total).toBeGreaterThan(1);
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);

  const track = gallery.locator("[data-feed-gallery-track]");
  const beforeScrollLeft = await track.evaluate((node) => node.scrollLeft);
  await track.evaluate((node) => node.scrollBy({ left: node.clientWidth, behavior: "auto" }));
  await page.waitForTimeout(300);
  const afterScrollLeft = await track.evaluate((node) => node.scrollLeft);
  expect(afterScrollLeft).toBeGreaterThan(beforeScrollLeft);

  await track.evaluate((node) => {
    node.scrollTo({ left: 0, behavior: "auto" });
  });
  await page.waitForTimeout(120);
  const dragBox = await track.boundingBox();
  expect(dragBox).not.toBeNull();
  const startX = dragBox.x + (dragBox.width * 0.82);
  const endX = dragBox.x + (dragBox.width * 0.18);
  const pointerY = dragBox.y + Math.min(120, Math.max(48, dragBox.height / 2));

  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  await page.mouse.move(endX, pointerY + 2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const draggedScrollLeft = await track.evaluate((node) => node.scrollLeft);
  expect(draggedScrollLeft).toBeGreaterThan(24);

  await context.close();
});

test("desktop search handles broad intent and still opens the correct product detail", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#search-input").fill("shoe");
  await expect(page.locator("#search-dropdown")).toHaveClass(/open/);
  await expect(page.locator("[data-search-result]", { hasText: "Sneaker Classic" }).first()).toBeVisible();

  await page.locator("[data-search-result]", { hasText: "Sneaker Classic" }).first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("#product-detail-modal")).toContainText("Sneaker Classic");
  await page.locator("#product-detail-modal .product-detail-back").click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await context.close();
});

test("desktop search stays aligned with category filtering for broad keywords", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#categories .cat-btn[data-cat='viatu']").click();
  await page.locator("#search-input").fill("shoe");

  await expect(page.locator("#categories .cat-btn[data-cat='viatu']")).toHaveClass(/active/);
  await expect(page.locator("#products-container")).toContainText("Sneaker Classic");
  await context.close();
});

test("broken-image products disappear from public feed but remain visible to the owner profile", async ({ browser }) => {
  const { context: publicContext, page } = await createAnonymousPage(browser);
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#products-container .product-card", { hasText: "Broken Feed Listing" })).toHaveCount(0, {
    timeout: 30000
  });
  await publicContext.close();

  const { context, page: sellerPage } = await createLoggedInPage(browser, "market_seller", "Pass1234!Secure");
  await sellerPage.goto("/");
  await sellerPage.locator("#header-user-trigger").click();
  await sellerPage.locator("[data-header-menu-action='profile']").click();
  await expect(sellerPage.locator("#user-products-container")).toContainText("Broken Feed Listing");
  await context.close();
});

test("mobile category trigger opens sheet, drills into subcategories, and closes cleanly", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
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

test("mobile search handles broad intent without breaking home flow", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });

  await page.goto("/");
  await page.locator("#search-toggle-button").click();
  await page.locator("#search-input").fill("shoe");
  await expect(page.locator("#search-dropdown")).toHaveClass(/open/);
  await expect(page.locator("[data-search-result]", { hasText: "Sneaker Classic" }).first()).toBeVisible();

  await page.locator("[data-search-result]", { hasText: "Sneaker Classic" }).first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("#product-detail-modal")).toContainText("Sneaker Classic");

  await context.close();
});

test("closed mobile category sheet does not sit on top of the logged-in home feed", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
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

test("seller signup completes immediately after account creation without hanging in the auth UI", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  await page.goto("/");

  const uniqueSuffix = `${Date.now()}`.slice(-8);
  const username = `seller_${uniqueSuffix}`;
  const phoneNumber = `2557${uniqueSuffix}`;
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
  await expect(page.locator("#seller-identity-document-type")).toBeHidden();

  await page.locator("#username").fill(username);
  await page.locator("#phone-number").fill(phoneNumber);
  await page.locator("#password").fill("Pass1234!Secure");
  await page.locator("#confirm-password").fill("Pass1234!Secure");

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

  await context.close();
});

test("account recovery uses a one-time code and invalidates the old password", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  await page.goto("/");

  const uniqueSuffix = `${Date.now()}`.slice(-8);
  const username = `recover_${uniqueSuffix}`;
  const phoneNumber = `2556${uniqueSuffix}`;
  const originalPassword = "Pass1234!Secure";
  const recoveredPassword = "Recovered1234!Secure";

  await page.locator("#header-signup-button").click();
  await page.locator("#auth-role-buyer").click();
  await page.locator("#username").fill(username);
  await page.locator("#phone-number").fill(phoneNumber);
  await page.locator("#password").fill(originalPassword);
  await page.locator("#confirm-password").fill(originalPassword);
  await page.locator("#auth-button").click();
  await expect(page.locator("#header-user-trigger")).toBeVisible({ timeout: 15000 });

  await page.keyboard.press("Escape");
  await openHeaderMenuAction(page, "logout");
  await expect(page.locator("#header-login-button")).toBeVisible({ timeout: 10000 });

  await page.locator("#header-login-button").click();
  await page.locator("#username").fill(username);
  await page.locator("#forgot-password-link").click();
  await expect(page.locator("#auth-button")).toHaveText("Send Recovery Code");
  await expect(page.locator("#phone-number")).toBeHidden();
  await expect(page.locator("#national-id")).toBeHidden();

  await page.locator("#auth-button").click();
  await expect(page.locator("#auth-button")).toHaveText("Reset Password");
  await expect(page.locator("#national-id")).toBeVisible();
  await expect(page.locator("#national-id")).toHaveValue(/^\d{6}$/);
  await page.locator("#password").fill(recoveredPassword);
  await page.locator("#confirm-password").fill(recoveredPassword);
  await page.locator("#auth-button").click();
  await expect(page.locator("#auth-button")).toHaveText("Login");

  await page.locator("#password").fill(originalPassword);
  const oldPasswordResponse = page.waitForResponse((response) =>
    response.url().includes("/auth/login") && response.request().method() === "POST"
  );
  await page.locator("#auth-button").click();
  expect((await oldPasswordResponse).status()).toBe(401);
  await expect(page.locator("#auth-container")).toBeVisible();

  await page.locator("#password").fill(recoveredPassword);
  await page.locator("#auth-button").click();
  await expect(page.locator("#header-user-trigger")).toBeVisible({ timeout: 15000 });

  await context.close();
});

test("logged in seller-buyer can open detail and open chat", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("#products-container [data-request-product]")).toHaveCount(0);

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
  await expect(page.locator("#profile-request-box-panel")).toContainText("Hakuna bidhaa kwenye My Requests bado");
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#profile-request-box-panel")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("mobile profile messages use a clear conversation list and detail flow", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await page.goto("/");

  await page.locator("#products-container .product-card", { hasText: "Sneaker Classic" }).first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await page.locator("#product-detail-modal [data-chat-product]").first().click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-compose-input").fill("Naweza kuona chat kwa profile?");
  await page.locator("#context-chat-compose-form button[type='submit']").click();
  await expect(page.locator("#context-chat-modal .message-bubble").last()).toContainText("Naweza kuona chat kwa profile?");
  await page.locator("#context-chat-modal .context-chat-close").click();
  await page.locator("#product-detail-modal .product-detail-back").click();

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await page.locator("[data-profile-action='messages']").click();
  await expect(page.locator("#profile-messages-panel")).toBeVisible();

  const firstConversation = page.locator("#profile-messages-panel .message-thread-item").first();
  await expect(firstConversation).toBeVisible();
  await firstConversation.click();

  await expect(page.locator("#profile-messages-panel .message-list-back")).toBeVisible();
  await expect(page.locator("#profile-messages-panel .messages-thread-card")).toContainText("Naweza kuona chat kwa profile?");

  await page.locator("#profile-messages-panel .message-list-back").click();
  await expect(page.locator("#profile-messages-panel .message-thread-item").first()).toBeVisible();

  await context.close();
});

test("profile inbox groups repeated messages from the same seller into one thread", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  const firstThreadMessage = `Thread test first ${Date.now()}`;
  const secondThreadMessage = `Thread test second ${Date.now()}`;

  await page.goto("/");

  const sellerCards = page.locator("#products-container .product-card", { hasText: "Market Seller Shop" });
  await expect(sellerCards.nth(1)).toBeVisible();

  await sellerCards.first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await page.locator("#product-detail-modal [data-chat-product]").first().click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-compose-input").fill(firstThreadMessage);
  await page.locator("#context-chat-compose-form button[type='submit']").click();
  await expect(page.locator("#context-chat-modal .message-bubble").last()).toContainText(firstThreadMessage);
  await page.locator("#context-chat-modal .context-chat-close").click();
  await page.locator("#product-detail-modal .product-detail-back").click();

  await sellerCards.nth(1).click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await page.locator("#product-detail-modal [data-chat-product]").first().click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-compose-input").fill(secondThreadMessage);
  await page.locator("#context-chat-compose-form button[type='submit']").click();
  await expect(page.locator("#context-chat-modal .message-bubble").last()).toContainText(secondThreadMessage);
  await page.locator("#context-chat-modal .context-chat-close").click();
  await page.locator("#product-detail-modal .product-detail-back").click();

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await page.locator("[data-profile-action='messages']").click();
  await expect(page.locator("#profile-messages-panel")).toBeVisible();

  const sellerThread = page.locator("#profile-messages-panel .message-thread-item", { hasText: "Market Seller Shop" });
  await expect(sellerThread).toHaveCount(1);
  await expect(sellerThread.first()).toContainText(secondThreadMessage);
  await sellerThread.first().click();

  const threadCard = page.locator("#profile-messages-panel .messages-thread-card");
  await expect(threadCard).toContainText(firstThreadMessage);
  await expect(threadCard).toContainText(secondThreadMessage);

  await context.close();
});

test("product cards no longer render request action after reload for seller-buyer sessions", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("#products-container [data-request-product]")).toHaveCount(0);

  await page.reload();
  await expect(page.locator("#products-container [data-request-product]")).toHaveCount(0);

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel")).toBeVisible();
  await expect(page.locator("#profile-request-box-panel")).toContainText("Hakuna bidhaa kwenye My Requests bado");

  await context.close();
});

test("request box stays empty when the request action is removed from cards", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("#products-container [data-request-product]")).toHaveCount(0);

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel")).toContainText("Hakuna bidhaa kwenye My Requests bado");

  await context.close();
});

test("buyer-only sessions do not show the bottom footer nav and can still reach profile from the header menu", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_only", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("#bottom-nav")).not.toBeVisible();
  await expect(page.locator("#post-product-fab")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await openHeaderMenuAction(page, "profile");
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  await expect(page.locator("#view-home-back")).toBeVisible();
  await page.locator("#view-home-back").click();
  await expect(page.locator("#hero-panel")).not.toBeVisible();

  await context.close();
});

test("buyer-only profile photo upload stays stable and updates the profile avatar", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_only", "Pass1234!Secure");
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
  const nextWhatsappNumber = `2557${String(Date.now()).slice(-8)}`;
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await openHeaderMenuAction(page, "profile");
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  await expect(page.locator("#profile-whatsapp-block")).toContainText(/WhatsApp:\s*\d{10,15}/);

  const profileUpdatePromise = page.waitForResponse((response) =>
    response.url().includes("/users/me/profile") && response.request().method() === "PATCH"
  );

  await page.locator("#profile-whatsapp-change-toggle").click();
  await expect(page.locator("#profile-whatsapp-change-form")).toBeVisible();
  await page.locator("#profile-whatsapp-input").fill(nextWhatsappNumber);
  await expect(page.locator("#profile-whatsapp-save-button")).toBeVisible();
  await page.locator("#profile-whatsapp-save-button").dispatchEvent("click");
  await profileUpdatePromise;

  await expect(page.locator("#profile-whatsapp-block")).toContainText(nextWhatsappNumber);
  await expect(page.locator("#profile-whatsapp-block")).toContainText("Active");

  await page.reload();
  await openHeaderMenuAction(page, "profile");
  await expect(page.locator("#profile-identity-card")).toBeVisible();
  await expect(page.locator("#profile-whatsapp-block")).toContainText(nextWhatsappNumber);
  await expect(page.locator("#profile-whatsapp-block")).toContainText("Active");

  await page.locator("#view-home-back").click();
  await page.locator("#post-product-fab").click();
  await expect(page.locator("#product-whatsapp")).toHaveValue(nextWhatsappNumber);

  await context.close();
});

test("seller-capable home feed hides the normal footer nav and shows the floating post action", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
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
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("#products-container .product-card", { hasText: "Bag Travel Pro" }).first()).toBeVisible();

  await context.close();
});

test("logged in sellers can scroll the home feed and still see marketplace rows", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  await page.goto("/");

  await expect(page.locator("#hero-panel")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await expect(page.locator("#products-container")).toContainText("Market Seller Shop");

  const initialY = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialY);

  await context.close();
});

test("seller can post without price and sees negotiation fallback in product management", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
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
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await page.reload();

  await expect(page.locator("#header-user-trigger")).toBeVisible();
  await page.locator("#products-container .product-card").nth(1).click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const originalTitle = await page.locator("#product-detail-title").textContent();
  const sellerCard = page.locator("#product-detail-modal [data-product-detail-feed-stack] [data-open-product]").first();
  await expect(sellerCard).toBeVisible();
  await expect(page.locator("#product-detail-modal [data-request-product]")).toHaveCount(0);
  await sellerCard.click();
  await expect(page.locator("#product-detail-title")).not.toHaveText(originalTitle || "");
  await page.locator("#product-detail-modal .product-detail-back").click();
  await expect(page.locator("#product-detail-title")).toHaveText(originalTitle || "");

  await context.close();
});

test("stale session restore falls back to auth instead of hanging the app boot", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript((baseUrl, payload) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {
      provider: "api",
      fallbackProvider: "api",
      apiBaseUrl: baseUrl,
      sessionRestoreTimeoutMs: 1200
    };
    window.localStorage.setItem("winga-current-user", JSON.stringify(payload));
  }, apiBaseUrl, {
    username: "stale-user",
    fullName: "Stale User",
    role: "seller",
    token: "stale-token"
  });
  const page = await context.newPage();
  await page.route(`${apiBaseUrl}/auth/session`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Session expired" })
    });
  });

  await page.goto("/");
  await expect(page.locator("#header-user-trigger")).not.toBeVisible();
  await expect(page.locator("#header-login-button")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Tunaangalia session yako...")).toBeHidden({ timeout: 10000 });

  await context.close();
});

test("refresh while authenticated keeps in-app header and does not show public auth buttons", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await page.reload();
  await expect(page.locator("#header-user-trigger")).toBeVisible();
  await expect(page.locator("#header-login-button")).toBeHidden();
  await expect(page.locator("#header-signup-button")).toBeHidden();
  await expect(page.locator("#search-box")).toBeVisible();

  await context.close();
});

test("browser back from the first product detail returns to the in-app feed without leaving the app shell", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
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
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const firstTitle = await page.locator("#product-detail-title").textContent();

  await page.locator(detailContinuationCardSelector).first().click();
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
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator("#product-detail-modal [data-product-detail-home]")).toHaveCount(0);

  await page.locator(detailContinuationCardSelector).first().click();
  const homeFab = page.locator("#product-detail-modal [data-product-detail-home]");
  await expect(homeFab).toBeVisible();

  await homeFab.click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("desktop product-detail home clears search context and returns to a clean home page", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await page.locator("#search-input").fill("Sneaker");
  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  const preferredNextCard = page.locator("#product-detail-modal [data-open-product='e2e-prod-delete']").first();
  if (await preferredNextCard.count()) {
    await preferredNextCard.click({ force: true });
  } else {
    const activeProductId = await page.locator("#product-detail-modal .product-detail-image").getAttribute("data-image-action-product");
    const nextProductIndex = await page.locator("#product-detail-modal [data-open-product]").evaluateAll((cards, currentId) => {
      return cards.findIndex((card) => (card.getAttribute("data-open-product") || "") !== currentId);
    }, activeProductId || "");
    await page.locator("#product-detail-modal [data-open-product]").nth(nextProductIndex >= 0 ? nextProductIndex : 0).click({ force: true });
  }
  const homeFab = page.locator("#product-detail-modal [data-product-detail-home]");
  await expect(homeFab).toBeVisible();

  await homeFab.click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#search-input")).toHaveValue("");
  await expect(page.locator("#hero-panel")).not.toBeVisible();

  await context.close();
});

test("mobile product-detail home clears search context and returns to a clean home page", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 }
  });
  await page.goto("/");

  await page.locator("#search-toggle-button").click();
  await page.locator("#search-input").fill("Sneaker");
  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  const preferredNextCard = page.locator("#product-detail-modal [data-open-product='e2e-prod-delete']").first();
  if (await preferredNextCard.count()) {
    await preferredNextCard.click({ force: true });
  } else {
    const activeProductId = await page.locator("#product-detail-modal .product-detail-image").getAttribute("data-image-action-product");
    const nextProductIndex = await page.locator("#product-detail-modal [data-open-product]").evaluateAll((cards, currentId) => {
      return cards.findIndex((card) => (card.getAttribute("data-open-product") || "") !== currentId);
    }, activeProductId || "");
    await page.locator("#product-detail-modal [data-open-product]").nth(nextProductIndex >= 0 ? nextProductIndex : 0).click({ force: true });
  }
  const homeFab = page.locator("#product-detail-modal [data-product-detail-home]");
  if (await homeFab.count()) {
    await expect(homeFab).toBeVisible();
    await homeFab.click();
  } else {
    await page.locator("#product-detail-modal .product-detail-back").click();
    if (await page.locator("#product-detail-modal").isVisible()) {
      await page.locator("#product-detail-modal .product-detail-back").click();
    }
  }
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(page.locator("#search-input")).toHaveValue("");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("mobile header hides on downward scroll, reappears on upward scroll, and stays visible near the top", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
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
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
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
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 1280, height: 900 }
  });
  await page.goto("/");

  await page.evaluate(() => window.scrollTo(0, 720));
  await expect.poll(async () => page.evaluate(() => document.body.classList.contains("mobile-header-hidden"))).toBe(false);
  await expect(page.locator("#top-bar")).toBeVisible();

  await context.close();
});

test("vertical page scroll still works while the pointer is over horizontal media", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 1280, height: 900 }
  });
  await page.goto("/");

  const horizontalTrack = page.locator("#market-showcase .showcase-track, #products-container [data-feed-gallery-track]").first();
  await expect(horizontalTrack).toBeVisible();
  const box = await horizontalTrack.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x || 0) + 40, (box?.y || 0) + 40);

  const initialY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialY);

  await context.close();
});

test("home feed galleries still move horizontally when users drag across product cards", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  const track = page.locator("#products-container .product-card.has-gallery-count-badge [data-feed-gallery-track]").first();
  await expect(track).toBeVisible();

  const { initialScrollLeft, finalScrollLeft } = await dragTrackHorizontally(page, track);
  expect(finalScrollLeft - initialScrollLeft).toBeGreaterThan(24);

  await context.close();
});

test("product detail continuation feed galleries keep the same horizontal swipe behavior", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await expect(page.locator(detailContinuationCardSelector).first()).toBeVisible();
  const trackCount = await page.locator("#product-detail-modal [data-product-detail-feed-stack] > .product-card [data-feed-gallery-track]").count();
  expect(trackCount).toBeGreaterThan(0);
  const scrollableIndex = await page.locator("#product-detail-modal [data-product-detail-feed-stack] > .product-card [data-feed-gallery-track]").evaluateAll((tracks) =>
    tracks.findIndex((track) => track.scrollWidth > track.clientWidth + 12)
  );
  if (scrollableIndex >= 0) {
    const track = page.locator("#product-detail-modal [data-product-detail-feed-stack] > .product-card [data-feed-gallery-track]").nth(scrollableIndex);
    await expect(track).toBeVisible();
    const { initialScrollLeft, finalScrollLeft } = await dragTrackHorizontally(page, track, {
      startRatio: 0.8,
      endRatio: 0.24,
      steps: 12
    });
    expect(finalScrollLeft).toBeGreaterThan(initialScrollLeft);
  }

  await context.close();
});

test("mobile home feed galleries respond to touch-sized horizontal drags", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });

  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  const track = page.locator("#products-container .product-card.has-gallery-count-badge [data-feed-gallery-track]").first();
  await expect(track).toBeVisible();

  const { initialScrollLeft, finalScrollLeft } = await dragTrackHorizontally(page, track, {
    startRatio: 0.82,
    endRatio: 0.16,
    steps: 14
  });
  expect(finalScrollLeft - initialScrollLeft).toBeGreaterThan(40);

  await context.close();
});

test("seller sees message, WhatsApp, and repost actions on other sellers products but not on their own products", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234!Secure");
  await page.goto("/");

  const ownCard = page.locator("#products-container .product-card").filter({ hasText: "Shirt Premium" }).first();
  const otherCard = page.locator("#products-container .product-card").filter({ hasText: "Phone Smart X" }).first();

  await expect(ownCard).toBeVisible();
  await expect(otherCard).toBeVisible();

  await expect(ownCard).not.toContainText("Nunua");
  await expect(ownCard).not.toContainText("My Request");
  await expect(ownCard).toContainText("Message");
  await expect(ownCard).toContainText("Uza");
  await expect(ownCard).toContainText("WhatsApp");

  await expect(otherCard).toContainText("Message");
  await expect(otherCard).toContainText("WhatsApp");
  await expect(otherCard).toContainText("Uza");
  await expect(otherCard).not.toContainText("Nunua");
  await expect(otherCard).not.toContainText("My Request");

  await context.close();
});

test("marketplace cards keep verified copy out of compact card surfaces", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("#market-showcase")).not.toContainText("Muuzaji Aliyethibitishwa");
  await expect(page.locator("#products-container")).not.toContainText("Muuzaji Aliyethibitishwa");

  await context.close();
});

test("signed-in home keeps lower rows visible without the hero", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator(".showcase-inline, [data-recommendation-type]").first()).toBeVisible();

  await context.close();
});

test("home feed keeps loading continuous discovery sections before users hit a hard end", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await expect(page.locator("[data-continuous-discovery-anchor='home']")).toBeVisible();
  const getContinuousGroupCount = () => page.evaluate(() => {
    const groupKeys = new Set();
    document.querySelectorAll("[data-continuous-discovery-section], [data-continuous-discovery-stream]").forEach((node) => {
      const key = node.getAttribute("data-continuous-discovery-section")
        || node.getAttribute("data-continuous-discovery-stream")
        || "";
      if (key) {
        groupKeys.add(key);
      }
    });
    return groupKeys.size;
  });
  const initialCount = await getContinuousGroupCount();

  await page.evaluate(() => {
    const anchor = document.querySelector("[data-continuous-discovery-anchor='home']");
    anchor?.scrollIntoView({ block: "center", behavior: "auto" });
  });
  await expect.poll(getContinuousGroupCount).toBeGreaterThan(initialCount);
  await page.waitForTimeout(500);
  await expect.poll(getContinuousGroupCount).toBeLessThanOrEqual(initialCount + 2);

  await context.close();
});

test("guest home renders the marketplace feed and keeps discovery loading stable", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  await page.goto("/");

  const feedCards = page.locator("#products-container .product-card, #products-container .seller-product-card");
  await expect(feedCards.first()).toBeVisible({ timeout: 30000 });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await expect(feedCards.first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => feedCards.count()).toBeGreaterThan(0);

  await context.close();
});

test("mobile home product media remains edge to edge", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#products-container .product-card-media img, #products-container .seller-product-card-media img").first()).toBeVisible({ timeout: 30000 });

  const geometry = await page.evaluate(() => {
    const card = document.querySelector("#products-container > .product-card, #products-container > .seller-product-card");
    const media = card?.querySelector(".product-card-media, .seller-product-card-media");
    const image = media?.querySelector("img");
    const read = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, width: rect.width } : null;
    };
    return {
      innerWidth: window.innerWidth,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
      card: read(card),
      media: read(media),
      image: read(image),
      mediaSurfaces: Array.from(document.querySelectorAll("#products-container > .product-card, #products-container > .seller-product-card"))
        .slice(0, 6)
        .map((cardNode) => {
          const cardRect = cardNode.getBoundingClientRect();
          const mediaNode = cardNode.querySelector(".product-card-media, .seller-product-card-media");
          const mediaRect = mediaNode?.getBoundingClientRect();
          const imageNode = mediaNode?.querySelector("img");
          const imageRect = imageNode?.getBoundingClientRect();
          return {
            cardLeft: Math.round(cardRect.left),
            cardRight: Math.round(cardRect.right),
            mediaLeft: mediaRect ? Math.round(mediaRect.left) : null,
            mediaRight: mediaRect ? Math.round(mediaRect.right) : null,
            imageLeft: imageRect ? Math.round(imageRect.left) : null,
            imageRight: imageRect ? Math.round(imageRect.right) : null,
            imageWidth: imageRect ? Math.round(imageRect.width) : 0
          };
        }),
      overflowingElements: Array.from(document.querySelectorAll("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id || "",
            className: typeof element.className === "string" ? element.className : "",
            left: rect.left,
            right: rect.right,
            width: rect.width
          };
        })
        .filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1)
        .slice(0, 12)
    };
  });

  expect(geometry.card.left).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.card.right - geometry.viewportWidth)).toBeLessThanOrEqual(1);
  expect(geometry.media.left).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.media.right - geometry.viewportWidth)).toBeLessThanOrEqual(1);
  expect(geometry.image.width).toBeGreaterThanOrEqual(geometry.viewportWidth - 1);
  expect(geometry.scrollbarWidth).toBe(0);
  expect(geometry.bodyOverflowY).not.toBe("hidden");
  for (const surface of geometry.mediaSurfaces) {
    expect(surface.cardLeft).toBeLessThanOrEqual(1);
    expect(Math.abs(surface.cardRight - geometry.viewportWidth)).toBeLessThanOrEqual(1);
    expect(surface.mediaLeft).toBeLessThanOrEqual(1);
    expect(Math.abs(surface.mediaRight - geometry.viewportWidth)).toBeLessThanOrEqual(1);
    expect(surface.imageWidth).toBeGreaterThanOrEqual(geometry.viewportWidth - 1);
  }
  expect(
    geometry.scrollWidth,
    `Horizontal overflow: ${JSON.stringify(geometry.overflowingElements)}`
  ).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await context.close();
});

test("installed PWA home media ignores legacy standalone padding", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  const geometry = await page.evaluate(() => {
    const container = document.querySelector("#products-container");
    document.body.dataset.layoutMode = "standalone-mobile";
    container.dataset.layoutMode = "standalone-mobile";
    const card = container.querySelector(":scope > .product-card, :scope > .seller-product-card");
    const media = card?.querySelector(".product-card-media, .seller-product-card-media");
    const image = media?.querySelector("img");
    const read = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, width: rect.width } : null;
    };
    return {
      viewportWidth: document.documentElement.clientWidth,
      container: read(container),
      card: read(card),
      media: read(media),
      image: read(image)
    };
  });

  for (const surface of ["container", "card", "media", "image"]) {
    expect(geometry[surface].left).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry[surface].right - geometry.viewportWidth)).toBeLessThanOrEqual(1);
  }

  await context.close();
});

test("seller-owned marketplace cards expose the three-dots delete menu on home", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234!Secure");
  await page.goto("/");

  const ownCard = page.locator("#products-container .product-card").filter({ hasText: "Shirt Premium" }).first();
  await expect(ownCard).toBeVisible();
  const ownCardMenu = ownCard.locator("[data-menu-toggle]").first();
  await expect(ownCardMenu).toBeVisible();
  await ownCardMenu.click();
  await expect(ownCard.locator("[data-menu-popup]").first()).toContainText("Delete");
  const popupBox = await ownCard.locator("[data-menu-popup]").first().boundingBox();
  const toggleBox = await ownCardMenu.boundingBox();
  expect(popupBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(popupBox.y).toBeGreaterThan(toggleBox.y);

  await context.close();
});

test("seller can delete an owned marketplace card from home via the three-dots menu", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "market_seller", "Pass1234!Secure");
  await page.goto("/");

  page.once("dialog", (dialog) => dialog.accept());

  await page.locator("#search-input").fill("Delete Me Listing");
  const card = page.locator("[data-product-card='e2e-prod-delete']").first();
  await expect(card).toBeVisible();
  await card.locator("[data-menu-toggle='e2e-prod-delete']").click();
  await card.locator("[data-menu-action='delete'][data-id='e2e-prod-delete']").evaluate((button) => {
    button.click();
  });
  await expect(card).toHaveCount(0);

  await context.close();
});

test("recommendation cards keep the buyer action layout compact and consistent", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  const recommendationCard = page.locator("[data-recommendation-type] .product-card").first();
  await expect(recommendationCard).toBeVisible();
  await expect(recommendationCard).not.toContainText("Nunua");
  await expect(recommendationCard).not.toContainText("My Request");
  await expect(recommendationCard).toContainText("Message");
  await expect(recommendationCard).toContainText("WhatsApp");

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-request-box-panel")).toContainText("Hakuna bidhaa kwenye My Requests bado");

  await context.close();
});

test("buyer-side card buttons on the home feed keep equal-width message and WhatsApp actions", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  const feedCard = page.locator("#products-container .product-card").first();
  await expect(feedCard).toBeVisible();
  await expect(feedCard).not.toContainText("Nunua");
  await expect(feedCard).not.toContainText("My Request");
  await expect(feedCard).toContainText("Message");
  await expect(feedCard).toContainText("WhatsApp");

  const feedChatButton = page.locator("#products-container [data-chat-product]").first();
  await expect(feedChatButton).toBeVisible();
  await feedChatButton.click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-modal .context-chat-close").click();
  await expect(page.locator("#context-chat-modal")).not.toBeVisible();

  await context.close();
});

test("buyer-side action buttons stay compact and consistent inside deeper product continuation cards", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  const continuationCard = page.locator(detailContinuationCardSelector).first();
  await expect(continuationCard).toBeVisible();

  await expect(continuationCard).not.toContainText("Nunua");
  await expect(continuationCard).not.toContainText("My Request");
  await expect(continuationCard).toContainText("Message");
  await expect(continuationCard).toContainText("WhatsApp");

  const chatButton = continuationCard.locator("[data-chat-product]").first();
  await expect(chatButton).toBeVisible();
  await chatButton.click();
  await expect(page.locator("#context-chat-modal")).toBeVisible();
  await page.locator("#context-chat-modal .context-chat-close").click();
  await expect(page.locator("#context-chat-modal")).not.toBeVisible();

  const originalTitle = await page.locator("#product-detail-title").textContent();
  await continuationCard.click();
  await expect(page.locator("#product-detail-title")).not.toHaveText(originalTitle || "");

  await context.close();
});

test("seller profile and product detail show clean trust indicators", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");

  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  const trustBlock = page.locator("#profile-identity-card .profile-trust-block");
  await expect(trustBlock).toBeVisible();
  await expect(trustBlock).toContainText("Trust profile");
  await expect(trustBlock).toContainText(/Member since|Verified seller|WhatsApp verified/);

  await page.locator("#view-home-back").click();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();
  await page.locator("#products-container .product-card").first().click();
  const detailTrustPanel = page.locator("#product-detail-modal .seller-trust-panel");
  await expect(detailTrustPanel).toBeVisible();
  await expect(detailTrustPanel).toContainText("Trust & Safety");
  await expect(detailTrustPanel).toContainText(/Member since|seller rating|Verified Seller|temporarily unavailable/);

  await context.close();
});

test("buyer can report a product from the trust panel without breaking browsing flow", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_only", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await page.locator("#product-detail-modal [data-report-product]").first().click();
  const modal = page.locator("#trust-report-modal");
  await expect(modal).toBeVisible();
  await modal.locator("[data-trust-report-reason='wrong_photos']").click();
  await modal.locator("#trust-report-description").fill("Photos and details do not match what a buyer would expect.");
  await modal.locator("[data-submit-trust-report='true']").click();

  await expect(page.locator("#notification-toast-root")).toContainText("Report submitted");
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  await context.close();
});

test("product detail keeps same-seller continuation and broader discovery surfaces available", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const continuationSections = page.locator("#product-detail-modal .product-detail-seller-products");
  await expect(continuationSections.first()).toBeVisible();
  await expect(page.locator("#product-detail-modal [data-product-detail-feed-stack]").first()).toBeVisible();
  await expect(page.locator(detailContinuationCardSelector).first()).toBeVisible();
  await expect(page.locator("#product-detail-modal")).toContainText("Related Products");
  await expect(continuationSections).toHaveCount(2);

  await page.locator(detailContinuationCardSelector).first().click();
  await expect(page.locator("#product-detail-modal [data-product-detail-home]")).toBeVisible();
  await expect(page.locator(detailContinuationCardSelector).first()).toBeVisible();

  await context.close();
});

test("product detail continuation keeps deeper feed cards stable while scrolling inside the modal", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  const modal = page.locator("#product-detail-modal");
  await expect(modal).toBeVisible();
  await expect(page.locator(detailContinuationCardSelector).first()).toBeVisible();

  const initialIds = await page.locator(detailContinuationCardSelector).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-open-product")).filter(Boolean)
  );
  expect(initialIds.length).toBeGreaterThan(0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await modal.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
    });
    await page.waitForTimeout(350);
  }

  await expect.poll(async () => page.locator(detailContinuationCardSelector).count(), {
    timeout: 10000
  }).toBeGreaterThanOrEqual(initialIds.length);

  const finalIds = await page.locator(detailContinuationCardSelector).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-open-product")).filter(Boolean)
  );
  expect(new Set(finalIds).size).toBe(finalIds.length);
  expect(finalIds.length).toBeGreaterThanOrEqual(initialIds.length);
  expect(finalIds.slice(0, initialIds.length)).toEqual(initialIds);

  await context.close();
});

test("product detail continuation rows use the same feed-stack architecture as home rows", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();

  const stacks = page.locator("#product-detail-modal [data-product-detail-feed-stack]");
  const stackCount = await stacks.count();
  expect(stackCount).toBeGreaterThan(0);
  for (let index = 0; index < stackCount; index += 1) {
    const stack = stacks.nth(index);
    await expect(stack).toBeVisible();
    await expect(stack.locator("[data-open-product]").first()).toBeVisible();
  }

  await context.close();
});

test("product detail keeps loading deeper discovery sections while users browse inside it", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
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

test("home feed multi-image posts preserve every swipe slide and open the full gallery", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_only", "Pass1234!Secure");
  await page.goto("/");

  const multiImageCard = page.locator("#products-container .product-card", { hasText: "Sneaker Classic" }).first();
  await expect(multiImageCard).toBeVisible();
  await expect(multiImageCard.locator(".feed-gallery-tile")).toHaveCount(5);

  await multiImageCard.click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const detailGallery = page.locator("#product-detail-modal [data-feed-gallery-surface='detail']").first();
  await expect(detailGallery).toBeVisible();
  await expect(detailGallery).toHaveAttribute("data-feed-gallery-total", "5");
  await expect(detailGallery.locator("img")).toHaveCount(5);

  await context.close();
});

test("product detail continuation feed cards keep visible media after feed-fit hardening", async ({ browser }) => {
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  await page.locator("#products-container .product-card").first().click();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  const firstMedia = page.locator("#product-detail-modal [data-product-detail-feed-stack] > .product-card .product-card-media").first();
  await expect(firstMedia).toBeVisible();
  await expect(firstMedia.locator("img").first()).toBeVisible();
  await expect.poll(async () => firstMedia.evaluate((media) => {
    const image = media.querySelector("img");
    const mediaRect = media.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect?.();
    return {
      mediaWidth: Math.round(mediaRect.width),
      mediaHeight: Math.round(mediaRect.height),
      imageWidth: Math.round(imageRect?.width || 0),
      imageHeight: Math.round(imageRect?.height || 0),
      currentSrc: String(image?.currentSrc || image?.src || "").trim()
    };
  }), {
    timeout: 10000
  }).toMatchObject({
    mediaWidth: expect.any(Number),
    mediaHeight: expect.any(Number),
    imageWidth: expect.any(Number),
    imageHeight: expect.any(Number)
  });
  const geometry = await firstMedia.evaluate((media) => {
    const image = media.querySelector("img");
    const mediaRect = media.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect?.();
    return {
      mediaWidth: Math.round(mediaRect.width),
      mediaHeight: Math.round(mediaRect.height),
      imageWidth: Math.round(imageRect?.width || 0),
      imageHeight: Math.round(imageRect?.height || 0),
      currentSrc: String(image?.currentSrc || image?.src || "").trim()
    };
  });
  expect(geometry.mediaWidth).toBeGreaterThan(300);
  expect(geometry.mediaHeight).toBeGreaterThan(240);
  expect(geometry.imageWidth).toBeGreaterThan(280);
  expect(geometry.imageHeight).toBeGreaterThan(200);
  expect(geometry.currentSrc).not.toBe("");

  await context.close();
});

test("admin login route opens the admin surface without exposing admin in normal auth", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  await page.goto("/#/admin-login");

  await expect(page.locator("#admin-login-container")).toBeVisible();
  await page.fill("#admin-login-identifier", "admin");
  await page.fill("#admin-login-password", "Admin1234");
  await page.click("#admin-login-button");

  await expect(page.locator("#admin-panel")).toBeVisible();
  await expect(page.locator("#admin-nav-item")).toBeVisible();
  await expect(page.locator("[data-header-menu-action='profile']")).toHaveCount(0);

  await context.close();
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
  const { context, page } = await createLoggedInPage(browser, "buyer_seller", "Pass1234!Secure");
  await page.goto("/#/admin-login");

  await expect(page.locator("#admin-login-container")).not.toBeVisible();
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#products-container .product-card").first()).toBeVisible();

  await context.close();
});

test("admin can approve pending products and the admin session survives refresh", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
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

  await context.close();
});

test("admin can open a reasoned fraud review from a user card", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
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

  await context.close();
});

test("stale admin session is blocked during moderation actions and the UI stays stable", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  await page.goto("/#/admin-login");

  await page.fill("#admin-login-identifier", "admin");
  await page.fill("#admin-login-password", "Admin1234");
  await page.click("#admin-login-button");

  await expect(page.locator("#admin-panel")).toBeVisible();
  await page.route("**/api/admin/products/*/moderate", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Session imeisha au si sahihi." })
    });
  });

  const staleCard = page.locator("[data-admin-product-card='e2e-prod-pending-2']");
  await expect(staleCard).toBeVisible();
  await staleCard.locator("[data-admin-product-action='approved']").dispatchEvent("click");

  await expect(page.locator("#admin-login-container")).toBeVisible();
  await expect(page.locator("#admin-panel")).not.toBeVisible();
  await expect(page.locator("#admin-login-copy")).toContainText("Session");

  await context.close();
});

test("moderator can use the admin route but cannot see admin-only controls", async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
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

  await context.close();
});
