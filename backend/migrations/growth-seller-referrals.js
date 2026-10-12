module.exports=Object.freeze({id:'202610121900_growth_seller_referrals_v1',statements:Object.freeze([
  `ALTER TABLE growth_shares ADD COLUMN measurement_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
  `ALTER TABLE growth_shares DROP CONSTRAINT growth_shares_content_type_check;
   ALTER TABLE growth_shares ADD CONSTRAINT growth_shares_content_type_check CHECK(content_type IN ('PRODUCT','SHOPPING_ROOM','PROFILE','COLLECTION','REEL','SHORT','SELLER_REFERRAL'));
   ALTER TABLE growth_shares DROP CONSTRAINT growth_shares_campaign_type_check;
   ALTER TABLE growth_shares ADD CONSTRAINT growth_shares_campaign_type_check CHECK(campaign_type IN ('organic_share','organic_invite','organic_referral'));`,
  `ALTER TABLE growth_events DROP CONSTRAINT growth_events_event_type_check;
   ALTER TABLE growth_events ADD CONSTRAINT growth_events_event_type_check CHECK(event_type IN (
     'product_share_created','product_share_opened','shared_product_viewed','shared_product_saved','shared_product_message_started','shared_product_order_started','shared_product_reshared',
     'room_invite_created','room_invite_opened','room_invite_requested','room_invite_accepted','room_participation_started','first_vote','first_comment','first_product_added','first_product_viewed','first_order_started','new_room_created_from_invited_user','room_shortlist_created','room_poll_closed','room_invite_reported','room_inviter_blocked',
     'content_share_created','content_share_opened','shared_content_viewed','shared_content_saved','shared_content_followed','shared_content_reshared',
     'seller_referral_created','seller_referral_opened','seller_signup','seller_first_product','seller_first_value_event'));`,
  `CREATE TABLE growth_referral_receipts (
     share_id TEXT NOT NULL REFERENCES growth_shares(id) ON DELETE CASCADE,
     recipient_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
     measurement_enabled BOOLEAN NOT NULL DEFAULT TRUE,
     session_actor_key TEXT NOT NULL CHECK(session_actor_key ~ '^[a-f0-9]{64}$'),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(share_id,recipient_username));`,
  `CREATE INDEX growth_referral_receipts_user ON growth_referral_receipts(recipient_username,created_at);`,
  `CREATE INDEX growth_referral_shares_pending ON growth_shares(created_at) WHERE content_type='SELLER_REFERRAL' AND measurement_enabled;
   CREATE INDEX growth_referral_receipts_pending ON growth_referral_receipts(created_at,share_id) WHERE measurement_enabled;`,
  `ALTER TABLE products ADD COLUMN first_approved_at TIMESTAMPTZ;
   CREATE FUNCTION winga_record_first_approval() RETURNS trigger AS $$ BEGIN
     IF TG_OP='UPDATE' THEN
       IF OLD.first_approved_at IS NOT NULL THEN NEW.first_approved_at:=OLD.first_approved_at;
       ELSIF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN NEW.first_approved_at:=clock_timestamp();
       ELSE NEW.first_approved_at:=NULL; END IF;
     ELSIF NEW.status='approved' AND NEW.created_at>=clock_timestamp()-INTERVAL '5 minutes' AND NEW.created_at<=clock_timestamp()+INTERVAL '1 minute' THEN NEW.first_approved_at:=clock_timestamp();
     ELSE NEW.first_approved_at:=NULL; END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql;
   CREATE TRIGGER winga_record_first_approval BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION winga_record_first_approval();
   CREATE INDEX products_first_approval_owner ON products(uploaded_by,first_approved_at) WHERE first_approved_at IS NOT NULL;`
])});
