(() => {
  function createProductDetailUiModule(deps) {
    function ensureProductDetailModal() {
      let modal = document.getElementById("product-detail-modal");
      if (modal) {
        return modal;
      }

      modal = document.createElement("div");
      modal.id = "product-detail-modal";
      modal.style.display = "none";
      const dialog = deps.createElement("div", {
        className: "product-detail-dialog",
        attributes: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "product-detail-title"
        }
      });
      const topbar = deps.createElement("div", {
        className: "product-detail-topbar"
      });
      topbar.appendChild(deps.createElement("button", {
        className: "product-detail-back",
        textContent: "\u2190",
        attributes: {
          type: "button",
          "aria-label": "Go back from product detail",
          "data-close-product-detail": "true"
        }
      }));
      dialog.append(
        topbar,
        deps.createElement("div", { attributes: { id: "product-detail-content" } })
      );
      modal.replaceChildren(dialog);
      document.body.appendChild(modal);
      return modal;
    }

    function createDetailSectionHeading(eyebrow, title) {
      const heading = deps.createElement("div", { className: "section-heading" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: eyebrow }),
        deps.createElement("h3", { textContent: title })
      );
      heading.appendChild(copy);
      return heading;
    }

    function createProductDetailContentElement(params) {
      const {
        product,
        seller,
        otherProducts,
        relatedProducts,
        sponsoredProducts,
        mainImage,
        showFloatingHomeAction,
        floatingHomeVariant,
        productReviewSummaryMarkup,
        sellerReviewSummaryMarkup,
        reviewFormMarkup,
        reviewListMarkup
      } = params;

      const safeProductName = deps.escapeHtml(product.name || "");
      const safeCategoryLabel = deps.escapeHtml(deps.getCategoryLabel(product.category));
      const safeSellerName = deps.escapeHtml(seller?.fullName || product.shop || product.uploadedBy || "");

      const safeMainImage = deps.sanitizeImageSource(mainImage, deps.getImageFallbackDataUri("WINGA"));

      const wrapper = deps.createElement("div");
      const layout = deps.createElement("div", { className: "product-detail-layout" });
      const media = deps.createElement("div", { className: "product-detail-media" });
      const mainImageElement = deps.createElement("img", {
        className: "product-detail-image zoomable-image",
        attributes: {
          src: safeMainImage,
          alt: safeProductName,
          loading: "lazy",
          "data-zoom-src": safeMainImage,
          "data-zoom-alt": safeProductName,
          "data-image-action-product": product.id,
          "data-image-action-src": safeMainImage,
          "data-image-action-surface": "detail"
        }
      });
      mainImageElement.onerror = function handleDetailImageError() {
        this.onerror = null;
        this.src = deps.getImageFallbackDataUri("WINGA");
      };
      media.appendChild(mainImageElement);

      const copy = deps.createElement("div", { className: "product-detail-copy" });
      copy.append(
        deps.createElement("p", {
          className: "product-detail-price",
          textContent: deps.formatProductPrice(product.price)
        }),
        deps.createElement("h3", {
          textContent: safeProductName,
          attributes: { id: "product-detail-title" }
        }),
        deps.createElement("p", { className: "product-detail-category", textContent: safeCategoryLabel }),
        deps.createElement("p", { className: "product-detail-seller", textContent: `Muuzaji: ${safeSellerName}` })
      );
      const trustBadges = deps.renderMarketplaceTrustBadges?.(product);
      if (trustBadges) {
        copy.appendChild(deps.createFragmentFromMarkup(trustBadges));
      }

      const reviewStack = deps.createElement("div", { className: "product-detail-review-stack" });
      [productReviewSummaryMarkup, sellerReviewSummaryMarkup].filter(Boolean).forEach((markup) => {
        reviewStack.appendChild(deps.createFragmentFromMarkup(markup));
      });
      copy.appendChild(reviewStack);

      const actions = deps.createElement("div", { className: "product-detail-actions" });
      if (product.status === "approved") {
        actions.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Nunua",
          attributes: { type: "button", "data-detail-buy": product.id }
        }));
        actions.appendChild(deps.createElement("button", {
          className: "action-btn chat-btn",
          textContent: "Message",
          attributes: product.uploadedBy === deps.getCurrentUser()
            ? { type: "button", "data-open-own-messages": product.id }
            : { type: "button", "data-chat-product": product.id }
        }));
        if (deps.canRepostProduct?.(product)) {
          actions.appendChild(deps.createElement("button", {
            className: "action-btn action-btn-secondary",
            textContent: "Repost",
            attributes: { type: "button", "data-detail-repost": product.id }
          }));
        }
      } else {
        actions.append(
          deps.createElement("button", {
            className: "action-btn buy-btn is-disabled",
            textContent: "Nunua",
            attributes: { type: "button", disabled: "true", "aria-disabled": "true" }
          }),
          deps.createElement("button", {
            className: "action-btn chat-btn is-disabled",
            textContent: "Message",
            attributes: { type: "button", disabled: "true", "aria-disabled": "true" }
          })
        );
      }
      [deps.renderRequestBoxButton(product), deps.renderWhatsappChatLink(product, "WhatsApp")]
        .filter(Boolean)
        .forEach((markup) => actions.appendChild(deps.createFragmentFromMarkup(markup)));
      copy.appendChild(actions);

      const reviewsPanel = deps.createElement("section", { className: "product-detail-reviews-panel" });
      reviewsPanel.appendChild(createDetailSectionHeading("Ratings & Reviews", "Trust from real buyers"));
      [reviewFormMarkup, reviewListMarkup].filter(Boolean).forEach((markup) => {
        reviewsPanel.appendChild(deps.createFragmentFromMarkup(markup));
      });
      copy.appendChild(reviewsPanel);

      layout.append(media, copy);
      wrapper.appendChild(layout);

      if (otherProducts.length) {
        const section = deps.createElement("section", { className: "product-detail-seller-products" });
        section.appendChild(createDetailSectionHeading("Bidhaa Zaidi Kutoka Kwa Muuzaji", `Bidhaa nyingine kutoka kwa ${safeSellerName}`));
        const grid = deps.createElement("div", { className: "seller-products-grid" });
        otherProducts.forEach((item) => {
          const card = deps.createElement("article", {
            className: "seller-product-card",
            attributes: { "data-open-product": item.id }
          });
          const itemImage = deps.createElement("img", {
            className: "zoomable-image",
            attributes: {
              src: deps.sanitizeImageSource(item.image || "", deps.getImageFallbackDataUri("W")),
              alt: deps.escapeHtml(item.name || ""),
              loading: "lazy",
              "data-zoom-src": deps.sanitizeImageSource(item.image || "", deps.getImageFallbackDataUri("W")),
              "data-zoom-alt": deps.escapeHtml(item.name || "")
            }
          });
          itemImage.onerror = function handleSellerItemImageError() {
            this.onerror = null;
            this.src = deps.getImageFallbackDataUri("W");
          };
          card.append(
            itemImage,
            deps.createElement("strong", { textContent: deps.formatProductPrice(item.price) }),
            deps.createElement("span", { textContent: item.name || "" })
          );
          const itemTrustBadges = deps.renderMarketplaceTrustBadges?.(item);
          if (itemTrustBadges) {
            card.appendChild(deps.createFragmentFromMarkup(itemTrustBadges));
          }
          card.appendChild(deps.createFragmentFromMarkup(
            deps.renderProductActionGroup(item, { requestLabel: "Add to My Requests", extraClass: "seller-product-actions" })
          ));
          grid.appendChild(card);
        });
        section.appendChild(grid);
        wrapper.appendChild(section);
      }

      if (relatedProducts.length) {
        const section = deps.createElement("section", { className: "product-detail-seller-products" });
        section.appendChild(createDetailSectionHeading("Related Products", "Keep exploring similar products"));
        section.appendChild(deps.createFragmentFromMarkup(deps.renderDiscoveryProductCards(relatedProducts)));
        wrapper.appendChild(section);
      }

      if (sponsoredProducts.length) {
        const section = deps.createElement("section", { className: "product-detail-seller-products" });
        section.appendChild(createDetailSectionHeading("Sponsored Picks", "Promoted products you may also like"));
        section.appendChild(deps.createFragmentFromMarkup(deps.renderDiscoveryProductCards(sponsoredProducts, { sponsored: true })));
        wrapper.appendChild(section);
      }

      if (showFloatingHomeAction) {
        wrapper.appendChild(deps.createElement("button", {
          className: `product-detail-home-fab product-detail-home-fab-${floatingHomeVariant === "light" ? "light" : "dark"}`,
          textContent: "Home",
          attributes: {
            type: "button",
            "aria-label": "Go home from product detail",
            "data-product-detail-home": "true"
          }
        }));
      }

      return wrapper;
    }

    return {
      ensureProductDetailModal,
      createProductDetailContentElement
    };
  }

  window.WingaModules.productDetail.createProductDetailUiModule = createProductDetailUiModule;
})();
