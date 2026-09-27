const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { spawnSync } = require("node:child_process");
const { readUploadInventory } = require("../backend/audit-legacy-uploads");
const {
  readPrivateBackupConfig, assertPrivateBucket, planPrivateBackup,
  backupPrivateMedia, verifyPrivateBackup, parseArgs
} = require("../backend/backup-legacy-private-media");

const env = {
  R2_ACCOUNT_ID: "a".repeat(32), R2_BUCKET_NAME: "public-media",
  R2_BACKUP_BUCKET_NAME: "private-backup", R2_BACKUP_ACCESS_KEY_ID: "backup-key",
  R2_BACKUP_SECRET_ACCESS_KEY: "backup-secret", R2_BACKUP_API_TOKEN: "metadata-token",
  R2_BACKUP_ISOLATION_CONFIRMED: "true"
};
const config = readPrivateBackupConfig(env);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const prefix = "legacy-private/v1/";

function privacyFetch(managed = { enabled: false }, custom = { domains: [] }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ success: true,
      result: url.endsWith("/managed") ? managed : custom }) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function fakeR2() {
  const objects = new Map();
  const writes = [];
  const reads = [];
  return {
    objects, writes, reads,
    async send(command) {
      assert.equal(command.input.Bucket, config.bucket);
      const key = command.input.Key;
      if (command.constructor.name === "GetObjectCommand") {
        reads.push(key);
        if (!objects.has(key)) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        const bytes = objects.get(key);
        return { ContentLength: bytes.length, Body: Readable.from([bytes]) };
      }
      assert.equal(command.constructor.name, "PutObjectCommand");
      assert.equal(command.input.IfNoneMatch, "*");
      assert.equal(command.input.CacheControl, "private, no-store");
      assert.equal(command.input.ContentType, "application/octet-stream");
      if (objects.has(key)) throw Object.assign(new Error("exists"), { $metadata: { httpStatusCode: 412 } });
      objects.set(key, Buffer.from(command.input.Body));
      writes.push(command.input);
      return {};
    }
  };
}

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winga-private-backup-"));
  try {
    for (const [name, bytes] of Object.entries({
      "public-320.webp": "public320", "public-640.webp": "public640",
      "private.webp": "private image bytes", "unknown.jpg": "unknown image bytes"
    })) fs.writeFileSync(path.join(directory, name), bytes);
    const inventory = await readUploadInventory(directory);
    const records = { products: [
      { image: "/uploads/public-640.webp", status: "approved", visibility: "public" },
      { image: "/uploads/private.webp", status: "approved", visibility: "private" }
    ] };
    await run({ directory, inventory, records, config, client: fakeR2(), fetchImpl: privacyFetch() });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test("private backup config never falls back to public credentials or bucket", () => {
  assert.deepEqual(config, { accountId: env.R2_ACCOUNT_ID, publicBucket: "public-media",
    bucket: "private-backup", accessKeyId: "backup-key", secretAccessKey: "backup-secret", apiToken: "metadata-token" });
  for (const key of Object.keys(env)) {
    const missing = { ...env, R2_ACCESS_KEY_ID: "public", R2_SECRET_ACCESS_KEY: "public" };
    delete missing[key];
    assert.throws(() => readPrivateBackupConfig(missing), /BACKUP_/);
  }
  for (const bucket of ["public-media", "../private", "UPPER", "x"]) {
    assert.throws(() => readPrivateBackupConfig({ ...env, R2_BACKUP_BUCKET_NAME: bucket }), /BACKUP_BUCKET_INVALID/);
  }
  assert.throws(() => readPrivateBackupConfig({ ...env, R2_ACCOUNT_ID: "https://other.example" }), /BACKUP_BUCKET_INVALID/);
});

test("CLI modes require an explicit write flag and a valid verification ID", () => {
  assert.deepEqual(parseArgs([]), { mode: "dry-run" });
  assert.equal(parseArgs(["--backup-private"]).mode, "backup-private");
  assert.equal(parseArgs(["--check-private"]).mode, "check-private");
  assert.equal(parseArgs(["--verify=" + "b".repeat(64)]).backupId, "b".repeat(64));
  for (const args of [["--copy-public"], ["--verify=../secret"], ["--backup-private", "--check-private"]]) {
    assert.throws(() => parseArgs(args), /BACKUP_ARGUMENTS_INVALID/);
  }
});

test("privacy preflight requires r2.dev disabled and zero custom domains", async () => {
  const fetchImpl = privacyFetch();
  assert.deepEqual(await assertPrivateBucket(config, fetchImpl), { managedPublicAccess: false, customDomains: 0 });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].options.redirect, "error");
  assert.equal(fetchImpl.calls[0].options.headers.Authorization, "Bearer metadata-token");
  for (const fetcher of [privacyFetch({ enabled: true }), privacyFetch({}),
    privacyFetch({ enabled: "false" }), privacyFetch({ enabled: false }, {}),
    privacyFetch({ enabled: false }, { domains: [{ enabled: false, domain: "old.example" }] })]) {
    await assert.rejects(assertPrivateBucket(config, fetcher), /BACKUP_BUCKET_NOT_PRIVATE/);
  }
});

