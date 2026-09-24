(() => {
  function createNavigationChromeModule(deps) {
    let cachedViewportWidth = Math.max(0, Number(window.innerWidth || 0));
    let viewportWidthFrame = 0;

    function refreshViewportWidthCache() {
      const nextWidth = Math.max(
        0,
        Number(window.visualViewport?.width || 0),
        Number(window.innerWidth || 0)
      );
      if (nextWidth > 0) {
        cachedViewportWidth = nextWidth;
      }
    }

    function scheduleViewportWidthCacheRefresh() {
      if (viewportWidthFrame) {
        return;
      }
      viewportWidthFrame = requestAnimationFrame(() => {
        viewportWidthFrame = 0;
        refreshViewportWidthCache();
        updateMarketplaceActionChrome();
      });
    }

    refreshViewportWidthCache();
    window.addEventListener?.("resize", scheduleViewportWidthCacheRefresh, { passive: true });
    window.visualViewport?.addEventListener?.("resize", scheduleViewportWidthCacheRefresh, { passive: true });

    function getViewportWidth() {
      return Math.round(Math.max(0, Number(cachedViewportWidth || window.innerWidth || 0)));
    }

    function shouldShowBottomNav() {
      return getViewportWidth() <= 720
        && deps.getAppContainer()?.style.display !== "none"
        && !deps.isStaffUser()
        && ["home", "offers", "shops", "profile", "upload", "analytics"].includes(deps.getCurrentView())
        && !document.body.classList.contains("product-detail-open");
    }

    function shouldShowPostProductFab() {
      if (!deps.isAuthenticatedUser() || deps.isStaffUser() || !deps.canUseSellerFeatures()) {
        return false;
      }
      if (getViewportWidth() <= 720 || deps.getCurrentView() !== "home" || deps.getEditingProductId()) {
        return false;
      }
      return !document.body.classList.contains("product-detail-open");
    }

    function shouldShowViewHomeBack() {
      if (!deps.isAuthenticatedUser()) {
        return false;
      }
      if (document.body.classList.contains("product-detail-open")) {
        return false;
      }
      const currentView = deps.getCurrentView();
      return currentView === "offers" || currentView === "shops" || currentView === "profile" || currentView === "upload" || currentView === "admin";
    }

    const MOBILE_HEADER_STATE = Object.freeze({
      FULL: "FULL",
      SEARCH_ONLY: "SEARCH_ONLY",
      HIDDEN: "HIDDEN"
    });
    const MOBILE_HEADER_TOP_THRESHOLD = 2;
    const MOBILE_HEADER_DIRECTION_THRESHOLD = 4;

    function isMobileHeaderAutoHideEnabled() {
      return getViewportWidth() <= 720
        && deps.getAppContainer()?.style.display !== "none"
        && deps.getCurrentView() === "home"
        && !document.body.classList.contains("auth-modal-open")
        && !document.body.classList.contains("product-detail-open")
        && !deps.getChatUiState().isContextOpen;
    }

    function isMobileHeaderInteractionLocked() {
      const searchState = deps.getSearchRuntimeState();
      const profileState = deps.getProfileRuntimeState();
      return Boolean(
        searchState.isInputFocused
        || searchState.isMobileSearchOpen
        || searchState.isMobileCategoryOpen
        || profileState.isHeaderUserMenuOpen
      );
    }

    function normalizeMobileHeaderState(state, currentScrollY) {
      if (!isMobileHeaderAutoHideEnabled()) {
        return MOBILE_HEADER_STATE.FULL;
      }
      if (currentScrollY <= MOBILE_HEADER_TOP_THRESHOLD) {
        return MOBILE_HEADER_STATE.FULL;
      }
      return state === MOBILE_HEADER_STATE.FULL
        ? MOBILE_HEADER_STATE.SEARCH_ONLY
        : state;
    }

    function setMobileHeaderState(state, options = {}) {
      const uiState = deps.getUiRuntimeState();
      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const requestedState = Object.values(MOBILE_HEADER_STATE).includes(state)
        ? state
        : MOBILE_HEADER_STATE.FULL;
      const nextState = normalizeMobileHeaderState(requestedState, currentScrollY);
      const previousState = uiState.mobileHeaderState || (uiState.mobileHeaderHidden
        ? MOBILE_HEADER_STATE.HIDDEN
        : MOBILE_HEADER_STATE.FULL);
      if (previousState === nextState && !options.force) {
        return;
      }

      uiState.mobileHeaderState = nextState;
      uiState.mobileHeaderHidden = nextState === MOBILE_HEADER_STATE.HIDDEN;
      document.body.classList.toggle("mobile-header-hidden", nextState === MOBILE_HEADER_STATE.HIDDEN);
      document.body.classList.toggle("mobile-header-search-only", nextState === MOBILE_HEADER_STATE.SEARCH_ONLY);
      document.body.classList.toggle("mobile-bottom-nav-hidden", nextState === MOBILE_HEADER_STATE.HIDDEN);
      deps.getTopBar()?.setAttribute("data-mobile-header-state", nextState.toLowerCase());
      deps.getBottomNav()?.setAttribute(
        "data-mobile-nav-state",
        nextState === MOBILE_HEADER_STATE.HIDDEN ? "hidden" : "visible"
      );
      if (previousState !== nextState) {
        const eventName = nextState === MOBILE_HEADER_STATE.HIDDEN
          ? "header_hidden_on_scroll"
          : nextState === MOBILE_HEADER_STATE.SEARCH_ONLY
            ? "header_search_revealed_on_scroll"
            : "header_full_restored_on_scroll";
        deps.reportEvent?.(
          "info",
          eventName,
          `Mobile Home header changed from ${previousState} to ${nextState}.`,
          { category: "navigation", view: deps.getCurrentView(), previousState, nextState }
        );
      }
    }

    function setMobileHeaderHidden(hidden, options = {}) {
      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const nextState = hidden
        ? MOBILE_HEADER_STATE.HIDDEN
        : currentScrollY <= MOBILE_HEADER_TOP_THRESHOLD
          ? MOBILE_HEADER_STATE.FULL
          : MOBILE_HEADER_STATE.SEARCH_ONLY;
      setMobileHeaderState(nextState, options);
    }

    function syncMobileHeaderVisibility(force = false) {
      const uiState = deps.getUiRuntimeState();
      if (!isMobileHeaderAutoHideEnabled()) {
        setMobileHeaderState(MOBILE_HEADER_STATE.FULL, { force });
        uiState.mobileHeaderLastScrollY = Math.max(window.scrollY || 0, 0);
        uiState.mobileHeaderLastToggleY = uiState.mobileHeaderLastScrollY;
        uiState.mobileHeaderDirection = 0;
        uiState.mobileHeaderDirectionAccumulator = 0;
        return;
      }

      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const previousScrollY = Number.isFinite(uiState.mobileHeaderLastScrollY)
        ? uiState.mobileHeaderLastScrollY
        : currentScrollY;
      const delta = currentScrollY - previousScrollY;
      uiState.mobileHeaderLastScrollY = currentScrollY;

      if (currentScrollY <= MOBILE_HEADER_TOP_THRESHOLD) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        uiState.mobileHeaderDirection = 0;
        uiState.mobileHeaderDirectionAccumulator = 0;
        setMobileHeaderState(MOBILE_HEADER_STATE.FULL, { force });
        return;
      }

      if (isMobileHeaderInteractionLocked()) {
        uiState.mobileHeaderDirection = 0;
        uiState.mobileHeaderDirectionAccumulator = 0;
        setMobileHeaderState(MOBILE_HEADER_STATE.SEARCH_ONLY, { force });
        return;
      }

      if (!uiState.mobileHeaderState || uiState.mobileHeaderState === MOBILE_HEADER_STATE.FULL) {
        setMobileHeaderState(MOBILE_HEADER_STATE.HIDDEN, { force });
      }

      if (delta === 0) {
        return;
      }

      const direction = delta > 0 ? 1 : -1;
      if (direction !== Number(uiState.mobileHeaderDirection || 0)) {
        uiState.mobileHeaderDirection = direction;
        uiState.mobileHeaderDirectionAccumulator = delta;
      } else {
        uiState.mobileHeaderDirectionAccumulator = Number(uiState.mobileHeaderDirectionAccumulator || 0) + delta;
      }

      const accumulatedDelta = Number(uiState.mobileHeaderDirectionAccumulator || 0);
      if (accumulatedDelta >= MOBILE_HEADER_DIRECTION_THRESHOLD) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        uiState.mobileHeaderDirection = 0;
        uiState.mobileHeaderDirectionAccumulator = 0;
        setMobileHeaderState(MOBILE_HEADER_STATE.HIDDEN);
      } else if (accumulatedDelta <= -MOBILE_HEADER_DIRECTION_THRESHOLD) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        uiState.mobileHeaderDirection = 0;
        uiState.mobileHeaderDirectionAccumulator = 0;
        setMobileHeaderState(MOBILE_HEADER_STATE.SEARCH_ONLY);
      }
    }

    function scheduleMobileHeaderScrollSync() {
      const uiState = deps.getUiRuntimeState();
      if (getViewportWidth() > 720) {
        if (uiState.mobileHeaderScrollFrame) {
          cancelAnimationFrame(uiState.mobileHeaderScrollFrame);
          uiState.mobileHeaderScrollFrame = 0;
        }
        return;
      }
      if (uiState.mobileHeaderScrollFrame) {
        return;
      }

      uiState.mobileHeaderScrollFrame = requestAnimationFrame(() => {
        uiState.mobileHeaderScrollFrame = 0;
        syncMobileHeaderVisibility();
      });
    }

    function updateMarketplaceActionChrome() {
      const bottomNav = deps.getBottomNav();
      const quickDiscoveryRail = deps.getQuickDiscoveryRail?.();
      const postProductFab = deps.getPostProductFab();
      const viewHomeBackButton = deps.getViewHomeBackButton();

      if (bottomNav) {
        bottomNav.style.display = shouldShowBottomNav() ? "grid" : "none";
      }
      if (quickDiscoveryRail) {
        quickDiscoveryRail.style.display = getViewportWidth() <= 720 && deps.getCurrentView() === "home"
          ? "flex"
          : "none";
      }
      if (postProductFab) {
        postProductFab.style.display = shouldShowPostProductFab() ? "inline-flex" : "none";
      }
      if (viewHomeBackButton) {
        viewHomeBackButton.style.display = shouldShowViewHomeBack() ? "inline-flex" : "none";
        const shouldUseFloatingStyle = deps.canUseSellerFeatures()
          && !deps.isStaffUser()
          && (deps.getCurrentView() === "profile" || deps.getCurrentView() === "upload");
        viewHomeBackButton.classList.toggle("seller-home-fab", shouldUseFloatingStyle);
      }
      syncMobileHeaderVisibility(true);
    }

    function syncAppChromeOffsets() {
      const appContainer = deps.getAppContainer();
      const topBar = deps.getTopBar();
      const bottomNav = deps.getBottomNav();
      const authContainer = deps.getAuthContainer();
      if (!appContainer || !topBar || !bottomNav) {
        return;
      }

      if (authContainer?.style.display !== "none") {
        appContainer.style.paddingTop = "";
        appContainer.style.paddingBottom = "";
        return;
      }

      const topBarPosition = window.getComputedStyle(topBar).position;
      const bottomNavPosition = window.getComputedStyle(bottomNav).position;
      const isBottomNavVisible = shouldShowBottomNav() && window.getComputedStyle(bottomNav).display !== "none";
      const uiState = deps.getUiRuntimeState();
      const measuredTopBarHeight = Math.ceil(topBar.getBoundingClientRect().height);
      const isMobileHomeHeader = getViewportWidth() <= 720 && deps.getCurrentView() === "home";
      if (isMobileHomeHeader
        && (uiState.mobileHeaderState || MOBILE_HEADER_STATE.FULL) === MOBILE_HEADER_STATE.FULL
        && measuredTopBarHeight > 0) {
        uiState.mobileHeaderFullHeight = measuredTopBarHeight;
      }
      const stableTopBarHeight = isMobileHomeHeader && Number(uiState.mobileHeaderFullHeight || 0) > 0
        ? Number(uiState.mobileHeaderFullHeight)
        : measuredTopBarHeight;
      const topPadding = topBarPosition === "fixed"
        ? stableTopBarHeight + 20
        : 16;
      const bottomPadding = isBottomNavVisible && bottomNavPosition === "fixed"
        ? Math.ceil(bottomNav.getBoundingClientRect().height) + 24
        : 16;
      appContainer.style.paddingTop = `${topPadding}px`;
      appContainer.style.paddingBottom = `${bottomPadding}px`;
      appContainer.style.setProperty("--app-top-offset", `${topPadding}px`);
    }

    function scheduleChromeOffsetSync() {
      const uiState = deps.getUiRuntimeState();
      if (uiState.chromeResizeFrame) {
        cancelAnimationFrame(uiState.chromeResizeFrame);
      }

      uiState.chromeResizeFrame = requestAnimationFrame(() => {
        uiState.chromeResizeFrame = 0;
        syncAppChromeOffsets();
      });
    }

    return {
      shouldShowBottomNav,
      shouldShowPostProductFab,
      shouldShowViewHomeBack,
      isMobileHeaderAutoHideEnabled,
      setMobileHeaderState,
      setMobileHeaderHidden,
      syncMobileHeaderVisibility,
      scheduleMobileHeaderScrollSync,
      updateMarketplaceActionChrome,
      syncAppChromeOffsets,
      scheduleChromeOffsetSync
    };
  }

  window.WingaModules.navigation.createNavigationChromeModule = createNavigationChromeModule;
})();
