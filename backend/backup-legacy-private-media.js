const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const {
  analyzeLegacyUploads, getApprovedPublicCopyNames, readReferenceRows, readUploadInventory
} = require("./audit-legacy-uploads");

const PREFIX = "legacy-private/v1/";
const VERSION = "2026-09-27.legacy-private-backup.v1";
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 10000;
const HASH = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(code) {
  const error = new Error(code);
  error.backupCode = code;
  throw error;
}

const checksum = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const objectKey = (hash) => PREFIX + "objects/" + hash + ".bin";
const manifestKey = (hash) => PREFIX + "manifests/" + hash + ".json";

function readPrivateBackupConfig(env = process.env) {
  const config = {
    accountId: String(env.R2_ACCOUNT_ID || "").trim(),
    publicBucket: String(env.R2_BUCKET_NAME || "").trim(),
    bucket: String(env.R2_BACKUP_BUCKET_NAME || "").trim(),
    accessKeyId: String(env.R2_BACKUP_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.R2_BACKUP_SECRET_ACCESS_KEY || "").trim(),
    apiToken: String(env.R2_BACKUP_API_TOKEN || "").trim()
  };
  if (Object.values(config).some((value) => !value)) fail("BACKUP_CONFIGURATION_REQUIRED");
  if (!/^[a-f0-9]{32}$/.test(config.accountId)
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)
    || config.bucket === config.publicBucket) fail("BACKUP_BUCKET_INVALID");
  if (env.R2_BACKUP_ISOLATION_CONFIRMED !== "true") fail("BACKUP_ISOLATION_CONFIRMATION_REQUIRED");
  return config;
}

