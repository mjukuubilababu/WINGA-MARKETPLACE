# Winga Intelligence Queue Runbook

## Current Production Mode

Winga now uses a PostgreSQL durable outbox for intelligence events:

1. API receives a marketplace intelligence signal.
2. The signal is normalized by `backend/intelligence-platform.js`.
3. The API writes the job to `intelligence_event_queue`.
4. A queue worker claims jobs with `FOR UPDATE SKIP LOCKED`.
5. The worker writes canonical rows into `intelligence_events`, `product_intelligence_scores`, and `seller_intelligence_scores`.
6. Jobs are marked `completed`, `failed`, or `dead`.

This is safe for production because events survive API restarts and failed jobs can retry.

## Recommended Deployment

For small and medium production:

- Keep `INTELLIGENCE_QUEUE_PROCESSOR_MODE=primary` on the API.
- Monitor `/api/admin/ops/summary`.

For larger production, make the external worker primary and keep the API as a
bounded standby fallback:

- Set API env:
  - `INTELLIGENCE_QUEUE_PROCESSOR_MODE=standby`
  - `INTELLIGENCE_QUEUE_STANDBY_AFTER_SECONDS=180`
  - `INTELLIGENCE_QUEUE_STANDBY_CHECK_INTERVAL_MS=60000`
- Deploy a separate worker service:
  - Command: `npm run worker:intelligence`
- Use the same `DATABASE_URL` and `DATABASE_SSL=true`.
- The API will not claim fresh jobs while the external worker is healthy. It only
  drains jobs after they have aged past the standby threshold or processing has
  stalled.

For fully isolated processing after the external worker is proven stable:

- Set API env:
  - `INTELLIGENCE_QUEUE_PROCESSOR_MODE=off`
- Keep external worker health and queue alerts active before using this mode.

Legacy env support:

- `INTELLIGENCE_QUEUE_EMBEDDED_WORKER=false` still maps to processor mode `off`
  when `INTELLIGENCE_QUEUE_PROCESSOR_MODE` is not set.
- Prefer `INTELLIGENCE_QUEUE_PROCESSOR_MODE` for new deployments.

For scheduled drain/smoke:

- Command: `npm run worker:intelligence:once`

## Cloudflare Queue Binding

The Cloudflare Queue consumer is deployed with `wrangler.intelligence.toml`.
Use this dedicated config so the queue worker never deploys Vercel/static frontend
assets and never reads `public/_redirects`.

- Producer queue: `winga-intelligence-events`
- Producer binding: `WINGA_INTELLIGENCE_QUEUE`
- Consumer queue: `winga-intelligence-events`
- Dead-letter queue: `winga-intelligence-events-dlq`

Set the shared queue webhook secret in Cloudflare:

```bash
npx wrangler secret put QUEUE_WEBHOOK_SECRET --config wrangler.intelligence.toml
```

Set the same value in the backend environment:

```text
QUEUE_WEBHOOK_SECRET=<same-secret-value>
```

The Cloudflare queue consumer forwards messages to:

```text
https://winga-pflp.onrender.com/api/intelligence/queue-events
```

Deploy only the queue worker with:

```bash
npx wrangler deploy --config wrangler.intelligence.toml
```

Do not use plain `npx wrangler deploy` for the queue worker. The root
`wrangler.toml` may include full app/asset settings from the older edge worker
path, while the production frontend is deployed through Vercel.

```text
POST /api/intelligence/queue-events
```

The backend rejects that endpoint unless `X-Winga-Queue-Secret` matches `QUEUE_WEBHOOK_SECRET`.

## Required Environment Variables

