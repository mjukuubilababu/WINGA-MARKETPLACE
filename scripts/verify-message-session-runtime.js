const RENDER_ORIGIN = "https://winga-pflp.onrender.com";
const { randomUUID } = require("node:crypto");

class ProbeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Logout and the optional synthetic message each require separate explicit consent.
async function verifySessionRevocation({
  revokeToken, controlToken, allowLogout = false, origin = RENDER_ORIGIN,
  senderToken, receiverUsername, allowMessageSend = false,
  fetchImpl = fetch, timeoutMs = 65000
} = {}) {
  const result = { ok: false, origin, logoutAttempted: false, logoutConfirmed: false,
    messageSendAttempted: false, messageSendConfirmed: false };
  const messageProbe = Boolean(senderToken || receiverUsername || allowMessageSend);
  let probeText = "", messageId = "", messageSender = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const streams = [];
  const requireCheck = (condition, code) => { if (!condition) throw new ProbeError(code); };
  async function request(path, token, options = {}) {
    return fetchImpl(origin + path, {
      ...options, redirect: "error",
      headers: { Cookie: `winga_auth=${encodeURIComponent(token)}`, ...options.headers },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    });
  }
  async function sessions(token) {
    const response = await request("/api/auth/sessions", token);
    requireCheck(response.status === 200, "SESSION_PREFLIGHT_FAILED");
    requireCheck(response.headers.get("cache-control")?.includes("no-store"), "SESSION_CACHE_UNSAFE");
    const body = await response.json();
    requireCheck(Array.isArray(body.items), "SESSION_CONTRACT_INVALID");
    return body.items;
  }
  async function csrfHeaders(token) {
    const response = await request("/api/auth/csrf-token", token);
    requireCheck(response.status === 200, "CSRF_PREFLIGHT_FAILED");
    const csrf = await response.json();
    const cookie = response.headers.get("set-cookie")?.match(/(?:^|,\s*)winga_csrf=([^;,]+)/)?.[1];
    requireCheck(csrf.csrfToken && cookie, "CSRF_CONTRACT_INVALID");
    return { Cookie: `winga_auth=${encodeURIComponent(token)}; winga_csrf=${cookie}`,
      "X-CSRF-Token": csrf.csrfToken };
  }
  async function waitFor(predicate, code) {
    while (!predicate()) {
      requireCheck(!controller.signal.aborted, code);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    requireCheck(!controller.signal.aborted, code);
  }
  async function openStream(token) {
    // A stream uses the overall deadline, not the shorter ordinary HTTP deadline.
    const response = await fetchImpl(origin + "/api/messages/stream", {
      headers: { Cookie: `winga_auth=${encodeURIComponent(token)}` },
      redirect: "error", signal: controller.signal
    });
    requireCheck(response.status === 200 && response.headers.get("content-type")?.includes("text/event-stream")
      && response.body, "STREAM_OPEN_FAILED");
    const reader = response.body.getReader();
    const state = { reader, welcome: false, pings: 0, events: 0, ended: false, error: false,
      matches: [], receivedBytes: 0 };
    streams.push(state);
    state.task = (async () => {
      const decoder = new TextDecoder();
      let buffer = "", event = "", data = "";
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) { state.ended = true; return; }
          state.receivedBytes += part.value.byteLength;
          buffer += decoder.decode(part.value, { stream: true });
          requireCheck(buffer.length <= 262144, "STREAM_FRAME_TOO_LARGE");
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (messageProbe && line.startsWith("data:")) {
              data += line.slice(5).replace(/^ /, "") + "\n";
              requireCheck(data.length <= 262144, "STREAM_FRAME_TOO_LARGE");
            }
            if (!line) {
              if (event) state.events += 1;
              if (event === "welcome") state.welcome = true;
              else if (event === "ping") state.pings += 1;
              if (messageProbe && event === "message") {
                const message = JSON.parse(data).message;
                if (message?.message === probeText && message.receiverId === receiverUsername) {
                  requireCheck(state.matches.length < 32, "PROBE_EVENT_LIMIT");
                  state.matches.push({ id: message.id, senderId: message.senderId });
                }
              }
              event = "";
              data = "";
            }
            // Only synthetic-message references are retained; private data is never printed.
          }
        }
      } catch (_error) { state.error = true; }
    })();
    await waitFor(() => state.welcome || state.ended || state.error, "WELCOME_TIMEOUT");
    requireCheck(state.welcome && !state.ended && !state.error, "WELCOME_FAILED");
    return state;
  }
  try {
    requireCheck(allowLogout === true, "EXPLICIT_LOGOUT_CONSENT_REQUIRED");
    requireCheck(typeof revokeToken === "string" && revokeToken.trim()
      && typeof controlToken === "string" && controlToken.trim(), "TWO_SESSION_TOKENS_REQUIRED");
    requireCheck(revokeToken !== controlToken, "SESSIONS_MUST_DIFFER");
    if (messageProbe) {
      requireCheck(allowMessageSend === true, "EXPLICIT_MESSAGE_CONSENT_REQUIRED");
      requireCheck(typeof senderToken === "string" && senderToken.trim()
        && senderToken !== revokeToken && senderToken !== controlToken, "THIRD_SESSION_REQUIRED");
      requireCheck(typeof receiverUsername === "string" && /^[a-z0-9_.-]{1,40}$/.test(receiverUsername), "TEST_RECEIVER_REQUIRED");
    }
    const first = await sessions(revokeToken), second = await sessions(controlToken);
    const revokedId = first.find(item => item.current)?.sessionId;
    const controlId = second.find(item => item.current)?.sessionId;
    requireCheck(revokedId && controlId && revokedId !== controlId
      && first.some(item => item.sessionId === controlId)
      && second.some(item => item.sessionId === revokedId), "SAME_ACCOUNT_SESSIONS_REQUIRED");
    let senderHeaders;
    const probeId = messageProbe ? randomUUID() : "";
    if (messageProbe) {
      const senderSessions = await sessions(senderToken);
      requireCheck(senderSessions.some(item => item.current && item.sessionId)
        && !senderSessions.some(item => first.some(receiver => receiver.sessionId === item.sessionId)), "SEPARATE_SENDER_ACCOUNT_REQUIRED");
      const capability = await request("/api/messages/capabilities", senderToken);
      requireCheck(capability.ok && (await capability.json()).durableMessageRetries === true, "DURABLE_SEND_REQUIRED");
      senderHeaders = await csrfHeaders(senderToken);
      probeText = `Winga session security test. No action required. ${probeId}`;
    }
    const logoutHeaders = await csrfHeaders(revokeToken);
    const revoked = await openStream(revokeToken), control = await openStream(controlToken);
    requireCheck(!revoked.ended && !revoked.error && !control.ended && !control.error, "STREAM_CLOSED_BEFORE_LOGOUT");
    const initialEvents = revoked.events;
    const initialBytes = revoked.receivedBytes;
    result.logoutAttempted = true;
    const logout = await request("/api/auth/logout", revokeToken, {
      method: "POST", headers: logoutHeaders
    });
    requireCheck(logout.status === 200 && (await logout.json()).ok === true, "LOGOUT_NOT_CONFIRMED");
    result.logoutConfirmed = true;
    const controlPings = control.pings;
    if (messageProbe) {
      result.messageSendAttempted = true;
      const sent = await request("/api/messages", senderToken, {
        method: "POST", headers: { ...senderHeaders, "Content-Type": "application/json", "Idempotency-Key": probeId },
        body: JSON.stringify({ receiverId: receiverUsername, message: probeText, clientMessageId: probeId })
      });
      requireCheck(sent.ok, "PROBE_SEND_NOT_CONFIRMED");
      const message = await sent.json();
      requireCheck(typeof message.id === "string" && message.id && message.message === probeText
        && message.receiverId === receiverUsername && typeof message.senderId === "string"
        && message.senderId && message.senderId !== receiverUsername, "PROBE_ACK_INVALID");
      result.messageSendConfirmed = true;
      messageId = message.id;
      messageSender = message.senderId;
    }
    await waitFor(() => revoked.ended || revoked.error, "REVOKED_STREAM_STILL_OPEN");
    requireCheck(revoked.ended && !revoked.error, "REVOKED_STREAM_INTERRUPTED_NOT_PROVEN");
    requireCheck(revoked.events === initialEvents, "POST_LOGOUT_EVENT_OBSERVED");
    requireCheck(revoked.receivedBytes === initialBytes, "POST_LOGOUT_PARTIAL_DATA_OBSERVED");
    await waitFor(() => control.pings > controlPings || control.ended || control.error, "CONTROL_HEARTBEAT_TIMEOUT");
    requireCheck(!control.ended && !control.error && control.pings > controlPings, "CONTROL_STREAM_FAILED");
    if (messageProbe) {
      const received = () => control.matches.some(message => message.id === messageId && message.senderId === messageSender);
      await waitFor(() => received() || control.ended || control.error, "CONTROL_MESSAGE_TIMEOUT");
      requireCheck(received() && !control.ended && !control.error, "CONTROL_MESSAGE_NOT_RECEIVED");
    }
    const denied = await request("/api/auth/sessions", revokeToken);
    requireCheck(denied.status === 401, "REVOKED_SESSION_NOT_DENIED");
    await denied.body?.cancel();
    const remaining = await sessions(controlToken);
    requireCheck(remaining.some(item => item.current && item.sessionId === controlId)
      && !remaining.some(item => item.sessionId === revokedId), "SESSION_ISOLATION_FAILED");
    return { ...result, ok: true, authenticated: true, sameAccount: true,
      revokedStreamClosed: true, revokedSessionDenied: true, controlSessionAlive: true,
      controlHeartbeatObserved: true, idleRevocationProven: !messageProbe,
      messageDeliveryRevocationProven: messageProbe, crossNodeFailoverProven: false };
  } catch (error) {
    return { ...result, errorCode: error instanceof ProbeError ? error.code : "PROBE_REQUEST_FAILED" };
  } finally {
    clearTimeout(timer);
    controller.abort();
    for (const stream of streams) await stream.reader.cancel().catch(() => {});
    await Promise.all(streams.map(stream => stream.task));
  }
}

if (require.main === module) {
  verifySessionRevocation({
    revokeToken: process.env.WINGA_REVOKE_SESSION_TOKEN,
    controlToken: process.env.WINGA_CONTROL_SESSION_TOKEN,
    allowLogout: process.argv.includes("--revoke-probe-session"),
    senderToken: process.env.WINGA_SENDER_SESSION_TOKEN,
    receiverUsername: process.env.WINGA_TEST_RECEIVER,
    allowMessageSend: process.argv.includes("--send-probe-message")
  }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  });
}

module.exports = { verifySessionRevocation };
