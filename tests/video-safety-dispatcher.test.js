"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyVideoSafetyDeliveryError, createVideoSafetyDispatcher } = require("../backend/video-safety-dispatcher");
const { verifyVideoSafetyResult } = require("../backend/video-safety");

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
}

test("video safety dispatcher requires the Stream customer code before claiming jobs", () => {
  const dispatcher = createVideoSafetyDispatcher({
    store: {
      async claimVideoSafetyBatch() { return []; },
      async completeVideoSafetyDelivery() { return null; }
    },
    streamClient: {
      config: { customerCode: "" },
      isConfigured: () => true,
      async createModerationMedia() { return { mediaUrl: "" }; }
    },
    config: {
      scanUrl: "https://scanner.example/scan",
      deliverySecret: "video-safety-delivery-secret-32-characters-minimum"
    }
  });

  assert.equal(dispatcher.isConfigured(), false);
});

test("video safety dispatcher submits private signed media without exposing provider credentials", async () => {
  const completions = [];
  let request;
  const secret = "video-safety-delivery-secret-32-characters-minimum";
  const dispatcher = createVideoSafetyDispatcher({
    store: {
      async claimVideoSafetyBatch() { return [{ providerId: "stream-video-123", idempotencyKey: "video-safety:stream-video-123", attempts: 1, maxAttempts: 6 }]; },
      async completeVideoSafetyDelivery(providerId, outcome) { completions.push({ providerId, outcome }); }
    },
    streamClient: {
      config: { customerCode: "examplecode" },
      isConfigured: () => true,
      async createModerationMedia() { return { mediaUrl: "https://customer-examplecode.cloudflarestream.com/private.download.token/downloads/default.mp4" }; }
    },
    config: { scanUrl: "https://scanner.example/scan", deliverySecret: secret },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ submitted: true }), { status: 202 });
    }
  });
  dispatcher.start();
  await waitFor(() => completions.length === 1);
  dispatcher.stop();

  const payload = JSON.parse(request.init.body);
  assert.equal(payload.version, "video-safety-scan-v1");
  assert.equal(payload.providerId, "stream-video-123");
  assert.match(payload.mediaUrl, /^https:\/\/customer-examplecode\.cloudflarestream\.com\/.+\/downloads\/default\.mp4$/);
  assert.doesNotMatch(request.init.body, /seller|buyer|apiToken/i);
  assert.equal(verifyVideoSafetyResult(request.init.body, {
    "x-winga-video-safety-timestamp": request.init.headers["X-Winga-Video-Safety-Timestamp"],
    "x-winga-video-safety-signature": request.init.headers["X-Winga-Video-Safety-Signature"]
  }, secret).ok, true);
  assert.equal(completions[0].outcome.submitted, true);
});

