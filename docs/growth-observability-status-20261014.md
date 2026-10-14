# Growth observability preparation — 14 October 2026

Scope: OPS-01 and spec 38–40, 80–81, 90–93, 106.
Source baseline: `4d499a5daf193f79dd7dd204f60b18b886b6db9e`;
previous verified production Cloudflare build `20261014011520`, all four Render
services at that source. **OPS-01 is not accepted by implementing an export.**
Full specification status: [growth-full-spec-status-20261014.md](growth-full-spec-status-20261014.md).

## Audit / implementation

Canonical reports and the authenticated admin dashboard already exist. Reused
`src/api/admin-client.js` and `src/admin/ui.js`; no new endpoint, queue, event
store, independent invite system, provider or analytics domain is introduced.

The existing dashboard now offers **Export metrics snapshot** after reports
resolve. It downloads a local JSON Blob only on the current admin's explicit
click. Each canonical GET uses the existing auth mechanism and an 8-second
request timeout. Independent report failure remains isolated. Network subreports
retain the server's schema version and window rather than losing this provenance.

The snapshot has schemaVersion 1, kind `winga_growth_operations_snapshot`,
collection start/completion timestamps, separate report windows and all 13
existing dashboard projections. It is **not an atomic database snapshot**.
`productionReady` is always false. Available does not mean healthy.

Only fixed numeric aggregate paths, boolean job enablement, known cohort loop
types and strict UTC weekly labels are allowed. Free-text limitations, raw event
rows, actor/session/user/product IDs, invite tokens, private messages, cookies,
search text and smaller regional/category segments are excluded. This is an
allowlist, not a blacklist over arbitrary API data. Existing regional/category
reports remain available in the authenticated dashboard.

Unknown/missing/malformed metrics are null; failed, missing, duplicate or
unsupported-version reports are unavailable with metrics null. Valid complete
job-state arrays can establish an absent state count of zero; a missing or
malformed array cannot. Job maximum attempts/oldest age and creation-gap counts
are retained for investigation. Cohort rows are capped at 60, with a truncation
marker, mature eligible/returned denominators and null retention preserved.

Export uses the report collection's current dashboard generation, account and
session identity. A replaced same-account session, logout, changed admin context
or detached panel cannot download the old result. Download errors stay in the
operations panel; the temporary anchor and Blob URL are disposed. No report read
or export replays jobs, joins members, notifies recipients or changes flags.

## Isolated verification

- **9/9 dashboard/client contracts:** authenticated canonical routes, independent
  failure, text rendering, unknown metrics, private projection, invalid schema,
  delivery-state validation, bounded/maturity-safe cohort export and same-account
  session replacement before a late response.
- **3/3 Chromium scenarios:** actual JSON download from synthetic reports,
  private-field exclusion and only bounded read-only GETs; already-rendered export
  rejected after session replacement/admin loss; simulated browser Blob failure
  stays isolated and reports remain visible. Temporary URL disposal observed.
- **153/153 frontend core checks**, four catalogs version `2026.10.14.1` with
  **1,766 matching keys**, zero new hard-coded debt, synchronized **98 modules**.
- Full existing sharing/rich-chat/export regression gate: **27/27 Chromium scenarios**.
- New browser scenarios are added to the existing required sharing-UI CI gate.

The first browser attempts exposed fixture initialization mistakes (missing
module namespace, then optional DOM attributes); both were corrected in the test
fixture before the final 3/3 pass. These were not production outages. Evidence
includes final source hashes: [growth-observability-isolated-20261014.json](evidence/growth-observability-isolated-20261014.json).
No real app admin session or live metric export was available/performed. These
are local source/browser proofs, not actual operator ownership or calibrated alerts.

## Resume procedure and acceptance

1. Open the existing admin Growth dashboard with an authorized application
   session. Confirm report availability, feature/measurement state and collection
   environment; download the snapshot manually.
2. Record the exact source SHA, frontend build, environment and collection window
   alongside the file in the existing approved operations store. These deployment
   identifiers are not inferred by this client from backend/frontend agreement.
3. Keep unavailable reports/nulls visible. Compare only matching report windows,
   loop definitions and mature denominators. Read canonical report/runbook
   limitations; entry count or accepted encrypted transport is not meaningful value.
4. Assign actual operator, minimum sample/region and traffic budget; collect a
   real baseline before choosing alert thresholds/SLOs. Wire only an approved
   existing alert destination/policy. No monitor or external message is activated here.
5. Validate operator scrape/alert/recovery, exact-context notices and real provider
   preferences; controlled replay remains separate, authenticated and scoped.

OPS-01, CAP-01, RET-01, independent security and live loop gates remain open.
Video failure work remains explicitly deferred. No schedule, provider configuration,
rollout cohort, signing secret or independent security approval is changed.

## Rollout / rollback

Deploy through existing functional/dependency/Phoenix requirements and verify
source/build/asset identities. No migration or public link format changes.
Revert this source commit to remove the export if needed; canonical reports,
public destinations, durable events and pending work remain owned by their
existing infrastructure. The independent CodeQL review requirement stays separate
and unresolved; deployment success must not be presented as full acceptance.
