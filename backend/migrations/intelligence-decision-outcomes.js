module.exports = Object.freeze({
  id: "2026091601_intelligence_decision_outcomes",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS intelligence_decision_outcomes (
       outcome_id TEXT PRIMARY KEY,
       decision_id TEXT NOT NULL REFERENCES intelligence_decisions(decision_id) ON DELETE CASCADE,
       action_id TEXT NOT NULL REFERENCES intelligence_action_results(action_id) ON DELETE CASCADE,
       outcome_type TEXT NOT NULL CHECK (outcome_type IN ('viewed_detail','liked','messaged','order_intent','delivered_order')),
       source_entity_type TEXT NOT NULL,
       source_entity_key TEXT NOT NULL,
       attribution_model TEXT NOT NULL DEFAULT 'last_touch_non_causal'
         CHECK (attribution_model = 'last_touch_non_causal'),
       business_outcome BOOLEAN NOT NULL DEFAULT FALSE,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_decision_outcomes_dedupe
     ON intelligence_decision_outcomes (action_id, outcome_type, source_entity_type, source_entity_key);`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_decision_outcomes_recent
     ON intelligence_decision_outcomes (decision_id, occurred_at DESC);`
  ])
});