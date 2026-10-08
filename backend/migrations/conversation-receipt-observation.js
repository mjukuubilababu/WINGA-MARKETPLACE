module.exports=Object.freeze({id:'2026100801_conversation_receipt_observation',statements:Object.freeze([
  // Earlier receipt times are unknown: do not fabricate them during expansion.
  `ALTER TABLE encrypted_conversation_receipts ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;`,
  `ALTER TABLE encrypted_conversation_receipts ALTER COLUMN recorded_at SET DEFAULT NOW();`
])});
