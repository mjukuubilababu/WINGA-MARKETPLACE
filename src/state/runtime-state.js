(() => {
  function createRuntimeState() {
    return {
      ui: {
        slideIndex: 0,
        slideshowTimer: null,
        chromeResizeFrame: 0,
        renderFrame: 0,
        mobileHeaderLastScrollY: 0,
        mobileHeaderLastToggleY: 0,
        mobileHeaderHidden: false,
        mobileHeaderScrollFrame: 0,
        lastScrollActivityAt: 0,
        homeScrollSaveFrame: 0,
        homeScrollRestoreFrame: 0,
        homeScrollRestorePending: false,
        homeScrollRestoreY: 0
      },
      search: {
        activeImageSearch: null,
        isSearchDropdownDismissed: false,
        isInputFocused: false,
        isMobileSearchOpen: false,
        isMobileCategoryOpen: false,
        mobileCategoryTopValue: "",
        renderDebounceTimer: 0
      },
      profile: {
        pendingSection: "",
        activeSection: "profile-products-panel",
        isHeaderUserMenuOpen: false
      }
    };
  }

  window.WingaModules.state.createRuntimeState = createRuntimeState;
})();
