const fs = require("node:fs");
const path = require("node:path");

const serverPidPath = path.join(__dirname, ".server-pid.json");
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");

function readServerPid() {
  try {
    const payload = JSON.parse(fs.readFileSync(serverPidPath, "utf8"));
    const pid = Number(payload?.pid || 0);
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch (error) {
    return 0;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (isProcessRunning(pid) && fs.existsSync(seedSessionsPath) && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

module.exports = async function globalTeardown() {
  const pid = readServerPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      // The server may already be gone after a failed startup or interrupted run.
    }
  }
  if (pid) {
    await waitForProcessExit(pid);
  }
  fs.rmSync(seedSessionsPath, { force: true });
  fs.rmSync(serverPidPath, { force: true });
};
