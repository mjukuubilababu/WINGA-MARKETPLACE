const { test, expect } = require("@playwright/test");

const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=";

function createProducts(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    id: `pagination-bootstrap-${index + 1}`,
    name: `Pagination Bootstrap ${index + 1}`,
    price: 10000 + index,
    shop: "Pagination Test Shop",
    category: "electronics",
    status: "approved",
    availability: "available",
    createdAt: new Date(Date.now() - index * 1000).toISOString(),
    images: [tinyImage]
  }));
}

function getCursor(product) {
  return product ? `${product.createdAt}|${product.id}` : "";
}

test("page one renders without depending on pagination metadata", async ({ page }) => {
  const products = createProducts();
  const nextCursor = getCursor(products[products.length - 1]);

  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: products,
        nextCursor,
        hasMore: true,
        total: 24,
        page: 1,
        limit: 12
      })
    });
  });

  await page.goto("/");

  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({
    timeout: 30000
  });
  await expect(page.locator("#boot-overlay")).toHaveCount(0, {
    timeout: 10000
  });
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 1,
    limit: 12,
    nextCursor,
    hasMore: true,
    total: 24,
    loadedCount: 12
  });

  const renderedCards = await page.locator("#products-container .product-card").count();
  expect(renderedCards).toBeGreaterThan(0);
});

test("load-more prefetch keeps one backend runway page", async ({ page }) => {
  const products = createProducts(36);
  const productRequests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    let start = (requestedPage - 1) * limit;
    if (cursor) {
      const cursorIndex = products.findIndex((product) => getCursor(product) === cursor);
      start = cursorIndex >= 0 ? cursorIndex + 1 : start;
    }
    const items = products.slice(start, start + limit);
    const nextCursor = getCursor(items[items.length - 1]);
    const hasMore = start + items.length < products.length;
    productRequests.push({
      page: requestedPage,
      cursor,
      count: items.length,
      first: items[0]?.id || "",
      last: items[items.length - 1]?.id || "",
      hasMore
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor,
        hasMore,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));

  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(36);
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 3,
    hasMore: false,
    total: 36,
    loadedCount: 36
  });

  const duplicateIds = await page.evaluate(() => {
    const ids = (window.WingaDataLayer?.getProducts?.() || []).map((product) => product.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
  expect(productRequests.map((request) => request.page)).toEqual([1, 2, 3]);
});

test("failed lookahead does not partially commit a pagination batch", async ({ page }) => {
  const products = createProducts(36);
  let failLookahead = true;

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    let start = (requestedPage - 1) * limit;
    if (cursor) {
      const cursorIndex = products.findIndex((product) => getCursor(product) === cursor);
      start = cursorIndex >= 0 ? cursorIndex + 1 : start;
    }
    if (requestedPage === 3 && failLookahead) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary pagination failure" })
      });
      return;
    }
    const items = products.slice(start, start + limit);
    const hasMore = start + items.length < products.length;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: hasMore ? getCursor(items[items.length - 1]) : "",
        hasMore,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  const failedMessage = await page.evaluate(async () => {
    try {
      await window.WingaDataLayer.appendProductsPage({ prefetchNext: true });
      return "";
    } catch (error) {
      return String(error?.message || error || "");
    }
  });
  expect(failedMessage).toContain("Temporary pagination failure");
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(12);
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer.getProductFeedPagination()),
    { timeout: 10000 }
  ).toMatchObject({
    page: 1,
    loadedCount: 12,
    hasMore: true
  });

  failLookahead = false;
  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(36);
});

