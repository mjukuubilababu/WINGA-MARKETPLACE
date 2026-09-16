const OFFER_STATUSES = Object.freeze(["PROPOSED","COUNTERED","ACCEPTED","DECLINED","EXPIRED","CANCELLED","CONVERTED_TO_ORDER"]);
const TERMINAL_STATUSES = new Set(["ACCEPTED","DECLINED","EXPIRED","CANCELLED","CONVERTED_TO_ORDER"]);

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= 500 && amount <= 1000000000 ? amount : 0;
}

function normalizeAction(value) {
  const action = String(value || "").trim().toUpperCase();
  return ["COUNTER","ACCEPT","DECLINE","CANCEL"].includes(action) ? action : "";
}

function canAct(offer = {}, actor = "", action = "") {
  const user = String(actor || "").trim();
  const normalizedAction = normalizeAction(action);
  if (!user || !normalizedAction || TERMINAL_STATUSES.has(String(offer.status || "").toUpperCase())) return false;
  const isParticipant = user === offer.buyerUsername || user === offer.sellerUsername;
  if (!isParticipant) return false;
  if (normalizedAction === "CANCEL") return user === offer.lastActorUsername;
  return user !== offer.lastActorUsername;
}

function statusForAction(action) {
  return Object.freeze({ COUNTER:"COUNTERED", ACCEPT:"ACCEPTED", DECLINE:"DECLINED", CANCEL:"CANCELLED" })[normalizeAction(action)] || "";
}

module.exports = { OFFER_STATUSES, TERMINAL_STATUSES, normalizeAmount, normalizeAction, canAct, statusForAction };
