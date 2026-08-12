(() => {
  function createProfileControllerModule(deps) {
    let renderSequence = 0;
    const sellerProductPagination = new Map();
    const translate = typeof deps.translate === "function"
      ? deps.translate
      : (_key, _variables, fallbackText = "") => String(fallbackText || "");
    const t = (key, fallbackText = "", variables = {}) => translate(key, variables, fallbackText);

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
      const saveButton = document.getElementById("profile-whatsapp-save-button");
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

      if (saveButton && saveButton.dataset.bound !== "true") {
        saveButton.dataset.bound = "true";
        saveButton.addEventListener("click", async () => {
          const nextWhatsappNumber = deps.normalizePhoneNumber?.(input?.value || "") || "";
          if (!/^\d{10,15}$/.test(nextWhatsappNumber)) {
            deps.showInAppNotification?.({
              title: t("profile.phoneRequiredTitle", "Phone number required"),
              body: t("profile.phoneRequiredBody", "Weka namba ya WhatsApp sahihi yenye tarakimu 10 hadi 15."),
              variant: "warning"
            });
            return;
          }

          const currentPhone = deps.normalizePhoneNumber?.(
            deps.getCurrentSession?.()?.phoneNumber || deps.getCurrentSession?.()?.whatsappNumber || ""
          ) || "";
          if (nextWhatsappNumber === currentPhone && nextWhatsappNumber === deps.normalizePhoneNumber?.(deps.getCurrentSession?.()?.whatsappNumber || "")) {
            deps.showInAppNotification?.({
              title: t("profile.noChangesTitle", "No changes"),
              body: t("profile.noChangesBody", "Namba mpya ni sawa na ile ya sasa."),
              variant: "info"
            });
            return;
          }

          saveButton.disabled = true;
          try {
            const updatedUser = await deps.dataLayer.updateUserProfile({
              phoneNumber: nextWhatsappNumber,
              whatsappNumber: nextWhatsappNumber
            });
            deps.mergeSessionState({
              ...updatedUser,
              phoneNumber: nextWhatsappNumber,
              whatsappNumber: nextWhatsappNumber,
              whatsappVerificationStatus: "verified",
              pendingWhatsappNumber: "",
              pendingWhatsappExpiresAt: ""
            });
            deps.saveSessionUser();
            deps.renderHeaderUserMenu();
            deps.refreshProductsFromStore?.();
            deps.renderCurrentView?.();
            deps.showInAppNotification?.({
              title: t("profile.phoneUpdatedTitle", "Number updated"),
              body: t("profile.phoneUpdatedBody", "Namba yako ya WhatsApp imehifadhiwa na imesasishwa papo hapo."),
              variant: "success"
            });
            renderProfile();
          } catch (error) {
            deps.captureError?.("profile_whatsapp_update_failed", error, {
              user: deps.getCurrentUser()
            });
            deps.showInAppNotification?.({
              title: t("common.updateFailed", "Update failed"),
              body: error.message || t("profile.phoneUpdateFailedBody", "Imeshindikana kuhifadhi namba ya WhatsApp."),
              variant: "error"
            });
          } finally {
            saveButton.disabled = false;
          }
        });
      }
    }

    function bindPaymentDetailsActions() {
      const toggleButton = document.getElementById("profile-payment-change-toggle");
      const form = document.getElementById("profile-payment-change-form");
      const providerInput = document.getElementById("profile-payment-provider-input");
      const numberInput = document.getElementById("profile-payment-number-input");
      const recipientInput = document.getElementById("profile-payment-recipient-input");
      const instructionsInput = document.getElementById("profile-payment-instructions-input");
      const saveButton = document.getElementById("profile-payment-save-button");
      const cancelButton = document.getElementById("profile-payment-cancel-button");

      const ensurePaymentStatusElement = () => {
        if (!form) {
          return null;
        }
        let statusNode = document.getElementById("profile-payment-status");
        if (statusNode) {
          return statusNode;
        }
        statusNode = deps.createElement("p", {
          className: "upload-form-status",
          attributes: {
            id: "profile-payment-status",
            hidden: "hidden",
            "aria-live": "polite"
          }
        });
        const actionsWrap = form.querySelector(".profile-whatsapp-form-actions");
        if (actionsWrap) {
          actionsWrap.insertAdjacentElement("beforebegin", statusNode);
        } else {
          form.appendChild(statusNode);
        }
        return statusNode;
      };

      const setPaymentStatus = (tone = "", message = "") => {
        const statusNode = ensurePaymentStatusElement();
        if (!statusNode) {
          return;
        }
        const safeTone = ["info", "warning", "success", "error"].includes(String(tone || "").trim())
          ? String(tone || "").trim()
          : "";
        const safeMessage = String(message || "").trim();
        if (!safeMessage) {
          statusNode.hidden = true;
          statusNode.textContent = "";
          statusNode.className = "upload-form-status";
          return;
        }
        statusNode.hidden = false;
        statusNode.textContent = safeMessage;
        statusNode.className = `upload-form-status${safeTone ? ` is-${safeTone}` : ""}`;
      };

      if (toggleButton && toggleButton.dataset.bound !== "true") {
        toggleButton.dataset.bound = "true";
        toggleButton.addEventListener("click", () => {
          if (!form) {
            return;
          }
          form.style.display = form.style.display === "none" ? "grid" : "none";
          if (form.style.display !== "none") {
            setPaymentStatus("", "");
            numberInput?.focus();
          }
        });
      }

      if (cancelButton && cancelButton.dataset.bound !== "true") {
        cancelButton.dataset.bound = "true";
        cancelButton.addEventListener("click", () => {
          if (form) {
            form.style.display = "none";
          }
          setPaymentStatus("", "");
        });
      }

      if (saveButton && saveButton.dataset.bound !== "true") {
        saveButton.dataset.bound = "true";
        saveButton.addEventListener("click", async () => {
          setPaymentStatus("info", t("profile.paymentSavingStatus", "Saving your payment details. Keep this section open."));
          const paymentProvider = String(providerInput?.value || "").trim().toLowerCase();
          const paymentNumber = deps.normalizePhoneNumber?.(numberInput?.value || "") || "";
          const paymentRecipientName = String(recipientInput?.value || deps.getCurrentDisplayName?.() || "").trim();
          const paymentInstructions = String(instructionsInput?.value || "").trim();

          if (!paymentNumber || !/^\d{8,20}$/.test(paymentNumber)) {
            setPaymentStatus("error", t("profile.paymentNumberRequiredBody", "Enter a valid payment number with 8 to 20 digits."));
            deps.showInAppNotification?.({
              title: t("profile.paymentNumberRequiredTitle", "Lipa namba required"),
              body: t("profile.paymentNumberRequiredBody", "Weka Lipa namba sahihi yenye tarakimu 8 hadi 20."),
              variant: "warning"
            });
            return;
          }

          if (!paymentRecipientName || paymentRecipientName.length < 2) {
            setPaymentStatus("error", t("profile.recipientRequiredBody", "Enter the payment recipient name."));
            deps.showInAppNotification?.({
              title: t("profile.recipientRequiredTitle", "Recipient required"),
              body: t("profile.recipientRequiredBody", "Weka jina la mpokeaji wa malipo."),
              variant: "warning"
            });
            return;
          }

          saveButton.disabled = true;
          try {
            const updatedUser = await deps.dataLayer.updateUserProfile({
              paymentProvider,
              paymentNumber,
              paymentRecipientName,
              paymentInstructions
            });
            setPaymentStatus("success", t("profile.paymentSavedStatus", "Payment details saved. Buyers can now see them in the payment flow."));
            deps.mergeSessionState({
              ...updatedUser,
              paymentProvider,
              paymentNumber,
              paymentRecipientName,
              paymentInstructions
            });
            deps.saveSessionUser();
            deps.renderHeaderUserMenu();
            deps.renderCurrentView?.();
            deps.showInAppNotification?.({
              title: t("profile.paymentSavedTitle", "Lipa details saved"),
              body: t("profile.paymentSavedBody", "Buyer sasa ataona Lipa namba yako kwenye product detail na chat flow."),
              variant: "success"
            });
            renderProfile();
          } catch (error) {
            setPaymentStatus("error", error.message || t("profile.paymentSaveFailedBody", "We could not save your payment details."));
            deps.captureError?.("profile_payment_update_failed", error, {
              user: deps.getCurrentUser()
            });
            deps.showInAppNotification?.({
              title: t("common.updateFailed", "Update failed"),
              body: error.message || t("profile.paymentSaveFailedBody", "Imeshindikana kuhifadhi Lipa details."),
              variant: "error"
            });
          } finally {
            saveButton.disabled = false;
          }
        });
      }
    }

    function formatSessionDate(value = "") {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) {
        return "Unknown";
      }
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    function renderSessionSecurityList(payload = {}) {
      const list = document.getElementById("profile-session-list");
      if (!list) {
        return;
      }
      const sessions = Array.isArray(payload.items) ? payload.items : [];
      list.replaceChildren();
      if (!sessions.length) {
        list.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: t("session.empty", "No active sessions were found.")
        }));
        return;
      }
      sessions.forEach((session) => {
        const card = deps.createElement("div", { className: "orders-card profile-session-card" });
        const riskLevel = String(session.riskLevel || "low").toLowerCase();
        const title = t("session.deviceTitle", "{deviceState} | {deviceType}", {
          deviceState: session.current ? t("session.currentDevice", "Current device") : t("session.otherDevice", "Other device"),
          deviceType: session.deviceType || t("common.unknown", "unknown")
        });
        card.append(
          deps.createElement("strong", { textContent: title }),
          deps.createElement("small", {
            textContent: t("session.lastSeen", "Last seen: {date}", { date: formatSessionDate(session.lastSeenAt || session.createdAt) })
          }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: session.stepUpVerifiedAt
              ? t("session.riskVerified", "Risk: {risk} | verified {date}", { risk: riskLevel, date: formatSessionDate(session.stepUpVerifiedAt) })
              : t("session.risk", "Risk: {risk}", { risk: riskLevel })
          })
        );
        if (!session.current) {
          card.appendChild(deps.createElement("button", {
            className: "action-btn action-btn-secondary",
            textContent: t("session.revokeAction", "Revoke session"),
            attributes: {
              type: "button",
              "data-revoke-session": session.sessionId
            }
          }));
        }
        list.appendChild(card);
      });
    }

    async function loadProfileSessionSecurity(sequence) {
      const list = document.getElementById("profile-session-list");
      if (!list || typeof deps.dataLayer?.loadActiveSessions !== "function") {
        return;
      }
      try {
        const payload = await deps.dataLayer.loadActiveSessions();
        if (!isRenderActive(sequence)) {
          return;
        }
        renderSessionSecurityList(payload);
      } catch (error) {
        deps.captureError?.("profile_sessions_load_failed", error, {
          user: deps.getCurrentUser?.()
        });
        if (isRenderActive(sequence)) {
          list.replaceChildren(deps.createElement("p", {
            className: "empty-copy",
            textContent: t("session.listUnavailable", "The session list is unavailable. Try again later.")
          }));
        }
      }
    }

    function bindSessionSecurityActions(sequence) {
      const form = document.getElementById("profile-session-stepup-form");
      if (form && form.dataset.bound !== "true") {
        form.dataset.bound = "true";
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const input = document.getElementById("profile-session-stepup-password");
          const password = String(input?.value || "");
          if (!password) {
            deps.showInAppNotification?.({
              title: t("session.passwordRequiredTitle", "Password required"),
              body: t("session.passwordRequiredBody", "Weka password kuthibitisha session."),
              variant: "warning"
            });
            return;
          }
          const button = form.querySelector("button");
          if (button) button.disabled = true;
          try {
            await deps.dataLayer.verifySessionStepUp(password);
            deps.showInAppNotification?.({
              title: t("session.verifiedTitle", "Session verified"),
              body: t("session.verifiedBody", "Security check imekamilika."),
              variant: "success"
            });
            input.value = "";
            await loadProfileSessionSecurity(sequence);
          } catch (error) {
            deps.showInAppNotification?.({
              title: t("session.verificationFailedTitle", "Verification failed"),
              body: error.message || t("session.verificationFailedBody", "Password haikuthibitishwa."),
              variant: "error"
            });
          } finally {
            if (button) button.disabled = false;
          }
        });
      }

      const list = document.getElementById("profile-session-list");
      if (list && list.dataset.bound !== "true") {
        list.dataset.bound = "true";
        list.addEventListener("click", async (event) => {
          const target = event.target?.closest?.("[data-revoke-session]");
          if (!target) {
            return;
          }
          const sessionId = target.dataset.revokeSession || "";
          const confirmed = typeof deps.confirmAction === "function"
            ? await deps.confirmAction(t("session.revokeConfirm", "Revoke this device session?"))
            : true;
          if (!confirmed) {
            return;
          }
          target.disabled = true;
          try {
            await deps.dataLayer.revokeActiveSession(sessionId);
            deps.showInAppNotification?.({
              title: t("session.revokedTitle", "Session revoked"),
              body: t("session.revokedBody", "Device session imefungwa."),
              variant: "success"
            });
            await loadProfileSessionSecurity(sequence);
          } catch (error) {
            target.disabled = false;
            deps.showInAppNotification?.({
              title: t("session.revokeFailedTitle", "Revoke failed"),
              body: error.message || t("session.revokeFailedBody", "Session haikuweza kufungwa."),
              variant: "error"
            });
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
          title: t("profile.storeNameRequiredTitle", "Store name required"),
          body: t("profile.storeNameRequiredBody", "Jina la duka linahitajika kabla ya kuendelea."),
          variant: "warning"
        });
        return;
      }

      if (!phoneNumber) {
        deps.showInAppNotification?.({
          title: t("profile.sellerPhoneRequiredTitle", "Phone required"),
          body: t("profile.sellerPhoneRequiredBody", "Weka namba ya simu kabla ya kuendelea."),
          variant: "warning"
        });
        return;
      }

      if (!/^\+?[0-9][0-9\s-]{7,19}$/.test(phoneNumber)) {
        deps.showInAppNotification?.({
          title: t("profile.sellerPhoneRequiredTitle", "Phone required"),
          body: t("profile.sellerPhoneInvalidBody", "Weka namba ya simu sahihi."),
          variant: "warning"
        });
        return;
      }

      if (primaryCategory && primaryCategory.length < 2) {
        deps.showInAppNotification?.({
          title: t("profile.sellerCategoryRequiredTitle", "Category required"),
          body: t("profile.sellerCategoryRequiredBody", "Category ya seller si sahihi."),
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
          throw new Error(t("profile.sellerUpgradeFailedBody", "We could not upgrade your account right now."));
        }
        deps.mergeSessionState(updatedSession);
        deps.saveSessionUser();
        deps.renderHeaderUserMenu();
        deps.showInAppNotification?.({
          title: t("profile.sellerUpgradeCompleteTitle", "Seller upgrade complete"),
          body: t("profile.sellerUpgradeCompleteBody", "Akaunti yako sasa ni seller. Bila kutoka profile, unaweza kuanza kuuza."),
          variant: "success"
        });
        deps.renderCurrentView?.();
      } catch (error) {
        deps.captureError?.("seller_upgrade_failed", error, {
          user: deps.getCurrentUser()
        });
        deps.showInAppNotification?.({
          title: t("profile.sellerUpgradeFailedTitle", "Seller upgrade failed"),
          body: error.message || t("profile.sellerUpgradeFailedBody", "Imeshindikana kuupgrade account kwa sasa."),
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
      if (profileDiv.dataset.profileLanguageBound !== "true") {
        profileDiv.dataset.profileLanguageBound = "true";
        profileDiv.addEventListener("change", async (event) => {
          const selector = event.target?.closest?.("[data-profile-language-select]");
          if (!selector) return;
          const selected = String(selector.value || "device").trim().toLowerCase();
          selector.disabled = true;
          try {
            const context = selected === "device"
              ? deps.followDeviceLanguage?.()
              : deps.setLocalizationLanguage?.(selected, { useDeviceLanguage: false });
            await deps.loadLocalizationCatalog?.(context?.locale || selected);
            deps.showInAppNotification?.({
              title: t("language.updatedTitle", "Language updated"),
              body: t("language.updatedBody", "Winga will use your selected language on this device."),
              variant: "success"
            });
            deps.renderCurrentView?.();
          } catch (error) {
            deps.captureError?.("profile_language_change_failed", error, { selected });
            selector.disabled = false;
            deps.showInAppNotification?.({
              title: t("language.updateFailedTitle", "Language update failed"),
              body: error.message || t("language.updateFailedBody", "We could not change the app language right now."),
              variant: "error"
            });
          }
        });
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
              title: t("notification.profilePromptTitle", "Keep your Winga activity in sync"),
              body: t("notification.promptBody", "Turn on notifications so you do not miss new messages, order updates, and important activity.")
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
        bindPaymentDetailsActions();
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
          deps.validateSingleImageFile(file, t("profile.photoField", "Profile photo"));
          if (statusNode) {
            statusNode.textContent = t("profile.photoUploadingStatus", "Tunapakia profile photo...");
          }
          const profileImage = await deps.readFileAsDataUrl(file, { purpose: "profile" });
          const updatedUser = await deps.dataLayer.updateUserProfile({ profileImage });
          if (!updatedUser?.username) {
            throw new Error(t("profile.accountMissingError", "Your account is no longer available. Sign in again before retrying."));
          }
          deps.mergeSessionState({ ...updatedUser, profileImage: updatedUser.profileImage || profileImage });
          deps.saveSessionUser();
          deps.renderHeaderUserMenu();
          if (statusNode) {
            statusNode.textContent = t("profile.photoSavedStatus", "Profile photo imehifadhiwa.");
          }
          deps.showInAppNotification?.({
            title: t("profile.photoUpdatedTitle", "Profile photo updated"),
            body: t("profile.photoUpdatedBody", "Picha yako mpya imehifadhiwa."),
            variant: "success",
            durationMs: 3200
          });
          renderProfile();
        } catch (error) {
          deps.captureError?.("profile_photo_update_failed", error, {
            user: deps.getCurrentUser()
          });
          if (statusNode) {
            statusNode.textContent = t("profile.photoOptionalStatus", "Profile photo ni optional. Ukikosa, initials zitaendelea kuonekana.");
          }
          deps.showInAppNotification?.({
            title: t("profile.photoFailedTitle", "Profile photo failed"),
            body: error.message || t("profile.photoFailedBody", "Imeshindikana kuhifadhi profile photo."),
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
      bindPaymentDetailsActions();
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

      if (currentUser && typeof deps.hydrateSellerProducts === "function") {
        deps.hydrateSellerProducts(currentUser)
          .then((page) => {
            const previousPage = sellerProductPagination.get(currentUser);
            const nextPage = {
              page: Number(page?.page || 1) || 1,
              nextCursor: String(page?.nextCursor || ""),
              hasMore: page?.hasMore !== false,
              total: Number(page?.total || 0)
            };
            sellerProductPagination.set(currentUser, nextPage);
            const paginationChanged = JSON.stringify(previousPage || null) !== JSON.stringify(nextPage);
            if (
              (Number(page?.appendedCount || 0) > 0 || paginationChanged)
              && isRenderActive(sequence)
            ) {
              renderProfile();
            }
          })
          .catch((error) => {
            deps.captureError?.("profile_products_pagination_failed", error, {
              user: currentUser
            });
          });
      }

      if (deps.canUseSellerFeatures()) {
        deps.dataLayer.loadAnalytics()
          .then((analytics) => {
            if (!isRenderActive(sequence)) {
              return;
            }
            deps.renderAnalyticsPanel(analytics, t("profile.performanceTitle", "Your performance"), t("profile.catalogSummary", "Your catalog summary"));
          })
          .catch((error) => {
            if (!isRenderActive(sequence)) {
              return;
            }
            deps.captureError?.("profile_analytics_load_failed", error, {
              user: currentUser
            });
            deps.renderAnalyticsPanel(null, t("profile.performanceTitle", "Your performance"), t("profile.catalogSummary", "Your catalog summary"));
            deps.showInAppNotification?.({
              title: t("profile.analyticsUnavailableTitle", "Analytics unavailable"),
              body: t("profile.analyticsUnavailableBody", "Performance yako haijapatikana kwa sasa. Tunaonyesha fallback salama."),
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
            title: t("profile.ordersUnavailableTitle", "Orders unavailable"),
            body: t("profile.ordersUnavailableBody", "Orders hazikupatikana kwa sasa. Jaribu tena baada ya muda mfupi."),
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
            title: t("profile.messagesUnavailableTitle", "Messages unavailable"),
            body: t("profile.messagesUnavailableBody", "Inbox haikuweza ku-refresh kwa sasa."),
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
            title: t("profile.notificationsUnavailableTitle", "Notifications unavailable"),
            body: t("profile.notificationsUnavailableBody", "Notifications hazikupatikana kwa sasa."),
            variant: "warning",
            durationMs: 4200
          });
        });

      try {
        const activePromotions = Array.isArray(deps.getActivePromotions?.())
          ? deps.getActivePromotions()
          : [];
        const sellerPromotions = (Array.isArray(deps.getCurrentPromotions?.()) ? deps.getCurrentPromotions() : [])
          .filter((promotion) => String(promotion?.sellerUsername || "").trim().toLowerCase() === String(currentUser || "").trim().toLowerCase())
          .map((promotion) => {
            const product = deps.getProductById?.(promotion.productId);
            const option = deps.getPromotionOptions?.()?.[promotion.type] || null;
            return {
              ...promotion,
              productName: product?.name || "",
              label: option?.label || promotion.type
            };
          })
          .sort((first, second) =>
            new Date(second?.updatedAt || second?.createdAt || 0).getTime()
            - new Date(first?.updatedAt || first?.createdAt || 0).getTime()
          );
        const canGetVerified = userProfile?.role === "seller" && !userProfile?.verifiedSeller;
        profileDiv.dataset.activeSection = activeSection;
        profileDiv.replaceChildren(deps.createProfileShellElement({
          displayName: deps.getCurrentDisplayName(),
          accountMeta: `${isBuyerOnly
            ? t("profile.buyerAccountMeta", "Your buyer account")
            : deps.canUseSellerFeatures()
              ? t("profile.sellerBuyerAccountMeta", "Seller account with buyer access")
              : t("profile.manageAccountMeta", "Manage your account")}${safeProfileStatus && safeProfileStatus !== "active" ? ` | ${safeProfileStatus}` : ""}`,
          stats: [
            {
              value: userProducts.length,
              label: t("profile.productsEyebrow", "Products"),
              action: "products"
            },
            {
              value: totalUnreadMessages,
              label: t("profile.unreadStat", "Unread"),
              action: "unread"
            },
            {
              value: conversationCount,
              label: t("profile.messagesStat", "Messages"),
              action: "messages"
            }
          ],
          identityMarkup: deps.createProfileIdentitySectionElement(userProfile, {
            displayName: deps.getCurrentDisplayName(),
            profileImage: deps.getCurrentProfileImage(),
            userInitials: deps.getUserInitials(deps.getCurrentDisplayName()),
            roleLabel: userProfile?.role ? deps.getRoleLabel(userProfile.role) : "User",
            whatsappNumber: userProfile?.whatsappNumber || userProfile?.phoneNumber || "",
            phoneNumber: userProfile?.phoneNumber || userProfile?.whatsappNumber || "",
            whatsappVerificationStatus: userProfile?.whatsappVerificationStatus || "verified",
            paymentProvider: userProfile?.paymentProvider || "",
            paymentNumber: userProfile?.paymentNumber || "",
            paymentRecipientName: userProfile?.paymentRecipientName || userProfile?.fullName || deps.getCurrentDisplayName(),
            paymentInstructions: userProfile?.paymentInstructions || ""
          }),
          sellerUpgradeMarkup: deps.createSellerUpgradeSectionElement?.({
            canUpgradeToSeller,
            canGetVerified,
            fullName: deps.getCurrentDisplayName(),
            phoneNumber: userProfile?.phoneNumber || userProfile?.whatsappNumber || "",
            primaryCategory: userProfile?.primaryCategory || "",
          }),
          savedIntentMarkup: deps.renderSavedIntentSection?.(),
          promotionsMarkup: deps.createPromotionManagementSectionElement?.({
            canUseSellerFeatures: deps.canUseSellerFeatures(),
            promotions: sellerPromotions
          }),
          requestsMarkup: deps.renderRequestBoxSection(),
          ordersMarkup: deps.createOrdersSectionElement(deps.getCurrentOrders()),
          notificationsMarkup: deps.renderNotificationsSection(),
          messagesMarkup: deps.renderMessagesSection(),
          sessionSecurityMarkup: deps.createSessionSecuritySectionElement?.({
            security: userProfile?.security || deps.getCurrentSession?.()?.security || {}
          }),
          notificationPermissionState: deps.getNotificationPermissionState?.(),
          hasBuyerAccess,
          requestCount: deps.getRequestBoxItemCount(),
          canGetVerified
        }));
        if (activeSection === "profile-messages-panel") {
          profileDiv.appendChild(deps.createElement("button", {
            className: "profile-messages-fab message-panel-close",
            textContent: t("profile.backAction", "Back to profile"),
            attributes: {
              type: "button",
              "data-close-profile-messages": "true",
              "aria-label": t("profile.backAction", "Back to profile")
            }
          }));
        }
      } catch (error) {
        deps.captureError?.("profile_shell_render_failed", error, {
          user: currentUser
        });
        const fallback = deps.createEmptyState
          ? deps.createEmptyState(t("profile.renderFailed", "Profile encountered a temporary error. Refresh or try again."))
          : document.createTextNode(t("profile.renderFailedShort", "Profile encountered a temporary error."));
        profileDiv.replaceChildren(fallback);
        profileDiv.style.display = "block";
        return;
      }

      deps.setActiveProfileSection?.(activeSection);
      deps.flushPendingProfileSection();
      bindProfileEntryActions();
      bindSessionSecurityActions(sequence);
      loadProfileSessionSecurity(sequence);
      const container = document.getElementById("user-products-container");

      if (userProducts.length === 0) {
        deps.setEmptyCopy(
          container,
          isBuyerOnly
            ? t("profile.buyerEmpty", "Your buyer account is ready. Browse, search, message sellers, pay, order, review, and report unsafe listings.")
            : deps.canUseSellerFeatures()
              ? t("profile.sellerEmpty", "No posts yet. Go to Upload to start building your profile catalog.")
              : t("profile.catalogEmpty", "You have not posted products yet. Go to Upload to start your catalog.")
        );
        profileDiv.querySelector("#profile-logout-button")?.addEventListener("click", deps.logout);
        bindProfileIdentityActions();
        deps.bindRequestBoxActions(profileDiv);
        deps.bindMessageActions(profileDiv);
        profileDiv.style.display = "block";
        deps.setResultsMeta(
          t("profile.heading", "Profile"),
          isBuyerOnly
            ? t("profile.buyerResultsMeta", "Your orders, notifications, messages, and buyer activity appear here.")
            : deps.canUseSellerFeatures()
              ? t("profile.sellerResultsMeta", "Your buyer activity, seller catalog, and performance appear here.")
              : t("profile.catalogResultsMeta", "Your products and their performance appear here.")
        );
        return;
      }

      const preloadRegistry = new Set();
      const priorityTileLimit = Math.max(4, (deps.getProductsPerRow?.() || 2) * 2);
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
        deps.preloadImageSource(safeSrc, { fetchPriority: "auto" });
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
        const primaryImage = imageSources[0] || "";
        if (renderedTileCount < priorityTileLimit) {
          preloadProfileImage(primaryImage);
        }
        const card = deps.createProfileProductCardElement(product, primaryImage, {
          isPriority: renderedTileCount < priorityTileLimit
        });
        if (card) {
          productCards.appendChild(card);
        }
        renderedTileCount += 1;
      });
      container.appendChild(productCards);
      const sellerPage = sellerProductPagination.get(currentUser);
      if (sellerPage?.hasMore && typeof deps.hydrateSellerProducts === "function") {
        const loadMoreButton = deps.createElement("button", {
          className: "action-btn profile-products-load-more",
          textContent: t("profile.loadMoreProducts", "Load more products"),
          attributes: {
            type: "button",
            "data-profile-products-load-more": "true"
          }
        });
        loadMoreButton.addEventListener("click", async () => {
          loadMoreButton.disabled = true;
          loadMoreButton.textContent = t("common.loading", "Loading...");
          try {
            const page = await deps.hydrateSellerProducts(currentUser, { append: true });
            sellerProductPagination.set(currentUser, {
              page: Number(page?.page || sellerPage.page || 1) || 1,
              nextCursor: String(page?.nextCursor || ""),
              hasMore: page?.hasMore !== false,
              total: Number(page?.total || sellerPage.total || 0)
            });
            if (isRenderActive(sequence)) {
              renderProfile();
            }
          } catch (error) {
            deps.captureError?.("profile_products_load_more_failed", error, {
              user: currentUser
            });
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = t("common.tryAgain", "Try again");
          }
        });
        container.appendChild(loadMoreButton);
      }

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
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const productId = String(button.dataset.promoteProduct || "").trim();
          const product = deps.getProductById
            ? deps.getProductById(productId)
            : deps.getProducts().find((item) => item.id === productId);
          if (!product) {
            deps.showInAppNotification?.({
              title: t("promotion.unavailableTitle", "Promotion unavailable"),
              body: t("promotion.productUnavailableBody", "Bidhaa hii haikupatikana tena. Refresh profile yako ujaribu tena."),
              variant: "warning"
            });
            return;
          }

          try {
            if (typeof deps.openPromotionIntentModal !== "function") {
              throw new Error(t("promotion.openFailedBody", "We could not open the promotion plan. Try again."));
            }
            deps.openPromotionIntentModal(product);
          } catch (error) {
            deps.captureError?.("promotion_plan_open_failed", error, {
              productId: product.id
            });
            deps.showInAppNotification?.({
              title: t("promotion.openFailedTitle", "Promotion failed to open"),
              body: error.message || t("promotion.openFailedBody", "Imeshindikana kufungua promotion plan. Jaribu tena."),
              variant: "error"
            });
          }
        });
      });

      container.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", () => deps.deleteProduct(button.dataset.id));
      });

      container.querySelectorAll("[data-order-review-product]").forEach((button) => {
        button.addEventListener("click", () => {
          const productId = button.dataset.orderReviewProduct || "";
          if (!productId) {
            return;
          }
          deps.noteProductInterest?.(productId);
          deps.openProductDetailModal?.(productId);
        });
      });

      deps.bindProductMenus(container);
      profileDiv.querySelector("#profile-logout-button")?.addEventListener("click", deps.logout);
      bindProfileIdentityActions();
      deps.bindRequestBoxActions(profileDiv);
      deps.bindMessageActions(profileDiv);

      profileDiv.style.display = "block";
      deps.setResultsMeta(
        t("profile.productCount", "{count} products", { count: userProducts.length }),
        t("profile.manageProductsMeta", "Manage all your products here.")
      );
    }

    return {
      renderProfile,
      bindProfileIdentityActions
    };
  }

  window.WingaModules.profile.createProfileControllerModule = createProfileControllerModule;
})();
