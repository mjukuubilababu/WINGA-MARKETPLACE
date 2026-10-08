const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { summarizeDemandEvents, normalizeDemandEvent } = require("../backend/demand-service");
const source = fs.readFileSync(path.join(__dirname, "../backend/server.js"), "utf8");

function serverFunction(name, nextName, context = {}) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(source.slice(start, end) + `\n${name}`, context);
}

test("cookie names remain own string entries and never inherit object properties", () => {
  const parseCookies = serverFunction("parseCookies", "getAuthCookieSameSite");
  const cookies = parseCookies({ headers: { cookie: "__proto__=poison; constructor=ctor; toString=string; winga_auth=one%20two; malformed=%QQ" } });
  assert.equal(Object.getPrototypeOf(cookies), null);
  assert.equal(cookies.__proto__, "poison");
  assert.equal(cookies.constructor, "ctor");
  assert.equal(cookies.winga_auth, "one two");
  assert.equal(cookies.malformed, "%QQ");
  assert.equal(parseCookies({ headers: {} }).constructor, undefined);
});

test("local bootstrap uses exclusive creation and preserves a store created by another writer", () => {
  let writeOptions, written = "existing-store";
  const ensure = serverFunction("ensureLocalArtifacts", "createRequestId", {
    MEDIA_STORAGE_POLICY: { remoteOnly: false }, DATA_DIR: "data", BACKUP_DIR: "backups", UPLOADS_DIR: "uploads", DATA_FILE: "store",
    DEFAULT_CATEGORIES: [], getSeedUsersForEnvironment: () => [], createPasswordHash: () => "hash",
    fs: { existsSync: (filename) => filename !== "store", writeFileSync: (filename, content, options) => {
      writeOptions = options;
      if (options.flag === "wx") throw Object.assign(new Error("exists"), { code: "EEXIST" });
      written = content;
    } }
  });
  ensure();
  assert.equal(writeOptions.flag, "wx");
  assert.equal(writeOptions.mode, 0o600);
  assert.equal(written, "existing-store");
});

test("local bootstrap does not swallow failures other than exclusive-create collisions", () => {
  const failure = Object.assign(new Error("denied"), { code: "EACCES" });
  const ensure = serverFunction("ensureLocalArtifacts", "createRequestId", {
    MEDIA_STORAGE_POLICY: { remoteOnly: false }, DATA_DIR: "data", BACKUP_DIR: "backups", UPLOADS_DIR: "uploads", DATA_FILE: "store",
    DEFAULT_CATEGORIES: [], getSeedUsersForEnvironment: () => [], createPasswordHash: () => "hash",
    fs: { existsSync: (filename) => filename !== "store", writeFileSync: () => { throw failure; } }
  });
  assert.throws(ensure, (error) => error === failure);
});

test("demand counters count reserved user keys without prototype corruption", () => {
  for (const action of ["constructor", "__proto__", "tostring"]) {
    assert.throws(() => normalizeDemandEvent({ action }, { id: "product-1", uploadedBy: "seller" }), /Demand action/);
  }
  const events = ["__proto__", "constructor", "toString", "__proto__"].map((value, i) => ({
    productId: "product-1", action: "notify_when_available", color: value, size: value, buyerId: "buyer-" + i
  }));
  const summary = summarizeDemandEvents(events)[0];
  assert.equal(summary.actionCounts.notify_when_available, 4);
  assert.deepEqual(summary.topColors, [ { color: "__proto__", count: 2 }, { color: "constructor", count: 1 }, { color: "toString", count: 1 } ]);
  assert.deepEqual(summary.topSizes, [ { size: "__proto__", count: 2 }, { size: "constructor", count: 1 }, { size: "toString", count: 1 } ]);
  assert.equal(Object.getPrototypeOf(summary.actionCounts), Object.prototype);
  assert.equal(Object.prototype.poison, undefined);
});
