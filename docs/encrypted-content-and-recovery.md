# Encrypted content and user-key recovery

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
2. Implement persistent conversation encryption mode, authenticated envelopes,
   per-device key distribution/revocation, atomic encrypted state/outbox writes,
   replay rejection and no downgrade across REST/Phoenix/retry paths.
3. Connect the codec to authenticated private ciphertext storage with durable
   attachment grants, ownership/member checks and safe rendering. Existing public
   product-media storage must not receive conversation ciphertext descriptors.
4. Build the user-key confirmation/download/restore workflow and versioned history
   archive. Restore history and permitted attachment keys, not stale live ratchet
   state or revoked-device credentials. Verify recovery in a fresh authorized
   device, key rotation, trusted freshness, logout and account erasure.
5. Run independent PostgreSQL races, actual Android PWA restart/recovery, fault
   injection, dependency/license review and an independent security assessment
   on the final integrated design before enabling production encrypted chat.
