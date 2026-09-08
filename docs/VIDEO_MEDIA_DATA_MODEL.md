# Winga Video Media Data Model

## Ownership

Winga keeps product presentation order separate from provider processing state.

- `products.media_items` is the ordered Product/Post media manifest. It owns media type, position, and the compact metadata required to render a card.
- `video_upload_intents` is the authoritative video record. It owns upload identity, seller ownership, processing and safety state, source MIME/size, dimensions, duration, and delivery manifests.
- Cloudflare Stream owns adaptive bitrate renditions. Winga stores the signed-delivery inputs (`hls_url`, `dash_url`, and `poster_url`) instead of duplicating every provider rendition.

Legacy `products.image` and `products.images` remain backward-compatible image fields. New media behavior must use the normalized `mediaItems` contract.

## Canonical Identity

For a Stream video, `video_upload_intents.provider_id` is all of:

- the stable media ID;
- the provider storage key;
- the foreign identity used by a Product media item.

API owner responses expose this value as `providerId`, `mediaId`, and `storageKey` for explicit contract semantics. No Product title, category, price, or seller profile metadata is copied into the video record.

## Relationship Lifecycle

A video upload starts with `product_id IS NULL`. Product create/update atomically:

1. verifies the video is ready and seller-owned;
2. claims it with a deferred foreign key to `products(id)`;
3. replaces client-supplied video metadata with authoritative intent metadata;
4. writes the ordered Product media manifest in the same transaction.

Removing media or deleting a Product clears the claim. Orphan cleanup can then delete provider media through its existing retry-safe lifecycle.

## Derived Fields

`aspectRatio` is derived from authoritative `width / height`; it is not stored as another database value that can drift. Product `position` belongs to `products.media_items`, because ordering is Product-specific rather than intrinsic video metadata.

## Compatibility

Existing fields remain valid:

- `status` remains the processing status;
- `providerId` remains the playback identity;
- HLS/DASH playback remains provider-managed;
- image-only and legacy Products continue to normalize without a video record.

## Upload Request Idempotency

Each browser upload operation owns one opaque idempotency key. The API hashes that key with the authenticated seller identity to produce a deterministic `upload_id`; the raw key is not persisted. A retry with the same seller, key, and file fingerprint replays the existing short-lived provider intent instead of allocating another Stream asset. Reusing a key for different file metadata fails with a conflict.

Only the owner-scoped upload path can read the stored provider write URL. The URL is never included in Product or Feed records and is cleared when processing reaches `ready` or `failed`. Interrupted TUS uploads query the provider offset before sending another chunk.

## Production Test Matrix

The executable Phase 38 matrix is distributed by subsystem so one optional failure cannot conceal another:

| Area | Automated evidence |
| --- | --- |
| Upload validation, provider policy, TUS chunks, interruption, retry, and duplicate request | `tests/cloudflare-stream.test.js`, `tests/frontend-core.test.js`, `tests/postgres-pagination.test.js` |
| Authentication and role denial | `tests/integration-api.test.js`, `tests/frontend-core.test.js` |
| Processing success/failure, retry leases, duplicate jobs, cleanup, restart, and horizontal workers | `tests/postgres-pagination.test.js`, `tests/video-safety-dispatcher.test.js`, `tests/video-background-worker.test.js` |
| Image-only, video-only, mixed media, appended pages, and endless pagination | `tests/frontend-core.test.js`, `tests/e2e/video-feed.spec.js`, `tests/e2e/pagination-bootstrap.spec.js` |
| Muted autoplay, one active player, pause/resume, mute, visibility, completion, and failure isolation | `tests/frontend-core.test.js`, `tests/e2e/video-feed.spec.js` |
| Guest, authenticated, refresh, product/profile navigation, and back restoration | `tests/e2e/video-feed.spec.js`, `tests/e2e/app.spec.js` |
| Slow/offline media, constrained devices, rapid visibility changes, memory bounds, and CDN failure | `tests/frontend-core.test.js`, `tests/e2e/video-feed.spec.js`, `tests/video-health-monitor.test.js` |

The release gate is `npm run test:ci`. Production deployment additionally requires the live domain-routing and shell verifiers. Run `npm run verify:video-production` after deployment to verify a public ready video through the canonical feed, CSRF-protected signed playback, adaptive HLS manifest, poster, and CDN cache contract without creating or mutating media. A real Stream upload smoke test remains an infrastructure check because CI must not create billable provider media or depend on provider availability.
