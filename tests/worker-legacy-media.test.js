const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { verifyLegacyUploadCompatibility, formatCompatibilityFailure } = require("../backend/verify-legacy-upload-compatibility");

const source = fs.readFileSync(path.join(__dirname, "../worker.js"), "utf8")
  .replace("export default {", "globalThis.worker = {");
const bytes = Buffer.from("legacy-image-test-bytes");
const headers = { "Content-Type": "image/webp", "Content-Length": String(bytes.length),
  "Cache-Control": "private, no-store", "X-Winga-Media-Source": "r2",
  "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
const routes = ["/uploads/photo.webp", "/__winga-image__?u=%2Fuploads%2Fphoto.webp"];
function fixture(fetchImpl, extra = {}) {
  const logs = [];
  const context = vm.createContext({ URL, URLSearchParams, TextEncoder, Headers, Request, Response,
    AbortSignal, setTimeout, clearTimeout, fetch: fetchImpl,
    console: { warn: (value) => logs.push(value) },
    caches: { get default() { throw new Error("Legacy requests must never access Cache API"); } }, ...extra });
  vm.runInContext(source, context);
  return { logs, run: (route, options = {}) => context.worker.fetch(new Request("https://wingamarket.com" + route, options),
    { ORIGIN: "https://origin.example", ASSETS: { fetch() { throw new Error("Must not fall through to assets"); } } },
    { waitUntil() { throw new Error("No legacy cache writes"); } }) };
}
function noStore(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("x-winga-legacy-delivery"), "origin-no-store-v1");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("legacy GET and HEAD bypass every cache and preserve R2 bytes, headers and proxy query", async () => {
  const calls = [];
  const app = fixture(async (url, options) => {
    calls.push({ url, options });
    return new Response(options.method === "HEAD" ? null : bytes, { headers: { ...headers,
      "Set-Cookie": "not-forwarded", "ETag": "old", "Age": "600" } });
  });
  for (const route of routes) {
    for (const method of ["GET", "HEAD"]) {
      const response = await app.run(route, { method, headers: {
        "If-None-Match": "old", "If-Modified-Since": new Date().toUTCString(),
        Cookie: "private-session", Authorization: "secret", Range: "bytes=0-1" } });
      assert.equal(response.status, 200);
      noStore(response);
      assert.equal(response.headers.get("x-winga-media-source"), "r2");
      assert.equal(response.headers.get("content-length"), String(bytes.length));
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      for (const name of ["set-cookie", "etag", "age"]) assert.equal(response.headers.get(name), null);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), method === "HEAD" ? Buffer.alloc(0) : bytes);
      const call = calls.at(-1);
      assert.equal(call.url, "https://origin.example" + route);
      assert.equal(call.options.method, method);
      assert.equal(call.options.cache, "no-store");
      assert.equal(call.options.redirect, "manual");
      assert.equal(call.options.cf, undefined);
      assert.ok(call.options.signal instanceof AbortSignal);
      assert.deepEqual(Object.keys(call.options.headers).sort(), ["Accept", "Cache-Control"]);
    }
  }
  assert.equal(calls.length, 4);
});

test("origin denial after a successful read is never masked by cached media", async () => {
  for (const route of routes) {
    let calls = 0;
    const app = fixture(async () => ++calls === 1 ? new Response(bytes, { headers })
      : new Response("Not found", { status: 404 }));
    assert.equal((await app.run(route)).status, 200);
    const denied = await app.run(route);
    assert.equal(denied.status, 404);
    assert.equal(await denied.text(), "Not found");
    noStore(denied);
    assert.equal(calls, 2);
  }
});

test("origin errors remain distinct with no retries, fabricated image, or stale fallback", async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    let calls = 0;
    const app = fixture(async () => { calls++; return new Response("unavailable", {
      status, headers: { "Retry-After": "3", "Cache-Control": "public, max-age=86400" }
    }); });
    const response = await app.run(routes[0]);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("retry-after"), "3");
    assert.equal(await response.text(), "unavailable");
    noStore(response);
    assert.equal(calls, 1);
  }
});

test("network and timeout errors produce safe 503 without logging URLs or private data", async () => {
  for (const error of [new Error("private-file-name"), new DOMException("timeout", "TimeoutError")]) {
    const app = fixture(async () => { throw error; });
    const response = await app.run(routes[0]);
    assert.equal(response.status, 503);
    noStore(response);
    assert.equal(await response.text(), "");
    assert.deepEqual(app.logs.map(JSON.parse), [{ event: "legacy_media_origin_unavailable", status: 503 }]);
  }
});

