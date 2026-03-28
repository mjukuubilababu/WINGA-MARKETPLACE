# Backup and Recovery

## Local-file mode

- The backend writes rolling backups to `WINGA_DATA_DIR/backups`.
- A snapshot is created before each store write.
- The server keeps the most recent 5 snapshots by default.
- `GET /api/health` and `GET /api/admin/ops/summary` now expose backup visibility fields so operators can confirm whether snapshots exist.

## PostgreSQL mode

- PostgreSQL backups are not handled inside the app process.
- Use provider-managed backups and scheduled `pg_dump` snapshots.
- Keep restore instructions close to deployment automation so rollback does not depend on memory.

## Restore guidance

1. Stop the backend.
2. Copy the desired backup snapshot over the active store file, or restore the target PostgreSQL snapshot.
3. Restart the backend.
4. Run smoke checks:
   - `GET /api/health`
   - admin login
   - one catalog load
   - one moderation read
   - one buyer flow check

## Rollback expectations

- Every release should have a known-good app build and a known-good backend data restore point.
- If rollout introduces critical auth, moderation, or order issues:
  - rollback app build
  - restore last good data snapshot only if the release corrupted persisted state
  - confirm health and admin ops summary before reopening traffic
