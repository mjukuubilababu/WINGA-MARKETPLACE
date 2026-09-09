# Photo-to-Reel: Scope and Acceptance

Date: 2026-09-09

## Scope

Implements Prompt 3 of the supplied video/reels plan. The seller upload form
has an optional, collapsed photo-to-reel editor. The existing Post action still
opens the unified device media picker. Ordinary image-only, video-only and mixed
posts use their existing upload and save paths. No feed ranking, pagination,
playback, moderation, database or Worker routing implementation is changed.

## Data Flow

1. Select 3-10 local JPEG, PNG, WebP or GIF photos; reorder or remove them.
2. Create a silent portrait reel locally with Canvas and MediaRecorder.
3. Preview the generated video. Nothing is uploaded during creation or preview.
4. Explicitly choose Use reel. Existing attached video requires confirmation.
5. The existing video uploader obtains its authenticated upload intent, uses
   resumable TUS upload and waits for the normal ready state before saving.
6. Product save retains the canonical image array and image-first media order.

`src/marketplace/photo-reel.js` owns encoding and resource lifetime.
`src/marketplace/photo-reel-ui.js` owns editor state and localized controls.
`app.js` only connects seller permissions, existing media upload and navigation.
`index.html` remains the authoritative shell; the build bundles both modules.

## Resource and Failure Policy

- Fixed 720x1280 output, 24 fps target, 2 Mbps target, no microphone/audio capture.
- Two or three seconds per photo; 6-30 second reels. This is not the general
  video-upload duration limit.
- Contain fitting preserves full portraits and wide photos, without blur or crop.
- Crossfade is skipped when reduced motion is requested.
- 10 MiB per input, 60 MiB combined, 40 megapixel decoded-image limit, 32 MiB
  encoded-output limit. Decoder memory use still depends on the browser/device.
- Only current and next resized frames remain retained during encoding.
- MIME support is feature-detected; actual output MIME/extension is preserved.
- Unsupported browsers retain ordinary image/video upload.
- Cancellation, navigation, page hiding, decode errors and a bounded watchdog
  stop unfinished generation instead of returning a frozen or partial reel.
- Recorder tracks, animation callbacks, listeners, bitmaps and object URLs are
  released. Failed upload leaves the preview available for explicit retry.
- Rendering happens on the seller device. No new server encoder or queue is
  introduced, and original photos never leave the device during preview.

## Automated Evidence

`node --test tests/photo-reel.test.js` covers selection limits, WebM/MP4 output
metadata, ordering, resource release, cancellation, backgrounding, empty/oversize
output rejection and unsupported browsers.

`npx playwright test tests/e2e/photo-reel.spec.js --reporter=list` uses real browser
Canvas capture, MediaRecorder encoding and native video playback, with pixel
checks for every selected photo and uncropped wide-image edges. It also checks
reordering, preview-before-upload, TUS binary transfer, image-first product save,
cancellation, navigation reset, desktop/mobile and editor RTL layout.
Provider endpoints in this browser test are intercepted: it is not proof of a
live Cloudflare Stream encode or a successful Hive moderation callback.

`npm run test:ci` includes the new tests and existing feed/gallery/auth/backend
regressions. Localization uses the existing four catalogs and hard-coded gate.

Final local gate: PASS, with 107 frontend-core checks, 7 reel unit tests,
154 integration tests and 100 browser tests. All 61 bundled modules are in sync;
all four catalogs contain 915 keys; the hard-coded UI gate reports zero debt.
An initial run failed the seller-query pagination fixture: its broad listing
mock also accepted passive-view writes. The fixture now handles only listing
GETs, leaving the complete pagination-state equality assertion unchanged.
No production pagination code was modified to make the test pass.

## Remaining External Acceptance

- Confirm an actual seller can create, upload and play a reel on production
  Cloudflare Stream, on physical low-end Android and iOS/Safari devices.
- Verify upload recovery under a real intermittent mobile connection.
- Hive access remains a separate outstanding dependency. Do not clear safety
  dead letters or claim moderation healthy just because this editor works.
- The narrow document-RTL test detected pre-existing feed overflow below the
  upload form. The reel test checks editor bounds and no added page overflow;
  this feature does not change those feed rules.
- Stories (24-hour posts), music and collaboration are not implemented here.
  No claim of billion-user capacity or complete video-platform readiness.

## Release

Use the existing frontend Worker `mkubwa`, never the Hive adapter:

```bash
cd ~/Desktop/Winga-App/active-work
git pull --ff-only origin master
npm run build:vercel
npm run test:ci
npx wrangler deploy --config wrangler.toml --keep-vars
npm run verify:frontend-worker-routing
npm run verify:production
```

Only deploy after the test command succeeds. The build generates a new app
version and synchronizes the module bundle. No database migration is required.
For a rollback, use the previously deployed `mkubwa` version, then verify the
production shell and routes again.
