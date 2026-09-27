const { validName, familyNames, referenceName, productReferences, createLegacyPublicMediaHandler } = require("./legacy-public-media");

function check(value, code) { if (!value) throw new Error(code); }
function journalBase(value) {
  const url = new URL(value);
  check(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "LEGACY_COMPAT_JOURNAL_INVALID");
  return url.href.replace(/\/+$/, "");
}
function mediaName(value, bases) {
  const local = referenceName(value);
  if (local) return local;
  if (typeof value !== "string") return "";
  for (const base of bases) {
    const prefix = base + "/products/legacy/";
    if (value.startsWith(prefix) && validName(value.slice(prefix.length))) return value.slice(prefix.length);
  }
  return "";
}

function createLegacyUploadCompatibilityStore({ query }) {
  return {
    async authorizeLegacyUploadCompatibility(name) {
      if (!validName(name)) return false;
      // Retain rolled-back entries as a denial fence: never silently fall through to disk.
      const journals = (await query(`SELECT state, plan, source_hashes->>$1 AS hash
        FROM legacy_public_media_cutovers WHERE source_hashes ? $1 LIMIT 11`, [name])).rows;
      check(journals.length <= 10, "LEGACY_COMPAT_JOURNAL_LIMIT");
      if (!journals.length) return null;
      const active = journals.filter((row) => row.state === "applied");
      if (!active.length) return false;
      const names = new Set(familyNames(name));
      const bases = new Set();
      const owners = new Map();
      let hash;
      for (const journal of active) {
        check(/^[a-f0-9]{64}$/.test(journal.hash || "") && (!hash || hash === journal.hash), "LEGACY_COMPAT_JOURNAL_INVALID");
        hash = journal.hash;
        const plan = journal.plan;
        check(Array.isArray(plan?.changes) && plan.changes.length <= 200, "LEGACY_COMPAT_JOURNAL_INVALID");
        const base = journalBase(plan.base);
        bases.add(base);
        for (const change of plan.changes) {
          if (productReferences(change.before || {}).some((value) => names.has(referenceName(value)))) {
            owners.set(change.id, change.owner);
          }
        }
      }
      if (!owners.size) return false;
      const stem = name.replace(/-(320|640|1080)\.webp$/, "");
      const rows = (await query(`SELECT 'product' AS kind, p.id, p.uploaded_by, p.image, p.images, p.media_items,
        p.status, u.status AS owner_status, COALESCE(v.visibility, 'public') AS visibility
        FROM products p LEFT JOIN users u ON u.username = p.uploaded_by
        LEFT JOIN public_content_visibility v ON v.content_type = 'product' AND v.content_id = p.id
        WHERE strpos(p.image,$1)>0 OR strpos(p.images::text,$1)>0 OR strpos(p.media_items::text,$1)>0
        UNION ALL SELECT 'identity', '', '', identity_document_image, '[]'::jsonb, '[]'::jsonb, '', '', ''
        FROM users WHERE strpos(identity_document_image,$1)>0 LIMIT 101`, [stem])).rows;
      check(rows.length <= 100, "LEGACY_COMPAT_CANDIDATE_LIMIT");
      let allowed = false;
      for (const row of rows) {
        const values = row.kind === "identity" ? [row.image] : productReferences(row);
        if (!values.some((value) => names.has(mediaName(value, bases)))) continue;
        if (row.kind !== "product" || row.status !== "approved" || row.owner_status !== "active" || row.visibility !== "public") return false;
        if (owners.get(row.id) === row.uploaded_by && values.some((value) => {
          const candidate = mediaName(value, bases);
          return names.has(candidate) && [...bases].some((base) => value === `${base}/products/legacy/${candidate}`);
        })) allowed = true;
      }
      return allowed ? { sha256: hash } : false;
    }
  };
}

function createLegacyUploadCompatibilityHandler(options = {}) {
  // Known journal media must prove remote delivery even while the old disk exists.
  return createLegacyPublicMediaHandler({ ...options, route: "/uploads/", passUnmapped: true, readLocal: async () => null });
}

module.exports = { createLegacyUploadCompatibilityStore, createLegacyUploadCompatibilityHandler };
