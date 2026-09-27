const crypto = require("node:crypto");
const path = require("node:path");
const { analyzeLegacyUploads, getApprovedPublicCopyNames, readReferenceRows,
  readUploadInventory } = require("./audit-legacy-uploads");
const { validName, createLegacyPublicMediaStore, readLegacyLocalMedia,
  readLegacyR2Media } = require("./legacy-public-media");
const { readR2Config, getR2Client } = require("./storage-r2");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
class VerificationError extends Error {}
function check(condition, code) { if (!condition) throw new VerificationError(code); }

function selectSnapshot({ inventory, records }) {
  const audit = analyzeLegacyUploads(inventory, records);
  check(audit.publicSubsetCopyReady, "PUBLIC_SUBSET_PREFLIGHT_FAILED");
  const names = getApprovedPublicCopyNames(inventory, records);
  check(names.length > 0 && names.length === audit.references.approvedPublicCopyCandidates,
    "PUBLIC_SUBSET_COUNT_MISMATCH");
  check(names.length <= 10000, "PUBLIC_INVENTORY_TOO_LARGE");
  check(names.every(validName), "PUBLIC_MEDIA_NAME_INVALID");
  return { names, inventory, fingerprint: hash(JSON.stringify(names.map((name) => [name, inventory.files.get(name)]))) };
}

async function verifyLegacyPublicInventory({ readSnapshot, authorize, readLocal, readRemote,
  onProgress = () => {} }) {
  const startedAt = Date.now();
  const result = { ok: false, mode: "verify-public-inventory", privacy: "aggregate-only",
    schemaVersion: "2026-09-27.legacy-public-inventory.v1", planned: 0, verified: 0,
    verifiedBytes: 0, inventoryStable: false, authorizationRechecked: false,
    fullPublicInventoryVerified: false, sourceDiskRequired: true, httpDeliveryVerified: false,
    databaseChanged: false, filesChanged: false, remoteWrites: false, diskRemoved: false,
    servingPathSwitched: false, diskRemovalReady: false };
  const withinDeadline = () => check(Date.now() - startedAt < 30 * 60 * 1000, "VERIFICATION_DEADLINE_EXCEEDED");
  const allowed = async (name) => {
    withinDeadline();
    let permission;
    try { permission = await authorize(name); }
    catch (_error) { throw new VerificationError("AUTHORIZATION_UNAVAILABLE"); }
    check(permission === true, "PUBLIC_MEDIA_NOT_AUTHORIZED");
  };
  const sourceBytes = async (name, expectedSize) => {
    let bytes;
    try { bytes = await readLocal(name); }
    catch (_error) { throw new VerificationError("SOURCE_MEDIA_UNAVAILABLE"); }
    check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8 * 1024 * 1024
      && bytes.length === expectedSize, "SOURCE_MEDIA_UNAVAILABLE_OR_CHANGED");
    return bytes;
  };
  try {
    const initial = selectSnapshot(await readSnapshot());
    result.planned = initial.names.length;
    const verifiedHashes = new Map();
    for (const name of initial.names) {
      await allowed(name);
      const source = await sourceBytes(name, initial.inventory.files.get(name));
      let remote;
      try { remote = await readRemote(name); }
      catch (_error) { throw new VerificationError("R2_MEDIA_UNAVAILABLE_OR_INVALID"); }
      // No disk fallback: both independent reads must succeed and match.
      check(Buffer.isBuffer(remote) && remote.length === source.length
        && hash(remote) === hash(source), "R2_SOURCE_BYTES_DIFFER");
      await allowed(name);
      verifiedHashes.set(name, hash(source));
      result.verified += 1;
      result.verifiedBytes += source.length;
      if (result.verified % 25 === 0) {
        try { onProgress({ verified: result.verified, planned: result.planned }); }
        catch (_error) { /* Progress output cannot change verification. */ }
      }
    }
    // Detect source changes after an earlier object passed; do not lock live commerce rows.
    for (const name of initial.names) {
      await allowed(name);
      const bytes = await sourceBytes(name, initial.inventory.files.get(name));
      check(hash(bytes) === verifiedHashes.get(name), "SOURCE_MEDIA_CHANGED");
    }
    const final = selectSnapshot(await readSnapshot());
    check(initial.fingerprint === final.fingerprint, "PUBLIC_INVENTORY_CHANGED");
    withinDeadline();
    result.inventoryStable = true;
    result.authorizationRechecked = true;
    result.fullPublicInventoryVerified = true;
    result.ok = true;
  } catch (error) {
    result.errorCode = error instanceof VerificationError ? error.message : "PUBLIC_INVENTORY_VERIFY_FAILED";
  }
  return result;
}

async function main() {
  require("./load-env");
  check(process.argv.length === 2, "UNEXPECTED_ARGUMENTS");
  check(process.env.DATABASE_URL && process.env.WINGA_UPLOADS_DIR, "DATABASE_AND_UPLOADS_CONFIGURATION_REQUIRED");
  const config = readR2Config();
  check(config, "R2_CONFIGURATION_REQUIRED");
  const { Client } = require("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true"
      ? { rejectUnauthorized: false } : false });
  const client = getR2Client(config);
  const directory = path.resolve(process.env.WINGA_UPLOADS_DIR);
  try {
    await db.connect();
    await db.query("SET default_transaction_read_only = on");
    await db.query("SET statement_timeout = '20s'");
    const store = createLegacyPublicMediaStore({ query: (sql, params) => db.query(sql, params) });
    const result = await verifyLegacyPublicInventory({
      readSnapshot: async () => ({ inventory: await readUploadInventory(directory), records: await readReferenceRows(db) }),
      authorize: store.authorizeLegacyPublicMedia,
      readLocal: (name) => readLegacyLocalMedia(directory, name),
      readRemote: (name) => readLegacyR2Media(name, { client }),
      onProgress: (progress) => process.stdout.write(JSON.stringify(progress) + "\n")
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
    client.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ ok: false, mode: "verify-public-inventory",
      errorCode: error instanceof VerificationError ? error.message : "PUBLIC_INVENTORY_VERIFY_FAILED",
      fullPublicInventoryVerified: false, databaseChanged: false, filesChanged: false,
      remoteWrites: false, diskRemoved: false, diskRemovalReady: false }) + "\n");
    process.exitCode = 1;
  });
}

module.exports = { verifyLegacyPublicInventory };
