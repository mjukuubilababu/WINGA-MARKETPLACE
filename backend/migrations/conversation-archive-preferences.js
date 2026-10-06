module.exports = Object.freeze({
  id: "2026100602_conversation_archive_preferences",
  statements: Object.freeze([
    "ALTER TABLE conversation_notification_preferences ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;"
  ])
});
