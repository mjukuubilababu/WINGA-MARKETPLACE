const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_PIXELS,
  PRODUCT_IMAGE_WIDTHS,
  SHARP_MEMORY_CACHE_MB,
  SHARP_PROCESSING_CONCURRENCY,
  createProductImageVariants,
  readProductImageMetadata
} = require("../backend/image-processing");

test("product images become bounded WebP derivatives with a 1080 canonical image", async () => {
  const source = await sharp({
    create: {
      width: 1400,
      height: 2100,
      channels: 3,
      background: { r: 240, g: 20, b: 80 }
    }
  }).png().toBuffer();
  const result = await createProductImageVariants(source);

  assert.deepEqual(result.variants.map((variant) => variant.width), PRODUCT_IMAGE_WIDTHS);
  assert.equal(result.canonical.width, 1080);
  for (const variant of result.variants) {
    const metadata = await sharp(variant.buffer).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, variant.width);
    assert.ok(variant.buffer.length < source.length);
  }
});

test("product image processing never enlarges a small source", async () => {
  const source = await sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background: { r: 10, g: 20, b: 30 }
    }
  }).png().toBuffer();
  const result = await createProductImageVariants(source);

  assert.ok(result.variants.every((variant) => variant.actualWidth === 120));
  assert.ok(result.variants.every((variant) => variant.actualHeight === 80));
});

test("stored product image metadata preserves the intrinsic display ratio", async () => {
  const source = await sharp({
    create: {
      width: 720,
      height: 1200,
      channels: 3,
      background: { r: 30, g: 90, b: 60 }
    }
  }).webp().toBuffer();

  assert.deepEqual(await readProductImageMetadata(source), {
    width: 720,
    height: 1200,
    aspectRatio: 0.6
  });
});

test("product image processing rejects input above 8MB", async () => {
  await assert.rejects(
    createProductImageVariants(Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1)),
    /8MB upload limit/
  );
});


test("product image processing accepts modern AVIF input within bounded Sharp settings", async () => {
  const source = await sharp({
    create: {
      width: 720,
      height: 1280,
      channels: 3,
      background: { r: 15, g: 80, b: 140 }
    }
  }).avif({ quality: 60 }).toBuffer();
  const result = await createProductImageVariants(source);

  assert.equal(result.source.format, "heif");
  assert.equal(result.source.width, 720);
  assert.equal(result.source.height, 1280);
  assert.ok(result.source.width * result.source.height < MAX_PRODUCT_IMAGE_PIXELS);
  assert.ok(result.variants.every((variant) => variant.contentType === "image/webp"));
  assert.ok(SHARP_MEMORY_CACHE_MB >= 8 && SHARP_MEMORY_CACHE_MB <= 128);
  assert.ok(SHARP_PROCESSING_CONCURRENCY >= 1 && SHARP_PROCESSING_CONCURRENCY <= 4);
});
