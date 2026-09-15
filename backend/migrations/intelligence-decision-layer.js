module.exports = Object.freeze({
  id: "2026091511_intelligence_decision_layer",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS intelligence_relationships (
       source_type TEXT NOT NULL,
       source_key TEXT NOT NULL,
       relationship_type TEXT NOT NULL,
       target_type TEXT NOT NULL,
       target_key TEXT NOT NULL,
       strength NUMERIC(12, 4) NOT NULL DEFAULT 0,
       evidence_count INTEGER NOT NULL DEFAULT 0,
       first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       model_version TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (source_type, source_key, relationship_type, target_type, target_key)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_relationships_target
     ON intelligence_relationships (target_type, target_key, relationship_type, strength DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_relationships_source
     ON intelligence_relationships (source_type, source_key, relationship_type, strength DESC);`,
    `CREATE TABLE IF NOT EXISTS intelligence_forecasts (
       forecast_type TEXT NOT NULL,
       entity_type TEXT NOT NULL,
       entity_key TEXT NOT NULL,
       horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 365),
       predicted_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
       baseline_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
       trend_direction TEXT NOT NULL DEFAULT 'stable' CHECK (trend_direction IN ('growing', 'stable', 'declining')),
       confidence NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
       evidence_count INTEGER NOT NULL DEFAULT 0,
       evidence_window_days INTEGER NOT NULL DEFAULT 14,
       reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
       model_version TEXT NOT NULL,
       generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL,
       PRIMARY KEY (forecast_type, entity_type, entity_key, horizon_days)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_forecasts_active
     ON intelligence_forecasts (forecast_type, expires_at, confidence DESC, predicted_value DESC);`,
    `CREATE TABLE IF NOT EXISTS intelligence_recommendations (
       recommendation_id TEXT PRIMARY KEY,
       audience_type TEXT NOT NULL CHECK (audience_type IN ('person', 'seller', 'market')),
       audience_key TEXT NOT NULL,
       recommendation_type TEXT NOT NULL,
       entity_type TEXT NOT NULL,
       entity_key TEXT NOT NULL,
       score NUMERIC(12, 4) NOT NULL DEFAULT 0,
       reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acted', 'dismissed', 'expired')),
       model_version TEXT NOT NULL,
       generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE (audience_type, audience_key, recommendation_type, entity_type, entity_key)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_recommendations_audience
     ON intelligence_recommendations (audience_type, audience_key, status, score DESC, expires_at);`,
    `CREATE TABLE IF NOT EXISTS intelligence_job_runs (
       run_id BIGSERIAL PRIMARY KEY,
       job_type TEXT NOT NULL,
       status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
       model_version TEXT NOT NULL,
       started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       completed_at TIMESTAMPTZ,
       duration_ms INTEGER NOT NULL DEFAULT 0,
       output_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
       error_code TEXT NOT NULL DEFAULT ''
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_job_runs_health
     ON intelligence_job_runs (job_type, started_at DESC);`
  ])
});
