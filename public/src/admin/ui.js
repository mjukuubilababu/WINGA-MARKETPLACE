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
          createAnalyticsCard("Repeat buyers", deps.formatNumber(data.repeatBuyers || 0))
        );
      }

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
