module.exports = Object.freeze({
  id: "2026091508_product_likes",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS product_likes (
       product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (product_id, user_id)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_product_likes_user_recent
     ON product_likes (user_id, created_at DESC, product_id);`
  ])
});
