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

test("Big Pipe handoff seeds page one and continuation starts from next cursor", async ({ page }) => {
  const products = createProducts(24);
  const firstPage = products.slice(0, 12);
  const secondPage = products.slice(12, 24);
  const nextCursor = getCursor(firstPage[firstPage.length - 1]);
  const productRequests = [];

  await page.addInitScript(({ firstPagePayload, nextCursorPayload }) => {
    window.__WINGA_BIG_PIPE_BOOTSTRAPPED__ = true;
    window.__WINGA_BIG_PIPE_BOOTSTRAP_STATUS__ = "loaded";
    window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__ = firstPagePayload;
    window.__WINGA_BIG_PIPE_INITIAL_PAGE__ = {
      items: firstPagePayload,
      nextCursor: nextCursorPayload,
      hasMore: true,
      total: 24,
      page: 1,
      limit: 12
    };
    window.__WINGA_BIG_PIPE_INITIAL_USERS__ = [];
    window.__WINGA_BIG_PIPE_INITIAL_SESSION__ = null;
  }, {
    firstPagePayload: firstPage,
    nextCursorPayload: nextCursor
  });

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Number(requestUrl.searchParams.get("page") || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    productRequests.push({ page: requestedPage, cursor });
    if (requestedPage === 1 && !cursor) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Big Pipe handoff should not refetch page 1" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: secondPage,
        nextCursor: "",
        hasMore: false,
        total: 24,
        page: 2,
        limit: 12
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);
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

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage());

  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(24);
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 2,
    hasMore: false,
    loadedCount: 24
  });
  expect(productRequests).toEqual([{ page: 2, cursor: nextCursor }]);
});

test("backend appended Home page is rendered into the visible feed stream", async ({ page }) => {
  const products = createProducts(24);
  const nextCursor = getCursor(products[11]);
  const productRequests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    const start = cursor
      ? products.findIndex((product) => getCursor(product) === cursor) + 1
      : (requestedPage - 1) * limit;
    const safeStart = Math.max(0, start);
    const items = products.slice(safeStart, safeStart + limit);
    productRequests.push({
      page: requestedPage,
      cursor,
      first: items[0]?.id || "",
      count: items.length
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: getCursor(items[items.length - 1]),
        hasMore: safeStart + items.length < products.length,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.locator("#products-container .product-card").count(),
    { timeout: 30000 }
  ).toBeGreaterThanOrEqual(12);
  await expect.poll(
    () => page.evaluate(() => typeof window.silentlyRefreshInfiniteFeedSource),
    { timeout: 30000 }
  ).toBe("function");
  await page.evaluate(() => {
    const pagination = window.WingaDataLayer?.getProductFeedPagination?.();
    if (Number(pagination?.page || 1) < 2) {
      window.scrollTo(0, document.body.scrollHeight);
      return window.silentlyRefreshInfiniteFeedSource({ force: true, reason: "e2e_dom_append" });
    }
    return null;
  });

  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 2,
    hasMore: false,
    loadedCount: 24
  });
  await expect.poll(
    () => page.locator("#products-container .product-card").count(),
    { timeout: 30000 }
  ).toBeGreaterThan(12);
  await expect(page.locator("[data-open-product='pagination-bootstrap-13']").first()).toBeVisible({
    timeout: 30000
  });
  expect(productRequests.map((request) => request.page)).toEqual([1, 2]);
  expect(productRequests[1]).toMatchObject({
    cursor: nextCursor,
    first: "pagination-bootstrap-13"
  });
});

