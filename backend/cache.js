const Redis = require("ioredis");

const DEFAULT_NAMESPACE = "winga";
const MIN_TTL_SECONDS = 1;
const MAX_TTL_SECONDS = 300;

function normalizeTtl(ttlSeconds) {
  const value = Number.parseInt(ttlSeconds, 10);
  if (!Number.isFinite(value)) return MIN_TTL_SECONDS;
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, value));
}

function createCache(options = {}) {
  const redisUrl = String(options.redisUrl ?? process.env.REDIS_URL ?? "").trim();
  const namespace = String(options.namespace || process.env.REDIS_NAMESPACE || DEFAULT_NAMESPACE).trim() || DEFAULT_NAMESPACE;
  const RedisClient = options.RedisClient || Redis;
  const logger = options.logger || console;
  const loggingEnabled = options.loggingEnabled ?? String(process.env.CACHE_LOGGING || "").toLowerCase() === "true";
  const pending = new Map();
  let client = options.client || null;
  let connectionPromise = null;
  let warnedUnavailable = false;

  function log(message, details = {}) {
    if (loggingEnabled && typeof logger.info === "function") logger.info(`[WINGA:CACHE] ${message}`, details);
  }

  function warnUnavailable(error) {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    if (typeof logger.warn === "function") logger.warn("[WINGA:CACHE] Redis unavailable; using origin data.", error?.message || error);
  }

  async function getClient() {
    if (!redisUrl && !client) return null;
    if (!client) {
      client = new RedisClient(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        commandTimeout: 1000,
        retryStrategy: () => null
      });
      client.on?.("error", () => {});
    }
    if (client.status === "ready") return client;
    if (!connectionPromise) {
      connectionPromise = Promise.resolve(client.connect?.()).then(() => client).finally(() => { connectionPromise = null; });
    }
    return connectionPromise;
  }

  async function getOrSetCache(key, ttlSeconds, fetchFn) {
    if (typeof fetchFn !== "function") throw new TypeError("fetchFn must be a function");
    if (!redisUrl && !client) return fetchFn();
    const cacheKey = `${namespace}:${String(key)}`;
    try {
      const redisClient = await getClient();
      const cached = await redisClient.get(cacheKey);
      if (cached != null) {
        log("hit", { key: cacheKey });
        return JSON.parse(cached);
      }
      log("miss", { key: cacheKey });
    } catch (error) {
      warnUnavailable(error);
      return fetchFn();
    }
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const request = Promise.resolve().then(fetchFn).then(async (value) => {
      try {
        const redisClient = await getClient();
        await redisClient.set(cacheKey, JSON.stringify(value), "EX", normalizeTtl(ttlSeconds));
        log("set", { key: cacheKey, ttlSeconds: normalizeTtl(ttlSeconds) });
      } catch (error) {
        warnUnavailable(error);
      }
      return value;
    }).finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, request);
    return request;
  }

  async function close() {
    if (!client) return;
    try { await client.quit?.(); } catch (_error) { client.disconnect?.(); }
  }

  return Object.freeze({ enabled: Boolean(redisUrl || client), getOrSetCache, close });
}

const defaultCache = createCache();
module.exports = { createCache, getOrSetCache: defaultCache.getOrSetCache, closeCache: defaultCache.close, normalizeTtl };
