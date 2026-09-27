# Opt-in remote-only media and artifact policy

## Scope and defaults

`WINGA_MEDIA_STORAGE_MODE=remote_only` is an explicit, reversible backend mode.
Unset (or `hybrid`) preserves existing production/local-development behavior.
No deployment command enables the mode automatically. No migration, URL
rewrite, R2 ACL change, disk deletion or Cloudflare change is part of this patch.

The operator has supplied a successful 357-file frontend compatibility check.
That is a legacy read gate, not proof every live write or audit is disk-free.

## Audited dependencies and behavior

| Existing owner/function | Remote-only behavior |
| --- | --- |
| `initializeStoreAtBoot` / `ensureLocalArtifacts` | No data/upload directory creation or seed file. Any attempted legacy-store access throws. Empty PostgreSQL cannot silently seed from local disk. |
| `appendAuditLog` | Canonical PostgreSQL audit only; no additional local audit.log. Database failure remains an error, never local fallback. |
| `persistIncomingProductImages` | Existing bounded Sharp variants and R2 uploader; no local write when configuration is lost or R2 fails. Product persistence occurs after upload success. |
| `saveDataUrlImage` during historical normalization | Preserves the historical reference/inline data without writing a new local file. New product uploads still go through asynchronous persistence first. |
| `resolveProductImageForDelivery` / repair | Local absence cannot erase a reference or substitute a placeholder. HTTP authorization/delivery decides availability. |
| Local metadata backfill | Not queued/read. Existing metadata and new-upload dimensions are retained. Historical missing metadata stays unknown; no unbounded remote fetch is added. |
| `cleanupUnusedLocalImages` | No local stat/unlink. R2 garbage collection is not introduced. |
| Legacy compatibility route | Existing primary/journal authorization and integrity checks. Unmapped references return private/no-store 404 without touching disk. Known unavailable R2/authorization returns 503; revoked media 404. |
| Public read canary | Local fallback disabled; R2 outage remains 503. |
| Image consistency summary | Remote availability is `not_checked`, with null counts, not fabricated zero broken images. |

Startup requires PostgreSQL configuration, complete R2 configuration with an
HTTPS public base (not an `/uploads` compatibility URL), and
`WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED=true`. Invalid explicit modes fail closed.
These are configuration checks, NOT credential, reachability or inventory proof.
Existing private profile/identity inline storage is unchanged; the private backup
bucket is not repurposed as public serving storage. The 19 missing historical
references remain unavailable, not deleted, fabricated or marked recovered.

## Observability

`GET /api/ops/media/storage-policy` reuses `X-Ops-Health-Token` authorization.
Absent configured token: 503; missing/wrong token: 401. Responses are no-store.
It reports mode, local-media/local-artifact policy, and compatibility flag only.
No paths, credentials, filenames, private message content or buyer identifiers.
`diskRemovalReady` and `crossNodeFailoverProven` remain false. Startup emits the
aggregate `media_storage_policy` event. Policy is not an actual I/O counter or
proof of storage connectivity.

## Controlled rollout (disk retained)

1. Confirm Bot Fight Mode is ON again. Do not repeatedly disable protection.
2. Deploy the tested commit with mode unset; existing behavior remains unchanged.
3. Check current production audit/inventory and retain the public cutover journal,
   the independently verified private backup, and the mounted disk. A previous
   snapshot does not cover any later writes automatically.
4. For a controlled observation window set only
   `WINGA_MEDIA_STORAGE_MODE=remote_only` in Render. Keep all existing database,
   R2, compatibility and uploads-directory settings. Do not detach the disk.
5. Confirm readiness and inspect mode in Render Shell without printing secrets:

```bash
node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/api/ops/media/storage-policy",{headers:{"X-Ops-Health-Token":process.env.OPS_HEALTH_TOKEN||""}}).then(async r=>{console.log(JSON.stringify({httpStatus:r.status,...await r.json()},null,2));if(!r.ok)process.exitCode=1}).catch(()=>{console.error("STORAGE_POLICY_CHECK_FAILED");process.exitCode=1})'
npm run verify:legacy-upload-compat -- --diagnose
```

The second command defaults to the Render API origin; do not set the edge env
override while Bot Fight Mode challenges server-side traffic. Earlier edge
proof remains scoped to its test window. Then verify real-browser Home/images,
old conversation product cards, authenticated new image upload/edit/delete,
profile/identity handling and canonical audit persistence. Confirm unavailable
historical images are handled without losing message/order history.

