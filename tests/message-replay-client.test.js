const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(fetchJson, reconcile = async () => {}) {
  const listeners = {};
  const timers = new Map();
  let current = true;
  const context = { window: {}, URLSearchParams, setTimeout(fn) { const id = {}; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/api/communications-client.js"), "utf8"), context);
  const client = context.window.WingaModules.api.communications.createCommunicationsApiClient({
    baseUrl: "/api", fetchJson,
    getEventSource: () => class { addEventListener(name, fn) { listeners[name] = fn; } close() {} }
  });
  const state = { owner: "a", cursor: "old" };
  const channel = client.openRealtimeChannel({ replayState: state, reconcile, isCurrent: () => current });
  return { state, channel, open: () => listeners.open(), changed: () => listeners.message_state_changed(), timers, switchUser() { current = false; } };
}
const page = (cursor, extra = {}) => ({ version: 1, events: [], cursor, hasMore: false, ...extra });

test("SSE open and reconnect checkpoint only after canonical reconciliation", async () => {
  let finish;
  let gets = 0;
  const app = setup(async url => { assert.match(url, /messages\/replay/); gets++; return page("new"); }, () => new Promise(resolve => { finish = resolve; }));
  const first = app.open();
  await new Promise(setImmediate);
  assert.equal(app.state.cursor, "old");
  await app.open();
  assert.equal(gets, 1);
  finish(); await first;
  assert.equal(app.state.cursor, "new");
  const second = app.open(); await new Promise(setImmediate); finish(); await second;
  assert.equal(gets, 2);
});

test("closed channel and account switch cannot commit late checkpoints", async () => {
  for (const close of [true, false]) {
    let finish;
    let reconciled = 0;
    const app = setup(() => new Promise(resolve => { finish = resolve; }), async () => { reconciled++; });
    const running = app.open();
    if (close) app.channel.close(); else app.switchUser();
    finish(page("other")); await running;
    assert.equal(app.state.cursor, "old"); assert.equal(reconciled, 0);
  }
});

test("unavailable replay retains checkpoint and invokes refresh fallback", async () => {
  let reconciled = 0;
  const app = setup(async () => { throw Object.assign(new Error("offline"), { status: 503 }); }, async () => { reconciled++; });
  await app.open();
  assert.equal(app.state.cursor, "old"); assert.equal(reconciled, 1);
});

test("failed reconciliation never commits fetched checkpoint", async () => {
  const app = setup(async () => page("new"), async () => { throw new Error("refresh failed"); });
  await app.open(); assert.equal(app.state.cursor, "old");
});

test("invalid cursor resyncs, reconciles and schedules post-checkpoint catch-up", async () => {
  const urls = [];
  const app = setup(async url => {
    urls.push(url);
    if (urls.length === 1) throw Object.assign(new Error("expired"), { status: 400 });
    return page("head", { resyncRequired: true });
  });
  await app.open();
  assert.match(urls[0], /cursor=old/); assert.doesNotMatch(urls[1], /cursor=/);
  assert.equal(app.state.cursor, "head"); assert.equal(app.timers.size, 1);
  app.channel.close(); assert.equal(app.timers.size, 0);
});

test("catch-up yields after five bounded pages including hidden-event pages", async () => {
  let gets = 0;
  const app = setup(async () => page(String(++gets), { hasMore: true }));
  await app.open();
  assert.equal(gets, 5); assert.equal(app.state.cursor, "5"); assert.equal(app.timers.size, 1);
});

test("malformed and nonadvancing pages cannot replace checkpoint", async () => {
  for (const result of [{}, page("old", { hasMore: true })]) {
    const app = setup(async () => result);
    await app.open(); assert.equal(app.state.cursor, "old"); assert.equal(app.timers.size, 0);
  }
});

test("state change during reconciliation schedules catch-up without advancing early", async () => {
  let finish;
  let gets = 0;
  const app = setup(async () => page(String(++gets)), () => new Promise(resolve => { finish = resolve; }));
  const running = app.open();
  await new Promise(setImmediate);
  await app.changed();
  await app.changed();
  assert.equal(app.state.cursor, "old");
  assert.equal(gets, 1);
  finish(); await running;
  assert.equal(app.timers.size, 1);
  const followUp = [...app.timers.values()][0]();
  await new Promise(setImmediate);
  assert.equal(gets, 2);
  finish(); await followUp;
  assert.equal(app.state.cursor, "2");
  app.channel.close();
  await app.changed();
  assert.equal(gets, 2);
});

test("mutation barrier reconciles first and catches messages after the captured head", async () => {
  const urls = [];
  const flags = [];
  let reconciled = 0;
  const app = setup(async url => {
    urls.push(url);
    return urls.length === 1 ? page("barrier", { resyncRequired: true }) : page("after-barrier");
  }, async ({ resyncRequired }) => { flags.push(resyncRequired); reconciled++; });
  await app.changed();
  assert.equal(reconciled, 1);
  assert.equal(app.state.cursor, "barrier");
  assert.equal(app.timers.size, 1);
  await [...app.timers.values()][0]();
  assert.match(urls[1], /cursor=barrier/);
  assert.equal(reconciled, 2);
  assert.equal(app.state.cursor, "after-barrier");
  assert.deepEqual(flags, [true, false]);
});
