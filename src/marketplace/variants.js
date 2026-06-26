(() => {
  function createVariantHelpers(deps = {}) {
    const getUniqueRenderableImageIndexes = typeof deps.getUniqueRenderableImageIndexes === "function"
      ? deps.getUniqueRenderableImageIndexes
      : () => [];
    const getRenderableMarketplaceImages = typeof deps.getRenderableMarketplaceImages === "function"
      ? deps.getRenderableMarketplaceImages
      : (product) => (Array.isArray(product?.images) ? product.images : [product?.image]).filter(Boolean);

    function getSmartVariantIndex(feedPosition = 0, variantCount = 1) {
      const safeVariantCount = Math.max(1, Number(variantCount || 1) || 1);
      const safeFeedPosition = Math.max(0, Number(feedPosition || 0) || 0);
      return safeFeedPosition % safeVariantCount;
    }

    function isVariantFeedEntry(item) {
      return Boolean(
        item?.feedVariantResurface
        || item?.resurfacedVariant
        || String(item?.feedEntryType || "").trim().toLowerCase() === "variant"
      );
    }

    function getFeedEntryDisplayImageIndex(item, feedPosition = 0) {
      const imageCount = Math.max(1, getUniqueRenderableImageIndexes(item).length || 1);
      if (!isVariantFeedEntry(item)) {
        const requestedIndex = Number(item?.feedInitialImageIndex ?? item?.visibleImageIndex ?? 0);
        return Number.isFinite(requestedIndex)
          ? Math.max(0, Math.min(imageCount - 1, requestedIndex))
          : 0;
      }
      const requestedIndex = Number(
        item?.visibleImageIndex
        ?? item?.feedInitialImageIndex
        ?? item?.variantDisplayIndex
      );
      if (Number.isFinite(requestedIndex) && requestedIndex >= 0) {
        return Math.max(0, Math.min(imageCount - 1, requestedIndex));
      }
      return getSmartVariantIndex(feedPosition, imageCount);
    }

    function getProductVariantCount(product) {
      const explicitCount = Number(product?.variantCount);
      if (Number.isFinite(explicitCount) && explicitCount > 0) {
        return Math.floor(explicitCount);
      }
      const variantArrayCount = Array.isArray(product?.variants)
        ? product.variants.length
        : (Array.isArray(product?.variations) ? product.variations.length : 0);
      if (variantArrayCount > 0) {
        return variantArrayCount;
      }
      return Math.max(1, getUniqueRenderableImageIndexes(product).length || 1);
    }

    function buildContinuousDiscoveryCandidateKey(item) {
      const productId = String(item?.id || item?.productId || "").trim();
      if (!productId) {
        return "";
      }
      if (isVariantFeedEntry(item)) {
        const visibleImageIndex = getFeedEntryDisplayImageIndex(item);
        return `variant:${productId}:${visibleImageIndex}`;
      }
      return `product:${productId}`;
    }

    function dedupeContinuousDiscoveryFeedItems(items = []) {
      const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!safeItems.length) {
        return [];
      }
      const seenKeys = new Set();
      const deduped = [];
      safeItems.forEach((item) => {
        const candidateKey = buildContinuousDiscoveryCandidateKey(item);
        if (!candidateKey || seenKeys.has(candidateKey)) {
          return;
        }
        seenKeys.add(candidateKey);
        deduped.push(item);
      });
      return deduped;
    }

    function reorderProductImagesForVariant(product, variantIndex = 1) {
      const images = getRenderableMarketplaceImages(product);
      if (images.length < 2) {
        return images;
      }
      const uniqueImages = Array.from(new Set(images.filter(Boolean)));
      if (uniqueImages.length < 2) {
        return uniqueImages;
      }
      const normalizedIndex = Math.max(1, Math.min(uniqueImages.length - 1, Number(variantIndex || 1)));
      const leadImage = uniqueImages[normalizedIndex];
      return [leadImage, ...uniqueImages.filter((image) => image !== leadImage)];
    }

    function getVariantInitialImageIndex(product, variantIndex = 1) {
      const uniqueImageIndexes = getUniqueRenderableImageIndexes(product);
      if (uniqueImageIndexes.length < 2) {
        return 0;
      }
      const normalizedIndex = Math.max(1, Math.min(uniqueImageIndexes.length - 1, Number(variantIndex || 1)));
      return uniqueImageIndexes[normalizedIndex] ?? 0;
    }

    function resolvePreferredVariantImageIndex(candidateIndexes = [], preferredIndex = -1) {
      const safeIndexes = Array.from(candidateIndexes || [])
        .map((index) => Number(index))
        .filter((index) => Number.isFinite(index) && index > 0)
        .sort((left, right) => left - right);
      if (!safeIndexes.length) {
        return -1;
      }
      const normalizedPreferredIndex = Number(preferredIndex);
      if (!Number.isFinite(normalizedPreferredIndex) || normalizedPreferredIndex < 1) {
        return safeIndexes[0];
      }
      if (safeIndexes.includes(normalizedPreferredIndex)) {
        return normalizedPreferredIndex;
      }
      return safeIndexes.find((index) => index >= normalizedPreferredIndex) ?? safeIndexes[safeIndexes.length - 1];
    }

    function shouldUseVariantScrollSlot(normalProductOrdinal = 0) {
      const safeOrdinal = Math.max(0, Number(normalProductOrdinal || 0) || 0);
      return safeOrdinal >= 15 && safeOrdinal % 15 === 0;
    }

    function getDeterministicVariantSlotIndex(candidateIndexes = [], options = {}) {
      const safeIndexes = Array.from(candidateIndexes || [])
        .map((index) => Number(index))
        .filter((index) => Number.isFinite(index) && index > 0);
      if (!safeIndexes.length) {
        return -1;
      }
      const deeperIndexes = safeIndexes.filter((index) => index >= 2);
      const pool = deeperIndexes.length ? deeperIndexes : safeIndexes;
      const seed = Math.max(
        0,
        Number(options.batchIndex || 0)
        + Number(options.normalProductOrdinal || 0)
        + Number(options.variationSwipeCount || 0)
        + Number(options.sequenceIndex || 0)
      );
      return pool[seed % pool.length] ?? pool[0] ?? -1;
    }

    function getStableVariantSelectionSeed(productId = "", options = {}) {
      const normalizedProductId = String(productId || "").trim();
      let productHash = 0;
      for (let index = 0; index < normalizedProductId.length; index += 1) {
        productHash = (productHash * 31 + normalizedProductId.charCodeAt(index)) % 104729;
      }
      return Math.max(
        0,
        productHash
        + Number(options.batchIndex || 0)
        + Number(options.normalProductOrdinal || 0)
        + Number(options.variationSwipeCount || 0)
        + Number(options.sequenceIndex || 0)
      );
    }

    return {
      getSmartVariantIndex,
      getFeedEntryDisplayImageIndex,
      getProductVariantCount,
      isVariantFeedEntry,
      buildContinuousDiscoveryCandidateKey,
      dedupeContinuousDiscoveryFeedItems,
      reorderProductImagesForVariant,
      getVariantInitialImageIndex,
      resolvePreferredVariantImageIndex,
      shouldUseVariantScrollSlot,
      getDeterministicVariantSlotIndex,
      getStableVariantSelectionSeed
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createVariantHelpers = createVariantHelpers;
})();
