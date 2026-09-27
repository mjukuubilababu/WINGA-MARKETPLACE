const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readMediaStoragePolicy } = require("../backend/media-storage-policy");
const config = { WINGA_MEDIA_STORAGE_MODE: "remote_only", DATABASE_URL: "postgres://fixture",
  WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED: "true", R2_ACCOUNT_ID: "fixture", R2_ACCESS_KEY_ID: "fixture",
  R2_SECRET_ACCESS_KEY: "fixture", R2_BUCKET_NAME: "public-fixture", R2_PUBLIC_URL_BASE: "https://media.example" };

test("remote-only mode is explicit, immutable and validates prerequisites without disclosing credentials", () => {
  assert.deepEqual(readMediaStoragePolicy({}), { mode: "hybrid", remoteOnly: false });
  assert.deepEqual(readMediaStoragePolicy(config), { mode: "remote_only", remoteOnly: true });
  assert.equal(Object.isFrozen(readMediaStoragePolicy(config)), true);
  for (const key of ["DATABASE_URL", "WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED", "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL_BASE"]) {
    assert.throws(() => readMediaStoragePolicy({ ...config, [key]: "" }), /^Error: MEDIA_REMOTE_[A-Z0-9_]+$/);
  }
  assert.throws(() => readMediaStoragePolicy({ WINGA_MEDIA_STORAGE_MODE: "remote_typo" }), /MODE_INVALID/);
  for (const value of ["http://media.example", "https://user:secret@media.example", "invalid", "https://media.example/uploads", "https://media.example/?secret=1"]) {
    assert.throws(() => readMediaStoragePolicy({ ...config, R2_PUBLIC_URL_BASE: value }), /PUBLIC_URL_INVALID/);
  }
});

