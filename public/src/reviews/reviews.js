(() => {
  function createReviewsModule(deps) {
    const {
      getCurrentUser,
      getCurrentOrders,
      getCurrentReviews,
      getReviewSummaries,
      getProducts,
      getProductDetailUiState,
      escapeHtml
    } = deps;

    function renderStars(rating) {
      const rounded = Math.round(Number(rating || 0));
      return `${"\u2605".repeat(Math.max(0, rounded))}${"\u2606".repeat(Math.max(0, 5 - rounded))}`;
    }

    function getProductReviewSummary(productId) {
      return getReviewSummaries()?.[productId] || { averageRating: 0, totalReviews: 0 };
    }

    function getSellerReviewSummary(sellerId) {
      if (!sellerId) {
        return { averageRating: 0, totalReviews: 0 };
      }
      const sellerProductIds = new Set(getProducts().filter((product) => product.uploadedBy === sellerId).map((product) => product.id));
      const sellerReviews = getCurrentReviews().filter((review) => sellerProductIds.has(review.productId));
      const totalReviews = sellerReviews.length;
      const averageRating = totalReviews
        ? Number((sellerReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / totalReviews).toFixed(1))
        : 0;
      return { averageRating, totalReviews };
    }

    function getProductReviews(productId, limit = 4) {
      return getCurrentReviews()
        .filter((review) => review.productId === productId)
        .sort((first, second) => new Date(second.date || 0).getTime() - new Date(first.date || 0).getTime())
        .slice(0, limit);
    }

    function canCurrentUserReviewProduct(product) {
      const currentUser = getCurrentUser();
      if (!currentUser || !product) {
        return false;
      }
      const alreadyReviewed = getCurrentReviews().some((review) => review.productId === product.id && review.userId === currentUser);
      if (alreadyReviewed) {
        return false;
      }
      return (getCurrentOrders()?.purchases || []).some((order) =>
        order.productId === product.id && order.status === "delivered"
      );
    }

    function renderProductReviewSummary(product) {
      const summary = getProductReviewSummary(product.id);
      if (!summary.totalReviews) {
        return `<p class="product-meta review-summary">No reviews yet</p>`;
      }
      return `
        <div class="review-summary">
          <span class="review-stars">${renderStars(summary.averageRating)}</span>
          <strong>${summary.averageRating.toFixed(1)}</strong>
          <span>${summary.totalReviews} review${summary.totalReviews === 1 ? "" : "s"}</span>
        </div>
      `;
    }

    function renderSellerReviewSummary(sellerId) {
      const summary = getSellerReviewSummary(sellerId);
      if (!summary.totalReviews) {
        return `<p class="product-meta review-summary">Rating ya muuzaji itaonekana baada ya reviews za kwanza.</p>`;
      }
      return `
        <div class="review-summary seller-review-summary">
          <span class="review-stars">${renderStars(summary.averageRating)}</span>
          <strong>${summary.averageRating.toFixed(1)}</strong>
          <span>${summary.totalReviews} review za muuzaji${summary.totalReviews === 1 ? "" : ""}</span>
        </div>
      `;
    }

    function getProductDetailReviewDraft(productId) {
      const uiState = getProductDetailUiState();
      if (uiState.reviewDraft.productId !== productId) {
        uiState.reviewDraft = {
          productId,
          rating: 5,
          comment: ""
        };
      }
      return uiState.reviewDraft;
    }

    function renderProductReviewForm(product) {
      if (!canCurrentUserReviewProduct(product)) {
        return "";
      }

      const draft = getProductDetailReviewDraft(product.id);
      return `
        <form class="product-review-form" data-product-review-form="${product.id}">
          <div class="product-review-stars" role="radiogroup" aria-label="Rate this product">
            ${[1, 2, 3, 4, 5].map((value) => `
              <button class="review-star-btn${draft.rating >= value ? " active" : ""}" type="button" data-review-rating="${value}" aria-label="Rate ${value} star${value === 1 ? "" : "s"}">\u2605</button>
            `).join("")}
          </div>
          <textarea data-review-comment="${product.id}" rows="3" maxlength="280" placeholder="Share a useful review kuhusu quality, size, response ya muuzaji, au delivery.">${escapeHtml(draft.comment || "")}</textarea>
          <div class="product-review-form-foot">
            <span class="meta-copy">Ni wateja waliokamilisha delivery tu wanaoweza ku-review.</span>
            <button class="action-btn buy-btn" type="submit">Submit Review</button>
          </div>
        </form>
      `;
    }

    function renderProductReviewsList(product) {
      const reviews = getProductReviews(product.id);
      if (!reviews.length) {
        return `<p class="empty-copy">Hakuna review bado. Mteja wa kwanza aliyekamilisha order anaweza kuanza hapa.</p>`;
      }
      return `
        <div class="product-reviews">
          ${reviews.map((review) => `
            <div class="review-line">
              <div class="review-line-head">
                <strong>${escapeHtml(review.userId)}</strong>
                <span class="review-stars">${renderStars(review.rating)}</span>
              </div>
              <p>${escapeHtml(review.comment)}</p>
              <small>${review.verifiedBuyer ? "Mteja aliyethibitishwa | " : ""}${new Date(review.date).toLocaleDateString("sw-TZ")}</small>
            </div>
          `).join("")}
        </div>
      `;
    }

    return {
      renderStars,
      getProductReviewSummary,
      getSellerReviewSummary,
      getProductReviews,
      canCurrentUserReviewProduct,
      renderProductReviewSummary,
      renderSellerReviewSummary,
      getProductDetailReviewDraft,
      renderProductReviewForm,
      renderProductReviewsList
    };
  }

  window.WingaModules.reviews.createReviewsModule = createReviewsModule;
})();
