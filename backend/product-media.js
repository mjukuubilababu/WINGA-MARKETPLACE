const MEDIA_ITEM_TYPES = new Set(["image", "video"]);
const MEDIA_ITEM_STATUSES = new Set(["uploading", "uploaded", "processing", "ready", "failed"]);
const MAX_PRODUCT_MEDIA_ITEMS = 6;
const MAX_PRODUCT_IMAGE_ITEMS = 5;
const MAX_PRODUCT_VIDEO_ITEMS = 1;

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function deriveMediaItemsFromLegacy(product = {}) {
  const legacyImages = Array.isArray(product.images) && product.images.length ? product.images : [product.image];
  const seen = new Set();
  return legacyImages
    .map((value) => cleanText(value, 4096))
    .filter((url) => url && !seen.has(url) && seen.add(url))
    .slice(0, MAX_PRODUCT_IMAGE_ITEMS)
    .map((url, position) => ({
      type: "image", status: "ready", url, posterUrl: "", thumbnailUrl: url,
      provider: "winga", providerId: "", width: 0, height: 0, duration: 0, position
    }));
}

function normalizeMediaItem(item = {}, fallbackPosition = 0) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const type = cleanText(item.type, 16).toLowerCase();
  if (!MEDIA_ITEM_TYPES.has(type)) return null;
  const requestedStatus = cleanText(item.status, 24).toLowerCase();
  const status = MEDIA_ITEM_STATUSES.has(requestedStatus)
    ? requestedStatus
    : (type === "image" ? "ready" : "processing");
  const url = cleanText(item.url || item.playbackUrl, 4096);
  const providerId = cleanText(item.providerId || item.uid, 200);
  if (type === "image" && !url) return null;
  if (type === "video" && /^(?:data|blob):/i.test(url)) return null;
  if (type === "video" && !url && !providerId) return null;
  const requestedPosition = Number(item.position);
  return {
    type,
    status,
    url,
    posterUrl: cleanText(item.posterUrl, 4096),
    thumbnailUrl: cleanText(item.thumbnailUrl, 4096),
    provider: cleanText(item.provider, 40),
    providerId,
    width: cleanNonNegativeNumber(item.width),
    height: cleanNonNegativeNumber(item.height),
    duration: cleanNonNegativeNumber(item.duration),
    position: Number.isInteger(requestedPosition) && requestedPosition >= 0
      ? requestedPosition
      : Math.max(0, Number(fallbackPosition || 0))
  };
}

function normalizeProductMediaItems(product = {}) {
  const source = Array.isArray(product.mediaItems) && product.mediaItems.length
    ? product.mediaItems
    : deriveMediaItemsFromLegacy(product);
  const normalized = source
    .map((item, index) => normalizeMediaItem(item, index))
    .filter(Boolean)
    .sort((first, second) => first.position - second.position);
  const result = [];
  let imageCount = 0;
  let videoCount = 0;
  for (const item of normalized) {
    if (result.length >= MAX_PRODUCT_MEDIA_ITEMS) break;
    if (item.type === "image") {
      if (imageCount >= MAX_PRODUCT_IMAGE_ITEMS) continue;
      imageCount += 1;
    } else {
      if (videoCount >= MAX_PRODUCT_VIDEO_ITEMS) continue;
      videoCount += 1;
    }
    result.push({ ...item, position: result.length });
  }
  return result.length ? result : deriveMediaItemsFromLegacy(product);
}

module.exports = {
  MAX_PRODUCT_IMAGE_ITEMS,
  MAX_PRODUCT_MEDIA_ITEMS,
  MAX_PRODUCT_VIDEO_ITEMS,
  deriveMediaItemsFromLegacy,
  normalizeMediaItem,
  normalizeProductMediaItems
};
