# Encrypted Chat Acceptance: 2026-10-04

## Scope And Current Evidence

The operator confirmed encrypted text delivery between two real devices and
two different accounts after the cookie/session-ID fixes. That is operator
functional acceptance, not an independent cryptographic audit.

This increment connects raster attachment preview/download, user-held recovery
key replacement and the existing approve/revoke/contact-verified replacement
flows. Preview validates MIME and raster signatures, bounds decoded dimensions,
revokes temporary URLs on close and dismisses after session/visibility changes.
SVG/HTML are download-only and are never executed by the preview.

Recovery retains the latest 1,999 history entries within 2 MiB. It requires the
user-held key and latest independently retained checkpoint. A replacement key
opens the prior archive only with the old key and reseals it with the new key;
the new file must be saved and its key confirmed. Lost accepted responses retry
the exact pending capsule. Replacing the key does not revoke already copied
old archives and does not erase old devices' downloaded history.

Recovery does not restore native device identity, live MLS state, memberships or
pending messages. A new device still needs native approval and independently
verified contact replacement. Historical attachment download remains restricted
to the original epoch's authorized device: changing that policy requires the
operator's explicit decision. A restored descriptor/key alone does not bypass
server authorization. Do not claim full historical attachment recovery on a
replacement device under this policy.

The original code increment did not change production flags, accounts, keys or
database rows. Subsequent operator evidence below records private R2 setup and
feature activation. Production attachment/recovery acceptance and independent
ts-mls/crypto review remain open; service-wide activation is not an audited
account-scoped pilot.

## Operator Evidence And Reliability Follow-Up

The operator supplied a successful private storage probe: synthetic ciphertext
and plaintext roundtrips passed and deletion was acknowledged, with no database
changes. The latest read-only readiness report shows all eight migrations and
two guards ready, private-domain checks passing, and both encrypted media and
recovery enabled. Credential scope is operator-attested, not independently
verified. The report contains zero stored backups and does not prove authenticated
media, recovery, replacement-device flows or cryptographic audit approval.

A browser test reproduced a temporary crypto-script HTTP 503 leaving a rejected
startup promise cached until reload. Failed loads now discard that promise and
the failed script, allowing a fresh attempt without plaintext fallback or device
reset. The cookie-only encrypted browser workflow passes without reloading after
the injected failure, including its existing messaging, media and recovery flows.
These are local embedded-PostgreSQL/mock-storage results, not production accounts.

The frontend deployment command now preserves Cloudflare dashboard variables
with `--keep-vars`. Reconnect/transport regression tests pass 61/61; push, offline
retry and receipt tests pass 40/40; frontend core checks and 68/68 behavior tests
pass. The transport fixture now models encryption-sync intervals and waits for
the send to be staged before advancing its fake clock. No production secret,
CSP, device authorization or historical attachment policy was changed.

## Private R2 Setup

Local verification completed: 103/103 encrypted-content Node tests, 32/32
strict-CSP browser tests, the frontend core checks and 68/68 frontend behavior
tests passed. All four catalogs retain 1,385 matching keys with no new hardcoded
UI debt. Mobile/desktop preview and mobile recovery screenshots were inspected;
81 source modules match build `20261004111731`. The browser fixture uses embedded
PostgreSQL and a mock object store, not the production R2 bucket or accounts.
The initial browser run was interrupted by a concurrent build removing an icon;
the fixture now reads the same Lucide source independently and the rerun passed.
These results do not establish a deployment or physical-device media acceptance.

1. Create `winga-chat-private` in Cloudflare R2 with Standard storage and the
   default jurisdiction. Keep Public Development URL disabled and do not attach
   a custom domain. The current adapter uses the default R2 endpoint.
2. Create a separate R2 Object Read & Write token, scoped only to this bucket.
   Retain its Access Key ID and Secret Access Key privately. Never reuse the
   public marketplace object's write credentials.
3. Create a separate Cloudflare API token with account-specific Workers R2
   Storage Read permission, to inspect managed/custom domain configuration.
   This permission is account-scoped and includes read access; treat it as a
   secret. Do not use a Global API Key. The bucket-scoped Object token cannot
   inspect configuration through the Cloudflare REST API.
4. Add these to Render's WINGA backend Environment, not Phoenix:

```text
R2_CONVERSATION_BUCKET_NAME=winga-chat-private
R2_CONVERSATION_ACCESS_KEY_ID=<scoped Access Key ID>
R2_CONVERSATION_SECRET_ACCESS_KEY=<scoped Secret Access Key>
R2_CONVERSATION_API_TOKEN=<read-only configuration token>
R2_CONVERSATION_ISOLATION_CONFIRMED=true
WINGA_ENCRYPTED_MEDIA_ENABLED=false
WINGA_ENCRYPTED_BACKUP_ENABLED=false
```

Preserve the existing `R2_ACCOUNT_ID` and public `R2_BUCKET_NAME`. Set isolation
confirmation only after reviewing the actual privacy and object-token scope.
The verifier checks privacy but cannot independently establish credential scope.
Never paste these secrets into chat or screenshots.

Reference: [Cloudflare R2 authentication](https://developers.cloudflare.com/r2/api/tokens/)
and [bucket creation](https://developers.cloudflare.com/r2/buckets/create-buckets/).

## Render Verification

After the backend containing this command is Live, use its Web Shell:

```sh
cd /opt/render/project/src/backend
npm run verify:encrypted-chat-readiness
```

This performs a read-only database snapshot and private-domain configuration
checks. It reports aggregate schema, guard, backup and flag evidence. It does
not activate features, upload objects or certify real device flows or audit
approval. A failed privacy/configuration check must be repaired before proceeding.

For an explicitly approved synthetic storage probe only:

```sh
npm run verify:encrypted-chat-readiness -- --storage-probe --confirm=probe-private-encrypted-media
```

The probe writes one new randomly named ciphertext object, reads/decrypts it and
requests deletion. It never modifies application database rows. A deletion ACK
is reported as `cleanupAcknowledged`, not an independently confirmed absence.
`PRIVATE_ENCRYPTED_STORAGE_CLEANUP_REQUIRED` needs operator follow-up before
another probe. Synthetic roundtrip success is not authenticated media acceptance.

## Controlled Acceptance

Only after preflight, private storage probe and explicit release approval:

1. Enable only the approved media/recovery features on the backend. Refresh both
   test devices. Exchange an encrypted raster image and a non-image file;
   verify sender and receiver download/preview, sent/delivered/read, reload,
   offline retry, exact lost-response recovery and no plaintext fallback.
2. Export the recovery file outside Winga, replace its key and retain the newest
   checkpoint. Restore bounded text history on a fresh device; prove wrong
   key, wrong owner, stale checkpoint and server rollback are refused without
   overwriting history. A recovery file alone must not grant live membership.
3. Approve the fresh device from an active identity, verify replacement from
   the contact, then revoke the old device. Confirm pending/unselected/revoked
   devices cannot send, download or decrypt future messages. Original-epoch
   attachments must still be denied to the replacement under current policy.
4. Record physical Android/PWA behavior, actual private bucket evidence and the
   independent crypto review outcome separately from local browser fixtures.

Disabling encrypted routes is a kill switch, not a rollback to plaintext.
Preserve ciphertext, checkpoints, epochs, device tombstones and pending state.
