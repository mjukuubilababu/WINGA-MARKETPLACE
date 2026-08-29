const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function waitForExit(child, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not stop within the graceful deadline.")), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test("server becomes ready only after boot and drains cleanly on SIGTERM", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-lifecycle-"));
  const port = 44500 + Math.floor(Math.random() * 500);
  let output = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(process.cwd(), "backend"),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_URL: "",
      WINGA_DATA_DIR: path.join(tempRoot, "data"),
      WINGA_UPLOADS_DIR: path.join(tempRoot, "uploads"),
      SHUTDOWN_GRACE_MS: "5000"
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    const deadline = Date.now() + 15000;
    let health;
    while (Date.now() < deadline) {
      try {
        health = await fetch("http://127.0.0.1:" + port + "/health");
        if (health.ok) break;
        await health.arrayBuffer();
      } catch (_error) {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.readiness, "ready");
    assert.equal(body.phase, "ready");
    assert.equal(health.headers.get("cache-control"), "no-store");

    child.send("winga:test:shutdown");
    const result = await waitForExit(child);
    assert.equal(result.code, 0, output);
    assert.match(output, /server_shutdown_started/);
    assert.match(output, /server_shutdown_completed/);
  } finally {
    if (child.exitCode == null && !child.killed) child.kill("SIGKILL");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});