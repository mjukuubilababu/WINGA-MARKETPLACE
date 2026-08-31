const assert = require("node:assert/strict");
const crypto = require("crypto");
const test = require("node:test");
const { createCloudflareStreamClient, normalizeStreamVideo, readCloudflareStreamConfig, verifyCloudflareStreamWebhook } = require("../backend/cloudflare-stream");

test("Stream direct upload is private, origin-bound, short-lived, and never exposes the API token", async () => {
  const calls = [];
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({ CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123", CLOUDFLARE_STREAM_API_TOKEN: "stream-secret-token", CLOUDFLARE_STREAM_ALLOWED_ORIGINS: "wingamarket.com,www.wingamarket.com", CLOUDFLARE_STREAM_MAX_DURATION_SECONDS: "75" }),
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ success: true, result: { uid: "stream-video-123", uploadURL: "https://upload.videodelivery.net/once" } }) }; }
  });
  const result = await client.createDirectUpload({ creator: "seller-one", uploadId: "upload-one", fileName: "dress.mov", contentType: "video/quicktime", durationSeconds: 12.4 });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(result.providerId, "stream-video-123");
  assert.equal(result.maxDurationSeconds, 73);
  assert.equal(body.maxDurationSeconds, 73);
  assert.equal(body.requireSignedURLs, true);
  assert.deepEqual(body.allowedOrigins, ["wingamarket.com", "www.wingamarket.com"]);
  assert.equal(body.meta.uploadId, "upload-one");
  assert.equal(JSON.stringify(result).includes("stream-secret-token"), false);
});

test("Stream webhook verification rejects tampering and replayed signatures", () => {
  const secret = "stream-webhook-secret-at-least-32-characters";
  const rawBody = '{"uid":"stream-video-123","readyToStream":true}';
  const nowSeconds = 1788089000;
  const signature = crypto.createHmac("sha256", secret).update(`${nowSeconds}.${rawBody}`).digest("hex");
  const header = `time=${nowSeconds},sig1=${signature}`;
  assert.equal(verifyCloudflareStreamWebhook(rawBody, header, secret, { nowSeconds }).ok, true);
  assert.equal(verifyCloudflareStreamWebhook(`${rawBody} `, header, secret, { nowSeconds }).reason, "signature_mismatch");
  assert.equal(verifyCloudflareStreamWebhook(rawBody, header, secret, { nowSeconds: nowSeconds + 301 }).reason, "stale_signature");
});

test("Stream video normalization exposes playback only after encoding is ready", () => {
  const processing = normalizeStreamVideo({ uid: "video-one", readyToStream: false, status: { state: "inprogress" }, playback: { hls: "https://invalid/private.m3u8" } });
  const ready = normalizeStreamVideo({ uid: "video-one", creator: "seller-one", duration: 12.5, readyToStream: true, status: { state: "ready" }, playback: { hls: "https://video.example/manifest.m3u8" }, thumbnail: "https://video.example/thumb.jpg" });
  assert.equal(processing.status, "processing");
  assert.equal(processing.hlsUrl, "");
  assert.equal(ready.status, "ready");
  assert.equal(ready.duration, 12.5);
});

test("Stream signed playback tokens are short-lived and non-downloadable", async () => {
  let requestBody;
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({ CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123", CLOUDFLARE_STREAM_API_TOKEN: "secret", CLOUDFLARE_STREAM_CUSTOMER_CODE: "customer-code", CLOUDFLARE_STREAM_PLAYBACK_TOKEN_TTL_SECONDS: "600" }),
    fetchImpl: async (_url, init) => { requestBody = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ success: true, result: { token: "signed.playback.token" } }) }; }
  });
  const result = await client.createPlaybackToken("stream-video-123");
  assert.equal(result.token, "signed.playback.token");
  assert.equal(result.expiresInSeconds, 600);
  assert.equal(requestBody.downloadable, false);
  assert.ok(requestBody.exp > Math.floor(Date.now() / 1000));
});

test("Stream resumable upload provisions a private direct-user TUS endpoint", async () => {
  const calls = [];
  const headers = new Map([
    ["location", "https://upload.videodelivery.net/tus-upload-one"],
    ["stream-media-id", "stream-video-tus-123"]
  ]);
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({
      CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123",
      CLOUDFLARE_STREAM_API_TOKEN: "stream-secret-token",
      CLOUDFLARE_STREAM_ALLOWED_ORIGINS: "wingamarket.com",
      CLOUDFLARE_STREAM_MAX_DURATION_SECONDS: "36000"
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 201, headers: { get: (name) => headers.get(String(name).toLowerCase()) || null } };
    }
  });

  const result = await client.createResumableUpload({
    creator: "seller-one",
    uploadId: "upload-tus-one",
    fileName: "long-video.avi",
    contentType: "video/x-msvideo",
    fileSize: 5 * 1024 * 1024 * 1024
  });

  assert.equal(calls[0].url.endsWith("/stream?direct_user=true"), true);
  assert.equal(calls[0].init.headers["Tus-Resumable"], "1.0.0");
  assert.equal(calls[0].init.headers["Upload-Length"], String(5 * 1024 * 1024 * 1024));
  assert.equal(calls[0].init.headers.Authorization, "Bearer stream-secret-token");
  assert.match(calls[0].init.headers["Upload-Metadata"], /maxdurationseconds/);
  assert.match(calls[0].init.headers["Upload-Metadata"], /requiresignedurls/);
  assert.equal(result.uploadProtocol, "tus");
  assert.equal(result.providerId, "stream-video-tus-123");
  assert.equal(result.maxDurationSeconds, 36000);
  assert.equal(JSON.stringify(result).includes("stream-secret-token"), false);
});
test("Stream upload duration reservation is measured, buffered, and capped", async () => {
  const bodies = [];
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({ CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123", CLOUDFLARE_STREAM_API_TOKEN: "secret", CLOUDFLARE_STREAM_MAX_DURATION_SECONDS: "36000" }),
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ success: true, result: { uid: "stream-video-duration", uploadURL: "https://upload.videodelivery.net/duration" } }) };
    }
  });
  const measured = await client.createDirectUpload({ creator: "seller-one", durationSeconds: 30.2 });
  const capped = await client.createDirectUpload({ creator: "seller-one", durationSeconds: 50000 });
  assert.equal(measured.maxDurationSeconds, 91);
  assert.equal(bodies[0].maxDurationSeconds, 91);
  assert.equal(capped.maxDurationSeconds, 36000);
  assert.equal(bodies[1].maxDurationSeconds, 36000);
});
