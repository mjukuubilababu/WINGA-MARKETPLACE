const MAX_SCAN_BYTES = 64 * 1024;
const MAX_CALLBACK_BYTES = 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1024;
const MAX_HIVE_V3_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_HIVE_V3_PREDICTIONS = 50000;
const MAX_REQUEST_AGE_SECONDS = 300;
const CALLBACK_TTL_SECONDS = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 10000;
const HIVE_V3_TIMEOUT_MS = 45000;
const REVIEW_THRESHOLD = 0.9;
const LABEL_THRESHOLD = 0.5;
const SAFE_LABEL_MARKERS = ["no_", "not_", "general_not", "none", "safe"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const readiness = getReadiness(env);
      return json({
        ok: readiness.ready,
        readiness: readiness.ready ? "ready" : "not_ready",
        worker: "winga-video-safety-adapter",
        provider: "hive-visual-moderation",
        policy: "human-review-first-v1",
        providerApiVersion: "v3",
        configuration: readiness.configuration
      }, readiness.ready ? 200 : 503);
    }
    if (request.method === "POST" && url.pathname === "/scan") {
      try {
        return await acceptWingaScan(request, env);
      } catch (error) {
        const timeout = error?.name === "AbortError";
        console.error(JSON.stringify({ event: "video_safety_scan_failed", timeout, stage: error?.scanStage || "scan_validation", reason: safeFailureReason(error), providerStatus: error?.providerStatus }));
        return json({ ok: false, error: timeout ? "provider_timeout" : "scan_failed" }, timeout ? 504 : 502);
      }
    }
    if (request.method === "POST" && url.pathname === "/callbacks/hive") {
      return acceptHiveCallback(request, env, url);
    }
    return json({ ok: false, error: "not_found" }, 404);
  }
};

