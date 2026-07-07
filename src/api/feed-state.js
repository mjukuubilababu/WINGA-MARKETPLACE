(() => {
  function createProductFeedStateTools(deps = {}) {
    const state = deps.state && typeof deps.state === "object" ? deps.state : {};
    const defaultPageLimit = Math.max(1, Math.floor(Number(deps.defaultPageLimit || 12) || 12));
    const sortProductsNewestFirst = typeof deps.sortProductsNewestFirst === "function"
      ? deps.sortProductsNewestFirst
      : (products = []) => (Array.isArray(products) ? products : []).slice();
    const mergeUniqueProducts = typeof deps.mergeUniqueProducts === "function"
      ? deps.mergeUniqueProducts
      : (existingProducts = [], incomingProducts = []) => [
        ...(Array.isArray(existingProducts) ? existingProducts : []),
        ...(Array.isArray(incomingProducts) ? incomingProducts : [])
      ];

    function setFullProductFeedPagination(productsList = []) {
      const total = Array.isArray(productsList) ? productsList.length : 0;
      state.productFeedPagination = {
        limit: Math.max(defaultPageLimit, total || defaultPageLimit),
        page: 1,
        nextCursor: "",
        hasMore: false,
        total,
        loadedCount: total
      };
    }

    function setPagedProductFeedPagination(pageInfo = {}, loadedCount = 0) {
      state.productFeedPagination = {
        limit: Number(pageInfo.limit || defaultPageLimit) || defaultPageLimit,
        page: Number(pageInfo.page || 1) || 1,
        nextCursor: String(pageInfo.nextCursor || ""),
        hasMore: Boolean(pageInfo.hasMore),
        total: Number(pageInfo.total || loadedCount || 0),
        loadedCount: Number(loadedCount || 0)
      };
    }

    function applyLoadedProductPageToState(loadedProducts, options = {}) {
      const {
        replace = false,
        markHydrated = false,
        requestState = ""
      } = options;
      const nextProducts = Array.isArray(loadedProducts)
        ? loadedProducts
        : Array.isArray(loadedProducts?.items)
          ? loadedProducts.items
          : Array.isArray(loadedProducts?.products)
            ? loadedProducts.products
            : Array.isArray(loadedProducts?.data)
              ? loadedProducts.data
              : [];

      const safeProducts = sortProductsNewestFirst(
        nextProducts.filter((product) => product && typeof product === "object")
      );
      const existingProducts = Array.isArray(state.products) ? state.products : [];

      if (replace || existingProducts.length === 0) {
        state.products = safeProducts.slice();
      } else if (safeProducts.length > 0) {
        state.products = sortProductsNewestFirst(mergeUniqueProducts(existingProducts, safeProducts));
      }

      if (Array.isArray(loadedProducts)) {
        state.productFeedPagination = {
          limit: safeProducts.length || defaultPageLimit,
          page: 1,
          nextCursor: "",
          hasMore: false,
          total: state.products.length || safeProducts.length,
          loadedCount: state.products.length || safeProducts.length
        };
      } else if (loadedProducts && typeof loadedProducts === "object") {
        state.productFeedPagination = {
          limit: Number(loadedProducts.limit || defaultPageLimit) || defaultPageLimit,
          page: Number(loadedProducts.page || 1) || 1,
          nextCursor: String(loadedProducts.nextCursor || ""),
          hasMore: Boolean(loadedProducts.hasMore),
          total: Number(loadedProducts.total || state.products.length || safeProducts.length || 0),
          loadedCount: state.products.length || safeProducts.length
        };
      } else {
        setFullProductFeedPagination(state.products);
      }

      if (markHydrated) {
        state.productsHydrated = true;
      }
      if (requestState) {
        state.initialProductsRequestState = requestState;
      }

      return safeProducts;
    }

    function getNextProductsPageOptions() {
      const pagination = state.productFeedPagination || {};
      const limit = Number(pagination.limit || defaultPageLimit) || defaultPageLimit;
      const cursor = String(pagination.nextCursor || "").trim();
      const page = Number.isFinite(Number(pagination.page)) && Number(pagination.page) > 0
        ? Math.max(1, Math.floor(Number(pagination.page))) + 1
        : 2;
      return {
        limit,
        page: Number.isFinite(page) && page > 0 ? page : 2,
        cursor
      };
    }

    return {
      setFullProductFeedPagination,
      setPagedProductFeedPagination,
      applyLoadedProductPageToState,
      getNextProductsPageOptions
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.feedState = window.WingaModules.api.feedState || {};
  window.WingaModules.api.feedState.createProductFeedStateTools = createProductFeedStateTools;
})();
