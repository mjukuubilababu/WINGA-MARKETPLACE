const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createAuthorizedRealtimeClient } = require("../backend/realtime-client");
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(authorize, options = {}) {
  const response = new EventEmitter();
  const chunks = [];
  let closes = 0;
  response.write = chunk => { chunks.push(chunk); return true; };
  response.end = () => { response.writableEnded = true; };
  const client = createAuthorizedRealtimeClient({
    response, authorize, onClose: () => closes++, ...options
  });
  return { response, client, chunks, get closes() { return closes; } };
}

test("realtime authorizes each event in order and never writes after revocation", async () => {
  let allowed = true, checks = 0;
  const f = fixture(async () => { checks++; return allowed; });
  f.client.send("message", { id: "one" });
  f.client.send("message", { id: "two" });
  await tick();
  assert.equal(checks, 2);
  assert.match(f.chunks[0], /one/);
  assert.match(f.chunks[1], /two/);
  allowed = false;
  f.client.send("message", { id: "secret" });
  await tick();
  f.client.send("message", { id: "later" });
  assert.equal(f.chunks.length, 2);
  assert.equal(f.closes, 1);
  assert.equal(f.response.writableEnded, true);
});

test("authorization errors and timeouts close without leaking queued events", async () => {
  for (const authorize of [async () => { throw new Error("db unavailable"); }, () => new Promise(() => {})]) {
    const f = fixture(authorize, { authorizationTimeoutMs: 10 });
    f.client.send("message", { body: "private" });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(f.chunks.length, 0);
    assert.equal(f.closes, 1);
  }
});

test("disconnect during authorization discards late completion and removes listeners", async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  f.client.send("message", {});
  await tick();
  f.response.emit("close");
  release(true);
  await tick();
  assert.equal(f.chunks.length, 0);
  assert.equal(f.closes, 1);
  assert.equal(f.response.listenerCount("close"), 0);
});

test("slow-client backpressure and bounded queues terminate instead of retaining messages", async () => {
  const blocked = fixture(() => new Promise(() => {}), { maxPendingEvents: 2 });
  blocked.client.send("message", {});
  blocked.client.send("message", {});
  blocked.client.send("message", {});
  assert.equal(blocked.closes, 1);
  const oversized = fixture(async () => true, { maxPendingBytes: 8 });
  oversized.client.send("message", { body: "oversized" });
  assert.equal(oversized.closes, 1);
  const slow = fixture(async () => true);
  slow.response.write = () => false;
  slow.client.send("message", {});
  await tick();
  assert.equal(slow.closes, 1);
});

test("idle heartbeat revalidates revocation without new messages", async () => {
  const f = fixture(async () => false, { heartbeatMs: 5 });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.closes, 1);
  assert.equal(f.chunks.length, 0);
});

test("socket write errors fail closed and never escape as unhandled rejection", async () => {
  const f = fixture(async () => true);
  f.response.write = () => { throw new Error("socket gone"); };
  f.client.send("message", {});
  await tick();
  assert.equal(f.closes, 1);
});
