const crypto = require("crypto");

const PLATFORM_VERSION = "2026-06-30.1";
const MAX_RECENT_EVENTS = 500;
const MAX_SCORE_ENTRIES = 5000;
const CONTRIBUTION_WINDOW_MS = 10 * 60 * 1000;
const MAX_CONTRIBUTIONS_PER_WINDOW = 3;

const PRODUCT_SIGNAL_WEIGHTS = Object.freeze({
  product_viewed: 1,
  product_clicked: 2,
  product_opened: 3,
  product_shared: 4,
  product_saved: 5,
  product_purchased: 12,
  product_searched: 2,
  image_search: 3,
  seller_followed: 3,
  product_swiped: 1,
  product_sold_out: 4,
  demand_requested: 6,
  product_restocked: 8,
  conversation_signal: 4,
  product_uploaded: 6,
  product_edited: 2,
  product_deleted: -4,
  promotion_started: 5,
  promotion_ended: -1,
  notification_clicked: 2
});

const SELLER_SIGNAL_WEIGHTS = Object.freeze({
  product_viewed: 0.4,
  product_clicked: 0.8,
  product_opened: 1,
  product_shared: 1.5,
  product_saved: 2,
  product_purchased: 5,
  seller_followed: 4,
  product_sold_out: 1,
  demand_requested: 1.5,
  product_restocked: 2,
  conversation_signal: 3,
  product_uploaded: 1,
  product_edited: 0.5,
  promotion_started: 1.5,
  notification_clicked: 0.5
});

const KNOWN_EVENT_TYPES = new Set([
  ...Object.keys(PRODUCT_SIGNAL_WEIGHTS),
  ...Object.keys(SELLER_SIGNAL_WEIGHTS)
]);

