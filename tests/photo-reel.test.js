const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { File, Blob } = require("node:buffer");
const source = fs.readFileSync(path.join(__dirname, "../src/marketplace/photo-reel.js"), "utf8");
const photos = () => [0, 1, 2].map((n) => new File(["photo"], n + ".png", { type: "image/png" }));

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
