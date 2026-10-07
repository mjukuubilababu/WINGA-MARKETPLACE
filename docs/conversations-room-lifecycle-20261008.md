# Shopping Room Admin Handoff and Voluntary Leave

## Authorized Policy

The operator approved admin transfer and voluntary account-wide leave.
An existing admin can hand the role to an existing member and becomes a member.
The last admin must transfer before leaving unless they are the sole owner.
No voting requirement, forced membership, wallet settlement or debt cancellation
is introduced. Leaving never deletes messages, historical grants, orders or
business obligations. Previously decrypted local history remains readable.

## Implementation

- Admin handoff retains the exact native roster and changes exactly two roles.
  It creates a real MLS commit with zero membership proposals and a new epoch.
  Every retained native device must accept the bound intent and commit hash.
  Historical roles remain sealed under their original epoch.
- Voluntary leave persists an account/device-signed departure request before
  reporting success. Authorization, canonical event membership and queued push
  are revoked immediately for that account, including all its native devices.
  Dispatch also rechecks current canonical membership for late queued jobs.
- MLS does not support a committer removing its own leaf. A remaining admin
  verifies the departure proof, drains retained old-epoch inboxes and coordinates
  a normal Remove commit. All departing native leaves are excluded together.
  Retained pinned devices automatically reconcile remove-only or role-only
  transitions; new native admissions still require explicit review.
- New sends, media and history transfers stay frozen while departures or native
  transitions are pending. Existing retained inbox/receipt processing remains
  available so rotation cannot deadlock on an old inbox acknowledgement.
  A row-locking SQL insert guard also rejects ciphertext writes from a legacy
  writer after the membership freeze, independent of application checks.
- A room can shrink to one owner. The final sole owner can leave through a
  durable terminal departure; no original epoch is rewritten or erased.
- Leave retries preserve the request ID and scope in the encrypted local vault.
  Server retries retain the original signed proof and do not repeat access
  changes. Mutation/deletion of departure evidence is guarded in PostgreSQL.
  Another blocked, suspended or unavailable member cannot prevent a normal
  member's voluntary departure; the actor's own authenticated native and the
  last-admin rule remain mandatory.
- UI includes explicit handoff/leave confirmations, a last-admin error, pending
  rotation state, read-only retained local history and four-language copy.

## Verification

Final local checks:

- Native MLS / Room projection / review contracts: 49/49.
- Complete Room service suite on disposable PostgreSQL 18: 28/28, no skips.
- This includes 24 concurrent leave retries across two stores/six connections,
  and a send blocked behind an uncommitted leave that is rejected after commit.
- Actual HTTP browser scenarios passed for Room UI handoff/leave/singleton
  closure, own-native archive/recovery/media and product comparison/seller relay.
  Browser profiles are synthetic accounts, not physical production devices.
- Shared encryption, transport, recovery and private media regressions: 145/145.
- Frontend core: 145/145; frontend behavior: 80/80.
- Four localization catalogs: 1,612 matching keys, zero new hard-coded UI debt.
- Frontend source bundle synchronization: 93 modules; production build and
  deployment dry-run passed. Mobile 390px and desktop 1280px screenshots checked.

## Rollout and Open Boundaries

Additive startup migration: `2026100801_encrypted_room_departures`.
Deploy backend first, then the matching frontend. No flags, credentials, CSP,
storage permissions, instance count or existing private files change.
Refresh older clients: they reject the new role intent until updated.
`verify:shopping-rooms` now checks departures and seven enabled guard triggers;
its aggregate result does not certify authenticated production acceptance.

If the admin or a required retained native device is offline, rotation remains
pending. The leaving account has already lost server access, but a final native
key-rotation confirmation must not be fabricated. Previously delivered content
and provider-accepted push cannot be recalled. Pending native outbox journals
remain protected; no membership operation silently discards an uncertain send.

Physical-device rollout, sustained production load/failure evidence, independent
cryptographic review and approved retention/erasure policy remain open. Wallets,
automatic group purchasing, shared orders and public communities are separate
future work. Release IDs are established by deployment results, not this file.