test("authenticated refresh preserves loaded Home pages and continuation cursor", async ({ page }) => {
  const products = createProducts(36);

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    const cursorIndex = cursor
      ? products.findIndex((product) => getCursor(product) === cursor)
      : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : (requestedPage - 1) * limit;
    const items = products.slice(start, start + limit);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: getCursor(items[items.length - 1]),
        hasMore: start + items.length < products.length,
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
  ).toBeGreaterThanOrEqual(12);

  await page.evaluate(async () => {
    const pagination = window.WingaDataLayer.getProductFeedPagination();
    if (Number(pagination.page || 1) < 2) {
      await window.WingaDataLayer.appendProductsPage();
    }
  });
  const beforeRefresh = await page.evaluate(() => ({
    count: window.WingaDataLayer.getProducts().length,
    pagination: window.WingaDataLayer.getProductFeedPagination()
  }));
  expect(beforeRefresh.pagination.page).toBeGreaterThanOrEqual(2);
  expect(beforeRefresh.count).toBeGreaterThanOrEqual(24);

  await page.evaluate(() => window.WingaDataLayer.refreshProducts({
    preserveFeedPagination: true
  }));
  const afterRefresh = await page.evaluate(() => ({
    count: window.WingaDataLayer.getProducts().length,
    pagination: window.WingaDataLayer.getProductFeedPagination()
  }));

  expect(afterRefresh.count).toBeGreaterThanOrEqual(beforeRefresh.count);
  expect(afterRefresh.pagination.page).toBe(beforeRefresh.pagination.page);
  expect(afterRefresh.pagination.nextCursor).toBe(beforeRefresh.pagination.nextCursor);
  expect(afterRefresh.pagination.hasMore).toBe(beforeRefresh.pagination.hasMore);
  expect(afterRefresh.pagination.loadedCount).toBe(afterRefresh.count);

  if (afterRefresh.pagination.hasMore) {
    await page.evaluate(() => window.WingaDataLayer.appendProductsPage());
    await expect.poll(
      () => page.evaluate(() => window.WingaDataLayer.getProducts().length),
      { timeout: 30000 }
    ).toBeGreaterThan(afterRefresh.count);
  }
});

test("authenticated session restore keeps cursor continuation through three pages", async ({ page }) => {
  const products = createProducts(36);
  const productRequests = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("winga-current-user", JSON.stringify({
      username: "pagination-auth-user",
      fullName: "Pagination Auth User",
      role: "seller"
    }));
  });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ username: "pagination-auth-user", fullName: "Pagination Auth User", role: "seller" })
    });
  });
  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    const cursorIndex = cursor ? products.findIndex((product) => getCursor(product) === cursor) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : (requestedPage - 1) * limit;
    const items = products.slice(start, start + limit);
    productRequests.push({ page: requestedPage, cursor, ids: items.map((item) => item.id) });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: start + items.length < products.length ? getCursor(items[items.length - 1]) : "",
        hasMore: start + items.length < products.length,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect(page.locator("#header-user-trigger")).toBeVisible({ timeout: 30000 });
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);
  await page.evaluate(() => window.WingaDataLayer.appendProductsPage());
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer.getProducts().length),
    { timeout: 30000 }
  ).toBe(24);
  await page.evaluate(() => window.WingaDataLayer.appendProductsPage());
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer.getProducts().length),
    { timeout: 30000 }
  ).toBe(36);

  const result = await page.evaluate(() => ({
    ids: window.WingaDataLayer.getProducts().map((product) => product.id),
    pagination: window.WingaDataLayer.getProductFeedPagination()
  }));
  expect(new Set(result.ids).size).toBe(36);
  expect(result.pagination).toMatchObject({ page: 3, loadedCount: 36, hasMore: false, nextCursor: "" });
  expect(productRequests.map((request) => request.page)).toEqual([1, 1, 2, 3]);
  expect(productRequests.filter((request) => request.page === 1)).toHaveLength(2);
  expect(productRequests[2].cursor).toBe(getCursor(products[11]));
  expect(productRequests[3].cursor).toBe(getCursor(products[23]));
});
test("successful passive product views do not replace authenticated pagination state", async ({ page }) => {
  const products = createProducts(24);
  const collectionRequests = [];
  let viewRequests = 0;

  await page.route("**/api/auth/csrf-token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "pagination-view-test-token" })
    });
  });

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const viewMatch = requestUrl.pathname.match(/\/api\/products\/([^/]+)\/view$/);
    if (viewMatch) {
      viewRequests += 1;
      const productId = decodeURIComponent(viewMatch[1]);
      const product = products.find((item) => item.id === productId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...product, views: Number(product?.views || 0) + 1 })
      });
      return;
    }

    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    const cursorIndex = cursor
      ? products.findIndex((product) => getCursor(product) === cursor)
      : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : (requestedPage - 1) * limit;
    const items = products.slice(start, start + limit);
    collectionRequests.push({ page: requestedPage, cursor });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: getCursor(items[items.length - 1]),
        hasMore: start + items.length < products.length,
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
  await page.evaluate(async () => {
    const productIds = window.WingaDataLayer.getProducts().slice(0, 4).map((product) => product.id);
    for (const productId of productIds) {
      await window.WingaDataLayer.trackProductView(productId);
    }
  });

  expect(viewRequests).toBe(4);
  expect(collectionRequests).toEqual([{ page: 1, cursor: "" }]);
  await expect.poll(
    () => page.evaluate(() => ({
      count: window.WingaDataLayer.getProducts().length,
      pagination: window.WingaDataLayer.getProductFeedPagination()
    })),
    { timeout: 30000 }
  ).toMatchObject({
    count: 12,
    pagination: {
      page: 1,
      loadedCount: 12,
      hasMore: true
    }
  });

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage());
  await page.waitForTimeout(1800);

  expect(collectionRequests).toHaveLength(2);
  expect(collectionRequests[1]).toMatchObject({ page: 2 });
  await expect.poll(
    () => page.evaluate(() => ({
      count: window.WingaDataLayer.getProducts().length,
      pagination: window.WingaDataLayer.getProductFeedPagination()
    })),
    { timeout: 30000 }
  ).toMatchObject({
    count: 24,
    pagination: {
      page: 2,
      loadedCount: 24,
      hasMore: false
    }
  });
});

