const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { File, Blob } = require("node:buffer");
const source = fs.readFileSync(path.join(__dirname, "../src/marketplace/photo-reel.js"), "utf8");
const photos = () => [0, 1, 2].map((n) => new File(["photo"], n + ".png", { type: "image/png" }));

function publisherHarness(overrides = {}) {
  const stats = { generated: 0, uploaded: 0, resumed: 0, published: [], completed: [], states: [] };
  const media = { type: "video", status: "ready", providerId: "provider-reel-123" };
  let owner = "reel_seller";
  const deps = {
    generator: { generate: async () => { stats.generated++; return new File(["reel"], "reel.webm", { type: "video/webm" }); }, cancel() {} },
    uploader: { start: async () => { stats.uploaded++; return media; }, resume: async () => { stats.resumed++; return media; }, cancel() {} },
    validate: files => Array.from(files), canUse: () => true, getOwner: () => owner,
    getContext: () => ({ uploadedBy: owner, whatsapp: "255712345678" }), createId: () => "product-reel-fixed-id",
    publish: async payload => { stats.published.push(JSON.parse(JSON.stringify(payload))); return payload; },
    findPublished: async () => null, onPublished: result => stats.completed.push(result),
    onState: state => stats.states.push(state), ...overrides
  };
  const context = vm.createContext({ window: { WingaModules: { marketplace: {} } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/marketplace/photo-reel-publisher.js"), "utf8"), context);
  return { publisher: context.window.WingaModules.marketplace.createPhotoReelPublisher(deps), stats, deps, media,
    setOwner: value => { owner = value; } };
}

test("photo selection automatically generates, uploads and publishes one reel-only post", async () => {
  const { publisher, stats } = publisherHarness();
  await publisher.start(photos());
  assert.equal(stats.generated, 1);
  assert.equal(stats.uploaded, 1);
  assert.equal(stats.published.length, 1);
  assert.equal(stats.completed.length, 1);
  assert.equal(stats.published[0].name, "Reel");
  assert.equal(stats.published[0].price, null);
  assert.equal(stats.published[0].category, "reels");
  assert.deepEqual(stats.published[0].images, []);
  assert.equal(stats.published[0].mediaItems.length, 1);
  assert.equal(publisher.isBusy(), false);
});

test("double selection cannot start a second concurrent reel job", async () => {
  const h = publisherHarness();
  let finish;
  h.deps.generator.generate = () => new Promise(resolve => { finish = resolve; });
  const first = h.publisher.start(photos());
  await h.publisher.start(photos());
  assert.equal(h.publisher.isBusy(), true);
  finish(new File(["reel"], "reel.webm"));
  await first;
  assert.equal(h.stats.published.length, 1);
});

test("invalid account contact fails before encoding, upload or publication", () => {
  const h = publisherHarness({ getContext: () => ({ uploadedBy: "reel_seller", whatsapp: "" }) });
  assert.throws(() => h.publisher.start(photos()), { code: "reel.accountRequired" });
  assert.equal(h.stats.generated, 0);
  assert.equal(h.stats.uploaded, 0);
  assert.equal(h.stats.published.length, 0);
});

test("invalid ready media is discarded and cannot bypass validation on retry", async () => {
  const h = publisherHarness();
  let attempts = 0;
  h.deps.uploader.start = async () => ++attempts === 1 ? { type: "video", status: "processing" } : h.media;
  await h.publisher.start(photos());
  assert.equal(h.stats.published.length, 0);
  await h.publisher.retry();
  assert.equal(attempts, 2);
  assert.equal(h.stats.generated, 1);
  assert.equal(h.stats.published[0].mediaItems[0].providerId, h.media.providerId);
});

test("reel processing retry resumes the same provider without regenerating or uploading bytes again", async () => {
  const h = publisherHarness();
  h.deps.uploader.start = async () => { h.stats.uploaded++; throw Object.assign(new Error(), { providerId: "provider-reel-123", retryable: true }); };
  await h.publisher.start(photos());
  assert.equal(h.publisher.canRetry(), true);
  await h.publisher.retry();
  assert.equal(h.stats.generated, 1);
  assert.equal(h.stats.uploaded, 1);
  assert.equal(h.stats.resumed, 1);
  assert.equal(h.stats.published.length, 1);
});

test("uncertain product save is reconciled without a duplicate reel post", async () => {
  let stored;
  let writes = 0;
  const h = publisherHarness({
    publish: async payload => { writes++; stored = payload; throw Object.assign(new Error(), { code: "network" }); },
    findPublished: async () => stored
  });
  await h.publisher.start(photos());
  assert.equal(writes, 1);
  assert.equal(h.stats.completed.length, 1);
  assert.equal(h.publisher.canRetry(), false);
});

test("failed reel publication retains its product ID and ready video for retry", async () => {
  const ids = [];
  const h = publisherHarness({ publish: async payload => {
    ids.push(payload.id);
    if (ids.length === 1) throw new Error("temporary failure");
    return payload;
  } });
  await h.publisher.start(photos());
  await h.publisher.retry();
  assert.deepEqual(ids, ["product-reel-fixed-id", "product-reel-fixed-id"]);
  assert.equal(h.stats.generated, 1);
  assert.equal(h.stats.uploaded, 1);
  assert.equal(h.stats.completed.length, 1);
});

test("cancelled reel generation never uploads or publishes after async completion", async () => {
  let finish;
  const h = publisherHarness();
  h.deps.generator.generate = () => new Promise(resolve => { finish = resolve; });
  const pending = h.publisher.start(photos());
  assert.equal(h.publisher.cancel(), true);
  finish(new File(["reel"], "reel.webm"));
  await pending;
  assert.equal(h.stats.uploaded, 0);
  assert.equal(h.stats.published.length, 0);
});

test("account change while uploading prevents publishing a reel under another session", async () => {
  const h = publisherHarness();
  h.deps.uploader.start = async () => { h.setOwner("another_seller"); return h.media; };
  await h.publisher.start(photos());
  assert.equal(h.stats.published.length, 0);
  assert.equal(h.stats.completed.length, 0);
  assert.equal(h.publisher.canRetry(), false);
});

test("publication already in flight cannot claim to be cancelled or start a duplicate", async () => {
  let finish;
  let started;
  const writing = new Promise(resolve => { started = resolve; });
  const h = publisherHarness({ publish: payload => { started(); return new Promise(resolve => { finish = () => resolve(payload); }); } });
  const pending = h.publisher.start(photos());
  await writing;
  assert.equal(h.publisher.cancel(), false);
  assert.equal(h.publisher.isBusy(), true);
  await h.publisher.start(photos());
  finish();
  await pending;
  assert.equal(h.stats.completed.length, 1);
});

test("BigPipe shell renders the exact photo reel editor from canonical index.html", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
  const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  const context = vm.createContext({ TextEncoder, URL });
  vm.runInContext(worker.replace("export default", "const worker ="), context);
  const shell = vm.runInContext("buildDocumentShellStart()", context);
  const fragment = /<section id="product-photo-reel"[^>]*>[\s\S]*?<\/section>/g;
  const expected = [...html.matchAll(fragment)];
  const actual = [...shell.matchAll(fragment)];
  assert.equal(expected.length, 1);
  assert.equal(actual.length, 1);
  assert.equal(actual[0][0], expected[0][0]);
  assert.ok(shell.indexOf('id="image-preview-list"') < actual[0].index);
  assert.ok(shell.indexOf('class="product-video-upload"') < actual[0].index);
});

test("Worker creation menu and full composer match the canonical source with unique upload controls", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
  const worker = vm.createContext({ TextEncoder, URL });
  vm.runInContext(fs.readFileSync(path.join(root, "worker.js"), "utf8").replace("export default", "const worker ="), worker);
  const shell = vm.runInContext("buildDocumentShellStart() + buildDocumentShellEnd()", worker);
  for (const part of ["FORM", "ENTRY"]) {
    const expected = html.match(new RegExp(`<!-- WINGA_CREATION_${part}_START -->([\\s\\S]*?)<!-- WINGA_CREATION_${part}_END -->`))[1].trim();
    assert.equal(vm.runInContext(`CREATION_${part}_HTML`, worker), expected);
    assert.ok(shell.includes(expected));
  }
  for (const id of ["upload-form", "product-name", "product-image-file", "upload-button", "creation-menu", "post-product-fab"]) {
    assert.equal([...shell.matchAll(new RegExp(`id="${id}"`, "g"))].length, 1);
  }
  for (const icon of ["plus", "newspaper", "clapperboard", "images", "circle-plus", "video", "arrow-left", "x"]) {
    assert.ok(fs.readFileSync(path.join(root, "public/icons/create", icon + ".svg"), "utf8").includes("<svg"));
  }
});

function harness({ outputBytes = 12, empty = false, codec = "video/webm;codecs=vp8" } = {}) {
  const frames = new Map();
  const stats = { stoppedTracks: 0, openImages: 0, maxImages: 0, imageOrder: [], listeners: 0 };
  let now = 0;
  let frameId = 0;
  const eventTarget = () => {
    const events = new EventTarget();
    return {
      addEventListener(...args) { stats.listeners++; events.addEventListener(...args); },
      removeEventListener(...args) { stats.listeners--; events.removeEventListener(...args); },
      dispatchEvent: (...args) => events.dispatchEvent(...args)
    };
  };
  class Canvas {
    getContext() {
      return { fillRect() {}, drawImage(image) { stats.imageOrder.push(image.id); } };
    }
    captureStream() { return { getTracks: () => [{ stop() { stats.stoppedTracks++; } }] }; }
  }
  class Recorder {
    static isTypeSupported(type) { return type === codec; }
    constructor(_stream, options) { this.state = "inactive"; this.mimeType = options.mimeType; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      if (!empty) this.ondataavailable?.({ data: new Blob([new Uint8Array(outputBytes)]) });
      this.onstop?.();
    }
  }
  const target = {
    ...eventTarget(),
    document: { ...eventTarget(), hidden: false, createElement: () => new Canvas() },
    HTMLCanvasElement: Canvas, MediaRecorder: Recorder, File, performance: { now: () => now },
    setTimeout, clearTimeout, matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  vm.runInNewContext(source, { window: target, Error, Set, Object, Array, Number, Promise, Date });
  const tools = target.WingaModules.marketplace;
  const decodeImage = async (file) => {
    stats.openImages++;
    stats.maxImages = Math.max(stats.openImages, stats.maxImages);
    return {
      source: { id: file.name, width: 320, height: 480 },
      close() { stats.openImages--; }
    };
  };
  return {
    target, stats, tools,
    generator: tools.createPhotoReelGenerator({ window: target, decodeImage }),
    async step() {
      await new Promise((resolve) => setImmediate(resolve));
      const callbacks = Array.from(frames.values());
      frames.clear();
      now += 500;
      callbacks.forEach((callback) => callback(now));
      await new Promise((resolve) => setImmediate(resolve));
    },
    frameCount: () => frames.size
  };
}

test("build prerender reads bounded paginated items and does not recurse on API failure", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/build-vercel-static.js"), "utf8");
  const helpers = source.slice(source.indexOf("function loadLocalProductsForPrerender()"), source.indexOf("async function generateProductSharePages"));
  let calls = 0;
  const context = vm.createContext({
    rootDir: "/fixture", fs: { existsSync: () => false }, path,
    process: { env: {} }, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      calls++;
      assert.match(url, /products\?limit=12&page=1$/);
      return { ok: true, json: async () => ({ items: [{ id: "p1" }], hasMore: true }) };
    }
  });
  vm.runInContext(helpers, context);
  const products = await vm.runInContext("loadProductsForPrerender()", context);
  assert.equal(products.length, 1);
  assert.equal(products[0].id, "p1");
  assert.equal(calls, 1);
  let cancelled = 0;
  context.fetch = async () => { calls++; return { ok: false, body: { cancel: async () => cancelled++ } }; };
  const fallback = await vm.runInContext("loadProductsForPrerender()", context);
  assert.equal(fallback.length, 0);
  assert.equal(calls, 2);
  assert.equal(cancelled, 1);
});

