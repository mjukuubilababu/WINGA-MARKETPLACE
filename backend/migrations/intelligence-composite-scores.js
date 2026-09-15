module.exports = Object.freeze({
  id: "2026091512_intelligence_composite_scores",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS intelligence_entity_scores (
       entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'seller')),
       entity_key TEXT NOT NULL,
       score NUMERIC(7, 4) NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
       components JSONB NOT NULL DEFAULT '{}'::jsonb,
       evidence_count INTEGER NOT NULL DEFAULT 0,
       model_version TEXT NOT NULL,
       calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL,
       PRIMARY KEY (entity_type, entity_key)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_entity_scores_rank
     ON intelligence_entity_scores (entity_type, score DESC, calculated_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_entity_scores_expiry
     ON intelligence_entity_scores (expires_at);`
  ])
});
