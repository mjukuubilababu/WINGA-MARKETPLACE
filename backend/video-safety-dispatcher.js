"use strict";

const { signVideoSafetyPayload } = require("./video-safety");

function cleanText(value, maxLength = 500) { return String(value || "").trim().slice(0, maxLength); }
function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed))) : fallback;
}
async function readLimitedText(response, maxBytes = 8192) {
  return String(await response.text() || "").slice(0, maxBytes);
}

function createVideoSafetyDispatcher(options = {}) {
  const store = options.store;
  const streamClient = options.streamClient;
  const config = options.config || {};
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logger = typeof options.logger === "function" ? options.logger : () => {};
  const workerId = cleanText(options.workerId || `${process.pid}:video-safety`, 120);
  const intervalMs = clampInteger(options.intervalMs, 5000, 30 * 60 * 1000, 30000);
  const batchSize = clampInteger(options.batchSize, 1, 100, 10);
  const requestTimeoutMs = clampInteger(options.requestTimeoutMs, 1000, 60000, 10000);
  let timer = null;
  let running = false;
  let stopped = true;

  function isConfigured() {
    return Boolean(store?.claimVideoSafetyBatch && store?.completeVideoSafetyDelivery
      && streamClient?.isConfigured?.() && streamClient?.createPlaybackToken
      && /^https:\/\//i.test(cleanText(config.scanUrl, 2048))
      && cleanText(config.deliverySecret, 512).length >= 32
      && typeof fetchImpl === "function");
  }

  async function dispatch(job) {
    const providerId = cleanText(job?.providerId, 64);
    const idempotencyKey = cleanText(job?.idempotencyKey, 160);
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(providerId) || idempotencyKey !== `video-safety:${providerId}`) {
      throw new Error("Video safety job identity is invalid.");
    }
    const playback = await streamClient.createPlaybackToken(providerId);
    const customerCode = cleanText(playback?.customerCode, 128);
    const token = cleanText(playback?.token, 8192);
    if (!/^[a-zA-Z0-9-]{4,128}$/.test(customerCode) || !token) {
      throw new Error("Cloudflare Stream returned incomplete private playback credentials.");
    }
    const body = JSON.stringify({
      version: "video-safety-scan-v1",
      providerId,
      idempotencyKey,
      mediaUrl: `https://customer-${customerCode}.cloudflarestream.com/${encodeURIComponent(token)}/manifest/video.m3u8`
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(config.scanUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Winga-Video-Safety-Timestamp": timestamp,
          "X-Winga-Video-Safety-Signature": `sha256=${signVideoSafetyPayload(timestamp, body, config.deliverySecret)}`,
          "User-Agent": "winga-video-safety-dispatcher/1"
        },
        body,
        signal: controller.signal
      });
      const responseText = await readLimitedText(response);
      let providerResponse = {};
      try { providerResponse = responseText ? JSON.parse(responseText) : {}; } catch {}
      if (!response.ok || providerResponse?.submitted !== true) {
        throw new Error(`Video safety adapter rejected delivery with HTTP ${response.status}.`);
      }
      return { submitted: true };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function processOnce() {
    if (running || stopped || !isConfigured()) return { claimed: 0, submitted: 0, failed: 0 };
    running = true;
    const totals = { claimed: 0, submitted: 0, failed: 0 };
    try {
      const jobs = await store.claimVideoSafetyBatch({ limit: batchSize, workerId });
      totals.claimed = jobs.length;
      for (const job of jobs) {
        try {
          const outcome = await dispatch(job);
          await store.completeVideoSafetyDelivery(job.providerId, { ...outcome, attempts: job.attempts, maxAttempts: job.maxAttempts });
          totals.submitted += 1;
        } catch (error) {
          await store.completeVideoSafetyDelivery(job.providerId, {
            submitted: false,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            error: cleanText(error?.message || error || "Video safety delivery failed.", 500)
          });
          totals.failed += 1;
        }
      }
      if (totals.claimed > 0) logger(totals.failed > 0 ? "warn" : "info", "video_safety_delivery_batch", totals);
      return totals;
    } finally {
      running = false;
    }
  }

  function start() {
    if (!isConfigured() || timer) return false;
    stopped = false;
    void processOnce();
    timer = setInterval(() => { void processOnce(); }, intervalMs);
    timer.unref?.();
    return true;
  }
  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }
  return { dispatch, isConfigured, isRunning: () => running, processOnce, start, stop };
}

module.exports = { createVideoSafetyDispatcher };