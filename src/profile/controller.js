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

    function setSellerUpgradeFormVisibility(open = false) {
      const form = document.getElementById("profile-seller-upgrade-form");
      if (!form) {
        return;
      }
      form.style.display = open ? "grid" : "none";
      if (open) {
        document.getElementById("profile-seller-upgrade-full-name")?.focus();
      }
    }

    async function submitSellerUpgradeForm() {
      const fullName = String(document.getElementById("profile-seller-upgrade-full-name")?.value || "").trim();
      const phoneNumber = String(document.getElementById("profile-seller-upgrade-phone-number")?.value || "").trim();
      const primaryCategory = String(document.getElementById("profile-seller-upgrade-category")?.value || "").trim();

      if (fullName.length < 3) {
        deps.showInAppNotification?.({
          title: "Store name required",
          body: "Jina la duka linahitajika kabla ya kuendelea.",
          variant: "warning"
        });
        return;
      }

      if (!phoneNumber) {
        deps.showInAppNotification?.({
          title: "Phone required",
          body: "Weka namba ya simu kabla ya kuendelea.",
          variant: "warning"
        });
        return;
      }

      if (!/^\+?[0-9][0-9\s-]{7,19}$/.test(phoneNumber)) {
        deps.showInAppNotification?.({
          title: "Phone required",
          body: "Weka namba ya simu sahihi.",
          variant: "warning"
        });
        return;
      }

      if (primaryCategory && primaryCategory.length < 2) {
        deps.showInAppNotification?.({
          title: "Category required",
          body: "Category ya seller si sahihi.",
          variant: "warning"
        });
        return;
      }

      const submitButton = document.querySelector("[data-submit-seller-upgrade]");
      const cancelButton = document.querySelector("[data-close-seller-upgrade]");
      submitButton?.setAttribute("disabled", "disabled");
      if (cancelButton) {
        cancelButton.setAttribute("disabled", "disabled");
      }

      try {
        const updatedSession = await deps.dataLayer.upgradeBuyerToSeller({
          fullName,
          phoneNumber,
          primaryCategory,
        });
        if (!updatedSession?.username) {
          throw new Error("Seller upgrade haikufaulu.");
        }
        deps.mergeSessionState(updatedSession);
        deps.saveSessionUser();
        deps.renderHeaderUserMenu();
        deps.showInAppNotification?.({
          title: "Seller upgrade complete",
          body: "Akaunti yako sasa ni seller. Bila kutoka profile, unaweza kuanza kuuza.",
          variant: "success"
        });
        deps.renderCurrentView?.();
      } catch (error) {
        deps.captureError?.("seller_upgrade_failed", error, {
          user: deps.getCurrentUser()
        });
        deps.showInAppNotification?.({
          title: "Seller upgrade failed",
          body: error.message || "Imeshindikana kuupgrade account kwa sasa.",
          variant: "error"
        });
      } finally {
        submitButton?.removeAttribute("disabled");
        if (cancelButton) {
          cancelButton.removeAttribute("disabled");
        }
      }
    }

    function handleProfileAction(action, profileDiv) {
      if (!action) {
        return;
      }
      if (action === "products") {
        deps.setActiveProfileSection?.("profile-products-panel");
        deps.setPendingProfileSection?.("profile-products-panel");
        deps.flushPendingProfileSection?.();
        return;
      }
      if (action === "unread") {
        deps.setProfileMessagesFilter?.("unread");
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.setActiveChatContext?.(null);
        deps.setCurrentMessageDraft?.("");
        deps.setSelectedChatProductIds?.([]);
        deps.setActiveChatReplyMessageId?.("");
        deps.setOpenChatMessageMenuId?.("");
        deps.setOpenEmojiScope?.("");
        deps.setActiveProfileSection?.("profile-messages-panel");
        deps.setPendingProfileSection?.("profile-messages-panel");
        deps.renderProfile?.();
        return;
      }
      if (action === "messages") {
        deps.setProfileMessagesFilter?.("all");
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.setActiveChatContext?.(null);
        deps.setCurrentMessageDraft?.("");
        deps.setSelectedChatProductIds?.([]);
        deps.setActiveChatReplyMessageId?.("");
        deps.setOpenChatMessageMenuId?.("");
        deps.setOpenEmojiScope?.("");
        deps.setActiveProfileSection?.("profile-messages-panel");
        deps.setPendingProfileSection?.("profile-messages-panel");
        deps.renderProfile?.();
        return;
      }
      if (action === "seller-upgrade") {
        deps.setActiveProfileSection?.("profile-seller-upgrade-panel");
        deps.setPendingProfileSection?.("profile-seller-upgrade-panel");
        deps.flushPendingProfileSection?.();
      }
    }

    function bindProfileEntryActions() {
      const profileDiv = deps.getOrCreateProfileDiv();
      if (!profileDiv) {
        return;
      }
      if (profileDiv.dataset.profileActionBound !== "true") {
        profileDiv.dataset.profileActionBound = "true";
        profileDiv.addEventListener("click", (event) => {
          const closeMessagesTarget = event.target?.closest?.("[data-close-profile-messages]");
          if (closeMessagesTarget) {
            event.preventDefault();
            event.stopPropagation();
            deps.setProfileMessagesMode?.("list");
            deps.setProfileHasSelection?.(false);
            deps.setActiveChatContext?.(null);
            deps.setActiveProfileSection?.("profile-products-panel");
            deps.setPendingProfileSection?.("profile-products-panel");
            renderProfile();
            return;
          }
          const openSellerUpgradeTarget = event.target?.closest?.("[data-open-seller-upgrade]");
          if (openSellerUpgradeTarget) {
            event.preventDefault();
            event.stopPropagation();
            setSellerUpgradeFormVisibility(true);
            return;
          }
          const closeSellerUpgradeTarget = event.target?.closest?.("[data-close-seller-upgrade]");
          if (closeSellerUpgradeTarget) {
            event.preventDefault();
            event.stopPropagation();
            setSellerUpgradeFormVisibility(false);
            return;
          }
          const openNotificationPermissionTarget = event.target?.closest?.("[data-open-notification-permission]");
          if (openNotificationPermissionTarget) {
            event.preventDefault();
            event.stopPropagation();
            deps.openNotificationPermissionPrompt?.("profile", {
              title: "Keep your Winga activity in sync",
              body: "Turn on notifications so you do not miss new messages, order updates, and important activity."
            });
            return;
          }
          const submitSellerUpgradeTarget = event.target?.closest?.("[data-submit-seller-upgrade]");
          if (submitSellerUpgradeTarget) {
            event.preventDefault();
            event.stopPropagation();
            submitSellerUpgradeForm();
            return;
          }
          const target = event.target?.closest?.("[data-profile-action]");
          if (!target) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          handleProfileAction(target.dataset.profileAction || "", profileDiv);
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
      const userProducts = products
        .filter((product) => product.uploadedBy === currentUser)
        .sort((first, second) => {
          const secondTime = new Date(second.createdAt || second.updatedAt || second.timestamp || 0).getTime();
          const firstTime = new Date(first.createdAt || first.updatedAt || first.timestamp || 0).getTime();
          return secondTime - firstTime;
        });
      const conversationSummaries = deps.getConversationSummaries ? deps.getConversationSummaries() : [];
      const totalUnreadMessages = deps.getTotalUnreadMessages ? deps.getTotalUnreadMessages() : 0;
      const conversationCount = conversationSummaries.length;
      const userProfile = {
        ...(deps.getMarketplaceUser(currentUser) || {}),
        ...(currentSession || {})
      };
      const normalizedProfileStatus = String(userProfile?.status || "")
        .trim()
        .toLowerCase();
      const safeProfileStatus = normalizedProfileStatus && normalizedProfileStatus !== "null" && normalizedProfileStatus !== "undefined"
        ? normalizedProfileStatus
        : "";
      const isBuyerOnly = deps.isBuyerUser();
      const hasBuyerAccess = deps.canUseBuyerFeatures();
      const canUpgradeToSeller = userProfile?.role === "buyer";
      const activeSection = deps.getActiveProfileSection?.() || "profile-products-panel";

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
        const activePromotions = Array.isArray(deps.getActivePromotions?.())
          ? deps.getActivePromotions()
          : [];
        const canGetVerified = userProfile?.role === "seller" && !userProfile?.verifiedSeller;
        profileDiv.dataset.activeSection = activeSection;
        profileDiv.replaceChildren(deps.createProfileShellElement({
          displayName: deps.getCurrentDisplayName(),
          accountMeta: `${isBuyerOnly ? "Akaunti yako ya mteja" : deps.canUseSellerFeatures() ? "Akaunti ya muuzaji yenye access ya mteja" : "Simamia akaunti yako"}${safeProfileStatus && safeProfileStatus !== "active" ? ` | ${safeProfileStatus}` : ""}`,
          stats: [
            {
              value: userProducts.length,
              label: "Products",
              action: "products"
            },
            {
              value: totalUnreadMessages,
              label: "Unread",
              action: "unread"
            },
            {
              value: conversationCount,
              label: "Messages",
              action: "messages"
            }
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
          sellerUpgradeMarkup: deps.createSellerUpgradeSectionElement?.({
            canUpgradeToSeller,
            canGetVerified,
            fullName: deps.getCurrentDisplayName(),
            phoneNumber: userProfile?.phoneNumber || userProfile?.whatsappNumber || "",
            primaryCategory: userProfile?.primaryCategory || "",
          }),
          promotionsMarkup: deps.createPromotionOverviewSectionElement({
            canUseSellerFeatures: deps.canUseSellerFeatures(),
            activePromotionsCount: activePromotions.filter((promotion) => promotion.sellerUsername === currentUser).length,
            promotionOptions: deps.getPromotionOptions()
          }),
          requestsMarkup: deps.renderRequestBoxSection(),
          ordersMarkup: deps.createOrdersSectionElement(deps.getCurrentOrders()),
          notificationsMarkup: deps.renderNotificationsSection(),
          messagesMarkup: deps.renderMessagesSection(),
          notificationPermissionState: deps.getNotificationPermissionState?.(),
          hasBuyerAccess,
          requestCount: deps.getRequestBoxItemCount(),
          canGetVerified
        }));
        if (activeSection === "profile-messages-panel") {
          profileDiv.appendChild(deps.createElement("button", {
            className: "profile-messages-fab message-panel-close",
            textContent: "Back to profile",
            attributes: {
              type: "button",
              "data-close-profile-messages": "true",
              "aria-label": "Back to profile"
            }
          }));
        }
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

      deps.setActiveProfileSection?.(activeSection);
      deps.flushPendingProfileSection();
      bindProfileEntryActions();
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

      const preloadRegistry = new Set();
      const priorityTileLimit = Math.max(9, (deps.getProductsPerRow?.() || 3) * 3);
      let renderedTileCount = 0;
      const preloadProfileImage = (imageSrc) => {
        if (!deps.preloadImageSource) {
          return;
        }
        const safeSrc = String(imageSrc || "").trim();
        if (!safeSrc || preloadRegistry.has(safeSrc)) {
          return;
        }
        preloadRegistry.add(safeSrc);
        deps.preloadImageSource(safeSrc, { fetchPriority: "high" });
      };

      const productCards = document.createDocumentFragment();
      userProducts.forEach((product) => {
        const rawImages = Array.isArray(product?.images)
          ? product.images
          : product?.images
            ? [product.images]
            : [];
        const imageSources = rawImages
          .map((image) => typeof image === "string" ? image.trim() : "")
          .filter(Boolean);
        if (!imageSources.length && product?.image) {
          imageSources.push(String(product.image).trim());
        }
        if (!imageSources.length) {
          imageSources.push("");
        }
        imageSources.forEach((imageSrc) => {
          if (renderedTileCount < priorityTileLimit) {
            preloadProfileImage(imageSrc);
          }
          const card = deps.createProfileProductCardElement(product, imageSrc, {
            isPriority: renderedTileCount < priorityTileLimit
          });
          if (card) {
            productCards.appendChild(card);
          }
          renderedTileCount += 1;
        });
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