async function startFixture(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "winga-remote-only-"));
  const allocator = http.createServer();
  await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
  const port = allocator.address().port;
  await new Promise((resolve) => allocator.close(resolve));
  const events = [];
  let output = "";
  const child = spawn(process.execPath, [path.join(__dirname, "fixtures/remote-only-server.cjs")], {
    cwd: path.join(__dirname, "../backend"), stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, ...config, NODE_ENV: "test", PORT: String(port),
      WINGA_DATA_DIR: path.join(root, "data"), WINGA_UPLOADS_DIR: path.join(root, "uploads"),
      WINGA_LEGACY_PUBLIC_R2_READ_ENABLED: "true", OPS_HEALTH_TOKEN: "fixture-ops-token",
      ALLOWED_ORIGINS: `http://127.0.0.1:${port}`, ALLOW_LEGACY_BEARER_AUTH: "true",
      REDIS_URL: "", SHUTDOWN_GRACE_MS: "5000", ...extra }
  });
  const exited = once(child, "exit");
  child.on("message", (event) => events.push(event));
  child.stdout.on("data", (part) => { output += part; });
  child.stderr.on("data", (part) => { output += part; });
  return { child, exited, events, root, origin: `http://127.0.0.1:${port}`, output: () => output,
    scenario: async (scenario) => {
      const wait = new Promise((resolve) => {
        const listener = (event) => { if (event.type === "scenario" && event.scenario === scenario) { child.off("message", listener); resolve(); } };
        child.on("message", listener);
      });
      child.send({ scenario });
      await wait;
    },
    close: async () => {
      if (child.exitCode === null) child.kill();
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

test("real server remote-only paths never touch data/uploads, preserve history, use R2 and enforce ops auth", { timeout: 60000 }, async () => {
  const app = await startFixture();
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(app.origin + "/health", { signal: AbortSignal.timeout(500) })).ok; } catch (_) { /* startup */ }
      if (ready || app.child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, app.output());
    for (const token of ["", "wrong"]) {
      const denied = await fetch(app.origin + "/api/ops/media/storage-policy", { headers: { "X-Ops-Health-Token": token } });
      assert.equal(denied.status, 401);
      await denied.arrayBuffer();
    }
    const policy = await fetch(app.origin + "/api/ops/media/storage-policy", { headers: { "X-Ops-Health-Token": "fixture-ops-token" } });
    assert.equal(policy.headers.get("cache-control"), "no-store");
    assert.deepEqual(await policy.json(), { ok: true, privacy: "ops-aggregate-only", mode: "remote_only",
      localMediaAccessAllowed: false, localArtifactWritesAllowed: false, legacyCompatibilityEnabled: true,
      diskRemovalReady: false, crossNodeFailoverProven: false });
    for (const route of ["/uploads/mapped.webp", "/__winga-image__?u=%2Fuploads%2Fmapped.webp"]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await fetch(app.origin + route, { method });
        assert.equal(res.status, 200, app.output());
        assert.equal(res.headers.get("x-winga-media-source"), "r2");
        assert.equal(res.headers.get("cache-control"), "private, no-store");
        assert.equal(await res.text(), method === "HEAD" ? "" : "bounded R2 fixture");
      }
    }
    for (const route of ["/uploads/missing.webp", "/__winga-image__?u=%2Fuploads%2Fmissing.webp"]) {
      const res = await fetch(app.origin + route);
      assert.equal(res.status, 404);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      await res.arrayBuffer();
    }
    const products = await fetch(app.origin + "/api/products");
    assert.equal(products.status, 200, app.output());
    const catalog = await products.text();
    assert.match(catalog, /\/uploads\/mapped.webp/);
    assert.match(catalog, /\/uploads\/missing.webp/);
    for (const [scenario, status] of [["storage-failure", 503], ["authorization-failure", 503], ["revoked", 404]]) {
      await app.scenario(scenario);
      const res = await fetch(app.origin + "/uploads/mapped.webp");
      assert.equal(res.status, status);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      await res.arrayBuffer();
    }
    await app.scenario("storage-failure");
    const canary = await fetch(app.origin + "/api/media/legacy-public/mapped.webp");
    assert.equal(canary.status, 503);
    await canary.arrayBuffer();
    await app.scenario("healthy");
    const sharp = require("sharp");
    const bytes = await sharp({ create: { width: 20, height: 30, channels: 3, background: "red" } }).png().toBuffer();
    const image = "data:image/png;base64," + bytes.toString("base64");
    const payload = { id: "new-fixture-product", name: "Fixture product", category: "wanawake", price: 5000,
      uploadedBy: "seller", shop: "Seller", image, images: [image] };
    const csrfResponse = await fetch(app.origin + "/api/auth/csrf-token");
    const csrfCookie = csrfResponse.headers.get("set-cookie").split(";")[0];
    const { csrfToken } = await csrfResponse.json();
    const send = (body) => fetch(app.origin + "/api/products", { method: "POST", headers: {
      "Content-Type": "application/json", Authorization: "Bearer fixture-session", Origin: app.origin,
      Cookie: csrfCookie, "X-CSRF-Token": csrfToken }, body: JSON.stringify(body) });
    const uploaded = await send(payload);
    assert.equal(uploaded.status, 200, await uploaded.clone().text() + app.output());
    const product = await uploaded.json();
    assert.match(product.image, /^https:\/\/media.example\/products\//);
    assert.equal(product.mediaItems[0].aspectRatio, 0.666667);
    assert.equal(app.events.filter((event) => event.type === "upload").length, 3);
    assert.ok(app.events.some((event) => event.type === "audit" && event.event === "product_created"));
    const authHeaders = { "Content-Type": "application/json", Authorization: "Bearer fixture-session", Origin: app.origin,
      Cookie: csrfCookie, "X-CSRF-Token": csrfToken };
    const updated = await fetch(app.origin + "/api/products/fixture-product", { method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ images: [product.image], image: product.image, mediaItems: product.mediaItems }) });
    assert.equal(updated.status, 200, await updated.clone().text() + app.output());
    assert.equal((await updated.json()).image, product.image);
    const deleted = await fetch(app.origin + "/api/products/fixture-product", { method: "DELETE", headers: authHeaders });
    assert.equal(deleted.status, 200, app.output());
    await deleted.arrayBuffer();
    assert.ok(app.events.some((event) => event.type === "audit" && event.event === "product_updated"));
    assert.ok(app.events.some((event) => event.type === "audit" && event.event === "product_deleted"));
    await app.scenario("upload-failure");
    const failed = await send({ ...payload, id: "failed-fixture-product" });
    assert.equal(failed.status, 500);
    await failed.arrayBuffer();
    assert.equal(app.events.some((event) => event.type === "created" && event.id === "failed-fixture-product"), false);
    await app.scenario("audit-failure");
    const auditFailed = await send({ ...payload, id: "failed-audit-product", image: product.image, images: [product.image] });
    assert.equal(auditFailed.status, 500);
    await auditFailed.arrayBuffer();
    assert.equal((await fetch(app.origin + "/health")).status, 200);
    assert.deepEqual(app.events.filter((event) => ["disk-access", "unexpected-metadata"].includes(event.type)), []);
    assert.equal(fs.existsSync(path.join(app.root, "uploads")), false);
    assert.equal(fs.existsSync(path.join(app.root, "data")), false);
  } finally { await app.close(); }
});

test("remote-only boot refuses local seeding for an empty database", { timeout: 20000 }, async () => {
  const app = await startFixture({ FIXTURE_EMPTY_DATABASE: "true" });
  try {
    const [code] = await app.exited;
    assert.equal(code, 1);
    assert.match(app.output(), /MEDIA_REMOTE_LOCAL_STORE_DISABLED/);
    assert.equal(app.events.some((event) => event.type === "disk-access"), false);
    assert.equal(fs.existsSync(path.join(app.root, "data")), false);
  } finally { await app.close(); }
});