- `DATABASE_URL`
- `DATABASE_SSL=true`
- `QUEUE_WEBHOOK_SECRET`
- `INTELLIGENCE_QUEUE_PROCESSOR_MODE=primary|standby|off`
- `INTELLIGENCE_QUEUE_STANDBY_AFTER_SECONDS=180`
- `INTELLIGENCE_QUEUE_STANDBY_CHECK_INTERVAL_MS=60000`
- `INTELLIGENCE_QUEUE_BATCH_SIZE=50`
- `INTELLIGENCE_QUEUE_INTERVAL_MS=5000`
- `INTELLIGENCE_QUEUE_MAX_ATTEMPTS=12`
- `INTELLIGENCE_QUEUE_STALE_SECONDS=300`
- `INTELLIGENCE_QUEUE_COMPLETED_RETENTION_HOURS=72`
- `INTELLIGENCE_RAW_EVENT_RETENTION_DAYS=180`
- `DEMAND_RAW_EVENT_RETENTION_DAYS=730`
- `SEARCH_DEMAND_RAW_EVENT_RETENTION_DAYS=365`
- `INTELLIGENCE_SNAPSHOT_WINDOW_DAYS=14`
- `INTELLIGENCE_SNAPSHOT_RETENTION_DAYS=1095`
- `INTELLIGENCE_SNAPSHOT_STALE_SECONDS=93600`
- `INTELLIGENCE_QUEUE_PENDING_ALERT_THRESHOLD=1000`
- `INTELLIGENCE_QUEUE_FAILED_ALERT_THRESHOLD=25`
- `INTELLIGENCE_QUEUE_DEAD_ALERT_THRESHOLD=1`
- `INTELLIGENCE_QUEUE_PENDING_AGE_ALERT_SECONDS=300`
- `INTELLIGENCE_QUEUE_FAILED_AGE_ALERT_SECONDS=900`
- `INTELLIGENCE_QUEUE_PROCESSING_AGE_ALERT_SECONDS=600`
- `OPS_HEALTH_TOKEN=<strong-random-token>`
- `CLIENT_EVENT_DEDUPE_TTL_MS=30000`
- `CLIENT_EVENT_DEDUPE_MAX_KEYS=50000`
- `CLIENT_EVENT_BOT_DROP_ENABLED=true`

## Ingestion Protection

Client intelligence events are protected before they enter scoring or durable
queue persistence:

- repeated identical events from the same identity are deduped for a bounded TTL
- obvious anonymous automation user agents are dropped before scoring
- rejected/dropped events return HTTP 202 so telemetry never blocks the app
- dropped events are recorded as `client_event_dropped` audit entries
- accepted events return `{ ok: true, accepted: true }`
- dropped events return `{ ok: true, accepted: false, reason: "..." }`

This protects recommendation scores, demand analytics, seller quality signals,
and market intelligence from accidental loops and basic spam without breaking
Home Feed, image loading, checkout, or messaging.

## Scoring Quality Guardrails

Canonical intelligence events are append-only history, but not every event is
allowed to move product or seller scores.

Scoring now applies these guardrails:

- unknown event types are recorded but do not affect product/seller scores
- scoreable product signals require a product id
- scoreable seller signals require a seller id
- each event carries a `signalQuality` envelope in metadata
- repeated score contributions from the same actor/product/event are capped per
  time window
- suppressed contributions increment `queue.scoreSuppressed` in the intelligence
  summary

This keeps recommendations and seller quality scoring fair while preserving raw
learning history for future analytics and AI models.

## Raw Event Retention

Raw intelligence tables are append-only during normal processing, then pruned on
the worker maintenance cycle:

- `intelligence_events`: default 180 days
- `demand_events`: default 730 days
- `search_demand_events`: default 365 days

Retention only deletes raw historical rows older than the configured windows. It
does not delete:

- `product_intelligence_scores`
- `seller_intelligence_scores`
- `product_demand_summaries`

This keeps long-term recommendations, seller demand summaries, and market scores
available while bounding database growth and reducing long-term privacy risk.
Set longer windows only when there is a clear analytics need and a matching
privacy policy.

## Daily Snapshot Aggregation

The worker maintenance cycle refreshes aggregate daily snapshots before raw
event pruning runs. Snapshots are stored in `intelligence_daily_snapshots` and
summarize:

- event type volume from `intelligence_events`
- product demand from `demand_events`
- search demand from `search_demand_events`

Defaults:

- `INTELLIGENCE_SNAPSHOT_WINDOW_DAYS=14`
- `INTELLIGENCE_SNAPSHOT_RETENTION_DAYS=1095`
- `INTELLIGENCE_SNAPSHOT_STALE_SECONDS=93600`

Snapshots are aggregate-only and safe for admin operations, market intelligence,
seller insights, and future recommendation features. They do not store buyer
identity lists and they do not run on the Home Feed critical path.

The queue health endpoint also reports `snapshotHealth`. It alerts when recent
raw intelligence exists but daily snapshots are missing or stale, while staying
quiet for truly empty systems with no recent intelligence events.

## Feed Intelligence Safety

Home Feed intelligence is a ranking layer only. It must never replace backend
pagination or remove already-loaded products.

Feed ranking uses bounded score budgets:

