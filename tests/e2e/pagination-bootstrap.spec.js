const { test, expect } = require("@playwright/test");

const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=";

function createProducts() {
  return Array.from({ length: 12 }, (_, index) => ({
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

test("page one renders without depending on pagination metadata", async ({ page }) => {
  const products = createProducts();

  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: products,
        nextCursor: null,
        hasMore: false
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

  const renderedCards = await page.locator("#products-container .product-card").count();
  expect(renderedCards).toBeGreaterThan(0);
});
