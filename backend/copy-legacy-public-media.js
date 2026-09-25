const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const {
  analyzeLegacyUploads, getApprovedPublicCopyNames,
  readReferenceRows, readUploadInventory
} = require("./audit-legacy-uploads");
const { readR2Config } = require("./storage-r2");

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif"
};

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isMissingObject(error) {
  return error?.name === "NoSuchKey" || error?.name === "NotFound"
    || error?.$metadata?.httpStatusCode === 404;
}

async function readR2Bytes(client, bucket, key) {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("R2_OBJECT_WITHOUT_BODY");
    return Buffer.from(await result.Body.transformToByteArray());
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

async function copyApprovedPublicMedia({
  directory, inventory, records, client, bucket, copy = false, onProgress = () => {}
}) {
  const audit = analyzeLegacyUploads(inventory, records);
  if (!audit.publicSubsetCopyReady) throw new Error("PUBLIC_SUBSET_PREFLIGHT_FAILED");
  const names = getApprovedPublicCopyNames(inventory, records);
  if (names.length !== audit.references.approvedPublicCopyCandidates) {
    throw new Error("PUBLIC_SUBSET_COUNT_MISMATCH");
  }
  const summary = {
    ok: true, mode: copy ? "copy-public" : "dry-run",
    planned: names.length, uploaded: 0, alreadyVerified: 0, verifiedBytes: 0,
    diskRemoved: false, databaseChanged: false
  };
  if (!copy) return summary;
  if (!client || !bucket) throw new Error("R2_CONFIGURATION_REQUIRED");

  for (const name of names) {
    const filePath = path.join(directory, name);
    const stat = await fs.promises.lstat(filePath);
    if (!stat.isFile() || stat.size !== inventory.files.get(name) || stat.size === 0) {
      throw new Error("SOURCE_FILE_CHANGED");
    }
    const source = await fs.promises.readFile(filePath);
    if (source.length !== stat.size) throw new Error("SOURCE_FILE_CHANGED");
    const sourceHash = checksum(source);
    const key = "products/legacy/" + name;
    let remote = await readR2Bytes(client, bucket, key);
    if (remote === null) {
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: source,
          ContentType: CONTENT_TYPES[path.extname(name).toLowerCase()],
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: { sha256: sourceHash },
          IfNoneMatch: "*"
        }));
        summary.uploaded += 1;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode !== 412) throw error;
        summary.alreadyVerified += 1;
      }
      remote = await readR2Bytes(client, bucket, key);
    } else {
      summary.alreadyVerified += 1;
    }
    if (!remote || remote.length !== source.length || checksum(remote) !== sourceHash) {
      throw new Error("R2_OBJECT_MISMATCH");
    }
    summary.verifiedBytes += source.length;
    if ((summary.uploaded + summary.alreadyVerified) % 25 === 0) {
      onProgress({
        verified: summary.uploaded + summary.alreadyVerified,
        planned: names.length
      });
    }
  }
  return summary;
}

async function main() {
  require("./load-env");
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--copy-public")) {
    throw new Error("USAGE: npm run copy:legacy-public-media -- [--copy-public]");
  }
  if (!process.env.DATABASE_URL || !process.env.WINGA_UPLOADS_DIR) {
    throw new Error("DATABASE_URL and WINGA_UPLOADS_DIR are required on the Render API service.");
  }
  const copy = args[0] === "--copy-public";
  const config = copy ? readR2Config() : null;
  if (copy && !config) throw new Error("R2_CONFIGURATION_REQUIRED");
  const client = copy ? new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  }) : null;
  const { Client } = require("pg");
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true"
      ? { rejectUnauthorized: false } : false
  });
  try {
    await db.connect();
    await db.query("SET statement_timeout = '20s'");
    const directory = path.resolve(process.env.WINGA_UPLOADS_DIR);
    const [inventory, records] = await Promise.all([
      readUploadInventory(directory), readReferenceRows(db)
    ]);
    const result = await copyApprovedPublicMedia({
      directory, inventory, records, client, bucket: config?.bucketName, copy,
      onProgress: (progress) => process.stdout.write(JSON.stringify(progress) + "\n")
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await db.end().catch(() => {});
    client?.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write("Public media copy failed: " + (error.code || error.message || "ERROR") + "\n");
    process.exitCode = 1;
  });
}

module.exports = { copyApprovedPublicMedia };
