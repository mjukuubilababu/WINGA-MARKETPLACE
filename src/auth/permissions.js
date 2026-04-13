(() => {
  function createPermissionsHelpers(deps) {
    const {
      getCurrentSession,
      getCurrentUser,
      getCurrentView,
      getMarketplaceUser
    } = deps;

    function getCurrentUsername() {
      return String(getCurrentUser?.() || "").trim();
    }

    function hasValidSessionIdentity(session = getCurrentSession?.()) {
      const username = String(session?.username || "").trim();
      return Boolean(username && username === getCurrentUsername());
    }

    function normalizeRole(role) {
      const normalized = String(role || "").trim().toLowerCase();
      return ["buyer", "seller", "admin", "moderator"].includes(normalized) ? normalized : "";
    }

    function getResolvedRole() {
      const session = getCurrentSession?.();
      const sessionRole = normalizeRole(session?.role);
      if (sessionRole) {
        return sessionRole;
      }
      if (!hasValidSessionIdentity(session)) {
        return "";
      }
      const marketplaceRole = normalizeRole(getMarketplaceUser?.(getCurrentUsername())?.role);
      return marketplaceRole;
    }

    function isBuyerUser() {
      return getResolvedRole() === "buyer";
    }

    function isSellerUser() {
      return getResolvedRole() === "seller";
    }

    function canUseBuyerFeatures() {
      return isAuthenticatedUser() && (isBuyerUser() || isSellerUser());
    }

    function canUseSellerFeatures() {
      return isAuthenticatedUser() && isSellerUser();
    }

    function isAuthenticatedUser() {
      return hasValidSessionIdentity();
    }

    function shouldHideOwnProductsInMarketplace() {
      return false;
    }

    function isMarketplaceBrowseCandidate(product, options = {}) {
      const { allowOwn = false } = options;
      if (!product) {
        return false;
      }
      if (allowOwn) {
        return true;
      }
      if (!shouldHideOwnProductsInMarketplace()) {
        return true;
      }
      return product.uploadedBy !== getCurrentUser();
    }

    return {
      isBuyerUser,
      isSellerUser,
      canUseBuyerFeatures,
      canUseSellerFeatures,
      isAuthenticatedUser,
      shouldHideOwnProductsInMarketplace,
      isMarketplaceBrowseCandidate
    };
  }

  window.WingaModules.auth.createPermissionsHelpers = createPermissionsHelpers;
})();
