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
    const STARTUP_PRIORITY_CARD_COUNT = 4;
    const INITIAL_SYNC_FEED_BATCH_SIZE = 10;
    const BOOTSTRAP_SYNC_FEED_TARGET_COUNT = 16;
    const DESKTOP_PACKING_IMAGE_TIMEOUT_MS = 1600;
    const desktopPackingDimensionCache = new Map();
    const desktopPackingProbeInflight = new Map();
    let scheduledFeedRenderState = {
      token: 0,
      timer: 0
    };
    const FEED_RENDER_BATCH_SIZE = 10;
    const FEED_RENDER_BATCH_DELAY_MS = 12;
    const MOBILE_HOME_INITIAL_FEED_LIMIT = 12;

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
      const limit = Math.max(STARTUP_PRIORITY_CARD_COUNT * 2, (deps.getProductsPerRow?.() || 2) * 4);
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
        deps.preloadImageSource(safeSrc, {
          fetchPriority: seen.size <= 2 ? "high" : "auto",
          decodeInMemory: false,
          reason: "marketplace_startup_above_fold"
        });
      });
    }

    function classifyProductImageShape(ratio = 1) {
      if (!Number.isFinite(ratio) || ratio <= 0) {
        return "normal";
      }
      if (ratio <= 0.82) {
        return "tall";
      }
      if (ratio >= 1.28) {
        return "wide";
      }
      return "normal";
    }

    function getProductPackingDimensionFallback(product) {
      const fitMode = String(product?.fitMode || "").trim().toLowerCase();
      if (fitMode === "contain") {
        return {
          width: 1,
          height: 1,
          ratio: 1,
          shape: "normal",
          source: "fit_mode_fallback"
        };
      }
      return {
        width: 1,
        height: 1,
        ratio: 1,
        shape: "normal",
        source: "default_fallback"
      };
    }

    function getProductPackingImageSrc(product) {
      const resolvedSrc = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product, {
            allowOwnerVisibility: product?.uploadedBy === deps.getCurrentUser?.()
          })
        : deps.sanitizeImageSource?.(
          product?.image || (Array.isArray(product?.images) ? product.images[0] : ""),
          deps.getImageFallbackDataUri?.("WINGA")
        );
      return String(resolvedSrc || "").trim();
    }

    function inspectProductPackingDimensions(product) {
      const fallback = getProductPackingDimensionFallback(product);
      const src = getProductPackingImageSrc(product);
      if (!src) {
        return Promise.resolve(fallback);
      }
      if (desktopPackingDimensionCache.has(src)) {
        return Promise.resolve(desktopPackingDimensionCache.get(src));
      }
      if (desktopPackingProbeInflight.has(src)) {
        return desktopPackingProbeInflight.get(src);
      }
      const probePromise = new Promise((resolve) => {
        let settled = false;
        const finalize = (payload) => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          const safePayload = {
            width: Number(payload?.width || fallback.width || 1),
            height: Number(payload?.height || fallback.height || 1),
            ratio: Number(payload?.ratio || fallback.ratio || 1),
            shape: payload?.shape || classifyProductImageShape(payload?.ratio || fallback.ratio || 1),
            source: payload?.source || "inspected"
          };
          desktopPackingDimensionCache.set(src, safePayload);
          desktopPackingProbeInflight.delete(src);
          resolve(safePayload);
        };
        const image = new Image();
        const timeoutId = window.setTimeout(() => {
          finalize({
            ...fallback,
            source: "timeout_fallback"
          });
        }, DESKTOP_PACKING_IMAGE_TIMEOUT_MS);
        image.decoding = "async";
        image.loading = "eager";
        image.onload = () => {
          const width = Number(image.naturalWidth || 0);
          const height = Number(image.naturalHeight || 0);
          if (width > 0 && height > 0) {
            const ratio = width / height;
            finalize({
              width,
              height,
              ratio,
              shape: classifyProductImageShape(ratio),
              source: "natural"
            });
            return;
          }
          finalize({
            ...fallback,
            source: "empty_natural_fallback"
          });
        };
        image.onerror = () => {
          finalize({
            ...fallback,
            source: "error_fallback"
          });
        };
        image.src = src;
      });
      desktopPackingProbeInflight.set(src, probePromise);
      return probePromise;
    }

    async function buildPackedDesktopProductList(list = [], options = {}) {
      const safeList = Array.isArray(list) ? list.filter(Boolean) : [];
      if (!safeList.length) {
        return safeList;
      }
      const isMobileViewport = options.isMobileViewport === true;
      const layoutMode = String(options.layoutMode || "").trim().toLowerCase();
      const productsPerRow = Math.max(2, Number(options.productsPerRow || 0) || 0);
      if (isMobileViewport || productsPerRow < 2 || layoutMode !== "desktop") {
        return safeList;
      }
      const inspected = await Promise.all(
        safeList.map(async (product, index) => ({
          product,
          index,
          dimensions: await inspectProductPackingDimensions(product)
        }))
      );
      const rows = [];
      const remaining = inspected.slice();
      while (remaining.length) {
        const anchor = remaining.shift();
        const row = [anchor];
        const canUseCandidate = (candidate) => {
          if (!candidate) {
            return false;
          }
          const candidateShape = candidate.dimensions?.shape || "normal";
          return !row.some((entry) => {
            const rowShape = entry.dimensions?.shape || "normal";
            return (rowShape === "tall" && candidateShape === "wide")
              || (rowShape === "wide" && candidateShape === "tall");
          });
        };
        while (row.length < productsPerRow && remaining.length) {
          const anchorRatio = Number(anchor.dimensions?.ratio || 1);
          let bestIndex = -1;
          let bestScore = Number.POSITIVE_INFINITY;
          remaining.forEach((candidate, candidateIndex) => {
            if (!canUseCandidate(candidate)) {
              return;
            }
            const candidateRatio = Number(candidate.dimensions?.ratio || 1);
            const ratioDistance = Math.abs(candidateRatio - anchorRatio);
            const shapePenalty = candidate.dimensions?.shape === anchor.dimensions?.shape
              ? 0
              : candidate.dimensions?.shape === "normal" || anchor.dimensions?.shape === "normal"
                ? 0.35
                : 1.5;
            const indexPenalty = Math.abs(candidate.index - anchor.index) * 0.015;
            const score = ratioDistance + shapePenalty + indexPenalty;
            if (score < bestScore) {
              bestScore = score;
              bestIndex = candidateIndex;
            }
          });
          if (bestIndex === -1) {
            row.push(remaining.shift());
            continue;
          }
          row.push(remaining.splice(bestIndex, 1)[0]);
        }
        rows.push(row.sort((left, right) => left.index - right.index));
      }
      return rows.flat().map((entry) => entry.product);
    }

    function createProductGalleryElement(product, options = {}) {
      const startupPriority = options.startupPriority === true;
      const surface = String(options.surface || "feed").trim().toLowerCase() || "feed";
      if (deps.renderFeedGalleryMarkup) {
        return createElementFromMarkup(deps.renderFeedGalleryMarkup(product, surface, {
          priorityCount: startupPriority ? 1 : 0,
          preload: startupPriority,
          directVisibility: options.directVisibility === true
        }));
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
            loading: startupPriority && index === 0 ? "eager" : "lazy",
            fetchpriority: startupPriority && index === 0 ? "high" : "auto",
            draggable: "false",
            "data-preserve-image-ratio": "true",
            "data-marketplace-scroll-image": "true",
            "data-feed-gallery-image-src": safeSrc,
            ...(startupPriority && index === 0 ? { "data-image-priority": "startup-critical feed-primary" } : {})
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
      const productLiked = Boolean(deps.isProductSaved?.(product?.id));
      const canFollowSeller = Boolean(
        product?.uploadedBy
        && product.uploadedBy !== deps.getCurrentUser?.()
        && deps.canUseBuyerFeatures?.()
      );
      const canShareSeller = Boolean(product?.uploadedBy);
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
      if (sellerUser?.verifiedSeller) {
        avatarWrap.appendChild(createElement("span", {
          className: "product-seller-avatar-verified-badge",
          textContent: "✓",
          attributes: {
            "aria-label": "Verified seller",
            title: "Verified seller"
          }
        }));
      }

      const sellerCopy = createElement("div", { className: "product-seller-copy" });
      sellerCopy.append(
        createElement("strong", { className: "product-seller-name", textContent: getProductSellerLabel(product) })
      );

      const badgeRow = createElement("div", { className: "product-seller-badge-row product-seller-inline-actions" });
      badgeRow.appendChild(createElement("button", {
        className: `product-seller-inline-action product-seller-like-chip${productLiked ? " is-active" : ""}`,
        textContent: productLiked ? "♥ Like" : "♡ Like",
        attributes: {
          type: "button",
          "data-like-product": product.id || ""
        }
      }));
      if (canFollowSeller) {
        const followButton = createElement("button", {
          className: "product-seller-inline-action",
          textContent: deps.isSellerFollowed?.(product.uploadedBy) ? "Following" : "Follow",
          attributes: {
            type: "button",
            "data-follow-seller": product.uploadedBy || ""
          }
        });
        if (deps.isSellerFollowed?.(product.uploadedBy)) {
          followButton.classList.add("is-active");
        }
        badgeRow.appendChild(followButton);
      }
      if (canShareSeller) {
        badgeRow.appendChild(createElement("button", {
          className: "product-seller-inline-action",
          textContent: "Share",
          attributes: {
            type: "button",
            "data-share-seller-shop": product.uploadedBy || ""
          }
        }));
      }
      if (isOwnerSeller) {
        const promoteButton = createElement("button", {
          className: "product-seller-inline-action product-seller-promote-chip",
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
          "data-marketplace-scroll-image": "true",
          "data-preserve-image-ratio": "true",
          "data-direct-visibility": "true",
          "data-fallback-src": deps.getImageFallbackDataUri("WINGA")
        }
      }));
      return media;
    }

    function createIntelligentPreviewMediaElement(product) {
      const fitMode = String(product.fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
      const primaryImage = deps.getMarketplacePrimaryImage
        ? deps.getMarketplacePrimaryImage(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser?.()
          })
        : deps.sanitizeImageSource(product.image || (Array.isArray(product.images) ? product.images[0] : ""), deps.getImageFallbackDataUri("WINGA"));
      const media = createElement("div", {
        className: `product-card-media showcase-media intelligent-feed-media fit-mode-${fitMode}`,
        attributes: { "data-fit-mode": fitMode }
      });
      media.appendChild(createResponsiveImage({
        src: primaryImage,
        alt: product.name || "Product image",
        className: "intelligent-feed-image",
        fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
        attributes: {
          "data-disable-image-zoom": "true"
        }
      }));
      return media;
    }

    function isMobileShowcaseQueueViewport() {
      return Boolean(window.matchMedia?.("(max-width: 780px)")?.matches);
    }

    function hasHealthyShowcaseMedia(scope) {
      if (!(scope instanceof Element) && scope !== document) {
        return false;
      }
      const images = Array.from(scope.querySelectorAll?.(".showcase-card .feed-gallery-image-social, .showcase-card .showcase-preview-image, .showcase-card img") || []);
      return images.some((image) =>
        Boolean(
          image
          && String(image.currentSrc || image.src || "").trim()
          && (Number(image.naturalWidth || 0) > 0 || Number(image.clientWidth || 0) > 32)
        )
      );
    }

    function clearMobileShowcaseSectionPending(section) {
      if (!(section instanceof Element)) {
        return;
      }
      section.classList.remove("showcase-inline-pending");
      section.removeAttribute("data-mobile-section-pending");
      delete section.dataset.mobileSectionRevealScheduled;
    }

    function scheduleMobileShowcaseSectionReveal(section, options = {}) {
      if (!isMobileShowcaseQueueViewport() || !(section instanceof Element)) {
        clearMobileShowcaseSectionPending(section);
        return;
      }
      if (section.dataset.mobileSectionRevealScheduled === "true") {
        return;
      }
      section.dataset.mobileSectionRevealScheduled = "true";
      const maxWaitMs = Math.max(0, Number(options.maxWaitMs || 1200));
      const pollMs = Math.max(60, Number(options.pollMs || 120));
      const startedAt = Date.now();
      const attemptReveal = () => {
        if (!section.isConnected) {
          delete section.dataset.mobileSectionRevealScheduled;
          return;
        }
        if (hasHealthyShowcaseMedia(section) || Date.now() - startedAt >= maxWaitMs) {
          clearMobileShowcaseSectionPending(section);
          return;
        }
        window.setTimeout(attemptReveal, pollMs);
      };
      attemptReveal();
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
        }, isMobileShowcaseQueueViewport() ? 120 : 900);
      });
    }

    function stabilizeMobileShowcaseRows(scope = document) {
      const isMobileViewport = isMobileShowcaseQueueViewport();
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
            clearMobileShowcaseSectionPending(row);
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
          scheduleMobileShowcaseSectionReveal(row, {
            maxWaitMs: 1400,
            pollMs: 120
          });
        }, 180);
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
        const initialImageIndex = Number(
          openTrigger?.dataset?.openImageIndex
          || card.dataset.openImageIndex
          || product?.feedInitialImageIndex
          || 0
        ) || 0;
        if (product?.feedVariantResurface) {
          console.info("[WINGA] variant_card_click", {
            productId,
            initialImageIndex,
            cardClass: card.className
          });
        }
        if (!productId) {
          return;
        }
        if (
          event.target.closest(
            ".product-menu, .product-menu-popup, .product-menu-toggle, [data-menu-toggle], [data-menu-popup], [data-product-caption-toggle], [data-request-product], [data-chat-product], [data-open-own-messages], [data-open-product-whatsapp], [data-buy-product], [data-detail-repost], [data-promote-product], [data-follow-seller], [data-share-seller-shop], [data-like-product], .product-actions, .showcase-actions, .seller-product-actions, .product-seller-inline-actions"
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
            intent: { type: "focus-product", productId, initialImageIndex }
          });
          return;
        }

        if (product?.feedVariantResurface) {
          console.info("[WINGA] variant_card_open_detail", {
            productId,
            initialImageIndex
          });
        }
        deps.openProductDetailModal?.(productId, { initialImageIndex });
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

    function createProductCardElement(product, options = {}) {
      const startupPriority = options.startupPriority === true;
      const feedEntryType = String(product?.feedEntryType || (product?.feedVariantResurface ? "variant" : "product")).trim().toLowerCase();
      const stableProductId = String(product?.id || product?.productId || "").trim();
      const variantDisplayIndex = Number(product?.variantDisplayIndex ?? product?.visibleImageIndex ?? product?.feedInitialImageIndex ?? 0) || 0;
      const feedEntryKey = String(product?.feedEntryKey || (feedEntryType === "variant"
        ? `variant:${stableProductId}:${variantDisplayIndex}`
        : `product:${stableProductId}`)).trim();
      const feedSequenceIndex = Number(product?.feedSequenceIndex || 0) || 0;
      const stableInitialImageIndex = feedEntryType === "variant" ? variantDisplayIndex : 0;
      const card = createElement("article", {
        className: "product-card",
        attributes: {
          "data-product-card": product.id,
          "data-open-product": product.id,
          ...(feedEntryKey ? { "data-feed-entry-key": feedEntryKey } : {}),
          ...(feedEntryType ? { "data-feed-entry-type": feedEntryType } : {}),
          ...(feedSequenceIndex ? { "data-feed-sequence-index": String(feedSequenceIndex) } : {}),
          "data-open-image-index": String(stableInitialImageIndex),
          "data-mounted-initial-image-index": String(stableInitialImageIndex),
          ...(Number.isFinite(Number(product?.variantDisplayIndex)) ? { "data-variant-display-index": String(variantDisplayIndex) } : {}),
          ...(product?.feedVariantResurface ? { "data-feed-variant-card": "true" } : {}),
          ...(startupPriority ? { "data-startup-priority-card": "true" } : {}),
          "data-card-media-pending": "true"
        }
      });
      card.dataset.productCard = product.id;
      card.dataset.openProduct = product.id;
      if (feedEntryKey) {
        card.dataset.feedEntryKey = feedEntryKey;
      }
      if (feedEntryType) {
        card.dataset.feedEntryType = feedEntryType;
      }
      if (feedSequenceIndex) {
        card.dataset.feedSequenceIndex = String(feedSequenceIndex);
      }
      card.dataset.openImageIndex = String(stableInitialImageIndex);
      card.dataset.mountedInitialImageIndex = String(stableInitialImageIndex);
      if (Number.isFinite(Number(product?.variantDisplayIndex))) {
        card.dataset.variantDisplayIndex = String(variantDisplayIndex);
      }
      card.dataset.cardOpenBound = "false";
      if (product?.feedVariantResurface) {
        card.dataset.feedVariantCard = "true";
      }
      if (Array.isArray(product.images) && product.images.length > 1) {
        card.classList.add("has-gallery-count-badge");
      }
      const media = createElement("div", { className: "product-card-media" });
      media.appendChild(createProductGalleryElement(product, {
        startupPriority,
        directVisibility: options.directVisibility === true,
        surface: options.gallerySurface || "feed"
      }));
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
      content.appendChild(
        deps.createElementFromMarkup(
          deps.renderProductActionGroup(product, { requestLabel: "My Request" })
        )
      );
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
      safeItems.forEach((item, index) => stack.appendChild(createProductCardElement(item, {
        startupPriority: options.startupPriority === true && index < STARTUP_PRIORITY_CARD_COUNT,
        directVisibility: options.directVisibility === true,
        gallerySurface: options.gallerySurface || "feed"
      })));
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

    function createIntelligentFeedCardElement(product) {
      const card = createElement("article", {
        className: "product-card showcase-card intelligent-feed-card",
        attributes: {
          "data-intelligent-feed-card": product.id,
          "data-open-product": product.id
        }
      });
      card.dataset.intelligentFeedCard = product.id;
      card.dataset.openProduct = product.id;
      card.dataset.cardOpenBound = "false";
      if (Array.isArray(product.images) && product.images.length > 1) {
        card.classList.add("has-gallery-count-badge");
      }
      const media = createIntelligentPreviewMediaElement(product);
      const body = createElement("div", {
        className: "product-content product-content-simple product-content-social showcase-body intelligent-feed-body"
      });
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
          deps.renderProductActionGroup(product, {
            requestLabel: "My Request",
            extraClass: "showcase-actions showcase-actions-compact intelligent-feed-actions"
          })
        )
      );
      card.append(media, body);
      bindCardOpenHandler(card, product);
      return card;
    }

    function createIntelligentSectionElement(eyebrow, title, subtitle, items, type = "intelligent") {
      if (!Array.isArray(items) || !items.length) {
        return null;
      }
      const section = createElement("section", {
        className: "showcase-inline panel recommendation-strip intelligent-feed-section",
        attributes: { "data-recommendation-type": type }
      });
      if (isMobileShowcaseQueueViewport()) {
        section.classList.add("showcase-inline-pending");
        section.setAttribute("data-mobile-section-pending", "true");
      }
      const sectionHeading = deps.createSectionHeading({
        eyebrow: eyebrow || "For you",
        title: title || "Products picked for you",
        meta: subtitle || "Suggestions based on the current catalog"
      });
      section.appendChild(sectionHeading);
      const track = createElement("div", { className: "showcase-track intelligent-feed-track" });
      items.forEach((product) => track.appendChild(createIntelligentFeedCardElement(product)));
      section.appendChild(track);
      return section;
    }

    function createShowcaseSectionElement(items, index, heading = "Marketplace Picks", title = "Bidhaa kutoka maduka tofauti", subtitle = "Tembea kushoto au kulia kuona zaidi") {
      if (!items.length) {
        return null;
      }
      const section = createElement("section", {
        className: "showcase-inline panel",
        attributes: { "data-inline-showcase-section": index }
      });
      if (isMobileShowcaseQueueViewport()) {
        section.classList.add("showcase-inline-pending");
        section.setAttribute("data-mobile-section-pending", "true");
      }
      const sectionHeading = deps.createSectionHeading({
        eyebrow: heading,
        title,
        meta: subtitle
      });
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
      if (isMobileShowcaseQueueViewport()) {
        section.classList.add("showcase-inline-pending");
        section.setAttribute("data-mobile-section-pending", "true");
      }
      const sectionHeading = deps.createSectionHeading({
        eyebrow: title,
        title: subtitle,
        meta: "Suggestions based on the current catalog"
      });
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
      const minBatchIndex = normalizedType === "sponsored"
        ? 1
        : normalizedType === "related"
          ? 2
          : normalizedType === "you-may-like"
            ? 3
            : normalizedType === "trending"
              ? 4
              : 2;
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

    function buildHomeIntelligentSectionQueue(list, usedShowcaseProductIds = new Set()) {
      const safeList = Array.isArray(list) ? list.filter(Boolean) : [];
      const queue = [];
      const seenKinds = new Set();
      const pushDescriptor = (descriptor, variant = "recommendation") => {
        if (!descriptor || !Array.isArray(descriptor.items)) {
          return;
        }
        const safeItems = descriptor.items
          .filter(Boolean)
          .filter((item) => item?.id && !usedShowcaseProductIds.has(item.id));
        if (safeItems.length < 3) {
          return;
        }
        const key = String(descriptor.kind || descriptor.heading || descriptor.eyebrow || descriptor.title || variant)
          .trim()
          .toLowerCase();
        if (!key || seenKinds.has(key)) {
          return;
        }
        seenKinds.add(key);
        queue.push({
          ...descriptor,
          items: safeItems.slice(0, 12),
          variant
        });
      };

      const followingDescriptor = deps.getBehaviorShowcaseDescriptor?.(0, usedShowcaseProductIds);
      if (followingDescriptor?.heading === "Following") {
        pushDescriptor({
          kind: "following",
          heading: followingDescriptor.heading,
          title: followingDescriptor.title,
          subtitle: followingDescriptor.subtitle,
          items: followingDescriptor.items
        }, "showcase");
      }

      const seedProduct = deps.getRecommendationSeed?.(safeList) || safeList[0] || null;
      const related = deps.getRelatedProducts?.(seedProduct, 6) || [];
      const youMayLike = deps.getYouMayLikeProducts?.(seedProduct, 6) || [];
      const trending = deps.getTrendingProducts?.(8) || [];

      pushDescriptor(createRecommendationDescriptor(
        "Based on what you viewed",
        seedProduct ? `More in ${deps.getCategoryLabel(seedProduct.category)}` : "Similar picks",
        related,
        "related"
      ));
      pushDescriptor(createRecommendationDescriptor(
        "Most trending",
        "Most viewed and most interacted",
        trending,
        "trending"
      ));
      pushDescriptor(createRecommendationDescriptor(
        "Most casual",
        "Suggestions refreshed as you continue browsing",
        youMayLike,
        "you-may-like"
      ));

      return queue;
    }

    function buildLegacyShowcaseQueue(list, usedShowcaseProductIds = new Set()) {
      const sourceItems = Array.isArray(deps.getShowcaseProducts?.())
        ? deps.getShowcaseProducts()
        : (Array.isArray(list) ? list.filter(Boolean) : []);
      const safeItems = sourceItems
        .filter(Boolean)
        .filter((item) => item?.id && !usedShowcaseProductIds.has(item.id))
        .slice(0, 12);
      if (safeItems.length < 3) {
        return [];
      }
      return [{
        kind: "legacy-showcase",
        heading: "Marketplace Picks",
        title: "Bidhaa kutoka maduka tofauti",
        subtitle: "Tembea kushoto au kulia kuona zaidi",
        items: safeItems
      }];
    }

    function reportShowcaseInstrumentation(eventName, payload = {}) {
      if (typeof deps.reportShowcaseInstrumentation !== "function") {
        return;
      }
      deps.reportShowcaseInstrumentation(eventName, payload);
    }

    function buildFeedRetentionSignature(list, options = {}) {
      const safeList = Array.isArray(list) ? list : [];
      const currentView = String(options.currentView || "").trim().toLowerCase() || "unknown";
      const layoutMode = String(options.layoutMode || "").trim().toLowerCase() || "unknown";
      const signatureIds = safeList
        .slice(0, Math.min(safeList.length, 18))
        .map((product) => String(product?.id || "").trim())
        .filter(Boolean);
      return [
        currentView,
        layoutMode,
        String(safeList.length),
        signatureIds.join("|")
      ].join("::");
    }

    function renderProducts(list) {
      const productsContainer = deps.getProductsContainer();
      cancelScheduledFeedRender();
      if (!productsContainer) {
        return;
      }
      const currentView = deps.getCurrentView();
      const isBootingHomeFeed = currentView === "home" && document.body.classList.contains("app-booting");
      const layoutMode = String(deps.getLayoutMode?.() || "").trim().toLowerCase() || "desktop";
      const shouldTrackViews = currentView !== "upload";
      const legacyShowcaseEnabled = false;
      const intelligentFeedEnabled = currentView === "home";
      const isMobileViewport = layoutMode === "mobile" || layoutMode === "standalone-mobile" || layoutMode === "mobile-desktop-site";
      const shouldUseMobileEndlessHomeFeed = currentView === "home" && isMobileViewport;
      const shouldInjectInlineShowcases = intelligentFeedEnabled && !shouldUseMobileEndlessHomeFeed;
      const startupPriorityCardCount = isMobileViewport ? 4 : STARTUP_PRIORITY_CARD_COUNT;
      const initialSyncBatchSize = isMobileViewport ? 10 : INITIAL_SYNC_FEED_BATCH_SIZE;
      const bootstrapSyncFeedTargetCount = isMobileViewport ? 14 : BOOTSTRAP_SYNC_FEED_TARGET_COUNT;
      const productsPerRow = shouldInjectInlineShowcases ? (deps.getFeedLayoutColumns?.() || deps.getProductsPerRow()) : 0;
      const showcaseSpacing = isMobileViewport ? 8 : 10;
      const showcaseRepeatInterval = isMobileViewport ? 8 : 10;
      const firstShowcaseAfter = shouldInjectInlineShowcases ? showcaseSpacing : Number.POSITIVE_INFINITY;
      const effectiveShowcaseRepeatInterval = shouldInjectInlineShowcases ? showcaseRepeatInterval : Number.POSITIVE_INFINITY;
      let nextShowcaseInsertAt = firstShowcaseAfter;
      let showcaseIndex = 0;
      let insertedInlineShowcase = false;
      const usedShowcaseProductIds = new Set();
      const viewedProductIds = [];
      const passiveViewLimit = Math.max(4, (deps.getProductsPerRow?.() || 3));
      preloadMarketplaceImages(list);
      const renderToken = ++scheduledFeedRenderState.token;
      const legacySectionQueue = legacyShowcaseEnabled
        ? buildLegacyShowcaseQueue(list, usedShowcaseProductIds)
        : [];
      const intelligentSectionQueue = intelligentFeedEnabled
        ? buildHomeIntelligentSectionQueue(list, usedShowcaseProductIds)
        : [];
      const combinedSectionQueue = [...legacySectionQueue, ...intelligentSectionQueue];
      let intelligentSectionIndex = 0;

      const startRendering = (resolvedList) => {
        const sourceList = Array.isArray(resolvedList) ? resolvedList : list;
        const safeList = shouldUseMobileEndlessHomeFeed
          ? sourceList.slice(0, Math.min(MOBILE_HOME_INITIAL_FEED_LIMIT, sourceList.length))
          : sourceList;
        const retentionSignature = buildFeedRetentionSignature(safeList, {
          currentView,
          layoutMode
        });
        const hasExistingFeedSurface = Boolean(
          productsContainer.querySelector(".product-card[data-open-product], .seller-product-card[data-open-product]")
          || productsContainer.querySelector("[data-continuous-discovery-anchor='home']")
        );
        const canRetainExistingHomeFeed = currentView === "home"
          && !isBootingHomeFeed
          && hasExistingFeedSurface
          && String(productsContainer.dataset.feedRetentionSignature || "").trim() === retentionSignature;
        if (canRetainExistingHomeFeed) {
          deps.prioritizeVisibleFeedMedia?.(productsContainer, startupPriorityCardCount);
          deps.bindFeedGalleryInteractions?.(productsContainer);
          deps.bindImageFallbacks?.(productsContainer);
          deps.bindProductEngagementSignals?.(productsContainer);
          deps.bindProductMenus?.(productsContainer);
          return;
        }
        productsContainer.replaceChildren();
        productsContainer.dataset.feedRetentionSignature = retentionSignature;
        if (currentView === "home" && typeof deps.primeIncomingFeedItems === "function" && safeList.length > 0) {
          deps.primeIncomingFeedItems(
            safeList.slice(0, Math.min(safeList.length, startupPriorityCardCount + 6)),
            {
              reason: "home_initial_render_preprime",
              productLimit: Math.min(safeList.length, startupPriorityCardCount + 6),
              decodeLimit: Math.min(safeList.length, Math.max(startupPriorityCardCount + 2, 4))
            }
          );
        }

      const appendShowcaseIfNeeded = (fragment, renderedCount) => {
        if (!shouldInjectInlineShowcases || renderedCount !== nextShowcaseInsertAt || renderedCount >= safeList.length) {
          return;
        }
        while (intelligentSectionIndex < combinedSectionQueue.length) {
          const descriptor = combinedSectionQueue[intelligentSectionIndex];
          intelligentSectionIndex += 1;
          const safeItems = descriptor.items.filter((item) => item?.id && !usedShowcaseProductIds.has(item.id));
          if (safeItems.length < 3) {
            continue;
          }
          const showcaseElement = descriptor.kind === "legacy-showcase"
            ? createShowcaseSectionElement(
              safeItems,
              showcaseIndex + 1,
              descriptor.heading,
              descriptor.title,
              descriptor.subtitle
            )
            : createIntelligentSectionElement(
              descriptor.heading || descriptor.eyebrow,
              descriptor.title,
              descriptor.subtitle,
              safeItems,
              descriptor.kind || descriptor.variant || "intelligent"
            );
          if (!showcaseElement) {
            continue;
          }
          reportShowcaseInstrumentation(descriptor.kind === "legacy-showcase" ? "legacy_showcase_rendered" : "intelligent_section_rendered", {
            sectionIndex: showcaseIndex,
            kind: descriptor.kind || descriptor.heading || descriptor.eyebrow || "section",
            title: descriptor.title || "",
            itemCount: safeItems.length,
            source: descriptor.variant || "showcase"
          });
          safeItems.forEach((item) => usedShowcaseProductIds.add(item.id));
          fragment.appendChild(showcaseElement);
          deps.prioritizeVisibleFeedMedia?.(showcaseElement, Math.min(6, safeItems.length));
          showcaseIndex += 1;
          insertedInlineShowcase = true;
          break;
        }
        nextShowcaseInsertAt += effectiveShowcaseRepeatInterval;
      };

      const finalizeFeedRender = () => {
        if (renderToken !== scheduledFeedRenderState.token) {
          return;
        }
        if (shouldInjectInlineShowcases && !insertedInlineShowcase && safeList.length >= Math.max(4, productsPerRow * 2 || 4)) {
          const descriptor = combinedSectionQueue.find((entry) =>
            Array.isArray(entry?.items)
            && entry.items.some((item) => item?.id && !usedShowcaseProductIds.has(item.id))
          );
          if (descriptor) {
            const safeItems = descriptor.items.filter((item) => item?.id && !usedShowcaseProductIds.has(item.id));
            const showcaseElement = descriptor.kind === "legacy-showcase"
              ? createShowcaseSectionElement(
                safeItems,
                1,
                descriptor.heading,
                descriptor.title,
                descriptor.subtitle
              )
              : createIntelligentSectionElement(
                descriptor.heading || descriptor.eyebrow,
                descriptor.title,
                descriptor.subtitle,
                safeItems,
                descriptor.kind || descriptor.variant || "intelligent"
              );
            if (showcaseElement) {
              safeItems.forEach((item) => usedShowcaseProductIds.add(item.id));
              productsContainer.appendChild(showcaseElement);
              deps.prioritizeVisibleFeedMedia?.(showcaseElement, Math.min(6, safeItems.length));
            }
          }
        }

        if (deps.setDeferredRecommendationDescriptors) {
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
        if (intelligentFeedEnabled && currentView === "home" && safeList.length > 0 && deps.canUseContinuousDiscovery?.() && deps.setupContinuousDiscoveryLoading) {
          if (shouldUseMobileEndlessHomeFeed && typeof deps.createContinuousDiscoveryAnchorElement === "function") {
            const existingAnchor = productsContainer.querySelector("[data-continuous-discovery-anchor='home']");
            if (!existingAnchor) {
              productsContainer.appendChild(deps.createContinuousDiscoveryAnchorElement());
            }
          }
          const usedProductIds = new Set(safeList.map((product) => product.id));
          Array.from(productsContainer.querySelectorAll("[data-showcase-id], [data-open-product]")).forEach((element) => {
            if (String(element?.dataset?.feedEntryType || "").trim().toLowerCase() === "variant") {
              return;
            }
            const productId = element.dataset.showcaseId || element.dataset.openProduct || "";
            if (productId) {
              usedProductIds.add(productId);
            }
          });
          deps.setupContinuousDiscoveryLoading(productsContainer, {
            seedProduct: deps.getRecommendationSeed(list),
            usedProductIds,
            initialProductIds: safeList.map((product) => product.id).filter(Boolean)
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
        const batchSize = startIndex === 0 && currentView === "home"
          ? (isBootingHomeFeed
            ? Math.max(initialSyncBatchSize, Math.min(safeList.length, bootstrapSyncFeedTargetCount))
            : initialSyncBatchSize)
          : FEED_RENDER_BATCH_SIZE;
        const endIndex = Math.min(safeList.length, startIndex + batchSize);
        for (let index = startIndex; index < endIndex; index += 1) {
          const product = safeList[index];
          if (shouldTrackViews && index < passiveViewLimit && deps.trackView(product)) {
            viewedProductIds.push(product.id);
          }
          const isBatchPriorityCard = shouldUseMobileEndlessHomeFeed
            && startIndex > 0
            && index < startIndex + 2;
          fragment.appendChild(createProductCardElement(product, {
            startupPriority: currentView === "home" && (index < startupPriorityCardCount || isBatchPriorityCard)
          }));
          appendShowcaseIfNeeded(fragment, index + 1);
        }
        productsContainer.appendChild(fragment);
        if (startIndex === 0 && currentView === "home") {
          deps.prioritizeVisibleFeedMedia?.(productsContainer, Math.min(startupPriorityCardCount, endIndex));
        }
        deps.afterFeedBatchRender?.({
          container: productsContainer,
          startIndex,
          endIndex,
          total: safeList.length,
          currentView
        });
        if (endIndex < safeList.length) {
          if (currentView === "home" && typeof deps.primeIncomingFeedItems === "function") {
            deps.primeIncomingFeedItems(
              safeList.slice(endIndex, Math.min(safeList.length, endIndex + FEED_RENDER_BATCH_SIZE + 4)),
              {
                reason: `feed_batch_${endIndex}_preprime`,
                productLimit: Math.min(FEED_RENDER_BATCH_SIZE + 4, Math.max(0, safeList.length - endIndex)),
                decodeLimit: Math.min(6, Math.max(0, safeList.length - endIndex))
              }
            );
          }
          deps.onFeedRenderBatch?.({
            container: productsContainer,
            renderedCount: endIndex,
            total: safeList.length,
            currentView,
            products: safeList.slice(0, endIndex)
          });
          const scheduleNextBatch = () => {
            scheduledFeedRenderState.timer = 0;
            renderNextBatch(endIndex);
          };
          const nextBatchDelayMs = shouldUseMobileEndlessHomeFeed
            ? 0
            : (isBootingHomeFeed && startIndex === 0 ? 0 : FEED_RENDER_BATCH_DELAY_MS);
          scheduledFeedRenderState.timer = window.setTimeout(
            scheduleNextBatch,
            nextBatchDelayMs
          );
          return;
        }
        finalizeFeedRender();
      };

      renderNextBatch(0);
      };

      buildPackedDesktopProductList(list, {
        isMobileViewport,
        productsPerRow,
        layoutMode
      })
        .then((packedList) => {
          if (renderToken !== scheduledFeedRenderState.token) {
            return;
          }
          startRendering(packedList);
        })
        .catch(() => {
          if (renderToken !== scheduledFeedRenderState.token) {
            return;
          }
          startRendering(list);
        });
    }

    return {
      cancelScheduledFeedRender,
      renderProducts,
      createProductCardElement,
      createShowcaseProductCardElement,
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
