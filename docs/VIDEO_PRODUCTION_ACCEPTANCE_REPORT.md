# Winga Video Production Acceptance Report

Date: 2026-09-08
Release commit: dbc794f Add production video acceptance gate
Canonical origin: https://wingamarket.com

## Executive Verdict

The customer-facing video path is production ready. Upload is resumable and idempotent, product rows store metadata instead of video bytes, Cloudflare Stream owns adaptive delivery, signed playback works live, mixed cards preserve image order, and playback failure cannot stop commerce or pagination.

The full system is PARTIAL for global operational acceptance (97%). The only unverified layer is the protected Render background-worker fleet health because OPS_HEALTH_TOKEN and DATABASE_URL are intentionally absent from this workstation. Queue, lease, retry, dead-letter, heartbeat, and monitor code pass tests, but operations must still prove that at least one non-stale production worker is active.

## Phase 40 Implementation Status

| Phase | Status | Evidence |
| --- | --- | --- |
| Repository audit | COMPLETE | Video code, migrations, routes, tests, Workers, and runbooks inventoried. |
| Canonical media/data contract | COMPLETE | products.media_items owns presentation order; video_upload_intents owns provider lifecycle; PostgreSQL stores no video bytes. |
| Upload and storage | COMPLETE | Seller-scoped idempotency, resumable TUS, bounded fallback, replay metadata, and 5 GB validation exist. |
| Queue and processing | PARTIAL | PostgreSQL leases, bounded retries, dead letters, SKIP LOCKED, and heartbeats pass tests; live fleet check remains. |
| Poster and delivery | COMPLETE | Live signed poster and adaptive HLS pass. |
| Feed component | COMPLETE | Images remain intact, mixed media is image-first, and video-only products work. |
| Viewport coordinator | COMPLETE | Observer prewarm, one dominant player, constrained-device policy, and off-screen release exist. |
| Gallery interoperability | COMPLETE | Media is additive and pagination products are not mutated. |
| Failure isolation | COMPLETE | Poster, card, actions, and scrolling survive playback failure. |
| Observability | PARTIAL | Protected endpoint and monitor exist; authenticated live worker metrics remain to be checked. |
| Regression/performance tests | COMPLETE | Modules 59, localization 4 locales/888 keys, frontend 106/106, integration 150/150, E2E 97/97; CLS regression 0.0310. |

## Phase 41 Acceptance Matrix

| Area | Verdict | Evidence |
| --- | --- | --- |
| VIDEO SYSTEM | PARTIAL | Customer path passes; external fleet acceptance is pending. |
| FEED INTEGRATION | PASS | Video and pagination E2E suites pass. |
| GUEST | PASS | Guest video feed remains playable and endless. |
| AUTHENTICATED | PASS | Mixed-media navigation, detail return, and refresh pass. |
| REFRESH | PASS | Media survives refresh without losing gallery state. |
| ENDLESS SCROLL | PASS | Deep scrolling and video failure do not block continuation. |
| EDGE-TO-EDGE | PASS | Mobile/PWA media regression coverage passes. |
| AUTOPLAY | PASS | Eligible visible video plays muted and inline. |
| ONE ACTIVE VIDEO | PASS | Only the dominant visible player remains active. |
| VIDEO FAILURE ISOLATION | PASS | Card, poster, commerce, and feed remain usable. |
| IMAGE FEED UNAFFECTED | PASS | Full image arrays remain; mixed media stays image-first. |
| UPLOAD | PASS | Resumable/idempotent tests pass and live ready uploads exist. |
| TRANSCODING | PASS | Live playback reports five adaptive HLS renditions. |
| POSTER | PASS | Live signed JPEG poster returned 33,957 bytes. |
| OBJECT STORAGE | PASS | Cloudflare Stream owns bytes; Winga stores bounded metadata. |
| CDN | PASS | Live manifest cache is 600 seconds; poster cache is 864,000 seconds. |
| QUEUE | PARTIAL | Durable behavior passes tests; live backlog/dead-letter state needs ops auth. |
| HORIZONTAL WORKERS | PARTIAL | Multi-worker leases and heartbeats pass tests; active production count needs ops auth. |
| MEMORY/PERFORMANCE | PASS | Off-screen HLS/source nodes are released while card/poster remain. |
| SECURITY | PASS | CSRF, signed 900-second playback, access checks, webhook signatures, bounded IDs, and no-store tokens exist. |
| OBSERVABILITY | PARTIAL | Contract and monitor pass; protected production metrics remain to be read. |

