(() => {
  function createCommerceApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga commerce API client requires fetchJson.");
      }
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json",
        ...createAuthHeaders()
      };
    }

    function authHeaders() {
      return {
        ...createAuthHeaders()
      };
    }

    async function loadPromotions() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/promotions`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function loadEligibleAds(placementCode) {
      requireFetcher();
      try {
        const data = await fetchJson(`${baseUrl}/ads/eligible?placement=${encodeURIComponent(placementCode || "")}`, {
          headers: authHeaders()
        });
        return Array.isArray(data) ? data : [];
      } catch (_error) {
        return [];
      }
    }

    async function loadAdAccount() {
      requireFetcher();
      try {
        return await fetchJson(`${baseUrl}/ads/account`, { headers: authHeaders() });
      } catch (error) {
        if (Number(error?.status || error?.statusCode || 0) === 404 || error?.code === "account_not_found") return null;
        throw error;
      }
    }

    async function createAdAccount(payload = {}) {
      requireFetcher();
      return fetchJson(`${baseUrl}/ads/accounts`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ businessName: payload.businessName || "" })
      });
    }

    async function createPromotion(payload) {
      requireFetcher();
      const durationByType = { starter_day: 1, boost: 1, boost_3day: 3, category_boost: 3, featured: 7, growth_7day: 7, pin_top: 14, premium_14day: 14 };
      const quote = await fetchJson(`${baseUrl}/ads/quote`, { method: "POST", headers: jsonHeaders(),
        body: JSON.stringify({ placementCode: payload.placementCode || "HOME_FEED_SPONSORED", durationDays: durationByType[payload.type] || 1, startsAt: payload.startsAt || "" }) });
      const campaign = await fetchJson(`${baseUrl}/ads/campaigns`, { method: "POST", headers: jsonHeaders(),
        body: JSON.stringify({ productId: payload.productId, placementCode: quote.placementCode, durationDays: quote.durationDays,
          startsAt: quote.startsAt, destinationValue: payload.productId, headline: payload.headline || "",
          description: payload.description || "", ctaType: "VIEW_PRODUCT", targeting: payload.targeting || {} }) });
      await fetchJson(`${baseUrl}/ads/campaigns/${encodeURIComponent(campaign.id)}/payment`, {
        method: "POST", headers: { ...jsonHeaders(), "Idempotency-Key": `promotion-${campaign.id}-${payload.transactionReference}` },
        body: JSON.stringify({ transactionReference: payload.transactionReference, provider: payload.paymentProvider || "mobile_money" })
      });
      return { ...campaign, type: payload.type, transactionReference: payload.transactionReference };
    }

    async function loadAdminPromotions() {
      requireFetcher();
      const [legacyResult, adsResult] = await Promise.allSettled([
        fetchJson(`${baseUrl}/admin/promotions`, { headers: authHeaders() }),
        fetchJson(`${baseUrl}/admin/ads/campaigns`, { headers: authHeaders() })
      ]);
      const legacy = legacyResult.status === "fulfilled" && Array.isArray(legacyResult.value) ? legacyResult.value : [];
      const ads = adsResult.status === "fulfilled" && Array.isArray(adsResult.value)
        ? adsResult.value.map((campaign) => ({
          ...campaign, type: campaign.placementCode,
          status: String(campaign.campaignStatus || "").toLowerCase(),
          amountPaid: campaign.quotedPrice, sellerUsername: campaign.ownerUsername,
          transactionReference: campaign.transactionReference,
          startDate: campaign.startsAt, endDate: campaign.endsAt,
          paymentStatus: String(campaign.paymentStatus || "").toLowerCase()
        })) : [];
      return [...legacy, ...ads];
    }

    async function reviewPromotion(promotionId, payload) {
      requireFetcher();
      const isAdCampaign = String(promotionId || "").startsWith("adcmp-");
      return fetchJson(isAdCampaign
        ? `${baseUrl}/admin/ads/campaigns/${encodeURIComponent(promotionId)}/review`
        : `${baseUrl}/admin/promotions/${encodeURIComponent(promotionId)}/review`, {
        method: "PATCH", headers: jsonHeaders(),
        body: JSON.stringify(isAdCampaign ? {
          decision: payload?.status === "active" ? "APPROVED" : "REJECTED",
          reasonCode: payload?.status === "active" ? "" : (payload?.reasonCode || "OTHER"),
          explanation: payload?.explanation || ""
        } : (payload || {}))
      });
    }

    async function disablePromotion(promotionId) {
      requireFetcher();
      const isAdCampaign = String(promotionId || "").startsWith("adcmp-");
      return fetchJson(isAdCampaign
        ? `${baseUrl}/admin/ads/campaigns/${encodeURIComponent(promotionId)}/status`
        : `${baseUrl}/admin/promotions/${encodeURIComponent(promotionId)}/disable`, {
        method: "PATCH", headers: isAdCampaign ? jsonHeaders() : authHeaders(),
        ...(isAdCampaign ? { body: JSON.stringify({ status: "PAUSED" }) } : {})
      });
    }

    async function loadAdCampaigns() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/ads/campaigns`, { headers: authHeaders() });
      return Array.isArray(data) ? data : [];
    }

    async function loadAdCampaignReport(campaignId) {
      requireFetcher();
      return fetchJson(`${baseUrl}/ads/campaigns/${encodeURIComponent(campaignId)}/report`, {
        headers: authHeaders()
      });
    }

    async function recordAdEvent(payload) {
      requireFetcher();
      try {
        return await fetchJson(`${baseUrl}/ads/events`, {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(payload || {})
        });
      } catch (error) {
        return { accepted: false, code: "tracking_failed_open" };
      }
    }

    async function loadReviews(productId = "") {
      requireFetcher();
      const suffix = productId ? `?productId=${encodeURIComponent(productId)}` : "";
      return fetchJson(`${baseUrl}/reviews${suffix}`);
    }

    async function createReview(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/reviews`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadMyOrders() {
      requireFetcher();
      return fetchJson(`${baseUrl}/orders/mine`, {
        headers: authHeaders()
      });
    }

    async function createOrder(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/orders`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function updateOrderStatus(orderId, payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    return {
      loadPromotions,
      loadEligibleAds,
      loadAdAccount,
      createAdAccount,
      createPromotion,
      loadAdminPromotions,
      reviewPromotion,
      disablePromotion,
      loadAdCampaigns,
      loadAdCampaignReport,
      recordAdEvent,
      loadReviews,
      createReview,
      loadMyOrders,
      createOrder,
      updateOrderStatus
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.commerce = window.WingaModules.api.commerce || {};
  window.WingaModules.api.commerce.createCommerceApiClient = createCommerceApiClient;
})();
