const RENDER_ORIGIN = "https://winga-pflp.onrender.com";

class ProbeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Explicitly logs out only the designated probe session. Never sends messages.
async function verifySessionRevocation({
  revokeToken, controlToken, allowLogout = false, origin = RENDER_ORIGIN,
  fetchImpl = fetch, timeoutMs = 65000
} = {}) {
  const result = { ok: false, origin, logoutAttempted: false, logoutConfirmed: false };
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
    const state = { reader, welcome: false, pings: 0, events: 0, ended: false, error: false };
    streams.push(state);
    state.task = (async () => {
      const decoder = new TextDecoder();
      let buffer = "", event = "";
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) { state.ended = true; return; }
          buffer += decoder.decode(part.value, { stream: true });
          requireCheck(buffer.length <= 262144, "STREAM_FRAME_TOO_LARGE");
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (!line) {
              if (event) state.events += 1;
              if (event === "welcome") state.welcome = true;
              else if (event === "ping") state.pings += 1;
              event = "";
            }
            // Private data lines are discarded, never parsed or printed.
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
    const first = await sessions(revokeToken), second = await sessions(controlToken);
    const revokedId = first.find(item => item.current)?.sessionId;
    const controlId = second.find(item => item.current)?.sessionId;
    requireCheck(revokedId && controlId && revokedId !== controlId
      && first.some(item => item.sessionId === controlId)
      && second.some(item => item.sessionId === revokedId), "SAME_ACCOUNT_SESSIONS_REQUIRED");
    const csrfResponse = await request("/api/auth/csrf-token", revokeToken);
    requireCheck(csrfResponse.status === 200, "CSRF_PREFLIGHT_FAILED");
    const csrf = await csrfResponse.json();
    const csrfCookie = csrfResponse.headers.get("set-cookie")?.match(/(?:^|,\s*)winga_csrf=([^;,]+)/)?.[1];
    requireCheck(csrf.csrfToken && csrfCookie, "CSRF_CONTRACT_INVALID");
    const revoked = await openStream(revokeToken), control = await openStream(controlToken);
    requireCheck(!revoked.ended && !revoked.error && !control.ended && !control.error, "STREAM_CLOSED_BEFORE_LOGOUT");
    const initialEvents = revoked.events;
    result.logoutAttempted = true;
    const logout = await request("/api/auth/logout", revokeToken, {
      method: "POST", headers: {
        Cookie: `winga_auth=${encodeURIComponent(revokeToken)}; winga_csrf=${csrfCookie}`,
        "X-CSRF-Token": csrf.csrfToken
      }
    });
    requireCheck(logout.status === 200 && (await logout.json()).ok === true, "LOGOUT_NOT_CONFIRMED");
    result.logoutConfirmed = true;
    const controlPings = control.pings;
    await waitFor(() => revoked.ended || revoked.error, "REVOKED_STREAM_STILL_OPEN");
    requireCheck(revoked.ended && !revoked.error, "REVOKED_STREAM_INTERRUPTED_NOT_PROVEN");
    requireCheck(revoked.events === initialEvents, "POST_LOGOUT_EVENT_OBSERVED");
    await waitFor(() => control.pings > controlPings || control.ended || control.error, "CONTROL_HEARTBEAT_TIMEOUT");
    requireCheck(!control.ended && !control.error && control.pings > controlPings, "CONTROL_STREAM_FAILED");
    const denied = await request("/api/auth/sessions", revokeToken);
    requireCheck(denied.status === 401, "REVOKED_SESSION_NOT_DENIED");
    await denied.body?.cancel();
    const remaining = await sessions(controlToken);
    requireCheck(remaining.some(item => item.current && item.sessionId === controlId)
      && !remaining.some(item => item.sessionId === revokedId), "SESSION_ISOLATION_FAILED");
    return { ...result, ok: true, authenticated: true, sameAccount: true,
      revokedStreamClosed: true, revokedSessionDenied: true, controlSessionAlive: true,
      controlHeartbeatObserved: true, idleRevocationProven: true,
      messageDeliveryRevocationProven: false, crossNodeFailoverProven: false };
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
    allowLogout: process.argv.includes("--revoke-probe-session")
  }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  });
}

module.exports = { verifySessionRevocation };
