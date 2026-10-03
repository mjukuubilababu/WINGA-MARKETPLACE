# Encrypted content and user-key recovery

> Historical design snapshot: several statements below describe the earlier
> codec-only phase, not the integrated candidate deployed in `63077e6`.
> For current implementation evidence, journal/recovery limits and release
> blockers, use `docs/audits/e2ee-20261003.md` and
> `docs/audits/e2ee-release-20261003.md`. The release report records current gates.

## Release Boundary

This phase adds a native-browser authenticated-encryption codec and an opt-in,
owner-scoped PostgreSQL backup API. It does **not** enable encrypted conversations,
private-media uploads, a recovery screen, or cryptographic device enrollment.
The production chat remains legacy plaintext. No encrypted badge is introduced.
No Phoenix instance-count or CSP setting is changed.

The operator selected a device-generated, user-held recovery key and explicitly
declined adding `wasm-unsafe-eval` to CSP. The codec uses the browser's native
Web Crypto implementation; it downloads no crypto dependency and uses neither
WebAssembly nor JavaScript eval. The isolated unaudited MLS experiment remains
outside the production application.

Follow-up 2026-10-03 adds a disabled own-account cryptographic device/package
API, browser vault/recovery clients and an isolated private ciphertext storage
adapter. These are candidate integration foundations, not an enabled encrypted
messaging workflow. See the current evidence and limits below.

## Ciphertext Formats

`src/chat/secure-content.js` exposes a lazy `loadSecureContent()` and an injectable
`createSecureContent()` for tests. It uses AES-256-GCM, a fresh random 96-bit nonce
per encryption and a 128-bit authentication tag. Keys are generated using
`crypto.getRandomValues` and imported as non-extractable native keys.
Algorithm identifier: `webcrypto-aes256gcm-v1`.

Media format version 2 is `WINGAEM2`, a 12-byte nonce, and one authenticated
ciphertext. The encrypted payload contains a 4-byte big-endian metadata length,
UTF-8 JSON metadata, and the original bytes. Filename and MIME type are inside
the ciphertext. Associated data binds format, algorithm, conversation ID and
attachment ID. Each attachment has a fresh 256-bit key. Its descriptor includes
that key and is secret: it must travel only inside a future authenticated E2EE
message or encrypted recovery archive, never a public URL, upload metadata,
plaintext message, log or telemetry event.

This is bounded whole-file encryption, **not** streaming encryption. Original
media is capped at 8 MiB; metadata at 4 KiB. Encryption temporarily holds multiple
copies of the file. Larger video requires a separately reviewed streaming design,
not splitting bytes into unauthenticated chunks or falling back to plaintext.
Decryption returns no partial plaintext before authentication and length checks.
Unknown format versions, extra descriptor fields, wrong bindings, wrong keys,
modified nonces, truncated ciphertext and appended bytes are rejected.

Recovery keys are 32 random bytes encoded as canonical unpadded base64url.
Recovery capsule version 1 binds algorithm, purpose `history-recovery`, account,
archive ID and generation as associated data. Archives are nonempty byte arrays
capped at 4 MiB. Only ciphertext, nonce and binding fields belong on the server.
The user must keep the key outside Winga storage. Losing both usable device data
and the user-held key makes recovery impossible; password reset is not recovery.

Owned temporary byte arrays are cleared on completion/error. JavaScript strings,
engine copies, native keys and garbage collection cannot be guaranteed erased.
Same-origin malicious scripts can use decrypted data or keys; this does not
defend against XSS, a compromised browser/device or malicious application updates.
The primitive is standardized; Winga's framing and integrations are not an
independently audited messaging protocol.

