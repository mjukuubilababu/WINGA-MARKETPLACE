import { DurableObject } from "cloudflare:workers";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REQUEST_AGE_SECONDS = 300;
const PROVIDER_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 15 * 60 * 1000;
const SUCCESS_STATUSES = new Set(["succeeded", "successful", "completed-momo", "completed-bank-transfer", "completed-mpgs", "completed-offline", "completed-preauth"]);
const FAILURE_STATUSES = new Set(["failed", "cancelled", "rejected"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const readiness = getReadiness(env);
      return json({
        ok: readiness.ready,
        readiness: readiness.ready ? "ready" : "not_ready",
        worker: "winga-payment-refund-adapter",
        provider: "flutterwave",
        durableIdempotency: Boolean(env.REFUND_COORDINATOR),
        configuration: readiness.configuration
      }, readiness.ready ? 200 : 503);
    }
    if (request.method === "POST" && url.pathname === "/v1/refunds") {
      return acceptWingaRefund(request, env);
    }
    if (request.method === "POST" && url.pathname === "/callbacks/flutterwave") {
      return acceptFlutterwaveCallback(request, env, url);
    }
    return json({ error: "Not found" }, 404);
  }
};

export class RefundCoordinator extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/submit") {
      return this.submit(await request.json());
    }
    if (request.method === "POST" && url.pathname === "/provider-result") {
      return this.applyProviderResult(await request.json());
    }
    return json({ error: "Not found" }, 404);
  }

  async alarm() {
    const record = await this.ctx.storage.get("refund");
    if (!record || isTerminal(record.status) || !record.providerRefundId) return;
    try {
      const normalized = normalizeProviderResult(await fetchProviderRefund(this.env, record));
      if (normalized.terminal) {
        await this.finish(record, normalized);
      } else {
        await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "refund_poll_failed", refundId: record.refundId, error: safeError(error) }));
      await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
    }
  }

  async submit(payload) {
    const existing = await this.ctx.storage.get("refund");
    if (existing) {
      if (existing.status === "submission_unknown") {
        return json({ ...publicRecord(existing), error: "Provider submission outcome requires reconciliation." }, 409);
      }
      if (existing.status !== "retryable") {
        return json(publicRecord(existing), existing.status === "failed" ? 409 : 200);
      }
    }

    const reference = resolveProviderReference(payload);
    if (!reference) {
      return json({ error: "Flutterwave transaction ID is required.", code: "provider_reference_missing" }, 422);
    }

    const record = {
      refundId: payload.refundId,
      idempotencyKey: payload.idempotencyKey,
      reconciliationCaseId: payload.reconciliationCaseId,
      orderId: payload.orderId,
      paymentId: payload.paymentId,
      amount: Number(payload.amount),
      reference,
      status: "submitting",
      providerRefundId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.ctx.storage.put("refund", record);

    let normalized;
    try {
      normalized = normalizeProviderResult(await createFlutterwaveRefund(this.env, record));
    } catch (error) {
      const uncertain = isSubmissionOutcomeUncertain(error);
      const failed = {
        ...record,
        status: uncertain ? "submission_unknown" : "retryable",
        error: safeError(error),
        updatedAt: new Date().toISOString()
      };
      await this.ctx.storage.put("refund", failed);
      console.error(JSON.stringify({ event: "refund_submission_failed", refundId: failed.refundId, error: failed.error }));
      return json({
        error: uncertain ? "Refund provider outcome is unknown and requires reconciliation." : "Refund provider rejected the request.",
        code: uncertain ? "provider_outcome_unknown" : "provider_rejected"
      }, uncertain ? 409 : 502);
    }

    const updated = {
      ...record,
      status: normalized.terminal ? "callback_pending" : "submitted",
      providerRefundId: normalized.providerRefundId,
      providerStatus: normalized.providerStatus,
      updatedAt: new Date().toISOString()
    };
    await this.ctx.storage.put("refund", updated);
    if (normalized.providerRefundId) {
      await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
    }
    if (normalized.terminal) {
      await this.finish(updated, normalized);
      updated.status = normalized.status;
    }
    console.log(JSON.stringify({ event: "refund_submitted", refundId: updated.refundId, providerRefundId: updated.providerRefundId, status: updated.status }));
    return json(publicRecord(updated), 202);
  }
  async applyProviderResult(payload) {
    const record = await this.ctx.storage.get("refund");
    if (!record) return json({ error: "Refund not found" }, 404);
    if (isTerminal(record.status)) return json({ ok: true, duplicate: true });

    const normalized = normalizeProviderResult(payload.provider);
    if (!normalized.terminal) {
      await this.ctx.storage.put("refund", {
        ...record,
        providerStatus: normalized.providerStatus,
        providerRefundId: normalized.providerRefundId || record.providerRefundId,
        updatedAt: new Date().toISOString()
      });
      await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
      return json({ ok: true, pending: true }, 202);
    }
    await this.finish(record, normalized);
    return json({ ok: true, confirmed: normalized.status === "confirmed" });
  }

  async finish(record, normalized) {
    const updated = {
      ...record,
      status: normalized.status,
      providerStatus: normalized.providerStatus,
      providerRefundId: normalized.providerRefundId || record.providerRefundId,
      updatedAt: new Date().toISOString()
    };
    await this.notifyWinga(updated, normalized);
    await this.ctx.storage.put("refund", updated);
  }

  async notifyWinga(record, normalized) {
    const callback = {
      idempotencyKey: record.idempotencyKey,
      status: normalized.status === "confirmed" ? "confirmed" : "failed",
      providerRefundId: record.providerRefundId || "",
      providerReference: normalized.providerStatus || "",
      error: normalized.status === "failed" ? "Flutterwave refund failed" : ""
    };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signedPayload = [timestamp, callback.idempotencyKey, callback.status, callback.providerRefundId].join(".");
    const signature = await hmacHex(this.env.WINGA_REFUND_CALLBACK_SECRET, signedPayload);
    const response = await fetchWithTimeout(this.env.WINGA_REFUND_CALLBACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Winga-Refund-Timestamp": timestamp,
        "X-Winga-Refund-Signature": "sha256=" + signature,
        "User-Agent": "winga-payment-refund-adapter/1"
      },
      body: JSON.stringify(callback)
    });
    if (!response.ok) throw new Error("Winga callback returned HTTP " + response.status);
  }
}

