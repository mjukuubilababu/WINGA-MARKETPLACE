const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_DELIVERY_ATTEMPTS_PER_DESTINATION = 8;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const DELIVERY_DEDUPE_TTL_SECONDS = 24 * 60 * 60;
const PROVIDER_TIMEOUT_MS = 10_000;

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },

  async queue(batch, env) {
    await processQueueBatch(batch, env);
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    const status = getReadiness(env);
    return json({
      ok: status.ready,
      readiness: status.ready ? "ready" : "not_ready",
      worker: "winga-account-recovery-relay",
      queueEnabled: status.queueEnabled,
      dedupeEnabled: status.dedupeEnabled,
      providerEnabled: status.providerEnabled
    }, status.ready ? 200 : 503);
  }

  if (request.method !== "POST" || url.pathname !== "/v1/recovery/deliver") {
    return json({ ok: false, error: "not_found" }, 404);
  }
  if (!isJsonRequest(request)) {
    return json({ ok: false, error: "unsupported_media_type" }, 415);
  }
  if (!getReadiness(env).ready) {
    return json({ ok: false, error: "relay_not_ready" }, 503);
  }
  if (!await isAuthorized(request, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  let event;
  try {
    event = normalizeRecoveryEvent(await request.json());
  } catch (_error) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const validationError = validateRecoveryEvent(event);
  if (validationError) {
    return json({ ok: false, error: validationError }, 400);
  }

  const ingressKey = `recovery-ingress:${event.challengeId}`;
  if (await hasDedupeKey(env, ingressKey)) {
    return json({ ok: true, accepted: false, deduped: true }, 202);
  }
  if (!event.suppress && !await consumeDestinationRateLimit(event, env)) {
    return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) });
  }

  await env.ACCOUNT_RECOVERY_QUEUE.send(event, {
    contentType: "json"
  });
  await writeDedupeKey(env, ingressKey, DELIVERY_DEDUPE_TTL_SECONDS);
  logEvent("recovery_event_queued", event, { suppress: event.suppress });
  return json({ ok: true, accepted: true, queued: true }, 202);
}

async function processQueueBatch(batch, env) {
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  for (const message of messages) {
    const event = normalizeRecoveryEvent(message.body || {});
    try {
      const validationError = validateRecoveryEvent(event);
      if (validationError) {
        logEvent("recovery_event_rejected", event, { reason: validationError });
        message.ack();
        continue;
      }
      if (event.suppress || Date.parse(event.expiresAt) <= Date.now()) {
        logEvent("recovery_event_suppressed", event, {
          reason: event.suppress ? "privacy_envelope" : "expired"
        });
        message.ack();
        continue;
      }

      const deliveryKey = `recovery-delivered:${event.challengeId}`;
      if (await hasDedupeKey(env, deliveryKey)) {
        logEvent("recovery_event_deduped", event);
        message.ack();
        continue;
      }

      await sendSmsProviderEvent(event, env);
      await writeDedupeKey(env, deliveryKey, DELIVERY_DEDUPE_TTL_SECONDS);
      logEvent("recovery_event_delivered", event);
      message.ack();
    } catch (error) {
      logEvent("recovery_event_delivery_failed", event, {
        error: sanitize(error?.message || "delivery_failed", 160)
      });
      message.retry({ delaySeconds: 30 });
    }
  }
}

async function sendSmsProviderEvent(event, env) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(env.SMS_PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SMS_PROVIDER_TOKEN}`,
        "Idempotency-Key": event.challengeId,
        "User-Agent": "winga-account-recovery-relay"
      },
      body: JSON.stringify({
        version: "winga-sms-v1",
        idempotencyKey: event.challengeId,
        to: event.destination,
        message: `${env.APP_NAME || "Winga"}: recovery code yako ni ${event.code}. Itaisha baada ya dakika 10. Usimpe mtu mwingine code hii.`,
        expiresAt: event.expiresAt,
        metadata: {
          purpose: "account_recovery",
          challengeId: event.challengeId
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`SMS provider returned HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function isAuthorized(request, env) {
  const provided = String(request.headers.get("x-winga-recovery-secret") || "");
  const expected = String(env.ACCOUNT_RECOVERY_DELIVERY_WEBHOOK_SECRET || "");
  if (!provided || !expected) {
    return false;
  }
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

function normalizeRecoveryEvent(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    version: sanitize(source.version || "", 40),
    challengeId: sanitize(source.challengeId || "", 120),
    userId: sanitize(source.userId || "", 80),
    destination: String(source.destination || "").replace(/\D/g, "").slice(0, 20),
    code: String(source.code || "").replace(/\D/g, "").slice(0, 6),
    expiresAt: sanitize(source.expiresAt || "", 40),
    suppress: source.suppress === true
  };
}

function validateRecoveryEvent(event) {
  if (event.version !== "account-recovery-code-v1") return "unsupported_version";
  if (!/^recovery-[0-9a-f-]{36}$/i.test(event.challengeId)) return "invalid_challenge";
  if (!event.userId) return "invalid_user";
  if (!event.suppress && !/^\d{8,20}$/.test(event.destination)) return "invalid_destination";
  if (!/^\d{6}$/.test(event.code)) return "invalid_code";
  const expiry = Date.parse(event.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 15 * 60 * 1000) return "invalid_expiry";
  return "";
}

async function consumeDestinationRateLimit(event, env) {
  const destinationHash = await sha256Hex(event.destination);
  const bucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `recovery-rate:${destinationHash}:${bucket}`;
  const current = Number(await env.ACCOUNT_RECOVERY_DEDUPE.get(key) || 0);
  if (current >= MAX_DELIVERY_ATTEMPTS_PER_DESTINATION) {
    return false;
  }
  await env.ACCOUNT_RECOVERY_DEDUPE.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS * 2
  });
  return true;
}

async function hasDedupeKey(env, key) {
  return Boolean(await env.ACCOUNT_RECOVERY_DEDUPE.get(key));
}

async function writeDedupeKey(env, key, expirationTtl) {
  await env.ACCOUNT_RECOVERY_DEDUPE.put(key, "1", { expirationTtl });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getReadiness(env) {
  const queueEnabled = Boolean(env.ACCOUNT_RECOVERY_QUEUE?.send);
  const dedupeEnabled = Boolean(env.ACCOUNT_RECOVERY_DEDUPE?.get && env.ACCOUNT_RECOVERY_DEDUPE?.put);
  const providerEnabled = Boolean(env.SMS_PROVIDER_URL && env.SMS_PROVIDER_TOKEN);
  const secretEnabled = String(env.ACCOUNT_RECOVERY_DELIVERY_WEBHOOK_SECRET || "").length >= 32;
  return {
    ready: queueEnabled && dedupeEnabled && providerEnabled && secretEnabled,
    queueEnabled,
    dedupeEnabled,
    providerEnabled,
    secretEnabled
  };
}

function isJsonRequest(request) {
  return String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json");
}

function sanitize(value, maxLength = 120) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function logEvent(eventName, event, metadata = {}) {
  console.log(JSON.stringify({
    level: eventName.endsWith("failed") ? "error" : "info",
    event: eventName,
    challengeId: event.challengeId || "",
    time: new Date().toISOString(),
    ...metadata
  }));
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers
    }
  });
}
