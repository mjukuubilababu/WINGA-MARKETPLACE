# Legacy public product media copy

Run these commands in the Render **API service shell**, from
`/opt/render/project/src/backend`, after the deployment containing
`copy-legacy-public-media.js` is live.

1. Re-run `npm run audit:legacy-uploads`. Continue only when
   `publicSubsetCopyReady` is `true`.
2. Run `npm run copy:legacy-public-media`. This is a read-only dry run. Check
   that `planned` equals `references.approvedPublicCopyCandidates` in the audit.
3. Run `npm run copy:legacy-public-media -- --copy-public`. The command
   copies only approved, public product images and stored variants to
   `products/legacy/` in the configured R2 bucket. Each copy is conditional,
   read back, and SHA-256-verified. It is safe to re-run after interruption.
4. Check that `uploaded + alreadyVerified = planned` and
   `verifiedBytes > 0`. Do not infer completion from the presence of objects
   alone.

This command does not rewrite database URLs, switch the serving path, delete
disk files, or detach the disk. It never copies unclassified or restricted
files. The copy is publicly readable through the R2 custom domain, so product
visibility changes and deletion/revocation need their own handling before
using R2 copies as canonical URLs.

`diskRemovalReady: false` remains correct. The current audit has unclassified
files and missing embedded references; those require a separate private
backup/classification plan before Render disk removal or cross-node scaling.

## Diagnose the remaining disk blockers (read-only)

The operator reported a completed public-subset copy on 2026-09-25:
357/357 objects, 43,063,737 verified bytes, no database changes and no disk
deletion. This is operator-supplied evidence, not a new independent R2 audit.
The same inventory contained 238 unclassified files and 19 missing embedded
references. Those counts must be re-read; they are not permanent assumptions.

After the diagnostic update is deployed, run in the Render API shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run audit:legacy-uploads -- --diagnose
```

The default audit and the public copy allowlist remain unchanged. The optional
`diagnostics` object contains aggregate counts only:

- `byReferenceSource`: missing product, order, profile, identity, session,
  message-body, message-product-item and notification references. Counts can
  overlap across sources; use `missingUnique` for deduplicated totals.
- `missingWithStoredVariant`: the exact missing `-320/-640/-1080.webp` family
  has another stored width. This is a recovery candidate, NOT verified identical
  content, authorization to substitute a file, or a claim that it is public.
- `unclassified.disposition`: private-identity-linked files first, then files
  referenced by embedded content, then files with no reference in the inspected
  sources. Groups are disjoint and include known stored sibling variants.
- `variantFamilies`: counts complete three-width groups and partial groups among
  unclassified files. Family names, paths, message bodies and user IDs are never
  included in output.

No-known-reference does NOT mean safe to delete or publish. The query scope is
documented in the script; it does not inspect backups or every possible external
reference. Results are diagnostic snapshots, not a race-free cutover certificate.
Keep the disk. Do not repeat the public copy for unclassified files. Do not rewrite
chat history or widen public R2 access. Remaining files need an approved private
preservation/recovery plan before migration can proceed.

This command cannot prove cross-node failover. Two live API instances and an
approved controlled failover exercise are still required after the storage gate.
