const crypto = require("crypto");
const {
  normalizeAvailabilityAction,
  normalizeQuantity
} = require("./conversation-availability-domain");

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function readIdempotencyKey(req, payload) {
  const key = clean(req.headers["idempotency-key"] || payload.idempotencyKey, 120);
  return /^[A-Za-z0-9._:-]{8,120}$/.test(key) ? key : "";
}

function createConversationAvailabilityApi(deps = {}) {
  const { collectBody, sendJson, findSession, readAuthToken, ensureMarketplaceUser, getPostgresStore } = deps;
  const unavailable = res => sendJson(res, 503, {
    error: "Availability service is temporarily unavailable.",
    code: "availability_unavailable"
  });
  const errors = {
    invalid_quantity: "Enter a valid quantity.",
    product_not_found: "Product was not found.",
    product_unavailable: "This product is not currently available.",
    seller_unavailable: "This seller is not currently available.",
    availability_blocked: "This availability request is blocked.",
    self_request: "You cannot request availability from yourself.",
    seller_mismatch: "Product does not belong to this conversation seller.",
    request_not_found: "Availability request was not found.",
    forbidden_transition: "You cannot perform that availability action.",
    invalid_alternative: "Choose another available product that you own."
  };
  const userFor = (req, res) => {
    const session = findSession(readAuthToken(req));
    return { session, user: ensureMarketplaceUser(session, res) };
  };

  async function handle(req, res, url) {
    const path = url.pathname;
    if (!(path.startsWith("/api/conversations/") || path.startsWith("/api/conversation-availability/"))) {
      return false;
    }
    const store = getPostgresStore();
    const threadMatch = path.match(/^\/api\/conversations\/([^/]+)\/availability-requests$/);
    if (threadMatch && req.method === "GET") {
      const { user } = userFor(req, res);
      if (!user) return true;
      if (!store?.readConversationAvailabilityRequests) return unavailable(res), true;
      const withUser = clean(decodeURIComponent(threadMatch[1]), 40);
      sendJson(res, 200, await store.readConversationAvailabilityRequests(user.username, withUser), {
        "Cache-Control": "private, no-store"
      });
      return true;
    }
    if (threadMatch && req.method === "POST") {
      const { user } = userFor(req, res);
      if (!user) return true;
      if (!store?.createConversationAvailabilityRequest) return unavailable(res), true;
      const withUser = clean(decodeURIComponent(threadMatch[1]), 40);
      const payload = await collectBody(req);
      const quantity = normalizeQuantity(payload.quantity);
      if (!quantity) {
        sendJson(res, 400, { error: errors.invalid_quantity, code: "invalid_quantity" });
        return true;
      }
      const key = readIdempotencyKey(req, payload);
      if (!key) {
        sendJson(res, 400, { error: "A valid Idempotency-Key is required.", code: "idempotency_key_required" });
        return true;
      }
      const result = await store.createConversationAvailabilityRequest({
        id: makeId("availability"),
        eventId: makeId("availability-event"),
        notificationId: makeId("notification"),
        buyerUsername: user.username,
        expectedSellerUsername: withUser,
        productId: clean(payload.productId, 80),
        requestedSize: clean(payload.size, 40),
        requestedColor: clean(payload.color, 40),
        requestedQuantity: quantity,
        idempotencyKey: key
      });
      sendJson(
        res,
        result.created ? 201 : (result.code === "product_not_found" ? 404 : 409),
        result.created
          ? result.request
          : { error: errors[result.code] || "Availability request failed.", code: result.code }
      );
      return true;
    }
    const requestMatch = path.match(/^\/api\/conversation-availability\/([^/]+)$/);
    if (requestMatch && req.method === "PATCH") {
      const { user } = userFor(req, res);
      if (!user) return true;
      if (!store?.transitionConversationAvailabilityRequest) return unavailable(res), true;
      const payload = await collectBody(req);
      const action = normalizeAvailabilityAction(payload.action);
      if (!action) {
        sendJson(res, 400, { error: "Availability action is invalid.", code: "invalid_action" });
        return true;
      }
      const key = readIdempotencyKey(req, payload);
      if (!key) {
        sendJson(res, 400, { error: "A valid Idempotency-Key is required.", code: "idempotency_key_required" });
        return true;
      }
      const result = await store.transitionConversationAvailabilityRequest({
        requestId: clean(decodeURIComponent(requestMatch[1]), 100),
        actorUsername: user.username,
        action,
        responseProductId: clean(payload.responseProductId, 80),
        eventId: makeId("availability-event"),
        notificationId: makeId("notification"),
        idempotencyKey: key
      });
      if (result.updated && result.demandEvent && store.appendDemandEvent) {
        try {
          await store.appendDemandEvent(result.demandEvent);
          if (store.upsertCommerceGoal) {
            await store.upsertCommerceGoal({
              goalId: `goal_${crypto.randomUUID()}`,
              userId: result.request.buyerUsername,
              productId: result.request.productId,
              queryKey: "",
              category: "",
              color: result.request.requestedColor,
              size: result.request.requestedSize,
              region: "",
              metadata: { source: "conversation_availability", requestId: result.request.id }
            });
          }
        } catch (error) {
          console.warn("[WINGA] Conversation availability demand recording failed open.", error?.message || error);
        }
      }
      sendJson(
        res,
        result.updated ? 200 : (result.code === "request_not_found" ? 404 : 409),
        result.updated
          ? result.request
          : { error: errors[result.code] || "Availability update failed.", code: result.code }
      );
      return true;
    }
    return false;
  }

  return { handle };
}

module.exports = { createConversationAvailabilityApi };
