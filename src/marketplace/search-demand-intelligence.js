(() => {
  function createSearchDemandIntelligence(deps = {}) {
    const config = {
      maxEvents: 800,
      maxAggregates: 80,
      dedupeWindowMs: 45 * 1000,
      minDedupeWindowMs: 1 * 1000,
      abuseWindowMs: 60 * 1000,
      abuseMaxSignals: 30,
      notifyThreshold: 8,
      ...deps.config
    };
    const effectiveDedupeWindowMs = Math.max(
      1 * 1000,
      toFiniteNumber(config.minDedupeWindowMs, 1 * 1000),
      toFiniteNumber(config.dedupeWindowMs, 45 * 1000)
    );

    const COLOR_WORDS = [
      "black", "white", "red", "blue", "green", "yellow", "pink", "purple", "brown", "grey", "gray",
      "orange", "gold", "silver", "cream", "beige", "navy", "maroon", "khaki", "wine"
    ];
    const STYLE_WORDS = ["casual", "formal", "office", "party", "wedding", "streetwear", "sportswear", "classic", "elegant", "modest", "business"];

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

    function wordsFromText(text, dictionary) {
      const lookup = ` ${normalizeLookupValue(text)} `;
      return dictionary.filter((word) => lookup.includes(` ${normalizeLookupValue(word)} `));
    }

    function getPriceRange(filters = {}) {
      const min = toFiniteNumber(filters.minPrice, 0);
      const max = toFiniteNumber(filters.maxPrice, 0);
      if (!min && !max) return "";
      if (max && max <= 25000) return "budget";
      if (max && max <= 75000) return "value";
      if ((max && max <= 180000) || (min && min <= 180000)) return "mid";
      if ((max && max <= 500000) || (min && min <= 500000)) return "premium";
      return "luxury";
    }

    function getCategoryFromResults(results = [], fallback = "") {
      const counts = new Map();
      (Array.isArray(results) ? results : []).slice(0, 20).forEach((product) => {
        const category = normalizeKey(product?.category || "");
        if (category) counts.set(category, (counts.get(category) || 0) + 1);
      });
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
      return top || normalizeKey(fallback);
    }

    function getProductType(query = "", category = "") {
      const normalized = normalizeLookupValue(`${query} ${category}`);
      const tokens = normalized.split(/\s+/).filter(Boolean);
      return tokens.find((token) => !COLOR_WORDS.includes(token) && !STYLE_WORDS.includes(token) && token.length > 2) || normalizeKey(category);
    }

    function createSignal(input = {}) {
      const query = normalizeLookupValue(input.query || "");
      const results = Array.isArray(input.results) ? input.results : [];
      const category = getCategoryFromResults(results, input.category || "");
      const text = `${query} ${category}`;
      const signal = {
        eventId: `search-demand-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date(input.timestamp || Date.now()).toISOString(),
        query,
        queryKey: normalizeKey(query || input.source || "image-search"),
        detectedCategory: category,
        detectedProductType: normalizeKey(input.productType || getProductType(query, category)),
        detectedColor: normalizeKey(input.color || wordsFromText(text, COLOR_WORDS)[0] || ""),
        detectedBrand: normalizeKey(input.brand || ""),
        detectedStyle: normalizeKey(input.style || wordsFromText(text, STYLE_WORDS)[0] || ""),
        priceRange: getPriceRange(input.filters || {}),
        location: normalizeKey(input.location || input.filters?.location || ""),
        source: input.source === "image" || input.source === "visual_similarity" ? input.source : "text",
        resultCount: Math.max(0, toFiniteNumber(input.resultCount ?? results.length, 0)),
        clickedProductId: String(input.clickedProductId || "").trim(),
        noClick: Boolean(input.noClick),
        zeroResult: Math.max(0, toFiniteNumber(input.resultCount ?? results.length, 0)) === 0,
        anonymous: true
      };
      signal.dedupeKey = [
        signal.queryKey,
        signal.detectedCategory,
        signal.detectedColor,
        signal.location,
        signal.source,
        signal.zeroResult ? "zero" : "results"
      ].join("|");
      return signal;
    }

    function createCollector(initialState = {}) {
      let events = Array.isArray(initialState.events) ? initialState.events.slice(-config.maxEvents) : [];
      let recentKeys = new Map();
      let recentSignalTimes = [];

      function shouldIgnore(signal, now) {
        if (!signal.queryKey && signal.source === "text") {
          return true;
        }
        recentSignalTimes = recentSignalTimes.filter((time) => now - time <= config.abuseWindowMs);
        for (const [key, timestamp] of recentKeys.entries()) {
          if (now - timestamp > effectiveDedupeWindowMs) {
            recentKeys.delete(key);
          }
        }
        if (recentSignalTimes.length >= config.abuseMaxSignals) {
          return true;
        }
        const lastSeen = recentKeys.get(signal.dedupeKey) || 0;
        if (lastSeen && now - lastSeen <= effectiveDedupeWindowMs) {
          return true;
        }
        recentSignalTimes.push(now);
        recentKeys.set(signal.dedupeKey, now);
        return false;
      }

      function record(input = {}) {
        const now = Date.now();
        const signal = createSignal({ ...input, timestamp: input.timestamp || now });
        if (shouldIgnore(signal, now)) {
          return { accepted: false, signal };
        }
        events = [...events, signal].slice(-config.maxEvents);
        return { accepted: true, signal };
      }

      function markClick(productId, query = "") {
        const safeProductId = String(productId || "").trim();
        const queryKey = normalizeKey(query || "");
        for (let index = events.length - 1; index >= 0; index -= 1) {
          const event = events[index];
          if ((!queryKey || event.queryKey === queryKey) && !event.clickedProductId) {
            events[index] = {
              ...event,
              clickedProductId: safeProductId,
              noClick: false
            };
            return events[index];
          }
        }
        return null;
      }

      function markNoClick(query = "") {
        const queryKey = normalizeKey(query || "");
        const latest = [...events].reverse().find((event) => (!queryKey || event.queryKey === queryKey) && !event.clickedProductId);
        if (!latest) return null;
        latest.noClick = true;
        return latest;
      }

      function getEvents() {
        return events.slice();
      }

      return { record, markClick, markNoClick, getEvents };
    }

    function addAggregate(map, key, score, extra = {}) {
      const normalized = normalizeKey(key);
      if (!normalized || score <= 0) return;
      const current = map.get(normalized) || { key: normalized, count: 0, score: 0, ...extra };
      current.count += 1;
      current.score += score;
      Object.assign(current, extra);
      map.set(normalized, current);
    }

    function aggregate(events = [], options = {}) {
      const now = toFiniteNumber(options.now, Date.now());
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      const queryMap = new Map();
      const categoryMap = new Map();
      const colorMap = new Map();
      const regionMap = new Map();
      const zeroResultMap = new Map();
      const lowSupplyMap = new Map();

      (Array.isArray(events) ? events : []).forEach((event) => {
        const time = new Date(event.timestamp || 0).getTime();
        const age = Number.isFinite(time) ? Math.max(0, now - time) : monthMs;
        const recency = age <= weekMs ? 2.4 : age <= monthMs ? 1.2 : 0.45;
        const intent = event.clickedProductId ? 1.35 : event.zeroResult ? 1.55 : event.noClick ? 0.8 : 1;
        const score = recency * intent * Math.max(1, event.resultCount === 0 ? 2 : 1);
        addAggregate(queryMap, event.queryKey, score, {
          query: event.query,
          category: event.detectedCategory,
          color: event.detectedColor,
          location: event.location,
          source: event.source
        });
        addAggregate(categoryMap, event.detectedCategory, score);
        addAggregate(colorMap, event.detectedColor, score);
        addAggregate(regionMap, event.location, score);
        if (event.zeroResult) addAggregate(zeroResultMap, event.queryKey, score, { query: event.query, category: event.detectedCategory, location: event.location });
        if (event.resultCount > 0 && event.resultCount <= 3) addAggregate(lowSupplyMap, event.queryKey, score, { query: event.query, category: event.detectedCategory, supply: "low" });
      });

      const compact = (map, mapper = (item) => item) => Array.from(map.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, config.maxAggregates)
        .map((item) => mapper({ ...item, score: Math.round(item.score * 100) / 100 }));

      const trendingSearches = compact(queryMap, (item) => ({
        query: item.query || item.key,
        queryKey: item.key,
        category: item.category,
        color: item.color,
        location: item.location,
        source: item.source,
        searches: item.count,
        score: item.score
      }));
      const zeroResultOpportunities = compact(zeroResultMap, (item) => ({
        query: item.query || item.key,
        queryKey: item.key,
        category: item.category,
        location: item.location,
        searches: item.count,
        opportunity: "high",
        score: item.score
      }));
      const lowSupplyOpportunities = compact(lowSupplyMap, (item) => ({
        query: item.query || item.key,
        queryKey: item.key,
        category: item.category,
        supply: item.supply,
        searches: item.count,
        opportunity: item.score >= 8 ? "high" : "medium",
        score: item.score
      }));

      return {
        version: "search-demand-v1",
        generatedAt: new Date(now).toISOString(),
        privacy: "anonymous-aggregate-only",
        trendingSearches,
        fastestGrowingSearches: trendingSearches.slice(0, 10),
        mostSearchedCategories: compact(categoryMap, (item) => ({ category: item.key, searches: item.count, score: item.score })),
        mostSearchedColors: compact(colorMap, (item) => ({ color: item.key, searches: item.count, score: item.score })),
        regionalDemand: compact(regionMap, (item) => ({ region: item.key, searches: item.count, score: item.score })),
        zeroResultOpportunities,
        lowSupplyOpportunities,
        notificationCandidates: buildNotificationCandidates(trendingSearches, zeroResultOpportunities, lowSupplyOpportunities)
      };
    }

    function buildNotificationCandidates(trendingSearches = [], zeroResultOpportunities = [], lowSupplyOpportunities = []) {
      return [...trendingSearches, ...zeroResultOpportunities, ...lowSupplyOpportunities]
        .filter((item) => toFiniteNumber(item.searches, 0) >= config.notifyThreshold || toFiniteNumber(item.score, 0) >= config.notifyThreshold)
        .slice(0, 12)
        .map((item) => ({
          title: `${item.query || item.queryKey} demand is rising${item.location ? ` in ${item.location}` : ""}`,
          query: item.query || item.queryKey,
          category: item.category || "",
          location: item.location || "",
          thresholdMet: true,
          fairAccess: "similar-category-sellers-first-then-dashboard"
        }));
    }

    function createOpportunitySummary(analytics = {}) {
      return {
        marketOpportunities: [
          ...(analytics.zeroResultOpportunities || []).map((item) => ({ ...item, type: "zero_result" })),
          ...(analytics.lowSupplyOpportunities || []).map((item) => ({ ...item, type: "low_supply" })),
          ...(analytics.trendingSearches || []).map((item) => ({ ...item, type: "trending_search" }))
        ].slice(0, config.maxAggregates),
        notificationCandidates: analytics.notificationCandidates || [],
        privacy: analytics.privacy || "anonymous-aggregate-only"
      };
    }

    return {
      createSignal,
      createCollector,
      aggregate,
      createOpportunitySummary
    };
  }

  window.WingaModules.marketplace.createSearchDemandIntelligence = createSearchDemandIntelligence;
})();
