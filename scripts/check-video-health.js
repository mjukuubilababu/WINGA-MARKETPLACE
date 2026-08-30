#!/usr/bin/env node
"use strict";

const DEFAULT_URL = "https://winga-pflp.onrender.com/api/ops/media/videos/health";

function readEnv(name, fallback = "") {
  return String(process.env[name] || fallback || "").trim();
}

function normalizeResult(response, body = {}) {
  const health = body?.health && typeof body.health === "object" ? body.health : {};
  return {
    ok: Boolean(response?.ok && body?.readiness === "ready"),
    status: response?.ok ? "http_ok" : "http_error",
    readiness: String(body?.readiness || "unavailable"),
    httpStatus: Number(response?.status || 0),
    alerts: Array.isArray(body?.alerts) ? body.alerts.map((value) => String(value).slice(0, 80)) : [],
    health: {
      total: Number(health.total || 0),
      uploading: Number(health.uploading || 0),
      processing: Number(health.processing || 0),
      ready: Number(health.ready || 0),
      failed: Number(health.failed || 0),
      failedRecent: Number(health.failedRecent || 0),
      cleanupPending: Number(health.cleanupPending || 0),
      cleanupFailed: Number(health.cleanupFailed || 0),
      readyUnclaimed: Number(health.readyUnclaimed || 0),
      stalled: Number(health.stalled || 0),
      oldestPendingAgeSeconds: Number(health.oldestPendingAgeSeconds || 0),
      averageReadyLatencySeconds: Number(health.averageReadyLatencySeconds || 0),
      safetyPending: Number(health.safetyPending || 0),
      safetyProcessing: Number(health.safetyProcessing || 0),
      safetyRetry: Number(health.safetyRetry || 0),
      safetySubmitted: Number(health.safetySubmitted || 0),
      safetyCompleted: Number(health.safetyCompleted || 0),
      safetyDead: Number(health.safetyDead || 0),
      safetyStalled: Number(health.safetyStalled || 0),
      oldestSafetyPendingAgeSeconds: Number(health.oldestSafetyPendingAgeSeconds || 0)
    }
  };
}

async function fetchHealth(url, token, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-Ops-Health-Token": token,
        "User-Agent": "winga-video-health-monitor"
      }
    });
    const body = await response.json().catch(() => ({}));
    return normalizeResult(response, body);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const url = readEnv("VIDEO_HEALTH_URL", DEFAULT_URL);
  const token = readEnv("OPS_HEALTH_TOKEN");
  if (!token) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: "config_error", readiness: "unavailable" }, null, 2)}\n`);
    process.exitCode = 3;
    return;
  }
  try {
    const result = await fetchHealth(url, token, Math.max(1000, Math.min(Number(readEnv("VIDEO_HEALTH_TIMEOUT_MS", "15000")) || 15000, 60000)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      status: "network_error",
      readiness: "unavailable",
      message: error?.name === "AbortError" ? "Video health check timed out." : String(error?.message || error || "Video health check failed.")
    }, null, 2)}\n`);
    process.exitCode = 4;
  }
}

if (require.main === module) main();

module.exports = { fetchHealth, normalizeResult };