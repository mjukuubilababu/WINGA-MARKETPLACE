module.exports = Object.freeze({
  id: "2026091403_atomic_intelligence_scores",
  statements: Object.freeze([
    // Preserve legacy totals as an explicit baseline; do not replay old raw history.
    `ALTER TABLE product_intelligence_scores ADD COLUMN score_total NUMERIC NOT NULL DEFAULT 0;`,
    `UPDATE product_intelligence_scores SET score_total = score;`,
    `ALTER TABLE seller_intelligence_scores ADD COLUMN score_total NUMERIC NOT NULL DEFAULT 0;`,
    `UPDATE seller_intelligence_scores SET score_total = score;`,
    `CREATE TABLE intelligence_score_receipts (
       event_id TEXT PRIMARY KEY,
       happened_at TIMESTAMPTZ NOT NULL,
       scoring_version TEXT NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `INSERT INTO intelligence_score_receipts (event_id, happened_at, scoring_version)
       SELECT event_id, happened_at, 'legacy_baseline' FROM intelligence_events
       ON CONFLICT (event_id) DO NOTHING;`,
    `CREATE INDEX idx_intelligence_score_receipts_retention ON intelligence_score_receipts (happened_at);`,
    `CREATE TABLE intelligence_score_windows (
       bucket_key TEXT PRIMARY KEY,
       bucket_start TIMESTAMPTZ NOT NULL,
       contributions INTEGER NOT NULL CHECK (contributions BETWEEN 1 AND 3)
     );`,
    `CREATE INDEX idx_intelligence_score_windows_retention ON intelligence_score_windows (bucket_start);`,
    // Mixed-version workers must retry instead of overwriting event-derived totals.
    `CREATE FUNCTION guard_intelligence_score_writer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
     BEGIN
       IF current_setting('winga.intelligence_score_writer', TRUE) IS DISTINCT FROM 'event_delta_v2' THEN
         RAISE EXCEPTION 'Intelligence score writer upgrade required' USING ERRCODE = '55000';
       END IF;
       RETURN NEW;
     END $$;`,
    `CREATE TRIGGER trg_product_score_writer BEFORE INSERT OR UPDATE ON product_intelligence_scores
       FOR EACH ROW EXECUTE FUNCTION guard_intelligence_score_writer();`,
    `CREATE TRIGGER trg_seller_score_writer BEFORE INSERT OR UPDATE ON seller_intelligence_scores
       FOR EACH ROW EXECUTE FUNCTION guard_intelligence_score_writer();`
  ])
});
