const crypto = require("crypto");
const {
  PRODUCT_SIGNAL_WEIGHTS, SELLER_SIGNAL_WEIGHTS, CONTRIBUTION_WINDOW_MS,
  MAX_CONTRIBUTIONS_PER_WINDOW, normalizeEventType, getSignalQuality,
  getActorKey, getScoreTargetKey
} = require("./intelligence-platform");

const SCORING_VERSION = "event_delta_v2";
const SCORE_RETENTION_DAYS = 180;
const TARGETS = Object.freeze([
  { type: "product", table: "product_intelligence_scores", id: "product_id", weights: PRODUCT_SIGNAL_WEIGHTS },
  { type: "seller", table: "seller_intelligence_scores", id: "seller_id", weights: SELLER_SIGNAL_WEIGHTS }
]);

// The caller owns BEGIN/COMMIT. Snapshots from producers are deliberately ignored.
async function persistIntelligenceEvent(client, input) {
  if (!input?.eventId || String(input.eventId).length > 200) throw new TypeError("Invalid intelligence event ID.");
  const timestamp = new Date(input.timestamp);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError("Invalid intelligence event timestamp.");
  const event = { ...input, timestamp: timestamp.toISOString(), eventType: normalizeEventType(input.sourceEvent || input.eventType) };
  const quality = getSignalQuality(event);
  const receipt = await client.query(
    `INSERT INTO intelligence_score_receipts (event_id, happened_at, scoring_version)
     SELECT $1, $2::timestamptz, $3
     WHERE $2::timestamptz >= NOW() - INTERVAL '180 days'
       AND $2::timestamptz <= NOW() + INTERVAL '5 minutes'
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.eventId, event.timestamp, SCORING_VERSION]
  );
  const metadata = {
    ...(event.metadata || {}), signalQuality: quality, scoringVersion: SCORING_VERSION,
    eventContract: {
      schemaVersion: String(event.schemaVersion || "").slice(0, 80),
      domain: String(event.domain || "observability").slice(0, 40),
      entityType: String(event.entityType || "unknown").slice(0, 40),
      actorType: String(event.actorType || "person_or_session").slice(0, 40),
      outcome: String(event.outcome || "observed").slice(0, 60)
    },
    marketContext: {
      country: String(event.marketCountry || "").slice(0, 2),
      language: String(event.language || "").slice(0, 40),
      locale: String(event.locale || "").slice(0, 40),
      timezone: String(event.timezone || "").slice(0, 80)
    }
  };
  await client.query(
    `INSERT INTO intelligence_events (
       event_id, event_type, source_event, happened_at, product_id, seller_id,
       buyer_id, session_id, feed_context, location, device_type, app_version,
       level, category, alert_severity, metadata, platform_version
     ) VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.eventId, event.eventType, event.sourceEvent || "", event.timestamp,
      event.productId || "", event.sellerId || "", event.buyerId || "", event.sessionId || "",
      event.feedContext || "", event.location || "", event.deviceType || "", event.appVersion || "",
      event.level || "", event.category || "", event.alertSeverity || "", JSON.stringify(metadata), event.platformVersion || ""]
  );
  if (!receipt.rows?.length) return { applied: false, reason: "duplicate_or_outside_scoring_window" };

  await client.query("SELECT set_config('winga.intelligence_score_writer', $1, TRUE)", [SCORING_VERSION]);
  let appliedTargets = 0;
  const bucketStart = Math.floor(timestamp.getTime() / CONTRIBUTION_WINDOW_MS) * CONTRIBUTION_WINDOW_MS;
  for (const target of TARGETS) {
    const id = getScoreTargetKey(event, target.type);
    const delta = Number(target.weights[event.eventType] || 0);
    if (!id || !delta) continue;
    const bucketKey = crypto.createHash("sha256")
      .update(JSON.stringify([target.type, event.eventType, id, getActorKey(event), bucketStart])).digest("hex");
    const budget = await client.query(
      `INSERT INTO intelligence_score_windows (bucket_key, bucket_start, contributions)
       VALUES ($1, $2::timestamptz, 1)
       ON CONFLICT (bucket_key) DO UPDATE SET contributions = intelligence_score_windows.contributions + 1
       WHERE intelligence_score_windows.contributions < $3 RETURNING contributions`,
      [bucketKey, new Date(bucketStart).toISOString(), MAX_CONTRIBUTIONS_PER_WINDOW]
    );
    if (!budget.rows?.length) continue;
    // Signed totals make negative contributions independent of queue delivery order.
    // Only the public score is clamped; existing numeric(12,2) output stays bounded.
    await client.query(
      `INSERT INTO ${target.table} (${target.id}, score_total, score, signals, first_seen_at, last_seen_at, updated_at)
       VALUES ($1, $2::numeric, GREATEST(0, $2::numeric), jsonb_build_object($3::text, 1), $4::timestamptz, $4::timestamptz, NOW())
       ON CONFLICT (${target.id}) DO UPDATE SET
         score_total = ${target.table}.score_total + EXCLUDED.score_total,
         score = LEAST(9999999999.99, GREATEST(0, ${target.table}.score_total + EXCLUDED.score_total)),
         signals = COALESCE(${target.table}.signals, '{}'::jsonb) || jsonb_build_object(
           $3::text, COALESCE((${target.table}.signals->>$3)::bigint, 0) + 1),
         first_seen_at = LEAST(${target.table}.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(${target.table}.last_seen_at, EXCLUDED.last_seen_at),
         updated_at = NOW()`,
      [id, delta, event.eventType, event.timestamp]
    );
    appliedTargets += 1;
  }
  return { applied: true, appliedTargets };
}

async function pruneIntelligenceScoreState(client) {
  const receipts = await client.query(
    `WITH expired AS (
       SELECT event_id FROM intelligence_score_receipts WHERE happened_at < NOW() - INTERVAL '180 days'
       ORDER BY happened_at LIMIT 10000 FOR UPDATE SKIP LOCKED
     ) DELETE FROM intelligence_score_receipts receipt USING expired WHERE receipt.event_id = expired.event_id`
  );
  const windows = await client.query(
    `WITH expired AS (
       SELECT bucket_key FROM intelligence_score_windows
       WHERE bucket_start < NOW() - INTERVAL '180 days 10 minutes'
       ORDER BY bucket_start LIMIT 10000 FOR UPDATE SKIP LOCKED
     ) DELETE FROM intelligence_score_windows bucket USING expired WHERE bucket.bucket_key = expired.bucket_key`
  );
  return { receipts: Number(receipts.rowCount || receipts.affectedRows || 0), windows: Number(windows.rowCount || windows.affectedRows || 0) };
}

module.exports = { SCORING_VERSION, SCORE_RETENTION_DAYS, persistIntelligenceEvent, pruneIntelligenceScoreState };
