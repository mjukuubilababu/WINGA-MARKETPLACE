const MIGRATION_LOCK_NAME = "winga_schema_migrations_v1";

const MIGRATIONS = Object.freeze([
  Object.freeze({
    id: "2026071901_product_row_version",
    statements: Object.freeze([
      `ALTER TABLE products
       ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `CREATE INDEX IF NOT EXISTS idx_products_updated_version
       ON products (updated_at DESC, row_version DESC);`
    ])
  }),
  Object.freeze({
    id: "2026071902_session_row_version",
    statements: Object.freeze([
      `ALTER TABLE sessions
       ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
       ON sessions (expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_username_active
       ON sessions (username, expires_at DESC, last_seen_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026071903_user_row_version",
    statements: Object.freeze([
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `CREATE INDEX IF NOT EXISTS idx_users_role_status
       ON users (role, status, created_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026071904_commerce_atomicity",
    statements: Object.freeze([
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_recipient_name TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_instructions TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_status TEXT NOT NULL DEFAULT 'submitted';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserve_expires_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_number TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_recipient_name TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_instructions TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `CREATE TABLE IF NOT EXISTS payment_transaction_claims (
         transaction_reference TEXT PRIMARY KEY,
         payment_id TEXT NOT NULL,
         order_id TEXT NOT NULL,
         claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`,
      `INSERT INTO payment_transaction_claims (transaction_reference, payment_id, order_id, claimed_at)
       SELECT DISTINCT ON (transaction_reference)
         transaction_reference, id, order_id, COALESCE(created_at, NOW())
       FROM payments
       WHERE transaction_reference <> ''
       ORDER BY transaction_reference, created_at ASC, id ASC
       ON CONFLICT (transaction_reference) DO NOTHING;`,
      `CREATE INDEX IF NOT EXISTS idx_orders_product_state
       ON orders (product_id, status, payment_status, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_buyer_product_state
       ON orders (buyer_username, product_id, status, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_reservation_expiry
       ON orders (reserve_expires_at)
       WHERE status = 'placed';`,
      `CREATE INDEX IF NOT EXISTS idx_payments_order
       ON payments (order_id, updated_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026071905_messaging_atomicity",
    statements: Object.freeze([
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS shared_phone_viewer_ids JSONB NOT NULL DEFAULT '[]'::jsonb;`,
      `CREATE INDEX IF NOT EXISTS idx_messages_participants_time
       ON messages (sender_id, receiver_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread
       ON messages (receiver_id, sender_id, created_at DESC)
       WHERE is_read = FALSE;`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
       ON notifications (user_id, created_at DESC)
       WHERE is_read = FALSE;`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_conversation
       ON notifications (user_id, conversation_id, created_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026071906_user_profile_persistence",
    statements: Object.freeze([
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_verification_status TEXT NOT NULL DEFAULT 'verified';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_whatsapp_number TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_whatsapp_code_hash TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_whatsapp_requested_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_whatsapp_expires_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_number TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_recipient_name TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_instructions TEXT NOT NULL DEFAULT '';`,
      `UPDATE users SET whatsapp_number = phone_number
       WHERE whatsapp_number = '' AND phone_number <> '';`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_whatsapp_number_unique
       ON users (whatsapp_number) WHERE whatsapp_number <> '';`,
      `CREATE INDEX IF NOT EXISTS idx_users_updated_version
       ON users (updated_at DESC, row_version DESC);`
    ])
  }),
  Object.freeze({
    id: "2026071907_marketplace_support_atomicity",
    statements: Object.freeze([
      `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `ALTER TABLE reports ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1;`,
      `CREATE TABLE IF NOT EXISTS promotion_transaction_claims (
         transaction_reference TEXT PRIMARY KEY,
         promotion_id TEXT NOT NULL,
         claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`,
      `INSERT INTO promotion_transaction_claims (transaction_reference, promotion_id, claimed_at)
       SELECT DISTINCT ON (transaction_reference) transaction_reference, id, created_at
       FROM promotions WHERE transaction_reference <> ''
       ORDER BY transaction_reference, created_at ASC, id ASC
       ON CONFLICT (transaction_reference) DO NOTHING;`,
      `CREATE TABLE IF NOT EXISTS review_claims (
         user_id TEXT NOT NULL,
         product_id TEXT NOT NULL,
         review_id TEXT NOT NULL,
         claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (user_id, product_id)
       );`,
      `INSERT INTO review_claims (user_id, product_id, review_id, claimed_at)
       SELECT DISTINCT ON (user_id, product_id) user_id, product_id, id, date
       FROM reviews ORDER BY user_id, product_id, date ASC, id ASC
       ON CONFLICT (user_id, product_id) DO NOTHING;`,
      `CREATE TABLE IF NOT EXISTS open_report_claims (
         reporter_user_id TEXT NOT NULL,
         target_type TEXT NOT NULL,
         target_user_id TEXT NOT NULL DEFAULT '',
         target_product_id TEXT NOT NULL DEFAULT '',
         report_id TEXT NOT NULL,
         claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (reporter_user_id, target_type, target_user_id, target_product_id)
       );`,
      `INSERT INTO open_report_claims (
         reporter_user_id, target_type, target_user_id, target_product_id, report_id, claimed_at
       ) SELECT DISTINCT ON (reporter_user_id, target_type, target_user_id, target_product_id)
         reporter_user_id, target_type, target_user_id, target_product_id, id, created_at
       FROM reports WHERE status = 'open'
       ORDER BY reporter_user_id, target_type, target_user_id, target_product_id, created_at ASC, id ASC
       ON CONFLICT (reporter_user_id, target_type, target_user_id, target_product_id) DO NOTHING;`,
      `CREATE INDEX IF NOT EXISTS idx_promotions_product_state
       ON promotions (product_id, type, status, updated_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_product_date ON reviews (product_id, date DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_reports_status_updated ON reports (status, updated_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026072001_password_recovery_challenges",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS password_recovery_challenges (
         challenge_id TEXT PRIMARY KEY,
         username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
         destination_hash TEXT NOT NULL,
         code_hash TEXT NOT NULL,
         requested_ip_hash TEXT NOT NULL DEFAULT '',
         delivery_status TEXT NOT NULL DEFAULT 'pending',
         attempts INTEGER NOT NULL DEFAULT 0,
         max_attempts INTEGER NOT NULL DEFAULT 5,
         expires_at TIMESTAMPTZ NOT NULL,
         consumed_at TIMESTAMPTZ NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`,
      `CREATE INDEX IF NOT EXISTS idx_password_recovery_user_active
       ON password_recovery_challenges (username, created_at DESC)
       WHERE consumed_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_password_recovery_expiry
       ON password_recovery_challenges (expires_at)
       WHERE consumed_at IS NULL;`
    ])
  }),
  Object.freeze({
    id: "2026072601_user_locale_preferences",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS user_locale_preferences (
         username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
         language TEXT NOT NULL DEFAULT '',
         use_device_language BOOLEAN NOT NULL DEFAULT TRUE,
         currency TEXT NOT NULL DEFAULT '',
         timezone TEXT NOT NULL DEFAULT '',
         row_version BIGINT NOT NULL DEFAULT 1,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`,
      `CREATE INDEX IF NOT EXISTS idx_user_locale_preferences_updated
       ON user_locale_preferences (updated_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026081301_payment_reconciliation_cases",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS payment_reconciliation_cases (
         id TEXT PRIMARY KEY,
         order_id TEXT NOT NULL,
         payment_id TEXT NOT NULL,
         transaction_reference TEXT NOT NULL DEFAULT '',
         case_type TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'open',
         incoming_payment_status TEXT NOT NULL DEFAULT '',
         amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
         evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
         resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
         assigned_to TEXT NOT NULL DEFAULT '',
         resolved_by TEXT NOT NULL DEFAULT '',
         resolved_at TIMESTAMPTZ NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         row_version BIGINT NOT NULL DEFAULT 1
       );`,
      `CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_status_updated
       ON payment_reconciliation_cases (status, updated_at DESC, id DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_order
       ON payment_reconciliation_cases (order_id, created_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026081302_payment_refund_outbox",
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS payment_refund_outbox (
         id TEXT PRIMARY KEY,
         reconciliation_case_id TEXT NOT NULL REFERENCES payment_reconciliation_cases(id) ON DELETE RESTRICT,
         order_id TEXT NOT NULL,
         payment_id TEXT NOT NULL,
         transaction_reference TEXT NOT NULL DEFAULT '',
         payment_provider TEXT NOT NULL DEFAULT '',
         amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
         status TEXT NOT NULL DEFAULT 'pending',
         idempotency_key TEXT NOT NULL UNIQUE,
         attempts INTEGER NOT NULL DEFAULT 0,
         max_attempts INTEGER NOT NULL DEFAULT 8,
         next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         processing_started_at TIMESTAMPTZ NULL,
         provider_refund_id TEXT NOT NULL DEFAULT '',
         request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
         provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
         last_error TEXT NOT NULL DEFAULT '',
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         row_version BIGINT NOT NULL DEFAULT 1
       );`,
      `CREATE INDEX IF NOT EXISTS idx_payment_refund_outbox_ready
       ON payment_refund_outbox (next_attempt_at ASC, created_at ASC, id ASC)
       WHERE status IN ('pending', 'failed', 'submitted', 'processing');`,
      `CREATE INDEX IF NOT EXISTS idx_payment_refund_outbox_case
       ON payment_refund_outbox (reconciliation_case_id, created_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026081401_payment_confirmation_hardening",
    statements: Object.freeze([
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TZS';`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TZS';`,
      `CREATE TABLE IF NOT EXISTS payment_webhook_events (
         event_id TEXT PRIMARY KEY,
         payment_id TEXT NOT NULL,
         order_id TEXT NOT NULL,
         transaction_reference TEXT NOT NULL DEFAULT '',
         payment_status TEXT NOT NULL,
         amount NUMERIC(14, 2) NOT NULL,
         currency TEXT NOT NULL DEFAULT 'TZS',
         payload_hash TEXT NOT NULL DEFAULT '',
         received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`,
      `CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_received
       ON payment_webhook_events (received_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment
       ON payment_webhook_events (payment_id, received_at DESC);`
    ])
  }),
  Object.freeze({
    id: "2026081402_commerce_order_lifecycle",
    statements: Object.freeze([
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirm_by TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_window_ends_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_reason TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NOT NULL DEFAULT '';`,
      `CREATE TABLE IF NOT EXISTS order_lifecycle_events (
         event_key TEXT PRIMARY KEY,
         order_id TEXT NOT NULL,
         from_status TEXT NOT NULL,
         to_status TEXT NOT NULL,
         actor_username TEXT NOT NULL DEFAULT '',
         actor_role TEXT NOT NULL DEFAULT '',
         reason TEXT NOT NULL DEFAULT '',
         metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`,
      `CREATE INDEX IF NOT EXISTS idx_order_lifecycle_events_order
       ON order_lifecycle_events (order_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_delivery_confirmation
       ON orders (delivery_confirm_by, id) WHERE status = 'shipped';`
    ])
  }),
  Object.freeze({
    id: "2026082401_product_full_text_search",
    statements: Object.freeze([
      `ALTER TABLE products
       ADD COLUMN IF NOT EXISTS search_vector tsvector;`,
      `CREATE OR REPLACE FUNCTION winga_products_search_vector_update()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $function$
       BEGIN
         NEW.search_vector :=
           setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
           setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
           setweight(to_tsvector('simple', COALESCE(NEW.shop, '')), 'B') ||
           setweight(to_tsvector('simple', COALESCE(NEW.uploaded_by, '')), 'C');
         RETURN NEW;
       END;
       $function$;`,
      `UPDATE products
       SET search_vector =
         setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
         setweight(to_tsvector('simple', COALESCE(category, '')), 'B') ||
         setweight(to_tsvector('simple', COALESCE(shop, '')), 'B') ||
         setweight(to_tsvector('simple', COALESCE(uploaded_by, '')), 'C')
       WHERE search_vector IS NULL;`,
      `DROP TRIGGER IF EXISTS trg_products_search_vector_update ON products;`,
      `CREATE TRIGGER trg_products_search_vector_update
       BEFORE INSERT OR UPDATE OF name, category, shop, uploaded_by
       ON products
       FOR EACH ROW
       EXECUTE FUNCTION winga_products_search_vector_update();`,
      `CREATE INDEX IF NOT EXISTS idx_products_search
       ON products USING GIN (search_vector);`
    ])
  })
]);

async function runSchemaMigrations({ pool, logger = console, beforeMigrations = null } = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL pool or query client is required.");
  }

  const ownsClient = typeof pool.connect === "function";
  const client = ownsClient ? await pool.connect() : pool;
  let lockHeld = false;

  try {
    if (ownsClient) {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_NAME]);
      lockHeld = true;
    }

    if (typeof beforeMigrations === "function") {
      await beforeMigrations(client);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const appliedResult = await client.query(
      "SELECT migration_id FROM schema_migrations ORDER BY migration_id ASC"
    );
    const applied = new Set((appliedResult.rows || []).map((row) => String(row.migration_id || "")));
    const executed = [];

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) {
        continue;
      }

      await client.query("BEGIN");
      try {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query(
          "INSERT INTO schema_migrations (migration_id) VALUES ($1)",
          [migration.id]
        );
        await client.query("COMMIT");
        executed.push(migration.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    if (executed.length) {
      logger.info?.("[WINGA] PostgreSQL schema migrations applied.", { migrations: executed });
    }

    return {
      applied: executed,
      current: MIGRATIONS.map((migration) => migration.id)
    };
  } finally {
    if (lockHeld) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_NAME]);
    }
    if (ownsClient && typeof client.release === "function") {
      client.release();
    }
  }
}

module.exports = {
  MIGRATIONS,
  runSchemaMigrations
};
