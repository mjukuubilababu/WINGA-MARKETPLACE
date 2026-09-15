module.exports = Object.freeze({
  id: "2026091510_commerce_goals",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS commerce_goals (
       goal_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
       goal_type TEXT NOT NULL DEFAULT 'product_search' CHECK (goal_type = 'product_search'),
       product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
       query_key TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
       color TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'looking' CHECK (status IN ('looking','matched','contacted','ordered','completed','stopped')),
       resolution TEXT NOT NULL DEFAULT '', metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       resolved_at TIMESTAMPTZ, row_version BIGINT NOT NULL DEFAULT 1
     );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_goals_active_product
     ON commerce_goals (user_id, product_id, color, size)
     WHERE status IN ('looking','matched','contacted','ordered');`,
    `CREATE INDEX IF NOT EXISTS idx_commerce_goals_user_active
     ON commerce_goals (user_id, updated_at DESC, goal_id DESC)
     WHERE status IN ('looking','matched','contacted','ordered');`
  ])
});
