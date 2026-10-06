# Shopping Rooms: Native Candidate, 2026-10-06

## Scope

This is the historical native-only checkpoint. The subsequent
[real backend/UI integration](shopping-rooms-backend-ui-20261007.md) supersedes
the statements below that the room service and adapter are absent.

This is a gated client/protocol implementation, not a released room service.
`createMlsRuntime` defaults `rooms` to false. No production caller installs a
room authorization adapter. Existing Render/Phoenix pair authorization remains
unchanged; a two-account conversation has not been relabeled as a Shopping Room.
No room API, production migration, paid instance, secret or feature flag is added.

## Implemented

- Native room operations reuse the existing owner Web Lock, encrypted vault CAS,
  key-package publication, explicit native pins, MLS implementation and outbox.
- Initial room membership requires at least three different owners. Configured
  defaults are 12 owners and 24 native leaves, at most four leaves per account.
  These are candidate bounds, not measured production capacity.
- Real MLS Add and Remove commits validate actual sender/proposals, package
  hashes, epoch, group identity and exact resulting tree/roster. An account's
  multiple leaves can be removed in one epoch without intermediate access.
- Every resulting native leaf signs the exact transfer hash. Complete verified
  acceptance and canonical durable activation are both required before send.
  Exact activation and lost-send retries are idempotent; failed local writes
  neither consume an admission package nor advance a durable sender ratchet.
- Account roles are included in the flat signed intent and transfer hash. Only
  an already accepted admin may initiate membership changes. Role promotion
  cannot be smuggled into an Add/Remove. A future role-change protocol is separate.
- Accepted role/roster evidence is sealed per epoch in the existing journal.
  Room history and encrypted-policy metadata have their own namespace; they do
  not create a direct route, upgrade the direct-policy DB or leak into its inbox.
- Room application signatures are domain-separated from direct messages and
  checked against the actual decrypted MLS sender leaf. Removed leaves cannot
  decrypt future traffic, not merely fail a UI access check.
- Typed encrypted product shares, board removal, shortlist selection, polls,
  account-wide replacement/withdrawal of votes and authorized poll close have a
  deterministic projection from committed, sender-verified canonical history.
  Pending outbox items do not increment polls or count as committed board items.
- Product references carry canonical IDs. Historic snapshots remain explicitly
  historic; only separately authorized current catalog results provide current
  price, availability and stock. Missing information stays unknown.
- Ask Seller has a bounded consent-only disclosure builder: chosen product ID,
  explicit question and correlation ID. It neither invites the seller nor
  exports room notes, members or history. Its actual service/UI is still open.

Room commands have a 12,000-byte contract limit. Message plaintext remains
bounded to 16 KiB and each MLS wire item to 64 KiB. The flat transfer codec caps
the complete native operation payload at 256 KiB; roster/roles stay signed JSON
strings, never nested objects lost by the existing transport canonicalizer.
Projection accepts at most 100,000 input records. Native historical-role loading
caps distinct epochs at 1,024 and fails explicitly instead of truncating.

## Evidence

`npm run test:shopping-rooms`: 35 passing tests. Genuine MLS groups include three
and four different owners, account-wide native removal, leaf impersonation,
signed-authority substitution, role smuggling, exact retries and CAS aborts.
The board tests include 1,500 ordered vote records and shuffled/duplicate arrival.
A 72-message exercise performs 144 recipient decryptions. A separate burst queues
24 simultaneous sends through three native owner locks and decrypts 48 deliveries.
Both converge without duplicate logical messages.

The browser room test uses three isolated Edge contexts, existing native device
registration/key-package services and actual encrypted IndexedDB. It tests
reload/replay, preserved v1 direct-policy metadata, strict unchanged CSP and MLS
removal. The broad encryption browser run passed 38 tests; the final native MLS
browser file is rerun separately after room-role changes. Existing crypto tests
passed 145/145 and rich-content regressions passed 19/19.

Room canonical authorization/storage in these tests is a **synthetic signed
authority**, not the implemented production room backend. These numbers do not
prove PostgreSQL room races, production load/SLOs or independent crypto approval.

## Still Required Before Activation

1. Extend canonical Conversations with an explicit private room identity/type;
   do not fake a pair identity or start a separate messaging framework. Preserve
   direct irreversible encryption and immutable historical epoch grants.
2. Implement durable native-signed creation/invites/membership reservations,
   current account/session/device/block checks, quotas, writer freeze and all-leaf
   activation. Bind the original canonical reservation, signed role map and
   transfer digest on every response; never accept client-supplied member lists
   as authorization. Recheck access after every lock/network wait.
3. Extend the existing ciphertext/poll/receipt/media/event/push paths to current
   room membership and original message epochs. Do not use direct peer receipt
   aggregation or infer every member Delivered/Read from one native ACK.
4. Connect the real Chatrooms list and Chat/Products/Polls/Shortlist/Orders UI to
   this service, including fingerprint approval, invite/leave/removed states,
   paged history and private structured projections. No fabricated room dataset.
5. Add exact current product hydration/comparison and authorized seller question/
   response correlation without admitting a seller. Group wallets, automatic
   payment/orders, AI and public communities remain deliberately future work.
6. Test actual room HTTP/PostgreSQL concurrent membership/send/vote ordering,
   worker routing, revocation, dependency loss and realistic soak. Integrate room
   native history/media/recovery under its own membership policy and complete
   physical-device acceptance and independent cryptographic review.

The authorization adapter is a trust boundary: `verifyIntent` must authenticate
the reservation and actor/role; `confirm` must prove the exact durably active
group/epoch/hash after all native proofs; `check` must prove current membership,
epoch and revision. A boolean returned by an unverified JSON response is not an
acceptable production adapter. Without that service the candidate stays off.
