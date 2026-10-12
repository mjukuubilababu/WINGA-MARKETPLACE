module.exports=Object.freeze({id:'202610122000_growth_internal_share_context_v1',statements:Object.freeze([
  `CREATE TABLE growth_internal_shares (
     share_id TEXT PRIMARY KEY REFERENCES growth_shares(id) ON DELETE CASCADE,
     message_id TEXT NOT NULL REFERENCES encrypted_conversation_messages(id) ON DELETE CASCADE,
     content_type TEXT NOT NULL CHECK(content_type IN ('PRODUCT','COLLECTION','REEL','SHORT')),
     content_id TEXT NOT NULL,
     UNIQUE(message_id,content_type,content_id));`,
  `CREATE INDEX growth_internal_shares_message ON growth_internal_shares(message_id);`
])});
