const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { Readable } = require("node:stream");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresStore } = require("../backend/db");
const { ROUTE, familyNames, referenceName, createLegacyPublicMediaStore, readLegacyR2Media,
  readLegacyLocalMedia, createLegacyPublicMediaHandler } = require("../backend/legacy-public-media");
const { verifyLegacyPublicR2 } = require("../backend/verify-legacy-public-r2");

const bytes = Buffer.from("a valid stored test fixture");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const env = { R2_ACCOUNT_ID: "test", R2_BUCKET_NAME: "public-images", R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret", R2_PUBLIC_URL_BASE: "https://media.example" };
function response() {
  return { status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; this.writableEnded = true; } };
}

test("names are flat supported images and variants never guess unrelated stems", () => {
  assert.deepEqual(familyNames("photo-640.webp"), ["photo-320.webp", "photo-640.webp", "photo-1080.webp"]);
  assert.deepEqual(familyNames("photo.jpg"), ["photo.jpg"]);
  for (const name of ["../secret.jpg", "a/b.webp", "%2e%2e.jpg", "x.svg", "x.bin", "x.webp?key=secret"]) {
    assert.deepEqual(familyNames(name), []);
  }
  assert.equal(referenceName("https://old.example/uploads/photo.jpg"), "photo.jpg");
  assert.equal(referenceName("https://old.example/products/photo.jpg"), "");
});

