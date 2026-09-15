module.exports = Object.freeze({
  id: "2026091509_anonymous_product_views",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS anonymous_product_views (
       product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       audience_key TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (product_id, audience_key)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_anonymous_product_views_recent
     ON anonymous_product_views (created_at DESC, product_id);`
  ])
});
