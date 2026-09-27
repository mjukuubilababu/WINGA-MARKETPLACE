# Post-cutover disk and chat reference audit

## Confirmed runtime evidence

Render ran `f6c113096e8bc1d2b8679d09640277c20cda37ee` with plan
`82291d13ea32112820a8a9e86ba54962cbecc37b727961530b506870b7572a8c`.
Apply verified 357 local/R2/CDN images before atomically rewriting 303 image
references across 93 approved/public products. Output was `mode: applied`,
`publicDeliveryVerified: true`, `databaseChanged: true`, `filesChanged: false`,
`diskRemoved: false`, `diskRemovalReady: false`.

The operator subsequently reported that images appear correctly. Device-specific
coverage and a separate automated post-apply browser run were not supplied.
This confirms the reported image experience, not disk independence or failover.

## Why the old audit needs additional evidence

The original audit classifies local files from current `/uploads/` database
references. After URL cutover, it can report previously public files as
unclassified because the current product points to R2 instead. That is NOT
permission to delete them, republish them, or create a new private backup of
everything without reviewing existing evidence.

The optional post-cutover section separately reads applied journal source hashes
and the exact media fields before/after cutover. It does not change the original
audit, copy-plan or private-backup classification contracts. Rolled-back journals
do not count as active migration evidence.

## Run on the Render backend after deployment

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run audit:legacy-uploads -- --diagnose --post-cutover
```

No new credentials, bucket, migration, or environment flags are required. This
command uses a repeatable-read READ ONLY database transaction and SELECTs. It
does not request CDN/object bytes, upload, delete, repair, or update messages.
Missing schema, database errors, row limits and conflicting evidence fail the
audit rather than returning an empty success. Missing disk also remains an error.
The disk inventory is an observation, not an atomic filesystem snapshot.

Only aggregate counts leave the command. The chat query projects structured
product ID/image references and current product access state internally. It
does not select private message bodies, participant names or product titles.
Limits: 100 journals, 2,000 journal product IDs, 5,000 legacy snapshot items.

## Interpretation

- `journals`: applied/rolled-back journals and unchanged, edited, missing or
  restricted product entries. Entries count journal changes, not unique products
  across multiple historical migrations.
- `retainedDisk`: files recorded in applied journals and their current presence
  on disk. `filesOutsideAppliedJournal` does not mean disposable or private;
  earlier private-backup proof is separate and is not reverified here.
- `chatSnapshots.items/onDisk/missing`: counts snapshot items; repeated items may
  use the same image. `missingUniqueFiles` deduplicates filenames.
- `exactJournalCandidate`: same product ID and original image map to a journaled
  CDN image, with currently unchanged media and active approved/public access.
  It is a candidate only. The command does not test current remote bytes or
  change that message, and it does not authorize a public message read.
- `currentProductImageNeedsReview`: the product has a current HTTPS image but
  exact historical identity is not proven. Never silently substitute it as if
  the historical image had been recovered.
- `productMissing`, `productRestricted`, `noVerifiedReplacement`, and
  `invalidLegacyReference` remain distinct unresolved states.
- `unparsedLegacyMessageRows` counts malformed/non-array historical product
  items containing legacy references. They are not silently called empty.

`localHashesRechecked`, `remoteDeliveryRechecked`, `privateBackupRechecked`,
`databaseChanged`, `filesChanged`, and `diskRemovalReady` remain false.
The 19 historically missing chat image files are NOT claimed recovered.

## Remaining code dependencies (audited, not modified)

| Component | Current dependency | Needed before disk detachment |
| --- | --- | --- |
| `backend/server.js:saveDataUrlImage` / `normalizeProductImages` | Synchronous local write for data URLs during normalization | Prove normal production paths cannot reintroduce local-only media, including legacy normalization |
| `persistIncomingProductImages` | R2 when configured; local variant writes otherwise | Explicit multi-node storage policy and tests for missing R2 config/storage failure |
| `resolveProductImageForDelivery` / `repairNormalizedProductImageState` | Local existence checks remove missing legacy references | Compatibility delivery must exist before disk is absent |
| `enrichStoredProductImageMetadata` | Reads local bytes for legacy metadata backfill | Preserve known metadata and make any remaining backfill storage-aware |
| `GET /uploads/*`, image proxy and public canary local fallback | Reads retained disk | Define authorized old-URL compatibility without exposing private media |
| `cleanupUnusedLocalImages` | Deletes based on product references, not all chat history | Retention must account for historical references and rollback evidence |
| `worker.js:handleImageCache` | Existing legacy URL cache and origin fallback | Coordinate old-link cache/delivery and visibility policy |
| Profile/identity handling | `isValidPrivateImageValue` accepts validated data URLs; profile API stores values | No current private upload disk writer proven; inspect remaining historical references separately, never publish to public R2 |
| JSON store helpers | Local store/backups for file-store mode | Verify production PostgreSQL mode and durable domain storage before horizontal scaling |

No runtime server routes, Worker, frontend, or message payloads change in this
patch. No source files or backups should be removed from the output of this audit.

## Next decision gate

Review actual post-cutover counts before designing the historical-reference
repair/compatibility patch. Exact verified mappings and unavailable historical
images must have different handling. Any future message mutation must preserve
ownership, message versioning/replay and private access; this audit bypasses none
of those contracts. Disk removal, two-instance deployment, and cross-node
failover remain blocked until runtime storage independence is proven.

## Verification results

`npm run test:ci` passed module synchronization, private backup 17/17, legacy
media 50/50 (including 11 new SQL-backed audit tests), the remaining Node suites
and integration 220/220. E2E finished 145/147. Two unchanged Home pagination
tests failed: product actions observed a third page request instead of two
(`pagination-bootstrap.spec.js:556`), and query hydration observed loadedCount
13 instead of 12 (`pagination-bootstrap.spec.js:762`). Both passed three isolated
repetitions each (6/6). This does not fix the failures or make full CI green.
The diff for server, database runtime, Worker, app and browser tests is empty.

The CLI rejected `--post-cutover --apply` before database initialization.
The staged diff passed whitespace checks. Real production post-cutover audit
execution remains pending; only the earlier product cutover has runtime proof.
