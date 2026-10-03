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
    console: { log() {}, error(message) { diagnostics.push(JSON.parse(message)); } }
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
  assert.match(config, /api\/v3\/hive\/visual-moderation/);
  assert.doesNotMatch(config, /HIVE_API_KEY/);
  assert.doesNotMatch(source, /token\s+[A-Za-z0-9_-]{20,}/);
  assert.match(source, /readLimitedBody/);
  assert.match(source, /verifyHmacHex/);
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
const { createHmac } = require("node:crypto");

const source = fs.readFileSync(path.join(root, "cloudflare", "video-safety-adapter.js"), "utf8");
const env = {
  HIVE_API_KEY: "synthetic-hive-v3-test-key",
  HIVE_API_URL: "https://api.thehive.ai/api/v3/hive/visual-moderation",
  VIDEO_SAFETY_SCAN_WEBHOOK_SECRET: "test-scan-secret-at-least-32-characters",
  VIDEO_SAFETY_RESULT_WEBHOOK_SECRET: "test-result-secret-at-least-32-characters",
  HIVE_CALLBACK_TOKEN_SECRET: "test-context-secret-at-least-32-characters",
  ADAPTER_PUBLIC_URL: "https://adapter.example",
  WINGA_VIDEO_SAFETY_RESULT_URL: "https://backend.example/api/media/videos/safety-results",
  MEDIA_HOST_ALLOWLIST: ".videodelivery.net,.cloudflarestream.com"
};
const scan = {
  version: "video-safety-scan-v1",
  providerId: "video-test-123",
  idempotencyKey: "video-safety:video-test-123",
  mediaUrl: "https://customer-test.cloudflarestream.com/private-token/manifest/video.m3u8"
};
function request(body = scan, secret = env.VIDEO_SAFETY_SCAN_WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return new Request("https://adapter.example/scan", {
    method: "POST",
    headers: {
      "X-Winga-Video-Safety-Timestamp": timestamp,
      "X-Winga-Video-Safety-Signature": "sha256=" + signature
    },
    body: raw
  });
}
function adapter(fetchImpl, fastTimeout = false, diagnostics = []) {
  const sandbox = {
    crypto: webcrypto, Request, Response, URL, TextEncoder, TextDecoder,
    AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
    console: { log() {}, error(message) { diagnostics.push(JSON.parse(message)); } }
  };
  let code = source.replace("export default", "const adapter =");
  if (fastTimeout) code = code.replace("const HIVE_V3_TIMEOUT_MS = 45000;", "const HIVE_V3_TIMEOUT_MS = 25;");
  vm.runInNewContext(code + "\nglobalThis.result = adapter;", sandbox);
  return sandbox.result;
}
function hive(classes) {
  return Response.json({ output: [{ classes }] });
}
const predictions = [
  { class_name: "general_nsfw", value: 0.9 },
  { class_name: "gun_in_hand", value: 0.88 },
  { class_name: "no_gun", value: 0.99 }
];

test("V3 Bearer request and signed Render delivery preserve risk thresholds", async () => {
  const calls = [];
  const worker = adapter(async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return hive(predictions);
    assert.equal(url, env.WINGA_VIDEO_SAFETY_RESULT_URL);
    const payload = JSON.parse(init.body);
    assert.equal(payload.verdict, "review");
    assert.equal(payload.riskScore, 0.9);
    assert.equal(payload.modelVersion, "visual-v3");
    assert.equal(payload.scores.gun_in_hand, 0.88);
    assert.ok(!payload.labels.includes("no_gun"));
    const ts = init.headers["X-Winga-Video-Safety-Timestamp"];
    assert.equal(init.headers["X-Winga-Video-Safety-Signature"],
      "sha256=" + createHmac("sha256", env.VIDEO_SAFETY_RESULT_WEBHOOK_SECRET).update(ts + "." + init.body).digest("hex"));
    return Response.json({ ok: true });
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).delivered, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, env.HIVE_API_URL);
  assert.equal(calls[0].init.headers.Authorization, "Bearer " + env.HIVE_API_KEY);
  assert.deepEqual(JSON.parse(calls[0].init.body), { input: [{ media_url: scan.mediaUrl }] });
  assert.equal(calls[0].init.redirect, "manual");
});

