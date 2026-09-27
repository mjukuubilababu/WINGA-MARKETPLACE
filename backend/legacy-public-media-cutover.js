const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { referenceName, createLegacyPublicMediaStore } = require("./legacy-public-media");

class CutoverError extends Error {}
function requireCondition(value, code) { if (!value) throw new CutoverError(code); }
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function publicBase(value) {
  let url;
  try { url = new URL(value); } catch (_error) { throw new CutoverError("PUBLIC_URL_INVALID"); }
  requireCondition(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "PUBLIC_URL_INVALID");
  return url.href.replace(/\/+$/, "");
}

async function readCutoverRows(db) {
  return (await db.query(`SELECT p.id, p.uploaded_by, p.image, p.images, p.media_items,
    p.row_version::text, p.status, u.status AS owner_status,
    COALESCE(v.visibility, 'public') AS visibility FROM products p
    LEFT JOIN users u ON u.username = p.uploaded_by
    LEFT JOIN public_content_visibility v ON v.content_type = 'product' AND v.content_id = p.id
    WHERE p.image LIKE '%/uploads/%' OR p.images::text LIKE '%/uploads/%'
      OR p.media_items::text LIKE '%/uploads/%' ORDER BY p.id`)).rows;
}

function mediaFields(row) {
  return { image: row.image, images: row.images, media_items: row.media_items };
}

function buildCutoverPlan(rows, base, generation = "0") {
  base = publicBase(base);
  requireCondition(/^\d+$/.test(generation), "PLAN_GENERATION_INVALID");
  const names = new Set();
  const changes = [];
  for (const row of rows) {
    if (row.status !== "approved" || row.visibility !== "public") continue;
    requireCondition(row.owner_status === "active", "PUBLIC_OWNER_NOT_ACTIVE");
    requireCondition(Array.isArray(row.images) && Array.isArray(row.media_items)
      && /^\d+$/.test(String(row.row_version)), "PRODUCT_MEDIA_SHAPE_INVALID");
    const replace = (value) => {
      const name = referenceName(value);
      if (!name) return value;
      names.add(name);
      return `${base}/products/legacy/${name}`;
    };
    const before = mediaFields(row);
    const after = { image: replace(row.image), images: row.images.map(replace),
      media_items: row.media_items.map((item) => {
        if (item?.type !== "image") return item;
        const next = { ...item };
        for (const key of ["url", "posterUrl", "thumbnailUrl"]) {
          if (Object.hasOwn(item, key)) next[key] = replace(item[key]);
        }
        return next;
      }) };
    if (!isDeepStrictEqual(before, after)) changes.push({ id: row.id, owner: row.uploaded_by, before, after });
  }
  changes.sort((a, b) => a.id.localeCompare(b.id));
  requireCondition(changes.length <= 200 && names.size <= 1000, "CUTOVER_SCOPE_TOO_LARGE");
  const payload = { version: 1, generation, base, names: [...names].sort(), changes };
  return { ...payload, id: sha256(JSON.stringify(payload)) };
}

async function readCutoverPlan(db, base) {
  const generation = (await db.query("SELECT COUNT(*)::text AS generation FROM legacy_public_media_cutovers")).rows[0].generation;
  return buildCutoverPlan(await readCutoverRows(db), base, generation);
}

function summary(plan, mode, changed, extra = {}) {
  return { ok: true, mode, planId: plan.id, products: plan.changes.length,
    references: plan.names.length, databaseChanged: changed,
    filesChanged: false, diskRemoved: false, diskRemovalReady: false,
    scope: "approved-public-product-records", ...extra };
}

async function readJournal(db, id) {
  requireCondition(/^[a-f0-9]{64}$/.test(id), "PLAN_ID_INVALID");
  return (await db.query("SELECT * FROM legacy_public_media_cutovers WHERE id = $1", [id])).rows[0] || null;
}

