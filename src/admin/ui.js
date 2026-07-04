(() => {
  function createAdminUiModule(deps) {
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

    function renderAnalyticsPanel(data, heading, subtitle) {
      const panel = deps.getAnalyticsPanel();
      if (!panel) {
        return;
      }

      const nodes = [
        deps.createSectionHeading({
          eyebrow: "Analytics",
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
      const marketData = data.market || {};
      const searchDemandData = data.searchDemand || marketData.searchDemand || {};

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

    return { renderAnalyticsPanel };
  }

  window.WingaModules.admin.createAdminUiModule = createAdminUiModule;
})();
