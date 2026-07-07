(() => {
  function createLifecycleModule(deps = {}) {
    const {
      getState = () => ({}),
      isStaffRole = () => false
    } = deps;

    function getLifecycleState() {
      const state = getState();
      return state && typeof state === "object" ? state : {};
    }

    function beginLifecycleEpoch(kind = "runtime") {
      const state = getLifecycleState();
      const nextEpoch = Number(state.epoch || 0) + 1;
      state.epoch = nextEpoch;
      state.activeKind = String(kind || "runtime");
      return nextEpoch;
    }

    function isLifecycleEpochCurrent(epoch) {
      const state = getLifecycleState();
      return Number(epoch || 0) > 0 && Number(epoch) === Number(state.epoch || 0);
    }

    function getEphemeralLifecycleViewOptions(options = {}) {
      return {
        persist: false,
        syncHistory: false,
        ...options
      };
    }

    function getBootTargetView(session = null) {
      if (isStaffRole(session?.role || "")) {
        return "admin";
      }
      return "home";
    }

    return {
      beginLifecycleEpoch,
      isLifecycleEpochCurrent,
      getEphemeralLifecycleViewOptions,
      getBootTargetView
    };
  }

  function createPwaLifecycleModule(deps = {}) {
    const getWindow = typeof deps.getWindow === "function" ? deps.getWindow : () => window;
    const getDocument = typeof deps.getDocument === "function" ? deps.getDocument : () => document;
    const getNavigator = typeof deps.getNavigator === "function" ? deps.getNavigator : () => navigator;
    const getInstallState = typeof deps.getInstallState === "function" ? deps.getInstallState : () => ({});
    const getUpdateBannerState = typeof deps.getUpdateBannerState === "function" ? deps.getUpdateBannerState : () => ({});
    const getBuildVersion = typeof deps.getBuildVersion === "function" ? deps.getBuildVersion : () => "";
    const createElement = typeof deps.createElement === "function"
      ? deps.createElement
      : (tag, options = {}) => {
        const element = getDocument().createElement(tag);
        if (options.className) element.className = options.className;
        if (options.textContent) element.textContent = options.textContent;
        Object.entries(options.attributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
        return element;
      };
    const showNotification = typeof deps.showInAppNotification === "function" ? deps.showInAppNotification : () => {};
    const captureError = typeof deps.captureClientError === "function" ? deps.captureClientError : () => {};
    const updateDismissStorageKey = String(deps.updateDismissStorageKey || "winga-app-update-banner-dismissed-version");

    function isStandaloneDisplayMode() {
      const targetWindow = getWindow();
      try {
        return Boolean(
          targetWindow.matchMedia?.("(display-mode: standalone)")?.matches
          || targetWindow.matchMedia?.("(display-mode: fullscreen)")?.matches
          || targetWindow.navigator?.standalone === true
        );
      } catch (_error) {
        return false;
      }
    }

    function isPwaInstallPromotable() {
      return !isStandaloneDisplayMode() && Boolean(getInstallState().deferredPrompt);
    }

    function getPwaInstallButtonLabel() {
      return isStandaloneDisplayMode() ? "Open app" : "Install app";
    }

    function getPwaInstallHelpCopy() {
      if (isStandaloneDisplayMode()) {
        return "Winga is already installed on this device.";
      }
      return "If the browser prompt is not shown yet, open browser menu and choose Install app or Add to home screen.";
    }

    function ensurePwaInstallButton(buttonId, className = "public-header-btn public-header-btn-primary") {
      const targetDocument = getDocument();
      let button = targetDocument.getElementById(buttonId);
      if (!button) {
        button = targetDocument.createElement("button");
        button.id = buttonId;
        button.type = "button";
        button.className = className;
      }
      return button;
    }

    function ensureInstallChrome() {
      const publicHeaderActions = deps.getPublicHeaderActions?.();
      const authContainer = deps.getAuthContainer?.();
      let headerInstallButton = deps.getHeaderInstallButton?.();
      let authInstallButton = deps.getAuthInstallButton?.();

      if (publicHeaderActions) {
        headerInstallButton = ensurePwaInstallButton("header-install-button");
        deps.setHeaderInstallButton?.(headerInstallButton);
        if (!headerInstallButton.isConnected) {
          publicHeaderActions.appendChild(headerInstallButton);
        }
      }

      if (authContainer) {
        let authPromo = getDocument().getElementById("auth-install-promo");
        if (!authPromo) {
          authPromo = createElement("div", {
            attributes: { id: "auth-install-promo" },
            className: "auth-install-promo"
          });
          authPromo.append(
            createElement("p", {
              className: "auth-install-title",
              textContent: "Install Winga on your device"
            }),
            createElement("p", {
              className: "auth-install-copy",
              textContent: "Get faster access, smoother browsing, and a home-screen shortcut."
            })
          );
          authInstallButton = ensurePwaInstallButton("auth-install-button", "public-header-btn public-header-btn-primary");
          deps.setAuthInstallButton?.(authInstallButton);
          authPromo.appendChild(authInstallButton);
          const toggleLink = deps.getToggleLink?.() || getDocument().getElementById("toggle-link");
          if (toggleLink?.parentElement === authContainer) {
            toggleLink.insertAdjacentElement("afterend", authPromo);
          } else {
            authContainer.appendChild(authPromo);
          }
        }
      }
    }

    function syncInstallChrome() {
      ensureInstallChrome();
      const installState = getInstallState();
      const installed = isStandaloneDisplayMode() || Boolean(installState.installed);
      const headerInstallButton = deps.getHeaderInstallButton?.();
      const authInstallButton = deps.getAuthInstallButton?.();
      if (headerInstallButton) {
        headerInstallButton.hidden = installed;
        headerInstallButton.textContent = getPwaInstallButtonLabel();
      }
      if (authInstallButton) {
        authInstallButton.hidden = installed;
        authInstallButton.textContent = getPwaInstallButtonLabel();
      }
      const authPromo = getDocument().getElementById("auth-install-promo");
      if (authPromo) {
        authPromo.hidden = installed;
      }
      installState.menuHintVisible = !installed;
    }

    async function promptAppInstall(source = "header") {
      const installState = getInstallState();
      if (isStandaloneDisplayMode()) {
        showNotification({
          title: "Winga already installed",
          body: "App iko tayari kufunguka kama app kwenye kifaa hiki.",
          variant: "info"
        });
        return true;
      }
      if (installState.deferredPrompt) {
        const promptEvent = installState.deferredPrompt;
        installState.deferredPrompt = null;
        syncInstallChrome();
        try {
          promptEvent.prompt();
          const choiceResult = await promptEvent.userChoice;
          if (choiceResult?.outcome === "accepted") {
            showNotification({
              title: "Installing Winga",
              body: "Browser inaandaa app yako.",
              variant: "success"
            });
            return true;
          }
        } catch (error) {
          captureError("pwa_install_prompt_failed", error, { source });
        }
      }
      showNotification({
        title: "Install Winga",
        body: getPwaInstallHelpCopy(),
        variant: "info"
      });
      return false;
    }

    function initializePwaInstallExperience() {
      const targetWindow = getWindow();
      const installState = getInstallState();
      if (installState.initialized) {
        return;
      }
      installState.initialized = true;
      installState.installed = isStandaloneDisplayMode();
      targetWindow.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installState.deferredPrompt = event;
        syncInstallChrome();
      });
      targetWindow.addEventListener("appinstalled", () => {
        installState.deferredPrompt = null;
        installState.installed = true;
        syncInstallChrome();
        showNotification({
          title: "Winga installed",
          body: "App iko tayari kutumia kwenye device hii.",
          variant: "success"
        });
      });
      targetWindow.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
        installState.installed = isStandaloneDisplayMode();
        syncInstallChrome();
      });
      syncInstallChrome();
    }

    function ensureAppUpdateBannerRoot() {
      const targetDocument = getDocument();
      let root = targetDocument.getElementById("app-update-banner-root");
      if (!root) {
        root = targetDocument.createElement("div");
        root.id = "app-update-banner-root";
        targetDocument.body.appendChild(root);
      }
      return root;
    }

    function getDismissedUpdateBannerVersion() {
      try {
        return String(getWindow().localStorage.getItem(updateDismissStorageKey) || "").trim();
      } catch (_error) {
        return "";
      }
    }

    function saveDismissedUpdateBannerVersion(version = "") {
      try {
        if (!version) {
          getWindow().localStorage.removeItem(updateDismissStorageKey);
          return;
        }
        getWindow().localStorage.setItem(updateDismissStorageKey, version);
      } catch (_error) {
        // Ignore update banner persistence failures.
      }
    }

    function clearAppUpdateBanner() {
      const root = getDocument().getElementById("app-update-banner-root");
      if (root) {
        root.replaceChildren();
      }
      getUpdateBannerState().visibleVersion = "";
    }

    function showAppUpdateBanner(registration, version = getBuildVersion()) {
      const targetNavigator = getNavigator();
      if (!registration || !targetNavigator.serviceWorker?.controller) {
        return;
      }
      const safeVersion = String(version || getBuildVersion() || "").trim();
      if (!safeVersion || getDismissedUpdateBannerVersion() === safeVersion) {
        return;
      }
      const root = ensureAppUpdateBannerRoot();
      root.replaceChildren();
      const banner = getDocument().createElement("div");
      banner.className = "app-update-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.innerHTML = `
        <div class="app-update-banner-copy">
          <p class="app-update-banner-eyebrow">App update ready</p>
          <strong>Toleo jipya la Winga lipo tayari.</strong>
          <p>Bonyeza Reload ili upate maboresho ya sasa bila kuvunja session yako.</p>
        </div>
        <div class="app-update-banner-actions">
          <button type="button" class="action-btn button-primary" data-app-update-reload="true">Reload now</button>
          <button type="button" class="action-btn button-secondary" data-app-update-later="true">Later</button>
        </div>
      `;
      root.appendChild(banner);
      getUpdateBannerState().visibleVersion = safeVersion;

      const triggerReload = () => {
        getUpdateBannerState().waitingToReload = true;
        saveDismissedUpdateBannerVersion("");
        try {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          } else if (registration.installing?.state === "installed") {
            registration.update().catch(() => {});
          } else {
            getWindow().location.reload();
          }
        } catch (_error) {
          getWindow().location.reload();
        }
      };

      banner.querySelector("[data-app-update-reload]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerReload();
      });
      banner.querySelector("[data-app-update-later]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveDismissedUpdateBannerVersion(safeVersion);
        clearAppUpdateBanner();
        showNotification({
          type: "info",
          title: "Umeendelea na version ya sasa",
          body: "Unaweza ku-reload baadaye ili upate update mpya.",
          variant: "info",
          durationMs: 2800
        });
      });
    }

    function bindAppUpdateLifecycle(registration) {
      const targetNavigator = getNavigator();
      const updateState = getUpdateBannerState();
      if (!registration) {
        return;
      }
      updateState.registration = registration;
      if (!updateState.controllerChangeBound && "serviceWorker" in targetNavigator) {
        targetNavigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!updateState.waitingToReload) {
            return;
          }
          updateState.waitingToReload = false;
          clearAppUpdateBanner();
          getWindow().location.reload();
        });
        updateState.controllerChangeBound = true;
      }
      const maybeShowWaitingBanner = () => {
        if (!registration.waiting || !targetNavigator.serviceWorker.controller) {
          return;
        }
        showAppUpdateBanner(registration);
      };
      if (registration.waiting) {
        maybeShowWaitingBanner();
      }
      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && targetNavigator.serviceWorker.controller) {
            maybeShowWaitingBanner();
          }
        });
      });
    }

    return {
      isStandaloneDisplayMode,
      isPwaInstallPromotable,
      getPwaInstallButtonLabel,
      getPwaInstallHelpCopy,
      ensurePwaInstallButton,
      ensureInstallChrome,
      syncInstallChrome,
      promptAppInstall,
      initializePwaInstallExperience,
      ensureAppUpdateBannerRoot,
      getDismissedUpdateBannerVersion,
      saveDismissedUpdateBannerVersion,
      clearAppUpdateBanner,
      showAppUpdateBanner,
      bindAppUpdateLifecycle
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.boot = window.WingaModules.boot || {};
  window.WingaModules.boot.createLifecycleModule = createLifecycleModule;
  window.WingaModules.boot.createPwaLifecycleModule = createPwaLifecycleModule;
})();
