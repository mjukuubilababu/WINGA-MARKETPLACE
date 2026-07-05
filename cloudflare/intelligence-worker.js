const DEFAULT_ORIGIN_BASE_URL = "https://winga-pflp.onrender.com";

export default {
  async fetch() {
    return new Response(JSON.stringify({
      ok: true,
      worker: "winga-intelligence-worker"
    }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  },

  async queue(batch, env, ctx) {
    ctx.waitUntil(forwardIntelligenceQueueBatch(batch, env));
  }
};

async function forwardIntelligenceQueueBatch(batch, env) {
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  if (!messages.length) {
    return;
  }

  const secret = String(env?.QUEUE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    messages.forEach((message) => message.retry?.());
    throw new Error("QUEUE_WEBHOOK_SECRET is required for Winga intelligence queue forwarding.");
  }

  const payload = {
    source: "cloudflare-queue",
    messages: messages.map((message) => normalizeQueueMessageBody(message?.body))
  };

  const response = await fetch(`${getOriginBaseUrl(env)}/api/intelligence/queue-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Winga-Queue-Secret": secret,
      "User-Agent": "winga-intelligence-queue-consumer"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    messages.forEach((message) => message.retry?.());
    throw new Error(`Winga intelligence queue forward failed with ${response.status}`);
  }

  messages.forEach((message) => message.ack?.());
}

function normalizeQueueMessageBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return { raw: body };
    }
  }
  return { raw: body ?? null };
}

function getOriginBaseUrl(env) {
  return String(env?.ORIGIN_BASE_URL || env?.ORIGIN || DEFAULT_ORIGIN_BASE_URL).replace(/\/+$/, "");
}