6. Roll back any regression by restoring mode to `hybrid` and redeploying with
   the retained disk. No journal/database rollback is required for the mode flag.

## Verification and limits

The focused tests run the real backend HTTP server with test-only database and
R2 adapters. Filesystem guards fail AND record every attempted data/upload
access, including exists/stat/read/write/cleanup. Tests cover GET/HEAD/proxy,
unknown 404, R2/authorization 503, revocation 404, canary no-fallback, retained
references, optimized upload dimensions, edit/delete cleanup, audit persistence
and failure, endpoint auth, invalid prerequisites and empty database startup.
Existing hybrid/local behavior is covered by the existing suites.

These fixtures do not prove live PostgreSQL/R2 availability, disk-detachment
safety, two-node failover, private CDN revocation or physical mobile behavior.
An audit failure after a completed domain write can still return 500 under the
existing contract; this patch does not add transactional outbox/idempotency to
product mutations. R2 orphan cleanup and storage-aware historical metadata
backfill are separate work; no data is deleted as a shortcut.

Full `npm run test:ci` passed on this patch: private backup 17/17, legacy media
78/78 (including the three new remote-only tests), realtime 38/38, message pages
35/35, commerce 71/71, frontend core 144/144 plus frontend suites 54/54,
integration 220/220 and browser E2E 147/147. Module synchronization and
localization gates passed; `git diff --check` passed. No UI changes or test
assertion weakening were needed. Production mode activation remains pending
operator configuration and runtime evidence, separately from CI success.

## Production observation after activation

The operator supplied Render evidence from `7302396` showing the policy endpoint
returned HTTP 200 with `mode: remote_only`, local media/artifact access disabled,
and legacy compatibility enabled. The direct Render-origin verifier checked all
357 journaled files (43,063,737 bytes), stable manifest and proxy sample with
R2 source and no observed disk fallback. `edgePolicyVerified: false` is expected
for this direct-origin run; earlier frontend-domain edge proof is separate.

The operator then reported a newly uploaded image and historical images visible
in the app. A subsequent read-only post-cutover audit still counted 595 files /
58,266,649 bytes on disk, with 93/93 journal products unchanged and all 357
journaled files retained. The separately verified private backup remained
238/238 files and 15,202,912 bytes, with a valid manifest and no source-disk
read by the backup verifier. These observations support the live remote-only
read/write path, but aggregate disk counts do not prove every file hash stayed
unchanged or that every application workflow is disk-free.

The 19 unique missing historical chat-image references remain missing. The
post-cutover audit's 595 unclassified files are expected after product URLs
moved to R2; this is not a new classification of those files as disposable.
The audit does not recheck local hashes, remote delivery or the private backup
in one atomic snapshot. Bot Fight Mode restoration to ON is not yet confirmed.
Keep the disk mounted. Disk detachment, authenticated conversation/profile
checks on a diskless instance and genuine two-node failover remain unproven.

## Combined retained-disk coverage gate

After deploying the verifier, run this only on the Render API service while
the original disk remains mounted and `remote_only` remains active:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run verify:legacy-disk-coverage -- --backup-id=3e248d86f02a08f01bbcc519f0bd79836ead9c6ee92a261bb3d2393520d64019
```

The command is read-only. It requires the live ops endpoint to report
`remote_only`; rechecks the private bucket's non-public status, its manifest
and every private object; requires every retained disk filename to belong to
exactly one applied public journal or the verified private manifest; and
compares local bytes with public R2 hashes or private backup hashes. It reads
each local file twice, checks live public authorization before/after R2 reads
and once more at the end, then rechecks disk inventory, relevant database rows
and the live policy. Results and progress contain aggregate counts only.
Remote storage/SQL/ops failures, changed hashes, overlaps, gaps or an edited
cutover product fail closed. The source disk is needed to run this command.

A passing result would establish coverage for the retained snapshot, not
prove a diskless deploy, browser workflows, private-media recovery, or actual
cross-node failover. `diskRemovalReady` deliberately stays `false`. The
private backup is not a public delivery mechanism. Do not delete the disk or
create a second service from this result alone: another service would execute
startup migrations/maintenance and background sweepers against shared data.
Its topology, credentials, ingress, background jobs and rollback need a
separate controlled review.
