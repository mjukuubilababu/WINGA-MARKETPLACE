(() => {
  function createAdminUiModule(deps) {
    const t = (key, fallbackText = "", variables = {}) => deps.translate?.(key, variables, fallbackText) || fallbackText;
    function createAnalyticsCard(label, value) {
      const card = deps.createElement("div", { className: "analytics-card" });
      card.append(
        deps.createElement("span", { textContent: label }),
        deps.createElement("strong", { textContent: value })
      );
      return card;
    }

    function createAnalyticsListItem(title, body) {
      const item = deps.createElement("div", { className: "analytics-list-item" });
      item.append(
        deps.createElement("strong", { textContent: title }),
        deps.createElement("p", { className: "product-meta", textContent: body })
      );
      return item;
    }

    function createSellerOpportunityItem(opportunity) {
      const item = deps.createElement("div", { className: "analytics-list-item seller-opportunity-item" });
      const queryLabel = String(opportunity?.queryKey || "").replace(/-/g, " ").trim();
      const categoryLabel = opportunity?.category ? deps.getCategoryLabel(opportunity.category) : "";
      const title = queryLabel || categoryLabel || t("commerceOpportunity.defaultTitle", "Buyer demand opportunity");
      const context = [
        categoryLabel,
        String(opportunity?.region || "").replace(/-/g, " ").trim(),
        opportunity?.color ? t("commerceOpportunity.color", "Color: {value}", { value: opportunity.color }) : "",
        opportunity?.size ? t("commerceOpportunity.size", "Size: {value}", { value: opportunity.size }) : ""
      ].filter(Boolean).join(" | ");
      const demand = t("commerceOpportunity.demandEvidence", "Demand score {score} from {count} signals", {
        score: deps.formatNumber(opportunity?.demandScore || 0),
        count: deps.formatNumber(opportunity?.evidenceCount || 0)
      });
      const actions = deps.createElement("div", { className: "product-actions seller-opportunity-actions" });
      const createButton = deps.createElement("button", {
        className: "action-btn",
        textContent: t("commerceOpportunity.createSupply", "Create supply"),
        attributes: { type: "button" }
      });
      const dismissButton = deps.createElement("button", {
        className: "action-btn action-btn-secondary",
        textContent: t("commerceOpportunity.notRelevant", "Not relevant"),
        attributes: { type: "button" }
      });
      createButton.addEventListener("click", () => deps.onSellerOpportunityAction?.("create", opportunity));
      dismissButton.addEventListener("click", async () => {
        createButton.disabled = true;
        dismissButton.disabled = true;
        try {
          await deps.onSellerOpportunityAction?.("dismiss", opportunity);
          item.remove();
        } catch (error) {
          createButton.disabled = false;
          dismissButton.disabled = false;
        }
      });
      actions.append(createButton, dismissButton);
      item.append(
        deps.createElement("strong", { textContent: title }),
        deps.createElement("p", { className: "product-meta", textContent: [context, demand].filter(Boolean).join(" | ") }),
        actions
      );
      return item;
    }

    let sellerState = { owner: "", data: null, loading: false, error: false, tab: "overview", trendTab: "demand", windowDays: 30, sequence: 0 };
    const el = (tag, className, text, attributes) => deps.createElement(tag, { className, textContent: text, attributes });
    const a = (key, fallback, variables) => t("sellerAnalytics." + key, fallback, variables);
    const count = value => value === undefined || value === null || !Number.isFinite(Number(value))
      ? "—" : deps.formatNumber(Number(value));
    const rate = value => value === undefined || value === null ? "—" : count(Math.round(Number(value) * 10000) / 100) + "%";
    const rows = value => Array.isArray(value) ? value : [];

    function analyticsButton(label, action, icon) {
      const button = el("button", icon ? "analytics-icon-button" : "analytics-action", undefined, {
        type: "button", ...(icon ? { "aria-label": label, title: label } : {})
      });
      if (icon) button.append(el("img", "", undefined, { src: icon, width: 22, height: 22, alt: "" }));
      else button.textContent = label;
      button.addEventListener("click", action);
      return button;
    }

    function leaveSellerAnalytics() {
      if (!sellerState.owner) return;
      sellerState = { owner: "", data: null, loading: false, error: false, tab: "overview", trendTab: "demand", windowDays: 30, sequence: sellerState.sequence + 1 };
      const panel = deps.getAnalyticsPanel();
      panel?.classList.remove("seller-analytics");
      panel?.replaceChildren();
    }

    function renderSellerAnalyticsView(force = false) {
      if (!deps.isSellerAnalyticsView?.()) return;
      const owner = deps.getCurrentUser();
      if (sellerState.owner !== owner) {
        leaveSellerAnalytics();
        sellerState.owner = owner;
      }
      if (!sellerState.loading && (force || (!sellerState.data && !sellerState.error))) {
        sellerState.loading = true;
        sellerState.error = false;
        const sequence = ++sellerState.sequence;
        Promise.resolve().then(() => deps.loadAnalytics({ windowDays: sellerState.windowDays })).then(data => {
          if (sequence !== sellerState.sequence || owner !== deps.getCurrentUser() || !deps.isSellerAnalyticsView()) return;
          if (!data || typeof data !== "object") throw new Error(t("profile.analyticsUnavailableTitle", "Analytics unavailable"));
          sellerState.data = deps.decorateSellerAnalytics?.(data) || data;
        }).catch(error => {
          if (sequence !== sellerState.sequence || owner !== deps.getCurrentUser() || !deps.isSellerAnalyticsView()) return;
          sellerState.error = true;
          deps.captureError?.("seller_analytics_load_failed", error, { category: "analytics" });
        }).finally(() => {
          if (sequence !== sellerState.sequence || owner !== deps.getCurrentUser() || !deps.isSellerAnalyticsView()) return;
          sellerState.loading = false;
          renderSellerDashboard();
        });
      }
      renderSellerDashboard();
    }

    function renderSellerDashboard() {
      const panel = deps.getAnalyticsPanel();
      if (!panel || !deps.isSellerAnalyticsView?.()) return;
      panel.classList.add("seller-analytics");
      const heading = el("header", "analytics-heading");
      const isSubpage = sellerState.tab === "insights" || sellerState.tab === "demand";
      const backAction = isSubpage
        ? () => { sellerState.tab = "overview"; renderSellerDashboard(); }
        : () => deps.onAnalyticsBack?.();
      const headingTitle = sellerState.tab === "insights"
        ? a("insightsTitle", "Insights & recommendations")
        : sellerState.tab === "demand"
          ? a("demand", "Demand & opportunities")
          : t("ui.label.94c116ee118a", "Analytics");
      heading.append(
        analyticsButton(t("creation.back", "Back"), backAction, "/icons/create/arrow-left.svg"),
        el("h1", "", headingTitle)
      );
      const period = el("select", "analytics-period-control", undefined, {
        "aria-label": a("period", "Analytics period")
      });
      [7, 30, 90].forEach(days => {
        const option = el("option", "", a("window", "Last {days} days", { days }), { value: days });
        option.selected = days === sellerState.windowDays;
        period.append(option);
      });
      period.disabled = sellerState.loading;
      period.addEventListener("change", () => {
        sellerState.windowDays = Number(period.value) || 30;
        renderSellerAnalyticsView(true);
      });
      const refresh = analyticsButton(a("refresh", "Refresh analytics"), () => renderSellerAnalyticsView(true), "/icons/navigation/refresh-cw.svg");
      refresh.classList.add("analytics-refresh-control");
      refresh.disabled = sellerState.loading;
      refresh.classList.toggle("is-loading", sellerState.loading);
      heading.append(period, refresh);
      const tabs = [
        ["overview", a("overview", "Overview")], ["products", a("products", "Products")],
        ["customers", a("customers", "Customers")], ["content", a("content", "Content")],
        ["trends", a("trends", "Trends")]
      ];
      const tablist = el("div", "analytics-tabs", undefined, { role: "tablist", "aria-label": t("ui.label.94c116ee118a", "Analytics") });
      const buttons = tabs.map(([id, label], index) => {
        const button = analyticsButton(label, () => {
          sellerState.tab = id;
          renderSellerDashboard();
          panel.querySelector("#analytics-tab-" + id)?.focus();
        });
        button.id = "analytics-tab-" + id;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(id === sellerState.tab));
        button.setAttribute("aria-controls", "analytics-content");
        button.tabIndex = id === sellerState.tab ? 0 : -1;
        button.addEventListener("keydown", event => {
          const direction = document.documentElement.dir === "rtl" ? -1 : 1;
          let next = event.key === "ArrowRight" ? index + direction : event.key === "ArrowLeft" ? index - direction : null;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = tabs.length - 1;
          if (next === null) return;
          event.preventDefault();
          buttons[(next + tabs.length) % tabs.length].click();
        });
        return button;
      });
      tablist.append(...buttons);
      if (isSubpage) tablist.hidden = true;
      const content = el("div", "analytics-content", undefined, {
        id: "analytics-content", role: "tabpanel",
        ...(isSubpage ? { "aria-label": headingTitle }
          : { "aria-labelledby": "analytics-tab-" + sellerState.tab })
      });
      const status = el("p", "analytics-status", sellerState.loading ? a("loading", "Loading analytics...") :
        sellerState.error ? a("failed", "Could not refresh analytics. Please try again.") : "", { role: "status" });
      panel.replaceChildren(heading, tablist, status, content);
      const data = sellerState.data;
      if (!data) return;
      const timeSeries = data.timeSeries || {};
      const timeSeriesPoints = rows(timeSeries.points);
      const hasTimeSeries = !timeSeries.error && timeSeriesPoints.length > 0;
      const periodCurrent = hasTimeSeries ? (timeSeries.current || {}) : {};
      const periodGrowth = hasTimeSeries ? (timeSeries.growth || {}) : {};
      const video = data.video || {};
      const demand = data.demand || {};
      const market = data.market || {};
      const search = data.searchDemand || market.searchDemand || {};
      const section = (title, note = "") => {
        const node = el("section", "analytics-section");
        const titleRow = el("div", "analytics-section-heading");
        titleRow.append(el("h2", "", title));
        node.append(titleRow);
        if (note) node.append(el("p", "analytics-note", note));
        content.append(node);
        return node;
      };
      const icon = (src, className = "") => el("span", "analytics-symbol " + className, undefined, {
        role: "img", "aria-hidden": "true", style: `--analytics-icon:url('${src}')`
      });
      const decorateHeading = (node, src, className = "") => node.querySelector(".analytics-section-heading")?.prepend(icon(src, className));
      const growthLabel = value => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return a("newActivity", "New activity");
        const numeric = Math.round(Number(value) * 100) / 100;
        return `${numeric > 0 ? "+" : ""}${count(numeric)}% ${a("versusPrevious", "vs previous period")}`;
      };
      const metrics = (node, items) => {
        const grid = el("div", "analytics-metrics");
        items.forEach(([key, label, value, src, growth]) => {
          const metric = createAnalyticsCard(label, value);
          metric.dataset.metric = key;
          if (src) metric.prepend(icon(src, key));
          if (growth !== undefined) {
            const trend = el("small", "analytics-growth", growthLabel(growth));
            trend.classList.toggle("is-negative", Number(growth) < 0);
            metric.append(trend);
          }
          grid.append(metric);
        });
        node.append(grid);
      };
      const list = (node, items, render) => {
        if (!items.length) { node.append(el("p", "analytics-empty", a("empty", "No activity recorded yet."))); return; }
        const group = el("div", "analytics-rows");
        items.forEach((item, index) => group.append(render(item, index)));
        node.append(group);
      };
      const item = (title, evidence, action, id) => {
        const row = el("div", "analytics-row");
        const text = el("div", "analytics-row-copy");
        text.append(el("strong", "", title), el("p", "analytics-note", evidence));
        row.append(text);
        if (action && (action !== "product" || id)) row.append(analyticsButton(
          action === "products" ? a("manageProducts", "Manage products") : a("openProduct", "Open product"),
          () => deps.onAnalyticsAction?.(action, id)));
        return row;
      };
      const bars = (node, entries, label, value, options = {}) => {
        const max = Math.max(1, ...entries.map(entry => Math.max(0, Number(value(entry)) || 0)));
        list(node, entries, (entry, index) => {
          const row = item(label(entry), count(value(entry)));
          if (options.ranked) row.prepend(el("span", "analytics-rank", String(index + 1)));
          const bar = el("meter", "analytics-bar", undefined, { min: 0, max, value: Math.max(0, Number(value(entry)) || 0), "aria-label": label(entry) });
          row.append(bar);
          return row;
        });
      };
      const actionCard = (node, title, body, action, src, tone) => {
        const card = el("button", "analytics-action-card " + tone, undefined, { type: "button" });
        card.append(icon(src, tone));
        const copy = el("span", "analytics-action-copy");
        copy.append(el("strong", "", title), el("small", "", body));
        card.append(copy, el("span", "analytics-action-arrow", "›", { "aria-hidden": "true" }));
        card.addEventListener("click", action);
        node.append(card);
      };
      const demandProductItem = entry => {
        const demandValue = Math.max(0, Number(entry?.totalDemand || 0));
        const waiting = Math.max(0, Number(entry?.waitingUsers || 0));
        const restock = Math.max(0, Number(entry?.restockInterest || 0));
        const row = item(
          entry?.productName || entry?.productId,
          a("demandEvidence", "Demand score {score} / {waiting} waiting", {
            score: count(entry?.demandScore ?? demandValue),
            waiting: count(waiting)
          }),
          "product",
          entry?.productId
        );
        row.classList.add("analytics-demand-product");
        const image = deps.createResponsiveImage?.({
          src: entry?.productImage || "",
          alt: entry?.productName || "",
          className: "analytics-demand-image",
          fallbackSrc: deps.getImageFallbackDataUri?.("W") || "",
          attributes: { "data-disable-image-zoom": "true" }
        }) || el("span", "analytics-demand-image analytics-demand-fallback", "W", { "aria-hidden": "true" });
        const badgeText = waiting > 0
          ? a("waitingCount", "{count} waiting", { count: count(waiting) })
          : restock > 0
            ? a("restockCount", "{count} restock requests", { count: count(restock) })
            : a("demandScoreValue", "Demand {score}", { score: count(entry?.demandScore ?? demandValue) });
        row.prepend(image);
        row.append(el("span", "analytics-demand-badge", badgeText));
        return row;
      };
      const productPerformanceItem = entry => item(
        entry?.name || entry?.id,
        a("productEvidence", "{views} views / {likes} likes", {
          views: count(entry?.views),
          likes: count(entry?.likes)
        }),
        "product",
        entry?.id
      );
      const appendSizeShareInsight = (node, entries) => {
        const normalized = entries
          .map(entry => ({ label: String(entry?.size || "").trim(), value: Math.max(0, Number(entry?.count || 0)) }))
          .filter(entry => entry.label && entry.value > 0);
        const total = normalized.reduce((sum, entry) => sum + entry.value, 0);
        if (!total) return;
        const leaders = normalized.slice(0, 2);
        const share = Math.round((leaders.reduce((sum, entry) => sum + entry.value, 0) / total) * 100);
        node.append(el("p", "analytics-evidence-strip", a("sizeShare", "{sizes} account for {share}% of recorded size requests", {
          sizes: leaders.map(entry => entry.label).join(" & "),
          share
        })));
      };
      const trendChart = node => {
        const chart = el("div", "analytics-trend-chart");
        if (!hasTimeSeries) {
          chart.append(el("p", "analytics-empty", a("historyUnavailable", "Historical trend data is not available yet.")));
          node.append(chart);
          return;
        }
        const width = 600;
        const height = 180;
        const inset = 14;
        const max = Math.max(1, ...timeSeriesPoints.flatMap(point => [Number(point.views || 0), Number(point.likes || 0)]));
        const pointString = metric => timeSeriesPoints.map((point, index) => {
          const x = timeSeriesPoints.length === 1 ? width / 2 : inset + (index * (width - inset * 2) / (timeSeriesPoints.length - 1));
          const y = height - inset - (Math.max(0, Number(point[metric] || 0)) / max) * (height - inset * 2);
          return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
        }).join(" ");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", a("chartLabel", "Daily product views and likes"));
        [["views", "analytics-chart-views"], ["likes", "analytics-chart-likes"]].forEach(([metric, className]) => {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          line.setAttribute("points", pointString(metric));
          line.setAttribute("class", className);
          line.setAttribute("fill", "none");
          svg.append(line);
        });
        const labels = el("div", "analytics-chart-labels");
        const labelIndexes = Array.from(new Set([0, Math.floor((timeSeriesPoints.length - 1) / 2), timeSeriesPoints.length - 1]));
        labelIndexes.forEach(index => labels.append(el("span", "", String(timeSeriesPoints[index]?.date || "").slice(5))));
        const legend = el("div", "analytics-chart-legend");
        legend.append(el("span", "views", a("views", "Product views")), el("span", "likes", a("likes", "Likes")));
        chart.append(svg, labels, legend);
        node.append(chart);
      };
      const catalogMetrics = [
        ["totalProducts", a("totalProducts", "Total products"), count(data.totalProducts), "/icons/navigation/store.svg"],
        ["approvedProducts", a("approved", "Approved"), count(data.approvedProducts), "/icons/navigation/chart-column.svg"],
        ["pendingProducts", a("pending", "Pending"), count(data.pendingProducts), "/icons/navigation/refresh-cw.svg"],
        ["rejectedProducts", a("rejected", "Rejected"), count(data.rejectedProducts), "/icons/create/x.svg"]
      ];
      if (sellerState.tab === "overview") {
        const welcome = el("section", "analytics-welcome");
        const welcomeCopy = el("div", "analytics-welcome-copy");
        welcomeCopy.append(
          el("h2", "", a("welcome", "Welcome back, {name}", { name: deps.getCurrentDisplayName?.() || sellerState.owner })),
          el("p", "", a("welcomeBody", "Your business activity at a glance."))
        );
        welcome.append(welcomeCopy);
        metrics(welcome, [
          ["summaryViews", a("views", "Product views"), count(hasTimeSeries ? periodCurrent.views : data.totalViews), "/icons/navigation/chart-column.svg", hasTimeSeries ? periodGrowth.views : undefined],
          ["summaryInquiries", a("inquiries", "New inquiries"), count(hasTimeSeries ? periodCurrent.inquiries : data.newInquiries), "/icons/navigation/message-circle.svg", hasTimeSeries ? periodGrowth.inquiries : undefined],
          ["summaryOrders", a("orders", "Orders"), count(hasTimeSeries ? periodCurrent.orders : data.openOrders), "/icons/navigation/store.svg", hasTimeSeries ? periodGrowth.orders : undefined],
          ["summarySales", a("salesCurrency", "Sales ({currency})", { currency: timeSeries.currency || "TZS" }), hasTimeSeries ? count(periodCurrent.sales) : "—", "/icons/navigation/chart-column.svg", hasTimeSeries ? periodGrowth.sales : undefined]
        ]);
        panel.insertBefore(welcome, tablist);
        const activeOpportunities = rows(data.commerceLearning?.opportunities)
          .filter(entry => entry && !entry.sellerResponded)
          .slice(0, 2);
        const adaptiveSignals = activeOpportunities.length
          + (Number(data.newInquiries || 0) > 0 ? 1 : 0)
          + (Number(video.videoAssistedActions || 0) > 0 || Number(video.productClicks || 0) > 0 ? 1 : 0);
        if (adaptiveSignals > 0) {
          const adaptive = el("section", "analytics-adaptive-layer");
          const adaptiveHeading = el("div", "analytics-section-heading");
          adaptiveHeading.append(icon("/icons/navigation/sparkles.svg", "orange"), el("h2", "", a("adaptiveNow", "What matters now")));
          adaptive.append(adaptiveHeading);
          if (activeOpportunities.length) {
            adaptive.append(el("h3", "analytics-adaptive-subtitle", a("todaysOpportunities", "Today's opportunities")));
            activeOpportunities.forEach(entry => adaptive.append(createSellerOpportunityItem(entry)));
          }
          if (Number(data.newInquiries || 0) > 0) actionCard(adaptive,
            a("replyToInquiries", "Reply to inquiries"),
            a("replyToInquiriesReason", "{count} new inquiries are waiting.", { count: count(data.newInquiries) }),
            () => deps.onAnalyticsAction?.("messages"), "/icons/navigation/message-circle.svg", "blue");
          if (Number(video.videoAssistedActions || 0) > 0 || Number(video.productClicks || 0) > 0) actionCard(adaptive,
            a("creatorImpact", "Your content is driving commerce"),
            a("videoCommerceEvidence", "Video generated {clicks} product opens and {actions} commerce actions.", {
              clicks: count(video.productClicks || 0), actions: count(video.videoAssistedActions || 0)
            }),
            () => { sellerState.tab = "content"; renderSellerDashboard(); }, "/icons/navigation/clapperboard.svg", "purple");
          panel.insertBefore(adaptive, tablist);
        }
        const overview = section(a("keyMetrics", "Key metrics"));
        decorateHeading(overview, "/icons/navigation/chart-column.svg", "blue");
        metrics(overview, [
          ["totalViews", a("views", "Product views"), count(hasTimeSeries ? periodCurrent.views : data.totalViews), "/icons/navigation/chart-column.svg", hasTimeSeries ? periodGrowth.views : undefined],
          ["totalLikes", a("likes", "Likes"), count(hasTimeSeries ? periodCurrent.likes : data.totalLikes), "/icons/navigation/sparkles.svg", hasTimeSeries ? periodGrowth.likes : undefined],
          ["newInquiries", a("inquiries", "New inquiries"), count(hasTimeSeries ? periodCurrent.inquiries : data.newInquiries), "/icons/navigation/message-circle.svg", hasTimeSeries ? periodGrowth.inquiries : undefined],
          ["openOrders", a("orders", "Orders"), count(hasTimeSeries ? periodCurrent.orders : data.openOrders), "/icons/navigation/store.svg", hasTimeSeries ? periodGrowth.orders : undefined]
        ]);
        const trend = section(a("viewsEngagement", "Views & engagement"));
        decorateHeading(trend, "/icons/navigation/chart-column.svg", "blue");
        trendChart(trend);
        const categories = section(a("topCategoryPerformance", "Top categories by performance"), a("productCountBasis", "Ranked by catalog product count."));
        decorateHeading(categories, "/icons/navigation/store.svg", "orange");
        const demandLink = analyticsButton(a("viewDemand", "Demand & opportunities"), () => {
          sellerState.tab = "demand";
          sellerState.trendTab = "demand";
          renderSellerDashboard();
        });
        demandLink.classList.add("analytics-see-all");
        categories.querySelector(".analytics-section-heading")?.append(demandLink);
        bars(categories, rows(data.topCategories), e => deps.getCategoryLabel(e.category), e => e.count, { ranked: true });
        const actions = section(a("quickActions", "Quick actions"));
        decorateHeading(actions, "/icons/navigation/sparkles.svg", "orange");
        const insightsLink = analyticsButton(a("viewInsights", "View insights"), () => {
          sellerState.tab = "insights";
          renderSellerDashboard();
        });
        insightsLink.classList.add("analytics-see-all");
        actions.querySelector(".analytics-section-heading")?.append(insightsLink);
        const actionGrid = el("div", "analytics-action-grid");
        actions.append(actionGrid);
        const topCategory = rows(data.topCategories).find(entry => Number(entry?.count || 0) > 0);
        const actionableInquiries = Math.max(0, Number(hasTimeSeries ? periodCurrent.inquiries : data.newInquiries || 0));
        if (topCategory) actionCard(actionGrid,
          a("manageCategory", "Manage {category}", { category: deps.getCategoryLabel(topCategory.category) }),
          a("manageCategoryReason", "{count} catalog products are in this category.", { count: count(topCategory.count) }),
          () => deps.onAnalyticsAction?.("products"), "/icons/navigation/store.svg", "green");
        if (actionableInquiries > 0) actionCard(actionGrid,
          a("replyToInquiries", "Reply to inquiries"),
          a("replyToInquiriesReason", "{count} new inquiries are waiting.", { count: count(actionableInquiries) }),
          () => deps.onAnalyticsAction?.("messages"), "/icons/navigation/message-circle.svg", "blue");
        const requestedSizes = rows(demand.mostRequestedSizes).filter(entry => Number(entry?.count || 0) > 0);
        if (requestedSizes.length) actionCard(actionGrid,
          a("restockSizes", "Review requested sizes"),
          a("restockSizesReason", "{sizes} lead recorded size requests.", { sizes: requestedSizes.slice(0, 2).map(entry => entry.size).join(" & ") }),
          () => { sellerState.tab = "demand"; sellerState.trendTab = "demand"; renderSellerDashboard(); },
          "/icons/navigation/refresh-cw.svg", "orange");
        if (!actionGrid.childElementCount) actionGrid.append(el("p", "analytics-empty", a("quickActionsEmpty", "No evidence-based action is ready yet.")));
      } else if (sellerState.tab === "products") {
        const catalog = section(a("catalogTotals", "Catalog totals"));
        decorateHeading(catalog, "/icons/navigation/store.svg", "orange");
        metrics(catalog, [
          ...catalogMetrics,
          ["productViews", a("views", "Product views"), count(data.totalViews), "/icons/navigation/chart-column.svg"],
          ["productLikes", a("likes", "Likes"), count(data.totalLikes), "/icons/navigation/sparkles.svg"]
        ]);
        list(section(a("topProducts", "Top products")), rows(data.topProducts), productPerformanceItem);
        const productDemand = rows(demand.mostRequestedProducts);
        if (productDemand.length) {
          list(section(a("productDemandSignals", "Product demand signals")), productDemand, demandProductItem);
        }
        const productOpportunities = rows(data.commerceLearning?.opportunities)
          .filter(entry => entry && !entry.sellerResponded)
          .slice(0, 3);
        if (productOpportunities.length) {
          list(section(a("productOpportunities", "Supply opportunities")), productOpportunities, createSellerOpportunityItem);
        }
        list(section(a("recentProducts", "Recent products")), rows(data.recentProducts),
          e => item(e.name, deps.getStatusLabel(e.status), "product", e.id));
        bars(section(a("categoryMix", "Products by category")), rows(data.topCategories), e => deps.getCategoryLabel(e.category), e => e.count, { ranked: true });
      } else if (sellerState.tab === "customers") {
        const commerce = section(a("commerce", "Conversations & orders"));
        decorateHeading(commerce, "/icons/navigation/message-circle.svg", "purple");
        metrics(commerce, [
          ["conversationThreads", a("threads", "Threads"), count(data.conversationThreads), "/icons/navigation/message-circle.svg"],
          ["newInquiries", a("inquiries", "New inquiries"), count(data.newInquiries), "/icons/navigation/message-circle.svg"],
          ["openOrders", a("openOrders", "Open orders"), count(data.openOrders), "/icons/navigation/store.svg"],
          ["completedOrders", a("completed", "Completed orders"), count(data.completedOrders), "/icons/navigation/chart-column.svg"],
          ["repeatBuyers", a("repeatBuyers", "Repeat buyers"), count(data.repeatBuyers), "/icons/navigation/refresh-cw.svg"],
          ["conversionRate", a("conversion", "Conversation conversion"), count(data.conversionRate) + "%", "/icons/navigation/chart-column.svg"]
        ]);
        const trust = section(a("trust", "Seller trust"), data.trustTier || "");
        metrics(trust, [["trustScore", a("trustScore", "Trust score"), count(data.trustScore) + "/100"]]);
        trust.append(analyticsButton(a("viewInquiries", "View inquiries"), () => deps.onAnalyticsAction?.("messages")),
          analyticsButton(a("viewOrders", "View orders"), () => deps.onAnalyticsAction?.("orders")));
        if (Number(demand.totalDemand || 0) > 0 || rows(demand.mostRequestedProducts).length) {
          const unresolved = section(a("unresolvedDemand", "Unresolved customer demand"));
          metrics(unresolved, [
            ["customerDemand", a("demandScore", "Demand score"), count(demand.totalDemand), "/icons/navigation/chart-column.svg"],
            ["customerWaiting", a("waiting", "Waiting users"), count(demand.waitingUsers), "/icons/navigation/message-circle.svg"],
            ["customerRestock", a("restock", "Restock interest"), count(demand.restockInterest), "/icons/navigation/refresh-cw.svg"]
          ]);
          list(unresolved, rows(demand.mostRequestedProducts).slice(0, 3), demandProductItem);
        }
      } else if (sellerState.tab === "content") {
        const node = section(a("videoPerformance", "Video performance"), video.windowDays ? a("window", "Last {days} days", { days: count(video.windowDays) }) : "");
        decorateHeading(node, "/icons/navigation/clapperboard.svg", "purple");
        if (video.error) node.append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
        else {
          metrics(node, [
            ["totalVideoProducts", t("analytics.videoProducts", "Video products"), count(video.totalVideoProducts), "/icons/navigation/clapperboard.svg"],
            ["plays", t("analytics.videoPlays", "Video plays"), count(video.plays), "/icons/create/video.svg"],
            ["completionRate", t("analytics.videoCompletionRate", "Completion rate"), rate(video.completionRate), "/icons/navigation/chart-column.svg"],
            ["videoAssistedActions", t("analytics.videoAssistedActions", "Video-assisted actions"), count(video.videoAssistedActions), "/icons/navigation/sparkles.svg"]
          ]);
          if (video.measuredPlaySessions !== undefined) node.append(el("p", "analytics-note", a("sessions", "{completed} completed / {measured} measured playback sessions", {
            completed: count(video.completedPlaySessions), measured: count(video.measuredPlaySessions)
          })));
          list(section(t("analytics.topVideoPerformance", "Top video performance")), rows(video.topVideos),
            e => item(e.productName || e.productId, a("videoEvidence", "{plays} plays / {rate} completion / {actions} assisted actions",
              { plays: count(e.plays), rate: rate(e.completionRate), actions: count(e.videoAssistedActions) }), "product", e.productId));
        }
      } else if (sellerState.tab === "trends" || sellerState.tab === "demand") {
        const subTabs = el("div", "analytics-subtabs", undefined, { role: "tablist", "aria-label": a("trends", "Trends") });
        [["demand", a("demandShort", "Demand")], ["opportunities", a("opportunities", "Opportunities")],
          ["trending", a("trending", "Trending")], ["regional", a("regional", "Regional")]].forEach(([id, label]) => {
          const button = analyticsButton(label, () => { sellerState.trendTab = id; renderSellerDashboard(); });
          button.id = "analytics-trend-tab-" + id;
          button.setAttribute("aria-selected", String(id === sellerState.trendTab));
          button.setAttribute("role", "tab");
          subTabs.append(button);
        });
        content.append(subTabs);
        if (sellerState.trendTab === "demand") {
        const node = section(a("demand", "Demand & opportunities"));
        decorateHeading(node, "/icons/navigation/sparkles.svg", "orange");
        if (demand.error) node.append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
        else {
          metrics(node, [
            ["totalDemand", a("demandScore", "Demand score"), count(demand.totalDemand), "/icons/navigation/chart-column.svg"],
            ["waitingUsers", a("waiting", "Waiting users"), count(demand.waitingUsers), "/icons/navigation/message-circle.svg"],
            ["restockInterest", a("restock", "Restock interest"), count(demand.restockInterest), "/icons/navigation/refresh-cw.svg"]
          ]);
          list(section(a("requestedProducts", "Most requested products")), rows(demand.mostRequestedProducts), demandProductItem);
          const sizeEntries = rows(demand.mostRequestedSizes);
          const sizeSection = section(a("sizes", "Most requested sizes"));
          bars(sizeSection, sizeEntries, e => e.size, e => e.count);
          appendSizeShareInsight(sizeSection, sizeEntries);
          bars(section(a("colors", "Most requested colors")), rows(demand.mostRequestedColors), e => e.color, e => e.count);
        }
        } else if (sellerState.trendTab === "opportunities") {
        const opportunities = section(t("commerceOpportunity.sectionTitle", "Supply opportunities"));
        if (data.commerceLearning?.error) opportunities.append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
        else list(opportunities, rows(data.commerceLearning?.opportunities).filter(e => e && !e.sellerResponded).slice(0, 8), createSellerOpportunityItem);
        list(section(a("marketOpportunities", "Market opportunities")),
          [...rows(search.zeroResultOpportunities).map(e => ({ ...e, reason: a("zeroResults", "Zero results") })),
            ...rows(search.lowSupplyOpportunities).map(e => ({ ...e, reason: a("lowSupply", "Low supply") }))],
          e => item(e.query || e.queryKey, e.reason));
        } else if (sellerState.trendTab === "trending") {
        if (search.error) {
          section(a("marketOpportunities", "Market opportunities")).append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
          return;
        }
        bars(section(a("searches", "Trending searches")), rows(search.trendingSearches), e => e.query || e.queryKey, e => e.searches);
        list(section(a("trendAlerts", "Trend alerts")), rows(market.trendAlerts),
          e => item(e.title, a("score", "Signal score: {score}", { score: count(e.score) })));
        } else {
          bars(section(a("regional", "Regional demand"), a("signalScores", "Signal scores")), rows(market.regionalTrends || search.regionalDemand),
            e => e.region, e => e.score);
          bars(section(a("categories", "Category opportunities"), a("signalScores", "Signal scores")), rows(market.categoryOpportunities),
            e => deps.getCategoryLabel(e.category), e => e.score);
        }
      } else {
        const banner = el("section", "analytics-insight-banner");
        banner.append(icon("/icons/navigation/sparkles.svg", "white"));
        const bannerCopy = el("div", "");
        bannerCopy.append(el("h2", "", a("growFaster", "Grow your sales faster")), el("p", "", a("growFasterBody", "Evidence-based recommendations to help you sell more on Winga.")));
        banner.append(bannerCopy);
        content.append(banner);
        const recommendations = rows(market.stockingRecommendations).filter(e => e.title && e.reason);
        const insightRows = el("section", "analytics-insight-list");
        if (!recommendations.length) insightRows.append(el("p", "analytics-empty", a("empty", "No activity recorded yet.")));
        recommendations.forEach((entry, index) => actionCard(insightRows, entry.title, entry.reason,
          () => deps.onAnalyticsAction?.("products"), index % 2 ? "/icons/navigation/sparkles.svg" : "/icons/navigation/store.svg", index % 2 ? "purple" : "orange"));
        rows(market.trendAlerts).forEach(entry => actionCard(insightRows, entry.title,
          a("score", "Signal score: {score}", { score: count(entry.score) }), () => { sellerState.tab = "trends"; sellerState.trendTab = "trending"; renderSellerDashboard(); }, "/icons/navigation/chart-column.svg", "green"));
        const videoCommerceActions = Math.max(0, Number(video.videoAssistedActions || 0));
        const videoProductClicks = Math.max(0, Number(video.productClicks || 0));
        if (videoCommerceActions > 0 || videoProductClicks > 0) actionCard(insightRows,
          a("promoteVideoProducts", "Build on effective video content"),
          a("videoCommerceEvidence", "Video generated {clicks} product opens and {actions} commerce actions.", {
            clicks: count(videoProductClicks), actions: count(videoCommerceActions)
          }),
          () => { sellerState.tab = "content"; renderSellerDashboard(); },
          "/icons/navigation/clapperboard.svg", "purple");
        const regions = rows(market.regionalTrends || search.regionalDemand);
        regions.slice(0, 1).forEach(entry => actionCard(insightRows, a("targetRegion", "Target this region"),
          `${entry.region} · ${a("score", "Signal score: {score}", { score: count(entry.score) })}`, () => { sellerState.tab = "trends"; sellerState.trendTab = "regional"; renderSellerDashboard(); }, "/icons/navigation/compass.svg", "blue"));
        content.append(insightRows);
      }
    }

    function renderAnalyticsPanel(data, heading, subtitle) {
      const panel = deps.getAnalyticsPanel();
      if (!panel) {
        return;
      }

      const nodes = [
        deps.createSectionHeading({
          eyebrow: t("ui.label.94c116ee118a", "Analytics"),
          title: heading || "",
          meta: subtitle || ""
        })
      ];

      if (!data) {
        nodes.push(deps.createEmptyState("Analytics hazijapatikana kwa sasa."));
        panel.replaceChildren(...nodes);
        return;
      }

      const grid = deps.createElement("div", { className: "analytics-grid" });
      grid.append(
        createAnalyticsCard("Bidhaa zote", String(data.totalProducts || 0)),
        createAnalyticsCard("Approved", String(data.approvedProducts || 0)),
        createAnalyticsCard("Pending", String(data.pendingProducts || 0)),
        createAnalyticsCard("Rejected", String(data.rejectedProducts || 0)),
        createAnalyticsCard("Views", deps.formatNumber(data.totalViews || 0)),
        createAnalyticsCard("Likes", deps.formatNumber(data.totalLikes || 0))
      );
      if (!deps.isAdminUser()) {
        grid.append(
          createAnalyticsCard("Trust", data.trustScore ? `${data.trustScore}/100` : "0/100"),
          createAnalyticsCard("Threads", deps.formatNumber(data.conversationThreads || 0)),
          createAnalyticsCard("New inquiries", deps.formatNumber(data.newInquiries || 0)),
          createAnalyticsCard("Open orders", deps.formatNumber(data.openOrders || 0)),
          createAnalyticsCard("Completed", deps.formatNumber(data.completedOrders || 0)),
          createAnalyticsCard("Repeat buyers", deps.formatNumber(data.repeatBuyers || 0)),
          createAnalyticsCard("Demand Score", deps.formatNumber(data.demand?.totalDemand || 0)),
          createAnalyticsCard("Waiting users", deps.formatNumber(data.demand?.waitingUsers || 0)),
          createAnalyticsCard("Restock interest", deps.formatNumber(data.demand?.restockInterest || 0))
        );
      }
      const videoData = data.video && typeof data.video === "object" ? data.video : {};
      const hasVideoAnalytics = !deps.isAdminUser() && (
        Number(videoData.totalVideoProducts || 0) > 0
        || Number(videoData.plays || 0) > 0
        || Number(videoData.videoAssistedActions || 0) > 0
      );
      if (hasVideoAnalytics) {
        const completionPercent = Math.round(
          Math.max(0, Math.min(1, Number(videoData.completionRate || 0))) * 100
        );
        grid.append(
          createAnalyticsCard(t("analytics.videoProducts", "Video products"), deps.formatNumber(videoData.totalVideoProducts || 0)),
          createAnalyticsCard(t("analytics.videoPlays", "Video plays"), deps.formatNumber(videoData.plays || 0)),
          createAnalyticsCard(t("analytics.videoCompletionRate", "Completion rate"), String(completionPercent) + "%"),
          createAnalyticsCard(t("analytics.videoAssistedActions", "Video-assisted actions"), deps.formatNumber(videoData.videoAssistedActions || 0))
        );
      }
      const marketData = data.market || {};
      const searchDemandData = data.searchDemand || marketData.searchDemand || {};
      const sellerOpportunities = Array.isArray(data.commerceLearning?.opportunities)
        ? data.commerceLearning.opportunities.filter((item) => item && !item.sellerResponded).slice(0, 8)
        : [];

      const list = deps.createElement("div", { className: "analytics-list" });
      list.appendChild(createAnalyticsListItem(
        "Top Categories",
        (data.topCategories || []).map((item) => `${deps.getCategoryLabel(item.category)} (${item.count})`).join(" | ") || "Hakuna data ya kutosha."
      ));
      list.appendChild(createAnalyticsListItem(
        "Recent Products",
        (data.recentProducts || []).map((item) => `${item.name} - ${deps.getStatusLabel(item.status)}`).join(" | ") || "Hakuna bidhaa za kuonyesha."
      ));
      if (!deps.isAdminUser()) {
        if (sellerOpportunities.length) {
          list.appendChild(createAnalyticsListItem(
            t("commerceOpportunity.sectionTitle", "Supply opportunities"),
            t("commerceOpportunity.sectionBody", "Verified aggregate buyer demand that matches your catalog.")
          ));
          sellerOpportunities.forEach((opportunity) => list.appendChild(createSellerOpportunityItem(opportunity)));
        }
        if (hasVideoAnalytics) {
          list.appendChild(createAnalyticsListItem(
            t("analytics.topVideoPerformance", "Top video performance"),
            (videoData.topVideos || [])
              .map((item) => {
                const completionPercent = Math.round(
                  Math.max(0, Math.min(1, Number(item.completionRate || 0))) * 100
                );
                return String(item.productName || item.productId || "")
                  + " - " + deps.formatNumber(item.plays || 0) + " " + t("analytics.videoPlaysShort", "plays")
                  + " | " + String(completionPercent) + "% " + t("analytics.videoCompleteShort", "complete")
                  + " | " + deps.formatNumber(item.videoAssistedActions || 0) + " " + t("analytics.videoActionsShort", "actions");
              })
              .join(" | ") || t("analytics.noVideoActivity", "No video activity yet.")
          ));
        }
        list.appendChild(createAnalyticsListItem(
          "Conversation funnel",
          `${deps.formatNumber(data.conversationThreads || 0)} threads | ${deps.formatNumber(data.openOrders || 0)} active orders | ${deps.formatNumber(data.conversionRate || 0)}% conversion`
        ));
        list.appendChild(createAnalyticsListItem(
          "Seller trust",
          `${data.trustTier || "New"} seller | ${deps.formatNumber(data.completedOrders || 0)} completed orders | ${deps.formatNumber(data.newInquiries || 0)} fresh inquiries`
        ));
        list.appendChild(createAnalyticsListItem(
          "Most requested products",
          (data.demand?.mostRequestedProducts || [])
            .map((item) => `${item.productName || item.productId} - demand ${deps.formatNumber(item.demandScore || item.totalDemand || 0)}, waiting ${deps.formatNumber(item.waitingUsers || 0)}`)
            .join(" | ") || "Hakuna demand ya sold out bado."
        ));
        list.appendChild(createAnalyticsListItem(
          "Most requested colors",
          (data.demand?.mostRequestedColors || []).map((item) => `${item.color} (${item.count})`).join(" | ") || "Hakuna color demand bado."
        ));
        list.appendChild(createAnalyticsListItem(
          "Most requested sizes",
          (data.demand?.mostRequestedSizes || []).map((item) => `${item.size} (${item.count})`).join(" | ") || "Hakuna size demand bado."
        ));
        list.appendChild(createAnalyticsListItem(
          "Stocking recommendations",
          (marketData.stockingRecommendations || [])
            .map((item) => `${item.title} - ${item.reason}`)
            .join(" | ") || "Hakuna recommendation mpya ya stock bado."
        ));
        list.appendChild(createAnalyticsListItem(
          "Trend alerts",
          (marketData.trendAlerts || [])
            .map((item) => `${item.title} (${deps.formatNumber(item.score || 0)})`)
            .join(" | ") || "Hakuna trend alert mpya kwa sasa."
        ));
        list.appendChild(createAnalyticsListItem(
          "Category opportunities",
          (marketData.categoryOpportunities || [])
            .slice(0, 5)
            .map((item) => `${deps.getCategoryLabel(item.category)} (${deps.formatNumber(item.score || 0)})`)
            .join(" | ") || "Hakuna opportunity ya category bado."
        ));
        list.appendChild(createAnalyticsListItem(
          "Regional demand",
          (marketData.regionalTrends || searchDemandData.regionalDemand || [])
            .slice(0, 5)
            .map((item) => `${item.region} (${deps.formatNumber(item.score || 0)})`)
            .join(" | ") || "Hakuna regional trend bado."
        ));
        list.appendChild(createAnalyticsListItem(
          "Market Opportunities",
          [
            ...(marketData.zeroResultOpportunities || searchDemandData.zeroResultOpportunities || []).slice(0, 3).map((item) => `${item.query || item.queryKey}: zero results`),
            ...(marketData.lowSupplyOpportunities || searchDemandData.lowSupplyOpportunities || []).slice(0, 3).map((item) => `${item.query || item.queryKey}: low supply`)
          ].join(" | ") || "Hakuna zero-result au low-supply opportunity mpya."
        ));
        list.appendChild(createAnalyticsListItem(
          "Trending searches",
          (marketData.trendingSearches || searchDemandData.trendingSearches || [])
            .slice(0, 5)
            .map((item) => `${item.query || item.queryKey} (${deps.formatNumber(item.searches || 0)} searches)`)
            .join(" | ") || "Hakuna trending search signal bado."
        ));
      }
      if (typeof data.usersCount === "number" && deps.isAdminUser()) {
        list.appendChild(createAnalyticsListItem(
          "Users",
          `${deps.formatNumber(data.usersCount)} users wamesajiliwa.`
        ));
      }

      panel.replaceChildren(...nodes, grid, list);
    }

    return { renderAnalyticsPanel, renderSellerAnalyticsView, leaveSellerAnalytics };
  }

  window.WingaModules.admin.createAdminUiModule = createAdminUiModule;
})();
