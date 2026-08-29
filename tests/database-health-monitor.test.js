"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decideNotification, evaluateDatabaseHealth, getThresholds } = require("../scripts/check-database-health");

function health(overrides = {}) {
  return {
    primary: {
      pool: { maxConnections: 20, totalConnections: 5, idleConnections: 3, waitingClients: 0, utilizationPercent: 25, saturated: false, ...(overrides.pool || {}) },
      metrics: { queries: 100, queryErrors: 0, slowQueries: 2, transactionErrors: 0, slowTransactions: 0, poolErrors: 0, ...(overrides.metrics || {}) }
    },
    replica: { enabled: true, status: "ready", cooldownActive: false, metrics: { failures: 0, poolErrors: 0, ...(overrides.replicaMetrics || {}) }, ...(overrides.replica || {}) }
  };
}

test("database monitor stays ready for healthy pools and bounded query growth", () => {
  const result = evaluateDatabaseHealth(health(), { queries: 90, slowQueries: 1 });
  assert.equal(result.readiness, "ready");
  assert.deepEqual(result.alerts, []);
  assert.equal(result.deltas.slowQueries, 1);
});

test("database monitor reports saturation and new primary errors as critical", () => {
  const result = evaluateDatabaseHealth(health({
    pool: { totalConnections: 20, idleConnections: 0, waitingClients: 4, utilizationPercent: 100, saturated: true },
    metrics: { queryErrors: 2, poolErrors: 1 }
  }), {});
  assert.equal(result.readiness, "critical");
  assert.deepEqual(result.alerts.map((item) => item.type), ["primary_pool_saturated", "primary_database_errors"]);
});

test("database monitor warns on slow-query spikes and replica fallback", () => {
  const thresholds = getThresholds({ DB_ALERT_SLOW_QUERY_WARNING_DELTA: "5", DB_ALERT_SLOW_QUERY_CRITICAL_DELTA: "20" });
  const result = evaluateDatabaseHealth(health({
    metrics: { slowQueries: 8 },
    replica: { status: "degraded", cooldownActive: true },
    replicaMetrics: { failures: 1 }
  }), { slowQueries: 2 }, thresholds);
  assert.equal(result.readiness, "warning");
  assert.deepEqual(result.alerts.map((item) => item.type), ["slow_query_spike", "read_replica_degraded"]);
});

test("database alerts dedupe incidents, remind after cooldown, and report recovery", () => {
  const incident = { readiness: "critical", alerts: [{ type: "primary_pool_saturated" }] };
  const first = decideNotification(incident, {}, Date.parse("2026-08-29T00:00:00Z"), 3600000);
  assert.deepEqual([first.send, first.kind], [true, "incident"]);
  const state = { lastFingerprint: first.fingerprint, lastNotifiedAt: "2026-08-29T00:00:00Z" };
  assert.equal(decideNotification(incident, state, Date.parse("2026-08-29T00:30:00Z"), 3600000).send, false);
  const reminder = decideNotification(incident, state, Date.parse("2026-08-29T01:00:00Z"), 3600000);
  assert.deepEqual([reminder.send, reminder.kind], [true, "reminder"]);
  const recovery = decideNotification({ readiness: "ready", alerts: [] }, state, Date.parse("2026-08-29T01:05:00Z"), 3600000);
  assert.deepEqual([recovery.send, recovery.kind], [true, "recovery"]);
});

