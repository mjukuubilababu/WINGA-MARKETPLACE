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
      let activeActionTouchCard = null;
      let activeActionTouchClearTimer = 0;

      function clearActiveActionTouchTimer() {
        if (activeActionTouchClearTimer) {
          window.clearTimeout(activeActionTouchClearTimer);
          activeActionTouchClearTimer = 0;
        }
      }

      function clearActiveActionTouchState() {
        clearActiveActionTouchTimer();
        if (!activeActionTouchCard) {
          return;
        }
        activeActionTouchCard.classList.remove("is-action-touching");
        activeActionTouchCard = null;
      }

      function scheduleActiveActionTouchStateClear() {
        clearActiveActionTouchTimer();
        activeActionTouchClearTimer = window.setTimeout(() => {
          activeActionTouchClearTimer = 0;
          if (!activeActionTouchCard) {
            return;
          }
          activeActionTouchCard.classList.remove("is-action-touching");
          activeActionTouchCard = null;
        }, 180);
      }

      function markActionTouchState(target) {
        clearActiveActionTouchState();
        const card = target.closest(".showcase-card, .seller-product-card");
        if (!card) {
          return;
        }
        activeActionTouchCard = card;
        activeActionTouchCard.classList.add("is-action-touching");
      }

      document.addEventListener("pointerdown", (event) => {
        if (event.pointerType && event.pointerType !== "touch") {
          return;
        }
        const actionButton = event.target.closest(
          "[data-buy-product], [data-request-product], [data-open-own-messages], [data-chat-product]"
        );
        if (!actionButton) {
          return;
        }
        markActionTouchState(actionButton);
      }, true);

      document.addEventListener("pointerup", clearActiveActionTouchState, true);
      document.addEventListener("pointercancel", clearActiveActionTouchState, true);
      document.addEventListener("touchend", clearActiveActionTouchState, true);
      document.addEventListener("touchcancel", clearActiveActionTouchState, true);
      window.addEventListener("blur", clearActiveActionTouchState);

      document.addEventListener("click", (event) => {
        const buyButton = event.target.closest("[data-buy-product]");
        if (buyButton) {
          scheduleActiveActionTouchStateClear();
          const productId = buyButton.dataset.buyProduct || "";
          if (!productId) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (!deps.isAuthenticatedUser?.()) {
            deps.promptGuestAuth?.({
              preferredMode: "signup",
              role: "buyer",
              title: "You need an account to continue",
              message: "Sign up or log in to open product details and other marketplace actions.",
              intent: { type: "focus-product", productId }
            });
            return;
          }
          deps.openProductDetailModal?.(productId);
          return;
        }

        const requestButton = event.target.closest("[data-request-product]");
        if (requestButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.toggleProductInRequestBoxById(requestButton.dataset.requestProduct);
          return;
        }

        const ownMessagesButton = event.target.closest("[data-open-own-messages]");
        if (ownMessagesButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.openOwnProductMessages(ownMessagesButton.dataset.openOwnMessages);
          return;
        }

        const chatButton = event.target.closest("[data-chat-product]");
        if (chatButton) {
          scheduleActiveActionTouchStateClear();
          event.preventDefault();
          event.stopPropagation();
          deps.openProductChatFromCard(chatButton.dataset.chatProduct);
          return;
        }

        const sellerCardOpenTrigger = event.target.closest(".seller-product-card[data-open-product], .seller-product-card [data-open-product]");
        if (sellerCardOpenTrigger) {
          scheduleActiveActionTouchStateClear();
          const productId = sellerCardOpenTrigger.dataset.openProduct
            || sellerCardOpenTrigger.closest(".seller-product-card")?.dataset?.openProduct
            || "";
          if (!productId) {
            return;
          }
          event.preventDefault();
          event.__wingaProductOpenHandled = true;
          if (!deps.isAuthenticatedUser?.()) {
            deps.promptGuestAuth?.({
              preferredMode: "signup",
              role: "buyer",
              title: "You need an account to continue",
              message: "Sign up or log in to open product details and other marketplace actions.",
              intent: { type: "focus-product", productId }
            });
            return;
          }
          deps.openProductDetailModal?.(productId);
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
