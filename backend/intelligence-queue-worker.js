const { createPostgresStore } = require("./db");

const DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_SSL = String(process.env.DATABASE_SSL || "").toLowerCase() === "true";
const WORKER_ID = process.env.INTELLIGENCE_QUEUE_WORKER_ID || `winga-intelligence-worker-${process.pid}`;
const BATCH_SIZE = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_QUEUE_BATCH_SIZE || 50) || 50, 100));
const INTERVAL_MS = Math.max(1000, Math.min(Number(process.env.INTELLIGENCE_QUEUE_INTERVAL_MS || 5000) || 5000, 60000));
const MAX_ATTEMPTS = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_QUEUE_MAX_ATTEMPTS || 12) || 12, 50));
const STALE_SECONDS = Math.max(60, Math.min(Number(process.env.INTELLIGENCE_QUEUE_STALE_SECONDS || 300) || 300, 86400));
const COMPLETED_RETENTION_HOURS = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_QUEUE_COMPLETED_RETENTION_HOURS || 72) || 72, 24 * 90));
const RUN_ONCE = process.argv.includes("--once") || process.env.INTELLIGENCE_QUEUE_RUN_ONCE === "true";

if (!DATABASE_URL) {
  console.error("[WINGA] DATABASE_URL is required for the intelligence queue worker.");
  process.exit(1);
}

const store = createPostgresStore({
  databaseUrl: DATABASE_URL,
  ssl: DATABASE_SSL
});

const state = {
  running: false,
  processed: 0,
  failed: 0,
  recovered: 0,
  pruned: 0,
  lastMaintenanceAt: 0
};

async function runMaintenance() {
  const recovery = await store.recoverStaleIntelligenceQueueJobs({
    staleSeconds: STALE_SECONDS
  });
  state.recovered += Number(recovery?.recovered || 0);

  const now = Date.now();
  if (!state.lastMaintenanceAt || now - state.lastMaintenanceAt > 60 * 60 * 1000) {
    const prune = await store.pruneCompletedIntelligenceQueueJobs({
      retentionHours: COMPLETED_RETENTION_HOURS
    });
    state.pruned += Number(prune?.pruned || 0);
    state.lastMaintenanceAt = now;
  }
}

async function processOnce() {
  if (state.running) {
    return;
  }
  state.running = true;
  try {
    await runMaintenance();
    const jobs = await store.claimIntelligenceQueueBatch({
      limit: BATCH_SIZE,
      workerId: WORKER_ID
    });
    for (const job of jobs) {
      try {
        await store.appendIntelligenceEvent(job.event, job.scores);
        await store.completeIntelligenceQueueItem(job.queueId);
        state.processed += 1;
      } catch (error) {
        await store.failIntelligenceQueueItem(job.queueId, error, {
          attempts: job.attempts,
          maxAttempts: MAX_ATTEMPTS
        });
        state.failed += 1;
        console.warn("[WINGA] Intelligence queue job failed.", {
          queueId: job.queueId,
          eventId: job.eventId,
          message: error?.message || String(error)
        });
      }
    }
    if (jobs.length || RUN_ONCE) {
      const health = await store.readIntelligenceQueueHealth();
      console.log("[WINGA] Intelligence queue worker tick", {
        workerId: WORKER_ID,
        claimed: jobs.length,
        processed: state.processed,
        failed: state.failed,
        recovered: state.recovered,
        pruned: state.pruned,
        health
      });
    }
  } finally {
    state.running = false;
  }
}

async function shutdown(signal = "exit") {
  console.log("[WINGA] Intelligence queue worker stopping", { signal, state });
  await store.close?.();
}

async function main() {
  await store.init();
  await processOnce();
  if (RUN_ONCE) {
    await shutdown("once");
    return;
  }
  const timer = setInterval(() => {
    processOnce().catch((error) => {
      state.failed += 1;
      console.warn("[WINGA] Intelligence queue worker tick failed.", error);
    });
  }, INTERVAL_MS);

  process.on("SIGTERM", async () => {
    clearInterval(timer);
    await shutdown("SIGTERM");
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    clearInterval(timer);
    await shutdown("SIGINT");
    process.exit(0);
  });
}

main().catch(async (error) => {
  console.error("[WINGA] Intelligence queue worker crashed.", error);
  await store.close?.().catch(() => {});
  process.exit(1);
});