test("product actions preserve the loaded Home cursor and canonical feed", async ({ page }) => {
  const products = createProducts(30);
  const collectionRequests = [];
  let likeRequests = 0;

  await page.route("**/api/auth/csrf-token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "pagination-action-test-token" })
    });
  });

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const likeMatch = requestUrl.pathname.match(/\/api\/products\/([^/]+)\/like$/);
    if (likeMatch) {
      likeRequests += 1;
      const productId = decodeURIComponent(likeMatch[1]);
      const product = products.find((item) => item.id === productId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...product, likes: Number(product?.likes || 0) + 1 })
      });
      return;
    }

    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const cursor = String(requestUrl.searchParams.get("cursor") || "");
    const cursorIndex = cursor
      ? products.findIndex((product) => getCursor(product) === cursor)
      : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : (requestedPage - 1) * limit;
    const items = products.slice(start, start + limit);
    collectionRequests.push({ page: requestedPage, cursor });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: getCursor(items[items.length - 1]),
        hasMore: start + items.length < products.length,
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
  await page.evaluate(() => window.WingaDataLayer.appendProductsPage());
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer.getProducts().length),
    { timeout: 30000 }
  ).toBe(24);

  const beforeAction = await page.evaluate(() => ({
    pagination: window.WingaDataLayer.getProductFeedPagination(),
    ids: window.WingaDataLayer.getProducts().map((product) => product.id)
  }));
  await page.evaluate(async () => {
    const productId = window.WingaDataLayer.getProducts()[0].id;
    await window.WingaDataLayer.likeProduct(productId);
  });
  const afterAction = await page.evaluate(() => ({
    pagination: window.WingaDataLayer.getProductFeedPagination(),
    ids: window.WingaDataLayer.getProducts().map((product) => product.id)
  }));

  expect(likeRequests).toBe(1);
  expect(collectionRequests).toHaveLength(2);
  expect(afterAction.ids).toEqual(beforeAction.ids);
  expect(afterAction.pagination).toMatchObject({
    page: beforeAction.pagination.page,
    nextCursor: beforeAction.pagination.nextCursor,
    hasMore: beforeAction.pagination.hasMore,
    loadedCount: beforeAction.pagination.loadedCount
  });
});

test("load-more commits its primary page before background runway prefetch", async ({ page }) => {
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
  ).toBe(24);
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 2,
    hasMore: true,
    total: 36,
    loadedCount: 24
  });

  expect(productRequests.map((request) => request.page)).toEqual([1, 2]);
  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({ page: 3, hasMore: false, total: 36, loadedCount: 36 });

  const duplicateIds = await page.evaluate(() => {
    const ids = (window.WingaDataLayer?.getProducts?.() || []).map((product) => product.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
  expect(productRequests.map((request) => request.page)).toEqual([1, 2, 3]);
});

test("boot background runway prepares continuation before users hit the end", async ({ page }) => {
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
    productRequests.push({
      page: requestedPage,
      cursor,
      count: items.length,
      first: items[0]?.id || ""
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: getCursor(items[items.length - 1]),
        hasMore: start + items.length < products.length,
        total: products.length,
        page: requestedPage,
        limit
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 1,
    hasMore: true,
    loadedCount: 12
  });
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 30000 }
  ).toMatchObject({
    page: 2,
    hasMore: true,
    loadedCount: 24
  });
  await expect.poll(
    () => page.locator("#products-container .product-card").count(),
    { timeout: 30000 }
  ).toBeGreaterThan(12);
  await expect(page.locator("[data-open-product='pagination-bootstrap-13']").first()).toBeVisible({
    timeout: 30000
  });
  expect(productRequests.map((request) => request.page)).toEqual([1, 2]);
});

