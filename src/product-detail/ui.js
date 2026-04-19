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

    function createDeepLinkPanel(product) {
      if (!deps.isAdminUser?.()) {
        return null;
      }
      const deepLink = typeof deps.getProductDetailPath === "function"
        ? `${window.location.origin}${deps.getProductDetailPath(product.id)}`
        : `${window.location.origin}/product/${encodeURIComponent(String(product.id || "").trim())}`;
      const panel = deps.createElement("div", { className: "product-detail-deep-link panel" });
      panel.append(
        deps.createElement("p", { className: "eyebrow", textContent: "Admin Deep Link" }),
        deps.createElement("strong", { textContent: "Share this exact product route" }),
        deps.createElement("code", {
          className: "product-detail-deep-link-value",
          textContent: deepLink
        })
      );
      const actions = deps.createElement("div", { className: "product-detail-deep-link-actions" });
      actions.append(
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Copy Deep Link",
          attributes: {
            type: "button",
            "data-copy-product-deep-link": deepLink
          }
        }),
        deps.createElement("a", {
          className: "action-btn",
          textContent: "Open Link",
          attributes: {
            href: deepLink,
            target: "_blank",
            rel: "noopener noreferrer"
          }
        })
      );
      panel.appendChild(actions);
      return panel;
    }

    function createDetailCaptionElement(item) {
      const captionText = String(item.description || item.caption || item.name || "").trim();
      if (!captionText) {
        return null;
      }
      const wrapper = deps.createElement("div", {
        className: "product-card-caption-block"
      });
      wrapper.appendChild(deps.createElement("p", {
        className: "product-card-caption",
        textContent: captionText
      }));
      if (captionText.length > 120) {
        wrapper.classList.add("is-collapsed");
        const toggle = deps.createElement("button", {
          className: "product-caption-toggle",
          textContent: "See more",
          attributes: {
            type: "button",
            "data-product-caption-toggle": "true",
            "aria-expanded": "false"
          }
        });
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isExpanded = wrapper.classList.toggle("is-expanded");
          wrapper.classList.toggle("is-collapsed", !isExpanded);
          toggle.textContent = isExpanded ? "See less" : "See more";
          toggle.setAttribute("aria-expanded", String(isExpanded));
        });
        wrapper.appendChild(toggle);
      }
      return wrapper;
    }

    function createDetailContinuationSellerRowElement(item) {
      const sellerRow = deps.createElement("div", { className: "product-seller-row" });
      const sellerAvatar = deps.createElement("div", { className: "product-seller-avatar" });
      const sellerUser = deps.getMarketplaceUser?.(item?.uploadedBy);
      const sellerImage = String(sellerUser?.profileImage || "").trim();
      if (sellerImage) {
        sellerAvatar.appendChild(deps.createElement("img", {
          className: "product-seller-avatar-image",
          attributes: {
            src: sellerImage,
            alt: deps.escapeHtml(item.shop || sellerUser?.fullName || item.uploadedBy || "Seller"),
            loading: "lazy",
            decoding: "async"
          }
        }));
      } else {
        const label = String(item.shop || sellerUser?.fullName || item.uploadedBy || "Seller").trim();
        sellerAvatar.textContent = label
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join("")
          .toUpperCase() || "S";
      }

      const sellerCopy = deps.createElement("div", { className: "product-seller-copy" });
      sellerCopy.append(
        deps.createElement("strong", {
          className: "product-seller-name",
          textContent: String(item.shop || sellerUser?.fullName || item.uploadedBy || "Seller").trim()
        }),
        deps.createElement("span", {
          className: "product-seller-meta",
          textContent: String(item.location || deps.getCategoryLabel(item.category) || "").trim()
        })
      );

      sellerRow.append(
        sellerAvatar,
        sellerCopy,
        deps.createElement("span", {
          className: "product-seller-badge",
          textContent: sellerUser?.verifiedSeller ? "Verified" : "Seller"
        })
      );
      return sellerRow;
    }

    function createDetailContinuationCardElement(item) {
      const card = deps.createElement("article", {
        className: "product-card seller-product-card",
        attributes: { "data-open-product": item.id }
      });
      card.dataset.openProduct = item.id;
      const media = deps.createElement("div", {
        className: "product-card-media seller-product-card-media"
      });
      const galleryMarkup = deps.renderFeedGalleryMarkup?.(item, "feed");
      if (galleryMarkup) {
        media.appendChild(deps.createFragmentFromMarkup(galleryMarkup));
      } else {
        const itemImageSrc = deps.getMarketplacePrimaryImage
          ? deps.getMarketplacePrimaryImage(item, {
              allowOwnerVisibility: item.uploadedBy === deps.getCurrentUser()
            })
          : deps.sanitizeImageSource(item.image || "", deps.getImageFallbackDataUri("W"));
        media.appendChild(deps.createElement("img", {
          className: "zoomable-image",
          attributes: {
            src: itemImageSrc || deps.getImageFallbackDataUri("W"),
            alt: deps.escapeHtml(item.name || ""),
            loading: "lazy",
            "data-marketplace-scroll-image": "true",
            "data-zoom-src": itemImageSrc || deps.getImageFallbackDataUri("W"),
            "data-zoom-alt": deps.escapeHtml(item.name || ""),
            "data-image-action-product": item.id,
            "data-image-action-src": itemImageSrc || deps.getImageFallbackDataUri("W"),
            "data-image-action-surface": "detail-related",
            "data-fallback-src": deps.getImageFallbackDataUri("W")
          }
        }));
      }

      const body = deps.createElement("div", {
        className: "product-content product-content-simple product-content-social seller-product-body"
      });
      body.appendChild(createDetailContinuationSellerRowElement(item));
      const captionBlock = createDetailCaptionElement(item);
      if (captionBlock) {
        body.appendChild(captionBlock);
      }
      const itemTrustBadges = deps.renderMarketplaceTrustBadges?.(item, { hideVerifiedBadge: true });
      if (itemTrustBadges) {
        body.appendChild(deps.createFragmentFromMarkup(itemTrustBadges));
      }
      body.appendChild(deps.createFragmentFromMarkup(
        deps.renderProductActionGroup(item, { requestLabel: "Add to My Requests", extraClass: "seller-product-actions" })
      ));
      card.append(media, body);
      return card;
    }

    function createDetailShowcaseSectionElement({ eyebrow = "", title = "", items = [], attributes = {} } = {}) {
      const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!safeItems.length) {
        return null;
      }
      const section = deps.createElement("section", {
        className: "product-detail-seller-products",
        attributes
      });
      section.appendChild(createDetailSectionHeading(eyebrow || title, title || eyebrow));
      if (deps.renderDiscoveryProductCards) {
        section.appendChild(deps.createFragmentFromMarkup(
          deps.renderDiscoveryProductCards(safeItems, {
            sponsored: Boolean(attributes?.["data-product-detail-continuation-kind"] === "sponsored")
          })
        ));
        return section;
      }
      const track = deps.createElement("div", {
        className: "showcase-track product-detail-showcase-track"
      });
      safeItems.forEach((item) => track.appendChild(createDetailContinuationCardElement(item)));
      section.appendChild(track);
      return section;
    }

    function createProductDetailContentElement(params) {
      const {
        product,
        seller,
        otherProducts,
        continuationSections,
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

      const detailImages = deps.getRenderableMarketplaceImages
        ? deps.getRenderableMarketplaceImages(product, {
            allowOwnerVisibility: product.uploadedBy === deps.getCurrentUser()
          }).map((item) => deps.sanitizeImageSource(item || "", deps.getImageFallbackDataUri("W"))).filter(Boolean)
        : (Array.isArray(product.images) && product.images.length
          ? product.images.map((item) => deps.sanitizeImageSource(item || "", deps.getImageFallbackDataUri("W"))).filter(Boolean)
          : []);
      const safeMainImage = deps.sanitizeImageSource(mainImage || detailImages[0] || "", deps.getImageFallbackDataUri("WINGA"));

      const wrapper = deps.createElement("div");
      const layout = deps.createElement("div", { className: "product-detail-layout" });
      const media = deps.createElement("div", {
        className: `product-detail-media${detailImages.length > 1 ? " has-media-stack" : ""}`
      });
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
          "data-image-action-surface": "detail",
          "data-fallback-src": deps.getImageFallbackDataUri("WINGA")
        }
      });
      media.appendChild(mainImageElement);
      if (detailImages.length > 1) {
        const thumbGrid = deps.createElement("div", { className: "product-detail-thumb-grid" });
        detailImages.forEach((image, index) => {
          thumbGrid.appendChild(deps.createElement("img", {
            className: `product-detail-thumb${image === safeMainImage ? " active" : ""}`,
            attributes: {
              src: image,
              alt: `${safeProductName} ${index + 1}`,
              loading: "lazy",
              "data-detail-image": image,
              "data-detail-image-index": String(index),
              "data-disable-image-zoom": "true",
              "data-image-action-product": product.id,
              "data-image-action-src": image,
              "data-image-action-surface": "detail-thumb",
              "data-fallback-src": deps.getImageFallbackDataUri("W")
            }
          }));
        });
        media.appendChild(thumbGrid);
      }

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

      const sellerTrustPanel = deps.renderSellerTrustPanel?.(product);
      if (sellerTrustPanel) {
        copy.appendChild(deps.createFragmentFromMarkup(sellerTrustPanel));
      }

      const deepLinkPanel = createDeepLinkPanel(product);
      if (deepLinkPanel) {
        copy.appendChild(deepLinkPanel);
      }

      const reviewStack = deps.createElement("div", { className: "product-detail-review-stack" });
      [productReviewSummaryMarkup, sellerReviewSummaryMarkup].filter(Boolean).forEach((markup) => {
        reviewStack.appendChild(deps.createFragmentFromMarkup(markup));
      });
      copy.appendChild(reviewStack);

      const actions = deps.createElement("div", { className: "product-detail-actions" });
      const isOwnProduct = product.uploadedBy === deps.getCurrentUser();
      if (product.status === "approved" && !isOwnProduct) {
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
            textContent: "Uza",
            attributes: { type: "button", "data-detail-repost": product.id }
          }));
        }
      } else if (!isOwnProduct) {
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
      if (!isOwnProduct) {
        [deps.renderRequestBoxButton(product), deps.renderWhatsappChatLink(product, "WhatsApp")]
          .filter(Boolean)
          .forEach((markup) => actions.appendChild(deps.createFragmentFromMarkup(markup)));
      }
      if (actions.childNodes.length > 0) {
        copy.appendChild(actions);
      }

      const reviewsPanel = deps.createElement("section", { className: "product-detail-reviews-panel" });
      reviewsPanel.appendChild(createDetailSectionHeading("Ratings & Reviews", "Trust from real buyers"));
      [reviewFormMarkup, reviewListMarkup].filter(Boolean).forEach((markup) => {
        reviewsPanel.appendChild(deps.createFragmentFromMarkup(markup));
      });
      copy.appendChild(reviewsPanel);

      layout.append(media, copy);
      wrapper.appendChild(layout);

      if (otherProducts.length) {
        const section = createDetailShowcaseSectionElement({
          eyebrow: "Bidhaa Zaidi Kutoka Kwa Muuzaji",
          title: `Bidhaa nyingine kutoka kwa ${safeSellerName}`,
          items: otherProducts
        });
        if (section) {
          wrapper.appendChild(section);
        }
      }

      (Array.isArray(continuationSections) ? continuationSections : []).forEach((sectionConfig) => {
        const items = Array.isArray(sectionConfig?.items) ? sectionConfig.items : [];
        if (!items.length) {
          return;
        }
        const section = createDetailShowcaseSectionElement({
          eyebrow: sectionConfig.eyebrow || sectionConfig.title || "",
          title: sectionConfig.title || "",
          items
        });
        if (section) {
          wrapper.appendChild(section);
        }
      });

      if (params.enableContinuousDiscovery) {
        const anchor = deps.createElement("section", {
          className: "continuous-discovery-anchor",
          attributes: {
            "data-product-detail-continuous-anchor": "true"
          }
        });
        anchor.append(
          deps.createElement("p", { className: "eyebrow", textContent: "Winga is loading more" }),
          deps.createElement("strong", { textContent: "More products are lining up below" }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: "You keep getting more from this seller first, then wider marketplace picks follow."
          })
        );
        wrapper.appendChild(anchor);
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
      createProductDetailContentElement,
      createDetailShowcaseSectionElement
    };
  }

  window.WingaModules.productDetail.createProductDetailUiModule = createProductDetailUiModule;
})();
