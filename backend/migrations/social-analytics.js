module.exports = Object.freeze({
  id: "2026091507_social_analytics_daily",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS social_analytics_daily (
       event_date DATE NOT NULL DEFAULT CURRENT_DATE,
       event_name TEXT NOT NULL CHECK (event_name IN (
         'follow_created', 'follow_removed', 'suggested_follow_impression',
         'suggested_follow_accept', 'profile_from_follow_click'
       )),
       source TEXT NOT NULL DEFAULT 'organic',
       event_count BIGINT NOT NULL DEFAULT 0 CHECK (event_count >= 0),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (event_date, event_name, source)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_social_analytics_event_recent
     ON social_analytics_daily (event_name, event_date DESC);`
  ])
});
