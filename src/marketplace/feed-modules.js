(() => {
  function createFeedModuleComposer(deps = {}) {
    const config = {
      firstPlacementAfter: 8,
      placementInterval: 10,
      maxModules: 3,
      maxItems: 8,
      minimumOrganicItems: 1,
      minimumSponsoredItems: 1,
      ...deps.config
    };
    const renderedCounts = new Map();
    const recentItemIds = new Set();
    const t = (key, fallbackText) => typeof deps.translate === "function" ? deps.translate(key, {}, fallbackText) : fallbackText;

    function report(eventName, payload = {}) {
      try {
        deps.reportEvent?.(eventName, payload);
      } catch (_) {
        // Feed modules must never block the canonical feed.
      }
    }

    function normalizeId(value) {
      return String(value || "").trim();
    }

    function isReadyVideoProduct(product) {
      return (Array.isArray(product?.mediaItems) ? product.mediaItems : []).some((item) =>
        item?.type === "video"
        && item?.status === "ready"
        && item?.moderationStatus !== "rejected"
        && item?.provider === "cloudflare-stream"
        && /^[a-zA-Z0-9_-]{8,64}$/.test(normalizeId(item?.providerId))
      );
    }

    function isEligibleProduct(product) {
      if (!product || !normalizeId(product.id)) return false;
      if (product.status && product.status !== "approved") return false;
      if (product.availability && !["available", "reserved"].includes(product.availability)) return false;
      const hasImage = Boolean(normalizeId(product.image) || (Array.isArray(product.images) && product.images.some(normalizeId)));
      return hasImage || isReadyVideoProduct(product);
    }

    function createdTime(product) {
      const value = new Date(product?.createdAt || product?.created_at || product?.updatedAt || 0).getTime();
      return Number.isFinite(value) ? value : 0;
    }

    function engagementScore(product) {
      return Number(product?.views || 0)
        + (Number(product?.likes || 0) * 4)
        + (Math.max(0, Number(product?.intelligenceScore || 0)) * 2);
    }

    function isActivePromotion(promotion) {
      const status = normalizeId(promotion?.status).toLowerCase();
      const paymentStatus = normalizeId(promotion?.paymentStatus).toLowerCase();
      const now = Date.now();
      const startsValue = promotion?.startDate || promotion?.startsAt || "";
      const endsValue = promotion?.endDate || promotion?.endsAt || "";
      const startsAt = startsValue ? new Date(startsValue).getTime() : Number.NaN;
      const endsAt = endsValue ? new Date(endsValue).getTime() : Number.NaN;
      return ["active", "approved"].includes(status)
        && (!paymentStatus || ["paid", "completed", "successful"].includes(paymentStatus))
        && (!Number.isFinite(startsAt) || startsAt <= now)
        && (!Number.isFinite(endsAt) || endsAt >= now);

    }

    function uniqueProducts(items, excludedIds, claimedIds, maxItems) {
      const result = [];
      for (const product of Array.isArray(items) ? items : []) {
        const id = normalizeId(product?.id);
        if (!isEligibleProduct(product) || excludedIds.has(id) || claimedIds.has(id)) continue;
        claimedIds.add(id);
        result.push(product);
        if (result.length >= maxItems) break;
      }
      return result;
    }

    function createDescriptor(input, index) {
      const type = normalizeId(input.type).toLowerCase();
      const sponsored = Boolean(input.sponsored);
      return {
        id: normalizeId(input.id || `home-${type}`),
        type,
        title: normalizeId(input.title),
        reason: normalizeId(input.reason),
        source: normalizeId(input.source || "loaded-home-candidates"),
        items: input.items,
        maxItems: Number(input.maxItems || config.maxItems),
        frequencyCap: Math.max(1, Number(input.frequencyCap || 1)),
        dedupeKey: normalizeId(input.dedupeKey || `home:${type}`),
        priority: Number(input.priority || 0),
        placementRule: {
          afterItems: config.firstPlacementAfter + (index * config.placementInterval),
          minimumGap: config.placementInterval
        },
        sponsored,
        analyticsMetadata: {
          moduleType: type,
          source: normalizeId(input.source || "loaded-home-candidates"),
          sponsored
        }
      };
    }

    function compose(context = {}) {
      const startedAt = Date.now();
      try {
        const products = (Array.isArray(context.products) ? context.products : []).filter(isEligibleProduct);
        const excludedIds = new Set([
          ...(Array.isArray(context.verticalProductIds) ? context.verticalProductIds : []).map(normalizeId),
          ...recentItemIds
        ]);
        const claimedIds = new Set();
        const followed = new Set((Array.isArray(context.followedUsernames) ? context.followedUsernames : []).map(normalizeId));
        const currentUsername = normalizeId(context.currentUser?.username || context.currentUser);
        const promotions = Array.isArray(context.promotions) ? context.promotions : [];
        const promotedProductIds = new Set(promotions.filter(isActivePromotion).map((item) => normalizeId(item.productId)).filter(Boolean));
        const organicExcludedIds = new Set([...excludedIds, ...promotedProductIds]);
        const candidates = [];

        const followingItems = uniqueProducts(
          products.filter((product) => followed.has(normalizeId(product.uploadedBy))).sort((a, b) => createdTime(b) - createdTime(a)),
          organicExcludedIds,
          claimedIds,
          config.maxItems
        );
        if (followingItems.length < config.minimumOrganicItems) report("module_skip", { moduleType: "new-from-following", reason: "insufficient_items" });
        if (followingItems.length >= config.minimumOrganicItems) {
          candidates.push({ type: "new-from-following", title: t("feedModule.newFromFollowingTitle", "New from people you follow"), reason: t("feedModule.newFromFollowingReason", "Fresh posts from your social graph"), source: "person-follow-graph", items: followingItems, priority: 100, frequencyCap: 1 });
        }

        const reelItems = uniqueProducts(
          products.filter((product) => normalizeId(product.category).toLowerCase() === "reels" && isReadyVideoProduct(product))
            .sort((a, b) => engagementScore(b) - engagementScore(a) || createdTime(b) - createdTime(a)),
          organicExcludedIds,
          claimedIds,
          config.maxItems
        );
        if (reelItems.length < config.minimumOrganicItems) report("module_skip", { moduleType: "trending-reels", reason: "insufficient_items" });
        if (reelItems.length >= config.minimumOrganicItems) {
          candidates.push({ type: "trending-reels", title: t("feedModule.trendingReelsTitle", "Trending reels"), reason: t("feedModule.trendingReelsReason", "Popular video posts right now"), source: "loaded-video-candidates", items: reelItems, priority: 90, frequencyCap: 1 });
        }

        const shopCandidates = [];
        const seenSellers = new Set();
        products.slice().sort((a, b) => engagementScore(b) - engagementScore(a)).forEach((product) => {
          const seller = normalizeId(product.uploadedBy);
          if (!seller || organicExcludedIds.has(normalizeId(product.id)) || seller === currentUsername || followed.has(seller) || seenSellers.has(seller)) return;
          seenSellers.add(seller);
          shopCandidates.push(product);
        });
        const shopItems = uniqueProducts(shopCandidates, organicExcludedIds, claimedIds, config.maxItems);
        if (shopItems.length < config.minimumOrganicItems) report("module_skip", { moduleType: "shops-you-may-like", reason: "insufficient_items" });
        if (shopItems.length >= config.minimumOrganicItems) {
          candidates.push({ type: "shops-you-may-like", title: t("feedModule.shopsYouMayLikeTitle", "Shops you may like"), reason: t("feedModule.shopsYouMayLikeReason", "Diverse shops from your current market"), source: "loaded-market-candidates", items: shopItems, priority: 70, frequencyCap: 1 });
        }

        const sponsoredSellerIds = new Set();
        const sponsoredCandidates = products.filter((product) => {
          const seller = normalizeId(product.uploadedBy);
          if (!promotedProductIds.has(normalizeId(product.id)) || !seller || sponsoredSellerIds.has(seller)) return false;
          sponsoredSellerIds.add(seller);
          return true;
        });
        const sponsoredItems = uniqueProducts(
          sponsoredCandidates,
          excludedIds,
          claimedIds,
          config.maxItems
        );

        if (sponsoredItems.length < config.minimumSponsoredItems) report("module_skip", { moduleType: "sponsored-shops", reason: "insufficient_items" });
        if (sponsoredItems.length >= config.minimumSponsoredItems) {
          candidates.push({ type: "sponsored-shops", title: t("feedModule.sponsoredTitle", "Sponsored"), reason: t("feedModule.sponsoredReason", "Paid marketplace placement"), source: "active-promotions", items: sponsoredItems, priority: 40, frequencyCap: 1, sponsored: true });
        }

        const modules = candidates
          .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
          .filter((item) => (renderedCounts.get(item.dedupeKey || `home:${item.type}`) || 0) < Number(item.frequencyCap || 1))
          .slice(0, config.maxModules)
          .map(createDescriptor);
        report("module_latency", { moduleCount: modules.length, candidateCount: products.length, latencyMs: Date.now() - startedAt });
        return modules;
      } catch (error) {
        report("module_failure", { message: String(error?.message || error || "unknown").slice(0, 160), latencyMs: Date.now() - startedAt });
        return [];
      }
    }

    function markRendered(module) {
      const key = normalizeId(module?.dedupeKey || `home:${module?.type || "unknown"}`);
      renderedCounts.set(key, (renderedCounts.get(key) || 0) + 1);
      (Array.isArray(module?.items) ? module.items : []).forEach((item) => {
        const id = normalizeId(item?.id);
        if (id) recentItemIds.add(id);
      });
    }

    function resetSession() {
      renderedCounts.clear();
      recentItemIds.clear();
    }


    return { compose, markRendered, resetSession, isEligibleProduct };
  }

  window.WingaModules.marketplace.createFeedModuleComposer = createFeedModuleComposer;
})();