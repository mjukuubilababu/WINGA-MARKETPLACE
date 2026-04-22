(() => {
  function createProductActionsModule(deps) {
    const {
      getCurrentUser,
      getCurrentSession,
      getChatUiState,
      chatEmojiChoices,
      isProductInRequestBox,
      canUseBuyerFeatures,
      renderWhatsappChatLink,
      canRepostProduct,
      getOrderActionState,
      buyerCancelWindowMs
    } = deps;

    function getViewerRole() {
      return String(getCurrentSession?.()?.role || "").trim().toLowerCase();
    }

    function renderRepostButton(product) {
      if (getViewerRole() !== "seller") {
        return "";
      }
      if (typeof canRepostProduct === "function" && !canRepostProduct(product)) {
        return "";
      }
      return `<button class="action-btn action-btn-secondary repost-btn" type="button" data-detail-repost="${product.id}">Uza</button>`;
    }

    function renderBuyButton(product) {
      const currentUser = getCurrentUser();
      if (product?.uploadedBy === currentUser) {
        return "";
      }
      const canOpenDetail = product?.status === "approved";
      if (!canOpenDetail) {
        return `<button class="action-btn buy-btn is-disabled" type="button" disabled aria-disabled="true">Nunua</button>`;
      }

      return `<button class="action-btn buy-btn" type="button" data-buy-product="${product.id}">Nunua</button>`;
    }

    function renderSellerSoldOutButton(product) {
      const currentUser = getCurrentUser();
      if (!currentUser || product.uploadedBy !== currentUser || product.availability === "sold_out") {
        return "";
      }

      return `<button class="action-btn soldout-btn" type="button" data-product-soldout="${product.id}">Sold Out</button>`;
    }

    function getOrderActionButtons(order) {
      const currentUser = getCurrentUser();
      const state = typeof getOrderActionState === "function"
        ? getOrderActionState(order, currentUser, Date.now(), buyerCancelWindowMs)
        : {
          canConfirm: order.sellerUsername === currentUser && order.status === "placed",
          canConfirmReceived: order.buyerUsername === currentUser && order.status === "confirmed",
          canCancel: order.buyerUsername === currentUser && order.status === "placed"
            && (Date.now() - new Date(order.createdAt || 0).getTime() >= buyerCancelWindowMs)
        };
      const actions = [];

      if (state.canConfirm) {
        actions.push(`<button class="action-btn buy-btn" type="button" data-order-action="confirmed" data-order-id="${order.id}">Respond & Confirm</button>`);
      }

      if (state.canConfirmReceived) {
        actions.push(`<button class="action-btn buy-btn" type="button" data-order-action="delivered" data-order-id="${order.id}">Mark Completed</button>`);
      }

      if (state.canCancel) {
        actions.push(`<button class="action-btn delete-btn" type="button" data-order-action="cancelled" data-order-id="${order.id}">Cancel Request</button>`);
      }

      return actions.join("");
    }

    function getOrderProgressLabel(order) {
      if (!order) {
        return "";
      }
      if (order.status === "placed" && order.paymentStatus === "pending") {
        return "Request sent. Payment reference imepokelewa na Winga inasubiri verification kabla seller hajajibu.";
      }
      if (order.status === "paid") {
        return "Payment verified. Seller sasa anatakiwa kujibu na kuthibitisha order hii.";
      }
      if (order.status === "placed") {
        return "Request sent. Order inasubiri hatua inayofuata ya verification au majibu ya seller.";
      }
      if (order.status === "confirmed") {
        return "Seller responded and confirmed the order. Buyer anasubiri kupokea mzigo na kumark completed.";
      }
      if (order.status === "delivered") {
        return "Order completed. Buyer anaweza sasa kuacha review ya bidhaa na huduma ya seller.";
      }
      if (order.status === "cancelled") {
        return "Order hii imecanceliwa. Hakuna hatua nyingine itakayofuata.";
      }
      return "Fuatilia status ya order hapa hadi ikamilike.";
    }

    function renderProductOverflowMenu(product, options = {}) {
      const { overlay = false } = options;
      const currentUser = getCurrentUser();
      const isOwner = Boolean(currentUser && product?.uploadedBy === currentUser);
      if (!isOwner) {
        return "";
      }
      return `
        <div class="product-menu${overlay ? " product-menu-overlay" : ""}" data-product-menu="${product.id}">
          <button class="product-menu-toggle" type="button" aria-label="Fungua menu" data-menu-toggle="${product.id}">&#8942;</button>
          <div class="product-menu-popup" data-menu-popup="${product.id}">
            <button class="product-menu-item" type="button" data-menu-action="share" data-id="${product.id}">Share</button>
            <button class="product-menu-item" type="button" data-menu-action="download" data-id="${product.id}">Download</button>
            <button class="product-menu-item product-menu-item-danger" type="button" data-menu-action="delete" data-id="${product.id}">Delete</button>
          </div>
        </div>
      `;
    }

    function renderMessageSellerButton(product) {
      const currentUser = getCurrentUser();
      const viewerRole = getViewerRole();
      if (product.uploadedBy === currentUser) {
        if (viewerRole === "seller") {
          return `<button class="action-btn chat-btn" type="button" data-open-own-messages="${product.id}">Message</button>`;
        }
        return "";
      }
      if (product.status !== "approved") {
        return `<button class="action-btn chat-btn is-disabled" type="button" disabled aria-disabled="true">Message</button>`;
      }
      if (currentUser && typeof canUseBuyerFeatures === "function" && !canUseBuyerFeatures()) {
        return `<button class="action-btn chat-btn is-disabled" type="button" disabled aria-disabled="true">Admin only</button>`;
      }
      return `<button class="action-btn chat-btn" type="button" data-chat-product="${product.id}">Message</button>`;
    }

    function renderEmojiPicker(scopeId) {
      return `
        <div class="emoji-picker-shell">
          <button class="emoji-toggle-btn" type="button" data-emoji-toggle="${scopeId}" aria-label="Open emoji picker">\u{1F60A}</button>
          ${getChatUiState().openEmojiScope === scopeId ? `
            <div class="emoji-picker-panel" data-emoji-panel="${scopeId}">
              ${chatEmojiChoices.map((emoji) => `
                <button type="button" class="emoji-chip" data-insert-emoji="${emoji}" data-emoji-scope="${scopeId}">${emoji}</button>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }

    function renderRequestBoxButton(product, label = "My Request") {
      const currentUser = getCurrentUser();
      if (product.status !== "approved") {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Unavailable</button>`;
      }
      if (product.uploadedBy === currentUser) {
        return "";
      }
      if (currentUser && typeof canUseBuyerFeatures === "function" && !canUseBuyerFeatures()) {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Admin only</button>`;
      }
      const isAdded = isProductInRequestBox(product.id);
      return `<button class="action-btn action-btn-secondary request-btn${isAdded ? " is-selected" : ""}" type="button" data-request-product="${product.id}">${isAdded ? "\u2713 Added" : label}</button>`;
    }

    function renderProductActionGroup(product, options = {}) {
      const { extraClass = "" } = options;
      const messageButton = renderMessageSellerButton(product);
      const whatsappButton = typeof renderWhatsappChatLink === "function"
        ? renderWhatsappChatLink(product, "WhatsApp")
        : "";
      const repostButton = renderRepostButton(product);
      const actionButtons = [messageButton, repostButton, whatsappButton].filter(Boolean);
      if (!actionButtons.length) {
        return "";
      }
      const actionCount = Math.min(Math.max(actionButtons.length, 1), 3);
      const groupClass = extraClass
        ? `product-actions product-actions-simple product-actions-count-${actionCount} ${extraClass}`
        : `product-actions product-actions-simple product-actions-count-${actionCount}`;

      return `
        <div class="${groupClass}" data-action-count="${actionCount}">
          ${actionButtons.join("")}
        </div>
      `;
    }

    return {
      renderBuyButton,
      renderSellerSoldOutButton,
      getOrderActionButtons,
      getOrderProgressLabel,
      renderProductOverflowMenu,
      renderMessageSellerButton,
      renderEmojiPicker,
      renderRequestBoxButton,
      renderProductActionGroup
    };
  }

  window.WingaModules.products.createProductActionsModule = createProductActionsModule;
})();
