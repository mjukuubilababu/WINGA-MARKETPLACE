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