test("privacy checks fail closed on denied, unavailable and malformed Cloudflare responses", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("secret-provider-error"); },
    async () => ({ ok: false, json: async () => ({ success: true, result: { enabled: false } }) }),
    async () => ({ ok: true, json: async () => ({ success: false }) }),
    async () => ({ ok: true, json: async () => { throw new Error("secret-json"); } })
  ]) await assert.rejects(assertPrivateBucket(config, fetchImpl), /^Error: BACKUP_PRIVACY_CHECK_FAILED$/);
});

test("dry-run selects restricted and unknown files, never calls storage or privacy APIs", async () => {
  await fixture(async (args) => {
    const result = await backupPrivateMedia(args);
    assert.deepEqual(planPrivateBackup(args.inventory, args.records), ["private.webp", "unknown.jpg"]);
    assert.equal(result.planned, 2);
    assert.equal(result.uploaded, 0);
    assert.equal(result.manifestVerified, false);
    assert.equal(args.client.writes.length, 0);
    assert.equal(args.fetchImpl.calls.length, 0);
    assert.equal(JSON.stringify(result).includes("private.webp"), false);
  });
});

test("copy verifies bytes and a durable manifest, retries safely, and verifies without source disk", async () => {
  await fixture(async (args) => {
    const first = await backupPrivateMedia({ ...args, copy: true });
    assert.equal(first.uploaded, 2);
    assert.equal(first.alreadyVerified, 0);
    assert.equal(first.manifestVerified, true);
    assert.equal(first.diskRemovalReady, false);
    assert.match(first.backupId, /^[a-f0-9]{64}$/);
    const manifest = JSON.parse(args.client.objects.get(prefix + "manifests/" + first.backupId + ".json"));
    assert.deepEqual(manifest.entries.map((entry) => entry.name), ["private.webp", "unknown.jpg"]);
    for (const entry of manifest.entries) {
      assert.equal(hash(fs.readFileSync(path.join(args.directory, entry.name))), entry.sha256);
      assert.ok(args.client.objects.get(entry.key).equals(fs.readFileSync(path.join(args.directory, entry.name))));
      assert.equal(entry.key.includes(entry.name), false);
    }
    const second = await backupPrivateMedia({ ...args, copy: true });
    assert.equal(second.backupId, first.backupId);
    assert.equal(second.uploaded, 0);
    assert.equal(second.alreadyVerified, 2);
    assert.equal(args.client.writes.length, 3);
    const verified = await verifyPrivateBackup({ config, client: args.client, backupId: first.backupId, fetchImpl: args.fetchImpl });
    assert.equal(verified.verified, 2);
    assert.equal(verified.verifiedBytes, first.verifiedBytes);
    assert.equal(verified.sourceDiskRequired, false);
    assert.equal(verified.filesRestored, false);
    assert.equal(verified.diskRemovalReady, false);
    for (const secret of ["private.webp", "unknown.jpg", "private image", "backup-secret", "metadata-token"]) {
      assert.equal(JSON.stringify([first, verified]).includes(secret), false);
    }
    assert.equal(fs.readdirSync(args.directory).length, 4);
  });
});

