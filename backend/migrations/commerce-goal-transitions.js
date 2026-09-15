module.exports = Object.freeze({
  id: "2026091514_commerce_goal_transitions",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS commerce_goal_transitions (
       transition_id TEXT PRIMARY KEY,
       goal_id TEXT NOT NULL REFERENCES commerce_goals(goal_id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
       from_status TEXT NOT NULL DEFAULT '',
       to_status TEXT NOT NULL CHECK (to_status IN ('looking','matched','contacted','ordered','completed','stopped')),
       source TEXT NOT NULL,
       source_entity_type TEXT NOT NULL DEFAULT '',
       source_entity_key TEXT NOT NULL DEFAULT '',
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_commerce_goal_transitions_goal_recent
     ON commerce_goal_transitions (goal_id, occurred_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_commerce_goal_transitions_user_recent
     ON commerce_goal_transitions (user_id, occurred_at DESC);`
  ])
});
