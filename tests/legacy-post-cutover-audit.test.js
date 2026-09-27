const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const migration = require("../backend/migrations/legacy-public-media-cutover");
const { readPostCutoverRows, analyzePostCutover } = require("../backend/legacy-post-cutover-audit");
const { sha256 } = require("../backend/legacy-public-media-cutover");
const name = "sample-1080.webp";
const oldImage = "/uploads/" + name;
const base = "https://media.example";
const image = base + "/products/legacy/" + name;
const fields = (url) => ({ image: url, images: [url], media_items: [{ type: "image", url }] });
const inventory = { files: new Map([[name, 123], ["unclassified.webp", 50]]) };
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY, uploaded_by TEXT, image TEXT, images JSONB, media_items JSONB, status TEXT);
    CREATE TABLE public_content_visibility(content_type TEXT, content_id TEXT, visibility TEXT);
    CREATE TABLE messages(message TEXT, product_items JSONB);`);
  for (const sql of migration.statements) await db.exec(sql);
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec(`TRUNCATE users, products, public_content_visibility, messages, legacy_public_media_cutovers;
    INSERT INTO users VALUES('seller','active');`);
  const plan = { base, changes: [{ id: "p1", owner: "seller", before: fields(oldImage), after: fields(image) }] };
  await db.query(`INSERT INTO legacy_public_media_cutovers(id,state,plan,source_hashes)
    VALUES($1,'applied',$2,$3)`, ["a".repeat(64), JSON.stringify(plan), JSON.stringify({ [name]: sha256(name) })]);
  await db.query("INSERT INTO products VALUES('p1','seller',$1,$2,$3,'approved')",
    [image, JSON.stringify([image]), JSON.stringify([{ type: "image", url: image }])]);
  await addSnapshot("p1", oldImage);
});
async function addSnapshot(id, url) {
  await db.query("INSERT INTO messages VALUES($1,$2)", ["PRIVATE TEXT MUST NEVER LEAVE DATABASE",
    JSON.stringify([{ productId: id, productImage: url, productName: "PRIVATE PRODUCT TITLE" }])]);
}
const report = async (disk = inventory) => analyzePostCutover(disk, await readPostCutoverRows(db));

test("journal retains public classification after product URLs moved; nothing is marked deletable", async () => {
  const result = await report();
  assert.equal(result.journals.unchanged, 1);
  assert.equal(result.retainedDisk.journalRecordedFilesOnDisk, 1);
  assert.equal(result.retainedDisk.journalRecordedBytesOnDisk, 123);
  assert.equal(result.retainedDisk.filesOutsideAppliedJournal, 1);
  assert.equal(result.chatSnapshots.recovery.exactJournalCandidate, 1);
  assert.equal(result.diskRemovalReady, false);
  assert.equal(result.remoteDeliveryRechecked, false);
  assert.equal(result.localHashesRechecked, false);
  assert.equal(result.privateBackupRechecked, false);
});

test("private text, titles, participant identity and paths are absent from aggregate output", async () => {
  const rows = await readPostCutoverRows(db);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE TEXT|PRIVATE PRODUCT TITLE/);
  assert.deepEqual(Object.keys(rows.snapshots[0]).sort(), ["product_id", "legacy_image", "product_exists", "current_image", "status", "owner_status", "visibility"].sort());
  assert.doesNotMatch(JSON.stringify(analyzePostCutover(inventory, rows)), /seller|sample-1080|media\.example|p1|PRIVATE/);
});

test("repeatable read-only audit does not write product or journal records", async () => {
  await db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const first = await report();
  assert.deepEqual(await report(), first);
  await assert.rejects(db.query("DELETE FROM products"), /read-only/);
  await db.exec("ROLLBACK");
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM products")).rows[0].n, 1);
});

test("missing files remain missing even when an exact historical replacement was journaled", async () => {
  const result = await report({ files: new Map() });
  assert.equal(result.retainedDisk.journalRecordedFilesMissing, 1);
  assert.equal(result.chatSnapshots.missingUniqueFiles, 1);
  assert.equal(result.chatSnapshots.recovery.exactJournalCandidate, 1);
  assert.equal(result.databaseChanged, false);
});

test("missing, private and suspended products never become exact replacement candidates", async () => {
  await db.exec("INSERT INTO public_content_visibility VALUES ('product','p1','private')");
  assert.equal((await report()).chatSnapshots.recovery.productRestricted, 1);
  await db.exec("DELETE FROM public_content_visibility; UPDATE users SET status='suspended'");
  assert.equal((await report()).journals.restricted, 1);
  await db.exec("DELETE FROM products");
  const result = await report();
  assert.equal(result.journals.missing, 1);
  assert.equal(result.chatSnapshots.recovery.productMissing, 1);
  assert.equal(result.chatSnapshots.recovery.exactJournalCandidate, 0);
});

test("a current different product image is only a manual review candidate, not recovered historical bytes", async () => {
  await db.query("UPDATE products SET image='https://media.example/new.webp'");
  const result = await report();
  assert.equal(result.journals.changed, 1);
  assert.equal(result.chatSnapshots.recovery.currentProductImageNeedsReview, 1);
  assert.equal(result.chatSnapshots.recovery.exactJournalCandidate, 0);
});

test("same filename on another product cannot borrow the original product's replacement evidence", async () => {
  await db.query("INSERT INTO products VALUES('p2','seller',$1,'[]','[]','approved')", [image]);
  await addSnapshot("p2", oldImage);
  const result = await report();
  assert.equal(result.chatSnapshots.recovery.exactJournalCandidate, 1);
  assert.equal(result.chatSnapshots.recovery.currentProductImageNeedsReview, 1);
});

test("unrecoverable and malformed paths are separate; duplicate snapshots count unique missing files once", async () => {
  await db.query("UPDATE products SET image=''");
  await addSnapshot("p1", "/uploads/absent.webp");
  await addSnapshot("p1", "/uploads/absent.webp");
  await addSnapshot("p1", "/uploads/../unsafe.webp");
  const result = await report();
  assert.equal(result.chatSnapshots.items, 4);
  assert.equal(result.chatSnapshots.missing, 2);
  assert.equal(result.chatSnapshots.missingUniqueFiles, 1);
  assert.equal(result.chatSnapshots.recovery.noVerifiedReplacement, 3);
  assert.equal(result.chatSnapshots.recovery.invalidLegacyReference, 1);
});

test("rolled back journals do not imply a live migration; missing schema fails instead of reporting empty", async () => {
  await db.exec("UPDATE legacy_public_media_cutovers SET state='rolled_back'");
  const result = await report();
  assert.equal(result.journals.applied, 0);
  assert.equal(result.journals.rolledBack, 1);
  assert.equal(result.retainedDisk.journalRecordedFiles, 0);
  assert.equal(result.chatSnapshots.recovery.exactJournalCandidate, 0);
  await assert.rejects(readPostCutoverRows({ query: async () => { throw new Error("missing schema"); } }), /missing schema/);
});

test("row limits and conflicting journal evidence fail closed", async () => {
  await assert.rejects(readPostCutoverRows({ query: async () => ({ rows: Array(101).fill({}) }) }), /JOURNAL_LIMIT/);
  const rows = await readPostCutoverRows(db);
  rows.journals.push({ ...rows.journals[0], source_hashes: { [name]: sha256("different") } });
  assert.throws(() => analyzePostCutover(inventory, rows), /HASH_CONFLICT/);
});

test("malformed historical JSON remains an explicit unresolved state rather than an empty result", async () => {
  await db.query("INSERT INTO messages VALUES('private',$1)", [JSON.stringify({ productImage: oldImage })]);
  const result = await report();
  assert.equal(result.chatSnapshots.items, 1);
  assert.equal(result.chatSnapshots.unparsedLegacyMessageRows, 1);
  assert.equal(result.journalEvidenceAvailable, true);
  await db.exec("DELETE FROM legacy_public_media_cutovers");
  assert.equal((await report()).journalEvidenceAvailable, false);
});