test("private guard fails before any write even if objects are missing", async () => {
  await fixture(async (args) => {
    await assert.rejects(backupPrivateMedia({ ...args, copy: true, fetchImpl: privacyFetch({ enabled: true }) }), /BACKUP_BUCKET_NOT_PRIVATE/);
    assert.equal(args.client.reads.length, 0);
    assert.equal(args.client.writes.length, 0);
  });
});

test("changed bucket privacy blocks completion and does not publish a manifest", async () => {
  await fixture(async (args) => {
    let calls = 0;
    const fetchImpl = async (...values) => (++calls <= 2 ? privacyFetch() : privacyFetch({ enabled: true }))(...values);
    await assert.rejects(backupPrivateMedia({ ...args, copy: true, fetchImpl }), /BACKUP_BUCKET_NOT_PRIVATE/);
    assert.equal(args.client.writes.some((entry) => entry.Key.includes("/manifests/")), false);
  });
});

test("source size change or directory replacement blocks copying", async () => {
  await fixture(async (args) => {
    fs.appendFileSync(path.join(args.directory, "private.webp"), "changed");
    await assert.rejects(backupPrivateMedia({ ...args, copy: true }), /BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED/);
    assert.equal(args.client.writes.length, 0);
    fs.unlinkSync(path.join(args.directory, "private.webp"));
    fs.mkdirSync(path.join(args.directory, "private.webp"));
    await assert.rejects(backupPrivateMedia({ ...args, copy: true }), /BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED/);
  });
});

test("planning blocks unsafe inventory, oversized files, invalid paths and public/restricted overlap", async () => {
  await fixture(async (args) => {
    for (const field of ["unexpectedEntries", "emptyFiles", "unsupportedFiles"]) {
      assert.throws(() => planPrivateBackup({ ...args.inventory, [field]: 1 }, args.records), /BACKUP_SOURCE_PREFLIGHT_FAILED/);
    }
    for (const [name, bytes] of [["../bad.jpg", 1], ["huge.jpg", 33 * 1024 * 1024]]) {
      const files = new Map(args.inventory.files); files.set(name, bytes);
      assert.throws(() => planPrivateBackup({ ...args.inventory, files }, args.records), /BACKUP_SOURCE_CHANGED_OR_UNSUPPORTED/);
    }
    args.records.products.push({ image: "/uploads/public-640.webp", status: "pending" });
    assert.throws(() => planPrivateBackup(args.inventory, args.records), /BACKUP_SOURCE_PREFLIGHT_FAILED/);
  });
});

test("R2 errors are not interpreted as missing and collisions never overwrite", async () => {
  await fixture(async (args) => {
    const denied = { send: async () => { throw new Error("access denied"); } };
    await assert.rejects(backupPrivateMedia({ ...args, copy: true, client: denied }), /access denied/);
    const bytes = fs.readFileSync(path.join(args.directory, "private.webp"));
    args.client.objects.set(prefix + "objects/" + hash(bytes) + ".bin", Buffer.alloc(bytes.length));
    await assert.rejects(backupPrivateMedia({ ...args, copy: true }), /BACKUP_OBJECT_MISMATCH/);
    assert.equal(args.client.writes.length, 0);
  });
});