async function acceptWingaScan(request, env) {
  if (!getReadiness(env).ready) return json({ ok: false, error: "adapter_not_configured" }, 503);
  const raw = await readLimitedBody(request, MAX_SCAN_BYTES);
  if (!raw.ok) return json({ ok: false, error: raw.error }, raw.status);

  const timestamp = clean(request.headers.get("x-winga-video-safety-timestamp"), 32);
  const signature = clean(request.headers.get("x-winga-video-safety-signature"), 128).replace(/^sha256=/i, "");
  if (!isFreshTimestamp(timestamp)
      || !await verifyHmacHex(env.VIDEO_SAFETY_SCAN_WEBHOOK_SECRET, `${timestamp}.${raw.text}`, signature)) {
    return json({ ok: false, error: "invalid_winga_signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(raw.text);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const scan = normalizeScan(payload);
  const validationError = validateScan(scan, env);
  if (validationError) return json({ ok: false, error: validationError }, 422);

  // V3 returns predictions in this response. Do not acknowledge the scan
  // until the signed result has reached the durable Render backend.
  const { response: providerResponse, body: providerBody } = await withScanStage("hive_request", () => fetchWithTimeout(clean(env.HIVE_API_URL, 2048), {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${clean(env.HIVE_API_KEY, 1000)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "winga-video-safety-adapter/2"
    },
    body: JSON.stringify({ input: [{ media_url: scan.mediaUrl }] })
  }, HIVE_V3_TIMEOUT_MS, async response => ({ response, body: await withScanStage("hive_response", () => readProviderJson(response, MAX_HIVE_V3_RESPONSE_BYTES)) })));
  if (!providerResponse.ok) {

    const diagnostic = summarizeProviderRejection(providerBody);
    console.error(JSON.stringify({ event: "video_safety_provider_rejected", status: providerResponse.status, ...diagnostic }));
    return json({ ok: false, error: "provider_rejected", providerStatus: providerResponse.status }, 502);
  }
  const normalized = await withScanStage("hive_normalize", () => normalizeHiveV3Result(scan, providerBody));
  if (!normalized) {
    console.error(JSON.stringify({ event: "video_safety_provider_invalid_response", shape: hiveResponseShape(providerBody) }));
    return json({ ok: false, error: "provider_invalid_response" }, 502);
  }
  const delivery = await withScanStage("winga_callback", () => deliverWingaResult(normalized, env));
  if (!delivery.ok) return json({ ok: false, error: "winga_callback_failed" }, 502);
  console.log(JSON.stringify({ event: "video_safety_result_delivered", apiVersion: "v3", verdict: normalized.verdict }));
  return json({
    submitted: true,
    status: "completed",
    delivered: true,
    verdict: normalized.verdict,
    providerTaskId: normalized.resultId,
    idempotencyKey: scan.idempotencyKey
  }, 202);
}

async function acceptHiveCallback(request, env, url) {
  if (!getReadiness(env).ready) return json({ ok: false, error: "adapter_not_configured" }, 503);
  const providerId = clean(url.searchParams.get("providerId"), 200);
  const expires = clean(url.searchParams.get("expires"), 32);
  const token = clean(url.searchParams.get("token"), 128);
  if (!providerId || !isFutureTimestamp(expires)
      || !await verifyHmacHex(env.HIVE_CALLBACK_TOKEN_SECRET, `${providerId}.${expires}`, token)) {
    return json({ ok: false, error: "invalid_callback_context" }, 401);
  }

  const raw = await readLimitedBody(request, MAX_CALLBACK_BYTES);
  if (!raw.ok) return json({ ok: false, error: raw.error }, raw.status);
  let provider;
  try {
    provider = JSON.parse(raw.text);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const echoedPostId = clean(firstString(provider, ["post_id", "postId"]), 200);
  if (echoedPostId && echoedPostId !== providerId) {
    return json({ ok: false, error: "callback_identity_mismatch" }, 409);
  }

  const normalized = await normalizeHiveResult(providerId, provider, raw.text);
  const delivery = await deliverWingaResult(normalized, env);
  if (!delivery.ok) return json({ ok: false, error: "winga_callback_failed" }, 502);
  console.log(JSON.stringify({ event: "video_safety_result_delivered", verdict: normalized.verdict }));
  return json({ ok: true, delivered: true, verdict: normalized.verdict });
}

async function deliverWingaResult(normalized, env) {
  const callbackBody = JSON.stringify(normalized);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacHex(env.VIDEO_SAFETY_RESULT_WEBHOOK_SECRET, `${timestamp}.${callbackBody}`);
  const response = await fetchWithTimeout(env.WINGA_VIDEO_SAFETY_RESULT_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-Winga-Video-Safety-Timestamp": timestamp,
      "X-Winga-Video-Safety-Signature": `sha256=${signature}`,
      "User-Agent": "winga-video-safety-adapter/2"
    },
    body: callbackBody
  }, FETCH_TIMEOUT_MS, async response => {
    await drainBounded(response, MAX_PROVIDER_RESPONSE_BYTES);
    return { ok: response.ok, status: response.status };
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: "video_safety_result_delivery_failed", status: response.status }));
  }
  return { ok: response.ok };
}


function summarizeProviderRejection(payload) {
  const message = clean(["message", "detail", "error", "error_message", "msg"].map(key => findNestedString(payload, new Set([key]))).join(" "), 4000)
    .toLowerCase().replace(/https?:\/\/\S+/g, "");
  const vocabulary = ["unsupported", "supported", "invalid", "media", "media_url", "image", "video", "m3u8", "hls", "mp4", "format", "file", "download", "url", "fetch", "input", "array", "object", "json", "base64", "size", "duration", "maximum", "exceeded", "model", "permission", "access", "credit", "balance", "payment", "quota", "rate", "limit", "not", "found", "required", "content", "type"];
  const terms = vocabulary.filter(term => new RegExp("\\b" + term + "\\b").test(message));
  let reason = "invalid_request";
  if (/balance|credit|payment/.test(message)) reason = "balance_required";
  else if (/quota|rate.?limit/.test(message)) reason = "quota_exceeded";
  else if (/unsupported|not supported|format|content.?type|m3u8|\bhls\b/.test(message)) reason = "unsupported_media_format";
  else if (/download|fetch|media.?url/.test(message)) reason = "media_unavailable";
  else if (/array|object|json|input/.test(message)) reason = "invalid_input";
  return { reason, terms };
}
function hiveResponseShape(payload) {
  const allowed = ["output", "status", "response", "result", "data", "classes", "predictions", "class_name", "value", "class", "score", "name", "confidence", "label"];
  const pending = [{ node: payload, path: "root", depth: 0 }];
  const shapes = [];
  while (pending.length && shapes.length < 24) {
    const { node, path, depth } = pending.shift();
    if (!node || typeof node !== "object") continue;
    const shape = { path, fields: allowed.filter(key => Object.hasOwn(node, key)) };
    if (Array.isArray(node)) shape.count = node.length;
    if (Array.isArray(node.classes)) {
      shape.classCount = node.classes.length;
      const first = node.classes[0];
      shape.classFields = first && typeof first === "object" ? allowed.filter(key => Object.hasOwn(first, key)) : [];
      shape.valueType = typeof first?.value;
      shape.scoreType = typeof first?.score;
      shape.hasNsfw = node.classes.some(item => item?.class_name === "general_nsfw" || item?.class === "general_nsfw");
    }
    shapes.push(shape);
    if (depth >= 6) continue;
    if (Array.isArray(node)) {
      if (node.length) pending.push({ node: node[0], path: path + "[0]", depth: depth + 1 });
    } else {
      for (const key of ["output", "status", "response", "result", "data"]) {
        if (node[key] && typeof node[key] === "object") pending.push({ node: node[key], path: path + "." + key, depth: depth + 1 });
      }
    }
  }
  return shapes;
}

