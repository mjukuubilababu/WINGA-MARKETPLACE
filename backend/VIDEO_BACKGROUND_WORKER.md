# Video Background Worker

Winga separates video HTTP traffic from background processing.

- The API creates direct uploads, accepts signed Cloudflare Stream webhooks, enqueues safety work, and serves status/playback contracts.
- `backend/video-background-worker.js` dispatches safety jobs and removes abandoned provider media.
- PostgreSQL is the durable queue and lease authority. `FOR UPDATE SKIP LOCKED` lets multiple workers claim disjoint batches.
- A completion is accepted only from the current `locked_by` owner. Expired leases are reclaimable.
- Safety and cleanup retries are bounded. Exhausted work becomes visible through dead-letter health metrics.

## Render service

Create one **Background Worker** in the existing Winga Render workspace. Do not create another web service.

- Name: `winga-video-background-worker`
- Repository: the same Winga Git repository
- Branch: `master`
- Root directory: empty (repository root)
- Build command: `npm ci`
- Start command: `npm run worker:video`
- Auto deploy: enabled
- Health check path: none (Background Workers do not expose HTTP)

Attach the same secret Environment Group used by the backend for:

- `DATABASE_URL`
- `DATABASE_SSL`
- `CLOUDFLARE_STREAM_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `CLOUDFLARE_STREAM_CUSTOMER_CODE`
- `CLOUDFLARE_STREAM_SIGNING_KEY_ID` and `CLOUDFLARE_STREAM_SIGNING_JWK` when local signing is enabled
- `VIDEO_SAFETY_SCAN_WEBHOOK_URL`
- `VIDEO_SAFETY_SCAN_WEBHOOK_SECRET`

The worker does not need the Stream webhook secret or the video-safety result callback secret. Those remain on the API service.

Recommended production variables:

```text
VIDEO_BACKGROUND_INTERVAL_MS=30000
VIDEO_WORKER_HEARTBEAT_INTERVAL_MS=15000
VIDEO_SAFETY_DISPATCH_BATCH_SIZE=10
VIDEO_SAFETY_DISPATCH_CONCURRENCY=3
VIDEO_SAFETY_DISPATCH_TIMEOUT_MS=10000
VIDEO_SAFETY_LEASE_SECONDS=600
VIDEO_WORKER_MAX_SAFETY_BATCHES_PER_TICK=4
VIDEO_WORKER_TICK_BUDGET_MS=25000
VIDEO_WORKER_BATCH_YIELD_MS=25
VIDEO_WORKER_PRESSURE_INTERVAL_MS=1000
VIDEO_WORKER_POLL_JITTER_MS=500
VIDEO_CLEANUP_SWEEP_INTERVAL_MS=600000
VIDEO_CLEANUP_SWEEP_BATCH_SIZE=25
VIDEO_CLEANUP_LEASE_SECONDS=600
VIDEO_CLEANUP_MAX_ATTEMPTS=8
VIDEO_CLEANUP_REQUEST_TIMEOUT_MS=15000
VIDEO_FAILED_RETENTION_DAYS=7
VIDEO_CLEANUP_RETRY_SECONDS=3600
```

## Activation and scale

1. Deploy the backend first so the versioned migration creates lease and heartbeat columns.
2. Start one Background Worker and wait for an `idle` heartbeat.
3. Run `npm run monitor:video` with `OPS_HEALTH_TOKEN`.
4. Confirm `activeVideoWorkers >= 1`, no cleanup dead letters, and readiness `ready`.
5. Increase the Render Background Worker instance count to add capacity. No API or Product contract changes are required.

Set `VIDEO_WORKER_MIN_ACTIVE` on the API service to the minimum fleet size expected by operations. Keep `VIDEO_WORKER_HEARTBEAT_MAX_AGE_SECONDS` above at least two heartbeat intervals.

## Backpressure

Each worker claims at most `VIDEO_SAFETY_DISPATCH_BATCH_SIZE` rows at once, sends at most `VIDEO_SAFETY_DISPATCH_CONCURRENCY` scans concurrently, and drains only a bounded number of batches within a bounded tick budget. Jobs beyond that budget remain durable in PostgreSQL for this or another worker. No API request waits for this drain loop.

Configure these API-service alert thresholds for the expected fleet and provider plan:

```text
VIDEO_PROCESSING_QUEUE_DEPTH_ALERT_THRESHOLD=10000
VIDEO_SAFETY_QUEUE_DEPTH_ALERT_THRESHOLD=1000
VIDEO_SAFETY_QUEUE_AGE_ALERT_SECONDS=300
VIDEO_CLEANUP_QUEUE_DEPTH_ALERT_THRESHOLD=1000
```

A sustained `video_safety_queue_depth_exceeded`, `video_safety_queue_age_exceeded`, or saturated-worker heartbeat means capacity should be increased or provider throttling investigated. Scale worker instances before increasing per-instance concurrency beyond the downstream safety provider's documented quota.

## Retry and idempotency

A Stream webhook update is monotonic. Uploading and processing may advance to a terminal state, while ready and failed cannot regress because of a late provider event. Empty retry fields never erase a persisted poster or HLS/DASH rendition. An identical webhook is acknowledged without changing row_version; a later same-state webhook may still enrich a missing or changed provider URL.

Safety callbacks use the provider result ID as the durable idempotency boundary. The first valid result updates the upload, product media, and safety job in one transaction. An exact retry returns success without repeating those writes or appending another applied-result audit. A different result for an already-decided video is a conflict and requires operator investigation.

## Failure behavior

A worker crash leaves its lease in PostgreSQL. Another worker reclaims safety or cleanup work after the bounded lease expires. A stale worker cannot complete a reclaimed job because completion is scoped to `locked_by`. Cloudflare deletion treats HTTP 404 as success, making repeated cleanup safe.

The marketplace remains available if the worker fleet is down: upload, feed, search, checkout, and playback routes continue serving. The ops video-health endpoint becomes degraded so the outage is visible before the backlog grows silently.

## Dead-letter recovery

Use the recovery endpoint only after the provider URL and matching scan/result secrets have been verified on the API, background worker, and safety adapter. It is protected by `OPS_HEALTH_TOKEN`, requires an explicit confirmation phrase, records an audit event, and never runs on the marketplace request path.

Retry one job first:

```bash
curl -sS -X POST \
  "https://winga-pflp.onrender.com/api/ops/media/videos/recover" \
  -H "X-Ops-Health-Token: $OPS_HEALTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"confirmation":"recover-video-operations","retryDeadLimit":1,"pruneStaleWorkers":true,"staleWorkerAgeSeconds":60,"staleWorkerLimit":100}'
```

Wait for the worker to process the canary, then run `npm run monitor:video`. Continue only when `safetySubmitted` or `safetyCompleted` increases and there is no new retry job. Retry the remaining dead letters with `retryDeadLimit` capped at `100`, monitor each batch, and stop if failures or queue age increase. Stale heartbeat pruning deletes only workers whose last heartbeat is older than the supplied threshold; it does not stop or modify an active worker.

## One-shot verification

Use this only for deployment verification or controlled maintenance:

```bash
npm run worker:video:once
```

Do not schedule overlapping one-shot jobs as a replacement for the continuously running worker fleet.