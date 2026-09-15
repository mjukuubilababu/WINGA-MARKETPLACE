const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = "http://127.0.0.1:43080/api";

async function createSellerPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block"
  });
  const { authCookie, ...session } = JSON.parse(
    fs.readFileSync(path.join(__dirname, ".seed-sessions.json"), "utf8")
  ).buyer_seller;
  await context.addCookies([{
    name: "winga_auth",
    value: authCookie,
    url: "http://127.0.0.1:43080",
    httpOnly: true,
    sameSite: "Lax"
  }]);
  await context.addInitScript((storedSession) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {
      provider: "api",
      fallbackProvider: "api",
      apiBaseUrl: "http://127.0.0.1:43080/api"
    };
    localStorage.setItem("winga-current-user", JSON.stringify(storedSession));
  }, session);
  return { context, page: await context.newPage() };
}

test("profile collection workflow fits mobile and supports create add publish and remove", async ({ browser }) => {
  const { context, page } = await createSellerPage(browser);
  let collection = null;
  const methods = [];

  await context.route("**/api/social/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    if (!url.pathname.includes("/collections")) {
      await route.fallback();
      return;
    }
    methods.push(method);

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: collection ? [collection] : [],
          nextCursor: "",
          hasMore: false,
          limit: 30
        })
      });
      return;
    }

    if (method === "POST") {
      const payload = request.postDataJSON();
      collection = {
        id: "collection-e2e",
        ownerUsername: "buyer_seller",
        title: payload.title,
        description: payload.description,
        visibility: payload.visibility,
        status: "draft",
        itemCount: 0,
        rowVersion: 1,
        items: []
      };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ collection }) });
      return;
    }

    if (method === "PUT") {
      const productId = decodeURIComponent(url.pathname.split("/").pop());
      collection.items = [{ productId, name: "Collection product", image: "" }];
      collection.itemCount = 1;
      collection.rowVersion += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true }) });
      return;
    }

    if (method === "PATCH") {
      collection.status = "published";
      collection.rowVersion += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true }) });
      return;
    }

    if (method === "DELETE") {
      collection.items = [];
      collection.itemCount = 0;
      collection.rowVersion += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true }) });
      return;
    }

    await route.fallback();
  });

  await page.goto("/");
  await expect(page.locator("#header-user-trigger")).toBeVisible();
  await page.locator("#header-user-trigger").click();
  await page.locator("[data-header-menu-action='profile']").click();
  await expect(page.locator("#profile-collections-panel")).toBeVisible();
  await expect.poll(() => page.locator("body").getAttribute("data-trust-report-bound")).toBe("true");
  await expect(page.locator(".profile-collection-list .empty-copy")).toBeVisible();

  const form = page.locator("[data-profile-collection-form='true']");
  await form.locator("[name='description']").fill("Public favorites");
  await form.locator("[name='visibility']").selectOption("public");
  await form.locator("[name='title']").fill("Weekend picks");
  await expect(form.locator("[name='title']")).toHaveValue("Weekend picks");
  const createRequest = page.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname.endsWith("/api/social/collections")
  );
  await form.locator("button[type='submit']").click();
  await createRequest;

  const card = page.locator("[data-profile-collection='collection-e2e']");
  await expect(card).toContainText("Weekend picks");
  const productSelect = card.locator("[data-collection-product-select]");
  await expect(productSelect.locator("option")).not.toHaveCount(1);
  await productSelect.selectOption({ index: 1 });
  await card.locator("[data-add-profile-collection-item]").click();
  await expect(card.locator("[data-remove-profile-collection-item]")).toBeVisible();

  await card.locator("[data-publish-profile-collection]").click();
  await expect(card.locator("[data-publish-profile-collection]")).toHaveCount(0);
  await card.locator("[data-remove-profile-collection-item]").click();
  await expect(card.locator("[data-remove-profile-collection-item]")).toHaveCount(0);

  const layout = await page.locator("#profile-collections-panel").evaluate((element) => ({
    pageWidth: document.documentElement.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right
  }));
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageWidth);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.pageWidth);
  expect(methods).toEqual(expect.arrayContaining(["GET", "POST", "PUT", "PATCH", "DELETE"]));

  await context.close();
});

test("feed person profile shows only API-visible public collections and opens their products", async ({ browser }) => {
  const { context, page } = await createSellerPage(browser);
  let profileUsername = "";
  let productId = "";

  await context.route("**/api/social/users/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const username = decodeURIComponent(url.pathname.split("/")[4] || profileUsername);
    if (url.pathname.endsWith("/collections")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            id: "public-collection-e2e",
            ownerUsername: username,
            title: "Public weekend edit",
            description: "Visible commerce picks",
            visibility: "public",
            status: "published",
            itemCount: 1,
            items: [{ productId, uploadedBy: username, name: "Featured product", image: "" }]
          }],
          nextCursor: "",
          hasMore: false,
          limit: 12
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          username,
          fullName: "Public Curator",
          profileImage: "",
          role: "seller",
          verifiedSeller: true,
          capabilities: ["seller", "creator", "curator"],
          publicContent: { products: 4, reels: 2, reviews: 1, collections: 1 },
          followerCount: 9,
          followingCount: 3,
          viewerFollows: false,
          blocked: false
        }
      })
    });
  });

  await page.goto("/");
  const triggers = page.locator("[data-open-person-profile]");
  await expect(triggers.first()).toBeVisible();
  const selected = await triggers.evaluateAll((nodes) => {
    const node = nodes.find((item) => item.dataset.openPersonProfile !== "buyer_seller") || nodes[0];
    return {
      username: node?.dataset.openPersonProfile || "",
      productId: node?.closest("[data-open-product]")?.dataset.openProduct || ""
    };
  });
  profileUsername = selected.username;
  productId = selected.productId;
  const trigger = page.locator(`[data-open-person-profile="${profileUsername}"]`).first();
  await trigger.click();

  const modal = page.locator("#person-profile-modal");
  await expect(modal).toHaveClass(/open/);
  await expect(modal).toContainText("Public Curator");
  await expect(modal).toContainText("Public weekend edit");
  await expect(modal.locator("[data-public-collection='public-collection-e2e']")).toBeVisible();
  await expect(modal.locator("[data-public-collection-product]")).toBeVisible();

  const layout = await modal.locator(".person-profile-dialog").evaluate((element) => ({
    viewport: document.documentElement.clientWidth,
    pageScroll: document.documentElement.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right
  }));
  expect(layout.pageScroll).toBeLessThanOrEqual(layout.viewport);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport);

  await modal.locator("[data-public-collection-product]").click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await context.close();
});
