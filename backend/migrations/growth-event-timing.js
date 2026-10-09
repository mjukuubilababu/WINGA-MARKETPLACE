module.exports = Object.freeze({
  id: '2026100901_growth_event_timing_v1',
  statements: Object.freeze([
    `ALTER TABLE growth_events ADD COLUMN client_duration_ms INTEGER
      CHECK(client_duration_ms IS NULL OR
        (event_type='shared_product_viewed' AND client_duration_ms BETWEEN 0 AND 300000));`
  ])
});
