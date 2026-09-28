module.exports = {
  id: "2026092804_message_web_push",
  statements: [
    `CREATE TABLE IF NOT EXISTS web_push_identity (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
      public_key TEXT NOT NULL, private_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL,
      subscription JSONB NOT NULL, locale TEXT NOT NULL DEFAULT 'sw',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_web_push_owner ON web_push_subscriptions(owner_id,session_id)`,
    `CREATE TABLE IF NOT EXISTS web_push_jobs (
      id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL, session_id TEXT NOT NULL, message_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_token TEXT, lease_until TIMESTAMPTZ, completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
      UNIQUE(subscription_id,message_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_web_push_ready ON web_push_jobs(next_attempt_at) WHERE completed_at IS NULL`
  ]
};
