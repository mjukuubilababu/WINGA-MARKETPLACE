(() => {
  function createAuthApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const sessionAdapter = deps.sessionAdapter || {};
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const authFetchJson = typeof deps.authFetchJson === "function" ? deps.authFetchJson : fetchJson;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const emitApiMetric = typeof deps.emitApiMetric === "function" ? deps.emitApiMetric : () => {};
    const stripSignupCategoryFields = typeof deps.stripSignupCategoryFields === "function"
      ? deps.stripSignupCategoryFields
      : (payload) => payload;
    const normalizePrimaryCategoryValue = typeof deps.normalizePrimaryCategoryValue === "function"
      ? deps.normalizePrimaryCategoryValue
      : (value) => String(value || "").trim();
    const getWindow = typeof deps.getWindow === "function" ? deps.getWindow : () => window;
    let sessionRestoreController = null;

    function requireFetcher() {
      if (typeof fetchJson !== "function" || typeof authFetchJson !== "function") {
        throw new Error("Winga auth API client requires fetch helpers.");
      }
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json",
        ...createAuthHeaders()
      };
    }

    function cancelSessionRestore(reason = "auth_interaction") {
      if (!sessionRestoreController) {
        return;
      }
      try {
        sessionRestoreController.abort();
      } catch (_error) {
        // Ignore duplicate abort attempts.
      }
      sessionRestoreController = null;
      emitApiMetric({
        endpoint: "/auth/session",
        ok: false,
        status: 0,
        code: "aborted",
        latencyMs: 0,
        reason
      });
    }

    async function logoutSession() {
      requireFetcher();
      try {
        return await fetchJson(`${baseUrl}/auth/logout`, {
          method: "POST"
        });
      } finally {
        sessionAdapter.clearSession?.();
      }
    }

    async function restoreSession() {
      requireFetcher();
      cancelSessionRestore("restart_session_restore");
      sessionRestoreController = typeof AbortController !== "undefined" ? new AbortController() : null;
      const requestSignal = sessionRestoreController ? sessionRestoreController.signal : undefined;
      try {
        const targetWindow = getWindow();
        const data = await fetchJson(`${baseUrl}/auth/session`, {
          headers: {
            ...createAuthHeaders()
          },
          signal: requestSignal,
          timeoutMs: Number(targetWindow.WINGA_CONFIG?.sessionRestoreTimeoutMs || 5000)
        });
        if (!data || typeof data !== "object" || Array.isArray(data) || !String(data.username || "").trim()) {
          sessionAdapter.clearSession?.();
          return null;
        }
        sessionAdapter.saveSession?.(data);
        return data;
      } catch (error) {
        if (error?.code === "aborted") {
          return null;
        }
        sessionAdapter.clearSession?.();
        return null;
      } finally {
        if (!sessionRestoreController || sessionRestoreController.signal === requestSignal) {
          sessionRestoreController = null;
        }
      }
    }

    async function signup(payload) {
      requireFetcher();
      return authFetchJson(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stripSignupCategoryFields(payload))
      }, {
        retries: 0
      });
    }

    async function login(payload) {
      requireFetcher();
      return authFetchJson(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, {
        retries: 1
      });
    }

    async function recoverPassword(payload) {
      requireFetcher();
      return authFetchJson(`${baseUrl}/auth/recover-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, {
        retries: 0
      });
    }

    async function adminLogin(payload) {
      requireFetcher();
      return authFetchJson(`${baseUrl}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, {
        retries: 1
      });
    }

    async function updateUserProfile(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/users/me/profile`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function upgradeBuyerToSeller(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/users/me/upgrade-to-seller`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function requestWhatsappChange(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/users/me/whatsapp/request-change`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function verifyWhatsappChange(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/users/me/whatsapp/verify-change`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function updateUserPrimaryCategory(username, primaryCategory) {
      requireFetcher();
      const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
      if (!normalizedCategory) {
        return { ok: true, ignored: true };
      }
      await fetchJson(`${baseUrl}/users/primary-category`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ username, primaryCategory: normalizedCategory })
      });
      return { ok: true };
    }

    return {
      cancelSessionRestore,
      logoutSession,
      restoreSession,
      signup,
      login,
      recoverPassword,
      adminLogin,
      updateUserProfile,
      upgradeBuyerToSeller,
      requestWhatsappChange,
      verifyWhatsappChange,
      updateUserPrimaryCategory
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.auth = window.WingaModules.api.auth || {};
  window.WingaModules.api.auth.createAuthApiClient = createAuthApiClient;
})();
