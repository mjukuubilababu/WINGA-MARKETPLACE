# Seller Analytics relocation

## Audit and navigation

Previously, the seller-insights utility action opened Profile and scrolled to
analytics-panel. Profile loaded the summary as part of rendering. The shared
admin UI module rendered both admin and seller summaries.

Now Hamburger > Analytics opens the dedicated analytics SPA view. Avatar and
Profile no longer offer seller Analytics or fetch its summary. Existing Profile
identity, preferences, products, orders and messages remain unchanged. The
five-item bottom navigation is retained; Analytics adds no bottom-nav item.

Seller capability checks gate menu visibility and the view. Backend access is
limited to seller self-aggregates and admin platform aggregates. Buyers,
moderators, cross-seller selectors and unsupported scope overrides are denied;
authenticated Analytics responses are private and non-cacheable.

## UI and data

Five compact tabs organize Overview, Products, Customers, Content and Trends.
Trends contains Demand, Opportunities, Trending and Regional segments. Overview
links to a focused Insights and Recommendations screen. Metric cards, a real
seller-scoped trend chart, ranked categories, category/size/color meters, quick
actions and evidence rows follow the supplied mobile visual direction without
copying its sample numbers.
Recommendations retain their existing reason and opportunity actions retain
attribution. Refresh failures keep the last successful data. Responses arriving
after leaving the view or changing the account are ignored.

Data remains WingaDataLayer.loadAnalytics() through /api/analytics/summary.
The route accepts a bounded `days=7|30|90` period. The Overview period selector
reloads only Analytics, preserves the last successful response on failure, and
shows current-period metrics with previous-period growth.

The PostgreSQL time-series query creates one UTC daily series from authoritative
records already owned by Winga. Product views and likes come from audited product
actions scoped through the seller's products. An inquiry is counted once at the
first buyer-to-seller message in a conversation. Orders use their creation time.
Sales use only paid orders with a payment confirmation timestamp. When historical
sales contain multiple currencies, the series reports the seller's highest-value
currency separately rather than adding unlike currencies.

The backend summary supplies catalog, trust, conversations, demand, video,
search-demand and commerce-learning outputs. Existing market intelligence
decoration supplies stocking recommendations, trends and regional/category
signals. No new intelligence engine, endpoint, table or worker is introduced.

Category bars represent product counts, not order counts. Signal bars are
labelled as scores. Video retains its reported window and matched-session
coverage. Missing values are unavailable, not fabricated zeros. A runtime without
PostgreSQL receives an explicit unavailable time-series object while retaining
the rest of the seller summary.

## Files

- app.js: capability checks, menu entry, analytics route and restoration.
- src/navigation/controller.js: canonical utility-menu action.
- src/navigation/chrome.js: existing bottom navigation on Analytics.
- src/profile/controller.js: remove embedded summary loading.
- src/admin/ui.js: dedicated seller renderer using the shared module.
- backend/db.js: seller-scoped UTC daily aggregation and prior-period totals.
- backend/server.js: bounded period parsing and fail-open time-series response.
- data-service.js: period-aware Analytics request.
- style.css: scoped responsive analytics and business-menu styles.
- src/localization/catalogs/{en,sw,fr,ar}.json: translated labels.
- scripts/build-vercel-static.js: existing Lucide icon pack additions.
- tests/e2e/app.spec.js: navigation, period switching, chart, growth, capability,
  refresh and layout tests.
- tests/postgres-pagination.test.js: aggregation scope, paid-sales and growth contract.
- tests/integration-api.test.js: period and unavailable-runtime API contract.
- tests/frontend-core.test.js: updated ownership assertions.
- winga-modules.js and wrangler.toml: generated bundle and build marker.

## Verification

Feature verification passed: PostgreSQL store 93/93, real PostgreSQL commerce
24/24, frontend core 122/122, photo-reel unit 21/21, integration 173/173 and the
focused Analytics browser test 1/1. Direct PGlite executions returned seven
daily points, correctly deduplicated view retries, retained seller attribution
for a deleted product and excluded a conflicting cross-seller snapshot.
Module synchronization passed (65 modules). Localization passed (four locales,
1057 keys each); hard-coded UI debt remains zero. git diff --check passed.
Responsive navigation now resynchronizes after viewport-cache refresh, with
a browser assertion that desktop resizing hides the mobile bottom navigation.

The complete browser run reached 121/122. Its only failure was the pre-existing,
order-dependent Home-nav visibility timeout; that test and the unrelated
WhatsApp timeout from the first run both passed together in isolation (2/2).
No Analytics, API, database, localization, media or commerce test failed.

Focused browser suite: 5/5 passed, including the existing attributed opportunity
workflow. Checks cover real API summary loading, no Profile summary request,
avatar exclusion, seller-only screen, Back/Home/reload restoration, tab keyboard
navigation, 320px RTL layout, desktop layout, refresh failure and stale responses.
Fixture numbers exist only in tests, not production UI.

Browser captures are in test-results/analytics-mobile-overview.png,
analytics-mobile-content.png, analytics-mobile-demand.png,
analytics-mobile-insights.png, analytics-mobile-rtl.png and analytics-desktop.png. These are local test
captures, not evidence of real production account totals. RTL capture tests
direction; localization catalogs are separately validated in all four languages.

## Remaining limitations

New audited product actions preserve a trusted seller ownership snapshot, so
their history remains attributable after a product is deleted. Older events
without that snapshot retain the existing live-product ownership fallback. The
chart intentionally visualizes views and likes only. Paid sales are available in
the API foundation but are not combined across currencies or presented as a fake
single-currency total. Existing intelligence quality limitations remain backend
concerns, not concealed by this redesign. Production account-specific values
still require an authenticated seller session to inspect.
