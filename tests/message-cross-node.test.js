const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyCrossNodeFailover } = require("../scripts/verify-message-cross-node");

function json(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json", ...headers }
  });
}

function fixture({ oneNode = false, noEvidence = false, sendFails = false, duplicate = false } = {}) {
  const streamControllers = [];
  const calls = [];
  let sentMessage = null;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const search = new URL(url).searchParams;
    calls.push({ path, method: options.method || "GET" });
    const receiver = String(options.headers?.Cookie || "").includes("receiver-token");
    if (path === "/api/auth/session") {
      return json({ username: receiver ? "receiver" : "sender" });
    }
    if (path === "/api/messages/capabilities") {
      return json({ durableMessageReplay: true, durableMessageRetries: true });
    }
    if (path === "/api/messages/stream") {
      const index = streamControllers.length;
      const instance = oneNode || index === 0 ? "srv-node-a" : "srv-node-b";
      const stream = new ReadableStream({
        start(controller) {
          streamControllers.push(controller);
          controller.enqueue(new TextEncoder().encode("event: welcome\ndata: {}\n\n"));
        }
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          ...(noEvidence ? {} : {
            "X-Winga-Ops-Instance": instance,
            "X-Winga-Ops-Boot": instance === "srv-node-a" ? "boot-a" : "boot-b",
            "X-Winga-Ops-Commit": "commit-1"
          })
        }
      });
    }
    if (path === "/api/messages/replay") {
      if (!search.has("cursor")) {
        return json({ version: 1, resyncRequired: true, cursor: "baseline" }, { "Cache-Control": "no-store" });
      }
      return json({
        version: 1, resyncRequired: false, cursor: "after", hasMore: false,
        events: duplicate
          ? [{ type: "message_created", messageId: "message-1" }, { type: "message_created", messageId: "message-1" }]
          : [{ type: "message_created", messageId: "message-1" }]
      }, { "Cache-Control": "no-store" });
    }
    if (path === "/api/auth/csrf-token") {
      return json({ csrfToken: "csrf-value" }, { "Set-Cookie": "winga_csrf=csrf-cookie; Path=/" });
    }
    if (path === "/api/messages" && options.method === "POST") {
      sentMessage = JSON.parse(options.body);
      if (sendFails) throw new Error("unknown network outcome");
      return json({
        id: "message-1", message: sentMessage.message,
        senderId: "sender", receiverId: sentMessage.receiverId
      });
    }
    throw new Error("Unexpected request: " + path);
  };
  return {
    fetchImpl, calls, streamControllers,
    drain() { streamControllers[0].close(); },
    corruptStream() {
      streamControllers[0].enqueue(new TextEncoder().encode("data: " + "x".repeat(70000)));
      streamControllers[0].close();
    },
    get sentMessage() { return sentMessage; }
  };
}

const options = {
  origin: "https://test.example",
  receiverToken: "receiver-token",
  senderToken: "sender-token",
  receiverUsername: "receiver",
  opsToken: "ops-token",
  sampleLimit: 2,
  drainTimeoutMs: 1000
};

test("preflight proves two live instance identities without sending or draining", async () => {
  const testServer = fixture();
  const result = await verifyCrossNodeFailover({ ...options, fetchImpl: testServer.fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.twoInstancesObserved, true);
  assert.equal(result.crossNodeFailoverProven, false);
  assert.equal(testServer.sentMessage, null);
});

test("one instance or absent ops evidence cannot claim cross-node readiness", async () => {
  for (const setup of [{ oneNode: true }, { noEvidence: true }]) {
    const testServer = fixture(setup);
    const result = await verifyCrossNodeFailover({ ...options, fetchImpl: testServer.fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.crossNodeFailoverProven, false);
    assert.equal(testServer.calls.some(call => call.method === "POST"), false);
  }
});

test("exercise proves surviving node and exactly one durable replay reference", async () => {
  const testServer = fixture();
  const result = await verifyCrossNodeFailover({
    ...options, fetchImpl: testServer.fetchImpl, exercise: true, allowTestSend: true,
    confirmDrain: async (instance) => {
      assert.equal(instance, "srv-node-a");
      testServer.drain();
      return instance;
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.oldStreamClosed, true);
  assert.equal(result.survivorObserved, true);
  assert.equal(result.messageSendAttempted, true);
  assert.equal(result.messageSendConfirmed, true);
  assert.equal(result.replayedOnce, true);
  assert.equal(result.crossNodeFailoverProven, true);
  assert.match(testServer.sentMessage.message, /^Winga cross-node replay test/);
  assert.equal(testServer.calls.filter(call => call.method === "POST").length, 1);
});

test("wrong drain confirmation stops before any send", async () => {
  const testServer = fixture();
  const result = await verifyCrossNodeFailover({
    ...options, fetchImpl: testServer.fetchImpl, exercise: true, allowTestSend: true,
    confirmDrain: async () => "wrong-node"
  });
  assert.equal(result.errorCode, "TARGET_DRAIN_NOT_CONFIRMED");
  assert.equal(testServer.sentMessage, null);
});

test("a malformed oversized SSE frame cannot masquerade as node loss", async () => {
  const testServer = fixture();
  const result = await verifyCrossNodeFailover({
    ...options, fetchImpl: testServer.fetchImpl, exercise: true, allowTestSend: true,
    confirmDrain: async (instance) => { testServer.corruptStream(); return instance; }
  });
  assert.equal(result.errorCode, "TARGET_STREAM_INVALID_FAILURE");
  assert.equal(result.messageSendAttempted, false);
});

test("unknown send outcome is never retried or reported as verified", async () => {
  const testServer = fixture({ sendFails: true });
  const result = await verifyCrossNodeFailover({
    ...options, fetchImpl: testServer.fetchImpl, exercise: true, allowTestSend: true,
    confirmDrain: async (instance) => { testServer.drain(); return instance; }
  });
  assert.equal(result.errorCode, "SEND_OUTCOME_UNKNOWN");
  assert.equal(result.messageSendAttempted, true);
  assert.equal(result.messageSendConfirmed, false);
  assert.equal(result.crossNodeFailoverProven, false);
  assert.equal(testServer.calls.filter(call => call.method === "POST").length, 1);
});

test("duplicate replay references reject a false exactly-once claim", async () => {
  const testServer = fixture({ duplicate: true });
  const result = await verifyCrossNodeFailover({
    ...options, fetchImpl: testServer.fetchImpl, exercise: true, allowTestSend: true,
    confirmDrain: async (instance) => { testServer.drain(); return instance; }
  });
  assert.equal(result.errorCode, "EXACTLY_ONCE_REPLAY_NOT_PROVEN");
  assert.equal(result.crossNodeFailoverProven, false);
});