- personalization budget: followed sellers, style, nearby, and recommendation
- market demand budget: market trends, demand summaries, and variant richness
- engagement budget: views, likes, saves, messages, orders, and trending velocity
- seller quality budget: trust, quality, and activity snapshots

Fresh products keep protected top slots. Seller diversity is enforced in early
slots, while fallback still returns all page products so endless scroll,
retention, and product identity remain stable.

Feed ranking also exposes non-private diagnostics for verification:

- input, unique, output, and duplicate counts
- protected fresh slot count
- top seller concentration across early slots
- active ranking budgets

Diagnostics are summary-only and must not expose private buyer behavior.

## Monitoring Endpoint

Use the lightweight queue health endpoint for uptime and alert monitors:

```bash
curl https://winga-pflp.onrender.com/api/ops/intelligence/queue-health \
  -H "X-Ops-Health-Token: $OPS_HEALTH_TOKEN"
```

It returns only operational queue state:

- schema/version/privacy markers for monitor compatibility
- readiness: `ready`, `watch`, `degraded`, `critical`, or `unavailable`
- worker counters and timestamps
- pending, processing, failed, completed, and dead counts
- oldest pending/failed/processing ages
- threshold-based alerts

It does not expose buyer data, product events, seller private data, or raw
intelligence payloads.

## Admin Ops Snapshot

Admin users can inspect a sanitized intelligence snapshot through:

```text
GET /api/admin/ops/summary
```

The response includes `intelligence.opsSnapshot`, which is safe for admin UI and
monitoring surfaces:

- queue readiness and processor mode
- pending, processing, failed, and dead counts
- oldest pending and processing age
- processed job count and standby fallback counters
- top event types, top products, and top sellers as aggregate ids/scores only

The snapshot must not expose raw `event_payload`, `score_payload`, private buyer
behavior, or queue message bodies. Use the recovery endpoints for incident work
and inspect raw data directly in the database only during controlled ops
incidents.

Recommended monitor policy:

- HTTP 200 and `readiness=ready`: healthy.
- HTTP 200 and `readiness=watch/degraded`: alert engineering, marketplace can keep running.
- HTTP 503 or `readiness=critical/unavailable`: page engineering and inspect the queue.

## External Alert Command

Use the production monitor script from any trusted command runner, scheduled job,
or CI monitor:

```bash
OPS_HEALTH_TOKEN="$OPS_HEALTH_TOKEN" npm run monitor:intelligence
```

Optional environment:

```bash
INTELLIGENCE_HEALTH_URL=https://winga-pflp.onrender.com/api/ops/intelligence/queue-health
INTELLIGENCE_HEALTH_TIMEOUT_MS=15000
INTELLIGENCE_HEALTH_WARN_AS_SUCCESS=false
INTELLIGENCE_ALERT_WEBHOOK_URL=https://example.com/winga-alert-webhook
```

Exit codes:

- `0`: ready
- `1`: watch/degraded, alert engineering
- `2`: critical/unavailable or non-2xx health response
- `3`: missing monitor token/config
- `4`: network timeout or monitor runtime failure

The script prints sanitized JSON only. It never prints the ops token, raw queue
payloads, buyer behavior, or private event metadata.

If `INTELLIGENCE_ALERT_WEBHOOK_URL` is set, the monitor sends a sanitized JSON
POST only when readiness is not `ready`. The webhook payload contains readiness,
safe queue counts, worker counters, alert types, and timestamps only.

## GitHub Scheduled Health Check

The repository includes `.github/workflows/intelligence-health.yml`.

Required GitHub repository secret:

```text
OPS_HEALTH_TOKEN=<same value used by the backend health endpoint>
```

Optional GitHub repository secret:

```text
INTELLIGENCE_ALERT_WEBHOOK_URL=<Slack/Discord/BetterStack/Make/Zapier webhook>
```

The workflow runs every 15 minutes and can also be started manually from GitHub
Actions. It runs:

```bash
npm run monitor:intelligence
```

Expected behavior:

- healthy queue: workflow passes
- watch/degraded queue: workflow fails with exit code `1`
- critical/unavailable queue: workflow fails with exit code `2`
- missing secret: workflow fails with exit code `3`

Use GitHub notification rules, email, or a connected incident tool so failed
scheduled runs page engineering automatically.

## Incident Severity And Response

