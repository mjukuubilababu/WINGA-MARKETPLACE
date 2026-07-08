(() => {
  function createCommerceApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga commerce API client requires fetchJson.");
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

    async function loadPromotions() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/promotions`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function createPromotion(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/promotions`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadAdminPromotions() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/admin/promotions`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function reviewPromotion(promotionId, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/promotions/${encodeURIComponent(promotionId)}/review`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload || {})
      });
    }

    async function disablePromotion(promotionId) {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/promotions/${encodeURIComponent(promotionId)}/disable`, {
        method: "PATCH",
        headers: authHeaders()
      });
    }

    async function loadReviews(productId = "") {
      requireFetcher();
      const suffix = productId ? `?productId=${encodeURIComponent(productId)}` : "";
      return fetchJson(`${baseUrl}/reviews${suffix}`);
    }

    async function createReview(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/reviews`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadMyOrders() {
      requireFetcher();
      return fetchJson(`${baseUrl}/orders/mine`, {
        headers: authHeaders()
      });
    }

    async function createOrder(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/orders`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function updateOrderStatus(orderId, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    return {
      loadPromotions,
      createPromotion,
      loadAdminPromotions,
      reviewPromotion,
      disablePromotion,
      loadReviews,
      createReview,
      loadMyOrders,
      createOrder,
      updateOrderStatus
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.commerce = window.WingaModules.api.commerce || {};
  window.WingaModules.api.commerce.createCommerceApiClient = createCommerceApiClient;
})();
