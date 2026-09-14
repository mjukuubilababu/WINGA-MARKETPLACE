# Seller Analytics relocation

## Audit and navigation

Previously, the seller-insights utility action opened Profile and scrolled to
analytics-panel. Profile loaded the summary as part of rendering. The shared
admin UI module rendered both admin and seller summaries.

Now Hamburger > Analytics opens the dedicated analytics SPA view. Avatar and
Profile no longer offer seller Analytics or fetch its summary. Existing Profile
identity, preferences, products, orders and messages remain unchanged. The
five-item bottom navigation is retained; Analytics adds no bottom-nav item.

Seller capability checks gate menu visibility and the view. Backend access
control is unchanged: the existing session-scoped summary route permits
marketplace users and staff. This UI change does not claim to tighten that API
into a seller-only endpoint.

## UI and data

Six tabs organize existing information: Overview, Products, Customers, Content,
Demand and Insights. Metric cards, category/size/color meters, honest empty
states and existing action destinations replace a single long summary.
Recommendations retain their existing reason and opportunity actions retain
attribution. Refresh failures keep the last successful data. Responses arriving
after leaving the view or changing the account are ignored.

Data remains WingaDataLayer.loadAnalytics() through /api/analytics/summary.
The backend summary supplies catalog, trust, conversations, demand, video,
search-demand and commerce-learning outputs. Existing market intelligence
decoration supplies stocking recommendations, trends and regional/category
signals. No new intelligence engine, endpoint, database or worker is introduced.

Category bars represent product counts, not order counts. Signal bars are
labelled as scores. Video retains its reported window and matched-session
coverage. Missing values are unavailable, not fabricated zeros.

## Files

- app.js: capability checks, menu entry, analytics route and restoration.
- src/navigation/controller.js: canonical utility-menu action.
- src/navigation/chrome.js: existing bottom navigation on Analytics.
- src/profile/controller.js: remove embedded summary loading.
- src/admin/ui.js: dedicated seller renderer using the shared module.
- style.css: scoped responsive analytics and business-menu styles.
- src/localization/catalogs/{en,sw,fr,ar}.json: translated labels.
- scripts/build-vercel-static.js: existing Lucide icon pack additions.
- tests/e2e/app.spec.js: navigation, data, capability, refresh and layout tests.
- tests/frontend-core.test.js: updated ownership assertions.
- winga-modules.js and wrangler.toml: generated bundle and build marker.

## Verification

Final npm run test:ci passed: PostgreSQL 24/24, frontend core 122/122,
photo-reel unit 21/21, integration 172/172 and browser 122/122.
Module synchronization passed (65 modules). Localization passed (four locales,
1035 keys each); hard-coded UI debt remains zero. git diff --check passed.
Responsive navigation now resynchronizes after viewport-cache refresh, with
a browser assertion that desktop resizing hides the mobile bottom navigation.

Focused browser suite: 5/5 passed, including the existing attributed opportunity
workflow. Checks cover real API summary loading, no Profile summary request,
avatar exclusion, seller-only screen, Back/Home/reload restoration, tab keyboard
navigation, 320px RTL layout, desktop layout, refresh failure and stale responses.
Fixture numbers exist only in tests, not production UI.

Browser captures are in test-results/analytics-mobile-overview.png,
analytics-mobile-content.png, analytics-mobile-demand.png,
analytics-mobile-rtl.png and analytics-desktop.png. These are local test
captures, not evidence of real production account totals. RTL capture tests
direction; localization catalogs are separately validated in all four languages.

## Remaining limitations

The existing API does not supply dashboard-wide historical series, prior-period
comparisons or revenue. Consequently no fake line chart, revenue, growth or
7/30/90-day filter is presented. Existing intelligence quality and attribution
limitations remain backend concerns, not concealed by this redesign. Production
account-specific values still require an authenticated seller session to inspect.
