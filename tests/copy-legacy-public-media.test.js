const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readUploadInventory } = require("../backend/audit-legacy-uploads");
const { copyApprovedPublicMedia } = require("../backend/copy-legacy-public-media");

const PUBLIC_IMAGE = Buffer.from("public-image");
const PRIVATE_IMAGE = Buffer.from("private-image");

function fakeR2() {
  const objects = new Map();
  const writes = [];
  return {
    objects, writes,
    async send(command) {
      if (command.constructor.name === "GetObjectCommand") {
        const body = objects.get(command.input.Key);
        if (!body) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => body } };
      }
      if (command.constructor.name === "PutObjectCommand") {
        assert.equal(command.input.IfNoneMatch, "*");
        if (objects.has(command.input.Key)) {
          throw Object.assign(new Error("exists"), { $metadata: { httpStatusCode: 412 } });
        }
        writes.push(command.input);
        objects.set(command.input.Key, Buffer.from(command.input.Body));
        return {};
      }
      throw new Error("UNEXPECTED_COMMAND");
    }
  };
}

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winga-public-copy-"));
  try {
    fs.writeFileSync(path.join(directory, "public-320.webp"), PUBLIC_IMAGE);
    fs.writeFileSync(path.join(directory, "public-640.webp"), PUBLIC_IMAGE);
    fs.writeFileSync(path.join(directory, "private.webp"), PRIVATE_IMAGE);
    fs.writeFileSync(path.join(directory, "orphan.webp"), PRIVATE_IMAGE);
    const inventory = await readUploadInventory(directory);
    const records = {
      products: [
        { image: "/uploads/public-640.webp", status: "approved", visibility: "public" },
        { image: "/uploads/private.webp", status: "approved", visibility: "private" }
      ]
    };
    await run({ directory, inventory, records });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("dry-run plans approved public variants without touching R2 or disk", async () => {
  await fixture(async (args) => {
    const r2 = fakeR2();
    const result = await copyApprovedPublicMedia({ ...args, client: r2, bucket: "test" });
    assert.deepEqual(result, {
      ok: true, mode: "dry-run", planned: 2, uploaded: 0,
      alreadyVerified: 0, verifiedBytes: 0,
      diskRemoved: false, databaseChanged: false
    });
    assert.equal(r2.writes.length, 0);
    assert.equal(fs.existsSync(path.join(args.directory, "public-640.webp")), true);
  });
});

test("copy writes only public variants, verifies bytes, and is idempotent", async () => {
  await fixture(async (args) => {
    const r2 = fakeR2();
    const first = await copyApprovedPublicMedia({
      ...args, client: r2, bucket: "test", copy: true
    });
    assert.equal(first.planned, 2);
    assert.equal(first.uploaded, 2);
    assert.equal(first.verifiedBytes, PUBLIC_IMAGE.length * 2);
    assert.deepEqual([...r2.objects.keys()].sort(), [
      "products/legacy/public-320.webp",
      "products/legacy/public-640.webp"
    ]);
    assert.equal(r2.writes[0].ContentType, "image/webp");
    assert.match(r2.writes[0].Metadata.sha256, /^[a-f0-9]{64}$/);
    const second = await copyApprovedPublicMedia({
      ...args, client: r2, bucket: "test", copy: true
    });
    assert.equal(second.uploaded, 0);
    assert.equal(second.alreadyVerified, 2);
    assert.equal(r2.writes.length, 2);
  });
});

test("different existing R2 bytes fail closed without overwrite", async () => {
  await fixture(async (args) => {
    const r2 = fakeR2();
    r2.objects.set("products/legacy/public-320.webp", PRIVATE_IMAGE);
    await assert.rejects(
      copyApprovedPublicMedia({ ...args, client: r2, bucket: "test", copy: true }),
      /R2_OBJECT_MISMATCH/
    );
    assert.equal(r2.writes.length, 0);
  });
});

test("restricted overlap blocks every public upload", async () => {
  await fixture(async (args) => {
    args.records.products.push({
      image: "/uploads/public-640.webp", status: "pending", visibility: "public"
    });
    const r2 = fakeR2();
    await assert.rejects(
      copyApprovedPublicMedia({ ...args, client: r2, bucket: "test", copy: true }),
      /PUBLIC_SUBSET_PREFLIGHT_FAILED/
    );
    assert.equal(r2.writes.length, 0);
  });
});

test("R2 read failures are not mistaken for missing objects", async () => {
  await fixture(async (args) => {
    const client = {
      async send() { throw Object.assign(new Error("network down"), { name: "TimeoutError" }); }
    };
    await assert.rejects(
      copyApprovedPublicMedia({ ...args, client, bucket: "test", copy: true }),
      /network down/
    );
  });
});

test("changed source file blocks copy", async () => {
  await fixture(async (args) => {
    fs.appendFileSync(path.join(args.directory, "public-320.webp"), "changed");
    const r2 = fakeR2();
    await assert.rejects(
      copyApprovedPublicMedia({ ...args, client: r2, bucket: "test", copy: true }),
      /SOURCE_FILE_CHANGED/
    );
    assert.equal(r2.writes.length, 0);
  });
});
