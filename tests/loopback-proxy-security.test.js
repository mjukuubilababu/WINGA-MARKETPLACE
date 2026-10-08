const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

for (const filename of ["tmp-bootstrap-integrity-check.mjs", "tmp-image-viewport-check.mjs"]) {
  test(filename + " cannot follow an upstream redirect or replace the loopback authority", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    const start = source.indexOf("function createStaticServer()"), end = source.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const handler = vm.runInNewContext(source.slice(start, end) + "\ncreateStaticServer()", {
      URL, FRONTEND_URL: "http://127.0.0.1:4173", BACKEND_URL: "http://127.0.0.1:43080/api",
      BACKEND_ORIGIN: "http://127.0.0.1:43080", BACKEND_API: "http://127.0.0.1:43080/api",
      http: { createServer: (callback) => callback },
      fetch: async (url, options) => {
        calls.push({ url, options });
        if (options.redirect !== "error") throw new Error("Redirect policy missing");
        throw new TypeError("Synthetic upstream redirect rejected");
      }
    });
    for (const url of ["/api/redirect?next=https://synthetic.invalid/private", "https://synthetic.invalid/api/redirect", "/uploads/redirect"]) {
      let status, ended;
      await handler({ url, method: "GET", headers: { cookie: "synthetic-cookie" } }, {
        writeHead: (value) => { status = value; }, end: (value) => { ended = value; }
      });
      assert.equal(status, 404);
      assert.equal(ended, "Not Found");
    }
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(new URL(call.url).origin, "http://127.0.0.1:43080");
      assert.equal(call.options.redirect, "error");
    }
  });
}
