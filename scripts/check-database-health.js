#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const DEFAULT_URL = "https://winga-pflp.onrender.com/api/ops/database/health";
const DEFAULT_STATE = path.join(process.cwd(), ".ops-state", "database-health.json");

const env = (name, fallback = "") => String(process.env[name] || fallback).trim();
const bounded = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const count = (value) => Math.max(0, Number(value || 0));
const delta = (current, previous) => count(current) >= count(previous)
  ? count(current) - count(previous)
  : count(current);

function getThresholds(source = process.env) {
  return {
    utilizationWarning: bounded(source.DB_ALERT_POOL_UTILIZATION_WARNING_PERCENT, 75, 1, 100),
    utilizationCritical: bounded(source.DB_ALERT_POOL_UTILIZATION_CRITICAL_PERCENT, 90, 1, 100),
    slowWarning: bounded(source.DB_ALERT_SLOW_QUERY_WARNING_DELTA, 10, 1, 1000000),
    slowCritical: bounded(source.DB_ALERT_SLOW_QUERY_CRITICAL_DELTA, 50, 1, 1000000),
    cooldownMs: bounded(source.DB_ALERT_REMINDER_COOLDOWN_MS, 3600000, 300000, 604800000)
  };
}

function metricSnapshot(health = {}) {
  const primary = health.primary?.metrics || {};
  const replica = health.replica?.metrics || {};
  return {
    queries: count(primary.queries),
    queryErrors: count(primary.queryErrors),
    slowQueries: count(primary.slowQueries),
    transactionErrors: count(primary.transactionErrors),
    slowTransactions: count(primary.slowTransactions),
    poolErrors: count(primary.poolErrors),
    replicaFailures: count(replica.failures),
    replicaPoolErrors: count(replica.poolErrors)
  };
}

function evaluateDatabaseHealth(health = {}, previous = {}, thresholds = getThresholds()) {
  const pool = health.primary?.pool || {};
  const replica = health.replica || {};
  const metrics = metricSnapshot(health);
  const deltas = Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, delta(value, previous[key])]));
  const alerts = [];
  const add = (severity, type, message, value) => alerts.push({ severity, type, message, value: count(value) });
  const utilization = count(pool.utilizationPercent);
  const waiting = count(pool.waitingClients);

  if (pool.saturated || waiting > 0) {
    add("critical", "primary_pool_saturated", "Primary database pool has waiting clients or no available capacity.", waiting);
  } else if (utilization >= thresholds.utilizationCritical) {
    add("critical", "primary_pool_utilization", "Primary database pool utilization crossed the critical threshold.", utilization);
  } else if (utilization >= thresholds.utilizationWarning) {
    add("warning", "primary_pool_utilization", "Primary database pool utilization crossed the warning threshold.", utilization);
  }
  const errorDelta = deltas.queryErrors + deltas.transactionErrors + deltas.poolErrors;
  if (errorDelta > 0) add("critical", "primary_database_errors", "New primary database errors were observed.", errorDelta);
  if (deltas.slowQueries >= thresholds.slowCritical) {
    add("critical", "slow_query_spike", "Slow-query growth crossed the critical threshold.", deltas.slowQueries);
  } else if (deltas.slowQueries >= thresholds.slowWarning) {
    add("warning", "slow_query_spike", "Slow-query growth crossed the warning threshold.", deltas.slowQueries);
  }
  if (deltas.slowTransactions >= thresholds.slowWarning) {
    add(deltas.slowTransactions >= thresholds.slowCritical ? "critical" : "warning", "slow_transaction_spike", "Slow-transaction growth crossed the alert threshold.", deltas.slowTransactions);
  }
  const replicaStatus = String(replica.status || (replica.enabled ? "unknown" : "disabled"));
  if (replica.enabled && (replicaStatus === "degraded" || replicaStatus === "unavailable" || replica.cooldownActive)) {
    add("warning", "read_replica_degraded", "Read replica is degraded; primary fallback is active.", deltas.replicaFailures + deltas.replicaPoolErrors);
  }
  const readiness = alerts.some((item) => item.severity === "critical") ? "critical" : (alerts.length ? "warning" : "ready");
  return {
    readiness,
    alerts,
    metrics,
    deltas,
    primaryPool: {
      maxConnections: count(pool.maxConnections),
      totalConnections: count(pool.totalConnections),
      idleConnections: count(pool.idleConnections),
      waitingClients: waiting,
      utilizationPercent: utilization,
      saturated: Boolean(pool.saturated)
    },
    replica: { enabled: Boolean(replica.enabled), status: replicaStatus, cooldownActive: Boolean(replica.cooldownActive) }
  };
}

function fingerprint(evaluation) {
  return evaluation.readiness === "ready"
    ? "ready"
    : `${evaluation.readiness}:${evaluation.alerts.map((item) => item.type).sort().join(",")}`;
}

