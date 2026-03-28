(() => {
  function createAdminControllerModule(deps) {
    let renderSequence = 0;

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
        { src: user.passportPhoto, alt: `${user.username} passport photo` },
        { src: user.identityDocumentImage, alt: `${user.username} identity document` }
      ].filter((item) => item.src);
      if (!images.length) {
        return null;
      }
      images.forEach((item) => {
        preview.appendChild(deps.createResponsiveImage({
          src: item.src,
          alt: item.alt,
          fallbackSrc: deps.getImageFallbackDataUri("ID"),
          className: "admin-verification-image"
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

    function createUserCard(user) {
      const card = deps.createElement("article", {
        className: "admin-user-card",
        attributes: {
          "data-admin-user-card": user.username
        }
      });
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

      card.append(
        deps.createElement("strong", { textContent: product.name }),
        createMetaCopy(`${product.shop || product.uploadedBy} | ${deps.getCategoryLabel?.(product.category) || product.category}`),
        createMetaCopy(`Muuzaji: ${product.uploadedBy || "-"}`),
        createMetaCopy(`Price: ${deps.formatProductPrice(product.price)}`),
        deps.createStatusPill(product.status || "pending", mapStatusClass(product.status))
      );
      if (safeImage) {
        card.appendChild(deps.createResponsiveImage({
          src: safeImage,
          alt: product.name,
          fallbackSrc: deps.getImageFallbackDataUri("W"),
          className: "admin-verification-image"
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

    function bindAdminActions(panel) {
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

    async function renderAdminView() {
      const panel = deps.getAdminPanel?.();
      if (!panel) {
        return;
      }

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

      const body = createAdminBody(state);
      panel.replaceChildren(body);
      bindAdminActions(panel);
    }

    return { renderAdminView };
  }

  window.WingaModules.admin.createAdminControllerModule = createAdminControllerModule;
})();
