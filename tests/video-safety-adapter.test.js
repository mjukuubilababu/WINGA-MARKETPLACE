"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "cloudflare", "video-safety-adapter.js");
const configPath = path.join(root, "wrangler.video-safety.jsonc");

function loadAdapterInternals() {
  const source = fs.readFileSync(sourcePath, "utf8")
    .replace("export default {", "const worker = {")
    .concat("\n;globalThis.__adapterTest = { normalizeScan, validateScan, normalizeHiveResult, collectClassScores, getReadiness };\n");
  const context = vm.createContext({
    URL, Response, Request, Headers, TextEncoder, TextDecoder, Uint8Array,
    AbortController, setTimeout, clearTimeout, crypto: webcrypto,
    fetch: async () => { throw new Error("network disabled in unit test"); },
    console: { log() {}, error() {} }
  });
  new vm.Script(source, { filename: sourcePath }).runInContext(context);
  return context.__adapterTest;
}

test("video safety adapter validates signed-media contract without leaking secrets", async () => {
  const config = fs.readFileSync(configPath, "utf8");
  const source = fs.readFileSync(sourcePath, "utf8");
  const adapter = loadAdapterInternals();
  const env = { MEDIA_HOST_ALLOWLIST: ".videodelivery.net,.cloudflarestream.com" };
  const valid = adapter.normalizeScan({
    providerId: "stream-video-123",
    idempotencyKey: "video-safety:stream-video-123",
    mediaUrl: "https://customer-example.videodelivery.net/token/manifest/video.m3u8"
  });
  const hostile = { ...valid, mediaUrl: "https://videodelivery.net.attacker.example/video.mp4" };

  assert.equal(adapter.validateScan(valid, env), "");
  assert.equal(adapter.validateScan(hostile, env), "media_host_not_allowed");
  assert.match(config, /"name": "winga-video-safety-adapter"/);
  assert.match(config, /api\/v2\/task\/async/);
  assert.doesNotMatch(config, /HIVE_API_KEY/);
  assert.doesNotMatch(source, /token\s+[A-Za-z0-9_-]{20,}/);
  assert.match(source, /readLimitedBody/);
  assert.match(source, /timingSafeEqual/);
});

test("video safety adapter uses human review for high-risk Hive output", async () => {
  const adapter = loadAdapterInternals();
  const highRisk = await adapter.normalizeHiveResult("stream-video-123", {
    task_id: "hive-task-1",
    post_id: "stream-video-123",
    status: [{ response: { output: [{ classes: [
      { class: "general_nsfw", score: 0.97 },
      { class: "general_not_nsfw_not_suggestive", score: 0.03 }
    ] }]} }]
  }, "high-risk-body");
  const safe = await adapter.normalizeHiveResult("stream-video-456", {
    task_id: "hive-task-2",
    status: [{ response: { output: [{ classes: [
      { class: "general_nsfw", score: 0.02 },
      { class: "general_not_nsfw_not_suggestive", score: 0.98 }
    ] }]} }]
  }, "safe-body");

  assert.equal(highRisk.verdict, "review");
  assert.equal(highRisk.riskScore, 0.97);
  assert.deepEqual(Array.from(highRisk.labels), ["general_nsfw"]);
  assert.equal(safe.verdict, "safe");
  assert.equal(safe.riskScore, 0.02);
  assert.equal(highRisk.providerId, "stream-video-123");
});