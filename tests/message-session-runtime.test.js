const test = require("node:test");
const assert = require("node:assert/strict");
const { verifySessionRevocation } = require("../scripts/verify-message-session-runtime");

function fixture(mode = "success") {
  const tokens = ["private-revoked-token", "private-control-token"];
  const calls = [], controllers = [], encoder = new TextEncoder();
  let loggedOut = false, cancelled = 0, disposed = false;
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }
  });
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    const token = decodeURIComponent(options.headers.Cookie.match(/winga_auth=([^;]+)/)[1]);
    calls.push({ path, method: options.method || "GET" });
    assert.equal(options.redirect, "error");
    if (path === "/api/auth/sessions") {
      if (token === "private-sender-token") return json({ items: [{
        sessionId: mode === "same-sender-account" ? "session-0" : "sender-session", current: true
      }] });
      if (loggedOut && token === tokens[0]) return json({}, 401);
      const items = tokens.flatMap((value, index) => loggedOut && index === 0 ? [] : [{
        sessionId: mode === "different-accounts" ? `${token}-${index}` : `session-${index}`,
        current: value === token
      }]);
      return json({ items, auditTrail: ["private audit data"] });
    }
    if (path === "/api/auth/csrf-token") return json({ csrfToken: "csrf-proof" }, 200, { "Set-Cookie": "winga_csrf=csrf-cookie; HttpOnly" });
    if (path === "/api/messages/capabilities") return json({ durableMessageRetries: mode !== "unsupported-send" });
    if (path === "/api/messages") {
      assert.equal(loggedOut, true);
      assert.equal(options.method, "POST");
      assert.equal(token, "private-sender-token");
      assert.equal(options.headers["X-CSRF-Token"], "csrf-proof");
      const body = JSON.parse(options.body);
      assert.equal(options.headers["Idempotency-Key"], body.clientMessageId);
      assert.equal(body.receiverId, "test_receiver");
      assert.match(body.message, /^Winga session security test\. No action required\. /);
      const message = { id: "canonical-probe-id", senderId: "test_sender", receiverId: body.receiverId, message: body.message };
      if (mode === "send-error") throw new Error("private sender error");
      if (mode === "send-rejected") return json({}, 403);
      if (mode === "ack-invalid") return json({ ...message, receiverId: "wrong" });
      const delivered = { ...message };
      if (mode === "wrong-id") delivered.id = "other-message";
      if (mode === "wrong-sender") delivered.senderId = "wrong-sender";
      if (mode === "wrong-text") delivered.message = "unrelated private message";
      if (mode === "wrong-receiver") delivered.receiverId = "wrong-receiver";
      const event = `event: message\ndata: ${JSON.stringify({ message: delivered })}\n\n`;
      if (mode !== "missing-message") {
        // Deliver before the POST acknowledgement and split the JSON over reads.
        controllers[1].enqueue(encoder.encode(event.slice(0, 30)));
        controllers[1].enqueue(encoder.encode(event.slice(30)));
      }
      if (mode === "revoked-message") controllers[0].enqueue(encoder.encode(event));
      if (mode === "revoked-partial") controllers[0].enqueue(encoder.encode("event: message\ndata: {"));
      return json(message);
    }
    if (path === "/api/messages/stream") {
      return new Response(new ReadableStream({
        start(controller) {
          controllers.push(controller);
          controller.enqueue(encoder.encode("event: wel"));
          controller.enqueue(encoder.encode("come\r\ndata: {}\r\n\r\n"));
        }, cancel() { cancelled += 1; disposed = true; }
      }), { headers: { "Content-Type": "text/event-stream" } });
    }
    assert.equal(path, "/api/auth/logout");
    assert.equal(options.method, "POST");
    assert.equal(token, tokens[0]);
    assert.equal(options.headers["X-CSRF-Token"], "csrf-proof");
    assert.match(options.headers.Cookie, /winga_csrf=csrf-cookie/);
    loggedOut = true;
    if (mode === "unconfirmed") return json({ ok: false });
    if (mode === "request-error") throw new Error(tokens[0]);
    setTimeout(() => {
      if (disposed) return;
      if (mode === "network-error") controllers[0].error(new Error("private error"));
      else if (mode !== "never-closes") {
        if (mode === "private-event") controllers[0].enqueue(encoder.encode("event: message\ndata: private message text\n\n"));
        if (mode === "revoked-ping") controllers[0].enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
        if (mode === "partial-event") controllers[0].enqueue(encoder.encode("event: message\ndata: {"));
        controllers[0].close();
      }
      if (mode === "control-closes") controllers[1].close();
      else controllers[1].enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
    }, 10);
    return json({ ok: true });
  };
  return {
    calls, cancelled: () => cancelled,
    run: (extra = {}) => verifySessionRevocation({
      revokeToken: tokens[0], controlToken: tokens[1], allowLogout: true,
      timeoutMs: 500, fetchImpl, ...extra
    })
  };
}

const messageOptions = {
  senderToken: "private-sender-token", receiverUsername: "test_receiver", allowMessageSend: true
};