test("reel input limits reject invalid files without silently truncating selection", () => {
  const { tools } = harness();
  assert.equal(tools.validatePhotoReelFiles(photos()).length, 3);
  assert.throws(() => tools.validatePhotoReelFiles(photos().slice(1)), { code: "reel.count" });
  assert.throws(() => tools.validatePhotoReelFiles(Array(11).fill(photos()[0])), { code: "reel.count" });
  assert.throws(() => tools.validatePhotoReelFiles([{ type: "image/svg+xml", size: 100 }, ...photos()]), { code: "reel.imageType" });
  assert.throws(() => tools.validatePhotoReelFiles([{ type: "image/png", size: 11 * 1024 * 1024 }, ...photos()]), { code: "reel.imageSize" });
  assert.throws(() => tools.validatePhotoReelFiles(Array(7).fill({ type: "image/jpeg", size: 10 * 1024 * 1024 })), { code: "reel.totalSize" });
});

for (const codec of ["video/webm;codecs=vp8", "video/mp4"]) {
  test("reel generation preserves photo order and releases resources using " + codec, async () => {
    const h = harness({ codec });
    const progress = [];
    const result = h.generator.generate(photos(), { onProgress: (value) => progress.push(value) });
    for (let n = 0; n < 16; n++) await h.step();
    const file = await result;
    assert.equal(file.type, codec.split(";")[0]);
    assert.equal(file.size, 12);
    assert.deepEqual([...new Set(h.stats.imageOrder)], ["0.png", "1.png", "2.png"]);
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
    assert.equal(h.stats.maxImages, 2);
    assert.equal(h.stats.openImages, 0);
    assert.equal(h.stats.stoppedTracks, 1);
    assert.equal(h.stats.listeners, 0);
    assert.equal(h.frameCount(), 0);
  });
}

