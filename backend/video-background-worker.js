"use strict";

const crypto = require("crypto");
const os = require("os");
const { createPostgresStore } = require("./db");
const { createCloudflareStreamClient, readCloudflareStreamConfig } = require("./cloudflare-stream");
const { readVideoSafetyConfig } = require("./video-safety");
const { createVideoSafetyDispatcher } = require("./video-safety-dispatcher");
const { createVideoCleanupProcessor } = require("./video-cleanup-processor");

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
    : fallback;
}

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function logStructured(level, event, detail = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...detail });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function createWorkerId(env = process.env) {
  const configured = cleanText(env.VIDEO_BACKGROUND_WORKER_ID, 120);
  if (configured) return configured;
  const service = cleanText(env.RENDER_SERVICE_ID || "winga-video", 40);
  const instance = cleanText(env.RENDER_INSTANCE_ID || os.hostname(), 50);
  return cleanText(`${service}:${instance}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`, 120);
}

function createVideoBackgroundWorker(options = {}) {
  const store = options.store;
  const streamClient = options.streamClient;
  const safetyConfig = options.safetyConfig || {};
  const workerId = cleanText(options.workerId || createWorkerId(options.env), 120);
  const logger = typeof options.logger === "function" ? options.logger : logStructured;
  const intervalMs = clampInteger(options.intervalMs, 1000, 60000, 30000);
  const cleanupIntervalMs = clampInteger(options.cleanupIntervalMs, 60000, 24 * 60 * 60 * 1000, 10 * 60 * 1000);
  const heartbeatIntervalMs = clampInteger(options.heartbeatIntervalMs, 5000, 60000, 15000);
  const shutdownGraceMs = clampInteger(options.shutdownGraceMs, 1000, 120000, 25000);
  const safetyBatchSize = clampInteger(options.safetyBatchSize, 1, 100, 10);
  const safetyConcurrency = clampInteger(options.safetyConcurrency, 1, 10, 3);
  const maxSafetyBatchesPerTick = clampInteger(options.maxSafetyBatchesPerTick, 1, 20, 4);
  const tickBudgetMs = clampInteger(options.tickBudgetMs, 5000, 120000, 25000);
  const batchYieldMs = clampInteger(options.batchYieldMs, 0, 1000, 25);
  const pressureIntervalMs = clampInteger(options.pressureIntervalMs, 250, 5000, 1000);
  const pollJitterMs = clampInteger(options.pollJitterMs, 0, 10000, 500);
  const safetyDispatcher = options.safetyDispatcher || createVideoSafetyDispatcher({
    store,
    streamClient,
    config: safetyConfig,
    workerId: `${workerId}:safety`,
    intervalMs,
    batchSize: safetyBatchSize,
    concurrency: safetyConcurrency,
    requestTimeoutMs: options.safetyRequestTimeoutMs,
    leaseSeconds: options.safetyLeaseSeconds,
    logger
  });
  const cleanupProcessor = options.cleanupProcessor || createVideoCleanupProcessor({
    store,
    streamClient,
    workerId: `${workerId}:cleanup`,
    batchSize: options.cleanupBatchSize,
    failedRetentionDays: options.failedRetentionDays,
    retryAfterSeconds: options.cleanupRetrySeconds,
    leaseSeconds: options.cleanupLeaseSeconds,
    maxAttempts: options.cleanupMaxAttempts,
    requestTimeoutMs: options.cleanupRequestTimeoutMs,
    logger
  });
  const state = {
    startedAt: "",
    lastTickAt: "",
    lastSuccessAt: "",
    lastFailureAt: "",
    lastCleanupAt: 0,
    ticks: 0,
    claimed: 0,
    completed: 0,
    failed: 0,
    dead: 0,
    leaseLost: 0,
    safetyBatches: 0,
    saturatedTicks: 0,
    lastSafetyFailureCode: ""
  };
  let timer = null;
  let heartbeatTimer = null;
  let running = false;
  let stopping = false;
  let startPromise = null;

  function heartbeatPayload(status) {
    return {
      status,
      safetyConfigured: safetyDispatcher.isConfigured(),
      cleanupConfigured: cleanupProcessor.isConfigured(),
      ticks: state.ticks,
      claimed: state.claimed,
      completed: state.completed,
      failed: state.failed,
      dead: state.dead,
      leaseLost: state.leaseLost,
      safetyBatches: state.safetyBatches,
      saturatedTicks: state.saturatedTicks,
      safetyConcurrency,
      maxSafetyBatchesPerTick,
      tickBudgetMs,
      pressureIntervalMs,
      pollJitterMs,
      lastSafetyFailureCode: state.lastSafetyFailureCode,
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: state.lastFailureAt
    };
  }

  async function heartbeat(status = running ? "processing" : "idle") {
    if (!store?.heartbeatVideoWorker) return null;
    return store.heartbeatVideoWorker(workerId, heartbeatPayload(status));
  }

  async function drainSafetyQueue() {
    const totals = {
      claimed: 0,
      submitted: 0,
      failed: 0,
      leaseLost: 0,
      batches: 0,
      saturated: false,
      budgetExhausted: false
    };
    const deadline = Date.now() + tickBudgetMs;
    while (totals.batches < maxSafetyBatchesPerTick) {
      const batch = await safetyDispatcher.processOnce();
      totals.batches += 1;
      totals.claimed += Number(batch?.claimed || 0);
      totals.submitted += Number(batch?.submitted || 0);
      totals.failed += Number(batch?.failed || 0);
      totals.leaseLost += Number(batch?.leaseLost || 0);
      if (Number(batch?.claimed || 0) < safetyBatchSize) break;
      if (Date.now() >= deadline) {
        totals.budgetExhausted = true;
        break;
      }
      if (totals.batches < maxSafetyBatchesPerTick && batchYieldMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchYieldMs));
      }
    }
    totals.saturated = totals.batches >= maxSafetyBatchesPerTick
      && totals.claimed >= safetyBatchSize * totals.batches;
    return totals;
  }

  async function processOnce(options = {}) {
    if (running || stopping) return { skipped: true, safety: null, cleanup: null };
    running = true;
    state.ticks += 1;
    state.lastTickAt = new Date().toISOString();
    try {
      await heartbeat("processing");
      const safety = await drainSafetyQueue();
      const now = Date.now();
      const cleanupDue = options.forceCleanup === true || !state.lastCleanupAt
        || now - state.lastCleanupAt >= cleanupIntervalMs;
      const cleanup = cleanupDue ? await cleanupProcessor.processOnce() : null;
      if (cleanupDue) state.lastCleanupAt = now;
      state.claimed += Number(safety?.claimed || 0) + Number(cleanup?.claimed || 0);
      state.completed += Number(safety?.submitted || 0) + Number(cleanup?.deleted || 0);
      state.failed += Number(safety?.failed || 0) + Number(cleanup?.failed || 0);
      state.dead += Number(cleanup?.dead || 0);
      state.leaseLost += Number(safety?.leaseLost || 0) + Number(cleanup?.leaseLost || 0);
      state.safetyBatches += Number(safety?.batches || 0);
      const safetyFailureCodes = Object.keys(safety?.failureCodes || {}).sort();
      state.lastSafetyFailureCode = safetyFailureCodes[0] || "";
      if (safety?.saturated || safety?.budgetExhausted) state.saturatedTicks += 1;
      state.lastSuccessAt = new Date().toISOString();
      await heartbeat("idle");
      if (Number(safety?.claimed || 0) + Number(cleanup?.claimed || 0) > 0) {
        const tickFailed = Number(safety?.failed || 0) + Number(cleanup?.failed || 0);
        logger(tickFailed > 0 || Number(cleanup?.dead || 0) > 0 ? "warn" : "info", "video_background_worker_tick", {
          workerId,
          safety,
          cleanup,
          totals: heartbeatPayload("idle")
        });
      }
      return { skipped: false, safety, cleanup };
    } catch (error) {
      state.failed += 1;
      state.lastFailureAt = new Date().toISOString();
      logger("error", "video_background_worker_tick_failed", {
        workerId,
        error: cleanText(error?.message || error || "Unknown video worker error", 500)
      });
      await heartbeat("degraded").catch(() => {});
      throw error;
    } finally {
      running = false;
    }
  }

  function scheduleNextTick(delayMs = intervalMs) {
    if (stopping) return;
    const jitterMs = pollJitterMs > 0 ? Math.floor(Math.random() * (pollJitterMs + 1)) : 0;
    timer = setTimeout(() => {
      timer = null;
      processOnce().then((result) => {
        const underPressure = Boolean(result?.safety?.saturated || result?.safety?.budgetExhausted);
        scheduleNextTick(underPressure ? pressureIntervalMs : intervalMs);
      }).catch(() => {
        scheduleNextTick(intervalMs);
      });
    }, delayMs + jitterMs);
  }

  async function start(options = {}) {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      if (!store?.init || !cleanupProcessor.isConfigured()) {
        throw new Error("Video background worker requires PostgreSQL and Cloudflare Stream.");
      }
      await store.init();
      state.startedAt = new Date().toISOString();
      await heartbeat("starting");
      if (options.runOnce !== true) {
        heartbeatTimer = setInterval(() => {
          heartbeat(running ? "processing" : "idle").catch((error) => {
            logger("warn", "video_worker_heartbeat_failed", {
              workerId,
              error: cleanText(error?.message || error || "Heartbeat failed", 300)
            });
          });
        }, heartbeatIntervalMs);
      }
      try {
        await processOnce({ forceCleanup: true });
      } catch (error) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        throw error;
      }
      if (options.runOnce === true) return;
      scheduleNextTick(intervalMs);
    })();
    return startPromise;
  }

  async function stop(signal = "shutdown") {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    timer = null;
    heartbeatTimer = null;
    safetyDispatcher.stop();
    cleanupProcessor.stop();
    const deadline = Date.now() + shutdownGraceMs;
    while (running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await store?.removeVideoWorkerHeartbeat?.(workerId).catch(() => {});
    await store?.close?.();
    logger("info", "video_background_worker_stopped", { workerId, signal, state });
  }

  return {
    heartbeat,
    isRunning: () => running,
    processOnce,
    start,
    state,
    stop,
    workerId
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the video background worker.");
  const store = createPostgresStore({
    databaseUrl,
    ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true"
  });
  const streamClient = createCloudflareStreamClient({ config: readCloudflareStreamConfig() });
  const worker = createVideoBackgroundWorker({
    store,
    streamClient,
    safetyConfig: readVideoSafetyConfig(),
    workerId: createWorkerId(),
    intervalMs: process.env.VIDEO_BACKGROUND_INTERVAL_MS,
    cleanupIntervalMs: process.env.VIDEO_CLEANUP_SWEEP_INTERVAL_MS,
    heartbeatIntervalMs: process.env.VIDEO_WORKER_HEARTBEAT_INTERVAL_MS,
    shutdownGraceMs: process.env.SHUTDOWN_GRACE_MS,
    safetyBatchSize: process.env.VIDEO_SAFETY_DISPATCH_BATCH_SIZE,
    safetyConcurrency: process.env.VIDEO_SAFETY_DISPATCH_CONCURRENCY,
    safetyRequestTimeoutMs: process.env.VIDEO_SAFETY_DISPATCH_TIMEOUT_MS,
    safetyLeaseSeconds: process.env.VIDEO_SAFETY_LEASE_SECONDS,
    maxSafetyBatchesPerTick: process.env.VIDEO_WORKER_MAX_SAFETY_BATCHES_PER_TICK,
    tickBudgetMs: process.env.VIDEO_WORKER_TICK_BUDGET_MS,
    batchYieldMs: process.env.VIDEO_WORKER_BATCH_YIELD_MS,
    pressureIntervalMs: process.env.VIDEO_WORKER_PRESSURE_INTERVAL_MS,
    pollJitterMs: process.env.VIDEO_WORKER_POLL_JITTER_MS,
    cleanupBatchSize: process.env.VIDEO_CLEANUP_SWEEP_BATCH_SIZE,
    failedRetentionDays: process.env.VIDEO_FAILED_RETENTION_DAYS,
    cleanupRetrySeconds: process.env.VIDEO_CLEANUP_RETRY_SECONDS,
    cleanupLeaseSeconds: process.env.VIDEO_CLEANUP_LEASE_SECONDS,
    cleanupMaxAttempts: process.env.VIDEO_CLEANUP_MAX_ATTEMPTS,
    cleanupRequestTimeoutMs: process.env.VIDEO_CLEANUP_REQUEST_TIMEOUT_MS
  });
  const runOnce = process.argv.includes("--once") || process.env.VIDEO_BACKGROUND_RUN_ONCE === "true";
  const shutdown = async (signal) => {
    await worker.stop(signal);
    process.exit(0);
  };
  process.once("SIGTERM", () => { shutdown("SIGTERM").catch(() => process.exit(1)); });
  process.once("SIGINT", () => { shutdown("SIGINT").catch(() => process.exit(1)); });
  await worker.start({ runOnce });
  if (runOnce) await worker.stop("once");
}

if (require.main === module) {
  main().catch((error) => {
    logStructured("error", "video_background_worker_crashed", {
      error: cleanText(error?.message || error || "Unknown startup error", 500)
    });
    process.exit(1);
  });
}

module.exports = { createVideoBackgroundWorker, createWorkerId };