const EVENT_ALIASES = Object.freeze({
  product_created: "product_uploaded",
  product_updated: "product_edited",
  product_reposted: "product_shared",
  product_delete: "product_deleted",
  product_marked_sold_out: "product_sold_out",
  product_save_failed: "product_edited",
  order_created: "product_purchased",
  promotion_created: "promotion_started",
  promotion_intent_submit_failed: "promotion_started",
  image_search_failed: "image_search",
  search_submitted: "product_searched",
  product_query_surface_hydrated: "product_viewed",
  deep_link_product_opened: "product_opened",
  message_seller_opened: "conversation_signal",
  message_seller_missing_product: "conversation_signal",
  chat_runtime_failed: "conversation_signal",
  notification_clicked: "notification_clicked"
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

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createEventId(input = {}) {
  const source = JSON.stringify({
    event: input.eventType || "",
    timestamp: input.timestamp || "",
    productId: input.productId || "",
    sellerId: input.sellerId || "",
    buyerId: input.buyerId || "",
    fingerprint: input.fingerprint || "",
    nonce: crypto.randomBytes(8).toString("hex")
  });
  return `intel_${crypto.createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function inferDeviceType(userAgent = "") {
  const value = String(userAgent || "").toLowerCase();
  if (/ipad|tablet/.test(value)) return "tablet";
  if (/mobile|android|iphone|ipod/.test(value)) return "mobile";
  if (value) return "desktop";
  return "";
}

function getHeader(headers = {}, name = "") {
  const lowerName = String(name || "").toLowerCase();
  return String(headers[lowerName] || headers[name] || "");
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return value;
    }
  }
  return "";
}

function findProduct(store, productId) {
  const safeId = String(productId || "").trim();
  if (!safeId || !Array.isArray(store?.products)) {
    return null;
  }
  return store.products.find((product) => String(product?.id || "") === safeId) || null;
}

function normalizeEventType(event = "") {
  const safeEvent = normalizeIdentifier(event, 80).replace(/[^a-z0-9_:-]+/g, "_");
  return EVENT_ALIASES[safeEvent] || safeEvent || "unknown_event";
}

function normalizeMetadata(context = {}) {
  const metadata = {};
  Object.entries(context && typeof context === "object" && !Array.isArray(context) ? context : {})
    .slice(0, 20)
    .forEach(([key, value]) => {
      const safeKey = normalizeIdentifier(key, 48).replace(/[^a-z0-9_:-]+/g, "_");
      if (!safeKey || ["token", "password", "auth", "cookie"].includes(safeKey)) {
        return;
      }
      metadata[safeKey] = sanitizeText(value, 180);
    });
  return metadata;
}

function getActorKey(event = {}) {
  return normalizeIdentifier(pickFirst(event.buyerId, event.sessionId, event.deviceType, "anonymous"), 120) || "anonymous";
}

function getScoreTargetKey(event = {}, target = "") {
  if (target === "product") {
    return normalizeIdentifier(event.productId, 100);
  }
  if (target === "seller") {
    return normalizeIdentifier(event.sellerId, 100);
  }
  return "";
}

function getSignalQuality(event = {}) {
  const eventType = normalizeEventType(event.eventType || event.sourceEvent);
  const known = KNOWN_EVENT_TYPES.has(eventType);
  const hasProductWeight = Number(PRODUCT_SIGNAL_WEIGHTS[eventType] || 0) !== 0;
  const hasSellerWeight = Number(SELLER_SIGNAL_WEIGHTS[eventType] || 0) !== 0;
  const scoreableProduct = Boolean(known && hasProductWeight && event.productId);
  const scoreableSeller = Boolean(known && hasSellerWeight && event.sellerId);
  const reasons = [];
  if (!known) reasons.push("unknown_event_type");
  if (hasProductWeight && !event.productId) reasons.push("missing_product_id");
  if (hasSellerWeight && !event.sellerId) reasons.push("missing_seller_id");
  if (!event.buyerId && !event.sessionId) reasons.push("anonymous_signal");
  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.35
        + (known ? 0.25 : 0)
        + (event.productId ? 0.16 : 0)
        + (event.sellerId ? 0.12 : 0)
        + ((event.buyerId || event.sessionId) ? 0.12 : 0)
    )
  );
  return {
    known,
    scoreableProduct,
    scoreableSeller,
    confidence: Math.round(confidence * 100) / 100,
    reasons
  };
}

function updateScore(map, key, delta, timestamp) {
  const safeKey = normalizeIdentifier(key, 100);
  if (!safeKey) {
    return;
  }
  const current = map.get(safeKey) || {
    id: safeKey,
    score: 0,
    signals: {},
    firstSeenAt: timestamp,
    lastSeenAt: timestamp
  };
  current.score = Math.max(0, Math.round((toFiniteNumber(current.score) + delta) * 100) / 100);
  current.lastSeenAt = timestamp;
  map.set(safeKey, current);
  pruneMap(map, MAX_SCORE_ENTRIES);
}

function incrementSignal(map, key, signal) {
  const safeKey = normalizeIdentifier(key, 100);
  if (!safeKey) return;
  const current = map.get(safeKey);
  if (!current) return;
  current.signals[signal] = Math.max(0, Number(current.signals[signal] || 0) + 1);
}

function pruneMap(map, limit) {
  if (map.size <= limit) {
    return;
  }
  const overflow = map.size - limit;
  Array.from(map.keys()).slice(0, overflow).forEach((key) => map.delete(key));
}

function topScores(map, limit = 10) {
  return Array.from(map.values())
    .sort((first, second) => Number(second.score || 0) - Number(first.score || 0))
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      score: Math.round(Number(entry.score || 0) * 100) / 100,
      signals: entry.signals,
      lastSeenAt: entry.lastSeenAt
    }));
}

function createIntelligencePlatform(options = {}) {
  const appendEvent = typeof options.appendEvent === "function" ? options.appendEvent : async () => {};
  const logger = options.logger || console;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const maxQueueSize = Math.max(10, Math.min(Number(options.maxQueueSize || 1000) || 1000, 100000));
  const persistenceConcurrency = Math.max(1, Math.min(Number(options.persistenceConcurrency || 2) || 2, 20));
  const recentEvents = [];
  const productScores = new Map();
  const sellerScores = new Map();
  const eventCounts = new Map();
  const scoreContributionWindows = new Map();
  const persistenceQueue = [];
  const drainResolvers = [];
  let activePersistenceJobs = 0;
  const queueState = {
    accepted: 0,
    processed: 0,
    enqueued: 0,
    completed: 0,
    persisted: 0,
    failed: 0,
    dropped: 0,
    maxDepthSeen: 0,
    lastProcessedAt: "",
    lastPersistedAt: "",
    lastFailureAt: "",
    lastDroppedAt: "",
    scoreSuppressed: 0
  };

  function getProductScore(productId = "") {
    const entry = productScores.get(normalizeIdentifier(productId, 100));
    return entry ? {
      id: entry.id,
      score: Math.round(Number(entry.score || 0) * 100) / 100,
      signals: { ...entry.signals },
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt
    } : null;
  }

  function getSellerScore(sellerId = "") {
    const entry = sellerScores.get(normalizeIdentifier(sellerId, 100));
    return entry ? {
      id: entry.id,
      score: Math.round(Number(entry.score || 0) * 100) / 100,
      signals: { ...entry.signals },
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt
    } : null;
  }

  function buildCanonicalEvent(payload = {}, context = {}) {
    const metadata = normalizeMetadata(payload.context);
    const productId = sanitizeText(pickFirst(
      payload.productId,
      metadata.productid,
      metadata.product_id,
      metadata.id
    ), 100);
    const product = findProduct(context.store, productId);
    const sellerId = sanitizeText(pickFirst(
      payload.sellerId,
      metadata.sellerid,
      metadata.seller_id,
      metadata.sellerusername,
      metadata.uploadedby,
      product?.uploadedBy
    ), 80);
    const timestamp = now().toISOString();
    const eventType = normalizeEventType(payload.event);
    const headers = context.req?.headers || {};
    const sessionUser = context.session?.username || "";

    return {
      eventId: createEventId({
        eventType,
        timestamp,
        productId,
        sellerId,
        buyerId: sessionUser,
        fingerprint: payload.fingerprint
      }),
      eventType,
      sourceEvent: sanitizeText(payload.event, 80),
      timestamp,
      productId,
      sellerId,
      buyerId: sanitizeText(sessionUser, 80),
      sessionId: sanitizeText(payload.fingerprint || metadata.fingerprint || "", 120),
      feedContext: sanitizeText(pickFirst(metadata.feedcontext, metadata.surface, metadata.route, metadata.view), 80),
      location: sanitizeText(pickFirst(
        getHeader(headers, "cf-ipcountry"),
        metadata.region,
        metadata.location
      ), 80),
      deviceType: sanitizeText(pickFirst(metadata.devicetype, inferDeviceType(getHeader(headers, "user-agent"))), 40),
      appVersion: sanitizeText(pickFirst(metadata.appversion, context.appVersion), 60),
      level: sanitizeText(payload.level, 20),
      category: sanitizeText(payload.category, 40),
      alertSeverity: sanitizeText(payload.alertSeverity, 20),
      metadata,
      quality: getSignalQuality({
        eventType,
        sourceEvent: payload.event,
        productId,
        sellerId,
        buyerId: sessionUser,
        sessionId: payload.fingerprint || metadata.fingerprint || ""
      }),
      platformVersion: PLATFORM_VERSION
    };
  }

  function canContributeScore(event, target) {
    const targetKey = getScoreTargetKey(event, target);
    if (!targetKey) {
      return false;
    }
    const actorKey = getActorKey(event);
    const bucket = Math.floor(new Date(event.timestamp || now().toISOString()).getTime() / CONTRIBUTION_WINDOW_MS);
    const key = `${target}:${event.eventType}:${targetKey}:${actorKey}:${bucket}`;
    const count = Number(scoreContributionWindows.get(key) || 0);
    if (count >= MAX_CONTRIBUTIONS_PER_WINDOW) {
      queueState.scoreSuppressed += 1;
      return false;
    }
    scoreContributionWindows.set(key, count + 1);
    if (scoreContributionWindows.size > MAX_SCORE_ENTRIES) {
      Array.from(scoreContributionWindows.keys()).slice(0, Math.ceil(MAX_SCORE_ENTRIES * 0.1)).forEach((entryKey) => {
        scoreContributionWindows.delete(entryKey);
      });
    }
    return true;
  }

  function processCanonicalEvent(event) {
    queueState.accepted += 1;
    queueState.processed += 1;
    queueState.lastProcessedAt = event.timestamp;
    eventCounts.set(event.eventType, Number(eventCounts.get(event.eventType) || 0) + 1);
    recentEvents.push(event);
    if (recentEvents.length > MAX_RECENT_EVENTS) {
      recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
    }

    const productDelta = Number(PRODUCT_SIGNAL_WEIGHTS[event.eventType] || 0);
    const sellerDelta = Number(SELLER_SIGNAL_WEIGHTS[event.eventType] || 0);
    if (event.quality?.scoreableProduct && productDelta && canContributeScore(event, "product")) {
      updateScore(productScores, event.productId, productDelta, event.timestamp);
      incrementSignal(productScores, event.productId, event.eventType);
    }
    if (event.quality?.scoreableSeller && sellerDelta && canContributeScore(event, "seller")) {
      updateScore(sellerScores, event.sellerId, sellerDelta, event.timestamp);
      incrementSignal(sellerScores, event.sellerId, event.eventType);
    }
  }

  function getAuditEventPayload(event) {
    return {
      time: event.timestamp,
      event: "intelligence_event",
      eventId: event.eventId,
      eventType: event.eventType,
      productId: event.productId,
      sellerId: event.sellerId,
      buyerId: event.buyerId,
      sessionId: event.sessionId,
      feedContext: event.feedContext,
      location: event.location,
      deviceType: event.deviceType,
      appVersion: event.appVersion,
      metadata: event.metadata,
      quality: event.quality,
      platformVersion: event.platformVersion
    };
  }

  async function runPersistenceJob(job) {
    const { event, scoreSnapshot } = job;
    let persistenceSucceeded = true;
    if (typeof options.persistEvent === "function") {
      try {
        await options.persistEvent(event, scoreSnapshot);
      } catch (error) {
        persistenceSucceeded = false;
        queueState.failed += 1;
        queueState.lastFailureAt = now().toISOString();
        logger.warn?.("[WINGA] Intelligence event persistence failed.", error);
      }
    }
    let appendSucceeded = true;
    try {
      await appendEvent(getAuditEventPayload(event));
    } catch (error) {
      appendSucceeded = false;
      queueState.failed += 1;
      queueState.lastFailureAt = now().toISOString();
      logger.warn?.("[WINGA] Intelligence event append failed.", error);
    }
    queueState.completed += 1;
    if (persistenceSucceeded && appendSucceeded) {
      queueState.persisted += 1;
      queueState.lastPersistedAt = now().toISOString();
    }
  }

  function resolveDrainsIfIdle() {
    if (persistenceQueue.length || activePersistenceJobs) {
      return;
    }
    while (drainResolvers.length) {
      drainResolvers.shift()?.();
    }
  }

  function pumpPersistenceQueue() {
    while (activePersistenceJobs < persistenceConcurrency && persistenceQueue.length) {
      const job = persistenceQueue.shift();
      activePersistenceJobs += 1;
      Promise.resolve()
        .then(() => runPersistenceJob(job))
        .catch((error) => {
          queueState.failed += 1;
          queueState.lastFailureAt = now().toISOString();
          logger.warn?.("[WINGA] Intelligence queue job failed.", error);
        })
        .finally(() => {
          activePersistenceJobs -= 1;
          pumpPersistenceQueue();
          resolveDrainsIfIdle();
        });
    }
    resolveDrainsIfIdle();
  }

  function enqueuePersistence(event, scoreSnapshot) {
    if (persistenceQueue.length >= maxQueueSize) {
      persistenceQueue.shift();
      queueState.dropped += 1;
      queueState.lastDroppedAt = now().toISOString();
    }
    persistenceQueue.push({ event, scoreSnapshot });
    queueState.enqueued += 1;
    queueState.maxDepthSeen = Math.max(queueState.maxDepthSeen, persistenceQueue.length + activePersistenceJobs);
    pumpPersistenceQueue();
  }

  function drainForTests(timeoutMs = 5000) {
    if (!persistenceQueue.length && !activePersistenceJobs) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out while draining intelligence queue."));
      }, timeoutMs);
      drainResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async function ingestClientEvent(payload = {}, context = {}) {
    const event = buildCanonicalEvent(payload, context);
    processCanonicalEvent(event);
    const scoreSnapshot = {
      productScore: event.productId ? getProductScore(event.productId) : null,
      sellerScore: event.sellerId ? getSellerScore(event.sellerId) : null
    };
    enqueuePersistence(event, scoreSnapshot);
    return event;
  }

  function getSummary() {
    return {
      version: PLATFORM_VERSION,
      queue: {
        ...queueState,
        depth: persistenceQueue.length,
        active: activePersistenceJobs,
        maxSize: maxQueueSize,
        concurrency: persistenceConcurrency
      },
      counts: {
        recentEvents: recentEvents.length,
        productScores: productScores.size,
        sellerScores: sellerScores.size,
        contributionWindows: scoreContributionWindows.size
      },
      topEventTypes: Array.from(eventCounts.entries())
        .sort((first, second) => Number(second[1]) - Number(first[1]))
        .slice(0, 10)
        .map(([eventType, count]) => ({ eventType, count })),
      topProducts: topScores(productScores, 10),
      topSellers: topScores(sellerScores, 10)
    };
  }

  return {
    buildCanonicalEvent,
    ingestClientEvent,
    drainForTests,
    getProductScore,
    getSellerScore,
    getSummary
  };
}

module.exports = {
  PLATFORM_VERSION,
  PRODUCT_SIGNAL_WEIGHTS,
  SELLER_SIGNAL_WEIGHTS,
  createIntelligencePlatform
};
