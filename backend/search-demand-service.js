const crypto = require("crypto");

const SEARCH_DEMAND_VERSION = "2026-07-04.1";
const SEARCH_SOURCES = new Set(["text", "image", "visual_similarity"]);

function sanitizeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeKey(value, maxLength = 120) {
  return sanitizeText(value, maxLength)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
      || payload.location
      || getHeader(headers, "x-vercel-ip-country-region")
      || getHeader(headers, "x-vercel-ip-city")
      || "",
    80
  );
}

function hashIp(value = "") {
  const safeValue = String(value || "").trim();
  return safeValue ? crypto.createHash("sha256").update(`winga-search-demand:${safeValue}`).digest("hex").slice(0, 24) : "";
}

function createEventId(input = {}) {
  const source = JSON.stringify({
    queryKey: input.queryKey || "",
    category: input.detectedCategory || "",
    color: input.detectedColor || "",
    source: input.source || "",
    timestamp: input.timestamp || "",
    nonce: crypto.randomBytes(8).toString("hex")
  });
  return `search_${crypto.createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function createDedupeKey(input = {}) {
  const day = String(input.timestamp || new Date().toISOString()).slice(0, 10);
  return crypto.createHash("sha256").update([
    input.queryKey || "",
    input.detectedCategory || "",
    input.detectedColor || "",
    input.location || "",
    input.source || "",
    input.zeroResult ? "zero" : "results",
    input.ipHash || "anonymous",
    day
  ].join("|")).digest("hex");
}

function normalizeSearchDemandSignal(payload = {}, context = {}) {
  const source = SEARCH_SOURCES.has(String(payload.source || "").trim())
    ? String(payload.source || "").trim()
    : "text";
  const query = sanitizeText(payload.query || "", 160).toLowerCase();
  const queryKey = normalizeKey(payload.queryKey || query || source, 120);
  if (source === "text" && queryKey.length < 2) {
    throw new Error("Search query si sahihi.");
  }
  const timestamp = context.timestamp || new Date().toISOString();
  const resultCount = Math.max(0, Math.min(1000000, Math.round(toFiniteNumber(payload.resultCount, 0))));
  const event = {
    eventId: "",
    dedupeKey: "",
    timestamp,
    query,
    queryKey,
    detectedCategory: normalizeKey(payload.detectedCategory || payload.category || "", 80),
    detectedProductType: normalizeKey(payload.detectedProductType || payload.productType || "", 80),
    detectedColor: normalizeKey(payload.detectedColor || payload.color || "", 50),
    detectedBrand: normalizeKey(payload.detectedBrand || payload.brand || "", 80),
    detectedStyle: normalizeKey(payload.detectedStyle || payload.style || "", 80),
    priceRange: normalizeKey(payload.priceRange || "", 40),
    country: inferCountry(context.headers, payload),
    region: inferRegion(context.headers, payload),
    location: normalizeKey(payload.location || payload.region || inferRegion(context.headers, payload), 100),
    source,
    resultCount,
    clickedProductId: sanitizeText(payload.clickedProductId || "", 100),
    noClick: Boolean(payload.noClick),
    zeroResult: Boolean(payload.zeroResult) || resultCount === 0,
    metadata: {
      platformVersion: SEARCH_DEMAND_VERSION,
      anonymous: true
    }
  };
  const ipHash = hashIp(context.clientIp || "");
  event.eventId = createEventId(event);
  event.dedupeKey = createDedupeKey({ ...event, ipHash });
  return event;
}

function summarizeSearchDemandEvents(events = []) {
  const queryMap = new Map();
  const categoryMap = new Map();
  const colorMap = new Map();
  const regionMap = new Map();
  const zeroResultMap = new Map();
  const lowSupplyMap = new Map();
  const add = (map, key, event, score = 1) => {
    const safeKey = normalizeKey(key, 120);
    if (!safeKey) return;
    const current = map.get(safeKey) || {
      key: safeKey,
      query: event.query || safeKey,
      category: event.detectedCategory || "",
      location: event.location || "",
      count: 0,
      score: 0
    };
    current.count += 1;
    current.score += score;
    map.set(safeKey, current);
  };
  (Array.isArray(events) ? events : []).forEach((event) => {
    const score = event.zeroResult ? 2 : Number(event.resultCount || 0) <= 3 ? 1.5 : 1;
    add(queryMap, event.queryKey, event, score);
    add(categoryMap, event.detectedCategory, event, score);
    add(colorMap, event.detectedColor, event, score);
    add(regionMap, event.location || event.region, event, score);
    if (event.zeroResult) add(zeroResultMap, event.queryKey, event, score);
    if (!event.zeroResult && Number(event.resultCount || 0) <= 3) add(lowSupplyMap, event.queryKey, event, score);
  });
  const compact = (map, mapper) => Array.from(map.values())
    .sort((first, second) => Number(second.score || 0) - Number(first.score || 0))
    .slice(0, 20)
    .map((entry) => mapper(entry));
  return {
    version: SEARCH_DEMAND_VERSION,
    privacy: "anonymous-aggregate-only",
    trendingSearches: compact(queryMap, (entry) => ({ query: entry.query, queryKey: entry.key, category: entry.category, location: entry.location, searches: entry.count, score: Math.round(entry.score * 100) / 100 })),
    mostSearchedCategories: compact(categoryMap, (entry) => ({ category: entry.key, searches: entry.count, score: Math.round(entry.score * 100) / 100 })),
    mostSearchedColors: compact(colorMap, (entry) => ({ color: entry.key, searches: entry.count, score: Math.round(entry.score * 100) / 100 })),
    regionalDemand: compact(regionMap, (entry) => ({ region: entry.key, searches: entry.count, score: Math.round(entry.score * 100) / 100 })),
    zeroResultOpportunities: compact(zeroResultMap, (entry) => ({ query: entry.query, queryKey: entry.key, category: entry.category, location: entry.location, searches: entry.count, opportunity: "high", score: Math.round(entry.score * 100) / 100 })),
    lowSupplyOpportunities: compact(lowSupplyMap, (entry) => ({ query: entry.query, queryKey: entry.key, category: entry.category, searches: entry.count, supply: "low", opportunity: entry.score >= 8 ? "high" : "medium", score: Math.round(entry.score * 100) / 100 }))
  };
}

function createSearchDemandService(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();

  function normalizeBatch(payload = {}, context = {}) {
    const sourceEvents = Array.isArray(payload.events) ? payload.events : [];
    if (!sourceEvents.length) {
      return [];
    }
    return sourceEvents.slice(0, 25).map((event) => normalizeSearchDemandSignal(event, {
      ...context,
      timestamp: context.timestamp || now().toISOString()
    }));
  }

  return {
    version: SEARCH_DEMAND_VERSION,
    normalizeSearchDemandSignal,
    normalizeBatch,
    summarizeSearchDemandEvents
  };
}

module.exports = {
  SEARCH_DEMAND_VERSION,
  createSearchDemandService,
  normalizeSearchDemandSignal,
  summarizeSearchDemandEvents
};
