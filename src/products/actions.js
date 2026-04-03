(() => {
  function createProductActionsModule(deps) {
    const {
      getCurrentUser,
      getChatUiState,
      chatEmojiChoices,
      isProductInRequestBox,
      canUseBuyerFeatures,
      getOrderActionState,
      buyerCancelWindowMs
    } = deps;

    function renderBuyButton(product) {
      const currentUser = getCurrentUser();
      if (product?.uploadedBy === currentUser) {
        return "";
      }
      const canOpenDetail = product?.status === "approved";
      if (!canOpenDetail) {
        return `<button class="action-btn buy-btn is-disabled" type="button" disabled aria-disabled="true">Nunua</button>`;
      }

      return `<button class="action-btn buy-btn" type="button" data-open-product="${product.id}">Nunua</button>`;
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
        actions.push(`<button class="action-btn buy-btn" type="button" data-order-action="confirmed" data-order-id="${order.id}">Confirm Order</button>`);
      }

      if (state.canConfirmReceived) {
        actions.push(`<button class="action-btn buy-btn" type="button" data-order-action="delivered" data-order-id="${order.id}">Confirm Received</button>`);
      }

      if (state.canCancel) {
        actions.push(`<button class="action-btn delete-btn" type="button" data-order-action="cancelled" data-order-id="${order.id}">Cancel</button>`);
      }

      return actions.join("");
    }

    function getOrderProgressLabel(order) {
      if (!order) {
        return "";
      }
      if (order.status === "placed" && order.paymentStatus === "pending") {
        return "Payment reference imepokelewa. Order inasubiri payment verification kabla seller hajathibitisha.";
      }
      if (order.status === "paid") {
        return "Payment imethibitishwa. Muuzaji sasa anatakiwa kuthibitisha order na kuandaa kukutumia.";
      }
      if (order.status === "placed") {
        return "Order imewekwa. Inasubiri hatua inayofuata ya verification au uthibitisho.";
      }
      if (order.status === "confirmed") {
        return "Muuzaji amethibitisha order. Mteja anatakiwa kuthibitisha kupokea mzigo ukifika.";
      }
      if (order.status === "delivered") {
        return "Order imekamilika. Mteja anaweza kuacha review ya bidhaa na huduma ya muuzaji.";
      }
      if (order.status === "cancelled") {
        return "Order hii imefutwa. Hakuna hatua nyingine itakayofuata.";
      }
      return "Fuatilia status ya order hapa hadi ikamilike.";
    }

    function renderProductOverflowMenu(product) {
      return `
        <div class="product-menu" data-product-menu="${product.id}">
          <button class="product-menu-toggle" type="button" aria-label="Fungua menu" data-menu-toggle="${product.id}">&#8942;</button>
          <div class="product-menu-popup" data-menu-popup="${product.id}">
            <button class="product-menu-item" type="button" data-menu-action="share" data-id="${product.id}">Share</button>
            <button class="product-menu-item" type="button" data-menu-action="download" data-id="${product.id}">Download</button>
          </div>
        </div>
      `;
    }

    function renderMessageSellerButton(product) {
      const currentUser = getCurrentUser();
      if (product.uploadedBy === currentUser) {
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

    function renderRequestBoxButton(product, label = "Add to My Requests") {
      const currentUser = getCurrentUser();
      if (product.status !== "approved") {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Unavailable</button>`;
      }
      if (product.uploadedBy === currentUser) {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Your Product</button>`;
      }
      if (currentUser && typeof canUseBuyerFeatures === "function" && !canUseBuyerFeatures()) {
        return `<button class="action-btn action-btn-secondary request-btn is-disabled" type="button" disabled aria-disabled="true">Admin only</button>`;
      }
      const isAdded = isProductInRequestBox(product.id);
      return `<button class="action-btn action-btn-secondary request-btn${isAdded ? " is-selected" : ""}" type="button" data-request-product="${product.id}">${isAdded ? "\u2713 Added" : label}</button>`;
    }

    function renderProductActionGroup(product, options = {}) {
      const { requestLabel = "Add to My Requests", extraClass = "" } = options;
      const buyButton = renderBuyButton(product);
      const messageButton = renderMessageSellerButton(product);
      const requestButton = renderRequestBoxButton(product, requestLabel);
      if (!buyButton && !messageButton && !requestButton) {
        return "";
      }
      const groupClass = extraClass ? `product-actions product-actions-simple ${extraClass}` : "product-actions product-actions-simple";
      const primaryActions = [buyButton, messageButton].filter(Boolean).join("");
      const secondaryActions = requestButton ? `<div class="product-actions-secondary">${requestButton}</div>` : "";

      return `
        <div class="${groupClass}">
          ${primaryActions ? `<div class="product-actions-primary">${primaryActions}</div>` : ""}
          ${secondaryActions}
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
