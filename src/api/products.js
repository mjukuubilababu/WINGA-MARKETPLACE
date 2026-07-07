(() => {
  function createProductApiTools(deps = {}) {
    const getWindow = typeof deps.getWindow === "function" ? deps.getWindow : () => window;
    const defaultPageLimit = Math.max(1, Math.floor(Number(deps.defaultPageLimit || 12) || 12));
    const cursorSeparator = String(deps.cursorSeparator || "|");

    function getProductCreatedTime(product) {
      return new Date(
        product?.createdAt
        || product?.created_at
        || product?.timestamp
        || product?.updatedAt
        || 0
      ).getTime();
    }

    function compareProductsNewestFirst(first, second) {
      const secondTime = getProductCreatedTime(second);
      const firstTime = getProductCreatedTime(first);
      if (secondTime !== firstTime) {
        return secondTime - firstTime;
      }
      return String(second?.id || "").localeCompare(String(first?.id || ""));
    }

    function sortProductsNewestFirst(products = []) {
      return (Array.isArray(products) ? products : []).slice().sort(compareProductsNewestFirst);
    }

    function getConfiguredFeedPageLimit(config = getWindow().WINGA_CONFIG || {}) {
      const explicitLimit = Number(config.feedPageLimit || config.startupProductsPageLimit || config.feedBootstrapLimit);
      if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
        return Math.max(1, Math.floor(explicitLimit));
      }
      const targetWindow = getWindow();
      const viewportWidth = Number(targetWindow.innerWidth || 0);
      const mobileLimit = Number(config.feedPageLimitMobile || defaultPageLimit) || defaultPageLimit;
      const desktopLimit = Number(config.feedPageLimitDesktop || 24) || 24;
      return viewportWidth >= 1024
        ? Math.max(1, Math.floor(desktopLimit))
        : Math.max(1, Math.floor(mobileLimit));
    }

    function buildProductCursor(product) {
      if (!product || typeof product !== "object") {
        return "";
      }
      const timestamp = getProductCreatedTime(product);
      const productId = String(product.id || product.productId || product.slug || "").trim();
      if (!Number.isFinite(timestamp) || timestamp <= 0 || !productId) {
        return "";
      }
      return `${timestamp}${cursorSeparator}${productId}`;
    }

    function parseProductCursor(cursor) {
      const rawCursor = String(cursor || "").trim();
      if (!rawCursor || !rawCursor.includes(cursorSeparator)) {
        return null;
      }
      const [timestampValue, ...idParts] = rawCursor.split(cursorSeparator);
      const timestamp = Number(timestampValue);
      const productId = idParts.join(cursorSeparator).trim();
      if (!Number.isFinite(timestamp) || timestamp <= 0 || !productId) {
        return null;
      }
      return {
        timestamp,
        productId
      };
    }

    function normalizeProductPageWindow(options = {}) {
      const requestedLimit = Number(options.limit || defaultPageLimit);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.max(1, Math.floor(requestedLimit))
        : defaultPageLimit;
      const requestedPage = Number(options.page || 1);
      const cursorValue = String(options.cursor || "").trim();
      const page = Number.isFinite(requestedPage) && requestedPage > 0
        ? Math.max(1, Math.floor(requestedPage))
        : 1;
      return {
        limit,
        page,
        cursor: cursorValue
      };
    }

    function normalizeProductPageResponse(payload, options = {}, mapProduct = (product) => product) {
      const pageWindow = normalizeProductPageWindow(options);
      const isObjectPayload = payload && typeof payload === "object" && !Array.isArray(payload);
      const sourceItems = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.products)
            ? payload.products
            : Array.isArray(payload?.data)
              ? payload.data
              : []);
      const normalizedItems = sortProductsNewestFirst(sourceItems.map(mapProduct).filter((item) => item && typeof item === "object"));
      const cursorTarget = pageWindow.cursor ? parseProductCursor(pageWindow.cursor) : null;
      const cursorIndex = cursorTarget
        ? normalizedItems.findIndex((item) => {
          const itemCursor = buildProductCursor(item);
          return itemCursor && itemCursor === pageWindow.cursor;
        })
        : -1;
      const pageIndex = Math.max(0, (pageWindow.page - 1) * pageWindow.limit);
      const startIndex = cursorIndex >= 0
        ? cursorIndex + 1
        : pageIndex;
      const slicedItems = normalizedItems.slice(startIndex, startIndex + pageWindow.limit);
      const inferredNextCursor = slicedItems.length
        ? buildProductCursor(slicedItems[slicedItems.length - 1])
        : "";

      if (isObjectPayload) {
        const hasExplicitTotal = Number.isFinite(Number(payload.total));
        const total = hasExplicitTotal
          ? Math.max(0, Math.floor(Number(payload.total)))
          : normalizedItems.length;
        const limit = Number.isFinite(Number(payload.limit)) && Number(payload.limit) > 0
          ? Math.max(1, Math.floor(Number(payload.limit)))
          : pageWindow.limit;
        const page = Number.isFinite(Number(payload.page)) && Number(payload.page) > 0
          ? Math.max(1, Math.floor(Number(payload.page)))
          : pageWindow.page;
        const items = normalizedItems;
        const hasMore = typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : Boolean(payload.nextCursor || payload.cursor)
            || (hasExplicitTotal ? (page * limit) < total : items.length >= limit);
        const nextCursor = payload.nextCursor != null
          ? String(payload.nextCursor)
          : payload.cursor != null
            ? String(payload.cursor)
            : (hasMore ? (items.length ? buildProductCursor(items[items.length - 1]) : "") : "");
        return {
          items,
          nextCursor,
          hasMore,
          total,
          page,
          limit
        };
      }

      const total = normalizedItems.length;
      const items = slicedItems;
      const hasMore = startIndex + items.length < total;
      return {
        items,
        nextCursor: hasMore ? inferredNextCursor : "",
        hasMore,
        total,
        page: pageWindow.page,
        limit: pageWindow.limit
      };
    }

    function mergeUniqueProducts(existingProducts = [], incomingProducts = []) {
      const merged = [];
      const seenIds = new Set();
      const addProduct = (product) => {
        if (!product || typeof product !== "object") {
          return;
        }
        const productId = String(product.id || product.productId || product.slug || "").trim();
        if (productId && seenIds.has(productId)) {
          return;
        }
        if (productId) {
          seenIds.add(productId);
        }
        merged.push(product);
      };

      (Array.isArray(existingProducts) ? existingProducts : []).forEach(addProduct);
      (Array.isArray(incomingProducts) ? incomingProducts : []).forEach(addProduct);
      return merged;
    }

    return {
      getProductCreatedTime,
      compareProductsNewestFirst,
      sortProductsNewestFirst,
      getConfiguredFeedPageLimit,
      buildProductCursor,
      parseProductCursor,
      normalizeProductPageWindow,
      normalizeProductPageResponse,
      mergeUniqueProducts
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.products = window.WingaModules.api.products || {};
  window.WingaModules.api.products.createProductApiTools = createProductApiTools;
})();
