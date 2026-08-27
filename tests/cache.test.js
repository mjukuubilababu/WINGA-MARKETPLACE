const test = require("node:test");
const assert = require("node:assert/strict");
const { createCache, normalizeTtl } = require("../backend/cache");

function createFakeRedis(options = {}) {
  const values = new Map();
  const calls = { connect: 0, get: 0, set: 0 };
  return {
    status: "wait", calls, on() {},
    async connect() { calls.connect += 1; if (options.failConnect) throw new Error("redis unavailable"); this.status = "ready"; },
    async get(key) { calls.get += 1; if (options.failGet) throw new Error("redis read failed"); return values.get(key) ?? null; },
    async set(key, value) { calls.set += 1; if (options.failSet) throw new Error("redis write failed"); values.set(key, value); return "OK"; },
    async quit() { this.status = "end"; }
  };
}

test("cache bypasses Redis completely when REDIS_URL is absent", async () => {
  let fetches = 0;
  const cache = createCache({ redisUrl: "" });
  assert.deepEqual(await cache.getOrSetCache("products", 20, async () => ({ fetch: ++fetches })), { fetch: 1 });
  assert.equal(cache.enabled, false);
});

test("cache stores a miss and returns the next request from Redis", async () => {
  const client = createFakeRedis();
  const cache = createCache({ client, namespace: "test", logger: { warn() {} } });
  let fetches = 0;
  const fetchFn = async () => ({ items: [], fetch: ++fetches });
  assert.deepEqual(await cache.getOrSetCache("products:page-one", 20, fetchFn), { items: [], fetch: 1 });
  assert.deepEqual(await cache.getOrSetCache("products:page-one", 20, fetchFn), { items: [], fetch: 1 });
  assert.equal(fetches, 1);
  assert.equal(client.calls.set, 1);
  assert.equal(client.calls.get, 2);
});

test("cache coalesces concurrent misses for the same feed page", async () => {
  const client = createFakeRedis();
  const cache = createCache({ client, namespace: "test", logger: { warn() {} } });
  let fetches = 0;
  const fetchFn = async () => { fetches += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { fetches }; };
  const [first, second] = await Promise.all([cache.getOrSetCache("products:shared", 20, fetchFn), cache.getOrSetCache("products:shared", 20, fetchFn)]);
  assert.deepEqual(first, { fetches: 1 });
  assert.deepEqual(second, { fetches: 1 });
  assert.equal(fetches, 1);
});

test("cache fails open when Redis cannot connect", async () => {
  const warnings = [];
  const cache = createCache({ client: createFakeRedis({ failConnect: true }), logger: { warn: (...args) => warnings.push(args) } });
  assert.deepEqual(await cache.getOrSetCache("products", 20, async () => ({ ok: true })), { ok: true });
  assert.equal(warnings.length, 1);
});

test("cache TTL is bounded to production-safe values", () => {
  assert.equal(normalizeTtl(0), 1);
  assert.equal(normalizeTtl(20), 20);
  assert.equal(normalizeTtl(9999), 300);
});
