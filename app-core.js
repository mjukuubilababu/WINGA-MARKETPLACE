(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WingaCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TOP_CATEGORY_VALUES = ["wanawake", "wanaume", "sherehe", "casual", "watoto", "viatu", "vyombo", "electronics", "vitu-used", "accessories"];
  const CATEGORY_INTENT_GROUPS = [
    {
      terms: ["suruali", "trouser", "trousers", "pant", "pants"],
      categories: ["wanawake-suruali", "wanaume-suruali-kitambaa", "wanaume-jeans", "wanaume-suruali"]
    },
    {
      terms: ["blouse", "blauzi"],
      categories: ["wanawake-blouse", "wanawake-blauzi"]
    },
    {
      terms: ["koti", "jacket", "coat"],
      categories: ["wanaume-koti", "wanaume-jacket"]
    },
    {
      terms: ["simu", "phone", "smartphone"],
      categories: ["electronics-simu"]
    },
    {
      terms: ["tv", "television"],
      categories: ["electronics-tv"]
    },
    {
      terms: ["desktop", "computer", "pc"],
      categories: ["electronics-desktop"]
    },
    {
      terms: ["laptop", "computer"],
      categories: ["electronics-laptop"]
    },
    {
      terms: ["vitenge", "kitenge"],
      categories: ["wanawake-vitenge"]
    },
    {
      terms: ["sherehe", "party", "occasion", "event"],
      categories: ["sherehe-mavazi", "sherehe-viatu", "sherehe-accessories"]
    },
    {
      terms: ["casual", "everyday", "daily", "weekend"],
      categories: ["casual-mavazi", "casual-viatu", "casual-kila-siku"]
    }
  ];

  function normalizeSearchValue(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildNormalizedTokenSet(...values) {
    const tokenSet = new Set();
    values.flat().forEach((entry) => {
      const normalized = normalizeSearchValue(entry).replace(/[^a-z0-9]+/g, " ").trim();
      if (!normalized) {
        return;
      }
      tokenSet.add(normalized);
      normalized.split(/\s+/).filter(Boolean).forEach((token) => tokenSet.add(token));
    });
    return tokenSet;
  }

  function getCategorySearchTerms(category) {
    const safeCategory = normalizeSearchValue(category).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!safeCategory) {
      return [];
    }

    const phrase = safeCategory.replace(/-/g, " ").trim();
    const parts = phrase.split(/\s+/).filter(Boolean);
    const tokenSet = buildNormalizedTokenSet(phrase, parts);

    if (parts.length > 1 && TOP_CATEGORY_VALUES.includes(parts[0])) {
      tokenSet.add(parts.slice(1).join(" "));
    }

    CATEGORY_INTENT_GROUPS.forEach((group) => {
      if (group.categories.includes(safeCategory)) {
        group.terms.forEach((term) => {
          buildNormalizedTokenSet(term).forEach((token) => tokenSet.add(token));
        });
      }
    });

    return Array.from(tokenSet);
  }

  function createProductSearchText(product) {
    const tokenSet = buildNormalizedTokenSet(
      product?.name || "",
      product?.shop || "",
      getCategorySearchTerms(product?.category || "")
    );
    return Array.from(tokenSet).join(" ");
  }

  function inferTopCategoryValue(category) {
    const safeCategory = String(category || "").trim().toLowerCase();
    if (!safeCategory) {
      return "";
    }

    if (TOP_CATEGORY_VALUES.includes(safeCategory)) {
      return safeCategory;
    }

    const prefixedTop = TOP_CATEGORY_VALUES.find((item) => safeCategory.startsWith(`${item}-`));
    return prefixedTop || "";
  }

  function filterProducts(options) {
    const {
      products = [],
      keyword = "",
      selectedCategory = "all",
      imageSignature = "",
      similarityThreshold = 0.72,
      similarityFn = () => 0
    } = options || {};

    const normalizedKeyword = normalizeSearchValue(keyword);
    const filtered = products.filter((product) => {
      const isVisibleStatus = product?.status === "approved";
      const matchesKeyword = !normalizedKeyword || (product?._searchText || createProductSearchText(product)).includes(normalizedKeyword);
      const matchesCategory = selectedCategory === "all"
        || product?.category === selectedCategory
        || inferTopCategoryValue(product?.category) === selectedCategory;
      return isVisibleStatus && matchesKeyword && matchesCategory;
    });

    if (!imageSignature) {
      return filtered;
    }

    return filtered
      .map((product) => ({
        ...product,
        imageMatchScore: similarityFn(imageSignature, product.imageSignature || "")
      }))
      .filter((product) => product.imageMatchScore >= similarityThreshold)
      .sort((first, second) => second.imageMatchScore - first.imageMatchScore);
  }

  function getShowcaseProducts(products = [], limit = 12) {
    return products
      .filter((product) => product?.status === "approved" && product?.availability !== "sold_out" && product?.image)
      .sort((first, second) => {
        const firstScore = (Number(first?.likes || 0) * 4) + Number(first?.views || 0);
        const secondScore = (Number(second?.likes || 0) * 4) + Number(second?.views || 0);
        return secondScore - firstScore;
      })
      .slice(0, limit);
  }

  function canRenderBuyButton(product, currentUser) {
    return Boolean(
      currentUser
      && product
      && product.uploadedBy !== currentUser
      && product.status === "approved"
      && product.availability !== "sold_out"
    );
  }

function getOrderActionState(order, currentUser, now = Date.now(), buyerCancelWindowMs = 48 * 60 * 60 * 1000) {
    if (!order || !currentUser) {
      return { canConfirm: false, canConfirmReceived: false, canCancel: false };
    }

    const createdAt = new Date(order.createdAt || 0).getTime();
    const isBuyer = order.buyerUsername === currentUser;
    const isSeller = order.sellerUsername === currentUser;

  return {
      canConfirm: isSeller && order.status === "paid" && order.paymentStatus === "paid",
      canConfirmReceived: isBuyer && order.status === "confirmed",
      canCancel: isBuyer && order.status === "placed" && (order.paymentStatus || "pending") === "pending" && now - createdAt >= buyerCancelWindowMs
  };
}

  function resolveBootView(hasValidSession) {
    return hasValidSession ? "home" : "login";
  }

  return {
    normalizeSearchValue,
    createProductSearchText,
    filterProducts,
    getShowcaseProducts,
    canRenderBuyButton,
    getOrderActionState,
    resolveBootView
  };
});
