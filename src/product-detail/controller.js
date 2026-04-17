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
    let detailContinuousRuntime = {
      observer: null,
      batchIndex: 0,
      recentIds: [],
      usedIds: new Set(),
      seedProductId: "",
      loading: false
    };
    const MAX_ACTIVE_DETAIL_CONTINUATION_SECTIONS = 4;
    const MAX_DETAIL_CONTINUATION_USED_IDS = 120;

    function normalizeProductIdValue(value) {
      const rawValue = String(value || "").trim();
      if (!rawValue) {
        return "";
      }
      return rawValue
        .replace(/^\/+/, "")
        .replace(/^product\/+/i, "")
        .replace(/^\/+/, "")
        .trim();
    }

    function normalizeProductTrail(trail = []) {
      if (!Array.isArray(trail)) {
        return [];
      }
      return trail
        .map((value) => normalizeProductIdValue(value))
        .filter(Boolean);
    }

    function isDetailHistoryState(state) {
      return Boolean(state?.wingaProductDetail && normalizeProductIdValue(state?.productId));
    }

    function buildDetailHistoryState(productId, sourceProductId = "") {
      const normalizedProductId = normalizeProductIdValue(productId);
      const normalizedSourceProductId = normalizeProductIdValue(sourceProductId || detailNavState.rootProductId || normalizedProductId);
      const normalizedTrail = normalizeProductTrail(detailNavState.productTrail);
      return {
        ...(window.history.state && typeof window.history.state === "object" ? window.history.state : {}),
        wingaProductDetail: true,
        productId: normalizedProductId,
        sourceProductId: normalizedSourceProductId,
        detailDepth: Math.max(1, Number(detailNavState.detailDepth || detailNavState.productTrail.length || 1)),
        productTrail: normalizedTrail.length
          ? normalizedTrail
          : [normalizedSourceProductId, normalizedProductId].filter(Boolean)
      };
    }

    function syncHistoryForDetail(productId, sourceProductId = "") {
      if (isSyncingHistoryState || !window.history?.pushState) {
        return;
      }
      const normalizedProductId = normalizeProductIdValue(productId);
      if (!normalizedProductId) {
        return;
      }
      const nextUrl = typeof deps.getProductDetailPath === "function"
        ? deps.getProductDetailPath(normalizedProductId)
        : window.location.href;
      window.history.pushState(buildDetailHistoryState(normalizedProductId, sourceProductId), "", nextUrl);
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
        && (typeof deps.shouldRenderMarketplaceProduct !== "function"
          || deps.shouldRenderMarketplaceProduct(item, {
            allowOwnerVisibility: item.uploadedBy === deps.getCurrentUser?.()
          }))
      ).slice(0, limit);
    }

    function getRemainingSellerProducts(product, excludeIds = new Set(), limit = 8) {
      if (!product?.uploadedBy) {
        return [];
      }
      return deps.getProducts().filter((item) =>
        item.id !== product.id
        && item.uploadedBy === product.uploadedBy
        && item.status === "approved"
        && item.availability !== "sold_out"
        && !excludeIds.has(item.id)
        && (typeof deps.shouldRenderMarketplaceProduct !== "function"
          || deps.shouldRenderMarketplaceProduct(item, {
            allowOwnerVisibility: item.uploadedBy === deps.getCurrentUser?.()
          }))
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

    function appendContinuationSection(sections, shownProductIds, config) {
      const items = (Array.isArray(config?.items) ? config.items : []).filter((item) => item && !shownProductIds.has(item.id));
      if (!items.length) {
        return;
      }
      items.forEach((item) => shownProductIds.add(item.id));
      sections.push({
        eyebrow: config.eyebrow || "",
        title: config.title || "",
        sponsored: Boolean(config.sponsored),
        items
      });
    }

    function rememberRecentIds(currentIds = [], nextIds = [], limit = 40) {
      return [...currentIds, ...nextIds.filter(Boolean)].slice(-limit);
    }

    function pruneOrderedIdSet(idSet, limit = 120) {
      if (!(idSet instanceof Set) || !Number.isFinite(limit) || limit < 1) {
        return idSet;
      }
      while (idSet.size > limit) {
        const oldestId = idSet.values().next().value;
        if (typeof oldestId === "undefined") {
          break;
        }
        idSet.delete(oldestId);
      }
      return idSet;
    }

    function releasePrunedSectionMedia(section) {
      if (!(section instanceof Element)) {
        return;
      }
      deps.unbindMarketplaceScrollImages?.(section);
      section.querySelectorAll("img").forEach((image) => {
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.removeAttribute("src");
        image.removeAttribute("data-zoom-src");
        image.removeAttribute("data-image-action-src");
      });
      section.querySelectorAll("source").forEach((source) => {
        source.removeAttribute("srcset");
        source.removeAttribute("src");
      });
      section.querySelectorAll("video").forEach((video) => {
        try {
          video.pause?.();
          video.removeAttribute("src");
          video.load?.();
        } catch (error) {
          // Ignore cleanup failures for detached media nodes.
        }
      });
    }

    function disconnectDetailContinuousObserver() {
      if (detailContinuousRuntime.observer) {
        detailContinuousRuntime.observer.disconnect();
      }
      if (detailContinuousRuntime.reobserveTimer) {
        window.clearTimeout(detailContinuousRuntime.reobserveTimer);
      }
      detailContinuousRuntime = {
        observer: null,
        batchIndex: 0,
        recentIds: [],
        usedIds: new Set(),
        seedProductId: "",
        loading: false,
        reobserveTimer: 0
      };
    }

    function scheduleDetailContinuousReobserve(anchor, modal) {
      if (!anchor || !anchor.isConnected || !modal?.isConnected || !detailContinuousRuntime.observer) {
        return;
      }
      if (detailContinuousRuntime.reobserveTimer) {
        window.clearTimeout(detailContinuousRuntime.reobserveTimer);
      }
      detailContinuousRuntime.reobserveTimer = window.setTimeout(() => {
        detailContinuousRuntime.reobserveTimer = 0;
        if (!anchor.isConnected || !modal?.isConnected || !detailContinuousRuntime.observer) {
          return;
        }
        detailContinuousRuntime.observer.observe(anchor);
      }, 180);
    }

    function createDetailContinuationSectionElement(descriptor, index) {
      if (!descriptor || !Array.isArray(descriptor.items) || !descriptor.items.length) {
        return null;
      }
      return deps.createDetailShowcaseSectionElement?.({
        eyebrow: descriptor.eyebrow || "Keep Exploring",
        title: descriptor.title || `More products ${index}`,
        items: descriptor.items,
        attributes: {
          "data-product-detail-continuation-section": String(index),
          "data-product-detail-continuation-kind": descriptor.kind || "continuation"
        }
      }) || null;
    }

    function trimDetailContinuationSections(anchor) {
      const modal = anchor?.closest?.("#product-detail-modal");
      if (!modal) {
        return;
      }
      const sections = Array.from(modal.querySelectorAll("[data-product-detail-continuation-section]"));
      if (sections.length <= MAX_ACTIVE_DETAIL_CONTINUATION_SECTIONS) {
        return;
      }
      sections.slice(0, sections.length - MAX_ACTIVE_DETAIL_CONTINUATION_SECTIONS).forEach((section) => {
        releasePrunedSectionMedia(section);
        section.remove();
      });
    }

    function bindInlineProductActions(scope, product) {
      scope.querySelectorAll("[data-open-product]").forEach((card) => {
        if (card.dataset.detailBound === "true") {
          return;
        }
        card.dataset.detailBound = "true";
        card.addEventListener("click", (event) => {
          if (event.target.closest("[data-request-product], [data-chat-product], [data-open-own-messages], [data-buy-product], .product-menu")) {
            return;
          }
          openProductDetailModal(card.dataset.openProduct, {
            sourceProductId: product.id
          });
        });
      });
    }

    function hydrateDetailContinuousAnchor(modal, anchor, product) {
      if (!anchor || detailContinuousRuntime.loading) {
        return;
      }
      detailContinuousRuntime.loading = true;
      detailContinuousRuntime.observer?.unobserve(anchor);
      const seedProduct = (deps.getProductById ? deps.getProductById(detailContinuousRuntime.seedProductId) : null) || product;
      const sellerFirstItems = getRemainingSellerProducts(seedProduct, detailContinuousRuntime.usedIds, 8);
      const descriptor = sellerFirstItems.length
        ? {
          kind: "same-seller",
          eyebrow: "More From This Seller",
          title: "Keep browsing this seller first",
          subtitle: "Winga continues with more items from the same seller before widening discovery.",
          items: sellerFirstItems
        }
        : deps.getContinuousDiscoveryDescriptor?.({
          seedProduct,
          usedIds: detailContinuousRuntime.usedIds,
          recentIds: detailContinuousRuntime.recentIds,
          batchIndex: detailContinuousRuntime.batchIndex
        });
      if (!descriptor) {
        detailContinuousRuntime.loading = false;
        scheduleDetailContinuousReobserve(anchor, modal);
        return;
      }
      const section = createDetailContinuationSectionElement(descriptor, detailContinuousRuntime.batchIndex + 1);
      if (!section) {
        detailContinuousRuntime.loading = false;
        scheduleDetailContinuousReobserve(anchor, modal);
        return;
      }
      anchor.after(section);
      section.after(anchor);
      deps.enhanceShowcaseTracks?.(section);
      bindInlineProductActions(section, product);
      deps.bindProductMenus?.(section);
      deps.bindImageFallbacks?.(section);
      trimDetailContinuationSections(anchor);
      const appendedIds = descriptor.items.map((item) => item.id);
      appendedIds.forEach((productId) => detailContinuousRuntime.usedIds.add(productId));
      pruneOrderedIdSet(detailContinuousRuntime.usedIds, MAX_DETAIL_CONTINUATION_USED_IDS);
      detailContinuousRuntime.recentIds = rememberRecentIds(detailContinuousRuntime.recentIds, appendedIds);
      detailContinuousRuntime.batchIndex += 1;
      detailContinuousRuntime.loading = false;
      scheduleDetailContinuousReobserve(anchor, modal);
    }

    function setupDetailContinuousDiscovery(modal, product, usedIds = new Set()) {
      disconnectDetailContinuousObserver();
      const anchor = modal.querySelector("[data-product-detail-continuous-anchor='true']");
      if (!anchor) {
        return;
      }

      detailContinuousRuntime.usedIds = new Set(Array.from(usedIds || []).filter(Boolean));
      detailContinuousRuntime.recentIds = [];
      detailContinuousRuntime.seedProductId = product.id;

      if (typeof IntersectionObserver === "undefined") {
        for (let cycle = 0; cycle < 3; cycle += 1) {
          hydrateDetailContinuousAnchor(modal, anchor, product);
        }
        return;
      }

      detailContinuousRuntime.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || detailContinuousRuntime.loading) {
            return;
          }
          hydrateDetailContinuousAnchor(modal, anchor, product);
        });
      }, {
        root: modal,
        rootMargin: "760px 0px 620px 0px"
      });
      detailContinuousRuntime.observer.observe(anchor);
    }

    function finalizeHomeNavigation() {
      closeProductDetailModal({
        skipHistoryBack: true,
        skipContextRestore: true
      });
      deps.resetHomeBrowseState?.();
      deps.setCurrentViewState?.("home");
      deps.renderCurrentView?.();
      deps.syncAppShellHistoryState?.({
        force: true,
        url: "/"
      });
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function goHomeFromProductDetail() {
      deps.resetHomeBrowseState?.();
      deps.refreshSearchInputControl?.();
      finalizeHomeNavigation();
    }

    function resetProductDetailHorizontalState(modal) {
      if (!modal) {
        return;
      }
      const dialog = modal.querySelector(".product-detail-dialog");
      const content = modal.querySelector("#product-detail-content");
      const layout = modal.querySelector(".product-detail-layout");
      try {
        window.scrollTo({
          left: 0,
          top: window.scrollY || window.pageYOffset || 0,
          behavior: "auto"
        });
      } catch (error) {
        // Ignore viewport reset failures.
      }
      try {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      } catch (error) {
        // Ignore document horizontal reset failures.
      }
      const targets = [
        modal,
        dialog,
        content,
        layout
      ].filter(Boolean);
      targets.forEach((node) => {
        try {
          node.scrollLeft = 0;
        } catch (error) {
          // Ignore nodes that cannot scroll horizontally.
        }
      });
      // Ensure no lingering horizontal transform or offsets keep the detail shell shifted.
      [dialog, content, layout].filter(Boolean).forEach((node) => {
        try {
          node.style.transform = "none";
        } catch (error) {
          // Ignore nodes that cannot accept inline style updates.
        }
      });
      if (modal) {
        try {
          modal.style.display = "grid";
          modal.style.left = "0";
          modal.style.right = "0";
          modal.style.marginLeft = "0";
          modal.style.marginRight = "0";
          modal.style.width = "100vw";
          modal.style.maxWidth = "100vw";
        } catch (error) {
          // Ignore modal style updates.
        }
      }
      if (dialog) {
        try {
          dialog.style.width = "min(1100px, calc(100vw - 24px))";
          dialog.style.maxWidth = "calc(100vw - 24px)";
          dialog.style.marginLeft = "auto";
          dialog.style.marginRight = "auto";
        } catch (error) {
          // Ignore dialog style updates.
        }
      }
      window.requestAnimationFrame(() => {
        targets.forEach((node) => {
          try {
            node.scrollLeft = 0;
          } catch (error) {
            // Ignore nodes that cannot scroll horizontally.
          }
        });
        [modal, dialog, content, layout].filter(Boolean).forEach((node) => {
          try {
            node.style.transform = "none";
          } catch (error) {
            // Ignore nodes that cannot accept inline style updates.
          }
        });
      });
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
      disconnectDetailContinuousObserver();
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
      deps.syncAppShellHistoryState?.({
        force: true,
        url: window.location.pathname.startsWith("/product/") ? "/" : undefined
      });
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
      bindInlineProductActions(modal, product);

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

      const mainImage = modal.querySelector(".product-detail-image");
      modal.querySelectorAll("[data-detail-image]").forEach((thumb) => {
        thumb.addEventListener("click", () => {
          if (!mainImage) {
            return;
          }
          const nextImage = thumb.dataset.detailImage || "";
          if (!nextImage) {
            return;
          }
          mainImage.src = nextImage;
          mainImage.dataset.zoomSrc = nextImage;
          mainImage.dataset.imageActionSrc = nextImage;
          modal.querySelectorAll("[data-detail-image]").forEach((item) => {
            item.classList.toggle("active", item === thumb);
          });
        });
      });
    }

    function openProductDetailModal(productId, options = {}) {
      const normalizedProductId = normalizeProductIdValue(productId);
      const product = deps.getProductById ? deps.getProductById(normalizedProductId) : deps.getProducts().find((item) => item.id === normalizedProductId);
      if (!product) {
        return;
      }
      const isOwnerView = product.uploadedBy === deps.getCurrentUser?.();

      const {
        skipHistoryPush = false,
        sourceProductId = normalizedProductId,
        restoreDetailScrollTop = 0,
        fromHistoryNavigation = false,
        historyDepth = 0,
        allowBrokenImageFallbackOpen = false
      } = options;

      const renderableImages = typeof deps.getRenderableMarketplaceImages === "function"
        ? deps.getRenderableMarketplaceImages(product, {
            allowOwnerVisibility: isOwnerView
          })
        : [];

      if (
        typeof deps.shouldRenderMarketplaceProduct === "function"
        && !deps.shouldRenderMarketplaceProduct(product, {
          allowOwnerVisibility: isOwnerView
        })
        && !allowBrokenImageFallbackOpen
      ) {
        closeProductDetailModal({
          skipHistoryBack: true,
          skipContextRestore: true
        });
        return;
      }

      const modal = deps.ensureProductDetailModal();
      const isAlreadyOpen = document.body.classList.contains("product-detail-open") && modal.style.display !== "none";
      const previousActiveProductId = detailNavState.activeProductId;
      const historyState = window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : null;
      const historyTrail = normalizeProductTrail(historyState?.productTrail);
      if (!isAlreadyOpen) {
        deps.syncAppShellHistoryState?.({ force: true });
        detailNavState = {
          rootScrollY: window.scrollY || window.pageYOffset || 0,
          rootProductId: normalizeProductIdValue(historyState?.sourceProductId || sourceProductId || normalizedProductId),
          activeProductId: product.id,
          detailDepth: Math.max(
            1,
            Number(historyDepth || historyState?.detailDepth || 0) || 0,
            historyTrail.length || 0,
            1
          ),
          productTrail: historyTrail.length
            ? historyTrail
            : [normalizeProductIdValue(historyState?.sourceProductId || sourceProductId || normalizedProductId) || product.id, product.id].filter(Boolean)
        };
      } else if (!fromHistoryNavigation && detailNavState.rootProductId) {
        detailNavState.rootProductId = normalizeProductIdValue(detailNavState.rootProductId || sourceProductId || normalizedProductId);
        if (previousActiveProductId !== product.id) {
          detailNavState.productTrail = [...detailNavState.productTrail, product.id];
          detailNavState.detailDepth = detailNavState.productTrail.length;
        }
      } else if (fromHistoryNavigation) {
        const nextTrail = Array.isArray(detailNavState.productTrail) && detailNavState.productTrail.length
          ? [...detailNavState.productTrail]
          : historyTrail.length
            ? [...historyTrail]
            : [normalizeProductIdValue(detailNavState.rootProductId || sourceProductId || normalizedProductId) || product.id];
        const existingIndex = nextTrail.indexOf(product.id);
        detailNavState.productTrail = existingIndex >= 0
          ? nextTrail.slice(0, existingIndex + 1)
          : [...nextTrail, product.id];
        detailNavState.detailDepth = Math.max(
          1,
          Number(historyDepth || 0) || 0,
          detailNavState.productTrail.length,
          historyTrail.length || 0
        );
      }
      detailNavState.activeProductId = product.id;
      if (!detailNavState.detailDepth) {
        detailNavState.detailDepth = Math.max(1, detailNavState.productTrail.length || 1);
      }

      deps.noteProductInterest(product.id);
      deps.noteProductDiscovery(product.id);

      const content = modal.querySelector("#product-detail-content");
      const seller = deps.getMarketplaceUser(product.uploadedBy);
      const otherProducts = getSellerOtherProducts(product);
      const shownProductIds = new Set([product.id, ...otherProducts.map((item) => item.id)]);
      const continuationSections = [];
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "Related Products",
        title: "Keep exploring similar products",
        items: deps.getDiscoveryRelatedProducts(product, {
          limit: 8,
          excludeIds: shownProductIds
        })
      });
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "Most Searched",
        title: "Popular products buyers search for most",
        items: deps.getMostSearchedProducts(product, {
          limit: 8,
          excludeIds: shownProductIds
        })
      });
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "New Products",
        title: "Fresh listings from active sellers",
        items: deps.getNewestProducts({
          limit: 8,
          excludeIds: shownProductIds,
          seedProduct: product
        })
      });
      appendContinuationSection(continuationSections, shownProductIds, {
        eyebrow: "Sponsored Picks",
        title: "Promoted products you may also like",
        sponsored: true,
        items: deps.getDiscoverySponsoredProducts(product, {
          limit: 4,
          excludeIds: shownProductIds
        })
      });
      const images = renderableImages.length
        ? renderableImages
        : (Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean));
      const mainImage = images[0] || deps.getImageFallbackDataUri("WINGA");

      content?.replaceChildren(deps.createProductDetailContentElement({
        product,
        seller,
        otherProducts,
        continuationSections,
        enableContinuousDiscovery: true,
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
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      modal.scrollTo({
        top: restoreDetailScrollTop || 0,
        left: 0,
        behavior: "auto"
      });
      resetProductDetailHorizontalState(modal);
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
      deps.enhanceShowcaseTracks?.(modal);
      deps.bindProductMenus?.(modal);
      deps.bindImageFallbacks?.(modal);
      setupDetailContinuousDiscovery(modal, product, shownProductIds);
    }

    function refreshActiveProductDetail() {
      if (!detailNavState.activeProductId) {
        return;
      }
      const modal = document.getElementById("product-detail-modal");
      if (!modal || modal.style.display === "none") {
        return;
      }
      openProductDetailModal(detailNavState.activeProductId, {
        skipHistoryPush: true,
        sourceProductId: detailNavState.rootProductId || detailNavState.activeProductId,
        restoreDetailScrollTop: modal.scrollTop || 0
      });
    }

    window.addEventListener("popstate", (event) => {
      const modal = document.getElementById("product-detail-modal");
      const isDetailOpen = Boolean(modal && modal.style.display !== "none" && document.body.classList.contains("product-detail-open"));
      if (isDetailHistoryState(event.state)) {
        openProductDetailModal(normalizeProductIdValue(event.state.productId), {
          skipHistoryPush: true,
          sourceProductId: normalizeProductIdValue(event.state.sourceProductId || event.state.productId),
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
      openProductDetailModal,
      refreshActiveProductDetail
    };
  }

  window.WingaModules.productDetail.createProductDetailControllerModule = createProductDetailControllerModule;
})();
