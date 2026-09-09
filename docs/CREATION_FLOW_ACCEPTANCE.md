# Creation Menu and Post Composer

Date: 2026-09-09

## Contract

- The seller Home action is a blue square plus icon with an accessible label.
- Plus opens a native modal with Post, Reel, Media, Story and Live.
- Post opens New post: current account, text, Photo/video and Next.
- Photo/video opens the existing mixed native gallery in the same user gesture.
- Next retains the selected media and opens existing product details. Category,
  shop, verified WhatsApp, optional price and fit validation are unchanged.
- Text remains the product name: 3-120 characters. No new post schema is added.
- Media opens the same composer and gallery directly. Reel retains automatic
  photo-to-reel publication, independent of an unrelated product draft.
- Story and Live are disabled and explicitly marked Coming soon. No simulated
  location, activity, live-streaming or external-account functionality is added.
- Back preserves draft input between compose/details. Edit keeps both sections
  accessible and uses the original cancel and save handlers.

## Architecture

`src/products/creation.js` owns only menu and composer state. `app.js` supplies
existing account, upload, edit and route dependencies. No new store, API,
pagination, ranking or playback implementation is introduced.

`index.html` is authoritative. The build embeds its marked creation form and
menu into worker.js and adds the controller to winga-modules.js. A regression
test compares both fragments and checks unique upload IDs. Static Lucide SVGs
and their license are bundled locally; no icon runtime or external CDN is used.

Translations cover Swahili, English, French and Arabic. Native dialog semantics,
Escape/focus restoration, named icon buttons and narrow RTL layout are tested.

## Verification

Run build before tests because icons and Worker fragments are generated:

```bash
npm run build:vercel
npm run test:ci
```

Creation tests cover menu actions, native picker, draft-preserving Next/Back,
existing edit-controller cancellation, mobile/desktop/RTL bounds and loaded icons. Existing
reel tests retain real browser encoding and mocked provider publication checks.
The complete suite also checks normal product posting, Home continuation,
gallery swipe, edge-to-edge media, PWA and backend flows.

Release gate passed on 2026-09-09 for build 20260909161318: 107 frontend-core,
20 reel unit, 154 integration and 107 browser tests (4.3 minutes). All 63 modules
are synchronized, four catalogs contain 935 keys each and hard-coded string debt
is zero. Mobile, desktop and 320px Arabic screenshots were visually inspected.

Live seller publication, physical iOS/Android gallery behavior and unreliable
mobile networks still require real-device acceptance. Hive access remains an
independent unresolved external dependency. This change is not a global-scale
capacity certification.

The existing Profile tile renderer does not append its defined edit menu. The
edit compatibility test therefore enters through the retained startEditProduct
controller using an actual owned fixture product, not a simulated product save.
Restoring a Profile edit-menu entry is a separate existing UI gap, not changed here.

Dependency audit found an existing high advisory for sharp <0.35.4
(GHSA-rgj7-g3m4-5g8c). The installed 0.35.3 was not changed by this UI work;
schedule its patch and image-upload regression testing separately.

## Deployment

Use the existing frontend Worker `mkubwa`; no new Worker or Render setting:

```bash
cd ~/Desktop/Winga-App/active-work
git pull --ff-only origin master
npm ci
npm run build:vercel
npm run test:ci
npx wrangler deploy --config wrangler.toml --keep-vars
npm run verify:frontend-worker-routing
npm run verify:production
```

Stop if a command fails. The build creates a new app version. Retain the prior
deployed Worker version for rollback; recheck routing and shell after rollback.
