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

function classifyVideoSafetyDeliveryError(error) {
  const code = cleanText(error?.code, 80).toLowerCase();
  const status = Number(error?.status || 0);
  const providerStatus = Number(error?.providerStatus || 0);
  const message = cleanText(error?.message || error, 500).toLowerCase();
  if (error?.name === "AbortError" || /abort|timed? out|timeout/.test(message)) return "adapter_timeout";
  if (code === "video_safety_provider_rejected") {
    if (providerStatus === 401 || providerStatus === 403) return "hive_provider_auth_rejected";
    if (providerStatus === 429) return "hive_provider_rate_limited";
    if (providerStatus >= 500) return "hive_provider_unavailable";
    return "hive_provider_request_rejected";
  }
  if (code === "stream_signing_key_invalid") return "stream_signing_key_invalid";
  if (code === "stream_customer_code_missing") return "stream_customer_code_missing";
  if (code === "stream_invalid_provider_response") return "stream_invalid_provider_response";
  if (code === "stream_not_configured") return "stream_not_configured";
  if (code === "stream_provider_error") {
    if (status === 401 || status === 403) return "stream_provider_auth_rejected";
    if (status === 404) return "stream_video_not_found";
    if (status === 429) return "stream_provider_rate_limited";
    if (status >= 500) return "stream_provider_unavailable";
    return "stream_provider_request_rejected";
  }
  const adapterStatus = Number(message.match(/adapter rejected delivery with http (\d{3})/)?.[1] || 0);
  if (adapterStatus === 401 || adapterStatus === 403) return "adapter_signature_rejected";
  if (adapterStatus === 400 || adapterStatus === 422) return "adapter_payload_rejected";
  if (adapterStatus === 429) return "adapter_rate_limited";
  if (adapterStatus >= 500) return "adapter_provider_unavailable";
  if (/fetch failed|network|socket|econn|enotfound/.test(message)) return "adapter_network_error";
  return "video_safety_delivery_failed";
}

function serializeVideoSafetyDeliveryError(error) {
  const code = classifyVideoSafetyDeliveryError(error);
  const message = cleanText(error?.message || error || "Video safety delivery failed.", 400);
  return `${code}:${message}`.slice(0, 500);
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
  const leaseSeconds = clampInteger(options.leaseSeconds, 30, 3600, 600);
  const concurrency = clampInteger(options.concurrency, 1, 10, 3);
  let timer = null;
  let running = false;
  let stopped = false;

  function isConfigured() {
    return Boolean(store?.claimVideoSafetyBatch && store?.completeVideoSafetyDelivery
      && streamClient?.isConfigured?.() && streamClient?.createPlaybackToken
      && cleanText(streamClient?.config?.customerCode, 128)
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
        const error = new Error(`Video safety adapter rejected delivery with HTTP ${response.status}.`);
        error.code = providerResponse?.error === "provider_rejected"
          ? "video_safety_provider_rejected"
          : "video_safety_adapter_rejected";
        error.status = response.status;
        error.providerStatus = Number(providerResponse?.providerStatus || 0);
        throw error;
      }
      return { submitted: true };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function processOnce() {
    if (running || stopped || !isConfigured()) return { claimed: 0, submitted: 0, failed: 0, leaseLost: 0, failureCodes: {} };
    running = true;
    const totals = { claimed: 0, submitted: 0, failed: 0, leaseLost: 0, failureCodes: {} };
    try {
      const jobs = await store.claimVideoSafetyBatch({ limit: batchSize, workerId, leaseSeconds });
      totals.claimed = jobs.length;
      let nextJobIndex = 0;
      const processClaimedJob = async () => {
        while (nextJobIndex < jobs.length) {
          const job = jobs[nextJobIndex];
          nextJobIndex += 1;
          try {
            const outcome = await dispatch(job);
            const completion = await store.completeVideoSafetyDelivery(job.providerId, {
              ...outcome,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              workerId: cleanText(job.lockedBy || workerId, 120)
            });
            if (completion === null) totals.leaseLost += 1;
            else totals.submitted += 1;
          } catch (error) {
            const failureCode = classifyVideoSafetyDeliveryError(error);
            totals.failureCodes[failureCode] = Number(totals.failureCodes[failureCode] || 0) + 1;
            const completion = await store.completeVideoSafetyDelivery(job.providerId, {
              submitted: false,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              error: serializeVideoSafetyDeliveryError(error),
              workerId: cleanText(job.lockedBy || workerId, 120)
            });
            if (completion === null) totals.leaseLost += 1;
            else totals.failed += 1;
          }
        }
      };
      const consumerCount = Math.min(concurrency, jobs.length);
      await Promise.all(Array.from({ length: consumerCount }, () => processClaimedJob()));
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
  return { concurrency, dispatch, isConfigured, isRunning: () => running, processOnce, start, stop };
}

module.exports = { classifyVideoSafetyDeliveryError, createVideoSafetyDispatcher };