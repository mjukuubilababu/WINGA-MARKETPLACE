(() => {
  function createNotificationPermissionModule(deps = {}) {
    const getWindow = typeof deps.getWindow === "function" ? deps.getWindow : () => window;
    const getDocument = typeof deps.getDocument === "function" ? deps.getDocument : () => document;
    const createElement = typeof deps.createElement === "function"
      ? deps.createElement
      : (tag, options = {}) => {
        const element = getDocument().createElement(tag);
        if (options.className) element.className = options.className;
        if (options.textContent) element.textContent = options.textContent;
        Object.entries(options.attributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
        return element;
      };
    const showInAppNotification = typeof deps.showInAppNotification === "function" ? deps.showInAppNotification : () => {};
    const renderCurrentView = typeof deps.renderCurrentView === "function" ? deps.renderCurrentView : () => {};
    const reportClientEvent = typeof deps.reportClientEvent === "function" ? deps.reportClientEvent : () => {};
    const storageKey = String(deps.storageKey || "winga-notification-permission-state");
    const promptCooldownMs = Math.max(0, Number(deps.promptCooldownMs || 12 * 60 * 60 * 1000) || 0);
    const allowedTriggers = new Set(Array.from(deps.allowedTriggers || ["message", "reply", "request", "order", "profile"]).map((trigger) => String(trigger || "").trim()).filter(Boolean));

    function getNotificationApi() {
      return getWindow().Notification || globalThis.Notification;
    }

    function getBrowserPermission() {
      const notificationApi = getNotificationApi();
      return notificationApi ? String(notificationApi.permission || "default") : "unsupported";
    }

    function createDefaultNotificationPermissionState() {
      return {
        status: "not_asked",
        lastTrigger: "",
        lastPromptAt: 0,
        lastDecisionAt: 0
      };
    }

    function normalizeNotificationPermissionStatus(value) {
      return ["not_asked", "prompted", "dismissed", "allowed", "denied"].includes(value)
        ? value
        : "not_asked";
    }

    function readNotificationPermissionState() {
      try {
        const raw = getWindow().localStorage?.getItem(storageKey);
        if (!raw) {
          return createDefaultNotificationPermissionState();
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return createDefaultNotificationPermissionState();
        }
        return {
          ...createDefaultNotificationPermissionState(),
          ...parsed,
          status: normalizeNotificationPermissionStatus(parsed.status)
        };
      } catch (_error) {
        return createDefaultNotificationPermissionState();
      }
    }

    let notificationPermissionState = readNotificationPermissionState();

    function persistNotificationPermissionState() {
      try {
        getWindow().localStorage?.setItem(storageKey, JSON.stringify(notificationPermissionState));
      } catch (_error) {
        reportClientEvent("warn", "notification_permission_state_persist_failed", "Unable to persist notification permission state.", {
          category: "runtime"
        });
      }
    }

    function updateNotificationPermissionState(nextState = {}) {
      notificationPermissionState = {
        ...notificationPermissionState,
        ...nextState,
        status: normalizeNotificationPermissionStatus(nextState.status ?? notificationPermissionState.status)
      };
      persistNotificationPermissionState();
      return notificationPermissionState;
    }

    function syncNotificationPermissionStateFromBrowser() {
      const browserPermission = getBrowserPermission();
      if (browserPermission === "unsupported") {
        return notificationPermissionState;
      }
      if (browserPermission === "granted") {
        return updateNotificationPermissionState({
          status: "allowed",
          lastDecisionAt: Date.now()
        });
      }
      if (browserPermission === "denied") {
        return updateNotificationPermissionState({
          status: "denied",
          lastDecisionAt: Date.now()
        });
      }
      return notificationPermissionState;
    }

    function getNotificationPermissionState() {
      return {
        ...syncNotificationPermissionStateFromBrowser()
      };
    }

    function getNotificationPermissionStatusLabel(state = notificationPermissionState) {
      const browserPermission = getBrowserPermission();
      if (browserPermission === "granted" || state.status === "allowed") {
        return "Enabled";
      }
      if (browserPermission === "denied" || state.status === "denied") {
        return "Blocked";
      }
      if (state.status === "dismissed") {
        return "Paused";
      }
      if (browserPermission === "unsupported") {
        return "Unsupported";
      }
      return "Not enabled";
    }

    function shouldShowNotificationPermissionPrompt(trigger = "", { allowDenied = false } = {}) {
      const notificationApi = getNotificationApi();
      if (!notificationApi) {
        return false;
      }
      const state = syncNotificationPermissionStateFromBrowser();
      const browserPermission = getBrowserPermission();
      if (browserPermission === "granted" || state.status === "allowed") {
        return false;
      }
      if (!allowDenied && (browserPermission === "denied" || state.status === "denied")) {
        return false;
      }
      if (!allowedTriggers.has(String(trigger || "").trim()) && trigger !== "settings") {
        return false;
      }
      if (!allowDenied && state.status === "dismissed") {
        return false;
      }
      if (!allowDenied && state.status === "prompted") {
        return false;
      }
      if (!allowDenied && state.lastPromptAt && Date.now() - Number(state.lastPromptAt || 0) < promptCooldownMs) {
        return false;
      }
      return true;
    }

    function ensureNotificationPermissionPromptRoot() {
      const targetDocument = getDocument();
      let root = targetDocument.getElementById("notification-permission-root");
      if (!root) {
        root = createElement("div", {
          attributes: { id: "notification-permission-root" },
          className: "notification-permission-root"
        });
        targetDocument.body.appendChild(root);
      }
      return root;
    }

    function closeNotificationPermissionPrompt() {
      const root = getDocument().getElementById("notification-permission-root");
      if (!root) {
        return;
      }
      root.replaceChildren();
      root.dataset.visible = "false";
    }

    async function requestBrowserNotificationPermission() {
      const notificationApi = getNotificationApi();
      if (!notificationApi) {
        return "unsupported";
      }
      const browserPermission = getBrowserPermission();
      if (browserPermission === "granted" || browserPermission === "denied") {
        return browserPermission;
      }
      if (typeof notificationApi.requestPermission !== "function") {
        return browserPermission;
      }
      const result = await notificationApi.requestPermission();
      return String(result || getBrowserPermission() || "default");
    }

    function renderNotificationPermissionPromptBody(trigger = "", options = {}) {
      const hasBlockedPermission = getBrowserPermission() === "denied";
      const body = options.body || (
        hasBlockedPermission
          ? "Browser yako tayari imezima notifications. Unaweza kujaribu tena au kuruhusu notifications kupitia browser settings."
          : "Turn on notifications so you do not miss new messages, order updates, and important activity."
      );
      const title = options.title || "Stay updated with Winga";
      return { title, body };
    }

    function showNotificationPermissionPrompt(trigger = "message", options = {}) {
      const allowDenied = Boolean(options.allowDenied);
      if (!shouldShowNotificationPermissionPrompt(trigger, { allowDenied })) {
        return false;
      }

      const root = ensureNotificationPermissionPromptRoot();
      if (root.dataset.visible === "true") {
        return true;
      }

      const { title, body } = renderNotificationPermissionPromptBody(trigger, options);
      const state = updateNotificationPermissionState({
        status: "prompted",
        lastTrigger: String(trigger || ""),
        lastPromptAt: Date.now()
      });
      const browserPermission = getBrowserPermission();
      const statusLabel = getNotificationPermissionStatusLabel(state);
      const canRequestNow = browserPermission !== "unsupported" && browserPermission !== "granted";
      const buttonLabel = browserPermission === "denied"
        ? "Open browser settings"
        : browserPermission === "granted"
          ? "Notifications enabled"
          : "Enable notifications";

      const prompt = createElement("section", {
        className: "notification-permission-prompt",
        attributes: {
          role: "dialog",
          "aria-live": "polite",
          "aria-label": title
        }
      });
      const metaRow = createElement("div", { className: "notification-permission-meta" });
      metaRow.append(
        createElement("span", { className: "status-pill", textContent: statusLabel }),
        createElement("span", { className: "notification-permission-note", textContent: "You can change this later in Profile." })
      );
      const actionsRow = createElement("div", { className: "notification-permission-actions" });
      actionsRow.append(
        createElement("button", {
          className: "action-btn buy-btn",
          textContent: buttonLabel,
          attributes: {
            type: "button",
            "data-notification-permission-enable": "true"
          }
        }),
        createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Maybe later",
          attributes: {
            type: "button",
            "data-notification-permission-later": "true"
          }
        })
      );
      prompt.append(
        createElement("p", { className: "notification-permission-eyebrow", textContent: "Notifications" }),
        createElement("strong", { textContent: title }),
        createElement("p", { className: "notification-permission-copy", textContent: body }),
        metaRow,
        actionsRow
      );

      root.replaceChildren(prompt);
      root.dataset.visible = "true";
      root.dataset.trigger = String(trigger || "");

      root.querySelector("[data-notification-permission-enable]")?.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!canRequestNow && getBrowserPermission() !== "denied") {
          closeNotificationPermissionPrompt();
          return;
        }
        try {
          const permission = await requestBrowserNotificationPermission();
          if (permission === "granted") {
            updateNotificationPermissionState({
              status: "allowed",
              lastDecisionAt: Date.now()
            });
            showInAppNotification({
              title: "Notifications enabled",
              body: "Winga itakutumia updates za messages, orders, na activity muhimu.",
              variant: "success"
            });
            closeNotificationPermissionPrompt();
            renderCurrentView();
            return;
          }
          updateNotificationPermissionState({
            status: permission === "denied" ? "denied" : "dismissed",
            lastDecisionAt: Date.now()
          });
          showInAppNotification({
            title: "Notifications off",
            body: permission === "denied"
              ? "Browser imezima notifications. Unaweza kuzi-enable tena kwenye browser settings."
              : "Umeacha notifications kwa sasa. Unaweza kuziwasha tena baadaye.",
            variant: "info"
          });
          closeNotificationPermissionPrompt();
          renderCurrentView();
        } catch (error) {
          closeNotificationPermissionPrompt();
          showInAppNotification({
            title: "Notifications unavailable",
            body: error.message || "Imeshindikana kuomba notifications kwa sasa.",
            variant: "warning"
          });
        }
      });

      root.querySelector("[data-notification-permission-later]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateNotificationPermissionState({
          status: "dismissed",
          lastDecisionAt: Date.now()
        });
        closeNotificationPermissionPrompt();
        showInAppNotification({
          title: "Maybe later",
          body: "Hatutakusumbua sasa. Unaweza kuziwasha from Profile later.",
          variant: "info"
        });
        renderCurrentView();
      });

      return true;
    }

    function openNotificationPermissionPrompt(trigger = "settings", options = {}) {
      return showNotificationPermissionPrompt(trigger, {
        ...options,
        allowDenied: true
      });
    }

    function maybePromptNotificationPermission(trigger = "message", options = {}) {
      if (!shouldShowNotificationPermissionPrompt(trigger, { allowDenied: false })) {
        return false;
      }
      return showNotificationPermissionPrompt(trigger, options);
    }

    return {
      createDefaultNotificationPermissionState,
      normalizeNotificationPermissionStatus,
      readNotificationPermissionState,
      persistNotificationPermissionState,
      updateNotificationPermissionState,
      syncNotificationPermissionStateFromBrowser,
      getNotificationPermissionState,
      getNotificationPermissionStatusLabel,
      shouldShowNotificationPermissionPrompt,
      ensureNotificationPermissionPromptRoot,
      closeNotificationPermissionPrompt,
      requestBrowserNotificationPermission,
      renderNotificationPermissionPromptBody,
      showNotificationPermissionPrompt,
      openNotificationPermissionPrompt,
      maybePromptNotificationPermission
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.notifications = window.WingaModules.notifications || {};
  window.WingaModules.notifications.createNotificationPermissionModule = createNotificationPermissionModule;
})();