test("queryProductsPage hydrates seller and category results without replacing Home pagination", async ({ page }) => {
  const products = createProducts(12);
  const queryProduct = {
    ...createProducts(1)[0],
    id: "query-seller-phone",
    name: "Simu Seller Special",
    uploadedBy: "seller-query",
    category: "electronics-simu"
  };
  const requests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    requests.push(requestUrl.search);
    const isQuery = requestUrl.searchParams.get("seller") === "seller-query";
    const items = isQuery ? [queryProduct] : products;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        nextCursor: isQuery ? "" : getCursor(items[items.length - 1]),
        hasMore: !isQuery,
        total: isQuery ? 1 : 24,
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
  const beforePagination = await page.evaluate(() => window.WingaDataLayer.getProductFeedPagination());

  const result = await page.evaluate(() => window.WingaDataLayer.queryProductsPage({
    query: "simu",
    category: "electronics",
    seller: "seller-query",
    limit: 12,
    page: 1
  }));
  const cachedResult = await page.evaluate(() => window.WingaDataLayer.queryProductsPage({
    query: "simu",
    category: "electronics",
    seller: "seller-query",
    limit: 12,
    page: 1
  }));

  expect(result.appendedCount).toBe(1);
  expect(cachedResult.appendedCount).toBe(0);
  expect(cachedResult.cached).toBe(true);
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(13);
  expect(await page.evaluate(() => window.WingaDataLayer.getProductFeedPagination())).toEqual(beforePagination);
  expect(requests.filter((search) => search.includes("seller=seller-query"))).toHaveLength(1);
  expect(requests.some((search) =>
    search.includes("q=simu")
    && search.includes("category=electronics")
    && search.includes("seller=seller-query")
  )).toBe(true);
});

test("shared product query surfaces continue with their own cursor state", async ({ page }) => {
  const products = createProducts(12);
  const sellerProducts = [
    {
      ...createProducts(1)[0],
      id: "seller-page-1",
      uploadedBy: "seller-paged",
      category: "electronics-simu"
    },
    {
      ...createProducts(1)[0],
      id: "seller-page-2",
      uploadedBy: "seller-paged",
      category: "electronics-simu",
      createdAt: new Date(Date.now() - 1000).toISOString()
    }
  ];
  const queryPages = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    const isSellerQuery = requestUrl.searchParams.get("seller") === "seller-paged";
    if (isSellerQuery) {
      queryPages.push(requestedPage);
      const item = sellerProducts[requestedPage - 1];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: item ? [item] : [],
          nextCursor: requestedPage === 1 ? getCursor(item) : "",
          hasMore: requestedPage === 1,
          total: 2,
          page: requestedPage,
          limit: 1
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: products,
        nextCursor: getCursor(products[products.length - 1]),
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

  const results = await page.evaluate(async () => {
    const first = await hydrateProductQuerySurface({
      surface: "e2e-seller-pagination",
      seller: "seller-paged",
      limit: 1
    });
    const second = await hydrateProductQuerySurface({
      surface: "e2e-seller-pagination",
      seller: "seller-paged",
      limit: 1,
      append: true
    });
    return {
      first: { page: first.page, appendedCount: first.appendedCount, hasMore: first.hasMore },
      second: { page: second.page, appendedCount: second.appendedCount, hasMore: second.hasMore }
    };
  });

  expect(results).toEqual({
    first: { page: 1, appendedCount: 1, hasMore: true },
    second: { page: 2, appendedCount: 1, hasMore: false }
  });
  expect(queryPages).toEqual([1, 2]);
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(14);
});

test("hard refresh restores an authoritative page one without duplicate identities", async ({ page }) => {
  const products = createProducts(24);
  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const limit = Number(requestUrl.searchParams.get("limit") || 12) || 12;
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
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
  await page.evaluate(() => window.WingaDataLayer.appendProductsPage());
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(24);

  await page.reload();
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);
  const snapshot = await page.evaluate(() => ({
    ids: window.WingaDataLayer.getProducts().map((product) => product.id),
    pagination: window.WingaDataLayer.getProductFeedPagination()
  }));
  expect(new Set(snapshot.ids).size).toBe(snapshot.ids.length);
  expect(snapshot.ids).toEqual(products.slice(0, 12).map((product) => product.id));
  expect(snapshot.pagination).toMatchObject({
    page: 1,
    loadedCount: 12,
    hasMore: true
  });
});

