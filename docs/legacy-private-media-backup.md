# Private legacy media backup

## Scope and production evidence

The operator's 2026-09-27 Render audit at commit e6a4a3d reported 595 disk
files. The public-copy subset was 357 files. The remaining 238 files contained
15,202,912 bytes: 78 complete three-width variant families and four standalone
files. No references to these 238 files were found in the inspected sources.
This does NOT make them public or safe to delete.

Nineteen missing paths were in message product-item snapshots, with no stored
sibling variants. Backing up existing files cannot recover those missing paths.
The missing-reference investigation remains a separate gate.

This CLI backs up on-disk files outside the approved-public copy subset. It
includes restricted/unknown files, not only the audit's unclassified grouping.
It reuses the canonical audit and the installed AWS S3 client. There is no new
upload endpoint, no change to runtime R2 configuration, no schema migration,
no public URL generation, no database rewrite and no disk deletion.

## Operator setup: new private bucket, existing public bucket untouched

1. Create a separate R2 bucket, for example `winga-private-backup`, in the same
   Cloudflare account as `R2_ACCOUNT_ID`. Use the default jurisdiction; this
   CLI does not support jurisdiction-specific endpoints. A geographic location
   hint such as Western Europe is not the same as an EU jurisdiction restriction.
2. Keep Public Development URL disabled. Do not attach ANY Custom Domain,
   including a disabled one. Do not bind it to a public Worker, share its
   credentials, generate public access links, or add an expiry lifecycle rule.
3. Create an R2 **Object Read & Write** token scoped to ONLY that bucket.
   Record its Access Key ID and Secret Access Key securely.
4. Create a separate **Admin Read only** R2 API token for bucket-configuration
   checks (`Workers R2 Storage Read` on the account). Use its API token VALUE,
   not its S3 access key or secret. This credential can read account bucket
   metadata/objects; keep it server-side and revoke it when no longer needed.
   An Object Read & Write token cannot authenticate Cloudflare REST metadata
   checks. Do not grant configuration-write permissions to the verifier.
5. Confirm there are no public Workers/integrations exposing the backup bucket
   and no lifecycle policy removing these backups. Freeze bucket configuration
   during the run. Then set the isolation confirmation below.

Add these NEW variables to the Render API service. Never replace the current
`R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` or public URL base:

```text
R2_BACKUP_BUCKET_NAME=winga-private-backup
R2_BACKUP_ACCESS_KEY_ID=<new bucket-scoped access key>
R2_BACKUP_SECRET_ACCESS_KEY=<new bucket-scoped secret>
R2_BACKUP_API_TOKEN=<read-only bucket-configuration API token value>
R2_BACKUP_ISOLATION_CONFIRMED=true
```

Existing `R2_ACCOUNT_ID` and `R2_BUCKET_NAME` identify the account and the public
bucket that MUST NOT be used as this backup destination. Source audit uses the
existing `DATABASE_URL`, optional `DATABASE_SSL`, and `WINGA_UPLOADS_DIR`.
Do not paste credentials into chat, command arguments, logs or the repository.
Backup keys are not required for app startup or the dry run.

## Commands: Render Shell only

Wait for the commit containing `backup:legacy-private-media` to be Live, then:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run backup:legacy-private-media
```

This is a dry run: counts only, no R2 calls/writes. With the reported inventory,
expect `planned: 238` and `plannedBytes: 15202912`. Fresh counts can differ;
investigate differences instead of forcing the old count.

After configuring the private bucket and credentials, run separately:

```bash
npm run backup:legacy-private-media -- --check-private
```

Require `ok: true`, `managedPublicAccess: false`, `customDomains: 0`.
Then explicitly start the copy:

```bash
npm run backup:legacy-private-media -- --backup-private
```

Require `uploaded + alreadyVerified = planned`, `verifiedBytes = plannedBytes`
and `manifestVerified: true`. Retain the returned non-secret `backupId` in the
operations record. Verify that specific snapshot independently:

```bash
npm run backup:legacy-private-media -- --verify=PASTE_BACKUP_ID_HERE
```

Replace the placeholder with the exact 64-character `backupId`. Verification
uses R2 only: it does not need the source disk or database. It validates the
manifest, reads every referenced object and checks size and SHA-256. It does
NOT restore files into an application directory or certify serving-path migration.
Only share aggregate JSON reports, never the manifest or credentials.

## Integrity and failure behavior

- Source classification is read in a read-only, repeatable-read transaction.
- Unsafe disk entries, unsupported/empty files, oversized files, invalid paths
  and ambiguous approved-public overlap fail closed. Bounds: 10,000 files,
  32 MiB per file, 4 MiB manifest. Unsupported inventory needs investigation.
- Source files are read through file handles with type/size/change checks;
  Linux uses `O_NOFOLLOW`. Reads and R2 bodies are bounded in memory.
- Each object has a content-addressed key under `legacy-private/v1/objects/`.
  Original filenames occur only inside the private manifest. Files are not
  client-side encrypted; bucket access controls and operator isolation matter.
- Writes use `If-None-Match: *`, never overwrite. Existing objects and concurrent
  writes are read back and compared byte-for-byte. A mismatch stops the run.
- The immutable, checksum-addressed manifest maps original names to object keys,
  sizes and SHA-256 values. It is written/read back after all files verify.
- Interrupted runs can be retried. Successfully copied objects remain private;
  no automatic cleanup/delete is performed. New file contents produce new keys
  and a new manifest, preserving older snapshots.
- CLI output/errors contain aggregate counts and fixed error codes only.
  Provider errors/paths are suppressed; investigate privately, not by posting
  verbose SDK logs or message contents.

Cloudflare r2.dev and custom-domain settings are checked before and after the
copy and before manifest publication. These are point-in-time checks: they do
not detect arbitrary Worker exposure, credential misuse, or guarantee a future
administrator will not enable public access. The operator isolation confirmation
is mandatory for those out-of-band controls. Keep the bucket private afterwards.

This is a snapshot, not a write-freeze/cutover certificate. Production can add
or change files after inventory collection. Keep the disk, rerun the audit for
future cutover planning, and account for ongoing writes before any removal.

`diskRemovalReady` is ALWAYS false, including a verified empty backup. Disk
removal, private-media serving authorization, legacy URL migration, missing
snapshot recovery and cross-node failover remain separate acceptance gates.

Errors: `BACKUP_CONFIGURATION_REQUIRED` means missing dedicated settings;
`BACKUP_ISOLATION_CONFIRMATION_REQUIRED` means the operator checks are not signed
off; `BACKUP_PRIVACY_CHECK_FAILED` means metadata authorization/network/response
failed; `BACKUP_BUCKET_NOT_PRIVATE` means public access or a custom attachment
was found; source/manifest/object errors require investigation. Never bypass a
failed guard by switching to the public product bucket.

Rollback: stop running the CLI and remove/revoke only the NEW backup credentials.
Existing disk files, database references and live public upload settings remain
unchanged. Preserve successful backup objects and their manifest IDs.

## Vendor contracts

- [R2 authentication and token permissions](https://developers.cloudflare.com/r2/api/tokens/)
- [Managed public domain metadata](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/list/)
- [Custom domain metadata](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/custom/methods/list/)
- [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
