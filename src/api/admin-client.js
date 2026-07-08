(() => {
  function createAdminApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const resolveProductImages = typeof deps.resolveProductImages === "function" ? deps.resolveProductImages : (item) => item;
    const normalizeAppSettings = typeof deps.normalizeAppSettings === "function" ? deps.normalizeAppSettings : (settings) => settings || {};
    const defaultAppSettings = deps.defaultAppSettings || {};

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga admin API client requires fetchJson.");
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

    function buildQuery(filters = {}, allowedKeys = []) {
      const params = new URLSearchParams();
      allowedKeys.forEach((key) => {
        if (filters[key]) {
          params.set(key, String(filters[key]));
        }
      });
      return params.toString() ? `?${params.toString()}` : "";
    }

    async function loadAdminOpsSummary() {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/ops/summary`, {
        headers: authHeaders()
      });
    }

    async function loadAdminUsers() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/admin/users`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function loadAdminProducts(status = "") {
      requireFetcher();
      const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
      const data = await fetchJson(`${baseUrl}/admin/products${suffix}`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data.map(resolveProductImages) : [];
    }

    async function loadAdminOrders(filters = {}) {
      requireFetcher();
      const suffix = buildQuery(filters, ["paymentStatus", "status"]);
      const data = await fetchJson(`${baseUrl}/admin/orders${suffix}`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data.map(resolveProductImages) : [];
    }

    async function loadAdminPayments(filters = {}) {
      requireFetcher();
      const suffix = buildQuery(filters, ["paymentStatus"]);
      const data = await fetchJson(`${baseUrl}/admin/payments${suffix}`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function createReport(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/reports`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadAdminReports(filters = {}) {
      requireFetcher();
      const suffix = buildQuery(filters, ["status"]);
      const data = await fetchJson(`${baseUrl}/admin/reports${suffix}`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function reviewReport(reportId, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/reports/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadAdminSettings() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/admin/settings`, {
        headers: authHeaders()
      });
      return normalizeAppSettings(data || defaultAppSettings);
    }

    async function updateAdminSettings(payload) {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/admin/settings`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload || {})
      });
      return normalizeAppSettings(data || defaultAppSettings);
    }

    async function loadAdminMessages() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/admin/messages`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function reviewAdminMessage(conversationId, payload = {}) {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/messages/${encodeURIComponent(conversationId)}/review`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload || {})
      });
    }

    async function loadAdminUserInvestigation(username, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/users/${encodeURIComponent(username)}/investigation`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload || {})
      });
    }

    async function moderateUser(username, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/admin/users/${encodeURIComponent(username)}/moderation`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadModerationActions() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/admin/moderation-actions`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    return {
      loadAdminOpsSummary,
      loadAdminUsers,
      loadAdminProducts,
      loadAdminOrders,
      loadAdminPayments,
      createReport,
      loadAdminReports,
      reviewReport,
      loadAdminSettings,
      updateAdminSettings,
      loadAdminMessages,
      reviewAdminMessage,
      loadAdminUserInvestigation,
      moderateUser,
      loadModerationActions
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.admin = window.WingaModules.api.admin || {};
  window.WingaModules.api.admin.createAdminApiClient = createAdminApiClient;
})();
