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
VIDEO_SAFETY_DISPATCH_TIMEOUT_MS=10000
VIDEO_SAFETY_LEASE_SECONDS=600
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

## Failure behavior

A worker crash leaves its lease in PostgreSQL. Another worker reclaims safety or cleanup work after the bounded lease expires. A stale worker cannot complete a reclaimed job because completion is scoped to `locked_by`. Cloudflare deletion treats HTTP 404 as success, making repeated cleanup safe.

The marketplace remains available if the worker fleet is down: upload, feed, search, checkout, and playback routes continue serving. The ops video-health endpoint becomes degraded so the outage is visible before the backlog grows silently.

## One-shot verification

Use this only for deployment verification or controlled maintenance:

```bash
npm run worker:video:once
```

Do not schedule overlapping one-shot jobs as a replacement for the continuously running worker fleet.