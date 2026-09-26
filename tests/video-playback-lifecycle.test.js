const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/marketplace/video-playback.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(options = {}) {
  const timers = new Map();
  const observers = [];
  const requests = [];
  let timerId = 0;
  const nodes = Array.from({ length: options.count || 8 }, (_, index) => {
    const classes = new Set();
    const listeners = new Map();
    return {
      dataset: { videoProviderId: `lifecycle-video-${index}` }, isConnected: true, player: null,
      card: {}, setAttribute() {}, removeAttribute() {},
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
      },
      closest() { return this.card; },
      querySelector(selector) { return selector === "[data-stream-player]" ? this.player : null; },
      appendChild(player) { this.player = player; player.owner = this; },
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: (type) => listeners.delete(type),
      click() { listeners.get("click")?.({ target: { closest: () => null }, preventDefault() {}, stopPropagation() {} }); }
    };
  });
  class Observer {
    constructor(callback, config) { this.callback = callback; this.config = config; observers.push(this); }
    observe() {} unobserve() {}
  }
  class Hls {
    static Events = { ERROR: "error", MANIFEST_PARSED: "manifest" };
    static isSupported() { return true; }
    constructor() { this.handlers = new Map(); }
    on(type, handler) { this.handlers.set(type, handler); }
    loadSource() {}
    attachMedia(media) {
      if (options.noFrame) return;
      media.dispatch("loadeddata");
      this.handlers.get("manifest")?.();
    }
    destroy() { this.handlers.clear(); }
  }
  const document = {
    visibilityState: "visible", querySelectorAll: () => nodes, querySelector: () => null, addEventListener() {},
    createElement() {
      const listeners = new Map();
      return {
        dataset: {}, paused: true, muted: true, volume: 1,
        setAttribute() {}, removeAttribute() {}, load() {},
        addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
        dispatch(type) { (listeners.get(type) || []).forEach((handler) => handler()); },
        play() { this.paused = false; this.dispatch("play"); this.dispatch("playing"); return Promise.resolve(); },
        pause() { if (!this.paused) { this.paused = true; this.dispatch("pause"); } },
        remove() { this.owner.player = null; }
      };
    }
  };
  const window = {
    WingaModules: {}, Hls, IntersectionObserver: Observer, innerHeight: 800,
    navigator: { onLine: true, hardwareConcurrency: 8, deviceMemory: 8, connection: { effectiveType: "4g", downlink: 10 } },
    setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); }, addEventListener() {}
  };
  vm.runInNewContext(source, { window });
  const controller = window.WingaModules.marketplace.createVideoPlaybackController({
    windowObject: window, documentObject: document, maxConcurrentPrewarms: 1, prewarmTimeoutMs: 3000,
    requestPlaybackToken: async (id) => {
      requests.push(id);
      if (options.request) await options.request(id, requests.length);
      return { customerCode: "example", token: `${id}-signed`, expiresInSeconds: 300 };
    }
  });
  controller.bind(document);
  return {
    nodes, controller, requests, timers,
    near(...items) { observers.find((o) => o.config.rootMargin === "1800px 0px").callback(items.map((node) => ({ target: node.card, isIntersecting: true }))); },
    visible(node) { observers.find((o) => o.config.threshold.includes(0.55)).callback(nodes.map((target) => ({ target, isIntersecting: target === node, intersectionRatio: target === node ? 1 : 0 }))); },
    async expire(ms) { for (const [id, timer] of [...timers]) { if (timer.ms === ms && timers.delete(id)) timer.callback(); } await flush(); }
  };
}

