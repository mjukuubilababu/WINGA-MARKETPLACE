module.exports = Object.freeze({
  id: "2026091604_inventory_order_items",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS product_inventory_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      size TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      stock_on_hand INTEGER NOT NULL CHECK (stock_on_hand >= 0),
      stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0 AND stock_reserved <= stock_on_hand),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      row_version BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (product_id,size,color),
      UNIQUE (id,product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      product_id TEXT NOT NULL,
      variant_id TEXT,
      product_name TEXT NOT NULL,
      size TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
      unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
      currency TEXT NOT NULL DEFAULT 'TZS',
      inventory_state TEXT NOT NULL DEFAULT 'UNTRACKED'
        CHECK (inventory_state IN ('UNTRACKED','RESERVED','COMMITTED','RELEASED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(order_id,product_id,variant_id),
      FOREIGN KEY (variant_id,product_id) REFERENCES product_inventory_variants(id,product_id) ON DELETE RESTRICT,
      CHECK ((variant_id IS NULL AND inventory_state='UNTRACKED') OR variant_id IS NOT NULL)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id,id)`,
    `CREATE TABLE IF NOT EXISTS checkout_reservation_requests (
      buyer_username TEXT NOT NULL,
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(buyer_username,request_key)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_reserved ON order_items(variant_id)
      WHERE inventory_state='RESERVED'`,
    // Historic orders contain one product; keep that fact without inventing variant stock.
    `INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,currency,created_at)
      SELECT 'legacy:'||id,id,product_id,product_name,1,price,COALESCE(currency,'TZS'),created_at
      FROM orders ON CONFLICT(id) DO NOTHING`
  ])
});
