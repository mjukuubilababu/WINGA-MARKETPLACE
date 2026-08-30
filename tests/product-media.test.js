const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveMediaItemsFromLegacy,
  normalizeProductMediaItems
} = require("../backend/product-media");

test("legacy product images derive a stable canonical media contract", () => {
  const mediaItems = deriveMediaItemsFromLegacy({
    image: "/uploads/one.webp",
    images: ["/uploads/one.webp", "/uploads/two.webp"]
  });

  assert.deepEqual(mediaItems.map((item) => item.type), ["image", "image"]);
  assert.deepEqual(mediaItems.map((item) => item.url), ["/uploads/one.webp", "/uploads/two.webp"]);
  assert.deepEqual(mediaItems.map((item) => item.position), [0, 1]);
  assert.equal(mediaItems.every((item) => item.status === "ready"), true);
});

test("canonical product media allows five images and one metadata-only video", () => {
  const mediaItems = normalizeProductMediaItems({
    mediaItems: [
      {
        type: "video",
        provider: "cloudflare-stream",
        providerId: "stream-uid",
        status: "processing",
        position: 0
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        type: "image",
        url: `/uploads/image-${index}.webp`,
        position: index + 1
      })),
      {
        type: "video",
        providerId: "second-video",
        position: 9
      }
    ]
  });

  assert.equal(mediaItems.length, 6);
  assert.equal(mediaItems.filter((item) => item.type === "video").length, 1);
  assert.equal(mediaItems.filter((item) => item.type === "image").length, 5);
  assert.deepEqual(mediaItems.map((item) => item.position), [0, 1, 2, 3, 4, 5]);
});

test("canonical product media rejects embedded video bytes and keeps failed metadata", () => {
  const mediaItems = normalizeProductMediaItems({
    image: "/uploads/fallback.webp",
    mediaItems: [
      { type: "video", url: "data:video/mp4;base64,AAAA", position: 0 },
      { type: "video", providerId: "failed-stream", status: "failed", posterUrl: "/uploads/fallback.webp", position: 1 }
    ]
  });

  assert.equal(mediaItems.length, 1);
  assert.equal(mediaItems[0].providerId, "failed-stream");
  assert.equal(mediaItems[0].status, "failed");
  assert.equal(JSON.stringify(mediaItems).includes("data:video"), false);
});
