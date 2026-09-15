module.exports = Object.freeze({
  id: "2026091506_social_notification_frequency",
  statements: Object.freeze([
    `CREATE INDEX IF NOT EXISTS idx_notifications_content_recipient_recent
     ON notifications (user_id, created_at DESC)
     WHERE type = 'content';`
  ])
});
