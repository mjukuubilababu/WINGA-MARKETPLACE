# Backend Deployment Readiness

## Required production expectations

- `NODE_ENV=production`
- `DATABASE_URL` should point to the production PostgreSQL instance
- `DATABASE_SSL=true` for hosted PostgreSQL unless your provider explicitly terminates SSL elsewhere
- `ALLOWED_ORIGINS` must list the exact frontend origins allowed to call the API
- `TRUST_PROXY_HEADERS=true` only when the backend is actually behind a trusted reverse proxy that sets `X-Forwarded-For` correctly
- `PAYMENT_WEBHOOK_SECRET` should be configured for signed payment callbacks
- `ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION=false`
- `ALLOW_DEFAULT_ORIGIN_FALLBACK=false`
- `ALLOW_UNVERIFIED_MANUAL_PAYMENTS=false` unless you are intentionally operating a manual-payment workflow and have accepted that risk

## Staff credential seeding

- Leave `ADMIN_SEED_PASSWORD` and `MODERATOR_SEED_PASSWORD` empty unless you intentionally want bootstrap staff users.
- If you do set them in production, they must be strong, unique, and rotated after first use.
- Default seed passwords must never be used in production.

## Runtime safety checks now enforced

- Production startup fails if `DATABASE_URL` is missing and local-file storage was not explicitly allowed.
- Production startup fails if `ALLOWED_ORIGINS` is missing and default origin fallback was not explicitly allowed.
- Production startup fails if default staff seed passwords are configured.
- Production startup fails if payment-webhook signing is not configured and unverified manual payment capture was not explicitly allowed.
- Payment submission through `/api/orders` should remain `pending` until a verified payment callback or explicit reconciliation marks it paid.

## Operational endpoints to verify

- `GET /api/health`
  - confirms environment, storage mode, warning count, backup visibility, user count, and product count
- `GET /api/admin/ops/summary`
  - admin-only
  - returns config warnings, backup visibility, recent failure signals, recent audit events, and operational counts

## Backup and rollback readiness

- Follow [BACKUP_AND_RECOVERY.md](C:\Users\user\Desktop\Winga-App\backend\BACKUP_AND_RECOVERY.md) before rollout.
- Confirm there is a current restore point before shipping changes that touch auth, moderation, orders, promotions, or catalog data.

## Release smoke checklist

- Verify admin login only works through `/api/auth/admin-login`
- Verify `/api/auth/login` rejects admin and moderator credentials
- Verify seller and buyer flows still work with the production origin
- Verify one admin moderation action and one seller promotion action
- Verify a submitted order stays `pending` until the payment verification callback updates it
- Verify audit events appear for:
  - admin login success/failure
  - logout success
  - rate limits
  - moderation actions
  - client error events

## Rollout note

If production warnings are present in `/api/admin/ops/summary`, treat rollout as incomplete until they are reviewed and intentionally accepted.