async function assertPrivateBucket(config, fetchImpl = fetch) {
  if (!config?.bucket || !config.publicBucket || config.bucket === config.publicBucket) fail("BACKUP_BUCKET_INVALID");
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${encodeURIComponent(config.bucket)}/domains/`;
  const results = [];
  for (const type of ["managed", "custom"]) {
    let response;
    let body;
    try {
      response = await fetchImpl(base + type, {
        headers: { Authorization: "Bearer " + config.apiToken },
        redirect: "error", signal: AbortSignal.timeout(15000)
      });
      body = await response.json();
    } catch (_error) { fail("BACKUP_PRIVACY_CHECK_FAILED"); }
    if (!response.ok || body?.success !== true) fail("BACKUP_PRIVACY_CHECK_FAILED");
    results.push(body.result);
  }
  // Reject even disabled custom domains: this bucket must have no public attachment.
  if (results[0]?.enabled !== false || !Array.isArray(results[1]?.domains)
    || results[1].domains.length !== 0) fail("BACKUP_BUCKET_NOT_PRIVATE");
  return { managedPublicAccess: false, customDomains: 0 };
}

async function getBytes(client, bucket, key, limit) {
  let result;
  try {
    result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.name === "NotFound"
      || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
  if (!result.Body || !result.Body[Symbol.asyncIterator]) fail("BACKUP_OBJECT_BODY_INVALID");
  const chunks = [];
  let size = 0;
  try {
    if (result.ContentLength > limit) fail("BACKUP_OBJECT_TOO_LARGE");
    for await (const chunk of result.Body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) fail("BACKUP_OBJECT_TOO_LARGE");
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  } finally {
    result.Body.destroy?.();
  }
}

async function putVerified(client, bucket, key, bytes) {
  let remote = await getBytes(client, bucket, key, bytes.length);
  let uploaded = false;
  if (remote === null) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: bytes, ContentType: "application/octet-stream",
        CacheControl: "private, no-store", IfNoneMatch: "*",
        Metadata: { sha256: checksum(bytes) }
      }), { abortSignal: AbortSignal.timeout(30000) });
      uploaded = true;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 412) throw error;
    }
    remote = await getBytes(client, bucket, key, bytes.length);
  }
  if (!remote || !remote.equals(bytes)) fail("BACKUP_OBJECT_MISMATCH");
  return uploaded;
}

async function readStableFile(directory, name, size) {
  if (!SAFE_NAME.test(name) || name.includes("..")) fail("BACKUP_SOURCE_NAME_INVALID");
  const filename = path.join(directory, name);
  const before = await fs.promises.lstat(filename);
  if (!before.isFile() || before.size !== size || size <= 0 || size > MAX_FILE_BYTES) {
    fail("BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED");
  }
  const handle = await fs.promises.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev
      || opened.size !== size || opened.mtimeMs !== before.mtimeMs) fail("BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED");
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
      if (!bytesRead) fail("BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED");
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      fail("BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED");
    }
    return bytes;
  } finally { await handle.close(); }
}

function planPrivateBackup(inventory, records) {
  const audit = analyzeLegacyUploads(inventory, records);
  const publicNames = new Set(getApprovedPublicCopyNames(inventory, records));
  if (inventory.unexpectedEntries || inventory.emptyFiles || inventory.unsupportedFiles
    || audit.references.invalid || (publicNames.size && !audit.publicSubsetCopyReady)) {
    fail("BACKUP_SOURCE_PREFLIGHT_FAILED");
  }
  const names = [...inventory.files.keys()].filter((name) => !publicNames.has(name)).sort();
  if (names.length > MAX_FILES || names.some((name) => !SAFE_NAME.test(name) || name.includes("..")
    || inventory.files.get(name) <= 0 || inventory.files.get(name) > MAX_FILE_BYTES)) {
    fail("BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED");
  }
  return names;
}

function summary(mode) {
  return {
    ok: true, mode, privacy: "aggregate-only", diskRemoved: false,
    databaseChanged: false, diskRemovalReady: false
  };
}

async function backupPrivateMedia({
  directory, inventory, records, config, client, copy = false, fetchImpl, onProgress = () => {}
}) {
  const names = planPrivateBackup(inventory, records);
  const result = {
    ...summary(copy ? "backup-private" : "dry-run"), planned: names.length,
    plannedBytes: names.reduce((sum, name) => sum + inventory.files.get(name), 0),
    uploaded: 0, alreadyVerified: 0, verifiedBytes: 0, manifestVerified: false
  };
  if (!copy) return result;
  if (!config || !client) fail("BACKUP_CONFIGURATION_REQUIRED");
  await assertPrivateBucket(config, fetchImpl);
  const entries = [];
  for (const name of names) {
    const bytes = await readStableFile(directory, name, inventory.files.get(name));
    const sha256 = checksum(bytes);
    const key = objectKey(sha256);
    const uploaded = await putVerified(client, config.bucket, key, bytes);
    result[uploaded ? "uploaded" : "alreadyVerified"] += 1;
    result.verifiedBytes += bytes.length;
    entries.push({ name, bytes: bytes.length, sha256, key });
    if (entries.length % 25 === 0) onProgress({ verified: entries.length, planned: names.length });
  }
  await assertPrivateBucket(config, fetchImpl);
  const manifest = Buffer.from(JSON.stringify({ version: VERSION, entries }));
  if (manifest.length > MAX_MANIFEST_BYTES) fail("BACKUP_MANIFEST_INVALID");
  const backupId = checksum(manifest);
  await putVerified(client, config.bucket, manifestKey(backupId), manifest);
  await assertPrivateBucket(config, fetchImpl);
  return { ...result, manifestVerified: true, backupId };
}

async function verifyPrivateBackup({ config, client, backupId, fetchImpl }) {
  if (!HASH.test(backupId || "")) fail("BACKUP_ID_INVALID");
  await assertPrivateBucket(config, fetchImpl);
  const bytes = await getBytes(client, config.bucket, manifestKey(backupId), MAX_MANIFEST_BYTES);
  if (!bytes || checksum(bytes) !== backupId) fail("BACKUP_MANIFEST_MISMATCH");
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); } catch (_error) { fail("BACKUP_MANIFEST_INVALID"); }
  if (manifest?.version !== VERSION || !Array.isArray(manifest.entries)
    || manifest.entries.length > MAX_FILES) fail("BACKUP_MANIFEST_INVALID");
  const names = new Set();
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.name !== "string" || !SAFE_NAME.test(entry.name) || entry.name.includes("..")
      || names.has(entry.name) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0
      || entry.bytes > MAX_FILE_BYTES || !HASH.test(entry.sha256 || "")
      || entry.key !== objectKey(entry.sha256)) fail("BACKUP_MANIFEST_INVALID");
    names.add(entry.name);
  }
  let verifiedBytes = 0;
  for (const entry of manifest.entries) {
    const remote = await getBytes(client, config.bucket, entry.key, entry.bytes);
    if (!remote || remote.length !== entry.bytes || checksum(remote) !== entry.sha256) fail("BACKUP_OBJECT_MISMATCH");
    verifiedBytes += remote.length;
  }
  await assertPrivateBucket(config, fetchImpl);
  return {
    ...summary("verify-backup"), backupId, verified: manifest.entries.length, verifiedBytes,
    manifestVerified: true, sourceDiskRequired: false, filesRestored: false
  };
}

function parseArgs(args) {
  if (!args.length) return { mode: "dry-run" };
  if (args.length === 1 && args[0] === "--backup-private") return { mode: "backup-private" };
  if (args.length === 1 && args[0] === "--check-private") return { mode: "check-private" };
  if (args.length === 1 && /^--verify=[a-f0-9]{64}$/.test(args[0])) {
    return { mode: "verify-backup", backupId: args[0].slice(9) };
  }
  fail("BACKUP_ARGUMENTS_INVALID");
}

async function main() {
  require("./load-env");
  const args = parseArgs(process.argv.slice(2));
  const config = args.mode === "dry-run" ? null : readPrivateBackupConfig();
  let client;
  let db;
  try {
    let result;
    if (args.mode === "check-private") {
      result = { ...summary(args.mode), ...await assertPrivateBucket(config) };
    } else {
      if (config) client = new S3Client({
        region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 3
      });
      if (args.mode === "verify-backup") {
        result = await verifyPrivateBackup({ config, client, backupId: args.backupId });
      } else {
        if (!process.env.DATABASE_URL || !process.env.WINGA_UPLOADS_DIR) fail("BACKUP_SOURCE_CONFIGURATION_REQUIRED");
        const { Client } = require("pg");
        db = new Client({ connectionString: process.env.DATABASE_URL,
          ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : false });
        await db.connect();
        await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        await db.query("SET LOCAL statement_timeout = '20s'");
        const records = await readReferenceRows(db);
        await db.query("COMMIT");
        const directory = await fs.promises.realpath(process.env.WINGA_UPLOADS_DIR);
        const inventory = await readUploadInventory(directory);
        result = await backupPrivateMedia({ directory, inventory, records, config, client,
          copy: args.mode === "backup-private",
          onProgress: (value) => process.stdout.write(JSON.stringify(value) + "\n") });
      }
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await db?.end().catch(() => {});
    client?.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Provider and filesystem errors can contain credentials, paths or private object names.
    process.stderr.write(JSON.stringify({ ok: false, errorCode: error.backupCode || "PRIVATE_BACKUP_FAILED",
      diskRemoved: false, databaseChanged: false, diskRemovalReady: false }) + "\n");
    process.exitCode = 1;
  });
}

module.exports = { readPrivateBackupConfig, assertPrivateBucket, planPrivateBackup,
  backupPrivateMedia, verifyPrivateBackup, parseArgs };
