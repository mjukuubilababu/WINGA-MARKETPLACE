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
  const SEARCH_STOP_WORDS = new Set(["a", "an", "the", "and", "or", "na", "ya", "za", "wa", "la", "cha", "vya", "kwa", "bila", "with"]);
  const CATEGORY_INTENT_GROUPS = [
    {
      terms: ["suruali", "trouser", "trousers", "pant", "pants"],
      categories: ["wanawake-suruali", "wanaume-suruali-kitambaa", "wanaume-jeans", "wanaume-suruali"]
    },
    {
      terms: ["kiatu", "viatu", "shoe", "shoes", "sneaker", "sneakers"],
      categories: ["viatu", "sherehe-viatu", "casual-viatu", "watoto-viatu"]
    },
    {
      terms: ["blouse", "blauzi"],
      categories: ["wanawake-blouse", "wanawake-blauzi"]
    },
    {
      terms: ["gauni", "dress", "dresses", "gown"],
      categories: ["wanawake-gauni", "sherehe-mavazi"]
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

  function getSearchTokenVariants(token) {
    const normalized = normalizeSearchValue(token);
    const variants = new Set();
    if (!normalized) {
      return variants;
    }

    variants.add(normalized);
    if (normalized.length > 3 && normalized.endsWith("s")) {
      variants.add(normalized.slice(0, -1));
    } else if (normalized.length > 2) {
      variants.add(`${normalized}s`);
    }
    if (normalized.length > 4 && normalized.endsWith("ies")) {
      variants.add(`${normalized.slice(0, -3)}y`);
    } else if (normalized.length > 2 && normalized.endsWith("y")) {
      variants.add(`${normalized.slice(0, -1)}ies`);
    }
    return variants;
  }

  function getCategorySearchTerms(category) {
    const safeCategory = normalizeSearchValue(category).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!safeCategory) {
      return [];
    }

    const phrase = safeCategory.replace(/-/g, " ").trim();
    const parts = phrase.split(/\s+/).filter(Boolean);
    const tokenSet = buildNormalizedTokenSet(phrase, parts);
    const topCategory = parts.length > 0 && TOP_CATEGORY_VALUES.includes(parts[0]) ? parts[0] : "";

    if (parts.length > 1 && TOP_CATEGORY_VALUES.includes(parts[0])) {
      tokenSet.add(parts.slice(1).join(" "));
    }

    CATEGORY_INTENT_GROUPS.forEach((group) => {
      if (group.categories.includes(safeCategory) || (topCategory && group.categories.includes(topCategory))) {
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
      product?.uploadedBy || "",
      product?.sellerName || "",
      product?.fullName || "",
      getCategorySearchTerms(product?.category || "")
    );
    return Array.from(tokenSet).join(" ");
  }

  function getProductSearchSnapshot(product) {
    const searchText = product?._searchText || createProductSearchText(product);
    if (product && !product._searchText) {
      product._searchText = searchText;
    }
    if (product?._searchTokenSource !== searchText) {
      product._searchTokenSource = searchText;
      product._searchTokens = Array.from(buildNormalizedTokenSet(searchText));
    }
    return {
      searchText,
      tokenSet: new Set(product?._searchTokens || Array.from(buildNormalizedTokenSet(searchText)))
    };
  }

  function getSearchQueryDescriptor(keyword) {
    const normalizedKeyword = normalizeSearchValue(keyword);
    const rawTokens = normalizedKeyword.split(/\s+/).filter(Boolean);
    const meaningfulTokens = rawTokens.filter((token) => !SEARCH_STOP_WORDS.has(token));
    const clauseTokens = meaningfulTokens.length ? meaningfulTokens : rawTokens;
    const clauses = clauseTokens.map((token) => {
      const clauseSet = new Set(getSearchTokenVariants(token));
      CATEGORY_INTENT_GROUPS.forEach((group) => {
        const groupTerms = buildNormalizedTokenSet(group.terms);
        const clauseVariants = Array.from(clauseSet);
        if (clauseVariants.some((variant) => groupTerms.has(variant))) {
          group.terms.forEach((term) => buildNormalizedTokenSet(term).forEach((item) => clauseSet.add(item)));
          group.categories.forEach((category) => {
            getCategorySearchTerms(category).forEach((item) => {
              if (item && !TOP_CATEGORY_VALUES.includes(item)) {
                clauseSet.add(item);
              }
            });
          });
        }
      });
      return Array.from(clauseSet).filter(Boolean);
    });

    const expandedTerms = new Set();
    if (normalizedKeyword) {
      expandedTerms.add(normalizedKeyword);
    }
    clauses.flat().forEach((term) => {
      if (term && (!SEARCH_STOP_WORDS.has(term) || term.length > 2)) {
        expandedTerms.add(term);
      }
    });

    return {
      normalizedKeyword,
      clauses,
      expandedTerms: Array.from(expandedTerms),
      tokens: clauseTokens
    };
  }

  function searchSnapshotMatchesTerm(searchText, tokenSet, term) {
    const normalizedTerm = normalizeSearchValue(term);
    if (!normalizedTerm) {
      return false;
    }

    if (searchText.includes(normalizedTerm)) {
      return true;
    }

    const termTokens = normalizedTerm.split(/\s+/).filter(Boolean);
    return termTokens.every((token) => {
      if (tokenSet.has(token)) {
        return true;
      }
      if (token.length < 3) {
        return false;
      }
      for (const candidate of tokenSet) {
        if (candidate === token) {
          return true;
        }
        if (candidate.length >= 3 && (candidate.startsWith(token) || token.startsWith(candidate))) {
          return true;
        }
      }
      return false;
    });
  }

  function matchesKeywordAgainstProduct(product, keyword) {
    const descriptor = getSearchQueryDescriptor(keyword);
    if (!descriptor.normalizedKeyword) {
      return true;
    }

    const { searchText, tokenSet } = getProductSearchSnapshot(product);
    if (searchText.includes(descriptor.normalizedKeyword)) {
      return true;
    }

    return descriptor.clauses.every((clause) =>
      clause.some((term) => searchSnapshotMatchesTerm(searchText, tokenSet, term))
    );
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

    const filtered = products.filter((product) => {
      const isVisibleStatus = product?.status === "approved";
      const matchesKeyword = matchesKeywordAgainstProduct(product, keyword);
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

  function getOrderLifecycleMeta(order) {
    if (!order) {
      return {
        id: "unknown",
        label: "Status pending",
        detail: "Winga itaonyesha hatua ya order hapa.",
        tone: ""
      };
    }

    if (order.status === "cancelled" || order.paymentStatus === "failed" || order.paymentStatus === "cancelled") {
      return {
        id: "cancelled",
        label: "Cancelled",
        detail: "Request au order hii imefungwa na haitasonga mbele tena.",
        tone: "rejected"
      };
    }

    if (order.status === "delivered") {
      return {
        id: "completed",
        label: "Completed",
        detail: "Buyer amethibitisha kupokea mzigo, hivyo order imekamilika.",
        tone: "approved"
      };
    }

    if (order.status === "confirmed") {
      return {
        id: "agreed",
        label: "Agreed / confirmed",
        detail: "Seller amejibu na kuthibitisha order. Buyer sasa anasubiri kupokea mzigo na kukamilisha.",
        tone: "approved"
      };
    }

    if (order.status === "paid" || order.paymentStatus === "paid") {
      return {
        id: "seller_reviewing",
        label: "Seller reviewing",
        detail: "Malipo yamethibitishwa. Seller anatakiwa kujibu na kuthibitisha hatua inayofuata.",
        tone: "pending"
      };
    }

    return {
      id: "request_sent",
      label: "Request sent",
      detail: "Buyer ametuma request/order na reference ya malipo. Winga inasubiri verification kabla seller hajajibu.",
      tone: "pending"
    };
  }

  function resolveBootView(hasValidSession) {
    return hasValidSession ? "home" : "login";
  }

  return {
    normalizeSearchValue,
    getSearchQueryDescriptor,
    createProductSearchText,
    filterProducts,
    getShowcaseProducts,
    canRenderBuyButton,
    getOrderActionState,
    getOrderLifecycleMeta,
    resolveBootView
  };
});