test("Home feed load-more retries transient failures and keeps existing products", async ({ page }) => {
  const products = createProducts(24);
  let pageTwoAttempts = 0;
  await page.addInitScript(() => {
    window.IntersectionObserver = undefined;
  });

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    if (requestedPage === 2) {
      pageTwoAttempts += 1;
      if (pageTwoAttempts < 3) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary pagination failure" })
        });
        return;
      }
    }
    const start = (requestedPage - 1) * limit;
    const items = products.slice(start, start + limit);
    const hasMore = start + items.length < products.length;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: hasMore ? getCursor(items[items.length - 1]) : "",
        hasMore,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  const loaded = await page.evaluate(() => window.silentlyRefreshInfiniteFeedSource({
    force: true,
    allowLookahead: false,
    reason: "e2e_retry"
  }));

  expect(loaded).toBe(true);
  expect(pageTwoAttempts).toBe(3);
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(24);
  expect(await page.evaluate(() => homeContinuousDiscoveryRuntime.loadMoreState)).toBe("success-products");
});

test("leaving Home cancels an in-flight load-more request", async ({ page }) => {
  const products = createProducts(24);
  await page.addInitScript(() => {
    window.IntersectionObserver = undefined;
  });

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    if (requestedPage === 2) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const start = (requestedPage - 1) * limit;
    const items = products.slice(start, start + limit);
    const hasMore = start + items.length < products.length;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: hasMore ? getCursor(items[items.length - 1]) : "",
        hasMore,
        total: products.length,
        page: requestedPage,
        limit
      })
    }).catch(() => {});
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  const result = await page.evaluate(async () => {
    const loadPromise = window.silentlyRefreshInfiniteFeedSource({
      force: true,
      allowLookahead: false,
      reason: "e2e_cancel"
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.setCurrentViewState("profile", {
      syncNav: false,
      persist: false,
      syncHistory: false
    });
    return loadPromise;
  });

  expect(result).toBe(false);
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(12);
  expect(await page.evaluate(() => homeContinuousDiscoveryRuntime.loadMoreState)).toBe("idle");
});

test("exhausted load-more retries expose a recoverable inline error state", async ({ page }) => {
  const products = createProducts(24);
  await page.addInitScript(() => {
    window.IntersectionObserver = undefined;
  });

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    if (requestedPage === 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary pagination failure" })
      });
      return;
    }
    const items = products.slice(0, 12);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: getCursor(items[items.length - 1]),
        hasMore: true,
        total: products.length,
        page: 1,
        limit: 12
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  const result = await page.evaluate(() => window.silentlyRefreshInfiniteFeedSource({
    force: true,
    allowLookahead: false,
    reason: "e2e_error"
  }));

  expect(result).toBe(false);
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(12);
  expect(await page.evaluate(() => homeContinuousDiscoveryRuntime.loadMoreState)).toBe("error");
  await expect(page.locator("#home-feed-load-more-status")).toBeVisible();
  await expect(page.locator("#home-feed-load-more-status .home-feed-load-more-retry")).toBeVisible();
});

test("final pagination page exhausts without requesting beyond hasMore false", async ({ page }) => {
  const products = createProducts(38);
  const productRequests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    let start = (requestedPage - 1) * limit;
    if (cursor) {
      const cursorIndex = products.findIndex((product) => getCursor(product) === cursor);
      start = cursorIndex >= 0 ? cursorIndex + 1 : start;
    }
    const items = products.slice(start, start + limit);
    const nextCursor = getCursor(items[items.length - 1]);
    const hasMore = start + items.length < products.length;
    productRequests.push({
      page: requestedPage,
      cursor,
      count: items.length,
      first: items[0]?.id || "",
      last: items[items.length - 1]?.id || "",
      hasMore
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor,
        hasMore,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(36);

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(38);
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 4,
    hasMore: false,
    total: 38,
    loadedCount: 38
  });

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));
  await page.waitForTimeout(250);

  const duplicateIds = await page.evaluate(() => {
    const ids = (window.WingaDataLayer?.getProducts?.() || []).map((product) => product.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
  expect(productRequests.map((request) => request.page)).toEqual([1, 2, 3, 4]);
  expect(productRequests.at(-1)).toMatchObject({
    page: 4,
    count: 2,
    hasMore: false
  });
});
