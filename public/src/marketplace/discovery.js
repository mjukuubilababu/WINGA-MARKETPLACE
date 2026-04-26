(() => {
  function createDiscoveryHelpers(deps) {
    const {
      getProducts,
      inferTopCategoryValue,
      isMarketplaceBrowseCandidate,
      getPromotionSortScore,
      getRecentlyViewedProductIds,
      getProductDiscoveryTrail,
      getActivePromotions,
      getMarketplaceUser,
      getSellerReviewSummary,
      getPromotionCommercialScore,
      getCurrentUser,
      canUseBuyerFeatures,
      getCurrentMessages,
      getCurrentOrders,
      getRecentCategorySelections,
      getRecentSearchTerms,
      getRecentMessagedProductIds,
      getBuyerSellerAffinityEntries,
      getCurrentSession,
      normalizeOptionalPrice
    } = deps;

    const RANKING_CONFIG = {
      default: {
        maxPerSeller: 2,
        sellerSpacingWindow: 4,
        sellerSpacingPenalty: 38,
        sellerRepeatPenalty: 54,
        sellerCapPenalty: 220,
        sponsoredSpacingWindow: 3,
        sponsoredSpacingPenalty: 72,
        maxSponsoredShare: 0.38,
        sponsoredQuotaPenalty: 180,
        earlySponsoredWindow: 4,
        earlySponsoredBoost: 22
      },
      home: {
        sellerSpacingPenalty: 46,
        sellerRepeatPenalty: 60,
        maxSponsoredShare: 0.34,
        earlySponsoredBoost: 28
      },
      behavior_showcase: {
        maxPerSeller: 1,
        sellerSpacingWindow: 5,
        sellerSpacingPenalty: 58,
        sellerRepeatPenalty: 76,
        maxSponsoredShare: 0.4,
        earlySponsoredBoost: 24
      },
      related: {
        maxPerSeller: 2,
        sellerSpacingWindow: 5,
        sellerSpacingPenalty: 48,
        maxSponsoredShare: 0.28
      },
      you_may_like: {
        maxPerSeller: 2,
        sellerSpacingWindow: 4,
        sellerSpacingPenalty: 42
      },
      trending: {
        maxPerSeller: 2,
        sellerSpacingWindow: 4,
        sellerSpacingPenalty: 42,
        maxSponsoredShare: 0.3
      },
      sponsored: {
        maxPerSeller: 1,
        sellerSpacingWindow: 6,
        sellerSpacingPenalty: 64,
        sellerRepeatPenalty: 90,
        maxSponsoredShare: 1,
        earlySponsoredBoost: 42
      }
    };

    function getSurfaceConfig(surface) {
      return {
        ...RANKING_CONFIG.default,
        ...(RANKING_CONFIG[surface] || {})
      };
    }

    function toFiniteNumber(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeLookupValue(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    function getAgeDays(timestamp) {
      const time = new Date(timestamp || 0).getTime();
      if (!Number.isFinite(time) || time <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.max(0, (Date.now() - time) / (24 * 60 * 60 * 1000));
    }

    function getRecencyBoost(timestamp, maxScore = 50, fadeDays = 30) {
      const ageDays = getAgeDays(timestamp);
      if (!Number.isFinite(ageDays)) {
        return 0;
      }
      if (ageDays <= 0) {
        return maxScore;
      }
      return Math.max(0, maxScore * (1 - (ageDays / fadeDays)));
    }

    function addScore(map, key, amount) {
      if (!key || !Number.isFinite(amount) || amount <= 0) {
        return;
      }
      map.set(key, (map.get(key) || 0) + amount);
    }

    function getSearchableProductText(product) {
      return normalizeLookupValue(
        product?._searchText
        || `${product?.name || ""} ${product?.shop || ""} ${product?.uploadedBy || ""} ${product?.category || ""}`
      );
    }

    function getSearchIntentBoost(product, searchTerms = []) {
      const searchableText = getSearchableProductText(product);
      if (!searchableText) {
        return 0;
      }

      let boost = 0;
      const uniqueTerms = Array.from(new Set((Array.isArray(searchTerms) ? searchTerms : []).map(normalizeLookupValue).filter(Boolean)));
      uniqueTerms.forEach((term) => {
        if (!term) {
          return;
        }
        if (searchableText.includes(term)) {
          boost += term.includes(" ") ? 52 : 28;
        } else {
          const termTokens = term.split(/\s+/).filter(Boolean);
          const matchedTokens = termTokens.filter((token) => searchableText.includes(token));
          if (matchedTokens.length > 0) {
            boost += Math.min(24, matchedTokens.length * 8);
          }
        }
      });
      return boost;
    }

    function getSellerTrustScore(product) {
      const seller = typeof getMarketplaceUser === "function"
        ? getMarketplaceUser(product?.uploadedBy)
        : null;
      const sellerSummary = typeof getSellerReviewSummary === "function"
        ? getSellerReviewSummary(product?.uploadedBy)
        : null;
      let score = 0;
      if (seller?.verifiedSeller) score += 25;
      if (seller?.status === "active") score += 10;
      if (seller?.status === "flagged") score -= 60;
      if (sellerSummary?.totalReviews) {
        score += toFiniteNumber(sellerSummary.averageRating, 0) * 8;
        score += Math.min(20, toFiniteNumber(sellerSummary.totalReviews, 0) * 2);
      }
      return score;
    }

    function getProductById(productId, productMap) {
      return productMap.get(String(productId || "")) || null;
    }

    function matchesCategoryContext(product, categories = []) {
      const productCategory = String(product?.category || "");
      const productTopCategory = inferTopCategoryValue(productCategory);
      return (Array.isArray(categories) ? categories : []).some((category) => {
        const safeCategory = String(category || "");
        return safeCategory
          && (
            safeCategory === productCategory
            || safeCategory === productTopCategory
            || inferTopCategoryValue(safeCategory) === productTopCategory
          );
      });
    }

    function buildBuyerHistorySnapshot(productMap) {
      const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : "";
      const buyerCapable = typeof canUseBuyerFeatures === "function" ? canUseBuyerFeatures() : false;
      const sellerScores = new Map();
      const productScores = new Map();
      const categoryScores = new Map();
      const topCategoryScores = new Map();
      const recentCategorySelections = typeof getRecentCategorySelections === "function" ? getRecentCategorySelections() : [];
      const recentSearchTerms = typeof getRecentSearchTerms === "function" ? getRecentSearchTerms() : [];
      const recentMessagedProductIds = typeof getRecentMessagedProductIds === "function" ? getRecentMessagedProductIds() : [];
      const buyerSellerAffinityEntries = typeof getBuyerSellerAffinityEntries === "function" ? getBuyerSellerAffinityEntries() : [];
      let hasMeaningfulHistory = false;

      if (currentUser && buyerCapable) {
        const purchases = Array.isArray(getCurrentOrders?.()?.purchases) ? getCurrentOrders().purchases : [];
        purchases.forEach((order) => {
          const sellerId = String(order?.sellerUsername || "");
          const productId = String(order?.productId || "");
          const statusBoost = order?.status === "delivered"
            ? 320
            : order?.status === "confirmed"
              ? 285
              : order?.status === "paid"
                ? 250
                : 220;
          const recencyBoost = getRecencyBoost(order?.createdAt, 110, 180);
          addScore(sellerScores, sellerId, statusBoost + recencyBoost);
          addScore(productScores, productId, 135 + getRecencyBoost(order?.createdAt, 70, 180));
          const product = getProductById(productId, productMap);
          if (product?.category) {
            addScore(categoryScores, product.category, 60 + (recencyBoost * 0.25));
            addScore(topCategoryScores, inferTopCategoryValue(product.category), 34 + (recencyBoost * 0.18));
          }
          hasMeaningfulHistory = true;
        });

        const conversationKeys = new Set();
        const messages = Array.isArray(getCurrentMessages?.()) ? getCurrentMessages() : [];
        messages.forEach((message) => {
          const senderId = String(message?.senderId || "");
          const receiverId = String(message?.receiverId || "");
          if (senderId !== currentUser && receiverId !== currentUser) {
            return;
          }

          const partnerId = senderId === currentUser ? receiverId : senderId;
          const recencyBoost = getRecencyBoost(message?.timestamp, 70, 45);
          const conversationKey = `${partnerId}::${message?.productId || ""}`;
          if (!conversationKeys.has(conversationKey)) {
            addScore(sellerScores, partnerId, 34 + recencyBoost);
            conversationKeys.add(conversationKey);
          }

          let interactionScore = 12 + recencyBoost;
          if (message?.messageType === "product_reference") interactionScore += 42;
          if (message?.messageType === "product_inquiry") interactionScore += 58;
          if (Array.isArray(message?.productItems) && message.productItems.length) {
            interactionScore += Math.min(84, message.productItems.length * 22);
          }
          addScore(sellerScores, partnerId, interactionScore);

          const directProduct = getProductById(message?.productId, productMap);
          if (directProduct?.id) {
            addScore(productScores, directProduct.id, 42 + (recencyBoost * 0.55));
            addScore(categoryScores, directProduct.category, 22 + (recencyBoost * 0.2));
            addScore(topCategoryScores, inferTopCategoryValue(directProduct.category), 12 + (recencyBoost * 0.12));
          }

          (Array.isArray(message?.productItems) ? message.productItems : []).forEach((item) => {
            const itemProduct = getProductById(item?.productId, productMap);
            addScore(productScores, item?.productId, 26 + (recencyBoost * 0.35));
            addScore(sellerScores, item?.sellerId || itemProduct?.uploadedBy, 20 + (recencyBoost * 0.25));
            if (itemProduct?.category || item?.category) {
              const category = itemProduct?.category || item?.category || "";
              addScore(categoryScores, category, 16 + (recencyBoost * 0.14));
              addScore(topCategoryScores, inferTopCategoryValue(category), 10 + (recencyBoost * 0.1));
            }
          });
          hasMeaningfulHistory = true;
        });
      }

      (Array.isArray(getRecentlyViewedProductIds?.()) ? getRecentlyViewedProductIds() : []).forEach((productId, index) => {
        const product = getProductById(productId, productMap);
        if (!product) {
          return;
        }
        const freshness = Math.max(0.35, 1 - (index * 0.08));
        addScore(sellerScores, product.uploadedBy, 28 * freshness);
        addScore(productScores, product.id, 20 * freshness);
        addScore(categoryScores, product.category, 14 * freshness);
        addScore(topCategoryScores, inferTopCategoryValue(product.category), 9 * freshness);
      });

      recentMessagedProductIds.forEach((productId, index) => {
        const product = getProductById(productId, productMap);
        if (!product) {
          return;
        }
        const freshness = Math.max(0.45, 1 - (index * 0.09));
        addScore(sellerScores, product.uploadedBy, 74 * freshness);
        addScore(productScores, product.id, 48 * freshness);
        addScore(categoryScores, product.category, 20 * freshness);
        addScore(topCategoryScores, inferTopCategoryValue(product.category), 12 * freshness);
      });

      buyerSellerAffinityEntries.forEach((entry) => {
        const sellerId = String(entry?.sellerId || "");
        if (!sellerId) {
          return;
        }
        const affinityScore = Math.max(0, Number(entry?.score || 0));
        if (!affinityScore) {
          return;
        }
        addScore(sellerScores, sellerId, affinityScore + getRecencyBoost(entry?.updatedAt, 56, 35));
        hasMeaningfulHistory = true;
      });

      recentCategorySelections.forEach((category, index) => {
        const freshness = Math.max(0.5, 1 - (index * 0.12));
        addScore(categoryScores, category, 42 * freshness);
        addScore(topCategoryScores, inferTopCategoryValue(category), 24 * freshness);
      });

      const preferredCategories = Array.from(
        new Set([
          ...(recentCategorySelections || []),
          ...Array.from(categoryScores.entries()).sort((first, second) => second[1] - first[1]).map(([category]) => category),
          ...Array.from(topCategoryScores.entries()).sort((first, second) => second[1] - first[1]).map(([category]) => category),
          ...(getCurrentSession?.()?.primaryCategory ? [getCurrentSession().primaryCategory] : [])
        ].filter(Boolean))
      ).slice(0, 6);

      return {
        sellerScores,
        productScores,
        categoryScores,
        topCategoryScores,
        preferredCategories,
        searchTerms: Array.from(new Set((recentSearchTerms || []).map(normalizeLookupValue).filter(Boolean))).slice(0, 4),
        hasMeaningfulHistory
      };
    }

    function getRelationshipScore(product, history) {
      if (!history) {
        return 0;
      }
      return (history.sellerScores.get(product?.uploadedBy || "") || 0)
        + (history.productScores.get(product?.id || "") || 0)
        + (history.categoryScores.get(product?.category || "") || 0)
        + (history.topCategoryScores.get(inferTopCategoryValue(product?.category || "")) || 0);
    }

    function getOrganicScore(product, context, history) {
      const preferredCategories = Array.isArray(context.preferredCategories) ? context.preferredCategories : [];
      const effectiveCategories = Array.from(new Set([...(history?.preferredCategories || []), ...preferredCategories]));
      const searchTerms = Array.from(new Set([...(history?.searchTerms || []), ...((context.searchTerms || []).map(normalizeLookupValue))]));
      const selectedCategory = String(context.selectedCategory || "");
      const seedProduct = context.seedProduct || null;
      const seedTopCategory = inferTopCategoryValue(seedProduct?.category || context.seedCategory || "");
      const productPrice = normalizeOptionalPrice(product.price);
      const seedPrice = normalizeOptionalPrice(seedProduct?.price);

      let score = (toFiniteNumber(product.likes, 0) * 3.5)
        + toFiniteNumber(product.views, 0)
        + getSellerTrustScore(product)
        + getRecencyBoost(product.createdAt, 54, 40);

      if (selectedCategory && selectedCategory !== "all" && matchesCategoryContext(product, [selectedCategory])) {
        score += 60;
      }

      if (matchesCategoryContext(product, effectiveCategories)) {
        score += 68;
      }

      if (seedProduct) {
        if (product.category === seedProduct.category) {
          score += 130;
        } else if (seedTopCategory && inferTopCategoryValue(product.category) === seedTopCategory) {
          score += 76;
        }
        if (seedProduct.uploadedBy && product.uploadedBy !== seedProduct.uploadedBy) {
          score += 14;
        }
        if (seedPrice !== null && productPrice !== null) {
          score += Math.max(0, 42 - (Math.abs(productPrice - seedPrice) / 1700));
        }
      }

      score += getSearchIntentBoost(product, searchTerms);

      if (context.surface === "trending") {
        score += (toFiniteNumber(product.likes, 0) * 2.5) + (toFiniteNumber(product.views, 0) * 1.4);
      }

      return score;
    }

    function buildRankedEntries(candidates, context = {}) {
      const productMap = new Map(getProducts().map((product) => [String(product.id || ""), product]));
      const history = buildBuyerHistorySnapshot(productMap);
      const preferredCategories = Array.from(new Set([
        ...(context.preferredCategories || []),
        ...(history.preferredCategories || [])
      ].filter(Boolean)));

      return candidates.map((product) => {
        const sponsoredScore = typeof getPromotionCommercialScore === "function"
          ? getPromotionCommercialScore(product, { preferredCategories })
          : (getPromotionSortScore(product) * 100);
        const relationshipScore = getRelationshipScore(product, history);
        const organicScore = getOrganicScore(product, {
          ...context,
          preferredCategories
        }, history);
        const priorityBoost = sponsoredScore > 0
          ? 2600 + Math.min(900, sponsoredScore * 0.45)
          : relationshipScore >= 110
            ? 420
            : relationshipScore >= 70
              ? 180
              : 0;
        return {
          product,
          sellerId: product?.uploadedBy || "",
          sponsoredScore,
          relationshipScore,
          organicScore,
          totalScore: sponsoredScore + relationshipScore + organicScore + priorityBoost,
          priorityBoost,
          isSponsored: sponsoredScore > 0
        };
      }).sort((first, second) => {
        if (second.totalScore !== first.totalScore) {
          return second.totalScore - first.totalScore;
        }
        if (second.sponsoredScore !== first.sponsoredScore) {
          return second.sponsoredScore - first.sponsoredScore;
        }
        if (second.relationshipScore !== first.relationshipScore) {
          return second.relationshipScore - first.relationshipScore;
        }
        return second.organicScore - first.organicScore;
      });
    }

    function getRecentSellerDistance(selectedEntries, sellerId, windowSize) {
      const recentWindow = selectedEntries.slice(-windowSize);
      for (let index = recentWindow.length - 1; index >= 0; index -= 1) {
        if (recentWindow[index]?.sellerId === sellerId) {
          return recentWindow.length - 1 - index;
        }
      }
      return -1;
    }

    function hasRecentSponsored(selectedEntries, windowSize) {
      return selectedEntries.slice(-windowSize).some((entry) => entry?.isSponsored);
    }

    function sequenceRankedEntries(entries, limit, config) {
      const selectedEntries = [];
      const remainingEntries = [...entries];
      const sellerCounts = new Map();
      const maxSponsoredSlots = Math.max(1, Math.ceil(limit * config.maxSponsoredShare));
      let sponsoredCount = 0;

      while (remainingEntries.length && selectedEntries.length < limit) {
        let bestIndex = -1;
        let bestScore = Number.NEGATIVE_INFINITY;

        remainingEntries.forEach((entry, index) => {
          const sellerCount = sellerCounts.get(entry.sellerId) || 0;
          let score = entry.totalScore;

          if (sellerCount >= config.maxPerSeller) {
            score -= config.sellerCapPenalty;
          }

          const recentSellerDistance = getRecentSellerDistance(selectedEntries, entry.sellerId, config.sellerSpacingWindow);
          if (recentSellerDistance >= 0) {
            score -= (config.sellerSpacingWindow - recentSellerDistance) * config.sellerSpacingPenalty;
          }

          score -= sellerCount * config.sellerRepeatPenalty;

          if (entry.isSponsored) {
            if (sponsoredCount >= maxSponsoredSlots) {
              score -= config.sponsoredQuotaPenalty;
            }
            if (hasRecentSponsored(selectedEntries, config.sponsoredSpacingWindow)) {
              score -= config.sponsoredSpacingPenalty;
            }
            if (selectedEntries.length < config.earlySponsoredWindow) {
              score += config.earlySponsoredBoost;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });

        if (bestIndex === -1) {
          break;
        }

        const [selected] = remainingEntries.splice(bestIndex, 1);
        selectedEntries.push(selected);
        sellerCounts.set(selected.sellerId, (sellerCounts.get(selected.sellerId) || 0) + 1);
        if (selected.isSponsored) {
          sponsoredCount += 1;
        }
      }

      return selectedEntries.map((entry) => entry.product);
    }

    function rankProductsForSurface(sourceProducts, options = {}) {
      const {
        surface = "default",
        limit = Array.isArray(sourceProducts) ? sourceProducts.length : 0,
        excludeIds = new Set()
      } = options;
      const candidates = (Array.isArray(sourceProducts) ? sourceProducts : [])
        .filter((product) => product?.status === "approved" && product?.availability !== "sold_out")
        .filter((product) => !excludeIds.has(product.id));

      if (!candidates.length || limit <= 0) {
        return [];
      }

      const rankedEntries = buildRankedEntries(candidates, options);
      return sequenceRankedEntries(rankedEntries, limit, getSurfaceConfig(surface));
    }

    function getRelatedProducts(seedProduct, limit = 6) {
      if (!seedProduct) {
        return [];
      }

      const pool = getProducts().filter((product) =>
        product.id !== seedProduct.id
        && product.status === "approved"
        && product.availability !== "sold_out"
        && product.category === seedProduct.category
      );

      return rankProductsForSurface(pool, {
        surface: "related",
        limit,
        seedProduct
      });
    }

    function getDiscoveryRelatedProducts(seedProduct, options = {}) {
      const { limit = 6, excludeIds = new Set() } = options;
      if (!seedProduct) {
        return [];
      }

      const productDiscoveryTrail = new Set(getProductDiscoveryTrail());
      const pool = getProducts().filter((product) =>
        product.id !== seedProduct.id
        && product.status === "approved"
        && product.availability !== "sold_out"
        && isMarketplaceBrowseCandidate(product)
        && !excludeIds.has(product.id)
        && !productDiscoveryTrail.has(product.id)
        && (
          product.category === seedProduct.category
          || inferTopCategoryValue(product.category) === inferTopCategoryValue(seedProduct.category)
        )
      );

      const ranked = rankProductsForSurface(pool, {
        surface: "related",
        limit,
        excludeIds,
        seedProduct
      });

      if (ranked.length >= limit) {
        return ranked;
      }

      const fallbackIds = new Set([seedProduct.id, ...excludeIds, ...ranked.map((product) => product.id)]);
      const fallbackPool = getProducts().filter((product) =>
        !fallbackIds.has(product.id)
        && product.status === "approved"
        && product.availability !== "sold_out"
        && isMarketplaceBrowseCandidate(product)
      );

      return [
        ...ranked,
        ...rankProductsForSurface(fallbackPool, {
          surface: "you_may_like",
          limit: Math.max(0, limit - ranked.length),
          excludeIds: fallbackIds,
          seedProduct
        })
      ].slice(0, limit);
    }

    function getDiscoverySponsoredProducts(seedProduct, options = {}) {
      const { limit = 4, excludeIds = new Set() } = options;
      const activePromotionIds = new Set(getActivePromotions().map((promotion) => promotion.productId));
      if (!activePromotionIds.size) {
        return [];
      }

      const pool = getProducts().filter((product) =>
        activePromotionIds.has(product.id)
        && product.status === "approved"
        && product.availability !== "sold_out"
        && isMarketplaceBrowseCandidate(product)
        && !excludeIds.has(product.id)
      );

      return rankProductsForSurface(pool, {
        surface: "sponsored",
        limit,
        excludeIds,
        seedProduct,
        preferredCategories: seedProduct?.category ? [seedProduct.category, inferTopCategoryValue(seedProduct.category)] : []
      });
    }

    return {
      getRelatedProducts,
      getDiscoveryRelatedProducts,
      getDiscoverySponsoredProducts,
      rankProductsForSurface
    };
  }

  window.WingaModules.marketplace.createDiscoveryHelpers = createDiscoveryHelpers;
})();
