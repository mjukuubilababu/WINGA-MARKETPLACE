const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyLegacyDiskCoverage, assertLiveRemoteOnly } = require("../backend/verify-legacy-disk-coverage");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const publicName = "public-640.webp";
const privateName = "private.jpg";
const oldImage = "/uploads/" + publicName;
const image = "https://media.example/products/legacy/" + publicName;
const fields = (url) => ({ image: url, images: [url], media_items: [{ type: "image", url }] });

function fixture() {
  const publicBytes = Buffer.from("public image bytes");
  const privateBytes = Buffer.from("private image bytes");
  const disk = new Map([[publicName, publicBytes], [privateName, privateBytes]]);
  const publicHash = hash(publicBytes);
  return {
    disk,
    input: {
      inventory: { files: new Map([...disk].map(([name, bytes]) => [name, bytes.length])),
        unexpectedEntries: 0, emptyFiles: 0, unsupportedFiles: 0 },
      postCutoverRows: {
        journals: [{ state: "applied", plan: { base: "https://media.example", changes: [
          { id: "p1", owner: "seller", before: fields(oldImage), after: fields(image) }
        ] }, source_hashes: { [publicName]: publicHash } }],
        products: [{ id: "p1", uploaded_by: "seller", ...fields(image), status: "approved",
          owner_status: "active", visibility: "public" }],
        snapshots: [], unparsedLegacyMessageRows: 0
      },
      privateEntries: [{ name: privateName, bytes: privateBytes.length, sha256: hash(privateBytes) }],
      privateBackupVerified: true,
      readLocal: async (name) => disk.get(name),
      readPublicRemote: async () => publicBytes,
      authorizePublic: async () => ({ sha256: publicHash })
    }
  };
}

test("complete journal and verified private manifest cover every retained file without claiming disk removal", async () => {
  const { input } = fixture();
  const result = await verifyLegacyDiskCoverage(input);
  assert.equal(result.ok, true);
  assert.equal(result.verified, 2);
  assert.equal(result.publicVerified, 1);
  assert.equal(result.privateVerified, 1);
  assert.equal(result.localHashesRechecked, true);
  assert.equal(result.publicRemoteHashesMatched, true);
  assert.equal(result.authorizationRechecked, true);
  assert.equal(result.privateBackupRechecked, true);
  assert.equal(result.diskRemovalReady, false);
  assert.equal(result.crossNodeFailoverProven, false);
  assert.doesNotMatch(JSON.stringify(result), /public-640|private\.jpg|seller|media\.example/);
});

test("missing or overlapping manifest entries and unverified backup fail closed", async () => {
  const { input } = fixture();
  assert.equal((await verifyLegacyDiskCoverage({ ...input, privateBackupVerified: false })).errorCode,
    "PRIVATE_BACKUP_NOT_VERIFIED");
  assert.equal((await verifyLegacyDiskCoverage({ ...input, privateEntries: [] })).errorCode,
    "DISK_COVERAGE_INCOMPLETE");
  assert.equal((await verifyLegacyDiskCoverage({ ...input, privateEntries: [
    { ...input.privateEntries[0], name: publicName }
  ] })).errorCode, "PRIVATE_MANIFEST_INVALID");
});

test("changed public product, local bytes, or remote R2 bytes cannot pass", async () => {
  const { input, disk } = fixture();
  const altered = structuredClone(input.postCutoverRows);
  altered.products[0].image = "https://media.example/changed.webp";
  assert.equal((await verifyLegacyDiskCoverage({ ...input, postCutoverRows: altered })).errorCode,
    "PUBLIC_CUTOVER_CHANGED");
  disk.set(publicName, Buffer.from("altered image bytes"));
  assert.equal((await verifyLegacyDiskCoverage(input)).errorCode, "PUBLIC_SOURCE_HASH_MISMATCH");
  disk.set(publicName, Buffer.from("public image bytes"));
  assert.equal((await verifyLegacyDiskCoverage({ ...input,
    readPublicRemote: async () => Buffer.from("different") })).errorCode, "PUBLIC_R2_HASH_MISMATCH");
});

test("revoked or unavailable live authorization cannot be hidden by matching R2 bytes", async () => {
  const { input } = fixture();
  assert.equal((await verifyLegacyDiskCoverage({ ...input,
    authorizePublic: async () => false })).errorCode, "PUBLIC_AUTHORIZATION_FAILED");
  assert.equal((await verifyLegacyDiskCoverage({ ...input,
    authorizePublic: async () => { throw new Error("private database detail"); } })).errorCode,
  "PUBLIC_AUTHORIZATION_UNAVAILABLE");
  let checks = 0;
  const lateRevocation = await verifyLegacyDiskCoverage({ ...input,
    authorizePublic: async () => ++checks < 3 ? { sha256: hash(Buffer.from("public image bytes")) }
      : false });
  assert.equal(lateRevocation.ok, false);
  assert.equal(lateRevocation.errorCode, "PUBLIC_AUTHORIZATION_FAILED");
  assert.equal(checks, 3);
});

test("private source mismatch and same-size mutation during second read fail closed", async () => {
  const { input, disk } = fixture();
  disk.set(privateName, Buffer.from("altered image bytes"));
  assert.equal((await verifyLegacyDiskCoverage(input)).errorCode, "PRIVATE_SOURCE_HASH_MISMATCH");
  const fresh = fixture();
  let reads = 0;
  const result = await verifyLegacyDiskCoverage({ ...fresh.input,
    readLocal: async (name) => {
      reads += 1;
      if (name === publicName && reads > 2) return Buffer.from("changed image bytes");
      return fresh.disk.get(name);
    }
  });
  assert.equal(result.errorCode, "SOURCE_CHANGED_DURING_VERIFICATION");
});

test("live policy check requires authenticated no-store remote-only response", async () => {
  const env = { OPS_HEALTH_TOKEN: "test-token", PORT: "1234" };
  const fetchImpl = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:1234/api/ops/media/storage-policy");
    assert.equal(options.headers["X-Ops-Health-Token"], "test-token");
    return new Response(JSON.stringify({ mode: "remote_only", localMediaAccessAllowed: false,
      localArtifactWritesAllowed: false, legacyCompatibilityEnabled: true }), {
      status: 200, headers: { "Cache-Control": "no-store" }
    });
  };
  await assert.doesNotReject(assertLiveRemoteOnly(fetchImpl, env));
  await assert.rejects(assertLiveRemoteOnly(fetchImpl, {}), /OPS_TOKEN_REQUIRED/);
  await assert.rejects(assertLiveRemoteOnly(async () => new Response(JSON.stringify({ mode: "hybrid" }), {
    status: 200, headers: { "Cache-Control": "no-store" }
  }), env), /LIVE_REMOTE_ONLY_NOT_CONFIRMED/);
});
