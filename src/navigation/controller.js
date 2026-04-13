(() => {
  function createNavigationControllerModule(deps) {
    function bindHeaderEntryActions() {
      deps.getHeaderLoginButton?.()?.addEventListener("click", () => {
        deps.clearPendingGuestIntent();
        deps.openAuthModal("login", { role: "buyer" });
      });

      deps.getHeaderSignupButton?.()?.addEventListener("click", () => {
        deps.clearPendingGuestIntent();
        deps.openAuthModal("signup", { role: "buyer" });
      });

      deps.getHeaderUserTrigger?.()?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deps.renderHeaderUserMenu();
        deps.toggleHeaderUserMenu();
      });

      deps.getHeaderUserDropdown?.()?.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-header-menu-action]");
        if (!actionButton) {
          return;
        }

        event.preventDefault();
        const action = actionButton.dataset.headerMenuAction;
        deps.reportEvent?.("info", "header_menu_action", "Header menu action selected.", {
          action,
          role: deps.getCurrentSession()?.role || ""
        });

        if (action === "profile") {
          deps.openProfileSection("");
          return;
        }
        if (action === "orders") {
          deps.openProfileSection("profile-orders-panel");
          return;
        }
        if (action === "messages") {
          deps.openProfileSection("profile-messages-panel");
          return;
        }
        if (action === "notifications") {
          deps.openProfileSection("profile-notifications-panel");
          return;
        }
        if (action === "admin" && deps.isStaffUser()) {
          deps.toggleHeaderUserMenu(false);
          deps.setCurrentViewState("admin", { syncHistory: "push" });
          deps.renderCurrentView();
          return;
        }
        if (action === "logout") {
          deps.toggleHeaderUserMenu(false);
          deps.logout();
        }
      });
    }

    function bindPublicEntryActions() {
      deps.getAuthGateLoginButton?.()?.addEventListener("click", () => {
        deps.openAuthModal("login", {
          gated: true,
          role: "buyer",
          title: deps.getAuthGateTitle(),
          message: deps.getAuthGateMessage()
        });
      });

      deps.getAuthGateSignupButton?.()?.addEventListener("click", () => {
        deps.openAuthModal("signup", {
          gated: true,
          role: "buyer",
          title: deps.getAuthGateTitle(),
          message: deps.getAuthGateMessage()
        });
      });

      deps.getAuthCloseButton?.()?.addEventListener("click", () => {
        deps.closeAuthModal();
      });

      deps.getAuthContainer?.()?.addEventListener("click", (event) => {
        if (event.target === deps.getAuthContainer?.()) {
          deps.closeAuthModal();
        }
      });

      Array.from(deps.getPublicAuthButtons?.() || []).forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          deps.clearPendingGuestIntent();
          deps.openAuthModal(button.dataset.publicAuth === "signup" ? "signup" : "login", { role: "buyer" });
        });
      });

      Array.from(deps.getPublicLinkButtons?.() || []).forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          deps.setCurrentViewState("home", { syncHistory: "push" });
          deps.renderCurrentView();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    }

    function bindPrimaryNav() {
      Array.from(deps.getNavItems?.() || []).forEach((item) => {
        item.addEventListener("click", () => {
          const targetView = item.dataset.view;
          if (!deps.canAccessView(targetView)) {
            alert(deps.getAccessDeniedMessage(targetView));
            deps.setCurrentViewState("home", { syncHistory: "push" });
            deps.renderCurrentView();
            return;
          }

          deps.setCurrentViewState(targetView, { syncHistory: "push" });
          deps.closeMobileSearch();
          deps.renderCurrentView();
        });
      });
    }

    function bindMarketplaceCardActions() {
      if (typeof document === "undefined" || document.body?.dataset.marketplaceActionsBound === "true") {
        return;
      }
      document.body.dataset.marketplaceActionsBound = "true";

      document.addEventListener("click", (event) => {
        const requestButton = event.target.closest("[data-request-product]");
        if (requestButton) {
          event.preventDefault();
          event.stopPropagation();
          deps.toggleProductInRequestBoxById(requestButton.dataset.requestProduct);
          return;
        }

        const ownMessagesButton = event.target.closest("[data-open-own-messages]");
        if (ownMessagesButton) {
          event.preventDefault();
          event.stopPropagation();
          deps.openOwnProductMessages(ownMessagesButton.dataset.openOwnMessages);
          return;
        }

        const chatButton = event.target.closest("[data-chat-product]");
        if (chatButton) {
          event.preventDefault();
          event.stopPropagation();
          deps.openProductChatFromCard(chatButton.dataset.chatProduct);
          return;
        }

        // Product card opening is owned by the card renderers themselves.
        // Keep this global delegate focused on request/chat actions only.
      }, true);
    }

    return {
      bindHeaderEntryActions,
      bindPublicEntryActions,
      bindPrimaryNav,
      bindMarketplaceCardActions
    };
  }

  window.WingaModules.navigation.createNavigationControllerModule = createNavigationControllerModule;
})();
