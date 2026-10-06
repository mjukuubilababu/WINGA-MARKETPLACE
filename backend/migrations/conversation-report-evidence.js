module.exports=Object.freeze({
  id:"2026100603_conversation_report_evidence",
  statements:Object.freeze([
    `CREATE TABLE IF NOT EXISTS conversation_report_evidence (
      report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
      consent TEXT NOT NULL CHECK(consent='share-selected-message-evidence-v1'),
      selection JSONB NOT NULL CHECK(jsonb_typeof(selection)='array' AND jsonb_array_length(selection) BETWEEN 1 AND 10),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(reporter_id,request_id)
    );`,
    `CREATE TABLE IF NOT EXISTS conversation_report_evidence_reads (
      id BIGSERIAL PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES conversation_report_evidence(report_id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL REFERENCES users(username),
      reviewer_role TEXT NOT NULL CHECK(reviewer_role IN ('admin','moderator')),
      reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,
    "CREATE INDEX IF NOT EXISTS idx_conversation_report_evidence_reads ON conversation_report_evidence_reads(report_id,created_at);"
  ])
});
