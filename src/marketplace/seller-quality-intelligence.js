(() => {
  function createSellerQualityIntelligence(deps = {}) {
    const config = {
      maxQualityBoost: 170,
      responseTargetMs: 6 * 60 * 60 * 1000,
      responseMaxMs: 72 * 60 * 60 * 1000,
      minOrderConfidence: 3,
      ...deps.config
    };

    function toFiniteNumber(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min = 0, max = 100) {
      return Math.max(min, Math.min(max, value));
    }

    function getOrderSellerId(order) {
      return String(order?.sellerUsername || order?.sellerId || order?.seller || "").trim();
    }

    function getOrderBuyerId(order) {
      return String(order?.buyerUsername || order?.buyerId || order?.buyer || "").trim();
    }

    function getOrderStatus(order) {
      return String(order?.status || order?.paymentIntentStatus || "").trim().toLowerCase();
    }

    function getMessageTime(message) {
      const time = new Date(message?.timestamp || message?.createdAt || message?.sentAt || 0).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    function getMessageSender(message) {
      return String(message?.senderId || message?.from || message?.senderUsername || "").trim();
    }

    function getMessageReceiver(message) {
      return String(message?.receiverId || message?.to || message?.receiverUsername || "").trim();
    }

    function getDemandScore(product) {
      const summary = product?.demandSummary && typeof product.demandSummary === "object"
        ? product.demandSummary
        : null;
      if (!summary) {
        return 0;
      }
      return (
        toFiniteNumber(summary.demandScore, 0)
        + (toFiniteNumber(summary.waitingUsers, 0) * 3)
        + (toFiniteNumber(summary.restockInterest, 0) * 2)
      );
    }

    function getSellerOrders(sellerId, orders = []) {
      return (Array.isArray(orders) ? orders : []).filter((order) => getOrderSellerId(order) === sellerId);
    }

    function getSellerProducts(sellerId, products = []) {
      return (Array.isArray(products) ? products : []).filter((product) => String(product?.uploadedBy || "") === sellerId);
    }

    function getSellerDemandSummary(sellerId, products = []) {
      const sellerProducts = getSellerProducts(sellerId, products);
      const totalDemand = sellerProducts.reduce((sum, product) => sum + getDemandScore(product), 0);
      const activeDemandProducts = sellerProducts.filter((product) => getDemandScore(product) > 0).length;
      return {
        totalDemand,
        activeDemandProducts,
        averageDemand: sellerProducts.length ? totalDemand / sellerProducts.length : 0
      };
    }

    function getReviewSignal(reviewSummary = {}) {
      const totalReviews = toFiniteNumber(reviewSummary.totalReviews, 0);
      const averageRating = toFiniteNumber(reviewSummary.averageRating, 0);
      if (totalReviews <= 0 || averageRating <= 0) {
        return { reviewQuality: 0, reviewConfidence: 0 };
      }
      return {
        reviewQuality: clamp((averageRating / 5) * 100),
        reviewConfidence: clamp(totalReviews * 12, 0, 100)
      };
    }

    function calculateResponseStats(sellerId, messages = []) {
      const sorted = (Array.isArray(messages) ? messages : [])
        .filter((message) => getMessageSender(message) === sellerId || getMessageReceiver(message) === sellerId)
        .slice()
        .sort((first, second) => getMessageTime(first) - getMessageTime(second));
      const pendingBuyerMessages = new Map();
      const responseTimes = [];

      sorted.forEach((message) => {
        const sender = getMessageSender(message);
        const receiver = getMessageReceiver(message);
        const time = getMessageTime(message);
        if (!time) {
          return;
        }
        if (receiver === sellerId && sender !== sellerId) {
          pendingBuyerMessages.set(sender, time);
          return;
        }
        if (sender === sellerId && receiver !== sellerId && pendingBuyerMessages.has(receiver)) {
          const startedAt = pendingBuyerMessages.get(receiver);
          if (time > startedAt) {
            responseTimes.push(time - startedAt);
          }
          pendingBuyerMessages.delete(receiver);
        }
      });

      if (!responseTimes.length) {
        return {
          responseCount: 0,
          averageResponseMs: 0,
          responseSpeedScore: 42
        };
      }
      const averageResponseMs = responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length;
      const responseSpeedScore = averageResponseMs <= config.responseTargetMs
        ? 100
        : clamp(100 - (((averageResponseMs - config.responseTargetMs) / config.responseMaxMs) * 100), 22, 100);
      return {
        responseCount: responseTimes.length,
        averageResponseMs,
        responseSpeedScore
      };
    }

    function buildSellerQualitySnapshot(sellerId, inputs = {}) {
      const normalizedSellerId = String(sellerId || "").trim();
      const seller = inputs.seller || null;
      const products = Array.isArray(inputs.products) ? inputs.products : [];
      const orders = getSellerOrders(normalizedSellerId, inputs.orders);
      const messages = Array.isArray(inputs.messages) ? inputs.messages : [];
      const reviewSummary = inputs.reviewSummary || {};
      const sellerProducts = getSellerProducts(normalizedSellerId, products);
      const demand = getSellerDemandSummary(normalizedSellerId, products);
      const deliveredOrders = orders.filter((order) => getOrderStatus(order) === "delivered").length;
      const confirmedOrders = orders.filter((order) => ["confirmed", "paid", "delivered"].includes(getOrderStatus(order))).length;
      const cancelledOrders = orders.filter((order) => getOrderStatus(order) === "cancelled").length;
      const successfulSales = Math.max(deliveredOrders, confirmedOrders);
      const uniqueBuyers = new Set(orders.map(getOrderBuyerId).filter(Boolean));
      const buyerCounts = new Map();
      orders.forEach((order) => {
        const buyerId = getOrderBuyerId(order);
        if (buyerId) {
          buyerCounts.set(buyerId, (buyerCounts.get(buyerId) || 0) + 1);
        }
      });
      const repeatBuyers = Array.from(buyerCounts.values()).filter((count) => count > 1).length;
      const cancellationRate = orders.length ? cancelledOrders / orders.length : 0;
      const deliverySuccessRate = successfulSales ? deliveredOrders / successfulSales : 0;
      const complaintCount = toFiniteNumber(inputs.complaintCount || seller?.openReportsCount || seller?.reportsFiledCount, 0);
      const complaintRate = Math.min(1, complaintCount / Math.max(1, orders.length + sellerProducts.length));
      const responseStats = calculateResponseStats(normalizedSellerId, messages);
      const reviewSignal = getReviewSignal(reviewSummary);
      const orderConfidence = clamp((orders.length / config.minOrderConfidence) * 100);
      const activityFreshness = sellerProducts.filter((product) => String(product?.status || "") === "approved").length;

      const qualityScore = clamp(
        18
          + (deliverySuccessRate * 24)
          + (Math.min(1, successfulSales / 12) * 18)
          + (Math.min(1, repeatBuyers / 5) * 16)
          + (reviewSignal.reviewQuality * 0.18)
          + (reviewSignal.reviewConfidence * 0.08)
          - (cancellationRate * 28)
          - (complaintRate * 34)
      );
      const activityScore = clamp(
        (Math.min(1, activityFreshness / 10) * 38)
          + (Math.min(1, orders.length / 16) * 26)
          + (Math.min(1, demand.totalDemand / 220) * 22)
          + (Math.min(1, responseStats.responseCount / 8) * 14)
      );
      const trustScore = clamp(
        20
          + (seller?.verifiedSeller ? 18 : 0)
          + (seller?.status === "active" ? 8 : 0)
          - (seller?.status === "flagged" ? 45 : 0)
          + (responseStats.responseSpeedScore * 0.18)
          + (qualityScore * 0.42)
          + (activityScore * 0.16)
          + (orderConfidence * 0.08)
          - (complaintRate * 24)
      );

      return {
        sellerId: normalizedSellerId,
        trustScore: Math.round(trustScore),
        qualityScore: Math.round(qualityScore),
        activityScore: Math.round(activityScore),
        sellerTrustScore: Math.round(trustScore),
        sellerQualityScore: Math.round(qualityScore),
        sellerActivityScore: Math.round(activityScore),
        trustTier: getTrustTier(trustScore),
        components: {
          responseSpeedScore: Math.round(responseStats.responseSpeedScore),
          successfulSales,
          repeatBuyers,
          deliveredOrders,
          cancellationRate: Number(cancellationRate.toFixed(3)),
          complaintRate: Number(complaintRate.toFixed(3)),
          reviewQuality: Math.round(reviewSignal.reviewQuality),
          reviewCount: toFiniteNumber(reviewSummary.totalReviews, 0),
          demandScore: Math.round(demand.totalDemand),
          activeListings: activityFreshness
        },
        antiManipulation: {
          followerCountIgnored: true,
          engagementOnlyCapped: true,
          requiresOperationalSignals: true
        },
        updatedAt: new Date().toISOString()
      };
    }

    function getTrustTier(score) {
      const safeScore = toFiniteNumber(score, 0);
      if (safeScore >= 88) return "Top Trusted";
      if (safeScore >= 74) return "Trusted";
      if (safeScore >= 58) return "Reliable";
      if (safeScore >= 42) return "Growing";
      return "New";
    }

    function getRankingBoost(snapshot = {}) {
      if (!snapshot) {
        return 0;
      }
      const trust = toFiniteNumber(snapshot.trustScore, 0);
      const quality = toFiniteNumber(snapshot.qualityScore, 0);
      const activity = toFiniteNumber(snapshot.activityScore, 0);
      const complaintPenalty = toFiniteNumber(snapshot.components?.complaintRate, 0) * 80;
      const cancellationPenalty = toFiniteNumber(snapshot.components?.cancellationRate, 0) * 50;
      return clamp(((trust * 0.48) + (quality * 0.34) + (activity * 0.18)) - complaintPenalty - cancellationPenalty, 0, config.maxQualityBoost);
    }

    function getTransparentReasons(snapshot = {}) {
      const components = snapshot.components || {};
      const reasons = [];
      if (components.responseSpeedScore >= 70) reasons.push("fast responses");
      if (components.deliveredOrders > 0) reasons.push("completed deliveries");
      if (components.repeatBuyers > 0) reasons.push("repeat buyers");
      if (components.reviewQuality >= 80) reasons.push("strong reviews");
      if (components.demandScore > 0) reasons.push("real buyer demand");
      if (!reasons.length) reasons.push("new seller profile");
      return reasons.slice(0, 4);
    }

    return {
      buildSellerQualitySnapshot,
      getRankingBoost,
      getTransparentReasons,
      getTrustTier
    };
  }

  window.WingaModules.marketplace.createSellerQualityIntelligence = createSellerQualityIntelligence;
})();
