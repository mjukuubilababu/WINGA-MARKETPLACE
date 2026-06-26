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
      createProgressiveImage = null
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
      if (typeof createProgressiveImage === "function") {
        return createProgressiveImage({
          src,
          alt,
          className,
          fallbackSrc,
          placeholderSrc,
          fitMode,
          attributes
        }).outerHTML;
      }
      const attrMarkup = Object.entries(attributes || {})
        .filter(([, value]) => value !== undefined && value !== null && value !== false)
        .map(([key, value]) => `${escapeHtml(key)}="${escapeHtml(String(value))}"`)
        .join(" ");
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="${escapeHtml(className)}" data-fit-mode="${escapeHtml(fitMode)}" ${attrMarkup}>`;
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
      const storedAspectRatio = Number(product?.imageAspectRatios?.[initialImageIndex] || 0);
      const hasStoredAspectRatio = Number.isFinite(storedAspectRatio) && storedAspectRatio > 0.2 && storedAspectRatio < 5;
      const fitMode = isFeedSurface
        ? "contain"
        : normalizeProductFitMode(options?.fitMode || getProductFitMode(product));
      const stableFrameRatio = isFeedSurface
        ? (hasStoredAspectRatio ? String(Number(storedAspectRatio.toFixed(6))) : "4 / 5")
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
          <div class="feed-gallery-carousel-slide" data-feed-gallery-slide="${index}">
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
          ${isFeedSurface ? `style="--fit-media-aspect-ratio:${escapeHtml(stableFrameRatio)};--feed-gallery-fit-mode:${escapeHtml(fitMode)}"` : ""}>
          <div class="feed-gallery-carousel-track" data-feed-gallery-track>
            ${slides}
          </div>
          ${currentLabel ? `<span class="feed-gallery-count-badge" data-feed-gallery-count>${currentLabel}</span>` : ""}
        </div>
      `;
    }

    return {
      renderFeedGalleryMarkup
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createGalleryModule = createGalleryModule;
})();