test("concurrent conditional write is read back and verified instead of overwritten", async () => {
  await fixture(async (args) => {
    const send = args.client.send.bind(args.client);
    args.client.send = async (command) => {
      if (command.constructor.name === "PutObjectCommand") {
        args.client.objects.set(command.input.Key, Buffer.from(command.input.Body));
        throw Object.assign(new Error("race"), { $metadata: { httpStatusCode: 412 } });
      }
      return send(command);
    };
    const result = await backupPrivateMedia({ ...args, copy: true });
    assert.equal(result.uploaded, 0);
    assert.equal(result.alreadyVerified, 2);
    assert.equal(result.manifestVerified, true);
  });
});

test("verification detects missing or corrupt objects and mismatched manifests", async () => {
  await fixture(async (args) => {
    const backup = await backupPrivateMedia({ ...args, copy: true });
    const options = { config, client: args.client, backupId: backup.backupId, fetchImpl: args.fetchImpl };
    const key = [...args.client.objects.keys()].find((value) => value.includes("/objects/"));
    const bytes = args.client.objects.get(key);
    args.client.objects.delete(key);
    await assert.rejects(verifyPrivateBackup(options), /BACKUP_OBJECT_MISMATCH/);
    args.client.objects.set(key, Buffer.alloc(bytes.length));
    await assert.rejects(verifyPrivateBackup(options), /BACKUP_OBJECT_MISMATCH/);
    args.client.objects.set(key, bytes);
    args.client.objects.set(prefix + "manifests/" + backup.backupId + ".json", Buffer.from("{}"));
    await assert.rejects(verifyPrivateBackup(options), /BACKUP_MANIFEST_MISMATCH/);
  });
});

test("verification validates complete manifest before fetching any of its objects", async () => {
  await fixture(async (args) => {
    const backup = await backupPrivateMedia({ ...args, copy: true });
    const original = JSON.parse(args.client.objects.get(prefix + "manifests/" + backup.backupId + ".json"));
    for (const edit of [
      (m) => { m.entries[1].name = "../private.webp"; },
      (m) => { m.entries[1].name = m.entries[0].name; },
      (m) => { m.entries[1].key = "products/legacy/public.webp"; },
      (m) => { m.entries[1].bytes = 1e20; },
      (m) => { m.version = "future-unknown"; }
    ]) {
      const manifest = structuredClone(original); edit(manifest);
      const bytes = Buffer.from(JSON.stringify(manifest)); const backupId = hash(bytes);
      args.client.objects.set(prefix + "manifests/" + backupId + ".json", bytes);
      args.client.reads.length = 0;
      await assert.rejects(verifyPrivateBackup({ config, client: args.client, backupId, fetchImpl: args.fetchImpl }), /BACKUP_MANIFEST_INVALID/);
      assert.equal(args.client.reads.length, 1);
    }
  });
});

test("bounded remote reads reject oversized responses", async () => {
  await fixture(async (args) => {
    args.client.send = async () => ({ ContentLength: 1e9, Body: Readable.from([Buffer.from("x")]) });
    await assert.rejects(backupPrivateMedia({ ...args, copy: true }), /BACKUP_OBJECT_TOO_LARGE/);
  });
});

test("empty backup remains explicitly distinct from disk-removal readiness", async () => {
  const inventory = { files: new Map(), totalBytes: 0, unexpectedEntries: 0, emptyFiles: 0, unsupportedFiles: 0 };
  const result = await backupPrivateMedia({ inventory, records: {}, copy: true, config, client: fakeR2(), fetchImpl: privacyFetch() });
  assert.equal(result.planned, 0);
  assert.equal(result.verifiedBytes, 0);
  assert.equal(result.diskRemovalReady, false);
});

test("CLI rejects invalid arguments without exposing secret input or provider details", () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../backend/backup-legacy-private-media.js"), "--private-sensitive-value"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("private-sensitive-value"), false);
  const report = JSON.parse(result.stderr.trim());
  assert.equal(report.errorCode, "BACKUP_ARGUMENTS_INVALID");
  assert.equal(report.diskRemovalReady, false);
});