test("video safety dispatcher returns failures to durable retry state", async () => {
  const completions = [];
  const dispatcher = createVideoSafetyDispatcher({
    store: {
      async claimVideoSafetyBatch() { return [{ providerId: "stream-video-456", idempotencyKey: "video-safety:stream-video-456", attempts: 2, maxAttempts: 6 }]; },
      async completeVideoSafetyDelivery(providerId, outcome) { completions.push({ providerId, outcome }); }
    },
    streamClient: { config: { customerCode: "examplecode" }, isConfigured: () => true, async createModerationMedia() { throw new Error("provider unavailable"); } },
    config: { scanUrl: "https://scanner.example/scan", deliverySecret: "video-safety-delivery-secret-32-characters-minimum" },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });
  dispatcher.start();
  await waitFor(() => completions.length === 1);
  dispatcher.stop();

  assert.equal(completions[0].outcome.submitted, false);
  assert.equal(completions[0].outcome.attempts, 2);
  assert.match(completions[0].outcome.error, /^video_safety_delivery_failed:provider unavailable/);
});
test("video safety dispatcher reports bounded operational failure codes", () => {
  assert.equal(classifyVideoSafetyDeliveryError(Object.assign(new Error("denied"), { code: "stream_provider_error", status: 403 })), "stream_provider_auth_rejected");
  assert.equal(classifyVideoSafetyDeliveryError(Object.assign(new Error("denied"), { code: "video_safety_provider_rejected", status: 502, providerStatus: 403 })), "hive_provider_auth_rejected");
  assert.equal(classifyVideoSafetyDeliveryError(Object.assign(new Error("missing"), { code: "stream_signing_key_invalid" })), "stream_signing_key_invalid");
  assert.equal(classifyVideoSafetyDeliveryError(new Error("Video safety adapter rejected delivery with HTTP 502.")), "adapter_provider_unavailable");
  assert.equal(classifyVideoSafetyDeliveryError(Object.assign(new Error("aborted"), { name: "AbortError" })), "adapter_timeout");
});
test("video safety dispatcher preserves a bounded Hive rejection reason", async () => {
  const completions = [];
  const dispatcher = createVideoSafetyDispatcher({
    workerId: "hive-rejection-worker",
    store: {
      async claimVideoSafetyBatch() {
        return [{
          providerId: "stream-video-hive",
          idempotencyKey: "video-safety:stream-video-hive",
          attempts: 1,
          maxAttempts: 6,
          lockedBy: "hive-rejection-worker"
        }];
      },
      async completeVideoSafetyDelivery(providerId, outcome) {
        completions.push({ providerId, outcome });
        return { status: "retry" };
      }
    },
    streamClient: {
      config: { customerCode: "examplecode" },
      isConfigured: () => true,
      async createModerationMedia() {
        return { mediaUrl: "https://customer-examplecode.cloudflarestream.com/private.download.token/downloads/default.mp4" };
      }
    },
    config: {
      scanUrl: "https://scanner.example/scan",
      deliverySecret: "video-safety-delivery-secret-32-characters-minimum"
    },
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      error: "provider_rejected",
      providerStatus: 403
    }), { status: 502 })
  });

  const result = await dispatcher.processOnce();

  assert.equal(result.failed, 1);
  assert.equal(result.failureCodes.hive_provider_auth_rejected, 1);
  assert.match(completions[0].outcome.error, /^hive_provider_auth_rejected:/);
});
test("video safety dispatcher bounds downstream concurrency during queue pressure", async () => {
  const jobs = Array.from({ length: 8 }, (_, index) => {
    const providerId = `stream-pressure-${index}`;
    return {
      providerId,
      idempotencyKey: `video-safety:${providerId}`,
      attempts: 1,
      maxAttempts: 6,
      lockedBy: "pressure-worker"
    };
  });
  let activeRequests = 0;
  let peakRequests = 0;
  let completed = 0;
  const dispatcher = createVideoSafetyDispatcher({
    workerId: "pressure-worker",
    batchSize: 100,
    concurrency: 3,
    store: {
      async claimVideoSafetyBatch(options) {
        assert.equal(options.limit, 100);
        return jobs;
      },
      async completeVideoSafetyDelivery(_providerId, outcome) {
        assert.equal(outcome.workerId, "pressure-worker");
        completed += 1;
        return { status: "submitted" };
      }
    },
    streamClient: {
      config: { customerCode: "examplecode" },
      isConfigured: () => true,
      async createModerationMedia() {
        return { mediaUrl: "https://customer-examplecode.cloudflarestream.com/private.download.token/downloads/default.mp4" };
      }
    },
    config: {
      scanUrl: "https://scanner.example/scan",
      deliverySecret: "video-safety-delivery-secret-32-characters-minimum"
    },
    fetchImpl: async () => {
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeRequests -= 1;
      return new Response(JSON.stringify({ submitted: true }), { status: 202 });
    }
  });

  const result = await dispatcher.processOnce();

  assert.equal(dispatcher.concurrency, 3);
  assert.equal(result.claimed, 8);
  assert.equal(result.submitted, 8);
  assert.equal(completed, 8);
  assert.equal(peakRequests, 3);
});

test("pending MP4 preparation retries durably without calling Hive", async () => {
  let attempts = 0;
  let outcome;
  const dispatcher = createVideoSafetyDispatcher({
    store: {
      async claimVideoSafetyBatch() { return [{providerId:"stream-video-pending",idempotencyKey:"video-safety:stream-video-pending",attempts:1,maxAttempts:6}]; },
      async completeVideoSafetyDelivery(_id, value) { outcome=value; return {status:"retry"}; }
    },
    streamClient: {config:{customerCode:"examplecode"},isConfigured:()=>true,
      async createModerationMedia() { throw Object.assign(new Error("Private MP4 preparation is pending."),{code:"stream_download_pending"}); }},
    config:{scanUrl:"https://scanner.example/scan",deliverySecret:"video-safety-delivery-secret-32-characters-minimum"},
    fetchImpl: async()=>{attempts++;throw new Error("must not fetch");}
  });
  const result=await dispatcher.processOnce();
  assert.equal(attempts,0);
  assert.equal(result.failed,1);
  assert.equal(result.failureCodes.stream_download_pending,1);
  assert.equal(outcome.submitted,false);
  assert.match(outcome.error,/^stream_download_pending:/);
});
test("dispatcher rejects HLS, query parameters and untrusted moderation URLs",async()=>{
  for(const mediaUrl of [
    "https://attacker.example/token/downloads/default.mp4",
    "https://customer-examplecode.cloudflarestream.com/token/manifest/video.m3u8",
    "https://customer-examplecode.cloudflarestream.com/token/downloads/default.mp4?secret=bad"
  ]){
    let called=0;
    const dispatcher=createVideoSafetyDispatcher({
      streamClient:{config:{customerCode:"examplecode"},async createModerationMedia(){return {mediaUrl};}},
      config:{scanUrl:"https://scanner.example/scan",deliverySecret:"video-safety-delivery-secret-32-characters-minimum"},
      fetchImpl:async()=>{called++;return Response.json({submitted:true});}
    });
    await assert.rejects(dispatcher.dispatch({providerId:"stream-video-123",idempotencyKey:"video-safety:stream-video-123"}),/invalid private moderation URL/);
    assert.equal(called,0);
  }
});

