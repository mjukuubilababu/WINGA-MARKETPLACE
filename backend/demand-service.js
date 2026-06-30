const crypto = require("crypto");

const DEMAND_VERSION = "2026-06-30.1";

const DEMAND_ACTIONS = Object.freeze({
  notify_when_available: {
    label: "Notify me when available",
    score: 5,
    waiting: true,
    restock: true
  },
  want_back: {
    label: "I want this product back",
    score: 6,
    waiting: true,
    restock: true
  },
  show_similar: {
    label: "Show me similar products",
    score: 2,
    waiting: false,
    restock: false
  }
});

function sanitizeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeIdentifier(value, maxLength = 80) {
  return sanitizeText(value, maxLength).toLowerCase();
}

function normalizeDemandAction(value) {
  const action = normalizeIdentifier(value, 40).replace(/[^a-z0-9_:-]+/g, "_");
  return DEMAND_ACTIONS[action] ? action : "";
}

function getHeader(headers = {}, name = "") {
  const lowerName = String(name || "").toLowerCase();
  return String(headers[lowerName] || headers[name] || "");
}

function inferCountry(headers = {}, payload = {}) {
  return sanitizeText(
    payload.country
      || getHeader(headers, "cf-ipcountry")
      || getHeader(headers, "x-vercel-ip-country")
      || "",
    2
  ).toUpperCase();
}

function inferRegion(headers = {}, payload = {}) {
  return sanitizeText(
    payload.region
      || getHeader(headers, "x-vercel-ip-country-region")
      || getHeader(headers, "x-vercel-ip-city")
      || "",
    80
  );
}

function createDemandId(input = {}) {
  const source = JSON.stringify({
    productId: input.productId || "",
    sellerId: input.sellerId || "",
    buyerId: input.buyerId || "",
    sessionId: input.sessionId || "",
    action: input.action || "",
    color: input.color || "",
    size: input.size || "",
    timestamp: input.createdAt || "",
    nonce: crypto.randomBytes(8).toString("hex")
  });
  return `demand_${crypto.createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function createDemandDedupeKey(input = {}) {
  const day = String(input.createdAt || new Date().toISOString()).slice(0, 10);
  const identity = input.buyerId || input.sessionId || input.ipHash || "anonymous";
  const source = [
    input.productId || "",
    identity,
    input.action || "",
    input.color || "",
    input.size || "",
    day
  ].join("|");
  return crypto.createHash("sha256").update(source).digest("hex");
}

function hashIp(value = "") {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }
  return crypto.createHash("sha256").update(`winga-demand:${safeValue}`).digest("hex").slice(0, 24);
}

function normalizeDemandEvent(payload = {}, product = {}, context = {}) {
  const action = normalizeDemandAction(payload.action || payload.demandAction);
  if (!action) {
    throw new Error("Demand action si sahihi.");
  }
  const productId = normalizeIdentifier(payload.productId || product.id, 100);
  const sellerId = normalizeIdentifier(payload.sellerId || product.uploadedBy, 80);
  if (!productId || !sellerId) {
    throw new Error("Bidhaa ya demand si sahihi.");
  }
  const createdAt = context.timestamp || new Date().toISOString();
  const buyerId = normalizeIdentifier(context.username || payload.buyerId, 80);
  const sessionId = sanitizeText(context.sessionId || payload.sessionId || context.anonymousId, 120);
  const ipHash = hashIp(context.clientIp || "");
  const color = sanitizeText(payload.color || payload.variantColor || "", 60).toLowerCase();
  const size = sanitizeText(payload.size || "", 40).toUpperCase();
  const event = {
    demandId: createDemandId({ productId, sellerId, buyerId, sessionId, action, color, size, createdAt }),
    dedupeKey: "",
    productId,
    sellerId,
    buyerId,
    sessionId,
    action,
    actionLabel: DEMAND_ACTIONS[action].label,
    color,
    size,
    country: inferCountry(context.headers, payload),
    region: inferRegion(context.headers, payload),
    demandScore: DEMAND_ACTIONS[action].score,
    contributesWaitingUser: DEMAND_ACTIONS[action].waiting,
    contributesRestockInterest: DEMAND_ACTIONS[action].restock,
    metadata: {
      source: sanitizeText(payload.source || context.source || "product_detail", 80),
      productAvailability: sanitizeText(product.availability || "", 40),
      productCategory: sanitizeText(product.category || "", 80),
      platformVersion: DEMAND_VERSION
    },
    createdAt
  };
  event.dedupeKey = createDemandDedupeKey({ ...event, ipHash });
  return event;
}

function getDemandIdentity(event = {}) {
  return event.buyerId || event.sessionId || event.dedupeKey || event.demandId || "";
}

function summarizeDemandEvents(events = [], products = []) {
  const productMap = new Map((Array.isArray(products) ? products : []).map((product) => [String(product.id || ""), product]));
  const byProduct = new Map();
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event?.productId) {
      return;
    }
    const key = String(event.productId);
    if (!byProduct.has(key)) {
      const product = productMap.get(key) || {};
      byProduct.set(key, {
        productId: key,
        productName: product.name || "",
        sellerId: event.sellerId || product.uploadedBy || "",
        totalDemand: 0,
        waitingUsers: 0,
        restockInterest: 0,
        demandScore: 0,
        lastDemandAt: "",
        actionCounts: {},
        colors: {},
        sizes: {},
        identities: new Set()
      });
    }
    const summary = byProduct.get(key);
    const action = normalizeDemandAction(event.action) || "unknown";
    summary.totalDemand += 1;
    summary.demandScore += Number(event.demandScore || DEMAND_ACTIONS[action]?.score || 1);
    summary.actionCounts[action] = (summary.actionCounts[action] || 0) + 1;
    if (event.contributesRestockInterest !== false && action !== "show_similar") {
      summary.restockInterest += 1;
    }
    const identity = getDemandIdentity(event);
    if (identity && action !== "show_similar") {
      summary.identities.add(identity);
    }
    if (event.color) {
      summary.colors[event.color] = (summary.colors[event.color] || 0) + 1;
    }
    if (event.size) {
      summary.sizes[event.size] = (summary.sizes[event.size] || 0) + 1;
    }
    if (!summary.lastDemandAt || new Date(event.createdAt || 0).getTime() > new Date(summary.lastDemandAt || 0).getTime()) {
      summary.lastDemandAt = event.createdAt || "";
    }
  });

  return Array.from(byProduct.values()).map((summary) => ({
    productId: summary.productId,
    productName: summary.productName,
    sellerId: summary.sellerId,
    totalDemand: summary.totalDemand,
    waitingUsers: summary.identities.size,
    restockInterest: summary.restockInterest,
    demandScore: summary.demandScore,
    lastDemandAt: summary.lastDemandAt,
    actionCounts: summary.actionCounts,
    topColors: Object.entries(summary.colors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([color, count]) => ({ color, count })),
    topSizes: Object.entries(summary.sizes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([size, count]) => ({ size, count }))
  }));
}

function createDemandService(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();

  function recordDemand(payload = {}, product = {}, context = {}) {
    return normalizeDemandEvent(payload, product, {
      ...context,
      timestamp: context.timestamp || now().toISOString()
    });
  }

  return {
    version: DEMAND_VERSION,
    actions: DEMAND_ACTIONS,
    recordDemand,
    normalizeDemandEvent,
    summarizeDemandEvents
  };
}

module.exports = {
  DEMAND_ACTIONS,
  DEMAND_VERSION,
  createDemandService,
  normalizeDemandEvent,
  summarizeDemandEvents
};
