(() => {
  function createChatUiModule(deps) {
    function createElementFromMarkup(markup) {
      return deps.createElementFromMarkup(markup);
    }

    function renderResponsiveImageMarkup({ src = "", alt = "", className = "", fallbackKey = "W" } = {}) {
      return deps.createResponsiveImage({
        src,
        alt,
        className,
        fallbackSrc: deps.getImageFallbackDataUri(fallbackKey)
      }).outerHTML;
    }

    function renderChatProductPreviewItems(items, options = {}) {
      const { selectable = false } = options;
      if (!items.length) {
        return "";
      }

      const selectedSet = new Set(deps.getSelectedChatProductIds ? deps.getSelectedChatProductIds() : []);
      return `
        <div class="${selectable ? "chat-seller-products" : "message-product-items"}">
          ${items.map((item) => {
            const product = item.productId
              ? (deps.getProductById ? deps.getProductById(item.productId) : deps.getProducts().find((entry) => entry.id === item.productId))
              : null;
            const isSelected = selectable && selectedSet.has(item.productId);
            const image = deps.sanitizeImageSource(
              item.productImage || product?.image || "",
              deps.getImageFallbackDataUri("W")
            );
            const category = item.category || product?.category || "";
            const safeProductName = deps.escapeHtml(item.productName || "");
            return `
              <article class="chat-product-chip${isSelected ? " selected" : ""}" ${selectable ? `data-chat-select-product="${item.productId}"` : ""}>
                ${renderResponsiveImageMarkup({ src: image, alt: safeProductName, fallbackKey: "W" })}
                <div>
                  <strong>${safeProductName}</strong>
                  <span>${category ? `${deps.getCategoryLabel(category)} | ` : ""}${deps.formatProductPrice(item.price)}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderConversationMessagesMarkup(activeMessages, options = {}) {
      const { enableActions = false } = options;
      if (!activeMessages.length) {
        return `<p class="empty-copy">Anza mazungumzo kuhusu bidhaa hii hapa chini.</p>`;
      }

      return activeMessages.map((message) => {
        const productItems = deps.getMessageProductItems(message);
        const replyMessage = deps.getReplyPreviewMessage(message, activeMessages);
        const canDelete = message.senderId === deps.getCurrentUser();
        const hasDownload = productItems.some((item) => item.productImage);
        const safeReplyText = replyMessage ? deps.escapeHtml(deps.getMessagePreviewText(replyMessage)) : "";
        const safeMessageText = message.message ? deps.escapeHtml(message.message) : "";
        return `
          <div class="message-bubble ${message.senderId === deps.getCurrentUser() ? "outgoing" : "incoming"}${productItems.length ? " message-bubble-product" : ""}">
            ${replyMessage ? `<div class="message-reply-preview"><strong>Reply</strong><span>${safeReplyText}</span></div>` : ""}
            ${productItems.length ? renderChatProductPreviewItems(productItems) : ""}
            ${message.message ? `<p>${safeMessageText}</p>` : ""}
            <small>${new Date(message.timestamp).toLocaleString("sw-TZ")} ${message.senderId === deps.getCurrentUser() ? `| ${message.isRead ? "Read" : message.isDelivered ? "Delivered" : "Sent"}` : ""}</small>
            ${enableActions ? `
              <button class="message-menu-trigger" type="button" data-message-menu-toggle="${message.id}">...</button>
              ${deps.getOpenChatMessageMenuId() === message.id ? `
                <div class="message-action-menu">
                  <button type="button" data-message-reply="${message.id}">Reply</button>
                  <button type="button" data-message-share="${message.id}">Share</button>
                  ${hasDownload ? `<button type="button" data-message-download="${message.id}">Download image</button>` : ""}
                  ${canDelete ? `<button type="button" data-message-delete="${message.id}">Delete</button>` : ""}
                </div>
              ` : ""}
            ` : ""}
          </div>
        `;
      }).join("");
    }

    function renderNotificationsSection() {
      const items = deps.getCurrentNotifications()
        .slice()
        .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
      const unreadCount = deps.getUnreadNotifications().length;

      return `
        <section id="profile-notifications-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Notifications</p>
              <h3>Message Alerts</h3>
            </div>
            <span class="meta-copy">${unreadCount} unread</span>
          </div>
          <div class="notifications-list">
            ${items.length ? items.map((notification) => `
              <button class="notification-item ${notification.isRead ? "" : "unread"}" type="button" data-notification-id="${notification.id}">
                <strong>${deps.escapeHtml(notification.title)}</strong>
                <span>${deps.escapeHtml(notification.body || "New activity")}</span>
                <small>${new Date(notification.createdAt || Date.now()).toLocaleString("sw-TZ")}</small>
              </button>
            `).join("") : `<p class="empty-copy">Hakuna notification mpya kwa sasa.</p>`}
          </div>
        </section>
      `;
    }

    function renderMessagesSection() {
      const summaries = deps.getConversationSummaries();
      const activeMessages = deps.getActiveConversationMessages();
      const activeChatContext = deps.getActiveChatContext();
      const currentMessageDraft = deps.getCurrentMessageDraft();
      const contactState = deps.getChatContactState(activeChatContext);
      const activeWhatsApp = contactState.whatsapp;
      const isCompactMessagesLayout = Boolean(deps.isCompactMessagesLayout?.());
      const profileMessagesMode = deps.getProfileMessagesMode?.() || "list";
      const showDetailOnly = isCompactMessagesLayout && activeChatContext && profileMessagesMode === "detail";
      const showConversationList = !showDetailOnly;
      const showConversationDetail = !isCompactMessagesLayout || profileMessagesMode === "detail";
      const lastActiveLabel = activeMessages[activeMessages.length - 1]?.timestamp
        ? `Last active ${new Date(activeMessages[activeMessages.length - 1].timestamp).toLocaleString("sw-TZ")}`
        : "Ready to continue the conversation";

      return `
        <section id="profile-messages-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Messages</p>
              <h3>Chat ya Mteja na Muuzaji</h3>
            </div>
            <span class="meta-copy">${summaries.length} conversations</span>
          </div>
          <div class="messages-shell ${showDetailOnly ? "compact-detail" : ""}">
            ${showConversationList ? `
            <div class="messages-list">
              ${summaries.length ? summaries.map((summary) => `
                <button class="message-thread-item ${activeChatContext && summary.key === deps.getChatContextKey(activeChatContext) ? "active" : ""}" type="button" data-conversation-user="${summary.withUser}" data-conversation-product="${summary.productId}" data-conversation-name="${deps.escapeHtml(summary.productName)}">
                  <strong>${deps.escapeHtml(summary.displayName || deps.getUserDisplayName(summary.withUser))}${summary.unreadCount ? ` <span class="thread-badge">${summary.unreadCount}</span>` : ""}</strong>
                  <span>${deps.escapeHtml(summary.productName || "General inquiry")}</span>
                  <small>${deps.escapeHtml(summary.latestMessage || "Hakuna ujumbe bado.")}</small>
                </button>
              `).join("") : `<p class="empty-copy">Hakuna conversation bado. Tumia Message Muuzaji kwenye bidhaa uanze chat.</p>`}
            </div>
            ` : ""}
            ${showConversationDetail ? `
            <div class="messages-thread-card">
              ${activeChatContext ? `
                <div class="messages-thread-head">
                  ${isCompactMessagesLayout ? `<button class="message-list-back" type="button" data-message-list-back="true">Back</button>` : ""}
                  <div>
                    <strong>${deps.escapeHtml(activeChatContext.displayName || deps.getUserDisplayName(activeChatContext.withUser))}</strong>
                    <p>${deps.escapeHtml(activeChatContext.productName || "General inquiry")}</p>
                    <small class="thread-presence">${lastActiveLabel}</small>
                  </div>
                  <div class="messages-thread-actions">
                    <button class="action-btn edit-btn" type="button" data-refresh-messages="true">Refresh</button>
                    ${contactState.canSharePhone ? `<button class="action-btn action-btn-secondary" type="button" data-share-my-phone="true">Share my phone</button>` : ""}
                    ${activeWhatsApp ? `<a class="button" href="${deps.buildWhatsappHref(activeWhatsApp, activeChatContext.productName)}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>` : ""}
                  </div>
                </div>
                ${contactState.note ? `<p class="thread-contact-note">${deps.escapeHtml(contactState.note)}</p>` : ""}
                <div class="messages-thread-body">
                  ${renderConversationMessagesMarkup(activeMessages)}
                </div>
                <form id="message-compose-form" class="messages-compose">
                  <textarea id="message-compose-input" rows="3" maxlength="1000" placeholder="Andika ujumbe wako hapa...">${deps.escapeHtml(currentMessageDraft)}</textarea>
                  <div class="chat-compose-footer">
                    ${deps.renderEmojiPicker("profile")}
                    <div class="chat-compose-actions">
                      <span class="meta-copy">${currentMessageDraft.trim().length}/1000</span>
                      <button type="submit" class="action-btn buy-btn">Send Message</button>
                    </div>
                  </div>
                </form>
              ` : `<p class="empty-copy">Chagua conversation au tumia Message Muuzaji kutoka kwenye bidhaa.</p>`}
            </div>
            ` : ""}
          </div>
        </section>
      `;
    }

    function createNotificationsContainerFromState() {
      return createElementFromMarkup(renderNotificationsSection());
    }

    function createMessagesContainerFromState() {
      return createElementFromMarkup(renderMessagesSection());
    }

    function ensureContextChatModal() {
      let modal = document.getElementById("context-chat-modal");
      if (modal) {
        return modal;
      }

      modal = document.createElement("div");
      modal.id = "context-chat-modal";
      modal.style.display = "none";
      const backdrop = deps.createElement("div", {
        className: "context-chat-backdrop",
        attributes: { "data-close-context-chat": "true" }
      });
      const dialog = deps.createElement("div", {
        className: "context-chat-dialog panel",
        attributes: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "context-chat-title"
        }
      });
      dialog.append(
        deps.createElement("button", {
          className: "context-chat-close",
          textContent: "\u00D7",
          attributes: {
            type: "button",
            "aria-label": "Close chat",
            "data-close-context-chat": "true"
          }
        }),
        deps.createElement("div", { attributes: { id: "context-chat-content" } })
      );
      modal.replaceChildren(backdrop, dialog);
      document.body.appendChild(modal);
      return modal;
    }

    function renderContextChatModal() {
      const activeChatContext = deps.getActiveChatContext();
      const currentMessageDraft = deps.getCurrentMessageDraft();
      const product = deps.getActiveChatProduct();
      const seller = product ? deps.getMarketplaceUser(product.uploadedBy) : null;
      const activeMessages = deps.getActiveConversationMessages();
      const contactState = deps.getChatContactState(activeChatContext);
      const activeWhatsApp = contactState.whatsapp;
      const productName = activeChatContext?.productName || product?.name || "General inquiry";
      const sellerName = activeChatContext?.displayName
        || deps.getUserDisplayName(activeChatContext?.withUser, {
          fallback: seller?.fullName || product?.shop || activeChatContext?.withUser || "",
          shop: product?.shop || "",
          role: seller?.role || ""
        });
      const productImage = deps.sanitizeImageSource(product?.image || "", deps.getImageFallbackDataUri("W"));
      const sellerProducts = deps.getSellerProductsForActiveChat(8).map((item) => ({
        productId: item.id,
        productName: item.name,
        productImage: item.image,
        price: item.price ?? null,
        sellerId: item.uploadedBy,
        category: item.category || ""
      }));
      const selectedProducts = deps.getSelectedChatProducts();
      const replyMessage = deps.getActiveChatReplyMessageId()
        ? activeMessages.find((item) => item.id === deps.getActiveChatReplyMessageId()) || null
        : null;
      const safeProductName = deps.escapeHtml(productName);
      const safeSellerName = deps.escapeHtml(sellerName);
      const lastActiveLabel = activeMessages[activeMessages.length - 1]?.timestamp
        ? `Last active ${new Date(activeMessages[activeMessages.length - 1].timestamp).toLocaleString("sw-TZ")}`
        : "Ready to chat";

      return `
        <section class="context-chat-shell">
          <div class="context-chat-head">
            <div>
              <p class="eyebrow">Chat</p>
              <h3 id="context-chat-title">${safeSellerName}</h3>
              <p class="context-chat-presence">${lastActiveLabel}</p>
            </div>
          </div>
          <div class="context-chat-product">
            ${renderResponsiveImageMarkup({ src: productImage, alt: safeProductName, className: "product-detail-image", fallbackKey: "W" })}
            <div>
              <strong>${safeProductName}</strong>
              <p>${safeSellerName}</p>
            </div>
          </div>
          <div class="context-chat-thread">
            ${renderConversationMessagesMarkup(activeMessages, { enableActions: true })}
          </div>
          <div class="context-chat-actions">
            ${contactState.canSharePhone ? `<button class="action-btn action-btn-secondary" type="button" data-share-my-phone="true">Share my phone</button>` : ""}
            ${activeWhatsApp ? `<a class="button whatsapp-chat-btn" href="${deps.buildWhatsappHref(activeWhatsApp, productName)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
          </div>
          ${contactState.note ? `<p class="thread-contact-note context-chat-note">${deps.escapeHtml(contactState.note)}</p>` : ""}
          ${selectedProducts.length ? `
            <div class="context-chat-selection-bar">
              <strong>${selectedProducts.length} item${selectedProducts.length > 1 ? "s" : ""} selected</strong>
              <button type="button" class="action-btn action-btn-secondary" data-clear-chat-selection="true">Clear</button>
            </div>
          ` : ""}
          ${replyMessage ? `
            <div class="context-chat-reply-bar">
              <strong>Replying to</strong>
              <span>${deps.escapeHtml(deps.getMessagePreviewText(replyMessage))}</span>
              <button type="button" data-clear-chat-reply="true">&times;</button>
            </div>
          ` : ""}
          <form id="context-chat-compose-form" class="messages-compose context-chat-compose">
            <textarea id="context-chat-compose-input" rows="3" maxlength="1000" placeholder="Andika ujumbe wako hapa...">${deps.escapeHtml(currentMessageDraft)}</textarea>
            <div class="chat-compose-footer">
              ${deps.renderEmojiPicker("context")}
              <div class="chat-compose-actions">
                <span class="meta-copy">${currentMessageDraft.trim().length}/1000</span>
                <button type="submit" class="action-btn buy-btn">Send</button>
              </div>
            </div>
          </form>
          <div class="context-chat-quick-asks">
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Bei ya hizi ni kiasi gani?">Bei?</button>
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Je, hizi bidhaa bado zipo?">Zipo?</button>
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Naweza kupata size tofauti?">Size?</button>
            <button type="button" class="action-btn action-btn-secondary" data-chat-prefill="Location yako ni wapi?">Location?</button>
          </div>
          <section class="context-chat-seller-section">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Zaidi Kutoka Kwa Muuzaji</p>
                <h3>Continue browsing while chatting</h3>
              </div>
              <span class="meta-copy">Tap products to add them into this inquiry</span>
            </div>
            ${renderChatProductPreviewItems(sellerProducts, { selectable: true })}
          </section>
        </section>
      `;
    }

    return {
      renderNotificationsSection,
      renderMessagesSection,
      renderChatProductPreviewItems,
      renderConversationMessagesMarkup,
      createNotificationsContainerFromState,
      createMessagesContainerFromState,
      ensureContextChatModal,
      renderContextChatModal
    };
  }

  window.WingaModules.chat.createChatUiModule = createChatUiModule;
})();