test("virtualized Home cards release heavy nodes above the retained-node budget", async ({ page }) => {
  const products = createProducts(12);
  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: products,
        nextCursor: getCursor(products[products.length - 1]),
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

  const retained = await page.evaluate(() => {
    const product = window.WingaDataLayer.getProducts()[0];
    homeContinuousDiscoveryRuntime.virtualList = Array.from({ length: 30 }, (_, index) => ({
      id: `virtual-test-${index}`,
      node: createProductCardElement({
        ...product,
        feedSequenceIndex: index + 1,
        feedEntryKey: `product:${product.id}:${index + 1}`
      }),
      productId: product.id,
      feedEntryType: "product",
      feedEntryKey: `product:${product.id}:${index + 1}`,
      feedSequenceIndex: index + 1,
      variantDisplayIndex: 0,
      createdAt: Date.now() + index
    }));
    compactHomeVirtualNodeRecords();
    return {
      heavyNodes: homeContinuousDiscoveryRuntime.virtualList.filter((record) => record.node instanceof Element).length,
      compactedRecords: homeContinuousDiscoveryRuntime.virtualList.filter((record) => record.node == null).length
    };
  });

  expect(retained).toEqual({
    heavyNodes: 24,
    compactedRecords: 6
  });
});

test("prefetch flag never makes the primary append depend on another page", async ({ page }) => {
  const products = createProducts(36);
  let failLookahead = true;
  let pageThreeAttempts = 0;

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
      pageThreeAttempts += 1;
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

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: true }));
  expect(await page.evaluate(() => window.WingaDataLayer.getProducts().length)).toBe(24);
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer.getProductFeedPagination()),
    { timeout: 10000 }
  ).toMatchObject({
    page: 2,
    loadedCount: 24,
    hasMore: true
  });

  expect(pageThreeAttempts).toBe(0);
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

  const result = await page.evaluate(async () => {
    if (homeContinuousDiscoveryRuntime.backgroundRunwayTimer) {
      window.clearTimeout(homeContinuousDiscoveryRuntime.backgroundRunwayTimer);
      homeContinuousDiscoveryRuntime.backgroundRunwayTimer = 0;
    }
    window.cancelHomeFeedLoadMore?.("e2e_error_setup");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    return window.silentlyRefreshInfiniteFeedSource({
      force: true,
      allowLookahead: false,
      reason: "e2e_error"
    });
  });

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
  ).toBe(24);

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

test("Home feed keeps social discovery alive after backend inventory is exhausted", async ({ page }) => {
  const products = createProducts(12).map((product) => ({
    ...product,
    feedSequenceIndex: 1
  }));
  const productRequests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    productRequests.push(requestedPage);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: requestedPage === 1 ? products : [],
        nextCursor: requestedPage === 1 ? getCursor(products[products.length - 1]) : "",
        hasMore: false,
        total: products.length,
        page: requestedPage,
        limit: 12
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.locator("#products-container .product-card").count(),
    { timeout: 30000 }
  ).toBeGreaterThanOrEqual(12);

  const initialCount = await page.locator("#products-container .product-card").count();
  for (let index = 0; index < 4; index += 1) {
    await page.evaluate(async () => {
      const container = document.querySelector("#products-container");
      const anchor = container?.querySelector?.("[data-continuous-discovery-anchor='home']");
      if (typeof hydrateContinuousDiscoveryAnchor === "function" && anchor) {
        await hydrateContinuousDiscoveryAnchor(anchor);
        return;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(250);
  }

  const summary = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#products-container .product-card[data-open-product]"));
    const keys = cards.map((card) => String(card.dataset.feedEntryKey || ""));
    const duplicateKeys = keys.filter((key, index) => key && keys.indexOf(key) !== index);
    return {
      count: cards.length,
      uniqueKeys: new Set(keys.filter(Boolean)).size,
      duplicateKeys,
      runtimeBatchIndex: Number(homeContinuousDiscoveryRuntime?.batchIndex || 0),
      pagination: window.WingaDataLayer?.getProductFeedPagination?.()
    };
  });

  expect(summary.count).toBeGreaterThan(initialCount);
  expect(summary.runtimeBatchIndex).toBeGreaterThanOrEqual(2);
  expect(summary.duplicateKeys).toEqual([]);
  expect(summary.pagination).toMatchObject({
    page: 1,
    hasMore: false,
    loadedCount: 12
  });
  expect(productRequests).toEqual([1]);
});

