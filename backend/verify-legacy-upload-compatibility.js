const crypto = require("node:crypto");
const { validName } = require("./legacy-public-media");
function check(value, code) { if (!value) throw new Error(code); }
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function readCompatibilityManifest(db) {
  const rows = (await db.query("SELECT id, source_hashes FROM legacy_public_media_cutovers WHERE state='applied' ORDER BY id LIMIT 101")).rows;
  check(rows.length > 0 && rows.length <= 100, "COMPAT_JOURNAL_UNAVAILABLE");
  const files = new Map();
  for (const row of rows) {
    check(row.source_hashes && typeof row.source_hashes === "object", "COMPAT_JOURNAL_INVALID");
    for (const [name, hash] of Object.entries(row.source_hashes)) {
      check(validName(name) && /^[a-f0-9]{64}$/.test(hash) && (!files.has(name) || files.get(name) === hash), "COMPAT_JOURNAL_INVALID");
      files.set(name, hash);
    }
  }
  check(files.size > 0 && files.size <= 1000, "COMPAT_INVENTORY_LIMIT");
  return { journals: rows.map((row) => row.id), files: [...files].sort(([a], [b]) => a.localeCompare(b)) };
}

async function verifyLegacyUploadCompatibility({ readManifest, origin = "https://winga-pflp.onrender.com", fetchImpl = fetch, onProgress = () => {} }) {
  const base = new URL(origin);
  check(base.protocol === "https:" && !base.username && !base.password && base.pathname === "/" && !base.search && !base.hash, "COMPAT_ORIGIN_INVALID");
  const manifest = await readManifest();
  check(Array.isArray(manifest?.files) && manifest.files.length > 0 && manifest.files.length <= 1000, "COMPAT_INVENTORY_LIMIT");
  let verified = 0;
  let verifiedBytes = 0;
  const request = async (pathname, expectedHash, method = "GET", expectedSize = 0) => {
    const response = await fetchImpl(base.origin + pathname, { method, redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Cache-Control": "no-cache" } });
    try {
      check(response.ok, "COMPAT_HTTP_FAILED");
      check(response.headers.get("x-winga-media-source") === "r2", "COMPAT_R2_NOT_PROVEN");
      check(response.headers.get("cache-control") === "private, no-store", "COMPAT_CACHE_UNSAFE");
      check(/^image\/(jpeg|png|webp|avif|gif)(;|$)/i.test(response.headers.get("content-type") || ""), "COMPAT_CONTENT_TYPE_INVALID");
      const size = Number(response.headers.get("content-length"));
      check(size > 0 && size <= 8 * 1024 * 1024, "COMPAT_SIZE_INVALID");
      if (method === "HEAD") { check(size === expectedSize, "COMPAT_HEAD_INVALID"); return size; }
      check(response.body, "COMPAT_BODY_INVALID");
      let received = 0;
      const hash = crypto.createHash("sha256");
      for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        received += bytes.length;
        check(received <= 8 * 1024 * 1024, "COMPAT_SIZE_INVALID");
        hash.update(bytes);
      }
      check(received === size && hash.digest("hex") === expectedHash, "COMPAT_BYTES_DIFFER");
      return received;
    } finally {
      if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
  };
  for (const [name, hash] of manifest.files) {
    const bytes = await request("/uploads/" + name, hash);
    if (verified === 0) {
      await request("/uploads/" + name, hash, "HEAD", bytes);
      const proxyPath = "/__winga-image__?u=" + encodeURIComponent("/uploads/" + name);
      await request(proxyPath, hash);
      await request(proxyPath, hash, "HEAD", bytes);
    }
    verified += 1;
    verifiedBytes += bytes;
    if (verified % 25 === 0) onProgress({ verified, planned: manifest.files.length });
  }
  check(digest(JSON.stringify(manifest)) === digest(JSON.stringify(await readManifest())), "COMPAT_MANIFEST_CHANGED");
  return { ok: true, mode: "verify-legacy-upload-compatibility", privacy: "aggregate-only", origin: base.origin,
    verified, verifiedBytes, r2CompatibilityProven: true, manifestStable: true, proxySampleVerified: true,
    sourceDiskReadByVerifier: false, diskFallbackObserved: false, databaseChanged: false, filesChanged: false,
    diskRemoved: false, diskRemovalReady: false, crossNodeFailoverProven: false };
}

async function main() {
  require("./load-env");
  check(process.argv.length === 2, "COMPAT_UNEXPECTED_ARGUMENTS");
  check(process.env.DATABASE_URL, "COMPAT_DATABASE_REQUIRED");
  const { Client } = require("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false });
  try {
    await db.connect();
    await db.query("SET default_transaction_read_only=on");
    await db.query("SET statement_timeout='20s'");
    const result = await verifyLegacyUploadCompatibility({ readManifest: () => readCompatibilityManifest(db),
      origin: process.env.WINGA_MEDIA_VERIFY_ORIGIN || undefined,
      onProgress: (value) => console.log(JSON.stringify(value)) });
    console.log(JSON.stringify(result, null, 2));
  } finally { await db.end().catch(() => {}); }
}
if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ ok: false, errorCode: /^COMPAT_[A-Z_]+$/.test(error.message || "") ? error.message : "COMPAT_PROBE_FAILED",
    databaseChanged: false, diskRemoved: false, diskRemovalReady: false }));
  process.exitCode = 1;
});
module.exports = { readCompatibilityManifest, verifyLegacyUploadCompatibility };
