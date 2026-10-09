"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { Readable } = require("node:stream");

const serverPath = path.join(__dirname, "..", "backend", "server.js");
const source = fs.readFileSync(serverPath, "utf8");
const serverRequire = createRequire(serverPath);

function harness(options = {}) {
  const start = source.indexOf("const server = http.createServer(async (req, res) => {");
  const end = source.indexOf("\nfunction waitForServerClose()", start);
  const bodyStart = source.indexOf("function collectBody(req, options = {}) {");
  const bodyEnd = source.indexOf("\nfunction isJsonContentType(", bodyStart);
  assert.ok(start >= 0 && end > start && bodyStart >= 0 && bodyEnd > bodyStart);
  const mutations = [];
  const audits = [];
  const summaries = [];
  let ids = 0;
  const store = {
    async retryDeadVideoSafetyJobs(value) {
      mutations.push({ type: "retry", ...value });
      if (options.failDatabase) throw new Error("private database connection details");
      return { retried: value.limit, requested: value.limit };
    },
    async pruneStaleVideoWorkerHeartbeats(value) {
      mutations.push({ type: "prune", ...value });
      return { pruned: 2, olderThanSeconds: value.olderThanSeconds, requested: value.limit };
    }
  };
  const context = vm.createContext({
    require: serverRequire,
    URL, Buffer, MAX_REQUEST_BODY_BYTES: 1024,
    http: { createServer: handler => handler },
    createRequestId: () => "test-request-" + (++ids),
    serverLifecycle: { phase: "ready" },
    NODE_ENV: "test",
    OPS_HEALTH_TOKEN: "synthetic-ops-token",
    getClientIp: req => req.socket.remoteAddress,
    isValidOpsHealthToken: req => req.headers["x-ops-health-token"] === "synthetic-ops-token",
    postgresStore: store,
    appendAuditLog: async entry => {
      if (options.failAudit) throw new Error("private audit connection details");
      audits.push(entry);
    },
    logRouteSummary: (meta, detail) => summaries.push({ statusCode: meta.statusCode, ...detail }),
    sendJson: (res, statusCode, body, headers) => {
      res.result = { statusCode, body: JSON.parse(JSON.stringify(body)), headers };
    }
  });
  // Execute the complete production request callback with isolated storage.
  // Keeping its later declarations reproduces the original clientIp temporal-dead-zone failure.
  new vm.Script(source.slice(bodyStart, bodyEnd) + "\n" + source.slice(start, end)
    + "\nglobalThis.handler = server;").runInContext(context);
  async function request(payload, settings = {}) {
    const raw = settings.raw === undefined ? JSON.stringify(payload) : settings.raw;
    const req = Readable.from(raw ? [Buffer.from(raw)] : []);
    req.method = settings.method || "POST";
    req.url = settings.url || "/api/ops/media/videos/recover";
    req.headers = { host: "localhost", "content-type": "application/json",
      "x-ops-health-token": settings.token === undefined ? "synthetic-ops-token" : settings.token };
    req.socket = { remoteAddress: "127.0.0.1" };
    const res = {};
    await context.handler(req, res);
    assert.ok(res.result, "Request must return JSON rather than reject its handler.");
    return res.result;
  }
  return { request, mutations, audits, summaries };
}
const payload = { confirmation: "recover-video-operations", retryDeadLimit: 1 };

test("video recovery returns 200 and audits the client address before the general store is loaded", async () => {
  const app = harness();
  const response = await app.request(payload);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.safety, { retried: 1, requested: 1 });
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(app.audits.length, 1);
  assert.equal(app.audits[0].ip, "127.0.0.1");
  assert.equal(app.audits[0].event, "ops_token_video_recovery");
  assert.equal((await app.request(null, { method: "GET", url: "/health" })).statusCode, 200);
});

test("unauthorized and unconfirmed recovery never mutate the queue", async () => {
  const app = harness();
  assert.equal((await app.request(payload, { token: "incorrect" })).statusCode, 401);
  assert.equal((await app.request({ retryDeadLimit: 1 })).statusCode, 400);
  assert.equal((await app.request({ confirmation: payload.confirmation })).statusCode, 400);
  assert.equal(app.mutations.length, 0);
  assert.equal(app.audits.length, 0);
});

test("recovery reports database failures as JSON and continues serving health", async () => {
  const app = harness({ failDatabase: true });
  const response = await app.request(payload);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "video_recovery_failed");
  assert.equal(response.body.safety, undefined);
  assert.ok(!JSON.stringify(response).includes("private database"));
  assert.equal((await app.request(null, { method: "GET", url: "/health" })).statusCode, 200);
});

test("audit failure preserves applied recovery counts and does not crash the server", async () => {
  const app = harness({ failAudit: true });
  const response = await app.request(payload);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "video_recovery_failed");
  assert.deepEqual(response.body.safety, { retried: 1, requested: 1 });
  assert.equal(app.mutations.length, 1);
  assert.ok(!JSON.stringify(response).includes("private audit"));
  assert.equal(app.summaries.at(-1).videoSafetyRetried, 1);
  assert.equal((await app.request(null, { method: "GET", url: "/health" })).statusCode, 200);
});

test("malformed and oversized JSON cannot terminate the recovery handler", async () => {
  const app = harness();
  const malformed = await app.request(null, { raw: "{" });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, "invalid_json");
  const oversized = await app.request(null, { raw: "x".repeat(1025) });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.body.code, "payload_too_large");
  assert.equal(app.mutations.length, 0);
  assert.equal((await app.request(null, { method: "GET", url: "/health" })).statusCode, 200);
});

test("recovery keeps retry and stale-worker cleanup bounded", async () => {
  const app = harness();
  const response = await app.request({
    confirmation: payload.confirmation, retryDeadLimit: 100000,
    pruneStaleWorkers: true, staleWorkerAgeSeconds: -1, staleWorkerLimit: 100000
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(app.mutations, [
    { type: "retry", limit: 100 },
    { type: "prune", olderThanSeconds: 60, limit: 1000 }
  ]);
  assert.equal(response.body.workers.pruned, 2);
});
