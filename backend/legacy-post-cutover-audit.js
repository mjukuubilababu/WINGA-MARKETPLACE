const { isDeepStrictEqual } = require("node:util");
const { referenceName, validName } = require("./legacy-public-media");
const { publicBase, requireCondition } = require("./legacy-public-media-cutover");

// Only structured product references are read; message bodies and participants stay in PostgreSQL.
async function readPostCutoverRows(db) {
  const journals = (await db.query("SELECT state, plan, source_hashes FROM legacy_public_media_cutovers ORDER BY created_at, id LIMIT 101")).rows;
  requireCondition(journals.length <= 100, "POST_CUTOVER_JOURNAL_LIMIT");
  const ids = new Set();
  for (const journal of journals) {
    requireCondition(Array.isArray(journal.plan?.changes), "POST_CUTOVER_JOURNAL_INVALID");
    if (journal.state === "applied") for (const change of journal.plan.changes) ids.add(change.id);
  }
  requireCondition(ids.size <= 2000, "POST_CUTOVER_PRODUCT_LIMIT");
  const products = (await db.query(`SELECT p.id, p.uploaded_by, p.image, p.images, p.media_items,
    p.status, u.status AS owner_status, COALESCE(v.visibility, 'public') AS visibility
    FROM products p LEFT JOIN users u ON u.username = p.uploaded_by
    LEFT JOIN public_content_visibility v ON v.content_type = 'product' AND v.content_id = p.id
    WHERE p.id = ANY($1::text[])`, [[...ids]])).rows;
  const snapshots = (await db.query(`SELECT item->>'productId' AS product_id,
    item->>'productImage' AS legacy_image, p.id IS NOT NULL AS product_exists,
    p.image AS current_image, p.status, u.status AS owner_status,
    COALESCE(v.visibility, 'public') AS visibility
    FROM messages m CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(m.product_items) = 'array' THEN m.product_items ELSE '[]'::jsonb END
    ) AS item
    LEFT JOIN products p ON p.id = item->>'productId'
    LEFT JOIN users u ON u.username = p.uploaded_by
    LEFT JOIN public_content_visibility v ON v.content_type = 'product' AND v.content_id = p.id
    WHERE item->>'productImage' LIKE '%/uploads/%' LIMIT 5001`)).rows;
  requireCondition(snapshots.length <= 5000, "POST_CUTOVER_SNAPSHOT_LIMIT");
  const malformed = await db.query(`SELECT COUNT(*)::text AS count FROM messages
    WHERE jsonb_typeof(product_items) IS DISTINCT FROM 'array' AND product_items::text LIKE '%/uploads/%'`);
  return { journals, products, snapshots, unparsedLegacyMessageRows: Number(malformed.rows[0].count) };
}

const publiclyAvailable = (row) => row.status === "approved" && row.owner_status === "active" && row.visibility === "public";
const media = (row) => ({ image: row.image, images: row.images, media_items: row.media_items });

function analyzePostCutover(inventory, { journals, products, snapshots, unparsedLegacyMessageRows = 0 }) {
  const live = new Map(products.map((row) => [row.id, row]));
  const evidence = new Map();
  const mappings = new Map();
  const productStates = { unchanged: 0, changed: 0, missing: 0, restricted: 0 };
  let applied = 0;
  let rolledBack = 0;
  for (const journal of journals) {
    requireCondition(["applied", "rolled_back"].includes(journal.state), "POST_CUTOVER_JOURNAL_INVALID");
    if (journal.state === "rolled_back") { rolledBack += 1; continue; }
    applied += 1;
    const plan = journal.plan;
    const base = publicBase(plan.base);
    requireCondition(Array.isArray(plan.changes) && journal.source_hashes && typeof journal.source_hashes === "object", "POST_CUTOVER_JOURNAL_INVALID");
    for (const [name, hash] of Object.entries(journal.source_hashes)) {
      requireCondition(validName(name) && /^[a-f0-9]{64}$/.test(hash), "POST_CUTOVER_JOURNAL_INVALID");
      requireCondition(!evidence.has(name) || evidence.get(name) === hash, "POST_CUTOVER_HASH_CONFLICT");
      evidence.set(name, hash);
    }
    for (const change of plan.changes) {
      const row = live.get(change.id);
      const state = !row ? "missing" : !publiclyAvailable(row) ? "restricted"
        : row.uploaded_by === change.owner && isDeepStrictEqual(media(row), change.after) ? "unchanged" : "changed";
      productStates[state] += 1;
      if (state !== "unchanged") continue;
      const addPair = (before, after) => {
        const name = referenceName(before);
        if (!name || !evidence.has(name) || after !== `${base}/products/legacy/${name}`) return;
        const key = JSON.stringify([change.id, name]);
        requireCondition(!mappings.has(key) || mappings.get(key) === after, "POST_CUTOVER_MAPPING_CONFLICT");
        mappings.set(key, after);
      };
      addPair(change.before.image, change.after.image);
      change.before.images.forEach((value, index) => addPair(value, change.after.images[index]));
      change.before.media_items.forEach((item, index) => {
        if (item?.type !== "image") return;
        for (const field of ["url", "posterUrl", "thumbnailUrl"]) addPair(item[field], change.after.media_items[index]?.[field]);
      });
    }
  }
  const recovery = { exactJournalCandidate: 0, currentProductImageNeedsReview: 0,
    productMissing: 0, productRestricted: 0, noVerifiedReplacement: 0, invalidLegacyReference: 0 };
  const missingNames = new Set();
  let onDisk = 0;
  let missing = 0;
  let recorded = 0;
  for (const snapshot of snapshots) {
    const name = referenceName(snapshot.legacy_image);
    if (!name) { recovery.invalidLegacyReference += 1; continue; }
    if (inventory.files.has(name)) onDisk += 1;
    else { missing += 1; missingNames.add(name); }
    if (evidence.has(name)) recorded += 1;
    if (!snapshot.product_exists) recovery.productMissing += 1;
    else if (!publiclyAvailable(snapshot)) recovery.productRestricted += 1;
    else if (mappings.has(JSON.stringify([snapshot.product_id, name]))) recovery.exactJournalCandidate += 1;
    else if (typeof snapshot.current_image === "string" && /^https:\/\//.test(snapshot.current_image)) recovery.currentProductImageNeedsReview += 1;
    else recovery.noVerifiedReplacement += 1;
  }
  const retained = [...evidence.keys()].filter((name) => inventory.files.has(name));
  return {
    schemaVersion: "2026-09-27.post-cutover-audit.v1", mode: "read-only", privacy: "aggregate-only",
    journalEvidenceAvailable: applied > 0,
    journals: { applied, rolledBack, productEntries: Object.values(productStates).reduce((a, b) => a + b, 0), ...productStates },
    retainedDisk: { journalRecordedFiles: evidence.size, journalRecordedFilesOnDisk: retained.length,
      journalRecordedBytesOnDisk: retained.reduce((sum, name) => sum + inventory.files.get(name), 0),
      journalRecordedFilesMissing: evidence.size - retained.length,
      filesOutsideAppliedJournal: [...inventory.files.keys()].filter((name) => !evidence.has(name)).length },
    chatSnapshots: { items: snapshots.length, unparsedLegacyMessageRows, onDisk, missing, missingUniqueFiles: missingNames.size,
      recordedInAppliedJournal: recorded, recovery },
    localHashesRechecked: false, remoteDeliveryRechecked: false, privateBackupRechecked: false,
    databaseChanged: false, filesChanged: false, diskRemovalReady: false
  };
}

module.exports = { readPostCutoverRows, analyzePostCutover };
