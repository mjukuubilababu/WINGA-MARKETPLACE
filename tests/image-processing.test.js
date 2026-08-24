const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_WIDTHS,
  createProductImageVariants
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

test("product image processing rejects input above 8MB", async () => {
  await assert.rejects(
    createProductImageVariants(Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1)),
    /8MB upload limit/
  );
});
