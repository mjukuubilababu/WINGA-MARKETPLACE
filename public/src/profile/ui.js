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
      const verificationStatus = userProfile?.verificationStatus || (userProfile?.verifiedSeller ? "verified" : "unverified");
      const section = deps.createElement("section", {
        className: "panel",
        attributes: { id: "profile-identity-card" }
      });
      const shell = deps.createElement("div", { className: "profile-identity-shell" });
      const avatar = deps.createElement("div", { className: "profile-identity-avatar" });
      if (profileImage) {
        avatar.appendChild(deps.createProgressiveImage
          ? deps.createProgressiveImage({
            src: deps.sanitizeImageSource(profileImage, ""),
            alt: `${displayName} profile photo`,
            className: "profile-identity-image",
            fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
            placeholderSrc: deps.getImageFallbackDataUri?.("W") || "",
            attributes: {
              loading: "eager",
              "data-zoom-src": deps.sanitizeImageSource(profileImage, ""),
              "data-zoom-alt": `${displayName} profile photo`
            }
          })
          : deps.createElement("img", {
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
        className: "status-pill approved",
        textContent: "Active"
      }));
      whatsappWrap.appendChild(whatsappMeta);
      whatsappWrap.appendChild(deps.createElement("p", {
        className: "auth-note",
        textContent: "Hii ndiyo namba itakayotumika kwenye WhatsApp na contact zote za bidhaa zako."
      }));
      whatsappWrap.appendChild(deps.createElement("button", {
        className: "action-btn action-btn-secondary",
        textContent: "Edit WhatsApp Number",
        attributes: {
          type: "button",
          id: "profile-whatsapp-change-toggle"
        }
      }));
      const whatsappForm = deps.createElement("div", {
        className: "profile-whatsapp-form",
        attributes: {
          id: "profile-whatsapp-change-form",
          style: "display:none;"
        }
      });
      whatsappForm.append(
        deps.createElement("input", {
          attributes: {
            id: "profile-whatsapp-input",
            type: "tel",
            placeholder: "Namba mpya ya WhatsApp",
            value: context.whatsappNumber || context.phoneNumber || ""
          }
        }),
        deps.createElement("div", {
          className: "profile-whatsapp-form-actions"
        })
      );
      whatsappForm.querySelector(".profile-whatsapp-form-actions")?.append(
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Save Number",
          attributes: {
            type: "button",
            id: "profile-whatsapp-save-button"
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

      if (userProfile?.role === "seller") {
        const trustBlock = deps.createElement("div", { className: "profile-trust-block" });
        trustBlock.append(
          deps.createElement("strong", { textContent: "Trust profile" }),
          deps.createElement("p", {
            className: "auth-note",
            textContent: "Signals buyers see before they decide to message or buy."
          })
        );

        const trustFacts = deps.createElement("div", { className: "trust-badges profile-trust-facts" });
        trustFacts.appendChild(deps.createStatusPill(
          userProfile?.verifiedSeller ? "Verified seller" : "Unverified seller",
          userProfile?.verifiedSeller ? "approved" : "pending"
        ));
        if ((context.whatsappVerificationStatus || "verified") === "verified" && (context.whatsappNumber || userProfile?.phoneNumber)) {
          trustFacts.appendChild(deps.createStatusPill("WhatsApp verified", "approved"));
        }
        const joinedLabel = deps.formatMemberSinceLabel?.(userProfile?.createdAt || userProfile?.verificationSubmittedAt || "");
        if (joinedLabel) {
          trustFacts.appendChild(deps.createStatusPill(joinedLabel));
        }
        const sellerSummary = deps.getSellerReviewSummary?.(userProfile?.username || "");
        if (Number(sellerSummary?.totalReviews || 0) > 0) {
          trustFacts.appendChild(deps.createStatusPill(`${sellerSummary.averageRating.toFixed(1)} seller rating`));
        }
        if (trustFacts.childNodes.length) {
          trustBlock.appendChild(trustFacts);
        }
        copy.appendChild(trustBlock);
      }

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

    function createSellerUpgradeSectionElement(context = {}) {
      if (!context.canUpgradeToSeller && !context.canGetVerified) {
        return null;
      }

      const sectionTitle = "Seller Registration";
      const sectionEyebrow = "Seller upgrade";
      const sectionMeta = "Jina la duka na namba ya simu";
      const buttonLabel = "Open seller form";
      const submitLabel = "Become Seller";
      const guidanceCopy = "Jaza jina la duka na namba ya simu. Akaunti yako itaendelea kubaki wazi wakati role inabadilika.";

      const section = deps.createElement("section", {
        className: "panel profile-seller-upgrade-panel",
        attributes: { id: "profile-seller-upgrade-panel" }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: sectionEyebrow,
        title: sectionTitle,
        meta: sectionMeta
      }));

      const card = deps.createElement("div", { className: "orders-card profile-seller-upgrade-card" });
      card.append(
        deps.createElement("p", {
          className: "auth-note",
          textContent: guidanceCopy
        }),
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: buttonLabel,
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        })
      );

      const form = deps.createElement("div", {
        className: "profile-seller-upgrade-form",
        attributes: {
          id: "profile-seller-upgrade-form",
          style: "display:none;"
        }
      });
      form.append(
        deps.createElement("label", {
          className: "auth-label",
          textContent: "Jina la duka"
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-full-name",
            type: "text",
            maxlength: "120",
            placeholder: "Weka jina la duka",
            value: context.fullName || context.displayName || ""
          }
        }),
        deps.createElement("label", {
          className: "auth-label",
          textContent: "Namba ya simu"
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-phone-number",
            type: "tel",
            maxlength: "20",
            placeholder: "Namba ya simu ya akaunti",
            value: context.phoneNumber || context.whatsappNumber || ""
          }
        }),
        deps.createElement("label", {
          className: "auth-label",
          textContent: "Primary category"
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-category",
            type: "text",
            maxlength: "60",
            placeholder: "e.g. wanawake, vifaa, michezo",
            value: context.primaryCategory || ""
          }
        }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: "Hakikisha jina la duka na namba ya simu ni sahihi kabla ya kuendelea."
        }),
        deps.createElement("div", {
          className: "profile-seller-upgrade-actions"
        })
      );

      form.querySelector(".profile-seller-upgrade-actions")?.append(
        deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: submitLabel,
          attributes: {
            type: "button",
            "data-submit-seller-upgrade": "true"
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: "Cancel",
          attributes: {
            type: "button",
            "data-close-seller-upgrade": "true"
          }
        })
      );

      card.appendChild(form);
      section.appendChild(card);
      return section;
    }

    function createOrderLineElement(order) {
      const line = deps.createElement("div", { className: "order-line" });
      const lifecycle = typeof deps.getOrderLifecycleMeta === "function"
        ? deps.getOrderLifecycleMeta(order)
        : { label: deps.getStatusLabel(order.status), detail: "", tone: "" };
      const statusRow = deps.createElement("div", { className: "trust-badges" });
      statusRow.append(
        deps.createStatusPill(lifecycle.label || deps.getStatusLabel(order.status), lifecycle.tone || (order.status === "delivered" ? "approved" : order.status === "cancelled" ? "rejected" : order.status === "confirmed" ? "pending" : "")),
        deps.createStatusPill(`Payment: ${deps.getPaymentStatusLabel(order.paymentStatus)}`, order.paymentStatus === "paid" ? "approved" : order.paymentStatus === "failed" ? "rejected" : "")
      );
      line.append(
        deps.createElement("span", { textContent: order.productName || "" }),
        deps.createElement("small", {
          textContent: `${order.shop || order.sellerUsername || order.buyerUsername || ""} | ${deps.formatProductPrice(order.price)}${order.transactionId ? ` | TX: ${order.transactionId}` : ""}`
        }),
        statusRow
      );
      if (lifecycle.detail) {
        line.appendChild(deps.createElement("small", {
          className: "meta-copy order-lifecycle-copy",
          textContent: lifecycle.detail
        }));
      }
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
        sellerUpgradeMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup,
        notificationPermissionState,
        hasBuyerAccess,
        requestCount,
        canGetVerified
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
            label: stat.label,
            action: stat.action
          }));
        });
      fragment.appendChild(statsGrid);

      [
        identityMarkup,
        sellerUpgradeMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup
      ].filter(Boolean).forEach((content) => {
        appendRenderable(fragment, content);
      });

      const productsPanel = deps.createElement("section", {
        attributes: { id: "profile-products-panel" }
      });
      productsPanel.appendChild(deps.createSectionHeading({
        eyebrow: "Products",
        title: "Bidhaa zako zote"
      }));
      productsPanel.appendChild(deps.createElement("div", {
        className: "profile-product-grid",
        attributes: { id: "user-products-container" }
      }));
      fragment.appendChild(productsPanel);

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
      const browserPermission = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      const notificationStatus = browserPermission === "granted" || notificationPermissionState?.status === "allowed"
        ? "Enabled"
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? "Blocked"
          : notificationPermissionState?.status === "dismissed"
            ? "Paused"
            : "Not enabled";
      const notificationsEnabled = browserPermission === "granted" || notificationPermissionState?.status === "allowed";
      const notificationActionLabel = notificationsEnabled
        ? "Notifications enabled"
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? "Open notifications help"
          : "Enable notifications";
      const notificationCopy = browserPermission === "granted" || notificationPermissionState?.status === "allowed"
        ? "Notifications are on. You will get alerts for messages, orders, and important activity."
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? "Browser imezima notifications. Unaweza kujaribu tena au kubadili browser settings."
          : "Turn on notifications so you do not miss new messages, order updates, and important activity.";
      const notificationCard = deps.createElement("div", {
        className: "profile-notification-settings"
      });
      notificationCard.append(
        deps.createElement("p", { className: "auth-label", textContent: "Notifications" }),
        deps.createElement("p", { className: "auth-note", textContent: notificationCopy }),
        deps.createElement("div", {
          className: "profile-notification-row"
        })
      );
      const notificationRow = notificationCard.lastElementChild;
      notificationRow?.append(
        deps.createElement("span", {
          className: "status-pill",
          textContent: notificationStatus
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: notificationActionLabel,
          attributes: {
            type: "button",
            ...(notificationsEnabled ? { disabled: "true", "aria-disabled": "true" } : {}),
            "data-open-notification-permission": "true"
          }
        })
      );
      actionsCard.appendChild(notificationCard);
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
      if (canGetVerified) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Get Verified",
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        }));
      }
      if (context.canUpgradeToSeller) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: "Become Seller",
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
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

      const wrapper = deps.createElement("div", {
        className: "profile-shell"
      });
      wrapper.appendChild(fragment);
      return wrapper;
    }

    function createProfileProductCardElement(product, imageSrc = "", options = {}) {
      const { isPriority = false } = options || {};
      const images = getProductImages(product);
      const firstImage = imageSrc || images[0] || deps.getImageFallbackDataUri?.("WINGA") || "";
      const article = deps.createElement("article", {
        className: "product-card profile-product-card",
        attributes: {
          "data-profile-product-card": product.id
        }
      });
      article.dataset.profileProductCard = product.id;
      if (imageSrc) {
        article.dataset.profileProductImage = imageSrc;
      }

      const media = deps.createElement("div", { className: "product-card-media profile-product-media" });
      const image = deps.createResponsiveImage
        ? (deps.createProgressiveImage
          ? deps.createProgressiveImage({
              src: firstImage,
              alt: product?.name || "Product image",
              className: "profile-product-stage",
              fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
              placeholderSrc: deps.getImageFallbackDataUri?.("W") || "",
              attributes: {
                "data-disable-image-zoom": "true",
                loading: isPriority ? "eager" : "lazy",
                fetchpriority: isPriority ? "high" : "auto"
              }
            })
          : deps.createResponsiveImage({
            src: firstImage,
          alt: product?.name || "Product image",
          className: "profile-product-stage",
          fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
          attributes: {
            "data-disable-image-zoom": "true",
            loading: isPriority ? "eager" : "lazy",
            fetchpriority: isPriority ? "high" : "auto"
          }
        }))
      : deps.createElement("img", {
          className: "profile-product-stage",
          attributes: {
            src: firstImage,
            alt: product?.name || "Product image",
            loading: isPriority ? "eager" : "lazy",
            decoding: "async",
            fetchpriority: isPriority ? "high" : "auto"
          }
        });
      media.appendChild(image);

      article.appendChild(media);
      return article;
    }

    return {
      createProfileShellElement,
      createProfileProductCardElement,
      createProfileIdentitySectionElement,
      createSellerUpgradeSectionElement,
      createOrdersSectionElement,
      createPromotionOverviewSectionElement
    };
  }

  window.WingaModules.profile.createProfileUiModule = createProfileUiModule;
})();

