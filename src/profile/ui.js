(() => {
  function createProfileUiModule(deps) {
    const translate = typeof deps.translate === "function"
      ? deps.translate
      : (_key, _variables, fallbackText = "") => String(fallbackText || "");
    const t = (key, fallbackText = "", variables = {}) => translate(key, variables, fallbackText);
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
          "aria-label": t("profile.managePost", "Manage post"),
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
          textContent: t("common.edit", "Edit"),
          attributes: { type: "button", "data-id": product.id }
        }),
        deps.createElement("button", {
          className: "product-menu-item delete-btn",
          textContent: t("common.delete", "Delete"),
          attributes: { type: "button", "data-id": product.id }
        })
      );

      if (product.status === "approved") {
        popup.appendChild(deps.createElement("button", {
          className: "product-menu-item",
          textContent: t("common.promote", "Promote"),
          attributes: { type: "button", "data-promote-product": product.id }
        }));
      }

      if (product.status === "approved" && product.availability !== "sold_out") {
        popup.appendChild(deps.createElement("button", {
          className: "product-menu-item",
          textContent: t("product.soldOut", "Sold out"),
          attributes: { type: "button", "data-product-soldout": product.id }
        }));
      }

      popup.append(
        deps.createElement("button", {
          className: "product-menu-item",
          textContent: t("common.share", "Share"),
          attributes: { type: "button", "data-menu-action": "share", "data-id": product.id }
        }),
        deps.createElement("button", {
          className: "product-menu-item",
          textContent: t("common.download", "Download"),
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
            alt: t("profile.photoAlt", "{name} profile photo", { name: displayName }),
            className: "profile-identity-image",
            fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
            placeholderSrc: deps.getImageFallbackDataUri?.("W") || "",
            attributes: {
              loading: "eager",
              "data-zoom-src": deps.sanitizeImageSource(profileImage, ""),
              "data-zoom-alt": t("profile.photoAlt", "{name} profile photo", { name: displayName })
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
          textContent: t("profile.roleAccount", "{role} account", { role: roleLabel })
        })
      );
      if (userProfile?.role === "seller") {
        const verificationLine = deps.createElement("p", { className: "product-meta" });
        verificationLine.append(t("profile.verificationLabel", "Verification: "));
        verificationLine.appendChild(deps.createElement("span", {
          className: `status-pill ${verificationStatus === "verified" ? "approved" : verificationStatus === "rejected" ? "rejected" : "pending"}`,
          textContent: deps.getVerificationStatusLabel(verificationStatus)
        }));
        copy.appendChild(verificationLine);
        if (userProfile?.sellerStats?.trustScore) {
          const trustLine = deps.createElement("p", { className: "product-meta" });
          trustLine.append(t("profile.trustLabel", "Trust: "));
          trustLine.appendChild(deps.createElement("span", {
            className: "status-pill approved",
            textContent: `${userProfile.sellerStats.trustScore}/100`
          }));
          trustLine.append(` ${userProfile.sellerStats.trustTier || "Seller"}`);
          copy.appendChild(trustLine);
        }
        if (Number(userProfile?.sellerStats?.repeatBuyers || 0) > 0) {
          copy.appendChild(deps.createElement("p", {
            className: "product-meta",
            textContent: t("profile.repeatBuyers", "{count} repeat buyers", { count: userProfile.sellerStats.repeatBuyers })
          }));
        }
      }
      const whatsappWrap = deps.createElement("div", {
        className: "profile-whatsapp-block",
        attributes: { id: "profile-whatsapp-block" }
      });
      const whatsappMeta = deps.createElement("p", { className: "product-meta" });
      whatsappMeta.append(t("profile.whatsappLabel", "WhatsApp: "));
      whatsappMeta.appendChild(deps.createElement("strong", {
        textContent: context.whatsappNumber || t("common.notSet", "Not set")
      }));
      whatsappMeta.append(" ");
      whatsappMeta.appendChild(deps.createElement("span", {
        className: "status-pill approved",
        textContent: t("common.active", "Active")
      }));
      whatsappWrap.appendChild(whatsappMeta);
      whatsappWrap.appendChild(deps.createElement("p", {
        className: "auth-note",
        textContent: t("profile.whatsappHelp", "This number is used for WhatsApp and product contacts.")
      }));
      whatsappWrap.appendChild(deps.createElement("button", {
        className: "action-btn action-btn-secondary",
        textContent: t("profile.editWhatsapp", "Edit WhatsApp Number"),
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
            placeholder: t("profile.whatsappPlaceholder", "New WhatsApp number"),
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
          textContent: t("profile.saveNumber", "Save Number"),
          attributes: {
            type: "button",
            id: "profile-whatsapp-save-button"
          }
        }),
        deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: t("common.cancel", "Cancel"),
          attributes: {
            type: "button",
            id: "profile-whatsapp-cancel-button"
          }
        })
      );
      whatsappWrap.appendChild(whatsappForm);

      let paymentWrap = null;
      if (userProfile?.role === "seller") {
        paymentWrap = deps.createElement("div", {
          className: "profile-whatsapp-block profile-payment-block",
          attributes: { id: "profile-payment-block" }
        });
        const paymentMeta = deps.createElement("p", { className: "product-meta" });
        paymentMeta.append(t("profile.paymentNumberLabel", "Payment number: "));
        paymentMeta.appendChild(deps.createElement("strong", {
          textContent: context.paymentNumber || t("common.notSet", "Not set")
        }));
        paymentMeta.append(" ");
        paymentMeta.appendChild(deps.createElement("span", {
          className: `status-pill ${context.paymentNumber ? "approved" : ""}`,
          textContent: context.paymentNumber ? t("common.ready", "Ready") : t("common.pending", "Pending")
        }));
        paymentWrap.appendChild(paymentMeta);
        paymentWrap.appendChild(deps.createElement("p", {
          className: "auth-note",
          textContent: context.paymentRecipientName
            ? `Mpokeaji: ${context.paymentRecipientName}${context.paymentProvider ? ` | Mtandao: ${String(context.paymentProvider).replace(/_/g, " ").toUpperCase()}` : ""}`
            : t("profile.paymentHelp", "Add your payment number so buyers know who they are paying.")
        }));
        if (context.paymentInstructions) {
          paymentWrap.appendChild(deps.createElement("p", {
            className: "auth-note",
            textContent: context.paymentInstructions
          }));
        }
        paymentWrap.appendChild(deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: t("profile.editPayment", "Edit payment details"),
          attributes: {
            type: "button",
            id: "profile-payment-change-toggle"
          }
        }));
        const paymentForm = deps.createElement("div", {
          className: "profile-whatsapp-form",
          attributes: {
            id: "profile-payment-change-form",
            style: "display:none;"
          }
        });
        paymentForm.append(
          deps.createElement("input", {
            attributes: {
              id: "profile-payment-provider-input",
              type: "text",
              maxlength: "40",
              placeholder: t("profile.providerPlaceholder", "Provider, for example M-Pesa or Airtel Money"),
              value: context.paymentProvider || ""
            }
          }),
          deps.createElement("input", {
            attributes: {
              id: "profile-payment-number-input",
              type: "tel",
              placeholder: t("profile.paymentNumberPlaceholder", "Enter payment number"),
              value: context.paymentNumber || ""
            }
          }),
          deps.createElement("input", {
            attributes: {
              id: "profile-payment-recipient-input",
              type: "text",
              maxlength: "120",
              placeholder: t("profile.recipientPlaceholder", "Recipient name"),
              value: context.paymentRecipientName || context.displayName || ""
            }
          }),
          deps.createElement("textarea", {
            attributes: {
              id: "profile-payment-instructions-input",
              rows: "3",
              maxlength: "240",
              placeholder: t("profile.paymentInstructionsPlaceholder", "Short payment instructions for the buyer")
            },
            textContent: context.paymentInstructions || ""
          }),
          deps.createElement("div", {
            className: "profile-whatsapp-form-actions"
          })
        );
        paymentForm.querySelector(".profile-whatsapp-form-actions")?.append(
          deps.createElement("button", {
            className: "action-btn buy-btn",
            textContent: t("profile.savePayment", "Save payment details"),
            attributes: {
              type: "button",
              id: "profile-payment-save-button"
            }
          }),
          deps.createElement("button", {
            className: "action-btn action-btn-secondary",
            textContent: "Cancel",
            attributes: {
              type: "button",
              id: "profile-payment-cancel-button"
            }
          })
        );
        paymentWrap.appendChild(paymentForm);
      }

      if (userProfile?.role === "seller") {
        const trustBlock = deps.createElement("div", { className: "profile-trust-block" });
        trustBlock.append(
          deps.createElement("strong", { textContent: t("profile.trustProfile", "Trust profile") }),
          deps.createElement("p", {
            className: "auth-note",
            textContent: t("profile.trustHelp", "Signals buyers see before they decide to message or buy.")
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

      copy.append(whatsappWrap);
      if (paymentWrap) {
        copy.append(paymentWrap);
      }
      copy.append(
        deps.createElement("label", {
          className: "upload-btn auth-upload-btn profile-photo-label",
          textContent: t("profile.uploadPhoto", "Upload Profile Photo"),
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
          textContent: t("profile.photoOptionalStatus", "A profile photo is optional. Your initials remain visible without one."),
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
          textContent: t("profile.storeName", "Store name")
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-full-name",
            type: "text",
            maxlength: "120",
            placeholder: t("profile.storeNamePlaceholder", "Enter store name"),
            value: context.fullName || context.displayName || ""
          }
        }),
        deps.createElement("label", {
          className: "auth-label",
          textContent: t("profile.phoneNumber", "Phone number")
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-phone-number",
            type: "tel",
            maxlength: "20",
            placeholder: t("profile.phonePlaceholder", "Account phone number"),
            value: context.phoneNumber || context.whatsappNumber || ""
          }
        }),
        deps.createElement("label", {
          className: "auth-label",
          textContent: t("profile.primaryCategory", "Primary category")
        }),
        deps.createElement("input", {
          attributes: {
            id: "profile-seller-upgrade-category",
            type: "text",
            maxlength: "60",
            placeholder: t("profile.categoryPlaceholder", "For example women, equipment, sports"),
            value: context.primaryCategory || ""
          }
        }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: t("profile.sellerUpgradeCheck", "Confirm the store name and phone number before continuing.")
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
      if (order.transactionId || order.paymentProvider || order.paymentPhoneNumber) {
        const paymentFacts = [
          order.transactionId ? `Reference: ${order.transactionId}` : "",
          order.paymentProvider ? `Provider: ${String(order.paymentProvider).replace(/_/g, " ").toUpperCase()}` : "",
          order.paymentPhoneNumber ? `Lipa: ${order.paymentPhoneNumber}` : ""
        ].filter(Boolean);
        if (paymentFacts.length) {
          line.appendChild(deps.createElement("small", {
            className: "meta-copy",
            textContent: paymentFacts.join(" | ")
          }));
        }
      }
      if (order.status === "placed" && order.paymentStatus === "pending" && order.reserveExpiresAt) {
        line.appendChild(deps.createElement("small", {
          className: "meta-copy",
          textContent: `Reserved pending verification until ${new Date(order.reserveExpiresAt).toLocaleString("sw-TZ")}`
        }));
      }
      const progressLabel = deps.getOrderProgressLabel?.(order);
      if (progressLabel) {
        line.appendChild(deps.createElement("small", {
          className: "meta-copy",
          textContent: progressLabel
        }));
      }
      const actionStatus = deps.getOrderActionStatus?.(order.id);
      if (actionStatus?.message) {
        line.appendChild(deps.createElement("p", {
          className: `upload-form-status order-action-status${actionStatus.tone ? ` is-${actionStatus.tone}` : ""}`,
          textContent: actionStatus.message
        }));
      }
      const actions = deps.createElement("div", { className: "order-actions" });
      appendRenderable(actions, deps.getOrderActionButtons(order));
      const reviewAction = deps.getOrderReviewAction?.(order);
      if (reviewAction?.productId) {
        actions.appendChild(deps.createElement("button", {
          className: "action-btn action-btn-secondary",
          textContent: reviewAction.label || "Review product",
          attributes: {
            type: "button",
            "data-order-review-product": reviewAction.productId
          }
        }));
      }
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

    function createPromotionManagementSectionElement(context = {}) {
      if (!context.canUseSellerFeatures) {
        return null;
      }
      const section = deps.createElement("section", {
        attributes: { id: "profile-promotions-management-panel" }
      });
      const promotions = Array.isArray(context.promotions) ? context.promotions : [];
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Promotions",
        title: "Promotion status",
        meta: `${promotions.length} record${promotions.length === 1 ? "" : "s"}`
      }));

      if (!promotions.length) {
        section.appendChild(deps.createElement("p", {
          className: "empty-copy",
          textContent: "Hakuna promotion requests bado."
        }));
        return section;
      }

      const list = deps.createElement("div", { className: "orders-grid promotion-guide-grid" });
      promotions.forEach((promotion) => {
        const card = deps.createElement("div", { className: "orders-card promotion-guide-card" });
        const status = String(promotion?.status || "pending").trim() || "pending";
        const statusClass = status === "active" ? "approved" : status === "rejected" ? "rejected" : "pending";
        const amount = Number(promotion?.amountPaid || 0);
        const startDate = promotion?.startDate ? new Date(promotion.startDate) : null;
        const endDate = promotion?.endDate ? new Date(promotion.endDate) : null;
        const hasSchedule = startDate instanceof Date && !Number.isNaN(startDate.getTime()) && endDate instanceof Date && !Number.isNaN(endDate.getTime());
        card.append(
          deps.createElement("strong", { textContent: `${promotion.productName || promotion.productId || "Product"} | ${promotion.label || promotion.type}` }),
          deps.createStatusPill(status, statusClass),
          deps.createElement("small", {
            textContent: `TSh ${deps.formatNumber(amount)}${hasSchedule ? ` | ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}` : ""}`
          }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: `Reference: ${promotion.transactionReference || "-"}`
          })
        );
        list.appendChild(card);
      });
      section.appendChild(list);
      return section;
    }

    function createSessionSecuritySectionElement(context = {}) {
      const security = context.security || {};
      const section = deps.createElement("section", {
        className: "panel profile-session-security",
        attributes: { id: "profile-session-security-panel" }
      });
      const riskLevel = String(security.riskLevel || "low").trim().toLowerCase();
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Security",
        title: "Active sessions",
        meta: riskLevel === "high"
          ? "Security check needed"
          : riskLevel === "medium"
            ? "Session watch active"
            : "Session health looks normal"
      }));
      if (security.requiresStepUp) {
        const alert = deps.createElement("div", { className: "orders-card profile-session-alert" });
        alert.append(
          deps.createElement("strong", { textContent: "Thibitisha session" }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: "Tumeona mazingira mapya kwenye session yako. Weka password ili kuthibitisha kabla ya actions nyeti."
          })
        );
        const form = deps.createElement("form", {
          className: "profile-session-stepup-form",
          attributes: { id: "profile-session-stepup-form" }
        });
        form.append(
          deps.createElement("input", {
            className: "auth-input",
            attributes: {
              id: "profile-session-stepup-password",
              type: "password",
              autocomplete: "current-password",
              placeholder: "Password"
            }
          }),
          deps.createElement("button", {
            className: "action-btn buy-btn",
            textContent: "Verify session",
            attributes: { type: "submit" }
          })
        );
        alert.appendChild(form);
        section.appendChild(alert);
      }
      const list = deps.createElement("div", {
        className: "orders-grid profile-session-grid",
        attributes: { id: "profile-session-list", "aria-live": "polite" }
      });
      list.appendChild(deps.createElement("p", {
        className: "empty-copy",
        textContent: "Loading active sessions..."
      }));
      section.appendChild(list);
      return section;
    }

    function createProfileShellElement(context) {
      const {
        displayName,
        accountMeta,
        stats,
        identityMarkup,
        sellerUpgradeMarkup,
        savedIntentMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup,
        sessionSecurityMarkup,
        notificationPermissionState,
        hasBuyerAccess,
        requestCount,
        canGetVerified
      } = context;

      const fragment = document.createDocumentFragment();
      fragment.appendChild(deps.createSectionHeading({
        eyebrow: t("profile.heading", "Profile"),
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
        savedIntentMarkup,
        promotionsMarkup,
        requestsMarkup,
        ordersMarkup,
        notificationsMarkup,
        messagesMarkup,
        sessionSecurityMarkup
      ].filter(Boolean).forEach((content) => {
        appendRenderable(fragment, content);
      });

      const productsPanel = deps.createElement("section", {
        attributes: { id: "profile-products-panel" }
      });
      productsPanel.appendChild(deps.createSectionHeading({
        eyebrow: t("profile.productsEyebrow", "Products"),
        title: t("profile.productsTitle", "All your products")
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
        deps.createElement("p", { className: "auth-label", textContent: t("profile.account", "Account") }),
        deps.createElement("p", {
          className: "auth-note",
          textContent: t("profile.logoutHelp", "Use the button below when you need to sign out of your account.")
        })
      );
      const localizationContext = deps.getLocalizationContext?.() || {};
      const preferredLanguage = localizationContext.preference?.useDeviceLanguage !== false
        ? "device"
        : String(localizationContext.preference?.language || localizationContext.locale || "en").split("-")[0].toLowerCase();
      const languageCard = deps.createElement("div", { className: "profile-notification-settings profile-language-settings" });
      const languageSelect = deps.createElement("select", {
        className: "auth-input",
        attributes: {
          id: "profile-language-select",
          "data-profile-language-select": "true",
          "aria-label": t("language.selectorLabel", "App language")
        }
      });
      [
        ["device", t("language.device", "Device language")],
        ["en", "English"],
        ["sw", "Kiswahili"],
        ["fr", "Français"],
        ["ar", "العربية"]
      ].forEach(([value, label]) => {
        const option = deps.createElement("option", { textContent: label, attributes: { value } });
        if (value === preferredLanguage) option.selected = true;
        languageSelect.appendChild(option);
      });
      languageCard.append(
        deps.createElement("label", { className: "auth-label", textContent: t("language.selectorTitle", "Language"), attributes: { for: "profile-language-select" } }),
        deps.createElement("p", { className: "auth-note", textContent: t("language.selectorBody", "Choose the language Winga uses on this device.") }),
        languageSelect
      );
      actionsCard.appendChild(languageCard);

      const browserPermission = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      const notificationStatus = browserPermission === "granted" || notificationPermissionState?.status === "allowed"
        ? t("notification.statusEnabled", "Enabled")
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? t("notification.statusBlocked", "Blocked")
          : notificationPermissionState?.status === "dismissed"
            ? t("notification.statusPaused", "Paused")
            : t("notification.statusNotEnabled", "Not enabled");
      const notificationsEnabled = browserPermission === "granted" || notificationPermissionState?.status === "allowed";
      const notificationActionLabel = notificationsEnabled
        ? t("notification.enabledAction", "Notifications enabled")
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? t("notification.openHelpAction", "Open notifications help")
          : t("notification.enableAction", "Enable notifications");
      const notificationCopy = browserPermission === "granted" || notificationPermissionState?.status === "allowed"
        ? t("notification.profileEnabledBody", "Notifications are on. You will get alerts for messages, orders, and important activity.")
        : browserPermission === "denied" || notificationPermissionState?.status === "denied"
          ? t("notification.profileBlockedBody", "Browser imezima notifications. Unaweza kujaribu tena au kubadili browser settings.")
          : t("notification.promptBody", "Turn on notifications so you do not miss new messages, order updates, and important activity.");
      const notificationCard = deps.createElement("div", {
        className: "profile-notification-settings"
      });
      notificationCard.append(
        deps.createElement("p", { className: "auth-label", textContent: t("notification.eyebrow", "Notifications") }),
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
          textContent: t("profile.myRequests", "My Requests ({count})", { count: requestCount }),
          attributes: {
            type: "button",
            "data-open-request-box": "true"
          }
        }));
      }
      if (canGetVerified) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: t("profile.getVerified", "Get Verified"),
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        }));
      }
      if (context.canUpgradeToSeller) {
        actionsCard.appendChild(deps.createElement("button", {
          className: "action-btn buy-btn",
          textContent: t("profile.becomeSeller", "Become Seller"),
          attributes: {
            type: "button",
            "data-open-seller-upgrade": "true"
          }
        }));
      }
      actionsCard.appendChild(deps.createElement("button", {
        textContent: t("auth.logout", "Logout"),
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
      const fitMode = String(product.fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
      const article = deps.createElement("article", {
        className: `product-card profile-product-card fit-mode-${fitMode}`,
        attributes: {
          "data-profile-product-card": product.id,
          "data-fit-mode": fitMode
        }
      });
      article.dataset.profileProductCard = product.id;
      article.dataset.fitMode = fitMode;
      if (imageSrc) {
        article.dataset.profileProductImage = imageSrc;
      }

      const media = deps.createElement("div", { className: `product-card-media profile-product-media fit-mode-${fitMode}`, attributes: { "data-fit-mode": fitMode } });
      const image = deps.createResponsiveImage
        ? (deps.createProgressiveImage
          ? deps.createProgressiveImage({
              src: firstImage,
              alt: product?.name || "Product image",
              className: `profile-product-stage fit-mode-${fitMode}`,
              fallbackSrc: deps.getImageFallbackDataUri?.("WINGA") || "",
              placeholderSrc: deps.getImageFallbackDataUri?.("W") || "",
              fitMode,
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
      const actionStatus = deps.getProductActionStatus?.(product.id);
      if (actionStatus?.message) {
        article.appendChild(deps.createElement("p", {
          className: `upload-form-status profile-product-action-status${actionStatus.tone ? ` is-${actionStatus.tone}` : ""}`,
          textContent: actionStatus.message
        }));
      }
      if (product?.name) {
        article.appendChild(deps.createElement("span", {
          className: "visually-hidden",
          textContent: String(product.name)
        }));
      }
      return article;
    }

    return {
      createProfileShellElement,
      createProfileProductCardElement,
      createProfileIdentitySectionElement,
      createSellerUpgradeSectionElement,
      createOrdersSectionElement,
      createPromotionOverviewSectionElement
      ,
      createPromotionManagementSectionElement,
      createSessionSecuritySectionElement
    };
  }

  window.WingaModules.profile.createProfileUiModule = createProfileUiModule;
})();

