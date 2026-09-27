const crypto = require("node:crypto");
const { ROUTE, referenceName } = require("./legacy-public-media");

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function requireCheck(condition, code) { if (!condition) throw new Error(code); }

async function readBytes(response) {
  requireCheck(response.ok && response.body, "MEDIA_READ_FAILED");
  const chunks = [];
  let size = 0;
  for await (const value of response.body) {
    const bytes = Buffer.from(value);
    size += bytes.length;
    requireCheck(size <= 8 * 1024 * 1024, "MEDIA_TOO_LARGE");
    chunks.push(bytes);
  }
  requireCheck(size > 0, "MEDIA_EMPTY");
  return Buffer.concat(chunks);
}

async function verifyLegacyPublicR2({ origin = "https://winga-pflp.onrender.com", fetchImpl = fetch } = {}) {
  const base = new URL(origin);
  requireCheck(base.protocol === "https:" && !base.username && !base.password
    && base.pathname === "/" && !base.search && !base.hash, "ORIGIN_INVALID");
  const get = (pathname, method = "GET") => fetchImpl(base.origin + pathname, {
    method, redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Cache-Control": "no-cache" }
  });
  const names = new Set();
  const seenCursors = new Set();
  let cursor = "";
  for (let page = 1; page <= 5 && names.size < 3; page++) {
    const response = await get(`/api/products?limit=20&page=${page}&cursor=${encodeURIComponent(cursor)}`);
    requireCheck(response.ok, "PRODUCT_PAGE_FAILED");
    const data = await response.json();
    requireCheck(Array.isArray(data?.items), "PRODUCT_PAGE_INVALID");
    for (const product of data.items) {
      const name = referenceName(product.image);
      if (name && names.size < 3) names.add(name);
    }
    if (!data.hasMore || !data.nextCursor || seenCursors.has(data.nextCursor)) break;
    cursor = data.nextCursor;
    seenCursors.add(cursor);
  }
  requireCheck(names.size > 0, "NO_PUBLIC_LEGACY_SAMPLE");
  let verifiedBytes = 0;
  for (const name of names) {
    const response = await get(ROUTE + name);
    requireCheck(response.status !== 404, "CANARY_DISABLED_OR_MEDIA_DENIED");
    requireCheck(response.ok, "CANARY_READ_FAILED");
    requireCheck(response.headers.get("x-winga-media-source") === "r2", "R2_NOT_PROVEN_DISK_FALLBACK");
    requireCheck(response.headers.get("cache-control") === "private, no-store", "CANARY_CACHE_UNSAFE");
    const bytes = await readBytes(response);
    const original = await readBytes(await get("/uploads/" + name));
    requireCheck(bytes.length === original.length && digest(bytes) === digest(original), "LEGACY_BYTES_DIFFER");
    const head = await get(ROUTE + name, "HEAD");
    requireCheck(head.ok && head.headers.get("x-winga-media-source") === "r2"
      && Number(head.headers.get("content-length")) === bytes.length
      && head.headers.get("cache-control") === "private, no-store", "CANARY_HEAD_INVALID");
    verifiedBytes += bytes.length;
  }
  return { ok: true, mode: "read-only-canary", origin: base.origin, verified: names.size, verifiedBytes,
    r2ReadProven: true, legacyBytesMatch: true, databaseChanged: false, diskRemoved: false,
    servingPathSwitched: false, diskRemovalReady: false };
}

if (require.main === module) {
  verifyLegacyPublicR2({ origin: process.env.WINGA_MEDIA_VERIFY_ORIGIN || undefined })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      const allowed = new Set(["ORIGIN_INVALID", "PRODUCT_PAGE_FAILED", "PRODUCT_PAGE_INVALID",
        "NO_PUBLIC_LEGACY_SAMPLE", "CANARY_DISABLED_OR_MEDIA_DENIED", "CANARY_READ_FAILED",
        "R2_NOT_PROVEN_DISK_FALLBACK", "CANARY_CACHE_UNSAFE", "MEDIA_READ_FAILED", "MEDIA_TOO_LARGE",
        "MEDIA_EMPTY", "LEGACY_BYTES_DIFFER", "CANARY_HEAD_INVALID"]);
      console.error(JSON.stringify({ ok: false, errorCode: allowed.has(error.message) ? error.message : "MEDIA_PROBE_FAILED",
        diskRemoved: false, databaseChanged: false, diskRemovalReady: false }));
      process.exitCode = 1;
    });
}

module.exports = { verifyLegacyPublicR2 };
