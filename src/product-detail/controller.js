(() => {
  function createProductDetailControllerModule(deps) {
    let detailNavState = {
      rootScrollY: 0,
      rootProductId: "",
      activeProductId: "",
      detailDepth: 0,
      productTrail: []
    };

    let isSyncingHistoryState = false;
    let pendingHomeNavigation = false;

    function isDetailHistoryState(state) {
      return Boolean(state?.wingaProductDetail && state?.productId);
    }

    function buildDetailHistoryState(productId, sourceProductId = "") {
      return {
        ...(window.history.state && typeof window.history.state === "object" ? window.history.state : {}),
        wingaProductDetail: true,
        productId,
        sourceProductId: sourceProductId || detailNavState.rootProductId || productId,
        detailDepth: Math.max(1, Number(detailNavState.detailDepth || detailNavState.productTrail.length || 1))
      };
    }

    function syncHistoryForDetail(productId, sourceProductId = "") {
      if (isSyncingHistoryState || !window.history?.pushState) {
        return;
      }
      window.history.pushState(buildDetailHistoryState(productId, sourceProductId), "", window.location.href);
    }

    function syncHistoryForClose() {
      if (!window.history?.state || !isDetailHistoryState(window.history.state)) {
        return false;
      }
      isSyncingHistoryState = true;
      window.history.back();
      window.setTimeout(() => {
        isSyncingHistoryState = false;
      }, 0);
      return true;
    }

    function getSellerOtherProducts(product, limit = 6) {
      if (!product?.uploadedBy) {
        return [];
      }
      return deps.getProducts().filter((item) =>
        item.id !== product.id
        && item.uploadedBy === product.uploadedBy
        && item.status === "approved"
        && item.availability !== "sold_out"
      ).slice(0, limit);
    }

    function getFloatingHomeVariant(product) {
      const signature = typeof product?.imageSignature === "string" ? product.imageSignature.trim() : "";
      if (!signature) {
        return "dark";
      }
      const lightPixels = signature.split("").reduce((count, bit) => count + (bit === "1" ? 1 : 0), 0);
      return lightPixels / Math.max(signature.length, 1) >= 0.52 ? "dark" : "light";
    }

    function finalizeHomeNavigation() {
      closeProductDetailModal({
        skipHistoryBack: true,
        skipContextRestore: true
      });
      deps.resetHomeBrowseState?.();
      deps.setCurrentViewState?.("home");
      deps.renderCurrentView?.();
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function goHomeFromProductDetail() {
      const historyDepth = Math.max(1, Number(detailNavState.detailDepth || detailNavState.productTrail.length || 1));
      if (isDetailHistoryState(window.history.state) && window.history?.go) {
        pendingHomeNavigation = true;
        isSyncingHistoryState = true;
        window.history.go(-historyDepth);
        window.setTimeout(() => {
          isSyncingHistoryState = false;
        }, 0);
        return;
      }
      finalizeHomeNavigation();
    }

    function closeProductDetailModal(options = {}) {
      const {
        skipHistoryBack = false,
        skipContextRestore = false
      } = options;
      if (!skipHistoryBack && syncHistoryForClose()) {
        return;
      }
      const modal = document.getElementById("product-detail-modal");
      if (!modal) {
        return;
      }
      modal.style.display = "none";
      document.body.classList.remove("product-detail-open");
      deps.syncBodyScrollLockState?.();
      deps.resetProductDiscoveryTrail();
      deps.resetReviewDraft();
      if (!skipContextRestore) {
        window.scrollTo({ top: detailNavState.rootScrollY || 0, behavior: "auto" });
      }
      if (!skipContextRestore && detailNavState.rootProductId) {
        window.setTimeout(() => {
          deps.scrollToProductCard?.(detailNavState.rootProductId);
        }, 40);
      }
      detailNavState = {
        rootScrollY: 0,
        rootProductId: "",
        activeProductId: "",
        detailDepth: 0,
        productTrail: []
      };
      deps.syncAppShellHistoryState?.({ force: true });
    }

    function bindProductDetailActions(modal, product) {
      modal.querySelectorAll("[data-close-product-detail]").forEach((button) => {
        button.addEventListener("click", closeProductDetailModal);
      });

      modal.querySelectorAll("[data-product-detail-home]").forEach((button) => {
        button.addEventListener("click", goHomeFromProductDetail);
      });

      modal.querySelectorAll("[data-detail-buy]").forEach((button) => {
        button.addEventListener("click", () => deps.beginPurchaseFlow(product));
      });

      modal.querySelectorAll("[data-detail-repost]").forEach((button) => {
        button.addEventListener("click", () => deps.repostProductAsSeller(product));
      });

      modal.querySelectorAll("[data-chat-product]").forEach((button) => {
        button.addEventListener("click", () => deps.openProductChat(product));
      });

      modal.querySelectorAll("[data-request-product]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const targetProduct = (deps.getProductById ? deps.getProductById(button.dataset.requestProduct) : deps.getProducts().find((item) => item.id === button.dataset.requestProduct)) || product;
          deps.toggleProductInRequestBox(targetProduct, { reopenProductId: product.id });
        });
      });

      modal.querySelectorAll("[data-review-rating]").forEach((button) => {
        button.addEventListener("click", () => {
          const draft = deps.getProductDetailReviewDraft(product.id);
          draft.rating = Number(button.dataset.reviewRating || 5);
          openProductDetailModal(product.id, {
            skipHistoryPush: true
          });
        });
      });

      modal.querySelector(`[data-review-comment="${product.id}"]`)?.addEventListener("input", (event) => {
        const draft = deps.getProductDetailReviewDraft(product.id);
        draft.comment = event.target.value || "";
      });

      modal.querySelector(`[data-product-review-form="${product.id}"]`)?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const draft = deps.getProductDetailReviewDraft(product.id);
        if (!draft.comment || draft.comment.trim().length < 3) {
          deps.showInAppNotification?.({
            title: "Review needed",
            body: "Review inahitaji maoni mafupi yenye maana.",
            variant: "warning"
          });
          return;
        }

        try {
          await deps.dataLayer.createReview({
            productId: product.id,
            sellerId: product.uploadedBy,
            rating: Number(draft.rating || 5),
            comment: draft.comment.trim()
          });
          const reviewPayload = await deps.dataLayer.loadReviews();
          deps.setCurrentReviews(Array.isArray(reviewPayload?.reviews) ? reviewPayload.reviews : []);
          deps.setReviewSummaries(reviewPayload?.summaries || {});
          deps.resetReviewDraft();
          deps.reportEvent?.("info", "review_created", "Buyer submitted a review.", {
            productId: product.id,
            rating: Number(draft.rating || 5)
          });
          deps.showInAppNotification?.({
            title: "Review sent",
            body: "Asante. Review yako imeongezwa kwenye bidhaa hii.",
            variant: "success"
          });
          openProductDetailModal(product.id, {
            skipHistoryPush: true
          });
        } catch (error) {
          deps.captureError?.("review_create_failed", error, {
            productId: product.id
          });
          deps.showInAppNotification?.({
            title: "Review failed",
            body: error.message || "Imeshindikana kutuma review.",
            variant: "error"
          });
        }
      });

      modal.querySelectorAll("[data-open-own-messages]").forEach((button) => {
        button.addEventListener("click", () => {
          closeProductDetailModal();
          deps.openOwnProductMessages(button.dataset.openOwnMessages);
        });
      });

      modal.querySelectorAll("[data-open-product]").forEach((card) => {
        card.addEventListener("click", (event) => {
          if (event.target.closest("[data-request-product]")) {
            return;
          }
          openProductDetailModal(card.dataset.openProduct, {
            sourceProductId: product.id
          });
        });
      });
    }

    function openProductDetailModal(productId, options = {}) {
      const product = deps.getProductById ? deps.getProductById(productId) : deps.getProducts().find((item) => item.id === productId);
      if (!product) {
        return;
      }

      const {
        skipHistoryPush = false,
        sourceProductId = productId,
        restoreDetailScrollTop = 0,
        fromHistoryNavigation = false,
        historyDepth = 0
      } = options;

      deps.noteProductInterest(product.id);
      deps.noteProductDiscovery(product.id);

      const modal = deps.ensureProductDetailModal();
      const isAlreadyOpen = document.body.classList.contains("product-detail-open") && modal.style.display !== "none";
      const previousActiveProductId = detailNavState.activeProductId;
      if (!isAlreadyOpen) {
        deps.syncAppShellHistoryState?.({ force: true });
        detailNavState = {
          rootScrollY: window.scrollY || window.pageYOffset || 0,
          rootProductId: sourceProductId || productId,
          activeProductId: product.id,
          detailDepth: 1,
          productTrail: [product.id]
        };
      } else if (!fromHistoryNavigation && detailNavState.rootProductId) {
        detailNavState.rootProductId = detailNavState.rootProductId || sourceProductId || productId;
        if (previousActiveProductId !== product.id) {
          detailNavState.productTrail = [...detailNavState.productTrail, product.id];
          detailNavState.detailDepth = detailNavState.productTrail.length;
        }
      } else if (fromHistoryNavigation) {
        const nextTrail = Array.isArray(detailNavState.productTrail) && detailNavState.productTrail.length
          ? [...detailNavState.productTrail]
          : [detailNavState.rootProductId || sourceProductId || product.id];
        const existingIndex = nextTrail.indexOf(product.id);
        detailNavState.productTrail = existingIndex >= 0
          ? nextTrail.slice(0, existingIndex + 1)
          : [...nextTrail, product.id];
        detailNavState.detailDepth = Math.max(
          1,
          Number(historyDepth || 0) || 0,
          detailNavState.productTrail.length
        );
      }
      detailNavState.activeProductId = product.id;
      if (!detailNavState.detailDepth) {
        detailNavState.detailDepth = Math.max(1, detailNavState.productTrail.length || 1);
      }

      const content = modal.querySelector("#product-detail-content");
      const seller = deps.getMarketplaceUser(product.uploadedBy);
      const otherProducts = getSellerOtherProducts(product);
      const shownProductIds = new Set([product.id, ...otherProducts.map((item) => item.id)]);
      const relatedProducts = deps.getDiscoveryRelatedProducts(product, {
        limit: 8,
        excludeIds: shownProductIds
      });
      relatedProducts.forEach((item) => shownProductIds.add(item.id));
      const sponsoredProducts = deps.getDiscoverySponsoredProducts(product, {
        limit: 4,
        excludeIds: shownProductIds
      });
      const images = Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean);
      const mainImage = images[0] || deps.getImageFallbackDataUri("WINGA");

      content?.replaceChildren(deps.createProductDetailContentElement({
        product,
        seller,
        otherProducts,
        relatedProducts,
        sponsoredProducts,
        mainImage,
        showFloatingHomeAction: detailNavState.detailDepth > 1,
        floatingHomeVariant: getFloatingHomeVariant(product),
        productReviewSummaryMarkup: deps.renderProductReviewSummary(product),
        sellerReviewSummaryMarkup: deps.renderSellerReviewSummary(product.uploadedBy),
        reviewFormMarkup: deps.renderProductReviewForm(product),
        reviewListMarkup: deps.renderProductReviewsList(product)
      }));

      modal.style.display = "grid";
      document.body.classList.add("product-detail-open");
      deps.syncBodyScrollLockState?.();
      modal.scrollTop = restoreDetailScrollTop || 0;
      if (
        !fromHistoryNavigation
        && !skipHistoryPush
        && (
          !isAlreadyOpen
          || previousActiveProductId !== product.id
          || !isDetailHistoryState(window.history.state)
        )
      ) {
        syncHistoryForDetail(product.id, sourceProductId);
      }
      bindProductDetailActions(modal, product);
    }

    window.addEventListener("popstate", (event) => {
      const modal = document.getElementById("product-detail-modal");
      const isDetailOpen = Boolean(modal && modal.style.display !== "none" && document.body.classList.contains("product-detail-open"));
      if (isDetailHistoryState(event.state)) {
        openProductDetailModal(event.state.productId, {
          skipHistoryPush: true,
          sourceProductId: event.state.sourceProductId || event.state.productId,
          restoreDetailScrollTop: 0,
          fromHistoryNavigation: true,
          historyDepth: Number(event.state.detailDepth || 1)
        });
        return;
      }
      if (isDetailOpen) {
        closeProductDetailModal({
          skipHistoryBack: true,
          skipContextRestore: pendingHomeNavigation
        });
      }
      if (pendingHomeNavigation) {
        pendingHomeNavigation = false;
        finalizeHomeNavigation();
      }
    });

    return {
      getSellerOtherProducts,
      closeProductDetailModal,
      openProductDetailModal
    };
  }

  window.WingaModules.productDetail.createProductDetailControllerModule = createProductDetailControllerModule;
})();
