# Shopping Room History: 2026-10-08

## Implemented

The existing native-to-native paged encrypted archive protocol now also handles
Shopping Rooms. Both endpoints must be active native members of the current
accepted Room epoch and belong to the same account. A pending transition,
revocation, removal, account block or disabled gate prevents archive operations.
New Room accounts do not inherit another account's archive.

Foreground Room synchronization participates in the existing background history
coordinator. Donors transfer only committed prior-epoch records, preserving Room
kind, room-scoped peer, immutable sequence, sender, timestamp, digest and optional
media ID. Pending sends, current-epoch traffic, unrelated conversations, native
identity, live group secrets and ratchets are not copied. Current-epoch messages
still pass their own MLS ratchet. Atomic vault import and exact signed retries
use the existing bounded manifest/page protocol and staging cleanup.

Before donation and import, an authenticated Room epoch read verifies the
account's original membership and each archived sender's epoch membership.
The final import also rechecks current membership and local confirmed revision.
Original server epoch grants are never expanded to include the new native device.

User-key recovery already preserves history records, including Room records.
After explicit current native-device approval and Room admission, the Room board
can obtain missing public original-epoch roster/role metadata. All original
native acceptance signatures are checked before projection. This public metadata
is bounded and cached; it never installs old MLS group state, identity or keys.
Recovery alone cannot admit a new native endpoint.

Recovered prior-epoch Read uses separate native-signed archive evidence and
ACKs. It never manufactures original Delivered receipts. Ordinary original-device
Read still works when multi-device history is disabled. Unknown historical reader
pins are not silently trusted. Room attachment download can request the existing
explicit historical-media grant for a current native endpoint of the same
original owner, without changing original epoch grants or publicizing the object.

## Evidence

Real MLS/PGlite service tests cover same-owner admission, encrypted transfer,
prior/live epoch separation, sequence/scope preservation, immutable original
grants, untouched native ratchets, historical Read, ciphertext corruption,
changed metadata signatures, account/device/gate denial, membership freeze and
completed native removal. The database rejects historical acceptance mutation;
client response mutation is separately tested at the transport boundary.

A four-context browser test uses the real authenticated HTTP handlers and native
session/vault/runtime: three-account Room creation, private text/file delivery,
native sibling approval and Add commit, automatic historical transfer, original
role projection, encrypted old-file download, user-key restore, reload and a new
live encrypted message. No user account credentials or recovery key were used.
Local object storage is synthetic; this is not a production R2/device test.

Release checks passed: Room suite 65/65, the final Room member/Read-gate harness
7/7, encrypted-content 145/145, secure browser 41/41, frontend behavior 80/80
plus core assertions, four locale catalogs with 1604 keys and zero new hardcoded
UI strings. The 93-module bundle is synchronized; frontend build and Wrangler
deployment dry-run passed. These are local checks, not independent audit or
production authenticated-flow certificates.

## Rollout And Boundaries

Deploy the backend first, then the frontend. No new schema migration, secret,
CSP permission, storage bucket or flag is introduced. Room operations remain
behind the existing Rooms gate; archive composition additionally requires the
existing encrypted multi-device gate. This release does not change either gate.

Own-device synchronization needs a donor with retained history online and
foreground synchronization. Existing donor rotation, retries and two-minute
reconciliation cadence apply; it is not instant offline cloud replication.
The server receives encrypted pages and public membership evidence, not archive
plaintext. Archive content is attested by the donating native account; it is
not a new independent proof that each recovered body was signed by its original
peer. A trusted server remains the original membership metadata authority.

Missing/unauthenticated epoch metadata fails closed. Recovery cannot recreate
lost MLS secrets, missing originals or a lost user-held recovery key. Removed
native endpoints cannot fetch new staged pages or renew media access. Existing
local history already held by a participant cannot be remotely erased.

Independent cryptographic review, physical-device/production media/recovery
acceptance, actual multi-connection PostgreSQL and fleet load/soak evidence,
approved erasure policy and Room role/leave policy remain open. This follow-up
does not certify all sections 171-189 or introduce wallets, automatic purchases,
AI processing, public communities or compulsory member-voted leaving.
