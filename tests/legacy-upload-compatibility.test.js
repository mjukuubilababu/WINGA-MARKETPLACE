const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresStore } = require("../backend/db");
const migration = require("../backend/migrations/legacy-public-media-cutover");
const { createLegacyUploadCompatibilityStore, createLegacyUploadCompatibilityHandler } = require("../backend/legacy-upload-compatibility");
const { readCompatibilityManifest, verifyLegacyUploadCompatibility } = require("../backend/verify-legacy-upload-compatibility");
const bytes = Buffer.from("verified legacy image fixture");
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const name = "photo-1080.webp";
const base = "https://media.example";
const image = `${base}/products/legacy/${name}`;
let db;
let store;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY, status TEXT, identity_document_image TEXT DEFAULT '');
    CREATE TABLE products(id TEXT PRIMARY KEY, uploaded_by TEXT, image TEXT, images JSONB DEFAULT '[]', media_items JSONB DEFAULT '[]', status TEXT);
    CREATE TABLE public_content_visibility(content_type TEXT, content_id TEXT, visibility TEXT);`);
  for (const sql of migration.statements) await db.exec(sql);
  store = createLegacyUploadCompatibilityStore({ query: (sql, params) => db.query(sql, params) });
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec("TRUNCATE products, users, public_content_visibility, legacy_public_media_cutovers; INSERT INTO users VALUES('seller','active','')");
  await db.query("INSERT INTO products(id,uploaded_by,image,status) VALUES('p1','seller',$1,'approved')", [image]);
  const plan = { base, changes: [{ id: "p1", owner: "seller", before: { image: "/uploads/" + name }, after: { image } }] };
  await db.query("INSERT INTO legacy_public_media_cutovers(id,state,plan,source_hashes) VALUES($1,'applied',$2,$3)",
    ["a".repeat(64), JSON.stringify(plan), JSON.stringify({ [name]: hash, "photo-320.webp": hash })]);
});
function response() {
  return { status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; this.writableEnded = true; } };
}

test("primary authorization requires applied journal, exact current CDN family and active public owner", async () => {
  let replicas = 0;
  const primary = createPostgresStore({ databaseUrl: "postgres://fixture", queryClient: db,
    readQueryClient: { query: async () => { replicas++; throw new Error("not primary"); } } });
  assert.deepEqual(await primary.authorizeLegacyUploadCompatibility(name), { sha256: hash });
  assert.deepEqual(await primary.authorizeLegacyUploadCompatibility("photo-320.webp"), { sha256: hash });
  assert.equal(await primary.authorizeLegacyUploadCompatibility("unknown.webp"), null);
  assert.equal(await primary.authorizeLegacyUploadCompatibility("../secret.webp"), false);
  await db.exec("UPDATE products SET image='https://untrusted.example/products/legacy/photo-1080.webp'");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  assert.equal(replicas, 0);
});

test("privacy, owner suspension, deleted products and ownership changes are denied", async () => {
  await db.exec("INSERT INTO public_content_visibility VALUES('product','p1','private')");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  await db.exec("UPDATE public_content_visibility SET visibility='followers'");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  await db.exec("DELETE FROM public_content_visibility; UPDATE users SET status='suspended'");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  await db.exec("UPDATE users SET status='active'; INSERT INTO users VALUES('other','active',''); UPDATE products SET uploaded_by='other'");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  await db.exec("DELETE FROM products");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
});

test("identity and restricted image overlaps block delivery for legacy and CDN paths", async () => {
  for (const url of ["/uploads/photo-320.webp", base + "/products/legacy/photo-320.webp"]) {
    await db.query("UPDATE users SET identity_document_image=$1", [url]);
    assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  }
  await db.exec("UPDATE users SET identity_document_image=''");
  await db.query("INSERT INTO products(id,uploaded_by,image,status) VALUES('hidden','seller',$1,'pending')", [image]);
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
});

test("rolled-back and orphaned journal entries deny rather than fall through to disk", async () => {
  await db.exec("UPDATE legacy_public_media_cutovers SET state='rolled_back'");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
  await db.exec("UPDATE legacy_public_media_cutovers SET state='applied'; UPDATE products SET image='/uploads/photo-1080.webp'");
  assert.equal(await store.authorizeLegacyUploadCompatibility(name), false);
});

test("unknown and disabled paths retain existing handler without reading R2", async () => {
  const fail = () => { throw new Error("unexpected"); };
  const disabled = createLegacyUploadCompatibilityHandler({ authorize: fail, readRemote: fail });
  assert.equal(await disabled({ method: "GET" }, response(), "/uploads/" + name), false);
  const unknown = createLegacyUploadCompatibilityHandler({ enabled: true, authorize: async () => null, readRemote: fail });
  const res = response();
  assert.equal(await unknown({ method: "GET" }, res, "/uploads/unknown.webp"), false);
  assert.equal(res.status, null);
});

test("mapped media proves journal bytes and cannot silently read local fallback", async () => {
  const handler = createLegacyUploadCompatibilityHandler({ enabled: true, authorize: async () => ({ sha256: hash }),
    readRemote: async () => bytes, readLocal: () => { throw new Error("local must never be used"); } });
  const res = response();
  assert.equal(await handler({ method: "GET" }, res, "/uploads/" + name), true);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, bytes);
  assert.equal(res.headers["X-Winga-Media-Source"], "r2");
  for (const readRemote of [async () => null, async () => Buffer.from("tampered"), async () => { throw new Error("secret"); }]) {
    const failed = response();
    await createLegacyUploadCompatibilityHandler({ enabled: true, authorize: async () => ({ sha256: hash }),
      readRemote, readLocal: async () => bytes })({ method: "GET" }, failed, "/uploads/" + name);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers["Cache-Control"], "private, no-store");
    assert.equal(failed.body.toString().includes("secret"), false);
  }
});

test("database outage and revocation during read fail closed without disk fallthrough", async () => {
  const res = response();
  await createLegacyUploadCompatibilityHandler({ enabled: true, authorize: async () => { throw new Error("secret"); } })({ method: "GET" }, res, "/uploads/" + name);
  assert.equal(res.status, 503);
  const revoked = response();
  await createLegacyUploadCompatibilityHandler({ enabled: true, authorize: (name) => store.authorizeLegacyUploadCompatibility(name),
    readRemote: async () => { await db.exec("UPDATE users SET status='suspended'"); return bytes; } })({ method: "GET" }, revoked, "/uploads/" + name);
  assert.equal(revoked.status, 404);
});

test("authorization overflow and conflicting journal hashes fail closed", async () => {
  const overflow = createLegacyUploadCompatibilityStore({ query: async () => ({ rows: Array(11).fill({}) }) });
  await assert.rejects(overflow.authorizeLegacyUploadCompatibility(name), /JOURNAL_LIMIT/);
  await db.query(`INSERT INTO legacy_public_media_cutovers(id,state,plan,source_hashes)
    SELECT $1,state,plan,$2 FROM legacy_public_media_cutovers LIMIT 1`, ["b".repeat(64), JSON.stringify({ [name]: "b".repeat(64) })]);
  await assert.rejects(store.authorizeLegacyUploadCompatibility(name), /JOURNAL_INVALID/);
  await assert.rejects(readCompatibilityManifest(db), /JOURNAL_INVALID/);
});

test("HTTP origin verifier covers all recorded files plus proxy and HEAD without a source disk", async () => {
  const handler = createLegacyUploadCompatibilityHandler({ enabled: true, authorize: (name) => store.authorizeLegacyUploadCompatibility(name), readRemote: async () => bytes });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    const pathname = url.pathname === "/__winga-image__" ? url.searchParams.get("u") : url.pathname;
    if (!await handler(req, res, pathname)) { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await verifyLegacyUploadCompatibility({ readManifest: () => readCompatibilityManifest(db),
      fetchImpl: (url, options) => fetch(url.replace("https://winga-pflp.onrender.com", `http://127.0.0.1:${server.address().port}`), options) });
    assert.equal(result.verified, 2);
    assert.equal(result.verifiedBytes, bytes.length * 2);
    assert.equal(result.proxySampleVerified, true);
    assert.equal(result.sourceDiskReadByVerifier, false);
    assert.equal(result.diskRemovalReady, false);
    assert.equal(result.crossNodeFailoverProven, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("verifier rejects legacy disk responses, unsafe caching, missing media, corrupt bytes and manifest changes", async () => {
  const manifest = await readCompatibilityManifest(db);
  const good = { "content-length": String(bytes.length), "content-type": "image/webp", "cache-control": "private, no-store", "x-winga-media-source": "r2" };
  for (const fixture of [
    { headers: { ...good, "x-winga-media-source": "disk_fallback" } },
    { headers: { ...good, "cache-control": "public" } },
    { headers: good, status: 404 }, { headers: good, body: Buffer.alloc(bytes.length) }
  ]) {
    await assert.rejects(verifyLegacyUploadCompatibility({ readManifest: async () => manifest,
      fetchImpl: async (_url, options) => new Response(options.method === "HEAD" ? null : fixture.body || bytes,
        { status: fixture.status || 200, headers: fixture.headers }) }), /COMPAT_/);
  }
  let reads = 0;
  await assert.rejects(verifyLegacyUploadCompatibility({ readManifest: async () => ++reads === 1 ? manifest : { ...manifest, journals: [] },
    fetchImpl: async (_url, options) => new Response(options.method === "HEAD" ? null : bytes, { headers: good }) }), /MANIFEST_CHANGED/);
  await db.exec("DELETE FROM legacy_public_media_cutovers");
  await assert.rejects(readCompatibilityManifest(db), /JOURNAL_UNAVAILABLE/);
  await assert.rejects(verifyLegacyUploadCompatibility({ readManifest: async () => ({ files: [] }) }), /INVENTORY_LIMIT/);
});

test("real backend preserves routes with flag off and blocks disk fallback when flag is on but primary authorization is unavailable", { timeout: 60000 }, async () => {
  for (const enabled of [false, true]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "winga-compat-routes-"));
    fs.mkdirSync(path.join(root, "uploads"));
    fs.writeFileSync(path.join(root, "uploads", name), bytes);
    const allocator = http.createServer();
    await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
    const port = allocator.address().port;
    await new Promise((resolve) => allocator.close(resolve));
    const child = spawn(process.execPath, ["server.js"], {
      cwd: path.resolve(__dirname, "../backend"), stdio: "ignore",
      env: { ...process.env, NODE_ENV: "test", PORT: String(port), DATABASE_URL: "", R2_ACCOUNT_ID: "",
        WINGA_DATA_DIR: path.join(root, "data"), WINGA_UPLOADS_DIR: path.join(root, "uploads"),
        WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED: String(enabled) }
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    try {
      const origin = `http://127.0.0.1:${port}`;
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { ready = (await fetch(origin + "/api/health", { signal: AbortSignal.timeout(500) })).ok; } catch (_) { /* startup */ }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(ready, true);
      for (const pathname of ["/uploads/" + name, "/__winga-image__?u=" + encodeURIComponent("/uploads/" + name)]) {
        for (const method of ["GET", "HEAD"]) {
          const result = await fetch(origin + pathname, { method });
          assert.equal(result.status, enabled ? 503 : 200);
          const body = Buffer.from(await result.arrayBuffer());
          if (enabled) assert.equal(result.headers.get("cache-control"), "private, no-store");
          else if (method === "GET") assert.deepEqual(body, bytes);
          if (method === "HEAD") assert.equal(body.length, 0);
        }
      }
      assert.equal((await fetch(origin + "/api/health")).ok, true);
    } finally {
      child.kill();
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
