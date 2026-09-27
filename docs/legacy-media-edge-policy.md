# Legacy media edge delivery

## Evidence and scope

Production Render commit `66f1e3c5eb9138b1ddb3770200883cac92db95cc` passed
`verify:legacy-upload-compat`: 357 files, 43,063,737 bytes, stable manifest,
proxy sample, no source-disk read by verifier, no observed disk fallback.
This supersedes the pending origin proof in foundation section 34.

Audit found the frontend Worker used Cache API first, forced a one-day upstream
TTL, replaced no-store with public caching, discarded R2 source headers, and
turned all failures into HTTP 200 SVG placeholders after retries. The image
proxy path was also absent from explicit Worker/asset routing.

## Contract

Only `/uploads/*` and `/__winga-image__` change. GET/HEAD go to the configured
API origin using `cache: no-store`, manual redirects and a 20-second timeout.
No Cache API reads/writes, stale fallback, retry amplification, credentials,
conditional headers or Range requests are forwarded. Range requests receive the
normal full representation. HEAD stays HEAD. Existing origin authorization is
the source of truth; the Worker does not duplicate product/journal calculations.

Bodies stream without buffering. Image type/length/encoding, R2 source, CORS and
retry headers survive. All responses use private/no-store plus CDN no-store and
`X-Winga-Legacy-Delivery: origin-no-store-v1`. Origin errors retain their status;
network/timeout failures return 503, redirects/unsolicited 304 return 502, and
unsupported methods return 405. No fake successful image masks unavailable data.
Exception telemetry records only event/status, never filenames, query or credentials.
If transport fails after response headers were sent, the stream fails rather than
rewriting an already-sent status or serving cached bytes; checksum verification
must still fail for a truncated response.

Public R2 CDN image caching, Home/feed, API proxy, messaging state and database
are unchanged. Direct public CDN URLs are NOT made revocable/private by this fix.
Old browser-cached copies cannot be recalled; expiry/reload may be needed before
those browsers reach this policy. Old edge Cache API entries are bypassed, not
claimed globally purged. No origin flag is disabled and disk remains mounted.

Cloudflare Request API documents `cache: no-store` and forced cacheTtl behavior:
https://developers.cloudflare.com/workers/runtime-apis/request/

## Deploy and verify

Render auto-deploy does not deploy the frontend Worker. After CI passes, use the
existing frontend build and Wrangler deployment for `mkubwa`, verify the account
and `wingamarket.com` routes, and record the previous deployment for rollback.
Keep `WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED=true` on Render.

