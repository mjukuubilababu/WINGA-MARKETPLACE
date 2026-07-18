const MAX_EVENT_BYTES = 32 * 1024;
const DEDUPE_TTL_SECONDS = 15 * 60;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_RATE_LIMIT_MAX_EVENTS = 120;

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  async queue(batch, env, ctx) {
    ctx.waitUntil(processQueueBatch(batch, env));
  }
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      ok: true,
      worker: "winga-session-security-relay",
      queueEnabled: Boolean(env.SESSION_SECURITY_QUEUE),
      dedupeEnabled: Boolean(env.SESSION_SECURITY_DEDUPE),
      destinations: getDestinationSummary(env)
    });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!await isAuthorized(request, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_EVENT_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  let event;
  try {
    event = normalizeSessionSecurityEvent(await request.json());
  } catch (_error) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!event.userId || !event.event) {
    return json({ ok: false, error: "invalid_event" }, 400);
  }

  const dedupe = await dedupeEvent(event, env);
  if (dedupe.duplicate) {
    return json({ ok: true, accepted: false, deduped: true, dedupeKey: dedupe.key }, 202);
  }

  if (!await checkRateLimit(event, env)) {
    return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  if (env.SESSION_SECURITY_QUEUE?.send) {
    await env.SESSION_SECURITY_QUEUE.send(event);
    return json({ ok: true, accepted: true, queued: true, dedupeKey: dedupe.key }, 202);
  }

  ctx.waitUntil(deliverSessionSecurityEvent(event, env));
  return json({ ok: true, accepted: true, queued: false, dedupeKey: dedupe.key }, 202);
}

async function processQueueBatch(batch, env) {
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  for (const message of messages) {
    try {
      const event = normalizeSessionSecurityEvent(message.body || {});
      await deliverSessionSecurityEvent(event, env);
      message.ack?.();
    } catch (error) {
      message.retry?.();
      throw error;
    }
  }
}

async function deliverSessionSecurityEvent(event, env) {
  const destinations = [];
  if (env.SESSION_SECURITY_OPS_WEBHOOK_URL) {
    destinations.push(sendOpsWebhook(event, env));
  }
  if (env.EMAIL_PROVIDER_URL && env.EMAIL_PROVIDER_TOKEN) {
    destinations.push(sendEmailProviderEvent(event, env));
  }
  if (!destinations.length) {
    return { delivered: false, reason: "no_destination_configured" };
  }
  const results = await Promise.allSettled(destinations);
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    throw new Error(`session security delivery failed for ${failed.length} destination(s)`);
  }
  return { delivered: true, destinations: results.length };
}

async function sendOpsWebhook(event, env) {
  const response = await fetch(env.SESSION_SECURITY_OPS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.SESSION_SECURITY_OPS_WEBHOOK_SECRET
        ? { "X-Winga-Session-Ops-Secret": String(env.SESSION_SECURITY_OPS_WEBHOOK_SECRET) }
        : {})
    },
    body: JSON.stringify({
      source: "winga-session-security-relay",
      event
    })
  });
  if (!response.ok) {
    throw new Error(`ops webhook failed with ${response.status}`);
  }
}