function parseHiveClass(prediction) {
  if (!prediction || typeof prediction !== "object" || Array.isArray(prediction)) return null;
  const named = Object.hasOwn(prediction, "class_name");
  const classified = Object.hasOwn(prediction, "class");
  const valued = Object.hasOwn(prediction, "value");
  const scored = Object.hasOwn(prediction, "score");
  if ((named && classified && prediction.class_name !== prediction.class)
      || (valued && scored && prediction.value !== prediction.score)) return null;
  const rawLabel = named ? prediction.class_name : prediction.class;
  const score = valued ? prediction.value : prediction.score;
  if (typeof rawLabel !== "string" || rawLabel.length > 80) return null;
  const label = rawLabel.toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(label) || typeof score !== "number"
      || !Number.isFinite(score) || score < 0 || score > 1) return null;
  return { label, score };
}

async function normalizeHiveV3Result(scan, payload) {
  // Reject errors, empty outputs and malformed scores. Missing predictions
  // must never be interpreted as zero risk.
  if (!payload || payload.error || payload.error_code || payload.errorCode
      || Number(payload.status_code || 0) >= 400
      || !Array.isArray(payload.output) || !payload.output.length
      || payload.output.length > 5000) return null;
  const scores = Object.create(null);
  let count = 0;
  for (const output of payload.output) {
    if (!Array.isArray(output?.classes) || !output.classes.length) return null;
    let hasNsfw = false;
    for (const prediction of output.classes) {
      count += 1;
      if (count > MAX_HIVE_V3_PREDICTIONS) return null;
      const parsed = parseHiveClass(prediction);
      if (!parsed) return null;
      const { label, score } = parsed;
      if (label === "general_nsfw") hasNsfw = true;
      if (scores[label] === undefined && Object.keys(scores).length >= 1024) return null;
      scores[label] = Math.max(scores[label] ?? 0, score);
    }
    if (!hasNsfw) return null;
  }
  const positive = Object.entries(scores).filter(([label]) => !isSafeLabel(label));
  const riskScore = positive.reduce((maximum, [, score]) => Math.max(maximum, score), 0);
  // Bind the result identity to the durable scan identity so a delivery retry
  // cannot create a second decision when the first response was lost.
  const resultId = `hive-v3:${await sha256Hex(scan.idempotencyKey)}`;
  return {
    providerId: scan.providerId,
    resultId,
    verdict: riskScore >= REVIEW_THRESHOLD ? "review" : "safe",
    riskScore,
    labels: positive.filter(([, score]) => score >= LABEL_THRESHOLD)
      .sort((left, right) => right[1] - left[1]).slice(0, 40).map(([label]) => label),
    scores: Object.fromEntries(Object.entries(scores).sort((left, right) => right[1] - left[1]).slice(0, 40)),
    provider: "hive-visual-moderation",
    modelVersion: "visual-v3",
    checkedAt: new Date().toISOString()
  };
}

