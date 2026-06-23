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
