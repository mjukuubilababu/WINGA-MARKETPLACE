# Shopping Rooms: Real Backend and UI, 2026-10-07

## Implemented Integration

This supersedes the native-only candidate checkpoint. Rooms now use the existing
authenticated encrypted-operation endpoint, native device proofs, owner locks,
MLS vault/outbox, canonical Conversations event stream and durable push queue.
There is no plaintext fallback, fake pair identity or second messaging stack.

- The additive `2026100610_encrypted_shopping_rooms` migration makes direct and
  private room identities explicit. Direct owner/device shape stays constrained;
  room streams have no invented low/high participant pair.
- Initial membership requires three different accounts. Bounds are 12 accounts,
  24 native leaves and four leaves per account. These are enforced limits, not
  measured production capacity. Every resulting leaf must verify and sign the
  same native transfer before canonical activation.
- Only an accepted admin initiates Add/Remove. Commits freeze protected sends
  and private media access until all retained/new leaves accept. Retained
  original-epoch traffic must be drained before rotation. Original native grants,
  sealed roles, transfer evidence and signatures cannot be rewritten.
- Exact-ID encrypted messages, ordered delivery, member-specific Delivered/Read,
  private media and canonical account routing share existing infrastructure.
  A sender sees Delivered/Read only after all other original account recipients
  meet that status. Generic push is owner-specific and resolves to the room;
  reading by one member does not suppress another member's notification.
- The Rooms tab has real searchable room rows, creation, explicit fingerprint
  review, admin member controls, text/file composer, private downloads, retries,
  chronological chat, Products, per-owner Shortlist and Polls. Pending creation
  or membership operations retry the exact encrypted-vault reservation.
- Products use authenticated current catalog reads. Polls and shortlist are
  deterministic projections of committed, native-sender-verified encrypted
  history; an optimistic outbox item is not a committed ballot.
- Existing direct chats synchronize independently. A room-local sync failure
  appears on that room rather than changing the entire direct inbox to Retry.
  Owner/session changes close dialogs and revoke decrypted preview URLs.
  Read uses the direct-chat viewport/clipping/occlusion guard on the room thread;
  background or keyboard-covered messages are not acknowledged as read. Refresh
  preserves the reader's history anchor instead of jumping to newer messages.

## Verification

`npm run test:shopping-rooms` passes 46 tests, including actual backend SQL,
three-owner native MLS, all-signature activation, removal, immutable grants,
generic owner-specific push, block denial and the read-only readiness verifier.
The native-only bounded load exercises remain separately labeled synthetic
authority evidence, not real PostgreSQL multi-connection or production load.

The actual HTTP browser fixture uses authenticated HttpOnly cookies, separate
native browser contexts, strict existing CSP and encrypted IndexedDB. It exercises
the full Rooms UI, lost accepted reservation reply, encrypted text, private file
upload/download, poll convergence, retained-member epoch rotation and denial of
removed-member media access. Its object-storage provider is a synthetic private
S3 adapter; this is not a claim of physical-device or production R2 acceptance.

Local screenshots cover mobile, desktop and RTL overflow checks. Independent
cryptographic approval, actual PostgreSQL concurrent writers, fleet load/soak,
physical-device acceptance and production migration/flag evidence remain open.

Regression suites also passed: secure content 145/145, message pages 96/96,
frontend core 145 checks plus 80 behavior tests, direct receipt visibility 14/14,
and secure-content browser 39/39. The final Rooms HTTP test additionally checks
keyboard-covered Read denial and preservation of a scrolled history anchor.
The chat UI suite had 99/100 passing with one Edge target-closed infrastructure
failure; the entire affected rich-chat file subsequently passed 11/11 in isolation.
Localization has four matching catalogs of 1568 keys with no new hardcoded debt.

The member-review follow-up uses existing authenticated contact lookup to obtain
canonical usernames before native package review. Self entries and case-insensitive
duplicates do not count toward the two required other accounts. Invalid syntax or
counts fail before package publication/directory requests. Unknown/unavailable
accounts and accounts without a ready encrypted device have distinct localized
errors; block/access denial stays nondisclosing. The HTTP regression covers the
reported self-plus-room-name input, invalid/unknown accounts, an account without
packages, mixed-case duplicates, successful native review and clearing stale errors.
The follow-up catalogs have 1575 matching keys. No backend gate or trust rule changes.

## Rollout

Rooms default OFF. No production flags, CSP permissions, secrets, instance
counts or bucket public-access settings are changed by this integration.

1. Deploy the exact backend commit to the existing WINGA Node service. Startup
   applies the additive migration under the existing migration lock.
2. In its Render shell run `npm run verify:shopping-rooms`. It is repeatable-read,
   read-only, aggregate-only and performs no remote writes. Missing schema/guards
   or inconsistent account/epoch/acceptance evidence fails the check.
3. After a successful check, an operator may enable the controlled candidate via
   `WINGA_ENCRYPTED_ROOMS_ENABLED=true`, preserving existing crypto prerequisites.
   The feature capability appears only when enabled. The frontend uses that
   capability and existing authenticated/native session; no new secret is needed.
4. Exercise three real test accounts, private attachments, approval/removal and
   receipts. Record actual live commit and evidence; a public Ready response alone
   does not prove the room migration or flag is active.

## Not Claimed Complete

Orders is reserved future scope, not a wallet, automatic checkout or shared order
service. Room role promotion/self-leave, room-specific mute/archive and automatic
old-room-history transfer/recovery to a newly admitted native remain open.
Spec 180/181 now implement canonical comparison and consented correlated Seller
questions/responses through the existing encrypted direct and Room transports.
See `conversations-spec-180-181-20261007.md` for exact contracts, tests and remaining
live/audit acceptance. This does not declare all sections 171-189 or 0-238 complete.
