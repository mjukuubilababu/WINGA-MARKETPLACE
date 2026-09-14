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

    let sellerState = { owner: "", data: null, loading: false, error: false, tab: "overview", sequence: 0 };
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
      sellerState = { owner: "", data: null, loading: false, error: false, tab: "overview", sequence: sellerState.sequence + 1 };
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
        Promise.resolve().then(() => deps.loadAnalytics()).then(data => {
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
      heading.append(
        analyticsButton(t("creation.back", "Back"), () => deps.onAnalyticsBack?.(), "/icons/create/arrow-left.svg"),
        el("h1", "", t("ui.label.94c116ee118a", "Analytics"))
      );
      const refresh = analyticsButton(a("refresh", "Refresh analytics"), () => renderSellerAnalyticsView(true), "/icons/navigation/refresh-cw.svg");
      refresh.disabled = sellerState.loading;
      refresh.classList.toggle("is-loading", sellerState.loading);
      heading.append(refresh);
      const tabs = [
        ["overview", a("overview", "Overview")], ["products", a("products", "Products")],
        ["customers", a("customers", "Customers")], ["content", a("content", "Content")],
        ["demand", a("demand", "Demand & opportunities")], ["insights", a("insights", "Insights")]
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
      const content = el("div", "analytics-content", undefined, {
        id: "analytics-content", role: "tabpanel", "aria-labelledby": "analytics-tab-" + sellerState.tab
      });
      const status = el("p", "analytics-status", sellerState.loading ? a("loading", "Loading analytics...") :
        sellerState.error ? a("failed", "Could not refresh analytics. Please try again.") : "", { role: "status" });
      panel.replaceChildren(heading, tablist, status, content);
      const data = sellerState.data;
      if (!data) return;
      const video = data.video || {};
      const demand = data.demand || {};
      const market = data.market || {};
      const search = data.searchDemand || market.searchDemand || {};
      const section = (title, note = "") => {
        const node = el("section", "analytics-section");
        node.append(el("h2", "", title));
        if (note) node.append(el("p", "analytics-note", note));
        content.append(node);
        return node;
      };
      const metrics = (node, items) => {
        const grid = el("div", "analytics-metrics");
        items.forEach(([key, label, value]) => {
          const metric = createAnalyticsCard(label, value);
          metric.dataset.metric = key;
          grid.append(metric);
        });
        node.append(grid);
      };
      const list = (node, items, render) => {
        if (!items.length) { node.append(el("p", "analytics-empty", a("empty", "No activity recorded yet."))); return; }
        const group = el("div", "analytics-rows");
        items.forEach(item => group.append(render(item)));
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
      const bars = (node, entries, label, value) => {
        const max = Math.max(1, ...entries.map(entry => Math.max(0, Number(value(entry)) || 0)));
        list(node, entries, entry => {
          const row = item(label(entry), count(value(entry)));
          const bar = el("meter", "analytics-bar", undefined, { min: 0, max, value: Math.max(0, Number(value(entry)) || 0), "aria-label": label(entry) });
          row.append(bar);
          return row;
        });
      };
      const catalogMetrics = [
        ["totalProducts", a("totalProducts", "Total products"), count(data.totalProducts)],
        ["approvedProducts", a("approved", "Approved"), count(data.approvedProducts)],
        ["pendingProducts", a("pending", "Pending"), count(data.pendingProducts)],
        ["rejectedProducts", a("rejected", "Rejected"), count(data.rejectedProducts)]
      ];
      if (sellerState.tab === "overview") {
        const overview = section(a("performance", "Your performance"), a("catalogTotals", "Catalog totals"));
        metrics(overview, [
          ["totalViews", a("views", "Product views"), count(data.totalViews)],
          ["totalLikes", a("likes", "Likes"), count(data.totalLikes)],
          ["newInquiries", a("inquiries", "New inquiries"), count(data.newInquiries)],
          ["openOrders", a("openOrders", "Open orders"), count(data.openOrders)]
        ]);
        bars(section(a("categoryMix", "Products by category")), rows(data.topCategories), e => deps.getCategoryLabel(e.category), e => e.count);
        const actions = section(a("quickActions", "Quick actions"));
        actions.append(
          analyticsButton(a("manageProducts", "Manage products"), () => deps.onAnalyticsAction?.("products")),
          analyticsButton(a("viewInquiries", "View inquiries"), () => deps.onAnalyticsAction?.("messages")),
          analyticsButton(a("viewOrders", "View orders"), () => deps.onAnalyticsAction?.("orders"))
        );
      } else if (sellerState.tab === "products") {
        metrics(section(a("catalogTotals", "Catalog totals")), catalogMetrics);
        list(section(a("recentProducts", "Recent products")), rows(data.recentProducts),
          e => item(e.name, deps.getStatusLabel(e.status), "product", e.id));
        bars(section(a("categoryMix", "Products by category")), rows(data.topCategories), e => deps.getCategoryLabel(e.category), e => e.count);
      } else if (sellerState.tab === "customers") {
        metrics(section(a("commerce", "Conversations & orders")), [
          ["conversationThreads", a("threads", "Threads"), count(data.conversationThreads)],
          ["newInquiries", a("inquiries", "New inquiries"), count(data.newInquiries)],
          ["openOrders", a("openOrders", "Open orders"), count(data.openOrders)],
          ["completedOrders", a("completed", "Completed orders"), count(data.completedOrders)],
          ["repeatBuyers", a("repeatBuyers", "Repeat buyers"), count(data.repeatBuyers)],
          ["conversionRate", a("conversion", "Conversation conversion"), count(data.conversionRate) + "%"]
        ]);
        const trust = section(a("trust", "Seller trust"), data.trustTier || "");
        metrics(trust, [["trustScore", a("trustScore", "Trust score"), count(data.trustScore) + "/100"]]);
        trust.append(analyticsButton(a("viewInquiries", "View inquiries"), () => deps.onAnalyticsAction?.("messages")),
          analyticsButton(a("viewOrders", "View orders"), () => deps.onAnalyticsAction?.("orders")));
      } else if (sellerState.tab === "content") {
        const node = section(a("videoPerformance", "Video performance"), video.windowDays ? a("window", "Last {days} days", { days: count(video.windowDays) }) : "");
        if (video.error) node.append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
        else {
          metrics(node, [
            ["totalVideoProducts", t("analytics.videoProducts", "Video products"), count(video.totalVideoProducts)],
            ["plays", t("analytics.videoPlays", "Video plays"), count(video.plays)],
            ["completionRate", t("analytics.videoCompletionRate", "Completion rate"), rate(video.completionRate)],
            ["videoAssistedActions", t("analytics.videoAssistedActions", "Video-assisted actions"), count(video.videoAssistedActions)]
          ]);
          if (video.measuredPlaySessions !== undefined) node.append(el("p", "analytics-note", a("sessions", "{completed} completed / {measured} measured playback sessions", {
            completed: count(video.completedPlaySessions), measured: count(video.measuredPlaySessions)
          })));
          list(section(t("analytics.topVideoPerformance", "Top video performance")), rows(video.topVideos),
            e => item(e.productName || e.productId, a("videoEvidence", "{plays} plays / {rate} completion / {actions} assisted actions",
              { plays: count(e.plays), rate: rate(e.completionRate), actions: count(e.videoAssistedActions) }), "product", e.productId));
        }
      } else if (sellerState.tab === "demand") {
        const node = section(a("demand", "Demand & opportunities"));
        if (demand.error) node.append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
        else {
          metrics(node, [
            ["totalDemand", a("demandScore", "Demand score"), count(demand.totalDemand)],
            ["waitingUsers", a("waiting", "Waiting users"), count(demand.waitingUsers)],
            ["restockInterest", a("restock", "Restock interest"), count(demand.restockInterest)]
          ]);
          list(section(a("requestedProducts", "Most requested products")), rows(demand.mostRequestedProducts),
            e => item(e.productName || e.productId, a("demandEvidence", "Demand score {score} / {waiting} waiting", {
              score: count(e.demandScore ?? e.totalDemand), waiting: count(e.waitingUsers) }), "product", e.productId));
          bars(section(a("sizes", "Most requested sizes")), rows(demand.mostRequestedSizes), e => e.size, e => e.count);
          bars(section(a("colors", "Most requested colors")), rows(demand.mostRequestedColors), e => e.color, e => e.count);
        }
        const opportunities = section(t("commerceOpportunity.sectionTitle", "Supply opportunities"));
        if (data.commerceLearning?.error) opportunities.append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
        else list(opportunities, rows(data.commerceLearning?.opportunities).filter(e => e && !e.sellerResponded).slice(0, 8), createSellerOpportunityItem);
        if (search.error) {
          section(a("marketOpportunities", "Market opportunities")).append(el("p", "analytics-empty", a("unavailable", "This data is unavailable right now.")));
          return;
        }
        list(section(a("marketOpportunities", "Market opportunities")),
          [...rows(search.zeroResultOpportunities).map(e => ({ ...e, reason: a("zeroResults", "Zero results") })),
            ...rows(search.lowSupplyOpportunities).map(e => ({ ...e, reason: a("lowSupply", "Low supply") }))],
          e => item(e.query || e.queryKey, e.reason));
        bars(section(a("searches", "Trending searches")), rows(search.trendingSearches), e => e.query || e.queryKey, e => e.searches);
      } else {
        list(section(a("stocking", "Stocking recommendations")), rows(market.stockingRecommendations).filter(e => e.title && e.reason),
          e => item(e.title, e.reason, "products"));
        list(section(a("trends", "Trend alerts")), rows(market.trendAlerts),
          e => item(e.title, a("score", "Signal score: {score}", { score: count(e.score) })));
        bars(section(a("categories", "Category opportunities"), a("signalScores", "Signal scores")), rows(market.categoryOpportunities),
          e => deps.getCategoryLabel(e.category), e => e.score);
        bars(section(a("regional", "Regional demand"), a("signalScores", "Signal scores")), rows(market.regionalTrends || search.regionalDemand),
          e => e.region, e => e.score);
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