| Readiness | Severity | User impact | Action |
| --- | --- | --- | --- |
| `ready` | healthy | none | no action |
| `watch` | low | intelligence delay risk only | review within business hours |
| `degraded` | high | recommendations/analytics may lag | inspect worker logs and queue health soon |
| `critical` | critical | intelligence processing is blocked | page engineering immediately |
| `unavailable` | critical | monitoring cannot read queue health | page engineering immediately |

First-response checklist:

1. Run `OPS_HEALTH_TOKEN="$OPS_HEALTH_TOKEN" npm run monitor:intelligence`.
2. Check Render backend/API env: `INTELLIGENCE_QUEUE_PROCESSOR_MODE`.
3. Check Render Background Worker logs for `npm run worker:intelligence`.
4. Inspect `/api/admin/ops/summary` as an admin and confirm `intelligence.opsSnapshot`.
5. If `failed` or `dead` jobs exist, list jobs through the admin recovery endpoint.
6. Retry failed/dead jobs only after confirming the root cause is fixed.
7. Mark jobs dead only for controlled incidents where retrying would repeat failure.

## Admin Recovery Operations

Admin-only queue recovery endpoints are available for incident response. They use
normal admin authentication and CSRF protection, not the read-only ops health
token.

List failed/dead jobs without exposing raw event payloads:

```bash
curl "https://winga-pflp.onrender.com/api/admin/ops/intelligence-queue?status=failed,dead&limit=50" \
  -H "Cookie: winga_auth=<admin-cookie>"
```

Retry failed/dead jobs:

```bash
curl -X POST https://winga-pflp.onrender.com/api/admin/ops/intelligence-queue/retry \
  -H "Cookie: winga_auth=<admin-cookie>" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: <csrf-token>" \
  -d '{"queueIds":[123,124]}'
```

Manually mark stuck jobs dead:

```bash
curl -X POST https://winga-pflp.onrender.com/api/admin/ops/intelligence-queue/dead \
  -H "Cookie: winga_auth=<admin-cookie>" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: <csrf-token>" \
  -d '{"queueIds":[125],"reason":"manual ops quarantine"}'
```

Rules:

- Retry resets attempts to zero and returns jobs to `pending`.
- Retry only affects `failed` and `dead` jobs.
- Mark-dead only affects `pending`, `failed`, and `processing` jobs.
- Completed jobs are immutable through recovery endpoints.
- Recovery endpoints return summaries only and never return raw buyer/event payloads.

## Managed External Queue Upgrade Path

The current Postgres outbox is production-grade and horizontally safe. At very high global traffic, move the transport to a managed queue while keeping the same canonical event schema.

Recommended providers:

1. Cloudflare Queues
   - Best when Winga edge/workers become the ingestion layer.
   - Queue consumer writes to the same Postgres intelligence tables.

2. AWS SQS
   - Best for high-volume durable queueing with dead-letter queues.
   - API publishes canonical event JSON.
   - Worker consumes batches and calls the existing persistence code.

3. Google Pub/Sub
   - Best for analytics-heavy pipelines and BigQuery/warehouse integration.

4. Upstash Redis Streams
   - Best if you want simple serverless REST credentials and consumer groups.

## External Queue Contract

Every queued message must contain:

```json
{
  "event": {
    "eventId": "intel_xxx",
    "eventType": "product_viewed",
    "sourceEvent": "product_clicked",
    "timestamp": "2026-07-04T00:00:00.000Z",
    "productId": "product-1",
    "sellerId": "seller-1",
    "buyerId": "buyer-1",
    "sessionId": "session-or-fingerprint",
    "feedContext": "home-feed",
    "location": "TZ",
    "deviceType": "mobile",
    "appVersion": "20260704",
    "metadata": {}
  },
  "scores": {
    "productScore": {},
    "sellerScore": {}
  }
}
```

The consumer must:

1. Deduplicate by `event.eventId`.
2. Retry transient failures.
3. Send exhausted jobs to a dead-letter queue.
4. Preserve the event schema exactly.
5. Never block the marketplace API.

## Global-Ready Checklist

- Durable queue exists: yes, Postgres outbox.
- Horizontal worker claims: yes, `SKIP LOCKED`.
- Retry/backoff: yes.
- Dead state: yes.
- Stale processing recovery: yes.
- Completed job retention: yes.
- Ops health/alerts: yes.
- Separate worker command: yes.
- External managed queue: guided, requires provider credentials.

## Verdict

Current mode is ready for serious production growth. For global hyperscale, deploy the worker separately first, then migrate the queue transport to Cloudflare Queues, SQS, Pub/Sub, or Redis Streams.
