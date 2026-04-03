(() => {
  function createNavigationChromeModule(deps) {
    function shouldShowBottomNav() {
      if (!deps.isAuthenticatedUser()) {
        return false;
      }
      if (deps.canUseSellerFeatures() && !deps.isStaffUser()) {
        return false;
      }
      if (deps.isBuyerUser() && !deps.canUseSellerFeatures()) {
        return false;
      }
      if (!deps.isStaffUser() && deps.getCurrentView() === "home") {
        return false;
      }
      return true;
    }

    function shouldShowPostProductFab() {
      if (!deps.isAuthenticatedUser() || deps.isStaffUser() || !deps.canUseSellerFeatures()) {
        return false;
      }
      if (deps.getCurrentView() !== "home" || deps.getEditingProductId()) {
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
      return currentView === "profile" || currentView === "upload" || currentView === "admin";
    }

    function isMobileHeaderAutoHideEnabled() {
      const searchState = deps.getSearchRuntimeState();
      const profileState = deps.getProfileRuntimeState();
      const chatState = deps.getChatUiState();
      return window.innerWidth <= 720
        && deps.getAppContainer()?.style.display !== "none"
        && deps.getCurrentView() === "home"
        && !document.body.classList.contains("auth-modal-open")
        && !document.body.classList.contains("product-detail-open")
        && !searchState.isMobileSearchOpen
        && !searchState.isMobileCategoryOpen
        && !profileState.isHeaderUserMenuOpen
        && !chatState.isContextOpen;
    }

    function setMobileHeaderHidden(hidden, options = {}) {
      const uiState = deps.getUiRuntimeState();
      const nextHidden = Boolean(hidden) && isMobileHeaderAutoHideEnabled();
      if (uiState.mobileHeaderHidden === nextHidden && !options.force) {
        return;
      }

      uiState.mobileHeaderHidden = nextHidden;
      document.body.classList.toggle("mobile-header-hidden", nextHidden);
      deps.getTopBar()?.setAttribute("data-mobile-header-state", nextHidden ? "hidden" : "visible");
      scheduleChromeOffsetSync();
    }

    function syncMobileHeaderVisibility(force = false) {
      const uiState = deps.getUiRuntimeState();
      if (!isMobileHeaderAutoHideEnabled()) {
        setMobileHeaderHidden(false, { force });
        uiState.mobileHeaderLastScrollY = Math.max(window.scrollY || 0, 0);
        uiState.mobileHeaderLastToggleY = uiState.mobileHeaderLastScrollY;
        return;
      }

      const currentScrollY = Math.max(window.scrollY || 0, 0);
      const previousScrollY = uiState.mobileHeaderLastScrollY || 0;
      const delta = currentScrollY - previousScrollY;
      const nearTopThreshold = 72;
      const hideThreshold = 64;
      const movementThreshold = 8;

      uiState.mobileHeaderLastScrollY = currentScrollY;

      if (currentScrollY <= nearTopThreshold) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        setMobileHeaderHidden(false, { force });
        return;
      }

      if (uiState.mobileHeaderHidden && delta < 0) {
        uiState.mobileHeaderLastToggleY = currentScrollY;
        setMobileHeaderHidden(false);
        return;
      }

      if (Math.abs(delta) < movementThreshold && !force) {
        return;
      }

      if (delta > 0 && !uiState.mobileHeaderHidden) {
        if (currentScrollY - (uiState.mobileHeaderLastToggleY || 0) >= hideThreshold) {
          uiState.mobileHeaderLastToggleY = currentScrollY;
          setMobileHeaderHidden(true);
        }
      }
    }

    function scheduleMobileHeaderScrollSync() {
      const uiState = deps.getUiRuntimeState();
      if (window.innerWidth > 720) {
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
      const postProductFab = deps.getPostProductFab();
      const viewHomeBackButton = deps.getViewHomeBackButton();

      if (bottomNav) {
        bottomNav.style.display = shouldShowBottomNav() ? "grid" : "none";
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
      const topPadding = topBarPosition === "fixed"
        ? Math.ceil(topBar.getBoundingClientRect().height) + 20
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