async function acceptWingaRefund(request, env) {
  if (!getReadiness(env).ready) return json({ error: "Adapter is not configured." }, 503);
  const raw = await readLimitedBody(request, MAX_BODY_BYTES);
  if (!raw.ok) return json({ error: raw.error }, raw.status);

  const timestamp = String(request.headers.get("X-Winga-Refund-Timestamp") || "").trim();
  const signature = String(request.headers.get("X-Winga-Refund-Signature") || "").trim().replace(/^sha256=/i, "");
  if (!isFreshTimestamp(timestamp) || !await verifyHmacHex(env.WINGA_REFUND_WEBHOOK_SECRET, timestamp + "." + raw.text, signature)) {
    return json({ error: "Invalid Winga signature." }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(raw.text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const validation = validateWingaRefund(payload, String(request.headers.get("Idempotency-Key") || "").trim());
  if (validation) return json({ error: validation }, 422);

  const stub = env.REFUND_COORDINATOR.get(env.REFUND_COORDINATOR.idFromName(payload.idempotencyKey));
  return stub.fetch("https://refund-coordinator.internal/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function acceptFlutterwaveCallback(request, env, url) {
  const raw = await readLimitedBody(request, MAX_BODY_BYTES);
  if (!raw.ok) return json({ error: raw.error }, raw.status);

  const signature = String(request.headers.get("flutterwave-signature") || "").trim();
  if (!signature || !await verifyHmacBase64(env.FLUTTERWAVE_WEBHOOK_SECRET, raw.text, signature)) {
    return json({ error: "Invalid Flutterwave signature." }, 401);
  }

  const idempotencyKey = String(url.searchParams.get("idempotencyKey") || "").trim();
  const context = String(url.searchParams.get("context") || "").trim();
  if (!idempotencyKey || !await verifyHmacHex(env.CALLBACK_CONTEXT_SECRET, idempotencyKey, context)) {
    return json({ error: "Invalid callback context." }, 401);
  }

  let provider;
  try {
    provider = JSON.parse(raw.text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const stub = env.REFUND_COORDINATOR.get(env.REFUND_COORDINATOR.idFromName(idempotencyKey));
  return stub.fetch("https://refund-coordinator.internal/provider-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider })
  });
}

async function createFlutterwaveRefund(env, record) {
  const context = await hmacHex(env.CALLBACK_CONTEXT_SECRET, record.idempotencyKey);
  const callbackUrl = new URL("/callbacks/flutterwave", env.ADAPTER_PUBLIC_URL);
  callbackUrl.searchParams.set("idempotencyKey", record.idempotencyKey);
  callbackUrl.searchParams.set("context", context);
  const base = String(env.FLUTTERWAVE_API_BASE_URL || "").replace(/\/+$/, "");


  return readProviderResponse(await fetchWithTimeout(base + "/transactions/" + encodeURIComponent(record.reference.value) + "/refund", {
    method: "POST",
    headers: providerHeaders(env, record),
    body: JSON.stringify({
      amount: record.amount,
      comments: "Winga reconciliation " + record.reconciliationCaseId,
      callbackurl: callbackUrl.toString()
    })
  }));
}

async function fetchProviderRefund(env, record) {
  const base = String(env.FLUTTERWAVE_API_BASE_URL || "").replace(/\/+$/, "");
  return readProviderResponse(await fetchWithTimeout(base + "/refunds/" + encodeURIComponent(record.providerRefundId), {
    headers: {
      Authorization: "Bearer " + env.FLUTTERWAVE_SECRET_KEY,
      Accept: "application/json",
      "X-Trace-Id": traceId(record.idempotencyKey)
    }
  }));
}

function providerHeaders(env, record) {
  return {
    Authorization: "Bearer " + env.FLUTTERWAVE_SECRET_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Trace-Id": traceId(record.idempotencyKey),
    "X-Idempotency-Key": record.idempotencyKey
  };
}

async function readProviderResponse(response) {
  const text = await readBoundedResponse(response, MAX_RESPONSE_BYTES);
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 500) };
  }
  if (!response.ok) throw new Error("Flutterwave returned HTTP " + response.status + ": " + String(body.message || "request failed").slice(0, 240));
  return body;
}

function normalizeProviderResult(provider = {}) {
  const data = provider.data && typeof provider.data === "object" ? provider.data : provider;
  const status = String(data.status || provider.status || "").trim().toLowerCase();
  const providerRefundId = String(data.id || data.refund_id || data.refundId || provider.id || "").trim().slice(0, 160);
  if (SUCCESS_STATUSES.has(status)) return { terminal: true, status: "confirmed", providerStatus: status, providerRefundId };
  if (FAILURE_STATUSES.has(status)) return { terminal: true, status: "failed", providerStatus: status, providerRefundId };
  return { terminal: false, status: "submitted", providerStatus: status || "pending", providerRefundId };
}

function resolveProviderReference(payload) {
  const values = [payload.providerTransactionId, payload.transactionReference].map((value) => String(value || "").trim()).filter(Boolean);
  for (const value of values) {
    const match = value.match(/^(?:flutterwave|flw):(\d+)$/i);
    if (match) return { kind: "transaction", value: match[1] };
    if (/^\d+$/.test(value)) return { kind: "transaction", value };
  }
  return null;
}

function validateWingaRefund(payload, idempotencyHeader) {
  if (!payload || payload.version !== "payment-refund-v1") return "Unsupported payload version.";
  if (!/^refund:[A-Za-z0-9:_-]{1,150}$/.test(String(payload.idempotencyKey || ""))) return "Invalid idempotency key.";
  if (payload.idempotencyKey !== idempotencyHeader) return "Idempotency key mismatch.";
  if (!payload.refundId || !payload.reconciliationCaseId || !payload.orderId || !payload.paymentId) return "Missing refund identity.";
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) return "Invalid refund amount.";
  if (String(payload.paymentProvider || "").toLowerCase() !== "flutterwave") return "Unsupported payment provider.";
  return "";
}

function getReadiness(env) {
  const configuration = {
    wingaSignature: Boolean(env.WINGA_REFUND_WEBHOOK_SECRET),
    wingaCallback: Boolean(env.WINGA_REFUND_CALLBACK_URL && env.WINGA_REFUND_CALLBACK_SECRET),
    flutterwave: Boolean(env.FLUTTERWAVE_SECRET_KEY && env.FLUTTERWAVE_WEBHOOK_SECRET),
    callbackContext: Boolean(env.CALLBACK_CONTEXT_SECRET),
    durableObject: Boolean(env.REFUND_COORDINATOR)
  };
  return { ready: Object.values(configuration).every(Boolean), configuration };
}

function isTerminal(status) {
  return status === "confirmed" || status === "failed";
}

function publicRecord(record) {
  return {
    submitted: !record.error,
    refundId: record.refundId,
    providerRefundId: record.providerRefundId || "",
    status: record.status,
    idempotencyKey: record.idempotencyKey
  };
}

function traceId(value) {
  return "winga-" + String(value).replace(/[^A-Za-z0-9-]/g, "-").slice(0, 100);
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isSubmissionOutcomeUncertain(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.name === "AbortError"
    || message.includes("timeout")
    || message.includes("aborted")
    || message.includes("network")
    || message.includes("fetch failed");
}
async function readLimitedBody(request, limit) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) return { ok: false, status: 413, error: "Request body too large." };
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Request body too large." };
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return { ok: true, text: decodeChunks(chunks, size) };
}

async function readBoundedResponse(response, limit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) throw new Error("Provider response exceeded size limit.");
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return decodeChunks(chunks, size);
}

function decodeChunks(chunks, size) {
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function isFreshTimestamp(timestamp) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && Math.abs(Math.floor(Date.now() / 1000) - seconds) <= MAX_REQUEST_AGE_SECONDS;
}

async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function hmacHex(secret, value) {
  return Array.from(await hmacBytes(secret, value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyHmacHex(secret, value, received) {
  if (!secret || !/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = await hmacBytes(secret, value);
  const candidate = Uint8Array.from(received.match(/.{2}/g), (part) => Number.parseInt(part, 16));
  return expected.byteLength === candidate.byteLength && crypto.subtle.timingSafeEqual(expected, candidate);
}

async function verifyHmacBase64(secret, value, received) {
  if (!secret || !received) return false;
  const expected = await hmacBytes(secret, value);
  let candidate;
  try {
    candidate = Uint8Array.from(atob(received), (character) => character.charCodeAt(0));
  } catch {
    return false;
  }
  return expected.byteLength === candidate.byteLength && crypto.subtle.timingSafeEqual(expected, candidate);
}

function safeError(error) {
  return String(error?.message || error || "unknown").slice(0, 500);
}

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
