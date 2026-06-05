(() => {
  function createImageLoaderModule(deps = {}) {
    const {
      sanitizeImageSource = (value) => String(value || "").trim(),
      isServiceWorkerRecoveryDisabled = () => false,
      getImageFallbackDataUri = () => ""
    } = deps;

    function normalizeImageCandidates(values = []) {
      const seen = new Set();
      return values
        .map((value) => sanitizeImageSource(value, ""))
        .filter(Boolean)
        .filter((value) => {
          if (seen.has(value)) {
            return false;
          }
          seen.add(value);
          return true;
        });
    }

    function collectOptionalFeedImageCandidates(product) {
      if (!product || typeof product !== "object") {
        return [];
      }
      const variants = product.imageVariants && typeof product.imageVariants === "object"
        ? product.imageVariants
        : {};
      return normalizeImageCandidates([
        product.feedImage,
        product.feedImageUrl,
        product.previewImage,
        product.previewImageUrl,
        product.preview,
        product.thumbnail,
        product.thumbnailUrl,
        product.thumb,
        product.thumbUrl,
        product.smallImage,
        product.smallImageUrl,
        product.imageThumb,
        product.imagePreview,
        variants.feed,
        variants.feedUrl,
        variants.preview,
        variants.previewUrl,
        variants.thumbnail,
        variants.thumbnailUrl,
        variants.thumb,
        variants.thumbUrl,
        variants.small,
        variants.smallUrl
      ]);
    }

    function getRenderableProductImages(product) {
      const sourceImages = Array.isArray(product?.images) && product.images.length > 0
        ? product.images.slice()
        : [product?.image];
      const safeImages = normalizeImageCandidates(sourceImages);
      if (safeImages.length > 0) {
        return safeImages;
      }
      return normalizeImageCandidates([getImageFallbackDataUri("WINGA")]);
    }

    function getProductImageCandidates(product) {
      const sourceImages = getRenderableProductImages(product);
      const preferredFeedImages = collectOptionalFeedImageCandidates(product);
      if (preferredFeedImages.length) {
        sourceImages.unshift(...preferredFeedImages);
      }

      const safeImages = normalizeImageCandidates(sourceImages);
      const preferredImageIndex = Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex);
      if (
        safeImages.length > 1
        && Number.isFinite(preferredImageIndex)
        && preferredImageIndex > 0
        && preferredImageIndex < safeImages.length
      ) {
        const preferredImage = safeImages[preferredImageIndex];
        safeImages.splice(preferredImageIndex, 1);
        safeImages.unshift(preferredImage);
      }
      return safeImages;
    }

    function canUseServiceWorkerImageWarmCache() {
      return !isServiceWorkerRecoveryDisabled();
    }

    return {
      collectOptionalFeedImageCandidates,
      getRenderableProductImages,
      getProductImageCandidates,
      canUseServiceWorkerImageWarmCache
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createImageLoaderModule = createImageLoaderModule;
})();
