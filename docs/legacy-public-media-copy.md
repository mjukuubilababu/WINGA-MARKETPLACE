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
