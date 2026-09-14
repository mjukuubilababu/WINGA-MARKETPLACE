const test = require("node:test");
const assert = require("node:assert/strict");
const { createCache, normalizeTtl } = require("../backend/cache");

function createFakeRedis(options = {}) {
  const values = new Map();
  const calls = { connect: 0, get: 0, set: 0, scan: 0, del: 0 };
  return {
    status: "wait", calls, on() {},
    async connect() { calls.connect += 1; if (options.failConnect) throw new Error("redis unavailable"); this.status = "ready"; },
    async get(key) { calls.get += 1; if (options.failGet) throw new Error("redis read failed"); return values.get(key) ?? null; },
    async set(key, value) { calls.set += 1; if (options.failSet) throw new Error("redis write failed"); values.set(key, value); return "OK"; },
    async scan(_cursor, _match, pattern) {
      calls.scan += 1;
      const prefix = String(pattern || "").replace(/[*]$/, "");
      return ["0", Array.from(values.keys()).filter((key) => key.startsWith(prefix))];
    },
    async del(...keys) {
      calls.del += 1;
      let deleted = 0;
      keys.forEach((key) => { if (values.delete(key)) deleted += 1; });
      return deleted;
    },
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

test("cache prefix deletion invalidates all product feed variants only", async () => {
  const client = createFakeRedis();
  const cache = createCache({ client, namespace: "test", logger: { warn() {} } });
  await cache.getOrSetCache("products:v1:first", 20, async () => ({ page: 1 }));
  await cache.getOrSetCache("products:v1:search", 20, async () => ({ page: 2 }));
  await cache.getOrSetCache("other:key", 20, async () => ({ keep: true }));

  assert.deepEqual(await cache.deleteCachePrefix("products:v1:"), { deleted: 2 });
  assert.equal(client.calls.scan, 1);
  assert.equal(client.calls.del, 1);
  let refetched = 0;
  await cache.getOrSetCache("products:v1:first", 20, async () => ({ refetched: ++refetched }));
  assert.equal(refetched, 1);
  assert.deepEqual(await cache.getOrSetCache("other:key", 20, async () => ({ keep: false })), { keep: true });
});
