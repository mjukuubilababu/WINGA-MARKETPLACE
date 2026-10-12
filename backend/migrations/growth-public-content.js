module.exports=Object.freeze({id:'202610121640_growth_public_content_v1',statements:Object.freeze([
  `ALTER TABLE growth_shares DROP CONSTRAINT growth_shares_content_type_check;`,
    `ALTER TABLE growth_shares ADD CONSTRAINT growth_shares_content_type_check CHECK(content_type IN ('PRODUCT','SHOPPING_ROOM','PROFILE','COLLECTION','REEL','SHORT'));`,
  `ALTER TABLE growth_events DROP CONSTRAINT growth_events_event_type_check;`,
    `ALTER TABLE growth_events ADD CONSTRAINT growth_events_event_type_check CHECK(event_type IN (
     'product_share_created','product_share_opened','shared_product_viewed','shared_product_saved','shared_product_message_started','shared_product_order_started','shared_product_reshared',
     'room_invite_created','room_invite_opened','room_invite_requested','room_invite_accepted','room_participation_started','first_vote','first_comment','first_product_added','first_product_viewed','first_order_started','new_room_created_from_invited_user','room_shortlist_created','room_poll_closed','room_invite_reported','room_inviter_blocked',
     'content_share_created','content_share_opened','shared_content_viewed','shared_content_saved','shared_content_followed','shared_content_reshared'));`
])});