function decideNotification(evaluation, previous = {}, now = Date.now(), cooldownMs = 3600000) {
  const next = fingerprint(evaluation);
  const prior = String(previous.lastFingerprint || "");
  const lastSent = Date.parse(previous.lastNotifiedAt || "") || 0;
  if (next === "ready") {
    const recovered = Boolean(prior && prior !== "ready");
    return { send: recovered, kind: recovered ? "recovery" : "none", fingerprint: next };
  }
  if (next !== prior) return { send: true, kind: "incident", fingerprint: next };
  return { send: now - lastSent >= cooldownMs, kind: "reminder", fingerprint: next };
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_error) { return {}; }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

async function requestHealth(url, token, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "X-Ops-Health-Token": token, "User-Agent": "winga-database-health-monitor" }
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_error) { body = {}; }
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWebhook(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "winga-database-health-monitor" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Webhook failed with ${response.status}`);
}

async function finish({ evaluation, previous, stateFile, webhookUrl, url, httpStatus, thresholds }) {
  const now = new Date();
  const decision = decideNotification(evaluation, previous, now.getTime(), thresholds.cooldownMs);
  let sent = false;
  if (decision.send && webhookUrl) {
    try {
      await sendWebhook(webhookUrl, {
        source: "winga-database-health",
        schemaVersion: "database-alert-v1",
        privacy: "ops-aggregate-only",
        kind: decision.kind,
        severity: decision.kind === "recovery" ? "resolved" : evaluation.readiness,
        readiness: evaluation.readiness,
        alerts: evaluation.alerts,
        primaryPool: evaluation.primaryPool,
        replica: evaluation.replica,
        deltas: evaluation.deltas,
        checkedAt: now.toISOString()
      });
      sent = true;
    } catch (error) {
      process.stderr.write(`[WINGA] Database alert webhook failed: ${String(error.message || error)}\n`);
    }
  }
  writeState(stateFile, {
    schemaVersion: "database-monitor-state-v1",
    lastFingerprint: decision.fingerprint,
    lastCheckedAt: now.toISOString(),
    lastNotifiedAt: sent ? now.toISOString() : String(previous.lastNotifiedAt || ""),
    metrics: evaluation.metrics
  });
  process.stdout.write(`${JSON.stringify({
    ok: evaluation.readiness === "ready",
    readiness: evaluation.readiness,
    url,
    httpStatus,
    alerts: evaluation.alerts,
    primaryPool: evaluation.primaryPool,
    replica: evaluation.replica,
    deltas: evaluation.deltas,
    notification: { kind: decision.kind, sent, suppressed: decision.send && !webhookUrl ? "missing_webhook" : !decision.send }
  }, null, 2)}\n`);
}

async function main() {
  const url = env("DATABASE_HEALTH_URL", DEFAULT_URL);
  const token = env("OPS_HEALTH_TOKEN", env("DATABASE_HEALTH_TOKEN"));
  const webhookUrl = env("DATABASE_ALERT_WEBHOOK_URL");
  const stateFile = env("DATABASE_HEALTH_STATE_PATH", DEFAULT_STATE);
  const thresholds = getThresholds();
  const previous = readState(stateFile);
  if (!token) {
    process.stdout.write(`${JSON.stringify({ ok: false, readiness: "unavailable", error: "OPS_HEALTH_TOKEN or DATABASE_HEALTH_TOKEN is required." }, null, 2)}\n`);
    process.exitCode = 3;
    return;
  }

  let response;
  let body;
  try {
    ({ response, body } = await requestHealth(url, token, bounded(env("DATABASE_HEALTH_TIMEOUT_MS"), 15000, 1000, 60000)));
  } catch (error) {
    const evaluation = {
      readiness: "critical",
      alerts: [{ severity: "critical", type: "database_health_unreachable", message: error.name === "AbortError" ? "Database health check timed out." : "Database health endpoint is unreachable.", value: 0 }],
      metrics: previous.metrics || {}, deltas: {}, primaryPool: {}, replica: {}
    };
    await finish({ evaluation, previous, stateFile, webhookUrl, url, httpStatus: 0, thresholds });
    process.exitCode = 4;
    return;
  }
  if (!body.health) {
    const evaluation = {
      readiness: "critical",
      alerts: [{ severity: "critical", type: "database_health_http_error", message: "Database health endpoint returned an unhealthy HTTP response.", value: response.status }],
      metrics: previous.metrics || {}, deltas: {}, primaryPool: {}, replica: {}
    };
    await finish({ evaluation, previous, stateFile, webhookUrl, url, httpStatus: response.status, thresholds });
    process.exitCode = 2;
    return;
  }
  const priorMetrics = previous.metrics && Object.keys(previous.metrics).length
    ? previous.metrics
    : metricSnapshot(body.health);
  const evaluation = evaluateDatabaseHealth(body.health, priorMetrics, thresholds);
  await finish({ evaluation, previous, stateFile, webhookUrl, url, httpStatus: response.status, thresholds });
  process.exitCode = evaluation.readiness === "ready" ? 0 : evaluation.readiness === "warning" ? 1 : 2;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${String(error.stack || error)}\n`);
    process.exitCode = 4;
  });
}

module.exports = { decideNotification, evaluateDatabaseHealth, getThresholds, metricSnapshot };
