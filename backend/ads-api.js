const crypto = require("crypto");
const {
  PLACEMENTS, REVIEW_REASONS, makeId, normalizeEventType, quoteAd, validateDestination
} = require("./ads-domain");

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function createAdsApi(deps = {}) {
  const {
    collectBody, sendJson, findSession, readAuthToken, ensureMarketplaceUser,
    isAdminSession, denyJson, getPostgresStore, clientIpForRequest
  } = deps;

  function unavailable(res) {
    sendJson(res, 503, { error: "Ads service is temporarily unavailable.", code: "ads_unavailable" });
  }

  async function userFor(req, res, allowStaff = false) {
    const session = findSession(readAuthToken(req));
    const user = ensureMarketplaceUser(session, res, { allowStaff });
    return { session, user };
  }

  async function adminFor(req, res, event) {
    const session = findSession(readAuthToken(req));
    if (session && isAdminSession(session)) return session;
    await denyJson(res, 403, "Hii area ni ya admin tu.", {
      ip: clientIpForRequest(req), method: req.method, path: req.url, event,
      username: session?.username || "", reason: session ? "insufficient_role" : "missing_or_invalid_session"
    });
    return null;
  }

  function mapError(result, fallback = "Ads request failed.") {
    const messages = {
      account_not_found: "Create an Ad Account first.",
      account_inactive: "Ad Account is not active.",
      product_not_found: "Product was not found.",
      product_not_approved: "Only an approved product can be advertised.",
      not_owner: "You can only advertise your own product.",
      invalid_placement: "Ad placement is invalid.",
      invalid_duration: "Ad duration is invalid.",
      quote_changed: "The price changed. Request a fresh quote.",
      inventory_full: "That placement is fully booked for the selected dates.",
      creative_media_missing: "The selected product has no usable media.",
      campaign_not_found: "Campaign was not found.",
      invalid_campaign_state: "Campaign is not in the required state.",
      duplicate_payment_reference: "That payment reference or request was already used.",
      campaign_inactive: "Campaign is not currently active."
    };
    return messages[result?.code] || fallback;
  }

  async function handle(req, res, url) {
    const store = getPostgresStore();
    const path = url.pathname;
    if (!(path.startsWith("/api/ads") || path.startsWith("/api/admin/ads"))) return false;

    if (req.method === "GET" && path === "/api/ads/placements") {
      if (!store?.readAdPlacements) return unavailable(res), true;
      const placements = await store.readAdPlacements();
      sendJson(res, 200, placements);
      return true;
    }

    if (req.method === "GET" && path === "/api/ads/eligible") {
      const placementCode = clean(url.searchParams.get("placement"), 40).toUpperCase();
      if (!PLACEMENTS[placementCode]) {
        sendJson(res, 400, { error: "Ad placement is invalid.", code: "invalid_placement" });
        return true;
      }
      if (!store?.readEligibleAds) {
        sendJson(res, 200, [], { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" });
        return true;
      }
      try {
        sendJson(res, 200, await store.readEligibleAds(placementCode, 8), {
          "Cache-Control": "public, max-age=15, stale-while-revalidate=60"
        });
      } catch (_error) {
        sendJson(res, 200, [], { "Cache-Control": "no-store" });
      }
      return true;
    }

    if (req.method === "POST" && path === "/api/ads/quote") {
      const { user } = await userFor(req, res);
      if (!user) return true;
      const payload = await collectBody(req);
      const quote = quoteAd(payload);
      if (!quote.ok) {
        sendJson(res, 400, { error: mapError(quote), code: quote.code });
        return true;
      }
      sendJson(res, 200, quote, { "Cache-Control": "private, no-store" });
      return true;
    }

    if (req.method === "POST" && path === "/api/ads/accounts") {
      const { user } = await userFor(req, res);
      if (!user) return true;
      if (!store?.createAdAccount) return unavailable(res), true;
      const payload = await collectBody(req);
      const result = await store.createAdAccount({
        id: makeId("adacct"), ownerUsername: user.username,
        businessName: clean(payload.businessName || user.shopName || user.fullName || user.username, 120)
      });
      sendJson(res, result.created ? 201 : 400, result.created ? result.account : {
        error: mapError(result), code: result.code
      });
      return true;
    }

    if (req.method === "GET" && path === "/api/ads/account") {
      const { user } = await userFor(req, res);
      if (!user) return true;
      if (!store?.getAdAccount) return unavailable(res), true;
      const account = await store.getAdAccount(user.username);
      sendJson(res, account ? 200 : 404, account || { error: "Ad Account was not found.", code: "account_not_found" });
      return true;
    }

    if (req.method === "POST" && path === "/api/ads/campaigns") {
      const { user } = await userFor(req, res);
      if (!user) return true;
      if (!store?.createAdCampaign || !store?.getAdAccount) return unavailable(res), true;
      const payload = await collectBody(req);
      const account = await store.getAdAccount(user.username);
      if (!account) {
        sendJson(res, 409, { error: "Create an Ad Account first.", code: "account_not_found" });
        return true;
      }
      const quote = quoteAd({
        placementCode: payload.placementCode,
        durationDays: payload.durationDays,
        startsAt: payload.startsAt
      });
      if (!quote.ok) {
        sendJson(res, 400, { error: mapError(quote), code: quote.code });
        return true;
      }
      const destination = clean(payload.destinationValue || payload.productId, 500);
      if (!validateDestination(destination)) {
        sendJson(res, 400, { error: "Ad destination is invalid.", code: "invalid_destination" });
        return true;
      }
      const campaignId = makeId("adcmp");
      const result = await store.createAdCampaign({
        id: campaignId, creativeId: makeId("adcreative"), bookingId: makeId("adbooking"),
        adAccountId: account.id, ownerUsername: user.username,
        productId: clean(payload.productId, 80),
        placementCode: quote.placementCode, durationDays: quote.durationDays,
        startsAt: quote.startsAt, endsAt: quote.endsAt,
        quotedPrice: quote.amount, currency: quote.currency,
        headline: clean(payload.headline, 100) || "Sponsored product",
        description: clean(payload.description, 240),
        ctaType: clean(payload.ctaType || "VIEW_PRODUCT", 40).toUpperCase(),
        targeting: {
          country: clean(payload.targeting?.country, 2).toUpperCase(),
          region: clean(payload.targeting?.region, 80),
          category: clean(payload.targeting?.category, 80)
        }
      });
      if (!result.created) {
        sendJson(res, ["account_not_found","product_not_found"].includes(result.code) ? 404 : 409, {
          error: mapError(result), code: result.code,
          ...(result.code === "quote_changed" ? { quote: { amount: result.quotedPrice, currency: result.currency } } : {})
        });
        return true;
      }
      sendJson(res, 201, {
        id: campaignId, campaignStatus: "PENDING_PAYMENT", paymentStatus: "UNPAID",
        placementCode: quote.placementCode, startsAt: quote.startsAt, endsAt: quote.endsAt,
        durationDays: quote.durationDays, quotedPrice: quote.amount, currency: quote.currency
      });
      return true;
    }

    if (req.method === "GET" && path === "/api/ads/campaigns") {
      const { user } = await userFor(req, res);
      if (!user) return true;
      if (!store?.readAdCampaigns) return unavailable(res), true;
      sendJson(res, 200, await store.readAdCampaigns(user.username), { "Cache-Control": "private, no-store" });
      return true;
    }

    const paymentMatch = path.match(/^\/api\/ads\/campaigns\/([^/]+)\/payment$/);
    if (req.method === "POST" && paymentMatch) {
      const { user } = await userFor(req, res);
      if (!user) return true;
      if (!store?.recordAdPayment) return unavailable(res), true;
      const payload = await collectBody(req);
      const transactionReference = clean(payload.transactionReference, 80).toUpperCase();
      if (!/^[A-Z0-9._/-]{4,80}$/.test(transactionReference)) {
        sendJson(res, 400, { error: "Payment reference is invalid.", code: "invalid_payment_reference" });
        return true;
      }
      const idempotencyKey = clean(req.headers["idempotency-key"] || payload.idempotencyKey, 120)
        || crypto.createHash("sha256").update(`${user.username}:${paymentMatch[1]}:${transactionReference}`).digest("hex");
      const result = await store.recordAdPayment({
        id: makeId("adpay"), campaignId: clean(paymentMatch[1], 100), ownerUsername: user.username,
        provider: clean(payload.provider || "mobile_money", 40), transactionReference, idempotencyKey
      });
      sendJson(res, result.recorded ? 200 : 409, result.recorded ? result : { error: mapError(result), code: result.code });
      return true;
    }

    const reportMatch = path.match(/^\/api\/ads\/campaigns\/([^/]+)\/report$/);
    if (req.method === "GET" && reportMatch) {
      const { user } = await userFor(req, res);
      if (!user) return true;
      if (!store?.readAdCampaigns) return unavailable(res), true;
      const campaign = (await store.readAdCampaigns(user.username)).find(item => item.id === clean(reportMatch[1], 100));
      sendJson(res, campaign ? 200 : 404, campaign || { error: "Campaign was not found.", code: "campaign_not_found" });
      return true;
    }

    if (req.method === "POST" && path === "/api/ads/events") {
      if (!store?.recordAdEvent) {
        sendJson(res, 202, { accepted: false, code: "tracking_unavailable" });
        return true;
      }
      const payload = await collectBody(req);
      const eventType = normalizeEventType(payload.eventType);
      const viewableRatio = Number(payload.viewableRatio || 0);
      const viewableMs = Number(payload.viewableMs || 0);
      if (!eventType || (eventType === "IMPRESSION" && (viewableRatio < 0.5 || viewableMs < 1000))) {
        sendJson(res, 400, { error: "Ad event is not valid or viewable.", code: "invalid_ad_event" });
        return true;
      }
      const viewerSeed = `${clientIpForRequest(req)}:${clean(req.headers["user-agent"], 160)}`;
      const viewerKeyHash = crypto.createHash("sha256").update(viewerSeed).digest("hex");
      const bucket = Math.floor(Date.now() / (eventType === "IMPRESSION" ? 30 * 60000 : 5000));
      const campaignId = clean(payload.campaignId, 100);
      const dedupeKey = clean(payload.dedupeKey, 160) || crypto.createHash("sha256")
        .update(`${campaignId}:${eventType}:${viewerKeyHash}:${bucket}`).digest("hex");
      try {
        const result = await store.recordAdEvent({
          id: makeId("adevent"), campaignId, eventType, viewerKeyHash, dedupeKey,
          metadata: { viewableRatio, viewableMs, placement: clean(payload.placementCode, 40) }
        });
        sendJson(res, result.recorded ? 202 : 409, result.recorded ? { accepted: true, duplicate: Boolean(result.duplicate) }
          : { error: mapError(result), code: result.code });
      } catch (error) {
        sendJson(res, 202, { accepted: false, code: "tracking_failed_open" });
      }
      return true;
    }

    if (req.method === "GET" && path === "/api/admin/ads/campaigns") {
      const admin = await adminFor(req, res, "admin_ads_list_denied");
      if (!admin) return true;
      if (!store?.readAdCampaigns) return unavailable(res), true;
      sendJson(res, 200, await store.readAdCampaigns("", { status: url.searchParams.get("status") || "" }),
        { "Cache-Control": "private, no-store" });
      return true;
    }

    const reviewMatch = path.match(/^\/api\/admin\/ads\/campaigns\/([^/]+)\/review$/);
    if (req.method === "PATCH" && reviewMatch) {
      const admin = await adminFor(req, res, "admin_ads_review_denied");
      if (!admin) return true;
      if (!store?.reviewAdCampaign) return unavailable(res), true;
      const payload = await collectBody(req);
      const decision = clean(payload.decision, 20).toUpperCase();
      const reasonCode = clean(payload.reasonCode, 40).toUpperCase();
      if (!["APPROVED","REJECTED"].includes(decision)
        || (decision === "REJECTED" && !REVIEW_REASONS.includes(reasonCode))) {
        sendJson(res, 400, { error: "Review decision or rejection reason is invalid.", code: "invalid_review" });
        return true;
      }
      const result = await store.reviewAdCampaign({
        reviewId: makeId("adreview"), campaignId: clean(reviewMatch[1],100),
        reviewerUsername: admin.username, decision, reasonCode,
        explanation: clean(payload.explanation, 500)
      });
      sendJson(res, result.updated ? 200 : 409, result.updated ? result : { error: mapError(result), code: result.code });
      return true;
    }

    const statusMatch = path.match(/^\/api\/admin\/ads\/campaigns\/([^/]+)\/status$/);
    if (req.method === "PATCH" && statusMatch) {
      const admin = await adminFor(req, res, "admin_ads_status_denied");
      if (!admin) return true;
      if (!store?.setAdCampaignStatus) return unavailable(res), true;
      const payload = await collectBody(req);
      const result = await store.setAdCampaignStatus({
        campaignId: clean(statusMatch[1],100), ownerUsername: "",
        status: clean(payload.status,20).toUpperCase()
      });
      sendJson(res, result.updated ? 200 : 409, result.updated ? result : { error: mapError(result), code: result.code });
      return true;
    }

    sendJson(res, 404, { error: "Ads endpoint was not found.", code: "ads_endpoint_not_found" });
    return true;
  }

  return { handle, placements: PLACEMENTS };
}
module.exports = { createAdsApi };
