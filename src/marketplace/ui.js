(() => {
  function createMarketplaceUiModule(deps) {
    const {
      createElement,
      createFragmentFromMarkup,
      createResponsiveImage,
      createStatusPill
    } = deps;

    function schedulePassiveTask(callback) {
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => callback(), { timeout: 1200 });
        return;
      }
      window.setTimeout(callback, 180);
    }

    const passiveViewedProductQueue = new Set();
    let passiveViewedProductTrackingScheduled = false;
    const PASSIVE_VIEW_TRACK_BATCH_SIZE = 3;

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
              schedulePassiveViewedProductTracking([]);
            }
          });
      });
    }

    function createProductGalleryElement(product) {
      const safeImages = deps.getRenderableMarketplaceImages
        ? deps.getRenderableMarketplaceImages(product)
        : (Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image]).filter(Boolean);
      const firstImage = safeImages[0] || deps.getImageFallbackDataUri("WINGA");
      const gallery = createElement("div", {
        className: `product-gallery media-gallery feed-gallery-preview feed-gallery-count-${Math.min(Math.max(safeImages.length, 1), 4)}`
      });
      const previewImages = safeImages.length > 3 ? safeImages.slice(0, 3) : safeImages;
      const extraImageCount = Math.max(0, safeImages.length - previewImages.length);

      previewImages.forEach((image, index) => {
        const tile = createElement("button", {
          className: `feed-gallery-tile feed-gallery-tile-${index + 1}${extraImageCount > 0 && index === previewImages.length - 1 ? " has-more-overlay" : ""}`,
          attributes: {
            type: "button",
            "data-open-product": product.id,
            "data-feed-gallery-image": image,
            "data-feed-gallery-index": index,
            "data-feed-gallery-product": product.id,
            "aria-label": `${product.name || "Product"} image ${index + 1} of ${safeImages.length}`
          }
        });
        tile.appendChild(createResponsiveImage({
          src: image,
          alt: `${product.name || "Product"} ${index + 1}`,
          className: "feed-gallery-image",
          fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
          attributes: {
            "data-marketplace-scroll-image": "true",
            "data-image-action-product": product.id,
            "data-image-action-src": image,
            "data-image-action-surface": "feed",
            "data-disable-image-zoom": "true"
          }
        }));
        if (extraImageCount > 0 && index === previewImages.length - 1) {
          tile.appendChild(createElement("span", {
            className: "feed-gallery-more-badge",
            textContent: `+${extraImageCount}`
          }));
        }
        tile.addEventListener("click", (event) => {
          if (!tile.classList.contains("has-more-overlay")) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          deps.openImageLightbox(
            tile.dataset.feedGalleryImage || firstImage,
            product.name || "Product image",
            safeImages,
            {
              productId: product.id,
              surface: "feed",
              startIndex: Number(tile.dataset.feedGalleryIndex || 0)
            }
          );
        });
        gallery.appendChild(tile);
      });

      return gallery;
    }

    function createProductActionGroupElement(product) {
      return deps.createElementFromMarkup(
        deps.renderProductActionGroup(product, { requestLabel: "Add to My Requests" })
      );
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
      const media = createElement("div", { className: "product-card-media" });
      media.appendChild(createProductGalleryElement(product));
      card.appendChild(media);
      const overflowMenuMarkup = deps.renderProductOverflowMenu?.(product, { overlay: true });
      if (overflowMenuMarkup) {
        card.appendChild(createFragmentFromMarkup(overflowMenuMarkup));
      }

      const content = createElement("div", { className: "product-content product-content-simple" });
      const head = createElement("div", { className: "product-card-head" });
      head.appendChild(createElement("strong", {
        className: "product-price product-price-main",
        textContent: deps.formatProductPrice(product.price)
      }));
      if (product.availability === "sold_out") {
        head.appendChild(createStatusPill(deps.getStatusLabel("sold_out"), "sold_out"));
      }
      content.appendChild(head);
      content.appendChild(createElement("h3", {
        className: "product-title product-title-main",
        textContent: product.name || ""
      }));
      content.appendChild(createElement("p", {
        className: "product-category-line",
        textContent: deps.getCategoryLabel(product.category)
      }));
      const trustBadges = deps.renderMarketplaceTrustBadges?.(product, { hideVerifiedBadge: true });
      if (trustBadges) {
        content.appendChild(createFragmentFromMarkup(trustBadges));
      }
      content.appendChild(createProductActionGroupElement(product));
      card.appendChild(content);

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
      const media = createElement("div", { className: "showcase-media" });
      const primaryImage = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product)
        : (product.image || "");
      media.appendChild(createResponsiveImage({
        src: primaryImage,
        alt: product.name || "",
        fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
        attributes: {
          "data-marketplace-scroll-image": "true",
          "data-image-action-product": product.id,
          "data-image-action-src": primaryImage,
          "data-image-action-surface": "showcase"
        }
      }));
      const body = createElement("div", { className: "product-content product-content-simple showcase-body" });
      const overflowMenuMarkup = deps.renderProductOverflowMenu?.(product, { overlay: true });
      if (overflowMenuMarkup) {
        card.appendChild(createFragmentFromMarkup(overflowMenuMarkup));
      }
      const head = createElement("div", { className: "product-card-head" });
      head.appendChild(createElement("strong", {
        className: "product-price product-price-main showcase-price",
        textContent: deps.formatProductPrice(product.price)
      }));
      if (product.availability === "sold_out") {
        head.appendChild(createStatusPill(deps.getStatusLabel("sold_out"), "sold_out"));
      }
      body.append(
        head,
        createElement("h4", {
          className: "product-title product-title-main showcase-title",
          textContent: product.name || ""
        }),
        createElement("p", {
          className: "product-category-line showcase-category",
          textContent: deps.getCategoryLabel(product.category)
        })
      );
      const trustBadges = deps.renderMarketplaceTrustBadges?.(product, { hideVerifiedBadge: true });
      if (trustBadges) {
        body.appendChild(createFragmentFromMarkup(trustBadges));
      }
      body.append(
        deps.createElementFromMarkup(
          deps.renderProductActionGroup(product, { requestLabel: "Add to My Requests", extraClass: "showcase-actions" })
        )
      );
      card.append(media, body);
      card.dataset.showcaseClickBound = "true";
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
      const firstShowcaseAfter = shouldInjectInlineShowcases ? productsPerRow * 4 : Number.POSITIVE_INFINITY;
      const showcaseRepeatInterval = shouldInjectInlineShowcases ? productsPerRow * 5 : Number.POSITIVE_INFINITY;
      let nextShowcaseInsertAt = firstShowcaseAfter;
      let showcaseIndex = 0;
      let insertedInlineShowcase = false;
      const usedShowcaseProductIds = new Set();
      const maxDeferredShowcases = shouldInjectInlineShowcases
        ? Math.min(3, Math.max(0, Math.floor((Math.max(0, list.length - firstShowcaseAfter)) / Math.max(1, showcaseRepeatInterval))))
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