test("safe predictions complete only after backend success", async () => {
  let delivered;
  const worker = adapter(async (url, init) => {
    if (url === env.HIVE_API_URL) return hive([{ class_name: "general_nsfw", value: 0.1 }]);
    delivered = JSON.parse(init.body);
    return Response.json({ ok: true });
  });
  assert.equal((await worker.fetch(request(), env)).status, 202);
  assert.equal(delivered.verdict, "safe");
});

test("highest risk across multiple returned frames is retained", async () => {
  let delivered;
  const worker = adapter(async (url, init) => {
    if (url === env.HIVE_API_URL) return Response.json({ output: [
      { classes: [{ class_name: "general_nsfw", value: 0.1 }] },
      { classes: [{ class_name: "general_nsfw", value: 0.95 }] }
    ] });
    delivered = JSON.parse(init.body);
    return Response.json({ ok: true });
  });
  assert.equal((await worker.fetch(request(), env)).status, 202);
  assert.equal(delivered.riskScore, 0.95);
  assert.equal(delivered.verdict, "review");
});

test("empty, invalid, partial and error outputs never deliver a safe verdict", async () => {
  for (const body of [{}, { output: [] }, { output: [{ classes: [] }] },
    { output: [{ classes: [{ class_name: "general_nsfw", value: null }] }] },
    { output: [{ classes: [{ class_name: "general_nsfw", value: 1.1 }] }] },
    { output: [{ classes: predictions }, { classes: [] }] },
    { output: [{ classes: predictions }], error: "failed" }]) {
    let calls = 0;
    const worker = adapter(async () => { calls++; return Response.json(body); });
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "provider_invalid_response");
    assert.equal(calls, 1);
  }
});

test("Hive auth and rate-limit statuses remain visible to the dispatcher", async () => {
  for (const status of [401, 403, 429, 503]) {
    const worker = adapter(async () => Response.json({ error: "rejected" }, { status }));
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error, "provider_rejected");
    assert.equal(body.providerStatus, status);
  }
});

test("failed Render delivery is not acknowledged as submitted", async () => {
  const worker = adapter(async url => url === env.HIVE_API_URL
    ? hive(predictions) : Response.json({ error: "unavailable" }, { status: 503 }));
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "winga_callback_failed");
  assert.equal(body.submitted, undefined);
});

test("result identity is stable across delivery retries", async () => {
  const ids = [];
  const worker = adapter(async (url, init) => {
    if (url === env.HIVE_API_URL) return hive(predictions);
    ids.push(JSON.parse(init.body).resultId);
    return Response.json({ ok: true });
  });
  await worker.fetch(request(), env);
  await worker.fetch(request(), env);
  assert.equal(ids[0], ids[1]);
});

test("bad signatures and forbidden media hosts do not reach Hive", async () => {
  let calls = 0;
  const worker = adapter(async () => { calls++; return hive(predictions); });
  assert.equal((await worker.fetch(request(scan, "wrong-secret"), env)).status, 401);
  assert.equal((await worker.fetch(request({ ...scan, mediaUrl: "https://attacker.example/file.mp4" }), env)).status, 422);
  assert.equal(calls, 0);
});

test("V2 and untrusted provider URLs fail configuration checks", async () => {
  const worker = adapter(async () => { throw new Error("must not fetch"); });
  for (const url of ["https://api.hivemoderation.com/api/v2/task/async", "https://attacker.example/api/v3/hive/visual-moderation"]) {
    assert.equal((await worker.fetch(request(), { ...env, HIVE_API_URL: url })).status, 503);
  }
});

test("timeout produces a retryable failure without delivering predictions", async () => {
  const worker = adapter((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }), true);
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, "provider_timeout");
});

test("unrelated class sets are not treated as valid Visual Moderation", async () => {
  const worker = adapter(async () => hive([{ class_name: "unrelated_class", value: 0.1 }]));
  assert.equal((await worker.fetch(request(), env)).status, 502);
});

test("deadline remains active while reading the Hive response body", async () => {
  const worker = adapter((url, init) => Promise.resolve(new Response(
    new ReadableStream({
      start(controller) {
        init.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      }
    }), { status: 200 }
  )), true);
  assert.equal((await worker.fetch(request(), env)).status, 504);
});