test("Home hydration recovers after a frame insertion failure", async ({ page }) => {
  const products = createProducts(12);
  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: products,
        nextCursor: getCursor(products[products.length - 1]),
        hasMore: false,
        total: products.length,
        page: 1,
        limit: 12
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.locator("#products-container .product-card").count(),
    { timeout: 30000 }
  ).toBeGreaterThanOrEqual(12);
  const initialCount = await page.locator("#products-container .product-card").count();

  const recovery = await page.evaluate(async () => {
    const anchor = document.querySelector("[data-continuous-discovery-anchor='home']");
    const originalBefore = Element.prototype.before;
    let failedOnce = false;
    homeContinuousDiscoveryRuntime.observer?.disconnect?.();
    homeContinuousDiscoveryRuntime.sentinelObserver?.disconnect?.();
    homeContinuousDiscoveryRuntime.lastHydrateAt = 0;
    Element.prototype.before = function (...nodes) {
      if (this === anchor && !failedOnce) {
        failedOnce = true;
        throw new Error("Injected frame insertion failure");
      }
      return originalBefore.apply(this, nodes);
    };
    try {
      const result = await hydrateContinuousDiscoveryAnchor(anchor);
      return {
        result,
        failedOnce,
        loading: homeContinuousDiscoveryRuntime.loading,
        observer: Boolean(homeContinuousDiscoveryRuntime.sentinelObserver),
        targets: (homeContinuousDiscoveryRuntime.sentinelTargets || []).filter((target) => target?.isConnected).length
      };
    } finally {
      Element.prototype.before = originalBefore;
    }
  });

  expect(recovery).toMatchObject({
    result: false,
    failedOnce: true,
    loading: false,
    observer: true
  });
  expect(recovery.targets).toBeGreaterThan(0);
  await expect.poll(
    () => page.locator("#products-container .product-card").count(),
    { timeout: 30000 }
  ).toBeGreaterThan(initialCount);
});

test("empty continuation page with hasMore true is bounded as exhausted", async ({ page }) => {
  const products = createProducts(12);
  const productRequests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    productRequests.push(requestedPage);
    if (requestedPage === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: products,
          nextCursor: getCursor(products[products.length - 1]),
          hasMore: true,
          total: 24,
          page: 1,
          limit: 12
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        nextCursor: getCursor(products[products.length - 1]),
        hasMore: true,
        total: 24,
        page: requestedPage,
        limit: 12
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  const result = await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: false }));
  expect(result).toMatchObject({
    appendedCount: 0,
    exhausted: true,
    hasMore: false
  });
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 10000 }
  ).toMatchObject({
    page: 2,
    hasMore: false,
    loadedCount: 12
  });

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: false }));
  await page.waitForTimeout(250);
  expect(productRequests).toEqual([1, 2]);
});

test("duplicate continuation page with unchanged cursor cannot loop forever", async ({ page }) => {
  const products = createProducts(12);
  const productRequests = [];

  await page.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedPage = Math.max(1, Number(requestUrl.searchParams.get("page") || 1) || 1);
    productRequests.push({
      page: requestedPage,
      cursor: String(requestUrl.searchParams.get("cursor") || "")
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: products,
        nextCursor: getCursor(products[products.length - 1]),
        hasMore: true,
        total: 24,
        page: requestedPage,
        limit: 12
      })
    });
  });

  await page.goto("/");
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProducts?.().length || 0),
    { timeout: 30000 }
  ).toBe(12);

  const result = await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: false }));
  expect(result).toMatchObject({
    appendedCount: 0,
    exhausted: true,
    hasMore: false
  });
  await expect.poll(
    () => page.evaluate(() => window.WingaDataLayer?.getProductFeedPagination?.()),
    { timeout: 10000 }
  ).toMatchObject({
    page: 2,
    hasMore: false,
    loadedCount: 12
  });

  await page.evaluate(() => window.WingaDataLayer.appendProductsPage({ prefetchNext: false }));
  await page.waitForTimeout(250);
  expect(productRequests).toHaveLength(2);
});
