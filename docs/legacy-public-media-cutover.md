# Approved public product media reference cutover

## Evidence and scope

Render commit `a48cc4256a70cc42df34526536514fdbf7755133` verified all 357 legacy
public files / 43,063,737 bytes. Inventory was stable and authorization was
rechecked. The previous HTTP canary verified three images / 181,240 bytes.
The private backup of 238 files has also been independently verified.

New product uploads already use `storage-r2.js` public CDN URLs. This operator
tool moves existing approved/public product IMAGE references to the same URL
contract: `R2_PUBLIC_URL_BASE/products/legacy/<name>`. No media is uploaded,
deleted, made public, or copied by this command. These objects were already
copied to the public bucket and verified in earlier steps.

Only `products.image`, `products.images`, and existing image-item `url`,
`posterUrl`, `thumbnailUrl` fields change. Product IDs, prices, inventory,
created times, likes/views and relationships remain intact. Row versions advance
and updated times change so existing stale-write protection sees the update.
Video items, arbitrary text, orders, message snapshots, profiles and identity
documents are not rewritten. Pending/private/followers products are excluded;
an inactive public owner or restricted file overlap blocks apply.

This is NOT a new media privacy mechanism. Existing public CDN objects and
legacy Worker caches already bypass later visibility revocation. That known
limitation remains for both old and new public uploads. Do not treat this tool
as permission to publish private media or as a solution for private delivery.
Serving/cache revocation needs separate coordinated work.

## Deployment and dry-run first

Migration `2026092701_legacy_public_media_cutover` creates an empty operator-only
PostgreSQL journal through the existing schema runner. Deploy does not rewrite
products. No new HTTP endpoint or frontend/Worker deployment is added.

After the backend commit is Live, run in Render Shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
npm run cutover:legacy-public-media
```

Default mode is read-only. Review `products`, `references`, `journalReady` and
`planId` before applying. The plan is derived from current records, not fixed to
93 products. It contains no filenames or user identifiers in console output.
No extra environment variables or tokens are required.

The plan ID covers the base URL, product media/owner data and journal generation.
Ordinary views, likes or price changes do not invalidate it or get overwritten.
Media/ownership changes, additions to the scope or another cutover invalidate
it; rerun dry-run rather than forcing a stale plan.

## Explicit apply

Only after reviewing the dry-run, replace PLAN_ID below with that exact value:

```bash
npm run cutover:legacy-public-media -- --apply=PLAN_ID
```

Before any write it reruns the full local/R2 inventory check AND downloads each
candidate through the actual public CDN URL. Both remote paths must match the
local bytes. Missing media, redirects, non-image responses, invalid checksums
and oversized responses stop the operation. No network/storage calls occur
inside the database write transaction.

Apply locks products/users/visibility/journal against concurrent writes, checks
the plan and current authorization again, then updates media with field-level
compare-and-swap and writes the journal in one transaction. It caps scope at
200 products / 1,000 directly referenced images, uses a 2-second lock timeout,
10-second statement timeout and a transaction time budget checked between
items. Run during a quiet period: these table locks can briefly delay writes.
Lock or SQL failures roll the transaction back; do not relax these limits to
force a production run without measuring it.

Successful output has mode `applied`, the plan ID and product/reference counts.
An identical retry returns `already-applied` without rewriting rows. If the
connection fails around COMMIT, `databaseChanged: null` means the outcome is
unknown; repeat the SAME plan ID to reconcile the durable journal. Never assume
an error implies no commit or start a competing migration.

After apply, inspect the real public feed, product detail and product images
on mobile/desktop and confirm canonical API image URLs use the configured CDN.
Runtime UI/cache acceptance is not proven by SQL tests or a successful command.
Keep the disk and old files during this observation window.

## Rollback

```bash
npm run cutover:legacy-public-media -- --rollback=PLAN_ID
```

Rollback requires all original source hashes to match the retained disk. It
restores only the journaled media fields, only if media still matches the
applied values and the original owner remains active with approved/public
access. Changed/deleted media or revoked access rejects the whole rollback;
it does not clobber later edits. Price/engagement changes survive rollback.
Versions advance, rather than moving backwards. Repeated rollback is a no-op.
A fresh dry-run after rollback creates a different plan generation, preserving
the earlier audit entry if another attempt is needed. Do not delete the journal.

## What remains

This is a product-record reference migration, not disk detachment. Historical
`/uploads/` links, video fields, chat/order snapshots, old public caches and
private/non-product writers still need their own delivery/retention plan.
The 19 previously missing message product-image references remain unresolved.

After apply, old audit/canary tools may find fewer or no legacy product
references, and more retained files may appear unclassified. That is expected
when references moved; it does not make those files disposable. The journal and
backups retain recovery evidence. No disk-removal or cross-node gate is closed
by this command. `diskRemovalReady` remains false.

## Local verification

`npm run test:ci` passed media 39/39 (14 cutover tests), private backup 17/17,
integration 220/220, the remaining Node suites and module synchronization.
Browser E2E passed 146/147. The mobile-header scroll-state test failed once
(`hidden` instead of `search_only`) and passed three isolated repetitions
without code/assertion changes. Full CI is therefore not green; that UI
instability remains open. This patch does not change Home/header code.

Cutover coverage includes excluded/restricted records, proof failure,
intervening edits, private overlap, atomic SQL rollback, unknown COMMIT outcome,
idempotency, tampered plans, retained source checks, visibility revocation,
preserved price/row versions and bounded CDN responses. SQL tests use PGlite;
production lock contention and actual Render/CDN cutover are not proven locally.
