"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeResult } = require("../scripts/check-video-health");

test("video health monitor exposes aggregate-only pipeline status", () => {
  const result = normalizeResult({ ok: true, status: 200 }, {
    readiness: "ready",
    alerts: [],
    health: {
      total: 12, uploading: 1, processing: 2, ready: 8, failed: 1, failedRecent: 1,
      readyUnclaimed: 2, stalled: 0, oldestPendingAgeSeconds: 80,
      averageReadyLatencySeconds: 34,
      providerId: "must-not-leak",
      sellerId: "must-not-leak"
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.health.processing, 2);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("video health monitor fails closed for degraded HTTP responses", () => {
  const result = normalizeResult({ ok: false, status: 503 }, {
    readiness: "degraded",
    alerts: ["stalled_video_processing"],
    health: { stalled: 1, failed: 0 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.readiness, "degraded");
  assert.deepEqual(result.alerts, ["stalled_video_processing"]);
});