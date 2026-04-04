(() => {
  function createChatControllerModule(deps) {
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
        title: "Phone shared",
        body: "Muuzaji huyu sasa ataweza kuona namba yako ndani ya mazungumzo haya.",
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
            title: "Sharing failed",
            body: error.message || "Imeshindikana kushare namba yako kwa sasa.",
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
                title: "Copied",
                body: "Ujumbe umewekwa kwenye clipboard.",
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
              title: "Delete failed",
              body: error.message || "Imeshindikana kufuta ujumbe.",
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
          await deps.dataLayer.sendMessage({
            receiverId: activeChatContext.withUser,
            productId: activeChatContext.productId || "",
            productName: activeChatContext.productName || "",
            message,
            messageType: productItems.length > 1 ? "product_inquiry" : productItems.length === 1 ? "product_reference" : "text",
            productItems,
            replyToMessageId: deps.getActiveChatReplyMessageId()
          });
          deps.setCurrentMessageDraft("");
          deps.setSelectedChatProductIds([]);
          deps.setActiveChatReplyMessageId("");
          deps.setOpenChatMessageMenuId("");
          deps.setOpenEmojiScope("");
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          replaceContextChatModal();
        } catch (error) {
          deps.captureError?.("context_message_send_failed", error, {
            receiverId: activeChatContext?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: "Message failed",
            body: error.message || "Imeshindikana kutuma ujumbe.",
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

      try {
        await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
        await deps.markActiveConversationRead();
      } catch (error) {
        // Ignore passive refresh failures before opening.
      }

      if (!deps.getActiveConversationMessages().length && !(deps.getCurrentMessageDraft() || "").trim()) {
        deps.setCurrentMessageDraft("Habari, naomba maelezo kuhusu bidhaa hii.");
      }

      content.replaceChildren(deps.createElementFromMarkup(deps.renderContextChatModal()));
      bindContextChatModalActions();
      modal.style.display = "grid";
      document.body.classList.add("context-chat-open");
      deps.syncBodyScrollLockState?.();
      deps.setIsContextOpen(true);
      deps.startMessagePolling?.();

      const input = modal.querySelector("#context-chat-compose-input");
      if (input) {
        input.focus();
        input.selectionStart = input.value.length;
        input.selectionEnd = input.value.length;
      }
    }

    function openProductChat(product) {
      if (!deps.getCurrentUser()) {
        deps.promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: "You need an account to message the seller",
          message: "Already have an account? Sign In. New here? Sign Up as a buyer to start chatting.",
          intent: {
            type: "open-chat",
            productId: product?.id || ""
          }
        });
        return;
      }
      if (!deps.canUseBuyerFeatures?.()) {
        deps.showInAppNotification?.({
          title: "Admin account restricted",
          body: "Admin au moderator hawawezi kufungua buyer chat ya marketplace.",
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
      deps.setActiveChatContext({
        withUser: product.uploadedBy,
        displayName: deps.getUserDisplayName(product.uploadedBy, {
          fallback: product.shop || product.uploadedBy || "",
          shop: product.shop || ""
        }),
        productId: product.id,
        productName: product.name,
        whatsapp: deps.normalizeWhatsapp(product.whatsapp || "")
      });

      openContextChatModal().catch((error) => {
        deps.captureError?.("context_chat_open_failed", error, {
          productId: product?.id || ""
        });
        deps.showInAppNotification?.({
          title: "Chat unavailable",
          body: "Imeshindikana kufungua chat kwa sasa.",
          variant: "error"
        });
      });
    }

    function openOwnProductMessages(productId) {
      if (!deps.getCurrentUser()) {
        return;
      }

      deps.setSelectedChatProductIds([]);
      deps.setActiveChatReplyMessageId("");
      deps.setOpenChatMessageMenuId("");

      const matchingSummary = deps.getConversationSummaries().find((summary) => summary.productId === productId);
      deps.setCurrentViewState("profile", {
        syncHistory: "push",
        historyState: {
          pendingProfileSection: "profile-messages-panel"
        }
      });
      if (matchingSummary) {
        deps.setActiveChatContext({
          withUser: matchingSummary.withUser,
          displayName: matchingSummary.displayName || deps.getUserDisplayName(matchingSummary.withUser),
          productId: matchingSummary.productId || "",
          productName: matchingSummary.productName || "",
          whatsapp: matchingSummary.whatsapp || ""
        });
      }
      deps.setPendingProfileSection("profile-messages-panel");
      deps.renderCurrentView();

      if (!matchingSummary) {
        deps.showInAppNotification?.({
          title: "No messages yet",
          body: "Hakuna mazungumzo ya bidhaa hii bado. Utaona inbox yako ya messages hapa.",
          variant: "info"
        });
      }
    }

    function bindMessageActions(scope = deps.getProfileDiv?.()) {
      if (!scope) {
        return;
      }

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
          if (status === "cancelled" && deps.confirmAction && !deps.confirmAction("Una uhakika unataka kufuta order hii?")) {
            return;
          }
          try {
            await deps.dataLayer.updateOrderStatus(orderId, { status });
            deps.showInAppNotification?.({
              title: "Order updated",
              body: status === "cancelled"
                ? "Order imefutwa."
                : status === "confirmed"
                  ? "Order imethibitishwa."
                  : "Order imewekwa delivered.",
              variant: "success"
            });
            deps.renderProfile();
          } catch (error) {
            deps.captureError?.("order_status_update_failed", error, {
              orderId,
              status
            });
            deps.showInAppNotification?.({
              title: "Order update failed",
              body: error.message || "Imeshindikana kubadilisha status ya order.",
              variant: "error"
            });
          }
        });

      bindClickOnce("[data-product-soldout]", "ProductSoldOut", async (button) => {
          const productId = button.dataset.productSoldout;
          if (deps.confirmAction && !deps.confirmAction("Una uhakika bidhaa hii imeisha na unataka kuiweka sold out?")) {
            return;
          }
          try {
            await deps.dataLayer.updateProductAvailability(productId, { availability: "sold_out" });
            deps.refreshProductsFromStore();
            deps.reportEvent?.("info", "product_marked_sold_out", "Seller marked product as sold out.", {
              productId
            });
            deps.showInAppNotification?.({
              title: "Product updated",
              body: "Bidhaa imewekwa sold out.",
              variant: "success"
            });
            deps.renderProfile();
          } catch (error) {
            deps.captureError?.("product_sold_out_failed", error, {
              productId
            });
            deps.showInAppNotification?.({
              title: "Sold out update failed",
              body: error.message || "Imeshindikana kuweka sold out.",
              variant: "error"
            });
          }
        });

      bindClickOnce("[data-conversation-user]", "ConversationUser", async (button) => {
          deps.setActiveChatContext({
            withUser: button.dataset.conversationUser,
            productId: button.dataset.conversationProduct || "",
            productName: button.dataset.conversationName || ""
          });
          deps.setCurrentMessageDraft("");
          try {
            await deps.markActiveConversationRead();
          } catch (error) {
            // Ignore passive read sync failures on thread switch.
          }
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        });

      bindClickOnce("[data-refresh-messages]", "RefreshMessages", async () => {
        try {
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("messages_manual_refresh_failed", error, {
            user: deps.getCurrentUser?.() || ""
          });
          deps.showInAppNotification?.({
            title: "Refresh failed",
            body: error.message || "Imeshindikana ku-refresh messages.",
            variant: "warning"
          });
        }
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
            title: "Sharing failed",
            body: error.message || "Imeshindikana kushare namba yako kwa sasa.",
            variant: "error"
          });
        }
      });

      bindClickOnce("[data-notification-id]", "NotificationRead", async (button) => {
          try {
            await deps.dataLayer.markNotificationRead(button.dataset.notificationId);
            await deps.refreshNotificationsState();
            document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
            bindMessageActions(scope);
          } catch (error) {
            deps.captureError?.("notification_read_failed", error, {
              notificationId: button.dataset.notificationId
            });
            deps.showInAppNotification?.({
              title: "Notification failed",
              body: error.message || "Imeshindikana kufungua notification.",
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
          await deps.dataLayer.sendMessage({
            receiverId: activeChatContext.withUser,
            productId: activeChatContext.productId || "",
            productName: activeChatContext.productName || "",
            message
          });
          if (messageInput) {
            messageInput.value = "";
          }
          deps.setCurrentMessageDraft("");
          deps.setOpenEmojiScope("");
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          deps.replaceMessagesPanel(scope);
          document.getElementById("profile-notifications-panel")?.replaceWith(deps.createNotificationsContainerFromState());
        } catch (error) {
          deps.captureError?.("profile_message_send_failed", error, {
            receiverId: activeChatContext?.withUser || ""
          });
          deps.showInAppNotification?.({
            title: "Message failed",
            body: error.message || "Imeshindikana kutuma ujumbe.",
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
