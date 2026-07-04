(() => {
  function createMarketIntelligence(deps = {}) {
    const config = {
      maxInsightItems: 12,
      maxMarketBoost: 190,
      recencyWindowDays: 21,
      sellOutDemandThreshold: 90,
      ...deps.config
    };

    const COLOR_WORDS = [
      "black", "white", "red", "blue", "green", "yellow", "pink", "purple", "brown", "grey", "gray",
      "orange", "gold", "silver", "cream", "beige", "navy", "maroon", "khaki", "wine"
    ];
    const SIZE_WORDS = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "small", "medium", "large", "free size"];

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

    function normalizeKey(value) {
      return normalizeLookupValue(value).replace(/\s+/g, "-");
    }

    function getTime(value) {
      const time = new Date(value || 0).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    function getAgeDays(value, now) {
      const time = getTime(value);
      if (!time) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.max(0, (now - time) / (24 * 60 * 60 * 1000));
    }

    function getRecencyScore(value, now, maxScore = 80, fadeDays = config.recencyWindowDays) {
      const ageDays = getAgeDays(value, now);
      if (!Number.isFinite(ageDays)) {
        return 0;
      }
      return Math.max(0, maxScore * (1 - (ageDays / fadeDays)));
    }

    function addScore(map, key, score) {
      const normalized = normalizeKey(key);
      const safeScore = toFiniteNumber(score, 0);
      if (!normalized || safeScore <= 0) {
        return;
      }
      map.set(normalized, (map.get(normalized) || 0) + safeScore);
    }

    function wordsFromText(text, dictionary) {
      const lookup = ` ${normalizeLookupValue(text)} `;
      return dictionary.filter((word) => lookup.includes(` ${normalizeLookupValue(word)} `));
    }

    function inferTopCategory(category) {
      return typeof deps.inferTopCategoryValue === "function"
        ? deps.inferTopCategoryValue(category)
        : String(category || "").split("-")[0];
    }

    function getProductText(product) {
      return [
        product?.name,
        product?.title,
        product?.description,
        product?.category,
        product?.color,
        product?.size,
        product?.material,
        Array.isArray(product?.variants)
          ? product.variants.map((variant) => `${variant?.color || ""} ${variant?.size || ""} ${variant?.name || ""}`).join(" ")
          : ""
      ].filter(Boolean).join(" ");
    }

    function extractColors(product) {
      const summaryColors = Array.isArray(product?.demandSummary?.topColors)
        ? product.demandSummary.topColors.map((item) => item.color)
        : [];
      return Array.from(new Set([
        ...summaryColors,
        product?.color,
        ...wordsFromText(getProductText(product), COLOR_WORDS)
      ].map(normalizeKey).filter(Boolean)));
    }

    function extractSizes(product) {
      const summarySizes = Array.isArray(product?.demandSummary?.topSizes)
        ? product.demandSummary.topSizes.map((item) => item.size)
        : [];
      return Array.from(new Set([
        ...summarySizes,
        product?.size,
        ...wordsFromText(getProductText(product), SIZE_WORDS)
      ].map(normalizeKey).filter(Boolean)));
    }

    function getRegion(product) {
      const raw = product?.region || product?.country || product?.location || product?.shop || "";
      return normalizeKey(raw);
    }

    function getDemandSummary(product) {
      return product?.demandSummary && typeof product.demandSummary === "object" ? product.demandSummary : {};
    }

    function getDemandScore(product) {
      const summary = getDemandSummary(product);
      return (
        toFiniteNumber(summary.demandScore, 0)
        + (toFiniteNumber(summary.waitingUsers, 0) * 4)
        + (toFiniteNumber(summary.restockInterest, 0) * 3)
      );
    }

    function getSearchScore(product, searchTerms = []) {
      const text = normalizeLookupValue(getProductText(product));
      return Array.from(new Set((Array.isArray(searchTerms) ? searchTerms : []).map(normalizeLookupValue).filter(Boolean)))
        .reduce((sum, term) => {
          if (!term) {
            return sum;
          }
          if (text.includes(term)) {
            return sum + (term.includes(" ") ? 38 : 22);
          }
          const tokens = term.split(/\s+/).filter(Boolean);
          return sum + Math.min(18, tokens.filter((token) => text.includes(token)).length * 6);
        }, 0);
    }

    function getConversationScore(product, messages = [], now) {
      const productId = String(product?.id || "");
      const productName = normalizeLookupValue(product?.name || "");
      return (Array.isArray(messages) ? messages : []).reduce((sum, message) => {
        const messageProductId = String(message?.productId || "").trim();
        const messageText = normalizeLookupValue(`${message?.message || ""} ${message?.productName || ""}`);
        const matches = (productId && messageProductId === productId) || (productName && messageText.includes(productName));
        if (!matches) {
          return sum;
        }
        return sum + 18 + getRecencyScore(message?.timestamp || message?.createdAt, now, 36, 45);
      }, 0);
    }

    function compactMap(map, labelKey = "key") {
      return Array.from(map.entries())
        .sort((first, second) => second[1] - first[1])
        .slice(0, config.maxInsightItems)
        .map(([key, score]) => ({ [labelKey]: key, score: Math.round(score) }));
    }

    function analyzeMarket(inputs = {}) {
      const now = toFiniteNumber(inputs.now, Date.now());
      const products = (Array.isArray(inputs.products) ? inputs.products : []).filter(Boolean);
      const searchTerms = Array.isArray(inputs.searchTerms) ? inputs.searchTerms : [];
      const messages = Array.isArray(inputs.messages) ? inputs.messages : [];
      const regionQuery = normalizeKey(inputs.regionQuery || "");
      const categoryScores = new Map();
      const colorScores = new Map();
      const sizeScores = new Map();
      const regionScores = new Map();
      const productEntries = products.map((product) => {
        const demand = getDemandScore(product);
        const search = getSearchScore(product, searchTerms);
        const conversation = getConversationScore(product, messages, now);
        const recency = getRecencyScore(product?.createdAt || product?.updatedAt, now, 56, 35);
        const demandRecency = getRecencyScore(getDemandSummary(product).lastDemandAt, now, 84, 60);
        const engagement = (toFiniteNumber(product?.views, 0) * 0.7)
          + (toFiniteNumber(product?.likes, 0) * 2.6)
          + (toFiniteNumber(product?.saves, 0) * 3.2)
          + (toFiniteNumber(product?.messages, 0) * 4.1)
          + (toFiniteNumber(product?.orders, 0) * 5.4);
        const category = normalizeKey(product?.category || "");
        const topCategory = normalizeKey(inferTopCategory(product?.category || ""));
        const region = getRegion(product);
        const seasonalScore = getSeasonalScore(product, now);
        const regionalBoost = regionQuery && region && (region.includes(regionQuery) || regionQuery.includes(region)) ? 42 : 0;
        const marketScore = demand + search + conversation + recency + demandRecency + engagement + seasonalScore + regionalBoost;
        addScore(categoryScores, category, marketScore * 0.72);
        addScore(categoryScores, topCategory, marketScore * 0.44);
        extractColors(product).forEach((color) => addScore(colorScores, color, demand + search + (engagement * 0.16)));
        extractSizes(product).forEach((size) => addScore(sizeScores, size, demand + search + (engagement * 0.12)));
        addScore(regionScores, region, marketScore);
        return {
          product,
          productId: String(product?.id || ""),
          sellerId: String(product?.uploadedBy || ""),
          category,
          topCategory,
          region,
          demand,
          search,
          conversation,
          engagement,
          recency,
          demandRecency,
          seasonalScore,
          marketScore,
          sellOutRisk: getSellOutRisk(product, demand, engagement, demandRecency)
        };
      });

      const risingDemandProducts = productEntries
        .filter((entry) => entry.demand > 0 || entry.search > 0 || entry.conversation > 0)
        .sort((first, second) => second.marketScore - first.marketScore)
        .slice(0, config.maxInsightItems)
        .map(toProductInsight);
      const likelySellOutProducts = productEntries
        .filter((entry) => entry.sellOutRisk >= 45)
        .sort((first, second) => second.sellOutRisk - first.sellOutRisk)
        .slice(0, config.maxInsightItems)
        .map((entry) => ({ ...toProductInsight(entry), sellOutRisk: Math.round(entry.sellOutRisk) }));
      const losingPopularityProducts = productEntries
        .filter((entry) => entry.engagement > 0 && entry.recency <= 3 && entry.demand <= 0 && entry.search <= 0)
        .sort((first, second) => first.marketScore - second.marketScore)
        .slice(0, config.maxInsightItems)
        .map(toProductInsight);
      const categoryOpportunities = compactMap(categoryScores, "category");
      const highDemandColors = compactMap(colorScores, "color");
      const highDemandSizes = compactMap(sizeScores, "size");
      const regionalTrends = compactMap(regionScores, "region");
      const stockingRecommendations = buildStockingRecommendations({
        categoryOpportunities,
        highDemandColors,
        highDemandSizes,
        regionalTrends
      });

      return {
        version: "market-intelligence-v1",
        generatedAt: new Date(now).toISOString(),
        season: getSeasonLabel(now),
        regionAware: Boolean(regionQuery),
        risingDemandProducts,
        likelySellOutProducts,
        losingPopularityProducts,
        highDemandColors,
        highDemandSizes,
        regionalTrends,
        categoryOpportunities,
        stockingRecommendations,
        trendAlerts: buildTrendAlerts(risingDemandProducts, likelySellOutProducts, categoryOpportunities),
        productScores: Object.fromEntries(productEntries.map((entry) => [entry.productId, {
          marketScore: Math.round(entry.marketScore),
          sellOutRisk: Math.round(entry.sellOutRisk),
          demand: Math.round(entry.demand),
          search: Math.round(entry.search),
          region: entry.region,
          category: entry.category
        }]))
      };
    }

    function getSeasonLabel(now) {
      const month = new Date(now).getMonth() + 1;
      if ([11, 12, 1].includes(month)) return "holiday-season";
      if ([2, 3, 4].includes(month)) return "new-year-school-business";
      if ([5, 6, 7].includes(month)) return "mid-year";
      return "late-year";
    }

    function getSeasonalScore(product, now) {
      const season = getSeasonLabel(now);
      const text = normalizeLookupValue(getProductText(product));
      if (season === "holiday-season" && /(party|wedding|gift|dress|shoes|decor|travel)/i.test(text)) return 34;
      if (season === "new-year-school-business" && /(school|office|business|uniform|bag|shoes)/i.test(text)) return 30;
      if (season === "mid-year" && /(jacket|sweater|hoodie|coat|boots|home)/i.test(text)) return 22;
      if (season === "late-year" && /(party|fashion|dress|beauty|phone|electronics)/i.test(text)) return 26;
      return 0;
    }

    function getSellOutRisk(product, demand, engagement, demandRecency) {
      if (product?.availability === "sold_out") {
        return Math.min(100, 68 + (demand * 0.18));
      }
      return Math.min(100, (demand * 0.42) + (engagement * 0.08) + (demandRecency * 0.38));
    }

    function toProductInsight(entry) {
      return {
        productId: entry.productId,
        sellerId: entry.sellerId,
        productName: String(entry.product?.name || entry.product?.title || entry.productId || "").trim(),
        category: entry.category,
        region: entry.region,
        score: Math.round(entry.marketScore),
        demand: Math.round(entry.demand),
        search: Math.round(entry.search),
        conversation: Math.round(entry.conversation)
      };
    }

    function buildStockingRecommendations(summary) {
      const category = summary.categoryOpportunities?.[0];
      const color = summary.highDemandColors?.[0];
      const size = summary.highDemandSizes?.[0];
      const region = summary.regionalTrends?.[0];
      const recommendations = [];
      if (category) {
        recommendations.push({
          type: "category",
          title: `Stock more ${category.category}`,
          reason: "Category demand is rising across searches, demand requests, and product momentum.",
          score: category.score
        });
      }
      if (color) {
        recommendations.push({
          type: "color",
          title: `Prioritize ${color.color} variants`,
          reason: "Color demand is visible in sold-out demand and product interest.",
          score: color.score
        });
      }
      if (size) {
        recommendations.push({
          type: "size",
          title: `Keep ${size.size} sizes available`,
          reason: "Size demand is concentrated enough to guide restocking.",
          score: size.score
        });
      }
      if (region) {
        recommendations.push({
          type: "region",
          title: `Watch demand in ${region.region}`,
          reason: "Regional demand is concentrated and can improve seller targeting.",
          score: region.score
        });
      }
      return recommendations.slice(0, config.maxInsightItems);
    }

    function buildTrendAlerts(risingDemandProducts, likelySellOutProducts, categoryOpportunities) {
      const alerts = [];
      if (risingDemandProducts?.[0]) {
        alerts.push({
          type: "rising_demand",
          title: `${risingDemandProducts[0].productName || "A product"} is gaining demand`,
          score: risingDemandProducts[0].score
        });
      }
      if (likelySellOutProducts?.[0]) {
        alerts.push({
          type: "sellout_risk",
          title: `${likelySellOutProducts[0].productName || "A product"} may sell out soon`,
          score: likelySellOutProducts[0].sellOutRisk
        });
      }
      if (categoryOpportunities?.[0]) {
        alerts.push({
          type: "category_growth",
          title: `${categoryOpportunities[0].category} demand is growing`,
          score: categoryOpportunities[0].score
        });
      }
      return alerts;
    }

    function getProductMarketBoost(product, insights = {}) {
      const productId = String(product?.id || "");
      const score = toFiniteNumber(insights.productScores?.[productId]?.marketScore, 0);
      const risk = toFiniteNumber(insights.productScores?.[productId]?.sellOutRisk, 0);
      return Math.min(config.maxMarketBoost, Math.max(0, (score * 0.34) + (risk * 0.42)));
    }

    function filterInsightsForSeller(insights = {}, sellerId = "") {
      const safeSellerId = String(sellerId || "").trim();
      const keepSeller = (item) => !safeSellerId || String(item?.sellerId || "") === safeSellerId;
      return {
        ...insights,
        risingDemandProducts: (insights.risingDemandProducts || []).filter(keepSeller),
        likelySellOutProducts: (insights.likelySellOutProducts || []).filter(keepSeller),
        losingPopularityProducts: (insights.losingPopularityProducts || []).filter(keepSeller)
      };
    }

    return {
      analyzeMarket,
      getProductMarketBoost,
      filterInsightsForSeller
    };
  }

  window.WingaModules.marketplace.createMarketIntelligence = createMarketIntelligence;
})();
