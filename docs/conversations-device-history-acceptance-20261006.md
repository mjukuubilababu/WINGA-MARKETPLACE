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

- Automatic own-native historical reconciliation is implemented as a gated
  candidate below; authenticated production and physical-device acceptance remain.
  User-held-key recovery remains explicit, without server key escrow.
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

## Own-Native Automatic History Candidate

The later additive migration `2026100609_encrypted_native_history` adds signed
own-account transfer requests, immutable ciphertext pages and separate historical
Read/ACK tables. Readiness requires 13 crypto migrations and these four tables.
The existing multi-device flag remains default-off; publication does not enable it.

Both endpoints must be approved native identities currently admitted to the same
canonical direct conversation. Recipient and donor authenticate fresh P-256 ECDH
public keys with pinned native signatures. HKDF-SHA256 binds the owner, request,
conversation, epoch, both devices and both public keys. The resulting short-lived
AES-GCM key is not sent to the server or derived from the account password.
Recipient ephemeral private material is retained only inside its encrypted local
vault for exact retry. Manual recovery keys and MLS identity/ratchets are excluded.
This composition is a candidate requiring independent cryptographic review.

Only prior-epoch records are archived. Current-epoch traffic still passes the
original MLS ratchet. Bounds are 100,000 records, 1,024 pages of at most 128 KiB
plaintext and at most 128 MiB plaintext total. Oversize archives fail rather than
truncate. Signed publication binds the encrypted manifest digest; the manifest
binds every page hash, count, account, conversation and native endpoint. All pages
validate before one history-only vault transaction. Conflicting content fails;
receipt progress merges monotonically. Derived UI flags do not create conflicts.

This is an account's attested archive copy, not independent proof that the
original peer signed an archived body. Unknown historical native signatures are
deferred without ACK or implicit trust. Current-native receipts receive priority,
so historical unverified proofs cannot occupy the entire next receipt batch.
Archive Read requires current membership and original historical account scope;
it does not rewrite old epoch grants or manufacture Delivered.

Synchronization runs off the send critical path. Short owner/session and MLS locks
protect vault writes and final import. Membership and session are rechecked after
network I/O and before import. Approved source endpoints need to be online;
unanswered requests rotate donors after two minutes of active reconciliation.
Completed requests retain only bounded hash retry evidence, not archive pages.
Requests expire after 24 hours; the existing managed conversation sweeper prunes
expired server staging in bounded batches. This is not a promise of OS background
execution, total local journal eviction or recovery without an approved source.

Local acceptance uses actual WebCrypto ECDH/HKDF/AES and native signatures, lost
reserve/page/publication/ACK replies, coordinator restart, 1,200 restored records,
tampered ciphertext without partial import, session changes, block/revocation,
historical Read and immutable original epoch grants. The real HTTP three-profile
browser flow restores old incoming/outgoing messages automatically, downloads an
old encrypted attachment, converges historical Read and continues live messaging
after native removal under unchanged CSP.

Real disposable PostgreSQL acceptance passed 39/39 cases. Two stores and six
connections staged 64 unique pages from 256 attempts, retried publication and
acceptance 12 times each and retained one accepted transfer with no pages and no
fake message receipts. Empirical page-write p50/p95 was 75/100 ms in that local
run; this is not production capacity, sustained soak or Shopping Room evidence.

Final candidate verification: crypto 145/145, secure browser 37/37, message/report
service 96/96, frontend core 145/145, frontend behavior 80/80, and lifecycle/metrics
4/4. Four locale catalogs retain 1,524 matching keys with zero hardcoded debt.
Prepared build `20261006193220` includes all 91 synchronized source modules and
267 assets; Wrangler dry-run passed with the existing Worker and preserved vars.
Production publication must be verified separately against the exact commit and
asset hashes; prepared assets do not certify authenticated account acceptance.