test("stalled prewarm token cannot block the next seven videos or attach after release", async () => {
  let resolveToken;
  const pendingToken = new Promise((resolve) => { resolveToken = resolve; });
  const h = harness({ request: (id) => id.endsWith("-0") ? pendingToken : undefined });
  h.near(...h.nodes);
  await flush();
  assert.equal(h.requests.length, 1);
  await h.expire(3000);
  assert.equal(h.requests.length, 8, "prewarm queue must continue even when the first token hangs");
  for (const node of h.nodes.slice(1)) assert.ok(node.player);
  resolveToken();
  await flush();
  assert.equal(h.nodes[0].player, null, "late token must not resurrect an obsolete player");
  h.visible(h.nodes[7]);
  await flush();
  assert.equal(h.nodes[7].player.paused, false);
  h.controller.dispose();
  assert.equal(h.timers.size, 0);
});

test("failed speculative preload gets one fresh attempt when the video becomes visible", async () => {
  const h = harness({ count: 1, request: (_id, attempt) => { if (attempt === 1) throw new Error("temporary token failure"); } });
  h.near(h.nodes[0]);
  await flush();
  assert.equal(h.nodes[0].player, null);
  h.visible(h.nodes[0]);
  await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.nodes[0].player?.paused, false);
  h.controller.dispose();
});

test("visible playback that never decodes has a bounded wait and remains manually retryable", async () => {
  const h = harness({ count: 1, noFrame: true });
  h.visible(h.nodes[0]);
  await flush();
  assert.ok(h.nodes[0].player);
  await h.expire(20000);
  assert.equal(h.nodes[0].player, null);
  assert.equal(h.nodes[0].classList.contains("has-playback-error"), true);
  h.visible(h.nodes[0]);
  await flush();
  assert.equal(h.nodes[0].player, null, "active failure must not cause an unbounded retry loop");
  h.nodes[0].click();
  await flush();
  assert.ok(h.nodes[0].player);
  h.controller.dispose();
  assert.equal(h.timers.size, 0);
});

test("promoted preload is not torn down by its old speculative deadline", async () => {
  let resolveToken;
  const h = harness({ count: 1, request: () => new Promise((resolve) => { resolveToken = resolve; }) });
  h.near(h.nodes[0]);
  await flush();
  h.visible(h.nodes[0]);
  await h.expire(3000);
  resolveToken();
  await flush();
  assert.equal(h.nodes[0].player?.paused, false);
  h.controller.dispose();
});

test("scrolling back resumes programmatically paused video but respects manual pause", async () => {
  const h = harness({ count: 2 });
  h.near(...h.nodes);
  await flush();
  h.visible(h.nodes[0]);
  await flush();
  h.visible(h.nodes[1]);
  await flush();
  assert.equal(h.nodes[0].player.paused, true);
  h.visible(h.nodes[0]);
  await flush();
  assert.equal(h.nodes[0].player.paused, false);
  h.nodes[0].player.pause();
  h.visible(h.nodes[0]);
  await flush();
  assert.equal(h.nodes[0].player.paused, true);
  h.controller.dispose();
});

test("late timed-out token cannot replace a successful manual retry", async () => {
  let resolveToken;
  const pending = new Promise((resolve) => { resolveToken = resolve; });
  const h = harness({ count: 1, request: (_id, attempt) => attempt === 1 ? pending : undefined });
  h.visible(h.nodes[0]);
  await h.expire(20000);
  assert.equal(h.nodes[0].player, null);
  h.nodes[0].click();
  await flush();
  const currentPlayer = h.nodes[0].player;
  assert.ok(currentPlayer);
  resolveToken();
  await flush();
  assert.equal(h.nodes[0].player, currentPlayer);
  assert.equal(currentPlayer.paused, false);
  h.controller.dispose();
});

test("playback token requests do not inherit the three-minute upload deadline", async () => {
  const window = { WingaModules: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/api/products-client.js"), "utf8"), { window });
  const requests = [];
  const client = window.WingaModules.api.productActions.createProductsApiClient({
    baseUrl: "/api", productUploadTimeoutMs: 180000,
    fetchJson: async (url, options) => { requests.push({ url, ...options }); }
  });
  await client.requestVideoPlayback("lifecycle-video-0");
  assert.equal(requests[0].timeoutMs, 15000);
  assert.equal(requests[0].method, "POST");
});