function normalizeScan(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    version: clean(source.version || "video-safety-scan-v1", 40),
    providerId: clean(source.providerId || source.videoId, 200),
    idempotencyKey: clean(source.idempotencyKey, 240),
    mediaUrl: clean(source.mediaUrl || source.url, 4096)
  };
}

function validateScan(scan, env) {
  if (scan.version !== "video-safety-scan-v1") return "unsupported_contract";
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(scan.providerId)) return "invalid_provider_id";
  if (scan.idempotencyKey !== `video-safety:${scan.providerId}`) return "invalid_idempotency_key";
  let mediaUrl;
  try {
    mediaUrl = new URL(scan.mediaUrl);
  } catch {
    return "invalid_media_url";
  }
  if (mediaUrl.protocol !== "https:" || !isAllowedMediaHost(mediaUrl.hostname, env.MEDIA_HOST_ALLOWLIST)) {
    return "media_host_not_allowed";
  }
  return "";
}

async function normalizeHiveResult(providerId, payload, rawBody) {
  const scores = collectClassScores(payload);
  const positive = Object.entries(scores).filter(([label]) => !isSafeLabel(label));
  const riskScore = positive.reduce((maximum, [, score]) => Math.max(maximum, score), 0);
  const labels = positive.filter(([, score]) => score >= LABEL_THRESHOLD)
    .sort((left, right) => right[1] - left[1]).slice(0, 40).map(([label]) => label);

  const providerError = Boolean(firstString(payload, ["error", "error_code", "errorCode"]));
  const taskId = clean(firstString(payload, ["task_id", "taskId", "id"])
    || findNestedString(payload, new Set(["task_id", "taskid", "id"])), 160);
  const bodyHash = await sha256Hex(rawBody);
  return {
    providerId,
    resultId: taskId || `hive:${bodyHash.slice(0, 120)}`,
    verdict: providerError ? "error" : (riskScore >= REVIEW_THRESHOLD ? "review" : "safe"),
    riskScore,
    labels,
    scores,
    provider: "hive-visual-moderation",
    modelVersion: "visual-v2",
    checkedAt: new Date().toISOString(),
    ...(providerError ? { errorCode: clean(firstString(payload, ["error_code", "errorCode", "error"]), 120) } : {})
  };
}

function collectClassScores(input) {
  const scores = {};
  const queue = [{ value: input, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < 5000) {
    const { value, depth } = queue.shift();
    visited += 1;
    if (!value || depth > 8) continue;
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((entry) => queue.push({ value: entry, depth: depth + 1 }));
      continue;
    }
    if (typeof value !== "object") continue;
    const label = clean(value.class || value.label || value.name, 80).toLowerCase();
    const score = Number(value.score ?? value.confidence ?? value.probability);
    if (label && Number.isFinite(score)) scores[label] = Math.max(scores[label] || 0, clamp(score, 0, 1));
    Object.values(value).slice(0, 200).forEach((entry) => {
      if (entry && typeof entry === "object") queue.push({ value: entry, depth: depth + 1 });
    });
  }
  return Object.fromEntries(Object.entries(scores).sort((left, right) => right[1] - left[1]).slice(0, 40));
}

function isSafeLabel(label) {
  const normalized = String(label || "").toLowerCase();
  return SAFE_LABEL_MARKERS.some((marker) => normalized === marker || normalized.startsWith(marker) || normalized.includes("not_nsfw"));
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source && typeof source === "object" ? source[key] : "";
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "";
}

function findNestedString(input, keys) {
  const queue = [{ value: input, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < 1000) {
    const { value, depth } = queue.shift();
    visited += 1;
    if (!value || typeof value !== "object" || depth > 6) continue;
    for (const [key, entry] of Object.entries(value).slice(0, 200)) {
      if (keys.has(key.toLowerCase()) && (typeof entry === "string" || typeof entry === "number")) return String(entry);
      if (entry && typeof entry === "object") queue.push({ value: entry, depth: depth + 1 });
    }
  }
  return "";
}

function getReadiness(env) {
  const configuration = {
    hive: clean(env.HIVE_API_KEY, 1000).length >= 16 && isHiveV3Url(env.HIVE_API_URL),
    wingaSignature: clean(env.VIDEO_SAFETY_SCAN_WEBHOOK_SECRET, 1000).length >= 32,
    callbackContext: clean(env.HIVE_CALLBACK_TOKEN_SECRET, 1000).length >= 32 && isHttpsUrl(env.ADAPTER_PUBLIC_URL),
    wingaCallback: clean(env.VIDEO_SAFETY_RESULT_WEBHOOK_SECRET, 1000).length >= 32 && isHttpsUrl(env.WINGA_VIDEO_SAFETY_RESULT_URL),
    mediaAllowlist: parseAllowlist(env.MEDIA_HOST_ALLOWLIST).length > 0
  };
  return { ready: Object.values(configuration).every(Boolean), configuration };
}

function parseAllowlist(value) {

  return String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 20);
}

