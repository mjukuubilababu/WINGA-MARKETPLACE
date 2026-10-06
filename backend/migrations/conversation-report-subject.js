module.exports=Object.freeze({
  id:'2026100604_conversation_report_subject',
  statements:Object.freeze([
    "ALTER TABLE conversation_report_evidence ADD COLUMN IF NOT EXISTS subject JSONB;",
    "CREATE INDEX IF NOT EXISTS idx_conversation_report_evidence_reporter ON conversation_report_evidence(reporter_id,created_at);"
  ])
});
