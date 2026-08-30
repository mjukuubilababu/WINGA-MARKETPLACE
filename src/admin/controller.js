(() => {
  function createAdminControllerModule(deps) {
    const translate = typeof deps.translate === "function"
      ? deps.translate
      : (_key, _variables, fallbackText = "") => String(fallbackText || "");
    const t = (key, fallbackText = "", variables = {}) => translate(key, variables, fallbackText);
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
    let messageReviewState = {
      conversationId: "",
      thread: null,
      reason: "",
      loading: false,
      detail: null,
      error: ""
    };
    let settingsState = {
      loading: false,
      saving: false,
      error: "",
      values: null
    };
    let promotionFilterState = "all";
    let promotionSearchState = "";

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
      const copyButton = createActionButton(t("admin.copyDeepLinkAction", "Copy Deep Link"), {
        adminDeepLinkCopy: product.id
      }, "button action-btn action-btn-secondary");
      deepLinkRow.append(
        deps.createElement("strong", { textContent: t("admin.deepLinkLabel", "Deep Link") }),
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
        createActionButton(t("admin.copyDeepLinkAction", "Copy Deep Link"), {
          adminDeepLinkCopy: product.id
        }, "button action-btn action-btn-secondary"),
        deps.createElement("a", {
          className: "button action-btn",
          textContent: t("admin.openLinkAction", "Open Link"),
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
        eyebrow: t("ui.label.c1c224b03cd9", "Admin"),
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
        deps.createElement("strong", { textContent: t("admin.sectionUnavailableTitle", "Section unavailable") }),
        deps.createElement("p", {
          className: "empty-copy",
          textContent: message || t("admin.sectionUnavailableBody", "Section hii haikuweza kupakia kwa sasa. Jaribu tena.")
        }),
        createActionButton(t("admin.retryAction", "Retry"), {
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
        deps.createElement("p", { className: "eyebrow", textContent: t("admin.eyebrow", t("ui.label.c1c224b03cd9", "Admin")) }),
        deps.createElement("h3", { textContent: t("admin.consoleTitle", "Admin Console") }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: state.hasAnyLoadError
            ? t("admin.consolePartialBody", "Baadhi ya admin data imekosa kupakia. Unaweza kuretry bila kuondoka kwenye panel.")
            : t("admin.consoleBody", "Usimamizi wa marketplace, moderation, na ops signals.")
        })
      );
      row.appendChild(copy);
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.appendChild(createActionButton(t("admin.refreshAction", "Refresh Admin"), {
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

    function formatMessageAccessTime(value) {
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

    function ensureMessageReviewModal() {
      let root = document.getElementById("admin-message-review-modal");
      if (root) {
        return root;
      }

      root = deps.createElement("div", {
        attributes: {
          id: "admin-message-review-modal",
          hidden: "true"
        }
      });
      root.innerHTML = `
        <div class="admin-message-review-backdrop" data-close-admin-message-review="true"></div>
        <div class="admin-message-review-dialog panel" role="dialog" aria-modal="true" aria-labelledby="admin-message-review-title">
          <button class="admin-message-review-close" type="button" aria-label="Close message review" data-close-admin-message-review="true">&times;</button>
          <div class="admin-message-review-body" data-admin-message-review-body="true"></div>
        </div>
      `;

      root.addEventListener("click", (event) => {
        const submitButton = event.target.closest("[data-admin-message-review-submit]");
        if (submitButton) {
          handleMessageReviewSubmit(submitButton).catch((error) => {
            messageReviewState = {
              ...messageReviewState,
              loading: false,
              error: error.message || "Message review haikufunguka."
            };
            renderMessageReviewModal();
          });
          return;
        }
        if (event.target.closest("[data-close-admin-message-review='true']")) {
          closeMessageReviewModal();
        }
      });
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeMessageReviewModal();
        }
      });

      document.body.appendChild(root);
      return root;
    }

    function closeMessageReviewModal() {
      const root = document.getElementById("admin-message-review-modal");
      if (!root) {
        return;
      }
      root.hidden = true;
      root.classList.remove("open");
      messageReviewState = {
        conversationId: "",
        thread: null,
        reason: "",
        loading: false,
        detail: null,
        error: ""
      };
      root.querySelector("[data-admin-message-review-body='true']")?.replaceChildren();
    }

    function createMessageThreadCard(thread) {
      const card = deps.createElement("article", {
        className: "moderation-card admin-message-card",
        attributes: {
          "data-admin-message-card": thread.conversationId
        }
      });
      card.__adminThread = thread;
      const messageLabel = thread.messageCount > 1 ? `${thread.messageCount} messages` : `${thread.messageCount} message`;
      card.append(
        deps.createElement("strong", {
          textContent: `${thread.senderName || thread.senderId || "-"} → ${thread.receiverName || thread.receiverId || "-"}`
        }),
        createMetaCopy(`Product: ${thread.productName || thread.productId || "-"}`),
        createMetaCopy(`Last: ${formatMessageAccessTime(thread.lastMessageAt)} | ${messageLabel} | Unread: ${thread.unreadCount || 0}`),
        createMetaCopy(thread.lastMessagePreview || "Hakuna preview ya ujumbe."),
        deps.createStatusPill(thread.hasReportedContent ? "Reported" : "Normal", mapStatusClass(thread.hasReportedContent ? "pending" : "approved"))
      );
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.appendChild(createActionButton("Open Content", {
        adminMessageReview: thread.conversationId
      }, "button"));
      card.appendChild(actions);
      return card;
    }

    function renderMessageReviewModal() {
      const root = ensureMessageReviewModal();
      const body = root.querySelector("[data-admin-message-review-body='true']");
      if (!body || !messageReviewState.thread) {
        return;
      }

      const detail = messageReviewState.detail;
      const thread = messageReviewState.thread;
      const header = deps.createElement("div", { className: "admin-investigation-header" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: t("admin.messageModerationTitle", "Message Moderation") }),
        deps.createElement("h3", {
          attributes: { id: "admin-message-review-title" },
          textContent: `${thread.senderName || thread.senderId || "-"} → ${thread.receiverName || thread.receiverId || "-"}`
        }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: t("admin.conversationLabel", "Conversation {id}", { id: thread.conversationId })
        })
      );
      const statusGroup = deps.createElement("div", { className: "trust-badges" });
      statusGroup.appendChild(deps.createStatusPill(thread.hasReportedContent ? "Reported" : "Normal", mapStatusClass(thread.hasReportedContent ? "pending" : "approved")));
      statusGroup.appendChild(deps.createStatusPill(`${thread.messageCount || 0} msgs`, "approved"));
      header.append(copy, statusGroup);

      const reasonField = deps.createElement("textarea", {
        attributes: {
          "data-admin-message-review-reason": "true",
          placeholder: t("admin.messageReviewReasonPlaceholder", "Reason ya ku-open message content (report/dispute reference)")
        }
      });
      reasonField.value = messageReviewState.reason || "";

      const reasonActions = deps.createElement("div", { className: "moderation-actions" });
      const openButton = createActionButton(
        messageReviewState.loading ? "Inafungua..." : "Open Message Content",
        { adminMessageReviewSubmit: thread.conversationId },
        "button"
      );
      if (messageReviewState.loading) {
        openButton.setAttribute("disabled", "true");
        reasonField.setAttribute("disabled", "true");
      }
      reasonActions.append(
        openButton,
        createActionButton(t("admin.closeAction", "Close"), {
          closeAdminMessageReview: "true"
        }, "button button-secondary")
      );

      const reasonPanel = deps.createElement("section", { className: "admin-investigation-section" });
      reasonPanel.append(
        deps.createElement("p", {
          className: "meta-copy",
          textContent: settingsState.values?.messageReviewRequiresReason === false
            ? "Message content huonekana mara moja au baada ya sababu fupi. Audit trail huandikwa kila mara."
            : "Message content huonekana tu baada ya sababu kuandikwa. Audit trail huandikwa kila mara."
        }),
        reasonField,
        reasonActions
      );

      const nodes = [header, reasonPanel];
      if (messageReviewState.error) {
        nodes.push(deps.createElement("p", {
          className: "empty-copy admin-investigation-error",
          textContent: messageReviewState.error
        }));
      }

      if (detail) {
        const summaryGrid = deps.createElement("div", { className: "analytics-grid admin-investigation-metrics" });
        summaryGrid.append(
          createInvestigationMetric("Messages", detail.summary?.messageCount || detail.messages.length || 0),
          createInvestigationMetric("Unread", detail.summary?.unreadCount || 0),
          createInvestigationMetric("Reports", detail.summary?.reportCount || 0),
          createInvestigationMetric("Reviewed", formatMessageAccessTime(detail.reviewedAt || ""))
        );
        nodes.push(summaryGrid);

        nodes.push(createSection("Message Thread", "Review ya content ya conversation hii.", deps.createElement("div", {
          className: "admin-message-thread-list",
          attributes: { "data-admin-message-thread": detail.conversationId }
        })));
      }

      body.replaceChildren(...nodes);

      if (detail) {
        const threadList = body.querySelector("[data-admin-message-thread]");
        if (threadList) {
          detail.messages.forEach((message) => {
            threadList.appendChild(deps.createElement("article", {
              className: "moderation-card admin-message-entry"
            }));
            const entry = threadList.lastElementChild;
            entry.append(
              deps.createElement("strong", { textContent: `${message.senderId || "-"} → ${message.receiverId || "-"}` }),
              createMetaCopy(`${formatMessageAccessTime(message.timestamp || message.createdAt || "")} | ${message.messageType || "text"} | ${message.isRead ? "read" : "unread"}`),
              deps.createElement("p", { className: "product-meta", textContent: message.message || "(empty)" })
            );
          });
        }
      }

      root.hidden = false;
      root.classList.add("open");
      root.querySelector("[data-admin-message-review-reason='true']")?.focus();
    }

    function openMessageReviewModal(thread) {
      if (!deps.isAdminUser?.() || !thread) {
        return;
      }
      messageReviewState = {
        conversationId: thread.conversationId,
        thread,
        reason: "",
        loading: false,
        detail: null,
        error: ""
      };
      renderMessageReviewModal();
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
        case "deactivate":
          return {
            status: "deactivated",
            reason: "staff_deactivate",
            note
          };
        case "delete":
          return {
            status: "deactivated",
            deleteUser: true,
            reason: "staff_delete",
            note
          };
        case "makeSeller":
          return {
            role: "seller",
            note
          };
        case "makeBuyer":
          return {
            role: "buyer",
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
        return deps.confirmAction(t("admin.verifySellerConfirm", "Una uhakika unataka kuthibitisha seller {username}?", { username }));
      }
      if (action === "activate") {
        return deps.confirmAction(t("admin.activateUserConfirm", "Una uhakika unataka kurudisha access ya user {username}?", { username }));
      }
      if (action === "rejectVerification") {
        return deps.confirmAction(t("admin.rejectVerificationConfirm", "Una uhakika unataka kukataa verification ya {username}?", { username }));
      }
      if (action === "suspend") {
        return deps.confirmAction(t("admin.suspendUserConfirm", "Una uhakika unataka kususpend user {username}?", { username }));
      }
      if (action === "ban") {
        return deps.confirmAction(t("admin.banUserConfirm", "Una uhakika unataka kuban user {username}? Hii ni hatua nzito.", { username }));
      }
      if (action === "deactivate") {
        return deps.confirmAction(t("admin.deactivateUserConfirm", "Una uhakika unataka ku-deactivate user {username}?", { username }));
      }
      if (action === "delete") {
        return deps.confirmAction(t("admin.deleteUserConfirm", "Una uhakika unataka kufuta akaunti ya {username}? Hii itazima sessions na moderation itaandikwa.", { username }));
      }
      if (action === "makeSeller") {
        return deps.confirmAction(t("admin.makeSellerConfirm", "Una uhakika unataka kubadilisha {username} kuwa seller?", { username }));
      }
      if (action === "makeBuyer") {
        return deps.confirmAction(t("admin.makeBuyerConfirm", "Una uhakika unataka kubadilisha {username} kuwa buyer?", { username }));
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
        deps.createElement("p", { className: "eyebrow", textContent: t("admin.fraudReviewTitle", "Fraud Review") }),
        deps.createElement("h3", {
          attributes: { id: "admin-investigation-title" },
          textContent: user.fullName || user.username
        }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: t("admin.userMeta", "@{username} | {role}", { username: user.username, role: deps.getRoleLabel?.(user.role) || user.role })
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
          placeholder: t("admin.fraudReviewReasonPlaceholder", "Eleza sababu ya kufungua fraud review hii")
        }
      });
      reasonField.value = investigationState.reason || "";

      const reasonActions = deps.createElement("div", { className: "moderation-actions" });
      const loadButton = createActionButton(
        investigationState.loading ? t("admin.openingAction", "Inafungua...") : t("admin.openFraudReviewAction", "Open Fraud Review"),
        { adminInvestigationSubmit: user.username },
        "button"
      );
      if (investigationState.loading) {
        loadButton.setAttribute("disabled", "true");
        reasonField.setAttribute("disabled", "true");
      }
      reasonActions.append(
        loadButton,
        createActionButton(t("admin.closeAction", "Close"), {
          closeAdminInvestigation: "true"
        }, "button button-secondary")
      );

      const reasonPanel = deps.createElement("section", { className: "admin-investigation-section" });
      reasonPanel.append(
        deps.createElement("p", {
          className: "meta-copy",
          textContent: t("admin.fraudReviewReasonHelp", "Enter a reason before loading sensitive fraud-review details. Every access is audited.")
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
          deps.createElement("strong", { textContent: t("admin.messageEvidenceAccessTitle", "Message Evidence Access") }),
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
        createMetaCopy(t("admin.userMeta", "@{username} | {role}", { username: user.username, role: deps.getRoleLabel?.(user.role) || user.role }))
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
          placeholder: t("admin.userModerationNotePlaceholder", "Note ya moderation au verification")
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
        if (user.role === "seller") {
          actions.appendChild(createActionButton("Make Buyer", {
            adminUserAction: "makeBuyer",
            adminUsername: user.username
          }));
        } else {
          actions.appendChild(createActionButton("Make Seller", {
            adminUserAction: "makeSeller",
            adminUsername: user.username
          }));
        }
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
        actions.appendChild(createActionButton("Deactivate", {
          adminUserAction: "deactivate",
          adminUsername: user.username
        }, "button button-secondary"));
        actions.appendChild(createActionButton("Delete Account", {
          adminUserAction: "delete",
          adminUsername: user.username
        }, "button button-danger"));
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
          placeholder: t("admin.productModerationNotePlaceholder", "Andika moderation note")
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

      const videoItem = (Array.isArray(product.mediaItems) ? product.mediaItems : [])
        .find((item) => item?.type === "video" && item?.providerId);
      const deepLinkRow = createDeepLinkRow(product);

      card.append(
        deps.createElement("strong", { textContent: product.name }),
        createMetaCopy(`${product.shop || product.uploadedBy} | ${deps.getCategoryLabel?.(product.category) || product.category}`),
        createMetaCopy(`Muuzaji: ${product.uploadedBy || "-"}`),
        createMetaCopy(`Price: ${deps.formatProductPrice(product.price)}`),
        deps.createStatusPill(product.status || "pending", mapStatusClass(product.status))
      );
      if (videoItem) {
        card.append(
          createMetaCopy(`Video: ${videoItem.status || "unknown"} | ${Math.max(0, Math.round(Number(videoItem.duration || 0)))}s`),
          deps.createStatusPill(`video ${videoItem.status || "unknown"}`, mapStatusClass(videoItem.status))
        );
        const poster = deps.sanitizeImageSource(videoItem.posterUrl || videoItem.thumbnailUrl || "", "");
        if (poster) {
          card.appendChild(deps.createResponsiveImage({
            src: poster,
            alt: `${product.name || product.id} video poster`,
            fallbackSrc: deps.getImageFallbackDataUri("VIDEO"),
            className: "admin-verification-image",
            attributes: { loading: "lazy", decoding: "async" }
          }));
        }
      }
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

    function createVideoModerationCard(video) {
      const card = deps.createElement("article", {
        className: "moderation-card",
        attributes: { "data-admin-video-card": video.providerId }
      });
      card.append(
        deps.createElement("strong", { textContent: video.productName || video.productId || "Product video" }),
        createMetaCopy(`${video.shop || video.sellerId || "-"} | ${deps.getCategoryLabel?.(video.category) || video.category || "-"}`),
        createMetaCopy(`Seller: ${video.sellerId || "-"} | Duration: ${Math.max(0, Math.round(Number(video.duration || 0)))}s`),
        deps.createStatusPill(`video ${video.moderationStatus || "pending"}`, mapStatusClass(video.moderationStatus))
      );
      const poster = deps.sanitizeImageSource(video.posterUrl || "", "");
      if (poster) {
        const preview = deps.createElement("div", {
          className: "feed-video-playback admin-video-preview",
          attributes: {
            role: "button",
            tabindex: "0",
            "aria-label": t("admin.videoPreviewAction", "Preview video for moderation"),
            "data-video-playback": "true",
            "data-video-provider-id": video.providerId,
            "data-video-title": video.productName || video.productId || "Product video"
          }
        });
        preview.appendChild(deps.createResponsiveImage({
          src: poster,
          alt: `${video.productName || video.productId || "Product"} video poster`,
          fallbackSrc: deps.getImageFallbackDataUri("VIDEO"),
          className: "admin-verification-image feed-video-poster",
          attributes: { loading: "lazy", decoding: "async" }
        }));
        preview.appendChild(deps.createElement("span", {
          className: "feed-video-play-icon",
          attributes: { "aria-hidden": "true" }
        }));
        card.appendChild(preview);
      }
      const note = deps.createElement("textarea", {
        attributes: {
          "data-admin-video-note": video.providerId,
          placeholder: t("admin.videoModerationReasonPlaceholder", "Reason required when rejecting video")
        }
      });
      const actions = deps.createElement("div", { className: "moderation-actions" });
      actions.append(
        createActionButton(t("admin.videoApproveAction", "Approve Video"), { adminVideoAction: "approved", videoProviderId: video.providerId }),
        createActionButton(t("admin.videoRejectAction", "Reject Video"), { adminVideoAction: "rejected", videoProviderId: video.providerId }, "button button-danger")
      );
      card.append(note, actions);
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
          placeholder: t("admin.reviewNotePlaceholder", "Andika review note")
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
        deps.createElement("strong", { textContent: t("admin.promotionMeta", "{type} | {productId}", { type: deps.getPromotionLabel?.(promotion.type) || promotion.type, productId: promotion.productId }) }),
        createMetaCopy(t("admin.promotionSeller", "Seller: {value}", { value: promotion.sellerUsername || "-" })),
        createMetaCopy(t("admin.promotionTransaction", "Transaction: {value}", { value: promotion.transactionReference || "-" })),
        createMetaCopy(t("admin.promotionAmount", "Amount: {value}", { value: deps.formatPrice ? deps.formatPrice(promotion.amountPaid || 0) : (promotion.amountPaid || 0) })),
        deps.createStatusPill(promotion.status || "pending", mapStatusClass(promotion.status))
      );
      if (deps.isAdminUser?.()) {
        const actions = deps.createElement("div", { className: "moderation-actions" });
        if (promotion.status === "pending") {
          actions.append(
            createActionButton(t("admin.approvePromotionAction", "Approve Promotion"), {
              adminPromotionReview: promotion.id,
              adminPromotionStatus: "active"
            }),
            createActionButton(t("admin.rejectPromotionAction", "Reject Promotion"), {
              adminPromotionReview: promotion.id,
              adminPromotionStatus: "rejected"
            }, "button action-btn action-btn-secondary")
          );
        }
        if (promotion.status !== "disabled" && promotion.status !== "expired" && promotion.status !== "rejected") {
          actions.appendChild(createActionButton(t("admin.disablePromotionAction", "Disable Promotion"), {
            adminPromotionDisable: promotion.id
          }));
        }
        if (actions.childNodes.length) {
          card.appendChild(actions);
        }
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

    function buildOpsSignalLines(summary = {}) {
      const intelligence = summary.intelligence || {};
      const snapshot = intelligence.opsSnapshot || {};
      const queue = intelligence.durableQueue || {};
      const health = queue.health || {};
      const snapshotHealth = queue.snapshotHealth || {};
      const worker = queue.worker || {};
      const alerts = Array.isArray(queue.alerts) ? queue.alerts : [];
      const topEventTypes = Array.isArray(snapshot.topEventTypes) ? snapshot.topEventTypes : [];
      const topProducts = Array.isArray(snapshot.topProducts) ? snapshot.topProducts : [];
      const topSellers = Array.isArray(snapshot.topSellers) ? snapshot.topSellers : [];
      const snapshots = snapshot.snapshots || worker.snapshots || {};
      const trendSnapshots = Array.isArray(snapshot.trendSnapshots) ? snapshot.trendSnapshots : [];
      return [
        ...(summary.backupStatus?.note ? [{ type: "backup", value: `Backup: ${summary.backupStatus.note}` }] : []),
        ...((summary.configWarnings || []).map((warning) => ({ type: "warning", value: warning }))),
        {
          type: "ops-contract",
          value: `Ops contract: ${snapshot.schemaVersion || "-"} | ${snapshot.privacy || "aggregate"} | critical path ${String(snapshot.criticalPath ?? false)}`
        },
        {
          type: "queue",
          value: `Intelligence queue: ${snapshot.readiness || "-"} | mode ${snapshot.processorMode || worker.processorMode || "-"} | enabled ${String(snapshot.workerEnabled ?? worker.enabled ?? false)}`
        },
        {
          type: "queue-health",
          value: `Queue counts: pending ${snapshot.pending ?? health.pending ?? 0}, processing ${snapshot.processing ?? health.processing ?? 0}, failed ${snapshot.failed ?? health.failed ?? 0}, dead ${snapshot.dead ?? health.dead ?? 0}`
        },
        {
          type: "queue-age",
          value: `Queue age: oldest pending ${snapshot.oldestPendingAgeSeconds ?? health.oldestPendingAgeSeconds ?? 0}s, oldest processing ${snapshot.oldestProcessingAgeSeconds ?? health.oldestProcessingAgeSeconds ?? 0}s`
        },
        {
          type: "queue-worker",
          value: `Worker: processed ${snapshot.processed ?? worker.processed ?? 0}, failed runs ${snapshot.failedWorkerRuns ?? worker.failed ?? 0}, standby skips ${snapshot.standbySkips ?? worker.standbySkips ?? 0}, fallback runs ${snapshot.standbyFallbackRuns ?? worker.standbyFallbackRuns ?? 0}`
        },
        {
          type: "intelligence-snapshots",
          value: `Daily snapshots: event types ${snapshots.eventTypes ?? 0}, demand products ${snapshots.demandProducts ?? 0}, search queries ${snapshots.searchQueries ?? 0}, pruned ${snapshots.prunedSnapshots ?? 0}`
        },
        {
          type: "snapshot-health",
          value: `Snapshot health: recent ${snapshotHealth.recentSnapshots ?? 0}, estimated total ${snapshotHealth.estimatedTotalSnapshots ?? snapshotHealth.totalSnapshots ?? 0}, raw ${snapshotHealth.recentRawEventCount ?? 0}, latest ${snapshotHealth.latestUpdatedAt || "-"}`
        },
        ...(alerts.slice(0, 4).map((entry) => ({
          type: "queue-alert",
          value: `Queue alert ${entry.level || "high"} | ${entry.type || "event"} | ${entry.message || "-"}`
        }))),
        ...(trendSnapshots.slice(0, 3).map((entry) => ({
          type: "trend-snapshot",
          value: `Trend snapshot: ${entry.snapshotType || "-"}:${entry.snapshotKey || "-"} (${entry.count || 0}, score ${entry.score || 0})`
        }))),
        ...(topEventTypes.slice(0, 3).map((entry) => ({
          type: "event-type",
          value: `Top event: ${entry.eventType || "-"} (${entry.count || 0})`
        }))),
        ...(topProducts.slice(0, 3).map((entry) => ({
          type: "product-score",
          value: `Top product score: ${entry.id || "-"} (${entry.score || 0})`
        }))),
        ...(topSellers.slice(0, 3).map((entry) => ({
          type: "seller-score",
          value: `Top seller score: ${entry.id || "-"} (${entry.score || 0})`
        }))),
        ...((summary.recentAlerts || []).slice(0, 4).map((entry) => ({
          type: "alert",
          value: `Alert ${entry.alertSeverity || "high"} | ${entry.event || "event"} | ${entry.message || entry.path || "-"}`
        }))),
        ...((summary.recentFailures || []).slice(0, 6).map((entry) => ({
          type: "failure",
          value: `${entry.event || "event"} | ${entry.message || entry.path || "-"}`
        })))
      ];
    }

    function createPromotionSummaryStrip(promotions = []) {
      const safePromotions = Array.isArray(promotions) ? promotions : [];
      const counts = safePromotions.reduce((accumulator, promotion) => {
        const status = String(promotion?.status || "pending").trim().toLowerCase() || "pending";
        accumulator.total += 1;
        accumulator[status] = (accumulator[status] || 0) + 1;
        return accumulator;
      }, {
        total: 0,
        pending: 0,
        active: 0,
        rejected: 0,
        expired: 0,
        disabled: 0
      });

      const strip = deps.createElement("div", { className: "analytics-list" });
      [
        t("admin.promotionCountTotal", "Total: {count}", { count: counts.total }),
        t("admin.promotionCountPending", "Pending: {count}", { count: counts.pending }),
        t("admin.promotionCountActive", "Active: {count}", { count: counts.active }),
        t("admin.promotionCountRejected", "Rejected: {count}", { count: counts.rejected }),
        t("admin.promotionCountExpired", "Expired: {count}", { count: counts.expired }),
        t("admin.promotionCountDisabled", "Disabled: {count}", { count: counts.disabled })
      ].forEach((entry) => {
        strip.appendChild(deps.createElement("div", {
          className: "analytics-list-item",
          textContent: entry
        }));
      });
      return strip;
    }

    function getFilteredPromotions(promotions = []) {
      const safePromotions = Array.isArray(promotions) ? promotions : [];
      const normalizedQuery = String(promotionSearchState || "").trim().toLowerCase();
      const statusPriority = {
        pending: 0,
        active: 1,
        rejected: 2,
        expired: 3,
        disabled: 4
      };
      return safePromotions
        .filter((promotion) => {
          const matchesStatus = promotionFilterState === "all"
            || String(promotion?.status || "").trim().toLowerCase() === promotionFilterState;
          if (!matchesStatus) {
            return false;
          }
          if (!normalizedQuery) {
            return true;
          }
          const haystack = [
            promotion?.productId,
            promotion?.sellerUsername,
            promotion?.transactionReference,
            promotion?.type
          ]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
            .join(" ");
          return haystack.includes(normalizedQuery);
        })
        .sort((first, second) => {
          const firstStatus = String(first?.status || "").trim().toLowerCase() || "pending";
          const secondStatus = String(second?.status || "").trim().toLowerCase() || "pending";
          const firstPriority = Object.prototype.hasOwnProperty.call(statusPriority, firstStatus) ? statusPriority[firstStatus] : 99;
          const secondPriority = Object.prototype.hasOwnProperty.call(statusPriority, secondStatus) ? statusPriority[secondStatus] : 99;
          if (firstPriority !== secondPriority) {
            return firstPriority - secondPriority;
          }
          return new Date(second?.updatedAt || second?.createdAt || 0).getTime()
            - new Date(first?.updatedAt || first?.createdAt || 0).getTime();
        });
    }

    function createPromotionFilterControl() {
      const wrapper = deps.createElement("div", { className: "moderation-actions" });
      const label = deps.createElement("label", {
        className: "product-meta",
        textContent: t("admin.statusFilterLabel", "Status filter")
      });
      const select = deps.createElement("select", {
        attributes: {
          "data-admin-promotion-filter": "true"
        }
      });
      [
        ["all", t("admin.statusAll", "All")],
        ["pending", t("admin.statusPending", "Pending")],
        ["active", t("admin.statusActive", "Active")],
        ["rejected", t("admin.statusRejected", "Rejected")],
        ["expired", t("admin.statusExpired", "Expired")],
        ["disabled", t("admin.statusDisabled", "Disabled")]
      ].forEach(([value, text]) => {
        const option = deps.createElement("option", {
          textContent: text,
          attributes: { value }
        });
        if (promotionFilterState === value) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      wrapper.append(label, select);
      return wrapper;
    }

    function createPromotionSearchControl() {
      const wrapper = deps.createElement("div", { className: "moderation-actions" });
      const label = deps.createElement("label", {
        className: "product-meta",
        textContent: t("admin.searchLabel", "Search")
      });
      const input = deps.createElement("input", {
        attributes: {
          type: "search",
          value: promotionSearchState || "",
          placeholder: t("admin.promotionSearchPlaceholder", "Seller, product, or reference"),
          "data-admin-promotion-search": "true",
          autocomplete: "off"
        }
      });
      wrapper.append(label, input);
      return wrapper;
    }

    function createSystemSettingsSection(settings) {
      const wrapper = deps.createElement("div", { className: "moderation-list admin-settings-panel" });
      const heading = deps.createElement("div", { className: "section-heading" });
      const copy = deps.createElement("div");
      copy.append(
        deps.createElement("p", { className: "eyebrow", textContent: t("admin.eyebrow", t("ui.label.c1c224b03cd9", "Admin")) }),
        deps.createElement("h3", { textContent: t("admin.systemSettingsTitle", "System Settings") }),
        deps.createElement("p", {
          className: "meta-copy",
          textContent: t("admin.systemSettingsBody", "Control hero visibility, splash visibility, session expiry na cache policy.")
        })
      );
      heading.appendChild(copy);

      wrapper.appendChild(heading);

      if (settingsState.error) {
        wrapper.appendChild(deps.createElement("p", {
          className: "empty-copy admin-settings-error",
          textContent: settingsState.error
        }));
      }

      if (settingsState.loading && !settingsState.values) {
        wrapper.appendChild(deps.createEmptyState("Inapakia system settings..."));
        return wrapper;
      }

      const form = deps.createElement("div", {
        className: "admin-settings-form",
        attributes: {
          "data-admin-settings-form": "true"
        }
      });
      form.appendChild(createSettingsSectionBody(settings || settingsState.values || {}));

      const actions = deps.createElement("div", { className: "moderation-actions admin-settings-actions" });
      const saveButton = createActionButton(settingsState.saving ? "Saving..." : "Save Settings", {
        adminSettingsSave: "true"
      }, "button");
      if (settingsState.saving) {
        saveButton.setAttribute("disabled", "true");
      }
      actions.appendChild(saveButton);
      form.appendChild(actions);
      wrapper.appendChild(form);
      return wrapper;
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

    async function createAdminBody(state) {
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
      const pendingVideosBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.videos) {
        pendingVideosBody.appendChild(createLoadIssueState(t("admin.videoModerationLoadFailed", "Pending videos are unavailable right now.")));
      } else if (!state.pendingVideos.length) {
        pendingVideosBody.appendChild(deps.createEmptyState(t("admin.videoModerationEmpty", "There are no pending videos.")));
      } else {
        state.pendingVideos.forEach((video) => pendingVideosBody.appendChild(createVideoModerationCard(video)));
      }
      wrapper.appendChild(createSection(
        t("admin.videoModerationTitle", "Pending Videos"),
        t("admin.videoModerationBody", "Review product videos without hiding the product image listing."),
        pendingVideosBody
      ));

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
        promotionsBody.appendChild(createPromotionSummaryStrip(state.promotions));
        promotionsBody.appendChild(createPromotionFilterControl());
        promotionsBody.appendChild(createPromotionSearchControl());
        const visiblePromotions = getFilteredPromotions(state.promotions);
        if (state.loadErrors.promotions) {
          promotionsBody.appendChild(createLoadIssueState(t("admin.promotionsLoadFailed", "Promotions are unavailable right now.")));
        } else if (!state.promotions.length) {
          promotionsBody.appendChild(deps.createEmptyState(t("admin.promotionsEmpty", "There are no promotions to manage.")));
        } else if (!visiblePromotions.length) {
          promotionsBody.appendChild(deps.createEmptyState(t("admin.promotionsFilterEmpty", "There are no promotions matching this filter.")));
        } else {
          visiblePromotions.forEach((promotion) => promotionsBody.appendChild(createPromotionCard(promotion)));
        }
        wrapper.appendChild(createSection(t("admin.promotionsTitle", "Promotions"), t("admin.promotionsBody", "Admin-only promotion controls."), promotionsBody));

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
        const messageThreads = Array.isArray(state.adminMessages) ? state.adminMessages : [];
        const messageBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.adminMessages) {
          messageBody.appendChild(createLoadIssueState("Messages hazikupatikana kwa sasa."));
        } else if (!messageThreads.length) {
          messageBody.appendChild(deps.createEmptyState("Hakuna message threads za ku-review kwa sasa."));
        } else {
          await appendItemsInChunks(messageBody, messageThreads, (thread) => createMessageThreadCard(thread), 8);
        }
        wrapper.appendChild(createSection("Message Moderation", "View metadata, open content only on dispute, na audit trail huandikwa.", messageBody));
        await nextFrame();

        wrapper.appendChild(state.loadErrors.adminSettings
          ? createSection("System Settings", "Control splash, hero, cache, na session policy.", createLoadIssueState("System settings hazikupatikana kwa sasa."))
          : createSection("System Settings", "Control splash, hero, cache, na session policy.", createSystemSettingsSection(state.adminSettings || settingsState.values || {})));
        await nextFrame();

        if (state.loadErrors.opsSummary) {
          wrapper.appendChild(createSection("Ops Signals", "Runtime diagnostics za admin.", createLoadIssueState("Ops summary haikupatikana kwa sasa.")));
        } else if (state.opsSummary) {
          wrapper.appendChild(createSimpleListSection(
            "Ops Signals",
            `Storage: ${state.opsSummary.storageMode || "-"} | Backups: ${state.opsSummary.backupStatus?.fileCount ?? 0} | Warnings: ${(state.opsSummary.configWarnings || []).length} | Auth failures: ${state.opsSummary.counts?.authFailures24h ?? 0} | Alerts: ${state.opsSummary.counts?.alertCandidates24h ?? 0} | Denied: ${state.opsSummary.counts?.deniedActions24h ?? 0}`,
            buildOpsSignalLines(state.opsSummary),
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
        title: t("admin.userUpdatedTitle", "User updated"),
        body: t("admin.userUpdatedBody", `User ${username} amehifadhiwa kwenye moderation.`, { username }),
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
      if (status === "rejected" && deps.confirmAction && !deps.confirmAction(t("admin.rejectProductConfirm", "Una uhakika unataka kukataa bidhaa hii?"))) {
        return;
      }
      await deps.dataLayer.moderateProduct(productId, {
        status,
        moderationNote: note
      });
      deps.refreshProductsFromStore?.();
      deps.showInAppNotification?.({
        title: t("admin.productUpdatedTitle", "Product updated"),
        body: status === "approved"
          ? t("admin.productApprovedBody", "Bidhaa imekubaliwa kwenye moderation.")
          : t("admin.productRejectedBody", "Bidhaa imekataliwa kwenye moderation."),
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_product_moderated", "Staff moderated a product.", {
        productId,
        status
      });
      renderAdminView();
    }

    async function handleVideoAction(button) {
      const providerId = button.dataset.videoProviderId || "";
      const status = button.dataset.adminVideoAction || "";
      const note = readScopedTextarea(button.closest("[data-admin-video-card]"), `[data-admin-video-note="${providerId}"]`);
      if (!providerId || !["approved", "rejected"].includes(status)) return;
      if (status === "rejected" && !note) {
        throw new Error(t("admin.videoModerationReasonRequired", "A moderation reason is required when rejecting a video.")); // i18n-gate: allow -- internal diagnostic or language-neutral display
      }
      await deps.dataLayer.moderateAdminVideo(providerId, { status, moderationNote: note });
      deps.showInAppNotification?.({
        title: status === "approved"
          ? t("admin.videoApprovedTitle", "Video approved")
          : t("admin.videoRejectedTitle", "Video rejected"),
        body: t("admin.videoModerationSavedBody", "Video moderation decision was saved and the seller was notified."),
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_product_video_moderated", "Staff moderated a product video.", { providerId, status });
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
        title: t("admin.reportUpdatedTitle", "Report updated"),
        body: t("admin.reportUpdatedBody", `Report imewekwa kwenye status ya ${status}.`, { status }),
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
          title: t("admin.deepLinkCopiedTitle", "Deep link copied"),
          body: t("admin.deepLinkCopiedBody", "Product deep link ime-copy tayari."),
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
          title: t("admin.copyFailedTitle", "Copy failed"),
          body: error.message || t("admin.copyFailedBody", "Imeshindikana ku-copy deep link."),
          variant: "error"
        });
      }
    }

    async function handlePromotionDisable(button) {
      const promotionId = button.dataset.adminPromotionDisable || "";
      if (!promotionId) {
        return;
      }
      if (deps.confirmAction && !deps.confirmAction(t("admin.disablePromotionConfirm", "Una uhakika unataka kuzima promotion hii?"))) {
        return;
      }
      await deps.dataLayer.disablePromotion(promotionId);
      deps.showInAppNotification?.({
        title: t("admin.promotionDisabledTitle", "Promotion disabled"),
        body: t("admin.promotionDisabledBody", "Promotion imezimwa."),
        variant: "success"
      });
      deps.reportEvent?.("info", "admin_promotion_disabled", "Admin disabled a promotion.", {
        promotionId
      });
      renderAdminView();
    }

    async function handlePromotionReview(button) {
      const promotionId = button.dataset.adminPromotionReview || "";
      const status = button.dataset.adminPromotionStatus || "";
      if (!promotionId || !status) {
        return;
      }
      if (status === "rejected" && deps.confirmAction && !deps.confirmAction(t("admin.rejectPromotionConfirm", "Una uhakika unataka kukataa promotion hii?"))) {
        return;
      }
      const result = await deps.dataLayer.reviewPromotion(promotionId, { status });
      deps.showInAppNotification?.({
        title: status === "active"
          ? t("admin.promotionApprovedTitle", "Promotion approved")
          : t("admin.promotionRejectedTitle", "Promotion rejected"),
        body: status === "active"
          ? t("admin.promotionApprovedBody", "Promotion imekubaliwa na sasa inaweza kuonekana kwenye discovery.")
          : t("admin.promotionRejectedBody", "Promotion imekataliwa. Seller anaweza kutuma tena akiwa tayari."),
        variant: "success"
      });
      deps.reportEvent?.("info", status === "active" ? "admin_promotion_approved" : "admin_promotion_rejected", "Admin reviewed a promotion.", {
        promotionId,
        status
      });
      if (result?.productId) {
        deps.refreshProductsFromStore?.();
      }
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

    async function handleMessageReviewSubmit(button) {
      const conversationId = button.dataset.adminMessageReviewSubmit || messageReviewState.conversationId || "";
      const root = document.getElementById("admin-message-review-modal");
      const reason = root?.querySelector("[data-admin-message-review-reason='true']")?.value.trim() || "";
      if (!conversationId) {
        return;
      }
      messageReviewState = {
        ...messageReviewState,
        conversationId,
        reason,
        loading: true,
        error: ""
      };
      renderMessageReviewModal();
      try {
        const detail = await deps.dataLayer.reviewAdminMessage(conversationId, { reason });
        messageReviewState = {
          ...messageReviewState,
          loading: false,
          detail,
          error: ""
        };
        deps.reportEvent?.("info", "admin_message_review_opened", "Admin opened a message thread review.", {
          conversationId,
          reason
        });
      } catch (error) {
        messageReviewState = {
          ...messageReviewState,
          loading: false,
          error: error.message || "Imeshindikana kufungua message content."
        };
      }
      renderMessageReviewModal();
    }

    function createSettingsSectionBody(settings) {
      const panel = deps.createElement("div", { className: "admin-settings-grid" });
      const field = (label, input) => {
        const wrapper = deps.createElement("label", { className: "admin-setting-field" });
        wrapper.append(
          deps.createElement("span", { className: "admin-setting-label", textContent: label }),
          input
        );
        return wrapper;
      };

      const heroToggle = deps.createElement("input", {
        attributes: {
          type: "checkbox",
          "data-admin-setting-key": "heroSectionVisible"
        }
      });
      heroToggle.checked = Boolean(settings.heroSectionVisible);

      const showcaseToggle = deps.createElement("input", {
        attributes: {
          type: "checkbox",
          "data-admin-setting-key": "standaloneShowcaseVisible"
        }
      });
      showcaseToggle.checked = Boolean(settings.standaloneShowcaseVisible);

      const splashToggle = deps.createElement("input", {
        attributes: {
          type: "checkbox",
          "data-admin-setting-key": "splashScreenVisible"
        }
      });
      splashToggle.checked = Boolean(settings.splashScreenVisible);

      const signOutToggle = deps.createElement("input", {
        attributes: {
          type: "checkbox",
          "data-admin-setting-key": "requireExplicitSignOut"
        }
      });
      signOutToggle.checked = Boolean(settings.requireExplicitSignOut);

      const messageReviewToggle = deps.createElement("input", {
        attributes: {
          type: "checkbox",
          "data-admin-setting-key": "messageReviewRequiresReason"
        }
      });
      messageReviewToggle.checked = Boolean(settings.messageReviewRequiresReason);

      const expiryInput = deps.createElement("input", {
        attributes: {
          type: "number",
          min: "15",
          max: "1440",
          step: "15",
          "data-admin-setting-key": "sessionExpiryMinutes"
        }
      });
      expiryInput.value = String(settings.sessionExpiryMinutes || 120);

      const cachePolicySelect = deps.createElement("select", {
        attributes: {
          "data-admin-setting-key": "cachePolicy"
        }
      });
      [
        { value: "balanced", label: t("ui.label.5386ea5db81c", "Balanced") },
        { value: "cache-first", label: t("ui.label.5572b20ec42a", "Cache first") },
        { value: "network-first", label: t("ui.label.7c19abb4fcd3", "Network first") }
      ].forEach((option) => {
        const opt = deps.createElement("option", {
          attributes: {
            value: option.value
          },
          textContent: option.label
        });
        if ((settings.cachePolicy || "balanced") === option.value) {
          opt.selected = true;
        }
        cachePolicySelect.appendChild(opt);
      });

      panel.append(
        field("Hero section visible", heroToggle),
        field("Standalone showcase visible", showcaseToggle),
        field("Splash screen visible", splashToggle),
        field("Require explicit sign-out", signOutToggle),
        field("Message review requires reason", messageReviewToggle),
        field("Session expiry (minutes)", expiryInput),
        field("Cache policy", cachePolicySelect)
      );
      return panel;
    }

    async function handleSettingsSave(button) {
      const form = button.closest("[data-admin-settings-form]");
      if (!form) {
        return;
      }
      const payload = {};
      form.querySelectorAll("[data-admin-setting-key]").forEach((input) => {
        const key = input.dataset.adminSettingKey;
        if (!key) {
          return;
        }
        if (input.type === "checkbox") {
          payload[key] = input.checked;
          return;
        }
        payload[key] = input.value;
      });
      settingsState = {
        ...settingsState,
        saving: true,
        error: ""
      };
      renderAdminView();
      try {
        const updated = await deps.dataLayer.updateAdminSettings(payload);
        settingsState = {
          loading: false,
          saving: false,
          error: "",
          values: updated
        };
        deps.applyAppSettings?.(updated);
        deps.showInAppNotification?.({
          title: t("admin.settingsSavedTitle", "Settings saved"),
          body: t("admin.settingsSavedBody", "System settings zimehifadhiwa."),
          variant: "success"
        });
        deps.reportEvent?.("info", "admin_settings_updated", "Admin updated system settings.", {
          heroSectionVisible: Boolean(updated?.heroSectionVisible),
          standaloneShowcaseVisible: Boolean(updated?.standaloneShowcaseVisible)
        });
      } catch (error) {
        settingsState = {
          ...settingsState,
          saving: false,
          error: error.message || "Imeshindikana kuhifadhi settings."
        };
        deps.showInAppNotification?.({
          title: t("admin.settingsSaveFailedTitle", "Settings save failed"),
          body: error.message || t("admin.settingsSaveFailedBody", "Imeshindikana kuhifadhi settings."),
          variant: "error"
        });
      }
      renderAdminView();
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
              title: t("admin.userUpdateFailedTitle", "User update failed"),
              body: error.message || t("admin.userUpdateFailedBody", "Imeshindikana kuhifadhi moderation ya user."),
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-message-review]").forEach((button) => {
        button.addEventListener("click", () => {
          const scope = button.closest("[data-admin-message-card]");
          openMessageReviewModal(scope?.__adminThread || null);
        });
      });

      panel.querySelectorAll("[data-admin-message-review-submit]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-message-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleMessageReviewSubmit(button);
          } catch (error) {
            deps.captureError?.("admin_message_review_failed", error, {
              conversationId: button.dataset.adminMessageReviewSubmit || ""
            });
            deps.showInAppNotification?.({
              title: t("admin.messageReviewFailedTitle", "Message review failed"),
              body: error.message || t("admin.messageReviewFailedBody", "Imeshindikana kufungua message content."),
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
              title: t("admin.productModerationFailedTitle", "Product moderation failed"),
              body: error.message || t("admin.productModerationFailedBody", "Imeshindikana kuhifadhi moderation ya bidhaa."),
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-video-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-video-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handleVideoAction(button);
          } catch (error) {
            deps.captureError?.("admin_video_moderation_failed", error, {
              providerId: button.dataset.videoProviderId || "",
              status: button.dataset.adminVideoAction || ""
            });
            deps.showInAppNotification?.({ title: t("admin.videoModerationFailedTitle", "Video moderation failed"), body: error.message, variant: "error" });
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
              title: t("admin.reportUpdateFailedTitle", "Report update failed"),
              body: error.message || t("admin.reportUpdateFailedBody", "Imeshindikana kusasisha report."),
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
              title: t("admin.promotionUpdateFailedTitle", "Promotion update failed"),
              body: error.message || t("admin.promotionUpdateFailedBody", "Imeshindikana kuzima promotion."),
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-promotion-review]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-promotion-card]");
          toggleScopedBusyState(scope, true);
          try {
            await handlePromotionReview(button);
          } catch (error) {
            deps.captureError?.("admin_promotion_review_failed", error, {
              promotionId: button.dataset.adminPromotionReview || "",
              status: button.dataset.adminPromotionStatus || ""
            });
            deps.showInAppNotification?.({
              title: t("admin.promotionReviewFailedTitle", "Promotion review failed"),
              body: error.message || t("admin.promotionReviewFailedBody", "Imeshindikana kureview promotion."),
              variant: "error"
            });
          } finally {
            toggleScopedBusyState(scope, false);
          }
        });
      });

      panel.querySelectorAll("[data-admin-promotion-filter]").forEach((select) => {
        select.addEventListener("change", () => {
          promotionFilterState = String(select.value || "all").trim().toLowerCase() || "all";
          renderAdminView();
        });
      });

      panel.querySelectorAll("[data-admin-promotion-search]").forEach((input) => {
        input.addEventListener("input", () => {
          promotionSearchState = String(input.value || "").trim();
          renderAdminView();
        });
      });

      panel.querySelectorAll("[data-admin-settings-save]").forEach((button) => {
        button.addEventListener("click", async () => {
          const scope = button.closest("[data-admin-settings-form]");
          toggleScopedBusyState(scope, true);
          try {
            await handleSettingsSave(button);
          } catch (error) {
            deps.captureError?.("admin_settings_save_failed", error, {});
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

    function dedupeAdminRecords(items, getIdentity) {
      const seen = new Set();
      return (Array.isArray(items) ? items : []).filter((item, index) => {
        const identity = String(getIdentity?.(item) || "").trim();
        const key = identity || "anonymous:" + index;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
      const pendingVideosBody = deps.createElement("div", { className: "moderation-list" });
      if (state.loadErrors.videos) {
        pendingVideosBody.appendChild(createLoadIssueState(t("admin.videoModerationLoadFailed", "Pending videos are unavailable right now.")));
      } else if (!state.pendingVideos.length) {
        pendingVideosBody.appendChild(deps.createEmptyState(t("admin.videoModerationEmpty", "There are no pending videos.")));
      } else {
        state.pendingVideos.forEach((video) => pendingVideosBody.appendChild(createVideoModerationCard(video)));
      }
      wrapper.appendChild(createSection(
        t("admin.videoModerationTitle", "Pending Videos"),
        t("admin.videoModerationBody", "Review product videos without hiding the product image listing."),
        pendingVideosBody
      ));
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
        const messageThreads = Array.isArray(state.adminMessages) ? state.adminMessages : [];
        const messageBody = deps.createElement("div", { className: "moderation-list" });
        if (state.loadErrors.adminMessages) {
          messageBody.appendChild(createLoadIssueState("Messages hazikupatikana kwa sasa."));
        } else if (!messageThreads.length) {
          messageBody.appendChild(deps.createEmptyState("Hakuna message threads za ku-review kwa sasa."));
        } else {
          await appendItemsInChunks(messageBody, messageThreads, (thread) => createMessageThreadCard(thread), 8);
        }
        wrapper.appendChild(createSection("Message Moderation", "View metadata, open content only on dispute, na audit trail huandikwa.", messageBody));
        await nextFrame();

        const promotionsBody = deps.createElement("div", { className: "moderation-list" });
        promotionsBody.appendChild(createPromotionSummaryStrip(state.promotions));
        promotionsBody.appendChild(createPromotionFilterControl());
        promotionsBody.appendChild(createPromotionSearchControl());
        const visiblePromotions = getFilteredPromotions(state.promotions);
        if (state.loadErrors.promotions) {
          promotionsBody.appendChild(createLoadIssueState(t("admin.promotionsLoadFailed", "Promotions are unavailable right now.")));
        } else if (!state.promotions.length) {
          promotionsBody.appendChild(deps.createEmptyState(t("admin.promotionsEmpty", "There are no promotions to manage.")));
        } else if (!visiblePromotions.length) {
          promotionsBody.appendChild(deps.createEmptyState(t("admin.promotionsFilterEmpty", "There are no promotions matching this filter.")));
        } else {
          await appendItemsInChunks(promotionsBody, visiblePromotions, (promotion) => createPromotionCard(promotion), 10);
        }
        wrapper.appendChild(createSection(t("admin.promotionsTitle", "Promotions"), t("admin.promotionsBody", "Admin-only promotion controls."), promotionsBody));
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

        wrapper.appendChild(state.loadErrors.adminSettings
          ? createSection("System Settings", "Control splash, hero, cache, na session policy.", createLoadIssueState("System settings hazikupatikana kwa sasa."))
          : createSection("System Settings", "Control splash, hero, cache, na session policy.", createSystemSettingsSection(state.adminSettings || settingsState.values || {})));
        await nextFrame();

        if (state.loadErrors.opsSummary) {
          wrapper.appendChild(createSection("Ops Signals", "Runtime diagnostics za admin.", createLoadIssueState("Ops summary haikupatikana kwa sasa.")));
        } else if (state.opsSummary) {
          wrapper.appendChild(createSimpleListSection(
            "Ops Signals",
            `Storage: ${state.opsSummary.storageMode || "-"} | Backups: ${state.opsSummary.backupStatus?.fileCount ?? 0} | Warnings: ${(state.opsSummary.configWarnings || []).length} | Auth failures: ${state.opsSummary.counts?.authFailures24h ?? 0} | Alerts: ${state.opsSummary.counts?.alertCandidates24h ?? 0} | Denied: ${state.opsSummary.counts?.deniedActions24h ?? 0}`,
            buildOpsSignalLines(state.opsSummary),
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
      closeMessageReviewModal();

      const sequence = ++renderSequence;
      panel.replaceChildren(
        createSection("Admin Console", "Usimamizi wa marketplace, moderation, na analytics.", deps.createEmptyState("Inapakia admin tools..."))
      );
      deps.renderAnalyticsPanel?.(null, "Marketplace Overview", "Inapakia analytics...");

      const tasks = [
        deps.dataLayer.loadAnalytics(),
        deps.dataLayer.loadAdminUsers(),
        deps.dataLayer.loadAdminProducts("pending"),
        deps.dataLayer.loadAdminReports({ status: "open" }),
        deps.dataLayer.loadAdminVideos("pending")
      ];

      if (deps.isAdminUser?.()) {
        tasks.push(
          deps.dataLayer.loadAdminPromotions(),
          deps.dataLayer.loadAdminOrders({}),
          deps.dataLayer.loadAdminPayments({}),
          deps.dataLayer.loadModerationActions(),
          deps.dataLayer.loadAdminOpsSummary(),
          deps.dataLayer.loadAdminMessages(),
          deps.dataLayer.loadAdminSettings()
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
      const pendingVideos = getSettledValue(results[4], []);
      const promotions = deps.isAdminUser?.() ? getSettledValue(results[5], []) : [];
      const orders = deps.isAdminUser?.() ? getSettledValue(results[6], []) : [];
      const payments = deps.isAdminUser?.() ? getSettledValue(results[7], []) : [];
      const moderationActions = deps.isAdminUser?.() ? getSettledValue(results[8], []) : [];
      const opsSummary = deps.isAdminUser?.() ? getSettledValue(results[9], null) : null;
      const adminMessages = deps.isAdminUser?.() ? getSettledValue(results[10], []) : [];
      const adminSettings = deps.isAdminUser?.() ? getSettledValue(results[11], null) : null;

      const failedLoads = ["analytics", "users", "products", "reports", "videos", "promotions", "orders", "payments", "moderationActions", "opsSummary", "adminMessages", "adminSettings"]
        .filter((_, index) => results[index] && results[index].status === "rejected");
      if (failedLoads.length) {
        deps.captureError?.("admin_surface_partial_load_failed", new Error("Some admin datasets failed to load."), { // i18n-gate: allow -- internal diagnostic or language-neutral display
          failedLoads: failedLoads.join(",")
        });
        deps.showInAppNotification?.({
          title: t("admin.partialDataTitle", "Admin data partial"),
          body: t("admin.partialDataBody", "Baadhi ya admin data haijafunguka kikamilifu, lakini panel imefunguliwa."),
          variant: "warning"
        });
      }

      deps.renderAnalyticsPanel?.(analytics, "Marketplace Overview", deps.isAdminUser?.()
        ? "Admin anaona muhtasari wa marketplace nzima."
        : "Moderator anaona muhtasari wa moderation.");

      const state = {
        users: dedupeAdminRecords(users, (item) => item?.username || item?.id),
        pendingProducts: dedupeAdminRecords(pendingProducts, (item) => item?.id),
        pendingVideos: dedupeAdminRecords(pendingVideos, (item) => item?.providerId),
        openReports: dedupeAdminRecords(openReports, (item) => item?.id),
        promotions: dedupeAdminRecords(promotions, (item) => item?.id),
        orders: dedupeAdminRecords(orders, (item) => item?.id),
        payments: dedupeAdminRecords(payments, (item) => item?.id),
        moderationActions: dedupeAdminRecords(moderationActions, (item) => item?.id),
        adminMessages: dedupeAdminRecords(adminMessages, (item) => item?.conversationId || item?.id),
        adminSettings: adminSettings || null,
        opsSummary,
        hasAnyLoadError: failedLoads.length > 0,
        loadErrors: {
          analytics: failedLoads.includes("analytics"),
          users: failedLoads.includes("users"),
          products: failedLoads.includes("products"),
          videos: failedLoads.includes("videos"),
          reports: failedLoads.includes("reports"),
          promotions: failedLoads.includes("promotions"),
          orders: failedLoads.includes("orders"),
          payments: failedLoads.includes("payments"),
          moderationActions: failedLoads.includes("moderationActions"),
          opsSummary: failedLoads.includes("opsSummary"),
          adminMessages: failedLoads.includes("adminMessages"),
          adminSettings: failedLoads.includes("adminSettings")
        }
      };
      latestUsers = state.users;
      settingsState = {
        loading: false,
        saving: settingsState.saving,
        error: state.loadErrors.adminSettings ? "System settings hazikupatikana kwa sasa." : "",
        values: adminSettings || settingsState.values || null
      };

      const body = await createAdminBody(state);
      panel.replaceChildren(body);
      bindAdminActions(panel);
      deps.bindMediaInteractions?.(panel);
    }

    return { renderAdminView };
  }

  window.WingaModules.admin.createAdminControllerModule = createAdminControllerModule;
})();