async function sendEmailProviderEvent(event, env) {
  const response = await fetch(env.EMAIL_PROVIDER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}`
    },
    body: JSON.stringify(buildEmailPayload(event, env))
  });
  if (!response.ok) {
    throw new Error(`email provider failed with ${response.status}`);
  }
}

function buildEmailPayload(event, env) {
  const appName = env.APP_NAME || "Winga";
  const subject = `${appName} security: ${event.event.replace(/_/g, " ")}`;
  const body = [
    `${appName} account security event`,
    "",
    `Event: ${event.event}`,
    `Account: ${event.userId}`,
    `Device: ${event.deviceType || "unknown"}`,
    `Risk: ${event.riskLevel || "low"} (${event.riskScore || 0})`,
    `Time: ${event.createdAt}`,
    "",
    "If this was not you, open Winga and revoke unknown sessions from Profile > Security."
  ].join("\n");
  return {
    from: env.EMAIL_FROM || "security@wingamarket.com",
    to: event.email || env.SECURITY_TEST_RECIPIENT || "",
    subject,
    text: body,
    metadata: {
      event: event.event,
      sessionId: event.sessionId,
      userId: event.userId
    }
  };
}

async function isAuthorized(request, env) {
  const expected = String(env.SESSION_SECURITY_WEBHOOK_SECRET || "").trim();
  const provided = String(request.headers.get("x-winga-session-security-secret") || "").trim();
  if (!expected || !provided) {
    return false;
  }
  return await secureEqual(provided, expected);
}

async function secureEqual(first, second) {
  const [firstHash, secondHash] = await Promise.all([sha256(first), sha256(second)]);
  return firstHash === secondHash;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function dedupeEvent(event, env) {
  const key = `session-security:${event.event}:${event.userId}:${event.sessionId || "no-session"}:${Math.floor(Date.now() / (DEDUPE_TTL_SECONDS * 1000))}`;
  if (!env.SESSION_SECURITY_DEDUPE?.get || !env.SESSION_SECURITY_DEDUPE?.put) {
    return { duplicate: false, key, durable: false };
  }
  const existing = await env.SESSION_SECURITY_DEDUPE.get(key);
  if (existing) {
    return { duplicate: true, key, durable: true };
  }
  await env.SESSION_SECURITY_DEDUPE.put(key, "1", { expirationTtl: DEDUPE_TTL_SECONDS });
  return { duplicate: false, key, durable: true };
}

async function checkRateLimit(event, env) {
  if (!env.SESSION_SECURITY_DEDUPE?.get || !env.SESSION_SECURITY_DEDUPE?.put) {
    return true;
  }
  const windowSeconds = Math.max(10, Number(env.RATE_LIMIT_WINDOW_SECONDS || DEFAULT_RATE_LIMIT_WINDOW_SECONDS) || DEFAULT_RATE_LIMIT_WINDOW_SECONDS);
  const maxEvents = Math.max(10, Number(env.RATE_LIMIT_MAX_EVENTS || DEFAULT_RATE_LIMIT_MAX_EVENTS) || DEFAULT_RATE_LIMIT_MAX_EVENTS);
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `session-security-rate:${event.userId}:${bucket}`;
  const current = Number(await env.SESSION_SECURITY_DEDUPE.get(key) || 0) || 0;
  if (current >= maxEvents) {
    return false;
  }
  await env.SESSION_SECURITY_DEDUPE.put(key, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}

function normalizeSessionSecurityEvent(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const event = sanitize(source.event || "session_security_event", 80);
  return {
    version: sanitize(source.version || "session-security-event-v1", 40),
    event,
    userId: sanitize(source.userId || "", 80),
    sessionId: sanitize(source.sessionId || "", 100),
    deviceType: ["mobile", "tablet", "desktop", "unknown"].includes(source.deviceType) ? source.deviceType : "unknown",
    riskLevel: ["low", "medium", "high"].includes(source.riskLevel) ? source.riskLevel : "low",
    riskScore: Math.max(0, Math.min(Number(source.riskScore || 0) || 0, 10)),
    reasons: Array.isArray(source.reasons) ? source.reasons.slice(0, 8).map((item) => sanitize(item, 80)).filter(Boolean) : [],
    ipHash: sanitize(source.ipHash || "", 120),
    userAgentHash: sanitize(source.userAgentHash || "", 120),
    cfRay: sanitize(source.cfRay || "", 120),
    createdAt: sanitize(source.createdAt || new Date().toISOString(), 40),
    email: sanitize(source.email || "", 160),
    metadata: sanitizeObject(source.metadata || {})
  };
}

function sanitizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).slice(0, 8).map(([key, item]) => [sanitize(key, 60), sanitize(item, 160)]));
}

function sanitize(value, maxLength = 120) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function getDestinationSummary(env) {
  return {
    opsWebhook: Boolean(env.SESSION_SECURITY_OPS_WEBHOOK_URL),
    emailProvider: Boolean(env.EMAIL_PROVIDER_URL && env.EMAIL_PROVIDER_TOKEN),
    dryRun: !env.SESSION_SECURITY_OPS_WEBHOOK_URL && !(env.EMAIL_PROVIDER_URL && env.EMAIL_PROVIDER_TOKEN)
  };
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}
