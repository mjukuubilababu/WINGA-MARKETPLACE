(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WingaCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TOP_CATEGORY_VALUES = ["wanawake", "wanaume", "watoto", "viatu", "accessories"];

  function normalizeSearchValue(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function createProductSearchText(product) {
    return normalizeSearchValue(`${product?.name || ""} ${product?.shop || ""}`);
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