After BOTH backend verifier and Worker changes are live, in Render Shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
WINGA_MEDIA_VERIFY_ORIGIN=https://wingamarket.com WINGA_MEDIA_VERIFY_EDGE=true npm run verify:legacy-upload-compat
```

This checks all applied journal hashes through the frontend domain, requires R2
and edge-policy markers, no-store, no observed HIT/STALE/UPDATING/REVALIDATED or
Age header, GET/HEAD proxy samples, a repeated first read, and a stable journal.
It does not mutate records, remove disk or drain nodes. No missing file is skipped.
Expected `edgePolicyVerified: true`; diskRemovalReady and crossNodeFailoverProven
remain false. A local mocked Worker test is not actual edge runtime proof.

## Rollback and remaining gates

Record Wrangler's previous version before deploy; rollback only as an incident
response knowing the old Worker restores unsafe cache semantics. Backend
compatibility remains independently flag-controlled. There is no schema rollback.
Do not delete media or change R2 bucket visibility to work around a verifier failure.

Remaining: local writer/normalization/metadata/cleanup behavior, file-store mode,
19 missing historical images, private backup versus actual private-serving needs,
final no-disk runtime proof and controlled two-node failover. No privacy, load or
physical-device certification is implied by unit tests or storage checksum proof.

## Verification status

Nine focused Worker/verifier tests passed. The clean full `npm run test:ci`
confirmation passed: media 70/70, private backup 17/17, realtime 38/38,
paging/replay 35/35, commerce 71/71, additional frontend 54/54, integration
220/220, browser E2E 147/147, module sync and localization/frontend-core checks.
Frontend build and Wrangler dry-run also passed. Production rollout is recorded below.

Initial full CI passed all Node suites, including media 70/70 and integration
220/220, but browser E2E finished 146/147: the unchanged mobile search-focus test
at `tests/e2e/app.spec.js:2341` expected search_only and received hidden. Three
isolated repetitions then passed (3/3) without code/assertion changes. This is
not a UI fix. The subsequent full confirmation run passed without any UI source
or assertion changes; retain the intermittent search-focus risk separately.

Pre-deploy public-domain HEAD on a migrated image returned HTTP 200 with
`public, max-age=86400` and no R2/edge-policy header, confirming the audit at
runtime. Previous Worker version for rollback:
`7f244a81-18d9-4a84-a56a-4e2db423569b`. New asset build: `20260927202639`.

## Production rollout evidence

Code commit `ab480e5` was pushed to master, triggering configured Render auto-deploy.
Frontend Worker `mkubwa` deployed successfully to `wingamarket.com/*` and
`www.wingamarket.com/*`, version `edc67616-6b7d-497b-b107-b934b5eed6ca`.

A read-only production smoke probe selected three migrated images from public
catalog data and compared their CDN hashes against the frontend legacy URLs:
3/3, 200,854 bytes, R2 source and edge-policy markers, private/no-store,
GET/HEAD, proxy sample and repeated read passed. Two nonexistent legacy/proxy
requests preserved 404 and no-store; Home returned HTML 200. The first probe
stopped on a non-200 public catalog response during the deployment window;
origin health/catalog returned 200 before the successful repeat. No media,
database, disk, credentials, or account state was changed by these probes.

This is a THREE-IMAGE SMOKE test, not the full primary-journal inventory proof.
The fixed sample manifest was derived from public product/CDN data, not a live
database journal read. Run the Render Shell command above for all 357 recorded
files after the updated verifier is Live. Exact Render commit remains an
operator `echo "$RENDER_GIT_COMMIT"` check. Disk detachment, cross-node failover,
private CDN revocation, old browser-cache expiry and physical-device checks
remain unproven. No disk or instance configuration was changed.

## Full-inventory failure diagnostics

The operator's full edge verification at Render commit `ab480e5` returned
`COMPAT_HTTP_FAILED` before the first 25-file progress report. That response did
not contain HTTP status or failing phase, so neither WAF, missing/denied media,
rate limiting nor temporary backend failure is established as the cause.
A subsequent three-public-image smoke still passed (200,854 bytes); this does
not supersede the failed full-inventory gate.

The verifier now includes sanitized failure status, method, phase, UTC time,
validated Cloudflare Ray ID, content/source classifications and completed-file
counts. It never prints filenames, full image URLs, raw headers, response bodies,
cookies or exception text. Failed requests still stop the run; no automatic
retries, skipping, auth relaxation or success from an origin-only response.

After the updated verifier is Live, run in Render Shell:

```bash
cd /opt/render/project/src/backend
echo "$RENDER_GIT_COMMIT"
WINGA_MEDIA_VERIFY_ORIGIN=https://wingamarket.com WINGA_MEDIA_VERIFY_EDGE=true npm run verify:legacy-upload-compat -- --diagnose
```

On failure only, --diagnose makes one bounded request with the same method/path
to the fixed Render API origin for comparison. This is enabled only when the
target is a known Winga frontend origin and edge verification is requested.
The comparison is not a byte proof and cannot change FAIL to PASS. Other target
hosts never cause extra requests to production. With no flag there is no extra
request. This change affects operational verifier code/tests/docs only; Worker,
API serving, storage permissions, data and disk are unchanged.

Verification: affected media suite 75/75 passed, including five new diagnostic
tests. The earlier full CI pass applies to the Worker implementation; full CI
is not rerun for this verifier-only follow-up. Full production inventory proof
and the underlying cause remain pending the diagnostic result.
