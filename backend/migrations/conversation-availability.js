module.exports = Object.freeze({
  id: "2026091603_conversation_availability",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS conversation_availability_requests (
       id TEXT PRIMARY KEY,
       conversation_id TEXT NOT NULL,
       product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
       buyer_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       seller_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       requested_size TEXT NOT NULL DEFAULT '',
       requested_color TEXT NOT NULL DEFAULT '',
       requested_quantity INTEGER NOT NULL DEFAULT 1 CHECK (requested_quantity BETWEEN 1 AND 99),
       status TEXT NOT NULL DEFAULT 'REQUESTED'
         CHECK (status IN ('REQUESTED','AVAILABLE','OUT_OF_STOCK','ALTERNATIVE_SUGGESTED','CANCELLED')),
       response_product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
       responded_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       row_version BIGINT NOT NULL DEFAULT 1,
       CHECK (buyer_username <> seller_username)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_availability_thread
       ON conversation_availability_requests (conversation_id, updated_at DESC, id DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_availability_pending
       ON conversation_availability_requests (seller_username, created_at ASC)
       WHERE status = 'REQUESTED';`,
    `CREATE TABLE IF NOT EXISTS conversation_availability_events (
       id TEXT PRIMARY KEY,
       request_id TEXT NOT NULL REFERENCES conversation_availability_requests(id) ON DELETE CASCADE,
       actor_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       action TEXT NOT NULL CHECK (action IN ('REQUEST','AVAILABLE','OUT_OF_STOCK','SUGGEST_ALTERNATIVE','CANCEL')),
       from_status TEXT NOT NULL DEFAULT '',
       to_status TEXT NOT NULL,
       idempotency_key TEXT NOT NULL UNIQUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_availability_events_request
       ON conversation_availability_events (request_id, created_at ASC, id ASC);`
  ])
});
