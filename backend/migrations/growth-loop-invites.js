module.exports = Object.freeze({
  id: '202610121301_growth_loop_invites_v1',
  statements: Object.freeze([
    `ALTER TABLE growth_shares DROP CONSTRAINT growth_shares_content_type_check;
     ALTER TABLE growth_shares ADD CONSTRAINT growth_shares_content_type_check CHECK(content_type IN ('PRODUCT','SHOPPING_ROOM'));
     ALTER TABLE growth_shares DROP CONSTRAINT growth_shares_campaign_type_check;
     ALTER TABLE growth_shares ADD CONSTRAINT growth_shares_campaign_type_check CHECK(campaign_type IN ('organic_share','organic_invite'));`,
    `ALTER TABLE growth_events DROP CONSTRAINT growth_events_event_type_check;
     ALTER TABLE growth_events ADD CONSTRAINT growth_events_event_type_check CHECK(event_type IN (
       'product_share_created','product_share_opened','shared_product_viewed','shared_product_saved',
       'shared_product_message_started','shared_product_order_started','shared_product_reshared',
       'room_invite_created','room_invite_opened','room_invite_requested','room_invite_accepted',
       'room_participation_started','first_vote','first_comment','first_product_added',
       'first_product_viewed','first_order_started','new_room_created_from_invited_user','room_shortlist_created','room_poll_closed','room_invite_reported','room_inviter_blocked'));`,
    `CREATE TABLE growth_loop_invites (
       share_id TEXT PRIMARY KEY REFERENCES growth_shares(id) ON DELETE CASCADE,
       token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
       issuer_device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id) ON DELETE CASCADE,
       purpose TEXT NOT NULL CHECK(purpose IN ('choose_products','find_products')),
       preview_products JSONB NOT NULL CHECK(jsonb_typeof(preview_products)='array' AND jsonb_array_length(preview_products)<=4),
       ttl_hours INTEGER NOT NULL CHECK(ttl_hours BETWEEN 1 AND 168),
       expires_at TIMESTAMPTZ NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
    `CREATE TABLE growth_invite_requests (
       invite_id TEXT NOT NULL REFERENCES growth_loop_invites(share_id) ON DELETE CASCADE,
       recipient_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
       actor_device_id TEXT REFERENCES conversation_crypto_devices(id) ON DELETE SET NULL,
       existing_member BOOLEAN NOT NULL DEFAULT FALSE,
       actor_key TEXT NOT NULL CHECK(actor_key ~ '^[a-f0-9]{64}$'),
       journey_actor_key TEXT NOT NULL CHECK(journey_actor_key ~ '^[a-f0-9]{64}$'),
       status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','accepted','rejected')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), accepted_at TIMESTAMPTZ,
       PRIMARY KEY(invite_id,recipient_username));`,
    `CREATE INDEX growth_invite_requests_pending ON growth_invite_requests(invite_id,created_at) WHERE status='requested';`,
    `CREATE TABLE growth_invite_preferences (
       owner_username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
       allow_invites BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`
  ])
});
