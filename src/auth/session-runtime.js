(() => {
  function createSessionRuntimeModule(deps = {}) {
    const {
      bootTimeoutMs = 3500,
      getBootstrapSession = () => null,
      cancelDataLayerSessionRestore = () => {},
      isLifecycleEpochCurrent = () => true,
      isAdminLoginRoute = () => false,
      isStaffRole = () => false,
      setAdminLoginRouteActive = () => {},
      showInAppNotification = () => {},
      applySessionState = () => {},
      getCurrentSession = () => null,
      saveSessionUser = () => {},
      loginSuccess = () => {},
      clearSessionUser = () => {},
      showLoggedOutState = () => {},
      reportClientEvent = () => {},
      reportBootPhase = () => {},
      captureClientError = () => {},
      setTimeoutFn = (callback, delay) => window.setTimeout(callback, delay),
      clearTimeoutFn = (id) => window.clearTimeout(id)
    } = deps;

    let activeSessionRestoreToken = 0;

    function isRestoreCurrent(token, lifecycleEpoch = 0) {
      return Number(token || 0) === Number(activeSessionRestoreToken || 0)
        && (!lifecycleEpoch || isLifecycleEpochCurrent(lifecycleEpoch));
    }

    function shouldIgnoreRestoreOutcome(expectedToken = "") {
      const safeExpectedToken = String(expectedToken || "").trim();
      if (!safeExpectedToken) {
        return false;
      }
      const activeBootstrapSession = getBootstrapSession();
      const activeToken = String(activeBootstrapSession?.token || "").trim();
      return Boolean(activeToken && activeToken !== safeExpectedToken);
    }

    function invalidatePendingSessionRestore() {
      activeSessionRestoreToken += 1;
      return activeSessionRestoreToken;
    }

    function cancelPendingSessionRestore(reason = "auth_interaction") {
      invalidatePendingSessionRestore();
      try {
        cancelDataLayerSessionRestore(reason);
      } catch (error) {
        captureClientError("session_restore_cancel_call_failed", error, {
          category: "auth",
          alertSeverity: "low",
          reason
        });
      }
      reportClientEvent("info", "session_restore_cancelled", "Cancelled stale session restore flow.", {
        category: "auth",
        reason
      });
    }

    function reportSessionRestoreFinished(outcome, role = "") {
      reportBootPhase("session_restore_finished", {
        outcome,
        role: role || ""
      });
    }

    function startBackgroundSessionRestore(restorePromise, cachedSession = null, options = {}) {
      const restoreToken = invalidatePendingSessionRestore();
      const lifecycleEpoch = Number(options.lifecycleEpoch || 0);
      const expectedToken = String(cachedSession?.token || "").trim();
      if (!cachedSession?.username) {
        return;
      }
      reportBootPhase("session_restore_started", {
        role: cachedSession.role || "",
        hasToken: Boolean(expectedToken)
      });

      const timeoutId = setTimeoutFn(() => {
        if (!isRestoreCurrent(restoreToken, lifecycleEpoch)) {
          return;
        }
        reportClientEvent("warn", "session_restore_timed_out", "Session restore timed out during boot.", {
          category: "auth",
          alertSeverity: "medium"
        });
      }, bootTimeoutMs);

      Promise.resolve(restorePromise)
        .then((session) => {
          if (!isRestoreCurrent(restoreToken, lifecycleEpoch) || shouldIgnoreRestoreOutcome(expectedToken)) {
            return;
          }
          if (timeoutId) {
            clearTimeoutFn(timeoutId);
          }
          if (session?.username) {
            if (isAdminLoginRoute() && !isStaffRole(session.role)) {
              setAdminLoginRouteActive(false, { replace: true });
              showInAppNotification({
                title: "Admin access only",
                body: "Route hii ni ya admin au moderator pekee.",
                variant: "warning"
              });
            }
            const nextSession = cachedSession?.username
              ? {
                ...cachedSession,
                ...session
              }
              : session;
            applySessionState(nextSession);
            const currentSession = getCurrentSession();
            saveSessionUser(currentSession);
            loginSuccess(
              currentSession.username,
              currentSession.primaryCategory || "",
              currentSession,
              {
                restoreView: true,
                skipWelcome: true,
                deferRender: true,
                forceView: isStaffRole(currentSession.role) ? "admin" : ""
              }
            );
            reportClientEvent("info", "session_restore_succeeded", "Stored session restored during boot.", {
              category: "auth",
              role: currentSession.role || ""
            });
            reportSessionRestoreFinished("restored", currentSession.role || "");
            return;
          }

          clearSessionUser();
          applySessionState(null);
          if (cachedSession?.username && isStaffRole(cachedSession.role || "") && !isAdminLoginRoute()) {
            showLoggedOutState({
              audience: "admin",
              message: "Session ya staff imeisha. Ingia tena kuendelea."
            });
          }
          reportClientEvent("warn", "session_restore_failed", "Stored session could not be restored during boot.", {
            category: "auth",
            alertSeverity: "high",
            role: cachedSession?.role || ""
          });
          reportSessionRestoreFinished("missing", cachedSession?.role || "");
        })
        .catch((error) => {
          if (!isRestoreCurrent(restoreToken, lifecycleEpoch) || shouldIgnoreRestoreOutcome(expectedToken)) {
            return;
          }
          if (timeoutId) {
            clearTimeoutFn(timeoutId);
          }
          clearSessionUser();
          applySessionState(null);
          if (cachedSession?.username && isStaffRole(cachedSession.role || "") && !isAdminLoginRoute()) {
            showLoggedOutState({
              audience: "admin",
              message: "Session ya staff imeisha. Ingia tena kuendelea."
            });
          }
          captureClientError("session_restore_boot_failed", error, {
            category: "auth",
            alertSeverity: "high",
            hasCachedSession: Boolean(cachedSession?.username)
          });
          reportSessionRestoreFinished("failed", cachedSession?.role || "");
        });
    }

    return {
      cancelPendingSessionRestore,
      invalidatePendingSessionRestore,
      startBackgroundSessionRestore,
      getActiveSessionRestoreToken: () => activeSessionRestoreToken
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.auth = window.WingaModules.auth || {};
  window.WingaModules.auth.createSessionRuntimeModule = createSessionRuntimeModule;
})();
