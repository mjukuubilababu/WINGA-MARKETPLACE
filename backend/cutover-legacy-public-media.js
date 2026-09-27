const path = require("node:path");
const { readR2Config, getR2Client } = require("./storage-r2");
const { readUploadInventory, readReferenceRows } = require("./audit-legacy-uploads");
const { createLegacyPublicMediaStore, readLegacyLocalMedia, readLegacyR2Media, validName } = require("./legacy-public-media");
const { verifyLegacyPublicInventory } = require("./verify-legacy-public-inventory");
const { CutoverError, requireCondition, sha256, publicBase, readCutoverPlan,
  summary, readJournal, applyCutover, rollbackCutover } = require("./legacy-public-media-cutover");

async function readPublicDestination(base, name, fetchImpl = fetch) {
  requireCondition(validName(name), "PUBLIC_MEDIA_NAME_INVALID");
  const response = await fetchImpl(`${publicBase(base)}/products/legacy/${name}`, {
    redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Cache-Control": "no-cache" }
  });
  try {
    requireCondition(response.ok && response.body && /^image\/(jpeg|png|webp|avif|gif)(;|$)/i.test(response.headers.get("content-type") || ""), "PUBLIC_CDN_RESPONSE_INVALID");
    requireCondition(Number(response.headers.get("content-length") || 0) <= 8 * 1024 * 1024, "PUBLIC_CDN_IMAGE_TOO_LARGE");
    const chunks = [];
    let size = 0;
    for await (const part of response.body) {
      const bytes = Buffer.from(part);
      size += bytes.length;
      requireCondition(size <= 8 * 1024 * 1024, "PUBLIC_CDN_IMAGE_TOO_LARGE");
      chunks.push(bytes);
    }
    requireCondition(size > 0, "PUBLIC_CDN_RESPONSE_INVALID");
    return Buffer.concat(chunks);
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}

function parseMode(args) {
  if (!args.length) return { mode: "dry-run" };
  const match = args.length === 1 && args[0].match(/^--(apply|rollback)=([a-f0-9]{64})$/);
  requireCondition(match, "USE_DRY_RUN_OR_EXPLICIT_APPLY_OR_ROLLBACK_PLAN_ID");
  return { mode: match[1], id: match[2] };
}

async function main() {
  require("./load-env");
  const command = parseMode(process.argv.slice(2));
  requireCondition(process.env.DATABASE_URL && process.env.WINGA_UPLOADS_DIR, "DATABASE_AND_UPLOADS_CONFIGURATION_REQUIRED");
  const config = readR2Config();
  requireCondition(config, "R2_CONFIGURATION_REQUIRED");
  const base = publicBase(config.publicUrlBase);
  const directory = path.resolve(process.env.WINGA_UPLOADS_DIR);
  const { Client } = require("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : false });
  let r2;
  try {
    await db.connect();
    await db.query("SET statement_timeout = '20s'");
    if (command.mode === "dry-run") await db.query("SET default_transaction_read_only = on");
    let result;
    if (command.mode === "rollback") {
      result = await rollbackCutover(db, command.id, async (hashes) => {
        for (const [name, expected] of Object.entries(hashes)) {
          const bytes = await readLegacyLocalMedia(directory, name);
          if (!bytes || sha256(bytes) !== expected) return false;
        }
        return Object.keys(hashes).length > 0;
      });
    } else {
      const journal = command.id ? await readJournal(db, command.id) : null;
      if (journal?.state === "applied") {
        result = summary(journal.plan, "already-applied", false);
      } else {
        requireCondition(!journal, "PLAN_ALREADY_ROLLED_BACK");
        const plan = await readCutoverPlan(db, base);
        if (command.mode === "dry-run") {
          const ready = await db.query("SELECT to_regclass('legacy_public_media_cutovers') IS NOT NULL AS ready");
          result = summary(plan, "dry-run", false, { journalReady: Boolean(ready.rows[0]?.ready),
            publicDeliveryVerified: false, verificationRequiredOnApply: true });
        } else {
          requireCondition(plan.id === command.id, "PLAN_CHANGED_RUN_DRY_RUN_AGAIN");
          r2 = getR2Client(config);
          result = await applyCutover(db, plan, async () => {
            const store = createLegacyPublicMediaStore({ query: (sql, params) => db.query(sql, params) });
            const sourceHashes = {};
            let cdnFailed = false;
            const proof = await verifyLegacyPublicInventory({
              readSnapshot: async () => ({ inventory: await readUploadInventory(directory), records: await readReferenceRows(db) }),
              authorize: store.authorizeLegacyPublicMedia,
              readLocal: async (name) => {
                const bytes = await readLegacyLocalMedia(directory, name);
                if (bytes) sourceHashes[name] = sha256(bytes);
                return bytes;
              },
              readRemote: async (name) => {
                const bytes = await readLegacyR2Media(name, { client: r2 });
                try {
                  const publicBytes = await readPublicDestination(base, name);
                  requireCondition(sha256(publicBytes) === sha256(bytes), "PUBLIC_CDN_BYTES_DIFFER");
                } catch (error) { cdnFailed = true; throw error; }
                return bytes;
              },
              onProgress: (progress) => process.stdout.write(JSON.stringify({ phase: "verify-source-r2-cdn", ...progress }) + "\n")
            });
            if (!proof.ok) throw new CutoverError(cdnFailed ? "PUBLIC_CDN_VERIFICATION_FAILED" : proof.errorCode);
            return { ...proof, sourceHashes, publicDeliveryVerified: true };
          });
        }
      }
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await db.end().catch(() => {});
    r2?.destroy();
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(JSON.stringify({ ok: false,
    errorCode: error instanceof CutoverError ? error.message : error.code === "42P01" ? "CUTOVER_SCHEMA_NOT_READY" : "CUTOVER_FAILED",
    databaseChanged: process.argv.length > 2 ? null : false,
    filesChanged: false, diskRemoved: false, diskRemovalReady: false }) + "\n");
  process.exitCode = 1;
});

module.exports = { readPublicDestination, parseMode };
