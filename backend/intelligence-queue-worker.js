const { createPostgresStore } = require("./db");
const { learnFromObservation } = require("./wip-mind");

const DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_SSL = String(process.env.DATABASE_SSL || "").toLowerCase() === "true";
const WORKER_ID = process.env.INTELLIGENCE_QUEUE_WORKER_ID || `winga-intelligence-worker-${process.pid}`;
const BATCH_SIZE = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_QUEUE_BATCH_SIZE || 50) || 50, 100));
const INTERVAL_MS = Math.max(1000, Math.min(Number(process.env.INTELLIGENCE_QUEUE_INTERVAL_MS || 5000) || 5000, 60000));
const MAX_ATTEMPTS = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_QUEUE_MAX_ATTEMPTS || 12) || 12, 50));
const STALE_SECONDS = Math.max(60, Math.min(Number(process.env.INTELLIGENCE_QUEUE_STALE_SECONDS || 300) || 300, 86400));
const COMPLETED_RETENTION_HOURS = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_QUEUE_COMPLETED_RETENTION_HOURS || 72) || 72, 24 * 90));
const INTELLIGENCE_RAW_EVENT_RETENTION_DAYS = Math.max(7, Math.min(Number(process.env.INTELLIGENCE_RAW_EVENT_RETENTION_DAYS || 180) || 180, 3650));
const DEMAND_RAW_EVENT_RETENTION_DAYS = Math.max(30, Math.min(Number(process.env.DEMAND_RAW_EVENT_RETENTION_DAYS || 730) || 730, 3650));
const SEARCH_DEMAND_RAW_EVENT_RETENTION_DAYS = Math.max(7, Math.min(Number(process.env.SEARCH_DEMAND_RAW_EVENT_RETENTION_DAYS || 365) || 365, 3650));
const INTELLIGENCE_SNAPSHOT_WINDOW_DAYS = Math.max(1, Math.min(Number(process.env.INTELLIGENCE_SNAPSHOT_WINDOW_DAYS || 14) || 14, 90));
const INTELLIGENCE_SNAPSHOT_RETENTION_DAYS = Math.max(30, Math.min(Number(process.env.INTELLIGENCE_SNAPSHOT_RETENTION_DAYS || 1095) || 1095, 3650));
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
  signalsGenerated: 0,
  learnerFailures: 0,
  recovered: 0,
  pruned: 0,
  rawPruned: {
    intelligenceEvents: 0,
    demandEvents: 0,
    searchDemandEvents: 0
  },
  snapshots: {
    eventTypes: 0,
    demandProducts: 0,
    searchQueries: 0,
    prunedSnapshots: 0
  },
  decisions: {
    relationships: 0,
    forecasts: 0,
    sellerRecommendations: 0,
    buyerRecommendations: 0,
    productScores: 0,
    sellerScores: 0
  },
  lastMaintenanceAt: 0
};
let signalCircuitOpenUntil = 0;

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
    if (store.refreshIntelligenceDailySnapshots) {
      const snapshots = await store.refreshIntelligenceDailySnapshots({
        windowDays: INTELLIGENCE_SNAPSHOT_WINDOW_DAYS,
        retentionDays: INTELLIGENCE_SNAPSHOT_RETENTION_DAYS
      });
      state.snapshots.eventTypes += Number(snapshots?.eventTypes || 0);
      state.snapshots.demandProducts += Number(snapshots?.demandProducts || 0);
      state.snapshots.searchQueries += Number(snapshots?.searchQueries || 0);
      state.snapshots.prunedSnapshots += Number(snapshots?.prunedSnapshots || 0);
    }
    if (store.refreshIntelligenceDecisionOutputs) {
      const decisions = await store.refreshIntelligenceDecisionOutputs({
        windowDays: INTELLIGENCE_SNAPSHOT_WINDOW_DAYS
      });
      state.decisions.relationships += Number(decisions?.relationships || 0);
      state.decisions.forecasts += Number(decisions?.forecasts || 0);
      state.decisions.sellerRecommendations += Number(decisions?.sellerRecommendations || 0);
      state.decisions.buyerRecommendations += Number(decisions?.buyerRecommendations || 0);
      state.decisions.productScores += Number(decisions?.productScores || 0);
      state.decisions.sellerScores += Number(decisions?.sellerScores || 0);
    }
    if (store.pruneIntelligenceRawEvents) {
      const rawPrune = await store.pruneIntelligenceRawEvents({
        intelligenceDays: INTELLIGENCE_RAW_EVENT_RETENTION_DAYS,
        demandDays: DEMAND_RAW_EVENT_RETENTION_DAYS,
        searchDays: SEARCH_DEMAND_RAW_EVENT_RETENTION_DAYS
      });
      state.rawPruned.intelligenceEvents += Number(rawPrune?.intelligenceEvents || 0);
      state.rawPruned.demandEvents += Number(rawPrune?.demandEvents || 0);
      state.rawPruned.searchDemandEvents += Number(rawPrune?.searchDemandEvents || 0);
    }
    if (store.pruneIntelligenceScorePersistence) {
      await store.pruneIntelligenceScorePersistence();
    }
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
        try {
          if (Date.now() < signalCircuitOpenUntil) throw Object.assign(new Error("WIP signal circuit is open."), { code: "learner_circuit_open" });
          const learned = learnFromObservation(job.event);
          const persisted = await store.appendIntelligenceSignals(learned.signals);
          state.signalsGenerated += Number(persisted?.inserted || 0);
        } catch (learnerError) {
          state.learnerFailures += 1;
          if (learnerError?.code !== "learner_circuit_open") {
            signalCircuitOpenUntil = Date.now() + 60_000;
            await store.recordIntelligenceLearnerFailure?.("wip_signal_pipeline", learnerError, {
              circuitSeconds: Math.max(1, Math.ceil((signalCircuitOpenUntil - Date.now()) / 1000))
            }).catch(() => {});
          }
          console.warn("[WINGA] WIP learner failed open.", {
            eventId: job.eventId,
            code: String(learnerError?.code || "learner_failed").slice(0, 80)
          });
        }
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
        signalsGenerated: state.signalsGenerated,
        learnerFailures: state.learnerFailures,
        recovered: state.recovered,
        pruned: state.pruned,
        rawPruned: state.rawPruned,
        snapshots: state.snapshots,
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
