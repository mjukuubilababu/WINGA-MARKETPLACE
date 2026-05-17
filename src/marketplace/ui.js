(() => {
  function createMarketplaceUiModule(deps) {
    const {
      createElement,
      createFragmentFromMarkup,
      createResponsiveImage,
      createProgressiveImage = createResponsiveImage,
      createStatusPill
    } = deps;

    function createElementFromMarkup(markup) {
      return deps.createElementFromMarkup(markup);
    }

    function schedulePassiveTask(callback) {
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => callback(), { timeout: 1200 });
        return;
      }
      window.setTimeout(callback, 180);
    }

    const passiveViewedProductQueue = new Set();
    let passiveViewedProductTrackingScheduled = false;
    const PASSIVE_VIEW_TRACK_BATCH_SIZE = 1;
    const PASSIVE_VIEW_TRACK_IDLE_DELAY_MS = 700;
    const FEED_GALLERY_IMAGE_LIMIT = 3;
    let scheduledFeedRenderState = {
      token: 0,
      timer: 0
    };
    const FEED_RENDER_BATCH_SIZE = 8;
    const FEED_RENDER_BATCH_DELAY_MS = 22;

    function cancelScheduledFeedRender() {
      scheduledFeedRenderState.token += 1;
      if (scheduledFeedRenderState.timer) {
        window.clearTimeout(scheduledFeedRenderState.timer);
        scheduledFeedRenderState.timer = 0;
      }
    }

    function schedulePassiveViewedProductTracking(productIds = []) {
      Array.from(new Set(Array.isArray(productIds) ? productIds : []))
        .filter(Boolean)
        .forEach((productId) => passiveViewedProductQueue.add(productId));

      if (passiveViewedProductTrackingScheduled || !passiveViewedProductQueue.size) {
        return;
      }

      passiveViewedProductTrackingScheduled = true;
      schedulePassiveTask(() => {
        passiveViewedProductTrackingScheduled = false;
        const batch = Array.from(passiveViewedProductQueue).slice(0, PASSIVE_VIEW_TRACK_BATCH_SIZE);
        batch.forEach((productId) => passiveViewedProductQueue.delete(productId));

        if (!batch.length) {
          return;
        }

        Promise.resolve()
          .then(async () => {
            for (const productId of batch) {
              await deps.trackProductView(productId);
            }
          })
          .catch(() => {
            // Ignore passive tracking failures.
          })
          .finally(() => {
            if (passiveViewedProductQueue.size > 0) {
              window.setTimeout(() => schedulePassiveViewedProductTracking([]), PASSIVE_VIEW_TRACK_IDLE_DELAY_MS);
            }
          });
      });
    }

    function preloadMarketplaceImages(list = []) {
      if (!deps.preloadImageSource || !Array.isArray(list) || !list.length) {
        return;
      }
      const seen = new Set();
      const limit = Math.max(2, deps.getProductsPerRow?.() || 2);
      list.slice(0, limit).forEach((product) => {
        const primaryImage = deps.getMarketplacePrimaryImage
          ? deps.getMarketplacePrimaryImage(product, {
              allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
            })
          : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
        const safeSrc = String(primaryImage || "").trim();
        if (!safeSrc || seen.has(safeSrc)) {
          return;
        }
        seen.add(safeSrc);
        deps.preloadImageSource(safeSrc, { fetchPriority: "auto" });
      });
    }

    function createProductGalleryElement(product) {
      if (deps.renderFeedGalleryMarkup) {
        return createElementFromMarkup(deps.renderFeedGalleryMarkup(product, "feed"));
      }

      const fitMode = String(product.fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
      const safeImages = deps.getRenderableMarketplaceImages
        ? deps.getRenderableMarketplaceImages(product)
        : (Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]).filter(Boolean);
      const images = safeImages.length > 0
        ? safeImages.slice(0, FEED_GALLERY_IMAGE_LIMIT)
        : [deps.getImageFallbackDataUri("WINGA")];
      const wrapper = createElement("div", {
        className: `product-gallery media-gallery feed-gallery-preview feed-gallery-carousel fit-mode-${fitMode}`,
        attributes: {
          "data-feed-gallery-carousel": "true",
          "data-feed-gallery-total": String(images.length),
          "data-feed-gallery-current": "1",
          "data-feed-gallery-surface": "feed",
          "data-fit-mode": fitMode
        }
      });
      const track = createElement("div", { className: "feed-gallery-carousel-track", attributes: { "data-feed-gallery-track": "true" } });
      images.forEach((src, index) => {
        const safeSrc = deps.sanitizeImageSource
          ? deps.sanitizeImageSource(src || "", deps.getImageFallbackDataUri("WINGA"))
          : src;
        const slide = createElement("div", {
          className: "feed-gallery-carousel-slide",
          attributes: { "data-feed-gallery-slide": String(index) }
        });
        slide.appendChild(createProgressiveImage({
          src: safeSrc,
          alt: `${product.name || "Product image"} ${index + 1}`,
          className: "feed-gallery-image feed-gallery-image-social",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
          placeholderSrc: deps.getImageFallbackDataUri("W"),
          fitMode,
          attributes: {
            loading: "lazy",
            fetchpriority: "auto",
            draggable: "false",
            "data-preserve-image-ratio": "true",
            "data-marketplace-scroll-image": "true",
            "data-feed-gallery-image-src": safeSrc
          }
        }));
        track.appendChild(slide);
      });
      wrapper.appendChild(track);
      if (images.length > 1) {
        wrapper.appendChild(createElement("span", {
          className: "feed-gallery-count-badge",
          attributes: { "data-feed-gallery-count": "true" },
          textContent: `1/${images.length}`
        }));
      }
      return wrapper;
    }

    function getProductSellerLabel(product) {
      return String(product?.shop || product?.uploadedBy || "Seller").trim();
    }

    function getSellerAvatarFallback(product) {
      const label = getProductSellerLabel(product);
      const initials = label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase();
      return initials || "S";
    }

    function createSellerRowElement(product) {
      const sellerRow = createElement("div", { className: "product-seller-row" });
      const avatarWrap = createElement("div", { className: "product-seller-avatar" });
      const sellerUser = deps.getMarketplaceUser?.(product?.uploadedBy);
      const isOwnerSeller = Boolean(
        deps.canUseSellerFeatures?.()
        && deps.getCurrentUser?.()
        && product?.uploadedBy === deps.getCurrentUser?.()
      );
      const sellerImage = String(sellerUser?.profileImage || "").trim();
      if (sellerImage) {
        avatarWrap.appendChild(createProgressiveImage({
          src: sellerImage,
          alt: getProductSellerLabel(product),
          className: "product-seller-avatar-image",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
          placeholderSrc: deps.getImageFallbackDataUri("W")
        }));
      } else {
        avatarWrap.textContent = getSellerAvatarFallback(product);
      }

      const sellerCopy = createElement("div", { className: "product-seller-copy" });
      sellerCopy.append(
        createElement("strong", { className: "product-seller-name", textContent: getProductSellerLabel(product) }),
        createElement("span", {
          className: "product-seller-meta",
          textContent: `${product?.location || deps.getCategoryLabel(product?.category)}`
        })
      );

      const badgeRow = createElement("div", { className: "product-seller-badge-row" });
      badgeRow.appendChild(createElement("span", {
        className: "product-seller-badge",
        textContent: sellerUser?.verifiedSeller ? "Verified" : "Seller"
      }));
      if (isOwnerSeller) {
        const promotionStatusMeta = deps.getSellerPromotionStatusMeta?.(product);
        if (promotionStatusMeta?.label) {
          badgeRow.appendChild(createElement("span", {
            className: `status-pill product-seller-promotion-state ${promotionStatusMeta.className || "pending"}`,
            textContent: promotionStatusMeta.label
          }));
          if (promotionStatusMeta.detail) {
            badgeRow.appendChild(createElement("span", {
              className: "product-seller-promotion-detail",
              textContent: promotionStatusMeta.detail
            }));
          }
        }
        const promoteButton = createElement("button", {
          className: "product-seller-promote-chip",
          textContent: "Promote",
          attributes: {
            type: "button",
            onclick: "return window.__wingaOpenPromotionFromTrigger ? window.__wingaOpenPromotionFromTrigger(this) : false;",
            "data-promote-product": product.id,
            "data-promote-authorized": "true",
            "data-promote-product-owner": product.uploadedBy || "",
            "data-promote-product-name": product.name || "",
            "data-promote-product-shop": product.shop || "",
            "data-promote-product-whatsapp": product.whatsapp || "",
            "data-promote-product-location": product.location || "",
            "data-promote-product-category": product.category || ""
          }
        });
        promoteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          if (!window.__wingaOpenPromotionFromTrigger?.(promoteButton)) {
            deps.openPromotionIntentModal?.(product, { trustedAuthorized: true, trigger: promoteButton });
          }
        });
        badgeRow.appendChild(promoteButton);
      }

      sellerRow.append(avatarWrap, sellerCopy, badgeRow);
      return sellerRow;
    }

    function createProductActionGroupElement(product) {
      return deps.createElementFromMarkup(
        deps.renderProductActionGroup(product, { requestLabel: "My Request" })
      );
    }

    function createShowcasePreviewMediaElement(product) {
      const fitMode = String(product.fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
      const media = createElement("div", { className: `product-card-media showcase-media fit-mode-${fitMode}`, attributes: { "data-fit-mode": fitMode } });
      const fallbackSrc = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
          })
        : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
      media.dataset.showcaseFallbackSrc = fallbackSrc || "";
      media.dataset.showcaseFallbackAlt = product.name || "Product image";
      const primaryImage = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
          })
        : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
      media.appendChild(createProgressiveImage({
        src: primaryImage,
        alt: product.name || "Product image",
        fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
        placeholderSrc: deps.getImageFallbackDataUri("W"),
        className: "showcase-preview-image",
        fitMode,
        attributes: {
          "data-marketplace-scroll-image": "true"
        }
      }));
      return media;
    }

    function repairShowcaseMediaVisibility(scope = document) {
      const isMobileViewport = window.matchMedia?.("(max-width: 780px)")?.matches;
      if (!isMobileViewport) {
        return;
      }
      scope.querySelectorAll?.(".showcase-card .showcase-media").forEach((media) => {
        if (!(media instanceof Element) || media.dataset.showcaseMediaRepairBound === "true") {
          return;
        }
        media.dataset.showcaseMediaRepairBound = "true";
        const fallbackSrc = String(media.dataset.showcaseFallbackSrc || "").trim();
        if (!fallbackSrc) {
          return;
        }
        window.setTimeout(() => {
          if (!media.isConnected) {
            return;
          }
          const visibleImage = media.querySelector(".feed-gallery-image-social, .showcase-preview-image, img");
          const hasHealthyImage = Boolean(
            visibleImage
            && String(visibleImage.currentSrc || visibleImage.src || "").trim()
            && (Number(visibleImage.naturalWidth || 0) > 0 || Number(visibleImage.clientWidth || 0) > 0)
          );
          if (hasHealthyImage) {
            return;
          }
          media.replaceChildren(createProgressiveImage({
            src: fallbackSrc,
            alt: String(media.dataset.showcaseFallbackAlt || "Product image"),
            fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
            placeholderSrc: deps.getImageFallbackDataUri("W"),
            className: "showcase-preview-image",
            fitMode: String(media.dataset.fitMode || "cover").trim().toLowerCase() === "contain" ? "contain" : "cover",
            attributes: {
              "data-marketplace-scroll-image": "true",
              "data-showcase-media-repaired": "true"
            }
          }));
          media.dataset.showcaseMediaRepaired = "true";
        }, 900);
      });
    }

    function stabilizeMobileShowcaseRows(scope = document) {
      const isMobileViewport = window.matchMedia?.("(max-width: 780px)")?.matches;
      if (!isMobileViewport) {
        return;
      }
      const rows = Array.from(scope.querySelectorAll?.(".showcase-inline") || []);
      rows.forEach((row) => {
        if (!(row instanceof Element) || row.dataset.showcaseRowStabilityBound === "true") {
          return;
        }
        row.dataset.showcaseRowStabilityBound = "true";
        window.setTimeout(() => {
          if (!row.isConnected) {
            return;
          }
          const cards = Array.from(row.querySelectorAll(".showcase-card"));
          if (!cards.length) {
            return;
          }
          const healthyCardCount = cards.filter((card) => {
            const image = card.querySelector(".feed-gallery-image-social, .showcase-preview-image, img");
            return Boolean(
              image
              && String(image.currentSrc || image.src || "").trim()
              && (Number(image.naturalWidth || 0) > 0 || Number(image.clientWidth || 0) > 32)
            );
          }).length;
          if (healthyCardCount > 0) {
            return;
          }
          row.dataset.showcaseRowMediaPending = "true";
          row.querySelectorAll(".showcase-media").forEach((media) => {
            if (!(media instanceof Element)) {
              return;
            }
            const fallbackSrc = String(media.dataset.showcaseFallbackSrc || "").trim();
            const visibleImage = media.querySelector(".feed-gallery-image-social, .showcase-preview-image, img");
            const hasHealthyImage = Boolean(
              visibleImage
              && String(visibleImage.currentSrc || visibleImage.src || "").trim()
              && (Number(visibleImage.naturalWidth || 0) > 0 || Number(visibleImage.clientWidth || 0) > 0)
            );
            if (!fallbackSrc || hasHealthyImage) {
              return;
            }
            media.replaceChildren(createProgressiveImage({
              src: fallbackSrc,
              alt: String(media.dataset.showcaseFallbackAlt || "Product image"),
              fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
              placeholderSrc: deps.getImageFallbackDataUri("W"),
              className: "showcase-preview-image",
              fitMode: String(media.dataset.fitMode || "cover").trim().toLowerCase() === "contain" ? "contain" : "cover",
              attributes: {
                "data-marketplace-scroll-image": "true",
                "data-showcase-media-repaired": "true"
              }
            }));
            media.dataset.showcaseMediaRepaired = "true";
          });
          reportShowcaseInstrumentation("mobile_showcase_row_media_pending", {
            heading: String(row.querySelector(".section-heading h2, .section-heading strong, h2")?.textContent || "").trim(),
            cardCount: cards.length,
            source: row.getAttribute("data-recommendation-type") || row.getAttribute("data-continuous-discovery-kind") || "showcase_inline"
          });
        }, 1400);
      });
    }

    function bindCardOpenHandler(card, product) {
      if (!card || card.dataset.cardOpenBound === "true") {
        return;
      }

      card.dataset.cardOpenBound = "true";
      card.addEventListener("click", (event) => {
        if (event.__wingaProductOpenHandled) {
          return;
        }
        const openTrigger = event.target.closest("[data-open-product], [data-product-card], [data-showcase-id]");
        const productId = openTrigger?.dataset?.openProduct
          || openTrigger?.dataset?.productCard
          || openTrigger?.dataset?.showcaseId
          || card.dataset.openProduct
          || card.dataset.productCard
          || card.dataset.showcaseId
          || product?.id
          || "";
        if (!productId) {
          return;
        }
        if (
          event.target.closest(
            ".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages], [data-open-product-whatsapp], [data-buy-product], [data-detail-repost], [data-promote-product], .product-actions, .showcase-actions, .seller-product-actions"
          )
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.__wingaProductOpenHandled = true;

        if (!deps.isAuthenticatedUser?.()) {
          deps.promptGuestAuth?.({
            preferredMode: "signup",
            role: "buyer",
            title: "You need an account to continue",
            message: "Sign up or log in to open product details and other marketplace actions.",
            intent: { type: "focus-product", productId }
          });
          return;
        }

        deps.openProductDetailModal?.(productId);
      });
    }

    function getProductCardCaption(product) {
      return String(
        product?.description
          || product?.caption
          || product?.name
          || product?.shop
          || deps.getCategoryLabel(product?.category)
          || ""
      ).trim();
    }

    function createProductCaptionElement(product) {
      const captionText = getProductCardCaption(product);
      if (!captionText) {
        return null;
      }
      const wrapper = createElement("div", {
        className: "product-card-caption-block"
      });

      const caption = createElement("p", {
        className: "product-card-caption",
        textContent: captionText
      });
      caption.setAttribute("aria-label", captionText);
      wrapper.appendChild(caption);

      const needsToggle = captionText.length > 120;
      if (needsToggle) {
        wrapper.classList.add("is-collapsed");
        const toggle = createElement("button", {
          className: "product-caption-toggle",
          textContent: "See more",
          attributes: {
            type: "button",
            "data-product-caption-toggle": "true",
            "aria-expanded": "false"
          }
        });
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isExpanded = wrapper.classList.toggle("is-expanded");
          wrapper.classList.toggle("is-collapsed", !isExpanded);
          toggle.textContent = isExpanded ? "See less" : "See more";
          toggle.setAttribute("aria-expanded", String(isExpanded));
        });
        wrapper.appendChild(toggle);
      }

      return wrapper;
    }

    function createProductCardElement(product) {
      const card = createElement("article", {
        className: "product-card",
        attributes: {
          "data-product-card": product.id,
          "data-open-product": product.id
        }
      });
      card.dataset.productCard = product.id;
      card.dataset.openProduct = product.id;
      card.dataset.cardOpenBound = "false";
      if (Array.isArray(product.images) && product.images.length > 1) {
        card.classList.add("has-gallery-count-badge");
      }
      const media = createElement("div", { className: "product-card-media" });
      media.appendChild(createProductGalleryElement(product));
      if (Array.isArray(product.images) && product.images.length > 1) {
        media.appendChild(createElement("span", {
          className: "feed-gallery-count-badge product-gallery-count-badge",
          textContent: `${Math.min(product.images.length, 9)}/5`
        }));
      }
      card.appendChild(media);
      const overflowMenuMarkup = deps.renderProductOverflowMenu?.(product, { overlay: true });
      if (overflowMenuMarkup) {
        card.appendChild(createFragmentFromMarkup(overflowMenuMarkup));
      }

      const content = createElement("div", { className: "product-content product-content-simple product-content-social" });
      content.appendChild(createSellerRowElement(product));
      const caption = createProductCaptionElement(product);
      if (caption) {
        content.appendChild(caption);
      }
      const promotionAnalyticsMarkup = deps.renderSellerPromotionAnalytics?.(product);
      if (promotionAnalyticsMarkup) {
        content.appendChild(createElementFromMarkup(promotionAnalyticsMarkup));
      }
      content.appendChild(createProductActionGroupElement(product));
      card.appendChild(content);
      bindCardOpenHandler(card, product);

      return card;
    }

    function createProductCardStackElement(items = [], options = {}) {
      const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
      const stack = createElement("div", {
        className: options.className || "product-detail-feed-stack",
        attributes: {
          "data-product-detail-feed-stack": "true",
          ...(options.attributes || {})
        }
      });
      safeItems.forEach((item) => stack.appendChild(createProductCardElement(item)));
      return stack;
    }

    function createShowcaseProductCardElement(product) {
      const card = createElement("article", {
        className: "product-card showcase-card",
        attributes: {
          "data-showcase-id": product.id,
          "data-open-product": product.id
        }
      });
      card.dataset.showcaseId = product.id;
      card.dataset.openProduct = product.id;
      card.dataset.cardOpenBound = "false";
      if (Array.isArray(product.images) && product.images.length > 1) {
        card.classList.add("has-gallery-count-badge");
      }
      const media = createShowcasePreviewMediaElement(product);
      const body = createElement("div", { className: "product-content product-content-simple product-content-social showcase-body" });
      const overflowMenuMarkup = deps.renderProductOverflowMenu?.(product, { overlay: true });
      if (overflowMenuMarkup) {
        card.appendChild(createFragmentFromMarkup(overflowMenuMarkup));
      }
      body.appendChild(createSellerRowElement(product));
      const caption = createProductCaptionElement(product);
      if (caption) {
        body.appendChild(caption);
      }
      body.append(
        deps.createElementFromMarkup(
          deps.renderProductActionGroup(product, { requestLabel: "My Request", extraClass: "showcase-actions showcase-actions-compact" })
        )
      );
      card.append(media, body);
      card.dataset.showcaseClickBound = "true";
      bindCardOpenHandler(card, product);
      return card;
    }

    function createShowcaseSectionElement(items, index, heading = "Marketplace Picks", title = "Bidhaa kutoka maduka tofauti", subtitle = "Tembea kushoto au kulia kuona zaidi") {
      if (!items.length) {
        return null;
      }
      const section = createElement("section", {
        className: "showcase-inline panel",
        attributes: { "data-inline-showcase-section": index }
      });
      const sectionHeading = deps.createSectionHeading({
        eyebrow: heading,
        title,
        meta: subtitle
      });
      const shareButton = createElement("button", {
        className: "trust-link-btn showcase-share-btn",
        textContent: "Share collection",
        attributes: {
          type: "button",
          "data-share-collection-title": title,
          "data-share-collection-subtitle": subtitle,
          "data-share-collection-heading": heading,
          "data-share-collection-product-id": items[0]?.id || "",
          "data-share-collection-surface": "showcase"
        }
      });
      sectionHeading.appendChild(shareButton);
      section.appendChild(sectionHeading);
      const track = createElement("div", { className: "showcase-track" });
      items.forEach((product) => track.appendChild(createShowcaseProductCardElement(product)));
      section.appendChild(track);
      return section;
    }

    function renderShowcaseTrack(track, items) {
      if (!track) {
        return;
      }
      const fragment = document.createDocumentFragment();
      (Array.isArray(items) ? items : []).forEach((product) => {
        fragment.appendChild(createShowcaseProductCardElement(product));
      });
      track.replaceChildren(fragment);
    }

    function createDynamicShowcasePlaceholderElement(index) {
      const section = createElement("section", {
        className: "showcase-inline panel showcase-inline-pending",
        attributes: { "data-dynamic-showcase-placeholder": index }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "More To Explore",
        title: "Loading more products for you",
        meta: "Keep scrolling to discover more"
      }));
      return section;
    }

    function createRecommendationSectionElement(title, subtitle, items, type) {
      if (!items.length) {
        return null;
      }
      const section = createElement("section", {
        className: "showcase-inline panel recommendation-strip",
        attributes: { "data-recommendation-type": type }
      });
      const sectionHeading = deps.createSectionHeading({
        eyebrow: title,
        title: subtitle,
        meta: "Suggestions based on the current catalog"
      });
      const shareButton = createElement("button", {
        className: "trust-link-btn showcase-share-btn",
        textContent: "Share collection",
        attributes: {
          type: "button",
          "data-share-collection-title": subtitle,
          "data-share-collection-subtitle": "Suggestions based on the current catalog",
          "data-share-collection-heading": title,
          "data-share-collection-product-id": items[0]?.id || "",
          "data-share-collection-surface": type || "recommendation"
        }
      });
      sectionHeading.appendChild(shareButton);
      section.appendChild(sectionHeading);
      const track = createElement("div", { className: "showcase-track" });
      items.forEach((product) => track.appendChild(createShowcaseProductCardElement(product)));
      section.appendChild(track);
      return section;
    }

    function createRecommendationDescriptor(title, subtitle, items, type) {
      const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!safeItems.length) {
        return null;
      }
      const normalizedType = String(type || "recommendation").trim().toLowerCase();
      const minBatchIndex = normalizedType === "related"
        ? 1
        : normalizedType === "you-may-like"
          ? 2
          : normalizedType === "trending"
            ? 3
            : 1;
      return {
        kind: type || "recommendation",
        source: "deferred_recommendation",
        minBatchIndex,
        eyebrow: title,
        title: subtitle,
        subtitle: "Suggestions based on the current catalog",
        items: safeItems
      };
    }

    function reportShowcaseInstrumentation(eventName, payload = {}) {
      if (typeof deps.reportShowcaseInstrumentation !== "function") {
        return;
      }
      deps.reportShowcaseInstrumentation(eventName, payload);
    }

    function renderProducts(list) {
      const productsContainer = deps.getProductsContainer();
      cancelScheduledFeedRender();
      if (!productsContainer) {
        return;
      }
      const currentView = deps.getCurrentView();
      const shouldTrackViews = currentView !== "upload";
      const shouldInjectInlineShowcases = currentView === "home" && !deps.hasPrioritySearchResults(list.length);
      const productsPerRow = shouldInjectInlineShowcases ? deps.getProductsPerRow() : 0;
      const showcaseSpacing = 10;
      const firstShowcaseAfter = shouldInjectInlineShowcases ? showcaseSpacing : Number.POSITIVE_INFINITY;
      const showcaseRepeatInterval = shouldInjectInlineShowcases ? showcaseSpacing : Number.POSITIVE_INFINITY;
      let nextShowcaseInsertAt = firstShowcaseAfter;
      let showcaseIndex = 0;
      let insertedInlineShowcase = false;
      const usedShowcaseProductIds = new Set();
      const maxDeferredShowcases = shouldInjectInlineShowcases
        ? Math.min(2, Math.max(0, Math.floor((Math.max(0, list.length - firstShowcaseAfter)) / Math.max(1, showcaseRepeatInterval))))
        : 0;
      const viewedProductIds = [];
      const passiveViewLimit = Math.max(4, (deps.getProductsPerRow?.() || 3));
      preloadMarketplaceImages(list);
      const renderToken = ++scheduledFeedRenderState.token;
      productsContainer.replaceChildren();

      const appendShowcaseIfNeeded = (fragment, renderedCount) => {
        if (!shouldInjectInlineShowcases || renderedCount !== nextShowcaseInsertAt || renderedCount >= list.length) {
          return;
        }
        if (showcaseIndex === 0) {
          const descriptor = deps.getBehaviorShowcaseDescriptor(showcaseIndex, usedShowcaseProductIds);
          const showcaseElement = createShowcaseSectionElement(
            descriptor.items,
            showcaseIndex + 1,
            descriptor.heading,
            descriptor.title,
            descriptor.subtitle
          );
          if (showcaseElement) {
            reportShowcaseInstrumentation("inline_behavior_showcase_rendered", {
              sectionIndex: showcaseIndex,
              heading: descriptor.heading,
              title: descriptor.title,
              itemCount: Array.isArray(descriptor.items) ? descriptor.items.length : 0,
              source: "behavior_showcase"
            });
            descriptor.items.forEach((item) => usedShowcaseProductIds.add(item.id));
            fragment.appendChild(showcaseElement);
            showcaseIndex += 1;
            insertedInlineShowcase = true;
          }
        } else if (showcaseIndex - 1 < maxDeferredShowcases) {
          fragment.appendChild(createDynamicShowcasePlaceholderElement(showcaseIndex));
          showcaseIndex += 1;
          insertedInlineShowcase = true;
        }
        nextShowcaseInsertAt += showcaseRepeatInterval;
      };

      const finalizeFeedRender = () => {
        if (renderToken !== scheduledFeedRenderState.token) {
          return;
        }
        if (shouldInjectInlineShowcases && !insertedInlineShowcase && list.length >= Math.max(4, productsPerRow * 2 || 4)) {
          const descriptor = deps.getBehaviorShowcaseDescriptor(0, usedShowcaseProductIds);
          const showcaseElement = createShowcaseSectionElement(
            descriptor.items,
            1,
            descriptor.heading,
            descriptor.title,
            descriptor.subtitle
          );
          if (showcaseElement) {
            productsContainer.appendChild(showcaseElement);
          }
        }

        if (currentView === "home" && list.length > 0 && deps.canUseContinuousDiscovery?.()) {
          const seedProduct = deps.getRecommendationSeed(list);
          const sponsored = deps.getDiscoverySponsoredProducts?.(seedProduct, {
            limit: 6,
            excludeIds: new Set(list.map((product) => product.id))
          }) || [];
          const related = deps.getRelatedProducts(seedProduct, 6);
          const youMayLike = deps.getYouMayLikeProducts(seedProduct, 6);
          const trending = deps.getTrendingProducts(8);
          const recommendationDescriptors = [
            createRecommendationDescriptor("Sponsored Picks", "Promoted products getting extra visibility", sponsored, "sponsored"),
            createRecommendationDescriptor("Related Products", seedProduct ? `More in ${deps.getCategoryLabel(seedProduct.category)}` : "Similar picks", related, "related"),
            createRecommendationDescriptor("You May Like", "Based on what you are viewing", youMayLike, "you-may-like"),
            createRecommendationDescriptor("Trending", "Most viewed and most interacted", trending, "trending")
          ].filter(Boolean);
          if (shouldInjectInlineShowcases && insertedInlineShowcase && deps.setDeferredRecommendationDescriptors) {
            reportShowcaseInstrumentation("deferred_recommendations_queued", {
              count: recommendationDescriptors.length,
              kinds: recommendationDescriptors.map((descriptor) => descriptor.kind),
              itemCounts: recommendationDescriptors.map((descriptor) => Array.isArray(descriptor.items) ? descriptor.items.length : 0)
            });
            deps.setDeferredRecommendationDescriptors(recommendationDescriptors);
          } else {
            if (deps.setDeferredRecommendationDescriptors) {
              deps.setDeferredRecommendationDescriptors([]);
            }
            recommendationDescriptors
              .map((descriptor) => createRecommendationSectionElement(
                descriptor.eyebrow,
                descriptor.title,
                descriptor.items,
                descriptor.kind
              ))
              .filter(Boolean)
              .forEach((section, index) => {
                const descriptor = recommendationDescriptors[index];
                reportShowcaseInstrumentation("recommendation_section_rendered", {
                  kind: descriptor?.kind || "recommendation",
                  title: descriptor?.title || "",
                  itemCount: Array.isArray(descriptor?.items) ? descriptor.items.length : 0,
                  source: "direct_recommendation"
                });
                productsContainer.appendChild(section);
              });
          }
          if (deps.createContinuousDiscoveryAnchorElement) {
            productsContainer.appendChild(deps.createContinuousDiscoveryAnchorElement());
          }
        } else if (deps.setDeferredRecommendationDescriptors) {
          deps.setDeferredRecommendationDescriptors([]);
        }

        if (shouldInjectInlineShowcases) {
          deps.bindShowcaseCardClicks(productsContainer);
          deps.setupDynamicShowcaseLoading(productsContainer, usedShowcaseProductIds);
        }
        deps.enhanceShowcaseTracks?.(productsContainer);
        repairShowcaseMediaVisibility(productsContainer);
        stabilizeMobileShowcaseRows(productsContainer);
        deps.bindFeedGalleryInteractions?.(productsContainer);
        deps.bindImageFallbacks?.(productsContainer);
        deps.bindProductEngagementSignals?.(productsContainer);
        deps.bindProductMenus?.(productsContainer);
        if (currentView === "home" && list.length > 0 && deps.canUseContinuousDiscovery?.() && deps.setupContinuousDiscoveryLoading) {
          const usedProductIds = new Set(list.map((product) => product.id));
          Array.from(productsContainer.querySelectorAll("[data-showcase-id], [data-open-product]")).forEach((element) => {
            const productId = element.dataset.showcaseId || element.dataset.openProduct || "";
            if (productId) {
              usedProductIds.add(productId);
            }
          });
          deps.setupContinuousDiscoveryLoading(productsContainer, {
            seedProduct: deps.getRecommendationSeed(list),
            usedProductIds
          });
        }
        if (viewedProductIds.length > 0) {
          schedulePassiveViewedProductTracking(viewedProductIds);
        }
      };

      const renderNextBatch = (startIndex = 0) => {
        if (renderToken !== scheduledFeedRenderState.token) {
          return;
        }
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(list.length, startIndex + FEED_RENDER_BATCH_SIZE);
        for (let index = startIndex; index < endIndex; index += 1) {
          const product = list[index];
          if (shouldTrackViews && index < passiveViewLimit && deps.trackView(product)) {
            viewedProductIds.push(product.id);
          }
          fragment.appendChild(createProductCardElement(product));
          appendShowcaseIfNeeded(fragment, index + 1);
        }
        productsContainer.appendChild(fragment);
        deps.afterFeedBatchRender?.({
          container: productsContainer,
          startIndex,
          endIndex,
          total: list.length,
          currentView
        });
        if (endIndex < list.length) {
          deps.onFeedRenderBatch?.({
            container: productsContainer,
            renderedCount: endIndex,
            total: list.length,
            currentView
          });
          scheduledFeedRenderState.timer = window.setTimeout(() => {
            scheduledFeedRenderState.timer = 0;
            renderNextBatch(endIndex);
          }, FEED_RENDER_BATCH_DELAY_MS);
          return;
        }
        finalizeFeedRender();
      };

      renderNextBatch(0);
    }

    return {
      cancelScheduledFeedRender,
      renderProducts,
      createProductCardElement,
      createProductCardStackElement,
      createProductGalleryElement,
      createDynamicShowcasePlaceholderElement,
      createShowcaseSectionElement,
      renderShowcaseTrack,
      repairShowcaseMediaVisibility,
      stabilizeMobileShowcaseRows
    };
  }

  window.WingaModules.marketplace.createMarketplaceUiModule = createMarketplaceUiModule;
})();
