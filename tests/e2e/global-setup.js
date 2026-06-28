const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..", "..");
const serverPidPath = path.join(__dirname, ".server-pid.json");
const serverUrl = "http://127.0.0.1:4173/index.html";

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(childProcess, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (childProcess.exitCode !== null) {
      throw new Error(`E2E server exited early with code ${childProcess.exitCode}.`);
    }
    try {
      const response = await fetch(serverUrl);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry until the startup timeout expires.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${serverUrl}.`);
}

module.exports = async function globalSetup() {
  fs.rmSync(serverPidPath, { force: true });
  const childProcess = spawn(process.execPath, ["tests/e2e/start-servers.js"], {
    cwd: rootDir,
    detached: false,
    stdio: "ignore",
    windowsHide: true
  });
  childProcess.unref();
  fs.writeFileSync(serverPidPath, JSON.stringify({
    pid: childProcess.pid,
    startedAt: new Date().toISOString()
  }, null, 2));
  await waitForServer(childProcess);
};
