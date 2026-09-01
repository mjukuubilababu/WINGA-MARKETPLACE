const assert = require("node:assert/strict");
const crypto = require("crypto");
const test = require("node:test");
const { createCloudflareStreamClient, extractStreamCustomerCode, normalizeStreamVideo, readCloudflareStreamConfig, verifyCloudflareStreamWebhook } = require("../backend/cloudflare-stream");

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
  const calls = [];
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({ CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123", CLOUDFLARE_STREAM_API_TOKEN: "secret", CLOUDFLARE_STREAM_CUSTOMER_CODE: "customer-code", CLOUDFLARE_STREAM_PLAYBACK_TOKEN_TTL_SECONDS: "600" }),
    fetchImpl: async (url, init) => { calls.push({ url, init }); requestBody = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ success: true, result: { token: "signed.playback.token" } }) }; }
  });
  const result = await client.createPlaybackToken("stream-video-123");
  assert.equal(result.token, "signed.playback.token");
  assert.equal(result.expiresInSeconds, 600);
  assert.equal(requestBody.downloadable, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].init.body).allowedOrigins, ["wingamarket.com", "www.wingamarket.com"]);
  assert.equal(JSON.parse(calls[0].init.body).requireSignedURLs, true);
  assert.ok(requestBody.exp > Math.floor(Date.now() / 1000));
});

test("Stream signed playback derives customer code from trusted provider URLs", async () => {
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({ CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123", CLOUDFLARE_STREAM_API_TOKEN: "secret" }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: { token: "signed.playback.token" } }) })
  });
  const result = await client.createPlaybackToken("stream-video-123", {
    hlsUrl: "https://customer-abcd1234.cloudflarestream.com/stream-video-123/manifest/video.m3u8"
  });
  assert.equal(extractStreamCustomerCode("https://customer-abcd1234.cloudflarestream.com/video/iframe"), "abcd1234");
  assert.equal(result.customerCode, "abcd1234");
});

test("Stream local signing scales playback tokens without a per-view token API call", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signingJwk = Buffer.from(JSON.stringify(privateKey.export({ format: "jwk" })), "utf8").toString("base64");
  const calls = [];
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({
      CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123",
      CLOUDFLARE_STREAM_API_TOKEN: "secret",
      CLOUDFLARE_STREAM_CUSTOMER_CODE: "customer-code",
      CLOUDFLARE_STREAM_PLAYBACK_TOKEN_TTL_SECONDS: "600",
      CLOUDFLARE_STREAM_SIGNING_KEY_ID: "stream-key-123",
      CLOUDFLARE_STREAM_SIGNING_JWK: signingJwk
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      assert.equal(url.endsWith("/token"), false);
      return { ok: true, status: 200, json: async () => ({ success: true, result: {} }) };
    }
  });

  const result = await client.createPlaybackToken("stream-video-123");
  const [encodedHeader, encodedPayload, signature] = result.token.split(".");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

  assert.equal(result.signingMode, "local");
  assert.equal(header.alg, "RS256");
  assert.equal(header.kid, "stream-key-123");
  assert.equal(payload.sub, "stream-video-123");
  assert.equal(payload.exp - payload.nbf >= 600, true);
  assert.equal(crypto.verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"), publicKey, Buffer.from(signature, "base64url")), true);
  assert.equal(calls.length, 1);
  assert.equal(client.config.signingJwk, "");
});

test("Stream local signing fails closed when signing material is incomplete", async () => {
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({
      CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123",
      CLOUDFLARE_STREAM_API_TOKEN: "secret",
      CLOUDFLARE_STREAM_CUSTOMER_CODE: "customer-code",
      CLOUDFLARE_STREAM_SIGNING_KEY_ID: "stream-key-123"
    }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: {} }) })
  });
  await assert.rejects(() => client.createPlaybackToken("stream-video-123"), { code: "stream_signing_key_invalid" });
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

test("Stream captions are normalized, cached, and served only as valid WebVTT", async () => {
  const calls = [];
  const client = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({
      CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123",
      CLOUDFLARE_STREAM_API_TOKEN: "stream-secret-token"
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/captions")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, result: [
            { language: "sw", label: "Kiswahili", status: "ready", generated: false },
            { language: "en-GB", label: "British English", status: "ready", generated: true },
            { language: "fr", label: "Français", status: "inprogress", generated: true },
            { language: "../bad", label: "Bad", status: "ready" }
          ] })
        };
      }
      return { ok: true, status: 200, text: async () => "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nKaribu Winga.\n" };
    }
  });

  const first = await client.listCaptions("stream-video-123");
  const second = await client.listCaptions("stream-video-123");
  const vtt = await client.readCaptionVtt("stream-video-123", "sw");

  assert.deepEqual(first.map((item) => item.language), ["sw", "en-GB"]);
  assert.deepEqual(second, first);
  assert.equal(calls.filter((call) => call.url.endsWith("/captions")).length, 1);
  assert.equal(vtt.startsWith("WEBVTT"), true);
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer stream-secret-token");
  assert.equal(calls.at(-1).init.headers.Accept, "text/vtt");

  const invalidClient = createCloudflareStreamClient({
    config: readCloudflareStreamConfig({
      CLOUDFLARE_STREAM_ACCOUNT_ID: "account-123",
      CLOUDFLARE_STREAM_API_TOKEN: "stream-secret-token"
    }),
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "not-vtt" })
  });
  await assert.rejects(
    () => invalidClient.readCaptionVtt("stream-video-123", "sw"),
    { code: "stream_invalid_caption_response" }
  );
});