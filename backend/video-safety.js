const crypto = require("crypto");

const DEFAULT_MAX_AGE_SECONDS = 300;
const ALLOWED_VERDICTS = new Set(["safe", "review", "blocked", "error"]);

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function clampNumber(value, minimum, maximum, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function readVideoSafetyConfig(env = process.env) {
  const scanUrl = cleanText(env.VIDEO_SAFETY_SCAN_WEBHOOK_URL, 2048);
  const deliverySecret = cleanText(env.VIDEO_SAFETY_SCAN_WEBHOOK_SECRET, 512);
  const callbackSecret = cleanText(env.VIDEO_SAFETY_RESULT_WEBHOOK_SECRET, 512);
  const callbackUrl = cleanText(env.VIDEO_SAFETY_RESULT_CALLBACK_URL, 2048);
  const configured = Boolean(scanUrl && deliverySecret && callbackSecret && callbackUrl);
  return {
    configured,
    scanUrl: /^https:\/\//i.test(scanUrl) ? scanUrl : "",
    callbackUrl: /^https:\/\//i.test(callbackUrl) ? callbackUrl : "",
    deliverySecret,
    callbackSecret,
    maxAgeSeconds: Math.trunc(clampNumber(env.VIDEO_SAFETY_WEBHOOK_MAX_AGE_SECONDS, 30, 1800, DEFAULT_MAX_AGE_SECONDS)),
    maxAttempts: Math.trunc(clampNumber(env.VIDEO_SAFETY_MAX_ATTEMPTS, 1, 20, 6))
  };
}

function isVideoSafetyConfigured(config = readVideoSafetyConfig()) {
  return Boolean(config.configured && config.scanUrl && config.callbackUrl
    && config.deliverySecret?.length >= 32 && config.callbackSecret?.length >= 32);
}

function signVideoSafetyPayload(timestamp, rawBody, secret) {
  return crypto.createHmac("sha256", cleanText(secret, 512))
    .update(`${String(timestamp)}.${String(rawBody || "")}`)
    .digest("hex");
}

function timingSafeEqualHex(first, second) {
  if (!/^[0-9a-f]{64}$/i.test(String(first || "")) || !/^[0-9a-f]{64}$/i.test(String(second || ""))) return false;
  const left = Buffer.from(String(first), "hex");
  const right = Buffer.from(String(second), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyVideoSafetyResult(rawBody, headers = {}, secret, options = {}) {
  const timestamp = cleanText(headers["x-winga-video-safety-timestamp"] || headers.timestamp, 32);
  const signature = cleanText(headers["x-winga-video-safety-signature"] || headers.signature, 128).replace(/^sha256=/i, "");
  const nowSeconds = Number.isFinite(Number(options.nowSeconds)) ? Number(options.nowSeconds) : Math.floor(Date.now() / 1000);
  const maxAgeSeconds = Math.trunc(clampNumber(options.maxAgeSeconds, 30, 1800, DEFAULT_MAX_AGE_SECONDS));
  const timestampSeconds = Number(timestamp);
  if (!cleanText(secret, 512) || !Number.isInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > maxAgeSeconds) {
    return { ok: false, reason: "stale_or_invalid_timestamp" };
  }
  const expected = signVideoSafetyPayload(timestamp, rawBody, secret);
  return timingSafeEqualHex(signature, expected)
    ? { ok: true, reason: "verified", timestamp: timestampSeconds }
    : { ok: false, reason: "signature_mismatch" };
}

function normalizeVideoSafetyResult(payload = {}) {
  const providerId = cleanText(payload.providerId || payload.videoId, 200);
  const resultId = cleanText(payload.resultId || payload.eventId, 160);
  const requestedVerdict = cleanText(payload.verdict || payload.status, 24).toLowerCase();
  const verdict = ALLOWED_VERDICTS.has(requestedVerdict) ? requestedVerdict : "error";
  const labels = Array.from(new Set((Array.isArray(payload.labels) ? payload.labels : [])
    .map((label) => cleanText(label, 80).toLowerCase())
    .filter(Boolean))).slice(0, 40);
  const scores = {};
  const sourceScores = payload.scores && typeof payload.scores === "object" && !Array.isArray(payload.scores) ? payload.scores : {};
  Object.entries(sourceScores).slice(0, 40).forEach(([key, value]) => {
    const safeKey = cleanText(key, 80).toLowerCase();
    if (safeKey) scores[safeKey] = clampNumber(value, 0, 1, 0);
  });
  return {
    providerId,
    resultId,
    verdict,
    riskScore: clampNumber(payload.riskScore, 0, 1, 0),
    labels,
    scores,
    provider: cleanText(payload.provider, 80),
    modelVersion: cleanText(payload.modelVersion, 120),
    checkedAt: cleanText(payload.checkedAt, 40) || new Date().toISOString(),
    errorCode: verdict === "error" ? cleanText(payload.errorCode, 120) : ""
  };
}

module.exports = {
  ALLOWED_VERDICTS,
  DEFAULT_MAX_AGE_SECONDS,
  isVideoSafetyConfigured,
  normalizeVideoSafetyResult,
  readVideoSafetyConfig,
  signVideoSafetyPayload,
  verifyVideoSafetyResult
};