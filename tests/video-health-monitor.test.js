"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeResult } = require("../scripts/check-video-health");

test("video health monitor exposes aggregate-only pipeline status", () => {
  const result = normalizeResult({ ok: true, status: 200 }, {
    readiness: "ready",
    alerts: [],
    health: {
      total: 12, uploading: 1, processing: 2, ready: 8, readyWithoutPoster: 1, failed: 1, failedRecent: 1,
      readyUnclaimed: 2, stalled: 0, oldestPendingAgeSeconds: 80,
      averageReadyLatencySeconds: 34, transcodeFailureRate: 0.1111, posterFailureRate: 0.125,
      safetyPending: 3, safetyProcessing: 1, safetyRetry: 2, safetySubmitted: 4,
      safetyCompleted: 20, safetyDead: 0, safetyStalled: 0, oldestSafetyPendingAgeSeconds: 95,
      playbackWindowHours: 24, playbackImpressions: 120, playbackPlays: 80,
      playbackPauses: 21, playbackResumes: 17, playbackReplays: 5,
      playbackMutes: 11, playbackUnmutes: 7,
      playbackCompletions: 48, playbackErrors: 4, playbackSummaries: 70,
      playbackCommerceActions: 14, playbackErrorRate: 0.0476,
      playbackCompletionRate: 0.6, averagePlaybackStartLatencyMs: 380,
      p95PlaybackStartLatencyMs: 920, playbackTokenCacheHitRate: 0.75,
      playbackPrewarmHitRate: 0.5, playbackBigPipePrefetchHitRate: 0.25,
      averagePlaybackBufferRatio: 0.09,
      averagePlaybackWatchMs: 7200,
      providerId: "must-not-leak",
      sellerId: "must-not-leak"
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.health.processing, 2);
  assert.equal(result.health.safetyPending, 3);
  assert.equal(result.health.safetyRetry, 2);
  assert.equal(result.health.oldestSafetyPendingAgeSeconds, 95);
  assert.equal(result.health.playbackPlays, 80);
  assert.equal(result.health.playbackCompletionRate, 0.6);
  assert.equal(result.health.transcodeFailureRate, 0.1111);
  assert.equal(result.health.posterFailureRate, 0.125);
  assert.equal(result.health.p95PlaybackStartLatencyMs, 920);
  assert.equal(result.health.playbackTokenCacheHitRate, 0.75);
  assert.equal(result.health.averagePlaybackBufferRatio, 0.09);
  assert.equal(result.health.playbackCommerceActions, 14);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("video health alerts require meaningful playback samples", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "backend", "server.js"), "utf8");
  assert.equal(source.includes("VIDEO_PLAYBACK_MIN_SAMPLE_SIZE"), true);
  assert.equal(source.includes("VIDEO_PIPELINE_MIN_SAMPLE_SIZE"), true);
  assert.equal(source.includes("VIDEO_TRANSCODE_FAILURE_RATE_THRESHOLD"), true);
  assert.equal(source.includes("VIDEO_POSTER_FAILURE_RATE_THRESHOLD"), true);
  assert.equal(source.includes("VIDEO_PLAYBACK_START_LATENCY_THRESHOLD_MS"), true);
  assert.equal(source.includes("playbackAttempts >= playbackMinSampleSize"), true);
  assert.equal(source.includes("health.playbackSummaries >= playbackMinSampleSize"), true);
  assert.equal(source.includes("video_playback_error_rate_exceeded"), true);
  assert.equal(source.includes("video_playback_buffer_ratio_exceeded"), true);
  assert.equal(source.includes("video_transcode_failure_rate_exceeded"), true);
  assert.equal(source.includes("video_poster_failure_rate_exceeded"), true);
  assert.equal(source.includes("video_playback_start_latency_exceeded"), true);
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