test("ready signed MP4 completes the dispatcher-to-Hive-to-Render contract",async()=>{
  const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
  const {webcrypto}=require("node:crypto");
  const {createCloudflareStreamClient,readCloudflareStreamConfig}=require("../backend/cloudflare-stream");
  const source=fs.readFileSync(path.join(__dirname,"..","cloudflare","video-safety-adapter.js"),"utf8");
  const secret="video-safety-delivery-secret-32-characters-minimum";
  const resultSecret="video-safety-result-secret-32-characters-minimum";
  let result;
  const sandbox={crypto:webcrypto,URL,Response,Request,Headers,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,
    console:{log(){},error(){}},
    fetch:async(url,init)=>{
      if(url==="https://api.thehive.ai/api/v3/hive/visual-moderation"){
        assert.equal(init.headers.Authorization,"Bearer synthetic-hive-v3-test-key");
        assert.equal(JSON.parse(init.body).input[0].media_url,"https://customer-examplecode.cloudflarestream.com/private.download.token/downloads/default.mp4");
        return Response.json({output:[{classes:[{class_name:"general_nsfw",value:0.96}]}]});
      }
      assert.equal(url,"https://backend.example/api/media/videos/safety-results");
      assert.equal(verifyVideoSafetyResult(init.body,{
        "x-winga-video-safety-timestamp":init.headers["X-Winga-Video-Safety-Timestamp"],
        "x-winga-video-safety-signature":init.headers["X-Winga-Video-Safety-Signature"]
      },resultSecret).ok,true);
      result=JSON.parse(init.body);
      return Response.json({ok:true});
    }};
  vm.runInNewContext(source.replace("export default","const adapter =")+"\nglobalThis.result=adapter;",sandbox);
  const env={
    HIVE_API_KEY:"synthetic-hive-v3-test-key",HIVE_API_URL:"https://api.thehive.ai/api/v3/hive/visual-moderation",
    VIDEO_SAFETY_SCAN_WEBHOOK_SECRET:secret,VIDEO_SAFETY_RESULT_WEBHOOK_SECRET:resultSecret,
    HIVE_CALLBACK_TOKEN_SECRET:"test-context-secret-at-least-32-characters",
    ADAPTER_PUBLIC_URL:"https://adapter.example",WINGA_VIDEO_SAFETY_RESULT_URL:"https://backend.example/api/media/videos/safety-results",
    MEDIA_HOST_ALLOWLIST:".videodelivery.net,.cloudflarestream.com"
  };
  const streamClient=createCloudflareStreamClient({
    config:readCloudflareStreamConfig({CLOUDFLARE_STREAM_ACCOUNT_ID:"account-123",CLOUDFLARE_STREAM_API_TOKEN:"synthetic-stream-key",CLOUDFLARE_STREAM_CUSTOMER_CODE:"examplecode"}),
    fetchImpl:async(url,init)=>{
      const result=url.endsWith("/downloads")?{default:{status:"ready"}}:url.endsWith("/token")?{token:"private.download.token"}:{};
      if(url.endsWith("/token"))assert.equal(JSON.parse(init.body).downloadable,true);
      return {ok:true,status:200,json:async()=>({success:true,result})};
    }
  });
  const dispatcher=createVideoSafetyDispatcher({streamClient,
    config:{scanUrl:"https://adapter.example/scan",deliverySecret:secret},
    fetchImpl:async(url,init)=>sandbox.result.fetch(new Request(url,init),env)
  });
  assert.equal((await dispatcher.dispatch({providerId:"stream-video-123",idempotencyKey:"video-safety:stream-video-123"})).submitted,true);
  assert.equal(result.providerId,"stream-video-123");
  assert.equal(result.verdict,"review");
  assert.equal(result.modelVersion,"visual-v3");
});
