module.exports = Object.freeze({
  id: '2026100809_growth_product_sharing_v1',
  statements: Object.freeze([
    `CREATE TABLE growth_shares (
      id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
      content_type TEXT NOT NULL CHECK(content_type='PRODUCT'), content_id TEXT NOT NULL,
      source_surface TEXT NOT NULL, campaign_type TEXT NOT NULL DEFAULT 'organic_share' CHECK(campaign_type='organic_share'),
      owner_username TEXT REFERENCES users(username) ON DELETE SET NULL, actor_key TEXT NOT NULL,
      parent_share_id TEXT REFERENCES growth_shares(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ, CHECK(expires_at>created_at));`,
    `CREATE TABLE growth_events (
      event_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
      share_id TEXT NOT NULL REFERENCES growth_shares(id) ON DELETE CASCADE, actor_key TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('product_share_created','product_share_opened',
        'shared_product_viewed','shared_product_saved','shared_product_message_started',
        'shared_product_order_started','shared_product_reshared')),
      verification TEXT NOT NULL CHECK(verification IN ('server','client_observed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(share_id,actor_key,event_type));`,
    `CREATE INDEX growth_events_recent ON growth_events(created_at,share_id,event_type);`,
    `CREATE INDEX growth_shares_owner_recent ON growth_shares(actor_key,created_at);`,
    `CREATE TABLE growth_rate_buckets (
      bucket_key TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL CHECK(count>0),
      PRIMARY KEY(bucket_key,window_start));`
  ])
});
