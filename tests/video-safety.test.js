const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isVideoSafetyConfigured,
  normalizeVideoSafetyResult,
  readVideoSafetyConfig,
  signVideoSafetyPayload,
  verifyVideoSafetyResult
} = require("../backend/video-safety");

test("video safety stays disabled unless every secure provider setting is valid", () => {
  assert.equal(isVideoSafetyConfigured(readVideoSafetyConfig({})), false);
  assert.equal(isVideoSafetyConfigured(readVideoSafetyConfig({
    VIDEO_SAFETY_SCAN_WEBHOOK_URL: "https://scanner.example/jobs",
    VIDEO_SAFETY_SCAN_WEBHOOK_SECRET: "delivery-secret-at-least-32-characters",
    VIDEO_SAFETY_RESULT_WEBHOOK_SECRET: "callback-secret-at-least-32-characters",
    VIDEO_SAFETY_RESULT_CALLBACK_URL: "https://winga.example/api/media/videos/safety-result"
  })), true);
  assert.equal(isVideoSafetyConfigured(readVideoSafetyConfig({
    VIDEO_SAFETY_SCAN_WEBHOOK_URL: "http://scanner.example/jobs",
    VIDEO_SAFETY_SCAN_WEBHOOK_SECRET: "delivery-secret-at-least-32-characters",
    VIDEO_SAFETY_RESULT_WEBHOOK_SECRET: "callback-secret-at-least-32-characters",
    VIDEO_SAFETY_RESULT_CALLBACK_URL: "https://winga.example/api/media/videos/safety-result"
  })), false);
});

test("video safety result signatures reject tampering and replay", () => {
  const secret = "video-safety-callback-secret-at-least-32-characters";
  const timestamp = 1788116000;
  const rawBody = '{"providerId":"video-123","verdict":"safe"}';
  const signature = signVideoSafetyPayload(timestamp, rawBody, secret);
  const headers = {
    "x-winga-video-safety-timestamp": String(timestamp),
    "x-winga-video-safety-signature": `sha256=${signature}`
  };
  assert.equal(verifyVideoSafetyResult(rawBody, headers, secret, { nowSeconds: timestamp }).ok, true);
  assert.equal(verifyVideoSafetyResult(`${rawBody} `, headers, secret, { nowSeconds: timestamp }).reason, "signature_mismatch");
  assert.equal(verifyVideoSafetyResult(rawBody, headers, secret, { nowSeconds: timestamp + 301 }).reason, "stale_or_invalid_timestamp");
});

test("video safety normalization bounds untrusted provider evidence", () => {
  const result = normalizeVideoSafetyResult({
    providerId: "video-123",
    resultId: "result-123",
    verdict: "blocked",
    riskScore: 9,
    labels: ["Violence", "violence", "Spam"],
    scores: { violence: 4, spam: -2 },
    provider: "scanner-one",
    modelVersion: "v7"
  });
  assert.equal(result.verdict, "blocked");
  assert.equal(result.riskScore, 1);
  assert.deepEqual(result.labels, ["violence", "spam"]);
  assert.deepEqual(result.scores, { violence: 1, spam: 0 });
  assert.equal(normalizeVideoSafetyResult({ verdict: "unexpected" }).verdict, "error");
});