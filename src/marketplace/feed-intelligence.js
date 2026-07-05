(() => {
  function createFeedIntelligence(deps = {}) {
    const config = {
      freshProtectionWindowMs: 20 * 60 * 1000,
      freshTopSlots: 2,
      sellerWindow: 4,
      sellerWindowPenalty: 72,
      sellerRepeatPenalty: 58,
      sellerCap: 2,
      sellerCapPenalty: 260,
      soldOutPenalty: 95,
      maxDemandBoost: 260,
      maxNearbyBoost: 90,
      maxVariantBoost: 36,
      maxStyleBoost: 180,
      maxSellerQualityBoost: 170,
      maxMarketBoost: 190,
      maxPersonalizationBudget: 420,
      maxMarketDemandBudget: 360,
      maxEngagementBudget: 240,
      ...deps.config
    };
    let lazyStyleEngine = deps.styleEngine || null;

    function toFiniteNumber(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min = 0, max = Number.POSITIVE_INFINITY) {
      return Math.max(min, Math.min(max, toFiniteNumber(value, 0)));
    }

    function normalizeLookupValue(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    function getCreatedTime(product) {
      const time = new Date(
        product?.createdAt
        || product?.created_at
        || product?.timestamp
        || product?.updatedAt
        || 0
      ).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    function compareNewestFirst(first, second) {
      const delta = getCreatedTime(second) - getCreatedTime(first);
      if (delta !== 0) {
        return delta;
      }
      return String(second?.id || "").localeCompare(String(first?.id || ""));
    }

    function getRecencyScore(product, now) {
      const ageMs = Math.max(0, now - getCreatedTime(product));
      const dayMs = 24 * 60 * 60 * 1000;
      if (ageMs <= config.freshProtectionWindowMs) {
        return 180;
      }
      return Math.max(0, 120 * (1 - (ageMs / (21 * dayMs))));
    }

    function getDemandScore(product) {
      const summary = product?.demandSummary && typeof product.demandSummary === "object"
        ? product.demandSummary
        : null;
      if (!summary) {
        return 0;
      }
      return Math.min(
        config.maxDemandBoost,
        (toFiniteNumber(summary.demandScore, 0) * 4)
          + (toFiniteNumber(summary.waitingUsers, 0) * 18)
          + (toFiniteNumber(summary.restockInterest, 0) * 10)
      );
    }

    function getEngagementScore(product) {
      return typeof deps.getEngagementScore === "function"
        ? toFiniteNumber(deps.getEngagementScore(product), 0)
        : (
          (toFiniteNumber(product?.views, 0) * 1)
          + (toFiniteNumber(product?.likes, 0) * 3)
          + (toFiniteNumber(product?.saves, 0) * 4)
          + (toFiniteNumber(product?.messages, 0) * 5)
          + (toFiniteNumber(product?.orders, 0) * 6)
        );
    }

    function getRecommendationScore(product, context) {
      if (typeof deps.getRecommendationScore === "function") {
        return toFiniteNumber(deps.getRecommendationScore(product, context), 0);
      }
      const preferredCategories = Array.isArray(context.preferredCategories) ? context.preferredCategories : [];
      const topCategory = typeof deps.inferTopCategoryValue === "function"
        ? deps.inferTopCategoryValue(product?.category || "")
        : "";
      let score = 0;
      if (preferredCategories.includes(product?.category) || (topCategory && preferredCategories.includes(topCategory))) {
        score += 74;
      }
      if (context.seedCategory && (product?.category === context.seedCategory || topCategory === context.seedCategory)) {
        score += 42;
      }
      return score;
    }

    function getStyleScore(product, context) {
      if (typeof deps.getStyleScore === "function") {
        return Math.min(config.maxStyleBoost, Math.max(0, toFiniteNumber(deps.getStyleScore(product, context), 0)));
      }
      if (!lazyStyleEngine && typeof window.WingaModules?.marketplace?.createStyleIntelligence === "function") {
        lazyStyleEngine = window.WingaModules.marketplace.createStyleIntelligence({
          inferTopCategoryValue: deps.inferTopCategoryValue,
          config: {
            maxStyleBoost: config.maxStyleBoost
          }
        });
      }
      const styleEngine = lazyStyleEngine;
      if (!styleEngine || typeof styleEngine.scoreProductStyle !== "function" || !context.styleProfile) {
        return 0;
      }
      const result = styleEngine.scoreProductStyle(product, context.styleProfile);
      return Math.min(config.maxStyleBoost, Math.max(0, toFiniteNumber(result?.score, 0)));
    }

    function getNearbyScore(product, context) {
      const wantedLocation = normalizeLookupValue(context.locationQuery || "");
      if (!wantedLocation) {
        return 0;
      }
      const productLocation = normalizeLookupValue(`${product?.location || ""} ${product?.shop || ""}`);
      if (!productLocation) {
        return 0;
      }
      if (productLocation.includes(wantedLocation)) {
        return config.maxNearbyBoost;
      }
      const tokens = wantedLocation.split(/\s+/).filter(Boolean);
      const matched = tokens.filter((token) => productLocation.includes(token)).length;
      return matched ? Math.min(config.maxNearbyBoost, matched * 24) : 0;
    }

    function getVariantScore(product) {
      const imageCount = Array.isArray(product?.images) ? product.images.length : 0;
      const variantCount = Array.isArray(product?.variants) ? product.variants.length : 0;
      return Math.min(config.maxVariantBoost, Math.max(0, imageCount - 1) * 5 + variantCount * 7);
    }

    function getFollowedSellerScore(product, context) {
      const followed = context.followedSellerIds instanceof Set
        ? context.followedSellerIds
        : new Set(Array.isArray(context.followedSellerIds) ? context.followedSellerIds : []);
      return followed.has(product?.uploadedBy) ? 220 : 0;
    }

    function getSellerQualityScore(product, context) {
      if (typeof deps.getSellerQualityScore === "function") {
        return Math.min(config.maxSellerQualityBoost, Math.max(0, toFiniteNumber(deps.getSellerQualityScore(product, context), 0)));
      }
      const sellerId = String(product?.uploadedBy || "");
      const snapshots = context.sellerQualitySnapshots || {};
      const snapshot = snapshots instanceof Map ? snapshots.get(sellerId) : snapshots[sellerId];
      if (!snapshot) {
        return 0;
      }
      const trust = toFiniteNumber(snapshot.trustScore || snapshot.sellerTrustScore, 0);
      const quality = toFiniteNumber(snapshot.qualityScore || snapshot.sellerQualityScore, 0);
      const activity = toFiniteNumber(snapshot.activityScore || snapshot.sellerActivityScore, 0);
      return Math.min(config.maxSellerQualityBoost, Math.max(0, (trust * 0.48) + (quality * 0.34) + (activity * 0.18)));
    }

    function getMarketScore(product, context) {
      if (typeof deps.getMarketScore === "function") {
        return Math.min(config.maxMarketBoost, Math.max(0, toFiniteNumber(deps.getMarketScore(product, context), 0)));
      }
      const productId = String(product?.id || "");
      const productScore = context.marketInsights?.productScores?.[productId];
      if (!productScore) {
        return 0;
      }
      return Math.min(
        config.maxMarketBoost,
        Math.max(0, (toFiniteNumber(productScore.marketScore, 0) * 0.34) + (toFiniteNumber(productScore.sellOutRisk, 0) * 0.42))
      );
    }

    function scoreProduct(product, context, now) {
      const engagement = getEngagementScore(product);
      const rawScore = {
        freshness: getRecencyScore(product, now),
        followedSeller: getFollowedSellerScore(product, context),
        sellerQuality: getSellerQualityScore(product, context),
        market: getMarketScore(product, context),
        demand: getDemandScore(product),
        trending: Math.min(220, engagement * 1.35),
        recommendation: getRecommendationScore(product, context),
        style: getStyleScore(product, context),
        nearby: getNearbyScore(product, context),
        variant: getVariantScore(product),
        engagement: Math.min(180, engagement)
      };
      const score = {
        freshness: rawScore.freshness,
        personalization: clamp(
          rawScore.followedSeller + rawScore.recommendation + rawScore.style + rawScore.nearby,
          0,
          config.maxPersonalizationBudget
        ),
        trustAndQuality: clamp(rawScore.sellerQuality, 0, config.maxSellerQualityBoost),
        marketDemand: clamp(rawScore.market + rawScore.demand + rawScore.variant, 0, config.maxMarketDemandBudget),
        engagement: clamp(rawScore.trending + rawScore.engagement, 0, config.maxEngagementBudget)
      };
      const availabilityPenalty = product?.availability === "sold_out" ? config.soldOutPenalty : 0;
      return {
        product,
        sellerId: String(product?.uploadedBy || ""),
        createdTime: getCreatedTime(product),
        score,
        rawScore,
        totalScore: Object.values(score).reduce((sum, value) => sum + toFiniteNumber(value, 0), 0) - availabilityPenalty
      };
    }

    function selectFreshProtected(entries, limit) {
      const usedSellerIds = new Set();
      return entries
        .filter((entry) => entry.score.freshness >= 180)
        .sort((first, second) => compareNewestFirst(first.product, second.product))
        .filter((entry) => {
          if (entry.sellerId && usedSellerIds.has(entry.sellerId)) {
            return false;
          }
          if (entry.sellerId) {
            usedSellerIds.add(entry.sellerId);
          }
          return true;
        })
        .slice(0, limit);
    }

    function sellerDistance(selectedEntries, sellerId) {
      if (!sellerId) {
        return -1;
      }
      const windowEntries = selectedEntries.slice(-config.sellerWindow);
      for (let index = windowEntries.length - 1; index >= 0; index -= 1) {
        if (windowEntries[index]?.sellerId === sellerId) {
          return windowEntries.length - 1 - index;
        }
      }
      return -1;
    }

    function sequenceEntries(entries, protectedEntries, limit) {
      const selected = [];
      const selectedIds = new Set();
      const sellerCounts = new Map();
      const remaining = entries.filter((entry) => entry?.product?.id);

      const appendEntry = (entry, options = {}) => {
        const productId = String(entry?.product?.id || "");
        if (!productId || selectedIds.has(productId)) {
          return false;
        }
        const sellerCount = sellerCounts.get(entry.sellerId) || 0;
        if (sellerCount >= Math.max(1, Number(options.sellerCap || config.sellerCap))) {
          return false;
        }
        selected.push(entry);
        selectedIds.add(productId);
        if (entry.sellerId) {
          sellerCounts.set(entry.sellerId, sellerCount + 1);
        }
        return true;
      };

      protectedEntries.forEach((entry) => appendEntry(entry, { sellerCap: 1 }));

      while (selected.length < limit) {
        let bestIndex = -1;
        let bestScore = Number.NEGATIVE_INFINITY;
        remaining.forEach((entry, index) => {
          const productId = String(entry?.product?.id || "");
          if (!productId || selectedIds.has(productId)) {
            return;
          }
          let adjustedScore = entry.totalScore;
          const count = sellerCounts.get(entry.sellerId) || 0;
          if (count >= config.sellerCap) {
            adjustedScore -= config.sellerCapPenalty;
          }
          adjustedScore -= count * config.sellerRepeatPenalty;
          const distance = sellerDistance(selected, entry.sellerId);
          if (distance >= 0) {
            adjustedScore -= (config.sellerWindow - distance) * config.sellerWindowPenalty;
          }
          adjustedScore += Math.min(90, Math.max(0, (entry.createdTime || 0) / 100000000000));
          if (adjustedScore > bestScore) {
            bestScore = adjustedScore;
            bestIndex = index;
          }
        });
        if (bestIndex < 0) {
          break;
        }
        const [entry] = remaining.splice(bestIndex, 1);
        appendEntry(entry);
      }

      if (selected.length < limit) {
        entries
          .sort((first, second) => compareNewestFirst(first.product, second.product))
          .forEach((entry) => {
            if (selected.length < limit) {
              appendEntry(entry, { sellerCap: Number.POSITIVE_INFINITY });
            }
          });
      }

      return selected.map((entry) => entry.product);
    }

    function rankHomeFeed(products = [], context = {}) {
      const source = Array.isArray(products) ? products.filter(Boolean) : [];
      const unique = [];
      const seenIds = new Set();
      source.forEach((product) => {
        const id = String(product?.id || "");
        if (!id || seenIds.has(id)) {
          return;
        }
        seenIds.add(id);
        unique.push(product);
      });
      if (unique.length < 3) {
        return unique.slice().sort(compareNewestFirst);
      }

      const now = Number(context.now || Date.now());
      const entries = unique.map((product) => scoreProduct(product, context, now));
      const protectedEntries = selectFreshProtected(entries, config.freshTopSlots);
      return sequenceEntries(entries, protectedEntries, unique.length);
    }

    return {
      rankHomeFeed,
      scoreProduct
    };
  }

  window.WingaModules.marketplace.createFeedIntelligence = createFeedIntelligence;
})();
