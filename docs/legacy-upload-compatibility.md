# Opt-in legacy public URL compatibility

## Runtime evidence before this patch

The operator's post-cutover audit on `35c62d28ebe3cae4c311128a958b4a96641258da`
found all 93 journaled products unchanged and public, all 357 journaled files
still on disk, and 238 files outside the applied journal. Chat had 29 structured
snapshot items: 7 exact journal candidates on disk, and 22 items referencing
19 missing files whose products also no longer exist. No malformed snapshots
were reported. This patch does not invent replacements for those 19 images.

## Implementation and ownership

Existing `/uploads/<name>` and `/__winga-image__?u=/uploads/<name>` requests can
now use the existing bounded R2 reader and image-response handler. The feature
is OFF unless `WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED=true` at backend startup.
No messages, products, orders, timestamps, replay journals or notification records
are rewritten. The old snapshot URL itself continues to work when authorized.

Primary PostgreSQL authorization requires:

- The exact filename has a valid SHA-256 in an applied cutover journal.
- Its original product/image family is identified by that journal, not a guessed
  product name or current alternative image.
- That product still belongs to the journaled owner, is approved/public, and has
  an active owner and a current image reference to the journaled CDN namespace.
- No matching current private/followers/pending/rejected product or identity
  reference overlaps the file/family, whether using the old or journal CDN URL.

Image-family authorization does not invent remote variants: the requested file
must itself exist in the verified journal. Journal/candidate reads are bounded;
overflow, inconsistent hashes and primary failure deny delivery. Authorization
is rechecked after remote I/O. R2 metadata checksum AND the journal checksum
must match the returned bytes. No redirect exposes a new location.

Mapped files NEVER fall back to disk if R2 fails. A known but denied/rolled-back
mapping returns 404; authorization/storage/integrity failure returns 503. Neither
falls through to the existing local route. Unknown supported image filenames
retain the existing local route while disk remains; this is not public-copy permission.
Flag off leaves existing routing unchanged without querying the journal.

The shared reader bounds each response to 8 MiB, has remote timeouts, and caps
each handler at four concurrent media reads. Responses include `private, no-store`,
`nosniff`, correct image MIME/length, and `X-Winga-Media-Source: r2`. GET and HEAD
use the same validation; HEAD validates bytes but returns no body. Aggregate
`legacy_upload_compatibility_read` events include status/outcome/duration only.

## Rollout

Keep the Render disk mounted. Deploy the tested backend commit first. In the
existing Render API service Environment, add:

```text
WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED=true
```

Save/redeploy and wait for Live. Existing R2 configuration and PostgreSQL are
reused. Do not change the public bucket, private backup bucket or Worker config.
This flag is distinct from the earlier isolated canary flag
`WINGA_LEGACY_PUBLIC_R2_READ_ENABLED`.

Then run in Render Shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run verify:legacy-upload-compat
```

The verifier reads only applied journal hashes from PostgreSQL, checks ALL
recorded files through the Render origin's original `/uploads/` URLs, and checks
GET/HEAD plus an image-proxy sample. It streams and hashes responses, requires
R2 source and no-store headers, rejects redirects, and rechecks journal stability.
It does not read the source disk, upload or mutate anything. No empty inventory,
partial result, disk response or missing object counts as success. Progress is
aggregate only. Configuration may override the origin with
`WINGA_MEDIA_VERIFY_ORIGIN`, but use the direct API origin for this proof.

If a product was removed/restricted after the earlier audit, an affected URL
correctly stops the all-recorded-files proof. Inspect the current audit instead
of weakening authorization or silently skipping that file.

After success, reopen historical product cards in Inbox and check that messages,
unread state, reply/forward/delete, and product links remain intact. The seven
candidate items should use original images through compatible URLs. Missing
historical images retain existing not-found/fallback behavior, not fake recovery.
Physical-device/production checks are not replaced by unit tests.

## Rollback and boundaries

Set `WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED=false` and redeploy to restore the
previous disk route. No database rollback is required for this feature. Keep
source files during rollout. Disable this flag BEFORE a separate product-URL
cutover rollback: rolled-back journals deliberately deny while compatibility is on.

The original patch proved ORIGIN compatibility only. Its Worker cache gap is
addressed separately in `docs/legacy-media-edge-policy.md`; the original backend
deployment alone did not change Worker behavior. Direct public R2 URLs retain
their existing public-access policy. Do not claim end-to-end visibility revocation
or disk independence from the origin result.

Unknown/private historical files, local normalization/fallback/metadata/cleanup,
file-store-mode safety and the 19 already-missing image files remain separate
gates. The verified private backup is not automatically a private media service.
`diskRemovalReady` and `crossNodeFailoverProven` remain false even after this
verifier passes. Do not detach disk, add production instances or drain a node
based only on this result.

## Verification

`npm run test:ci` passed in full: module synchronization, private backup 17/17,
media 61/61, realtime 38/38, paging/replay 35/35, commerce 71/71, additional
frontend 54/54, localization/frontend-core checks, integration 220/220, and
browser E2E 147/147. No retries, skipped assertions or unrelated UI changes
were introduced to obtain this run. Earlier intermittent CI failures remain
historical evidence, not bugs claimed fixed by this storage patch.

The 11 new tests cover primary-only SQL authorization, variants, active owners,
restricted/identity overlaps, rollback/deletion/ownership changes, unknown paths,
checksum mismatch, remote and database outages, visibility revocation during I/O,
real HTTP GET/HEAD/proxy proof and manifest conflicts. Actual isolated backend
processes verify that flag-off legacy delivery is preserved and flag-on with no
primary authority returns 503 even when the file exists locally. The HTTP proof
fixture has no source-disk dependency. Existing canary regression tests also pass.

The operator subsequently proved all 357 origin URLs / 43,063,737 bytes at
`66f1e3c5eb9138b1ddb3770200883cac92db95cc`, including stable journal, proxy sample,
R2 headers and matching bytes without disk fallback or verifier disk reads.
Authenticated physical-device chat checks, production load/latency, Worker
delivery and cross-node failover are not proven by that result. Keep the disk.
