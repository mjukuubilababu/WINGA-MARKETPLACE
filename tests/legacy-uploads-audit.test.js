const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const {
  analyzeLegacyUploads,
  getUploadName,
  readReferenceRows,
  readUploadInventory
} = require("../backend/audit-legacy-uploads");

test("legacy upload names accept only flat local image paths", () => {
  assert.equal(getUploadName("/uploads/photo-1080.webp"), "photo-1080.webp");
  assert.equal(getUploadName("https://winga-pflp.onrender.com/uploads/photo.jpg"), "photo.jpg");
  assert.equal(getUploadName("data:image/png;base64,AAAA"), "");
  assert.equal(getUploadName("data:image/svg+xml,%3C/uploads/private.jpg"), "");
  assert.equal(getUploadName("/uploads/../private.jpg"), null);
  assert.equal(getUploadName("/uploads/nested/photo.jpg"), null);
});

test("audit counts public references, image variants and unclassified files without exposing names", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winga-upload-audit-"));
  try {
    for (const name of ["photo-320.webp", "photo-640.webp", "photo-1080.webp", "orphan.png"]) {
      fs.writeFileSync(path.join(directory, name), Buffer.from("image"));
    }
    const inventory = await readUploadInventory(directory);
    const result = analyzeLegacyUploads(inventory, {
      products: [{
        image: "/uploads/photo-1080.webp",
        images: ["/uploads/photo-1080.webp"],
        media_items: [{ url: "/uploads/photo-1080.webp" }]
      }],
      orders: [{ product_image: "/uploads/photo-1080.webp" }],
      users: [],
      sessions: [],
      embeddedReferenceRows: 1,
      embeddedMessageRows: 1,
      embeddedProductItemRows: 1,
      embeddedReferences: [
        { name: "photo-1080.webp" },
        { name: "orphan.png" },
        { name: "missing.jpg" }
      ]
    });
    assert.equal(result.disk.files, 4);
    assert.equal(result.disk.unclassifiedFiles, 1);
    assert.equal(result.disk.unclassifiedBytes, 5);
    assert.equal(result.references.products, 1);
    assert.equal(result.references.orders, 1);
    assert.equal(result.references.copyCandidates, 3);
    assert.equal(result.references.embeddedUniqueFiles, 3);
    assert.equal(result.references.embeddedCoveredByPublic, 1);
    assert.equal(result.references.embeddedUnclassified, 1);
    assert.equal(result.references.embeddedMissing, 1);
    assert.equal(result.publicCopyPreflightPassed, false);
    assert.equal(result.diskRemovalReady, false);
    assert.equal(JSON.stringify(result).includes("photo-1080"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("database audit queries run sequentially and return path tokens, not private message bodies", async () => {
  let active = false;
  const queries = [];
  const client = {
    async query(sql) {
      assert.equal(active, false);
      active = true;
      queries.push(sql);
      await Promise.resolve();
      active = false;
      if (sql.includes("AS message_rows")) {
        return { rows: [{ message_rows: "1", product_item_rows: "1", notification_rows: "0" }] };
      }
      if (sql.includes("SELECT upload_match")) {
        return { rows: [{ upload_match: ["photo.webp"] }] };
      }
      return { rows: [] };
    }
  };
  const records = await readReferenceRows(client);
  assert.equal(queries.length, 6);
  assert.equal(records.embeddedReferenceRows, 1);
  assert.equal(records.embeddedProductItemRows, 1);
  assert.deepEqual(records.embeddedReferences, [{ name: "photo.webp" }]);
  assert.equal(JSON.stringify(records).includes("private message"), false);
});

test("PostgreSQL audit extracts only legacy path tokens from messages and notifications", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE products (image TEXT, images JSONB, media_items JSONB);
      CREATE TABLE orders (product_image TEXT);
      CREATE TABLE users (profile_image TEXT, identity_document_image TEXT);
      CREATE TABLE sessions (profile_image TEXT);
      CREATE TABLE messages (message TEXT, product_items JSONB);
      CREATE TABLE notifications (body TEXT);
      INSERT INTO products VALUES ('/uploads/public.webp', '[]', '[]');
      INSERT INTO messages VALUES ('Private note with /uploads/private.jpg', '["/uploads/public.webp"]');
      INSERT INTO notifications VALUES ('See /uploads/public.webp');
    `);
    const records = await readReferenceRows(db);
    assert.equal(records.embeddedReferenceRows, 2);
    assert.equal(records.embeddedProductItemRows, 1);
    assert.equal(records.embeddedNotificationRows, 1);
    assert.deepEqual(
      new Set(records.embeddedReferences.map((entry) => entry.name)),
      new Set(["public.webp", "private.jpg"])
    );
    assert.equal(JSON.stringify(records).includes("Private note"), false);
  } finally {
    await db.close();
  }
});

test("private identity, embedded links and missing files block public copy preflight", () => {
  const result = analyzeLegacyUploads({
    files: new Map([["public.webp", 100]]),
    totalBytes: 100,
    unexpectedEntries: 0,
    emptyFiles: 0,
    unsupportedFiles: 0
  }, {
    products: [{ image: "/uploads/missing.webp", images: [], media_items: [] }],
    users: [{ profile_image: "", identity_document_image: "/uploads/private.jpg" }],
    embeddedReferenceRows: 1
  });
  assert.equal(result.references.privateIdentity, 1);
  assert.equal(result.references.missing, 2);
  assert.equal(result.references.embeddedReferenceRows, 1);
  assert.equal(result.publicCopyPreflightPassed, false);
});
