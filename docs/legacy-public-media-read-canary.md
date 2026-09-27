# Legacy public media R2 read canary

## Why the disk cannot be detached yet

Operator evidence now establishes the private backup and its independent R2
verification: 238 files, 15,202,912 bytes, manifest
`3e248d86f02a08f01bbcc519f0bd79836ead9c6ee92a261bb3d2393520d64019`.
This is backup evidence, not proof the app no longer needs its disk.

The serving-path audit found:

- `backend/server.js`: `/uploads/` and `/__winga-image__` stream local files.
  These old routes do not consult current product visibility before serving
  a known filename. The private backup must NEVER become their fallback.
- `resolveProductImageForDelivery` and `repairNormalizedProductImageState`
  remove missing local references from product responses; changing only the
  HTTP image handler would therefore still lose product images after detachment.
- `enrichStoredProductImageMetadata`, `normalizeProductImages`,
  `saveDataUrlImage`, and `cleanupUnusedLocalImages` still use local files.
  Non-product/profile/identity write paths need a separate private storage plan.
- `worker.js:handleImageCache` returns cached `/uploads/` bytes before contacting
  the origin and forces public caching. A new backend permission check alone
  cannot revoke previously cached bytes. Edge/cache migration and old R2 public
  mirror revocation need coordinated treatment before a serving cutover.
- The 19 missing references are historical message product-item image paths,
  with no stored siblings. This patch neither repairs nor rewrites them.

## Implemented scope

This patch adds an isolated GET/HEAD canary:

```text
/api/media/legacy-public/<flat-image-filename>
```

It is disabled by default. The existing app does NOT emit these URLs. Existing
`/uploads/`, image proxy, frontend Worker and database URLs remain unchanged.
No database migration or new credentials are needed for the canary.

When enabled:

1. Validate the flat supported filename; no arbitrary URL/path fetching.
2. Query PRIMARY canonical products, visibility and owner status. Require a
   current approved public product and active owner. A restricted/identity
   overlap denies access. Unknown/unreferenced/deleted media is denied.
3. Request only `products/legacy/<name>` from the existing PUBLIC product R2
   bucket using existing server credentials. Private backup is not consulted.
4. Read at most 8 MiB and verify SHA-256 against metadata written by the
   verified public-copy script. R2 request/body timeouts are bounded.
5. If remote storage fails, read the authorized local file as a temporary
   fallback. Database/authorization failures NEVER use storage fallback.
6. Recheck current authorization after I/O, before sending bytes.
7. Return `Cache-Control: private, no-store` and source header
   `X-Winga-Media-Source: r2` or `disk_fallback`. Never redirect to the public CDN.

Success is 200. Denied/unknown/disabled is 404. Unavailable authorization or
storage is 503. Unsupported methods are 405. Existing API rate limiting uses
one shared 30-per-window bucket for these paths, and each process allows only
four concurrent canary reads. The new canary outcome event records outcome/status/duration only,
without filenames, message text, identities, bucket credentials or private URLs.

The primary lookup is a bounded candidate scan (101 rows fail closed; exact
structured references decide authorization), not a high-volume media catalog.
Do not switch the whole feed to this path without load measurements and an
indexed media-reference strategy. This endpoint handles anonymous-public product
media only; it is not an authenticated private/followers media delivery design.
It does not retrofit per-viewer block policy onto existing public asset URLs.

## Controlled Render verification

After the canary commit is Live, add to the Render API Environment:

```text
WINGA_LEGACY_PUBLIC_R2_READ_ENABLED=true
```

Save and wait for the new deploy to be Live. Do not change any existing R2
credentials, public URL, uploads directory or disk settings. In Render Shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run verify:legacy-public-r2
```

The verifier reads at most five public product pages and samples up to three
legacy image names. It compares canary bytes with the current Render `/uploads/`
bytes and validates HEAD/source/cache headers. It never prints image names or
private information. It fails if the canary silently used disk fallback, has
unsafe caching, mismatched bytes or no eligible sample. This is a sample, not
full-inventory acceptance and not proof of physical-device performance.

Expected fields: `r2ReadProven: true`, `legacyBytesMatch: true`, `verified > 0`.
`servingPathSwitched` and `diskRemovalReady` remain false. Copy/backup success
alone cannot flip either field. Keep the Render disk.

Rollback: remove the flag or set it to `false`, redeploy. Existing app image URLs
remain untouched. No copied objects or private manifests are deleted by this
patch. The frontend Worker does not need deployment for this canary.

## Remaining cutover gates

### Production sample and full-inventory verification

The operator ran commit `2879d549f03c4b48f820605b60348b3d02ebc109` on Render.
The HTTP canary verified 3 images / 181,240 bytes with `r2ReadProven: true`
and `legacyBytesMatch: true`. No database or serving-path changes occurred.
This closes the sampled HTTP-read gate only, not inventory or disk independence.

After the full-inventory verifier commit is Live, run in Render Shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run verify:legacy-public-r2:all
```

This command uses the existing DATABASE_URL, WINGA_UPLOADS_DIR and public R2
configuration. No new token or configuration is needed. It is a sequential,
read-only CLI, not a public API endpoint. PostgreSQL uses read-only transactions
with a 20-second statement timeout; the command does not initialize schemas.

It reuses the public-copy audit to select current approved-public references
and their stored responsive variants. It then applies the same primary owner,
visibility and restricted-overlap checks as the canary before and after each
R2 read. SHA-256 metadata and actual remote bytes must match bounded source
disk bytes. There is no local fallback for remote failure and no PUT/DELETE.
Unclassified/private files are not uploaded or read as media by this verifier.

At the end it rechecks authorization and source hashes for every selected file,
then rereads the inventory and canonical references to detect selection/size
changes. A changed or unavailable source, denied permission, database failure,
missing/corrupt remote object, empty selection or scope drift returns `ok: false`
and a sanitized code. Partial verified counts are not a success. Progress and
results contain aggregate counts only. Each media read remains capped at 8 MiB;
over 10,000 candidates or over 30 minutes fails instead of claiming completion.

Success requires `fullPublicInventoryVerified`, `inventoryStable` and
`authorizationRechecked` all true, and `verified === planned`. The planned
count is derived from current records, not hard-coded to the earlier 357.
`sourceDiskRequired` stays true because the source is the comparison authority.
`httpDeliveryVerified` stays false: the full command reads the S3 API directly,
not the HTTP canary. Keep the separate three-image HTTP proof.

This is a live, point-in-time check, not a lock or transaction spanning disk,
PostgreSQL and R2. It cannot guarantee future writes or detect every transient
change that is reverted between checks. Rerun close to a coordinated cutover;
never treat it as permanent authorization or a migration manifest. If selection
drifts, rerun after the relevant posting/moderation activity settles. If it
fails, keep disk and current URLs and investigate the aggregate error first.

Direct S3 reads avoid CDN caches; cached custom-domain responses have separate
invalidation requirements. See Cloudflare's
[R2 consistency and caching documentation](https://developers.cloudflare.com/r2/reference/consistency/).

Rollback is simply to stop using the new command (or revert its code). No
automatic remediation, copying, credential changes or disk removal occurs.

### Serving cutover still pending

Current-media reference/index design, authorized private/profile/identity media,
old public mirror revocation, Worker caching/invalidation, missing-local repair
logic, all remaining disk writes, historical missing-reference recovery or
explicit unavailable handling, full-inventory runtime validation and coordinated
write/cutover tests remain pending. Only after these gates may disk detachment
and two-instance cross-node failover be considered.
