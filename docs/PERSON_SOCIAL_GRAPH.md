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

Curator is not inferred because public collections and recommendations do not
yet have a canonical persisted model.

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

Content-level PUBLIC, FOLLOWERS, and PRIVATE visibility is not yet a production
contract. It must be added to each public content model before followers-only
content can be exposed safely.

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
- public_reviewer_activity
- public_profile_activity

Suggestion impressions and accepted suggestions use the existing audit
infrastructure. Idempotent follow retries do not emit duplicate creation events.

## Feed Integration

The current feed may use followed people as one bounded ranking/candidate signal.
Follow state does not replace canonical feed candidates, reset availability, or
become a requirement for guest or authenticated feeds.

## Tests And Remaining Work

Automated tests cover self-follow rejection, idempotent mutations, block
exclusion, cursor bounds, public capability derivation, safe suggestion inputs,
and client request contracts.

Remaining work:

- canonical public collections/recommendations and a real curator capability,
- content-level visibility enforcement for every public content type,
- generic person-content notifications with frequency controls,
- optional user-facing suggestion surfaces,
- removal of seller-specific compatibility naming after all callers migrate.
