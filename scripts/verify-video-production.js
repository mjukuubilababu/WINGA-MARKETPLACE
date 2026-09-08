#!/usr/bin/env node
"use strict";

const DEFAULT_ORIGIN = "https://wingamarket.com";
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 45000;

function cleanOrigin(value) {
  return String(value || DEFAULT_ORIGIN).trim().replace(/\/+$/, "");
}

function assertContract(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response, label) {
  const body = await response.json().catch(() => null);
  assertContract(response.ok, `${label} returned HTTP ${response.status}.`);
  assertContract(body && typeof body === "object", `${label} did not return JSON.`);
  return body;
}

function findReadyVideo(items = []) {
  for (const product of items) {
    const video = (Array.isArray(product?.mediaItems) ? product.mediaItems : []).find((item) =>
      item?.type === "video"
      && item?.status === "ready"
      && item?.moderationStatus !== "rejected"
      && item?.provider === "cloudflare-stream"
      && /^[A-Za-z0-9_-]{8,64}$/.test(String(item?.providerId || ""))
    );
    if (video) return { product, video };
  }
  return null;
}

async function findLiveVideo(origin, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit || DEFAULT_PAGE_LIMIT)));
  const maxPages = Math.max(1, Math.min(10, Number(options.maxPages || DEFAULT_MAX_PAGES)));
  let cursor = "";
  let scannedItems = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${origin}/api/products`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("page", String(page));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    const body = await readJsonResponse(response, "Product feed");
    assertContract(Array.isArray(body.items), "Product feed items must be an array.");
    assertContract(typeof body.hasMore === "boolean", "Product feed hasMore must be boolean.");
    scannedItems += body.items.length;
    const match = findReadyVideo(body.items);
    if (match) return { ...match, page, scannedItems, feedHasMore: body.hasMore };
    if (!body.hasMore) break;
    const nextCursor = String(body.nextCursor || "").trim();
    assertContract(nextCursor && nextCursor !== cursor, "Product feed cursor did not advance.");
    cursor = nextCursor;
  }
  throw new Error(`No public ready Stream video was found in ${scannedItems} scanned products.`);
}

function readCookiePair(response) {
  const setCookie = String(response.headers.get("set-cookie") || "").trim();
  const pair = setCookie.split(";", 1)[0].trim();
  assertContract(/^[^=;\s]+=[^;]+$/.test(pair), "CSRF endpoint did not set a usable cookie.");
  return pair;
}

async function verifyVideoProduction(options = {}) {
  const origin = cleanOrigin(options.origin || process.env.VIDEO_PRODUCTION_ORIGIN);
  const live = await findLiveVideo(origin, options);
  const csrfResponse = await fetchWithTimeout(`${origin}/api/auth/csrf-token`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const csrfCookie = readCookiePair(csrfResponse);
  const csrf = await readJsonResponse(csrfResponse, "CSRF endpoint");
  const csrfToken = String(csrf.csrfToken || "").trim();
  assertContract(csrfToken.length >= 32, "CSRF endpoint returned an invalid token.");

  const playbackResponse = await fetchWithTimeout(
    `${origin}/api/media/videos/${encodeURIComponent(live.video.providerId)}/playback-token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: csrfCookie,
        Origin: origin,
        "X-CSRF-Token": csrfToken
      },
      body: "{}",
      cache: "no-store"
    }
  );
  const playback = await readJsonResponse(playbackResponse, "Playback token endpoint");
  const customerCode = String(playback.customerCode || "")
    .trim()
    .toLowerCase()
    .replace(/^customer-/, "")
    .replace(/\.cloudflarestream\.com$/, "");
  const token = String(playback.token || "").trim();
  assertContract(/^[a-z0-9-]{4,80}$/.test(customerCode), "Playback customer code is invalid.");
  assertContract(token.length >= 32, "Playback token is invalid.");
  assertContract(Number(playback.expiresInSeconds || 0) > 0, "Playback token has no bounded lifetime.");

  const assetRoot = `https://customer-${customerCode}.cloudflarestream.com/${encodeURIComponent(token)}`;
  const [manifestResponse, posterResponse] = await Promise.all([
    fetchWithTimeout(`${assetRoot}/manifest/video.m3u8`, { headers: { Accept: "application/vnd.apple.mpegurl" } }),
    fetchWithTimeout(`${assetRoot}/thumbnails/thumbnail.jpg`, { headers: { Accept: "image/*" } })
  ]);
  const manifest = await manifestResponse.text();
  const posterBytes = Buffer.from(await posterResponse.arrayBuffer()).byteLength;
  const manifestType = String(manifestResponse.headers.get("content-type") || "").toLowerCase();
  const posterType = String(posterResponse.headers.get("content-type") || "").toLowerCase();
  assertContract(manifestResponse.ok, `HLS manifest returned HTTP ${manifestResponse.status}.`);
  assertContract(manifestType.includes("mpegurl"), `HLS manifest content type is ${manifestType || "missing"}.`);
  assertContract(manifest.startsWith("#EXTM3U"), "HLS manifest body is invalid.");
  assertContract(posterResponse.ok, `Video poster returned HTTP ${posterResponse.status}.`);
  assertContract(posterType.startsWith("image/"), `Video poster content type is ${posterType || "missing"}.`);
  assertContract(posterBytes > 0, "Video poster is empty.");

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    origin,
    productId: String(live.product.id || "").slice(0, 100),
    feedPage: live.page,
    scannedItems: live.scannedItems,
    feedHasMore: live.feedHasMore,
    media: {
      provider: "cloudflare-stream",
      status: live.video.status,
      moderationStatus: live.video.moderationStatus || "approved",
      durationSeconds: Number(live.video.duration || 0)
    },
    playback: {
      signingMode: String(playback.signingMode || "unknown"),
      expiresInSeconds: Number(playback.expiresInSeconds || 0),
      adaptiveRenditions: (manifest.match(/#EXT-X-STREAM-INF:/g) || []).length,
      manifestContentType: manifestType,
      manifestCacheControl: String(manifestResponse.headers.get("cache-control") || ""),
      posterContentType: posterType,
      posterCacheControl: String(posterResponse.headers.get("cache-control") || ""),
      posterBytes
    }
  };
}

async function main() {
  try {
    const result = await verifyVideoProduction();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[WINGA] Video production verification failed: ${error?.message || error}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { findLiveVideo, findReadyVideo, verifyVideoProduction };