test("failure diagnostics identify Hive and callback stages without leaking messages", async () => {
  for (const failureStage of ["hive_request", "winga_callback"]) {
    const diagnostics = [];
    const worker = adapter(async url => {
      if (failureStage === "winga_callback" && url === env.HIVE_API_URL) {
        return hive([{ class_name: "general_nsfw", value: 0.1 }]);
      }
      throw new TypeError("fetch failed for https://private.example/secret-token");
    }, false, diagnostics);
    assert.equal((await worker.fetch(request(), env)).status, 502);
    assert.equal(diagnostics[0].stage, failureStage);
    assert.equal(diagnostics[0].reason, "network_failure");
    assert.ok(!JSON.stringify(diagnostics).includes("secret-token"));
  }
});

test("oversized Hive responses identify the response stage and never deliver decisions", async () => {
  const diagnostics = [];
  let calls = 0;
  const worker = adapter(async () => {
    calls++;
    return new Response("x".repeat(4 * 1024 * 1024 + 1));
  }, false, diagnostics);
  assert.equal((await worker.fetch(request(), env)).status, 502);
  assert.equal(calls, 1);
  assert.equal(diagnostics[0].stage, "hive_response");
  assert.equal(diagnostics[0].reason, "response_too_large");
});
test("provider and backend redirects never forward credentials or acknowledge submission", async () => {
  for (const stage of ["hive_request", "winga_callback"]) {
    const diagnostics = [];
    const calls = [];
    const worker = adapter(async (url, init) => {
      calls.push(url);
      assert.equal(init.redirect, "manual");
      if (stage === "winga_callback" && url === env.HIVE_API_URL) {
        return hive([{class_name:"general_nsfw", value:0.1}]);
      }
      return new Response("", {status:307, headers:{Location:"https://untrusted.example/"}});
    }, false, diagnostics);
    assert.equal((await worker.fetch(request(),env)).status,502);
    assert.equal(calls.length,stage === "hive_request" ? 1 : 2);
    assert.ok(!calls.some(url => url.includes("untrusted.example")));
    assert.equal(diagnostics[0].stage,stage);
    assert.equal(diagnostics[0].reason,"redirect_blocked");
  }
});
test("provider rejection logs use fixed terms and never expose private media URLs", async () => {
  const diagnostics=[];
  const worker=adapter(async()=>Response.json({error:{message:"Unsupported video format m3u8 at https://private.example/secret-token"}},{status:400}),false,diagnostics);
  const response=await worker.fetch(request(),env);
  assert.equal(response.status,502);
  assert.equal((await response.json()).providerStatus,400);
  assert.equal(diagnostics[0].reason,"unsupported_media_format");
  assert.ok(diagnostics[0].terms.includes("m3u8"));
  assert.ok(!JSON.stringify(diagnostics).includes("secret-token"));
  assert.ok(!JSON.stringify(diagnostics).includes("private.example"));
});
test("video results larger than 128 KiB retain every frame and the highest risk", async () => {
  const output=Array.from({length:100},(_,frame)=>({time:frame,classes:[
    {class_name:"general_nsfw",value:frame===99?0.96:0.1},
    ...Array.from({length:79},(_,index)=>({class_name:"attribute_"+index,value:0.1}))
  ]}));
  const raw=JSON.stringify({output});
  assert.ok(Buffer.byteLength(raw)>128*1024);
  let delivered;
  const worker=adapter(async(url,init)=>{
    if(url===env.HIVE_API_URL)return new Response(raw,{headers:{"Content-Type":"application/json"}});
    delivered=JSON.parse(init.body);
    return Response.json({ok:true});
  });
  assert.equal((await worker.fetch(request(),env)).status,202);
  assert.equal(delivered.verdict,"review");
  assert.equal(delivered.riskScore,0.96);
});
test("documented class/score fields retain the same review threshold",async()=>{
  let delivered;
  const worker=adapter(async(url,init)=>{
    if(url===env.HIVE_API_URL)return Response.json({output:[{time:0,classes:[
      {class:"general_nsfw",score:0.95},{class:"general_not_nsfw_not_suggestive",score:0.05}
    ]}]});
    delivered=JSON.parse(init.body);return Response.json({ok:true});
  });
  assert.equal((await worker.fetch(request(),env)).status,202);
  assert.equal(delivered.riskScore,0.95);
  assert.equal(delivered.verdict,"review");
});
test("conflicting class formats and excessive prediction counts never deliver a verdict",async()=>{
  for(const classes of [
    [{class_name:"general_nsfw",value:0.1,class:"general_nsfw",score:0.99}],
    Array.from({length:50001},()=>({class_name:"general_nsfw",value:0.1})),
    [{class_name:"general_nsfw",value:0.1},...Array.from({length:1024},(_,i)=>({class_name:"attribute_"+i,value:0.1}))]
  ]){
    let calls=0;
    const worker=adapter(async()=>{calls++;return hive(classes);});
    const response=await worker.fetch(request(),env);
    assert.equal(response.status,502);
    assert.equal((await response.json()).error,"provider_invalid_response");
    assert.equal(calls,1);
  }
});
test("class names matching Object properties cannot turn a high score into NaN",async()=>{
  let delivered;
  const worker=adapter(async(url,init)=>{
    if(url===env.HIVE_API_URL)return hive([{class_name:"general_nsfw",value:0.1},{class_name:"constructor",value:0.99}]);
    delivered=JSON.parse(init.body);return Response.json({ok:true});
  });
  assert.equal((await worker.fetch(request(),env)).status,202);
  assert.equal(delivered.riskScore,0.99);
  assert.equal(delivered.verdict,"review");
});
test("the Render callback retains its smaller bounded response limit",async()=>{
  const diagnostics=[];
  const worker=adapter(async(url)=>url===env.HIVE_API_URL?hive(predictions):new Response("x".repeat(128*1024+1)),false,diagnostics);
  assert.equal((await worker.fetch(request(),env)).status,502);
  assert.equal(diagnostics[0].stage,"winga_callback");
  assert.equal(diagnostics[0].reason,"response_too_large");
});