function isAllowedMediaHost(hostname, allowlist) {
  const host = String(hostname || "").toLowerCase();
  return parseAllowlist(allowlist).some((allowed) => allowed.startsWith(".")
    ? host.endsWith(allowed) && host.length > allowed.length
    : host === allowed);
}

function isHiveV3Url(value) {
  try {
    const url = new URL(clean(value, 2048));
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["api.thehive.ai", "api-va1.thehive.ai"].includes(url.hostname)
      && url.pathname === "/api/v3/hive/visual-moderation"
      && !url.search && !url.hash;
  } catch { return false; }
}

function isHttpsUrl(value) {
  try { return new URL(String(value || "")).protocol === "https:"; } catch { return false; }
}

function isFreshTimestamp(value) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && Math.abs(Math.floor(Date.now() / 1000) - seconds) <= MAX_REQUEST_AGE_SECONDS;
}

function isFutureTimestamp(value) {
  const seconds = Number(value);
  const now = Math.floor(Date.now() / 1000);
  return Number.isInteger(seconds) && seconds >= now - MAX_REQUEST_AGE_SECONDS && seconds <= now + CALLBACK_TTL_SECONDS;
}

async function withScanStage(stage, operation) {
  try { return await operation(); }
  catch (error) {
    const failure = error && typeof error === "object" ? error : new Error("scan_stage_failed");
    if (!failure.scanStage) failure.scanStage = stage;
    throw failure;
  }
}

function safeFailureReason(error) {
  if (error?.message === "body_limit_exceeded") return "response_too_large";
  if (error?.name === "AbortError") return "timeout";
  if (/redirect/i.test(String(error?.message || ""))) return "redirect_blocked";
  if (/fetch failed|network|socket|dns|connection/i.test(String(error?.message || ""))) return "network_failure";
  if (error?.name === "TypeError") return "type_error";
  return "runtime_failure";
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS, consume = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      if (response.body) await response.body.cancel();
      throw new Error("redirect_blocked");
    }
    return consume ? await consume(response) : response;
  }
  finally { clearTimeout(timer); }
}

async function readProviderJson(response, maxBytes = MAX_PROVIDER_RESPONSE_BYTES) {
  let text;
  try { text = await readBoundedResponse(response, maxBytes); }
  catch (error) {
    if (error && typeof error === "object") error.providerStatus = response.status;
    throw error;
  }
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

async function drainBounded(response, limit) {
  await readBoundedResponse(response, limit);
}

async function readLimitedBody(request, limit) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) return { ok: false, status: 413, error: "payload_too_large" };
  if (!request.body) return { ok: true, text: "" };
  try { return { ok: true, text: await readStream(request.body, limit) }; }
  catch (error) { return { ok: false, status: 413, error: error.message === "body_limit_exceeded" ? "payload_too_large" : "invalid_body" }; }
}

async function readBoundedResponse(response, limit) {
  return response.body ? readStream(response.body, limit) : "";
}

async function readStream(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();

      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("body_limit_exceeded"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || ""))));
}

async function hmacHex(secret, value) {
  return bytesToHex(await hmacBytes(secret, value));
}

async function verifyHmacHex(secret, value, received) {
  if (!secret || !/^[0-9a-f]{64}$/i.test(String(received || ""))) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, hexToBytes(received), new TextEncoder().encode(value));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(value) { return Uint8Array.from(String(value).match(/.{2}/g), (part) => Number.parseInt(part, 16)); }
function clean(value, maxLength = 500) { return String(value || "").trim().slice(0, maxLength); }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, Number(value) || 0)); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

