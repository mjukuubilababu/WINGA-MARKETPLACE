const test = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { main } = require("../scripts/verify-production-shell");

const currentVersion = "20261012102003";
const nextVersion = "20261012103000";

function harness(t, options = {}) {
  const previous = process.env.WINGA_EXPECTED_BUILD_VERSION;
  if (options.expected === undefined) delete process.env.WINGA_EXPECTED_BUILD_VERSION;
  else process.env.WINGA_EXPECTED_BUILD_VERSION = options.expected;
  t.after(() => {
    if (previous === undefined) delete process.env.WINGA_EXPECTED_BUILD_VERSION;
    else process.env.WINGA_EXPECTED_BUILD_VERSION = previous;
  });
  const version = options.version || currentVersion;
  const requests = [];
  const html = `<!doctype html><meta name="winga-build" content="${version}">
    <div id="app-container" data-winga-build-version></div>
    <div id="product-photo-reel"></div><div id="boot-overlay"></div>
    <script src="/app.js?v=${version}"></script>
    <link href="/style.css?v=${version}">`;
  const bodies = {
    "/": html,
    "/index.html": html,
    "/sw.js": `const BUILD_VERSION = "${options.swVersion || version}"; self.addEventListener("activate", () => {});`,
    "/build-version.json": JSON.stringify({ version, source: "worker-deployment-binding" }),
    "/app.js": "const APP_BOOT_BUILD_VERSION = '';",
    "/style.css": ":root {}",
    "/api/products": JSON.stringify({ items: [], hasMore: false }),
    "/api/auth/csrf-token": JSON.stringify({ csrfToken: "a".repeat(32) })
  };
  t.mock.method(https, "get", (url, requestOptions, callback) => {
    requests.push({ url, headers: requestOptions.headers });
    const pathname = new URL(url).pathname;
    assert.ok(Object.hasOwn(bodies, pathname), `Unexpected request: ${url}`);
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = error => request.emit("error", error);
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = pathname === "/build-version.json" ? (options.manifestStatus || 200) : 200;
      response.headers = {
        "content-type": "application/json",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "content-security-policy": "default-src 'self'; script-src 'self'",
        "set-cookie": "winga_csrf=value; HttpOnly; Secure"
      };
      callback(response);
      response.emit("data", Buffer.from(bodies[pathname]));
      response.emit("end");
    });
    return request;
  });
  return requests;
}

test("the complete HTTPS check verifies the expected deployment without a separate manifest request", async t => {
  const requests = harness(t, { expected: currentVersion });
  await main();
  assert.equal(requests.length, 8);
  assert.equal(requests.filter(({ url }) => new URL(url).pathname === "/build-version.json").length, 1);
  for (const { headers } of requests) {
    assert.equal(headers["User-Agent"], "WingaProductionVerifier/1.0");
    assert.equal(headers["Cache-Control"], "no-cache");
  }
});

test("a consistent older build cannot pass the deployment check", async t => {
  harness(t, { expected: nextVersion });
  await assert.rejects(main(), /does not match expected deployment/);
});

test("a mixture of old and new shell assets fails verification", async t => {
  harness(t, { expected: currentVersion, swVersion: nextVersion });
  await assert.rejects(main(), /Production build versions do not match/);
});

test("a denied manifest remains a verification failure", async t => {
  harness(t, { expected: currentVersion, manifestStatus: 403 });
  await assert.rejects(main(), /returned 403 instead of 200/);
});

test("invalid expected versions fail before making any request", async t => {
  const requests = harness(t, { expected: "invalid" });
  await assert.rejects(main(), /must contain a 14-digit build version/);
  assert.equal(requests.length, 0);
});

test("manual shell verification still works without an expected deployment version", async t => {
  harness(t);
  await main();
});
