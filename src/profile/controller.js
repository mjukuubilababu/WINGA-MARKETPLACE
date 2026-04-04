(() => {
  function createProfileControllerModule(deps) {
    let renderSequence = 0;

    function isRenderActive(sequence) {
      if (sequence !== renderSequence) {
        return false;
      }
      if (typeof deps.getCurrentView === "function" && deps.getCurrentView() !== "profile") {
        return false;
      }
      return true;
    }

    function bindWhatsappNumberActions() {
      const toggleButton = document.getElementById("profile-whatsapp-change-toggle");
      const form = document.getElementById("profile-whatsapp-change-form");
      const input = document.getElementById("profile-whatsapp-input");
      const requestButton = document.getElementById("profile-whatsapp-request-button");
      const codeInput = document.getElementById("profile-whatsapp-code");
      const verifyButton = document.getElementById("profile-whatsapp-verify-button");
      const cancelButton = document.getElementById("profile-whatsapp-cancel-button");

      if (toggleButton && toggleButton.dataset.bound !== "true") {
        toggleButton.dataset.bound = "true";
        toggleButton.addEventListener("click", () => {
          if (!form) {
            return;
          }
          form.style.display = form.style.display === "none" ? "grid" : "none";
          if (form.style.display !== "none") {
            input?.focus();
          }
        });
      }

      if (cancelButton && cancelButton.dataset.bound !== "true") {
        cancelButton.dataset.bound = "true";
        cancelButton.addEventListener("click", () => {
          if (form) {
            form.style.display = "none";
          }
        });
      }

      if (requestButton && requestButton.dataset.bound !== "true") {
        requestButton.dataset.bound = "true";
        requestButton.addEventListener("click", async () => {
          const whatsappNumber = deps.normalizePhoneNumber?.(input?.value || "") || "";
          if (!whatsappNumber || whatsappNumber.length < 10) {
            deps.showInAppNotification?.({
              title: "WhatsApp required",
              body: "Weka namba mpya ya WhatsApp sahihi kwanza.",
              variant: "warning"
            });
            return;
          }

          requestButton.disabled = true;
          try {
            const result = await deps.dataLayer.requestWhatsappChange({ whatsappNumber });
            deps.mergeSessionState({
              whatsappVerificationStatus: "pending",
              pendingWhatsappNumber: result?.pendingWhatsappNumber || whatsappNumber,
              pendingWhatsappExpiresAt: result?.expiresAt || ""
            });
            deps.saveSessionUser();
            deps.renderHeaderUserMenu();
            deps.showInAppNotification?.({
              title: "Verification code sent",
              body: result?.deliveryMode === "preview" && result?.previewCode
                ? `Preview code: ${result.previewCode}`
                : "Tumetuma verification code ya WhatsApp. Iweke hapa chini kuthibitisha.",
              variant: "success",
              durationMs: result?.deliveryMode === "preview" ? 7000 : 4200
            });
            renderProfile();
          } catch (error) {
            deps.captureError?.("profile_whatsapp_request_failed", error, {
              user: deps.getCurrentUser()
            });
            deps.showInAppNotification?.({
              title: "WhatsApp change failed",
              body: error.message || "Imeshindikana kuomba verification code ya WhatsApp.",
              variant: "error"
            });
          } finally {
            requestButton.disabled = false;
          }
        });
      }

      if (verifyButton && verifyButton.dataset.bound !== "true") {
        verifyButton.dataset.bound = "true";
        verifyButton.addEventListener("click", async () => {
          const code = String(codeInput?.value || "").trim();
          if (!/^\d{6}$/.test(code)) {
            deps.showInAppNotification?.({
              title: "Verification code required",
              body: "Weka verification code ya tarakimu 6.",
              variant: "warning"
            });
            return;
          }

          verifyButton.disabled = true;
          try {
            const updatedUser = await deps.dataLayer.verifyWhatsappChange({ code });
            const resolvedWhatsappNumber = deps.normalizePhoneNumber?.(
              updatedUser?.whatsappNumber
                || updatedUser?.phoneNumber
                || deps.getMarketplaceUser?.(deps.getCurrentUser())?.whatsappNumber
                || input?.value
                || ""
            ) || "";
            deps.mergeSessionState({
              ...updatedUser,
              whatsappNumber: resolvedWhatsappNumber,
              pendingWhatsappNumber: "",
              pendingWhatsappExpiresAt: "",
              whatsappVerificationStatus: "verified"
            });
            deps.saveSessionUser();
            deps.renderHeaderUserMenu();
            deps.showInAppNotification?.({
              title: "WhatsApp verified",
              body: "WhatsApp number yako mpya imehakikiwa na sasa inatumika kwenye bidhaa zako.",
              variant: "success"
            });
            renderProfile();
          } catch (error) {
            deps.captureError?.("profile_whatsapp_verify_failed", error, {
              user: deps.getCurrentUser()
            });
            deps.showInAppNotification?.({
              title: "Verification failed",
              body: error.message || "Imeshindikana kuthibitisha WhatsApp number.",
              variant: "error"
            });
          } finally {
            verifyButton.disabled = false;
          }
        });
      }
    }

    function bindProfileIdentityActions() {
      const profilePhotoInput = document.getElementById("profile-photo-input");
      const profilePhotoStatus = document.getElementById("profile-photo-status");
      if (!profilePhotoInput || profilePhotoInput.dataset.bound === "true") {
        bindWhatsappNumberActions();
        return;
      }

      profilePhotoInput.dataset.bound = "true";
      profilePhotoInput.addEventListener("change", async (event) => {
        const activeInput = event.currentTarget;
        const file = activeInput?.files?.[0];
        const statusNode = document.getElementById("profile-photo-status") || profilePhotoStatus;
        if (!file) {
          return;
        }

        try {
          if (activeInput) {
            activeInput.disabled = true;
          }
          deps.validateSingleImageFile(file, "Profile photo");
          if (statusNode) {
            statusNode.innerText = "Tunapakia profile photo...";
          }
          const profileImage = await deps.readFileAsDataUrl(file, { purpose: "profile" });
          const updatedUser = await deps.dataLayer.updateUserProfile({ profileImage });
          if (!updatedUser?.username) {
            throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
          }
          deps.mergeSessionState({ ...updatedUser, profileImage: updatedUser.profileImage || profileImage });
          deps.saveSessionUser();
          deps.renderHeaderUserMenu();
          if (statusNode) {
            statusNode.innerText = "Profile photo imehifadhiwa.";
          }
          deps.showInAppNotification?.({
            title: "Profile photo updated",
            body: "Picha yako mpya imehifadhiwa.",
            variant: "success",
            durationMs: 3200
          });
          renderProfile();
        } catch (error) {
          deps.captureError?.("profile_photo_update_failed", error, {
            user: deps.getCurrentUser()
          });
          if (statusNode) {
            statusNode.innerText = "Profile photo ni optional. Ukikosa, initials zitaendelea kuonekana.";
          }
          deps.showInAppNotification?.({
            title: "Profile photo failed",
            body: error.message || "Imeshindikana kuhifadhi profile photo.",
            variant: "error"
          });
        } finally {
          if (activeInput) {
            activeInput.value = "";
            activeInput.disabled = false;
          }
        }
      });

      bindWhatsappNumberActions();
    }

    function renderProfile() {
      const sequence = ++renderSequence;
      deps.hideUploadAndEmptyState();
      const profileDiv = deps.getOrCreateProfileDiv();
      const products = deps.getProducts();
      const currentUser = deps.getCurrentUser();
      const currentSession = deps.getCurrentSession();
      const currentOrders = deps.getCurrentOrders();
      const currentMessages = deps.getCurrentMessages();
      const userProducts = products
        .filter((product) => product.uploadedBy === currentUser)
        .sort((first, second) => {
          const secondTime = new Date(second.createdAt || second.updatedAt || second.timestamp || 0).getTime();
          const firstTime = new Date(first.createdAt || first.updatedAt || first.timestamp || 0).getTime();
          return secondTime - firstTime;
        });
      const totalLikes = userProducts.reduce((sum, product) => sum + (product.likes || 0), 0);
      const totalViews = userProducts.reduce((sum, product) => sum + (product.views || 0), 0);
      const userProfile = {
        ...(deps.getMarketplaceUser(currentUser) || {}),
        ...(currentSession || {})
      };
      const isBuyerOnly = deps.isBuyerUser();
      const hasBuyerAccess = deps.canUseBuyerFeatures();
      const purchaseCount = Array.isArray(currentOrders?.purchases) ? currentOrders.purchases.length : 0;
      const unreadConversations = currentMessages.filter((message) => message.receiverId === currentUser && !message.isRead).length;

      if (deps.canUseSellerFeatures()) {
        deps.dataLayer.loadAnalytics()
          .then((analytics) => {
            if (!isRenderActive(sequence)) {
              return;
            }
            deps.renderAnalyticsPanel(analytics, "Performance Yako", "Muhtasari wa catalog yako");
          })
          .catch((error) => {
            if (!isRenderActive(sequence)) {
              return;
            }
            deps.captureError?.("profile_analytics_load_failed", error, {
              user: currentUser
            });
            deps.renderAnalyticsPanel(null, "Performance Yako", "Muhtasari wa catalog yako");
            deps.showInAppNotification?.({
              title: "Analytics unavailable",
              body: "Performance yako haijapatikana kwa sasa. Tunaonyesha fallback salama.",
              variant: "warning",
              durationMs: 4200
            });
          });
      }

      deps.dataLayer.loadMyOrders()
        .then((orders) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.setCurrentOrders(orders || { purchases: [], sales: [] });
          document.getElementById("profile-orders-panel")?.replaceWith(deps.createOrdersContainerFromState());
          deps.bindMessageActions(profileDiv);
        })
        .catch((error) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.captureError?.("profile_orders_load_failed", error, {
            user: currentUser
          });
          deps.setCurrentOrders({ purchases: [], sales: [] });
          document.getElementById("profile-orders-panel")?.replaceWith(deps.createOrdersContainerFromState());
          deps.bindMessageActions(profileDiv);
          deps.showInAppNotification?.({
            title: "Orders unavailable",
            body: "Orders hazikupatikana kwa sasa. Jaribu tena baada ya muda mfupi.",
            variant: "warning",
            durationMs: 4200
          });
        });

      deps.dataLayer.loadMessages()
        .then((messages) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.setCurrentMessages(Array.isArray(messages) ? messages : []);
          deps.syncActiveChatContext();
          deps.replaceMessagesPanel(profileDiv);
          deps.markActiveConversationRead().catch(() => {});
          deps.startMessagePolling();
        })
        .catch((error) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.captureError?.("profile_messages_load_failed", error, {
            user: currentUser
          });
          deps.setCurrentMessages([]);
          deps.syncActiveChatContext();
          deps.replaceMessagesPanel(profileDiv);
          deps.showInAppNotification?.({
            title: "Messages unavailable",
            body: "Inbox haikuweza ku-refresh kwa sasa.",
            variant: "warning",
            durationMs: 4200
          });
        });

      deps.dataLayer.loadNotifications()
        .then((notifications) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.setCurrentNotifications(Array.isArray(notifications) ? notifications : []);
          deps.updateProfileNavBadge();
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
          deps.bindMessageActions(profileDiv);
        })
        .catch((error) => {
          if (!isRenderActive(sequence)) {
            return;
          }
          deps.captureError?.("profile_notifications_load_failed", error, {
            user: currentUser
          });
          deps.setCurrentNotifications([]);
          deps.updateProfileNavBadge();
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
          deps.bindMessageActions(profileDiv);
          deps.showInAppNotification?.({
            title: "Notifications unavailable",
            body: "Notifications hazikupatikana kwa sasa.",
            variant: "warning",
            durationMs: 4200
          });
        });

      try {
        profileDiv.replaceChildren(deps.createProfileShellElement({
          displayName: deps.getCurrentDisplayName(),
          accountMeta: `${isBuyerOnly ? "Akaunti yako ya mteja" : deps.canUseSellerFeatures() ? "Akaunti ya muuzaji yenye access ya mteja" : "Simamia akaunti yako"}${userProfile?.status && userProfile.status !== "active" ? ` | ${userProfile.status}` : ""}`,
          stats: [
            { value: deps.canUseSellerFeatures() ? userProducts.length : purchaseCount, label: deps.canUseSellerFeatures() ? "Bidhaa" : "Orders" },
            { value: hasBuyerAccess ? deps.getTotalUnreadMessages() : totalLikes, label: hasBuyerAccess ? "Unread" : "Likes" },
            { value: hasBuyerAccess ? unreadConversations : totalViews, label: hasBuyerAccess ? "Messages" : "Views" }
          ],
          identityMarkup: deps.createProfileIdentitySectionElement(userProfile, {
            displayName: deps.getCurrentDisplayName(),
            profileImage: deps.getCurrentProfileImage(),
            userInitials: deps.getUserInitials(deps.getCurrentDisplayName()),
            roleLabel: userProfile?.role ? deps.getRoleLabel(userProfile.role) : "User",
            whatsappNumber: userProfile?.whatsappNumber || userProfile?.phoneNumber || "",
            whatsappVerificationStatus: userProfile?.whatsappVerificationStatus || "verified",
            pendingWhatsappNumber: userProfile?.pendingWhatsappNumber || ""
          }),
          promotionsMarkup: deps.createPromotionOverviewSectionElement({
            canUseSellerFeatures: deps.canUseSellerFeatures(),
            activePromotionsCount: deps.getActivePromotions().filter((promotion) => promotion.sellerUsername === currentUser).length,
            promotionOptions: deps.getPromotionOptions()
          }),
          requestsMarkup: deps.renderRequestBoxSection(),
          ordersMarkup: deps.createOrdersSectionElement(deps.getCurrentOrders()),
          notificationsMarkup: deps.renderNotificationsSection(),
          messagesMarkup: deps.renderMessagesSection(),
          hasBuyerAccess,
          requestCount: deps.getRequestBoxItemCount()
        }));
      } catch (error) {
        deps.captureError?.("profile_shell_render_failed", error, {
          user: currentUser
        });
        const fallback = deps.createEmptyState
          ? deps.createEmptyState("Profile ilipata hitilafu ya muda. Refresh ukurasa au jaribu tena.")
          : document.createTextNode("Profile ilipata hitilafu ya muda.");
        profileDiv.replaceChildren(fallback);
        profileDiv.style.display = "block";
        return;
      }

      deps.flushPendingProfileSection();
      const container = document.getElementById("user-products-container");

      if (userProducts.length === 0) {
        deps.setEmptyCopy(
          container,
          isBuyerOnly
            ? "Akaunti ya buyer iko tayari. Endelea kuvinjari bidhaa, kutafuta bidhaa, ku-chat na sellers, kufanya malipo, kuweka orders, ku-review, na kureport listings zisizo salama."
            : deps.canUseSellerFeatures()
              ? "No posts yet. Ukihitaji kuongeza bidhaa, nenda Upload uanze kujenga profile grid yako."
              : "Hujapost bidhaa bado. Nenda Upload uanze kuweka catalog yako."
        );
        profileDiv.querySelector("#profile-logout-button")?.addEventListener("click", deps.logout);
        bindProfileIdentityActions();
        deps.bindRequestBoxActions(profileDiv);
        deps.bindMessageActions(profileDiv);
        profileDiv.style.display = "block";
        deps.setResultsMeta(
          "Profile",
          isBuyerOnly
            ? "Hapa utaona orders, notifications, messages, na shughuli zako kama buyer."
            : deps.canUseSellerFeatures()
              ? "Hapa utaona buyer activities zako pamoja na seller catalog na performance yake."
              : "Hapa utaona bidhaa zako na performance yake."
        );
        return;
      }

      const productCards = document.createDocumentFragment();
      userProducts.forEach((product) => {
        const card = deps.createProfileProductCardElement(product);
        if (card) {
          productCards.appendChild(card);
        }
      });
      container.appendChild(productCards);

      container.querySelectorAll(".edit-btn").forEach((button) => {
        button.addEventListener("click", () => deps.startEditProduct(button.dataset.id));
      });

      container.querySelectorAll("[data-profile-product-card]").forEach((card) => {
        card.addEventListener("click", (event) => {
          if (event.target.closest("button, a, .product-menu")) {
            return;
          }
          const productId = card.dataset.profileProductCard;
          if (!productId) {
            return;
          }
          deps.noteProductInterest?.(productId);
          deps.openProductDetailModal?.(productId);
        });
      });

      container.querySelectorAll("[data-promote-product]").forEach((button) => {
        button.addEventListener("click", async () => {
          const product = deps.getProductById ? deps.getProductById(button.dataset.promoteProduct) : deps.getProducts().find((item) => item.id === button.dataset.promoteProduct);
          if (!product) {
            return;
          }

          const selectedType = prompt([
            "Chagua promotion type:",
            "boost = Boost Product (TSh 5,000 / 3 days)",
            "featured = Featured Section (TSh 10,000 / 7 days)",
            "category_boost = Category Boost (TSh 7,000 / 5 days)",
            "pin_top = Pin To Top (TSh 12,000 / 2 days)"
          ].join("\n"), "boost");

          if (!selectedType || !deps.getPromotionOptions()[selectedType]) {
            return;
          }

          const option = deps.getPromotionOptions()[selectedType];
          const transactionReference = prompt([
            "Lipa kwa Mobile Money kwa promotion hii.",
            `Product: ${product.name}`,
            `Promotion: ${option.label}`,
            `Amount: TSh ${deps.formatNumber(option.amount)}`,
            `Use seller number for now: ${product.whatsapp}`,
            "",
            "Baada ya kulipa, weka transaction reference."
          ].join("\n"), "");

          if (!transactionReference || !transactionReference.trim()) {
            return;
          }

          try {
            await deps.dataLayer.createPromotion({
              productId: product.id,
              type: selectedType,
              transactionReference: transactionReference.trim()
            });
            await deps.refreshPromotionsState();
            deps.reportEvent?.("info", "promotion_created", "Seller created a promotion.", {
              productId: product.id,
              type: selectedType
            });
            deps.showInAppNotification?.({
              title: "Promotion submitted",
              body: "Promotion imewasilishwa. Utaiona ikishaingia active au ikireviewiwa.",
              variant: "success"
            });
            renderProfile();
            deps.renderCurrentView();
          } catch (error) {
            deps.captureError?.("promotion_create_failed", error, {
              productId: product.id,
              type: selectedType
            });
            deps.showInAppNotification?.({
              title: "Promotion failed",
              body: error.message || "Promotion imeshindikana.",
              variant: "error"
            });
          }
        });
      });

      container.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", () => deps.deleteProduct(button.dataset.id));
      });

      deps.bindProductMenus(container);
      profileDiv.querySelector("#profile-logout-button")?.addEventListener("click", deps.logout);
      bindProfileIdentityActions();
      deps.bindRequestBoxActions(profileDiv);
      deps.bindMessageActions(profileDiv);

      profileDiv.style.display = "block";
      deps.setResultsMeta(`${userProducts.length} bidhaa zako`, "Hapa unasimamia bidhaa zako zote.");
    }

    return {
      renderProfile,
      bindProfileIdentityActions
    };
  }

  window.WingaModules.profile.createProfileControllerModule = createProfileControllerModule;
})();