test("message probe requires separate consent and a distinct sender before any request", async () => {
  for (const [options, code] of [
    [{ ...messageOptions, allowMessageSend: false }, "EXPLICIT_MESSAGE_CONSENT_REQUIRED"],
    [{ ...messageOptions, senderToken: "private-control-token" }, "THIRD_SESSION_REQUIRED"],
    [{ ...messageOptions, receiverUsername: "" }, "TEST_RECEIVER_REQUIRED"]
  ]) {
    const f = fixture(), result = await f.run(options);
    assert.equal(result.errorCode, code);
    assert.equal(f.calls.length, 0);
  }
});

for (const [mode, code] of [["same-sender-account", "SEPARATE_SENDER_ACCOUNT_REQUIRED"], ["unsupported-send", "DURABLE_SEND_REQUIRED"]]) {
  test(`message preflight rejects ${mode} without any mutation`, async () => {
    const f = fixture(mode), result = await f.run(messageOptions);
    assert.equal(result.errorCode, code);
    assert.equal(result.logoutAttempted, false);
    assert.equal(result.messageSendAttempted, false);
    assert.equal(f.calls.some(call => call.method === "POST"), false);
  });
}

test("message probe correlates exact canonical acknowledgement with SSE before ACK", async () => {
  const f = fixture(), result = await f.run(messageOptions);
  assert.equal(result.ok, true);
  assert.equal(result.messageSendConfirmed, true);
  assert.equal(result.messageDeliveryRevocationProven, true);
  assert.equal(result.idleRevocationProven, false);
  assert.equal(result.crossNodeFailoverProven, false);
  assert.deepEqual(f.calls.filter(call => call.method === "POST"), [
    { path: "/api/auth/logout", method: "POST" }, { path: "/api/messages", method: "POST" }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private-|canonical-probe|test_receiver|test_sender|csrf-proof/);
});

for (const [mode, code] of [
  ["wrong-id", "CONTROL_MESSAGE_TIMEOUT"], ["wrong-sender", "CONTROL_MESSAGE_TIMEOUT"],
  ["wrong-text", "CONTROL_MESSAGE_TIMEOUT"], ["wrong-receiver", "CONTROL_MESSAGE_TIMEOUT"],
  ["missing-message", "CONTROL_MESSAGE_TIMEOUT"], ["revoked-message", "POST_LOGOUT_EVENT_OBSERVED"],
  ["revoked-partial", "POST_LOGOUT_PARTIAL_DATA_OBSERVED"],
  ["send-error", "PROBE_REQUEST_FAILED"], ["send-rejected", "PROBE_SEND_NOT_CONFIRMED"],
  ["ack-invalid", "PROBE_ACK_INVALID"]
]) {
  test(`message proof fails without retrying or exposing content: ${mode}`, async () => {
    const f = fixture(mode), result = await f.run(messageOptions);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, code);
    assert.equal(result.messageSendAttempted, true);
    assert.equal(f.calls.filter(call => call.path === "/api/messages").length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-|canonical-probe|test_receiver|test_sender|csrf-proof/);
  });
}

test("runtime revocation requires explicit consent and two different sessions before any request", async () => {
  for (const [input, code] of [
    [{ allowLogout: false }, "EXPLICIT_LOGOUT_CONSENT_REQUIRED"],
    [{ revokeToken: "" }, "TWO_SESSION_TOKENS_REQUIRED"],
    [{ controlToken: "private-revoked-token" }, "SESSIONS_MUST_DIFFER"]
  ]) {
    const f = fixture();
    const result = await f.run(input);
    assert.equal(result.errorCode, code);
    assert.equal(result.logoutAttempted, false);
    assert.equal(f.calls.length, 0);
  }
});

test("different accounts cannot pass the session isolation preflight", async () => {
  const f = fixture("different-accounts"), result = await f.run();
  assert.equal(result.errorCode, "SAME_ACCOUNT_SESSIONS_REQUIRED");
  assert.equal(f.calls.some(call => call.method === "POST"), false);
});

test("runtime probe proves idle revocation without sending messages or disclosing private data", async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.idleRevocationProven, true);
  assert.equal(result.messageDeliveryRevocationProven, false);
  assert.equal(result.crossNodeFailoverProven, false);
  assert.deepEqual(f.calls.filter(call => call.method === "POST"), [{ path: "/api/auth/logout", method: "POST" }]);
  assert.doesNotMatch(JSON.stringify(result), /private-|session-\d|csrf-proof|audit data/);
  assert.equal(f.cancelled(), 1);
});

for (const [mode, code] of [
  ["never-closes", "REVOKED_STREAM_STILL_OPEN"],
  ["network-error", "REVOKED_STREAM_INTERRUPTED_NOT_PROVEN"],
  ["control-closes", "CONTROL_STREAM_FAILED"],
  ["private-event", "POST_LOGOUT_EVENT_OBSERVED"],
  ["revoked-ping", "POST_LOGOUT_EVENT_OBSERVED"],
  ["partial-event", "POST_LOGOUT_PARTIAL_DATA_OBSERVED"],
  ["unconfirmed", "LOGOUT_NOT_CONFIRMED"],
  ["request-error", "PROBE_REQUEST_FAILED"]
]) {
  test(`runtime probe fails safely: ${mode}`, async () => {
    const result = await fixture(mode).run();
    assert.equal(result.ok, false);
    assert.equal(result.logoutAttempted, true);
    assert.equal(result.errorCode, code);
    assert.doesNotMatch(JSON.stringify(result), /private-|private message|csrf-proof/);
  });
}
