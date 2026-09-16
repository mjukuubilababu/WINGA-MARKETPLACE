module.exports = Object.freeze({
  id: "2026091605_message_pages",
  statements: Object.freeze([
    `CREATE INDEX IF NOT EXISTS idx_messages_sender_partner_cursor ON messages(sender_id, receiver_id, timestamp DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_receiver_partner_cursor ON messages(receiver_id, sender_id, timestamp DESC, id DESC)`
  ])
});