async function transaction(db, work) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL lock_timeout = '2s'");
    await db.query("SET LOCAL statement_timeout = '10s'");
    // Close visibility-row insertion and shared-reference races during this bounded operator action.
    await db.query("LOCK TABLE users, products, public_content_visibility, legacy_public_media_cutovers IN SHARE ROW EXCLUSIVE MODE");
    const result = await work();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function applyCutover(db, plan, verify) {
  requireCondition(plan.changes.length > 0, "NO_PUBLIC_LEGACY_REFERENCES");
  const old = await readJournal(db, plan.id);
  if (old?.state === "applied") return summary(old.plan, "already-applied", false);
  requireCondition(!old, "PLAN_ALREADY_ROLLED_BACK");
  const proof = await verify();
  requireCondition(proof?.ok && proof.fullPublicInventoryVerified && proof.publicDeliveryVerified, "CUTOVER_VERIFICATION_FAILED");
  requireCondition(plan.names.every((name) => /^[a-f0-9]{64}$/.test(proof.sourceHashes?.[name] || "")), "CUTOVER_SOURCE_PROOF_MISSING");
  return transaction(db, async () => {
    const duplicate = await readJournal(db, plan.id);
    if (duplicate?.state === "applied") return summary(duplicate.plan, "already-applied", false);
    requireCondition(!duplicate, "PLAN_ALREADY_ROLLED_BACK");
    const current = await readCutoverPlan(db, plan.base);
    requireCondition(isDeepStrictEqual(current, plan), "PLAN_CHANGED_RUN_DRY_RUN_AGAIN");
    const store = createLegacyPublicMediaStore({ query: (sql, params) => db.query(sql, params) });
    const startedAt = Date.now();
    for (const name of plan.names) {
      requireCondition(Date.now() - startedAt < 10000, "CUTOVER_TRANSACTION_DEADLINE");
      requireCondition(await store.authorizeLegacyPublicMedia(name), "PUBLIC_MEDIA_NOT_AUTHORIZED");
    }
    for (const change of plan.changes) {
      requireCondition(Date.now() - startedAt < 10000, "CUTOVER_TRANSACTION_DEADLINE");
      const result = await db.query(`UPDATE products SET image = $2, images = $3::jsonb,
        media_items = $4::jsonb, row_version = row_version + 1, updated_at = NOW()
        WHERE id = $1 AND image IS NOT DISTINCT FROM $5 AND images = $6::jsonb
          AND media_items = $7::jsonb AND uploaded_by = $8`, [change.id, change.after.image,
      JSON.stringify(change.after.images), JSON.stringify(change.after.media_items), change.before.image,
      JSON.stringify(change.before.images), JSON.stringify(change.before.media_items), change.owner]);
      requireCondition(result.rowCount === 1, "PRODUCT_CHANGED");
    }
    requireCondition(Date.now() - startedAt < 10000, "CUTOVER_TRANSACTION_DEADLINE");
    await db.query(`INSERT INTO legacy_public_media_cutovers(id, state, plan, source_hashes)
      VALUES ($1, 'applied', $2::jsonb, $3::jsonb)`, [plan.id, JSON.stringify(plan), JSON.stringify(proof.sourceHashes)]);
    return summary(plan, "applied", true, { publicDeliveryVerified: true });
  });
}

async function rollbackCutover(db, id, verifySources) {
  const journal = await readJournal(db, id);
  requireCondition(journal, "CUTOVER_NOT_FOUND");
  if (journal.state === "rolled_back") return summary(journal.plan, "already-rolled-back", false);
  requireCondition(await verifySources(journal.source_hashes), "ROLLBACK_SOURCE_UNAVAILABLE_OR_CHANGED");
  return transaction(db, async () => {
    const current = await readJournal(db, id);
    if (current.state === "rolled_back") return summary(current.plan, "already-rolled-back", false);
    const startedAt = Date.now();
    for (const change of current.plan.changes) {
      requireCondition(Date.now() - startedAt < 10000, "CUTOVER_TRANSACTION_DEADLINE");
      const row = (await db.query(`SELECT p.image, p.images, p.media_items, p.uploaded_by, p.status,
        u.status AS owner_status, COALESCE(v.visibility, 'public') AS visibility FROM products p
        LEFT JOIN users u ON u.username = p.uploaded_by
        LEFT JOIN public_content_visibility v ON v.content_type = 'product' AND v.content_id = p.id
        WHERE p.id = $1`, [change.id])).rows[0];
      requireCondition(row && row.uploaded_by === change.owner && row.status === 'approved'
        && row.owner_status === 'active' && row.visibility === 'public'
        && isDeepStrictEqual(mediaFields(row), change.after), "ROLLBACK_CONFLICT");
      await db.query(`UPDATE products SET image = $2, images = $3::jsonb, media_items = $4::jsonb,
        row_version = row_version + 1, updated_at = NOW() WHERE id = $1`, [change.id, change.before.image,
      JSON.stringify(change.before.images), JSON.stringify(change.before.media_items)]);
    }
    await db.query("UPDATE legacy_public_media_cutovers SET state = 'rolled_back', rolled_back_at = NOW() WHERE id = $1", [id]);
    return summary(current.plan, "rolled-back", true);
  });
}

module.exports = { CutoverError, requireCondition, sha256, publicBase, readCutoverRows, readCutoverPlan,
  buildCutoverPlan, summary, readJournal, applyCutover, rollbackCutover };
