const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const REQUIRED_R2_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL_BASE"
];

let cachedClient = null;
let cachedClientIdentity = "";

function readR2Config(env = process.env) {
  const accountId = String(env.R2_ACCOUNT_ID || "").trim();
  if (!accountId) return null;
  const missing = REQUIRED_R2_ENV_KEYS.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    throw new Error(`R2 storage is enabled but missing configuration: ${missing.join(", ")}`);
  }
  return {
    accountId,
    accessKeyId: String(env.R2_ACCESS_KEY_ID).trim(),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY).trim(),
    bucketName: String(env.R2_BUCKET_NAME).trim(),
    publicUrlBase: String(env.R2_PUBLIC_URL_BASE).trim().replace(/\/+$/, "")
  };
}

function isR2StorageEnabled(env = process.env) {
  return Boolean(String(env.R2_ACCOUNT_ID || "").trim());
}

function getR2Client(config) {
  const identity = `${config.accountId}:${config.accessKeyId}`;
  if (cachedClient && cachedClientIdentity === identity) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  cachedClientIdentity = identity;
  return cachedClient;
}

function encodeObjectKey(key) {
  return String(key || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

async function uploadImageToR2(buffer, key, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new TypeError("R2 image upload requires a non-empty Buffer.");
  }
  const normalizedKey = String(key || "").replace(/^\/+/, "");
  if (!normalizedKey || normalizedKey.includes("..")) {
    throw new TypeError("R2 image upload requires a safe object key.");
  }
  const config = readR2Config(options.env || process.env);
  if (!config) throw new Error("R2 image storage is not enabled.");
  const client = options.client || getR2Client(config);
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: normalizedKey,
    Body: buffer,
    ContentType: String(options.contentType || "application/octet-stream"),
    CacheControl: "public, max-age=31536000, immutable"
  }));
  return `${config.publicUrlBase}/${encodeObjectKey(normalizedKey)}`;
}

module.exports = { isR2StorageEnabled, readR2Config, uploadImageToR2 };
