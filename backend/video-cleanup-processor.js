"use strict";

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
    : fallback;
}

function createVideoCleanupProcessor(options = {}) {
  const store = options.store;
  const streamClient = options.streamClient;
  const logger = typeof options.logger === "function" ? options.logger : () => {};
  const workerId = cleanText(options.workerId || `${process.pid}:video-cleanup`, 120);
  const batchSize = clampInteger(options.batchSize, 1, 100, 25);
  const failedRetentionDays = clampInteger(options.failedRetentionDays, 1, 365, 7);
  const retryAfterSeconds = clampInteger(options.retryAfterSeconds, 30, 86400, 3600);
  const leaseSeconds = clampInteger(options.leaseSeconds, 30, 3600, 600);
  const maxAttempts = clampInteger(options.maxAttempts, 1, 20, 8);
  const requestTimeoutMs = clampInteger(options.requestTimeoutMs, 1000, 120000, 15000);
  let running = false;
  let accepting = true;

  function isConfigured() {
    return Boolean(store?.claimVideoCleanupBatch && store?.completeVideoCleanup
      && streamClient?.isConfigured?.() && streamClient?.deleteVideo);
  }

  async function deleteProviderVideo(providerId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await streamClient.deleteVideo(providerId, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function complete(job, outcome) {
    return store.completeVideoCleanup(job.providerId, {
      ...outcome,
      workerId: cleanText(job.lockedBy || workerId, 120),
      attempts: job.attempts,
      maxAttempts: job.maxAttempts
    });
  }

  async function processOnce() {
    if (running || !accepting || !isConfigured()) {
      return { claimed: 0, deleted: 0, failed: 0, dead: 0, leaseLost: 0 };
    }
    running = true;
    const totals = { claimed: 0, deleted: 0, failed: 0, dead: 0, leaseLost: 0 };
    try {
      const jobs = await store.claimVideoCleanupBatch({
        limit: batchSize,
        failedRetentionDays,
        retryAfterSeconds,
        leaseSeconds,
        maxAttempts,
        workerId
      });
      totals.claimed = jobs.length;
      for (const job of jobs) {
        try {
          await deleteProviderVideo(job.providerId);
          const completed = await complete(job, { deleted: true });
          if (completed?.deleted) totals.deleted += 1;
          else totals.leaseLost += 1;
        } catch (error) {
          if (Number(error?.status || 0) === 404) {
            const completed = await complete(job, { deleted: true });
            if (completed?.deleted) totals.deleted += 1;
            else totals.leaseLost += 1;
            continue;
          }
          const completed = await complete(job, {
            deleted: false,
            error: cleanText(error?.message || error || "Video cleanup failed.", 500)
          });
          if (!completed?.retryScheduled && !completed?.dead) totals.leaseLost += 1;
          else if (completed.dead) totals.dead += 1;
          else totals.failed += 1;
        }
      }
      if (totals.claimed > 0) {
        logger(totals.failed > 0 || totals.dead > 0 ? "warn" : "info", "video_cleanup_batch", {
          workerId,
          ...totals
        });
      }
      return totals;
    } finally {
      running = false;
    }
  }

  function stop() {
    accepting = false;
  }

  return {
    isConfigured,
    isRunning: () => running,
    processOnce,
    stop,
    workerId
  };
}

module.exports = { createVideoCleanupProcessor };