module.exports = Object.freeze({
  id: "2026091602_conversation_offers",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS conversation_offers (
       id TEXT PRIMARY KEY,
       conversation_id TEXT NOT NULL,
       product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
       buyer_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       seller_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       amount BIGINT NOT NULL CHECK (amount >= 500),
       currency TEXT NOT NULL DEFAULT 'TZS',
       status TEXT NOT NULL DEFAULT 'PROPOSED'
         CHECK (status IN ('PROPOSED','COUNTERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED','CONVERTED_TO_ORDER')),
       last_actor_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       expires_at TIMESTAMPTZ NOT NULL,
       accepted_at TIMESTAMPTZ,
       converted_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       row_version BIGINT NOT NULL DEFAULT 1,
       CHECK (buyer_username <> seller_username)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_offers_thread
       ON conversation_offers (conversation_id, updated_at DESC, id DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_offers_active
       ON conversation_offers (expires_at, status)
       WHERE status IN ('PROPOSED','COUNTERED');`,
    `CREATE TABLE IF NOT EXISTS conversation_offer_events (
       id TEXT PRIMARY KEY,
       offer_id TEXT NOT NULL REFERENCES conversation_offers(id) ON DELETE CASCADE,
       actor_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       action TEXT NOT NULL CHECK (action IN ('PROPOSE','COUNTER','ACCEPT','DECLINE','CANCEL','EXPIRE','CONVERT_TO_ORDER')),
       from_status TEXT NOT NULL DEFAULT '',
       to_status TEXT NOT NULL,
       amount BIGINT NOT NULL CHECK (amount >= 500),
       idempotency_key TEXT NOT NULL UNIQUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_offer_events_offer
       ON conversation_offer_events (offer_id, created_at ASC, id ASC);`
  ])
});
