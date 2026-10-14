module.exports=Object.freeze({id:'2026101401_conversation_activity_preferences',statements:Object.freeze([
  `CREATE TABLE conversation_activity_preferences(owner_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
    share_activity BOOLEAN NOT NULL DEFAULT FALSE,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
    last_request_id TEXT,last_request_hash TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`
])});
