(() => {
  function createAdminControllerModule(deps) {
    let renderSequence = 0;
    let latestUsers = [];
    let investigationState = {
      username: "",
      user: null,
      reason: "",
      loading: false,
      detail: null,
      error: ""
    };

    function mapStatusClass(status = "") {
      const normalized = String(status || "").toLowerCase();
      if (normalized === "approved" || normalized === "active" || normalized === "verified" || normalized === "paid" || normalized === "resolved") {
        return "approved";
      }
      if (normalized === "rejected" || normalized === "banned" || normalized === "failed" || normalized === "disabled") {
        return "rejected";
      }
      if (normalized === "sold_out") {
        return "sold_out";
      }
      return "pending";
    }

    function createMetaCopy(text) {
      return deps.createElement("p", {
        className: "product-meta",
        textContent: text
      });
    }

    function createActionButton(label, dataset = {}, className = "button") {
      const button = deps.createElement("button", {
        className,
        textContent: label,
        attributes: { type: "button" }
      });
      Object.entries(dataset).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          button.dataset[key] = String(value);
        }
      });
      return button;
    }

    function buildProductDeepLink(productId) {
      const path = typeof deps.getProductDetailPath === "function"
        ? deps.getProductDetailPath(productId)
        : `/product/${encodeURIComponent(String(productId || "").trim())}`;
      return `${window.location.origin}${path}`;
    }

    function createDeepLinkRow(product) {
      if (!deps.isAdminUser?.()) {
        return null;
      }
      const deepLinkRow = deps.createElement("div", { className: "admin-deep-link-row" });
      const deepLinkValue = deps.createElement("code", {
        className: "admin-deep-link-value",
        textContent: buildProductDeepLink(product.id)
      });
      const copyButton = createActionButton("Copy Deep Link", {
        adminDeepLinkCopy: product.id
      }, "button action-btn action-btn-secondary");
      deepLinkRow.append(
        deps.createElement("strong", { textContent: "Deep Link" }),
        deepLinkValue,
        copyButton
      );
      return deepLinkRow;
    }

    function createDeepLinkCard(product) {
      const card = deps.createElement("article", {
        className: "moderation-card admin-deep-link-card",
        attributes: {
          "data-admin-deep-link-card": product.id
        }
      });
      const deepLink = buildProductDeepLink(product.id);
      card.append(
        deps.createElement("strong", { textContent: product.name || product.id }),
        createMetaCopy(`${product.shop || product.uploadedBy || "-"} | ${deps.getCategoryLabel?.(product.category) || product.category || "-"}`),
        deps.createElement("code", {
          className: "admin-deep-link-value",
          textContent: deepLink
        })
      );
      const actions = deps.createElement("div", { className: "moderation-actions admin-deep-link-actions" });
      actions.append(
        createActionButton("Copy Deep Link", {
          adminDeepLinkCopy: product.id
        }, "button action-btn action-btn-secondary"),
        deps.createElement("a", {
          className: "button action-btn",
          textContent: "Open Link",
          attributes: {
            href: deepLink,
            target: "_blank",
            rel: "noopener noreferrer"
          }
        })
      );
      card.appendChild(actions);
      return card;
    }

    function createSection(title, meta = "", bodyNode = null) {
      const section = deps.createElement("section", {
        className: "panel",
        attributes: {
          "data-admin-section": title
        }
      });
      section.appendChild(deps.createSectionHeading({
        eyebrow: "Admin",
        title,
        meta
      }));
      if (bodyNode) {
        section.appendChild(bodyNode);
      }
      return section;
    }

    function createLoadIssueState(message) {
      const wrapper = deps.createElement("div", { className: "empty-state" });
      wrapper.append(
        deps.createElement("strong", { textContent: "Section unavailable" }),
        deps.createElement("p", {
          className: "empty-copy",
          textContent: message || "Section hii haikuweza kupakia kwa sasa. Jaribu tena."
        }),
        createActionButton("Retry", {
          adminRefresh: "true"
        }, "button")
      );
      return wrapper;
    }

    function createAdminToolbar(state) {
      const toolbar = deps.createElement("section", { className: "panel" });
      const row = deps.createElement("div", { className: "section-heading" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: "Admin" }),
        deps.createElement("h3", { textContent: "Admin Console" }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: state.hasAnyLoadError
            ? "Baadhi ya admin data imekosa kupakia. Unaweza kuretry bila kuondoka kwenye panel."
            : "Usimamizi wa marketplace, moderation, na ops signals."
        })
      );
      row.appendChild(copy);
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.appendChild(createActionButton("Refresh Admin", {
        adminRefresh: "true"
      }));
      row.appendChild(actions);
      toolbar.appendChild(row);
      return toolbar;
    }

    function createVerificationPreview(user) {
      const preview = deps.createElement("div", { className: "admin-verification-preview" });
      const images = [
        { src: user.identityDocumentImage, alt: `${user.username} identity document` }
      ].filter((item) => item.src);
      if (!images.length) {
        return null;
      }
      images.forEach((item) => {
        preview.appendChild(deps.createProgressiveImage
          ? deps.createProgressiveImage({
            src: item.src,
            alt: item.alt,
            fallbackSrc: deps.getImageFallbackDataUri("ID"),
            placeholderSrc: deps.getImageFallbackDataUri("ID"),
            className: "admin-verification-image",
            attributes: {
              loading: "eager",
              fetchpriority: "high"
            }
          })
          : deps.createResponsiveImage({
          src: item.src,
          alt: item.alt,
          fallbackSrc: deps.getImageFallbackDataUri("ID"),
          className: "admin-verification-image",
          attributes: {
            loading: "eager",
            fetchpriority: "high"
          }
        }));
      });
      return preview;
    }

    function createUserActionPayload(action, note) {
      switch (action) {
        case "verify":
          return {
            verificationStatus: "verified",
            verifiedSeller: true,
            note
          };
        case "rejectVerification":
          return {
            verificationStatus: "rejected",
            verifiedSeller: false,
            note
          };
        case "activate":
          return {
            status: "active",
            reason: "staff_restore",
            note
          };
        case "suspend":
          return {
            status: "suspended",
            reason: "staff_suspend",
            note
          };
        case "ban":
          return {
            status: "banned",
            reason: "staff_ban",
            note
          };
        default:
          return null;
      }
    }

    function confirmUserAction(username, action) {
      if (!deps.confirmAction) {
        return true;
      }
      if (action === "verify") {
        return deps.confirmAction(`Una uhakika unataka kuthibitisha seller ${username}?`);
      }
      if (action === "activate") {
        return deps.confirmAction(`Una uhakika unataka kurudisha access ya user ${username}?`);
      }
      if (action === "rejectVerification") {
        return deps.confirmAction(`Una uhakika unataka kukataa verification ya ${username}?`);
      }
      if (action === "suspend") {
        return deps.confirmAction(`Una uhakika unataka kususpend user ${username}?`);
      }
      if (action === "ban") {
        return deps.confirmAction(`Una uhakika unataka kuban user ${username}? Hii ni hatua nzito.`);
      }
      return true;
    }

    function formatAuditTime(value) {
      if (!value) {
        return "-";
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return String(value);
      }
      try {
        return new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(parsed);
      } catch (error) {
        return parsed.toISOString();
      }
    }

    function ensureInvestigationModal() {
      let root = document.getElementById("admin-investigation-modal");
      if (root) {
        return root;
      }

      root = deps.createElement("div", {
        attributes: {
          id: "admin-investigation-modal",
          hidden: "true"
        }
      });
      root.innerHTML = `
        <div class="admin-investigation-backdrop" data-close-admin-investigation="true"></div>
        <div class="admin-investigation-dialog panel" role="dialog" aria-modal="true" aria-labelledby="admin-investigation-title">
          <button class="admin-investigation-close" type="button" aria-label="Close fraud review" data-close-admin-investigation="true">&times;</button>
          <div class="admin-investigation-body" data-admin-investigation-body="true"></div>
        </div>
      `;

      root.addEventListener("click", (event) => {
        const submitButton = event.target.closest("[data-admin-investigation-submit]");
        if (submitButton) {
          handleInvestigationSubmit(submitButton).catch((error) => {
            investigationState = {
              ...investigationState,
              loading: false,
              error: error.message || "Fraud review haikufunguka."
            };
            renderInvestigationModal();
          });
          return;
        }
        if (event.target.closest("[data-close-admin-investigation='true']")) {
          closeInvestigationModal();
        }
      });
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeInvestigationModal();
        }
      });

      document.body.appendChild(root);
      return root;
    }

    function closeInvestigationModal() {
      const root = document.getElementById("admin-investigation-modal");
      if (!root) {
        return;
      }
      root.hidden = true;
      root.classList.remove("open");
      investigationState = {
        username: "",
        user: null,
        reason: "",
        loading: false,
        detail: null,
        error: ""
      };
      root.querySelector("[data-admin-investigation-body='true']")?.replaceChildren();
    }

    function createInvestigationMetric(label, value) {
      const card = deps.createElement("div", { className: "analytics-card admin-investigation-metric" });
      card.append(
        deps.createElement("span", { textContent: label }),
        deps.createElement("strong", { textContent: String(value ?? 0) })
      );
      return card;
    }

    function createInvestigationTimeline(title, items, formatter, emptyCopy) {
      const section = deps.createElement("section", { className: "admin-investigation-section" });
      section.appendChild(deps.createElement("h4", {
        className: "admin-investigation-section-title",
        textContent: title
      }));
      const list = deps.createElement("div", { className: "analytics-list" });
      if (!items.length) {
        list.appendChild(deps.createEmptyState(emptyCopy));
      } else {
        items.forEach((item) => {
          list.appendChild(deps.createElement("div", {
            className: "analytics-list-item",
            textContent: formatter(item)
          }));
        });
      }
      section.appendChild(list);
      return section;
    }

    function renderInvestigationModal() {
      const root = ensureInvestigationModal();
      const body = root.querySelector("[data-admin-investigation-body='true']");
      if (!body || !investigationState.user) {
        return;
      }

      const user = investigationState.user;
      const summaryCards = deps.createElement("div", { className: "analytics-grid admin-investigation-metrics" });
      const detail = investigationState.detail;
      const summary = detail?.accountActivitySummary || {};
      summaryCards.append(
        createInvestigationMetric("Products", summary.productCount || user.productCount || 0),
        createInvestigationMetric("Open reports", summary.openReportsCount || user.openReportsCount || 0),
        createInvestigationMetric("Active sessions", summary.activeSessionCount || user.activeSessionCount || 0),
        createInvestigationMetric("Filed reports", summary.reportsFiledCount || user.reportsFiledCount || 0)
      );

      const header = deps.createElement("div", { className: "admin-investigation-header" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: "Fraud Review" }),
        deps.createElement("h3", {
          attributes: { id: "admin-investigation-title" },
          textContent: user.fullName || user.username
        }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: `@${user.username} | ${deps.getRoleLabel?.(user.role) || user.role}`
        })
      );
      const statusGroup = deps.createElement("div", { className: "trust-badges" });
      statusGroup.appendChild(deps.createStatusPill(user.status || "active", mapStatusClass(user.status)));
      statusGroup.appendChild(deps.createStatusPill(
        (detail?.identityVerificationStatus || user.verificationStatus || (user.verifiedSeller ? "verified" : "not_verified")).replaceAll("_", " "),
        mapStatusClass(detail?.identityVerificationStatus || user.verificationStatus || "")
      ));
      if ((detail?.suspiciousActivityIndicators || []).length || Number(user.suspiciousSignalCount || 0) > 0) {
        statusGroup.appendChild(deps.createStatusPill("Suspicious Activity", "pending"));
      }
      if ((summary.openReportsCount || user.openReportsCount || 0) > 0) {
        statusGroup.appendChild(deps.createStatusPill("Reported", "rejected"));
      }
      header.append(copy, statusGroup);

      const reasonField = deps.createElement("textarea", {
        attributes: {
          "data-admin-investigation-reason": "true",
          placeholder: "Eleza sababu ya kufungua fraud review hii"
        }
      });
      reasonField.value = investigationState.reason || "";

      const reasonActions = deps.createElement("div", { className: "moderation-actions" });
      const loadButton = createActionButton(
        investigationState.loading ? "Inafungua..." : "Open Fraud Review",
        { adminInvestigationSubmit: user.username },
        "button"
      );
      if (investigationState.loading) {
        loadButton.setAttribute("disabled", "true");
        reasonField.setAttribute("disabled", "true");
      }
      reasonActions.append(
        loadButton,
        createActionButton("Close", {
          closeAdminInvestigation: "true"
        }, "button button-secondary")
      );

      const reasonPanel = deps.createElement("section", { className: "admin-investigation-section" });
      reasonPanel.append(
        deps.createElement("p", {
          className: "meta-copy",
          textContent: "Enter a reason before loading sensitive fraud-review details. Every access is audited."
        }),
        reasonField,
        reasonActions
      );

      const nodes = [header, summaryCards, reasonPanel];
      if (investigationState.error) {
        nodes.push(deps.createElement("p", {
          className: "empty-copy admin-investigation-error",
          textContent: investigationState.error
        }));
      }

      if (detail) {
        const policy = deps.createElement("div", { className: "admin-investigation-policy panel" });
        policy.append(
          deps.createElement("strong", { textContent: "Message Evidence Access" }),
          deps.createElement("p", {
            className: "product-meta",
            textContent: detail.fraudReview?.policy || "Direct private messages are restricted."
          }),
          createMetaCopy(`Reported conversation evidence: ${detail.fraudReview?.reportedConversationEvidenceCount ?? 0}`)
        );
        nodes.push(policy);

        if (Array.isArray(detail.suspiciousActivityIndicators) && detail.suspiciousActivityIndicators.length) {
          const indicators = deps.createElement("div", { className: "admin-investigation-indicators" });
          detail.suspiciousActivityIndicators.forEach((indicator) => {
            const pill = deps.createElement("article", { className: "moderation-card admin-investigation-indicator" });
            pill.append(
              deps.createStatusPill(indicator.label || "Fraud Review", mapStatusClass(indicator.severity || "pending")),
              createMetaCopy(indicator.detail || "")
            );
            indicators.appendChild(pill);
          });
          nodes.push(createSection("Suspicious Activity", "Signals zinazohitaji fraud review ya karibu.", indicators));
        }

        nodes.push(createInvestigationTimeline(
          "Login & Account Activity",
          detail.loginActivity || [],
          (item) => `${formatAuditTime(item.time)} | ${item.event || "-"} | ${item.reason || item.statusCode || "-"}`,
          "Hakuna login history ya karibu."
        ));
        nodes.push(createInvestigationTimeline(
          "Recent Audit Trail",
          detail.recentActivity || [],
          (item) => `${formatAuditTime(item.time)} | ${item.event || "-"} | ${item.reason || item.path || "-"}`,
          "Hakuna audit trail ya karibu."
        ));
        nodes.push(createInvestigationTimeline(
          "Reports & Complaints",
          detail.reports || [],
          (item) => `${formatAuditTime(item.createdAt)} | ${item.reason || "-"} | ${item.status || "open"} | ${item.targetProductId || item.targetType || "-"}`,
          "Hakuna reports zinazohusiana na user huyu."
        ));
        nodes.push(createInvestigationTimeline(
          "Active Sessions",
          detail.activeSessions || [],
          (item) => `${formatAuditTime(item.createdAt)} | expires ${formatAuditTime(item.expiresAt)} | token ••••${item.tokenLast4 || ""}`,
          "Hakuna active sessions kwa sasa."
        ));
      }

      body.replaceChildren(...nodes);
      root.hidden = false;
      root.classList.add("open");
      root.querySelector("[data-admin-investigation-reason='true']")?.focus();
    }

    function openInvestigationModal(username) {
      const user = latestUsers.find((item) => item.username === username);
      if (!deps.isAdminUser?.() || !user) {
        return;
      }
      investigationState = {
        username,
        user,
        reason: "",
        loading: false,
        detail: null,
        error: ""
      };
      renderInvestigationModal();
    }

    function createUserCard(user) {
      const card = deps.createElement("article", {
        className: "admin-user-card",
        attributes: {
          "data-admin-user-card": user.username
        }
      });
      if (deps.isAdminUser?.()) {
        card.classList.add("admin-user-card-clickable");
        card.dataset.adminInvestigateUsername = user.username;
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Open fraud review for ${user.fullName || user.username}`);
      }
      const headerRow = deps.createElement("div", { className: "admin-user-row" });
      const verificationPreview = createVerificationPreview(user);
      const left = deps.createElement("div");
      left.append(
        deps.createElement("strong", { textContent: user.fullName || user.username }),
        createMetaCopy(`@${user.username} | ${deps.getRoleLabel?.(user.role) || user.role}`)
      );
      const statusGroup = deps.createElement("div", { className: "trust-badges" });
      statusGroup.appendChild(deps.createStatusPill(user.status || "active", mapStatusClass(user.status)));
      if (user.role === "seller") {
        statusGroup.appendChild(deps.createStatusPill(user.verificationStatus || "pending", mapStatusClass(user.verificationStatus)));
      }
      if (Number(user.suspiciousSignalCount || 0) > 0) {
        statusGroup.appendChild(deps.createStatusPill("Suspicious Activity", "pending"));
      }
      headerRow.append(left, statusGroup);

      const moderationNote = deps.createElement("textarea", {
        attributes: {
          "data-admin-user-note": user.username,
          placeholder: "Note ya moderation au verification"
        }
      });
      moderationNote.value = user.moderationNote || "";

      const actions = deps.createElement("div", { className: "moderation-actions" });
      const canReviewVerification = user.role === "seller" && user.username !== "admin";
      if (canReviewVerification && user.verificationStatus !== "verified") {
        actions.appendChild(createActionButton("Thibitisha Muuzaji", {
          adminUserAction: "verify",
          adminUsername: user.username
        }));
      }
      if (canReviewVerification && user.verificationStatus !== "rejected") {
        actions.appendChild(createActionButton("Reject Verification", {
          adminUserAction: "rejectVerification",
          adminUsername: user.username
        }));
      }
      if (deps.isAdminUser?.() && user.username !== "admin") {
        if (user.status !== "active") {
          actions.appendChild(createActionButton("Restore", {
            adminUserAction: "activate",
            adminUsername: user.username
          }));
        }
        if (user.status !== "suspended") {
          actions.appendChild(createActionButton("Suspend", {
            adminUserAction: "suspend",
            adminUsername: user.username
          }));
        }
        if (user.status !== "banned") {
          actions.appendChild(createActionButton("Ban", {
            adminUserAction: "ban",
            adminUsername: user.username
          }));
        }
      }

      card.append(
        headerRow,
        createMetaCopy(`Phone: ${user.phoneNumber || "-"}`),
        createMetaCopy(`Category: ${deps.getCategoryLabel?.(user.primaryCategory) || user.primaryCategory || "-"}`),
        createMetaCopy(`ID: ${user.nationalIdMasked || "-"}`),
        createMetaCopy(`Products: ${user.productCount || 0} | Open reports: ${user.openReportsCount || 0} | Active sessions: ${user.activeSessionCount || 0}`),
        ...(deps.isAdminUser?.() ? [createMetaCopy("Click card to open fraud review. Access is audited.")] : []),
        ...(user.moderatedBy ? [createMetaCopy(`Moderated by ${user.moderatedBy}`)] : []),
        ...(verificationPreview ? [verificationPreview] : []),
        moderationNote
      );
      if (actions.childNodes.length) {
        card.appendChild(actions);
      }
      return card;
    }

    function createProductCard(product) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: {
          "data-admin-product-card": product.id
        }
      });
      const safeImage = deps.sanitizeImageSource(product.image || (product.images || [])[0], deps.getImageFallbackDataUri("W"));
      const noteInput = deps.createElement("textarea", {
        attributes: {
          "data-admin-product-note": product.id,
          placeholder: "Andika moderation note"
        }
      });
      noteInput.value = product.moderationNote || "";

      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.append(
        createActionButton("Approve", {
          adminProductAction: "approved",
          productId: product.id
        }),
        createActionButton("Reject", {
          adminProductAction: "rejected",
          productId: product.id
        })
      );

      const deepLinkRow = createDeepLinkRow(product);

      card.append(
        deps.createElement("strong", { textContent: product.name }),
        createMetaCopy(`${product.shop || product.uploadedBy} | ${deps.getCategoryLabel?.(product.category) || product.category}`),
        createMetaCopy(`Muuzaji: ${product.uploadedBy || "-"}`),
        createMetaCopy(`Price: ${deps.formatProductPrice(product.price)}`),
        deps.createStatusPill(product.status || "pending", mapStatusClass(product.status))
      );
      if (deepLinkRow) {
        card.appendChild(deepLinkRow);
      }
      if (safeImage) {
        card.appendChild(deps.createProgressiveImage
          ? deps.createProgressiveImage({
            src: safeImage,
            alt: product.name,
            fallbackSrc: deps.getImageFallbackDataUri("W"),
            placeholderSrc: deps.getImageFallbackDataUri("W"),
            className: "admin-verification-image",
            attributes: {
              loading: "eager",
              fetchpriority: "high"
            }
          })
          : deps.createResponsiveImage({
          src: safeImage,
          alt: product.name,
          fallbackSrc: deps.getImageFallbackDataUri("W"),
          className: "admin-verification-image",
          attributes: {
            loading: "eager",
            fetchpriority: "high"
          }
        }));
      }
      card.append(noteInput, actions);
      return card;
    }

    function createReportCard(report) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: {
          "data-admin-report-card": report.id
        }
      });
      const noteInput = deps.createElement("textarea", {
        attributes: {
          "data-admin-report-note": report.id,
          placeholder: "Andika review note"
        }
      });
      noteInput.value = report.reviewNote || "";
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.append(
        createActionButton("Mark Reviewed", {
          adminReportAction: "reviewed",
          reportId: report.id
        }),
        createActionButton("Resolve", {
          adminReportAction: "resolved",
          reportId: report.id
        })
      );

      card.append(
        deps.createElement("strong", { textContent: `${report.targetType === "user" ? "User Report" : "Product Report"}: ${report.reason || "Open report"}` }),
        createMetaCopy(`Reporter: ${report.reporterUserId || "-"}`),
        createMetaCopy(`Target: ${report.targetUserId || report.targetProductId || "-"}`),
        createMetaCopy(report.description || "Hakuna maelezo ya ziada."),
        deps.createStatusPill(report.status || "open", mapStatusClass(report.status)),
        noteInput,
        actions
      );
      return card;
    }

    function createPromotionCard(promotion) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: {
          "data-admin-promotion-card": promotion.id
        }
      });
      card.append(
        deps.createElement("strong", { textContent: `${deps.getPromotionLabel?.(promotion.type) || promotion.type} | ${promotion.productId}` }),
        createMetaCopy(`Muuzaji: ${promotion.sellerUsername || "-"}`),
        createMetaCopy(`Transaction: ${promotion.transactionReference || "-"}`),
        deps.createStatusPill(promotion.status || "pending", mapStatusClass(promotion.status))
      );
      if (deps.isAdminUser?.() && promotion.status !== "disabled" && promotion.status !== "expired") {
        const actions = deps.createElement("div", { className: "moderation-actions" });
        actions.appendChild(createActionButton("Disable Promotion", {
          adminPromotionDisable: promotion.id
        }));
        card.appendChild(actions);
      }
      return card;
    }

    function createSimpleListSection(title, meta, items, formatter) {
      const list = deps.createElement("div", { className: "analytics-list" });
      if (!items.length) {
        list.appendChild(deps.createEmptyState("Hakuna data ya kuonyesha kwa sasa."));
      } else {
        items.forEach((item) => {
          list.appendChild(deps.createElement("div", {
            className: "analytics-list-item",
            textContent: formatter(item)
          }));
        });
      }
      return createSection(title, meta, list);
    }

    function readScopedTextarea(scope, selector) {
      return scope?.querySelector(selector)?.value.trim() || "";
    }

    function toggleScopedBusyState(scope, isBusy) {
      scope?.querySelectorAll("button, textarea").forEach((element) => {
        if (isBusy) {
          element.setAttribute("disabled", "true");
          return;
        }
        element.removeAttribute("disabled");
      });
    }

    function createAdminBody(state) {
      const wrapper = deps.createElement("div", { className: "moderation-list" });
      wrapper.appendChild(createAdminToolbar(state));
      const adminWarmImageSources = new Set();
      state.users.forEach((user) => {
        if (user?.identityDocumentImage) {
          adminWarmImageSources.add(user.identityDocumentImage);
        }
      });
      state.pendingProducts.forEach((product) => {
        if (product?.image) {
          adminWarmImageSources.add(product.image);
        }
        if (Array.isArray(product?.images)) {
          product.images.forEach((image) => {
            if (image) {
              adminWarmImageSources.add(image);
            }
          });
        }
      });
      if (typeof deps.warmAdminImageCache === "function") {
        deps.warmAdminImageCache(Array.from(adminWarmImageSources).slice(0, 16));
      }
      if (deps.isAdminUser?.()) {
        const deepLinkProducts = Array.isArray(state.pendingProducts) ? state.pendingProducts : [];
        const deepLinkBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.products) {
          deepLinkBody.appendChild(createLoadIssueState("Deep link products hazikupatikana kwa sasa."));
        } else if (!deepLinkProducts.length) {
          deepLinkBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending za deep link kwa sasa."));
        } else {
          deepLinkProducts.slice(0, 12).forEach((product) => deepLinkBody.appendChild(createDeepLinkCard(product)));
        }
        wrapper.appendChild(createSection("Product Deep Links", "Copy stable /product/:id links kwa ads na sharing.", deepLinkBody));
      }

      const usersSectionBody = deps.createElement("div", { className: "admin-users-list" });
      const actionableUsers = state.users.filter((user) => user.username !== "admin");
      if (state.loadErrors.users) {
        usersSectionBody.appendChild(createLoadIssueState("User moderation data haikupatikana kwa sasa."));
      } else if (!actionableUsers.length) {
        usersSectionBody.appendChild(deps.createEmptyState("Hakuna users wa ku-review kwa sasa."));
      } else {
        actionableUsers.forEach((user) => usersSectionBody.appendChild(createUserCard(user)));
      }
      wrapper.appendChild(createSection("User Review & Access", "Verification, suspension, na moderation ya users.", usersSectionBody));

      const pendingProductsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.products) {
        pendingProductsBody.appendChild(createLoadIssueState("Pending products hazikupatikana kwa sasa."));
      } else if (!state.pendingProducts.length) {
        pendingProductsBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending kwa sasa."));
      } else {
        state.pendingProducts.forEach((product) => pendingProductsBody.appendChild(createProductCard(product)));
      }
      wrapper.appendChild(createSection("Pending Products", "Approve au reject catalog entries zinazongoja review.", pendingProductsBody));

      const reportsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.reports) {
        reportsBody.appendChild(createLoadIssueState("Reports hazikupatikana kwa sasa."));
      } else if (!state.openReports.length) {
        reportsBody.appendChild(deps.createEmptyState("Hakuna reports wazi kwa sasa."));
      } else {
        state.openReports.forEach((report) => reportsBody.appendChild(createReportCard(report)));
      }
      wrapper.appendChild(createSection("Open Reports", "Chukua hatua kwenye reports za user au product.", reportsBody));

      if (deps.isAdminUser?.()) {
        const promotionsBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.promotions) {
          promotionsBody.appendChild(createLoadIssueState("Promotions data haikupatikana kwa sasa."));
        } else if (!state.promotions.length) {
          promotionsBody.appendChild(deps.createEmptyState("Hakuna promotions za kusimamia."));
        } else {
          state.promotions.forEach((promotion) => promotionsBody.appendChild(createPromotionCard(promotion)));
        }
        wrapper.appendChild(createSection("Promotions", "Admin-only promotion controls.", promotionsBody));

        wrapper.appendChild(state.loadErrors.orders
          ? createSection("Recent Orders", "Mwonekano wa orders za marketplace.", createLoadIssueState("Orders data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Orders",
            "Mwonekano wa orders za marketplace.",
            state.orders.slice(0, 6),
            (order) => `${order.id} | ${order.buyerUsername || "-"} -> ${order.sellerUsername || "-"} | ${order.status || "-"}`
          ));

        wrapper.appendChild(state.loadErrors.payments
          ? createSection("Recent Payments", "Mwonekano wa payments za marketplace.", createLoadIssueState("Payments data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Payments",
            "Mwonekano wa payments za marketplace.",
            state.payments.slice(0, 6),
            (payment) => `${payment.orderId || payment.id} | ${payment.paymentStatus || "-"} | ${payment.transactionReference || "-"}`
          ));

        wrapper.appendChild(state.loadErrors.moderationActions
          ? createSection("Moderation Audit", "Actions za staff zilizorekodiwa hivi karibuni.", createLoadIssueState("Moderation audit haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Moderation Audit",
            "Actions za staff zilizorekodiwa hivi karibuni.",
            state.moderationActions.slice(0, 8),
            (action) => `${action.actionType || "action"} | ${action.targetUserId || action.targetProductId || "-"} | ${action.adminUsername || "-"}`
          ));

        if (state.loadErrors.opsSummary) {
          wrapper.appendChild(createSection("Ops Signals", "Runtime diagnostics za admin.", createLoadIssueState("Ops summary haikupatikana kwa sasa.")));
        } else if (state.opsSummary) {
          wrapper.appendChild(createSimpleListSection(
            "Ops Signals",
            `Storage: ${state.opsSummary.storageMode || "-"} | Backups: ${state.opsSummary.backupStatus?.fileCount ?? 0} | Warnings: ${(state.opsSummary.configWarnings || []).length} | Auth failures: ${state.opsSummary.counts?.authFailures24h ?? 0} | Alerts: ${state.opsSummary.counts?.alertCandidates24h ?? 0} | Denied: ${state.opsSummary.counts?.deniedActions24h ?? 0}`,
            [
              ...(state.opsSummary.backupStatus?.note ? [{ type: "backup", value: `Backup: ${state.opsSummary.backupStatus.note}` }] : []),
              ...((state.opsSummary.configWarnings || []).map((warning) => ({ type: "warning", value: warning }))),
              ...((state.opsSummary.recentAlerts || []).slice(0, 4).map((entry) => ({
                type: "alert",
                value: `Alert ${entry.alertSeverity || "high"} | ${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              }))),
              ...((state.opsSummary.recentFailures || []).slice(0, 6).map((entry) => ({
                type: "failure",
                value: `${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              })))
            ],
            (item) => item.value
          ));
        }
      }

      return wrapper;
    }

    async function handleUserAction(button) {
      const username = button.dataset.adminUsername || "";
      const action = button.dataset.adminUserAction || "";
      const note = readScopedTextarea(button.closest(".admin-user-card"), `[data-admin-user-note="${username}"]`);
      const payload = createUserActionPayload(action, note);
      if (!username || !payload) {
        return;
      }
      if (!confirmUserAction(username, action)) {
        return;
      }
      await deps.dataLayer.moderateUser(username, payload);
      deps.refreshProductsFromStore?.();
      deps.showInAppNotification?.({
        title: "User updated",
        body: `User ${username} amehifadhiwa kwenye moderation.`,
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_user_moderated", "Staff updated a user moderation state.", {
        username,
        action
      });
      renderAdminView();
    }

    async function handleProductAction(button) {
      const productId = button.dataset.productId || "";
      const status = button.dataset.adminProductAction || "";
      const note = readScopedTextarea(button.closest(".moderation-card"), `[data-admin-product-note="${productId}"]`);
      if (!productId || !status) {
        return;
      }
      if (status === "rejected" && deps.confirmAction && !deps.confirmAction("Una uhakika unataka kukataa bidhaa hii?")) {
        return;
      }
      await deps.dataLayer.moderateProduct(productId, {
        status,
        moderationNote: note
      });
      deps.refreshProductsFromStore?.();
      deps.showInAppNotification?.({
        title: "Product updated",
        body: `Bidhaa ${status === "approved" ? "imekubaliwa" : "imekataliwa"} kwenye moderation.`,
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_product_moderated", "Staff moderated a product.", {
        productId,
        status
      });
      renderAdminView();
    }

    async function handleReportAction(button) {
      const reportId = button.dataset.reportId || "";
      const status = button.dataset.adminReportAction || "";
      const note = readScopedTextarea(button.closest(".moderation-card"), `[data-admin-report-note="${reportId}"]`);
      if (!reportId || !status) {
        return;
      }
      await deps.dataLayer.reviewReport(reportId, {
        status,
        reviewNote: note || (status === "resolved" ? "Resolved by staff." : "Reviewed by staff.")
      });
      deps.showInAppNotification?.({
        title: "Report updated",
        body: `Report imewekwa kwenye status ya ${status}.`,
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_report_reviewed", "Staff reviewed a report.", {
        reportId,
        status
      });
      renderAdminView();
    }

    async function handleDeepLinkCopy(button) {
      const productId = button.dataset.adminDeepLinkCopy || "";
      if (!productId) {
        return;
      }
      const deepLink = buildProductDeepLink(productId);
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(deepLink);
        } else {
          const fallback = deps.createElement("textarea", {
            attributes: {
              readonly: "true"
            }
          });
          fallback.value = deepLink;
          document.body.appendChild(fallback);
          fallback.select();
          document.execCommand?.("copy");
          fallback.remove();
        }
        deps.showInAppNotification?.({
          title: "Deep link copied",
          body: "Product deep link ime-copy tayari.",
          variant: "success"
        });
        deps.reportEvent?.("info", "admin_product_deep_link_copied", "Admin copied a product deep link.", {
          productId,
          deepLink
        });
      } catch (error) {
        deps.captureError?.("admin_product_deep_link_copy_failed", error, {
          productId
        });
        deps.showInAppNotification?.({
          title: "Copy failed",
          body: error.message || "Imeshindikana ku-copy deep link.",
          variant: "error"
        });
      }
    }

    async function handlePromotionDisable(button) {
      const promotionId = button.dataset.adminPromotionDisable || "";
      if (!promotionId) {
        return;
      }
      if (deps.confirmAction && !deps.confirmAction("Una uhakika unataka kuzima promotion hii?")) {
        return;
      }
      await deps.dataLayer.disablePromotion(promotionId);
      deps.showInAppNotification?.({
        title: "Promotion disabled",
        body: "Promotion imezimwa.",
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_promotion_disabled", "Admin disabled a promotion.", {
        promotionId
      });
      renderAdminView();
    }

    async function handleInvestigationSubmit(button) {
      const username = button.dataset.adminInvestigationSubmit || investigationState.username || "";
      const root = document.getElementById("admin-investigation-modal");
      const reason = root?.querySelector("[data-admin-investigation-reason='true']")?.value.trim() || "";
      if (!username) {
        return;
      }
      investigationState = {
        ...investigationState,
        username,
        reason,
        loading: true,
        error: ""
      };
      renderInvestigationModal();
      try {
        const detail = await deps.dataLayer.loadAdminUserInvestigation(username, { reason });
        investigationState = {
          ...investigationState,
          loading: false,
          detail,
          user: {
            ...investigationState.user,
            ...(detail?.profile || {})
          },
          error: ""
        };
        deps.reportEvent?.("info", "admin_user_investigation_opened", "Admin opened a fraud review investigation.", {
          username
        });
      } catch (error) {
        investigationState = {
          ...investigationState,
          loading: false,
          error: error.message || "Imeshindikana kufungua fraud review."
        };
      }
      renderInvestigationModal();
    }

    function bindAdminActions(panel) {
      panel.querySelectorAll("[data-admin-investigate-username]").forEach((card) => {
        const openCard = (event) => {
          if (event.target.closest("button, textarea, input, select, a, label")) {
            return;
          }
          openInvestigationModal(card.dataset.adminInvestigateUsername || "");
        };
        card.addEventListener("click", openCard);
        card.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && !event.target.closest("textarea, input, select")) {
            event.preventDefault();
            openInvestigationModal(card.dataset.adminInvestigateUsername || "");
          }
        });
      });

      panel.querySelectorAll("[data-admin-user-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-user-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleUserAction(button);
          } catch (error) {
            deps.captureError?.("admin_user_moderation_failed", error, {
              username: button.dataset.adminUsername || "",
              action: button.dataset.adminUserAction || ""
            });
            deps.showInAppNotification?.({
              title: "User update failed",
              body: error.message || "Imeshindikana kuhifadhi moderation ya user.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-product-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-product-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleProductAction(button);
          } catch (error) {
            deps.captureError?.("admin_product_moderation_failed", error, {
              productId: button.dataset.productId || "",
              status: button.dataset.adminProductAction || ""
            });
            deps.showInAppNotification?.({
              title: "Product moderation failed",
              body: error.message || "Imeshindikana kuhifadhi moderation ya bidhaa.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-report-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-report-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleReportAction(button);
          } catch (error) {
            deps.captureError?.("admin_report_review_failed", error, {
              reportId: button.dataset.reportId || "",
              status: button.dataset.adminReportAction || ""
            });
            deps.showInAppNotification?.({
              title: "Report update failed",
              body: error.message || "Imeshindikana kusasisha report.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-deep-link-copy]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-product-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleDeepLinkCopy(button);
          } catch (error) {
            deps.captureError?.("admin_product_deep_link_copy_failed", error, {
              productId: button.dataset.adminDeepLinkCopy || ""
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-promotion-disable]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-promotion-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handlePromotionDisable(button);
          } catch (error) {
            deps.captureError?.("admin_promotion_disable_failed", error, {
              promotionId: button.dataset.adminPromotionDisable || ""
            });
            deps.showInAppNotification?.({
              title: "Promotion update failed",
              body: error.message || "Imeshindikana kuzima promotion.",
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-refresh]").forEach((button) => {
        button.addEventListener("click", () => {
          renderAdminView();
        });
      });

    }

    function getSettledValue(result, fallback) {
      return result.status === "fulfilled" ? result.value : fallback;
    }

    function nextFrame() {
      return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }

    async function appendItemsInChunks(container, items, createItem, chunkSize = 16) {
      if (!container || !Array.isArray(items) || !items.length) {
        return;
      }
      for (let index = 0; index < items.length; index += chunkSize) {
        const fragment = document.createDocumentFragment();
        items.slice(index, index + chunkSize).forEach((item) => {
          fragment.appendChild(createItem(item));
        });
        container.appendChild(fragment);
        if (index + chunkSize < items.length) {
          await nextFrame();
        }
      }
    }

    async function createAdminBody(state) {
      const wrapper = deps.createElement("div", { className: "moderation-list" });
      wrapper.appendChild(createAdminToolbar(state));

      if (deps.isAdminUser?.()) {
        const deepLinkProducts = Array.isArray(state.pendingProducts) ? state.pendingProducts : [];
        const deepLinkBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.products) {
          deepLinkBody.appendChild(createLoadIssueState("Deep link products hazikupatikana kwa sasa."));
        } else if (!deepLinkProducts.length) {
          deepLinkBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending za deep link kwa sasa."));
        } else {
          await appendItemsInChunks(deepLinkBody, deepLinkProducts.slice(0, 12), (product) => createDeepLinkCard(product), 6);
        }
        wrapper.appendChild(createSection("Product Deep Links", "Copy stable /product/:id links kwa ads na sharing.", deepLinkBody));
        await nextFrame();
      }

      const usersSectionBody = deps.createElement("div", { className: "admin-users-list" });
      const actionableUsers = state.users.filter((user) => user.username !== "admin");
      if (state.loadErrors.users) {
        usersSectionBody.appendChild(createLoadIssueState("User moderation data haikupatikana kwa sasa."));
      } else if (!actionableUsers.length) {
        usersSectionBody.appendChild(deps.createEmptyState("Hakuna users wa ku-review kwa sasa."));
      } else {
        await appendItemsInChunks(usersSectionBody, actionableUsers, (user) => createUserCard(user), 12);
      }
      wrapper.appendChild(createSection("User Review & Access", "Verification, suspension, na moderation ya users.", usersSectionBody));
      await nextFrame();

      const pendingProductsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.products) {
        pendingProductsBody.appendChild(createLoadIssueState("Pending products hazikupatikana kwa sasa."));
      } else if (!state.pendingProducts.length) {
        pendingProductsBody.appendChild(deps.createEmptyState("Hakuna bidhaa pending kwa sasa."));
      } else {
        await appendItemsInChunks(pendingProductsBody, state.pendingProducts, (product) => createProductCard(product), 10);
      }
      wrapper.appendChild(createSection("Pending Products", "Approve au reject catalog entries zinazongoja review.", pendingProductsBody));
      await nextFrame();

      const reportsBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.reports) {
        reportsBody.appendChild(createLoadIssueState("Reports hazikupatikana kwa sasa."));
      } else if (!state.openReports.length) {
        reportsBody.appendChild(deps.createEmptyState("Hakuna reports wazi kwa sasa."));
      } else {
        await appendItemsInChunks(reportsBody, state.openReports, (report) => createReportCard(report), 10);
      }
      wrapper.appendChild(createSection("Open Reports", "Chukua hatua kwenye reports za user au product.", reportsBody));
      await nextFrame();

      if (deps.isAdminUser?.()) {
        const promotionsBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.promotions) {
          promotionsBody.appendChild(createLoadIssueState("Promotions data haikupatikana kwa sasa."));
        } else if (!state.promotions.length) {
          promotionsBody.appendChild(deps.createEmptyState("Hakuna promotions za kusimamia."));
        } else {
          await appendItemsInChunks(promotionsBody, state.promotions, (promotion) => createPromotionCard(promotion), 10);
        }
        wrapper.appendChild(createSection("Promotions", "Admin-only promotion controls.", promotionsBody));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.orders
          ? createSection("Recent Orders", "Mwonekano wa orders za marketplace.", createLoadIssueState("Orders data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Orders",
            "Mwonekano wa orders za marketplace.",
            state.orders.slice(0, 6),
            (order) => `${order.id} | ${order.buyerUsername || "-"} -> ${order.sellerUsername || "-"} | ${order.status || "-"}`
          ));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.payments
          ? createSection("Recent Payments", "Mwonekano wa payments za marketplace.", createLoadIssueState("Payments data haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Recent Payments",
            "Mwonekano wa payments za marketplace.",
            state.payments.slice(0, 6),
            (payment) => `${payment.orderId || payment.id} | ${payment.paymentStatus || "-"} | ${payment.transactionReference || "-"}`
          ));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.moderationActions
          ? createSection("Moderation Audit", "Actions za staff zilizorekodiwa hivi karibuni.", createLoadIssueState("Moderation audit haikupatikana kwa sasa."))
          : createSimpleListSection(
            "Moderation Audit",
            "Actions za staff zilizorekodiwa hivi karibuni.",
            state.moderationActions.slice(0, 8),
            (action) => `${action.actionType || "action"} | ${action.targetUserId || action.targetProductId || "-"} | ${action.adminUsername || "-"}`
          ));
        await nextFrame();

        if (state.loadErrors.opsSummary) {
          wrapper.appendChild(createSection("Ops Signals", "Runtime diagnostics za admin.", createLoadIssueState("Ops summary haikupatikana kwa sasa.")));
        } else if (state.opsSummary) {
          wrapper.appendChild(createSimpleListSection(
            "Ops Signals",
            `Storage: ${state.opsSummary.storageMode || "-"} | Backups: ${state.opsSummary.backupStatus?.fileCount ?? 0} | Warnings: ${(state.opsSummary.configWarnings || []).length} | Auth failures: ${state.opsSummary.counts?.authFailures24h ?? 0} | Alerts: ${state.opsSummary.counts?.alertCandidates24h ?? 0} | Denied: ${state.opsSummary.counts?.deniedActions24h ?? 0}`,
            [
              ...(state.opsSummary.backupStatus?.note ? [{ type: "backup", value: `Backup: ${state.opsSummary.backupStatus.note}` }] : []),
              ...((state.opsSummary.configWarnings || []).map((warning) => ({ type: "warning", value: warning }))),
              ...((state.opsSummary.recentAlerts || []).slice(0, 4).map((entry) => ({
                type: "alert",
                value: `Alert ${entry.alertSeverity || "high"} | ${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              }))),
              ...((state.opsSummary.recentFailures || []).slice(0, 6).map((entry) => ({
                type: "failure",
                value: `${entry.event || "event"} | ${entry.message || entry.path || "-"}`
              })))
            ],
            (item) => item.value
          ));
        }
      }

      return wrapper;
    }

    async function renderAdminView() {
      const panel = deps.getAdminPanel?.();
      if (!panel) {
        return;
      }
      closeInvestigationModal();

      const sequence = ++renderSequence;
      panel.replaceChildren(
        createSection("Admin Console", "Usimamizi wa marketplace, moderation, na analytics.", deps.createEmptyState("Inapakia admin tools..."))
      );
      deps.renderAnalyticsPanel?.(null, "Marketplace Overview", "Inapakia analytics...");

      const tasks = [
        deps.dataLayer.loadAnalytics(),
        deps.dataLayer.loadAdminUsers(),
        deps.dataLayer.loadAdminProducts("pending"),
        deps.dataLayer.loadAdminReports({ status: "open" })
      ];

      if (deps.isAdminUser?.()) {
        tasks.push(
          deps.dataLayer.loadAdminPromotions(),
          deps.dataLayer.loadAdminOrders({}),
          deps.dataLayer.loadAdminPayments({}),
          deps.dataLayer.loadModerationActions(),
          deps.dataLayer.loadAdminOpsSummary()
        );
      }

      const results = await Promise.allSettled(tasks);
      if (sequence !== renderSequence || deps.getCurrentView?.() !== "admin" || !deps.isStaffUser?.()) {
        return;
      }

      const analytics = getSettledValue(results[0], null);
      const users = getSettledValue(results[1], []);
      const pendingProducts = getSettledValue(results[2], []);
      const openReports = getSettledValue(results[3], []);
      const promotions = deps.isAdminUser?.() ? getSettledValue(results[4], []) : [];
      const orders = deps.isAdminUser?.() ? getSettledValue(results[5], []) : [];
      const payments = deps.isAdminUser?.() ? getSettledValue(results[6], []) : [];
      const moderationActions = deps.isAdminUser?.() ? getSettledValue(results[7], []) : [];
      const opsSummary = deps.isAdminUser?.() ? getSettledValue(results[8], null) : null;

      const failedLoads = ["analytics", "users", "products", "reports", "promotions", "orders", "payments", "moderationActions", "opsSummary"]
        .filter((_, index) => results[index] && results[index].status === "rejected");
      if (failedLoads.length) {
        deps.captureError?.("admin_surface_partial_load_failed", new Error("Some admin datasets failed to load."), {
          failedLoads: failedLoads.join(",")
        });
        deps.showInAppNotification?.({
          title: "Admin data partial",
          body: "Baadhi ya admin data haijafunguka kikamilifu, lakini panel imefunguliwa.",
          variant: "warning"
        });
      }

      deps.renderAnalyticsPanel?.(analytics, "Marketplace Overview", deps.isAdminUser?.()
        ? "Admin anaona muhtasari wa marketplace nzima."
        : "Moderator anaona muhtasari wa moderation.");

      const state = {
        users: Array.isArray(users) ? users : [],
        pendingProducts: Array.isArray(pendingProducts) ? pendingProducts : [],
        openReports: Array.isArray(openReports) ? openReports : [],
        promotions: Array.isArray(promotions) ? promotions : [],
        orders: Array.isArray(orders) ? orders : [],
        payments: Array.isArray(payments) ? payments : [],
        moderationActions: Array.isArray(moderationActions) ? moderationActions : [],
        opsSummary,
        hasAnyLoadError: failedLoads.length > 0,
        loadErrors: {
          analytics: failedLoads.includes("analytics"),
          users: failedLoads.includes("users"),
          products: failedLoads.includes("products"),
          reports: failedLoads.includes("reports"),
          promotions: failedLoads.includes("promotions"),
          orders: failedLoads.includes("orders"),
          payments: failedLoads.includes("payments"),
          moderationActions: failedLoads.includes("moderationActions"),
          opsSummary: failedLoads.includes("opsSummary")
        }
      };
      latestUsers = state.users;

      const body = await createAdminBody(state);
      panel.replaceChildren(body);
      bindAdminActions(panel);
    }

    return { renderAdminView };
  }

  window.WingaModules.admin.createAdminControllerModule = createAdminControllerModule;
})();
