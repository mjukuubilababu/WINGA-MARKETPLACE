(() => {
  function createRequestBoxModule(deps) {
    const state = {
      items: [],
      sellerNotes: {},
      lastSentSummary: null,
      isSending: false
    };

    function getRequestBoxSnapshot() {
      return {
        items: normalizeRequestBoxItems(state.items),
        sellerNotes: state.sellerNotes
      };
    }

    function readRequestBoxSnapshotFromStorage(storage) {
      if (!storage) {
        return null;
      }
      try {
        return JSON.parse(storage.getItem(deps.getRequestBoxStorageKey()) || "null");
      } catch (error) {
        return null;
      }
    }

    function writeRequestBoxSnapshotToStorage(storage, snapshot) {
      if (!storage) {
        return false;
      }
      storage.setItem(deps.getRequestBoxStorageKey(), JSON.stringify(snapshot));
      return true;
    }

    function normalizeRequestItemSnapshot(snapshot = {}, legacyItem = {}) {
      const sellerId = String(snapshot?.sellerId || legacyItem?.sellerId || legacyItem?.uploadedBy || "").trim();
      return {
        productName: String(snapshot?.productName || legacyItem?.productName || legacyItem?.name || "").trim(),
        productImage: String(snapshot?.productImage || legacyItem?.productImage || legacyItem?.image || "").trim(),
        price: snapshot?.price ?? legacyItem?.price ?? null,
        category: String(snapshot?.category || legacyItem?.category || "").trim(),
        sellerId,
        sellerName: String(snapshot?.sellerName || legacyItem?.sellerName || legacyItem?.shop || sellerId || "").trim()
      };
    }

    function createRequestItemSnapshot(product) {
      return normalizeRequestItemSnapshot({
        productName: product?.name || "",
        productImage: product?.image || "",
        price: product?.price ?? null,
        category: product?.category || "",
        sellerId: product?.uploadedBy || "",
        sellerName: deps.getMarketplaceUser?.(product?.uploadedBy || "")?.fullName || product?.shop || product?.uploadedBy || ""
      });
    }

    function normalizeRequestBoxItems(items = []) {
      const seen = new Set();
      return (Array.isArray(items) ? items : [])
        .map((item) => ({
          productId: String(item?.productId || "").trim(),
          quantity: Math.min(99, Math.max(1, Number(item?.quantity || 1) || 1)),
          addedAt: item?.addedAt || new Date().toISOString(),
          snapshot: normalizeRequestItemSnapshot(item?.snapshot || {}, item)
        }))
        .filter((item) => item.productId && !seen.has(item.productId) && seen.add(item.productId));
    }

    function clearSessionState() {
      state.items = [];
      state.sellerNotes = {};
      state.lastSentSummary = null;
      state.isSending = false;
    }

    function loadRequestBoxState() {
      if (!deps.getCurrentUser() || !deps.canUseBuyerFeatures()) {
        clearSessionState();
        return;
      }

      try {
        const raw = readRequestBoxSnapshotFromStorage(localStorage)
          || readRequestBoxSnapshotFromStorage(sessionStorage)
          || {};
        state.items = normalizeRequestBoxItems(raw?.items || []);
        state.sellerNotes = raw?.sellerNotes && typeof raw.sellerNotes === "object" ? raw.sellerNotes : {};
        state.lastSentSummary = null;
      } catch (error) {
        deps.captureError?.("request_box_load_failed", error, {
          user: deps.getCurrentUser()
        });
        clearSessionState();
        try {
          localStorage.removeItem(deps.getRequestBoxStorageKey());
        } catch (storageError) {
          // Ignore storage cleanup failures and continue with empty in-memory state.
        }
      }
    }

    function saveRequestBoxState() {
      if (!deps.getCurrentUser() || !deps.canUseBuyerFeatures()) {
        return;
      }

      const snapshot = getRequestBoxSnapshot();
      try {
        writeRequestBoxSnapshotToStorage(localStorage, snapshot);
        try {
          sessionStorage.removeItem(deps.getRequestBoxStorageKey());
        } catch (storageError) {
          // Ignore non-critical session fallback cleanup failures.
        }
      } catch (error) {
        try {
          deps.cleanupLocalFallbackArtifacts?.();
          writeRequestBoxSnapshotToStorage(localStorage, snapshot);
          try {
            sessionStorage.removeItem(deps.getRequestBoxStorageKey());
          } catch (storageError) {
            // Ignore non-critical session fallback cleanup failures.
          }
          return;
        } catch (retryError) {
          try {
            writeRequestBoxSnapshotToStorage(sessionStorage, snapshot);
          } catch (sessionError) {
            deps.captureError?.("request_box_save_failed", sessionError, {
              user: deps.getCurrentUser()
            });
            return;
          }
          deps.captureError?.("request_box_save_fell_back_to_session_storage", retryError, {
            user: deps.getCurrentUser()
          });
        }
      }
    }

    function getRequestBoxProducts() {
      const itemMap = new Map(normalizeRequestBoxItems(state.items).map((item) => [item.productId, item]));
      if (typeof deps.getProductById === "function") {
        return Array.from(itemMap.values())
          .map((item) => {
            const product = deps.getProductById(item.productId);
            if (product && product.uploadedBy && product.uploadedBy !== deps.getCurrentUser()) {
              return {
                ...item,
                snapshot: createRequestItemSnapshot(product),
                product,
                sellerId: product.uploadedBy
              };
            }
            if (!item.snapshot?.sellerId || item.snapshot.sellerId === deps.getCurrentUser()) {
              return null;
            }
            return {
              ...item,
              product: {
                id: item.productId,
                name: item.snapshot.productName || "Selected product",
                image: item.snapshot.productImage || deps.getImageFallbackDataUri("W"),
                price: item.snapshot.price ?? null,
                category: item.snapshot.category || "",
                uploadedBy: item.snapshot.sellerId,
                shop: item.snapshot.sellerName || item.snapshot.sellerId,
                status: "unknown",
                availability: "unknown"
              },
              sellerId: item.snapshot.sellerId,
              isSnapshotFallback: true
            };
          })
          .filter(Boolean);
      }
      return deps.getProducts()
        .filter((product) => itemMap.has(product.id) && product.uploadedBy && product.uploadedBy !== deps.getCurrentUser())
        .map((product) => ({
          ...itemMap.get(product.id),
          snapshot: createRequestItemSnapshot(product),
          product,
          sellerId: product.uploadedBy
        }))
        .concat(
          Array.from(itemMap.values())
            .filter((item) => !deps.getProducts().some((product) => product.id === item.productId))
            .map((item) => {
              if (!item.snapshot?.sellerId || item.snapshot.sellerId === deps.getCurrentUser()) {
                return null;
              }
              return {
                ...item,
                product: {
                  id: item.productId,
                  name: item.snapshot.productName || "Selected product",
                  image: item.snapshot.productImage || deps.getImageFallbackDataUri("W"),
                  price: item.snapshot.price ?? null,
                  category: item.snapshot.category || "",
                  uploadedBy: item.snapshot.sellerId,
                  shop: item.snapshot.sellerName || item.snapshot.sellerId,
                  status: "unknown",
                  availability: "unknown"
                },
                sellerId: item.snapshot.sellerId,
                isSnapshotFallback: true
              };
            })
            .filter(Boolean)
        );
    }

    function getRequestBoxGroups() {
      const groupMap = new Map();

      getRequestBoxProducts().forEach((entry) => {
        if (!groupMap.has(entry.sellerId)) {
          const seller = deps.getMarketplaceUser(entry.sellerId);
          groupMap.set(entry.sellerId, {
            sellerId: entry.sellerId,
            sellerName: seller?.fullName || entry.product.shop || entry.sellerId,
            note: String(state.sellerNotes[entry.sellerId] || ""),
            items: []
          });
        }

        groupMap.get(entry.sellerId).items.push({
          productId: entry.product.id,
          productName: entry.product.name,
          productImage: entry.product.image || deps.getImageFallbackDataUri("W"),
          price: entry.product.price ?? null,
          sellerId: entry.sellerId,
          category: entry.product.category || "",
          quantity: entry.quantity
        });
      });

      return Array.from(groupMap.values()).map((group) => ({
        ...group,
        totalQuantity: group.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
      }));
    }

    function getRequestBoxItemCount() {
      return normalizeRequestBoxItems(state.items).reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    }

    function isProductInRequestBox(productId) {
      return normalizeRequestBoxItems(state.items).some((item) => item.productId === productId);
    }

    function refreshRequestBoxUI(options = {}) {
      const { reopenProductId = "", keepProfileSection = false } = options;
      saveRequestBoxState();
      if (deps.getCurrentView() === "profile") {
        if (keepProfileSection) {
          deps.setPendingProfileSection("profile-request-box-panel");
        }
        deps.renderProfile();
      } else {
        deps.refreshRequestButtonsUI?.();
      }
      if (reopenProductId && deps.isProductDetailOpen()) {
        deps.openProductDetailModal(reopenProductId);
      }
    }

    function showRequestBoxToast(message, variant = "info", title = "My Requests") {
      deps.showInAppNotification({
        title,
        body: message,
        variant
      });
    }

    function addProductToRequestBox(product, options = {}) {
      const { reopenProductId = "", openProfile = false } = options;

      if (!deps.getCurrentUser()) {
        deps.promptGuestAuth({
          preferredMode: "signup",
          role: "buyer",
          title: "You need a customer account to save requests",
          message: "Sign in or sign up as a mteja to collect products from different sellers.",
          intent: {
            type: "add-request",
            productId: product?.id || ""
          }
        });
        return false;
      }

      if (!deps.canUseBuyerFeatures()) {
        showRequestBoxToast("Akaunti hii haina ruhusa za mteja kutumia Selected Items.", "warning", "Mteja access needed");
        return false;
      }

      if (!product || product.uploadedBy === deps.getCurrentUser()) {
        return false;
      }

      if (!isProductInRequestBox(product.id)) {
        state.items = [
          {
            productId: product.id,
            quantity: 1,
            addedAt: new Date().toISOString(),
            snapshot: createRequestItemSnapshot(product)
          },
          ...normalizeRequestBoxItems(state.items)
        ].slice(0, 40);
      }

      state.lastSentSummary = null;
      saveRequestBoxState();

      if (openProfile) {
        deps.openProfileSection("profile-request-box-panel");
      } else {
        refreshRequestBoxUI({ reopenProductId });
      }

      showRequestBoxToast(`${product.name} added to your requests.`, "success");
      return true;
    }

    function removeProductFromRequestBox(productId, options = {}) {
      const requestItem = normalizeRequestBoxItems(state.items).find((item) => item.productId === productId);
      const product = deps.getProductById ? deps.getProductById(productId) : deps.getProducts().find((item) => item.id === productId);
      state.items = normalizeRequestBoxItems(state.items).filter((item) => item.productId !== productId);
      state.lastSentSummary = null;
      refreshRequestBoxUI(options);
      const productName = product?.name || requestItem?.snapshot?.productName || "Selected product";
      showRequestBoxToast(`${productName} removed from your requests.`, "info");
    }

    function clearRequestBox(options = {}) {
      if (state.items.length && deps.confirmAction && !deps.confirmAction("Una uhakika unataka kuondoa bidhaa zote kwenye My Requests?")) {
        return;
      }
      clearSessionState();
      refreshRequestBoxUI(options);
      if (options?.keepProfileSection) {
        showRequestBoxToast("My Requests zimesafishwa. Unaweza kuanza kuchagua bidhaa tena.", "info", "Requests cleared");
      }
    }

    function updateRequestItemQuantity(productId, quantity, options = {}) {
      state.items = normalizeRequestBoxItems(state.items).map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(99, Math.max(1, Number(quantity || 1) || 1)) }
          : item
      );
      state.lastSentSummary = null;
      refreshRequestBoxUI(options);
    }

    function toggleProductInRequestBox(product, options = {}) {
      if (!product?.id) {
        return false;
      }

      if (isProductInRequestBox(product.id)) {
        removeProductFromRequestBox(product.id, options);
        return false;
      }

      return addProductToRequestBox(product, options);
    }

    function updateRequestSellerNote(sellerId, note) {
      state.sellerNotes = {
        ...state.sellerNotes,
        [sellerId]: String(note || "").slice(0, 240)
      };
      saveRequestBoxState();
    }

    async function sendRequestBoxToSellers() {
      if (state.isSending) {
        deps.reportEvent?.("warn", "request_box_duplicate_send_blocked", "Blocked duplicate request-box send attempt.", {
          user: deps.getCurrentUser()
        });
        return;
      }
      const groups = getRequestBoxGroups();
      if (!groups.length || !deps.getCurrentUser() || !deps.canUseBuyerFeatures()) {
        return;
      }
      state.isSending = true;

      const sentSellerIds = [];
      const sentContexts = [];
      const failures = [];

      try {
        for (const group of groups) {
          const threadName = group.items.length === 1
            ? group.items[0].productName
            : `${group.items.length} selected products`;
          const note = String(group.note || "").trim();
          const defaultMessage = group.items.length === 1
            ? "Habari, naomba maelezo kuhusu bidhaa hii."
            : "Habari, naomba maelezo kuhusu bidhaa nilizochagua hapa.";

          try {
            await deps.sendMessage({
              receiverId: group.sellerId,
              productId: "",
              productName: threadName,
              message: note || defaultMessage,
              messageType: group.items.length > 1 ? "product_inquiry" : "product_reference",
              productItems: group.items.map((item) => ({
                ...item,
                productName: Number(item.quantity || 1) > 1 ? `${item.productName} x${Number(item.quantity || 1)}` : item.productName
              }))
            });
            sentSellerIds.push(group.sellerId);
            sentContexts.push({
              withUser: group.sellerId,
              productId: "",
              productName: threadName
            });
          } catch (error) {
            deps.captureError?.("request_box_group_send_failed", error, {
              sellerId: group.sellerId,
              itemsCount: group.items.length
            });
            failures.push(`${group.sellerName}: ${error.message || "request imeshindikana"}`);
          }
        }

        if (sentSellerIds.length) {
          const sentSellerSet = new Set(sentSellerIds);
          state.items = normalizeRequestBoxItems(state.items).filter((item) => {
            const product = deps.getProductById ? deps.getProductById(item.productId) : deps.getProducts().find((entry) => entry.id === item.productId);
            return !product || !sentSellerSet.has(product.uploadedBy);
          });
          const nextNotes = { ...state.sellerNotes };
          sentSellerIds.forEach((sellerId) => {
            delete nextNotes[sellerId];
          });
          state.sellerNotes = nextNotes;
          state.lastSentSummary = {
            sellersCount: sentSellerIds.length,
            itemsCount: sentContexts.reduce((sum, context) => {
              const matchingGroup = groups.find((group) => group.sellerId === context.withUser);
              return sum + (matchingGroup?.totalQuantity || 0);
            }, 0),
            firstContext: sentContexts[0] || null
          };
          await Promise.all([deps.refreshMessagesState(), deps.refreshNotificationsState()]);
          saveRequestBoxState();
          refreshRequestBoxUI({ keepProfileSection: true });
        }

        if (failures.length) {
          deps.reportEvent?.("warn", "request_box_partial_failure", "Some seller requests failed to send.", {
            failures: failures.length,
            sentSellers: sentSellerIds.length
          });
          showRequestBoxToast(
            `Baadhi ya requests hazikutumwa. ${failures.slice(0, 2).join(" | ")}${failures.length > 2 ? " | ..." : ""}`,
            "warning",
            "Some requests failed"
          );
        }
      } finally {
        state.isSending = false;
      }
    }

    function renderRequestBoxSection() {
      if (!deps.canUseBuyerFeatures()) {
        return null;
      }

      const groups = getRequestBoxGroups();
      const totalItems = getRequestBoxItemCount();
      const section = deps.createElement("section", {
        attributes: { id: "profile-request-box-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "My Requests",
        title: "Selected items to send to sellers",
        meta: `${totalItems} item${totalItems === 1 ? "" : "s"} | ${groups.length} seller${groups.length === 1 ? "" : "s"}`
      }));

      if (state.lastSentSummary) {
        const success = deps.createElement("div", { className: "request-box-success" });
        success.append(
          deps.createElement("strong", { textContent: "Request sent." }),
          deps.createElement("span", {
            textContent: `${state.lastSentSummary.itemsCount} item${state.lastSentSummary.itemsCount === 1 ? "" : "s"} zimeenda kwa ${state.lastSentSummary.sellersCount} seller${state.lastSentSummary.sellersCount === 1 ? "" : "s"}. Sasa endelea na chat au subiri majibu yao.`
          }),
          deps.createElement("button", {
            className: "action-btn buy-btn",
            textContent: "Open request chats",
            attributes: {
              type: "button",
              "data-open-request-messages": "true"
            }
          })
        );
        section.appendChild(success);
      }

      if (!groups.length) {
        section.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna bidhaa kwenye My Requests bado. Tumia Add to My Requests kwenye bidhaa uzikusanye hapa."
        }));
        return section;
      }

      const groupsGrid = deps.createElement("div", { className: "orders-grid request-groups-grid" });
      groups.forEach((group) => {
        const card = deps.createElement("div", { className: "orders-card request-group-card" });
        card.append(
          deps.createElement("strong", { textContent: group.sellerName }),
          deps.createElement("small", {
            textContent: `${group.totalQuantity} selected item${group.totalQuantity === 1 ? "" : "s"}`
          })
        );

        const itemsList = deps.createElement("div", { className: "request-items-list" });
        group.items.forEach((item) => {
          const line = deps.createElement("div", { className: "request-item-line" });
          const image = deps.createElement("img", {
            attributes: {
              src: item.productImage,
              alt: item.productName,
              loading: "lazy"
            }
          });
          image.onerror = function handleRequestImageError() {
            this.onerror = null;
            this.src = deps.getImageFallbackDataUri("W");
          };
          const copy = deps.createElement("div");
          copy.append(
            deps.createElement("span", { textContent: item.productName }),
            deps.createElement("small", {
              textContent: `${deps.getCategoryLabel(item.category)} | ${deps.formatProductPrice(item.price)}`
            })
          );
          const qtyField = deps.createElement("label", { className: "request-qty-field" });
          qtyField.append(
            deps.createElement("span", { textContent: "Qty" }),
            deps.createElement("input", {
              attributes: {
                type: "number",
                min: "1",
                max: "99",
                value: String(Number(item.quantity || 1)),
                "data-request-qty": item.productId
              }
            })
          );
          line.append(
            image,
            copy,
            qtyField,
            deps.createElement("button", {
              className: "action-btn delete-btn",
              textContent: "Remove",
              attributes: {
                type: "button",
                "data-request-remove": item.productId
              }
            })
          );
          itemsList.appendChild(line);
        });
        card.appendChild(itemsList);

        const noteField = deps.createElement("label", { className: "request-note-field" });
        const textarea = deps.createElement("textarea", {
          textContent: group.note || "",
          attributes: {
            rows: "2",
            maxlength: "240",
            placeholder: "Mfano: Naomba kujua availability, size au final price.",
            "data-request-note": group.sellerId
          }
        });
        noteField.append(
          deps.createElement("span", { textContent: "Ujumbe wa mteja" }),
          textarea
        );
        card.appendChild(noteField);
        groupsGrid.appendChild(card);
      });
      section.appendChild(groupsGrid);

      const actions = deps.createElement("div", { className: "request-box-actions" });
      actions.append(
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Clear Selected Items",
          attributes: {
            type: "button",
            "data-request-clear": "true"
          }
        }),
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: state.isSending ? "Sending..." : "Send to Sellers",
          attributes: {
            type: "button",
            "data-request-send": "true",
            ...(state.isSending ? { disabled: "true", "aria-disabled": "true" } : {})
          }
        })
      );
      section.appendChild(actions);
      return section;
    }

    function bindRequestBoxActions(scope = deps.getProfileDiv()) {
      scope?.querySelector("[data-open-request-box]")?.addEventListener("click", () => {
        deps.openProfileSection("profile-request-box-panel");
      });

      scope?.querySelector("[data-open-request-messages]")?.addEventListener("click", async () => {
        if (!state.lastSentSummary?.firstContext) {
          deps.openProfileSection("profile-messages-panel");
          return;
        }

        await deps.openRequestMessagesContext(state.lastSentSummary.firstContext);
      });

      scope?.querySelector("[data-request-clear]")?.addEventListener("click", () => {
        clearRequestBox({ keepProfileSection: true });
      });

      scope?.querySelector("[data-request-send]")?.addEventListener("click", async () => {
        try {
          await sendRequestBoxToSellers();
        } catch (error) {
          deps.captureError?.("request_box_send_failed", error, {
            user: deps.getCurrentUser()
          });
          showRequestBoxToast(error.message || "Imeshindikana kutuma requests.", "error", "Request send failed");
        }
      });

      scope?.querySelectorAll("[data-request-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          removeProductFromRequestBox(button.dataset.requestRemove, { keepProfileSection: true });
        });
      });

      scope?.querySelectorAll("[data-request-qty]").forEach((input) => {
        input.addEventListener("change", () => {
          updateRequestItemQuantity(input.dataset.requestQty, input.value, { keepProfileSection: true });
        });
      });

      scope?.querySelectorAll("[data-request-note]").forEach((input) => {
        input.addEventListener("input", () => {
          updateRequestSellerNote(input.dataset.requestNote, input.value);
        });
      });
    }

    return {
      normalizeRequestBoxItems,
      loadRequestBoxState,
      saveRequestBoxState,
      getRequestBoxProducts,
      getRequestBoxGroups,
      getRequestBoxItemCount,
      isProductInRequestBox,
      refreshRequestBoxUI,
      addProductToRequestBox,
      removeProductFromRequestBox,
      clearRequestBox,
      updateRequestItemQuantity,
      toggleProductInRequestBox,
      updateRequestSellerNote,
      sendRequestBoxToSellers,
      renderRequestBoxSection,
      bindRequestBoxActions,
      clearSessionState,
      getLastSentRequestSummary: () => state.lastSentSummary
    };
  }

  window.WingaModules.requests.createRequestBoxModule = createRequestBoxModule;
})();
