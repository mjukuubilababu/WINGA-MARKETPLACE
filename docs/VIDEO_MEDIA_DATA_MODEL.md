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