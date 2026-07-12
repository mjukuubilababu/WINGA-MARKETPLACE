(() => {
  function createGalleryModule(deps = {}) {
    const {
      getRenderableMarketplaceImages = () => [],
      getImageFallbackDataUri = () => "",
      isVariantFeedEntry = () => false,
      normalizeProductFitMode = (value) => (String(value || "").trim().toLowerCase() === "contain" ? "contain" : "cover"),
      getProductFitMode = () => "cover",
      preloadImageSource = null,
      sanitizeImageSource = (value, fallback = "") => String(value || fallback || "").trim(),
      escapeHtml = (value) => String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;"),
      createProgressiveImage = null,
      bumpRuntimeDiagnostic = () => 0,
      getPerfNow = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()),
      getProductCardForEngagement = (node) => node?.closest?.(".product-card[data-open-product], .showcase-card[data-open-product], .seller-product-card[data-open-product], [data-product-card][data-open-product]"),
      normalizeProductIdValue = (value) => String(value || "").trim(),
      noteProductEngagementSignal = () => {},
      variationSwipeWeight = 12
    } = deps;

    function renderFallbackImageMarkup({
      src,
      alt,
      className,
      fallbackSrc,
      placeholderSrc,
      fitMode,
      attributes
    }) {
      const normalizedFitMode = normalizeProductFitMode(fitMode);
      const safeSrc = sanitizeImageSource(src, fallbackSrc);
      const effectiveFallbackSrc = fallbackSrc || safeSrc;
      const imageAttributes = {
        ...(attributes || {}),
        "data-fit-mode": normalizedFitMode,
        "data-progressive-full": "true",
        "data-fallback-src": effectiveFallbackSrc
      };
      const attrMarkup = Object.entries(attributes || {})
        .filter(([, value]) => value !== undefined && value !== null && value !== false)
        .map(([key, value]) => `${escapeHtml(key)}="${escapeHtml(String(value))}"`)
        .join(" ");
      const fullAttrMarkup = Object.entries(imageAttributes)
        .filter(([, value]) => value !== undefined && value !== null && value !== false)
        .map(([key, value]) => `${escapeHtml(key)}="${escapeHtml(String(value))}"`)
        .join(" ");
      return `
        <span class="progressive-image-shell fit-mode-${escapeHtml(normalizedFitMode)} is-loaded"
          data-progressive-image="true"
          data-fit-mode="${escapeHtml(normalizedFitMode)}"
          ${className ? `data-progressive-image-class="${escapeHtml(className)}"` : ""}>
          <img src="${escapeHtml(safeSrc)}"
            alt="${escapeHtml(alt)}"
            class="${escapeHtml(`progressive-image-full fit-mode-${normalizedFitMode}${className ? ` ${className}` : ""}`)}"
            ${fullAttrMarkup || attrMarkup}>
        </span>
      `;
    }

    function renderFeedGalleryMarkup(product, surface = "feed", options = {}) {
      const safeImages = getRenderableMarketplaceImages(product);
      const images = safeImages.length > 0 ? safeImages : [getImageFallbackDataUri("WINGA")];
      const total = images.length;
      const isVariantEntry = isVariantFeedEntry(product);
      const requestedInitialIndex = Number(
        options?.initialImageIndex
        ?? (isVariantEntry
          ? (product?.visibleImageIndex ?? product?.feedInitialImageIndex ?? product?.variantDisplayIndex)
          : (product?.feedInitialImageIndex ?? product?.visibleImageIndex))
        ?? 0
      );
      const initialImageIndex = total > 1
        ? Math.max(0, Math.min(total - 1, Number.isFinite(requestedInitialIndex) ? requestedInitialIndex : 0))
        : 0;
      const currentLabel = total > 1 ? `${initialImageIndex + 1}/${total}` : "";
      const priorityLimit = Math.max(0, Number(options?.priorityCount ?? 0) || 0);
      const shouldUseEagerPrimaryImage = Boolean(options?.preload);
      const normalizedSurface = String(surface || "").trim().toLowerCase() || "feed";
      const isFeedSurface = normalizedSurface === "feed";
      const isDetailSurface = normalizedSurface === "detail";
      const isDetailContinuationSurface = normalizedSurface === "detail-continuation";
      const shouldForceDirectVisibility = Boolean(options?.directVisibility || isFeedSurface);
      const useCarouselSurface = isFeedSurface || isDetailSurface || isDetailContinuationSurface;
      const usesFeedMediaFit = isFeedSurface || isDetailContinuationSurface;
      const fitMode = usesFeedMediaFit
        ? "contain"
        : normalizeProductFitMode(options?.fitMode || getProductFitMode(product));
      const stableFrameRatio = usesFeedMediaFit
        ? "4 / 5"
        : "";
      if (options?.preload && typeof preloadImageSource === "function") {
        images.slice(0, Math.min(images.length, 1, priorityLimit)).forEach((src, index) => {
          preloadImageSource(src, {
            fetchPriority: index === 0 ? "high" : "auto",
            decodeInMemory: false,
            reason: "feed_gallery_startup_priority"
          });
        });
      }
      if (!useCarouselSurface) {
        const previewSrc = sanitizeImageSource(String(images[initialImageIndex] || images[0] || "").trim(), getImageFallbackDataUri("WINGA"));
        return `
          <div class="product-gallery media-gallery feed-gallery-preview showcase-media-preview feed-gallery-preview-single fit-mode-${escapeHtml(fitMode)}"
            data-feed-gallery-surface="${escapeHtml(normalizedSurface || "discovery")}"
            data-fit-mode="${escapeHtml(fitMode)}">
            ${renderFallbackImageMarkup({
              src: previewSrc,
              alt: `${product?.name || product?.shop || "Product image"} 1`,
              className: "feed-gallery-image feed-gallery-image-social showcase-preview-image",
              fallbackSrc: getImageFallbackDataUri("WINGA"),
              placeholderSrc: getImageFallbackDataUri("W"),
              fitMode,
              attributes: {
                loading: "lazy",
                fetchpriority: "auto",
                decoding: "async",
                draggable: "false",
                "data-preserve-image-ratio": "true",
                "data-marketplace-scroll-image": "true",
                "data-fallback-src": getImageFallbackDataUri("WINGA"),
                ...(shouldForceDirectVisibility ? { "data-direct-visibility": "true" } : {})
              }
            })}
            ${currentLabel ? `<span class="feed-gallery-count-badge product-gallery-count-badge">${currentLabel}</span>` : ""}
          </div>
        `;
      }
      const slides = images.map((src, index) => {
        const safeSrc = sanitizeImageSource(String(src || "").trim(), getImageFallbackDataUri("WINGA"));
        return `
          <div class="feed-gallery-carousel-slide feed-gallery-tile" data-feed-gallery-slide="${index}">
            ${renderFallbackImageMarkup({
              src: safeSrc,
              alt: `${product?.name || product?.shop || "Product image"} ${index + 1}`,
              className: "feed-gallery-image feed-gallery-image-social",
              fallbackSrc: getImageFallbackDataUri("WINGA"),
              placeholderSrc: getImageFallbackDataUri("W"),
              fitMode,
              attributes: {
                loading: shouldUseEagerPrimaryImage && index === initialImageIndex ? "eager" : "lazy",
                fetchpriority: shouldUseEagerPrimaryImage && index === initialImageIndex ? "high" : "auto",
                decoding: "async",
                draggable: "false",
                "data-preserve-image-ratio": "true",
                "data-marketplace-scroll-image": "true",
                "data-feed-gallery-primary": index === initialImageIndex ? "true" : "false",
                "data-feed-gallery-image-src": safeSrc,
                "data-fallback-src": getImageFallbackDataUri("WINGA"),
                ...(shouldForceDirectVisibility ? { "data-direct-visibility": "true" } : {}),
                ...(index === initialImageIndex && priorityLimit > 0 ? { "data-image-priority": "startup-critical feed-primary" } : {})
              }
            })}
          </div>
        `;
      }).join("");

      return `
        <div class="product-gallery media-gallery feed-gallery-preview feed-gallery-carousel fit-mode-${escapeHtml(fitMode)}"
          data-feed-gallery-carousel="true"
          data-feed-gallery-total="${total}"
          data-feed-gallery-current="${initialImageIndex + 1}"
          data-feed-gallery-initial-index="${initialImageIndex}"
          data-feed-gallery-surface="${escapeHtml(normalizedSurface || "feed")}"
          ${stableFrameRatio ? `data-feed-gallery-stable-ratio="${escapeHtml(stableFrameRatio)}"` : ""}
          data-feed-gallery-stable-fit-mode="${escapeHtml(fitMode)}"
          data-fit-mode="${escapeHtml(fitMode)}"
          ${usesFeedMediaFit ? `style="--fit-media-aspect-ratio:${escapeHtml(stableFrameRatio)};--feed-gallery-fit-mode:${escapeHtml(fitMode)}"` : ""}>
          <div class="feed-gallery-carousel-track" data-feed-gallery-track>
            ${slides}
          </div>
          ${currentLabel ? `<span class="feed-gallery-count-badge" data-feed-gallery-count>${currentLabel}</span>` : ""}
        </div>
      `;
    }

    function disposeFeedGalleryBinding(carousel) {
      if (!(carousel instanceof Element)) {
        return;
      }
      bumpRuntimeDiagnostic("galleryDisposeCount");
      const cleanup = carousel.__wingaCleanup;
      if (typeof cleanup === "function") {
        try {
          cleanup();
        } catch (error) {
          // Ignore cleanup failures for detached carousel nodes.
        }
      }
      carousel.__wingaCleanup = null;
      carousel.dataset.feedGalleryBound = "false";
    }

    function bindFeedGalleryInteractions(scope = document) {
      if (!scope) {
        return;
      }
      bumpRuntimeDiagnostic("galleryBindCalls");

      scope.querySelectorAll("[data-feed-gallery-carousel]").forEach((carousel) => {
        if (carousel.dataset.feedGalleryBound === "true") {
          return;
        }
        disposeFeedGalleryBinding(carousel);

        const track = carousel.querySelector("[data-feed-gallery-track]");
        const badge = carousel.querySelector("[data-feed-gallery-count]");
        const preview = carousel.closest(".feed-gallery-preview");
        const isDetailCarousel = Boolean(carousel.closest("#product-detail-modal"));
        const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        const listenerOptions = abortController ? { signal: abortController.signal } : undefined;
        carousel.dataset.feedGalleryBound = "true";
        bumpRuntimeDiagnostic("galleryInitCount");
        if (!track) {
          return;
        }

        let pointerId = null;
        let pointerStartX = 0;
        let pointerStartY = 0;
        let pointerStartScrollLeft = 0;
        let lastPointerMoveX = 0;
        let lastPointerMoveTime = 0;
        let gestureVelocity = 0;
        let isDragging = false;
        let hasPointerCapture = false;
        let suppressClickUntil = 0;
        let resizeObserver = null;
        let initSyncTimer = 0;
        let lastTrackedIndex = 0;
        let variationSignalCount = 0;
        const initialGalleryIndex = Math.max(
          0,
          Math.min(
            Math.max(0, Number(carousel.dataset.feedGalleryTotal || 1) - 1),
            Number(carousel.dataset.feedGalleryInitialIndex || 0) || 0
          )
        );

        const clearDragState = () => {
          if (hasPointerCapture && pointerId != null) {
            track.releasePointerCapture?.(pointerId);
          }
          pointerId = null;
          isDragging = false;
          hasPointerCapture = false;
          track.classList.remove("is-dragging");
        };

        const beginDrag = () => {
          if (isDragging) {
            return;
          }
          isDragging = true;
          track.classList.add("is-dragging");
        };

        const isInteractiveTarget = (target) => target instanceof Element
          && Boolean(target.closest("button, a, input, select, textarea, label, [data-product-action]"));

        const syncAspectRatio = () => {
          if (!preview) {
            return;
          }
          const isFeedSurface = String(carousel.dataset.feedGallerySurface || "").trim().toLowerCase() === "feed";
          if (isFeedSurface) {
            const stableRatio = String(
              carousel.dataset.feedGalleryStableRatio
              || preview.dataset.feedGalleryStableRatio
              || "4 / 5"
            ).trim();
            const stableFitMode = String(
              carousel.dataset.feedGalleryStableFitMode
              || preview.dataset.feedGalleryStableFitMode
              || carousel.dataset.fitMode
              || preview.dataset.fitMode
              || "contain"
            ).trim().toLowerCase() === "contain" ? "contain" : "cover";
            const authorityImage = carousel.querySelector('[data-feed-gallery-primary="true"]')
              || carousel.querySelector('[data-feed-gallery-slide="0"] .feed-gallery-image-social');
            const ratioValue = stableRatio || "4 / 5";
            preview.dataset.fitMode = stableFitMode;
            carousel.dataset.fitMode = stableFitMode;
            preview.dataset.feedGalleryStableRatio = ratioValue;
            carousel.dataset.feedGalleryStableRatio = ratioValue;
            preview.style.setProperty("--fit-media-aspect-ratio", ratioValue);
            carousel.style.setProperty("--fit-media-aspect-ratio", ratioValue);
            const mediaFrame = carousel.closest(".product-card-media, .seller-product-card-media");
            if (mediaFrame instanceof HTMLElement) {
              mediaFrame.style.setProperty("--fit-media-aspect-ratio", ratioValue);
              mediaFrame.style.aspectRatio = ratioValue;
            }
            preview.style.removeProperty("--feed-gallery-frame-height");
            carousel.style.removeProperty("--feed-gallery-frame-height");
            preview.style.setProperty("--feed-gallery-fit-mode", stableFitMode);
            carousel.style.setProperty("--feed-gallery-fit-mode", stableFitMode);
            return;
          }
          const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
          const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
          const currentIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
          const authorityImage = isFeedSurface
            ? (carousel.querySelector('[data-feed-gallery-primary="true"]')
              || carousel.querySelector('[data-feed-gallery-slide="0"] .feed-gallery-image-social'))
            : null;
          const currentImage = authorityImage
            || carousel.querySelector(`[data-feed-gallery-slide="${currentIndex}"] .feed-gallery-image-social`)
            || carousel.querySelector(".feed-gallery-carousel-slide .feed-gallery-image-social");
          if (!currentImage) {
            return;
          }
          const naturalWidth = Number(currentImage.naturalWidth || currentImage.width || 0);
          const naturalHeight = Number(currentImage.naturalHeight || currentImage.height || 0);
          if (!naturalWidth || !naturalHeight) {
            return;
          }
          const stableRatio = String(carousel.dataset.feedGalleryStableRatio || preview.dataset.feedGalleryStableRatio || "").trim();
          const stableFitMode = String(carousel.dataset.feedGalleryStableFitMode || preview.dataset.feedGalleryStableFitMode || "").trim();
          const shouldPreserveImageRatio = Boolean(
            carousel.closest("#products-container, #market-showcase, .product-detail-feed-stack")
          );
          const fitMode = isFeedSurface
            ? normalizeProductFitMode(stableFitMode || carousel.dataset.fitMode || preview.dataset.fitMode || "cover")
            : normalizeProductFitMode(carousel.dataset.fitMode || preview.dataset.fitMode || "cover");
          const ratioValue = isFeedSurface
            ? (stableRatio || "4 / 5")
            : ((shouldPreserveImageRatio || fitMode === "contain")
              ? `${naturalWidth} / ${naturalHeight}`
              : "1 / 1");
          if (isFeedSurface) {
            carousel.dataset.feedGalleryStableRatio = ratioValue;
            preview.dataset.feedGalleryStableRatio = ratioValue;
            carousel.dataset.feedGalleryStableFitMode = fitMode;
            preview.dataset.feedGalleryStableFitMode = fitMode;
          }
          preview.dataset.fitMode = fitMode;
          carousel.dataset.fitMode = fitMode;
          preview.style.setProperty("--fit-media-aspect-ratio", ratioValue);
          preview.style.setProperty("--feed-gallery-fit-mode", fitMode);
          carousel.style.setProperty("--fit-media-aspect-ratio", ratioValue);
          carousel.style.setProperty("--feed-gallery-fit-mode", fitMode);
        };

        const syncBadge = () => {
          const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
          const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
          const currentIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
          const nextLabel = `${currentIndex + 1}/${total}`;
          carousel.dataset.feedGalleryCurrent = String(currentIndex + 1);
          if (badge && badge.textContent !== nextLabel) {
            badge.textContent = nextLabel;
          }
          return currentIndex;
        };

        const recordVariationInterestIfNeeded = (currentIndex) => {
          const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
          if (total <= 1 || currentIndex <= 0 || currentIndex === lastTrackedIndex || variationSignalCount >= 2) {
            lastTrackedIndex = currentIndex;
            return;
          }
          const card = getProductCardForEngagement(carousel);
          const productId = normalizeProductIdValue(card?.dataset.openProduct || card?.dataset.productCard || "");
          if (productId) {
            noteProductEngagementSignal(productId, "variation_swipe", variationSwipeWeight);
            variationSignalCount += 1;
          }
          lastTrackedIndex = currentIndex;
        };

        const snapToNearestSlide = (behavior = "auto") => {
          const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
          const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
          const nextIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
          const targetLeft = nextIndex * width;
          if (Math.abs(track.scrollLeft - targetLeft) < 1) {
            return;
          }
          if (behavior === "smooth" && typeof track.scrollTo === "function") {
            track.scrollTo({ left: targetLeft, behavior: "smooth" });
            return;
          }
          track.scrollLeft = targetLeft;
        };

        const settleDetailCarousel = () => {
          if (!isDetailCarousel) {
            snapToNearestSlide("smooth");
            return;
          }
          const total = Math.max(1, Number(carousel.dataset.feedGalleryTotal || track.querySelectorAll("[data-feed-gallery-slide]").length || 1));
          const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
          const baseIndex = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / width)));
          const velocityAbs = Math.abs(Number(gestureVelocity || 0));
          let targetIndex = baseIndex;
          if (velocityAbs >= 0.32) {
            const jump = Math.min(3, Math.max(1, Math.round(velocityAbs / 0.55)));
            targetIndex = baseIndex + (gestureVelocity < 0 ? jump : -jump);
          }
          targetIndex = Math.min(total - 1, Math.max(0, targetIndex));
          const targetLeft = targetIndex * width;
          if (typeof track.scrollTo === "function") {
            track.scrollTo({ left: targetLeft, behavior: "smooth" });
            return;
          }
          track.scrollLeft = targetLeft;
        };

        let rafId = 0;
        const scheduleSync = () => {
          if (rafId) {
            return;
          }
          rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            const currentIndex = syncBadge();
            recordVariationInterestIfNeeded(currentIndex);
            syncAspectRatio();
          });
        };

        const cleanup = () => {
          if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
          }
          if (initSyncTimer) {
            window.clearTimeout(initSyncTimer);
            initSyncTimer = 0;
          }
          if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
          }
          clearDragState();
          abortController?.abort();
        };
        carousel.__wingaCleanup = cleanup;

        track.addEventListener("scroll", scheduleSync, { passive: true, ...(listenerOptions || {}) });
        track.addEventListener("touchend", scheduleSync, { passive: true, ...(listenerOptions || {}) });
        track.addEventListener("touchcancel", scheduleSync, { passive: true, ...(listenerOptions || {}) });
        track.addEventListener("click", (event) => {
          if (suppressClickUntil && Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, { capture: true, ...(listenerOptions || {}) });
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            scheduleSync();
          });
          resizeObserver.observe(carousel);
        }
        const firstImage = carousel.querySelector(".feed-gallery-carousel-slide .feed-gallery-image-social");
        if (firstImage) {
          if (firstImage.complete && (firstImage.naturalWidth || firstImage.width) && (firstImage.naturalHeight || firstImage.height)) {
            syncAspectRatio();
          } else {
            firstImage.addEventListener("load", syncAspectRatio, { once: true, ...(listenerOptions || {}) });
          }
        }
        initSyncTimer = window.setTimeout(() => {
          initSyncTimer = 0;
          const width = Math.max(1, track.clientWidth || carousel.clientWidth || 1);
          if (initialGalleryIndex > 0) {
            track.scrollLeft = initialGalleryIndex * width;
          }
          syncAspectRatio();
          lastTrackedIndex = syncBadge();
        }, 0);

        if (typeof PointerEvent !== "undefined") {
          track.addEventListener("pointerdown", (event) => {
            if (track.scrollWidth <= track.clientWidth + 4 || isInteractiveTarget(event.target)) {
              return;
            }
            if (event.pointerType === "touch") {
              return;
            }
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            pointerId = event.pointerId;
            pointerStartX = event.clientX;
            pointerStartY = event.clientY;
            pointerStartScrollLeft = track.scrollLeft;
            lastPointerMoveX = event.clientX;
            lastPointerMoveTime = getPerfNow();
            gestureVelocity = 0;
            isDragging = false;
            track.setPointerCapture?.(event.pointerId);
            hasPointerCapture = true;
          }, listenerOptions);

          track.addEventListener("pointermove", (event) => {
            if (pointerId !== event.pointerId) {
              return;
            }
            const deltaX = event.clientX - pointerStartX;
            const deltaY = event.clientY - pointerStartY;
            if (!isDragging) {
              if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY) + 4) {
                return;
              }
              beginDrag();
            }
            if (event.cancelable) {
              event.preventDefault();
            }
            track.scrollLeft = pointerStartScrollLeft - deltaX;
            const now = getPerfNow();
            const elapsed = Math.max(1, now - Number(lastPointerMoveTime || now));
            gestureVelocity = (event.clientX - Number(lastPointerMoveX || event.clientX)) / elapsed;
            lastPointerMoveX = event.clientX;
            lastPointerMoveTime = now;
          }, listenerOptions);

          track.addEventListener("pointerup", (event) => {
            if (pointerId !== event.pointerId) {
              return;
            }
            if (isDragging) {
              suppressClickUntil = Date.now() + 220;
            }
            clearDragState();
            settleDetailCarousel();
            scheduleSync();
          }, listenerOptions);

          track.addEventListener("pointercancel", (event) => {
            if (pointerId !== event.pointerId) {
              return;
            }
            clearDragState();
            settleDetailCarousel();
            scheduleSync();
          }, listenerOptions);

          track.addEventListener("lostpointercapture", () => {
            clearDragState();
            settleDetailCarousel();
            scheduleSync();
          }, listenerOptions);
        }
      });
    }

    return {
      renderFeedGalleryMarkup,
      disposeFeedGalleryBinding,
      bindFeedGalleryInteractions
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createGalleryModule = createGalleryModule;
})();
