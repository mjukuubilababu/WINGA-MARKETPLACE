# Current video moderation acceptance

Updated: 2026-10-04. Production moderation acceptance: NOT VERIFIED by this document.

## Contract

Dispatcher -> private signed MP4 -> Hive Visual Moderation V3 -> signed result
through wingamarket.com -> durable Render transaction -> scan acknowledgment.
The public adapter /health reports configuration readiness, not provider access
or successful moderation. /callbacks/hive returns 410; V3 results enter via /scan.

MP4 preparation has a 15-second deadline. A fresh downloadable token bypasses
the viewer playback cache. Pending MP4 preparation uses normal durable retries;
it can exhaust the configured attempt budget and requires separately authorized
ops recovery. Hive requests have a 45-second deadline and a bounded 4 MiB body;
callback delivery has a 10-second deadline and 128 KiB response limit. Dispatcher
adapter requests default to 60 seconds, use manual redirects and an 8 KiB response
limit. No redirect should forward a scan signature or provider credential.
Dispatcher success requires submitted:true, delivered:true and status:completed;
an asynchronous submitted-only acknowledgment is not V3 acceptance.

V3 class/value, class/score and class_name/value predictions retain the same
thresholds. Conflicting aliases, missing general_nsfw per frame, malformed,
partial, empty and oversized results cannot produce a safe decision.
The maximum positive score across frames determines risk. Scores >= 0.9 produce
review, not an automatic block. Existing direct-publication policy is unchanged:
only blocked/rejected hides public video. Review/error/pending do not quarantine.

Result identity is stable per scan identity. A callback can commit before the
dispatcher receives its response. Completion reporting checks a durable completed
job with a nonempty stored result instead of counting that case as lease loss or
retry failure. Duplicate callbacks do not replace the first result; conflicting
identities are rejected. A changed prediction on retry is not a new decision.

## Smallest strictly read-only production verification

1. Read deployed versions for API, background worker, adapter and frontend Worker.
   Verify adapter includes global_fetch_strictly_public and the public callback
   URL. Compare configuration presence without printing secret values.
2. GET adapter /health and run npm run monitor:video in an already authorized
   operator shell. Read latest scheduled video-health workflow result. Require
   ready status, active safety workers and acceptable queue/dead/age thresholds.
3. Use BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY to inspect an existing
   post-deployment V3 completed job joined to video_upload_intents. Select only
   provider ID, job status/attempts/timestamps, safety result ID, safety status,
   provider and model version. ROLLBACK after reading. Do not dump last_error,
   provider_payload, seller identity or signed media URLs.
4. GET existing Stream metadata and downloads status with existing operator
   credentials. Verify requireSignedURLs:true and default MP4 ready. A bounded
   unsigned media request must be denied. An existing unexpired moderation URL
   may be tested privately with a bounded request; otherwise signed MP4 fetch is
   NOT VERIFIED. Never print tokens, URLs, headers or response-body secrets.
5. Correlate existing persisted V3 result with callback audit, adapter delivery
   and provider evidence. Adapter logs are sampled: missing logs are inconclusive.
   Generic delivery logs alone do not prove per-video correlation.
6. Observe existing retry jobs at successive times. Do not requeue, claim, issue
   a token, create downloads, upload, invoke /scan or send synthetic callbacks.

createModerationMedia, dispatcher.processOnce, and playback-token issuance can
write provider/database state. verify:video-production proves public HLS/poster
playback, not Hive moderation, and is not strictly provider-read-only.

If correlated existing evidence is absent, record NOT VERIFIED. A fresh synthetic
end-to-end acceptance requires explicit operational write scope and an isolated
test asset; this document does not authorize that action. Fleet health and mock
tests cannot substitute for real provider acceptance. Never mark complete based
on the historical September 8 report or a healthy empty queue.

## Regression and release gates

Focused tests: node --test tests/cloudflare-stream.test.js
tests/video-safety.test.js tests/video-safety-adapter.test.js
tests/video-safety-dispatcher.test.js tests/postgres-pagination.test.js
tests/video-background-worker.test.js tests/video-health-monitor.test.js.

The dispatcher suite includes real PostgreSQL-engine SQL (PGlite) for pending
MP4 -> durable retry -> callback commit -> completed, lost scan response,
duplicate/conflicting results and completion reporting. Provider/network steps
are mocked; this does not prove real Cloudflare/Hive access or multi-node races.
Run npm run test:ci for the full repository release gate. Record actual results.

Deploy the Render API and background worker from the same tested master commit;
deploy the existing adapter with npm run deploy:worker:video-safety. Preserve
existing variables and secrets. Verify versions and the read-only sequence above.
No migration is introduced. Rollback by reverting this commit and redeploying;
never delete provider media or queue rows. Legacy callbacks resume on rollback,
so retain the strict V3 release unless rollback is operationally necessary.

## Validation recorded for this patch

Integration suite: 271/271 passed. Frontend suite passed after generating static
assets (68 Node tests plus frontend-core checks). Secure-content 103/103, private
backup 17/17 and legacy-media 84/84 passed. Module synchronization and syntax/diff
checks passed. Full test:ci is not green: the unchanged message-replay-client VM
harness lacks setInterval. Browser download also failed in this environment, so
browser acceptance was not executed. Do not describe this as full release-gate
or production moderation acceptance. Cloudflare CLI is unauthenticated here;
adapter deployment and post-deployment production evidence remain pending.
