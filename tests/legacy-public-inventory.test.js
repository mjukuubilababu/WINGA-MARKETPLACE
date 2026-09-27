const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { verifyLegacyPublicInventory } = require("../backend/verify-legacy-public-inventory");
const { readLegacyLocalMedia, readLegacyR2Media } = require("../backend/legacy-public-media");

const bytes = Buffer.from("public media fixture");
function snapshot(names = ["photo-320.webp", "photo-640.webp", "photo-1080.webp"]) {
  return { inventory: { files: new Map(names.map((name) => [name, bytes.length])),
    totalBytes: names.length * bytes.length, unexpectedEntries: 0, emptyFiles: 0, unsupportedFiles: 0 },
  records: { products: [{ image: "/uploads/" + names[0], images: [], media_items: [], status: "approved", visibility: "public" }],
    users: [], orders: [], sessions: [], embeddedReferences: [] } };
}
function dependencies(state = snapshot()) {
  return { readSnapshot: async () => structuredClone(state), authorize: async () => true,
    readLocal: async () => bytes, readRemote: async () => bytes };
}

test("full verification includes stored variants, rechecks every file and never claims cutover", async () => {
  const permissions = [];
  const remote = [];
  const result = await verifyLegacyPublicInventory({ ...dependencies(),
    authorize: async (name) => { permissions.push(name); return true; },
    readRemote: async (name) => { remote.push(name); return bytes; } });
  assert.equal(result.ok, true);
  assert.equal(result.planned, 3);
  assert.equal(result.verified, 3);
  assert.equal(result.verifiedBytes, bytes.length * 3);
  assert.equal(result.fullPublicInventoryVerified, true);
  assert.equal(result.inventoryStable, true);
  assert.equal(result.authorizationRechecked, true);
  assert.equal(permissions.length, 9);
  assert.equal(new Set(remote).size, 3);
  for (const field of ["diskRemoved", "databaseChanged", "filesChanged", "remoteWrites", "httpDeliveryVerified", "servingPathSwitched", "diskRemovalReady"]) {
    assert.equal(result[field], false);
  }
  assert.equal(result.sourceDiskRequired, true);
  assert.equal(JSON.stringify(result).includes("photo"), false);
});

test("empty, missing, invalid and restricted-overlap inventories fail before reading storage", async () => {
  const states = [snapshot(), snapshot(), snapshot(), snapshot()];
  states[0].records.products = [];
  states[1].inventory.files.delete("photo-320.webp");
  states[2].records.products[0].image = "/uploads/../private.webp";
  states[3].records.products.push({ ...states[3].records.products[0], visibility: "private" });
  for (const state of states) {
    let reads = 0;
    const result = await verifyLegacyPublicInventory({ ...dependencies(state), readRemote: async () => { reads++; return bytes; } });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "PUBLIC_SUBSET_PREFLIGHT_FAILED");
    assert.equal(reads, 0);
  }
});

test("unclassified and restricted unrelated files are never read or reported", async () => {
  const state = snapshot();
  for (const name of ["private.jpg", "orphan.jpg"]) state.inventory.files.set(name, bytes.length);
  state.records.users.push({ identity_document_image: "/uploads/private.jpg" });
  state.records.products.push({ image: "/uploads/private.jpg", status: "approved", visibility: "private" });
  const reads = [];
  const result = await verifyLegacyPublicInventory({ ...dependencies(state),
    readRemote: async (name) => { reads.push(name); return bytes; } });
  assert.equal(result.ok, true);
  assert.equal(reads.length, 3);
  assert.equal(reads.includes("private.jpg"), false);
  assert.equal(reads.includes("orphan.jpg"), false);
});

