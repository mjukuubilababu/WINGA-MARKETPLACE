# Native Device Lifecycle And Paged History

This record describes implementation and local acceptance, not independent
cryptographic approval, production fleet capacity or completed Shopping Rooms.

## Implemented

- Native MLS Remove and Remove+Add replacement use the existing canonical
  conversation, signed transition ledger and all-retained-native acceptance
  barrier. Add/remove/replace are distinct signed action families.
- Removal excludes the endpoint from the next immutable epoch snapshot. It
  cannot send, acknowledge membership or retrieve future ciphertext. Original
  epoch snapshots remain unchanged; previously viewed plaintext is not erased.
- An owner can retire another own endpoint; replacing a contact's endpoint
  requires authoritative revocation and an independently checked fresh native
  fingerprint. The initiating device cannot remove itself or an active peer.
- Lost accepted HTTP replies resume the exact journalled commit after reload;
  they do not regenerate commits or advance an epoch twice.
- The security dialog exposes real remove/replace commands, exact native
  identity selection and explicit replacement fingerprint verification.
- History recovery no longer silently retains only 1,999 recent records.
  Larger archives use independently encrypted pages and an encrypted manifest
  whose hashes are bound to the user-held independent checkpoint.
- Bounds: 100,000 records, at most 64 pages, at most 2 MiB plaintext per page.
  Exceeding a bound rejects the archive rather than discarding old records.
- Session-authorized immutable page staging precedes atomic owner CAS root
  publication. Exact lost-page/root retries survive reload. Deleted unpublished
  archives leave a revision tombstone; delayed requests cannot resurrect them.
- Restore verifies every page before one history-only IndexedDB transaction.
  Missing, changed, reordered, duplicate or stale pages cannot produce a
  partially restored archive. MLS ratchets and native identity are excluded.
- Recovered attachments need a separate signed archive grant, initiated by an
  explicit download. The recipient must be a currently authorized approved
  native endpoint of an account present in the original message's epoch.
  Original epoch grants are never retroactively rewritten. Current access,
  revocation, suspension and blocks still apply; file keys stay in the encrypted
  recovered history, not the grant or server database.

## Local Evidence

The complete crypto regression suite passed 137/137 tests, secure browser
acceptance passed 37/37, message/report service tests passed 96/96, and the
final backup/readiness/metrics regression passed 17/17. Frontend core and
behavior checks passed 145/145 and 80/80; all four locale catalogs have 1,524
matching keys and no new hardcoded localization debt. The prepared frontend
release is build `20261006184522`; preparation does not imply production
publication or authenticated production acceptance.

Native crypto tests cover Remove 3-to-2, revoked-peer replacement, forged intent,
tree/roster substitution, aborted persistence, replay and inability of the
retired endpoint to decrypt new ciphertext.

The real browser/client/server test covers native Add, explicit history recovery
onto a fresh same-owner endpoint, old-file decryption after its signed grant,
Remove through the actual mobile/desktop UI, lost accepted response and continued
peer delivery. The retired endpoint cannot fetch the old file through the server
or see the new message.

Browser recovery tests cover a 2,500-record archive exceeding 32 MiB and a fresh
device restoring all 3,000 records after lost page/root replies. A corrupted page
leaves the fresh vault at revision zero with no restored rows. Reload, independent
checkpoints, key rotation, receipt monotonicity and active-secret exclusion remain
part of the regression suite.

The disposable PostgreSQL runner passed 38/38 tests on two independent stores and
six connections. Native Remove had 12 reserve, 12 transfer and 20 acceptance
attempts, producing one epoch transition. Archive load accepted 384 attempts for
64 unique immutable pages and one winning CAS root; measured p50/p95 store-write
latency was 14/118 ms. The direct MLS workload persisted 64 unique messages from
74 attempts, with 64 recipient decryptions and no duplicate rows. These are local
workload measurements, not production SLO or Shopping Room capacity evidence.

## Still Open

- Automatic continuous historical reconciliation between trusted devices is not
  implemented. User-held-key recovery is explicit, not silent key escrow or an
  automatic cross-account/group-history disclosure mechanism.
- Shopping Rooms still require real multi-account canonical membership, MLS
  group routing and removal, private structured commerce state, UI and room
  concurrency/load acceptance. A direct pair with several devices is not a room.
- Physical-device and authenticated production acceptance, sustained load/soak,
  dependency-failure evidence, retention/erasure approval and independent crypto
  review remain open.
- `WINGA_ENCRYPTED_MULTIDEVICE_ENABLED` remains default-off. No production
  environment flags, CSP permissions, secrets or paid instance counts are changed
  by this implementation.

Two additive startup migrations: `2026100607_encrypted_device_lifecycle` and
`2026100608_encrypted_history_pages`. Readiness now requires 12 crypto migrations
and checks the archive-page and explicit attachment-grant tables.
