"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createVideoSafetyDispatcher } = require("../backend/video-safety-dispatcher");
const { verifyVideoSafetyResult } = require("../backend/video-safety");

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
}

test("video safety dispatcher submits private signed media without exposing provider credentials", async () => {
  const completions = [];
  let request;
  const secret = "video-safety-delivery-secret-32-characters-minimum";
  const dispatcher = createVideoSafetyDispatcher({
    store: {
      async claimVideoSafetyBatch() { return [{ providerId: "stream-video-123", idempotencyKey: "video-safety:stream-video-123", attempts: 1, maxAttempts: 6 }]; },
      async completeVideoSafetyDelivery(providerId, outcome) { completions.push({ providerId, outcome }); }
    },
    streamClient: {
      isConfigured: () => true,
      async createPlaybackToken() { return { customerCode: "examplecode", token: "private.playback.token" }; }
    },
    config: { scanUrl: "https://scanner.example/scan", deliverySecret: secret },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ submitted: true }), { status: 202 });
    }
  });
  dispatcher.start();
  await waitFor(() => completions.length === 1);
  dispatcher.stop();

  const payload = JSON.parse(request.init.body);
  assert.equal(payload.version, "video-safety-scan-v1");
  assert.equal(payload.providerId, "stream-video-123");
  assert.match(payload.mediaUrl, /^https:\/\/customer-examplecode\.cloudflarestream\.com\/.+\/manifest\/video\.m3u8$/);
  assert.doesNotMatch(request.init.body, /seller|buyer|apiToken/i);
  assert.equal(verifyVideoSafetyResult(request.init.body, {
    "x-winga-video-safety-timestamp": request.init.headers["X-Winga-Video-Safety-Timestamp"],
    "x-winga-video-safety-signature": request.init.headers["X-Winga-Video-Safety-Signature"]
  }, secret).ok, true);
  assert.equal(completions[0].outcome.submitted, true);
});

test("video safety dispatcher returns failures to durable retry state", async () => {
  const completions = [];
  const dispatcher = createVideoSafetyDispatcher({
    store: {
      async claimVideoSafetyBatch() { return [{ providerId: "stream-video-456", idempotencyKey: "video-safety:stream-video-456", attempts: 2, maxAttempts: 6 }]; },
      async completeVideoSafetyDelivery(providerId, outcome) { completions.push({ providerId, outcome }); }
    },
    streamClient: { isConfigured: () => true, async createPlaybackToken() { throw new Error("provider unavailable"); } },
    config: { scanUrl: "https://scanner.example/scan", deliverySecret: "video-safety-delivery-secret-32-characters-minimum" },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });
  dispatcher.start();
  await waitFor(() => completions.length === 1);
  dispatcher.stop();

  assert.equal(completions[0].outcome.submitted, false);
  assert.equal(completions[0].outcome.attempts, 2);
  assert.match(completions[0].outcome.error, /provider unavailable/);
});
test("video safety dispatcher bounds downstream concurrency during queue pressure", async () => {
  const jobs = Array.from({ length: 8 }, (_, index) => {
    const providerId = `stream-pressure-${index}`;
    return {
      providerId,
      idempotencyKey: `video-safety:${providerId}`,
      attempts: 1,
      maxAttempts: 6,
      lockedBy: "pressure-worker"
    };
  });
  let activeRequests = 0;
  let peakRequests = 0;
  let completed = 0;
  const dispatcher = createVideoSafetyDispatcher({
    workerId: "pressure-worker",
    batchSize: 100,
    concurrency: 3,
    store: {
      async claimVideoSafetyBatch(options) {
        assert.equal(options.limit, 100);
        return jobs;
      },
      async completeVideoSafetyDelivery(_providerId, outcome) {
        assert.equal(outcome.workerId, "pressure-worker");
        completed += 1;
        return { status: "submitted" };
      }
    },
    streamClient: {
      isConfigured: () => true,
      async createPlaybackToken() {
        return { customerCode: "examplecode", token: "private.playback.token" };
      }
    },
    config: {
      scanUrl: "https://scanner.example/scan",
      deliverySecret: "video-safety-delivery-secret-32-characters-minimum"
    },
    fetchImpl: async () => {
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeRequests -= 1;
      return new Response(JSON.stringify({ submitted: true }), { status: 202 });
    }
  });

  const result = await dispatcher.processOnce();

  assert.equal(dispatcher.concurrency, 3);
  assert.equal(result.claimed, 8);
  assert.equal(result.submitted, 8);
  assert.equal(completed, 8);
  assert.equal(peakRequests, 3);
});
