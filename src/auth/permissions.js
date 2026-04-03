(() => {
  function createPermissionsHelpers(deps) {
    const {
      getCurrentSession,
      getCurrentUser,
      getCurrentView
    } = deps;

    function isBuyerUser() {
      return getCurrentSession()?.role === "buyer";
    }

    function isSellerUser() {
      return getCurrentSession()?.role === "seller";
    }

    function canUseBuyerFeatures() {
      return isBuyerUser() || isSellerUser();
    }

    function canUseSellerFeatures() {
      return isSellerUser();
    }

    function isAuthenticatedUser() {
      const currentSession = getCurrentSession();
      return Boolean(getCurrentUser() && currentSession?.username);
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
