const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { readR2Config, getR2Client } = require("./storage-r2");

const ROUTE = "/api/media/legacy-public/";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" };

function validName(name) {
  return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)
    && !name.includes("..") && Boolean(TYPES[path.extname(name).toLowerCase()]);
}

function familyNames(name) {
  if (!validName(name)) return [];
  const match = name.match(/^(.*)-(320|640|1080)\.webp$/);
  return match ? [320, 640, 1080].map((width) => `${match[1]}-${width}.webp`) : [name];
}

function referenceName(value) {
  if (typeof value !== "string" || value.startsWith("data:")) return "";
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    try { pathname = new URL(value).pathname; } catch (_error) { return ""; }
  }
  if (!pathname.startsWith("/uploads/")) return "";
  const name = pathname.slice(9);
  return validName(name) ? name : "";
}

function productReferences(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  const items = Array.isArray(row.media_items) ? row.media_items : [];
  return [row.image, ...images, ...items.filter((item) => item?.type === "image")
    .flatMap((item) => [item.url, item.posterUrl, item.thumbnailUrl])];
}

function createLegacyPublicMediaStore({ query }) {
  return {
    async authorizeLegacyPublicMedia(name) {
      const names = new Set(familyNames(name));
      if (!names.size) return false;
      const stem = name.replace(/-(320|640|1080)\.webp$/, "");
      // Primary-only, bounded candidate read; exact structured references decide access.
      const result = await query(`
        SELECT 'product' AS kind, p.image, p.images, p.media_items, p.status,
          COALESCE(v.visibility, 'public') AS visibility, u.status AS owner_status
        FROM products p
        LEFT JOIN users u ON u.username = p.uploaded_by
        LEFT JOIN public_content_visibility v ON v.content_type = 'product' AND v.content_id = p.id
        WHERE strpos(p.image, $1) > 0 OR strpos(p.images::text, $1) > 0
          OR strpos(p.media_items::text, $1) > 0
        UNION ALL
        SELECT 'identity', identity_document_image, '[]'::jsonb, '[]'::jsonb, '', '', ''
        FROM users WHERE strpos(identity_document_image, $1) > 0
        LIMIT 101
      `, [stem]);
      if (result.rows.length > 100) throw new Error("LEGACY_MEDIA_CANDIDATE_LIMIT");
      let publicMatch = false;
      for (const row of result.rows) {
        const values = row.kind === "identity" ? [row.image] : productReferences(row);
        if (!values.some((value) => names.has(referenceName(value)))) continue;
        if (row.kind !== "product" || row.status !== "approved" || row.visibility !== "public"
          || row.owner_status !== "active") return false;
        publicMatch = true;
      }
      return publicMatch;
    }
  };
}

async function readLegacyR2Media(name, options = {}) {
  if (!validName(name)) throw new Error("LEGACY_MEDIA_NAME_INVALID");
  const config = readR2Config(options.env);
  if (!config) throw new Error("LEGACY_MEDIA_R2_UNCONFIGURED");
  const client = options.client || getR2Client(config);
  const result = await client.send(new GetObjectCommand({
    Bucket: config.bucketName, Key: "products/legacy/" + name
  }), { abortSignal: AbortSignal.timeout(10000) });
  const body = result.Body;
  if (!body || !body[Symbol.asyncIterator]) throw new Error("LEGACY_MEDIA_BODY_INVALID");
  const timer = setTimeout(() => body.destroy?.(new Error("LEGACY_MEDIA_READ_TIMEOUT")), 10000);
  let size = 0;
  const chunks = [];
  try {
    if (result.ContentLength > MAX_BYTES) throw new Error("LEGACY_MEDIA_TOO_LARGE");
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BYTES) throw new Error("LEGACY_MEDIA_TOO_LARGE");
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!bytes.length || !/^[a-f0-9]{64}$/.test(result.Metadata?.sha256 || "")
      || digest !== result.Metadata.sha256) throw new Error("LEGACY_MEDIA_INTEGRITY_FAILED");
    return bytes;
  } finally {
    clearTimeout(timer);
    body.destroy?.();
  }
}

async function readLegacyLocalMedia(directory, name) {
  if (!validName(name)) return null;
  const filename = path.join(directory, name);
  try {
    const stat = await fs.promises.lstat(filename);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) return null;
    const handle = await fs.promises.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) return null;
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) return null;
        offset += bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) return null;
      return bytes;
    } finally { await handle.close(); }
  } catch (_error) { return null; }
}

function createLegacyPublicMediaHandler({ enabled = false, authorize, readRemote = readLegacyR2Media,
  readLocal = async () => null, onOutcome = () => {}, route = ROUTE, passUnmapped = false }) {
  let inFlight = 0;
  return async function handle(req, res, pathname) {
    if (!pathname.startsWith(route)) return false;
    if (!enabled && passUnmapped) return false;
    const startedAt = Date.now();
    const common = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin", "Access-Control-Allow-Origin": "*" };
    const finish = (status, outcome, bytes = null, name = "") => {
      try { onOutcome({ outcome, status, durationMs: Date.now() - startedAt }); } catch (_error) { /* telemetry cannot break images */ }
      if (res.destroyed || res.writableEnded) return true;
      const payload = bytes || Buffer.from(JSON.stringify({ error: status === 503 ? "media_unavailable" : "media_not_found" }));
      res.writeHead(status, { ...common, "Content-Type": bytes ? TYPES[path.extname(name).toLowerCase()] : "application/json; charset=utf-8",
        "Content-Length": String(payload.length), ...(status === 405 ? { Allow: "GET, HEAD" } : {}),
        ...(bytes ? { "X-Winga-Media-Source": outcome } : {}) });
      res.end(req.method === "HEAD" ? undefined : payload);
      return true;
    };
    if (!enabled) return finish(404, "disabled");
    if (!["GET", "HEAD"].includes(req.method)) return finish(405, "method_not_allowed");
    const name = pathname.slice(route.length);
    if (!validName(name)) return finish(404, "invalid_name");
    if (inFlight >= 4) return finish(503, "busy");
    inFlight += 1;
    try {
      let proof;
      const permitted = (value) => value === true || /^[a-f0-9]{64}$/.test(value?.sha256 || "");
      const matches = (value, bytes) => value === true || crypto.createHash("sha256").update(bytes).digest("hex") === value.sha256;
      try {
        proof = authorize ? await authorize(name) : false;
        if (proof === null && passUnmapped) return false;
        if (!permitted(proof)) return finish(404, "denied");
      } catch (_error) { return finish(503, "authorization_unavailable"); }
      let bytes;
      let source = "r2";
      try { bytes = await readRemote(name); } catch (_error) { bytes = null; }
      if (!bytes) {
        source = "disk_fallback";
        try { bytes = await readLocal(name); } catch (_error) { bytes = null; }
      }
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) return finish(503, "storage_unavailable");
      if (!matches(proof, bytes)) return finish(503, "integrity_failed");
      // Recheck after I/O so a visibility change during an R2 read does not release bytes.
      try {
        const currentProof = await authorize(name);
        if (!permitted(currentProof)) return finish(404, "denied");
        if (!matches(currentProof, bytes)) return finish(503, "integrity_failed");
      } catch (_error) { return finish(503, "authorization_unavailable"); }
      return finish(200, source, bytes, name);
    } finally { inFlight -= 1; }
  };
}

module.exports = { ROUTE, validName, familyNames, referenceName, productReferences, createLegacyPublicMediaStore,
  readLegacyR2Media, readLegacyLocalMedia, createLegacyPublicMediaHandler };
