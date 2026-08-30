const crypto = require("crypto");

const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_MAX_DURATION_SECONDS = 36000;
const DEFAULT_WEBHOOK_MAX_AGE_SECONDS = 300;

function cleanText(value, maxLength = 500) { return String(value || "").trim().slice(0, maxLength); }
function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed))) : fallback;
}
function normalizeAllowedOrigins(origins = []) {
  return Array.from(new Set((Array.isArray(origins) ? origins : [origins])
    .map((origin) => cleanText(origin, 255).toLowerCase())
    .filter((origin) => /^(?:\*\.)?[a-z0-9.-]+$/i.test(origin)))).slice(0, 10);
}
function readCloudflareStreamConfig(env = process.env) {
  return {
    accountId: cleanText(env.CLOUDFLARE_STREAM_ACCOUNT_ID, 64),
    apiToken: cleanText(env.CLOUDFLARE_STREAM_API_TOKEN, 512),
    webhookSecret: cleanText(env.CLOUDFLARE_STREAM_WEBHOOK_SECRET, 512),
    customerCode: cleanText(env.CLOUDFLARE_STREAM_CUSTOMER_CODE, 128),
    allowedOrigins: normalizeAllowedOrigins(cleanText(env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS || "wingamarket.com,www.wingamarket.com", 2048).split(",")),
    maxDurationSeconds: clampInteger(env.CLOUDFLARE_STREAM_MAX_DURATION_SECONDS, 1, 36000, DEFAULT_MAX_DURATION_SECONDS),
    uploadTtlSeconds: clampInteger(env.CLOUDFLARE_STREAM_UPLOAD_TTL_SECONDS, 60, 3600, 900),
    playbackTokenTtlSeconds: clampInteger(env.CLOUDFLARE_STREAM_PLAYBACK_TOKEN_TTL_SECONDS, 60, 86400, 900)
  };
}
function isCloudflareStreamConfigured(config = readCloudflareStreamConfig()) {
  return Boolean(config.accountId && config.apiToken && config.allowedOrigins.length);
}
function parseWebhookSignature(header = "") {
  const values = {};
  for (const part of String(header || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator > 0) values[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return { time: values.time || "", signature: values.sig1 || "" };
}
function verifyCloudflareStreamWebhook(rawBody, signatureHeader, secret, options = {}) {
  const { time, signature } = parseWebhookSignature(signatureHeader);
  const timestamp = Number(time);
  const nowSeconds = Number.isFinite(Number(options.nowSeconds)) ? Number(options.nowSeconds) : Math.floor(Date.now() / 1000);
  const maxAgeSeconds = clampInteger(options.maxAgeSeconds, 30, 1800, DEFAULT_WEBHOOK_MAX_AGE_SECONDS);
  const signingSecret = cleanText(secret, 512);
  if (!signingSecret || !Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: "invalid_signature_format" };
  if (Math.abs(nowSeconds - timestamp) > maxAgeSeconds) return { ok: false, reason: "stale_signature" };
  const expected = crypto.createHmac("sha256", signingSecret).update(`${time}.${String(rawBody || "")}`).digest("hex");
  const first = Buffer.from(expected);
  const second = Buffer.from(signature);
  return first.length === second.length && crypto.timingSafeEqual(first, second)
    ? { ok: true, reason: "verified", timestamp }
    : { ok: false, reason: "signature_mismatch" };
}
function normalizeStreamVideo(payload = {}) {
  const state = cleanText(payload?.status?.state, 32).toLowerCase();
  const ready = payload.readyToStream === true && state === "ready";
  return {
    providerId: cleanText(payload.uid, 64), creator: cleanText(payload.creator, 64),
    status: ready ? "ready" : (state === "error" ? "failed" : "processing"), readyToStream: ready,
    duration: Math.max(0, Number(payload.duration || 0) || 0),
    width: Math.max(0, Number(payload.input?.width || payload.width || 0) || 0),
    height: Math.max(0, Number(payload.input?.height || payload.height || 0) || 0),
    posterUrl: cleanText(payload.thumbnail, 4096),
    hlsUrl: ready ? cleanText(payload.playback?.hls, 4096) : "",
    dashUrl: ready ? cleanText(payload.playback?.dash, 4096) : "",
    errorCode: cleanText(payload?.status?.errReasonCode || payload?.status?.errorReasonCode, 120),
    errorMessage: cleanText(payload?.status?.errReasonText || payload?.status?.errorReasonText, 500),
    meta: payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta) ? payload.meta : {}
  };
}
function createCloudflareStreamClient(options = {}) {
  const config = options.config || readCloudflareStreamConfig(options.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("Cloudflare Stream client requires fetch.");
  async function request(pathname, init = {}) {
    if (!isCloudflareStreamConfigured(config)) {
      const error = new Error("Cloudflare Stream is not configured."); error.code = "stream_not_configured"; throw error;
    }
    const response = await fetchImpl(`${API_BASE}/accounts/${encodeURIComponent(config.accountId)}/stream${pathname}`, {
      ...init, headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json", ...(init.headers || {}) }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      const error = new Error(cleanText(body?.errors?.[0]?.message, 300) || "Cloudflare Stream request failed.");
      error.code = "stream_provider_error"; error.status = response.status; throw error;
    }
    return body.result || {};
  }
  async function createDirectUpload(input = {}) {
    const creator = cleanText(input.creator, 64);
    if (!creator) throw new TypeError("A creator identifier is required.");
    const expiresAt = new Date(Date.now() + config.uploadTtlSeconds * 1000).toISOString();
    const result = await request("/direct_upload", {
      method: "POST", headers: { "Upload-Creator": creator },
      body: JSON.stringify({
        maxDurationSeconds: config.maxDurationSeconds, allowedOrigins: config.allowedOrigins, creator, expiry: expiresAt,
        requireSignedURLs: true, thumbnailTimestampPct: 0.15,
        meta: { source: "winga-product-upload", uploadId: cleanText(input.uploadId, 80), fileName: cleanText(input.fileName, 180), contentType: cleanText(input.contentType, 120) }
      })
    });
    const providerId = cleanText(result.uid, 64);
    const uploadUrl = cleanText(result.uploadURL, 4096);
    if (!providerId || !/^https:\/\//i.test(uploadUrl)) {
      const error = new Error("Cloudflare Stream returned an incomplete direct upload."); error.code = "stream_invalid_provider_response"; throw error;
    }
    return { providerId, uploadUrl, expiresAt, maxDurationSeconds: config.maxDurationSeconds };
  }
  function encodeTusMetadata(value) {
    return Buffer.from(String(value || ""), "utf8").toString("base64");
  }
  async function createResumableUpload(input = {}) {
    if (!isCloudflareStreamConfigured(config)) {
      const error = new Error("Cloudflare Stream is not configured."); error.code = "stream_not_configured"; throw error;
    }
    const creator = cleanText(input.creator, 64);
    const uploadLength = Number(input.fileSize);
    if (!creator) throw new TypeError("A creator identifier is required.");
    if (!Number.isSafeInteger(uploadLength) || uploadLength <= 0) throw new TypeError("A valid upload length is required.");
    const expiresAt = new Date(Date.now() + config.uploadTtlSeconds * 1000).toISOString();
    const metadata = [
      ["name", cleanText(input.fileName, 180)],
      ["filetype", cleanText(input.contentType, 120)],
      ["maxdurationseconds", String(config.maxDurationSeconds)],
      ["expiry", expiresAt],
      ["requiresignedurls", ""],
      ["allowedorigins", JSON.stringify(config.allowedOrigins)],
      ["uploadid", cleanText(input.uploadId, 80)],
      ["source", "winga-product-upload"]
    ].map(([key, value]) => value ? `${key} ${encodeTusMetadata(value)}` : key).join(",");
    const response = await fetchImpl(`${API_BASE}/accounts/${encodeURIComponent(config.accountId)}/stream?direct_user=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(uploadLength),
        "Upload-Creator": creator,
        "Upload-Metadata": metadata
      }
    });
    const uploadUrl = cleanText(response.headers?.get?.("location"), 4096);
    const providerId = cleanText(response.headers?.get?.("stream-media-id"), 64);
    if (!response.ok || !/^https:\/\//i.test(uploadUrl) || !providerId) {
      const error = new Error("Cloudflare Stream returned an incomplete resumable upload.");
      error.code = "stream_invalid_provider_response"; error.status = response.status; throw error;
    }
    return { providerId, uploadUrl, uploadProtocol: "tus", expiresAt, maxDurationSeconds: config.maxDurationSeconds };
  }
  async function deleteVideo(providerId) {
    const safeId = cleanText(providerId, 64);
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(safeId)) return false;
    await request(`/${encodeURIComponent(safeId)}`, { method: "DELETE" });
    return true;
  }
  async function createPlaybackToken(providerId) {
    const safeId = cleanText(providerId, 64);
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(safeId)) throw new TypeError("A valid Stream video identifier is required.");
    const result = await request(`/${encodeURIComponent(safeId)}/token`, {
      method: "POST", body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + config.playbackTokenTtlSeconds, downloadable: false })
    });
    const token = cleanText(result.token, 8192);
    if (!token) { const error = new Error("Cloudflare Stream returned no playback token."); error.code = "stream_invalid_provider_response"; throw error; }
    return { token, expiresInSeconds: config.playbackTokenTtlSeconds, customerCode: config.customerCode };
  }
  return { config: { ...config, apiToken: "", webhookSecret: "" }, createDirectUpload, createResumableUpload, createPlaybackToken, deleteVideo, isConfigured: () => isCloudflareStreamConfigured(config) };
}
module.exports = { DEFAULT_MAX_DURATION_SECONDS, createCloudflareStreamClient, isCloudflareStreamConfigured, normalizeStreamVideo, parseWebhookSignature, readCloudflareStreamConfig, verifyCloudflareStreamWebhook };
