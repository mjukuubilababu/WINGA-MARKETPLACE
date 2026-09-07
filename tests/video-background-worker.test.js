"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createVideoCleanupProcessor } = require("../backend/video-cleanup-processor");
const { createVideoBackgroundWorker } = require("../backend/video-background-worker");

const root = path.resolve(__dirname, "..");

test("video cleanup processor uses bounded lease-owned jobs", async () => {
  const claims = [];
  const completions = [];
  const deletes = [];
  const processor = createVideoCleanupProcessor({
    workerId: "worker-a:cleanup",
    batchSize: 500,
    maxAttempts: 99,
    leaseSeconds: 5,
    requestTimeoutMs: 1000,
    store: {
      async claimVideoCleanupBatch(options) {
        claims.push(options);
        return [{
          providerId: "stream-cleanup-1",
          lockedBy: "worker-a:cleanup",
          attempts: 2,
          maxAttempts: 8
        }];
      },
      async completeVideoCleanup(providerId, outcome) {
        completions.push({ providerId, outcome });
        return { deleted: true, retryScheduled: false, dead: false };
      }
    },
    streamClient: {
      isConfigured: () => true,
      async deleteVideo(providerId, options) {
        deletes.push({ providerId, signal: options.signal });
        return true;
      }
    }
  });

  const result = await processor.processOnce();

  assert.equal(result.claimed, 1);
  assert.equal(result.deleted, 1);
  assert.equal(claims[0].limit, 100);
  assert.equal(claims[0].maxAttempts, 20);
  assert.equal(claims[0].leaseSeconds, 30);
  assert.equal(claims[0].workerId, "worker-a:cleanup");
  assert.equal(deletes[0].signal instanceof AbortSignal, true);
  assert.equal(completions[0].outcome.workerId, "worker-a:cleanup");
  assert.equal(completions[0].outcome.attempts, 2);
});

test("video cleanup treats a missing provider object as an idempotent success", async () => {
  let completed = 0;
  const processor = createVideoCleanupProcessor({
    workerId: "worker-b:cleanup",
    store: {
      async claimVideoCleanupBatch() {
        return [{ providerId: "stream-cleanup-404", lockedBy: "worker-b:cleanup", attempts: 1, maxAttempts: 8 }];
      },
      async completeVideoCleanup(_providerId, outcome) {
        assert.equal(outcome.deleted, true);
        completed += 1;
        return { deleted: true, retryScheduled: false, dead: false };
      }
    },
    streamClient: {
      isConfigured: () => true,
      async deleteVideo() {
        throw Object.assign(new Error("already deleted"), { status: 404 });
      }
    }
  });

  const result = await processor.processOnce();
  assert.equal(result.deleted, 1);
  assert.equal(completed, 1);
});

test("standalone video worker reports capacity and drains without API ownership", async () => {
  const events = [];
  let initialized = 0;
  let closed = 0;
  const safetyDispatcher = {
    isConfigured: () => true,
    async processOnce() { return { claimed: 2, submitted: 2, failed: 0, leaseLost: 0 }; },
    stop() { events.push("safety-stopped"); }
  };
  const cleanupProcessor = {
    isConfigured: () => true,
    async processOnce() { return { claimed: 1, deleted: 1, failed: 0, dead: 0, leaseLost: 0 }; },
    stop() { events.push("cleanup-stopped"); }
  };
  const store = {
    async init() { initialized += 1; },
    async heartbeatVideoWorker(workerId, metrics) { events.push({ workerId, status: metrics.status }); },
    async removeVideoWorkerHeartbeat(workerId) { events.push({ removed: workerId }); },
    async close() { closed += 1; }
  };
  const worker = createVideoBackgroundWorker({
    store,
    streamClient: {},
    safetyDispatcher,
    cleanupProcessor,
    workerId: "video-worker-1",
    logger: () => {}
  });

  await worker.start({ runOnce: true });
  await worker.stop("test");

  assert.equal(initialized, 1);
  assert.equal(worker.state.claimed, 3);
  assert.equal(worker.state.completed, 3);
  assert.equal(events.some((entry) => entry?.status === "processing"), true);
  assert.equal(events.some((entry) => entry?.status === "idle"), true);
  assert.equal(events.some((entry) => entry?.removed === "video-worker-1"), true);
  assert.equal(closed, 1);
});

test("main API owns video HTTP contracts but not video background processors", () => {
  const serverSource = fs.readFileSync(path.join(root, "backend", "server.js"), "utf8");
  const workerSource = fs.readFileSync(path.join(root, "backend", "video-background-worker.js"), "utf8");

  assert.match(serverSource, /enqueueVideoSafetyJob/);
  assert.match(serverSource, /applyVideoUploadWebhook/);
  assert.doesNotMatch(serverSource, /createVideoSafetyDispatcher/);
  assert.doesNotMatch(serverSource, /startVideoCleanupSweeper/);
  assert.match(workerSource, /createVideoSafetyDispatcher/);
  assert.match(workerSource, /createVideoCleanupProcessor/);
  assert.match(workerSource, /heartbeatVideoWorker/);
});