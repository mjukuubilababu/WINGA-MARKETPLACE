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
        mobileHeaderScrollFrame: 0
      },
      search: {
        activeImageSearch: null,
        isSearchDropdownDismissed: false,
        isMobileSearchOpen: false,
        isMobileCategoryOpen: false,
        renderDebounceTimer: 0
      },
      profile: {
        pendingSection: "",
        isHeaderUserMenuOpen: false
      }
    };
  }

  window.WingaModules.state.createRuntimeState = createRuntimeState;
})();
