(() => {
  function createProfileUiModule(deps) {
    function appendRenderable(target, value) {
      if (!value) {
        return;
      }
      if (typeof value === "string") {
        target.appendChild(deps.createFragmentFromMarkup(value));
        return;
      }
      target.appendChild(value);
    }

    function getProductImages(product) {
      const source = Array.isArray(product?.images) && product.images.length > 0
        ? product.images
        : [product?.image];
      return source
        .map((image) => deps.sanitizeImageSource(image, deps.getImageFallbackDataUri?.("WINGA") || ""))
        .filter(Boolean);
    }

    function hasProductVideo(product) {
      return Boolean(
        product?.video
        || product?.videoUrl
        || (Array.isArray(product?.videos) && product.videos.some(Boolean))
        || /video/i.test(String(product?.mediaType || ""))
      );
    }

    function createProfileProductMenuElement(product) {
      const menu = deps.createElement("div", {
        className: "product-menu profile-product-menu",
        attributes: { "data-product-menu": product.id }
      });
      menu.appendChild(deps.createElement("button", {
        className: "product-menu-toggle profile-product-menu-toggle",
        textContent: "⋯",
        attributes: {
          type: "button",
          "aria-label": "Manage post",
          "data-menu-toggle": product.id
        }
      }));

      const popup = deps.createElement("div", {
        className: "product-menu-popup profile-product-menu-popup",
        attributes: { "data-menu-popup": product.id }
      });

      popup.append(
        deps.createElement("button", {
          className: "product-menu-item edit-btn",
          textContent: "Edit",
          attributes: { type: "button", "data-id": product.id }
        }),
        deps.createElement("button", {
          className: "product-menu-item delete-btn",
          textContent: "Delete",
          attributes: { type: "button", "data-id": product.id }
        })
      );

      if (product.status === "approved") {
        popup.appendChild(deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Promote",
          attributes: { type: "button", "data-promote-product": product.id }
        }));
      }

      if (product.status === "approved" && product.availability !== "sold_out") {
        popup.appendChild(deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Sold out",
          attributes: { type: "button", "data-product-soldout": product.id }
        }));
      }

      popup.append(
        deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Share",
          attributes: { type: "button", "data-menu-action": "share", "data-id": product.id }
        }),
        deps.createElement("button", {
          className: "product-menu-item",
          textContent: "Download",
          attributes: { type: "button", "data-menu-action": "download", "data-id": product.id }
        })
      );

      menu.appendChild(popup);
      return menu;
    }

    function createProfileIdentitySectionElement(userProfile, context = {}) {
      const displayName = context.displayName || "User";
      const profileImage = context.profileImage || "";
      const roleLabel = context.roleLabel || "User";
      const verificationStatus = userProfile?.verificationStatus || (userProfile?.verifiedSeller ? "verified" : "pending");
      const section = deps.createElement("section", {
        className: "panel",
        attributes: { id: "profile-identity-card" }
      });
      const shell = deps.createElement("div", { className: "profile-identity-shell" });
      const avatar = deps.createElement("div", { className: "profile-identity-avatar" });
      if (profileImage) {
        avatar.appendChild(deps.createElement("img", {
          className: "profile-identity-image zoomable-image",
          attributes: {
            src: deps.sanitizeImageSource(profileImage, ""),
            alt: `${displayName} profile photo`,
            loading: "lazy",
            decoding: "async",
            "data-zoom-src": deps.sanitizeImageSource(profileImage, ""),
            "data-zoom-alt": `${displayName} profile photo`
          }
        }));
      } else {
        avatar.appendChild(deps.createElement("span", {
          className: "profile-identity-initials",
          textContent: context.userInitials || "U"
        }));
      }

      const copy = deps.createElement("div", { className: "profile-identity-copy" });
      copy.append(
        deps.createElement("strong", { textContent: displayName }),
        deps.createElement("p", {
          className: "product-meta",
          textContent: `${roleLabel} account`
        })
      );
      if (userProfile?.role === "seller") {
        const verificationLine = deps.createElement("p", { className: "product-meta" });
        verificationLine.append("Verification: ");
        verificationLine.appendChild(deps.createElement("span", {
          className: `status-pill ${verificationStatus === "verified" ? "approved" : verificationStatus === "rejected" ? "rejected" : "pending"}`,
          textContent: deps.getVerificationStatusLabel(verificationStatus)
        }));
        copy.appendChild(verificationLine);
      }
      const whatsappWrap = deps.createElement("div", {
        className: "profile-whatsapp-block",
        attributes: { id: "profile-whatsapp-block" }
      });
      const whatsappMeta = deps.createElement("p", { className: "product-meta" });
      whatsappMeta.append("WhatsApp: ");
      whatsappMeta.appendChild(deps.createElement("strong", {
        textContent: context.whatsappNumber || "Haijawekwa"
      }));
      whatsappMeta.append(" ");
      whatsappMeta.appendChild(deps.createElement("span", {
        className: `status-pill ${(context.whatsappVerificationStatus || "verified") === "verified" ? "approved" : "pending"}`,
        textContent: (context.whatsappVerificationStatus || "verified") === "verified" ? "Verified" : "Pending"
      }));
      whatsappWrap.appendChild(whatsappMeta);
      if (context.pendingWhatsappNumber) {
        whatsappWrap.appendChild(deps.createElement("p", {
          className: "auth-note",
          textContent: `Pending change kwenda ${context.pendingWhatsappNumber}. Weka verification code kuthibitisha.`
        }));
      } else {
        whatsappWrap.appendChild(deps.createElement("p", {
          className: "auth-note",
          textContent: "Namba hii ndiyo hutumika mteja akibonyeza WhatsApp kwenye bidhaa zako."
        }));
      }
      whatsappWrap.appendChild(deps.createElement("button", {
        className: "action-btn action-btn-secondary",
        textContent: "Change WhatsApp Number",
        attributes: {
          type: "button",
          id: "profile-whatsapp-change-toggle"
        }
      }));
      const whatsappForm = deps.createElement("div", {
        className: "profile-whatsapp-form",
        attributes: {
          id: "profile-whatsapp-change-form",
          style: context.pendingWhatsappNumber ? "" : "display:none;"
        }
      });
      whatsappForm.append(
        deps.createElement("input", {
          attributes: {
            id: "profile-whatsapp-input",
            type: "tel",
            placeholder: "Namba mpya ya WhatsApp",
            value: context.pendingWhatsappNumber || context.whatsappNumber || ""
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: context.pendingWhatsappNumber ? "Resend Code" : "Send Code",
          attributes: {
            type: "button",
            id: "profile-whatsapp-request-button"
          }
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-whatsapp-code",
            type: "text",
            inputmode: "numeric",
            maxlength: "6",
            placeholder: "Verification code"
          }
        }),
        deps.createElement("div", {
          className: "profile-whatsapp-form-actions"
        })
      );
      whatsappForm.querySelector(".profile-whatsapp-form-actions")?.append(
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Verify WhatsApp",
          attributes: {
            type: "button",
            id: "profile-whatsapp-verify-button"
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Cancel",
          attributes: {
            type: "button",
            id: "profile-whatsapp-cancel-button"
          }
        })
      );
      whatsappWrap.appendChild(whatsappForm);
      copy.append(
        whatsappWrap,
        deps.createElement("label", {
          className: "upload-btn auth-upload-btn profile-photo-label",
          textContent: "Upload Profile Photo",
          attributes: { for: "profile-photo-input" }
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-photo-input",
            type: "file",
            accept: "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif",
            style: "display:none;"
          }
        }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: "Profile photo ni optional. Ukikosa, initials zitaendelea kuonekana.",
          attributes: { id: "profile-photo-status" }
        })
      );

      shell.append(avatar, copy);
      section.appendChild(shell);
      return section;
    }

    function createOrderLineElement(order) {
      const line = deps.createElement("div", { className: "order-line" });
      const statusRow = deps.createElement("div", { className: "trust-badges" });
      statusRow.append(
        deps.createStatusPill(deps.getStatusLabel(order.status), order.status === "delivered" ? "approved" : order.status === "cancelled" ? "rejected" : order.status === "confirmed" ? "pending" : ""),
        deps.createStatusPill(`Payment: ${deps.getPaymentStatusLabel(order.paymentStatus)}`, order.paymentStatus === "paid" ? "approved" : order.paymentStatus === "failed" ? "rejected" : "")
      );
      line.append(
        deps.createElement("span", { textContent: order.productName || "" }),
        deps.createElement("small", {
          textContent: `${order.shop || order.sellerUsername || order.buyerUsername || ""} | ${deps.formatProductPrice(order.price)}${order.transactionId ? ` | TX: ${order.transactionId}` : ""}`
        }),
        statusRow
      );
      if (order.paymentDate) {
        line.appendChild(deps.createElement("small", {
          textContent: `${order.paymentStatus === "paid" ? "Paid at" : "Submitted at"}: ${new Date(order.paymentDate).toLocaleString("sw-TZ")}`
        }));
      }
      const progressLabel = deps.getOrderProgressLabel?.(order);
      if (progressLabel) {
        line.appendChild(deps.createElement("small", {
          className: "meta-copy",
          textContent: progressLabel
        }));
      }
      const actions = deps.createElement("div", { className: "order-actions" });
      appendRenderable(actions, deps.getOrderActionButtons(order));
      line.appendChild(actions);
      return line;
    }

    function createOrdersSectionElement(orders) {
      const purchases = Array.isArray(orders?.purchases) ? orders.purchases : [];
      const sales = Array.isArray(orders?.sales) ? orders.sales : [];
      const section = deps.createElement("section", {
        attributes: { id: "profile-orders-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Orders",
        title: "Ununuzi na Mauzo",
        meta: `${purchases.length} nimenunua | ${sales.length} wameninunulia`
      }));

      const grid = deps.createElement("div", { className: "orders-grid" });
      const purchaseCard = deps.createElement("div", { className: "orders-card" });
      purchaseCard.appendChild(deps.createElement("strong", { textContent: "Nimenunua" }));
      if (purchases.length) {
        purchases.forEach((order) => purchaseCard.appendChild(createOrderLineElement(order)));
      } else {
        purchaseCard.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna bidhaa uliyonunua bado."
        }));
      }

      const salesCard = deps.createElement("div", { className: "orders-card" });
      salesCard.appendChild(deps.createElement("strong", { textContent: "Wameninunulia" }));
      if (sales.length) {
        sales.forEach((order) => salesCard.appendChild(createOrderLineElement(order)));
      } else {
        salesCard.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna order ya kuuza bado."
        }));
      }

      grid.append(purchaseCard, salesCard);
      section.appendChild(grid);
      return section;
    }

    function createPromotionGuideCardElement(type, option) {
      const card = deps.createElement("div", { className: "orders-card promotion-guide-card" });
      const copy = type === "boost"
        ? "Adds more visibility in discovery areas."
        : type === "featured"
          ? "Places your product in featured surfaces."
          : type === "category_boost"
            ? "Improves ranking inside category browsing."
            : "Pins the product higher for short premium bursts.";
      card.append(
        deps.createElement("strong", { textContent: option.label }),
        deps.createElement("small", {
          textContent: `TSh ${deps.formatNumber(option.amount)} | ${option.durationDays} day${option.durationDays === 1 ? "" : "s"}`
        }),
        deps.createElement("p", {
          className: "product-meta",
          textContent: copy
        })
      );
      return card;
    }

    function createPromotionOverviewSectionElement(context = {}) {
      if (!context.canUseSellerFeatures) {
        return null;
      }
      const section = deps.createElement("section", {
        attributes: { id: "profile-promotion-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Promotions",
        title: "Grow your visibility",
        meta: `${context.activePromotionsCount || 0} active promotion${context.activePromotionsCount === 1 ? "" : "s"}`
      }));

      const grid = deps.createElement("div", { className: "orders-grid promotion-guide-grid" });
      Object.entries(context.promotionOptions || {}).forEach(([type, option]) => {
        grid.appendChild(createPromotionGuideCardElement(type, option));
      });
      section.appendChild(grid);
      return section;
    }

    function createProfileShellElement(context) {
      const {
        displayName,
        accountMeta,
        stats,
        identityMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup,
        hasBuyerAccess,
        requestCount
      } = context;

      const fragment = document.createDocumentFragment();
      fragment.appendChild(deps.createSectionHeading({
        eyebrow: "Profile",
        title: displayName || "",
        meta: accountMeta || ""
      }));

      const statsGrid = deps.createElement("div", { className: "profile-stats" });
      (stats || []).forEach((stat) => {
        statsGrid.appendChild(deps.createStatBox({
          value: stat.value,
          label: stat.label
        }));
      });
      fragment.appendChild(statsGrid);

      [
        identityMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup
      ].filter(Boolean).forEach((content) => {
        appendRenderable(fragment, content);
      });

      fragment.appendChild(deps.createElement("div", {
        className: "profile-product-grid",
        attributes: { id: "user-products-container" }
      }));

      const actionsCard = deps.createElement("div", {
        attributes: { id: "profile-actions-card" }
      });
      actionsCard.append(
        deps.createElement("p", { className: "auth-label", textContent: "Account" }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: "Ukihitaji kutoka kwenye account yako, bonyeza hapa chini."
        })
      );
      if (hasBuyerAccess) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: `My Requests (${requestCount})`,
          attributes: {
            type: "button",
            "data-open-request-box": "true"
          }
        }));
      }
      actionsCard.appendChild(deps.createElement("button", {
        textContent: "Logout",
        attributes: {
          id: "profile-logout-button",
          type: "button"
        }
      }));
      fragment.appendChild(actionsCard);

      const wrapper = deps.createElement("div");
      wrapper.appendChild(fragment);
      return wrapper;
    }

    function createProfileProductCardElement(product) {
      const images = getProductImages(product);
      const firstImage = images[0] || deps.getImageFallbackDataUri?.("WINGA") || "";
      const article = deps.createElement("article", {
        className: "product-card profile-product-card",
        attributes: {
          "data-profile-product-card": product.id
        }
      });
      article.dataset.profileProductCard = product.id;

      const media = deps.createElement("div", { className: "profile-product-media" });
      const image = deps.createResponsiveImage
        ? deps.createResponsiveImage({
            src: firstImage,
            alt: product?.name || "Product image",
            className: "profile-product-stage",
            fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
            attributes: {
              "data-disable-image-zoom": "true"
            }
          })
        : deps.createElement("img", {
            className: "profile-product-stage",
            attributes: {
              src: firstImage,
              alt: product?.name || "Product image",
              loading: "lazy",
              decoding: "async"
            }
          });
      media.appendChild(image);

      const badges = deps.createElement("div", { className: "profile-product-badges" });
      if (hasProductVideo(product)) {
        badges.appendChild(deps.createElement("span", {
          className: "profile-product-badge profile-product-badge-video",
          textContent: "▶"
        }));
      }
      if (images.length > 1) {
        badges.appendChild(deps.createElement("span", {
          className: "profile-product-badge profile-product-badge-count",
          textContent: `+${Math.max(1, images.length - 1)}`
        }));
      }
      if (badges.childNodes.length) {
        media.appendChild(badges);
      }

      media.appendChild(createProfileProductMenuElement(product));

      if (product.status && product.status !== "approved") {
        media.appendChild(deps.createElement("span", {
          className: "profile-product-status-pill",
          textContent: deps.getStatusLabel(product.status)
        }));
      } else if (product.availability === "sold_out") {
        media.appendChild(deps.createElement("span", {
          className: "profile-product-status-pill sold-out",
          textContent: deps.getStatusLabel("sold_out")
        }));
      }

      const meta = deps.createElement("div", { className: "profile-product-meta" });
      meta.append(
        deps.createElement("strong", {
          className: "profile-product-title",
          textContent: product.name || ""
        }),
        deps.createElement("span", {
          className: "profile-product-price",
          textContent: deps.formatProductPrice(product.price)
        })
      );
      media.appendChild(meta);

      article.appendChild(media);
      return article;
    }

    return {
      createProfileShellElement,
      createProfileProductCardElement,
      createProfileIdentitySectionElement,
      createOrdersSectionElement,
      createPromotionOverviewSectionElement
    };
  }

  window.WingaModules.profile.createProfileUiModule = createProfileUiModule;
})();
