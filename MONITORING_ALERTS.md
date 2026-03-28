# WINGA Monitoring And Alerts Foundation

## Goal

Provide a practical Phase 1 monitoring foundation for rollout while keeping the current architecture simple.

## Client event structure

Client/runtime telemetry now supports:

- `level`: `info`, `warn`, `error`
- `event`: stable event name such as `session_restore_failed`
- `message`: short actionable summary
- `category`: `auth`, `chat`, `request`, `promotion`, `admin`, `runtime`, `app`
- `alertSeverity`: `low`, `medium`, `high`, `critical`
- `fingerprint`: stable grouping key for future alert tools
- `context`: compact metadata such as `view`, `role`, `flow`, `statusCode`

## Current high-value signals

- Auth/session:
  - `app_boot_started`
  - `app_boot_completed`
  - `session_restore_succeeded`
  - `session_restore_failed`
  - `runtime_unhandled_error`
  - `runtime_unhandled_rejection`
- Existing flow-specific failures already emitted in the app:
  - chat failures
  - request failures
  - admin moderation failures
  - product/review/promotion failures
  - slow-path render/message refresh warnings

## Admin ops visibility

`GET /api/admin/ops/summary` now surfaces:

- recent failures
- recent alert candidates
- auth failure counts
- denied action counts
- stale session counts
- runtime client error counts
- backup visibility and config warnings

## Recommended Phase 1 alert routing

Send these first to your monitoring tool of choice:

1. `critical`
   - startup/runtime crashes
   - session restore failures at unusual volume
   - admin access failures during rollout
2. `high`
   - chat/request/promotion/admin action failures
   - repeated denied actions
   - unusual auth failures or rate-limit spikes
3. `medium`
   - slow client paths
   - partial admin data load failures

## Suggested rollout dashboards

1. Auth + session
   - login failures
   - admin login failures
   - stale sessions
   - logout success volume
2. Marketplace health
   - request failures
   - chat failures
   - review/promotion failures
   - render/runtime failures
3. Admin + moderation
   - denied admin actions
   - moderation actions
   - recent alerts

## Next step later

Connect these events to an external stack such as Sentry plus Grafana/Datadog/New Relic, then add real threshold alerts and on-call routing.
