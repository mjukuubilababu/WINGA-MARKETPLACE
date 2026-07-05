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

- Keep `INTELLIGENCE_QUEUE_EMBEDDED_WORKER=true` on the API.
- Monitor `/api/admin/ops/summary`.

For larger production:

- Set API env:
  - `INTELLIGENCE_QUEUE_EMBEDDED_WORKER=false`
- Deploy a separate worker service:
  - Command: `npm run worker:intelligence`
- Use the same `DATABASE_URL` and `DATABASE_SSL=true`.

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
- `INTELLIGENCE_QUEUE_BATCH_SIZE=50`
- `INTELLIGENCE_QUEUE_INTERVAL_MS=5000`
- `INTELLIGENCE_QUEUE_MAX_ATTEMPTS=12`
- `INTELLIGENCE_QUEUE_STALE_SECONDS=300`
- `INTELLIGENCE_QUEUE_COMPLETED_RETENTION_HOURS=72`
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

## Monitoring Endpoint

Use the lightweight queue health endpoint for uptime and alert monitors:

```bash
curl https://winga-pflp.onrender.com/api/ops/intelligence/queue-health \
  -H "X-Ops-Health-Token: $OPS_HEALTH_TOKEN"
```

It returns only operational queue state:

- readiness: `ready`, `watch`, `degraded`, `critical`, or `unavailable`
- worker counters and timestamps
- pending, processing, failed, completed, and dead counts
- oldest pending/failed/processing ages
- threshold-based alerts

It does not expose buyer data, product events, seller private data, or raw
intelligence payloads.

Recommended monitor policy:

- HTTP 200 and `readiness=ready`: healthy.
- HTTP 200 and `readiness=watch/degraded`: alert engineering, marketplace can keep running.
- HTTP 503 or `readiness=critical/unavailable`: page engineering and inspect the queue.

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
