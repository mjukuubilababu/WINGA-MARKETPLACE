const crypto = require("node:crypto");
const path = require("node:path");
const { S3Client } = require("@aws-sdk/client-s3");
const { readUploadInventory } = require("./audit-legacy-uploads");
const { readPostCutoverRows, analyzePostCutover } = require("./legacy-post-cutover-audit");
const { validName, readLegacyLocalMedia, readLegacyR2Media } = require("./legacy-public-media");
const { createLegacyUploadCompatibilityStore } = require("./legacy-upload-compatibility");
const { readR2Config, getR2Client } = require("./storage-r2");
const { readPrivateBackupConfig, verifyPrivateBackup, readStableFile } = require("./backup-legacy-private-media");

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const HASH = /^[a-f0-9]{64}$/;
class CoverageError extends Error {}
function check(condition, code) { if (!condition) throw new CoverageError(code); }

function publicHashesFromJournals(journals) {
  const hashes = new Map();
  for (const journal of journals) {
    if (journal.state !== "applied") continue;
    check(journal.source_hashes && typeof journal.source_hashes === "object"
      && !Array.isArray(journal.source_hashes), "PUBLIC_JOURNAL_INVALID");
    for (const [name, hash] of Object.entries(journal.source_hashes)) {
      check(validName(name) && HASH.test(hash), "PUBLIC_JOURNAL_INVALID");
      check(!hashes.has(name) || hashes.get(name) === hash, "PUBLIC_JOURNAL_CONFLICT");
      hashes.set(name, hash);
    }
  }
  check(hashes.size > 0 && hashes.size <= 10000, "PUBLIC_JOURNAL_EMPTY_OR_TOO_LARGE");
  return hashes;
}

const inventoryFingerprint = (inventory) => JSON.stringify(
  [...inventory.files].sort(([a], [b]) => a.localeCompare(b))
);
const rowsFingerprint = (rows) => JSON.stringify({
  journals: rows.journals.map(JSON.stringify).sort(),
  products: rows.products.map(JSON.stringify).sort(),
  snapshots: rows.snapshots.map(JSON.stringify).sort(),
  unparsedLegacyMessageRows: rows.unparsedLegacyMessageRows
});

