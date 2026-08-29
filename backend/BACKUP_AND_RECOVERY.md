# Winga PostgreSQL Backup and Disaster Recovery

## Production source of truth

Winga production uses paid Render PostgreSQL. Render continuous point-in-time recovery
(PITR) is the primary recovery mechanism. It restores into a new database instance,
never over the active primary.

- Hobby workspace recovery window: 3 days.
- Pro or higher workspace recovery window: 7 days.
- A restore point cannot be within the most recent 10 minutes.
- Recovery instances are separate billable resources until suspended or deleted.
- Deleting the original database also deletes its provider-held recovery history.

Official references:

- https://render.com/docs/postgresql-backups
- https://render.com/docs/postgresql-creating-connecting

## Recovery objectives

- Tier 0: authentication, orders, payments, inventory, messages.
- Target RPO: within the active Render PITR window, normally minutes.
- Target RTO for operator-led recovery: 60 minutes after incident declaration.
- Portable logical export: create before destructive migrations and at least monthly.
- Restore drill: perform quarterly and after a PostgreSQL major-version change.

These are operational objectives, not guarantees. Record actual drill timings and revise
capacity or procedures when either objective is missed.

## Normal protection layers

1. Render PITR continuously protects the paid primary database.
2. Render on-demand logical exports provide portable snapshots for longer retention.
3. Winga database health monitoring detects pool, query, transaction, and replica issues.
4. Recovery validation checks an isolated restored instance without writing to it.

Never use the PgBouncer/connection-pool URL for backup or restore operations.

## Before a risky release

1. Open Render Dashboard -> PostgreSQL -> Recovery.
2. Confirm Point-in-Time Recovery shows a current recovery window.
3. For destructive schema work, click Create export and wait for the logical export.
4. Download the export to controlled encrypted storage before deleting the Render database.
5. Record UTC time, release commit, export identifier, and responsible operator.

## Isolated PITR drill

1. Open Render Dashboard -> PostgreSQL -> Recovery -> Restore Database.
2. Choose a timestamp at least 10 minutes old.
3. Name the new database with an isolated marker, for example:
   `winga_recovery_20260829`.
4. Copy existing settings unless the drill explicitly tests another capacity.
5. Wait until the recovery instance is Available.
6. Copy its direct connection URL, not its pool URL.
7. Run the read-only validator:

```bash
RECOVERY_DATABASE_URL="postgresql://.../winga_recovery_20260829" \
RECOVERY_EXPECTED_DATABASE="winga_recovery_20260829" \
npm run verify:database-recovery
```

The validator fails closed unless the database name includes `recovery`, `restore`,
`drill`, or `clone`. It verifies required tables, migration history, aggregate row
counts, and orphaned order/payment/session references. It never prints credentials or
individual customer records.

8. Run application smoke tests against a staging backend connected only to the recovered
   database. Do not point production traffic at an unvalidated recovery instance.
9. Record start time, available time, validation result, counts, and total recovery time.
10. Suspend or delete the recovery instance after evidence is retained.

## Production incident cutover

1. Freeze risky writes or place the backend in maintenance mode.
2. Record the incident UTC timestamp and latest known-good timestamp.
3. Start PITR into a new isolated database.
4. Validate with `npm run verify:database-recovery`.
5. Update the Render environment group containing `DATABASE_URL`.
6. Update every separate database consumer, including intelligence workers and cron jobs.
7. Keep `READ_REPLICA_DATABASE_URL` disabled until the new primary is confirmed.
8. Deploy/restart consumers and run:
   - `GET /health`
   - `GET /api/products?limit=1&page=1`
   - login/session restore
   - admin moderation read
   - one controlled order/message smoke flow
9. Monitor errors, pool saturation, queue health, and payment reconciliation.
10. Keep the old database suspended, not deleted, until post-incident approval.

## Rollback boundary

Application rollback and database restore are separate decisions. Roll back application
code first when persisted data is valid. Use PITR only for confirmed data loss or
corruption. Never restore a logical dump over a database containing important data.

## Local development backups

Files under `backend/postgres-backups` and the Windows batch scripts are local-development
tools only. They are not the production backup system and must never be treated as proof
that Render PITR or exports are healthy.
