# Feed video scroll reliability

## Scope and evidence (2026-09-26)

Reported symptom: later videos intermittently remain idle after scrolling through
five or six items. Public mobile-browser probes played more than six real videos;
this was not a deterministic six-video API limit. Playback-token responses in
those probes were HTTP 200. Constrained-device playback fetched later tokens on
demand and showed visible startup delays. The existing constrained-device and
save-data policies remain unchanged.

Four failure paths were reproduced in regression tests before changing the
controller:

1. The prewarm deadline started only after token acquisition. A hung token could
   occupy a preload slot for the upload request's three-minute timeout.
2. A speculative preload failure excluded the video from automatic selection
   even when the user subsequently scrolled it into view.
3. A player that never decoded its first frame had no overall startup deadline.
4. After a programmatic scroll pause, its consumed pause event was mistaken for
   a user pause when the video became dominant again.

These reproduce plausible causes of the intermittent symptom, not proof that
every failure on the user's physical device has the same cause.

## Lifecycle changes

- Playback-token HTTP deadline: 15 seconds, independent of upload deadlines.
- Speculative preload: existing 12-second budget now includes token acquisition.
  On timeout, release an inactive player and allow queued videos to proceed.
- Visible startup: 20-second first-frame deadline, using the existing failure
  state and manual retry interaction rather than permanent buffering.
- A failed speculative preload can retry once when it becomes visible. Failures
  during visible playback do not start an automatic infinite retry loop.
- Failure/release invalidates pending player generations. Late token/runtime
  results cannot resurrect obsolete players or overwrite a successful retry.
- A preload promoted to active playback survives its old speculative deadline.
- Programmatic pause state is distinct from explicit user pause. Scroll resume
  remains automatic; user pause remains respected.
- Startup/preload timers settle on readiness, failure, timeout or disposal.

No changes to feed ranking, pagination, products, uploads, auth, database schemas,
bottom navigation or visual layout. Existing lifecycle telemetry records startup
timeout failures without adding private data to metrics.

## Verification

- `node --test tests/video-playback-lifecycle.test.js`: seven deterministic tests,
  including stalled token, eight queued videos, late-response isolation, manual
  retry, promoted preload and explicit versus programmatic pause.
- `npx playwright test tests/e2e/video-feed.spec.js --workers=1`: guest/auth flows,
  media failure isolation, eight consecutive videos and reverse scroll, one
  active player, offscreen release, and horizontal overflow checks. The browser
  media provider is mocked in this suite; it does not certify CDN availability.
- Full regression gate: `npm run test:ci` passed, including 144 frontend core
  checks, 54 frontend unit tests, 216 integration tests and 147 browser tests.
  Realtime, message-page, commerce-outcome and localization suites also passed.
- A browser-only override of the local bundle on the public site played eight
  real Stream videos plus reverse-scroll checks (10/10), with no horizontal
  overflow. This exercised real media without deploying the patch first.
- Physical Android/iPhone and intermittent carrier-network behavior still need
  device confirmation after deployment; desktop mobile emulation is not a
  substitute for those checks.

## Rollback

Revert the scoped playback commit and regenerate `winga-modules.js` from the
canonical module sources. No data migration or media deletion is involved.
