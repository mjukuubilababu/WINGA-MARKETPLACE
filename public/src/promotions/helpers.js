(() => {
  function createPromotionHelpers(deps) {
    const {
      getCurrentPromotions,
      getSelectedCategory,
      promotionOptions
    } = deps;

    const PROMOTION_SCORING = {
      priorityWeight: 140,
      amountWeightDivisor: 130,
      dailyIntensityDivisor: 18,
      durationWeight: 4,
      earlyBurstWeight: 42,
      featuredStabilityBonus: 25,
      pinTopUrgencyBonus: 65,
      categoryMatchBonus: 40,
      categoryMismatchMultiplier: 0.35
    };

    function inferTopCategoryValue(category) {
      const safeCategory = String(category || "").trim().toLowerCase();
      if (!safeCategory) {
        return "";
      }
      const separatorIndex = safeCategory.indexOf("-");
      return separatorIndex === -1 ? safeCategory : safeCategory.slice(0, separatorIndex);
    }

    function matchesCategoryContext(product, categories = []) {
      const topCategory = inferTopCategoryValue(product?.category);
      return (Array.isArray(categories) ? categories : []).some((category) => {
        const safeCategory = String(category || "").trim().toLowerCase();
        return safeCategory
          && (
            safeCategory === product?.category
            || safeCategory === topCategory
            || inferTopCategoryValue(safeCategory) === topCategory
          );
      });
    }

    function getPromotionPriority(type) {
      if (type === "pin_top") return 4;
      if (type === "featured") return 3;
      if (type === "category_boost") return 2;
      if (type === "boost") return 1;
      return 0;
    }

    function getActivePromotions() {
      const now = Date.now();
      return getCurrentPromotions().filter((promotion) =>
        promotion.status === "active"
        && promotion.paymentStatus === "paid"
        && new Date(promotion.endDate || 0).getTime() > now
      );
    }

    function getProductPromotions(productId) {
      return getActivePromotions()
        .filter((promotion) => promotion.productId === productId)
        .sort((first, second) => getPromotionPriority(second.type) - getPromotionPriority(first.type));
    }

    function getPrimaryPromotion(productId) {
      return getProductPromotions(productId)[0] || null;
    }

    function getPromotionLabel(type) {
      return promotionOptions[type]?.label || "Sponsored";
    }

    function getPromotionSortScore(product) {
      return getProductPromotions(product.id).reduce((sum, promotion) => {
        if (promotion.type === "category_boost" && getSelectedCategory() !== "all" && product.category !== getSelectedCategory()) {
          return sum;
        }
        return sum + getPromotionPriority(promotion.type);
      }, 0);
    }

    function getPromotionCommercialScore(product, context = {}) {
      const preferredCategories = Array.isArray(context.preferredCategories) ? context.preferredCategories : [];
      const selectedCategory = getSelectedCategory();
      const now = Date.now();

      return getProductPromotions(product?.id).reduce((sum, promotion) => {
        const option = promotionOptions[promotion.type] || {};
        const amountPaid = Number(promotion.amountPaid || option.amount || 0);
        const durationDays = Math.max(1, Number(option.durationDays || 1));
        const dailyIntensity = amountPaid / durationDays;
        const startTime = new Date(promotion.startDate || promotion.createdAt || 0).getTime();
        const endTime = new Date(promotion.endDate || 0).getTime();
        const totalWindow = Math.max(1, endTime - startTime);
        const elapsedRatio = Number.isFinite(startTime) && Number.isFinite(endTime)
          ? Math.min(1, Math.max(0, (now - startTime) / totalWindow))
          : 0;
        let score = (getPromotionPriority(promotion.type) * PROMOTION_SCORING.priorityWeight)
          + (amountPaid / PROMOTION_SCORING.amountWeightDivisor)
          + (dailyIntensity / PROMOTION_SCORING.dailyIntensityDivisor)
          + (durationDays * PROMOTION_SCORING.durationWeight)
          + ((1 - elapsedRatio) * PROMOTION_SCORING.earlyBurstWeight);

        if (promotion.type === "featured") {
          score += PROMOTION_SCORING.featuredStabilityBonus;
        }

        if (promotion.type === "pin_top") {
          score += (1 - elapsedRatio) * PROMOTION_SCORING.pinTopUrgencyBonus;
        }

        if (promotion.type === "category_boost") {
          const selectedCategoryMatches = selectedCategory && selectedCategory !== "all"
            && matchesCategoryContext(product, [selectedCategory]);
          const preferredCategoryMatches = matchesCategoryContext(product, preferredCategories);
          if (selectedCategoryMatches || preferredCategoryMatches) {
            score += PROMOTION_SCORING.categoryMatchBonus;
          } else {
            score *= PROMOTION_SCORING.categoryMismatchMultiplier;
          }
        }

        return sum + score;
      }, 0);
    }

    return {
      getPromotionPriority,
      getActivePromotions,
      getProductPromotions,
      getPrimaryPromotion,
      getPromotionLabel,
      getPromotionSortScore,
      getPromotionCommercialScore
    };
  }

  window.WingaModules.promotions.createPromotionHelpers = createPromotionHelpers;
})();
