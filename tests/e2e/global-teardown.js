const fs = require("node:fs");
const path = require("node:path");

const serverPidPath = path.join(__dirname, ".server-pid.json");

function readServerPid() {
  try {
    const payload = JSON.parse(fs.readFileSync(serverPidPath, "utf8"));
    const pid = Number(payload?.pid || 0);
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch (error) {
    return 0;
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
  fs.rmSync(serverPidPath, { force: true });
};
