const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const migration = require("../backend/migrations/legacy-public-media-cutover");
const { sha256, publicBase, readCutoverPlan, readJournal,
  applyCutover, rollbackCutover } = require("../backend/legacy-public-media-cutover");
const { readPublicDestination, parseMode } = require("../backend/cutover-legacy-public-media");
const base = "https://media.example";
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY, status TEXT, identity_document_image TEXT DEFAULT '');
    CREATE TABLE products(id TEXT PRIMARY KEY, uploaded_by TEXT, image TEXT, images JSONB,
      media_items JSONB, status TEXT, price INT DEFAULT 100, row_version BIGINT DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE public_content_visibility(content_type TEXT, content_id TEXT, visibility TEXT);`);
  for (const sql of migration.statements) await db.exec(sql);
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec(`TRUNCATE products, users, public_content_visibility, legacy_public_media_cutovers;
    INSERT INTO users(username,status) VALUES ('seller','active');`);
  for (const id of ["p1", "p2"]) {
    const image = `/uploads/${id}-1080.webp`;
    await db.query(`INSERT INTO products(id,uploaded_by,image,images,media_items,status)
      VALUES($1,'seller',$2,$3::jsonb,$4::jsonb,'approved')`, [id, image, JSON.stringify([image]),
    JSON.stringify([{ type: "image", url: image, thumbnailUrl: image, width: 1080, label: image },
      { type: "video", url: "https://video.example/a", providerId: "video", posterUrl: image }])]);
  }
});
const plan = async () => readCutoverPlan(db, base);
const proof = (value) => ({ ok: true, fullPublicInventoryVerified: true, publicDeliveryVerified: true,
  sourceHashes: Object.fromEntries(value.names.map((name) => [name, sha256(name)])) });

test("plan changes only known image fields and is deterministic without database writes", async () => {
  const first = await plan();
  assert.deepEqual(first, await plan());
  assert.equal(first.changes.length, 2);
  assert.equal(first.changes[0].after.image, `${base}/products/legacy/p1-1080.webp`);
  assert.equal(first.changes[0].after.media_items[0].label, "/uploads/p1-1080.webp");
  assert.equal(first.changes[0].after.media_items[1].posterUrl, "/uploads/p1-1080.webp");
  assert.equal((await db.query("SELECT image FROM products WHERE id='p1'")).rows[0].image, "/uploads/p1-1080.webp");
});

test("apply is atomic and idempotent; rollback restores media without rolling back row versions", async () => {
  const value = await plan();
  const result = await applyCutover(db, value, async () => proof(value));
  assert.equal(result.databaseChanged, true);
  const row = (await db.query("SELECT * FROM products WHERE id='p1'")).rows[0];
  assert.equal(row.price, 100);
  assert.equal(String(row.row_version), "2");
  assert.equal(row.image, `${base}/products/legacy/p1-1080.webp`);
  const again = await applyCutover(db, value, async () => { throw new Error("must not verify twice"); });
  assert.equal(again.mode, "already-applied");
  assert.equal(again.databaseChanged, false);
  const rollback = await rollbackCutover(db, value.id, async (hashes) => {
    assert.equal(hashes["p1-1080.webp"], sha256("p1-1080.webp"));
    return true;
  });
  assert.equal(rollback.mode, "rolled-back");
  const restored = (await db.query("SELECT * FROM products WHERE id='p1'")).rows[0];
  assert.equal(restored.image, "/uploads/p1-1080.webp");
  assert.equal(String(restored.row_version), "3");
  assert.equal((await rollbackCutover(db, value.id, async () => { throw new Error("not needed"); })).mode, "already-rolled-back");
  await assert.rejects(applyCutover(db, value, async () => proof(value)), /PLAN_ALREADY_ROLLED_BACK/);
  assert.notEqual((await plan()).id, value.id);
  const retry = await plan();
  assert.equal((await applyCutover(db, retry, async () => proof(retry))).mode, "applied");
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM legacy_public_media_cutovers")).rows[0].count, 2);
});

test("pending and private products are not included; inactive public owner fails closed", async () => {
  await db.query("UPDATE products SET status='pending' WHERE id='p2'");
  assert.equal((await plan()).changes.length, 1);
  await db.exec("INSERT INTO public_content_visibility VALUES ('product','p1','private')");
  assert.equal((await plan()).changes.length, 0);
  await db.exec("DELETE FROM public_content_visibility; UPDATE users SET status='suspended'");
  await assert.rejects(plan(), /PUBLIC_OWNER_NOT_ACTIVE/);
});

test("missing byte/CDN proof stops before any write", async () => {
  const value = await plan();
  for (const invalid of [{ ok: false }, { ...proof(value), publicDeliveryVerified: false }, { ...proof(value), sourceHashes: {} }]) {
    await assert.rejects(applyCutover(db, value, async () => invalid), /CUTOVER_/);
    assert.equal(await readJournal(db, value.id), null);
    assert.equal((await plan()).id, value.id);
  }
});

test("a media edit during verification invalidates the approved plan", async () => {
  const value = await plan();
  await assert.rejects(applyCutover(db, value, async () => {
    await db.query("UPDATE products SET image='/uploads/changed.webp',row_version=row_version+1 WHERE id='p1'");
    return proof(value);
  }), /PLAN_CHANGED/);
  const row = (await db.query("SELECT * FROM products WHERE id='p1'")).rows[0];
  assert.equal(row.image, "/uploads/changed.webp");
  assert.equal(await readJournal(db, value.id), null);
});

test("restricted and identity overlaps introduced after verification are rejected under locks", async () => {
  const value = await plan();
  await assert.rejects(applyCutover(db, value, async () => {
    await db.query("UPDATE users SET identity_document_image='/uploads/p1-320.webp'");
    return proof(value);
  }), /PUBLIC_MEDIA_NOT_AUTHORIZED/);
  assert.equal(await readJournal(db, value.id), null);
  await db.query("UPDATE users SET identity_document_image=''");
  await assert.rejects(applyCutover(db, value, async () => {
    await db.exec(`INSERT INTO products(id,uploaded_by,image,images,media_items,status)
      VALUES('private','seller','/uploads/p1-1080.webp','[]','[]','pending')`);
    return proof(value);
  }), /PUBLIC_MEDIA_NOT_AUTHORIZED/);
});

test("a later SQL failure rolls back earlier media updates and leaves no journal", async () => {
  const value = await plan();
  let updates = 0;
  const failing = { query: async (sql, params) => {
    if (sql.startsWith("UPDATE products") && ++updates === 2) throw new Error("simulated failure");
    return db.query(sql, params);
  } };
  await assert.rejects(applyCutover(failing, value, async () => proof(value)), /simulated failure/);
  assert.equal((await plan()).id, value.id);
  assert.equal(await readJournal(db, value.id), null);
});

test("lost commit acknowledgement is recovered idempotently from the durable journal", async () => {
  const value = await plan();
  const uncertain = { query: async (sql, params) => {
    const result = await db.query(sql, params);
    if (sql === "COMMIT") throw new Error("lost acknowledgement");
    return result;
  } };
  await assert.rejects(applyCutover(uncertain, value, async () => proof(value)), /lost acknowledgement/);
  assert.equal((await applyCutover(db, value, async () => { throw new Error("no duplicate"); })).mode, "already-applied");
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM legacy_public_media_cutovers")).rows[0].count, 1);
});

test("rollback rejects unavailable source or intervening product edits without partial restoration", async () => {
  const value = await plan();
  await applyCutover(db, value, async () => proof(value));
  await assert.rejects(rollbackCutover(db, value.id, async () => false), /ROLLBACK_SOURCE/);
  await db.query("UPDATE products SET image='https://media.example/edited.webp',row_version=row_version+1 WHERE id='p2'");
  await assert.rejects(rollbackCutover(db, value.id, async () => true), /ROLLBACK_CONFLICT/);
  assert.equal((await db.query("SELECT image FROM products WHERE id='p1'")).rows[0].image, value.changes[0].after.image);
  assert.equal((await readJournal(db, value.id)).state, "applied");
});

test("tampered plan cannot change the trusted destination while reusing the approved ID", async () => {
  const value = await plan();
  value.changes[0].after.image = "https://untrusted.example/image.webp";
  await assert.rejects(applyCutover(db, value, async () => proof(value)), /PLAN_CHANGED/);
  assert.equal(await readJournal(db, value.id), null);
});

test("rollback cannot restore legacy URLs after visibility or owner status becomes restricted", async () => {
  const value = await plan();
  await applyCutover(db, value, async () => proof(value));
  await db.exec("INSERT INTO public_content_visibility VALUES ('product','p1','private')");
  await assert.rejects(rollbackCutover(db, value.id, async () => true), /ROLLBACK_CONFLICT/);
  await db.exec("DELETE FROM public_content_visibility; UPDATE users SET status='suspended'");
  await assert.rejects(rollbackCutover(db, value.id, async () => true), /ROLLBACK_CONFLICT/);
  assert.equal((await readJournal(db, value.id)).state, "applied");
});

test("unrelated price and metrics row-version changes survive both apply and rollback", async () => {
  const value = await plan();
  await applyCutover(db, value, async () => {
    await db.query("UPDATE products SET price=250,row_version=row_version+1 WHERE id='p1'");
    return proof(value);
  });
  await db.query("UPDATE products SET price=350,row_version=row_version+1 WHERE id='p1'");
  await rollbackCutover(db, value.id, async () => true);
  const row = (await db.query("SELECT * FROM products WHERE id='p1'")).rows[0];
  assert.equal(row.price, 350);
  assert.equal(row.image, "/uploads/p1-1080.webp");
  assert.equal(String(row.row_version), "5");
});

test("CLI defaults to dry-run and requires a precise plan ID for writes", () => {
  assert.deepEqual(parseMode([]), { mode: "dry-run" });
  assert.equal(parseMode(["--apply=" + "a".repeat(64)]).mode, "apply");
  assert.equal(parseMode(["--rollback=" + "a".repeat(64)]).mode, "rollback");
  for (const args of [["--apply"], ["--copy-public"], ["--apply=oops"], ["--apply=" + "a".repeat(64), "extra"]]) {
    assert.throws(() => parseMode(args), /EXPLICIT/);
  }
  for (const url of ["http://media.example", "https://secret:token@media.example", "https://media.example?q=x"]) {
    assert.throws(() => publicBase(url), /PUBLIC_URL_INVALID/);
  }
});

test("destination verification is bounded, GET-only and refuses redirects/non-images/errors", async () => {
  const bytes = Buffer.from("image fixture");
  let options;
  const result = await readPublicDestination(base, "p1-1080.webp", async (url, init) => {
    assert.equal(url, base + "/products/legacy/p1-1080.webp");
    options = init;
    return new Response(bytes, { headers: { "content-type": "image/webp" } });
  });
  assert.deepEqual(result, bytes);
  assert.equal(options.redirect, "error");
  assert.equal(options.body, undefined);
  for (const response of [new Response("no", { status: 404 }), new Response("html", { headers: { "content-type": "text/html" } }),
    new Response(bytes, { headers: { "content-type": "image/webp", "content-length": "999999999" } })]) {
    await assert.rejects(readPublicDestination(base, "p1-1080.webp", async () => response), /PUBLIC_CDN_/);
  }
});
