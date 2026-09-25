const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  analyzeLegacyUploads,
  getUploadName,
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
      embeddedReferenceRows: 0
    });
    assert.equal(result.disk.files, 4);
    assert.equal(result.disk.unclassifiedFiles, 1);
    assert.equal(result.references.products, 1);
    assert.equal(result.references.orders, 1);
    assert.equal(result.references.copyCandidates, 3);
    assert.equal(result.publicCopyPreflightPassed, false);
    assert.equal(result.diskRemovalReady, false);
    assert.equal(JSON.stringify(result).includes("photo-1080"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
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
