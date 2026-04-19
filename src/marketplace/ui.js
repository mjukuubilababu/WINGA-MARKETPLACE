(() => {
  function createMarketplaceUiModule(deps) {
    const {
      createElement,
      createFragmentFromMarkup,
      createResponsiveImage,
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

    function createProductGalleryElement(product) {
      if (deps.renderFeedGalleryMarkup) {
        return createElementFromMarkup(deps.renderFeedGalleryMarkup(product, "feed"));
      }

      const safeImages = deps.getRenderableMarketplaceImages
        ? deps.getRenderableMarketplaceImages(product)
        : (Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]).filter(Boolean);
      const images = safeImages.length > 0 ? safeImages : [deps.getImageFallbackDataUri("WINGA")];
      const wrapper = createElement("div", {
        className: "product-gallery media-gallery feed-gallery-preview feed-gallery-carousel",
        attributes: {
          "data-feed-gallery-carousel": "true",
          "data-feed-gallery-total": String(images.length),
          "data-feed-gallery-current": "1",
          "data-feed-gallery-surface": "feed"
        }
      });
      const track = createElement("div", { className: "feed-gallery-carousel-track", attributes: { "data-feed-gallery-track": "true" } });
      images.forEach((src, index) => {
        const slide = createElement("div", {
          className: "feed-gallery-carousel-slide",
          attributes: { "data-feed-gallery-slide": String(index) }
        });
        const isFirstSlide = index === 0;
        slide.appendChild(createResponsiveImage({
          src,
          alt: `${product.name || "Product image"} ${index + 1}`,
          className: "feed-gallery-image feed-gallery-image-social",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
          attributes: {
            loading: isFirstSlide ? "eager" : "lazy",
            fetchpriority: isFirstSlide ? "high" : "auto",
            draggable: "false",
            "data-marketplace-scroll-image": "true"
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
      const sellerImage = String(sellerUser?.profileImage || "").trim();
      if (sellerImage) {
        avatarWrap.appendChild(createResponsiveImage({
          src: sellerImage,
          alt: getProductSellerLabel(product),
          className: "product-seller-avatar-image",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA")
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

      sellerRow.append(avatarWrap, sellerCopy, createElement("span", {
        className: "product-seller-badge",
        textContent: "Verified"
      }));
      return sellerRow;
    }

    function createProductActionGroupElement(product) {
      return deps.createElementFromMarkup(
        deps.renderProductActionGroup(product, { requestLabel: "Add to My Requests" })
      );
    }

    function createShowcasePreviewMediaElement(product) {
      const media = createElement("div", { className: "product-card-media showcase-media" });
      if (deps.renderFeedGalleryMarkup) {
        media.appendChild(createElementFromMarkup(deps.renderFeedGalleryMarkup(product, "discovery")));
        return media;
      }

      const primaryImage = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
          })
        : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
      media.appendChild(createResponsiveImage({
        src: primaryImage,
        alt: product.name || "Product image",
        fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
        className: "showcase-preview-image",
        attributes: {
          "data-marketplace-scroll-image": "true"
        }
      }));
      return media;
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
            ".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages], [data-buy-product], .product-actions, .showcase-actions, .seller-product-actions"
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
      content.appendChild(createProductActionGroupElement(product));
      card.appendChild(content);
      bindCardOpenHandler(card, product);

      return card;
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
          deps.renderProductActionGroup(product, { requestLabel: "Request", extraClass: "showcase-actions showcase-actions-compact" })
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
      section.appendChild(deps.createSectionHeading({
        eyebrow: heading,
        title,
        meta: subtitle
      }));
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
      section.appendChild(deps.createSectionHeading({
        eyebrow: title,
        title: subtitle,
        meta: "Suggestions based on the current catalog"
      }));
      const track = createElement("div", { className: "showcase-track" });
      items.forEach((product) => track.appendChild(createShowcaseProductCardElement(product)));
      section.appendChild(track);
      return section;
    }

    function renderProducts(list) {
      const productsContainer = deps.getProductsContainer();
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
      const fragment = document.createDocumentFragment();
      const viewedProductIds = [];
      const passiveViewLimit = Math.max(4, (deps.getProductsPerRow?.() || 3));

      list.forEach((product, index) => {
        if (shouldTrackViews && index < passiveViewLimit && deps.trackView(product)) {
          viewedProductIds.push(product.id);
        }

        fragment.appendChild(createProductCardElement(product));
        const renderedCount = index + 1;
        if (shouldInjectInlineShowcases && renderedCount === nextShowcaseInsertAt && renderedCount < list.length) {
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
        }
      });

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
          fragment.appendChild(showcaseElement);
        }
      }

      if (currentView === "home" && list.length > 0 && deps.canUseContinuousDiscovery?.()) {
        const seedProduct = deps.getRecommendationSeed(list);
        const related = deps.getRelatedProducts(seedProduct, 6);
        const youMayLike = deps.getYouMayLikeProducts(seedProduct, 6);
        const trending = deps.getTrendingProducts(8);
        [
          createRecommendationSectionElement("Related Products", seedProduct ? `More in ${deps.getCategoryLabel(seedProduct.category)}` : "Similar picks", related, "related"),
          createRecommendationSectionElement("You May Like", "Based on what you are viewing", youMayLike, "you-may-like"),
          createRecommendationSectionElement("Trending", "Most viewed and most interacted", trending, "trending")
        ].filter(Boolean).forEach((section) => fragment.appendChild(section));
        if (deps.createContinuousDiscoveryAnchorElement) {
          fragment.appendChild(deps.createContinuousDiscoveryAnchorElement());
        }
      }

      productsContainer.replaceChildren(fragment);

      if (shouldInjectInlineShowcases) {
        deps.bindShowcaseCardClicks(productsContainer);
        deps.setupDynamicShowcaseLoading(productsContainer, usedShowcaseProductIds);
      }
      deps.bindFeedGalleryInteractions?.(productsContainer);
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
    }

    return {
      renderProducts,
      createProductGalleryElement,
      createDynamicShowcasePlaceholderElement,
      createShowcaseSectionElement,
      renderShowcaseTrack
    };
  }

  window.WingaModules.marketplace.createMarketplaceUiModule = createMarketplaceUiModule;
})();
