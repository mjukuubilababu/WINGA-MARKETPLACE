const fs = require("node:fs");
const path = require("node:path");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function getUploadName(value) {
  if (typeof value === "string" && value.startsWith("data:")) return "";
  if (typeof value !== "string" || !value.includes("/uploads/")) return "";
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      pathname = new URL(value).pathname;
    } catch (_error) {
      return null;
    }
  }
  if (!pathname.startsWith("/uploads/")) return null;
  const name = pathname.slice("/uploads/".length);
  return SAFE_NAME.test(name) && !name.includes("..") ? name : null;
}

function addReferences(value, names, invalid) {
  if (Array.isArray(value)) {
    value.forEach((item) => addReferences(item, names, invalid));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => addReferences(item, names, invalid));
  } else {
    const name = getUploadName(value);
    if (name === null) invalid.count += 1;
    else if (name) names.add(name);
  }
}

async function readUploadInventory(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = new Map();
  let unexpectedEntries = 0;
  let emptyFiles = 0;
  let unsupportedFiles = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !SAFE_NAME.test(entry.name) || entry.name.includes("..")) {
      unexpectedEntries += 1;
      continue;
    }
    const size = (await fs.promises.stat(path.join(directory, entry.name))).size;
    files.set(entry.name, size);
    totalBytes += size;
    if (!size) emptyFiles += 1;
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) unsupportedFiles += 1;
  }
  return { files, totalBytes, unexpectedEntries, emptyFiles, unsupportedFiles };
}

function analyzeLegacyUploads(inventory, records) {
  const groups = {
    products: new Set(), orders: new Set(), profiles: new Set(),
    sessions: new Set(), privateIdentity: new Set()
  };
  const invalid = { count: 0 };
  for (const row of records.products || []) {
    addReferences([row.image, row.images, row.media_items], groups.products, invalid);
  }
  for (const row of records.orders || []) addReferences(row.product_image, groups.orders, invalid);
  for (const row of records.users || []) {
    addReferences(row.profile_image, groups.profiles, invalid);
    addReferences(row.identity_document_image, groups.privateIdentity, invalid);
  }
  for (const row of records.sessions || []) addReferences(row.profile_image, groups.sessions, invalid);

  const publicNames = new Set([...groups.products, ...groups.orders, ...groups.profiles, ...groups.sessions]);
  const allNames = new Set([...publicNames, ...groups.privateIdentity]);
  const copyCandidates = new Set(publicNames);
  for (const name of publicNames) {
    const match = name.match(/^(.*)-(?:320|640|1080)\.webp$/);
    if (!match) continue;
    for (const width of [320, 640, 1080]) {
      const variant = match[1] + "-" + width + ".webp";
      if (inventory.files.has(variant)) copyCandidates.add(variant);
    }
  }
  const missing = [...allNames].filter((name) => !inventory.files.has(name)).length;
  const unsupportedCandidates = [...copyCandidates].filter((name) =>
    !IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()) || inventory.files.get(name) === 0
  ).length;
  const unclassifiedFiles = [...inventory.files.keys()].filter((name) => !copyCandidates.has(name)).length;
  const embeddedReferenceRows = Number(records.embeddedReferenceRows || 0);
  return {
    ok: true,
    mode: "read-only",
    disk: {
      files: inventory.files.size,
      totalBytes: inventory.totalBytes,
      unexpectedEntries: inventory.unexpectedEntries,
      emptyFiles: inventory.emptyFiles,
      unsupportedFiles: inventory.unsupportedFiles,
      unclassifiedFiles
    },
    references: {
      products: groups.products.size,
      orders: groups.orders.size,
      profiles: groups.profiles.size,
      sessions: groups.sessions.size,
      privateIdentity: groups.privateIdentity.size,
      embeddedReferenceRows,
      invalid: invalid.count,
      missing,
      copyCandidates: copyCandidates.size,
      unsupportedCandidates
    },
    publicCopyPreflightPassed: groups.privateIdentity.size === 0
      && embeddedReferenceRows === 0 && invalid.count === 0 && missing === 0
      && unsupportedCandidates === 0 && inventory.unexpectedEntries === 0
      && unclassifiedFiles === 0,
    diskRemovalReady: false
  };
}

async function readReferenceRows(client) {
  const [products, orders, users, sessions, embedded] = await Promise.all([
    client.query("SELECT image, images, media_items FROM products WHERE image LIKE '%/uploads/%' OR images::text LIKE '%/uploads/%' OR media_items::text LIKE '%/uploads/%'"),
    client.query("SELECT product_image FROM orders WHERE product_image LIKE '%/uploads/%'"),
    client.query("SELECT profile_image, identity_document_image FROM users WHERE profile_image LIKE '%/uploads/%' OR identity_document_image LIKE '%/uploads/%'"),
    client.query("SELECT profile_image FROM sessions WHERE profile_image LIKE '%/uploads/%'"),
    client.query("SELECT (SELECT COUNT(*) FROM messages WHERE message LIKE '%/uploads/%' OR product_items::text LIKE '%/uploads/%') + (SELECT COUNT(*) FROM notifications WHERE body LIKE '%/uploads/%') AS count")
  ]);
  return {
    products: products.rows, orders: orders.rows, users: users.rows, sessions: sessions.rows,
    embeddedReferenceRows: Number(embedded.rows[0]?.count || 0)
  };
}

async function main() {
  require("./load-env");
  if (process.argv.length > 2 || !process.env.DATABASE_URL || !process.env.WINGA_UPLOADS_DIR) {
    throw new Error("DATABASE_URL and WINGA_UPLOADS_DIR are required on the Render API service.");
  }
  const { Client } = require("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true"
      ? { rejectUnauthorized: false } : false
  });
  try {
    await client.connect();
    await client.query("SET statement_timeout = '20s'");
    const [inventory, records] = await Promise.all([
      readUploadInventory(path.resolve(process.env.WINGA_UPLOADS_DIR)),
      readReferenceRows(client)
    ]);
    process.stdout.write(JSON.stringify(analyzeLegacyUploads(inventory, records), null, 2) + "\n");
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write("Legacy upload audit failed: " + (error.code || error.name || "ERROR") + "\n");
    process.exitCode = 1;
  });
}

module.exports = { analyzeLegacyUploads, getUploadName, readUploadInventory };
