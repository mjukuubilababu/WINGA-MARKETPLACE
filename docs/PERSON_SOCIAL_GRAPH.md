# Winga Person Social Graph

## Existing Architecture Audit

Winga stores follows as a generic person-to-person edge in PostgreSQL:

- user_follows.follower_username points to the acting user.
- user_follows.followed_username points to the public person being followed.
- Active and removed states preserve follow history without duplicating active edges.
- Database checks prevent self-follow, and the composite primary key prevents duplicate relationships.
- Cursor indexes support bounded follower and following pages.
- user_blocks overrides visibility and removes follow edges in both directions.

The API authorizes the acting user from the server session. It does not accept a
follower identity from the client.

## Canonical Model

Every account remains a user/person. Buyer, seller, and creator are public
capabilities, not separate social identities. The compatibility role field is
retained while public profiles expose a capabilities array.

Capabilities are derived only from public evidence:

- buyer: the current account role is buyer.
- seller: seller role, verified seller state, or at least one approved product.
- creator: at least one approved reel/video product or authored public review.
- curator: at least one published collection visible to the current viewer.

Capabilities remain evidence-derived. Publishing a collection does not create a
separate account or change the compatibility role field.

## Migration Compatibility

Existing user_follows data is preserved. The existing local seller-follow
adapter imports legacy followed usernames through /api/social/follows/import
and upserts the same canonical person edge. Existing seller follow behavior
continues to use the generic graph.

The public-discovery migration adds indexes only; it does not rewrite or delete
social data.

## Privacy And Visibility

Follow suggestions use only approved products, approved reels/video products,
public reviews, active public follow edges, and aggregate follower counts.
Purchases, messages, saved items, browsing history, and private profile behavior
are not read by the suggestion query or returned as reasons.

Blocked relationships are excluded in both directions. A blocked public profile
is not returned to the other person.

Products, reels, and reviews now share a production visibility contract:

- PUBLIC is visible to guests and signed-in people.
- FOLLOWERS is visible to the owner and active followers.
- PRIVATE is visible only to the owner.
- Staff can inspect content through existing moderation-capable paths.
- A block in either direction overrides follower access.

Visibility is stored in public_content_visibility. Existing content without a
policy row remains PUBLIC, so migration does not hide the current catalog.
Product lists, rediscovery, review reads, profile content counts, follow
suggestions, video captions, and direct playback-token requests enforce the
same access rules. Product visibility changes invalidate anonymous feed cache
variants immediately.

The owner-only API is:

PATCH /api/social/content/:product|reel|review/:id/visibility

Product and Reel owners can change this policy from the existing post overflow
menu on Home or Profile. The selector patches the canonical product in memory
after the server accepts the change, clears stale query cache through the data
layer, and refreshes the current surface without resetting Home pagination.
Failures restore the previous selection and leave the post unchanged.

## Suggestion Logic

GET /api/social/suggestions returns at most 30 people and excludes the viewer,
existing active follows, inactive accounts, and blocked relationships.

Ranking uses:

1. shared approved product categories,
2. mutual active public follows,
3. approved reel activity,
4. public review activity,
5. aggregate follower count.

Returned reason codes are safe and explainable:

- similar_public_categories
- mutual_public_connections
- public_creator_activity
- public_curator_activity
- public_reviewer_activity
- public_profile_activity

Suggestion impressions and accepted suggestions use the existing audit
infrastructure. Idempotent follow retries do not emit duplicate creation events.

## Notifications

A newly activated follow writes one owner-scoped notification in the same
database transaction as the follow edge. Its stable relationship identity
prevents retry spam. Notification reads are PostgreSQL-backed, bounded to 100
recent rows, private/no-store, and available to every valid person account.
Realtime delivery uses the existing notification channel; reconnecting clients
recover the durable row from PostgreSQL.

Creating an approved public or followers-only Reel also writes follower
notifications in the product transaction. Fanout includes only active followers
with active accounts, excludes blocks in either direction, and is capped at 100
recipients per Reel. A six-hour creator-to-recipient cooldown prevents burst
spam, deterministic notification IDs make retries idempotent, and private Reels
never notify followers. Successfully committed rows are delivered through the
same realtime notification channel and remain recoverable from PostgreSQL.

Publishing a non-private collection uses the same durable, block-safe, active
follower fanout. Draft creation and item edits do not notify. The collection
channel has its own six-hour creator-to-recipient cooldown and a maximum of 100
recipients per publication.

## Collections And Recommendations

public_collections is the canonical curator-owned container. Collections move
through draft, published, and archived states; archived collections are
terminal. public_collection_items stores unique product references, a bounded
position, and an optional public recommendation note.

Owners may add at most 100 approved products that they are allowed to view.
Ownership is enforced server-side in a transaction. Product access is checked
again whenever a collection is read, so a later block or private product policy
cannot leak through an older collection reference. Collection responses expose
at most 12 ordered product previews while returning an accurate visible item
count.

The canonical API surface is:

- POST /api/social/collections
- PATCH /api/social/collections/:collectionId
- PUT /api/social/collections/:collectionId/items/:productId
- DELETE /api/social/collections/:collectionId/items/:productId
- GET /api/social/users/:username/collections

Writes require an authenticated person session and CSRF protection. Public
reads are cursor-bounded; owner reads may include drafts and private
collections, while other viewers receive only published content allowed by the
PUBLIC/FOLLOWERS/PRIVATE policy.

## Feed Integration

The current feed may use followed people as one bounded ranking/candidate signal.
Follow state does not replace canonical feed candidates, reset availability, or
become a requirement for guest or authenticated feeds.

## Tests And Remaining Work

Automated tests cover self-follow rejection, idempotent mutations, block
exclusion, cursor bounds, public capability derivation, safe suggestion inputs,
owner-scoped visibility changes, public/follower/private review reads, direct
video playback privacy, cache invalidation, and client request contracts.

Remaining work:

- user-facing collection creation and profile collection surfaces,
- visibility support for future posts and shorts
  once those canonical content models exist,
- optional user-facing suggestion surfaces,
- removal of seller-specific compatibility naming after all callers migrate.