Reference: [W3C Web Crypto AES-GCM](https://www.w3.org/TR/webcrypto/#aes-gcm).

## Durable Backup API

Migration `2026100201_encrypted_conversation_backups` adds one owner-keyed table.
It does not rewrite existing message bodies or receipts. Account deletion cascades
to this table. This alone does not prove deletion from database snapshots,
provider backups, other devices or future private-media storage.

`/api/conversations/recovery` remains disabled unless the backend explicitly sets
`WINGA_ENCRYPTED_BACKUP_ENABLED=true`. Keep the flag absent/false until the actual
recovery workflow and security gates below are accepted. The API has no JSON-store
fallback. It uses existing origin, CSRF and JSON-content-type protection and emits
private/no-store responses. Owner comes from the authenticated session, not input.
Every transaction rechecks the active account, live session token and session ID.

- GET returns `{version, revision, capsule}`; initial revision is string `"0"`.
- PUT accepts exactly `{expectedRevision, capsule}`. Capsule generation must equal
  the expected revision plus one. The owner row is locked to serialize updates.
- Retrying the exact accepted capsule is idempotent even after JSONB key reordering.
  A conflicting or stale write returns 409; do not reseal a retry with a new nonce.
- DELETE accepts exactly `{expectedRevision}`. It increments revision and retains
  a null-capsule tombstone, preventing stale writes from resurrecting the backup.
  An uncertain DELETE must be reconciled with GET; it is not blindly retried.

The server validates format, size and owner/generation claims. Without the user
key it cannot prove ciphertext decryptability. A fresh device cannot detect a
malicious server rolling back an entire valid historical capsule using a server
revision alone; independent freshness/trust design remains required.

## Browser Vault And Recovery Client

`src/chat/encrypted-vault.js` binds storage to the current authenticated owner and
session. The local nonextractable AES-256-GCM key is stored separately from the
ciphertext records in IndexedDB. Atomic revision-CAS transactions serialize tabs
and related state/outbox changes. At most 2,000 records, 4 MiB plaintext per
record and 32 MiB aggregate ciphertext are accepted. Oversized transactions roll
back instead of committing an unreadable vault. Corrupt data or a missing key
never triggers silent reset. Binary and bigint values roundtrip; `$bytes` and
`$integer` are reserved serialization tags, not ordinary user record fields.
This storage foundation is not yet connected to a production MLS ratchet.

`src/chat/recovery-client.js` archives only `history:*` records. It retains the
exact sealed pending capsule before PUT and reconciles exact accepted retries
after reload. It verifies the prior backup and retains its immutable history
records even when they have been evicted locally. Conflicting versions fail
closed. Identity keys, MLS group state and pending message outboxes are excluded.
Recovered history does not authorize a new identity or restore live group access.

Each accepted backup produces a checkpoint `{v, owner, revision, hash}`. Keep the
latest checkpoint independently with the user-held key or a trusted device. A
fresh device refuses recovery without it. Server-reported revisions alone cannot
establish freshness; an old independently supplied checkpoint cannot prove that
no later backup exists. Local retained checkpoints reject explicit downgrade.
User-facing key confirmation/download, checkpoint retention, rotation, pending
conflict reconciliation, archive schema and authorized fresh group Welcome remain
release gates. Internal errors carry machine-readable `code`; UI boundaries must
translate them and must not display raw exception messages.

## Private Ciphertext Storage Candidate

`backend/conversation-private-media.js` never uses the marketplace public bucket
or legacy backup bucket. Required configuration is `R2_ACCOUNT_ID`,
`R2_BUCKET_NAME` (public bucket exclusion), `R2_CONVERSATION_BUCKET_NAME`,
`R2_CONVERSATION_ACCESS_KEY_ID`, `R2_CONVERSATION_SECRET_ACCESS_KEY`,
`R2_CONVERSATION_API_TOKEN` and `R2_CONVERSATION_ISOLATION_CONFIRMED=true`.
Use separate bucket-scoped credentials; the adapter cannot prove credential
scope from their strings. No production environment variable was added here.

Every operation requires an injected authorization function to return exactly
true. Caller objects are captured immutably before awaits. Privacy checks require
managed public access disabled and zero custom-domain attachments, before and
after storage I/O. Both access paths must be checked independently according to
[Cloudflare public-bucket documentation](https://developers.cloudflare.com/r2/buckets/public-buckets/).
Only opaque attachment UUID, ciphertext size and SHA-256 go into the object
reference. Content type is `application/octet-stream`, caching private/no-store.
Uploads are conditional and read back for exact hash/length verification;
downloads are bounded and reauthorized before returning bytes. No plaintext key,
filename, original MIME, public URL, presigned URL or partial plaintext is emitted.

This module has fake-S3/privacy failure tests, not actual R2 acceptance. It has no
HTTP route, attachment reservation/grant schema or orphan cleanup ledger yet.
It cannot replace current membership/device/epoch authorization with caller
claims. A revoked in-flight upload may leave an opaque orphan; never publish it
or delete an uncertain existing object in the retry path. Durable reservations,
grants, cleanup, quota enforcement and final canonical message acceptance are
required before activating media uploads.

## Verification And Deployment

The focused Node suite covers roundtrip, tampering, wrong keys, account/archive
binding, payload limits, revoked sessions, revision conflicts, deletion tombstones,
owner isolation, JSONB retry canonicalization and aggregate-only verification.
PGlite store tests are not independent-connection PostgreSQL concurrency proof.
Browser tests use independent synthetic storage, strict `script-src 'self'`,
mobile/desktop viewports and complete Edge process shutdown/restart. The user
key is held outside browser storage by the runner. They do not prove Android
physical-device behavior or authenticated production recovery.

Commands:

```text
npm run test:secure-content
npm run test:secure-content-browser
npm run build:vercel
npm run verify:modules-sync
```

After the additive migration has deployed, Render Web Shell can run:

```text
cd /opt/render/project/src/backend
npm run verify:encrypted-conversation-backups
```

The verifier runs a repeatable-read, read-only transaction. It prints only schema
flags and aggregate shape counts, never keys, account IDs or ciphertext. Its
`authenticatedRecoveryFlowVerified`, `encryptionIntegrityVerified` and
`crossConnectionConcurrencyVerified` intentionally remain false. `ok:true`
means structural checks passed, not that recovery or E2EE is complete.

## Remaining Acceptance

1. Select and independently review a pinned browser messaging protocol compatible
   with unchanged CSP; production cryptographic device enrollment and verified
   peer identity must precede its use. The current MLS spike is not approved.
2. Complete persistent conversation encryption mode integration (the irreversible
   reservation/legacy downgrade guard exists but has no activation API), authenticated envelopes,
   per-device key distribution/revocation, atomic encrypted state/outbox writes,
   replay rejection and no downgrade across REST/Phoenix/retry paths.
3. Connect the codec to authenticated private ciphertext storage with durable
   attachment grants, ownership/member checks and safe rendering. Existing public
   product-media storage must not receive conversation ciphertext descriptors.
4. Build the user-key confirmation/download/restore workflow and versioned history
   archive. Restore history and permitted attachment keys, not stale live ratchet
   state or revoked-device credentials. Verify recovery in a fresh authorized
   device, key rotation, trusted freshness, logout and account erasure.
5. Extend the passing independent PostgreSQL enrollment/logout/revocation races
   to final encrypted acceptance/rekey/grants, and run actual Android PWA restart/recovery, fault
   injection, dependency/license review and an independent security assessment
   on the final integrated design before enabling production encrypted chat.
