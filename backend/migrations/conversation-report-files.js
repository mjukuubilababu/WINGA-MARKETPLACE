module.exports=Object.freeze({id:'2026100605_conversation_report_files',statements:Object.freeze([
  `CREATE TABLE IF NOT EXISTS conversation_report_files (
    id UUID PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES conversation_report_evidence(report_id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    bytes INTEGER NOT NULL CHECK(bytes BETWEEN 40 AND 2101288),
    sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
    descriptor JSONB NOT NULL CHECK(jsonb_typeof(descriptor)='object'),
    consent TEXT NOT NULL CHECK(consent='share-selected-file-copies-v1'),
    uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(report_id,message_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_report_files_report ON conversation_report_files(report_id,id);`
])});
