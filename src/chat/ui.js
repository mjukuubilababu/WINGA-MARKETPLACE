(() => {
  function createChatUiModule(deps) {
    const t = (key, fallback, variables = {}) => deps.translate?.(key, variables, fallback) || fallback;
    function conversationName(context) {
      const name = context?.displayName || deps.getUserDisplayName(context?.withUser) || "";
      return /^(?:buyer|user|seller)-\d{10,}/i.test(name)
        ? t("inbox.person", "Winga User") : name || t("inbox.person", "Winga User");
    }

    function conversationTime(value, dateOnly = false) {
      const date = new Date(value);
      if (!value || !Number.isFinite(date.getTime())) return "";
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const locale = document.documentElement.lang || "sw";
      if (date.toDateString() === today.toDateString()) {
        return dateOnly ? t("inbox.today", "Today") : date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      }
      if (date.toDateString() === yesterday.toDateString()) return t("inbox.yesterday", "Yesterday");
      return date.toLocaleDateString(locale, { day: "numeric", month: "short", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
    }

    function renderInboxContext(context, interactive = false) {
      const product = deps.getProductById?.(context?.productId);
      if (!product && !context?.productName) return "";
      const name = product?.name || context.productName;
      const image = product?.image || product?.images?.[0] || "";
      return `<span class="inbox-product-context">
        <span class="inbox-context-thumb">${renderResponsiveImageMarkup({ src: image, alt: "", className: "inbox-context-image", fallbackKey: "W" })}</span>
        <span><strong>${deps.escapeHtml(name)}</strong>${product ? `<small>${deps.escapeHtml(deps.formatProductPrice(product.price))}</small>` : ""}</span>
        ${interactive && product ? `<button type="button" class="action-btn action-btn-secondary" data-chat-open-product="${deps.escapeHtml(product.id)}">${deps.escapeHtml(t("inbox.viewProduct", "View product"))}</button>` : ""}
      </span>`;
    }
    function createElementFromMarkup(markup) {
      return deps.createElementFromMarkup(markup);
    }

    function renderMessagePageControl(kind) {
      const state = deps.getMessagePageState?.();
      if (!state?.enabled) return "";
      const page = state[kind];
      if (!page || (!page.hasMore && !page.error && page.loaded)) return "";
      const label = page.loading ? t("inbox.loading", "Loading...") : page.error ? t("inbox.retry", "Try again") : kind === "inbox" ? t("inbox.loadMore", "Load more conversations") : t("inbox.loadOlder", "Load older messages");
      return `<div class="message-page-control"><button type="button" data-message-page="${kind}"${page.loading ? ' disabled aria-busy="true"' : ""}>${deps.escapeHtml(label)}</button></div>`;
    }

    function renderComposeStatusMarkup(scope = "profile") {
      const status = deps.getChatComposeStatus?.(scope);
      if (!status?.message) {
        return "";
      }
      const tone = String(status.tone || "info").trim() || "info";
      return `<p class="chat-compose-status is-${deps.escapeHtml(tone)}">${deps.escapeHtml(status.message)}</p>`;
    }

    function renderResponsiveImageMarkup({ src = "", alt = "", className = "", fallbackKey = "W" } = {}) {
      return (deps.createProgressiveImage || deps.createResponsiveImage)({
        src,
        alt,
        className,
        ...(/^inbox-/.test(className) ? { sizes: "48px", loading: "lazy", width: 48, height: 48 } : {}),
        fallbackSrc: deps.getImageFallbackDataUri(fallbackKey),
        placeholderSrc: deps.getImageFallbackDataUri(fallbackKey)
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
              <button class="chat-product-chip${isSelected ? " selected" : ""}" type="button" ${selectable ? `data-chat-select-product="${item.productId}"` : `data-chat-open-product="${item.productId}"`}>
                ${renderResponsiveImageMarkup({ src: image, alt: safeProductName, fallbackKey: "W" })}
                <div>
                  <strong>${safeProductName}</strong>
                  <span>${category ? `${deps.getCategoryLabel(category)} | ` : ""}${deps.formatProductPrice(item.price)}</span>
                </div>
              </button>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderConversationOrderCards(orders = []) {
      if (!orders.length) {
        return "";
      }


      return `
        <section class="conversation-commerce-cards" aria-label="${deps.escapeHtml(t("chat.commerceActivity", "Commerce activity"))}">
          ${orders.slice(0, 3).map((order) => {
            const product = order.productId ? deps.getProductById?.(order.productId) : null;
            const productName = order.productName || product?.name || t("chat.orderProduct", "Product");
            const image = deps.sanitizeImageSource(order.productImage || product?.image || "", deps.getImageFallbackDataUri("W"));
            const status = String(order.status || "placed").toLowerCase();
            const paymentStatus = String(order.paymentStatus || "pending").toLowerCase();
            const lifecycle = deps.getOrderLifecycleMeta?.(order) || { label: status, tone: "" };
            const paymentLabel = deps.getPaymentStatusLabel?.(paymentStatus) || paymentStatus;
            const progress = deps.getOrderProgressLabel?.(order) || "";
            const actions = deps.getOrderActionButtons?.(order) || "";
            const items = Array.isArray(order.items) ? order.items.slice(0, 10) : [];
            return `
              <article class="conversation-commerce-card" data-conversation-order="${deps.escapeHtml(order.id || "")}">
                <div class="conversation-commerce-card-head">
                  <span class="conversation-system-label">${deps.escapeHtml(t("chat.wingaSystem", "Winga commerce"))}</span>
                  <small>#${deps.escapeHtml(String(order.id || "").replace(/^order-/, "").slice(-10))}</small>
                </div>
                <div class="conversation-commerce-product">
                  ${renderResponsiveImageMarkup({ src: image, alt: productName, fallbackKey: "W" })}
                  <div>
                    <strong>${deps.escapeHtml(productName)}</strong>
                    <span>${deps.formatProductPrice(order.price)}</span>
                  </div>
                </div>
                ${items.length ? `<ul class="conversation-order-items">${items.map(item => `
                  <li>
                    <span>${deps.escapeHtml(item.productName || "")}</span>
                    <small>${deps.escapeHtml([item.size, item.color].filter(Boolean).join(" / "))}</small>
                    <span>${deps.escapeHtml(t("orders.itemQuantityPrice", "{quantity} x {price}", { quantity: item.quantity, price: deps.formatProductPrice(item.unitPrice) }))}</span>
                  </li>
                `).join("")}</ul>` : ""}
                <div class="conversation-commerce-status" aria-label="${deps.escapeHtml(t("chat.orderCurrentState", "Current order state"))}">
                  <span class="status-pill${lifecycle.tone ? ` ${lifecycle.tone}` : ""}">${deps.escapeHtml(lifecycle.label || status)}</span>
                  <span class="status-pill${paymentStatus === "paid" ? " approved" : ["failed", "cancelled"].includes(paymentStatus) ? " rejected" : ""}">${deps.escapeHtml(paymentLabel)}</span>
                </div>
                ${progress ? `<p>${deps.escapeHtml(progress)}</p>` : ""}
                <div class="conversation-commerce-actions">
                  ${order.productId ? `<button class="action-btn action-btn-secondary" type="button" data-chat-open-product="${deps.escapeHtml(order.productId)}">${deps.escapeHtml(t("chat.viewProduct", "View product"))}</button>` : ""}
                  ${actions}
                </div>
              </article>
            `;
          }).join("")}
        </section>
      `;
    }

    function renderConversationOfferCards(offers = [], context = null) {
      const currentUser = deps.getCurrentUser();
      const currentProduct = context?.productId ? deps.getProductById?.(context.productId) : null;
      const activeStatuses = new Set(["PROPOSED", "COUNTERED"]);
      const hasActiveOffer = offers.some((offer) =>
        offer.productId === context?.productId && activeStatuses.has(String(offer.status || "").toUpperCase())
      );
      const canCreate = Boolean(
        currentProduct
        && context?.withUser
        && currentProduct.uploadedBy === context.withUser
        && currentUser !== context.withUser
        && !hasActiveOffer
      );
      const actionStatus = deps.getOfferActionStatus?.();

      if (!offers.length && !canCreate) {
        return "";
      }

      return `
        <section class="conversation-offers" aria-label="${deps.escapeHtml(t("chat.offers", "Offers"))}">
          ${offers.slice(0, 4).map((offer) => {
            const product = deps.getProductById?.(offer.productId);
            const status = String(offer.status || "").toUpperCase();
            const isActive = activeStatuses.has(status);
            const canRespond = isActive && currentUser && currentUser !== offer.lastActorUsername;
            const canCancel = isActive && currentUser === offer.lastActorUsername;
            const canCheckout = status === "ACCEPTED" && currentUser === offer.buyerUsername && !offer.convertedOrderId;
            const productName = product?.name || t("chat.offerProduct", "Product offer");
            const statusLabel = status.toLowerCase().replace(/_/g, " ");
            return `
              <article class="conversation-offer-card" data-conversation-offer="${deps.escapeHtml(offer.id || "")}">
                <div class="conversation-commerce-card-head">
                  <span class="conversation-system-label">${deps.escapeHtml(t("chat.structuredOffer", "Structured offer"))}</span>
                  <span class="status-pill${status === "ACCEPTED" ? " approved" : ["DECLINED", "EXPIRED", "CANCELLED"].includes(status) ? " rejected" : " pending"}">${deps.escapeHtml(statusLabel)}</span>
                </div>
                <div class="conversation-offer-summary">
                  <strong>${deps.escapeHtml(productName)}</strong>
                  <span>${deps.formatProductPrice(offer.amount)}</span>
                </div>
                ${canRespond ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn buy-btn" type="button" data-offer-action="ACCEPT" data-offer-id="${deps.escapeHtml(offer.id)}">${deps.escapeHtml(t("chat.acceptOffer", "Accept"))}</button>
                    <button class="action-btn action-btn-secondary" type="button" data-offer-counter="${deps.escapeHtml(offer.id)}">${deps.escapeHtml(t("chat.counterOffer", "Counter"))}</button>
                    <button class="action-btn action-btn-secondary" type="button" data-offer-action="DECLINE" data-offer-id="${deps.escapeHtml(offer.id)}">${deps.escapeHtml(t("chat.declineOffer", "Decline"))}</button>
                  </div>
                ` : canCancel ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn action-btn-secondary" type="button" data-offer-action="CANCEL" data-offer-id="${deps.escapeHtml(offer.id)}">${deps.escapeHtml(t("chat.cancelOffer", "Cancel offer"))}</button>
                  </div>
                ` : ""}
                ${canCheckout && product ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn buy-btn" type="button"
                      data-offer-checkout="${deps.escapeHtml(offer.id)}"
                      data-offer-product="${deps.escapeHtml(offer.productId)}"
                      data-offer-price="${deps.escapeHtml(offer.amount)}">${deps.escapeHtml(t("chat.payAgreedAmount", "Pay agreed amount"))}</button>
                  </div>
                ` : ""}
                ${status === "DECLINED" && currentUser === offer.buyerUsername && Number(product?.price) > 0 ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn action-btn-secondary" type="button"
                      data-offer-find-better-price="${deps.escapeHtml(offer.id)}">${deps.escapeHtml(t("chat.findBetterPrice", "Find better price"))}</button>
                  </div>
                ` : ""}
              </article>
            `;
          }).join("")}
          ${canCreate ? `
            <form class="conversation-offer-form" data-offer-create-form="true">
              <input type="hidden" name="productId" value="${deps.escapeHtml(currentProduct.id)}" />
              <label>
                <span>${deps.escapeHtml(t("chat.yourOffer", "Your offer"))}</span>
                <input name="amount" type="number" inputmode="numeric" min="500" step="500" required placeholder="TZS" />
              </label>
              <button class="action-btn action-btn-secondary" type="submit">${deps.escapeHtml(t("chat.makeOffer", "Make offer"))}</button>
            </form>
          ` : ""}
          ${actionStatus?.message ? `<p class="chat-compose-status is-${deps.escapeHtml(actionStatus.tone || "info")}">${deps.escapeHtml(actionStatus.message)}</p>` : ""}
        </section>
      `;
    }

    function renderConversationAvailabilityCards(requests = [], context = null) {
      const currentUser = deps.getCurrentUser();
      const currentProduct = context?.productId ? deps.getProductById?.(context.productId) : null;
      const hasPendingRequest = requests.some((request) =>
        request.productId === context?.productId && String(request.status || "").toUpperCase() === "REQUESTED"
      );
      const canCreate = Boolean(
        currentProduct
        && context?.withUser
        && currentProduct.uploadedBy === context.withUser
        && currentUser !== context.withUser
        && currentProduct.availability !== "sold_out"
        && !hasPendingRequest
      );
      const sellerProducts = deps.getSellerProductsForActiveChat?.(12) || [];
      const actionStatus = deps.getAvailabilityActionStatus?.();
      if (!requests.length && !canCreate) return "";

      return `
        <section class="conversation-availability" aria-label="${deps.escapeHtml(t("chat.availabilityRequests", "Availability requests"))}">
          ${requests.slice(0, 4).map((request) => {
            const product = deps.getProductById?.(request.productId);
            const alternative = request.responseProductId ? deps.getProductById?.(request.responseProductId) : null;
            const status = String(request.status || "").toUpperCase();
            const isPending = status === "REQUESTED";
            const isSeller = currentUser === request.sellerUsername;
            const details = [
              request.requestedSize ? `${t("chat.sizeLabel", "Size")}: ${request.requestedSize}` : "",
              request.requestedColor ? `${t("chat.colorLabel", "Color")}: ${request.requestedColor}` : "",
              `${t("chat.quantityLabel", "Quantity")}: ${request.requestedQuantity || 1}`
            ].filter(Boolean).join(" | ");
            const alternatives = sellerProducts.filter((item) =>
              item.id !== request.productId && item.availability === "available"
            );
            return `
              <article class="conversation-offer-card conversation-availability-card" data-conversation-availability="${deps.escapeHtml(request.id || "")}">
                <div class="conversation-commerce-card-head">
                  <span class="conversation-system-label">${deps.escapeHtml(t("chat.structuredAvailability", "Availability check"))}</span>
                  <span class="status-pill${status === "AVAILABLE" ? " approved" : status === "OUT_OF_STOCK" ? " rejected" : " pending"}">${deps.escapeHtml(status.toLowerCase().replace(/_/g, " "))}</span>
                </div>
                <div class="conversation-offer-summary">
                  <strong>${deps.escapeHtml(product?.name || t("chat.availabilityProduct", "Product availability"))}</strong>
                  <span>${deps.escapeHtml(details)}</span>
                </div>
                ${alternative ? `
                  <button class="conversation-commerce-product" type="button" data-chat-open-product="${deps.escapeHtml(alternative.id)}">
                    ${renderResponsiveImageMarkup({ src: alternative.image, alt: alternative.name, fallbackKey: "W" })}
                    <span><strong>${deps.escapeHtml(alternative.name)}</strong><small>${deps.escapeHtml(t("chat.suggestedAlternative", "Suggested alternative"))}</small></span>
                  </button>
                ` : ""}
                ${isPending && isSeller ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn buy-btn" type="button" data-availability-action="AVAILABLE" data-availability-id="${deps.escapeHtml(request.id)}">${deps.escapeHtml(t("chat.availableAction", "Available"))}</button>
                    <button class="action-btn action-btn-secondary" type="button" data-availability-action="OUT_OF_STOCK" data-availability-id="${deps.escapeHtml(request.id)}">${deps.escapeHtml(t("chat.outOfStockAction", "Out of stock"))}</button>
                  </div>
                  ${alternatives.length ? `
                    <form class="conversation-availability-alternative" data-availability-alternative-form="true">
                      <input type="hidden" name="requestId" value="${deps.escapeHtml(request.id)}" />
                      <label>
                        <span>${deps.escapeHtml(t("chat.alternativeProduct", "Alternative product"))}</span>
                        <select name="responseProductId" required>
                          <option value="">${deps.escapeHtml(t("chat.chooseAlternative", "Choose product"))}</option>
                          ${alternatives.map((item) => `<option value="${deps.escapeHtml(item.id)}">${deps.escapeHtml(item.name)}</option>`).join("")}
                        </select>
                      </label>
                      <button class="action-btn action-btn-secondary" type="submit">${deps.escapeHtml(t("chat.suggestAlternative", "Suggest alternative"))}</button>
                    </form>
                  ` : ""}
                ` : isPending && currentUser === request.buyerUsername ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn action-btn-secondary" type="button" data-availability-action="CANCEL" data-availability-id="${deps.escapeHtml(request.id)}">${deps.escapeHtml(t("chat.cancelAvailability", "Cancel request"))}</button>
                  </div>
                ` : status === "OUT_OF_STOCK" && currentUser === request.buyerUsername ? `
                  <div class="conversation-commerce-actions">
                    <button class="action-btn buy-btn" type="button"
                      data-availability-find-alternative="${deps.escapeHtml([
                        product?.name || "",
                        request.requestedSize || "",
                        request.requestedColor || ""
                      ].filter(Boolean).join(" "))}">${deps.escapeHtml(t("chat.findAnotherSeller", "Find another seller"))}</button>
                  </div>
                ` : ""}
              </article>
            `;
          }).join("")}
          ${canCreate ? `
            <form class="conversation-availability-form" data-availability-create-form="true">
              <input type="hidden" name="productId" value="${deps.escapeHtml(currentProduct.id)}" />
              <label><span>${deps.escapeHtml(t("chat.sizeOptional", "Size (optional)"))}</span><input name="size" maxlength="40" autocomplete="off" /></label>
              <label><span>${deps.escapeHtml(t("chat.colorOptional", "Color (optional)"))}</span><input name="color" maxlength="40" autocomplete="off" /></label>
              <label><span>${deps.escapeHtml(t("chat.quantityLabel", "Quantity"))}</span><input name="quantity" type="number" inputmode="numeric" min="1" max="99" value="1" required /></label>
              <button class="action-btn action-btn-secondary" type="submit">${deps.escapeHtml(t("chat.askAvailability", "Ask availability"))}</button>
            </form>
          ` : ""}
          ${actionStatus?.message ? `<p class="chat-compose-status is-${deps.escapeHtml(actionStatus.tone || "info")}">${deps.escapeHtml(actionStatus.message)}</p>` : ""}
        </section>
      `;
    }

    function renderConversationCommerceGoal(goal = null) {
      if (!goal?.goalId) return "";
      const actionStatus = deps.getCommerceGoalActionStatus?.();
      const product = goal.productId ? deps.getProductById?.(goal.productId) : null;
      const title = goal.productName || product?.name || goal.queryKey || t("chat.shoppingGoal", "Shopping request");
      const details = [
        goal.size ? `${t("chat.sizeLabel", "Size")}: ${goal.size}` : "",
        goal.color ? `${t("chat.colorLabel", "Color")}: ${goal.color}` : "",
        goal.region ? goal.region : ""
      ].filter(Boolean).join(" | ");
      const matchingProducts = Math.max(0, Number(goal.matchingProducts || 0));
      return `
        <section class="conversation-commerce-goal" aria-label="${deps.escapeHtml(t("chat.stillLookingFor", "Still looking for"))}">
          <article class="conversation-offer-card conversation-goal-card" data-conversation-goal="${deps.escapeHtml(goal.goalId)}">
            <div class="conversation-commerce-card-head">
              <span class="conversation-system-label">${deps.escapeHtml(t("chat.stillLookingFor", "Still looking for"))}</span>
              <span class="status-pill pending">${deps.escapeHtml(String(goal.status || "looking").replace(/_/g, " "))}</span>
            </div>
            <div class="conversation-offer-summary">
              <strong>${deps.escapeHtml(title)}</strong>
              ${details ? `<span>${deps.escapeHtml(details)}</span>` : ""}
              <span>${deps.escapeHtml(t("chat.matchesFound", "{count} matching products", { count: matchingProducts }))}</span>
            </div>
            <div class="conversation-commerce-actions">
              ${goal.productId ? `<button class="action-btn action-btn-secondary" type="button" data-chat-open-product="${deps.escapeHtml(goal.productId)}">${deps.escapeHtml(t("chat.viewProduct", "View product"))}</button>` : ""}
              <button class="action-btn buy-btn" type="button" data-commerce-goal-resolve="found" data-commerce-goal-id="${deps.escapeHtml(goal.goalId)}">${deps.escapeHtml(t("chat.foundIt", "Found it"))}</button>
              <button class="action-btn action-btn-secondary" type="button" data-commerce-goal-resolve="stopped" data-commerce-goal-id="${deps.escapeHtml(goal.goalId)}">${deps.escapeHtml(t("chat.stopSearch", "Stop search"))}</button>
            </div>
            ${actionStatus?.message ? `<p class="chat-compose-status is-${deps.escapeHtml(actionStatus.tone || "info")}">${deps.escapeHtml(actionStatus.message)}</p>` : ""}
          </article>
        </section>
      `;
    }

    function renderAssistantProductFinder() {
      const state = deps.getAssistantSearchState?.() || {};
      const query = String(state.query || "");
      const results = Array.isArray(state.results) ? state.results : [];
      const status = String(state.status || "idle");
      const message = String(state.message || "");
      return `
        <section class="conversation-assistant-search" aria-label="${deps.escapeHtml(t("chat.productFinder", "Winga product finder"))}">
          <div class="conversation-assistant-head">
            <span class="conversation-system-label">${deps.escapeHtml(t("chat.wingaAssistant", "Winga Assistant"))}</span>
            <strong>${deps.escapeHtml(t("chat.productFinder", "Find a product"))}</strong>
          </div>
          <form class="conversation-assistant-search-form" data-assistant-search-form="true">
            <label for="conversation-assistant-query">${deps.escapeHtml(t("chat.whatAreYouLookingFor", "What are you looking for?"))}</label>
            <div>
              <input id="conversation-assistant-query" name="query" value="${deps.escapeHtml(query)}" maxlength="120" autocomplete="off" placeholder="${deps.escapeHtml(t("chat.searchExample", "Example: black suit size L"))}" />
              <button class="action-btn buy-btn" type="submit"${status === "loading" ? " disabled" : ""}>${deps.escapeHtml(status === "loading" ? t("chat.searching", "Searching...") : t("chat.search", "Search"))}</button>
            </div>
          </form>
          ${message ? `<p class="chat-compose-status is-${status === "error" ? "error" : "info"}">${deps.escapeHtml(message)}</p>` : ""}
          ${results.length ? `
            <div class="conversation-assistant-results">
              ${results.slice(0, 4).map((product) => `
                <article class="conversation-assistant-product">
                  ${renderResponsiveImageMarkup({ src: product.image, alt: product.name || t("chat.productResult", "Product result"), fallbackKey: "W" })}
                  <div>
                    <strong>${deps.escapeHtml(product.name || t("chat.productResult", "Product result"))}</strong>
                    <span>${deps.escapeHtml(deps.formatProductPrice(product.price))}</span>
                    <small>${deps.escapeHtml(product.shop || deps.getUserDisplayName?.(product.uploadedBy) || "")}</small>
                    <button class="action-btn action-btn-secondary" type="button" data-assistant-ask-seller="${deps.escapeHtml(product.id || "")}">${deps.escapeHtml(t("chat.askSeller", "Ask seller"))}</button>
                  </div>
                </article>
              `).join("")}
            </div>
          ` : ""}
        </section>
      `;
    }

    function renderConversationMessagesMarkup(activeMessages, options = {}) {
      const { enableActions = false } = options;
      let pending = [];
      try { pending = deps.getPendingMessages?.(deps.getActiveChatContext?.()?.withUser) || []; }
      catch (_error) { /* Optional local queue must not hide canonical history. */ }
      const pendingMarkup = pending.map(item => `
        <div class="message-bubble outgoing">
          <p>${deps.escapeHtml(item.payload?.message || item.payload?.productName || "")}</p>
          <small>${deps.escapeHtml(item.status === "FAILED" ? t("chat.failedTitle", "Message failed") : t("chat.queueRetained", "Unsent messages remain saved on this device."))}</small>
          <button type="button" data-message-retry="${deps.escapeHtml(item.id)}">${deps.escapeHtml(t("inbox.retry", "Try again"))}</button>
        </div>`).join("");
      if (!activeMessages.length && !pending.length) {
        return `<p class="empty-copy">Anza mazungumzo kuhusu bidhaa hii hapa chini.</p>`;
      }

      let previousDay = "";
      return activeMessages.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || String(a.id).localeCompare(String(b.id))).map((message) => {
        const day = conversationTime(message.timestamp, true);
        const separator = day !== previousDay ? `<div class="message-date-separator">${deps.escapeHtml(day)}</div>` : "";
        previousDay = day;
        const productItems = deps.getMessageProductItems(message);
        const replyMessage = deps.getReplyPreviewMessage(message, activeMessages);
        const canDelete = message.senderId === deps.getCurrentUser();
        const hasDownload = productItems.some((item) => item.productImage);
        const safeReplyText = replyMessage ? deps.escapeHtml(deps.getMessagePreviewText(replyMessage)) : "";
        const safeMessageText = message.message ? deps.escapeHtml(message.message) : "";
        return `
          ${separator}
          <div class="message-bubble ${message.senderId === deps.getCurrentUser() ? "outgoing" : "incoming"}${productItems.length ? " message-bubble-product" : ""}" data-message-bubble-id="${message.id}">
            ${replyMessage ? `<div class="message-reply-preview"><strong>Reply</strong><span>${safeReplyText}</span></div>` : ""}
            ${productItems.length ? renderChatProductPreviewItems(productItems) : ""}
            ${message.message ? `<p>${safeMessageText}</p>` : ""}
            <small>${deps.escapeHtml(new Date(message.timestamp).toLocaleTimeString(document.documentElement.lang || "sw", { hour: "2-digit", minute: "2-digit" }))} ${message.senderId === deps.getCurrentUser() ? `| ${deps.escapeHtml(message.isRead ? t("inbox.read", "Read") : t("inbox.sent", "Sent"))}` : ""}</small>
            ${enableActions ? `
              <button class="message-menu-trigger" type="button" data-message-menu-toggle="${message.id}">...</button>
              ${deps.getOpenChatMessageMenuId() === message.id ? `
                <div class="message-action-menu">
                  <button type="button" data-message-reply="${message.id}">Reply</button>
                  <button type="button" data-message-share="${message.id}">Forward</button>
                  ${hasDownload ? `<button type="button" data-message-download="${message.id}">Download image</button>` : ""}
                  ${canDelete ? `<button type="button" data-message-delete="${message.id}">Delete</button>` : ""}
                </div>
              ` : ""}
            ` : ""}
          </div>
        `;
      }).join("") + pendingMarkup;
    }

    function renderNotificationsSection() {
      const currentNotifications = Array.isArray(deps.getRenderableNotifications?.())
        ? deps.getRenderableNotifications()
        : Array.isArray(deps.getCurrentNotifications?.())
          ? deps.getCurrentNotifications()
          : [];
      const items = currentNotifications
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
      const profileFilter = deps.getProfileMessagesFilter?.() || "all";
      const summaries = deps.getConversationSummariesFiltered
        ? deps.getConversationSummariesFiltered(profileFilter)
        : deps.getConversationSummaries();
      const activeMessages = Array.isArray(deps.getActiveConversationMessages?.())
        ? deps.getActiveConversationMessages()
        : [];
      const activeChatContext = deps.getActiveChatContext();
      const activeCommerce = deps.getConversationCommerceSnapshot
        ? deps.getConversationCommerceSnapshot(activeChatContext)
        : null;
      const activeOrders = deps.getConversationOrders
        ? deps.getConversationOrders(activeChatContext)
        : [];
      const activeOffers = deps.getConversationOffers
        ? deps.getConversationOffers(activeChatContext)
        : [];
      const activeAvailabilityRequests = deps.getConversationAvailabilityRequests
        ? deps.getConversationAvailabilityRequests(activeChatContext)
        : [];
      const activeCommerceGoal = deps.getConversationCommerceGoal
        ? deps.getConversationCommerceGoal(activeChatContext)
        : null;
      const activeRelationshipMemory = deps.getConversationRelationshipMemory
        ? deps.getConversationRelationshipMemory(activeChatContext)
        : null;
      const currentMessageDraft = deps.getCurrentMessageDraft();
      const contactState = deps.getChatContactState?.(activeChatContext) || {
        whatsapp: "",
        phoneVisible: false,
        canSharePhone: false,
        note: ""
      };
      const activeWhatsApp = contactState.whatsapp;
      const profileMessagesMode = deps.getProfileMessagesMode?.() || "list";
      const showConversationList = profileMessagesMode !== "detail";
      const showConversationDetail = profileMessagesMode === "detail";
      const panelTitle = t("nav.inbox", "Inbox");
      const panelSubtitle = t("inbox.subtitle", "Your conversations");
      const lastActiveLabel = conversationTime(activeMessages[activeMessages.length - 1]?.timestamp);

      return `
        <section id="profile-messages-panel" class="modern-inbox">
          <div class="section-heading">
            <div>
              <p class="eyebrow">${panelTitle}</p>
              <h3>${panelSubtitle}</h3>
            </div>
            <div class="messages-panel-actions">
              ${showConversationList ? `<button class="message-panel-close message-list-profile-back" type="button" data-close-profile-messages="true" aria-label="${deps.escapeHtml(t("inbox.back", "Back"))}">←</button>` : ""}
              <span class="meta-copy">${deps.escapeHtml(t("inbox.count", "{count} conversations", { count: summaries.length }))}</span>
            </div>
          </div>
          <div class="messages-shell ${showConversationDetail ? "compact-detail" : ""}">
            ${showConversationList ? `
            <div class="messages-list">
              <div class="inbox-filters" role="group" aria-label="${deps.escapeHtml(t("inbox.filters", "Conversation filters"))}">
                <button type="button" data-inbox-filter="all" aria-pressed="${profileFilter === "all"}">${deps.escapeHtml(t("inbox.all", "All"))}</button>
                <button type="button" data-inbox-filter="unread" aria-pressed="${profileFilter === "unread"}">${deps.escapeHtml(t("profile.unreadStat", "Unread"))}</button>
              </div>
              <input type="search" class="inbox-search" data-inbox-search aria-label="${deps.escapeHtml(t("inbox.search", "Search conversations"))}" placeholder="${deps.escapeHtml(t("inbox.search", "Search conversations"))}" />
              <details class="inbox-product-finder"${deps.getAssistantSearchState?.()?.query ? " open" : ""}>
                <summary>${deps.escapeHtml(t("chat.productFinder", "Find a product"))}</summary>
                ${renderAssistantProductFinder()}
              </details>
              ${summaries.length ? summaries.map((summary) => `
                <button class="message-thread-item ${summary.unreadCount ? "is-unread" : ""} ${activeChatContext && summary.key === deps.getChatContextKey(activeChatContext) ? "active" : ""}" type="button" data-conversation-user="${deps.escapeHtml(summary.withUser)}" data-conversation-product="${deps.escapeHtml(summary.productId)}" data-conversation-name="${deps.escapeHtml(summary.productName)}">
                  <span class="message-thread-avatar">
                    ${(() => {
                      const partner = deps.getMarketplaceUser?.(summary.withUser);
                      const avatar = deps.sanitizeImageSource?.(partner?.profileImage || "", "");
                      return avatar
                        ? renderResponsiveImageMarkup({ src: avatar, alt: "", className: "inbox-avatar-image", fallbackKey: conversationName(summary).slice(0, 1) })
                        : `<span>${deps.escapeHtml(conversationName(summary).slice(0, 1))}</span>`;
                    })()}
                  </span>
                  <span class="message-thread-meta">
                    <span class="inbox-row-heading"><strong>${deps.escapeHtml(conversationName(summary))}</strong><time>${deps.escapeHtml(conversationTime(summary.timestamp))}</time></span>
                    <small class="inbox-preview">${deps.escapeHtml(summary.latestMessage || "")}</small>
                    ${renderInboxContext(summary)}
                    ${summary.unreadCount ? `<span class="thread-badge" aria-label="${deps.escapeHtml(t("inbox.unreadCount", "{count} unread", { count: summary.unreadCount }))}">${summary.unreadCount}</span>` : ""}
                  </span>
                </button>
              `).join("") : `<p class="empty-copy">${deps.escapeHtml(profileFilter === "unread" ? t("inbox.caughtUp", "You're all caught up.") : t("inbox.empty", "Your conversations will appear here."))}</p>`}
              <p class="empty-copy" data-inbox-no-results hidden>${deps.escapeHtml(t("inbox.noResults", "No conversations found."))}</p>
              ${renderMessagePageControl("inbox")}
            </div>
            ` : ""}
            ${showConversationDetail ? `
            <div class="messages-thread-card">
              ${activeChatContext ? `
                <div class="messages-thread-head">
                  <button class="message-list-back" type="button" data-message-list-back="true" aria-label="${deps.escapeHtml(t("inbox.back", "Back"))}">←</button>
                  <span class="message-thread-avatar">${renderResponsiveImageMarkup({ src: deps.getMarketplaceUser?.(activeChatContext.withUser)?.profileImage || "", alt: "", className: "inbox-avatar-image", fallbackKey: conversationName(activeChatContext).slice(0, 1) })}</span>
                  <div>
                    <strong>${deps.escapeHtml(conversationName(activeChatContext))}</strong>
                    <p>${deps.escapeHtml(activeChatContext.productName || "General inquiry")}</p>
                    ${activeCommerce?.label ? `<span class="message-thread-stage"><span class="status-pill${activeCommerce.tone ? ` ${activeCommerce.tone}` : ""}">${deps.escapeHtml(activeCommerce.label)}</span></span>` : ""}
                    ${activeRelationshipMemory?.label ? `<span class="message-thread-stage"><span class="status-pill${activeRelationshipMemory.tone ? ` ${activeRelationshipMemory.tone}` : ""}">${deps.escapeHtml(activeRelationshipMemory.label)}</span></span>` : ""}
                    ${activeRelationshipMemory?.detail ? `<small class="thread-relationship-copy">${deps.escapeHtml(activeRelationshipMemory.detail)}</small>` : ""}
                    <small class="thread-presence">${lastActiveLabel}</small>
                  </div>
                  <details class="inbox-conversation-menu"><summary aria-label="${deps.escapeHtml(t("inbox.actions", "Conversation actions"))}" title="${deps.escapeHtml(t("inbox.actions", "Conversation actions"))}">⋮</summary><div class="messages-thread-actions">
                    <button class="action-btn edit-btn" type="button" data-refresh-messages="true">Refresh</button>
                    ${activeCommerce?.productId ? `<button class="action-btn action-btn-secondary" type="button" data-chat-open-product="${activeCommerce.productId}">Open product</button>` : ""}
                    ${activeCommerce?.productId ? `<button class="action-btn action-btn-secondary chat-pay-pill" type="button" data-chat-buy-product="${activeCommerce.productId}">Lipa</button>` : ""}
                    ${activeChatContext?.withUser ? `<button class="action-btn action-btn-secondary" type="button" data-report-seller="${activeChatContext.withUser}" data-report-product-context="${activeCommerce?.productId || activeChatContext.productId || ""}">Report seller</button>` : ""}
                    ${contactState.canSharePhone ? `<button class="action-btn action-btn-secondary" type="button" data-share-my-phone="true">Share my phone</button>` : ""}
                    ${activeWhatsApp ? `<a class="button" href="${deps.buildWhatsappHref(activeWhatsApp, activeChatContext.productName)}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>` : ""}
                  </div></details>
                </div>
                ${renderInboxContext(activeChatContext, true)}
                <p class="thread-safety-note">Lipa tu kwa details za seller zilizo ndani ya Winga, kisha tuma reference hapa. Ukiona tabia ya kutia shaka, report seller moja kwa moja.</p>
                ${contactState.note ? `<p class="thread-contact-note">${deps.escapeHtml(contactState.note)}</p>` : ""}
                ${renderConversationOrderCards(activeOrders)}
                ${renderConversationOfferCards(activeOffers, activeChatContext)}
                ${renderConversationAvailabilityCards(activeAvailabilityRequests, activeChatContext)}
                ${renderConversationCommerceGoal(activeCommerceGoal)}
                <div class="messages-thread-body">
                  ${renderMessagePageControl("history")}
                  ${renderConversationMessagesMarkup(activeMessages, { enableActions: true })}
                </div>
                <form id="message-compose-form" class="messages-compose">
                  <textarea id="message-compose-input" rows="2" maxlength="1000" placeholder="${deps.escapeHtml(t("inbox.compose", "Write a message"))}">${deps.escapeHtml(currentMessageDraft)}</textarea>
                  ${renderComposeStatusMarkup("profile")}
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
          textContent: "\u00D7", // i18n-gate: allow -- internal diagnostic or language-neutral display
          attributes: {
            type: "button",
            "aria-label": t("chat.closeAria", "Close chat"),
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
      const activeOrders = deps.getConversationOrders?.(activeChatContext) || [];
      const currentMessageDraft = deps.getCurrentMessageDraft();
      const product = deps.getActiveChatProduct();
      const seller = product ? deps.getMarketplaceUser(product.uploadedBy) : null;
      const activeMessages = deps.getActiveConversationMessages();
      const activeOffers = deps.getConversationOffers?.(activeChatContext) || [];
      const activeAvailabilityRequests = deps.getConversationAvailabilityRequests?.(activeChatContext) || [];
      const activeCommerceGoal = deps.getConversationCommerceGoal?.(activeChatContext) || null;
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
      const safeSellerName = deps.escapeHtml(conversationName({ ...activeChatContext, displayName: sellerName }));
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
            ${renderMessagePageControl("history")}
            ${renderConversationMessagesMarkup(activeMessages, { enableActions: true })}
          </div>
          <div class="context-chat-actions">
            ${activeChatContext?.withUser ? `<button class="action-btn action-btn-secondary" type="button" data-report-seller="${activeChatContext.withUser}" data-report-product-context="${activeChatContext.productId || ""}">Report seller</button>` : ""}
            ${contactState.canSharePhone ? `<button class="action-btn action-btn-secondary" type="button" data-share-my-phone="true">Share my phone</button>` : ""}
            ${activeWhatsApp ? `<a class="button whatsapp-chat-btn" href="${deps.buildWhatsappHref(activeWhatsApp, productName)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
          </div>
          <p class="thread-safety-note context-chat-note">Tumia Winga payment details na report seller kama kuna pressure ya kulipa nje ya flow hii.</p>
          ${contactState.note ? `<p class="thread-contact-note context-chat-note">${deps.escapeHtml(contactState.note)}</p>` : ""}
          ${renderConversationOrderCards(activeOrders)}
          ${renderConversationOfferCards(activeOffers, activeChatContext)}
          ${renderConversationAvailabilityCards(activeAvailabilityRequests, activeChatContext)}
          ${renderConversationCommerceGoal(activeCommerceGoal)}
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
            ${renderComposeStatusMarkup("context")}
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
