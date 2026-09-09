# Photo-to-Reel: Scope and Acceptance

Date: 2026-09-09

## User Contract

Create reel -> native photo gallery -> select photos -> Creating reel spinner
-> automatically published Home post. No preview, reorder settings, Use reel,
product metadata form or second save click. The existing seller upload surface
contains the Create reel button; this change does not redesign navigation.

Ordinary image-only, video-only and mixed product posting keep their existing
paths, full image arrays and image-first ordering. Creating a reel does not copy
or clear an unrelated product draft. Feed ranking, pagination, playback, security,
moderation and Worker routing are not modified.

## Architecture and Data Flow

1. The button opens a multiple-photo input synchronously in the click gesture.
2. Selection validates 3-10 JPEG, PNG, WebP or GIF photos and seller identity.
3. The existing Canvas/MediaRecorder encoder creates a silent portrait reel.
4. An independent instance of the existing authenticated video upload controller
   obtains an idempotent upload intent, transfers TUS chunks and polls readiness.
5. The existing product API publishes one video-only post under the current
   seller, with title Reel, category reels and no fabricated price or metadata.
6. The normal data layer merges the result; Home opens and displays the new post.

`src/marketplace/photo-reel.js` owns encoding and resource cleanup.
`src/marketplace/photo-reel-publisher.js` owns the automatic job and retries.
`src/marketplace/photo-reel-ui.js` owns the native picker and localized dialog.
`app.js` connects account identity, existing APIs and normal Home navigation.
`index.html` is authoritative; the build copies its reel fragment into the
Worker shell and bundles all three modules. No runtime shell fetch is added.

## Resource and Failure Policy

- Fixed 720x1280 output, 24 fps target, 2 Mbps target and two seconds per photo.
  Generated reels are approximately 6-20 seconds; this does not limit ordinary
  video uploads. The known reel duration avoids a second metadata decode wait.
- Contain fitting preserves portraits and wide images without blur or cropping.
  Crossfade is skipped when reduced motion is requested.
- Limits: 10 MiB per input, 60 MiB combined, 40 megapixels decoded per photo and
  32 MiB encoded output. Decoder memory still depends on the device/browser.
- Only the current and next resized frames remain retained during encoding.
- MIME is feature-detected. Unsupported browsers retain ordinary media posting.
- One active reel job at a time. Account identity is checked after async stages.
- Ready video is retained for publication retries; processing retries poll the
  same provider asset instead of uploading it again. Partial TUS uploads use the
  existing idempotent intent/resume policy.
- A stable product ID is retained for save retries. An uncertain save response
  checks the seller's latest 50 reels for the same product ID and provider before
  retrying. PostgreSQL uniqueness remains the final duplicate-ID boundary; this
  is not a claim of distributed exactly-once delivery or durable browser jobs.
- Cancellation stops unfinished encoding/upload. Once the final save is in
  flight, cancellation is disabled so it cannot falsely claim to undo a post.
- Navigation/backgrounding safely stops unfinished encoding. A busy-page unload
  warning is registered where supported. Jobs are in memory, not guaranteed to
  continue if the phone locks or the app/browser is closed.
- Recorder tracks, frames, listeners, bitmaps and object URLs are released.
  Original photos stay local; only the generated reel is uploaded.
- The visible state hides technical stages behind one spinner. Recoverable
  errors offer Try again; they never silently report a failed post as successful.

## Automated Acceptance

`node --test tests/photo-reel.test.js` covers encoding limits and MIME, resource
cleanup, cancellation/backgrounding, automatic publication, duplicate starts,
invalid account/media, identity changes, stable-ID retry and uncertain responses.
It also checks canonical Worker fragment parity and bounded prerender fallback.

`npx playwright test tests/e2e/photo-reel.spec.js --reporter=list` exercises:

- Native file-chooser event from the button, with no extra save/preview action.
- Actual Canvas capture and MediaRecorder encoding, TUS binary transfer and
  automatic publication. Pixel checks verify all three selected photos and
  uncropped wide-image edges in real native video playback.
- Draft preservation, desktop/mobile/320px RTL dialog bounds and cancellation.
- Unsupported recording without breaking ordinary photo upload.
- The same automatic flow in the Worker-rendered BigPipe shell.
- A lost final response reconciled into one post and one upload intent.

Provider/write endpoints in these tests are intercepted. They do not prove a
real Cloudflare Stream transcode or successful Hive callback. Worker-shell tests
proxy the real fixture API because fulfilled HTML lacks loopback metadata in
Chromium; application permissions and browser security are not disabled.

`npm run test:ci` includes the complete localization, frontend, integration and
browser regression suites. Record the actual release results, not estimates.

Local gate for this automatic flow: PASS. All 107 frontend-core checks, 19 reel
unit tests, 154 integration tests and 102 browser tests passed (browser suite:
4.2 minutes). All 62 modules are synchronized; all four catalogs have 919 keys,
and the hard-coded UI gate reports zero debt. Mobile, desktop and narrow RTL
progress-dialog screenshots were inspected.

## External Acceptance Still Required

- Actual seller upload/publication/playback on live Cloudflare Stream.
- Physical low-end Android and iOS/Safari gallery and lifecycle behavior.
- Recovery on a real intermittent mobile connection.
- Hive authorization remains pending independently; do not clear safety failures
  or claim moderation healthy because automatic reel creation succeeds.
- Stories, music and collaboration are outside this change. No billion-user
  capacity claim follows from these functional tests.

## Release

Use the existing frontend Worker `mkubwa`, not the Hive adapter:

```bash
cd ~/Desktop/Winga-App/active-work
git pull --ff-only origin master
npm run build:vercel
npm run test:ci
npx wrangler deploy --config wrangler.toml --keep-vars
npm run verify:frontend-worker-routing
npm run verify:production
```

Stop if any gate fails. Build generates a new app version and synchronizes the
bundle and Worker shell. No database migration or new external setting is needed.
Keep the previous deployed Worker version for rollback and verify routes again
after any rollback.