test("denied permission and database failure fail closed without reading storage", async () => {
  for (const authorize of [async () => false, async () => { throw new Error("secret database URL"); }]) {
    let reads = 0;
    const result = await verifyLegacyPublicInventory({ ...dependencies(), authorize,
      readRemote: async () => { reads++; return bytes; } });
    assert.equal(result.ok, false);
    assert.equal(result.verified, 0);
    assert.equal(reads, 0);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("R2 missing, corrupt or unavailable never succeeds through disk fallback", async () => {
  for (const readRemote of [async () => { throw new Error("secret/object/key"); }, async () => null,
    async () => Buffer.from("wrong bytes")]) {
    const result = await verifyLegacyPublicInventory({ ...dependencies(), readRemote });
    assert.equal(result.ok, false);
    assert.equal(result.verified, 0);
    assert.equal(result.fullPublicInventoryVerified, false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("source missing or changed size fails before R2 reads", async () => {
  for (const readLocal of [async () => null, async () => Buffer.from("short"), async () => { throw new Error("private path"); }]) {
    let reads = 0;
    const result = await verifyLegacyPublicInventory({ ...dependencies(), readLocal,
      readRemote: async () => { reads++; return bytes; } });
    assert.equal(result.ok, false);
    assert.equal(reads, 0);
    assert.equal(JSON.stringify(result).includes("private path"), false);
  }
});

test("same-sized source mutation after its initial comparison invalidates the whole proof", async () => {
  let reads = 0;
  const result = await verifyLegacyPublicInventory({ ...dependencies(),
    readLocal: async () => ++reads <= 3 ? bytes : Buffer.alloc(bytes.length, 1) });
  assert.equal(result.verified, 3);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "SOURCE_MEDIA_CHANGED");
  assert.equal(result.fullPublicInventoryVerified, false);
});

test("visibility changes during remote read or final recheck invalidate the result", async () => {
  for (const deniedAt of [2, 7]) {
    let calls = 0;
    const result = await verifyLegacyPublicInventory({ ...dependencies(), authorize: async () => ++calls !== deniedAt });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "PUBLIC_MEDIA_NOT_AUTHORIZED");
    assert.equal(result.authorizationRechecked, false);
  }
});

test("new public reference or changed inventory during verification requires a fresh run", async () => {
  const initial = snapshot();
  const final = snapshot();
  final.inventory.files.set("new.jpg", bytes.length);
  final.records.products.push({ image: "/uploads/new.jpg", status: "approved", visibility: "public" });
  let reads = 0;
  const result = await verifyLegacyPublicInventory({ ...dependencies(), readSnapshot: async () => ++reads === 1 ? initial : final });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PUBLIC_INVENTORY_CHANGED");
  assert.equal(result.inventoryStable, false);
});

test("snapshot failure is sanitized and does not convert partial verification into success", async () => {
  let reads = 0;
  const result = await verifyLegacyPublicInventory({ ...dependencies(), readSnapshot: async () => {
    if (++reads === 2) throw new Error("postgres://secret/password");
    return snapshot();
  } });
  assert.equal(result.verified, 3);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PUBLIC_INVENTORY_VERIFY_FAILED");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("progress reports only aggregates and logging failure cannot alter the result", async () => {
  const names = Array.from({ length: 27 }, (_, i) => `image-${i}.jpg`);
  const state = snapshot(names);
  state.records.products[0].images = names.map((name) => "/uploads/" + name);
  const progress = [];
  const result = await verifyLegacyPublicInventory({ ...dependencies(state), onProgress: (value) => {
    progress.push(value);
    throw new Error("broken output sink");
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(progress, [{ verified: 25, planned: 27 }]);
});

test("real bounded local and checksummed R2 readers verify every selected object with GET only", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winga-public-inventory-"));
  const names = ["photo-320.webp", "photo-640.webp", "photo-1080.webp"];
  const requests = [];
  try {
    for (const name of names) fs.writeFileSync(path.join(directory, name), bytes);
    const client = { send: async (command) => {
      requests.push(command);
      return { Body: Readable.from([bytes]), ContentLength: bytes.length,
        Metadata: { sha256: crypto.createHash("sha256").update(bytes).digest("hex") } };
    } };
    const result = await verifyLegacyPublicInventory({ ...dependencies(),
      readLocal: (name) => readLegacyLocalMedia(directory, name),
      readRemote: (name) => readLegacyR2Media(name, { client, env: {
        R2_ACCOUNT_ID: "test", R2_BUCKET_NAME: "public-images", R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret", R2_PUBLIC_URL_BASE: "https://media.example"
      } }) });
    assert.equal(result.ok, true);
    assert.equal(requests.length, 3);
    assert.ok(requests.every((r) => r.constructor.name === "GetObjectCommand"
      && r.input.Bucket === "public-images" && r.input.Key.startsWith("products/legacy/")));
  } finally {
    for (const name of names) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
});
