module.exports=Object.freeze({id:'2026100802_conversation_operation_metrics',statements:Object.freeze([
  `CREATE TABLE IF NOT EXISTS conversation_operation_metrics (
    run_id UUID NOT NULL, hour TIMESTAMPTZ NOT NULL,
    action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 64),
    outcome TEXT NOT NULL CHECK (outcome IN ('success','limited','rejected','unavailable')),
    count BIGINT NOT NULL CHECK (count>0),
    total_duration_ms BIGINT NOT NULL CHECK (total_duration_ms>=0),
    max_duration_ms INTEGER NOT NULL CHECK (max_duration_ms BETWEEN 0 AND 300000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(run_id,hour,action,outcome)
  )`,
  `CREATE INDEX IF NOT EXISTS conversation_operation_metrics_hour ON conversation_operation_metrics(hour)`,
  `CREATE TABLE IF NOT EXISTS conversation_metrics_publishers(run_id UUID PRIMARY KEY,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS conversation_metrics_publishers_updated ON conversation_metrics_publishers(updated_at)`,
  `CREATE INDEX IF NOT EXISTS encrypted_conversation_messages_created ON encrypted_conversation_messages(created_at)`
])});