test("invalid response diagnostics expose schema fields without media URLs or prediction labels",async()=>{
  const diagnostics=[];
  const worker=adapter(async()=>Response.json({output:[{response:{output:[{classes:[
    {class_name:"private_prediction_label",value:0.9}
  ],media_url:"https://private.example/secret-token"}]}}],private_metadata:"secret"}),false,diagnostics);
  assert.equal((await worker.fetch(request(),env)).status,502);
  const log=JSON.stringify(diagnostics);
  assert.ok(log.includes("class_name"));
  assert.ok(log.includes("classCount"));
  assert.ok(!log.includes("private_prediction_label"));
  assert.ok(!log.includes("private.example"));
  assert.ok(!log.includes("secret-token"));
  assert.ok(!log.includes("private_metadata"));
});

test("observed Hive V3 class/value video output completes without changing risk thresholds",async()=>{
  let delivered;
  const worker=adapter(async(url,init)=>{
    if(url===env.HIVE_API_URL)return Response.json({output:[
      {time:0,classes:[{class:"general_nsfw",value:0.1},{class:"no_gun",value:0.99}]},
      {time:1,classes:[{class:"general_nsfw",value:0.95},{class:"gun_in_hand",value:0.88}]}
    ]});
    delivered=JSON.parse(init.body);return Response.json({ok:true});
  });
  const response=await worker.fetch(request(),env);
  assert.equal(response.status,202);
  assert.equal(delivered.verdict,"review");
  assert.equal(delivered.riskScore,0.95);
  assert.equal(delivered.scores.gun_in_hand,0.88);
  assert.ok(!delivered.labels.includes("no_gun"));
});
test("conflicting name and score aliases reject the whole Hive response",async()=>{
  for(const prediction of [
    {class:"general_nsfw",class_name:"no_gun",value:0.99},
    {class:"general_nsfw",value:0.1,score:0.99},
    {class:"general_nsfw",value:null,score:0.99},
    {class:"general_nsfw",value:"0.1"},
    {class:"general_nsfw",value:0.1,class_name:null}
  ]){
    let calls=0;
    const worker=adapter(async()=>{calls++;return hive([prediction]);});
    assert.equal((await worker.fetch(request(),env)).status,502);
    assert.equal(calls,1);
  }
});
