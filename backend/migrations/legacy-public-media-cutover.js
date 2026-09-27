module.exports = Object.freeze({
  id: "2026092701_legacy_public_media_cutover",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS legacy_public_media_cutovers (
      id TEXT PRIMARY KEY CHECK (length(id) = 64),
      state TEXT NOT NULL CHECK (state IN ('applied', 'rolled_back')),
      plan JSONB NOT NULL,
      source_hashes JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rolled_back_at TIMESTAMPTZ
    );`
  ])
});