async function verifyLegacyDiskCoverage({ inventory, postCutoverRows, privateEntries,
  privateBackupVerified, readLocal, readPublicRemote, authorizePublic,
  onProgress = () => {}, deadlineMs = 30 * 60 * 1000 }) {
  const result = { ok: false, mode: "verify-legacy-disk-coverage", privacy: "aggregate-only",
    planned: 0, verified: 0, verifiedBytes: 0, publicVerified: 0, privateVerified: 0,
    localHashesRechecked: false, publicRemoteHashesMatched: false, authorizationRechecked: false,
    privateBackupRechecked: false, coverageComplete: false, sourceDiskRequired: true,
    databaseChanged: false, filesChanged: false, remoteWrites: false,
    diskRemoved: false, diskRemovalReady: false, crossNodeFailoverProven: false };
  const startedAt = Date.now();
  const withinDeadline = () => check(Date.now() - startedAt < deadlineMs, "COVERAGE_DEADLINE_EXCEEDED");
  try {
    check(inventory?.files instanceof Map && !inventory.unexpectedEntries
      && !inventory.emptyFiles && !inventory.unsupportedFiles, "SOURCE_INVENTORY_INVALID");
    check(privateBackupVerified === true && Array.isArray(privateEntries), "PRIVATE_BACKUP_NOT_VERIFIED");
    check(typeof authorizePublic === "function", "PUBLIC_AUTHORIZATION_REQUIRED");
    const post = analyzePostCutover(inventory, postCutoverRows);
    const publicHashes = publicHashesFromJournals(postCutoverRows.journals);
    check(post.journals.applied > 0 && post.journals.productEntries > 0
      && post.journals.productEntries === post.journals.unchanged
      && post.retainedDisk.journalRecordedFiles === publicHashes.size
      && post.retainedDisk.journalRecordedFilesMissing === 0, "PUBLIC_CUTOVER_CHANGED");
    const privateHashes = new Map();
    for (const entry of privateEntries) {
      check(entry && validName(entry.name) && HASH.test(entry.sha256)
        && Number.isSafeInteger(entry.bytes) && entry.bytes > 0
        && !privateHashes.has(entry.name) && !publicHashes.has(entry.name), "PRIVATE_MANIFEST_INVALID");
      privateHashes.set(entry.name, entry);
    }
    check(privateHashes.size > 0 && publicHashes.size + privateHashes.size === inventory.files.size,
      "DISK_COVERAGE_INCOMPLETE");
    result.planned = inventory.files.size;
    const localHashes = new Map();
    const allowed = async (name, expectedHash) => {
      let proof;
      try { proof = await authorizePublic(name); }
      catch (_) { throw new CoverageError("PUBLIC_AUTHORIZATION_UNAVAILABLE"); }
      check(proof && proof.sha256 === expectedHash, "PUBLIC_AUTHORIZATION_FAILED");
    };
    for (const [name, expectedHash] of publicHashes) {
      withinDeadline();
      await allowed(name, expectedHash);
      const size = inventory.files.get(name);
      check(Number.isSafeInteger(size) && size > 0, "PUBLIC_SOURCE_MISSING");
      const local = await readLocal(name, size, false);
      check(Buffer.isBuffer(local) && local.length === size && sha256(local) === expectedHash,
        "PUBLIC_SOURCE_HASH_MISMATCH");
      const remote = await readPublicRemote(name);
      check(Buffer.isBuffer(remote) && remote.length === size && sha256(remote) === expectedHash,
        "PUBLIC_R2_HASH_MISMATCH");
      await allowed(name, expectedHash);
      localHashes.set(name, expectedHash);
      result.publicVerified += 1;
      result.verifiedBytes += size;
      result.verified += 1;
      if (result.verified % 25 === 0) onProgress({ verified: result.verified, planned: result.planned });
    }
    result.publicRemoteHashesMatched = true;
    for (const [name, entry] of privateHashes) {
      withinDeadline();
      check(inventory.files.get(name) === entry.bytes, "PRIVATE_SOURCE_MISSING_OR_CHANGED");
      const local = await readLocal(name, entry.bytes, true);
      check(Buffer.isBuffer(local) && local.length === entry.bytes && sha256(local) === entry.sha256,
        "PRIVATE_SOURCE_HASH_MISMATCH");
      localHashes.set(name, entry.sha256);
      result.privateVerified += 1;
      result.verifiedBytes += entry.bytes;
      result.verified += 1;
      if (result.verified % 25 === 0) onProgress({ verified: result.verified, planned: result.planned });
    }
    for (const [name, expectedHash] of localHashes) {
      withinDeadline();
      const local = await readLocal(name, inventory.files.get(name), privateHashes.has(name));
      check(Buffer.isBuffer(local) && sha256(local) === expectedHash, "SOURCE_CHANGED_DURING_VERIFICATION");
    }
    for (const [name, expectedHash] of publicHashes) {
      withinDeadline();
      await allowed(name, expectedHash);
    }
    result.authorizationRechecked = true;
    result.localHashesRechecked = true;
    result.privateBackupRechecked = true;
    result.coverageComplete = result.verified === result.planned;
    result.ok = result.coverageComplete;
  } catch (error) {
    result.errorCode = error instanceof CoverageError ? error.message : "COVERAGE_VERIFY_FAILED";
  }
  return result;
}

