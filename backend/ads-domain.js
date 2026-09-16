const crypto = require("crypto");

const CAMPAIGN_STATUSES = Object.freeze([
  "DRAFT", "PENDING_PAYMENT", "PENDING_REVIEW", "APPROVED", "SCHEDULED",
  "ACTIVE", "PAUSED", "REJECTED", "CANCELLED", "EXPIRED"
]);
const PAYMENT_STATUSES = Object.freeze(["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"]);
const REVIEW_REASONS = Object.freeze([
  "MISLEADING", "PROHIBITED_CONTENT", "INVALID_DESTINATION",
  "LOW_QUALITY_CREATIVE", "POLICY_VIOLATION", "OTHER"
]);
const PLACEMENTS = Object.freeze({
  HOME_FEED_SPONSORED: Object.freeze({
    code: "HOME_FEED_SPONSORED", name: "Home Feed Sponsored", currency: "TZS",
    prices: Object.freeze({ 1: 1000, 3: 3000, 7: 7000, 14: 14000 }), maxActiveAds: 8
  }),
  SEARCH_SPONSORED: Object.freeze({
    code: "SEARCH_SPONSORED", name: "Search Sponsored", currency: "TZS",
    prices: Object.freeze({ 1: 800, 3: 2200, 7: 5000, 14: 9500 }), maxActiveAds: 8
  })
});

const TRANSITIONS = Object.freeze({
  DRAFT: new Set(["PENDING_PAYMENT", "CANCELLED"]),
  PENDING_PAYMENT: new Set(["PENDING_REVIEW", "CANCELLED"]),
  PENDING_REVIEW: new Set(["APPROVED", "REJECTED", "CANCELLED"]),
  APPROVED: new Set(["SCHEDULED", "ACTIVE", "CANCELLED"]),
  SCHEDULED: new Set(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]),
  ACTIVE: new Set(["PAUSED", "CANCELLED", "EXPIRED"]),
  PAUSED: new Set(["SCHEDULED", "ACTIVE", "CANCELLED", "EXPIRED"]),
  REJECTED: new Set([]), CANCELLED: new Set([]), EXPIRED: new Set([])
});

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
}

function quoteAd({ placementCode, durationDays, startsAt } = {}, now = new Date()) {
  const placement = PLACEMENTS[clean(placementCode, 40).toUpperCase()];
  const duration = Number(durationDays);
  if (!placement) return { ok: false, code: "invalid_placement" };
  if (!Object.hasOwn(placement.prices, duration)) return { ok: false, code: "invalid_duration" };
  const start = startsAt ? new Date(startsAt) : now;
  if (Number.isNaN(start.getTime())) return { ok: false, code: "invalid_start" };
  const end = new Date(start.getTime() + duration * 86400000);
  return {
    ok: true,
    quoteId: makeId("adquote"),
    placementCode: placement.code,
    placementName: placement.name,
    durationDays: duration,
    amount: placement.prices[duration],
    currency: placement.currency,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60000).toISOString()
  };
}

function canTransition(from, to) {
  return Boolean(TRANSITIONS[clean(from, 30).toUpperCase()]?.has(clean(to, 30).toUpperCase()));
}

function deriveApprovedStatus(startsAt, now = new Date()) {
  return new Date(startsAt).getTime() <= now.getTime() ? "ACTIVE" : "SCHEDULED";
}

function validateDestination(value) {
  const destination = clean(value, 500);
  if (!destination) return false;
  if (/^https?:\/\//i.test(destination)) {
    try {
      const parsed = new URL(destination);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch (error) {
      return false;
    }
  }
  return /^[a-z0-9][a-z0-9._/-]{0,499}$/i.test(destination);
}

function normalizeEventType(value) {
  const type = clean(value, 24).toUpperCase();
  return type === "IMPRESSION" || type === "CLICK" ? type : "";
}

module.exports = {
  CAMPAIGN_STATUSES,
  PAYMENT_STATUSES,
  PLACEMENTS,
  REVIEW_REASONS,
  canTransition,
  deriveApprovedStatus,
  makeId,
  normalizeEventType,
  quoteAd,
  validateDestination
};
