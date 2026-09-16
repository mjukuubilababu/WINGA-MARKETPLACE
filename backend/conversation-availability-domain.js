const AVAILABILITY_STATUSES = Object.freeze([
  "REQUESTED",
  "AVAILABLE",
  "OUT_OF_STOCK",
  "ALTERNATIVE_SUGGESTED",
  "CANCELLED"
]);

const TERMINAL_STATUSES = new Set([
  "AVAILABLE",
  "OUT_OF_STOCK",
  "ALTERNATIVE_SUGGESTED",
  "CANCELLED"
]);

function normalizeAvailabilityAction(value) {
  const action = String(value || "").trim().toUpperCase();
  return ["AVAILABLE", "OUT_OF_STOCK", "SUGGEST_ALTERNATIVE", "CANCEL"].includes(action)
    ? action
    : "";
}

function normalizeQuantity(value) {
  const quantity = Number(value === undefined || value === null || value === "" ? 1 : value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : 0;
}

function statusForAvailabilityAction(action) {
  return Object.freeze({
    AVAILABLE: "AVAILABLE",
    OUT_OF_STOCK: "OUT_OF_STOCK",
    SUGGEST_ALTERNATIVE: "ALTERNATIVE_SUGGESTED",
    CANCEL: "CANCELLED"
  })[normalizeAvailabilityAction(action)] || "";
}

function canTransitionAvailability(request = {}, actorUsername = "", action = "") {
  const actor = String(actorUsername || "").trim();
  const normalizedAction = normalizeAvailabilityAction(action);
  if (!actor || !normalizedAction || TERMINAL_STATUSES.has(String(request.status || "").toUpperCase())) {
    return false;
  }
  if (normalizedAction === "CANCEL") {
    return actor === request.buyerUsername;
  }
  return actor === request.sellerUsername;
}

module.exports = {
  AVAILABILITY_STATUSES,
  TERMINAL_STATUSES,
  normalizeAvailabilityAction,
  normalizeQuantity,
  statusForAvailabilityAction,
  canTransitionAvailability
};
