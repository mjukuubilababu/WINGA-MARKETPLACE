module.exports = Object.freeze({
  id: "2026091513_wip_mind_contracts",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS intelligence_signals (
       signal_id TEXT PRIMARY KEY,
       schema_version TEXT NOT NULL,
       intelligence_type TEXT NOT NULL,
       intelligence_version TEXT NOT NULL,
       subject_type TEXT NOT NULL,
       subject_id TEXT NOT NULL,
       signal_name TEXT NOT NULL,
       value JSONB NOT NULL,
       confidence NUMERIC(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
       evidence_count INTEGER NOT NULL DEFAULT 1 CHECK (evidence_count > 0),
       observed_from JSONB NOT NULL DEFAULT '[]'::jsonb,
       valid_from TIMESTAMPTZ NOT NULL,
       valid_until TIMESTAMPTZ NOT NULL,
       geographic_scope JSONB,
       temporal_scope JSONB,
       model_version TEXT NOT NULL DEFAULT '',
       rule_version TEXT NOT NULL DEFAULT '',
       feature_version TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CHECK (valid_until > valid_from)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_signals_subject_active
     ON intelligence_signals (subject_type, subject_id, valid_until DESC, confidence DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_signals_learner_active
     ON intelligence_signals (intelligence_type, signal_name, valid_until DESC);`,
    `CREATE TABLE IF NOT EXISTS intelligence_decisions (
       decision_id TEXT PRIMARY KEY,
       schema_version TEXT NOT NULL,
       decision_type TEXT NOT NULL,
       subject_id TEXT NOT NULL,
       target_context TEXT NOT NULL,
       selected_action TEXT NOT NULL,
       priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
       contributing_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
       confidence NUMERIC(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
       policy_version TEXT NOT NULL,
       reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
       sponsored BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL,
       idempotency_key TEXT NOT NULL DEFAULT '',
       CHECK (expires_at > created_at)
     );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_decisions_idempotency
     ON intelligence_decisions (idempotency_key) WHERE idempotency_key <> '';`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_decisions_active
     ON intelligence_decisions (decision_type, target_context, expires_at DESC, priority DESC);`,
    `CREATE TABLE IF NOT EXISTS intelligence_action_results (
       action_id TEXT PRIMARY KEY,
       schema_version TEXT NOT NULL,
       decision_id TEXT NOT NULL REFERENCES intelligence_decisions(decision_id) ON DELETE CASCADE,
       status TEXT NOT NULL CHECK (status IN ('EXECUTED', 'SKIPPED', 'FAILED', 'EXPIRED', 'REJECTED_BY_POLICY')),
       started_at TIMESTAMPTZ NOT NULL,
       completed_at TIMESTAMPTZ NOT NULL,
       result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       failure_reason TEXT NOT NULL DEFAULT '',
       CHECK (completed_at >= started_at)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_action_results_health
     ON intelligence_action_results (status, completed_at DESC);`,
    `CREATE TABLE IF NOT EXISTS intelligence_module_health (
       intelligence_id TEXT PRIMARY KEY,
       status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'disabled')),
       processed_count BIGINT NOT NULL DEFAULT 0,
       signal_count BIGINT NOT NULL DEFAULT 0,
       failure_count BIGINT NOT NULL DEFAULT 0,
       circuit_open_until TIMESTAMPTZ,
       last_success_at TIMESTAMPTZ,
       last_failure_at TIMESTAMPTZ,
       last_failure_code TEXT NOT NULL DEFAULT '',
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`
  ])
});
