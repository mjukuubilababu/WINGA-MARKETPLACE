(() => {
  function createProductsApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const resolveProductImages = typeof deps.resolveProductImages === "function" ? deps.resolveProductImages : (product) => product;
    const getAnonymousDemandSessionId = typeof deps.getAnonymousDemandSessionId === "function"
      ? deps.getAnonymousDemandSessionId
      : () => "";
    const productUploadTimeoutMs = Number(deps.productUploadTimeoutMs || 45000);

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga products API client requires fetchJson.");
      }
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json",
        ...createAuthHeaders()
      };
    }

    function authHeaders() {
      return {
        ...createAuthHeaders()
      };
    }

    async function createProduct(product) {
      requireFetcher();
      const result = await fetchJson(`${baseUrl}/products`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(product),
        timeoutMs: productUploadTimeoutMs
      });
      return resolveProductImages(result);
    }

    async function updateProduct(productId, payload) {
      requireFetcher();
      const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
        timeoutMs: productUploadTimeoutMs
      });
      return resolveProductImages(result);
    }

    async function deleteProduct(productId) {
      requireFetcher();
      return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
    }

    async function updateProductAvailability(productId, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/availability`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function recordDemand(productId, payload = {}) {
      requireFetcher();
      return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/demand`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          ...payload,
          sessionId: payload.sessionId || getAnonymousDemandSessionId()
        })
      });
    }

    async function moderateProduct(productId, payload) {
      requireFetcher();
      const result = await fetchJson(`${baseUrl}/admin/products/${encodeURIComponent(productId)}/moderate`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      return resolveProductImages(result);
    }

    async function likeProduct(productId) {
      requireFetcher();
      const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/like`, {
        method: "POST",
        headers: authHeaders()
      });
      return resolveProductImages(result);
    }

    async function trackProductView(productId) {
      requireFetcher();
      const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/view`, {
        method: "POST",
        headers: authHeaders()
      });
      return resolveProductImages(result);
    }

    return {
      createProduct,
      updateProduct,
      deleteProduct,
      updateProductAvailability,
      recordDemand,
      moderateProduct,
      likeProduct,
      trackProductView
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.productActions = window.WingaModules.api.productActions || {};
  window.WingaModules.api.productActions.createProductsApiClient = createProductsApiClient;
})();
