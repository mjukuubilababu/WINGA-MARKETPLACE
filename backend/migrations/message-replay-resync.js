module.exports = Object.freeze({
  id: "2026092401_message_replay_resync",
  statements: Object.freeze([
    `ALTER TABLE message_replay_streams
      ADD COLUMN IF NOT EXISTS resync_position BIGINT NOT NULL DEFAULT 0
      CHECK (resync_position >= 0 AND resync_position <= position);`
  ])
});