test("primary SQL authorizes only current approved public media and blocks identity/restricted overlaps", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, status TEXT, identity_document_image TEXT DEFAULT '');
    CREATE TABLE products (id TEXT PRIMARY KEY, uploaded_by TEXT, image TEXT, images JSONB DEFAULT '[]',
      media_items JSONB DEFAULT '[]', status TEXT);
    CREATE TABLE public_content_visibility (content_type TEXT, content_id TEXT, visibility TEXT);
    INSERT INTO users VALUES ('seller', 'active', '');
    INSERT INTO products(id, uploaded_by, image, status) VALUES ('p', 'seller', '/uploads/photo-1080.webp', 'approved');`);
  let replicaCalls = 0;
  const store = createPostgresStore({ databaseUrl: "postgres://test/legacy-media", queryClient: db,
    readQueryClient: { query: async () => { replicaCalls++; throw new Error("no replica authorization"); } } });
  try {
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), true);
    assert.equal(await store.authorizeLegacyPublicMedia("unknown.jpg"), false);
    assert.equal(await store.authorizeLegacyPublicMedia("../photo.jpg"), false);
    await db.exec("INSERT INTO public_content_visibility VALUES ('product', 'p', 'private')");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("UPDATE public_content_visibility SET visibility = 'followers'");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("UPDATE public_content_visibility SET visibility = 'public'; UPDATE users SET status = 'suspended'");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("UPDATE users SET status = 'active'; UPDATE products SET status = 'pending'");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("UPDATE products SET status = 'approved'; UPDATE users SET identity_document_image = '/uploads/photo-640.webp'");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("UPDATE users SET identity_document_image = ''; INSERT INTO products(id,uploaded_by,image,status) VALUES ('private', 'seller', '/uploads/photo-640.webp', 'rejected')");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("DELETE FROM products WHERE id = 'private'; UPDATE products SET image = '', images = '[\"/uploads/photo-1080.webp\"]'");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), true);
    await db.exec(`UPDATE products SET images = '[]', media_items = '[{"type":"image","url":"/uploads/photo-1080.webp"}]'`);
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), true);
    await db.exec(`UPDATE products SET media_items = '[{"type":"image","url":"/uploads/unrelated-photo-1080.webp"}]'`);
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    await db.exec("DELETE FROM products");
    assert.equal(await store.authorizeLegacyPublicMedia("photo-320.webp"), false);
    assert.equal(replicaCalls, 0);
  } finally { await db.close(); }
});

test("authorization refuses truncated candidate sets and database errors", async () => {
  const crowded = createLegacyPublicMediaStore({ query: async () => ({ rows: Array.from({ length: 101 }, () => ({})) }) });
  await assert.rejects(crowded.authorizeLegacyPublicMedia("photo.jpg"), /CANDIDATE_LIMIT/);
  const broken = createLegacyPublicMediaStore({ query: async () => { throw new Error("unavailable"); } });
  await assert.rejects(broken.authorizeLegacyPublicMedia("photo.jpg"), /unavailable/);
});

test("R2 reader uses only the public legacy namespace and validates copied object SHA-256", async () => {
  const client = { send: async (command) => {
    assert.equal(command.input.Bucket, "public-images");
    assert.equal(command.input.Key, "products/legacy/photo.webp");
    return { Body: Readable.from([bytes]), Metadata: { sha256 }, ContentLength: bytes.length };
  } };
  assert.deepEqual(await readLegacyR2Media("photo.webp", { env, client }), bytes);
  await assert.rejects(readLegacyR2Media("../private.webp", { env, client }), /NAME_INVALID/);
  await assert.rejects(readLegacyR2Media("photo.webp", { env: {}, client }), /UNCONFIGURED/);
  for (const metadata of [{}, { sha256: "a".repeat(64) }]) {
    await assert.rejects(readLegacyR2Media("photo.webp", { env, client: { send: async () => ({ Body: Readable.from([bytes]), Metadata: metadata }) } }), /INTEGRITY_FAILED/);
  }
  await assert.rejects(readLegacyR2Media("photo.webp", { env, client: { send: async () => ({ Body: Readable.from([bytes]), ContentLength: 1e9 }) } }), /TOO_LARGE/);
});

test("local fallback reads only bounded flat files and rejects missing/directories/traversal", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winga-legacy-read-"));
  try {
    fs.writeFileSync(path.join(directory, "photo.webp"), bytes);
    fs.mkdirSync(path.join(directory, "directory.webp"));
    assert.deepEqual(await readLegacyLocalMedia(directory, "photo.webp"), bytes);
    for (const name of ["missing.jpg", "../photo.webp", "directory.webp"]) {
      assert.equal(await readLegacyLocalMedia(directory, name), null);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("disabled route and invalid requests never fetch data or affect existing routes", async () => {
  const noCall = () => { throw new Error("must not be called"); };
  const handler = createLegacyPublicMediaHandler({ authorize: noCall, readRemote: noCall });
  assert.equal(await handler({ method: "GET" }, response(), "/uploads/photo.webp"), false);
  const disabled = response();
  await handler({ method: "GET" }, disabled, ROUTE + "photo.webp");
  assert.equal(disabled.status, 404);
  const enabled = createLegacyPublicMediaHandler({ enabled: true, authorize: noCall, readRemote: noCall });
  const invalid = response();
  await enabled({ method: "GET" }, invalid, ROUTE + "a/b.jpg");
  assert.equal(invalid.status, 404);
  const post = response();
  await enabled({ method: "POST" }, post, ROUTE + "photo.webp");
  assert.equal(post.status, 405);
});

test("permission rejection and authorization outages never fall back to disk", async () => {
  for (const authorize of [async () => false, async () => { throw new Error("database secret"); }]) {
    let reads = 0;
    const res = response();
    const handler = createLegacyPublicMediaHandler({ enabled: true, authorize,
      readRemote: async () => { reads++; return bytes; }, readLocal: async () => { reads++; return bytes; } });
    await handler({ method: "GET" }, res, ROUTE + "photo.webp");
    assert.ok([404, 503].includes(res.status));
    assert.equal(reads, 0);
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(res.body.toString().includes("secret"), false);
  }
});

test("R2 failure uses authorized local bytes while both failures remain an unavailable state", async () => {
  const outcomes = [];
  const handler = createLegacyPublicMediaHandler({ enabled: true, authorize: async () => true,
    readRemote: async () => { throw new Error("remote secret"); }, readLocal: async () => bytes,
    onOutcome: (value) => outcomes.push(value) });
  const res = response();
  await handler({ method: "GET" }, res, ROUTE + "photo.webp");
  assert.equal(res.status, 200);
  assert.equal(res.headers["X-Winga-Media-Source"], "disk_fallback");
  assert.deepEqual(res.body, bytes);
  assert.deepEqual(Object.keys(outcomes[0]).sort(), ["durationMs", "outcome", "status"]);
  const unavailable = createLegacyPublicMediaHandler({ enabled: true, authorize: async () => true,
    readRemote: async () => { throw new Error("no remote"); }, readLocal: async () => null });
  const failed = response();
  await unavailable({ method: "GET" }, failed, ROUTE + "photo.webp");
  assert.equal(failed.status, 503);
});

test("visibility changed during remote I/O prevents releasing image bytes", async () => {
  let publicNow = true;
  const handler = createLegacyPublicMediaHandler({ enabled: true, authorize: async () => publicNow,
    readRemote: async () => { publicNow = false; return bytes; } });
  const res = response();
  await handler({ method: "GET" }, res, ROUTE + "photo.webp");
  assert.equal(res.status, 404);
  assert.equal(res.body.equals(bytes), false);
});

test("canary reads are bounded to four in-flight requests and slots are released", async () => {
  const releases = [];
  const handler = createLegacyPublicMediaHandler({ enabled: true, authorize: async () => true,
    readRemote: () => new Promise((resolve) => releases.push(resolve)) });
  const pending = Array.from({ length: 4 }, () => handler({ method: "GET" }, response(), ROUTE + "photo.webp"));
  const busy = response();
  await handler({ method: "GET" }, busy, ROUTE + "photo.webp");
  assert.equal(busy.status, 503);
  releases.forEach((resolve) => resolve(bytes));
  await Promise.all(pending);
  const res = response();
  const next = handler({ method: "GET" }, res, ROUTE + "photo.webp");
  await new Promise((resolve) => setImmediate(resolve));
  releases.at(-1)(bytes);
  await next;
  assert.equal(res.status, 200);
});

test("real HTTP GET and HEAD return no-store verified media without redirecting to public R2", async () => {
  const handler = createLegacyPublicMediaHandler({ enabled: true, authorize: async () => true,
    readRemote: async () => bytes, onOutcome: () => { throw new Error("telemetry failure"); } });
  const server = http.createServer((req, res) => { handler(req, res, new URL(req.url, "http://local").pathname); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}${ROUTE}photo.webp`;
    const get = await fetch(url);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "private, no-store");
    assert.equal(get.headers.get("location"), null);
    assert.equal(get.headers.get("x-winga-media-source"), "r2");
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get("content-length")), bytes.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

