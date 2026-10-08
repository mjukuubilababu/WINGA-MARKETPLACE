const {NAMES}=require('../conversation-experience-store');
module.exports=Object.freeze({id:'2026100802_conversation_experience_metrics',statements:Object.freeze([
  `CREATE TABLE IF NOT EXISTS conversation_experience_publishers(
    run_id UUID PRIMARY KEY,owner_id TEXT NOT NULL,session_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_experience_publisher_session ON conversation_experience_publishers(session_id,owner_id,created_at);`,
  `CREATE TABLE IF NOT EXISTS conversation_experience_metrics(
    run_id UUID NOT NULL REFERENCES conversation_experience_publishers(run_id) ON DELETE CASCADE,
    hour TIMESTAMPTZ NOT NULL,name TEXT NOT NULL CHECK(name IN (${NAMES.map(name=>"'"+name+"'").join(',')})),
    count BIGINT NOT NULL CHECK(count>0 AND count<=1000000000),total_duration_ms BIGINT NOT NULL CHECK(total_duration_ms>=0),
    max_duration_ms INTEGER NOT NULL CHECK(max_duration_ms BETWEEN 0 AND 300000),PRIMARY KEY(run_id,hour,name));`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_experience_hour ON conversation_experience_metrics(hour);`
])});