test("cancelling generation stops the recorder, tracks, frames and listeners", async () => {
  const h = harness();
  const pending = assert.rejects(h.generator.generate(photos()), { code: "reel.cancelled" });
  await h.step();
  h.generator.cancel();
  await pending;
  assert.equal(h.stats.stoppedTracks, 1);
  assert.equal(h.stats.openImages, 0);
  assert.equal(h.stats.listeners, 0);
  assert.equal(h.frameCount(), 0);
});

test("backgrounding the document rejects incomplete reels instead of producing frozen video", async () => {
  const h = harness();
  const pending = assert.rejects(h.generator.generate(photos()), { code: "reel.interrupted" });
  await h.step();
  h.target.document.hidden = true;
  h.target.document.dispatchEvent(new Event("visibilitychange"));
  await pending;
  assert.equal(h.stats.stoppedTracks, 1);
  assert.equal(h.stats.openImages, 0);
});

test("empty and oversized recordings are never offered as uploadable reels", async () => {
  for (const config of [{ empty: true, code: "reel.failed" }, { outputBytes: 33 * 1024 * 1024, code: "reel.outputSize" }]) {
    const h = harness(config);
    const pending = assert.rejects(h.generator.generate(photos()), { code: config.code });
    for (let n = 0; n < 16; n++) await h.step();
    await pending;
    assert.equal(h.stats.openImages, 0);
    assert.equal(h.stats.stoppedTracks, 1);
  }
});

test("unsupported browsers fail before decoding or recording", async () => {
  const h = harness({ codec: "" });
  assert.equal(h.generator.isSupported(), false);
  await assert.rejects(h.generator.generate(photos()), { code: "reel.unsupported" });
  assert.equal(h.stats.maxImages, 0);
  assert.equal(h.stats.listeners, 0);
});
