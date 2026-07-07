#!/usr/bin/env node
"use strict";

const DEFAULT_HEALTH_URL = "https://winga-pflp.onrender.com/api/ops/intelligence/queue-health";
const EXIT_OK = 0;
const EXIT_WARNING = 1;
const EXIT_CRITICAL = 2;
const EXIT_CONFIG = 3;
const EXIT_NETWORK = 4;

function readEnv(name, fallback = "") {
  return String(process.env[name] || fallback || "").trim();
}

function parseTimeoutMs(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 15000;
  }
  return Math.max(1000, Math.min(parsed, 60000));
}

function writeResult(payload = {}) {
  const safePayload = sanitizeMonitorPayload(payload);
  process.stdout.write(`${JSON.stringify(safePayload, null, 2)}\n`);
  return safePayload;
}

function sanitizeMonitorPayload(payload = {}) {
  return {
    ok: Boolean(payload.ok),
    status: payload.status || "unknown",
    readiness: payload.readiness || "unknown",
    message: payload.message || "",
    url: payload.url || "",
    httpStatus: payload.httpStatus || 0,
    alerts: Array.isArray(payload.alerts) ? payload.alerts.map((alert) => ({
      level: String(alert?.level || ""),
      type: String(alert?.type || ""),
      message: String(alert?.message || ""),
      count: Number(alert?.count || 0)
    })) : [],
    health: payload.health && typeof payload.health === "object" ? {
      pending: Number(payload.health.pending || 0),
      processing: Number(payload.health.processing || 0),
      failed: Number(payload.health.failed || 0),
      dead: Number(payload.health.dead || 0),
      oldestPendingAgeSeconds: Number(payload.health.oldestPendingAgeSeconds || 0),
      oldestFailedAgeSeconds: Number(payload.health.oldestFailedAgeSeconds || 0),
      oldestProcessingAgeSeconds: Number(payload.health.oldestProcessingAgeSeconds || 0)
    } : null,
    worker: payload.worker && typeof payload.worker === "object" ? {
      enabled: Boolean(payload.worker.enabled),
      embeddedEnabled: Boolean(payload.worker.embeddedEnabled),
      processorMode: String(payload.worker.processorMode || ""),
      processed: Number(payload.worker.processed || 0),
      failed: Number(payload.worker.failed || 0),
      rawPruned: payload.worker.rawPruned && typeof payload.worker.rawPruned === "object" ? {
        intelligenceEvents: Number(payload.worker.rawPruned.intelligenceEvents || 0),
        demandEvents: Number(payload.worker.rawPruned.demandEvents || 0),
        searchDemandEvents: Number(payload.worker.rawPruned.searchDemandEvents || 0)
      } : null,
      standbySkips: Number(payload.worker.standbySkips || 0),
      standbyFallbackRuns: Number(payload.worker.standbyFallbackRuns || 0),
      lastSuccessAt: String(payload.worker.lastSuccessAt || ""),
      lastFailureAt: String(payload.worker.lastFailureAt || "")
    } : null
  };
}

async function sendAlertWebhook(webhookUrl, payload = {}) {
  const safeUrl = String(webhookUrl || "").trim();
  if (!safeUrl) {
    return { sent: false, reason: "missing_webhook" };
  }
  const readiness = String(payload.readiness || "");
  if (readiness === "ready") {
    return { sent: false, reason: "ready" };
  }
  const response = await fetch(safeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "winga-intelligence-health-monitor"
    },
    body: JSON.stringify({
      source: "winga-intelligence-health",
      severity: readiness === "critical" || readiness === "unavailable" ? "critical" : "warning",
      readiness,
      status: payload.status || "unknown",
      httpStatus: Number(payload.httpStatus || 0),
      message: payload.message || "",
      url: payload.url || "",
      alerts: payload.alerts || [],
      health: payload.health || null,
      worker: payload.worker || null,
      checkedAt: new Date().toISOString()
    })
  });
  if (!response.ok) {
    throw new Error(`Alert webhook failed with ${response.status}`);
  }
  return { sent: true };
}

async function fetchHealth(url, token, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "X-Ops-Health-Token": token,
        "User-Agent": "winga-intelligence-health-monitor"
      }
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_error) {
      body = { parseError: "invalid_json", bodyStart: text.slice(0, 160) };
    }
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function getExitForReadiness(readiness, warnAsSuccess) {
  if (readiness === "ready") {
    return EXIT_OK;
  }
  if (readiness === "watch" || readiness === "degraded") {
    return warnAsSuccess ? EXIT_OK : EXIT_WARNING;
  }
  return EXIT_CRITICAL;
}

async function main() {
  const url = readEnv("INTELLIGENCE_HEALTH_URL", DEFAULT_HEALTH_URL);
  const token = readEnv("OPS_HEALTH_TOKEN", readEnv("INTELLIGENCE_HEALTH_TOKEN"));
  const timeoutMs = parseTimeoutMs(readEnv("INTELLIGENCE_HEALTH_TIMEOUT_MS"));
  const warnAsSuccess = readEnv("INTELLIGENCE_HEALTH_WARN_AS_SUCCESS").toLowerCase() === "true";
  const alertWebhookUrl = readEnv("INTELLIGENCE_ALERT_WEBHOOK_URL");

  if (!token) {
    const output = writeResult({
      ok: false,
      status: "config_error",
      readiness: "unavailable",
      message: "OPS_HEALTH_TOKEN or INTELLIGENCE_HEALTH_TOKEN is required.",
      url
    });
    await maybeSendAlertWebhook(alertWebhookUrl, output);
    process.exitCode = EXIT_CONFIG;
    return;
  }

  let response;
  let body;
  try {
    ({ response, body } = await fetchHealth(url, token, timeoutMs));
  } catch (error) {
    const output = writeResult({
      ok: false,
      status: "network_error",
      readiness: "unavailable",
      message: error?.name === "AbortError" ? "Health check timed out." : String(error?.message || error || "Health check failed."),
      url
    });
    await maybeSendAlertWebhook(alertWebhookUrl, output);
    process.exitCode = EXIT_NETWORK;
    return;
  }

  const readiness = String(body?.readiness || (response.ok ? "unknown" : "unavailable"));
  const exitCode = response.ok
    ? getExitForReadiness(readiness, warnAsSuccess)
    : EXIT_CRITICAL;
  const output = writeResult({
    ok: response.ok && exitCode === EXIT_OK,
    status: response.ok ? "http_ok" : "http_error",
    readiness,
    message: body?.error || body?.message || "",
    url,
    httpStatus: response.status,
    alerts: body?.alerts || [],
    health: body?.health || null,
    worker: body?.worker || null
  });
  await maybeSendAlertWebhook(alertWebhookUrl, output);
  process.exitCode = exitCode;
}

async function maybeSendAlertWebhook(webhookUrl, payload) {
  if (!webhookUrl || payload?.readiness === "ready") {
    return;
  }
  try {
    await sendAlertWebhook(webhookUrl, payload);
  } catch (error) {
    process.stderr.write(`[WINGA] Intelligence alert webhook failed: ${String(error?.message || error || "unknown")}\n`);
  }
}

main().catch((error) => {
  const output = writeResult({
    ok: false,
    status: "monitor_crashed",
    readiness: "unavailable",
    message: String(error?.message || error || "Monitor crashed."),
    url: readEnv("INTELLIGENCE_HEALTH_URL", DEFAULT_HEALTH_URL)
  });
  maybeSendAlertWebhook(readEnv("INTELLIGENCE_ALERT_WEBHOOK_URL"), output).finally(() => {});
  process.exitCode = EXIT_NETWORK;
});