## Live Acceptance Evidence

On 2026-09-08 npm run verify:video-production passed against wingamarket.com:

    ok: true
    feedPage: 1
    scannedItems: 50
    feedHasMore: true
    provider: cloudflare-stream
    status: ready
    moderationStatus: approved
    durationSeconds: 238.72
    signingMode: api
    expiresInSeconds: 900
    adaptiveRenditions: 5
    manifestContentType: application/vnd.apple.mpegurl
    manifestCacheControl: public, max-age=600
    posterContentType: image/jpeg
    posterCacheControl: public, max-age=864000
    posterBytes: 33957

The release also passed:

- npm run verify:frontend-worker-routing
- npm run verify:production
- Live build version 20260908002209
- Cloudflare Worker version 68bdf8ca-65cb-439c-ab5a-0d7851698292
- Vercel fallback deployment dpl_GfYmBZBebWYtZVTeg3KDGi2dHDpR

## Additive Migrations

- 2026083001_product_media_items
- 2026083002_video_upload_intents
- 2026083003_video_upload_product_claims
- 2026083004_video_moderation_lifecycle
- 2026083005_video_safety_outbox
- 2026083101_video_direct_publish_reconciliation
- 2026083102_video_direct_publish_default
- 2026090101_seller_video_analytics_indexes
- 2026090701_video_media_metadata_contract
- 2026090801_video_worker_horizontal_scale
- 2026090802_video_upload_idempotency

## API Surface

- POST /api/media/videos/direct-upload
- POST /api/media/videos/webhook
- POST /api/media/videos/safety-results
- GET /api/media/videos/:providerId
- POST /api/media/videos/:providerId/playback-token
- GET /api/media/videos/:providerId/captions
- GET /api/media/videos/:providerId/captions/:language.vtt
- GET /api/admin/media/videos
- GET /api/ops/media/videos/health

## Main Ownership Files

- backend/product-media.js: canonical media normalization
- backend/cloudflare-stream.js: upload, playback, captions, deletion
- backend/db.js: upload, safety, cleanup, health, heartbeat persistence
- backend/video-background-worker.js: standalone bounded worker
- backend/video-cleanup-processor.js: leased cleanup and retry
- backend/video-safety-dispatcher.js: bounded safety dispatch
- backend/server.js: HTTP contracts
- src/marketplace/video-upload.js: resumable client upload
- src/marketplace/video-playback.js: viewport lifecycle
- src/marketplace/gallery.js: ordered presentation
- worker.js: BigPipe prewarm and signed poster handoff
- scripts/check-video-health.js: authenticated ops monitor
- scripts/verify-video-production.js: non-mutating live acceptance

## Final External Acceptance Step

Run from a trusted operator shell. Never paste or commit the token.

    $env:OPS_HEALTH_TOKEN = '<same value configured on Render>'
    npm run monitor:video

Acceptance requires:

- readiness is ready
- activeVideoWorkers is at least 1
- staleVideoWorkers is 0
- cleanupDead is 0
- safety and cleanup queue depth/age are below thresholds

After this passes, mark the video system COMPLETE for global operational acceptance. No app code change is required.

## Deployment Sequence

1. Deploy Render API first so additive migrations run.
2. Start winga-video-background-worker with the same database and Stream environment group.
3. Deploy the existing Cloudflare frontend Worker mkubwa; never create another frontend Worker.
4. Deploy Vercel only as fallback.
5. Run routing, shell, video, and authenticated health gates.

## Rollback

1. Use a normal Git revert for the faulty release; never delete provider media or video rows during an incident.
2. Redeploy the existing mkubwa Worker and Vercel fallback.
3. Let Render redeploy the reverted API and background worker.
4. Keep additive migrations. Older code tolerates media_items defaults and unused columns.
5. A faulty background worker can be scaled to zero while API, feed, and playback stay available. Durable jobs remain recoverable.

## Architectural Boundary

Feed Engine is not Media Presentation. Media Presentation is not Media Processing. Video Playback is not Video Processing, Feed Pagination, or Intelligence. Video stays additive and fail-open for marketplace discovery and commerce.
