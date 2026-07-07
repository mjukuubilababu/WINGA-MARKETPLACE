(() => {
  function createApiRuntime(deps = {}) {
    const getWindow = typeof deps.getWindow === "function" ? deps.getWindow : () => window;
    const createRequestError = typeof deps.createRequestError === "function"
      ? deps.createRequestError
      : (message, details = {}) => Object.assign(new Error(message), details);
    const safeStorageRemove = typeof deps.safeStorageRemove === "function" ? deps.safeStorageRemove : () => {};
    const sessionKey = String(deps.sessionKey || "winga-current-user");
    const csrfRuntime = {
      token: "",
      promise: null
    };

    function bindAbortSignal(controller, externalSignal) {
      if (!controller || !externalSignal || typeof externalSignal.addEventListener !== "function") {
        return () => {};
      }
      if (externalSignal.aborted) {
        try {
          controller.abort();
        } catch (_error) {
          // Ignore duplicate abort attempts.
        }
        return () => {};
      }
      const forwardAbort = () => {
        try {
          controller.abort();
        } catch (_error) {
          // Ignore duplicate abort attempts.
        }
      };
      externalSignal.addEventListener("abort", forwardAbort, { once: true });
      return () => {
        try {
          externalSignal.removeEventListener("abort", forwardAbort);
        } catch (_error) {
          // Ignore listener cleanup failures.
        }
      };
    }

    function emitApiMetric(detail) {
      const targetWindow = getWindow();
      if (typeof targetWindow === "undefined" || typeof targetWindow.dispatchEvent !== "function" || typeof targetWindow.CustomEvent !== "function") {
        return;
      }
      try {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent("winga:api-metric", { detail }));
      } catch (_error) {
        // Metrics must never block the user path.
      }
    }

    function getApiEndpointLabel(url) {
      try {
        const targetWindow = getWindow();
        const parsedUrl = new URL(String(url || ""), targetWindow.location?.origin || "https://wingamarket.com");
        return parsedUrl.pathname.replace(/^\/api\//, "/");
      } catch (_error) {
        return String(url || "");
      }
    }

    function isUnsafeApiMethod(method = "GET") {
      return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
    }

    function getCsrfTokenUrl(url) {
      const targetWindow = getWindow();
      const parsedUrl = new URL(String(url || ""), targetWindow.location?.origin || "https://wingamarket.com");
      const parts = parsedUrl.pathname.split("/");
      const apiIndex = parts.indexOf("api");
      if (apiIndex >= 0) {
        parsedUrl.pathname = `${parts.slice(0, apiIndex + 1).join("/")}/auth/csrf-token`;
      } else {
        parsedUrl.pathname = "/api/auth/csrf-token";
      }
      parsedUrl.search = "";
      parsedUrl.hash = "";
      return parsedUrl.toString();
    }

    async function fetchCsrfTokenForRequest(url) {
      if (csrfRuntime.token) {
        return csrfRuntime.token;
      }
      if (csrfRuntime.promise) {
        return csrfRuntime.promise;
      }
      csrfRuntime.promise = fetch(getCsrfTokenUrl(url), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.csrfToken) {
            const error = new Error(payload?.error || "CSRF token haikupatikana.");
            error.status = response.status;
            error.code = "csrf_unavailable";
            throw error;
          }
          csrfRuntime.token = String(payload.csrfToken || "");
          return csrfRuntime.token;
        })
        .finally(() => {
          csrfRuntime.promise = null;
        });
      return csrfRuntime.promise;
    }

    async function applyCsrfHeader(url, requestOptions) {
      const method = String(requestOptions.method || "GET").toUpperCase();
      if (!isUnsafeApiMethod(method)) {
        return requestOptions;
      }
      const headers = new Headers(requestOptions.headers || {});
      if (!headers.has("X-CSRF-Token")) {
        headers.set("X-CSRF-Token", await fetchCsrfTokenForRequest(url));
      }
      requestOptions.headers = headers;
      return requestOptions;
    }

    function clearCsrfToken() {
      csrfRuntime.token = "";
    }

    function dispatchSessionInvalidated(status, message) {
      const targetWindow = getWindow();
      safeStorageRemove(sessionKey);
      if (typeof targetWindow !== "undefined" && typeof targetWindow.dispatchEvent === "function" && typeof targetWindow.CustomEvent === "function") {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent("winga:session-invalidated", {
          detail: { status, message }
        }));
      }
    }

    async function fetchJson(url, options) {
      const targetWindow = getWindow();
      const startedAt = Date.now();
      const endpointLabel = getApiEndpointLabel(url);
      const requestOptions = options ? { ...options } : {};
      const hasRetriedCsrf = requestOptions.csrfRetry === true;
      delete requestOptions.csrfRetry;
      const externalSignal = requestOptions.signal;
      delete requestOptions.signal;
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const detachAbortSignal = bindAbortSignal(controller, externalSignal);
      const timeoutMs = Number(
        requestOptions.timeoutMs
        || targetWindow.WINGA_CONFIG?.requestTimeoutMs
        || 25000
      );
      delete requestOptions.timeoutMs;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let response;
      try {
        await applyCsrfHeader(url, requestOptions);
        response = await fetch(url, {
          ...requestOptions,
          credentials: requestOptions.credentials || "include",
          signal: controller ? controller.signal : externalSignal
        });
      } catch (error) {
        detachAbortSignal();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        const latencyMs = Date.now() - startedAt;
        if (error?.name === "AbortError") {
          const wasExternallyAborted = Boolean(externalSignal?.aborted);
          const endpoint = String(url || "");
          let message = "Request took too long. Check your connection and try again.";
          let code = "timeout";
          if (wasExternallyAborted) {
            message = "Request was cancelled because a newer auth action started.";
            code = "aborted";
          } else {
            if (endpoint.includes("/auth/signup")) {
              message = "Seller signup took too long. Check your connection and try again.";
            }
            if (endpoint.includes("/auth/admin-login")) {
              message = "Admin login took too long. Check your connection and try again.";
            }
            if (endpoint.includes("/auth/login")) {
              message = "Login took too long. Check your connection and try again.";
            }
          }
          emitApiMetric({ endpoint: endpointLabel, ok: false, status: 0, code, latencyMs });
          throw createRequestError(message, {
            code,
            retryable: !wasExternallyAborted,
            endpoint: endpointLabel,
            latencyMs
          });
        }
        const networkError = createRequestError(error?.message || "Network issue. Check your connection and try again.", {
          code: "network",
          retryable: true,
          endpoint: endpointLabel,
          latencyMs
        });
        emitApiMetric({ endpoint: endpointLabel, ok: false, status: 0, code: "network", latencyMs });
        throw networkError;
      }
      detachAbortSignal();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (!response.ok) {
        let errorMessage = `Request failed: ${response.status}`;
        let errorCode = "";
        try {
          const errorBody = await response.json();
          if (errorBody?.error) {
            errorMessage = errorBody.error;
          }
          if (errorBody?.code) {
            errorCode = String(errorBody.code || "");
          }
        } catch (_error) {
          // Ignore JSON parse failures and keep fallback message.
        }
        if (response.status === 403 && errorCode === "csrf_failed" && !hasRetriedCsrf) {
          clearCsrfToken();
          return fetchJson(url, {
            ...(options || {}),
            csrfRetry: true
          });
        }
        const normalizedMessage = String(errorMessage || "").toLowerCase();
        const shouldInvalidateSession = response.status === 401
          ? normalizedMessage.includes("session")
            || normalizedMessage.includes("imeisha")
            || normalizedMessage.includes("hakupatikana")
          : response.status === 403
            && (
              normalizedMessage.includes("imesimamishwa")
              || normalizedMessage.includes("imezuiwa")
              || normalizedMessage.includes("imezimwa")
            );
        if (shouldInvalidateSession) {
          dispatchSessionInvalidated(response.status, errorMessage);
        }
        const latencyMs = Date.now() - startedAt;
        emitApiMetric({
          endpoint: endpointLabel,
          ok: false,
          status: response.status,
          code: `http_${response.status}`,
          latencyMs
        });
        throw createRequestError(errorMessage, {
          code: `http_${response.status}`,
          status: response.status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          endpoint: endpointLabel,
          latencyMs
        });
      }
      const data = response.status === 204 ? null : await response.json();
      emitApiMetric({
        endpoint: endpointLabel,
        ok: true,
        status: response.status,
        latencyMs: Date.now() - startedAt
      });
      return data;
    }

    return {
      bindAbortSignal,
      emitApiMetric,
      getApiEndpointLabel,
      isUnsafeApiMethod,
      getCsrfTokenUrl,
      fetchCsrfTokenForRequest,
      applyCsrfHeader,
      clearCsrfToken,
      fetchJson
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.createApiRuntime = createApiRuntime;
})();
