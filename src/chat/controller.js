(() => {
  function createChatControllerModule(deps) {
    const recentSubmissionRegistry = new Map();
    const translate = typeof deps.translate === "function"
      ? deps.translate
      : (_key, _variables, fallbackText = "") => String(fallbackText || "");
    const t = (key, fallbackText = "", variables = {}) => translate(key, variables, fallbackText);

    function pruneRecentSubmissionRegistry(maxAgeMs = 15000) {
      const now = Date.now();
      Array.from(recentSubmissionRegistry.entries()).forEach(([key, value]) => {
        const updatedAt = Number(value?.updatedAt || 0);
        if (!updatedAt || now - updatedAt > maxAgeMs) {
          recentSubmissionRegistry.delete(key);
        }
      });
    }

    function createMessageSubmissionKey(context, message = "", productItems = []) {
      const receiverId = String(context?.withUser || "").trim();
      const productId = String(context?.productId || "").trim();
      const normalizedMessage = String(message || "").trim().replace(/\s+/g, " ").toLowerCase();
      const productItemIds = (Array.isArray(productItems) ? productItems : [])
        .map((item) => String(item?.productId || "").trim())
        .filter(Boolean)
        .sort()
        .join(",");
      return `${receiverId}::${productId}::${normalizedMessage}::${productItemIds}`;
    }

    async function runRetrySafeMessageSend(sendKey, task, duplicateCopy) {
      pruneRecentSubmissionRegistry(20000);
      const existing = recentSubmissionRegistry.get(sendKey);
      if (existing?.status === "pending") {
        deps.showInAppNotification?.({
          title: t("chat.sendingTitle", "Sending..."),
          body: duplicateCopy.pending,
          variant: "info"
        });
        return { skipped: true, reason: "pending" };
      }
      if (existing?.status === "completed" && Date.now() - Number(existing.updatedAt || 0) < 20000) {
        deps.showInAppNotification?.({
          title: t("chat.alreadySentTitle", "Already sent"),
          body: duplicateCopy.completed,
          variant: "info"
        });
        return { skipped: true, reason: "completed" };
      }
      recentSubmissionRegistry.set(sendKey, {
        status: "pending",
        updatedAt: Date.now()
      });
      try {
        const result = await task();
        recentSubmissionRegistry.set(sendKey, {
          status: "completed",
          updatedAt: Date.now()
        });
        return result;
      } catch (error) {
        recentSubmissionRegistry.delete(sendKey);
        throw error;
      }
    }

    function createOfferIdempotencyKey(action = "offer") {
      const randomPart = globalThis.crypto?.randomUUID?.()
        || Math.random().toString(36).slice(2);
      return `${String(action || "offer").toLowerCase()}-${Date.now()}-${randomPart}`;
    }

    async function refreshOfferSurface(scope) {
      await deps.refreshConversationOffersState?.();
      if (scope && deps.getCurrentView?.() === "profile") {
        deps.replaceMessagesPanel(scope);
      }
      if (deps.getIsContextOpen?.()) {
        deps.replaceContextChatModal?.();
      }
    }

    async function createAvailabilityFromForm(form, rerender) {
      const context = deps.getActiveChatContext?.();
      const data = new FormData(form);
      const productId = String(data.get("productId") || "").trim();
      const quantity = Number(data.get("quantity"));
      if (!context?.withUser || !productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        deps.setAvailabilityActionStatus?.({ tone: "error", message: t("chat.invalidAvailability", "Enter valid availability details.") });
        rerender?.();
        return;
      }
      try {
        deps.setAvailabilityActionStatus?.({ tone: "info", message: t("chat.sendingAvailability", "Sending availability request...") });
        await deps.dataLayer.createConversationAvailabilityRequest(
          context.withUser,
          {
            productId,
            size: String(data.get("size") || "").trim(),
            color: String(data.get("color") || "").trim(),
            quantity
          },
          createOfferIdempotencyKey("availability-request")
        );
        deps.setAvailabilityActionStatus?.({ tone: "success", message: t("chat.availabilitySent", "Availability request sent.") });
        await Promise.all([deps.refreshConversationAvailabilityState?.(), deps.refreshNotificationsState?.()]);
        rerender?.();
      } catch (error) {
        deps.setAvailabilityActionStatus?.({ tone: "error", message: error.message || t("chat.availabilityFailed", "Availability request failed.") });
        deps.captureError?.("conversation_availability_create_failed", error, { productId, withUser: context.withUser });
        rerender?.();
      }
    }

    async function transitionAvailability(requestId, action, responseProductId, rerender) {
      if (!requestId || !action) return;
      try {
        deps.setAvailabilityActionStatus?.({ tone: "info", message: t("chat.updatingAvailability", "Updating availability...") });
        await deps.dataLayer.transitionConversationAvailabilityRequest(
          requestId,
          responseProductId ? { action, responseProductId } : { action },
          createOfferIdempotencyKey(`availability-${action}`)
        );
        deps.setAvailabilityActionStatus?.({ tone: "success", message: t("chat.availabilityUpdated", "Availability updated.") });
        await Promise.all([deps.refreshConversationAvailabilityState?.(), deps.refreshNotificationsState?.()]);
        rerender?.();
      } catch (error) {
        deps.setAvailabilityActionStatus?.({ tone: "error", message: error.message || t("chat.availabilityUpdateFailed", "Availability could not be updated.") });
        deps.captureError?.("conversation_availability_transition_failed", error, { requestId, action });
        rerender?.();
      }
    }

    async function createOfferFromForm(form, rerender) {
      const context = deps.getActiveChatContext?.();
      const data = new FormData(form);
      const amount = Number(data.get("amount"));
      const productId = String(data.get("productId") || "").trim();
      if (!context?.withUser || !productId || !Number.isInteger(amount) || amount < 500) {
        deps.setOfferActionStatus?.({ tone: "error", message: t("chat.invalidOffer", "Enter a valid offer amount.") });
        rerender?.();
        return;
      }
      try {
        deps.setOfferActionStatus?.({ tone: "info", message: t("chat.sendingOffer", "Sending your offer...") });
        await deps.dataLayer.createConversationOffer(
          context.withUser,
          { productId, amount, currency: "TZS" },
          createOfferIdempotencyKey("propose")
        );
        deps.setOfferActionStatus?.({ tone: "success", message: t("chat.offerSent", "Your offer was sent.") });
        await Promise.all([deps.refreshConversationOffersState?.(), deps.refreshNotificationsState?.()]);
        rerender?.();
      } catch (error) {
        deps.setOfferActionStatus?.({ tone: "error", message: error.message || t("chat.offerFailed", "Offer could not be sent.") });
        deps.captureError?.("conversation_offer_create_failed", error, { productId, withUser: context.withUser });
        rerender?.();
      }
    }

    async function transitionOffer(offerId, action, amount, rerender) {
      if (!offerId || !action) {
        return;
      }
      try {
        deps.setOfferActionStatus?.({ tone: "info", message: t("chat.updatingOffer", "Updating offer...") });
        await deps.dataLayer.transitionConversationOffer(
          offerId,
          amount ? { action, amount } : { action },
          createOfferIdempotencyKey(action)
        );
        deps.setOfferActionStatus?.({ tone: "success", message: t("chat.offerUpdated", "Offer updated.") });
        await Promise.all([deps.refreshConversationOffersState?.(), deps.refreshNotificationsState?.()]);
        rerender?.();
      } catch (error) {
        deps.setOfferActionStatus?.({ tone: "error", message: error.message || t("chat.offerUpdateFailed", "Offer could not be updated.") });
        deps.captureError?.("conversation_offer_transition_failed", error, { offerId, action });
        rerender?.();
      }
    }

    async function counterOffer(offerId, rerender) {
      const value = typeof window.prompt === "function"
        ? window.prompt(t("chat.counterPrompt", "Enter your counter offer in TZS"), "")
        : "";
      const amount = Number(value);
      if (!offerId || !Number.isInteger(amount) || amount < 500) {
        if (value !== null) {
          deps.setOfferActionStatus?.({ tone: "error", message: t("chat.invalidOffer", "Enter a valid offer amount.") });
          rerender?.();
        }
        return;
      }
      await transitionOffer(offerId, "COUNTER", amount, rerender);
    }

    async function sharePhoneWithActiveChat() {
      const activeChatContext = deps.getActiveChatContext();
      if (!activeChatContext?.withUser) {
        return;
      }

      await deps.dataLayer.sendMessage({
        receiverId: activeChatContext.withUser,
        productId: activeChatContext.productId || "",
        productName: activeChatContext.productName || "",
        message: "Nimekushirikisha namba yangu kwa mawasiliano ya moja kwa moja.",
        messageType: "contact_share"
      });
      await Promise.all([
        deps.refreshUsersState?.(),
        deps.refreshMessagesState(),
        deps.refreshNotificationsState()
      ]);
      deps.showInAppNotification?.({
        title: t("chat.phoneSharedTitle", "Phone shared"),
        body: t("chat.phoneSharedBody", "Muuzaji huyu sasa ataweza kuona namba yako ndani ya mazungumzo haya."),
        variant: "success"
      });
    }

    function closeContextChatModal() {
      const modal = document.getElementById("context-chat-modal");
      if (!modal) {
        return;
      }
      modal.style.display = "none";
      document.body.classList.remove("context-chat-open");
      deps.syncBodyScrollLockState?.();
      deps.setIsContextOpen(false);
      deps.setOpenChatMessageMenuId("");
      deps.setOpenEmojiScope("");
      if (deps.getCurrentView?.() !== "profile") {
        deps.stopMessagePolling?.();
      }
    }

    function bindContextChatModalActions() {
      const modal = document.getElementById("context-chat-modal");
      if (!modal) {
        return;
      }

      const bindMessageLongPress = (scope, rerender) => {
        if (!scope) {
          return;
        }

        scope.querySelectorAll("[data-message-bubble-id]").forEach((bubble) => {
          const datasetKey = "wingaBoundMessageLongPress";
          if (bubble.dataset[datasetKey] === "true") {
            return;
          }
          bubble.dataset[datasetKey] = "true";

          let pressTimer = 0;
          let pressTriggered = false;

          const clearPress = () => {
            if (pressTimer) {
              window.clearTimeout(pressTimer);
            }
            pressTimer = 0;
          };

          const openMenu = () => {
            const messageId = bubble.dataset.messageBubbleId || "";
            if (!messageId) {
              return;
            }
            pressTriggered = true;
            deps.setOpenChatMessageMenuId(messageId);
            rerender();
          };

          bubble.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            clearPress();
            pressTriggered = false;
            pressTimer = window.setTimeout(openMenu, 450);
          });

          bubble.addEventListener("pointerup", clearPress);
          bubble.addEventListener("pointercancel", clearPress);
          bubble.addEventListener("pointerleave", clearPress);
          bubble.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            clearPress();
            openMenu();
          });

          bubble.addEventListener("click", (event) => {
            if (pressTriggered) {
              event.preventDefault();
              event.stopPropagation();
            }
            clearPress();
          });
        });
      };

      modal.querySelectorAll("[data-close-context-chat]").forEach((button) => {
        button.addEventListener("click", closeContextChatModal);
      });

      modal.querySelector("#context-chat-compose-input")?.addEventListener("input", (event) => {
        deps.setCurrentMessageDraft(event.target.value || "");
      });

      modal.querySelectorAll("[data-emoji-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          const scopeId = button.dataset.emojiToggle || "";
          deps.setOpenEmojiScope(deps.getOpenEmojiScope() === scopeId ? "" : scopeId);
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-insert-emoji]").forEach((button) => {
        button.addEventListener("click", () => {
          deps.setCurrentMessageDraft(`${deps.getCurrentMessageDraft() || ""}${button.dataset.insertEmoji || ""}`);
          deps.setOpenEmojiScope("");
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-chat-select-product]").forEach((card) => {
        card.addEventListener("click", () => {
          const productId = card.dataset.chatSelectProduct;
          const selectedProductIds = deps.getSelectedChatProductIds();
          deps.setSelectedChatProductIds(
            selectedProductIds.includes(productId)
              ? selectedProductIds.filter((item) => item !== productId)
              : [...selectedProductIds, productId].slice(0, 10)
          );
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-chat-open-product]").forEach((button) => {
        button.addEventListener("click", () => {
          const productId = button.dataset.chatOpenProduct || "";
          if (productId) {
            deps.openProductDetailModal?.(productId);
          }
        });
      });

      modal.querySelector("[data-offer-create-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await createOfferFromForm(event.currentTarget, replaceContextChatModal);
      });

      modal.querySelectorAll("[data-offer-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          await transitionOffer(button.dataset.offerId || "", button.dataset.offerAction || "", 0, replaceContextChatModal);
        });
      });

      modal.querySelectorAll("[data-offer-counter]").forEach((button) => {
        button.addEventListener("click", async () => {
          await counterOffer(button.dataset.offerCounter || "", replaceContextChatModal);
        });
      });

      modal.querySelectorAll("[data-offer-checkout]").forEach((button) => {
        button.addEventListener("click", () => {
          const product = deps.getProductById?.(button.dataset.offerProduct || "");
          if (product) {
            deps.beginPurchaseFlow?.(product, {
              acceptedOfferId: button.dataset.offerCheckout || "",
              agreedPrice: Number(button.dataset.offerPrice || 0)
            });
          }
        });
      });

      modal.querySelector("[data-availability-create-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await createAvailabilityFromForm(event.currentTarget, replaceContextChatModal);
      });
      modal.querySelectorAll("[data-availability-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          await transitionAvailability(button.dataset.availabilityId || "", button.dataset.availabilityAction || "", "", replaceContextChatModal);
        });
      });
      modal.querySelectorAll("[data-availability-alternative-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await transitionAvailability(String(data.get("requestId") || ""), "SUGGEST_ALTERNATIVE", String(data.get("responseProductId") || ""), replaceContextChatModal);
        });
      });

      modal.querySelectorAll("[data-chat-prefill]").forEach((button) => {
        button.addEventListener("click", () => {
          deps.setCurrentMessageDraft(button.dataset.chatPrefill || "");
          replaceContextChatModal();
        });
      });

      modal.querySelector("[data-clear-chat-selection]")?.addEventListener("click", () => {
        deps.setSelectedChatProductIds([]);
        replaceContextChatModal();
      });

      modal.querySelector("[data-clear-chat-reply]")?.addEventListener("click", () => {
        deps.setActiveChatReplyMessageId("");
        replaceContextChatModal();
      });

      modal.querySelector("[data-share-my-phone]")?.addEventListener("click", async () => {
        try {
          await sharePhoneWithActiveChat();
          replaceContextChatModal();
        } catch (error) {
          deps.captureError?.("context_phone_share_failed", error, {
            receiverId: deps.getActiveChatContext?.()?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: t("chat.sharingFailedTitle", "Sharing failed"),
            body: error.message || t("chat.sharingFailedBody", "Imeshindikana kushare namba yako kwa sasa."),
            variant: "error"
          });
        }
      });

      modal.querySelectorAll("[data-message-menu-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const messageId = button.dataset.messageMenuToggle;
          deps.setOpenChatMessageMenuId(
            deps.getOpenChatMessageMenuId() === messageId ? "" : messageId
          );
          replaceContextChatModal();
        });
      });

      bindMessageLongPress(modal, replaceContextChatModal);

      modal.querySelectorAll("[data-message-reply]").forEach((button) => {
        button.addEventListener("click", () => {
          deps.setActiveChatReplyMessageId(button.dataset.messageReply || "");
          deps.setOpenChatMessageMenuId("");
          if (!(deps.getCurrentMessageDraft() || "").trim()) {
            deps.setCurrentMessageDraft("Naomba ufafanuzi kuhusu hii.");
          }
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-message-share]").forEach((button) => {
        button.addEventListener("click", async () => {
          const activeMessages = deps.getActiveConversationMessages();
          const targetMessage = activeMessages.find((item) => item.id === button.dataset.messageShare);
          if (!targetMessage) {
            return;
          }
          const productItems = deps.getMessageProductItems(targetMessage);
          const shareText = [
            targetMessage.message || "",
            ...productItems.map((item) => `${item.productName} - ${deps.formatProductPrice(item.price)}`)
          ].filter(Boolean).join("\n");

          try {
            if (navigator.share) {
              await navigator.share({ text: shareText });
            } else if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(shareText);
              deps.showInAppNotification?.({
                title: t("chat.copiedTitle", "Copied"),
                body: t("chat.copiedBody", "Ujumbe umewekwa kwenye clipboard."),
                variant: "success"
              });
            }
          } catch (error) {
            // Ignore share cancellation.
          } finally {
            deps.setOpenChatMessageMenuId("");
            replaceContextChatModal();
          }
        });
      });

      modal.querySelectorAll("[data-message-download]").forEach((button) => {
        button.addEventListener("click", () => {
          const activeMessages = deps.getActiveConversationMessages();
          const targetMessage = activeMessages.find((item) => item.id === button.dataset.messageDownload);
          const firstImage = deps.getMessageProductItems(targetMessage).find((item) => item.productImage)?.productImage;
          if (!firstImage) {
            return;
          }
          const link = document.createElement("a");
          link.href = firstImage;
          link.download = `${(targetMessage?.productName || "winga-product").replace(/\s+/g, "-").toLowerCase()}.png`;
          link.click();
          deps.setOpenChatMessageMenuId("");
          replaceContextChatModal();
        });
      });

      modal.querySelectorAll("[data-message-delete]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await deps.dataLayer.deleteMessage(button.dataset.messageDelete);
            deps.setOpenChatMessageMenuId("");
            if (deps.getActiveChatReplyMessageId() === button.dataset.messageDelete) {
              deps.setActiveChatReplyMessageId("");
            }
            await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
            replaceContextChatModal();
          } catch (error) {
            deps.captureError?.("context_message_delete_failed", error, {
              messageId: button.dataset.messageDelete
            });
            deps.showInAppNotification?.({
              title: t("chat.deleteFailedTitle", "Delete failed"),
              body: error.message || t("chat.deleteFailedBody", "Imeshindikana kufuta ujumbe."),
              variant: "error"
            });
          }
        });
      });

      modal.querySelector("#context-chat-compose-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = modal.querySelector("#context-chat-compose-input");
        const textMessage = input?.value.trim() || "";
        const productItems = deps.getSelectedChatProducts();
        const activeChatContext = deps.getActiveChatContext();
        const message = textMessage || (productItems.length ? "Bei ya hizi ni kiasi gani?" : "");
        if (!activeChatContext || (!message && !productItems.length)) {
          return;
        }
        try {
          const sendKey = createMessageSubmissionKey(activeChatContext, message, productItems);
          deps.setChatComposeStatus?.("context", {
            tone: "info",
            message: t("chat.sendingStatus", "Tunatuma ujumbe wako sasa.")
          });
          const sendResult = await runRetrySafeMessageSend(sendKey, () => deps.dataLayer.sendMessage({
            receiverId: activeChatContext.withUser,
            productId: activeChatContext.productId || "",
            productName: activeChatContext.productName || "",
            message,
            messageType: productItems.length > 1 ? "product_inquiry" : productItems.length === 1 ? "product_reference" : "text",
            productItems,
            replyToMessageId: deps.getActiveChatReplyMessageId()
          }), {
            pending: t("chat.duplicatePending", "Ujumbe huu bado unatoka. Subiri kidogo kabla ya kubonyeza tena."),
            completed: t("chat.duplicateCompleted", "Ujumbe huu tayari umetumwa. Angalia mazungumzo kabla ya kutuma tena.")
          });
          if (sendResult?.skipped) {
            deps.setChatComposeStatus?.("context", {
              tone: "info",
              message: sendResult.reason === "completed"
                ? t("chat.duplicateCompleted", "Ujumbe huu tayari umetumwa. Angalia mazungumzo kwanza.")
                : t("chat.duplicatePending", "Ujumbe huu bado unatoka. Subiri kidogo kabla ya kutuma tena.")
            });
            replaceContextChatModal();
            return;
          }
          deps.setCurrentMessageDraft("");
          deps.setSelectedChatProductIds([]);
          deps.setActiveChatReplyMessageId("");
          deps.setOpenChatMessageMenuId("");
          deps.setOpenEmojiScope("");
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          if (sendResult?.isQueued) {
            deps.setChatComposeStatus?.("context", {
              tone: "warning",
              message: t("chat.offlineSavedStatus", "Uko offline. Ujumbe umehifadhiwa na utatumwa internet ikirudi.")
            });
            deps.showInAppNotification?.({
              title: t("chat.offlineSavedTitle", "Ujumbe umehifadhiwa"),
              body: t("chat.offlineSavedBody", "Uko offline. Tutautuma internet ikirudi."),
              variant: "info"
            });
          } else {
            deps.setChatComposeStatus?.("context", {
              tone: "success",
              message: t("chat.sentStatus", "Ujumbe umetumwa vizuri.")
            });
          }
          deps.maybePromptNotificationPermission?.("message");
          replaceContextChatModal();
        } catch (error) {
          deps.setChatComposeStatus?.("context", {
            tone: "error",
            message: error.message || t("chat.failedBody", "Imeshindikana kutuma ujumbe.")
          });
          deps.captureError?.("context_message_send_failed", error, {
            receiverId: activeChatContext?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: t("chat.failedTitle", "Message failed"),
            body: error.message || t("chat.failedBody", "Imeshindikana kutuma ujumbe."),
            variant: "error"
          });
        }
      });
    }

    function replaceContextChatModal() {
      const modal = document.getElementById("context-chat-modal");
      if (!modal || !deps.getIsContextOpen()) {
        return;
      }

      const activeElement = document.activeElement;
      const wasTyping = activeElement?.id === "context-chat-compose-input";
      const previousDraft = modal.querySelector("#context-chat-compose-input")?.value ?? deps.getCurrentMessageDraft();
      deps.setCurrentMessageDraft(previousDraft);

      const content = modal.querySelector("#context-chat-content");
      if (!content) {
        return;
      }

      content.replaceChildren(deps.createElementFromMarkup(deps.renderContextChatModal()));
      bindContextChatModalActions();

      if (wasTyping) {
        const nextInput = modal.querySelector("#context-chat-compose-input");
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = nextInput.value.length;
          nextInput.selectionEnd = nextInput.value.length;
        }
      }
    }

    async function openContextChatModal() {
      const modal = deps.ensureContextChatModal();
      const content = modal.querySelector("#context-chat-content");
      if (!content) {
        return;
      }

      if (!deps.getActiveConversationMessages().length && !(deps.getCurrentMessageDraft() || "").trim()) {
        deps.setCurrentMessageDraft("Habari, naomba maelezo kuhusu bidhaa hii.");
      }

      content.replaceChildren(deps.createElementFromMarkup(`
        <section class="context-chat-shell context-chat-shell-loading">
          <p class="empty-copy">Loading chat...</p>
        </section>
      `));
      modal.style.display = "grid";
      document.body.classList.add("context-chat-open");
      deps.syncBodyScrollLockState?.();
      deps.setIsContextOpen(true);
      deps.startMessagePolling?.();

      window.requestAnimationFrame(() => {
        content.replaceChildren(deps.createElementFromMarkup(deps.renderContextChatModal()));
        bindContextChatModalActions();

        const input = modal.querySelector("#context-chat-compose-input");
        if (input) {
          input.focus();
          input.selectionStart = input.value.length;
          input.selectionEnd = input.value.length;
        }
      });

      void Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState(), deps.refreshConversationOffersState?.(), deps.refreshConversationAvailabilityState?.()])
        .then(async () => {
          deps.maybePromptNotificationPermission?.("reply");
          await deps.markActiveConversationRead();
        })
        .catch(() => {
          // Ignore passive refresh failures after the modal is already open.
        });
    }

    function openProductChat(product) {
      if (!deps.getCurrentUser()) {
        deps.promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: t("chat.accountRequiredTitle", "You need an account to message the seller"),
          message: t("chat.accountRequiredBody", "Already have an account? Sign in. New here? Create a Winga account to start chatting."),
          intent: {
            type: "open-chat",
            productId: product?.id || ""
          }
        });
        return;
      }
      if (!deps.canUseBuyerFeatures?.()) {
        deps.showInAppNotification?.({
          title: t("chat.staffRestrictedTitle", "Staff account restricted"),
          body: t("chat.staffRestrictedBody", "Admin au moderator hawawezi kufungua buyer chat ya marketplace."),
          variant: "warning"
        });
        return;
      }
      if (!product || product.uploadedBy === deps.getCurrentUser()) {
        return;
      }

      deps.noteMessageInterest(product.id);
      deps.setSelectedChatProductIds([]);
      deps.setActiveChatReplyMessageId("");
      deps.setOpenChatMessageMenuId("");
      deps.setOpenEmojiScope("");
      const nextChatContext = {
        withUser: product.uploadedBy,
        displayName: deps.getUserDisplayName(product.uploadedBy, {
          fallback: product.shop || product.uploadedBy || "",
          shop: product.shop || ""
        }),
        productId: product.id,
        productName: product.name,
        whatsapp: deps.normalizeWhatsapp(product.whatsapp || "")
      };
      deps.setActiveChatContext(nextChatContext);
      deps.setCurrentMessageDraft(deps.loadStoredChatDraft?.(nextChatContext) || "");

      openContextChatModal().catch((error) => {
        deps.captureError?.("context_chat_open_failed", error, {
          productId: product?.id || ""
        });
        deps.showInAppNotification?.({
          title: t("chat.unavailableTitle", "Chat unavailable"),
          body: t("chat.unavailableBody", "Imeshindikana kufungua chat kwa sasa."),
          variant: "error"
        });
      });
    }

    function openOwnProductMessages(productId) {
      if (!deps.getCurrentUser()) {
        return;
      }

      if (deps.isProductDetailOpen?.()) {
        deps.closeProductDetailModal?.({
          skipHistoryBack: true,
          skipContextRestore: true,
          skipRootCardScroll: true
        });
      }

      deps.setSelectedChatProductIds([]);
      deps.setActiveChatReplyMessageId("");
      deps.setOpenChatMessageMenuId("");
      deps.setOpenEmojiScope("");

      const relatedMessage = (Array.isArray(deps.getCurrentMessages?.()) ? deps.getCurrentMessages() : [])
        .filter((message) => (message.productId || "") === productId)
        .sort((first, second) => new Date(second.timestamp || 0).getTime() - new Date(first.timestamp || 0).getTime())[0] || null;
      const relatedWithUser = relatedMessage
        ? (relatedMessage.senderId === deps.getCurrentUser?.() ? relatedMessage.receiverId : relatedMessage.senderId)
        : "";
      const matchingSummary = relatedMessage
        ? deps.getConversationSummaries().find((summary) => summary.withUser === relatedWithUser)
        : deps.getConversationSummaries().find((summary) => summary.productId === productId);
      deps.setCurrentViewState("profile", {
        syncHistory: "push",
        historyState: {
          pendingProfileSection: "profile-messages-panel"
        }
      });
      if (matchingSummary) {
        const nextChatContext = {
          withUser: matchingSummary.withUser,
          displayName: matchingSummary.displayName || deps.getUserDisplayName(matchingSummary.withUser),
          productId: matchingSummary.productId || "",
          productName: matchingSummary.productName || "",
          whatsapp: matchingSummary.whatsapp || ""
        };
        deps.setActiveChatContext(nextChatContext);
        deps.setCurrentMessageDraft(deps.loadStoredChatDraft?.(nextChatContext) || "");
        deps.setProfileMessagesMode?.("detail");
        deps.setProfileHasSelection?.(true);
      } else {
        deps.setActiveChatContext(null);
        deps.setCurrentMessageDraft("");
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
      }
      deps.setActiveProfileSection?.("profile-messages-panel");
      deps.setPendingProfileSection("profile-messages-panel");
      deps.renderCurrentView();

      if (!matchingSummary) {
        deps.showInAppNotification?.({
          title: t("chat.noMessagesTitle", "No messages yet"),
          body: t("chat.noMessagesBody", "Hakuna mazungumzo ya bidhaa hii bado. Utaona inbox yako ya messages hapa."),
          variant: "info"
        });
      }
    }

    function bindMessageActions(scope = deps.getProfileDiv?.()) {
      if (!scope) {
        return;
      }

      const bindMessageLongPress = (targetScope, rerender) => {
        if (!targetScope) {
          return;
        }

        targetScope.querySelectorAll("[data-message-bubble-id]").forEach((bubble) => {
          const datasetKey = "wingaBoundMessageLongPress";
          if (bubble.dataset[datasetKey] === "true") {
            return;
          }
          bubble.dataset[datasetKey] = "true";

          let pressTimer = 0;
          let pressTriggered = false;

          const clearPress = () => {
            if (pressTimer) {
              window.clearTimeout(pressTimer);
            }
            pressTimer = 0;
          };

          const openMenu = () => {
            const messageId = bubble.dataset.messageBubbleId || "";
            if (!messageId) {
              return;
            }
            pressTriggered = true;
            deps.setOpenChatMessageMenuId(messageId);
            rerender();
          };

          bubble.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            clearPress();
            pressTriggered = false;
            pressTimer = window.setTimeout(openMenu, 450);
          });

          bubble.addEventListener("pointerup", clearPress);
          bubble.addEventListener("pointercancel", clearPress);
          bubble.addEventListener("pointerleave", clearPress);
          bubble.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            clearPress();
            openMenu();
          });

          bubble.addEventListener("click", (event) => {
            if (pressTriggered) {
              event.preventDefault();
              event.stopPropagation();
            }
            clearPress();
          });
        });
      };

      const bindClickOnce = (selector, bindingKey, handler) => {
        scope.querySelectorAll(selector).forEach((element) => {
          const datasetKey = `wingaBound${bindingKey}`;
          if (element.dataset[datasetKey] === "true") {
            return;
          }
          element.dataset[datasetKey] = "true";
          element.addEventListener("click", (event) => {
            handler(element, event);
          });
        });
      };

      const bindInputOnce = (selector, bindingKey, handler) => {
        const element = scope.querySelector(selector);
        if (!element) {
          return;
        }
        const datasetKey = `wingaBound${bindingKey}`;
        if (element.dataset[datasetKey] === "true") {
          return;
        }
        element.dataset[datasetKey] = "true";
        element.addEventListener("input", handler);
      };

      const bindSubmitOnce = (selector, bindingKey, handler) => {
        const element = scope.querySelector(selector);
        if (!element) {
          return;
        }
        const datasetKey = `wingaBound${bindingKey}`;
        if (element.dataset[datasetKey] === "true") {
          return;
        }
        element.dataset[datasetKey] = "true";
        element.addEventListener("submit", handler);
      };

      bindClickOnce("[data-order-action]", "OrderAction", async (button) => {
          const orderId = button.dataset.orderId;
          const status = button.dataset.orderAction;
          const isRejectPayment = button.dataset.orderRejectPayment === "true";
          const disputeReason = status === "disputed" && typeof window.prompt === "function"
            ? String(window.prompt(t("order.disputePrompt", "Describe the delivery issue"), "") || "").trim()
            : "";
          if (status === "disputed" && disputeReason.length < 10) {
            deps.showInAppNotification?.({ title: t("order.disputeReasonTitle", "More detail is required"), body: t("order.disputeReasonBody", "Describe the issue using at least 10 characters."), variant: "warning" });
            return;
          }
          if (status === "cancelled" && deps.confirmAction && !deps.confirmAction(isRejectPayment
            ? "Una uhakika unataka kukataa payment proof hii? Order itafungwa."
            : "Una uhakika unataka kufuta order hii?")) {
            return;
          }
          const successMessage = status === "cancelled"
            ? (isRejectPayment
              ? t("order.paymentRejectedSuccess", "Payment proof imekataliwa na order imefungwa.")
              : t("order.cancelledSuccess", "Request/order imecanceliwa."))
            : status === "paid"
              ? t("order.paidSuccess", "Payment imethibitishwa. Buyer ataona update hii mara moja.")
              : status === "confirmed"
                ? t("order.confirmedSuccess", "Seller amejibu na kuthibitisha order.")
                : status === "processing"
                  ? t("order.processingSuccess", "Order imeingia kwenye maandalizi.")
                  : status === "shipped"
                    ? t("order.shippedSuccess", "Order imemarkiwa kuwa imesafirishwa.")
                    : t("order.completedSuccess", "Order imewekwa completed.");
          try {
            deps.setOrderActionStatus?.(orderId, {
              tone: "info",
              message: status === "cancelled"
                ? t("order.cancellingStatus", "Tunafunga order hii sasa.")
                : status === "paid"
                  ? t("order.verifyingPaymentStatus", "Tunathibitisha payment proof sasa.")
                  : status === "confirmed"
                    ? t("order.confirmingStatus", "Tunathibitisha order kwa buyer sasa.")
                    : status === "processing"
                      ? t("order.processingStatus", "Tunaweka order kwenye maandalizi sasa.")
                      : status === "shipped"
                        ? t("order.shippingStatus", "Tunathibitisha kuwa order imesafirishwa.")
                        : t("order.completingStatus", "Tunamark order hii completed sasa.")
            });
            deps.renderProfile?.();
            await deps.dataLayer.updateOrderStatus(orderId, { status, reason: disputeReason || undefined });
            await deps.refreshOrdersState?.();
            deps.setOrderActionStatus?.(orderId, {
              tone: "success",
              message: successMessage
            });
            deps.showInAppNotification?.({
              title: t("order.updatedTitle", "Order updated"),
              body: successMessage,
              variant: "success"
            });
            deps.renderProfile();
          } catch (error) {
            deps.setOrderActionStatus?.(orderId, {
              tone: "error",
              message: error.message || t("order.updateFailedBody", "Imeshindikana kubadilisha status ya order.")
            });
            deps.captureError?.("order_status_update_failed", error, {
              orderId,
              status
            });
            deps.showInAppNotification?.({
              title: t("order.updateFailedTitle", "Order update failed"),
              body: error.message || t("order.updateFailedBody", "Imeshindikana kubadilisha status ya order."),
              variant: "error"
            });
            deps.renderProfile?.();
          }
        });

      bindSubmitOnce("[data-offer-create-form]", "OfferCreate", async (event) => {
        event.preventDefault();
        const context = deps.getActiveChatContext?.();
        const form = event.currentTarget;
        const data = new FormData(form);
        const amount = Number(data.get("amount"));
        const productId = String(data.get("productId") || "").trim();
        if (!context?.withUser || !productId || !Number.isInteger(amount) || amount < 500) {
          deps.setOfferActionStatus?.({ tone: "error", message: t("chat.invalidOffer", "Enter a valid offer amount.") });
          deps.replaceMessagesPanel?.(scope);
          return;
        }
        try {
          deps.setOfferActionStatus?.({ tone: "info", message: t("chat.sendingOffer", "Sending your offer...") });
          await deps.dataLayer.createConversationOffer(
            context.withUser,
            { productId, amount, currency: "TZS" },
            createOfferIdempotencyKey("propose")
          );
          deps.setOfferActionStatus?.({ tone: "success", message: t("chat.offerSent", "Your offer was sent.") });
          await Promise.all([refreshOfferSurface(scope), deps.refreshNotificationsState?.()]);
        } catch (error) {
          deps.setOfferActionStatus?.({ tone: "error", message: error.message || t("chat.offerFailed", "Offer could not be sent.") });
          deps.captureError?.("conversation_offer_create_failed", error, { productId, withUser: context.withUser });
          deps.replaceMessagesPanel?.(scope);
        }
      });

      bindClickOnce("[data-offer-action]", "OfferAction", async (button) => {
        const offerId = button.dataset.offerId || "";
        const action = button.dataset.offerAction || "";
        if (!offerId || !action) {
          return;
        }
        try {
          deps.setOfferActionStatus?.({ tone: "info", message: t("chat.updatingOffer", "Updating offer...") });
          await deps.dataLayer.transitionConversationOffer(
            offerId,
            { action },
            createOfferIdempotencyKey(action)
          );
          deps.setOfferActionStatus?.({ tone: "success", message: t("chat.offerUpdated", "Offer updated.") });
          await Promise.all([refreshOfferSurface(scope), deps.refreshNotificationsState?.()]);
        } catch (error) {
          deps.setOfferActionStatus?.({ tone: "error", message: error.message || t("chat.offerUpdateFailed", "Offer could not be updated.") });
          deps.captureError?.("conversation_offer_transition_failed", error, { offerId, action });
          deps.replaceMessagesPanel?.(scope);
        }
      });

      bindClickOnce("[data-offer-counter]", "OfferCounter", async (button) => {
        const offerId = button.dataset.offerCounter || "";
        const value = typeof window.prompt === "function"
          ? window.prompt(t("chat.counterPrompt", "Enter your counter offer in TZS"), "")
          : "";
        const amount = Number(value);
        if (!offerId || !Number.isInteger(amount) || amount < 500) {
          if (value !== null) {
            deps.setOfferActionStatus?.({ tone: "error", message: t("chat.invalidOffer", "Enter a valid offer amount.") });
            deps.replaceMessagesPanel?.(scope);
          }
          return;
        }
        try {
          deps.setOfferActionStatus?.({ tone: "info", message: t("chat.updatingOffer", "Updating offer...") });
          await deps.dataLayer.transitionConversationOffer(
            offerId,
            { action: "COUNTER", amount },
            createOfferIdempotencyKey("counter")
          );
          deps.setOfferActionStatus?.({ tone: "success", message: t("chat.offerUpdated", "Offer updated.") });
          await Promise.all([refreshOfferSurface(scope), deps.refreshNotificationsState?.()]);
        } catch (error) {
          deps.setOfferActionStatus?.({ tone: "error", message: error.message || t("chat.offerUpdateFailed", "Offer could not be updated.") });
          deps.captureError?.("conversation_offer_counter_failed", error, { offerId });
          deps.replaceMessagesPanel?.(scope);
        }
      });

      bindClickOnce("[data-offer-checkout]", "OfferCheckout", (button) => {
        const product = deps.getProductById?.(button.dataset.offerProduct || "");
        if (!product) {
          return;
        }
        deps.beginPurchaseFlow?.(product, {
          acceptedOfferId: button.dataset.offerCheckout || "",
          agreedPrice: Number(button.dataset.offerPrice || 0)
        });
      });

      bindSubmitOnce("[data-availability-create-form]", "AvailabilityCreate", async (event) => {
        event.preventDefault();
        await createAvailabilityFromForm(event.currentTarget, () => deps.replaceMessagesPanel?.(scope));
      });
      bindClickOnce("[data-availability-action]", "AvailabilityAction", async (button) => {
        await transitionAvailability(button.dataset.availabilityId || "", button.dataset.availabilityAction || "", "", () => deps.replaceMessagesPanel?.(scope));
      });
      bindSubmitOnce("[data-availability-alternative-form]", "AvailabilityAlternative", async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await transitionAvailability(String(data.get("requestId") || ""), "SUGGEST_ALTERNATIVE", String(data.get("responseProductId") || ""), () => deps.replaceMessagesPanel?.(scope));
      });

      bindClickOnce("[data-product-soldout]", "ProductSoldOut", async (button) => {
          const productId = button.dataset.productSoldout;
          if (deps.confirmAction && !deps.confirmAction(t("product.soldOutConfirm", "Una uhakika bidhaa hii imeisha na unataka kuiweka sold out?"))) {
            return;
          }
          try {
            deps.setProductActionStatus?.(productId, {
              tone: "info",
              message: t("product.soldOutPending", "Tunaweka bidhaa hii sold out sasa.")
            });
            deps.renderProfile?.();
            await deps.dataLayer.updateProductAvailability(productId, { availability: "sold_out" });
            deps.setProductActionStatus?.(productId, {
              tone: "success",
              message: t("product.soldOutSuccess", "Bidhaa imewekwa sold out.")
            });
            deps.refreshProductsFromStore();
            deps.reportEvent?.("info", "product_marked_sold_out", "Seller marked product as sold out.", {
              productId
            });
            deps.showInAppNotification?.({
              title: t("product.updatedTitle", "Product updated"),
              body: t("product.soldOutSuccess", "Bidhaa imewekwa sold out."),
              variant: "success"
            });
            deps.renderProfile();
          } catch (error) {
            deps.setProductActionStatus?.(productId, {
              tone: "error",
              message: error.message || t("product.soldOutFailedBody", "Imeshindikana kuweka sold out.")
            });
            deps.captureError?.("product_sold_out_failed", error, {
              productId
            });
            deps.showInAppNotification?.({
              title: t("product.soldOutFailedTitle", "Sold out update failed"),
              body: error.message || t("product.soldOutFailedBody", "Imeshindikana kuweka sold out."),
              variant: "error"
            });
            deps.renderProfile?.();
          }
        });

      bindClickOnce("[data-conversation-user]", "ConversationUser", async (button) => {
          const nextChatContext = {
            withUser: button.dataset.conversationUser,
            productId: button.dataset.conversationProduct || "",
            productName: button.dataset.conversationName || ""
          };
          deps.setActiveChatContext(nextChatContext);
          deps.setProfileMessagesMode?.("detail");
          deps.setProfileHasSelection?.(true);
          deps.setCurrentMessageDraft(deps.loadStoredChatDraft?.(nextChatContext) || "");
          try {
            await Promise.all([deps.markActiveConversationRead(), deps.refreshConversationOffersState?.(), deps.refreshConversationAvailabilityState?.()]);
          } catch (error) {
            // Ignore passive read sync failures on thread switch.
          }
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        });

      bindClickOnce("[data-message-list-back]", "MessageListBack", () => {
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.replaceMessagesPanel(scope);
      });

      bindClickOnce("[data-close-profile-messages]", "CloseProfileMessages", () => {
        deps.setProfileMessagesMode?.("list");
        deps.setProfileHasSelection?.(false);
        deps.setActiveChatContext?.(null);
        deps.setActiveProfileSection?.("profile-products-panel");
        deps.setPendingProfileSection?.("profile-products-panel");
        deps.renderProfile?.();
      });

      bindMessageLongPress(scope, () => deps.replaceMessagesPanel(scope));

      bindClickOnce("[data-refresh-messages]", "RefreshMessages", async () => {
        try {
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState(), deps.refreshOrdersState?.()]);
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("messages_manual_refresh_failed", error, {
            user: deps.getCurrentUser?.() || ""
          });
          deps.showInAppNotification?.({
            title: t("chat.refreshFailedTitle", "Refresh failed"),
            body: error.message || t("chat.refreshFailedBody", "Imeshindikana ku-refresh messages."),
            variant: "warning"
          });
        }
      });

      bindClickOnce("[data-chat-open-product]", "ChatOpenProduct", (button) => {
        const productId = button.dataset.chatOpenProduct || "";
        if (!productId || !deps.openProductDetailModal) {
          return;
        }
        deps.openProductDetailModal(productId);
      });

      bindClickOnce("[data-chat-buy-product]", "ChatBuyProduct", (button) => {
        const productId = button.dataset.chatBuyProduct || "";
        if (!productId || !deps.beginPurchaseFlow || !deps.getProductById) {
          return;
        }
        const product = deps.getProductById(productId);
        if (!product) {
          return;
        }
        deps.beginPurchaseFlow(product);
      });

      bindClickOnce("[data-share-my-phone]", "ShareMyPhone", async () => {
        try {
          await sharePhoneWithActiveChat();
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("profile_phone_share_failed", error, {
            receiverId: deps.getActiveChatContext?.()?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: t("chat.sharingFailedTitle", "Sharing failed"),
            body: error.message || t("chat.sharingFailedBody", "Imeshindikana kushare namba yako kwa sasa."),
            variant: "error"
          });
        }
      });

      bindClickOnce("[data-notification-id]", "NotificationRead", async (button) => {
          try {
            const handledLocally = await deps.handleNotificationOpen?.(button.dataset.notificationId);
            if (!handledLocally) {
              await deps.dataLayer.markNotificationRead(button.dataset.notificationId);
              await deps.refreshNotificationsState();
            }
            document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
            bindMessageActions(scope);
          } catch (error) {
            deps.captureError?.("notification_read_failed", error, {
              notificationId: button.dataset.notificationId
            });
            deps.showInAppNotification?.({
              title: t("chat.notificationFailedTitle", "Notification failed"),
              body: error.message || t("chat.notificationFailedBody", "Imeshindikana kufungua notification."),
              variant: "error"
            });
          }
        });

      bindSubmitOnce("#message-compose-form", "MessageComposeForm", async (event) => {
        event.preventDefault();
        const messageInput = document.getElementById("message-compose-input");
        const message = messageInput?.value.trim() || "";
        const activeChatContext = deps.getActiveChatContext();
        if (!activeChatContext || !message) {
          return;
        }
        try {
          const sendKey = createMessageSubmissionKey(activeChatContext, message, []);
          deps.setChatComposeStatus?.("profile", {
            tone: "info",
            message: t("chat.sendingStatus", "Tunatuma ujumbe wako sasa.")
          });
          const sendResult = await runRetrySafeMessageSend(sendKey, () => deps.dataLayer.sendMessage({
            receiverId: activeChatContext.withUser,
            productId: activeChatContext.productId || "",
            productName: activeChatContext.productName || "",
            message
          }), {
            pending: t("chat.duplicatePending", "Ujumbe huu bado unatoka. Subiri kidogo kabla ya kubonyeza tena."),
            completed: t("chat.duplicateCompleted", "Ujumbe huu tayari umetumwa. Angalia thread kabla ya kutuma tena.")
          });
          if (sendResult?.skipped) {
            deps.setChatComposeStatus?.("profile", {
              tone: "info",
              message: sendResult.reason === "completed"
                ? t("chat.duplicateCompleted", "Ujumbe huu tayari umetumwa. Angalia thread kwanza.")
                : t("chat.duplicatePending", "Ujumbe huu bado unatoka. Subiri kidogo kabla ya kutuma tena.")
            });
            deps.replaceMessagesPanel(scope);
            return;
          }
          if (messageInput) {
            messageInput.value = "";
          }
          deps.setCurrentMessageDraft("");
          deps.setOpenEmojiScope("");
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          if (sendResult?.isQueued) {
            deps.setChatComposeStatus?.("profile", {
              tone: "warning",
              message: t("chat.offlineSavedStatus", "Uko offline. Ujumbe umehifadhiwa na utatumwa internet ikirudi.")
            });
            deps.showInAppNotification?.({
              title: t("chat.offlineSavedTitle", "Ujumbe umehifadhiwa"),
              body: t("chat.offlineSavedBody", "Uko offline. Tutautuma internet ikirudi."),
              variant: "info"
            });
          } else {
            deps.setChatComposeStatus?.("profile", {
              tone: "success",
              message: t("chat.sentStatus", "Ujumbe umetumwa vizuri.")
            });
          }
          deps.maybePromptNotificationPermission?.("message");
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.setChatComposeStatus?.("profile", {
            tone: "error",
            message: error.message || t("chat.failedBody", "Imeshindikana kutuma ujumbe.")
          });
          deps.captureError?.("profile_message_send_failed", error, {
            receiverId: activeChatContext?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: t("chat.failedTitle", "Message failed"),
            body: error.message || t("chat.failedBody", "Imeshindikana kutuma ujumbe."),
            variant: "error"
          });
        }
      });

      bindInputOnce("#message-compose-input", "MessageComposeInput", (event) => {
        deps.setCurrentMessageDraft(event.target.value || "");
      });

      bindClickOnce("[data-emoji-toggle]", "EmojiToggle", (button) => {
          const scopeId = button.dataset.emojiToggle || "";
          deps.setOpenEmojiScope(deps.getOpenEmojiScope() === scopeId ? "" : scopeId);
          deps.replaceMessagesPanel(scope);
      });

      bindClickOnce("[data-insert-emoji]", "InsertEmoji", (button) => {
          deps.setCurrentMessageDraft(`${deps.getCurrentMessageDraft() || ""}${button.dataset.insertEmoji || ""}`);
          deps.setOpenEmojiScope("");
          deps.replaceMessagesPanel(scope);
      });
    }

    return {
      bindMessageActions,
      closeContextChatModal,
      bindContextChatModalActions,
      replaceContextChatModal,
      openContextChatModal,
      openProductChat,
      openOwnProductMessages
    };
  }

  window.WingaModules.chat.createChatControllerModule = createChatControllerModule;
})();
