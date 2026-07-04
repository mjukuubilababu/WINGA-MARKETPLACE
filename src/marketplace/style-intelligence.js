(() => {
  function createStyleIntelligence(deps = {}) {
    const config = {
      maxSignalProducts: 80,
      maxProfileKeys: 14,
      maxStyleBoost: 180,
      signalWeights: {
        viewed: 14,
        liked: 42,
        saved: 42,
        shared: 34,
        purchased: 110,
        demand: 92,
        searched: 22,
        category: 28
      },
      priceBands: [
        { key: "budget", max: 25000 },
        { key: "value", max: 75000 },
        { key: "mid", max: 180000 },
        { key: "premium", max: 500000 },
        { key: "luxury", max: Number.POSITIVE_INFINITY }
      ],
      ...deps.config
    };

    const COLOR_WORDS = [
      "black", "white", "red", "blue", "green", "yellow", "pink", "purple", "brown", "grey", "gray",
      "orange", "gold", "silver", "cream", "beige", "navy", "maroon", "khaki", "wine"
    ];
    const SIZE_WORDS = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "small", "medium", "large", "free size"];
    const MATERIAL_WORDS = [
      "cotton", "denim", "leather", "silk", "linen", "wool", "chiffon", "lace", "satin", "polyester",
      "nylon", "suede", "velvet", "jersey", "knit", "canvas"
    ];
    const STYLE_WORDS = [
      "casual", "formal", "office", "party", "wedding", "streetwear", "sportswear", "classic", "elegant",
      "modest", "vintage", "minimal", "luxury", "school", "beach", "business"
    ];

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

    function addScore(map, key, score) {
      const normalized = normalizeKey(key);
      const safeScore = toFiniteNumber(score, 0);
      if (!normalized || safeScore <= 0) {
        return;
      }
      map.set(normalized, (map.get(normalized) || 0) + safeScore);
    }

    function addMany(map, values, score) {
      (Array.isArray(values) ? values : []).forEach((value) => addScore(map, value, score));
    }

    function wordsFromText(text, dictionary) {
      const lookup = ` ${normalizeLookupValue(text)} `;
      return dictionary.filter((word) => lookup.includes(` ${normalizeLookupValue(word)} `));
    }

    function flattenVariantText(product) {
      return (Array.isArray(product?.variants) ? product.variants : [])
        .map((variant) => `${variant?.name || ""} ${variant?.label || ""} ${variant?.color || ""} ${variant?.size || ""} ${variant?.material || ""}`)
        .join(" ");
    }

    function normalizeArrayField(value) {
      if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
      }
      const normalized = String(value || "").trim();
      return normalized ? normalized.split(/[,/|]+/).map((item) => item.trim()).filter(Boolean) : [];
    }

    function getPriceBand(product) {
      const price = toFiniteNumber(product?.price || product?.salePrice || product?.amount, 0);
      if (price <= 0) {
        return "";
      }
      const band = config.priceBands.find((entry) => price <= entry.max);
      return band?.key || "";
    }

    function extractStyleAttributes(product = {}) {
      const category = String(product.category || product.topCategory || "").trim();
      const topCategory = typeof deps.inferTopCategoryValue === "function"
        ? deps.inferTopCategoryValue(category)
        : category.split("-")[0];
      const text = [
        product.name,
        product.title,
        product.description,
        product.category,
        product.brand,
        product.material,
        product.color,
        product.size,
        flattenVariantText(product)
      ].filter(Boolean).join(" ");

      const colors = Array.from(new Set([
        ...normalizeArrayField(product.color || product.colors),
        ...wordsFromText(text, COLOR_WORDS)
      ].map(normalizeKey).filter(Boolean)));
      const sizes = Array.from(new Set([
        ...normalizeArrayField(product.size || product.sizes),
        ...wordsFromText(text, SIZE_WORDS)
      ].map(normalizeKey).filter(Boolean)));
      const materials = Array.from(new Set([
        ...normalizeArrayField(product.material || product.materials),
        ...wordsFromText(text, MATERIAL_WORDS)
      ].map(normalizeKey).filter(Boolean)));
      const fashionStyles = Array.from(new Set([
        ...normalizeArrayField(product.style || product.fashionStyle || product.styles),
        ...wordsFromText(text, STYLE_WORDS)
      ].map(normalizeKey).filter(Boolean)));

      return {
        category: normalizeKey(category),
        topCategory: normalizeKey(topCategory),
        brand: normalizeKey(product.brand || product.make || ""),
        colors,
        sizes,
        materials,
        fashionStyles,
        priceRange: getPriceBand(product)
      };
    }

    function createEmptyProfile() {
      return {
        categories: new Map(),
        topCategories: new Map(),
        colors: new Map(),
        sizes: new Map(),
        brands: new Map(),
        materials: new Map(),
        fashionStyles: new Map(),
        priceRanges: new Map(),
        signalCount: 0,
        totalWeight: 0,
        explanationSeeds: []
      };
    }

    function addProductSignal(profile, product, weight, source) {
      if (!product || weight <= 0) {
        return;
      }
      const attrs = extractStyleAttributes(product);
      addScore(profile.categories, attrs.category, weight * 1.15);
      addScore(profile.topCategories, attrs.topCategory, weight * 0.8);
      addScore(profile.brands, attrs.brand, weight * 0.75);
      addMany(profile.colors, attrs.colors, weight * 0.72);
      addMany(profile.sizes, attrs.sizes, weight * 0.52);
      addMany(profile.materials, attrs.materials, weight * 0.5);
      addMany(profile.fashionStyles, attrs.fashionStyles, weight * 0.62);
      addScore(profile.priceRanges, attrs.priceRange, weight * 0.58);
      profile.signalCount += 1;
      profile.totalWeight += weight;
      if (source && profile.explanationSeeds.length < 8) {
        profile.explanationSeeds.push(source);
      }
    }

    function addTextSignal(profile, text, weight, source) {
      if (!text || weight <= 0) {
        return;
      }
      const lookup = normalizeLookupValue(text);
      addMany(profile.colors, wordsFromText(lookup, COLOR_WORDS), weight * 0.65);
      addMany(profile.sizes, wordsFromText(lookup, SIZE_WORDS), weight * 0.42);
      addMany(profile.materials, wordsFromText(lookup, MATERIAL_WORDS), weight * 0.44);
      addMany(profile.fashionStyles, wordsFromText(lookup, STYLE_WORDS), weight * 0.58);
      addScore(profile.categories, lookup, weight * 0.25);
      profile.totalWeight += weight;
      if (source && profile.explanationSeeds.length < 8) {
        profile.explanationSeeds.push(source);
      }
    }

    function compactMap(map) {
      return Array.from(map.entries())
        .filter(([, score]) => score > 0)
        .sort((first, second) => second[1] - first[1])
        .slice(0, config.maxProfileKeys)
        .map(([key, score]) => ({ key, score: Math.round(score * 100) / 100 }));
    }

    function compactProfile(profile) {
      return {
        categories: compactMap(profile.categories),
        topCategories: compactMap(profile.topCategories),
        colors: compactMap(profile.colors),
        sizes: compactMap(profile.sizes),
        brands: compactMap(profile.brands),
        materials: compactMap(profile.materials),
        fashionStyles: compactMap(profile.fashionStyles),
        priceRanges: compactMap(profile.priceRanges),
        signalCount: profile.signalCount,
        totalWeight: Math.round(profile.totalWeight * 100) / 100,
        updatedAt: new Date().toISOString(),
        privacy: "aggregate-style-only",
        explanationSeeds: Array.from(new Set(profile.explanationSeeds)).slice(0, 6)
      };
    }

    function resolveProduct(entry, getProductById) {
      if (!entry) {
        return null;
      }
      if (entry.product && typeof entry.product === "object") {
        return entry.product;
      }
      if (entry.id || entry.category || entry.name || entry.title) {
        return entry;
      }
      const productId = String(entry.productId || entry.id || entry || "").trim();
      return productId && typeof getProductById === "function" ? getProductById(productId) : null;
    }

    function addSignals(profile, entries, weight, source, getProductById) {
      (Array.isArray(entries) ? entries : []).slice(0, config.maxSignalProducts).forEach((entry, index) => {
        const product = resolveProduct(entry, getProductById);
        const decay = Math.max(0.42, 1 - (index * 0.055));
        addProductSignal(profile, product, weight * decay, source);
      });
    }

    function buildStyleProfile(signals = {}, options = {}) {
      const profile = createEmptyProfile();
      const getProductById = typeof options.getProductById === "function" ? options.getProductById : null;
      const weights = config.signalWeights;

      addSignals(profile, signals.viewedProducts || signals.viewedProductIds, weights.viewed, "viewed", getProductById);
      addSignals(profile, signals.likedProducts || signals.likedProductIds, weights.liked, "liked", getProductById);
      addSignals(profile, signals.savedProducts || signals.savedProductIds, weights.saved, "saved", getProductById);
      addSignals(profile, signals.sharedProducts || signals.sharedProductIds, weights.shared, "shared", getProductById);
      addSignals(profile, signals.purchasedProducts || signals.purchasedProductIds, weights.purchased, "purchased", getProductById);
      addSignals(profile, signals.demandProducts || signals.demandProductIds, weights.demand, "demand", getProductById);
      (Array.isArray(signals.searchTerms) ? signals.searchTerms : []).forEach((term, index) => {
        addTextSignal(profile, term, weights.searched * Math.max(0.45, 1 - (index * 0.08)), "searched");
      });
      (Array.isArray(signals.categories) ? signals.categories : []).forEach((category, index) => {
        addScore(profile.categories, category, weights.category * Math.max(0.5, 1 - (index * 0.08)));
        addScore(profile.topCategories, category, weights.category * 0.64);
      });

      return compactProfile(profile);
    }

    function entriesToMap(entries = []) {
      const map = new Map();
      (Array.isArray(entries) ? entries : []).forEach((entry) => {
        if (entry?.key) {
          map.set(entry.key, toFiniteNumber(entry.score, 0));
        }
      });
      return map;
    }

    function scoreList(values, profileMap, multiplier) {
      return (Array.isArray(values) ? values : []).reduce((sum, value) => {
        const score = profileMap.get(normalizeKey(value)) || 0;
        return sum + (score * multiplier);
      }, 0);
    }

    function scoreProductStyle(product, profile = {}) {
      if (!profile || toFiniteNumber(profile.signalCount, 0) <= 0) {
        return { score: 0, reasons: [] };
      }
      const attrs = extractStyleAttributes(product);
      const categories = entriesToMap(profile.categories);
      const topCategories = entriesToMap(profile.topCategories);
      const colors = entriesToMap(profile.colors);
      const sizes = entriesToMap(profile.sizes);
      const brands = entriesToMap(profile.brands);
      const materials = entriesToMap(profile.materials);
      const fashionStyles = entriesToMap(profile.fashionStyles);
      const priceRanges = entriesToMap(profile.priceRanges);
      const parts = [
        ["category", Math.min(56, (categories.get(attrs.category) || 0) * 0.42)],
        ["category", Math.min(38, (topCategories.get(attrs.topCategory) || 0) * 0.36)],
        ["brand", Math.min(34, (brands.get(attrs.brand) || 0) * 0.3)],
        ["color", Math.min(34, scoreList(attrs.colors, colors, 0.24))],
        ["size", Math.min(22, scoreList(attrs.sizes, sizes, 0.2))],
        ["material", Math.min(26, scoreList(attrs.materials, materials, 0.22))],
        ["style", Math.min(34, scoreList(attrs.fashionStyles, fashionStyles, 0.26))],
        ["price", Math.min(22, (priceRanges.get(attrs.priceRange) || 0) * 0.18)]
      ].filter(([, score]) => score > 0);
      const score = Math.min(config.maxStyleBoost, parts.reduce((sum, [, value]) => sum + value, 0));
      return {
        score,
        reasons: Array.from(new Set(parts.sort((a, b) => b[1] - a[1]).map(([label]) => label))).slice(0, 3)
      };
    }

    function explainProductStyle(product, profile = {}) {
      const result = scoreProductStyle(product, profile);
      return result.reasons.map((reason) => `Matches your ${reason} preferences`);
    }

    return {
      extractStyleAttributes,
      buildStyleProfile,
      scoreProductStyle,
      explainProductStyle
    };
  }

  window.WingaModules.marketplace.createStyleIntelligence = createStyleIntelligence;
})();
