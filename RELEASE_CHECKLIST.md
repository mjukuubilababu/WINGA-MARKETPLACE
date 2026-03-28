# WINGA Release Checklist

## Environment
- Confirm `window.WINGA_CONFIG` points to the intended provider for the release environment.
- Verify API base URL, storage provider fallback, and production env values are correct.
- Confirm seeded mock mode is disabled for real production environments unless intentionally used for demo.
- Confirm backend env includes `PAYMENT_WEBHOOK_SECRET` and the intended `TRUST_PROXY_HEADERS` setting for the deployment topology.

## Backend + Data
- Verify backend health endpoints and startup logs are clean.
- Confirm product, user, review, promotion, message, notification, and order tables/services are reachable.
- Confirm session restore works after a browser refresh.

## Marketplace Smoke
- Open home feed and verify hero, product cards, categories, and images render correctly.
- Verify search/filter still returns expected results.
- Open a product detail modal and confirm related products and seller products appear.

## Buyer / Seller Flows
- Sign in as buyer and verify:
  - add to requests
  - request box send
  - chat open/send
  - order placement enters pending verification first, then moves forward after payment verification
  - review submission
- Sign in as seller and verify:
  - upload/edit product
  - mark sold out
  - seller-as-buyer request/chat flows still work

## Admin / Moderation
- Verify admin or moderator can reach the admin surface.
- Confirm moderation, analytics, and promotion visibility load without runtime errors.

## Error UX + Fallbacks
- Confirm toast notifications appear for non-blocking success/error states.
- Confirm startup failure renders the fallback error card instead of leaving a blank screen.
- Confirm profile/orders/messages/notifications fallback states remain usable if one async load fails.

## Observability
- Verify client events/errors are reaching the configured logging sink.
- Check that slow-path diagnostics and critical action failures are visible in logs.
- Check audit visibility for `login_*`, `session_invalid`, `logout_success`, moderation actions, and denied admin actions.
- Confirm no unexpected noisy console errors appear during smoke testing.

## Tests
- Run:
  - `node tests/frontend-core.test.js`
  - `node --test tests/integration-api.test.js`
  - `npm run test:e2e`
- Review failures before release; do not ship on a red suite.

## Rollback Readiness
- Confirm latest stable build is identified and rollback steps are documented.
- Confirm production config backup and database/storage backup exist before rollout.
- Roll out gradually and monitor logs, chat/request failures, and image/feed rendering after deploy.