function probeFetch({ source = "r2", original = bytes, items = [{ image: "/uploads/photo.webp" }], cache = "private, no-store" } = {}) {
  return async (url, options) => {
    if (url.includes("/api/products?")) return Response.json({ items, hasMore: false });
    const isCanary = url.includes(ROUTE);
    return new Response(options.method === "HEAD" ? null : (isCanary ? bytes : original), { status: 200,
      headers: { "X-Winga-Media-Source": source, "Cache-Control": cache, "Content-Length": String(bytes.length) } });
  };
}

test("runtime probe verifies R2 bytes and HEAD but never claims serving cutover or disk removal", async () => {
  const result = await verifyLegacyPublicR2({ fetchImpl: probeFetch() });
  assert.equal(result.verified, 1);
  assert.equal(result.legacyBytesMatch, true);
  assert.equal(result.r2ReadProven, true);
  assert.equal(result.servingPathSwitched, false);
  assert.equal(result.diskRemovalReady, false);
  assert.equal(JSON.stringify(result).includes("photo.webp"), false);
});

test("runtime probe rejects disk fallback, unsafe caching, mismatches, empty samples and credentialed origins", async () => {
  for (const [options, error] of [
    [{ source: "disk_fallback" }, /R2_NOT_PROVEN/], [{ cache: "public" }, /CACHE_UNSAFE/],
    [{ original: Buffer.from("changed") }, /BYTES_DIFFER/], [{ items: [] }, /NO_PUBLIC_LEGACY_SAMPLE/]
  ]) await assert.rejects(verifyLegacyPublicR2({ fetchImpl: probeFetch(options) }), error);
  await assert.rejects(verifyLegacyPublicR2({ origin: "https://secret:token@host/", fetchImpl: probeFetch() }), /ORIGIN_INVALID/);
});
