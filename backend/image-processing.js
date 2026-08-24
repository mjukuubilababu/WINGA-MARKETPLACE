const sharp = require("sharp");

const PRODUCT_IMAGE_WIDTHS = Object.freeze([320, 640, 1080]);
const PRODUCT_IMAGE_WEBP_QUALITY = 75;
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_PIXELS = 40_000_000;

async function createProductImageVariants(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new TypeError("Product image processing requires a non-empty Buffer.");
  }
  if (buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new RangeError("Product image exceeds the 8MB upload limit.");
  }

  const widths = Array.isArray(options.widths) && options.widths.length
    ? [...new Set(options.widths.map(Number).filter((width) => Number.isInteger(width) && width > 0))].sort((a, b) => a - b)
    : PRODUCT_IMAGE_WIDTHS;
  const quality = Number.isInteger(options.quality)
    ? Math.min(100, Math.max(1, options.quality))
    : PRODUCT_IMAGE_WEBP_QUALITY;
  const source = sharp(buffer, {
    animated: true,
    failOn: "error",
    limitInputPixels: MAX_PRODUCT_IMAGE_PIXELS
  }).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Product image dimensions could not be read.");
  }

  const variants = await Promise.all(widths.map(async (width) => {
    const output = await source
      .clone()
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      width,
      actualWidth: output.info.width,
      actualHeight: output.info.height,
      contentType: "image/webp",
      buffer: output.data
    };
  }));

  return {
    source: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format || ""
    },
    variants,
    canonical: variants[variants.length - 1]
  };
}

module.exports = {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_WEBP_QUALITY,
  PRODUCT_IMAGE_WIDTHS,
  createProductImageVariants
};