test("redirects and unsolicited 304 cannot escape origin authorization", async () => {
  for (const status of [301, 302, 307, 308, 304]) {
    const app = fixture(async () => new Response(null, { status, headers: { Location: "https://other.example/private" } }));
    const response = await app.run(routes[0]);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("location"), null);
    noStore(response);
  }
});

test("unsupported methods do not issue origin requests", async () => {
  const app = fixture(async () => { assert.fail("unexpected fetch"); });
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await app.run(routes[0], { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    noStore(response);
  }
});

test("large response streams are not buffered before returning", async () => {
  let finish;
  const body = new ReadableStream({ start(controller) { controller.enqueue(bytes); finish = () => controller.close(); } });
  const app = fixture(async () => new Response(body, { headers }));
  const response = await app.run(routes[0]);
  const reader = response.body.getReader();
  assert.deepEqual(Buffer.from((await reader.read()).value), bytes);
  finish();
  assert.equal((await reader.read()).done, true);
});

test("edge verifier covers full inventory, repeated read and GET/HEAD proxy through real Worker entry", async () => {
  let calls = 0;
  const app = fixture(async (_url, options) => { calls++; return new Response(options.method === "HEAD" ? null : bytes, { headers }); });
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const result = await verifyLegacyUploadCompatibility({ origin: "https://wingamarket.com", requireEdgePolicy: true,
    readManifest: async () => ({ journals: ["test"], files: [["photo.webp", hash], ["other.webp", hash]] }),
    fetchImpl: (url, options) => app.run(new URL(url).pathname + new URL(url).search, options) });
  assert.equal(result.verified, 2);
  assert.equal(result.edgePolicyVerified, true);
  assert.equal(calls, 6);
  assert.equal(result.diskRemovalReady, false);
  assert.equal(result.crossNodeFailoverProven, false);
});

test("edge proof rejects missing policy, cached success and stale cache age", async () => {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  for (const extra of [{}, { "X-Winga-Legacy-Delivery": "origin-no-store-v1", "CF-Cache-Status": "HIT" },
    { "X-Winga-Legacy-Delivery": "origin-no-store-v1", Age: "0" }]) {
    await assert.rejects(verifyLegacyUploadCompatibility({ requireEdgePolicy: true,
      readManifest: async () => ({ files: [["photo.webp", hash]] }),
      fetchImpl: async () => new Response(bytes, { headers: { ...headers, ...extra } }) }), /COMPAT_EDGE_/);
  }
});

const diagnosticManifest = { files: [["private-filename.webp", crypto.createHash("sha256").update(bytes).digest("hex")]] };
const successfulProbe = (method) => new Response(method === "HEAD" ? null : bytes,
  { headers: { ...headers, "X-Winga-Legacy-Delivery": "origin-no-store-v1" } });

test("HTTP failure diagnostics expose only status and aggregate evidence, never raw upstream data", async () => {
  for (const status of [403, 404, 429, 503]) {
    let calls = 0;
    await assert.rejects(verifyLegacyUploadCompatibility({ origin: "https://wingamarket.com", requireEdgePolicy: true,
      readManifest: async () => diagnosticManifest,
      fetchImpl: async () => { calls++; return new Response("SECRET_BODY", { status, headers: {
        "content-type": "text/html; SECRET_TYPE", "x-winga-media-source": "SECRET_SOURCE",
        "x-request-id": "SECRET_ID", "set-cookie": "SECRET_COOKIE", "cf-ray": "SECRET_RAY"
      } }); } }), (error) => {
      const result = formatCompatibilityFailure(error);
      assert.equal(result.errorCode, "COMPAT_HTTP_FAILED");
      assert.equal(result.diagnostics.httpStatus, status);
      assert.equal(result.diagnostics.contentKind, "html");
      assert.equal(result.diagnostics.mediaSource, "other");
      assert.equal(result.diagnostics.cfRay, null);
      assert.ok(Number.isFinite(Date.parse(result.diagnostics.observedAt)));
      assert.equal(result.diagnostics.phase, "legacy-get");
      assert.equal(result.diagnostics.fileNumber, 1);
      assert.equal(result.diagnostics.verifiedFiles, 0);
      assert.equal(result.diagnostics.plannedFiles, 1);
      assert.equal(result.diskRemovalReady, false);
      assert.doesNotMatch(JSON.stringify(result), /SECRET|private-filename|https:|stack/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("diagnosis compares the exact failed method and path once but never turns failure into success", async () => {
  const phases = ["legacy-get", "legacy-head", "proxy-get", "proxy-head", "legacy-repeat-get"];
  for (let failedCall = 1; failedCall <= phases.length; failedCall++) {
    const edge = [];
    const direct = [];
    await assert.rejects(verifyLegacyUploadCompatibility({ origin: "https://wingamarket.com", requireEdgePolicy: true, diagnose: true,
      readManifest: async () => diagnosticManifest,
      fetchImpl: async (url, options) => {
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        const target = new URL(url);
        if (target.origin === "https://winga-pflp.onrender.com") {
          direct.push({ path: target.pathname + target.search, method: options.method });
          return successfulProbe(options.method);
        }
        edge.push({ path: target.pathname + target.search, method: options.method });
        return edge.length === failedCall ? new Response(null, { status: 503 }) : successfulProbe(options.method);
      } }), (error) => {
      const result = formatCompatibilityFailure(error);
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics.phase, phases[failedCall - 1]);
      assert.equal(result.diagnostics.httpStatus, 503);
      assert.equal(result.diagnostics.directOrigin.httpStatus, 200);
      assert.equal(result.crossNodeFailoverProven, false);
      return true;
    });
    assert.equal(edge.length, failedCall);
    assert.deepEqual(direct, [edge.at(-1)]);
  }
});

test("diagnosis is opt-in and does not send arbitrary-host failures to production", async () => {
  for (const options of [
    { origin: "https://wingamarket.com", requireEdgePolicy: true },
    { origin: "https://unrelated.example", requireEdgePolicy: true, diagnose: true },
    { origin: "https://winga-pflp.onrender.com", requireEdgePolicy: true, diagnose: true },
    { origin: "https://wingamarket.com", requireEdgePolicy: false, diagnose: true }
  ]) {
    let calls = 0;
    await assert.rejects(verifyLegacyUploadCompatibility({ ...options, readManifest: async () => diagnosticManifest,
      fetchImpl: async () => { calls++; return new Response(null, { status: 404 }); } }), /COMPAT_HTTP_FAILED/);
    assert.equal(calls, 1);
  }
});

test("transport failure and failed counterpart remain sanitized and keep original failure", async () => {
  let calls = 0;
  await assert.rejects(verifyLegacyUploadCompatibility({ origin: "https://wingamarket.com", requireEdgePolicy: true, diagnose: true,
    readManifest: async () => diagnosticManifest,
    fetchImpl: async () => { calls++; throw new Error("SECRET https://private.example/filename"); } }), (error) => {
    const result = formatCompatibilityFailure(error);
    assert.equal(result.errorCode, "COMPAT_REQUEST_FAILED");
    assert.equal(result.diagnostics.httpStatus, null);
    assert.deepEqual(result.diagnostics.directOrigin, { requestFailed: true });
    assert.doesNotMatch(JSON.stringify(result), /SECRET|private.example|filename/);
    return true;
  });
  assert.equal(calls, 2);
  const unknown = new Error("SECRET");
  unknown.diagnostics = { url: "SECRET", body: "SECRET" };
  assert.equal(formatCompatibilityFailure(unknown).diagnostics, undefined);
  assert.doesNotMatch(JSON.stringify(formatCompatibilityFailure(unknown)), /SECRET/);
});

test("diagnostics count fully verified files without exposing the failing filename", async () => {
  let calls = 0;
  await assert.rejects(verifyLegacyUploadCompatibility({
    readManifest: async () => ({ files: [...diagnosticManifest.files, ["another-private.webp", diagnosticManifest.files[0][1]]] }),
    fetchImpl: async (_url, options) => ++calls <= 4 ? successfulProbe(options.method) : new Response(null, { status: 404 })
  }), (error) => {
    const result = formatCompatibilityFailure(error);
    assert.equal(result.diagnostics.fileNumber, 2);
    assert.equal(result.diagnostics.verifiedFiles, 1);
    assert.equal(result.diagnostics.plannedFiles, 2);
    assert.doesNotMatch(JSON.stringify(result), /another-private|private-filename/);
    return true;
  });
});