async function assertLiveRemoteOnly(fetchImpl = fetch, env = process.env) {
  check(env.OPS_HEALTH_TOKEN, "OPS_TOKEN_REQUIRED");
  let response;
  try {
    response = await fetchImpl(`http://127.0.0.1:${env.PORT || 3000}/api/ops/media/storage-policy`, {
      headers: { "X-Ops-Health-Token": env.OPS_HEALTH_TOKEN },
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.json();
    check(response.status === 200 && (response.headers.get("cache-control") || "").includes("no-store")
      && body.mode === "remote_only" && body.localMediaAccessAllowed === false
      && body.localArtifactWritesAllowed === false && body.legacyCompatibilityEnabled === true,
    "LIVE_REMOTE_ONLY_NOT_CONFIRMED");
  } catch (error) {
    if (error instanceof CoverageError) throw error;
    throw new CoverageError("LIVE_REMOTE_ONLY_NOT_CONFIRMED");
  }
}

async function main() {
  require("./load-env");
  const arg = process.argv[2] || "";
  check(process.argv.length === 3 && /^--backup-id=[a-f0-9]{64}$/.test(arg), "BACKUP_ID_REQUIRED");
  check(process.env.DATABASE_URL && process.env.WINGA_UPLOADS_DIR, "SOURCE_CONFIGURATION_REQUIRED");
  await assertLiveRemoteOnly();
  const publicConfig = readR2Config();
  const privateConfig = readPrivateBackupConfig();
  check(publicConfig, "PUBLIC_R2_CONFIGURATION_REQUIRED");
  const { Client } = require("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : false });
  const privateClient = new S3Client({ region: "auto",
    endpoint: `https://${privateConfig.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: privateConfig.accessKeyId, secretAccessKey: privateConfig.secretAccessKey },
    maxAttempts: 3 });
  const publicClient = getR2Client(publicConfig);
  try {
    await db.connect();
    await db.query("SET default_transaction_read_only = on");
    await db.query("SET statement_timeout = '20s'");
    const directory = path.resolve(process.env.WINGA_UPLOADS_DIR);
    const compatibility = createLegacyUploadCompatibilityStore({ query: (sql, params) => db.query(sql, params) });
    const inventory = await readUploadInventory(directory);
    const rows = await readPostCutoverRows(db);
    let privateEntries;
    const backup = await verifyPrivateBackup({ config: privateConfig, client: privateClient,
      backupId: arg.slice(12), onVerifiedManifest: (entries) => { privateEntries = entries; } });
    check(backup.verified === privateEntries?.length, "PRIVATE_BACKUP_NOT_VERIFIED");
    const result = await verifyLegacyDiskCoverage({ inventory, postCutoverRows: rows,
      privateEntries, privateBackupVerified: backup.ok && backup.manifestVerified,
      readLocal: (name, size, isPrivate) => isPrivate
        ? readStableFile(directory, name, size) : readLegacyLocalMedia(directory, name),
      readPublicRemote: (name) => readLegacyR2Media(name, { client: publicClient }),
      authorizePublic: compatibility.authorizeLegacyUploadCompatibility,
      onProgress: (progress) => process.stdout.write(JSON.stringify(progress) + "\n") });
    if (result.ok) {
      const finalInventory = await readUploadInventory(directory);
      const finalRows = await readPostCutoverRows(db);
      result.inventoryStable = inventoryFingerprint(inventory) === inventoryFingerprint(finalInventory);
      result.databaseSnapshotStable = rowsFingerprint(rows) === rowsFingerprint(finalRows);
      result.livePolicyStable = await assertLiveRemoteOnly().then(() => true);
      if (!result.inventoryStable || !result.databaseSnapshotStable) {
        result.ok = false;
        result.coverageComplete = false;
        result.errorCode = "SOURCE_CHANGED_DURING_VERIFICATION";
      }
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
    privateClient.destroy();
    publicClient.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ ok: false, mode: "verify-legacy-disk-coverage",
      errorCode: error instanceof CoverageError ? error.message : "COVERAGE_VERIFY_FAILED",
      databaseChanged: false, filesChanged: false, remoteWrites: false,
      diskRemoved: false, diskRemovalReady: false, crossNodeFailoverProven: false }) + "\n");
    process.exitCode = 1;
  });
}

module.exports = { publicHashesFromJournals, verifyLegacyDiskCoverage, assertLiveRemoteOnly };
