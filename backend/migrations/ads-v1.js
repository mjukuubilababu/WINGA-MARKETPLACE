module.exports = Object.freeze({
  id: "2026091601_ads_v1",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS ad_accounts (
       id TEXT PRIMARY KEY, owner_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
       business_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ACTIVE'
         CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       row_version BIGINT NOT NULL DEFAULT 1, UNIQUE(owner_username)
     );`,
    `CREATE TABLE IF NOT EXISTS ad_placements (
       code TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE'
         CHECK (status IN ('ACTIVE','PAUSED')),
       currency TEXT NOT NULL, pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
       max_active_ads INTEGER NOT NULL DEFAULT 8 CHECK (max_active_ads > 0),
       rules JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `INSERT INTO ad_placements (code,name,currency,pricing,max_active_ads,rules) VALUES
       ('HOME_FEED_SPONSORED','Home Feed Sponsored','TZS','{"1":1000,"3":3000,"7":7000,"14":14000}'::jsonb,8,'{"minimumOrganicSpacing":8,"frequencyCap":1}'::jsonb),
       ('SEARCH_SPONSORED','Search Sponsored','TZS','{"1":800,"3":2200,"7":5000,"14":9500}'::jsonb,8,'{"frequencyCap":1}'::jsonb)
     ON CONFLICT (code) DO NOTHING;`,
    `CREATE TABLE IF NOT EXISTS ad_creatives (
       id TEXT PRIMARY KEY, ad_account_id TEXT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
       product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
       media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE','VIDEO')),
       media_url TEXT NOT NULL, headline TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
       cta_type TEXT NOT NULL DEFAULT 'VIEW_PRODUCT', destination_type TEXT NOT NULL DEFAULT 'PRODUCT'
         CHECK (destination_type IN ('PRODUCT','PROFILE','WINGA_PAGE','EXTERNAL_URL')),
       destination_value TEXT NOT NULL, moderation_status TEXT NOT NULL DEFAULT 'PENDING'
         CHECK (moderation_status IN ('PENDING','APPROVED','REJECTED')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE TABLE IF NOT EXISTS ad_campaigns (
       id TEXT PRIMARY KEY, ad_account_id TEXT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
       creative_id TEXT NOT NULL REFERENCES ad_creatives(id) ON DELETE RESTRICT,
       placement_code TEXT NOT NULL REFERENCES ad_placements(code) ON DELETE RESTRICT,
       starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
       duration_days INTEGER NOT NULL CHECK (duration_days IN (1,3,7,14)),
       quoted_price BIGINT NOT NULL CHECK (quoted_price >= 0), currency TEXT NOT NULL,
       payment_status TEXT NOT NULL DEFAULT 'UNPAID'
         CHECK (payment_status IN ('UNPAID','PENDING','PAID','FAILED','REFUNDED')),
       review_status TEXT NOT NULL DEFAULT 'PENDING'
         CHECK (review_status IN ('PENDING','APPROVED','REJECTED')),
       campaign_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
         CHECK (campaign_status IN ('DRAFT','PENDING_PAYMENT','PENDING_REVIEW','APPROVED','SCHEDULED','ACTIVE','PAUSED','REJECTED','CANCELLED','EXPIRED')),
       targeting JSONB NOT NULL DEFAULT '{}'::jsonb, created_by TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       reviewed_by TEXT REFERENCES users(username) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       approved_at TIMESTAMPTZ, activated_at TIMESTAMPTZ, expired_at TIMESTAMPTZ,
       row_version BIGINT NOT NULL DEFAULT 1, CHECK (ends_at > starts_at)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_ad_campaigns_owner ON ad_campaigns(ad_account_id,created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_ad_campaigns_active ON ad_campaigns(placement_code,starts_at,ends_at) WHERE campaign_status IN ('SCHEDULED','ACTIVE');`,
    `CREATE TABLE IF NOT EXISTS ad_bookings (
       id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL UNIQUE REFERENCES ad_campaigns(id) ON DELETE CASCADE,
       placement_code TEXT NOT NULL REFERENCES ad_placements(code) ON DELETE RESTRICT,
       starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
       status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','ACTIVE','RELEASED','EXPIRED')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_ad_bookings_capacity ON ad_bookings(placement_code,starts_at,ends_at) WHERE status IN ('RESERVED','ACTIVE');`,
    `CREATE TABLE IF NOT EXISTS ad_payment_references (
       id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
       provider TEXT NOT NULL DEFAULT 'mobile_money', transaction_reference TEXT NOT NULL UNIQUE,
       amount BIGINT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING'
         CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
       idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), confirmed_at TIMESTAMPTZ
     );`,
    `CREATE TABLE IF NOT EXISTS ad_reviews (
       id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
       reviewer_username TEXT NOT NULL REFERENCES users(username) ON DELETE RESTRICT,
       decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','PAUSED','CANCELLED')),
       reason_code TEXT NOT NULL DEFAULT '', explanation TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE TABLE IF NOT EXISTS ad_events (
       id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
       creative_id TEXT NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
       placement_code TEXT NOT NULL REFERENCES ad_placements(code) ON DELETE RESTRICT,
       event_type TEXT NOT NULL CHECK (event_type IN ('IMPRESSION','CLICK')),
       viewer_key_hash TEXT NOT NULL DEFAULT '', dedupe_key TEXT NOT NULL UNIQUE,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_ad_events_campaign_time ON ad_events(campaign_id,occurred_at DESC);`,
    `CREATE TABLE IF NOT EXISTS ad_campaign_metrics (
       campaign_id TEXT PRIMARY KEY REFERENCES ad_campaigns(id) ON DELETE CASCADE,
       impressions BIGINT NOT NULL DEFAULT 0, clicks BIGINT NOT NULL DEFAULT 0,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`
  ])
});
