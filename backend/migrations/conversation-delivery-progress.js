module.exports = Object.freeze({
  id: "2026100101_conversation_delivery_progress",
  statements: Object.freeze([
    `ALTER TABLE conversation_device_deliveries
      ADD COLUMN IF NOT EXISTS enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
    `CREATE TABLE IF NOT EXISTS conversation_device_progress (
      device_id TEXT NOT NULL REFERENCES conversation_delivery_devices(device_id),
      conversation_id TEXT NOT NULL REFERENCES conversation_event_streams(id),
      acknowledged_position BIGINT NOT NULL DEFAULT 0 CHECK (acknowledged_position >= 0),
      PRIMARY KEY(device_id, conversation_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_delivery_acked_age
      ON conversation_device_deliveries(acknowledged_at)
      WHERE acknowledged_at IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_delivery_pending_age
      ON conversation_device_deliveries(enqueued_at)
      WHERE acknowledged_at IS NULL AND cancelled_at IS NULL;`
  ])
});
